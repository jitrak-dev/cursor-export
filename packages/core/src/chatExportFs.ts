import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  isJsonObject,
  type JsonValue,
  parseJsonFromUtf8,
} from './cursorStorageJson';

export interface ChatIndexEntryV1 {
  path: string;
  title: string;
  updated: string;
}

export interface ChatIndexFileV1 {
  version: 1;
  chats: Record<string, ChatIndexEntryV1>;
}

function safeUnlink(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw e;
    }
  }
}

/** Write UTF-8 text by writing a temp file in the same directory then renaming into place. */
export function writeTextFileAtomic(targetPath: string, text: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(targetPath);
  const tmp = path.join(
    dir,
    `.cursor-export-${crypto.randomBytes(8).toString('hex')}-${base}.tmp`,
  );
  fs.writeFileSync(tmp, text, 'utf8');
  safeUnlink(targetPath);
  fs.renameSync(tmp, targetPath);
}

/** Read `index.json` when present and valid (version 1). */
export function readOptionalChatIndexFile(
  indexPath: string,
): ChatIndexFileV1 | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(indexPath, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return undefined;
    }
    throw e;
  }
  const parsed: JsonValue | undefined = parseJsonFromUtf8(raw);
  if (!isJsonObject(parsed)) {
    return undefined;
  }
  if (parsed['version'] !== 1) {
    return undefined;
  }
  const chats = parsed['chats'];
  if (!isJsonObject(chats)) {
    return undefined;
  }
  return {
    version: 1,
    chats: chats as unknown as Record<string, ChatIndexEntryV1>,
  };
}

/** Merge `newEntries` into existing `index.json` (when valid) and write atomically. */
export function mergeAndWriteChatIndex(
  indexPath: string,
  newEntries: Record<string, ChatIndexEntryV1>,
): void {
  const existing = readOptionalChatIndexFile(indexPath);
  const merged: ChatIndexFileV1 = {
    version: 1,
    chats: { ...(existing?.chats ?? {}), ...newEntries },
  };
  const text = `${JSON.stringify(merged, null, 2)}\n`;
  writeTextFileAtomic(indexPath, text);
}
