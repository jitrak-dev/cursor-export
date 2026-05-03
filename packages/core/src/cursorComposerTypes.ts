import { isJsonObject, type JsonValue } from './cursorStorageJson';

/** `workspaceIdentifier.uri` shape in `composer.composerHeaders` (Cursor 3). */
export interface ComposerWorkspaceUri {
  readonly scheme?: string;
  readonly fsPath?: string;
  readonly external?: string;
  readonly path?: string;
}

/** `workspaceIdentifier` on a composer row (Cursor 3). */
export interface ComposerWorkspaceIdentifier {
  readonly id?: string;
  readonly uri?: ComposerWorkspaceUri;
}

/** Parsed `composer.composerHeaders` ItemTable value (Cursor 3 central index). */
export interface ComposerHeadersPayload {
  readonly allComposers: JsonValue[];
}

/** Parsed `composer.composerData` ItemTable value (workspace). */
export interface ComposerWorkspaceDataPayload {
  readonly allComposers: JsonValue[];
}

export function parseComposerHeadersPayload(
  value: JsonValue | undefined,
): ComposerHeadersPayload | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  if (!('allComposers' in value)) {
    return undefined;
  }
  const ac = value['allComposers'];
  if (!Array.isArray(ac)) {
    return undefined;
  }
  return { allComposers: ac as JsonValue[] };
}

export function parseComposerWorkspaceDataPayload(
  value: JsonValue | undefined,
): ComposerWorkspaceDataPayload | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  if (!('allComposers' in value)) {
    return undefined;
  }
  const ac = value['allComposers'];
  if (!Array.isArray(ac)) {
    return undefined;
  }
  return { allComposers: ac as JsonValue[] };
}
