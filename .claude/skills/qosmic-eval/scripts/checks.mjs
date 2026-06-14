#!/usr/bin/env node
// Qosmic eval — deterministic, reference-free checks.
//
//   node checks.mjs <report.md> <artifacts/<host>>
//
// Scores schema conformance, pillar diversity, evidence grounding, and value
// sanity WITHOUT any golden reference, so it works on stores never seen before.
// Emits a structured object (stdout JSON) whose `deficiencies[]` are
// machine-readable and feed the self-improving loop.

import { readFileSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

const [, , reportPath, artifactsDir] = process.argv;
if (!reportPath) { console.error('usage: node checks.mjs <report.md> [artifacts/<host>]'); process.exit(1); }
const md = readFileSync(reportPath, 'utf8');
const PILLARS = ['Conversion', 'AOV', 'Retention', 'Acquisition', 'Performance'];

const deficiencies = [];
const flag = (dim, msg, severity = 'major') => deficiencies.push({ dim, severity, msg });

// ---- sections -------------------------------------------------------------
const sections = {
  exec: /(^|\n)##\s+Executive summary/i.test(md),
  experiments: /(^|\n)##\s+Proposed experiments/i.test(md),
  competitors: /(^|\n)##\s+Competitor analysis/i.test(md),
  technical: /(^|\n)##\s+Technical checks/i.test(md),
};
for (const [k, v] of Object.entries(sections)) if (!v) flag('schema', `missing section: ${k}`);

// ---- experiments ----------------------------------------------------------
const expBlocks = md.split(/(?=^###\s+exp-)/m).filter((b) => /^###\s+exp-/.test(b));
const FIELDS = ['Pillar', 'Affected surface', 'URL', 'Evidence', 'Hypothesis', 'Primary change', 'Primary KPI', 'Decision rule', 'Expected lift', 'Confidence'];
const experiments = expBlocks.map((b) => {
  const idMatch = b.match(/^###\s+(exp-[0-9a-f]{6,})\b/m);
  const get = (f) => { const m = b.match(new RegExp(`\\*\\*${f}:\\*\\*\\s*([^\\n]+)`, 'i')); return m ? m[1].trim() : null; };
  const fields = Object.fromEntries(FIELDS.map((f) => [f, get(f)]));
  return { id: idMatch ? idMatch[1] : null, idValid: !!idMatch && /^exp-[0-9a-f]{12}$/.test(idMatch[1]), fields, raw: b };
});

if (experiments.length !== 10) flag('schema', `expected 10 experiments, found ${experiments.length}`, 'critical');
experiments.forEach((e, i) => {
  for (const f of FIELDS) if (!e.fields[f]) flag('schema', `exp #${i + 1} (${e.id || '?'}) missing field: ${f}`);
  if (!e.idValid) flag('schema', `exp #${i + 1} has invalid/missing exp-id (need 12 hex)`);
});
const ids = experiments.map((e) => e.id).filter(Boolean);
if (new Set(ids).size !== ids.length) flag('schema', 'duplicate exp-ids');

// ---- pillar diversity -----------------------------------------------------
const pillarCounts = Object.fromEntries(PILLARS.map((p) => [p, 0]));
experiments.forEach((e) => { const p = PILLARS.find((P) => (e.fields.Pillar || '').toLowerCase().includes(P.toLowerCase())); if (p) pillarCounts[p]++; });
const missingPillars = PILLARS.filter((p) => pillarCounts[p] === 0);
const overloaded = PILLARS.filter((p) => pillarCounts[p] > 4);
missingPillars.forEach((p) => flag('diversity', `pillar not represented: ${p}`, 'critical'));
overloaded.forEach((p) => flag('diversity', `pillar overloaded (>4): ${p}`));

// ---- evidence grounding ---------------------------------------------------
let manifestUrls = new Set();
let manifestFiles = new Set();
if (artifactsDir && existsSync(join(artifactsDir, 'manifest.json'))) {
  const man = JSON.parse(readFileSync(join(artifactsDir, 'manifest.json'), 'utf8'));
  man.surfaces.forEach((s) => {
    if (s.url) manifestUrls.add(s.url.replace(/\/$/, ''));
    [s.screenshot, s.mobile_screenshot, s.html, s.text].forEach((f) => f && manifestFiles.add(f));
  });
}
const repoRoot = process.cwd();
let evTotal = 0, evGrounded = 0;
experiments.forEach((e) => {
  const ev = (e.fields.Evidence || '') + ' ' + (e.fields.URL || '');
  const paths = [...ev.matchAll(/`?(artifacts\/[^\s`)]+)`?/g)].map((m) => m[1]);
  const urls = [...ev.matchAll(/https?:\/\/[^\s`)]+/g)].map((m) => m[0].replace(/\/$/, ''));
  const isNew = /\(new\)|\bnew\b/i.test(e.fields.URL || '') || /\bnew\b/i.test(e.fields['Affected surface'] || '');
  // artifact paths must exist on disk
  for (const p of paths) {
    evTotal++;
    const abs = isAbsolute(p) ? p : join(repoRoot, p);
    if (existsSync(abs)) evGrounded++;
    else flag('grounding', `${e.id}: evidence path does not exist: ${p}`, 'critical');
  }
  // URLs should be crawled surfaces (unless the experiment proposes a NEW page)
  for (const u of urls) {
    evTotal++;
    if (manifestUrls.has(u) || manifestFiles.size === 0) evGrounded++;
    else if (isNew) evGrounded++; // proposing a new page is legitimately uncrawled
    else { evGrounded += 0.5; flag('grounding', `${e.id}: URL not in crawl manifest (unverified): ${u}`, 'minor'); }
  }
  if (paths.length === 0 && urls.length === 0) flag('grounding', `${e.id}: no citable evidence path or URL`, 'critical');
});
const groundingRate = evTotal ? evGrounded / evTotal : 0;

// ---- value sanity ---------------------------------------------------------
experiments.forEach((e) => {
  const conf = (e.fields.Confidence || '').match(/(\d{1,3})\s*%/);
  if (!conf) flag('sanity', `${e.id}: confidence not a percentage`);
  else if (+conf[1] < 0 || +conf[1] > 100) flag('sanity', `${e.id}: confidence out of range`);
  if (!/[+]?\d+\s*[–-]\s*\d+\s*%/.test(e.fields['Expected lift'] || '')) flag('sanity', `${e.id}: expected lift not a well-formed range`);
  if (!/ship if/i.test(e.fields['Decision rule'] || '')) flag('sanity', `${e.id}: decision rule missing a 'ship if' condition`, 'minor');
});

// ---- competitor + technical tables ---------------------------------------
const compSection = md.split(/##\s+Competitor analysis/i)[1]?.split(/\n##\s/)[0] || '';
const compRows = (compSection.match(/^\|.*\|$/gm) || []).filter((r) => !/^\|\s*-+/.test(r) && !/Competitor\s*\|/i.test(r));
if (compRows.length < 3 || compRows.length > 5) flag('competitors', `competitor rows = ${compRows.length} (want 3-4)`);

const techSection = md.split(/##\s+Technical checks/i)[1] || '';
const techRows = (techSection.match(/^\|.*\|$/gm) || []).filter((r) => !/^\|\s*-+/.test(r) && !/^\|\s*Check\s*\|/i.test(r));
if (techRows.length < 12) flag('technical', `technical-check rows = ${techRows.length} (want ~15)`);
const badStatus = techRows.filter((r) => !/\|\s*(Pass|Warn|Fail)\s*\|/i.test(r));
if (badStatus.length) flag('technical', `${badStatus.length} technical rows lack a Pass/Warn/Fail status`);

// ---- exec summary ---------------------------------------------------------
const execText = (md.split(/##\s+Executive summary/i)[1] || '').split(/\n##\s/)[0];
const words = execText.trim().split(/\s+/).length;
if (words < 120) flag('exec', `executive summary thin (${words} words)`, 'minor');
if (!/\*\*[^*]+\*\*/.test(execText)) flag('exec', 'executive summary lacks a bolded thesis sentence', 'minor');

// ---- scoring --------------------------------------------------------------
const dimScore = {
  schema: clamp(1 - deficiencies.filter((d) => d.dim === 'schema').length * 0.2),
  diversity: clamp(1 - missingPillars.length * 0.3 - overloaded.length * 0.15),
  grounding: round(groundingRate),
  sanity: clamp(1 - deficiencies.filter((d) => d.dim === 'sanity').length * 0.08),
  competitors: compRows.length >= 3 && compRows.length <= 5 ? 1 : 0.4,
  technical: clamp((Math.min(techRows.length, 15) / 15) - badStatus.length * 0.1),
  exec: clamp(1 - deficiencies.filter((d) => d.dim === 'exec').length * 0.25),
};
const weights = { schema: 0.22, diversity: 0.16, grounding: 0.28, sanity: 0.1, competitors: 0.08, technical: 0.1, exec: 0.06 };
const criticalCount = deficiencies.filter((d) => d.severity === 'critical').length;
// Each critical deficiency (missing pillar, broken evidence, wrong count) is a
// reliability failure — apply a hard multiplicative penalty so the gate can't be
// passed by averaging away a structural defect.
const rawScore = Object.entries(weights).reduce((s, [k, w]) => s + w * dimScore[k], 0);
const deterministicScore = round(rawScore * Math.pow(0.8, criticalCount));

function clamp(x) { return round(Math.max(0, Math.min(1, x))); }
function round(x) { return Math.round(x * 1000) / 1000; }

const result = {
  report: reportPath,
  artifacts: artifactsDir || null,
  experiment_count: experiments.length,
  pillar_counts: pillarCounts,
  grounding_rate: round(groundingRate),
  evidence_items: { total: evTotal, grounded: round(evGrounded) },
  competitor_rows: compRows.length,
  technical_rows: techRows.length,
  dimension_scores: dimScore,
  deterministic_score: deterministicScore,
  critical_count: criticalCount,
  deficiencies,
};
console.log(JSON.stringify(result, null, 2));
