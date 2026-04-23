# Portal de alumnos (Excel + busqueda web)

## 1) Importar datos desde Excel

Por defecto toma este archivo:

`C:/Users/roots/Downloads/inscripciones.xlsx`

Ejecutar:

```bash
npm run students:import
```

Si quieres usar otra ruta:

```bash
INSCRIPCIONES_XLSX_PATH="C:/ruta/otro-archivo.xlsx" npm run students:import
```

Esto genera:

`data/alumnos.json`

## 2) Levantar web de busqueda

```bash
npm run students:web
```

Abrir:

[http://localhost:4040](http://localhost:4040)

## 3) API disponible

- `GET /api/meta`
- `GET /api/alumnos?q=texto&grado=texto`

Busca por apellido, nombre, DNI, escuela, telefono y correo.

## Nota de privacidad

Este sistema contiene datos personales de menores y adultos responsables.
No publiques `data/alumnos.json` en repositorios publicos ni hosting abierto sin control de acceso.
