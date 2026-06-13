export interface Character {
  id: number;
  novelId: number;
  name: string;
  aliases: string[];
  description: string | null;
  createdAt: string;
  thumbnailFilename: string | null;
  attributeCount: number;
}

export interface CharacterImage {
  id: number;
  characterId: number;
  filename: string;
  caption: string | null;
  sortOrder: number;
}

export interface CharacterAttribute {
  id: number;
  characterId: number;
  attrKey: string;
  attrValue: string;
  sortOrder: number;
}
