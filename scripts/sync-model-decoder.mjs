import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../node_modules/meshoptimizer/meshopt_decoder.cjs', import.meta.url);
const directory = new URL('../public/assets/meshopt/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('decoder-1.3.0.js', directory), await readFile(source));
await writeFile(
  new URL('LICENSE.md', directory),
  await readFile(new URL('../node_modules/meshoptimizer/LICENSE.md', import.meta.url)),
);
console.log('Self-hosted meshoptimizer 1.3.0 decoder synchronized.');
