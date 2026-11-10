import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage, STORAGE_KEYS } from '../storage';

export interface AIConfig {
  apiKey: string;
  model: string;
}

export const EMPTY_AI: AIConfig = { apiKey: '', model: '' };

interface AiConfigContextValue {
  /** What's saved — the chat uses this, not unsaved edits in the Settings form. */
  savedAi: AIConfig;
  loaded: boolean;
  /** Call after writing the config to storage. */
  setSavedAi: (config: AIConfig) => void;
}

const AiConfigContext = createContext<AiConfigContextValue | null>(null);

export function AiConfigProvider({ children }: { children: React.ReactNode }) {
  const [savedAi, setSavedAi] = useState<AIConfig>(EMPTY_AI);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage.get(STORAGE_KEYS.aiConfig).then((saved) => {
      try {
        if (saved) {
          // Only accept string fields, so odd saved data can't crash the app.
          const str = (v: unknown) => (typeof v === 'string' ? v : '');
          const parsed = JSON.parse(saved) ?? {};
          setSavedAi({ apiKey: str(parsed.apiKey), model: str(parsed.model) });
        }
      } catch {
        // ignore corrupt saved data
      }
      setLoaded(true);
    });
  }, []);

  const value = useMemo(() => ({ savedAi, loaded, setSavedAi }), [savedAi, loaded]);
  return <AiConfigContext.Provider value={value}>{children}</AiConfigContext.Provider>;
}

export function useAiConfig(): AiConfigContextValue {
  const ctx = useContext(AiConfigContext);
  if (!ctx) throw new Error('useAiConfig must be used inside <AiConfigProvider>');
  return ctx;
}
