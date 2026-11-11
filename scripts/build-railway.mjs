import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Only these public values enter browser bundles. Backend/R2/JWT secrets are never read.
const local = process.argv.includes('--local');
function publicUrl(value, name) {
  if (!value) throw new Error(`${name} is required for the Railway build`);
  const url = new URL(value);
  if (
    !(url.protocol === 'https:' || (local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname.endsWith('.internal')
  )
    throw new Error(`${name} must be a public HTTPS URL without credentials`);
  return url;
}
const api = publicUrl(process.env['API_BASE_URL'], 'API_BASE_URL').href.replace(/\/+$/, '');
const site = publicUrl(
  process.env['PUBLIC_SITE_URL'] ||
    (process.env['RAILWAY_PUBLIC_DOMAIN'] ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}` : ''),
  'PUBLIC_SITE_URL or RAILWAY_PUBLIC_DOMAIN',
);
if (site.pathname !== '/') throw new Error('PUBLIC_SITE_URL must be an origin without a path');
const root = fileURLToPath(new URL('../', import.meta.url));
const environmentPath = new URL('../src/environments/environment.ts', import.meta.url);
const angularPath = new URL('../angular.json', import.meta.url);
const [environmentOriginal, angularOriginal] = await Promise.all([
  readFile(environmentPath),
  readFile(angularPath),
]);
try {
  const angular = JSON.parse(angularOriginal.toString('utf8').replace(/^\uFEFF/, ''));
  angular.projects['architecture-portfolio'].architect.build.options.security.allowedHosts = [
    ...new Set(['localhost', 'healthcheck.railway.app', site.hostname]),
  ];
  await writeFile(
    environmentPath,
    `export const environment: { readonly production: boolean; readonly apiBaseUrl?: string } = { production: true, apiBaseUrl: ${JSON.stringify(api)} };\n`,
  );
  await writeFile(angularPath, JSON.stringify(angular, null, 2) + '\n');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url)),
        'build',
        '--configuration',
        'production',
      ],
      { cwd: root, stdio: 'inherit', windowsHide: true },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  // Restore byte-for-byte, including on build failure; local environments stay untouched.
  await Promise.all([
    writeFile(environmentPath, environmentOriginal),
    writeFile(angularPath, angularOriginal),
  ]);
}
