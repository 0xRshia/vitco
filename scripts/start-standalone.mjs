import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, '.next/standalone');
if (!existsSync(join(standalone, 'server.js'))) throw new Error('Run npm run build first.');
process.env.NODE_ENV ||= 'production';
for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  const file = join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
const args = process.argv.slice(2);
if (args.length) {
  if (
    args.length !== 2 ||
    !['--port', '-p'].includes(args[0]) ||
    !/^\d{1,5}$/.test(args[1]) ||
    Number(args[1]) < 1 ||
    Number(args[1]) > 65535
  )
    throw new Error('Usage: npm start -- --port <1-65535>');
  process.env.PORT = args[1];
}
process.env.HOSTNAME = '0.0.0.0';
process.env.DATABASE_PATH = resolve(root, process.env.DATABASE_PATH || 'data/vitrin.sqlite');
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
cpSync(join(root, '.next/static'), join(standalone, '.next/static'), { recursive: true });

// Keep local persistence at the repository's canonical data/ path. Next's tracing
// may copy that directory into its disposable build output; never use the copy.
const data = join(root, 'data');
const tracedData = join(standalone, 'data');
mkdirSync(data, { recursive: true });
let alreadyLinked = false;
try {
  alreadyLinked =
    lstatSync(tracedData).isSymbolicLink() &&
    resolve(standalone, readlinkSync(tracedData)) === data;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!alreadyLinked) {
  rmSync(tracedData, { recursive: true, force: true });
  symlinkSync(data, tracedData, 'dir');
}
await import(pathToFileURL(join(standalone, 'server.js')).href);
