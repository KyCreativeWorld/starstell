import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { StarField } from './src/components/StarField';
import { TopBar, type TabName } from './src/components/TopBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AiConfigProvider } from './src/settings/AiConfigContext';
import { ReportProvider } from './src/report/ReportContext';

function Root() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<TabName>('home');

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Soft color glows behind the glass windows so their transparency reads. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundImage: theme.colors.backgroundGlow }]}
      />
      {theme.stars ? <StarField /> : null}
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <TopBar tab={tab} onChange={setTab} />
        {/* Screens stay mounted so the chat and the selected team survive tab switches. */}
        <View style={[styles.root, tab !== 'home' && styles.hidden]}>
          <HomeScreen />
        </View>
        <View style={[styles.root, tab !== 'report' && styles.hidden]}>
          <ReportScreen active={tab === 'report'} />
        </View>
        {tab === 'settings' ? (
          <View style={styles.root}>
            <SettingsScreen />
          </View>
        ) : null}
      </SafeAreaView>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AiConfigProvider>
            <ReportProvider>
              <Root />
            </ReportProvider>
          </AiConfigProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hidden: { display: 'none' },
});
