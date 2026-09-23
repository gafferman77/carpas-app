(() => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const views = $$(".view");
  const state = { role: "", key: "", carpaId: carpaFromPath(), historyCarpa: "", foto: "" };
  const poleModels = {
    azul: {
      name: "Campinox azul",
      cross: [["Extremo", 57, 2, "G-57"]],
      crossMiddle: ["Medio", 50, 1, "A-50"],
      vertical: [["Pie", 64, 2, "H-64"], ["Medio", 64, 2, "D-64"], ["Puntera", 50, 2, "C-50"]]
    },
    pasante: {
      name: "Campinox pasante con tira",
      cross: [["Extremo", 57, 2, "G-57"]],
      crossMiddle: ["Medio", 50, 1, "A-50"],
      vertical: [["Pie", 64, 2, "H-64"], ["Medio", 64, 2, "D-64"], ["Puntera", 55, 2, "C-55"]]
    },
    piragua: {
      name: "Piragua",
      cross: [["Extremo", 70, 2, "G-70"]],
      crossMiddle: ["Medio", 70, 1, "B-70"],
      vertical: [["Pie", 64, 2, "H-64"], ["Medio", 64, 2, "D-64"], ["Puntera", 55, 2, "C-55"]]
    },
    ardilla: {
      name: "Ardilla",
      cross: [["Extremo", 57, 1, "G-57"], ["Extremo", 68, 1, "H-68"]],
      crossMiddle: ["Medio", 70, 1, "B-70"],
      vertical: [["Pie", 64, 2, "H-64"], ["Medio", 64, 2, "D-64"], ["Puntera", 55, 2, "C-55"]]
    },
    nahuel: {
      name: "Nahuel",
      cross: [["Extremo", 57, 2, "G-57"]],
      crossMiddle: ["Medio", 64, 1, "B-64"],
      vertical: [["Pie", 64, 2, "H-64"], ["Medio", 64, 2, "D-64"], ["Puntera", 45, 2, "C-45"]]
    }
  };

  function carpaFromPath() { const m = location.pathname.match(/\/carpa\/(CARPA-\d{3})/i); return m ? m[1].toUpperCase() : ""; }
  function normalizeCarpa(value) {
    const m = String(value || "").trim().toUpperCase().match(/^(?:CARPA[\s-_]*)?0*(\d{1,3})$/);
    if (!m) return ""; const n = Number(m[1]);
    return n >= 1 && n <= 180 ? `CARPA-${String(n).padStart(3, "0")}` : "";
  }
  function show(id) { views.forEach(v => v.classList.toggle("hidden", v.id !== id)); scrollTo({ top: 0, behavior: "smooth" }); }
  function message(el, text, type = "") { el.textContent = text; el.className = `message ${type}`; }
  async function api(url, options) {
    try { const res = await fetch(url, options); const data = await res.json(); return res.ok ? data : { error: data.error || "Ocurrió un error" }; }
    catch (_) { return { error: "No hay conexión. Probá nuevamente." }; }
  }
  const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  function goHome() { state.role = ""; state.key = ""; $("#logoutBtn").classList.add("hidden"); show("homeView"); }

  $$("[data-mode]").forEach(btn => btn.onclick = () => begin(btn.dataset.mode));
  $$("[data-back]").forEach(btn => btn.onclick = goHome);
  $("#logoutBtn").onclick = goHome;
  function begin(role) {
    if (role === "TALLER") {
      state.role = "TALLER";
      state.key = "";
      document.body.dataset.mode = "taller";
      openWorkshop();
      return;
    }
    state.role = role; $("#loginRole").textContent = role === "ATP" ? "ATP" : "TALLER";
    document.body.dataset.mode = role.toLowerCase();
    $("#loginHelp").textContent = role === "ATP" ? "Escaneaste la ficha de una carpa. Ingresá la clave para informar su estado." : "Ingresá a la mesa de trabajo para organizar las reparaciones.";
    $("#keyInput").value = ""; message($("#loginMsg"), ""); show("loginView"); $("#keyInput").focus();
  }
  $("#keyInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#loginBtn").click(); });
  $("#loginBtn").onclick = async () => {
    const key = $("#keyInput").value.trim(); if (!key) return message($("#loginMsg"), "Ingresá la palabra clave.", "error");
    $("#loginBtn").disabled = true; const data = await api("/api/auth", json("POST", { role: state.role, key })); $("#loginBtn").disabled = false;
    if (!data.ok) return message($("#loginMsg"), "La clave no es correcta.", "error");
    state.key = key; $("#logoutBtn").classList.remove("hidden");
    if (state.role === "TALLER") openWorkshop();
    else if (state.carpaId) openAtp(state.carpaId); else { $("#searchRole").textContent = "ATP"; show("searchView"); }
  };

  function useSearch(input, msg, callback) { const id = normalizeCarpa(input.value); if (!id) return message(msg, "Ingresá un número entre 1 y 180.", "error"); message(msg, ""); callback(id); }
  $("#searchBtn").onclick = () => useSearch($("#carpaSearch"), $("#searchMsg"), openAtp);
  $("#carpaSearch").addEventListener("keydown", e => { if (e.key === "Enter") $("#searchBtn").click(); });
  function openAtp(id) { state.carpaId = id; $("#atpCarpa").textContent = id; show("atpView"); }
  $$("[data-problem], [data-point]").forEach(btn => btn.onclick = () => {
    btn.classList.toggle("selected");
    if (btn.dataset.problem) {
      const count = $$("[data-problem].selected").length;
      $("#problemCount").textContent = count ? `${count} seleccionado${count === 1 ? "" : "s"}` : "Ninguno seleccionado";
    }
  });
  $("#photoBtn").onclick = () => $("#photoInput").click();
  $("#photoInput").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    message($("#atpMsg"), "Preparando foto…");
    try {
      state.foto = await compressPhoto(file);
      $("#photoPreview img").src = state.foto;
      $("#photoPreview").classList.remove("hidden");
      message($("#atpMsg"), "Foto lista.", "success");
    } catch (_) { message($("#atpMsg"), "No se pudo preparar la foto. Probá nuevamente.", "error"); }
  };
  $("#removePhotoBtn").onclick = () => {
    state.foto = ""; $("#photoInput").value = ""; $("#photoPreview").classList.add("hidden"); message($("#atpMsg"), "");
  };
  async function compressPhoto(file) {
    const image = new Image(); image.src = URL.createObjectURL(file);
    await image.decode();
    const max = 1100; const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(image.src);
    return canvas.toDataURL("image/jpeg", 0.68);
  }
  $("#sendReportBtn").onclick = async () => {
    const btn = $("#sendReportBtn"); const body = { role: state.role, key: state.key, problemas: $$("[data-problem].selected").map(x => x.dataset.problem), puntos: $$("[data-point].selected").map(x => x.dataset.point), detalle: $("#detalle").value.trim(), foto: state.foto };
    btn.disabled = true; btn.textContent = "Enviando…"; const data = await api(`/api/carpas/${state.carpaId}/reportes`, json("POST", body)); btn.disabled = false; btn.textContent = "Enviar al taller";
    if (data.error) return message($("#atpMsg"), data.error, "error");
    $("#atpView").innerHTML = `<div class="panel success-card"><span class="check">✓</span><h2>Reporte enviado</h2><p>El taller ya puede ver el parte de <strong>${data.carpaId}</strong> en su lista de pendientes.</p><button class="primary" id="finishBtn">Finalizar</button></div>`;
    $("#finishBtn").onclick = goHome;
  };

  $("#refreshBtn").onclick = () => { loadPending(); const visible = $("#workshopHistoryPane").classList.contains("hidden") ? "" : "history"; if (visible) loadAllHistory(); };
  $("#tallerSearchBtn").onclick = () => useSearch($("#tallerSearch"), $("#tallerSearchMsg"), loadCarpaSearch);
  $("#tallerSearch").addEventListener("keydown", e => { if (e.key === "Enter") $("#tallerSearchBtn").click(); });
  $$("[data-workshop]").forEach(btn => btn.onclick = () => selectWorkshopPane(btn.dataset.workshop));
  $$(".workshop-back").forEach(btn => btn.onclick = () => selectWorkshopPane("home"));
  function selectWorkshopPane(section) {
    const map = { home: "workshopHomePane", search: "workshopSearchPane", history: "workshopHistoryPane", poles: "workshopPolesPane" };
    $$(".workshop-pane").forEach(pane => pane.classList.toggle("hidden", pane.id !== map[section]));
    $$("[data-workshop]").forEach(btn => btn.classList.toggle("active", btn.dataset.workshop === section));
    if (section === "history") loadAllHistory();
    if (section === "search") setTimeout(() => $("#tallerSearch").focus(), 50);
    scrollTo({ top: 0, behavior: "smooth" });
  }
  function polePiece(item) {
    return `<li><div><strong>${escapeHtml(item[0])}</strong><span>${item[1]} cm ×${item[2]}</span></div><b>${escapeHtml(item[3])}</b></li>`;
  }
  function renderPoleModel(key) {
    const model = poleModels[key] || poleModels.azul;
    const crossPieces = [...model.cross, model.crossMiddle];
    const crossTotal = crossPieces.reduce((sum, item) => sum + item[1] * item[2], 0);
    const verticalTotal = model.vertical.reduce((sum, item) => sum + item[1], 0);
    $("#poleModelName").textContent = model.name;
    $("#poleModelTotals").textContent = `Suma sin encastres: travesaño ${crossTotal} cm · cada vertical ${verticalTotal} cm`;
    $("#poleCrossList").innerHTML = crossPieces.map(polePiece).join("");
    $("#poleVerticalList").innerHTML = model.vertical.map(polePiece).join("");
    const captions = $$(".pole-photo figcaption");
    captions[0].textContent = `Pie · ${model.vertical[0][1]} cm`;
    captions[1].textContent = `Medio · ${model.vertical[1][1]} cm`;
    captions[2].textContent = `Puntera · ${model.vertical[2][1]} cm`;
    $$("[data-pole-model]").forEach(button => button.classList.toggle("active", button.dataset.poleModel === key));
  }
  function buildPoleLibrary() {
    const pane = $("#workshopPolesPane");
    pane.innerHTML = `<button class="back workshop-back" type="button">← Pendientes</button>
      <div class="section-title"><div><span class="eyebrow">BIBLIOTECA DE PIEZAS</span><h3>Parantes y travesaños</h3></div><span class="count-badge">5</span></div>
      <div class="pole-model-tabs" role="tablist" aria-label="Modelos de carpa">
        <button type="button" data-pole-model="azul">Campinox azul</button>
        <button type="button" data-pole-model="pasante">Pasante con tira</button>
        <button type="button" data-pole-model="piragua">Piragua</button>
        <button type="button" data-pole-model="ardilla">Ardilla</button>
        <button type="button" data-pole-model="nahuel">Nahuel</button>
      </div>
      <article class="pole-library-card">
        <header><div><span class="eyebrow">CARPA CANADIENSE</span><h3 id="poleModelName"></h3><p id="poleModelTotals"></p></div><img src="/assets/taller-logo.webp" alt="Logo del Taller de Carpas"></header>
        <div class="pole-reference-photos">
          <figure class="pole-photo"><img src="/assets/parante-pie.jpg" alt="Pie con base naranja"><figcaption></figcaption></figure>
          <figure class="pole-photo"><img src="/assets/parante-medio.jpg" alt="Medio del parante con encastre"><figcaption></figcaption></figure>
          <figure class="pole-photo"><img src="/assets/parante-puntera.jpg" alt="Puntera con varilla"><figcaption></figcaption></figure>
        </div>
        <div class="pole-parts-columns">
          <section><h4>Travesaño</h4><p class="pole-help">Piezas horizontales</p><ul id="poleCrossList" class="pole-piece-list"></ul></section>
          <section><h4>Parantes verticales</h4><p class="pole-help">Dos juegos por carpa</p><ul id="poleVerticalList" class="pole-piece-list"></ul></section>
        </div>
        <div class="shelf-legend"><strong>Cómo leer la ubicación</strong><span>La letra indica la estantería y el número indica el sector.</span></div>
      </article>`;
    $(".workshop-back", pane).onclick = () => selectWorkshopPane("home");
    $$("[data-pole-model]", pane).forEach(button => button.onclick = () => renderPoleModel(button.dataset.poleModel));
    renderPoleModel("azul");
  }
  async function openWorkshop() {
    document.body.dataset.mode = "taller"; $("#logoutBtn").classList.remove("hidden"); show("tallerView"); selectWorkshopPane("home");
    const reset = await api("/api/taller/inicializar", json("POST", { role: "TALLER", key: state.key }));
    if (reset.error) message($("#baselineMsg"), reset.error, "error");
    else if (!reset.alreadyDone && reset.updated) message($("#baselineMsg"), `${reset.updated} reportes anteriores quedaron guardados en el historial.`, "success");
    loadPending();
  }
  async function loadPending() {
    $("#pendingList").innerHTML = '<div class="empty">Cargando pendientes…</div>';
    const data = await api(`/api/taller/pendientes?role=TALLER&key=${encodeURIComponent(state.key)}`);
    if (data.error) { $("#pendingList").innerHTML = `<div class="empty">${escapeHtml(data.error)}</div>`; return; }
    $("#pendingCount").textContent = data.total; renderReports($("#pendingList"), data.reportes, "No hay reparaciones pendientes.");
  }
  async function loadCarpaSearch(id) {
    state.historyCarpa = id; $("#searchResultList").innerHTML = '<div class="empty">Cargando ficha…</div>';
    const data = await api(`/api/carpas/${id}/reportes?role=TALLER&key=${encodeURIComponent(state.key)}`);
    if (data.error) return renderReports($("#searchResultList"), [], data.error);
    const indicator = $("#carpaStatus"); indicator.classList.remove("hidden", "pending", "repaired", "empty");
    if (data.pendientes > 0) { indicator.classList.add("pending"); $("strong", indicator).textContent = `${id} · PENDIENTE`; }
    else if (data.total > 0) { indicator.classList.add("repaired"); $("strong", indicator).textContent = `${id} · ARREGLADA`; }
    else { indicator.classList.add("empty"); $("strong", indicator).textContent = `${id} · SIN REPORTES`; }
    renderReports($("#searchResultList"), data.reportes, `${id} todavía no tiene reportes.`);
  }
  async function loadAllHistory() {
    $("#historyList").innerHTML = '<div class="empty">Cargando historial…</div>';
    const data = await api(`/api/taller/historial?role=TALLER&key=${encodeURIComponent(state.key)}`);
    if (data.error) return renderReports($("#historyList"), [], data.error);
    $("#historyCount").textContent = data.total; renderReports($("#historyList"), data.reportes, "Todavía no hay carpas arregladas.");
  }
  function renderReports(container, reports, empty) {
    container.innerHTML = ""; if (!reports.length) { container.innerHTML = `<div class="empty">${escapeHtml(empty)}</div>`; return; }
    reports.forEach(report => {
      const node = $("#reportTemplate").content.cloneNode(true); const article = $(".report", node); const status = report.estado || (report.destino === "campo" ? "reparada" : "pendiente");
      $(".report-carpa", node).textContent = report.carpaId; $("time", node).textContent = formatDate(report.createdAt); $(".status", node).textContent = status.replace("_", " "); $(".status", node).classList.add(status);
      const tags = [...(report.problemas || [])]; if (report.prioridad === "urgente") tags.unshift("⚠ urgente"); $(".tags", node).innerHTML = tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
      $(".detail", node).textContent = report.detalle || "Sin observaciones."; $(".zones", node).textContent = `Zonas: ${(report.puntos || report.partes || []).map(pointLabel).join(", ") || "sin marcar"}${report.reportadoPor ? ` · Reportó: ${report.reportadoPor}` : ""}`;
      if (report.foto) { $(".report-photo", node).src = report.foto; $(".report-photo", node).classList.remove("hidden"); }
      $(".shop-priority", node).value = report.prioridad || "normal"; $(".state", node).value = status; $(".destination", node).value = report.destino || "taller/estanteria"; $(".shop-note", node).value = report.tallerNota || "";
      $(".save", node).onclick = async e => { const button = e.currentTarget; button.disabled = true; const result = await api(`/api/reportes/${encodeURIComponent(report.id)}`, json("PATCH", { role: "TALLER", key: state.key, prioridad: $(".shop-priority", article).value, estado: $(".state", article).value, destino: $(".destination", article).value, tallerNota: $(".shop-note", article).value })); button.disabled = false; if (result.error) return message($(".save-msg", article), result.error, "error"); message($(".save-msg", article), "Cambios guardados.", "success"); loadPending(); if (state.historyCarpa) loadCarpaSearch(state.historyCarpa); };
      container.appendChild(node);
    });
  }
  function pointLabel(p) { const m = String(p).match(/^(sobretecho|cuerpo)_p(\d+)$/); if (!m) return p; if (m[1] === "cuerpo" && m[2] === "7") return "Cierre"; return `${m[1] === "cuerpo" ? "Cuerpo" : "Sobretecho"} P${m[2]}`; }
  function formatDate(value) { if (!value) return "Sin fecha"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }); }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  buildPoleLibrary();
  if (location.pathname === "/taller") begin("TALLER");
  else if (state.carpaId) begin("ATP");
})();
