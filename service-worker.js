const CACHE_VERSION = "trip-app-v23";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const TICKETS_CACHE = `tickets-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./",
  "itinerario.html",
  "index.html",
  "styles.css",
  "app.v2.js",
  "cms.js",
  "db.js",
  "manifest.json",
  "img/icon-192.png",
  "img/icon-512.png",
  "data/trip.json",
  "data/tickets.json",
  "pdfjs/pdf.mjs",
  "pdfjs/pdf.worker.mjs"
];

// Instalación: Cachear assets principales de la aplicación
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // 1. Cachear shell estático de la PWA
      const staticCache = await caches.open(STATIC_CACHE);
      for (const asset of STATIC_ASSETS) {
        try {
          await staticCache.add(asset);
        } catch (err) {
          console.warn("No se pudo cachear el asset:", asset, err);
        }
      }

      // 2. Pre-cachear boletos demo si existen en la red
      try {
        const ticketsCache = await caches.open(TICKETS_CACHE);
        const res = await fetch("data/tickets.json");
        if (res.ok) {
          const data = await res.json();
          const ticketsList = Array.isArray(data) ? data : (data.tickets || []);
          for (const item of ticketsList) {
            if (item.file && typeof item.file === "string") {
              try {
                await ticketsCache.add(item.file);
              } catch (e) {
                console.warn("Boleto demo no precacheado:", item.file);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Fallo opcional al pre-cachear tickets demo:", err);
      }
    })()
  );
  self.skipWaiting();
});

// Activación: Limpieza de cachés antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== TICKETS_CACHE) {
            console.log("Limpiando caché antigua:", key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// Interceptor de peticiones (Offline First con Network Fallback)
self.addEventListener("fetch", (event) => {
  // Ignorar peticiones no HTTP/HTTPS (como chrome-extension o blob:)
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    (async () => {
      // 1. Intentar responder desde caché
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        // En segundo plano, si hay red, refrescar el caché para la próxima vez (Stale-While-Revalidate)
        fetch(event.request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cacheToUse = event.request.url.includes("tickets/")
                ? await caches.open(TICKETS_CACHE)
                : await caches.open(STATIC_CACHE);
              cacheToUse.put(event.request, networkResponse.clone());
            }
          })
          .catch(() => {});

        return cachedResponse;
      }

      // 2. Si no está en caché, intentar obtenerlo de la red
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          const cacheToUse = event.request.url.includes("tickets/")
            ? await caches.open(TICKETS_CACHE)
            : await caches.open(STATIC_CACHE);
          cacheToUse.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // Fallback para navegación de página
        if (event.request.mode === "navigate") {
          const fallback = await caches.match("itinerario.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    })()
  );
});