import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { Image } from 'expo-image';
import { createCharacter, getCharactersByNovelId } from '../../../src/db/characters';
import { getNovelById } from '../../../src/db/database';
import { getImageUri } from '../../../src/services/characterImageStorage';
import type { Character } from '../../../src/types/character';
import type { Novel } from '../../../src/types/novel';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117',
  surface: '#161B22',
  card: '#1C2333',
  primary: '#7C3AED',
  text: '#E6EDF3',
  textSec: '#8B949E',
  textMuted: '#6B7280',
  border: '#30363D',
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CharactersScreen() {
  const { novelId } = useLocalSearchParams<{ novelId: string }>();
  const router = useRouter();
  const nId = parseInt(novelId, 10);

  const [novel, setNovel] = useState<Novel | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<{
    visible: boolean;
    name: string;
    description: string;
    saving: boolean;
  }>({ visible: false, name: '', description: '', saving: false });

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (isNaN(nId)) return;
    try {
      setLoading(true);
      const [n, chars] = await Promise.all([
        getNovelById(nId),
        getCharactersByNovelId(nId),
      ]);
      setNovel(n);
      setCharacters(chars);
    } catch {
      Alert.alert('Hata', 'Karakterler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [nId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Modal handlers ────────────────────────────────────────────────────────────

  const openModal = () =>
    setModal({ visible: true, name: '', description: '', saving: false });

  const closeModal = () =>
    setModal({ visible: false, name: '', description: '', saving: false });

  const handleSave = async () => {
    const name = modal.name.trim();
    if (!name) {
      Alert.alert('Eksik Alan', 'Karakter adı boş olamaz.');
      return;
    }
    setModal((m) => ({ ...m, saving: true }));
    try {
      await createCharacter({
        novelId: nId,
        name,
        description: modal.description.trim() || undefined,
      });
      closeModal();
      await loadData();
    } catch {
      Alert.alert('Hata', 'Karakter kaydedilemedi.');
      setModal((m) => ({ ...m, saving: false }));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Karakterler', headerBackTitle: 'Novel' }} />
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
          title: 'Karakterler',
          headerBackTitle: 'Novel',
          headerRight: () => (
            <TouchableOpacity
              onPress={openModal}
              activeOpacity={0.7}
              style={{ marginRight: 4, padding: 4 }}
            >
              <Text style={{ fontSize: 15, color: C.primary, fontWeight: '700' }}>
                + Yeni
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={s.root}>
        {novel?.title ? (
          <View style={s.subtitleBar}>
            <Text style={s.subtitleText} numberOfLines={1}>
              {novel.title}
            </Text>
          </View>
        ) : null}

        <FlatList
          data={characters}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyTitle}>Henüz karakter eklenmedi</Text>
              <Text style={s.emptyDesc}>
                İlk karakteri eklemek için sağ üstteki + Yeni butonuna bas.
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={openModal} activeOpacity={0.7}>
                <Text style={s.emptyBtnText}>+ İlk Karakteri Ekle</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <CharacterRow
              item={item}
              onPress={() =>
                router.push(`/characters/${nId}/${item.id}` as any)
              }
            />
          )}
        />
      </View>

      <AddModal
        visible={modal.visible}
        name={modal.name}
        description={modal.description}
        saving={modal.saving}
        onChangeName={(t) => setModal((m) => ({ ...m, name: t }))}
        onChangeDescription={(t) => setModal((m) => ({ ...m, description: t }))}
        onSave={handleSave}
        onClose={closeModal}
      />
    </>
  );
}

// ─── Character Row ────────────────────────────────────────────────────────────

function CharacterRow({
  item,
  onPress,
}: {
  item: Character;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      {item.thumbnailFilename ? (
        <Image
          source={{ uri: getImageUri(item.thumbnailFilename) }}
          style={s.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={[s.thumb, s.thumbPlaceholder]}>
          <Text style={s.thumbIcon}>👤</Text>
        </View>
      )}

      <View style={s.rowInfo}>
        <Text style={s.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.aliases.length > 0 && (
          <Text style={s.rowAliases} numberOfLines={1}>
            {item.aliases.join(', ')}
          </Text>
        )}
      </View>

      {item.attributeCount > 0 && (
        <View style={s.attrBadge}>
          <Text style={s.attrBadgeText}>{item.attributeCount} özellik</Text>
        </View>
      )}

      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Add Modal ────────────────────────────────────────────────────────────────

function AddModal({
  visible,
  name,
  description,
  saving,
  onChangeName,
  onChangeDescription,
  onSave,
  onClose,
}: {
  visible: boolean;
  name: string;
  description: string;
  saving: boolean;
  onChangeName: (t: string) => void;
  onChangeDescription: (t: string) => void;
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
            <Text style={m.title}>Yeni Karakter</Text>
            <TouchableOpacity
              onPress={onSave}
              style={m.saveBtn}
              disabled={saving}
              activeOpacity={0.7}
            >
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
            <Text style={m.label}>Karakter Adı *</Text>
            <TextInput
              style={m.input}
              value={name}
              onChangeText={onChangeName}
              placeholder="örn. Rimuru Tempest"
              placeholderTextColor={C.textMuted}
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={[m.label, { marginTop: 16 }]}>Açıklama (opsiyonel)</Text>
            <TextInput
              style={[m.input, m.inputMultiline]}
              value={description}
              onChangeText={onChangeDescription}
              placeholder="Kısa bir açıklama..."
              placeholderTextColor={C.textMuted}
              multiline
              numberOfLines={3}
              editable={!saving}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  subtitleBar: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  subtitleText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    padding: 14,
  },
  sep: {
    height: 8,
  },

  // ── Row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  thumbPlaceholder: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIcon: {
    fontSize: 24,
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  rowAliases: {
    fontSize: 12,
    color: C.textSec,
  },
  attrBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  attrBadgeText: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    color: C.textSec,
  },

  // ── Empty ──
  empty: {
    alignItems: 'center',
    paddingTop: 60,
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
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
