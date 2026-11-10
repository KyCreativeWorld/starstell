import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { ChatWindow } from '../components/ChatWindow';
import { useAiConfig } from '../settings/AiConfigContext';

/** Landing page: the wordmark and the Starstell chat. */
export function HomeScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { savedAi } = useAiConfig();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.wordmark, { color: theme.dark ? c.primary : c.text }]}>STARSTELL</Text>
          <Text style={[styles.tagline, { color: c.mutedText }]}>
            AI consultant for workforce planning and reskilling
          </Text>
        </View>
        <ChatWindow apiKey={savedAi.apiKey} model={savedAi.model} fill />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 16,
  },
  header: { alignItems: 'center', marginBottom: 24 },
  wordmark: { fontFamily: fonts.display, fontSize: 44, letterSpacing: 2 },
  tagline: { fontFamily: fonts.body, fontSize: 14, marginTop: 6, textAlign: 'center' },
});
