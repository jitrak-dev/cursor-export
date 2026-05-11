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
  db.prepare(`INSERT OR REPLACE INTO ${table} (key, value) VALUES (?, ?)`).run(
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

export interface WriteMinimalCursor3FixtureOptions {
  includeModel?: boolean;
  /** Override composer timestamps in headers + composerData (epoch ms). */
  composerCreatedAt?: number;
  composerLastUpdatedAt?: number;
  /**
   * Which `state.vscdb` holds the `composerData:<composerId>` row. Recent
   * Cursor builds may persist per-composer blobs in workspace `state.vscdb`
   * while `composer.composerHeaders` stays in the global DB.
   */
  composerDataItemTableDb?: 'global' | 'workspace';
  /**
   * Which table inside the chosen DB holds the `composerData:<composerId>`
   * row. Defaults to `ItemTable` (older Cursor 3 layout). Current Cursor
   * builds store it in `cursorDiskKV` instead.
   */
  composerDataTable?: 'ItemTable' | 'cursorDiskKV';
  /** Inline `conversationMap` vs `cursorDiskKV` bubble payloads (same layout Cursor uses when map is externalized). */
  messageStorage?: 'inline' | 'diskKv';
}

/**
 * Writes two tiny `state.vscdb` files (global + workspace storage layout) that
 * match the Cursor 3.x ItemTable + `composer.composerHeaders` index shape.
 */
export function writeMinimalCursor3Fixture(
  fixtureRoot: string,
  options?: WriteMinimalCursor3FixtureOptions,
): MinimalCursor3FixturePaths {
  const includeModel = options?.includeModel ?? true;
  const composerCreatedAt = options?.composerCreatedAt ?? 1_700_000_000_000;
  const composerLastUpdatedAt =
    options?.composerLastUpdatedAt ?? 1_700_000_060_000;
  const composerDataItemTableDb = options?.composerDataItemTableDb ?? 'global';
  const composerDataTable = options?.composerDataTable ?? 'ItemTable';
  const messageStorage = options?.messageStorage ?? 'inline';
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
          createdAt: composerCreatedAt,
          lastUpdatedAt: composerLastUpdatedAt,
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
      createdAt: composerCreatedAt,
      lastUpdatedAt: composerLastUpdatedAt,
      fullConversationHeadersOnly: [
        { bubbleId: 'b1', type: 1 },
        { bubbleId: 'b2', type: 2 },
      ],
    };
    if (messageStorage === 'inline') {
      composerData['conversationMap'] = {
        b1: { text: 'Hello from fixture user' },
        b2: { text: 'Hello from fixture assistant' },
      };
    }
    if (includeModel) {
      composerData['modelConfig'] = { modelName: 'fixture-model-x' };
    }

    const composerDataDb =
      composerDataItemTableDb === 'workspace' ? wsDb : globalDb;
    insertJsonValue(
      composerDataDb,
      composerDataTable,
      `composerData:${FIXTURE_COMPOSER_ID}`,
      composerData,
    );

    if (messageStorage === 'diskKv') {
      const kvDb = composerDataDb;
      insertJsonValue(
        kvDb,
        'cursorDiskKV',
        `bubbleId:${FIXTURE_COMPOSER_ID}:b1`,
        {
          text: 'Hello from fixture user',
        },
      );
      insertJsonValue(
        kvDb,
        'cursorDiskKV',
        `bubbleId:${FIXTURE_COMPOSER_ID}:b2`,
        {
          text: 'Hello from fixture assistant',
        },
      );
    }
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
