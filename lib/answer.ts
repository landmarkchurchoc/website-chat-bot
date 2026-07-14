import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_cache } from "next/cache";
import type { NextRequest } from "next/server";
import { retrieveScored, thumbnailFor, findPage } from "@/lib/search";
import { getEsvPassage } from "@/lib/esv";
import { SYSTEM_PROMPT, ANSWER_SCHEMA, buildUserMessage } from "@/lib/prompt";

// Sonnet tier: markedly faster first-answers; the theological guardrails
// live in the system prompt. Swappable without a code change via ANSWER_MODEL.
const MODEL = process.env.ANSWER_MODEL || "claude-sonnet-5";

const APPROVED_DOMAINS = [
  "thelandmark.church",
  "gotquestions.org",
  "desiringgod.org",
  "enduringword.com",
  "answersingenesis.org",
];

// Web search is a full extra round trip through a server-side container, the
// single biggest source of tail latency. It only earns that cost for questions
// the site/brain do not cover, so we attach the tool only when local retrieval
// is thin. Tunable / overridable via env.
const SEARCH_MAX_CHUNKS = Number(process.env.WEB_SEARCH_MAX_CHUNKS ?? 3);

export const CARE_FORM_URL =
  process.env.CARE_FORM_URL || "https://thelandmark.churchcenter.com/people/forms/583406";

export interface AnswerResult {
  escalate: boolean;
  confidence: "high" | "medium" | "low";
  answer: string;
  sources: { title: string; url: string; type: string }[];
  actions: { label: string; url: string; thumbnail?: string }[];
  goDeeper: { title: string; url: string; source: string }[];
}

// Request-scoped streaming hook. When present, generateAnswer forwards raw
// model text deltas (the JSON answer as it is produced) to onText. It is absent
// on the plain JSON path. AsyncLocalStorage keeps this per-request even across
// the unstable_cache boundary, so concurrent requests never collide, and a
// cache hit (which never runs generateAnswer) simply never calls onText.
export const streamCtx = new AsyncLocalStorage<{ onText: (delta: string) => void }>();

export interface GenerateOpts {
  model?: string;
  effort?: "low" | "medium" | "high";
}

export async function generateAnswer(question: string, opts: GenerateOpts = {}): Promise<AnswerResult> {
  const client = new Anthropic();
  const { chunks, count } = retrieveScored(question);
  const onText = streamCtx.getStore()?.onText;
  const model = opts.model || MODEL;
  const effort = opts.effort || "low";

  const allowSearch = count < SEARCH_MAX_CHUNKS || process.env.WEB_SEARCH_ALWAYS === "1";

  const tools: Anthropic.Messages.ToolUnion[] = [];
  if (allowSearch) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 2,
      allowed_domains: APPROVED_DOMAINS,
    });
  }
  tools.push({
    name: "get_esv_passages",
    description:
      "Fetch the exact ESV text of one or more Bible passages in a single call. Use this whenever you quote Scripture so the wording is accurate. IMPORTANT: gather ALL the references you plan to quote and request them together in ONE call, e.g. ['John 3:16', 'Romans 8:28-30'].",
    input_schema: {
      type: "object",
      properties: {
        references: {
          type: "array",
          items: { type: "string" },
          description: "Bible passage references, e.g. ['Ephesians 2:8-9', 'Psalm 23:1-3']",
        },
      },
      required: ["references"],
      additionalProperties: false,
    },
    strict: true,
  });

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(question, chunks) },
  ];

  let final: Anthropic.Message;
  let containerId: string | undefined;
  for (let turn = 0; ; turn++) {
    // No extended thinking + low effort: short grounded summaries where
    // latency matters more than deliberation. Streamed so the endpoint can
    // forward tokens as they are produced; finalMessage() gives us the whole
    // structured result to parse and cache.
    const stream = client.messages.stream({
      model,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort,
        format: { type: "json_schema", schema: ANSWER_SCHEMA },
      },
      tools,
      messages,
      // Web search's dynamic filtering runs in a server-side container; when a
      // turn pauses with pending code-execution work, the continuation request
      // must reference the same container.
      ...(containerId ? { container: containerId } : {}),
    });
    if (onText) stream.on("text", (delta) => onText(delta));
    final = await stream.finalMessage();
    containerId = final.container?.id ?? containerId;

    if (final.stop_reason === "pause_turn") {
      if (turn >= 6) break;
      messages = [...messages, { role: "assistant", content: final.content }];
      continue;
    }
    if (final.stop_reason !== "tool_use") break;
    if (turn >= 6) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type === "tool_use" && block.name === "get_esv_passages") {
        const refs = (block.input as { references: string[] }).references.slice(0, 6);
        const passages = await Promise.all(refs.map(getEsvPassage));
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: passages.join("\n\n"),
        });
      }
    }
    messages = [...messages, { role: "assistant", content: final.content }, { role: "user", content: toolResults }];
  }

  const text = final.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error(`No answer produced (stop_reason: ${final.stop_reason})`);
  const result = JSON.parse(text) as AnswerResult;
  // Belt-and-suspenders on the no-dashes style rule.
  result.answer = result.answer.replace(/\s*[—–]\s*/g, ", ");
  // Naming rule: never "The Landmark Church" (crawled page titles use it, the
  // church doesn't). URLs are safe: thelandmark.church has no space.
  result.answer = result.answer.replace(/\b[Tt]he Landmark Church\b/g, "Landmark Church");
  // Resolve vague action links: when the model could only cite the homepage
  // (e.g. the "latest sermon" teaser lives there), look up the quoted title
  // from the answer in the search index and link the specific page instead.
  const HOME = /^https?:\/\/(www\.)?thelandmark\.church\/?$/;
  // Labels that clearly point at a piece of content the answer names.
  const CONTENT_LABEL = /watch|listen|read|see|sermon|series|episode|notes|message|meet/i;
  // Thumbnails only for real content pages; generic pages (contact, visit,
  // beliefs, ...) render as buttons even though they have an og:image.
  const THUMB_PATHS = /\/(sermons|sermon-series|sermon-notes|podcast|blog|events|team|missions|groups)\//;
  let quotedUsed = false;
  const seenUrls = new Set<string>();
  result.actions = (result.actions ?? [])
    .slice(0, 2)
    .flatMap((a) => {
      let url = a.url;
      if (HOME.test(url)) {
        // A homepage link is never useful. If the label names content and the
        // answer quotes a title, resolve to that page; otherwise drop it.
        const quoted = quotedUsed ? null : result.answer.match(/[""]([^""]{4,90})[""]/);
        if (!quoted || !CONTENT_LABEL.test(a.label)) return [];
        quotedUsed = true;
        const page = findPage(quoted[1]);
        if (!page || HOME.test(page.url)) return [];
        url = page.url;
      }
      if (seenUrls.has(url)) return [];
      seenUrls.add(url);
      return [{ ...a, url, thumbnail: THUMB_PATHS.test(url) ? thumbnailFor(url) : undefined }];
    });
  return result;
}

// Shared cross-instance cache (Vercel Data Cache): repeated questions skip
// the model entirely. Keyed by normalized question, 6h TTL.
export const normalize = (q: string) =>
  q.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
// The normalized question is the ONLY argument: arguments form the cache key,
// so passing the raw question too would defeat the cache ("Baptism?" vs
// "baptism"). The normalized text is what gets answered; it reads fine.
export const cachedGenerate = unstable_cache(
  async (normalizedQuestion: string) => generateAnswer(normalizedQuestion),
  ["ai-answer-v11"],
  { revalidate: 6 * 60 * 60 }
);

const DEFAULT_ORIGINS = [
  "https://www.thelandmark.church",
  "https://thelandmark.church",
  "https://landmark-church-4bcf27.webflow.io", // Webflow staging
  "http://localhost:3000",
];

export function corsHeaders(req: NextRequest): Record<string, string> {
  const allowed = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ORIGINS;
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
