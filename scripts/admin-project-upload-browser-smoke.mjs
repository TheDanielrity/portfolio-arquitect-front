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
const profile = new URL(
  '../.tools/admin-redesign-browser-profile-' + Date.now() + '/',
  import.meta.url,
);
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
let projectId;
let categoryId;
let tagId;
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
  assert.ok(
    !result.exceptionDetails,
    'Browser evaluation failed: ' +
      (result.exceptionDetails?.exception?.description?.split('\n')[0] || 'unknown'),
  );
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
  for (let attempt = 0; attempt < 1300; attempt++) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      /* A reload may temporarily destroy the execution context. */
    }
    await delay(100);
  }
  const snapshot = await evaluate(
    "(() => {const element=document.querySelector('app-project-media');const queue=element && ng.getComponent(element).queue;return {path:location.pathname,jobs:queue?.jobs().map(j=>({stage:j.upload.stage(),association:j.association(),error:j.error() || j.upload.error()}))};})()",
  );
  throw new Error('Browser condition timed out: ' + JSON.stringify(snapshot));
}
const files = [
  testFile,
  new URL('../.tools/' + testName.replace('.png', '-gallery-a.png'), import.meta.url),
  new URL('../.tools/' + testName.replace('.png', '-gallery-b.png'), import.meta.url),
];
let sharedProjectId;
let access;
const knownAssets = new Set();
async function api(method, path, body, publicRequest = false) {
  const response = await fetch('http://localhost:8000/api/v1' + path, {
    method,
    headers: {
      ...(publicRequest ? {} : { Authorization: 'Bearer ' + access }),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 404)
    throw new Error('Smoke API failed with status ' + response.status);
  return response.status === 204 || response.status === 404 ? null : response.json();
}
async function selectFiles(selector, paths) {
  const dom = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector });
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: paths.map(fileURLToPath) });
}
async function screenshot(name, width, selector = null) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await evaluate(
    "document.querySelector('main')?.scrollTo(0,0);document.querySelectorAll('.user-details').forEach(e=>e.style.visibility='hidden')",
  );
  if (selector)
    await evaluate(
      'document.querySelector(' + JSON.stringify(selector) + ")?.scrollIntoView({block:'start'})",
    );
  await delay(150);
  assert.equal(
    await evaluate(
      "(()=>{const main=document.querySelector('main');const dialog=document.querySelector('dialog[open]');return (!main || main.scrollWidth<=main.clientWidth+1) && (!dialog || dialog.scrollWidth<=dialog.clientWidth+1)})()",
    ),
    true,
    'No overflow inside editor or dialog ' + name + ' ' + width,
  );
  assert.equal(
    await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
    true,
    'No viewport overflow ' + name + ' ' + width,
  );
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    new URL('../.tools/admin-' + name + '-' + width + '.png', import.meta.url),
    Buffer.from(shot.data, 'base64'),
  );
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
    if (
      message.method === 'Network.loadingFailed' &&
      message.params.errorText !== 'net::ERR_ABORTED'
    )
      console.log(
        'Browser request failure:',
        message.params.errorText,
        message.params.blockedReason || '',
      );
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
        ![
          '/api/v1/admin/media',
          '/api/v1/admin/projects',
          '/api/v1/admin/categories',
          '/api/v1/admin/tags',
          '/api/v1/admin/contact-messages',
        ].some((prefix) => path === prefix || path.startsWith(prefix + '/'))
      )
        domainRequests++;
      if (path.includes('/sections') && message.params.request.method !== 'GET') domainRequests++;
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

  for (const file of files.slice(1)) await writeFile(file, await readFile(testFile));
  const tokens = await (
    await fetch('http://localhost:8000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
  ).json();
  access = tokens.access_token;
  await send('Page.navigate', { url: origin + '/admin/projects/new' });
  await until("location.pathname==='/admin/login' && !!document.querySelector('form')");
  await screenshot('login', 1440);
  await evaluate(
    `(()=>{const email=document.querySelector('#email'),password=document.querySelector('#password');email.value=${JSON.stringify(credentials.email)};password.value=${JSON.stringify(credentials.password)};for(const input of [email,password])input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit()})()`,
  );
  await until("location.pathname==='/admin' && !!document.querySelector('app-admin-dashboard')");
  await send('Page.navigate', { url: origin + '/admin/projects/new' });
  await until("!!document.querySelector('#project-title')");
  assert.equal(
    await evaluate("document.querySelectorAll('app-project-editor .field-error').length"),
    0,
    'No premature validation errors',
  );
  await evaluate(
    "(()=>{const input=document.querySelector('#project-title');input.value=" +
      JSON.stringify(projectName) +
      ";input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('blur'));document.querySelector('[formcontrolname=description]').value='Temporary integration project';document.querySelector('[formcontrolname=description]').dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-editor')).form.controls.slug.value",
    ),
    projectName,
    'Automatic link',
  );
  await evaluate("document.querySelector('#project-save').click()");
  await until(
    "location.pathname.endsWith('/edit') && !!document.querySelector('app-project-media')",
  );
  await until("!ng.getComponent(document.querySelector('app-project-media')).loading()");
  assert.equal(
    await evaluate("ng.getComponent(document.querySelector('app-project-editor')).tab()"),
    'media',
    'Continue with photographs',
  );
  await selectFiles('#project-cover-files', [files[0]]);
  await until(
    "ng.getComponent(document.querySelector('app-project-editor')).id && ng.getComponent(document.querySelector('app-project-media')).queue.jobs()[0]?.association()==='completed'",
  );
  projectId = await evaluate("ng.getComponent(document.querySelector('app-project-editor')).id");
  assert.equal(
    await evaluate('location.pathname'),
    '/admin/projects/' + projectId + '/edit',
    'Persisted draft URL without leaving editor',
  );
  uploadedId = await evaluate(
    "ng.getComponent(document.querySelector('app-project-media')).queue.jobs()[0].upload.asset().id",
  );
  knownAssets.add(uploadedId);
  verify('present');
  await until(
    "ng.getComponent(document.querySelector('app-project-media')).links().some(l=>l.role==='COVER')",
  );
  assert.equal((await api('GET', '/admin/projects/' + projectId)).status, 'DRAFT');
  console.log('New project -> one real persisted draft -> browser R2 PUT -> confirm -> cover: OK');
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('media');ng.getComponent(document.querySelector('app-project-media')).group.set('GALLERY')",
  );
  await selectFiles('#project-gallery-files', files.slice(1));
  assert.equal(
    await evaluate("document.querySelector('#project-save').disabled"),
    true,
    'Cannot publish while upload/association pending',
  );
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('publication')",
  );
  await until(
    "ng.getComponent(document.querySelector('app-project-media')).queue.jobs().length===3 && ng.getComponent(document.querySelector('app-project-media')).queue.jobs().every(j=>j.association()==='completed')",
  );
  const galleryAssets = await evaluate(
    "ng.getComponent(document.querySelector('app-project-media')).queue.jobs().slice(1).map(j=>j.upload.asset().id)",
  );
  galleryAssets.forEach((id) => knownAssets.add(id));
  for (const file of files.slice(1)) verify('present', file.pathname.split('/').at(-1));
  await until("ng.getComponent(document.querySelector('app-project-media')).links().length===3");
  await evaluate(
    "(()=>{const m=ng.getComponent(document.querySelector('app-project-media'));m.editMetadata(m.assets()[m.links().find(l=>l.role==='GALLERY').media_id]);m.metadata.controls.alt_text.setValue('Smoke alternative text');m.metadata.controls.description.setValue('Smoke shared asset description');m.saveMetadata()})()",
  );
  await until("!ng.getComponent(document.querySelector('app-project-media')).busy()");
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-editor'));c.tab.set('media');ng.getComponent(document.querySelector('app-project-media')).group.set('GALLERY');const m=ng.getComponent(document.querySelector('app-project-media'));m.group.set('GALLERY');m.move(m.links().length-1,-1)})()",
  );
  await until("!ng.getComponent(document.querySelector('app-project-media')).busy()");
  const orderBefore = await evaluate(
    "ng.getComponent(document.querySelector('app-project-media')).links().map(l=>l.media_id)",
  );
  await evaluate("ng.getComponent(document.querySelector('app-project-editor')).save()");
  await until(
    "ng.getComponent(document.querySelector('app-project-editor')).form.pristine && !ng.getComponent(document.querySelector('app-project-editor')).saving()",
  );
  await evaluate('globalThis.__projectUploadReloading = true');
  await send('Page.reload');
  await until(
    "!globalThis.__projectUploadReloading && ng.getComponent(document.querySelector('app-project-media'))?.links().length===3",
  );
  assert.deepEqual(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-media')).links().map(l=>l.media_id)",
    ),
    orderBefore,
  );
  const metadata = await api('GET', '/admin/media/' + galleryAssets[0]);
  assert.equal(metadata.alt_text, 'Smoke alternative text');
  assert.equal(r2.puts, 3, 'Exactly three uploads, none for metadata/reorder');
  assert.equal(r2.authorization, false, 'No JWT to R2');
  assert.ok(r2.options >= 3 && r2.putOk >= 3);
  console.log(
    'Multiple gallery uploads, tab switching, real progress, metadata and order after reload: OK',
  );
  sharedProjectId = (
    await api('POST', '/admin/projects', {
      title: projectName + ' shared',
      slug: projectName + '-shared',
      status: 'DRAFT',
      visibility: 'PRIVATE',
    })
  ).id;
  await api('POST', '/admin/projects/' + sharedProjectId + '/media', {
    media_id: galleryAssets[0],
    role: 'GALLERY',
    sort_order: 0,
  });
  await evaluate(
    `(()=>{const m=ng.getComponent(document.querySelector('app-project-media'));m.choose(m.assets()[${JSON.stringify(galleryAssets[1])}]);m.role.set('COVER');m.attach()})()`,
  );
  await until("!ng.getComponent(document.querySelector('app-project-media')).busy()");
  assert.ok(await api('GET', '/admin/media/' + uploadedId), 'Previous cover remains in library');
  await evaluate(
    `(()=>{const m=ng.getComponent(document.querySelector('app-project-media'));m.removing.set(m.links().find(l=>l.media_id===${JSON.stringify(galleryAssets[0])} && l.role==='GALLERY'))})()`,
  );
  await until("document.querySelector('app-project-confirm dialog')?.open");
  await evaluate("document.querySelector('app-project-confirm .primary').click()");
  await until("!ng.getComponent(document.querySelector('app-project-media')).busy()");
  assert.ok(
    (await api('GET', '/admin/projects/' + sharedProjectId + '/media')).items.some(
      (l) => l.media_id === galleryAssets[0],
    ),
  );
  assert.ok(await api('GET', '/admin/media/' + galleryAssets[0]));
  console.log('Atomic cover replacement and relation removal preserve shared assets: OK');
  await evaluate("ng.getComponent(document.querySelector('app-project-editor')).tab.set('basic')");
  await evaluate(
    "Array.from(document.querySelectorAll('app-project-attributes button')).find(b=>b.textContent.includes('Agregar característica')).click()",
  );
  await evaluate(
    "(()=>{const a=ng.getComponent(document.querySelector('app-project-attributes'));a.form.controls.label.setValue('Material principal');a.form.controls.value.setValue('Hormigón visto');document.querySelector('app-project-attributes form').requestSubmit()})()",
  );
  await until(
    "ng.getComponent(document.querySelector('app-project-attributes')).items().length===1 && !ng.getComponent(document.querySelector('app-project-attributes')).busy()",
  );
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('sections')",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('app-project-sections button')).find(b=>b.textContent.includes('Agregar sección')).click()",
  );
  await until("!!document.querySelector('app-section-editor form')");
  await evaluate(
    "(()=>{const input=document.querySelector('app-section-editor textarea');input.value='Historia temporal del proyecto';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#section-save').click()})()",
  );
  await until(
    "!document.querySelector('app-section-editor') && ng.getComponent(document.querySelector('app-project-sections')).sections().length===1",
  );
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('publication')",
  );
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-editor'));c.form.controls.seo_title.setValue('Proyecto temporal');c.form.markAsDirty();c.save()})()",
  );
  await until(
    "!ng.getComponent(document.querySelector('app-project-editor')).saving() && ng.getComponent(document.querySelector('app-project-editor')).form.pristine",
  );
  await send('Page.reload');
  await until(
    "ng.getComponent(document.querySelector('app-project-attributes'))?.items().length===1 && ng.getComponent(document.querySelector('app-project-sections'))?.sections().length===1",
  );
  assert.equal((await api('GET', '/admin/projects/' + projectId)).seo_title, 'Proyecto temporal');
  assert.equal((await api('GET', '/admin/projects/' + projectId)).is_featured, false);
  console.log('Characteristic, presentation, search appearance persist across reload: OK');

  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-editor'));c.tab.set('sections');ng.getComponent(document.querySelector('app-project-sections')).open(null,'IMAGE')})()",
  );
  await until("!!document.querySelector('#section-upload-file')");
  await selectFiles('#section-upload-file', [files[0]]);
  await until(
    "ng.getComponent(document.querySelector('app-section-editor')).upload.stage()==='completed' && ng.getComponent(document.querySelector('app-section-editor')).form.controls.media.length===1",
  );
  const inlineAsset = await evaluate(
    "ng.getComponent(document.querySelector('app-section-editor')).upload.asset().id",
  );
  knownAssets.add(inlineAsset);
  await evaluate("document.querySelector('#section-save').click()");
  await until(
    "!document.querySelector('app-section-editor') && ng.getComponent(document.querySelector('app-project-sections')).sections().length===2",
  );
  const sectionPage = await api('GET', '/admin/projects/' + projectId + '/sections?limit=100');
  const imageSection = sectionPage.items.find((item) => item.section_type === 'IMAGE');
  assert.ok(
    (
      await api(
        'GET',
        '/admin/projects/' + projectId + '/sections/' + imageSection.id + '/media?limit=100',
      )
    ).items.some((item) => item.media_id === inlineAsset),
  );
  assert.equal(r2.puts, 4, 'Section inline upload uses one additional direct PUT');
  assert.equal(r2.authorization, false, 'Section upload never sends JWT to R2');
  console.log('Real inline section upload -> confirm -> saved section association: OK');

  const videoFile = new URL('../.tools/' + testName.replace('.png', '.webm'), import.meta.url);
  const modelFile = new URL('../.tools/' + testName.replace('.png', '.glb'), import.meta.url);
  const video = await evaluate(
    "(async()=>{const c=document.createElement('canvas');c.width=16;c.height=16;c.getContext('2d').fillRect(0,0,16,16);const stream=c.captureStream(10);const parts=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});return await new Promise(resolve=>{recorder.ondataavailable=e=>parts.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(parts).arrayBuffer());resolve(btoa(String.fromCharCode(...bytes)));};recorder.start();setTimeout(()=>recorder.stop(),500);});})()",
  );
  await writeFile(videoFile, Buffer.from(video, 'base64'));
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
  await writeFile(modelFile, glb);
  files.push(videoFile, modelFile);
  for (const type of ['GALLERY', 'VIDEO', 'MODEL_3D', 'QUOTE', 'SPLIT']) {
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-sections')).open(null," +
        JSON.stringify(type) +
        ')',
    );
    await until("!!document.querySelector('app-section-editor form')");
    if (['QUOTE', 'SPLIT'].includes(type))
      await evaluate(
        "(()=>{const c=ng.getComponent(document.querySelector('app-section-editor'));c.form.controls.content.setValue('Texto temporal de la sección');c.form.markAsDirty()})()",
      );
    if (type === 'VIDEO' || type === 'MODEL_3D') {
      await selectFiles('#section-upload-file', [type === 'VIDEO' ? videoFile : modelFile]);
      await until(
        "ng.getComponent(document.querySelector('app-section-editor')).upload.stage()==='completed' && ng.getComponent(document.querySelector('app-section-editor')).form.controls.media.length===1",
      );
      knownAssets.add(
        await evaluate(
          "ng.getComponent(document.querySelector('app-section-editor')).upload.asset().id",
        ),
      );
    } else if (type === 'GALLERY' || type === 'SPLIT') {
      await evaluate(
        "Array.from(document.querySelectorAll('app-section-editor button')).find(b=>b.textContent.includes('Elegir de biblioteca')).click()",
      );
      await until(
        "document.querySelector('app-project-media-picker dialog')?.open && !ng.getComponent(document.querySelector('app-project-media-picker')).busy()",
      );
      await evaluate(
        "(()=>{const q=document.querySelector('app-project-media-picker [formcontrolname=q]');q.value=" +
          JSON.stringify(testName) +
          ";q.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('app-project-media-picker form').requestSubmit()})()",
      );
      await until(
        "!ng.getComponent(document.querySelector('app-project-media-picker')).busy() && ng.getComponent(document.querySelector('app-project-media-picker')).page()?.items.length>0",
      );
      await evaluate(
        "Array.from(document.querySelectorAll('app-project-media-picker .relation-row button')).find(b=>b.textContent.trim().startsWith('Seleccionar ')).click()",
      );
      await until("!document.querySelector('app-project-media-picker')");
    }
    await evaluate("document.querySelector('#section-save').click()");
    await until(
      "!document.querySelector('app-section-editor') && !ng.getComponent(document.querySelector('app-project-sections')).loading()",
    );
  }
  const allSections = await api('GET', '/admin/projects/' + projectId + '/sections?limit=100');
  assert.deepEqual(
    allSections.items.map((s) => s.section_type).sort(),
    ['TEXT', 'IMAGE', 'GALLERY', 'VIDEO', 'MODEL_3D', 'QUOTE', 'SPLIT'].sort(),
  );
  const firstSection = allSections.items[0];
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-sections'));c.visibility(c.sections()[0]);})()",
  );
  await until("!ng.getComponent(document.querySelector('app-project-sections')).busy()");
  assert.equal(
    (await api('GET', '/admin/projects/' + projectId + '/sections/' + firstSection.id)).is_visible,
    false,
  );
  await evaluate("ng.getComponent(document.querySelector('app-project-sections')).move(1,-1)");
  await until("!ng.getComponent(document.querySelector('app-project-sections')).busy()");
  assert.equal(
    (await api('GET', '/admin/projects/' + projectId + '/sections?limit=100')).items[0]
      .section_type,
    'IMAGE',
  );
  assert.equal(r2.authorization, false);
  console.log('All seven section types, library reuse, inline VIDEO/GLB, visibility and order: OK');

  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('publication')",
  );

  const listed = await api('GET', '/public/projects?limit=100', undefined, true);
  assert.ok(!listed.items.some((p) => p.slug === projectName));
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-editor'));c.form.controls.status.setValue('PUBLISHED');c.form.controls.visibility.setValue('PRIVATE');c.form.markAsDirty();c.save()})()",
  );
  await until("document.querySelector('app-project-confirm dialog')?.open");
  await evaluate("document.querySelector('app-project-confirm .primary').click()");
  await until(
    "ng.getComponent(document.querySelector('app-project-editor')).project()?.status==='PUBLISHED' && !ng.getComponent(document.querySelector('app-project-editor')).saving()",
  );
  assert.ok(
    !(await api('GET', '/public/projects?limit=100', undefined, true)).items.some(
      (p) => p.slug === projectName,
    ),
  );
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-editor'));c.form.controls.visibility.setValue('PUBLIC');c.save()})()",
  );
  await until("!ng.getComponent(document.querySelector('app-project-editor')).saving()");
  assert.ok(
    (await api('GET', '/public/projects?limit=100', undefined, true)).items.some(
      (p) => p.slug === projectName,
    ),
  );
  console.log('Draft/private exclusion and public publication through existing contracts: OK');
  for (const width of [375, 768, 1024, 1440]) {
    for (const tab of ['basic', 'media', 'sections', 'publication']) {
      await evaluate(
        `ng.getComponent(document.querySelector('app-project-editor')).tab.set('${tab}')`,
      );
      await screenshot('editor-' + tab, width);
    }
  }

  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('media');ng.getComponent(document.querySelector('app-project-media')).group.set('GALLERY')",
  );
  for (const width of [375, 768, 1024, 1440]) await screenshot('editor-gallery', width);
  await evaluate(
    "Array.from(document.querySelectorAll('app-project-media button')).find(b=>b.textContent.includes('Elegir de biblioteca')).focus();Array.from(document.querySelectorAll('app-project-media button')).find(b=>b.textContent.includes('Elegir de biblioteca')).click()",
  );
  await until("document.querySelector('app-project-media-picker dialog')?.open");
  for (const width of [375, 768, 1024, 1440]) await screenshot('editor-library', width);
  await press('Escape', 27);
  await until("!document.querySelector('app-project-media-picker')");
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-project-editor'));c.tab.set('sections');const s=ng.getComponent(document.querySelector('app-project-sections'));s.open(s.sections()[0],s.sections()[0].section_type)})()",
  );
  await until("ng.getComponent(document.querySelector('app-section-editor'))?.loaded()");
  for (const width of [375, 768, 1024, 1440])
    await screenshot('editor-section', width, 'app-section-editor');
  await evaluate("ng.getComponent(document.querySelector('app-project-sections')).cancel()");
  await until("!document.querySelector('app-section-editor')");
  for (const path of [
    '/admin',
    '/admin/projects',
    '/admin/profile',
    '/admin/services',
    '/admin/settings',
  ]) {
    await send('Page.navigate', { url: origin + path });
    await until(
      `location.pathname===${JSON.stringify(path)} && !!document.querySelector('main h1')`,
    );
    for (const width of [375, 1440]) await screenshot(path.split('/').at(-1) || 'summary', width);
  }
  assert.equal(runtimeErrors, 0, 'No browser runtime/hydration errors');
  console.log(
    'All administrative screens and editor tabs: responsive 375/768/1024/1440, browser captures: OK',
  );
} catch (error) {
  console.error(
    'Integrated project upload smoke failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  if (error instanceof Error)
    console.error(
      error.stack
        ?.split('\n')
        .filter((line) => line.includes('admin-project-upload-browser-smoke.mjs'))
        .join('\n'),
    );
  process.exitCode = 1;
} finally {
  try {
    const tokens = await (
      await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
    ).json();
    access = tokens.access_token;
    if (!projectId) {
      const page = await api(
        'GET',
        '/admin/projects?q=' + encodeURIComponent(projectName) + '&limit=100',
      );
      projectId = page.items.find((p) => p.slug === projectName)?.id;
    }
    for (const id of [projectId, sharedProjectId].filter(Boolean)) {
      if (!(await api('GET', '/admin/projects/' + id))) continue;
      await api('PATCH', '/admin/projects/' + id, { status: 'DRAFT' });
      const relations = await api('GET', '/admin/projects/' + id + '/media?limit=100');
      for (const link of relations.items) {
        knownAssets.add(link.media_id);
        await api('DELETE', '/admin/projects/' + id + '/media/' + link.id);
      }
      for (const collection of ['sections', 'attributes']) {
        const page = await api('GET', '/admin/projects/' + id + '/' + collection + '?limit=100');
        for (const item of page.items)
          await api('DELETE', '/admin/projects/' + id + '/' + collection + '/' + item.id);
      }
      await api('DELETE', '/admin/projects/' + id);
    }
    const mediaPage = await api(
      'GET',
      '/admin/media?q=' + encodeURIComponent(testName.replace('.png', '')) + '&limit=100',
    );
    mediaPage.items.forEach((asset) => knownAssets.add(asset.id));
    for (const id of knownAssets) await api('DELETE', '/admin/media/' + id);
    for (const id of knownAssets)
      assert.equal(await api('GET', '/admin/media/' + id), null, 'Asset cleanup verified');
    for (const id of [projectId, sharedProjectId].filter(Boolean))
      assert.equal(await api('GET', '/admin/projects/' + id), null, 'Project cleanup verified');
    console.log(
      'API cleanup: temporary projects soft-deleted, references/media removed, API cleanup verified: OK',
    );
    await fetch('http://localhost:8000/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
  } catch {
    console.error('Cleanup requires local inspection');
    process.exitCode = 1;
  }
  for (const call of pending.values()) clearTimeout(call.timer);
  socket?.close();
  browser.kill();
}
