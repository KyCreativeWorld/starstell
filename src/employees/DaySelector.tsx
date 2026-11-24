/**
 * Which day a timeline shows: the typical (average) day, one of the last five
 * workdays, or any past workday from a calendar. Shared by the Employees and
 * Timelines tabs. Also holds the timeline colors.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { Icon } from '../components/Icon';
import { DatePickerSheet } from '../components/DatePickerSheet';
import { type ActivityKind, isWorkday, recentWorkdays, TYPICAL_SAMPLE_DAYS } from './dayTimeline';

/**
 * Timeline colors: categorical slots 1–4 of the validated chart palette, in
 * ACTIVITY_KINDS order. Light and dark are separate steps of the same hues.
 */
const KIND_COLORS: Record<'light' | 'dark', Record<ActivityKind, string>> = {
  light: { focus: '#2a78d6', meeting: '#eb6834', admin: '#1baf7a', lost: '#eda100' },
  dark: { focus: '#3987e5', meeting: '#d95926', admin: '#199e70', lost: '#c98500' },
};

export function useKindColors() {
  const { theme } = useTheme();
  return KIND_COLORS[theme.dark ? 'dark' : 'light'];
}

export type DayMode = 'typical' | 'recent' | 'date';
const MODES: { key: DayMode; label: string }[] = [
  { key: 'typical', label: 'Typical day' },
  { key: 'recent', label: 'Last 5 workdays' },
  { key: 'date', label: 'Pick a date' },
];

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export function useDaySelection() {
  const [mode, setMode] = useState<DayMode>('typical');
  const recent = recentWorkdays(5);
  const [recentIndex, setRecentIndex] = useState(0);
  const [picked, setPicked] = useState<Date>(() => recent[0]);
  const [picking, setPicking] = useState(false);

  /** null = the typical day. */
  const day: Date | null = mode === 'recent' ? recent[recentIndex] : mode === 'date' ? picked : null;
  const caption =
    mode === 'typical'
      ? `Average of the last ${TYPICAL_SAMPLE_DAYS} workdays`
      : day
        ? day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';
  return { mode, setMode, recent, recentIndex, setRecentIndex, picked, setPicked, picking, setPicking, day, caption };
}

export type DaySelection = ReturnType<typeof useDaySelection>;

/** Mode switch, the day's sub-controls, a caption naming the day, and the calendar sheet. */
export function DaySelector({ sel }: { sel: DaySelection }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { mode, recent, recentIndex, picked } = sel;

  return (
    <View style={styles.wrap}>
      <View style={styles.segments} accessibilityRole="tablist">
        {MODES.map((m) => {
          const on = m.key === mode;
          return (
            <Pressable
              key={m.key}
              onPress={() => {
                sel.setMode(m.key);
                if (m.key === 'date') sel.setPicking(true);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[
                styles.segment,
                { borderColor: on ? c.primary : c.inputBorder, backgroundColor: on ? c.primary : c.inputBg },
              ]}
            >
              <Text style={[styles.segmentText, { color: on ? c.buttonText : c.text }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'recent' ? (
        <View style={styles.dayNav}>
          <StepButton
            label="Earlier day"
            flip
            disabled={recentIndex >= recent.length - 1}
            onPress={() => sel.setRecentIndex((i) => Math.min(recent.length - 1, i + 1))}
          />
          <View style={styles.dayChips}>
            {[...recent].reverse().map((d) => {
              const i = recent.indexOf(d);
              const on = i === recentIndex;
              return (
                <Pressable
                  key={d.toISOString()}
                  onPress={() => sel.setRecentIndex(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.chip,
                    { borderColor: on ? c.primary : c.inputBorder, backgroundColor: on ? c.inputBg : 'transparent' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: on ? c.text : c.mutedText, fontWeight: on ? '700' : '500' }]}>
                    {shortDate(d)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <StepButton
            label="Later day"
            disabled={recentIndex <= 0}
            onPress={() => sel.setRecentIndex((i) => Math.max(0, i - 1))}
          />
        </View>
      ) : mode === 'date' ? (
        <Pressable
          onPress={() => sel.setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Date: ${picked.toDateString()}. Change date`}
          style={[styles.dateButton, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}
        >
          <Text style={[styles.chipText, { color: c.text, fontWeight: '600' }]}>
            {shortDate(picked)}, {picked.getFullYear()}
          </Text>
          <Text style={[styles.chipText, { color: c.primary, fontWeight: '700' }]}>Change</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.caption, { color: c.mutedText }]}>{sel.caption}</Text>

      <DatePickerSheet
        visible={sel.picking}
        value={picked}
        max={recent[0]}
        isEnabled={isWorkday}
        onPick={sel.setPicked}
        onClose={() => sel.setPicking(false)}
      />
    </View>
  );
}

function StepButton({ label, flip, disabled, onPress }: { label: string; flip?: boolean; disabled: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[styles.step, { borderColor: c.inputBorder, opacity: disabled ? 0.35 : 1 }]}
    >
      <View style={flip ? styles.flip : null}>
        <Icon name="chevron" size={16} color={c.text} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segment: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  segmentText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: fonts.body, fontSize: 13 },
  step: { borderWidth: 1, borderRadius: 8, padding: 6 },
  flip: { transform: [{ rotate: '180deg' }] },
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
  caption: { fontFamily: fonts.body, fontSize: 13 },
});
