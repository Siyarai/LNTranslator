import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getChaptersByNovelId, getNovelById } from '../../src/db/database';
import type { Chapter, Novel } from '../../src/types/novel';

const COLORS = {
  background: '#0D1117',
  surface: '#161B22',
  card: '#1C2333',
  primary: '#7C3AED',
  text: '#E6EDF3',
  textSecondary: '#8B949E',
  border: '#30363D',
  green: '#22C55E',
  blue: '#3B82F6',
};

export default function NovelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const novelId = parseInt(id, 10);
      if (isNaN(novelId)) {
        Alert.alert('Error', 'Invalid novel ID.');
        return;
      }

      const [n, chs] = await Promise.all([
        getNovelById(novelId),
        getChaptersByNovelId(novelId),
      ]);

      if (!n) {
        Alert.alert('Error', 'Novel not found.');
        router.back();
        return;
      }

      setNovel(n);
      setChapters(chs);
    } catch {
      Alert.alert('Error', 'Failed to load novel details.');
    } finally {
      setLoading(false);
    }
  };

  const filteredChapters = useMemo(() => {
    if (!search.trim()) return chapters;
    const query = search.toLowerCase();
    return chapters.filter((ch) => ch.name.toLowerCase().includes(query));
  }, [chapters, search]);

  const downloadedCount = chapters.filter((ch) => ch.isDownloaded).length;
  const translatedCount = chapters.filter((ch) => ch.isTranslated).length;

  const renderChapter = ({ item }: { item: Chapter }) => (
    <TouchableOpacity
      style={styles.chapterRow}
      activeOpacity={0.7}
      onPress={() =>
        router.push(`/reader/${novel!.id}/${item.id}`)
      }
    >
      <View style={styles.chapterInfo}>
        <Text style={styles.chapterName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.badgeRow}>
          {item.isDownloaded ? (
            <View style={[styles.badge, styles.downloadedBadge]}>
              <Text style={styles.badgeText}>✓ Content</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.metadataBadge]}>
              <Text style={styles.badgeText}>Metadata only</Text>
            </View>
          )}
          {item.isTranslated && (
            <View style={[styles.badge, styles.translatedBadge]}>
              <Text style={styles.badgeText}>🌐 TR</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: novel?.title || 'Novel',
          headerBackTitle: 'Library',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 }}>
              <TouchableOpacity
                onPress={() => router.push(`/characters/${id}` as any)}
                activeOpacity={0.7}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 20 }}>👥</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push(`/glossary/${id}` as any)}
                activeOpacity={0.7}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 20 }}>📝</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        {/* Stats bar */}
        <View style={styles.statsBar}>
          <Text style={styles.statText}>
            {chapters.length} chapters
          </Text>
          <Text style={styles.statDivider}>•</Text>
          <Text style={styles.statText}>
            {downloadedCount} downloaded
          </Text>
          <Text style={styles.statDivider}>•</Text>
          <Text style={styles.statText}>
            {translatedCount} translated
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search chapters..."
            placeholderTextColor={COLORS.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        {/* Chapter List */}
        <FlatList
          data={filteredChapters}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderChapter}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {search ? 'No chapters match your search.' : 'No chapters found.'}
              </Text>
            </View>
          }
        />
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
    padding: 32,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statDivider: {
    color: COLORS.border,
    fontSize: 13,
  },
  searchContainer: {
    padding: 12,
    paddingBottom: 6,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    padding: 12,
    paddingTop: 6,
  },
  separator: {
    height: 6,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chapterInfo: {
    flex: 1,
  },
  chapterName: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  downloadedBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  translatedBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  metadataBadge: {
    backgroundColor: 'rgba(139, 148, 158, 0.15)',
  },
  badgeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 20,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
