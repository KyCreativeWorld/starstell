import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { StarField } from './src/components/StarField';
import { Sidebar, SIDEBAR_COLLAPSE_BELOW, type TabName } from './src/components/Sidebar';
import { AppHeader } from './src/components/AppHeader';
import type { SearchTarget } from './src/search/searchIndex';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ReportScreen, type ReportFocus } from './src/screens/ReportScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SolutionsScreen, type SolutionFocus } from './src/screens/SolutionsScreen';
import { BottlenecksScreen } from './src/screens/BottlenecksScreen';
import { AuditScreen } from './src/screens/AuditScreen';
import { EmployeesScreen } from './src/screens/EmployeesScreen';
import { TimelinesScreen } from './src/screens/TimelinesScreen';
import type { AuditPage } from './src/audit/auditPages';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AiConfigProvider } from './src/settings/AiConfigContext';
import { DataFolderProvider } from './src/settings/DataFolderContext';
import { ProfileProvider } from './src/settings/ProfileContext';
import { ReportProvider } from './src/report/ReportContext';

function Root() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<TabName>('home');
  const [reportFocus, setReportFocus] = useState<ReportFocus | null>(null);
  const [solutionFocus, setSolutionFocus] = useState<SolutionFocus | null>(null);
  const [auditPage, setAuditPage] = useState<AuditPage>('new');
  /** Employee whose page is open on the Employees tab (null = the list). */
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const compact = width < SIDEBAR_COLLAPSE_BELOW;

  const navigate = (target: SearchTarget) => {
    setTab(target.tab);
    if (target.teamId) setReportFocus({ teamId: target.teamId, bottleneckId: target.bottleneckId });
    if (target.solutionKey) setSolutionFocus({ key: target.solutionKey });
    if (target.tab === 'employees') setEmployeeId(target.employeeId ?? null);
  };

  return (
    <View style={[styles.root, styles.row, { backgroundColor: theme.colors.background }]}>
      {/* Soft color glows behind the glass windows so their transparency reads. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundImage: theme.colors.backgroundGlow }]}
      />
      {theme.stars ? <StarField /> : null}
      <Sidebar tab={tab} onChange={setTab} compact={compact} auditPage={auditPage} onAuditPage={setAuditPage} />
      <View style={styles.root}>
        <AppHeader onNavigate={navigate} compact={width < 600} />
        <View style={[styles.root, { paddingBottom: insets.bottom, paddingRight: insets.right }]}>
          {/* Screens stay mounted so the chat and the selected team survive tab switches. */}
          <View style={[styles.root, tab !== 'home' && styles.hidden]}>
            <DashboardScreen onNavigate={setTab} />
          </View>
          <View style={[styles.root, tab !== 'report' && styles.hidden]}>
            <ReportScreen active={tab === 'report'} focus={reportFocus} />
          </View>
          {tab === 'bottlenecks' ? (
            <View style={styles.root}>
              <BottlenecksScreen
                onOpenSolutions={(bottleneckId) => {
                  setSolutionFocus({ bottleneckId });
                  setTab('solutions');
                }}
                onOpenReport={() => setTab('report')}
              />
            </View>
          ) : null}
          {tab === 'employees' ? (
            <View style={styles.root}>
              <EmployeesScreen employeeId={employeeId} onSelect={setEmployeeId} />
            </View>
          ) : null}
          {tab === 'timelines' ? (
            <View style={styles.root}>
              <TimelinesScreen
                onOpenEmployee={(id) => {
                  setEmployeeId(id);
                  setTab('employees');
                }}
              />
            </View>
          ) : null}
          {tab === 'solutions' ? (
            <View style={styles.root}>
              <SolutionsScreen focusKey={solutionFocus} onOpenReport={() => setTab('report')} />
            </View>
          ) : null}
          <View style={[styles.root, tab !== 'audit' && styles.hidden]}>
            <AuditScreen page={auditPage} />
          </View>
          {tab === 'settings' ? (
            <View style={styles.root}>
              <SettingsScreen />
            </View>
          ) : null}
        </View>
      </View>
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
            <DataFolderProvider>
              <ProfileProvider>
                <ReportProvider>
                  <Root />
                </ReportProvider>
              </ProfileProvider>
            </DataFolderProvider>
          </AiConfigProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row' },
  hidden: { display: 'none' },
});
