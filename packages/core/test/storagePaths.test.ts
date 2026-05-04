import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  findWorkspaceStateVscdbForFolder,
  findWorkspaceStateVscdbUnderStorageRoot,
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
