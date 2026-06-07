import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  addGlossaryEntry,
  bulkInsertGlossaryEntries,
  deleteGlossaryEntry,
  getGlossaryEntries,
  getNovelById,
  updateGlossaryEntry,
} from '../../src/db/database';
import type { GlossaryEntry } from '../../src/types/glossary';
import type { Novel } from '../../src/types/novel';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117',
  surface: '#161B22',
  card: '#1C2333',
  primary: '#7C3AED',
  primaryDark: '#6D28D9',
  text: '#E6EDF3',
  textSec: '#8B949E',
  textMuted: '#6B7280',
  border: '#30363D',
  danger: '#EF4444',
  dangerDim: '#7F1D1D',
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GlossaryScreen() {
  const { novelId } = useLocalSearchParams<{ novelId: string }>();
  const router = useRouter();
  const nId = parseInt(novelId, 10);

  const [novel, setNovel] = useState<Novel | null>(null);
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [importing, setImporting] = useState(false);

  // Modal state — handles both add (entry === null) and edit (entry !== null)
  const [modal, setModal] = useState<{
    visible: boolean;
    entry: GlossaryEntry | null;
    sourceText: string;
    targetText: string;
    saving: boolean;
  }>({ visible: false, entry: null, sourceText: '', targetText: '', saving: false });

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (isNaN(nId)) return;
    try {
      setLoading(true);
      const [n, e] = await Promise.all([getNovelById(nId), getGlossaryEntries(nId)]);
      setNovel(n);
      setEntries(e);
    } catch {
      Alert.alert('Hata', 'Glossary yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [nId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Alphabetical sort for display
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.sourceText.localeCompare(b.sourceText)),
    [entries]
  );

  // ── CRUD handlers ───────────────────────────────────────────────────────────

  const openAdd = () =>
    setModal({ visible: true, entry: null, sourceText: '', targetText: '', saving: false });

  const openEdit = (entry: GlossaryEntry) =>
    setModal({
      visible: true,
      entry,
      sourceText: entry.sourceText,
      targetText: entry.targetText,
      saving: false,
    });

  const closeModal = () =>
    setModal({ visible: false, entry: null, sourceText: '', targetText: '', saving: false });

  const handleSave = async () => {
    const src = modal.sourceText.trim();
    const tgt = modal.targetText.trim();

    if (!src) {
      Alert.alert('Eksik Alan', 'Kaynak metin boş olamaz.');
      return;
    }
    if (!tgt) {
      Alert.alert('Eksik Alan', 'Hedef metin boş olamaz.');
      return;
    }

    setModal((m) => ({ ...m, saving: true }));
    try {
      if (modal.entry) {
        await updateGlossaryEntry(modal.entry.id, { sourceText: src, targetText: tgt });
        setEntries((prev) =>
          prev.map((e) =>
            e.id === modal.entry!.id ? { ...e, sourceText: src, targetText: tgt } : e
          )
        );
      } else {
        const newId = await addGlossaryEntry({ novelId: nId, sourceText: src, targetText: tgt });
        setEntries((prev) => [
          ...prev,
          {
            id: newId,
            novelId: nId,
            sourceText: src,
            targetText: tgt,
            isActive: 1,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      closeModal();
    } catch (err: any) {
      const isDuplicate =
        err?.message?.includes('UNIQUE') || err?.message?.includes('unique');
      Alert.alert(
        isDuplicate ? 'Zaten Var' : 'Hata',
        isDuplicate
          ? `"${src}" bu novel'da zaten mevcut.`
          : 'Kayıt sırasında bir hata oluştu.'
      );
      setModal((m) => ({ ...m, saving: false }));
    }
  };

  const handleToggle = async (entry: GlossaryEntry) => {
    const next = entry.isActive === 1 ? 0 : 1;
    try {
      await updateGlossaryEntry(entry.id, { isActive: next });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, isActive: next } : e))
      );
    } catch {
      Alert.alert('Hata', 'Durum güncellenemedi.');
    }
  };

  const handleDelete = (entry: GlossaryEntry) => {
    Alert.alert(
      'Terimi Sil',
      `"${entry.sourceText}" silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGlossaryEntry(entry.id);
              setEntries((prev) => prev.filter((e) => e.id !== entry.id));
            } catch {
              Alert.alert('Hata', 'Terim silinemedi.');
            }
          },
        },
      ]
    );
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setMenuVisible(false);
    if (entries.length === 0) {
      Alert.alert('Dışa Aktarma', 'Aktarılacak terim yok.');
      return;
    }

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Desteklenmiyor', 'Bu cihazda dosya paylaşımı desteklenmiyor.');
      return;
    }

    try {
      const payload = entries.map((e) => ({
        sourceText: e.sourceText,
        targetText: e.targetText,
        isActive: e.isActive,
      }));
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `lntranslator_glossary_${nId}_${date}.json`;
      const cacheDir: string = (FileSystem as any).cacheDirectory ?? '';
      const path = `${cacheDir}${filename}`;

      await FileSystem.writeAsStringAsync(path, json, { encoding: 'utf8' as any });
      await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Glossary Dışa Aktar' });
    } catch {
      Alert.alert('Hata', 'Dışa aktarma başarısız oldu.');
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setMenuVisible(false);
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: 'utf8' as any,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        Alert.alert('Geçersiz Dosya', 'Dosya geçerli bir JSON değil.');
        return;
      }

      if (!Array.isArray(parsed)) {
        Alert.alert('Geçersiz Format', 'JSON bir dizi olmalı: [{ sourceText, targetText }, ...]');
        return;
      }

      // Validate and extract
      const valid: Array<{ sourceText: string; targetText: string }> = [];
      let invalidCount = 0;

      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as any).sourceText === 'string' &&
          (item as any).sourceText.trim() &&
          typeof (item as any).targetText === 'string' &&
          (item as any).targetText.trim()
        ) {
          valid.push({
            sourceText: (item as any).sourceText.trim(),
            targetText: (item as any).targetText.trim(),
          });
        } else {
          invalidCount++;
        }
      }

      if (valid.length === 0) {
        Alert.alert(
          'Geçerli Terim Yok',
          'Dosyada geçerli terim bulunamadı. Her öğe { sourceText, targetText } içermeli.'
        );
        return;
      }

      const { inserted, skipped } = await bulkInsertGlossaryEntries(nId, valid);
      await loadData();

      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} terim eklendi`);
      if (skipped > 0) parts.push(`${skipped} duplicate atlandı`);
      if (invalidCount > 0) parts.push(`${invalidCount} geçersiz öğe atlandı`);
      Alert.alert('İçe Aktarma Tamam', parts.join(', ') + '.');
    } catch (err: any) {
      if (!err?.message?.includes('cancelled') && !err?.message?.includes('canceled')) {
        Alert.alert('Hata', 'İçe aktarma başarısız oldu.');
      }
    } finally {
      setImporting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Glossary', headerBackTitle: 'Novel' }} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: novel ? `Glossary` : 'Glossary',
          headerBackTitle: 'Novel',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              activeOpacity={0.7}
              style={{ marginRight: 4, padding: 4 }}
            >
              <Text style={{ fontSize: 22, color: C.textSec }}>⋯</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={s.root}>
        {importing && (
          <View style={s.importBar}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={s.importBarText}>İçe aktarılıyor…</Text>
          </View>
        )}

        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListHeaderComponent={
            <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.7}>
              <Text style={s.addBtnText}>+ Yeni Terim Ekle</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📝</Text>
              <Text style={s.emptyTitle}>Henüz terim eklenmedi</Text>
              <Text style={s.emptyDesc}>
                Karakter isimleri, yer adları gibi sabit kalmasını istediğin
                terimleri ekle. Çeviri sırasında bu terimler DeepL'e
                gönderilmeden korunur.
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={openAdd} activeOpacity={0.7}>
                <Text style={s.emptyBtnText}>+ Yeni Terim Ekle</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              onEdit={openEdit}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
        />
      </View>

      {/* Add / Edit Modal */}
      <EntryModal
        visible={modal.visible}
        entry={modal.entry}
        sourceText={modal.sourceText}
        targetText={modal.targetText}
        saving={modal.saving}
        onChangeSource={(t) => setModal((m) => ({ ...m, sourceText: t }))}
        onChangeTarget={(t) => setModal((m) => ({ ...m, targetText: t }))}
        onSave={handleSave}
        onClose={closeModal}
      />

      {/* Import / Export Menu */}
      <MenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onExport={handleExport}
        onImport={handleImport}
      />
    </>
  );
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  onEdit,
  onToggle,
  onDelete,
}: {
  entry: GlossaryEntry;
  onEdit: (e: GlossaryEntry) => void;
  onToggle: (e: GlossaryEntry) => void;
  onDelete: (e: GlossaryEntry) => void;
}) {
  const active = entry.isActive === 1;
  return (
    <TouchableOpacity style={s.row} onPress={() => onEdit(entry)} activeOpacity={0.7}>
      <View style={s.rowTexts}>
        <Text style={[s.rowSource, !active && s.rowInactive]} numberOfLines={1}>
          {entry.sourceText}
        </Text>
        <Text style={[s.rowTarget, !active && s.rowInactive]} numberOfLines={1}>
          → {entry.targetText}
        </Text>
      </View>

      <View style={s.rowActions}>
        {/* Toggle */}
        <TouchableOpacity onPress={() => onToggle(entry)} activeOpacity={0.7} hitSlop={8}>
          <View style={[s.toggleTrack, active && s.toggleTrackOn]}>
            <View style={[s.toggleThumb, active && s.toggleThumbOn]} />
          </View>
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity
          onPress={() => onDelete(entry)}
          activeOpacity={0.7}
          hitSlop={8}
          style={s.deleteBtn}
        >
          <Text style={s.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────

function EntryModal({
  visible,
  entry,
  sourceText,
  targetText,
  saving,
  onChangeSource,
  onChangeTarget,
  onSave,
  onClose,
}: {
  visible: boolean;
  entry: GlossaryEntry | null;
  sourceText: string;
  targetText: string;
  saving: boolean;
  onChangeSource: (t: string) => void;
  onChangeTarget: (t: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <TouchableOpacity onPress={onClose} style={m.cancelBtn} disabled={saving}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <Text style={m.title}>{entry ? 'Terimi Düzenle' : 'Yeni Terim'}</Text>
            <TouchableOpacity onPress={onSave} style={m.saveBtn} disabled={saving} activeOpacity={0.7}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={m.saveText}>Kaydet</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={m.body}
            contentContainerStyle={m.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={m.label}>Kaynak Metin</Text>
            <TextInput
              style={m.input}
              value={sourceText}
              onChangeText={onChangeSource}
              placeholder="Orijinal terim (örn. Tanaka-san)"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={[m.label, { marginTop: 16 }]}>Hedef Metin</Text>
            <TextInput
              style={m.input}
              value={targetText}
              onChangeText={onChangeTarget}
              placeholder="Çevrilmiş karşılık (örn. Tanaka-san)"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={m.hint}>
              Çeviri sırasında kaynak metin her geçtiğinde hedef metinle değiştirilir.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Menu Modal ───────────────────────────────────────────────────────────────

function MenuModal({
  visible,
  onClose,
  onExport,
  onImport,
}: {
  visible: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={mn.overlay} activeOpacity={1} onPress={onClose}>
        <View style={mn.sheet}>
          <Text style={mn.menuTitle}>Glossary</Text>

          <TouchableOpacity style={mn.option} onPress={onExport} activeOpacity={0.7}>
            <Text style={mn.optionIcon}>📤</Text>
            <View style={mn.optionInfo}>
              <Text style={mn.optionLabel}>Dışa Aktar</Text>
              <Text style={mn.optionDesc}>JSON dosyası olarak kaydet</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={mn.option} onPress={onImport} activeOpacity={0.7}>
            <Text style={mn.optionIcon}>📥</Text>
            <View style={mn.optionInfo}>
              <Text style={mn.optionLabel}>İçe Aktar</Text>
              <Text style={mn.optionDesc}>JSON dosyasından terimleri ekle</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={mn.cancelOption} onPress={onClose} activeOpacity={0.7}>
            <Text style={mn.cancelText}>İptal</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  importBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.surface,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  importBarText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    padding: 14,
  },
  sep: {
    height: 8,
  },
  addBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Entry row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowSource: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  rowTarget: {
    fontSize: 13,
    color: C.textSec,
  },
  rowInactive: {
    opacity: 0.4,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: C.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.textSec,
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
  },
  deleteBtn: {
    padding: 2,
  },
  deleteBtnText: {
    fontSize: 18,
  },

  // ── Empty state ──
  empty: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: C.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

// ─── Entry Modal Styles ───────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  cancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 48,
  },
  cancelText: {
    color: C.textSec,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  label: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  hint: {
    marginTop: 20,
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
});

// ─── Menu Modal Styles ────────────────────────────────────────────────────────

const mn = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 8,
  },
  menuTitle: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  optionIcon: {
    fontSize: 22,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDesc: {
    color: C.textSec,
    fontSize: 12,
  },
  cancelOption: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    color: C.textSec,
    fontSize: 15,
    fontWeight: '600',
  },
});
