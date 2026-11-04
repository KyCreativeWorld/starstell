import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts, themeList } from '../theme/themes';

/** Small "Theme" button that opens a dropdown of available themes. */
export function ThemePicker() {
  const { theme, setThemeName } = useTheme();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const pillStyle = {
    backgroundColor: theme.colors.glass,
    borderColor: theme.colors.glassBorder,
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Change theme"
        style={({ pressed }) => [styles.pill, pillStyle, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Swatch color={theme.colors.primary} border={theme.colors.glassBorder} />
        <Text style={[styles.pillText, { color: theme.colors.text }]}>Theme</Text>
        <Text style={[styles.caret, { color: theme.colors.mutedText }]}>▴</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              {
                bottom: insets.bottom + 64,
                backgroundColor: theme.dark ? 'rgba(27,27,30,0.92)' : 'rgba(238,244,246,0.95)',
                borderColor: theme.colors.glassBorder,
                shadowColor: theme.colors.shadow,
              },
            ]}
          >
            <Text style={[styles.menuTitle, { color: theme.colors.mutedText }]}>Choose a theme</Text>
            {themeList.map((t) => {
              const selected = t.name === theme.name;
              return (
                <Pressable
                  key={t.name}
                  onPress={() => {
                    setThemeName(t.name);
                    setOpen(false);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: selected
                        ? theme.colors.inputBg
                        : pressed
                          ? theme.colors.glass
                          : 'transparent',
                      borderColor: selected ? theme.colors.inputBorder : 'transparent',
                    },
                  ]}
                >
                  <Swatch color={t.colors.background} border={t.colors.primary} inner={t.colors.primary} />
                  <Text style={[styles.optionText, { color: theme.colors.text }]}>{t.label}</Text>
                  {selected ? (
                    <Text style={[styles.check, { color: theme.colors.primary }]}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Swatch({ color, border, inner }: { color: string; border: string; inner?: string }) {
  return (
    <View style={[styles.swatch, { backgroundColor: color, borderColor: border }]}>
      {inner ? <View style={[styles.swatchInner, { backgroundColor: inner }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  pillText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  caret: { fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  menu: {
    position: 'absolute',
    alignSelf: 'center',
    width: 240,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  menuTitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionText: { flex: 1, fontFamily: fonts.body, fontSize: 15 },
  check: { fontSize: 15, fontWeight: '700' },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: { width: 8, height: 8, borderRadius: 4 },
});
