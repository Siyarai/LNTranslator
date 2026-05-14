import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getAllNovels, deleteNovel } from '../src/db/database';
import type { Novel } from '../src/types/novel';

const COLORS = {
  background: '#0D1117',
  surface: '#161B22',
  card: '#1C2333',
  primary: '#7C3AED',
  text: '#E6EDF3',
  textSecondary: '#8B949E',
  border: '#30363D',
  accent: '#22D3EE',
};

export default function LibraryScreen() {
  const router = useRouter();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNovels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllNovels();
      setNovels(data);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load library.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadNovels();
    }, [loadNovels])
  );

  const handleDelete = (novel: Novel) => {
    Alert.alert(
      'Delete Novel',
      `Are you sure you want to delete "${novel.title}" and all its chapters?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNovel(novel.id);
              loadNovels();
            } catch {
              Alert.alert('Error', 'Failed to delete novel.');
            }
          },
        },
      ]
    );
  };

  const renderNovel = ({ item }: { item: Novel }) => {
    const total = item.chapterCount ?? 0;
    const downloaded = item.readCount ?? 0;
    const translated = item.translatedCount ?? 0;
    const hasLastRead = item.lastReadChapterId != null;

    return (
      <TouchableOpacity
        style={styles.novelCard}
        activeOpacity={0.7}
        onPress={() => router.push(`/novel/${item.id}`)}
        onLongPress={() => handleDelete(item)}
      >
        {/* Cover placeholder */}
        <View style={styles.coverContainer}>
          <Text style={styles.coverEmoji}>📕</Text>
        </View>

        {/* Info */}
        <View style={styles.novelInfo}>
          <Text style={styles.novelTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {/* Stats row */}
          <Text style={styles.novelMeta}>
            {total} chapters · {downloaded} downloaded · {translated} translated
          </Text>

          {/* Progress bar */}
          {total > 0 && (
            <View style={styles.progressRow}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(
                        (downloaded / total) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {downloaded}/{total}
              </Text>
            </View>
          )}

          {/* Last read chapter name */}
          {item.lastReadChapterName ? (
            <Text style={styles.lastReadText} numberOfLines={1}>
              📖 {item.lastReadChapterName}
            </Text>
          ) : null}

          {/* Continue button */}
          {hasLastRead && (
            <TouchableOpacity
              style={styles.continueButton}
              activeOpacity={0.7}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/reader/${item.id}/${item.lastReadChapterId}`);
              }}
            >
              <Text style={styles.continueButtonText}>▶ Continue</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : novels.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyTitle}>Library is Empty</Text>
            <Text style={styles.emptyText}>
              Import an LNReader backup from the home screen to get started.
            </Text>
            <TouchableOpacity
              style={styles.goBackButton}
              onPress={() => router.back()}
            >
              <Text style={styles.goBackText}>← Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={novels}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderNovel}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  listContent: {
    padding: 16,
  },
  separator: {
    height: 10,
  },
  novelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  coverContainer: {
    width: 50,
    height: 66,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  coverEmoji: {
    fontSize: 24,
  },
  novelInfo: {
    flex: 1,
  },
  novelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  novelMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  lastReadText: {
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 4,
  },
  continueButton: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  goBackButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  goBackText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 15,
  },
});

