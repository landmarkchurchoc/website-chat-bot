// Builds data/index.json from two sources:
//   1. The live Webflow site (crawled via sitemap.xml)
//   2. Organization "brain" markdown files in content/brain/
// Run with: npm run ingest
import { load } from "cheerio";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Honor HTTPS_PROXY when present (some CI/sandbox environments); no-op otherwise.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch {
    console.warn("HTTPS_PROXY set but undici unavailable; fetches may fail.");
  }
}

const SITE_URL = process.env.SITE_URL || "https://www.thelandmark.church";
const OUT = "data/index.json";
const CHUNK_SIZE = 1400;
const SKIP_PATTERNS = [/\/es-mx\//, /\/404$/, /\/401$/, /\/search$/];

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "LandmarkAI-Ingest/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function chunk(text, meta) {
  const chunks = [];
  const paragraphs = text.split(/\n{2,}/);
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > CHUNK_SIZE && buf) {
      chunks.push({ ...meta, text: buf.trim() });
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) chunks.push({ ...meta, text: buf.trim() });
  return chunks;
}

async function crawlSite() {
  const docs = [];
  let urls = [];
  try {
    const xml = await fetchText(`${SITE_URL}/sitemap.xml`);
    urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  } catch (e) {
    console.warn(`Could not fetch sitemap: ${e.message}`);
    return docs;
  }
  urls = urls.filter((u) => !SKIP_PATTERNS.some((re) => re.test(u)));
  console.log(`Crawling ${urls.length} pages from ${SITE_URL} ...`);

  const CONCURRENCY = 8;
  let done = 0;
  const queue = [...urls];
  async function worker() {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      try {
        const html = await fetchText(url);
        const $ = load(html);
        $("script, style, nav, footer, noscript, iframe, svg, form").remove();
        const title = $("title").first().text().trim() || url;
        const description = $('meta[name="description"]').attr("content") || "";
        const image = $('meta[property="og:image"]').attr("content") || "";
        const body = $("main").length ? $("main") : $("body");
        const text = body
          .text()
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n\s*/g, "\n\n")
          .trim();
        if (text.length >= 100) {
          docs.push(...chunk(`${description}\n\n${text}`, { title, url, source: "website", image }));
        }
      } catch (e) {
        console.warn(`skip ${url}: ${e.message}`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${urls.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return docs;
}

function readBrain() {
  const dir = "content/brain";
  if (!existsSync(dir)) return [];
  const docs = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".md") && f.name.toLowerCase() !== "readme.md") {
        const raw = readFileSync(p, "utf8");
        const titleMatch = raw.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : f.name.replace(/\.md$/, "");
        docs.push(...chunk(raw, { title, url: `${SITE_URL}`, source: "brain" }));
      }
    }
  };
  walk(dir);
  return docs;
}

const site = await crawlSite();
const brain = readBrain();
const all = [...site, ...brain].map((d, i) => ({ id: i, ...d }));
mkdirSync("data", { recursive: true });
writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), site: SITE_URL, chunks: all }, null, 1));
console.log(`Wrote ${OUT}: ${site.length} website chunks, ${brain.length} brain chunks.`);
