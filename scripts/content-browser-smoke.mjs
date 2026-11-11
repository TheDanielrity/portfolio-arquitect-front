// Repeatable development-only browser smoke using Chrome DevTools Protocol.
// No test framework, auth dependency, credentials or tokens in console output.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.env['AUTH_SMOKE_FRONTEND_URL'] ?? 'http://localhost:4200';
const browserPath =
  process.env['AUTH_SMOKE_BROWSER_PATH'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const credentials = JSON.parse(
  await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
);
const profile = new URL('../.tools/content-browser-profile-' + Date.now() + '/', import.meta.url);
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

let baseline;
const assets = [];
const names = [];
const marker = 'content-smoke-' + Date.now();
const initial = JSON.parse(
  readFileSync(new URL('../.tools/content-initial.json', import.meta.url), 'utf8').replace(
    /^\uFEFF/,
    '',
  ),
);

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
        ![
          '/api/v1/admin/media',
          '/api/v1/admin/profile',
          '/api/v1/admin/services',
          '/api/v1/admin/site-settings',
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
  const profileFields = [
    'first_name',
    'last_name',
    'professional_title',
    'short_bio',
    'biography',
    'email',
    'phone',
    'location',
    'profile_media_id',
    'cv_media_id',
  ];
  async function ready(route, selector, condition) {
    await navigate(route);
    await until(`!!document.querySelector('${selector}') && ${condition}`);
  }
  const component = (selector) => `ng.getComponent(document.querySelector('${selector}'))`;
  const p = component('app-profile-page'),
    svc = component('app-services-page'),
    social = component('app-social-links'),
    settings = component('app-settings-page');
  async function api(method, path, body) {
    return evaluate(
      `(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout')).auth;const r=await fetch('/api/v1/admin'+${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{Authorization:'Bearer '+auth.session.accessToken,'Content-Type':'application/json'},body:${body === undefined ? 'undefined' : JSON.stringify(JSON.stringify(body))}});if(r.status===404)return null;if(!r.ok)throw new Error('Smoke API failed');return r.status===204?null:r.json();})()`,
    );
  }
  await ready('/admin/profile', 'app-profile-page', `${p}.state()!=='loading'`);
  if (await evaluate(`${p}.state()==='empty'`)) {
    await fill('#profile-first_name', initial.first_name);
    await fill('#profile-last_name', initial.last_name);
    await click('#profile-save', 'Guardar');
    await until(`${p}.state()==='ready' && !${p}.saving()`);
  }
  const profileBefore = await api('GET', '/profile');
  baseline = {
    profile: Object.fromEntries(profileFields.map((k) => [k, profileBefore[k] ?? null])),
    settings: await api('GET', '/site-settings'),
    socials: (await api('GET', '/profile/social-links?limit=100')).items,
    services: (await api('GET', '/services?limit=100')).items,
  };
  await ready('/admin/settings', 'app-settings-page', `${settings}.loaded()`);
  for (const [key, selector, value] of [
    ['site_title', '#setting-title', initial.site_title],
    ['site_description', '#setting-description', initial.site_description],
  ]) {
    if (!baseline.settings.some((x) => x.key === key)) {
      await fill(selector, value);
      await evaluate(`document.querySelector('${selector}').closest('form').requestSubmit()`);
      await until(`${settings}.configured().includes('${key}') && !${settings}.saving()`);
      baseline.settings.push(await api('GET', '/site-settings/' + key));
    }
  }
  await writeFile(
    new URL('../.tools/content-baseline-' + Date.now() + '.json', import.meta.url),
    JSON.stringify(baseline, null, 2),
  );
  console.log('Real initial profile/settings established; baseline retained for restoration: OK');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0n8AAAAASUVORK5CYII=',
    'base64',
  );
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, body] of [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ].entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf +=
    'xref\n0 5\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  for (const [extension, data] of [
    ['png', png],
    ['pdf', Buffer.from(pdf)],
  ]) {
    const name = testName.replace('.png', '.' + extension);
    names.push(name);
    const file = new URL('../.tools/' + name, import.meta.url);
    await writeFile(file, data);
    await ready('/admin/media', 'app-media-page', `!!document.querySelector('#media-file')`);
    const doc = await send('DOM.getDocument');
    const found = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#media-file',
    });
    await send('DOM.setFileInputFiles', { nodeId: found.nodeId, files: [fileURLToPath(file)] });
    await until(
      "!!document.querySelector('app-media-upload button.primary') && !document.querySelector('app-media-upload button.primary').disabled",
    );
    await click('app-media-upload button', 'Subir archivo');
    await until(
      "ng.getComponent(document.querySelector('app-media-page')).upload.stage()==='completed'",
    );
    assets.push(
      await evaluate("ng.getComponent(document.querySelector('app-media-page')).upload.asset().id"),
    );
    verify('present', name);
  }
  const putsBefore = r2.puts;
  await ready(
    '/admin/profile',
    'app-profile-page',
    `${p}.state()==='ready' && !!document.querySelector('app-social-links') && !${social}.loading()`,
  );
  await fill('#profile-professional_title', marker);
  for (const [index, label] of [
    [0, 'Seleccionar fotografía'],
    [1, 'Seleccionar cv'],
  ]) {
    await click('app-profile-page button', label);
    await until(
      "document.querySelector('app-project-media-picker dialog')?.open && !ng.getComponent(document.querySelector('app-project-media-picker')).busy()",
    );
    await fill('app-project-media-picker input', names[index]);
    await evaluate("document.querySelector('app-project-media-picker form').requestSubmit()");
    await until(
      `!ng.getComponent(document.querySelector('app-project-media-picker')).busy() && ng.getComponent(document.querySelector('app-project-media-picker')).page().items.some(x=>x.id==='${assets[index]}')`,
    );
    await click('app-project-media-picker button', 'Seleccionar ' + names[index]);
    await until("!document.querySelector('app-project-media-picker')");
  }
  await click('#profile-save', 'Guardar');
  await until(`${p}.notice() && !${p}.saving()`);
  for (const id of assets)
    assert.equal(
      await evaluate(
        `(async()=>{const a=${p}.mediaApi;return await new Promise(resolve=>a.delete('${id}').subscribe({next:()=>resolve(204),error:e=>resolve(e.status)}));})()`,
      ),
      409,
    );
  await click('app-profile-page app-media-preview button', 'Ver imagen');
  await until("!!document.querySelector('app-profile-page app-media-preview img')");
  await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: fileURLToPath(new URL('../.tools/', import.meta.url)),
  });
  await click('app-profile-page app-media-preview button', 'Descargar archivo');
  await until(
    "!Array.from(document.querySelectorAll('app-media-preview')).some(e=>ng.getComponent(e).loading())",
  );
  await ready(
    '/admin/profile',
    'app-profile-page',
    `${p}.state()==='ready' && !${p}.mediaBusy() && !!document.querySelector('app-social-links') && !${social}.loading()`,
  );
  assert.equal(await evaluate(`${p}.form.controls.professional_title.value`), marker);
  assert.equal(await evaluate(`${p}.form.controls.cv_media_id.value`), assets[1]);
  for (const suffix of ['a', 'b']) {
    await click('app-social-links button', 'Añadir enlace');
    await until("!!document.querySelector('app-social-links form')");
    await fill('app-social-links [formControlName=platform]', marker + '-' + suffix);
    await fill('app-social-links [formControlName=url]', 'https://example.test/' + suffix);
    await click('app-social-links button', 'Guardar enlace');
    await until(
      `!${social}.writing() && !${social}.editing() && ${social}.items().some(i=>i.platform==='${marker}-${suffix}')`,
    );
  }
  async function row(selector, name, button) {
    await evaluate(
      `(()=>{const row=Array.from(document.querySelectorAll('${selector} .content-row')).find(e=>e.textContent.includes('${name}'));Array.from(row.querySelectorAll('button')).find(e=>e.textContent.includes('${button}')).click();})()`,
    );
  }
  await row('app-social-links', marker + '-b', 'Editar enlace');
  await fill('app-social-links [formControlName=username]', 'updated');
  await click('app-social-links button', 'Guardar enlace');
  await until(`!${social}.writing() && !${social}.editing()`);
  await row('app-social-links', marker + '-b', 'Subir enlace');
  await until(`!${social}.writing() && !${social}.loading()`);
  await row('app-social-links', marker + '-b', 'Ocultar');
  await until(`!${social}.writing()`);
  await fill('#profile-short_bio', 'Unsaved smoke');
  await evaluate('document.querySelector(\'app-admin-layout a[href="/admin/services"]\').click()');
  await until("document.querySelector('app-content-leave-confirm dialog')?.open");
  await press('Escape', 27);
  await until("!document.querySelector('app-content-leave-confirm dialog')");
  assert.equal(await evaluate('location.pathname'), '/admin/profile');
  await ready('/admin/services', 'app-services-page', `!${svc}.loading()`);
  for (const suffix of ['a', 'b']) {
    await click('app-services-page button', 'Crear servicio');
    await until("!!document.querySelector('app-services-page form')");
    await fill('app-services-page [formControlName=name]', marker + '-' + suffix);
    await fill('app-services-page [formControlName=slug]', marker + '-' + suffix);
    await click('app-services-page button', 'Guardar servicio');
    await until(`!${svc}.writing() && !${svc}.editing()`);
  }
  await row('app-services-page', marker + '-b', 'Editar servicio');
  await fill('app-services-page [formControlName=description]', 'Persisted service content');
  await click('app-services-page button', 'Guardar servicio');
  await until(`!${svc}.writing() && !${svc}.editing()`);
  await row('app-services-page', marker + '-b', 'Subir servicio');
  await until(`!${svc}.writing() && !${svc}.loading()`);
  await row('app-services-page', marker + '-b', 'Ocultar');
  await until(`!${svc}.writing()`);
  await ready('/admin/services', 'app-services-page', `!${svc}.loading()`);
  assert.equal(
    await evaluate(`${svc}.items().find(i=>i.slug==='${marker}-b').description`),
    'Persisted service content',
  );
  await ready('/admin/settings', 'app-settings-page', `${settings}.loaded()`);
  for (const [selector, value] of [
    ['#setting-title', marker],
    ['#setting-description', 'Temporary validation description'],
  ]) {
    await fill(selector, value);
    await evaluate(`document.querySelector('${selector}').closest('form').requestSubmit()`);
    await until(`!${settings}.saving() && ${settings}.notice()`);
  }
  await ready('/admin/settings', 'app-settings-page', `${settings}.loaded()`);
  assert.equal(await evaluate(`${settings}.title.controls.value.value`), marker);
  assert.equal(await evaluate("document.querySelector('#setting-contact') === null"), true);
  for (const [route, selector, condition] of [
    ['/admin/profile', 'app-profile-page', `${p}.state()==='ready' && !${p}.mediaBusy()`],
    ['/admin/services', 'app-services-page', `!${svc}.loading()`],
    ['/admin/settings', 'app-settings-page', `${settings}.loaded()`],
  ]) {
    await ready(route, selector, condition);
    for (const width of [375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 950,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(100);
      const capture = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        new URL('../.tools/content-' + selector + '-' + width + '.png', import.meta.url),
        Buffer.from(capture.data, 'base64'),
      );
      assert.equal(
        await evaluate(
          'document.documentElement.scrollWidth<=document.documentElement.clientWidth',
        ),
        true,
        route + ' overflow at ' + width,
      );
      assert.equal(
        await evaluate(
          "!!document.querySelector('main') && Array.from(document.querySelectorAll('main input,main textarea,main select')).every(e=>e.labels?.length>0)",
        ),
        true,
        'Form labels',
      );
    }
  }
  assert.equal(r2.puts, putsBefore, 'Selecting existing media must not upload');
  assert.equal(r2.authorization, false);
  assert.ok(r2.options >= 2);
  assert.equal(runtimeErrors, 0);
  assert.equal(domainRequests, 0);
  console.log(
    'Profile/photo/CV, authorized previews/reference conflicts, social/service CRUD/order/visibility, typed settings, reload, dirty guard and four responsive widths: OK',
  );
} catch (error) {
  console.error(
    'Content browser smoke failed:',
    error instanceof Error ? error.message : 'Unknown',
  );
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      await evaluate(
        `(async()=>{const auth=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(!auth?.session.accessToken)throw new Error('Cleanup session unavailable');const request=async(method,path,body)=>{const r=await fetch('/api/v1/admin'+path,{method,headers:{Authorization:'Bearer '+auth.session.accessToken,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok&&r.status!==404)throw new Error('Restoration failed');return r.status===204||r.status===404?null:r.json();};const baseline=${JSON.stringify(baseline ?? null)};if(baseline){await request('PATCH','/profile',baseline.profile);for(const s of baseline.settings)await request('PUT','/site-settings/'+s.key,{value:s.value});for(const x of (await request('GET','/profile/social-links?limit=100')).items)if(x.platform.startsWith('${marker}'))await request('DELETE','/profile/social-links/'+x.id);for(const x of (await request('GET','/services?limit=100')).items)if(x.slug.startsWith('${marker}'))await request('DELETE','/services/'+x.id);for(const [path,items] of [['/profile/social-links',baseline.socials],['/services',baseline.services]])if(items.length)await request('PUT',path+'/order',{items:items.map(x=>({id:x.id,sort_order:x.sort_order}))});const restored=await request('GET','/profile');for(const [key,value] of Object.entries(baseline.profile))if(restored[key]!==value)throw new Error('Profile mismatch');for(const s of baseline.settings)if((await request('GET','/site-settings/'+s.key)).value!==s.value)throw new Error('Setting mismatch');}for(const id of ${JSON.stringify(assets)}){await request('DELETE','/media/'+id);if(await request('GET','/media/'+id))throw new Error('Media remains');}})()`,
      );
      console.log(
        'Real profile/settings retained; temporary relations/socials/services/media removed and original order restored: OK',
      );
    } catch {
      console.error('Content restoration requires local inspection');
      process.exitCode = 1;
    }
    await evaluate(
      "(async()=>{const a=ng.getComponent(document.querySelector('app-admin-layout'))?.auth;if(a)await new Promise(r=>a.logout().subscribe({next:r,error:r,complete:r}));})()",
    ).catch(() => {});
  }
  for (const name of names) {
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
