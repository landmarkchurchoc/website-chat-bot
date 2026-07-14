import { waitUntil } from "@vercel/functions";
import { NextRequest, NextResponse } from "next/server";
import { isCrisis, crisisResponse } from "@/lib/crisis";
import { logQuestion } from "@/lib/monday";
import { cachedGenerate, normalize, corsHeaders, CARE_FORM_URL } from "@/lib/answer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// Lightweight health check (also used to warm the lambda if a pinger is set up).
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) });
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

  // Crisis pre-check: never answer these with search results alone.
  if (isCrisis(question)) {
    const result = crisisResponse(CARE_FORM_URL);
    waitUntil(logQuestion({ question, answer: "[crisis fast-path]", confidence: "high", escalate: true, sources: [] }));
    return NextResponse.json(result, { headers });
  }

  try {
    const result = await cachedGenerate(normalize(question));

    const payload = {
      ...result,
      careFormUrl: result.escalate ? CARE_FORM_URL : undefined,
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
