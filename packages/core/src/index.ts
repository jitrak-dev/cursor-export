export {
  type ChatExporterOptions,
  type ChatExportResult,
  type ExportedChatFile,
  exportWorkspaceChats,
  type SkippedChatExport,
} from './chatExporter';
export {
  buildUniqueMarkdownStem,
  pickExportEpochMs,
  slugifyForFilename,
  toUtcDatePrefix,
} from './chatExportFilename';
export {
  type ChatIndexEntryV1,
  type ChatIndexFileV1,
  mergeAndWriteChatIndex,
  writeTextFileAtomic,
} from './chatExportFs';
export {
  buildComposerMarkdownBody,
  buildYamlFrontMatter,
  iso8601FromEpochMs,
  loadComposerDataJson,
  modelFromComposerData,
} from './chatExportMarkdown';
export {
  type ComposerHeadersPayload,
  type ComposerWorkspaceDataPayload,
  type ComposerWorkspaceIdentifier,
  type ComposerWorkspaceUri,
  parseComposerHeadersPayload,
  parseComposerWorkspaceDataPayload,
} from './cursorComposerTypes';
export {
  isJsonObject,
  type JsonArray,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  parseJsonFromUtf8,
} from './cursorStorageJson';
export {
  type ComposerSummary,
  type CursorSchemaVersion,
  type CursorStorageSchemaProfile,
  detectCursorStorageSchema,
  type DetectCursorStorageSchemaOptions,
  type DiagnosticFn,
  type DiagnosticLevel,
  listComposersForWorkspace,
  type ListComposersForWorkspaceOptions,
  type StateDbSurfaceReport,
} from './cursorStorageSchema';
export {
  DEFAULT_STATE_VSCDB_BUSY_TIMEOUT_MS,
  getCursorDiskKvJson,
  getItemTableJson,
  hasCursorDiskKvTable,
  hasItemTable,
  openStateVscdbReadonly,
  type SqliteDatabase,
} from './cursorStorageSql';
export {
  type EditorUserDirectoryOptions,
  type EditorVariant,
  editorVariantFromAppName,
  type FindWorkspaceStateOptions,
  findWorkspaceStateVscdbForFolder,
  findWorkspaceStateVscdbUnderStorageRoot,
  resolveEditorUserDirectory,
  resolveGlobalStateVscdbPath,
  resolveWorkspaceStorageRoot,
  workspaceStorageIdFromStateVscdbPath,
} from './storagePaths';

/** Smoke check that the workspace package resolves. */
export function ping(): string {
  return 'cursor-export-core';
}
