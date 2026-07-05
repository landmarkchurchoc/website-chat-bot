# Landmark AI Search

AI answer summaries for thelandmark.church site search. Read
`content/brain/ai-search-changelog.md` first — it records the architecture,
decisions, and update policy.

## Ground rules

- Deploys: push to `main` → Vercel auto-deploys; the widget on the Webflow
  site updates automatically (plain script tag, no publish, no hash pinning).
- Copyright guardrails in `lib/prompt.ts` are legal requirements — never relax
  them without explicit approval from Eric (ehoover@thelandmark.church).
- Changes that overhaul or materially alter the feature must be flagged to
  creative@thelandmark.church BEFORE pushing. Small fixes ship directly.
- For the recurring maintenance review, run `/feedback-review`.
- After changing `lib/prompt.ts` or the answer schema, bump the cache key
  (`ai-answer-vN`) in `app/api/ask/route.ts`.
- Site content refresh: `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run ingest`,
  then commit `data/index.json`.
