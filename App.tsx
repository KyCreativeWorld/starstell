import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { StarField } from './src/components/StarField';
import { HomeScreen } from './src/screens/HomeScreen';

function Root() {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Soft color glows behind the glass windows so their transparency reads. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundImage: theme.colors.backgroundGlow }]}
      />
      {theme.stars ? <StarField /> : null}
      <HomeScreen />
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
