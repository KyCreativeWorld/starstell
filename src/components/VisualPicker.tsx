import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';

export type ReportVisual = 'sky' | 'lineup' | 'pdf';

const OPTIONS: { value: ReportVisual; label: string; hint: string; icon: string }[] = [
  { value: 'sky', label: 'Constellation', hint: 'Teams as star clusters', icon: '✦' },
  { value: 'lineup', label: 'Star line-up', hint: 'Bottlenecks from biggest to smallest', icon: '●' },
  { value: 'pdf', label: 'Original PDF', hint: 'The report as uploaded', icon: '▤' },
];

const MENU_W = 250;

/** Dropdown for choosing how the report is shown. */
export function VisualPicker({ value, onChange }: { value: ReportVisual; onChange: (v: ReportVisual) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  const show = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  return (
    <>
      <Pressable
        ref={ref}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`Report view: ${current.label}. Change view`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.pill,
          frosted,
          { backgroundColor: c.menu, borderColor: c.glassBorder, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.icon, { color: c.primary }]}>{current.icon}</Text>
        <Text style={[styles.pillText, { color: c.text }]} numberOfLines={1}>
          {current.label}
        </Text>
        <Text style={[styles.caret, { color: c.mutedText }]}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        <View
          accessibilityRole="menu"
          style={[
            styles.menu,
            frosted,
            {
              top: anchor.y + anchor.h + 6,
              // Right-aligned with the pill, kept on screen.
              left: Math.max(8, anchor.x + anchor.w - MENU_W),
              backgroundColor: c.menu,
              borderColor: c.glassBorder,
              borderTopColor: c.glassHighlight,
              shadowColor: c.shadow,
            },
          ]}
        >
          {OPTIONS.map((o) => {
            const selected = o.value === value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  setOpen(false);
                  onChange(o.value);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.option,
                  { backgroundColor: selected || pressed || hovered ? c.inputBg : 'transparent' },
                ]}
              >
                <Text style={[styles.optionIcon, { color: c.primary }]}>{o.icon}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.optionLabel, { color: c.text }]}>{o.label}</Text>
                  <Text style={[styles.optionHint, { color: c.mutedText }]}>{o.hint}</Text>
                </View>
                {selected ? <Text style={[styles.check, { color: c.primary }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  icon: { fontSize: 14 },
  pillText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  caret: { fontSize: 12 },
  menu: {
    position: 'absolute',
    width: MENU_W,
    borderWidth: 1,
    borderRadius: 16,
    padding: 6,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  optionIcon: { fontSize: 15, width: 18, textAlign: 'center' },
  optionLabel: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  optionHint: { fontFamily: fonts.body, fontSize: 12, marginTop: 1 },
  check: { fontSize: 15, fontWeight: '700' },
});
