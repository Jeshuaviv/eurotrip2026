let currentScreen = "home";
let ticketsData = [];

import * as pdfjsLib from "./pdfjs/pdf.mjs";
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

  document.getElementById(screen + "Screen").classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.remove("active");
  });

  document.querySelector(`[data-screen="${screen}"]`).classList.add("active");
   // 👇 AQUÍ es donde se muestran los tickets
  if (screen === "tickets") {
    renderTickets();
  }
}

function checkPin() {
  const input = document.getElementById("pinInput").value;
  const error = document.getElementById("errorMsg");

  if (input === PASSWORD) {
    localStorage.setItem("trip_access", "granted");
    document.getElementById("lockscreen").style.display = "none";
  } else {
    error.textContent = "Código incorrecto";
  }
}

function checkAccessOnLoad() {
  if (localStorage.getItem("trip_access") === "granted") {
  }
}

checkAccessOnLoad();

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

  container.innerHTML = "";

  const now = new Date();

  const activities = [];

  // Obtener las actividades marcadas manualmente desde localStorage
  const doneActivities = JSON.parse(localStorage.getItem("doneActivities") || "{}");
  
  days.forEach(day => {
    const dayDate = new Date(day.date);

    (day.activities || []).forEach(act => {

      const uniqueId = day.date + "_" + act.title;

      activities.push({
        id: uniqueId,
        title: act.title,
        date: dayDate
      });

    });

  });

  // ordenar cronológicamente
  activities.sort((a, b) => a.date - b.date);

  activities.forEach(act => {
  const chip = document.createElement("div");
  chip.className = "activity-chip";
  chip.textContent = act.title;
  chip.dataset.id = act.id;

  // AQUÍ es donde debes usar la constante para que VS Code la detecte:
  const isManualDone = doneActivities[act.id] === true;
  const isAutoDone = act.date < now;

  if (isManualDone || isAutoDone) {
    chip.classList.add("done");
  }

  container.appendChild(chip);
});

  if (typeof refreshActivityChips === "function") {
    refreshActivityChips();
  } // 👈 importante llamarlo aquí
}

//carga de tickets
async function loadTickets() {
  const res = await fetch("data/tickets.json");
  const data = await res.json();
  ticketsData = data.tickets || data;

  ticketsData.forEach(ticket => {

    const container = document.getElementById(ticket.category + "Tickets");

    const btn = document.createElement("button");
    btn.textContent = ticket.title;

    btn.addEventListener("click", () => {
      openTicket(ticket.file);
    });

    container.appendChild(btn);
  });
}

function renderTickets() {

  document.getElementById("transportTickets").innerHTML = "";
  document.getElementById("activityTickets").innerHTML = "";
  document.getElementById("hotelTickets").innerHTML = "";

  ticketsData.forEach(ticket => {

    const container = document.getElementById(ticket.category + "Tickets");

    const card = document.createElement("div");
    card.className = "ticket-card";
    card.textContent = ticket.title;

    card.addEventListener("click", () => {
      openTicket(ticket.file);
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

  openTicket(ticket.file);
}

async function loadTrip() {
  const res = await fetch("data/trip.json");
  const data = await res.json();
  const timeline = document.getElementById("timeline");
  
  // Limpiar timeline por si acaso
  timeline.innerHTML = "";

  data.days.forEach(day => {
    const daySection = document.createElement("section");
    daySection.className = "day";

    daySection.innerHTML = `
      <div class="day-header">
        <h2>${day.city} – ${day.country}</h2>
        <p>${formatDate(day.date)}</p>
      </div>
      <div class="activities"></div>
    `;

    const activitiesContainer = daySection.querySelector(".activities");

    (day.activities || []).forEach(act => {
      const card = document.createElement("article");
      card.className = "card";

      // --- PASO CLAVE: Generar y asignar el ID ---
      const uniqueId = `${day.date}_${act.title}`.trim();
      card.dataset.id = uniqueId; 
      // -------------------------------------------
      
      // Usamos 'file' porque es lo que declaraste en tu JSON
      const hasTicket = act.file ? true : false;

      card.innerHTML = `
        <div class="time">${act.time}</div>
        <h3>${act.title}</h3>
        <p>${act.description || ""}</p>
        
        ${hasTicket ? `
          <button class="cta ticket-btn" onclick="openTicket('${act.file}')">
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

  if (typeof buildHomeNavigation === "function") buildHomeNavigation(data.days);
  if (typeof buildActivityChips === "function") buildActivityChips(data.days);
  
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

document.addEventListener("DOMContentLoaded", async () => {
  await loadTrip().then(setupSearch);
  history.replaceState({ screen: "home" }, "", "#home");
  await loadTickets(); 
  renderTickets();
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

// 1. Delegación de eventos (Captura el clic incluso en botones nuevos)
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".ticket-btn");
  if (!btn) return;

  e.preventDefault();
  const url = btn.dataset.ticket;
  console.log("Abriendo ticket desde:", url); // Para depurar
  openTicket(url);
});

// 2. Tu función openTicket (Asegúrate de que use el Canvas como vimos)
async function openTicket(url) {
  // 1. SILENCIAR EL ERROR: Si la URL es undefined, no hacemos nada y no lanzamos error crítico
  if (!url) return;
  // Si la URL es un objeto por error, tratamos de extraer el string
  const finalUrl = typeof url === 'string' ? url : url.file;

  if (!finalUrl) return;

  const overlay = document.getElementById("pdfOverlay");
  const container = document.getElementById("pdfPagesContainer");

  try {
    overlay.classList.add("active");
    container.innerHTML = "<p style='color:white; padding:20px;'>Cargando PDF...</p>";

    // USAREMOS 'url', que es lo que recibe la función
    const loadingTask = pdfjsLib.getDocument(url);
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

    // Manejo de historial para cerrar con 1 solo clic
    if (window.location.hash !== "#pdf") {
      history.pushState({ screen: "pdf" }, "", "#pdf");
    }

  } catch (err) {
    console.error("Error al cargar PDF:", err);
    container.innerHTML = `<p style='color:red; padding:20px;'>Error: ${err.message}</p>`;
  }
}

// 3. Exponer a window por si acaso (opcional si usas la delegación de arriba)
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

document.getElementById("enterPin")
  .addEventListener("click", checkPin);


window.openTicket = openTicket;
window.toggleDone = toggleDone;
window.checkPin = checkPin;
window.showHome = showHome;



/* Marcador actividad hecha */
function toggleDone(btn) {
  // 1. Encontrar la tarjeta y su ID único
  const card = btn.closest(".card");
  const uniqueId = card.dataset.id;
  
  // 2. Cargar el estado actual de localStorage
  const doneActivities = JSON.parse(localStorage.getItem("doneActivities") || "{}");

  // 3. Alternar el estado
  if (card.classList.contains("done")) {
    // DESMARCAR
    card.classList.remove("done");
    btn.textContent = "Marcar como hecho";
    delete doneActivities[uniqueId];
  } else {
    // MARCAR
    card.classList.add("done");
    btn.textContent = "Hecho ✓";
    doneActivities[uniqueId] = true;
  }

  // 4. Guardar en localStorage
  localStorage.setItem("doneActivities", JSON.stringify(doneActivities));

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


