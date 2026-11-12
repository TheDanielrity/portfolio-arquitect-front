# Demo: Netlify + Render

## Filtros, servicios, contacto y WhatsApp

- Commit `442e614`: el índice conserva sus filas durante el filtrado y omite el
  aviso de actualización cuando ya tiene datos. Mantiene la carga inicial y
  `aria-busy`; categorías deshabilitadas hasta completar la petición, también
  protegidas en el manejador. Se añadió prueba de este comportamiento.
- Validaciones: 34 pruebas de UI, lint, formato, TypeScript, build Netlify y
  validación local del adaptador/SSR correctos. Deploy
  `6af5185903ed984e9ba34b54` listo en Netlify.
- Datos guardados mediante la API: perfil público de Kepmil Quispe, correo
  confirmado, biografía de demostración y tres servicios visibles (Modelado
  tridimensional, Visualización de proyectos, Modelos 3D interactivos). Formulario
  de contacto habilitado.
- WhatsApp activado mediante el enlace social visible existente, con el número
  confirmado por el usuario y mensaje inicial. No se añadió un campo backend.
- Home HTTPS verificada con servicios, correo y enlace WhatsApp en HTML SSR.
  Las secciones Servicios y Contacto pertenecen a la home; no se crearon rutas.

## Modelo local y ficha demo completada

- Fuente local utilizada: `C:/Users/DANIEL/Downloads/MODELO PRUEBAAAA 2.stl`
  (24989184 bytes). Se usaron el conversor STL y la compresión Meshopt existentes
  de la aplicación, conservando coordenadas y 499782 triángulos. GLB resultante:
  13012092 bytes. No se modificaron originales, backend ni código Angular.
- Modelo subido directamente a R2 mediante autorización presignada y confirmado
  por el backend. Vinculado con rol MODEL y sección MODEL_3D al proyecto existente.
  Sigue habiendo exactamente un proyecto público.
- Ficha actualizada a `Estudio de figura · Modelo digital`, manteniendo el slug
  `estudio-de-concreto-demo`. Incluye categoría, tres etiquetas, nueve atributos,
  cuatro secciones, texto descriptivo y SEO. Año y cliente se identifican como
  contexto de demostración digital; la portada se declara referencial.
- La inspección visual en Chrome identifica una figura humana. La categoría
  final es Modelado 3D; descripción y secciones se ajustaron a ese contenido,
  sin presentarlo como una maqueta arquitectónica ni atribuir autoría del STL.
- El STL no declara unidades físicas. `area_m2` permanece nulo y la ficha explica
  por qué no se puede derivar una superficie construida. Ubicación identificada
  como estudio digital sin emplazamiento. No se inventaron datos de obra real.
- Chrome real sin ventana visible: visor cargado, estado de carga finalizado,
  499782 triángulos y dimensiones `43,981 × 65,335 × 115 u`; sin desbordamiento
  horizontal a 1440 px. Captura local `.tools/neon-model-viewer.png`.
- Las sesiones utilizadas para completar el contenido se cerraron con logout.

## Administrador y único proyecto de demostración

- Administrador solicitado creado mediante el provisionamiento existente del
  backend. Contraseña aleatoria guardada exclusivamente en
  `.tools/neon-admin-credentials.json`, fuera de Git; no se imprime ni se incluye
  en esta documentación.
- Login mediante el gateway Netlify verificado; sesión de provisionamiento
  cerrada mediante logout. No se cambió código ni se omitieron reglas del backend.
- Se creó y publicó exactamente un proyecto, `estudio-de-concreto-demo`, marcado
  como destacado. Contenido identificado como demostración, sin atribuir una obra
  real al administrador. Portada: el asset existente
  `public/images/foundation-study.jpg`.
- Portada autorizada por el backend, PUT directo a R2 con los headers firmados
  exactos, confirmación completada y portada asignada antes de publicar.
- Verificado: listado público con `total: 1`; home, `/projects` y
  `/projects/estudio-de-concreto-demo` responden 200 con el proyecto en el HTML
  SSR. Imagen pública: 200, `image/jpeg`, 200833 bytes, CORS con el origen exacto
  Netlify. Esta comprobación confirma lectura pública de R2, pero no sustituye
  una prueba de preflight PUT desde navegador.

## Gateway Netlify verificado después del nuevo despliegue

- Deploy Netlify `6af51118d2f8b6213289ccc7`: `ready`.
- Verificación HTTPS en `https://portfolio-arquitect.netlify.app`: `/healthz`,
  `/api/v1/health`, `/api/v1/public/projects`, `/` y `/admin/login` responden 200.
  El listado devuelve `items: []` y `total: 0`, coherente con la demo vacía.
- Las cinco respuestas incluyen `X-Robots-Tag: noindex, nofollow` y
  `Cache-Control: no-store`. Queda confirmada la conexión Netlify → Render → Neon
  y la activación de las variables tras desplegar de nuevo. El 502 anterior se
  resolvió.
- No se verificaron todavía login, refresh/logout, publicación ni subida a R2.
  Siguen pendientes el administrador de la base vacía y la configuración CORS
  del bucket. No se afirma completada la migración de todos los flujos.

## API desplegada y verificada

- El usuario aprobó aplicar el plan de API con Neon. Render creó el servicio
  `srv-dbqgt7dbedkc73diskh0`, `portfolio-arquitect-api-kbq3`, plan `free`,
  Virginia. [Panel](https://dashboard.render.com/web/srv-dbqgt7dbedkc73diskh0).
- Deploy `dep-dbqgt7tbedkc73dismeg`: `live`, commit backend
  `b76e92f7ba9890551dd84c6afeed84281ed8df03`. Build correcto; Alembic aplicó
  las migraciones existentes antes de arrancar la API. No se creó PostgreSQL
  en Render: utiliza Neon y las credenciales R2 del `.env` privado.
- API: `https://portfolio-arquitect-api-kbq3.onrender.com`.
  Verificaciones HTTPS: `/api/v1/health` devuelve 200 y `{"status":"ok"}`;
  `/api/v1/public/projects` devuelve 200; `/api/v1/auth/me` sin sesión devuelve
  401. OpenAPI accesible. CORS devuelve el origen exacto Netlify.
- Netlify: `/healthz` devuelve 200; `/api/v1/public/projects` devuelve 502.
  El intento de guardar `UPSTREAM_API_BASE_URL` mediante el conector devuelve
  403. Configurar desde su panel, en Functions para producción:
  `UPSTREAM_API_BASE_URL=https://portfolio-arquitect-api-kbq3.onrender.com/api/v1`
  y `DISABLE_INDEXING=true`. Volver a desplegar y verificar el gateway y SSR.
- R2: la consulta CORS con las credenciales actuales devuelve `AccessDenied`.
  No se modificaron las reglas. Desde Cloudflare, conservar orígenes existentes
  y autorizar `https://portfolio-arquitect.netlify.app` para GET/HEAD/PUT,
  headers del flujo presignado (la regla propuesta permite `*`), exponiendo
  ETag. Las credenciales de objetos no necesariamente permiten administrar CORS.
- Pendientes: configuración Netlify, CORS R2, creación del administrador en la
  base vacía, login/refresh/logout y prueba real de subida/confirmación. La
  migración completa aún no está validada. Railway sigue intacto.
- Blueprint y autodeploy siguen desactivados. `paused` en el Blueprint expresa
  `autoSync=false`; la API está `live` y no está suspendida.

## Plan actualizado: API en Render y base en Neon

- Blueprint actualizado publicado en `main`, commit
  `9c86a5d37a433b08f3c64ce1f615d8fef59a3ae6`.
- Render terminó la planificación con `planned`, sin avisos. El
  [nuevo plan](https://dashboard.render.com/blueprint/exs-dbqgkbjbc2fs73db6aag/sync/exe-dbqgsirbc2fs73dbqn90)
  contiene una sola acción: crear `portfolio-arquitect-api-kbq3`, plan gratuito,
  región Virginia, desde el repositorio backend. No crea PostgreSQL ni elimina
  recursos. Sustituye los planes anteriores de este documento.
- Requiere al aplicar `DATABASE_URL` de Neon y las cuatro variables R2, ya
  presentes en el `.env` privado del backend. No se publican esos valores.
- Estado: pendiente de aprobación del plan revisado. No se ha desplegado la API.
  Se aplicarán las migraciones existentes antes de abrir el puerto HTTP.
- Validación: esquema JSON oficial y Prettier correctos. No cambió código de
  Angular ni del backend. Netlify informa un despliegue `ready`; falta comprobar
  la integración con la API cuando Render esté disponible.

## Neon vinculado: sustituye el plan PostgreSQL anterior

- Proyecto `polished-dream-55934092`, organización
  `org-still-voice-16581451`, rama `production`
  (`br-autumn-flower-b6qou0te`). Vinculación realizada con la CLI oficial
  Neon 9.4.0 y `neon init -y --agent codex` en el backend local.
- Conexiones escritas únicamente en `../backend/.env`. `DATABASE_URL` usa la
  conexión directa con esquema `postgresql+psycopg`, compatible con Settings y
  Alembic. Se conservan `DATABASE_URL_UNPOOLED` y `DATABASE_URL_POOLED`, con TLS
  y parámetros entregados por Neon. No copiar estas variables al frontend.
- Configuración previa conservada en la copia privada
  `../backend/.env.before-neon`; las demás variables originales, incluidas R2,
  se verificaron sin cambios. Ambos archivos están excluidos por el `.gitignore`
  del backend.
- Validación real: Settings correcto y `SELECT 1` exitoso mediante SQLAlchemy
  async/Psycopg del entorno `.venv`. No se aplicaron migraciones ni se cambiaron
  datos remotos.
- Neon init instaló el plugin `neon-postgres` para Codex y generó `.neon`,
  `neon.ts` y sus herramientas npm en el backend. Reiniciar el agente para cargar
  las herramientas nuevas. No se añadieron dependencias Angular ni Python.
- `render.yaml` local ya no declara PostgreSQL en Render: pide `DATABASE_URL`
  como variable privada. Este cambio todavía no está publicado ni replanificado.
  **No aprobar el plan Render anterior**, que crearía la base gratuita de 30 días.
  Antes de desplegar, publicar el Blueprint actualizado, replanificar y revisar
  el plan de API únicamente, suministrando la conexión directa de Neon.

## Blueprint del backend listo para aprobación

- `render.yaml` publicado en el frontend, commit
  `3823e745d0a523234a00846cfcd7b0afa52f9205`. Declara infraestructura; el código
  de la API se obtiene de `TheDanielrity/portfolio-arquitect-back`, rama `main`.
  El repositorio backend no se modificó.
- Validación contra el esquema JSON oficial de Render: correcta. CLI Render
  no instalada; la planificación remota también finalizó correctamente, sin
  avisos. No se ejecutaron pruebas Angular porque no cambió su código.
- Blueprint: `exs-dbqgkbjbc2fs73db6aag`, sincronización automática desactivada.
  [Plan para revisar](https://dashboard.render.com/blueprint/exs-dbqgkbjbc2fs73db6aag/sync/exe-dbqgkbrbc2fs73db6b3g).
- El plan creará `portfolio-arquitect-api-kbq3` y PostgreSQL 17
  `portfolio-arquitect-db-kbq3`, ambos gratuitos en Virginia. La base no admite
  conexiones externas. Todavía no se ha aprobado ni aplicado el plan.
- Para esta demo gratuita se ejecutará Alembic antes de abrir el puerto HTTP,
  con una sola instancia. Un fallo aborta el arranque. El comando adapta el
  esquema de la URL privada a `postgresql+psycopg` y obtiene `MEDIA_BASE_URL`
  de `RENDER_EXTERNAL_URL`. No se imprimen credenciales.
- Las credenciales R2 existen en `../backend/.env`; no se copian a Git ni se
  documentan sus valores. Render las requiere al aprobar el plan. JWT se genera
  nuevo en Render. Confirmar CORS del bucket para el origen Netlify antes de
  validar subidas. La base vacía todavía necesitará un usuario administrador.

## Conexiones restablecidas y aprovisionamiento inicial

- Netlify: conexión confirmada con GitHub `TheDanielrity`, equipo
  `thedanielrity` (`614806e79fd22954017af855`). La consulta inicial no encontró
  proyectos. Se creó `portfolio-arquitect`, ID
  `9da922e2-825b-4d0a-a3b2-334ae6bc467d`.
  Panel: <https://app.netlify.com/projects/portfolio-arquitect>.
  Origen previsto: `https://portfolio-arquitect.netlify.app`; todavía no hay
  despliegue de la aplicación.
- El intento de crear `DISABLE_INDEXING=true` en el ámbito Functions devolvió
  `403`. No considerar esta variable configurada. El plugin disponible tampoco
  expone operaciones para vincular GitHub o iniciar builds/despliegues.
- Render: conexión confirmada. El usuario autorizó `Daniel's workspace`, ID
  `tea-dbqgdjk9v7es73ch6qr0`. Las consultas no encontraron servicios ni bases
  PostgreSQL. Todavía no se crearon recursos Render.
- El usuario eligió una demo con base vacía, sin restaurar datos de Railway.
  Sigue pendiente identificar la ubicación segura de las credenciales R2.
- Próximo paso Netlify: vincular el repositorio frontend desde el panel del
  proyecto existente, rama `main`, respetando `netlify.toml`. Configurar
  `DISABLE_INDEXING=true` para Functions antes de publicar y añadir
  `UPSTREAM_API_BASE_URL` cuando exista el backend Render.
- Próximo paso Render: resolver la configuración R2 y preparar el servicio y
  PostgreSQL. Si se utiliza el plan gratuito, acordar la ejecución de Alembic
  antes de servir tráfico: el flujo documentado usa pre-deploy. La base gratuita
  caduca a los 30 días; no se ha contratado ningún plan de pago.

Railway continúa intacto. No se modificó código del backend ni se ejecutaron
migraciones. Las validaciones de código indicadas más abajo corresponden a la
preparación anterior, no a un despliegue alojado verificado.

## Comprobación de conexiones — 2026-11-11

- GitHub: acceso de lectura confirmado con `git ls-remote` en ambos repositorios.
  `main` del frontend: `c4b4ae3b6c31f706a7dd562700c0a89e3c0bfe1f`,
  coincidente con el checkout local. `main` del backend:
  `b76e92f7ba9890551dd84c6afeed84281ed8df03`.
- Netlify: la consulta del usuario autenticado falla con `Unknown tool`
  (`netlify.netlify-user-get-user`).
- Render: la consulta de workspaces falla con `Unknown tool`
  (`render.list_workspaces`).
- No se encontraron las CLI `netlify` o `render` en PATH, ni las variables
  `NETLIFY_AUTH_TOKEN` o `RENDER_API_KEY` en el proceso actual.
- Pendiente: restablecer las conexiones de Netlify y Render, consultar las
  cuentas y recursos existentes e identificar el workspace de Render antes
  de aprovisionar. El acceso Git local no confirma la autorización GitHub
  de los proveedores de hosting.

Esta comprobación no creó servicios, no desplegó aplicaciones, no transfirió
datos y no modificó Railway ni el repositorio backend.

## Alcance y estado

Migración solicitada desde Railway, con frontend Angular SSR en Netlify,
backend FastAPI y PostgreSQL en Render y archivos en Cloudflare R2.
Se creó el proyecto Netlify indicado arriba; aún no hay aplicación desplegada
ni recursos Render. Mantener Railway operativo
hasta verificar la nueva demo. No se cambia el estado de las fases de `PLANS.md`.

Repositorios:

- Frontend: https://github.com/TheDanielrity/portfolio-arquitect-front
- Backend: https://github.com/TheDanielrity/portfolio-arquitect-back

Ambos repositorios recibieron su primer commit en `main`. El frontend se publicó
desde este directorio. El backend se publicó desde una copia aislada en `.tools`,
con 141 archivos de código/documentación idénticos a los originales y un
`.env.example` saneado por separado. No se copiaron `.env`, bases, archivos de
medios, entornos virtuales ni credenciales. La carpeta backend original sigue
intacta. No se han ejecutado pruebas del backend como parte de esta publicación
sin cambios de código.

Validación frontend: 651 pruebas Angular y 15 pruebas del proxy pasan; también
lint, formato, TypeScript, build Netlify, hooks del adaptador y render SSR local.
El build Node y su prueba de gateway también pasan. No se han añadido rutas de
pantallas ni endpoints del backend: se conserva el prefijo existente `/api/v1`.
Única dependencia añadida: `@netlify/angular-runtime` 4.0.0, de desarrollo.

El backend se inspeccionó en modo lectura: requiere Python >=3.12,
PostgreSQL con Psycopg y variables validadas en `app/core/config.py`.
Su publicación y configuración se realizan por separado; este cambio no modifica
su código ni copia secretos al frontend.

## Netlify

Importar el repositorio frontend desde GitHub. Usar la raíz del repositorio,
la rama `main` y la configuración versionada en `netlify.toml`:

- Node 24.20.0 y npm 11.19.0.
- Build: `npm run build:netlify`.
- Publicación: `dist/architecture-portfolio/browser`.
- Adaptador SSR: `@netlify/angular-runtime` 4.0.0.

Variables del servicio, disponibles en el ámbito Functions:

| Variable                | Valor                                        |
| ----------------------- | -------------------------------------------- |
| `UPSTREAM_API_BASE_URL` | `https://NOMBRE-BACKEND.onrender.com/api/v1` |
| `DISABLE_INDEXING`      | `true` mientras sea una demo de pruebas      |

No configurar `API_BASE_URL` en Netlify. La versión Netlify utiliza `/api/v1`
en el navegador y resuelve ese mismo path contra el origen de la petición en SSR.
El dominio concreto no se incrusta en los bundles.

`src/server.netlify.ts` exporta el handler Web compatible con el adaptador.
Gestiona SSR, el shell cliente administrativo, `/healthz`, controles de indexación
y `/api/v1`. El proxy solo llama al backend configurado, conserva errores,
validación y redirecciones, y no sigue redirecciones R2 con Authorization.
Los PUT R2 continúan directamente desde el navegador.

No agregar una redirección global hacia `index.html`. Las respuestas dinámicas
usan `no-store`, incluido el control de caché CDN de Netlify; las rutas admin
reciben `noindex` incluso cuando se permita indexar el portfolio.

El build Node existente continúa con `npm run build` y `npm run serve:ssr`.
La entrada por defecto en las opciones Angular permite que el prebuild de
Netlify detecte el handler; las configuraciones development y production
seleccionan explícitamente el servidor Node, y production,netlify selecciona
el handler de Netlify. No ejecutar dos builds a la vez sobre el mismo `dist`.

## Render

Importar el repositorio backend como Web Service con runtime Python, sin Docker.
Comprobar primero que el repositorio remoto contiene el código completo:
el directorio backend local no se publica como parte del push del frontend.

- Build: `python -m pip install .`.
- Migración previa al arranque: `python -m alembic upgrade head`.
- Start: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Healthcheck: `/api/v1/health`.

El comando previo de migración requiere un plan con soporte para pre-deploy;
si el plan elegido no lo ofrece, acordar y ejecutar la migración antes de
habilitar el tráfico, en lugar de omitirla. Elegir una versión Python >=3.12
compatible con el backend y comprobarla durante el despliegue.

Crear o seleccionar PostgreSQL. No reutilizar la base local del propietario.
Para conservar datos de Railway, preparar una copia de seguridad y una
restauración controlada en Render antes del cambio de tráfico. Aplicar las
migraciones a una base nueva no transfiere los proyectos existentes.

| Variable               | Configuración del backend                                 |
| ---------------------- | --------------------------------------------------------- |
| `APP_ENV`              | `production`                                              |
| `DEBUG`                | `false`                                                   |
| `DATABASE_URL`         | URL privada de Render con esquema `postgresql+psycopg://` |
| `JWT_SECRET_KEY`       | Secreto aleatorio de al menos 32 bytes, solo en Render    |
| `CORS_ORIGINS`         | Lista JSON con el origen HTTPS definitivo de Netlify      |
| `STORAGE_PROVIDER`     | `r2`                                                      |
| `MEDIA_BASE_URL`       | Origen HTTPS público del backend en Render                |
| `R2_ACCOUNT_ID`        | ID de la cuenta Cloudflare                                |
| `R2_ACCESS_KEY_ID`     | Credencial autorizada del bucket                          |
| `R2_SECRET_ACCESS_KEY` | Secreto autorizado del bucket                             |
| `R2_BUCKET_NAME`       | Bucket correspondiente a los datos de la demo             |

Render proporciona una URL PostgreSQL que debe adaptarse al esquema exigido por
el backend. Conservar host, usuario, contraseña y base; cambiar solo el esquema.
No pegar esta URL en Git, en Angular ni en el chat. Mantener `R2_PUBLIC_BASE_URL`
vacío para conservar la entrega mediante autorizaciones del backend.

Conservar la correspondencia entre registros de PostgreSQL y objetos R2. No
crear un bucket vacío y esperar que contenga los archivos referenciados por una
base restaurada. No eliminar servicios, bases ni buckets anteriores durante la
preparación.

Actualizar el CORS del bucket para incluir el origen exacto de Netlify y los
métodos/headers del flujo existente, conservando los orígenes todavía en uso.
No usar un origen comodín para habilitar previews administrativas. Un dominio
de preview requiere autorización explícita tanto en backend como en R2.

## Validación

```bash
npm ci
npm test
npm run test:netlify
npm run lint
npm run format:check
npm run typecheck
npm run build:netlify
npm run validate:netlify
```

`test:netlify` comprueba el proxy con peticiones sintéticas sin secretos.
`validate:netlify` ejecuta los hooks del adaptador y el handler compilado
localmente. Verifica SSR público con fallback cuando la API no está configurada,
login, shell admin sin contenido privado, no-store, noindex, health y error 502.
No sustituye una prueba del runtime Deno alojado ni una integración con Render.

Antes de anunciar la demo, comprobar en los servicios reales:

1. Health de Render y `/healthz` de Netlify.
2. Home y proyectos con contenido real en el HTML SSR e hidratación correcta.
3. Acceso directo y recarga en listado, detalle y `/admin/login`.
4. Login, restauración/refresh de sesión y logout.
5. Subida sintética con PUT directo a R2, confirmación y preview privada.
6. Lectura pública de medios y carga diferida de modelos GLB.
7. Ausencia de Authorization en las consultas públicas y hacia R2.
8. Datos y archivos esperados presentes antes de retirar Railway.

## Referencias oficiales

- [Angular en Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/angular/).
- [Handler SSR de Netlify](https://github.com/netlify/framework-adapters/tree/main/packages/angular-runtime).
- [FastAPI en Render](https://render.com/docs/deploy-fastapi).
- [Migraciones antes del despliegue](https://render.com/docs/deploys#pre-deploy-command).
- [PostgreSQL en Render](https://render.com/docs/postgresql).
