import { NextRequest, NextResponse } from "next/server";
import { logFeedback } from "@/lib/monday";

export const runtime = "nodejs";
export const maxDuration = 15;

const DEFAULT_ORIGINS = [
  "https://www.thelandmark.church",
  "https://thelandmark.church",
  "https://landmark-church-4bcf27.webflow.io",
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
  let message = "", question = "", page = "";
  try {
    const body = await req.json();
    message = String(body.message ?? "").trim();
    question = String(body.question ?? "").trim().slice(0, 300);
    page = String(body.page ?? "").trim().slice(0, 300);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }
  if (!message || message.length > 3000) {
    return NextResponse.json({ error: "Feedback must be 1-3000 characters." }, { status: 400, headers });
  }
  const ok = await logFeedback({ message, question, page });
  return NextResponse.json({ ok }, { status: ok ? 200 : 502, headers });
}
