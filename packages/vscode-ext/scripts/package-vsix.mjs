/**
 * Build a redistributable .vsix without running `npm list` on the pnpm workspace.
 * Stages a folder, `npm install` production deps from packed core + chokidar, then
 * `vsce package` using the `@vscode/vsce` (v3+) binary from `packages/vscode-ext/node_modules`.
 * Staging copies `images/` so README-relative PNGs satisfy vsce 3 (no SVG in README).
 * Intended for Linux / macOS / WSL (POSIX).
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

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
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

  const vsixName = `cursor-export-${version}.vsix`;
  const vsixPath = path.join(extRoot, vsixName);
  const vsceBin = path.join(extRoot, 'node_modules', '.bin', 'vsce');
  if (!fs.existsSync(vsceBin)) {
    throw new Error(
      `vsce not found at ${vsceBin}. Run pnpm install from the repo root.`,
    );
  }
  execSync(`"${vsceBin}" package -o "${vsixPath}"`, {
    cwd: staging,
    stdio: 'inherit',
    shell: true,
  });

  rmrf(staging);
  if (fs.existsSync(tgzSource)) {
    fs.unlinkSync(tgzSource);
  }

  console.log(`Wrote ${vsixPath}`);
}

main();
