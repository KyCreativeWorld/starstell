import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { formatCount, formatHours, formatMoney } from '../report/format';
import type { Bottleneck, Report, SolutionOption } from '../report/types';

interface Props {
  report: Report;
  teamId: string;
  /** Open straight to this bottleneck's details (e.g. a star was tapped). */
  initialBottleneckId: string | null;
  isVisible: (bottleneckId: string) => boolean;
  onClose: () => void;
  onSelectTeam: (teamId: string, bottleneckId?: string) => void;
}

/**
 * Pop-up beside a zoomed-in cluster: first the team's bottlenecks, then the
 * solution details for whichever one is tapped.
 * Give it a `key` of team + bottleneck so it resets when the selection changes.
 */
export function ClusterMenu({ report, teamId, initialBottleneckId, isVisible, onClose, onSelectTeam }: Props) {
  const team = report.teams.find((t) => t.id === teamId);
  const [openId, setOpenId] = useState<string | null>(initialBottleneckId);
  const all = useMemo(() => report.bottlenecks.filter((b) => b.teamIds.includes(teamId)), [report, teamId]);
  const shown = all.filter((b) => isVisible(b.id));
  const open = all.find((b) => b.id === openId);

  if (!team) return null;
  if (open) {
    return (
      <BottleneckDetail
        report={report}
        bottleneck={open}
        teamId={teamId}
        onBack={() => setOpenId(null)}
        onClose={onClose}
        onSelectTeam={onSelectTeam}
      />
    );
  }

  const stats = [
    team.hoursLost !== undefined ? `${formatHours(team.hoursLost)} lost` : undefined,
    team.employeesAffected !== undefined
      ? `${formatCount(team.employeesAffected)}${team.headcount !== undefined ? ` of ${formatCount(team.headcount)}` : ''} people affected`
      : undefined,
    team.pctTime ? `${team.pctTime} of team time` : undefined,
  ].filter(Boolean);

  return (
    <View>
      <MenuHeader eyebrow="Team" title={team.name} onClose={onClose} />
      {stats.length ? <Muted style={styles.statsLine}>{stats.join(' · ')}</Muted> : null}

      <SectionTitle>
        {shown.length === 1 ? 'Bottleneck' : `${shown.length} bottlenecks`}
      </SectionTitle>
      {shown.map((b) => (
        <BottleneckRow key={b.id} bottleneck={b} onPress={() => setOpenId(b.id)} />
      ))}
      {shown.length === 0 ? <Muted>No bottlenecks match your filters for this team.</Muted> : null}
      {all.length > shown.length && shown.length > 0 ? (
        <Muted style={styles.note}>
          {all.length - shown.length} more hidden by your filters.
        </Muted>
      ) : null}
    </View>
  );
}

/** First sentence of a description, for the list. */
function quickDescription(b: Bottleneck): string | undefined {
  const text = b.whatHappensToday ?? b.summary;
  if (!text) return undefined;
  const m = /^.*?[.!?](\s|$)/.exec(text);
  return (m ? m[0] : text).trim();
}

function BottleneckRow({ bottleneck: b, onPress }: { bottleneck: Bottleneck; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const meta = [
    formatHours(b.totalHours),
    b.annualCost !== undefined ? `${formatMoney(b.annualCost, true)}/yr` : undefined,
    b.feasibility ? `Fix: ${b.feasibility}` : undefined,
  ].filter(Boolean);
  const desc = quickDescription(b);
  const hasOptions = b.options.length > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${b.name}. ${hasOptions ? 'View solutions' : 'View details'}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        {
          backgroundColor: hovered || pressed ? c.inputBg : c.glass,
          borderColor: hovered ? c.inputBorder : c.glassBorder,
        },
      ]}
    >
      <View style={styles.rowTop}>
        {b.rank !== undefined ? (
          <View style={[styles.rank, { backgroundColor: c.buttonBg }]}>
            <Text style={[styles.rankText, { color: c.buttonText }]}>#{b.rank}</Text>
          </View>
        ) : null}
        <Text style={[styles.rowTitle, { color: c.text }]}>{b.name}</Text>
      </View>
      {meta.length ? <Muted style={styles.meta}>{meta.join(' · ')}</Muted> : null}
      {desc ? (
        <Text numberOfLines={2} style={[styles.body, { color: c.text }]}>{desc}</Text>
      ) : null}
      <Text style={[styles.cta, { color: c.primary }]}>
        {hasOptions ? `View ${b.options.length} solution${b.options.length === 1 ? '' : 's'} →` : 'View details →'}
      </Text>
    </Pressable>
  );
}

function BottleneckDetail({
  report,
  bottleneck: b,
  teamId,
  onBack,
  onClose,
  onSelectTeam,
}: {
  report: Report;
  bottleneck: Bottleneck;
  teamId: string;
  onBack: () => void;
  onClose: () => void;
  onSelectTeam: (teamId: string, bottleneckId?: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const others = b.teamIds
    .filter((id) => id !== teamId)
    .map((id) => report.teams.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const meta = [
    formatHours(b.totalHours),
    b.employees !== undefined ? `${formatCount(b.employees)} people` : undefined,
    b.annualCost !== undefined ? `${formatMoney(b.annualCost)}/yr` : undefined,
    b.feasibility ? `Fix: ${b.feasibility}` : undefined,
  ].filter(Boolean);
  const extraImpact = b.impact.filter((i) => /secondary|effect/i.test(i.label));
  const detailed = !!(b.whatHappensToday || b.rootCauses.length || b.options.length || b.recommendation);

  return (
    <View>
      <View style={styles.detailNav}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.back, { borderColor: c.inputBorder, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.backText, { color: c.text }]}>← All bottlenecks</Text>
        </Pressable>
        <CloseButton onPress={onClose} />
      </View>

      <Text style={[styles.detailTitle, { color: c.text }]}>
        {b.rank !== undefined ? <Text style={{ color: c.primary }}>#{b.rank} </Text> : null}
        {b.name}
      </Text>
      {meta.length ? <Muted style={styles.meta}>{meta.join(' · ')}</Muted> : null}

      {others.length ? (
        <View style={styles.sharedRow}>
          <Muted>Also affects</Muted>
          {others.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onSelectTeam(t.id, b.id)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.teamLink, { borderColor: c.inputBorder, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.small, { color: c.primary, fontWeight: '700' }]}>{t.name} →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {b.whatHappensToday ? (
        <>
          <SubTitle>What happens today</SubTitle>
          <Text style={[styles.body, { color: c.text }]}>{b.whatHappensToday}</Text>
        </>
      ) : null}
      {extraImpact.map((i) => (
        <Text key={i.label} style={[styles.body, { color: c.text, marginTop: 6 }]}>
          <Text style={{ fontWeight: '700' }}>{i.label}: </Text>
          {i.value}
        </Text>
      ))}

      {b.rootCauses.length ? (
        <>
          <SubTitle>Root causes</SubTitle>
          {b.rootCauses.map((r, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: c.primary }]}>✦</Text>
              <Text style={[styles.body, styles.flex, { color: c.text }]}>{r}</Text>
            </View>
          ))}
        </>
      ) : null}

      {b.options.length ? (
        <>
          <SubTitle>Solution options</SubTitle>
          <View style={styles.options}>
            {b.options.map((o) => (
              <OptionCard key={o.letter} option={o} />
            ))}
          </View>
        </>
      ) : null}

      {b.recommendation ? (
        <View style={[styles.recommendation, { borderColor: c.primary, backgroundColor: c.inputBg }]}>
          <Text style={[styles.subTitle, styles.noTop, { color: c.text }]}>Recommendation</Text>
          <Text style={[styles.body, { color: c.text }]}>{b.recommendation}</Text>
        </View>
      ) : null}

      {!detailed ? (
        <Muted style={styles.note}>
          This bottleneck was measured in the report but not analyzed in detail, so no solution options were
          listed for it.
        </Muted>
      ) : null}
    </View>
  );
}

const SPECIAL = /^(type|how it solves|example vendors|vendors|key risks|risks)/i;

function cleanLabel(label: string): string {
  return label
    .replace(/^est\.?\s*/i, '')
    .replace(/\s*\(\$ per year\)/i, ' / yr')
    .replace(/\s*\(\$\)/, '')
    .replace(/\s*\((low|high)[^)]*\)/i, '')
    .replace(/^data \/ ai /i, 'AI ')
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

function OptionCard({ option: o }: { option: SolutionOption }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const grid = o.rows.filter((r) => !SPECIAL.test(r.label));
  return (
    <View
      style={[
        styles.option,
        {
          backgroundColor: c.inputBg,
          borderColor: o.recommended ? c.primary : c.inputBorder,
          borderWidth: o.recommended ? 2 : 1,
        },
      ]}
    >
      <View style={styles.optionTop}>
        <Muted>Option {o.letter}</Muted>
        {o.recommended ? (
          <View style={[styles.badge, { backgroundColor: c.buttonBg }]}>
            <Text style={[styles.badgeText, { color: c.buttonText }]}>Recommended</Text>
          </View>
        ) : o.alsoSuggested ? (
          <View style={[styles.badge, { borderColor: c.primary, borderWidth: 1 }]}>
            <Text style={[styles.badgeText, { color: c.primary }]}>Also suggested</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.optionName, { color: c.text }]}>{o.name}</Text>
      {o.type ? <Pill text={o.type} /> : null}
      {o.howItSolves ? <Text style={[styles.body, { color: c.text }]}>{o.howItSolves}</Text> : null}
      {grid.length ? (
        <View style={styles.grid}>
          {grid.map((r) => (
            <View key={r.label} style={styles.gridCell}>
              <Muted style={styles.gridLabel}>{cleanLabel(r.label)}</Muted>
              <Text style={[styles.gridValue, { color: c.text }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {o.vendors ? (
        <Text style={[styles.small, { color: c.text }]}>
          <Text style={{ fontWeight: '700' }}>Examples: </Text>
          {o.vendors}
        </Text>
      ) : null}
      {o.risks ? (
        <Text style={[styles.small, { color: c.text, marginTop: 4 }]}>
          <Text style={{ fontWeight: '700' }}>Risks: </Text>
          {o.risks}
        </Text>
      ) : null}
    </View>
  );
}

function MenuHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Muted style={styles.eyebrow}>{eyebrow}</Muted>
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      </View>
      <CloseButton onPress={onClose} />
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close and return to the map"
      hitSlop={10}
      style={({ pressed }) => [styles.close, { borderColor: c.glassBorder, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.closeText, { color: c.text }]}>✕</Text>
    </Pressable>
  );
}

function Pill({ text }: { text: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.pill, { borderColor: c.inputBorder, backgroundColor: c.glass }]}>
      <Text style={[styles.pillText, { color: c.text }]}>{text}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.section, { color: theme.colors.text }]}>{children}</Text>;
}

function SubTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.subTitle, { color: theme.colors.text }]}>{children}</Text>;
}

function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  const { theme } = useTheme();
  return <Text style={[styles.small, { color: theme.colors.mutedText }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontFamily: fonts.display, fontSize: 28, marginTop: 2 },
  statsLine: { marginTop: 4 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14, fontWeight: '700' },
  section: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  row: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  rankText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  rowTitle: { flex: 1, fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 2 },
  cta: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', marginTop: 4 },
  note: { marginTop: 6 },
  detailNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  back: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  backText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  detailTitle: { fontFamily: fonts.body, fontSize: 19, fontWeight: '700' },
  sharedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  teamLink: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  subTitle: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  noTop: { marginTop: 0 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  bullet: { fontSize: 11, lineHeight: 20 },
  options: { gap: 10, marginTop: 4 },
  option: { borderRadius: 12, padding: 12, gap: 6 },
  optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  optionName: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 4, marginBottom: 2 },
  gridCell: { width: '50%', paddingRight: 8 },
  gridLabel: { fontSize: 11 },
  gridValue: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  recommendation: { borderLeftWidth: 3, borderRadius: 10, padding: 12, marginTop: 14, gap: 4 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '600' },
});
