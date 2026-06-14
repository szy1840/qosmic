# Qosmic take-home — solution

A runtime harness that turns any coding agent into the Qosmic audit agent, and a
**reference-free, self-improving eval system** around it (the headline). Both run
end-to-end on `gingerpeople.com` and the uncalibrated `zenrojas.com`.

## The core bet

Split the audit into a **deterministic crawl** (a script) and **agentic
reason/write** (skills). The crawl emits real screenshots, page text, and
`tech_signals.json`; the agent reasons over them. This is what makes the #1
quality bar — *cite everything* — **mechanically enforceable**: the eval resolves
every cited evidence path against a real artifact. Grounding stops being a hope
and becomes a gate.

## What's here

```
.claude/skills/
  qosmic-audit/        # crawl → reason → write
    SKILL.md           # orchestrator (entry for any coding agent)
    scripts/crawl.mjs  # Playwright crawler; structural surface discovery;
                       #   Wayback fallback when a live edge is bot-walled
    references/        # report schema, 5 pillars, tech checks, competitor method
  qosmic-eval/         # the headline
    scripts/checks.mjs # deterministic: schema, pillar coverage, GROUNDING, sanity
    scripts/judge.mjs  # reference-free multimodal LLM-judge panel (Opus 4.8)
    scripts/score.mjs  # combine → scorecard + promotion GATE
    references/rubric.md
CLAUDE.md              # entry point / how to run
EVAL_LOOP.md           # how the eval becomes autonomous + self-learning  ← read this
AGENT_LOG.md           # time, prompts, agent-drove vs took-the-wheel
WORKFLOWS.md           # how I use coding agents day-to-day
sample_output/         # the two finished audit reports
eval/scorecards/       # the two scorecards from a real eval run
artifacts/             # crawl evidence the reports cite (committed on purpose)
```

## Run it

```bash
npm install                                   # installs Playwright + Chromium
# 1. Crawl (deterministic)
npm run crawl -- https://zenrojas.com         # → artifacts/zenrojas.com/

# 2. Audit: hand a coding agent the qosmic-audit skill and the URL.
#    It reads artifacts/, reasons over 5 pillars, writes sample_output/<host>.md.

# 3. Eval (deterministic + LLM judge; reads ANTHROPIC_API_KEY from .env)
npm run score -- sample_output/zenrojas.com.md artifacts/zenrojas.com --panel 3 --images
#    → eval/scorecards/zenrojas.com.json
#    --images attaches decision-area screenshot crops so the judge verifies
#    VISUAL claims (sold-out button, missing buy box) against pixels, not just text.
```

`checks.mjs` runs with no API key. `judge.mjs`/`score.mjs` need a key; the
`qosmic-eval` skill is the keyless, agent-run alternative.

## Results (from a real run)

(multimodal run, `--panel 3 --images` — the judge verifies visual claims against pixels)

| Store | Mode | Composite | Grounding | Claim support | Gate |
|---|---|---|---|---|---|
| zenrojas.com (uncalibrated) | live | **0.926** | 1.00 | 0.82 | pass |
| gingerpeople.com (calibration) | wayback* | **0.969** | 1.00 | 1.00 | pass |

\* `gingerpeople.com` blocks automated browsers (Cloudflare 403/timeout), so the
crawler fell back to the Internet Archive — a legitimate, citable evidence source
for bot-walled stores. The reports note their provenance.

The eval **discriminates** rather than rubber-stamps: a deliberately corrupted
report (faked evidence path, dropped experiment, collapsed pillar) drops to 0.79
and fails the gate; clean reports score 1.0 on the deterministic layer. The judge
gave 4s (not all 5s) on anti-genericness/competitor quality and surfaced genuine
weaknesses (e.g. an experiment whose schema presupposes reviews another
experiment hasn't created yet).

Read **`EVAL_LOOP.md`** for the autonomy flywheel — that's the headline.
