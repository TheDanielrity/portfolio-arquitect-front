import { GLB_MAX_BYTES } from './stl-conversion';

interface PortfolioGlb {
  asset?: { extras?: { portfolioStl?: { units?: string } } };
  buffers?: { byteLength: number; uri?: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: { bufferView: number; componentType: number; count: number; type: string }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

/** Compresses only the converter's known layout; arbitrary GLB assets stay untouched. */
export async function compressPortfolioGlb(source: ArrayBuffer): Promise<ArrayBuffer> {
  if (source.byteLength < 28 || source.byteLength > GLB_MAX_BYTES)
    throw new Error('GLB vacío, inválido o superior a 100 MiB.');
  const header = new DataView(source);
  const jsonLength = header.getUint32(12, true);
  const binStart = 28 + jsonLength;
  if (
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== source.byteLength ||
    jsonLength % 4 !== 0 ||
    header.getUint32(16, true) !== 0x4e4f534a ||
    binStart > source.byteLength
  )
    throw new Error('Estructura GLB inválida.');
  const document = JSON.parse(
    new TextDecoder().decode(new Uint8Array(source, 20, jsonLength)),
  ) as PortfolioGlb;
  if (
    document?.asset?.extras?.portfolioStl?.units !== 'unspecified' ||
    document.extensionsUsed?.includes('EXT_meshopt_compression')
  )
    return source;
  const binLength = header.getUint32(binStart - 8, true);
  const views = document.bufferViews;
  const accessors = document.accessors;
  if (
    header.getUint32(binStart - 4, true) !== 0x004e4942 ||
    binStart + binLength !== source.byteLength ||
    document.buffers?.length !== 1 ||
    document.buffers[0].uri ||
    document.buffers[0].byteLength !== binLength ||
    views?.length !== 2 ||
    accessors?.length !== 2 ||
    views[0].byteLength + views[1].byteLength !== binLength
  )
    throw new Error('El GLB no tiene la estructura esperada del conversor STL.');
  const strides = [12, 4];
  for (let i = 0; i < 2; i++) {
    const view = views[i],
      accessor = accessors[i];
    if (
      view.buffer !== 0 ||
      (view.byteOffset ?? 0) !== (i === 0 ? 0 : views[0].byteLength) ||
      (view.byteStride ?? strides[i]) !== strides[i] ||
      accessor.bufferView !== i ||
      accessor.type !== 'VEC3' ||
      accessor.componentType !== (i === 0 ? 5126 : 5120) ||
      !Number.isSafeInteger(accessor.count) ||
      accessor.count <= 0 ||
      accessor.count * strides[i] !== view.byteLength ||
      accessor.count !== accessors[0].count
    )
      throw new Error('Atributos GLB inválidos para compresión.');
  }
  const { MeshoptEncoder } = await import('meshoptimizer/encoder');
  if (!MeshoptEncoder.supported)
    throw new Error('Este dispositivo no admite compresión WebAssembly.');
  await MeshoptEncoder.ready;
  const chunks = views.map((view, i) =>
    MeshoptEncoder.encodeGltfBuffer(
      new Uint8Array(source, binStart + (view.byteOffset ?? 0), view.byteLength),
      accessors[i].count,
      strides[i],
      'ATTRIBUTES',
      0,
    ),
  );
  const firstSize = Math.ceil(chunks[0].byteLength / 4) * 4;
  const compressedSize = firstSize + Math.ceil(chunks[1].byteLength / 4) * 4;
  const extension = 'EXT_meshopt_compression';
  const compressed = {
    ...document,
    extensionsUsed: [...(document.extensionsUsed ?? []), extension],
    extensionsRequired: [...(document.extensionsRequired ?? []), extension],
    buffers: [
      { byteLength: compressedSize },
      { byteLength: binLength, extensions: { [extension]: { fallback: true } } },
    ],
    bufferViews: views.map((view, i) => ({
      ...view,
      buffer: 1,
      extensions: {
        [extension]: {
          buffer: 0,
          byteOffset: i === 0 ? 0 : firstSize,
          byteLength: chunks[i].byteLength,
          byteStride: strides[i],
          count: accessors[i].count,
          mode: 'ATTRIBUTES',
          filter: 'NONE',
        },
      },
    })),
  };
  const json = new TextEncoder().encode(JSON.stringify(compressed));
  const jsonSize = Math.ceil(json.byteLength / 4) * 4;
  const size = 28 + jsonSize + compressedSize;
  if (size >= source.byteLength) return source;
  const result = new ArrayBuffer(size);
  const output = new DataView(result);
  output.setUint32(0, 0x46546c67, true);
  output.setUint32(4, 2, true);
  output.setUint32(8, size, true);
  output.setUint32(12, jsonSize, true);
  output.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(result);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(json, 20);
  output.setUint32(20 + jsonSize, compressedSize, true);
  output.setUint32(24 + jsonSize, 0x004e4942, true);
  bytes.set(chunks[0], 28 + jsonSize);
  bytes.set(chunks[1], 28 + jsonSize + firstSize);
  return result;
}
