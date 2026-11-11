# Public Project Portfolio — Phase 10

## Public contract and privacy

`PublicProjectsApi` uses HttpClient and API_BASE_URL with generated contracts:

- GET `/api/v1/public/projects`: `PagePublicProjectCard`; `limit` (1–100), `offset` (≥0), optional category slug (≤120) and tag slug (≤100).
- GET `/api/v1/public/featured-projects`: the same query/page contract, restricted to actual featured projects by FastAPI.
- GET `/api/v1/public/categories`: `PagePublicCategory`, paginated category options.
- Images use `PublicMedia.url` / `thumbnail_url` returned by those endpoints. Managed delivery URLs currently point to `/api/v1/public/media/{asset_id}/content`, returning local bytes or a 307 temporary signed R2 GET.

PublicProjectCard exposes title, slug, short_description, location, year, cover and categories. No administrative IDs, status, is_featured, area, coordinates or role are invented for the public UI. The detail-by-slug endpoint exists but is intentionally not consumed by Angular until Phase 11.

Read-only inspection confirmed list/featured criteria: PUBLISHED + PUBLIC + deleted_at IS NULL. DRAFT, PRIVATE, ARCHIVED, UNLISTED and deleted projects are excluded by FastAPI, never filtered as a frontend security measure. PUBLISHED/UNLISTED is permitted by the direct backend detail contract; the Phase 10 placeholder does not fetch it. Ordering is sort_order ascending, published_at descending/nulls last, then slug. Categories only include active categories associated with publicly listed projects. No search, year or ordering controls exist in the public API.

## Selection and state rules

Home fetches a first page of 12 projects, first featured item and real category options. Selected Projects is the first four entries of that authoritative initial list, retained when the separate Index changes filters/pages. Hero uses the first featured item; when there is none, it uses the first image-covered project on the initial page, otherwise the first listed project. Without any projects it shows a non-photographic, neutral heading. Featured is omitted when its endpoint returns no entries; its failure does not hide a successful main collection.

`PublicProjectCollection` is provided per Home/projects page. Signals hold query, authoritative page, initial selection, loading/error and taxonomy. RxJS switchMap cancels stale list requests. Previous entries remain during minor refresh; failures preserve them and show safe retry feedback. Category pages are combined only for filter choices; project collections are never eagerly fetched in full. Requests time out after 10 seconds. Common ApiError parsing is reused; public messages conceal internal details while Retry-After remains available.

## Routes, filters and pagination

- `/`: Selected Projects, Project Index and Featured Project.
- `/projects`: real public exploration with Index and editorial image sequence.
- `/projects/:slug`: minimal, explicitly reserved detail placeholder; no sections/detail API call or Phase 11 renderer.

Category controls use backend slugs with accessible aria-pressed states. Optional tag slug input applies on change, using backend slug constraints, without a fake local search. `/projects` synchronizes category/tag/limit/offset query params; invalid values normalize before HTTP. Home Index state is local. Previous/Next uses the server limit/offset/total and blocks duplicate navigation while loading. Reload and Back preserve project-route context. An out-of-range nonnegative offset has a distinct empty-page message and an accessible return-to-first-page action. Pagination counts are derived only in presentation; no page/totalPages API fields are introduced.

## Media and visual translation

PublicCover receives PublicMedia, uses thumbnail_url when available for grid/hover, original url for Hero/Featured, native image loading and optional dimensions. Aspect-ratio frames prevent layout shift even when the backend omits dimensions. Hero is eager/high priority, other images lazy. Missing, non-image or failed covers use labelled rectangular fallbacks; failures do not loop. No MediaBrowser, administrative media API, Blob, base64, storage_key or constructed R2 URL. Temporary signed URLs are not persisted. Managed public delivery requires the backend public-access media policy plus a qualifying live reference; a private asset can therefore yield the safe unavailable-image fallback even if its project has a cover relation. Managed delivery redirects are followed by the browser, which can request a fresh signed target through the stable public URL on reload.

The Figma ZIP and screenshots were revisited for 8/5/6/9-column spans, 16:10/4:5 frames, offset third/fourth projects, large imagery, numbered metadata, thin Index rules and full-width dark Featured. Mobile becomes a single generous sequence. Prototype side quotations, fake coordinates, role, area and status metadata were omitted because the card contract does not provide them. Hero/Featured show only real title/category/location/year/short description. Long titles expand Hero vertically rather than being clipped. Brand and Studio/Services/Contact remain Phase 9 placeholders; no profile/content endpoint is called.

ProjectPreview, PublicProjectGrid, ProjectIndex, ProjectSpotlight and PublicCover share the public tokens and Phase 9 reveal/motion foundation. Hover image/title changes are small. The Index floating preview is decorative, created only on fine-pointer desktop and after actual hover, throttled with requestAnimationFrame and clamped to viewport. It is absent on touch/mobile/reduced motion. Observers, listeners and frames are cleaned up. Native links, headings, labels, visible focus and keyboard filters/pagination retain accessibility.

## SSR and deployment

SSR renders the real project collection before hydration. FastAPI returns Cache-Control:no-store, so Angular's normal HTTP transfer cache correctly refuses these responses. The public API therefore uses Angular TransferState for a per-render snapshot, keyed by public URL/query, consumed once on hydration and removed. Subsequent navigation/filter/retry requests go to FastAPI. Failures also transfer only status/Retry-After once, excluding detail and diagnostic IDs, so hydration does not duplicate a failed request or expose internal error content. This is neither a shared cache nor persisted browser state; only data already rendered publicly is serialized. The production Express HTML handler also sets no-store to prevent stale visibility in shared SSR caches.

Production SSR may receive a public `API_BASE_URL` environment variable; otherwise it uses the configured production environment URL. The normalized, non-secret URL is transferred to the hydrated client. It must be reachable from both server and browser. Deployment must still configure `environment.ts` for direct client-rendered administrative routes; an SSR-only URL override does not replace that existing requirement. There is no implicit local production fallback. Development continues using its existing localhost:4200 proxy. Production SSR validation supplies the local backend URL explicitly for tests.

Public pages do not inject AuthService or read sessionStorage. The existing interceptor returns immediately for public requests, without Authorization or refresh. The administrative API/services/guards/storage strategy are unchanged. Public code and routes remain lazy and do not import admin features.

## Tests and real integration

481 tests across 31 files pass (42 original Phase 10 tests and two additional category recovery tests). API tests cover real paths/params, featured, category pagination, public delivery fields, no Authorization even with admin credentials available, public 401 without refresh, ApiError/Retry-After and one-time SSR snapshot consumption. UI tests cover 0/1/2/4/7 projects, Selected cap, Hero/Featured fallback, empty/error/retry, stale request cancellation, filters, paging, query reload/navigation, slug placeholder, image failures and decorative pointer bounds. Category failures can be retried independently without reloading the project collection, with a loading announcement and duplicate-request prevention.

The October 12 revalidation passed OpenAPI regeneration without contract changes, ESLint, Prettier, strict TypeScript/templates, production build and SSR validation. The real public browser smoke passed all four requested widths, hydration, privacy and R2 delivery. Administrative modal/accept/cancel/preview/final-save regression passed using intercepted fixtures; the authentication browser smoke passed against the real backend, including three concurrent 401 responses coordinated through one refresh. Its outdated positional mobile-menu selector was replaced with the actual Profile route. No administrator UI styles or backend code were modified.

`npm run test:public-projects:browser` prepares isolated records through admin API in a Node fixture script, never Angular public UI. A public-access temporary image follows presign → direct R2 PUT → confirm; PostgreSQL and R2 presence are verified. Four PUBLIC/PUBLISHED projects and excluded fixtures exercise real Home, Index, Featured, categories/tag, pagination, Back/reload, slug links and public media in Chrome at 375/768/1024/1440. The unauthenticated browser has empty sessionStorage and network assertions exclude Authorization/admin/auth/refresh. Initial list/category/featured queries are not repeated after SSR hydration. Real signed R2 image GETs are observed.

Privacy checks exclude DRAFT, PRIVATE, ARCHIVED, UNLISTED and a soft-deleted DRAFT fixture from both discovery endpoints. The DRAFT deletion fixture deliberately has no media relation, so it can be cleaned solely through APIs after soft delete; the separate read-only repository inspection confirms deleted_at exclusion independently of status. Direct UNLISTED backend access is checked only by the fixture script. Real fixture titles are also expanded temporarily to verify mobile/desktop long-title layout.

Cleanup clears fixture references before project soft delete, removes temporary categories/tags/media and verifies definitive/staging R2 and PostgreSQL media cleanup with the existing smoke verifier. Soft-deleted project rows and terminal storage records remain as permitted history. Existing content is untouched; no public project is retained merely to fill the UI. Screenshots remain ignored in `.tools/public-projects-*.png`. Visual comparisons cover Hero, Selected grid, Index, floating preview and Featured against the actual ZIP/screenshots and PUBLIC_UI. Real auth regression retains 3×401 → 1 refresh → 3 retries.

## Limitations / next phase

The initial Home selection is limited to its first 12 backend-ordered records. Hero has no dedicated configured project: it follows the documented deterministic selection rule. Only category/tag filters are available; tags are exact slugs. The list contract lacks area/status/role and rendition sizes, so those prototype fields are omitted and original images are used when no thumbnail is supplied. Phase 11 subsequently replaces the slug placeholder with real detail and dynamic sections; see [Public Project Detail](public-project-detail.md). The Phase 10 browser regression now checks that destination without introducing administrative components into public pages.

## Approved cover proportions — 2026-10-27

Recommend horizontal 2400 × 1500 px (16:10) uploads. The project cover editor
shows the complete image with object-fit: contain in a 16:10 neutral frame;
it does not crop or deform the uploaded file. Public project cards all use
16:10, including the smaller card in the editorial grid and mobile layouts.
The existing asymmetrical grid widths remain. Cards fill their frame without
stretching, so images with other proportions may still lose edges. Hero and
featured banners use a full-bleed layout with text over the image and a dark
overlay on desktop and mobile. The homepage hero, featured banner below the
project grid and opening banner of each project detail use object-fit: fill:
their images stretch to the frame without cropping. Cards retain object-fit: cover.
The original file is never resized or overwritten. The experimental blurred background and
stacked mobile layout were reverted at the owner's request. No AI-generated
content, upload processing, backend contract or original file changes are involved.
