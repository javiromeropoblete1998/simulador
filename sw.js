// Guarda la app en el dispositivo para que abra sin internet.
// Con internet usa la versión más reciente, pero si la red no responde en 3 segundos
// (WiFi sin internet, punto de acceso sin datos) abre al instante la copia guardada.
const C = 'simulador-v37';
const FILES = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'casos.js','ecgdata.js'].concat(['ecg/amb.jpg', 'ecg/b1.jpg', 'ecg/b2.jpg', 'ecg/b3.jpg', 'ecg/c4-5.jpg', 'ecg/emb.jpg', 'ecg/hiperk.jpg', 'ecg/hipot.jpg', 'ecg/hipov.jpg', 'ecg/s11.jpg', 'ecg/s12.jpg', 'ecg/s21.jpg', 'ecg/s22.jpg', 'ecg/s3.jpg', 'ecg/s4.jpg', 'ecg/s5.jpg', 'ecg/s72.jpg', 'ecg/s73.jpg', 'ecg/s74.jpg', 'ecg/t1.jpg', 'ecg/t2.jpg', 'ecg/t3.jpg', 'ecg/tca.jpg']);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const net = fetch(e.request).then(r => {
    if (r && r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)).catch(() => {}); }
    return r;
  });
  net.catch(() => {});
  e.waitUntil(net.catch(() => {}));            // la red sigue actualizando la copia en segundo plano
  e.respondWith((async () => {
    try {
      const r = await Promise.race([net, new Promise(res => setTimeout(() => res(null), 3000))]);
      if (r) return r;
    } catch (_) {}
    const c = await caches.open(C);
    const m = (await c.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' ? await c.match('index.html') : null);
    if (m) return m;
    try { return await net; } catch (_) { return Response.error(); }
  })());
});
