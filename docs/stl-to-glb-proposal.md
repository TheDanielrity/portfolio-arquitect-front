# STL → GLB: inspección y propuesta de integración

Estado: propuesta histórica de conversión en backend, sustituida por la instrucción
explícita del usuario de convertir en Angular sin modificar FastAPI/PostgreSQL.
La implementación vigente y sus límites están en `docs/architectural-model-viewer.md`.
Los contratos siguientes no se implementaron ni se necesitan para la solución actual.
Inspección: 2026-10-27 (America/Lima). Alcance exclusivo: STL y GLB.

## Evidencia de la implementación actual

- `src/app/features/public/project-detail/public-model.ts`: acepta únicamente
  `MODEL_3D` con MIME `model/gltf-binary`. Importa `@google/model-viewer` 4.4.0
  al pulsar «Ver modelo 3D», solo en navegador. Tiene carga, error, reintento y
  timeout de 30 segundos. No convierte geometría ni configura unidades/ejes.
- `src/app/features/admin/media/media-policy.ts`: GLB hasta 100 MiB como ayuda
  de UX; STL no está permitido. FastAPI sigue siendo la autoridad del límite.
- `MediaUpload`: presign → PUT → confirm → asset disponible. La cola
  `ProjectUploadQueue` asocia solo después de recibir el asset confirmado;
  asigna rol `MODEL` a GLB. Reintenta confirmación/asociación sin duplicar subidas.
- `MediaApi.put`: PUT directo a R2 mediante cliente sin interceptores, con los
  headers firmados intactos y progreso XHR. El adaptador local usa JWT.
- `sections/section-policy.ts`: MODEL_3D admite un único GLB. El backend valida
  el tipo de media de la sección, no una conversión pendiente.
- OpenAPI real leído desde `http://127.0.0.1:8000/openapi.json`: existen
  `/api/v1/admin/media/uploads/presign`, `/confirm` y `/{upload_id}` (DELETE).
  `confirm` devuelve sincrónicamente `MediaResponse`. No hay contrato de
  conversión, consulta de tarea, progreso ni reintento de conversión.
- Backend `app/modules/media/upload_policy.py`: `FORMATS` solo incluye `.glb`
  / `model/gltf-binary` para MODEL_3D. `validate_request` rechaza `.stl` aunque
  el esquema OpenAPI de MIME sea un string libre. El límite por defecto es
  104857600 bytes; se combina con el límite global.
- `upload_service.py`: verifica HEAD (tamaño/MIME), prefijo y GLB v2 con longitud
  declarada; promueve y registra el mismo objeto. No valida íntegramente la
  geometría ni convierte. La inspección actual lee solo 64 bytes.
- `storage_port.py`: ofrece presign/head/prefix/promote/access/delete; no tiene
  operaciones de lectura completa acotada ni escritura del derivado para worker.
- `operation_models.py`: las restricciones SQL actuales solo admiten operaciones
  UPLOAD/DELETE y estados de almacenamiento existentes. No reutilizar ni ampliar
  informalmente esos estados como si ya fueran estados de conversión.
- El CORS versionado en `docs/railway-r2-cors.json` contiene el origen placeholder
  `ya es`: no demuestra la configuración aplicada al bucket real. Verificar en
  despliegue; no se consultaron credenciales ni configuración remota de R2.

## Decisión recomendada

Convertir en un worker de backend con proceso aislado y ejecución durable.
FastAPI autoriza, confirma la fuente y coordina; el worker descarga la fuente
verificada, convierte y registra un GLB. No convertir dentro del event loop,
en una petición larga, en Express SSR ni en el navegador.

Un Web Worker evita bloquear el hilo principal pero no elimina el coste de
memoria de parsear, expandir triángulos y exportar. No es la opción predeterminada
para modelos arquitectónicos grandes ni para dispositivos móviles.

Usar una tarea persistente en PostgreSQL con reclamación exclusiva, lease,
heartbeat y reanudación tras caída. Un proceso worker separado puede consultar
esa tabla sin introducir Redis/Celery inicialmente. No usar BackgroundTasks
como única garantía de ejecución. No se requiere Docker.

Biblioteca candidata para backend: `trimesh` y su dependencia numérica necesaria
`numpy`, por su lectura STL ASCII/binario y exportación GLB. Evaluar y fijar
versiones compatibles con el Python del backend mediante una prueba acotada.
No se añade ninguna dependencia en esta propuesta ni se necesita otra librería
de render en Angular. El parser se fuerza a STL, sin cargar otros formatos,
recursos de red ni rutas indicadas por el archivo.

Fuentes primarias consultadas:

- [model-viewer: formatos y cámara](https://modelviewer.dev/docs/index.html).
- [Trimesh: formatos](https://trimesh.org/formats.html).
- [Trimesh: exportación GLB](https://trimesh.org/trimesh.exchange.gltf.html).

## Flujo objetivo y compatibilidad

1. Administrador selecciona STL y revisa unidades/eje; frontend solicita presign.
2. Backend aplica política STL explícita y devuelve autorización para la fuente.
3. Navegador realiza PUT directo a R2 conservando exactamente los headers.
4. Confirmación verifica la fuente, crea una tarea durable y responde 202 con
   referencia de operación. La fuente todavía no es un asset publicable.
5. Worker obtiene una copia inmutable verificada, valida y convierte. Escribe
   GLB en una clave nueva, verifica el resultado y registra MediaResponse.
6. Frontend consulta estado con backoff, cancelación y recuperación tras recarga.
   Asocia al proyecto únicamente el media_id del GLB confirmado, con rol MODEL;
   conserva las operaciones existentes de asociación y de sección MODEL_3D.
7. Publicación y entrega pública siguen exponiendo solo assets GLB confirmados.
   El proyecto puede conservar su contenido anterior durante una conversión;
   el STL pendiente nunca sustituye un modelo publicado.

Para GLB nativo: conservar presign/PUT/confirm y respuesta 200 MediaResponse,
sin tarea de conversión, transformación, material ni cambios de bytes.

## Cambios de backend y OpenAPI necesarios

Los siguientes contratos son propuestas, no endpoints disponibles. Definirlos
y publicarlos en FastAPI antes de generar tipos o integrar llamadas Angular.

- Política separada de fuentes STL: extensión `.stl`, MIME canónico `model/stl`,
  normalización documentada de MIME vacío/genérico declarado por navegador,
  límites de fuente y validación ASCII/binaria completa. No permitir octet-stream
  de manera indiscriminada. Los headers devueltos siguen siendo autoritativos.
- Opciones de conversión tipadas en autorización STL: unidades `mm|cm|m` y eje
  vertical `Y|Z`, con valores iniciales visibles `mm`/`Z`, confirmables antes de
  subir. No aplicarlas a GLB nativo. Capturar opciones en la operación durable.
- Mantener confirmación GLB 200; agregar respuesta STL 202 discriminada como
  operación de conversión. Explicitar ambos esquemas y códigos en OpenAPI;
  actualizar clientes que asumen siempre MediaResponse.
- Consulta autenticada de operación y reintento/cancelación autenticados. Las
  rutas definitivas se decidirán en backend; no hay nuevas rutas implementadas.
  El estado incluye id, fase, fechas, intento, error seguro/código/retryable,
  opciones, progreso opcional y media_id/resultado solo al completar.
- Estados de conversión propuestos: queued, validating, converting, exporting,
  verifying, completed, failed, cancelling, cancelled. Son estados de tarea,
  separados de los estados de publicación y de StorageOperation existentes.
- Progreso: porcentaje real de transferencia; fase e indicador indeterminado
  para parseo/exportación sin callback fiable. Nunca inventar porcentajes.
- Reintento idempotente por operación y versión de opciones/conversor. Si el
  GLB ya fue registrado, devolver el mismo resultado. Fallo de asociación se
  resuelve con la lógica actual, sin reconvertir. Fuente expirada/eliminada
  requiere nueva subida; error permanente no ofrece reintento idéntico.
- Documentar 400/422 (formato/geometría/opciones), 401/403, 404, 409 (conflicto),
  429 y Retry-After, 503 y errores de tarea por timeout/memoria/almacenamiento.
- Regenerar `src/app/core/api/generated/` mediante `npm run api:generate` solo
  después de publicar el nuevo OpenAPI. No editar tipos generados a mano.

## Almacenamiento, integridad y despliegue

- Fuente privada no asociable/no entregable públicamente, aunque se solicite
  acceso público para el derivado. Una tarea no es MediaResponse.
- Confirmar una copia inmutable antes de encolar: el PUT firmado puede seguir
  vigente y sobrescribir staging. Usar copia condicionada por ETag y verificar
  destino; worker lee esa copia, no staging mutable. Identificar también por
  hash del contenido. No confiar exclusivamente en la extensión/cabecera.
- Extender StoragePort/adaptadores con descarga acotada a archivo temporal y
  escritura administrada del GLB (R2 y local). El worker usa credenciales de
  servicio del backend; Angular nunca las recibe ni sube un GLB ficticio.
- Respetar el validador actual de claves (`staging|objects` con UUID/extensión)
  o migrarlo explícitamente. No introducir un prefijo que el adaptador rechace.
- Tabla de conversiones y migración para operación, propietario, opciones,
  fuente, hash, versión, lease, intentos y derivado único. Mantener coordinación
  con limpieza de StorageOperation: no borrar una fuente reclamada por worker.
- Retención propuesta: fuente de tarea final durante 7 días para diagnóstico y
  reintento; limpieza de temporales después de expiración de URL + gracia actual.
  Finalizar retención con backend; cancelación y borrado deben limpiar derivados
  huérfanos sin borrar assets referenciados. Reconciliar caída entre escritura
  R2 y commit; impedir registro doble o completar tras cancelación.
- CORS del navegador conserva PUT para subida y GET/HEAD para visor. La
  conversión servidor-R2 no necesita nuevos permisos CORS de navegador. Revisar
  AllowedOrigins reales y delivery del GLB con MIME correcto.
- Coste: un worker adicional, CPU/RAM/disco temporal acotados, operaciones R2,
  fuente más derivado durante retención y migración de base de datos. Medir
  duración/coste con fixtures representativas antes de habilitar en producción.

## Geometría, material y límites

- STL no aporta unidades/eje fiables. No deducirlos por la caja envolvente ni
  aplicar PCA: puede girar un edificio válido. Convertir las unidades elegidas
  a metros mediante un único factor uniforme; rotar Z-up a Y-up con rotación
  rígida que preserve lateralidad. Conservar las proporciones originales.
- Centrar X/Z y llevar la cota inferior a Y=0 después de la rotación. Guardar
  caja original/resultante, unidades, matriz y versión de conversión. El encuadre
  usa la caja del GLB y la cámara del visor, sin reescalar cada eje para llenar UI.
- Material propuesto: PBR opaco gris cálido, baseColorFactor
  `[0.72, 0.70, 0.66, 1]`, metallicFactor 0, roughnessFactor 0.85. Aplicarlo a
  STL sin color reconocido; documentar la variante de color admitida, preservar
  color reconocido y advertir ante codificaciones ambiguas. No alterar GLB nativo.
- Recalcular normales finitas cuando falten o sean inválidas. Rechazar geometría
  vacía, NaN/Infinity, sin área útil y archivos truncados. Permitir superficies
  abiertas arquitectónicas; no exigir watertight ni rellenar agujeros en silencio.
- Límites iniciales propuestos (deben medirse y hacerse autoritativos en backend):
  fuente STL 50 MiB, 1 millón de triángulos, derivado GLB 100 MiB como máximo
  sujeto al límite configurado, worker 1 GiB RAM/120 s/512 MiB disco temporal,
  concurrencia inicial 1. Rechazar con explicación; no simplificar ni deformar
  automáticamente. Tamaño comprimido o cabecera válida no garantiza coste seguro.
- Validar conteo binario antes de reservar memoria (incluyendo header que empiece
  con `solid`), parser ASCII con lectura acotada y límites geométricos. La lectura
  actual de 64 bytes es insuficiente incluso para el contador STL binario.
- Verificar GLB de salida estructuralmente, buffers/rangos/índices y límites;
  sin referencias externas. Mostrar advertencia de tamaño antes de activar un
  modelo grande; conservar importación lazy y carga explícita del visor.

## Implementación Angular posterior al contrato

- Extender selección/política únicamente para STL autorizado por backend, sin
  renombrar STL como GLB ni falsificar MIME. Mantener rechazos OBJ/3MF/GLTF.
- Extender MediaUpload y ProjectUploadQueue con conversión pendiente, consulta
  cancelable, restauración por id, errores/reintento y bloqueo de asociación
  prematura. Serialización inicial evita múltiples conversiones desde la cola.
- Presentar opciones junto al archivo, estado por fase y progreso real de subida;
  navegación no debe perder la tarea backend. Revisar archivo grande antes de PUT.
- El selector MODEL_3D sigue aceptando el GLB resultante. El visor público sigue
  recibiendo exclusivamente GLB confirmado y sus proporciones normalizadas.
- No modificar otras secciones, layouts ni reglas de publicación. No añadir
  Three.js ni un parser STL al bundle. Cambios visuales limitados al flujo 3D.

## Pruebas de aceptación pendientes de implementación

| Área               | Casos obligatorios                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conversión         | STL ASCII/binario válidos → GLB legible; material por defecto; normales; superficies abiertas; color reconocido y ambiguo                                                                        |
| Escala             | Caja asimétrica 1000×2000×3000 mm → 1×2×3 m antes de permutar ejes; distancias/ratios preservados; Z-up/Y-up; centro y base correctos; coordenadas negativas y extremas                          |
| Archivos inválidos | Vacío, falso STL, binario truncado, contador excesivo, ASCII malformado, NaN/Inf, triángulos degenerados, cabecera `solid` binaria, extensión/MIME conflictivos; OBJ y 3MF rechazados            |
| Límites            | Justo por debajo/en/por encima de bytes y triángulos; salida excesiva; timeout/OOM/disco; UI no bloqueada                                                                                        |
| Tareas             | Confirmación duplicada, polling/reload, reintento, cancelación concurrente, worker caído, lease vencido, sin duplicados ni pérdida por cleanup                                                   |
| R2                 | PUT con headers exactos y sin JWT; URL expirada; tamaño/MIME distintos; staging modificado; fallo de GET/PUT/promoción/registro; fuentes privadas; limpieza de huérfanos                         |
| Asociación         | Solo GLB completado se asocia; fuente y tarea no asociables; asociación fallida reintenta sin reconvertir; mismo resultado tras respuesta perdida                                                |
| Visualización      | Navegador real/WebGL: GLB convertido carga, encuadre completo móvil/escritorio, material visible, giro/zoom; error y reintento; sin descarga/import del visor antes de activación ni durante SSR |
| Regresión GLB      | Bytes/material/transform intactos, confirmación 200, límites vigentes, headers firmados, cancelación y asociación existentes, MODEL_3D y restantes secciones sin cambios                         |

No existen aún pruebas de conversión: requieren la implementación aprobada del
worker. Las pruebas GLB existentes siguen siendo la referencia de regresión;
no sustituir fixtures reales convertidas por mocks que solo anuncien éxito.

## Condición para continuar

AGENTS.md exige documentar el problema de contrato y solicitar aprobación antes
de modificar backend. Se requiere autorización para cambios en FastAPI, migración,
worker y adaptadores de almacenamiento; después se implementará la integración
Angular y la matriz de pruebas. No se marca una fase como completada ni se
habilita STL en el frontend mientras el backend siga rechazándolo.
