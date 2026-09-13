/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const express = require("express");
const admin = require("firebase-admin");

const PORT = Number(process.env.PORT || process.env.CARPAS_PORT || 5050);
const ATP_KEY = String(process.env.ATP_KEY || "faro");
const TALLER_KEY = String(process.env.TALLER_KEY || "taller");
const APP_VERSION = String(process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || Date.now());
const PUBLIC_DIR = path.resolve(process.cwd(), "carpas-web");
const INDEX_PATH = path.join(PUBLIC_DIR, "index.html");
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(process.cwd(), "agenda-roots-v2-firebase-adminsdk-fbsvc-80840e73b8.json");

let indexTemplate;
function normalizeCarpaId(value) {
    const match = String(value || "").trim().toUpperCase().match(/^(?:CARPA[\s-_]*)?0*(\d{1,3})$/);
    if (!match) return "";
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > 180) return "";
    return `CARPA-${String(number).padStart(3, "0")}`;
}
function normalizeText(value) { return String(value || "").trim().toLowerCase(); }
function validateAccess(role, key) {
    if (role === "ATP") return normalizeText(key) === normalizeText(ATP_KEY);
    if (role === "TALLER") return normalizeText(key) === normalizeText(TALLER_KEY);
    return false;
}
function cleanList(value, pattern) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((v) => String(v || "").trim().toLowerCase()).filter((v) => pattern.test(v)))];
}
function cleanString(value, max = 1000) { return String(value || "").trim().slice(0, max); }
function isPending(report) {
    const state = report.estado || (report.destino === "campo" ? "reparada" : "pendiente");
    return state === "pendiente" || state === "en_reparacion";
}
function serializeDoc(doc) { return { id: doc.id, ...doc.data() }; }
function sortNewest(items) { return items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))); }

async function ensureDb() {
    if (!admin.apps.length) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (raw) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
        else {
            if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) throw new Error("Falta la credencial de Firebase");
            admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
        }
    }
    return admin.firestore();
}
function sendApp(res) {
    if (!indexTemplate) indexTemplate = fs.readFileSync(INDEX_PATH, "utf8");
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(indexTemplate.replace(/__ASSET_VERSION__/g, APP_VERSION));
}
function requireRole(source, role, res) {
    if (!validateAccess(String(source.role || ""), String(source.key || "")) || source.role !== role) {
        res.status(401).json({ error: `Acceso inválido para ${role}` }); return false;
    }
    return true;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR, {
    etag: true, maxAge: "7d", index: false,
    setHeaders(res, filePath) { if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache"); }
}));
app.get("/health", (_req, res) => res.json({ ok: true, version: APP_VERSION }));
app.get(["/", "/taller"], (_req, res) => sendApp(res));
app.get("/carpa/:rawId", (req, res) => {
    const carpaId = normalizeCarpaId(req.params.rawId);
    if (!carpaId) return res.status(404).type("text").send("Número de carpa inválido (1 a 180)");
    if (req.params.rawId !== carpaId) return res.redirect(302, `/carpa/${carpaId}`);
    return sendApp(res);
});
app.post("/api/auth", (req, res) => res.json({ ok: validateAccess(String(req.body.role || ""), String(req.body.key || "")) }));
app.get("/api/carpas/normalizar/:value", (req, res) => {
    const carpaId = normalizeCarpaId(req.params.value);
    if (!carpaId) return res.status(400).json({ error: "Ingresá un número de carpa entre 1 y 180" });
    res.json({ ok: true, carpaId });
});
app.post("/api/carpas/:rawId/reportes", async (req, res) => {
    if (!requireRole(req.body, "ATP", res)) return;
    const carpaId = normalizeCarpaId(req.params.rawId);
    const puntos = cleanList(req.body.puntos, /^(sobretecho|cuerpo)_p\d+$/);
    const problemas = cleanList(req.body.problemas, /^(rotura|costura|cierre|piso|estructura|faltante|otro)$/);
    const detalle = cleanString(req.body.detalle);
    if (!carpaId) return res.status(400).json({ error: "Carpa inválida" });
    if (!puntos.length && !problemas.length && !detalle) return res.status(400).json({ error: "Marcá un daño o escribí una observación" });
    try {
        const db = await ensureDb(); const now = new Date().toISOString();
        const ref = await db.collection("carpasReportes").add({ carpaId, puntos, partes: puntos, problemas, detalle, reportadoPor: cleanString(req.body.reportadoPor, 80), prioridad: ["normal", "urgente"].includes(req.body.prioridad) ? req.body.prioridad : "normal", estado: "pendiente", destino: "taller/estanteria", tallerNota: "", createdAt: now, updatedAt: now });
        await db.collection("carpas").doc(carpaId).set({ carpaId, updatedAt: now, hasPending: true }, { merge: true });
        res.json({ ok: true, reporteId: ref.id, carpaId });
    } catch (error) { console.error("[report-create]", error); res.status(500).json({ error: "No se pudo guardar el reporte" }); }
});
app.get("/api/carpas/:rawId/reportes", async (req, res) => {
    if (!requireRole(req.query, "TALLER", res)) return;
    const carpaId = normalizeCarpaId(req.params.rawId);
    if (!carpaId) return res.status(400).json({ error: "Carpa inválida" });
    try {
        const snap = await (await ensureDb()).collection("carpasReportes").where("carpaId", "==", carpaId).limit(200).get();
        const reports = sortNewest(snap.docs.map(serializeDoc));
        res.json({ carpaId, total: reports.length, pendientes: reports.filter(isPending).length, reportes: reports });
    } catch (error) { console.error("[report-list]", error); res.status(500).json({ error: "No se pudieron cargar los reportes" }); }
});
app.get("/api/taller/pendientes", async (req, res) => {
    if (!requireRole(req.query, "TALLER", res)) return;
    try {
        const snap = await (await ensureDb()).collection("carpasReportes").limit(500).get();
        const reports = sortNewest(snap.docs.map(serializeDoc).filter(isPending));
        res.json({ total: reports.length, reportes: reports });
    } catch (error) { console.error("[pending-list]", error); res.status(500).json({ error: "No se pudo cargar la lista de pendientes" }); }
});
app.patch("/api/reportes/:reportId", async (req, res) => {
    if (!requireRole(req.body, "TALLER", res)) return;
    const estado = cleanString(req.body.estado, 30).toLowerCase(); const destino = cleanString(req.body.destino, 30).toLowerCase();
    if (!["pendiente", "en_reparacion", "reparada", "baja"].includes(estado)) return res.status(400).json({ error: "Estado inválido" });
    if (!["taller/estanteria", "campo", "desguase"].includes(destino)) return res.status(400).json({ error: "Destino inválido" });
    try {
        const db = await ensureDb(); const ref = db.collection("carpasReportes").doc(cleanString(req.params.reportId, 160)); const before = await ref.get();
        if (!before.exists) return res.status(404).json({ error: "Reporte inexistente" });
        const now = new Date().toISOString();
        await ref.set({ estado, destino, tallerNota: cleanString(req.body.tallerNota), reparadoPor: cleanString(req.body.reparadoPor, 80), updatedAt: now }, { merge: true });
        const carpaId = before.data().carpaId; const snap = await db.collection("carpasReportes").where("carpaId", "==", carpaId).limit(200).get();
        const anyPending = snap.docs.some((doc) => doc.id === ref.id ? isPending({ ...doc.data(), estado }) : isPending(doc.data()));
        await db.collection("carpas").doc(carpaId).set({ hasPending: anyPending, updatedAt: now }, { merge: true });
        res.json({ ok: true, carpaId, hasPending: anyPending });
    } catch (error) { console.error("[report-update]", error); res.status(500).json({ error: "No se pudo actualizar el reporte" }); }
});
if (require.main === module) app.listen(PORT, () => console.log(`[carpas] http://localhost:${PORT}`));
module.exports = { app, normalizeCarpaId, isPending };
