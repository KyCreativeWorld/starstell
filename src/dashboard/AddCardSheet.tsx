import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import {
  CARDS,
  CATEGORY_TITLES,
  categoryOf,
  type CardCategory,
  type CardDef,
  type CardId,
  type CardSize,
  type LayoutKey,
  spanOf,
} from './cards';
import { defaultConfig, EMPLOYEE_SCOPE, type EmployeeCardConfig, type EmployeeScope } from './employeeCardConfig';
import { MemberList, pickerTitle } from './EmployeeCard';
import { GlassButton } from '../components/Glass';

/** Widget-gallery style sheet: tap a card to add it to the end of the dashboard. */
export function AddCardSheet({
  visible,
  layout,
  onAdd,
  onReset,
  onClose,
}: {
  visible: boolean;
  layout: LayoutKey[];
  /** `settings` are saved for the new card (e.g. who an Employee data card shows). */
  onAdd: (id: CardId, settings?: EmployeeCardConfig) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Employee data cards first ask who they should show; the card is only added once that's chosen.
  const [setup, setSetup] = useState<{ id: CardId; scope: EmployeeScope; draft: EmployeeCardConfig } | null>(null);
  // Reopening the sheet always starts at the card list.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) setSetup(null);
  }
  const close = () => {
    setSetup(null);
    onClose();
  };
  const pick = (d: CardDef) => {
    const scope = EMPLOYEE_SCOPE[d.id];
    if (!scope) {
      onAdd(d.id);
      return;
    }
    // Start with nothing chosen, but keep the kind's default data view.
    setSetup({ id: d.id, scope, draft: { data: defaultConfig(scope).data, employeeIds: [] } });
  };
  const finish = (draft: EmployeeCardConfig) => {
    if (!setup) return;
    onAdd(setup.id, draft);
    setSetup(null);
  };

  // Repeatable cards can always be added again.
  const available = CARDS.filter((d) => d.repeatable || !layout.includes(d.id));
  const sections: { title: string; cards: CardDef[] }[] = (Object.keys(CATEGORY_TITLES) as CardCategory[])
    .map((cat) => ({ title: CATEGORY_TITLES[cat], cards: available.filter((d) => categoryOf(d) === cat) }))
    .filter((s) => s.cards.length);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={setup ? () => setSetup(null) : close}
    >
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          {
            maxHeight: height * 0.8,
            paddingBottom: insets.bottom + 12,
            backgroundColor: c.menu,
            borderColor: c.glassBorder,
            shadowColor: c.shadow,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: c.inputBorder }]} />
        {setup ? (
          <>
            <View style={styles.header}>
              <Pressable onPress={() => setSetup(null)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.done, { color: c.primary }]}>‹ Back</Text>
              </Pressable>
              <Text style={[styles.title, { color: c.text }]}>{pickerTitle(setup.scope)}</Text>
              <Pressable onPress={close} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.done, { color: c.mutedText }]}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: c.mutedText }]}>
              {setup.scope === 'group'
                ? `Pick the people for this mini team. ${setup.draft.employeeIds?.length ?? 0} selected.`
                : setup.scope === 'team'
                  ? 'Pick the team this card shows. You can change it later.'
                  : 'Pick the person this card shows. You can change it later.'}
            </Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.pickerContent}>
              <MemberList
                scope={setup.scope}
                cfg={setup.draft}
                onChange={(patch) => setSetup((s) => (s ? { ...s, draft: { ...s.draft, ...patch } } : s))}
                onPicked={(patch) => finish({ ...setup.draft, ...patch })}
              />
            </ScrollView>
            {setup.scope === 'group' ? (
              <View style={styles.confirm}>
                <GlassButton
                  label={
                    setup.draft.employeeIds?.length
                      ? `Add mini team (${setup.draft.employeeIds.length})`
                      : 'Choose at least one person'
                  }
                  disabled={!setup.draft.employeeIds?.length}
                  onPress={() => finish(setup.draft)}
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: c.text }]}>Add a card</Text>
              <Pressable onPress={close} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.done, { color: c.primary }]}>Done</Text>
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: c.mutedText }]}>
              Tap a card to add it, then hold and drag it where you want it.
            </Text>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {sections.length ? (
                sections.map((s) => (
                  <View key={s.title}>
                    <Text style={[styles.section, { color: c.mutedText }]}>{s.title}</Text>
                    <View style={styles.tiles}>
                      {s.cards.map((d) => (
                        <Pressable
                          key={d.id}
                          onPress={() => pick(d)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${d.title}`}
                          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                            styles.tile,
                            {
                              backgroundColor: c.panel,
                              borderColor: hovered ? c.primary : c.glassBorder,
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <Preview size={d.size} />
                          <View style={styles.tileText}>
                            <Text style={[styles.tileTitle, { color: c.text }]}>{d.title}</Text>
                            <Text style={[styles.tileSub, { color: c.mutedText }]}>
                              {d.description} · {d.resizable ? 'any size' : d.size.replace('x', '×')}
                            </Text>
                          </View>
                          <View style={[styles.plus, { backgroundColor: c.buttonBg }]}>
                            <Text style={[styles.plusText, { color: c.buttonText }]}>+</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={[styles.hint, { color: c.mutedText }]}>Every card is already on your dashboard.</Text>
              )}
            </ScrollView>

            <Pressable onPress={onReset} accessibilityRole="button" style={styles.reset}>
              <Text style={[styles.resetText, { color: c.mutedText }]}>Reset dashboard to default</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

/** Tiny outline showing the card's shape: a number tile, a wide chart or a tall panel. */
function Preview({ size }: { size: CardSize }) {
  const { theme } = useTheme();
  const c = theme.colors;
  // Drawn to scale: 10px per grid cell.
  const { cols, rows } = spanOf(size);
  const dims = { width: cols * 10 + (cols - 1) * 2, height: rows * 10 + (rows - 1) * 2 };
  return (
    <View style={styles.previewBox}>
      <View style={[styles.preview, dims, { borderColor: c.primary, backgroundColor: c.inputBg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingTop: 8,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  title: { fontFamily: fonts.body, fontSize: 18, fontWeight: '700' },
  done: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  hint: { fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, paddingBottom: 8 },
  pickerContent: { paddingHorizontal: 12, paddingBottom: 8 },
  confirm: { paddingHorizontal: 20, paddingTop: 8 },
  section: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  tiles: { gap: 8 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 10, padding: 12 },
  previewBox: { width: 48, alignItems: 'center' },
  preview: { borderWidth: 1.5, borderRadius: 4 },
  tileText: { flex: 1 },
  tileTitle: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
  tileSub: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  plus: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  reset: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  resetText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
});
