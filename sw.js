// Guarda la app en el móvil para que funcione sin conexión.
// Sirve siempre la copia guardada y, en segundo plano, descarga la versión nueva
// (las actualizaciones se ven la siguiente vez que se abre la app).
const CACHE = 'hoja-pj-v7';
const ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'reglas.js',
  'nube.js',
  'app.js',
  'cartas.js',
  'manifest.webmanifest',
  'iconos/icono.svg',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
];

self.addEventListener('install', ev => {
  // reload: descarga del servidor, no de la caché del navegador (podría ser la versión anterior).
  const peticiones = ARCHIVOS.map(u => new Request(u, { cache: 'reload' }));
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(peticiones)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Las librerías de Firebase no cambian dentro de una versión: se guardan la primera vez que se usan.
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    ev.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(req)) || fetch(req).then(resp => {
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      })));
    return;
  }
  if (url.origin !== location.origin) return;
  ev.respondWith(caches.open(CACHE).then(async cache => {
    const guardada = await cache.match(req, { ignoreSearch: true });
    // no-cache: pregunta siempre al servidor si hay versión nueva (GitHub Pages pide guardar 10 min).
    const nueva = fetch(req.url, { cache: 'no-cache' }).then(resp => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    if (guardada) {
      ev.waitUntil(nueva);
      return guardada;
    }
    return (await nueva) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }));
});
