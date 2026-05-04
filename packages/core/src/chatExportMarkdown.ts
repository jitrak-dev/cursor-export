import {
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from './cursorStorageJson';
import {
  getCursorDiskKvJson,
  getItemTableJson,
  hasCursorDiskKvTable,
  type SqliteDatabase,
} from './cursorStorageSql';

export function modelFromComposerData(data: JsonObject): string {
  const mc = data['modelConfig'];
  if (!isJsonObject(mc)) {
    return 'unknown';
  }
  const name = mc['modelName'];
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim();
  }
  return 'unknown';
}

export function iso8601FromEpochMs(ms: number): string {
  return new Date(ms).toISOString();
}

function yamlScalarDoubleQuoted(value: string): string {
  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`);
  return `"${escaped}"`;
}

export function buildYamlFrontMatter(fields: {
  title: string;
  model: string;
  updatedIso: string;
}): string {
  const titleLine = `title: ${yamlScalarDoubleQuoted(fields.title)}`;
  const modelLine = `model: ${yamlScalarDoubleQuoted(fields.model)}`;
  const updatedLine = `updated: ${yamlScalarDoubleQuoted(fields.updatedIso)}`;
  return `---\n${titleLine}\n${modelLine}\n${updatedLine}\n---\n\n`;
}

function labelForBubbleType(typeVal: JsonValue | undefined): string {
  if (typeVal === 1) {
    return 'User';
  }
  if (typeVal === 2) {
    return 'Assistant';
  }
  return 'Message';
}

function bodyFromConversationMap(data: JsonObject): string | undefined {
  const headers = data['fullConversationHeadersOnly'];
  const map = data['conversationMap'];
  if (!Array.isArray(headers) || !isJsonObject(map)) {
    return undefined;
  }
  const chunks: string[] = [];
  for (const h of headers) {
    if (!isJsonObject(h)) {
      continue;
    }
    const bid = h['bubbleId'];
    if (typeof bid !== 'string') {
      continue;
    }
    const bubble = map[bid];
    if (!isJsonObject(bubble)) {
      continue;
    }
    const text = bubble['text'];
    if (typeof text !== 'string' || text.length === 0) {
      continue;
    }
    const label = labelForBubbleType(h['type']);
    chunks.push(`## ${label}`, '', text, '');
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return chunks.join('\n');
}

function bodyFromCursorDiskKvOneDb(
  db: SqliteDatabase,
  composerId: string,
  data: JsonObject,
): string | undefined {
  if (!hasCursorDiskKvTable(db)) {
    return undefined;
  }
  const headers = data['fullConversationHeadersOnly'];
  if (!Array.isArray(headers)) {
    return undefined;
  }
  const chunks: string[] = [];
  for (const h of headers) {
    if (!isJsonObject(h)) {
      continue;
    }
    const bid = h['bubbleId'];
    if (typeof bid !== 'string') {
      continue;
    }
    const key = `bubbleId:${composerId}:${bid}`;
    const bubble = getCursorDiskKvJson(db, key);
    if (!isJsonObject(bubble)) {
      continue;
    }
    const text = bubble['text'];
    if (typeof text !== 'string' || text.length === 0) {
      continue;
    }
    const label = labelForBubbleType(h['type']);
    chunks.push(`## ${label}`, '', text, '');
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return chunks.join('\n');
}

function bodyFromCursorDiskKv(
  globalDb: SqliteDatabase,
  workspaceDb: SqliteDatabase | undefined,
  composerId: string,
  data: JsonObject,
): string | undefined {
  const primary = bodyFromCursorDiskKvOneDb(globalDb, composerId, data);
  if (primary != null && primary.length > 0) {
    return primary;
  }
  if (workspaceDb) {
    return bodyFromCursorDiskKvOneDb(workspaceDb, composerId, data);
  }
  return undefined;
}

/**
 * @param workspaceDb Optional workspace `state.vscdb` — newer Cursor builds may store
 *   `composerData:{id}` and `cursorDiskKV` bubble payloads there while the composer index
 *   stays in the global DB (`composer.composerHeaders`).
 */
export function buildComposerMarkdownBody(
  globalDb: SqliteDatabase,
  composerId: string,
  data: JsonObject,
  workspaceDb?: SqliteDatabase,
): string {
  const legacy = bodyFromConversationMap(data);
  if (legacy != null && legacy.length > 0) {
    return legacy;
  }
  const fromDisk = bodyFromCursorDiskKv(
    globalDb,
    workspaceDb,
    composerId,
    data,
  );
  if (fromDisk != null && fromDisk.length > 0) {
    return fromDisk;
  }
  return '_No message text could be exported for this conversation._\n';
}

function readComposerDataItemTable(
  db: SqliteDatabase,
  composerId: string,
): JsonObject | undefined {
  const raw = getItemTableJson(db, `composerData:${composerId}`);
  if (!isJsonObject(raw)) {
    return undefined;
  }
  return raw;
}

/**
 * Reads per-composer JSON from ItemTable (`composerData:{composerId}`).
 * Tries global DB first (historical Cursor 3 default), then workspace DB (recent layouts).
 */
export function loadComposerDataJson(
  globalDb: SqliteDatabase,
  composerId: string,
  workspaceDb?: SqliteDatabase,
): JsonObject | undefined {
  const fromGlobal = readComposerDataItemTable(globalDb, composerId);
  if (fromGlobal) {
    return fromGlobal;
  }
  if (workspaceDb) {
    return readComposerDataItemTable(workspaceDb, composerId);
  }
  return undefined;
}
