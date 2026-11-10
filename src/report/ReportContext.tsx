import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearSavedReport, loadSavedReport, saveReport } from './reportStore';
import type { Report } from './types';

interface ReportContextValue {
  report: Report | null;
  /** False until the saved report (if any) has been checked. */
  loaded: boolean;
  setReport: (report: Report) => void;
  clearReport: () => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: React.ReactNode }) {
  const [report, setReportState] = useState<Report | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSavedReport().then((r) => {
      setReportState((current) => current ?? r);
      setLoaded(true);
    });
  }, []);

  const value = useMemo<ReportContextValue>(
    () => ({
      report,
      loaded,
      setReport: (r) => {
        setReportState(r);
        saveReport(r);
      },
      clearReport: () => {
        setReportState(null);
        clearSavedReport();
      },
    }),
    [report, loaded],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used inside <ReportProvider>');
  return ctx;
}
