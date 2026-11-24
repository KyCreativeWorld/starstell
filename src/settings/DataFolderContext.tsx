import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage, STORAGE_KEYS } from '../storage';

/**
 * Link to a shared file-storage folder (Google Drive, OneDrive, Dropbox, …)
 * that holds the CSV files used to build the report.
 */
interface DataFolderContextValue {
  /** Saved folder link, or '' when none is set. */
  folderUrl: string;
  loaded: boolean;
  saveFolderUrl: (url: string) => Promise<void>;
}

const DataFolderContext = createContext<DataFolderContextValue | null>(null);

export function DataFolderProvider({ children }: { children: React.ReactNode }) {
  const [folderUrl, setFolderUrl] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage.get(STORAGE_KEYS.dataFolder).then((saved) => {
      if (typeof saved === 'string') setFolderUrl(saved);
      setLoaded(true);
    });
  }, []);

  const value = useMemo<DataFolderContextValue>(
    () => ({
      folderUrl,
      loaded,
      saveFolderUrl: async (url) => {
        const trimmed = url.trim();
        if (trimmed) await storage.set(STORAGE_KEYS.dataFolder, trimmed);
        else await storage.remove(STORAGE_KEYS.dataFolder);
        setFolderUrl(trimmed);
      },
    }),
    [folderUrl, loaded],
  );

  return <DataFolderContext.Provider value={value}>{children}</DataFolderContext.Provider>;
}

export function useDataFolder(): DataFolderContextValue {
  const ctx = useContext(DataFolderContext);
  if (!ctx) throw new Error('useDataFolder must be used inside <DataFolderProvider>');
  return ctx;
}

/** Checks that a folder link looks like a web address. Returns an error message, or null. */
export function validateFolderUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(trimmed)) return 'The folder link must be a web address starting with https://';
  return null;
}

/** Friendly name of the storage service a folder link points at. */
export function folderProvider(url: string): string | null {
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes('drive.google') || host.includes('docs.google')) return 'Google Drive';
  if (host.includes('sharepoint')) return 'SharePoint';
  if (host.includes('onedrive') || host === '1drv.ms') return 'OneDrive';
  if (host.includes('dropbox')) return 'Dropbox';
  if (host.includes('box.com') || host.includes('app.box')) return 'Box';
  if (host.includes('icloud')) return 'iCloud Drive';
  return host.replace(/^www\./, '');
}
