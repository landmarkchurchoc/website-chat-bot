import MiniSearch from "minisearch";
import indexData from "@/data/index.json";

export interface Chunk {
  id: number;
  title: string;
  url: string;
  source: "website" | "brain";
  text: string;
  image?: string;
}

const chunks = (indexData as { chunks: Chunk[] }).chunks;

// Page URL -> og:image thumbnail (sermons, series, podcasts, etc.).
const imageByUrl = new Map<string, string>();
for (const c of chunks) {
  if (c.image && !imageByUrl.has(c.url)) imageByUrl.set(c.url, c.image);
}
export function thumbnailFor(url: string): string | undefined {
  return imageByUrl.get(url) || imageByUrl.get(url.replace(/\/$/, ""));
}

/** Best-matching page for a title/phrase (used to resolve vague action links). */
export function findPage(query: string): { url: string; title: string } | undefined {
  const hit = mini.search(query)[0];
  return hit ? { url: hit.url, title: hit.title } : undefined;
}

const mini = new MiniSearch<Chunk>({
  fields: ["title", "text"],
  storeFields: ["title", "url", "source", "text"],
  searchOptions: { boost: { title: 2 }, fuzzy: 0.2, prefix: true },
});
mini.addAll(chunks);

/** Retrieve the most relevant website + brain chunks for a question. */
export function retrieve(question: string, limit = 8): Chunk[] {
  return retrieveScored(question, limit).chunks;
}

/**
 * Retrieve chunks plus a strength signal. `count` is how many chunks matched
 * and `topScore` is the best MiniSearch score; both are used to decide whether
 * the site/brain already cover a question (so we can skip the slow web-search
 * tool) or whether it is a topic the site does not address.
 */
export function retrieveScored(
  question: string,
  limit = 8
): { chunks: Chunk[]; count: number; topScore: number } {
  const results = mini.search(question).slice(0, limit);
  const chunks = results.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source,
    text: r.text,
  }));
  return { chunks, count: results.length, topScore: results[0]?.score ?? 0 };
}
