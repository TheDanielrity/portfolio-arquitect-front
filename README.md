# Portafolio de arquitectura — Frontend

Aplicación web para presentar proyectos de arquitectura y administrar su contenido desde un panel privado. El sitio público prioriza fotografías, composición editorial y secciones dinámicas; el panel permite gestionar proyectos, medios y datos profesionales.

Este repositorio contiene una única aplicación Angular. La autenticación, los permisos, las reglas de publicación y la persistencia pertenecen al [backend FastAPI](https://github.com/TheDanielrity/portfolio-arquitect-back).

## Funcionalidades

- Portafolio público con proyectos destacados, filtros, paginación y detalle por enlace permanente.
- Secciones de proyecto con texto, imágenes, galerías, vídeo, citas, composición dividida y modelos GLB con carga bajo demanda.
- Presentación de servicios y datos de contacto, con enlaces configurables desde administración.
- Panel privado para crear y editar proyectos, ordenar contenido, gestionar categorías y etiquetas y controlar publicación y visibilidad.
- Gestión de perfil, redes sociales, servicios y configuración del sitio.
- Subida directa de archivos a Cloudflare R2 mediante autorización y confirmación del backend.
- Autenticación con renovación de sesión coordinada y rutas administrativas protegidas.
- Renderizado en servidor (SSR) para páginas públicas y carga diferida de funcionalidades.

## Estado del proyecto

Las fases funcionales 0 a 12 del frontend figuran como completadas en [PLANS.md](PLANS.md). Permanecen pendientes las fases específicas de SEO y metadatos, revisión de accesibilidad y adaptación a pantallas, optimización y validación final. La existencia de SSR y estilos adaptables no implica que esas revisiones estén terminadas.

La migración a **Netlify + Render** está preparada en el código. Todavía no hay una URL de la nueva demo verificada; la creación de servicios y la transferencia de datos siguen pendientes. Consulta la [guía de despliegue](docs/netlify-render.md).

## Tecnologías

Angular 22, TypeScript 6, componentes independientes, Router, HttpClient, Signals, RxJS, Angular CDK y SCSS. Las pruebas utilizan Vitest y las comprobaciones de código utilizan ESLint y Prettier.

## Requisitos

- Node.js 24.20.0 y npm 11.19.0, versiones utilizadas para validar este proyecto. Los rangos compatibles están declarados en [package.json](package.json).
- Git para obtener el repositorio.
- Backend FastAPI configurado y en ejecución para consultar contenido e iniciar sesión.

Usa **npm** de forma consistente. En PowerShell con ejecución de scripts restringida, sustituye `npm` por `npm.cmd`.

## Instalación y ejecución local

```bash
git clone https://github.com/TheDanielrity/portfolio-arquitect-front.git
cd portfolio-arquitect-front
npm ci
npm start
```

Abre <http://localhost:4200>. El servidor de desarrollo escucha también en la red local.

En otra terminal, inicia el backend siguiendo las instrucciones de su repositorio. El [proxy de desarrollo](proxy.conf.json) reenvía `/api/**` a `http://127.0.0.1:8000`. Si utilizas otro puerto, ajusta ese archivo.

El frontend no crea usuarios ni proyectos de ejemplo. Una instalación con base de datos vacía puede mostrar listas vacías; el acceso administrativo requiere una cuenta creada en el backend.

## Rutas principales

| Ruta                       | Contenido                                             |
| -------------------------- | ----------------------------------------------------- |
| `/`                        | Inicio, proyectos seleccionados, servicios y contacto |
| `/projects`                | Listado de proyectos                                  |
| `/projects/:slug`          | Detalle de un proyecto                                |
| `/admin/login`             | Inicio de sesión                                      |
| `/admin`                   | Resumen administrativo                                |
| `/admin/projects`          | Gestión de proyectos                                  |
| `/admin/projects/new`      | Creación de un proyecto                               |
| `/admin/projects/:id/edit` | Edición de un proyecto y sus medios y secciones       |
| `/admin/taxonomy`          | Categorías y etiquetas                                |
| `/admin/profile`           | Perfil y redes sociales                               |
| `/admin/services`          | Servicios                                             |
| `/admin/settings`          | Configuración del sitio                               |

Los medios se gestionan en el contexto de los proyectos y del contenido. La interfaz actual no incluye una bandeja de mensajes ni un formulario público de envío de contacto; el backend conserva sus propios endpoints para esos recursos.

## Configuración de la API

Los servicios consumen el prefijo `/api/v1` mediante la configuración centralizada `API_BASE_URL`.

| Entorno             | Configuración                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Desarrollo          | `src/environments/environment.development.ts`: `/api/v1`, a través del proxy local          |
| Netlify             | `src/environments/environment.netlify.ts`: `/api/v1`, a través del servidor del mismo sitio |
| Producción con Node | `src/environments/environment.ts`: configurar `apiBaseUrl` antes de compilar                |

En Netlify, `UPSTREAM_API_BASE_URL` identifica al backend desde el servidor. No configures `API_BASE_URL` en ese servicio. La [guía de despliegue](docs/netlify-render.md) detalla ámbitos de variables, dominios y CORS.

En el despliegue Node, la variable de servidor `API_BASE_URL` permite configurar las consultas SSR, pero no reemplaza la configuración compilada que necesitan las rutas administrativas en el navegador. El servidor también admite el proxy opcional `UPSTREAM_API_BASE_URL`.

Todo valor enviado al navegador es público. Las credenciales de PostgreSQL, JWT y R2 deben permanecer en el backend o en la configuración privada del proveedor de alojamiento.

### Actualizar contratos OpenAPI

Con el backend disponible en `http://127.0.0.1:8000`:

```bash
npm run api:generate
```

El comando obtiene `/openapi.json` y genera tipos en `src/app/core/api/generated/`. No edites esos archivos manualmente. La variable `OPENAPI_URL` permite seleccionar otra especificación; la configuración está en [openapi-ts.config.ts](openapi-ts.config.ts). Los tipos ya versionados permiten compilar y ejecutar las pruebas unitarias sin iniciar el backend.

## Pruebas y comprobaciones

```bash
npm test
npm run test:netlify
npm run lint
npm run format:check
npm run typecheck
```

Para aplicar formato, usa `npm run format`. Las pruebas de navegador e integración requieren el backend y su configuración de pruebas; consulta los documentos de cada funcionalidad antes de ejecutarlas, porque algunas crean y eliminan datos sintéticos.

### Compilación para Netlify

```bash
npm run build:netlify
npm run validate:netlify
```

La configuración está en [netlify.toml](netlify.toml). La validación comprueba localmente el adaptador y el renderizado; no sustituye las pruebas de la aplicación desplegada con Render y R2.

### Compilación para servidor Node

```bash
npm run build
npm run serve:ssr
```

El servidor escucha en <http://localhost:4000> o en el puerto definido por `PORT`. Con el backend configurado, `npm run validate:ssr` comprueba el renderizado. `npm run validate:api-gateway` verifica el proxy con un servidor de prueba. Cada compilación reemplaza la salida de `dist/architecture-portfolio`; usa el comando correspondiente al destino que vayas a ejecutar.

## Organización del código

```text
src/app/
├── core/       # API, autenticación e infraestructura compartida
├── features/   # Funcionalidades públicas y administrativas
├── layouts/    # Estructuras de navegación y presentación
└── shared/     # Componentes y utilidades reutilizables
src/environments/  # Configuración por entorno
src/server.ts     # Servidor Node
src/server.netlify.ts  # Entrada SSR para Netlify
```

## Documentación

- [Plan de implementación](PLANS.md) e [instrucciones del repositorio](AGENTS.md).
- [Dirección visual pública](docs/design/PUBLIC_UI.md).
- [Autenticación y renovación de sesión](docs/authentication.md).
- [Edición de proyectos y borradores](docs/project-editing-drafts.md).
- [Medios en contexto](docs/contextual-media.md) y [secciones dinámicas](docs/project-sections.md).
- [Portafolio público](docs/public-projects.md) y [detalle de proyectos](docs/public-project-detail.md).
- [Despliegue en Netlify y Render](docs/netlify-render.md).

## Licencia

Este repositorio no declara una licencia general de uso. Las fuentes y dependencias de terceros conservan sus licencias, incluidas en sus archivos correspondientes.
