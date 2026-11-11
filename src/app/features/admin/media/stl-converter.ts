import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { StlFileReadError } from './stl-file';

export type StlConversionEvent = { progress: number } | { file: File };

@Injectable({ providedIn: 'root' })
export class StlConverter {
  convert(file: File): Observable<StlConversionEvent> {
    return new Observable((observer) => {
      if (typeof Worker === 'undefined') {
        observer.error(
          new Error(
            'Este dispositivo no permite convertir STL. Exporta un GLB desde tu aplicación 3D.',
          ),
        );
        return;
      }
      const worker = new Worker(new URL('./stl.worker', import.meta.url), { type: 'module' });
      const timer = setTimeout(
        () =>
          observer.error(
            new Error(
              'La conversión superó 60 segundos. Reduce la complejidad del STL o exporta un GLB.',
            ),
          ),
        60000,
      );
      worker.onmessage = ({
        data,
      }: MessageEvent<{
        buffer?: ArrayBuffer;
        progress?: number;
        error?: string;
        code?: string;
      }>) => {
        if (data.code === 'FILE_READ_FAILED') observer.error(new StlFileReadError());
        else if (data.error) observer.error(new Error(data.error));
        else if (data.buffer) {
          observer.next({
            file: new File([data.buffer], file.name.replace(/\.stl$/i, '.glb'), {
              type: 'model/gltf-binary',
            }),
          });
          observer.complete();
        } else if (data.progress !== undefined) observer.next({ progress: data.progress });
      };
      worker.onerror = () =>
        observer.error(
          new Error(
            'No se pudo convertir el STL. Puede superar la memoria disponible. Exporta un GLB o reduce el modelo.',
          ),
        );
      try {
        worker.postMessage(file);
      } catch {
        observer.error(
          new Error('No se pudo iniciar la conversión STL. Reintenta o exporta un GLB.'),
        );
      }
      return () => {
        clearTimeout(timer);
        worker.terminate();
      };
    });
  }
}
