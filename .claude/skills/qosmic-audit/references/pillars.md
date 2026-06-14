# The five pillars — definitions + leak patterns

Your 10 experiments must span all five. Use this to force diversity and to ask
the right question per pillar. These are *prompts for looking*, not a checklist
to copy — every experiment must come from something you actually observed in the
artifacts.

## Conversion — turning visits into orders
The buy path itself. Look for: missing/ambiguous buying module on PDPs, unclear
primary CTA, dead or empty key surfaces (cart, where-to-buy, locator), choice
overload on collection/products grids, weak homepage entry, trust gaps at the
decision moment (reviews/proof present but not near the CTA).

## AOV — order value per checkout
More value per order. Look for: no bundles/kits for complementary SKUs, no
sampler/variety entry for catalogs with many flavors/variants, no quantity or
subscribe-and-save, no cross-sell on PDP/cart, free-shipping threshold absent or
invisible, premium tiers not merchandised.

## Retention — repeat purchase & lifetime value
Bringing buyers back. Look for: consumable products with no subscription/reorder,
no post-purchase routine/replenishment story, no email/SMS capture with a reason,
no loyalty/referral, content that creates a recurring need but no reorder path
attached (e.g. a condition-management article with no "make this a routine").

## Acquisition — getting the right visitors to land & convert
New-visitor capture & intent matching. Look for: high-intent use cases with no
dedicated landing page, content moat (recipes/education) not routed to product,
no need-finder/quiz to match newcomers to the right SKU, weak meta/social
previews suppressing CTR, symptom/job-to-be-done intent dispersed across pages.

## Performance — technical health that gates revenue
Speed, reachability, correctness. Look for: broken/404 critical URLs, slow
mobile/desktop loads, heavy unoptimized images, missing structured data hurting
rich results, render-blocking or layout-shift on key templates, checkout/cart
reachability failures. Ground these in `tech_signals.json`.

---

### Balancing rule
Target ~2 experiments per pillar. If a pillar is genuinely thin for this store,
3 in a strong pillar + 1 in the thin one is acceptable — but never 0 in any
pillar, and never more than 4 in one. The eval scores pillar coverage.

### Quality bar per experiment
- One specific observed leak → one testable change. No "improve the homepage".
- Hypothesis names the mechanism *and* the evidence ("PDP has 86 reviews but no
  visible add-to-cart in the captured buying area" → ambiguity at decision).
- Decision rule always has a guardrail (don't win the KPI by hurting another).
- Confidence reflects evidence strength, not enthusiasm.
