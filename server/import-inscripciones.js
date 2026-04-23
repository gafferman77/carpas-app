/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const INPUT_FILE =
    process.env.INSCRIPCIONES_XLSX_PATH || "C:/Users/roots/Downloads/inscripciones.xlsx";
const PRESENTISMO_FILE =
    process.env.PRESENTISMO_XLSX_PATH || "C:/Users/roots/Downloads/presentismo_2026-04-18.xlsx";
const OUTPUT_FILE = path.resolve(process.cwd(), "data", "alumnos.json");

const DATA_START_ROW_INDEX = 2;

function toSafeString(value) {
    return String(value ?? "").trim();
}

function normalizeText(value) {
    return toSafeString(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function toIsoDate(value) {
    if (!value) {
        return "";
    }
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    const raw = toSafeString(value);
    if (!raw) {
        return "";
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }
    return parsed.toISOString().slice(0, 10);
}

function normalizeHeader(value, index) {
    const clean = toSafeString(value);
    return clean || `columna_${index}`;
}

function buildUniqueHeaders(row) {
    const counts = new Map();
    return (row || []).map((headerValue, index) => {
        const base = normalizeHeader(headerValue, index);
        const seen = counts.get(base) || 0;
        counts.set(base, seen + 1);
        return seen === 0 ? base : `${base}_${seen}`;
    });
}

function extractRows(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (rows.length <= DATA_START_ROW_INDEX) {
        return [];
    }

    const headers = buildUniqueHeaders(rows[1] || []);
    return rows.slice(DATA_START_ROW_INDEX).map((row) => {
        const record = {};
        headers.forEach((header, index) => {
            record[header] = row[index] ?? "";
        });
        return record;
    });
}

function mapStudent(record) {
    const responsableTelefonoFijo = toSafeString(record["Teléfono Fijo"]);
    const responsableTelefonoCelular = toSafeString(record["Teléfono celular"]);
    const segundoResponsableTelefono = toSafeString(record["Teléfono celular_1"]);

    return {
        tipoDocumento: toSafeString(record["Tipo de Documento"]),
        numeroDocumento: toSafeString(record["N° de Documento"]),
        nombre: toSafeString(record["Nombre"]),
        apellido: toSafeString(record["Apellido"]),
        genero: toSafeString(record["Género"]),
        fechaNacimiento: toIsoDate(record["Fecha de nacimiento"]),
        pais: toSafeString(record["País"]),
        gradoAnio: toSafeString(record["Sala/Grado/Año"]),
        escuelaActual: toSafeString(record["Nombre de escuela"]),
        distritoEscolar: toSafeString(record["Distrito escolar"]),
        comuna: toSafeString(record["Comuna"]),
        telefono: responsableTelefonoFijo || responsableTelefonoCelular,
        telefonoResponsable: responsableTelefonoCelular || responsableTelefonoFijo,
        telefonoSegundoResponsable: segundoResponsableTelefono,
        responsable: {
            nombre: toSafeString(record["Nombre_1"] || record["Nombre"]),
            apellido: toSafeString(record["Apellido_1"] || record["Apellido"]),
            telefono: responsableTelefonoCelular || responsableTelefonoFijo,
            correo: toSafeString(record["Correo electrónico"])
        }
    };
}

function dedupeByDocument(students) {
    const seen = new Set();
    return students.filter((student) => {
        const key = student.numeroDocumento || `${student.apellido}|${student.nombre}`;
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function sortStudents(students) {
    return [...students].sort((a, b) => {
        const byLastName = a.apellido.localeCompare(b.apellido, "es", { sensitivity: "base" });
        if (byLastName !== 0) {
            return byLastName;
        }
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
}

function ensureDirectory(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function buildPresentismoIndex() {
    if (!fs.existsSync(PRESENTISMO_FILE)) {
        return { byDoc: new Set(), byName: new Set(), loaded: false };
    }
    const workbook = XLSX.readFile(PRESENTISMO_FILE, { cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
    const byDoc = new Set();
    const byName = new Set();

    rows.slice(1).forEach((row) => {
        const doc = toSafeString(row[2]);
        const estudiante = toSafeString(row[3]);
        if (doc) {
            byDoc.add(doc);
        }
        if (estudiante) {
            byName.add(normalizeText(estudiante));
        }
    });

    return { byDoc, byName, loaded: true };
}

function main() {
    if (!fs.existsSync(INPUT_FILE)) {
        throw new Error(`No se encontro el archivo Excel: ${INPUT_FILE}`);
    }

    const workbook = XLSX.readFile(INPUT_FILE, { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const sourceRows = extractRows(firstSheet);

    const presentismo = buildPresentismoIndex();
    const students = sourceRows
        .map(mapStudent)
        .map((student) => {
            const nameKey = normalizeText(`${student.apellido}, ${student.nombre}`);
            const inscripto =
                presentismo.byDoc.has(student.numeroDocumento) || presentismo.byName.has(nameKey);
            return {
                ...student,
                inscripto
            };
        })
        .filter((s) => s.nombre && s.apellido && (s.numeroDocumento || s.responsable.telefono));
    const deduped = dedupeByDocument(students);
    const sorted = sortStudents(deduped);

    const payload = {
        generatedAt: new Date().toISOString(),
        sourceFile: INPUT_FILE,
        sourcePresentismoFile: PRESENTISMO_FILE,
        presentismoLoaded: presentismo.loaded,
        sourceSheet: firstSheetName,
        total: sorted.length,
        alumnos: sorted
    };

    ensureDirectory(OUTPUT_FILE);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), "utf8");

    console.log(`[ok] Importados ${sorted.length} alumnos`);
    console.log(`[ok] Archivo generado: ${OUTPUT_FILE}`);
}

main();
