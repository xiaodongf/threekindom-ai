import type {
  AIProviderStatus,
  AIRequestConfig,
  AITurnAction,
  AITurnDecisionRequest,
  AITurnDecisionResponse,
  AdvisorRequest,
  AdvisorResponse,
  DiplomacyRequest,
  DiplomacyResponse,
  HeroEncounterRequest,
  HeroEncounterResponse,
  ResolvedProviderId,
  TacticId,
} from '../../src/game/types.js';
import { CITY_SPECIALTY_IDS, canCharterSpecialty } from '../../src/game/citySpecialties.js';
import { ACTION_COSTS } from '../../src/game/data.js';
import {
  AI_TURN_SCHEMA,
  DIPLOMACY_RESPONSE_SCHEMA,
  HERO_ENCOUNTER_SCHEMA,
  buildAITurnPrompt,
  buildAdvisorPrompt,
  buildDiplomacyPrompt,
  buildHeroEncounterPrompt,
} from './prompts.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import {
  generateHeuristicAITurn,
  generateHeuristicAdvisorReply,
  generateHeuristicDiplomacy,
  generateHeuristicHeroEncounter,
} from './providers/heuristic.js';
import { OpenAIProvider } from './providers/openai.js';
import type { LLMProvider } from './types.js';

const providers: Record<Exclude<ResolvedProviderId, 'heuristic'>, LLMProvider> = {
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
};

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export function getProviderStatuses(): AIProviderStatus[] {
  return [
    {
      id: 'gemini',
      name: providers.gemini.name,
      configured: providers.gemini.isConfigured(),
      model: providers.gemini.getDefaultModel(),
    },
    {
      id: 'openai',
      name: providers.openai.name,
      configured: providers.openai.isConfigured(),
      model: providers.openai.getDefaultModel(),
    },
    {
      id: 'anthropic',
      name: providers.anthropic.name,
      configured: providers.anthropic.isConfigured(),
      model: providers.anthropic.getDefaultModel(),
    },
    {
      id: 'heuristic',
      name: 'Built-in Tactical AI (Offline Fallback)',
      configured: true,
      model: 'three-kingdoms-heuristic-v1',
    },
  ];
}

function resolveProvider(config?: AIRequestConfig): LLMProvider | null {
  const requested = config?.provider || (process.env.AI_PROVIDER as AIRequestConfig['provider']) || 'auto';
  if (requested === 'heuristic') return null;

  if (requested !== 'auto') {
    const candidate = providers[requested];
    if (candidate && candidate.isConfigured(config?.apiKey)) {
      return candidate;
    }
    return null;
  }

  // Auto order: Gemini -> OpenAI -> Anthropic
  const order: Array<Exclude<ResolvedProviderId, 'heuristic'>> = ['gemini', 'openai', 'anthropic'];
  for (const id of order) {
    if (providers[id].isConfigured(config?.apiKey)) {
      return providers[id];
    }
  }
  return null;
}

export async function handleAdvisorRequest(req: AdvisorRequest): Promise<AdvisorResponse> {
  const provider = resolveProvider(req.aiConfig);
  if (!provider) {
    return {
      reply: generateHeuristicAdvisorReply(req.gameState, req.question, req.language),
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: req.aiConfig?.provider !== 'heuristic',
    };
  }

  try {
    const { systemInstruction, prompt } = buildAdvisorPrompt(
      req.gameState,
      req.question,
      req.language
    );
    const result = await provider.generate({
      systemInstruction,
      prompt,
      maxTokens: 450,
      model: req.aiConfig?.model || undefined,
      apiKey: req.aiConfig?.apiKey || undefined,
      baseUrl: req.aiConfig?.baseUrl || undefined,
    });
    return {
      reply: result.text,
      providerUsed: provider.id,
      modelUsed: result.modelUsed,
      fallbackUsed: false,
    };
  } catch (err) {
    console.warn(`[AI Advisor] ${provider.id} failed, falling back to heuristic:`, err);
    return {
      reply: generateHeuristicAdvisorReply(req.gameState, req.question, req.language),
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: true,
    };
  }
}

export async function handleDiplomacyRequest(req: DiplomacyRequest): Promise<DiplomacyResponse> {
  const provider = resolveProvider(req.aiConfig);
  if (!provider) {
    const fallback = generateHeuristicDiplomacy(
      req.gameState,
      req.targetFaction,
      req.proposalType,
      req.message,
      req.language
    );
    return {
      ...fallback,
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: req.aiConfig?.provider !== 'heuristic',
    };
  }

  try {
    const { systemInstruction, prompt } = buildDiplomacyPrompt(
      req.gameState,
      req.targetFaction,
      req.proposalType,
      req.message,
      req.giftGold,
      req.language
    );
    const result = await provider.generate({
      systemInstruction,
      prompt,
      jsonSchema: DIPLOMACY_RESPONSE_SCHEMA,
      maxTokens: 400,
      model: req.aiConfig?.model || undefined,
      apiKey: req.aiConfig?.apiKey || undefined,
      baseUrl: req.aiConfig?.baseUrl || undefined,
    });

    const parsed = JSON.parse(stripJsonFences(result.text)) as Partial<DiplomacyResponse>;
    const decision =
      parsed.decision === 'accept' || parsed.decision === 'reject' || parsed.decision === 'acknowledge'
        ? parsed.decision
        : 'acknowledge';
    const relationDelta = Math.max(-45, Math.min(30, Math.round(Number(parsed.relationDelta ?? 0))));
    const truceTurns =
      req.proposalType === 'war'
        ? 0
        : Math.max(0, Math.min(4, Math.round(Number(parsed.truceTurns ?? 0))));

    if (!parsed.reply || typeof parsed.reply !== 'string') {
      throw new Error('Missing reply in LLM diplomacy JSON');
    }

    return {
      reply: parsed.reply,
      decision,
      relationDelta,
      truceTurns,
      providerUsed: provider.id,
      modelUsed: result.modelUsed,
      fallbackUsed: false,
    };
  } catch (err) {
    console.warn(`[AI Diplomacy] ${provider.id} failed, falling back to heuristic:`, err);
    const fallback = generateHeuristicDiplomacy(
      req.gameState,
      req.targetFaction,
      req.proposalType,
      req.message,
      req.language
    );
    return {
      ...fallback,
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: true,
    };
  }
}

function validateAITurnAction(req: AITurnDecisionRequest, raw: Partial<AITurnAction>): AITurnAction | null {
  const { gameState, factionId } = req;
  const city = raw.cityId ? gameState.cities[raw.cityId] : undefined;
  if (!city || city.owner !== factionId) return null;

  const validTactics: TacticId[] = ['assault', 'fire', 'ambush', 'siege'];
  const tactic: TacticId = validTactics.includes(raw.tactic as TacticId)
    ? (raw.tactic as TacticId)
    : 'assault';

  if (raw.type === 'attack' && raw.targetCityId) {
    const target = gameState.cities[raw.targetCityId];
    if (target && target.owner !== factionId && city.neighbors.includes(target.id) && city.troops >= 4000) {
      return {
        type: 'attack',
        cityId: city.id,
        targetCityId: target.id,
        tactic,
        troopsRatio: Math.min(0.78, Math.max(0.45, Number(raw.troopsRatio ?? 0.65))),
      };
    }
    return null;
  }

  if (raw.type === 'raid' && raw.targetCityId) {
    const target = gameState.cities[raw.targetCityId];
    if (target && target.owner !== factionId && city.neighbors.includes(target.id) && city.troops >= 2500) {
      return { type: 'raid', cityId: city.id, targetCityId: target.id };
    }
    return null;
  }

  if (raw.type === 'bombard' && raw.targetCityId) {
    const target = gameState.cities[raw.targetCityId];
    if (
      target &&
      target.owner !== factionId &&
      city.neighbors.includes(target.id) &&
      gameState.factions[factionId].gold >= 150
    ) {
      return { type: 'bombard', cityId: city.id, targetCityId: target.id };
    }
    return null;
  }

  if (raw.type === 'reinforce' && raw.targetCityId) {
    const target = gameState.cities[raw.targetCityId];
    if (target && target.owner === factionId && city.neighbors.includes(target.id) && city.troops >= 3500) {
      return {
        type: 'reinforce',
        cityId: city.id,
        targetCityId: target.id,
        troopsRatio: Math.min(0.6, Math.max(0.3, Number(raw.troopsRatio ?? 0.45))),
      };
    }
    return null;
  }

  if (raw.type === 'specialize' && raw.specialty) {
    if (
      CITY_SPECIALTY_IDS.includes(raw.specialty) &&
      city.specialty !== raw.specialty &&
      canCharterSpecialty(city, raw.specialty) &&
      gameState.factions[factionId].gold >= ACTION_COSTS.specializeGold
    ) {
      return { type: 'specialize', cityId: city.id, specialty: raw.specialty };
    }
    return null;
  }

  if (
    raw.type === 'recruit' ||
    raw.type === 'develop' ||
    raw.type === 'farm' ||
    raw.type === 'trade' ||
    raw.type === 'drill' ||
    raw.type === 'relief' ||
    raw.type === 'fortify' ||
    raw.type === 'hold'
  ) {
    return { type: raw.type, cityId: city.id };
  }

  return null;
}

export async function handleHeroEncounterRequest(
  req: HeroEncounterRequest
): Promise<HeroEncounterResponse> {
  const provider = resolveProvider(req.aiConfig);
  const hero = req.gameState.generals[req.heroId];
  const hasVendetta = Boolean(hero?.vendettaAgainst.includes(req.gameState.playerFaction));

  if (!provider) {
    const fallback = generateHeuristicHeroEncounter(req);
    return {
      ...fallback,
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: req.aiConfig?.provider !== 'heuristic',
    };
  }

  try {
    const { systemInstruction, prompt } = buildHeroEncounterPrompt(req);
    const result = await provider.generate({
      systemInstruction,
      prompt,
      jsonSchema: HERO_ENCOUNTER_SCHEMA,
      maxTokens: 420,
      model: req.aiConfig?.model || undefined,
      apiKey: req.aiConfig?.apiKey || undefined,
      baseUrl: req.aiConfig?.baseUrl || undefined,
    });

    const parsed = JSON.parse(stripJsonFences(result.text)) as Partial<HeroEncounterResponse>;
    if (!parsed.reply || typeof parsed.reply !== 'string') {
      throw new Error('Missing reply in LLM hero encounter JSON');
    }

    let outcome: HeroEncounterResponse['outcome'] =
      req.mode === 'chat'
        ? 'bonded'
        : parsed.outcome === 'join' || parsed.outcome === 'impressed' || parsed.outcome === 'refuse'
          ? parsed.outcome
          : 'impressed';

    // Hard rule enforcement: sworn vendetta NEVER joins!
    if (req.mode !== 'chat' && hasVendetta) {
      outcome = 'refuse';
    }

    return {
      reply: parsed.reply,
      outcome,
      loyaltyDelta: Math.max(-5, Math.min(10, Math.round(Number(parsed.loyaltyDelta ?? 0)))),
      trustDelta: Math.max(-3, Math.min(6, Math.round(Number(parsed.trustDelta ?? 0)))),
      divergenceDelta: Math.max(0, Math.min(10, Math.round(Number(parsed.divergenceDelta ?? 0)))),
      providerUsed: provider.id,
      modelUsed: result.modelUsed,
      fallbackUsed: false,
    };
  } catch (err) {
    console.warn(`[AI HeroEncounter] ${provider.id} failed, falling back to heuristic:`, err);
    const fallback = generateHeuristicHeroEncounter(req);
    return {
      ...fallback,
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: true,
    };
  }
}

export async function handleAITurnRequest(req: AITurnDecisionRequest): Promise<AITurnDecisionResponse> {
  const provider = resolveProvider(req.aiConfig);
  if (!provider) {
    const fallback = generateHeuristicAITurn(req.gameState, req.factionId, req.language);
    return {
      ...fallback,
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: req.aiConfig?.provider !== 'heuristic',
    };
  }

  try {
    const { systemInstruction, prompt } = buildAITurnPrompt(
      req.gameState,
      req.factionId,
      req.language
    );
    const result = await provider.generate({
      systemInstruction,
      prompt,
      jsonSchema: AI_TURN_SCHEMA,
      maxTokens: 380,
      model: req.aiConfig?.model || undefined,
      apiKey: req.aiConfig?.apiKey || undefined,
      baseUrl: req.aiConfig?.baseUrl || undefined,
    });

    const parsed = JSON.parse(stripJsonFences(result.text)) as Partial<AITurnAction> & {
      proclamation?: string;
      reasoning?: string;
    };

    const validated = validateAITurnAction(req, parsed);
    if (!validated) {
      throw new Error(`Invalid AI turn action returned by ${provider.id}: ${result.text}`);
    }

    return {
      action: validated,
      proclamation: parsed.proclamation || '',
      reasoning: parsed.reasoning || '',
      providerUsed: provider.id,
      modelUsed: result.modelUsed,
      fallbackUsed: false,
    };
  } catch (err) {
    console.warn(`[AI Turn] ${provider.id} failed, falling back to heuristic:`, err);
    const fallback = generateHeuristicAITurn(req.gameState, req.factionId, req.language);
    return {
      ...fallback,
      providerUsed: 'heuristic',
      modelUsed: 'three-kingdoms-heuristic-v1',
      fallbackUsed: true,
    };
  }
}
