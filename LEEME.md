# Balance

Aplicación de finanzas personales con React/TypeScript, FastAPI y SQLite. Navegación: Inicio, Mi dinero, Pagos, Historial, Reportes y Metas y más. Con diseño móvil y acceso desde Safari.

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

Consulta [el inventario completo y la revisión para compartir](docs/ESTADO_PARA_COMPARTIR.md). Describe qué está implementado, los límites y la prueba privada recomendada antes de invitar usuarios.

## Funciones

- Registrar ingresos, gastos y transferencias entre cualquier par de cuentas, incluido efectivo al banco, con comisión opcional. Las transferencias no son gastos, salvo su comisión.
- Diseño en azul y menta con escarabajo ahorrador, menú lateral compacto y registro lateral con categorías por iconos.
- Tarjetas con deuda y fechas a la vista; se conserva la detección de banco y la vista previa al editarlas.
- Informe de cada tarjeta: estado del crédito, deuda, límite, disponible y fechas; actividad de la cuenta vinculada por mes, categoría e historial.
- Programar pagos, confirmar los que ya realizaste y consultar sus comprobantes en Pagados. Los vencimientos recurrentes avanzan al confirmar y cada vencimiento solo se descuenta una vez.
- Historial agrupado por día, búsqueda, filtros rápidos, paginación, detalle del movimiento y exportación CSV de la misma selección.
- Recordatorios recurrentes opcionales en Google Calendar.
- Revisar comprobantes de consumos realizados en soles desde Gmail, excluyendo promociones, transferencias, retiros y recordatorios. Confirmar importe y cuenta y registrar cada consumo una sola vez por buzón e ID.
- Metas de ahorro informativas, reportes por categoría y exportación CSV.
- Registro de cuentas normales y panel privado para un único administrador.
- Pantalla Revisar gastos separada de las conexiones personales.
- Inicio de sesión, sesiones con cookie HttpOnly y CSRF, datos aislados, tokens Google cifrados y respaldo cifrado.
- Manifest e iconos para Añadir a pantalla de inicio en Safari. Requiere conexión; no ofrece finanzas sin conexión.

Los recordatorios no realizan pagos; los aportes a metas solo reflejan progreso y no trasladan fondos. Gmail busca cada minuto mientras Inicio o Revisar gastos estén visibles; no envía notificaciones push. Desconectar elimina los tokens locales; puedes revocar permisos desde tu cuenta Google.

## Cómo usarla

1. **Inicio:** Libre para gastar es el total de cuentas menos los pagos activos con vencimiento hasta fin de mes, incluidos vencidos. Las metas informativas y la deuda manual de tarjetas no se descuentan de ese cálculo. Los gráficos usan movimientos reales.
2. **Mi dinero:** consulta la distribución del saldo, añade o edita cuentas, pasa efectivo al banco o transfiere dinero, y revisa tarjetas e informes.
3. **Pagos:** programa un vencimiento sin descontar dinero. Cuando ya lo hayas pagado, pulsa **Ya pagué**, revisa importe y cuenta y confirma. Se guarda un gasto; un pago recurrente prepara el siguiente vencimiento.
4. **Historial:** usa Este mes, Hoy, Semana o Todo, combina un tipo de movimiento y busca conceptos. Exportar descarga toda la selección filtrada, no solo la página visible. **Pagos → Pagados** conserva los comprobantes confirmados.
5. **Reportes:** compara 3, 6 o 12 meses, categorías del mes actual y el margen entre ingresos y gastos. **Metas y más** permite elegir iconos y acceder a Gmail, Google, administración (solo propietario) y cerrar sesión.
6. **+ Nuevo:** abre el panel de gasto, ingreso o transferencia. Puedes elegir fecha, usar Hoy/Ayer y revisar el saldo previsto antes de guardar. Programar un futuro pago se hace en Pagos.

**Tarjetas:** en Mi dinero pulsa Agregar tarjeta, escribe un nombre como BCP Visa clásica y mira la vista previa. Puedes seleccionar el banco si la detección no coincide. Solo se guardan los últimos cuatro dígitos. Las ilustraciones son referenciales; no identifican el modelo físico exacto. Ver informe muestra la deuda y el límite que registres, con su porcentaje utilizado y próximas fechas. Los gastos del informe pertenecen a la cuenta vinculada y se comparten entre tarjetas de esa misma cuenta; no se atribuyen automáticamente a una tarjeta. Las compras de la cuenta no actualizan la deuda de crédito: edita la tarjeta para reflejar su estado actual.

No confirmes otra vez un gasto que ya registraste manualmente o desde Gmail: la protección contra duplicados de pagos se aplica al mismo vencimiento, no a registros creados por vías distintas. Los registros anteriores se conservan en Historial; no se inventan comprobantes ni estados de pago para ellos. Las fechas del historial corresponden a Perú.

## Desarrollo y comprobaciones

```powershell
py -3 scripts/manage.py test
```

`install` prepara copias Linux/Windows/macOS en `.finanzas-runtime`, instala Python y ejecuta `npm ci` y la compilación. Tras editar fuentes, detén los procesos y ejecuta `install` otra vez antes de iniciar. Las pruebas usan bases temporales y APIs Google simuladas; la conexión real necesita credenciales y consentimiento.

Los datos personales viven fuera del checkout; consulta las ubicaciones en la guía. El SQLite, `node_modules` y el venv Windows originalmente versionados se conservan. No se importan registros anteriores de forma automática. Los scripts originales de desarrollo sin autenticación han quedado sustituidos por el arranque con usuarios.
