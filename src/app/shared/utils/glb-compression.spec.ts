import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { convertStl } from './stl-conversion';
import { compressPortfolioGlb } from './glb-compression';

function model(count = 200) {
  const source = new ArrayBuffer(84 + count * 50);
  const data = new DataView(source);
  data.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    const values = [-1, 0, 0, 2, 0, 0, -1, 4, 5];
    values.forEach((value, j) => data.setFloat32(96 + i * 50 + j * 4, value, true));
  }
  return convertStl(source);
}
function inspect(buffer: ArrayBuffer) {
  const size = new DataView(buffer).getUint32(12, true);
  return {
    json: JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, size))),
    bin: 28 + size,
  };
}
describe('Lossless portfolio GLB compression', () => {
  it('preserves every geometry byte, dimensions, orientation, triangles and material', async () => {
    const source = model();
    const result = await compressPortfolioGlb(source);
    expect(result.byteLength).toBeLessThan(source.byteLength);
    const before = inspect(source),
      after = inspect(result);
    expect(after.json.accessors).toEqual(before.json.accessors);
    expect(after.json.nodes).toEqual(before.json.nodes);
    expect(after.json.materials).toEqual(before.json.materials);
    expect(after.json.asset).toEqual(before.json.asset);
    expect(after.json.meshes).toEqual(before.json.meshes);
    expect(after.json.extensionsRequired).toContain('EXT_meshopt_compression');
    await MeshoptDecoder.ready;
    after.json.bufferViews.forEach(
      (
        view: {
          byteLength: number;
          extensions: Record<
            string,
            {
              byteOffset: number;
              byteLength: number;
              byteStride: number;
              count: number;
              mode: string;
            }
          >;
        },
        i: number,
      ) => {
        const ext = view.extensions['EXT_meshopt_compression'];
        const decoded = new Uint8Array(view.byteLength);
        MeshoptDecoder.decodeGltfBuffer(
          decoded,
          ext.count,
          ext.byteStride,
          new Uint8Array(result, after.bin + ext.byteOffset, ext.byteLength),
          ext.mode,
        );
        expect(decoded).toEqual(
          new Uint8Array(
            source,
            before.bin + before.json.bufferViews[i].byteOffset,
            view.byteLength,
          ),
        );
      },
    );
    expect(await compressPortfolioGlb(result)).toBe(result);
  });
  it('retains the original when compression does not save space', async () => {
    const source = model(1);
    expect(await compressPortfolioGlb(source)).toBe(source);
  });
  it('does not rewrite arbitrary native GLB files', async () => {
    const source = model();
    const { json, bin } = inspect(source);
    const text = JSON.stringify(json).replace('unspecified', 'unrecognize');
    const copy = source.slice(0);
    new Uint8Array(copy).fill(32, 20, bin - 8);
    new Uint8Array(copy).set(new TextEncoder().encode(text), 20);
    expect(await compressPortfolioGlb(copy)).toBe(copy);
  });
  it('rejects malformed, truncated and excessive files before encoding', async () => {
    await expect(compressPortfolioGlb(new ArrayBuffer(0))).rejects.toThrow();
    await expect(compressPortfolioGlb(model().slice(0, 80))).rejects.toThrow();
    await expect(compressPortfolioGlb(new ArrayBuffer(100 * 1024 * 1024 + 1))).rejects.toThrow(
      '100 MiB',
    );
    const source = model();
    new DataView(source).setUint32(12, 0xffffffff, true);
    await expect(compressPortfolioGlb(source)).rejects.toThrow();
  });
});
