import * as path from 'node:path';

import {
  DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS,
  type DiagnosticLevel,
  editorVariantFromAppName,
  exportWorkspaceChats,
  findWorkspaceStateVscdbForFolder,
  resolveGlobalStateVscdbPath,
} from '@cursor-export/core';
import chokidar from 'chokidar';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'cursorExport';

function clampDebounceMs(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 800;
  return Math.min(15_000, Math.max(200, Math.round(n)));
}

function readCursorExportConfig(): {
  enabled: boolean;
  outputDirectory: string;
  debounceMs: number;
  workspaceStateDbPath: string | undefined;
} {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const rawDb = cfg.get<string>('workspaceStateDbPath', '').trim();
  const workspaceStateDbPath =
    rawDb.length > 0 && path.isAbsolute(rawDb) ? rawDb : undefined;
  return {
    enabled: cfg.get<boolean>('enabled', false),
    outputDirectory: cfg.get<string>('outputDirectory', '').trim(),
    debounceMs: clampDebounceMs(cfg.get<number>('debounceMs', 800)),
    workspaceStateDbPath,
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
 * Resolve the editor `User` directory for this extension host (contains
 * `workspaceStorage/`, `globalStorage/`). Uses `globalStorageUri`, which always
 * lives under `.../User/globalStorage/<extension-id>/`, so it matches desktop
 * Linux/macOS/Windows, WSL, SSH, and dev containers without hard-coding
 * `~/.config/Cursor` vs `~/.cursor-server/data` paths.
 */
function editorUserDirectoryFromExtensionContext(
  context: vscode.ExtensionContext,
): { editorUserDirectory: string } {
  const globalStorage = context.globalStorageUri.fsPath;
  return {
    editorUserDirectory: path.resolve(
      path.dirname(path.dirname(globalStorage)),
    ),
  };
}

/**
 * Registers settings-driven file watching (single-root v1), debounced export,
 * commands, and a small status item when watching is enabled.
 */
export function registerCursorExport(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Cursor Export');

  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    9_000,
  );
  statusItem.name = 'Cursor Export';

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
        `[${reason}] skipped: no workspace folder (Cursor Export v1 uses the first folder only).`,
      );
      return;
    }

    const variant = resolveEditorVariant();
    const storageOpts = editorUserDirectoryFromExtensionContext(context);
    const cfg = readCursorExportConfig();
    const outDir = resolveOutputDirectory(
      folder.uri.fsPath,
      cfg.outputDirectory,
    );

    try {
      const result = exportWorkspaceChats({
        workspaceFolderPath: folder.uri.fsPath,
        editorVariant: variant,
        ...storageOpts,
        outputDirectory: outDir,
        ...(cfg.workspaceStateDbPath
          ? { workspaceStateDbPath: cfg.workspaceStateDbPath }
          : {}),
        sqliteBusyTimeoutMs: DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS,
        onDiagnostic: appendDiagnostic,
      });
      const agentInfo = result.agentTranscripts
        ? ` agents=${result.agentTranscripts.copied.length} plans=${result.agentTranscripts.plans.copied.length}`
        : '';
      output.appendLine(
        `[${reason}] profile=${result.profileVersion} exported=${result.exported.length} skipped=${result.skipped.length}${agentInfo} → ${result.outputDirectory}`,
      );
      if (result.skipped.length > 0) {
        for (const s of result.skipped) {
          output.appendLine(`  skip ${s.composerId}: ${s.reason}`);
        }
      }
      if (result.agentTranscripts?.copied.length) {
        for (const a of result.agentTranscripts.copied) {
          output.appendLine(
            `  agent ${a.sourceRelativePath} → ${a.destinationRelativePath}`,
          );
        }
      }
      if (result.agentTranscripts?.skipped.length) {
        for (const s of result.agentTranscripts.skipped) {
          output.appendLine(`  skip agent ${s.relativePath}: ${s.reason}`);
        }
      }
      if (result.agentTranscripts?.plans.copied.length) {
        for (const p of result.agentTranscripts.plans.copied) {
          output.appendLine(
            `  plan ${p.sourceRelativePath} → ${p.destinationRelativePath}`,
          );
        }
      }
      if (result.agentTranscripts?.plans.skipped.length) {
        for (const s of result.agentTranscripts.plans.skipped) {
          output.appendLine(`  skip plan ${s.relativePath}: ${s.reason}`);
        }
      }
      statusItem.tooltip = `Cursor Export: last export (${reason}) at ${new Date().toLocaleTimeString()}\n${result.exported.length} file(s)`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      output.appendLine(`[${reason}] export failed: ${msg}`);
      void vscode.window.showErrorMessage(
        `Cursor Export: export failed — ${msg}`,
      );
    }
  };

  const scheduleDebouncedExport = (): void => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    const ms = readCursorExportConfig().debounceMs;
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      runExport('watch');
    }, ms);
  };

  const syncWatcher = (): void => {
    disposeWatchState();
    const cfg = readCursorExportConfig();
    if (!cfg.enabled) {
      statusItem.text = '$(circle-outline) cursor-export';
      statusItem.tooltip =
        'Cursor Export: disabled (click for help)\nSet cursorExport.enabled: true in settings to start watching chat storage.';
      statusItem.command = 'cursorExport.showOutput';
      statusItem.show();
      // Show informational message in output about how to enable
      output.appendLine(
        '[info] Cursor Export is disabled by default for privacy.',
      );
      output.appendLine(
        '[info] To enable: Set cursorExport.enabled = true in settings (Ctrl+,)',
      );
      output.appendLine(
        '[info] This will watch state.vscdb and export chats to .cursor/chats/',
      );
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      statusItem.text = '$(warning) cursor-export';
      statusItem.tooltip =
        'Cursor Export: open a folder workspace to resolve chat storage paths.';
      statusItem.command = 'cursorExport.showOutput';
      statusItem.show();
      return;
    }

    const variant = resolveEditorVariant();
    const storageOpts = editorUserDirectoryFromExtensionContext(context);
    const globalPath = resolveGlobalStateVscdbPath(variant, storageOpts);
    const workspaceDb =
      cfg.workspaceStateDbPath ??
      findWorkspaceStateVscdbForFolder(folder.uri.fsPath, variant, storageOpts);
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

    statusItem.text = '$(save-all) cursor-export';
    statusItem.tooltip = 'Cursor Export: watching storage; click to export now';
    statusItem.command = 'cursorExport.exportNow';
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
    vscode.commands.registerCommand('cursorExport.exportNow', () => {
      runExport('command');
    }),
    vscode.commands.registerCommand('cursorExport.showOutput', () => {
      output.show(true);
    }),
    new vscode.Disposable(() => {
      disposeWatchState();
    }),
  );

  syncWatcher();
}
