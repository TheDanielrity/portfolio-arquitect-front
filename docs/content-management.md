# Global Content Management — Phase 7

The later [admin redesign](admin-redesign.md) updates these pages through scoped
administrative styles; profile, social links, services, settings and media relation
contracts remain unchanged.

Only private content administration is implemented. FastAPI remains authoritative. Authentication, token storage, refresh coordination, public UI and Messages are unchanged.

## Contract

Paths below are relative to `/api/v1/admin`. ContentApi uses HttpClient, API_BASE_URL, generated OpenAPI contracts and the shared ApiError parser. Requests have a 15-second timeout and no transfer cache.

| Resource          | Operations                                                      | Generated contracts                                                |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Singleton profile | GET/POST/PATCH `/profile`                                       | ProfileCreate, ProfileUpdate, ProfileResponse                      |
| Social links      | GET/POST `/profile/social-links`; GET/PATCH/DELETE `/{item_id}` | SocialCreate, SocialUpdate, SocialResponse, PageSocialResponse     |
| Social order      | PUT `/profile/social-links/order`                               | Reorder                                                            |
| Services          | GET/POST `/services`; GET/PATCH/DELETE `/{item_id}`             | ServiceCreate, ServiceUpdate, ServiceResponse, PageServiceResponse |
| Service order     | PUT `/services/order`                                           | Reorder                                                            |
| Settings          | GET `/site-settings`; GET/PUT `/site-settings/{key}`            | SettingKey, SettingUpdate, SettingResponse                         |

Create returns 201; reads/updates/settings return 200; delete/order return 204. Profile GET returns 404 before configuration and POST conflicts when an active profile already exists. No profile/settings DELETE exists. Social links and services use hard deletion. Lists use items/total/limit/offset; ordered collections load every page with limit 100 and sort_order ascending.

## Profile and media relations

Current scope: CV UI has been removed from Profile and its link removed from the public Studio section. Historical CV associations and stored assets are preserved, but the editor does not request their media detail or offer upload/download/selection controls. The generated backend contracts remain unchanged. Earlier CV workflow notes below describe historical behavior.

Profile photo upload now opens a native image chooser directly from the photo button. It automatically starts the existing public presign/PUT/confirm flow, with compact progress/error/cancel/retry feedback and association only after confirmation. The photo no longer exposes a global-library picker or access configuration; its intended use is public profile content, still subject to backend permissions. The CV now uses the same direct chooser/automatic upload flow, restricted to PDF; its library picker and configuration panel are also removed. No global asset is deleted when a photo is replaced or removed. Chrome verified the native chooser and absence of configuration/library controls; the complete suite passes 571 tests. Profile Save is shown only when normalized values differ from the saved baseline, including photo/CV associations, and hides when values are restored or a save succeeds. Social writes remain independent.

Profile review: confirmed contextual uploads retain their original photo/CV destination independently of the library picker. A selected, uploading or unresolved file blocks profile saves and destination/reference changes until completion or cancellation. Completed uploads no longer trigger a discard warning after the profile form is clean. Photo and CV detail requests handle failure independently, preserving the other preview and both reference IDs. Optional text is trimmed and blank values become null; email/phone inputs use their native input types. Social-link confirmations have corrected encoding and the UI explicitly explains that social links save separately from the profile. Five regression tests cover these behaviors; the complete suite now passes 567 tests. Read-only Chrome checks against the real backend passed at 375/768/1024/1440px without modifying owner data.

One typed Reactive Form edits first_name and last_name (required, 100), professional_title (150), short_bio (2000), biography (50000), email (320), phone (50), location (200), profile_media_id and cv_media_id. Optional text and media fields can be null. id, is_active and timestamps are read-only.

The existing ProjectMediaPicker, MediaApi.detail and MediaPreview are reused. Photography selects IMAGE. CV selects PDF or DOCUMENT, using real server-side type filters and pagination. The picker gained only an optional allowedTypes input; existing project/section use remains unchanged. Preview/download uses existing authorized access and short-lived Blob/Object URLs. No storage keys or signed URLs are constructed or persisted.

Selection/removal is a profile draft until Save. Removing an association sends null and never deletes the global asset or calls R2 PUT. Upload remains in `/admin/media`. FastAPI continues protecting photo/CV references against global deletion.

## Social links and services

Profile layout update: the photo appears first with the public Studio 4:5 crop and automatic authenticated preview, followed by the professional/contact form and a separate CV area. There is no public-profile preview panel. The profile heading/save action is outside the bounded content scroll area, so it remains visible without overlaying fields. Mobile uses one form column. Social create/edit now uses the existing native-dialog modal with dedicated copy, save/cancel actions, Escape handling, focus restoration and the existing discard confirmation; successful saves persist only the social link, not the profile form. The shared modal's original project draft description remains its default.

Social platform is a free name, not a fixed frontend enum. Fields are platform, HTTP(S) url without credentials, nullable username, sort_order and is_visible. Duplicate platforms produce a conflict. Services edit name, slug, nullable short_description/description/icon identifier, sort_order and is_visible. Slug/icon patterns and lengths match the current backend. No pricing, CTA or invented publication state exists.

Both collections support create/edit, confirmed delete, visibility and accessible Move up/Move down controls. Only finalized order is written, in sequential Reorder batches of at most 100 items. Failed writes keep data or reload authoritative state while preserving the error. Multi-batch ordering is not globally atomic; a failure reloads actual server order. No collaborative editing is implemented.

## Supported settings

Only these exact keys have explicit typed forms:

| Key              | Value   | UX validation                                     |
| ---------------- | ------- | ------------------------------------------------- |
| site_title       | string  | Nonblank, maximum 200, no HTML/control characters |
| site_description | string  | Nonblank, maximum 500, single-line plain text     |
| contact_enabled  | boolean | Explicit true or false; false is valid            |

Each Save writes only that key, preserving unsaved changes in other forms. No JSON editor or arbitrary JSON structure exists. Unknown response keys are displayed by name as unsupported, with no editor and no overwrite/delete. Current FastAPI itself allowlists the three keys and excludes legacy unknown records; defensive unknown handling is unit-tested.

## State, errors and accessibility

Profile distinguishes loading, empty, ready and error; photo/CV loading is separate. Collection state distinguishes loading/writing/error/empty. Settings distinguish loading, loaded and per-key saving. Signals remain local to each page; HTTP composition uses RxJS with destruction cleanup. Duplicate submits and conflicting writes are disabled. Backend 422 locations map to controls; common status/network/rate-limit errors reuse ApiError, including Retry-After. No internal diagnostics or session values appear in UI.

Component-scoped ContentDraft uses the existing accessible ProjectConfirm dialog for CanDeactivate. Profile includes unsaved social drafts; services/settings protect their own dirty forms. Clean forms navigate directly, active writes are protected, and expired authentication can leave without trapping logout. This protects Angular navigation, not browser-close or full reload. Native labels/fieldsets, status/alert messages, visible focus and keyboard reorder are retained. Styles stay encapsulated in admin content and reuse existing admin controls.

## Routes and loading

`/admin/profile`, `/admin/services` and `/admin/settings` are separate lazy-loaded components under the existing protected AdminLayout. `/admin/messages` remains a placeholder. Private routes retain client rendering; production SSR returns only the application shell without private data. No browser storage/platform access was added.

## Validation and development smoke

303 tests in 20 files pass, including 52 new content API/UI tests. Existing auth, upload, project and section tests remain intact. Chrome at localhost:4200 verified profile editing, photo/CV selection, private preview/download, reference conflicts, social/service editing/order/visibility, typed setting saves, reload persistence, dirty navigation and 375/768/1024/1440 widths. Temporary PNG/PDF files used the existing real R2 upload flow: OPTIONS/PUT/confirm, no Authorization to R2. PostgreSQL/R2 presence and definitive/staging cleanup were checked.

`npm run test:content:browser` uses the existing Chrome CDP approach, with private ignored development credentials. For an initially empty environment it requires ignored `.tools/content-initial.json` containing real first_name, last_name, site_title, site_description and contact_enabled supplied by the administrator. Existing content is backed up privately and restored. Because singleton/profile settings lack DELETE, user-approved real initial values remain; temporary photo/CV references, social links, services and media are removed via API. Existing collection order is restored. No backend source/configuration changes or direct database writes are performed.

Production build, strict templates/TypeScript, ESLint, Prettier, deterministic OpenAPI generation and SSR validation pass. Content components and media picker stay outside the initial public bundle. Phase 8 and public rendering are not implemented.
