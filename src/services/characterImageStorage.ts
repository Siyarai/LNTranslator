import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { addCharacterImage, deleteCharacterImage, getCharacterImages } from '../db/characters';
import type { CharacterImage } from '../types/character';

const IMAGE_SUBDIR = 'character_images/';

function baseDir(): string {
  return FileSystem.documentDirectory + IMAGE_SUBDIR;
}

function generateFilename(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? 'jpg';
  const id = `${Date.now()}_${Math.floor(Math.random() * 1_000_000_000)}`;
  return `char_${id}.${ext}`;
}

async function ensureImageDirectory(): Promise<void> {
  const dir = baseDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export function getImageUri(filename: string): string {
  return baseDir() + filename;
}

export async function pickAndStoreImage(
  characterId: number
): Promise<CharacterImage | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[CharacterImageStorage] Media library permission denied');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    allowsEditing: false,
    quality: 0.8,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const filename = generateFilename(asset.uri);

  await ensureImageDirectory();
  await FileSystem.copyAsync({ from: asset.uri, to: baseDir() + filename });

  const imageId = await addCharacterImage({ characterId, filename });

  const images = await getCharacterImages(characterId);
  return images.find((img) => img.id === imageId) ?? null;
}

export async function deleteImage(image: CharacterImage): Promise<void> {
  const uri = getImageUri(image.filename);
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // File already gone — continue to DB deletion
  }
  await deleteCharacterImage(image.id);
}
