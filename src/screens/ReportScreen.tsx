import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { Constellation } from '../components/Constellation';
import { ClusterMenu } from '../components/ClusterMenu';
import { ReportSidebar } from '../components/ReportSidebar';
import { StarLineup } from '../components/StarLineup';
import { PdfView } from '../components/PdfView';
import { VisualPicker, type ReportVisual } from '../components/VisualPicker';
import { useReport } from '../report/ReportContext';
import { pickAndParseReport, ReportParseError } from '../report/reportStore';
import { DEFAULT_FILTERS, filtersActive, matchesFilters, type ReportFilters } from '../report/filters';
import type { Report } from '../report/types';

/** Px kept clear at the top of a visual for the overlaid filters button / view picker. */
const TOP_BAR_SPACE = 64;
/** Px kept clear at the right of the PDF header for the view picker (wide layout). */
const PICKER_SPACE = 190;

interface Selection {
  teamId: string;
  bottleneckId: string | null;
}

/** `active` is false while another tab is showing (pauses the sky animation). */
export function ReportScreen({ active }: { active: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { report, loaded, setReport, clearReport } = useReport();
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);

  // A new or removed report clears the selection and filters.
  const [prevReport, setPrevReport] = useState(report);
  if (report !== prevReport) {
    setPrevReport(report);
    setSelection(null);
    setFilters(DEFAULT_FILTERS);
  }

  const choosePdf = async () => {
    setError(null);
    setBusy(true);
    try {
      const parsed = await pickAndParseReport(() => setReading(true));
      if (parsed) setReport(parsed);
    } catch (e) {
      setError(
        e instanceof ReportParseError
          ? e.message
          : "Couldn't read that PDF. Make sure it's a Workflow Efficiency Consulting Report exported as a PDF.",
      );
    } finally {
      setBusy(false);
      setReading(false);
    }
  };

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!report) {
    return (
      <ScrollView contentContainerStyle={styles.uploadWrap}>
        <GlassCard style={styles.uploadCard}>
          <Text style={[styles.uploadIcon, { color: c.primary }]}>✦</Text>
          <Text style={[styles.uploadTitle, { color: c.text }]}>Map a consulting report</Text>
          <Text style={[styles.uploadBody, { color: c.text }]}>
            {"Upload a Workflow Efficiency Consulting Report (PDF). Starstell turns it into a constellation: " +
              "each cluster is a team and each star is one of its bottlenecks. Tap a cluster to see that " +
              "team's bottlenecks and solution options."}
          </Text>
          <GlassButton
            label={reading ? 'Reading report…' : 'Choose PDF'}
            onPress={choosePdf}
            loading={busy}
            style={styles.uploadButton}
          />
          {error ? (
            <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Text style={[styles.fine, { color: c.mutedText }]}>
            {"The PDF is read on this device and is not uploaded anywhere. Starstell looks for the template's " +
              '"All bottlenecks measured" and "Time impact by department" tables and the "Bottleneck" sections.'}
          </Text>
        </GlassCard>
      </ScrollView>
    );
  }

  return (
    <ReportView
      report={report}
      active={active}
      selection={selection}
      filters={filters}
      onChangeFilters={(f) => {
        setFilters(f);
        // Hiding the open team closes it.
        if (selection && f.hiddenTeams.includes(selection.teamId)) setSelection(null);
      }}
      onSelect={(teamId, bottleneckId) => {
        if (filters.hiddenTeams.includes(teamId)) {
          setFilters({ ...filters, hiddenTeams: filters.hiddenTeams.filter((t) => t !== teamId) });
        }
        setSelection({ teamId, bottleneckId: bottleneckId ?? null });
      }}
      onClose={() => setSelection(null)}
      onReplace={choosePdf}
      onRemove={clearReport}
      busy={busy}
      reading={reading}
      error={error}
    />
  );
}

function ReportView({
  report,
  active,
  selection,
  filters,
  onChangeFilters,
  onSelect,
  onClose,
  onReplace,
  onRemove,
  busy,
  reading,
  error,
}: {
  report: Report;
  active: boolean;
  selection: Selection | null;
  filters: ReportFilters;
  onChangeFilters: (f: ReportFilters) => void;
  onSelect: (teamId: string, bottleneckId?: string) => void;
  onClose: () => void;
  onReplace: () => void;
  onRemove: () => void;
  busy: boolean;
  reading: boolean;
  error: string | null;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visual, setVisual] = useState<ReportVisual>('sky');
  const insets = useSafeAreaInsets();

  const byId = useMemo(() => new Map(report.bottlenecks.map((b) => [b.id, b])), [report]);
  const isVisible = useCallback(
    (id: string) => {
      const b = byId.get(id);
      return !!b && matchesFilters(b, filters);
    },
    [byId, filters],
  );

  const sidebar = (
    <ReportSidebar
      report={report}
      filters={filters}
      onChangeFilters={onChangeFilters}
      onSelectTeam={(id) => {
        setDrawerOpen(false);
        onSelect(id);
      }}
      onReplace={onReplace}
      onRemove={onRemove}
      busy={busy}
      reading={reading}
      error={error}
      onClose={wide ? undefined : () => setDrawerOpen(false)}
    />
  );

  const menu = selection ? (
    <ClusterMenu
      key={`${selection.teamId}:${selection.bottleneckId ?? ''}`}
      report={report}
      teamId={selection.teamId}
      initialBottleneckId={selection.bottleneckId}
      isVisible={isVisible}
      onClose={onClose}
      onSelectTeam={onSelect}
    />
  ) : null;

  const title = report.client ?? report.title ?? report.fileName.replace(/\.pdf$/i, '');
  // The details panel covers the top controls in the visual views.
  const showTopBar = visual === 'pdf' || !selection;

  return (
    <View style={styles.layout}>
      {wide ? (
        <GlassCard style={styles.sidebar}>
          {sidebar}
        </GlassCard>
      ) : null}

      <View style={[styles.skyArea, wide && styles.skyAreaWide]}>
        {visual === 'sky' ? (
          <Constellation
            report={report}
            active={active}
            selectedTeamId={selection?.teamId ?? null}
            hiddenTeamIds={filters.hiddenTeams}
            isVisible={isVisible}
            insetTop={wide ? 0 : 44}
            onSelectTeam={onSelect}
            onClose={onClose}
            menu={menu}
          />
        ) : visual === 'lineup' ? (
          <StarLineup
            report={report}
            active={active}
            hiddenTeamIds={filters.hiddenTeams}
            isVisible={isVisible}
            selectedBottleneckId={selection?.bottleneckId ?? null}
            insetTop={TOP_BAR_SPACE}
            onSelect={onSelect}
            onClose={onClose}
            menu={menu}
          />
        ) : (
          <PdfView
            report={report}
            insetTop={wide ? 0 : TOP_BAR_SPACE}
            insetRight={wide ? PICKER_SPACE : 0}
            onReplace={onReplace}
            busy={busy}
          />
        )}
        {showTopBar ? (
          <View style={[styles.topBar, wide ? styles.topBarWide : styles.topBarNarrow]} pointerEvents="box-none">
            {!wide ? (
              <Pressable
                onPress={() => setDrawerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open filters and report details"
                style={({ pressed }) => [
                  styles.filtersButton,
                  frosted,
                  { backgroundColor: c.menu, borderColor: c.glassBorder, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.filtersIcon, { color: c.primary }]}>☰</Text>
                <Text style={[styles.filtersText, { color: c.text }]} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={[styles.filtersMeta, { color: filtersActive(filters) ? c.primary : c.mutedText }]}>
                  {filtersActive(filters) ? 'Filtered' : 'Filters'}
                </Text>
              </Pressable>
            ) : null}
            <VisualPicker value={visual} onChange={setVisual} />
          </View>
        ) : null}
      </View>

      {!wide ? (
        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerRoot}>
            <View
              style={[
                styles.drawer,
                frosted,
                {
                  backgroundColor: c.background,
                  backgroundImage: c.glassSheen,
                  borderColor: c.glassBorder,
                  paddingTop: insets.top,
                  paddingBottom: insets.bottom,
                },
              ]}
            >
              {sidebar}
            </View>
            <Pressable
              style={styles.flex}
              onPress={() => setDrawerOpen(false)}
              accessibilityLabel="Close sidebar"
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  uploadWrap: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  uploadCard: { width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'center', paddingVertical: 32 },
  uploadIcon: { fontSize: 34 },
  uploadTitle: { fontFamily: fonts.display, fontSize: 30, marginTop: 6, textAlign: 'center' },
  uploadBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  uploadButton: { marginTop: 22, minWidth: 200 },
  fine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 18 },
  error: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 14 },
  layout: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 300, margin: 12, marginRight: 0, padding: 0, overflow: 'hidden' },
  skyArea: { flex: 1, padding: 10 },
  skyAreaWide: { padding: 12 },
  topBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 50,
  },
  topBarNarrow: { top: 20, left: 20, right: 20 },
  topBarWide: { top: 22, right: 24 },
  filtersButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filtersIcon: { fontSize: 16 },
  filtersText: { flex: 1, fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  filtersMeta: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  drawerRoot: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer: { width: '86%', maxWidth: 340, borderRightWidth: 1 },
});
