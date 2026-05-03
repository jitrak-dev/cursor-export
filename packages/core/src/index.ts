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
} from './storagePaths';

/** Smoke check that the workspace package resolves. */
export function ping(): string {
  return 'cursor-logs-core';
}
