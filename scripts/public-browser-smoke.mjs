import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const origin = process.env['PUBLIC_SMOKE_FRONTEND_URL'] ?? 'http://localhost:4200';
const profile = new URL('../.tools/public-browser-profile-' + Date.now() + '/', import.meta.url);
await mkdir(profile, { recursive: true });
const browser = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
let socket,
  sequence = 0,
  exceptions = 0,
  hydrationErrors = 0,
  apiRequests = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout')), 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!r.exceptionDetails, 'Browser evaluation failed');
  return r.result.value;
}
async function until(expression) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error('Browser condition timed out: ' + expression);
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
async function navigate() {
  await send('Page.navigate', { url: origin + '/' });
  await until(
    "!!document.querySelector('app-public-home') && !!globalThis.ng?.getComponent(document.querySelector('app-public-header'))",
  );
  await evaluate('document.fonts.ready');
  await until(
    "!document.querySelector('app-project-spotlight img') || document.querySelector('app-project-spotlight img').naturalWidth > 0",
  );
}
async function capture(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    new URL('../.tools/public-' + name + '.png', import.meta.url),
    Buffer.from(r.data, 'base64'),
  );
}
try {
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
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        clearTimeout(p.timer);
        m.error ? p.reject(new Error('CDP command failed')) : p.resolve(m.result);
      }
    } else if (m.method === 'Runtime.exceptionThrown') exceptions++;
    else if (m.method === 'Runtime.consoleAPICalled' && JSON.stringify(m.params).match(/NG05\d\d/))
      hydrationErrors++;
    else if (
      m.method === 'Network.requestWillBeSent' &&
      new URL(m.params.request.url).pathname.startsWith('/api/') &&
      !new URL(m.params.request.url).pathname.startsWith('/api/v1/public/')
    )
      apiRequests++;
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ssr = await (await fetch(origin + '/')).text();
  assert.ok(
    ssr.includes('public-hero') &&
      ssr.includes('public-hero-heading') &&
      ssr.includes('app-public-footer'),
  );
  assert.ok(!/class="[^"]*reveal-pending/.test(ssr));
  for (const width of [1440, 1024, 768, 375]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width === 375 ? 812 : 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate();
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      'Horizontal overflow at ' + width,
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('app-public-layout')).fontFamily.includes('Century Gothic')",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('app-public-header header').classList.contains('solid')",
      ),
      false,
    );
    await capture('home-' + width);
    await evaluate("document.querySelector('.skip-link').focus()");
    await press('Enter', 13);
    assert.equal(await evaluate("document.activeElement.id==='public-main'"), true);
    await evaluate('scrollTo(0,650)');
    await until("document.querySelector('app-public-header header').classList.contains('solid')");
    await delay(550);
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('app-public-header header')).backgroundColor",
      ),
      'rgb(248, 248, 245)',
    );
    await evaluate('scrollTo(0,document.body.scrollHeight)');
    await delay(1100);
    await capture('footer-' + width);
    if (width < 1024) {
      await evaluate("document.querySelector('.menu-trigger').focus()");
      await press('Enter', 13);
      await until("document.querySelector('dialog').open");
      assert.equal(
        await evaluate(
          "document.querySelector('dialog').matches(':modal') && document.body.style.overflow==='hidden'",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "Math.round(document.querySelector('dialog').getBoundingClientRect().width)===innerWidth",
        ),
        true,
      );
      await delay(350);
      await capture('menu-' + width);
      for (let i = 0; i < 8; i++) {
        await press('Tab', 9);
        assert.equal(
          await evaluate(
            "document.activeElement===document.body || !!document.activeElement.closest('dialog')",
          ),
          true,
          'Native focus containment',
        );
      }
      await press('Escape', 27);
      await until("!document.querySelector('dialog').open");
      assert.equal(
        await evaluate("document.activeElement.classList.contains('menu-trigger')"),
        true,
      );
      await evaluate("document.querySelector('.menu-trigger').click()");
      await until("document.querySelector('dialog').open");
      await evaluate("document.querySelector('dialog a').click()");
      await until("!document.querySelector('dialog').open");
      assert.equal(await evaluate('location.hash'), '#projects');
    }
    console.log('Public responsive/keyboard ' + width + 'px: OK');
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate();
  await evaluate(
    "document.body.style.overflow='clip';document.querySelector('.menu-trigger').click()",
  );
  await until("document.querySelector('dialog').open");
  await press('Escape', 27);
  await until("!document.querySelector('dialog').open");
  assert.equal(await evaluate('document.body.style.overflow'), 'clip');
  await evaluate("document.body.style.overflow=''");
  await evaluate("document.querySelector('.menu-trigger').click()");
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1024,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until("!document.querySelector('dialog').open");
  assert.equal(await evaluate("document.activeElement.classList.contains('public-brand')"), true);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await navigate();
  assert.equal(await evaluate("document.querySelectorAll('.reveal-pending').length"), 0);
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('app-public-header header')).transitionDuration",
    ),
    '0s',
  );
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: origin + '/' });
  await delay(1000);
  assert.equal(
    await evaluate(
      "!!document.querySelector('main h1') && Array.from(document.querySelectorAll('.public-reveal')).every(e=>getComputedStyle(e).opacity==='1')",
    ),
    true,
  );
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  await navigate();
  assert.equal(apiRequests, 0, 'Public pages must not consume private/auth APIs');
  assert.equal(exceptions, 0, 'Runtime exceptions');
  assert.equal(hydrationErrors, 0, 'Hydration errors');
  console.log(
    'SSR, hydration, no-JS content, reduced motion, focus restoration, resize and only public API calls: OK',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  socket?.close();
  browser.kill();
}
