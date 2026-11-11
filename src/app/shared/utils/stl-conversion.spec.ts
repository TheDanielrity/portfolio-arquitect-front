import { convertStl, STL_MAX_BYTES, STL_MAX_TRIANGLES } from './stl-conversion';

const ascii = (vertices = 'vertex -1 0 0\nvertex 2 0 0\nvertex -1 4 5') =>
  new TextEncoder().encode(
    `solid building\nfacet normal 0 0 1\nouter loop\n${vertices}\nendloop\nendfacet\nendsolid building`,
  ).buffer;
function inspect(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const positions = new Float32Array(buffer, 28 + jsonLength, json.accessors[0].count * 3);
  return { view, json, positions };
}
function binary() {
  const buffer = new ArrayBuffer(134);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('solid binary header'));
  view.setUint32(80, 1, true);
  [-1, 0, 0, 2, 0, 0, -1, 4, 5].forEach((n, i) => view.setFloat32(96 + i * 4, n, true));
  return buffer;
}
describe('Bounded STL to GLB conversion', () => {
  it('converts the largest binary STL within 100 MiB without exceeding the GLB limit', () => {
    const count = Math.floor((STL_MAX_BYTES - 84) / 50);
    const source = new ArrayBuffer(84 + count * 50);
    new DataView(source).setUint32(80, count, true);
    const face = new Uint8Array(binary(), 84, 50);
    const bytes = new Uint8Array(source);
    for (let i = 0; i < count; i++) bytes.set(face, 84 + i * 50);
    expect(source.byteLength).toBeGreaterThan(STL_MAX_BYTES - 50);
    const result = convertStl(source);
    const { json, positions } = inspect(result);
    expect(json.accessors[0].count).toBe(count * 3);
    expect(Array.from(positions.subarray(-9))).toEqual([-1, 0, 0, 2, 0, 0, -1, 4, 5]);
    expect(result.byteLength).toBeLessThanOrEqual(100 * 1024 * 1024);
  }, 15000);
  it.each(['ascii', 'binary'])(
    'converts %s with exact original coordinates, proportions and orientation',
    (format) => {
      const progress: number[] = [];
      const result = convertStl(format === 'ascii' ? ascii() : binary(), (value) =>
        progress.push(value),
      );
      const { view, json, positions } = inspect(result);
      expect(view.getUint32(0, true)).toBe(0x46546c67);
      expect(view.getUint32(4, true)).toBe(2);
      expect(view.getUint32(8, true)).toBe(result.byteLength);
      expect(Array.from(positions)).toEqual([-1, 0, 0, 2, 0, 0, -1, 4, 5]);
      expect(json.accessors[0].min).toEqual([-1, 0, 0]);
      expect(json.accessors[0].max).toEqual([2, 4, 5]);
      expect(json.nodes).toEqual([{ mesh: 0 }]);
      expect(json.asset.extras.portfolioStl.units).toBe('unspecified');
      expect(json.materials[0].pbrMetallicRoughness.metallicFactor).toBe(0);
      expect(json.materials[0].pbrMetallicRoughness.roughnessFactor).toBeGreaterThan(0.8);
      expect(json.extensionsRequired).toContain('KHR_mesh_quantization');
      expect(json.accessors[1].componentType).toBe(5120);
      expect(json.accessors[1].normalized).toBe(true);
      expect(json.bufferViews[1].byteStride).toBe(4);
      const normal = new Int8Array(result, 28 + view.getUint32(12, true) + positions.byteLength, 4);
      const expected = [0, -5 / Math.sqrt(41), 4 / Math.sqrt(41)];
      for (let c = 0; c < 3; c++)
        expect(Math.abs(normal[c] / 127 - expected[c])).toBeLessThanOrEqual(1 / 254);
      expect(progress.at(-1)).toBe(100);
    },
  );
  it('preserves small and large coordinate magnitudes without fitting geometry to a unit box', () => {
    for (const size of [0.001, 1, 1000]) {
      const { json } = inspect(
        convertStl(ascii(`vertex 0 0 0\nvertex ${size} 0 0\nvertex 0 ${2 * size} ${3 * size}`)),
      );
      expect(json.accessors[0].max[0]).toBeCloseTo(size, 5);
      expect(json.accessors[0].max[1] / json.accessors[0].max[0]).toBeCloseTo(2);
      expect(json.accessors[0].max[2] / json.accessors[0].max[0]).toBeCloseTo(3);
    }
  });
  it.each([
    () => new ArrayBuffer(0),
    () => new ArrayBuffer(STL_MAX_BYTES + 1),
    () => ascii().slice(0, 50),
    () => binary().slice(0, 133),
    () => ascii('vertex NaN 0 0\nvertex 1 0 0\nvertex 0 1 0'),
    () => ascii('vertex 1e400 0 0\nvertex 1 0 0\nvertex 0 1 0'),
    () => ascii('vertex 0 0 0\nvertex 1 0 0\nvertex 2 0 0'),
    () => new TextEncoder().encode('v 0 0 0\nf 1 2 3').buffer,
  ])('rejects invalid, empty, oversized and degenerate sources', (source) =>
    expect(() => convertStl(source())).toThrow(),
  );
  it('rejects a source beyond the byte budget before allocating geometry', () => {
    const buffer = new ArrayBuffer(84 + (STL_MAX_TRIANGLES + 1) * 50);
    new DataView(buffer).setUint32(80, STL_MAX_TRIANGLES + 1, true);
    expect(() => convertStl(buffer)).toThrow('100 MiB');
  });
  it('rejects nonstandard color instead of silently discarding it', () => {
    const source = binary();
    new DataView(source).setUint16(132, 0x8000, true);
    expect(() => convertStl(source)).toThrow('color');
  });
});
