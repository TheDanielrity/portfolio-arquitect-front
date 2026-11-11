# Experiencia administrativa del editor

## Auditoría inicial

El editor ya conservaba formularios al cambiar pestañas, coordinaba
presign/PUT/confirm/asociación, reemplazaba portadas transaccionalmente y protegía
cambios del formulario principal, archivos y secciones. Se reutilizan estas operaciones.

Problemas observados: seis pestañas separaban tareas relacionadas; el enlace
requería escribir un slug; publicación estaba junto a la información principal;
características mostraba un formulario permanente y lenguaje técnico; el guardado
no distinguía suficientemente operaciones independientes. Validación local usaba
touched o dirty y podía aparecer mientras se escribía. Clasificación y borradores
de características no se incluían en la protección de salida.

## Cuatro áreas

1. **Información del proyecto**: título, resumen, descripción completa, ubicación,
   año, área y cliente; clasificación y características una vez guardado.
2. **Fotografías y archivos**: Portada, Galería, Planos, Renders, Documentos y
   Modelos 3D. Subir o elegir de biblioteca, detalles compartidos, orden y retirada.
3. **Presentación del proyecto**: Texto, Imagen, Galería de imágenes, Video,
   Modelo 3D, Cita destacada e Imagen y texto.
4. **Publicación**: estado, visibilidad, destacado, posición, enlace y apariencia
   en Google. No se añaden requisitos ni campos al contrato.

Los paneles permanecen montados durante navegación interna. No es un asistente
obligatorio. Las áreas sin identificador muestran ayuda, sin uploads huérfanos.

## Nuevo y existente; enlace

/admin/projects/new comienza sin errores rojos. El título propone un enlace
normalizando acentos, espacios y símbolos a letras minúsculas, números y guiones.
Se respeta el límite de 220 caracteres sin guiones finales. Unicidad es del backend.

Se muestra la ruta relativa /projects/<enlace>, sin inventar dominio. Personalizar
enlace abre Publicación. La edición manual impide futuras regeneraciones.
Proyectos existentes nunca regeneran el enlace al cambiar el título.
Cambiar un enlace existente avisa que los enlaces anteriores dejarán de funcionar;
si ya está publicado requiere confirmación. No hay redirecciones.

Guardar y continuar usa el POST existente y navega al editor con el identificador
real y el área de archivos seleccionada. En edición se usa Guardar cambios.

## Formularios y persistencia

Errores locales después de modificación y pérdida de foco o intento de guardar.
Los errores backend aparecen cuando ocurren; 422 se asocia al campo.
409 explica el posible enlace duplicado y permite personalizarlo.
Se conserva el formulario ante errores de red, validación o publicación.

La barra persistente comunica pendiente, guardando y éxito del formulario principal.
**No es una transacción global**: clasificación, características, archivos y
secciones usan sus propias acciones/endpoints. Guardar cambios no guarda sus
borradores. Las operaciones de archivos pendientes bloquean publicación/guardado.
Se mantienen CanDeactivate y beforeunload, incluyendo ahora clasificación y
características. No se incorpora autosave.

## Características

Estado vacío compacto y Agregar característica. Nombre y valor muestran ejemplos
como placeholders, nunca contenido inicial. Editar abre el formulario; guardar
actualiza la colección del servidor y lo cierra. Cancelar un borrador y eliminar
requieren confirmación. Se conservan subir/bajar y recuperación del orden tras errores.

## Archivos y secciones

Una instancia ProjectMedia conserva todos los grupos y la cola al navegar.
Cada subida usa MediaUpload, headers de presign, PUT aislado sin Authorization y
confirm antes de asociar. COVER usa PUT transaccional. Los estados distinguen
subida, confirmación y asociación. PDF se clasifica en Documentos y GLB en Modelos 3D
conforme al flujo existente. Quitar del proyecto nunca elimina el archivo global.

Secciones reutilizan MediaUpload para subir directamente. Solo un archivo confirmado
se añade al formulario. La asociación se persiste con Guardar sección mediante
el cuerpo completo del contrato. Fallos conservan el borrador; archivos confirmados
siguen recuperables en biblioteca. Hay cancelación, reintento y reintento de
confirmación. No se duplica transporte R2.

## Publicación y búsqueda

Borrador no aparece en el portafolio, incluso con visibilidad Pública. Publicado
respeta visibilidad. Archivado queda fuera del portafolio activo. Público aparece
en listados publicados, Privado se administra únicamente en el panel y No listado
permite acceso por enlace cuando está publicado sin aparecer en listados.
Publicar requiere confirmación. Solo el PATCH exitoso confirma el estado;
el backend verifica portada y reglas.

Apariencia en Google agrupa título y descripción sin prometer posicionamiento.

## Accesibilidad y límites

Botones nativos, aria-current, labels, fieldsets, errores próximos, status/alert y
foco visible. Agregar/editar características enfoca el nombre; los diálogos restauran
foco y respetan Escape. Orden tiene alternativas subir/bajar. No se añade drag and
drop. Controles para 375/768/1024/1440 sin eliminar operaciones.

La ruta pública /projects/:slug es provisional: no se ofrece una vista previa
falsa ni enlaces públicos para borradores/privados. La biblioteca actual es
un selector contextual, sin pantalla global activa /admin/media en este checkout.

Archivos locales no sobreviven recargar durante subida; los confirmados se recuperan
desde biblioteca. Sus detalles se comparten en todos sus usos. Limpieza de pruebas
usa APIs; staging y sesiones históricas siguen expiración del backend.
No se modifican backend, contratos, R2, autenticación, guards, interceptors ni UI pública.
Phase 9 y Phase 10 conservan COMPLETED según PLANS.md; ninguna fase pública se inicia.


## Validación final — 2026-10-09

- 449 pruebas unitarias en 29 archivos, 23 nuevas, todas aprobadas.
- ESLint, Prettier, TypeScript y plantillas estrictas: aprobados.
- Build de producción y validación SSR: aprobados; SSR administrativo solo entrega
  el shell cliente, sin datos privados. Bundle inicial: 325.13 kB.
- Chrome/FastAPI/PostgreSQL/R2: creación, enlace automático, continuar al editor,
  portada y galería, progreso, asociación, reemplazo transaccional, conservación
  del archivo compartido al retirar una relación, características, guardado y recarga.
- Los siete tipos de sección: creación real, elección desde biblioteca, uploads inline
  de imagen/video/GLB, asociación al guardar, visibilidad y orden.
- Publicación privada/pública y exclusión de borradores; apariencia de búsqueda y
  destacado persistidos en el backend.
- Responsive 375/768/1024/1440: cuatro áreas, galería, selector, editor de secciones y
  pantallas administrativas existentes sin overflow de viewport, contenido o diálogos.
  Capturas revisadas en móvil y escritorio.
- Chrome autenticación: login, rutas protegidas, teclado y foco/modal, sesión tras
  recarga, tres respuestas 401 con un solo refresh y tres reintentos exitosos,
  logout y reingreso protegido. No se modifica infraestructura de autenticación.
- Chrome público: SSR/hidratación, responsive, filtros, paginación, query/reload/Back,
  navegación por enlace, reduced motion y entrega real R2 sin sesión administrativa.
- Cleanup de fixtures mediante APIs, con verificación de ausencia de proyectos y
  archivos activos. No se modifica contenido del propietario.

Comandos del proyecto: npm test, npm run lint, npm run format:check,
npm run typecheck, npm run build y npm run validate:ssr.

Para Chrome: npm run test:project-uploads:browser, npm run test:auth:browser,
npm run test:public:browser y npm run test:public-projects:browser.
Ejecutar los smokes que publican proyectos temporales **secuencialmente**, porque
comparten el listado público de destacados. El smoke contextual de proyectos es
la validación administrativa vigente; los antiguos harnesses que parten de la
pantalla global /admin/media describen una pantalla que ya no existe en este checkout.

No se agregan dependencias ni rutas. No se cambian configuraciones para aprobar
verificaciones. PLANS.md y todas las fases públicas conservan su estado.
