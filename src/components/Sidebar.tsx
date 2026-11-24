import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { Icon, type IconName } from './Icon';
import { ThemePicker } from './ThemePicker';
import { AUDIT_PAGES, type AuditPage } from '../audit/auditPages';

export type TabName = 'home' | 'report' | 'bottlenecks' | 'employees' | 'timelines' | 'solutions' | 'audit' | 'settings';

const TABS: { name: TabName; label: string; icon: IconName }[] = [
  { name: 'home', label: 'Dashboard', icon: 'dashboard' },
  { name: 'report', label: 'Report', icon: 'report' },
  { name: 'bottlenecks', label: 'Bottlenecks', icon: 'bottleneck' },
  { name: 'employees', label: 'Employees', icon: 'people' },
  { name: 'timelines', label: 'Timelines', icon: 'timeline' },
  { name: 'solutions', label: 'Solutions', icon: 'solutions' },
  { name: 'audit', label: 'Audit', icon: 'audit' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export const SIDEBAR_WIDTH = 96;
export const SIDEBAR_RAIL_WIDTH = 78;
/** Below this window width the sidebar narrows (smaller icons and labels). */
export const SIDEBAR_COLLAPSE_BELOW = 900;

/** Sidebar width (without safe-area inset) at a given window width. */
export function sidebarWidthFor(windowWidth: number): number {
  return windowWidth < SIDEBAR_COLLAPSE_BELOW ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;
}

/** Left navigation rail: large icons with their names underneath, then the theme picker. */
export function Sidebar({
  tab,
  onChange,
  compact,
  auditPage,
  onAuditPage,
}: {
  tab: TabName;
  onChange: (tab: TabName) => void;
  compact: boolean;
  auditPage: AuditPage;
  onAuditPage: (page: AuditPage) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const width = (compact ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH) + insets.left;
  const [auditOpen, setAuditOpen] = useState(tab === 'audit');

  // Up/Down arrow keys step through the tab list (web, where there's a keyboard).
  // With the audit dropdown open, its pages are steps in the list in place of "Audit".
  const latest = useRef({ tab, auditPage, auditOpen, onChange, onAuditPage });
  useEffect(() => {
    latest.current = { tab, auditPage, auditOpen, onChange, onAuditPage };
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Leave arrows alone while typing (search box, form fields).
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

      const s = latest.current;
      const steps: { tab: TabName; page?: AuditPage }[] = TABS.flatMap((t) =>
        t.name === 'audit' && s.auditOpen
          ? AUDIT_PAGES.map((p) => ({ tab: 'audit' as const, page: p.key }))
          : [{ tab: t.name }],
      );
      const current = steps.findIndex((st) => st.tab === s.tab && (!st.page || st.page === s.auditPage));
      const next = steps[current + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      if (next.page) s.onAuditPage(next.page);
      s.onChange(next.tab);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <View
      style={[
        styles.bar,
        {
          width,
          backgroundColor: c.sidebar,
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + 14,
          paddingLeft: insets.left + (compact ? 6 : 8),
          paddingRight: compact ? 6 : 8,
        },
      ]}
    >
      <Pressable
        onPress={() => onChange('home')}
        accessibilityRole="link"
        accessibilityLabel="Starstell home"
        style={styles.brand}
      >
        <Text style={[styles.wordmark, { color: c.sidebarText }]}>S</Text>
      </Pressable>

      {/* Scrolls when the open audit dropdown makes the list taller than the screen. */}
      <ScrollView
        style={styles.nav}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
        accessibilityRole="tablist"
      >
        {TABS.map((t) => {
          const active = t.name === tab;
          const color = active ? c.sidebarText : c.sidebarMuted;
          const isAudit = t.name === 'audit';
          return (
            <React.Fragment key={t.name}>
            <Pressable
              onPress={() => {
                if (isAudit) {
                  // Opening the dropdown goes to the audit page last shown; tapping again collapses it.
                  if (auditOpen && active) setAuditOpen(false);
                  else {
                    setAuditOpen(true);
                    onChange('audit');
                  }
                } else onChange(t.name);
              }}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={isAudit ? { selected: active, expanded: auditOpen } : { selected: active }}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.item,
                { backgroundColor: active || pressed || hovered ? c.sidebarActive : 'transparent' },
              ]}
            >
              {active ? <View style={[styles.indicator, { backgroundColor: c.sidebarText }]} /> : null}
              <Icon name={t.icon} color={color} size={compact ? 24 : 28} />
              <Text
                style={[styles.itemText, compact && styles.itemTextCompact, { color, fontWeight: active ? '700' : '600' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t.label}
              </Text>
              {isAudit ? (
                <View style={[styles.caret, auditOpen && styles.caretOpen]}>
                  <Icon name="chevron" color={color} size={12} />
                </View>
              ) : null}
            </Pressable>
            {isAudit && auditOpen ? (
              <View style={styles.sub}>
                {AUDIT_PAGES.map((p) => {
                  const subActive = active && p.key === auditPage;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        onAuditPage(p.key);
                        onChange('audit');
                      }}
                      accessibilityRole="tab"
                      accessibilityLabel={p.title}
                      accessibilityState={{ selected: subActive }}
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                        styles.subItem,
                        { backgroundColor: subActive || pressed || hovered ? c.sidebarActive : 'transparent' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.subText,
                          compact && styles.subTextCompact,
                          { color: subActive ? c.sidebarText : c.sidebarMuted, fontWeight: subActive ? '700' : '500' },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {p.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            </React.Fragment>
          );
        })}
      </ScrollView>

      <ThemePicker
        variant="sidebar"
        compact={compact}
        menuPosition={{ bottom: insets.bottom + 16, left: width + 8 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: '100%', zIndex: 5 },
  brand: { alignItems: 'center', paddingTop: 2, paddingBottom: 22 },
  wordmark: { fontFamily: fonts.display, fontSize: 30 },
  nav: { flex: 1 },
  navContent: { gap: 6, paddingBottom: 8 },
  item: { alignItems: 'center', gap: 6, borderRadius: 10, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 2 },
  indicator: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 2 },
  itemText: { fontFamily: fonts.body, fontSize: 12, textAlign: 'center' },
  itemTextCompact: { fontSize: 10.5 },
  caret: { position: 'absolute', right: 6, top: 10, transform: [{ rotate: '90deg' }] },
  caretOpen: { transform: [{ rotate: '-90deg' }] },
  sub: { gap: 2, marginTop: -2 },
  subItem: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 4, alignItems: 'center' },
  subText: { fontFamily: fonts.body, fontSize: 11.5, textAlign: 'center' },
  subTextCompact: { fontSize: 10 },
});
