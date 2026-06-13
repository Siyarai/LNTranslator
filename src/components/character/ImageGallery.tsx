import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { getImageUri } from '../../services/characterImageStorage';
import type { CharacterImage } from '../../types/character';

const C = {
  surface: '#161B22',
  border: '#30363D',
  textSec: '#8B949E',
};

export default function ImageGallery({
  images,
  onAdd,
  onPress,
  onDelete,
}: {
  images: CharacterImage[];
  onAdd: () => void;
  onPress: (image: CharacterImage) => void;
  onDelete: (image: CharacterImage) => void;
}) {
  const handleLongPress = (image: CharacterImage) => {
    Alert.alert('Görseli Sil', 'Bu görseli silmek istiyor musun?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => onDelete(image) },
    ]);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={g.container}
    >
      {images.map((img) => (
        <TouchableOpacity
          key={img.id}
          onPress={() => onPress(img)}
          onLongPress={() => handleLongPress(img)}
          activeOpacity={0.8}
          style={g.tile}
        >
          <Image
            source={{ uri: getImageUri(img.filename) }}
            style={g.tileImage}
            contentFit="cover"
          />
        </TouchableOpacity>
      ))}

      <TouchableOpacity onPress={onAdd} style={[g.tile, g.addTile]} activeOpacity={0.7}>
        <Text style={g.addIcon}>+</Text>
        <Text style={g.addLabel}>Ekle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const g = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tile: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  addTile: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  addIcon: {
    fontSize: 28,
    color: C.textSec,
  },
  addLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
});
