// Real public reads and one clearly marked contact receipt. Owner content is never changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.env.PUBLIC_SMOKE_FRONTEND_URL ?? 'http://localhost:4200';
const base = process.env.AUTH_SMOKE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';
const marker = 'phase12-public-contact-smoke-' + Date.now();
const profileDir = new URL('../.tools/' + marker + '/', import.meta.url);
await mkdir(profileDir, { recursive: true });
let browser, production, socket;
let submitted = false;
let receiptObserved = false;
let sequence = 0;
const pending = new Map();
const requests = [];
const issues = [];
let contactPosts = 0;
let r2Reads = 0;
async function publicRead(path) {
  const response = await fetch(base + '/public' + path, { signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, 'Public contract failed: ' + path + ' (' + response.status + ')');
  return response.json();
}
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP command timed out'));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  assert.ok(!result.exceptionDetails, 'Browser evaluation failed');
  return result.result.value;
}
async function until(expression) {
  for (let index = 0; index < 200; index++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error('Public browser condition timed out');
}
async function screenshot(name) {
  await delay(350);
  const result = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    new URL('../.tools/public-content-' + name + '.png', import.meta.url),
    Buffer.from(result.data, 'base64'),
  );
}
async function anchor(label) {
  const mobile = await evaluate('innerWidth < 1024');
  if (mobile) {
    await evaluate("document.querySelector('.menu-trigger').click()");
    await until("!!document.querySelector('dialog:modal')");
  }
  await evaluate(
    `Array.from(document.querySelectorAll(${JSON.stringify(mobile ? 'app-public-mobile-menu a' : '.desktop-navigation a')})).find(a => a.textContent.includes(${JSON.stringify(label)})).click()`,
  );
  await until(
    `location.hash === ${JSON.stringify('#' + label.toLowerCase())} && !!document.getElementById(${JSON.stringify(label.toLowerCase())})`,
  );
  await delay(600);
  const bounds = await evaluate(
    `(() => { const section = document.getElementById(${JSON.stringify(label.toLowerCase())}), header = document.querySelector('app-public-header header'); return { top: section.getBoundingClientRect().top, header: header.getBoundingClientRect().bottom, overflow: document.documentElement.scrollWidth > innerWidth }; })()`,
  );
  assert.ok(bounds.top >= bounds.header - 2, 'Anchor covered by fixed header: ' + label);
  assert.equal(bounds.overflow, false);
}
function htmlText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

try {
  const [profile, services, socials, settings, projects] = await Promise.all([
    publicRead('/profile'),
    publicRead('/services?limit=100'),
    publicRead('/social-links?limit=100'),
    publicRead('/site-settings'),
    publicRead('/projects?limit=100'),
  ]);
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  const setting = settings.find((item) => item.key === 'contact_enabled');
  const enabled = !setting || setting.value === true;
  const expected = [
    name,
    profile.biography,
    ...services.items.map((service) => service.name),
  ].filter(Boolean);
  for (const host of [origin]) {
    const html = await (await fetch(host + '/')).text();
    for (const value of expected)
      assert.ok(html.includes(htmlText(value)), 'Development SSR omitted public content');
    assert.ok(
      html.includes('id="studio"') &&
        html.includes('id="services"') &&
        html.includes('id="contact"'),
    );
    assert.ok(
      !html.includes('Temporary visual foundation') && !html.includes('Foundation preview'),
    );
  }
  production = spawn(process.execPath, ['dist/architecture-portfolio/server/server.mjs'], {
    env: { ...process.env, PORT: '4304', API_BASE_URL: base },
    stdio: 'ignore',
    windowsHide: true,
  });
  let productionHtml;
  for (let index = 0; index < 60; index++) {
    try {
      const response = await fetch('http://localhost:4304/', { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        assert.equal(response.headers.get('cache-control'), 'no-store');
        productionHtml = await response.text();
        break;
      }
    } catch {
      await delay(200);
    }
  }
  assert.ok(productionHtml, 'Production SSR did not start');
  for (const value of expected)
    assert.ok(productionHtml.includes(htmlText(value)), 'Production SSR omitted public content');
  console.log('Public profile/services/settings SSR: development and production OK');
  browser = spawn(
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + fileURLToPath(profileDir),
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  let port;
  for (let index = 0; index < 100; index++) {
    try {
      port = Number(
        (await readFile(new URL('DevToolsActivePort', profileDir), 'utf8')).split('\n')[0],
      );
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port);
  const targets = await (await fetch('http://localhost:' + port + '/json')).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (task) {
        pending.delete(message.id);
        clearTimeout(task.timer);
        message.error ? task.reject(new Error('CDP failed')) : task.resolve(message.result);
      }
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') issues.push('Runtime exception');
    if (
      message.method === 'Runtime.consoleAPICalled' &&
      JSON.stringify(message.params).match(/NG05\d\d/)
    )
      issues.push('Hydration mismatch');
    if (message.method === 'Network.requestWillBeSent') {
      const request = message.params.request;
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        if (!url.pathname.startsWith('/api/v1/public/'))
          issues.push('Non-public browser API request');
        if (Object.keys(request.headers).some((key) => key.toLowerCase() === 'authorization'))
          issues.push('Public Authorization');
        requests.push(url.pathname + url.search);
        if (request.method === 'POST' && url.pathname.endsWith('/public/contact')) contactPosts++;
      }
    }
    if (
      message.method === 'Network.requestWillBeSentExtraInfo' &&
      Object.keys(message.params.headers).some((key) => key.toLowerCase() === 'authorization')
    )
      issues.push('Authorization in browser network');
    if (
      message.method === 'Network.responseReceived' &&
      message.params.response.status === 200 &&
      new URL(message.params.response.url).hostname.endsWith('.r2.cloudflarestorage.com')
    )
      r2Reads++;
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 950,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    requests.length = 0;
    await send('Page.navigate', { url: origin + '/' });
    await until(
      "!!document.querySelector('app-studio-section') && !document.querySelector('#contact [role=status]')?.textContent.includes('Checking') && !!globalThis.ng?.getComponent(document.querySelector('app-public-header'))",
    );
    await delay(500);
    assert.equal(await evaluate('sessionStorage.length'), 0);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await evaluate(
        "document.querySelector('#studio h2').textContent.includes(" + JSON.stringify(name) + ')',
      ),
      true,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('#services article').length"),
      services.items.length,
    );
    assert.equal(await evaluate("!!document.querySelector('#contact form')"), enabled);
    for (const path of ['/profile', '/services', '/social-links', '/site-settings'])
      assert.ok(
        requests.filter((request) => request.startsWith('/api/v1/public' + path)).length <= 1,
        'Duplicate hydration request: ' + path,
      );
    for (const label of ['Studio', 'Services', 'Contact']) {
      await anchor(label);
      await screenshot(label.toLowerCase() + '-' + width);
    }
  }
  if (enabled && !process.argv.includes('--no-contact')) {
    await evaluate("document.querySelector('#contact form').requestSubmit()");
    assert.equal(contactPosts, 0, 'Invalid empty form submitted');
    const fields = {
      name: 'Synthetic Phase 12 smoke',
      email: 'phase12-smoke@example.com',
      phone: '',
      subject: marker,
      message: 'Synthetic integration test. Please archive; no response is needed.',
    };
    for (const [key, value] of Object.entries(fields))
      await evaluate(
        `(() => { const input = document.getElementById(${JSON.stringify('contact-' + key)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
      );
    submitted = true;
    await evaluate(
      "(() => { const form = document.querySelector('#contact form'); form.requestSubmit(); form.requestSubmit(); })()",
    );
    await until("!!document.querySelector('#contact-form .receipt')");
    receiptObserved = true;
    assert.equal(contactPosts, 1, 'Duplicate contact submission');
    assert.equal(
      await evaluate(
        "document.querySelector('#contact-form .receipt').textContent.includes('Message received')",
      ),
      true,
    );
    await screenshot('receipt');
    console.log('Real public contact: one message received, invalid/double submission prevented');
  } else
    console.log(
      enabled
        ? 'Contact submission skipped: read-only verification; no synthetic message created'
        : 'Real contact disabled: no form or form action; no synthetic message created',
    );
  // Cross-route anchors and real project destinations remain functional.
  await send('Page.navigate', { url: origin + '/projects' });
  await until("!!document.querySelector('app-public-projects-page')");
  await anchor('Studio');
  if (projects.items.length) {
    await send('Page.navigate', {
      url: origin + '/projects/' + encodeURIComponent(projects.items[0].slug),
    });
    await until("!!document.querySelector('app-project-detail article')");
    await anchor('Contact');
  }
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), true);
  // Browser-only variants exercise optional content without writing owner records.
  const visualProfile = {
    ...profile,
    first_name: 'Studio',
    last_name: 'Fixture',
    professional_title: 'Architecture & design',
    short_bio: 'Synthetic browser layout fixture — not production content.',
    biography:
      'A longer architectural narrative to verify reading widths, editorial spacing and optional content.\n\n<script>globalThis.__contentXss=true</script>',
    email: 'studio@example.com',
    phone: '+51 123456789',
    location: 'Fixture location',
    profile_media: projects.items.find((project) => project.cover?.type === 'IMAGE')?.cover ?? null,
    cv_media: null,
  };
  const visualServices = Array.from({ length: 5 }, (_, index) => ({
    name: [
      'Architecture',
      'Interior Design',
      '3D Visualization',
      'Architectural Models',
      'Concept Design',
    ][index],
    slug: 'fixture-' + index,
    short_description: 'Synthetic service summary.',
    description:
      'Synthetic extended service narrative. This data exists only in the browser smoke.',
    icon: null,
  }));
  await evaluate(`(() => { const state = ng.getComponent(document.querySelector('app-public-header')).content;
    state.profile.value.set(${JSON.stringify(visualProfile)});
    state.services.value.set(${JSON.stringify(visualServices)});
    state.socials.value.set([{ platform: 'Social fixture', url: 'https://example.com', username: null }, { platform: 'Unsafe fixture', url: 'javascript:alert(1)', username: null }]);
    state.settings.value.set([{ key: 'contact_enabled', value: true }]);
  })()`);
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 950,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    for (const id of ['studio', 'services', 'contact']) {
      await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView()`);
      await delay(500);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      await screenshot('fixture-' + id + '-' + width);
    }
  }
  assert.equal(
    await evaluate(
      "document.querySelector('#studio').querySelector('script') === null && !globalThis.__contentXss",
    ),
    true,
  );
  assert.equal(await evaluate("document.querySelectorAll('#services details').length"), 5);
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('#contact a')).some(a => a.getAttribute('href').startsWith('javascript:'))",
    ),
    false,
  );
  await evaluate(
    "ng.getComponent(document.querySelector('app-public-header')).content.settings.value.set([{ key: 'contact_enabled', value: false }])",
  );
  await until("!document.querySelector('#contact form')");
  assert.equal(
    await evaluate(
      'document.querySelector(\'#contact a[href="#contact-form"]\') === null && !!document.querySelector(\'#contact a[href^="mailto:"]\')',
    ),
    true,
  );
  console.log(
    'Browser-only optional profile/services/socials, safe text and contact-disabled variants: OK (no owner writes)',
  );
  // Verify production hydration and content without development debug APIs.
  await send('Page.navigate', { url: 'http://localhost:4304/' });
  await until("!!document.querySelector('#studio h2')");
  await delay(1200);
  assert.equal(
    await evaluate(
      "document.querySelector('#studio h2').textContent.includes(" + JSON.stringify(name) + ')',
    ),
    true,
  );
  await anchor('Studio');
  assert.deepEqual(issues, []);
  if (profile.profile_media || projects.items.some((project) => project.cover))
    assert.ok(r2Reads > 0, 'Expected a real public R2 image response');
  console.log(
    'Chrome: 375/768/1024/1440px, cross-route anchors, privacy, reduced motion, SSR/hydration and R2 reads OK',
  );
} finally {
  socket?.close();
  browser?.kill();
  production?.kill();
  for (const task of pending.values()) clearTimeout(task.timer);
  if (submitted) {
    let tokens;
    try {
      const credentials = JSON.parse(
        await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
      );
      const login = await fetch(base + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      assert.ok(login.ok, 'Cleanup login failed');
      tokens = await login.json();
      const headers = {
        Authorization: 'Bearer ' + tokens.access_token,
        'Content-Type': 'application/json',
      };
      const found = await fetch(
        base + '/admin/contact-messages?limit=100&q=' + encodeURIComponent(marker),
        { headers },
      );
      assert.ok(found.ok);
      const page = await found.json();
      for (const item of page.items) {
        assert.equal(item.subject, marker, 'Cleanup must only touch the exact synthetic message');
        const archived = await fetch(base + '/admin/contact-messages/' + item.id + '/status', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'ARCHIVED' }),
        });
        assert.ok(archived.ok);
        assert.equal((await archived.json()).status, 'ARCHIVED');
      }
      if (receiptObserved)
        assert.equal(page.items.length, 1, 'Synthetic contact receipt missing in PostgreSQL');
      await writeFile(
        new URL('../.tools/' + marker + '.json', import.meta.url),
        JSON.stringify(
          { marker, ids: page.items.map((item) => item.id), status: 'ARCHIVED' },
          null,
          2,
        ),
      );
      console.log(
        'Cleanup: one synthetic message ARCHIVED through API; no DELETE exists; owner content untouched',
      );
    } catch {
      process.exitCode = 1;
      console.error('Synthetic contact terminal-state cleanup requires local inspection');
    } finally {
      if (tokens)
        await fetch(base + '/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: tokens.refresh_token }),
        });
    }
  }
}
