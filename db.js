/**
 * db.js - Motor de almacenamiento local offline-first usando IndexedDB
 * Gestiona viajes, días, actividades y tickets (con soporte para archivos PDF/imágenes en Blob).
 */

const DB_NAME = "TripAppDB";
const DB_VERSION = 1;

class TripDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * Abre o inicializa la base de datos IndexedDB
   */
  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Tabla de Viajes
        if (!db.objectStoreNames.contains("trips")) {
          const tripsStore = db.createObjectStore("trips", { keyPath: "id" });
          tripsStore.createIndex("isActive", "isActive", { unique: false });
        }

        // Tabla de Días
        if (!db.objectStoreNames.contains("days")) {
          const daysStore = db.createObjectStore("days", { keyPath: "id" });
          daysStore.createIndex("tripId", "tripId", { unique: false });
          daysStore.createIndex("date", "date", { unique: false });
        }

        // Tabla de Actividades
        if (!db.objectStoreNames.contains("activities")) {
          const actStore = db.createObjectStore("activities", { keyPath: "id" });
          actStore.createIndex("tripId", "tripId", { unique: false });
          actStore.createIndex("dayId", "dayId", { unique: false });
        }

        // Tabla de Tickets (guarda metadatos y el archivo Blob del PDF o imagen)
        if (!db.objectStoreNames.contains("tickets")) {
          const ticketsStore = db.createObjectStore("tickets", { keyPath: "id" });
          ticketsStore.createIndex("tripId", "tripId", { unique: false });
          ticketsStore.createIndex("category", "category", { unique: false });
        }

        // Tabla de configuración (ej. viaje activo)
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("Error al abrir IndexedDB:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Ejecuta una transacción genérica
   */
  async transaction(storeNames, mode, callback) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = Array.isArray(storeNames)
        ? storeNames.map((name) => tx.objectStore(name))
        : tx.objectStore(storeNames);

      let result;
      try {
        result = callback(stores, tx);
      } catch (err) {
        reject(err);
      }

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Obtiene un valor de una tienda por su clave
   */
  async get(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Obtiene todos los registros de una tienda, opcionalmente filtrados por índice
   */
  async getAll(storeName, indexName = null, query = null) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const req = query ? target.getAll(query) : target.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Guarda o actualiza un registro
   */
  async put(storeName, item) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Elimina un registro por clave
   */
  async delete(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Obtiene o establece el ID del viaje activo
   */
  async getActiveTripId() {
    const setting = await this.get("settings", "activeTripId");
    if (setting && setting.value) return setting.value;

    // Si no hay configuración, buscar el primer viaje
    const trips = await this.getAll("trips");
    if (trips.length > 0) {
      await this.setActiveTripId(trips[0].id);
      return trips[0].id;
    }
    return null;
  }

  async setActiveTripId(tripId) {
    await this.put("settings", { key: "activeTripId", value: tripId });
  }

  /**
   * Carga inicial de datos demo (EuroTrip 2026) si la base de datos está vacía
   */
  async seedIfEmpty() {
    await this.open();
    const trips = await this.getAll("trips");
    if (trips.length > 0) {
      return false; // Ya existen datos
    }

    try {
      console.log("Cargando datos semilla iniciales de EuroTrip 2026...");
      const [tripRes, ticketsRes] = await Promise.all([
        fetch("data/trip.json").catch(() => null),
        fetch("data/tickets.json").catch(() => null)
      ]);

      if (!tripRes || !tripRes.ok) return false;

      const tripData = await tripRes.json();
      const ticketsData = ticketsRes && ticketsRes.ok ? await ticketsRes.json() : [];

      const tripId = "eurotrip-2026";
      const trip = {
        id: tripId,
        name: "EuroTrip 2026",
        subtitle: "Mi itinerario",
        isCurrent: true,
        createdAt: new Date().toISOString()
      };

      await this.put("trips", trip);
      await this.setActiveTripId(tripId);

      // Guardar días y actividades
      if (tripData.days && Array.isArray(tripData.days)) {
        for (let i = 0; i < tripData.days.length; i++) {
          const day = tripData.days[i];
          const dayId = `${tripId}_day_${i + 1}`;
          
          await this.put("days", {
            id: dayId,
            tripId: tripId,
            date: day.date,
            city: day.city,
            country: day.country,
            order: i
          });

          if (day.activities && Array.isArray(day.activities)) {
            for (let j = 0; j < day.activities.length; j++) {
              const act = day.activities[j];
              const actId = `${day.date}_${act.title}`.trim();

              await this.put("activities", {
                id: actId,
                dayId: dayId,
                tripId: tripId,
                time: act.time,
                title: act.title,
                description: act.description || "",
                notes: act.notes || "",
                file: act.file || null,
                done: false
              });
            }
          }
        }
      }

      // Guardar tickets
      const ticketsList = Array.isArray(ticketsData) ? ticketsData : (ticketsData.tickets || []);
      for (const t of ticketsList) {
        await this.put("tickets", {
          id: t.id || `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          tripId: tripId,
          title: t.title,
          category: t.category, // transport, activity, hotel
          file: t.file, // ruta relativa o blob
          date: t.date || null
        });
      }

      console.log("Datos semilla de EuroTrip 2026 inicializados con éxito.");
      return true;
    } catch (err) {
      console.warn("No se pudieron cargar datos semilla:", err);
      return false;
    }
  }

  /**
   * Obtiene la estructura completa del viaje activo
   */
  async getActiveTrip() {
    await this.seedIfEmpty();
    const activeTripId = await this.getActiveTripId();
    if (!activeTripId) {
      return { trip: null, days: [], tickets: [] };
    }

    const trip = await this.get("trips", activeTripId);
    const rawDays = await this.getAll("days", "tripId", activeTripId);
    const rawActivities = await this.getAll("activities", "tripId", activeTripId);
    const rawTickets = await this.getAll("tickets", "tripId", activeTripId);

    // Ordenar días cronológicamente o por orden
    rawDays.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Agrupar actividades dentro de cada día
    const days = rawDays.map((day) => {
      const dayActivities = rawActivities.filter((a) => a.dayId === day.id);
      return {
        ...day,
        activities: dayActivities
      };
    });

    return {
      trip,
      days,
      tickets: rawTickets
    };
  }

  /**
   * Marca o desmarca una actividad como realizada
   */
  async toggleActivity(activityId, isDone) {
    const act = await this.get("activities", activityId);
    if (act) {
      act.done = isDone;
      await this.put("activities", act);
    }
  }

  /**
   * Guarda un ticket con soporte para Blob (PDF o imagen)
   */
  async saveTicket(ticket) {
    if (!ticket.id) {
      ticket.id = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }
    await this.put("tickets", ticket);
    return ticket;
  }

  /**
   * Obtiene la URL resoluble de un ticket (ObjectURL si es Blob, o path si es string)
   */
  async resolveTicketUrl(ticketOrFile) {
    if (!ticketOrFile) return null;

    if (typeof ticketOrFile === "string") {
      // Es una ruta directa estática (ej: 'tickets/vuelos.pdf')
      return ticketOrFile;
    }

    if (ticketOrFile instanceof Blob || ticketOrFile instanceof File) {
      return URL.createObjectURL(ticketOrFile);
    }

    if (ticketOrFile.fileBlob instanceof Blob) {
      return URL.createObjectURL(ticketOrFile.fileBlob);
    }

    return ticketOrFile.file || null;
  }

  /**
   * Obtiene todos los viajes registrados
   */
  async getAllTrips() {
    return await this.getAll("trips");
  }

  /**
   * Crea un nuevo viaje y lo establece como activo
   */
  async createTrip({ name, subtitle, startDate, endDate }) {
    const tripId = `trip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const trip = {
      id: tripId,
      name: name || "Mi Nuevo Viaje",
      subtitle: subtitle || "Itinerario de viaje",
      startDate: startDate || null,
      endDate: endDate || null,
      createdAt: new Date().toISOString()
    };
    await this.put("trips", trip);
    await this.setActiveTripId(tripId);
    return trip;
  }

  /**
   * Actualiza los datos de un viaje
   */
  async updateTrip(tripId, updates) {
    const trip = await this.get("trips", tripId);
    if (!trip) throw new Error("Viaje no encontrado");
    const updatedTrip = { ...trip, ...updates, updatedAt: new Date().toISOString() };
    await this.put("trips", updatedTrip);
    return updatedTrip;
  }

  /**
   * Elimina un viaje y todos sus días, actividades y tickets asociados
   */
  async deleteTrip(tripId) {
    await this.delete("trips", tripId);

    // Eliminar días
    const days = await this.getAll("days", "tripId", tripId);
    for (const d of days) {
      await this.delete("days", d.id);
    }

    // Eliminar actividades
    const activities = await this.getAll("activities", "tripId", tripId);
    for (const a of activities) {
      await this.delete("activities", a.id);
    }

    // Eliminar tickets
    const tickets = await this.getAll("tickets", "tripId", tripId);
    for (const t of tickets) {
      await this.delete("tickets", t.id);
    }

    // Si el viaje eliminado era el activo, activar otro
    const currentActiveId = await this.getActiveTripId();
    if (currentActiveId === tripId) {
      const remainingTrips = await this.getAll("trips");
      if (remainingTrips.length > 0) {
        await this.setActiveTripId(remainingTrips[0].id);
      } else {
        await this.put("settings", { key: "activeTripId", value: null });
      }
    }

    return true;
  }

  /**
   * Agrega un nuevo día a un viaje
   */
  async addDay(tripId, { date, city, country }) {
    const existingDays = await this.getAll("days", "tripId", tripId);
    const dayId = `${tripId}_day_${Date.now()}`;
    const newDay = {
      id: dayId,
      tripId,
      date: date || new Date().toISOString(),
      city: city || "Ciudad",
      country: country || "",
      order: existingDays.length
    };
    await this.put("days", newDay);
    return newDay;
  }

  /**
   * Elimina un día y sus actividades asociadas
   */
  async deleteDay(dayId) {
    const activities = await this.getAll("activities", "dayId", dayId);
    for (const act of activities) {
      await this.delete("activities", act.id);
    }
    await this.delete("days", dayId);
    return true;
  }

  /**
   * Agrega una actividad y opcionalmente guarda su archivo/ticket
   */
  async addActivity(dayId, tripId, { time, title, description, notes, fileBlob, fileName, fileType, category }) {
    const actId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    let ticketId = null;

    if (fileBlob) {
      ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      await this.saveTicket({
        id: ticketId,
        tripId,
        title: title || fileName || "Boleto",
        category: category || "activity",
        fileBlob: fileBlob,
        fileName: fileName || "documento",
        fileType: fileType || fileBlob.type,
        date: new Date().toISOString()
      });
    }

    const activity = {
      id: actId,
      dayId,
      tripId,
      time: time || "09:00",
      title: title || "Nueva actividad",
      description: description || "",
      notes: notes || "",
      file: ticketId,
      fileBlob: fileBlob || null,
      done: false
    };

    await this.put("activities", activity);
    return { activity, ticketId };
  }

  /**
   * Elimina una actividad
   */
  async deleteActivity(activityId) {
    await this.delete("activities", activityId);
    return true;
  }

  /**
   * Exporta el viaje completo a un objeto JSON (útil para backup y compartir)
   */
  async exportTrip(tripId) {
    const id = tripId || (await this.getActiveTripId());
    if (!id) return null;

    const trip = await this.get("trips", id);
    const days = await this.getAll("days", "tripId", id);
    const activities = await this.getAll("activities", "tripId", id);
    const tickets = await this.getAll("tickets", "tripId", id);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      trip,
      days,
      activities: activities.map(a => ({
        id: a.id,
        dayId: a.dayId,
        tripId: a.tripId,
        time: a.time,
        title: a.title,
        description: a.description,
        notes: a.notes,
        file: typeof a.file === "string" ? a.file : null,
        done: a.done || false
      })),
      tickets: tickets.map(t => ({
        id: t.id,
        title: t.title,
        category: t.category,
        date: t.date,
        file: typeof t.file === "string" ? t.file : null
      }))
    };
  }

  /**
   * Importa un viaje completo desde un objeto JSON
   */
  async importTripData(jsonData) {
    if (!jsonData || !jsonData.trip) {
      throw new Error("Formato de viaje inválido. Falta el objeto 'trip'.");
    }

    const newTripId = `imported_${Date.now()}`;
    const oldTripId = jsonData.trip.id;

    // Guardar nuevo viaje
    const trip = {
      ...jsonData.trip,
      id: newTripId,
      name: `${jsonData.trip.name || "Viaje"} (Importado)`,
      importedAt: new Date().toISOString()
    };
    await this.put("trips", trip);

    // Mapear días a nuevos IDs
    const dayIdMap = new Map();
    if (Array.isArray(jsonData.days)) {
      for (const day of jsonData.days) {
        const newDayId = `${newTripId}_day_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        dayIdMap.set(day.id, newDayId);
        await this.put("days", {
          ...day,
          id: newDayId,
          tripId: newTripId
        });
      }
    }

    // Guardar tickets
    if (Array.isArray(jsonData.tickets)) {
      for (const t of jsonData.tickets) {
        await this.put("tickets", {
          ...t,
          id: `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          tripId: newTripId
        });
      }
    }

    // Guardar actividades
    if (Array.isArray(jsonData.activities)) {
      for (const act of jsonData.activities) {
        const targetDayId = dayIdMap.get(act.dayId) || act.dayId;
        await this.put("activities", {
          ...act,
          id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          tripId: newTripId,
          dayId: targetDayId,
          done: false
        });
      }
    }

    await this.setActiveTripId(newTripId);
    return trip;
  }

  /**
   * Restablece la base de datos local al demo de EuroTrip 2026
   */
  async resetToDemo() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["trips", "days", "activities", "tickets", "settings"], "readwrite");
      tx.objectStore("trips").clear();
      tx.objectStore("days").clear();
      tx.objectStore("activities").clear();
      tx.objectStore("tickets").clear();
      tx.objectStore("settings").clear();

      tx.oncomplete = async () => {
        await this.seedIfEmpty();
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const db = new TripDatabase();
