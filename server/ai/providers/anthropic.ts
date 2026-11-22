import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from '../types.js';

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  readonly name = 'Anthropic Claude';

  getDefaultModel(): string {
    return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  }

  isConfigured(overrideKey?: string): boolean {
    return Boolean((overrideKey || process.env.ANTHROPIC_API_KEY || '').trim());
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const apiKey = (options.apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const model = (options.model || this.getDefaultModel()).trim();
    const systemContent = options.jsonSchema
      ? `${options.systemInstruction}\n\nReturn ONLY raw JSON (no markdown fences) matching this JSON Schema:\n${JSON.stringify(options.jsonSchema)}`
      : options.systemInstruction;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 550,
        system: systemContent,
        messages: [{ role: 'user', content: options.prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content
      ?.filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Anthropic returned empty text content');
    }

    return { text, modelUsed: model };
  }
}
