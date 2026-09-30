/**
 * cms.js - Controlador integral de edición de viajes, actividades, modales independientes,
 * menú de opciones de 3 puntos, perfil y optimización de fotos para Recap.
 */

import { db } from "./db.js";

// Estado local
let currentEditingActId = null;
let currentPhotoActId = null;
let activeContextActId = null;
let initialFormState = {};

// Notificación Toast flotante
export function showToast(message, duration = 3000) {
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

/**
 * Inicialización principal
 */
export async function initCMS() {
  await checkOnboarding();
  setupActivityModal();
  setupDiscardDialog();
  setupPhotoRecapModal();
  setupCardContextMenu();
  setupProfileScreen();
  setupRenameTripModal();
}

/**
 * 1. Flujo de Onboarding (Primera Vez)
 */
async function checkOnboarding() {
  const hasTrips = await db.hasAnyTrips();
  const onboardingModal = document.getElementById("onboardingModal");
  if (!hasTrips && onboardingModal) {
    onboardingModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  // Formulario de onboarding
  const form = document.getElementById("onboardingTripForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("onboardingTripName").value.trim();
      const sub = document.getElementById("onboardingTripSub").value.trim() || "Itinerario de viaje";

      const newTrip = await db.createTrip({ name, subtitle: sub });
      if (onboardingModal) onboardingModal.classList.add("hidden");
      document.body.style.overflow = "auto";

      showToast(`¡Viaje "${newTrip.name}" creado! ✈️`);
      if (typeof window.reloadAppViews === "function") {
        await window.reloadAppViews();
      }

      // Llevar directo a agregar la primera actividad
      openActivityModal({ isFirstActivity: true });
    });
  }

  // Botón para explorar con viaje demo EuroTrip 2026
  const demoBtn = document.getElementById("onboardingDemoBtn");
  if (demoBtn) {
    demoBtn.addEventListener("click", async () => {
      await db.seedIfEmpty();
      if (onboardingModal) onboardingModal.classList.add("hidden");
      document.body.style.overflow = "auto";
      showToast("¡Bienvenido a EuroTrip 2026! 🎉");
      if (typeof window.reloadAppViews === "function") {
        await window.reloadAppViews();
      }
    });
  }
}

/**
 * 2. Modal Independiente de Actividades (Crear / Editar)
 */
function setupActivityModal() {
  const modal = document.getElementById("activityModal");
  const form = document.getElementById("standaloneActivityForm");
  const closeBtn = document.getElementById("closeActivityModalBtn");
  const fileInput = document.getElementById("actModalFile");
  const clearFileBtn = document.getElementById("actModalClearFileBtn");

  if (!modal || !form) return;

  // Cierre controlado con verificación de cambios sin guardar
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      attemptCloseActivityModal();
    });
  }

  // Previsualización de archivo
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const preview = document.getElementById("actModalFilePreview");
      const nameEl = document.getElementById("actModalFileName");
      if (fileInput.files && fileInput.files[0]) {
        const f = fileInput.files[0];
        const mb = (f.size / (1024 * 1024)).toFixed(2);
        if (nameEl) nameEl.textContent = `📎 ${f.name} (${mb} MB)`;
        if (preview) preview.classList.remove("hidden");
      } else {
        clearModalFilePreview();
      }
    });
  }

  if (clearFileBtn) {
    clearFileBtn.addEventListener("click", clearModalFilePreview);
  }

  // Submit del formulario
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const tripData = await db.getActiveTrip();
    let trip = tripData.trip;
    if (!trip) {
      trip = await db.createTrip({ name: "Mi Viaje" });
    }

    const editId = document.getElementById("actEditId").value;
    const dateVal = document.getElementById("actModalDate").value;
    const timeVal = document.getElementById("actModalTime").value || "09:00";
    const cityVal = document.getElementById("actModalCity").value.trim() || "Destino";
    const countryVal = document.getElementById("actModalCountry").value.trim() || "";
    const category = document.getElementById("actModalCategory").value || "activity";
    const titleVal = document.getElementById("actModalTitle").value.trim();
    const descVal = document.getElementById("actModalDesc").value.trim();
    const notesVal = document.getElementById("actModalNotes").value.trim();

    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

    const submitBtn = document.getElementById("saveActivityBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    try {
      // 1. Encontrar o crear el día de forma transparente
      const day = await db.findOrCreateDay(trip.id, {
        date: dateVal + "T12:00:00Z",
        city: cityVal,
        country: countryVal
      });

      if (editId) {
        // Modo Edición
        const updates = {
          dayId: day.id,
          time: timeVal,
          category,
          title: titleVal,
          description: descVal,
          notes: notesVal
        };
        if (file) {
          updates.fileBlob = file;
          updates.fileName = file.name;
          updates.fileType = file.type;
        }
        await db.updateActivity(editId, updates);
        showToast("¡Actividad actualizada! ✓");
      } else {
        // Modo Creación
        await db.addActivity(day.id, trip.id, {
          time: timeVal,
          title: titleVal,
          description: descVal,
          notes: notesVal,
          category,
          fileBlob: file,
          fileName: file ? file.name : null,
          fileType: file ? file.type : null
        });
        showToast("¡Actividad guardada! 🎉");
      }

      // Cerrar modal de forma limpia
      forceCloseActivityModal();

      // Refrescar vistas del inicio
      if (typeof window.reloadAppViews === "function") {
        await window.reloadAppViews();
      }

      // Retornar a la pantalla de Inicio para ver el timeline
      const homeBtn = document.querySelector('[data-screen="home"]');
      if (homeBtn) homeBtn.click();

    } catch (err) {
      console.error("Error al guardar actividad:", err);
      showToast("Error al guardar actividad");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar Actividad ✓";
    }
  });
}

function clearModalFilePreview() {
  const fileInput = document.getElementById("actModalFile");
  const preview = document.getElementById("actModalFilePreview");
  const nameEl = document.getElementById("actModalFileName");
  if (fileInput) fileInput.value = "";
  if (nameEl) nameEl.textContent = "";
  if (preview) preview.classList.add("hidden");
}

/**
 * Abre el modal de actividad (Crear o Editar)
 */
export async function openActivityModal(options = {}) {
  const modal = document.getElementById("activityModal");
  const form = document.getElementById("standaloneActivityForm");
  const titleEl = document.getElementById("activityModalTitle");
  const submitBtn = document.getElementById("saveActivityBtn");

  if (!modal || !form) return;

  clearModalFilePreview();

  const { activityId, dayId, defaultDate, defaultCity, defaultCountry } = options;

  if (activityId) {
    // MODO EDICIÓN
    currentEditingActId = activityId;
    document.getElementById("actEditId").value = activityId;
    titleEl.textContent = "Editar Actividad";
    submitBtn.textContent = "Actualizar Cambios ✓";

    const act = await db.getActivity(activityId);
    if (act) {
      document.getElementById("actModalTime").value = act.time || "09:00";
      document.getElementById("actModalCategory").value = act.category || "activity";
      document.getElementById("actModalTitle").value = act.title || "";
      document.getElementById("actModalDesc").value = act.description || "";
      document.getElementById("actModalNotes").value = act.notes || "";

      // Cargar fecha y ciudad del día
      if (act.dayId) {
        const day = await db.get("days", act.dayId);
        if (day) {
          document.getElementById("actModalDate").value = day.date ? day.date.split("T")[0] : "";
          document.getElementById("actModalCity").value = day.city || "";
          document.getElementById("actModalCountry").value = day.country || "";
        }
      }
    }
  } else {
    // MODO CREACIÓN
    currentEditingActId = null;
    document.getElementById("actEditId").value = "";
    titleEl.textContent = "Nueva Actividad";
    submitBtn.textContent = "Guardar Actividad ✓";
    form.reset();

    // Fecha por defecto
    const todayStr = new Date().toISOString().split("T")[0];
    const targetDate = defaultDate ? defaultDate.split("T")[0] : todayStr;
    document.getElementById("actModalDate").value = targetDate;
    document.getElementById("actModalTime").value = "09:00";
    document.getElementById("actModalCity").value = defaultCity || "";
    document.getElementById("actModalCountry").value = defaultCountry || "";
  }

  // Guardar estado inicial para detectar cambios
  initialFormState = getFormSnapshot();

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
window.openActivityModal = openActivityModal;

function getFormSnapshot() {
  return {
    title: document.getElementById("actModalTitle")?.value || "",
    desc: document.getElementById("actModalDesc")?.value || "",
    notes: document.getElementById("actModalNotes")?.value || "",
    time: document.getElementById("actModalTime")?.value || "",
    city: document.getElementById("actModalCity")?.value || "",
    hasFile: Boolean(document.getElementById("actModalFile")?.files?.length)
  };
}

function isFormDirty() {
  const current = getFormSnapshot();
  return (
    current.title !== initialFormState.title ||
    current.desc !== initialFormState.desc ||
    current.notes !== initialFormState.notes ||
    current.city !== initialFormState.city ||
    current.hasFile !== initialFormState.hasFile
  );
}

function attemptCloseActivityModal() {
  if (isFormDirty()) {
    const discardDialog = document.getElementById("confirmDiscardModal");
    if (discardDialog) discardDialog.classList.remove("hidden");
  } else {
    forceCloseActivityModal();
  }
}

function forceCloseActivityModal() {
  const modal = document.getElementById("activityModal");
  if (modal) modal.classList.add("hidden");
  document.body.style.overflow = "auto";
  currentEditingActId = null;
}

/**
 * 3. Diálogo de Confirmación de Descarte
 */
function setupDiscardDialog() {
  const cancelBtn = document.getElementById("cancelDiscardBtn");
  const confirmBtn = document.getElementById("confirmDiscardBtn");
  const dialog = document.getElementById("confirmDiscardModal");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (dialog) dialog.classList.add("hidden");
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      if (dialog) dialog.classList.add("hidden");
      forceCloseActivityModal();
    });
  }
}

/**
 * 4. Menú Contextual (3 puntos) en Cards del Timeline
 */
function setupCardContextMenu() {
  const menu = document.getElementById("cardContextMenu");
  const editBtn = document.getElementById("contextEditBtn");
  const deleteBtn = document.getElementById("contextDeleteBtn");

  if (!menu) return;

  // Cerrar menú al hacer clic en cualquier otra parte
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".card-menu-btn") && !e.target.closest("#cardContextMenu")) {
      menu.classList.add("hidden");
    }
  });

  if (editBtn) {
    editBtn.addEventListener("click", async () => {
      menu.classList.add("hidden");
      if (activeContextActId) {
        await openActivityModal({ activityId: activeContextActId });
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      menu.classList.add("hidden");
      if (!activeContextActId) return;

      if (confirm("¿Estás seguro de eliminar esta actividad del itinerario?")) {
        await db.deleteActivity(activeContextActId);
        showToast("Actividad eliminada 🗑");
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      }
    });
  }
}

export function openCardContextMenu(event, activityId) {
  event.stopPropagation();
  activeContextActId = activityId;
  const menu = document.getElementById("cardContextMenu");
  if (!menu) return;

  // Posicionar menú cerca del botón
  const rect = event.target.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(10, rect.right - 160)}px`;
  menu.classList.remove("hidden");
}
window.openCardContextMenu = openCardContextMenu;

/**
 * 5. Optimizador de Imágenes y Modal de Fotos para Recap
 */
async function optimizeImage(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else resolve(file);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupPhotoRecapModal() {
  const modal = document.getElementById("activityPhotoModal");
  const closeBtn = document.getElementById("closePhotoModalBtn");
  const photoInput = document.getElementById("activityPhotoInput");

  if (!modal) return;

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.body.style.overflow = "auto";
    });
  }

  if (photoInput) {
    photoInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file || !currentPhotoActId) return;

      showToast("Optimizando foto para Recap... ⏳");
      try {
        const optimizedBlob = await optimizeImage(file);
        await db.addActivityPhoto(currentPhotoActId, optimizedBlob);
        photoInput.value = "";
        showToast("¡Foto agregada al Recap! 📸");
        await renderActivityPhotos(currentPhotoActId);
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      } catch (err) {
        console.error("Error optimizando foto:", err);
        showToast("Error al subir foto");
      }
    });
  }
}

export async function openActivityPhotoModal(activityId) {
  currentPhotoActId = activityId;
  const modal = document.getElementById("activityPhotoModal");
  if (!modal) return;

  const act = await db.getActivity(activityId);
  const titleEl = document.getElementById("photoModalActTitle");
  const metaEl = document.getElementById("photoModalActMeta");

  if (act) {
    if (titleEl) titleEl.textContent = act.title;
    let meta = act.time || "";
    if (act.dayId) {
      const day = await db.get("days", act.dayId);
      if (day) meta += ` • ${day.city} (${new Date(day.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })})`;
    }
    if (metaEl) metaEl.textContent = meta;
  }

  await renderActivityPhotos(activityId);
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
window.openActivityPhotoModal = openActivityPhotoModal;

async function renderActivityPhotos(activityId) {
  const container = document.getElementById("activityPhotosGrid");
  if (!container) return;

  const photos = await db.getActivityPhotos(activityId);
  container.innerHTML = "";

  if (!photos || photos.length === 0) {
    container.innerHTML = "<p class='empty-state-text'>Aún no has agregado fotos a esta actividad.</p>";
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("div");
    card.className = "photo-thumb-card";
    const imgUrl = URL.createObjectURL(photo.blob);

    card.innerHTML = `
      <img src="${imgUrl}" alt="Recap" />
      <button class="delete-photo-btn" data-id="${photo.id}">✕</button>
    `;

    card.querySelector(".delete-photo-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("¿Eliminar esta foto del Recap?")) {
        await db.removeActivityPhoto(activityId, photo.id);
        URL.revokeObjectURL(imgUrl);
        await renderActivityPhotos(activityId);
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      }
    });

    container.appendChild(card);
  });
}

/**
 * 6. Pantalla Mi Perfil (Mis Viajes, Días, Respaldo)
 */
export async function renderProfileScreen() {
  const { trip, days } = await db.getActiveTrip();

  // Nombre viaje activo
  const nameEl = document.getElementById("profileActiveTripName");
  const subEl = document.getElementById("profileActiveTripSub");
  if (trip) {
    if (nameEl) nameEl.textContent = trip.name;
    if (subEl) subEl.textContent = trip.subtitle || "Itinerario activo";
  }

  // Lista de viajes
  const tripsContainer = document.getElementById("profileTripsList");
  if (tripsContainer) {
    const allTrips = await db.getAllTrips();
    const activeId = await db.getActiveTripId();
    tripsContainer.innerHTML = "";

    allTrips.forEach((t) => {
      const isCurrent = t.id === activeId;
      const card = document.createElement("div");
      card.className = `profile-trip-item ${isCurrent ? "active" : ""}`;
      card.innerHTML = `
        <div class="trip-item-info">
          <strong>${t.name}</strong> ${isCurrent ? "⭐" : ""}
          <span class="sub-text">${t.subtitle || ""}</span>
        </div>
        <button class="cta secondary small switch-trip-btn" ${isCurrent ? "disabled" : ""}>
          ${isCurrent ? "Activo" : "Seleccionar"}
        </button>
      `;

      card.querySelector(".switch-trip-btn").addEventListener("click", async () => {
        await db.setActiveTripId(t.id);
        showToast(`Cambiado a "${t.name}" ✈️`);
        await renderProfileScreen();
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      });

      tripsContainer.appendChild(card);
    });
  }

  // Inventario de días
  const daysContainer = document.getElementById("profileDaysList");
  if (daysContainer) {
    daysContainer.innerHTML = "";
    if (!days || days.length === 0) {
      daysContainer.innerHTML = "<p class='empty-state-text'>No hay días agregados aún.</p>";
    } else {
      days.forEach((day, idx) => {
        const item = document.createElement("div");
        item.className = "profile-day-row";
        const dateStr = new Date(day.date).toLocaleDateString("es-MX", {
          day: "numeric",
          month: "short"
        });
        const actCount = (day.activities || []).length;

        item.innerHTML = `
          <div>
            <strong>Día ${idx + 1}: ${day.city} ${day.country || ""}</strong>
            <span class="sub-text">${dateStr} • ${actCount} actividad${actCount === 1 ? "" : "es"}</span>
          </div>
          <button class="icon-btn delete-day-btn" data-id="${day.id}" title="Eliminar día">🗑</button>
        `;

        item.querySelector(".delete-day-btn").addEventListener("click", async () => {
          if (confirm(`¿Eliminar ${day.city} y todas sus actividades?`)) {
            await db.deleteDay(day.id);
            showToast("Día eliminado");
            await renderProfileScreen();
            if (typeof window.reloadAppViews === "function") {
              await window.reloadAppViews();
            }
          }
        });

        daysContainer.appendChild(item);
      });
    }
  }
}
window.renderProfileScreen = renderProfileScreen;

function setupProfileScreen() {
  // Crear nuevo viaje
  const newTripBtn = document.getElementById("profileNewTripBtn");
  if (newTripBtn) {
    newTripBtn.addEventListener("click", async () => {
      const name = prompt("Nombre de tu nuevo viaje:", "Próximo Destino");
      if (!name) return;
      const sub = prompt("Subtítulo (opcional):", "Itinerario de viaje") || "";

      const trip = await db.createTrip({ name, subtitle: sub });
      showToast(`¡Viaje "${trip.name}" creado! ✈️`);
      await renderProfileScreen();
      if (typeof window.reloadAppViews === "function") {
        await window.reloadAppViews();
      }
      openActivityModal({ isFirstActivity: true });
    });
  }

  // Exportar viaje
  const exportBtn = document.getElementById("profileExportBtn");
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
  const importInput = document.getElementById("profileImportFileInput");
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
        await renderProfileScreen();
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      } catch (err) {
        console.error("Error al importar:", err);
        alert("El archivo no tiene un formato válido de viaje.");
      }
    });
  }

  // Restaurar demo
  const resetDemoBtn = document.getElementById("profileResetDemoBtn");
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener("click", async () => {
      if (confirm("¿Cargar el itinerario demo de EuroTrip 2026? Se restablecerán los datos locales.")) {
        await db.resetToDemo();
        showToast("EuroTrip 2026 cargado 🔄");
        await renderProfileScreen();
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      }
    });
  }

  // Eliminar viaje activo
  const deleteTripBtn = document.getElementById("profileDeleteTripBtn");
  if (deleteTripBtn) {
    deleteTripBtn.addEventListener("click", async () => {
      const { trip } = await db.getActiveTrip();
      if (!trip) return;

      if (confirm(`¿Eliminar permanentemente el viaje "${trip.name}" y todos sus boletos?`)) {
        await db.deleteTrip(trip.id);
        showToast("Viaje eliminado 🗑");
        await renderProfileScreen();
        if (typeof window.reloadAppViews === "function") {
          await window.reloadAppViews();
        }
      }
    });
  }
}

/**
 * 7. Modal para Renombrar Viaje
 */
function setupRenameTripModal() {
  const openBtn = document.getElementById("profileEditTripBtn");
  const modal = document.getElementById("editTripNameModal");
  const cancelBtn = document.getElementById("cancelEditTripNameBtn");
  const form = document.getElementById("editTripNameForm");

  if (!openBtn || !modal || !form) return;

  openBtn.addEventListener("click", async () => {
    const { trip } = await db.getActiveTrip();
    if (!trip) return;
    document.getElementById("editTripNameInput").value = trip.name || "";
    document.getElementById("editTripSubInput").value = trip.subtitle || "";
    modal.classList.remove("hidden");
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { trip } = await db.getActiveTrip();
    if (!trip) return;

    const name = document.getElementById("editTripNameInput").value.trim();
    const subtitle = document.getElementById("editTripSubInput").value.trim();

    await db.updateTrip(trip.id, { name, subtitle });
    modal.classList.add("hidden");
    showToast("Viaje actualizado ✓");
    await renderProfileScreen();
    if (typeof window.reloadAppViews === "function") {
      await window.reloadAppViews();
    }
  });
}

// Inicializar al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  initCMS();
});
