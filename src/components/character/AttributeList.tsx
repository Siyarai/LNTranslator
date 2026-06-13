import { useState } from 'react';
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
import type { CharacterAttribute } from '../../types/character';

const C = {
  surface: '#161B22',
  card: '#1C2333',
  primary: '#7C3AED',
  text: '#E6EDF3',
  textSec: '#8B949E',
  textMuted: '#6B7280',
  border: '#30363D',
};

export default function AttributeList({
  attributes,
  onAdd,
  onUpdate,
  onDelete,
}: {
  attributes: CharacterAttribute[];
  onAdd: (key: string, value: string) => Promise<void>;
  onUpdate: (id: number, key: string, value: string) => Promise<void>;
  onDelete: (id: number) => void | Promise<void>;
}) {
  const [modal, setModal] = useState<{
    visible: boolean;
    item: CharacterAttribute | null;
    key: string;
    value: string;
    saving: boolean;
  }>({ visible: false, item: null, key: '', value: '', saving: false });

  const openAdd = () =>
    setModal({ visible: true, item: null, key: '', value: '', saving: false });

  const openEdit = (attr: CharacterAttribute) =>
    setModal({ visible: true, item: attr, key: attr.attrKey, value: attr.attrValue, saving: false });

  const closeModal = () =>
    setModal({ visible: false, item: null, key: '', value: '', saving: false });

  const handleSave = async () => {
    const k = modal.key.trim();
    const v = modal.value.trim();
    if (!k || !v) {
      Alert.alert('Eksik Alan', 'Anahtar ve değer boş olamaz.');
      return;
    }
    setModal((m) => ({ ...m, saving: true }));
    try {
      if (modal.item) {
        await onUpdate(modal.item.id, k, v);
      } else {
        await onAdd(k, v);
      }
      closeModal();
    } catch {
      Alert.alert('Hata', 'Özellik kaydedilemedi.');
      setModal((m) => ({ ...m, saving: false }));
    }
  };

  const handleLongPress = (attr: CharacterAttribute) => {
    Alert.alert('Özelliği Sil', `"${attr.attrKey}" silinecek. Emin misin?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => onDelete(attr.id) },
    ]);
  };

  return (
    <View>
      {attributes.map((attr) => (
        <TouchableOpacity
          key={attr.id}
          style={a.row}
          onPress={() => openEdit(attr)}
          onLongPress={() => handleLongPress(attr)}
          activeOpacity={0.7}
        >
          <Text style={a.attrKey} numberOfLines={1}>{attr.attrKey}</Text>
          <Text style={a.attrValue} numberOfLines={3}>{attr.attrValue}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={a.addBtn} onPress={openAdd} activeOpacity={0.7}>
        <Text style={a.addBtnText}>+ Özellik Ekle</Text>
      </TouchableOpacity>

      <Modal
        visible={modal.visible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={am.overlay}>
          <View style={am.sheet}>
            <View style={am.header}>
              <TouchableOpacity onPress={closeModal} style={am.cancelBtn} disabled={modal.saving}>
                <Text style={am.cancelText}>İptal</Text>
              </TouchableOpacity>
              <Text style={am.title}>
                {modal.item ? 'Özelliği Düzenle' : 'Yeni Özellik'}
              </Text>
              <TouchableOpacity
                onPress={handleSave}
                style={am.saveBtn}
                disabled={modal.saving}
                activeOpacity={0.7}
              >
                {modal.saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={am.saveText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView
              style={am.body}
              contentContainerStyle={am.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={am.label}>Anahtar</Text>
              <TextInput
                style={am.input}
                value={modal.key}
                onChangeText={(t) => setModal((m) => ({ ...m, key: t }))}
                placeholder="örn. Irk, Seviye, Yetenek"
                placeholderTextColor={C.textMuted}
                autoCorrect={false}
                editable={!modal.saving}
              />

              <Text style={[am.label, { marginTop: 16 }]}>Değer</Text>
              <TextInput
                style={am.input}
                value={modal.value}
                onChangeText={(t) => setModal((m) => ({ ...m, value: t }))}
                placeholder="örn. Slime, 100, Sonsuz Yenilenir"
                placeholderTextColor={C.textMuted}
                autoCorrect={false}
                editable={!modal.saving}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const a = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
    gap: 12,
    alignItems: 'flex-start',
  },
  attrKey: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
    width: 100,
    flexShrink: 0,
  },
  attrValue: {
    fontSize: 14,
    color: C.text,
    flex: 1,
    lineHeight: 20,
  },
  addBtn: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '600',
  },
});

const am = StyleSheet.create({
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
    minWidth: 48,
    paddingVertical: 4,
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
});
