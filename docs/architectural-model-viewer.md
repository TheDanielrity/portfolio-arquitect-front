# Visor de maquetas arquitectónicas y STL → GLB

## Compresión de las nuevas conversiones STL

Se añade `meshoptimizer@1.3.0`, fijado en package-lock, para codificar geometría
sin implementar un compresor propio. El encoder se importa dinámicamente dentro
del worker después de convertir el STL. Se usa EXT_meshopt_compression con versión
de bitstream 0 y filtro NONE: no hay simplificación, cuantización adicional,
reordenación de triángulos ni cambio de posiciones, normales, orientación o material.
Si el resultado no ahorra espacio se conserva el GLB original. GLB nativo mantiene
su flujo de subida y sus bytes. El porcentaje llega a 100 después de comprimir.

Continúan el límite de entrada/salida de 100 MiB y el plazo de 60 segundos del
worker, su terminación al cancelar y sus errores/reintentos. Se conserva también
la validación del límite autorizado por FastAPI antes del PUT. La compresión no
permite modelos que superasen el presupuesto de geometría del conversor original.
Su memoria no es constante: conserva el GLB y los buffers temporales del encoder;
el worker evita bloquear la interfaz, pero no garantiza convertir archivos máximos
en dispositivos con poca memoria.

El visor configura el decoder antes de crear el elemento. Se sirve localmente
en `public/assets/meshopt/decoder-1.3.0.js`, con licencia MIT incluida. Es una copia
sin editar del paquete, excluida de formato; para regenerarla:

```text
node scripts/sync-model-decoder.mjs
```

No requiere cambios de FastAPI, PostgreSQL, OpenAPI ni política de R2. Sigue siendo
un GLB binario, con su tamaño comprimido real en presign → PUT → confirmación →
asociación. No se añaden formatos de entrada. Los visores externos que descarguen
el GLB comprimido deben admitir EXT_meshopt_compression.

### Comparación con el archivo real

Se descargó una copia pública del modelo pesado sin modificarlo. La compresión
pasó de 93.525.512 a 47.996.384 bytes (48,68 % menos). El script comprobó igualdad
byte a byte de cada buffer de geometría después de decodificar. La copia preparada
está en `.tools/model-optimized.glb`. Tras la aprobación del usuario se sustituyó
la asociación de la sección `e0e71e4b-2701-4211-ba71-02e9aaa82ce9` del proyecto
`project-test`: el nuevo asset es `ae553210-f6ae-4e62-9bbf-48ae1f719d5b` y se conserva
el original `3d433f2e-2a26-4250-956d-47906150a9e4`. Los snapshots para revertir están
en `.tools/model-replacement-*.json`. No se cambiaron los textos, el orden, la
visibilidad ni las demás secciones. Se verificaron hash SHA-256 de la descarga,
asociación pública y CORS para el origen LAN. Chrome con viewport móvil y CPU 4x
cargó el nuevo UUID desde R2 sin sustitución de respuestas ni caché; no equivale
a validar el Galaxy A35 físico.

```text
node scripts/compress-portfolio-glb.mjs input.glb output.glb
```

La utilidad admite únicamente el layout conocido del conversor STL; no intenta
reescribir GLB arbitrarios. Conserva el archivo de entrada y verifica el round-trip.
Una prueba Chrome con viewport móvil y CPU 4x abrió la copia comprimida mediante
sustitución local de respuesta CDP. Esa prueba valida visualización y decoder,
no mide transferencia real de R2 ni representa el Galaxy A35 físico. El peso baja;
la geometría en memoria y los casi dos millones de triángulos permanecen iguales.

Validación: 628 pruebas aprobadas, lint, TypeScript, formato, build y SSR correctos.
`node scripts/model-compression-r2-smoke.mjs` verificó un GLB comprimido temporal
con presign, headers firmados intactos, PUT real R2, confirmación y descarga idéntica;
el asset temporal se eliminó. La prueba completa de editor en Chrome se bloqueó
antes de subir; se detuvo su proceso y se eliminaron su proyecto de prueba y asset.
No se atribuye éxito a esa prueba de extremo a extremo.

Referencias: [API del encoder](https://github.com/zeux/meshoptimizer/blob/master/js/README.md)
y [especificación EXT_meshopt_compression](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md).

## Primera optimización móvil: medición y carga por proximidad

Cada sección observa su proximidad al viewport con IntersectionObserver (margen
de 200 px). El visor y su GLB se activan automáticamente al acercarse; no existe
un botón de activación. Sin IntersectionObserver se mantiene la activación
automática como alternativa. SSR no crea observadores ni importa el visor.

ModelLoadQueue coordina una sola carga a la vez. El turno se libera al cargar,
fallar, superar el plazo, reemplazar el asset o destruir la sección. Se retiran
las secciones pendientes al destruirlas. Los modelos ya cargados permanecen
disponibles: esto limita las cargas simultáneas, no la memoria total de todos los
modelos visitados. No se alteran archivos, geometría, materiales ni contratos.

Medición reproducible y de solo lectura:

```powershell
$env:MODEL_AUDIT_URL='http://localhost:4200/projects/project-test'
node scripts/measure-model-loading.mjs
$env:MODEL_AUDIT_MOBILE='0'
node scripts/measure-model-loading.mjs
```

El script inicia y cierra su propio Chrome, conserva el servidor existente,
desactiva caché y guarda JSON y captura en `.tools/model-loading-*/`. No imprime
URLs firmadas ni modifica proyectos. Por defecto usa viewport móvil y CPU 4x
más lenta con GPU software: no equivale al Galaxy A35 físico. Se informan bytes
transferidos, espera del servidor, descarga y tiempo posterior hasta `load`.
Este último incluye preparación y otros recursos del visor; no es una medición
aislada del tiempo de GPU. No se usa `progress` para inventar tiempos de descarga.

En la prueba con tres secciones, ninguna activó el visor antes de acercarse.
Se detectaron GLB de aproximadamente 24 MB y 94 MB. En una muestra móvil emulada,
el de 94 MB tardó 3,45 s desde la petición hasta completar la descarga y otros
7,06 s hasta `load`. No son tiempos garantizados ni una comparación controlada
antes/después en el teléfono. La prueba física sigue pendiente.

Compresión investigada: model-viewer 4.4 admite EXT_meshopt_compression, pero su
cargador instalado configura el decodificador solo si se proporciona su ubicación.
Fuentes: [carga de model-viewer](https://modelviewer.dev/examples/loading/) y
[documentación](https://modelviewer.dev/docs/index.html). Una integración posterior
necesita un encoder mantenido en el worker y un decoder servido por la aplicación;
no basta con agregar el nombre de la extensión. Debe probar round-trip de los
atributos originales, escala, orientación, material, cancelación, memoria máxima,
tamaño final y tiempo de decodificación. No se ha añadido dependencia ni compresión
automática en este primer paso, ni se han reemplazado los modelos publicados.

Validación de esta optimización: 624 pruebas aprobadas, incluidos proximidad,
notificaciones tardías, cancelación y orden de la cola; lint, formato de archivos
modificados, TypeScript, build de producción y validación SSR correctos. Se mantienen
los endpoints y el flujo de R2. La muestra de escritorio del mismo modelo midió
5,51 s de descarga y 0,96 s posteriores hasta `load`; la variación de red impide
comparar esas descargas como una mejora porcentual.

Implementación frontend, 2026-10-27. Sustituye la propuesta anterior de worker
backend por petición explícita del usuario. No modifica FastAPI, PostgreSQL,
OpenAPI, políticas remotas de R2, autenticación ni el diseño administrativo.

## Uso y flujo

En el editor de proyectos, Secciones → Modelo 3D → Subir archivo permite elegir
GLB o STL. Se añadió MODEL_3D a los tipos que se pueden crear (antes solo texto
y galería); los tipos de las secciones existentes se conservan.

STL ASCII/binario → Web Worker → GLB real → presign existente → PUT directo a R2
→ confirmación existente → seleccionar asset confirmado → aceptar sección →
guardar proyecto. La cola general también reconoce la fuente STL como modelo,
sin habilitar archivos no fotográficos en la pestaña de fotografías.

Solo se solicita autorización para el GLB resultante, con nombre `.glb`, MIME
`model/gltf-binary` y tamaño de los bytes convertidos. Nunca se envía un STL
renombrado ni se solicita a FastAPI aceptar un MIME nuevo. Los headers firmados
se usan intactos, con el cliente existente sin interceptores para R2.

El backend actual permite este resultado GLB sin cambios. Sus límites devueltos
en presign se verifican de nuevo antes del PUT. Un archivo sigue sin estar
disponible hasta que la confirmación responde correctamente. La asociación usa
los servicios existentes, incluida la sesión de cambios pendientes del proyecto.
GLB nativo conserva su flujo y bytes, sin pasar por el conversor.

## Conversión, recursos y geometría

- Conversor propio acotado, sin dependencias nuevas. Lee solo STL y escribe GLB
  2 con posiciones, normales, material y buffer binario embebido. No incorpora
  Three.js, parsers genéricos ni exportadores de otros formatos.
- La lectura, parseo, cálculo de normales y serialización ocurren en un Web
  Worker creado cuando se inicia una conversión. El File se clona al worker;
  el ArrayBuffer de salida se transfiere sin copiar por postMessage. No hay
  conversión síncrona de respaldo en el hilo principal.
- Entrada STL máxima: **100 MiB**. Se valida tamaño antes
  de leer el archivo en el worker y número de caras antes de asignar buffers
  binarios. Tiempo máximo: **60 segundos**. Cancelación, destrucción, error y
  timeout terminan el worker. Reintento crea una ejecución nueva.
- GLB de salida se verifica contra **100 MiB**, el límite GLB de UX actual, y
  posteriormente contra el máximo autoritativo de presign. El límite geométrico
  se deriva del tamaño de salida: aproximadamente 2.18 millones de triángulos
  (48 bytes por cara entre posiciones y normales, reservando 64 KiB de metadatos).
  Se mantienen posiciones float32 y todos los triángulos; solo las normales para
  iluminación se codifican como BYTE normalizado con stride de 4 bytes mediante
  KHR_mesh_quantization, admitido por el cargador actual. Esto reduce los buffers
  un tercio frente al conversor original (72 bytes/cara), sin decimar ni cuantizar
  posiciones. Un STL binario de casi 100 MiB y 2 097 150 caras produce un GLB de
  aproximadamente 96 MiB. Sigue verificándose el tamaño real antes de presign.
  El error de cuantización por componente de normal es como máximo 1/254;
  afecta ligeramente a iluminación, no a geometría, dimensiones u orientación.
  [Especificación Khronos](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_mesh_quantization).
  El parser ASCII
  cuenta caras primero y asigna un Float32Array exacto, evitando un array de
  números JavaScript que crezca con todo el modelo.
- Hay progreso por lectura/procesamiento de triángulos y finalización; ASCII
  permanece inicialmente en 0% hasta completar su parseo. El progreso de PUT
  sigue siendo el XHR real. El editor muestra errores, cancelación y reintento.
- Se conservan coordenadas, proporciones, orientación y origen. No se centra,
  rota, ajusta a caja unitaria, simplifica ni convierte unidades. Se recalculan
  normales de cara para superficies mate con aristas arquitectónicas.
- El GLB usa posiciones float32: decimales se representan con la precisión de
  este formato; geometría colapsada por esa precisión se rechaza. No prometer
  precisión CAD arbitraria ni validez topológica de un sólido.
- Material de STL sin color: blanco cálido, opaco, doble cara, metalicidad 0,
  rugosidad 0.9. Los GLB nativos conservan sus materiales. No se blanquean
  automáticamente texturas o materiales de archivos existentes.
- Se rechazan vacíos, estructura inválida/truncada, coordenadas no finitas,
  triángulos degenerados y conteos excesivos. Se reconocen STL binarios cuya
  cabecera comienza con `solid`. Se aceptan superficies abiertas válidas.
- Colores binarios STL no estandarizados (atributos/`COLOR=`) se rechazan con
  indicación de exportar GLB; no se descartan silenciosamente. ASCII admite un
  único bloque solid. OBJ, 3MF y GLTF externo siguen rechazados.

## Visor público

Se conserva `@google/model-viewer` 4.4.0, importado automáticamente después del
primer render en navegador. No hay botón «Ver modelo». El módulo y el GLB no se
cargan durante SSR; en navegador arrancan sin un clic adicional. No existe una
escena Three.js paralela.

Las secciones MODEL_3D tienen fondo `#090a09`, cuadrícula de 64 px a baja opacidad,
datos monoespaciados en esquinas y altura de 82svh en escritorio (límites de
560–1100 px); móvil usa 80svh con mínimo de 580 px. Las demás secciones conservan
sus estilos editoriales. Los modelos que aparecen como archivos adicionales
también utilizan el visor, dentro de su disposición editorial existente.

El encuadre proyecta las ocho esquinas de la caja real según la cámara y el
aspecto del visor; calcula una distancia con margen. Se actualiza al cargar,
restablecer, redimensionar o entrar/salir de pantalla completa. Esto cambia solo
la cámara. La iluminación neutral, exposición de 0.45, tone mapping ACES y sombra
suave ayudan a leer las caras del material mate. La exposición se redujo desde
0.7 para evitar que la vista frontal del material blanco pierda relieve. Es un
ajuste de visualización: no modifica los GLB almacenados ni requiere resubirlos.

- **Dimensiones:** `getDimensions()` de la escena cargada, en orden X/Y/Z.
  STL convertido lleva `asset.extras.portfolioStl.units = "unspecified"`; se
  muestran valores en `u` y una nota explícita sin unidad física. GLB nativo
  usa metros conforme a la convención glTF, sin inferir una escala de maqueta.
- **Triángulos:** se recorren los nodos de la escena glTF activa y los conteos
  de accessors de sus primitivas (índices o posiciones); se cuentan instancias
  por nodo y modos TRIANGLES/STRIP/FAN, excluyendo meshes no utilizados. No se
  estima a partir del tamaño del archivo. Instancing GPU no soportado, ciclos
  o información insuficiente muestran `—`. Cuenta primitivas, no caras de CAD.
- **Escala:** no se muestra; el contrato público no aporta una escala de
  maqueta fiable por archivo. Tampoco se deducen centímetros para STL.
- **Modelo de cada sección:** muestra exclusivamente su archivo asociado, sin
  pestañas «Modelo 01/02/03» ni selector global de modelos del proyecto.
  Cambiar el asset de la sección reinicia la carga automáticamente. Un error
  ofrece reintento manual, sin entrar en un bucle de recargas automáticas.
- **Controles:** giro y zoom nativos con mouse/táctil, botones con área mínima
  de 44 px, flechas y PageUp/PageDown, Home para restablecer y foco visible.
  El teclado del host también funciona sin duplicar
  las teclas ya procesadas por los controles internos de model-viewer.
- **Pantalla completa:** Fullscreen API cuando está disponible, con errores
  manejados y salida mediante Esc. El visor vuelve a encuadrar al cambiar tamaño.
- **Errores:** estado de carga, timeout de 60 s, reintento y enlace al GLB. Si
  no hay WebGL 2 se ofrece descargar el archivo para una aplicación externa.

## Validación reproducible

Los fallos de lectura local (`NotReadableError`, permisos, referencias caducadas o
bloqueos del antivirus/DLP) se distinguen de errores de geometría. El worker los
notifica con `FILE_READ_FAILED`; la aplicación muestra instrucciones en español
y ofrece «Volver a seleccionar archivo» en el editor de sección para obtener una
referencia nueva. No repite la conversión con la referencia que falló ni solicita
presign. Un bloqueo DLP externo debe revisarlo el administrador del equipo; estos
cambios no lo evitan. El límite de entrada permanece en 100 MiB.

Validación de esta corrección: 592 pruebas aprobadas, incluyendo lectura local
fallida, traducción del error del worker, liberación de recursos y reapertura del
selector; lint, formato, TypeScript y build correctos. No se reprodujo el software
DLP corporativo de la captura: su bloqueo se simula en las pruebas de lectura.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run build
npm.cmd run validate:ssr
npm.cmd run test:models:browser
```

El smoke de modelos requiere Angular en localhost:4200, backend en localhost:8000,
R2 configurado y credenciales locales ignoradas en `.tools/auth-development.json`.
Admite MODEL_SMOKE_ORIGIN, MODEL_SMOKE_API y MODEL_SMOKE_CHROME. Usa Chrome CDP
existente, sin agregar un framework E2E, y un servidor SSR temporal en puerto 4303.
El import TypeScript nativo del script requiere Node 24 según el entorno del repo.

Solo crea fixtures con identificador único y proyecto UNLISTED. El backend es
quien persiste los datos de prueba: no hay acceso SQL directo ni cambios de
esquema. Finalmente despublica/elimina sus secciones, relaciones, proyecto y
assets y revoca su sesión. El borrado del proyecto conserva la semántica de
soft delete del backend; las operaciones R2 siguen su limpieza diferida habitual.
Las capturas y el informe quedan en `.tools/model-audit-<timestamp>/`.

Pruebas unitarias cubren ASCII/binario, estructura GLB, límites, coordenadas y
proporciones en escalas distintas, normales/material, inválidos, color no estándar,
errores/reintento/cancelación/timeout de worker, presign del resultado, headers R2,
límite devuelto por backend, confirmación y regresión GLB sin conversión. También
cubren métricas reales, escena activa, selección, encuadre, teclado y fallback.

El smoke real verifica bytes en R2 contra el resultado esperado, subida inline y
asociación guardada, GLB nativo, SSR con modelo convertido, carga automática en navegador,
dimensiones/516 triángulos reales, ausencia de pestañas y botón de activación, giro/zoom/restablecimiento, teclado,
mouse, gestos de arrastre/pellizco, pantalla completa, error/reintento y fallback
WebGL. Captura Chrome a 1920, 1440, 768 y 390 px y comprueba desbordamientos.

## Comparación visual y límites conocidos

Validación tras compactar normales para admitir STL de 100 MiB: **592 pruebas en 37 archivos aprobadas**;
lint, formato, TypeScript, build de producción y `validate:ssr` aprobados.
Las pruebas adicionales aceptan exactamente 100 MiB, rechazan un byte más y
convierten el mayor STL binario válido dentro de 100 MiB con 2 097 150 triángulos,
verificando que su GLB sigue dentro del límite, conserva posiciones y utiliza
normales normalizadas correctamente alineadas a 4 bytes.
`test:models:browser` aprobó el recorrido Chrome/FastAPI/R2, incluido SSR del
proyecto temporal con su GLB convertido. El bundle inicial permanece en
338.36 kB brutos; model-viewer continúa en su chunk lazy de aproximadamente
1.04 MB. No se añadieron dependencias, rutas ni endpoints.

Evidencia local de la ejecución final: `.tools/model-audit-1793235290020/`,
con `result.json` y `viewer-1920.png`, `viewer-1440.png`, `viewer-768.png`,
`viewer-390.png`. El informe confirma limpieza del proyecto de prueba mediante
la API; las capturas muestran solo la maqueta temporal. Los artefactos locales
están ignorados por el repositorio y no se publican automáticamente.

Archivos principales creados: `stl-conversion.ts` y sus pruebas en shared/utils;
`stl-converter.ts`, `stl.worker.ts`, `stl-upload.spec.ts` en media;
`model-camera.ts`, `model-statistics.ts`, `model-statistics.spec.ts`,
`public-model.html` y `public-model.scss` en project-detail;
`tsconfig.worker.json`, `scripts/model-browser-smoke.mjs` y este documento.
Se modificaron MediaUpload/política/cola y mensajes de estado, el editor y selector
de tipos de sección, PublicModel y el paso de modelos reales desde ProjectDetail
por el renderer. Angular configura el worker y package.json añade el smoke.
La propuesta anterior se conserva marcada como histórica.

La revisión visual compara el área del visor con la captura del usuario: fondo
casi negro, cuadrícula tenue, maqueta blanca centrada, métricas superiores y
controles inferiores. Por indicación posterior del usuario se eliminaron las
pestañas y se habilitó carga automática del único asset de cada sección. Tras la primera revisión se sustituyó el encuadre por esfera
(dejaba demasiado espacio vacío en escritorio) por el ajuste de cámara a caja.
El control de teclado del host se corrigió al comprobarlo con eventos reales.

La maqueta de QA es un conjunto temporal de volúmenes con 516 triángulos,
dimensiones 60 × 11.4 × 24 sin unidades físicas. No es el edificio de la captura
ni contenido de producción. El nivel de detalle depende de los modelos reales.
Los GLB con material propio pueden conservar color; no se fuerza el blanco.

Un worker evita bloquear la interfaz, pero comparte la memoria del navegador:
no hay un límite duro de RAM portátil entre navegadores. Los topes de bytes,
triángulos, concurrencia de las colas existentes y timeout reducen el consumo,
sin garantizar compatibilidad con todo móvil. Modelos mayores deben exportarse
a GLB o reducirse externamente. No se convierte automáticamente un archivo grande.

El contrato PublicMedia no tiene file_size: no se muestra un peso ficticio.
GLB nativos ya registrados siguen
sujetos a los recursos del dispositivo. No hay decimación ni análisis de coste
GPU en backend. La verificación Chrome usa WebGL mediante SwiftShader y emulación
táctil; no sustituye medir GPU/RAM y gestos en teléfonos físicos o Safari/iOS.

Como STL no declara su eje vertical, se conserva el original. No se intenta
adivinar Y-up/Z-up. Para otra orientación, exportar el modelo correctamente desde
la aplicación de origen. Si se eliminan los extras del GLB convertido fuera del
sistema, se pierde su marca de unidades desconocidas.

Sin dependencias ni rutas nuevas, sin regeneración de tipos API y sin cambios de
estado en PLANS.md: es una ampliación puntual de MODEL_3D, no otra fase completa.
