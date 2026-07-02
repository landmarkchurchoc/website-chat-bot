// Optional question logging to a Monday board — the "questions dashboard".
// Each question becomes an item; the full answer is attached as an update.
// No-op when MONDAY_API_TOKEN / MONDAY_BOARD_ID are not configured.
const MONDAY_API = "https://api.monday.com/v2";

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
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!process.env.MONDAY_API_TOKEN || !boardId) return;
  try {
    const name = (entry.escalate ? "🚨 " : "") + entry.question.slice(0, 240);
    const created = await gql(
      `mutation ($boardId: ID!, $name: String!) {
        create_item(board_id: $boardId, item_name: $name) { id }
      }`,
      { boardId, name: JSON.stringify(name).slice(1, -1) }
    );
    const itemId = created?.data?.create_item?.id;
    if (!itemId) return;
    const body =
      `<b>Question:</b> ${escapeHtml(entry.question)}<br/>` +
      `<b>Confidence:</b> ${entry.confidence} | <b>Escalated:</b> ${entry.escalate}<br/>` +
      `<b>Answer:</b><br/>${escapeHtml(entry.answer)}<br/>` +
      `<b>Sources:</b> ${entry.sources.map((s) => escapeHtml(`${s.title} (${s.url})`)).join("; ")}`;
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
