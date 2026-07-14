import { waitUntil } from "@vercel/functions";
import { NextRequest, NextResponse } from "next/server";
import { isCrisis, crisisResponse } from "@/lib/crisis";
import { logQuestion } from "@/lib/monday";
import {
  cachedGenerate,
  generateAnswer,
  normalize,
  corsHeaders,
  streamCtx,
  CARE_FORM_URL,
  type AnswerResult,
} from "@/lib/answer";

// Temporary tuning hatch: when a request sends debug:true it may override the
// model/effort (allowlisted) and bypasses the cache, so we can A/B latency and
// quality live. Remove once the model choice is settled.
const DEBUG_MODELS = new Set(["claude-sonnet-5", "claude-haiku-4-5-20251001"]);
const DEBUG_EFFORTS = new Set(["low", "medium"]);

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) });
}

/**
 * Pull the decoded value of the JSON `answer` string field out of a raw JSON
 * buffer that is still being streamed. Stops cleanly at the end of the string
 * or at an incomplete trailing escape, so it is safe to call on every chunk.
 */
function extractAnswerSoFar(raw: string): string {
  const ki = raw.indexOf('"answer"');
  if (ki < 0) return "";
  let i = raw.indexOf(":", ki + 8);
  if (i < 0) return "";
  i++;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== '"') return "";
  i++;
  let out = "";
  const ESC: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      if (i + 1 >= raw.length) break; // incomplete escape at buffer edge
      const n = raw[i + 1];
      if (n === "u") {
        if (i + 5 >= raw.length) break; // incomplete \uXXXX
        out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
        i += 6;
      } else {
        out += ESC[n] ?? n;
        i += 2;
      }
    } else if (ch === '"') {
      break; // end of the answer value
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

// Newline-delimited JSON events:
//   {"t":"delta","v":"..."}  incremental answer prose
//   {"t":"done","data":{...}} final, authoritative payload (re-renders answer)
//   {"t":"suppress"}          low-confidence, non-escalate -> hide the card
//   {"t":"error"}             something failed -> client falls back to /api/ask
type Emit = (obj: unknown) => void;

/**
 * Stateful bridge from raw model JSON deltas to clean prose deltas, honoring
 * the low-confidence "hide" rule BEFORE emitting any text (escalate and
 * confidence are the first fields in the schema, so they arrive first).
 */
function makeParser(emit: Emit) {
  let raw = "";
  let decided = false; // show?
  let emitted = 0;
  const state = { suppressed: false };

  function onText(delta: string) {
    raw += delta;
    if (state.suppressed) return;

    if (!decided) {
      const cm = raw.match(/"confidence"\s*:\s*"(high|medium|low)"/);
      if (!cm) return; // wait until confidence is known
      if (cm[1] === "low") {
        const em = raw.match(/"escalate"\s*:\s*(true|false)/);
        if (!em) return; // need escalate to decide a low-confidence card
        if (em[1] === "false") {
          state.suppressed = true;
          emit({ t: "suppress" });
          return;
        }
        // low but escalate=true -> keep the gentle answer
      }
      decided = true;
    }

    const ans = extractAnswerSoFar(raw);
    if (ans.length > emitted) {
      emit({ t: "delta", v: ans.slice(emitted) });
      emitted = ans.length;
    }
  }

  return { onText, state };
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);
  let question: string;
  let debug = false;
  let dbgModel: string | undefined;
  let dbgEffort: "low" | "medium" | undefined;
  let dbgRaw = false;
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim();
    debug = body.debug === true;
    if (debug) {
      if (DEBUG_MODELS.has(body.model)) dbgModel = body.model;
      if (DEBUG_EFFORTS.has(body.effort)) dbgEffort = body.effort;
      dbgRaw = body.raw === true;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: cors });
  }
  if (!question || question.length > 500) {
    return NextResponse.json({ error: "Provide a question (max 500 chars)." }, { status: 400, headers: cors });
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Crisis pre-check: hand back the care response as a single done event.
      if (isCrisis(question)) {
        const result = crisisResponse(CARE_FORM_URL);
        emit({ t: "done", data: result });
        waitUntil(
          logQuestion({ question, answer: "[crisis fast-path]", confidence: "high", escalate: true, sources: [] })
        );
        controller.close();
        return;
      }

      // Raw measurement mode forwards every text delta straight through (no
      // JSON parse) so we can time the model's true first token without the
      // structured-output grammar.
      const parser = dbgRaw
        ? { onText: (d: string) => emit({ t: "delta", v: d }), state: { suppressed: false } }
        : makeParser(emit);
      try {
        const result: AnswerResult = await streamCtx.run({ onText: parser.onText }, () =>
          debug
            ? generateAnswer(question, { model: dbgModel, effort: dbgEffort, format: dbgRaw ? false : undefined })
            : cachedGenerate(normalize(question))
        );

        if (!parser.state.suppressed) {
          if (result.confidence === "low" && !result.escalate) {
            emit({ t: "suppress" });
          } else {
            emit({
              t: "done",
              data: { ...result, careFormUrl: result.escalate ? CARE_FORM_URL : undefined },
            });
          }
        }

        waitUntil(
          logQuestion({
            question,
            answer: result.answer,
            confidence: result.confidence,
            escalate: result.escalate,
            sources: result.sources,
          })
        );
      } catch (err) {
        console.error("ask stream error:", err);
        emit({ t: "error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      ...cors,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
