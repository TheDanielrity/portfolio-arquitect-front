# Public Project Detail — Phase 11

## Public contract and visibility

`PublicProjectsApi.detail(slug)` uses GET `/api/v1/public/projects/{slug}` and generated `PublicProjectDetail`, `PublicSection`, `PublicSectionMedia`, `PublicAttribute` and `PublicMedia`. The existing public HTTP infrastructure transfers a per-render response or safe error snapshot once during hydration. It never injects administrator services, sends Authorization or refreshes credentials. No generated contract was edited; regeneration against the running FastAPI instance remained identical.

FastAPI is authoritative: direct detail permits PUBLISHED PUBLIC and PUBLISHED UNLISTED projects, excluding drafts, private, archived and soft-deleted records. Inaccessible records return 404 without revealing whether they exist. Discovery excludes UNLISTED. Backend inspection confirmed these criteria and the ordering of attributes, visible sections and section media. These public arrays have no visibility or sort-order fields, so Angular preserves their order instead of inventing another policy.

## Page and components

`/projects/:slug` now lazy-loads `ProjectDetail`, replacing the removed pending screen. The case study keeps the approved Manrope/DM Sans/DM Mono typography, straight geometry, dark full-bleed Hero, technical metadata, offset narrative, large photographs, split composition and image-backed Next Project link. The ZIP's ProjectPage, ProjectHero, ProjectGallery and screenshots were inspected. Reference demo copy, fictitious metadata and contact content were not copied. The existing footer remains; Phase 12 is pending.

`projectFacts` shows populated location, year, area with m², client, categories, tags and ordered attributes. Attributes repeating a primary displayed value are omitted; distinct attributes sharing a value remain. Narrative and section content use interpolation and preserve line breaks, without interpreting HTML. Missing optional metadata and empty section collections do not create placeholders or fictitious content.

`ProjectSectionRenderer` handles all seven supported types:

| Type | Presentation |
| --- | --- |
| TEXT | Numbered narrative with readable prose width |
| IMAGE | Large image with intrinsic ratio and caption |
| GALLERY | Deterministic editorial sequence with large frames, diptychs and offsets; stacked on mobile |
| VIDEO | Native accessible controls, playsinline, preload none, no autoplay |
| MODEL_3D | Automatic browser loading of its section asset, no model tabs, camera controls, loading/error/retry states |
| QUOTE | Large plain-text blockquote, generous spacing and fine rules |
| SPLIT | Image beside title/prose, stacked on mobile |

Unknown future types and incomplete media relations show a safe unavailable state. Gallery duplicate URLs are removed without changing the surviving order or captions. Additional project media not used by the cover or a section are shown once, supporting images, videos, models and document links. Deliberate repeated images across separately configured sections remain: removing them would alter the author's content.

## Public media and 3D

`PublicSectionMediaView` reuses Phase 10 `PublicCover`. Images use supplied thumbnail/original URLs, alt text, intrinsic dimensions when available, stable aspect ratios and lazy loading. Hero prioritizes its real cover; a missing cover uses the existing dark photographic-free treatment. Image failures, video errors and model failures preserve the page and captions.

`@google/model-viewer` 4.4.0 is the sole new direct dependency; see its [official documentation](https://modelviewer.dev/docs/). It provides a maintained GLB viewer rather than a custom Three.js implementation. Per the current user instruction, it is dynamically imported automatically after the first browser render, with no activation button or model tabs. Its module and model remain absent during SSR. The production viewer chunk is approximately 1.04 MB raw / 241 kB estimated transfer, excluded from the approximately 330 kB initial browser bundle. Each section displays only its own backend-approved `model/gltf-binary` asset. No GLTF, AR or model animation autoplay is enabled.

Models require browser fetch CORS, unlike ordinary images. The real test initially exposed the absolute backend → R2 redirect issue already documented for private delivery. `PublicMediaDelivery` preserves a supplied managed public content endpoint but uses the configured API origin, allowing the existing same-origin development/reverse proxy to deliver its redirect. It never constructs R2 URLs from storage keys and leaves CDN URLs, query-bearing URLs and signed object URLs unchanged. Production must provide a compatible public API/reverse proxy and R2 GET CORS. Signed destinations remain temporary; retries use the stable public endpoint again. No backend, bucket or PostgreSQL configuration was modified.

Model controls support pointer/touch and keyboard rotation/zoom. Loading has a 30-second timeout, safe error text and retry. WebGL is required; unavailable devices receive the fallback. The maintained viewer's optional compressed-asset decoders retain upstream behavior; this phase verified a self-contained uncompressed GLB and did not certify every compression extension. Videos currently have no separate subtitle-track relation in the public contract.

## Next project

GET `/api/v1/public/projects` is paginated at 100 records until the public ordered collection is complete. The successor is the following slug in backend order, wrapping to the first. When the current project is UNLISTED, the first discoverable project is selected. No other eligible project means no link; discovery failure leaves the detail usable and omits the recommendation. No unsupported next-project endpoint or relationship was invented. This complete scan is deterministic but may require multiple requests for a large collection.

## SSR, accessibility and validation

Server HTML contains the public title, facts, narrative, section text and captions. Per-render TransferState avoids duplicate initial public queries, including safe error responses. Production HTML retains no-store. Missing projects return HTTP 404; other initial detail failures return 503 with safe visitor-facing text. Route changes cancel stale requests and clear the preceding project. Page titles derive from real project/SEO title; advanced SEO remains outside this phase.

Semantic article/sections, h1/h2 hierarchy, dl facts, blockquotes, figures, native video controls, real slug links, existing focus styles and reduced motion are retained. Responsive Chrome checks cover 375, 768, 1024 and 1440 px without horizontal overflow. Touch layouts stack the split and gallery. Screenshots under ignored `.tools/public-projects-detail-*.png` cover Hero, facts, gallery, split and model.

`npm run test:public-detail:browser` extends the existing Phase 10 Chrome harness. Only its Node fixture setup uses administrator APIs: it creates isolated projects, ordered attributes, all seven visible sections and one hidden section; uploads two public images, a timed browser-recorded WebM and a valid triangle GLB through presign → direct R2 PUT → confirm. The anonymous Angular browser uses only public reads. Tests cover real playback, lazy model activation/CORS, multimedia error/retry, visible order, captions, UNLISTED direct access, inaccessible 404, SSR text, hydration, Next Project, four widths and reduced motion. The same run then rechecks Phase 10 Home, filters, pagination, query reload/Back and slug navigation.

Cleanup deletes section references first, clears taxonomy/media relations, soft-deletes only temporary projects and deletes temporary media through APIs. The existing scoped development verifier confirms PostgreSQL media and definitive/staging R2 objects are absent and clears only the named fixture's retained staging bytes. Backend-permitted soft-delete and terminal technical history remain. Owner projects are never altered.

Administrative regression checks use the existing intercepted modal/accept/cancel/preview/final-save browser test and real FastAPI authentication smoke, including three concurrent 401s coordinated through one refresh. Unit tests cover detail errors/retry/cancellation, attributes, optional data, all seven types, safe text, missing files, ordering, media failure, public delivery, successor pagination and one-time hydration. Full suite, OpenAPI consistency, ESLint, Prettier, strict TypeScript/templates, production build and SSR are required for completion.

## Remaining scope

Validation on October 12: 517 tests passed in 32 files, with 36 new Phase 11 cases. OpenAPI consistency, ESLint, Prettier, strict TypeScript/templates, production build and SSR including a real HTTP 404 passed. Chrome detail/media/privacy/hydration and Phase 10 regression passed at all four widths; administrative drafts and real authentication regressions passed. Headless GLB rendering uses Chrome's software WebGL path; the smoke does not certify every device/GPU combination. No backend source, owner content or administrator UI styling was changed.

No lightbox or carousel was necessary for the editorial gallery. No rich-text, section alignment, attribution, subtitle, dedicated next-project or rendition-selection fields exist in the contract. Original images remain necessary where thumbnails/dimensions are absent. Heavy viewers load on demand. Production CORS/proxy configuration must match the deployment. Profile/services/contact and advanced metadata remain for their planned phases; Phase 12 was not implemented.
