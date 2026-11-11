# Demo: Netlify + Render

## Alcance y estado

Migración solicitada desde Railway, con frontend Angular SSR en Netlify,
backend FastAPI y PostgreSQL en Render y archivos en Cloudflare R2.
No se han creado servicios nuevos ni migrado datos. Mantener Railway operativo
hasta verificar la nueva demo. No se cambia el estado de las fases de `PLANS.md`.

Repositorios:

- Frontend: https://github.com/TheDanielrity/portfolio-arquitect-front
- Backend: https://github.com/TheDanielrity/portfolio-arquitect-back

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
