/**
 * cms.js - Panel de control y edición móvil para itinerarios y boletos
 */

import { db } from "./db.js";

// Notificación Toast flotante
export function showToast(message, duration = 3200) {
  const toast = document.getElementById("toastNotification");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("visible");

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

// Inicialización del CMS
export async function initCMS() {
  await renderCMSHeader();
  await populateDaySelector();
  await renderDaysList();
  setupCMSTabs();
  setupActivityForm();
  setupDayForm();
  setupTripSelector();
  setupEditTripModal();
  setupSettingsActions();
  setupFileUploadPreview();
}

/**
 * Renderiza el encabezado del viaje en el CMS
 */
async function renderCMSHeader() {
  const { trip } = await db.getActiveTrip();
  const titleEl = document.getElementById("cmsTripTitle");
  const subEl = document.getElementById("cmsTripSubtitle");

  if (trip) {
    if (titleEl) titleEl.textContent = trip.name || "Mi Viaje";
    if (subEl) subEl.textContent = trip.subtitle || "Itinerario de viaje";
  } else {
    if (titleEl) titleEl.textContent = "Sin Viaje Activo";
    if (subEl) subEl.textContent = "Crea un viaje nuevo para comenzar";
  }
}

/**
 * Llena el selector de días en el formulario de actividades
 */
async function populateDaySelector(selectedDayId = null) {
  const select = document.getElementById("cmsActDaySelect");
  if (!select) return;

  const { days } = await db.getActiveTrip();
  select.innerHTML = "";

  if (!days || days.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "⚠️ Primero agrega un día o ciudad";
    select.appendChild(opt);
    return;
  }

  days.forEach((day, idx) => {
    const opt = document.createElement("option");
    opt.value = day.id;
    const dateFormatted = new Date(day.date).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short"
    });
    opt.textContent = `Día ${idx + 1}: ${day.city} (${dateFormatted})`;
    if (selectedDayId && day.id === selectedDayId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

/**
 * Renderiza la lista de días con botón de eliminar
 */
async function renderDaysList() {
  const container = document.getElementById("cmsDaysList");
  if (!container) return;

  const { days } = await db.getActiveTrip();
  container.innerHTML = "";

  if (!days || days.length === 0) {
    container.innerHTML = "<p class='empty-state-text'>No hay días agregados todavía.</p>";
    return;
  }

  days.forEach((day, idx) => {
    const item = document.createElement("div");
    item.className = "cms-day-item";

    const dateFormatted = new Date(day.date).toLocaleDateString("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });

    const actCount = (day.activities || []).length;

    item.innerHTML = `
      <div class="cms-day-info">
        <strong>${day.city} ${day.country || ""}</strong>
        <span class="cms-day-meta">${dateFormatted} • ${actCount} actividad${actCount === 1 ? "" : "es"}</span>
      </div>
      <div class="cms-day-actions">
        <button class="icon-btn delete-day-btn" title="Eliminar día" data-id="${day.id}">🗑</button>
      </div>
    `;

    item.querySelector(".delete-day-btn").addEventListener("click", async () => {
      if (confirm(`¿Eliminar ${day.city} (${dateFormatted}) y todas sus actividades?`)) {
        await db.deleteDay(day.id);
        showToast("Día eliminado");
        await reloadAll();
      }
    });

    container.appendChild(item);
  });
}

/**
 * Configuración de pestañas internas del CMS
 */
function setupCMSTabs() {
  const tabs = document.querySelectorAll(".cms-tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      document.querySelectorAll(".cms-tab-pane").forEach((pane) => {
        pane.classList.remove("active");
      });

      const paneId = "cmsTab" + targetTab.charAt(0).toUpperCase() + targetTab.slice(1);
      const activePane = document.getElementById(paneId);
      if (activePane) activePane.classList.add("active");
    });
  });

  // Botón rápido para saltar a agregar día desde el formulario de actividad
  const quickAddDayBtn = document.getElementById("cmsQuickAddDayBtn");
  if (quickAddDayBtn) {
    quickAddDayBtn.addEventListener("click", () => {
      const dayTabBtn = document.querySelector('.cms-tab-btn[data-tab="dias"]');
      if (dayTabBtn) dayTabBtn.click();
      const cityInput = document.getElementById("cmsDayCity");
      if (cityInput) cityInput.focus();
    });
  }
}

/**
 * Manejo del formulario de actividades
 */
function setupActivityForm() {
  const form = document.getElementById("cmsActivityForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const dayId = document.getElementById("cmsActDaySelect").value;
    if (!dayId) {
      alert("Por favor selecciona o crea un día primero.");
      return;
    }

    const { trip } = await db.getActiveTrip();
    if (!trip) return;

    const time = document.getElementById("cmsActTime").value || "10:00";
    const category = document.getElementById("cmsActCategory").value || "activity";
    const title = document.getElementById("cmsActTitle").value.trim();
    const description = document.getElementById("cmsActDesc").value.trim();
    const notes = document.getElementById("cmsActNotes").value.trim();

    const fileInput = document.getElementById("cmsActFile");
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

    const submitBtn = document.getElementById("cmsSubmitActBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    try {
      await db.addActivity(dayId, trip.id, {
        time,
        title,
        description,
        notes,
        fileBlob: file,
        fileName: file ? file.name : null,
        fileType: file ? file.type : null,
        category
      });

      // Limpiar formulario
      form.reset();
      clearFilePreview();
      showToast("¡Actividad guardada con éxito! 🎉");

      // Refrescar vistas
      await reloadAll();
    } catch (err) {
      console.error("Error al guardar actividad:", err);
      showToast("Error al guardar actividad");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar Actividad ✓";
    }
  });
}

/**
 * Manejo del formulario de días
 */
function setupDayForm() {
  const form = document.getElementById("cmsDayForm");
  if (!form) return;

  // Por defecto fecha de hoy
  const dateInput = document.getElementById("cmsDayDate");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const { trip } = await db.getActiveTrip();
    if (!trip) return;

    const dateVal = document.getElementById("cmsDayDate").value;
    const cityVal = document.getElementById("cmsDayCity").value.trim();
    const countryVal = document.getElementById("cmsDayCountry").value.trim();

    if (!cityVal) return;

    try {
      const dateIso = new Date(dateVal + "T12:00:00Z").toISOString();
      const newDay = await db.addDay(trip.id, {
        date: dateIso,
        city: cityVal,
        country: countryVal
      });

      form.reset();
      if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];

      showToast(`¡Día agregado: ${cityVal}! 📅`);

      await reloadAll();

      // Cambiar automáticamente a la pestaña de actividades con este día preseleccionado
      const actTab = document.querySelector('.cms-tab-btn[data-tab="actividad"]');
      if (actTab) actTab.click();
      await populateDaySelector(newDay.id);
    } catch (err) {
      console.error("Error al agregar día:", err);
      showToast("Error al agregar día");
    }
  });
}

/**
 * Previsualización de archivo seleccionado (PDF o foto)
 */
function setupFileUploadPreview() {
  const fileInput = document.getElementById("cmsActFile");
  const preview = document.getElementById("cmsFilePreview");
  const nameEl = document.getElementById("cmsFileName");
  const clearBtn = document.getElementById("cmsClearFileBtn");

  if (!fileInput || !preview || !nameEl) return;

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      nameEl.textContent = `📎 ${file.name} (${sizeMb} MB)`;
      preview.classList.remove("hidden");
    } else {
      clearFilePreview();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearFilePreview();
    });
  }
}

function clearFilePreview() {
  const fileInput = document.getElementById("cmsActFile");
  const preview = document.getElementById("cmsFilePreview");
  const nameEl = document.getElementById("cmsFileName");
  if (fileInput) fileInput.value = "";
  if (nameEl) nameEl.textContent = "";
  if (preview) preview.classList.add("hidden");
}

/**
 * Modal y Selector de Viajes
 */
function setupTripSelector() {
  const selectorBtn = document.getElementById("cmsTripSelectorBtn");
  const modal = document.getElementById("cmsTripSelectorModal");
  const closeBtn = document.getElementById("cmsCloseSelectorBtn");
  const newTripBtn = document.getElementById("cmsNewTripBtn");

  if (!selectorBtn || !modal) return;

  selectorBtn.addEventListener("click", async () => {
    await renderTripsList();
    modal.classList.remove("hidden");
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }

  if (newTripBtn) {
    newTripBtn.addEventListener("click", async () => {
      const name = prompt("Nombre del nuevo viaje:", "Mi Próximo Destino");
      if (!name) return;
      const sub = prompt("Subtítulo o descripción corta:", "Itinerario de viaje");

      const newTrip = await db.createTrip({ name, subtitle: sub });
      modal.classList.add("hidden");
      showToast(`¡Viaje "${newTrip.name}" creado! ✈️`);
      await reloadAll();
    });
  }
}

async function renderTripsList() {
  const container = document.getElementById("cmsTripsList");
  if (!container) return;

  const trips = await db.getAllTrips();
  const activeId = await db.getActiveTripId();
  container.innerHTML = "";

  if (trips.length === 0) {
    container.innerHTML = "<p>No hay viajes creados.</p>";
    return;
  }

  trips.forEach((t) => {
    const card = document.createElement("div");
    card.className = `cms-trip-card ${t.id === activeId ? "active" : ""}`;
    card.innerHTML = `
      <div>
        <strong>${t.name}</strong> ${t.id === activeId ? "⭐" : ""}
        <div style="font-size: 12px; color: #888;">${t.subtitle || ""}</div>
      </div>
      <button class="cta secondary small select-trip-btn">
        ${t.id === activeId ? "Activo" : "Seleccionar"}
      </button>
    `;

    card.querySelector(".select-trip-btn").addEventListener("click", async () => {
      await db.setActiveTripId(t.id);
      document.getElementById("cmsTripSelectorModal").classList.add("hidden");
      showToast(`Cambiado a "${t.name}"`);
      await reloadAll();
    });

    container.appendChild(card);
  });
}

/**
 * Modal para editar el nombre y subtítulo del viaje activo
 */
function setupEditTripModal() {
  const editBtn = document.getElementById("cmsEditTripBtn");
  const modal = document.getElementById("cmsEditTripModal");
  const closeBtn = document.getElementById("cmsCloseEditTripBtn");
  const form = document.getElementById("cmsEditTripForm");

  if (!editBtn || !modal || !form) return;

  editBtn.addEventListener("click", async () => {
    const { trip } = await db.getActiveTrip();
    if (!trip) return;

    document.getElementById("cmsEditTripName").value = trip.name || "";
    document.getElementById("cmsEditTripSub").value = trip.subtitle || "";
    modal.classList.remove("hidden");
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { trip } = await db.getActiveTrip();
    if (!trip) return;

    const name = document.getElementById("cmsEditTripName").value.trim();
    const subtitle = document.getElementById("cmsEditTripSub").value.trim();

    await db.updateTrip(trip.id, { name, subtitle });
    modal.classList.add("hidden");
    showToast("Viaje actualizado ✓");
    await reloadAll();
  });
}

/**
 * Acciones de ajustes: Exportar, Importar, Resetear demo, Eliminar
 */
function setupSettingsActions() {
  // Exportar viaje
  const exportBtn = document.getElementById("cmsExportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      const data = await db.exportTrip();
      if (!data) {
        alert("No hay ningún viaje activo para exportar.");
        return;
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const tripName = data.trip?.name || "viaje";
      const filename = `${tripName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_itinerario.json`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("¡Itinerario descargado! 📥");
    });
  }

  // Importar viaje
  const importInput = document.getElementById("cmsImportFileInput");
  if (importInput) {
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const imported = await db.importTripData(json);
        importInput.value = "";
        showToast(`¡Viaje "${imported.name}" importado! 🚀`);
        await reloadAll();
      } catch (err) {
        console.error("Error al importar viaje:", err);
        alert("El archivo JSON no tiene un formato válido de viaje.");
      }
    });
  }

  // Restaurar demo EuroTrip 2026
  const resetDemoBtn = document.getElementById("cmsResetDemoBtn");
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener("click", async () => {
      if (confirm("¿Deseas restaurar el itinerario demo de EuroTrip 2026? Se restablecerán los datos locales.")) {
        await db.resetToDemo();
        showToast("EuroTrip 2026 restaurado 🔄");
        await reloadAll();
      }
    });
  }

  // Eliminar viaje actual
  const deleteTripBtn = document.getElementById("cmsDeleteTripBtn");
  if (deleteTripBtn) {
    deleteTripBtn.addEventListener("click", async () => {
      const { trip } = await db.getActiveTrip();
      if (!trip) return;

      if (confirm(`¿Estás seguro de eliminar permanentemente el viaje "${trip.name}" y todos sus boletos?`)) {
        await db.deleteTrip(trip.id);
        showToast("Viaje eliminado 🗑");
        await reloadAll();
      }
    });
  }
}

/**
 * Función global para abrir el CMS con un día preseleccionado desde el timeline
 */
window.openCmsAddActivity = async function (dayId) {
  // Cambiar a pantalla CMS
  const navCmsBtn = document.querySelector('[data-screen="cms"]');
  if (navCmsBtn) navCmsBtn.click();

  // Asegurar pestaña de actividad activa
  const actTab = document.querySelector('.cms-tab-btn[data-tab="actividad"]');
  if (actTab) actTab.click();

  // Preseleccionar día
  await populateDaySelector(dayId);

  // Enfocar en título
  const titleInput = document.getElementById("cmsActTitle");
  if (titleInput) titleInput.focus();
};

/**
 * Refresca todas las vistas (CMS y timeline principal)
 */
async function reloadAll() {
  await renderCMSHeader();
  await populateDaySelector();
  await renderDaysList();

  // Si app.v2.js expuso reloadAppViews
  if (typeof window.reloadAppViews === "function") {
    await window.reloadAppViews();
  }
}

// Inicializar al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  initCMS();
});
