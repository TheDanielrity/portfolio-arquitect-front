// Chrome UI test with intercepted API fixtures. Does not write backend records.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.env.AUTH_SMOKE_FRONTEND_URL ?? 'http://localhost:4200';
const output = new URL('../.tools/photo-picker-' + Date.now() + '/', import.meta.url);
await mkdir(output, { recursive: true });
const jpeg = await readFile(new URL('../public/images/foundation-study.jpg', import.meta.url));
const id = '11111111-1111-4111-8111-111111111111';
const project = {
  id,
  title: 'Proyecto de prueba de fotografías',
  slug: 'photo-picker-fixture',
  status: 'DRAFT',
  visibility: 'PRIVATE',
};
const section = {
  id: 'gallery',
  project_id: id,
  section_type: 'GALLERY',
  title: 'Fotografías',
  content: null,
  sort_order: 0,
  is_visible: true,
};
const asset = {
  id: 'photo',
  type: 'IMAGE',
  original_filename: 'maqueta.jpg',
  title: 'Maqueta del proyecto',
  storage_provider: 'r2',
  storage_key: 'private',
  url: origin + '/api/v1/public/media/photo/content',
  thumbnail_url: null,
  mime_type: 'image/jpeg',
  file_size: jpeg.length,
  width: 2400,
  height: 1500,
  alt_text: 'Estudio de arquitectura',
  metadata: null,
};
const errors = [],
  pending = new Map();
let socket,
  sequence = 0;
const browser = spawn(
  process.env.AUTH_SMOKE_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + fileURLToPath(output),
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);
function send(method, params = {}) {
  const requestId = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('CDP timeout: ' + method));
    }, 20000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert.ok(!result.exceptionDetails, 'Browser evaluation failed');
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression).catch(() => false)) return;
    await delay(100);
  }
  throw new Error('Timed out: ' + expression);
}
function fulfill(params) {
  void send('Fetch.fulfillRequest', params).catch((error) => {
    // Navigation can cancel a paused request before its fixture is delivered.
    if (!error.message.includes('Invalid InterceptionId')) errors.push(error.message);
  });
}
function response(request) {
  const path = new URL(request.url).pathname.replace('/api/v1', '');
  const page = (items) => ({ items, total: items.length, limit: 100, offset: 0 });
  if (path === '/auth/refresh')
    return { access_token: 'fixture-access', refresh_token: 'd'.repeat(64), token_type: 'bearer' };
  if (path === '/auth/me')
    return {
      id: 'fixture',
      email: 'fixture@portfolio.test',
      first_name: 'Prueba',
      last_name: 'UI',
      is_active: true,
    };
  if (request.method !== 'GET') throw new Error('Unexpected write in read-only fixture');
  if (path === '/admin/site-settings/site_title') return { key: 'site_title', value: 'Estudio' };
  if (path === '/admin/projects/' + id) return project;
  if (path === '/admin/projects/' + id + '/sections') return page([section]);
  if (path === '/admin/projects/' + id + '/sections/gallery') return section;
  if (path === '/admin/projects/' + id + '/sections/gallery/media') return page([]);
  if (path === '/admin/projects/' + id + '/media')
    return page([{ id: 'link', media_id: 'photo', role: 'GALLERY', sort_order: 0 }]);
  if (path === '/admin/media/photo') return asset;
  if (['/attributes', '/categories', '/tags'].some((s) => path.endsWith(s))) return page([]);
  throw new Error('Unexpected fixture request: ' + path);
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number((await readFile(new URL('DevToolsActivePort', output), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port);
  const targets = await (await fetch(`http://localhost:${port}/json`)).json();
  socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const call = pending.get(message.id);
      if (!call) return;
      clearTimeout(call.timer);
      pending.delete(message.id);
      if (message.error) call.reject(new Error('CDP request failed: ' + message.error.message));
      else call.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push('Runtime exception');
    else if (message.method === 'Fetch.requestPaused') {
      const request = message.params.request;
      if (new URL(request.url).pathname === '/api/v1/admin/media/photo/content') {
        fulfill({
          requestId: message.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'image/jpeg' }],
          body: jpeg.toString('base64'),
        });
      } else {
        let body;
        try {
          body = response(request);
        } catch (error) {
          errors.push(error.message);
          body = { detail: 'Fixture not configured' };
        }
        fulfill({
          requestId: message.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(body)).toString('base64'),
        });
      }
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api/v1/*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "sessionStorage.setItem('portfolio.admin.refresh.v1','d'.repeat(64))",
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: origin + '/admin/projects/' + id + '/edit' });
  await until(
    "!!globalThis.ng?.getComponent(document.querySelector('app-project-editor'))?.project()",
  );
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('sections')",
  );
  await until(
    "!!document.querySelector('app-project-sections .section-actions button') && !ng.getComponent(document.querySelector('app-project-sections')).busy()",
  );
  await evaluate("document.querySelector('app-project-sections .section-actions button').click()");
  await until(
    "!!document.querySelector('app-section-editor form') && ng.getComponent(document.querySelector('app-section-editor')).loaded()",
  );
  const open =
    "[...document.querySelectorAll('app-section-editor button')].find(b=>b.textContent.includes('Elegir fotografías del proyecto')).click()";
  await evaluate(
    "(()=>{const dt=new DataTransfer();dt.items.add(new File(['test'],'test.png',{type:'image/png'}));globalThis.photoDrag=dt;const zone=document.querySelector('app-section-editor .upload-dropzone');zone.scrollIntoView({block:'center'});zone.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:dt}))})()",
  );
  await until("!!document.querySelector('app-section-editor .upload-dropzone.drag-active')");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('app-section-editor .upload-dropzone')).borderTopColor",
    ),
    'rgb(0, 0, 0)',
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('app-section-editor .upload-dropzone')).outlineWidth",
    ),
    '3px',
  );
  const dragShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('gallery-drop-active.png', output), Buffer.from(dragShot.data, 'base64'));
  await evaluate(
    "document.querySelector('app-section-editor .upload-dropzone').dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:globalThis.photoDrag}))",
  );
  await until("!document.querySelector('app-section-editor .upload-dropzone.drag-active')");
  await evaluate(
    "(()=>{const dt=new DataTransfer();dt.items.add(new File(['invalid'],'invalid.obj'));document.querySelector('app-section-editor .upload-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))})()",
  );
  await until(
    "document.querySelector('app-section-editor .error')?.textContent.includes('Formato')",
  );
  assert.equal(
    await evaluate(
      "!!document.querySelector('app-section-editor input[formcontrolname=is_visible]')",
    ),
    false,
  );
  await evaluate(open);
  await until("document.querySelector('app-project-media-picker img')?.naturalWidth>0");
  assert.equal(
    await evaluate("!!document.querySelector('app-project-media-picker select')"),
    false,
  );
  assert.equal(
    await evaluate("!!document.querySelector('app-project-media-picker form button')"),
    false,
  );
  await evaluate(
    "(()=>{const input=document.querySelector('app-project-media-picker input');input.value='sin coincidencia';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await until(
    "document.querySelector('app-project-media-picker').textContent.includes('No hay fotografías')",
  );
  await evaluate(
    "(()=>{const input=document.querySelector('app-project-media-picker input');input.value='maqueta';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await until("document.querySelector('app-project-media-picker img')?.naturalWidth>0");
  assert.equal(
    await evaluate(
      "document.querySelector('app-project-media-picker').textContent.includes('Ver imagen')",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('app-project-media-picker').textContent.includes('Ver detalles y gestionar')",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('app-project-media-picker .close-picker').textContent.trim()",
    ),
    '×',
  );
  for (const width of [1440, 768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await delay(300);
    assert.equal(
      await evaluate(
        "(()=>{const d=document.querySelector('app-project-media-picker dialog');return d.scrollWidth<=d.clientWidth+1 && d.getBoundingClientRect().right<=innerWidth})()",
      ),
      true,
    );
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL('picker-' + width + '.png', output), Buffer.from(shot.data, 'base64'));
  }
  await evaluate("document.querySelector('app-project-media-picker img').click()");
  await until("!document.querySelector('app-project-media-picker')");
  await until("document.querySelector('app-section-editor .section-media img')?.naturalWidth>0");
  assert.equal(
    await evaluate(
      "document.querySelector('app-section-editor .section-media').textContent.includes('Ver imagen')",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-section-editor')).form.controls.media.at(0).controls.media_id.value",
    ),
    'photo',
  );
  await evaluate(open);
  await until("!!document.querySelector('app-project-media-picker .close-picker')");
  await evaluate("document.querySelector('app-project-media-picker .close-picker').click()");
  await until("!document.querySelector('app-project-media-picker')");
  await evaluate(
    "ng.getComponent(document.querySelector('app-section-editor')).form.controls.media.clear()",
  );
  await evaluate(open);
  await until("document.querySelector('app-project-media-picker img')?.naturalWidth>0");
  await evaluate("document.querySelector('app-project-media-picker .photo-option').focus()");
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', {
      type,
      key: 'Enter',
      code: 'Enter',
      text: type === 'keyDown' ? '\r' : undefined,
      windowsVirtualKeyCode: 13,
    });
  await until("!document.querySelector('app-project-media-picker')");
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-section-editor')).form.controls.media.length",
    ),
    1,
  );
  await evaluate(open);
  await until("!!document.querySelector('app-project-media-picker dialog:modal')");
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', {
      type,
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
  await until("!document.querySelector('app-project-media-picker')");
  assert.deepEqual(errors, []);
  await evaluate(
    "(()=>{const editor=ng.getComponent(document.querySelector('app-section-editor'));editor.form.controls.media.clear();const select=document.querySelector('app-section-editor select[formcontrolname=section_type]');select.value='MODEL_3D';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await until(
    "!document.querySelector('app-section-editor').textContent.includes('Elegir de biblioteca')",
  );
  assert.equal(
    await evaluate("document.querySelector('#section-upload-file').accept"),
    '.glb,.stl',
  );
  assert.equal(await evaluate("!!document.querySelector('app-project-media-picker')"), false);
  console.log(
    'Photograph picker: automatic search / images only / previews / click / Enter / X / Escape / 390–1440px; MODEL_3D upload only: OK (intercepted fixtures)',
  );
  console.log('Visual artifacts: ' + fileURLToPath(output));
} finally {
  socket?.close();
  browser.kill();
  for (const call of pending.values()) clearTimeout(call.timer);
}
