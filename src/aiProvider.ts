export type AIProvider = 'anthropic' | 'openai' | 'google' | 'xai' | 'groq' | 'openrouter';

export interface ProviderInfo {
  id: AIProvider;
  label: string;
  /** Example shown in the Model field. */
  modelHint: string;
  /** Model used when the Model field is left blank. Undefined = the user must enter one. */
  defaultModel?: string;
  /** Chat Completions endpoint for providers that speak the OpenAI-style API. */
  endpoint?: string;
}

const ANTHROPIC: ProviderInfo = {
  id: 'anthropic',
  label: 'Anthropic',
  modelHint: 'Default: claude-opus-5-5',
  defaultModel: 'claude-opus-5-5',
};

// Most providers issue keys with a recognizable prefix, so the user doesn't
// have to pick one. Order matters: more specific prefixes come first.
const PREFIXES: { prefix: string; info: ProviderInfo }[] = [
  { prefix: 'sk-ant-', info: ANTHROPIC },
  {
    prefix: 'sk-or-',
    info: {
      id: 'openrouter',
      label: 'OpenRouter',
      modelHint: 'Default: openrouter/auto',
      defaultModel: 'openrouter/auto',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    },
  },
  {
    prefix: 'sk-',
    info: {
      id: 'openai',
      label: 'OpenAI',
      modelHint: 'Required, e.g. an OpenAI model name',
      endpoint: 'https://api.openai.com/v1/chat/completions',
    },
  },
  {
    prefix: 'AIza',
    info: {
      id: 'google',
      label: 'Google Gemini',
      modelHint: 'Required, e.g. a Gemini model name',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    },
  },
  {
    prefix: 'xai-',
    info: {
      id: 'xai',
      label: 'xAI',
      modelHint: 'Required, e.g. a Grok model name',
      endpoint: 'https://api.x.ai/v1/chat/completions',
    },
  },
  {
    prefix: 'gsk_',
    info: {
      id: 'groq',
      label: 'Groq',
      modelHint: 'Required, e.g. a Groq model name',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    },
  },
];

/** Returns the provider a key belongs to, or null if the prefix isn't recognized. */
export function detectProvider(apiKey: string): ProviderInfo | null {
  const key = apiKey.trim();
  if (!key) return null;
  return PREFIXES.find((p) => key.startsWith(p.prefix))?.info ?? null;
}
