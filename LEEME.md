# FinanzasApp

Aplicación de finanzas personales con React/TypeScript, FastAPI y SQLite. Organizada en Inicio, Mi dinero, Pagos, Reportes, Revisar gastos y Conexiones, con diseño móvil y acceso desde Safari.

## Ejecutar en tu computadora y entrar desde iPhone

Sigue [la guía de acceso con Safari y túnel gratuito](docs/ACCESO_IPHONE.md). Incluye instalación, usuarios, Cloudflare temporal, Tailscale Funnel para dirección estable, Google OAuth y respaldo cifrado.

Windows, desde la carpeta del proyecto:

```powershell
py -3 scripts/manage.py install
py -3 scripts/manage.py user-add miusuario
py -3 scripts/manage.py admin-grant miusuario
py -3 scripts/manage.py serve
```

Para acceso por Internet, detén `serve`, instala cloudflared y ejecuta `py -3 scripts/manage.py tunnel`. En macOS/Linux usa `bash scripts/finanzas.sh` con los mismos argumentos. También hay un adaptador [PowerShell](scripts/finanzas.ps1).

La computadora debe permanecer encendida. La web y la API compiladas se sirven juntas; no se publica Vite. Cada usuario tiene sus datos y su sesión Google. El administrador se asigna desde la terminal con `admin-grant`. Una vez asignado, las personas pueden crear cuentas desde la pantalla de entrada. Solo ese administrador puede entrar a Administración, pausar registros o accesos y retirar conexiones Google. El registro web nunca asigna permisos de administrador. Un túnel no sustituye las credenciales OAuth: debes configurarlas y autorizar el callback HTTPS exacto en Google Cloud.

## Funciones

- Registrar ingresos, gastos y retiros, con saldos por cuenta y tarjetas.
- Guardar gastos fijos y próximos pagos; crear recordatorios recurrentes en Calendar.
- Revisar comprobantes de consumos realizados en soles desde Gmail, excluyendo promociones, transferencias, retiros y recordatorios. Confirmar importe y cuenta y registrar cada consumo una sola vez por buzón e ID.
- Metas de ahorro informativas, reportes por categoría y exportación CSV.
- Registro de cuentas normales y panel privado para un único administrador.
- Pantalla Revisar gastos separada de las conexiones personales.
- Inicio de sesión, sesiones con cookie HttpOnly y CSRF, datos aislados, tokens Google cifrados y respaldo cifrado.
- Manifest e iconos para Añadir a pantalla de inicio en Safari. Requiere conexión; no ofrece finanzas sin conexión.

Los recordatorios no realizan pagos; los aportes a metas solo reflejan progreso y no trasladan fondos. Gmail busca cada minuto mientras Inicio o Revisar gastos estén visibles; no envía notificaciones push. Desconectar elimina los tokens locales; puedes revocar permisos desde tu cuenta Google.

## Desarrollo y comprobaciones

```powershell
py -3 scripts/manage.py test
```

`install` prepara copias Linux/Windows/macOS en `.finanzas-runtime`, instala Python y ejecuta `npm ci` y la compilación. Tras editar fuentes, detén los procesos y ejecuta `install` otra vez antes de iniciar. Las pruebas usan bases temporales y APIs Google simuladas; la conexión real necesita credenciales y consentimiento.

Los datos personales viven fuera del checkout; consulta las ubicaciones en la guía. El SQLite, `node_modules` y el venv Windows originalmente versionados se conservan. No se importan registros anteriores de forma automática. Los scripts originales de desarrollo sin autenticación han quedado sustituidos por el arranque con usuarios.
