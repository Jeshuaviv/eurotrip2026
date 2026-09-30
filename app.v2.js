let currentScreen = "home";
let ticketsData = [];

import * as pdfjsLib from "./pdfjs/pdf.mjs";
import { db } from "./db.js";
window.tripDb = db;
pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.mjs";


const PASSWORD = "pemevi26"; // cámbialo

//bottom nav
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.screen;
    switchScreen(target);
  });
});

function switchScreen(screen) {
  currentScreen = screen;

  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
  });

  const targetScreen = document.getElementById(screen + "Screen");
  if (targetScreen) {
    targetScreen.classList.add("active");
  }

  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.remove("active");
  });

  const activeBtn = document.querySelector(`[data-screen="${screen}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  // Esconder timeline y botón atrás cuando se cambia de pantalla
  const timeline = document.getElementById("timeline");
  const backHomeBtn = document.getElementById("backHome");
  if (timeline) timeline.style.display = "none";
  if (backHomeBtn) backHomeBtn.style.display = "none";

  if (screen === "home") {
    const homeScreen = document.getElementById("homeScreen");
    if (homeScreen) homeScreen.style.display = "block";
    resetView();
  } else {
    const homeScreen = document.getElementById("homeScreen");
    if (homeScreen) homeScreen.style.display = "none";
  }

  if (screen === "tickets") {
    renderTickets();
  }

  if (screen === "profile" && typeof window.renderProfileScreen === "function") {
    window.renderProfileScreen();
  }
}

// function checkPin() {
//   const input = document.getElementById("pinInput").value;
//   const error = document.getElementById("errorMsg");

//   if (input === PASSWORD) {
//     localStorage.setItem("trip_access", "granted");
//     document.getElementById("lockscreen").style.display = "none";
//   } else {
//     error.textContent = "Código incorrecto";
//   }
// }

// function checkAccessOnLoad() {
//   if (localStorage.getItem("trip_access") === "granted") {
//   }
// }

// checkAccessOnLoad();

/*función formato de fecha */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

// función crear Chips de actividades
function buildActivityChips(days) {
  const container = document.getElementById("activityChips");
  if (!container) return;
  container.innerHTML = "";

  const now = new Date();
  const activities = [];

  // Obtener las actividades marcadas manualmente desde localStorage
  const doneActivities = JSON.parse(localStorage.getItem("doneActivities") || "{}");
  
  days.forEach(day => {
    const dayDate = new Date(day.date);

    (day.activities || []).forEach(act => {
      const uniqueId = act.id || `${day.date}_${act.title}`.trim();

      activities.push({
        id: uniqueId,
        actId: act.id || uniqueId,
        title: act.title,
        date: dayDate,
        photos: act.photos || []
      });
    });
  });

  // ordenar cronológicamente
  activities.sort((a, b) => a.date - b.date);

  activities.forEach(act => {
    const chip = document.createElement("div");
    chip.className = "activity-chip";
    const hasPhotos = act.photos && act.photos.length > 0;
    chip.innerHTML = `${hasPhotos ? '<span class="chip-photo-icon">📸</span> ' : ''}${act.title}`;
    chip.dataset.id = act.id;

    const isManualDone = doneActivities[act.id] === true;
    const isAutoDone = act.date < now;

    if (isManualDone || isAutoDone) {
      chip.classList.add("done");
    }

    // Al hacer clic, abrir modal de fotos / recap
    chip.addEventListener("click", () => {
      if (typeof window.openActivityPhotoModal === "function") {
        window.openActivityPhotoModal(act.actId);
      }
    });

    container.appendChild(chip);
  });

  if (typeof refreshActivityChips === "function") {
    refreshActivityChips();
  }
}

//carga de tickets
//carga de tickets
async function loadTickets() {
  const activeTripData = await db.getActiveTrip();
  ticketsData = activeTripData.tickets || [];

  const transportContainer = document.getElementById("transportTickets");
  const activityContainer = document.getElementById("activityTickets");
  const hotelContainer = document.getElementById("hotelTickets");

  if (transportContainer) transportContainer.innerHTML = "";
  if (activityContainer) activityContainer.innerHTML = "";
  if (hotelContainer) hotelContainer.innerHTML = "";

  ticketsData.forEach(ticket => {
    const container = document.getElementById(ticket.category + "Tickets");
    if (!container) return;

    const btn = document.createElement("button");
    btn.textContent = ticket.title;

    btn.addEventListener("click", () => {
      openTicket(ticket.fileBlob || ticket.file || ticket);
    });

    container.appendChild(btn);
  });
}

function renderTickets() {
  const transport = document.getElementById("transportTickets");
  const activity = document.getElementById("activityTickets");
  const hotel = document.getElementById("hotelTickets");

  if (transport) transport.innerHTML = "";
  if (activity) activity.innerHTML = "";
  if (hotel) hotel.innerHTML = "";

  if (!ticketsData || ticketsData.length === 0) {
    if (transport) transport.innerHTML = "<p style='color:#888; font-size:14px; padding:10px;'>No hay tickets registrados aún.</p>";
    return;
  }

  ticketsData.forEach(ticket => {
    const container = document.getElementById(ticket.category + "Tickets");
    if (!container) return;

    const card = document.createElement("div");
    card.className = "ticket-card";
    card.textContent = "🧾 " + ticket.title;

    card.addEventListener("click", () => {
      openTicket(ticket.fileBlob || ticket.file || ticket);
    });

    container.appendChild(card);
  });
}

function openTicketById(id) {
  const ticket = ticketsData.find(t => t.id === id);

  if (!ticket) {
    console.warn("Aviso: No se seleccionó un ticket válido aún.");
    return;
  }

  openTicket(ticket.fileBlob || ticket.file || ticket);
}

async function loadTrip() {
  const activeTripData = await db.getActiveTrip();
  const trip = activeTripData.trip;
  const days = activeTripData.days || [];
  const timeline = document.getElementById("timeline");
  
  // Actualizar encabezados del viaje si existen
  if (trip) {
    const titleEl = document.querySelector("#homeScreen h1");
    if (titleEl && trip.name) titleEl.textContent = `${trip.name} ✈️`;
    const subtitleEl = document.querySelector("#homeScreen .subtitle");
    if (subtitleEl && trip.subtitle) subtitleEl.textContent = trip.subtitle;
  }

  // Limpiar timeline
  timeline.innerHTML = "";

  if (days.length === 0) {
    timeline.innerHTML = `<div style="padding:40px; text-align:center; color:#aaa;">
      <h3>No tienes actividades registradas aún</h3>
      <p>Pronto podrás agregar tu itinerario.</p>
    </div>`;
    return true;
  }

  days.forEach(day => {
    const daySection = document.createElement("section");
    daySection.className = "day";

    daySection.innerHTML = `
      <div class="day-header">
        <div>
          <h2>${day.city} – ${day.country}</h2>
          <p>${formatDate(day.date)}</p>
        </div>
        <button class="add-act-quick-btn" onclick="openActivityModal({ dayId: '${day.id}', defaultDate: '${day.date}', defaultCity: '${day.city}', defaultCountry: '${day.country}' })" title="Agregar actividad a este día">+ Actividad</button>
      </div>
      <div class="activities"></div>
    `;

    const activitiesContainer = daySection.querySelector(".activities");

    (day.activities || []).forEach(act => {
      const card = document.createElement("article");
      card.className = "card";

      // --- PASO CLAVE: Generar y asignar el ID ---
      const uniqueId = act.id || `${day.date}_${act.title}`.trim();
      card.dataset.id = uniqueId; 
      
      const hasTicket = (act.file || act.fileBlob) ? true : false;

      card.innerHTML = `
        <div class="card-top-bar">
          <div class="time">${act.time}</div>
          <button class="card-menu-btn" data-act-id="${uniqueId}" onclick="openCardContextMenu(event, '${uniqueId}')" title="Opciones">⋮</button>
        </div>
        <h3>${act.title}</h3>
        <p>${act.description || ""}</p>
        
        ${hasTicket ? `
          <button class="cta ticket-btn" data-ticket="${encodeURIComponent(act.file || uniqueId)}" onclick="openTicket('${act.file || uniqueId}')">
            Ver tickets 🎟
          </button>` 
        : ""}

        ${act.notes ? `<div class="notes">Tip: ${act.notes}</div>` : ""}
        <button class="cta secondary" onclick="toggleDone(this)">Marcar como hecho</button>
      `;
      
      activitiesContainer.appendChild(card);
    });

    timeline.appendChild(daySection);
  });

  if (typeof buildHomeNavigation === "function") buildHomeNavigation(days);
  if (typeof buildActivityChips === "function") buildActivityChips(days);
  
  return true;
}

document.addEventListener("click", e => {

  const btn = e.target.closest(".ticket-btn");
  if (!btn) return;

  const ticketId = btn.dataset.ticket;

  openTicketById(ticketId);

  console.log("Ticket button pressed:", ticketId);

});


/*función refresh Activities */
function refreshActivityChips() {

  const doneActivities = JSON.parse(localStorage.getItem("doneActivities") || "{}");

  document.querySelectorAll(".activity-chip").forEach(chip => {

      const id = chip.dataset.id;

    if (doneActivities[id]) {
      chip.classList.add("done");
    } else {
      chip.classList.remove("done");
    }

  });
}

refreshActivityChips();

function getCurrentTripDayIndex(days) {
  const today = new Date();
  today.setHours(0,0,0,0);

  for (let i = 0; i < days.length; i++) {
    const tripDate = new Date(days[i].date);
    tripDate.setHours(0,0,0,0);

    if (tripDate.getTime() === today.getTime()) {
      return i;
    }
  }
  return -1; // Hoy no es parte del viaje
}


/*calendario y filtros */
function buildHomeNavigation(days) {
  const calendar = document.getElementById("calendarNav");
  const cityFilters = document.getElementById("cityFilters");

  calendar.innerHTML = "";
  cityFilters.innerHTML = "";

  const cities = new Set();
  const todayIndex = getCurrentTripDayIndex(days);
  let todayCity = null;

  days.forEach((day, index) => {
    cities.add(day.city);

    const dateObj = new Date(day.date);
    const dayNumber = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString("es-MX", { month: "short" }).toUpperCase();

    const chip = document.createElement("div");
    chip.className = "day-chip";
    chip.innerHTML = `
      <div class="chip-date">
        <span class="chip-day">${dayNumber}</span>
        <span class="chip-month">${monthName}</span>
      </div>
      <div class="chip-city">${day.city}</div>
    `;


    chip.addEventListener("click", () => goToDay(index));

    // ⭐ Si este día es HOY
    if (index === todayIndex) {
      chip.classList.add("active");
      todayCity = day.city;

      // Mover carrusel automáticamente
      setTimeout(() => goToDay(index), 400);
    }

    calendar.appendChild(chip);
  });

  // Crear filtros de ciudad
  cities.forEach(city => {
    const chip = document.createElement("div");
    chip.className = "city-chip";
    chip.textContent = city;

    chip.onclick = () => filterByCity(city);

    // ⭐ Si esta ciudad corresponde al día actual
    if (city === todayCity) {
      chip.classList.add("active");
    }

    cityFilters.appendChild(chip);
  });
}


/* busqueda */
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  const noResults = document.getElementById("noResults");
  if (!searchInput) return;

  let searchTimeout;

  searchInput.addEventListener("input", e => {
    const term = e.target.value.toLowerCase().trim();

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      
      resetView();
      const cards = document.querySelectorAll(".card");
      const days = document.querySelectorAll(".day");
      let matches = 0;

      const normalizedTerm = term
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      // 🔄 Si está vacío → restaurar todo y NO buscar
      cards.forEach(card => card.style.display = "none"); // ocultamos todo primero
      days.forEach(day => day.style.display = "none");

      // ⛔ Evita buscar con 1 sola letra (incluye cuando borran)
      if (term.length < 2) return;

      showTimeline();
      // backHome();
      
      days.forEach(day => {
        const headerText = day.querySelector(".day-header").innerText
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const dayMatches = headerText.includes(normalizedTerm);
        const dayCards = day.querySelectorAll(".card");

        let cardMatchInDay = 0;

        dayCards.forEach(card => {
        const text = card.innerText
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const match = text.includes(normalizedTerm);

        if (match) {
          card.style.display = "block";
          cardMatchInDay++;
          matches++;
          }
        });

        // ✅ Si el HEADER coincide, mostrar todo el día completo
        if (dayMatches) {
          day.style.display = "block";
          dayCards.forEach(card => card.style.display = "block");
          matches++; // cuenta como resultado
        }
        // ✅ Si alguna card coincidió, mostrar el día
        else if (cardMatchInDay > 0) {
          day.style.display = "block";
        }
      });

      // 👇 Mostrar mensaje si no hay coincidencias
      if (matches === 0) {
        noResults.classList.remove("hidden");
      } else {
        noResults.classList.add("hidden");
      }

    }, 500);
  });
}

window.reloadAppViews = async function () {
  await loadTrip();
  await loadTickets();
  renderTickets();
  if (typeof setupSearch === "function") setupSearch();
};

document.addEventListener("DOMContentLoaded", async () => {
  await window.reloadAppViews();
  history.replaceState({ screen: "home" }, "", "#home");
});

/* día específico */
function goToDay(index) {
  showTimeline();
  resetView(); // 👈 IMPORTANTE
  // backHome();

  const days = document.querySelectorAll(".day");
  const timeline = document.getElementById("timeline");

  if (!days[index]) return;

  timeline.scrollTo({
    left: days[index].offsetLeft,
    behavior: "smooth"
  });
}


/* Filtrar por ciudad */
function filterByCity(city) {
  showTimeline();
  resetView(); // 👈 LIMPIA búsqueda previa
  // backHome();

  document.querySelectorAll(".day").forEach(day => {
    const title = day.querySelector("h2").textContent;
    day.style.display = title.includes(city) ? "block" : "none";
  });

  document.getElementById("timeline").scrollTo({ left: 0 });
}

function resetFilters() {
  document.querySelectorAll(".day").forEach(d => d.style.display = "block");
  document.querySelectorAll(".card").forEach(c => c.style.display = "block");
}


function showTimeline(push = true) {
  document.getElementById("homeScreen").style.display = "none";
  document.getElementById("backHome").style.display = "block";
  document.getElementById("timeline").style.display = "flex";

  currentScreen = "timeline";

  if (push) {
    history.pushState({ screen: "timeline" }, "", "#timeline");
  }
}


function backHome() {
  document.getElementById("backHome").style.display = "block";
}

function showHome(push = true) {
  document.getElementById("homeScreen").style.display = "block";
  document.getElementById("backHome").style.display = "none";
  document.getElementById("timeline").style.display = "none";

    currentScreen = "home";

  if (push) {
    history.pushState({ screen: "home" }, "", "#home");
  }
}

/* Escucha gesto back (swipe)*/
window.addEventListener("popstate", (event) => {

  const next = event.state?.screen || "home";

  // Si estamos viendo PDF y el siguiente estado NO es PDF → cerrar
  if (currentScreen === "pdf" && next !== "pdf") {
    closeTicket();
  }

  if (next === "timeline") {
    showTimeline(false);
  } else {
    showHome(false);
  }

  currentScreen = next;

  const overlay = document.getElementById("pdfOverlay");
  if (overlay.classList.contains("active")) {
    // Cerramos el overlay sin disparar otro pushState
    overlay.classList.remove("active");
    document.body.style.overflow = "auto";
  }
});


/* Función para RESET visual */
function resetView() {
  // Mostrar todos los días
  document.querySelectorAll(".day").forEach(day => {
    day.style.display = "block";
    backHome();
  });

  // Mostrar todas las cards
  document.querySelectorAll(".card").forEach(card => {
    card.style.display = "block";
    backHome();
  });
}

// 1. Delegación de eventos para tickets
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".ticket-btn");
  if (!btn) return;

  e.preventDefault();
  const rawTicket = btn.dataset.ticket;
  const ticketTarget = rawTicket ? decodeURIComponent(rawTicket) : null;
  if (ticketTarget) {
    console.log("Abriendo ticket desde botón:", ticketTarget);
    openTicket(ticketTarget);
  }
});

// 2. Función openTicket con soporte para PDF e imágenes (locales u online)
async function openTicket(target) {
  if (!target) return;

  const overlay = document.getElementById("pdfOverlay");
  const container = document.getElementById("pdfPagesContainer");

  try {
    overlay.classList.add("active");
    container.innerHTML = "<p style='color:white; padding:20px; text-align:center;'>Cargando ticket...</p>";
    document.body.style.overflow = "hidden";

    // Resolver URL (si es Blob, file relativo o ID de ticket)
    let resolvedUrl = await db.resolveTicketUrl(target);
    
    // Si no resolvió directamente pero es un string ID o file, buscar en ticketsData
    if (!resolvedUrl && typeof target === "string") {
      const match = ticketsData.find(t => t.id === target || t.file === target);
      if (match) {
        resolvedUrl = await db.resolveTicketUrl(match.fileBlob || match.file || match);
      }
    }

    if (!resolvedUrl) {
      container.innerHTML = "<p style='color:orange; padding:20px; text-align:center;'>No se encontró el archivo del ticket.</p>";
      return;
    }

    const isImage = (typeof resolvedUrl === "string" && /\.(jpe?g|png|webp|gif|bmp)($|\?)/i.test(resolvedUrl)) ||
                    (target.fileBlob && target.fileBlob.type && target.fileBlob.type.startsWith("image/"));

    if (isImage) {
      container.innerHTML = `
        <div style="padding:15px; text-align:center;">
          <img src="${resolvedUrl}" style="max-width:100%; max-height:80vh; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.6); object-fit:contain;" alt="Ticket" />
        </div>
      `;
    } else {
      // Renderizado con PDF.js
      const loadingTask = pdfjsLib.getDocument(resolvedUrl);
      const pdf = await loadingTask.promise;
      
      container.innerHTML = ""; 

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const canvas = document.createElement("canvas");
        canvas.style.display = "block";
        canvas.style.margin = "10px auto";
        canvas.style.maxWidth = "100%";
        container.appendChild(canvas);

        const context = canvas.getContext("2d");
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
      }
    }

    // Manejo de historial para cerrar con gesto atrás
    if (window.location.hash !== "#pdf") {
      history.pushState({ screen: "pdf" }, "", "#pdf");
    }

  } catch (err) {
    console.error("Error al cargar ticket:", err);
    container.innerHTML = `<p style='color:#ff6b6b; padding:20px; text-align:center;'>Error al cargar ticket: ${err.message}</p>`;
  }
}

// 3. Exponer a window por si acaso
window.openTicket = openTicket;

/* close Ticket */
// Función para cerrar
function closeTicket() {
  const overlay = document.getElementById("pdfOverlay");
  const container = document.getElementById("pdfPagesContainer");

  overlay.classList.remove("active");
  container.innerHTML = "";
  document.body.style.overflow = "auto";
  

  // Si entramos al PDF con un hash (#pdf), volvemos atrás
  if (window.location.hash === "#pdf") {
    window.history.back();
  }
}


// Vinculación del evento al cargar el script
document.addEventListener("DOMContentLoaded", () => {
    const btnCerrar = document.getElementById("closeTicket");
    if (btnCerrar) {
      btnCerrar.addEventListener("click", () => {
        history.back();
      });
    }
});

// Por si acaso algún botón usa onclick="closePdf()" en el HTML
window.closeTicket = closeTicket;
// function closeTicket() {
//   const viewer = document.getElementById("ticketViewer");
//   const container = document.getElementById("pdfContainer");

//   viewer.classList.remove("active");
//   container.innerHTML = "";
// }

document.getElementById("backHome")
  .addEventListener("click", showHome);

// document.getElementById("enterPin")
//   .addEventListener("click", checkPin);


window.openTicket = openTicket;
window.toggleDone = toggleDone;
// window.checkPin = checkPin;
window.showHome = showHome;



/* Marcador actividad hecha */
function toggleDone(btn) {
  // 1. Encontrar la tarjeta y su ID único
  const card = btn.closest(".card");
  const uniqueId = card.dataset.id;
  
  // 2. Cargar el estado actual de localStorage
  const doneActivities = JSON.parse(localStorage.getItem("doneActivities") || "{}");

  let isDone = false;
  // 3. Alternar el estado
  if (card.classList.contains("done")) {
    // DESMARCAR
    card.classList.remove("done");
    btn.textContent = "Marcar como hecho";
    delete doneActivities[uniqueId];
    isDone = false;
  } else {
    // MARCAR
    card.classList.add("done");
    btn.textContent = "Hecho ✓";
    doneActivities[uniqueId] = true;
    isDone = true;
  }

  // 4. Guardar en localStorage e IndexedDB
  localStorage.setItem("doneActivities", JSON.stringify(doneActivities));
  db.toggleActivity(uniqueId, isDone).catch(console.error);

  // 5. SINCRONIZACIÓN CON EL CHIP (La magia sucede aquí)
  const chip = document.querySelector(`.activity-chip[data-id="${uniqueId}"]`);
  
  if (chip) {
    if (doneActivities[uniqueId]) {
      chip.classList.add("done");
    } else {
      // Solo quitamos 'done' si la fecha de la actividad NO ha pasado
      // (Para mantener el auto-marcado por tiempo si así lo deseas)
      const now = new Date();
      const [datePart] = uniqueId.split('_'); // Extrae la fecha del ID
      if (new Date(datePart) > now) {
        chip.classList.remove("done");
      }
    }
  }
}

/* toggle actividades */
// 1. Seleccionamos ambos elementos
const visor = document.querySelector('#visor');
const contenido = document.querySelector('#activityChips');

// 2. Escuchamos el click en el botón
visor.addEventListener('click', () => {
  const displayActual = window.getComputedStyle(contenido).display;

  if (displayActual === 'none') {
  //   alert("Hola")
  //   contenido.style.display = 'flex'; // Aquí lo fuerzas a ser flex
      contenido.classList.add('flex');
      visor.classList.add('close');
  } else {
     contenido.classList.remove('flex');
     visor.classList.remove('close');
   }
});


/* PWA */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}


