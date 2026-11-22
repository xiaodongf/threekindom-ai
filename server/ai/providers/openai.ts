import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from '../types.js';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  readonly name = 'OpenAI / Compatible API';

  getDefaultModel(): string {
    return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  }

  isConfigured(overrideKey?: string): boolean {
    return Boolean((overrideKey || process.env.OPENAI_API_KEY || '').trim());
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const apiKey = (options.apiKey || process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = (options.model || this.getDefaultModel()).trim();
    const baseUrl = (
      options.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      DEFAULT_OPENAI_BASE_URL
    ).replace(/\/+$/, '');

    const systemContent = options.jsonSchema
      ? `${options.systemInstruction}\n\nReturn ONLY a valid JSON object matching this JSON Schema:\n${JSON.stringify(options.jsonSchema)}`
      : options.systemInstruction;

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: options.prompt },
      ],
      max_tokens: options.maxTokens ?? 550,
      ...(options.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('OpenAI returned empty message content');
    }

    return { text, modelUsed: model };
  }
}
