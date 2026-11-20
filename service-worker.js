/* VitaTakip servis çalışanı — çevrimdışı açılış ve hızlı önbellek.
   Sunucu yoktur; yalnızca bu sitenin kendi dosyaları önbelleğe alınır. Kullanıcı verileri (localStorage/IndexedDB)
   burada tutulmaz. CACHE_VERSION ve CORE_FILES `node tools/build.mjs` ile otomatik güncellenir. */
const CACHE_VERSION = 'vitatakip-043b643b25';
const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css?v=043b643b25",
  "./js/app.1.js?v=043b643b25",
  "./js/app.2.js?v=043b643b25",
  "./js/app.3.js?v=043b643b25",
  "./js/app.4.js?v=043b643b25",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./vendor/fontawesome/webfonts/fa-brands-400.woff2",
  "./vendor/fontawesome/webfonts/fa-regular-400.woff2",
  "./vendor/fontawesome/webfonts/fa-solid-900.woff2",
  "./vendor/fontawesome/webfonts/fa-v4compatibility.woff2",
  "./data/tr-medications.json",
  "./data/tr-supplements.json",
  "./img/symptoms/brittle_nails.jpg",
  "./img/symptoms/dark_nail.jpg",
  "./img/symptoms/hair.jpg",
  "./img/symptoms/mouth.jpg",
  "./img/symptoms/nails.jpg",
  "./img/symptoms/rash.jpg",
  "./img/symptoms/spoon_nails.jpg",
  "./img/symptoms/tongue.jpg",
  "./vendor/chartjs/chart.umd.js",
  "./vendor/html5-qrcode/html5-qrcode.min.js",
  "./vendor/pdfjs/pdf.min.js",
  "./vendor/pdfjs/pdf.worker.min.js",
  "./vendor/zxing/zxing-browser.min.js"
];
const NAV_TIMEOUT_MS = 2500;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Bir dosya eksik olsa bile kurulum başarısız olmasın: tek tek eklenir. Önbellek atlanarak taze sürüm alınır.
    await Promise.all(CORE_FILES.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('vitatakip-') && k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) if ('focus' in client) return client.focus();
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

async function putInCache(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(req, res.clone()).catch(() => null);
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Dış adresler (ör. kullanıcının kendi Gemini anahtarıyla yaptığı istekler) hiç önbelleğe alınmaz.
  if (url.origin !== self.location.origin) return;

  // Sayfa: önce ağ (en fazla NAV_TIMEOUT_MS), yavaş/yoksa anında önbellekteki sayfa
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || (await caches.match('./'));
      const network = fetch(req).then(res => putInCache(req, res));
      if (!cached) return network.catch(() => Response.error());
      const timeout = new Promise(resolve => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS));
      return Promise.race([network.catch(() => cached), timeout]);
    })());
    return;
  }

  // Diğer dosyalar: birebir aynı adres önbellekteyse anında verilir, arkada güncellenir (stale-while-revalidate).
  // Paketler ?v=<özet> taşır: yeni sürümün HTML'i asla eski paketle eşleşmez; eşleşme yoksa ağdan alınır,
  // ağ da yoksa (çevrimdışı) sürüm farkı gözetmeden son kopya kullanılır.
  event.respondWith((async () => {
    const exact = await caches.match(req);
    const network = fetch(req).then(res => putInCache(req, res)).catch(() => null);
    if (exact) { event.waitUntil(network); return exact; }
    return (await network) || (await caches.match(req, { ignoreSearch: true })) || Response.error();
  })());
});
