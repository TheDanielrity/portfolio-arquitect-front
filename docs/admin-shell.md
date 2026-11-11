# Phase 3 - Admin Shell

Current visual update: [Admin redesign](admin-redesign.md) describes the 224px
olive/Inter/DM Sans shell and real summary. The original Phase 3 report below is
historical; authentication, drawer behavior and protected routing remain reused.

Phase 3 only. Authentication is reused from Phase 2. No backend changes,
domain HTTP integration, CRUD, PrimeNG, dark mode or public UI changes.

## Architecture

AdminLayout owns the desktop sidebar, semantic header, authenticated user,
logout entry, content main and router outlet. Page content remains in child
routes. AuthService.user is consumed directly; the header makes no /me calls.

ADMIN_NAVIGATION is a small typed configuration for seven destinations, labels,
descriptions, exact/subset matching and controlled inline SVG paths. It supplies
both the shared AdminNavigation component and child route metadata, so menu/page
labels are not maintained twice. No icon or UI dependencies were added.

Each destination has loadComponent. These currently load the same minimal
AdminPlaceholder component with typed route metadata. A later feature can replace
its own loader independently. No feature directories or fake data are created
just to reserve future structure. Unknown admin paths render a minimal fallback.

Router titles use "<page> — Portfolio Admin". The topbar reflects the current
destination. There are no administrative SEO/social metadata additions.

## Routes

| Route               | Page                                       |
| ------------------- | ------------------------------------------ |
| /admin              | Resumen                                    |
| /admin/projects     | Proyectos                                  |
| /admin/media        | Multimedia                                 |
| /admin/profile      | Perfil                                     |
| /admin/services     | Servicios                                  |
| /admin/settings     | Configuración                              |
| /admin/** (unknown) | Página no encontrada                       |
| /admin/login        | Existing public login, outside AdminLayout |

The existing parent authGuard and authChildGuard protect the entire authenticated
tree. app.routes.ts and app.routes.server.ts are unchanged. No guard is duplicated
on every destination.

## Authentication integration

The user Signal is reused without fetching /me on page changes. The logout button
calls AuthService.logout(), disables duplicates and reports progress. The Phase 2
service owns token revocation, refresh/logout coordination, local cleanup and
navigation to /admin/login, including remote failures. Shell code does not store
tokens, refresh sessions or recreate logout business logic.

All Phase 2 authentication source files remain unchanged. Only guard-test mocks
were adapted to supply the user Signal required by the shell.

## Responsive state and accessibility

- At 1024px and above, a 15rem sidebar remains visible and main content occupies
  the remaining width.
- Below 1024px, navigation uses an explicit menu button and a native modal dialog.
- At 375px, the topbar puts user identity in a separate row to keep controls usable.
- Sidebar state is a local Signal; it is not persisted.
- AdminDrawer confines matchMedia to afterNextRender and removes its listener on
  destruction. No browser APIs run during server rendering.
- Moving into the desktop breakpoint closes an open drawer and focuses main.
- Completed navigation closes the drawer and focuses the new content.
- Native showModal provides background inertness and browser focus management.
  Escape and the close button close it and restore focus to the opener.
- Chrome may move Tab into browser chrome between modal focus cycles; the smoke
  validates that focus resumes inside the dialog and cannot reach page controls.
- A skip link becomes visible on focus and focuses #admin-main without navigating.
- nav, header, main, real buttons, accessible labels, aria-expanded, aria-current,
  visible focus and a live logout status are included.
- Active navigation has a border and heavier text as well as color.
- Motion is limited to small interactions; prefers-reduced-motion is respected.

SCSS tokens and overrides are scoped to the admin host. Global/public styles were
not changed. Branding is neutral "Portfolio Admin", with no invented studio/logo.
Only a light theme is implemented.

## Validation

- Complete Angular/Vitest suite: 107 tests passed in 13 files, including Phase 2
  authentication/refresh regressions.
- Shell tests cover landmarks/outlet, user updates, logout reuse/loading,
  skip-link focus, seven lazy placeholders, active states, titles, protected parent
  and children, expired-session child navigation, login separation and fallback.
- Drawer unit tests cover open/closed state, duplicate open, Escape/native close,
  desktop transition and listener cleanup.
- Chrome smoke uses the existing scripts/auth-browser-smoke.mjs and local
  development administrator. No framework or dependency was added.
- Real login, all seven routes, active state/title, user reuse, child-route reload,
  logout and protected re-entry passed. Network tracking asserts ZERO domain
  requests and no runtime exceptions.
- Browser tested 375, 768, 1024 and 1440px without horizontal overflow or content
  underneath the sidebar. Keyboard skip link, menu activation, native modal focus,
  background inertness, Escape, mobile link navigation and resize were exercised.
- Existing real concurrent refresh smoke also passed: THREE 401 requests,
  ONE POST refresh, THREE successful retries.
- TypeScript/templates: npm run typecheck (ngc with strict templates), passed.
- ESLint passed. Formatting follows the existing Prettier configuration.
- Production build with --stats-json passed; AdminLayout, admin routes and
  AdminPlaceholder have separate lazy entry points. Traversal of main's static
  imports found no admin feature/layout source.
- SSR validation passed for /, /admin/login, /admin and /admin/projects.
  Protected admin URLs return only the client shell, without private components.
- Generated OpenAPI files were not regenerated or edited. Hashes are unchanged.
- Phase 4 remains PENDING.

Repeatable commands:

```text
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build -- --stats-json
npm run validate:ssr
npm start
npm run test:auth:browser
```

The browser smoke expects local Chrome and the ignored .tools/auth-development.json
created during Phase 2. The existing AUTH_SMOKE_FRONTEND_URL and
AUTH_SMOKE_BROWSER_PATH overrides remain available. Saved admin screenshots mask
account details, preserve layout and stay in .tools. Temporary browser profiles
are ignored. No passwords or tokens are printed.

## Created

- src/app/layouts/admin-layout/admin-layout.html
- src/app/layouts/admin-layout/admin-layout.scss
- src/app/layouts/admin-layout/admin-layout.spec.ts
- src/app/layouts/admin-layout/admin-navigation.config.ts
- src/app/layouts/admin-layout/admin-navigation.ts
- src/app/layouts/admin-layout/admin-navigation.scss
- src/app/layouts/admin-layout/admin-drawer.ts
- src/app/layouts/admin-layout/admin-drawer.scss
- src/app/layouts/admin-layout/admin-drawer.spec.ts
- docs/admin-shell.md

## Modified

- src/app/layouts/admin-layout/admin-layout.ts
- src/app/features/admin/admin.routes.ts
- src/app/features/admin/admin-placeholder.ts
- src/app/app.spec.ts
- src/app/core/auth/auth.guard.spec.ts
- scripts/auth-browser-smoke.mjs
- scripts/validate-ssr.mjs
- docs/authentication.md
- README.md
- PLANS.md

## Dependencies

None. package.json and package-lock.json are unchanged.

## Limitations and next phase

All destination pages are placeholders. There are no domain services, statistics,
tables, uploads or media workflows. Tokens, multiple-tab limitations and production
API configuration remain those documented in authentication.md.

The browser smoke uses development Angular debug APIs solely for its existing
auth concurrency check; it is not a production-browser test. Native dialog
requires a modern browser; validated here with local Chrome.

Phase 4 can replace the /admin/media loader with its real feature while retaining
the shell, guards and logout. No Media Management or R2 Uploads were implemented.

Final status: Phase 3 COMPLETED. Tests, ESLint, Prettier, strict TypeScript/templates, production build, SSR and real browser smoke passed. Phase 4 PENDING.

## Integration with Phase 4

/admin/media now lazy-loads MediaPage instead of the Phase 3 placeholder. Other
placeholders, shell navigation, guards and logout remain unchanged. Media requests
are allowed only inside this implemented feature; no other domain feature is added.
See [Media Management](media-management.md) for upload, private delivery and CORS.
