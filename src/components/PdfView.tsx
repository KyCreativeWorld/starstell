import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton } from './Glass';
import { NoPdf, pdfStyles, usePdfUri, type PdfViewProps } from './PdfView.shared';

/**
 * iOS/Android: the original report PDF, opened in the system viewer
 * (Quick Look on iOS, the default PDF app on Android). Web: see PdfView.web.tsx.
 */
export function PdfView({ report, insetTop, onReplace, busy }: PdfViewProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const uri = usePdfUri(report);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const open = async () => {
    if (!uri) return;
    setError(null);
    setOpening(true);
    try {
      await new File(uri).preview({ title: report.fileName, mimeType: 'application/pdf' });
    } catch {
      setError("Couldn't open the PDF. You may need an app that can view PDFs.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={[pdfStyles.box, { paddingTop: insetTop, borderColor: c.glassBorder, backgroundColor: c.panel }]}>
      {uri === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : uri === null ? (
        <NoPdf onReplace={onReplace} busy={busy} />
      ) : (
        <View style={styles.center}>
          <Text style={[styles.icon, { color: c.primary }]}>✦</Text>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
            {report.fileName}
          </Text>
          <Text style={[styles.body, { color: c.mutedText }]}>The original report, as it was uploaded.</Text>
          <GlassButton label="Open PDF" onPress={open} loading={opening} style={styles.button} />
          {error ? (
            <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 30 },
  title: { fontFamily: fonts.display, fontSize: 22, marginTop: 6, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  button: { marginTop: 18, minWidth: 180 },
  error: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 14 },
});
