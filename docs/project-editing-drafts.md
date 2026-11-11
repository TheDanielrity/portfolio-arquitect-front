# Edición de proyectos con vista previa

El editor `/admin/projects/:id/edit` utiliza un borrador local durante la sesión.
No se modifican las rutas, los contratos generados ni el backend.

- Características, secciones, clasificación y detalles de archivos se editan en
  modales con **Aceptar** y **Cancelar**.
- **Aceptar** valida y actualiza la vista previa; no persiste el cambio.
- **Cancelar** conserva la versión aceptada anteriormente. Las características
  y secciones mantienen la confirmación de descarte cuando el formulario tiene cambios.
- **Guardar cambios** aparece cuando hay cambios pendientes. Guarda la información,
  las relaciones, la clasificación, la portada y los metadatos del archivo.
  El texto alternativo de la portada también puede editarse directamente y guardarse
  con el botón global.
- Las eliminaciones, cambios de visibilidad y cambios de orden también quedan
  pendientes hasta el guardado final.
- El botón global se bloquea mientras haya un modal abierto o cargas sin resolver.
- Al finalizar se vuelven a cargar las colecciones del backend para mostrar su
  estado autoritativo.

Las nuevas secciones muestran texto completo, citas, imágenes y galerías mediante
una vista previa administrativa. Los archivos de vídeo y modelos muestran su
identificación; no se añade un reproductor ni un visor 3D público en este cambio.

## Persistencia

`ProjectDraft` se provee únicamente en el editor. Los adaptadores de edición
reutilizan `ProjectApi`, `ProjectSectionsApi` y `MediaApi` para ejecutar los endpoints
existentes. El resto de las rutas continúa utilizando los servicios HTTP normales.

Cada elemento tiene una operación pendiente: nuevas aceptaciones reemplazan su
versión anterior. Un elemento nuevo eliminado antes de guardar no llega a crearse
en el servidor. Los identificadores locales se resuelven a los UUID devueltos por
el backend antes de enviar operaciones de orden. Las operaciones de orden se ejecutan
después de las creaciones. Las solicitudes se serializan; no se repiten las que
ya finalizaron correctamente cuando falla una operación posterior.

La API no ofrece una transacción global. Por ello un fallo puede dejar algunos
cambios guardados y otros pendientes. El editor identifica la operación fallida,
conserva la vista previa pendiente y permite corregirla o reintentar. La publicación
del proyecto se envía después de guardar sus relaciones.

Las subidas mantienen **presign → PUT directo → confirmación**. Los archivos
confirmados están en la biblioteca; su incorporación al proyecto se difiere hasta
el guardado global. Cancelar la edición o salir no elimina archivos confirmados.
No se guardan borradores de edición en almacenamiento del navegador. Al recargar
o abandonar se advierte sobre los cambios pendientes.

Para un proyecto nuevo se mantiene el guardado inicial necesario para obtener
su UUID antes de agregar relaciones.

## Validación

- `npm test`: pruebas existentes y pruebas de borradores, corrección de errores,
  reintentos parciales, identidades, orden y modales.
- `npm run test:project-drafts:browser`: Chrome headless con respuestas API
  interceptadas; verifica interacción real, ausencia de escrituras al aceptar,
  guardado final, Escape, foco y anchos de 390, 768, 1024 y 1440 px.
  No crea datos en el backend. Capturas en `.tools/project-drafts-*.png`.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`
  y `npm run validate:ssr`.

Los smoke tests históricos de proyectos, secciones y uploads que esperan guardado
inmediato deben adaptarse a este flujo antes de reutilizarse como pruebas de integración.
# Fotografías y galerías del mismo proyecto

Al cargar Fotografías o su selector, también se revisan todas las secciones GALLERY existentes del mismo proyecto, incluidas las ocultas. Las imágenes que aún no tienen una relación GALLERY se incorporan al borrador de fotografías y se persisten al guardar el proyecto. Se conserva el orden de las fotografías existentes y se agregan las faltantes sin duplicados, aunque una imagen aparezca en varias secciones. Se cargan todas las páginas de relaciones y secciones; un fallo de lectura no incorpora resultados incompletos.

Portada y Fotografías son pestañas principales independientes. Fotografías reúne imágenes con relaciones GALLERY, PLAN o RENDER del proyecto actual, incluyendo las aceptadas pendientes de guardar. Los planos y renders existentes conservan sus relaciones y se muestran sin duplicar la imagen. Las secciones GALLERY usan ese mismo conjunto para elegir fotografías. El selector no consulta la biblioteca global ni muestra portadas o archivos de otros proyectos. La búsqueda y paginación se aplican a todas las fotografías del proyecto tras cargar sus relaciones paginadas. Ambas pestañas aceptan únicamente imágenes; los vídeos y modelos se gestionan desde sus secciones en Presentación del proyecto. Los archivos anteriores se conservan.

Una imagen subida desde una sección GALLERY se incorpora también a las fotografías del mismo proyecto al aceptar la sección, siempre que siga seleccionada. Se reutiliza el mismo archivo confirmado, sin otra subida a R2 ni relaciones GALLERY duplicadas. Cancelar el modal no incorpora la imagen al proyecto; el archivo confirmado permanece en la biblioteca según el flujo existente. Las relaciones se guardan mediante el botón final del proyecto. Quitar una imagen de una sección no elimina su fotografía ni su archivo.

