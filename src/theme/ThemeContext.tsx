import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME, Theme, ThemeName, themes } from './themes';
import { storage, STORAGE_KEYS } from '../storage';

interface ThemeContextValue {
  theme: Theme;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>(DEFAULT_THEME);

  // Restore the last chosen theme.
  useEffect(() => {
    storage.get(STORAGE_KEYS.theme).then((saved) => {
      if (saved && Object.prototype.hasOwnProperty.call(themes, saved)) {
        setThemeNameState(saved as ThemeName);
      }
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[themeName],
      setThemeName: (name) => {
        setThemeNameState(name);
        storage.set(STORAGE_KEYS.theme, name);
      },
    }),
    [themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
