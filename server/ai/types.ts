import type { ResolvedProviderId } from '../../src/game/types.js';

export interface LLMGenerateOptions {
  systemInstruction: string;
  prompt: string;
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMGenerateResult {
  text: string;
  modelUsed: string;
}

export interface LLMProvider {
  readonly id: ResolvedProviderId;
  readonly name: string;
  getDefaultModel(): string;
  isConfigured(overrideKey?: string): boolean;
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResult>;
}
