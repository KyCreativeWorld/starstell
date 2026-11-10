import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton } from './Glass';
import { formatHours, formatMoney } from '../report/format';
import {
  DEFAULT_FILTERS,
  FEASIBILITY_LEVELS,
  filtersActive,
  matchesFilters,
  MIN_COST_STEPS,
  type ReportFilters,
} from '../report/filters';
import type { Report } from '../report/types';

interface Props {
  report: Report;
  filters: ReportFilters;
  onChangeFilters: (f: ReportFilters) => void;
  /** Zoom to a team (unhiding it if needed). */
  onSelectTeam: (teamId: string) => void;
  onReplace: () => void;
  onRemove: () => void;
  busy: boolean;
  reading: boolean;
  error: string | null;
  /** Shown as a close button when the sidebar is a drawer (phones). */
  onClose?: () => void;
}

export function ReportSidebar({
  report,
  filters,
  onChangeFilters,
  onSelectTeam,
  onReplace,
  onRemove,
  busy,
  reading,
  error,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const title = report.client ?? report.title ?? report.fileName.replace(/\.pdf$/i, '');
  const subtitle = [report.client ? report.title : undefined, report.reportDate].filter(Boolean).join(' · ');
  const byId = new Map(report.bottlenecks.map((b) => [b.id, b]));
  const set = (patch: Partial<ReportFilters>) => onChangeFilters({ ...filters, ...patch });

  const stats = [
    { label: 'Hours lost / wk', value: formatHours(report.totals.hoursPerWeek)?.replace(' h/wk', '') },
    { label: 'Annual cost', value: formatMoney(report.totals.annualCost, true) },
    { label: 'Teams', value: String(report.teams.length) },
    { label: 'Bottlenecks', value: String(report.bottlenecks.length) },
  ].filter((s) => s.value);

  const toggleTeam = (id: string) =>
    set({
      hiddenTeams: filters.hiddenTeams.includes(id)
        ? filters.hiddenTeams.filter((t) => t !== id)
        : [...filters.hiddenTeams, id],
    });

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: c.mutedText }]}>Report</Text>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{title}</Text>
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sidebar"
            hitSlop={10}
            style={[styles.close, { borderColor: c.glassBorder }]}
          >
            <Text style={[styles.closeText, { color: c.text }]}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={[styles.small, { color: c.mutedText }]}>{subtitle}</Text> : null}
      <View style={styles.buttons}>
        <GlassButton
          label={reading ? 'Reading…' : 'Replace PDF'}
          variant="ghost"
          onPress={onReplace}
          loading={busy}
          style={styles.button}
        />
        <GlassButton label="Remove" variant="ghost" onPress={onRemove} style={styles.button} />
      </View>
      {error ? <Text style={[styles.small, { color: c.danger, marginTop: 8 }]}>{error}</Text> : null}

      {/* Summary */}
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.stat, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
            <Text style={[styles.statValue, { color: c.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: c.mutedText }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Teams */}
      <View style={styles.sectionHead}>
        <Text style={[styles.section, { color: c.text }]}>Teams</Text>
        <Pressable
          onPress={() =>
            set({ hiddenTeams: filters.hiddenTeams.length ? [] : report.teams.map((t) => t.id) })
          }
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={[styles.link, { color: c.primary }]}>
            {filters.hiddenTeams.length ? 'Show all' : 'Hide all'}
          </Text>
        </Pressable>
      </View>
      {report.teams.map((t) => {
        const shown = !filters.hiddenTeams.includes(t.id);
        const matching = t.bottleneckIds.filter((id) => {
          const b = byId.get(id);
          return b && matchesFilters(b, filters);
        }).length;
        return (
          <View key={t.id} style={styles.teamRow}>
            <Pressable
              onPress={() => toggleTeam(t.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: shown }}
              accessibilityLabel={`Show ${t.name}`}
              hitSlop={6}
              style={[
                styles.check,
                { borderColor: shown ? c.primary : c.inputBorder, backgroundColor: shown ? c.buttonBg : 'transparent' },
              ]}
            >
              {shown ? <Text style={[styles.checkMark, { color: c.buttonText }]}>✓</Text> : null}
            </Pressable>
            <Pressable
              onPress={() => onSelectTeam(t.id)}
              accessibilityRole="button"
              accessibilityLabel={`Zoom to ${t.name}`}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.teamName,
                { backgroundColor: hovered || pressed ? c.inputBg : 'transparent' },
              ]}
            >
              <Text style={[styles.teamText, { color: shown ? c.text : c.mutedText }]} numberOfLines={1}>
                {t.name}
              </Text>
              <Text style={[styles.small, { color: c.mutedText }]}>
                {matching === t.bottleneckIds.length ? matching : `${matching}/${t.bottleneckIds.length}`}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {/* Filters */}
      <View style={styles.sectionHead}>
        <Text style={[styles.section, { color: c.text }]}>Filters</Text>
        {filtersActive({ ...filters, hiddenTeams: [] }) ? (
          <Pressable
            onPress={() => set({ ...DEFAULT_FILTERS, hiddenTeams: filters.hiddenTeams })}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: c.primary }]}>Reset</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.label, { color: c.mutedText }]}>Fix feasibility</Text>
      <View style={styles.chips}>
        {FEASIBILITY_LEVELS.map((level) => {
          const on = filters.feasibility.includes(level);
          return (
            <Chip
              key={level}
              label={level === 'Med' ? 'Medium' : level}
              on={on}
              onPress={() =>
                set({
                  feasibility: on
                    ? filters.feasibility.filter((l) => l !== level)
                    : FEASIBILITY_LEVELS.filter((l) => l === level || filters.feasibility.includes(l)),
                })
              }
            />
          );
        })}
      </View>

      <Text style={[styles.label, { color: c.mutedText }]}>Minimum annual cost</Text>
      <View style={styles.chips}>
        {MIN_COST_STEPS.map((v) => (
          <Chip
            key={v}
            label={v === 0 ? 'Any' : `${formatMoney(v, true)}+`}
            on={filters.minCost === v}
            onPress={() => set({ minCost: v })}
          />
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={[styles.teamText, styles.flex, { color: c.text }]}>Only with solutions</Text>
        <Switch
          value={filters.solutionsOnly}
          onValueChange={(solutionsOnly) => set({ solutionsOnly })}
          trackColor={{ true: c.primary, false: c.inputBorder }}
          accessibilityLabel="Only show bottlenecks with solutions"
        />
      </View>

      {/* Legend */}
      <Text style={[styles.section, { color: c.text, marginTop: 22 }]}>Legend</Text>
      {[
        { mark: '◌', text: 'Cluster = team (bigger = more hours lost)' },
        { mark: '●', text: 'Star = bottleneck (bigger = higher cost)' },
        { mark: '✛', text: 'Spiked star = solutions in the report' },
        { mark: '—', text: 'Line between clusters = shared bottleneck' },
        { mark: '◍', text: 'Nearer clusters look larger and brighter' },
      ].map((i) => (
        <View key={i.text} style={styles.legendItem}>
          <Text style={[styles.legendMark, { color: c.primary }]}>{i.mark}</Text>
          <Text style={[styles.small, styles.flex, { color: c.mutedText }]}>{i.text}</Text>
        </View>
      ))}
      <Text style={[styles.small, { color: c.mutedText, marginTop: 14 }]}>Source: {report.fileName}</Text>
      {report.notes.map((n) => (
        <Text key={n} style={[styles.small, { color: c.mutedText, marginTop: 6 }]}>{n}</Text>
      ))}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[
        styles.chip,
        { borderColor: on ? c.primary : c.inputBorder, backgroundColor: on ? c.buttonBg : c.inputBg },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? c.buttonText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 18, paddingBottom: 28 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: { fontFamily: fonts.body, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontFamily: fonts.display, fontSize: 24, marginTop: 2 },
  close: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 13, fontWeight: '700' },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  button: { flex: 1, minHeight: 38, paddingVertical: 7, paddingHorizontal: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  stat: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10 },
  statValue: { fontFamily: fonts.body, fontSize: 18, fontWeight: '700' },
  statLabel: { fontFamily: fonts.body, fontSize: 11, marginTop: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 6 },
  section: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  link: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 12, fontWeight: '700' },
  teamName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8 },
  teamText: { flex: 1, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  label: { fontFamily: fonts.body, fontSize: 12, marginTop: 8, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  legendMark: { fontSize: 13, width: 14, textAlign: 'center' },
});
