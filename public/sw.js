/**
 * Service Worker — Shop Billing
 * Strategy:
 *  - App shell (HTML, JS, CSS, icons): cache-first → instant load on repeat visits
 *  - Supabase / API calls: network-only (always fresh data)
 *  - Fallback: serve cached HTML when offline
 */

const SHELL_CACHE = 'shop-billing-shell-v3';
const ASSET_CACHE = 'shop-billing-assets-v3';

const APP_SHELL = ['/', '/manifest.webmanifest', '/shop-icon.svg'];

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate new SW immediately without waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: smart routing ───────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase or other external API calls — always go to network
  if (url.origin !== self.location.origin) return;

  // JS / CSS assets (content-hashed filenames) → cache-first
  // They change name on each build, so a cached copy is always valid
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Navigation (HTML) → network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Other same-origin requests (icons, manifest) → stale-while-revalidate
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached ?? fetchPromise;
    })
  );
});
