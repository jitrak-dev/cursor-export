/**
 * Rebuild better-sqlite3 for the Electron ABI used by the VS Code build we run
 * in extension E2E tests (see e2e-host-versions.json). Required because the
 * extension host loads @cursor-export/core, which loads better-sqlite3 at startup.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const coreRoot = path.resolve(extRoot, '../core');
const pinsPath = path.join(__dirname, 'e2e-host-versions.json');

const requireFromCore = createRequire(path.join(coreRoot, 'package.json'));
const sqlitePkgRoot = path.dirname(
  requireFromCore.resolve('better-sqlite3/package.json'),
);

const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8'));
const electronVer =
  process.env.ELECTRON_EXTENSION_HOST_VERSION?.trim() || pins.electron;

if (!fs.existsSync(sqlitePkgRoot)) {
  console.error(
    'better-sqlite3 not resolved from @cursor-export/core. Run pnpm install from repo root.',
  );
  process.exit(1);
}

console.log(
  `Rebuilding better-sqlite3 for Electron ${electronVer} (E2E / VS Code ${pins.vscode})...`,
);
execSync('npm rebuild better-sqlite3', {
  cwd: sqlitePkgRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVer,
    npm_config_disturl: 'https://electronjs.org/headers',
  },
});
