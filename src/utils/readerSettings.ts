import * as SQLite from 'expo-sqlite';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FontFamily = 'System' | 'Serif' | 'Monospace';
export type ThemeName = 'Dark' | 'AMOLED' | 'Sepia';

export interface ReaderSettings {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeightMultiplier: number;
  theme: ThemeName;
  fullScreen: boolean;
  horizontalPadding: number;
  maxContentWidth: number;
  autoPrefetchEnabled: boolean;
  prefetchCount: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: 'System',
  fontSize: 16,
  lineHeightMultiplier: 1.75,
  theme: 'Dark',
  fullScreen: false,
  horizontalPadding: 20,
  maxContentWidth: 0,
  autoPrefetchEnabled: true,
  prefetchCount: 2,
};

// ─── Theme color palettes ─────────────────────────────────────────────────────

export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
}

export const THEME_PALETTES: Record<ThemeName, ThemeColors> = {
  Dark: {
    background: '#1A1A2E',
    surface: '#16213E',
    card: '#1C2333',
    text: '#D4D4D8',
    textSecondary: '#8B949E',
    textMuted: '#6B7280',
    border: '#30363D',
  },
  AMOLED: {
    background: '#000000',
    surface: '#0A0A0A',
    card: '#111111',
    text: '#E8E8E8',
    textSecondary: '#999999',
    textMuted: '#666666',
    border: '#1A1A1A',
  },
  Sepia: {
    background: '#F4ECD8',
    surface: '#EDE3CC',
    card: '#E8DCC4',
    text: '#3B2F1E',
    textSecondary: '#6B5B45',
    textMuted: '#8B7B65',
    border: '#D4C8AC',
  },
};

// ─── Font family mapping ──────────────────────────────────────────────────────

export function resolveFontFamily(family: FontFamily): string | undefined {
  switch (family) {
    case 'Serif':
      return 'serif';
    case 'Monospace':
      return 'monospace';
    case 'System':
    default:
      return undefined; // React Native default
  }
}

// ─── Persistence via SQLite (reuses the same DB) ──────────────────────────────

const SETTINGS_KEY = 'reader_settings';

let settingsDb: SQLite.SQLiteDatabase | null = null;

async function getSettingsDb(): Promise<SQLite.SQLiteDatabase> {
  if (!settingsDb) {
    settingsDb = await SQLite.openDatabaseAsync('lntranslator.db');
    await settingsDb.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  return settingsDb;
}

export async function loadReaderSettings(): Promise<ReaderSettings> {
  try {
    const db = await getSettingsDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [SETTINGS_KEY]
    );
    if (row) {
      const parsed = JSON.parse(row.value);
      // Merge with defaults so new fields always have a fallback
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn('Failed to load reader settings, using defaults:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveReaderSettings(settings: ReaderSettings): Promise<void> {
  try {
    const db = await getSettingsDb();
    const json = JSON.stringify(settings);
    await db.runAsync(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [SETTINGS_KEY, json]
    );
  } catch (err) {
    console.warn('Failed to save reader settings:', err);
  }
}
