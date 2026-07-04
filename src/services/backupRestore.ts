import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { checkpointDatabase, closeDatabase, getDbInstance } from '../db/database';

const BACKUP_VERSION = '1';

function docDir(): string {
  const d = FileSystem.documentDirectory;
  if (!d) throw new Error('Belge dizini kullanılamıyor.');
  return d;
}

const dbPath = () => docDir() + 'SQLite/lntranslator.db';
const imagesPath = () => docDir() + 'character_images/';
const exportsDir = () => docDir() + 'exports/';

interface BackupManifest {
  version: string;
  exportDate: string;
  counts: { novels: number; chapters: number; characters: number };
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

export async function exportBackup(
  onProgress?: (msg: string) => void
): Promise<string> {
  const db = getDbInstance();

  onProgress?.('Veritabanı kontrol ediliyor…');
  await checkpointDatabase();

  const [novelRow, chapterRow, charRow] = await Promise.all([
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM novels'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM chapters'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM characters'),
  ]);

  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    counts: {
      novels: novelRow?.count ?? 0,
      chapters: chapterRow?.count ?? 0,
      characters: charRow?.count ?? 0,
    },
  };

  onProgress?.('Veritabanı okunuyor…');
  const dbInfo = await FileSystem.getInfoAsync(dbPath());
  if (!dbInfo.exists) throw new Error('Veritabanı dosyası bulunamadı.');

  const dbBase64 = await FileSystem.readAsStringAsync(dbPath(), {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.('ZIP oluşturuluyor…');
  const zip = new JSZip();
  zip.file('lntranslator.db', dbBase64, { base64: true });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const imagesInfo = await FileSystem.getInfoAsync(imagesPath());
  if (imagesInfo.exists) {
    onProgress?.('Görseller ekleniyor…');
    const imageFiles = await FileSystem.readDirectoryAsync(imagesPath());
    const imgFolder = zip.folder('character_images')!;
    for (const filename of imageFiles) {
      const imgBase64 = await FileSystem.readAsStringAsync(imagesPath() + filename, {
        encoding: FileSystem.EncodingType.Base64,
      });
      imgFolder.file(filename, imgBase64, { base64: true });
    }
  }

  onProgress?.('Kaydediliyor…');
  const zipBase64 = await zip.generateAsync({ type: 'base64' });
  await ensureDir(exportsDir());
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const zipPath = exportsDir() + `lntranslator_backup_${date}.zip`;
  await FileSystem.writeAsStringAsync(zipPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.('Tamamlandı!');
  return zipPath;
}

export async function shareBackup(zipPath: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Bu cihazda dosya paylaşımı desteklenmiyor.');
  await Sharing.shareAsync(zipPath, {
    mimeType: 'application/zip',
    dialogTitle: 'LNTranslator Yedeği',
  });
}

export interface RestoreResult {
  novels: number;
  chapters: number;
  characters: number;
}

export async function importBackup(
  onProgress?: (msg: string) => void
): Promise<RestoreResult> {
  onProgress?.('Dosya seçiliyor…');

  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets?.length) {
    throw new Error('FILE_PICKER_CANCELLED');
  }

  const zipUri = picked.assets[0].uri;

  onProgress?.('ZIP okunuyor…');
  const zipBase64 = await FileSystem.readAsStringAsync(zipUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.('Arşiv açılıyor…');
  let zip: JSZip;
  try {
    zip = await new JSZip().loadAsync(zipBase64, { base64: true });
  } catch {
    throw new Error('Geçersiz ZIP dosyası.');
  }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Geçersiz yedek: manifest.json bulunamadı.');

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await manifestFile.async('text')) as BackupManifest;
  } catch {
    throw new Error('Geçersiz yedek: manifest okunamadı.');
  }

  if (manifest.version !== BACKUP_VERSION) {
    throw new Error(`Uyumsuz yedek versiyonu: ${manifest.version}. Beklenen: ${BACKUP_VERSION}`);
  }

  const dbFile = zip.file('lntranslator.db');
  if (!dbFile) throw new Error('Geçersiz yedek: veritabanı bulunamadı.');

  const newDbBase64 = await dbFile.async('base64');

  onProgress?.('Veritabanı geri yükleniyor…');
  await closeDatabase();
  await ensureDir(docDir() + 'SQLite/');
  await FileSystem.writeAsStringAsync(dbPath(), newDbBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.('Görseller geri yükleniyor…');
  await ensureDir(imagesPath());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imgEntries: Array<{ path: string; file: any }> = [];
  zip.forEach((relativePath, file) => {
    if (relativePath.startsWith('character_images/') && !file.dir) {
      imgEntries.push({ path: relativePath, file });
    }
  });
  for (const { path, file } of imgEntries) {
    const filename = path.replace('character_images/', '');
    if (!filename) continue;
    const imgBase64 = (await file.async('base64')) as string;
    await FileSystem.writeAsStringAsync(imagesPath() + filename, imgBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  onProgress?.('Tamamlandı!');
  return manifest.counts;
}
