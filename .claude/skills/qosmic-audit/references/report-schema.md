# Canonical audit report schema

The report is one Markdown file with exactly four sections in this order. Match
the shape of `target_report.md`. Output to the path given by the harness
(default `sample_output/<host>.md`).

---

## 1. Title + Executive summary

- **Title (`# `)**: one sharp line naming the single biggest constraint, in the
  voice of `target_report.md` (e.g. "the store is back; the buy path is now the
  constraint"). Not "Audit of X".
- **2–3 prose paragraphs.** The highest-level read on what is costing the store
  sales *right now*. Each paragraph leads with a **bolded thesis sentence**.
  Reference concrete, observed specifics (proof points, counts, exact surfaces)
  — never generic CRO platitudes. End by naming what the first test should be.

## 2. Proposed experiments (exactly 10)

Each experiment is a `### ` block with an `exp-<12 hex>` id in the heading:

```
### exp-<12hexchars> — <Imperative title>

**Pillar:** Conversion | AOV | Retention | Acquisition | Performance
**Affected surface:** <human surface, e.g. "GIN GINS Original PDP">
**URL:** <canonical store URL of the surface>
**Evidence:** <artifact path under artifacts/... OR a URL that was crawled>
**Hypothesis:** <what improves and *why*, grounded in the cited artifact — 2-3 sentences>
**Primary change:** <the concrete control→variant change, shippable>
**Primary KPI:** <one metric>
**Decision rule:** Ship if <KPI moves> without hurting <guardrail metric>.
**Expected lift:** +<low>–<high>%
**Confidence:** <40-90>%
```

Hard requirements (the eval enforces these):
- **Exactly 10** experiments.
- **All 5 pillars present.** Aim ~2 each; never more than 4 of one pillar.
- **Every `Evidence:` value must resolve** to a real file in the run's
  `artifacts/<host>/` tree, or to a URL listed in `manifest.json` surfaces.
  No invented paths. This is the anti-hallucination contract.
- **The hypothesis must reference what is actually visible** in the cited
  artifact. If you can't see it in the screenshot/text, don't claim it.
- exp-id: 12 hex chars, unique per experiment.
- Confidence 40–90 (be honest; reserve >85 for near-certain structural fixes).
- Expected lift is a *range*; wider range = lower confidence.

## 3. Competitor analysis

One lead sentence, then a table of **3–4 competitors**:

```
| Competitor | Domain | Positioning | What they make easier | <Store> edge | Pattern to adapt |
|---|---|---|---|---|---|
```

Competitors are inferred from the store's category (see
`competitor-method.md`) and found via web search — not hardcoded. Each row's
"pattern to adapt" must connect to a specific opportunity on the audited store.

## 4. Technical checks

A table of ~15 standard checks, each Pass / Warn / Fail + one-line detail.
Derive every row from `tech_signals.json` per `tech-checks.md`. Required rows:
SSL, HTTPS Redirect, Sitemap, Robots.txt, Critical Pages Loading, Meta Tags &
Social Previews, Structured Data, Favicon, Mobile-Friendly, Page Speed (Mobile),
Page Speed (Desktop), Broken Links, Image Optimization, Cookie/Privacy,
Checkout Reachable.

```
| Check | Status | Detail |
|---|---|---|
```

---

## Provenance footer (required)

End the report with a one-line footer stating crawl mode and, if applicable, the
Wayback snapshot used — e.g.:

```
> Crawl: wayback snapshot 20260422074251 (live edge blocked by Cloudflare). Evidence paths under artifacts/<host>/.
```

This keeps the report honest about whether evidence is live or archived.
