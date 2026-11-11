interface GltfInfo {
  asset?: { extras?: { portfolioStl?: { version?: number; units?: string } } };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { mesh?: number; children?: number[]; extensions?: Record<string, unknown> }[];
  meshes?: {
    primitives?: { mode?: number; indices?: number; attributes?: { POSITION?: number } }[];
  }[];
  accessors?: { count?: number }[];
}
/** Counts submitted triangles for instances in the active glTF scene, not unused meshes. */
export function modelStatistics(document: unknown): {
  triangles: number | null;
  unitless: boolean;
} {
  const gltf = document as GltfInfo | null;
  const unitless = gltf?.asset?.extras?.portfolioStl?.units === 'unspecified';
  if (!gltf?.scenes || !gltf.nodes || !gltf.meshes || !gltf.accessors)
    return { triangles: null, unitless };
  let triangles = 0;
  let visited = 0;
  const visit = (index: number, path: Set<number>): boolean => {
    if (path.has(index) || ++visited > 100_000) return false;
    const node = gltf.nodes?.[index];
    if (!node || node.extensions?.['EXT_mesh_gpu_instancing']) return false;
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      if (!mesh?.primitives) return false;
      for (const primitive of mesh.primitives) {
        const accessor = primitive.indices ?? primitive.attributes?.POSITION;
        const count = accessor === undefined ? undefined : gltf.accessors?.[accessor]?.count;
        if (count === undefined || !Number.isSafeInteger(count) || count < 0) return false;
        const mode = primitive.mode ?? 4;
        if (mode === 4) triangles += Math.floor(count / 3);
        else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      }
    }
    const nextPath = new Set(path).add(index);
    return (node.children ?? []).every((child) => visit(child, nextPath));
  };
  const roots = gltf.scenes[gltf.scene ?? 0]?.nodes;
  return {
    triangles: roots && roots.every((root) => visit(root, new Set())) ? triangles : null,
    unitless,
  };
}
