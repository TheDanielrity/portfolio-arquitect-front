> Retired on 2026-10-27 at the owner request. The frontend inbox, route, navigation item, dashboard counter, API service and dedicated browser smoke were removed. The landing no longer displays a contact form. Backend endpoints and stored messages were not changed. The following notes are historical.

# Contact Administration — Phase 8

Only the private inbox is implemented. FastAPI remains the source of truth. Authentication, token storage, guards, refresh rotation and backend source/configuration are unchanged. No public Angular contact form, email sending/client, public foundation or new dependency is included.

## Contract

All application requests use ContactAdminApi, Angular HttpClient, API_BASE_URL and generated OpenAPI types, through the existing auth interceptor. Transfer caching is disabled and requests time out after 15 seconds. Shared ApiError parsing retains Retry-After and X-Error-ID; internal diagnostics are not displayed as primary UI text.

| Operation          | Method/path under /api/v1                      | Contract                                                                                                  | Success |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| List               | GET /admin/contact-messages                    | ContactQuery derived from ListMessagesApiV1AdminContactMessagesGetData; shared Paginated<ContactResponse> | 200     |
| Detail             | GET /admin/contact-messages/{item_id}          | ContactResponse                                                                                           | 200     |
| Classification     | PATCH /admin/contact-messages/{item_id}/status | ContactStatusUpdate → ContactResponse                                                                     | 200     |
| Smoke fixture only | POST /public/contact                           | ContactCreate → ContactReceipt                                                                            | 201     |

Admin identifiers are UUIDs. No DELETE endpoint exists. ContactResponse contains id, name, email, nullable phone/subject, message, status, created_at, nullable read_at/replied_at. There is no updated_at, assignment, priority or attachment field. Reads and updates can fail with 400/401/403/404/409/422/429/500/network errors, represented safely by the existing parser and contextual messages. Public POST quota returns 429 with Retry-After. The smoke respects the quota and never disables protections.

## States and transitions

The list enum is exactly NEW, READ, REPLIED, ARCHIVED, SPAM. PATCH accepts only READ, REPLIED, ARCHIVED, SPAM; returning to NEW is not supported. Valid target classifications are offered without inventing a frontend state machine. The backend sets and preserves first read/replied timestamps. All writes wait for the response; no optimistic classification is shown.

Opening detail does not mark it read. The administrator explicitly selects Mark as read. REPLIED records only the administrative state and never sends email. Archive/spam request accessible confirmation and do not delete records. Both remain discoverable through their filters or the unfiltered inbox. Changing status updates detail and its existing list entry, then reloads the current server-filtered page. If a selected record leaves the current filter, its detail remains available until closed. Conflict recovery reloads authoritative detail/list; 404 clears unavailable detail. Duplicate writes are disabled.

## Inbox and detail architecture

MessagesPage owns local Signals for list state (loading/loaded/empty/error/refreshing), selected ID, detail, detail loading/error, writing, notice and confirmation. MessageDetail is a focused presentation component with real fields, text content and status actions. Existing ProjectConfirm supplies native modal confirmation, safe initial focus and Escape behavior. There is no parallel auth implementation or global message store.

The typed filter form uses real server parameters only: limit 1–100, offset ≥0, status, q up to 200 characters, sort created_at/name and direction asc/desc. Search is debounced 400 ms; switchMap cancels superseded list/detail requests. Pagination uses items/total/limit/offset from the API, corrects offsets when totals shrink, and rejects invalid navigation. Filters/order/page size/offset are preserved in query params for reload and Back/Forward. Unknown enum/order/invalid numeric URL values fall back to valid defaults. Empty inbox and no matching results have distinct feedback. Existing rows remain available during refresh/read failure.

Detail renders sender, email, optional phone, subject, full message, classification and received/read/replied timestamps. Dates are formatted dd/MM/yyyy HH:mm without altering stored values. Selection is local; full browser reload preserves query context but does not reopen detail automatically.

## Content security and privacy

Every untrusted field uses Angular interpolation as text, including subjects and list snippets. Message paragraphs use white-space:pre-wrap and overflow-wrap:anywhere. No innerHTML binding, bypassSecurityTrustHtml, URL linkification, rich-text or sanitizer dependency is used. Explicit unit tests and Chrome exercise script tags and image onerror payloads: markup remains visible text and no script/image nodes or execution occur. Application code contains no logging of message content, sender emails or session tokens.

## Responsive and accessibility

Desktop uses a list/detail grid with restrained borders matching the Admin Shell. At viewport widths below 1120 px, selecting a message replaces the list with detail; filters are hidden during detail viewing and return with Back to list. Long names, emails, subjects and message text wrap without horizontal overflow. Verified in Chrome at 375, 768, 1024 and 1440 px, for list and detail, with local screenshots.

Real buttons support Tab/Enter. The selected entry includes aria-current and a text marker, in addition to its border/background. Detail focuses its heading when a new message loads; Back restores the selected row button or search field when the row is no longer available. Labels, semantic list/section, time/dl, status/alert messages, aria-busy and visible focus are included. Confirmation starts on Cancel and supports Escape. Existing shell landmarks/skip link/mobile navigation remain intact.

## Routes, SSR and bundles

Only `/admin/messages` changes, replacing the placeholder with a separate lazy-loaded component under existing AdminLayout protection. No public routes are added. Production SSR serves only the client shell on protected URLs, with no inbox/private message HTML. Browser focus work is confined to Angular afterRenderEffect/afterNextRender callbacks. MessagesPage and its API/detail code remain outside the initial public static-import graph.

## Validation and fixtures

347 tests in 22 files pass, including 44 new API/inbox/security/auth tests. Coverage includes exact URLs/bodies/params, pagination/search cancellation/query navigation, state/error/empty handling, detail, all valid status operations, duplicate writes, conflict recovery and XSS in list/detail. Contact-specific requests receive Bearer auth and THREE concurrent 401 responses produce ONE rotating refresh and THREE retries. Previous tests remain intact.

`npm run test:contact:browser` uses the existing Chrome CDP approach and private ignored `.tools/auth-development.json`; no browser testing library is added. It creates only two synthetic uniquely prefixed fixtures through the real backend public endpoint, exercises the Angular admin UI, reloads to verify persistence in the real FastAPI/PostgreSQL environment and leaves both messages ARCHIVED in finally. Existing messages are never changed. Because there is no DELETE, archived terminal fixtures intentionally remain in PostgreSQL and in the All/Archived filters. Their marker/IDs are recorded locally in ignored .tools for diagnosis; no direct database deletion or backend change is performed.

The smoke verifies server pagination with limit 1, search, status filters, detail, literal malicious text, read/reply timestamps, archive/spam confirmation, keyboard focus, responsive widths, reload and contact-specific single-flight refresh. No R2 upload or unrelated domain requests occur. A disabled contact_enabled setting or rate-limit rejection blocks fixture creation safely; the script does not change settings or bypass protections.

Repeatable checks: npm run api:generate, npm test, npm run lint, npm run format:check, npm run typecheck, npm run build -- --stats-json, npm run validate:ssr, npm run test:contact:browser and npm run test:auth:browser. OpenAPI regeneration is byte-identical. SSR includes /, /admin/login and all requested private routes. Phase 9 remains PENDING.

## Limitations

No physical deletion, reset to NEW, email sending, public form, collaborative editing or automatic polling is implemented. Full message text is returned in backend list responses as part of the real contract; Angular only displays a short snippet. Terminal smoke records remain because the API lacks DELETE. Angular debug APIs used solely by development smoke scripts are not a production-browser testing interface.
