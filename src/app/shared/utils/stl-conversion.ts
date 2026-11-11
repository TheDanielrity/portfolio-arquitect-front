/** Bounded, dependency-free STL reader and GLB 2 writer. Runs in a worker in production. */
export const STL_MAX_BYTES = 100 * 1024 * 1024;
export const GLB_MAX_BYTES = 100 * 1024 * 1024;
// Float32 positions (36 bytes/face) + normalized byte normals with 4-byte stride (12).
// Positions stay exact; only lighting normals use KHR_mesh_quantization.
export const STL_MAX_TRIANGLES = Math.floor((GLB_MAX_BYTES - 64 * 1024) / 48);
const complexityError =
  'La geometría del STL produciría un GLB superior al límite de 100 MiB. Reduce la complejidad del modelo.';

export function convertStl(
  source: ArrayBuffer,
  progress: (percent: number) => void = () => undefined,
): ArrayBuffer {
  if (!source.byteLength || source.byteLength > STL_MAX_BYTES)
    throw new Error('STL vacío o demasiado grande. Límite de conversión: 100 MiB.');
  const view = new DataView(source);
  const binaryCount = source.byteLength >= 84 ? view.getUint32(80, true) : 0;
  // Binary STL headers may start with "solid". Exact length takes precedence.
  const binary = binaryCount > 0 && 84 + binaryCount * 50 === source.byteLength;
  let vertices: Float32Array;
  if (binary) {
    if (binaryCount > STL_MAX_TRIANGLES) throw new Error(complexityError);
    vertices = new Float32Array(binaryCount * 9);
    for (let face = 0; face < binaryCount; face++) {
      const offset = 84 + face * 50;
      // Nonstandard binary colors are ambiguous (VisCAM/Magics): never silently discard them.
      if (view.getUint16(offset + 48, true) !== 0)
        throw new Error(
          'STL con atributos o color no estándar. Exporta un STL sin color o un GLB.',
        );
      for (let c = 0; c < 9; c++)
        vertices[face * 9 + c] = view.getFloat32(offset + 12 + c * 4, true);
      if (face % 8192 === 0) progress(Math.round((face / binaryCount) * 40));
    }
    const header = new TextDecoder().decode(new Uint8Array(source, 0, 80));
    if (header.includes('COLOR=')) throw new Error('STL con color no estándar. Exporta como GLB.');
  } else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(source);
    // Count first to allocate an exact typed buffer instead of a growing JS number array.
    let capacity = 0;
    for (const match of text.matchAll(/\bfacet\s+normal\b/g)) {
      if (match && ++capacity > STL_MAX_TRIANGLES) throw new Error(complexityError);
    }
    vertices = new Float32Array(capacity * 9);
    const tokens = text.matchAll(/\S+/g);
    const next = (): string => tokens.next().value?.[0] ?? '';
    const requireToken = (expected: string): void => {
      if (next() !== expected) throw new Error('STL ASCII inválido o truncado.');
    };
    const number = (): number => {
      const token = next();
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))
        throw new Error('Coordenada STL inválida.');
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error('Coordenada STL no finita.');
      return value;
    };
    requireToken('solid');
    // Solid names are optional and may contain spaces; only skip the first header line.
    let token = next();
    while (token && token !== 'facet' && token !== 'endsolid') token = next();
    let count = 0;
    while (token === 'facet') {
      if (++count > capacity) throw new Error('STL ASCII inválido.');
      requireToken('normal');
      number();
      number();
      number();
      requireToken('outer');
      requireToken('loop');
      for (let v = 0; v < 3; v++) {
        requireToken('vertex');
        vertices.set([number(), number(), number()], (count - 1) * 9 + v * 3);
      }
      requireToken('endloop');
      requireToken('endfacet');
      token = next();
    }
    if (token !== 'endsolid' || !count) throw new Error('STL ASCII vacío o inválido.');
    // Only the closing solid name may follow. Do not accept concatenated meshes/garbage.
    const closing = text.slice(text.lastIndexOf('endsolid') + 8);
    if (/[\r\n]\s*\S/.test(closing)) throw new Error('Contenido inesperado después del STL.');
    if (count !== capacity) throw new Error('STL ASCII inválido.');
    progress(40);
  }
  const normals = new Int8Array((vertices.length / 3) * 4);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 9) {
    for (let c = 0; c < 9; c++) {
      const value = vertices[i + c];
      if (!Number.isFinite(value)) throw new Error('El STL contiene coordenadas no finitas.');
      min[c % 3] = Math.min(min[c % 3], value);
      max[c % 3] = Math.max(max[c % 3], value);
    }
    const ax = vertices[i + 3] - vertices[i],
      ay = vertices[i + 4] - vertices[i + 1],
      az = vertices[i + 5] - vertices[i + 2];
    const bx = vertices[i + 6] - vertices[i],
      by = vertices[i + 7] - vertices[i + 1],
      bz = vertices[i + 8] - vertices[i + 2];
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(length) || length === 0)
      throw new Error('El STL contiene triángulos degenerados.');
    const normalX = Math.round((nx / length) * 127);
    const normalY = Math.round((ny / length) * 127);
    const normalZ = Math.round((nz / length) * 127);
    for (let v = 0; v < 3; v++) {
      const offset = (i / 3 + v) * 4;
      normals[offset] = normalX;
      normals[offset + 1] = normalY;
      normals[offset + 2] = normalZ;
    }
    if (i % (8192 * 9) === 0) progress(40 + Math.round((i / vertices.length) * 45));
  }
  const json = {
    asset: {
      version: '2.0',
      generator: 'Portfolio STL converter v2',
      extras: { portfolioStl: { version: 1, units: 'unspecified' } },
    },
    scene: 0,
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0, mode: 4 }] }],
    materials: [
      {
        name: 'Maqueta blanca mate',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.88, 0.87, 0.84, 1],
          metallicFactor: 0,
          roughnessFactor: 0.9,
        },
      },
    ],
    buffers: [{ byteLength: vertices.byteLength + normals.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertices.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: vertices.byteLength,
        byteLength: normals.byteLength,
        byteStride: 4,
        target: 34962,
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertices.length / 3, type: 'VEC3', min, max },
      {
        bufferView: 1,
        componentType: 5120,
        normalized: true,
        count: vertices.length / 3,
        type: 'VEC3',
      },
    ],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(encoded.length / 4) * 4;
  const size = 28 + jsonSize + vertices.byteLength + normals.byteLength;
  if (size > GLB_MAX_BYTES) throw new Error('El GLB convertido supera el límite de 100 MiB.');
  const result = new ArrayBuffer(size);
  const output = new DataView(result);
  output.setUint32(0, 0x46546c67, true);
  output.setUint32(4, 2, true);
  output.setUint32(8, size, true);
  output.setUint32(12, jsonSize, true);
  output.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(result);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(encoded, 20);
  output.setUint32(20 + jsonSize, vertices.byteLength + normals.byteLength, true);
  output.setUint32(24 + jsonSize, 0x004e4942, true);
  bytes.set(new Uint8Array(vertices.buffer), 28 + jsonSize);
  bytes.set(new Uint8Array(normals.buffer), 28 + jsonSize + vertices.byteLength);
  progress(100);
  return result;
}
