# Balance: funciones y estado para compartir

Revisión del 14 de octubre de 2026. Este informe describe el código de la rama `codex/iphone-scripts`; no confirma que el servidor de tu computadora ni su enlace público estén encendidos.

## Conclusión

La aplicación está preparada en código para una **prueba privada con 2–4 personas**, sujeta a comprobar el enlace HTTPS y los flujos reales desde sus dispositivos. Todavía no se considera un lanzamiento abierto al público. Las pruebas automatizadas de Google utilizan simulaciones y no sustituyen el consentimiento real de cada usuario.

## Inventario de lo que existe

| Apartado | Funciones disponibles |
| --- | --- |
| Marca y móvil | Balance, escarabajo ahorrador azul y dorado, menú lateral y barra móvil, iconos para navegador y pantalla de inicio. Se abre en Safari y puede añadirse a la pantalla de inicio. |
| Usuarios | Registro web cuando el propietario lo habilita; usuario y contraseña; perfiles financieros y conexiones Google separados. También se crean usuarios por terminal. |
| Inicio | Saldos de cuentas, Libre para gastar, pagos comprometidos hasta fin de mes incluidos vencidos, próximo pago, gastos mensuales reales y aviso de Gmail. |
| Cuentas | Banco, efectivo y billetera digital; saldo inicial al crear, cambio de nombre, distribución del dinero e historial filtrado por cuenta. |
| Gasto e ingreso | Panel Nuevo movimiento; importe, concepto, cuenta y fecha; Hoy/Ayer; ocho categorías por iconos y sugerencia de categoría por palabras del concepto. Vista previa del saldo. |
| Gasto recurrente | Un gasto mensual puede crear el siguiente vencimiento, con recordatorio opcional de Calendar. El gasto actual se registra al guardar. |
| Transferencias | Entre cuentas, billeteras y efectivo, en ambos sentidos; comisión opcional, vista previa de ambos saldos y control de reintentos de la misma operación. El principal no cuenta como gasto. |
| Pagos | Programar una vez, semanal, mensual o anual; pendientes/pagados/pausados; vencidos; confirmar importe real, cuenta y fecha; saldo previsto. Confirmar crea el gasto y avanza el vencimiento o completa un pago único. Cada vencimiento se registra una vez. |
| Historial | Agrupación por día, búsqueda, Este mes/Hoy/Semana/Todo, tipos y filtros por cuenta/fechas, paginación y detalle del origen. CSV de toda la selección filtrada. |
| Reportes | Últimos 3, 6 o 12 meses, ingresos frente a gastos y comisiones, categorías del mes, margen del mes y comparación con el anterior. |
| Tarjetas | Débito y crédito; últimos cuatro dígitos, marca, banco detectado por nombre o elegido manualmente. BCP, BBVA, Interbank, Scotiabank, Falabella, Ripley y opción genérica. |
| Informe de tarjeta | Límite, deuda, disponible, porcentaje usado y próximas fechas de cierre/pago del crédito; saldo de la cuenta en débito. Actividad de la cuenta vinculada por mes y categoría. |
| Metas | Objetivo de ahorro, fecha opcional, ocho iconos, progreso y aportes informativos. No apartan ni transfieren dinero de las cuentas. |
| Gmail | Cada persona conecta su cuenta. Revisión periódica mientras Inicio o Revisar gastos está visible; propone comprobantes de consumos realizados en soles y descarta publicidad, recordatorios, transferencias y retiros. El usuario revisa importe/cuenta y confirma o descarta. |
| Google Calendar | Recordatorios de pagos únicos o recurrentes. Las series de fin de mes conservan el día habitual cuando se pasa por febrero. Pausar un pago intenta retirar su recordatorio. |
| Administración | Un propietario: habilitar/pausar registro y Google; ver estados de usuarios/conexiones; pausar/reactivar accesos y retirar conexiones Google. No muestra contraseñas, tokens ni finanzas de otros usuarios. |
| Contraseñas y sesiones | Contraseñas con hash scrypt, limitación de intentos, sesiones con caducidad de siete días, cookie HttpOnly/SameSite y Secure con HTTPS, protección CSRF y cierre de sesiones al pausar o restablecer contraseña. |
| Datos y respaldo | SQLite individual por persona fuera del proyecto; tokens Google cifrados; respaldo completo cifrado con contraseña y restauración en una carpeta vacía. Las actualizaciones conservan los perfiles existentes. |
| Acceso por enlace | Servidor compilado en la computadora del propietario, Cloudflare temporal o Tailscale Funnel configurado. No necesita App Store ni publicar en un VPS. La computadora y el túnel deben permanecer activos. |

## Límites actuales que deben conocer los usuarios

- Solo soles peruanos; fechas financieras en horario de Perú. No hay cambio de divisas.
- No se conecta a bancos, no valida saldos bancarios ni hace pagos o transferencias reales. Se registran movimientos que la persona ya realizó.
- No hay edición ni eliminación de movimientos ya guardados. Es una mejora pendiente relevante para corregir errores de entrada.
- La deuda de crédito se actualiza manualmente. Los gastos de la cuenta no la modifican automáticamente; varias tarjetas vinculadas a una cuenta comparten el mismo informe de actividad.
- Las fechas de tarjeta son informativas. No crean automáticamente un pago programado de la deuda. Ese pago se programa desde Pagos.
- No hay recuperación de contraseña por correo ni verificación de correo al registrarse. El propietario restablece contraseñas por terminal.
- No hay notificaciones push, funcionamiento financiero sin conexión, sincronización bancaria ni importación universal de comprobantes. Gmail puede omitir mensajes ambiguos.
- El control de duplicados de Gmail reconoce buzón e ID de correo, no que dos correos diferentes sean de una misma compra. Tampoco relaciona automáticamente un gasto manual/Gmail con un vencimiento que luego se confirma en Pagos.
- Libre para gastar no descuenta metas informativas ni deuda de tarjeta no programada como pago. Es un cálculo sobre lo registrado, no una garantía de saldo real.
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
9. Comparte el enlace solo con esas personas e indícales los límites anteriores, especialmente que los registros financieros son manuales y que no se pueden editar/eliminar todavía.

Para abrir el registro al público en general, quedan pendientes la ampliación/verificación OAuth y los requisitos de consentimiento de Google, documentación de privacidad/contacto del servicio, pruebas operativas de disponibilidad/carga y mejoras de corrección de movimientos y recuperación de cuentas. No se promete completar esos pasos con solo cambiar el diseño o habilitar el registro.

## Comprobaciones realizadas en esta revisión

- Compilación TypeScript y Vite correcta; 80 pruebas automatizadas del backend correctas, con bases temporales y Google simulado.
- Recorrido en Chromium con datos de ejemplo: saldo disponible, gasto con vista previa, transferencia de efectivo a banco, ingreso con fecha de ayer, confirmación de pago, comprobante, historial, exportación CSV filtrada, periodos de reportes y creación de metas.
- Las nueve vistas y los paneles de movimiento/pago se comprobaron sin desbordamiento horizontal en anchos de 320, 390, 768, 1199 y 1637 píxeles. Se revisaron capturas del diseño Balance en escritorio y móvil.
- Registro desde el navegador de una segunda persona: saldo inicial cero, sesión sin permisos de administrador y opción de administración oculta. Los iconos públicos cargan sin hacer públicas las cuentas financieras.

Son comprobaciones locales en Linux y Chromium. No confirman la conexión pública ni sustituyen las pruebas de Safari, Windows y Google reales indicadas arriba.

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
