import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onPreBuild, onBuild, onEnd } from '../node_modules/@netlify/angular-runtime/src/index.js';

// Run after build:netlify. This checks the adapter hooks and compiled handler locally;
// it does not replace the hosted Deno/runtime and real Render/R2 browser checks.
const fail = (message) => {
  throw new Error(message);
};
const publish = join('dist', 'architecture-portfolio', 'browser');
const netlifyConfig = { build: { publish } };
const args = {
  netlifyConfig,
  utils: { build: { failBuild: fail, failPlugin: fail } },
  constants: {
    PUBLISH_DIR: publish,
    INTERNAL_EDGE_FUNCTIONS_SRC: resolve('.netlify/edge-functions-internal'),
    IS_LOCAL: false,
    PACKAGE_PATH: '',
  },
};
try {
  await onPreBuild(args);
  await onBuild(args);
  const edge = await readFile(
    '.netlify/edge-functions-internal/angular-ssr/angular-ssr.mjs',
    'utf8',
  );
  assert.match(edge, /netlifyAppEngineHandler/);
  assert.match(edge, /cache: "manual"/);
  console.log('Netlify adapter: custom handler accepted; SSR edge output generated');
} finally {
  await onEnd();
}

process.env.NETLIFY_LOCAL = 'true';
process.env.DISABLE_INDEXING = 'true';
// Unset external API overrides: the Netlify build must use the same-origin gateway.
delete process.env.API_BASE_URL;
delete process.env.UPSTREAM_API_BASE_URL;
const { netlifyAppEngineHandler: handle } = await import(
  pathToFileURL(resolve('dist/architecture-portfolio/server/server.mjs')).href
);
assert.equal(typeof handle, 'function', 'Run npm run build:netlify first');

const server = createServer(async (req, res) => {
  try {
    const request = new Request(`http://localhost:${server.address().port}${req.url}`, {
      method: req.method,
      headers: req.headers,
    });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end('Local handler validation failed');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://localhost:${server.address().port}`;
try {
  const health = await fetch(origin + '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const api = await fetch(origin + '/api/v1/health');
  assert.equal(api.status, 502);
  assert.deepEqual(await api.json(), { detail: 'API unavailable' });
  const robots = await fetch(origin + '/robots.txt');
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
  for (const route of ['/', '/projects', '/admin/login', '/admin/projects']) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('netlify-cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await response.text();
    assert.match(html, /<html[^>]*lang="es"/);
    if (route === '/' || route === '/projects') assert.match(html, /<app-public-layout[\s>]/);
    if (route === '/admin/login') assert.match(html, /<app-admin-login[\s>]/);
    if (route === '/admin/projects') assert.doesNotMatch(html, /<app-admin-layout[\s>]/);
    console.log(`Netlify handler ${route}: SSR/client shell, no-store and noindex OK`);
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
