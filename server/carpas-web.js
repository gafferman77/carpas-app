/* eslint-disable no-console */
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const admin = require("firebase-admin");

const PORT = Number(process.env.PORT || process.env.CARPAS_PORT || 5050);
const ATP_KEY = String(process.env.ATP_KEY || "faro");
const TALLER_KEY = String(process.env.TALLER_KEY || "taller");
const APP_VERSION = String(
    process.env.APP_VERSION ||
        process.env.RENDER_GIT_COMMIT ||
        process.env.COMMIT_REF ||
        Date.now()
);
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(process.cwd(), "agenda-roots-v2-firebase-adminsdk-fbsvc-80840e73b8.json");
const PUBLIC_DIR = path.resolve(process.cwd(), "carpas-web");
const INDEX_HTML_PATH = path.resolve(PUBLIC_DIR, "index.html");

let indexHtmlTemplate = "";

function readIndexHtmlTemplate() {
    if (!indexHtmlTemplate) {
        indexHtmlTemplate = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    }
    return indexHtmlTemplate;
}

function buildIndexHtml() {
    return readIndexHtmlTemplate().replace(/__ASSET_VERSION__/g, APP_VERSION);
}

function sendIndexHtml(res) {
    const html = buildIndexHtml();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Vary", "*");
    res.setHeader("Surrogate-Control", "no-store");
    res.status(200).send(html);
}

function getLocalIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const item of nets[name] || []) {
            if (item.family === "IPv4" && !item.internal) {
                return item.address;
            }
        }
    }
    return "localhost";
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function isValidRole(role) {
    return role === "ATP" || role === "TALLER";
}

function validateAccess(role, key) {
    if (!isValidRole(role)) {
        return false;
    }
    const safeKey = normalizeText(key);
    if (role === "ATP") {
        return safeKey === normalizeText(ATP_KEY);
    }
    return safeKey === normalizeText(TALLER_KEY);
}

async function ensureDb() {
    if (!admin.apps.length) {
        const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (rawJson) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(rawJson))
            });
        } else {
            if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
                throw new Error(`No existe la credencial de Firebase Admin: ${SERVICE_ACCOUNT_PATH}`);
            }
            admin.initializeApp({
                credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
            });
        }
    }
    return admin.firestore();
}

function asParts(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const cleaned = value.map((v) => String(v || "").trim()).filter(Boolean);
    return Array.from(new Set(cleaned));
}

function asPuntos(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const cleaned = value
        .map((v) => String(v || "").trim().toLowerCase())
        .filter((v) => /^(sobretecho|cuerpo)_p\d+$/i.test(v));
    return Array.from(new Set(cleaned));
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});
app.get("/index.html", (_req, res) => {
    sendIndexHtml(res);
});

app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Carpas</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; line-height: 1.5; }
    h1 { font-size: 22px; }
    a { color: #2563eb; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Sistema de Carpas</h1>
  <p>Esta dirección es la raíz del servidor. El formulario no está acá.</p>
  <p><strong>Para reportar:</strong> escaneá el QR de la carpa, o abrí una URL como:</p>
  <p><a href="/carpa/CARPA-001"><code>/carpa/CARPA-001</code></a> (cambiá el número por tu carpa).</p>
  <p><a href="/health">Comprobar que el servidor responde (/health)</a></p>
</body>
</html>`);
});

app.use(express.static(PUBLIC_DIR, { etag: false, maxAge: 0, index: false }));

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.get("/carpa/:carpaId", (_req, res) => {
    const requestedVersion = String(_req.query?.v || "").trim();
    if (!requestedVersion) {
        const safeCarpaId = String(_req.params?.carpaId || "").trim().toUpperCase();
        return res.redirect(302, `/carpa/${encodeURIComponent(safeCarpaId)}?v=${encodeURIComponent(APP_VERSION)}`);
    }
    sendIndexHtml(res);
});

app.post("/api/auth", (req, res) => {
    const role = String(req.body?.role || "");
    const key = String(req.body?.key || "");
    const ok = validateAccess(role, key);
    res.json({ ok });
});

app.post("/api/carpas/:carpaId/reportes", async (req, res) => {
    const role = String(req.body?.role || "");
    const key = String(req.body?.key || "");
    if (!validateAccess(role, key) || role !== "ATP") {
        return res.status(401).json({ error: "Acceso invalido para ATP" });
    }

    const carpaId = String(req.params.carpaId || "").trim().toUpperCase();
    const puntos = asPuntos(req.body?.puntos);
    const partes = asParts(req.body?.partes);
    const legacyAsPuntos = asPuntos(partes);
    const puntosFinal = puntos.length ? puntos : (legacyAsPuntos.length ? legacyAsPuntos : partes);
    const detalle = String(req.body?.detalle || "").trim();

    if (!carpaId) {
        return res.status(400).json({ error: "Carpa invalida" });
    }
    if (!puntosFinal.length && !detalle) {
        return res.status(400).json({ error: "Debes indicar puntos o detalle" });
    }

    try {
        const db = await ensureDb();
        const now = new Date().toISOString();
        const docRef = await db.collection("carpasReportes").add({
            carpaId,
            puntos: puntosFinal,
            partes: puntosFinal,
            detalle,
            createdAt: now,
            updatedAt: now,
            destino: "taller/estanteria",
            tallerNota: ""
        });
        await db.collection("carpas").doc(carpaId).set(
            {
                carpaId,
                updatedAt: now,
                hasPending: true
            },
            { merge: true }
        );
        return res.json({ ok: true, reporteId: docRef.id });
    } catch (error) {
        console.error("[report-create-error]", error?.message || error);
        return res.status(500).json({ error: "No se pudo guardar el reporte" });
    }
});

app.get("/api/carpas/:carpaId/reportes", async (req, res) => {
    const role = String(req.query?.role || "");
    const key = String(req.query?.key || "");
    if (!validateAccess(role, key) || role !== "TALLER") {
        return res.status(401).json({ error: "Acceso invalido para TALLER" });
    }

    const carpaId = String(req.params.carpaId || "").trim().toUpperCase();
    if (!carpaId) {
        return res.status(400).json({ error: "Carpa invalida" });
    }

    try {
        const db = await ensureDb();
        const snap = await db
            .collection("carpasReportes")
            .where("carpaId", "==", carpaId)
            .limit(100)
            .get();
        const reportes = [];
        snap.forEach((doc) => reportes.push({ id: doc.id, ...doc.data() }));
        reportes.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return res.json({ carpaId, total: reportes.length, reportes });
    } catch (error) {
        console.error("[report-list-error]", error?.message || error);
        return res.status(500).json({ error: "No se pudo listar reportes" });
    }
});

app.patch("/api/reportes/:reporteId", async (req, res) => {
    const role = String(req.body?.role || "");
    const key = String(req.body?.key || "");
    if (!validateAccess(role, key) || role !== "TALLER") {
        return res.status(401).json({ error: "Acceso invalido para TALLER" });
    }

    const reporteId = String(req.params.reporteId || "").trim();
    const destino = String(req.body?.destino || req.body?.estado || "").trim().toLowerCase();
    const tallerNota = String(req.body?.tallerNota || "").trim();
    const allowed = new Set(["taller/estanteria", "desguase", "campo"]);
    if (!allowed.has(destino)) {
        return res.status(400).json({ error: "Destino invalido" });
    }

    try {
        const db = await ensureDb();
        await db.collection("carpasReportes").doc(reporteId).set(
            {
                destino,
                tallerNota,
                updatedAt: new Date().toISOString()
            },
            { merge: true }
        );
        return res.json({ ok: true });
    } catch (error) {
        console.error("[report-update-error]", error?.message || error);
        return res.status(500).json({ error: "No se pudo actualizar el reporte" });
    }
});

app.listen(PORT, () => {
    const localIp = getLocalIp();
    console.log(`[carpas-web] local: http://localhost:${PORT}/carpa/CARPA-001`);
    console.log(`[carpas-web] red:   http://${localIp}:${PORT}/carpa/CARPA-001`);
    console.log("[carpas-web] ATP key=faro | TALLER key=taller");
});
