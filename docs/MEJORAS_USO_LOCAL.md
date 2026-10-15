# Balance: mejoras para el uso local

Actualización del 15 de octubre de 2026. Las bases existentes se amplían al iniciar; no se borran ni se reasignan movimientos antiguos a tarjetas por suposición.

## Actualizar

Detén la app con Ctrl+C. Desde la carpeta del proyecto, crea primero un respaldo con la versión que tienes instalada:

```powershell
py -3 scripts/manage.py backup
git pull --ff-only origin codex/iphone-scripts
py -3 scripts/manage.py install
py -3 scripts/manage.py serve
```

Recarga el navegador con Ctrl+F5. No necesitas crear de nuevo a tus usuarios ni sus conexiones Google.

## Corregir un registro equivocado

En **Historial**, abre el movimiento y elige **Editar movimiento** o **Anular movimiento**. Escribe un motivo. Puedes corregir importe, concepto, cuenta, categoría y fecha; una transferencia también permite corregir destino y comisión. El tipo y la tarjeta de un movimiento ya registrado se conservan: anula y registra de nuevo si elegiste un medio incorrecto.

Se aplica solo la diferencia a los saldos y deudas. La anulación retira el registro del historial financiero, pero conserva su contenido anterior y el motivo en la base privada; **Correcciones** muestra las últimas 100 acciones. Es una traza local de ayuda, no un registro protegido contra modificaciones del propietario del equipo.

Se impiden correcciones que dejarían una cuenta sin fondos o una deuda negativa/fuera del límite. Por ejemplo, no puedes anular un ingreso que ya gastaste sin corregir antes los gastos relacionados. Si otra ventana cambió el registro, debes actualizarlo antes de guardar.

Al anular el último pago confirmado de una serie, vuelve a abrirse su vencimiento. Para anular uno anterior, deshaz primero los posteriores. Los próximos pagos y los recordatorios creados desde un gasto se administran por separado; anular ese gasto no borra la programación ni actualiza Calendar. Un correo de Gmail cuyo gasto se anula queda descartado para evitar que reaparezca.

## Registrar compras con tarjeta

En **+ Nuevo → Gasto → Medio de pago**, selecciona la tarjeta:

- **Crédito:** aumenta la deuda y registra el gasto, sin descontar dinero de la cuenta vinculada.
- **Débito:** descuenta de la cuenta y atribuye el consumo a esa tarjeta.
- **Sin tarjeta:** usa el saldo de la cuenta, como antes.

Esto funciona también al confirmar un consumo desde Gmail. Registrar sin seleccionar tarjeta no modifica automáticamente una deuda de crédito. Los registros anteriores no se cambian: nadie puede deducir con seguridad qué tarjeta utilizaste.

**Ver informe** muestra solo consumos y pagos asignados a esa tarjeta. Dos tarjetas de una misma cuenta ya no comparten las compras en este informe. El historial general y los movimientos antiguos de la cuenta siguen disponibles por separado.

La deuda inicial se registra al crear la tarjeta. Editarla permite conciliarla manualmente con tu estado de cuenta, por ejemplo si hubo intereses no registrados. No es una consulta bancaria. Si la deuda cambió mientras editabas, debes volver a abrir el formulario. Una tarjeta con actividad o programación vinculada no puede cambiar de tipo/cuenta: crea otra si lo necesitas.

## Pagar una tarjeta y programar su deuda

En **Mi dinero → Pagar tarjeta**, registra un pago ya realizado. Baja el saldo de la cuenta elegida y la deuda; no vuelve a contar las compras como gasto. No permite pagar más deuda que la registrada.

**Programar deuda** utiliza el día de pago configurado y crea un pago mensual vinculado, sin duplicarlo si repites el botón. Su importe refleja la deuda total registrada y vuelve a ajustarse cuando registras consumos o pagos. No calcula un estado de cuenta, pago mínimo, intereses ni cuotas: comprueba el importe real antes de confirmar. Puedes pagar parcialmente.

Cuando existe esa programación activa, el botón te lleva a **Pagos**: confirma allí para mantener sincronizados el comprobante y el vencimiento. Un mes sin deuda no aparece entre los pendientes; el vínculo se conserva para próximos consumos. Si deseas un recordatorio, añádelo desde las opciones del pago en Calendar.

## Evitar duplicados

**Gmail:** antes de registrar se buscan consumos del mismo importe, cuenta/tarjeta y fechas próximas (±3 días). Puedes vincular el comprobante a uno existente sin descontar dinero. Varios correos pueden apuntar al mismo consumo. Si son compras diferentes, marca explícitamente **Es otra compra**. Gmail sigue validando que el mensaje sea un comprobante de consumo; no importa publicidad por confirmar una coincidencia.

**Pagos:** si hay un movimiento compatible por importe y cuenta (±31 días), elige **Usar movimiento existente**. Se crea el comprobante y avanza el vencimiento sin crear otro gasto ni tocar el saldo. Si es otra operación, debes confirmarlo expresamente. Los pagos de tarjeta solo se vinculan a pagos de esa misma tarjeta, nunca a una compra con crédito.

Las coincidencias son avisos, no una identificación universal de operaciones bancarias. Debes revisar concepto y fecha. Importe, cuenta o fecha distintos pueden no producir un aviso. Las solicitudes de nuevos gastos/ingresos, transferencias y pagos de tarjeta tienen protección de reintentos para no duplicar una operación por repetir la misma solicitud; esto no reemplaza la revisión de dos registros iniciados por separado.

## Entender el disponible

**Libre para gastar = saldos de cuentas − pagos ordinarios pendientes hasta fin de mes − toda la deuda de crédito − metas reservadas.** Los pagos vinculados a tarjetas no se restan otra vez. Incluye pagos ordinarios vencidos. Un pago de tarjeta introducido manualmente como pago ordinario no se puede reconocer como la misma deuda: utiliza **Programar deuda** para vincularlo.

En cada meta puedes marcar **Reservar lo ahorrado del dinero disponible**. Usa esta opción solo si ese ahorro ya está incluido en las cuentas de Balance. Reduce el disponible, pero no realiza una transferencia ni congela dinero. Si reservas más de lo que queda, el disponible puede ser negativo: revisa tu presupuesto. Desmarcar libera la reserva sin borrar el progreso.

La reserva está desactivada inicialmente para todas las metas existentes; así no se presupone dónde está tu ahorro. Abre **Ver cálculo** en Inicio para ver pagos, crédito y reservas por separado.

## Recuperar acceso sin correo

En **Perfil → Seguridad de tu cuenta**:

1. Introduce tu contraseña actual y genera un código de recuperación.
2. Guarda el código fuera de esta computadora, por ejemplo en tu gestor de contraseñas. Solo se muestra al generarlo; la app guarda su hash.
3. Si olvidas la contraseña, pulsa **Olvidé mi contraseña** en la entrada y usa usuario, código y una contraseña nueva de al menos 12 caracteres.

El código solo se puede usar una vez. Generar otro invalida el anterior. Recuperar o cambiar la contraseña cierra las sesiones anteriores; cambiar la contraseña también invalida el código guardado. Después de volver a entrar, genera otro. Las cuentas pausadas no pueden recuperar acceso hasta que el administrador las reactive.

No hay envío de mensajes ni verificación de correo. Si no guardaste el código, el administrador puede utilizar `password-reset` por terminal. Los permisos del administrador no se conceden al recuperar una cuenta normal.

## Lo que continúa dependiendo de servicios o del equipo

- Moneda base: soles; fechas en Perú. No se mezclan monedas ni se inventa un tipo de cambio.
- Gmail y Calendar requieren conexión, credenciales y consentimiento Google. Las pruebas automáticas simulan esas APIs; la cuenta real debe comprobarse en tu equipo.
- No hay sincronización con bancos ni ejecución de pagos/transferencias reales.
- No hay push ni finanzas sin conexión. La revisión de Gmail ocurre mientras Inicio o Revisar gastos está visible; con el equipo apagado no hay servidor ni sincronización.
- SQLite financiero sigue sin cifrado propio en disco. Los tokens y respaldos están cifrados. Para proteger el equipo apagado, activa **Cifrado de dispositivo** o **BitLocker** si tu edición de Windows lo ofrece, y guarda su clave de recuperación fuera de la computadora. Una contraseña de la web no cifra los archivos de Windows.

La administración de usuarios y conexiones sigue siendo exclusiva del propietario y no muestra las finanzas de otras personas.

## Validación realizada

Compilación TypeScript/Vite y 101 pruebas del backend correctas. Los recorridos locales en Chromium comprobaron gasto, transferencia, fecha, pago, historial/CSV, reportes y metas; también consumo/pago de crédito, informe individual, edición/anulación con traza, reserva, programación de deuda, vinculación de un gasto existente y recuperación por código. Se comprobaron las nueve vistas entre 320 y 1637 píxeles y los nuevos formularios de corrección, pago de tarjeta y seguridad en anchos móviles. Google se simula en las pruebas; no se comprobó un iPhone físico ni la instalación Windows del propietario.
