import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton } from './Glass';
import { loadPdfUri, releasePdfUri } from '../report/pdfStore';
import type { Report } from '../report/types';

export interface PdfViewProps {
  report: Report;
  /** Px kept clear at the top / right (for overlaid controls). */
  insetTop: number;
  insetRight: number;
  onReplace: () => void;
  busy: boolean;
}

/** Loads the saved PDF's URI for this report; undefined while loading, null if there isn't one. */
export function usePdfUri(report: Report): string | null | undefined {
  const key = `${report.importedAt}|${report.fileName}`;
  const [state, setState] = useState<{ key: string; uri: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loaded: string | null = null;
    loadPdfUri().then((u) => {
      loaded = u;
      if (cancelled) {
        if (u) releasePdfUri(u);
      } else setState({ key, uri: u });
    });
    return () => {
      cancelled = true;
      if (loaded) releasePdfUri(loaded);
    };
  }, [key]);
  // Still loading (or loading a newly imported report).
  return state?.key === key ? state.uri : undefined;
}

/** Shown when this report was imported before PDFs were kept. */
export function NoPdf({ onReplace, busy }: { onReplace: () => void; busy: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.center}>
      <Text style={[styles.icon, { color: c.primary }]}>✦</Text>
      <Text style={[styles.title, { color: c.text }]}>Original PDF not saved</Text>
      <Text style={[styles.body, { color: c.mutedText }]}>
        This report was opened before Starstell kept a copy of the PDF. Choose the PDF again to view it here.
      </Text>
      <GlassButton label="Choose PDF" onPress={onReplace} loading={busy} style={styles.button} />
    </View>
  );
}

export const pdfStyles = StyleSheet.create({
  box: { flex: 1, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56 },
  fileName: { flex: 1, fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 30 },
  title: { fontFamily: fonts.display, fontSize: 24, marginTop: 6, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 420 },
  button: { marginTop: 18, minWidth: 180 },
});
