/**
 * Employees tab: a compact list of everyone (like the Bottlenecks tab). Tapping
 * someone opens their page: a day timeline of how their workday is spent, and
 * their basic data (time lost, deals, bottlenecks, team…). Uses SAMPLE data.
 */
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { sidebarWidthFor } from '../components/Sidebar';
import { DaySelector, useDaySelection, useKindColors } from '../employees/DaySelector';
import { formatMoney } from '../report/format';
import { EMP_TEAMS, EMPLOYEES, type DealStage, type MilestoneStatus, MONTHS } from '../employees/sampleData';
import { employeeStats, WORK_WEEKS, type EmployeeStats } from '../employees/stats';
import {
  ACTIVITY_KINDS,
  DAY_END,
  DAY_START,
  dayFor,
  type DayBlock,
  formatClock,
  formatMinutes,
  LUNCH_END,
  LUNCH_START,
  minutesByKind,
  typicalDay,
} from '../employees/dayTimeline';

const MAX_WIDTH = 1100;
const SIDE_PADDING = 16;
/** Below this content width each row stacks its numbers under the name. */
const TABLE_MIN_WIDTH = 720;

const money = (v: number) => formatMoney(v, true) ?? '—';

export function EmployeesScreen({
  employeeId,
  onSelect,
}: {
  employeeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  // Kept here (not in the list) so filters survive opening an employee and coming back.
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  if (employeeId && EMPLOYEES.some((e) => e.id === employeeId)) {
    return <EmployeeDetail key={employeeId} id={employeeId} onBack={() => onSelect(null)} />;
  }
  return <EmployeeList onSelect={onSelect} filters={filters} setFilters={setFilters} />;
}

// ------------------------------------------------------------------ list

type SortKey = 'hours' | 'cost' | 'deals' | 'name' | 'team';
type SortDir = 'asc' | 'desc';

const SORTS: { key: SortKey; label: string; /** Direction used when first chosen. */ dir: SortDir }[] = [
  { key: 'hours', label: 'Hours lost', dir: 'desc' },
  { key: 'cost', label: 'Est. cost', dir: 'desc' },
  { key: 'deals', label: 'Deals won', dir: 'desc' },
  { key: 'name', label: 'Name', dir: 'asc' },
  { key: 'team', label: 'Team', dir: 'asc' },
];

/** Minimum hours lost per week. */
const MIN_HOURS = [0, 3, 5, 8];

interface ListFilters {
  query: string;
  /** Empty = all teams. */
  teams: string[];
  minHours: number;
  sort: SortKey;
  dir: SortDir;
}

const DEFAULT_FILTERS: ListFilters = { query: '', teams: [], minHours: 0, sort: 'hours', dir: 'desc' };

function sortValue(s: EmployeeStats, key: SortKey): number | string {
  switch (key) {
    case 'hours':
      return s.hoursLostPerWeek;
    case 'cost':
      return s.costPerYear;
    case 'deals':
      return s.wonValue;
    case 'name':
      return s.employee.name;
    case 'team':
      return s.teamName;
  }
}

function applyFilters(all: EmployeeStats[], f: ListFilters): EmployeeStats[] {
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sign = f.dir === 'asc' ? 1 : -1;
  return all
    .filter((s) => {
      if (f.teams.length && !f.teams.includes(s.employee.teamId)) return false;
      if (s.hoursLostPerWeek < f.minHours) return false;
      const hay = `${s.employee.name} ${s.employee.role} ${s.teamName}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => {
      const va = sortValue(a, f.sort);
      const vb = sortValue(b, f.sort);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
      // Ties fall back to name, A–Z.
      return sign * cmp || a.employee.name.localeCompare(b.employee.name);
    });
}

function EmployeeList({
  onSelect,
  filters: f,
  setFilters,
}: {
  onSelect: (id: string) => void;
  filters: ListFilters;
  setFilters: React.Dispatch<React.SetStateAction<ListFilters>>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const available = windowWidth - sidebarWidthFor(windowWidth) - insets.left - insets.right;
  const table = Math.min(available, MAX_WIDTH) - SIDE_PADDING * 2 >= TABLE_MIN_WIDTH;

  const all = EMPLOYEES.map((e) => employeeStats(e.id));
  const list = applyFilters(all, f);
  const hours = list.reduce((s, x) => s + x.hoursLostPerWeek, 0);
  const cost = list.reduce((s, x) => s + x.costPerYear, 0);
  const filtered = !!(f.query.trim() || f.teams.length || f.minHours);

  const set = (patch: Partial<ListFilters>) => setFilters((prev) => ({ ...prev, ...patch }));
  /** Choosing the current sort flips its direction; a new sort starts in its natural direction. */
  const sortBy = (key: SortKey) =>
    setFilters((prev) =>
      prev.sort === key
        ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { ...prev, sort: key, dir: SORTS.find((s) => s.key === key)!.dir },
    );
  const toggleTeam = (id: string) =>
    set({ teams: f.teams.includes(id) ? f.teams.filter((t) => t !== id) : [...f.teams, id] });

  /** A column header that sorts the list. The active one shows ↑/↓; the others show a faint ↕. */
  const header = (key: SortKey, label: string, style: object | null) => {
    const on = f.sort === key;
    return (
      <Pressable
        onPress={() => sortBy(key)}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${label}${on ? `, ${f.dir === 'asc' ? 'ascending' : 'descending'}. Press to reverse` : ''}`}
        accessibilityState={{ selected: on }}
        style={({ hovered, pressed }: { pressed: boolean; hovered?: boolean }) => [
          style,
          styles.headCell,
          (hovered || pressed) && { backgroundColor: c.inputBg },
        ]}
      >
        <Text style={[styles.headText, { color: on ? c.text : c.mutedText }]} numberOfLines={1}>
          {label}
          <Text style={{ opacity: on ? 1 : 0.45 }}>{on ? (f.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</Text>
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: c.text }]}>Employees</Text>
      <Text style={[styles.subtitle, { color: c.mutedText }]}>
        {filtered ? `${list.length} of ${all.length}` : list.length} employees · {hours} h/wk lost · {money(cost)}/yr ·{' '}
        <Text style={{ color: c.accent }}>Sample data</Text>
      </Text>

      {/* ---- filters & sort ---- */}
      <View style={styles.filters}>
        <View style={[styles.search, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
          <Icon name="search" size={16} color={c.mutedText} />
          <TextInput
            value={f.query}
            onChangeText={(query) => set({ query })}
            placeholder="Search name or role"
            placeholderTextColor={c.placeholder}
            accessibilityLabel="Search employees"
            style={[styles.searchInput, { color: c.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
          {f.query ? (
            <Pressable onPress={() => set({ query: '' })} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <Icon name="close" size={14} color={c.mutedText} />
            </Pressable>
          ) : null}
        </View>

        <FilterGroup label="Team">
          <Chip label="All" on={!f.teams.length} onPress={() => set({ teams: [] })} />
          {EMP_TEAMS.map((t) => (
            <Chip key={t.id} label={t.name} on={f.teams.includes(t.id)} onPress={() => toggleTeam(t.id)} />
          ))}
        </FilterGroup>

        <FilterGroup label="Time lost">
          {MIN_HOURS.map((h) => (
            <Chip key={h} label={h ? `${h}+ h/wk` : 'Any'} on={f.minHours === h} onPress={() => set({ minHours: h })} />
          ))}
        </FilterGroup>

        {filtered ? (
          <Pressable
            onPress={() => setFilters((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort, dir: prev.dir }))}
            accessibilityRole="button"
            style={styles.clear}
            hitSlop={6}
          >
            <Text style={[styles.clearText, { color: c.primary }]}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      <GlassCard style={styles.tableCard}>
        {/* Column headers set the sort: press one to sort by it, press it again to reverse. */}
        {table ? (
          <View style={[styles.row, styles.headRow, { borderBottomColor: c.glassBorder }]}>
            {header('name', 'Employee', styles.colName)}
            {header('team', 'Team', styles.colTeam)}
            {header('hours', 'Lost / week', styles.colNumHead)}
            {header('cost', 'Est. cost / yr', styles.colNumHead)}
            {header('deals', 'Deals won', styles.colNumHead)}
            <View style={styles.colChevron} />
          </View>
        ) : (
          // Narrow screens have no columns, so the same sortable headers sit in one wrapping row.
          <View style={[styles.headRowStacked, { borderBottomColor: c.glassBorder }]}>
            {header('name', 'Name', null)}
            {header('team', 'Team', null)}
            {header('hours', 'Lost / week', null)}
            {header('cost', 'Est. cost', null)}
            {header('deals', 'Deals won', null)}
          </View>
        )}
        {list.map((s, i) => (
          <EmployeeRow key={s.employee.id} s={s} table={table} last={i === list.length - 1} onPress={() => onSelect(s.employee.id)} />
        ))}
        {!list.length ? (
          <Text style={[styles.body, styles.none, { color: c.mutedText }]}>No employees match these filters.</Text>
        ) : null}
      </GlassCard>
    </ScrollView>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.filterGroup}>
      <Text style={[styles.filterLabel, { color: c.mutedText }]}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: on }}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.segment,
        {
          borderColor: on || hovered ? c.primary : c.inputBorder,
          backgroundColor: on ? c.primary : c.inputBg,
        },
      ]}
    >
      <Text style={[styles.segmentText, { color: on ? c.buttonText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

function EmployeeRow({ s, table, last, onPress }: { s: EmployeeStats; table: boolean; last: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const border = last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.glassBorder };
  const won = s.wonValue ? money(s.wonValue) : '—';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${s.employee.name}, ${s.employee.role}, ${s.teamName}. ${s.hoursLostPerWeek} hours lost a week.`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !table && styles.rowStacked,
        border,
        (pressed || hovered) && { backgroundColor: c.inputBg },
      ]}
    >
      <View style={styles.colName}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {s.employee.name}
        </Text>
        <Text style={[styles.sub, { color: c.mutedText }]} numberOfLines={1}>
          {table ? s.employee.role : `${s.employee.role} · ${s.teamName}`}
        </Text>
        {!table ? (
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: c.text }]}>{s.hoursLostPerWeek} h/wk lost</Text>
            <Text style={[styles.meta, { color: c.text }]}>{money(s.costPerYear)}/yr</Text>
            {s.wonValue ? <Text style={[styles.meta, { color: c.text }]}>{won} won</Text> : null}
          </View>
        ) : null}
      </View>
      {table ? (
        <>
          <Text style={[styles.colTeam, styles.cell, { color: c.text }]} numberOfLines={1}>
            {s.teamName}
          </Text>
          <Text style={[styles.colNum, styles.num, { color: c.text }]}>{s.hoursLostPerWeek} h</Text>
          <Text style={[styles.colNum, styles.num, { color: c.text }]}>{money(s.costPerYear)}</Text>
          <Text style={[styles.colNum, styles.num, { color: c.text }]}>{won}</Text>
        </>
      ) : null}
      <View style={styles.colChevron}>
        <Icon name="chevron" size={16} color={c.mutedText} />
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------------ detail


function EmployeeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = employeeStats(id);

  const sel = useDaySelection();
  const blocks = sel.day ? dayFor(id, sel.day) : typicalDay(id);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={styles.back}>
        <View style={styles.flip}>
          <Icon name="chevron" size={16} color={c.primary} />
        </View>
        <Text style={[styles.backText, { color: c.primary }]}>All employees</Text>
      </Pressable>

      <Text style={[styles.title, { color: c.text }]}>{s.employee.name}</Text>
      <Text style={[styles.subtitle, { color: c.mutedText }]}>
        {s.employee.role} · {s.teamName} · <Text style={{ color: c.accent }}>Sample data</Text>
      </Text>

      {/* ---- day timeline ---- */}
      <GlassCard style={styles.card}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Day timeline</Text>
        <DaySelector sel={sel} />
        {blocks ? (
          <DayTimeline blocks={blocks} />
        ) : (
          <Text style={[styles.body, { color: c.mutedText }]}>No workday on a weekend. Pick a weekday.</Text>
        )}
      </GlassCard>

      {/* ---- basic data ---- */}
      <GlassCard style={styles.card}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Basic data</Text>
        <View style={styles.stats}>
          <Stat label="Team" value={s.teamName} sub={s.employee.role} />
          <Stat
            label="Time lost"
            value={`${s.hoursLostPerWeek} h/wk`}
            sub={`${Math.round(s.pctLost * 100)}% of a 40-hour week`}
          />
          <Stat
            label="Est. cost of lost time"
            value={`${money(s.costPerYear)}/yr`}
            sub={`At $${s.employee.hourlyCost}/hr · ${WORK_WEEKS} weeks`}
          />
          <Stat label="Deals won" value={s.wonValue ? money(s.wonValue) : '—'} sub={`${s.deals.filter((d) => d.stage === 'Won').length} of ${s.deals.length} deals`} />
          <Stat label="Open pipeline" value={s.openValue ? money(s.openValue) : '—'} sub={s.winRate !== undefined ? `${Math.round(s.winRate * 100)}% win rate` : 'No closed deals'} />
          <Stat label="Contributions" value={String(s.contributions6mo)} sub={`${MONTHS[0]}–${MONTHS[MONTHS.length - 1]}`} />
        </View>

        <Section title="Bottlenecks">
          {s.bottlenecks.length ? (
            s.bottlenecks.map((b) => (
              <ListRow key={b.name} name={b.name} values={[`${b.hoursPerWeek} h/wk`, `${money(b.costPerYear)}/yr`]} />
            ))
          ) : (
            <Text style={[styles.body, { color: c.mutedText }]}>No bottlenecks recorded.</Text>
          )}
        </Section>

        <Section title="Deals">
          {s.deals.length ? (
            s.deals.slice(0, 6).map((d) => (
              <ListRow key={d.id} name={d.name} meta={formatDate(d.closeDate)} values={[money(d.value)]} tag={d.stage} />
            ))
          ) : (
            <Text style={[styles.body, { color: c.mutedText }]}>No deals.</Text>
          )}
        </Section>

        <Section title="Projects">
          {s.projects.length ? (
            s.projects.map((p) => (
              <ListRow key={p.id} name={p.name} meta={`${MONTHS[p.start]}–${MONTHS[p.end]}`} values={[]} tag={p.status} />
            ))
          ) : (
            <Text style={[styles.body, { color: c.mutedText }]}>No projects.</Text>
          )}
        </Section>
      </GlassCard>

    </ScrollView>
  );
}

/** Horizontal 8am–5pm bar of the day's blocks, a legend with totals, and the full agenda as a list. */
function DayTimeline({ blocks }: { blocks: DayBlock[] }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useKindColors();
  const [active, setActive] = useState<number | null>(null);
  const span = DAY_END - DAY_START;
  const pct = (m: number) => `${((m - DAY_START) / span) * 100}%` as const;
  const totals = minutesByKind(blocks);
  const ticks = [8, 10, 12, 14, 16, 17].map((h) => h * 60);
  const a = active !== null ? blocks[active] : null;

  return (
    <View style={styles.timeline}>
      {/* Detail line for the hovered / tapped block. */}
      <Text style={[styles.detail, { color: a ? c.text : c.mutedText }]} numberOfLines={1}>
        {a
          ? `${formatClock(a.start)}–${formatClock(a.end)} · ${a.label} · ${ACTIVITY_KINDS.find((k) => k.key === a.kind)?.label} (${formatMinutes(a.end - a.start)})`
          : 'Hover or tap a block for details.'}
      </Text>

      <View style={[styles.bar, { backgroundColor: c.inputBg }]}>
        {/* Lunch: an empty, labeled gap. */}
        <View style={[styles.lunch, { left: pct(LUNCH_START), width: `${((LUNCH_END - LUNCH_START) / span) * 100}%` }]}>
          <Text style={[styles.lunchText, { color: c.mutedText }]}>Lunch</Text>
        </View>
        {blocks.map((b, i) => (
          <Pressable
            key={i}
            onHoverIn={() => setActive(i)}
            onHoverOut={() => setActive((x) => (x === i ? null : x))}
            onPress={() => setActive((x) => (x === i ? null : i))}
            accessibilityRole="button"
            accessibilityLabel={`${formatClock(b.start)} to ${formatClock(b.end)}, ${b.label}`}
            style={[styles.blockWrap, { left: pct(b.start), width: `${((b.end - b.start) / span) * 100}%` }]}
          >
            <View
              style={[
                styles.block,
                { backgroundColor: colors[b.kind] },
                active !== null && active !== i ? styles.dim : null,
              ]}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.ticks}>
        {ticks.map((t) => (
          <Text key={t} style={[styles.tick, { left: pct(t), color: c.mutedText }]}>
            {formatClock(t)}
          </Text>
        ))}
      </View>

      <View style={styles.legend}>
        {ACTIVITY_KINDS.map((k) => (
          <View key={k.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors[k.key] }]} />
            <Text style={[styles.legendText, { color: c.text }]}>{k.label}</Text>
            <Text style={[styles.legendText, { color: c.mutedText }]}>{formatMinutes(totals[k.key])}</Text>
          </View>
        ))}
      </View>

      {/* The same day as a list: the readable / accessible view of the chart. */}
      <View style={styles.agenda}>
        {blocks.map((b, i) => (
          <Pressable
            key={i}
            onHoverIn={() => setActive(i)}
            onHoverOut={() => setActive((x) => (x === i ? null : x))}
            onPress={() => setActive((x) => (x === i ? null : i))}
            style={[styles.agendaRow, active === i && { backgroundColor: c.inputBg }]}
          >
            <Text style={[styles.agendaTime, { color: c.mutedText }]}>
              {formatClock(b.start)}–{formatClock(b.end)}
            </Text>
            <View style={[styles.swatch, { backgroundColor: colors[b.kind] }]} />
            <Text style={[styles.agendaLabel, { color: c.text }]} numberOfLines={1}>
              {b.label}
            </Text>
            <Text style={[styles.agendaDur, { color: c.mutedText }]}>{formatMinutes(b.end - b.start)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.stat, { borderColor: c.glassBorder }]}>
      <Text style={[styles.statLabel, { color: c.mutedText }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.text }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.statSub, { color: c.mutedText }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.mutedText }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const TAG_TONE: Record<DealStage | MilestoneStatus, 'good' | 'bad' | 'info' | 'muted'> = {
  Won: 'good',
  Done: 'good',
  Lost: 'bad',
  Late: 'bad',
  'At risk': 'bad',
  Negotiation: 'info',
  'On track': 'info',
  Proposal: 'muted',
};

function ListRow({
  name,
  meta,
  values,
  tag,
}: {
  name: string;
  meta?: string;
  values: string[];
  tag?: DealStage | MilestoneStatus;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const tone = tag ? TAG_TONE[tag] : null;
  const tagColor = tone === 'good' ? c.success : tone === 'bad' ? c.danger : tone === 'info' ? c.primary : c.mutedText;
  return (
    <View style={styles.listRow}>
      <View style={styles.flex}>
        <Text style={[styles.listName, { color: c.text }]} numberOfLines={1}>
          {name}
        </Text>
        {meta ? <Text style={[styles.sub, { color: c.mutedText }]}>{meta}</Text> : null}
      </View>
      {values.map((v) => (
        <Text key={v} style={[styles.num, { color: c.text }]}>
          {v}
        </Text>
      ))}
      {tag ? <Text style={[styles.tag, { color: tagColor, borderColor: tagColor }]}>{tag}</Text> : null}
    </View>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: SIDE_PADDING,
    paddingTop: 24,
    paddingBottom: 48,
  },
  title: { fontFamily: fonts.display, fontSize: 32, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, marginTop: 4, marginBottom: 20 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },

  // list
  tableCard: { paddingVertical: 4, paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowStacked: { alignItems: 'flex-start' },
  headRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  colName: { flex: 1, minWidth: 0, gap: 2 },
  colTeam: { width: 140 },
  colNum: { width: 110, textAlign: 'right' },
  colNumHead: { width: 110, alignItems: 'flex-end' },
  headCell: { paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 6 },
  headRowStacked: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 18,
    rowGap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  none: { padding: 16 },
  filters: { gap: 12, marginBottom: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    maxWidth: 420,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, paddingVertical: 9 },
  filterGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  filterLabel: {
    width: 72,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  clear: { alignSelf: 'flex-start' },
  clearText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  colChevron: { width: 20, alignItems: 'flex-end', alignSelf: 'center' },
  name: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
  sub: { fontFamily: fonts.body, fontSize: 12 },
  cell: { fontFamily: fonts.body, fontSize: 14 },
  num: { fontFamily: fonts.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 4 },
  meta: { fontFamily: fonts.body, fontSize: 13, fontVariant: ['tabular-nums'] },

  // detail
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10, paddingVertical: 4 },
  backText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  flip: { transform: [{ rotate: '180deg' }] },
  card: { marginBottom: 18, gap: 14 },
  cardTitle: { fontFamily: fonts.body, fontSize: 19, fontWeight: '700' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segment: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  segmentText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: fonts.body, fontSize: 13 },
  step: { borderWidth: 1, borderRadius: 8, padding: 6 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  caption: { fontFamily: fonts.body, fontSize: 13, marginTop: -4 },

  timeline: { gap: 10 },
  detail: { fontFamily: fonts.body, fontSize: 13, fontVariant: ['tabular-nums'] },
  bar: { height: 40, borderRadius: 6, position: 'relative' },
  // 1px inset each side gives the 2px gap between neighboring blocks.
  blockWrap: { position: 'absolute', top: 0, bottom: 0, paddingHorizontal: 1 },
  block: { flex: 1, borderRadius: 4 },
  dim: { opacity: 0.35 },
  lunch: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  lunchText: { fontFamily: fonts.body, fontSize: 10 },
  ticks: { height: 16, position: 'relative', marginTop: -4 },
  tick: { position: 'absolute', fontFamily: fonts.body, fontSize: 11, width: 44, marginLeft: -22, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.body, fontSize: 12.5 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  agenda: { gap: 2, marginTop: 4 },
  agendaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6 },
  agendaTime: { width: 118, fontFamily: fonts.body, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  agendaLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  agendaDur: { fontFamily: fonts.body, fontSize: 12.5, fontVariant: ['tabular-nums'] },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: 160, borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { fontFamily: fonts.display, fontSize: 22 },
  statSub: { fontFamily: fonts.body, fontSize: 12 },
  section: { gap: 8, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  sectionBody: { gap: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listName: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  tag: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 84,
    textAlign: 'center',
  },
});
