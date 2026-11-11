import {
  mergeApplicationConfig,
  ApplicationConfig,
  inject,
  TransferState,
  REQUEST,
} from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_BASE_URL, PUBLIC_API_CONFIG, normalizeApiBaseUrl } from './core/api/api-config';
import { environment } from '../environments/environment';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    {
      provide: API_BASE_URL,
      useFactory: () => {
        const request = inject(REQUEST, { optional: true });
        const url = normalizeApiBaseUrl(
          process.env['API_BASE_URL'] ?? environment.apiBaseUrl,
          request ? new URL(request.url).origin : undefined,
        );
        inject(TransferState).set(PUBLIC_API_CONFIG, url);
        return url;
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
