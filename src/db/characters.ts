import type { Character, CharacterImage, CharacterAttribute } from '../types/character';
import { getDbInstance } from './database';

// ─── Aliases helpers ──────────────────────────────────────────

export function parseAliases(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function stringifyAliases(arr: string[]): string {
  return JSON.stringify(arr);
}

// ─── Character CRUD ───────────────────────────────────────────

export async function getCharactersByNovelId(novelId: number): Promise<Character[]> {
  const db = getDbInstance();
  const rows = await db.getAllAsync<{
    id: number;
    novelId: number;
    name: string;
    aliases: string | null;
    description: string | null;
    createdAt: string;
    thumbnailFilename: string | null;
    attributeCount: number;
  }>(
    `SELECT
       c.id, c.novelId, c.name, c.aliases, c.description, c.createdAt,
       (SELECT ci.filename FROM character_images ci
        WHERE ci.characterId = c.id ORDER BY ci.sortOrder ASC LIMIT 1) AS thumbnailFilename,
       (SELECT COUNT(*) FROM character_attributes ca WHERE ca.characterId = c.id) AS attributeCount
     FROM characters c
     WHERE c.novelId = ?
     ORDER BY c.name ASC`,
    [novelId]
  );
  return rows.map((r) => ({
    id: r.id,
    novelId: r.novelId,
    name: r.name,
    aliases: parseAliases(r.aliases),
    description: r.description,
    createdAt: r.createdAt,
    thumbnailFilename: r.thumbnailFilename,
    attributeCount: r.attributeCount,
  }));
}

export async function getCharacterById(id: number): Promise<Character | null> {
  const db = getDbInstance();
  const row = await db.getFirstAsync<{
    id: number;
    novelId: number;
    name: string;
    aliases: string | null;
    description: string | null;
    createdAt: string;
    thumbnailFilename: string | null;
    attributeCount: number;
  }>(
    `SELECT
       c.id, c.novelId, c.name, c.aliases, c.description, c.createdAt,
       (SELECT ci.filename FROM character_images ci
        WHERE ci.characterId = c.id ORDER BY ci.sortOrder ASC LIMIT 1) AS thumbnailFilename,
       (SELECT COUNT(*) FROM character_attributes ca WHERE ca.characterId = c.id) AS attributeCount
     FROM characters c
     WHERE c.id = ?`,
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    novelId: row.novelId,
    name: row.name,
    aliases: parseAliases(row.aliases),
    description: row.description,
    createdAt: row.createdAt,
    thumbnailFilename: row.thumbnailFilename,
    attributeCount: row.attributeCount,
  };
}

export async function createCharacter(data: {
  novelId: number;
  name: string;
  aliases?: string[];
  description?: string;
}): Promise<number> {
  const db = getDbInstance();
  const result = await db.runAsync(
    'INSERT INTO characters (novelId, name, aliases, description, createdAt) VALUES (?, ?, ?, ?, ?)',
    [
      data.novelId,
      data.name,
      data.aliases ? stringifyAliases(data.aliases) : null,
      data.description ?? null,
      new Date().toISOString(),
    ]
  );
  return result.lastInsertRowId;
}

export async function updateCharacter(
  id: number,
  partial: Partial<Pick<Character, 'name' | 'description'> & { aliases: string[] }>
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | null)[] = [];

  if (partial.name !== undefined) {
    setClauses.push('name = ?');
    values.push(partial.name);
  }
  if (partial.aliases !== undefined) {
    setClauses.push('aliases = ?');
    values.push(stringifyAliases(partial.aliases));
  }
  if (partial.description !== undefined) {
    setClauses.push('description = ?');
    values.push(partial.description ?? null);
  }

  if (setClauses.length === 0) return;

  const db = getDbInstance();
  await db.runAsync(
    `UPDATE characters SET ${setClauses.join(', ')} WHERE id = ?`,
    [...values, id]
  );
}

export async function deleteCharacter(id: number): Promise<void> {
  const db = getDbInstance();
  await db.runAsync('DELETE FROM characters WHERE id = ?', [id]);
}

// ─── Character Images CRUD ────────────────────────────────────

export async function getCharacterImages(characterId: number): Promise<CharacterImage[]> {
  const db = getDbInstance();
  const rows = await db.getAllAsync<{
    id: number;
    characterId: number;
    filename: string;
    caption: string | null;
    sortOrder: number;
  }>(
    'SELECT * FROM character_images WHERE characterId = ? ORDER BY sortOrder ASC',
    [characterId]
  );
  return rows.map((r) => ({
    id: r.id,
    characterId: r.characterId,
    filename: r.filename,
    caption: r.caption,
    sortOrder: r.sortOrder,
  }));
}

export async function addCharacterImage(data: {
  characterId: number;
  filename: string;
  caption?: string;
}): Promise<number> {
  const db = getDbInstance();
  const maxRow = await db.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sortOrder) as maxOrder FROM character_images WHERE characterId = ?',
    [data.characterId]
  );
  const nextOrder = (maxRow?.maxOrder ?? -1) + 1;
  const result = await db.runAsync(
    'INSERT INTO character_images (characterId, filename, caption, sortOrder) VALUES (?, ?, ?, ?)',
    [data.characterId, data.filename, data.caption ?? null, nextOrder]
  );
  return result.lastInsertRowId;
}

export async function deleteCharacterImage(id: number): Promise<void> {
  const db = getDbInstance();
  await db.runAsync('DELETE FROM character_images WHERE id = ?', [id]);
}

export async function reorderCharacterImages(
  characterId: number,
  orderedIds: number[]
): Promise<void> {
  const db = getDbInstance();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync(
        'UPDATE character_images SET sortOrder = ? WHERE id = ? AND characterId = ?',
        [i, orderedIds[i], characterId]
      );
    }
  });
}

// ─── Character Attributes CRUD ────────────────────────────────

export async function getCharacterAttributes(characterId: number): Promise<CharacterAttribute[]> {
  const db = getDbInstance();
  const rows = await db.getAllAsync<{
    id: number;
    characterId: number;
    attrKey: string;
    attrValue: string;
    sortOrder: number;
  }>(
    'SELECT * FROM character_attributes WHERE characterId = ? ORDER BY sortOrder ASC',
    [characterId]
  );
  return rows.map((r) => ({
    id: r.id,
    characterId: r.characterId,
    attrKey: r.attrKey,
    attrValue: r.attrValue,
    sortOrder: r.sortOrder,
  }));
}

export async function addCharacterAttribute(data: {
  characterId: number;
  attrKey: string;
  attrValue: string;
}): Promise<number> {
  const db = getDbInstance();
  const maxRow = await db.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sortOrder) as maxOrder FROM character_attributes WHERE characterId = ?',
    [data.characterId]
  );
  const nextOrder = (maxRow?.maxOrder ?? -1) + 1;
  const result = await db.runAsync(
    'INSERT INTO character_attributes (characterId, attrKey, attrValue, sortOrder) VALUES (?, ?, ?, ?)',
    [data.characterId, data.attrKey, data.attrValue, nextOrder]
  );
  return result.lastInsertRowId;
}

export async function updateCharacterAttribute(
  id: number,
  partial: Partial<Pick<CharacterAttribute, 'attrKey' | 'attrValue'>>
): Promise<void> {
  const setClauses: string[] = [];
  const values: string[] = [];

  if (partial.attrKey !== undefined) {
    setClauses.push('attrKey = ?');
    values.push(partial.attrKey);
  }
  if (partial.attrValue !== undefined) {
    setClauses.push('attrValue = ?');
    values.push(partial.attrValue);
  }

  if (setClauses.length === 0) return;

  const db = getDbInstance();
  await db.runAsync(
    `UPDATE character_attributes SET ${setClauses.join(', ')} WHERE id = ?`,
    [...values, id]
  );
}

export async function deleteCharacterAttribute(id: number): Promise<void> {
  const db = getDbInstance();
  await db.runAsync('DELETE FROM character_attributes WHERE id = ?', [id]);
}
