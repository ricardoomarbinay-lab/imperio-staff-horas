# Imperio RP — Staff Horas

Panel privado de horas para Railway, con acceso mediante Google/Gmail autorizado.

## Funciones
- OWNER: administración completa de la página, usuarios, permisos, rangos, horas, logs y respaldo.
- EDITOR: solo puede editar horas.
- VIEWER: solo puede visualizar.
- Rangos de staff separados de los permisos: HIGH = ADM/ADM+/ADM++, MID = MOD/MOD+/MOD++, LOW = SDP/SP/SE.
- Tarifas: HIGH $2.000.000/h, MID $1.500.000/h, LOW $1.000.000/h.
- Semana sábado a viernes.
- Fechas y reloj se actualizan en tiempo real.
- Cada casilla comienza en 0:00.
- Formato H:MM; se permite 1:67 (los minutos se contabilizan matemáticamente como minutos, por lo que 1:67 equivale a 127 minutos).
- Estados por casilla: normal, Inactivo, Inactividad justificada y Anulado.
- Drag & drop de usuarios entre categorías para OWNER.
- Cambio de rango con click, limitado a la categoría correspondiente.
- Agregar/eliminar usuarios mediante email de Google.
- Si el Gmail no está autorizado, aparece un candado y el mensaje de acceso denegado.
- No se muestra Tag de Discord ni Discord ID en la tabla.

## Railway

1. Subí el contenido de esta carpeta a GitHub.
2. En Railway: New Project → Deploy from GitHub Repo.
3. Agregá un Volume montado en `/data`.
4. Variables:
   - `NODE_ENV=production`
   - `DATA_DIR=/data`
   - `OWNER_EMAIL=tu-gmail-de-owner@gmail.com`
   - `SESSION_SECRET=` una cadena larga y aleatoria
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
   - `BASE_URL=https://TU-DOMINIO.up.railway.app`
   - `APP_TIMEZONE=America/Argentina/Buenos_Aires`
5. En Google Cloud Console creá un OAuth Client tipo Web application y agregá como Authorized redirect URI:
   `https://TU-DOMINIO.up.railway.app/auth/google/callback`
6. Deploy.
7. Abrí el dominio y entrá con el Gmail configurado en `OWNER_EMAIL`.

## Importante
No pongas `GOOGLE_CLIENT_SECRET` ni `SESSION_SECRET` dentro del código ni los subas a GitHub. Guardalos solamente como variables de Railway.
