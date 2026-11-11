import { convertStl, STL_MAX_BYTES } from '../../../shared/utils/stl-conversion';
import { readStlFile, StlFileReadError } from './stl-file';
import { compressPortfolioGlb } from '../../../shared/utils/glb-compression';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data: file }) => {
  try {
    if (!file.size || file.size > STL_MAX_BYTES)
      throw new Error('El STL debe tener contenido y no superar 100 MiB.');
    const converted = convertStl(await readStlFile(file), (progress) =>
      scope.postMessage({ progress: Math.round(progress * 0.85) }),
    );
    const buffer = await compressPortfolioGlb(converted);
    scope.postMessage({ progress: 100 });
    scope.postMessage({ buffer }, [buffer]);
  } catch (error) {
    scope.postMessage({
      code: error instanceof StlFileReadError ? 'FILE_READ_FAILED' : undefined,
      error: error instanceof Error ? error.message : 'No se pudo convertir el STL.',
    });
  }
};
