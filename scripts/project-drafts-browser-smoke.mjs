// Browser interaction/visual smoke with intercepted API fixtures; no backend records are written.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.env.AUTH_SMOKE_FRONTEND_URL ?? 'http://localhost:4200';
const profile = new URL('../.tools/project-drafts-profile-' + Date.now() + '/', import.meta.url);
await mkdir(profile, { recursive: true });
const browser = spawn(
  process.env.AUTH_SMOKE_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + fileURLToPath(profile),
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);
const projectId = '11111111-1111-4111-8111-111111111111';
const now = '2026-10-12T00:00:00Z';
const project = {
  id: projectId,
  title: 'Casa Patio / Prueba de interfaz',
  slug: 'casa-patio-ui',
  status: 'DRAFT',
  visibility: 'PRIVATE',
  published_at: null,
  created_at: now,
  updated_at: now,
};
const attributes = [],
  sections = [],
  writes = [],
  errors = [],
  pending = new Map();
let socket,
  sequence = 0;
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 20000);
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
  assert.ok(!result.exceptionDetails, 'Browser evaluation failed: ' + expression);
  return result.result.value;
}
async function until(expression) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error('Browser condition timed out: ' + expression);
}
async function click(text, scope = 'main') {
  const result = await evaluate(
    `(() => { const button = [...document.querySelectorAll(${JSON.stringify(scope)} + ' button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`,
  );
  assert.ok(result, 'Missing or disabled button: ' + text);
}
async function fill(selector, value) {
  await evaluate(
    `(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    new URL('../.tools/project-drafts-' + name + '.png', import.meta.url),
    Buffer.from(shot.data, 'base64'),
  );
}
function respond(request) {
  const { pathname } = new URL(request.url);
  const path = pathname.replace(/^\/api\/v1/, '');
  const method = request.method;
  const body = request.postData ? JSON.parse(request.postData) : {};
  const page = (items) => ({ items, total: items.length, offset: 0, limit: 100 });
  if (path === '/auth/refresh')
    return {
      access_token: 'browser-fixture-only',
      refresh_token: 'd'.repeat(64),
      token_type: 'bearer',
    };
  if (path === '/auth/me')
    return {
      id: 'fixture-admin',
      email: 'fixture@portfolio.test',
      first_name: 'Prueba',
      last_name: 'de interfaz',
      is_active: true,
    };
  if (path === '/admin/site-settings/site_title')
    return { key: 'site_title', value: 'Estudio Patio', updated_at: now };
  if (path === '/admin/projects/' + projectId && method === 'GET') return project;
  if (path === '/admin/projects/' + projectId && method === 'PATCH') {
    writes.push({ path, body });
    Object.assign(project, body);
    return project;
  }
  if (path === '/admin/projects') return page([project]);
  if (path.endsWith('/attributes')) {
    if (method === 'POST') {
      const item = {
        ...body,
        id: 'real-attribute',
        project_id: projectId,
        created_at: now,
        updated_at: now,
      };
      writes.push({ path, body });
      attributes.push(item);
      return item;
    }
    return page(attributes);
  }
  if (path.endsWith('/sections')) {
    if (method === 'POST') {
      const item = {
        ...body,
        id: 'real-section',
        project_id: projectId,
        title: body.title ?? null,
        created_at: now,
        updated_at: now,
      };
      writes.push({ path, body });
      sections.push(item);
      return item;
    }
    return page(sections);
  }
  if (
    ['/categories', '/tags', '/media', '/contact-messages'].some((suffix) => path.endsWith(suffix))
  )
    return page([]);
  throw new Error('Unexpected intercepted API: ' + method + ' ' + path);
}

try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number(
        (await readFile(new URL('DevToolsActivePort', profile), 'utf8')).split('\n')[0],
      );
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port, 'Chrome did not start');
  const targets = await (await fetch('http://localhost:' + port + '/json')).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiting = pending.get(message.id);
      if (waiting) {
        clearTimeout(waiting.timer);
        pending.delete(message.id);
        message.error ? waiting.reject(new Error('CDP failure')) : waiting.resolve(message.result);
      }
    } else if (message.method === 'Runtime.exceptionThrown') errors.push('Runtime exception');
    else if (message.method === 'Fetch.requestPaused') {
      let body;
      try {
        body = respond(message.params.request);
      } catch (error) {
        errors.push(error.message);
        body = { detail: error.message };
      }
      void send('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api/v1/*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "sessionStorage.setItem('portfolio.admin.refresh.v1', 'd'.repeat(64))",
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: origin + '/admin/projects/' + projectId + '/edit' });
  await until(
    "!!document.querySelector('app-project-attributes') && !document.querySelector('#project-save')",
  );
  await click('Portada');
  assert.ok(
    await evaluate(
      "!!document.querySelector('#project-cover-files') && !document.querySelector('.media-groups')",
    ),
  );
  await screenshot('cover-tab');
  await click('Fotografías');
  assert.ok(
    await evaluate(
      "!!document.querySelector('#project-gallery-files') && !document.querySelector('.media-groups') && !document.querySelector('.cover-placeholder')",
    ),
  );
  await screenshot('photographs-tab');
  await click('Datos del proyecto');
  await click('+ Agregar característica');
  await until("!!document.querySelector('app-project-edit-modal dialog:modal')");
  await fill('#attribute-label', 'Material principal');
  await fill('#attribute-value', 'Hormigón visto');
  for (const width of [1440, 1024, 768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    assert.ok(
      await evaluate(
        "(() => { const d = document.querySelector('dialog:modal'), r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth + 1; })()",
      ),
      'Modal overflows at width ' + width,
    );
    await screenshot('modal-' + width);
  }
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  assert.ok(
    await evaluate("document.querySelector('dialog:modal').contains(document.activeElement)"),
    'Focus left the modal',
  );
  await click('Aceptar', 'app-project-edit-modal');
  await until(
    "!document.querySelector('app-project-edit-modal') && !!document.querySelector('#project-save')",
  );
  assert.equal(writes.length, 0, 'Accept persisted changes before final save');
  assert.ok(
    await evaluate(
      "document.querySelector('app-project-attributes').textContent.includes('Hormigón visto')",
    ),
  );
  await screenshot('preview-mobile');
  await click('+ Agregar característica');
  await until("!!document.querySelector('dialog:modal')");
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await until("!document.querySelector('dialog:modal')");
  assert.ok(
    await evaluate("document.activeElement.textContent.includes('Agregar característica')"),
    'Trigger focus was not restored',
  );
  await click('Presentación del proyecto');
  await fill('app-project-sections select', 'QUOTE');
  await click('Agregar sección');
  await until("!!document.querySelector('app-section-editor textarea')");
  await fill('app-section-editor textarea', 'La luz define el espacio.');
  await click('Aceptar', 'app-project-edit-modal');
  await until("!!document.querySelector('app-section-preview blockquote')");
  assert.equal(writes.length, 0);
  await screenshot('section-preview-mobile');
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    const layout = await evaluate(`(() => {
      const content = document.querySelector('.editor-content');
      const spacer = document.createElement('div');
      spacer.style.height = '2000px';
      content.append(spacer);
      const bar = document.querySelector('.save-bar');
      const before = bar.getBoundingClientRect();
      content.scrollTop = 600;
      const after = bar.getBoundingClientRect();
      const viewport = content.getBoundingClientRect();
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const result = { before: before.top, after: after.top, bottom: after.bottom,
        contentTop: viewport.top, headerBottom: header.bottom, scroll: content.scrollTop,
        overflow: document.documentElement.scrollWidth > window.innerWidth };
      spacer.remove();
      content.scrollTop = 0;
      return result;
    })()`);
    assert.ok(layout.scroll > 0, `Editor does not scroll at ${width}px`);
    assert.ok(Math.abs(layout.before - layout.after) < 1, `Save bar moved at ${width}px`);
    assert.ok(layout.bottom <= layout.contentTop + 1, `Save bar overlaps editor at ${width}px`);
    assert.ok(layout.after >= layout.headerBottom - 1, `Save bar overlaps header at ${width}px`);
    assert.equal(layout.overflow, false);
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('Guardar cambios');
  await until("!document.querySelector('#project-save')");
  assert.equal(writes.length, 3);
  assert.equal(attributes.length, 1);
  assert.equal(sections.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    'Project drafts browser: modal / accept / cancel / preview / final save / keyboard / 390–1440px OK (intercepted API fixtures)',
  );
} finally {
  socket?.close();
  browser.kill();
  for (const waiting of pending.values()) clearTimeout(waiting.timer);
}
