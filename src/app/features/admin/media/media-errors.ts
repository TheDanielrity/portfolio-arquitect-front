import { ApiError } from '../../../core/api/api-error';
export function mediaError(
  error: unknown,
  context: 'general' | 'delete' | 'confirm' = 'general',
): string {
  if (!(error instanceof ApiError)) return 'No se pudo completar la operación. Inténtalo de nuevo.';
  if (error.status === 400 && error.detail === 'Upload authorization expired')
    return 'La autorización ha expirado. Cancélala y solicita una nueva subida.';
  if (
    error.status === 409 &&
    context === 'delete' &&
    error.detail === 'Media asset is still referenced'
  )
    return 'Este archivo está utilizado en proyectos, secciones o perfil. Retira sus referencias antes de eliminarlo.';
  const messages: Record<number, string> = {
    0: 'No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.',
    400:
      context === 'confirm'
        ? 'El archivo no coincide con la autorización o su formato y tamaño no son válidos.'
        : 'El servidor rechazó la solicitud. Revisa el formato y tamaño del archivo.',
    401: 'Tu sesión ha expirado. Inicia sesión de nuevo.',
    403: 'No tienes permiso para realizar esta operación.',
    404: 'El recurso o la autorización ya no está disponible.',
    409: 'La operación no es compatible con el estado actual del archivo. Actualiza la biblioteca.',
    413: 'El archivo supera el tamaño permitido.',
    422: 'Revisa los campos: el servidor no pudo validar la solicitud.',
    429: 'Demasiadas solicitudes. Espera antes de reintentar.',
    500: 'El servidor no pudo completar la operación. Inténtalo más tarde.',
    503: 'El almacenamiento no está disponible temporalmente.',
  };
  return messages[error.status] ?? 'No se pudo completar la operación. Inténtalo más tarde.';
}
