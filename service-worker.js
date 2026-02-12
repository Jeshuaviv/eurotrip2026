const STATIC_CACHE = "trip-app-static-v1";
const TICKETS_CACHE = "trip-app-tickets-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/data/trip.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      // Cache principal de la app
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(STATIC_ASSETS);

      // Cache separado solo para tickets
      const ticketsCache = await caches.open(TICKETS_CACHE);

      // Cargar lista de tickets
      const response = await fetch("data/tickets.json");
      const data = await response.json();

      // Guardar cada ticket en caché
      await ticketsCache.addAll(data.tickets);
    })()
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});