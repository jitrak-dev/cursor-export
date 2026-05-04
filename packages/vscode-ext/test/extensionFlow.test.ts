import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeMinimalCursor3Fixture } from '../../core/test/cursor3Fixture';

type CmdHandler = () => void;

const harness = vi.hoisted(() => {
  const state = {
    outputLines: [] as string[],
    commands: new Map<string, CmdHandler>(),
    showOutputPreserveFocus: [] as (boolean | undefined)[],
    enabled: true,
    workspaceFolderPath: '',
    reset(): void {
      state.outputLines.length = 0;
      state.commands.clear();
      state.showOutputPreserveFocus.length = 0;
      state.enabled = true;
      state.workspaceFolderPath = '';
    },
  };
  return state;
});

const watchMock = vi.fn();

vi.mock('chokidar', () => ({
  default: {
    watch: (...args: unknown[]) => watchMock(...args),
  },
}));

vi.mock('vscode', () => {
  class UriShim {
    constructor(public readonly fsPath: string) {}
    static file(p: string): UriShim {
      return new UriShim(path.resolve(p));
    }
  }

  return {
    Uri: UriShim,
    StatusBarAlignment: { Left: 1 },
    env: { appName: 'Cursor' },
    window: {
      createOutputChannel: () => ({
        appendLine: (line: string) => {
          harness.outputLines.push(line);
        },
        show: (preserveFocus?: boolean) => {
          harness.showOutputPreserveFocus.push(preserveFocus);
        },
      }),
      createStatusBarItem: () => ({
        name: '',
        text: '',
        tooltip: '',
        command: undefined as string | undefined,
        show: vi.fn(),
        hide: vi.fn(),
      }),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      get workspaceFolders() {
        const p = harness.workspaceFolderPath;
        if (!p) {
          return undefined;
        }
        return [{ uri: UriShim.file(p), name: 'ws', index: 0 }];
      },
      getConfiguration: () => ({
        get: (key: string, defaultValue: unknown) => {
          if (key === 'enabled') {
            return harness.enabled;
          }
          if (key === 'outputDirectory') {
            return '';
          }
          if (key === 'debounceMs') {
            return 800;
          }
          if (key === 'workspaceStateDbPath') {
            return '';
          }
          return defaultValue;
        },
      }),
      onDidChangeConfiguration: () => ({ dispose: () => {} }),
      onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    },
    commands: {
      registerCommand: (id: string, handler: CmdHandler) => {
        harness.commands.set(id, handler);
        return { dispose: () => {} };
      },
    },
    Disposable: class {
      constructor(private readonly fn: () => void) {}
      dispose(): void {
        this.fn();
      }
    },
  };
});

import * as vscode from 'vscode';

import { registerCursorExport } from '../src/cursorExportController';

function createChokidarWatcherApi(): {
  readonly api: {
    on: (event: string, fn: (...args: unknown[]) => void) => unknown;
    removeAllListeners: () => void;
    close: () => Promise<void>;
  };
} {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const api = {
    on(event: string, fn: (...args: unknown[]) => void) {
      let bucket = listeners[event];
      if (!bucket) {
        bucket = [];
        listeners[event] = bucket;
      }
      bucket.push(fn);
      if (event === 'ready') {
        queueMicrotask(() => {
          for (const f of listeners['ready'] ?? []) {
            f();
          }
        });
      }
      return api;
    },
    removeAllListeners: vi.fn(),
    close: vi.fn(async () => {}),
  };
  return { api };
}

function prepareEditorLayout(tmp: string): {
  readonly workspaceFolderPath: string;
  readonly globalStorageExtPath: string;
} {
  const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
    includeModel: true,
  });
  fs.mkdirSync(fixture.workspaceFolderPath, { recursive: true });

  const userDir = path.join(tmp, 'user');
  fs.mkdirSync(path.join(userDir, 'globalStorage'), { recursive: true });
  fs.cpSync(
    path.join(fixture.fixtureRoot, 'global', 'state.vscdb'),
    path.join(userDir, 'globalStorage', 'state.vscdb'),
  );
  fs.mkdirSync(
    path.join(userDir, 'workspaceStorage', fixture.workspaceStorageId),
    { recursive: true },
  );
  fs.cpSync(
    path.join(fixture.fixtureRoot, fixture.workspaceStorageId, 'state.vscdb'),
    path.join(
      userDir,
      'workspaceStorage',
      fixture.workspaceStorageId,
      'state.vscdb',
    ),
  );
  fs.writeFileSync(
    path.join(
      userDir,
      'workspaceStorage',
      fixture.workspaceStorageId,
      'workspace.json',
    ),
    JSON.stringify({
      folder: pathToFileURL(fixture.workspaceFolderPath).href,
    }),
    'utf8',
  );

  const globalStorageExt = path.join(
    userDir,
    'globalStorage',
    'jitrak-dev.cursor-export',
  );
  fs.mkdirSync(globalStorageExt, { recursive: true });

  return {
    workspaceFolderPath: fixture.workspaceFolderPath,
    globalStorageExtPath: globalStorageExt,
  };
}

describe('cursorExportController integration (mocked vscode + chokidar)', () => {
  beforeEach(() => {
    harness.reset();
    watchMock.mockReset();
    watchMock.mockImplementation(() => createChokidarWatcherApi().api);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('watches storage, runs initial export, and handles export now / show output', async () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-ext-flow-'),
    );
    const layout = prepareEditorLayout(tmp);
    harness.workspaceFolderPath = layout.workspaceFolderPath;

    const subscriptions: { dispose(): void }[] = [];

    registerCursorExport({
      subscriptions,
      globalStorageUri: vscode.Uri.file(layout.globalStorageExtPath),
    } as vscode.ExtensionContext);

    await Promise.resolve();

    const chatsDir = path.join(layout.workspaceFolderPath, '.cursor', 'chats');
    const mdFiles = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);

    const initialExportLine = harness.outputLines.find((l) =>
      l.includes('[initial] profile='),
    );
    expect(initialExportLine).toBeDefined();
    expect(initialExportLine).toContain('exported=1');

    expect(harness.commands.has('cursorExport.exportNow')).toBe(true);
    expect(harness.commands.has('cursorExport.showOutput')).toBe(true);

    harness.commands.get('cursorExport.exportNow')?.();
    expect(harness.outputLines.some((l) => l.includes('[command]'))).toBe(true);

    harness.commands.get('cursorExport.showOutput')?.();
    expect(harness.showOutputPreserveFocus.length).toBeGreaterThan(0);
    expect(harness.showOutputPreserveFocus.at(-1)).toBe(true);

    expect(watchMock).toHaveBeenCalled();
    const watchedPaths = watchMock.mock.calls[0]?.[0] as string[];
    expect(watchedPaths?.some((p) => p.includes('state.vscdb'))).toBe(true);
  });

  it('does not watch when disabled; manual export still runs', async () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-ext-flow2-'),
    );
    const layout = prepareEditorLayout(tmp);
    harness.workspaceFolderPath = layout.workspaceFolderPath;
    harness.enabled = false;

    const subscriptions: { dispose(): void }[] = [];
    registerCursorExport({
      subscriptions,
      globalStorageUri: vscode.Uri.file(layout.globalStorageExtPath),
    } as vscode.ExtensionContext);

    expect(watchMock).not.toHaveBeenCalled();

    harness.commands.get('cursorExport.exportNow')?.();
    expect(harness.outputLines.some((l) => l.includes('[command]'))).toBe(true);
  });
});
