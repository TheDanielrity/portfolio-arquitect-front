import { AbstractControl, FormControl, Validators } from '@angular/forms';
import { concatMap, from, Observable, reduce } from 'rxjs';
import type { Reorder } from '../../../core/api/generated/types.gen';
import { ApiError } from '../../../core/api/api-error';
import { projectError } from '../projects/project-errors';
export function contentText(max: number, required = false) {
  return new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.maxLength(max),
      ...(required ? [Validators.required, Validators.pattern(/\S/)] : []),
    ],
  });
}
export function webUrl(control: AbstractControl) {
  try {
    const url = new URL(control.value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
      ? null
      : { url: true };
  } catch {
    return { url: true };
  }
}
export function contentError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400)
      return 'Revisa los datos: foto IMAGE, CV PDF/DOCUMENT, URLs HTTP(S) sin credenciales y settings con el tipo y texto permitido.';
    if (error.status === 409)
      return 'Ya existe un perfil activo, una plataforma con ese nombre o un servicio con ese slug. Revisa los datos antes de reintentar.';
    if (error.status === 404)
      return 'El contenido o archivo solicitado ya no está disponible. Actualiza la página antes de reintentar.';
  }
  return projectError(error);
}
export function contentOrder(
  items: { id: string }[],
  write: (body: Reorder) => Observable<void>,
): Observable<void> {
  const order = items.map((item, i) => ({ id: item.id, sort_order: i }));
  const batches = [];
  for (let offset = 0; offset < order.length; offset += 100)
    batches.push(order.slice(offset, offset + 100));
  return from(batches).pipe(
    concatMap((items) => write({ items })),
    reduce(() => undefined, undefined),
  );
}
export function nextOrder(items: { sort_order?: number }[]): number {
  return Math.min(
    2147483647,
    items.reduce((max, item) => Math.max(max, item.sort_order ?? 0), -1) + 1,
  );
}
