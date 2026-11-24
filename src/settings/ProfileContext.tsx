import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage, STORAGE_KEYS } from '../storage';

export interface Profile {
  name: string;
  role: string;
}

export const EMPTY_PROFILE: Profile = { name: '', role: '' };

interface ProfileContextValue {
  profile: Profile;
  loaded: boolean;
  saveProfile: (profile: Profile) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage.get(STORAGE_KEYS.profile).then((saved) => {
      try {
        if (saved) {
          const str = (v: unknown) => (typeof v === 'string' ? v : '');
          const parsed = JSON.parse(saved) ?? {};
          setProfile({ name: str(parsed.name), role: str(parsed.role) });
        }
      } catch {
        // ignore corrupt saved data
      }
      setLoaded(true);
    });
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      loaded,
      saveProfile: async (p) => {
        const trimmed = { name: p.name.trim(), role: p.role.trim() };
        await storage.set(STORAGE_KEYS.profile, JSON.stringify(trimmed));
        setProfile(trimmed);
      },
    }),
    [profile, loaded],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}

/** Up to two initials, e.g. "Kendall Kim" → "KK". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}
