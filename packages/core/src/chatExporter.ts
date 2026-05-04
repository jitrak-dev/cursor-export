import * as path from 'node:path';

import {
  buildUniqueMarkdownStem,
  pickExportEpochMs,
} from './chatExportFilename';
import {
  type ChatIndexEntryV1,
  mergeAndWriteChatIndex,
  writeTextFileAtomic,
} from './chatExportFs';
import {
  buildComposerMarkdownBody,
  buildYamlFrontMatter,
  iso8601FromEpochMs,
  loadComposerDataJson,
  modelFromComposerData,
} from './chatExportMarkdown';
import {
  type ComposerSummary,
  detectCursorStorageSchema,
  type DiagnosticFn,
  listComposersForWorkspace,
} from './cursorStorageSchema';
import {
  DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS,
  openStateVscdbReadonly,
  type SqliteDatabase,
} from './cursorStorageSql';
import {
  type EditorVariant,
  findWorkspaceStateVscdbForFolder,
  resolveGlobalStateVscdbPath,
  workspaceStorageIdFromStateVscdbPath,
} from './storagePaths';

export interface ChatExporterOptions {
  workspaceFolderPath: string;
  editorVariant: EditorVariant;
  /**
   * When set, used as the editor `User` directory (contains `workspaceStorage/`, `globalStorage/`).
   * Required for correct resolution in **remote** extension hosts (WSL, SSH, Dev Container), where
   * data lives under `~/.cursor-server/data/User` or `~/.vscode-server/data/User` instead of the
   * desktop default (`~/.config/Cursor/User` on Linux).
   */
  editorUserDirectory?: string;
  /** Defaults to `<workspace>/.cursor/chats`. */
  outputDirectory?: string;
  globalStateDbPath?: string;
  workspaceStateDbPath?: string;
  workspaceStorageId?: string;
  /** Passed to SQLite `busy_timeout` (ms). Default {@link DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS}. */
  sqliteBusyTimeoutMs?: number;
  onDiagnostic?: DiagnosticFn;
}

export interface ExportedChatFile {
  composerId: string;
  relativePath: string;
  title: string;
  updatedIso: string;
}

export interface SkippedChatExport {
  composerId: string;
  reason: string;
}

export interface ChatExportResult {
  profileVersion: string;
  exported: ExportedChatFile[];
  skipped: SkippedChatExport[];
  outputDirectory: string;
  indexRelativePath: string;
}

type OneExportResult =
  | { kind: 'ok'; value: ExportedChatFile }
  | { kind: 'skip'; composerId: string; reason: string };

function runOneComposerExport(opts: {
  globalDb: SqliteDatabase;
  summary: ComposerSummary;
  outDir: string;
  occupiedStems: Set<string>;
}): OneExportResult {
  const data = loadComposerDataJson(opts.globalDb, opts.summary.composerId);
  if (!data) {
    return {
      kind: 'skip',
      composerId: opts.summary.composerId,
      reason: 'Missing composerData entry in global DB',
    };
  }

  const fromData =
    typeof data['name'] === 'string' && data['name'].trim().length > 0
      ? data['name'].trim()
      : undefined;
  const title = fromData ?? opts.summary.title;

  const epoch = pickExportEpochMs(opts.summary, data);
  const updatedIso = iso8601FromEpochMs(epoch);
  const model = modelFromComposerData(data);
  const stem = buildUniqueMarkdownStem(
    epoch,
    title,
    opts.summary.composerId,
    opts.occupiedStems,
    80,
  );
  const relativePath = `${stem}.md`;
  const absPath = path.join(opts.outDir, relativePath);

  const body = buildComposerMarkdownBody(
    opts.globalDb,
    opts.summary.composerId,
    data,
  );
  const md = buildYamlFrontMatter({ title, model, updatedIso }) + body;
  writeTextFileAtomic(absPath, md);

  return {
    kind: 'ok',
    value: {
      composerId: opts.summary.composerId,
      relativePath,
      title,
      updatedIso,
    },
  };
}

/**
 * Export all composer chats for the workspace to Markdown + `index.json`
 * under the output directory (atomic writes; SQLite `busy_timeout` on reads).
 */
export function exportWorkspaceChats(
  options: ChatExporterOptions,
): ChatExportResult {
  const busyMs =
    options.sqliteBusyTimeoutMs ?? DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS;
  const outDir =
    options.outputDirectory ??
    path.join(options.workspaceFolderPath, '.cursor', 'chats');

  const pathOpts = options.editorUserDirectory
    ? { editorUserDirectory: options.editorUserDirectory }
    : undefined;

  const globalPath =
    options.globalStateDbPath ??
    resolveGlobalStateVscdbPath(options.editorVariant, pathOpts);

  const workspaceDbPath =
    options.workspaceStateDbPath ??
    findWorkspaceStateVscdbForFolder(
      options.workspaceFolderPath,
      options.editorVariant,
      pathOpts,
    );

  if (!workspaceDbPath) {
    return {
      profileVersion: 'unresolved',
      exported: [],
      skipped: [
        {
          composerId: '*',
          reason: 'Could not resolve workspace state.vscdb path',
        },
      ],
      outputDirectory: outDir,
      indexRelativePath: 'index.json',
    };
  }

  const workspaceStorageId =
    options.workspaceStorageId ??
    workspaceStorageIdFromStateVscdbPath(workspaceDbPath);

  const listOpts = {
    globalDbPath: globalPath,
    workspaceDbPath,
    workspaceStorageId,
    workspaceFolderFsPath: options.workspaceFolderPath,
    onDiagnostic: options.onDiagnostic,
  };

  const profile = detectCursorStorageSchema(listOpts);
  const { composers } = listComposersForWorkspace(listOpts);

  const gdb = openStateVscdbReadonly(globalPath, { busyTimeoutMs: busyMs });
  const exported: ExportedChatFile[] = [];
  const skipped: SkippedChatExport[] = [];
  const indexEntries: Record<string, ChatIndexEntryV1> = {};
  const occupiedStems = new Set<string>();

  try {
    for (const c of composers) {
      const row = runOneComposerExport({
        globalDb: gdb,
        summary: c,
        outDir,
        occupiedStems,
      });
      if (row.kind === 'ok') {
        exported.push(row.value);
        indexEntries[row.value.composerId] = {
          path: row.value.relativePath,
          title: row.value.title,
          updated: row.value.updatedIso,
        };
      } else {
        skipped.push({ composerId: row.composerId, reason: row.reason });
      }
    }
  } finally {
    gdb.close();
  }

  const indexAbs = path.join(outDir, 'index.json');
  mergeAndWriteChatIndex(indexAbs, indexEntries);

  return {
    profileVersion: profile.version,
    exported,
    skipped,
    outputDirectory: outDir,
    indexRelativePath: 'index.json',
  };
}
