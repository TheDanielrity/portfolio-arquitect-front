import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forwardNetlifyApi } from '../src/server/netlify-api-gateway.ts';

const upstream = 'https://backend.example.test/api/v1';
const origin = 'https://portfolio.example.test';

test('public requests preserve query and only forward intended headers', async () => {
  const response = await forwardNetlifyApi(
    new Request(origin + '/api/v1/public/projects?limit=12&offset=0', {
      headers: { Cookie: 'private=value', 'X-Untrusted': 'ignored', Accept: 'application/json' },
    }),
    upstream,
    async (url, init) => {
      assert.equal(url.href, upstream + '/public/projects?limit=12&offset=0');
      assert.equal(init.headers.get('authorization'), null);
      assert.equal(init.headers.get('cookie'), null);
      assert.equal(init.headers.get('x-untrusted'), null);
      assert.equal(init.headers.get('accept'), 'application/json');
      return Response.json({ items: [] });
    },
  );
  assert.deepEqual(await response.json(), { items: [] });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('login body and method reach the configured API', async () => {
  const body = JSON.stringify({ email: 'synthetic@example.test', password: 'synthetic-only' });
  const response = await forwardNetlifyApi(
    new Request(origin + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
    upstream,
    async (url, init) => {
      assert.equal(init.method, 'POST');
      assert.equal(await new Request(url, init).text(), body);
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(response.status, 204);
});

test('private R2 redirect is returned without following or leaking extra headers', async () => {
  let calls = 0;
  const response = await forwardNetlifyApi(
    new Request(origin + '/api/v1/admin/media/synthetic/content', {
      headers: { Authorization: 'Bearer synthetic-only', Range: 'bytes=0-99' },
    }),
    upstream,
    async (url, init) => {
      calls++;
      assert.equal(url.origin, 'https://backend.example.test');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.get('authorization'), 'Bearer synthetic-only');
      assert.equal(init.headers.get('range'), 'bytes=0-99');
      return new Response(null, {
        status: 307,
        headers: { Location: 'https://r2.example.test/signed', 'Set-Cookie': 'ignored=value' },
      });
    },
  );
  assert.equal(calls, 1);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://r2.example.test/signed');
  assert.equal(response.headers.get('set-cookie'), null);
});

for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) {
  test(`backend ${status} and diagnostics are preserved`, async () => {
    const body = { detail: [{ loc: ['body', 'name'], msg: 'Required' }] };
    const response = await forwardNetlifyApi(
      new Request(origin + '/api/v1/admin/projects'),
      upstream,
      async () =>
        Response.json(body, {
          status,
          headers: { 'Retry-After': '15', 'X-Error-ID': 'synthetic-id' },
        }),
    );
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
    assert.equal(response.headers.get('retry-after'), '15');
    assert.equal(response.headers.get('x-error-id'), 'synthetic-id');
  });
}

test('partial media responses preserve bytes and range metadata', async () => {
  const response = await forwardNetlifyApi(
    new Request(origin + '/api/v1/public/media/synthetic/content'),
    upstream,
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-2/10', 'Accept-Ranges': 'bytes' },
      }),
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-2/10');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test('invalid upstream settings fail closed without network access', async () => {
  for (const setting of [
    undefined,
    'http://backend.example.test/api/v1',
    'https://user:secret@backend.example.test/api/v1',
    upstream + '?key=secret',
    upstream + '#fragment',
    'https://backend.example.test',
    origin + '/api/v1',
  ]) {
    const response = await forwardNetlifyApi(
      new Request(origin + '/api/v1/auth/login'),
      setting,
      () => {
        assert.fail('Must not make a request');
      },
    );
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { detail: 'API unavailable' });
  }
});

test('non-API requests never forward credentials', async () => {
  const response = await forwardNetlifyApi(new Request(origin + '/projects'), upstream, () => {
    assert.fail('Must not make a request');
  });
  assert.equal(response.status, 404);
});

test('upstream connection failure returns a safe non-cacheable error', async () => {
  const response = await forwardNetlifyApi(new Request(origin + '/api/v1/health'), upstream, () => {
    throw new Error('Sensitive upstream details');
  });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { detail: 'API unavailable' });
});
