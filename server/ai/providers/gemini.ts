import { GoogleGenAI } from '@google/genai';
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from '../types.js';

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Google Gemini (@google/genai)';

  getDefaultModel(): string {
    return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  }

  isConfigured(overrideKey?: string): boolean {
    return Boolean((overrideKey || process.env.GEMINI_API_KEY || '').trim());
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const apiKey = (options.apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const model = (options.model || this.getDefaultModel()).trim();
    const client = new GoogleGenAI({ apiKey });

    const interaction = await client.interactions.create({
      model,
      input: options.prompt,
      system_instruction: options.systemInstruction,
      store: false,
      generation_config: {
        max_output_tokens: options.maxTokens ?? 550,
      },
      ...(options.jsonSchema
        ? {
            response_format: {
              type: 'text' as const,
              mime_type: 'application/json' as const,
              schema: options.jsonSchema,
            },
          }
        : {}),
    });

    const text = interaction.output_text?.trim();
    if (!text) {
      throw new Error('Gemini returned empty output_text');
    }

    return { text, modelUsed: model };
  }
}
