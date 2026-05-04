/**
 * Runs extension E2E: native rebuild for pinned VS Code/Electron, then @vscode/test-electron.
 * On Linux without DISPLAY, requires `xvfb-run` (package xvfb) for a virtual framebuffer.
 */
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const runTestJs = path.join(extRoot, 'out/test/runTest.js');
const coreRoot = path.resolve(extRoot, '../core');
const requireFromCore = createRequire(path.join(coreRoot, 'package.json'));
const sqlitePkgRoot = path.dirname(
  requireFromCore.resolve('better-sqlite3/package.json'),
);

function which(cmd) {
  const paths = (process.env.PATH ?? '').split(path.delimiter);
  for (const p of paths) {
    const full = path.join(p, cmd);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return full;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const forceXvfb =
  process.env.CURSOR_EXPORT_E2E_USE_XVFB === '1' ||
  process.env.E2E_USE_XVFB === '1';
const noDisplay =
  process.platform === 'linux' && !(process.env.DISPLAY ?? '').trim();
const useXvfb = forceXvfb || noDisplay;
const xvfbRun = useXvfb ? which('xvfb-run') : null;

if (useXvfb && !xvfbRun) {
  const hint = forceXvfb
    ? 'E2E_USE_XVFB=1 was set but xvfb-run is not in PATH.'
    : 'No DISPLAY on Linux.';
  console.error(
    [
      `E2E tests need a display (VS Code / Electron). ${hint}`,
      'Fix one of:',
      '  • Use a working DISPLAY (WSLg, VcXsrv, etc.), or',
      '  • Install xvfb, then either:',
      '      – unset DISPLAY and re-run, or',
      '      – E2E_USE_XVFB=1 pnpm test:e2e   (forces xvfb-run even if DISPLAY is set)',
      '    Debian/Ubuntu: sudo apt install xvfb',
    ].join('\n'),
  );
  process.exit(1);
}

function rebuildBetterSqliteForNode() {
  console.log('Rebuilding better-sqlite3 for Node.js (restore after E2E)...');
  const env = { ...process.env };
  delete env.npm_config_runtime;
  delete env.npm_config_target;
  delete env.npm_config_disturl;
  execSync('npm rebuild better-sqlite3', {
    cwd: sqlitePkgRoot,
    stdio: 'inherit',
    shell: true,
    env,
  });
}

let didElectronNativeRebuild = false;
let exitCode = 1;
try {
  execSync('node ./scripts/rebuild-better-sqlite-for-e2e.mjs', {
    cwd: extRoot,
    stdio: 'inherit',
  });
  didElectronNativeRebuild = true;

  const runner = xvfbRun ?? process.execPath;
  const args = xvfbRun ? ['-a', process.execPath, runTestJs] : [runTestJs];
  const childEnv = { ...process.env };
  if (xvfbRun && forceXvfb) {
    delete childEnv.DISPLAY;
    delete childEnv.WAYLAND_DISPLAY;
  }
  const r = spawnSync(runner, args, {
    cwd: extRoot,
    stdio: 'inherit',
    env: childEnv,
  });
  exitCode = r.status === null ? 1 : r.status;
} finally {
  if (didElectronNativeRebuild) {
    try {
      rebuildBetterSqliteForNode();
    } catch (e) {
      console.error('Failed to restore better-sqlite3 for Node.js:', e);
      exitCode = 1;
    }
  }
}
process.exit(exitCode);
