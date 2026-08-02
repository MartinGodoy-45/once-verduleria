const CACHE = 'once-v7'
const ARCHIVOS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
})

// El shell (html/css/js) se sirve de caché primero, siempre.
// Los datos de Supabase NUNCA se cachean acá: van directo a red,
// porque precios y stock tienen que ser siempre los reales.
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('supabase.co')) return
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  )
})
