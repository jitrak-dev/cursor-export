/**
 * Publish built VSIX file(s) to the public Open VSX Registry (open-vsx.org).
 * Uses `pnpm exec ovsx` from this package's devDependency (reliable in CI).
 * Token: OPEN_VSX_TOKEN (repo / GitHub Actions) or OVSX_PAT (ovsx default).
 *
 * Resolution order for which file(s) to publish:
 * 1. CLI: `node publish-openvsx.mjs /absolute/or/relative/path.vsix`
 * 2. Env PUBLISH_VSIX or VSIX_PATH — single file path
 * 3. Env VSCE_TARGET — publish `cursor-export-<version>-<VSCE_TARGET>.vsix` in this package dir
 * 4. All `cursor-export-<version>-*.vsix` in this package dir (same version as package.json)
 * 5. Legacy `cursor-export-<version>.vsix` if present
 *
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

/**
 * @param {string} version
 * @returns {string[]}
 */
function resolveVsixPaths(version) {
  const argvPath = process.argv[2]?.trim();
  if (argvPath) {
    const abs = path.isAbsolute(argvPath)
      ? argvPath
      : path.join(process.cwd(), argvPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`VSIX not found: ${abs}`);
    }
    return [abs];
  }

  const fromEnv =
    process.env['PUBLISH_VSIX']?.trim() || process.env['VSIX_PATH']?.trim();
  if (fromEnv) {
    const abs = path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(process.cwd(), fromEnv);
    if (!fs.existsSync(abs)) {
      throw new Error(`VSIX not found (PUBLISH_VSIX/VSIX_PATH): ${abs}`);
    }
    return [abs];
  }

  const vsceTarget = process.env['VSCE_TARGET']?.trim();
  if (vsceTarget) {
    const name = `cursor-export-${version}-${vsceTarget}.vsix`;
    const p = path.join(extRoot, name);
    if (!fs.existsSync(p)) {
      throw new Error(
        `VSIX not found for VSCE_TARGET=${vsceTarget}: ${p}\nRun package first: pnpm extension:package -- --target ${vsceTarget}`,
      );
    }
    return [p];
  }

  let names;
  try {
    names = fs.readdirSync(extRoot);
  } catch (e) {
    throw new Error(`Cannot read extension directory: ${extRoot}: ${e}`);
  }

  const prefix = `cursor-export-${version}-`;
  const platformVsix = names.filter(
    (n) => n.startsWith(prefix) && n.endsWith('.vsix'),
  );
  if (platformVsix.length > 0) {
    return platformVsix.map((n) => path.join(extRoot, n));
  }

  const legacy = path.join(extRoot, `cursor-export-${version}.vsix`);
  if (fs.existsSync(legacy)) {
    return [legacy];
  }

  throw new Error(
    `No VSIX found under ${extRoot} for version ${version}.\n` +
      'Expected cursor-export-<version>-<target>.vsix (platform-specific build).\n' +
      'Run: pnpm extension:package [-- --target <platform>]',
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

  const paths = resolveVsixPaths(version);
  for (const vsixPath of paths) {
    console.log(`Publishing ${vsixPath}`);
    execSync(`pnpm exec ovsx publish "${vsixPath}"`, {
      cwd: extRoot,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, OVSX_PAT: pat },
    });
  }
}

main();
