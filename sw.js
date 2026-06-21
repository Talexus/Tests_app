// sw.js — service worker.
//
// Strategy:
//   • App shell (HTML/CSS/JS/icons/manifest): cache-first so the app launches
//     instantly and works offline. Bump CACHE_VERSION to ship an update.
//   • Data (exams.json and any *.csv): network-first so questions stay fresh,
//     falling back to cache when offline.
//   • Cross-origin requests (the published Google CSV) are left untouched and
//     go straight to the network.

const CACHE_VERSION = 'v1';
const CACHE = `exam-prep-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './csv.js',
  './quiz.js',
  './storage.js',
  './manifest.webmanifest',
  './exams.json',
  './sample-exam.csv',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Let cross-origin (the Google CSV endpoint) go straight to the network.
  if (url.origin !== self.location.origin) return;

  const isData = url.pathname.endsWith('.csv') || url.pathname.endsWith('exams.json');

  if (isData) {
    // Network-first; fall back to cache when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache-first, fall back to network, then to the cached index.html
  // (so deep navigations still resolve offline).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
