// Temporary development server only; never stops the user's server on port 4200.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(0, '0.0.0.0', resolve);
});
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const environment = { ...process.env };
delete environment.API_BASE_URL;
const child = spawn(
  process.execPath,
  ['node_modules/@angular/cli/bin/ng.js', 'serve', '--host', '0.0.0.0', '--port', String(port)],
  { env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);
let output = '';
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
const exited = new Promise((resolve) => child.once('exit', resolve));
function get(path, host = 'localhost') {
  return new Promise((resolve, reject) => {
    const call = request(
      { hostname: '127.0.0.1', port, path, headers: { Host: host + ':' + port }, timeout: 30000 },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (data) => (body += data));
        response.on('end', () =>
          resolve({ status: response.statusCode, body, headers: response.headers }),
        );
        response.on('error', reject);
      },
    );
    call.on('timeout', () => call.destroy(new Error('LAN check timed out')));
    call.on('error', reject);
    call.end();
  });
}
try {
  let ready = false;
  for (let i = 0; i < 240; i++) {
    assert.equal(child.exitCode, null, 'Temporary Angular server exited: ' + output.slice(-1200));
    try {
      ready = (await get('/@vite/client')).status === 200;
    } catch {
      /* Server starting. */
    }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, 'Temporary Angular server did not start');
  for (const host of ['localhost', '192.168.18.5']) {
    const page = await get('/projects', host);
    assert.equal(page.status, 200, 'SSR host rejected: ' + host);
    const states = [
      ...page.body.matchAll(/<script\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g),
    ].map((match) => JSON.parse(match[1]));
    const apiOrigin = states.find((state) => state['public-api-base-url'])?.['public-api-base-url'];
    assert.equal(
      apiOrigin,
      'http://' + host + ':' + port + '/api/v1',
      'API origin does not follow the request host; SSR state missing: ' +
        (states.length === 0) +
        '; ' +
        output.slice(-800),
    );
    const health = await get('/api/v1/health', host);
    assert.equal(health.status, 200, 'Real API proxy failed for ' + host);
    const images = [...page.body.matchAll(/<img\b[^>]*src="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((src) => src.includes('/api/v1/public/media/') && !src.includes('?'));
    assert.ok(images.length > 0, 'Published image fixtures must exist for the LAN check');
    for (const src of images)
      assert.equal(
        new URL(src).origin,
        'http://' + host + ':' + port,
        'An SSR image still points to the backend loopback origin',
      );
    const image = await get(new URL(images[0]).pathname, host);
    if (image.status === 307 || image.status === 302) {
      assert.ok(image.headers.location, 'Missing image delivery redirect');
      const delivered = await fetch(image.headers.location, { signal: AbortSignal.timeout(15000) });
      assert.equal(delivered.status, 200, 'Image delivery from storage failed');
      assert.ok(delivered.headers.get('content-type')?.startsWith('image/'));
      assert.ok((await delivered.arrayBuffer()).byteLength > 0);
    } else {
      assert.equal(image.status, 200, 'Image proxy failed');
      assert.ok(image.headers['content-type']?.startsWith('image/'));
    }
    console.log('SSR + same-origin API proxy: ' + host + ' OK');
    console.log('Managed image URL + real image delivery: ' + host + ' OK');
  }
  const denied = await get('/projects', 'untrusted.example.test');
  assert.ok(denied.status >= 400 && denied.status < 500, 'Unknown hosts must remain blocked');
  console.log('Untrusted Host blocked: OK');
} finally {
  if (child.exitCode === null) child.kill();
  await Promise.race([exited, delay(5000)]);
  console.log('Temporary LAN test server stopped; port 4200 untouched.');
}
