/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.STUDENTS_PORT || 4040);
const DATA_FILE = path.resolve(process.cwd(), "data", "alumnos.json");
const PUBLIC_DIR = path.resolve(process.cwd(), "students-web");

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function loadStudents() {
    if (!fs.existsSync(DATA_FILE)) {
        return { generatedAt: null, total: 0, alumnos: [] };
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get("/api/alumnos", (req, res) => {
    const { q = "" } = req.query;
    const query = normalizeText(q);
    const data = loadStudents();

    let result = data.alumnos || [];

    if (query) {
        result = result.filter((student) => {
            const fullName = normalizeText(`${student.nombre} ${student.apellido}`);
            const reversedName = normalizeText(`${student.apellido} ${student.nombre}`);
            return fullName.includes(query) || reversedName.includes(query);
        });
    }

    res.json({
        generatedAt: data.generatedAt,
        total: result.length,
        alumnos: result
    });
});

app.get("/api/meta", (_req, res) => {
    const data = loadStudents();
    res.json({
        generatedAt: data.generatedAt,
        total: data.total || 0
    });
});

app.listen(PORT, () => {
    console.log(`[students-web] http://localhost:${PORT}`);
    console.log("[students-web] usa /api/alumnos?q=texto para buscar");
});
