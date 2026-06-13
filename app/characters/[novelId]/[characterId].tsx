import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addCharacterAttribute,
  deleteCharacter,
  deleteCharacterAttribute,
  getCharacterAttributes,
  getCharacterById,
  getCharacterImages,
  updateCharacter,
  updateCharacterAttribute,
} from '../../../src/db/characters';
import { deleteImage, pickAndStoreImage } from '../../../src/services/characterImageStorage';
import AttributeList from '../../../src/components/character/AttributeList';
import FullscreenImageModal from '../../../src/components/character/FullscreenImageModal';
import ImageGallery from '../../../src/components/character/ImageGallery';
import type { Character, CharacterAttribute, CharacterImage } from '../../../src/types/character';

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
  danger: '#EF4444',
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CharacterDetailScreen() {
  const { novelId, characterId } = useLocalSearchParams<{
    novelId: string;
    characterId: string;
  }>();
  const router = useRouter();
  const charId = parseInt(characterId, 10);

  // ── Data state ───────────────────────────────────────────────────────────────
  const [character, setCharacter] = useState<Character | null>(null);
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [attributes, setAttributes] = useState<CharacterAttribute[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Name edit ────────────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // ── Description edit ─────────────────────────────────────────────────────────
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState('');

  // ── Alias add ────────────────────────────────────────────────────────────────
  const [addingAlias, setAddingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState('');

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [menuVisible, setMenuVisible] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<CharacterImage | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (isNaN(charId)) return;
    try {
      setLoading(true);
      const [char, imgs, attrs] = await Promise.all([
        getCharacterById(charId),
        getCharacterImages(charId),
        getCharacterAttributes(charId),
      ]);
      if (!char) {
        Alert.alert('Hata', 'Karakter bulunamadı.');
        router.back();
        return;
      }
      setCharacter(char);
      setImages(imgs);
      setAttributes(attrs);
    } catch {
      Alert.alert('Hata', 'Karakter yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [charId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Name handlers ─────────────────────────────────────────────────────────────

  const startEditName = () => {
    setNameInput(character?.name ?? '');
    setEditingName(true);
  };

  const saveEditName = async () => {
    const name = nameInput.trim();
    if (!name) return;
    try {
      await updateCharacter(charId, { name });
      setCharacter((c) => (c ? { ...c, name } : c));
      setEditingName(false);
    } catch {
      Alert.alert('Hata', 'İsim güncellenemedi.');
    }
  };

  const cancelEditName = () => setEditingName(false);

  // ── Description handlers ──────────────────────────────────────────────────────

  const startEditDesc = () => {
    setDescInput(character?.description ?? '');
    setEditingDesc(true);
  };

  const saveEditDesc = async () => {
    const description = descInput.trim() || null;
    try {
      await updateCharacter(charId, { description });
      setCharacter((c) => (c ? { ...c, description } : c));
      setEditingDesc(false);
    } catch {
      Alert.alert('Hata', 'Açıklama güncellenemedi.');
    }
  };

  const cancelEditDesc = () => setEditingDesc(false);

  // ── Alias handlers ────────────────────────────────────────────────────────────

  const confirmAlias = async () => {
    const alias = aliasInput.trim();
    if (!alias || !character) return;
    const newAliases = [...character.aliases, alias];
    try {
      await updateCharacter(charId, { aliases: newAliases });
      setCharacter((c) => (c ? { ...c, aliases: newAliases } : c));
      setAliasInput('');
      setAddingAlias(false);
    } catch {
      Alert.alert('Hata', 'Takma ad eklenemedi.');
    }
  };

  const cancelAlias = () => {
    setAliasInput('');
    setAddingAlias(false);
  };

  const deleteAlias = (idx: number) => {
    if (!character) return;
    Alert.alert(
      'Takma Adı Sil',
      `"${character.aliases[idx]}" silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const newAliases = character.aliases.filter((_, i) => i !== idx);
            try {
              await updateCharacter(charId, { aliases: newAliases });
              setCharacter((c) => (c ? { ...c, aliases: newAliases } : c));
            } catch {
              Alert.alert('Hata', 'Takma ad silinemedi.');
            }
          },
        },
      ]
    );
  };

  // ── Image handlers ────────────────────────────────────────────────────────────

  const handleAddImage = async () => {
    try {
      const result = await pickAndStoreImage(charId);
      if (!result) return;
      const updated = await getCharacterImages(charId);
      setImages(updated);
    } catch {
      Alert.alert('Hata', 'Görsel eklenemedi.');
    }
  };

  const handleDeleteImage = async (image: CharacterImage) => {
    try {
      await deleteImage(image);
      setImages((prev) => prev.filter((i) => i.id !== image.id));
    } catch {
      Alert.alert('Hata', 'Görsel silinemedi.');
    }
  };

  // ── Attribute handlers ────────────────────────────────────────────────────────

  const handleAddAttribute = async (key: string, value: string) => {
    await addCharacterAttribute({ characterId: charId, attrKey: key, attrValue: value });
    const updated = await getCharacterAttributes(charId);
    setAttributes(updated);
  };

  const handleUpdateAttribute = async (id: number, key: string, value: string) => {
    await updateCharacterAttribute(id, { attrKey: key, attrValue: value });
    setAttributes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, attrKey: key, attrValue: value } : a))
    );
  };

  const handleDeleteAttribute = async (id: number) => {
    try {
      await deleteCharacterAttribute(id);
      setAttributes((prev) => prev.filter((a) => a.id !== id));
    } catch {
      Alert.alert('Hata', 'Özellik silinemedi.');
    }
  };

  // ── Delete character ──────────────────────────────────────────────────────────

  const handleDeleteCharacter = () => {
    setMenuVisible(false);
    Alert.alert(
      'Karakteri Sil',
      `"${character?.name}" ve tüm görselleri + özellikleri silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCharacter(charId);
              router.back();
            } catch {
              Alert.alert('Hata', 'Karakter silinemedi.');
            }
          },
        },
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Karakter', headerBackTitle: 'Karakterler' }} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </>
    );
  }

  if (!character) return null;

  return (
    <>
      <Stack.Screen
        options={{
          title: character.name,
          headerBackTitle: 'Karakterler',
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

      <ScrollView style={s.root} contentContainerStyle={s.scroll}>
        {/* ── Name ── */}
        <View style={s.section}>
          {editingName ? (
            <View>
              <TextInput
                style={s.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={saveEditName}
              />
              <View style={s.editActions}>
                <TouchableOpacity onPress={cancelEditName} style={s.cancelBtn}>
                  <Text style={s.cancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveEditName}
                  style={[s.saveBtn, !nameInput.trim() && s.saveBtnDisabled]}
                  disabled={!nameInput.trim()}
                >
                  <Text style={s.saveText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={startEditName}
              activeOpacity={0.7}
              style={s.nameRow}
            >
              <Text style={s.nameText}>{character.name}</Text>
              <Text style={s.nameEditHint}>✏️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Images ── */}
        <View style={s.sectionNoPad}>
          <Text style={[s.sectionLabel, { paddingHorizontal: 16 }]}>GÖRSELLER</Text>
          <ImageGallery
            images={images}
            onAdd={handleAddImage}
            onPress={setFullscreenImage}
            onDelete={handleDeleteImage}
          />
        </View>

        {/* ── Aliases ── */}
        <AliasSection
          aliases={character.aliases}
          addingAlias={addingAlias}
          aliasInput={aliasInput}
          onStartAdd={() => setAddingAlias(true)}
          onChangeAlias={setAliasInput}
          onConfirmAlias={confirmAlias}
          onCancelAlias={cancelAlias}
          onDeleteAlias={deleteAlias}
        />

        {/* ── Description ── */}
        <DescriptionSection
          description={character.description}
          editing={editingDesc}
          descInput={descInput}
          onStartEdit={startEditDesc}
          onChangeDesc={setDescInput}
          onSave={saveEditDesc}
          onCancel={cancelEditDesc}
        />

        {/* ── Attributes ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ÖZELLİKLER</Text>
          <AttributeList
            attributes={attributes}
            onAdd={handleAddAttribute}
            onUpdate={handleUpdateAttribute}
            onDelete={handleDeleteAttribute}
          />
        </View>
      </ScrollView>

      <FullscreenImageModal
        image={fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />

      <MenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onDelete={handleDeleteCharacter}
      />
    </>
  );
}

// ─── Alias Section ────────────────────────────────────────────────────────────

function AliasSection({
  aliases,
  addingAlias,
  aliasInput,
  onStartAdd,
  onChangeAlias,
  onConfirmAlias,
  onCancelAlias,
  onDeleteAlias,
}: {
  aliases: string[];
  addingAlias: boolean;
  aliasInput: string;
  onStartAdd: () => void;
  onChangeAlias: (t: string) => void;
  onConfirmAlias: () => void;
  onCancelAlias: () => void;
  onDeleteAlias: (idx: number) => void;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>TAKMA İSİMLER</Text>
      <View style={s.chipWrap}>
        {aliases.map((alias, idx) => (
          <TouchableOpacity
            key={idx}
            style={s.chip}
            onLongPress={() => onDeleteAlias(idx)}
            activeOpacity={0.7}
          >
            <Text style={s.chipText}>{alias}</Text>
          </TouchableOpacity>
        ))}

        {addingAlias ? (
          <View style={s.aliasInputRow}>
            <TextInput
              style={s.aliasInput}
              value={aliasInput}
              onChangeText={onChangeAlias}
              placeholder="Yeni takma ad"
              placeholderTextColor={C.textMuted}
              autoFocus
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={onConfirmAlias}
            />
            <TouchableOpacity onPress={onConfirmAlias} hitSlop={8} style={s.aliasConfirm}>
              <Text style={s.aliasConfirmText}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancelAlias} hitSlop={8} style={s.aliasCancel}>
              <Text style={s.aliasCancelText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.chipAdd} onPress={onStartAdd} activeOpacity={0.7}>
            <Text style={s.chipAddText}>+ Takma ad</Text>
          </TouchableOpacity>
        )}
      </View>
      {aliases.length > 0 && (
        <Text style={s.aliasHint}>Silmek için uzun bas.</Text>
      )}
    </View>
  );
}

// ─── Description Section ──────────────────────────────────────────────────────

function DescriptionSection({
  description,
  editing,
  descInput,
  onStartEdit,
  onChangeDesc,
  onSave,
  onCancel,
}: {
  description: string | null;
  editing: boolean;
  descInput: string;
  onStartEdit: () => void;
  onChangeDesc: (t: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>AÇIKLAMA</Text>
        {!editing && (
          <TouchableOpacity onPress={onStartEdit} hitSlop={8}>
            <Text style={s.editHintBtn}>✏️ Düzenle</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing ? (
        <View>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={descInput}
            onChangeText={onChangeDesc}
            placeholder="Karakter açıklaması..."
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={4}
            autoFocus
          />
          <View style={s.editActions}>
            <TouchableOpacity onPress={onCancel} style={s.cancelBtn}>
              <Text style={s.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={s.saveBtn}>
              <Text style={s.saveText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={[s.descText, !description && s.descPlaceholder]}>
          {description ?? 'Açıklama ekle...'}
        </Text>
      )}
    </View>
  );
}

// ─── Menu Modal ───────────────────────────────────────────────────────────────

function MenuModal({
  visible,
  onClose,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={mn.overlay} activeOpacity={1} onPress={onClose}>
        <View style={mn.sheet}>
          <TouchableOpacity style={mn.deleteOption} onPress={onDelete} activeOpacity={0.7}>
            <Text style={mn.deleteIcon}>🗑</Text>
            <Text style={mn.deleteText}>Karakteri Sil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={mn.cancelOption} onPress={onClose} activeOpacity={0.7}>
            <Text style={mn.cancelText}>İptal</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },

  // ── Sections ──
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sectionNoPad: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  // ── Name ──
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  nameEditHint: {
    fontSize: 18,
  },
  nameInput: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },

  // ── Edit actions ──
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Aliases ──
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  chipText: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '600',
  },
  chipAdd: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipAddText: {
    fontSize: 13,
    color: C.textSec,
  },
  aliasInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 180,
  },
  aliasInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: C.text,
    fontSize: 13,
  },
  aliasConfirm: {
    backgroundColor: C.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aliasConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  aliasCancel: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  aliasCancelText: {
    color: C.textSec,
    fontSize: 14,
  },
  aliasHint: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 8,
  },

  // ── Description ──
  descText: {
    fontSize: 15,
    color: C.text,
    lineHeight: 24,
  },
  descPlaceholder: {
    color: C.textMuted,
    fontStyle: 'italic',
  },
  editHintBtn: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '600',
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
    marginBottom: 10,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

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
  deleteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    gap: 12,
  },
  deleteIcon: {
    fontSize: 20,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.danger,
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
