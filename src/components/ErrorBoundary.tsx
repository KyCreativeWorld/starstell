import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { storage, STORAGE_KEYS } from '../storage';

interface State {
  error: Error | null;
}

/**
 * Last-resort screen: if anything crashes while rendering, show what happened
 * (instead of a blank page) and offer to clear saved data, the most likely culprit.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Starstell crashed:', error, info.componentStack);
  }

  private reset = async () => {
    await Promise.all(Object.values(STORAGE_KEYS).map((k) => storage.remove(k)));
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Starstell hit an error while loading. Resetting the saved settings usually fixes it.
          </Text>
          <Text selectable style={styles.error}>
            {String(error?.message ?? error)}
          </Text>
          <Pressable onPress={this.reset} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>Reset saved settings and reload</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
}

// Plain colors on purpose: the theme system may be what broke.
const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#eef4f6' },
  card: {
    alignSelf: 'center',
    maxWidth: 440,
    width: '100%',
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#2e3537' },
  body: { fontSize: 15, color: '#2e3537' },
  error: { fontSize: 12, color: '#a14a4a', fontFamily: 'monospace' },
  button: { marginTop: 8, borderRadius: 12, padding: 12, backgroundColor: '#5997a6', alignItems: 'center' },
  buttonText: { color: '#eef4f6', fontWeight: '700', fontSize: 15 },
});
