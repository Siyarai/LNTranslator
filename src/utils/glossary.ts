import type { GlossaryEntry } from '../types/glossary';

const PH_OPEN = '｢';
const PH_CLOSE = '｣';

function ph(id: number): string {
  return `${PH_OPEN}G${id}${PH_CLOSE}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace each active entry's sourceText with a placeholder token.
 * Longest entries are applied first to prevent partial matches.
 * Returns the processed text and the subset of entries that were actually used.
 */
export function applyGlossaryToText(
  text: string,
  entries: GlossaryEntry[]
): { processedText: string; usedEntries: GlossaryEntry[] } {
  const active = entries
    .filter((e) => e.isActive === 1)
    .sort((a, b) => {
      const lenDiff = b.sourceText.length - a.sourceText.length;
      return lenDiff !== 0 ? lenDiff : a.id - b.id;
    });

  const usedEntries: GlossaryEntry[] = [];
  let processedText = text;

  for (const entry of active) {
    const pattern = new RegExp(escapeRegex(entry.sourceText), 'gi');
    const next = processedText.replace(pattern, ph(entry.id));
    if (next !== processedText) {
      usedEntries.push(entry);
      processedText = next;
    }
  }

  return { processedText, usedEntries };
}

/**
 * Replace placeholder tokens in the translated text with their targetText values.
 * Tries exact string match first; falls back to a space-tolerant regex if DeepL
 * inserted whitespace inside the token, and warns when the fallback is triggered.
 */
export function restoreGlossaryFromText(
  translatedText: string,
  usedEntries: GlossaryEntry[]
): string {
  let result = translatedText;

  for (const entry of usedEntries) {
    const exact = ph(entry.id);

    if (result.includes(exact)) {
      result = result.split(exact).join(entry.targetText);
    } else {
      const fallback = new RegExp(
        `${PH_OPEN}\\s*G\\s*${entry.id}\\s*${PH_CLOSE}`,
        'g'
      );
      const next = result.replace(fallback, entry.targetText);
      if (next !== result) {
        console.warn(
          `[Glossary] Fallback restore used for entry id=${entry.id} ("${entry.sourceText}")`
        );
        result = next;
      }
    }
  }

  return result;
}
