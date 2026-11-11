import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env['AUTH_SMOKE_API_URL'] ?? 'http://127.0.0.1:8000/api/v1';
const credentials =
  process.env['AUTH_SMOKE_EMAIL'] && process.env['AUTH_SMOKE_PASSWORD']
    ? { email: process.env['AUTH_SMOKE_EMAIL'], password: process.env['AUTH_SMOKE_PASSWORD'] }
    : JSON.parse(
        await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
      );
async function request(path, body, access) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(access ? { Authorization: 'Bearer ' + access } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return response;
}
let active;
try {
  const login = await request('/auth/login', credentials);
  assert.equal(login.status, 200, 'Login status');
  active = await login.json();
  assert.equal(active.token_type, 'bearer');
  assert.ok(active.expires_in > 0);
  console.log('Real login: OK');
  assert.equal((await request('/auth/me', undefined, active.access_token)).status, 200);
  console.log('Real /me: OK');
  assert.equal((await request('/admin/projects', undefined, active.access_token)).status, 200);
  console.log('Real protected endpoint: OK');
  const old = active;
  const refresh = await request('/auth/refresh', { refresh_token: old.refresh_token });
  assert.equal(refresh.status, 200);
  active = await refresh.json();
  assert.notEqual(active.access_token, old.access_token);
  assert.notEqual(active.refresh_token, old.refresh_token);
  assert.equal((await request('/auth/me', undefined, active.access_token)).status, 200);
  assert.equal((await request('/auth/me', undefined, old.access_token)).status, 401);
  assert.equal((await request('/auth/refresh', { refresh_token: old.refresh_token })).status, 401);
  console.log('Real refresh rotation and old credential rejection: OK');
  assert.equal(
    (await request('/auth/logout', { refresh_token: active.refresh_token })).status,
    204,
  );
  assert.equal((await request('/auth/me', undefined, active.access_token)).status, 401);
  assert.equal(
    (await request('/auth/refresh', { refresh_token: active.refresh_token })).status,
    401,
  );
  active = undefined;
  console.log('Real logout and revocation: OK');
} catch {
  console.error('Authentication smoke failed. No credentials or response payloads are printed.');
  process.exitCode = 1;
} finally {
  if (active)
    await request('/auth/logout', { refresh_token: active.refresh_token }).catch(() => {});
}
