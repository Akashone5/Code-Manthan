const CACHE_NAME = 'meridian-fairlend-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/icons/favicon-32x32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/og-share.png',
  '/404.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('meridian-fairlend-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  if (
    path.startsWith('/api/') ||
    path.startsWith('/downloads/') ||
    path.startsWith('/.well-known/') ||
    path === '/sitemap.xml' ||
    path === '/robots.txt' ||
    path === '/urllist.txt' ||
    path === '/docs' ||
    path === '/redoc' ||
    path === '/openapi.json'
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => null);
        }
        return networkRes;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const rootCached = await caches.match('/') || await caches.match('/index.html');
          if (rootCached) return rootCached;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meridian FairLend AI - Offline</title></head><body style="margin:0;padding:32px;font-family:Segoe UI,Arial,sans-serif;background:#F7F3EB;color:#064E3B;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="max-width:440px;background:#fff;border:2px solid #E8D7B8;border-radius:16px;padding:28px;text-align:center;"><h2>Meridian FairLend AI</h2><p>Internet connection required to sync live OTP verification and underwriting data. Reconnect and tap retry.</p><button onclick="location.reload()" style="background:#064E3B;color:#F8E7C9;border:none;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer;">Retry Connection</button></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
        return new Response('', { status: 503 });
      })
  );
});
