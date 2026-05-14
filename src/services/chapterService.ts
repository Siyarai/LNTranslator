import { getChapterById } from '../db/database';
import type { Chapter } from '../types/novel';

/**
 * Get the readable content for a chapter.
 * In MVP 1 we only read from the backup (SQLite).
 * Web scraping is not included — if content is missing, we return null.
 */
export async function getChapterContent(
  chapterId: number
): Promise<{ chapter: Chapter; content: string | null }> {
  const chapter = await getChapterById(chapterId);

  if (!chapter) {
    throw new Error('CHAPTER_NOT_FOUND');
  }

  const content = chapter.originalText || null;

  return { chapter, content };
}
