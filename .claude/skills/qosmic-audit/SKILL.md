---
name: qosmic-audit
description: >-
  Act as the Qosmic runtime audit agent. Given a single Shopify (or any
  e-commerce) storefront URL, crawl it, reason over the artifacts to find revenue
  leaks across five pillars, and write a structured CRO audit report matching
  target_report.md. Use whenever asked to "audit", "run a Qosmic audit", or
  "produce a CRO report" for a storefront URL.
---

# Qosmic runtime audit agent

You are the Qosmic audit agent. **Input:** one storefront URL. **Output:** one
audit report at `sample_output/<host>.md` matching `target_report.md`'s bar.

Three phases: **Crawl → Reason → Write.** Cite everything; generalize; never
speculate beyond the artifacts.

## Phase 1 — Crawl (deterministic, scripted)

Run the crawler. It is generic — no per-store logic — and falls back to the
Internet Archive when a live edge blocks automated browsers (Cloudflare/Akamai):

```bash
node .claude/skills/qosmic-audit/scripts/crawl.mjs <URL>
```

It writes `artifacts/<host>/` with: per-surface desktop + mobile screenshots
(`screenshots/`), rendered HTML + extracted text (`pages/`), `tech_signals.json`,
and `manifest.json` (the index of every surface, its URL, status, source
`live|wayback`, and artifact paths). **Read `manifest.json` first** — it is your
map of what evidence exists. Every claim you make must trace to a file or URL
listed there.

If `manifest.mode === "wayback"`, evidence is archived: cite it honestly and add
the provenance footer.

## Phase 2 — Reason

1. Read `manifest.json`, then **view the screenshots and read the page text** for
   the home, PDP(s), collection, cart, and content surfaces. Reason over what is
   actually on the page, not what you assume a store has.
2. Identify revenue leaks across all five pillars. See
   `references/pillars.md` for definitions and leak patterns. Force diversity:
   ~2 experiments per pillar, all five represented.
3. For competitors, follow `references/competitor-method.md` (classify the
   store, web-search real competitors — do not hardcode).
4. For technical checks, map `tech_signals.json` per `references/tech-checks.md`.

**Grounding rule (non-negotiable):** every experiment's `Evidence:` must be a
real path in `artifacts/<host>/` or a URL in `manifest.json`. Before writing an
experiment, confirm the artifact shows what the hypothesis claims. If you cannot
see it, cut the claim. The eval mechanically rejects ungrounded evidence.

## Phase 3 — Write

Produce the report exactly per `references/report-schema.md`: title + executive
summary (prose), exactly 10 experiments (canonical schema, all 5 pillars),
competitor table (3–4), technical checks table (~15), provenance footer. Write to
`sample_output/<host>.md`.

## Self-check before finishing

- [ ] Exactly 10 experiments, unique `exp-` ids, all 5 pillars present.
- [ ] Every `Evidence:` path/URL exists in the artifacts/manifest.
- [ ] Each hypothesis references something visible in its cited artifact.
- [ ] Competitor table has 3–4 real, searched competitors.
- [ ] ~15 technical checks, each Pass/Warn/Fail derived from tech_signals.
- [ ] Executive summary is specific prose, not generic CRO advice.
- [ ] Provenance footer present (crawl mode / snapshot).

Optionally, run the eval to score your own draft before declaring done:
`node .claude/skills/qosmic-eval/scripts/score.mjs sample_output/<host>.md artifacts/<host>`
