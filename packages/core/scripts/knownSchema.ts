/**
 * Golden schema tooling for `state.vscdb` surface checks (CI + local).
 *
 * - `dump` — write `packages/core/schema/known-schema.json` from the minimal
 *   Cursor 3 test fixture, or from `CURSOR_STATE_DB` when set.
 * - `diff` — compare live dump to the committed golden (exit 1 on mismatch).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { querySqliteMasterRows } from '../src/schemaMasterSnapshot';
import { writeMinimalCursor3Fixture } from '../test/cursor3Fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_JSON = path.join(__dirname, '../schema/known-schema.json');

interface KnownSchemaFile {
  readonly description: string;
  readonly dbRole: 'global' | 'workspace';
  readonly rows: ReturnType<typeof querySqliteMasterRows>;
}

function readGolden(): KnownSchemaFile {
  const raw = fs.readFileSync(SCHEMA_JSON, 'utf8');
  return JSON.parse(raw) as KnownSchemaFile;
}

function stableStringify(
  rows: ReturnType<typeof querySqliteMasterRows>,
): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

function resolveActualDbPath(): string {
  const fromEnv = process.env['CURSOR_STATE_DB']?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-logs-schema-'));
  const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'));
  return fixture.globalStateVscdbPath;
}

function cmdDump(): void {
  const dbPath = resolveActualDbPath();
  const rows = querySqliteMasterRows(dbPath);
  const payload: KnownSchemaFile = {
    description:
      'sqlite_master snapshot for Cursor-style state.vscdb (see packages/core/test/cursor3Fixture). Regenerate: pnpm schema:dump',
    dbRole: 'global',
    rows,
  };
  fs.mkdirSync(path.dirname(SCHEMA_JSON), { recursive: true });
  fs.writeFileSync(
    SCHEMA_JSON,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
  console.log(`Wrote ${SCHEMA_JSON} (${rows.length} sqlite_master rows)`);
}

function cmdDiff(): void {
  const golden = readGolden();
  const dbPath = resolveActualDbPath();
  const actual = querySqliteMasterRows(dbPath);
  const a = stableStringify(actual);
  const b = stableStringify(golden.rows);
  if (a !== b) {
    console.error(
      'Schema drift: sqlite_master differs from packages/core/schema/known-schema.json',
    );
    console.error('--- actual (fixture or CURSOR_STATE_DB)');
    console.error(a);
    console.error('--- expected (golden)');
    console.error(b);
    process.exit(1);
  }
  console.log('Schema OK: sqlite_master matches known-schema.json');
}

const cmd = process.argv[2];
if (cmd === 'dump') {
  cmdDump();
} else if (cmd === 'diff') {
  cmdDiff();
} else {
  console.error('Usage: tsx knownSchema.ts <dump|diff>');
  process.exit(2);
}
