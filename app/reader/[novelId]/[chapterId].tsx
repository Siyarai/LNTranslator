import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  type NativeScrollEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clearChapterTranslation,
  getChapterById,
  getChaptersByNovelId,
  getNovelById,
  updateLastReadChapter,
} from '../../../src/db/database';
import { getChapterContent } from '../../../src/services/chapterService';
import {
  enqueue as enqueueForPrefetch,
  getStatus as getQueueStatus,
  isInFlight,
  isPending,
  promote,
  subscribe as subscribeToQueue,
} from '../../../src/services/prefetchQueue';
import type { QueueItem } from '../../../src/services/prefetchQueue';
import { forceTranslateChapter, translateChapter } from '../../../src/services/translationService';
import type { Chapter, Novel } from '../../../src/types/novel';
import {
  type ChapterReaderState,
  loadReaderState,
  saveReaderState,
} from '../../../src/utils/readerState';
import {
  type FontFamily,
  type ReaderSettings,
  type ThemeName,
  DEFAULT_SETTINGS,
  THEME_PALETTES,
  loadReaderSettings,
  resolveFontFamily,
  saveReaderSettings,
} from '../../../src/utils/readerSettings';
import { buildChapterSourceUrl } from '../../../src/utils/sourceUrl';

const COLORS = {
  background: '#1A1A2E',
  surface: '#16213E',
  card: '#1C2333',
  primary: '#7C3AED',
  primaryDim: '#6D28D9',
  accent: '#3B82F6',
  text: '#D4D4D8',
  textSecondary: '#8B949E',
  textMuted: '#6B7280',
  border: '#30363D',
  warn: '#F59E0B',
};

export default function ReaderScreen() {
  const { novelId, chapterId } = useLocalSearchParams<{
    novelId: string;
    chapterId: string;
  }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const touchStartY = useRef<number | null>(null);

  // Scroll position tracking
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRestorePercent = useRef<number | null>(null);
  const readerState = useRef<ChapterReaderState>({
    lastLanguage: 'original',
    originalProgress: 0,
    translatedProgress: 0,
  });
  const layoutHeight = useRef(0);
  const contentHeight = useRef(0);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState('');
  const [loading, setLoading] = useState(true);
  const [openingUrl, setOpeningUrl] = useState(false);

  // Reader settings
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);

  // For prev/next navigation
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Prefetch queue
  const translateWaitUnsub = useRef<(() => void) | null>(null);
  const [prefetchActive, setPrefetchActive] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Load persisted settings once
  useEffect(() => {
    loadReaderSettings().then(setSettings);
  }, []);

  const updateSetting = useCallback(
    <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveReaderSettings(next);
        return next;
      });
    },
    []
  );

  // Derived theme colors
  const themeColors = THEME_PALETTES[settings.theme];

  useEffect(() => {
    loadChapter();
  }, [chapterId]);

  const loadChapter = async () => {
    // Clear any pending queue subscription from previous chapter
    translateWaitUnsub.current?.();
    translateWaitUnsub.current = null;

    try {
      setLoading(true);
      setTranslatedContent(null);
      setTranslationProgress('');

      const nId = parseInt(novelId, 10);
      const cId = parseInt(chapterId, 10);

      if (isNaN(nId) || isNaN(cId)) {
        Alert.alert('Error', 'Invalid chapter.');
        return;
      }

      // Load novel metadata + chapter content in parallel
      const [novelData, { chapter: ch, content: text }] = await Promise.all([
        getNovelById(nId),
        getChapterContent(cId),
      ]);

      setNovel(novelData);
      setChapter(ch);
      setContent(text);

      // Load cached translation if exists
      if (ch.translatedText) {
        setTranslatedContent(ch.translatedText);
      }

      // Bookmark this chapter as last read
      await updateLastReadChapter(nId, cId);

      // Load chapter list for prev/next navigation
      const chapters = await getChaptersByNovelId(nId);
      setAllChapters(chapters);
      const idx = chapters.findIndex((c) => c.id === cId);
      setCurrentIndex(idx);

      // Read fresh settings from storage — avoids using stale state if
      // AsyncStorage hasn't resolved yet when loadChapter first runs.
      const freshSettings = await loadReaderSettings();
      if (freshSettings.autoPrefetchEnabled && idx >= 0) {
        const prefetchItems: QueueItem[] = [];
        for (let i = 1; i <= freshSettings.prefetchCount; i++) {
          const ti = idx + i;
          if (ti >= chapters.length) break;
          const t = chapters[ti];
          if (t.originalText && !t.isTranslated) {
            prefetchItems.push({
              chapterId: t.id,
              novelId: nId,
              chapterIndex: ti,
              text: t.originalText,
              priority: 'normal',
            });
          }
        }
        if (prefetchItems.length > 0) enqueueForPrefetch(prefetchItems, nId, idx);
      }

      // Load persisted reader state (language + progress)
      const state = await loadReaderState(cId);
      readerState.current = state;

      // Restore language — if translated was last used but no translation exists, fallback
      const wantTranslated = state.lastLanguage === 'translated' && !!ch.translatedText;
      setShowTranslation(wantTranslated);

      // Pick the right progress to restore
      const pct = wantTranslated ? state.translatedProgress : state.originalProgress;
      contentHeight.current = 0;
      if (pct > 1) {
        pendingRestorePercent.current = pct;
      } else {
        pendingRestorePercent.current = null;
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    } catch (err: any) {
      if (err.message === 'CHAPTER_NOT_FOUND') {
        Alert.alert('Error', 'Chapter not found in database.');
      } else {
        Alert.alert('Error', 'Failed to load chapter.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!content) {
      Alert.alert('Error', 'No chapter content to translate.');
      return;
    }

    // If cached translation exists, just toggle
    if (translatedContent) {
      const next = !showTranslation;
      setShowTranslation(next);
      readerState.current.lastLanguage = next ? 'translated' : 'original';
      const cId = parseInt(chapterId, 10);
      if (!isNaN(cId)) saveReaderState(cId, readerState.current);
      const pct = next
        ? (readerState.current.translatedProgress || readerState.current.originalProgress)
        : (readerState.current.originalProgress || readerState.current.translatedProgress);
      if (pct > 1) {
        pendingRestorePercent.current = pct;
      } else {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      return;
    }

    const cId = parseInt(chapterId, 10);
    if (isNaN(cId)) return;

    // Queue path: chapter is in-flight or pending in prefetch queue
    if (isInFlight(cId) || isPending(cId)) {
      if (isPending(cId)) promote(cId);

      setTranslating(true);
      setTranslationProgress('Çevriliyor…');

      translateWaitUnsub.current?.();
      translateWaitUnsub.current = subscribeToQueue((event) => {
        if (event.type === 'progress' && event.chapterId === cId) {
          setTranslationProgress(`Translating ${event.current}/${event.total}`);
        } else if (event.type === 'done' && event.chapterId === cId) {
          translateWaitUnsub.current?.();
          translateWaitUnsub.current = null;
          getChapterById(cId)
            .then((ch) => {
              if (ch?.translatedText) {
                setTranslatedContent(ch.translatedText);
                setShowTranslation(true);
                readerState.current.lastLanguage = 'translated';
                saveReaderState(cId, readerState.current);
                scrollRef.current?.scrollTo({ y: 0, animated: true });
              }
            })
            .catch(() => {})
            .finally(() => {
              setTranslating(false);
              setTranslationProgress('');
            });
        } else if (event.type === 'error' && event.chapterId === cId) {
          translateWaitUnsub.current?.();
          translateWaitUnsub.current = null;
          Alert.alert('Translation Error', event.message || 'Translation failed.');
          setTranslating(false);
          setTranslationProgress('');
        }
      });
      return;
    }

    // Direct path: not in queue, translate immediately
    try {
      setTranslating(true);
      const result = await translateChapter(cId, content, (current, total) => {
        setTranslationProgress(`Translating ${current}/${total}`);
      });
      setTranslatedContent(result);
      setShowTranslation(true);
      readerState.current.lastLanguage = 'translated';
      saveReaderState(cId, readerState.current);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (err: any) {
      Alert.alert(
        'Translation Error',
        err.message || 'Translation failed. Please try again.'
      );
    } finally {
      setTranslating(false);
      setTranslationProgress('');
    }
  };

  const handleRetranslate = async () => {
    if (!content) return;
    try {
      setTranslating(true);
      const result = await forceTranslateChapter(
        parseInt(chapterId, 10),
        content,
        (current, total) => {
          setTranslationProgress(`Retranslating ${current}/${total}`);
        }
      );
      setTranslatedContent(result);
      setShowTranslation(true);
      readerState.current.lastLanguage = 'translated';
      readerState.current.translatedProgress = 0;
      const rtCid = parseInt(chapterId, 10);
      if (!isNaN(rtCid)) saveReaderState(rtCid, readerState.current);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (err: any) {
      Alert.alert(
        'Translation Error',
        err.message || 'Retranslation failed. Please try again.'
      );
    } finally {
      setTranslating(false);
      setTranslationProgress('');
    }
  };

  const handleDeleteTranslation = () => {
    Alert.alert(
      'Delete Translation',
      'Are you sure you want to delete the cached translation for this chapter?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearChapterTranslation(parseInt(chapterId, 10));
              setTranslatedContent(null);
              setShowTranslation(false);
              // Clear translated progress, save
              readerState.current.translatedProgress = 0;
              readerState.current.lastLanguage = 'original';
              const cId = parseInt(chapterId, 10);
              if (!isNaN(cId)) saveReaderState(cId, readerState.current);
            } catch {
              Alert.alert('Error', 'Failed to delete translation.');
            }
          },
        },
      ]
    );
  };

  const handleOpenSource = async (url: string) => {
    try {
      setOpeningUrl(true);
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Cannot Open URL', `Unable to open:\n${url}`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Failed to open the source URL.');
    } finally {
      setOpeningUrl(false);
    }
  };

  const navigateChapter = (direction: 'prev' | 'next') => {
    const newIndex =
      direction === 'prev' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= allChapters.length) return;

    const target = allChapters[newIndex];
    router.replace(`/reader/${novelId}/${target.id}`);
  };

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allChapters.length - 1;

  // ── Scroll progress save (debounced) ────────────────────────────────────────

  const handleScroll = useCallback(
    (e: { nativeEvent: NativeScrollEvent }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const maxY = contentSize.height - layoutMeasurement.height;
      if (maxY <= 0) return;
      const pct = Math.round((contentOffset.y / maxY) * 100);

      if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
      scrollSaveTimer.current = setTimeout(() => {
        const cId = parseInt(chapterId, 10);
        if (isNaN(cId)) return;
        if (showTranslation) {
          readerState.current.translatedProgress = pct;
        } else {
          readerState.current.originalProgress = pct;
        }
        saveReaderState(cId, readerState.current);
      }, 1500);
    },
    [chapterId, showTranslation]
  );

  const attemptScrollRestore = useCallback(() => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current);

    restoreTimer.current = setTimeout(() => {
      const pct = pendingRestorePercent.current;
      if (pct == null || pct <= 1) return;
      if (layoutHeight.current <= 0 || contentHeight.current <= 0) return;

      const maxY = contentHeight.current - layoutHeight.current;
      if (maxY > 0) {
        pendingRestorePercent.current = null;
        const y = (pct / 100) * maxY;
        scrollRef.current?.scrollTo({ y, animated: false });
      }
    }, 150);
  }, []);

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      contentHeight.current = h;
      attemptScrollRestore();
    },
    [attemptScrollRestore]
  );

  // Trigger restore when language toggles (content size may not change enough)
  useEffect(() => {
    if (!loading) {
      attemptScrollRestore();
    }
  }, [showTranslation, loading, attemptScrollRestore]);

  // Queue status subscription — tracks prefetch activity and quota events
  useEffect(() => {
    const unsub = subscribeToQueue((event) => {
      if (event.type === 'quota_exceeded') {
        setQuotaExceeded(true);
      }
      if (event.type === 'done') {
        // Successful translation means quota is working — clear any stale banner
        setQuotaExceeded(false);
      }
      if (
        event.type === 'progress' ||
        event.type === 'done' ||
        event.type === 'pause' ||
        event.type === 'resume' ||
        event.type === 'error'
      ) {
        const status = getQueueStatus();
        setPrefetchActive(status.current !== null && !status.paused);
      }
    });
    return unsub;
  }, []);

  // Cleanup timers and queue subscriptions on unmount
  useEffect(() => {
    return () => {
      if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      translateWaitUnsub.current?.();
      translateWaitUnsub.current = null;
    };
  }, []);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </>
    );
  }

  // Build source URL if possible (used in no-content UI and bottom bar)
  const sourceUrl =
    novel && chapter ? buildChapterSourceUrl(novel, chapter) : null;

  const displayText = showTranslation ? translatedContent : content;

  // Dynamic text styles based on settings
  const readerTextStyle = {
    fontSize: settings.fontSize,
    lineHeight: Math.round(settings.fontSize * settings.lineHeightMultiplier),
    fontFamily: resolveFontFamily(settings.fontFamily),
    color: themeColors.text,
    letterSpacing: 0.2,
  };

  const readerTitleStyle = {
    fontSize: settings.fontSize + 4,
    fontWeight: '700' as const,
    lineHeight: Math.round((settings.fontSize + 4) * 1.4),
    fontFamily: resolveFontFamily(settings.fontFamily),
    color: themeColors.text,
    marginBottom: 20,
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: chapter?.name || 'Reader',
          headerBackTitle: 'Chapters',
          headerShown: uiVisible && !settings.fullScreen,
          headerStyle: { backgroundColor: themeColors.surface },
          headerTintColor: themeColors.text,
        }}
      />
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Fullscreen exit tap zone */}
        {uiVisible && settings.fullScreen && (
          <TouchableOpacity
            style={[styles.fullScreenExit, { backgroundColor: themeColors.surface }]}
            onPress={() => updateSetting('fullScreen', false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.fullScreenExitText, { color: themeColors.textSecondary }]}>
              ▼ Exit Full Screen
            </Text>
          </TouchableOpacity>
        )}

        {/* Language toggle bar — only when content is available */}
        {uiVisible && translatedContent && (
          <View style={[styles.toggleBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                !showTranslation && styles.toggleActive,
              ]}
              onPress={() => {
                setShowTranslation(false);
                // Save language preference
                readerState.current.lastLanguage = 'original';
                const cId = parseInt(chapterId, 10);
                if (!isNaN(cId)) saveReaderState(cId, readerState.current);
                // Restore original progress
                const pct = readerState.current.originalProgress || readerState.current.translatedProgress;
                if (pct > 1) {
                  pendingRestorePercent.current = pct;
                } else {
                  scrollRef.current?.scrollTo({ y: 0, animated: false });
                }
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: themeColors.textSecondary },
                  !showTranslation && styles.toggleTextActive,
                ]}
              >
                Original
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                showTranslation && styles.toggleActive,
              ]}
              onPress={() => {
                setShowTranslation(true);
                // Save language preference
                readerState.current.lastLanguage = 'translated';
                const cId = parseInt(chapterId, 10);
                if (!isNaN(cId)) saveReaderState(cId, readerState.current);
                // Restore translated progress, fallback to original
                const pct = readerState.current.translatedProgress || readerState.current.originalProgress;
                if (pct > 1) {
                  pendingRestorePercent.current = pct;
                } else {
                  scrollRef.current?.scrollTo({ y: 0, animated: false });
                }
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: themeColors.textSecondary },
                  showTranslation && styles.toggleTextActive,
                ]}
              >
                Türkçe
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Translation progress bar */}
        {translating && (
          <View style={[styles.translatingBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={[styles.translatingBarText, { color: themeColors.textSecondary }]}>
              {translationProgress || 'Translating...'}
            </Text>
          </View>
        )}

        {/* Prefetch indicator — shown when queue is translating a next chapter */}
        {uiVisible && prefetchActive && !translating && (
          <View style={[styles.prefetchBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={[styles.prefetchBarText, { color: themeColors.textSecondary }]}>
              Sonraki bölüm hazırlanıyor…
            </Text>
          </View>
        )}

        {/* Quota exceeded banner — dismissible, sticky */}
        {quotaExceeded && (
          <View style={styles.quotaBanner}>
            <Text style={styles.quotaBannerText}>
              ⚠ DeepL kotası doldu. Otomatik çeviri duraklatıldı.
            </Text>
            <TouchableOpacity onPress={() => setQuotaExceeded(false)} hitSlop={8}>
              <Text style={styles.quotaBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content — tap to toggle UI, scroll to read */}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: settings.horizontalPadding },
          ]}
          scrollEventThrottle={250}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          onLayout={(e) => {
            layoutHeight.current = e.nativeEvent.layout.height;
          }}
          onTouchStart={(e) => {
            touchStartY.current = e.nativeEvent.pageY;
          }}
          onTouchEnd={(e) => {
            if (touchStartY.current != null) {
              const dy = Math.abs(e.nativeEvent.pageY - touchStartY.current);
              if (dy < 10) {
                setUiVisible((v) => !v);
              }
            }
            touchStartY.current = null;
          }}
        >
          {/* Chapter Title */}
          <Text style={readerTitleStyle}>{chapter?.name}</Text>

          {/* Chapter Text or No-Content UI */}
          {displayText ? (
            <Text style={readerTextStyle}>{displayText}</Text>
          ) : (
            <NoContentCard
              chapter={chapter}
              novel={novel}
              sourceUrl={sourceUrl}
              onOpenSource={handleOpenSource}
              openingUrl={openingUrl}
            />
          )}

          {/* Bottom spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom bar */}
        {uiVisible && (
          <View style={[styles.bottomBar, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
            <View style={styles.navRow}>
              <TouchableOpacity
                style={[styles.navButton, { backgroundColor: themeColors.card, borderColor: themeColors.border }, !hasPrev && styles.navDisabled]}
                disabled={!hasPrev}
                onPress={() => navigateChapter('prev')}
              >
                <Text
                  style={[
                    styles.navButtonText,
                    { color: themeColors.text },
                    !hasPrev && { color: themeColors.textSecondary },
                  ]}
                >
                  ‹ Previous
                </Text>
              </TouchableOpacity>

              {/* Settings button */}
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => setSettingsVisible(true)}
              >
                <Text style={styles.settingsButtonText}>⚙ Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navButton, { backgroundColor: themeColors.card, borderColor: themeColors.border }, !hasNext && styles.navDisabled]}
                disabled={!hasNext}
                onPress={() => navigateChapter('next')}
              >
                <Text
                  style={[
                    styles.navButtonText,
                    { color: themeColors.text },
                    !hasNext && { color: themeColors.textSecondary },
                  ]}
                >
                  Next ›
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsVisible}
        settings={settings}
        onUpdate={updateSetting}
        onClose={() => setSettingsVisible(false)}
        onTranslate={handleTranslate}
        onRetranslate={handleRetranslate}
        onDeleteTranslation={handleDeleteTranslation}
        translating={translating}
        translationProgress={translationProgress}
        hasContent={!!content}
        hasTranslation={!!translatedContent}
      />
    </>
  );
}

// ─── No-Content Card Component ────────────────────────────────────────────────

interface NoContentCardProps {
  chapter: Chapter | null;
  novel: Novel | null;
  sourceUrl: string | null;
  onOpenSource: (url: string) => void;
  openingUrl: boolean;
}

function NoContentCard({
  chapter,
  novel,
  sourceUrl,
  onOpenSource,
  openingUrl,
}: NoContentCardProps) {
  return (
    <View style={styles.noContentBox}>
      <Text style={styles.noContentIcon}>📄</Text>

      <Text style={styles.noContentTitle}>Metin İçeriği Yok</Text>

      <Text style={styles.noContentExplain}>
        Bu LNReader yedeği yalnızca bölüm meta verilerini içeriyor. Bölüm
        metni yedek dosyasına dahil edilmemiş.
      </Text>

      {/* Chapter metadata */}
      <View style={styles.metaBox}>
        {chapter?.name ? (
          <MetaRow label="Bölüm" value={chapter.name} />
        ) : null}
        {chapter?.chapterNumber != null ? (
          <MetaRow label="No" value={String(chapter.chapterNumber)} />
        ) : null}
        {chapter?.path ? (
          <MetaRow label="Yol" value={chapter.path} mono />
        ) : null}
        {novel?.pluginId ? (
          <MetaRow label="Kaynak" value={novel.pluginId} />
        ) : null}
        {novel?.path ? (
          <MetaRow label="Novel Yolu" value={novel.path} mono />
        ) : null}
        {sourceUrl ? (
          <MetaRow label="URL" value={sourceUrl} mono />
        ) : null}
      </View>

      {/* Open in browser */}
      {sourceUrl ? (
        <TouchableOpacity
          style={styles.openSourceButton}
          onPress={() => onOpenSource(sourceUrl)}
          disabled={openingUrl}
        >
          <Text style={styles.openSourceButtonText}>
            {openingUrl ? 'Açılıyor…' : '🔗 Kaynakta Aç'}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.noUrlNote}>
          Kaynak URL oluşturulamadı. Bölüm yolu veya kaynak bilgisi eksik.
        </Text>
      )}
    </View>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text
        style={[styles.metaValue, mono && styles.metaValueMono]}
        numberOfLines={2}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Settings Modal Component ─────────────────────────────────────────────────

const FONT_OPTIONS: FontFamily[] = ['System', 'Serif', 'Monospace'];
const THEME_OPTIONS: ThemeName[] = ['Dark', 'AMOLED', 'Sepia'];

interface SettingsModalProps {
  visible: boolean;
  settings: ReaderSettings;
  onUpdate: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  onClose: () => void;
  onTranslate: () => void;
  onRetranslate: () => void;
  onDeleteTranslation: () => void;
  translating: boolean;
  translationProgress: string;
  hasContent: boolean;
  hasTranslation: boolean;
}

function SettingsModal({
  visible,
  settings,
  onUpdate,
  onClose,
  onTranslate,
  onRetranslate,
  onDeleteTranslation,
  translating,
  translationProgress,
  hasContent,
  hasTranslation,
}: SettingsModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          {/* Header */}
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Reader Settings</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <Text style={modalStyles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={modalStyles.body}
            contentContainerStyle={modalStyles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Translation actions ── */}
            {hasContent && (
              <View style={modalStyles.section}>
                {/* Translate / status */}
                <TouchableOpacity
                  style={[
                    modalStyles.translateAction,
                    translating && { opacity: 0.6 },
                  ]}
                  onPress={onTranslate}
                  disabled={translating}
                >
                  {translating ? (
                    <View style={modalStyles.rowCenter}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={modalStyles.translateActionText}>
                        {translationProgress || 'Translating...'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={modalStyles.translateActionText}>
                      {hasTranslation ? '✓ Translated' : '🌐 Translate'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Retranslate & Delete — only when translation exists */}
                {hasTranslation && !translating && (
                  <View style={modalStyles.cacheRow}>
                    <TouchableOpacity
                      style={modalStyles.cacheButton}
                      onPress={onRetranslate}
                    >
                      <Text style={modalStyles.cacheButtonText}>🔄 Retranslate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[modalStyles.cacheButton, modalStyles.cacheButtonDanger]}
                      onPress={onDeleteTranslation}
                    >
                      <Text style={[modalStyles.cacheButtonText, modalStyles.cacheButtonDangerText]}>🗑 Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Font Family ── */}
            <View style={modalStyles.section}>
              <Text style={modalStyles.label}>Font Family</Text>
              <View style={modalStyles.chipRow}>
                {FONT_OPTIONS.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      modalStyles.chip,
                      settings.fontFamily === f && modalStyles.chipActive,
                    ]}
                    onPress={() => onUpdate('fontFamily', f)}
                  >
                    <Text
                      style={[
                        modalStyles.chipText,
                        settings.fontFamily === f && modalStyles.chipTextActive,
                      ]}
                    >
                      {f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Font Size ── */}
            <View style={modalStyles.section}>
              <Text style={modalStyles.label}>
                Font Size: {settings.fontSize}
              </Text>
              <View style={modalStyles.stepperRow}>
                <TouchableOpacity
                  style={modalStyles.stepperBtn}
                  onPress={() =>
                    onUpdate('fontSize', Math.max(14, settings.fontSize - 1))
                  }
                >
                  <Text style={modalStyles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <View style={modalStyles.stepperTrack}>
                  <View
                    style={[
                      modalStyles.stepperFill,
                      {
                        width: `${((settings.fontSize - 14) / (28 - 14)) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <TouchableOpacity
                  style={modalStyles.stepperBtn}
                  onPress={() =>
                    onUpdate('fontSize', Math.min(28, settings.fontSize + 1))
                  }
                >
                  <Text style={modalStyles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Line Height ── */}
            <View style={modalStyles.section}>
              <Text style={modalStyles.label}>
                Line Height: {settings.lineHeightMultiplier.toFixed(1)}×
              </Text>
              <View style={modalStyles.stepperRow}>
                <TouchableOpacity
                  style={modalStyles.stepperBtn}
                  onPress={() =>
                    onUpdate(
                      'lineHeightMultiplier',
                      Math.max(
                        1.3,
                        Math.round((settings.lineHeightMultiplier - 0.1) * 10) / 10
                      )
                    )
                  }
                >
                  <Text style={modalStyles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <View style={modalStyles.stepperTrack}>
                  <View
                    style={[
                      modalStyles.stepperFill,
                      {
                        width: `${((settings.lineHeightMultiplier - 1.3) / (2.2 - 1.3)) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <TouchableOpacity
                  style={modalStyles.stepperBtn}
                  onPress={() =>
                    onUpdate(
                      'lineHeightMultiplier',
                      Math.min(
                        2.2,
                        Math.round((settings.lineHeightMultiplier + 0.1) * 10) / 10
                      )
                    )
                  }
                >
                  <Text style={modalStyles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Theme ── */}
            <View style={modalStyles.section}>
              <Text style={modalStyles.label}>Theme</Text>
              <View style={modalStyles.chipRow}>
                {THEME_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      modalStyles.chip,
                      settings.theme === t && modalStyles.chipActive,
                    ]}
                    onPress={() => onUpdate('theme', t)}
                  >
                    <Text
                      style={[
                        modalStyles.chipText,
                        settings.theme === t && modalStyles.chipTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Full Screen ── */}
            <View style={modalStyles.section}>
              <TouchableOpacity
                style={modalStyles.toggleRow}
                onPress={() => onUpdate('fullScreen', !settings.fullScreen)}
              >
                <Text style={modalStyles.label}>Full Screen</Text>
                <View
                  style={[
                    modalStyles.toggleTrack,
                    settings.fullScreen && modalStyles.toggleTrackOn,
                  ]}
                >
                  <View
                    style={[
                      modalStyles.toggleThumb,
                      settings.fullScreen && modalStyles.toggleThumbOn,
                    ]}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {/* ── Horizontal Padding ── */}
            <View style={modalStyles.section}>
              <Text style={modalStyles.label}>
                Side Padding: {settings.horizontalPadding}
              </Text>
              <View style={modalStyles.stepperRow}>
                <TouchableOpacity
                  style={modalStyles.stepperBtn}
                  onPress={() =>
                    onUpdate(
                      'horizontalPadding',
                      Math.max(12, settings.horizontalPadding - 2)
                    )
                  }
                >
                  <Text style={modalStyles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <View style={modalStyles.stepperTrack}>
                  <View
                    style={[
                      modalStyles.stepperFill,
                      {
                        width: `${((settings.horizontalPadding - 12) / (36 - 12)) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <TouchableOpacity
                  style={modalStyles.stepperBtn}
                  onPress={() =>
                    onUpdate(
                      'horizontalPadding',
                      Math.min(36, settings.horizontalPadding + 2)
                    )
                  }
                >
                  <Text style={modalStyles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#1C2333',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
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
    borderBottomColor: '#30363D',
  },
  title: {
    color: '#E6EDF3',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#30363D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#8B949E',
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingTop: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    color: '#D4D4D8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16213E',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  chipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    color: '#8B949E',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#16213E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  stepperBtnText: {
    color: '#D4D4D8',
    fontSize: 20,
    fontWeight: '600',
  },
  cacheRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },

  cacheButton: {
    flex: 1,
    backgroundColor: "#2D3748",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#3A4556",
  },

  cacheButtonText: {
    color: "#E6EDF3",
    fontSize: 14,
    fontWeight: "600",
  },

  cacheButtonDanger: {
    backgroundColor: "#3A1F2B",
    borderColor: "#7F1D1D",
  },

  cacheButtonDangerText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "600",
  },
  stepperTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#30363D',
    borderRadius: 3,
    overflow: 'hidden',
  },
  stepperFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#30363D',
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: '#7C3AED',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#8B949E',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#FFFFFF',
  },
  translateAction: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  translateActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  fullScreenExit: {
    paddingVertical: 6,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  fullScreenExitText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    padding: 6,
    gap: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: COLORS.primary,
  },
  toggleText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  translatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  translatingBarText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 16,
  },
  // ── No-content card ──
  noContentBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 12,
  },
  noContentIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  noContentTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  noContentExplain: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
  },
  metaBox: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    gap: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    width: 70,
    paddingTop: 1,
    flexShrink: 0,
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  metaValueMono: {
    fontFamily: 'monospace' as const,
    fontSize: 12,
    color: COLORS.accent,
  },
  openSourceButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  openSourceButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  noUrlNote: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    fontStyle: 'italic',
  },
  prefetchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  prefetchBarText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  quotaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F3B08',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#92400E',
  },
  quotaBannerText: {
    flex: 1,
    color: '#FEF3C7',
    fontSize: 13,
    fontWeight: '500' as const,
  },
  quotaBannerDismiss: {
    color: '#FDE68A',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  // ── Bottom bar ──
  bottomBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 24,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  settingsButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

