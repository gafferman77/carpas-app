/* eslint-disable no-console */
const fs = require("fs");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");

const TOTAL = Number(process.env.CARPAS_QR_TOTAL || 100);
const START = Number(process.env.CARPAS_QR_START || 1);
const PORT = Number(process.env.CARPAS_PORT || 5050);
const OUTPUT_DIR = path.resolve(process.cwd(), "carpas-web", "qr-output");

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

function getBaseUrl() {
    const custom = String(process.env.CARPAS_QR_BASE_URL || "").trim();
    if (custom) {
        return custom.replace(/\/+$/, "");
    }
    return `http://${getLocalIp()}:${PORT}/carpa`;
}

function formatId(number) {
    return `CARPA-${String(number).padStart(3, "0")}`;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function generate() {
    ensureDir(OUTPUT_DIR);
    const baseUrl = getBaseUrl();
    const items = [];

    for (let i = 0; i < TOTAL; i += 1) {
        const carpaNumber = START + i;
        const carpaId = formatId(carpaNumber);
        const url = `${baseUrl}/${carpaId}`;
        const fileName = `${carpaId}.png`;
        const filePath = path.resolve(OUTPUT_DIR, fileName);

        await QRCode.toFile(filePath, url, {
            type: "png",
            width: 900,
            margin: 1,
            errorCorrectionLevel: "M"
        });

        items.push({ carpaId, url, fileName });
    }

    const csv = [
        "carpaId,url,fileName",
        ...items.map((item) => `${item.carpaId},${item.url},${item.fileName}`)
    ].join("\n");
    fs.writeFileSync(path.resolve(OUTPUT_DIR, "carpas-qr-listado.csv"), csv, "utf8");

    const cards = items
        .map(
            (item) => `
<div class="card">
  <img src="./${escapeHtml(item.fileName)}" alt="${escapeHtml(item.carpaId)}" />
  <div class="label">${escapeHtml(item.carpaId)}</div>
  <div class="small">${escapeHtml(item.url)}</div>
</div>`
        )
        .join("\n");

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>100 QRs de Carpas</title>
  <style>
    @page { size: A4; margin: 8mm; }
    body { font-family: Arial, sans-serif; margin: 0; }
    .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 8px; text-align: center; page-break-inside: avoid; }
    img { width: 100%; height: auto; }
    .label { font-weight: 700; margin-top: 4px; }
    .small { font-size: 9px; color: #555; word-break: break-all; }
  </style>
</head>
<body>
  <div class="sheet">
    ${cards}
  </div>
</body>
</html>`;
    fs.writeFileSync(path.resolve(OUTPUT_DIR, "carpas-qr-print.html"), html, "utf8");

    console.log(`[ok] Generados ${items.length} QRs`);
    console.log(`[ok] Carpeta: ${OUTPUT_DIR}`);
    console.log(`[ok] Plancha imprimible: ${path.resolve(OUTPUT_DIR, "carpas-qr-print.html")}`);
    console.log(`[ok] Base URL usada: ${baseUrl}`);
}

generate().catch((error) => {
    console.error("[fatal]", error?.message || error);
    process.exit(1);
});
