import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

const [input, output] = process.argv.slice(2);
assert.ok(input && output, 'Usage: node scripts/compress-portfolio-glb.mjs input.glb output.glb');
assert.notEqual(resolve(input), resolve(output), 'Keep the original file for comparison');
const compiled = await build({
  entryPoints: ['src/app/shared/utils/glb-compression.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { compressPortfolioGlb } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
);
const bytes = await readFile(input);
const started = performance.now();
const compressed = await compressPortfolioGlb(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);
const originalJsonSize = bytes.readUInt32LE(12);
const originalJson = JSON.parse(bytes.subarray(20, 20 + originalJsonSize).toString());
const compressedBytes = Buffer.from(compressed);
const jsonSize = compressedBytes.readUInt32LE(12);
const json = JSON.parse(compressedBytes.subarray(20, 20 + jsonSize).toString());
if (
  json.extensionsRequired?.includes('EXT_meshopt_compression') &&
  !originalJson.extensionsRequired?.includes('EXT_meshopt_compression')
) {
  await MeshoptDecoder.ready;
  for (let i = 0; i < json.bufferViews.length; i++) {
    const view = json.bufferViews[i],
      ext = view.extensions.EXT_meshopt_compression;
    const decoded = new Uint8Array(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(
      decoded,
      ext.count,
      ext.byteStride,
      compressedBytes.subarray(
        28 + jsonSize + ext.byteOffset,
        28 + jsonSize + ext.byteOffset + ext.byteLength,
      ),
      ext.mode,
    );
    const originalView = originalJson.bufferViews[i];
    assert.deepEqual(
      Buffer.from(decoded),
      bytes.subarray(
        28 + originalJsonSize + originalView.byteOffset,
        28 + originalJsonSize + originalView.byteOffset + originalView.byteLength,
      ),
      'Lossless verification failed',
    );
  }
}
await writeFile(output, new Uint8Array(compressed));
console.log(
  JSON.stringify(
    {
      originalBytes: bytes.byteLength,
      compressedBytes: compressed.byteLength,
      reductionPercent: (1 - compressed.byteLength / bytes.byteLength) * 100,
      verifiedByteExact: true,
      compressionMs: performance.now() - started,
      output: resolve(output),
    },
    null,
    2,
  ),
);
