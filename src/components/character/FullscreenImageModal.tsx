import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { getImageUri } from '../../services/characterImageStorage';
import type { CharacterImage } from '../../types/character';

const { width, height } = Dimensions.get('window');

export default function FullscreenImageModal({
  image,
  onClose,
}: {
  image: CharacterImage | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={image !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={12}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
        {image && (
          <Image
            source={{ uri: getImageUri(image.filename) }}
            style={s.image}
            contentFit="contain"
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  image: {
    width,
    height: height * 0.8,
  },
});
