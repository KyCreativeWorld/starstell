import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { useReport } from '../report/ReportContext';
import { formatHours, formatMoney } from '../report/format';
import type { Report } from '../report/types';
import { solutionKey } from '../report/solutions';
import { initials, useProfile } from '../settings/ProfileContext';
import { Icon } from './Icon';
import { EMPLOYEES } from '../employees/sampleData';
import type { TabName } from './Sidebar';

export const HEADER_HEIGHT = 60;

/** Where a search result takes you. */
export interface SearchTarget {
  tab: TabName;
  teamId?: string;
  bottleneckId?: string;
  /** Solution to scroll to on the Solutions tab. */
  solutionKey?: string;
  /** Employee page to open on the Employees tab. */
  employeeId?: string;
}

interface SearchResult {
  key: string;
  kind: string;
  label: string;
  detail?: string;
  target: SearchTarget;
}

const PAGES: SearchResult[] = [
  { key: 'p-dash', kind: 'Page', label: 'Dashboard', target: { tab: 'home' } },
  { key: 'p-report', kind: 'Page', label: 'Report', detail: 'Constellation, line-up and PDF', target: { tab: 'report' } },
  { key: 'p-bottlenecks', kind: 'Page', label: 'Bottlenecks', detail: 'Every bottleneck at a glance', target: { tab: 'bottlenecks' } },
  { key: 'p-employees', kind: 'Page', label: 'Employees', detail: 'Day timelines, time lost and deals', target: { tab: 'employees' } },
  { key: 'p-timelines', kind: 'Page', label: 'Timelines', detail: 'Average workday by team', target: { tab: 'timelines' } },
  ...EMPLOYEES.map((e) => ({
    key: `e-${e.id}`,
    kind: 'Employee',
    label: e.name,
    detail: e.role,
    target: { tab: 'employees' as const, employeeId: e.id },
  })),
  { key: 'p-solutions', kind: 'Page', label: 'Solutions', detail: 'Charts and every solution option', target: { tab: 'solutions' } },
  { key: 'p-audit', kind: 'Page', label: 'Audit', detail: 'Audits, checklists and findings', target: { tab: 'audit' } },
  { key: 'p-settings', kind: 'Page', label: 'Settings', detail: 'AI model, report data, Salesforce, profile', target: { tab: 'settings' } },
  { key: 'p-folder', kind: 'Setting', label: 'Data folder link', detail: 'CSV files for the report', target: { tab: 'settings' } },
  { key: 'p-ai', kind: 'Setting', label: 'AI API key', target: { tab: 'settings' } },
  { key: 'p-profile', kind: 'Setting', label: 'Profile', detail: 'Your name and role', target: { tab: 'settings' } },
];

function buildIndex(report: Report | null): SearchResult[] {
  if (!report) return PAGES;
  const items: SearchResult[] = [];
  for (const t of report.teams) {
    items.push({
      key: `t-${t.id}`,
      kind: 'Team',
      label: t.name,
      detail: formatHours(t.hoursLost),
      target: { tab: 'report', teamId: t.id },
    });
  }
  for (const b of report.bottlenecks) {
    const teamId = b.teamIds[0];
    items.push({
      key: `b-${b.id}`,
      kind: 'Bottleneck',
      label: b.name,
      detail: [formatMoney(b.annualCost, true) && `${formatMoney(b.annualCost, true)}/yr`, b.departmentsText]
        .filter(Boolean)
        .join(' · '),
      target: teamId ? { tab: 'report', teamId, bottleneckId: b.id } : { tab: 'report' },
    });
    for (const o of b.options) {
      items.push({
        key: `o-${b.id}-${o.letter}`,
        kind: o.recommended ? 'Recommended fix' : 'Solution',
        label: o.name,
        detail: b.name,
        target: { tab: 'solutions', solutionKey: solutionKey(b, o) },
      });
    }
  }
  return [...items, ...PAGES];
}

function search(index: SearchResult[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return index
    .map((r) => {
      const hay = `${r.label} ${r.detail ?? ''} ${r.kind}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const label = r.label.toLowerCase();
      const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2;
      return { r, score };
    })
    .filter((x): x is { r: SearchResult; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((x) => x.r);
}

/** Top bar: search, settings, profile. Renders its results dropdown over the page below. */
export function AppHeader({
  onNavigate,
  compact,
}: {
  onNavigate: (target: SearchTarget) => void;
  compact: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { report } = useReport();
  const { profile } = useProfile();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);

  const index = useMemo(() => buildIndex(report), [report]);
  const results = useMemo(() => search(index, query), [index, query]);
  const showResults = focused && query.trim().length > 0;

  const choose = (r: SearchResult) => {
    setQuery('');
    setFocused(false);
    onNavigate(r.target);
  };

  const userInitials = initials(profile.name);

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            height: HEADER_HEIGHT + insets.top,
            paddingTop: insets.top,
            paddingRight: insets.right + (compact ? 12 : 24),
            paddingLeft: compact ? 12 : 24,
            backgroundColor: c.panel,
            borderBottomColor: c.glassBorder,
          },
        ]}
      >
        <View
          style={[styles.search, { backgroundColor: c.inputBg, borderColor: focused ? c.primary : c.inputBorder }]}
        >
          <View style={styles.noShrink}>
            <Icon name="search" size={18} color={c.mutedText} />
          </View>
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setActive(0);
            }}
            onFocus={() => setFocused(true)}
            // Let a tap on a result land before the list closes.
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => results[active] && choose(results[active])}
            onKeyPress={(e) => {
              const key = e.nativeEvent.key;
              if (key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
              else if (key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
              else if (key === 'Escape') setQuery('');
            }}
            placeholder={compact ? 'Search' : 'Search teams, bottlenecks, solutions…'}
            placeholderTextColor={c.placeholder}
            accessibilityLabel="Search"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, { color: c.text }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <Icon name="close" size={16} color={c.mutedText} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.spacer} />

        <Pressable
          onPress={() => onNavigate({ tab: 'settings' })}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.iconButton,
            { backgroundColor: pressed || hovered ? c.inputBg : 'transparent' },
          ]}
        >
          <Icon name="settings" size={21} color={c.mutedText} />
        </Pressable>

        <Pressable
          onPress={() => setProfileOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={profile.name ? `Profile: ${profile.name}` : 'Profile'}
          style={({ pressed }) => [styles.avatarButton, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Avatar initials={userInitials} />
        </Pressable>
      </View>

      {showResults ? (
        <View
          style={[
            styles.results,
            {
              top: HEADER_HEIGHT + insets.top - 6,
              left: compact ? 12 : 24,
              ...(compact ? { right: 12 } : { width: 480 }),
              backgroundColor: c.menu,
              borderColor: c.glassBorder,
              shadowColor: c.shadow,
            },
          ]}
        >
          {results.length ? (
            results.map((r, i) => (
              <Pressable
                key={r.key}
                onPress={() => choose(r)}
                accessibilityRole="button"
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.result,
                  { backgroundColor: pressed || hovered || i === active ? c.inputBg : 'transparent' },
                ]}
              >
                <View style={styles.resultText}>
                  <Text numberOfLines={1} style={[styles.resultLabel, { color: c.text }]}>
                    {r.label}
                  </Text>
                  {r.detail ? (
                    <Text numberOfLines={1} style={[styles.resultDetail, { color: c.mutedText }]}>
                      {r.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.resultKind, { color: c.primary }]}>{r.kind}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={[styles.noResults, { color: c.mutedText }]}>
              {report ? 'No matches.' : 'No matches. Import a report to search its teams and bottlenecks.'}
            </Text>
          )}
        </View>
      ) : null}

      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={() => setProfileOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setProfileOpen(false)} accessibilityLabel="Close menu" />
        <View
          style={[
            styles.profileMenu,
            {
              top: insets.top + HEADER_HEIGHT - 4,
              right: insets.right + (compact ? 12 : 24),
              backgroundColor: c.menu,
              borderColor: c.glassBorder,
              shadowColor: c.shadow,
            },
          ]}
        >
          <View style={styles.profileHead}>
            <Avatar initials={userInitials} size={44} />
            <View style={styles.resultText}>
              <Text numberOfLines={1} style={[styles.profileName, { color: c.text }]}>
                {profile.name || 'Your profile'}
              </Text>
              <Text numberOfLines={1} style={[styles.resultDetail, { color: c.mutedText }]}>
                {profile.role || (profile.name ? 'Starstell' : 'Add your name in Settings')}
              </Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: c.glassBorder }]} />
          <Pressable
            onPress={() => {
              setProfileOpen(false);
              onNavigate({ tab: 'settings' });
            }}
            accessibilityRole="menuitem"
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.menuItem,
              { backgroundColor: pressed || hovered ? c.inputBg : 'transparent' },
            ]}
          >
            <Icon name="user" size={18} color={c.mutedText} />
            <Text style={[styles.menuItemText, { color: c.text }]}>Edit profile</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setProfileOpen(false);
              onNavigate({ tab: 'settings' });
            }}
            accessibilityRole="menuitem"
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.menuItem,
              { backgroundColor: pressed || hovered ? c.inputBg : 'transparent' },
            ]}
          >
            <Icon name="settings" size={18} color={c.mutedText} />
            <Text style={[styles.menuItemText, { color: c.text }]}>Settings</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** Round profile picture: initials on the theme color, or a person outline when no name is set. */
export function Avatar({ initials: text, size = 36 }: { initials: string; size?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.sidebar, borderColor: c.glassBorder },
      ]}
    >
      {text ? (
        <Text style={[styles.avatarText, { color: c.sidebarText, fontSize: size * 0.38 }]}>{text}</Text>
      ) : (
        <Icon name="user" size={size * 0.55} color={c.sidebarText} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  noShrink: { flexShrink: 0 },
  search: {
    width: 480,
    flexShrink: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.body,
    fontSize: 14,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
  },
  spacer: { flex: 1 },
  iconButton: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  avatarButton: { marginLeft: 4 },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  avatarText: { fontFamily: fonts.body, fontWeight: '700', letterSpacing: 0.5 },
  results: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    zIndex: 30,
    elevation: 12,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10 },
  resultText: { flex: 1 },
  resultLabel: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  resultDetail: { fontFamily: fonts.body, fontSize: 12, marginTop: 1 },
  resultKind: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  noResults: { fontFamily: fonts.body, fontSize: 13, padding: 12 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.08)' },
  profileMenu: {
    position: 'absolute',
    width: 260,
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  profileName: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  divider: { height: 1, marginVertical: 4, marginHorizontal: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 10 },
  menuItemText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
});
