---
name: qosmic-eval
description: >-
  Score a Qosmic audit report — reference-free, so it works on stores never seen.
  Combines deterministic checks (schema, pillar coverage, evidence grounding) with
  an LLM-judge rubric (evidence fidelity, insight, actionability, anti-genericness)
  and applies a promotion gate. Use whenever asked to "evaluate", "score", or
  "grade" an audit report, or to gate a harness change.
---

# Qosmic audit evaluator

Scores `sample_output/<host>.md` against `artifacts/<host>/` and writes a
scorecard. Reference-free — no golden report needed — so it generalizes to unseen
stores. Two layers + a gate.

## Fastest path (headless, needs ANTHROPIC_API_KEY in env or .env)

```bash
node .claude/skills/qosmic-eval/scripts/score.mjs sample_output/<host>.md artifacts/<host> --panel 3 --images
```

`--images` renders decision-area crops of the cited screenshots and attaches them
so the judge verifies **visual** claims (dead "SOLD OUT" button, missing buy box,
blank tiles) against pixels — not just page text. Omit it for a faster text-only run.

Writes `eval/scorecards/<host>.json` with `composite_score`, `gate_pass`,
`gate_failures`, the deterministic breakdown, and the judge panel result.

- `checks.mjs` alone (no key) → deterministic score + machine-readable `deficiencies[]`.
- `judge.mjs` → reference-free LLM-judge panel (default `claude-opus-4-8`; override
  with `JUDGE_MODEL`). See `references/rubric.md` for the dimensions.
- `score.mjs --no-judge` → deterministic only.

## Keyless path (you, the coding agent, are the judge)

If no API key is available, run the deterministic layer programmatically and
perform the judge step yourself:

1. `node .claude/skills/qosmic-eval/scripts/checks.mjs sample_output/<host>.md artifacts/<host>`
   — gives schema/pillar/grounding/sanity scores + `deficiencies[]` + `critical_count`.
2. Read `references/rubric.md`. Then **read the report and the cited evidence**
   (`artifacts/<host>/pages/*.txt`, `tech_signals.json`, and the cited
   `screenshots/*.png` — you can view images). Score the six rubric dimensions
   1–5 and verify each experiment's hypothesis against its cited artifact.
3. Combine into the same scorecard shape and apply the gate (below). Write it to
   `eval/scorecards/<host>.json`.

## The promotion gate (reliability contract)

A report — or a proposed harness change — passes only if **all** hold:
- `critical_count == 0` (no missing pillar, broken evidence path, or wrong count)
- `grounding_rate ≥ 0.95` (cited evidence resolves to real artifacts)
- judge `claim_support_rate ≥ 0.8` (hypotheses corroborated by cited evidence)
- `composite ≥ 0.7` (composite = 0.45·deterministic + 0.55·judge)

Critical structural defects and ungrounded evidence **hard-fail** regardless of
prose quality — quality can't average away a reliability bug. This gate is what a
harness change must clear to be promoted; see `EVAL_LOOP.md`.

## Calibration

`target_report.md` (gingerpeople) is the calibration anchor: use it to confirm the
rubric tracks known-good quality. Scoring stays reference-free for every other
store.
