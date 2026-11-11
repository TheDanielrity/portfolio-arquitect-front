# Public Profile, Services & Contact — Phase 12

## Public contracts

Current presentation update: CV is no longer offered in Studio or the Profile editor. An existing CV relation returned by the contract is ignored for public rendering and preserved when editing the profile; no file or backend record is deleted. Earlier optional-CV implementation notes describe the initial Phase 12 snapshot.

`PublicContentApi` uses Angular HttpClient and generated OpenAPI types. Every path below is relative to `/api/v1/public`; public queries and submissions send neither Authorization nor credentials and never refresh an administrator session.

| Operation | Contract | Behavior |
| --- | --- | --- |
| GET `/profile` | `PublicProfile` | Active professional profile; 404 means absent or inaccessible. |
| GET `/services?limit=100&offset=…` | `PagePublicService` | Visible services only, backend order by sort_order then slug. All pages are loaded. |
| GET `/social-links?limit=100&offset=…` | `PagePublicSocialLink` | Visible links belonging to the active profile, backend order by sort_order then ID. All pages are loaded. |
| GET `/site-settings` | `PublicSetting[]` | Approved public settings only. UI uses site_title and contact_enabled; advanced metadata remains Phase 13. |
| POST `/contact` | `ContactCreate` → `ContactReceipt`, 201 | Records a message in the existing inbox. Does not send email or invoke SMTP. |

Read-only inspection of FastAPI confirmed visibility, ordering and the contact switch. No backend code, schema, configuration or direct database operation was changed. Regeneration of OpenAPI types was byte-identical.

## Components and presentation

Home replaces temporary markers with `StudioSection`, `ServicesSection` and `ContactSection`. `PublicContentState` shares Signals for profile, services, socials and settings across Home, header, mobile menu and footer. Each resource loads independently, retains safe error feedback and supports retry; duplicate concurrent reloads are blocked. Successfully loaded content is reused during navigation within the public application.

Studio shows the real name, professional title, short biography, full biography, optional photograph, location, public CV and social links. Missing fields are omitted. Identical short/full biographies are not repeated. Missing profiles have an honest empty state; missing photography does not substitute a demo image or leave an empty portrait frame.

Services preserves the authoritative ordered list, with numbered rows, thin separators, typography and accessible native details for extended descriptions. Missing services have a neutral empty state. The public service contract has no image relationship; the prototype service imagery, icon graphics, prices and invented descriptions are therefore omitted. Arbitrary icon identifiers are not interpreted as HTML or classes.

Contact keeps Figma's charcoal surface, large Manrope statement, terracotta punctuation and editorial links. Name, email, phone, location and social links come from public data. No fictitious availability, business claims, statistics, cities or owner contact details are copied from Figma. Header/menu/footer replace the temporary identity with the actual profile name or configured site title; a neutral Portfolio label is used only when neither is available.

`Projects`, `Studio`, `Services` and `Contact` use real Angular links to Home anchors from Home, `/projects` and project detail. Browser-only ViewportScroller setup measures the actual header height for anchor offset. Contact-form anchors use scroll margins. Existing menu focus, Escape, keyboard containment, skip link and reduced motion remain intact. No additional route or dependency was added.

## Contact form and configuration

`PublicContactForm` uses typed Reactive Forms and only the admitted fields:

| Field | Requirement |
| --- | --- |
| name | Required, nonblank, maximum 150 characters. |
| email | Required email, maximum 320 characters; FastAPI performs authoritative validation. |
| phone | Optional, maximum 50 characters. |
| subject | Optional, maximum 200 characters. |
| message | Required, nonblank, maximum 10,000 characters. |

Values are trimmed; absent optional phone/subject values become null. An active submission disables editing and duplicate submission. Success clears personal inputs and announces receipt without claiming an email was sent. A second message requires explicitly resetting the form. No message or sender email is logged, cached in TransferState or persisted in browser storage.

422 issues map to known form controls using safe messages, retaining entered values for correction. Angular's email validator is a UX check: for example, FastAPI can reject reserved test domains that pass the frontend validator; the resulting field error is handled normally. 429 displays safe feedback and respects numeric Retry-After seconds or HTTP dates with a disabled submit countdown. Network, 400, 403, 413 and server failures retain the draft and avoid exposing server details. POST is never automatically retried; the contract supplies no idempotency key, so an uncertain connection result is described as unconfirmed.

FastAPI defaults to enabled when contact_enabled is absent. Explicit false or a non-true legacy value disables submissions. Angular follows this rule after successfully reading settings; pending or failed settings reads hide the form until availability can be verified. False removes the form and all form-specific calls to action, while retaining public contact information. A rejected 400 submission rechecks current settings to handle a switch changed since page load. FastAPI remains authoritative if settings change during a request. No CAPTCHA or external service was added.

## Public media and security

Photography uses the existing `PublicCover` with `PublicMedia.url`, lazy loading, a stable 4:5 portrait frame, supplied dimensions/alt text and unavailable-image feedback. CV opens the backend-provided public document URL in a new tab with noopener/noreferrer. No storage key, manually built R2 URL, administrator download service or token is involved.

Social URLs accept only absolute HTTP(S) without embedded credentials; unsafe schemes are omitted. Social platform names, biographies, service text and all form feedback use escaped Angular text. No innerHTML, sanitization bypass or rich-text interpretation is used. External links identify new tabs for assistive technology. Public media delivery still enforces backend access/reference rules; an inaccessible photo yields a safe fallback.

## SSR and hydration

`PublicHttp` centralizes the existing Phase 10 per-render TransferState behavior for both projects and content. The projects API delegates reads without changing paths, queries, error parsing or existing snapshot keys. Read snapshots are consumed once during hydration because FastAPI returns no-store; subsequent retry requests are fresh. Only public read responses or safe status/Retry-After error snapshots are transferred. Contact POST never enters the read cache.

Server HTML contains the real profile and service text when available. Browser-only offset calculation occurs after rendering, and the contact form becomes interactive after hydration. Production HTML keeps no-store. Advanced SEO, canonical/Open Graph metadata and Phase 13 remain outside this work.

## Validation

- 562 tests in 35 files passed: 38 new contract/content/form tests. Coverage includes optional/missing data, public paging/order, enabled/disabled/default contact, 422/429/network errors, duplicate prevention, safe malicious text/links, anonymous requests with an existing administrator session, SSR snapshots and one-time hydration.
- OpenAPI consistency, ESLint, Prettier, TypeScript/strict templates, production build and SSR validation passed. Build budgets were preserved; redundant no-effect administrative declarations were removed to resolve the prior 97-byte stylesheet warning without changing its appearance.
- `npm run test:public-content:browser` uses Chrome, current public FastAPI/PostgreSQL data and actual R2 reads. It verifies development/production SSR, production hydration, public-only network traffic, no Authorization, no initial repeated queries, cross-route anchors, four widths and real contact receipt with invalid/double-submission protection.
- Real data currently contains a basic profile but no public services, social links, biography, photograph or CV. Rich optional-content and disabled-contact variants use browser-memory fixtures only, not owner data writes. Screenshots under ignored `.tools/public-content-*.png` were compared with Figma's ProfileSection, ServiceList, ContactSection and Footer compositions and available references.
- Two successful smoke executions created two clearly marked synthetic contact messages, both retained ARCHIVED through the available API. An earlier rejected synthetic request created no message. Marker/IDs are recorded in ignored `.tools/phase12-public-contact-smoke-*.json`. There is no DELETE operation. No actual owner message was changed.
- Public foundation/browser, Phase 10/11 real project/media smoke, administrative authentication/single-flight refresh, and modal/accept/cancel/preview/final-save browser regression passed. Project fixtures were cleaned through APIs and PostgreSQL/R2 cleanup was verified. Administrator draft smoke uses intercepted fixtures; authentication and public integration use the real backend.

## Limitations and remaining phase

No real profile photograph/CV or visible service/social record is configured in the current environment, so their populated variants were validated with unit/browser-memory fixtures rather than overwriting the owner profile. Public R2 image delivery was exercised through existing projects and the Phase 11 regression. Services have no public image field; omitted image decoration is a deliberate contract adaptation. Large service/social collections currently load all pages to preserve complete administrative order. No contact DELETE, email delivery or idempotency operation exists.

Phase 12 is complete after these validations. Phase 13 — SSR, SEO & Metadata remains PENDING.
