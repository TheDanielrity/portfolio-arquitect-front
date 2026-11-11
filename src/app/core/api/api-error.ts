import { HttpErrorResponse } from '@angular/common/http';
import type {
  ErrorResponse,
  ValidationErrorResponse,
  ValidationIssue,
} from './generated/types.gen';

export type ApiErrorBody = ErrorResponse | ValidationErrorResponse;
export type { ValidationIssue } from './generated/types.gen';

const statusMessages: Readonly<Record<number, string>> = {
  0: 'No se pudo conectar con el servidor.',
  400: 'La solicitud no es válida.',
  401: 'La operación requiere autenticación.',
  403: 'No tienes permiso para realizar esta operación.',
  404: 'El recurso solicitado no existe.',
  409: 'La operación entra en conflicto con el estado actual.',
  413: 'La solicitud supera el tamaño permitido.',
  422: 'Revisa los campos de la solicitud.',
  429: 'Se alcanzó el límite de solicitudes. Inténtalo más tarde.',
  500: 'El servidor encontró un error interno.',
  503: 'El servicio no está disponible temporalmente.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return (
    isRecord(value) &&
    Array.isArray(value['loc']) &&
    value['loc'].every(
      (part: unknown) =>
        typeof part === 'string' || (typeof part === 'number' && Number.isInteger(part)),
    ) &&
    typeof value['msg'] === 'string' &&
    typeof value['type'] === 'string'
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
    readonly validationIssues: readonly ValidationIssue[],
    readonly retryAfter: string | null,
    readonly errorId: string | null,
  ) {
    super(detail ?? statusMessages[status] ?? `La solicitud falló (HTTP ${status}).`);
    this.name = 'ApiError';
  }
}

export function toApiError(error: HttpErrorResponse): ApiError {
  const body: unknown = error.error;
  const detail = isRecord(body) ? body['detail'] : undefined;
  const issues =
    Array.isArray(detail) && detail.every(isValidationIssue)
      ? detail.map(({ loc, msg, type }) => ({ loc: [...loc], msg, type }))
      : [];
  return new ApiError(
    error.status,
    typeof detail === 'string' ? detail : null,
    issues,
    error.headers.get('Retry-After'),
    error.headers.get('X-Error-ID'),
  );
}
