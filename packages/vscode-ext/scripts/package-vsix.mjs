/**
 * Build a redistributable .vsix without running `npm list` on the pnpm workspace.
 * Stages a folder, `npm install` production deps from packed core + chokidar, then
 * `vsce package --target <platform>` so `better-sqlite3` native binaries match the OS.
 *
 * Usage:
 *   node ./scripts/package-vsix.mjs
 *   node ./scripts/package-vsix.mjs --target darwin-arm64
 *
 * Without `--target`, infers from `process.platform` / `process.arch` (see inferVsceTarget).
 * Output: `packages/vscode-ext/cursor-export-<version>-<target>.vsix`
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extRoot, '../..');
const coreRoot = path.resolve(extRoot, '../core');
const staging = path.join(extRoot, '.vsix-staging');

/** @type {readonly string[]} */
const VALID_VSCE_TARGETS = [
  'win32-x64',
  'win32-arm64',
  'linux-x64',
  'linux-arm64',
  'linux-armhf',
  'darwin-x64',
  'darwin-arm64',
  'alpine-x64',
  'alpine-arm64',
  'web',
];

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function printUsage() {
  console.log(`Usage: node ./scripts/package-vsix.mjs [--target <platform>]

Builds a platform-specific VSIX (required for correct better-sqlite3 native bindings).

--target   One of: ${VALID_VSCE_TARGETS.join(', ')}
           If omitted, inferred from this machine (process.platform / process.arch).

Examples:
  node ./scripts/package-vsix.mjs --target linux-x64
  node ./scripts/package-vsix.mjs --target darwin-arm64
`);
}

function parseArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  let target;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) {
      target = argv[i + 1];
      i++;
    }
  }
  return { target };
}

function inferVsceTarget() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin') {
    return a === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  }
  if (p === 'linux') {
    if (a === 'arm64') {
      return 'linux-arm64';
    }
    if (a === 'arm') {
      return 'linux-armhf';
    }
    return 'linux-x64';
  }
  if (p === 'win32') {
    return a === 'arm64' ? 'win32-arm64' : 'win32-x64';
  }
  throw new Error(
    `Cannot infer VSCE target for platform=${p} arch=${a}. Pass --target explicitly (see --help).`,
  );
}

function assertValidTarget(target) {
  if (!VALID_VSCE_TARGETS.includes(target)) {
    throw new Error(
      `Invalid --target "${target}". Must be one of: ${VALID_VSCE_TARGETS.join(', ')}`,
    );
  }
}

function main() {
  const { target: targetArg } = parseArgs(process.argv.slice(2));
  const target = targetArg ?? inferVsceTarget();
  assertValidTarget(target);

  execSync('pnpm exec tsc -b', { cwd: repoRoot, stdio: 'inherit' });

  const packOut = execSync('pnpm pack', {
    cwd: coreRoot,
    encoding: 'utf8',
  });
  const tgzLine = packOut
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.endsWith('.tgz'));
  if (!tgzLine) {
    throw new Error(`pnpm pack did not produce a .tgz; output:\n${packOut}`);
  }
  const tgzName = path.basename(tgzLine);
  const tgzSource = path.join(coreRoot, tgzName);

  rmrf(staging);
  fs.mkdirSync(staging, { recursive: true });

  const pkg = JSON.parse(
    fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8'),
  );
  const version = String(pkg.version ?? '0.0.0');
  const chokidarRange = pkg.dependencies.chokidar;

  const stagingPkg = {
    name: pkg.name,
    displayName: pkg.displayName,
    version: pkg.version,
    publisher: pkg.publisher,
    description: pkg.description,
    license: pkg.license,
    repository: pkg.repository,
    bugs: pkg.bugs,
    homepage: pkg.homepage,
    keywords: pkg.keywords,
    engines: pkg.engines,
    categories: pkg.categories,
    activationEvents: pkg.activationEvents,
    main: pkg.main,
    contributes: pkg.contributes,
    ...(typeof pkg.icon === 'string' && pkg.icon ? { icon: pkg.icon } : {}),
    dependencies: {
      '@cursor-export/core': 'file:./core.tgz',
      chokidar: chokidarRange,
    },
    scripts: {
      'vscode:prepublish': 'node -e ""',
    },
  };

  fs.copyFileSync(tgzSource, path.join(staging, 'core.tgz'));
  fs.copyFileSync(path.join(extRoot, 'LICENSE'), path.join(staging, 'LICENSE'));
  fs.copyFileSync(
    path.join(extRoot, 'README.md'),
    path.join(staging, 'README.md'),
  );
  fs.cpSync(path.join(extRoot, 'out'), path.join(staging, 'out'), {
    recursive: true,
  });
  if (typeof pkg.icon === 'string' && pkg.icon) {
    const iconSrc = path.join(extRoot, pkg.icon);
    if (fs.existsSync(iconSrc)) {
      const iconDest = path.join(staging, pkg.icon);
      fs.mkdirSync(path.dirname(iconDest), { recursive: true });
      fs.copyFileSync(iconSrc, iconDest);
    } else {
      throw new Error(`package.json "icon" points to missing file: ${iconSrc}`);
    }
  }
  const imagesDir = path.join(extRoot, 'images');
  if (fs.existsSync(imagesDir)) {
    fs.cpSync(imagesDir, path.join(staging, 'images'), { recursive: true });
  }
  fs.writeFileSync(
    path.join(staging, 'package.json'),
    `${JSON.stringify(stagingPkg, null, 2)}\n`,
    'utf8',
  );

  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: staging,
    stdio: 'inherit',
  });

  fs.unlinkSync(path.join(staging, 'core.tgz'));
  fs.copyFileSync(
    path.join(extRoot, '.vscodeignore'),
    path.join(staging, '.vscodeignore'),
  );

  const vsixName = `cursor-export-${version}-${target}.vsix`;
  const vsixPath = path.join(extRoot, vsixName);
  const vsceBin = path.join(extRoot, 'node_modules', '.bin', 'vsce');
  if (!fs.existsSync(vsceBin)) {
    throw new Error(
      `vsce not found at ${vsceBin}. Run pnpm install from the repo root.`,
    );
  }
  execSync(`"${vsceBin}" package --target "${target}" -o "${vsixPath}"`, {
    cwd: staging,
    stdio: 'inherit',
    shell: true,
  });

  rmrf(staging);
  if (fs.existsSync(tgzSource)) {
    fs.unlinkSync(tgzSource);
  }

  console.log(`Wrote ${vsixPath} (target=${target})`);
}

main();
