/** Notes card: a plain text box, saved per card. Its size is changed in edit mode. */
import React from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassCard } from '../components/Glass';
import { updateCardSettings, useCardSettings } from './cardSettings';

export function NotesCard({ cardKey }: { cardKey: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const saved = useCardSettings<{ text: string }>(cardKey);
  const text = typeof saved?.text === 'string' ? saved.text : '';

  return (
    <GlassCard style={styles.card}>
      <TextInput
        value={text}
        onChangeText={(t) => updateCardSettings(cardKey, { text: t })}
        placeholder="Write a note…"
        placeholderTextColor={c.placeholder}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Note"
        style={[
          styles.input,
          { color: c.text },
          // No focus ring on web; the card itself is the box.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, padding: 0 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, padding: 16 },
});
