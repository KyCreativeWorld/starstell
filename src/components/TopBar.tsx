import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';
import { ThemePicker } from './ThemePicker';

export type TabName = 'home' | 'report' | 'settings';

const TABS: { name: TabName; label: string }[] = [
  { name: 'home', label: 'Home' },
  { name: 'report', label: 'Report' },
  { name: 'settings', label: 'Settings' },
];

/** Website-style navigation bar: wordmark, page tabs, theme picker. */
export function TopBar({ tab, onChange }: { tab: TabName; onChange: (tab: TabName) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const compact = width < 560;

  return (
    <View
      style={[
        styles.bar,
        frosted,
        {
          backgroundColor: c.panel,
          borderBottomColor: c.glassBorder,
          shadowColor: c.shadow,
          backgroundImage: c.glassSheen,
        },
      ]}
    >
      <View style={[styles.inner, compact && styles.innerCompact]}>
        <Pressable
          onPress={() => onChange('home')}
          accessibilityRole="link"
          accessibilityLabel="Starstell home"
          hitSlop={6}
        >
          <Text style={[styles.wordmark, compact && styles.wordmarkCompact, { color: theme.dark ? c.primary : c.text }]}>
            {compact ? 'S' : 'STARSTELL'}
          </Text>
        </Pressable>

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const active = t.name === tab;
            return (
              <Pressable
                key={t.name}
                onPress={() => onChange(t.name)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.tab,
                  compact && styles.tabCompact,
                  {
                    backgroundColor: active ? c.inputBg : hovered || pressed ? c.glass : 'transparent',
                    borderColor: active ? c.inputBorder : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? c.text : c.mutedText, fontWeight: active ? '700' : '600' },
                  ]}
                >
                  {t.label}
                </Text>
                {active ? <View style={[styles.underline, { backgroundColor: c.primary }]} /> : null}
              </Pressable>
            );
          })}
        </View>

        <ThemePicker compact={compact} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    zIndex: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  innerCompact: { gap: 8, paddingHorizontal: 16 },
  wordmark: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 2 },
  wordmarkCompact: { fontSize: 24, letterSpacing: 0, width: 22, textAlign: 'center' },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tab: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  tabCompact: { paddingHorizontal: 10 },
  tabText: { fontFamily: fonts.body, fontSize: 14 },
  underline: { position: 'absolute', bottom: 3, height: 2, width: 16, borderRadius: 1 },
});
