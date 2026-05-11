import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  type AgentTranscriptCopyResult,
  copyAgentTranscripts,
} from './agentTranscriptCopy';
import {
  readExcludedComposerIds,
  writeExcludedComposerIds,
} from './chatExportExcluded';
import {
  buildUniqueMarkdownStem,
  pickExportEpochMs,
} from './chatExportFilename';
import {
  type ChatIndexEntryV1,
  mergeAndWriteChatIndex,
  readOptionalChatIndexFile,
  writeTextFileAtomic,
} from './chatExportFs';
import {
  buildComposerMarkdownBody,
  buildYamlFrontMatter,
  iso8601FromEpochMs,
  loadComposerDataJson,
  modelFromComposerData,
} from './chatExportMarkdown';
import type { JsonObject } from './cursorStorageJson';
import {
  type ComposerSummary,
  type CursorStorageSchemaProfile,
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
  pickExistingGlobalStateVscdbPath,
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
  /**
   * When `true`, skips rewriting Markdown when `index.json` already lists this composer with the
   * same `title` and `updated` timestamp and the file still exists.
   * Default `undefined` / `false`: always rewrite (library callers stay backward compatible).
   */
  skipUnchanged?: boolean;
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

export interface ExcludedChatExport {
  composerId: string;
  reason: string;
}

function skipReasonForUnreadableStateDbs(
  profile: CursorStorageSchemaProfile,
): string {
  const parts: string[] = [
    'Cannot read one or both state.vscdb files (export needs global + workspace).',
  ];
  if (!profile.global.readable) {
    const err = profile.global.openError
      ? ` — ${profile.global.openError}`
      : '';
    parts.push(`Global: ${profile.global.path}${err}`);
  }
  if (!profile.workspace.readable) {
    const err = profile.workspace.openError
      ? ` — ${profile.workspace.openError}`
      : '';
    parts.push(`Workspace: ${profile.workspace.path}${err}`);
  }
  return parts.join(' ');
}

export interface ChatExportResult {
  profileVersion: string;
  /** Files written this run (full Markdown rewrite). */
  exported: ExportedChatFile[];
  /** Same shape as exported; skipped rewrite because DB metadata matched index + file on disk. */
  unchanged: ExportedChatFile[];
  /** Deliberately not exported (exclude list or missing file auto-exclude). */
  excluded: ExcludedChatExport[];
  skipped: SkippedChatExport[];
  outputDirectory: string;
  indexRelativePath: string;
  agentTranscripts?: AgentTranscriptCopyResult;
}

type PreloadedComposer = {
  data: JsonObject;
  title: string;
  updatedIso: string;
  model: string;
};

function markdownAbsolutePathUnderOutputDir(
  outputDirectory: string,
  relativePath: string,
): string | undefined {
  if (relativePath.length === 0 || relativePath.includes('\0')) {
    return undefined;
  }
  const resolved = path.resolve(outputDirectory, relativePath);
  const root = path.resolve(outputDirectory);
  if (resolved === root) {
    return undefined;
  }
  const rel = path.relative(root, resolved);
  if (rel.startsWith(`..${path.sep}`) || rel === '..') {
    return undefined;
  }
  return resolved;
}

function stemFromRelativeMarkdownPath(relativePath: string): string {
  return relativePath.endsWith('.md')
    ? relativePath.slice(0, -'.md'.length)
    : relativePath;
}

function excludedSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }
  return true;
}

function loadComposerPreloadedOrSkip(opts: {
  globalDb: SqliteDatabase;
  workspaceDb: SqliteDatabase;
  summary: ComposerSummary;
}): PreloadedComposer | { kind: 'skip'; composerId: string; reason: string } {
  const data = loadComposerDataJson(
    opts.globalDb,
    opts.summary.composerId,
    opts.workspaceDb,
  );
  if (!data) {
    return {
      kind: 'skip',
      composerId: opts.summary.composerId,
      reason:
        'Missing composerData entry in global or workspace state.vscdb (looked up composerData:<id> in ItemTable and cursorDiskKV)',
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
  return { data, title, updatedIso, model };
}

function writeComposerMarkdownFile(opts: {
  globalDb: SqliteDatabase;
  workspaceDb: SqliteDatabase;
  summary: ComposerSummary;
  outDir: string;
  occupiedStems: Set<string>;
  preloaded: PreloadedComposer;
}): ExportedChatFile {
  const { data, title, updatedIso, model } = opts.preloaded;
  const stem = buildUniqueMarkdownStem(
    pickExportEpochMs(opts.summary, data),
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
    opts.workspaceDb,
  );
  const md = buildYamlFrontMatter({ title, model, updatedIso }) + body;
  writeTextFileAtomic(absPath, md);

  return {
    composerId: opts.summary.composerId,
    relativePath,
    title,
    updatedIso,
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

  const skipUnchanged = options.skipUnchanged === true;

  const pathOpts = options.editorUserDirectory
    ? { editorUserDirectory: options.editorUserDirectory }
    : undefined;

  const globalPath =
    options.globalStateDbPath ??
    pickExistingGlobalStateVscdbPath(options.editorVariant, pathOpts) ??
    resolveGlobalStateVscdbPath(options.editorVariant, pathOpts);

  const workspaceDbPath =
    options.workspaceStateDbPath ??
    findWorkspaceStateVscdbForFolder(
      options.workspaceFolderPath,
      options.editorVariant,
      pathOpts,
    );

  const emptyOutcome = (
    profileVersion: string,
    skipped: SkippedChatExport[],
  ): ChatExportResult => ({
    profileVersion,
    exported: [],
    unchanged: [],
    excluded: [],
    skipped,
    outputDirectory: outDir,
    indexRelativePath: 'index.json',
  });

  if (!workspaceDbPath) {
    return emptyOutcome('unresolved', [
      {
        composerId: '*',
        reason:
          'Could not resolve workspace state.vscdb path (open this folder in the editor once, or set cursorExport.workspaceStateDbPath to the workspaceStorage/*/state.vscdb file)',
      },
    ]);
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

  const { profile, composers } = listComposersForWorkspace(listOpts);

  if (!profile.global.readable || !profile.workspace.readable) {
    return emptyOutcome(profile.version, [
      {
        composerId: '*',
        reason: skipReasonForUnreadableStateDbs(profile),
      },
    ]);
  }

  const indexAbs = path.join(outDir, 'index.json');
  const priorIndex = readOptionalChatIndexFile(indexAbs);
  const initialExcludedIds = readExcludedComposerIds(outDir);
  const excludedIds = new Set(initialExcludedIds);

  const gdb = openStateVscdbReadonly(globalPath, { busyTimeoutMs: busyMs });
  const wdb = openStateVscdbReadonly(workspaceDbPath, {
    busyTimeoutMs: busyMs,
  });
  const exported: ExportedChatFile[] = [];
  const unchanged: ExportedChatFile[] = [];
  const excluded: ExcludedChatExport[] = [];
  const skipped: SkippedChatExport[] = [];
  const indexEntries: Record<string, ChatIndexEntryV1> = {};
  const occupiedStems = new Set<string>();

  try {
    for (const c of composers) {
      const preOrSkip = loadComposerPreloadedOrSkip({
        globalDb: gdb,
        workspaceDb: wdb,
        summary: c,
      });
      if ('kind' in preOrSkip && preOrSkip.kind === 'skip') {
        skipped.push({
          composerId: preOrSkip.composerId,
          reason: preOrSkip.reason,
        });
        continue;
      }
      const preloaded = preOrSkip as PreloadedComposer;
      const composerId = c.composerId;

      if (excludedIds.has(composerId)) {
        excluded.push({
          composerId,
          reason:
            'Composer id is listed in .cursor-export-excluded-composers.json (remove the id to export again)',
        });
        continue;
      }

      const idxEntry = priorIndex?.chats[composerId];
      if (idxEntry) {
        const absMd = markdownAbsolutePathUnderOutputDir(outDir, idxEntry.path);
        const filePresent =
          absMd !== undefined &&
          fs.existsSync(absMd) &&
          fs.statSync(absMd).isFile();
        if (!filePresent) {
          excludedIds.add(composerId);
          excluded.push({
            composerId,
            reason:
              'Exported Markdown file listed in index.json is missing (auto-excluded; remove the id from .cursor-export-excluded-composers.json to export again)',
          });
          continue;
        }

        if (
          skipUnchanged &&
          idxEntry.updated === preloaded.updatedIso &&
          idxEntry.title === preloaded.title
        ) {
          occupiedStems.add(stemFromRelativeMarkdownPath(idxEntry.path));
          unchanged.push({
            composerId,
            relativePath: idxEntry.path,
            title: preloaded.title,
            updatedIso: preloaded.updatedIso,
          });
          continue;
        }
      }

      const written = writeComposerMarkdownFile({
        globalDb: gdb,
        workspaceDb: wdb,
        summary: c,
        outDir,
        occupiedStems,
        preloaded,
      });
      exported.push(written);
      indexEntries[written.composerId] = {
        path: written.relativePath,
        title: written.title,
        updated: written.updatedIso,
      };
    }
  } finally {
    gdb.close();
    wdb.close();
  }

  mergeAndWriteChatIndex(indexAbs, indexEntries);

  if (!excludedSetsEqual(excludedIds, initialExcludedIds)) {
    writeExcludedComposerIds(outDir, excludedIds);
  }

  const agentTranscripts = copyAgentTranscripts({
    workspaceFolderPath: options.workspaceFolderPath,
    outputDirectory: outDir,
    onDiagnostic: options.onDiagnostic,
  });

  return {
    profileVersion: profile.version,
    exported,
    unchanged,
    excluded,
    skipped,
    outputDirectory: outDir,
    indexRelativePath: 'index.json',
    agentTranscripts,
  };
}
