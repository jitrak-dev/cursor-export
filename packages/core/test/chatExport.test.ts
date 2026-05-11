import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportWorkspaceChats } from '../src/chatExporter';
import {
  EXCLUDED_COMPOSERS_FILENAME,
  writeExcludedComposerIds,
} from '../src/chatExportExcluded';
import {
  FIXTURE_COMPOSER_ID,
  writeMinimalCursor3Fixture,
} from './cursor3Fixture';

function parseYamlFrontMatter(md: string): Record<string, string> {
  if (!md.startsWith('---\n')) {
    throw new Error('Expected YAML front matter opening ---');
  }
  const end = md.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('Expected YAML front matter closing ---');
  }
  const block = md.slice(4, end);
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^(\w+):\s+"(.*)"\s*$/.exec(line);
    if (!m) {
      continue;
    }
    const key = m[1];
    const raw = m[2]
      .replaceAll(String.raw`\"`, '"')
      .replaceAll(String.raw`\n`, '\n')
      .replaceAll(String.raw`\\`, '\\');
    if (key) {
      out[key] = raw;
    }
  }
  return out;
}

describe('exportWorkspaceChats (Cursor 3 fixture)', () => {
  it('returns structured skip when state.vscdb files cannot be opened (no throw)', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const missingGlobal = path.join(tmp, 'nope', 'global', 'state.vscdb');
    const missingWs = path.join(tmp, 'nope', 'ws', 'state.vscdb');

    const result = exportWorkspaceChats({
      workspaceFolderPath: path.join(tmp, 'workspace'),
      editorVariant: 'cursor',
      globalStateDbPath: missingGlobal,
      workspaceStateDbPath: missingWs,
      outputDirectory: outDir,
    });

    expect(result.exported).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.composerId).toBe('*');
    expect(result.skipped[0]?.reason).toContain(
      'Cannot read one or both state.vscdb',
    );
    expect(result.skipped[0]?.reason).toContain(missingGlobal);
    expect(result.skipped[0]?.reason).toContain(missingWs);
    expect(result.profileVersion).toBe('unknown');
    expect(fs.existsSync(path.join(outDir, 'index.json'))).toBe(false);
  });

  it('writes markdown with required title, model, and updated front matter', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: true,
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    });

    expect(result.profileVersion).toBe('cursor3');
    expect(result.exported).toHaveLength(1);
    const file = result.exported[0];
    expect(file?.composerId).toBe(FIXTURE_COMPOSER_ID);

    const absMd = path.join(outDir, file?.relativePath ?? '');
    const md = fs.readFileSync(absMd, 'utf8');
    const fm = parseYamlFrontMatter(md);

    expect(fm['title']).toBe('Fixture Alpha Chat');
    expect(fm['model']).toBe('fixture-model-x');
    expect(fm['updated']).toBe(new Date(1_700_000_060_000).toISOString());

    expect(md).toContain('## User');
    expect(md).toContain('Hello from fixture user');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Hello from fixture assistant');
  });

  it('emits model unknown when composer data has no modelConfig', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: false,
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    });

    expect(result.exported).toHaveLength(1);
    const rel = result.exported[0]?.relativePath;
    expect(rel).toBeTruthy();
    const md = fs.readFileSync(path.join(outDir, rel ?? ''), 'utf8');
    const fm = parseYamlFrontMatter(md);
    expect(fm['model']).toBe('unknown');
  });

  it('exports when composerData ItemTable row lives in workspace DB (Cursor 3)', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: true,
      composerDataItemTableDb: 'workspace',
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    });

    expect(result.profileVersion).toBe('cursor3');
    expect(result.skipped).toHaveLength(0);
    expect(result.exported).toHaveLength(1);
    const rel = result.exported[0]?.relativePath;
    const md = fs.readFileSync(path.join(outDir, rel ?? ''), 'utf8');
    expect(md).toContain('Hello from fixture user');
  });

  it('exports when composerData lives in global cursorDiskKV (current Cursor layout)', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: true,
      composerDataItemTableDb: 'global',
      composerDataTable: 'cursorDiskKV',
      messageStorage: 'diskKv',
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    });

    expect(result.profileVersion).toBe('cursor3');
    expect(result.skipped).toHaveLength(0);
    expect(result.exported).toHaveLength(1);
    const rel = result.exported[0]?.relativePath;
    const md = fs.readFileSync(path.join(outDir, rel ?? ''), 'utf8');
    const fm = parseYamlFrontMatter(md);
    expect(fm['title']).toBe('Fixture Alpha Chat');
    expect(fm['model']).toBe('fixture-model-x');
    expect(md).toContain('## User');
    expect(md).toContain('Hello from fixture user');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Hello from fixture assistant');
  });

  it('exports when composerData lives in workspace cursorDiskKV', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: true,
      composerDataItemTableDb: 'workspace',
      composerDataTable: 'cursorDiskKV',
      messageStorage: 'diskKv',
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.exported).toHaveLength(1);
    const md = fs.readFileSync(
      path.join(outDir, result.exported[0]?.relativePath ?? ''),
      'utf8',
    );
    expect(md).toContain('Hello from fixture user');
    expect(md).toContain('Hello from fixture assistant');
  });

  it('reads bubble text from workspace cursorDiskKV when composerData is workspace-local', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      composerDataItemTableDb: 'workspace',
      messageStorage: 'diskKv',
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    });

    expect(result.exported).toHaveLength(1);
    const md = fs.readFileSync(
      path.join(outDir, result.exported[0]?.relativePath ?? ''),
      'utf8',
    );
    expect(md).toContain('Hello from fixture assistant');
  });

  it('skipUnchanged true avoids rewriting Markdown when index matches DB metadata', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: true,
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const base = {
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor' as const,
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    };

    const first = exportWorkspaceChats(base);
    expect(first.exported).toHaveLength(1);
    expect(first.unchanged).toHaveLength(0);

    const rel = first.exported[0]?.relativePath ?? '';
    const absMd = path.join(outDir, rel);
    const mtimeBefore = fs.statSync(absMd).mtimeMs;

    const second = exportWorkspaceChats({ ...base, skipUnchanged: true });
    expect(second.exported).toHaveLength(0);
    expect(second.unchanged).toHaveLength(1);
    expect(second.unchanged[0]?.relativePath).toBe(rel);
    expect(fs.statSync(absMd).mtimeMs).toBe(mtimeBefore);
  });

  it('skipUnchanged true still writes when DB updated timestamp changes', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const dbRoot = path.join(tmp, 'db');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    let fixture = writeMinimalCursor3Fixture(dbRoot, {
      includeModel: true,
      composerLastUpdatedAt: 1_700_000_060_000,
    });

    const base = {
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor' as const,
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    };

    exportWorkspaceChats(base);

    fixture = writeMinimalCursor3Fixture(dbRoot, {
      includeModel: true,
      composerLastUpdatedAt: 1_900_000_000_000,
    });

    const third = exportWorkspaceChats({
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor',
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
      skipUnchanged: true,
    });

    expect(third.exported).toHaveLength(1);
    expect(third.unchanged).toHaveLength(0);
    const md = fs.readFileSync(
      path.join(outDir, third.exported[0]?.relativePath ?? ''),
      'utf8',
    );
    const fm = parseYamlFrontMatter(md);
    expect(fm['updated']).toBe(new Date(1_900_000_000_000).toISOString());
  });

  it('missing Markdown auto-excludes composer until exclude list cleared', () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursor-export-core-test-'),
    );
    const fixture = writeMinimalCursor3Fixture(path.join(tmp, 'db'), {
      includeModel: true,
    });
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const base = {
      workspaceFolderPath: fixture.workspaceFolderPath,
      editorVariant: 'cursor' as const,
      globalStateDbPath: fixture.globalStateVscdbPath,
      workspaceStateDbPath: fixture.workspaceStateVscdbPath,
      workspaceStorageId: fixture.workspaceStorageId,
      outputDirectory: outDir,
    };

    const first = exportWorkspaceChats(base);
    expect(first.exported).toHaveLength(1);

    const rel = first.exported[0]?.relativePath ?? '';
    fs.unlinkSync(path.join(outDir, rel));

    const second = exportWorkspaceChats({ ...base, skipUnchanged: true });
    expect(second.exported).toHaveLength(0);
    expect(second.excluded).toHaveLength(1);
    expect(second.excluded[0]?.composerId).toBe(FIXTURE_COMPOSER_ID);

    const excludeAbs = path.join(outDir, EXCLUDED_COMPOSERS_FILENAME);
    expect(fs.existsSync(excludeAbs)).toBe(true);

    writeExcludedComposerIds(outDir, new Set());

    fs.unlinkSync(path.join(outDir, 'index.json'));

    const third = exportWorkspaceChats({ ...base, skipUnchanged: true });
    expect(third.exported).toHaveLength(1);
    expect(third.excluded).toHaveLength(0);
    expect(
      fs.existsSync(path.join(outDir, third.exported[0]?.relativePath ?? '')),
    ).toBe(true);
  });
});
