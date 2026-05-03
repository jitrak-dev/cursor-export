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
  return 'cursor-logs-core';
}
