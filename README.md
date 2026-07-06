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

## Sermon vertical thumbnails (Webflow + Nano Banana)

When a sermon is added to the Webflow **Sermons** collection, this app can
automatically turn its 16:9 horizontal thumbnail into a 2:3 vertical thumbnail
using **Nano Banana** (Gemini 2.5 Flash Image, via Google AI Studio) and write
the result back to the item's **Vertical Thumbnail** field.

```
Webflow "sermon created/changed" webhook
        │
        ▼
/api/webflow/sermon-thumbnail
        │  1. read the Sermon item (skip if it already has a vertical thumbnail)
        │  2. download the 16:9 `thumbnail`
        │  3. Nano Banana reflows it to 2:3 (aspectRatio 2:3 + the reposition prompt)
        │  4. upload the result to the Webflow asset library
        │  5. write it to `vertical-thumbnail` and publish the item
        ▼
Sermon item now has a published 2:3 vertical thumbnail
```

The route is idempotent — it skips items that already have a vertical thumbnail,
so Webflow retries and the "changed" event triggered by its own write are no-ops.

### Setup

1. **Environment variables** (Vercel → Settings → Environment Variables):
   - `GEMINI_API_KEY` — Google AI Studio key (the code also accepts
     `GOOGLE_AI_API_KEY` / `GOOGLE_AI_STUDIO_API_KEY` / `GOOGLE_API_KEY`)
   - `WEBFLOW_API_TOKEN` — Webflow Data API token with CMS + Assets read/write
   - `WEBHOOK_SECRET` — any random string; guards the webhook route
2. **Register the webhooks** (after deploy), pointing at your live URL with the
   secret baked in:

   ```bash
   WEBFLOW_API_TOKEN=... node scripts/sermon-thumbnails.mjs \
     register "https://YOUR-APP.vercel.app/api/webflow/sermon-thumbnail?secret=YOUR_SECRET"
   ```

   This registers `collection_item_created` and `collection_item_changed`
   (both are site-wide; the route filters to the Sermons collection). Use
   `list` / `unregister` to inspect or remove them.
3. **Backfill** existing sermons that have no vertical thumbnail yet:

   ```bash
   WEBFLOW_API_TOKEN=... node scripts/sermon-thumbnails.mjs \
     backfill "https://YOUR-APP.vercel.app/api/webflow/sermon-thumbnail?secret=YOUR_SECRET" --limit 1
   ```

   (Drop `--limit 1` to run them all; `--limit 1` is a good first smoke test.)

## Feeding the organization brain

Add Markdown files to `content/brain/` (see its README). They are indexed on the
next ingest/deploy and treated as the church's authoritative voice.
