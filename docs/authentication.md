# Phase 2 — Authentication

Phase 2 only. No Admin Shell, dashboard, domain screens, R2 uploads or backend code changes.

## Authentication contract

| Endpoint                  | Request                            | Success                       |
| ------------------------- | ---------------------------------- | ----------------------------- |
| POST /api/v1/auth/login   | JSON email, password               | 200 TokenResponse             |
| POST /api/v1/auth/refresh | JSON refresh_token                 | 200 replacement TokenResponse |
| POST /api/v1/auth/logout  | JSON refresh_token                 | 204 empty body                |
| GET /api/v1/auth/me       | Authorization: Bearer access token | 200 UserResponse              |

Login email is trimmed, 1–320 characters; password is preserved, 1–1024 characters.
Do not impose a stricter login email format than the backend. Refresh secrets are
64 URL-safe characters. TokenResponse contains access_token, refresh_token,
token_type (bearer), expires_in (access TTL in seconds). Refresh expiry is not
returned; the server preserves the original session deadline on rotation.

Types: LoginApiV1AuthLoginPostData['body'] (LoginRequestWritable),
RefreshRequest, TokenResponse, MeApiV1AuthMeGetResponses[200] (UserResponse).
User fields: id, email, first_name, last_name, is_active.

Login/refresh: 400, 401, 413, 422, 429, 500. Logout: 400, 413, 422,
429, 500. Me: 400, 401, 413, 500. The actual authentication dependency returns
401 for missing/invalid/expired tokens, inactive users and revoked sessions.
Login returns the same 401 for incorrect credentials and inactive users. No
account enumeration or separate inactive-account message is possible.

The error body has detail, without a distinct machine-readable auth code.
WWW-Authenticate is Bearer. Automatic refresh therefore applies only to a 401
from /auth/me or /admin[/...] on the exact configured backend origin/path,
when the request sent the app's access token and a refresh secret remains.
403 is not refreshable. Public, health, login, refresh, logout and external
requests neither receive automatic Authorization nor trigger automatic refresh.

Rotation revokes the previous persisted session, invalidating BOTH old tokens.
Logout is idempotent, revokes only the supplied refresh session, and invalidates
its access JWT. There are no refresh-family revocation semantics.

## Storage strategy and SSR

- Access token: memory only, never browser persistence or SSR transfer cache.
- Refresh token: memory and sessionStorage key portfolio.admin.refresh.v1.
- User: memory; authenticated only after /me confirms an active user.

Memory alone avoids browser persistence but cannot restore a session on reload.
sessionStorage restores within a tab without retaining the refresh secret across
normal browser closure; it remains accessible to same-origin JavaScript and XSS.
localStorage would persist longer and share rotating secrets across tabs; it is
deliberately not used. This is not HttpOnly storage. HTTPS is required outside
local development; the existing backend contract has no HttpOnly-cookie flow.

AuthSession centralizes isPlatformBrowser and DOCUMENT.defaultView access.
Server instances do not read browser storage. Storage denial falls back to memory;
reload then requires login. Invalid persisted formats are removed. No credentials
are logged or put into URLs, application environments, transport diagnostics or
generated code.

## Initialization and multiple tabs

On reload/direct /admin navigation, state is unknown. With a stored refresh,
one shared initialization rotates it, stores the new pair and calls /me once.
The guard waits before mounting private components. Without a refresh, it
immediately returns unauthenticated. A failed initialization fails closed and
clears the local session, including network failures; the user can log in again.

A new independent tab requires its own login and creates a separate backend
session. Tabs do not share credentials or synchronize logout. Browser duplication
or an opener may COPY sessionStorage: two copies can then hold the same rotating
secret. One may rotate successfully and the other fail with 401 and require
login. It cannot corrupt/revoke the replacement session; backend rejects replay
of the old secret. This phase intentionally does not coordinate duplicated tabs.
Use a separate login in each tab rather than duplicating an authenticated tab.

## Architecture and concurrency

- AuthApi: Angular HttpClient, configured API_BASE_URL resolved when needed,
  generated request/response types, Phase 1 toApiError, no UI state.
- AuthSession: memory access + SSR-safe refresh persistence.
- AuthService: readonly Signals status/user, login/me initialization, refresh
  single-flight, logout and expiry navigation.
- authGuard/authChildGuard: wait for initialization; protect /admin and future
  children. loginGuard redirects authenticated login to /admin.
- authInterceptor: functional interceptor using withInterceptors, exact
  backend origin and protected path boundaries, one retry maximum. Presigned R2
  and other external URLs are untouched.
- shareReplay with refCount false shares one refresh across all waiting requests
  and lets rotation finish even if a subscriber disappears. Both credentials are
  replaced before retries. A late 401 for the old JWT uses the already rotated
  JWT without starting another refresh.
- Refresh failure clears the session and redirects an active admin route to login.
  A retried 401 expires the session without another refresh. Other HTTP statuses
  preserve their Phase 1 error semantics.
- Epoch checks reject stale login/initialization/refresh results after session
  changes. Logout waits for an in-flight refresh, then revokes the newest secret.
- HTTP auth requests have 15-second transport timeouts; logout additionally caps
  its remote attempt at 10 seconds. Local state is cleared before remote logout
  and remains cleared if it fails. A failed remote revoke may leave a server
  session active until expiry; local logout never depends on server availability.

The login uses typed Reactive Forms, labels, field errors, keyboard focus,
autocomplete, aria-busy/live feedback and duplicate-submit prevention. Password
values are cleared after the attempt. Backend field errors are associated without
displaying internal detail. Retry-After is retained for UI and X-Error-ID for
diagnostics, never as the main message. There are no open redirects.

The minimal /admin placeholder includes logout solely to verify this phase.
No sidebar, dashboard or definitive Admin Shell is included.

Functional interceptors follow the [official Angular guidance](https://angular.dev/guide/http/interceptors).

## Rendering and configuration

/ and /admin/login use RenderMode.Server. SSR login has no browser session and
does not call auth HTTP endpoints. /admin and /admin/** use RenderMode.Client:
the server sends only a client shell, no private content. Guards run in the
browser; an unauthenticated visit redirects to /admin/login. A guard directly
executed on the server returns unauthenticated without accessing browser APIs.
Frontend guards are UX; backend authorization remains authoritative.

Configure production apiBaseUrl in src/environments/environment.ts before
using real auth in a production browser. It intentionally has no localhost
fallback. SSR without a session requires no backend URL. Development uses the
existing environment.development.ts URL. Do not commit any secrets to environments.

## Repeatable validation

Run with the project's supported Node version:

```text
npm run api:generate
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run validate:ssr
npm run test:auth:smoke
npm run test:auth:browser
```

api:generate uses the existing generator; compare hashes/diffs to confirm
consistency. No second client was introduced.

The real API smoke reads AUTH_SMOKE_EMAIL/AUTH_SMOKE_PASSWORD or the ignored
.tools/auth-development.json. AUTH_SMOKE_API_URL can override the development URL.
It checks login, me, GET /admin/projects, rotation, rejection of old credentials,
logout and revocation. It outputs statuses only. It uses fetch solely as a Node
test harness, not as the Angular HTTP layer.

The browser smoke requires npm start on localhost:4200 and a local Chrome.
AUTH_SMOKE_FRONTEND_URL and AUTH_SMOKE_BROWSER_PATH override these defaults.
It uses the browser's native DevTools Protocol, no test framework/dependency.
It reads the ignored local credentials file and tests the actual Angular form,
real concurrent 401s / ONE refresh / three successful retries, reload, logout and
protected re-entry. The intentionally invalid development JWT exercises backend
401 without changing token expiry/configuration. It needs Angular development
debug APIs and is not a production-browser test.

Screenshots and temporary browser profiles are local to .tools (ignored).
No credentials or tokens appear in screenshots or logs. Browser tests count only
POST refresh calls, excluding CORS OPTIONS preflights.

Development administrator was provisioned with the existing backend internal
provision/AuthService mechanism and a random password, without changing backend
files/configuration. Credentials are only in .tools/auth-development.json:
treat this as a private local file, do not commit or share it publicly.

## Validation record

- OpenAPI regeneration: identical SHA-256 generated types.
- Tests: 83 passed in 11 files, including mandatory three-request/single-refresh test.
- Real FastAPI: login, me, protected endpoint, rotation/replay rejection, logout.
- Chrome: login, real concurrent refresh, session reload, logout; responsive
  screenshots at 1440×900, 768×1024 and 390×844 with no horizontal overflow.
- Production SSR: /, /admin/login and /admin; no browser-only API errors or
  private server HTML.

See the phase report for final command results. Phase 3 stays PENDING.

Final validation: ESLint, Prettier, ngc strict TypeScript/templates, production build, SSR and both real smoke scripts passed. Phase 2 COMPLETED; Phase 3 PENDING.

## Integration with Phase 3

The Phase 2 validation record above is historical. Phase 3 now owns the shell,
user display and logout button in AdminLayout; AuthService, guards, tokens,
interceptor and storage strategy remain unchanged.
See [Admin Shell](admin-shell.md) for the current routes and shell validation.
The existing browser smoke now targets AdminLayout for logout and additionally
checks shell navigation, keyboard access, responsive layouts and zero domain calls.

## Integration with Phase 4

Authentication and storage remain unchanged. Development API_BASE_URL now uses
localhost:4200/api/v1 through Angular's /api/** proxy to the same FastAPI backend.
This supports private media redirect delivery with the browser's original origin;
R2 PUT uses a separate interceptor-free HttpClient. The shell browser regression
permits media requests only on the implemented media feature and continues to
reject unrelated domain calls. See [Media Management](media-management.md).

## Late authentication responses

Protected requests capture AuthService's session version before sending credentials.
Login, logout and expiry change that version; token rotation within the same session
preserves it. A late 401 from an earlier session is returned to its caller without
refreshing or replaying the request under a later login. A retried 401 can expire
only its original session version and only while its access token is still current.
This also prevents an old retry from clearing credentials from a newer rotation.

Regression tests cover late initial failures, late retry failures across logins
(including identical access token values), and late retries after another rotation.
