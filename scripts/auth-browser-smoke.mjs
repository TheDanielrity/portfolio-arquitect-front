// Repeatable development-only browser smoke using Chrome DevTools Protocol.
// No test framework, auth dependency, credentials or tokens in console output.
import assert from 'node:assert/strict';
import { auditAdminVisuals } from './admin-visual-audit.mjs';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.env['AUTH_SMOKE_FRONTEND_URL'] ?? 'http://localhost:4200';
const browserPath =
  process.env['AUTH_SMOKE_BROWSER_PATH'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const credentials = JSON.parse(
  await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
);
const profile = new URL('../.tools/auth-browser-profile-' + Date.now() + '/', import.meta.url);
await mkdir(profile, { recursive: true });
const { fileURLToPath } = await import('node:url');
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--user-data-dir=' + fileURLToPath(profile),
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);
let socket;
let sequence = 0;
const pending = new Map();
let refreshCount = 0;
let meCount = 0;
let domainRequests = 0;
let runtimeErrors = 0;
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
  });
  assert.ok(!result.exceptionDetails, 'Browser evaluation failed');
  return result.result.value;
}
async function press(key, windowsVirtualKeyCode) {
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', {
      type,
      key,
      code: key,
      text: type === 'keyDown' && key === 'Enter' ? '\r' : undefined,
      windowsVirtualKeyCode,
    });
}
async function until(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(
    'Browser condition timed out: ' +
      expression +
      ' / ' +
      JSON.stringify(
        await evaluate(
          "({path:location.pathname,width:innerWidth,dialogs:Array.from(document.querySelectorAll('dialog')).map(d=>d.open),menu:document.querySelector('.menu-button')?.getAttribute('aria-expanded')})",
        ),
      ),
  );
}
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number(
        (await readFile(new URL('DevToolsActivePort', profile), 'utf8')).split('\n')[0],
      );
      break;
    } catch (error) {
      await delay(100);
    }
  }
  assert.ok(port, 'Headless browser did not start');
  const targets = await (await fetch('http://localhost:' + port + '/json')).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') {
      const path = new URL(message.params.request.url).pathname;
      if (
        (path.startsWith('/api/v1/admin/') || path.startsWith('/api/v1/public/')) &&
        ![
          '/api/v1/admin/media',
          '/api/v1/admin/projects',
          '/api/v1/admin/categories',
          '/api/v1/admin/tags',
          ...(message.params.request.method === 'GET'
            ? [
                '/api/v1/admin/profile',
                '/api/v1/admin/services',
                '/api/v1/admin/site-settings',
                '/api/v1/admin/contact-messages',
              ]
            : []),
        ].some((prefix) => path === prefix || path.startsWith(prefix + '/'))
      )
        domainRequests++;
      if (path.includes('/sections')) domainRequests++;
      if (path.endsWith('/auth/me') && message.params.request.method === 'GET') meCount++;
    }
    if (message.id) {
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) call.reject(new Error('CDP command failed'));
      else call.resolve(message.result);
    } else if (
      message.method === 'Network.requestWillBeSent' &&
      message.params.request.method === 'POST' &&
      new URL(message.params.request.url).pathname.endsWith('/auth/refresh')
    )
      refreshCount++;
    else if (message.method === 'Runtime.exceptionThrown') runtimeErrors++;
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: origin + '/admin' });
  await until("location.pathname === '/admin/login' && !!document.querySelector('form')");
  console.log('Browser protected navigation: OK');
  assert.deepEqual(await evaluate('(' + auditAdminVisuals.toString() + ')()'), []);
  for (const [label, width, height] of [
    ['desktop', 1440, 900],
    ['tablet', 768, 1024],
    ['mobile', 390, 844],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      'Responsive overflow',
    );
    assert.equal(
      await evaluate(
        "!!document.querySelector('label[for=email]') && !!document.querySelector('label[for=password]')",
      ),
      true,
    );
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      new URL('../.tools/auth-login-' + label + '.png', import.meta.url),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  console.log('Browser desktop/tablet/mobile login: OK');
  // Input events exercise Angular Reactive Forms rather than assigning component state.
  await evaluate(`(() => {
    const email = document.querySelector('#email');
    const password = document.querySelector('#password');
    email.value = ${JSON.stringify(credentials.email)};
    password.value = ${JSON.stringify(credentials.password)};
    email.dispatchEvent(new Event('input', {bubbles:true}));
    password.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
  })()`);
  await until("location.pathname === '/admin' && !!document.querySelector('app-admin-dashboard')");
  console.log('Browser real login and /me: OK');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const meBeforeNavigation = meCount;
  for (const [route, label] of [
    ['/admin', 'Resumen'],
    ['/admin/projects', 'Proyectos'],
    ['/admin/profile', 'Perfil'],
    ['/admin/services', 'Servicios'],
    ['/admin/settings', 'Configuración'],
  ]) {
    await evaluate(
      "Array.from(document.querySelectorAll('.desktop-sidebar ul a')).find(link => link.pathname === " +
        JSON.stringify(route) +
        ').click()',
    );
    await until(
      'location.pathname === ' +
        JSON.stringify(route) +
        " && document.querySelector('main h1')?.textContent === " +
        JSON.stringify(label),
    );
    // Profile's separately loaded social links can still be busy after its heading appears.
    await until(
      "(()=>{const node=document.querySelector('app-profile-page');if(!node)return true;const p=ng.getComponent(node);return p.state()!=='loading' && !p.social()?.busy();})()",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.desktop-sidebar [aria-current=page]').length"),
      1,
    );
    assert.equal(await evaluate('document.title'), label + ' — Portfolio Admin');
    assert.deepEqual(
      await evaluate('(' + auditAdminVisuals.toString() + ')()'),
      [],
      'Administrative contrast and button borders: ' + route,
    );
    assert.equal(await evaluate("document.activeElement.id === 'admin-main'"), true);
  }
  assert.equal(meCount, meBeforeNavigation, 'Navigation must not repeat /me');
  assert.equal(
    await evaluate(
      "!!document.querySelector('.user-name')?.textContent.trim() && !!document.querySelector('.user-email')?.textContent.trim()",
    ),
    true,
  );
  console.log(
    'Browser administrative routes / contrast / solid black borders / active states / titles: OK',
  );

  await evaluate("document.querySelector('.skip-link').focus()");
  assert.equal(
    await evaluate("document.querySelector('.skip-link').getBoundingClientRect().top >= 0"),
    true,
  );
  await press('Enter', 13);
  assert.equal(
    await evaluate(
      "document.activeElement.id === 'admin-main' && location.pathname === '/admin/settings'",
    ),
    true,
  );
  console.log('Browser keyboard skip link: OK');

  await evaluate("document.querySelector('main').blur()");
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await until(
      "getComputedStyle(document.querySelector('.menu-button')).display " +
        (width >= 1024 ? '===' : '!==') +
        " 'none'",
    );
    assert.equal(
      await evaluate(
        "document.documentElement.scrollWidth <= innerWidth && document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth && document.querySelector('header').scrollWidth <= document.querySelector('header').clientWidth",
      ),
      true,
      'Shell overflow',
    );
    if (width >= 1024)
      assert.equal(
        await evaluate(
          "document.querySelector('main').getBoundingClientRect().left >= document.querySelector('.desktop-sidebar').getBoundingClientRect().right",
        ),
        true,
        'Content under sidebar',
      );
    await evaluate("document.querySelector('.user-details').style.visibility = 'hidden'");
    const capture = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      new URL('../.tools/admin-shell-' + width + '.png', import.meta.url),
      Buffer.from(capture.data, 'base64'),
    );
    await evaluate("document.querySelector('.user-details').style.visibility = ''");
  }
  console.log('Browser shell 375 / 768 / 1024 / 1440: OK');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until("getComputedStyle(document.querySelector('.menu-button')).display !== 'none'");
  await evaluate("document.querySelector('.menu-button').focus()");
  await press('Enter', 13);
  await until(
    "document.querySelector('dialog').open && document.querySelector('.menu-button').getAttribute('aria-expanded') === 'true'",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog').matches(':modal') && document.querySelector('dialog').contains(document.activeElement)",
    ),
    true,
  );
  for (let step = 0; step < 12; step++) {
    await press('Tab', 9);
    // Native dialogs allow Tab into browser chrome (BODY), then back into the modal.
    if (await evaluate('document.activeElement === document.body')) await press('Tab', 9);
    assert.equal(
      await evaluate("document.querySelector('dialog').contains(document.activeElement)"),
      true,
      'Modal Tab trap',
    );
  }
  await evaluate("document.querySelector('.logout-button').focus()");
  assert.equal(
    await evaluate("document.querySelector('dialog').contains(document.activeElement)"),
    true,
    'Inert background',
  );
  await press('Escape', 27);
  await until("!document.querySelector('dialog').open");
  assert.equal(
    await evaluate("document.activeElement === document.querySelector('.menu-button')"),
    true,
  );
  console.log('Browser mobile keyboard / focus trap / Escape / inert background: OK');

  await evaluate("document.querySelector('.menu-button').click()");
  await until("document.querySelector('dialog').open");
  await evaluate('document.querySelector(\'dialog ul a[href="/admin/profile"]\').click()');
  await until("location.pathname === '/admin/profile' && !document.querySelector('dialog').open");
  await until(
    "(()=>{const p=ng.getComponent(document.querySelector('app-profile-page'));return p.state()!=='loading' && !p.social()?.busy();})()",
  );
  assert.equal(await evaluate("document.activeElement.id === 'admin-main'"), true);
  await evaluate("document.querySelector('.menu-button').click()");
  await until("document.querySelector('dialog').open");
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1024,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until("!document.querySelector('dialog').open");
  assert.equal(await evaluate("document.activeElement.id === 'admin-main'"), true);
  console.log('Browser mobile navigation close / desktop resize: OK');
  await evaluate("document.querySelectorAll('.desktop-sidebar ul a')[1].click()");
  await until(
    "location.pathname === '/admin/projects' && document.querySelector('main h1')?.textContent === 'Proyectos'",
  );

  const beforeRefresh = refreshCount;
  const concurrent = await evaluate(`(async () => {
    const auth = ng.getComponent(document.querySelector('app-admin-layout')).auth;
    auth.session.save({ access_token: 'deliberately-invalid-development-access', refresh_token: auth.session.refreshToken, expires_in: 0 });
    const results = await Promise.all([0,1,2].map(() => new Promise(resolve => auth.api.me().subscribe({next: () => resolve(true), error: () => resolve(false)}))));
    return results.every(Boolean) && auth.status() === 'authenticated';
  })()`);
  assert.equal(concurrent, true, 'Concurrent protected requests failed');
  assert.equal(refreshCount - beforeRefresh, 1, 'Exactly one real refresh required');
  console.log('Browser THREE real 401 requests / ONE refresh / THREE successful retries: OK');
  const meBeforeReload = meCount;
  await evaluate('globalThis.__authSmokeReloading = true');
  await send('Page.reload');
  await until(
    "!globalThis.__authSmokeReloading && location.pathname === '/admin/projects' && !!document.querySelector('app-project-list') && ng.getComponent(document.querySelector('app-admin-layout')).auth.router.navigated && !ng.getComponent(document.querySelector('app-admin-layout')).auth.router.currentNavigation()",
  );
  assert.equal(meCount, meBeforeReload + 1, 'One /me on child reload');
  console.log('Browser child-route reload and session restoration: OK');
  await evaluate("document.querySelector('.logout-button').click()");
  await until("location.pathname === '/admin/login' && !!document.querySelector('form')");
  console.log('Browser logout reached login: OK');
  assert.equal(
    await evaluate("sessionStorage.getItem('portfolio.admin.refresh.v1') === null"),
    true,
  );
  await send('Page.navigate', { url: origin + '/admin' });
  await until("location.pathname === '/admin/login' && !!document.querySelector('form')");
  console.log('Browser logout and protected re-entry: OK');
  assert.equal(domainRequests, 0, 'No unrelated domain HTTP calls allowed');
  assert.equal(runtimeErrors, 0, 'Browser runtime exceptions');
} catch (error) {
  console.error(
    'Browser auth smoke failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await evaluate(
      "(async () => { const auth = globalThis.ng?.getComponent(document.querySelector('app-admin-layout'))?.auth; if (auth?.status() === 'authenticated') await new Promise(resolve => auth.logout().subscribe({next:resolve,error:resolve,complete:resolve})); })()",
    ).catch(() => {});
  }
  for (const call of pending.values()) clearTimeout(call.timer);
  socket?.close();
  browser.kill();
}
