# Admin redesign and integrated project uploads

Actualización vigente: [Admin UX y editor en cuatro áreas](admin-ux.md).

Reference: `docs/design/source/Admin panel for architecture portfolio.zip` (the
requested `(1)` filename was absent). App.tsx, theme.css and fonts.css were inspected
in an ignored documentary folder; the original ZIP is unchanged. React/Vite,
localStorage demo persistence, timers, users, fake statistics, Unsplash photos and
deployment instructions were not imported.

## Visual architecture

Login, summary, projects, media, profile/social links, services, settings and inbox
use scoped administrative SCSS: #fafaf8 background, #272923 text, #69774c olive,
#e6e7e0 borders, 224px sidebar, 73px header and restrained 6px corners. Locally served
Inter and DM Sans have separate administrative font names. Native controls, inline
SVG and existing accessible drawer/dialog patterns remain; no UI dependency was
added. Public styles, routes and components are unchanged.

The summary reads actual project totals (all/published/draft), recent projects and
NEW contact totals. It invents no growth/activity/health. Project cards read COVER
relations and private media through MediaPreview; missing covers have a neutral
fallback. This requires bounded per-card reads because ProjectResponse has no cover.

## Editor and draft persistence

Routes remain `/admin/projects/new` and `/admin/projects/:id/edit`. Tabs are
Información básica, Detalles del proyecto, Portada, Galería, SEO and Contenido
editorial. Existing taxonomy, attributes, sections and media roles are retained.
Panels stay mounted so tab switching preserves files, previews and form data.

Selecting files in a new project first persists one DRAFT using valid title/slug
and selected visibility. The UUID and URL update without destroying the editor.
Other fields remain dirty until saved; subsequent saves update the same UUID.
Duplicate submits are blocked and backend slug uniqueness remains authoritative.
A lost create response can surface a conflict on retry: inspect Projects before
creating another draft. No draft is automatically published or silently deleted.

Uploads, relations, cover replacement, ordering and media metadata save immediately.
Main project fields require Guardar proyecto. Pending jobs block saving/publication.
Leaving asks about unsaved changes/pending jobs; reload/tab close uses beforeunload.
Persisted drafts and confirmed assets survive leaving. Local File objects do not
survive reload; confirmed but unassociated files remain reusable in the library.

## Upload coordination

ProjectUploadQueue belongs to the mounted ProjectMedia component. Each independent
file uses the existing MediaUpload engine. A serial queue keeps order deterministic:

1. Existing media-policy validation for UX.
2. POST `/admin/media/uploads/presign`.
3. Direct browser PUT to returned URL using the returned signed headers.
4. POST `/admin/media/uploads/confirm`.
5. Reconcile existing relations, then POST `/admin/projects/{id}/media` or
   PUT `/admin/projects/{id}/cover`.
6. Reload authoritative relations; only then report success in the project.

The isolated XHR client excludes JWT and administrative interceptors. Real browser
events report progress; otherwise it is indeterminate. Existing transfer timeouts
remain. There is no arbitrary automatic PUT retry.

Jobs represent waiting, authorization, transfer, confirmation, association, success,
failure and cancellation. Failed confirmation retries the same idempotent operation.
Failed association retains the confirmed asset ID and retries only association;
a preceding relation read reconciles ambiguous success and prevents duplication.
Unresolved failed transfers cancel authorization before obtaining a new one.
Backend expiry/cleanup remains authoritative for interrupted operations.

Object URLs are revoked on removal/destruction, never persisted. Signed URLs are
temporary capabilities. Project uploads use conditional public access; the bucket
stays private and backend publication/visibility/reference checks control delivery.

## Cover, gallery and shared files

Cover accepts images and uses the backend atomic replacement. The old cover is
retained until transaction success; its global asset is preserved. Gallery accepts
multiple independent uploads. PDF maps to DOCUMENT, GLB to MODEL; existing video,
image and other relation roles remain supported. Non-images get administrative
representations. Move up/down is keyboard accessible and persists finalized order
using relation IDs, without requests during pointer movement.

Title, alt_text and description are shared MediaUpdate fields; this is explained in
the editor. No per-project caption field was invented. Confirmed removal deletes
only the relationship. Global deletion remains in Multimedia and respects backend
reference conflicts. The secondary library still serves reuse, profile photos/CVs.

## Verification and limitations

`npm run test:project-uploads:browser` uses real Chrome/FastAPI/PostgreSQL/R2. It
checks draft creation, three direct uploads, OPTIONS/PUT without JWT, confirmation,
association, tab switching, metadata/order reload, atomic cover replacement,
shared-reference safety and draft/private/public visibility. Cleanup uses APIs:
projects soft-delete, relations/media delete, existing read-only verification checks
PostgreSQL/R2 definitive and staging cleanup. Captures stay ignored in `.tools`.

Unit tests cover queue retries, confirmed-but-unassociated files, duplicates,
cancellation, validation, PDF/GLB roles, draft creation and shared metadata. Full
tests retain auth single-flight, R2, content, sections, inbox and public regressions.
SSR continues to expose no private administrative HTML.

Final checks: 430 unit tests in 27 files passed (18 added), ESLint/Prettier passed,
TypeScript/strict templates passed, production build passed without budget warnings.
The initial browser bundle remains 326.88 kB and administrative screens remain lazy.
Real authentication smoke retained 3 x 401 -> 1 refresh -> 3 successful retries.
The existing project browser smoke retained taxonomy, attributes, media reuse/roles,
ordering, publication, unsaved confirmation and soft-delete behavior. Public Chrome
validation passed responsive, SSR/hydration, keyboard and reduced-motion checks.
The integrated upload smoke passed all tabs/screens at 375/768/1024/1440 and cleanup.

Limitations: uploads survive tab switches but not browser reload; confirmed files
remain in the library, unresolved authorizations use backend cleanup. A local
browser/network stall cannot be fixed by styling; the UI supports safe timeout,
cancellation and retry, and real integration is tested from this environment.
Shared metadata affect every reference. Cover delivery adds bounded backend reads.
The login uses a neutral SVG instead of the prototype's demo photograph. Branding
remains Portfolio Admin. No backend/schema/migration/contracts/auth/public feature
or Phase 11 implementation was changed.
