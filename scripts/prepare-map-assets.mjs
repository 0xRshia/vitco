import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageFile = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(await readFile(packageFile, 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid MapLibre package version.');
const source = dirname(packageFile);
const destination = join(root, 'public/vendor/maplibre', version);
await mkdir(destination, { recursive: true });
// Serve the exact locked ESM worker from our own origin. Turbopack does not
// rewrite the library's default worker reference inside its dependency module.
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-worker.mjs.map'])
  await copyFile(join(source, 'dist', name), join(destination, name));
await copyFile(join(source, 'LICENSE.txt'), join(destination, 'LICENSE.txt'));
