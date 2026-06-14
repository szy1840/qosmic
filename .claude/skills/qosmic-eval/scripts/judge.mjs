#!/usr/bin/env node
// Qosmic eval — reference-free multimodal LLM judge.
//
//   node judge.mjs <report.md> <artifacts/<host>> [--panel 3]
//
// Scores the quality dimensions deterministic checks can't (rubric.md): evidence
// fidelity, insight, actionability, anti-genericness, exec sharpness, competitor
// quality. Verifies each experiment's hypothesis against the *actual* cited page
// text. Runs a panel of N judges and averages to cut single-judge variance.
//
// Needs ANTHROPIC_API_KEY (read from env or ./.env). Reference-free, so it
// generalizes to stores never seen.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , reportPath, artifactsDir] = process.argv;
const panelIdx = process.argv.indexOf('--panel');
const PANEL = panelIdx > -1 ? +process.argv[panelIdx + 1] : 3;
const USE_IMAGES = process.argv.includes('--images');
const MAX_IMAGES = 6;
const MODEL = process.env.JUDGE_MODEL || 'claude-opus-4-8';
if (!reportPath) { console.error('usage: node judge.mjs <report.md> <artifacts/<host>> [--panel N] [--images]'); process.exit(1); }

// --- API key (handles ".env" with "ANTHROPIC_API_KEY = ..." spacing) --------
function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  if (existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/ANTHROPIC_API_KEY\s*=\s*("?)([^"\n]+)\1/);
    if (m) return m[2].trim();
  }
  return null;
}
const KEY = apiKey();
if (!KEY) { console.error('No ANTHROPIC_API_KEY (env or .env). Use the qosmic-eval skill for a keyless agent-run judge.'); process.exit(2); }

const md = readFileSync(reportPath, 'utf8');

// Gather the page text for surfaces the report cites, so the judge verifies
// claims against real evidence rather than its own priors.
let evidence = '';
if (artifactsDir && existsSync(join(artifactsDir, 'manifest.json'))) {
  const man = JSON.parse(readFileSync(join(artifactsDir, 'manifest.json'), 'utf8'));
  for (const s of man.surfaces) {
    if (s.text && existsSync(s.text)) {
      const cited = md.includes(s.id) || (s.url && md.includes(s.url));
      if (cited) evidence += `\n\n### EVIDENCE [${s.id}] ${s.url} (${s.source})\n${readFileSync(s.text, 'utf8').slice(0, 2000)}`;
    }
  }
  // Tech-check and screenshot-derived claims (structured data, image opt, page
  // status) are grounded in tech_signals.json, not page text — include it so the
  // judge can verify those too. (Screenshot pixels still need --images; documented.)
  const tsPath = join(artifactsDir, 'tech_signals.json');
  if (existsSync(tsPath)) evidence += `\n\n### EVIDENCE [tech_signals.json]\n${readFileSync(tsPath, 'utf8').slice(0, 3000)}`;
}

// --- multimodal: attach cited screenshots so the judge verifies VISUAL claims
// (dead "SOLD OUT" button, missing buy box, blank tiles) against pixels, not just
// text. Full-page PNGs are huge and the API squishes a 14000px-tall image to
// nothing, so we downscale + clip to the decision area (top ~2600px) as compact
// JPEGs via Playwright — no new deps, stays under the API's per-image limit.
let imageBlocks = [];
async function prepImages() {
  if (!USE_IMAGES || !artifactsDir || !existsSync(join(artifactsDir, 'manifest.json'))) return;
  const man = JSON.parse(readFileSync(join(artifactsDir, 'manifest.json'), 'utf8'));
  const cited = man.surfaces
    .filter((s) => s.screenshot && existsSync(s.screenshot) && (md.includes(s.id) || (s.url && md.includes(s.url))))
    .slice(0, MAX_IMAGES);
  if (!cited.length) return;
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { console.error('[judge] --images needs playwright; skipping images'); return; }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 2000 } });
  for (const s of cited) {
    try {
      const abs = s.screenshot.startsWith('/') ? s.screenshot : join(process.cwd(), s.screenshot);
      // Inline the PNG as a data-URI (file:// subresources are blocked from an
      // about:blank document → blank crops), scale to 1100px wide, and wait for
      // the image to actually decode before screenshotting the top region.
      const pngB64 = readFileSync(abs).toString('base64');
      await page.setContent(`<body style="margin:0"><img src="data:image/png;base64,${pngB64}" style="width:1100px;display:block"></body>`);
      await page.waitForFunction(() => { const i = document.querySelector('img'); return i && i.complete && i.naturalWidth > 0; }, { timeout: 20000 });
      const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
      imageBlocks.push({
        label: s.id,
        block: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
      });
    } catch (e) { console.error(`[judge] image prep failed for ${s.id}: ${e.message}`); }
  }
  await browser.close();
  console.error(`[judge] attached ${imageBlocks.length} screenshot(s) for visual verification`);
}
await prepImages();

const RUBRIC = `You are a strict, reference-free evaluator of e-commerce CRO audit reports produced by an automated audit agent. You do NOT have a golden answer — judge quality on its own terms and against the EVIDENCE provided: extracted page text + tech signals the report cites${imageBlocks.length ? ', AND the attached screenshots (decision-area crops of the cited pages)' : ''}.
${imageBlocks.length ? 'For any VISUAL claim (a missing/ambiguous buy box, a dead "SOLD OUT" button, missing reviews, blank/broken image tiles, layout problems), VERIFY it against the attached screenshots — mark claim_supported=false if the screenshot contradicts or does not show what the hypothesis asserts.\n' : ''}

Score each dimension 1-5 (5=excellent):
- evidence_specificity: does each experiment's hypothesis reference something actually present in the cited evidence? Punish claims not supported by (or contradicting) the evidence.
- insight_quality: are the leaks real, non-obvious, correctly prioritized?
- actionability: is each primary change concrete/shippable with a sensible KPI, guardrailed decision rule, calibrated confidence/lift?
- anti_genericness: is each experiment specific to THIS store (5) or boilerplate that fits any store (1)? Punish generic CRO advice hard.
- exec_summary: sharp, specific prose naming the real top constraint (5) vs filler (1).
- competitor_quality: real, well-chosen competitors each tied to a transferable, store-relevant move.

Then verify EACH experiment: claim_supported true only if its hypothesis is corroborated by the cited evidence. Ignore length/prose flourish — reward specificity and evidence fidelity; a short grounded report beats a long vague one.`;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    scores: {
      type: 'object', additionalProperties: false,
      properties: {
        evidence_specificity: { type: 'integer' }, insight_quality: { type: 'integer' },
        actionability: { type: 'integer' }, anti_genericness: { type: 'integer' },
        exec_summary: { type: 'integer' }, competitor_quality: { type: 'integer' },
      },
      required: ['evidence_specificity', 'insight_quality', 'actionability', 'anti_genericness', 'exec_summary', 'competitor_quality'],
    },
    verifications: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { exp_id: { type: 'string' }, claim_supported: { type: 'boolean' }, note: { type: 'string' } },
        required: ['exp_id', 'claim_supported', 'note'],
      },
    },
    top_weaknesses: { type: 'array', items: { type: 'string' } },
    would_pass_for_merchant: { type: 'boolean' },
  },
  required: ['scores', 'verifications', 'top_weaknesses', 'would_pass_for_merchant'],
};

function userContent(i) {
  const text = `Evaluate this audit report. Judge #${i + 1}.\n\n===== REPORT =====\n${md}\n\n===== CITED EVIDENCE (crawl page text) =====${evidence || '\n(none provided)'}\n\nReturn the JSON scorecard.`;
  if (!imageBlocks.length) return text;
  // text first, then each screenshot labelled with the surface id it depicts
  const content = [{ type: 'text', text }];
  content.push({ type: 'text', text: '\n===== ATTACHED SCREENSHOTS (decision-area crops) =====' });
  for (const im of imageBlocks) { content.push({ type: 'text', text: `Screenshot of surface [${im.label}]:` }); content.push(im.block); }
  return content;
}

async function judgeOnce(i) {
  const body = {
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    system: RUBRIC,
    messages: [{ role: 'user', content: userContent(i) }],
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 3000 * (attempt + 1))); continue; }
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      return JSON.parse(text);
    } catch (e) { if (attempt === 2) { console.error(`judge #${i + 1} failed: ${e.message}`); return null; } await new Promise((s) => setTimeout(s, 2000)); }
  }
  return null;
}

const panel = (await Promise.all(Array.from({ length: PANEL }, (_, i) => judgeOnce(i)))).filter(Boolean);
if (!panel.length) { console.error('all judges failed'); process.exit(3); }

const DIMS = ['evidence_specificity', 'insight_quality', 'actionability', 'anti_genericness', 'exec_summary', 'competitor_quality'];
const avg = (xs) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
const meanScores = Object.fromEntries(DIMS.map((d) => [d, avg(panel.map((p) => p.scores[d]))]));
const spread = Object.fromEntries(DIMS.map((d) => [d, Math.max(...panel.map((p) => p.scores[d])) - Math.min(...panel.map((p) => p.scores[d]))]));
const overall5 = avg(DIMS.map((d) => meanScores[d]));

// Per-experiment support: majority vote across panel.
const expIds = [...new Set(panel.flatMap((p) => p.verifications.map((v) => v.exp_id)))];
const verifications = expIds.map((id) => {
  const votes = panel.flatMap((p) => p.verifications.filter((v) => v.exp_id === id).map((v) => v.claim_supported));
  const supported = votes.filter(Boolean).length >= Math.ceil(votes.length / 2);
  const note = panel.flatMap((p) => p.verifications.filter((v) => v.exp_id === id && !v.claim_supported).map((v) => v.note))[0] || '';
  return { exp_id: id, claim_supported: supported, note: supported ? '' : note };
});
const claimSupportRate = verifications.length ? verifications.filter((v) => v.claim_supported).length / verifications.length : 0;

const out = {
  model: MODEL,
  panel_size: panel.length,
  images_attached: imageBlocks.length,
  judge_scores_5pt: meanScores,
  judge_score_normalized: Math.round((overall5 / 5) * 1000) / 1000,
  score_spread: spread,
  high_variance: Object.values(spread).some((s) => s >= 2),
  claim_support_rate: Math.round(claimSupportRate * 1000) / 1000,
  unsupported_claims: verifications.filter((v) => !v.claim_supported),
  would_pass_for_merchant_votes: panel.filter((p) => p.would_pass_for_merchant).length + '/' + panel.length,
  top_weaknesses: [...new Set(panel.flatMap((p) => p.top_weaknesses))].slice(0, 8),
};
console.log(JSON.stringify(out, null, 2));
