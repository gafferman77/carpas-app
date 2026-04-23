let currentDate = new Date();
let selectedDate = new Date();
let activeView = "day";
let activeTab = "eventos";
let editingEventoId = null;
let editingNotaId = null;
let editingTareaId = null;
let db = null;
let firebaseReady = false;
let useLocalStorage = false;
let auth = null;
let messaging = null;
let notificationTimer = null;
let swRegistration = null;
let googleCalendarAccessToken = "";
const PENDING_GOOGLE_ACTION_KEY = "agenda_pending_google_action";
const ENABLE_GOOGLE_CALENDAR = false;

const LOCAL_KEY = "agendaMarioData";
const GLOBAL_KEY = "global_data";
const LEGACY_GLOBAL_KEY = "__global__";
const FCM_VAPID_KEY = "BNCTKP4qCDBGFiFGSwqe7Z70DmE7B1pTBHUsXmjIKUBEi6e_6uWr8ijW442LI0rNGS9PdVN7EFyRvkgK5QCR2ro";

const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dayNames = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const fullDayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

const asuntoMeta = {
    Personal: { color: "#a855f7", emoji: "🟣" },
    Abundancia: { color: "#16a34a", emoji: "💰" },
    Hijos: { color: "#ef4444", emoji: "👨‍👧‍👦" },
    Lau: { color: "#f472b6", emoji: "💗" },
    Club: { color: "#facc15", emoji: "⚽" },
    Cine: { color: "#3b82f6", emoji: "🎬" },
    Teatro: { color: "#22c55e", emoji: "🎭" },
    novela: { color: "#f97316", emoji: "📖" },
    medico: { color: "#f59e0b", emoji: "🩺" },
    parque: { color: "#14532d", emoji: "🌳" }
};

// Pega aqui tu configuracion de Firebase (Project Settings > General > Your apps > SDK setup and config)
const firebaseConfig = {
    apiKey: "AIzaSyDlsbXBrkzmpEJTLP2l8e77te63yXAlutw",
    authDomain: "agenda-roots-v2.firebaseapp.com",
    projectId: "agenda-roots-v2",
    storageBucket: "agenda-roots-v2.firebasestorage.app",
    messagingSenderId: "60615586442",
    appId: "1:60615586442:web:72e18c5984a5412ca77373"
};

const state = {};
const monthGrid = document.getElementById("month-grid");
const weekView = document.getElementById("week-view");
const selectedDateTitle = document.getElementById("selected-date-title");
const panelContent = document.getElementById("panel-content");
const estadoVacio = document.getElementById("estado-vacio");

function hasFirebaseConfig() {
    return !Object.values(firebaseConfig).some((value) => String(value).startsWith("REEMPLAZAR_"));
}

function loadLocalState() {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) {
            return {};
        }
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function persistLocalState() {
    if (!useLocalStorage) {
        return;
    }
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn("No se pudo guardar en localStorage", e);
    }
}

function hydrateFromLocal() {
    const stored = loadLocalState();
    Object.keys(stored).forEach((key) => {
        const d = stored[key];
        const eventos = Array.isArray(d.eventos) ? d.eventos : [];
        const notas = Array.isArray(d.notas) ? d.notas : [];
        const tareas = Array.isArray(d.tareas) ? d.tareas : [];
        state[key] = {
            eventos: eventos.map(normalizeEvento),
            notas: notas.map(normalizeNota),
            tareas: tareas.map(normalizeTarea)
        };
    });
}

function initFirebase() {
    if (typeof firebase === "undefined") {
        console.warn("Firebase SDK no cargado. Modo local.");
        useLocalStorage = true;
        return;
    }
    if (!hasFirebaseConfig()) {
        console.warn("Firebase sin configurar. Modo local (localStorage).");
        useLocalStorage = true;
        return;
    }
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        auth = firebase.auth();
        if (firebase.messaging && typeof firebase.messaging === "function") {
            messaging = firebase.messaging();
        }
        db = firebase.firestore();
        firebaseReady = true;
        useLocalStorage = false;
    } catch (e) {
        console.error("Firebase init error", e);
        firebaseReady = false;
        useLocalStorage = true;
    }
}

function asuntoColor(asunto) {
    return asuntoMeta[asunto]?.color || "#64748b";
}

function asuntoLabel(asunto) {
    if (!asuntoMeta[asunto]) {
        return asunto;
    }
    return `${asuntoMeta[asunto].emoji} ${asunto}`;
}

function newEventId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEvento(raw) {
    const e = typeof raw === "object" && raw ? raw : {};
    return {
        id: e.id || newEventId(),
        titulo: String(e.titulo ?? "").trim() || "(sin titulo)",
        asunto: String(e.asunto ?? "Personal"),
        hora: String(e.hora ?? "").trim() || "09:00",
        descripcion: e.descripcion != null ? String(e.descripcion) : "",
        googleEventId: e.googleEventId != null ? String(e.googleEventId) : "",
        googleCalendarId: e.googleCalendarId != null ? String(e.googleCalendarId) : "primary"
    };
}

function newNotaId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `no_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function newTareaId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `ta_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeNota(raw) {
    if (typeof raw === "string") {
        return { id: newNotaId(), texto: raw.trim() || "(vacio)", creadaEn: dateKey(new Date()) };
    }
    const e = raw && typeof raw === "object" ? raw : {};
    return {
        id: e.id || newNotaId(),
        texto: String(e.texto ?? "").trim() || "(vacio)",
        creadaEn: String(e.creadaEn ?? dateKey(new Date()))
    };
}

function normalizeTarea(raw) {
    const e = raw && typeof raw === "object" ? raw : {};
    return {
        id: e.id || newTareaId(),
        texto: String(e.texto ?? "").trim() || "(sin texto)",
        hecha: Boolean(e.hecha),
        creadaEn: String(e.creadaEn ?? dateKey(new Date()))
    };
}

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDayData(key) {
    if (!state[key]) {
        state[key] = { eventos: [], notas: [], tareas: [] };
    }
    return state[key];
}

function getGlobalData() {
    migrateLegacyGlobalDataIfNeeded();
    return getDayData(GLOBAL_KEY);
}

function migrateLegacyGlobalDataIfNeeded() {
    if (GLOBAL_KEY === LEGACY_GLOBAL_KEY) {
        return;
    }
    if (!state[LEGACY_GLOBAL_KEY]) {
        return;
    }
    const legacy = state[LEGACY_GLOBAL_KEY];
    const globalData = getDayData(GLOBAL_KEY);
    const hasCurrentData = globalData.eventos.length || globalData.notas.length || globalData.tareas.length;
    if (!hasCurrentData) {
        globalData.eventos = Array.isArray(legacy.eventos) ? legacy.eventos.map(normalizeEvento) : [];
        globalData.notas = Array.isArray(legacy.notas) ? legacy.notas.map(normalizeNota) : [];
        globalData.tareas = Array.isArray(legacy.tareas) ? legacy.tareas.map(normalizeTarea) : [];
    }
    delete state[LEGACY_GLOBAL_KEY];
    persistLocalState();
}

function formatDateKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) {
        return "fecha desconocida";
    }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${fullDayNames[d.getDay()]}, ${d.getDate()} de ${nombresMeses[d.getMonth()]} ${d.getFullYear()}`;
}

async function ensureDayLoaded(key) {
    if (!firebaseReady) {
        getDayData(key);
        return;
    }
    if (state[key]) {
        return;
    }
    try {
        const snapshot = await db.collection("agendaDays").doc(key).get();
        if (snapshot.exists) {
            const data = snapshot.data();
            const eventos = Array.isArray(data.eventos) ? data.eventos : [];
            const notas = Array.isArray(data.notas) ? data.notas : [];
            const tareas = Array.isArray(data.tareas) ? data.tareas : [];
            state[key] = {
                eventos: eventos.map(normalizeEvento),
                notas: notas.map(normalizeNota),
                tareas: tareas.map(normalizeTarea)
            };
            return;
        }
        state[key] = { eventos: [], notas: [], tareas: [] };
    } catch (e) {
        console.error("Firestore read error", key, e);
        getDayData(key);
    }
}

async function saveDay(key) {
    if (useLocalStorage) {
        persistLocalState();
        return;
    }
    if (!firebaseReady) {
        return;
    }
    try {
        await db.collection("agendaDays").doc(key).set(getDayData(key), { merge: true });
    } catch (e) {
        console.error("Firestore write error", key, e);
        useLocalStorage = true;
        persistLocalState();
    }
}

async function preloadMonthData() {
    const totalDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const promises = [];
    for (let day = 1; day <= totalDays; day += 1) {
        const key = dateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
        promises.push(ensureDayLoaded(key));
    }
    await Promise.all(promises);
}

function setAsuntoOptions() {
    const select = document.getElementById("evento-asunto");
    select.innerHTML = "";
    Object.keys(asuntoMeta).forEach((asunto) => {
        const option = document.createElement("option");
        option.value = asunto;
        option.textContent = asuntoLabel(asunto);
        select.appendChild(option);
    });
}

function initCalendar() {
    monthGrid.innerHTML = "";
    document.getElementById("nombre-mes").textContent = `${nombresMeses[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;

    dayNames.forEach((name) => {
        const header = document.createElement("div");
        header.className = "day-header";
        header.textContent = name;
        monthGrid.appendChild(header);
    });

    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const totalDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    for (let i = 0; i < startDay; i += 1) {
        const empty = document.createElement("div");
        empty.className = "day-cell empty";
        monthGrid.appendChild(empty);
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const cell = document.createElement("div");
        cell.className = "day-cell";
        const key = dateKey(cellDate);
        const data = getDayData(key);

        if (isSameDate(cellDate, new Date())) {
            cell.classList.add("today");
        }
        if (isSameDate(cellDate, selectedDate)) {
            cell.classList.add("selected");
        }

        const number = document.createElement("span");
        number.className = "day-number";
        number.textContent = String(day);
        cell.appendChild(number);

        const dots = document.createElement("div");
        dots.className = "mini-dots";
        data.eventos.slice(0, 4).forEach((evento) => {
            const dot = document.createElement("span");
            dot.className = "day-dot";
            dot.style.backgroundColor = asuntoColor(evento.asunto);
            dots.appendChild(dot);
        });
        cell.appendChild(dots);

        cell.addEventListener("click", async () => {
            const prevKey = dateKey(selectedDate);
            const nextKey = dateKey(cellDate);
            selectedDate = cellDate;
            if (prevKey !== nextKey) {
                clearEventoForm();
                clearNotaForm();
                clearTareaForm();
            }
            await ensureDayLoaded(nextKey);
            showSelectedContent();
            initCalendar();
            if (activeView === "week") {
                renderWeekView();
            }
        });

        monthGrid.appendChild(cell);
    }
}

function startOfWeek(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function renderWeekView() {
    weekView.innerHTML = "";
    const start = startOfWeek(selectedDate);
    for (let i = 0; i < 7; i += 1) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const key = dateKey(dayDate);
        const data = getDayData(key);

        const dayEl = document.createElement("div");
        dayEl.className = "week-day";
        if (isSameDate(dayDate, selectedDate)) {
            dayEl.classList.add("selected");
        }
        dayEl.innerHTML = `<h4>${fullDayNames[dayDate.getDay()]} ${dayDate.getDate()}</h4>`;
        dayEl.addEventListener("click", async () => {
            const prevKey = dateKey(selectedDate);
            selectedDate = dayDate;
            const nextKey = dateKey(selectedDate);
            if (prevKey !== nextKey) {
                clearEventoForm();
            }
            await ensureDayLoaded(nextKey);
            showSelectedContent();
            initCalendar();
            renderWeekView();
            switchTab("eventos");
            document.getElementById("evento-titulo").focus();
        });

        if (data.eventos.length === 0) {
            const empty = document.createElement("p");
            empty.className = "week-item";
            empty.style.background = "#334155";
            empty.style.color = "#f1f5f9";
            empty.textContent = "Sin eventos";
            dayEl.appendChild(empty);
        } else {
            data.eventos.forEach((evento) => {
                const item = document.createElement("div");
                item.className = "week-item";
                const bg = asuntoColor(evento.asunto);
                item.style.background = bg;
                item.style.color = evento.asunto === "parque" ? "#ecfdf5" : "#0f172a";
                item.textContent = `${evento.hora} ${asuntoLabel(evento.asunto)} - ${evento.titulo}`;
                dayEl.appendChild(item);
            });
        }

        weekView.appendChild(dayEl);
    }
}

function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function showSelectedContent() {
    estadoVacio.classList.add("hidden");
    panelContent.classList.remove("hidden");
    selectedDateTitle.textContent = `${fullDayNames[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${nombresMeses[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    renderTabContent();
}

function clearEventoForm() {
    editingEventoId = null;
    document.getElementById("evento-form").reset();
    document.getElementById("evento-submit").textContent = "Agregar evento";
    document.getElementById("evento-cancelar").classList.add("hidden");
}

function startEditEvento(id) {
    const key = dateKey(selectedDate);
    const evento = getDayData(key).eventos.find((x) => x.id === id);
    if (!evento) {
        return;
    }
    editingEventoId = id;
    document.getElementById("evento-titulo").value = evento.titulo;
    document.getElementById("evento-asunto").value = asuntoMeta[evento.asunto] ? evento.asunto : Object.keys(asuntoMeta)[0];
    document.getElementById("evento-hora").value = evento.hora;
    document.getElementById("evento-descripcion").value = evento.descripcion || "";
    document.getElementById("evento-submit").textContent = "Guardar cambios";
    document.getElementById("evento-cancelar").classList.remove("hidden");
    document.getElementById("evento-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearNotaForm() {
    editingNotaId = null;
    document.getElementById("nota-form").reset();
    document.getElementById("nota-submit").textContent = "Agregar nota";
    document.getElementById("nota-cancelar").classList.add("hidden");
}

function startEditNota(id) {
    const nota = getGlobalData().notas.find((x) => x.id === id);
    if (!nota) {
        return;
    }
    editingNotaId = id;
    document.getElementById("nota-texto").value = nota.texto;
    document.getElementById("nota-submit").textContent = "Guardar cambios";
    document.getElementById("nota-cancelar").classList.remove("hidden");
    document.getElementById("nota-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearTareaForm() {
    editingTareaId = null;
    document.getElementById("tarea-form").reset();
    document.getElementById("tarea-hecha-input").checked = false;
    document.getElementById("tarea-submit").textContent = "Agregar tarea";
    document.getElementById("tarea-cancelar").classList.add("hidden");
}

function startEditTarea(id) {
    const tarea = getGlobalData().tareas.find((x) => x.id === id);
    if (!tarea) {
        return;
    }
    editingTareaId = id;
    document.getElementById("tarea-texto").value = tarea.texto;
    document.getElementById("tarea-hecha-input").checked = Boolean(tarea.hecha);
    document.getElementById("tarea-submit").textContent = "Guardar cambios";
    document.getElementById("tarea-cancelar").classList.remove("hidden");
    document.getElementById("tarea-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderTabContent() {
    const key = dateKey(selectedDate);
    const data = getDayData(key);
    const globalData = getGlobalData();
    let needsSave = false;
    let needsGlobalSave = false;

    data.eventos = data.eventos.map((ev) => {
        const n = normalizeEvento(ev);
        if (!ev.id) {
            needsSave = true;
        }
        return n;
    });
    globalData.notas = globalData.notas.map((n) => {
        const hadString = typeof n === "string";
        const hadId = Boolean(n && typeof n === "object" && n.id);
        const norm = normalizeNota(n);
        if (hadString || !hadId) {
            needsGlobalSave = true;
        }
        return norm;
    });
    globalData.tareas = globalData.tareas.map((t) => {
        const hadId = Boolean(t && typeof t === "object" && t.id);
        const norm = normalizeTarea(t);
        if (!hadId) {
            needsGlobalSave = true;
        }
        return norm;
    });

    if (needsSave && (firebaseReady || useLocalStorage)) {
        void saveDay(key).catch(() => {});
    }
    if (needsGlobalSave && (firebaseReady || useLocalStorage)) {
        void saveDay(GLOBAL_KEY).catch(() => {});
    }
    renderEventos(data.eventos);
    renderNotas(globalData.notas);
    renderTareas(globalData.tareas);
}

function renderEventos(eventos) {
    const cont = document.getElementById("eventos-lista");
    cont.innerHTML = "";
    if (eventos.length === 0) {
        cont.innerHTML = `<div class="item-card"><strong>Sin eventos</strong><p>Agrega tu primer evento del dia.</p></div>`;
        return;
    }
    eventos
        .slice()
        .sort((a, b) => a.hora.localeCompare(b.hora))
        .forEach((evento) => {
            const card = document.createElement("div");
            card.className = "item-card";
            const bg = asuntoColor(evento.asunto);
            const badgeText = evento.asunto === "parque" ? "#ecfdf5" : "#0f172a";
            card.style.borderLeftColor = bg;

            const titulo = document.createElement("strong");
            titulo.textContent = `${evento.hora} - ${evento.titulo}`;

            const asuntoLine = document.createElement("p");
            asuntoLine.textContent = asuntoLabel(evento.asunto);

            const badge = document.createElement("span");
            badge.className = "badge";
            badge.style.background = bg;
            badge.style.color = badgeText;
            badge.textContent = asuntoLabel(evento.asunto);
            const sourceBadge = document.createElement("span");
            sourceBadge.className = "badge badge-google";
            sourceBadge.textContent = "Google";

            const desc = document.createElement("p");
            desc.className = "evento-descripcion";
            const d = (evento.descripcion || "").trim();
            if (d) {
                desc.textContent = d;
            } else {
                desc.classList.add("sin-desc");
                desc.textContent = "(sin descripcion)";
            }

            const actions = document.createElement("div");
            actions.className = "item-actions";
            const btnEdit = document.createElement("button");
            btnEdit.type = "button";
            btnEdit.className = "btn-editar-evento";
            btnEdit.textContent = "Editar";
            btnEdit.addEventListener("click", () => startEditEvento(evento.id));
            actions.appendChild(btnEdit);
            const btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.className = "btn-eliminar";
            btnDel.textContent = "Eliminar";
            btnDel.addEventListener("click", () => eliminarEvento(evento.id));
            actions.appendChild(btnDel);

            card.appendChild(titulo);
            card.appendChild(asuntoLine);
            card.appendChild(badge);
            if (evento.googleEventId) {
                card.appendChild(sourceBadge);
            }
            card.appendChild(desc);
            card.appendChild(actions);
            cont.appendChild(card);
        });
}

function renderNotas(notas) {
    const cont = document.getElementById("notas-lista");
    cont.innerHTML = "";
    if (notas.length === 0) {
        cont.innerHTML = `<div class="item-card"><strong>Sin notas</strong><p>Agrega una nota independiente del dia.</p></div>`;
        return;
    }
    notas.forEach((nota) => {
        const card = document.createElement("div");
        card.className = "item-card";
        const titulo = document.createElement("strong");
        titulo.textContent = "Nota";
        const cuerpo = document.createElement("p");
        cuerpo.textContent = nota.texto;
        const meta = document.createElement("p");
        meta.textContent = `Creada: ${formatDateKey(nota.creadaEn)}`;
        const actions = document.createElement("div");
        actions.className = "item-actions";
        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn-editar-evento";
        btnEdit.textContent = "Editar";
        btnEdit.addEventListener("click", () => startEditNota(nota.id));
        actions.appendChild(btnEdit);
        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn-eliminar";
        btnDel.textContent = "Eliminar";
        btnDel.addEventListener("click", () => eliminarNota(nota.id));
        actions.appendChild(btnDel);
        card.appendChild(titulo);
        card.appendChild(cuerpo);
        card.appendChild(meta);
        card.appendChild(actions);
        cont.appendChild(card);
    });
}

function renderTareas(tareas) {
    const cont = document.getElementById("tareas-lista");
    cont.innerHTML = "";
    if (tareas.length === 0) {
        cont.innerHTML = `<div class="item-card"><strong>Sin tareas</strong><p>Agrega una tarea independiente del dia.</p></div>`;
        return;
    }
    tareas.forEach((tarea) => {
        const card = document.createElement("div");
        card.className = "item-card";
        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "flex-start";
        row.style.gap = "0.5rem";
        const check = document.createElement("input");
        check.className = "tarea-check";
        check.type = "checkbox";
        check.dataset.id = tarea.id;
        check.checked = Boolean(tarea.hecha);
        const span = document.createElement("span");
        span.textContent = tarea.texto;
        if (tarea.hecha) {
            span.classList.add("tarea-hecha");
        }
        const meta = document.createElement("p");
        meta.textContent = `Creada: ${formatDateKey(tarea.creadaEn)}`;
        row.appendChild(check);
        row.appendChild(span);
        const actions = document.createElement("div");
        actions.className = "item-actions";
        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn-editar-evento";
        btnEdit.textContent = "Editar";
        btnEdit.addEventListener("click", () => startEditTarea(tarea.id));
        actions.appendChild(btnEdit);
        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn-eliminar";
        btnDel.textContent = "Eliminar";
        btnDel.addEventListener("click", () => eliminarTarea(tarea.id));
        actions.appendChild(btnDel);
        card.appendChild(row);
        card.appendChild(meta);
        card.appendChild(actions);
        cont.appendChild(card);
    });
}

async function eliminarEvento(id) {
    if (!confirm("¿Eliminar este evento? No se puede deshacer.")) {
        return;
    }
    const key = dateKey(selectedDate);
    const lista = getDayData(key).eventos;
    const i = lista.findIndex((x) => x.id === id);
    if (i === -1) {
        return;
    }
    const eventoEliminado = lista[i];
    lista.splice(i, 1);
    if (editingEventoId === id) {
        clearEventoForm();
    }
    let googleSyncFailed = false;
    try {
        await deleteEventoFromGoogle(eventoEliminado.googleEventId, eventoEliminado.googleCalendarId || "primary");
    } catch (e) {
        googleSyncFailed = true;
        console.warn("No se pudo eliminar evento en Google Calendar", e);
    }
    await saveDay(key);
    renderTabContent();
    initCalendar();
    if (activeView === "week") {
        renderWeekView();
    }
    if (googleSyncFailed) {
        alert("Evento eliminado localmente, pero no se pudo eliminar en Google Calendar.");
    }
}

async function eliminarNota(id) {
    if (!confirm("¿Eliminar esta nota? No se puede deshacer.")) {
        return;
    }
    const lista = getGlobalData().notas;
    const i = lista.findIndex((x) => x.id === id);
    if (i === -1) {
        return;
    }
    lista.splice(i, 1);
    if (editingNotaId === id) {
        clearNotaForm();
    }
    await saveDay(GLOBAL_KEY);
    renderTabContent();
}

async function eliminarTarea(id) {
    if (!confirm("¿Eliminar esta tarea? No se puede deshacer.")) {
        return;
    }
    const lista = getGlobalData().tareas;
    const i = lista.findIndex((x) => x.id === id);
    if (i === -1) {
        return;
    }
    lista.splice(i, 1);
    if (editingTareaId === id) {
        clearTareaForm();
    }
    await saveDay(GLOBAL_KEY);
    renderTabContent();
}

const TZ_AR = "America/Argentina/Buenos_Aires";
const WMO_ES = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla",
    51: "Llovizna",
    53: "Llovizna",
    55: "Llovizna densa",
    61: "Lluvia leve",
    63: "Lluvia",
    65: "Lluvia fuerte",
    71: "Nieve leve",
    80: "Chubascos",
    81: "Chubascos",
    82: "Chubascos violentos",
    95: "Tormenta",
    96: "Tormenta con granizo",
    99: "Tormenta con granizo"
};

function textoClima(code) {
    const c = Number(code);
    return WMO_ES[c] || "Condiciones variables";
}

function iniciarRelojBuenosAires() {
    const el = document.getElementById("widget-reloj");
    if (!el) {
        return;
    }
    const tick = () => {
        el.textContent = new Date().toLocaleTimeString("es-AR", {
            timeZone: TZ_AR,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    };
    tick();
    setInterval(tick, 1000);
}

async function cargarClimaBuenosAires() {
    const el = document.getElementById("widget-clima-body");
    if (!el) {
        return;
    }
    const url =
        "https://api.open-meteo.com/v1/forecast?latitude=-34.6037&longitude=-58.3816&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=2&timezone=America%2FArgentina%2FBuenos_Aires";
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error("clima http");
        }
        const data = await res.json();
        const cur = data.current;
        const d0 = data.daily;
        const tAct = Math.round(cur.temperature_2m);
        const tSens = Math.round(cur.apparent_temperature);
        const desc = textoClima(cur.weather_code);
        const max0 = Math.round(d0.temperature_2m_max[0]);
        const min0 = Math.round(d0.temperature_2m_min[0]);
        const max1 = Math.round(d0.temperature_2m_max[1]);
        const min1 = Math.round(d0.temperature_2m_min[1]);
        el.innerHTML = `<strong>${tAct}°C</strong> (sensacion ~${tSens}°C). ${desc}.<br>Hoy: max <strong>${max0}°C</strong> / min <strong>${min0}°C</strong>.<br>Manana: max <strong>${max1}°C</strong> / min <strong>${min1}°C</strong>.`;
    } catch (e) {
        el.textContent = "No se pudo cargar el pronostico. Revisa la conexion.";
    }
}

async function fetchXmlViaAllorigins(rssUrl) {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
    const res = await fetch(proxy);
    if (!res.ok) {
        throw new Error("allorigins http");
    }
    const j = await res.json();
    if (typeof j.contents !== "string") {
        throw new Error("allorigins sin contenido");
    }
    return j.contents;
}

async function fetchTextViaCodetabs(url) {
    const proxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    if (!res.ok) {
        throw new Error("codetabs http");
    }
    const text = await res.text();
    if (!text || text.length < 50) {
        throw new Error("codetabs vacio");
    }
    return text;
}

function parseRssItems(xmlText, max) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) {
        return [];
    }
    const out = [];
    const items = doc.querySelectorAll("item");
    items.forEach((item, i) => {
        if (i >= max) {
            return;
        }
        const title = item.querySelector("title")?.textContent?.trim();
        let link = item.querySelector("link")?.textContent?.trim();
        if (!link) {
            link = item.querySelector("guid")?.textContent?.trim();
        }
        if (title && link) {
            out.push({ title, link });
        }
    });
    if (out.length > 0) {
        return out;
    }
    doc.querySelectorAll("entry").forEach((entry, i) => {
        if (i >= max) {
            return;
        }
        const title = entry.querySelector("title")?.textContent?.trim();
        const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector("link");
        const link = linkEl?.getAttribute("href")?.trim() || linkEl?.textContent?.trim();
        if (title && link) {
            out.push({ title, link });
        }
    });
    return out;
}

function enlaceDesdePostReddit(d) {
    if (d.url && /^https?:\/\//i.test(d.url) && !/reddit\.com/i.test(d.url)) {
        return d.url;
    }
    const p = d.permalink || "";
    return `https://www.reddit.com${p.startsWith("/") ? p : `/${p}`}`;
}

let widgetsCabeceraIniciados = false;

function iniciarWidgetsCabecera() {
    if (widgetsCabeceraIniciados) {
        return;
    }
    widgetsCabeceraIniciados = true;
    iniciarRelojBuenosAires();
    void cargarClimaBuenosAires();
    setInterval(() => {
        void cargarClimaBuenosAires();
    }, 30 * 60 * 1000);
}

function notificationTagForEvent(evento, key) {
    return `agenda-evento-${key}-${evento.id}`;
}

function eventTimestampForToday(hora) {
    const [h, m] = String(hora || "").split(":");
    const eventDate = new Date();
    eventDate.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    return eventDate.getTime();
}

async function triggerEventNotification(evento, key) {
    const title = `Recordatorio: ${evento.titulo}`;
    const body = `${evento.hora} · ${asuntoLabel(evento.asunto)}`;
    const tag = notificationTagForEvent(evento, key);
    if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
            body,
            tag,
            renotify: false,
            data: { key, eventoId: evento.id }
        });
        return;
    }
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, tag });
    }
}

async function checkAndNotifyUpcomingEvents() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }
    const todayKey = dateKey(new Date());
    await ensureDayLoaded(todayKey);
    const data = getDayData(todayKey);
    const now = Date.now();
    data.eventos.forEach((evento) => {
        const ts = eventTimestampForToday(evento.hora);
        const diffMs = ts - now;
        const upcomingWindow = diffMs <= 10 * 60 * 1000 && diffMs >= 0;
        const missedWindow = diffMs < 0 && diffMs >= -30 * 60 * 1000;
        if (!upcomingWindow && !missedWindow) {
            return;
        }
        const marker = `notificado_${todayKey}_${evento.id}_${new Date(ts).toDateString()}`;
        if (localStorage.getItem(marker)) {
            return;
        }
        const eventoNotificado = missedWindow
            ? { ...evento, titulo: `${evento.titulo} (reciente)` }
            : evento;
        void triggerEventNotification(eventoNotificado, todayKey);
        localStorage.setItem(marker, String(Date.now()));
    });
}

async function initNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        return;
    }
    try {
        swRegistration = await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
        console.warn("No se pudo registrar Service Worker para notificaciones", e);
        return;
    }
    if (Notification.permission === "default") {
        try {
            await Notification.requestPermission();
        } catch {
            return;
        }
    }
    if (notificationTimer) {
        clearInterval(notificationTimer);
    }
    await checkAndNotifyUpcomingEvents();
    notificationTimer = setInterval(() => {
        void checkAndNotifyUpcomingEvents();
    }, 60 * 1000);
}

function hasValidVapidKey() {
    return Boolean(FCM_VAPID_KEY && !String(FCM_VAPID_KEY).startsWith("REEMPLAZAR_"));
}

async function savePushToken(token) {
    if (!firebaseReady || !db || !token) {
        return;
    }
    try {
        const user = auth && auth.currentUser ? auth.currentUser : null;
        await db.collection("pushTokens").doc(token).set(
            {
                token,
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                userEmail: user?.email || null,
                userUid: user?.uid || null,
                userAgent: navigator.userAgent || null
            },
            { merge: true }
        );
    } catch (e) {
        console.warn("No se pudo guardar token push", e);
    }
}

function handleForegroundPush(payload) {
    if (!payload) {
        return;
    }
    const title = payload?.notification?.title || "Agenda";
    const body = payload?.notification?.body || "Nueva notificacion";
    if (Notification.permission === "granted") {
        new Notification(title, {
            body,
            tag: payload?.notification?.tag || payload?.data?.tag || "agenda-fg"
        });
    }
}

async function initRealPush() {
    if (!firebaseReady || !messaging || !("serviceWorker" in navigator)) {
        return;
    }
    if (!hasValidVapidKey()) {
        console.warn("Falta configurar FCM_VAPID_KEY para push real.");
        return;
    }
    if (Notification.permission !== "granted") {
        return;
    }
    try {
        const reg = swRegistration || (await navigator.serviceWorker.ready);
        const token = await messaging.getToken({
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: reg
        });
        if (token) {
            await savePushToken(token);
        }
    } catch (e) {
        console.warn("No se pudo obtener token FCM", e);
    }
    messaging.onMessage((payload) => {
        handleForegroundPush(payload);
    });
}

function switchTab(tabName) {
    if (tabName !== "eventos") {
        clearEventoForm();
    }
    if (tabName !== "notas") {
        clearNotaForm();
    }
    if (tabName !== "tareas") {
        clearTareaForm();
    }
    activeTab = tabName;
    document.querySelectorAll(".pestana").forEach((tab) => {
        tab.classList.toggle("activa", tab.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-content").forEach((panel) => {
        panel.classList.toggle("activo", panel.id === `${tabName}-content`);
    });
}

function setView(view) {
    activeView = view;
    document.getElementById("view-day").classList.toggle("active", view === "day");
    document.getElementById("view-week").classList.toggle("active", view === "week");
    monthGrid.classList.toggle("hidden", view === "week");
    weekView.classList.toggle("hidden", view === "day");
    if (view === "week") {
        renderWeekView();
    }
}

document.getElementById("prev-month").addEventListener("click", async () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    await preloadMonthData();
    initCalendar();
});

document.getElementById("next-month").addEventListener("click", async () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    await preloadMonthData();
    initCalendar();
});

document.getElementById("today-btn").addEventListener("click", async () => {
    clearEventoForm();
    clearNotaForm();
    clearTareaForm();
    currentDate = new Date();
    selectedDate = new Date();
    await ensureDayLoaded(dateKey(selectedDate));
    await preloadMonthData();
    initCalendar();
    showSelectedContent();
    if (activeView === "week") {
        renderWeekView();
    }
});

document.getElementById("view-day").addEventListener("click", () => setView("day"));
document.getElementById("view-week").addEventListener("click", () => setView("week"));
document.getElementById("import-google-calendar").addEventListener("click", () => {
    if (!ENABLE_GOOGLE_CALENDAR) {
        alert("Google Calendar esta desactivado por ahora.");
        return;
    }
    void importarEventosGoogleCalendar();
});

document.querySelectorAll(".pestana").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.getElementById("evento-cancelar").addEventListener("click", () => {
    clearEventoForm();
});

document.getElementById("evento-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const titulo = document.getElementById("evento-titulo").value.trim();
    const asunto = document.getElementById("evento-asunto").value;
    const hora = document.getElementById("evento-hora").value;
    const descripcion = document.getElementById("evento-descripcion").value.trim();
    if (!titulo || !asunto || !hora) {
        return;
    }
    const key = dateKey(selectedDate);
    const lista = getDayData(key).eventos;
    let eventoForSync = null;
    let googleSyncFailed = false;

    if (editingEventoId) {
        const idx = lista.findIndex((x) => x.id === editingEventoId);
        if (idx !== -1) {
            lista[idx] = {
                id: lista[idx].id,
                titulo,
                asunto,
                hora,
                descripcion,
                googleEventId: lista[idx].googleEventId || "",
                googleCalendarId: lista[idx].googleCalendarId || "primary"
            };
            eventoForSync = lista[idx];
        }
        clearEventoForm();
    } else {
        const nuevoEvento = normalizeEvento({ id: newEventId(), titulo, asunto, hora, descripcion, googleCalendarId: "primary" });
        lista.push(nuevoEvento);
        eventoForSync = nuevoEvento;
        clearEventoForm();
    }

    if (eventoForSync) {
        try {
            const googleId = await syncEventoToGoogle(eventoForSync, key);
            if (googleId && !eventoForSync.googleEventId) {
                eventoForSync.googleEventId = googleId;
            }
        } catch (e) {
            googleSyncFailed = true;
            console.warn("No se pudo sincronizar evento con Google Calendar", e);
        }
    }

    await saveDay(key);
    renderTabContent();
    initCalendar();
    if (activeView === "week") {
        renderWeekView();
    }
    if (googleSyncFailed) {
        alert("Evento guardado en la agenda, pero no se pudo sincronizar con Google Calendar.");
    }
});

document.getElementById("nota-cancelar").addEventListener("click", () => {
    clearNotaForm();
});

document.getElementById("nota-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const texto = document.getElementById("nota-texto").value.trim();
    if (!texto) {
        return;
    }
    const lista = getGlobalData().notas;

    if (editingNotaId) {
        const idx = lista.findIndex((x) => x.id === editingNotaId);
        if (idx !== -1) {
            lista[idx] = normalizeNota({ id: lista[idx].id, texto, creadaEn: lista[idx].creadaEn });
        }
        clearNotaForm();
    } else {
        lista.push(normalizeNota({ id: newNotaId(), texto, creadaEn: dateKey(new Date()) }));
        clearNotaForm();
    }

    await saveDay(GLOBAL_KEY);
    renderTabContent();
});

document.getElementById("tarea-cancelar").addEventListener("click", () => {
    clearTareaForm();
});

document.getElementById("tarea-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const texto = document.getElementById("tarea-texto").value.trim();
    const hecha = document.getElementById("tarea-hecha-input").checked;
    if (!texto) {
        return;
    }
    const lista = getGlobalData().tareas;

    if (editingTareaId) {
        const idx = lista.findIndex((x) => x.id === editingTareaId);
        if (idx !== -1) {
            lista[idx] = normalizeTarea({ id: lista[idx].id, texto, hecha, creadaEn: lista[idx].creadaEn });
        }
        clearTareaForm();
    } else {
        lista.push(normalizeTarea({ id: newTareaId(), texto, hecha, creadaEn: dateKey(new Date()) }));
        clearTareaForm();
    }

    await saveDay(GLOBAL_KEY);
    renderTabContent();
});

document.getElementById("tareas-lista").addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("tarea-check")) {
        return;
    }
    const id = target.dataset.id;
    if (!id) {
        return;
    }
    const tarea = getGlobalData().tareas.find((x) => x.id === id);
    if (!tarea) {
        return;
    }
    tarea.hecha = target.checked;
    await saveDay(GLOBAL_KEY);
    renderTabContent();
});

/* ---------- Apariencia (titulo, logo, perfil, fondo, temas) ---------- */
const APARIENCIA_KEY = "agendaAparienciaV1";

const defaultApariencia = {
    titulo: "Agenda personalizada",
    subtitulo: "La mente crea realidades",
    tema: "rootsEspecial",
    fondoModo: "color",
    fondoColor: "#0b0b0b",
    fondoColor2: "#1a1a1a",
    fondoImagenData: "",
    logoData: "",
    fotoPerfilData: "",
    colorAcento: "#facc15"
};

const THEMES = {
    claro: {
        "--bg": "#eff6ff",
        "--panel": "#ffffff",
        "--card": "#e2e8f0",
        "--card-hover": "#cbd5e1",
        "--text": "#0f172a",
        "--muted": "#475569",
        "--active": "#0284c7",
        "--accent": "#0284c7"
    },
    vintage: {
        "--bg": "#2d2218",
        "--panel": "#3a2b1f",
        "--card": "#4a3828",
        "--card-hover": "#5b4734",
        "--text": "#f5e6cc",
        "--muted": "#cfb996",
        "--active": "#d97706",
        "--accent": "#d97706"
    },
    minimalista: {
        "--bg": "#f5f5f5",
        "--panel": "#ffffff",
        "--card": "#ebebeb",
        "--card-hover": "#e1e1e1",
        "--text": "#101010",
        "--muted": "#666666",
        "--active": "#111111",
        "--accent": "#111111"
    },
    rootsEspecial: {
        "--bg": "#080808",
        "--panel": "#111111",
        "--card": "#1b1b1b",
        "--card-hover": "#252525",
        "--text": "#f4f4f4",
        "--muted": "#b8b8b8",
        "--active": "#facc15",
        "--accent": "#facc15"
    }
};

function loadApariencia() {
    try {
        const raw = localStorage.getItem(APARIENCIA_KEY);
        if (!raw) {
            return { ...defaultApariencia };
        }
        return { ...defaultApariencia, ...JSON.parse(raw) };
    } catch {
        return { ...defaultApariencia };
    }
}

function saveApariencia(cfg) {
    localStorage.setItem(APARIENCIA_KEY, JSON.stringify(cfg));
}

function aplicarVariablesTema(temaId) {
    const vars = THEMES[temaId] || THEMES.rootsEspecial;
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => {
        root.style.setProperty(k, v);
    });
}

function aplicarApariencia(cfg) {
    aplicarVariablesTema(cfg.tema);
    const root = document.documentElement;
    if (cfg.colorAcento) {
        root.style.setProperty("--accent", cfg.colorAcento);
        root.style.setProperty("--active", cfg.colorAcento);
    }

    const tituloEl = document.getElementById("app-titulo");
    const subEl = document.getElementById("app-subtitulo");
    if (tituloEl) {
        tituloEl.textContent = cfg.titulo || defaultApariencia.titulo;
    }
    if (subEl) {
        subEl.textContent = cfg.subtitulo || defaultApariencia.subtitulo;
    }
    document.title = `${cfg.titulo || "Agenda"} · Roots`;

    const imgLogo = document.getElementById("header-logo");
    if (imgLogo) {
        imgLogo.src = cfg.logoData || "./assets/logo-roots.png";
        imgLogo.alt = cfg.titulo || "Logo";
    }

    const imgPerfil = document.getElementById("header-foto-perfil");
    if (imgPerfil) {
        if (cfg.fotoPerfilData) {
            imgPerfil.src = cfg.fotoPerfilData;
            imgPerfil.classList.remove("hidden");
        } else {
            imgPerfil.removeAttribute("src");
            imgPerfil.classList.add("hidden");
        }
    }

    const modo = cfg.fondoModo || "color";
    document.body.style.backgroundImage = "";
    document.body.style.backgroundSize = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundAttachment = "";
    document.body.style.background = "";
    if (modo === "gradiente") {
        const c1 = cfg.fondoColor || "#0f172a";
        const c2 = cfg.fondoColor2 || "#1e293b";
        document.body.style.background = `linear-gradient(165deg, ${c1}, ${c2})`;
        document.body.style.backgroundAttachment = "fixed";
        document.body.style.backgroundColor = "";
    } else if (modo === "imagen" && cfg.fondoImagenData) {
        document.body.style.backgroundColor = cfg.fondoColor || "#0f172a";
        document.body.style.backgroundImage = `url("${cfg.fondoImagenData}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundRepeat = "no-repeat";
        document.body.style.backgroundAttachment = "fixed";
    } else {
        document.body.style.backgroundColor = cfg.fondoColor || "#0f172a";
    }
}

function rellenarFormularioApariencia(cfg) {
    document.getElementById("cfg-titulo").value = cfg.titulo;
    document.getElementById("cfg-subtitulo").value = cfg.subtitulo;
    document.getElementById("cfg-tema").value = cfg.tema in THEMES ? cfg.tema : "rootsEspecial";
    document.getElementById("cfg-fondo-modo").value = cfg.fondoModo || "color";
    document.getElementById("cfg-fondo1").value = cfg.fondoColor || "#0f172a";
    document.getElementById("cfg-fondo2").value = cfg.fondoColor2 || "#1e293b";
    document.getElementById("cfg-accent").value = cfg.colorAcento || "#3b82f6";
    document.getElementById("cfg-file-logo").value = "";
    document.getElementById("cfg-file-perfil").value = "";
    document.getElementById("cfg-file-fondo").value = "";
}

function abrirModalConfig() {
    rellenarFormularioApariencia(loadApariencia());
    document.getElementById("modal-config").classList.remove("hidden");
}

function cerrarModalConfig() {
    document.getElementById("modal-config").classList.add("hidden");
}

function leerArchivoComoDataUrl(input) {
    return new Promise((resolve, reject) => {
        if (!input || !input.files || input.files.length === 0) {
            resolve(null);
            return;
        }
        const file = input.files[0];
        if (file.size > 2.6 * 1024 * 1024) {
            reject(new Error("Archivo demasiado grande (maximo aprox. 2.5 MB)."));
            return;
        }
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error("No se pudo leer el archivo."));
        fr.readAsDataURL(file);
    });
}

async function guardarConfiguracionApariencia() {
    const prev = loadApariencia();
    const next = {
        titulo: document.getElementById("cfg-titulo").value.trim() || defaultApariencia.titulo,
        subtitulo: document.getElementById("cfg-subtitulo").value.trim() || defaultApariencia.subtitulo,
        tema: document.getElementById("cfg-tema").value,
        fondoModo: document.getElementById("cfg-fondo-modo").value,
        fondoColor: document.getElementById("cfg-fondo1").value,
        fondoColor2: document.getElementById("cfg-fondo2").value,
        colorAcento: document.getElementById("cfg-accent").value,
        logoData: prev.logoData,
        fotoPerfilData: prev.fotoPerfilData,
        fondoImagenData: prev.fondoImagenData
    };

    try {
        const logoNew = await leerArchivoComoDataUrl(document.getElementById("cfg-file-logo"));
        if (logoNew) {
            next.logoData = logoNew;
        }
        const perfilNew = await leerArchivoComoDataUrl(document.getElementById("cfg-file-perfil"));
        if (perfilNew) {
            next.fotoPerfilData = perfilNew;
        }
        const fondoNew = await leerArchivoComoDataUrl(document.getElementById("cfg-file-fondo"));
        if (fondoNew) {
            next.fondoImagenData = fondoNew;
        }
    } catch (e) {
        alert(e.message || String(e));
        return;
    }

    if (next.fondoModo !== "imagen") {
        next.fondoImagenData = "";
    }

    saveApariencia(next);
    aplicarApariencia(next);
    cerrarModalConfig();
}

function restaurarAparienciaDefecto() {
    if (!confirm("¿Restaurar titulo, subtitulo, logo por archivo, foto, fondo y tema por defecto?")) {
        return;
    }
    localStorage.removeItem(APARIENCIA_KEY);
    const cfg = { ...defaultApariencia };
    saveApariencia(cfg);
    aplicarApariencia(cfg);
    rellenarFormularioApariencia(cfg);
}

async function exportarRespaldoJson() {
    try {
        const backup = {
            exportedAt: new Date().toISOString(),
            source: firebaseReady && !useLocalStorage ? "firestore" : "localStorage",
            apariencia: loadApariencia(),
            agendaDays: {}
        };

        if (firebaseReady && !useLocalStorage) {
            const snapshot = await db.collection("agendaDays").get();
            snapshot.forEach((doc) => {
                backup.agendaDays[doc.id] = doc.data();
            });
        } else {
            backup.agendaDays = loadLocalState();
        }

        const text = JSON.stringify(backup, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `agenda-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        alert("Respaldo exportado correctamente.");
    } catch (e) {
        console.error("Error exportando respaldo", e);
        alert("No se pudo exportar el respaldo.");
    }
}

let aparienciaInicializada = false;

function initApariencia() {
    if (aparienciaInicializada) {
        return;
    }
    aparienciaInicializada = true;
    aplicarApariencia(loadApariencia());

    document.getElementById("btn-abrir-config").addEventListener("click", abrirModalConfig);
    document.getElementById("btn-cerrar-config").addEventListener("click", cerrarModalConfig);
    document.getElementById("cfg-guardar").addEventListener("click", () => {
        void guardarConfiguracionApariencia();
    });
    document.getElementById("cfg-exportar").addEventListener("click", () => {
        void exportarRespaldoJson();
    });
    document.getElementById("cfg-restaurar").addEventListener("click", restaurarAparienciaDefecto);

    document.getElementById("modal-config").addEventListener("click", (e) => {
        if (e.target.id === "modal-config") {
            cerrarModalConfig();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !document.getElementById("modal-config").classList.contains("hidden")) {
            cerrarModalConfig();
        }
    });
}

async function bootstrap() {
    initApariencia();
    initFirebase();
    if (ENABLE_GOOGLE_CALENDAR) {
        await hydrateGoogleTokenFromRedirect();
    } else {
        const importBtn = document.getElementById("import-google-calendar");
        const importRange = document.getElementById("import-google-range");
        if (importBtn) {
            importBtn.classList.add("hidden");
        }
        if (importRange) {
            importRange.classList.add("hidden");
        }
    }
    if (useLocalStorage) {
        hydrateFromLocal();
    }
    setAsuntoOptions();
    try {
        await ensureDayLoaded(dateKey(selectedDate));
        await ensureDayLoaded(GLOBAL_KEY);
        await preloadMonthData();
    } catch (e) {
        console.error("Error cargando datos", e);
    }
    initCalendar();
    showSelectedContent();
    switchTab(activeTab);
    iniciarWidgetsCabecera();
    await initNotifications();
    await initRealPush();
}

bootstrap();

// --- LOGIN CON GOOGLE ---
async function loginGoogle() {
    if (!auth) {
        return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    if (ENABLE_GOOGLE_CALENDAR) {
        provider.addScope("https://www.googleapis.com/auth/calendar");
    }
    try {
        const result = await auth.signInWithPopup(provider);
        const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
        googleCalendarAccessToken = credential?.accessToken || googleCalendarAccessToken;
    } catch (e) {
        console.error("Error en login Google", e);
        const code = e && e.code ? String(e.code) : "sin_codigo";
        const msg = e && e.message ? String(e.message) : "sin_detalle";
        alert(`No se pudo iniciar sesion con Google.\n${code}\n${msg}`);
    }
}

function toIsoUtc(date) {
    return date.toISOString();
}

function buildGoogleCalendarProvider() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar");
    provider.setCustomParameters({ prompt: "consent", include_granted_scopes: "true" });
    return provider;
}

async function hydrateGoogleTokenFromRedirect() {
    if (!auth) {
        return;
    }
    try {
        const result = await auth.getRedirectResult();
        if (!result) {
            return;
        }
        const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
            googleCalendarAccessToken = credential.accessToken;
        }
        const pendingAction = sessionStorage.getItem(PENDING_GOOGLE_ACTION_KEY);
        if (pendingAction === "importGoogleCalendar" && googleCalendarAccessToken) {
            sessionStorage.removeItem(PENDING_GOOGLE_ACTION_KEY);
            setTimeout(() => {
                void importarEventosGoogleCalendar();
            }, 0);
        }
    } catch (e) {
        console.warn("No se pudo leer resultado de redirect OAuth", e);
    }
}

async function ensureGoogleCalendarAccessToken() {
    if (!ENABLE_GOOGLE_CALENDAR) {
        return "";
    }
    if (!auth || !auth.currentUser) {
        alert("Primero inicia sesion con Google.");
        return "";
    }
    if (googleCalendarAccessToken) {
        return googleCalendarAccessToken;
    }
    const provider = buildGoogleCalendarProvider();
    try {
        const result = await auth.currentUser.reauthenticateWithPopup(provider);
        const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
        googleCalendarAccessToken = credential?.accessToken || "";
        if (googleCalendarAccessToken) {
            return googleCalendarAccessToken;
        }
    } catch (e) {
        console.warn("Reautenticacion Google Calendar fallo, probando popup normal", e);
    }
    try {
        const result = await auth.signInWithPopup(provider);
        const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
        googleCalendarAccessToken = credential?.accessToken || "";
        if (googleCalendarAccessToken) {
            return googleCalendarAccessToken;
        }
        alert("No se pudo obtener permiso para Google Calendar (sin access token).");
        return "";
    } catch (e) {
        const code = e && e.code ? String(e.code) : "";
        if (code === "auth/popup-blocked") {
            try {
                sessionStorage.setItem(PENDING_GOOGLE_ACTION_KEY, "importGoogleCalendar");
                await auth.signInWithRedirect(provider);
                return "";
            } catch (redirectErr) {
                console.error("No se pudo iniciar redirect OAuth", redirectErr);
            }
        }
        console.error("No se pudo autorizar Google Calendar", e);
        const safeCode = code || "sin_codigo";
        const msg = e && e.message ? String(e.message) : "sin_detalle";
        alert(`No se pudo autorizar Google Calendar.\n${safeCode}\n${msg}`);
        return "";
    }
}

function canSyncGoogleCalendar() {
    return ENABLE_GOOGLE_CALENDAR && Boolean(auth && auth.currentUser);
}

function parseHoraSafe(hora) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hora || ""));
    if (!m) {
        return { h: 9, m: 0 };
    }
    return { h: Number(m[1]), m: Number(m[2]) };
}

function googleDateTimeFromDayAndHora(dayKey, hora) {
    const d = new Date(`${dayKey}T00:00:00`);
    const hm = parseHoraSafe(hora);
    d.setHours(hm.h, hm.m, 0, 0);
    return d;
}

function buildGoogleEventPayload(evento, dayKey) {
    const start = googleDateTimeFromDayAndHora(dayKey, evento.hora);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return {
        summary: evento.titulo || "Evento",
        description: evento.descripcion || "",
        start: {
            dateTime: start.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        },
        end: {
            dateTime: end.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        }
    };
}

async function googleCalendarRequest(path, options = {}, retry = true) {
    let token = await ensureGoogleCalendarAccessToken();
    if (!token) {
        throw new Error("Sin token Google Calendar");
    }
    const makeRequest = async (tk) =>
        fetch(`https://www.googleapis.com/calendar/v3${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${tk}`,
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
    let res = await makeRequest(token);
    if ((res.status === 401 || res.status === 403) && retry) {
        googleCalendarAccessToken = "";
        token = await ensureGoogleCalendarAccessToken();
        if (!token) {
            throw new Error("No se pudo renovar token Google Calendar");
        }
        res = await makeRequest(token);
    }
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Google Calendar HTTP ${res.status}: ${detail}`);
    }
    if (res.status === 204) {
        return null;
    }
    return res.json();
}

async function syncEventoToGoogle(evento, dayKey) {
    if (!canSyncGoogleCalendar()) {
        return evento.googleEventId || "";
    }
    const payload = buildGoogleEventPayload(evento, dayKey);
    const calendarId = encodeURIComponent(evento.googleCalendarId || "primary");
    if (evento.googleEventId) {
        await googleCalendarRequest(`/calendars/${calendarId}/events/${encodeURIComponent(evento.googleEventId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
        return evento.googleEventId;
    }
    const created = await googleCalendarRequest(`/calendars/${calendarId}/events`, {
        method: "POST",
        body: JSON.stringify(payload)
    });
    return String(created?.id || "");
}

async function deleteEventoFromGoogle(googleEventId, googleCalendarId = "primary") {
    if (!googleEventId || !canSyncGoogleCalendar()) {
        return;
    }
    try {
        await googleCalendarRequest(`/calendars/${encodeURIComponent(googleCalendarId || "primary")}/events/${encodeURIComponent(googleEventId)}`, {
            method: "DELETE"
        });
    } catch (e) {
        if (String(e.message || "").includes("404")) {
            return;
        }
        throw e;
    }
}

function formatHoraFromIso(isoDateTime) {
    if (!isoDateTime) {
        return "09:00";
    }
    const d = new Date(isoDateTime);
    if (Number.isNaN(d.getTime())) {
        return "09:00";
    }
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function getGoogleImportRangeBounds(range, baseDate) {
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    if (range === "semana") {
        const s = startOfWeek(start);
        const e = new Date(s);
        e.setDate(e.getDate() + 7);
        return { start: s, end: e, label: "semana" };
    }
    if (range === "mes") {
        const s = new Date(start.getFullYear(), start.getMonth(), 1);
        const e = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        return { start: s, end: e, label: "mes" };
    }
    end.setDate(end.getDate() + 1);
    return { start, end, label: "dia" };
}

function dateKeyFromIsoDate(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ""));
    if (!m) {
        return "";
    }
    return `${m[1]}-${m[2]}-${m[3]}`;
}

async function importarEventosGoogleCalendar() {
    const token = await ensureGoogleCalendarAccessToken();
    if (!token) {
        return;
    }
    const rangeEl = document.getElementById("import-google-range");
    const range = rangeEl && typeof rangeEl.value === "string" ? rangeEl.value : "dia";
    const bounds = getGoogleImportRangeBounds(range, selectedDate);
    const params = new URLSearchParams({
        timeMin: toIsoUtc(bounds.start),
        timeMax: toIsoUtc(bounds.end),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250"
    });
    try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if (res.status === 401) {
            googleCalendarAccessToken = "";
            alert("Tu sesion de Google Calendar vencio. Vuelve a intentar.");
            return;
        }
        if (!res.ok) {
            throw new Error(`Calendar HTTP ${res.status}`);
        }
        const json = await res.json();
        const primaryItems = Array.isArray(json.items) ? json.items : [];
        let items = [...primaryItems];
        try {
            const calendarListRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (calendarListRes.ok) {
                const calendarListJson = await calendarListRes.json();
                const calendars = Array.isArray(calendarListJson.items) ? calendarListJson.items : [];
                for (const cal of calendars) {
                    const calId = String(cal?.id || "");
                    if (!calId || calId === "primary") {
                        continue;
                    }
                    const calParams = new URLSearchParams({
                        timeMin: toIsoUtc(bounds.start),
                        timeMax: toIsoUtc(bounds.end),
                        singleEvents: "true",
                        orderBy: "startTime",
                        maxResults: "250"
                    });
                    const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${calParams.toString()}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!calRes.ok) {
                        continue;
                    }
                    const calJson = await calRes.json();
                    const calItems = Array.isArray(calJson.items) ? calJson.items : [];
                    calItems.forEach((it) => {
                        items.push({ ...it, __calendarId: calId });
                    });
                }
            }
        } catch (e) {
            console.warn("No se pudo leer lista completa de calendarios Google", e);
        }
        items = items.map((it) => ({ ...it, __calendarId: it.__calendarId || "primary" }));
        const touchedKeys = new Set();
        let nuevos = 0;
        for (const item of items) {
            const googleEventId = String(item.id || "").trim();
            const googleCalendarId = String(item.__calendarId || "primary").trim() || "primary";
            if (!googleEventId) {
                continue;
            }
            const eventKey = item?.start?.dateTime
                ? dateKey(new Date(item.start.dateTime))
                : dateKeyFromIsoDate(item?.start?.date);
            if (!eventKey) {
                continue;
            }
            await ensureDayLoaded(eventKey);
            const lista = getDayData(eventKey).eventos;
            const exists = lista.some(
                (x) => x.googleEventId && x.googleEventId === googleEventId && String(x.googleCalendarId || "primary") === googleCalendarId
            );
            if (exists) {
                continue;
            }
            const hora = item?.start?.dateTime ? formatHoraFromIso(item.start.dateTime) : "09:00";
            const titulo = String(item.summary || "Evento Google");
            const descripcionBase = String(item.description || "").trim();
            const descripcion = descripcionBase ? `${descripcionBase}\n\nImportado de Google Calendar.` : "Importado de Google Calendar.";
            lista.push(
                normalizeEvento({
                    id: newEventId(),
                    titulo,
                    asunto: "Personal",
                    hora,
                    descripcion,
                    googleEventId,
                    googleCalendarId
                })
            );
            touchedKeys.add(eventKey);
            nuevos += 1;
        }
        if (nuevos === 0) {
            alert(`No hubo eventos nuevos para importar en este ${bounds.label}.`);
            return;
        }
        await Promise.all(Array.from(touchedKeys).map((key) => saveDay(key)));
        renderTabContent();
        initCalendar();
        if (activeView === "week") {
            renderWeekView();
        }
        alert(`Importacion completada: ${nuevos} evento(s) nuevos (${bounds.label}).`);
    } catch (e) {
        console.error("Error importando Google Calendar", e);
        alert(`No se pudo importar desde Google Calendar.\n${String(e?.message || e)}`);
    }
}

function logout() {
    if (!auth) {
        return;
    }
    auth.signOut();
}

function ensureLoginGate() {
    let gate = document.getElementById("login-gate");
    if (gate) {
        return gate;
    }
    gate = document.createElement("div");
    gate.id = "login-gate";
    gate.style.position = "fixed";
    gate.style.inset = "0";
    gate.style.zIndex = "5000";
    gate.style.background = "#06133b";
    gate.style.display = "none";
    gate.style.placeItems = "center";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Entrar con Google";
    btn.style.padding = "1rem 2rem";
    btn.style.fontSize = "1.1rem";
    btn.addEventListener("click", () => {
        void loginGoogle();
    });
    gate.appendChild(btn);
    document.body.appendChild(gate);
    return gate;
}

function setAppAccess(canAccess) {
    const app = document.querySelector(".app-container");
    const gate = ensureLoginGate();
    if (app) {
        app.style.display = canAccess ? "grid" : "none";
    }
    gate.style.display = canAccess ? "none" : "grid";
}

function userAllowed(user, allowedEmail) {
    if (!user) {
        return false;
    }
    if (!allowedEmail || allowedEmail === "tu.correo@gmail.com") {
        return true;
    }
    return String(user.email || "").toLowerCase() === allowedEmail.toLowerCase();
}

// Control de acceso
if (auth) {
    auth.onAuthStateChanged((user) => {
        // ✏️ Si quieres restringir, cambia por tu correo real.
        const TU_CORREO = "tu.correo@gmail.com";
        if (useLocalStorage) {
            setAppAccess(true);
            return;
        }
        setAppAccess(userAllowed(user, TU_CORREO));
    });
}
