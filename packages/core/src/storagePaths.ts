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

/**
 * Common drvfs/9p mount roots where the Windows host's `C:\` is exposed
 * inside WSL. Default WSL2 uses `/mnt/c`; advanced configs may set
 * `automount.root = /` (which yields `/c`). We probe both so the desktop
 * `Cursor` user data dir on Windows is discoverable from the WSL extension
 * host without configuration.
 */
const WSL_WINDOWS_USERS_ROOT_CANDIDATES: readonly string[] = [
  '/mnt/c/Users',
  '/c/Users',
];

/** True when the current process looks like a Linux extension host inside WSL. */
function isLikelyWslLinuxRuntime(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): boolean {
  if (platform !== 'linux') {
    return false;
  }
  const distro = env.WSL_DISTRO_NAME?.trim();
  const interop = env.WSL_INTEROP?.trim();
  return Boolean(
    (distro && distro.length > 0) || (interop && interop.length > 0),
  );
}

/**
 * In a Cursor Remote-WSL setup the GUI process is the Windows-side desktop,
 * so per-workspace `state.vscdb` (and the global one) live under
 * `%APPDATA%\Cursor\User` on the Windows host — *not* under the Linux
 * `~/.cursor-server/data/User` that the extension host sees as its `User` dir.
 * Enumerate Windows user profiles via the drvfs mount and return any
 * `<root>/<user>/AppData/Roaming/<App>/User` directories that exist.
 */
function enumerateWindowsHostEditorUserDirectoriesForWsl(
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string[] {
  const fsImpl = options?.fsImpl ?? fs;
  const env = getEnv(options);
  const platform = options?.platform ?? process.platform;
  if (!isLikelyWslLinuxRuntime(env, platform)) {
    return [];
  }
  const app = appFolderName(variant);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const usersRoot of WSL_WINDOWS_USERS_ROOT_CANDIDATES) {
    let users: string[];
    try {
      users = fsImpl.readdirSync(usersRoot);
    } catch {
      continue;
    }
    for (const u of users) {
      const candidate = path.resolve(
        path.join(usersRoot, u, 'AppData', 'Roaming', app, 'User'),
      );
      if (seen.has(candidate)) {
        continue;
      }
      if (isExistingDirectory(fsImpl, candidate)) {
        seen.add(candidate);
        found.push(candidate);
      }
    }
  }
  return found;
}

/**
 * Candidate editor `User` directories to probe, in priority order.
 * Always starts with the primary directory ({@link resolveEditorUserDirectory}).
 *
 * On WSL Linux extension hosts we additionally include the corresponding
 * Windows-side `Cursor` (or `Code`) user dir(s) discovered through the
 * drvfs mount, because Cursor Desktop persists `state.vscdb` on the Windows
 * host even when the workspace is opened over Remote-WSL.
 */
export function resolveCandidateEditorUserDirectories(
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string[] {
  const primary = path.resolve(resolveEditorUserDirectory(variant, options));
  const list: string[] = [primary];
  const seen = new Set<string>([primary]);
  for (const extra of enumerateWindowsHostEditorUserDirectoriesForWsl(
    variant,
    options,
  )) {
    if (seen.has(extra)) {
      continue;
    }
    seen.add(extra);
    list.push(extra);
  }
  return list;
}

/** Candidate `workspaceStorage` roots derived from {@link resolveCandidateEditorUserDirectories}. */
export function resolveCandidateWorkspaceStorageRoots(
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string[] {
  return resolveCandidateEditorUserDirectories(variant, options).map((d) =>
    path.join(d, 'workspaceStorage'),
  );
}

/** Candidate global `state.vscdb` paths derived from {@link resolveCandidateEditorUserDirectories}. */
export function resolveCandidateGlobalStateVscdbPaths(
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string[] {
  return resolveCandidateEditorUserDirectories(variant, options).map((d) =>
    path.join(d, 'globalStorage', 'state.vscdb'),
  );
}

/**
 * First {@link resolveCandidateGlobalStateVscdbPaths} entry that exists as a file.
 * Returns `undefined` when no candidate exists (callers may fall back to the
 * primary path so SQLite reports the more familiar "file not found" error).
 */
export function pickExistingGlobalStateVscdbPath(
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string | undefined {
  const fsImpl = options?.fsImpl ?? fs;
  for (const candidate of resolveCandidateGlobalStateVscdbPaths(
    variant,
    options,
  )) {
    try {
      if (fsImpl.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Missing or unreadable — try the next candidate.
    }
  }
  return undefined;
}

/**
 * Map a `workspace.json` `folder` URI to a filesystem path when the URI
 * refers to the same path space as `WorkspaceFolder.uri.fsPath` on the
 * extension host (`file://` or `vscode-remote://` with an absolute path).
 */
export function workspaceFolderUriToFsPath(
  folderUri: string,
): string | undefined {
  const trimmed = folderUri.trim();
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return undefined;
    }
  }
  const remote = 'vscode-remote://';
  if (trimmed.length > remote.length && trimmed.startsWith(remote)) {
    const rest = trimmed.slice(remote.length);
    const slash = rest.indexOf('/');
    if (slash === -1 || slash === rest.length - 1) {
      return undefined;
    }
    const rawPath = rest.slice(slash);
    try {
      return decodeURIComponent(rawPath);
    } catch {
      return undefined;
    }
  }
  return undefined;
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
  const mappedRaw = workspaceFolderUriToFsPath(folderUri);
  if (!mappedRaw) {
    return undefined;
  }
  const mapped = path.normalize(mappedRaw);
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
 * Supports `file://` and `vscode-remote://` (same-host remote workspaces, e.g. WSL).
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

/**
 * Resolve per-workspace `state.vscdb` for a local folder. Probes every
 * candidate root from {@link resolveCandidateWorkspaceStorageRoots} (so a WSL
 * extension host also sees the Windows-side `Cursor` workspaceStorage) and
 * returns the newest matching `state.vscdb` by mtime across all roots.
 */
export function findWorkspaceStateVscdbForFolder(
  workspaceFolderPath: string,
  variant: EditorVariant,
  options?: FindWorkspaceStateOptions,
): string | undefined {
  const fsImpl = options?.fsImpl ?? fs;
  let bestPath: string | undefined;
  let bestMtime = -1;
  for (const root of resolveCandidateWorkspaceStorageRoots(variant, options)) {
    const candidate = findWorkspaceStateVscdbUnderStorageRoot(
      workspaceFolderPath,
      root,
      options,
    );
    if (!candidate) {
      continue;
    }
    let mtime = 0;
    try {
      mtime = fsImpl.statSync(candidate).mtimeMs;
    } catch {
      // Race: file vanished between scan and stat. Treat as 0 mtime so a later
      // candidate (if any) wins the tiebreak.
    }
    if (mtime >= bestMtime) {
      bestMtime = mtime;
      bestPath = candidate;
    }
  }
  return bestPath;
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
