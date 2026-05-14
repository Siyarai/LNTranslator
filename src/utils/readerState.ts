import * as SQLite from 'expo-sqlite';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChapterReaderState {
  lastLanguage: 'original' | 'translated';
  originalProgress: number;   // 0-100
  translatedProgress: number; // 0-100
}

const DEFAULT_STATE: ChapterReaderState = {
  lastLanguage: 'original',
  originalProgress: 0,
  translatedProgress: 0,
};

// ─── DB access (reuses same DB) ───────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('lntranslator.db');
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  return _db;
}

function key(chapterId: number) {
  return `reader_state_${chapterId}`;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadReaderState(
  chapterId: number
): Promise<ChapterReaderState> {
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key(chapterId)]
    );
    if (row) {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    // silent
  }
  return { ...DEFAULT_STATE };
}

// ─── Save (full replace) ──────────────────────────────────────────────────────

export async function saveReaderState(
  chapterId: number,
  state: ChapterReaderState
): Promise<void> {
  try {
    const d = await db();
    await d.runAsync(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key(chapterId), JSON.stringify(state)]
    );
  } catch {
    // silent
  }
}
