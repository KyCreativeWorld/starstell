import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { NoPdf, pdfStyles, usePdfUri, type PdfViewProps } from './PdfView.shared';

/** Web: the original report PDF in the browser's built-in viewer. */
export function PdfView({ report, insetTop, insetRight, onReplace, busy }: PdfViewProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const uri = usePdfUri(report);

  return (
    <View style={[pdfStyles.box, { paddingTop: insetTop, borderColor: c.glassBorder, backgroundColor: c.panel }]}>
      {uri === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : uri === null ? (
        <NoPdf onReplace={onReplace} busy={busy} />
      ) : (
        <>
          <View style={[pdfStyles.header, { paddingRight: 16 + insetRight }]}>
            <Text style={[pdfStyles.fileName, { color: c.text }]} numberOfLines={1}>
              {report.fileName}
            </Text>
            <Pressable
              onPress={() => window.open(uri, '_blank', 'noopener')}
              accessibilityRole="link"
              accessibilityLabel="Open the PDF in a new tab"
              style={({ pressed }) => [styles.link, { borderColor: c.glassBorder, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.linkText, { color: c.primary }]}>New tab ↗</Text>
            </Pressable>
          </View>
          <View style={[styles.frameWrap, { borderTopColor: c.glassBorder }]}>
            {React.createElement('iframe', {
              src: uri,
              title: `${report.fileName} (PDF)`,
              style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#ffffff' },
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  link: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  linkText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  frameWrap: { flex: 1, borderTopWidth: 1 },
});
