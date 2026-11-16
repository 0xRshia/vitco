import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let commit = process.env.GITHUB_SHA || '';
let output = resolve(project, 'release-artifacts');
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--help') {
    console.log(
      'Usage: node scripts/package-release.mjs --commit <40 lowercase hex> [--out-dir <directory>]',
    );
    process.exit(0);
  }
  if (
    !['--commit', '--out-dir'].includes(argument) ||
    !args[index + 1] ||
    args[index + 1].startsWith('--')
  ) {
    throw new Error('Expected --commit <40 lowercase hex> and optional --out-dir <directory>.');
  }
  const value = args[++index];
  if (argument === '--commit') commit = value;
  else output = resolve(value);
}
if (!/^[a-f0-9]{40}$/.test(commit))
  throw new Error('Release commit must contain exactly 40 lowercase hexadecimal characters.');
const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
  cwd: project,
  encoding: 'utf8',
});
if (head.error || head.status !== 0 || head.stdout.trim() !== commit)
  throw new Error('Release commit must match the current Git HEAD.');
const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: project,
  encoding: 'utf8',
});
if (status.error || status.status !== 0 || status.stdout.trim())
  throw new Error('Commit or remove all working-tree changes before packaging a release.');

const standalone = join(project, '.next/standalone');
const publicAssets = join(project, 'public');
const staticAssets = join(project, '.next/static');
const { dependencies } = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
const mapVersion = dependencies['maplibre-gl'];
if (!/^\d+\.\d+\.\d+$/.test(mapVersion))
  throw new Error('Pin the MapLibre runtime version before packaging.');
const workerName = 'maplibre-gl-worker.mjs';
const expectedWorker = await readFile(join(project, 'node_modules/maplibre-gl/dist', workerName));
const releaseWorker = await readFile(join(publicAssets, 'vendor/maplibre', mapVersion, workerName));
if (!expectedWorker.equals(releaseWorker))
  throw new Error(
    'The public map worker does not match the locked runtime. Rebuild the application.',
  );
const inside = (root, path) => {
  const pathFromRoot = relative(root, path);
  return !isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith('..' + sep);
};
for (const source of [standalone, publicAssets, staticAssets]) {
  if (inside(source, output))
    throw new Error('Release output must be outside the runtime and asset source directories.');
}

// Persistent application data stays on the server. Dependency directories called
// "data" remain intact because some runtime packages need their bundled tables.
const deniedDirectories = new Set([
  '.git',
  '.github',
  '.aws',
  '.ssh',
  '.codex',
  '.agents',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.netrc',
  '.git-credentials',
  '.pypirc',
  'keys',
  'secrets',
  'credentials',
  'test-results',
  'playwright-report',
  'coverage',
  'cache',
  '.cache',
  'caches',
]);
function excluded(path) {
  const parts = path.split(sep).filter(Boolean);
  return (
    parts.some(
      (part) => part.toLowerCase().startsWith('.env') || deniedDirectories.has(part.toLowerCase()),
    ) ||
    parts[0] === 'data' ||
    parts[0] === 'uploads' ||
    (parts[0] === 'public' && parts[1] === 'uploads') ||
    parts.some((part) =>
      /^(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|authorized_keys|known_hosts)$/i.test(part),
    ) ||
    parts.some((part) =>
      /\.(?:pem|key|p12|pfx|ppk|jks|keystore|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?)$/i.test(part),
    )
  );
}

async function copyTree(source, destination, root = source, path = '') {
  if (excluded(path)) return;
  const info = await lstat(source);
  if (info.isSymbolicLink()) {
    const target = resolve(dirname(source), await readlink(source));
    if (!inside(root, target) || !inside(root, await realpath(source))) {
      throw new Error('A runtime symlink escapes the standalone release: ' + path);
    }
    await mkdir(dirname(destination), { recursive: true });
    // Normalize absolute build-machine links into relocatable relative links.
    const destinationRoot = resolve(
      destination,
      ...path
        .split(sep)
        .filter(Boolean)
        .map(() => '..'),
    );
    const destinationTarget = join(destinationRoot, relative(root, target));
    await symlink(relative(dirname(destination), destinationTarget), destination);
  } else if (info.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: info.mode & 0o777 });
    const entries = await readdir(source);
    for (const name of entries.sort())
      await copyTree(
        join(source, name),
        join(destination, name),
        root,
        path ? join(path, name) : name,
      );
  } else if (info.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    await chmod(destination, info.mode & 0o777);
  } else throw new Error('Unsupported runtime file type: ' + path);
}

async function auditTree(root, directory = root) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    const path = relative(root, file);
    if (excluded(path)) throw new Error('Release contains a forbidden file or directory: ' + path);
    if (entry.isSymbolicLink()) {
      if (!inside(root, await realpath(file)))
        throw new Error('Release contains an external symlink: ' + path);
    } else if (entry.isDirectory()) await auditTree(root, file);
    else if (!entry.isFile()) throw new Error('Release contains an unsupported file type: ' + path);
  }
}

await lstat(join(standalone, 'server.js')).catch(() => {
  throw new Error('Build the application with output: standalone before packaging a release.');
});
const buildId = (await readFile(join(project, '.next/BUILD_ID'), 'utf8')).trim();
if (!buildId || (await readFile(join(standalone, '.next/BUILD_ID'), 'utf8')).trim() !== buildId)
  throw new Error('Standalone output and the current production build do not match.');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'vitco-release-'));
const stage = join(temporary, 'payload');
const archiveName = commit + '.tgz';
const archive = join(output, archiveName);
const checksum = archive + '.sha256';
const archiveTemporary = join(output, '.' + commit + '.' + randomUUID() + '.tgz.tmp');
const checksumTemporary = archiveTemporary + '.sha256';
try {
  await copyTree(standalone, stage);
  await copyTree(publicAssets, join(stage, 'public'));
  await copyTree(staticAssets, join(stage, '.next/static'));
  await mkdir(join(stage, 'scripts'), { recursive: true });
  await mkdir(join(stage, 'deploy'), { recursive: true });
  await copyFile(
    join(project, 'scripts/check-readiness.mjs'),
    join(stage, 'scripts/check-readiness.mjs'),
  );
  const runtimePackage = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
  runtimePackage.scripts = {
    start: 'node server.js',
    'check:readiness': 'node --env-file-if-exists=.env.local scripts/check-readiness.mjs',
  };
  await writeFile(join(stage, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n');
  await copyFile(
    join(project, 'deploy/activate-release.sh'),
    join(stage, 'deploy/activate-release.sh'),
  );
  await chmod(join(stage, 'deploy/activate-release.sh'), 0o755);
  await writeFile(join(stage, 'BUILD_COMMIT'), commit + '\n', { mode: 0o644 });
  await auditTree(stage);
  const tar = spawnSync(
    'tar',
    [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-czf',
      archiveTemporary,
      '-C',
      stage,
      '.',
    ],
    { stdio: 'inherit' },
  );
  if (tar.error) throw tar.error;
  if (tar.status !== 0) throw new Error('Release archive creation failed.');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(archiveTemporary)) digest.update(chunk);
  await writeFile(checksumTemporary, digest.digest('hex') + '  ' + archiveName + '\n', {
    mode: 0o644,
  });
  await rename(archiveTemporary, archive);
  await rename(checksumTemporary, checksum);
  console.log('Packaged standalone release: ' + archive);
  console.log('Checksum: ' + checksum);
} finally {
  await rm(temporary, { recursive: true, force: true });
  await rm(archiveTemporary, { force: true });
  await rm(checksumTemporary, { force: true });
}
