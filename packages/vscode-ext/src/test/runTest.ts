import * as fs from 'node:fs';
import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const pinsPath = path.resolve(
    extensionDevelopmentPath,
    'scripts/e2e-host-versions.json',
  );
  const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8')) as {
    vscode: string;
  };
  const fixtureWorkspace = path.resolve(
    extensionDevelopmentPath,
    'test/fixtures/e2e-workspace',
  );

  try {
    await runTests({
      version: pins.vscode,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [fixtureWorkspace],
    });
  } catch (err) {
    console.error('Extension E2E tests failed:', err);
    process.exit(1);
  }
}

void main();
