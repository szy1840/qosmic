# WORKFLOWS.md — how I work with coding agents day-to-day

Not about this take-home — about my actual delegation patterns.

## Tool stack

- **Primary driver:** Claude Code (Opus 4.8) in the terminal, with the IDE
  extension for inline diffs. Codex as a second opinion on gnarly debugging.
- **Skills over prompts.** I package recurring expertise as Claude Code skills
  (YAML frontmatter + progressive-disclosure body + `references/` + `scripts/`)
  rather than re-pasting context. This repo is itself two skills (`qosmic-audit`,
  `qosmic-eval`) — that's how I'd ship internal capability: a skill an agent loads
  on demand, not a wall of system prompt.
- **MCP servers** for anything stateful the agent shouldn't shell out to: the
  browser (Playwright/opencli) for live-site work, Gmail/Calendar for ops,
  internal data over a thin read-only MCP. I keep MCP tools read-only by default
  and promote to write-capable only behind a confirmation.
- **Slash commands** for the rituals I repeat: `/code-review` before every PR,
  a custom audit/eval command per project, `/loop` for poll-until-done.

## Delegation patterns

- **Plan first, then delegate.** I make the agent produce a design plan and
  surface the 2–3 decisions that are genuinely mine *before* it writes code
  (exactly the three-fork question at the start of this build). Cheap to redirect
  on a plan, expensive on 500 lines.
- **Deterministic core, agentic edges.** Anything that must be reproducible or
  auditable I push into a script the agent writes once (the crawler here); the
  open-ended judgment stays with the agent (the reasoning/writing). This is also
  what makes evals possible — deterministic artifacts give the eval something to
  check against.
- **Fan out for breadth, drive for depth.** Subagents for parallel search/read
  ("map this subsystem", "find every call site"); I keep one main thread for the
  decision that ties it together.
- **The eval is the spec.** For anything quality-sensitive I'd rather build a
  cheap automated grader and let the agent iterate against it than review every
  output by hand. A sharp grader on a thin generator beats a hand-tuned generator
  with no grader — the thesis of this whole exercise.
- **Memory for what's non-obvious.** I have the agent persist project decisions
  and corrections to a memory file so the next session doesn't re-litigate them.

## What I let agents drive vs always take the wheel on

| Agent drives | I always take the wheel |
|---|---|
| Implementation, refactors, test-writing | Architecture & the irreversible calls |
| Debugging, log spelunking, repro | Anything that publishes/sends/deletes externally |
| Drafting reports/docs from real artifacts | Honesty calls (don't fake data to get a clean run) |
| Running the eval and proposing fixes | Promotion to "this is correct" — gated, then spot-checked |

## Guardrails I don't skip

- **Cite or it didn't happen.** Outputs must tie to a real artifact; I build the
  grounding check into the eval so the agent can't quietly hallucinate.
- **Gate before promote.** No change ships unless an automated gate (tests, eval,
  no-regression) passes — humans review the *exceptions*, not the bulk.
- **Verify, don't trust the summary.** If the agent says "tests pass," I make it
  show the run. Reported outcomes must be auditable.
