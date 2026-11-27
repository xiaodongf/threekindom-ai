import { GoogleGenAI } from '@google/genai';
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from '../types.js';

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
/**
 * `max_output_tokens` in the Gemini Interactions API caps combined thinking + output tokens.
 * A tiny 380-token limit cuts Gemini 4 models off mid-thought before `output_text` is produced.
 */
const MIN_GEMINI_OUTPUT_TOKENS = 2048;

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Google Gemini (@google/genai)';

  getDefaultModel(): string {
    return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  }

  private resolveApiKey(overrideKey?: string): string {
    return (overrideKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  }

  isConfigured(overrideKey?: string): boolean {
    return Boolean(this.resolveApiKey(overrideKey));
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const apiKey = this.resolveApiKey(options.apiKey);
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const model = (options.model || this.getDefaultModel()).trim();
    const client = new GoogleGenAI({ apiKey });
    const isFlashLite = model.includes('flash-lite');
    const thinkingLevel =
      process.env.GEMINI_THINKING_LEVEL || (isFlashLite ? 'minimal' : 'low');

    const interaction = await client.interactions.create({
      model,
      input: options.prompt,
      system_instruction: options.systemInstruction,
      store: false,
      generation_config: {
        max_output_tokens: Math.max(options.maxTokens ?? 1024, MIN_GEMINI_OUTPUT_TOKENS),
        thinking_level: thinkingLevel,
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
      throw new Error(
        `Gemini returned empty output_text (status: ${interaction.status ?? 'unknown'})`
      );
    }

    return { text, modelUsed: model };
  }
}
