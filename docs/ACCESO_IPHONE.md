# Tu computadora como servidor, Safari como app

Necesitas Python 3.12+ (mínimo 3.11), Node.js 22.12+ o 24, Internet y mantener la computadora encendida. No necesitas App Store, cuenta de desarrollador Apple ni un VPS. La web y la API se sirven juntas, compiladas, por el puerto local 8787; no se expone el servidor de desarrollo Vite.

Cada persona tiene un usuario, cuentas y SQLite independientes. Las contraseñas se guardan con scrypt; la sesión usa una cookie HttpOnly, protección CSRF y caducidad de siete días. Google se conecta por usuario y sus tokens se guardan cifrados en disco. Las credenciales Google no se comparten entre personas.

## 1. Instalar y crear usuarios

Descarga el proyecto y abre una terminal en la carpeta `Finanzas`. Estos comandos funcionan en Windows:

```powershell
py -3 scripts/manage.py install
py -3 scripts/manage.py user-add miusuario
py -3 scripts/manage.py admin-grant miusuario
```

En macOS/Linux:

```bash
bash scripts/finanzas.sh install
bash scripts/finanzas.sh user-add miusuario
bash scripts/finanzas.sh admin-grant miusuario
```

El comando `admin-grant` asigna la administración solo a tu usuario existente. No se elige al primer visitante ni se concede este permiso al registrarse. Solo se permite una cuenta administradora. Si ya tenías usuarios antes de actualizar, sus perfiles se conservan y debes ejecutar `admin-grant TU_USUARIO` una vez. Tras iniciar el servidor, las demás personas pueden pulsar **Crear cuenta** en la pantalla de entrada; tendrán perfiles vacíos y sus propias conexiones Google. Puedes seguir creando cuentas desde la terminal con `user-add`. La contraseña usa al menos 12 caracteres. El administrador puede restablecer una contraseña con `password-reset miusuario`, que cierra sus sesiones anteriores.

Para comprobar la aplicación localmente:

```powershell
py -3 scripts/manage.py serve
```

En esa computadora abre `http://127.0.0.1:8787`. En macOS/Linux reemplaza `py -3 scripts/manage.py` por `bash scripts/finanzas.sh`. Detén `serve` antes de iniciar un túnel para que no ocupe el mismo puerto.

## 2. Un enlace temporal gratuito con Cloudflare

Instala el cliente oficial:

```powershell
winget install --exact --id Cloudflare.cloudflared
```

En macOS, si tienes Homebrew: `brew install cloudflared`. En Linux usa el repositorio firmado indicado en [la instalación oficial de cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/); el script no descarga binarios sin comprobar su procedencia. Abre otra terminal si el instalador actualiza el PATH.

Desde la carpeta del proyecto:

```powershell
py -3 scripts/manage.py tunnel
```

El script obtiene una URL HTTPS de `trycloudflare.com`, arranca el servidor con ese origen y muestra el enlace para Safari. Cada persona entra con su usuario y contraseña. No necesitas abrir puertos del router. La URL temporal cambia al reiniciar; la base de datos y los usuarios permanecen. Si añadiste ese enlace a la pantalla de inicio del iPhone, deberás volver a añadirlo cuando cambie; para uso cotidiano elige una dirección estable. Ctrl+C detiene los procesos que inició este script.

Los Quick Tunnels son para pruebas, sin garantía de disponibilidad y con límites del proveedor. Si tienes un `config.yml` de otro túnel en `.cloudflared`, revisa la documentación de Cloudflare; el script no lo borra ni modifica. Un túnel con dominio propio requiere una cuenta Cloudflare y configurar ese dominio; no se promete un dominio comprado gratuito. Para un túnel existente, usa `configure` y después `tunnel --name NOMBRE`.

## 3. Alternativa para un enlace estable sin comprar dominio

Para Google y acceso cotidiano conviene conservar la misma dirección. También se incluye un comando para **Tailscale Funnel**, usando el hostname `*.ts.net` de tu computadora. Requiere instalar Tailscale, iniciar sesión y habilitar MagicDNS, HTTPS y Funnel para ese dispositivo. Consulta las condiciones actuales del plan personal y de Funnel; la disponibilidad y los límites dependen del servicio. Los visitantes de la web no necesitan instalar Tailscale, pero sí su cuenta de Balance.

Windows: instala Tailscale desde su sitio oficial o `winget install --exact --id Tailscale.Tailscale`, abre Tailscale e inicia sesión. Después:

```powershell
py -3 scripts/manage.py funnel
```

El cliente puede pedir que autorices Funnel en la cuenta. El script muestra el hostname del dispositivo; Tailscale anuncia cuándo queda accesible. La dirección se conserva mientras mantengas el mismo dispositivo y nombre en la misma red Tailscale. No se usa modo de fondo ni se restablecen otros servicios existentes. Más información: [Tailscale Funnel](https://tailscale.com/kb/1223/funnel).

## 4. Añadir al iPhone

Abre el enlace HTTPS en Safari, entra con tu usuario y selecciona **Compartir → Añadir a pantalla de inicio**. La app tiene manifest e iconos para abrirse como una web independiente. Necesita conexión a Internet: no almacena tus finanzas para uso sin conexión. El acceso deja de funcionar si la computadora duerme o se apaga; evita su suspensión mientras la uses.

## 5. Gmail y Calendar

En Google Cloud crea un cliente OAuth Web, habilita Gmail API y Calendar API y añade los correos de estas personas como usuarios de prueba. Registra exactamente el callback que imprime el script:

```text
https://TU-ENLACE/api/google/callback
```

Configura los datos localmente, sin incluirlos en el código:

```powershell
py -3 scripts/manage.py google-configure
```

El Client Secret se pide sin mostrarlo. Reinicia el túnel y conecta Google desde Conexiones con el usuario correspondiente. También puedes suministrar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` mediante variables de entorno seguras. Si usas un enlace temporal, tendrás que autorizar la nueva URI cada vez; el script no modifica Google Cloud. Google puede exigir configuración del dominio y consentimiento; un enlace temporal no garantiza que OAuth pueda autorizarse. Para OAuth utiliza preferentemente una dirección estable.

En modo de prueba, Google puede limitar la duración de los permisos y pedir reconectar. Para distribuir una app con Gmail fuera de las personas de prueba puede requerirse verificación de Google. La conexión real solo se considera validada después de completar consentimiento, revisar un correo y crear un evento en la cuenta autorizada.

Inicio y Revisar gastos buscan comprobantes de consumos realizados en soles cada minuto mientras están visibles. El filtro revisa el cuerpo del mensaje, exige evidencia de una operación realizada e importe y excluye promociones, ofertas de empleo, regalos, transferencias, retiros y recordatorios. Es conservador: los correos ambiguos o sin importe detectable no se proponen. Cada gasto requiere confirmación. Los correos se distinguen por buzón e ID para no duplicarlos. Calendar crea series mensuales/semanales/anuales; los recordatorios no efectúan pagos. Desconectar Google borra los tokens locales, pero no borra eventos ya creados ni revoca por sí solo los permisos en Google.

## 6. Respaldo, actualización y datos

```powershell
py -3 scripts/manage.py backup
py -3 scripts/manage.py test
```

El respaldo se cifra con una contraseña que eliges en la terminal. Incluye usuarios, finanzas, configuración y clave de cifrado; conserva esa contraseña por separado. Copia el archivo `.backup` a otro dispositivo. Para restaurar en una instalación con una carpeta de datos vacía:

```powershell
py -3 scripts/manage.py restore RUTA/finanzas.backup
```

La restauración rechaza carpetas con datos y contraseñas incorrectas; no sobrescribe una instalación existente. Invalida las sesiones anteriores. Revisa el enlace público después de restaurar.

Para actualizar: cierra app y túnel, respalda, actualiza los fuentes, ejecuta `install` y vuelve a ejecutar `tunnel` o `funnel`. `install` conserva los datos privados, el lockfile y las dependencias de Windows incluidas en el checkout. Los nuevos usuarios empiezan con datos vacíos; la antigua `backend/finanzas.db` permanece intacta y no se asigna automáticamente a nadie.

Ubicación de datos:

- Windows: `%LOCALAPPDATA%\FinanzasApp`.
- macOS: `~/Library/Application Support/FinanzasApp`.
- Linux: `~/.local/share/finanzasapp`.

Puedes cambiarla con `FINANZAS_DATA_DIR`. Protege la cuenta de la computadora y sus respaldos: SQLite financiero está protegido por permisos del sistema, pero no se cifra como los tokens Google. `config.toml` contiene el Client Secret si usaste el asistente y se guarda fuera del repositorio. No compartas esa carpeta ni `token.key`. En Windows los permisos dependen de las ACL de tu perfil; no uses una carpeta pública.

## Qué se ha comprobado

Instalación y compilación en Linux, pruebas de aislamiento de datos, cookies/CSRF, caducidad y cierre de sesión, cifrado de tokens y respaldo/restauración. Las integraciones Google usan simulaciones durante las pruebas automatizadas. Windows/macOS y un iPhone físico requieren comprobarse en esos equipos. La activación real de los túneles requiere el cliente y la cuenta/red del propietario; preparar los scripts no publica la aplicación ni establece un túnel en su computadora.

## Administración y revisión de Gmail

La cuenta administradora accede a **Usuarios y permisos** desde **Metas y más**, tanto en escritorio como en móvil. Puede habilitar o pausar el registro web y el servicio Google, ver el estado de los usuarios, pausar/reactivar accesos y retirar una conexión Google. El panel no muestra contraseñas, tokens ni los gastos de otras personas. Pausar un usuario invalida sus sesiones y conserva sus datos; la cuenta administradora no se puede pausar desde el panel. Un segundo `admin-grant` para otra persona se rechaza.

**Conexiones** permite a cada persona conectar o desconectar su propia cuenta Google. **Revisar gastos** tiene los comprobantes, la confirmación de importe/cuenta y la opción de descartar. El aviso de Inicio lleva a esa pantalla. La revisión requiere una cuenta Google conectada y el servicio habilitado; no registra consumos automáticamente.

Crear una cuenta en Balance no añade su Gmail a los usuarios de prueba de Google. Mientras OAuth esté en modo de prueba, agrega en Google Cloud el correo que cada persona usará al conectar. Para ampliar el acceso fuera de esos usuarios, Google puede requerir verificación y otros cambios en su consentimiento.


## Navegación y pagos realizados

En escritorio el menú contiene Inicio, Mi dinero, Pagos, Historial, Reportes y Metas y más. En móvil la barra inferior agrupa Reportes y las opciones de Google/administración dentro de Más. El botón + Nuevo abre el formulario lateral adaptado a la pantalla.

Para registrar un pago de una suscripción o recibo: **Pagos → Programar pago** guarda el vencimiento; cuando hayas pagado, **Ya pagué → Confirmar** descuenta el importe de la cuenta seleccionada y lo guarda en **Pagos → Pagados** y en **Historial**. Un pago mensual avanza al mes siguiente conservando su día habitual (los días 29–31 se ajustan al último día cuando sea necesario). Un pago único queda completado.

Historial permite buscar conceptos, filtrar por cuenta/tipo/fechas y consultar registros antiguos mediante páginas. Toca un movimiento para ver sus datos y origen. No vuelvas a confirmar un pago cuyo gasto ya ingresaste desde Gmail o manualmente.

Al actualizar, detén la app, ejecuta `git pull --ff-only origin codex/iphone-scripts`, vuelve a ejecutar `install` e inicia `serve` (o tu túnel habitual). Los datos existentes se conservan; el arranque añade la tabla del historial de pagos a los perfiles existentes.


## Tarjetas e informes

En **Mi dinero → Agregar tarjeta**, escribe el nombre de la tarjeta (por ejemplo, BCP Visa clásica), elige crédito o débito y guarda los últimos cuatro dígitos. La vista previa reconoce BCP, BBVA, Interbank, Scotiabank, Falabella y Ripley por el nombre de la tarjeta o de su cuenta; puedes cambiar el banco manualmente. Si no reconoce la entidad, muestra una ilustración genérica. Las ilustraciones se cargan desde la propia app y funcionan sin pedir imágenes a servicios externos.

**Ver informe** muestra deuda/límite/disponible de crédito y las próximas fechas de cierre/pago según los datos que registres. En débito muestra el saldo de la cuenta. El mes y año seleccionados filtran gastos, ingresos, categorías y movimientos de la cuenta vinculada. Si dos tarjetas usan la misma cuenta, el informe muestra la misma actividad de esa cuenta; la app no identifica automáticamente cuál se usó ni actualiza por sí sola la deuda del crédito.


## Transferencias, fechas y exportación

En **+ Nuevo → Transferir** elige origen, destino e importe. Puedes mover efectivo al banco, retirar hacia efectivo o transferir entre cuentas y billeteras. El importe se conserva entre las dos cuentas; solo una comisión reduce el saldo total y cuenta como gasto. El registro de la transferencia es idempotente ante reintentos de la misma operación.

**Hoy / Ayer** y el selector de fecha guardan el movimiento en el día elegido de Perú. No se permiten gastos/ingresos futuros; usa Pagos para programarlos. El saldo actual cambia al guardar, incluso si el movimiento se fecha ayer.

**Libre para gastar** reserva los pagos activos cuyo próximo vencimiento cae hasta el fin de mes, incluidos vencidos. No descuenta metas informativas ni deudas de tarjetas no programadas como pago. Puede ser negativo si los compromisos superan el saldo.

En **Historial**, los filtros rápidos y la búsqueda también se aplican a **Exportar**. El CSV incluye toda la selección, con fecha de Perú, cuenta, destino, categoría, importe y comisión. **Reportes** compara los últimos 3, 6 o 12 meses, incluidos cambios de año; el margen del mes es ingresos menos gastos y comisiones, no un aporte automático a una meta.


La marca visible ahora es **Balance**, con el escarabajo ahorrador. Las carpetas de datos y los comandos conservan sus nombres para mantener los perfiles existentes. Consulta [funciones y estado para compartir](ESTADO_PARA_COMPARTIR.md) antes de invitar a otras personas.
