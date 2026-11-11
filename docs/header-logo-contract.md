# Logo de la cabecera pública

Implementado usando la imagen de Perfil por decisión del usuario. Sustituye el nombre y el título profesional de la cabecera por un logo cuadrado o símbolo.

- Subida desde Administración → Perfil → Logo del portafolio.
- Archivo recomendado: PNG transparente de 512 × 512 px, con poco espacio vacío.
- Tamaño visible: 64 × 64 px en escritorio, 48 × 48 px en móvil.
- `object-fit: contain`: conserva proporciones, sin recorte ni máscara circular.
- Se usa la imagen original para evitar recortes de miniaturas generadas.
- Las iniciales sirven de respaldo cuando falta la imagen o falla su carga.
- El enlace de inicio mantiene el nombre del perfil como etiqueta accesible.
- El logo debe tener contraste sobre fotografías y sobre la cabecera clara.

Se reutilizan `profile_media_id`, `PublicProfile.profile_media` y el flujo existente de autorización, subida a R2 y confirmación. No se necesita un campo nuevo ni cambios del backend. Esta decisión sustituye la propuesta anterior de un logo independiente.
