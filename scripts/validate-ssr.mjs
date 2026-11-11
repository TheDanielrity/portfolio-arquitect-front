import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const port = 4301;
const server = spawn(process.execPath, ['dist/architecture-portfolio/server/server.mjs'], {
  env: {
    ...process.env,
    PORT: String(port),
    DISABLE_INDEXING: 'true',
    API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:8000/api/v1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});
const exited = new Promise((resolve) => server.once('exit', resolve));

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, `SSR server exited:\n${output}`);
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {
      // Wait for the generated server to start listening.
    }
    if (ready) break;
    await setTimeout(250);
  }
  assert.ok(ready, `SSR server did not become ready:\n${output}`);
  const health = await fetch(`http://localhost:${port}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(health.headers.get('x-robots-tag'), 'noindex, nofollow');
  const robots = await fetch(`http://localhost:${port}/robots.txt`);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
  console.log('Staging healthcheck and indexing controls: OK');
  for (const [route, layout, heading] of [
    ['/', 'public', null],
    ['/projects', 'public', null],
    ['/admin/login', null, 'Administración'],
  ]) {
    const response = await fetch(`http://localhost:${port}${route}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    if (layout) assert.match(html, new RegExp(`<app-${layout}-layout[\\s>]`));
    if (heading) assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`));
    else {
      if (route === '/') assert.match(html, /id="public-hero-heading"/);
      assert.match(html, /PROYECTOS SELECCIONADOS|PROYECTOS/);
      assert.doesNotMatch(html, /Comprobar conexi/);
    }
    assert.match(html, /<html[^>]*lang="es"/);
    console.log(`SSR ${route}: OK`);
  }
  const missing = await fetch(
    `http://localhost:${port}/projects/phase11-nonexistent-smoke-project`,
  );
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Proyecto no encontrado/);
  console.log('SSR project detail missing slug: OK (404)');
  for (const route of [
    '/admin',
    '/admin/projects',
    '/admin/projects/new',
    '/admin/projects/00000000-0000-0000-0000-000000000000/edit',
    '/admin/media',
    '/admin/profile',
    '/admin/services',
    '/admin/settings',
    '/admin/messages',
  ]) {
    const response = await fetch('http://localhost:' + port + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(
      html,
      /<app-project-[\w-]+[\s>]|<app-media-page[\s>]|<app-(?:profile-page|services-page|settings-page|social-links|messages-page|message-detail)[\s>]|<app-admin-layout[\s>]|<app-admin-placeholder[\s>]|<app-admin-navigation[\s>]|<app-admin-drawer[\s>]|Cerrar sesión|Contenido administrativo/,
    );
    console.log('SSR ' + route + ': OK (client shell only; no private content)');
  }
  assert.doesNotMatch(output, /ReferenceError|ERROR|NG\d{4,5}/);
} finally {
  server.kill();
  await exited;
}
