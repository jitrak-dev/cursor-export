import * as fs from 'node:fs';
import * as path from 'node:path';

import { writeTextFileAtomic } from './chatExportFs';
import {
  isJsonObject,
  type JsonValue,
  parseJsonFromUtf8,
} from './cursorStorageJson';

/** Stored next to `index.json` under the configured export directory. */
export const EXCLUDED_COMPOSERS_FILENAME =
  '.cursor-export-excluded-composers.json';

export interface ExcludedComposersFileV1 {
  version: 1;
  excludedComposerIds: string[];
}

export function excludedComposersFilePath(outputDirectory: string): string {
  return path.join(outputDirectory, EXCLUDED_COMPOSERS_FILENAME);
}

/**
 * Reads persisted excluded composer ids. Missing or invalid file yields an empty set.
 */
export function readExcludedComposerIds(outputDirectory: string): Set<string> {
  const p = excludedComposersFilePath(outputDirectory);
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return new Set();
    }
    throw e;
  }
  const parsed: JsonValue | undefined = parseJsonFromUtf8(raw);
  if (!isJsonObject(parsed) || parsed['version'] !== 1) {
    return new Set();
  }
  const ids = parsed['excludedComposerIds'];
  if (!Array.isArray(ids)) {
    return new Set();
  }
  const out = new Set<string>();
  for (const x of ids) {
    if (typeof x === 'string' && x.length > 0) {
      out.add(x);
    }
  }
  return out;
}

/** Writes the exclude list atomically (sorted ids for stable diffs). */
export function writeExcludedComposerIds(
  outputDirectory: string,
  ids: Set<string>,
): void {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  const file: ExcludedComposersFileV1 = {
    version: 1,
    excludedComposerIds: sorted,
  };
  const text = `${JSON.stringify(file, null, 2)}\n`;
  writeTextFileAtomic(excludedComposersFilePath(outputDirectory), text);
}
