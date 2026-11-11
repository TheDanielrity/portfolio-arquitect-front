# Project Management — Phase 5

Flujo vigente de edición: [Modales, borradores y vista previa](project-editing-drafts.md).

Actualización vigente: [Admin UX y editor en cuatro áreas](admin-ux.md).

Later update: [Admin redesign and integrated project uploads](admin-redesign.md)
documents the current tabbed editor, draft-first uploads, direct cover/gallery
management and shared metadata. The original Phase 5 validation below is historical.

Phase 5 only. Authentication, token storage, refresh coordination, Admin Shell and
Media Management are reused. No backend source/configuration, public UI, project
sections or Phase 6 functionality is changed by that phase.

Phase 6 subsequently integrates sections into the existing edit route; see
[project-sections.md](project-sections.md). The project regression smoke permits
section reads from that editor and still rejects section writes/unrelated domains.

## Contract

All routes below use `/api/v1/admin`, Angular HttpClient, API_BASE_URL, generated
OpenAPI types and the existing toApiError parser. Administrative identifiers are
UUIDs; slugs are editable data, not administrative identifiers.

| Method         | Path                                        | Contract                                         |
| -------------- | ------------------------------------------- | ------------------------------------------------ |
| GET            | /projects                                   | PageProjectResponse: items, total, limit, offset |
| POST           | /projects                                   | ProjectCreate → 201 ProjectResponse              |
| GET / PATCH    | /projects/{project_id}                      | ProjectResponse / ProjectUpdate                  |
| DELETE         | /projects/{project_id}                      | 204 soft deletion; subsequent detail is 404      |
| GET / POST     | /categories, /tags                          | paginated taxonomy / CategoryCreate, TagCreate   |
| GET / PUT      | /projects/{project_id}/categories, /tags    | paginated assignments / Assignment {ids}         |
| GET / POST     | /projects/{project_id}/attributes           | paginated AttributeResponse / AttributeCreate    |
| PATCH / DELETE | /projects/{project_id}/attributes/{item_id} | AttributeUpdate / 204                            |
| PUT            | /projects/{project_id}/attributes/order     | Reorder {items:[{id,sort_order}]} → 204          |
| GET / POST     | /projects/{project_id}/media                | paginated MediaLinkResponse / MediaAttach        |
| PATCH / DELETE | /projects/{project_id}/media/{item_id}      | MediaLinkUpdate / 204                            |
| PUT            | /projects/{project_id}/media/order          | Reorder → 204                                    |
| PUT            | /projects/{project_id}/cover                | CoverSelection {media_id} → MediaLinkResponse    |

The smoke additionally uses existing DELETE category/tag endpoints to remove only
its own temporary taxonomy. It does not manipulate PostgreSQL directly.

Project list parameters: limit 1–100, offset ≥0, q 1–200, sort
sort_order/title/created_at/updated_at, direction asc/desc, status, visibility,
is_featured, category_id and tag_id. The UI uses a 20-item page and explicit search
submission, avoiding requests on each keystroke. Filters and offset are URL query
state; reload and Back/Forward reuse them. Invalid enum/UUID/offset URL values are
discarded, and out-of-range last pages are corrected.

Required create fields: title (trimmed, nonblank, ≤200), slug (≤220, lowercase
letters/numbers separated by hyphens). Optional nullable fields: short_description
(500), description (50000), location (255), year (integer 1800–2200), area_m2
(positive decimal, 10 integer digits/2 decimals), client_name (200), seo_title
(200), seo_description (320). Status, visibility, is_featured and sort_order are
editable, non-nullable; sort_order is an integer 0–2147483647. Empty optional form
text maps to null. Area is sent as a decimal string to avoid precision loss.

Enums: DRAFT/PUBLISHED/ARCHIVED; PUBLIC/PRIVATE/UNLISTED;
COVER/GALLERY/PLAN/RENDER/DOCUMENT/MODEL. No new enum values are invented.
published_at, created_at and updated_at are read-only. deleted_at is not returned
by ProjectResponse and is not invented as a UI field.

Creating directly as PUBLISHED is rejected by the backend. Save a draft, select an
image cover, then publish. The backend sets the first published_at. The dedicated
cover PUT replaces the previous cover transactionally and is idempotent for the
same asset. A published cover cannot be detached/demoted until replaced or the
project is unpublished. Duplicate (project, media, role) relations are rejected;
the same asset may have different roles.

Soft deletion hides the project from list/detail, retains its database history
and does not physically delete library files. There is no restore endpoint or
deleted-project listing; the UI has neither capability.

## Architecture and workflows

- ProjectApi handles HTTP only. allPages follows paginated collections rather than
  silently truncating taxonomy or relations at 100.
- ProjectList has one authoritative list Signal and cancellable query requests.
  It distinguishes loading/refreshing/loaded/empty/error. Covers are managed in the
  editor: ProjectResponse does not contain a cover, so the list avoids N+1 previews.
- ProjectEditor uses typed Reactive Forms, groups basic/project/publication/SEO
  data, prevents duplicate submits, preserves input on errors and maps 422 fields.
  409 explains slug/relation conflicts without internal diagnostics. Retry-After
  is retained; tokens/error IDs never become UI messages.
- ProjectTaxonomy reads existing and assigned categories/tags, uses unique ID
  selections and replaces assignments explicitly (≤100 per group). It supports
  minimal category/tag creation, not a separate taxonomy CRUD application.
- ProjectAttributes supports label/value creation, editing, deletion and ordering.
- ProjectMedia reuses MediaApi and MediaPreview for actual assets. Its paginated
  native-dialog selector never uploads. Files are uploaded using /admin/media.
  Relation IDs, not asset IDs, identify reorder/update/delete operations.
- Each relation group saves independently. There is no fictitious all-or-nothing
  save across separate API transactions.
- CanDeactivate asks through an accessible native dialog only when the main
  project form is dirty. Loading/saving resets pristine state; logout/expired
  authentication can leave. Unsaved relation drafts are not part of this guard.

Ordering uses keyboard/touch-accessible up/down buttons. No drag/drop dependency
is needed. Only final order is persisted. Reorder bodies are limited to 100 items;
larger collections use sequential batches. Multiple batches cannot be atomic under
the current API. A failed reorder reloads authoritative state, preserving the error.

## Rendering, design and dependencies

/admin/projects, /admin/projects/new and /admin/projects/:id/edit are nested lazy
routes under the existing authenticated tree. Login remains outside the layout.
All admin server routes remain RenderMode.Client, with no private HTML in SSR.
Browser dialog operations run only in afterNextRender.

The interface retains shell tokens, restrained borders, clear headings, native
forms/dialogs and a structured administrative list. Layouts adapt at 375, 768,
1024 and 1440 px. Labels, fieldsets, associated field errors, focus-visible styles,
real buttons, live status feedback, Escape and native modal focus are included.
No public styles, fonts or dependencies are added. PrimeNG/CDK were unnecessary.

## Repeatable validation

Use the supported Node version and the existing private development credential
file. Never print its contents, tokens or signed URLs.

```text
npm run api:generate
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build -- --stats-json
npm run validate:ssr
npm start
npm run test:projects:browser
npm run test:auth:browser
npm run test:media:browser
```

project-browser-smoke.mjs uses the existing native Chrome DevTools Protocol stack,
not a new browser framework. It uploads one tiny temporary PNG through Phase 4,
creates/edits a unique project through UI, assigns temporary category/tag, adds and
orders attributes, selects the real asset, sets cover and other roles, reorders
media, uses private preview, reloads, publishes, filters/searches, verifies unsaved
changes and soft-deletes. It asserts no additional R2 PUT for associations and no
section/unrelated domain requests. Test-only fetch calls are limited to cleanup;
Angular application API calls remain HttpClient.

Cleanup uses the real API: unpublish, clear assignments, detach links, delete
attributes, soft-delete the project, delete temporary category/tag and media.
The existing narrowly scoped media verification helper checks PostgreSQL/R2 and
removes only the smoke's staging object. A soft-deleted project row and terminal
storage history remain, as required by backend policy. No active test project,
relations, taxonomy, media asset or R2 object should remain.

Screenshots mask the authenticated user and remain in ignored .tools. Production
API/proxy and Blob-memory limitations remain those documented in media-management.
No backend endpoints/configuration or bucket policy were changed.

## Validation record

Final validation on 2026-10-06: Phase 5 COMPLETED. Phase 6 remains PENDING.

| Check                         | Result                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI                       | Repeat generation byte-identical for both generated files                                                                                                                                                            |
| Unit tests                    | 213 passed in 17 files; 60 new tests including project child-route protection                                                                                                                                        |
| ESLint / Prettier             | Passed                                                                                                                                                                                                               |
| TypeScript / strict templates | Passed                                                                                                                                                                                                               |
| Production build              | Passed without warnings; initial browser bundle 320.71 kB                                                                                                                                                            |
| Lazy loading                  | ProjectList 14.44 kB and ProjectEditor 66.60 kB are separate lazy chunks; no admin source in the initial public graph                                                                                                |
| SSR                           | /, /admin/login, /admin, /admin/projects, /admin/projects/new, /admin/projects/:id/edit and /admin/media passed; protected routes contain no private HTML                                                            |
| Real Chrome projects smoke    | Create/edit/featured, category/tag assignment, attributes/order, existing media/roles/cover/order/private preview, reload, publishing/visibility, server search/filters, unsaved confirmation and soft delete passed |
| Authentication regression     | Login, shell/mobile/keyboard, three real 401 responses / one refresh, reload, logout and protected re-entry passed                                                                                                   |
| Media regression              | Real presign/R2 PUT/confirm/private delivery, idempotency, editing, cancellation, deletion and cleanup passed                                                                                                        |
| Responsive                    | 375, 768, 1024 and 1440 px passed with no horizontal overflow                                                                                                                                                        |
| Cleanup                       | No active smoke project, relations, taxonomy or media asset; R2 definitive/staging objects absent; soft-delete/terminal history retained                                                                             |

The auth browser harness now waits for the initial router navigation to finish
after reload before clicking logout, preventing a test timing race. No auth source
was changed. Screenshots were reviewed at mobile size; no public design changes
were made. The browser request counter asserts zero section/unrelated domain calls.

New files: the 16 files in src/app/features/admin/projects,
scripts/project-browser-smoke.mjs and this document. Modified files: PLANS.md,
package.json, admin.routes.ts, admin-layout.spec.ts, auth-browser-smoke.mjs,
validate-ssr.mjs and media-management.md. No new dependencies or generated-contract
changes. Phase 6 can consume the stable project UUID and editor feature boundary;
no section API, component or functional UI was introduced.
