import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const requests = [];
const upstream = createServer(async (req, res) => {
  requests.push({ url: req.url, authorization: req.headers.authorization });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/v1/admin/media/test/content') {
    res.writeHead(307, { Location: 'https://signed.example.test/file' });
    return res.end();
  }
  if (req.url === '/api/v1/rate-limit') {
    res.writeHead(429, { 'Retry-After': '15' });
    return res.end(JSON.stringify({ detail: 'Rate limited' }));
  }
  if (req.url === '/api/v1/validation') {
    res.writeHead(422);
    return res.end(JSON.stringify({ detail: [{ loc: ['body', 'name'], msg: 'Required' }] }));
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  res.end(JSON.stringify({ url: req.url, method: req.method, body }));
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const port = 4306;
const server = spawn(process.execPath, ['dist/architecture-portfolio/server/server.mjs'], {
  env: {
    ...process.env,
    PORT: String(port),
    UPSTREAM_API_BASE_URL: `http://127.0.0.1:${upstream.address().port}/api/v1`,
  },
  stdio: 'ignore',
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      ready = (await fetch(`http://localhost:${port}/healthz`)).ok;
    } catch {
      /* server boot */
    }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready);
  const base = `http://localhost:${port}/api/v1`;
  const publicRead = await fetch(base + '/public/projects?category_slug=architecture');
  assert.equal((await publicRead.json()).url, '/api/v1/public/projects?category_slug=architecture');
  assert.equal(requests.at(-1).authorization, undefined);
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"test":true}',
  });
  assert.equal((await login.json()).body, '{"test":true}');
  const redirect = await fetch(base + '/admin/media/test/content', {
    headers: { Authorization: 'Bearer synthetic-test-only' },
    redirect: 'manual',
  });
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('location'), 'https://signed.example.test/file');
  assert.equal(requests.at(-1).authorization, 'Bearer synthetic-test-only');
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  const rate = await fetch(base + '/rate-limit');
  assert.equal(rate.status, 429);
  assert.equal(rate.headers.get('retry-after'), '15');
  const validation = await fetch(base + '/validation');
  assert.equal(validation.status, 422);
  assert.equal((await validation.json()).detail[0].loc[1], 'name');
  console.log(
    'API gateway: public anonymity, query/body forwarding, manual signed redirect, no-store, 422 and 429: OK',
  );
} finally {
  server.kill();
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
}
