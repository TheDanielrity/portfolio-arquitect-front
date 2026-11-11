import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use((_req, res, next) => {
  if (process.env['DISABLE_INDEXING'] === 'true')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.get('/healthz', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
});
app.get('/robots.txt', (_req, res, next) => {
  if (process.env['DISABLE_INDEXING'] !== 'true') return next();
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// Optional deployment gateway: keeps browser API requests on the frontend origin.
// R2 PUTs remain direct. Redirects are passed through, never followed with JWT headers.
const upstreamSetting = process.env['UPSTREAM_API_BASE_URL'];
if (upstreamSetting) {
  const upstream = new URL(upstreamSetting);
  if (
    !['https:', 'http:'].includes(upstream.protocol) ||
    upstream.username ||
    upstream.password ||
    upstream.search ||
    upstream.hash
  )
    throw new Error('Invalid UPSTREAM_API_BASE_URL');
  app.use('/api/v1', (req, res) => {
    const target = new URL(upstream.origin + upstream.pathname.replace(/\/+$/, '') + req.url);
    const headers: Record<string, string | string[]> = {};
    for (const name of [
      'accept',
      'authorization',
      'content-type',
      'content-length',
      'range',
      'if-match',
      'if-none-match',
    ]) {
      const value = req.headers[name];
      if (value !== undefined) headers[name] = value;
    }
    const forward = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
      target,
      {
        method: req.method,
        headers,
        timeout: 150000,
      },
      (response) => {
        res.status(response.statusCode ?? 502);
        res.setHeader('Cache-Control', 'no-store');
        for (const name of [
          'content-type',
          'content-length',
          'content-disposition',
          'content-range',
          'accept-ranges',
          'etag',
          'location',
          'retry-after',
          'www-authenticate',
        ]) {
          const value = response.headers[name];
          if (value !== undefined) res.setHeader(name, value);
        }
        response.on('error', () => res.destroy());
        response.pipe(res);
      },
    );
    forward.on('timeout', () => forward.destroy());
    forward.on('error', () => {
      if (!res.headersSent) res.status(502).json({ detail: 'API unavailable' });
      else res.destroy();
    });
    req.on('aborted', () => forward.destroy());
    res.on('close', () => {
      if (!res.writableEnded) forward.destroy();
    });
    req.pipe(forward);
  });
}

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  // Visibility can change at any moment. Never share-cache public SSR snapshots.
  res.setHeader('Cache-Control', 'no-store');
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
