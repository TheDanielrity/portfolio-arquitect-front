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
const profile = new URL('../.tools/sections-browser-profile-' + Date.now() + '/', import.meta.url);
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

let projectId;

const projectName = 'frontend-project-smoke-' + Date.now();
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
        !(message.params.request.method === 'GET' && path === '/api/v1/admin/contact-messages') &&
        ![
          '/api/v1/admin/media',
          '/api/v1/admin/projects',
          '/api/v1/admin/categories',
          '/api/v1/admin/tags',
        ].some((prefix) => path === prefix || path.startsWith(prefix + '/'))
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
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: origin + '/admin/login' });
  await until(
    "!!document.querySelector('#email') && typeof ng !== 'undefined' && !!ng.getComponent(document.querySelector('app-admin-login'))",
  );
  await evaluate(
    `(()=>{for(const [id,value] of [['email',${JSON.stringify(credentials.email)}],['password',${JSON.stringify(credentials.password)}]]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`,
  );
  await until("location.pathname==='/admin' && !!document.querySelector('app-admin-layout')");
  async function fill(selector, value, event = 'input') {
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  }
  async function click(selector, text) {
    await evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.includes(${JSON.stringify(text)})).click()`,
    );
  }
  async function navigate(route) {
    await send('Page.navigate', { url: origin + route });
    await until("!!document.querySelector('app-admin-layout')");
  }
  const names = [
    testName,
    testName.replace('.png', '-second.png'),
    testName.replace('.png', '.webm'),
    testName.replace('.png', '.glb'),
  ];
  const files = names.map((name) => new URL('../.tools/' + name, import.meta.url));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0n8AAAAASUVORK5CYII=',
    'base64',
  );
  await writeFile(files[0], png);
  await writeFile(files[1], png);
  const video = await evaluate(
    `(async()=>{const c=document.createElement('canvas');c.width=16;c.height=16;c.getContext('2d').fillRect(0,0,16,16);const stream=c.captureStream(10);const parts=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});return await new Promise(resolve=>{recorder.ondataavailable=e=>parts.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(parts).arrayBuffer());resolve(btoa(String.fromCharCode(...bytes)));};recorder.start();setTimeout(()=>{c.getContext('2d').fillRect(0,0,16,16);recorder.stop();},500);});})()`,
  );
  await writeFile(files[2], Buffer.from(video, 'base64'));
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const glb = Buffer.alloc(20 + padded.length);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  await writeFile(files[3], glb);
  globalThis.smokeNames = names;
  globalThis.smokeAssets = [];
  for (let i = 0; i < files.length; i++) {
    await navigate('/admin/media');
    await until("!!document.querySelector('#media-file')");
    const dom = await send('DOM.getDocument');
    const input = await send('DOM.querySelector', {
      nodeId: dom.root.nodeId,
      selector: '#media-file',
    });
    await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [fileURLToPath(files[i])] });
    await until(
      "document.querySelector('app-media-upload .primary')?.textContent.includes('Subir')",
    );
    await click('app-media-upload button', 'Subir archivo');
    await until(
      "document.querySelector('app-media-upload .upload-status')?.textContent.includes('Confirmado')",
    );
    globalThis.smokeAssets.push(
      await evaluate("ng.getComponent(document.querySelector('app-media-page')).upload.asset().id"),
    );
    verify('present', names[i]);
  }
  assert.equal(r2.puts, 4);
  assert.equal(r2.authorization, false);
  const putsBefore = r2.puts;
  await navigate('/admin/projects/new');
  await until("!!document.querySelector('#project-title')");
  await fill('#project-title', projectName);
  await fill('#project-slug', projectName);
  await fill('#project-visibility', 'PRIVATE', 'change');
  await click('app-project-editor button', 'Guardar proyecto');
  await until(
    "location.pathname.endsWith('/edit') && !!document.querySelector('app-project-sections') && !ng.getComponent(document.querySelector('app-project-sections')).loading()",
  );
  projectId = await evaluate("ng.getComponent(document.querySelector('app-project-editor')).id");
  async function choose(name) {
    await click('app-section-editor button', 'Seleccionar multimedia existente');
    await until(
      "document.querySelector('app-project-media-picker dialog')?.open && !ng.getComponent(document.querySelector('app-project-media-picker')).busy()",
    );
    await fill('app-project-media-picker [formcontrolname="q"]', name);
    await evaluate("document.querySelector('app-project-media-picker form').requestSubmit()");
    await until(
      `!ng.getComponent(document.querySelector('app-project-media-picker')).busy() && Array.from(document.querySelectorAll('app-project-media-picker button')).some(e=>e.textContent.includes(${JSON.stringify('Seleccionar ' + name)}))`,
    );
    await click('app-project-media-picker button', 'Seleccionar ' + name);
    await until("!document.querySelector('app-project-media-picker')");
  }
  const types = ['TEXT', 'IMAGE', 'GALLERY', 'VIDEO', 'MODEL_3D', 'QUOTE', 'SPLIT'];
  for (const type of types) {
    await fill('app-project-sections > section > .actions select', type, 'change');
    await click('app-project-sections button', 'Añadir sección');
    await until("!!document.querySelector('app-section-editor form')");
    await fill('app-section-editor [formcontrolname="title"]', 'Smoke ' + type);
    if (['TEXT', 'QUOTE', 'SPLIT'].includes(type))
      await fill('app-section-editor textarea', 'Contenido de prueba ' + type);
    if (['IMAGE', 'GALLERY', 'SPLIT'].includes(type)) await choose(names[0]);
    if (type === 'GALLERY') await choose(names[1]);
    if (type === 'VIDEO') await choose(names[2]);
    if (type === 'MODEL_3D') await choose(names[3]);
    await click('app-section-editor button', 'Guardar sección');
    await until(
      "!document.querySelector('app-section-editor') && !ng.getComponent(document.querySelector('app-project-sections')).loading()",
    );
  }
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-sections')).sections().length",
    ),
    7,
  );
  console.log(
    'Real creation of TEXT/IMAGE/GALLERY/VIDEO/MODEL_3D/QUOTE/SPLIT with existing media: OK',
  );
  await evaluate(
    "document.querySelectorAll('.section-row')[6].querySelectorAll('button')[2].click()",
  );
  await until(
    "!ng.getComponent(document.querySelector('app-project-sections')).busy() && !ng.getComponent(document.querySelector('app-project-sections')).loading()",
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-sections')).sections()[5].section_type",
    ),
    'SPLIT',
  );
  await evaluate("document.querySelectorAll('.section-row')[2].querySelector('button').click()");
  await until(
    "!!document.querySelector('app-section-editor form') && !ng.getComponent(document.querySelector('app-section-editor')).loading()",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.section-media')[1].querySelectorAll('button')).find(e=>e.textContent.includes('Subir archivo')).click()",
  );
  await click('app-section-editor button', 'Guardar sección');
  await until("!document.querySelector('app-section-editor')");
  await evaluate("document.querySelectorAll('.section-row')[0].querySelector('button').click()");
  await until("!!document.querySelector('app-section-editor form')");
  await fill('app-section-editor textarea', 'Texto editado persistido');
  await evaluate('document.querySelector(\'.desktop-sidebar a[href="/admin/projects"]\').click()');
  await until("document.querySelector('app-project-confirm dialog')?.open");
  await press('Escape', 27);
  await until("!document.querySelector('app-project-confirm')");
  assert.equal(
    await evaluate(
      "location.pathname.endsWith('/edit') && ng.getComponent(document.querySelector('app-section-editor')).hasChanges()",
    ),
    true,
    'Dirty sections use existing navigation protection',
  );
  for (const width of [375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    await evaluate("document.querySelector('app-section-editor').scrollIntoView({block:'start'})");
    assert.equal(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      true,
      'No section overflow ' + width,
    );
    await evaluate(
      "document.querySelectorAll('.user-details').forEach(e=>e.style.visibility='hidden')",
    );
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      new URL('../.tools/sections-' + width + '.png', import.meta.url),
      Buffer.from(shot.data, 'base64'),
    );
  }
  await click('app-section-editor button', 'Guardar sección');
  await until("!document.querySelector('app-section-editor')");
  await send('Page.reload');
  await until(
    "!!document.querySelector('app-project-sections') && !ng.getComponent(document.querySelector('app-project-sections')).loading()",
  );
  const persisted = await evaluate(
    "ng.getComponent(document.querySelector('app-project-sections')).sections().map(s=>({type:s.section_type,content:s.content}))",
  );
  assert.equal(persisted.length, 7);
  assert.equal(persisted[0].content, 'Texto editado persistido');
  assert.equal(persisted[5].type, 'SPLIT');
  await evaluate("document.querySelectorAll('.section-row')[2].querySelector('button').click()");
  await until(
    "!!document.querySelector('app-section-editor form') && !ng.getComponent(document.querySelector('app-section-editor')).loading()",
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-section-editor')).body().media[0].media_id",
    ),
    globalThis.smokeAssets[1],
  );
  await click('app-section-editor button', 'Ver imagen');
  await until("!!document.querySelector('app-section-editor app-media-preview img')");
  await click('app-section-editor button', 'Cancelar edición');
  await until("!document.querySelector('app-section-editor')");
  await evaluate(
    "document.querySelectorAll('.section-row')[0].querySelectorAll('button')[1].click()",
  );
  await until(
    "!ng.getComponent(document.querySelector('app-project-sections')).loading() && !ng.getComponent(document.querySelector('app-project-sections')).busy()",
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-sections')).sections()[0].is_visible",
    ),
    false,
  );
  await evaluate(
    "document.querySelectorAll('.section-row')[1].querySelectorAll('button')[4].click()",
  );
  await until("document.querySelector('app-project-confirm dialog')?.open");
  assert.equal(await evaluate("document.activeElement.textContent.includes('Cancelar')"), true);
  await click('app-project-confirm button', 'Eliminar sección');
  await until(
    "ng.getComponent(document.querySelector('app-project-sections')).sections().length===6",
  );
  verify('present', names[0]);
  verify('present', names[1]);
  assert.equal(r2.puts, putsBefore, 'Association performs no PUT');
  assert.equal(r2.authorization, false);
  assert.equal(runtimeErrors, 0);
  assert.equal(domainRequests, 0, 'No Phase 7 or public domain calls');
  console.log(
    'Section/media ordering, text editing, reload persistence, visibility, private preview, accessible deletion and responsive widths: OK',
  );
} catch (error) {
  console.error(
    'Sections browser smoke failed:',
    error instanceof Error ? error.message : 'Unknown',
  );
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    const unresolved = await evaluate(
      "(()=>{const element=document.querySelector('app-media-page');const upload=element?ng.getComponent(element).upload:null;if(upload?.unresolved){upload.cancel();return true;}return false;})()",
    ).catch(() => false);
    if (unresolved)
      await until(
        "ng.getComponent(document.querySelector('app-media-page')).upload.stage()==='cancelled'",
      ).catch(() => {
        process.exitCode = 1;
      });
    if (projectId || (globalThis.smokeAssets ?? []).length) {
      try {
        await evaluate(
          `(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(!auth?.session.accessToken)throw new Error('Cleanup session missing');const headers={Authorization:'Bearer '+auth.session.accessToken,'Content-Type':'application/json'};const request=async(method,path)=>{const r=await fetch('/api/v1/admin'+path,{method,headers});if(!r.ok&&r.status!==404)throw new Error('Cleanup failed');return r.status===204||r.status===404?null:r.json();};const id=${JSON.stringify(projectId ?? null)};if(id){const p=await request('GET','/projects/'+id);if(p){const sections=await request('GET','/projects/'+id+'/sections?limit=100');for(const s of sections.items)await request('DELETE','/projects/'+id+'/sections/'+s.id);if((await request('GET','/projects/'+id+'/sections?limit=100')).total)throw new Error('Sections remain');await request('DELETE','/projects/'+id);}if(await request('GET','/projects/'+id))throw new Error('Project remains');}for(const id of ${JSON.stringify(globalThis.smokeAssets ?? [])})await request('DELETE','/media/'+id);})()`,
        );
        console.log(
          'API cleanup: sections/relations removed, project soft-deleted, temporary media deleted: OK',
        );
      } catch {
        console.error('Sections cleanup requires local inspection');
        process.exitCode = 1;
      }
    }
    await evaluate(
      "(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(auth)await new Promise(resolve=>auth.logout().subscribe({next:resolve,error:resolve,complete:resolve}));})()",
    ).catch(() => {});
  }
  for (const name of globalThis.smokeNames ?? []) {
    try {
      verify('clean', name);
    } catch {
      console.error('Temporary R2/PostgreSQL cleanup requires inspection');
      process.exitCode = 1;
    }
  }
  for (const call of pending.values()) clearTimeout(call.timer);
  socket?.close();
  browser.kill();
}
