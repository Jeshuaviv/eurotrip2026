const STATIC_CACHE = "trip-app-static-v15";
const TICKETS_CACHE = "trip-app-tickets-v15";

const STATIC_ASSETS = [
  "index.html",
  "styles.css",
  "app.v2.js",
  "data/trip.json",
  "data/tickets.json",
  "pdfjs/pdf.mjs",
  "pdfjs/pdf.worker.mjs"  
];

self.addEventListener("install", event => {
  event.waitUntil(
    
    (async () => {
      // Dentro del evento 'install' de tu service-worker.js
      const tripRes = await fetch("data/trip.json");
      const tripData = await tripRes.json();

      const filesFromTrip = [];
      tripData.days.forEach(day => {
        day.activities.forEach(act => {
          if (act.file) filesFromTrip.push(act.file);
        });
      });

      const cache = await caches.open(STATIC_CACHE);
      //await cache.addAll(filesFromTrip);
      // Cambia el addAll por esto para debuguear:
      for (const url of filesFromTrip) {
        try {
          await cache.add(url);
        } catch (err) {
          console.error("No se pudo cachear este archivo:", url);
        }
      }
      
      try {
        // 1. Cache principal
        const staticCache = await caches.open(STATIC_CACHE);
        await staticCache.addAll(STATIC_ASSETS);

        // 2. Cache de tickets
        const ticketsCache = await caches.open(TICKETS_CACHE);
        const response = await fetch("data/tickets.json");
        const data = await response.json();

        // IMPORTANTE: Asegúrate de que esto sea un Array de URLs (strings)
        // Si data.tickets es una lista de objetos, usa .map() para sacar solo la URL
        // Extraemos solo la propiedad 'file' de cada objeto para el caché
        const urlsToCache = data.map(ticket => ticket.file);
        
        await ticketsCache.addAll(urlsToCache);
      } catch (error) {
        console.error("Fallo en la instalación del SW:", error);
      }
    })()
  );
  self.skipWaiting();
});

// Mantén tu activate y fetch como estaban...
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

// ELIMINÉ EL SEGUNDO BLOQUE "INSTALL" QUE CAUSABA EL ERROR