#!/usr/bin/env node
// Qosmic runtime harness — deterministic crawl phase.
//
//   node crawl.mjs <storefront-url> [--out artifacts]
//
// Input : a single Shopify storefront URL. Nothing else.
// Output: artifacts/<host>/ containing, for a representative surface set,
//         desktop + mobile screenshots, rendered HTML, extracted text, plus a
//         tech_signals.json and a manifest.json index that the reasoning phase
//         cites from. No store-specific logic lives here — surfaces are
//         discovered structurally so the crawl generalizes to any Shopify store.

import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error('usage: node crawl.mjs <storefront-url> [--out dir]');
  process.exit(1);
}
const outFlag = process.argv.indexOf('--out');
const OUT_ROOT = outFlag > -1 ? process.argv[outFlag + 1] : 'artifacts';

const base = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
const HOST = base.hostname.replace(/^www\./, '');
const RUN_DIR = join(OUT_ROOT, HOST);
const SHOTS = join(RUN_DIR, 'screenshots');
const PAGES = join(RUN_DIR, 'pages');
await mkdir(SHOTS, { recursive: true });
await mkdir(PAGES, { recursive: true });

const log = (...a) => console.error('[crawl]', ...a);
const slug = (s) =>
  s.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
const sameHost = (u) => {
  try { return new URL(u, base).hostname.replace(/^www\./, '') === HOST; } catch { return false; }
};

// Wayback fallback: many storefronts sit behind Cloudflare/Akamai bot walls that
// block automated browsers entirely. Rather than fail, fall back to the most
// recent Internet Archive snapshot — a legitimate, citable artifact source.
let MODE = 'live';
let WB_TS = null;
const wbReplay = (u, raw = false) => `https://web.archive.org/web/${WB_TS}${raw ? 'id_' : ''}/${u}`;

const browser = await chromium.launch();
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});
const mobile = await browser.newContext({ ...devices['iPhone 13'] });

// context.request reuses cookies from the JS-challenge pass, so text probes
// (robots, sitemap, products.json) get through bot walls that block bare curl.
const api = desktop.request;

const manifest = { url: base.href, host: HOST, started: new Date().toISOString(), surfaces: [] };

async function capture(kind, url, { withMobile = false } = {}) {
  const id = `${kind}-${slug(url.replace(base.origin, '')) || 'home'}`;
  const fetchUrl = MODE === 'wayback' ? wbReplay(url) : url;
  const rec = { id, kind, url, fetch_url: fetchUrl, source: MODE, snapshot_ts: WB_TS, status: null, title: null, screenshot: null, mobile_screenshot: null, html: null, text: null };
  const page = await desktop.newPage();
  try {
    // Wayback throttles with ERR_HTTP2_SERVER_REFUSED_STREAM; retry with backoff.
    let resp = null, lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { resp = await page.goto(fetchUrl, { waitUntil: 'domcontentloaded', timeout: MODE === 'wayback' ? 60000 : 45000 }); lastErr = null; break; }
      catch (e) { lastErr = e; if (!/REFUSED_STREAM|ERR_HTTP2|Timeout|ERR_NETWORK/.test(e.message)) throw e; await page.waitForTimeout(4000 * (attempt + 1)); }
    }
    if (lastErr) throw lastErr;
    rec.status = resp ? resp.status() : null;
    await page.waitForTimeout(2500); // let lazy hero / above-the-fold settle
    rec.title = await page.title();

    const shot = join(SHOTS, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => page.screenshot({ path: shot }));
    rec.screenshot = shot;

    const html = await page.content();
    const htmlPath = join(PAGES, `${id}.html`);
    await writeFile(htmlPath, html);
    rec.html = htmlPath;

    const text = await page.evaluate(() => document.body?.innerText || '');
    const textPath = join(PAGES, `${id}.txt`);
    await writeFile(textPath, text);
    rec.text = textPath;

    // page-level signals harvested while we're here
    rec.signals = await page.evaluate(() => {
      const metas = {};
      document.querySelectorAll('meta[name],meta[property]').forEach((m) => {
        const k = m.getAttribute('name') || m.getAttribute('property');
        if (k) metas[k] = m.getAttribute('content');
      });
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
        try { const j = JSON.parse(s.textContent); return j['@type'] || (Array.isArray(j) ? j.map((x) => x['@type']) : 'unknown'); }
        catch { return 'parse-error'; }
      });
      const imgs = [...document.images];
      return {
        meta_title: document.title,
        meta_description: metas['description'] || null,
        og_title: metas['og:title'] || null,
        og_image: metas['og:image'] || null,
        twitter_card: metas['twitter:card'] || null,
        viewport: metas['viewport'] || null,
        jsonld_types: ld,
        favicon: !!document.querySelector('link[rel~="icon"]'),
        img_count: imgs.length,
        img_missing_dims: imgs.filter((i) => !i.getAttribute('width') && !i.getAttribute('height')).length,
        img_modern_fmt: imgs.filter((i) => /\.(webp|avif)(\?|$)/i.test(i.currentSrc || i.src)).length,
        has_consent_banner: !!document.querySelector(
          '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i]'
        ),
        nav_anchors: [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: a.innerText.trim().slice(0, 60) })),
        nav_timing: (() => { const t = performance.getEntriesByType('navigation')[0]; return t ? { dcl: Math.round(t.domContentLoadedEventEnd), load: Math.round(t.loadEventEnd) } : null; })(),
      };
    });

    if (withMobile) {
      const mp = await mobile.newPage();
      try {
        await mp.goto(fetchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await mp.waitForTimeout(2000);
        const mshot = join(SHOTS, `${id}-mobile.png`);
        await mp.screenshot({ path: mshot, fullPage: true }).catch(() => mp.screenshot({ path: mshot }));
        rec.mobile_screenshot = mshot;
      } catch (e) { log('mobile fail', url, e.message); }
      finally { await mp.close(); }
    }
    log(`captured ${kind} ${url} [${rec.status}]`);
  } catch (e) {
    rec.error = e.message;
    log(`FAIL ${kind} ${url}: ${e.message}`);
  } finally {
    await page.close();
  }
  manifest.surfaces.push(rec);
  return rec;
}

// ---- 1. homepage (anchors the surface discovery) -------------------------
// Probe live first; if the edge blocks us, switch the whole run to Wayback.
async function liveReachable() {
  try {
    const r = await api.get(base.href, { timeout: 25000 });
    return r.status() < 400;
  } catch { return false; }
}
if (!(await liveReachable())) {
  log('live edge unreachable/blocked — resolving Wayback snapshot…');
  try {
    const r = await api.get(`https://archive.org/wayback/available?url=${HOST}`, { timeout: 30000 });
    const j = await r.json();
    WB_TS = j?.archived_snapshots?.closest?.timestamp;
    if (WB_TS) { MODE = 'wayback'; log(`using Wayback snapshot ${WB_TS}`); }
    else log('no Wayback snapshot found — proceeding live (will likely fail)');
  } catch (e) { log('wayback resolve failed', e.message); }
}

let home = await capture('home', base.href, { withMobile: true });
// Live navigation can also hang past the api probe; retry via Wayback once.
if ((home.error || (home.status && home.status >= 400)) && MODE === 'live') {
  try {
    const r = await api.get(`https://archive.org/wayback/available?url=${HOST}`, { timeout: 30000 });
    WB_TS = (await r.json())?.archived_snapshots?.closest?.timestamp;
    if (WB_TS) { MODE = 'wayback'; log(`live home failed — falling back to Wayback ${WB_TS}`); manifest.surfaces = []; home = await capture('home', base.href, { withMobile: true }); }
  } catch { /* give up, keep live result */ }
}
manifest.mode = MODE;
manifest.snapshot_ts = WB_TS;
const anchors = (home.signals?.nav_anchors || [])
  .map((a) => ({ ...a, href: MODE === 'wayback' ? unwrapWayback(a.href) : a.href }))
  .filter((a) => a.href && sameHost(a.href));

function unwrapWayback(u) {
  const m = /https?:\/\/web\.archive\.org\/web\/\d+(?:id_|if_)?\/(https?:\/\/.+)$/.exec(u);
  return m ? m[1] : u;
}

// In Wayback mode, the CDX index is a richer surface source than on-page anchors.
async function cdxList() {
  try {
    const c = await api.get(`https://web.archive.org/cdx/search/cdx?url=${HOST}*&output=json&limit=200&filter=statuscode:200&collapse=urlkey&from=2024`, { timeout: 45000 });
    const rows = await c.json();
    return rows.slice(1).map((r) => r[2]).filter((u) => sameHost(u));
  } catch (e) { log('cdx failed', e.message); return []; }
}
const cdxUrls = MODE === 'wayback' ? await cdxList() : [];
const LOCALE_RE = /^\/(de|fr|es|it|nl|ja|zh|pt|sv|da|no|fi|pl|ru|ko)(\/|$)/i;
// Rank candidate surfaces toward clean canonical English URLs: no query string,
// no locale prefix, shallower paths. Keeps the representative set noise-free.
function rankUrls(urls) {
  const byPath = new Map();
  for (const href of urls) {
    let p; try { p = new URL(href); } catch { continue; }
    const key = p.pathname.replace(/\/$/, '') || '/';
    const score = (p.search ? 2 : 0) + (LOCALE_RE.test(p.pathname) ? 4 : 0) + p.pathname.split('/').length * 0.1;
    const prev = byPath.get(key);
    if (!prev || score < prev.score) byPath.set(key, { href: p.href, score });
  }
  return [...byPath.values()].sort((a, b) => a.score - b.score).map((x) => ({ href: x.href, text: '' }));
}
const discoverable = MODE === 'wayback'
  ? rankUrls([...cdxUrls, ...anchors.map((a) => a.href)])
  : rankUrls(anchors.map((a) => a.href));

// ---- 2. structural surface discovery (generic Shopify) -------------------
function pick(re, n = 1, exclude = null) {
  const seen = new Set();
  const out = [];
  for (const a of discoverable) {
    const path = (() => { try { return new URL(a.href).pathname; } catch { return ''; } })();
    if (re.test(path) && !(exclude && exclude.test(path)) && !seen.has(a.href)) { seen.add(a.href); out.push(a.href); }
    if (out.length >= n) break;
  }
  return out;
}

// Shopify products.json gives us real PDPs even when nav is unhelpful (live only).
let productUrls = [];
if (MODE === 'live') {
  try {
    const pj = await api.get(new URL('/products.json?limit=5', base).href, { timeout: 20000 });
    if (pj.ok()) {
      const data = await pj.json();
      productUrls = (data.products || []).slice(0, 2).map((p) => new URL(`/products/${p.handle}`, base).href);
      manifest.is_shopify = true;
    }
  } catch { /* not all stores are Shopify / expose it */ }
}
// Structural PDP discovery — works for Shopify (/products/) and WooCommerce/other (/product/).
if (!productUrls.length) productUrls = pick(/\/products?\/[^/]+\/?$/, 2);
const collectionUrls = pick(/\/(collections|product-category|shop|category)\//, 1);
const contentUrls = pick(/(faq|where-to-buy|about|contact|blog|pages|stories|journal|help|shipping|returns|recipes|benefits|story)/i, 3, /\/products?\//);
const cartUrl = new URL('/cart', base).href;

const targets = [
  ...productUrls.map((u, i) => ['product', u, i === 0]),
  ...collectionUrls.map((u) => ['collection', u, false]),
  [ 'cart', cartUrl, false ],
  ...contentUrls.map((u) => ['content', u, false]),
];
const seenT = new Set([base.href]);
for (const [kind, url, wm] of targets) {
  if (seenT.has(url)) continue;
  seenT.add(url);
  await capture(kind, url, { withMobile: wm });
}

// ---- 3. site-wide technical signals --------------------------------------
async function probe(path) {
  try {
    const r = await api.get(new URL(path, base).href, { timeout: 20000, maxRedirects: 0 }).catch(async () => api.get(new URL(path, base).href, { timeout: 20000 }));
    const body = r.ok() ? await r.text() : '';
    return { path, status: r.status(), ok: r.ok(), len: body.length, body: body.slice(0, 2000) };
  } catch (e) { return { path, status: null, ok: false, error: e.message }; }
}

const LIVE = MODE === 'live';
const NA = { status: null, ok: null, not_assessable: true, detail: 'archived crawl — live endpoint not fetched' };

const robots = LIVE ? await probe('/robots.txt') : { ...NA };
const sitemap = LIVE ? await probe('/sitemap.xml') : { ...NA };

// http -> https redirect check
let httpsRedirect = { ok: null, detail: 'not tested' };
if (LIVE) {
  try {
    const r = await api.get(`http://${HOST}/`, { timeout: 20000, maxRedirects: 0 });
    const loc = r.headers()['location'] || '';
    httpsRedirect = { ok: r.status() >= 300 && r.status() < 400 && loc.startsWith('https'), status: r.status(), location: loc };
  } catch (e) {
    // if http fetch throws but https worked, infer redirect/HSTS
    httpsRedirect = { ok: home.status && home.status < 400, detail: `http probe failed (${e.message}); https loaded ok` };
  }
} else httpsRedirect = { ...NA };

// broken-link sample across discovered internal anchors (live only — archive rewrites links)
const broken = [];
if (LIVE) {
  const linkSample = [...new Set(anchors.map((a) => a.href))].filter(sameHost).slice(0, 20);
  for (const u of linkSample) {
    try {
      const r = await api.get(u, { timeout: 15000 });
      if (r.status() >= 400) broken.push({ url: u, status: r.status() });
    } catch (e) { broken.push({ url: u, status: 'error', error: e.message }); }
  }
}

const tech = {
  host: HOST,
  mode: MODE,
  snapshot_ts: WB_TS,
  ssl: LIVE
    ? { ok: base.protocol === 'https:' && (home.status ?? 0) < 400, detail: `homepage HTTPS status ${home.status}` }
    : { ok: null, not_assessable: true, detail: 'archived crawl — TLS of live edge not verified; archived URL was HTTPS' },
  https_redirect: httpsRedirect,
  robots: { status: robots.status, ok: robots.ok, has_sitemap_directive: /sitemap:/i.test(robots.body || '') },
  sitemap: { status: sitemap.status, ok: sitemap.ok, url_count: (sitemap.body?.match(/<loc>/g) || []).length },
  meta: manifest.surfaces.map((s) => ({ id: s.id, title: s.signals?.meta_title, description: s.signals?.meta_description, og: !!s.signals?.og_title })),
  structured_data: manifest.surfaces.map((s) => ({ id: s.id, jsonld: s.signals?.jsonld_types || [] })),
  favicon: home.signals?.favicon ?? false,
  mobile_friendly: { viewport_meta: !!home.signals?.viewport, mobile_screenshot: home.mobile_screenshot },
  page_speed: manifest.surfaces.map((s) => ({ id: s.id, timing: s.signals?.nav_timing })),
  images: manifest.surfaces.map((s) => ({ id: s.id, count: s.signals?.img_count, missing_dims: s.signals?.img_missing_dims, modern_fmt: s.signals?.img_modern_fmt })),
  cookie_privacy: { consent_banner: home.signals?.has_consent_banner, privacy_link: anchors.some((a) => /privacy/i.test(a.href)) },
  checkout: manifest.surfaces.find((s) => s.kind === 'cart') || { note: '/cart not captured' },
  critical_pages: manifest.surfaces.map((s) => ({ id: s.id, kind: s.kind, status: s.status, error: s.error || null })),
  broken_links: broken,
  notes: `crawl mode=${MODE}${WB_TS ? ` (Wayback snapshot ${WB_TS})` : ''}. page_speed timings are navigation-timing proxies, not full Lighthouse runs.${LIVE ? '' : ' Live-only checks (robots, sitemap, https-redirect, broken-links, page-speed) marked not_assessable.'}`,
};

manifest.finished = new Date().toISOString();
manifest.tech_signals_file = join(RUN_DIR, 'tech_signals.json');
await writeFile(join(RUN_DIR, 'tech_signals.json'), JSON.stringify(tech, null, 2));
await writeFile(join(RUN_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

await browser.close();
log(`done → ${RUN_DIR} (${manifest.surfaces.length} surfaces, ${broken.length} broken links)`);
console.log(RUN_DIR);
