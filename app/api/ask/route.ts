import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/search";
import { isCrisis, crisisResponse } from "@/lib/crisis";
import { getEsvPassage } from "@/lib/esv";
import { logQuestion } from "@/lib/monday";
import { SYSTEM_PROMPT, ANSWER_SCHEMA, buildUserMessage } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

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

const DEFAULT_ORIGINS = [
  "https://www.thelandmark.church",
  "https://thelandmark.church",
  "https://landmark-church-4bcf27.webflow.io", // Webflow staging
  "http://localhost:3000",
];

function corsHeaders(req: NextRequest) {
  const allowed = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ORIGINS;
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

interface AnswerResult {
  answer: string;
  confidence: "high" | "medium" | "low";
  sources: { title: string; url: string; type: string }[];
  goDeeper: { title: string; url: string; source: string }[];
  escalate: boolean;
}

async function generateAnswer(question: string): Promise<AnswerResult> {
  const client = new Anthropic();
  const chunks = retrieve(question);

  const tools: Anthropic.Messages.ToolUnion[] = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 2,
      allowed_domains: APPROVED_DOMAINS,
    },
    {
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
    },
  ];

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(question, chunks) },
  ];

  let response: Anthropic.Message;
  for (let turn = 0; ; turn++) {
    // No extended thinking + low effort: short grounded summaries where
    // latency matters more than deliberation.
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ANSWER_SCHEMA },
      },
      tools,
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      if (turn >= 6) break;
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }
    if (response.stop_reason !== "tool_use") break;
    if (turn >= 6) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
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
    messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
  }

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error(`No answer produced (stop_reason: ${response.stop_reason})`);
  const result = JSON.parse(text) as AnswerResult;
  // Belt-and-suspenders on the no-dashes style rule.
  result.answer = result.answer.replace(/\s*[—–]\s*/g, ", ");
  return result;
}

// Shared cross-instance cache (Vercel Data Cache): repeated questions skip
// the model entirely. Keyed by normalized question, 6h TTL.
const normalize = (q: string) =>
  q.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
// The normalized question is the ONLY argument: arguments form the cache key,
// so passing the raw question too would defeat the cache ("Baptism?" vs
// "baptism"). The normalized text is what gets answered; it reads fine.
const cachedGenerate = unstable_cache(
  async (normalizedQuestion: string) => generateAnswer(normalizedQuestion),
  ["ai-answer-v1"],
  { revalidate: 6 * 60 * 60 }
);

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  let question: string;
  let debug = false;
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim();
    debug = body.debug === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }
  if (!question || question.length > 500) {
    return NextResponse.json({ error: "Provide a question (max 500 chars)." }, { status: 400, headers });
  }

  const careFormUrl =
    process.env.CARE_FORM_URL || "https://thelandmark.churchcenter.com/people/forms/583406";

  // Crisis pre-check: never answer these with search results alone.
  if (isCrisis(question)) {
    const result = crisisResponse(careFormUrl);
    waitUntil(logQuestion({ question, answer: "[crisis fast-path]", confidence: "high", escalate: true, sources: [] }));
    return NextResponse.json(result, { headers });
  }

  try {
    const result = await cachedGenerate(normalize(question));

    const payload = {
      ...result,
      careFormUrl: result.escalate ? careFormUrl : undefined,
    };

    // Log to Monday after the response is sent (zero added latency;
    // waitUntil keeps the function alive until logging finishes).
    waitUntil(
      logQuestion({
        question,
        answer: result.answer,
        confidence: result.confidence,
        escalate: result.escalate,
        sources: result.sources,
      })
    );

    return NextResponse.json(payload, { headers });
  } catch (err) {
    console.error("ask error:", err);
    return NextResponse.json(
      {
        error: "Sorry — the answer service is unavailable right now.",
        ...(debug ? { detail: String(err) } : {}),
      },
      { status: 502, headers }
    );
  }
}
