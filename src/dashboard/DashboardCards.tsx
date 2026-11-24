import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassCard } from '../components/Glass';
import { ChatWindow } from '../components/ChatWindow';
import type { TabName } from '../components/Sidebar';
import { BarList, DonutChart, LineChart, PairedBarList } from '../charts/Charts';
import { useAiConfig } from '../settings/AiConfigContext';
import { folderProvider, useDataFolder } from '../settings/DataFolderContext';
import { useReport } from '../report/ReportContext';
import { formatCount, formatHours, formatMoney } from '../report/format';
import { feasibilityLevel } from '../report/filters';
import { costByTeam, planSummary, sumOf } from '../report/solutions';
import type { Bottleneck, Report } from '../report/types';
import { CARD_BY_ID, cardIdOf, type CardId, type LayoutKey } from './cards';
import { EMPLOYEE_SCOPE } from './employeeCardConfig';
import { EmployeeCard } from './EmployeeCard';
import { NotesCard } from './NotesCard';


/** Report totals, falling back to adding up the bottlenecks when the report has no totals table. */
function totals(r: Report) {
  return {
    annualCost: r.totals.annualCost ?? sumOf(r.bottlenecks.map((b) => b.annualCost)),
    hoursPerWeek: r.totals.hoursPerWeek ?? sumOf(r.bottlenecks.map((b) => b.totalHours)),
    employees: r.totals.employees ?? sumOf(r.teams.map((t) => t.employeesAffected ?? t.headcount)),
  };
}

function byCost(a: Bottleneck, b: Bottleneck) {
  return (b.annualCost ?? -1) - (a.annualCost ?? -1) || (a.rank ?? 99) - (b.rank ?? 99);
}

const money = (v: number | undefined) => formatMoney(v, true);
const signedMoney = (v: number) => (v < 0 ? `−${money(-v)}` : (money(v) ?? ''));
const pctOf = (v: number, total: number | undefined) => (total ? `${Math.round((v / total) * 100)}%` : undefined);

/** Team names for a bottleneck, or the report's own departments text. */
function teamsOf(b: Bottleneck, r: Report): string | undefined {
  const names = b.teamIds.map((id) => r.teams.find((tm) => tm.id === id)?.name).filter(Boolean);
  return names.length ? names.join(', ') : b.departmentsText;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Tappable card shell. Number tiles get a small uppercase label; charts get a title. */
function Frame({
  id,
  kind,
  title,
  onPress,
  children,
}: {
  id: CardId;
  kind: 'kpi' | 'chart';
  title?: string;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const label = title ?? CARD_BY_ID[id].title;
  // The card keeps its grid size; anything taller scrolls inside it.
  const card = (
    <GlassCard style={[styles.fill, styles.noPad]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={kind === 'kpi' ? styles.kpi : styles.chart}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Text
          numberOfLines={1}
          style={[kind === 'kpi' ? styles.kpiLabel : styles.chartTitle, { color: kind === 'kpi' ? c.mutedText : c.text }]}
        >
          {label}
        </Text>
        {children}
      </ScrollView>
    </GlassCard>
  );
  if (!onPress) return card;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fill, { opacity: pressed ? 0.88 : 1 }]}
    >
      {card}
    </Pressable>
  );
}

function Kpi({ value, caption }: { value: string | undefined; caption?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View>
      <Text numberOfLines={1} style={[styles.kpiValue, { color: value === undefined ? c.placeholder : c.text }]}>
        {value ?? '—'}
      </Text>
      {caption ? (
        <Text numberOfLines={2} style={[styles.caption, { color: c.mutedText }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.body, { color: theme.colors.mutedText }]}>{children}</Text>;
}

function Row({ name, value }: { name: string; value?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[styles.rowName, { color: c.text }]}>
        {name}
      </Text>
      {value ? <Text style={[styles.rowValue, { color: c.mutedText }]}>{value}</Text> : null}
    </View>
  );
}

function Pill({ text }: { text: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.pill, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
      <Text style={[styles.pillText, { color: c.accent }]}>{text}</Text>
    </View>
  );
}

export function DashboardCard({ id: layoutKey, onNavigate }: { id: LayoutKey; onNavigate: (tab: TabName) => void }) {
  const id = cardIdOf(layoutKey);
  const scope = EMPLOYEE_SCOPE[id];
  if (scope) return <EmployeeCard cardKey={layoutKey} scope={scope} />;
  if (id === 'notes') return <NotesCard cardKey={layoutKey} />;
  return <ReportCard id={id} onNavigate={onNavigate} />;
}

function ReportCard({ id, onNavigate }: { id: CardId; onNavigate: (tab: TabName) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { report } = useReport();
  const { savedAi } = useAiConfig();
  const { folderUrl } = useDataFolder();
  const kind = CARD_BY_ID[id].size === '1x1' ? 'kpi' : 'chart';

  if (id === 'chat') {
    return (
      <View style={styles.fill}>
        <ChatWindow apiKey={savedAi.apiKey} model={savedAi.model} fill />
      </View>
    );
  }

  if (id === 'dataSource') {
    const provider = folderUrl ? folderProvider(folderUrl) : null;
    return (
      <Frame
        id={id}
        kind="kpi"
        onPress={folderUrl ? () => Linking.openURL(folderUrl).catch(() => {}) : () => onNavigate('settings')}
      >
        {folderUrl ? (
          <View>
            <Text numberOfLines={1} style={[styles.kpiValueText, { color: c.text }]}>
              {provider ?? 'Linked'}
            </Text>
            <Text style={[styles.caption, { color: c.primary }]}>Open folder ↗</Text>
          </View>
        ) : (
          <Muted>Add a CSV folder link in Settings.</Muted>
        )}
      </Frame>
    );
  }

  if (!report) {
    return (
      <Frame id={id} kind={kind} onPress={() => onNavigate('report')}>
        {kind === 'kpi' ? (
          <Kpi value={undefined} caption="Import a report" />
        ) : (
          <Muted>Import a report on the Report tab.</Muted>
        )}
      </Frame>
    );
  }

  const toReport = () => onNavigate('report');
  const toSolutions = () => onNavigate('solutions');
  const t = totals(report);
  const s = planSummary(report);

  switch (id) {
    case 'recommendedFixes':
      return (
        <Frame id={id} kind="kpi" title={`${s.planWord} solutions`} onPress={toSolutions}>
          <Kpi value={String(s.plan.length)} />
        </Frame>
      );
    case 'upfront':
      return (
        <Frame id={id} kind="kpi" onPress={toSolutions}>
          <Kpi value={money(s.upfront)} />
        </Frame>
      );
    case 'savings':
      return (
        <Frame id={id} kind="kpi" onPress={toSolutions}>
          <Kpi value={money(s.savings)} />
        </Frame>
      );
    case 'payback':
      return (
        <Frame id={id} kind="kpi" onPress={toSolutions}>
          <Kpi
            value={s.payback === undefined ? undefined : s.payback < 1 ? '< 1 mo' : `${Math.round(s.payback)} mo`}
          />
        </Frame>
      );
    case 'annualCost':
      return (
        <Frame id={id} kind="kpi" onPress={toReport}>
          <Kpi value={money(t.annualCost)} />
        </Frame>
      );
    case 'hoursLost':
      return (
        <Frame id={id} kind="kpi" title="Hours lost / week" onPress={toReport}>
          <Kpi value={formatCount(t.hoursPerWeek)} />
        </Frame>
      );
    case 'employees':
      return (
        <Frame id={id} kind="kpi" title="Employees affected" onPress={toReport}>
          <Kpi value={formatCount(t.employees)} />
        </Frame>
      );

    case 'costByBottleneck': {
      const bars = [...report.bottlenecks]
        .sort(byCost)
        .filter((b) => b.annualCost !== undefined)
        .slice(0, 6)
        .map((b) => ({
          key: b.id,
          label: b.name,
          value: b.annualCost!,
          display: money(b.annualCost),
          tip: [
            `${money(b.annualCost)} a year${t.annualCost ? ` · ${pctOf(b.annualCost!, t.annualCost)} of all bottleneck cost` : ''}`,
            b.totalHours !== undefined ? `${formatHours(b.totalHours)} lost` : undefined,
            teamsOf(b, report) ? `Teams: ${teamsOf(b, report)}` : undefined,
            feasibilityLevel(b.feasibility) ? `${feasibilityLevel(b.feasibility)} feasibility to fix` : undefined,
            b.options.length ? plural(b.options.length, 'solution') + ' in the report' : undefined,
          ].filter((l): l is string => !!l),
        }));
      return (
        <Frame id={id} kind="chart" onPress={toReport}>
          {bars.length ? <BarList data={bars} /> : <Muted>Not enough data in this report.</Muted>}
        </Frame>
      );
    }
    case 'costByTeam': {
      const slices = costByTeam(report).map((tm) => {
        const team = report.teams.find((x) => x.id === tm.id);
        const count = report.bottlenecks.filter((b) => b.teamIds.includes(tm.id)).length;
        return {
          key: tm.id,
          label: tm.name,
          value: tm.value,
          display: `${money(tm.value)}/yr`,
          tip: [
            team?.hoursLost !== undefined ? `${formatHours(team.hoursLost)} lost` : undefined,
            count ? `Affected by ${plural(count, 'bottleneck')}` : undefined,
            'Shared bottlenecks are split evenly between teams.',
          ].filter((l): l is string => !!l),
        };
      });
      return (
        <Frame id={id} kind="chart" onPress={toReport}>
          {slices.length ? (
            <DonutChart data={slices} centerValue={money(sumOf(slices.map((x) => x.value)))} centerLabel="per year" />
          ) : (
            <Muted>Not enough data in this report.</Muted>
          )}
        </Frame>
      );
    }
    case 'costVsSavings': {
      const pairs = s.plan
        .filter((r) => r.upfront !== undefined || r.savings !== undefined)
        .slice(0, 6)
        .map((r) => ({
          key: r.key,
          label: r.option.name,
          a: r.upfront ?? 0,
          b: r.savings ?? 0,
          aDisplay: money(r.upfront),
          bDisplay: money(r.savings),
          tip: [
            r.option.ongoingCost ? `Ongoing cost: ${r.option.ongoingCost}` : undefined,
            r.option.payback ? `Payback: ${r.option.payback}` : undefined,
            `Fixes: ${r.bottleneck.name}`,
          ].filter((l): l is string => !!l),
        }));
      return (
        <Frame id={id} kind="chart" title={`${s.planWord} plan: upfront cost vs. annual savings`} onPress={toSolutions}>
          {pairs.length ? (
            <PairedBarList data={pairs} aLabel="Upfront cost" bLabel="Annual savings" />
          ) : (
            <Muted>Not enough data in this report.</Muted>
          )}
        </Frame>
      );
    }
    case 'savingsCurve':
      return (
        <Frame id={id} kind="chart" title={`${s.planWord} plan: cumulative net savings`} onPress={toSolutions}>
          {s.curve.length ? (
            <LineChart
              points={s.curve.map((p) => ({ x: p.month, y: p.value }))}
              xTicks={[
                { x: 0, label: 'Now' },
                { x: 12, label: '1 yr' },
                { x: 24, label: '2 yr' },
                { x: 36, label: '3 yr' },
              ]}
              formatY={signedMoney}
              describe={(p) => ({
                title: p.x === 0 ? 'Today' : `After ${p.x} month${p.x === 1 ? '' : 's'}`,
                lines: [
                  `Net so far: ${signedMoney(p.y)}`,
                  p.y < 0 ? 'Still paying back the upfront cost' : 'Upfront cost paid back',
                  'Savings minus upfront and ongoing costs',
                ],
              })}
              marker={
                s.payback !== undefined && s.payback > 0
                  ? { x: s.payback, label: `Pays back ≈ ${Math.round(s.payback)} mo` }
                  : undefined
              }
            />
          ) : (
            <Muted>The report doesn&apos;t list annual savings for these solutions.</Muted>
          )}
        </Frame>
      );
    case 'teams': {
      const bars = report.teams
        .filter((tm) => tm.hoursLost !== undefined)
        .sort((a, b) => b.hoursLost! - a.hoursLost!)
        .slice(0, 5)
        .map((tm) => ({
          key: tm.id,
          label: tm.name,
          value: tm.hoursLost!,
          display: formatHours(tm.hoursLost),
          tip: [
            `${formatHours(tm.hoursLost)} lost${t.hoursPerWeek ? ` · ${pctOf(tm.hoursLost!, t.hoursPerWeek)} of the total` : ''}`,
            tm.employeesAffected !== undefined
              ? `${formatCount(tm.employeesAffected)}${tm.headcount !== undefined ? ` of ${formatCount(tm.headcount)}` : ''} people affected`
              : undefined,
            tm.pctTime ? `${tm.pctTime} of their time` : undefined,
            tm.bottleneckIds.length ? plural(tm.bottleneckIds.length, 'bottleneck') : undefined,
          ].filter((l): l is string => !!l),
        }));
      return (
        <Frame id={id} kind="chart" onPress={toReport}>
          {bars.length ? <BarList data={bars} /> : <Muted>No team hours in this report.</Muted>}
        </Frame>
      );
    }
    case 'topBottleneck': {
      const top = [...report.bottlenecks].sort(byCost)[0];
      return (
        <Frame id={id} kind="chart" onPress={toReport}>
          {top ? (
            <View style={styles.stack}>
              <Text numberOfLines={2} style={[styles.headline, { color: c.text }]}>
                {top.name}
              </Text>
              <View style={styles.pillRow}>
                {top.annualCost !== undefined ? <Pill text={`${money(top.annualCost)}/yr`} /> : null}
                {top.totalHours !== undefined ? <Pill text={formatHours(top.totalHours)!} /> : null}
                {feasibilityLevel(top.feasibility) ? (
                  <Pill text={`${feasibilityLevel(top.feasibility)} feasibility`} />
                ) : null}
              </View>
            </View>
          ) : (
            <Muted>No bottlenecks in this report.</Muted>
          )}
        </Frame>
      );
    }
    case 'quickWins': {
      const wins = report.bottlenecks
        .filter((b) => feasibilityLevel(b.feasibility) === 'High')
        .sort(byCost)
        .slice(0, 4);
      return (
        <Frame id={id} kind="chart" onPress={toReport}>
          {wins.length ? (
            <View style={styles.list}>
              {wins.map((b) => (
                <Row key={b.id} name={b.name} value={money(b.annualCost)} />
              ))}
            </View>
          ) : (
            <Muted>No high-feasibility fixes in this report.</Muted>
          )}
        </Frame>
      );
    }
    case 'reportInfo':
      return (
        <Frame id={id} kind="chart" onPress={toReport}>
          <View style={styles.stack}>
            <Text numberOfLines={1} style={[styles.headline, { color: c.text }]}>
              {report.client ?? report.title ?? report.fileName}
            </Text>
            <Muted>
              {[report.reportDate, report.preparedBy && `Prepared by ${report.preparedBy}`]
                .filter(Boolean)
                .join(' · ') || report.fileName}
            </Muted>
          </View>
        </Frame>
      );
    default:
      // Employee data cards are drawn by EmployeeCard.
      return null;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  noPad: { padding: 0 },
  kpi: { padding: 16, gap: 6 },
  kpiLabel: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  kpiValue: { fontFamily: fonts.display, fontSize: 28 },
  kpiValueText: { fontFamily: fonts.body, fontSize: 18, fontWeight: '700', marginTop: 4 },
  chart: { padding: 18, gap: 16 },
  chartTitle: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  caption: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  stack: { gap: 8 },
  headline: { fontFamily: fonts.body, fontSize: 18, fontWeight: '700', lineHeight: 23 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rowName: { flex: 1, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  rowValue: { fontFamily: fonts.body, fontSize: 13 },
});
