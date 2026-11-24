import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { Reflection } from '../components/Glass';
import { sidebarWidthFor, type TabName } from '../components/Sidebar';
import { useReport } from '../report/ReportContext';
import {
  CARD_BY_ID,
  CARD_SIZES,
  cardIdOf,
  DEFAULT_LAYOUT,
  newLayoutKey,
  sizeOfCard,
  type CardId,
  type CardSize,
  type LayoutKey,
  useDashboardLayout,
} from '../dashboard/cards';
import {
  clearCardSettings,
  removeCardSettings,
  updateCardSettings,
  useAllCardSettings,
} from '../dashboard/cardSettings';
import { placeCards } from '../dashboard/gridLayout';
import type { EmployeeCardConfig } from '../dashboard/employeeCardConfig';
import { DashboardCard } from '../dashboard/DashboardCards';
import { AddCardSheet } from '../dashboard/AddCardSheet';

const GAP = 16;
const MAX_WIDTH = 1100;
const SIDE_PADDING = 16;
/** Height of one grid row; a card N rows tall is N rows plus the gaps between them. */
const ROW_HEIGHT = 132;
/** Layout key for the "Add a card" tile shown at the end of the grid in edit mode. */
const ADD_SLOT = '__add';
/** How long to hold a card (in edit mode) before it lifts and can be dragged. */
const HOLD_MS = 180;
const nativeDriver = Platform.OS !== 'web';

interface DragState {
  id: LayoutKey;
  /** The card's rect when the drag started. */
  start: LayoutRectangle;
  dx: number;
  dy: number;
  /** Last card we swapped with; we don't swap again until the pointer leaves it. */
  lastTarget: LayoutKey | null;
}

type DragHandlers = {
  begin: (id: LayoutKey) => boolean;
  move: (dx: number, dy: number) => void;
  end: () => void;
};

/**
 * Home page: number tiles and charts. "Edit dashboard" works like the iPhone
 * home screen: cards wiggle, − removes one, + adds from a gallery, and you hold
 * and drag a card to move it.
 */
export function DashboardScreen({ onNavigate }: { onNavigate: (tab: TabName) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { report } = useReport();
  const { layout, setLayout } = useDashboardLayout();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<{ id: LayoutKey; start: LayoutRectangle } | null>(null);
  const draggingId = dragging?.id ?? null;
  // While dragging, the order changes live; it's saved when the card is dropped.
  const [liveOrder, setLiveOrder] = useState<LayoutKey[] | null>(null);
  const order = liveOrder ?? layout;

  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const available = windowWidth - sidebarWidthFor(windowWidth) - insets.left - insets.right;
  const gridWidth = Math.min(available, MAX_WIDTH) - SIDE_PADDING * 2;
  const columns = gridWidth >= 720 ? 4 : 2;
  const unit = (gridWidth - GAP * (columns - 1)) / columns;

  // ---- fixed grid ----
  // Every card has a set footprint (columns × rows). Cards keep their order;
  // small cards after a big one stack in the space beside it.
  const cardSettings = useAllCardSettings();
  const sizeOf = (key: LayoutKey) => sizeOfCard(key, cardSettings[key]);
  const items = order.map((key) => ({ key, size: sizeOf(key) }));
  if (editing) items.push({ key: ADD_SLOT, size: '1x1' });
  const { placements, rows: gridRows } = placeCards(items, columns);
  const rectOf = (key: LayoutKey): LayoutRectangle => {
    const p = placements.get(key) ?? { col: 0, row: 0, cols: 1, rows: 1 };
    return {
      x: p.col * (unit + GAP),
      y: p.row * (ROW_HEIGHT + GAP),
      width: p.cols * unit + (p.cols - 1) * GAP,
      height: p.rows * ROW_HEIGHT + (p.rows - 1) * GAP,
    };
  };
  const gridHeight = gridRows ? gridRows * ROW_HEIGHT + (gridRows - 1) * GAP : 0;

  // ---- drag to reorder ----
  // The dragged card floats above the grid (following the pointer) while an
  // invisible copy holds its slot. Positions come straight from the grid placement.
  const rects = useRef(new Map<LayoutKey, LayoutRectangle>());
  useEffect(() => {
    rects.current = new Map(order.map((key) => [key, rectOf(key)]));
  });
  const drag = useRef<DragState | null>(null);
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);
  const [dragOffset] = useState(() => new Animated.ValueXY());

  const handlers: DragHandlers = {
    begin: (id) => {
      const start = rects.current.get(id);
      if (!start) return false;
      drag.current = { id, start, dx: 0, dy: 0, lastTarget: null };
      dragOffset.setValue({ x: 0, y: 0 });
      setLiveOrder(orderRef.current);
      setDragging({ id, start });
      return true;
    },
    move: (dx, dy) => {
      const d = drag.current;
      if (!d) return;
      d.dx = dx;
      d.dy = dy;
      // The point under the middle of the dragged card picks the slot.
      const px = d.start.x + d.start.width / 2 + dx;
      const py = d.start.y + d.start.height / 2 + dy;
      const inside = (r: LayoutRectangle) =>
        px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
      let target: LayoutKey | null = null;
      for (const [id, r] of rects.current) {
        if (id !== d.id && orderRef.current.includes(id) && inside(r)) target = id;
      }
      if (d.lastTarget && target !== d.lastTarget) d.lastTarget = null;
      if (target && target !== d.lastTarget) {
        const cur = orderRef.current;
        const next = cur.filter((x) => x !== d.id);
        next.splice(cur.indexOf(target), 0, d.id);
        d.lastTarget = target;
        orderRef.current = next;
        setLiveOrder(next);
      }
      dragOffset.setValue({ x: dx, y: dy });
    },
    end: () => {
      const final = orderRef.current;
      drag.current = null;
      setDragging(null);
      setLiveOrder(null);
      dragOffset.setValue({ x: 0, y: 0 });
      setLayout(final);
    },
  };

  const remove = (key: LayoutKey) => {
    setLayout(layout.filter((x) => x !== key));
    removeCardSettings(key);
  };
  /** Steps a resizable card to the next size. */
  const resize = (key: LayoutKey) => {
    const cur = sizeOf(key);
    const next = CARD_SIZES[(CARD_SIZES.indexOf(cur) + 1) % CARD_SIZES.length];
    updateCardSettings(key, { size: next });
  };
  const add = (id: CardId, settings?: EmployeeCardConfig) => {
    const key = newLayoutKey(id);
    // Save the card's choices before it appears, so it never shows a default selection.
    if (settings) updateCardSettings(key, { ...settings });
    setLayout([...layout, key]);
    setAdding(false);
  };

  const subtitle = report
    ? [report.client ?? report.title, report.reportDate].filter(Boolean).join(' · ') || report.fileName
    : 'Key numbers from your report, at a glance.';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" scrollEnabled={!draggingId}>
        <Text style={[styles.title, { color: c.text }]}>Dashboard</Text>
        <Text numberOfLines={2} style={[styles.subtitle, { color: c.mutedText }]}>
          {editing ? 'Hold and drag a card to move it. Tap − to remove it.' : subtitle}
        </Text>

        <View
          // Mouse drags shouldn't select text on the web while rearranging.
          style={[
            styles.grid,
            { height: gridHeight },
            editing && Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null,
          ]}
        >
          {order.map((id, i) => (
            <EditableCard
              key={id}
              id={id}
              index={i}
              rect={rectOf(id)}
              size={sizeOf(id)}
              editing={editing}
              dragging={draggingId === id}
              handlers={handlers}
              onRemove={() => remove(id)}
              onResize={CARD_BY_ID[cardIdOf(id)].resizable ? () => resize(id) : undefined}
              onNavigate={onNavigate}
            />
          ))}
          {editing ? (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a card"
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.addSlot,
                {
                  ...rectToStyle(rectOf(ADD_SLOT)),
                  borderColor: hovered ? c.primary : c.inputBorder,
                  backgroundColor: pressed ? c.inputBg : 'transparent',
                },
              ]}
            >
              <Text style={[styles.addSlotPlus, { color: c.primary }]}>+</Text>
              <Text style={[styles.addSlotText, { color: c.mutedText }]}>Add a card</Text>
            </Pressable>
          ) : null}

          {dragging ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.floating,
                {
                  left: dragging.start.x,
                  top: dragging.start.y,
                  width: dragging.start.width,
                  height: dragging.start.height,
                  shadowColor: c.shadow,
                  transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }, { scale: 1.03 }],
                },
              ]}
            >
              <DashboardCard id={dragging.id} onNavigate={onNavigate} />
            </Animated.View>
          ) : null}
        </View>

        {!editing && layout.length === 0 ? (
          <Text style={[styles.empty, { color: c.mutedText }]}>
            Your dashboard is empty. Tap Edit dashboard to add cards.
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.fabs} pointerEvents="box-none">
        {editing ? <Fab label="+ Add card" variant="ghost" onPress={() => setAdding(true)} /> : null}
        <Fab
          label={editing ? 'Done' : '✎  Edit dashboard'}
          onPress={() => {
            setEditing((e) => !e);
            setAdding(false);
          }}
        />
      </View>

      <AddCardSheet
        visible={adding}
        layout={layout}
        onAdd={add}
        onReset={() => {
          setLayout(DEFAULT_LAYOUT);
          clearCardSettings();
          setAdding(false);
        }}
        onClose={() => setAdding(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** A dashboard card that wiggles in edit mode and can be held and dragged. */
function EditableCard({
  id,
  index,
  rect,
  size,
  editing,
  dragging,
  handlers,
  onRemove,
  onResize,
  onNavigate,
}: {
  id: LayoutKey;
  index: number;
  rect: LayoutRectangle;
  size: CardSize;
  editing: boolean;
  dragging: boolean;
  handlers: DragHandlers;
  onRemove: () => void;
  /** Only for resizable cards: steps to the next size. */
  onResize?: () => void;
  onNavigate: (tab: TabName) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  // Latest props for the PanResponder, which is created once.
  const live = useRef({ id, editing, handlers });
  useEffect(() => {
    live.current = { id, editing, handlers };
  });

  // The ref is only read inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (!armed) armed = live.current.handlers.begin(live.current.id);
    };
    const finish = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (armed) live.current.handlers.end();
      armed = false;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.editing,
      onMoveShouldSetPanResponder: () => live.current.editing,
      onPanResponderGrant: () => {
        armed = false;
        timer = setTimeout(arm, HOLD_MS);
      },
      onPanResponderMove: (_, g) => {
        // With a mouse there's no scrolling to protect, so start dragging right away.
        if (!armed && Platform.OS === 'web' && Math.hypot(g.dx, g.dy) > 4) arm();
        if (armed) live.current.handlers.move(g.dx, g.dy);
      },
      // Before the card lifts, let the page scroll take over a swipe.
      onPanResponderTerminationRequest: () => !armed,
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
  });

  // iPhone-style wiggle; number tiles wiggle a little more than wide charts.
  const [wiggle] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!editing || dragging) {
      wiggle.setValue(0);
      return;
    }
    const d = 120 + (index % 3) * 15;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: d, easing: ease, useNativeDriver: nativeDriver }),
        Animated.timing(wiggle, { toValue: -1, duration: d * 2, easing: ease, useNativeDriver: nativeDriver }),
        Animated.timing(wiggle, { toValue: 0, duration: d, easing: ease, useNativeDriver: nativeDriver }),
      ]),
    );
    const t = setTimeout(() => loop.start(), (index * 70) % 240);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [editing, dragging, index, wiggle]);
  const deg = size === '1x1' ? 0.9 : 0.35;
  const rotate = wiggle.interpolate({ inputRange: [-1, 1], outputRange: [`-${deg}deg`, `${deg}deg`] });

  return (
    <Animated.View
      style={[
        rectToStyle(rect),
        // While dragged, this stays as an invisible placeholder; a floating copy follows the pointer.
        dragging ? { opacity: 0 } : editing ? { transform: [{ rotate }] } : null,
      ]}
    >
      <View style={styles.cardFill} pointerEvents={editing ? 'none' : 'auto'}>
        <DashboardCard id={id} onNavigate={onNavigate} />
      </View>
      {editing ? (
        <>
          {/* Catches holds and drags so the card's own buttons don't fire while editing. */}
          <View
            style={[styles.overlay, Platform.OS === 'web' ? ({ cursor: dragging ? 'grabbing' : 'grab' } as object) : null]}
            {...pan.panHandlers}
          />
          {!dragging ? (
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${CARD_BY_ID[cardIdOf(id)].title}`}
              hitSlop={8}
              style={[styles.remove, { backgroundColor: c.mutedText, borderColor: c.background }]}
            >
              <View style={[styles.removeBar, { backgroundColor: c.background }]} />
            </Pressable>
          ) : null}
          {!dragging && onResize ? (
            <Pressable
              onPress={onResize}
              accessibilityRole="button"
              accessibilityLabel={`Change size, now ${size.replace('x', ' by ')}`}
              hitSlop={6}
              style={[styles.resize, { backgroundColor: c.buttonBg }]}
            >
              <Text style={[styles.resizeText, { color: c.buttonText }]}>{size.replace('x', '×')} ⤢</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
}

function Fab({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: primary ? c.buttonBg : c.panel,
          borderColor: primary ? (theme.flat ? c.buttonBg : 'rgba(255, 255, 255, 0.3)') : c.inputBorder,
          shadowColor: c.shadow,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {primary ? <Reflection /> : null}
      <Text style={[styles.fabText, { color: primary ? c.buttonText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

function rectToStyle(r: LayoutRectangle) {
  return { position: 'absolute' as const, left: r.x, top: r.y, width: r.width, height: r.height };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: SIDE_PADDING,
    paddingTop: 24,
    // Room for the floating buttons.
    paddingBottom: 96,
  },
  title: { fontFamily: fonts.display, fontSize: 32, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, marginTop: 4, marginBottom: 20 },
  // Cards are absolutely positioned on the grid; its height is set from the rows used.
  grid: { position: 'relative' },
  cardFill: { flex: 1 },
  resize: {
    position: 'absolute',
    top: -9,
    right: -9,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  resizeText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  floating: {
    position: 'absolute',
    zIndex: 100,
    elevation: 20,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
  },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  remove: {
    position: 'absolute',
    top: -9,
    left: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBar: { width: 10, height: 2, borderRadius: 1 },
  addSlot: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addSlotPlus: { fontSize: 26, fontWeight: '300', lineHeight: 28 },
  addSlotText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  empty: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', marginTop: 40 },
  fabs: { position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', gap: 10 },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  fabText: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
});
