/* eslint-disable no-console */
const path = require("path");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(process.cwd(), "serviceAccountKey.json");

const TIME_ZONE = process.env.AGENDA_TIMEZONE || "America/Argentina/Buenos_Aires";
const LOOKAHEAD_MINUTES = Number(process.env.AGENDA_LOOKAHEAD_MINUTES || 15);
const SCAN_INTERVAL_MS = Number(process.env.AGENDA_SCAN_INTERVAL_MS || 60_000);

function getDateKeyInTimezone(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    return fmt.format(date);
}

function parseEventDateTimeMs(dateKey, hora) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
    if (!match) {
        return null;
    }
    const [hh, mm] = String(hora || "00:00").split(":");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(hh) || 0;
    const minute = Number(mm) || 0;

    // Construimos en zona horaria local del servidor y corregimos con formato de zona destino.
    const approx = new Date(year, month - 1, day, hour, minute, 0, 0);
    const tzRendered = new Date(
        approx.toLocaleString("en-US", {
            timeZone: TIME_ZONE,
            hour12: false
        })
    );
    const localRendered = new Date(
        approx.toLocaleString("en-US", {
            hour12: false
        })
    );
    const tzOffset = localRendered.getTime() - tzRendered.getTime();
    return approx.getTime() + tzOffset;
}

function buildDedupId({ dateKey, eventId, remindAtMs }) {
    const minuteBucket = Math.floor(remindAtMs / 60_000);
    return `${dateKey}_${eventId}_${minuteBucket}`;
}

async function ensureInitialized() {
    if (admin.apps.length > 0) {
        return;
    }
    admin.initializeApp({
        credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
    });
    console.log(`[init] Firebase Admin OK | TZ=${TIME_ZONE} | lookahead=${LOOKAHEAD_MINUTES}m`);
}

async function getPushTokens(db) {
    const snap = await db.collection("pushTokens").get();
    const tokens = [];
    snap.forEach((doc) => {
        const token = doc.data()?.token;
        if (token) {
            tokens.push(token);
        }
    });
    return tokens;
}

async function removeInvalidTokens(db, errorsByToken) {
    const batch = db.batch();
    let count = 0;
    errorsByToken.forEach((errorCode, token) => {
        if (errorCode === "messaging/registration-token-not-registered" || errorCode === "messaging/invalid-registration-token") {
            batch.delete(db.collection("pushTokens").doc(token));
            count += 1;
        }
    });
    if (count > 0) {
        await batch.commit();
        console.log(`[tokens] eliminados ${count} tokens invalidos`);
    }
}

async function wasAlreadySent(db, dedupId) {
    const ref = db.collection("notificationLog").doc(dedupId);
    const snap = await ref.get();
    return snap.exists;
}

async function markSent(db, dedupId, payload) {
    await db.collection("notificationLog").doc(dedupId).set({
        ...payload,
        sentAt: new Date().toISOString()
    });
}

async function scanAndSend() {
    await ensureInitialized();
    const db = admin.firestore();
    const nowMs = Date.now();
    const dateKey = getDateKeyInTimezone(new Date(nowMs));

    const dayDoc = await db.collection("agendaDays").doc(dateKey).get();
    if (!dayDoc.exists) {
        console.log(`[scan] ${dateKey} sin documento de agendaDays`);
        return;
    }

    const data = dayDoc.data() || {};
    const eventos = Array.isArray(data.eventos) ? data.eventos : [];
    if (eventos.length === 0) {
        console.log(`[scan] ${dateKey} sin eventos`);
        return;
    }

    const tokens = await getPushTokens(db);
    if (tokens.length === 0) {
        console.log("[scan] sin tokens push registrados");
        return;
    }

    let sentCount = 0;
    for (const ev of eventos) {
        const eventId = String(ev?.id || "");
        const titulo = String(ev?.titulo || "(sin titulo)");
        const asunto = String(ev?.asunto || "Personal");
        const hora = String(ev?.hora || "00:00");
        if (!eventId) {
            continue;
        }
        const eventMs = parseEventDateTimeMs(dateKey, hora);
        if (!eventMs) {
            continue;
        }

        const remindAtMs = eventMs - LOOKAHEAD_MINUTES * 60_000;
        const deltaMs = nowMs - remindAtMs;
        const inWindow = deltaMs >= 0 && deltaMs < SCAN_INTERVAL_MS;
        if (!inWindow) {
            continue;
        }

        const dedupId = buildDedupId({ dateKey, eventId, remindAtMs });
        if (await wasAlreadySent(db, dedupId)) {
            continue;
        }

        const message = {
            notification: {
                title: `Recordatorio: ${titulo}`,
                body: `Faltan ${LOOKAHEAD_MINUTES} min · ${hora} · ${asunto}`
            },
            data: {
                tag: `agenda-evento-${dateKey}-${eventId}`,
                dateKey,
                eventoId: eventId,
                hora
            },
            tokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        const invalidByToken = new Map();
        response.responses.forEach((r, idx) => {
            if (!r.success) {
                invalidByToken.set(tokens[idx], r.error?.code || "unknown");
            }
        });
        await removeInvalidTokens(db, invalidByToken);
        await markSent(db, dedupId, {
            dateKey,
            eventId,
            titulo,
            hora,
            asunto,
            totalTokens: tokens.length,
            successCount: response.successCount,
            failureCount: response.failureCount
        });
        sentCount += response.successCount;
        console.log(`[push] "${titulo}" -> ok=${response.successCount} fail=${response.failureCount}`);
    }

    if (sentCount === 0) {
        console.log(`[scan] ${dateKey} sin recordatorios para enviar en esta vuelta`);
    }
}

async function main() {
    await scanAndSend();
    setInterval(() => {
        scanAndSend().catch((err) => {
            console.error("[scan-error]", err?.message || err);
        });
    }, SCAN_INTERVAL_MS);
}

main().catch((err) => {
    console.error("[fatal]", err?.message || err);
    process.exit(1);
});
