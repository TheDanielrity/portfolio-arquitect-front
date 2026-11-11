import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import {
  getAllowedHosts,
  getContext,
  getTrustProxyHeaders,
} from '@netlify/angular-runtime/app-engine.js';
import { forwardNetlifyApi } from './server/netlify-api-gateway';

const angularApp = new AngularAppEngine({
  allowedHosts: getAllowedHosts(),
  trustProxyHeaders: getTrustProxyHeaders(),
});

export async function netlifyAppEngineHandler(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const noindex = process.env['DISABLE_INDEXING'] === 'true';
  let response: Response;
  if (pathname === '/healthz') {
    response = Response.json({ status: 'ok' });
  } else if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
    response = await forwardNetlifyApi(request, process.env['UPSTREAM_API_BASE_URL']);
  } else if (pathname === '/robots.txt' && noindex) {
    response = new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain' },
    });
  } else {
    response =
      (await angularApp.handle(request, getContext())) ?? new Response(null, { status: 404 });
  }
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Netlify-CDN-Cache-Control', 'no-store');
  if (noindex || pathname === '/admin' || pathname.startsWith('/admin/')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return new Response(response.body, { status: response.status, headers });
}

export const reqHandler = createRequestHandler(netlifyAppEngineHandler);
