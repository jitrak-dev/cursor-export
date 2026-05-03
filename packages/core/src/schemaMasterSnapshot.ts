import Database from 'better-sqlite3';

/** One row from `sqlite_master` (stable ordering for golden files). */
export interface SqliteMasterRow {
  readonly type: string;
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string | null;
}

/**
 * Returns `sqlite_master` rows for user-defined schema objects (excludes
 * `sqlite_*` internal objects), sorted for deterministic JSON snapshots.
 */
export function querySqliteMasterRows(dbPath: string): SqliteMasterRow[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT type, name, tbl_name, sql
         FROM sqlite_master
         WHERE name IS NOT NULL
           AND name NOT GLOB 'sqlite*'
         ORDER BY type ASC, name ASC, tbl_name ASC`,
      )
      .all() as SqliteMasterRow[];
    return rows;
  } finally {
    db.close();
  }
}
