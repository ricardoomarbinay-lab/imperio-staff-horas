# IMPERIO RP — Staff Horas

Versión actualizada del panel.

## Iniciar
1. Abrí una terminal en esta carpeta.
2. Ejecutá `npm install`.
3. Ejecutá `npm start`.
4. Abrí la dirección que aparece en la terminal, por ejemplo:
   `http://localhost:3000/panel/cambia-este-link-secreto`

## Funciones
- HIGH STAFF: ADM, ADM+, ADM++
- MID STAFF: MOD, MOD+, MOD++
- LOW STAFF: SDP, SP, SE
- Días: Sábado a Viernes.
- Horas por día y total semanal automático.
- Doble clic sobre una casilla normal para editar sus horas.
- Click derecho sobre una casilla para marcar Normal, Inactivo o Inactividad justificada.
- Las casillas rojas/amarillas no muestran las horas.
- Colores de rangos editables por Owner.
- Gestión de Owner / Editor / Viewer.
- Estadísticas por grupo.
- Datos guardados en `data/staff.json`.

## Seguridad
Cambiá `ACCESS_TOKEN` y `ADMIN_PIN` antes de publicar el servidor en Internet.
