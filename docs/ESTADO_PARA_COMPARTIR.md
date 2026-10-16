# Balance: funciones y estado para compartir

Revisión del 15 de octubre de 2026. Este informe describe el código de la rama `codex/iphone-scripts`; no confirma que el servidor de tu computadora ni su enlace público estén encendidos.

## Conclusión

Para el uso local indicado por el propietario, la app puede probarse en su computadora. Si se habilita acceso por Internet, está preparada en código para una **prueba privada con 2–4 personas**, sujeta a comprobar el enlace HTTPS y los flujos reales desde sus dispositivos. Todavía no se considera un lanzamiento abierto al público. Las pruebas automatizadas de Google utilizan simulaciones y no sustituyen el consentimiento real de cada usuario.

## Inventario de lo que existe

| Apartado | Funciones disponibles |
| --- | --- |
| Marca y móvil | Diseño del HTML, temas Día/Noche/Sistema, fuente local y Perfil separado de Metas. Balance, escarabajo ahorrador azul y dorado, menú lateral y barra móvil, iconos para navegador y pantalla de inicio. Se abre en Safari y puede añadirse a la pantalla de inicio. |
| Usuarios | Registro web cuando el propietario lo habilita; usuario y contraseña; perfiles financieros y conexiones Google separados. También se crean usuarios por terminal. |
| Inicio | Selector de Mis finanzas o Mi agenda diaria; logo con acceso al selector y menú contextual. |
| Mis finanzas | Simulador sin registro de movimientos, meses seleccionables, saldos, próximo pago, gastos reales y aviso Gmail. Disponible después de pagos ordinarios del mes, deuda de crédito y metas reservadas; desglose del cálculo. |
| Cuentas | Banco, efectivo y billetera digital; saldo inicial al crear, cambio de nombre, distribución del dinero e historial filtrado por cuenta. |
| Gasto e ingreso | Panel Nuevo movimiento; importe, concepto, cuenta y fecha; Hoy/Ayer; ocho categorías por iconos y sugerencia de categoría por palabras del concepto. Vista previa del saldo. |
| Gasto recurrente | Un gasto mensual puede crear el siguiente vencimiento, con recordatorio opcional de Calendar. El gasto actual se registra al guardar. |
| Transferencias | Entre cuentas, billeteras y efectivo, en ambos sentidos; comisión opcional, vista previa de ambos saldos y control de reintentos de la misma operación. El principal no cuenta como gasto. |
| Pagos | Programar una vez, semanal, mensual o anual; pendientes/pagados/pausados; vencidos; confirmar importe real, cuenta y fecha; saldo previsto. Confirmar registra o vincula el movimiento y avanza el vencimiento. Un pago de tarjeta reduce deuda sin duplicar el gasto. Cada vencimiento se registra una vez. |
| Historial | Agrupación, búsqueda y filtros, CSV completo, detalle, edición y anulación con motivo, control de versión y registro privado de correcciones. |
| Reportes | Últimos 3, 6 o 12 meses, ingresos frente a gastos y comisiones; mes de detalle seleccionable, distribución circular por categorías y margen comparado con el mes anterior. |
| Tarjetas | Débito y crédito; últimos cuatro dígitos, marca, banco detectado por nombre o elegido manualmente. BCP, BBVA, Interbank, Scotiabank, Falabella, Ripley y opción genérica. |
| Informe de tarjeta | Límite, deuda, disponible, porcentaje usado y próximas fechas de cierre/pago del crédito; saldo de la cuenta en débito. Consumos y pagos atribuidos a cada tarjeta por mes y categoría; deuda actualizada con esos registros. |
| Metas | Objetivo de ahorro, fecha opcional, ocho iconos, progreso y aportes informativos. Reserva opcional de lo ahorrado para reducir Libre para gastar; no transfiere dinero. |
| Gmail | Cada persona conecta su cuenta. Revisión periódica mientras Mis finanzas o Revisar gastos está visible; propone comprobantes de consumos realizados en soles y descarta publicidad, recordatorios, transferencias y retiros. El usuario revisa importe/cuenta/fecha/tarjeta y confirma, descarta o vincula a un consumo existente. Avisos por coincidencias de importe y fecha. |
| Google Calendar | Recordatorios de pagos únicos o recurrentes. Las series de fin de mes conservan el día habitual cuando se pasa por febrero. Pausar un pago intenta retirar su recordatorio. |
| Agenda del estudiante | Inicio con clases y entregas, cursos con notas ponderadas y regla 10.5 → 11 configurable; cálculo de riesgo y nota necesaria. Horario semanal conectado a Calendar con activación personal, IDs estables, actualización y retiro con reintentos; exportación .ics alternativa, temporizador persistente, sesiones de estudio y bienestar privados. No importa avisos universitarios desde Gmail. |
| Mi agenda diaria | Tareas privadas de estudios, personales y de casa: fechas, prioridades, edición y estados. Hábitos diarios con marcas de los últimos siete días en horario de Perú. No crea alarmas ni eventos de tareas. |
| Administración | Un propietario: habilitar/pausar registro y Google; ver estados de usuarios/conexiones; pausar/reactivar accesos y retirar conexiones Google. No muestra contraseñas, tokens ni finanzas de otros usuarios. |
| Contraseñas y sesiones | Cambio de contraseña y recuperación con código de un solo uso guardado por cada usuario;  Contraseñas con hash scrypt, limitación de intentos, sesiones con caducidad de siete días, cookie HttpOnly/SameSite y Secure con HTTPS, protección CSRF y cierre de sesiones al pausar o restablecer contraseña. |
| Datos y respaldo | SQLite individual por persona fuera del proyecto; tokens Google cifrados; respaldo completo cifrado con contraseña y restauración en una carpeta vacía. Las actualizaciones conservan los perfiles existentes. |
| Acceso por enlace | Servidor compilado en la computadora del propietario, Cloudflare temporal o Tailscale Funnel configurado. No necesita App Store ni publicar en un VPS. La computadora y el túnel deben permanecer activos. |

## Límites actuales que deben conocer los usuarios

- Solo soles peruanos; fechas financieras en horario de Perú. No hay cambio de divisas.
- No se conecta a bancos, no valida saldos bancarios ni hace pagos o transferencias reales. Se registran movimientos que la persona ya realizó.
- La anulación conserva una traza privada y puede exigir deshacer antes operaciones relacionadas para no dejar saldos/deudas inválidos. Las programaciones y Calendar se administran por separado.
- Los consumos deben asignarse a una tarjeta para actualizar su deuda e informe. Los registros anteriores sin tarjeta no se reasignan automáticamente. La deuda inicial, intereses y ajustes externos se concilian manualmente.
- Programar deuda crea un pago mensual vinculado y ajusta su importe a la deuda registrada. Requiere acción explícita; no calcula estado de cuenta, intereses, cuotas ni pago mínimo.
- La recuperación no usa correo: necesita el código que el usuario guardó previamente. Sin él, el propietario restablece por terminal. No hay verificación de correo.
- No hay notificaciones push, funcionamiento financiero sin conexión, sincronización bancaria ni importación universal de comprobantes. Gmail puede omitir mensajes ambiguos.
- Los avisos de duplicados son coincidencias por importe, cuenta/tarjeta y fechas cercanas. Gmail y Pagos permiten vincular movimientos existentes, pero requieren revisión; operaciones con datos diferentes pueden no detectarse.
- Libre para gastar descuenta deuda de crédito y reservas elegidas. Las metas no reservadas siguen siendo informativas. Un pago de tarjeta creado como pago ordinario sin vínculo puede duplicar compromisos: utiliza Programar deuda. Sigue siendo un cálculo sobre registros, no garantía bancaria.
- SQLite financiero no está cifrado en disco como los tokens o el respaldo; depende de la protección de la cuenta del sistema operativo.
- No se han comprobado aquí un iPhone físico, Windows del propietario, el túnel en su red o el consentimiento Google de los usuarios reales. No hay una prueba de carga para uso masivo.

## Antes de invitar a esas primeras personas

1. Actualiza, reinstala la copia compilada y reinicia la app. Conserva la carpeta de datos actual aunque la marca se llame Balance.
2. Haz un respaldo cifrado y guarda una copia en otro dispositivo. La contraseña y `token.key` deben mantenerse privados.
3. Comprueba que solo tu usuario es administrador. Los visitantes nuevos deben ser usuarios normales y no ver Usuarios y permisos.
4. Inicia un enlace HTTPS. Para uso continuo y Google, prefiere una dirección estable configurada con Tailscale Funnel o tu túnel nombrado. Un Quick Tunnel de Cloudflare es temporal y cambia la dirección.
5. Abre ese enlace desde otro teléfono usando datos móviles, sin depender del Wi-Fi del servidor. Registra un segundo usuario y verifica que empiece vacío y no pueda acceder a tus cuentas.
6. Para Gmail/Calendar, configura el callback exacto `https://TU-ENLACE/api/google/callback`. Mientras OAuth esté en modo de prueba, agrega los correos autorizados en Google Cloud → Google Auth Platform → Público → Usuarios de prueba.
7. Con ese segundo usuario, conecta su Google, confirma un consumo real y crea un recordatorio. Comprueba que el correo y el calendario sean de esa persona. Google en pruebas puede pedir reconectar después de un periodo corto.
8. Prueba añadir Balance a la pantalla de inicio de un iPhone, volver a abrirla y cerrar sesión. Avisa que dejará de estar disponible si tu computadora se suspende, se apaga o se detiene el túnel.
9. Comparte el enlace solo con esas personas e indícales los límites anteriores, especialmente que los registros financieros describen lo realizado y sus límites de conciliación.

Para abrir el registro al público en general, quedan pendientes la ampliación/verificación OAuth y los requisitos de consentimiento de Google, documentación de privacidad/contacto del servicio, pruebas operativas de disponibilidad/carga y revisión de los requisitos operativos y de soporte de cuentas. No se promete completar esos pasos con solo cambiar el diseño o habilitar el registro.

## Comprobaciones realizadas en esta revisión

- Compilación TypeScript y Vite correcta; 141 pruebas automatizadas del backend correctas, con bases temporales y Google simulado.
- Recorrido en Chromium con datos de ejemplo: saldo disponible, gasto con vista previa, transferencia de efectivo a banco, ingreso con fecha de ayer, confirmación de pago, comprobante, historial, exportación CSV filtrada, periodos de reportes y creación de metas.
- Recorrido adicional en navegador: consumo con crédito, pago de tarjeta sin doble gasto, informe individual, editar/anular/auditar, reserva de meta, deuda programada, vincular un gasto existente y recuperar acceso con código.
- Las nueve vistas y los paneles de movimiento/pago se comprobaron sin desbordamiento horizontal en anchos de 320, 390, 768, 1199 y 1637 píxeles. Se revisaron capturas del diseño Balance en escritorio y móvil.
- Registro desde el navegador de una segunda persona: saldo inicial cero, sesión sin permisos de administrador y opción de administración oculta. Los iconos públicos cargan sin hacer públicas las cuentas financieras.

Son comprobaciones locales en Linux y Chromium. No confirman la conexión pública ni sustituyen las pruebas de Safari, Windows y Google reales indicadas arriba.

Consulta [la guía de las nuevas funciones para uso local](MEJORAS_USO_LOCAL.md): correcciones, consumos/pagos por tarjeta, conciliación de Gmail y pagos, reservas y recuperación sin correo.

## Comandos

Actualizar una instalación existente, después de detener la app con Ctrl+C:

```powershell
git pull --ff-only origin codex/iphone-scripts
py -3 scripts/manage.py install
py -3 scripts/manage.py serve
```

Para acceso público, detén `serve` y usa uno de los modos ya configurados:

```powershell
py -3 scripts/manage.py funnel
```

O, para una prueba temporal con cloudflared instalado:

```powershell
py -3 scripts/manage.py tunnel
```

Respaldo y comprobaciones:

```powershell
py -3 scripts/manage.py backup
py -3 scripts/manage.py test
```

Los comandos, la carpeta del proyecto, la cookie de sesión y `%LOCALAPPDATA%\FinanzasApp` conservan sus nombres anteriores para no perder la configuración ni los datos al cambiar la marca.

Consulta [el diseño del HTML y su navegación](DISENO_HTML.md) para localizar las opciones en Perfil y Metas.
