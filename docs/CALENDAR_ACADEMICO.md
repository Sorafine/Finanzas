# Horario conectado a Google Calendar

Actualización del 15 de octubre de 2026. La agenda puede añadir y mantener sus clases en el calendario principal de la cuenta Google conectada por cada usuario.

## Activar

1. Actualiza la aplicación y entra en **Mi agenda diaria → Horario**.
2. Crea tus cursos y añade sus clases con día y horas. Un curso sin clases no tiene un horario que enviar.
3. En el cuadro **Google Calendar**, pulsa **Conectar Google** si falta la conexión. Se usa la conexión personal existente de Gmail/Calendar, no la del administrador. Si hace falta, vuelve a conectar y autoriza Calendar.
4. Pulsa **Activar y sincronizar horario**. Verás cuántas clases están sincronizadas y cuántos cambios quedan pendientes.

La activación se guarda por usuario. No se activa sola al crear una cuenta. Se reutiliza el permiso `calendar.events` ya solicitado por la app; el proyecto OAuth debe tener habilitada Google Calendar API. Si Google devuelve un error de permisos, revisa esa API y vuelve a autorizar la cuenta.

Si ya importaste el archivo `.ics`, retira esas copias de Calendar antes de activar la conexión para evitar tener ambas versiones. Los eventos importados no se adoptan ni eliminan automáticamente.

## Qué mantiene actualizado

Una vez activado, guardar una clase nueva la envía a Calendar. Editar día, hora, aula o curso actualiza su serie. Cambiar el nombre del curso actualiza los títulos de sus clases. Eliminar una clase o un curso retira sus series vinculadas; la confirmación lo indica.

Cada clase tiene una serie de **16 sesiones semanales**, en **America/Lima (UTC−5)**. La primera fecha corresponde al siguiente día de clase; si la clase de hoy ya terminó, comienza la semana siguiente. La fecha base se conserva al editar o reintentar, para no extender la serie indefinidamente. Editar o retirar modifica la serie completa, incluidas sus ocurrencias anteriores.

La dirección es **Balance → Google Calendar**. Los cambios hechos solo en Google no se importan a Balance. **Sincronizar ahora** comprueba y vuelve a aplicar los campos de las clases administradas por Balance; puede restaurar una clase que se haya eliminado manualmente en Google. El estado mostrado corresponde a la última sincronización, no a una consulta continua de todos los eventos.

Solo se envían título del curso, día, horas, aula y una descripción del vínculo con Balance. No se envían notas académicas, ánimo, sesiones de enfoque ni finanzas. No se crean invitaciones a terceros.

## Reintentos y desconexión

Los cambios locales se guardan antes de intentar Google. Si no hay conexión, permisos o servicio disponible, siguen en una cola de la base privada. Se puede reintentar con **Sincronizar ahora**; la app también reintenta los pendientes cada minuto mientras Horario está visible y al regresar a esa pestaña. No hay un proceso separado que sincronice con la computadora apagada.

Los IDs de eventos se reservan antes de enviarlos a Google. Si Google creó el evento pero se perdió la respuesta, el siguiente intento actualiza ese mismo evento. Un retiro fallido conserva su vínculo aunque ya se haya eliminado la clase local. Así puede completarse al reconectar.

**Desconectar Google** retira los tokens locales y detiene el acceso, pero no elimina eventos ya creados. Para retirar las clases usa **Desactivar y retirar clases de Calendar**, confirma, y comprueba que no queden pendientes. Esto conserva cursos, clases, notas y tareas en Balance. No elimina eventos ajenos, importaciones `.ics` ni recordatorios de pagos.

Si Google está desconectado o pausado por el administrador, desactivar el horario conserva el retiro pendiente. Reconecta la cuenta original y utiliza **Reintentar retiro de eventos** cuando Google esté disponible. Si cambias de cuenta, los vínculos se mantienen separados; no se borran eventos de otra cuenta usando la nueva conexión.

## Protección de datos y operaciones simultáneas

La configuración, los IDs y la cola pertenecen al SQLite privado del usuario y entran en el respaldo cifrado existente. El administrador no obtiene acceso a las clases o eventos de otras personas desde su panel. El propietario de la computadora conserva acceso técnico a los archivos locales.

Una reserva temporal en la base evita dos sincronizaciones de escritura simultáneas del mismo perfil. Si la app se interrumpe, esa reserva caduca en dos minutos. Los cambios producidos durante una solicitud a Google quedan pendientes si todavía no corresponden a lo que se envió.

Cada evento tiene una marca privada de Balance. La app verifica esa marca antes de modificarlo o eliminarlo. Si no coincide, conserva el pendiente y pide revisar el evento. La renovación de tokens compara la conexión original antes de guardarlos: no reemplaza un consentimiento más reciente ni restaura una conexión que el usuario desconectó mientras se renovaba.

## Actualizar

Detén la aplicación con Ctrl+C y ejecuta desde la carpeta del proyecto:

```powershell
py -3 scripts/manage.py backup
git pull --ff-only origin codex/iphone-scripts
py -3 scripts/manage.py install
py -3 scripts/manage.py tunnel
```

Recarga con Ctrl+F5. Los usuarios y sus datos se conservan. Si el túnel temporal cambia de enlace, comparte el nuevo y actualiza el callback de Google.

## Verificación

Compilación TypeScript/Vite y **141 pruebas del servidor** correctas. Las pruebas incluyen activación explícita, IDs estables, respuesta perdida, renombre y cambios de horario, borrados con reintentos, cuentas distintas, eventos cancelados, protección de eventos ajenos, cambios simultáneos y renovación de tokens sin reemplazar otra conexión. También se ejecutan las pruebas financieras y de notas anteriores.

Se comprobó la interfaz con un Calendar simulado: conectar, activar, modificar, fallar/reintentar sin duplicar, desconectar y retirar después, desactivar sin perder clases y volver a activar. Se probaron ambos temas, contraste y anchos de 320, 390, 768, 901, 1199 y 1637 píxeles. Las pruebas no utilizan tokens reales ni escriben en Google: el consentimiento y un evento real deben comprobarse desde la cuenta del usuario después de actualizar.
