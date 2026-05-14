export interface Novel {
  id: number;
  title: string;
  /** Full URL to the novel on a web source, if known */
  url: string | null;
  cover: string | null;
  lastReadChapterId: number | null;
  chapterCount?: number;
  readCount?: number;
  translatedCount?: number;
  lastReadChapterName?: string | null;
  /** ISO timestamp of when this novel was last read */
  lastReadAt?: string | null;
  /** The LNReader plugin/source identifier (e.g. "allnovel", "lightnovelworld") */
  pluginId: string | null;
  /** Novel path segment used to build chapter URLs (e.g. "lord-of-the-mysteries") */
  path: string | null;
  /** Explicit source URL override, if present in backup */
  sourceUrl: string | null;
}

export interface Chapter {
  id: number;
  novelId: number;
  name: string;
  /** Path segment from the backup (e.g. "lord-of-the-mysteries/chapter-1.html") */
  path: string | null;
  /** Full URL to the chapter on a web source, if known */
  url: string | null;
  isDownloaded: boolean;
  originalText: string | null;
  translatedText: string | null;
  isTranslated: boolean;
  orderIndex: number;
  /** Numeric chapter number from the backup */
  chapterNumber: number | null;
  /** Reading position / scroll offset from the backup */
  position: number | null;
}

/**
 * Shape of novel data inside an LNReader backup JSON file.
 * Field names may vary between LNReader versions, so we check multiple keys.
 */
export interface BackupNovel {
  id?: number;
  name?: string;
  novelName?: string;
  url?: string;
  novelUrl?: string;
  cover?: string;
  novelCover?: string;
  sourceUrl?: string;
  source?: string;
  /** Plugin/source identifier (e.g. "allnovel") */
  pluginId?: string;
  /** Path segment for the novel */
  path?: string;
}

export interface BackupChapter {
  id?: number;
  name?: string;
  chapterName?: string;
  path?: string;
  url?: string;
  chapterUrl?: string;
  text?: string;
  chapterText?: string;
  isDownloaded?: boolean | number;
  releaseDate?: string;
  isRead?: boolean | number;
  position?: number;
  chapterNumber?: number;
}

export interface BackupData {
  novel?: BackupNovel;
  name?: string;
  title?: string;
  url?: string;
  cover?: string;
  chapters?: BackupChapter[];
  chapter?: BackupChapter[];
}
