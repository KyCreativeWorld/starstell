import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { useReport } from '../report/ReportContext';
import { initials, useProfile } from '../settings/ProfileContext';
import { buildIndex, search, type SearchResult, type SearchTarget } from '../search/searchIndex';
import { Icon } from './Icon';

export type { SearchTarget };

export const HEADER_HEIGHT = 60;

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

  const { height: windowHeight } = useWindowDimensions();

  const index = useMemo(() => buildIndex(report), [report]);
  const results = useMemo(() => search(index, query), [index, query]);
  const showResults = focused && query.trim().length > 0;
  // The list scrolls; keep it on screen and leave room below.
  const listMaxHeight = Math.max(200, Math.min(480, windowHeight - HEADER_HEIGHT - insets.top - 80));

  // Keep the arrow-key selection in view as it moves down the scrolling list.
  const listRef = useRef<ScrollViewInstance>(null);
  const rowY = useRef<number[]>([]);
  const scrollY = useRef(0);
  useEffect(() => {
    const y = rowY.current[active];
    if (y === undefined) return;
    if (y < scrollY.current) listRef.current?.scrollTo({ y: Math.max(0, y - 6), animated: false });
    else if (y + 52 > scrollY.current + listMaxHeight - 30)
      listRef.current?.scrollTo({ y: y + 52 - listMaxHeight + 30, animated: false });
  }, [active, listMaxHeight]);

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
              listRef.current?.scrollTo({ y: 0, animated: false });
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
            placeholder={compact ? 'Search' : 'Search teams, costs, solutions, tools…'}
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
          // Web: keep focus in the search box when the list (or its scrollbar) is clicked,
          // so the dropdown doesn't close mid-scroll.
          {...(Platform.OS === 'web' ? ({ onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() } as object) : null)}
        >
          {results.length ? (
            <>
              <Text style={[styles.count, { color: c.mutedText }]}>
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </Text>
              <ScrollView
                ref={listRef}
                style={{ maxHeight: listMaxHeight }}
                keyboardShouldPersistTaps="handled"
                onScroll={(e) => {
                  scrollY.current = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={32}
              >
                {results.map((r, i) => (
                  <Pressable
                    key={r.key}
                    onPress={() => choose(r)}
                    onLayout={(e) => {
                      rowY.current[i] = e.nativeEvent.layout.y;
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.kind}: ${r.label}${r.detail ? `. ${r.detail}` : ''}`}
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
                ))}
              </ScrollView>
            </>
          ) : (
            <Text style={[styles.noResults, { color: c.mutedText }]}>
              {report ? 'No matches.' : 'No matches. Import a report to search its teams, costs and solutions.'}
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
  count: { fontFamily: fonts.body, fontSize: 11, fontWeight: '600', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6 },
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
