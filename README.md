# Landmark AI Search

AI answer summaries for [thelandmark.church](https://www.thelandmark.church) site search —
a Gemini-style overview that appears above the regular Webflow search results and answers
natural-language questions from three tiers of sources:

1. **Website** — Landmark's Webflow site content (crawled at build time via the sitemap)
2. **Organization brain** — Markdown files in [`content/brain/`](content/brain)
3. **Scripture & trusted ministries** — ESV Bible (via Crossway's API) and web search
   restricted to leadership-approved domains

## How an answer is produced

```
question ──► crisis pre-check ──► local retrieval (website + brain chunks)
                    │                        │
                    ▼                        ▼
             care escalation        Claude (claude-opus-4-8) with:
                                     • theological guardrails (conservative,
                                       literal hermeneutic, Reformed-leaning)
                                     • get_esv_passage tool (accurate ESV quotes)
                                     • web_search restricted to approved domains
                                     • per-source copyright rules
                                            │
                                            ▼
                          JSON: answer, confidence, sources, goDeeper, escalate
                                            │
                          low confidence? ──► widget shows nothing (honesty rule)
                                            │
                                            ▼
                          answer card + Monday board logging (optional)
```

### Copyright rules enforced in the system prompt

| Source | Treatment |
|---|---|
| GotQuestions.org | Quotable ≤200 words/article, credited + linked |
| DesiringGod.org | John Piper content only, excerpts with the exact required attribution line |
| Enduring Word, Answers in Genesis, Logos | **Link-only** ("Go deeper" recommendations, never quoted) |
| ESV | Short quotations with the "ESV" notice, via the official API |

## Setup

1. **Environment variables** (Vercel → Project → Settings → Environment Variables — see `.env.example`):
   - `ANTHROPIC_API_KEY` (required)
   - `ESV_API_TOKEN` — free key from https://api.esv.org/account/
   - `CARE_FORM_URL` — Landmark's care request form
   - `MONDAY_API_TOKEN` + `MONDAY_BOARD_ID` — optional question logging
2. **Deploy** — push to the connected GitHub repo; Vercel builds with `next build`.
   Run `npm run ingest` locally and commit `data/index.json` to refresh site content
   (or add `node scripts/ingest.mjs && ` in front of the build command in Vercel to
   re-crawl on every deploy).
3. **Embed on Webflow** — Site settings → Custom code → Footer:

```html
<script src="https://YOUR-APP.vercel.app/widget.js" defer
  data-endpoint="https://YOUR-APP.vercel.app/api/ask"
  data-input='input[type="search"]'
  data-target=".search-results"></script>
```

Adjust `data-input` / `data-target` to match the site's search input and results
container. The widget also auto-answers when a search results page loads with a
`?query=` parameter, and is available programmatically as `window.LandmarkAI.ask(q)`.

## Local development

```bash
npm install
npm run ingest        # crawl the site + read content/brain -> data/index.json
cp .env.example .env  # fill in keys
npm run dev           # test page at http://localhost:3000
```

## Feeding the organization brain

Add Markdown files to `content/brain/` (see its README). They are indexed on the
next ingest/deploy and treated as the church's authoritative voice.
