import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { toApiError, type ApiErrorBody } from './api-error';

describe('API errors', () => {
  it('keeps the generated 422 field locations and strips unexpected submitted values', () => {
    const body: ApiErrorBody = {
      detail: [{ loc: ['body', 'sections', 0, 'title'], msg: 'Field required', type: 'missing' }],
    };
    const issue = typeof body.detail === 'string' ? undefined : body.detail[0];
    const error = toApiError(
      new HttpErrorResponse({
        status: 422,
        error: { detail: [{ ...issue, input: 'private value', ctx: { secret: true } }] },
      }),
    );
    expect(error.validationIssues).toEqual(body.detail);
    expect(error.message).toBe('Revisa los campos de la solicitud.');
    expect(JSON.stringify(error)).not.toContain('private value');
  });

  it('preserves Retry-After without implementing retries', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 429,
        error: { detail: 'Too many requests' },
        headers: new HttpHeaders({ 'Retry-After': '60' }),
      }),
    );
    expect(error.message).toBe('Too many requests');
    expect(error.retryAfter).toBe('60');
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 500])(
    'provides a specific safe fallback for HTTP %i',
    (status) => {
      const error = toApiError(
        new HttpErrorResponse({ status, error: '<html>private upstream output</html>' }),
      );
      expect(error.status).toBe(status);
      expect(error.message).not.toContain('private upstream output');
      expect(error.validationIssues).toEqual([]);
    },
  );

  it('ignores malformed validation details', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 422,
        error: { detail: [{ loc: ['body'], msg: 42, type: 'missing' }] },
      }),
    );
    expect(error.validationIssues).toEqual([]);
  });
});
