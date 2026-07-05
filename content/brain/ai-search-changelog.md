# AI Search Feature: Changelog & Decisions

Internal record of how the Landmark AI answer feature works, why it was built
this way, and every change made to it. Maintained by Claude; updated on each
change and each scheduled feedback review.

## How it works (current architecture)

- Widget (`widget.js`) is embedded via page-level custom code on the Search
  Results page only; it auto-updates from Vercel with no Webflow publish.
- `/api/ask` answers questions from: (1) the crawled website index,
  (2) `content/brain/*.md`, (3) ESV Scripture via Crossway's API, and
  (4) web search restricted to approved ministry domains.
- Copyright rules: GotQuestions quotable ≤200 words with credit; Desiring God
  Piper-only with exact attribution line; Enduring Word / Answers in Genesis /
  Logos link-only. ESV quotes carry the "ESV" notice.
- Crisis questions bypass AI and show the Church Center care form + 988.
- Model: claude-sonnet-5 (env `ANSWER_MODEL` overrides), no extended thinking,
  low effort, answers ≤225 words. Repeated questions served from a shared
  6-hour cache. Low-confidence answers are hidden from visitors (honesty rule).
- Questions log to the "AI Search Questions" Monday board (18420369585);
  visitor feedback logs to "AI Answer Feedback" (18420598077).

## Update policy (agreed with Eric, Jul 2026)

- Recurring review of the feedback board roughly every 2 weeks: triage items,
  fix bugs / tighten answers / correct info / small in-feature improvements,
  set each item's Triage status, and record changes here.
- Changes that overhaul or materially alter the feature require an email
  summary to creative@thelandmark.church BEFORE pushing, and wait for approval.
- Small fixes ship directly.

## Changelog

### 2026-07-02: Initial build
- Three-tier RAG answer engine, Webflow widget, ESV tool, restricted web
  search, crisis escalation, Monday question logging, copyright guardrails.
- Copyright research: verified policies of GotQuestions, Desiring God,
  Enduring Word, Answers in Genesis, ESV API. AiG kept link-only per Eric.

### 2026-07-02: Launch polish
- Lumos-token styling (Gotham, brand-500, radius/shadow matching site cards),
  brand-100 light blue card background for visual distinction.
- No em dashes, no AI-filler style rules; 6-line clamp with See more.
- Speed: Sonnet model, batched ESV fetches, shared answer cache, Monday
  logging moved after response. Cold ~10-15s, repeats ~0.5s.
- Widget scoped to the search results page only (?query= trigger).

### 2026-07-05: Reliability fix
- Root-caused a multi-day outage: the Webflow-registered script pinned an
  integrity hash that drifted from the deployed widget.js. Replaced with a
  plain script tag in the Search page's custom code; widget now updates
  automatically on deploy with nothing to drift.

### 2026-07-05: Actions, feedback loop
- Action links: up to 2 CTAs per answer linking the specific CMS page;
  thumbnail cards (og:image) for sermons/series/podcasts, secondary outline
  buttons beneath thumbnails, primary buttons otherwise. Homepage links
  resolve to the specific page by title lookup; URLs deduped.
- Answers lengthened to ≤225 words; Collapse/Show toggle (non-persistent)
  replaced Hide; link hovers to dark-700.
- "Give Feedback" inline form on the card → AI Answer Feedback Monday board.
- This changelog created; recurring feedback-review schedule established.
