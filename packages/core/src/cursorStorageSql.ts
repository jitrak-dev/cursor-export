import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import Database from 'better-sqlite3';

import { type JsonValue, parseJsonFromUtf8 } from './cursorStorageJson';

/** Opened `better-sqlite3` connection (see `export =` typing on `@types/better-sqlite3`). */
export type SqliteDatabase = InstanceType<typeof Database>;

/** Default `busy_timeout` (ms) for read-only `state.vscdb` opens (see `openStateVscdbReadonly`). */
export const DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS = 8000;

/**
 * SQLite error codes signalling that we cannot open the WAL `-shm`/`-wal`
 * sidecars at `filePath`. Most commonly produced when a Cursor extension host
 * inside WSL reads the Windows-host `state.vscdb` over the drvfs/9p mount —
 * Microsoft's drvfs does not implement the POSIX shared-memory + locking
 * primitives that SQLite WAL mode needs.
 *
 * See https://www.sqlite.org/wal.html ("WAL does not work over a network
 * filesystem") and the WSL2 + SQLite-WAL bug threads referenced in the README.
 */
const WAL_SIDECAR_OPEN_FAILURE_CODES = new Set<string>([
  'SQLITE_IOERR_SHMOPEN',
  'SQLITE_IOERR_SHMMAP',
  'SQLITE_IOERR_SHMLOCK',
  'SQLITE_IOERR_SHMSIZE',
  'SQLITE_CANTOPEN',
  'SQLITE_PROTOCOL',
]);

function isWalSidecarOpenError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && WAL_SIDECAR_OPEN_FAILURE_CODES.has(code);
}

/**
 * Files SQLite may need to read alongside the main database when the
 * connection enters WAL mode. The `-wal` content is required for read
 * consistency; `-shm` is the WAL-index shared memory image. Copying
 * both alongside the main file gives the WAL-mode reader everything
 * it needs without touching the live files.
 */
const SQLITE_WAL_SIDECAR_SUFFIXES = ['-wal', '-shm'] as const;

function tryCopySidecar(
  srcMain: string,
  dstMain: string,
  suffix: string,
): void {
  const src = `${srcMain}${suffix}`;
  const dst = `${dstMain}${suffix}`;
  try {
    if (!fs.existsSync(src)) {
      return;
    }
    fs.copyFileSync(src, dst);
  } catch {
    // Sidecar copy is best-effort: SQLite synthesises an empty WAL/-shm
    // when missing. Surfacing a copy failure here would mask the real
    // root cause once the read actually fails.
  }
}

/**
 * Snapshot `filePath` (plus its `-wal`/`-shm` sidecars when present) into
 * a fresh tmp directory. Returns the new main path so callers can hand it
 * to `better-sqlite3`.
 */
function snapshotStateVscdbToTmp(filePath: string): {
  tmpDir: string;
  tmpDbPath: string;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-export-vscdb-'));
  const tmpDbPath = path.join(tmpDir, path.basename(filePath));
  fs.copyFileSync(filePath, tmpDbPath);
  for (const suffix of SQLITE_WAL_SIDECAR_SUFFIXES) {
    tryCopySidecar(filePath, tmpDbPath, suffix);
  }
  return { tmpDir, tmpDbPath };
}

/**
 * Wrap `db.close()` so the tmp snapshot dir disappears when the caller
 * closes the connection. Idempotent: rmSync with `force: true` tolerates
 * a missing dir if the user (or vitest cleanup) already removed it.
 */
function attachTmpDirCleanup(
  db: SqliteDatabase,
  tmpDir: string,
): SqliteDatabase {
  const originalClose = db.close.bind(db);
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort: leaving a few stray bytes in the OS tmpdir is
      // strictly better than throwing during cleanup.
    }
  };
  // better-sqlite3's TS types declare `close()` as returning the Database for
  // chaining, so preserve that contract while we slot the cleanup in.
  (db as unknown as { close: () => SqliteDatabase }).close =
    (): SqliteDatabase => {
      try {
        return originalClose();
      } finally {
        cleanup();
      }
    };
  return db;
}

/**
 * Probe a freshly-opened connection by issuing the same `sqlite_master`
 * query the rest of the codebase uses. better-sqlite3 opens the database
 * file lazily, so the WAL sidecar I/O failure only surfaces on the first
 * statement; running this canary lets us trigger the copy-to-tmp fallback
 * before the caller ever sees an error.
 */
function probeStateVscdb(db: SqliteDatabase): void {
  db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' LIMIT 1",
  ).get();
}

/**
 * Open Cursor/VS Code `state.vscdb` read-only. WAL-mode reads need the
 * `-shm`/`-wal` sidecars, which SQLite cannot use across the WSL drvfs
 * mount where the Windows-host `Cursor/User/...` files live. When that
 * path fails we transparently snapshot the DB (plus sidecars) into the
 * Linux tmpdir and reopen there, deleting the snapshot when the caller
 * closes the connection. Local-disk paths take the fast direct path.
 */
export function openStateVscdbReadonly(
  filePath: string,
  options?: { busyTimeoutMs?: number },
): SqliteDatabase {
  const ms = options?.busyTimeoutMs ?? DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS;
  let db: SqliteDatabase | undefined;
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true });
    db.pragma(`busy_timeout = ${ms}`);
    probeStateVscdb(db);
    return db;
  } catch (e) {
    if (db) {
      try {
        db.close();
      } catch {
        // Already failing; the close error is uninteresting.
      }
    }
    if (!isWalSidecarOpenError(e)) {
      throw e;
    }
  }

  const snapshot = snapshotStateVscdbToTmp(filePath);
  let snapshotDb: SqliteDatabase;
  try {
    snapshotDb = new Database(snapshot.tmpDbPath, {
      readonly: true,
      fileMustExist: true,
    });
    snapshotDb.pragma(`busy_timeout = ${ms}`);
    probeStateVscdb(snapshotDb);
  } catch (e) {
    try {
      fs.rmSync(snapshot.tmpDir, { recursive: true, force: true });
    } catch {
      // ignore — leave it to the OS tmp reaper
    }
    throw e;
  }
  return attachTmpDirCleanup(snapshotDb, snapshot.tmpDir);
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
  if (!/^[A-Za-z_]\w*$/.test(name)) {
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

export function getCursorDiskKvJson(
  db: SqliteDatabase,
  key: string,
): JsonValue | undefined {
  const row = db
    .prepare('SELECT value FROM cursorDiskKV WHERE key = ?')
    .get(key) as { value: Buffer | Uint8Array } | undefined;
  if (!row?.value) {
    return undefined;
  }
  const buf = Buffer.isBuffer(row.value) ? row.value : Buffer.from(row.value);
  const text = buf.toString('utf8');
  return parseJsonFromUtf8(text);
}
