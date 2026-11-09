# Migración del taller a Cloudflare

Esta rama no modifica el despliegue de Render. `main` mantiene la app original.

## Arquitectura
- Worker para API y rutas de fichas.
- Static Assets para `carpas-web/`.
- La misma base de datos Firebase Firestore, accesible por su API REST.
- Credencial configurada como secreto `FIREBASE_SERVICE_ACCOUNT_JSON` (nunca en GitHub).
- `ATP_KEY` como secreto de acceso ATP (configurar con el valor real de Render).

## Despliegue
Seleccionar la rama `cloudflare-migration`, no `main`.
Usar el comando `npx wrangler deploy` cuando Cloudflare pida el comando.
No desplegar antes de configurar los secretos de Firebase y ATP.
Probar primero `/health`, carga de recursos, lectura de pendientes, lectura de historial, consulta de carpa y creación/edición de un registro de prueba.
No usar `/api/taller/inicializar` manualmente en una base con datos reales: puede cerrar pendientes de forma masiva.

## Seguridad y compatibilidad
La autenticación de la app actual es débil, especialmente el perfil TALLER sin clave.
Por compatibilidad esta primera migración conserva el comportamiento actual; requiere endurecimiento antes de exposición pública ampliada.
Si Firestore tarda en responder, la API podrá tardar aunque los archivos estáticos respondan rápido.
Render queda activo hasta validar las pruebas.
