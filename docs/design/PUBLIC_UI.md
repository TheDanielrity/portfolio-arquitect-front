# Public Portfolio UI — Visual Source of Truth

## Approved homepage update — 2026-10-27

The current user-approved sequence is projects, services, then personal/contact
information and social links on the dark background. Omit the Studio presentation,
portrait, large conversation CTA and enquiry form from the homepage. Remove Studio
from public navigation. These instructions supersede the original sections below
where they conflict.

Provide a floating WhatsApp chat link across public routes. Configure it in
Administration → Perfil → Enlaces sociales → Configurar WhatsApp, using the existing
visible social link with platform `WhatsApp` and a chat URL such as
`https://wa.me/51987654321?text=Hola`. Hiding or deleting that link removes the
floating button. No separate backend field is required. The phone contact remains
independent. Do not guess that every phone number supports WhatsApp.

## Visual reference files

The public header logo uses a monochrome treatment. Over a hero, sample the
displayed cover region behind the logo, including its dark overlay, and choose
white or black by contrast. Recalculate after image changes and viewport resize.
Use white when image sampling is unavailable. A solid header or open menu uses
black. Sampling runs only in the browser and must not block image rendering.

The following files are visual references for the public portfolio:

- `docs/design/references/home-desktop.png`
- `docs/design/references/home-mobile.png`
- `docs/design/references/project-grid.png`

When implementing public-facing UI:

1. Read `docs/design/PUBLIC_UI.md`.
2. Inspect the relevant reference images.
3. Use the images as visual guidance for composition, spacing, typography scale, proportions and responsive behavior.
4. Do not copy fictional text or demo content from the images.
5. Use real FastAPI data for production content.
6. Preserve the design language rather than recreating the image pixel-for-pixel at the expense of responsiveness or accessibility.


## 1. Purpose

This document defines the visual and interaction direction for the public-facing architecture portfolio.

It applies only to the public website and public-facing components.

The exported Figma Make project provided for this portfolio is the primary visual reference. The Angular implementation must preserve its visual language, proportions, hierarchy, rhythm, and behavior while replacing the prototype's fictional content and technical stack with the real application data and Angular architecture.

This document is the visual source of truth for public phases.

---

## 2. Primary Visual Reference

The Figma Make export is the main visual reference for:

- typography hierarchy;
- color palette;
- spacing;
- editorial grid;
- image proportions;
- project presentation;
- navigation behavior;
- hero composition;
- mobile menu;
- restrained animation;
- section rhythm;
- project detail composition;
- contact CTA;
- footer treatment.

Do not redesign the public portfolio into a different visual language.

Do not preserve the Figma implementation stack. Reproduce the design in the existing Angular application.

The Figma export currently uses React, Vite, Tailwind CSS and static/Unsplash content. The production implementation must continue using the project stack:

- Angular 22;
- standalone components;
- Angular Router;
- Angular HttpClient;
- Signals/RxJS where appropriate;
- SCSS;
- SSR/hybrid rendering;
- FastAPI;
- PostgreSQL;
- Cloudflare R2.

The Figma export is a design reference, not an architectural dependency.

---

## 3. Core Visual Direction

The public portfolio should feel:

- architectural;
- editorial;
- contemporary;
- restrained;
- premium;
- highly visual;
- deliberate;
- spatial rather than card-based.

The work must remain the primary visual protagonist.

The interface should resemble an architecture publication or studio portfolio rather than:

- a SaaS landing page;
- an admin dashboard;
- a developer portfolio;
- a generic agency template;
- a Bootstrap-style website.

---

## 4. Visual Tokens

Use the following visual tokens as the baseline extracted from the approved reference.

```scss
:root {
  --public-background: #f8f8f5;
  --public-foreground: #20211e;

  --public-primary: #ac3c29;
  --public-primary-foreground: #ffffff;

  --public-secondary: #ecece6;
  --public-muted: #e6e6df;
  --public-muted-foreground: #65665f;

  --public-border: #cdcec6;
  --public-ring: #ac3c29;

  --public-dark: #22241f;
  --public-dark-foreground: #f4f4ec;

  --public-radius: 0px;
}
```

These values are the default visual direction.

Do not introduce a competing palette unless the user explicitly approves a redesign.

### Color usage

- Background: warm off-white, not pure white.
- Main text: near-black/charcoal, not pure black where avoidable.
- Accent: terracotta red used sparingly.
- Secondary surfaces: soft warm grays.
- Dark CTA/footer-adjacent sections: charcoal.
- Project imagery should provide most of the page color.

Do not introduce decorative gradients.

---

## 5. Typography

The user-selected family for the entire application is `Century Gothic`.
Display headings, body text, editorial labels and controls share the global
`--font-sans` stack, while retaining their individual sizes, weights and spacing.

Century Gothic is resolved from the visitor's installed fonts. The fallback stack
is `CenturyGothic, AppleGothic, Arial, sans-serif`. No Century Gothic webfont files
are bundled; consistent rendering on devices without the font requires licensed
webfont assets. Do not copy operating-system font files into the application.

---

## 6. Typography Hierarchy

Large typography is a central part of the design.

### Hero

Use responsive display sizing conceptually equivalent to:

```css
font-size: clamp(54px, 7.75vw, 126px);
line-height: 0.99;
letter-spacing: -0.045em;
text-transform: uppercase;
```

The exact implementation may be adjusted for Angular/responsive needs, but the visual scale must remain comparable.

### Featured project / major CTA

Very large text may reach approximately:

```css
font-size: clamp(60px, 12vw, 180px);
```

or, for the contact statement:

```css
font-size: clamp(46px, 8.7vw, 140px);
```

### Section titles

Typical reference range:

- mobile: ~30–40px;
- desktop: ~50–68px.

### Small labels

Use compact uppercase mono labels around:

- ~10px;
- increased letter spacing;
- visually subordinate to imagery and titles.

Do not inflate labels into large UI chips.

---

## 7. Global Layout

Use strong horizontal margins instead of generic centered cards.

Reference spacing:

```scss
padding-inline:
  24px on mobile;
  48px around tablet;
  64px on large desktop;
```

Equivalent responsive Angular SCSS is acceptable.

The layout should feel broad and editorial.

Avoid wrapping every section in the same narrow `max-width` container.

Some sections should span the full viewport.

---

## 8. Corners, Borders and Surfaces

The approved design uses essentially square geometry.

Default:

```scss
border-radius: 0;
```

Do not add rounded cards globally.

Prefer:

- whitespace;
- thin borders;
- image edges;
- alignment;
- hierarchy.

over:

- shadows;
- rounded panels;
- floating cards;
- glassmorphism.

Shadows should be rare and functional, such as a floating hover preview when needed.

---

## 9. Public Header

The public header is fixed.

### Default over hero

- transparent;
- white text;
- minimal visual chrome.

### After scrolling

Transition to:

- warm background;
- dark text;
- subtle backdrop blur if appropriate.

The transition should feel smooth and restrained.

### Brand block

Reference structure:

```text
NAME
SURNAME.   | ARCHITECTURE
             & DESIGN
```

The real profile/branding data should replace prototype text.

Do not hardcode the fictional Figma identity.

The accent dot may use the terracotta primary color.

### Desktop navigation

Reference navigation:

- Projects
- Studio/About
- Services
- Contact

Exact labels should match the final information architecture.

Navigation must remain lightweight.

### Contact navigation item

May include a restrained arrow indicator such as `↗`.

---

## 10. Mobile Navigation

On mobile/tablet, use a full-screen navigation treatment inspired by the reference.

Characteristics:

- full viewport;
- warm background;
- large display links;
- numbered items;
- small location/supporting line;
- explicit Menu / Close control;
- body scroll locked while open;
- Escape closes;
- focus management;
- keyboard accessible.

Do not reduce it to a tiny generic dropdown.

The mobile menu should feel intentionally designed.

---

## 11. Homepage Structure

The reference establishes the following overall rhythm:

```text
Header
↓
Hero
↓
Selected Projects
↓
Project Index
↓
Featured Project
↓
Studio / About
↓
Services
↓
Visual Explorations
↓
Contact CTA
↓
Footer
```

This order is the baseline.

Sections may be conditionally omitted only when the real backend has no relevant public content.

Do not replace this with a generic marketing sequence.

---

## 12. Homepage Hero

The hero should occupy approximately:

`92svh`

with an appropriate minimum height.

### Visual behavior

- one strong project/architectural image;
- full bleed;
- darkened slightly for text contrast;
- very large uppercase display headline;
- small technical/editorial labels;
- bottom metadata/navigation line;
- restrained scroll indicator;
- optional very subtle scroll-driven image scale/translation.

The hero should not use:

- centered pill CTA;
- gradient blobs;
- floating cards;
- multiple buttons;
- generic "Hello, I am..." copy.

### Content source

The production hero must use real content.

Prefer backend-driven content such as:

- featured project;
- configured site/profile data;
- current published content.

Do not keep prototype text like:

`ARCHITECTURE THAT SHAPES EXPERIENCE`

unless explicitly approved as real copy.

---

## 13. Selected Projects

This section should visually match the reference's asymmetrical editorial grid.

Characteristics:

- large project imagery;
- varied image proportions;
- different column spans;
- intentional vertical offsets;
- project number;
- project title;
- project type/category;
- location;
- year;
- subtle hover image scaling;
- restrained "View project ↗" affordance.

Do not normalize all projects into identical cards.

### Desktop composition

Use an editorial multi-column grid.

Example visual rhythm:

- first project wide;
- second more vertical;
- third shifted down;
- fourth wide and offset.

The exact arrangement may respond to the number of projects available.

### Mobile

Collapse into a strong single-column or simplified sequence while preserving:

- generous image size;
- metadata;
- typography;
- spacing.

Do not attempt to preserve desktop asymmetry if it harms mobile readability.

---

## 14. Project Cards

Project previews should not look like product cards.

Do not add:

- boxed backgrounds;
- rounded corners;
- permanent shadows.

A preview consists primarily of:

- image;
- title;
- project number;
- restrained metadata.

Reference image ratios include:

- `16 / 10`;
- `4 / 5`.

Do not force every image to a square.

Hover on pointer devices may:

- scale image gently;
- reveal "View project ↗";
- shift title a few pixels.

Motion must remain subtle.

---

## 15. Project Index

The reference includes a dedicated project index separate from the visual selected-project grid.

This should be preserved when supported by Phase 10.

### Header

Large:

`PROJECT INDEX.`

with accent punctuation.

### Filters

Compact mono uppercase controls.

Use real public filters supported by FastAPI, such as category or other actual backend contracts.

Do not preserve prototype-only filter categories if they do not exist in real data.

### Rows

Each row may show:

- sequence number;
- project name;
- type/category;
- location;
- year;
- arrow.

Use thin separators.

### Desktop hover preview

On large pointer-capable devices, hovering a row may show a floating project image near the cursor.

Rules:

- decorative only;
- never required to understand the row;
- hidden on touch/mobile;
- must remain inside viewport bounds;
- should not create layout shift.

---

## 16. Featured Project

The reference uses a full-width dark, image-backed featured-project section.

Characteristics:

- nearly full viewport visual presence;
- background project image;
- dark overlay;
- white typography;
- enormous project title;
- concise narrative;
- "Explore project ↗";
- project metadata at the bottom.

Use a real featured project from the backend.

If no project is featured, either:

- select an approved fallback according to product rules;
- or omit the section cleanly.

Do not hardcode a fictional project.

---

## 17. Project Metadata

Project metadata should feel editorial, not like form fields.

Use a responsive grid with thin top borders.

Possible real fields:

- Location
- Year
- Area
- Status
- Category/Program
- Project attributes

Only render data actually available from the public API.

Do not invent values such as "Role: Design & direction" unless real data supports them.

Use mono labels and regular body values.

---

## 18. Studio / About Section

The reference pairs:

- large architectural statement;
- concise biography;
- optional supporting link;
- quantitative highlights;
- large portrait/studio image.

In production:

- profile content must come from the public API;
- profile image must use the backend media-delivery flow;
- social/profile data must not be hardcoded.

### Statistics

The Figma prototype contains illustrative numbers such as project count, years of experience, and cities.

Do not hardcode fake statistics.

Only show statistics that can be derived reliably or are represented by approved backend content.

If unsupported, omit them rather than invent them.

---

## 19. Services

The reference uses a split section:

- left: section heading + responsive image;
- right: large stacked service rows.

Services are not cards.

### Interaction

On pointer/focus:

- active service can change the supporting image or visual state.

All interactions must work with keyboard focus as well as hover.

### Data

Use visible services from the public API.

Do not assume exactly five services.

The UI must adapt to the number of services returned.

If no image relation exists for services in the real contract, do not invent per-service media fields. Use an approved shared/supporting visual strategy instead.

---

## 20. Visual Explorations

The reference includes an editorial media area titled conceptually like:

`VISUAL EXPLORATIONS.`

This is a secondary visual section for architecture-related images/studies.

Its final data source must be grounded in real backend capabilities.

Do not invent an unsupported public media gallery API.

Possible implementation strategies must be chosen only from actual available data, for example:

- selected/featured projects;
- project media exposed publicly;
- approved content represented by public API.

If the backend cannot support this section cleanly at Phase 9/10, preserve the design intent but defer real population rather than hardcoding Unsplash images.

### Layout

Use staggered columns and mixed vertical offsets.

On click, an image may open in an accessible lightbox if the content source and phase scope justify it.

---

## 21. Contact CTA

The approved reference uses a full-width dark section.

Baseline colors:

```scss
background: #22241f;
color: #f4f4ec;
```

Characteristics:

- small editorial label;
- availability/status line only when supported by real content;
- massive multiline headline;
- accent hover;
- contact information;
- social links;
- location.

Example visual rhythm:

```text
LET'S CREATE
SOMETHING
REMARKABLE ↗
```

The exact copy should be real/approved content.

Do not keep prototype email, social URLs, identity or location unless they match the real profile.

Phase 12 will integrate the actual public contact flow.

---

## 22. Footer

Keep the footer lightweight.

Potential content:

- real name/studio title;
- current year;
- architecture/design descriptor;
- Back to top.

Avoid a large multi-column corporate footer unless later explicitly requested.

Back-to-top interaction must respect reduced motion.

---

## 23. Project Detail Page

The Figma project detail is the visual baseline for Phase 11.

Recommended sequence:

```text
Fixed public header
↓
Project Hero
↓
Project Metadata
↓
Intro / project narrative
↓
Dynamic Project Sections
↓
Next Project
↓
Contact CTA
↓
Footer
```

Do not create a generic blog article layout.

---

## 24. Project Detail Hero

Use the project's real cover media.

Characteristics:

- approximately `92svh`;
- full bleed;
- strong image;
- darkened for readability;
- title in oversized uppercase display typography;
- project type/year label;
- location;
- scroll cue.

Do not construct direct R2 URLs.

Use the public backend media-delivery contract.

---

## 25. Dynamic Project Section Rendering

The backend supports:

- TEXT
- IMAGE
- GALLERY
- VIDEO
- MODEL_3D
- QUOTE
- SPLIT

The public renderer must treat each as a real editorial content type.

Do not render every type inside the same generic card.

### TEXT

Use strong typography, generous whitespace and readable line lengths.

Possible composition:

- small numbered/technical label;
- large text heading or key statement;
- supporting body.

Only render fields actually available in the contract.

### IMAGE

Allow large/full-width architectural images when appropriate.

Respect the media's real aspect ratio when possible.

Avoid tiny thumbnails.

### GALLERY

Prefer editorial sequencing over a default carousel.

Depending on asset count, layouts may include:

- full-width image;
- two-column diptych;
- staggered editorial grid.

Do not create visually unstable random layouts.

### VIDEO

Load lazily.

Do not autoplay with sound.

Use an intentional media frame consistent with the square-edged visual language.

### MODEL_3D

Load lazily.

Do not block the initial project render.

Use the approved backend-supported format.

Do not enable GLTF merely from the frontend if the backend only supports GLB.

### QUOTE

Treat quotes as strong typographic moments with generous whitespace.

Do not place them in generic quotation cards.

### SPLIT

Use an editorial split composition derived from its actual backend fields.

Do not assume fields not present in the API.

Responsive mobile layout may stack the two sides.

---

## 26. Next Project

The reference uses a large image-backed link to the next project.

Characteristics:

- large full-width image;
- darkened overlay;
- "Next project →" label;
- oversized next-project title;
- subtle image zoom on hover.

Use the real next published project based on an explicit frontend/backend ordering strategy.

Do not link to private, draft, archived or deleted projects.

---

## 27. Motion

Motion should remain restrained and slow enough to feel architectural.

Approved patterns from the reference:

- fade + small vertical reveal when entering viewport;
- image scale on hover;
- subtle title shift;
- header background transition;
- very subtle hero parallax/scale;
- full-screen menu transition;
- optional floating project-index preview.

Typical reveal timing may be around:

`~1000ms`

and hover image zooms may be around:

`~1000–1500ms`

but implementation should prioritize usability.

Do not use:

- bounce;
- elastic effects;
- continuous floating;
- aggressive parallax;
- scroll hijacking;
- mandatory long intro animations.

---

## 28. Reduced Motion

Respect:

`prefers-reduced-motion: reduce`

When reduced motion is enabled:

- remove parallax;
- remove transform-based reveal movement;
- minimize transition duration;
- keep content immediately accessible.

The user must never depend on animation to access content.

---

## 29. Scroll Behavior

Smooth scroll is allowed for anchor navigation when reduced motion is not requested.

Account for the fixed header using appropriate scroll margins/padding.

Do not implement scroll hijacking.

---

## 30. Images

Architecture imagery is the central visual asset.

Rules:

- preserve visual quality;
- use responsive sizes;
- set width/height or aspect-ratio to prevent layout shift;
- lazy-load below-the-fold images;
- prioritize hero/critical image;
- use appropriate preview/rendition when available;
- avoid loading original huge files unnecessarily.

Do not use Unsplash in production.

All production images must come from real project/profile/media data or approved static brand assets.

---

## 31. Media URLs

Never construct Cloudflare R2 URLs from storage keys.

Never expose storage credentials.

Use public media URLs/delivery endpoints defined by FastAPI.

Temporary signed URLs must be treated as temporary.

Do not persist them as permanent project data in the frontend.

---

## 32. Responsive Principles

Target at minimum:

- 375px;
- 768px;
- 1024px;
- 1440px.

### Mobile

Mobile is a recomposition, not a scaled-down desktop.

Rules:

- use large imagery;
- simplify asymmetric grids;
- stack split layouts where needed;
- preserve strong typography without overflow;
- retain generous breathing room;
- use full-screen navigation;
- hide pointer-only decorative interactions;
- make metadata readable.

### Tablet

Preserve visual hierarchy while simplifying layout spans.

### Desktop

Use asymmetry, whitespace and full-width visual moments confidently.

---

## 33. Accessibility

The visual reference must be implemented accessibly.

Requirements:

- semantic headings;
- semantic navigation;
- visible focus;
- keyboard navigation;
- skip link where appropriate;
- accessible menu state;
- accessible lightboxes/dialogs;
- meaningful image alt text;
- decorative images use empty alt when appropriate;
- sufficient contrast;
- reduced motion;
- no hover-only essential information.

Do not remove focus outlines globally.

Use the primary accent as a focus ring when appropriate.

---

## 34. Public Data Rules

The public application must use the real public FastAPI endpoints.

Never use administrative endpoints to render public content.

Never expose:

- draft projects;
- private projects;
- archived projects unless the public API explicitly allows them;
- soft-deleted projects;
- private admin metadata.

`UNLISTED` behavior must follow backend rules exactly.

---

## 35. Prototype Content Must Not Survive

The Figma export contains illustrative content.

The following kinds of values must be replaced by real backend data or approved copy:

- fictional architect/studio name;
- fictional project names;
- fictional email;
- fictional social links;
- fake statistics;
- hardcoded years/locations;
- Unsplash images;
- prototype coordinates;
- prototype project counts;
- prototype categories.

Do not silently ship demo content.

---

## 36. Public Component Direction

Potential reusable components include:

- PublicHeader
- MobileMenu
- Hero
- SectionHeading
- ProjectPreview
- SelectedProjects
- ProjectIndex
- FeaturedProject
- ProjectMetadata
- StudioSection
- ServicesSection
- VisualExplorations
- ContactCTA
- PublicFooter
- ProjectHero
- ProjectSectionRenderer
- TextSection
- ImageSection
- GallerySection
- VideoSection
- Model3DSection
- QuoteSection
- SplitSection
- NextProject

Do not create all components in Phase 9.

Create them only when their phase requires them.

---

## 37. Angular Implementation Rules

Translate visual behavior into Angular idioms.

Prefer:

- standalone components;
- Signals for local visual state;
- Angular Router;
- Angular SSR-safe code;
- IntersectionObserver only behind browser-safe abstractions where necessary;
- CSS/SCSS transitions for simple motion.

Do not port React code directly.

Do not preserve:

- React hooks;
- React Router;
- Tailwind class strings;
- Vite-specific code.

---

## 38. SSR

Public pages must remain SSR-compatible.

Do not directly access:

- window;
- document;
- IntersectionObserver;
- localStorage;

during server rendering.

Browser-only visual behavior must be isolated and must not affect core server-rendered content.

Critical page content should exist before client-only animation initialization.

---

## 39. Public vs Admin Styling

Public styling must remain isolated from Admin UI.

Admin patterns such as:

- tables;
- status badges;
- form panels;
- utility dialogs;

must not define the visual language of public pages.

Likewise, giant display typography and editorial grids should not leak into admin workflows.

---

## 40. What Not To Do

Do not introduce:

- generic rounded cards;
- global 16px/24px radii;
- glassmorphism;
- decorative gradients;
- purple/blue startup palette;
- floating blobs;
- hero with generic centered CTA buttons;
- generic "About / Skills / Testimonials" template;
- unnecessary icons;
- fake metrics;
- testimonials not represented by backend data;
- infinite carousels by default;
- autoplaying media;
- excessive parallax;
- copied React/Tailwind architecture;
- hardcoded Unsplash production assets.

---

## 41. Fidelity Rule

When there is tension between:

1. generic Angular UI conventions, and
2. the approved Figma visual composition,

prefer the approved visual composition as long as it remains:

- accessible;
- responsive;
- performant;
- compatible with real backend content;
- SSR-safe.

Do not simplify distinctive layouts into generic cards merely because they are easier to implement.

---

## 42. Adaptation Rule

Pixel-for-pixel copying is not required where dynamic content makes it impractical.

Adaptation is allowed for:

- variable project count;
- variable text length;
- missing optional data;
- mobile;
- accessibility;
- SSR;
- performance;
- dynamic media dimensions;
- actual backend capabilities.

Adaptation must preserve the approved visual language.

---

## 43. Phase Boundaries

### Phase 9 — Public Foundation

May implement:

- visual tokens;
- fonts;
- public shell;
- header;
- mobile menu;
- footer;
- shared public spacing/grid;
- base motion primitives;
- empty structural public sections only when needed to demonstrate the system.

Must NOT fully implement public project/content functionality.

### Phase 10 — Public Project Portfolio

Implements:

- selected projects;
- project listing/index;
- real filters;
- real project previews;
- featured project integration.

### Phase 11 — Project Detail Experience

Implements:

- project hero;
- metadata;
- dynamic section renderer;
- image/gallery/video/model/quote/split presentation;
- next project.

### Phase 12 — Public Profile, Services & Contact

Implements:

- real studio/profile content;
- services;
- social links;
- public contact experience;
- final CTA data.

### Phase 13+

Completes:

- SSR;
- SEO;
- accessibility;
- responsive refinement;
- performance.

Do not collapse these phases into one large public rewrite.

---

## 44. Phase 9 Visual Acceptance Checklist

Before Phase 9 is considered complete, verify:

- public palette matches the approved reference;
- typography roles are established;
- public header matches the design direction;
- header supports transparent-over-hero and scrolled states where applicable;
- mobile full-screen menu exists and is accessible;
- public spacing/grid matches the editorial reference;
- square-edge geometry is preserved;
- no generic card design was introduced;
- public and admin styles remain isolated;
- reduced-motion baseline exists;
- mobile/desktop layouts remain stable;
- SSR remains valid;
- no fictional Figma content is treated as production data.

---

## 45. Final Design Principle

The portfolio should feel designed around architecture rather than around UI components.

When deciding between two valid solutions, prefer the one that:

1. gives more visual weight to architectural work;
2. preserves editorial hierarchy;
3. uses whitespace intentionally;
4. avoids generic template patterns;
5. remains responsive and accessible;
6. maps cleanly to real FastAPI data;
7. stays faithful to the approved Figma reference.
