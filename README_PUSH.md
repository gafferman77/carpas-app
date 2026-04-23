# Push automatico (15 min antes)

Este proyecto ya tiene:

- Registro de tokens en `pushTokens` (frontend).
- Service Worker para recibir push en background.
- Worker backend: `server/send-reminders.js` que envia recordatorios 15 minutos antes.

## 1) Instalar dependencias

```bash
npm install
```

## 2) Crear credencial Admin SDK

1. Firebase Console -> Project settings -> Service accounts.
2. Generate new private key.
3. Guarda el JSON como `serviceAccountKey.json` en la raiz del proyecto.

Tambien puedes usar ruta custom con:

```bash
set GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\serviceAccountKey.json
```

## 3) Configuracion cliente (si aun falta)

En `app.js` y `sw.js` completa:

- `firebaseConfig`
- `FCM_VAPID_KEY` (en `app.js`)

## 4) Ejecutar worker automatico

```bash
npm run push:worker
```

El worker:

- escanea cada 60 segundos,
- mira eventos del dia (`agendaDays/YYYY-MM-DD`),
- envia notificacion cuando faltan 15 minutos,
- evita duplicados con `notificationLog`,
- elimina tokens invalidos de `pushTokens`.

## 5) (Opcional) ajustar parametros

Variables de entorno disponibles:

- `AGENDA_TIMEZONE` (default: `America/Argentina/Buenos_Aires`)
- `AGENDA_LOOKAHEAD_MINUTES` (default: `15`)
- `AGENDA_SCAN_INTERVAL_MS` (default: `60000`)

Ejemplo:

```bash
set AGENDA_TIMEZONE=America/Argentina/Buenos_Aires
set AGENDA_LOOKAHEAD_MINUTES=15
set AGENDA_SCAN_INTERVAL_MS=60000
npm run push:worker
```
