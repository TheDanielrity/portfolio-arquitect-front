# Architecture Portfolio Frontend

## Project Overview

This repository contains the Angular frontend for a professional architecture portfolio platform.

The frontend serves two clearly separated experiences:

1. Public portfolio website.
2. Private administration panel.

The backend already exists as an independent FastAPI application and is the source of truth for business rules, persistence, authentication, media operations, and authorization.

The frontend must consume the backend through its documented HTTP API.

Do not reproduce backend business rules unnecessarily in Angular.

---

# Core Technology Stack

Use the technologies already selected by the project unless explicitly changed by the user:

- Angular
- TypeScript
- Standalone Components
- Angular Router
- Angular HttpClient
- Angular Signals
- RxJS
- Angular CDK
- SCSS
- Angular SSR / Hybrid Rendering where appropriate

For the administration interface, PrimeNG may be used when it provides clear value for:

- tables;
- dialogs;
- menus;
- form controls;
- pagination;
- administrative utilities.

Do not use PrimeNG as the visual foundation of the public portfolio.

The public portfolio must use custom components and custom styling.

---

# Package Manager

Use the package manager selected when the project is created.

Do not mix package managers.

If `npm` is selected, use `npm` consistently.

Do not introduce another package manager without explicit approval.

---

# Node Environment

Respect the Node.js version required by the selected Angular version.

Do not silently upgrade Angular, Node.js, TypeScript, or major dependencies.

If a version change is required:

1. explain the reason;
2. identify affected dependencies;
3. wait for approval when the change is significant.

---

# Docker

Docker is intentionally excluded from the current project scope.

Do not create:

- Dockerfiles;
- Docker Compose configuration;
- container-specific scripts;
- container deployment instructions;

unless explicitly requested later.

---

# Application Architecture

Build a single Angular application containing:

- the public website;
- the administration panel.

Do not create two separate Angular applications unless a concrete requirement later justifies it.

Do not use micro-frontends.

Use feature-based organization.

The application should distinguish between:

- core infrastructure;
- reusable shared UI;
- public features;
- administrative features;
- layouts.

---

# Suggested Structure

Use this structure as a reference, but do not create empty directories only to match it:

```text
src/app/
├── core/
│   ├── auth/
│   ├── http/
│   ├── guards/
│   ├── interceptors/
│   ├── config/
│   └── services/
│
├── shared/
│   ├── components/
│   ├── directives/
│   ├── pipes/
│   ├── models/
│   └── utils/
│
├── layouts/
│   ├── public-layout/
│   └── admin-layout/
│
├── features/
│   ├── public/
│   └── admin/
│
├── app.config.ts
└── app.routes.ts
```

Create only what is required by the current phase.

---

# Feature Organization

Prefer lazy-loaded feature routes.

Examples:

```text
features/public/
├── home/
├── projects/
├── project-detail/
├── about/
├── services/
└── contact/
```

```text
features/admin/
├── dashboard/
├── projects/
├── media/
├── profile/
├── services/
├── settings/
└── messages/
```

Large features may contain:

- pages;
- components;
- services;
- models;
- state;
- utilities.

Avoid creating unnecessary abstraction layers.

---

# Standalone Angular

Use standalone APIs.

Do not introduce NgModules for new application code unless required by a third-party library or a documented compatibility reason.

Prefer:

- standalone components;
- standalone directives;
- standalone pipes;
- route-level providers where appropriate.

---

# State Management

Use Angular Signals and focused services as the default state-management approach.

Use RxJS for asynchronous streams and HTTP workflows where appropriate.

Do not introduce NgRx, Akita, Elf, or another global state library unless the application develops a demonstrated need that cannot be handled cleanly with Signals and services.

Avoid global state for data that belongs to a single feature.

---

# Backend API

The FastAPI backend is an independent system.

Do not duplicate backend persistence or business rules in the frontend.

Use the backend documentation and OpenAPI specification as the API source of truth.

Expected backend URL pattern:

```text
/api/v1
```

Expected API groups include:

```text
/api/v1/auth/...
/api/v1/admin/...
/api/v1/public/...
```

Do not invent endpoints.

Before implementing API integration, inspect the actual OpenAPI contract.

---

# API Types

Prefer generating or deriving TypeScript API contracts from the backend OpenAPI specification rather than manually maintaining large duplicate interfaces.

If generated API types or clients are introduced:

- keep generated code isolated;
- do not manually edit generated files;
- document the generation command;
- ensure generation is repeatable.

Application-specific view models may wrap generated contracts when useful.

Do not couple presentation components directly to generated transport models when transformation improves maintainability.

---

# HTTP Layer

Centralize HTTP infrastructure.

Do not call `HttpClient` arbitrarily from presentation components.

Prefer feature API services or repositories such as:

```text
ProjectsApi
MediaApi
AuthApi
ContentApi
ContactApi
```

HTTP-specific details should not spread throughout components.

---

# Environment Configuration

Do not hardcode backend URLs.

Use Angular environment/runtime configuration appropriate to the chosen build strategy.

Keep development and production configuration separable.

Never place backend secrets, Cloudflare credentials, R2 credentials, JWT secrets, or private service credentials in Angular.

Everything shipped to the browser must be treated as public.

---

# Authentication

The backend implements:

- access tokens;
- rotating refresh tokens;
- persisted refresh-token sessions.

Angular must respect that contract.

Do not implement a different authentication model.

Authentication infrastructure should centralize:

- login;
- logout;
- current user;
- access token handling;
- refresh token handling;
- authentication state;
- protected route access.

---

# Refresh Token Concurrency

The backend rotates refresh tokens.

Angular must never initiate multiple refresh operations simultaneously for concurrent failed requests.

If several requests receive an authentication failure at the same time:

```text
Request A ─┐
Request B ─┤
Request C ─┼── authentication failure
Request D ─┘
             │
             ▼
        ONE refresh request
             │
             ▼
        new credentials
             │
             ▼
        retry waiting requests
```

Implement refresh coordination centrally.

Do not implement refresh independently inside feature services.

---

# Authentication Storage

Follow the actual backend authentication contract.

Do not select localStorage, sessionStorage, cookies, or another persistence strategy without reviewing the backend response model and security implications.

Never store credentials or secrets unrelated to the user session.

Do not log tokens.

Do not expose tokens in error messages.

---

# Route Guards

Administrative routes must require authentication.

Use route guards for navigation protection, but remember:

Frontend guards are not security boundaries.

The backend remains responsible for authorization.

Do not assume hiding a route protects the API.

---

# Public and Admin Separation

Keep public and administrative UI concerns separated.

Public pages must not depend on administrative components.

Admin components should not leak into public bundles unnecessarily.

Prefer route-level lazy loading.

---

# Public Portfolio Design

The public portfolio must feel like a professional architecture and design portfolio.

Avoid generic SaaS or dashboard aesthetics.

Avoid excessive use of:

- cards;
- shadows;
- rounded containers;
- gradients;
- decorative UI unrelated to architectural content.

Prioritize:

- photography;
- renders;
- visual hierarchy;
- typography;
- whitespace;
- composition;
- editorial layouts;
- restrained motion;
- asymmetrical grids where appropriate.

The projects are the primary visual content.

The interface should support the work rather than compete with it.

---

# Admin Design

The administration panel may prioritize efficiency over editorial presentation.

Use clear patterns for:

- forms;
- tables;
- filters;
- dialogs;
- media management;
- drag and drop;
- publishing;
- status indicators.

The admin interface should be visually coherent with the brand but does not need to mimic the public portfolio layout.

---

# Responsive Design

The application must be responsive.

Design and test at minimum for:

- mobile;
- tablet;
- laptop;
- desktop.

Do not treat mobile as a scaled-down desktop layout.

Public projects must remain visually strong on small screens.

Administrative workflows must remain usable on smaller screens when practical.

---

# Accessibility

Use semantic HTML.

Support keyboard navigation.

Maintain visible focus states.

Use correct labels for form controls.

Do not communicate state using color alone.

Use appropriate ARIA attributes only where native HTML semantics are insufficient.

Images must support meaningful alternative text where applicable.

Decorative images should not create unnecessary screen-reader noise.

---

# Forms

Use Angular Reactive Forms for non-trivial forms.

Use typed forms where practical.

Keep validation rules consistent with backend requirements.

Frontend validation improves UX but does not replace backend validation.

Always handle backend validation errors.

---

# API Errors

Centralize common HTTP error handling.

Explicitly support important backend responses such as:

- `400`
- `401`
- `403`
- `404`
- `409`
- `422`
- `429`
- `500`

Do not convert all failures into the same generic message.

For form validation, map backend field errors to appropriate UI when possible.

---

# Loading States

Every asynchronous user action must have a clear state.

Handle:

- idle;
- loading;
- success;
- empty;
- error.

Avoid silent HTTP requests.

Avoid duplicate form submissions.

Use optimistic updates only when they are safe and improve UX.

---

# Media Upload Architecture

The backend implements direct uploads to Cloudflare R2 using presigned authorization.

Angular must follow the backend flow.

Expected high-level flow:

```text
Angular
  │
  │ request upload authorization
  ▼
FastAPI
  │
  │ presigned upload information
  ▼
Angular
  │
  │ direct PUT
  ▼
Cloudflare R2
  │
  ▼
Angular
  │
  │ confirm upload
  ▼
FastAPI
  │
  ▼
PostgreSQL
```

Do not proxy large R2 uploads through Angular or invent a second upload flow.

Use exactly the headers returned by the backend for presigned uploads.

Do not modify signed headers arbitrarily.

---

# Media Upload UX

The administration panel should eventually support:

- file selection;
- upload progress where technically available;
- validation errors;
- upload cancellation where possible;
- successful confirmation;
- retry behavior;
- expired authorization handling;
- failed confirmation handling.

Do not mark a file as available before backend confirmation succeeds.

---

# Media Types

Respect the backend media policy.

Do not independently enable unsupported formats.

The backend currently determines which formats are accepted.

Frontend `accept` attributes improve UX but are not security validation.

---

# Project Management

Administrative project management must follow backend states and visibility rules.

Do not invent additional publication states.

The frontend should correctly represent:

- draft;
- published;
- archived;
- public;
- private;
- unlisted;
- soft-deleted behavior when exposed by API.

---

# Dynamic Project Sections

Project detail pages are built from dynamic project sections returned by the backend.

Do not hardcode every project detail page into one fixed content template.

Create a section renderer capable of handling supported section types.

Expected types may include:

- TEXT
- IMAGE
- GALLERY
- VIDEO
- MODEL_3D
- QUOTE
- SPLIT

Use exhaustive handling so unsupported future types fail gracefully.

---
# Public UI References

Before implementing or modifying public-facing pages:

1. Read `docs/design/PUBLIC_UI.md`.
2. Inspect the relevant files under `docs/design/references/`.
3. Treat those references as the approved visual direction.

Do not redesign the public portfolio into a generic layout.

Reference images define visual intent, not production content.
All production content must come from the real application contracts or approved static assets.

---
# Drag and Drop

Use Angular CDK Drag & Drop when implementing reordering.

Examples:

- project order;
- project attributes;
- project media;
- project sections;
- media inside sections.

Do not persist every intermediate pointer movement.

Persist finalized order changes.

Handle failed reorder operations by restoring or refreshing authoritative state.

---

# 3D Models

Prefer a simple, maintained browser model viewer for supported GLB assets before introducing a custom Three.js rendering architecture.

Do not add Three.js unless requirements exceed the simpler viewer's capabilities.

3D assets must not block the initial page render.

Load heavy viewers lazily.

---

# Images

Architecture portfolios are image-heavy.

Prioritize:

- correct aspect ratios;
- responsive sizing;
- lazy loading below the fold;
- explicit dimensions when available;
- avoiding layout shifts;
- appropriate loading priority for hero and cover images.

Do not load full-resolution assets when a smaller rendition is available and sufficient.

---

# Public Rendering Strategy

Use SSR or hybrid rendering where it improves:

- SEO;
- initial load;
- project discoverability;
- social sharing.

Public pages are candidates for server-side or prerendered rendering.

Administrative pages do not require SEO and should remain client-oriented.

Do not access browser-only APIs directly during SSR without guards.

---

# SEO

Public pages must support:

- descriptive page titles;
- meta descriptions;
- canonical URLs when applicable;
- Open Graph metadata;
- social sharing metadata;
- semantic heading structure.

Project detail metadata must be derived from project content returned by the backend.

Avoid generic metadata repeated across every page.

---

# Performance

Avoid unnecessary dependencies.

Lazy-load heavy features.

Avoid importing admin libraries into public routes when they are not required.

Avoid unnecessary change detection work.

Use Angular's modern rendering primitives appropriately.

Do not optimize prematurely at the expense of maintainability, but measure significant performance decisions.

---

# Animations

Public animations should be subtle and purposeful.

Use motion for:

- transitions;
- visual continuity;
- project reveals;
- navigation feedback.

Avoid excessive animation that reduces readability or delays access to content.

Respect reduced-motion preferences.

---

# PrimeNG

PrimeNG may be used primarily in the admin application.

Do not make public pages look like default PrimeNG components.

Wrap or customize administrative components where needed.

Do not introduce multiple competing component libraries.

---

# Styling

Use SCSS.

Establish design tokens for values such as:

- typography;
- spacing;
- layout widths;
- borders;
- motion;
- breakpoints.

Avoid uncontrolled repeated magic values.

Do not build a huge design system before actual UI requirements emerge.

---

# Testing

Tests must be implemented alongside important functionality.

Use the testing stack configured by the selected Angular version.

Prioritize tests for:

- authentication state;
- token refresh coordination;
- guards;
- API services;
- upload workflows;
- publishing flows;
- section rendering;
- important forms;
- utility functions.

Do not test Angular internals.

Test application behavior.

---

# Browser Integration Tests

Important flows should eventually be tested in a real browser.

Critical candidates include:

- login;
- token refresh;
- logout;
- protected navigation;
- project creation;
- media upload;
- project publication;
- contact form;
- public project rendering.

Select browser automation tooling only when the corresponding phase requires it.

Do not introduce multiple end-to-end frameworks.

---

# Code Quality

Use strict TypeScript.

Prefer explicit types at system boundaries.

Avoid unnecessary `any`.

Do not suppress TypeScript errors to make builds pass.

Avoid duplicated logic.

Keep components focused.

Move reusable logic out of templates when complexity grows.

Avoid very large templates and components.

---

# Components

Prefer presentational components when behavior is reusable.

Feature/page components may coordinate data and state.

Do not split trivial markup into excessive micro-components.

Extract components when they improve:

- reuse;
- readability;
- independent behavior;
- testing.

---

# Signals and RxJS

Use Signals for local and application state where they simplify Angular state management.

Use RxJS where streams, cancellation, HTTP composition, or event coordination make it appropriate.

Do not convert everything to Signals or everything to RxJS mechanically.

Use the right abstraction for the problem.

---

# Subscriptions

Avoid unmanaged manual subscriptions.

Prefer:

- async-compatible framework patterns;
- signals;
- operators;
- framework-provided cleanup mechanisms.

Never leave subscriptions that can outlive their component unintentionally.

---

# Security

Never trust browser-side validation as a security control.

Never include:

- R2 secret keys;
- backend JWT secrets;
- database credentials;
- private API credentials;

in Angular configuration.

Treat all frontend code and environment values shipped to the browser as publicly inspectable.

Do not render unsanitized HTML from external content.

Avoid bypassing Angular sanitization unless there is a reviewed and justified case.

---

# File Upload Security

Frontend file checks exist for UX only.

The backend remains authoritative for:

- MIME policy;
- size limits;
- upload authorization;
- object verification;
- confirmation;
- permissions.

Do not consider a file valid merely because Angular accepted it.

---

# Error Logging

Do not print tokens or sensitive user data to the browser console.

Remove temporary debug logging before completing a phase.

---

# Git Safety

Do not remove unrelated user changes.

Do not rewrite the repository unnecessarily.

Do not use destructive Git commands unless explicitly requested.

Do not modify the backend repository while implementing frontend phases unless explicitly asked.

---

# Backend Ownership

The frontend must not modify backend code as part of frontend tasks.

If the frontend discovers a backend contract issue:

1. document the issue;
2. explain the required backend behavior;
3. stop before modifying the backend;
4. request approval for backend work.

---

# Development Workflow

Frontend implementation is organized by phases defined in:

`PLANS.md`

When asked to implement a phase:

1. read `AGENTS.md`;
2. read `PLANS.md`;
3. inspect the current repository;
4. inspect existing frontend code;
5. inspect relevant backend API documentation/OpenAPI;
6. implement only the requested phase;
7. add/update tests;
8. run required validation;
9. fix issues introduced by the phase;
10. update phase status only when acceptance criteria pass;
11. report results;
12. stop.

Do not automatically start the next phase.

---

# Scope Control

If the user requests Phase X:

implement Phase X only.

Do not automatically implement Phase X+1.

Avoid unrelated refactoring.

Do not build future screens preemptively.

---

# Phase Completion

A phase may only be marked `COMPLETED` when:

- required functionality exists;
- acceptance criteria are satisfied;
- tests relevant to the phase pass;
- linting passes;
- formatting passes;
- TypeScript compilation passes;
- production build passes when required by the phase;
- SSR build/render validation passes when relevant;
- no known blocking issue caused by the phase remains.

---

# Final Report

After every phase report:

- phase implemented;
- files created;
- files modified;
- dependencies added or removed;
- routes added;
- backend endpoints integrated;
- tests executed;
- lint results;
- TypeScript results;
- build results;
- architectural decisions;
- known limitations;
- remaining work.

Do not claim completion if validation is failing.