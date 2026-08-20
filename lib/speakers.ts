// Live read of the "Speaker Schedule" Monday board so the assistant can answer
// "who is preaching this Sunday?" with current data instead of a stale snapshot.
// Reuses MONDAY_API_TOKEN (same as lib/monday.ts). Without it, this is a no-op.
const MONDAY_API = "https://api.monday.com/v2";
const SPEAKER_BOARD_ID = process.env.MONDAY_SPEAKER_BOARD_ID || "18427433958";
const COLS = { series: "text_mm6dgknq", date: "date_mm6darft", day: "dropdown_mm6d3tzh" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** True when the question is about who is speaking/preaching and when. */
export function isSpeakerQuery(question: string): boolean {
  const s = question.toLowerCase();
  if (/\b(speaker|speaking|preaching|preacher|sermon|message)\s+(schedule|line ?up|lineup|calendar)\b/.test(s)) return true;
  if (/\bschedule of (speakers|preachers|sermons)\b/.test(s)) return true;
  if (/\bguest speaker\b/.test(s)) return true;
  // "who is speaking / preaching / bringing the message ..."
  if (/\bwho\b[^?]*\b(speak|speaking|speaks|preach|preaching|preaches|bring(ing)? the message|giving the message|up to speak|the speaker|the preacher)\b/.test(s)) return true;
  // a speaking/preaching verb tied to a time reference
  if (/\b(speaking|preaching|preacher|speaker)\b/.test(s) && /\b(this|next|upcoming|coming|sunday|wednesday|weekend|week|month)\b/.test(s)) return true;
  return false;
}

function prettyDate(iso: string): string {
  // iso is YYYY-MM-DD; format without Date() to avoid timezone drift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

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

/**
 * Returns a plain-text schedule block to hand the model as authoritative
 * context, or null if unavailable. Includes today's date so the model can
 * resolve "this Sunday" etc.
 */
export async function getSpeakerSchedule(): Promise<string | null> {
  if (!process.env.MONDAY_API_TOKEN) return null;
  try {
    const json = await gql(
      `query ($board: [ID!]) {
        boards(ids: $board) {
          items_page(limit: 100) { items { name column_values { id text } } }
        }
      }`,
      { board: SPEAKER_BOARD_ID }
    );
    const items: { name: string; column_values: { id: string; text: string | null }[] }[] =
      json?.data?.boards?.[0]?.items_page?.items ?? [];

    const rows = items
      .map((it) => {
        const cv: Record<string, string> = {};
        for (const c of it.column_values || []) cv[c.id] = c.text || "";
        return { name: it.name, series: cv[COLS.series] || "", date: cv[COLS.date] || "", day: cv[COLS.day] || "" };
      })
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const today = new Date().toISOString().slice(0, 10);
    const lines = rows.map((r) => {
      const when = `${prettyDate(r.date)}${r.day ? ` (${r.day})` : ""}`;
      const status = r.date < today ? " [past]" : "";
      const series = r.series ? `, series: ${r.series}` : "";
      return `- ${when}: ${r.name}${series}${status}`;
    });

    const header =
      `SPEAKER SCHEDULE (Landmark's live, authoritative speaker schedule; today's date is ${today}). ` +
      `Use these entries to answer who is speaking, preaching, or bringing the message and when. ` +
      `This schedule is internal, so do not cite a source URL for it and do not invent one; leave sources empty if the schedule is your only source. ` +
      `If someone asks about a date not listed, say the schedule does not show that yet.`;

    if (!lines.length) {
      return header + "\n\n(No speakers are currently listed on the schedule.)";
    }
    return header + "\n\n" + lines.join("\n");
  } catch {
    return null;
  }
}
