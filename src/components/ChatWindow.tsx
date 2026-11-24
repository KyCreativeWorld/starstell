import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';
import { ChatClient, ChatError } from '../chatClient';
import { Reflection } from './Glass';

interface DisplayMessage {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

/**
 * Chat panel connected to the saved AI API key. By default a small collapsible
 * panel; with `fill` it takes the available height and stays open.
 */
export function ChatWindow({
  apiKey,
  model,
  fill = false,
}: {
  apiKey: string;
  model: string;
  fill?: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [expandedState, setExpanded] = useState(true);
  const expanded = fill || expandedState;
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const nextId = useRef(0);

  // A new client (and a fresh conversation) whenever the saved key or model changes.
  const { client, setupError } = useMemo(() => {
    if (!apiKey.trim()) return { client: null, setupError: null };
    try {
      return { client: new ChatClient(apiKey, model), setupError: null };
    } catch (e) {
      return { client: null, setupError: e instanceof Error ? e.message : String(e) };
    }
  }, [apiKey, model]);

  // New client → fresh conversation. (Adjusting state during render, not in an effect.)
  const [prevClient, setPrevClient] = useState(client);
  if (client !== prevClient) {
    setPrevClient(client);
    setMessages([]);
    // Stay out of the way until there's a key to chat with.
    setExpanded(!!client);
  }

  const add = (role: DisplayMessage['role'], text: string) =>
    setMessages((prev) => [...prev, { id: nextId.current++, role, text }]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !client || sending) return;
    setDraft('');
    add('user', text);
    setSending(true);
    try {
      add('assistant', await client.send(text));
    } catch (e) {
      add('error', e instanceof ChatError || e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const status = !apiKey.trim()
    ? 'Add an AI API key in Settings to start chatting.'
    : setupError
      ? setupError
      : `${client!.provider.label} · ${client!.model}`;

  const canSend = !!client && !!draft.trim() && !sending;

  return (
    <View
      style={[
        styles.panel,
        fill && styles.panelFill,
        frosted,
        {
          backgroundColor: c.panel,
          borderColor: c.glassBorder,
          borderTopColor: c.glassHighlight,
          shadowColor: c.shadow,
          backgroundImage: c.glassSheen,
        },
      ]}
    >
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        disabled={fill}
        accessibilityRole={fill ? undefined : 'button'}
        accessibilityLabel={fill ? undefined : expanded ? 'Minimize chat' : 'Expand chat'}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: c.text }]}>Ask Starstell</Text>
          <Text
            numberOfLines={1}
            style={[styles.status, { color: setupError ? c.danger : c.mutedText }]}
          >
            {status}
          </Text>
        </View>
        {messages.length > 0 && expanded ? (
          <Pressable
            onPress={() => setMessages([])}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear chat"
          >
            <Text style={[styles.headerAction, { color: c.primary }]}>Clear</Text>
          </Pressable>
        ) : null}
        {fill ? null : (
          <Text style={[styles.chevron, { color: c.mutedText }]}>{expanded ? '▾' : '▴'}</Text>
        )}
      </Pressable>

      {expanded ? (
        <>
          <ScrollView
            ref={scrollRef}
            style={fill ? styles.messagesFill : styles.messages}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <Text style={[styles.empty, { color: c.mutedText }]}>
                Ask about AI adoption, role changes, or reskilling.
              </Text>
            ) : null}
            {messages.map((m) => {
              const mine = m.role === 'user';
              return (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    {
                      backgroundColor: mine ? c.buttonBg : c.inputBg,
                      borderColor: m.role === 'error' ? c.danger : mine ? 'transparent' : c.inputBorder,
                    },
                  ]}
                >
                  <Text
                    selectable
                    style={[
                      styles.bubbleText,
                      { color: m.role === 'error' ? c.danger : mine ? c.buttonText : c.text },
                    ]}
                  >
                    {m.text}
                  </Text>
                </View>
              );
            })}
            {sending ? (
              <View
                style={[
                  styles.bubble,
                  styles.bubbleTheirs,
                  { backgroundColor: c.inputBg, borderColor: c.inputBorder },
                ]}
              >
                <ActivityIndicator size="small" color={c.primary} />
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              submitBehavior="submit"
              editable={!!client}
              placeholder={client ? 'Type a message…' : 'Chat unavailable'}
              placeholderTextColor={c.placeholder}
              returnKeyType="send"
              style={[
                styles.input,
                { color: c.text, backgroundColor: c.inputBg, borderColor: c.inputBorder },
              ]}
            />
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={({ pressed }) => [
                styles.send,
                {
                  backgroundColor: c.buttonBg,
                  borderTopColor: c.glassHighlight,
                  opacity: !canSend ? 0.45 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Reflection />
              <Text style={[styles.sendText, { color: c.buttonText }]}>Send</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    maxWidth: 520, // matches the cards above

    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 4,
  },
  panelFill: { flex: 1, maxWidth: 720, paddingHorizontal: 16, paddingVertical: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  status: { fontFamily: fonts.body, fontSize: 12, marginTop: 1 },
  headerAction: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  chevron: { fontSize: 14, width: 16, textAlign: 'center' },
  messages: { height: 170, marginTop: 10 },
  messagesFill: { flex: 1, minHeight: 160, marginTop: 12 },
  messagesContent: { gap: 8, paddingBottom: 4 },
  empty: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center', marginTop: 56 },
  bubble: {
    maxWidth: '85%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    outlineStyle: 'none' as any,
  },
  send: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sendText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
});
