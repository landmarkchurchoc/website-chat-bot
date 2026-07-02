import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/search";
import { isCrisis, crisisResponse } from "@/lib/crisis";
import { getEsvPassage } from "@/lib/esv";
import { logQuestion } from "@/lib/monday";
import { SYSTEM_PROMPT, ANSWER_SCHEMA, buildUserMessage } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";
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
    await logQuestion({ question, answer: "[crisis fast-path]", confidence: "high", escalate: true, sources: [] });
    return NextResponse.json(result, { headers });
  }

  const client = new Anthropic();
  const chunks = retrieve(question);

  const tools: Anthropic.Messages.ToolUnion[] = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 3,
      allowed_domains: APPROVED_DOMAINS,
    },
    {
      name: "get_esv_passage",
      description:
        "Fetch the exact text of a Bible passage in the ESV translation. Use this whenever you quote Scripture so the wording is accurate. Input a standard reference like 'John 3:16' or 'Romans 8:28-30'.",
      input_schema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Bible passage reference, e.g. 'Ephesians 2:8-9'" },
        },
        required: ["reference"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(question, chunks) },
  ];

  try {
    let response: Anthropic.Message;
    for (let turn = 0; ; turn++) {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
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
        if (block.type === "tool_use" && block.name === "get_esv_passage") {
          const ref = (block.input as { reference: string }).reference;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: await getEsvPassage(ref),
          });
        }
      }
      messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
    }

    const text = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    )?.text;
    if (!text) throw new Error(`No answer produced (stop_reason: ${response.stop_reason})`);
    const result = JSON.parse(text) as {
      answer: string;
      confidence: "high" | "medium" | "low";
      sources: { title: string; url: string; type: string }[];
      goDeeper: { title: string; url: string; source: string }[];
      escalate: boolean;
    };

    const payload = {
      ...result,
      careFormUrl: result.escalate ? careFormUrl : undefined,
    };

    await logQuestion({
      question,
      answer: result.answer,
      confidence: result.confidence,
      escalate: result.escalate,
      sources: result.sources,
    });

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
