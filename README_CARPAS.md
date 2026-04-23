# Sistema ATP / TALLER + QRs de carpas

## Iniciar sistema

```bash
npm run carpas:web
```

Abrir en navegador:

- `http://localhost:5050/carpa/CARPA-001`

Claves:

- ATP: `faro`
- TALLER: `taller`

## Generar QRs

```bash
npm run carpas:qrs
```

Salida:

- `carpas-web/qr-output/` (100 PNGs)
- `carpas-web/qr-output/carpas-qr-print.html` (plancha para imprimir)
- `carpas-web/qr-output/carpas-qr-listado.csv` (listado ID + URL)

## URL base de los QR

Por defecto usa:

- `http://IP_LOCAL:5050/carpa/CARPA-001`

Si quieres otra URL base:

```bash
set CARPAS_QR_BASE_URL=https://tu-dominio.com/carpa && npm run carpas:qrs
```

## Escalabilidad

- Cada QR es una carpa fija (`CARPA-001`, `CARPA-002`, etc.)
- Los reportes se guardan en Firestore (coleccion `carpasReportes`)
- Se pueden sumar mas carpas sin cambiar el sistema

## Publicar en la web (sin depender de tu PC)

Este proyecto ya esta listo para desplegar en cualquier hosting de Node (Render, Railway, Fly.io, etc.).

### Variables de entorno necesarias

- `ATP_KEY=faro`
- `TALLER_KEY=taller`
- `FIREBASE_SERVICE_ACCOUNT_JSON` = contenido JSON completo del service account (en una sola linea)

Opcional:

- `PORT` (el hosting la define solo)

### Deploy rapido en Render (recomendado)

1. Subir este proyecto a GitHub.
2. En Render crear `New +` -> `Web Service` desde ese repo.
3. Runtime: `Docker` (detecta `Dockerfile` automaticamente).
4. Agregar las variables de entorno de arriba.
5. Deploy.
6. Copiar tu URL publica (ejemplo: `https://carpas-app.onrender.com`).

### Regenerar QRs con la URL publica

```bash
set CARPAS_QR_BASE_URL=https://TU-URL-PUBLICA/carpa && npm run carpas:qrs
```

Luego imprimir nuevamente:

- `carpas-web/qr-output/carpas-qr-print.html`
