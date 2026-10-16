# Balance como espacio personal

Primera etapa del 15 de octubre de 2026: organizar dinero y también el día a día. Las herramientas personales están disponibles para cada cuenta, sin permisos de administrador.

## Ya disponible: Mi agenda diaria

Al iniciar sesión se muestra un selector con **Mis finanzas** y **Mi agenda diaria**. El logo de Balance vuelve siempre a ese selector, también en móvil. Cada espacio muestra su propio menú. Agenda también se abre desde **Perfil → Mi día: tareas y hábitos**. Se quitaron los botones globales «+ Nuevo»; en Finanzas se conservan los botones Gasto, Ingreso y Transferir. El selector y la agenda no necesitan cargar saldos ni cuentas para funcionar.

- **Tareas y estudios:** nombre, área (Estudios, Personal o Casa), fecha límite opcional y prioridad normal/alta. Permite editar, completar, reabrir y eliminar con confirmación.
- **Filtros:** Pendientes, Para hoy (incluye pendientes anteriores) y Completadas. Los exámenes y entregas pueden registrarse como tareas de Estudios con fecha futura.
- **Hábitos diarios:** crear, renombrar, marcar/desmarcar hoy y ver las marcas de los últimos siete días. Cada día usa el horario de Perú, aunque el dispositivo esté en otra zona. Los registros anteriores se conservan en la base; la pantalla muestra la última semana.
- **Resumen:** pendientes, tareas para hoy o antes y hábitos hechos hoy. No hay datos de ejemplo ni puntuaciones inventadas.
- **Dos apariencias:** Día/Noche/Sistema. El contenido queda centrado en el espacio libre junto al menú y aprovecha la pantalla completa en móvil.

La vista vuelve a consultar los datos al regresar a la pestaña y cada minuto mientras está visible. Al pasar medianoche, las marcas se presentan para el nuevo día de Perú. No envía notificaciones ni programa alarmas para tareas o hábitos. Las clases del horario sí se pueden sincronizar con Calendar al activar la conexión personal; consulta [Calendar académico](CALENDAR_ACADEMICO.md).

## Privacidad y conservación

Tareas y hábitos viven en el SQLite privado de cada persona, junto a sus propios datos financieros. Se aplican el inicio de sesión, CSRF y el aislamiento de perfiles existentes. El panel de administración no muestra estas tareas ni hábitos. El propietario de la computadora tiene acceso técnico a los archivos locales; esto no es cifrado de extremo a extremo.

Los cambios no crean movimientos, no descuentan saldo y no modifican el cálculo de dinero disponible. La actualización añade tablas sin borrar las anteriores. El respaldo cifrado existente incluye las nuevas tablas automáticamente. Eliminar un hábito elimina también sus marcas después de una confirmación; eliminar una tarea tampoco se puede deshacer.

La app sigue necesitando el servidor y conexión. No se guardan tareas ni hábitos en localStorage; ese almacenamiento solo conserva la preferencia de apariencia.

## Agenda del estudiante ampliada

Ya están disponibles Inicio de agenda, horario semanal, Cursos y notas con cálculo de aprobación, Enfoque y Bienestar. Consulta [la guía de la agenda del estudiante](AGENDA_ESTUDIANTE.md) para la regla 10.5 → 11, los estados de riesgo, la exportación a Calendar y los límites reales de Gmail.

## Propuesta para siguientes etapas (todavía no implementadas)

1. **Proyectos personales:** objetivos no financieros, pasos pequeños y progreso, separados de las metas de ahorro actuales.
2. **Resumen de la semana:** tareas terminadas, hábitos y gastos para revisar lo que funcionó y preparar la siguiente semana.

No se añadieron chat público, comparaciones entre adolescentes, perfiles públicos, seguimiento de ubicación ni acceso familiar automático. Cualquier función para compartir información requiere definir qué decide compartir la persona y con quién.

## Actualización

Detén la aplicación con Ctrl+C y ejecuta desde la carpeta del proyecto:

```powershell
py -3 scripts/manage.py backup
git pull --ff-only origin codex/iphone-scripts
py -3 scripts/manage.py install
py -3 scripts/manage.py tunnel
```

Para uso solo local, sustituye el último comando por `py -3 scripts/manage.py serve`. No ejecutes ambos sobre el mismo puerto. Recarga con Ctrl+F5. Los usuarios y sus datos se conservan. Si cambia el enlace temporal, comparte el nuevo y actualiza el callback exacto de Google.

## Comprobaciones de esta etapa

Compilación TypeScript/Vite y 141 pruebas del servidor correctas. Se verificaron creación, edición, finalización, reapertura y eliminación de tareas; marcas diarias, reintentos, desmarcado, cambio de fecha de Perú y aislamiento entre cuentas. Las pruebas comprueban que estas acciones no cambian el resumen financiero y que las actualizaciones de tablas conservan los registros.

Se comprobaron formularios, contraste, centrado y ausencia de desbordamiento horizontal en Chromium a 320, 390, 768, 901, 1199, 1637, 1920 y 2560 píxeles en ambos temas. Se verificó el acceso desde Inicio y desde Perfil en móvil. Los recorridos previos de la app financiera se mantienen; estas comprobaciones usan bases temporales y no sustituyen una prueba en Safari/iPhone o Windows reales.

El selector y la lista de tareas se comprobaron sin depender de saldos/cuentas. El nuevo Inicio de agenda consulta el resumen financiero de forma opcional, sin bloquear las herramientas personales si falla. Se verificaron el regreso por el logo, los menús contextuales, la ausencia de los botones globales + Nuevo, el registro de un gasto desde Mis finanzas, el historial y el retorno al selector tras un nuevo inicio de sesión. Recargar una sección con sesión vigente conserva esa sección. Se revisaron doce vistas a 320–2560 píxeles en ambos temas.
