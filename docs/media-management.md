> Actualización: la pantalla general fue retirada. Consulta [Gestión contextual](contextual-media.md) para las rutas y flujos actuales. La validación histórica de Fase 4 se conserva abajo.

# Media Management — Phase 4

## Contract

All JSON endpoints use API_BASE_URL, Angular HttpClient and the generated types
MediaPage, MediaResponse, MediaUpdate, UploadRequest, UploadResponse and the
query type from ListMediaApiV1AdminMediaGetData. No additional HTTP client.

| Method | Path below /api/v1                       | Body / result                                                      |
| ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| GET    | /admin/media                             | limit, offset, type, q, sort, direction → items/total/limit/offset |
| GET    | /admin/media/{asset_id}                  | MediaResponse                                                      |
| PATCH  | /admin/media/{asset_id}                  | title, description, alt_text → MediaResponse                       |
| DELETE | /admin/media/{asset_id}                  | 204; managed repeat deletion is idempotent; references → 409       |
| POST   | /admin/media/uploads/presign             | UploadRequest → UploadResponse                                     |
| POST   | /admin/media/uploads/confirm             | upload_id → MediaResponse, idempotently                            |
| DELETE | /admin/media/uploads/{upload_id}         | 204; repeated cancellation is idempotent                           |
| GET    | /admin/media/{asset_id}/content          | authenticated bytes or 307 to temporary R2 GET                     |
| PUT    | /admin/media/uploads/{upload_id}/content | authenticated raw bytes, local adapter only                        |

Search and type are server filters, not client filters on paginated data. Ordering
supports created_at, original_filename and file_size, asc/desc. Page size is 12;
out-of-range last pages are corrected after deletion. No MIME/date filter exists.
Only presentation metadata is editable; reserved metadata and storage fields
never appear in forms. Upload policy defaults to private and may explicitly be
public at authorization time; public delivery still requires backend-approved
published/profile references. The private R2 bucket remains private.

## Architecture

MediaPage owns one authoritative list response and a cancellable switchMap query
stream. It shows loading, refreshing, loaded, empty and error states independently
of uploads and dialogs. MediaDetail loads detail once, edits typed Reactive Forms
and asks for explicit deletion confirmation. Reference conflicts preserve the asset.
MediaPreview loads private content on demand; legacy external previews use only
validated HTTP(S) URLs returned by the backend, without tokens.

MediaUpload is page-scoped. Its signals represent selected, authorizing, uploading,
confirming, completed, failed, cancelling and cancelled. One file per operation
keeps cancellation and rotating-auth behavior deterministic. The native file input
and native dialog supply keyboard semantics; dialogs trap focus, support Escape
and restore focus. Errors use the Phase 1 ApiError parser, retaining Retry-After
and diagnostic IDs while showing safe contextual messages.

## Upload

1. Validate filename/extension/declared MIME/size for UX only.
2. Presign through the authenticated API (normal single-flight refresh applies).
3. PUT the File to the exact R2 URL with exactly the returned explicit headers.
   A HttpClient backed directly by HttpBackend bypasses every interceptor and
   uses withCredentials=false; R2 never receives JWT/refresh/internal headers.
4. Confirm only after a successful PUT response. Replace list data by refreshing
   the backend, rather than appending duplicate entries.
5. Retry an ambiguous confirmation with the same upload_id and no second PUT.
   Never automatically repeat PUT. Cancel an unresolved failed transfer before
   selecting a new authorization. Expiry is checked before transfer; a rejected
   or expired authorization requires cancellation and a fresh presign.

Real UploadProgress events update percentages. Signed R2 PUT now uses an isolated
Angular HttpXhrBackend in the browser, bypassing all interceptors and reporting
actual upload progress. Other HTTP requests and SSR retain the configured backend.
Before the first progress event the UI shows connection feedback; at 100% it
explicitly waits for the storage response, then FastAPI confirmation. No fake
percentages. Confirmation and content have 120-second timeouts; raw PUT has a
bounded ten-minute total timeout plus a two-minute inactivity timeout, reset by
each real HTTP event. A stalled request is aborted and leaves its authorization
unresolved for explicit cancellation; it is never automatically repeated or
confirmed. Other API calls use 15 seconds.

Cancelling before authorization makes no HTTP call. During authorization the
coordinator waits for its ID then cancels it. During PUT it unsubscribes locally
and calls backend cancellation. Cancellation cannot revoke an already issued R2
capability; storage cleanup is the backend's responsibility. Confirmation cannot
be cancelled midway because registration may already have committed. Leaving
the page cancels a selected/authorized transfer; an in-flight confirmation finishes
or times out. Closing the browser before presign returns can leave an authorization
for backend expiry/grace cleanup; no upload queue persists across reloads.

UX policy is centralized in media-policy.ts, matching inspected backend defaults:
JPEG/PNG/WebP/AVIF 20 MiB, PDF 50 MiB, GLB 100 MiB, MP4/WebM 512 MiB. GLTF is not
accepted. Blank browser MIME (notably GLB) is declared from its supported extension.
Deployment-specific limits are not exposed before presign; max_file_size returned
by FastAPI is authoritative. Update the centralized UX budgets if operating limits
change. Backend inspection, actual bytes and metadata remain authoritative.

## Private delivery and CORS

GET content follows the authenticated backend redirect and consumes a Blob.
Object URLs live only in the component and are revoked on replacement/destruction.
No signed GET URL is persisted; an image error permits one new access request,
then stops. Blob previews no longer depend on the 60-second signed GET expiry.
Downloads buffer a complete Blob, so large videos/models can consume substantial
browser memory. These types use administrative labels rather than heavy viewers.

A direct localhost:4200 → 127.0.0.1:8000 → R2 cross-origin redirect failed in the
real browser with MissingAllowOriginHeader. The frontend development proxy now
exposes /api/** at localhost:4200, forwarding API requests to FastAPI without
following its R2 redirect. This makes private delivery's initial request same-origin
and its R2 GET succeed with the configured browser origin. PUT still goes directly
to R2, never through Angular/FastAPI. No backend or bucket setting was changed.

Run npm start on localhost:4200. Production must configure API_BASE_URL and a
same-origin reverse proxy for /api/v1 (or provide another independently validated
compatible delivery/CORS deployment). The Angular development proxy is not part
of the production SSR server. Whitelist the real application origin in R2; do not
solve delivery by enabling a public bucket or allowing opaque/null origins.

The local adapter uses the returned content endpoint path through API_BASE_URL,
so authenticated local PUT also works behind a deployment proxy. It retains
returned headers. Components do not depend on the storage provider.

## Routes and SSR

Only /admin/media changes from placeholder to a lazy MediaPage. Existing guards,
AuthService, token storage/rotation, AdminLayout and all other placeholders remain.
Server route admin/** stays RenderMode.Client: no list, dialog, user metadata or
private media appears in server HTML. Browser API access is centralized in
MediaBrowser; dialog APIs run only in afterNextRender.

## Verification

npm run test:media:browser exercises Chrome CDP against real FastAPI, PostgreSQL
and R2. It uses an excluded development credential file, a unique tiny PNG,
real browser OPTIONS/PUT without JWT, presign JWT refresh, idempotent confirmation,
private preview, metadata update, DELETE/repeat DELETE, cancellation/repeat cancel,
responsive widths, reload and logout. FastAPI CORS is separately checked by a
browser health request; R2 CORS is verified by actual browser transfer/access.

scripts/media-smoke-verify.py reuses existing backend models/services/adapters,
without changing backend files. It checks PostgreSQL registration and the R2
object, then verifies deleted assets and removes only the named smoke's staging
bytes. Production normally retains staging until authorization expiry plus grace;
this explicit test cleanup leaves no test object or unresolved intent. Terminal
operation history remains, as permitted by backend policy. Failed smoke attempts
are cleaned with the same narrowly scoped helper.

Unit tests cover API URLs/bodies, policy, exact signed headers, no JWT to R2,
progress, failed PUT, idempotent confirmation retries, expiry, cancellation,
real auth-interceptor refresh during presign, local proxy uploads, list states,
filters/pagination, metadata validation and reference/network deletion failures.

No PrimeNG or new dependencies. No project CRUD, associations, public gallery,
3D viewer or Phase 5 functionality was added.

## Final validation — 2026-10-06

Phase 4 is complete. Phase 5 remains pending. No backend source, settings or bucket
configuration was modified.

| Check                                  | Result                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenAPI generation                     | Repeat generation leaves both generated files byte-identical                                                                               |
| Unit tests                             | 153 passed in 15 files; 45 media tests and one drawer regression added                                                                     |
| ESLint / Prettier                      | Passed                                                                                                                                     |
| TypeScript / strict templates          | Passed (npm run typecheck)                                                                                                                 |
| Production build                       | Passed without warnings; initial browser bundle 320.05 kB                                                                                  |
| Lazy separation                        | MediaPage is a separate 44.11 kB lazy chunk; admin is outside the initial public graph                                                     |
| SSR                                    | /, /admin/login, /admin, /admin/projects, /admin/media passed                                                                              |
| Real authentication browser regression | Login, seven routes, keyboard, mobile drawer, three 401 / one refresh, reload and logout passed                                            |
| Real media browser smoke               | Login, listing, presign with real refresh, OPTIONS/PUT R2, confirmation, private preview, metadata edit, delete and repeated delete passed |
| Idempotency and cancellation           | Repeated confirm returns the same asset; persisted cancellation and repeated cancellation passed                                           |
| Cleanup                                | PostgreSQL asset absent; definitive/staging R2 objects absent; no unresolved smoke upload/delete intent                                    |
| Responsive / accessibility             | 375, 768, 1024, 1440 px; keyboard dialog, Escape and restored focus passed                                                                 |

The shell regression caught a queued native dialog close event arriving after
reopening. AdminDrawer now reads the actual dialog open state when that event
arrives, so the next desktop resize still closes the mobile drawer. A unit test
covers this race. Authentication services, guards and token storage are unchanged.

R2 PUT and private GET were verified from Chrome at http://localhost:4200,
including the real PUT preflight, required signed headers and absence of
Authorization/internal auth headers. FastAPI CORS was checked separately. The
development same-origin API proxy is required for the verified redirected private
delivery flow; production must configure an equivalent API deployment/proxy.

The original Phase 4 verification used indeterminate progress with Angular's
default fetch backend. The subsequent upload fix below supersedes this for R2.
Blob delivery buffers the file in memory; this is a known
limitation for large downloads. Closing the browser cannot guarantee cancellation
of an issued signed capability; backend expiration/reconciliation owns cleanup.
Only backend-documented UX limits are available before presign, whose returned
maximum remains authoritative.

## Integration with Phase 5

Project Management reuses MediaApi, MediaPreview and authenticated content access
for its existing-asset selector and relationships. It does not duplicate uploads
or build storage URLs. The later [admin redesign](admin-redesign.md) also reuses
the same upload engine directly inside project cover/gallery tabs. Multimedia
remains the secondary library and upload entry point for other entities.
See [Project Management](project-management.md). Phase 4 authentication/storage
and media source files remain unchanged.

## Upload feedback and stalled-transfer correction — 2026-10-06

A reported upload remained at “Subiendo…” with no useful progress feedback.
The existing real-browser flow succeeded when rechecked, so the original user's
specific failure could not be established from a screenshot alone. Angular 22's
default FetchBackend does not emit UploadProgress. R2 PUT now uses browser XHR
through HttpClient, preserving the exact explicit signed headers, no JWT and no
credentials. SSR does not instantiate the browser transport.

The real Chrome smoke now asserts 100% from actual browser progress before
confirming registration and private preview. It also verifies OPTIONS/PUT CORS,
single-flight JWT refresh during presign, cancellation and cleanup. Two new
regression tests verify stalled PUT abortion without confirmation/retry and
continued long uploads when actual progress arrives. The complete suite passes
412 tests. No backend, bucket configuration, dependencies or phase scope changed.
