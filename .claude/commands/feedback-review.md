# AI Answer Feature: Scheduled Feedback Review

Run the recurring maintenance review of the Landmark AI answer feature.
Follow every step; this procedure was agreed with Eric (July 2026).

## 1. Gather

- Read `content/brain/ai-search-changelog.md` for context and the update policy.
- Pull all items from the **AI Answer Feedback** Monday board (18420598077),
  including each item's updates (the full feedback text lives there).
  Focus on items with Triage = "New".
- Also skim recent items on the **AI Search Questions** board (18420369585):
  look for low-confidence answers, escalations, repeated questions with no
  good answer (content gaps), and anything factually wrong.

## 2. Triage

Classify each piece of feedback / observed issue:

- **Small (ship directly):** bugs, glitches, styling fixes, tightening or
  correcting answers, prompt tweaks, refreshing the site index
  (`npm run ingest` needs `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` and
  proxy support is built into the script), and tiny features that live within
  the existing card/answer experience.
- **Large (flag first, do NOT push):** anything that overhauls or materially
  alters the feature — new surfaces beyond the search page, changing the
  overall UX, changing data sources or theology guardrails, removing
  safeguards, big cost changes.

## 3. Implement small items

- Work on `main` (Vercel auto-deploys it; the widget needs no Webflow publish).
- Verify with `npm run build` and live curl tests against
  `https://website-chat-bot-wheat.vercel.app/api/ask` before finishing.
- If widget behavior changed, confirm the deployed `widget.js` serves the new
  code (5-minute cache).

## 4. Flag large items

- Draft an email to **creative@thelandmark.church** summarizing the proposed
  change, why (which feedback prompted it), and the plan. Use the Gmail
  integration (create a draft addressed from Eric's account and tell him it's
  ready to send, or notify him in Monday). Do not build or push the change
  until Eric approves.

## 5. Close the loop

- Set each Monday feedback item's Triage status: "Implemented", "Flagged for
  approval", or "Declined" (with a short update comment explaining why).
- Append a dated entry to `content/brain/ai-search-changelog.md` describing
  what changed and the reasoning; commit and push with the other changes.
- Reply to Eric with a short summary: items reviewed, shipped, flagged.

## Key facts

- Repo deploys from `main` → Vercel project (website-chat-bot-wheat.vercel.app).
- Widget embed: page-level custom code on the Webflow Search Results page
  (page 6966af9f6dd3f5b0369a86c9) — plain script tag, no version pinning.
- Answer cache: bump the `unstable_cache` key in `app/api/ask/route.ts`
  (ai-answer-vN) whenever prompt/schema changes should invalidate cached answers.
- Monday boards: questions 18420369585, feedback 18420598077 (column IDs in
  `lib/monday.ts`).
