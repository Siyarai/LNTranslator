import * as SQLite from 'expo-sqlite';
import type { Novel, Chapter } from '../types/novel';
import type { GlossaryEntry } from '../types/glossary';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Open the database and create tables if they don't exist.
 * Call this once at app startup (in _layout.tsx).
 */
export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('lntranslator.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS novels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT,
      cover TEXT,
      lastReadChapterId INTEGER,
      pluginId TEXT,
      path TEXT,
      sourceUrl TEXT
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      name TEXT NOT NULL,
      path TEXT,
      url TEXT,
      isDownloaded INTEGER DEFAULT 0,
      originalText TEXT,
      translatedText TEXT,
      isTranslated INTEGER DEFAULT 0,
      orderIndex INTEGER DEFAULT 0,
      chapterNumber REAL,
      position REAL,
      FOREIGN KEY (novelId) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS glossary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      sourceText TEXT NOT NULL,
      targetText TEXT NOT NULL,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (novelId) REFERENCES novels(id) ON DELETE CASCADE,
      UNIQUE(novelId, sourceText)
    );

    CREATE INDEX IF NOT EXISTS idx_glossary_novelId_isActive
      ON glossary_entries(novelId, isActive);

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT,
      description TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (novelId) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_characters_novel ON characters(novelId);

    CREATE TABLE IF NOT EXISTS character_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId INTEGER NOT NULL,
      filename TEXT NOT NULL,
      caption TEXT,
      sortOrder INTEGER DEFAULT 0,
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_character_images_char ON character_images(characterId, sortOrder);

    CREATE TABLE IF NOT EXISTS character_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId INTEGER NOT NULL,
      attrKey TEXT NOT NULL,
      attrValue TEXT NOT NULL,
      sortOrder INTEGER DEFAULT 0,
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_character_attributes_char ON character_attributes(characterId, sortOrder);
  `);

  // ── Schema migrations for existing databases ─────────────────
  // ALTER TABLE ADD COLUMN throws if the column already exists.
  // Silence those errors so fresh and existing installs both work.
  const migrations = [
    'ALTER TABLE novels ADD COLUMN pluginId TEXT',
    'ALTER TABLE novels ADD COLUMN path TEXT',
    'ALTER TABLE novels ADD COLUMN sourceUrl TEXT',
    'ALTER TABLE chapters ADD COLUMN chapterNumber REAL',
    'ALTER TABLE chapters ADD COLUMN position REAL',
    'ALTER TABLE novels ADD COLUMN lastReadAt TEXT',
    'ALTER TABLE chapters ADD COLUMN progress REAL DEFAULT 0',
  ];
  for (const sql of migrations) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function getDbInstance(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ─── Novel CRUD ───────────────────────────────────────────────

export async function insertNovel(
  title: string,
  url: string | null,
  cover: string | null,
  pluginId: string | null = null,
  path: string | null = null,
  sourceUrl: string | null = null
): Promise<number> {
  const result = await getDb().runAsync(
    'INSERT INTO novels (title, url, cover, pluginId, path, sourceUrl) VALUES (?, ?, ?, ?, ?, ?)',
    [title, url ?? null, cover ?? null, pluginId ?? null, path ?? null, sourceUrl ?? null]
  );
  return result.lastInsertRowId;
}

export async function getAllNovels(): Promise<Novel[]> {
  const rows = await getDb().getAllAsync<{
    id: number;
    title: string;
    url: string | null;
    cover: string | null;
    lastReadChapterId: number | null;
    chapterCount: number;
    readCount: number;
    translatedCount: number;
    pluginId: string | null;
    path: string | null;
    sourceUrl: string | null;
    lastReadChapterName: string | null;
    lastReadAt: string | null;
  }>(`
    SELECT 
      n.id, n.title, n.url, n.cover, n.lastReadChapterId,
      n.pluginId, n.path, n.sourceUrl, n.lastReadAt,
      COUNT(c.id) as chapterCount,
      SUM(CASE WHEN c.originalText IS NOT NULL AND c.originalText != '' THEN 1 ELSE 0 END) as readCount,
      SUM(CASE WHEN c.isTranslated = 1 THEN 1 ELSE 0 END) as translatedCount,
      (SELECT lc.name FROM chapters lc WHERE lc.id = n.lastReadChapterId) as lastReadChapterName
    FROM novels n
    LEFT JOIN chapters c ON c.novelId = n.id
    GROUP BY n.id
    ORDER BY n.id DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    cover: r.cover,
    lastReadChapterId: r.lastReadChapterId,
    chapterCount: r.chapterCount,
    readCount: r.readCount,
    translatedCount: r.translatedCount,
    lastReadChapterName: r.lastReadChapterName,
    lastReadAt: r.lastReadAt,
    pluginId: r.pluginId,
    path: r.path,
    sourceUrl: r.sourceUrl,
  }));
}

export async function getNovelById(id: number): Promise<Novel | null> {
  const row = await getDb().getFirstAsync<{
    id: number;
    title: string;
    url: string | null;
    cover: string | null;
    lastReadChapterId: number | null;
    pluginId: string | null;
    path: string | null;
    sourceUrl: string | null;
  }>('SELECT * FROM novels WHERE id = ?', [id]);

  return row
    ? {
        id: row.id,
        title: row.title,
        url: row.url,
        cover: row.cover,
        lastReadChapterId: row.lastReadChapterId,
        pluginId: row.pluginId,
        path: row.path,
        sourceUrl: row.sourceUrl,
      }
    : null;
}

export async function updateLastReadChapter(
  novelId: number,
  chapterId: number
): Promise<void> {
  await getDb().runAsync(
    'UPDATE novels SET lastReadChapterId = ?, lastReadAt = ? WHERE id = ?',
    [chapterId, new Date().toISOString(), novelId]
  );
}

export async function deleteNovel(novelId: number): Promise<void> {
  await getDb().runAsync('DELETE FROM chapters WHERE novelId = ?', [novelId]);
  await getDb().runAsync('DELETE FROM novels WHERE id = ?', [novelId]);
}

/** Debug only — wipe all data from both tables. */
export async function clearDatabase(): Promise<void> {
  await getDb().runAsync('DELETE FROM chapters');
  await getDb().runAsync('DELETE FROM novels');
}

// ─── Chapter CRUD ─────────────────────────────────────────────

export async function insertChapters(
  chapters: {
    novelId: number;
    name: string;
    path: string | null;
    url: string | null;
    isDownloaded: boolean;
    originalText: string | null;
    orderIndex: number;
    chapterNumber: number | null;
    position: number | null;
  }[]
): Promise<void> {
  const database = getDb();

  for (const ch of chapters) {
    await database.runAsync(
      `INSERT INTO chapters (novelId, name, path, url, isDownloaded, originalText, orderIndex, chapterNumber, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ch.novelId,
        ch.name,
        ch.path ?? null,
        ch.url ?? null,
        ch.isDownloaded ? 1 : 0,
        ch.originalText ?? null,
        ch.orderIndex,
        ch.chapterNumber ?? null,
        ch.position ?? null,
      ]
    );
  }
}

export async function getChaptersByNovelId(
  novelId: number
): Promise<Chapter[]> {
  const rows = await getDb().getAllAsync<{
    id: number;
    novelId: number;
    name: string;
    path: string | null;
    url: string | null;
    isDownloaded: number;
    originalText: string | null;
    translatedText: string | null;
    isTranslated: number;
    orderIndex: number;
    chapterNumber: number | null;
    position: number | null;
  }>('SELECT * FROM chapters WHERE novelId = ? ORDER BY orderIndex ASC', [
    novelId,
  ]);

  return rows.map((r) => ({
    id: r.id,
    novelId: r.novelId,
    name: r.name,
    path: r.path,
    url: r.url,
    isDownloaded: r.isDownloaded === 1,
    originalText: r.originalText,
    translatedText: r.translatedText,
    isTranslated: r.isTranslated === 1,
    orderIndex: r.orderIndex,
    chapterNumber: r.chapterNumber,
    position: r.position,
  }));
}

export async function getChapterById(
  chapterId: number
): Promise<Chapter | null> {
  const row = await getDb().getFirstAsync<{
    id: number;
    novelId: number;
    name: string;
    path: string | null;
    url: string | null;
    isDownloaded: number;
    originalText: string | null;
    translatedText: string | null;
    isTranslated: number;
    orderIndex: number;
    chapterNumber: number | null;
    position: number | null;
  }>('SELECT * FROM chapters WHERE id = ?', [chapterId]);

  if (!row) return null;

  return {
    id: row.id,
    novelId: row.novelId,
    name: row.name,
    path: row.path,
    url: row.url,
    isDownloaded: row.isDownloaded === 1,
    originalText: row.originalText,
    translatedText: row.translatedText,
    isTranslated: row.isTranslated === 1,
    orderIndex: row.orderIndex,
    chapterNumber: row.chapterNumber,
    position: row.position,
  };
}

export async function updateChapterTranslation(
  chapterId: number,
  translatedText: string
): Promise<void> {
  await getDb().runAsync(
    'UPDATE chapters SET translatedText = ?, isTranslated = 1 WHERE id = ?',
    [translatedText, chapterId]
  );
}

export async function updateChapterOriginalText(
  chapterId: number,
  originalText: string
): Promise<void> {
  await getDb().runAsync(
    'UPDATE chapters SET originalText = ?, isDownloaded = 1 WHERE id = ?',
    [originalText, chapterId]
  );
}

export async function clearChapterTranslation(
  chapterId: number
): Promise<void> {
  await getDb().runAsync(
    'UPDATE chapters SET translatedText = NULL, isTranslated = 0 WHERE id = ?',
    [chapterId]
  );
}

export interface ChapterProgress {
  original: number;
  translated: number;
}

export async function saveChapterProgress(
  chapterId: number,
  view: 'original' | 'translated',
  percent: number
): Promise<void> {
  const existing = await getChapterProgress(chapterId);
  const next = { ...existing, [view]: percent };
  await getDb().runAsync(
    'UPDATE chapters SET progress = ? WHERE id = ?',
    [JSON.stringify(next), chapterId]
  );
}

export async function getChapterProgress(
  chapterId: number
): Promise<ChapterProgress> {
  const row = await getDb().getFirstAsync<{ progress: string | number | null }>(
    'SELECT progress FROM chapters WHERE id = ?',
    [chapterId]
  );
  if (row?.progress == null) return { original: 0, translated: 0 };
  // Backward compat: old values are plain numbers
  if (typeof row.progress === 'number') {
    return { original: row.progress, translated: 0 };
  }
  try {
    const parsed = JSON.parse(row.progress);
    return {
      original: parsed.original ?? 0,
      translated: parsed.translated ?? 0,
    };
  } catch {
    return { original: 0, translated: 0 };
  }
}

// ─── Glossary CRUD ────────────────────────────────────────────

export async function getGlossaryEntries(
  novelId: number
): Promise<GlossaryEntry[]> {
  const rows = await getDb().getAllAsync<{
    id: number;
    novelId: number;
    sourceText: string;
    targetText: string;
    isActive: number;
    createdAt: string;
  }>(
    'SELECT * FROM glossary_entries WHERE novelId = ? ORDER BY length(sourceText) DESC',
    [novelId]
  );
  return rows.map((r) => ({
    id: r.id,
    novelId: r.novelId,
    sourceText: r.sourceText,
    targetText: r.targetText,
    isActive: r.isActive,
    createdAt: r.createdAt,
  }));
}

export async function getActiveGlossaryEntries(
  novelId: number
): Promise<GlossaryEntry[]> {
  const rows = await getDb().getAllAsync<{
    id: number;
    novelId: number;
    sourceText: string;
    targetText: string;
    isActive: number;
    createdAt: string;
  }>(
    'SELECT * FROM glossary_entries WHERE novelId = ? AND isActive = 1 ORDER BY length(sourceText) DESC',
    [novelId]
  );
  return rows.map((r) => ({
    id: r.id,
    novelId: r.novelId,
    sourceText: r.sourceText,
    targetText: r.targetText,
    isActive: r.isActive,
    createdAt: r.createdAt,
  }));
}

export async function addGlossaryEntry(data: {
  novelId: number;
  sourceText: string;
  targetText: string;
}): Promise<number> {
  const result = await getDb().runAsync(
    'INSERT INTO glossary_entries (novelId, sourceText, targetText, isActive, createdAt) VALUES (?, ?, ?, 1, ?)',
    [data.novelId, data.sourceText, data.targetText, new Date().toISOString()]
  );
  return result.lastInsertRowId;
}

export async function updateGlossaryEntry(
  id: number,
  partial: Partial<Pick<GlossaryEntry, 'sourceText' | 'targetText' | 'isActive'>>
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (partial.sourceText !== undefined) {
    setClauses.push('sourceText = ?');
    values.push(partial.sourceText);
  }
  if (partial.targetText !== undefined) {
    setClauses.push('targetText = ?');
    values.push(partial.targetText);
  }
  if (partial.isActive !== undefined) {
    setClauses.push('isActive = ?');
    values.push(partial.isActive);
  }

  if (setClauses.length === 0) return;

  await getDb().runAsync(
    `UPDATE glossary_entries SET ${setClauses.join(', ')} WHERE id = ?`,
    [...values, id]
  );
}

export async function deleteGlossaryEntry(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM glossary_entries WHERE id = ?', [id]);
}

export async function bulkInsertGlossaryEntries(
  novelId: number,
  entries: Array<{ sourceText: string; targetText: string }>
): Promise<{ inserted: number; skipped: number }> {
  if (entries.length === 0) return { inserted: 0, skipped: 0 };
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      const result = await db.runAsync(
        'INSERT OR IGNORE INTO glossary_entries (novelId, sourceText, targetText, isActive, createdAt) VALUES (?, ?, ?, 1, ?)',
        [novelId, entry.sourceText, entry.targetText, new Date().toISOString()]
      );
      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  });
  return { inserted, skipped };
}
