import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { Field } from '../components/Field';
import { ThemePicker } from '../components/ThemePicker';
import { ChatWindow } from '../components/ChatWindow';
import { storage, STORAGE_KEYS } from '../storage';
import { detectProvider } from '../aiProvider';

interface AIConfig {
  apiKey: string;
  model: string;
}

interface SalesforceConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
}

const EMPTY_AI: AIConfig = { apiKey: '', model: '' };
const EMPTY_SF: SalesforceConfig = { instanceUrl: '', clientId: '', clientSecret: '' };

type Status = { kind: 'success' | 'error'; message: string } | null;

export function HomeScreen() {
  const { theme } = useTheme();
  const c = theme.colors;

  const [ai, setAi] = useState<AIConfig>(EMPTY_AI);
  // What's actually saved — the chat uses this, not unsaved edits in the form.
  const [savedAi, setSavedAi] = useState<AIConfig>(EMPTY_AI);
  const [sf, setSf] = useState<SalesforceConfig>(EMPTY_SF);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // Load previously saved connection details.
  useEffect(() => {
    (async () => {
      const [savedAi, savedSf] = await Promise.all([
        storage.get(STORAGE_KEYS.aiConfig),
        storage.get(STORAGE_KEYS.salesforceConfig),
      ]);
      try {
        // Only accept string fields, so odd saved data can't crash the app.
        const str = (v: unknown) => (typeof v === 'string' ? v : '');
        if (savedAi) {
          const parsed = JSON.parse(savedAi) ?? {};
          const loaded = { apiKey: str(parsed.apiKey), model: str(parsed.model) };
          setAi(loaded);
          setSavedAi(loaded);
        }
        if (savedSf) {
          const parsed = JSON.parse(savedSf) ?? {};
          setSf({
            instanceUrl: str(parsed.instanceUrl),
            clientId: str(parsed.clientId),
            clientSecret: str(parsed.clientSecret),
          });
        }
      } catch {
        // ignore corrupt saved data
      }
    })();
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
      const trimmedAi = { ...ai, apiKey: ai.apiKey.trim(), model: ai.model.trim() };
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

  const provider = detectProvider(ai.apiKey);
  const keyHint = !ai.apiKey.trim()
    ? 'The provider is detected automatically from the key.'
    : provider
      ? `Detected: ${provider.label}`
      : 'Provider not recognized from this key.';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <ThemePicker />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.wordmark, { color: theme.dark ? c.primary : c.text }]}>
              STARSTELL
            </Text>
            <Text style={[styles.tagline, { color: c.mutedText }]}>
              AI consultant for workforce planning and reskilling
            </Text>
          </View>

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
              style={[
                styles.status,
                { color: status.kind === 'success' ? c.success : c.danger },
              ]}
              accessibilityLiveRegion="polite"
            >
              {status.message}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <GlassButton label="Clear" variant="ghost" onPress={handleClear} style={styles.flex} />
            <GlassButton
              label="Save connections"
              onPress={handleSave}
              loading={saving}
              style={styles.saveButton}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <ChatWindow apiKey={savedAi.apiKey} model={savedAi.model} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  header: { alignItems: 'center', marginBottom: 28 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  card: { marginBottom: 18 },
  cardTitle: { fontFamily: fonts.body, fontSize: 19, fontWeight: '700' },
  cardSubtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: 4, marginBottom: 16 },
  status: {
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  actions: { flexDirection: 'row', gap: 12 },
  saveButton: { flex: 2 },
  footer: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
});
