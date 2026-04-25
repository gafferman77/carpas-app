(function () {
    const POINT_BTN_SELECTOR = ".point-btn[data-point-id]";
    const carpaId = getCarpaId();
    const reportedSessionKey = `carpaReported:${carpaId}`;
    let access = { role: "", key: "" };

    const carpaLabel = document.getElementById("carpaLabel");
    const loginCard = document.getElementById("loginCard");
    const atpCard = document.getElementById("atpCard");
    const tallerCard = document.getElementById("tallerCard");

    const roleInput = document.getElementById("role");
    const keyInput = document.getElementById("key");
    const loginBtn = document.getElementById("loginBtn");
    const loginMsg = document.getElementById("loginMsg");

    const detalleInput = document.getElementById("detalle");
    const saveAtpBtn = document.getElementById("saveAtpBtn");
    const atpMsg = document.getElementById("atpMsg");
    const selectedPointsLabel = document.getElementById("selectedPointsLabel");
    const flowClosedBox = document.getElementById("flowClosedBox");
    const closeTabBtn = document.getElementById("closeTabBtn");

    const reloadBtn = document.getElementById("reloadBtn");
    const reportesBox = document.getElementById("reportes");

    if (hasAlreadyReportedInSession()) {
        window.location.replace("/cierre.html");
        return;
    }

    carpaLabel.textContent = carpaId ? `Carpa detectada: ${carpaId}` : "Carpa no detectada";
    bindPointSelector();
    if (!carpaId) {
        loginMsg.textContent = "URL invalida: falta ID de carpa.";
        loginMsg.className = "err";
    }

    loginBtn.addEventListener("click", async () => {
        const role = roleInput.value;
        const key = keyInput.value.trim();
        if (!carpaId) {
            return;
        }
        if (!key) {
            loginMsg.textContent = "Ingresa la palabra clave.";
            loginMsg.className = "err";
            return;
        }

        const ok = await postJson("/api/auth", { role, key });
        if (!ok || !ok.ok) {
            loginMsg.textContent = "Clave incorrecta.";
            loginMsg.className = "err";
            return;
        }

        access = { role, key };
        loginMsg.textContent = "Acceso correcto.";
        loginMsg.className = "ok";
        loginCard.classList.add("hidden");

        if (role === "ATP") {
            atpCard.classList.remove("hidden");
            return;
        }
        tallerCard.classList.remove("hidden");
        loadReportes();
    });

    saveAtpBtn.addEventListener("click", async () => {
        if (saveAtpBtn.disabled) {
            return;
        }
        const puntos = getSelectedPoints();
        const payload = {
            role: access.role,
            key: access.key,
            puntos,
            partes: puntos,
            detalle: detalleInput.value.trim()
        };

        const saved = await postJson(`/api/carpas/${encodeURIComponent(carpaId)}/reportes`, payload);
        if (!saved || !saved.ok) {
            atpMsg.textContent = saved?.error || "No se pudo guardar el reporte.";
            atpMsg.className = "err";
            return;
        }
        atpMsg.textContent = `Reporte guardado correctamente (${saved.reporteId}).`;
        atpMsg.className = "ok";
        detalleInput.value = "";
        clearSelectedPoints();
        closeAtpFlow();
    });

    reloadBtn.addEventListener("click", loadReportes);
    if (closeTabBtn) {
        closeTabBtn.addEventListener("click", closeCurrentTab);
    }

    async function loadReportes() {
        reportesBox.innerHTML = "<p class='muted'>Cargando reportes...</p>";
        const url = `/api/carpas/${encodeURIComponent(carpaId)}/reportes?role=${encodeURIComponent(
            access.role
        )}&key=${encodeURIComponent(access.key)}`;
        const data = await getJson(url);
        if (!data || data.error) {
            reportesBox.innerHTML = `<p class="err">${data?.error || "Error al cargar reportes."}</p>`;
            return;
        }
        if (!data.reportes.length) {
            reportesBox.innerHTML = "<p class='muted'>Sin reportes para esta carpa.</p>";
            return;
        }
        reportesBox.innerHTML = data.reportes.map(renderReporte).join("");
        document.querySelectorAll("[data-save-reporte]").forEach((btn) => {
            btn.addEventListener("click", saveReporteUpdate);
        });
    }

    async function saveReporteUpdate(event) {
        const reporteId = event.currentTarget.getAttribute("data-save-reporte");
        const destinoInput = document.querySelector(`[data-destino='${reporteId}']`);
        const notaInput = document.querySelector(`[data-nota='${reporteId}']`);
        const msg = document.querySelector(`[data-msg='${reporteId}']`);
        const body = {
            role: access.role,
            key: access.key,
            destino: destinoInput.value,
            tallerNota: notaInput.value.trim()
        };
        const updated = await patchJson(`/api/reportes/${encodeURIComponent(reporteId)}`, body);
        if (!updated || !updated.ok) {
            msg.textContent = updated?.error || "No se pudo actualizar.";
            msg.className = "err";
            return;
        }
        msg.textContent = "Actualizado correctamente.";
        msg.className = "ok";
    }

    function renderReporte(item) {
        const puntos = item.puntos || item.partes || [];
        const cuerpo = puntos
            .filter((p) => String(p || "").toLowerCase().includes("cuerpo"))
            .map(formatPointLabel);
        const sobretecho = puntos
            .filter((p) => String(p || "").toLowerCase().includes("sobretecho"))
            .map(formatPointLabel);
        const destino = item.destino || item.estado || "taller/estanteria";
        return `
            <div class="report">
                <p><strong>ID:</strong> ${item.id}</p>
                <p><strong>Fecha:</strong> ${item.createdAt || "-"}</p>
                <p><strong>CUERPO:</strong> ${cuerpo.join(", ") || "(sin puntos)"}</p>
                <p><strong>SOBRETECHO:</strong> ${sobretecho.join(", ") || "(sin puntos)"}</p>
                <p><strong>Observaciones:</strong> ${item.detalle || "-"}</p>
                <label>Destino</label>
                <select data-destino="${item.id}">
                    <option value="taller/estanteria" ${destino === "taller/estanteria" ? "selected" : ""}>taller/estanteria</option>
                    <option value="desguase" ${destino === "desguase" ? "selected" : ""}>desguase</option>
                    <option value="campo" ${destino === "campo" ? "selected" : ""}>campo</option>
                </select>
                <br /><br />
                <label>Nota taller</label>
                <textarea data-nota="${item.id}">${item.tallerNota || ""}</textarea>
                <br />
                <button data-save-reporte="${item.id}">Guardar cambios</button>
                <p data-msg="${item.id}" class="muted"></p>
            </div>
        `;
    }

    function bindPointSelector() {
        document.querySelectorAll(POINT_BTN_SELECTOR).forEach((btn) => {
            btn.addEventListener("click", () => {
                btn.classList.toggle("is-selected");
                renderSelectedPointsSummary();
            });
        });
        renderSelectedPointsSummary();
    }

    function getSelectedPoints() {
        return Array.from(document.querySelectorAll(`${POINT_BTN_SELECTOR}.is-selected`))
            .map((btn) => String(btn.getAttribute("data-point-id") || "").trim().toLowerCase())
            .filter(Boolean);
    }

    function clearSelectedPoints() {
        document.querySelectorAll(`${POINT_BTN_SELECTOR}.is-selected`).forEach((btn) => {
            btn.classList.remove("is-selected");
        });
        renderSelectedPointsSummary();
    }

    function renderSelectedPointsSummary() {
        if (!selectedPointsLabel) {
            return;
        }
        const selected = Array.from(document.querySelectorAll(`${POINT_BTN_SELECTOR}.is-selected`));
        const cuerpo = selected
            .filter((btn) => String(btn.getAttribute("data-point-id") || "").startsWith("cuerpo_"))
            .map((btn) => formatPointLabel(btn.getAttribute("data-point-id")));
        const sobretecho = selected
            .filter((btn) => String(btn.getAttribute("data-point-id") || "").startsWith("sobretecho_"))
            .map((btn) => formatPointLabel(btn.getAttribute("data-point-id")));
        selectedPointsLabel.innerHTML = `
            <span class="line"><strong>CUERPO:</strong> ${cuerpo.join(", ") || "ninguno"}</span>
            <span class="line"><strong>SOBRETECHO:</strong> ${sobretecho.join(", ") || "ninguno"}</span>
        `;
    }

    function formatPointLabel(raw) {
        const text = String(raw || "").trim();
        const match = text.match(/^(sobretecho|cuerpo)_p(\d+)$/i);
        if (!match) {
            return text || "-";
        }
        const zone = match[1].toLowerCase() === "sobretecho" ? "Sobretecho" : "Cuerpo";
        return `${zone} P${match[2]}`;
    }

    function closeAtpFlow() {
        markReportedInSession();
        saveAtpBtn.disabled = true;
        saveAtpBtn.textContent = "Reporte enviado";
        atpMsg.textContent = "Gracias por el informe.";
        atpMsg.className = "ok";
        if (flowClosedBox) {
            flowClosedBox.classList.remove("hidden");
        }
        setTimeout(closeCurrentTab, 700);
    }

    function closeCurrentTab() {
        window.close();
        const bust = Date.now();
        window.location.replace(`/cierre.html?v=${bust}`);
    }

    function hasAlreadyReportedInSession() {
        if (!carpaId || !window.sessionStorage) {
            return false;
        }
        return window.sessionStorage.getItem(reportedSessionKey) === "1";
    }

    function markReportedInSession() {
        if (!carpaId || !window.sessionStorage) {
            return;
        }
        window.sessionStorage.setItem(reportedSessionKey, "1");
    }

    function getCarpaId() {
        const search = new URLSearchParams(window.location.search);
        const queryId = search.get("carpa");
        if (queryId) {
            return sanitizeCarpa(queryId);
        }
        const segments = window.location.pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1] || "";
        return sanitizeCarpa(last);
    }

    function sanitizeCarpa(value) {
        const text = String(value || "").trim().toUpperCase();
        if (!text) {
            return "";
        }
        return text.replace(/[^A-Z0-9-_]/g, "");
    }

    async function getJson(url) {
        const res = await fetch(url);
        return res.json();
    }

    async function postJson(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return res.json();
    }

    async function patchJson(url, body) {
        const res = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return res.json();
    }
})();
