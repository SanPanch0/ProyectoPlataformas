// Service worker: permite abrir la aplicación sin Internet.
// - Guarda la "cáscara" de la app (HTML, CSS y JS) al instalarse.
// - Guarda imágenes (banderas, fotos) y fuentes la primera vez que se ven.
// - Los datos de las APIs (/api/*) NO pasan por aquí: los guarda http.js en localStorage.
const VERSION = 'ggv-v2';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/modules/countries.js',
  '/js/modules/countryNames.js',
  '/js/modules/currency.js',
  '/js/modules/hotels.js',
  '/js/modules/http.js',
  '/js/modules/photos.js',
  '/js/modules/ui.js',
  '/js/modules/weather.js',
];
const MEDIA_CACHE = `${VERSION}-media`;
const MAX_MEDIA = 150;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // allSettled: si un archivo opcional falta, la instalación no se cancela.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request, cacheName, { trim = 0 } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  const network = fetch(request)
    .then(async (response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
        if (trim) {
          const keys = await cache.keys();
          if (keys.length > trim) await cache.delete(keys[0]);
        }
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Datos de la API: los maneja la propia aplicación.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Páginas: red primero (para ver cambios) y, sin Internet, la copia guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Archivos propios (CSS, JS): copia guardada al instante y se actualiza en segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, VERSION));
    return;
  }

  // Imágenes y fuentes externas.
  if (request.destination === 'image' || request.destination === 'font' || request.destination === 'style') {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE, { trim: MAX_MEDIA }));
  }
});
