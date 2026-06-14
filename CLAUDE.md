# Qosmic runtime harness — entry point

This repo turns any coding agent (Claude Code, Codex, …) into the **Qosmic
runtime audit agent**: point it at a storefront URL, get a CRO audit report at
the bar of `target_report.md`.

## Run an audit

> Audit `https://<store>` — produce the Qosmic CRO report.

This triggers the **`qosmic-audit`** skill (`.claude/skills/qosmic-audit/`).
Flow: `crawl.mjs` captures artifacts → you reason over them across five pillars
→ you write `sample_output/<host>.md`. The skill is self-describing; read its
`SKILL.md` and `references/`.

```bash
# crawl only (deterministic)
node .claude/skills/qosmic-audit/scripts/crawl.mjs https://<store>
```

## Score an audit

> Evaluate `sample_output/<host>.md`.

This triggers the **`qosmic-eval`** skill (`.claude/skills/qosmic-eval/`).
Deterministic checks + multimodal LLM-judge → `eval/scorecards/<host>.json`.

```bash
# full programmatic score (deterministic + API judge if ANTHROPIC_API_KEY set)
node .claude/skills/qosmic-eval/scripts/score.mjs sample_output/<host>.md artifacts/<host>
```

## Quality bars (read before writing any report)
- **Cite everything.** Every claim ties to a real artifact in `artifacts/<host>/`
  or a crawled URL in `manifest.json`. No speculation.
- **Diversify pillars.** 10 experiments spanning Conversion / AOV / Retention /
  Acquisition / Performance.
- **Generalize.** Nothing store-specific is baked into the harness. The crawler
  discovers surfaces structurally and falls back to the Internet Archive when a
  live edge is bot-walled.

## Layout
```
.claude/skills/qosmic-audit/   # crawl + reason + write
.claude/skills/qosmic-eval/    # deterministic checks + LLM judge
artifacts/<host>/              # crawl outputs (evidence)
sample_output/                 # finished reports + scorecards
eval/                          # eval rubric, scorecards, golden refs
EVAL_LOOP.md  AGENT_LOG.md  WORKFLOWS.md
```

Key (`ANTHROPIC_API_KEY`) is read from `.env` for the headless judge.
