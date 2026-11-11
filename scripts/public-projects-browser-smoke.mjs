// Real public discovery smoke. Administrative APIs prepare/clean isolated fixtures only.
// Credentials, signed URLs and tokens never enter the browser or console.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { detailSmoke } from './public-project-detail-smoke.mjs';
const detailMode = process.argv.includes('--detail');
const origin = process.env.PUBLIC_SMOKE_FRONTEND_URL ?? 'http://localhost:4200';
const base = process.env.AUTH_SMOKE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';
const identity = Date.now();
const prefix = (detailMode ? 'phase11-smoke-' : 'phase10-smoke-') + identity;
const filename = 'frontend-media-smoke-public-' + identity + '.jpg';
const credentials = JSON.parse(
  await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
);
let tokens,
  asset,
  authorization,
  browser,
  productionServer,
  socket,
  seq = 0,
  runtimeErrors = 0,
  hydrationErrors = 0,
  forbidden = 0,
  r2Images = 0;
const projects = [],
  additionalUploads = [],
  categories = [],
  tags = [],
  pending = new Map(),
  publicRequests = [];
async function request(method, path, body, admin = false) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(admin ? { Authorization: 'Bearer ' + tokens.access_token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok)
    throw new Error('Fixture API ' + method + ' ' + path.split('?')[0] + ' status ' + r.status);
  return r.status === 204 ? null : r.json();
}
function verify(phase, name = filename) {
  const result = execFileSync(
    fileURLToPath(new URL('../../backend/.venv/Scripts/python.exe', import.meta.url)),
    [
      fileURLToPath(new URL('./media-smoke-verify.py', import.meta.url)),
      '--name',
      name,
      '--phase',
      phase,
    ],
    {
      cwd: fileURLToPath(new URL('../../backend/', import.meta.url)),
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONPATH: fileURLToPath(new URL('../../backend/', import.meta.url)),
      },
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  console.log(result.trim());
}
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout'));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  assert.ok(!r.exceptionDetails, 'Browser evaluation failed');
  return r.result.value;
}
async function until(expression) {
  for (let i = 0; i < 150; i++) {
    try {
      if (await evaluate(expression)) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Browser condition timed out: ' + expression);
}
async function navigate(path = '/') {
  await send('Page.navigate', { url: origin + path });
  await until(
    "!!document.querySelector('app-public-header') && !!globalThis.ng?.getComponent(document.querySelector('app-public-header'))",
  );
  await until(
    "!document.querySelector('app-project-index section') || document.querySelector('app-project-index section').getAttribute('aria-busy')==='false'",
  );
  await evaluate('document.fonts.ready');
}
async function capture(name) {
  // Allow the existing header/scroll transitions to settle before visual comparison.
  await delay(350);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    new URL('../.tools/public-projects-' + name + '.png', import.meta.url),
    Buffer.from(r.data, 'base64'),
  );
}
async function press(key, code) {
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: code,
      text: type === 'keyDown' && key === 'Enter' ? '\r' : undefined,
    });
}
try {
  tokens = await request('POST', '/auth/login', credentials);
  const bytes = await readFile(new URL('../public/images/foundation-study.jpg', import.meta.url));
  authorization = await request(
    'POST',
    '/admin/media/uploads/presign',
    {
      original_filename: filename,
      mime_type: 'image/jpeg',
      file_size: bytes.length,
      access: 'public',
      title: 'Phase 10 smoke-only image',
      alt_text: 'Temporary public integration fixture; not a portfolio project.',
    },
    true,
  );
  assert.equal(authorization.provider, 'r2');
  const put = await fetch(authorization.upload_url, {
    method: authorization.method,
    headers: authorization.headers,
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  assert.ok(put.ok, 'Temporary R2 upload failed');
  asset = await request(
    'POST',
    '/admin/media/uploads/confirm',
    { upload_id: authorization.upload_id },
    true,
  );
  verify('present');
  for (const suffix of ['a', 'b'])
    categories.push(
      await request(
        'POST',
        '/admin/categories',
        { name: 'Smoke collection ' + suffix.toUpperCase(), slug: prefix + '-' + suffix },
        true,
      ),
    );
  tags.push(
    await request('POST', '/admin/tags', { name: 'Smoke tag', slug: prefix + '-tag' }, true),
  );
  for (let i = 0; i < 4; i++) {
    const p = await request(
      'POST',
      '/admin/projects',
      {
        title: [
          'Smoke / Courtyard Study',
          'Smoke / Concrete Pavilion',
          'Smoke / Interior Sequence',
          'Smoke / Spatial Framework',
        ][i],
        slug: prefix + '-public-' + i,
        short_description:
          'Temporary integration project. This record is removed after the Phase 10 smoke test.',
        status: 'DRAFT',
        visibility: 'PUBLIC',
        is_featured: i === 0,
        sort_order: i,
        year: 2026,
        location: 'Temporary test content',
      },
      true,
    );
    projects.push(p);
    if (i === 0)
      await request('PUT', '/admin/projects/' + p.id + '/tags', { ids: [tags[0].id] }, true);
    await request(
      'PUT',
      '/admin/projects/' + p.id + '/categories',
      { ids: [categories[i < 2 ? 0 : 1].id] },
      true,
    );
    await request('PUT', '/admin/projects/' + p.id + '/cover', { media_id: asset.id }, true);
    await request('PATCH', '/admin/projects/' + p.id, { status: 'PUBLISHED' }, true);
  }
  const excluded = [];
  for (const [kind, status, visibility] of [
    ['draft', 'DRAFT', 'PUBLIC'],
    ['private', 'PUBLISHED', 'PRIVATE'],
    ['archived', 'ARCHIVED', 'PUBLIC'],
    ['unlisted', 'PUBLISHED', 'UNLISTED'],
    ['deleted', 'PUBLISHED', 'PUBLIC'],
  ]) {
    const p = await request(
      'POST',
      '/admin/projects',
      {
        title: 'Smoke excluded ' + kind,
        slug: prefix + '-' + kind,
        status: 'DRAFT',
        visibility,
        is_featured: true,
      },
      true,
    );
    projects.push(p);
    excluded.push(p.slug);
    if (status === 'PUBLISHED' && kind !== 'deleted') {
      await request('PUT', '/admin/projects/' + p.id + '/cover', { media_id: asset.id }, true);
    }
    if (kind !== 'deleted') await request('PATCH', '/admin/projects/' + p.id, { status }, true);
    if (kind === 'deleted') await request('DELETE', '/admin/projects/' + p.id, undefined, true);
  }
  for (const endpoint of ['/public/projects', '/public/featured-projects']) {
    const page = await request('GET', endpoint + '?limit=100');
    for (const slug of excluded)
      assert.ok(!page.items.some((p) => p.slug === slug), 'Visibility exclusion failed');
  }
  const direct = await request('GET', '/public/projects/' + prefix + '-unlisted');
  assert.equal(direct.slug, prefix + '-unlisted');
  console.log(
    'Privacy: DRAFT / PRIVATE / ARCHIVED / UNLISTED / soft-deleted excluded; UNLISTED direct backend contract: OK',
  );
  const ssr = await (await fetch(origin + '/')).text();
  assert.ok(
    ssr.includes(projects[0].title) &&
      ssr.includes('SELECTED PROJECTS') &&
      ssr.includes('PROJECT INDEX'),
    'Home SSR must contain real projects',
  );
  assert.ok(
    !ssr.includes('admin-access') && !ssr.includes(tokens.access_token),
    'SSR must not include tokens',
  );
  for (const slug of excluded) assert.ok(!ssr.includes(slug));
  const ssrList = await (
    await fetch(origin + '/projects?category=' + categories[0].slug + '&limit=1')
  ).text();
  assert.ok(ssrList.includes(projects[0].title), 'Projects SSR real data');
  productionServer = spawn(process.execPath, ['dist/architecture-portfolio/server/server.mjs'], {
    env: { ...process.env, PORT: '4303', API_BASE_URL: base },
    stdio: 'ignore',
    windowsHide: true,
  });
  let productionReady = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://localhost:4303/projects?category=' + categories[0].slug, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        assert.equal(r.headers.get('cache-control'), 'no-store');
        const html = await r.text();
        assert.ok(html.includes(projects[0].title));
        for (const slug of excluded) assert.ok(!html.includes(slug));
        assert.ok(!html.includes(tokens.access_token));
        productionReady = true;
        break;
      }
    } catch {
      await delay(100);
    }
  }
  assert.ok(productionReady, 'Production SSR did not render real public projects');
  console.log('Production SSR real projects / no-store / privacy: OK');
  const profile = new URL('../.tools/public-projects-profile-' + identity + '/', import.meta.url);
  await mkdir(profile, { recursive: true });
  browser = spawn(
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    [
      '--headless=new',
      '--disable-gpu',
      ...(detailMode ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []),
      '--no-first-run',
      '--remote-debugging-port=0',
      '--user-data-dir=' + fileURLToPath(profile),
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number(
        (await readFile(new URL('DevToolsActivePort', profile), 'utf8')).split('\n')[0],
      );
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port);
  const targets = await (await fetch('http://localhost:' + port + '/json')).json();
  socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        clearTimeout(p.timer);
        m.error ? p.reject(new Error('CDP failure')) : p.resolve(m.result);
      }
    } else if (m.method === 'Runtime.exceptionThrown') runtimeErrors++;
    else if (m.method === 'Runtime.consoleAPICalled' && JSON.stringify(m.params).match(/NG05\d\d/))
      hydrationErrors++;
    else if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      const url = new URL(r.url);
      if (url.pathname.startsWith('/api/')) {
        publicRequests.push(url.pathname + url.search);
        if (
          !url.pathname.startsWith('/api/v1/public/') ||
          Object.keys(r.headers).some((h) => /authorization|refresh/i.test(h))
        )
          forbidden++;
      }
      if (
        r.url.includes('.r2.cloudflarestorage.com') &&
        Object.keys(r.headers).some((h) => /authorization/i.test(h))
      )
        forbidden++;
    } else if (
      m.method === 'Network.responseReceived' &&
      m.params.response.url.includes('.r2.cloudflarestorage.com') &&
      m.params.response.status === 200
    )
      r2Images++;
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (detailMode) {
    await detailSmoke({
      request,
      projects,
      asset,
      prefix,
      filename,
      base,
      origin,
      evaluate,
      send,
      navigate,
      until,
      capture,
      publicRequests,
      upload: async (name, mime, bytes) => {
        const authorization = await request(
          'POST',
          '/admin/media/uploads/presign',
          {
            original_filename: name,
            mime_type: mime,
            file_size: bytes.length,
            access: 'public',
            title: 'Phase 11 temporary media',
          },
          true,
        );
        const fixture = { name, authorization, asset: null };
        additionalUploads.push(fixture);
        const response = await fetch(authorization.upload_url, {
          method: authorization.method,
          headers: authorization.headers,
          body: bytes,
        });
        assert.ok(response.ok);
        fixture.asset = await request(
          'POST',
          '/admin/media/uploads/confirm',
          { upload_id: authorization.upload_id },
          true,
        );
        verify('present', name);
        return fixture.asset;
      },
    });
  }
  for (const width of [1440, 1024, 768, 375]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width === 375 ? 812 : 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const before = publicRequests.length;
    await navigate();
    await delay(500);
    assert.equal(await evaluate('sessionStorage.length'), 0, 'Public browser must have no session');
    assert.equal(
      await evaluate(
        "document.querySelector('h1').textContent.includes('Smoke / Courtyard Study')",
      ),
      true,
    );
    assert.equal(await evaluate("document.querySelectorAll('app-project-preview').length"), 4);
    assert.equal(await evaluate("document.querySelectorAll('app-project-spotlight').length"), 2);
    assert.equal(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      true,
      'Public overflow at ' + width,
    );
    assert.ok(
      !publicRequests
        .slice(before)
        .some((p) => /public\/(projects|featured-projects|categories)(\?|$)/.test(p)),
      'Hydration duplicated initial API queries',
    );
    await until("document.querySelector('app-project-spotlight img')?.naturalWidth>0");
    await capture('hero-' + width);
    await evaluate("document.querySelector('#projects').scrollIntoView()");
    await delay(1200);
    await capture('selected-' + width);
    await evaluate("document.querySelector('#project-index').scrollIntoView()");
    await delay(1200);
    await capture('index-' + width);
    if (width >= 1024) {
      const rect = await evaluate(
        "(()=>{const r=document.querySelector('.index-rows a').getBoundingClientRect();return {x:r.x+150,y:r.y+20};})()",
      );
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
      await until("!!document.querySelector('.floating-preview')");
      assert.equal(
        await evaluate(
          "(()=>{const r=document.querySelector('.floating-preview').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&r.left>=0&&r.top>=0;})()",
        ),
        true,
      );
      await capture('hover-' + width);
    } else assert.equal(await evaluate("!!document.querySelector('.floating-preview')"), false);
    await evaluate("document.querySelectorAll('app-project-spotlight')[1].scrollIntoView()");
    await delay(600);
    await capture('featured-' + width);
    if (width === 375) {
      await evaluate("document.querySelector('.menu-trigger').focus()");
      await press('Enter', 13);
      await until("document.querySelector('dialog').open");
      await press('Escape', 27);
      await until("!document.querySelector('dialog').open");
      assert.equal(
        await evaluate("document.activeElement.classList.contains('menu-trigger')"),
        true,
      );
    }
    console.log('Real public Home / images / SSR hydration / ' + width + 'px: OK');
  }
  const longTitle = (
    'Smoke / ' + 'Architectural perspectives and spatial sequences '.repeat(4)
  ).slice(0, 200);
  await request('PATCH', '/admin/projects/' + projects[0].id, { title: longTitle }, true);
  for (const width of [375, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate();
    assert.equal(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      true,
      'Long-title overflow',
    );
    assert.equal(
      await evaluate(
        "(()=>{const title=document.querySelector('h1').getBoundingClientRect(),hero=document.querySelector('.hero').getBoundingClientRect();return title.top>=88&&title.bottom<=hero.bottom;})()",
      ),
      true,
      'Hero must grow rather than clip a long title',
    );
  }
  await request('PATCH', '/admin/projects/' + projects[0].id, { title: projects[0].title }, true);
  await navigate('/projects?tag=' + tags[0].slug);
  assert.equal(
    await evaluate("document.querySelectorAll('.index-rows li').length"),
    1,
    'Real tag filter',
  );
  await navigate('/projects?category=' + categories[0].slug + '&limit=1&offset=0');
  assert.equal(await evaluate("document.querySelectorAll('.index-rows li').length"), 1);
  await evaluate("document.querySelector('.pagination button:last-child').click()");
  await until(
    "location.search.includes('offset=1')&&document.querySelector('.index-rows').textContent.includes('Concrete Pavilion')",
  );
  await send('Page.reload');
  await until("!!globalThis.ng?.getComponent(document.querySelector('app-public-projects-page'))");
  await until("document.querySelector('.index-rows')?.textContent.includes('Concrete Pavilion')");
  await send('Runtime.evaluate', { expression: 'history.back()' });
  await delay(600);
  await until("document.querySelector('.index-rows')?.textContent.includes('Courtyard Study')");
  await evaluate(
    "[...document.querySelectorAll('.filters button')].find(b=>b.textContent.includes('collection B')).click()",
  );
  await until(
    "location.search.includes('category='+" +
      JSON.stringify(categories[1].slug) +
      ")&&!location.search.includes('offset=1')",
  );
  await until("document.querySelector('.index-rows')?.textContent.includes('Interior Sequence')");
  await navigate('/projects?tag=phase10-absent-' + identity);
  assert.equal(
    await evaluate("document.body.textContent.includes('No projects match these filters.')"),
    true,
  );
  await navigate('/projects?category=' + categories[0].slug);
  await evaluate("document.querySelector('.index-rows a').click()");
  await until(
    "location.pathname.includes('/projects/'+" +
      JSON.stringify(projects[0].slug) +
      ") && !!document.querySelector('app-project-detail article')",
  );
  assert.equal(await evaluate("!!document.querySelector('app-project-sections')"), false);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await navigate();
  await evaluate("document.querySelector('#project-index').scrollIntoView()");
  await delay(200);
  assert.equal(await evaluate("!!document.querySelector('.floating-preview')"), false);
  assert.equal(forbidden, 0, 'Public navigation sent tokens or used admin/auth endpoints');
  assert.equal(runtimeErrors, 0, 'Public runtime errors');
  assert.equal(hydrationErrors, 0, 'Hydration mismatches');
  assert.ok(r2Images > 0, 'Real R2 image delivery was not observed');
  console.log(
    'Real filters / pagination / query reload / Back / slug navigation / reduced motion / no auth / R2 GET: OK',
  );
} catch (error) {
  console.error('Public projects smoke failed:', error.message, error.cause?.code ?? '');
  process.exitCode = 1;
} finally {
  try {
    if (tokens) {
      tokens = await request('POST', '/auth/refresh', { refresh_token: tokens.refresh_token });
      for (const p of projects) {
        const response = await fetch(base + '/admin/projects/' + p.id, {
          headers: { Authorization: 'Bearer ' + tokens.access_token },
        });
        if (response.status === 404) continue;
        assert.ok(response.ok);
        await request('PATCH', '/admin/projects/' + p.id, { status: 'DRAFT' }, true);
        if (detailMode) {
          const sections = await request(
            'GET',
            '/admin/projects/' + p.id + '/sections?limit=100',
            undefined,
            true,
          );
          for (const section of sections.items)
            await request(
              'DELETE',
              '/admin/projects/' + p.id + '/sections/' + section.id,
              undefined,
              true,
            );
        }
        await request('PUT', '/admin/projects/' + p.id + '/categories', { ids: [] }, true);
        await request('PUT', '/admin/projects/' + p.id + '/tags', { ids: [] }, true);
        const links = await request(
          'GET',
          '/admin/projects/' + p.id + '/media?limit=100',
          undefined,
          true,
        );
        for (const l of links.items)
          await request('DELETE', '/admin/projects/' + p.id + '/media/' + l.id, undefined, true);
        await request('DELETE', '/admin/projects/' + p.id, undefined, true);
      }
      for (const c of categories)
        await request('DELETE', '/admin/categories/' + c.id, undefined, true);
      for (const t of tags) await request('DELETE', '/admin/tags/' + t.id, undefined, true);
      if (asset) await request('DELETE', '/admin/media/' + asset.id, undefined, true);
      else if (authorization)
        await request('DELETE', '/admin/media/uploads/' + authorization.upload_id, undefined, true);
      for (const fixture of additionalUploads) {
        if (fixture.asset) {
          await request('DELETE', '/admin/media/' + fixture.asset.id, undefined, true);
          verify('clean', fixture.name);
        } else
          await request(
            'DELETE',
            '/admin/media/uploads/' + fixture.authorization.upload_id,
            undefined,
            true,
          );
      }
      if (asset) verify('clean');
      if (asset) {
        const removed = await fetch(base + '/admin/media/' + asset.id, {
          headers: { Authorization: 'Bearer ' + tokens.access_token },
        });
        assert.equal(removed.status, 404, 'Temporary asset deleted through API');
      }
      await request('POST', '/auth/logout', { refresh_token: tokens.refresh_token });
      const remaining = await request('GET', '/public/projects?limit=100');
      assert.ok(!remaining.items.some((p) => p.slug.startsWith(prefix)));
      console.log(
        'Cleanup: projects soft-deleted, relations/categories removed, temporary media removed through APIs: OK',
      );
    }
  } catch {
    console.error('Smoke cleanup requires local inspection');
    process.exitCode = 1;
  }
  for (const p of pending.values()) clearTimeout(p.timer);
  socket?.close();
  browser?.kill();
  productionServer?.kill();
}
