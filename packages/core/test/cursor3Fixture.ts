import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';

const WORKSPACE_STORAGE_DIR = 'ws_fixture001';

export const FIXTURE_COMPOSER_ID = '11111111-1111-4111-8111-111111111111';

function ensureCursorTables(db: InstanceType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE NOT NULL, value BLOB);
    CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT UNIQUE NOT NULL, value BLOB);
  `);
}

function insertJsonValue(
  db: InstanceType<typeof Database>,
  table: 'ItemTable' | 'cursorDiskKV',
  key: string,
  value: unknown,
): void {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  db.prepare(`INSERT INTO ${table} (key, value) VALUES (?, ?)`).run(
    key,
    payload,
  );
}

export interface MinimalCursor3FixturePaths {
  readonly fixtureRoot: string;
  readonly globalStateVscdbPath: string;
  readonly workspaceStateVscdbPath: string;
  readonly workspaceStorageId: string;
  /** Any stable path; listing uses \`workspaceIdentifier.id\` in the fixture. */
  readonly workspaceFolderPath: string;
}

/**
 * Writes two tiny `state.vscdb` files (global + workspace storage layout) that
 * match the Cursor 3.x ItemTable + `composer.composerHeaders` index shape.
 */
export function writeMinimalCursor3Fixture(
  fixtureRoot: string,
  options?: { includeModel?: boolean },
): MinimalCursor3FixturePaths {
  const includeModel = options?.includeModel ?? true;
  fs.mkdirSync(path.join(fixtureRoot, WORKSPACE_STORAGE_DIR), {
    recursive: true,
  });
  fs.mkdirSync(path.join(fixtureRoot, 'global'), { recursive: true });

  const globalPath = path.join(fixtureRoot, 'global', 'state.vscdb');
  const workspacePath = path.join(
    fixtureRoot,
    WORKSPACE_STORAGE_DIR,
    'state.vscdb',
  );

  const globalDb = new Database(globalPath);
  const wsDb = new Database(workspacePath);
  try {
    ensureCursorTables(globalDb);
    ensureCursorTables(wsDb);

    const headersPayload = {
      allComposers: [
        {
          composerId: FIXTURE_COMPOSER_ID,
          name: 'Fixture Alpha Chat',
          createdAt: 1_700_000_000_000,
          lastUpdatedAt: 1_700_000_060_000,
          workspaceIdentifier: { id: WORKSPACE_STORAGE_DIR },
        },
      ],
    };
    insertJsonValue(
      globalDb,
      'ItemTable',
      'composer.composerHeaders',
      headersPayload,
    );

    const composerData: Record<string, unknown> = {
      name: 'Fixture Alpha Chat',
      createdAt: 1_700_000_000_000,
      lastUpdatedAt: 1_700_000_060_000,
      fullConversationHeadersOnly: [
        { bubbleId: 'b1', type: 1 },
        { bubbleId: 'b2', type: 2 },
      ],
      conversationMap: {
        b1: { text: 'Hello from fixture user' },
        b2: { text: 'Hello from fixture assistant' },
      },
    };
    if (includeModel) {
      composerData['modelConfig'] = { modelName: 'fixture-model-x' };
    }

    insertJsonValue(
      globalDb,
      'ItemTable',
      `composerData:${FIXTURE_COMPOSER_ID}`,
      composerData,
    );
  } finally {
    globalDb.close();
    wsDb.close();
  }

  return {
    fixtureRoot,
    globalStateVscdbPath: globalPath,
    workspaceStateVscdbPath: workspacePath,
    workspaceStorageId: WORKSPACE_STORAGE_DIR,
    workspaceFolderPath: path.join(fixtureRoot, 'virtual-workspace-root'),
  };
}
