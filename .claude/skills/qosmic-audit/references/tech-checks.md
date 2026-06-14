# Technical checks — deriving each row from tech_signals.json

Read `artifacts/<host>/tech_signals.json`. Map each field to a row with status
**Pass / Warn / Fail** and a one-line factual detail. Never invent a Pass —
if a field is `not_assessable: true` (archived crawl), use **Warn** and say why.

| Row | Source field | Pass | Warn | Fail |
|---|---|---|---|---|
| SSL Certificate | `ssl` | `ok:true` | `not_assessable` | `ok:false` |
| HTTPS Redirect | `https_redirect` | `ok:true` | `not_assessable` / inferred | http didn't redirect to https |
| Sitemap | `sitemap` | `ok:true`, `url_count>0` | `not_assessable` | status ≥400 / missing |
| Robots.txt | `robots` | `ok:true` | `not_assessable` | status ≥400 / missing |
| Critical Pages Loading | `critical_pages` | all key kinds 200 | some non-200 / archived | home or PDP failed |
| Meta Tags & Social Previews | `meta` | title + description + og present on home/PDP | partial (e.g. no og) | missing titles |
| Structured Data | `structured_data` | JSON-LD with Product/Org on PDP/home | none found | — (absence is Warn, not Fail) |
| Favicon | `favicon` | `true` | `false` (Warn) | — |
| Mobile-Friendly | `mobile_friendly` | `viewport_meta:true` + mobile shot captured | shot only / archived | no viewport meta |
| Page Speed (Mobile) | `page_speed` + mobile timing | load < 4000ms | proxy only / archived (`not_assessable`) | load > 8000ms |
| Page Speed (Desktop) | `page_speed` home timing | load < 3000ms | proxy only / archived | load > 6000ms |
| Broken Links | `broken_links` | empty | archived (not checked) | any 4xx/5xx found — list them |
| Image Optimization | `images` | mostly modern fmt, dims set | many missing dims / few modern fmt | — |
| Cookie/Privacy | `cookie_privacy` | consent banner + privacy link | privacy link only | neither |
| Checkout Reachable | `checkout` / cart surface | cart 200 + reachable | archived / unknown | cart 404 / error |

## Rules
- **page_speed** numbers are navigation-timing proxies, not Lighthouse. In
  `wayback` mode they reflect the archive, not the live site → mark **Warn** and
  say "navigation-timing proxy / archived; no Lighthouse run".
- **Structured Data absence** is a real Acquisition opportunity — note it Warn
  and consider it for a Performance/Acquisition experiment.
- Keep details factual and one line. Cite the number you saw (e.g. "sitemap.xml
  200 with 142 <loc> entries", "/cart returned 404").
- If `mode:wayback`, add to the Critical Pages / Checkout details that the live
  edge blocked automated access and evidence is from the archived snapshot.
