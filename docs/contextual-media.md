# Gestión contextual de archivos

## Selector de fotografías del proyecto

Las fotografías del proyecto muestran vista previa automática mediante MediaPreview
y el flujo de contenido autenticado existente. Cada fotografía es un botón con
nombre accesible: pulsar su imagen o activarlo con Enter/Espacio emite la selección
y el editor cierra el selector. No se muestran «Ver imagen», «Ver detalles y
gestionar» ni un botón adicional «Seleccionar». Se conserva el nombre de la foto.

Las imágenes ya añadidas a una sección GALLERY también cargan su vista previa
automáticamente dentro del editor, sin «Ver imagen». Esto incluye los archivos
existentes al abrir la edición y las nuevas selecciones. Se reutiliza el contenido
autenticado y la gestión de errores/URLs del mismo MediaPreview; no cambia el
comportamiento de otros tipos de sección.

La subida desde GALLERY usa el mismo cuadro visual de Fotografías: icono,
botón «Subir imagen» y zona para arrastrar. Ambos comparten los estilos de
`projects/_upload-dropzone.scss`. Al entrar archivos, el borde se vuelve negro
y sólido, aparece un contorno de 3 px y cambia el fondo; al salir o soltar se
restablece. Los eventos de elementos hijos no apagan prematuramente el estado.
Se conserva una imagen por subida y el límite de 20 MiB; un lote de varios
archivos muestra un mensaje en lugar de ignorar archivos. No se aceptan drops
durante una subida, con el editor bloqueado o al alcanzar el máximo de la galería.
Se reutiliza MediaUpload y su presign/PUT/confirmación, sin un flujo nuevo.

El cierre usa una X de 44 px con aria-label «Cerrar selector»; Escape sigue
cerrando el diálogo nativo. Las imágenes se distribuyen en dos columnas y en una
columna en móvil. Se mantienen búsqueda, paginación, estados de carga/error y
liberación de las URLs de vista previa al cerrar. Si falla la descarga se muestra
el error; una vista previa no puede garantizarse cuando el contenido no está disponible.

En fotografías queda únicamente el campo Buscar, sin selector de tipo ni botón
de envío: filtra automáticamente después de 250 ms al escribir. Si se cambia la
búsqueda durante una carga, se aplica la consulta más reciente al terminar.
El resultado sigue restringido a imágenes reales del proyecto. En selectores
de biblioteca con tipo fijo tampoco se muestra un filtro de tipo redundante.

Las secciones MODEL_3D solo permiten subir GLB/STL desde su propio editor;
se retira «Elegir de biblioteca» y no se renderiza el selector para ese tipo.
Los modelos ya asociados se conservan y pueden reemplazarse quitándolos y
subiendo otro archivo. Los demás tipos mantienen sus flujos existentes.

Este cambio se limita a fotografías del proyecto (`projectId` presente). La
biblioteca general conserva sus acciones de gestión. No se añaden endpoints,
dependencias ni cambios de backend.

Validación actualizada: 604 pruebas unitarias aprobadas; lint, formato,
TypeScript y build correctos.
`npm run test:photo-picker:browser` comprueba Chrome con API y contenido privado
simulados, sin escribir datos de backend: carga sin clic, selección por imagen y
Enter, cierre X/Escape, búsqueda automática sin filtro de tipo, subida exclusiva
desde MODEL_3D y reflujo a 390/768/1440 px. Capturas de esta comprobación
en `.tools/photo-picker-1793327817499/`, incluida `gallery-drop-active.png`.
También comprueba el contraste negro y contorno de 3 px durante el arrastre,
el restablecimiento al salir y el rechazo de formatos incompatibles.
Comprueba que la imagen seleccionada
aparece directamente en el editor de galería. No se repitió una integración con R2 real
porque no cambió el flujo HTTP; se reutilizó el servicio de contenido existente.

La biblioteca general se retira del menú y de las rutas. Las subidas de proyectos utilizan ProjectUploadQueue y MediaUpload: autorización, PUT firmado, confirmación y asociación automática al ID del proyecto. En creación se guarda primero el borrador. Los fallos de asociación se reintentan sin subir otra vez.

En Portada y Galería, "Recuperar o vincular archivos existentes" permite buscar y paginar todos los archivos confirmados, incluidos los no asociados. No se migra ni elimina ningún archivo o referencia. El selector conserva metadatos, descarga y eliminación confirmada mediante MediaDetail; el backend impide eliminar archivos referenciados (409).

La foto y el CV se suben desde Perfil con el mismo motor. Solo la confirmación exitosa asigna el archivo al formulario; Guardar perfil persiste la referencia. Salir advierte de cambios y bloquea durante operaciones pendientes. Los archivos existentes de CV PDF/DOCUMENT siguen siendo seleccionables.

## Comprobación previa

API local, 2026-10-06: 2 archivos, 2 proyectos, 0 archivos sin asociación en las relaciones de proyectos. Se consultaron todas las páginas de archivos, proyectos y relaciones. Este inventario corresponde al entorno local; no certifica otros entornos. El contrato no expone un filtro de huérfanos, por lo que el selector conserva acceso a la biblioteca completa.

No se modifican backend, contratos generados, almacenamiento, autenticación, URLs firmadas, políticas de confirmación o limpieza. No hay nuevas dependencias ni rutas.
