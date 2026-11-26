import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { type AuditFolder, FolderPickError, pickAuditFolder, releaseAuditFolder } from '../audit/folderPicker';
import { MAX_AUDIT_FILES } from '../audit/folderPicker.types';
import { readAuditFiles } from '../audit/readAuditFiles';
import { AuditRunError, createModelClient } from '../audit/pipeline/modelClient';
import { runAuditPipeline, type StepStatus } from '../audit/pipeline/runPipeline';
import { canDownload, downloadFiles } from '../audit/download';
import { createDriveFolder, DriveError, driveAvailable, getDriveToken, preloadDrive, uploadToDrive } from '../audit/googleDrive';
import type { DriveFile, DriveFolder } from '../audit/googleDrive.types';
import { driveFolderId, googleDriveConfigured } from '../audit/googleConfig';
import { useAiConfig } from '../settings/AiConfigContext';
import { useDataFolder } from '../settings/DataFolderContext';

const PREVIEW_COUNT = 8;

type Status = { kind: 'success' | 'error'; message: string } | null;

/** Where a running audit is, shown while it works. */
type Progress = { message: string } | null;

/** A finished (or stopped) run: what each step did, its files, and where they ended up. */
interface Finished {
  name: string;
  steps: StepStatus[];
  /** Each saved phase's files, in order. */
  phases: { phase: number; files: DriveFile[]; savedToDrive: boolean }[];
  /** The run's Drive folder, once created. */
  driveFolder?: DriveFolder;
  /** Why some results aren't in Drive, if they aren't. */
  driveProblem?: string;
  /** Why the run stopped early, if it did. */
  error?: string;
}

const STATUS_LABEL: Record<StepStatus['status'], string> = {
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
  'not run': 'Not run',
};

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
  const [progress, setProgress] = useState<Progress>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { savedAi } = useAiConfig();
  const { folderUrl } = useDataFolder();

  // Results go to the Drive data folder from Settings when Drive is set up and the link is a Drive folder.
  const driveTarget = driveAvailable && googleDriveConfigured() && driveFolderId(folderUrl) ? folderUrl : null;
  useEffect(() => preloadDrive(), []);

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

  const start = async () => {
    const auditName = name.trim();
    if (!auditName) {
      setStatus({ kind: 'error', message: 'Give the audit a name.' });
      return;
    }
    if (!folder) return;
    if (!savedAi.apiKey.trim()) {
      setStatus({ kind: 'error', message: 'Add an AI API key in Settings before running an audit.' });
      return;
    }
    let client;
    try {
      client = createModelClient(savedAi.apiKey, savedAi.model);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof AuditRunError ? e.message : 'Check the AI settings.' });
      return;
    }
    setStatus(null);
    setFinished(null);
    const startedAt = new Date();
    const controller = new AbortController();
    abortRef.current = controller;
    const run: Finished = { name: auditName, steps: [], phases: [] };

    // Saves one phase's files: into the run's Drive folder (made on first use), or kept for later.
    const savePhase = async (phase: number, files: DriveFile[]) => {
      const entry = { phase, files, savedToDrive: false };
      run.phases.push(entry);
      if (!driveTarget || run.driveProblem) return;
      try {
        if (!run.driveFolder) {
          const stamp = startedAt.toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
          run.driveFolder = await createDriveFolder(driveTarget, `${auditName} — audit — ${stamp}`);
        }
        await uploadToDrive(run.driveFolder.id, files);
        entry.savedToDrive = true;
      } catch (e) {
        // Keep going: the audit continues, and the results can be saved or downloaded at the end.
        run.driveProblem = e instanceof DriveError ? e.message : "Couldn't save to Google Drive.";
      }
    };

    try {
      // Sign in first, while this is still a button press: browsers block the popup later.
      if (driveTarget) {
        setProgress({ message: 'Signing in to Google…' });
        await getDriveToken();
      }

      setProgress({ message: 'Reading files…' });
      const data = await readAuditFiles(folder.files, (done, total) =>
        setProgress({ message: `Reading files… ${done} of ${total}` }),
      );
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const result = await runAuditPipeline({
        client,
        auditName,
        data,
        signal: controller.signal,
        onProgress: (message) => setProgress({ message }),
        onPhaseComplete: savePhase,
      });
      run.steps = result.steps;
    } catch (e) {
      if (controller.signal.aborted) {
        setStatus({ kind: 'error', message: 'Audit cancelled.' });
      } else {
        run.error =
          e instanceof AuditRunError || e instanceof DriveError || e instanceof FolderPickError
            ? e.message
            : 'The audit stopped because of an unexpected error.';
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }

    if (!run.phases.length && !run.steps.length) {
      if (run.error) setStatus({ kind: 'error', message: run.error });
      return;
    }
    if (!driveTarget) {
      run.driveProblem = !driveAvailable
        ? 'Saving to Google Drive works in the web version for now.'
        : !googleDriveConfigured()
          ? 'Google Drive is not set up for this app yet (see GOOGLE_DRIVE_SETUP.md).'
          : 'Set a Google Drive data folder in Settings to save results there.';
    }
    setFinished({ ...run });
  };

  /** Retries saving any phases that didn't reach Drive. Runs from a button press, so sign-in can open. */
  const saveRemaining = async () => {
    if (!finished || !driveTarget) return;
    const next: Finished = { ...finished, phases: finished.phases.map((p) => ({ ...p })), driveProblem: undefined };
    setProgress({ message: 'Saving to Google Drive…' });
    try {
      await getDriveToken();
      if (!next.driveFolder) {
        next.driveFolder = await createDriveFolder(driveTarget, `${next.name} — audit — ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')}`);
      }
      for (const p of next.phases) {
        if (p.savedToDrive) continue;
        await uploadToDrive(next.driveFolder.id, p.files);
        p.savedToDrive = true;
      }
    } catch (e) {
      next.driveProblem = e instanceof DriveError ? e.message : "Couldn't save to Google Drive.";
    } finally {
      setProgress(null);
      setFinished(next);
    }
  };

  const cancel = () => abortRef.current?.abort();
  const running = progress !== null;

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
                  disabled={running}
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

              <GlassButton label="Choose a different folder" variant="ghost" onPress={choose} loading={picking} disabled={running} />
            </View>
          ) : (
            <Pressable
              onPress={choose}
              disabled={picking || running}
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

        {finished ? (
          <GlassCard style={styles.card}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              {finished.error ? 'Audit stopped' : 'Audit finished'}
            </Text>
            {finished.error ? <Text style={[styles.resultText, { color: c.danger }]}>{finished.error}</Text> : null}

            {finished.steps.length ? (
              <View style={styles.stepList}>
                {finished.steps.map((s) => (
                  <View key={s.step} style={styles.stepRow}>
                    <Text style={[styles.stepName, { color: c.text }]} numberOfLines={2}>
                      Phase {s.phase} · Step {s.step}: {s.title}
                    </Text>
                    <Text
                      style={[
                        styles.stepState,
                        { color: s.status === 'done' ? c.success : s.status === 'failed' ? c.danger : c.mutedText },
                      ]}
                    >
                      {STATUS_LABEL[s.status]}
                      {s.prompts ? ` · ${s.prompts} prompt${s.prompts === 1 ? '' : 's'}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {finished.phases.length ? (
              <Text style={[styles.resultText, { color: c.mutedText }]}>
                Saved after {finished.phases.map((p) => `Phase ${p.phase}`).join(', ')}
                {finished.phases.every((p) => p.savedToDrive) ? ' to Google Drive.' : '.'}
              </Text>
            ) : null}
            {finished.driveProblem ? (
              <Text style={[styles.resultText, { color: c.mutedText }]}>Not saved to Drive: {finished.driveProblem}</Text>
            ) : null}

            <View style={styles.resultActions}>
              {finished.driveFolder ? (
                <GlassButton
                  label="Open in Drive"
                  onPress={() => Linking.openURL(finished.driveFolder!.url).catch(() => {})}
                  style={styles.flex}
                />
              ) : null}
              {driveTarget && finished.phases.some((p) => !p.savedToDrive) ? (
                <GlassButton label="Save to Drive" onPress={saveRemaining} disabled={running} style={styles.flex} />
              ) : null}
              {canDownload && finished.phases.length ? (
                <GlassButton
                  label="Download results"
                  variant="ghost"
                  onPress={() => downloadFiles(finished.phases.flatMap((p) => p.files), finished.name)}
                  style={styles.flex}
                />
              ) : null}
            </View>
          </GlassCard>
        ) : null}

        {status ? (
          <Text
            style={[styles.status, { color: status.kind === 'success' ? c.success : c.danger }]}
            accessibilityLiveRegion="polite"
          >
            {status.message}
          </Text>
        ) : null}

        {running ? (
          <View style={styles.progressRow} accessibilityLiveRegion="polite">
            <ActivityIndicator color={c.primary} />
            <Text style={[styles.progressText, { color: c.text }]}>{progress?.message}</Text>
          </View>
        ) : null}

        {running ? (
          <GlassButton label="Cancel" variant="ghost" onPress={cancel} />
        ) : (
          <>
            <GlassButton label="Start audit" onPress={start} disabled={!folder} />
            <Text style={[styles.destination, { color: c.mutedText }]}>
              {driveTarget
                ? 'Runs every step that has a prompt, one at a time, and saves to a new folder in your Google Drive data folder after each phase.'
                : canDownload
                  ? 'Results can be downloaded when the audit finishes. Set a Google Drive data folder in Settings to save them there.'
                  : 'Saving results works in the web version for now.'}
            </Text>
          </>
        )}
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
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  progressText: { fontFamily: fonts.body, fontSize: 14, flexShrink: 1 },
  destination: { fontFamily: fonts.body, fontSize: 12.5, textAlign: 'center', marginTop: 10 },
  resultText: { fontFamily: fonts.body, fontSize: 14, marginBottom: 8 },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  stepList: { gap: 6, marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepName: { flex: 1, fontFamily: fonts.body, fontSize: 13 },
  stepState: { fontFamily: fonts.body, fontSize: 12.5, fontWeight: '600' },
});
