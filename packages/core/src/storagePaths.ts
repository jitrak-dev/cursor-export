import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isJsonObject, parseJsonFromUtf8 } from './cursorStorageJson';

/** Which editor install to resolve paths for (Cursor vs stock VS Code). */
export type EditorVariant = 'cursor' | 'vscode';

/** Options for resolving the editor `User` directory from OS + env. */
export interface EditorUserDirectoryOptions {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  platform?: NodeJS.Platform;
  /** When set, used as the full `.../User` path (skips OS rules; for tests). */
  editorUserDirectory?: string;
}

export interface FindWorkspaceStateOptions extends EditorUserDirectoryOptions {
  /** Injected filesystem (defaults to `node:fs`); use in tests. */
  fsImpl?: Pick<typeof fs, 'readdirSync' | 'readFileSync' | 'statSync'> & {
    realpathSync?: typeof fs.realpathSync;
  };
}

function getEnv(o?: EditorUserDirectoryOptions): NodeJS.ProcessEnv {
  return o?.env ?? process.env;
}

function getHome(o?: EditorUserDirectoryOptions): string {
  return o?.homedir?.() ?? os.homedir();
}

function appFolderName(variant: EditorVariant): string {
  if (variant === 'cursor') {
    return 'Cursor';
  }
  return 'Code';
}

/**
 * Directory that contains `workspaceStorage/` and `globalStorage/`
 * (e.g. `~/Library/Application Support/Cursor/User` on macOS).
 */
export function resolveEditorUserDirectory(
  variant: EditorVariant,
  options?: EditorUserDirectoryOptions,
): string {
  if (options?.editorUserDirectory) {
    return path.resolve(options.editorUserDirectory);
  }

  const env = getEnv(options);
  const home = getHome(options);
  const platform = options?.platform ?? process.platform;
  const app = appFolderName(variant);

  if (platform === 'win32') {
    const appData = env.APPDATA?.trim();
    if (!appData) {
      throw new Error(
        'Cannot resolve editor User directory on Windows: environment variable APPDATA is missing or empty',
      );
    }
    return path.join(appData, app, 'User');
  }

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', app, 'User');
  }

  const xdgConfig =
    env.XDG_CONFIG_HOME?.trim() && env.XDG_CONFIG_HOME.trim().length > 0
      ? env.XDG_CONFIG_HOME.trim()
      : path.join(home, '.config');
  return path.join(xdgConfig, app, 'User');
}

/** `workspaceStorage` root for the given editor variant. */
export function resolveWorkspaceStorageRoot(
  variant: EditorVariant,
  options?: EditorUserDirectoryOptions,
): string {
  return path.join(
    resolveEditorUserDirectory(variant, options),
    'workspaceStorage',
  );
}

/**
 * Global `state.vscdb` (Cursor 3.x chat index and shared composer data live here).
 * See: https://github.com/Callum-Ward/cursaves/blob/main/docs/how-cursor-stores-chats.md
 */
export function resolveGlobalStateVscdbPath(
  variant: EditorVariant,
  options?: EditorUserDirectoryOptions,
): string {
  return path.join(
    resolveEditorUserDirectory(variant, options),
    'globalStorage',
    'state.vscdb',
  );
}

function folderUriToFsPath(folderUri: string): string | undefined {
  if (!folderUri.startsWith('file://')) {
    return undefined;
  }
  try {
    return fileURLToPath(folderUri);
  } catch {
    return undefined;
  }
}

function pathsEqual(a: string, b: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32' || platform === 'darwin') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function tryRealpath(
  fsImpl: NonNullable<FindWorkspaceStateOptions['fsImpl']>,
  p: string,
): string {
  if (fsImpl.realpathSync) {
    try {
      return fsImpl.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  }
  return path.resolve(p);
}

type WorkspaceScanFs = NonNullable<FindWorkspaceStateOptions['fsImpl']>;

function isExistingDirectory(fsImpl: WorkspaceScanFs, dir: string): boolean {
  try {
    return fsImpl.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Returns `folder` URI string from `workspace.json`, or `undefined` if missing/invalid. */
function tryReadWorkspaceJsonFolderUri(
  fsImpl: WorkspaceScanFs,
  workspaceDir: string,
): string | undefined {
  let raw: string;
  try {
    raw = fsImpl.readFileSync(
      path.join(workspaceDir, 'workspace.json'),
      'utf8',
    );
  } catch {
    return undefined;
  }
  const ws = parseJsonFromUtf8(raw);
  if (!isJsonObject(ws) || !('folder' in ws)) {
    return undefined;
  }
  const folder = ws['folder'];
  if (typeof folder !== 'string') {
    return undefined;
  }
  return folder;
}

/**
 * If `workspaceDir` maps to the same folder as `targetResolved`, return its
 * `state.vscdb` path and mtime; otherwise `undefined`.
 */
function tryMatchingStateVscdbInDir(
  fsImpl: WorkspaceScanFs,
  workspaceDir: string,
  targetResolved: string,
  platform: NodeJS.Platform,
): { dbPath: string; mtime: number } | undefined {
  const folderUri = tryReadWorkspaceJsonFolderUri(fsImpl, workspaceDir);
  if (!folderUri) {
    return undefined;
  }
  const mapped = folderUriToFsPath(folderUri);
  if (!mapped) {
    return undefined;
  }
  const resolvedMapped = tryRealpath(fsImpl, mapped);
  if (!pathsEqual(targetResolved, resolvedMapped, platform)) {
    return undefined;
  }
  const dbPath = path.join(workspaceDir, 'state.vscdb');
  let dbStat: fs.Stats;
  try {
    dbStat = fsImpl.statSync(dbPath);
  } catch {
    return undefined;
  }
  if (!dbStat.isFile()) {
    return undefined;
  }
  return { dbPath, mtime: dbStat.mtimeMs };
}

/**
 * Scan `workspaceStorage` for a `workspace.json` whose `folder` URI matches
 * `workspaceFolderPath`, and return the newest matching `state.vscdb` by mtime.
 * Only `file://` workspace folders are supported (local single-folder workspaces).
 */
export function findWorkspaceStateVscdbUnderStorageRoot(
  workspaceFolderPath: string,
  workspaceStorageRoot: string,
  options?: FindWorkspaceStateOptions,
): string | undefined {
  const fsImpl = options?.fsImpl ?? fs;
  const platform = options?.platform ?? process.platform;
  const target = tryRealpath(fsImpl, workspaceFolderPath);

  let bestPath: string | undefined;
  let bestMtime = -1;

  let names: string[];
  try {
    names = fsImpl.readdirSync(workspaceStorageRoot);
  } catch {
    return undefined;
  }

  for (const name of names) {
    const dir = path.join(workspaceStorageRoot, name);
    if (!isExistingDirectory(fsImpl, dir)) {
      continue;
    }
    const entry = tryMatchingStateVscdbInDir(fsImpl, dir, target, platform);
    if (!entry) {
      continue;
    }
    if (entry.mtime >= bestMtime) {
      bestMtime = entry.mtime;
      bestPath = entry.dbPath;
    }
  }

  return bestPath;
}

/** Resolve per-workspace `state.vscdb` for a local folder using the default editor `User` path. */
export function findWorkspaceStateVscdbForFolder(
  workspaceFolderPath: string,
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string | undefined {
  const root = resolveWorkspaceStorageRoot(variant, options);
  return findWorkspaceStateVscdbUnderStorageRoot(
    workspaceFolderPath,
    root,
    options,
  );
}

/**
 * Opaque workspace id: basename of the directory that contains `state.vscdb`
 * (matches `workspaceIdentifier.id` in Cursor 3 `composer.composerHeaders`).
 */
export function workspaceStorageIdFromStateVscdbPath(
  stateVscdbPath: string,
): string {
  return path.basename(path.dirname(path.resolve(stateVscdbPath)));
}

/**
 * Map `vscode.env.appName` (or similar) to an editor variant.
 * Returns `undefined` when the host is not recognized.
 */
export function editorVariantFromAppName(
  appName: string,
): EditorVariant | undefined {
  const lower = appName.trim().toLowerCase();
  if (lower.includes('cursor')) {
    return 'cursor';
  }
  if (
    lower.includes('visual studio code') ||
    lower === 'code' ||
    lower.includes('vscode')
  ) {
    return 'vscode';
  }
  return undefined;
}
