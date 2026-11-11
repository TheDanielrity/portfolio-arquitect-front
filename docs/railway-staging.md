# Railway: entorno de pruebas

## Actualización desplegada — 2026-11-06

- Proyecto existente `portfolio-staging`, entorno `production`; se conserva la
  separación de la base y el bucket de pruebas respecto a los datos locales.
- Backend SUCCESS: `1b0f4999-ce92-414f-8882-8cedcc4c119d`.
  El pre-deploy ejecutó `0003_single_featured` y el healthcheck respondió 200.
- Frontend SUCCESS: `b91450ce-8a4c-440b-b8db-1c91708c8592`.
  Incluye la estrella de destacado único y el editor sin controles duplicados
  de orden/destacado. El healthcheck respondió 200.
- Se subieron copias limpias del código, sin `.env`, credenciales, dependencias
  locales ni perfiles del navegador. Los hashes están en el manifiesto local
  `.tools/railway-release-1793944615600/manifest.json`.
- Build con los dominios Railway y prueba del gateway pasan; la configuración
  local se restauró sin cambios después del build.
- Comprobación remota: ambos healthchecks, endpoints públicos y contrato OpenAPI
  nuevo correctos; SSR de Home, hidratación y noindex confirmados.
- Chrome: Home, Projects, login, Projects admin, Profile, Services, Settings y
  creación de proyecto funcionan. El editor de publicación solo muestra estado
  y visibilidad. Cero excepciones de ejecución y cero Authorization en consultas
  públicas. PUT directo a R2, confirmación y lectura del archivo sintético pasan.
- No se modificaron versiones de dependencias durante el despliegue. El build
  notificó alertas de npm; `npm audit --omit=dev` local identifica 3 alertas
  transitivas (2 high, 1 moderate: body-parser, zod, qs). Revisarlas y resolverlas
  antes del lanzamiento definitivo; este despliegue sirve para pruebas.
- La CLI advierte que `railway.json` seguirá funcionando hasta 2026-12-01 y
  recomienda migrar a Infrastructure as Code. La migración de infraestructura
  queda pendiente; no se cambió el formato durante esta actualización.
- No se cambia el estado de las fases de `PLANS.md`.

Desplegar tres servicios separados en un proyecto Railway: frontend Angular SSR,
backend FastAPI y PostgreSQL. Usar una base y un bucket R2 de pruebas independientes;
no copiar ni sobrescribir datos del propietario. Phase 13 sigue PENDING.

## Backend (configuración del servicio, sin modificar código)

Conectar el repositorio del backend y seleccionar su directorio raíz. Usar Railpack:

- Build: `python -m venv /app/.venv && /app/.venv/bin/python -m pip install .`
- Pre-deploy: `/app/.venv/bin/alembic upgrade head`
- Start: `/app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Healthcheck: `/api/v1/health`

Generar un dominio público HTTPS. Configurar las variables en Railway:

La copia de despliegue debe incluir `railpack.json` con el contenido de
`docs/railway-backend-railpack.json`. Incluye explícitamente `/app/.venv` desde
el paso de build, porque el plan Python generado excluye ese directorio cuando
el proyecto no usa un gestor de dependencias detectado. Este archivo se agrega
al artefacto de despliegue; el repositorio backend local no se modifica.

| Variable | Valor |
| --- | --- |
| `APP_ENV` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | URL privada de PostgreSQL con esquema `postgresql+psycopg://` |
| `JWT_SECRET_KEY` | Secreto nuevo, aleatorio, de al menos 32 bytes |
| `CORS_ORIGINS` | Lista JSON con el origen HTTPS del frontend |
| `STORAGE_PROVIDER` | `r2` |
| `MEDIA_BASE_URL` | Origen HTTPS público del backend |
| `R2_ACCOUNT_ID` | ID de cuenta Cloudflare |
| `R2_ACCESS_KEY_ID` | Credencial del bucket de pruebas |
| `R2_SECRET_ACCESS_KEY` | Secreto del bucket de pruebas |
| `R2_BUCKET_NAME` | Bucket de pruebas |

La URL estándar `postgresql://` de Railway no satisface la validación actual del
backend: conservar usuario, contraseña, host privado, puerto y base, cambiando
únicamente el esquema a `postgresql+psycopg://`. Usar referencias de variables
del servicio PostgreSQL para evitar copiar credenciales. No publicarlas en Git.

Dejar `R2_PUBLIC_BASE_URL` vacío para conservar el mecanismo existente de entrega.
Configurar CORS del bucket para permitir el origen del frontend y los PUT con
los headers exigidos por las autorizaciones existentes. No hacer público el bucket.
Crear el administrador mediante `python -m app.modules.auth.create_admin` en una
terminal interactiva del servicio; la contraseña se introduce sin mostrarla.

## Frontend

Conectar este repositorio/directorio y generar su dominio público antes del build.
`railway.json` selecciona Railpack, `npm run build:railway`, `npm run serve:ssr`
y `/healthz`. Railway proporciona `PORT`.

| Variable | Valor |
| --- | --- |
| `RAILPACK_NODE_VERSION` | `24.20.0` (versión local utilizada) |
| `API_BASE_URL` | `https://DOMINIO-FRONTEND/api/v1` |
| `UPSTREAM_API_BASE_URL` | `https://DOMINIO-BACKEND/api/v1` (solo servidor) |
| `PUBLIC_SITE_URL` | `https://DOMINIO-FRONTEND` |
| `DISABLE_INDEXING` | `true` para este entorno de pruebas |

`PUBLIC_SITE_URL` puede omitirse si `RAILWAY_PUBLIC_DOMAIN` está disponible al
construir. La URL API apunta al mismo origen del frontend. El servidor Express
reenvía `/api/v1` a `UPSTREAM_API_BASE_URL`, conserva estados y headers necesarios,
no cachea respuestas ni sigue redirecciones con credenciales. Las subidas PUT
continúan directamente a R2. Esto evita que las lecturas de previews por XHR
sean bloqueadas al redirigir de dos orígenes diferentes a R2.
El build incorpora solamente estas URLs públicas, permite el host SSR del sitio
y restaura los archivos fuente originales al finalizar. Al cambiar dominio/API,
reconstruir el frontend y actualizar CORS del backend y R2.

No incluir secretos del backend en este servicio. `.railwayignore` excluye archivos
locales privados y artefactos al subir mediante CLI. Si se usa GitHub, verificar
también sus archivos rastreados antes de publicar: este directorio actualmente no
es un repositorio Git.

## Comprobación después del despliegue

- `/healthz` del frontend y `/api/v1/health` del backend deben responder 200.
- Home, listado y detalle deben funcionar sin sesión, con contenido SSR real.
- Entrar directamente a `/admin/login`, autenticar y revisar Perfil y Proyectos.
- Subir una imagen sintética y verificar PUT R2, confirmación y entrega pública.
- Enviar un contacto sintético claramente identificado y archivar el mensaje.
- Comprobar recarga, navegación y ausencia de Authorization en consultas públicas.
- Verificar `X-Robots-Tag: noindex, nofollow` y `robots.txt` del entorno de pruebas.

Estas comprobaciones remotas requieren desplegar primero los servicios. Los checks
locales no equivalen a haber validado Railway. No se inicia Phase 13.

Referencias: [comandos de Railway](https://docs.railway.com/builds/build-and-start-commands),
[PostgreSQL](https://docs.railway.com/databases/postgresql),
[Node en Railpack](https://railpack.com/languages/node/).

## Estado del primer despliegue (2026-10-13)

- Proyecto: `portfolio-staging` (`9dbe4c91-a72e-47d7-8231-f047ee8f61f6`).
- El entorno se llama `production` dentro de este proyecto separado de pruebas.
- Frontend: https://frontend-production-02892.up.railway.app
- Backend reservado: https://backend-production-3b4b.up.railway.app
- Frontend subido mediante CLI desde los archivos locales validados; el repositorio
  está conectado. Ambos repositorios GitHub solo contienen README, por lo que
  se pausó el autodespliegue hasta publicar el código completo y sus ajustes.
  Backend desplegado mediante CLI desde una copia limpia del código local,
  con sus configuraciones de infraestructura y sin .env ni entornos virtuales locales.
- Frontend SUCCESS, `/healthz` HTTP 200, Home SSR con hidratación y controles
  noindex activos. `/admin/login` HTTP 200.
- PostgreSQL nuevo está en funcionamiento. API, CORS y JWT de pruebas configurados.
- Backend SUCCESS; migraciones 0001 y 0002 aplicadas a la base de pruebas.
  Healthcheck y endpoints públicos responden 200; CORS FastAPI permite el frontend.
  Las cuatro variables R2 están configuradas. Cuenta de pruebas creada y login
  comprobado mediante API y Chrome. Credenciales en `.tools/auth-staging.json`,
  fuera del artefacto publicado y del repositorio.
- Contraseña de PostgreSQL de pruebas rotada y variable de Railway actualizada
  tras autorización explícita, sin mostrar el nuevo secreto. La clave SSH temporal
  fue retirada. La segunda clave temporal, autorizada para crear el administrador,
  también fue revocada y sus archivos locales eliminados.
- Chrome verificó Home, Projects, login, Projects admin, Profile, Services y Settings.
  Las consultas públicas no enviaron Authorization. SSR y marcadores de hidratación
  presentes; noindex activo.
- CORS configurado desde Cloudflare: preflight OPTIONS 204 con origen exacto.
  Chrome verificó PUT directo R2 200, confirmación FastAPI, lectura del archivo
  200 por el gateway del mismo origen y limpieza del archivo sintético.
  Cero excepciones de ejecución; cero Authorization en consultas públicas.
- Frontend actualizado SUCCESS; `/api/v1/public/projects` en el mismo origen
  responde 200 y Home conserva SSR, hidratación y noindex.
- Tras añadir el gateway: 576 tests pasan; TypeScript/strict templates, ESLint,
  Prettier, build de producción, validación SSR y validación del gateway pasan.
- `npm run validate:api-gateway` comprueba anonimato público, query params,
  cuerpos POST, redirección firmada sin seguimiento, no-store y errores 422/429.
- La guía de configuración oficial de [Railpack](https://railpack.com/config/file/)
  describe los inputs explícitos del artefacto. El soporte
  [S3 de R2](https://developers.cloudflare.com/r2/api/s3/api/) incluye operaciones
  CORS, sujetas a los permisos de la credencial.
- No se han copiado datos locales ni modificado datos reales del propietario.
