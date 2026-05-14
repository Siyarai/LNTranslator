import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  type FontFamily,
  type ReaderSettings,
  type ThemeName,
  DEFAULT_SETTINGS,
  THEME_PALETTES,
  loadReaderSettings,
  resolveFontFamily,
  saveReaderSettings,
} from '../utils/readerSettings';

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_OPTIONS: FontFamily[] = ['System', 'Serif', 'Monospace'];
const THEME_OPTIONS: ThemeName[] = ['Dark', 'AMOLED', 'Sepia'];

// ─── Colors (matches reader modal theme) ──────────────────────────────────────

const K = {
  bg: '#1C2333',
  surface: '#16213E',
  text: '#D4D4D8',
  textSec: '#8B949E',
  border: '#30363D',
  primary: '#7C3AED',
  white: '#FFFFFF',
};

// ─── Standalone Reader Settings Panel ─────────────────────────────────────────
// Can be embedded in any ScrollView / Modal.
// Manages its own load/save lifecycle.

export default function ReaderSettingsPanel() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadReaderSettings().then(setSettings);
  }, []);

  const update = useCallback(
    <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveReaderSettings(next);
        return next;
      });
    },
    []
  );

  const theme = THEME_PALETTES[settings.theme];
  const fontFamily = resolveFontFamily(settings.fontFamily);

  return (
    <View>
      {/* ── Live Preview ── */}
      <View style={p.section}>
        <Text style={p.label}>Önizleme</Text>
        <View
          style={[
            p.previewBox,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              paddingHorizontal: settings.horizontalPadding,
            },
          ]}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightMultiplier,
              fontFamily,
              fontWeight: '700',
              marginBottom: 6,
            }}
          >
            Chapter Preview
          </Text>
          <Text
            style={{
              color: theme.text,
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightMultiplier,
              fontFamily,
            }}
          >
            The mysterious gray fog covered the quiet street. He opened the book
            and continued reading from where he left off.
          </Text>
        </View>
      </View>

      {/* ── Font Family ── */}
      <View style={p.section}>
        <Text style={p.label}>Yazı Tipi</Text>
        <View style={p.chipRow}>
          {FONT_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[p.chip, settings.fontFamily === f && p.chipActive]}
              onPress={() => update('fontFamily', f)}
            >
              <Text
                style={[
                  p.chipText,
                  settings.fontFamily === f && p.chipTextActive,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Font Size ── */}
      <View style={p.section}>
        <Text style={p.label}>Yazı Boyutu: {settings.fontSize}</Text>
        <View style={p.stepperRow}>
          <TouchableOpacity
            style={p.stepperBtn}
            onPress={() => update('fontSize', Math.max(14, settings.fontSize - 1))}
          >
            <Text style={p.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <View style={p.stepperTrack}>
            <View
              style={[
                p.stepperFill,
                { width: `${((settings.fontSize - 14) / (28 - 14)) * 100}%` },
              ]}
            />
          </View>
          <TouchableOpacity
            style={p.stepperBtn}
            onPress={() => update('fontSize', Math.min(28, settings.fontSize + 1))}
          >
            <Text style={p.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Line Height ── */}
      <View style={p.section}>
        <Text style={p.label}>
          Satır Yüksekliği: {settings.lineHeightMultiplier.toFixed(1)}×
        </Text>
        <View style={p.stepperRow}>
          <TouchableOpacity
            style={p.stepperBtn}
            onPress={() =>
              update(
                'lineHeightMultiplier',
                Math.max(1.3, Math.round((settings.lineHeightMultiplier - 0.1) * 10) / 10)
              )
            }
          >
            <Text style={p.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <View style={p.stepperTrack}>
            <View
              style={[
                p.stepperFill,
                {
                  width: `${((settings.lineHeightMultiplier - 1.3) / (2.2 - 1.3)) * 100}%`,
                },
              ]}
            />
          </View>
          <TouchableOpacity
            style={p.stepperBtn}
            onPress={() =>
              update(
                'lineHeightMultiplier',
                Math.min(2.2, Math.round((settings.lineHeightMultiplier + 0.1) * 10) / 10)
              )
            }
          >
            <Text style={p.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Theme ── */}
      <View style={p.section}>
        <Text style={p.label}>Tema</Text>
        <View style={p.chipRow}>
          {THEME_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[p.chip, settings.theme === t && p.chipActive]}
              onPress={() => update('theme', t)}
            >
              <Text
                style={[
                  p.chipText,
                  settings.theme === t && p.chipTextActive,
                ]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Full Screen ── */}
      <View style={p.section}>
        <TouchableOpacity
          style={p.toggleRow}
          onPress={() => update('fullScreen', !settings.fullScreen)}
        >
          <Text style={p.label}>Tam Ekran</Text>
          <View
            style={[
              p.toggleTrack,
              settings.fullScreen && p.toggleTrackOn,
            ]}
          >
            <View
              style={[
                p.toggleThumb,
                settings.fullScreen && p.toggleThumbOn,
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Side Padding ── */}
      <View style={p.section}>
        <Text style={p.label}>
          Kenar Boşluğu: {settings.horizontalPadding}
        </Text>
        <View style={p.stepperRow}>
          <TouchableOpacity
            style={p.stepperBtn}
            onPress={() =>
              update('horizontalPadding', Math.max(12, settings.horizontalPadding - 2))
            }
          >
            <Text style={p.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <View style={p.stepperTrack}>
            <View
              style={[
                p.stepperFill,
                {
                  width: `${((settings.horizontalPadding - 12) / (36 - 12)) * 100}%`,
                },
              ]}
            />
          </View>
          <TouchableOpacity
            style={p.stepperBtn}
            onPress={() =>
              update('horizontalPadding', Math.min(36, settings.horizontalPadding + 2))
            }
          >
            <Text style={p.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const p = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  previewBox: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  label: {
    color: K.text,
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
    backgroundColor: K.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: K.border,
  },
  chipActive: {
    backgroundColor: K.primary,
    borderColor: K.primary,
  },
  chipText: {
    color: K.textSec,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: K.white,
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
    backgroundColor: K.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: K.border,
  },
  stepperBtnText: {
    color: K.text,
    fontSize: 20,
    fontWeight: '600',
  },
  stepperTrack: {
    flex: 1,
    height: 6,
    backgroundColor: K.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  stepperFill: {
    height: '100%',
    backgroundColor: K.primary,
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
    backgroundColor: K.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: K.primary,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: K.textSec,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: K.white,
  },
});
