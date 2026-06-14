# AGENT_LOG.md

How this was built, where the coding agent (Claude Code, Opus 4.8) drove, and
where I (the human) took the wheel. The whole deliverable was built by steering a
coding agent — that is the role, so this log is the artifact that shows it.

## Time

| Part | Spend | Notes |
|---|---|---|
| Design + scoping | ~20 min | Plan, three decision forks, environment feasibility checks |
| Part 1 — runtime harness (crawl + skill + 2 reports) | ~1h45 | Crawler hardening (Wayback fallback) ate the most time |
| Part 2 — eval system (checks + judge + score + gate) | ~1h25 | The weighted part |
| Docs (EVAL_LOOP, AGENT_LOG, WORKFLOWS, README) | ~30 min | |
| **Total** | **~4h** | Hard ceiling 5 respected |

## Where the agent drove vs where I took the wheel

**Agent drove (I reviewed, didn't author):**
- All code: `crawl.mjs` (Playwright + Wayback fallback + structural surface discovery),
  the three eval scripts, every skill/reference file.
- Both audit reports — reasoning over crawl artifacts, drafting 10 experiments
  each across 5 pillars, the competitor and technical tables.
- Debugging the gingerpeople bot-wall and designing the Wayback fallback.

**I took the wheel (decisions the agent surfaced to me):**
1. **Three forks up front** (via a structured question): Playwright crawl vs
   alternatives; dual judge (API script + agent-run skill) vs one; run live now
   vs build-only. I chose the recommended option each time.
2. **The bot-wall call.** When `gingerpeople.com` returned 403/timeout to every
   automated browser, I confirmed the Wayback-Machine fallback approach rather
   than faking gingerpeople data — keeping evidence honest mattered more than a
   clean live run.
3. **Provided the `ANTHROPIC_API_KEY`** (in `.env`) mid-build so the headless
   judge could run for real.

## Prompts I fed the agent (paraphrased)

- "先给我一个设计plan" — give me a design plan first (kept it from coding before we agreed on architecture).
- The three-fork answer (Playwright / dual judge / run live).
- ".env 文件下面有 ANTHROPIC_API_KEY,你可以使用" — the API key is in .env, use it.

That is the entire human input. Everything else — architecture, the
deterministic-crawl-makes-grounding-enforceable bet, the Wayback fallback, the
reference-free judge, the promotion gate — the agent proposed and I approved.

## Notable moments where the loop self-corrected

- **Crawler v1 → v3 on gingerpeople:** v1 timed out (bot wall) → v2 added Wayback
  but picked a German-locale PDP and a `?reviews-page=2` duplicate, and hit
  Wayback's HTTP/2 throttle → v3 added canonical-URL ranking + retry-with-backoff
  and cleanly captured the hero GIN GINS PDP.
- **Deterministic scorer was too lenient:** a missing whole pillar only dropped
  the score to 0.93. I had the agent add a multiplicative critical-defect penalty
  + a `critical_count` the gate keys off — a corrupted report now drops to 0.79
  and fails the gate, while clean reports stay at 1.0.
- **The eval improved the eval:** the LLM judge flagged that several claims rested
  on screenshots / `tech_signals.json` it was never shown, so it couldn't verify
  them from text. Same-session fix: feed `tech_signals.json` into the judge's
  evidence. (Full screenshot/multimodal verification is the documented next step.)

## Verification (not claimed, run)

- Crawler ran end-to-end on both URLs; artifacts in `artifacts/`.
- `checks.mjs` proven to *bite*: a corrupted report (faked evidence path, dropped
  experiment, collapsed pillar) drops to 0.79 with critical flags; clean reports = 1.0.
- Full `score.mjs` (deterministic + 3-judge panel) run live: zenrojas composite
  **0.976**, gingerpeople **0.957**, both gate-pass, 100% grounding, 100% claim
  support. Scorecards in `eval/scorecards/`.

## Live-site reliability note — gingerpeople.com (calibration target)

The assignment's calibration target is unreliable on **two independent axes**,
both on the store's side — which is the whole reason the crawler needs a fallback.
Observed states (probed directly):

| When | `/` | `/robots.txt` | What it means |
|---|---|---|---|
| During build | 403 Forbidden / timeout | timeout | Cloudflare **bot management** blocks automated clients |
| 2026-06-14 15:22 PDT | 403 Forbidden (0.1s) | 25s timeout | Bot wall still up |
| Same time, in a browser | Cloudflare **524** "origin web server timed out" | — | The WordPress **origin is overloaded/down** — even humans can't load it |

So the live store fails for bots (403) *and* intermittently for everyone (524).
Wayback remained available throughout (snapshot `20260422074251`, status 200), so
the harness still produces a grounded report. This is exactly the failure mode the
Wayback fallback exists for — and, ironically, the kind of Performance/reliability
problem a CRO audit should itself flag.

## What I'd do with more time

- Multimodal judge (`--images`): feed cited screenshots so pixel-level claims
  ("dead SOLD OUT button", "blank cross-sell tiles") are machine-verified, not
  just text-corroborated.
- Real Lighthouse for the page-speed checks (currently navigation-timing proxies).
- Wire the nightly fleet cron described in `EVAL_LOOP.md`.
