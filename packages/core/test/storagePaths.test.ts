import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  findWorkspaceStateVscdbForFolder,
  findWorkspaceStateVscdbUnderStorageRoot,
  pickExistingGlobalStateVscdbPath,
  resolveCandidateEditorUserDirectories,
  resolveCandidateGlobalStateVscdbPaths,
  resolveCandidateWorkspaceStorageRoots,
  workspaceFolderUriToFsPath,
} from '../src/storagePaths';

describe('workspaceFolderUriToFsPath', () => {
  it('maps file:// URIs', () => {
    const p = path.join(os.tmpdir(), 'cursor-export-uri-test');
    const uri = pathToFileURL(p).href;
    expect(workspaceFolderUriToFsPath(uri)).toBe(p);
  });

  it('maps vscode-remote:// with unencoded authority', () => {
    expect(
      workspaceFolderUriToFsPath(
        'vscode-remote://wsl+Ubuntu-22.04/home/user/myproj',
      ),
    ).toBe('/home/user/myproj');
  });

  it('maps vscode-remote:// with encoded authority', () => {
    expect(
      workspaceFolderUriToFsPath(
        'vscode-remote://wsl%2Bubuntu-22.04/home/user/myproj',
      ),
    ).toBe('/home/user/myproj');
  });

  it('decodes percent-encoding in the path segment', () => {
    expect(
      workspaceFolderUriToFsPath(
        'vscode-remote://wsl+ubuntu/tmp/foo%20bar%2Fbaz',
      ),
    ).toBe('/tmp/foo bar/baz');
  });

  it('returns undefined for unknown schemes', () => {
    expect(workspaceFolderUriToFsPath('sftp://host/path')).toBeUndefined();
  });

  it('returns undefined when vscode-remote has no path', () => {
    expect(workspaceFolderUriToFsPath('vscode-remote://wsl+ubuntu')).toBe(
      undefined,
    );
  });
});

describe('findWorkspaceStateVscdbUnderStorageRoot', () => {
  it('finds state.vscdb when workspace.json folder is vscode-remote', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-sp-remote-'),
    );
    const proj = path.join(tmp, 'proj');
    fs.mkdirSync(proj, { recursive: true });
    const wsRoot = path.join(tmp, 'workspaceStorage');
    const id = 'stabc111';
    const dir = path.join(wsRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    const projForUri = proj.split(path.sep).join('/');
    fs.writeFileSync(
      path.join(dir, 'workspace.json'),
      JSON.stringify({
        folder: `vscode-remote://wsl+ubuntu-22.04${projForUri}`,
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'state.vscdb'), '', 'utf8');

    const found = findWorkspaceStateVscdbUnderStorageRoot(proj, wsRoot, {
      platform: 'linux',
    });
    expect(found).toBe(path.join(dir, 'state.vscdb'));
  });

  it('finds state.vscdb when workspace.json folder is file://', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-sp-file-'),
    );
    const proj = path.join(tmp, 'proj');
    fs.mkdirSync(proj, { recursive: true });
    const wsRoot = path.join(tmp, 'workspaceStorage');
    const id = 'stabc222';
    const dir = path.join(wsRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'workspace.json'),
      JSON.stringify({
        folder: pathToFileURL(proj).href,
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'state.vscdb'), '', 'utf8');

    const found = findWorkspaceStateVscdbUnderStorageRoot(proj, wsRoot, {
      platform: 'linux',
    });
    expect(found).toBe(path.join(dir, 'state.vscdb'));
  });

  it('returns undefined when folder URI does not match', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-sp-nomatch-'),
    );
    const proj = path.join(tmp, 'proj');
    fs.mkdirSync(proj, { recursive: true });
    const wsRoot = path.join(tmp, 'workspaceStorage');
    const dir = path.join(wsRoot, 'other');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'workspace.json'),
      JSON.stringify({
        folder: 'vscode-remote://wsl+ubuntu/tmp/other-project',
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'state.vscdb'), '', 'utf8');

    const found = findWorkspaceStateVscdbUnderStorageRoot(proj, wsRoot, {
      platform: 'linux',
    });
    expect(found).toBeUndefined();
  });

  it('uses editorUserDirectory for remote-style User layout (e.g. .cursor-server)', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-sp-editoruser-'),
    );
    const remoteUser = path.join(tmp, 'User');
    const wsRoot = path.join(remoteUser, 'workspaceStorage');
    const proj = path.join(tmp, 'proj');
    fs.mkdirSync(proj, { recursive: true });
    const id = 'remoteabc999';
    const dir = path.join(wsRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    const projForUri = proj.split(path.sep).join('/');
    fs.writeFileSync(
      path.join(dir, 'workspace.json'),
      JSON.stringify({
        folder: `vscode-remote://wsl+ubuntu${projForUri}`,
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'state.vscdb'), '', 'utf8');

    const found = findWorkspaceStateVscdbForFolder(proj, 'cursor', {
      platform: 'linux',
      editorUserDirectory: remoteUser,
    });
    expect(found).toBe(path.join(dir, 'state.vscdb'));
  });
});

interface WslLayout {
  tmp: string;
  remoteUser: string;
  /** Production-style Windows User path, e.g. `/mnt/c/Users/yosap/AppData/Roaming/Cursor/User`. */
  winUserAsExposed: string;
  /** Where the data actually lives on disk for this test (under tmp). */
  winUserOnDisk: string;
  proj: string;
  /** Production-style Windows state.vscdb path that the API will return. */
  winStateAsExposed: string;
}

function buildWslLayout(): WslLayout {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-export-sp-wsl-'));
  // Linux-side `User` (e.g. ~/.cursor-server/data/User) — empty, mimicking
  // the real Cursor Remote-WSL layout where state.vscdb lives on Windows.
  const remoteUser = path.join(tmp, 'cursor-server', 'data', 'User');
  fs.mkdirSync(path.join(remoteUser, 'workspaceStorage'), { recursive: true });
  fs.mkdirSync(path.join(remoteUser, 'globalStorage'), { recursive: true });

  // Simulated Windows drvfs mount under tmp; a rebasing `fsImpl` maps
  // `/mnt/c/Users/...` -> `<tmp>/mnt/c/Users/...` so the production path is
  // what the function reports while the data lives under tmp.
  const winUserAsExposed = path.join(
    '/mnt/c/Users/yosap/AppData/Roaming/Cursor/User',
  );
  const winUserOnDisk = path.join(tmp, winUserAsExposed);
  fs.mkdirSync(winUserOnDisk, { recursive: true });
  fs.mkdirSync(path.join(winUserOnDisk, 'globalStorage'), { recursive: true });
  fs.writeFileSync(
    path.join(winUserOnDisk, 'globalStorage', 'state.vscdb'),
    '',
    'utf8',
  );

  const proj = path.join(tmp, 'home', 'eji4h', 'works', 'cursor-export');
  fs.mkdirSync(proj, { recursive: true });
  const id = '465170c6b092d2ada19405f3056e1fb8';
  const wsDir = path.join(winUserOnDisk, 'workspaceStorage', id);
  fs.mkdirSync(wsDir, { recursive: true });
  const projForUri = proj.split(path.sep).join('/');
  fs.writeFileSync(
    path.join(wsDir, 'workspace.json'),
    JSON.stringify({ folder: `vscode-remote://wsl%2Bubuntu${projForUri}` }),
    'utf8',
  );
  fs.writeFileSync(path.join(wsDir, 'state.vscdb'), '', 'utf8');

  const winStateAsExposed = path.join(
    winUserAsExposed,
    'workspaceStorage',
    id,
    'state.vscdb',
  );

  return {
    tmp,
    remoteUser,
    winUserAsExposed,
    winUserOnDisk,
    proj,
    winStateAsExposed,
  };
}

function fsImplWithRebasedUsersRoot(rootRebase: {
  from: string;
  to: string;
}): NonNullable<
  Parameters<typeof findWorkspaceStateVscdbForFolder>[2]
>['fsImpl'] {
  function rebase(p: string): string {
    if (p === rootRebase.from || p.startsWith(`${rootRebase.from}/`)) {
      const tail = p.slice(rootRebase.from.length);
      return rootRebase.to + tail;
    }
    return p;
  }
  return {
    readdirSync: ((p: fs.PathLike, ...rest: unknown[]) =>
      // @ts-expect-error variadic forwarding to node:fs typings
      fs.readdirSync(rebase(String(p)), ...rest)) as typeof fs.readdirSync,
    readFileSync: ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) =>
      // @ts-expect-error variadic forwarding to node:fs typings
      fs.readFileSync(rebase(String(p)), ...rest)) as typeof fs.readFileSync,
    statSync: ((p: fs.PathLike, ...rest: unknown[]) =>
      // @ts-expect-error variadic forwarding to node:fs typings
      fs.statSync(rebase(String(p)), ...rest)) as typeof fs.statSync,
    realpathSync: ((p: fs.PathLike, ...rest: unknown[]) =>
      // @ts-expect-error variadic forwarding to node:fs typings
      fs.realpathSync(rebase(String(p)), ...rest)) as typeof fs.realpathSync,
  };
}

describe('WSL Windows-host fallback discovery', () => {
  it('lists Windows-mounted Cursor User dir as a candidate when WSL env vars are set', () => {
    const layout = buildWslLayout();
    const fsImpl = fsImplWithRebasedUsersRoot({
      from: '/mnt/c/Users',
      to: path.join(layout.tmp, 'mnt', 'c', 'Users'),
    });
    const candidates = resolveCandidateEditorUserDirectories('cursor', {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      editorUserDirectory: layout.remoteUser,
      fsImpl,
    });
    expect(candidates[0]).toBe(path.resolve(layout.remoteUser));
    expect(candidates).toContain(path.resolve(layout.winUserAsExposed));
  });

  it('does NOT add Windows candidates when not on WSL Linux', () => {
    const layout = buildWslLayout();
    const fsImpl = fsImplWithRebasedUsersRoot({
      from: '/mnt/c/Users',
      to: path.join(layout.tmp, 'mnt', 'c', 'Users'),
    });
    const candidates = resolveCandidateEditorUserDirectories('cursor', {
      platform: 'linux',
      env: {},
      editorUserDirectory: layout.remoteUser,
      fsImpl,
    });
    expect(candidates).toEqual([path.resolve(layout.remoteUser)]);
  });

  it('finds workspace state.vscdb on Windows host from a WSL extension host', () => {
    const layout = buildWslLayout();
    const fsImpl = fsImplWithRebasedUsersRoot({
      from: '/mnt/c/Users',
      to: path.join(layout.tmp, 'mnt', 'c', 'Users'),
    });
    const found = findWorkspaceStateVscdbForFolder(layout.proj, 'cursor', {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      editorUserDirectory: layout.remoteUser,
      fsImpl,
    });
    expect(found).toBe(layout.winStateAsExposed);
  });

  it('picks Windows-host global state.vscdb when WSL globalStorage has none', () => {
    const layout = buildWslLayout();
    const fsImpl = fsImplWithRebasedUsersRoot({
      from: '/mnt/c/Users',
      to: path.join(layout.tmp, 'mnt', 'c', 'Users'),
    });
    const picked = pickExistingGlobalStateVscdbPath('cursor', {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      editorUserDirectory: layout.remoteUser,
      fsImpl,
    });
    expect(picked).toBe(
      path.join(layout.winUserAsExposed, 'globalStorage', 'state.vscdb'),
    );
  });

  it('exposes derived candidate root and global-path lists', () => {
    const layout = buildWslLayout();
    const fsImpl = fsImplWithRebasedUsersRoot({
      from: '/mnt/c/Users',
      to: path.join(layout.tmp, 'mnt', 'c', 'Users'),
    });
    const opts = {
      platform: 'linux' as const,
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      editorUserDirectory: layout.remoteUser,
      fsImpl,
    };
    const wsRoots = resolveCandidateWorkspaceStorageRoots('cursor', opts);
    expect(wsRoots).toContain(
      path.join(layout.winUserAsExposed, 'workspaceStorage'),
    );
    const globals = resolveCandidateGlobalStateVscdbPaths('cursor', opts);
    expect(globals).toContain(
      path.join(layout.winUserAsExposed, 'globalStorage', 'state.vscdb'),
    );
  });
});
