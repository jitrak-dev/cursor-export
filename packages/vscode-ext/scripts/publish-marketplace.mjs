/**
 * Publish the built VSIX to the Visual Studio Marketplace (same listing Cursor uses).
 * Requires env VSCE_PAT (Personal Access Token with Marketplace > Manage scope).
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');

function main() {
  if (!process.env['VSCE_PAT']?.trim()) {
    console.error(
      'Missing VSCE_PAT. Create a PAT: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token\n' +
        '  (Organization: All accessible, Scope: Marketplace > Manage)\n' +
        'Then run:\n' +
        '  VSCE_PAT=<token> pnpm extension:publish',
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

  execSync(`npx --yes @vscode/vsce publish -i "${vsixPath}"`, {
    cwd: extRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
}

main();
