import Database from 'better-sqlite3';

import { type JsonValue, parseJsonFromUtf8 } from './cursorStorageJson';

/** Opened `better-sqlite3` connection (see `export =` typing on `@types/better-sqlite3`). */
export type SqliteDatabase = InstanceType<typeof Database>;

/** Open Cursor/VS Code `state.vscdb` read-only (WAL-consistent reads follow SQLite rules). */
export function openStateVscdbReadonly(filePath: string): SqliteDatabase {
  return new Database(filePath, { readonly: true, fileMustExist: true });
}

function tableHasKeyValueColumns(db: SqliteDatabase, table: string): boolean {
  let rows: { name: string }[];
  try {
    rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as {
      name: string;
    }[];
  } catch {
    return false;
  }
  const names = new Set(rows.map((r) => r.name.toLowerCase()));
  return names.has('key') && names.has('value');
}

/** SQLite identifier quoter for PRAGMA/table names we control (ItemTable, cursorDiskKV). */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQLite identifier: ${name}`);
  }
  return `"${name}"`;
}

export function hasItemTable(db: SqliteDatabase): boolean {
  try {
    const row = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ItemTable'`,
      )
      .get() as { name?: string } | undefined;
    if (!row?.name) {
      return false;
    }
    return tableHasKeyValueColumns(db, 'ItemTable');
  } catch {
    return false;
  }
}

export function hasCursorDiskKvTable(db: SqliteDatabase): boolean {
  try {
    const row = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cursorDiskKV'`,
      )
      .get() as { name?: string } | undefined;
    if (!row?.name) {
      return false;
    }
    return tableHasKeyValueColumns(db, 'cursorDiskKV');
  } catch {
    return false;
  }
}

export function getItemTableJson(
  db: SqliteDatabase,
  key: string,
): JsonValue | undefined {
  const row = db
    .prepare('SELECT value FROM ItemTable WHERE key = ?')
    .get(key) as { value: Buffer | Uint8Array } | undefined;
  if (!row?.value) {
    return undefined;
  }
  const buf = Buffer.isBuffer(row.value) ? row.value : Buffer.from(row.value);
  const text = buf.toString('utf8');
  return parseJsonFromUtf8(text);
}
