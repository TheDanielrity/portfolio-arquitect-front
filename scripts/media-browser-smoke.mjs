// Repeatable development-only browser smoke using Chrome DevTools Protocol.
// No test framework, auth dependency, credentials or tokens in console output.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.env['AUTH_SMOKE_FRONTEND_URL'] ?? 'http://localhost:4200';
const browserPath =
  process.env['AUTH_SMOKE_BROWSER_PATH'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const credentials = JSON.parse(
  await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
);
const profile = new URL('../.tools/media-browser-profile-' + Date.now() + '/', import.meta.url);
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
const r2 = { puts: 0, options: 0, putOk: 0, getOk: 0, authorization: false, origin: false };
const testName = 'frontend-media-smoke-' + Date.now() + '.png';
const testFile = new URL('../.tools/' + testName, import.meta.url);
let uploadedId;
let uploadId;
let cancelledName;
const python = fileURLToPath(new URL('../../backend/.venv/Scripts/python.exe', import.meta.url));
function verify(phase, name = testName) {
  let output;
  try {
    output = execFileSync(
      python,
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
  } catch {
    throw new Error(
      'PostgreSQL/R2 verification failed; inspect locally without exposing diagnostics',
    );
  }
  console.log(output.trim());
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
  for (let attempt = 0; attempt < 450; attempt++) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      /* A reload may temporarily destroy the execution context. */
    }
    await delay(100);
  }
  const snapshot = await evaluate(
    "(() => {const panel=document.querySelector('app-media-upload');return {path:location.pathname,stage:panel?.querySelector('.upload-status')?.textContent,error:panel?.querySelector('.error')?.textContent};})()",
  );
  throw new Error('Browser condition timed out: ' + JSON.stringify(snapshot));
}
try {
  let port;
  for (let attempt = 0; attempt < 450; attempt++) {
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
    if (message.method === 'Network.loadingFailed' && message.params.corsErrorStatus)
      console.log(
        'Browser CORS diagnostic:',
        message.params.corsErrorStatus.corsError,
        message.params.corsErrorStatus.failedParameter,
      );
    if (
      message.method === 'Network.requestWillBeSent' &&
      message.params.request.url.includes('.r2.cloudflarestorage.com')
    ) {
      const request = message.params.request;
      if (request.method === 'PUT') r2.puts++;
      if (request.method === 'OPTIONS') r2.options++;
      r2.authorization ||= Object.keys(request.headers).some((key) =>
        /authorization|refresh|x-error-id/i.test(key),
      );
      r2.origin ||= Object.entries(request.headers).some(
        ([key, value]) => key.toLowerCase() === 'origin' && value === origin,
      );
    }
    if (
      message.method === 'Network.responseReceived' &&
      message.params.response.url.includes('.r2.cloudflarestorage.com')
    ) {
      if (message.params.response.status === 200 && message.params.type === 'Fetch') r2.getOk++;
      if (message.params.response.status >= 200 && message.params.response.status < 300) r2.putOk++;
    }
    if (message.method === 'Network.requestWillBeSent') {
      const path = new URL(message.params.request.url).pathname;
      if (
        (path.startsWith('/api/v1/admin/') || path.startsWith('/api/v1/public/')) &&
        !(
          message.params.request.method === 'GET' &&
          ['/api/v1/admin/projects', '/api/v1/admin/contact-messages'].includes(path)
        ) &&
        !path.startsWith('/api/v1/admin/media')
      )
        domainRequests++;
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
  await writeFile(
    testFile,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0n8AAAAASUVORK5CYII=',
      'base64',
    ),
  );
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: origin + '/admin/media' });
  await until("location.pathname === '/admin/login' && !!document.querySelector('form')");
  await evaluate(
    `(() => { const email=document.querySelector('#email');const password=document.querySelector('#password');email.value=${JSON.stringify(credentials.email)};password.value=${JSON.stringify(credentials.password)};email.dispatchEvent(new Event('input',{bubbles:true}));password.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit();})()`,
  );
  await until("location.pathname === '/admin' && !!document.querySelector('app-admin-layout')");
  await evaluate('document.querySelector(\'.desktop-sidebar a[href="/admin/media"]\').click()');
  await until(
    "!!document.querySelector('#media-file') && !document.querySelector('.media-grid')?.getAttribute('aria-busy')?.includes('true')",
  );
  console.log('Real browser login and media listing: OK');
  assert.equal(
    await evaluate(
      "(async()=>{const r=await fetch('http://127.0.0.1:8000/api/v1/health');return r.ok && (await r.json()).status==='ok';})()",
    ),
    true,
    'FastAPI browser CORS',
  );
  console.log('FastAPI CORS from localhost browser: OK');
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    assert.equal(
      await evaluate(
        'document.documentElement.scrollWidth <= innerWidth && document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth',
      ),
      true,
      'Media responsive overflow',
    );
    await evaluate(
      "document.querySelectorAll('.user-details').forEach(e=>e.style.visibility='hidden')",
    );
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      new URL('../.tools/media-' + width + '.png', import.meta.url),
      Buffer.from(shot.data, 'base64'),
    );
  }
  console.log('Media responsive 375/768/1024/1440: OK');
  const dom = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', {
    nodeId: dom.root.nodeId,
    selector: '#media-file',
  });
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [fileURLToPath(testFile)] });
  await until("document.querySelector('app-media-upload .primary')?.textContent.includes('Subir')");
  // Force one expired access JWT to exercise the real single-flight path during presign.
  await evaluate(
    "(() => {const auth=ng.getComponent(document.querySelector('app-admin-layout')).auth;auth.session.save({access_token:'invalid-smoke-access',refresh_token:auth.session.refreshToken,expires_in:1});})()",
  );
  const beforeRefresh = refreshCount;
  await evaluate("document.querySelector('app-media-upload .primary').click()");
  await until(
    "document.querySelector('app-media-upload .upload-status')?.textContent.includes('Confirmado')",
  );
  assert.equal(refreshCount, beforeRefresh + 1, 'Presign refresh count');
  uploadedId = await evaluate(
    "ng.getComponent(document.querySelector('app-media-page')).upload.asset().id",
  );
  uploadId = await evaluate(
    "ng.getComponent(document.querySelector('app-media-page')).upload.authorization.upload_id",
  );
  assert.equal(r2.puts, 1, 'Exactly one direct R2 PUT');
  assert.equal(
    await evaluate("ng.getComponent(document.querySelector('app-media-page')).upload.progress()"),
    100,
    'Browser reported actual upload completion progress',
  );
  assert.ok(r2.putOk >= 1, 'Successful R2 response');
  assert.ok(r2.options >= 1, 'Browser R2 preflight occurred');
  assert.equal(r2.authorization, false, 'No administrative credentials to R2');
  assert.equal(r2.origin, true, 'Correct browser Origin');
  console.log(
    'FastAPI presign + real refresh → browser OPTIONS/PUT R2 → confirm: OK; no JWT to R2',
  );
  verify('present');
  const repeated = await evaluate(
    `(async()=>{const page=ng.getComponent(document.querySelector('app-media-page'));return (await new Promise((resolve,reject)=>page.api.confirm(${JSON.stringify(uploadId)}).subscribe({next:resolve,error:()=>reject(new Error('confirm'))}))).id;})()`,
  );
  assert.equal(repeated, uploadedId, 'Idempotent confirmation');
  console.log('Idempotent confirmation: OK');
  await until(
    `Array.from(document.querySelectorAll('.media-item')).some(e=>e.textContent.includes(${JSON.stringify(testName)}))`,
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.media-item')).find(e=>e.textContent.includes(${JSON.stringify(testName)})).querySelector('.detail-button').focus()`,
  );
  await press('Enter', 13);
  await until(
    "document.querySelector('app-media-detail dialog')?.open && !!document.querySelector('#media-title')",
  );
  console.log('Media detail opened: OK');
  await evaluate(
    "document.querySelector('app-media-detail app-media-preview .preview button').click()",
  );
  await until(
    "document.querySelector('app-media-detail img')?.naturalWidth > 0 || !!document.querySelector('app-media-detail app-media-preview .error')?.textContent",
  );
  assert.equal(
    await evaluate("document.querySelector('app-media-detail img')?.naturalWidth > 0"),
    true,
    'Private preview failed: ' +
      (await evaluate(
        "document.querySelector('app-media-detail app-media-preview .error')?.textContent || 'image unavailable'",
      )),
  );
  assert.equal(r2.authorization, false, 'No Bearer survives cross-origin delivery redirect');
  console.log('Private authorized preview and idempotent confirm: OK');
  await evaluate(
    "(() => {const title=document.querySelector('#media-title');title.value='Archivo temporal de verificación';title.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('app-media-detail form').requestSubmit();})()",
  );
  await until(
    "document.querySelector('app-media-detail')?.textContent.includes('Metadata guardada')",
  );
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(100);
    assert.equal(
      await evaluate(
        'document.querySelector("app-media-detail dialog").scrollWidth <= document.querySelector("app-media-detail dialog").clientWidth',
      ),
      true,
      'Dialog overflow',
    );
  }
  console.log('Detail, metadata editing and responsive dialog: OK');
  await evaluate("document.querySelector('app-media-detail dialog button').focus()");
  for (let index = 0; index < 18; index++) {
    await press('Tab', 9);
    if (await evaluate('document.activeElement === document.body')) await press('Tab', 9);
    assert.equal(
      await evaluate(
        "document.querySelector('app-media-detail dialog').contains(document.activeElement)",
      ),
      true,
      'Native dialog focus containment',
    );
  }
  await press('Escape', 27);
  await until("!document.querySelector('app-media-detail')");
  assert.equal(
    await evaluate("document.activeElement?.classList.contains('detail-button')"),
    true,
    'Dialog restores opener focus',
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.media-item')).find(e=>e.textContent.includes(${JSON.stringify(testName)})).querySelector('.detail-button').focus()`,
  );
  await press('Enter', 13);
  await until(
    "document.querySelector('app-media-detail dialog')?.open && !!document.querySelector('#media-title')",
  );
  console.log('Media dialog keyboard, Escape and restored focus: OK');
  await evaluate("document.querySelector('app-media-detail .danger').click()");
  await evaluate("document.querySelector('app-media-detail .danger').click()");
  await until("!document.querySelector('app-media-detail')");
  await until(
    `!Array.from(document.querySelectorAll('.media-item')).some(e=>e.textContent.includes(${JSON.stringify(testName)}))`,
  );
  await evaluate(
    `(async()=>{const page=ng.getComponent(document.querySelector('app-media-page'));await new Promise((resolve,reject)=>page.api.delete(${JSON.stringify(uploadedId)}).subscribe({next:resolve,error:()=>reject(new Error('delete')),complete:resolve}));})()`,
  );
  uploadedId = null;
  verify('clean');
  console.log('Delete and repeated DELETE: OK');
  cancelledName = testName.replace('.png', '-cancel.png');
  await evaluate(
    `(async()=>{const api=ng.getComponent(document.querySelector('app-media-page')).api;const authorization=await new Promise((resolve,reject)=>api.presign({original_filename:${JSON.stringify(cancelledName)},mime_type:'image/png',file_size:70,access:'private'}).subscribe({next:resolve,error:()=>reject(new Error('presign cancellation'))}));for(let i=0;i<2;i++)await new Promise((resolve,reject)=>api.cancel(authorization.upload_id).subscribe({next:resolve,complete:resolve,error:()=>reject(new Error('cancel'))}));})()`,
  );
  verify('clean', cancelledName);
  console.log('Real persisted cancellation and repeated cancellation: OK');
  await evaluate('globalThis.__mediaSmokeReloading = true');
  await send('Page.reload');
  await until(
    "globalThis.__mediaSmokeReloading !== true && location.pathname === '/admin/media' && !!document.querySelector('#media-file')",
  );
  await evaluate("document.querySelector('.logout-button').click()");
  await until("location.pathname === '/admin/login'");
  console.log('Media refresh and logout reached login: OK');
  assert.equal(runtimeErrors, 0, 'Browser runtime errors');
  console.log('Media reload/session restoration + logout: OK');
} catch (error) {
  console.error(
    'Media browser smoke failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    if (uploadedId)
      await evaluate(
        `(async()=>{const page=ng.getComponent(document.querySelector('app-media-page'));if(page)await new Promise(resolve=>page.api.delete(${JSON.stringify(uploadedId)}).subscribe({next:resolve,error:resolve,complete:resolve}));})()`,
      ).catch(() => {});
    await evaluate(
      "(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(auth)await new Promise(resolve=>auth.logout().subscribe({next:resolve,error:resolve,complete:resolve}));})()",
    ).catch(() => {});
  }
  try {
    verify('clean');
    if (cancelledName) verify('clean', cancelledName);
  } catch {
    console.error('Smoke cleanup requires inspection');
    process.exitCode = 1;
  }
  for (const call of pending.values()) clearTimeout(call.timer);
  socket?.close();
  browser.kill();
}
