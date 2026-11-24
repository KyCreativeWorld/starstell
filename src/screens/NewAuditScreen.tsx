import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { type AuditFolder, FolderPickError, pickAuditFolder, releaseAuditFolder } from '../audit/folderPicker';
import { MAX_AUDIT_FILES } from '../audit/folderPicker.types';

const PREVIEW_COUNT = 8;

type Status = { kind: 'success' | 'error'; message: string } | null;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Start a new audit: name it and choose the folder of files to audit. */
export function NewAuditScreen() {
  const { theme } = useTheme();
  const c = theme.colors;

  const [name, setName] = useState('');
  const [folder, setFolder] = useState<AuditFolder | null>(null);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // Free web blob URLs when the folder is replaced or the screen goes away.
  const folderRef = useRef<AuditFolder | null>(null);
  useEffect(() => () => releaseAuditFolder(folderRef.current), []);

  const choose = async () => {
    setStatus(null);
    setPicking(true);
    try {
      const picked = await pickAuditFolder();
      if (!picked) return;
      if (!picked.files.length) {
        setStatus({ kind: 'error', message: 'That folder has no files in it.' });
        return;
      }
      releaseAuditFolder(folderRef.current);
      folderRef.current = picked;
      setFolder(picked);
      if (!name.trim()) setName(picked.name);
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof FolderPickError ? e.message : "Couldn't open that folder. Try again.",
      });
    } finally {
      setPicking(false);
    }
  };

  const remove = () => {
    releaseAuditFolder(folderRef.current);
    folderRef.current = null;
    setFolder(null);
    setStatus(null);
  };

  const start = () => {
    if (!name.trim()) {
      setStatus({ kind: 'error', message: 'Give the audit a name.' });
      return;
    }
    // Running the audit isn't built yet.
    setStatus({ kind: 'success', message: `Ready to audit ${folder?.files.length ?? 0} files. Audit processing is coming soon.` });
  };

  const totalSize = folder?.files.reduce((sum, f) => sum + f.size, 0) ?? 0;
  const truncated = (folder?.files.length ?? 0) >= MAX_AUDIT_FILES;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.text }]}>Start a new audit</Text>
        <Text style={[styles.subtitle, { color: c.mutedText }]}>
          Choose the folder of files you want audited. Files are read on this device.
        </Text>

        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Details</Text>
          <Field
            label="Audit name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setStatus(null);
            }}
            placeholder="e.g. Q3 operations review"
            autoCapitalize="sentences"
          />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Folder to audit</Text>
          <Text style={[styles.cardSubtitle, { color: c.mutedText }]}>
            Every file inside the folder, including subfolders, is included.
          </Text>

          {folder ? (
            <View>
              <View style={[styles.folderRow, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
                <Icon name="folder" color={c.primary} size={28} />
                <View style={styles.flex}>
                  <Text style={[styles.folderName, { color: c.text }]} numberOfLines={1}>
                    {folder.name}
                  </Text>
                  <Text style={[styles.meta, { color: c.mutedText }]}>
                    {folder.files.length}
                    {truncated ? '+' : ''} {folder.files.length === 1 ? 'file' : 'files'} · {formatBytes(totalSize)}
                  </Text>
                </View>
                <Pressable
                  onPress={remove}
                  accessibilityRole="button"
                  accessibilityLabel="Remove folder"
                  hitSlop={10}
                  style={styles.iconButton}
                >
                  <Icon name="close" color={c.mutedText} size={18} />
                </Pressable>
              </View>

              <View style={styles.fileList}>
                {folder.files.slice(0, PREVIEW_COUNT).map((f) => (
                  <View key={f.path} style={styles.fileRow}>
                    <Text style={[styles.filePath, { color: c.text }]} numberOfLines={1}>
                      {f.path}
                    </Text>
                    <Text style={[styles.meta, { color: c.mutedText }]}>{formatBytes(f.size)}</Text>
                  </View>
                ))}
                {folder.files.length > PREVIEW_COUNT ? (
                  <Text style={[styles.meta, { color: c.mutedText }]}>
                    and {folder.files.length - PREVIEW_COUNT} more
                  </Text>
                ) : null}
              </View>

              <GlassButton label="Choose a different folder" variant="ghost" onPress={choose} loading={picking} />
            </View>
          ) : (
            <Pressable
              onPress={choose}
              disabled={picking}
              accessibilityRole="button"
              accessibilityLabel="Choose a folder to audit"
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.drop,
                { borderColor: pressed || hovered ? c.primary : c.inputBorder, backgroundColor: c.inputBg },
              ]}
            >
              <Icon name="folder" color={c.primary} size={40} />
              <Text style={[styles.dropTitle, { color: c.text }]}>{picking ? 'Opening…' : 'Choose a folder'}</Text>
              <Text style={[styles.meta, { color: c.mutedText }]}>Tap to browse for the folder to audit</Text>
            </Pressable>
          )}
        </GlassCard>

        {status ? (
          <Text
            style={[styles.status, { color: status.kind === 'success' ? c.success : c.danger }]}
            accessibilityLiveRegion="polite"
          >
            {status.message}
          </Text>
        ) : null}

        <GlassButton label="Start audit" onPress={start} disabled={!folder} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  card: { marginBottom: 18 },
  cardTitle: { fontFamily: fonts.body, fontSize: 19, fontWeight: '700', marginBottom: 12 },
  cardSubtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: -8, marginBottom: 16 },
  drop: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  dropTitle: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700', marginTop: 4 },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  folderName: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700' },
  iconButton: { padding: 6 },
  fileList: { gap: 6, marginTop: 12, marginBottom: 14, paddingHorizontal: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filePath: { flex: 1, fontFamily: fonts.body, fontSize: 13 },
  meta: { fontFamily: fonts.body, fontSize: 12.5 },
  status: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', marginBottom: 12 },
});
