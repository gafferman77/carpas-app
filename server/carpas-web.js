/* eslint-disable no-console */
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const admin = require("firebase-admin");

const PORT = Number(process.env.PORT || process.env.CARPAS_PORT || 5050);
const ATP_KEY = String(process.env.ATP_KEY || "faro");
const TALLER_KEY = String(process.env.TALLER_KEY || "taller");
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(process.cwd(), "agenda-roots-v2-firebase-adminsdk-fbsvc-80840e73b8.json");
const PUBLIC_DIR = path.resolve(process.cwd(), "carpas-web");

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
    return value.map((v) => String(v || "").trim()).filter(Boolean);
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.get("/carpa/:carpaId", (_req, res) => {
    res.sendFile(path.resolve(PUBLIC_DIR, "index.html"));
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
    const partes = asParts(req.body?.partes);
    const detalle = String(req.body?.detalle || "").trim();
    const prioridad = String(req.body?.prioridad || "media").trim().toLowerCase();
    const creadoPor = String(req.body?.creadoPor || "ATP").trim();

    if (!carpaId) {
        return res.status(400).json({ error: "Carpa invalida" });
    }
    if (!partes.length && !detalle) {
        return res.status(400).json({ error: "Debes indicar parte o detalle" });
    }

    try {
        const db = await ensureDb();
        const now = new Date().toISOString();
        const docRef = await db.collection("carpasReportes").add({
            carpaId,
            partes,
            detalle,
            prioridad,
            creadoPor,
            createdAt: now,
            updatedAt: now,
            estado: "pendiente",
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
    const estado = String(req.body?.estado || "").trim().toLowerCase();
    const tallerNota = String(req.body?.tallerNota || "").trim();
    const allowed = new Set(["pendiente", "en reparacion", "reparada"]);
    if (!allowed.has(estado)) {
        return res.status(400).json({ error: "Estado invalido" });
    }

    try {
        const db = await ensureDb();
        await db.collection("carpasReportes").doc(reporteId).set(
            {
                estado,
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
