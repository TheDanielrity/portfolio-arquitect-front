import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { toApiError } from './api-error';
import type { HealthApiV1HealthGetResponses } from './generated/types.gen';

export type HealthResponse = HealthApiV1HealthGetResponses[200];

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  check(): Observable<HealthResponse> {
    return this.http
      .get<HealthResponse>(`${this.baseUrl}/health`)
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
        ),
      );
  }
}
