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
const profile = new URL('../.tools/project-browser-profile-' + Date.now() + '/', import.meta.url);
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
  assert.ok(r2.putOk >= 1, 'Successful R2 response');
  assert.ok(r2.options >= 1, 'Browser R2 preflight occurred');
  assert.equal(r2.authorization, false, 'No administrative credentials to R2');
  assert.equal(r2.origin, true, 'Correct browser Origin');
  console.log(
    'FastAPI presign + real refresh → browser OPTIONS/PUT R2 → confirm: OK; no JWT to R2',
  );
  verify('present');
  const putBeforeAssociation = r2.puts;
  async function fill(selector, value, event = 'input') {
    await evaluate(
      '(()=>{const e=document.querySelector(' +
        JSON.stringify(selector) +
        ');e.value=' +
        JSON.stringify(value) +
        ';e.dispatchEvent(new Event(' +
        JSON.stringify(event) +
        ',{bubbles:true}));})()',
    );
  }
  async function clickText(selector, text) {
    await evaluate(
      'Array.from(document.querySelectorAll(' +
        JSON.stringify(selector) +
        ')).find(e=>e.textContent.includes(' +
        JSON.stringify(text) +
        ')).click()',
    );
  }
  await evaluate('document.querySelector(\'.desktop-sidebar a[href="/admin/projects"]\').click()');
  await until(
    "!!document.querySelector('app-project-list') && !document.querySelector('.project-list')?.getAttribute('aria-busy')?.includes('true')",
  );
  await clickText('app-project-list a', 'Crear proyecto');
  await until("!!document.querySelector('#project-title')");
  await fill('#project-title', projectName);
  await fill('#project-slug', projectName);
  await fill('#project-visibility', 'PRIVATE', 'change');
  await evaluate("document.querySelector('#project-save').click()");
  await until(
    "location.pathname.endsWith('/edit') && !!document.querySelector('app-project-taxonomy .choices')",
  );
  projectId = await evaluate("ng.getComponent(document.querySelector('app-project-editor')).id");
  await fill('[formcontrolname="location"]', 'Ciudad de prueba');
  await fill('[formcontrolname="year"]', '2026');
  await fill('[formcontrolname="area_m2"]', '123.45');
  await evaluate("document.querySelector('#project-save').click()");
  await until(
    "ng.getComponent(document.querySelector('app-project-editor')).success().includes('guardado') && !ng.getComponent(document.querySelector('app-project-editor')).saving()",
  );
  console.log('Real project create/edit: OK');
  // Create global classification in its dedicated page, then return to assign it.
  await evaluate('document.querySelector(\'.desktop-sidebar a[href="/admin/taxonomy"]\').click()');
  await until("!!document.querySelector('app-taxonomy-page form')");
  for (const kind of ['categories', 'tags']) {
    await fill('app-taxonomy-page [formcontrolname="kind"]', kind, 'change');
    await fill('#taxon-name', projectName);
    await evaluate("document.querySelector('app-taxonomy-page form').requestSubmit()");
    await until(
      'ng.getComponent(document.querySelector("app-taxonomy-page")).available()[' +
        JSON.stringify(kind) +
        '].some(t=>t.slug===' +
        JSON.stringify(projectName) +
        ')',
    );
    const id = await evaluate(
      'ng.getComponent(document.querySelector("app-taxonomy-page")).available()[' +
        JSON.stringify(kind) +
        '].find(t=>t.slug===' +
        JSON.stringify(projectName) +
        ').id',
    );
    if (kind === 'categories') categoryId = id;
    else tagId = id;
  }
  await evaluate(
    'ng.getComponent(document.querySelector("app-admin-layout")).router.navigateByUrl(' +
      JSON.stringify('/admin/projects/' + projectId + '/edit') +
      ')',
  );
  await until("!!document.querySelector('app-project-taxonomy .choices')");
  assert.equal(await evaluate("!!document.querySelector('app-project-taxonomy form')"), false);
  for (const [index, label] of [
    [0, 'Guardar categorías'],
    [1, 'Guardar etiquetas'],
  ]) {
    await evaluate(
      'Array.from(document.querySelectorAll("app-project-taxonomy section"))[' +
        index +
        '].querySelectorAll("label").forEach(e=>{if(e.textContent.includes(' +
        JSON.stringify(projectName) +
        '))e.querySelector("input").click()})',
    );
    await clickText('app-project-taxonomy button', label);
    await until("!ng.getComponent(document.querySelector('app-project-taxonomy')).busy()");
  }
  await fill('#attribute-label', 'Autor de prueba');
  await fill('#attribute-value', 'Equipo de prueba');
  await evaluate("document.querySelector('app-project-attributes form').requestSubmit()");
  await until(
    "ng.getComponent(document.querySelector('app-project-attributes')).items().length===1",
  );
  await fill('#attribute-label', 'Tipología');
  await fill('#attribute-value', 'Desarrollo');
  await evaluate("document.querySelector('app-project-attributes form').requestSubmit()");
  await until(
    "ng.getComponent(document.querySelector('app-project-attributes')).items().length===2",
  );
  await evaluate(
    "document.querySelectorAll('app-project-attributes .relation-row')[1].querySelector('button').click()",
  );
  await until(
    "ng.getComponent(document.querySelector('app-project-attributes')).items()[0].label==='Tipología' && !ng.getComponent(document.querySelector('app-project-attributes')).busy()",
  );
  console.log('Real category/tag assignment and attribute/order persistence: OK');
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('gallery')",
  );
  await clickText('app-project-media button', 'Reutilizar de la biblioteca');
  await until("document.querySelector('app-project-media-picker dialog')?.open");
  await fill('app-project-media-picker [formcontrolname="q"]', testName);
  await evaluate("document.querySelector('app-project-media-picker form').requestSubmit()");
  await until(
    'Array.from(document.querySelectorAll("app-project-media-picker .relation-row")).some(e=>e.textContent.includes(' +
      JSON.stringify(testName) +
      '))',
  );
  await evaluate(
    'Array.from(document.querySelectorAll("app-project-media-picker .relation-row")).find(e=>e.textContent.includes(' +
      JSON.stringify(testName) +
      ')).querySelector(".name+button").click()',
  );
  await until("!!document.querySelector('#project-media-attach')");
  await fill('app-project-media .relation-row select', 'COVER', 'change');
  await evaluate("document.querySelector('#project-media-attach').click()");
  await until(
    "ng.getComponent(document.querySelector('app-project-media')).links().some(l=>l.role==='COVER')",
  );
  await evaluate(
    "document.querySelector('app-project-media app-media-preview .preview button').click()",
  );
  await until("document.querySelector('app-project-media img')?.naturalWidth>0");
  assert.equal(r2.puts, putBeforeAssociation, 'Association must not upload');
  assert.equal(r2.authorization, false, 'Private preview must not leak JWT');
  console.log('Existing media selection / atomic cover / authorized preview / NO extra PUT: OK');
  for (const role of ['GALLERY', 'PLAN']) {
    await evaluate(
      `(()=>{const media=ng.getComponent(document.querySelector('app-project-media'));media.choose(media.assets()[${JSON.stringify(uploadedId)}]);})()`,
    );
    await fill('app-project-media .relation-row select', role, 'change');
    await evaluate("document.querySelector('#project-media-attach').click()");
    await until(
      `ng.getComponent(document.querySelector('app-project-media')).links().some(l=>l.role===${JSON.stringify(role)}) && !ng.getComponent(document.querySelector('app-project-media')).busy()`,
    );
  }
  await evaluate(
    "Array.from(document.querySelectorAll('app-project-media .project-media-card')).at(-1).querySelector('button[aria-label=\"Subir archivo\"]').click()",
  );
  await until(
    "ng.getComponent(document.querySelector('app-project-media')).links()[1].role==='PLAN' && !ng.getComponent(document.querySelector('app-project-media')).busy()",
  );
  assert.equal(r2.puts, putBeforeAssociation, 'Reordering must not upload');
  console.log('Real media roles and final ordering: OK');
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
        'document.documentElement.scrollWidth<=innerWidth && document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth',
      ),
      true,
      'Project responsive overflow',
    );
    await evaluate(
      "document.querySelectorAll('.user-details').forEach(e=>e.style.visibility='hidden')",
    );
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      new URL('../.tools/project-' + width + '.png', import.meta.url),
      Buffer.from(shot.data, 'base64'),
    );
  }
  await evaluate('globalThis.__projectSmokeReloading=true');
  await send('Page.reload');
  await until(
    "!globalThis.__projectSmokeReloading && !!document.querySelector('#project-title') && !!document.querySelector('app-project-media app-media-preview')",
  );
  assert.equal(
    await evaluate('document.querySelector(\'[formcontrolname="location"]\').value'),
    'Ciudad de prueba',
  );
  assert.equal(
    await evaluate('document.querySelector(\'[formcontrolname="area_m2"]\').value'),
    '123.45',
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-taxonomy')).selection().categories.length",
    ),
    1,
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-taxonomy')).selection().tags.length",
    ),
    1,
  );
  await fill('#project-status', 'PUBLISHED', 'change');
  await fill('#project-visibility', 'UNLISTED', 'change');
  await evaluate("document.querySelector('#project-save').click()");
  await until(
    "ng.getComponent(document.querySelector('app-project-editor')).project()?.status==='PUBLISHED' && !ng.getComponent(document.querySelector('app-project-editor')).saving()",
  );
  assert.equal(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-editor')).project().visibility",
    ),
    'UNLISTED',
  );
  assert.ok(
    await evaluate(
      "ng.getComponent(document.querySelector('app-project-editor')).project().published_at",
    ),
  );
  console.log('Reload persisted data / published image-cover rule / UNLISTED: OK');
  await evaluate('document.querySelector(\'.desktop-sidebar a[href="/admin/projects"]\').click()');
  await until("!!document.querySelector('app-project-list')");
  await fill('#project-search', projectName);
  await fill('app-project-list [formcontrolname="status"]', 'PUBLISHED', 'change');
  await fill('app-project-list [formcontrolname="is_featured"]', 'false', 'change');
  await evaluate("document.querySelector('app-project-list form').requestSubmit()");
  await until(
    'ng.getComponent(document.querySelector("app-project-list")).page()?.items.length===1 && ng.getComponent(document.querySelector("app-project-list")).page()?.items[0].slug===' +
      JSON.stringify(projectName) +
      ' && location.search.includes("status=PUBLISHED")',
  );
  await evaluate("document.querySelector('.project-row .button').click()");
  await until(
    "!!document.querySelector('#project-title') && !!document.querySelector('app-project-media app-media-preview')",
  );
  console.log('Real server search / status / featured filters and edit navigation: OK');
  await fill('#project-title', projectName + ' modified');
  await evaluate('document.querySelector(\'.desktop-sidebar a[href="/admin/projects"]\').click()');
  await until("document.querySelector('app-project-confirm dialog')?.open");
  await press('Escape', 27);
  await until("!document.querySelector('app-project-confirm')");
  assert.equal(
    await evaluate("location.pathname.endsWith('/edit')"),
    true,
    'Escape keeps unsaved editor',
  );
  await evaluate("document.querySelector('#project-save').click()");
  await until("!ng.getComponent(document.querySelector('app-project-editor')).saving()");
  // Remove only smoke-owned relations before soft deletion, respecting reference rules.
  await evaluate(
    `(async()=>{const api=ng.getComponent(document.querySelector('app-project-editor')).api;const one=o=>new Promise((resolve,reject)=>o.subscribe({next:resolve,error:()=>reject(new Error('cleanup API')),complete:resolve}));await one(api.update(${JSON.stringify(projectId)},{status:'DRAFT'}));for(const k of ['categories','tags'])await one(api.assign(${JSON.stringify(projectId)},k,[]));const attrs=await one(api.attributes(${JSON.stringify(projectId)}));for(const a of attrs.items)await one(api.deleteAttribute(${JSON.stringify(projectId)},a.id));const links=await one(api.media(${JSON.stringify(projectId)}));for(const l of links.items)await one(api.detach(${JSON.stringify(projectId)},l.id));})()`,
  );
  await clickText('app-project-editor button', 'Eliminar proyecto');
  await until("document.querySelector('app-project-confirm dialog')?.open");
  await clickText('app-project-confirm button', 'Eliminar');
  await until(
    "location.pathname==='/admin/projects' && !!document.querySelector('app-project-list')",
  );
  const missing = await evaluate(
    `(async()=>{const api=ng.getComponent(document.querySelector('app-project-list')).api;return await new Promise(resolve=>api.detail(${JSON.stringify(projectId)}).subscribe({next:()=>resolve(false),error:e=>resolve(e.status===404)}));})()`,
  );
  assert.equal(missing, true, 'Soft-deleted project hidden');
  console.log('Unsaved changes / accessible confirmation / soft delete: OK');
  assert.equal(runtimeErrors, 0, 'Browser runtime errors');
  assert.equal(
    domainRequests,
    0,
    'Project regression smoke performs no section writes or unrelated domain calls',
  );
} catch (error) {
  console.error(
    'Project browser smoke failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      await evaluate(
        `(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(!auth?.session.accessToken)throw new Error('Cleanup session missing');const headers={Authorization:'Bearer '+auth.session.accessToken,'Content-Type':'application/json'};const request=async(method,path,body)=>{const r=await fetch('/api/v1/admin'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok&&r.status!==404)throw new Error('Cleanup status');return r.status===204||r.status===404?null:r.json();};const id=${JSON.stringify(projectId ?? null)};if(id){const p=await request('GET','/projects/'+id);if(p){await request('PATCH','/projects/'+id,{status:'DRAFT'});for(const k of ['categories','tags'])await request('PUT','/projects/'+id+'/'+k,{ids:[]});for(const k of ['attributes','media']){const page=await request('GET','/projects/'+id+'/'+k+'?limit=100');for(const item of page.items)await request('DELETE','/projects/'+id+'/'+k+'/'+item.id);}await request('DELETE','/projects/'+id);}}for(const [k,id] of [['categories',${JSON.stringify(categoryId ?? null)}],['tags',${JSON.stringify(tagId ?? null)}],['media',${JSON.stringify(uploadedId ?? null)}]])if(id)await request('DELETE','/'+k+'/'+id);if(id&&await request('GET','/projects/'+id))throw new Error('Project cleanup failed');})()`,
      );
      console.log('API cleanup: soft-deleted project, removed relations/taxonomy/media: OK');
    } catch {
      console.error('Project cleanup requires local inspection');
      process.exitCode = 1;
    }
    await evaluate(
      "(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(auth)await new Promise(resolve=>auth.logout().subscribe({next:resolve,error:resolve,complete:resolve}));})()",
    ).catch(() => {});
  }
  try {
    verify('clean');
  } catch {
    console.error('R2/PostgreSQL smoke cleanup requires inspection');
    process.exitCode = 1;
  }
  for (const call of pending.values()) clearTimeout(call.timer);
  socket?.close();
  browser.kill();
}
