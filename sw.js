/* SONEXA service worker: offline mode.
   - App shell is pre-cached on install. index.html, app.js, styles.css, strings.js, scoring.js, manifest and data/index.* are
     served NETWORK-FIRST (cached copy offline / after 4 s), so a publish shows on the next load; fonts/vendor/logo cache-first.
   - The page reloads itself once when a new worker takes control (index.html), unless a test is running.
   - data/* is stale-while-revalidate (data/chapters/*.json, ~95 KB for chapter practice, is pre-cached with the shell).
   - Papers saved with "Save offline" live in their own cache (sx-paper-<id>), written by the page.
   - Question images of papers opened online are kept in a runtime cache per paper (sx-rt-<id>), last 10 papers.
   VERSION is re-stamped on every publish (tools/stamp_sw.py) so phones pick up the new app shell. */
const VERSION = 'sx-shell-7b46186571';
const SHELL = VERSION;
const DATA = 'sx-data-v1';
const META = 'sx-meta-v1';
const RT_PREFIX = 'sx-rt-';
const RT_MAX = 10;
const SHELL_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'strings.js', 'scoring.js', 'manifest.webmanifest',
  'data/index.js', 'data/index.json',
  'data/chapters/neet.json', 'data/chapters/jee-main.json', 'data/chapters/jee-adv.json', 'data/chapters/cbse10.json', 'data/chapters/cbse12.json', 'data/chapters/nda.json',
  'vendor/katex/katex.min.css', 'vendor/katex/katex.min.js', 'vendor/katex/auto-render.min.js',
  'vendor/katex/fonts/KaTeX_AMS-Regular.woff2', 'vendor/katex/fonts/KaTeX_Main-Bold.woff2', 'vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Regular.woff2', 'vendor/katex/fonts/KaTeX_Math-Italic.woff2', 'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Size1-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size2-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  'assets/logo.svg?v=sx3', 'assets/fonts/baloo2-600-latin.woff2', 'assets/fonts/baloo2-600-devanagari.woff2',
  'assets/favicon-32.png?v=sx3', 'assets/icon-192.png?v=sx3', 'assets/apple-touch-icon.png?v=sx3', 'favicon.ico?v=sx3', 'manifest.webmanifest?v=sx3'
];
const scope = self.registration.scope;
const abs = p => new URL(p, scope).href;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // one by one so a single missing optional file can't break the install
    await Promise.all(SHELL_FILES.map(async f => {
      try { const r = await fetch(abs(f), { cache: 'reload' }); if (r.ok) await c.put(abs(f), r); } catch (err) { /* offline during install */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  let rescue = false;
  const done = (async () => {
    const keys = await caches.keys();
    rescue = keys.some(k => k.startsWith('sx-shell-') && k !== SHELL) && !keys.includes(NF_MARK);
    await Promise.all(keys.filter(k => k.startsWith('sx-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await caches.open(NF_MARK);
    await self.clients.claim();
  })();
  e.waitUntil(done);
  // One-time rescue for pages still running the old cache-first shell (they have no update listener): reload them,
  // except a page in the middle of a test. Done AFTER activation (a navigation inside waitUntil would wait on this
  // worker's own activation and hang).
  done.then(() => { if (!rescue) return; setTimeout(async () => {
    try { const cl = await self.clients.matchAll({ type: 'window' }); for (const c of cl) { try { if (!/#\/test\b/.test(c.url)) c.navigate(c.url); } catch (err) { /* ignore */ } } } catch (err) { /* ignore */ }
  }, 300); });
});

const NF_MARK = 'sx-netfirst-v1';
const NET_FIRST = ['index.html', 'app.js', 'styles.css', 'strings.js', 'scoring.js', 'manifest.webmanifest', 'data/index.js', 'data/index.json'];
// Network first (revalidating the HTTP cache), saved into the shell cache; cached copy if offline, failing, or slower than 4 s.
function netFirst(req, key, fallback) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(async r => { if (r && r.ok) { const c = await caches.open(SHELL); await c.put(key, r.clone()); } return r; });
    net.then(r => { if (r && r.ok) finish(r); else fallback().then(c => finish(c || r)); })
       .catch(() => fallback().then(c => finish(c || Response.error())));
    setTimeout(() => { if (!done) fallback().then(c => { if (c) finish(c); }); }, 4000);
  });
}
async function anyMatch(req) {
  return caches.match(req, { ignoreSearch: false }) || null;
}
async function touchRt(pid) {
  try {
    const m = await caches.open(META);
    const r = await m.match(abs('__rt-lru'));
    const lru = r ? await r.json() : {};
    lru[pid] = Date.now();
    const ids = Object.keys(lru).sort((a, b) => lru[b] - lru[a]);
    for (const old of ids.slice(RT_MAX)) { delete lru[old]; await caches.delete(RT_PREFIX + old); }
    await m.put(abs('__rt-lru'), new Response(JSON.stringify(lru), { headers: { 'content-type': 'application/json' } }));
  } catch (err) { /* ignore */ }
}
async function updateEverywhere(req, res) {
  // refresh this URL in every cache that already holds it (data cache + any saved paper)
  const keys = await caches.keys();
  let put = false;
  for (const k of keys) {
    if (!k.startsWith('sx-')) continue;
    const c = await caches.open(k);
    if (await c.match(req)) { await c.put(req, res.clone()); put = true; }
  }
  if (!put) await (await caches.open(DATA)).put(req, res.clone());
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(scope)) return;   // counter, other sites: browser default
  const path = url.href.slice(scope.length).replace(/[?#].*$/, '');

  // Page loads: the app shell (cache-first); other pages (e.g. /app/) network-first with cache fallback.
  if (req.mode === 'navigate') {
    if (path === '' || path === 'index.html') {
      // network-first so a publish shows up on the next load; the cached shell is the offline fallback
      e.respondWith(netFirst(req, abs('./'), async () => (await caches.match(abs('./'), { ignoreSearch: true })) || (await caches.match(abs('index.html'), { ignoreSearch: true }))));
    } else {
      e.respondWith((async () => { try { const r = await fetch(req); if (r.ok) (await caches.open(DATA)).put(req, r.clone()); return r; } catch (err) { return (await caches.match(req, { ignoreSearch: true })) || Response.error(); } })());
    }
    return;
  }

  // The app's own code + paper list: network-first (fresh after every publish), cached copy when offline or slow.
  if (NET_FIRST.includes(path)) {
    e.respondWith(netFirst(req, url.origin + url.pathname, async () => (await caches.match(url.origin + url.pathname)) || (await caches.match(req, { ignoreSearch: true }))));
    return;
  }

  // Data: stale-while-revalidate.
  if (path.startsWith('data/')) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const net = fetch(req).then(async r => { if (r.ok) await updateEverywhere(new Request(url.origin + url.pathname), r); return r; }).catch(() => null);
      if (cached) { e.waitUntil(net); return cached; }
      return (await net) || new Response('', { status: 503, statusText: 'Offline' });
    })());
    return;
  }

  // Question images: any cache first (saved papers, runtime), else network + runtime cache of that paper.
  if (path.startsWith('img/')) {
    e.respondWith((async () => {
      const key = url.origin + url.pathname;
      const cached = await caches.match(key);
      if (cached) return cached;
      try {
        const r = await fetch(req);
        if (r.ok) {
          const pid = path.split('/')[1];
          e.waitUntil((async () => { await (await caches.open(RT_PREFIX + pid)).put(key, r.clone()); await touchRt(pid); })());
        }
        return r;
      } catch (err) { return new Response('', { status: 503, statusText: 'Offline' }); }
    })());
    return;
  }

  // Shell files and everything else on the site: cache-first, then network (cached for next time).
  e.respondWith((async () => {
    const cached = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const r = await fetch(req);
      if (r.ok && (path.startsWith('vendor/') || path.startsWith('assets/'))) (await caches.open(SHELL)).put(req, r.clone());
      return r;
    } catch (err) { return new Response('', { status: 503, statusText: 'Offline' }); }
  })());
});
