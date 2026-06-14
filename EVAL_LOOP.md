# EVAL_LOOP.md — how the eval becomes autonomous and self-learning

The eval is the product. The runtime harness is a thin, replaceable thing that
the eval steers toward quality. This is the design for making that loop run with
a shrinking number of humans in it.

## What exists today (the substrate)

`score.mjs` produces a per-store **scorecard** from two layers:

1. **Deterministic checks** (`checks.mjs`, no LLM) — schema conformance, all-5-pillar
   coverage, **evidence grounding** (every cited path/URL must resolve to a real
   crawl artifact), value sanity. Emits machine-readable `deficiencies[]` and a
   `critical_count`.
2. **Reference-free LLM-judge panel** (`judge.mjs`) — scores evidence fidelity,
   insight, actionability, **anti-genericness**, exec sharpness, competitor
   quality; verifies each experiment's hypothesis against the *actual* cited page
   text + `tech_signals.json`; majority-votes per-experiment support; reports
   inter-judge variance.

A **promotion gate** combines them: a report (or a harness version) passes only
if `critical_count == 0`, `grounding_rate ≥ 0.95`, `claim_support_rate ≥ 0.8`,
and `composite ≥ 0.7`. Quality can never average away a reliability defect.
Both layers are **reference-free**, so they score stores never seen — verified
live on the uncalibrated `zenrojas.com` (composite 0.98) as well as the
calibration anchor `gingerpeople.com` (0.96).

## The flywheel (closing the loop)

```
 random Shopify URLs ─▶ harness ─▶ reports ─▶ eval ─▶ scorecards + deficiencies[]
        ▲                                                      │
        │                                                      ▼
   fleet grows                          coding agent reads worst scores + deficiencies,
   (zero labeling)                      edits skills/crawler, opens PR
        │                                                      │
        └──────────────── champion ◀── gate: beat current champion ◀──┘
                                         on the suite, no regressions
```

1. **Self-growing eval set.** A nightly cron discovers fresh Shopify storefronts
   (public BuiltWith/myip.ms lists, sitemaps) and runs the harness over a widening
   fleet. Every run is a new eval case — **no human labeling**.
2. **Deficiencies → fixes.** Each scorecard's `deficiencies[]` and judge
   `top_weaknesses` are structured and addressable ("pillar X missing",
   "exp-N hypothesis unsupported by evidence", "sitemap always Warn because the
   crawler didn't fetch it"). A coding agent consumes the lowest-scoring reports +
   their deficiencies and proposes a harness diff (a skill edit, a crawler fix).
3. **Gated auto-promotion.** The diff is evaluated on the suite; it is promoted to
   champion only if it beats the current champion's mean composite **with no new
   critical/grounding regressions**. This is the "no slop" gate, automated.
4. **Self-learning rubric.** Whenever a human overrides a judge score, the
   disagreement is logged. A weekly meta-eval folds these into the rubric's
   criteria and few-shot anchors, so the judge drifts toward human taste. The
   calibration anchor (`target_report.md`) is the regression test that the rubric
   still tracks known-good quality.

## 1–3 months out

- **Month 1:** nightly fleet runs + auto-PRs; humans review every proposed harness
  diff and label a small calibration sample. Judge variance and grounding are
  tracked over time.
- **Month 2:** auto-promotion turns on behind the gate; humans only adjudicate
  cases the eval flags as *low-confidence* — high inter-judge variance, or
  judge-vs-deterministic disagreement (active learning, not full review).
- **Month 3:** a "completeness critic" agent periodically asks *what is the eval
  not measuring?* (e.g. mobile-specific leaks, accessibility, localization) and
  proposes new dimensions; humans approve dimension changes and handle novel
  failure classes only.

## Where humans stay — and why the surface shrinks

| Human touchpoint | Shrinks because |
|---|---|
| Review every harness PR | → only sub-gate or high-variance PRs, as the gate proves trustworthy |
| Label calibration samples | → active-learning samples only (judge confident ⇒ no label) |
| Catch novel failure modes | → the failure taxonomy saturates; the completeness critic pre-finds most |
| Tune the rubric | → the rubric self-tunes from logged overrides; humans approve, not author |

The human surface is **measurable** (override rate, gate-disagreement rate,
calibration drift) and the loop is explicitly optimized to drive those metrics
down. The one thing we never automate away: a small **held-out calibration set**
the harness can't train against, which is how we detect the eval being gamed
(e.g. a judge that rewards verbosity). Reward-hacking resistance = deterministic
grounding floor + held-out humans + adversarial "refute this finding" judges as a
future panel mode. The eval improving the eval — judge-flagged "claims rely on
artifacts not shown to the judge" already drove a same-day fix (feed
`tech_signals.json` to the judge) — is the loop working on day one.
