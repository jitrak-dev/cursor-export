import * as path from 'node:path';

import {
  getItemTableJson,
  hasCursorDiskKvTable,
  hasItemTable,
  openStateVscdbReadonly,
} from './cursorStorageSql';

type OpenedStateDb = ReturnType<typeof openStateVscdbReadonly>;

/** High-level storage era inferred from ItemTable keys (see cursaves docs). */
export type CursorSchemaVersion = 'cursor3' | 'cursor2' | 'unknown';

export type DiagnosticLevel = 'info' | 'warn';

export type DiagnosticFn = (level: DiagnosticLevel, message: string) => void;

export interface StateDbSurfaceReport {
  path: string;
  readable: boolean;
  hasItemTable: boolean;
  hasCursorDiskKV: boolean;
}

export interface CursorStorageSchemaProfile {
  version: CursorSchemaVersion;
  global: StateDbSurfaceReport;
  workspace: StateDbSurfaceReport;
  signals: {
    hasGlobalComposerHeaders: boolean;
    workspaceListsAllComposers: boolean;
    workspaceComposerDataPresent: boolean;
  };
  /** Human-readable reasons (log-friendly; no silent unknown). */
  notes: string[];
}

export interface ComposerSummary {
  composerId: string;
  title: string;
  createdAt: number | null;
  lastUpdatedAt: number | null;
}

export interface DetectCursorStorageSchemaOptions {
  globalDbPath: string;
  workspaceDbPath: string;
  onDiagnostic?: DiagnosticFn;
}

export interface ListComposersForWorkspaceOptions extends DetectCursorStorageSchemaOptions {
  workspaceStorageId: string;
  /** Optional; improves matching for Cursor 3 `workspaceIdentifier.uri`. */
  workspaceFolderFsPath?: string;
}

function noopDiagnostic(): void {
  // no-op
}

function report(
  onDiagnostic: DiagnosticFn | undefined,
  level: DiagnosticLevel,
  message: string,
): void {
  (onDiagnostic ?? noopDiagnostic)(level, message);
}

function inspectSurface(dbFilePath: string): StateDbSurfaceReport {
  const base: StateDbSurfaceReport = {
    path: dbFilePath,
    readable: false,
    hasItemTable: false,
    hasCursorDiskKV: false,
  };
  let db: OpenedStateDb | undefined;
  try {
    db = openStateVscdbReadonly(dbFilePath);
    base.readable = true;
    base.hasItemTable = hasItemTable(db);
    base.hasCursorDiskKV = hasCursorDiskKvTable(db);
  } catch {
    base.readable = false;
  } finally {
    if (db) {
      db.close();
    }
  }
  return base;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readGlobalHeaders(db: OpenedStateDb): unknown | undefined {
  return getItemTableJson(db, 'composer.composerHeaders');
}

function readWorkspaceComposerData(db: OpenedStateDb): unknown | undefined {
  return getItemTableJson(db, 'composer.composerData');
}

function globalHasComposerHeadersJson(data: unknown): boolean {
  if (!isRecord(data)) {
    return false;
  }
  if (!('allComposers' in data)) {
    return false;
  }
  return Array.isArray(data.allComposers);
}

function workspaceHasAllComposersList(data: unknown): boolean {
  if (!isRecord(data)) {
    return false;
  }
  if (!('allComposers' in data)) {
    return false;
  }
  return Array.isArray(data.allComposers);
}

function pickVersion(
  hasGlobalHeaders: boolean,
  workspaceListsAll: boolean,
  globalOk: boolean,
  workspaceOk: boolean,
  notes: string[],
): CursorSchemaVersion {
  if (hasGlobalHeaders) {
    return 'cursor3';
  }
  if (workspaceListsAll) {
    return 'cursor2';
  }
  if (globalOk && workspaceOk) {
    notes.push(
      'Cursor-like ItemTable+cursorDiskKV present, but neither composer.composerHeaders (global) nor composer.composerData.allComposers (workspace) matched known shapes — treat as unknown (migrated/partial or new Cursor layout).',
    );
    return 'unknown';
  }
  notes.push(
    'Missing expected Cursor tables or keys — not a recognizable Cursor chat schema.',
  );
  return 'unknown';
}

/**
 * Inspect global + workspace `state.vscdb` files and infer Cursor 2.x vs 3.x list layout.
 * Does not read `cursorDiskKV` message bodies (ChatExporter will).
 */
export function detectCursorStorageSchema(
  options: DetectCursorStorageSchemaOptions,
): CursorStorageSchemaProfile {
  const { globalDbPath, workspaceDbPath, onDiagnostic } = options;
  const notes: string[] = [];

  const globalSurface = inspectSurface(globalDbPath);
  const workspaceSurface = inspectSurface(workspaceDbPath);

  if (!globalSurface.readable) {
    notes.push(`Global DB not readable at: ${globalDbPath}`);
  }
  if (!workspaceSurface.readable) {
    notes.push(`Workspace DB not readable at: ${workspaceDbPath}`);
  }

  let hasGlobalComposerHeaders = false;
  let workspaceListsAllComposers = false;
  let workspaceComposerDataPresent = false;

  let gdb: OpenedStateDb | undefined;
  let wdb: OpenedStateDb | undefined;
  try {
    if (globalSurface.readable) {
      gdb = openStateVscdbReadonly(globalDbPath);
      const headers = readGlobalHeaders(gdb);
      hasGlobalComposerHeaders = globalHasComposerHeadersJson(headers);
      if (!hasGlobalComposerHeaders && headers !== undefined) {
        notes.push(
          'Global DB has composer.composerHeaders key but JSON is not the Cursor 3 central index shape.',
        );
      }
    }

    if (workspaceSurface.readable) {
      wdb = openStateVscdbReadonly(workspaceDbPath);
      const composerData = readWorkspaceComposerData(wdb);
      workspaceComposerDataPresent = composerData !== undefined;
      workspaceListsAllComposers = workspaceHasAllComposersList(composerData);
      if (workspaceComposerDataPresent && !workspaceListsAllComposers) {
        notes.push(
          'Workspace composer.composerData present without allComposers array (typical after Cursor 3 migration).',
        );
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notes.push(`Unexpected error while reading schema signals: ${msg}`);
    report(onDiagnostic, 'warn', notes[notes.length - 1] ?? msg);
  } finally {
    if (gdb) {
      gdb.close();
    }
    if (wdb) {
      wdb.close();
    }
  }

  const globalOk =
    globalSurface.readable &&
    globalSurface.hasItemTable &&
    globalSurface.hasCursorDiskKV;
  const workspaceOk =
    workspaceSurface.readable &&
    workspaceSurface.hasItemTable &&
    workspaceSurface.hasCursorDiskKV;

  const version = pickVersion(
    hasGlobalComposerHeaders,
    workspaceListsAllComposers,
    globalOk,
    workspaceOk,
    notes,
  );

  if (version === 'unknown') {
    for (const n of notes) {
      report(onDiagnostic, 'warn', n);
    }
  } else {
    report(
      onDiagnostic,
      'info',
      `Detected Cursor storage schema version: ${version} (global=${globalDbPath}, workspace=${workspaceDbPath})`,
    );
  }

  return {
    version,
    global: globalSurface,
    workspace: workspaceSurface,
    signals: {
      hasGlobalComposerHeaders,
      workspaceListsAllComposers,
      workspaceComposerDataPresent,
    },
    notes,
  };
}

function pathsEqualCaseAware(
  a: string,
  b: string,
  platform: NodeJS.Platform,
): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (platform === 'win32' || platform === 'darwin') {
    return ra.toLowerCase() === rb.toLowerCase();
  }
  return ra === rb;
}

function composerRowBelongsToWorkspace(
  row: Record<string, unknown>,
  workspaceStorageId: string,
  workspaceFolderFsPath: string | undefined,
  platform: NodeJS.Platform,
): boolean {
  const wid = row.workspaceIdentifier;
  if (isRecord(wid)) {
    const id = wid.id;
    if (typeof id === 'string' && id === workspaceStorageId) {
      return true;
    }
    const uri = wid.uri;
    if (workspaceFolderFsPath && isRecord(uri)) {
      const fsPath = uri.fsPath;
      if (typeof fsPath === 'string') {
        if (pathsEqualCaseAware(fsPath, workspaceFolderFsPath, platform)) {
          return true;
        }
      }
    }
  }
  return false;
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function mapComposerRow(row: unknown): ComposerSummary | undefined {
  if (!isRecord(row)) {
    return undefined;
  }
  const id = row.composerId;
  const name = row.name;
  if (typeof id !== 'string' || typeof name !== 'string') {
    return undefined;
  }
  const createdAt = coerceFiniteNumber(row.createdAt);
  const lastUpdatedAt = coerceFiniteNumber(row.lastUpdatedAt);
  return {
    composerId: id,
    title: name,
    createdAt,
    lastUpdatedAt,
  };
}

function listFromCursor3Global(
  globalDb: OpenedStateDb,
  workspaceStorageId: string,
  workspaceFolderFsPath: string | undefined,
  platform: NodeJS.Platform,
): ComposerSummary[] {
  const data = readGlobalHeaders(globalDb);
  if (!isRecord(data)) {
    return [];
  }
  const all = data.allComposers;
  if (!Array.isArray(all)) {
    return [];
  }
  const out: ComposerSummary[] = [];
  for (const row of all) {
    if (!isRecord(row)) {
      continue;
    }
    if (
      !composerRowBelongsToWorkspace(
        row,
        workspaceStorageId,
        workspaceFolderFsPath,
        platform,
      )
    ) {
      continue;
    }
    const mapped = mapComposerRow(row);
    if (mapped) {
      out.push(mapped);
    }
  }
  return out;
}

function listFromCursor2Workspace(
  workspaceDb: OpenedStateDb,
): ComposerSummary[] {
  const data = readWorkspaceComposerData(workspaceDb);
  if (!isRecord(data)) {
    return [];
  }
  const all = data.allComposers;
  if (!Array.isArray(all)) {
    return [];
  }
  const out: ComposerSummary[] = [];
  for (const row of all) {
    const mapped = mapComposerRow(row);
    if (mapped) {
      out.push(mapped);
    }
  }
  return out;
}

/**
 * List composer/chat summaries for one workspace using the detected schema version.
 * Opens DBs read-only and closes them before return.
 */
export function listComposersForWorkspace(
  options: ListComposersForWorkspaceOptions,
): { profile: CursorStorageSchemaProfile; composers: ComposerSummary[] } {
  const profile = detectCursorStorageSchema(options);
  const platform = process.platform;

  let gdb: OpenedStateDb | undefined;
  let wdb: OpenedStateDb | undefined;
  try {
    if (!profile.global.readable || !profile.workspace.readable) {
      return { profile, composers: [] };
    }
    gdb = openStateVscdbReadonly(options.globalDbPath);
    wdb = openStateVscdbReadonly(options.workspaceDbPath);

    if (profile.version === 'cursor3') {
      const list = listFromCursor3Global(
        gdb,
        options.workspaceStorageId,
        options.workspaceFolderFsPath,
        platform,
      );
      return { profile, composers: list };
    }

    if (profile.version === 'cursor2') {
      return { profile, composers: listFromCursor2Workspace(wdb) };
    }

    const from3 = listFromCursor3Global(
      gdb,
      options.workspaceStorageId,
      options.workspaceFolderFsPath,
      platform,
    );
    if (from3.length > 0) {
      return { profile, composers: from3 };
    }
    const from2 = listFromCursor2Workspace(wdb);
    if (from2.length > 0) {
      return { profile, composers: from2 };
    }
    return { profile, composers: [] };
  } finally {
    if (gdb) {
      gdb.close();
    }
    if (wdb) {
      wdb.close();
    }
  }
}
