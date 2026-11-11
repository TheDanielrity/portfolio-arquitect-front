# Architecture Portfolio Frontend

## Publicación de la demo

Destino de migración: **Netlify (Angular SSR) + Render (FastAPI y PostgreSQL)**,
con archivos en Cloudflare R2. Código del frontend:
[portfolio-arquitect-front](https://github.com/TheDanielrity/portfolio-arquitect-front).

Consulta [la guía de despliegue](docs/netlify-render.md) para configurar los
servicios, variables, comprobaciones y el cambio desde Railway.

```bash
npm ci
npm run test:netlify
npm run build:netlify
npm run validate:netlify
```

La demo nueva todavía no tiene una URL verificada. La documentación histórica
de fases que sigue describe el desarrollo incremental; el estado de fases
vigente se mantiene en `PLANS.md`.

Base Angular standalone con SSR. Rutas temporales: `/` y `/admin`.

## Requisitos y comandos

- Node.js 24 LTS: 24.15.0 o superior dentro de la rama 24.
- Entorno validado: Node 24.20.0, npm 11.19.0, Angular 22.2.1 y TypeScript 6.0.3.
- Si usas Node portable, agrega su carpeta al `PATH`.
- En PowerShell con scripts restringidos, utiliza `npm.cmd`.

```bash
npm install
npm start
npm test
npm run lint
npm run format
npm run format:check
npm run build
npm run serve:ssr
```

Para instalación limpia y reproducible utiliza `npm ci`.
Desarrollo: `http://localhost:4200`. SSR de producción: `http://localhost:4000`.
`npm test` ejecuta Vitest una vez; `npm test -- --watch` activa modo interactivo.
El build verifica TypeScript y templates estrictos y genera navegador y servidor.
Después del build, `npm run validate:ssr` comprueba el HTML de ambas rutas y detiene
su servidor temporal (puerto 4301).

## Configuración API

La única fuente para servicios HTTP es el InjectionToken `API_BASE_URL`, definido
en `src/app/core/api/api-config.ts`. Lee la configuración de entorno y normaliza
el slash final. La URL incluye el prefijo `/api/v1`.

- Desarrollo: `src/environments/environment.development.ts` define
  `/api/v1` mediante el proxy de desarrollo. Se resuelve contra el origen de
  la página en navegador y contra el origen de la petición en SSR, para admitir
  localhost y acceso desde la red local sin enviar localhost al teléfono.
- Producción: configura `apiBaseUrl` en `src/environments/environment.ts` con una
  URL HTTP(S) absoluta accesible desde navegador y servidor SSR antes de integrar
  peticiones de producción. No se utiliza el backend local como fallback.
  SSR también admite API_BASE_URL; consulta docs/public-projects.md para transferencia e hidratación.
- Todo valor de entorno es público; nunca agregar secretos.

Los servicios utilizan Angular `HttpClient`, sin clientes HTTP generados ni
interceptores. `HealthApi.check()` realiza únicamente `GET /api/v1/health`.
`ApiError` conserva status, detail, errores de validación `loc/msg/type`,
`Retry-After` y `X-Error-ID`; descarta payloads inesperados y valores enviados.
La paginación deriva `items/total/limit/offset` y `limit/offset` de los tipos
generados. No se agregan campos page, totalPages ni cursor.

## Contratos OpenAPI

FastAPI debe estar ejecutándose para regenerar. Desde el repositorio backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --loop app.core.event_loop:selector_loop_factory
```

El frontend no inicia ni modifica FastAPI. El contrato real está en
`http://127.0.0.1:8000/openapi.json` (89 operaciones en la revisión de Fase 1).
Desde este repositorio:

```bash
npm run api:generate
```

Se generan únicamente tipos en `src/app/core/api/generated/` (`types.gen.ts` e
`index.ts`), con encabezado de generación. No editarlos manualmente.
La configuración reside en `openapi-ts.config.ts`; opcionalmente `OPENAPI_URL`
puede seleccionar otro servidor. No se mantiene un snapshot JSON independiente.
Los tipos versionados permiten build y tests sin ejecutar el backend.
La generación aplica Prettier; ESLint excluye los archivos propiedad del generador,
pero la compilación TypeScript y el check de formato sí los incluyen.

Se usa `@hey-api/openapi-ts` 0.99.0 con únicamente `@hey-api/typescript`:
`openapi-typescript` 7.13.0 declara un peer TypeScript 5 incompatible con
TypeScript 6 de Angular 22. No se fuerza npm ni se cambia TypeScript.
El override de `js-yaml >=4.3.2` en el parser del generador corrige sus avisos de
seguridad. El generador es una dependencia de desarrollo, sin SDK, fetch client,
autenticación ni enums de runtime.

## Health infrastructure

The temporary Home healthCheck diagnostic was removed in Phase 9. HealthApi and
its dedicated HTTP tests remain. Run npm test to verify its URL, response/error
contracts independently from public UI. See docs/public-foundation.md for public
SSR, hydration and browser checks.

El servidor SSR permite `localhost`. Al desplegar, configura hosts autorizados
en `angular.json` según el dominio real. Se mantiene el comportamiento zoneless
del CLI y su opción generada `skipLibCheck`; TypeScript y templates son estrictos.

Phase 1 health/CORS verification is historical; Home now consumes only public portfolio APIs (Phase 10).

## Autenticación administrativa (Fase 2)

Login: /admin/login. /admin y sus futuras rutas hijas requieren autenticación.
Se mantiene el placeholder administrativo con cierre de sesión; no hay Admin Shell.

[Contrato, almacenamiento, concurrencia, SSR y pruebas](docs/authentication.md).
El access token permanece en memoria y el refresh en sessionStorage. Al recargar,
se rota la sesión y se valida /me antes de mostrar contenido administrativo.
Las URLs externas/R2 no reciben tokens. Phase 3 permanece PENDING.

Para pruebas reales: npm run test:auth:smoke y, con npm start, npm run test:auth:browser.
Las credenciales del administrador local están en .tools/auth-development.json
(excluido del repositorio). No copiarlas a configuración Angular ni a archivos versionados.

## Panel administrativo (Fase 3)

El [Admin Shell](docs/admin-shell.md) incluye sidebar, header, usuario autenticado
y cierre de sesión mediante la autenticación existente. Las siete rutas están
protegidas y usan placeholders lazy-loaded; no realizan llamadas de dominio.

Rutas: /admin, /admin/projects, /admin/media, /admin/profile, /admin/services,
/admin/settings. /admin/login permanece fuera del shell.

El módulo Mensajes fue retirado: no hay bandeja ni contador en administración.
La landing no muestra formulario de envío; el contacto se realiza mediante los
datos públicos y el enlace de WhatsApp configurado en Perfil.

Desde 1024px el sidebar es fijo; en tablet y móvil se abre una navegación modal
con Escape, foco accesible y cierre después de navegar. La validación de navegador
existente (npm run test:auth:browser) cubre también el shell y sus cuatro tamaños.

Fase 4 continúa PENDING. No hay PrimeNG, CRUD ni uploads.

## Public Project Portfolio (Phase 10)

Home and `/projects` use public projects/featured/categories with SSR, public media, editorial grid/Index, category/tag filters and pagination. `/projects/:slug` is reserved for Phase 11.

[Contracts, selection rules, SSR and limitations](docs/public-projects.md).

Real isolated integration smoke: `npm run test:public-projects:browser`. It prepares/cleans only named fixtures through backend APIs and checks privacy, R2 image delivery and unauthenticated browser navigation. No credentials or tokens are printed. Phase 11 remains PENDING.
