const requestHeaders = [
  'accept',
  'authorization',
  'content-type',
  'range',
  'if-match',
  'if-none-match',
];
const responseHeaders = [
  'content-type',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'etag',
  'location',
  'retry-after',
  'www-authenticate',
  'x-error-id',
];

/** Only the configured API receives credentials; signed R2 redirects stay browser requests. */
export async function forwardNetlifyApi(
  request: Request,
  upstreamSetting: string | undefined,
  transport: typeof fetch = fetch,
): Promise<Response> {
  const unavailable = () =>
    Response.json(
      { detail: 'API unavailable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    if (!upstreamSetting) return unavailable();
    const upstream = new URL(upstreamSetting);
    if (
      upstream.protocol !== 'https:' ||
      upstream.username ||
      upstream.password ||
      upstream.search ||
      upstream.hash ||
      upstream.pathname.replace(/\/+$/, '') !== '/api/v1'
    ) {
      return unavailable();
    }
    const incoming = new URL(request.url);
    if (incoming.pathname !== '/api/v1' && !incoming.pathname.startsWith('/api/v1/')) {
      return new Response(null, { status: 404 });
    }
    // Concatenation preserves the configured origin even for paths containing double slashes.
    const target = new URL(upstream.origin + incoming.pathname + incoming.search);
    if (target.origin === incoming.origin) return unavailable();
    const headers = new Headers();
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      init.duplex = 'half';
    }
    const result = await transport(target, init);
    const outgoing = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of responseHeaders) {
      const value = result.headers.get(name);
      if (value !== null) outgoing.set(name, value);
    }
    return new Response(result.body, { status: result.status, headers: outgoing });
  } catch {
    // Do not expose upstream URLs, signed locations or credentials in errors.
    return unavailable();
  }
}
