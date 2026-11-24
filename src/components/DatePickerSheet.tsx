/** A small month-calendar sheet for picking a past date. No extra dependency. */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { Icon } from './Icon';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function DatePickerSheet({
  visible,
  value,
  max,
  isEnabled,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: Date;
  /** Latest date that can be picked. */
  max: Date;
  /** Extra rule for which days can be picked (e.g. workdays only). */
  isEnabled?: (d: Date) => boolean;
  onPick: (d: Date) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  // Reopening jumps back to the selected date's month.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }

  const first = month.getDay();
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const atMax = month.getFullYear() === max.getFullYear() && month.getMonth() === max.getMonth();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.center} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.menu, borderColor: c.glassBorder, shadowColor: c.shadow, marginBottom: insets.bottom },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.head}>
            <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} style={styles.nav}>
              <View style={styles.flip}>
                <Icon name="chevron" color={c.text} size={18} />
              </View>
            </Pressable>
            <Text style={[styles.month, { color: c.text }]}>
              {MONTHS[month.getMonth()]} {month.getFullYear()}
            </Text>
            <Pressable
              onPress={() => shift(1)}
              disabled={atMax}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              style={[styles.nav, atMax && styles.disabled]}
            >
              <Icon name="chevron" color={c.text} size={18} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.cell, styles.weekday, { color: c.mutedText }]}>
                {w}
              </Text>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={styles.cell} />;
              const enabled = d <= max && (isEnabled?.(d) ?? true);
              const selected = sameDay(d, value);
              return (
                <Pressable
                  key={d.getDate()}
                  disabled={!enabled}
                  onPress={() => {
                    onPick(d);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={d.toDateString()}
                  accessibilityState={{ selected, disabled: !enabled }}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.cell,
                    styles.day,
                    selected
                      ? { backgroundColor: c.primary }
                      : hovered && enabled
                        ? { backgroundColor: c.inputBg }
                        : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: selected ? c.buttonText : enabled ? c.text : c.placeholder },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nav: { padding: 8 },
  flip: { transform: [{ rotate: '180deg' }] },
  disabled: { opacity: 0.3 },
  month: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', textAlign: 'center', aspectRatio: 1.6 },
  day: { borderRadius: 999 },
  dayText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
});
