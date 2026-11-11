// Isolated fixtures only. Real Chrome + real FastAPI/R2; no credentials in output.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { convertStl } from '../src/app/shared/utils/stl-conversion.ts';
import { build } from 'esbuild';

const origin = process.env.MODEL_SMOKE_ORIGIN ?? 'http://localhost:4200';
const base = process.env.MODEL_SMOKE_API ?? 'http://localhost:8000/api/v1';
const stamp = Date.now();
const output = new URL(`../.tools/model-audit-${stamp}/`, import.meta.url);
await mkdir(output, { recursive: true });
const credentials = JSON.parse(
  await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
);
let tokens, project, browser, socket, productionServer, report;
let sequence = 0;
const pending = new Map(),
  assets = new Set();
const network = { puts: 0, putOk: 0, authLeak: false, worker: false };
let runtimeErrors = 0;
async function api(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 30000);
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
  if (result.exceptionDetails)
    throw new Error(
      'Browser: ' +
        (result.exceptionDetails.exception?.description?.split('\n')[0] ?? 'evaluation failed'),
    );
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 60000;
  for (let i = 0; i < 500 && Date.now() < deadline; i++) {
    if (await evaluate(expression).catch(() => false)) return;
    await delay(100);
  }
  throw new Error('Condition timed out: ' + expression);
}
async function selectFile(file) {
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#section-upload-file',
  });
  await send('DOM.setFileInputFiles', { nodeId, files: [fileURLToPath(file)] });
}
async function upload(name, mime, bytes) {
  const authorization = await api('POST', '/admin/media/uploads/presign', {
    original_filename: name,
    mime_type: mime,
    file_size: bytes.length,
    access: 'public',
  });
  assert.equal(authorization.provider, 'r2', 'This smoke requires real R2 configuration');
  const put = await fetch(authorization.upload_url, {
    method: 'PUT',
    headers: authorization.headers,
    body: bytes,
  });
  assert.ok(put.ok, 'Fixture R2 PUT failed');
  const asset = await api('POST', '/admin/media/uploads/confirm', {
    upload_id: authorization.upload_id,
  });
  assets.add(asset.id);
  return asset;
}
function architecturalStl() {
  const triangles = [];
  const box = (x, y, z, w, h, d) => {
    const p = [
      [x, y, z],
      [x + w, y, z],
      [x + w, y + h, z],
      [x, y + h, z],
      [x, y, z + d],
      [x + w, y, z + d],
      [x + w, y + h, z + d],
      [x, y + h, z + d],
    ];
    for (const [a, b, c] of [
      [0, 2, 1],
      [0, 3, 2],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [3, 7, 6],
      [3, 6, 2],
      [0, 4, 7],
      [0, 7, 3],
      [1, 2, 6],
      [1, 6, 5],
    ])
      triangles.push(
        `facet normal 0 0 0\nouter loop\n${[a, b, c].map((i) => 'vertex ' + p[i].join(' ')).join('\n')}\nendloop\nendfacet`,
      );
  };
  box(-30, 0, -12, 60, 0.7, 24);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 7; col++) {
      const x = -26 + col * 8,
        z = -9 + row * 8,
        height = 6 + (col % 3) * 2;
      box(x, 0.7, z, 5, height, 4);
      box(x + 0.7, 0.7 + height, z + 0.7, 3.6, 0.7, 2.6);
    }
  return `solid technical-fixture\n${triangles.join('\n')}\nendsolid technical-fixture`;
}
function nativeGlb(source) {
  const jsonSize = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonSize).toString());
  delete json.asset.extras;
  json.asset.generator = 'Native GLB regression fixture';
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
  encoded.copy(padded);
  const binary = source.subarray(28 + jsonSize);
  const result = Buffer.alloc(28 + padded.length + binary.length);
  result.write('glTF');
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + padded.length);
  result.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(result, 28 + padded.length);
  return result;
}
async function capture(name, width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await evaluate("document.querySelector('.section-model_3d').scrollIntoView({block:'start'})");
  await delay(700);
  const image = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL(name + '.png', output), Buffer.from(image.data, 'base64'));
  assert.equal(
    await evaluate('document.documentElement.scrollWidth<=innerWidth'),
    true,
    'Horizontal overflow',
  );
}
try {
  tokens = await api('POST', '/auth/login', credentials);
  project = await api('POST', '/admin/projects', {
    title: 'Temporary architectural model audit',
    slug: 'model-audit-' + stamp,
    status: 'DRAFT',
    visibility: 'UNLISTED',
  });
  const cover = await upload(
    `model-audit-${stamp}.jpg`,
    'image/jpeg',
    await readFile(new URL('../public/images/foundation-study.jpg', import.meta.url)),
  );
  await api('PUT', `/admin/projects/${project.id}/cover`, { media_id: cover.id });
  const stlText = architecturalStl();
  const sourceFile = new URL('architectural-fixture.stl', output);
  await writeFile(sourceFile, stlText);
  const raw = convertStl(new TextEncoder().encode(stlText).buffer);
  const compiled = await build({
    entryPoints: ['src/app/shared/utils/glb-compression.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { compressPortfolioGlb } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].contents).toString('base64')
  );
  const expected = Buffer.from(await compressPortfolioGlb(raw));

  const profile = new URL('chrome/', output);
  await mkdir(profile);
  browser = spawn(
    process.env.MODEL_SMOKE_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    [
      '--headless=new',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + fileURLToPath(profile),
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
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
  assert.ok(port, 'Chrome did not start');
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
      if (message.error) call.reject(new Error('CDP: ' + message.error.message));
      else call.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') runtimeErrors++;
    else if (message.method === 'Network.requestWillBeSent') {
      const r = message.params.request;
      if (r.url.includes('worker')) network.worker = true;
      if (r.url.includes('.r2.cloudflarestorage.com')) {
        if (r.method === 'PUT') network.puts++;
        network.authLeak ||= Object.keys(r.headers).some((k) => /authorization|refresh/i.test(k));
      }
    } else if (message.method === 'Network.responseReceived') {
      const r = message.params.response;
      if (
        r.url.includes('.r2.cloudflarestorage.com') &&
        r.status === 200 &&
        message.params.type === 'XHR'
      )
        network.putOk++;
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: origin + '/admin/projects/' + project.id + '/edit' });
  await until("!!document.querySelector('#email')");
  await evaluate(
    `(()=>{for(const [id,value] of Object.entries(${JSON.stringify(credentials)})){const input=document.getElementById(id);if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}}document.querySelector('form').requestSubmit()})()`,
  );
  await until("location.pathname==='/admin'");
  await send('Page.navigate', { url: origin + '/admin/projects/' + project.id + '/edit' });
  await until(
    "!!globalThis.ng?.getComponent(document.querySelector('app-project-editor'))?.project()",
  );
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-editor')).tab.set('sections')",
  );
  await until("!ng.getComponent(document.querySelector('app-project-sections')).loading()");
  // Exercise the real, user-visible MODEL_3D option and the inline file input.
  await evaluate(
    "(()=>{const select=document.querySelector('app-project-sections .actions select');select.value='MODEL_3D';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('app-project-sections .actions button').click()})()",
  );
  await until("!!document.querySelector('#section-upload-file')");
  assert.ok(
    (await evaluate("document.querySelector('#section-upload-file').accept")).includes('.stl'),
  );
  await selectFile(sourceFile);
  await until(
    "['completed','failed'].includes(ng.getComponent(document.querySelector('app-section-editor')).upload.stage())",
  );
  const status = await evaluate(
    "(()=>{const u=ng.getComponent(document.querySelector('app-section-editor')).upload;return {stage:u.stage(),error:u.error(),asset:u.asset()?.id}})()",
  );
  assert.equal(status.stage, 'completed', status.error);
  assets.add(status.asset);
  const result = await api('GET', '/admin/media/' + status.asset);
  assert.equal(result.mime_type, 'model/gltf-binary');
  assert.equal(result.file_size, expected.length);
  assert.ok(result.original_filename.endsWith('.glb'));
  const redirect = await fetch(base + '/admin/media/' + result.id + '/content', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    redirect: 'manual',
  });
  assert.equal(redirect.status, 307);
  const actual = Buffer.from(await (await fetch(redirect.headers.get('location'))).arrayBuffer());
  assert.deepEqual(actual, expected, 'R2 bytes differ from worker output');
  await api('PATCH', '/admin/media/' + result.id, { title: 'Conjunto · STL' });
  await evaluate("document.querySelector('#section-save').click()");
  await until("!document.querySelector('app-section-editor')");
  await evaluate("ng.getComponent(document.querySelector('app-project-editor')).save()");
  await until("!ng.getComponent(document.querySelector('app-project-editor')).saving()");
  const sections = await api('GET', `/admin/projects/${project.id}/sections?limit=100`);
  assert.ok(
    sections.items.some((s) => s.section_type === 'MODEL_3D'),
    'Section association was not persisted',
  );
  assert.equal(network.puts, 1);
  assert.equal(network.putOk, 1);
  assert.equal(network.authLeak, false);
  console.log(
    'Chrome worker → actual GLB → signed R2 PUT → confirm → saved MODEL_3D association: OK',
  );

  // Upload the same valid GLB natively through the same actual browser input: no conversion.
  const glbFile = new URL('native-fixture.glb', output);
  await writeFile(glbFile, nativeGlb(Buffer.from(raw)));
  await until("!ng.getComponent(document.querySelector('app-project-sections')).busy()");
  await evaluate(
    "ng.getComponent(document.querySelector('app-project-sections')).open(null,'MODEL_3D')",
  );
  await until("!!document.querySelector('#section-upload-file')");
  await selectFile(glbFile);
  await until(
    "ng.getComponent(document.querySelector('app-section-editor')).upload.stage()==='completed'",
  );
  const nativeId = await evaluate(
    "ng.getComponent(document.querySelector('app-section-editor')).upload.asset().id",
  );
  assets.add(nativeId);
  await api('PATCH', '/admin/media/' + nativeId, { title: 'Maqueta · GLB' });
  await evaluate("document.querySelector('#section-save').click()");
  await until("!document.querySelector('app-section-editor')");
  await evaluate("ng.getComponent(document.querySelector('app-project-editor')).save()");
  await until("!ng.getComponent(document.querySelector('app-project-editor')).saving()");
  await api('PATCH', `/admin/projects/${project.id}`, { status: 'PUBLISHED' });
  productionServer = spawn(process.execPath, ['dist/architecture-portfolio/server/server.mjs'], {
    env: { ...process.env, PORT: '4303', API_BASE_URL: base, DISABLE_INDEXING: 'true' },
    stdio: 'ignore',
    windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch('http://localhost:4303/healthz')).ok;
    } catch {
      /* Starting SSR. */
    }
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'SSR server did not start');
  const ssr = await fetch('http://localhost:4303/projects/' + project.slug);
  assert.equal(ssr.status, 200);
  const html = await ssr.text();
  assert.ok(html.includes('Maqueta digital / 3D'));
  assert.doesNotMatch(html, /<model-viewer[\s>]/);
  console.log('Production SSR with real converted model: OK; viewer remains deferred');
  await send('Page.navigate', { url: origin + '/projects/' + project.slug });
  await until("!!document.querySelector('app-public-model')");
  await evaluate("document.querySelector('app-public-model').scrollIntoView({block:'center'})");
  assert.equal(
    await evaluate("document.querySelectorAll('app-public-model .model-selector button').length"),
    0,
  );
  await until(
    "document.querySelector('model-viewer')?.loaded===true && !ng.getComponent(document.querySelector('app-public-model')).loading()",
  );
  assert.equal(await evaluate("document.querySelectorAll('app-public-model .activate').length"), 0);
  const metrics = await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-public-model'));return {dimensions:c.dimensions(),triangles:c.triangles(),unitless:c.unitless()}})()",
  );
  assert.equal(metrics.triangles, 516);
  assert.equal(metrics.unitless, true);
  assert.ok(metrics.dimensions.includes(' u'));
  console.log('Public GLB loaded; actual bounding box / 516 triangles / unitless STL: OK');
  for (const [width, height] of [
    [1920, 1080],
    [1440, 1000],
    [768, 1024],
    [390, 844],
  ])
    await capture('viewer-' + width, width, height);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate("document.querySelector('app-public-model').scrollIntoView()");
  const before = await evaluate("document.querySelector('model-viewer').getCameraOrbit().theta");
  await evaluate(
    'document.querySelector(\'app-public-model [aria-label="Girar a la derecha"]\').click()',
  );
  await delay(400);
  assert.notEqual(
    await evaluate("document.querySelector('model-viewer').getCameraOrbit().theta"),
    before,
  );
  const radius = await evaluate("document.querySelector('model-viewer').getCameraOrbit().radius");
  await evaluate("document.querySelector('app-public-model [aria-label=Acercar]').click()");
  await delay(400);
  assert.ok(
    (await evaluate("document.querySelector('model-viewer').getCameraOrbit().radius")) < radius,
  );
  await evaluate("document.querySelector('model-viewer').focus()");
  const keyTheta = await evaluate("document.querySelector('model-viewer').getCameraOrbit().theta");
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowRight',
    code: 'ArrowRight',
    windowsVirtualKeyCode: 39,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowRight',
    code: 'ArrowRight',
    windowsVirtualKeyCode: 39,
  });
  await delay(300);
  assert.notEqual(
    await evaluate("document.querySelector('model-viewer').getCameraOrbit().theta"),
    keyTheta,
    'Keyboard did not rotate model',
  );
  await evaluate(
    "[...document.querySelectorAll('app-public-model .model-controls button')].find(b=>b.textContent==='Restablecer').click()",
  );
  await evaluate(
    "document.querySelectorAll('app-public-model')[1].scrollIntoView({block:'center'})",
  );
  await until(
    "document.querySelectorAll('app-public-model')[1]?.querySelector('model-viewer')?.loaded===true && !ng.getComponent(document.querySelectorAll('app-public-model')[1]).unitless()",
  );
  await evaluate("document.querySelector('model-viewer').dispatchEvent(new Event('error'))");
  await until("!!document.querySelector('app-public-model .activate')");
  assert.ok(
    (await evaluate("document.querySelector('app-public-model .activate').textContent")).includes(
      'Reintentar',
    ),
  );
  await evaluate("document.querySelector('app-public-model .activate').click()");
  await until("document.querySelector('app-public-model model-viewer')?.loaded===true");
  if (await evaluate('document.fullscreenEnabled')) {
    await evaluate(
      'document.querySelector(\'app-public-model [aria-label="Alternar pantalla completa"]\').click()',
    );
    await until("document.fullscreenElement?.tagName==='APP-PUBLIC-MODEL'");
    await evaluate('document.exitFullscreen()');
    await until('!document.fullscreenElement');
  }
  // Mouse and touch events go to the actual canvas interaction surface.
  await evaluate(
    "document.querySelector('app-public-model model-viewer').scrollIntoView({block:'center'})",
  );
  await delay(700);
  const rect = await evaluate(
    "(()=>{const r=document.querySelector('model-viewer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
  );
  const mouseTheta = await evaluate(
    "document.querySelector('model-viewer').getCameraOrbit().theta",
  );
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...rect,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...rect,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: rect.x + 80,
    y: rect.y,
    button: 'left',
    buttons: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: rect.x + 80,
    y: rect.y,
    button: 'left',
  });
  await delay(300);
  assert.notEqual(
    await evaluate("document.querySelector('model-viewer').getCameraOrbit().theta"),
    mouseTheta,
    'Mouse did not rotate model',
  );
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touchTheta = await evaluate(
    "document.querySelector('model-viewer').getCameraOrbit().theta",
  );
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rect] });
  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: rect.x + 50, y: rect.y }],
  });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(300);
  assert.notEqual(
    await evaluate("document.querySelector('model-viewer').getCameraOrbit().theta"),
    touchTheta,
    'Touch did not rotate model',
  );
  const pinchRadius = await evaluate(
    "document.querySelector('model-viewer').getCameraOrbit().radius",
  );
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: rect.x - 40, y: rect.y, id: 1 },
      { x: rect.x + 40, y: rect.y, id: 2 },
    ],
  });
  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: rect.x - 80, y: rect.y, id: 1 },
      { x: rect.x + 80, y: rect.y, id: 2 },
    ],
  });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(300);
  assert.notEqual(
    await evaluate("document.querySelector('model-viewer').getCameraOrbit().radius"),
    pinchRadius,
    'Pinch did not zoom model',
  );
  await evaluate(
    "(()=>{const c=ng.getComponent(document.querySelector('app-public-model'));c.fail();c.webglAvailable=()=>false;return c.open()})()",
  );
  await until(
    "document.querySelector('app-public-model').textContent.includes('no admite WebGL 2')",
  );
  assert.ok(await evaluate("!!document.querySelector('app-public-model a[href]')"));
  assert.equal(runtimeErrors, 0);
  report = { metrics, network, runtimeErrors };
  console.log(
    'GLB regression / automatic loading / single section model / camera / keyboard / mouse / touch / retry / WebGL fallback / responsive: OK',
  );
  console.log('Visual artifacts: ' + fileURLToPath(output));
} catch (error) {
  console.error('Model smoke failed: ' + error.message);
  process.exitCode = 1;
} finally {
  // Only this run's unique fixture is changed. Never touch user projects.
  try {
    if (tokens)
      tokens = await api('POST', '/auth/refresh', { refresh_token: tokens.refresh_token });
    if (project) {
      await api('PATCH', `/admin/projects/${project.id}`, { status: 'DRAFT' });
      const sections = await api('GET', `/admin/projects/${project.id}/sections?limit=100`);
      for (const section of sections.items)
        await api('DELETE', `/admin/projects/${project.id}/sections/${section.id}`);
      const links = await api('GET', `/admin/projects/${project.id}/media?limit=100`);
      for (const link of links.items)
        await api('DELETE', `/admin/projects/${project.id}/media/${link.id}`);
      await api('DELETE', `/admin/projects/${project.id}`);
    }
    for (const id of assets) await api('DELETE', '/admin/media/' + id);
    if (tokens) await api('POST', '/auth/logout', { refresh_token: tokens.refresh_token });
    if (report)
      await writeFile(
        new URL('result.json', output),
        JSON.stringify({ ...report, projectFixtureRemoved: true }, null, 2),
      );
  } catch (error) {
    console.error('Fixture cleanup failed: ' + error.message);
    process.exitCode = 1;
  }
  if (socket) socket.close();
  if (browser) browser.kill();
  if (productionServer) productionServer.kill();
}
