# Diseño basado en el HTML de Balance

Actualización del 15 de octubre de 2026. Se adaptó la referencia `Balance · Finanzas personales.html` a la aplicación React/FastAPI existente. El archivo de referencia era una demostración con datos en memoria; los saldos, usuarios y conexiones de la app siguen usando sus bases privadas.

## Pantallas

- **Inicio:** selector de Mis finanzas y Mi agenda diaria; también se abre tocando el logo.
- **Mis finanzas:** disponible real, simulador «¿Y si gasto?», saldos, hasta tres próximos pagos, gastos por mes seleccionable y acceso a revisar Gmail. El simulador no guarda un movimiento ni cambia saldos.
- **Inicio de agenda:** clases del día, próximas entregas, hábitos, ánimo y resumen financiero real; accesos móviles a enfoque y bienestar.
- **Horario, Cursos y notas, Enfoque y Bienestar:** [guía de la agenda del estudiante](AGENDA_ESTUDIANTE.md).
- **Mi agenda diaria:** tareas de estudios, personales y de casa con fecha, prioridad y estados; hábitos diarios y sus últimos siete días. Véase [el espacio personal](ECOSISTEMA.md).
- **Mi dinero:** cuentas y tarjetas, con una entrada común para añadir una u otra. Se conservan transferencias, informes por tarjeta, deuda y programación de pagos.
- **Pagos:** pendientes, pagados y pausados; confirmación con vista previa, movimiento existente, Calendar y comprobantes.
- **Historial:** filtros, búsqueda, CSV, detalles, corrección y anulación con motivo.
- **Reportes:** últimos 3/6/12 meses; tocar una barra cambia el mes del detalle. También puede elegirse otro mes con el selector. Las categorías, la distribución circular y el margen corresponden al mes seleccionado, incluidas sus comisiones. El gráfico general mantiene la ventana de los últimos meses.
- **Metas:** progreso, iconos, aportes y reserva opcional, separados de la configuración.
- **Perfil y conexiones:** estado de Google, Gmail, Calendar, seguridad, apariencia, administración exclusiva del propietario y cierre de sesión. Los accesos de Reportes y Metas también están aquí para móvil.

El menú se adapta al espacio elegido. En Finanzas incluye el resumen, cuentas, pagos, historial, reportes y metas. En Agenda incluye Inicio de agenda, tareas, horario, cursos y notas, enfoque y bienestar. Inicio vuelve al selector y Perfil conserva las conexiones y ajustes. En móvil Inicio tiene dos accesos inferiores (Inicio y Perfil); Agenda tiene cinco (Inicio de agenda, Mi agenda, Horario, Cursos y notas y Perfil); Enfoque y Bienestar se abren también desde Inicio de agenda, y Finanzas tiene cinco (Inicio, Mis finanzas, Pagos, Historial y Perfil). Mi dinero se abre desde el resumen financiero; Reportes y Metas también están en Perfil. El logo es un botón para volver al selector tanto en escritorio como en móvil. Se retiraron los botones globales «+ Nuevo»: los movimientos se registran desde las acciones de Mis finanzas. Los enlaces antiguos `#mas` siguen abriendo el perfil. `#inicio` abre el selector y `#finanzas` el resumen financiero. Un inicio de sesión nuevo abre el selector; recargar una sección con sesión activa conserva esa sección.

## Apariencia

El tema inicial es **Noche**, como la referencia. En **Perfil → Apariencia** se elige **Día**, **Noche** o **Sistema**. La preferencia se conserva en ese navegador; no se guardan datos financieros en el almacenamiento del navegador. El modo Sistema responde a los cambios del dispositivo.

El contenido queda centrado dentro del espacio disponible junto al menú lateral, con un ancho máximo para facilitar la lectura. En móvil ocupa el ancho disponible.

Se conserva el escarabajo de Balance, con azul, dorado y verde para distinguir gastos, reservas e ingresos. Se incluye localmente la fuente Hanken Grotesk y su licencia SIL Open Font License; no hace falta pedir la fuente a Google al abrir la app.

## Funciones reales

Gmail y Calendar conservan el consentimiento y las acciones reales del servidor. No se muestran conexiones ficticias ni interruptores de la demostración que aparenten activar permisos Google. Los usuarios normales siguen sin acceso a administración. Los cálculos y comprobantes existentes no se sustituyen por los ejemplos del HTML.

Las funciones financieras conservan la moneda PEN, el horario de Perú, los controles de saldo/deuda, la separación por usuario y los respaldos. Esta actualización de diseño no corrige errores de OAuth, configura un dominio ni reinicia automáticamente el túnel del propietario.

## Actualizar sin perder datos

Detén la app y crea un respaldo antes de actualizar:

```powershell
py -3 scripts/manage.py backup
git pull --ff-only origin codex/iphone-scripts
py -3 scripts/manage.py install
```

Luego inicia **un solo modo**:

```powershell
py -3 scripts/manage.py serve
```

O, si compartes por Cloudflare:

```powershell
py -3 scripts/manage.py tunnel
```

Recarga con Ctrl+F5. Los usuarios y los datos permanecen en la carpeta privada anterior. Un Quick Tunnel de Cloudflare puede cambiar de enlace al reiniciarse: comparte el nuevo enlace y autoriza el callback exacto que imprima el comando si usas Google. El modo de Tailscale requiere que su publicación DNS esté funcionando; el diseño no cambia ese requisito.

## Comprobaciones

Compilación TypeScript/Vite y 124 pruebas del backend correctas. Se recorrieron gastos, ingresos, transferencias, pagos, corrección/anulación, crédito, reservas y recuperación por código. La prueba del simulador comprobó que saldos e historial no cambian al moverlo. Se verificaron los meses seleccionados, categorías y margen con datos temporales, los temas Día/Noche/Sistema y su persistencia, y la separación entre propietario y usuario normal.

Se comprobaron diez vistas y los formularios en anchos de 320, 390, 768, 1199 y 1637 píxeles. Se revisaron capturas de escritorio y móvil y el contraste de los textos de las pantallas principales en ambos temas. La validación fue en Linux/Chromium; Safari en un iPhone físico, la instalación Windows y el consentimiento real de Google deben comprobarse en sus dispositivos.
