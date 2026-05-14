import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { insertChapters, insertNovel } from '../db/database';
import { stripHtml } from '../utils/html';

/** Set to true to enable verbose backup import logging. */
const DEBUG = false;

/**
 * Open a file picker and let the user select an LNReader backup zip.
 * Returns the number of novels imported, or throws on error.
 */
export async function importBackup(
  onProgress?: (message: string) => void
): Promise<number> {
  // 1. Pick a file
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    throw new Error('FILE_PICKER_CANCELLED');
  }

  const fileUri = result.assets[0].uri;
  onProgress?.('Reading backup file...');

  const base64Content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2. Parse outer zip
  onProgress?.('Parsing zip file...');
  const zip = new JSZip();
  let zipContent: JSZip;

  try {
    zipContent = await zip.loadAsync(base64Content, { base64: true });
  } catch {
    throw new Error('INVALID_ZIP');
  }

  // 3. Enumerate top-level entries
  const allFiles = Object.keys(zipContent.files);
  if (DEBUG) console.log('[Backup] Zip file list:', allFiles);

  // ── Load nested download.zip (contains actual chapter HTML) ──────────────
  // Structure inside download.zip:
  //   Novels/{pluginId}/{lnreaderNovelId}/{lnreaderChapterId}/index.html
  let downloadZip: JSZip | null = null;

  const downloadZipEntry = zipContent.files['download.zip'];
  if (downloadZipEntry && !downloadZipEntry.dir) {
    try {
      onProgress?.('Loading chapter content (download.zip)...');
      if (DEBUG) console.log('[Backup] download.zip found — loading nested zip...');

      const downloadZipBytes = await downloadZipEntry.async('uint8array');
      downloadZip = await new JSZip().loadAsync(downloadZipBytes);

      if (DEBUG) {
        const downloadFiles = Object.keys(downloadZip.files);
        console.log(`[Backup] download.zip contains ${downloadFiles.length} file(s)`);
        const samplePaths = downloadFiles.filter((f) => !downloadZip!.files[f].dir).slice(0, 8);
        console.log('[Backup] download.zip sample paths:', samplePaths);
      }
    } catch (err) {
      console.warn('[Backup] Failed to load download.zip — chapter content will be skipped:', err);
      downloadZip = null;
    }
  } else {
    if (DEBUG) console.log('[Backup] download.zip not found — importing metadata only');
  }

  // ── Find NovelAndChapters JSON files ─────────────────────────────────────
  const novelFiles = allFiles.filter(
    (name) =>
      name.startsWith('NovelAndChapters/') &&
      name.endsWith('.json') &&
      !zipContent.files[name].dir
  );

  if (novelFiles.length === 0) {
    console.warn('[Backup] No files found under NovelAndChapters/. All files:', allFiles);
    throw new Error('NO_NOVELS_FOUND');
  }

  if (DEBUG) console.log(`[Backup] Found ${novelFiles.length} novel file(s):`, novelFiles);

  let importedCount = 0;

  // 4. Process each novel JSON file
  for (let i = 0; i < novelFiles.length; i++) {
    const fileName = novelFiles[i];
    onProgress?.(`Importing novel ${i + 1}/${novelFiles.length}...`);

    try {
      const jsonString = await zipContent.files[fileName].async('string');
      const data: Record<string, any> = JSON.parse(jsonString);

      if (DEBUG) console.log(`[Backup] ${fileName} — top-level keys:`, Object.keys(data));

      // ── Resolve novel info ────────────────────────────────────────────────
      // Support both { novel: { name, url, cover } } and root-level fields
      const novelObj = data.novel ?? data;

      const novelTitle =
        novelObj.name || novelObj.novelName || novelObj.title || 'Unknown Novel';
      const novelUrl =
        novelObj.url || novelObj.novelUrl || novelObj.sourceUrl || novelObj.source || null;
      const novelCover =
        novelObj.cover || novelObj.novelCover || null;

      // LNReader stores pluginId and the novel's own id at root level.
      // These are needed to build the download.zip content path.
      const novelPluginId: string | null = data.pluginId || novelObj.pluginId || null;
      const lnreaderNovelId: number | null =
        typeof data.id === 'number' ? data.id : null;
      const novelPath  = data.path  || novelObj.path  || null;
      const novelSourceUrl = data.sourceUrl || novelObj.sourceUrl || null;

      if (DEBUG) {
        console.log(`[Backup] Detected novel title: "${novelTitle}"`);
        console.log(
          `[Backup] pluginId: "${novelPluginId}", lnreaderNovelId: ${lnreaderNovelId}, path: "${novelPath}"`
        );
      }

      // Insert novel into DB (gets our own auto-increment ID)
      const dbNovelId = await insertNovel(
        novelTitle,
        novelUrl,
        novelCover,
        novelPluginId,
        novelPath,
        novelSourceUrl
      );

      // ── Resolve chapter list ──────────────────────────────────────────────
      const rawChapters: any[] | undefined =
        findArray(data, 'chapters') ??
        findArray(data, 'chapter') ??
        findArray(data.novel, 'chapters') ??
        findArray(data.novel, 'chapter');

      if (!rawChapters || rawChapters.length === 0) {
        console.warn(`[Backup] No chapters found for "${novelTitle}"`);
        importedCount++;
        continue;
      }

      if (DEBUG) {
        console.log(`[Backup] Detected ${rawChapters.length} chapter(s) for "${novelTitle}"`);
        const firstCh = rawChapters[0];
        console.log('[Backup] First chapter keys:', Object.keys(firstCh));
        const inlineContentFields = [
          'text', 'chapterText', 'content', 'body', 'html', 'raw', 'chapterBody',
        ];
        const presentInline = inlineContentFields.filter(
          (f) => firstCh[f] !== undefined && firstCh[f] !== null && firstCh[f] !== ''
        );
        console.log(
          '[Backup] Inline content fields in first chapter:',
          presentInline.length > 0 ? presentInline : 'NONE'
        );
      }

      // ── Build chapters, reading from download.zip where possible ─────────
      //
      // We use a for-loop (not .map) because reading from JSZip is async.
      // For each chapter we try:
      //   1. download.zip at Novels/{pluginId}/{lnreaderNovelId}/{lnreaderChapterId}/index.html
      //   2. Inline text fields inside the chapter JSON (legacy / other exporters)
      //   3. null  (metadata-only import)

      const canReadDownload =
        downloadZip !== null &&
        novelPluginId !== null &&
        lnreaderNovelId !== null;

      const chaptersToInsert: {
        novelId: number;
        name: string;
        path: string | null;
        url: string | null;
        isDownloaded: boolean;
        originalText: string | null;
        orderIndex: number;
        chapterNumber: number | null;
        position: number | null;
      }[] = [];

      let downloadHits = 0;

      for (let ci = 0; ci < rawChapters.length; ci++) {
        const ch: Record<string, any> = rawChapters[ci];
        const lnreaderChapterId: number | null =
          typeof ch.id === 'number' ? ch.id : null;

        // ── Try download.zip first ────────────────────────────────────────
        let originalText: string | null = null;

        if (canReadDownload && lnreaderChapterId !== null) {
          const contentPath = `Novels/${novelPluginId}/${lnreaderNovelId}/${lnreaderChapterId}/index.html`;


          const htmlEntry = downloadZip!.files[contentPath];
          if (htmlEntry && !htmlEntry.dir) {
            try {
              const htmlString = await htmlEntry.async('string');
              const cleaned = stripHtml(htmlString);
              if (cleaned && cleaned.trim().length > 0) {
                originalText = cleaned;
                downloadHits++;
              }
            } catch (readErr) {
              console.warn(
                `[Backup] Failed to read HTML for chapter ${lnreaderChapterId}:`,
                readErr
              );
            }
          }
        }

        // ── Fall back to inline text fields if download.zip had nothing ───
        if (!originalText) {
          const inlineText =
            ch.text || ch.chapterText || ch.content ||
            ch.body || ch.html || ch.raw || ch.chapterBody || null;
          if (inlineText) {
            originalText = stripHtml(String(inlineText));
          }
        }

        chaptersToInsert.push({
          novelId: dbNovelId,
          name: ch.name || ch.chapterName || `Chapter ${ci + 1}`,
          path: ch.path || null,
          url: ch.url || ch.chapterUrl || null,
          isDownloaded: originalText !== null,
          originalText,
          orderIndex: ch.chapterNumber ?? ch.position ?? ci,
          chapterNumber: typeof ch.chapterNumber === 'number' ? ch.chapterNumber : null,
          position:      typeof ch.position      === 'number' ? ch.position      : null,
        });

        // Yield to the event loop every 100 chapters to avoid blocking the UI
        if (ci > 0 && ci % 100 === 0) {
          onProgress?.(`Processing chapters… ${ci}/${rawChapters.length}`);
          await yieldToEventLoop();
        }
      }

      const totalWithContent = chaptersToInsert.filter((c) => c.isDownloaded).length;
      if (DEBUG) {
        console.log(
          `[Backup] Content extraction done: ${downloadHits} from download.zip, ` +
          `${totalWithContent - downloadHits} inline, ` +
          `${rawChapters.length - totalWithContent} empty ` +
          `(total ${rawChapters.length})`
        );
      }

      onProgress?.(`Saving ${chaptersToInsert.length} chapters…`);
      await insertChapters(chaptersToInsert);

      importedCount++;
    } catch (err) {
      // Skip individual novel parse errors, continue with the rest
      console.warn(`[Backup] Failed to parse ${fileName}:`, err);
    }
  }

  if (importedCount === 0) {
    throw new Error('NO_NOVELS_FOUND');
  }

  return importedCount;
}

/**
 * Safely look up a key on an object and return it only if it's an array.
 */
function findArray(obj: any, key: string): any[] | undefined {
  if (obj && Array.isArray(obj[key])) {
    return obj[key];
  }
  return undefined;
}

/**
 * Yield to the React Native JS event loop so progress updates can render
 * and the UI doesn't freeze during large imports.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}