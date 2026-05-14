import type { Novel, Chapter } from '../types/novel';

/**
 * Default base URL used when no override is provided.
 * Change this to match the primary source you read from.
 */
export const DEFAULT_BASE_URL = 'https://allnovel.org';

/**
 * Build a full URL to a chapter on the web, given novel and chapter metadata.
 *
 * Resolution order:
 *  1. chapter.url  — explicit URL stored from the backup (best)
 *  2. novel.url + chapter.path  — if the novel has a base URL and the chapter
 *     has a path segment, join them
 *  3. baseUrl + chapter.path  — if we have a path and a configurable base URL
 *  4. novel.sourceUrl + chapter.path  — same idea with the novel's sourceUrl
 *  5. null  — not enough information to build a URL
 *
 * @param novel   Novel object from the database
 * @param chapter Chapter object from the database
 * @param baseUrl Optional base URL override (defaults to DEFAULT_BASE_URL)
 */
export function buildChapterSourceUrl(
  novel: Novel,
  chapter: Chapter,
  baseUrl: string = DEFAULT_BASE_URL
): string | null {
  // 1. Explicit chapter URL — use as-is
  if (chapter.url) {
    return chapter.url;
  }

  // 2–4. We need a path segment to append
  const chapterPath = chapter.path ? normalizePathSegment(chapter.path) : null;
  if (!chapterPath) {
    return null;
  }

  // 2. Novel URL as base (e.g. "https://allnovel.org")
  const novelBase = extractOrigin(novel.url);
  if (novelBase) {
    return `${novelBase}/${chapterPath}`;
  }

  // 3. Configurable base URL
  if (baseUrl) {
    return `${trimTrailingSlash(baseUrl)}/${chapterPath}`;
  }

  // 4. Novel sourceUrl as base
  const sourceBase = extractOrigin(novel.sourceUrl);
  if (sourceBase) {
    return `${sourceBase}/${chapterPath}`;
  }

  return null;
}

/** Strip a leading slash so we can always join with `base + "/" + path`. */
function normalizePathSegment(path: string): string {
  return path.replace(/^\/+/, '');
}

/** Remove trailing slashes from a URL string. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Extract just the origin (scheme + host) from a full URL string.
 * Returns null if the string is falsy or not a valid absolute URL.
 */
function extractOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin; // e.g. "https://allnovel.org"
  } catch {
    return null;
  }
}
