// Question logging to the "AI Search Questions" Monday board — the questions
// dashboard. Each question becomes an item with review status, confidence,
// escalation flag, and date; the full answer is attached as an update.
// Requires MONDAY_API_TOKEN; without it this is a no-op.
const MONDAY_API = "https://api.monday.com/v2";

// "AI Search Questions" board in the Main workspace
// https://thelandmarkchurch.monday.com/boards/18420369585
const DEFAULT_BOARD_ID = "18420369585";
const COLS = {
  reviewStatus: "color_mm4wps9g",
  confidence: "color_mm4w9xe3",
  escalated: "boolean_mm4w6s6x",
  askedAt: "date_mm4wkk3j",
};

async function gql(query: string, variables: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) return null;
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function logQuestion(entry: {
  question: string;
  answer: string;
  confidence: string;
  escalate: boolean;
  sources: { title: string; url: string }[];
}) {
  if (!process.env.MONDAY_API_TOKEN) return;
  const boardId = process.env.MONDAY_BOARD_ID || DEFAULT_BOARD_ID;
  try {
    const name = (entry.escalate ? "🚨 " : "") + entry.question.slice(0, 240);
    const confidenceLabel =
      entry.confidence.charAt(0).toUpperCase() + entry.confidence.slice(1).toLowerCase();
    const columnValues = JSON.stringify({
      [COLS.reviewStatus]: { label: entry.escalate ? "Needs Follow-up" : "New" },
      [COLS.confidence]: { label: confidenceLabel },
      [COLS.escalated]: entry.escalate ? { checked: "true" } : null,
      [COLS.askedAt]: { date: new Date().toISOString().slice(0, 10) },
    });
    const created = await gql(
      `mutation ($boardId: ID!, $name: String!, $vals: JSON!) {
        create_item(board_id: $boardId, item_name: $name, column_values: $vals, create_labels_if_missing: true) { id }
      }`,
      { boardId, name, vals: columnValues }
    );
    const itemId = created?.data?.create_item?.id;
    if (!itemId) return;
    const body =
      `<b>Question:</b> ${escapeHtml(entry.question)}<br/>` +
      `<b>Confidence:</b> ${entry.confidence} | <b>Escalated:</b> ${entry.escalate}<br/><br/>` +
      `<b>Answer given:</b><br/>${escapeHtml(entry.answer).replace(/\n/g, "<br/>")}<br/><br/>` +
      `<b>Sources:</b> ${entry.sources.map((s) => escapeHtml(`${s.title} (${s.url})`)).join("; ") || "none"}`;
    await gql(
      `mutation ($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) { id }
      }`,
      { itemId, body }
    );
  } catch {
    // Logging must never break the answer path.
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "AI Answer Feedback" board — visitor-submitted feedback from the widget.
// https://thelandmarkchurch.monday.com/boards/18420598077
const FEEDBACK_BOARD_ID = "18420598077";
const FEEDBACK_COLS = { triage: "color_mm4znc64", submitted: "date_mm4z5xv" };

export async function logFeedback(entry: { message: string; question?: string; page?: string }) {
  if (!process.env.MONDAY_API_TOKEN) return false;
  const boardId = process.env.MONDAY_FEEDBACK_BOARD_ID || FEEDBACK_BOARD_ID;
  const name = entry.message.slice(0, 240);
  const columnValues = JSON.stringify({
    [FEEDBACK_COLS.triage]: { label: "New" },
    [FEEDBACK_COLS.submitted]: { date: new Date().toISOString().slice(0, 10) },
  });
  const created = await gql(
    `mutation ($boardId: ID!, $name: String!, $vals: JSON!) {
      create_item(board_id: $boardId, item_name: $name, column_values: $vals, create_labels_if_missing: true) { id }
    }`,
    { boardId, name, vals: columnValues }
  );
  const itemId = created?.data?.create_item?.id;
  if (!itemId) return false;
  const body =
    `<b>Feedback:</b><br/>${escapeHtml(entry.message).replace(/\n/g, "<br/>")}<br/><br/>` +
    (entry.question ? `<b>Question they had asked:</b> ${escapeHtml(entry.question)}<br/>` : "") +
    (entry.page ? `<b>Page:</b> ${escapeHtml(entry.page)}` : "");
  await gql(
    `mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) { id }
    }`,
    { itemId, body }
  );
  return true;
}
