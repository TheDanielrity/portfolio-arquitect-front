import { AbstractControl } from '@angular/forms';
import { ApiError } from '../../../core/api/api-error';
export function projectError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No se pudo completar la operación. Inténtalo de nuevo.';
  if (error.status === 400)
    return 'Revisa la operación. Para publicar se requiere una portada de imagen; las portadas deben ser imágenes.';
  if (error.status === 409)
    return 'La información entra en conflicto con lo guardado. Puede haber un enlace o característica repetidos, o una portada publicada que deba reemplazarse antes de quitarla.';
  if (error.status === 422) return 'Revisa los campos indicados y vuelve a guardar.';
  if (error.status === 429 && error.retryAfter)
    return 'Demasiadas solicitudes. Reintenta después de: ' + error.retryAfter;
  const messages: Record<number, string> = {
    0: 'No se pudo conectar con el servidor. Tus cambios se conservan.',
    401: 'La sesión ha expirado. Vuelve a iniciar sesión.',
    403: 'No tienes permiso para esta operación.',
    404: 'El proyecto o recurso ya no está disponible.',
    429: 'Demasiadas solicitudes. Espera antes de reintentar.',
    500: 'El servidor no pudo completar la operación.',
    503: 'El servicio no está disponible temporalmente.',
  };
  return messages[error.status] ?? 'No se pudo completar la operación.';
}
export function fieldErrors(form: AbstractControl, error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 422) return;
  for (const issue of error.validationIssues) {
    const name = issue.loc.at(-1);
    if (typeof name === 'string') form.get(name)?.setErrors({ backend: true });
  }
}
export const PROJECT_STATUSES = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'PUBLISHED', label: 'Publicado' },
  { value: 'ARCHIVED', label: 'Archivado' },
] as const;
export const PROJECT_VISIBILITIES = [
  { value: 'PUBLIC', label: 'Público' },
  { value: 'PRIVATE', label: 'Privado' },
  { value: 'UNLISTED', label: 'No listado' },
] as const;
