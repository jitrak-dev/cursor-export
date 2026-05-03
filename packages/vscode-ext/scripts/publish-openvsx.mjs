/**
 * Publish the built VSIX to the public Open VSX Registry (open-vsx.org).
 * Uses `pnpm dlx ovsx@0.10.1` so ovsx is not a package dependency (vsce stays only for VSIX packaging).
 * Token: OPEN_VSX_TOKEN (repo / GitHub Actions) or OVSX_PAT (ovsx default).
 * From repo root: OPEN_VSX_TOKEN=<token> pnpm extension:publish
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');

function getPat() {
  return (
    process.env['OPEN_VSX_TOKEN']?.trim() ||
    process.env['OVSX_PAT']?.trim() ||
    ''
  );
}

function main() {
  const pat = getPat();
  if (!pat) {
    console.error(
      'Missing Open VSX token. Create one at https://open-vsx.org/user-settings/tokens\n' +
        '  (namespace must match `publisher` in package.json, e.g. jitrak-dev)\n' +
        'Then run:\n' +
        '  OPEN_VSX_TOKEN=<token> pnpm extension:publish\n' +
        'Alternatively set OVSX_PAT (same value; ovsx default env name).\n',
    );
    process.exit(1);
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8'),
  );
  const version = String(pkg.version ?? '0.0.0');
  const vsixName = `cursor-logs-${version}.vsix`;
  const vsixPath = path.join(extRoot, vsixName);

  if (!fs.existsSync(vsixPath)) {
    console.error(
      `VSIX not found: ${vsixPath}\nRun first: pnpm extension:package`,
    );
    process.exit(1);
  }

  execSync(`pnpm dlx ovsx@0.10.1 publish "${vsixPath}"`, {
    cwd: extRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, OVSX_PAT: pat },
  });
}

main();
