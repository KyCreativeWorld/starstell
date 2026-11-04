import Anthropic from '@anthropic-ai/sdk';
import { detectProvider, ProviderInfo } from './aiProvider';

const SYSTEM_PROMPT =
  'You are Starstell, an AI consultant that helps operations leaders, department managers, ' +
  'and HR teams with workforce planning, AI adoption, and reskilling. You are answering in a ' +
  'small chat window, so keep replies short and plain (a few sentences or a brief list). ' +
  "You do not yet have access to the user's organizational data; when an answer depends on " +
  'it, say what information you would need instead of guessing.';

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/** A message the user can read, with a friendly explanation. */
export class ChatError extends Error {}

/**
 * One conversation with the configured AI provider. Keeps the provider-format
 * history itself, so each send() includes the full conversation.
 */
export class ChatClient {
  readonly provider: ProviderInfo;
  readonly model: string;
  private readonly apiKey: string;
  private anthropic?: Anthropic;
  // Anthropic history keeps each response's full content (including thinking
  // blocks), appended unchanged, as the API expects.
  private anthropicHistory: Anthropic.Beta.BetaMessageParam[] = [];
  private openaiHistory: { role: 'user' | 'assistant'; content: string }[] = [];

  constructor(apiKey: string, model: string) {
    const provider = detectProvider(apiKey);
    if (!provider) {
      throw new ChatError(
        "Couldn't tell which AI provider this key belongs to. Supported: Anthropic, OpenAI, Google Gemini, xAI, Groq, OpenRouter.",
      );
    }
    const chosenModel = model.trim() || provider.defaultModel;
    if (!chosenModel) {
      throw new ChatError(`Enter a model name above to chat with ${provider.label}.`);
    }
    this.provider = provider;
    this.model = chosenModel;
    this.apiKey = apiKey.trim();

    if (provider.id === 'anthropic') {
      // The key is the user's own and stays in their browser/device; there is no
      // server in between, so the SDK's browser guard is explicitly allowed.
      this.anthropic = new Anthropic({ apiKey: this.apiKey, dangerouslyAllowBrowser: true });
    }
  }

  async send(text: string): Promise<string> {
    return this.anthropic ? this.sendAnthropic(text) : this.sendOpenAICompatible(text);
  }

  private async sendAnthropic(text: string): Promise<string> {
    const client = this.anthropic!;
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...this.anthropicHistory,
      { role: 'user', content: text },
    ];
    const useFallbacks = FALLBACK_MODELS.has(this.model);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
        // On a safety decline, the API re-runs the request on a suitable fallback model.
        ...(useFallbacks
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
    } catch (error) {
      throw new ChatError(describeAnthropicError(error, this.model));
    }

    // Only commit the turn once it succeeded, so a failed send can simply be retried.
    this.anthropicHistory = [...messages, { role: 'assistant', content: response.content }];

    const reply = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (response.stop_reason === 'refusal') {
      return reply || 'The model declined to answer that request.';
    }
    if (response.stop_reason === 'max_tokens') {
      return `${reply}\n\n(Reply was cut off at the length limit.)`;
    }
    return reply || '(No text in the response.)';
  }

  private async sendOpenAICompatible(text: string): Promise<string> {
    const history = [...this.openaiHistory, { role: 'user' as const, content: text }];
    let res: Response;
    try {
      res = await fetch(this.provider.endpoint!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        }),
      });
    } catch {
      throw new ChatError(
        `Couldn't reach ${this.provider.label}. Check your connection; some providers also block requests made directly from a web page.`,
      );
    }

    const body: any = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.error?.message ?? body?.[0]?.error?.message ?? res.statusText;
      if (res.status === 401 || res.status === 403) {
        throw new ChatError(`${this.provider.label} rejected the API key. ${detail ?? ''}`.trim());
      }
      if (res.status === 429) throw new ChatError(`Rate limited by ${this.provider.label}. Try again shortly.`);
      throw new ChatError(`${this.provider.label} error ${res.status}: ${detail}`);
    }

    const reply: string = body?.choices?.[0]?.message?.content?.trim?.() ?? '';
    this.openaiHistory = [...history, { role: 'assistant', content: reply }];
    return reply || '(No text in the response.)';
  }
}

function describeAnthropicError(error: unknown, model: string): string {
  // Most specific first: APIConnectionError and the status errors all extend APIError.
  if (error instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Check that it is correct and active.';
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have permission for that request.";
  if (error instanceof Anthropic.NotFoundError) return `Model "${model}" was not found. Check the Model field.`;
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Try again shortly.';
  if (error instanceof Anthropic.BadRequestError) return `Request rejected: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your internet connection.";
  if (error instanceof Anthropic.InternalServerError) return 'Anthropic had a server error. Try again in a moment.';
  if (error instanceof Anthropic.APIError) return `Anthropic error ${error.status ?? ''}: ${error.message}`.trim();
  return error instanceof Error ? error.message : 'Something went wrong.';
}
