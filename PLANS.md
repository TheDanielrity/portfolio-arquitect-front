# Architecture Portfolio Frontend — Implementation Plan

## Purpose

This document defines the staged implementation roadmap for the Angular frontend.

The frontend contains:

- the public architecture portfolio;
- the private administration panel.

The FastAPI backend is already implemented independently.

All phases must follow `AGENTS.md`.

Implementation must proceed one phase at a time.

---

# Phase Status Values

Use:

- `PENDING`
- `IN PROGRESS`
- `BLOCKED`
- `COMPLETED`

Never mark a phase `COMPLETED` unless its acceptance criteria pass.

---

# Phase 0 — Angular Foundation / Bootstrap

**Status:** COMPLETED

## Objective

Create a clean Angular application foundation without implementing domain features.

## Scope

Initialize the Angular application with:

- standalone architecture;
- Angular Router;
- HttpClient;
- SCSS;
- strict TypeScript;
- SSR/hybrid rendering support;
- base folder structure;
- global styles;
- basic design tokens;
- development configuration;
- lint/format/test configuration.

Create only foundational layouts/placeholders necessary to prove routing.

## Initial Routes

At minimum provide temporary routes for:

```text
/
 /admin
```

These may contain simple placeholders.

Do not implement authentication yet.

Do not implement API integration yet.

## Acceptance Criteria

- application starts locally;
- public route works;
- admin route works;
- SSR does not fail;
- strict TypeScript is enabled;
- production build succeeds;
- tests pass;
- linting/formatting pass;
- no backend domain implementation exists yet;
- no UI library is added without a concrete requirement.

---

# Phase 1 — Backend API Contract & HTTP Foundation

**Status:** COMPLETED

## Objective

Establish the frontend/backend communication foundation.

## Scope

Review the backend OpenAPI contract.

Configure:

- backend base URL;
- HttpClient;
- common HTTP infrastructure;
- error models;
- pagination models;
- API service conventions.

Evaluate and implement repeatable OpenAPI TypeScript type/client generation if appropriate.

Generated code must remain isolated from application UI code.

## Verify

Frontend must successfully call:

```text
GET /api/v1/health
```

through real HTTP.

Also verify development CORS.

## Acceptance Criteria

- backend configuration is environment-driven;
- no hardcoded production URL;
- health request succeeds from the browser;
- CORS works from Angular development origin;
- API types are consistently defined;
- build/tests/lint pass.

---

# Phase 2 — Authentication

**Status:** COMPLETED

## Objective

Implement administrative authentication compatible with the FastAPI backend.

## Scope

Implement:

- login page;
- authentication API integration;
- authenticated user state;
- access token handling;
- refresh token handling;
- logout;
- `/me`;
- auth guard;
- HTTP authentication interceptor;
- refresh coordination.

## Critical Rule

Concurrent authentication failures must result in a single refresh request.

Waiting requests must resume only after refresh resolves.

## Routes

Example:

```text
/admin/login
/admin/*
```

## Tests

Test:

- successful login;
- invalid login;
- protected route;
- logout;
- expired access token;
- successful refresh;
- failed refresh;
- concurrent refresh behavior.

## Acceptance Criteria

- real backend authentication works;
- administrative routes are protected;
- refresh rotation works correctly;
- no refresh storm occurs;
- credentials are not logged;
- build/tests/lint pass.

---

# Phase 3 — Admin Shell

**Status:** COMPLETED

## Objective

Create the administration experience foundation.

## Scope

Implement:

- admin layout;
- sidebar/navigation;
- top-level header;
- responsive admin navigation;
- authenticated user display;
- logout entry;
- admin routing structure;
- page title/breadcrumb strategy where useful.

Consider PrimeNG only if justified during this phase.

## Navigation

Prepare navigation for:

- Dashboard
- Projects
- Media
- Profile
- Services
- Site Settings
- Messages

Do not implement domain CRUD yet.

## Acceptance Criteria

- admin shell works;
- navigation works;
- active states work;
- mobile navigation is usable;
- protected routing remains intact;
- public layout remains independent.

---

# Phase 4 — Media Management & R2 Uploads

**Status:** COMPLETED

## Objective

Implement media management and the complete browser-to-R2 upload flow.

## Scope

Integrate existing backend media endpoints.

Implement:

- media list;
- pagination;
- filters where supported;
- media detail;
- editable metadata;
- delete;
- upload authorization;
- direct R2 upload;
- upload confirmation;
- upload cancellation/error handling.

## Upload Flow

Follow exactly:

```text
Angular
→ FastAPI presign
→ direct R2 PUT
→ FastAPI confirm
→ media asset available
```

Use exactly the headers returned by FastAPI.

## UX

Provide:

- file validation hints;
- upload state;
- progress when technically reliable;
- expiration handling;
- errors;
- retry where safe.

Do not mark upload complete before backend confirmation.

## Tests

Test:

- successful upload;
- authorization failure;
- unsupported file;
- expired authorization;
- R2 failure;
- confirmation failure;
- duplicate confirmation behavior;
- deletion protections.

## Acceptance Criteria

- real browser upload to R2 works;
- CORS works;
- PostgreSQL registration occurs through backend confirmation;
- private delivery works;
- admin unauthorized access is blocked;
- existing backend media contract is respected.

---

# Phase 5 — Project Management

**Status:** COMPLETED

## Objective

Implement core administrative project management.

## Scope

Implement:

- project list;
- pagination;
- filtering;
- search;
- creation;
- editing;
- draft state;
- publication state;
- visibility;
- featured state;
- soft deletion;
- categories;
- tags;
- project attributes;
- project media;
- cover selection.

Use backend behavior as authoritative.

## Forms

Use typed Reactive Forms.

Handle backend `422` and `409` responses properly.

## Acceptance Criteria

- full project core workflow works against real backend;
- cover management works;
- media assets can be attached;
- project statuses and visibility match backend rules;
- soft deletion works as designed;
- tests/build/lint pass.

---

# Phase 6 — Dynamic Project Sections

**Status:** COMPLETED

## Objective

Allow administrators to compose project detail content using backend project sections.

## Scope

Implement management of:

- TEXT;
- IMAGE;
- GALLERY;
- VIDEO;
- MODEL_3D;
- QUOTE;
- SPLIT.

Support:

- create;
- edit;
- delete;
- show/hide;
- reorder;
- attach media;
- reorder section media.

Use accessible Move up/down controls for ordering. Angular CDK is optional if drag and drop is introduced, as clarified in the Phase 6 implementation request.

## Acceptance Criteria

- administrators can construct a complete project detail page;
- ordering persists correctly;
- media relationships work;
- invalid combinations are displayed clearly;
- section types match backend contract.

---

# Phase 7 — Profile, Social Links, Services & Site Settings

**Status:** COMPLETED

## Objective

Implement administration of global portfolio content.

## Scope

Implement:

- professional profile editing;
- profile photograph;
- CV asset;
- social links;
- social ordering;
- services;
- service ordering;
- visibility;
- site settings.

For JSONB settings, build explicit forms for supported keys.

Do not expose arbitrary JSON editing unless explicitly required.

## Acceptance Criteria

- global content can be managed safely;
- supported site setting keys have typed UI;
- media relationships work;
- changes persist through backend.

---

# Phase 8 — Contact Administration

**Status:** COMPLETED

## Objective

Implement administrative contact message management.

## Scope

Implement:

- inbox;
- pagination;
- filtering/status;
- message detail;
- mark read;
- mark replied;
- archive;
- spam.

## Acceptance Criteria

- messages load from backend;
- states are represented correctly;
- transitions work;
- unauthorized users cannot access administrative messages.

---

# Phase 9 — Public Foundation

**Status:** COMPLETED

## Objective

Create the visual and architectural foundation of the public portfolio.

## Scope

Implement:

- public layout;
- header/navigation;
- footer;
- typography;
- spacing system;
- public responsive grid;
- motion principles;
- loading patterns;
- shared public visual components.

Do not fully implement project content yet.

## Visual Direction

Prioritize an editorial architecture aesthetic.

Avoid generic SaaS styling.

The portfolio should emphasize visual work.

## Acceptance Criteria

- public design system is coherent;
- layout works across viewport sizes;
- public/admin styles remain separated;
- accessibility baseline passes.

---

# Phase 10 — Public Project Portfolio

**Status:** COMPLETED

## Objective

Implement public project discovery.

## Scope

Implement:

- project listing;
- featured projects;
- category filtering;
- pagination or approved loading strategy;
- responsive project grid;
- cover media;
- project navigation.

Use public backend endpoints only.

## Rules

Never expose:

- drafts;
- private projects;
- soft-deleted projects.

The frontend should not attempt to recreate visibility filtering as a security measure; backend results remain authoritative.

## Acceptance Criteria

- real published projects display;
- filtering works;
- project navigation works;
- images load efficiently;
- empty/error/loading states exist.

---

# Phase 11 — Public Project Detail Experience

**Status:** COMPLETED

## Objective

Build the primary portfolio viewing experience.

## Scope

Implement project detail by slug.

Render:

- project metadata;
- cover;
- attributes;
- sections;
- galleries;
- video;
- models;
- quotes;
- split layouts.

Create a reusable section renderer.

## 3D

Support the backend-approved 3D model format.

Load 3D viewers lazily.

## Acceptance Criteria

- every supported section type renders;
- unknown section types fail gracefully;
- heavy media does not unnecessarily block initial rendering;
- project detail works responsively.

---

# Phase 12 — Public Profile, Services & Contact

**Status:** COMPLETED

## Objective

Complete the non-project public experience.

## Scope

Implement:

- about/profile;
- biography;
- services;
- social links;
- CV access;
- contact form;
- contact feedback states.

## Contact

Handle:

- successful submission;
- validation errors;
- 429;
- network failures.

## Acceptance Criteria

- profile and services consume public APIs;
- contact form works against real backend;
- accessible form behavior is implemented.

---

# Phase 13 — SSR, SEO & Metadata

**Status:** PENDING

## Objective

Complete public discoverability and server rendering.

## Scope

Review rendering strategy for public routes.

Implement:

- SSR/hybrid rendering;
- page titles;
- meta descriptions;
- canonical URLs where needed;
- Open Graph metadata;
- social sharing metadata;
- project-specific metadata;
- semantic heading hierarchy.

Admin routes do not require SEO.

## Acceptance Criteria

- public pages render correctly without browser-only crashes;
- project metadata is unique;
- source HTML contains meaningful content where expected;
- production SSR build succeeds.

---

# Phase 14 — Responsive Design & Accessibility

**Status:** PENDING

## Objective

Perform complete responsive and accessibility review.

## Scope

Test key pages at:

- mobile;
- tablet;
- laptop;
- desktop.

Review:

- keyboard navigation;
- focus management;
- forms;
- dialogs;
- image alt text;
- semantic HTML;
- reduced motion;
- color contrast;
- navigation behavior.

## Acceptance Criteria

- core workflows work with keyboard;
- no major accessibility blockers remain;
- public and admin experiences remain usable on target viewports.

---

# Phase 15 — Performance & Media Optimization

**Status:** PENDING

## Objective

Optimize the application for an image-heavy architecture portfolio.

## Scope

Review:

- initial bundle;
- route lazy loading;
- image loading;
- responsive assets;
- layout shifts;
- project gallery performance;
- 3D lazy loading;
- admin library isolation;
- SSR performance;
- API request duplication.

## Acceptance Criteria

- heavy public features are lazy where appropriate;
- admin dependencies do not unnecessarily inflate public routes;
- major layout shifts are addressed;
- no obvious duplicate network requests remain.

---

# Phase 16 — Final Integration & Hardening

**Status:** PENDING

## Objective

Validate the frontend as a complete application against the real backend.

## Scope

Run complete real-browser scenarios.

Validate:

- login;
- refresh;
- logout;
- media upload;
- project creation;
- project editing;
- section editing;
- project publishing;
- private/unlisted behavior;
- public project rendering;
- profile;
- contact submission;
- message administration.

Review:

- error handling;
- HTTP contracts;
- loading states;
- empty states;
- production build;
- SSR;
- environment configuration.

Do not modify backend code silently if a contract issue appears.

## Acceptance Criteria

- critical workflows succeed against the real backend;
- tests pass;
- lint/format pass;
- TypeScript passes;
- production build passes;
- SSR passes;
- no known frontend blocker remains.

---

# Global Execution Rules

For every phase:

1. Read `AGENTS.md`.
2. Read `PLANS.md`.
3. Inspect the repository.
4. Inspect existing implementation.
5. Review relevant backend OpenAPI documentation.
6. Mark only the active phase `IN PROGRESS`.
7. Implement only that phase.
8. Add or update tests.
9. Run validation.
10. Fix issues introduced by the phase.
11. Mark `COMPLETED` only when acceptance criteria pass.
12. Report results.
13. Stop.

Never automatically start the next phase.

---

# Current Progress

```text
Phase 0  — Angular Foundation / Bootstrap                  COMPLETED
Phase 1  — Backend API Contract & HTTP Foundation          COMPLETED
Phase 2  — Authentication                                  COMPLETED
Phase 3  — Admin Shell                                     COMPLETED
Phase 4  — Media Management & R2 Uploads                   COMPLETED
Phase 5  — Project Management                              COMPLETED
Phase 6  — Dynamic Project Sections                        COMPLETED
Phase 7  — Profile, Social Links, Services & Settings      COMPLETED
Phase 8  — Contact Administration                          COMPLETED
Phase 9  — Public Foundation                               COMPLETED
Phase 10 — Public Project Portfolio                        COMPLETED
Phase 11 — Public Project Detail Experience                COMPLETED
Phase 12 — Public Profile, Services & Contact              COMPLETED
Phase 13 — SSR, SEO & Metadata                             PENDING
Phase 14 — Responsive Design & Accessibility               PENDING
Phase 15 — Performance & Media Optimization                PENDING
Phase 16 — Final Integration & Hardening                   PENDING
```
