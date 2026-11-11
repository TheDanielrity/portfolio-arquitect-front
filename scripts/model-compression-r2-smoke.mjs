import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { convertStl } from '../src/app/shared/utils/stl-conversion.ts';

const base = process.env.MODEL_SMOKE_API ?? 'http://localhost:8000/api/v1';
const credentials = JSON.parse(
  await readFile(new URL('../.tools/auth-development.json', import.meta.url), 'utf8'),
);
let tokens, asset;
async function api(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  assert.ok(r.ok, `${method} ${path}: ${r.status}`);
  return r.status === 204 ? null : r.json();
}
try {
  tokens = await api('POST', '/auth/login', credentials);
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
  const facet =
    'facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\n';
  const raw = convertStl(
    new TextEncoder().encode('solid\n' + facet.repeat(200) + 'endsolid').buffer,
  );
  const bytes = new Uint8Array(await compressPortfolioGlb(raw));
  assert.ok(bytes.byteLength < raw.byteLength);
  const authorization = await api('POST', '/admin/media/uploads/presign', {
    original_filename: `compression-smoke-${Date.now()}.glb`,
    mime_type: 'model/gltf-binary',
    file_size: bytes.byteLength,
    access: 'public',
  });
  assert.equal(authorization.provider, 'r2');
  const put = await fetch(authorization.upload_url, {
    method: 'PUT',
    headers: authorization.headers,
    body: bytes,
    signal: AbortSignal.timeout(60000),
  });
  assert.ok(put.ok, `R2 PUT: ${put.status}`);
  asset = await api('POST', '/admin/media/uploads/confirm', { upload_id: authorization.upload_id });
  assert.equal(asset.file_size, bytes.byteLength);
  const redirect = await fetch(base + '/admin/media/' + asset.id + '/content', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    redirect: 'manual',
  });
  assert.equal(redirect.status, 307);
  const downloaded = await fetch(redirect.headers.get('location'), {
    signal: AbortSignal.timeout(60000),
  });
  assert.ok(downloaded.ok);
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
  console.log(
    'Compressed GLB: real presign, exact signed PUT headers, confirmation, R2 byte verification: OK',
  );
} finally {
  if (asset) await api('DELETE', '/admin/media/' + asset.id);
  if (tokens) await api('POST', '/auth/logout', { refresh_token: tokens.refresh_token });
}
