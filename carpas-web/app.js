(() => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const views = $$(".view");
  const state = { role: "", key: "", carpaId: carpaFromPath(), historyCarpa: "" };

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
    state.role = role; $("#loginRole").textContent = role === "ATP" ? "ATP" : "TALLER";
    $("#tallerLoginLogo").classList.toggle("hidden", role !== "TALLER");
    $("#keyInput").value = ""; message($("#loginMsg"), ""); show("loginView"); $("#keyInput").focus();
  }
  $("#keyInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#loginBtn").click(); });
  $("#loginBtn").onclick = async () => {
    const key = $("#keyInput").value.trim(); if (!key) return message($("#loginMsg"), "Ingresá la palabra clave.", "error");
    $("#loginBtn").disabled = true; const data = await api("/api/auth", json("POST", { role: state.role, key })); $("#loginBtn").disabled = false;
    if (!data.ok) return message($("#loginMsg"), "La clave no es correcta.", "error");
    state.key = key; $("#logoutBtn").classList.remove("hidden");
    if (state.role === "TALLER") { show("tallerView"); loadPending(); }
    else if (state.carpaId) openAtp(state.carpaId); else { $("#searchRole").textContent = "ATP"; show("searchView"); }
  };

  function useSearch(input, msg, callback) { const id = normalizeCarpa(input.value); if (!id) return message(msg, "Ingresá un número entre 1 y 180.", "error"); message(msg, ""); callback(id); }
  $("#searchBtn").onclick = () => useSearch($("#carpaSearch"), $("#searchMsg"), openAtp);
  $("#carpaSearch").addEventListener("keydown", e => { if (e.key === "Enter") $("#searchBtn").click(); });
  function openAtp(id) { state.carpaId = id; $("#atpCarpa").textContent = id; show("atpView"); }
  $$("[data-problem], [data-point]").forEach(btn => btn.onclick = () => btn.classList.toggle("selected"));
  $("#sendReportBtn").onclick = async () => {
    const btn = $("#sendReportBtn"); const body = { role: state.role, key: state.key, reportadoPor: $("#reportadoPor").value, problemas: $$("[data-problem].selected").map(x => x.dataset.problem), puntos: $$("[data-point].selected").map(x => x.dataset.point), prioridad: $("input[name=priority]:checked").value, detalle: $("#detalle").value.trim() };
    btn.disabled = true; btn.textContent = "Enviando…"; const data = await api(`/api/carpas/${state.carpaId}/reportes`, json("POST", body)); btn.disabled = false; btn.textContent = "Enviar al taller";
    if (data.error) return message($("#atpMsg"), data.error, "error");
    $("#atpView").innerHTML = `<div class="panel success-card"><span class="check">✓</span><h2>Reporte enviado</h2><p>El taller ya puede ver el parte de <strong>${data.carpaId}</strong> en su lista de pendientes.</p><button class="primary" id="finishBtn">Finalizar</button></div>`;
    $("#finishBtn").onclick = goHome;
  };

  $("#refreshBtn").onclick = loadPending;
  $("#tallerSearchBtn").onclick = () => useSearch($("#tallerSearch"), $("#tallerSearchMsg"), loadHistory);
  $("#tallerSearch").addEventListener("keydown", e => { if (e.key === "Enter") $("#tallerSearchBtn").click(); });
  $$("[data-tab]").forEach(btn => btn.onclick = () => selectTab(btn.dataset.tab));
  function selectTab(tab) { $$("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab)); $("#pendingPane").classList.toggle("hidden", tab !== "pending"); $("#historyPane").classList.toggle("hidden", tab !== "history"); }
  async function loadPending() {
    $("#pendingList").innerHTML = '<div class="empty">Cargando pendientes…</div>';
    const data = await api(`/api/taller/pendientes?role=TALLER&key=${encodeURIComponent(state.key)}`);
    if (data.error) { $("#pendingList").innerHTML = `<div class="empty">${escapeHtml(data.error)}</div>`; return; }
    $("#pendingCount").textContent = data.total; renderReports($("#pendingList"), data.reportes, "No hay reparaciones pendientes.");
  }
  async function loadHistory(id) {
    state.historyCarpa = id; selectTab("history"); $("#historyTitle").classList.remove("hidden"); $("#historyTitle strong").textContent = id; $("#historyList").innerHTML = '<div class="empty">Cargando historial…</div>';
    const data = await api(`/api/carpas/${id}/reportes?role=TALLER&key=${encodeURIComponent(state.key)}`);
    if (data.error) return renderReports($("#historyList"), [], data.error);
    renderReports($("#historyList"), data.reportes, `${id} todavía no tiene reportes.`);
  }
  function renderReports(container, reports, empty) {
    container.innerHTML = ""; if (!reports.length) { container.innerHTML = `<div class="empty">${escapeHtml(empty)}</div>`; return; }
    reports.forEach(report => {
      const node = $("#reportTemplate").content.cloneNode(true); const article = $(".report", node); const status = report.estado || (report.destino === "campo" ? "reparada" : "pendiente");
      $(".report-carpa", node).textContent = report.carpaId; $("time", node).textContent = formatDate(report.createdAt); $(".status", node).textContent = status.replace("_", " "); $(".status", node).classList.add(status);
      const tags = [...(report.problemas || [])]; if (report.prioridad === "urgente") tags.unshift("⚠ urgente"); $(".tags", node).innerHTML = tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
      $(".detail", node).textContent = report.detalle || "Sin observaciones."; $(".zones", node).textContent = `Zonas: ${(report.puntos || report.partes || []).map(pointLabel).join(", ") || "sin marcar"}${report.reportadoPor ? ` · Reportó: ${report.reportadoPor}` : ""}`;
      $(".state", node).value = status; $(".destination", node).value = report.destino || "taller/estanteria"; $(".repaired-by", node).value = report.reparadoPor || ""; $(".shop-note", node).value = report.tallerNota || "";
      $(".save", node).onclick = async e => { const button = e.currentTarget; button.disabled = true; const result = await api(`/api/reportes/${encodeURIComponent(report.id)}`, json("PATCH", { role: "TALLER", key: state.key, estado: $(".state", article).value, destino: $(".destination", article).value, reparadoPor: $(".repaired-by", article).value, tallerNota: $(".shop-note", article).value })); button.disabled = false; if (result.error) return message($(".save-msg", article), result.error, "error"); message($(".save-msg", article), "Cambios guardados.", "success"); loadPending(); if (state.historyCarpa) loadHistory(state.historyCarpa); };
      container.appendChild(node);
    });
  }
  function pointLabel(p) { const m = String(p).match(/^(sobretecho|cuerpo)_p(\d+)$/); if (!m) return p; if (m[1] === "cuerpo" && m[2] === "7") return "Cierre"; return `${m[1] === "cuerpo" ? "Cuerpo" : "Sobretecho"} P${m[2]}`; }
  function formatDate(value) { if (!value) return "Sin fecha"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }); }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  if (location.pathname === "/taller") begin("TALLER");
  else if (state.carpaId) begin("ATP");
})();
