import { applyGlossaryToText, restoreGlossaryFromText } from './glossary';
import type { GlossaryEntry } from '../types/glossary';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function entry(
  id: number,
  sourceText: string,
  targetText: string,
  isActive = 1
): GlossaryEntry {
  return { id, novelId: 1, sourceText, targetText, isActive, createdAt: '' };
}

// ─── applyGlossaryToText ──────────────────────────────────────────────────────

describe('applyGlossaryToText', () => {
  test('empty glossary — text unchanged, usedEntries empty', () => {
    const { processedText, usedEntries } = applyGlossaryToText('Hello world', []);
    expect(processedText).toBe('Hello world');
    expect(usedEntries).toHaveLength(0);
  });

  test('single entry — replaces all occurrences', () => {
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const { processedText, usedEntries } = applyGlossaryToText(
      'Tanaka walked. Then Tanaka spoke.',
      entries
    );
    expect(processedText).toBe('｢G1｣ walked. Then ｢G1｣ spoke.');
    expect(usedEntries).toHaveLength(1);
    expect(usedEntries[0].id).toBe(1);
  });

  test('overlapping terms — longest applied first', () => {
    // "Tanaka-san" must be replaced before "Tanaka" to avoid partial match
    const entries = [
      entry(1, 'Tanaka', 'Tanaka'),
      entry(2, 'Tanaka-san', 'Tanaka-san'),
    ];
    const { processedText } = applyGlossaryToText(
      'Tanaka-san bowed. Tanaka watched.',
      entries
    );
    expect(processedText).toBe('｢G2｣ bowed. ｢G1｣ watched.');
  });

  test('regex special chars in sourceText — escaped correctly', () => {
    const entries = [
      entry(1, 'Mr. Smith', 'Bay Smith'),
      entry(2, '(önemli)', '(important)'),
      entry(3, 'a/b', 'a veya b'),
    ];
    const text = 'Mr. Smith said (önemli) about a/b ratio.';
    const { processedText, usedEntries } = applyGlossaryToText(text, entries);
    expect(processedText).toBe('｢G1｣ said ｢G2｣ about ｢G3｣ ratio.');
    expect(usedEntries).toHaveLength(3);
  });

  test('case-insensitive matching — all variations matched', () => {
    const entries = [entry(1, 'hero', 'kahraman')];
    const { processedText } = applyGlossaryToText(
      'Hero fights. HERO wins. hero lives.',
      entries
    );
    expect(processedText).toBe('｢G1｣ fights. ｢G1｣ wins. ｢G1｣ lives.');
  });

  test('inactive entry (isActive=0) — not applied', () => {
    const entries = [
      entry(1, 'Tanaka', 'Tanaka', 1),
      entry(2, 'Yamamoto', 'Yamamoto', 0),
    ];
    const { processedText, usedEntries } = applyGlossaryToText(
      'Tanaka and Yamamoto arrived.',
      entries
    );
    expect(processedText).toBe('｢G1｣ and Yamamoto arrived.');
    expect(usedEntries.map((e) => e.id)).toEqual([1]);
  });

  test('entry not found in text — not added to usedEntries', () => {
    const entries = [
      entry(1, 'Tanaka', 'Tanaka'),
      entry(2, 'Nobody', 'Nobody'),
    ];
    const { processedText, usedEntries } = applyGlossaryToText(
      'Tanaka arrived.',
      entries
    );
    expect(processedText).toBe('｢G1｣ arrived.');
    expect(usedEntries).toHaveLength(1);
    expect(usedEntries[0].id).toBe(1);
  });

  test('multiline text — newlines preserved', () => {
    const entries = [entry(1, 'Dragon', 'Ejderha')];
    const text = 'The Dragon roared.\nAnother Dragon appeared.\n\nEnd.';
    const { processedText } = applyGlossaryToText(text, entries);
    expect(processedText).toBe(
      'The ｢G1｣ roared.\nAnother ｢G1｣ appeared.\n\nEnd.'
    );
  });

  test('equal-length terms — tiebreaker by id (lower id wins ordering)', () => {
    // Both "abc" and "xyz" are 3 chars — lower id should be applied first
    // In practice this means id=1 appears earlier in the sorted array,
    // but the important thing is that the sort is stable/deterministic.
    const entries = [
      entry(2, 'xyz', 'XYZ'),
      entry(1, 'abc', 'ABC'),
    ];
    const { processedText } = applyGlossaryToText('abc xyz', entries);
    expect(processedText).toBe('｢G1｣ ｢G2｣');
  });
});

// ─── restoreGlossaryFromText ──────────────────────────────────────────────────

describe('restoreGlossaryFromText', () => {
  test('exact restore — placeholder replaced with targetText', () => {
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const result = restoreGlossaryFromText('｢G1｣ walked.', entries);
    expect(result).toBe('Tanaka walked.');
  });

  test('multiple placeholders — all restored', () => {
    const entries = [
      entry(1, 'Tanaka-san', 'Tanaka-san'),
      entry(2, 'Yamamoto', 'Yamamoto'),
    ];
    const result = restoreGlossaryFromText('｢G2｣ bowed to ｢G1｣.', entries);
    expect(result).toBe('Yamamoto bowed to Tanaka-san.');
  });

  test('same placeholder repeated — all occurrences restored', () => {
    const entries = [entry(1, 'Dragon', 'Ejderha')];
    const result = restoreGlossaryFromText('｢G1｣ roared. ｢G1｣ flew.', entries);
    expect(result).toBe('Ejderha roared. Ejderha flew.');
  });

  test('fallback restore — space after open bracket', () => {
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const result = restoreGlossaryFromText('｢ G1｣ walked.', entries);
    expect(result).toBe('Tanaka walked.');
  });

  test('fallback restore — space before close bracket', () => {
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const result = restoreGlossaryFromText('｢G1 ｣ walked.', entries);
    expect(result).toBe('Tanaka walked.');
  });

  test('fallback restore — space inside G and number', () => {
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const result = restoreGlossaryFromText('｢G 1｣ walked.', entries);
    expect(result).toBe('Tanaka walked.');
  });

  test('fallback restore — spaces on both sides', () => {
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const result = restoreGlossaryFromText('｢ G 1 ｣ walked.', entries);
    expect(result).toBe('Tanaka walked.');
  });

  test('fallback restore — logs warning without crashing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    restoreGlossaryFromText('｢ G1 ｣ walked.', entries);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Fallback restore used for entry id=1')
    );
    warn.mockRestore();
  });

  test('unknown placeholder in text — left unchanged, no crash', () => {
    // id=99 is not in usedEntries
    const entries = [entry(1, 'Tanaka', 'Tanaka')];
    const result = restoreGlossaryFromText('｢G99｣ walked. ｢G1｣ ran.', entries);
    expect(result).toBe('｢G99｣ walked. Tanaka ran.');
  });

  test('empty usedEntries — text returned as-is', () => {
    const result = restoreGlossaryFromText('Some text ｢G1｣ here.', []);
    expect(result).toBe('Some text ｢G1｣ here.');
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip: apply → restore', () => {
  test('single entry — exact match', () => {
    const entries = [entry(42, 'Tanaka-san', 'Tanaka-san')];
    const original = 'Tanaka-san smiled.';
    const { processedText, usedEntries } = applyGlossaryToText(original, entries);
    const restored = restoreGlossaryFromText(processedText, usedEntries);
    expect(restored).toBe('Tanaka-san smiled.');
  });

  test('multiple overlapping entries — all restored correctly', () => {
    const entries = [
      entry(1, 'Tanaka', 'Tanaka'),
      entry(2, 'Tanaka-san', 'Tanaka-san'),
      entry(3, 'Mr. Smith', 'Bay Smith'),
    ];
    const original = 'Tanaka-san greeted Mr. Smith. Tanaka watched.';
    const { processedText, usedEntries } = applyGlossaryToText(original, entries);
    const restored = restoreGlossaryFromText(processedText, usedEntries);
    expect(restored).toBe('Tanaka-san greeted Bay Smith. Tanaka watched.');
  });

  test('targetText differs from sourceText — target is in output', () => {
    const entries = [entry(1, 'Dragon', 'Ejderha')];
    const { processedText, usedEntries } = applyGlossaryToText('The Dragon roared.', entries);
    const restored = restoreGlossaryFromText(processedText, usedEntries);
    expect(restored).toBe('The Ejderha roared.');
  });
});
