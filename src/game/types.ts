export type Language = 'en' | 'zh';

export interface LocalizedText {
  en: string;
  zh: string;
}

export type PlayableFactionId = 'wei' | 'shu' | 'wu';
export type FactionId = PlayableFactionId | 'neutral';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TerrainType = 'plains' | 'mountain' | 'river' | 'fortress';
export type TacticId = 'assault' | 'fire' | 'ambush' | 'siege';

export type AIProviderId = 'auto' | 'gemini' | 'openai' | 'anthropic' | 'heuristic';
export type ResolvedProviderId = 'gemini' | 'openai' | 'anthropic' | 'heuristic';

export type DiplomaticStatus = 'war' | 'hostile' | 'neutral' | 'truce' | 'allied';
export type DiplomacyProposalType = 'alliance' | 'gift' | 'tribute' | 'war' | 'message';

export interface General {
  id: string;
  name: LocalizedText;
  title: LocalizedText;
  faction: PlayableFactionId;
  war: number;
  intellect: number;
  command: number;
  specialty: TacticId;
  cityId: string;
  seal: string;
}

export interface City {
  id: string;
  name: LocalizedText;
  region: LocalizedText;
  x: number;
  y: number;
  owner: FactionId;
  troops: number;
  defense: number;
  development: number;
  baseGold: number;
  baseFood: number;
  terrain: TerrainType;
  neighbors: string[];
  isCapital?: boolean;
}

export interface FactionState {
  id: PlayableFactionId;
  name: LocalizedText;
  shortName: LocalizedText;
  rulerName: LocalizedText;
  rulerTitle: LocalizedText;
  advisorName: LocalizedText;
  advisorTitle: LocalizedText;
  color: string;
  accent: string;
  bannerChar: string;
  traitName: LocalizedText;
  traitDesc: LocalizedText;
  difficulty: 'normal' | 'challenging' | 'hard';
  gold: number;
  food: number;
  isEliminated: boolean;
}

export interface DiplomacyRelation {
  pair: string;
  factions: [PlayableFactionId, PlayableFactionId];
  score: number;
  status: DiplomaticStatus;
  truceTurnsLeft: number;
}

export interface BattleReport {
  id: string;
  turn: number;
  attackerFaction: PlayableFactionId;
  defenderFaction: FactionId;
  fromCityId: string;
  toCityId: string;
  attackerGeneralId?: string;
  defenderGeneralId?: string;
  tactic: TacticId;
  attackerStartTroops: number;
  defenderStartTroops: number;
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
  narrative: LocalizedText;
}

export interface ChronicleEntry {
  id: string;
  turn: number;
  year: number;
  season: Season;
  category: 'battle' | 'diplomacy' | 'economy' | 'ai' | 'system';
  faction?: FactionId;
  text: LocalizedText;
}

export interface MarchEvent {
  id: string;
  fromCityId: string;
  toCityId: string;
  faction: PlayableFactionId;
  type: 'attack' | 'reinforce';
  captured?: boolean;
}

export interface GameState {
  turn: number;
  year: number;
  season: Season;
  playerFaction: PlayableFactionId;
  actionPoints: number;
  maxActionPoints: number;
  factions: Record<PlayableFactionId, FactionState>;
  cities: Record<string, City>;
  generals: Record<string, General>;
  diplomacy: Record<string, DiplomacyRelation>;
  chronicle: ChronicleEntry[];
  lastBattle: BattleReport | null;
  recentMarches: MarchEvent[];
  winner: PlayableFactionId | null;
  isPlayerDefeated: boolean;
}

export interface AIProviderStatus {
  id: ResolvedProviderId;
  name: string;
  configured: boolean;
  model: string;
}

export interface AIRequestConfig {
  provider: AIProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AdvisorRequest {
  gameState: GameState;
  question: string;
  language: Language;
  aiConfig: AIRequestConfig;
}

export interface AdvisorResponse {
  reply: string;
  recommendedAction?: string;
  providerUsed: ResolvedProviderId;
  modelUsed: string;
  fallbackUsed: boolean;
}

export interface DiplomacyRequest {
  gameState: GameState;
  targetFaction: PlayableFactionId;
  proposalType: DiplomacyProposalType;
  message: string;
  giftGold?: number;
  language: Language;
  aiConfig: AIRequestConfig;
}

export interface DiplomacyResponse {
  reply: string;
  decision: 'accept' | 'reject' | 'acknowledge';
  relationDelta: number;
  truceTurns: number;
  providerUsed: ResolvedProviderId;
  modelUsed: string;
  fallbackUsed: boolean;
}

export type AITurnActionType = 'attack' | 'recruit' | 'develop' | 'fortify' | 'reinforce' | 'hold';

export interface AITurnAction {
  type: AITurnActionType;
  cityId: string;
  targetCityId?: string;
  tactic?: TacticId;
  troopsRatio?: number;
}

export interface AITurnDecisionRequest {
  gameState: GameState;
  factionId: PlayableFactionId;
  language: Language;
  aiConfig: AIRequestConfig;
}

export interface AITurnDecisionResponse {
  action: AITurnAction;
  proclamation: string;
  reasoning: string;
  providerUsed: ResolvedProviderId;
  modelUsed: string;
  fallbackUsed: boolean;
}
