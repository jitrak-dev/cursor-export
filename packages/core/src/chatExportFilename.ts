import type { JsonObject } from './cursorStorageJson';

/** Pick a stable millisecond timestamp for filename date + front matter `updated`. */
export function pickExportEpochMs(
  summary: { createdAt: number | null; lastUpdatedAt: number | null },
  composerData: JsonObject | undefined,
): number {
  if (composerData) {
    const lu = composerData['lastUpdatedAt'];
    const cr = composerData['createdAt'];
    if (typeof lu === 'number' && Number.isFinite(lu)) {
      return lu;
    }
    if (typeof cr === 'number' && Number.isFinite(cr)) {
      return cr;
    }
  }
  if (summary.lastUpdatedAt != null) {
    return summary.lastUpdatedAt;
  }
  if (summary.createdAt != null) {
    return summary.createdAt;
  }
  return Date.now();
}

export function toUtcDatePrefix(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Slug for path segment: lowercase, path-illegal chars stripped, whitespace collapsed.
 */
export function slugifyForFilename(title: string, maxLen: number): string {
  let s = title.trim().toLowerCase();
  s = s.replaceAll(/[/\\:*?"<>|]/g, '-');
  s = s.replaceAll(/\s+/g, '-');
  s = s.replaceAll(/-+/g, '-');
  s = s.replaceAll(/^-+|-+$/g, '');
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replaceAll(/-+$/g, '');
  }
  return s;
}

/**
 * Unique markdown stem (no `.md`): `YYYY-MM-DD_slug_uuid` or `YYYY-MM-DD_uuid` when slug empty.
 * `occupiedStems` tracks stems already used in this export pass (excluding `.md`).
 */
export function buildUniqueMarkdownStem(
  epochMs: number,
  title: string,
  composerId: string,
  occupiedStems: Set<string>,
  slugMaxLen: number,
): string {
  const datePrefix = toUtcDatePrefix(epochMs);
  const slug = slugifyForFilename(title, slugMaxLen);
  let stem: string;
  if (slug.length === 0) {
    stem = `${datePrefix}_${composerId}`;
  } else {
    stem = `${datePrefix}_${slug}_${composerId}`;
  }

  if (!occupiedStems.has(stem)) {
    occupiedStems.add(stem);
    return stem;
  }

  const short = composerId.replaceAll('-', '').slice(0, 8);
  let candidate = `${stem}-${short}`;
  let n = 0;
  while (occupiedStems.has(candidate)) {
    n += 1;
    candidate = `${stem}-${short}-${n}`;
  }
  occupiedStems.add(candidate);
  return candidate;
}
