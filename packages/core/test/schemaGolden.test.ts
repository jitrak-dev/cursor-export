import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { querySqliteMasterRows } from '../src/schemaMasterSnapshot';
import { writeMinimalCursor3Fixture } from './cursor3Fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(__dirname, '../schema/known-schema.json');

describe('known-schema.json (sqlite_master golden)', () => {
  it('matches the minimal Cursor 3 fixture global DB', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-export-golden-'));
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'));
    const actual = querySqliteMasterRows(fixture.globalStateVscdbPath);
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as {
      rows: typeof actual;
    };
    expect(actual).toEqual(golden.rows);
  });
});
