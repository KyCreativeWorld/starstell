/**
 * Settings saved per dashboard card (keyed by layout key): who an Employee data
 * card shows, a Notes card's text and size, …
 * Saved to localStorage on web and a JSON file in the app's documents folder on
 * iOS/Android (notes can be longer than the secure store allows).
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const WEB_KEY = 'starstell.cardSettings';
const NATIVE_FILE = 'starstell-card-settings.json';
const SAVE_DELAY_MS = 400;

type Settings = Record<string, Record<string, unknown>>;

let settings: Settings = {};
const listeners = new Set<() => void>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

async function read(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(WEB_KEY) ?? null;
  const f = new File(Paths.document, NATIVE_FILE);
  return f.exists ? f.text() : null;
}

/** Saves shortly after the last change, so typing in a note doesn't write on every key. */
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const json = JSON.stringify(settings);
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
      else {
        const f = new File(Paths.document, NATIVE_FILE);
        if (!f.exists) f.create();
        f.write(json);
      }
    } catch {
      // Not fatal: settings still apply for this session.
    }
  }, SAVE_DELAY_MS);
}

function load() {
  if (loaded) return;
  loaded = true;
  read()
    .then((saved) => {
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Anything changed before loading finished wins.
        settings = { ...parsed, ...settings };
        emit();
      }
    })
    .catch(() => {});
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getAll = () => settings;

/** Merges `patch` into a card's settings. */
export function updateCardSettings(key: string, patch: Record<string, unknown>) {
  settings = { ...settings, [key]: { ...settings[key], ...patch } };
  emit();
  persist();
}

export function removeCardSettings(key: string) {
  if (!(key in settings)) return;
  const { [key]: _removed, ...rest } = settings;
  settings = rest;
  emit();
  persist();
}

export function clearCardSettings() {
  settings = {};
  emit();
  persist();
}

/** One card's saved settings (undefined until something is saved). */
export function useCardSettings<T extends object>(key: string): Partial<T> | undefined {
  return useSyncExternalStore(subscribe, () => settings[key]) as Partial<T> | undefined;
}

/** Every card's settings; used by the grid to read per-card sizes. */
export function useAllCardSettings(): Settings {
  return useSyncExternalStore(subscribe, getAll);
}
