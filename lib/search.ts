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

const mini = new MiniSearch<Chunk>({
  fields: ["title", "text"],
  storeFields: ["title", "url", "source", "text"],
  searchOptions: { boost: { title: 2 }, fuzzy: 0.2, prefix: true },
});
mini.addAll(chunks);

/** Retrieve the most relevant website + brain chunks for a question. */
export function retrieve(question: string, limit = 8): Chunk[] {
  const results = mini.search(question).slice(0, limit);
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source,
    text: r.text,
  }));
}
