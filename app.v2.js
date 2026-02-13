import * as pdfjsLib from "./pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.mjs";

const PASSWORD = "euro2026"; // cámbialo

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

async function loadTrip() {
  const res = await fetch("data/trip.json");
  const data = await res.json();
  const timeline = document.getElementById("timeline");

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

      card.innerHTML = `
        <div class="time">${act.time}</div>
        <h3>${act.title}</h3>
        <p>${act.description || ""}</p>
        ${act.ticket ? `<button class="cta ticket-btn" data-ticket="${act.ticket}">Ver tickets 🎟</button>` : ""}

        ${act.notes ? `<div class="notes">Tip: ${act.notes}</div>` : ""}
        <button class="cta secondary" onclick="toggleDone(this)">Marcar como hecho ✓</button>
      `;

      activitiesContainer.appendChild(card);
    });

    timeline.appendChild(daySection);
  });

  buildHomeNavigation(data.days);

  return true; // 👈 IMPORTANTE
}

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
});

// function openLink(url) {
//   window.open(url, "_blank");
// }

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


function showTimeline() {
  document.getElementById("homeScreen").style.display = "none";
}

function backHome() {
  document.getElementById("backHome").style.display = "block";
}

function showHome() {
  document.getElementById("homeScreen").style.display = "block";
  document.getElementById("backHome").style.display = "none";
}


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

async function openTicket(url) {
  const overlay = document.getElementById("pdfOverlay");
  const container = document.getElementById("pdfPagesContainer");

  try {
    overlay.classList.add("active");
    // Limpiar contenido previo
    container.innerHTML = "";

    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;

    // Recorrer todas las páginas del documento
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // Crear un canvas para esta página específica
      const canvas = document.createElement("canvas");
      canvas.style.display = "block";
      canvas.style.margin = "10px auto"; // Espaciado entre páginas
      canvas.style.maxWidth = "100%";
      canvas.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
      
      container.appendChild(canvas);

      const context = canvas.getContext("2d");
      const viewport = page.getViewport({ scale: 2.0 }); // Alta resolución para lectura
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
    }

  } catch (err) {
    console.error("Error renderizando PDF multipágina:", err);
    overlay.classList.remove("active");
  }
}

/* close Ticket */
function closeTicket() {
  const overlay = document.getElementById("pdfOverlay");
  const container = document.getElementById("pdfPagesContainer");

  overlay.classList.remove("active");
  
  // Limpiamos los elementos canvas para liberar memoria
  setTimeout(() => {
    container.innerHTML = "";
  }, 300);
}
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


window.closeTicket = closeTicket;
window.openTicket = openTicket;
window.toggleDone = toggleDone;
window.checkPin = checkPin;
window.showHome = showHome;



/* Marcador actividad hecha */
function toggleDone(button) {
  const card = button.closest(".card");
  card.classList.toggle("done");

  if (card.classList.contains("done")) {
    button.textContent = "Hecho ✔";
  } else {
    button.textContent = "Marcar como hecho ✓";
  }
}

/* PWA */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}


