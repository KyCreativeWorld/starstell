export type AIProvider = 'anthropic' | 'openai' | 'google' | 'xai' | 'groq' | 'openrouter';

export interface ProviderInfo {
  id: AIProvider;
  label: string;
  modelHint: string;
}

// Most providers issue keys with a recognizable prefix, so the user doesn't
// have to pick one. Order matters: more specific prefixes come first.
const PREFIXES: { prefix: string; info: ProviderInfo }[] = [
  { prefix: 'sk-ant-', info: { id: 'anthropic', label: 'Anthropic', modelHint: 'e.g. claude-opus-5-5' } },
  { prefix: 'sk-or-', info: { id: 'openrouter', label: 'OpenRouter', modelHint: 'e.g. anthropic/claude-opus-5-5' } },
  { prefix: 'sk-', info: { id: 'openai', label: 'OpenAI', modelHint: 'e.g. gpt-5' } },
  { prefix: 'AIza', info: { id: 'google', label: 'Google Gemini', modelHint: 'e.g. gemini-2.5-pro' } },
  { prefix: 'xai-', info: { id: 'xai', label: 'xAI', modelHint: 'e.g. grok-4' } },
  { prefix: 'gsk_', info: { id: 'groq', label: 'Groq', modelHint: 'e.g. llama-3.3-70b-versatile' } },
];

/** Returns the provider a key belongs to, or null if the prefix isn't recognized. */
export function detectProvider(apiKey: string): ProviderInfo | null {
  const key = apiKey.trim();
  if (!key) return null;
  return PREFIXES.find((p) => key.startsWith(p.prefix))?.info ?? null;
}
