import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { clearDatabase, deleteNovel, getAllNovels } from '../src/db/database';
import { importBackup } from '../src/services/backupService';
import ReaderSettingsPanel from '../src/components/ReaderSettingsPanel';
import type { Novel } from '../src/types/novel';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117',
  surface: '#161B22',
  card: '#1C2333',
  primary: '#7C3AED',
  primaryDark: '#6D28D9',
  accent: '#22D3EE',
  text: '#E6EDF3',
  textSec: '#8B949E',
  textMuted: '#6B7280',
  border: '#30363D',
  danger: '#EF4444',
  dangerDim: '#7F1D1D',
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();

  // Library
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'library' | 'local'>('library');

  // Import
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');

  // Settings
  const [settingsVisible, setSettingsVisible] = useState(false);

  // ── Load novels on focus ────────────────────────────────────────────────────

  const loadNovels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllNovels();
      setNovels(data);
    } catch {
      Alert.alert('Hata', 'Kitaplık yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNovels();
    }, [loadNovels])
  );

  // ── Filtered novels ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return novels;
    const q = search.toLowerCase();
    return novels.filter((n) => n.title.toLowerCase().includes(q));
  }, [novels, search]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
    setProgress('');
    try {
      const count = await importBackup((msg) => setProgress(msg));
      Alert.alert('Başarılı', `${count} novel içe aktarıldı!`);
      loadNovels();
    } catch (err: any) {
      if (err.message === 'FILE_PICKER_CANCELLED') {
        // cancelled
      } else if (err.message === 'INVALID_ZIP') {
        Alert.alert('Geçersiz Dosya', 'Seçilen dosya geçerli bir zip arşivi değil.');
      } else if (err.message === 'NO_NOVELS_FOUND') {
        Alert.alert('Novel Bulunamadı', 'Bu yedek dosyasında novel verisi bulunamadı.');
      } else {
        Alert.alert('İçe Aktarma Hatası', err.message || 'Beklenmeyen bir hata oluştu.');
      }
    } finally {
      setImporting(false);
      setProgress('');
    }
  };

  const handleContinue = () => {
    const candidates = novels.filter(
      (n) => n.lastReadChapterId != null && n.lastReadAt != null
    );
    if (candidates.length === 0) {
      // Fallback: try any novel with lastReadChapterId even without timestamp
      const fallback = novels.find((n) => n.lastReadChapterId != null);
      if (fallback) {
        router.push(`/reader/${fallback.id}/${fallback.lastReadChapterId}`);
        return;
      }
      Alert.alert('Devam', 'Henüz devam edilecek bölüm yok.');
      return;
    }
    // Pick the most recently read novel
    candidates.sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''));
    const novel = candidates[0];
    router.push(`/reader/${novel.id}/${novel.lastReadChapterId}`);
  };

  const handleDeleteNovel = (novel: Novel) => {
    Alert.alert(
      'Novel Sil',
      `"${novel.title}" ve tüm bölümleri silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNovel(novel.id);
              loadNovels();
            } catch {
              Alert.alert('Hata', 'Novel silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleClearDatabase = () => {
    Alert.alert(
      '⚠️ Tüm Verileri Sil',
      'Tüm içe aktarılmış noveller, bölümler ve çeviri önbellekleri kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Her Şeyi Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearDatabase();
              setNovels([]);
              Alert.alert('Tamam', 'Tüm veriler silindi.');
            } catch {
              Alert.alert('Hata', 'Veritabanı temizlenemedi.');
            }
          },
        },
      ]
    );
  };

  // ── Novel card ──────────────────────────────────────────────────────────────

  const renderNovel = ({ item }: { item: Novel }) => {
    const total = item.chapterCount ?? 0;
    const downloaded = item.readCount ?? 0;
    const translated = item.translatedCount ?? 0;
    const hasLastRead = item.lastReadChapterId != null;

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/novel/${item.id}`)}
        onLongPress={() => handleDeleteNovel(item)}
      >
        {/* Cover */}
        <View style={s.cardCover}>
          <Text style={s.cardCoverEmoji}>📕</Text>
        </View>

        {/* Info */}
        <View style={s.cardBody}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>

          <Text style={s.cardMeta}>
            {total} bölüm · {downloaded} indirildi · {translated} çevrildi
          </Text>

          {/* Progress */}
          {total > 0 && (
            <View style={s.cardProgressRow}>
              <View style={s.cardProgressBg}>
                <View
                  style={[
                    s.cardProgressFill,
                    { width: `${Math.min((downloaded / total) * 100, 100)}%` },
                  ]}
                />
              </View>
              <Text style={s.cardProgressText}>
                {downloaded}/{total}
              </Text>
            </View>
          )}

          {/* Last read */}
          {item.lastReadChapterName ? (
            <Text style={s.cardLastRead} numberOfLines={1}>
              📖 {item.lastReadChapterName}
            </Text>
          ) : null}

          {/* Continue */}
          {hasLastRead && (
            <TouchableOpacity
              style={s.cardContinue}
              activeOpacity={0.7}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/reader/${item.id}/${item.lastReadChapterId}`);
              }}
            >
              <Text style={s.cardContinueText}>▶ Devam Et</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={s.root}>
        {/* ── Top area ── */}
        <View style={s.topBar}>
          {/* Search */}
          <View style={s.searchRow}>
            <View style={s.searchBox}>
              <Text style={s.searchIcon}>🔍</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Kitaplıkta ara…"
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Tabs */}
          <View style={s.tabRow}>
            <TouchableOpacity
              style={[s.tab, activeTab === 'library' && s.tabActive]}
              onPress={() => setActiveTab('library')}
            >
              <Text
                style={[s.tabText, activeTab === 'library' && s.tabTextActive]}
              >
                Kitaplık
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, activeTab === 'local' && s.tabActive]}
              onPress={() => setActiveTab('local')}
            >
              <Text
                style={[s.tabText, activeTab === 'local' && s.tabTextActive]}
              >
                Yerel
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Import progress overlay ── */}
        {importing && (
          <View style={s.importBar}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={s.importBarText}>{progress || 'İçe aktarılıyor…'}</Text>
          </View>
        )}

        {/* ── Content ── */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.center}>
            <Text style={s.emptyIcon}>📚</Text>
            <Text style={s.emptyTitle}>
              {search
                ? 'Sonuç bulunamadı'
                : 'Kitaplığın boş'}
            </Text>
            <Text style={s.emptyDesc}>
              {search
                ? 'Arama terimini değiştirmeyi dene.'
                : 'LNReader backup dosyası içe aktarabilirsin.'}
            </Text>
            {!search && (
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={handleImport}
                disabled={importing}
                activeOpacity={0.7}
              >
                <Text style={s.emptyBtnText}>📁 Backup İçe Aktar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderNovel}
            contentContainerStyle={s.list}
            ItemSeparatorComponent={() => <View style={s.sep} />}
          />
        )}

        {/* ── Bottom nav ── */}
        <View style={s.bottomNav}>
          <NavItem
            icon="📚"
            label="Kitaplık"
            active
            onPress={() => {
              setSearch('');
              setActiveTab('library');
            }}
          />
          <NavItem
            icon="📁"
            label="İçe Aktar"
            onPress={handleImport}
            disabled={importing}
          />
          <NavItem icon="▶" label="Devam" onPress={handleContinue} />
          <NavItem
            icon="⋯"
            label="Daha Fazla"
            onPress={() => setSettingsVisible(true)}
          />
        </View>
      </View>

      {/* ── Settings Modal ── */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onClearDatabase={handleClearDatabase}
      />
    </>
  );
}

// ─── Bottom Nav Item ──────────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={s.navItem}
      onPress={onPress}
      activeOpacity={0.6}
      disabled={disabled}
    >
      <Text style={[s.navIcon, active && s.navIconActive]}>{icon}</Text>
      <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({
  visible,
  onClose,
  onClearDatabase,
}: {
  visible: boolean;
  onClose: () => void;
  onClearDatabase: () => void;
}) {
  const [readerOpen, setReaderOpen] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={m.overlay}>
        <View style={m.sheet}>
          {/* Header */}
          <View style={m.header}>
            <Text style={m.headerTitle}>Daha Fazla</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Text style={m.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={m.body}
            contentContainerStyle={m.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Reader Settings ── */}
            <View style={m.section}>
              <Text style={m.sectionTitle}>Okuyucu</Text>
              <TouchableOpacity
                style={m.settingsRow}
                onPress={() => setReaderOpen(!readerOpen)}
                activeOpacity={0.7}
              >
                <Text style={m.settingsRowIcon}>📖</Text>
                <View style={m.settingsRowInfo}>
                  <Text style={m.settingsRowLabel}>Okuma Ayarları</Text>
                  <Text style={m.settingsRowDesc}>
                    Yazı tipi, tema, boyut ve düzen
                  </Text>
                </View>
                <Text style={m.settingsRowChevron}>
                  {readerOpen ? '▾' : '›'}
                </Text>
              </TouchableOpacity>

              {readerOpen && (
                <View style={m.readerPanel}>
                  <ReaderSettingsPanel />
                </View>
              )}
            </View>

            {/* ── Data ── */}
            <View style={m.section}>
              <Text style={m.sectionTitle}>Veri</Text>
              <TouchableOpacity
                style={m.dangerBtn}
                onPress={onClearDatabase}
                activeOpacity={0.7}
              >
                <Text style={m.dangerIcon}>🗑️</Text>
                <View style={m.dangerInfo}>
                  <Text style={m.dangerLabel}>Tüm Verileri Sil</Text>
                  <Text style={m.dangerDesc}>
                    Novelleri, bölümleri ve çevirileri siler
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* ── About ── */}
            <View style={m.section}>
              <Text style={m.sectionTitle}>Hakkında</Text>
              <View style={m.aboutCard}>
                <Text style={m.aboutName}>LN Translator</Text>
                <Text style={m.aboutDesc}>
                  LNReader yedekleri için Türkçe çeviri okuyucu
                </Text>
              </View>
            </View>

            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Top bar ──
  topBar: {
    backgroundColor: C.surface,
    paddingTop: 54, // status bar clearance
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: 10,
  },

  // ── Tabs ──
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSec,
  },
  tabTextActive: {
    color: C.text,
  },

  // ── Import bar ──
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

  // ── Content ──
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyBtn: {
    backgroundColor: C.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    padding: 14,
  },
  sep: {
    height: 10,
  },

  // ── Novel card ──
  card: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardCover: {
    width: 52,
    height: 70,
    borderRadius: 8,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardCoverEmoji: {
    fontSize: 24,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    marginBottom: 3,
  },
  cardMeta: {
    fontSize: 12,
    color: C.textSec,
    marginBottom: 6,
  },
  cardProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardProgressBg: {
    flex: 1,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  cardProgressFill: {
    height: '100%',
    backgroundColor: C.primary,
    borderRadius: 2,
  },
  cardProgressText: {
    fontSize: 11,
    color: C.textSec,
  },
  cardLastRead: {
    fontSize: 12,
    color: C.accent,
    marginTop: 4,
  },
  cardContinue: {
    marginTop: 8,
    backgroundColor: C.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  cardContinueText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Bottom nav ──
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingBottom: 22, // home indicator clearance
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navIcon: {
    fontSize: 20,
  },
  navIconActive: {
    // no visual difference for emoji, label handles it
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
  },
  navLabelActive: {
    color: C.primary,
  },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────

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
    maxHeight: '85%',
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: C.textSec,
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // ── Settings row (expandable) ──
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  settingsRowIcon: {
    fontSize: 20,
  },
  settingsRowInfo: {
    flex: 1,
  },
  settingsRowLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingsRowDesc: {
    color: C.textSec,
    fontSize: 12,
    lineHeight: 16,
  },
  settingsRowChevron: {
    color: C.textSec,
    fontSize: 20,
    fontWeight: '600',
  },
  readerPanel: {
    marginTop: 12,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },

  // ── Danger ──
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.dangerDim,
    gap: 12,
  },
  dangerIcon: {
    fontSize: 20,
  },
  dangerInfo: {
    flex: 1,
  },
  dangerLabel: {
    color: C.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  dangerDesc: {
    color: C.textSec,
    fontSize: 12,
    lineHeight: 16,
  },

  // ── About ──
  aboutCard: {
    backgroundColor: C.surface,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    gap: 4,
  },
  aboutName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  aboutDesc: {
    color: C.textSec,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
