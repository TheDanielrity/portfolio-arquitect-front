# Public Foundation — Phase 9

## Visual sources

Priority: `docs/design/PUBLIC_UI.md`, `docs/design/source/Portfolio website for architect.zip`, then available screenshots `docs/design/references/home-desktop.png`, `home-mobile.jpg` and `project-grid.png`. The requested `references/ui/` and `references/moodboard/` directories were absent. The ZIP was inspected/extracted only into ignored `.tools/figma-public-reference/`, remained unchanged, and its project was neither installed nor executed. Header, hero, mobile navigation, reveal behavior, grid and Footer were studied. React, JSX, Tailwind, hooks, router and demo identities/data were translated into Angular rather than imported.

## Design system

`public-tokens.scss` scopes the exact approved palette to PublicLayout: warm background #f8f8f5, foreground #20211e, rust #ac3c29, secondary #ecece6, muted #e6e6df/#65665f, border #cdcec6, dark #22241f/#f4f4ec, white primary foreground and rust focus ring. Geometry remains square (radius 0). No decorative gradients, rounded cards or public UI library.

Manrope display, DM Sans body and DM Mono technical labels are centrally self-hosted WOFF2 files with font-display swap and bundled OFL licenses. Latin subsets support the current English and Spanish text; additional writing systems may require more subsets. No Google Fonts runtime request. Fluid clamp scales, a 12-column editorial grid, 24/48/64px gutters and fluid section spacing support future compositions without a utility framework. Styles remain inside public components; global/admin styles are unchanged.

## Layout and navigation

PublicLayout contains a keyboard-visible skip link, PublicHeader, one focusable main/router outlet and PublicFooter. English copy is scoped with lang=en. Header is fixed, transparent over routes carrying publicHero=true, warm after 50px scroll or on other pages. Four native anchors lead to explicitly temporary Projects, Studio, Services and Contact markers on Home; these are not domain pages.

Below 1024px, Menu opens a full-screen native modal dialog with large numbered links. Native modal semantics provide focus containment and inert background; Close, Escape and navigation dismiss it. Previous body overflow is restored; Escape/Close restore the opener. Crossing the desktop breakpoint closes the menu and focuses the brand. Browser listeners are installed afterNextRender and disposed on destruction. Angular navigation also closes it. Footer remains restrained with neutral branding, a temporary-content note and a native back-to-top anchor. No fictitious identity, location, email, social accounts or statistics.

## Motion and SSR

The small shared reveal directive observes only offscreen content after browser rendering. SSR/no-JavaScript content is visible. IntersectionObserver and media listeners are disposed. Shared SCSS mixins provide reveal and restrained image-hover behavior. Reduced motion disables reveal transforms/transitions, image hover, menu animation and header transitions. No parallax or forced smooth scrolling.

There are no browser-only global accesses during SSR and no viewport-derived initial markup. Home is server-rendered with meaningful header/hero/footer HTML; administrative routes retain their client-only private shell policy. The temporary Phase 1 healthCheck Home diagnostic and unused flag were removed; HealthApi remains tested independently. No public/backend/domain request occurs on this foundation.

## Temporary content

PORTFOLIO STUDY is neutral temporary branding. Space / Matter / Experience and the foundation sample copy are visual placeholders. `public/images/foundation-study.jpg` is an original generated architectural study, visibly labelled temporary and explicitly described as not a built project in its alt text. It is not a Figma screenshot or an Unsplash/demo project. Phase 10 can replace hero/project-oriented presentation with confirmed portfolio content; identity/Studio/Services/Contact content belongs to their later public phases. The four destination markers only validate navigation, typography and spacing.

## Validation

368 tests across 23 files passed: 24 new layout/menu/reveal tests, with three retired Home diagnostic tests removed. Health API coverage remains. Existing authentication, uploads, projects, sections and content/contact tests pass unchanged. Lint, formatting, strict TypeScript/templates and production build are required alongside browser checks.

`npm run test:public:browser` uses existing Chrome DevTools Protocol tooling without dependencies or domain fixtures. Real Chrome checks 375/768/1024/1440px, no horizontal overflow, transparent/solid header, keyboard skip link, native modal containment, Escape/focus restoration, anchor close, desktop resize, scroll restoration, self-hosted fonts, no-JS visibility, reduced motion, hydration and zero API calls. Temporary screenshots remain ignored under `.tools/public-*.png`; desktop/mobile/menu were visually compared to the supplied sources. `npm run validate:ssr` covers Home/login and all administrative routes. `npm run test:auth:browser` verifies real login/me, admin navigation, 3×401 → 1 refresh → 3 retries, restoration and logout.

## Limitations and next phase

No public domain page or renderer is implemented. Navigation intentionally reaches temporary in-page markers until real destinations exist. Native dialog and IntersectionObserver rely on modern browser support (observer absence leaves content visible). The visual composition follows approved proportions but uses a temporary original image and shorter neutral copy, so it is not a pixel-identical reproduction of demo content. Phase 10 remains pending; this layout/grid/token/motion foundation is ready for its project portfolio work.

## Phase 10 shared updates

The following notes describe the Phase 10 snapshot; Phase 12 replaces its remaining temporary content as documented below.

The temporary project composition is now replaced by the real public portfolio; see [public-projects.md](public-projects.md). Home consumes only public projects/featured/categories. Studio/Services/Contact and neutral branding remain temporary. The original generated image stays as a documented static reference/smoke asset, but Angular no longer uses it as a fallback project image.

Public HTTP SSR snapshots now use one-time Angular TransferState because FastAPI intentionally returns no-store. Production HTML also preserves no-store. API_BASE_URL can be supplied to SSR and the normalized public URL is transferred to hydration; direct CSR/admin deployment still needs the existing environment configuration. Header/menu/focus/tokens/fonts and the Phase 9 motion foundation remain intact. The foundation browser smoke now allows public API calls while rejecting private/auth requests; it also validates the genuine empty collection after fixture cleanup.

## Phase 12 shared updates

Studio, Services, Contact and footer/header identity now consume real public content. See [public-content-contact.md](public-content-contact.md) for contracts, form behavior and validation. Shared public read snapshots preserve the existing project behavior; contact submissions are never cached. Header and mobile-menu anchors work from all public routes, with the real header height included in the scroll offset after hydration. Missing optional content is omitted or presented as an honest empty state. No additional route or dependency was introduced, and Phase 13 remains pending.
