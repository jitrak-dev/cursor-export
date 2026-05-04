import { globSync } from 'node:fs';
import * as path from 'node:path';

import Mocha from 'mocha';

/**
 * VS Code loads this module in the Extension Host and invokes `run()`.
 * @see https://code.visualstudio.com/api/working-with-extensions/testing-extension
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  const testsRoot = path.resolve(__dirname, '.');
  const files = globSync('**/*.test.js', { cwd: testsRoot });
  for (const f of files) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  return await new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${String(failures)} test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
