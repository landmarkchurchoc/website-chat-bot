// Crossway ESV API (free for non-commercial church use).
// License requirements enforced here and in the system prompt:
//  - include the "ESV" notice with quotations
//  - stay far below the 500-verse per-query/display limits
const ESV_ENDPOINT = "https://api.esv.org/v3/passage/text/";

export async function getEsvPassage(reference: string): Promise<string> {
  const token = process.env.ESV_API_TOKEN;
  if (!token) {
    return "ESV API is not configured (missing ESV_API_TOKEN). Cite the reference without quoting the text.";
  }
  const params = new URLSearchParams({
    q: reference,
    "include-headings": "false",
    "include-footnotes": "false",
    "include-verse-numbers": "true",
    "include-short-copyright": "true",
    "include-passage-references": "true",
  });
  const res = await fetch(`${ESV_ENDPOINT}?${params}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) return `ESV API error (${res.status}) for "${reference}".`;
  const data = (await res.json()) as { passages?: string[] };
  return data.passages?.join("\n\n") || `No passage found for "${reference}".`;
}
