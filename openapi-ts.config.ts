import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: process.env['OPENAPI_URL'] ?? 'http://127.0.0.1:8000/openapi.json',
  output: {
    path: 'src/app/core/api/generated',
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript'],
});
