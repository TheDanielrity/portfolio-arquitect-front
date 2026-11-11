export class StlFileReadError extends Error {
  constructor() {
    super(
      'No se pudo leer el archivo local. Comprueba sus permisos y si el antivirus o la protección DLP ha bloqueado la lectura. Vuelve a seleccionar el archivo. Si el bloqueo continúa, consulta con el administrador de tu equipo.',
    );
    this.name = 'StlFileReadError';
  }
}

export async function readStlFile(file: Pick<File, 'arrayBuffer'>): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch {
    throw new StlFileReadError();
  }
}
