# Qosmic audit LLM-judge rubric (reference-free)

The judge scores an audit report **without a golden answer**, so it generalizes
to stores never seen. It grades quality the deterministic checks can't:
whether claims are true to the evidence, whether insights are real, and whether
the report is store-specific rather than boilerplate.

The judge is given: the report, the crawl `manifest.json`, and the extracted
page text for the surfaces the report cites (and, when `--images` is set, the
cited screenshots). It must verify claims against that evidence, not its own
priors.

## Dimensions (score each 1–5; 5 = excellent)

1. **evidence_specificity** — Does each experiment's hypothesis reference
   something *actually present* in the cited artifact (page text/screenshot)?
   5 = every claim is verifiable in the evidence; 1 = claims are generic or
   contradicted by the evidence. This is the anti-hallucination dimension.

2. **insight_quality** — Are the leaks real, non-obvious, and correctly
   prioritized? 5 = identifies the genuine biggest constraint and sharp
   secondary leaks; 1 = surface-level or wrong priorities.

3. **actionability** — Is each `primary change` concrete and shippable, with a
   sensible KPI, guardrailed decision rule, and calibrated confidence/lift?
   5 = an engineer could build it tomorrow; 1 = vague.

4. **anti_genericness** — Would this experiment apply to *any* store (bad) or is
   it specific to *this* one (good)? 5 = clearly tailored to this store's
   catalog/positioning/leaks; 1 = could be copy-pasted to any storefront. This
   is the key generalization signal — punish boilerplate hard.

5. **exec_summary** — Is the summary sharp, specific prose that names the real
   top constraint? 5 = could brief a founder in 30 seconds; 1 = filler.

6. **competitor_quality** — Are competitors real, well-chosen, and each tied to
   a transferable, store-relevant move? 5 = sharp and actionable; 1 = padded.

## Per-experiment verification
For each of the 10 experiments, return `{exp_id, claim_supported: true|false,
note}`. `claim_supported=false` when the hypothesis asserts something not found
in (or contradicted by) the cited evidence. The share of supported claims is the
judge's hard grounding signal, complementing the deterministic path check.

## Output (strict JSON)
```json
{
  "scores": {"evidence_specificity":4,"insight_quality":4,"actionability":4,
             "anti_genericness":4,"exec_summary":4,"competitor_quality":4},
  "verifications": [{"exp_id":"exp-...","claim_supported":true,"note":"..."}],
  "top_weaknesses": ["...", "..."],
  "would_pass_for_merchant": true
}
```

## Calibration & anti-gaming
- `target_report.md` (gingerpeople) is the calibration anchor: in calibration
  mode the judge's scores must track it. It is NOT used at scoring time for other
  stores — scoring stays reference-free.
- Bias guards: ignore length and prose flourish; reward specificity and evidence
  fidelity. A short, sharp, fully-grounded report should outscore a long vague
  one. Verbosity is not quality.
- Run a panel (N≥3) and average to reduce single-judge variance; report the
  spread so high-variance reports get flagged for human review.
