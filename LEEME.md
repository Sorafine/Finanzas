# FinanzasApp Web V4 — proyecto completo

Web React + TypeScript + Vite; backend FastAPI + SQLite. **No incluye dependencias instaladas ni datos personales anteriores**.

## Iniciar en Windows

En terminal 1, desde `backend`:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

En terminal 2, desde `frontend`:

```powershell
npm install
npm run dev
```

Visita http://localhost:5173 y API http://localhost:8000/docs.

## SQLite

Se crea `backend/finanzas.db` automáticamente al arrancar por primera vez. El archivo `backend/esquema_adicional.sql` documenta tablas de integración y puede ejecutarse en SQLite; **no necesitas importarlo** porque FastAPI las crea automáticamente. Antes de reemplazar una instalación anterior, cierra FastAPI y respalda el archivo `backend/finanzas.db`. Copia tu base anterior si quieres preservar registros (no se incluye en este ZIP).

## Google (desactivado hasta configurar OAuth)

1. Crea proyecto en Google Cloud y habilita Gmail API y Google Calendar API.
2. Configura pantalla de consentimiento; agrega tu correo a usuarios de prueba.
3. Crea cliente OAuth **Web** con URL de redirección `http://localhost:8000/google/callback`.
4. Dentro de la terminal PowerShell del backend, antes de arrancar el servidor:

```powershell
$env:GOOGLE_CLIENT_ID="CLIENT_ID_DE_GOOGLE"
$env:GOOGLE_CLIENT_SECRET="CLIENT_SECRET_DE_GOOGLE"
```

5. Inicia FastAPI y en `Conexiones` pulsa `Conectar Google`.

**Importante**: OAuth de Gmail con `gmail.readonly` tiene alcance restringido; para distribuirlo públicamente puede requerirse verificación y otros controles. Esta implementación es **prototipo local monousuario**, con credenciales solo en memoria. No exponer servidor a internet. `Desconectar` borra la sesión local; revoca también el permiso desde tu cuenta Google cuando corresponda.

Gmail presenta candidatos y permite descartar/marcar revisado (persistido en SQLite), **pero no los convierte todavía a movimientos**. Calendar permite crear o actualizar un recordatorio por pago programado, persistiendo `event_id` para evitar duplicados de la propia app. En este prototipo crea eventos puntuales, aún no reglas recurrentes. Los recordatorios **no confirman cargos bancarios**.

## Desarrollo futuro

Autenticación de usuarios, OAuth por sesión y tokens cifrados, revisión y registro desde Gmail con deduplicación, periodicidad en Calendar, pruebas frontend y políticas de privacidad.
