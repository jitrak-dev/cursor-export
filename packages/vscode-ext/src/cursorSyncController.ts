import * as path from 'node:path';

import {
  DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS,
  type DiagnosticLevel,
  editorVariantFromAppName,
  exportWorkspaceChats,
  findWorkspaceStateVscdbForFolder,
  resolveGlobalStateVscdbPath,
} from '@cursor-sync/core';
import chokidar from 'chokidar';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'cursorSync';

function clampDebounceMs(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 800;
  return Math.min(15_000, Math.max(200, Math.round(n)));
}

function readCursorSyncConfig(): {
  enabled: boolean;
  outputDirectory: string;
  debounceMs: number;
} {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: cfg.get<boolean>('enabled', false),
    outputDirectory: cfg.get<string>('outputDirectory', '').trim(),
    debounceMs: clampDebounceMs(cfg.get<number>('debounceMs', 800)),
  };
}

function resolveOutputDirectory(
  workspaceRoot: string,
  configured: string,
): string | undefined {
  if (!configured) {
    return undefined;
  }
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.join(workspaceRoot, configured);
}

function resolveEditorVariant(): 'cursor' | 'vscode' {
  return editorVariantFromAppName(vscode.env.appName) ?? 'cursor';
}

/**
 * Registers settings-driven file watching (single-root v1), debounced export,
 * commands, and a small status item when watching is enabled.
 */
export function registerCursorSync(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('cursor-sync');

  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    9_000,
  );
  statusItem.name = 'cursor-sync';

  let disposeWatch: (() => void) | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const disposeWatchState = (): void => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    disposeWatch?.();
    disposeWatch = undefined;
  };

  const appendDiagnostic = (level: DiagnosticLevel, message: string): void => {
    output.appendLine(`[${level}] ${message}`);
  };

  const runExport = (reason: string): void => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      output.appendLine(
        `[${reason}] skipped: no workspace folder (cursor-sync v1 uses the first folder only).`,
      );
      return;
    }

    const variant = resolveEditorVariant();
    const cfg = readCursorSyncConfig();
    const outDir = resolveOutputDirectory(
      folder.uri.fsPath,
      cfg.outputDirectory,
    );

    try {
      const result = exportWorkspaceChats({
        workspaceFolderPath: folder.uri.fsPath,
        editorVariant: variant,
        outputDirectory: outDir,
        sqliteBusyTimeoutMs: DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS,
        onDiagnostic: appendDiagnostic,
      });
      output.appendLine(
        `[${reason}] profile=${result.profileVersion} exported=${result.exported.length} skipped=${result.skipped.length} → ${result.outputDirectory}`,
      );
      if (result.skipped.length > 0) {
        for (const s of result.skipped) {
          output.appendLine(`  skip ${s.composerId}: ${s.reason}`);
        }
      }
      statusItem.tooltip = `cursor-sync: last export (${reason}) at ${new Date().toLocaleTimeString()}\n${result.exported.length} file(s)`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      output.appendLine(`[${reason}] export failed: ${msg}`);
      void vscode.window.showErrorMessage(
        `cursor-sync: export failed — ${msg}`,
      );
    }
  };

  const scheduleDebouncedExport = (): void => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    const ms = readCursorSyncConfig().debounceMs;
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      runExport('watch');
    }, ms);
  };

  const syncWatcher = (): void => {
    disposeWatchState();
    const cfg = readCursorSyncConfig();
    if (!cfg.enabled) {
      statusItem.hide();
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      statusItem.text = '$(warning) cursor-sync';
      statusItem.tooltip =
        'cursor-sync: open a folder workspace to resolve chat storage paths.';
      statusItem.command = 'cursorSync.showOutput';
      statusItem.show();
      return;
    }

    const variant = resolveEditorVariant();
    const globalPath = resolveGlobalStateVscdbPath(variant);
    const workspaceDb = findWorkspaceStateVscdbForFolder(
      folder.uri.fsPath,
      variant,
    );
    const paths = [globalPath, workspaceDb].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );

    const watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100,
      },
    });

    const onFsEvent = (): void => {
      scheduleDebouncedExport();
    };

    watcher.on('change', onFsEvent);
    watcher.on('add', onFsEvent);
    watcher.on('error', (err: Error) => {
      output.appendLine(`[watch] chokidar error: ${err.message}`);
    });

    watcher.on('ready', () => {
      runExport('initial');
    });

    disposeWatch = (): void => {
      watcher.removeAllListeners();
      void watcher.close();
    };

    statusItem.text = '$(save-all) cursor-sync';
    statusItem.tooltip = 'cursor-sync: watching storage; click to export now';
    statusItem.command = 'cursorSync.exportNow';
    statusItem.show();
  };

  context.subscriptions.push(
    output,
    statusItem,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        syncWatcher();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      syncWatcher();
    }),
    vscode.commands.registerCommand('cursorSync.exportNow', () => {
      runExport('command');
    }),
    vscode.commands.registerCommand('cursorSync.showOutput', () => {
      output.show(true);
    }),
    new vscode.Disposable(() => {
      disposeWatchState();
    }),
  );

  syncWatcher();
}
