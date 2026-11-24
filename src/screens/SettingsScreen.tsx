import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { Field } from '../components/Field';
import { storage, STORAGE_KEYS } from '../storage';
import { detectProvider } from '../aiProvider';
import { AIConfig, EMPTY_AI, useAiConfig } from '../settings/AiConfigContext';
import { folderProvider, useDataFolder, validateFolderUrl } from '../settings/DataFolderContext';
import { initials, type Profile, useProfile } from '../settings/ProfileContext';
import { Avatar } from '../components/AppHeader';

interface SalesforceConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
}

const EMPTY_SF: SalesforceConfig = { instanceUrl: '', clientId: '', clientSecret: '' };

type Status = { kind: 'success' | 'error'; message: string } | null;

/** Connection settings: AI model key and Salesforce credentials. */
export function SettingsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { savedAi, loaded, setSavedAi } = useAiConfig();

  const [ai, setAi] = useState<AIConfig>(savedAi);
  const [sf, setSf] = useState<SalesforceConfig>(EMPTY_SF);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const { profile: savedProfile, loaded: profileLoaded, saveProfile } = useProfile();
  const [profile, setProfile] = useState<Profile>(savedProfile);
  const [profileStatus, setProfileStatus] = useState<Status>(null);
  const [profileWasLoaded, setProfileWasLoaded] = useState(profileLoaded);
  if (profileLoaded !== profileWasLoaded) {
    setProfileWasLoaded(profileLoaded);
    if (profileLoaded) setProfile(savedProfile);
  }
  const profileChanged =
    profile.name.trim() !== savedProfile.name || profile.role.trim() !== savedProfile.role;

  const handleSaveProfile = async () => {
    try {
      await saveProfile(profile);
      setProfileStatus({ kind: 'success', message: 'Profile saved.' });
    } catch {
      setProfileStatus({ kind: 'error', message: 'Could not save. Please try again.' });
    }
  };

  const { folderUrl, loaded: folderLoaded, saveFolderUrl } = useDataFolder();
  const [folder, setFolder] = useState(folderUrl);
  const [folderStatus, setFolderStatus] = useState<Status>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderWasLoaded, setFolderWasLoaded] = useState(folderLoaded);
  if (folderLoaded !== folderWasLoaded) {
    setFolderWasLoaded(folderLoaded);
    if (folderLoaded) setFolder(folderUrl);
  }

  // If the saved config finishes loading after this screen opened, start the form from it.
  const [wasLoaded, setWasLoaded] = useState(loaded);
  if (loaded !== wasLoaded) {
    setWasLoaded(loaded);
    if (loaded) setAi(savedAi);
  }

  useEffect(() => {
    storage.get(STORAGE_KEYS.salesforceConfig).then((saved) => {
      try {
        if (!saved) return;
        const str = (v: unknown) => (typeof v === 'string' ? v : '');
        const parsed = JSON.parse(saved) ?? {};
        setSf({
          instanceUrl: str(parsed.instanceUrl),
          clientId: str(parsed.clientId),
          clientSecret: str(parsed.clientSecret),
        });
      } catch {
        // ignore corrupt saved data
      }
    });
  }, []);

  const validate = (): string | null => {
    if (!ai.apiKey.trim()) return 'Enter an AI API key.';
    // Salesforce is optional for now; only check it once the user starts filling it in.
    const sfStarted = !!(sf.instanceUrl.trim() || sf.clientId.trim() || sf.clientSecret.trim());
    if (!sfStarted) return null;
    if (!sf.instanceUrl.trim()) return 'Enter your Salesforce instance URL.';
    if (!/^https:\/\/[^\s/]+/i.test(sf.instanceUrl.trim()))
      return 'Salesforce instance URL must start with https://';
    if (!sf.clientId.trim() || !sf.clientSecret.trim())
      return 'Enter the Salesforce consumer key and secret.';
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      setStatus({ kind: 'error', message: error });
      return;
    }
    setSaving(true);
    try {
      const trimmedAi = { apiKey: ai.apiKey.trim(), model: ai.model.trim() };
      const trimmedSf = {
        instanceUrl: sf.instanceUrl.trim().replace(/\/+$/, ''),
        clientId: sf.clientId.trim(),
        clientSecret: sf.clientSecret.trim(),
      };
      await Promise.all([
        storage.set(STORAGE_KEYS.aiConfig, JSON.stringify(trimmedAi)),
        storage.set(STORAGE_KEYS.salesforceConfig, JSON.stringify(trimmedSf)),
      ]);
      setAi(trimmedAi);
      setSavedAi(trimmedAi);
      setSf(trimmedSf);
      setStatus({ kind: 'success', message: 'Connections saved.' });
    } catch {
      setStatus({ kind: 'error', message: 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await Promise.all([
      storage.remove(STORAGE_KEYS.aiConfig),
      storage.remove(STORAGE_KEYS.salesforceConfig),
    ]);
    setAi(EMPTY_AI);
    setSavedAi(EMPTY_AI);
    setSf(EMPTY_SF);
    setStatus({ kind: 'success', message: 'Saved connections cleared.' });
  };

  const handleSaveFolder = async () => {
    const error = validateFolderUrl(folder);
    if (error) {
      setFolderStatus({ kind: 'error', message: error });
      return;
    }
    setSavingFolder(true);
    try {
      await saveFolderUrl(folder);
      setFolder(folder.trim());
      setFolderStatus({
        kind: 'success',
        message: folder.trim() ? 'Data folder saved.' : 'Data folder removed.',
      });
    } catch {
      setFolderStatus({ kind: 'error', message: 'Could not save. Please try again.' });
    } finally {
      setSavingFolder(false);
    }
  };

  const savedFolderProvider = folderUrl ? folderProvider(folderUrl) : null;
  const folderHint = savedFolderProvider
    ? `Linked to ${savedFolderProvider}. Share the folder so anyone with the link can view it.`
    : 'A Google Drive, OneDrive, SharePoint, Dropbox or Box folder link.';

  const provider = detectProvider(ai.apiKey);
  const keyHint = !ai.apiKey.trim()
    ? 'The provider is detected automatically from the key.'
    : provider
      ? `Detected: ${provider.label}`
      : 'Provider not recognized from this key.';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: c.mutedText }]}>
          Your profile and the connections Starstell uses for chat, report data and organizational data.
        </Text>

        <GlassCard style={styles.card}>
          <View style={styles.profileHead}>
            <Avatar initials={initials(profile.name)} size={52} />
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Profile</Text>
              <Text style={[styles.cardSubtitle, styles.noMargin, { color: c.mutedText }]}>
                Shown in the top right of every page.
              </Text>
            </View>
          </View>
          <Field
            label="Name"
            value={profile.name}
            onChangeText={(name) => {
              setProfile((prev) => ({ ...prev, name }));
              setProfileStatus(null);
            }}
            placeholder="Your name"
            autoCapitalize="words"
          />
          <Field
            label="Role (optional)"
            value={profile.role}
            onChangeText={(role) => {
              setProfile((prev) => ({ ...prev, role }));
              setProfileStatus(null);
            }}
            placeholder="e.g. Operations Manager"
          />
          {profileStatus ? (
            <Text
              style={[styles.inlineStatus, { color: profileStatus.kind === 'success' ? c.success : c.danger }]}
              accessibilityLiveRegion="polite"
            >
              {profileStatus.message}
            </Text>
          ) : null}
          <GlassButton label="Save profile" onPress={handleSaveProfile} disabled={!profileChanged} />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, { color: c.text }]}>AI Model</Text>
          <Text style={[styles.cardSubtitle, { color: c.mutedText }]}>
            The language model that performs the analysis.
          </Text>
          <Field
            label="API key"
            secret
            value={ai.apiKey}
            onChangeText={(apiKey) => setAi((prev) => ({ ...prev, apiKey }))}
            placeholder="Paste your API key"
            hint={keyHint}
          />
          <Field
            label="Model (optional)"
            value={ai.model}
            onChangeText={(model) => setAi((prev) => ({ ...prev, model }))}
            placeholder={provider?.modelHint ?? 'Model name'}
          />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Report data</Text>
          <Text style={[styles.cardSubtitle, { color: c.mutedText }]}>
            A shared folder of CSV files with the information used to build the report.
          </Text>
          <Field
            label="Data folder link"
            value={folder}
            onChangeText={(v) => {
              setFolder(v);
              setFolderStatus(null);
            }}
            placeholder="https://drive.google.com/drive/folders/…"
            keyboardType="url"
            hint={folderHint}
          />
          {folderStatus ? (
            <Text
              style={[styles.inlineStatus, { color: folderStatus.kind === 'success' ? c.success : c.danger }]}
              accessibilityLiveRegion="polite"
            >
              {folderStatus.message}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {folderUrl ? (
              <GlassButton
                label="Open folder"
                variant="ghost"
                onPress={() => Linking.openURL(folderUrl).catch(() => {})}
                style={styles.flex}
              />
            ) : null}
            <GlassButton
              label="Save folder"
              onPress={handleSaveFolder}
              loading={savingFolder}
              disabled={folder.trim() === folderUrl}
              style={styles.flex}
            />
          </View>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Salesforce</Text>
          <Text style={[styles.cardSubtitle, { color: c.mutedText }]}>
            Connected App credentials used to read organizational data.
          </Text>
          <Field
            label="Instance URL"
            value={sf.instanceUrl}
            onChangeText={(instanceUrl) => setSf((prev) => ({ ...prev, instanceUrl }))}
            placeholder="https://yourcompany.my.salesforce.com"
            keyboardType="url"
          />
          <Field
            label="Consumer key (client ID)"
            value={sf.clientId}
            onChangeText={(clientId) => setSf((prev) => ({ ...prev, clientId }))}
            placeholder="Connected App consumer key"
          />
          <Field
            label="Consumer secret (client secret)"
            secret
            value={sf.clientSecret}
            onChangeText={(clientSecret) => setSf((prev) => ({ ...prev, clientSecret }))}
            placeholder="Connected App consumer secret"
            hint="Found under Setup → App Manager → your Connected App."
          />
        </GlassCard>

        {status ? (
          <Text
            style={[styles.status, { color: status.kind === 'success' ? c.success : c.danger }]}
            accessibilityLiveRegion="polite"
          >
            {status.message}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <GlassButton label="Clear" variant="ghost" onPress={handleClear} style={styles.flex} />
          <GlassButton label="Save connections" onPress={handleSave} loading={saving} style={styles.saveButton} />
        </View>
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
  cardTitle: { fontFamily: fonts.body, fontSize: 19, fontWeight: '700' },
  cardSubtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: 4, marginBottom: 16 },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  noMargin: { marginTop: 2, marginBottom: 0 },
  inlineStatus: { fontFamily: fonts.body, fontSize: 13, marginTop: -4, marginBottom: 12 },
  status: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  saveButton: { flex: 2 },
});
