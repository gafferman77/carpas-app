(function () {
    const PARTS_SELECTOR = '.parts input[type="checkbox"]';
    const carpaId = getCarpaId();
    let access = { role: "", key: "" };

    const carpaLabel = document.getElementById("carpaLabel");
    const loginCard = document.getElementById("loginCard");
    const atpCard = document.getElementById("atpCard");
    const tallerCard = document.getElementById("tallerCard");

    const roleInput = document.getElementById("role");
    const keyInput = document.getElementById("key");
    const loginBtn = document.getElementById("loginBtn");
    const loginMsg = document.getElementById("loginMsg");

    const prioridadInput = document.getElementById("prioridad");
    const creadoPorInput = document.getElementById("creadoPor");
    const detalleInput = document.getElementById("detalle");
    const saveAtpBtn = document.getElementById("saveAtpBtn");
    const atpMsg = document.getElementById("atpMsg");

    const reloadBtn = document.getElementById("reloadBtn");
    const reportesBox = document.getElementById("reportes");

    carpaLabel.textContent = carpaId ? `Carpa detectada: ${carpaId}` : "Carpa no detectada";
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
        const payload = {
            role: access.role,
            key: access.key,
            partes: getCheckedParts(),
            prioridad: prioridadInput.value,
            detalle: detalleInput.value.trim(),
            creadoPor: creadoPorInput.value.trim()
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
        creadoPorInput.value = "";
        document.querySelectorAll(PARTS_SELECTOR).forEach((item) => {
            item.checked = false;
        });
    });

    reloadBtn.addEventListener("click", loadReportes);

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
        const estadoInput = document.querySelector(`[data-estado='${reporteId}']`);
        const notaInput = document.querySelector(`[data-nota='${reporteId}']`);
        const msg = document.querySelector(`[data-msg='${reporteId}']`);
        const body = {
            role: access.role,
            key: access.key,
            estado: estadoInput.value,
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
        const partes = (item.partes || []).join(", ") || "(sin partes)";
        return `
            <div class="report">
                <p><strong>ID:</strong> ${item.id}</p>
                <p><strong>Fecha:</strong> ${item.createdAt || "-"}</p>
                <p><strong>Partes:</strong> ${partes}</p>
                <p><strong>Detalle:</strong> ${item.detalle || "-"}</p>
                <p><strong>Prioridad:</strong> ${item.prioridad || "-"}</p>
                <p><strong>ATP:</strong> ${item.creadoPor || "-"}</p>
                <label>Estado</label>
                <select data-estado="${item.id}">
                    <option value="pendiente" ${item.estado === "pendiente" ? "selected" : ""}>pendiente</option>
                    <option value="en reparacion" ${item.estado === "en reparacion" ? "selected" : ""}>en reparacion</option>
                    <option value="reparada" ${item.estado === "reparada" ? "selected" : ""}>reparada</option>
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

    function getCheckedParts() {
        const selected = [];
        document.querySelectorAll(PARTS_SELECTOR).forEach((item) => {
            if (item.checked) {
                selected.push(item.value);
            }
        });
        return selected;
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
