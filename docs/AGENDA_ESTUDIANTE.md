# Agenda del estudiante

Actualización del 15 de octubre de 2026, basada en las referencias de la agenda del estudiante. Cada persona conserva sus propios cursos, notas, clases, hábitos, estudio y registros de ánimo.

## Entrar

En el selector principal elige **Mi agenda diaria**. Se abre **Inicio de agenda**, con las clases del día, próximas entregas, pendientes, hábitos, registro de ánimo y resumen financiero real. El dinero es una consulta opcional: si falla, la agenda puede seguir funcionando. El botón del logo siempre vuelve al selector de espacios.

En escritorio el menú incluye Inicio de agenda, Mi agenda, Horario, Cursos y notas, Enfoque, Bienestar y Perfil. En móvil la barra muestra Inicio de agenda, Mi agenda, Horario, Cursos y notas y Perfil. Enfoque y Bienestar también se abren desde los botones del inicio de agenda.

## Cursos y notas: cuánto falta para aprobar

1. Crea una materia en **Cursos y notas → Agregar curso**. La configuración inicial elegida por el propietario es nota máxima 20, mínima 11 y redondeo final al entero desde .5: **10.5 se convierte en 11**. Puedes cambiar la escala, mínima y redondeo por curso.
2. Añade todas las evaluaciones con su peso. Los pesos deben sumar exactamente **100%**. Se permiten dos decimales en pesos y notas. El servidor rechaza pesos que excedan 100% y notas fuera de la escala.
3. Deja la nota vacía si todavía no se evalúa. **Cero es una nota evaluada**, no un pendiente.
4. Toca una evaluación para editar nombre, peso o nota. Los cálculos se actualizan al guardar. El promedio que encabeza la tarjeta es el de lo evaluado; no es una nota final si quedan pendientes.

### Cálculo

- Acumulado = suma de `nota × peso / 100` de las evaluaciones con nota.
- Peso evaluado = suma de sus pesos.
- Promedio parcial = `acumulado / (peso evaluado / 100)`.
- Sin redondeo, el objetivo es la mínima configurada.
- Con redondeo entero desde .5 y mínima 11, el objetivo antes de redondear es **10.5**. No se redondean por separado las evaluaciones ni los aportes parciales.
- Promedio necesario en lo pendiente = `(objetivo − acumulado) / (peso pendiente / 100)`, con mínimo cero.

La nota necesaria se muestra **hacia arriba a dos decimales** para que la cifra mostrada alcance el objetivo. Los cálculos del servidor usan Decimal, sin acumular errores de coma flotante. Si falta definir parte de las evaluaciones, se muestra «Completa tus evaluaciones» y no se emite una proyección.

Ejemplo: PC1 de 14 al 20%, PC2 de 12 al 20% y 60% pendiente. Acumulaste 5.2, y tu promedio parcial es 13. Para aprobar con la regla 10.5 → 11 necesitas **8.84** de promedio ponderado en ese 60%. Si eliges sin redondeo y mínima 11, necesitas **9.67**.

### Estados

- **Aún sin notas:** el plan está completo pero no se registraron resultados.
- **Vas encaminado:** el promedio parcial alcanza el objetivo actual. Aún debes rendir lo pendiente.
- **En riesgo: puedes recuperarte:** el promedio parcial está por debajo del objetivo, pero es matemáticamente posible llegar con las evaluaciones pendientes.
- **No alcanza con lo pendiente:** incluso con la nota máxima en todas las pendientes, no llegas al objetivo.
- **Aprobación asegurada por promedio:** lo ya acumulado alcanza el objetivo incluso con cero en lo pendiente.
- **Aprobado / Desaprobado:** ya se evaluó el 100%; se aplica el redondeo final configurado.

Estos estados calculan el promedio según los registros y la regla elegida; no son una predicción estadística. No aplican asistencia mínima, mínimos por examen, recuperaciones, sustitutorios o reglas especiales no configuradas. La tarjeta incluye esta explicación.

## Tareas, entregas y horario

Las tareas existentes se conservan. Ahora puedes vincularlas a un curso y mantener fecha, prioridad, estado y área. Inicio de agenda muestra las próximas tareas con fecha, incluidas las vencidas, y permite marcarlas como completadas.

En **Horario → Agregar clase**, elige curso, día de lunes a domingo, inicio, fin y aula o enlace opcional. Son clases semanales, en hora de Perú. Se pueden editar y eliminar; el servidor rechaza cruces de horario y clases cuya hora final no sea posterior al inicio del mismo día.

**Exportar 16 semanas** descarga un archivo `.ics` con 16 ocurrencias semanales por clase, desde la siguiente fecha correspondiente. Puedes importarlo en Google Calendar u otro calendario. La conexión directa se activa en el cuadro Google Calendar de Horario; consulta [Calendar académico](CALENDAR_ACADEMICO.md). Evita usar a la vez conexión e importación para las mismas clases. Cambiar una clase en Balance no cambia los eventos ya importados por archivo.

Eliminar un curso elimina sus evaluaciones y clases después de confirmarlo. Conserva sus tareas y sesiones de estudio, desvinculadas del curso.

## Enfoque

- Temporizadores de 25 o 50 minutos y descanso de 5 minutos.
- Curso opcional, empezar, pausar, continuar y reiniciar con confirmación si había tiempo en curso.
- El temporizador se conserva en el servidor: cambiar de pantalla o recargar no lo inicia de nuevo. No hay alarmas con la aplicación cerrada.
- Al terminar una sesión de estudio puedes guardarla una sola vez. Los descansos no suman tiempo de estudio.
- También puedes registrar minutos que ya estudiaste, entre 1 y 480 por sesión. El registro manual protege los reintentos de la misma solicitud.
- Resumen real de lunes hasta hoy en horario de Perú, separado por curso. Permite eliminar sesiones con confirmación. Las sesiones se atribuyen al día en que se guardan, sin distribuir minutos entre días automáticamente.

## Bienestar

Puedes registrar cómo te sientes hoy, cambiarlo o borrar la marca de hoy. La pantalla muestra los últimos siete días sin crear registros ficticios ni diagnósticos.

El planificador de sueño usa las horas que eliges, tu hora habitual para despertar y los minutos de preparación/traslado. Si tu primera clase de mañana requiere despertar antes, adelanta esa hora. Si tienes clase por la tarde, mantiene tu hora habitual; no desplaza automáticamente el sueño hasta la madrugada.

El porcentaje de hábitos corresponde a las marcas de los últimos siete días respecto a tus hábitos actuales × siete. Se muestra como una descripción, no como una evaluación de salud o de tu valor personal.

## Google y finanzas

El perfil conserva las conexiones reales. Gmail revisa comprobantes financieros y Calendar gestiona recordatorios de pagos, como antes. **No se detectan automáticamente avisos universitarios ni entregas desde Gmail.** El horario académico se conecta directamente a Calendar si cada usuario lo activa en Horario; también conserva la exportación `.ics` como alternativa. El cuadro de dinero utiliza el disponible real registrado y no inventa un presupuesto semanal.

## Datos y actualización

Se añaden tablas en las bases privadas existentes. Se conservan usuarios, movimientos, tareas y hábitos. Todo entra en el respaldo cifrado ya disponible; no se guardan notas, horarios, ánimo o estudio en localStorage. El panel de administración no muestra estos datos. El propietario de la computadora conserva acceso técnico a los archivos locales, que no están cifrados de extremo a extremo.

Detén la aplicación y actualiza desde la carpeta del proyecto:

```powershell
py -3 scripts/manage.py backup
git pull --ff-only origin codex/iphone-scripts
py -3 scripts/manage.py install
py -3 scripts/manage.py tunnel
```

Recarga con Ctrl+F5. Para uso solo local, sustituye el último comando por `serve`. Si cambia el enlace temporal, comparte el nuevo y actualiza el callback exacto de Google.

## Validación

Compilación TypeScript/Vite y **141 pruebas del servidor** correctas. Incluyen 10.49/10.5/10.51, redondeo solo al final, cero frente a pendiente, pesos decimales, esquemas incompletos, otras escalas, recuperación, imposibilidad matemática y aprobación asegurada. También se probaron aislamiento/CSRF, migraciones, tareas por curso, borrados relacionados, cruces de horario, sueño, ánimo, semanas de Perú, pausa/continuación y guardado único del temporizador.

Se recorrieron las nuevas pantallas en Chromium, ambos temas y anchos 320, 390, 768, 901, 1199, 1637 y 1920, sin desbordamientos y con contraste legible. Se verificaron formularios reales, exportación `.ics`, persistencia al recargar, acceso móvil a todas las herramientas y ausencia de cambios financieros. Estas pruebas usan perfiles temporales; no sustituyen la prueba física de Windows/iPhone ni el consentimiento real de Google.
