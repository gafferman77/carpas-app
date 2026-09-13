# Sistema de Carpas — versión 2

Aplicación móvil para reportar y gestionar reparaciones. Conserva las rutas usadas por los QR físicos (`/carpa/CARPA-001`) y la colección existente `carpasReportes` de Firestore.

## Flujo

- **ATP:** escanea el QR o escribe el número, marca problema y zona, y envía el parte.
- **Taller:** ve todos los pendientes, puede buscar `35`, `035`, `CARPA-35` o `carpa 35`, y consulta el historial de `CARPA-035`.
- **Estados:** pendiente, en reparación, reparada y baja.
- **Rango:** `CARPA-001` a `CARPA-180`.

La aplicación conserva compatibilidad con reportes anteriores sin el campo `estado`. Un reporte viejo enviado a `campo` se considera reparado; los demás se consideran pendientes.

## Inicio local

```bash
npm install
npm test
npm start
```

Variables: `ATP_KEY`, `TALLER_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON` (recomendada en producción), `GOOGLE_APPLICATION_CREDENTIALS`, `PORT` y `APP_VERSION`.

## Velocidad

Los recursos estáticos ahora usan caché y el *service worker* conserva la interfaz en el teléfono después de la primera visita. Las siguientes aperturas pueden mostrar la pantalla mientras el servidor se inicia. Guardar o consultar datos requiere conexión.

## Publicación sin cambiar los QR

Hay que actualizar el servicio existente `carpas-app-1` en Render, no crear una URL nueva. Mientras se conserve `https://carpas-app-1.onrender.com/carpa/CARPA-XXX`, los QR continúan funcionando. Para eliminar por completo el primer arranque lento hace falta mantener ese servicio activo o realizar una migración controlada que preserve exactamente el hostname; el caché reduce el impacto en teléfonos que ya abrieron la aplicación.
