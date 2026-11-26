/**
 * One prompt to the AI provider saved in Settings, as a fresh conversation
 * (nothing carries over between calls). Works with every provider the app
 * supports:
 * - Anthropic: the Anthropic SDK, streamed, with up to 128K output tokens.
 * - OpenAI, Gemini, xAI, Groq, OpenRouter: their OpenAI-style Chat Completions
 *   endpoint, streamed where the platform allows.
 * Rate limits and server errors are retried with backoff.
 */
import Anthropic from '@anthropic-ai/sdk';
import { detectProvider, type ProviderInfo } from '../../aiProvider';
import { describeAnthropicError, FALLBACK_MODELS } from '../../chatClient';

export class AuditRunError extends Error {}

/** Rough tokens from characters. Errs high, so size checks err safe. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 3);

export interface ModelReply {
  text: string;
  /** The reply parsed as JSON, or null if it wasn't valid JSON or was cut off. */
  json: unknown | null;
  /** end_turn, max_tokens (cut off), or the provider's own reason. */
  stopReason: string | null;
  model: string;
  /** null where the provider didn't report usage. */
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface ModelClient {
  provider: ProviderInfo;
  model: string;
  call(args: { system: string; blocks: string[]; signal?: AbortSignal; onChars?: (chars: number) => void }): Promise<ModelReply>;
}

export function createModelClient(apiKey: string, model: string): ModelClient {
  const provider = detectProvider(apiKey);
  if (!provider) {
    throw new AuditRunError(
      "Couldn't tell which AI provider the saved key belongs to. Supported: Anthropic, OpenAI, Google Gemini, xAI, Groq, OpenRouter.",
    );
  }
  const chosen = model.trim() || provider.defaultModel;
  if (!chosen) throw new AuditRunError(`Enter a model name in Settings to run an audit with ${provider.label}.`);
  const key = apiKey.trim();

  if (provider.id === 'anthropic') {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 4 });
    return { provider, model: chosen, call: (a) => callAnthropic(client, chosen, a) };
  }
  return { provider, model: chosen, call: (a) => callOpenAICompatible(provider, key, chosen, a) };
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(
  client: Anthropic,
  model: string,
  { system, blocks, signal, onChars }: { system: string; blocks: string[]; signal?: AbortSignal; onChars?: (n: number) => void },
): Promise<ModelReply> {
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 128_000,
      system,
      messages: [{ role: 'user', content: blocks.map((text) => ({ type: 'text' as const, text })) }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      // On a safety decline, the API re-runs the request on a suitable fallback model.
      ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    { signal },
  );
  stream.on('text', (_d, snapshot) => onChars?.(snapshot.length));

  let final: Anthropic.Beta.BetaMessage;
  try {
    final = await stream.finalMessage();
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new AuditRunError(describeAnthropicError(e, model));
  }
  if (final.stop_reason === 'refusal') throw new AuditRunError('The model declined to process this data.');

  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return {
    text,
    json: final.stop_reason === 'max_tokens' ? null : parseJson(text),
    stopReason: final.stop_reason,
    model: final.model,
    usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
  };
}

// ---------------------------------------------------------------------------
// OpenAI-style Chat Completions (OpenAI, Gemini, xAI, Groq, OpenRouter)
// ---------------------------------------------------------------------------

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

async function callOpenAICompatible(
  provider: ProviderInfo,
  apiKey: string,
  model: string,
  { system, blocks, signal, onChars }: { system: string; blocks: string[]; signal?: AbortSignal; onChars?: (n: number) => void },
): Promise<ModelReply> {
  const send = (jsonMode: boolean) =>
    fetch(provider.endpoint!, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: blocks.join('\n\n') },
        ],
        // Asks for valid JSON where the model supports it. No max-token setting:
        // limits differ per model, and too high a value is an error on some.
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

  let jsonMode = true;
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await send(jsonMode);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (attempt < 3) {
        await sleep(2000 * 2 ** attempt, signal);
        continue;
      }
      throw new AuditRunError(
        `Couldn't reach ${provider.label}. Check your connection; some providers also block requests made directly from a web page.`,
      );
    }
    if (res.ok) break;
    const detail = await errorDetail(res);
    // Some models don't support JSON mode; the prompt already asks for JSON, so retry without it.
    if (res.status === 400 && jsonMode && /response_format|json/i.test(detail)) {
      jsonMode = false;
      continue;
    }
    if (RETRYABLE.has(res.status) && attempt < 4) {
      const after = Number(res.headers.get('retry-after'));
      await sleep(after > 0 ? after * 1000 : 2000 * 2 ** attempt, signal);
      continue;
    }
    throw new AuditRunError(describeHttpError(provider, res.status, detail));
  }

  const reply = await readChatStream(res!, (n) => onChars?.(n));
  const text = reply.text.trim();
  if (!text && reply.refusal) throw new AuditRunError(`The model declined to process this data: ${reply.refusal}`);
  if (reply.finishReason === 'content_filter') throw new AuditRunError(`${provider.label} stopped the reply with its content filter.`);
  const cutOff = reply.finishReason === 'length';
  return {
    text,
    json: cutOff ? null : parseJson(text),
    // Reported in Anthropic's terms so logs read the same for every provider.
    stopReason: cutOff ? 'max_tokens' : reply.finishReason === 'stop' ? 'end_turn' : reply.finishReason,
    model: reply.model ?? model,
    usage: { inputTokens: reply.usage?.prompt_tokens ?? null, outputTokens: reply.usage?.completion_tokens ?? null },
  };
}

interface ChatReply {
  text: string;
  refusal: string;
  finishReason: string | null;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Reads a server-sent-events Chat Completions stream. Where the platform can't
 * stream a response body (React Native's fetch), reads it all at the end instead.
 */
async function readChatStream(res: Response, onChars: (chars: number) => void): Promise<ChatReply> {
  const reply: ChatReply = { text: '', refusal: '', finishReason: null };
  const handleLine = (line: string) => {
    const data = line.trim();
    if (!data.startsWith('data:')) return;
    const payload = data.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let chunk: any;
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    if (chunk.error) throw new AuditRunError(`The provider reported an error mid-reply: ${chunk.error.message ?? 'unknown error'}`);
    if (chunk.model) reply.model = chunk.model;
    if (chunk.usage) reply.usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) reply.text += choice.delta.content;
    if (choice?.delta?.refusal) reply.refusal += choice.delta.refusal;
    if (choice?.finish_reason) reply.finishReason = choice.finish_reason;
  };

  const reader = res.body?.getReader?.();
  if (!reader) {
    (await res.text()).split('\n').forEach(handleLine);
    onChars(reply.text.length);
    return reply;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handleLine);
    onChars(reply.text.length);
  }
  if (buffer) handleLine(buffer);
  return reply;
}

async function errorDetail(res: Response): Promise<string> {
  const body: any = await res.json().catch(() => null);
  return body?.error?.message ?? body?.[0]?.error?.message ?? res.statusText ?? '';
}

function describeHttpError(provider: ProviderInfo, status: number, detail: string): string {
  if (status === 401 || status === 403) return `${provider.label} rejected the API key. ${detail}`.trim();
  if (status === 429) return `Rate limited by ${provider.label}, even after waiting and retrying. Try again later. ${detail}`.trim();
  if (status === 413 || /context|too long|too many tokens|maximum.*tokens|token limit/i.test(detail)) {
    return `A prompt was too large for the model chosen in Settings (${provider.label}: ${detail}). Use a model with a larger context window.`;
  }
  return `${provider.label} error ${status}: ${detail}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/** Parses a reply as JSON, tolerating a ```json fence or stray text around the object. */
export function parseJson(text: string): unknown | null {
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  for (const candidate of [unfenced, unfenced.slice(unfenced.indexOf('{'), unfenced.lastIndexOf('}') + 1)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}
