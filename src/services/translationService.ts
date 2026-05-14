import axios from "axios";
import {
  getChapterById,
  updateChapterTranslation,
} from "../db/database";
import { chunkText } from "../utils/chunkText";

const DEEPL_ENDPOINT = "https://api-free.deepl.com/v2/translate";

export async function translateTextToTurkish(text: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_DEEPL_API_KEY;

  if (!apiKey) {
    throw new Error("Translation API key is not configured.");
  }

  const params = new URLSearchParams();
  params.append("text", text);
  params.append("target_lang", "TR");

  try {
    const response = await axios.post(DEEPL_ENDPOINT, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `DeepL-Auth-Key ${apiKey}`,
      },
      timeout: 30000,
    });

    const translated = response.data?.translations?.[0]?.text;

    if (!translated) {
      throw new Error("Translation response is empty.");
    }

    return translated;
  } catch (error: any) {
    console.warn(
      '[DeepL] Translation failed:',
      error.response?.status ?? '',
      error.message
    );

    throw error;
  }
}

/**
 * Translate a full chapter with chunking and progress.
 * - If a cached translation exists in the DB, returns it immediately.
 * - Otherwise, splits the text, translates each chunk, saves to DB.
 */
export async function translateChapter(
  chapterId: number,
  fullText: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  const chapter = await getChapterById(chapterId);

  if (chapter?.isTranslated && chapter.translatedText) {
    return chapter.translatedText;
  }

  const chunks = chunkText(fullText);
  const translatedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);

    const translated = await translateTextToTurkish(chunks[i]);
    translatedChunks.push(translated);
  }

  const fullTranslation = translatedChunks.join("\n\n");

  await updateChapterTranslation(chapterId, fullTranslation);

  return fullTranslation;
}

/**
 * Force-translate a chapter, ignoring any cached translation.
 * Always calls DeepL and overwrites the stored translation.
 */
export async function forceTranslateChapter(
  chapterId: number,
  fullText: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  const chunks = chunkText(fullText);
  const translatedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);

    const translated = await translateTextToTurkish(chunks[i]);
    translatedChunks.push(translated);
  }

  const fullTranslation = translatedChunks.join("\n\n");

  await updateChapterTranslation(chapterId, fullTranslation);

  return fullTranslation;
}