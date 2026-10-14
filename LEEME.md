# FinanzasApp

Aplicación de finanzas personales con React/TypeScript, FastAPI y SQLite. Navegación sencilla: Inicio, Mi dinero, Pagos, Historial y Más. Con diseño móvil y acceso desde Safari.

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
- Programar pagos, confirmar los que ya realizaste y consultar sus comprobantes en Pagados. Los vencimientos recurrentes avanzan al confirmar y cada vencimiento solo se descuenta una vez.
- Historial completo con búsqueda, filtros de tipo/cuenta/fechas, paginación y detalle del origen de cada movimiento.
- Recordatorios recurrentes opcionales en Google Calendar.
- Revisar comprobantes de consumos realizados en soles desde Gmail, excluyendo promociones, transferencias, retiros y recordatorios. Confirmar importe y cuenta y registrar cada consumo una sola vez por buzón e ID.
- Metas de ahorro informativas, reportes por categoría y exportación CSV.
- Registro de cuentas normales y panel privado para un único administrador.
- Pantalla Revisar gastos separada de las conexiones personales.
- Inicio de sesión, sesiones con cookie HttpOnly y CSRF, datos aislados, tokens Google cifrados y respaldo cifrado.
- Manifest e iconos para Añadir a pantalla de inicio en Safari. Requiere conexión; no ofrece finanzas sin conexión.

Los recordatorios no realizan pagos; los aportes a metas solo reflejan progreso y no trasladan fondos. Gmail busca cada minuto mientras Inicio o Revisar gastos estén visibles; no envía notificaciones push. Desconectar elimina los tokens locales; puedes revocar permisos desde tu cuenta Google.

## Cómo usarla

1. **Inicio:** consulta saldo, ingresos y gastos de este mes y próximos vencimientos. Si empiezas de cero, añade tu dinero actual como ingreso.
2. **Mi dinero:** todas tus cuentas están visibles; puedes añadir o editar una cuenta y abrir su historial. Las tarjetas están en un apartado desplegable.
3. **Pagos:** programa un vencimiento sin descontar dinero. Cuando ya lo hayas pagado, pulsa **Ya pagué**, revisa importe y cuenta y confirma. Se guarda un gasto; un pago recurrente prepara el siguiente vencimiento.
4. **Historial:** busca cualquier ingreso, gasto o retiro. **Pagos → Pagados** muestra los pagos programados confirmados, con su fecha de vencimiento y registro.
5. **Más:** entra a Revisar gastos de Gmail, Metas, Reportes o Conexiones. Administración solo aparece para el propietario.

No confirmes otra vez un gasto que ya registraste manualmente o desde Gmail: la protección contra duplicados de pagos se aplica al mismo vencimiento, no a registros creados por vías distintas. Los registros anteriores se conservan en Historial; no se inventan comprobantes ni estados de pago para ellos. Las fechas del historial corresponden a Perú.

## Desarrollo y comprobaciones

```powershell
py -3 scripts/manage.py test
```

`install` prepara copias Linux/Windows/macOS en `.finanzas-runtime`, instala Python y ejecuta `npm ci` y la compilación. Tras editar fuentes, detén los procesos y ejecuta `install` otra vez antes de iniciar. Las pruebas usan bases temporales y APIs Google simuladas; la conexión real necesita credenciales y consentimiento.

Los datos personales viven fuera del checkout; consulta las ubicaciones en la guía. El SQLite, `node_modules` y el venv Windows originalmente versionados se conservan. No se importan registros anteriores de forma automática. Los scripts originales de desarrollo sin autenticación han quedado sustituidos por el arranque con usuarios.
