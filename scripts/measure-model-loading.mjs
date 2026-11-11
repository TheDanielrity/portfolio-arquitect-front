import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Read-only audit: no login, uploads, database changes or signed URLs in reports.
const url = process.env.MODEL_AUDIT_URL ?? 'http://localhost:4200/projects/project-test';
const mobile = process.env.MODEL_AUDIT_MOBILE !== '0';
const targetAsset = process.env.MODEL_AUDIT_ASSET;
const replacement = process.env.MODEL_AUDIT_GLB
  ? (await readFile(process.env.MODEL_AUDIT_GLB)).toString('base64')
  : null;
const output = new URL(`../.tools/model-loading-${Date.now()}/`, import.meta.url);
const profile = new URL('chrome/', output);
await mkdir(profile, { recursive: true });
let browser, socket;
let sequence = 0;
const pending = new Map();
const requests = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  assert.ok(!result.exceptionDetails, 'Browser evaluation failed');
  return result.result.value;
}
try {
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
  for (let i = 0; i < 100 && !port; i++) {
    try {
      port = Number(
        (await readFile(new URL('DevToolsActivePort', profile), 'utf8')).split('\n')[0],
      );
    } catch {
      await delay(100);
    }
  }
  assert.ok(port, 'Chrome did not start');
  const targets = await (await fetch(`http://localhost:${port}/json`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const call = pending.get(message.id);
      if (!call) return;
      clearTimeout(call.timer);
      pending.delete(message.id);
      if (message.error) call.reject(new Error('CDP command failed'));
      else call.resolve(message.result);
      return;
    }
    const p = message.params;
    if (message.method === 'Fetch.requestPaused') {
      void send('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'model/gltf-binary' }],
        body: replacement,
      });
      return;
    }
    if (message.method === 'Network.requestWillBeSent') {
      const previous = requests.get(p.requestId);
      requests.set(p.requestId, {
        start: previous?.start ?? p.timestamp,
        wallStart: previous?.wallStart ?? p.wallTime * 1000,
        model: previous?.model ?? false,
        assetId: previous?.assetId ?? /\/public\/media\/([\w-]+)\/content/.exec(p.request.url)?.[1],
      });
    } else if (message.method === 'Network.responseReceived') {
      const request = requests.get(p.requestId);
      if (request && p.response.mimeType === 'model/gltf-binary') {
        request.model = true;
        request.headersAt = p.timestamp;
        request.status = p.response.status;
        request.cache = !!p.response.fromDiskCache;
        const timing = p.response.timing;
        if (timing) request.waitMs = timing.receiveHeadersEnd - timing.sendEnd;
      }
    } else if (message.method === 'Network.loadingFinished') {
      const request = requests.get(p.requestId);
      if (request) Object.assign(request, { finish: p.timestamp, bytes: p.encodedDataLength });
    }
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  if (replacement)
    await send('Fetch.enable', {
      patterns: [
        {
          urlPattern: '*api/v1/public/media/3d433f2e-2a26-4250-956d-47906150a9e4/content*',
          requestStage: 'Request',
        },
      ],
    });
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
    window.modelAudit = { viewers: [] };
    const seen = new WeakSet();
    new MutationObserver(() => {
      for (const viewer of document.querySelectorAll('model-viewer')) {
        if (seen.has(viewer)) continue;
        seen.add(viewer);
        const metric = { insertedMs: performance.now(), progress: 0,
          assetId: /\\/public\\/media\\/([\\w-]+)\\/content/.exec(viewer.getAttribute('src') ?? '')?.[1] };
        window.modelAudit.viewers.push(metric);
        viewer.addEventListener('progress', event => { metric.progress = event.detail.totalProgress; });
        viewer.addEventListener('load', () => { metric.loadedMs = performance.now(); });
        viewer.addEventListener('error', event => { metric.error = event.detail?.type ?? 'unknown'; });
      }
    }).observe(document, { childList: true, subtree: true });
  `,
  });
  await send('Page.navigate', { url });
  let sections = 0;
  for (let i = 0; i < 60 && !sections; i++) {
    await delay(500);
    sections = await evaluate("document.querySelectorAll('app-public-model').length");
  }
  assert.ok(sections, 'No public model sections found');
  await delay(1500);
  const initiallyActive = await evaluate("document.querySelectorAll('model-viewer').length");
  await evaluate("document.querySelector('app-public-model').scrollIntoView({block:'center'})");
  let metrics;
  for (let i = 0; i < 310; i++) {
    await delay(1000);
    metrics = await evaluate(
      `({ ...window.modelAudit, failed: !!document.querySelector('app-public-model .activate') })`,
    );
    const target = targetAsset
      ? metrics.viewers.find((v) => v.assetId === targetAsset)
      : metrics.viewers[0];
    if (target?.loadedMs || target?.error || metrics.failed) break;
  }
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('viewer.png', output), Buffer.from(screenshot.data, 'base64'));
  const timeOrigin = await evaluate('performance.timeOrigin');
  const report = {
    mode: mobile
      ? 'Chrome mobile viewport + 4x CPU slowdown; software GPU, not Galaxy A35'
      : 'Chrome desktop; software GPU',
    cacheDisabled: true,
    localGlbReplacement: !!replacement,
    sections,
    initiallyActive,
    metrics,
    downloads: [...requests.values()]
      .filter((request) => request.model)
      .map((r) => ({
        assetId: r.assetId,
        status: r.status,
        bytes: r.bytes,
        cache: r.cache,
        requestToCompleteMs: r.finish ? (r.finish - r.start) * 1000 : null,
        responseBodyMs:
          r.finish && !replacement ? Math.max(0, (r.finish - r.headersAt) * 1000) : null,
        serverWaitMs: r.waitMs,
        afterDownloadToLoadMs:
          r.finish && metrics.viewers.find((v) => v.assetId === r.assetId)?.loadedMs
            ? metrics.viewers.find((v) => v.assetId === r.assetId).loadedMs -
              (r.wallStart + (r.finish - r.start) * 1000 - timeOrigin)
            : null,
      })),
  };
  await writeFile(new URL('result.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output: fileURLToPath(output), ...report }, null, 2));
  const target = targetAsset
    ? metrics.viewers.find((v) => v.assetId === targetAsset)
    : metrics.viewers[0];
  assert.ok(target?.loadedMs, 'Model did not finish loading');
} finally {
  for (const call of pending.values()) clearTimeout(call.timer);
  socket?.close();
  browser?.kill();
}
