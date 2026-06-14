#!/usr/bin/env node
// Qosmic eval — orchestrator. Combines deterministic checks + the LLM judge into
// one scorecard with a promotion gate, and writes it to eval/scorecards/<host>.json.
//
//   node score.mjs <report.md> <artifacts/<host>> [--panel N] [--no-judge]
//
// The gate is what makes the loop reliable: a harness change may only be promoted
// if it clears the gate. Critical structural defects and ungrounded evidence hard-
// fail regardless of the prose score — quality can't average away a reliability bug.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const [, , reportPath, artifactsDir] = process.argv;
if (!reportPath) { console.error('usage: node score.mjs <report.md> <artifacts/<host>> [--panel N] [--images] [--no-judge]'); process.exit(1); }
const noJudge = process.argv.includes('--no-judge');
const here = dirname(new URL(import.meta.url).pathname);

function runJSON(script, args) {
  try { return JSON.parse(execFileSync('node', [join(here, script), ...args], { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'inherit'] })); }
  catch (e) { return { _error: e.message }; }
}

console.error('[score] running deterministic checks…');
const checks = runJSON('checks.mjs', [reportPath, artifactsDir].filter(Boolean));

let judge = null;
if (!noJudge) {
  console.error('[score] running LLM judge panel…');
  const panelArgs = [];
  const pi = process.argv.indexOf('--panel');
  if (pi > -1) panelArgs.push('--panel', process.argv[pi + 1]);
  if (process.argv.includes('--images')) panelArgs.push('--images');
  judge = runJSON('judge.mjs', [reportPath, artifactsDir, ...panelArgs].filter(Boolean));
  if (judge && judge._error) { console.error('[score] judge unavailable:', judge._error); judge = null; }
}

const det = checks.deterministic_score ?? 0;
const judgeNorm = judge?.judge_score_normalized ?? null;
const composite = judgeNorm == null
  ? Math.round(det * 1000) / 1000
  : Math.round((0.45 * det + 0.55 * judgeNorm) * 1000) / 1000;

// --- promotion gate (the reliability contract) -----------------------------
const reasons = [];
if ((checks.critical_count ?? 0) > 0) reasons.push(`${checks.critical_count} critical structural defect(s)`);
if ((checks.grounding_rate ?? 0) < 0.95) reasons.push(`grounding_rate ${checks.grounding_rate} < 0.95`);
if (judge && (judge.claim_support_rate ?? 1) < 0.8) reasons.push(`judge claim_support_rate ${judge.claim_support_rate} < 0.8`);
if (composite < 0.7) reasons.push(`composite ${composite} < 0.7`);
const gate_pass = reasons.length === 0;

const scorecard = {
  report: reportPath,
  artifacts: artifactsDir || null,
  composite_score: composite,
  gate_pass,
  gate_failures: reasons,
  deterministic: {
    score: det, critical_count: checks.critical_count, grounding_rate: checks.grounding_rate,
    pillar_counts: checks.pillar_counts, dimension_scores: checks.dimension_scores,
    deficiencies: checks.deficiencies,
  },
  judge: judge || { skipped: true, reason: noJudge ? '--no-judge' : 'no API key / unavailable' },
};

const host = artifactsDir ? basename(artifactsDir) : basename(reportPath).replace(/\.md$/, '');
const outDir = 'eval/scorecards';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${host}.json`);
writeFileSync(outPath, JSON.stringify(scorecard, null, 2));

console.log(JSON.stringify({
  host, composite_score: composite, gate_pass, gate_failures: reasons,
  deterministic_score: det, grounding_rate: checks.grounding_rate, critical_count: checks.critical_count,
  judge: judge ? { normalized: judgeNorm, claim_support_rate: judge.claim_support_rate, high_variance: judge.high_variance, top_weaknesses: judge.top_weaknesses } : 'skipped',
  scorecard: outPath,
}, null, 2));
