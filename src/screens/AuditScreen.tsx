import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassCard } from '../components/Glass';
import { AUDIT_PAGES, type AuditPage } from '../audit/auditPages';
import { NewAuditScreen } from './NewAuditScreen';

/** Audit section: shows the audit page chosen in the sidebar dropdown. */
export function AuditScreen({ page }: { page: AuditPage }) {
  return (
    <>
      {/* Stays mounted so a chosen folder survives switching pages. */}
      <View style={[styles.flex, page !== 'new' && styles.hidden]}>
        <NewAuditScreen />
      </View>
      {page !== 'new' ? <AuditPlaceholder page={page} /> : null}
    </>
  );
}

/** Stand-in for audit pages that haven't been built yet. */
function AuditPlaceholder({ page }: { page: AuditPage }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const info = AUDIT_PAGES.find((p) => p.key === page)!;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={[styles.title, { color: c.text }]}>{info.title}</Text>
      <Text style={[styles.subtitle, { color: c.mutedText }]}>{info.description}</Text>
      <GlassCard>
        <Text style={[styles.body, { color: c.mutedText }]}>Coming soon.</Text>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: { fontFamily: fonts.display, fontSize: 32, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, marginTop: 4, marginBottom: 20 },
  body: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
});
