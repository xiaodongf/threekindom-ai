export type Language = 'en' | 'zh';

export interface LocalizedText {
  en: string;
  zh: string;
}

export type PlayableFactionId = 'wei' | 'shu' | 'wu';
export type FactionId = PlayableFactionId | 'neutral';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TerrainType = 'plains' | 'mountain' | 'river' | 'fortress';
/** The Later Han provinces (州) that fall on the map, as listed in the Book of Later Han. */
export type ProvinceId =
  | 'sili'
  | 'liang'
  | 'bing'
  | 'ji'
  | 'yan'
  | 'xu'
  | 'qing'
  | 'yu'
  | 'jing'
  | 'yang'
  | 'yi';
export type TacticId = 'assault' | 'fire' | 'ambush' | 'siege';

export type AIProviderId = 'auto' | 'gemini' | 'openai' | 'anthropic' | 'heuristic';
export type ResolvedProviderId = 'gemini' | 'openai' | 'anthropic' | 'heuristic';

export type DiplomaticStatus = 'war' | 'hostile' | 'neutral' | 'truce' | 'allied';
export type DiplomacyProposalType = 'alliance' | 'gift' | 'tribute' | 'war' | 'message';

// --- Hero-Centric & Time-Traveler Types ---

export type HeroArchetype = 'vanguard' | 'strategist' | 'marshal' | 'statesman';
export type HeroStatus = 'active' | 'wounded' | 'captured' | 'wandering' | 'executed';
export type DuelStance = 'strike' | 'feint' | 'guard' | 'skill' | 'chrono_counter';

export type HeroSkillEffect =
  | 'assault_boost'
  | 'fire_ignore_def'
  | 'morale_shatter'
  | 'casualty_shield'
  | 'ambush_reflect'
  | 'river_pierce'
  | 'raid_plunder'
  | 'mandate_rally'
  | 'charisma_charm'
  | 'siege_breaker';

export interface HeroSignatureSkill {
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  battleCry: LocalizedText;
  effect: HeroSkillEffect;
  powerBonus: number;
  duelDamage: number;
  cooldownTurns: number;
}

export interface HeroDossier {
  historicalStrength: LocalizedText;
  fatalFlaw: LocalizedText;
  fatedDestiny: LocalizedText;
  weakToTactic: TacticId;
  counterStance: Exclude<DuelStance, 'skill' | 'chrono_counter'>;
  persuasionHook: LocalizedText;
}

export interface HeroBond {
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  memberIds: string[];
  combatBonus: number;
  loyaltyBonus: number;
}

export interface General {
  id: string;
  name: LocalizedText;
  title: LocalizedText;
  faction: FactionId;
  originalFaction: FactionId;
  portrait: string;
  archetype: HeroArchetype;
  war: number;
  intellect: number;
  command: number;
  politics: number;
  charisma: number;
  specialty: TacticId;
  cityId: string;
  seal: string;
  level: number;
  xp: number;
  loyalty: number;
  status: HeroStatus;
  woundedTurns: number;
  capturedBy?: PlayableFactionId;
  skillCooldown: number;
  chattedThisTurn?: boolean;
  vendettaAgainst: PlayableFactionId[];
  signatureSkill: HeroSignatureSkill;
  dossier: HeroDossier;
  bondIds: string[];
}

export type TechId =
  | 'stirrups'
  | 'medicine'
  | 'agriculture'
  | 'gunpowder'
  | 'spyglass'
  | 'printing'
  | 'balloon'
  | 'steamship';

export interface TechDefinition {
  id: TechId;
  tier: 1 | 2 | 3;
  name: LocalizedText;
  desc: LocalizedText;
  historicalNote: LocalizedText;
  goldCost: number;
  innovationCost: number;
  divergenceGain: number;
  suspicionGain: number;
  copyableByRivals: boolean;
}

export type TimelineStage = 'sharp' | 'distorted' | 'shattered';

export interface PendingTechCopy {
  factionId: PlayableFactionId;
  techId: TechId;
  turnsRemaining: number;
}

export interface ChronoState {
  trust: number; // 0..100 Lord's Trust
  suspicion: number; // 0..100 Court Suspicion
  divergence: number; // 0..100 Timeline Divergence (Butterfly Effect)
  innovationPoints: number;
  techFrozenTurns: number;
  coalitionActive: boolean;
  unlockedTechs: TechId[];
  rivalTechs: Record<PlayableFactionId, TechId[]>;
  pendingTechCopies: PendingTechCopy[];
  triggeredEventIds: string[];
}

export interface StoryEventChoice {
  id: string;
  label: LocalizedText;
  desc: LocalizedText;
  requiresTech?: TechId;
  goldCost?: number;
}

export interface StoryEvent {
  id: string;
  kind: 'fated_crisis' | 'what_if' | 'suspicion_trial' | 'hero_vignette';
  title: LocalizedText;
  subtitle: LocalizedText;
  body: LocalizedText;
  heroId?: string;
  choices: StoryEventChoice[];
}

export interface DuelRoundLog {
  round: number;
  playerStance: DuelStance;
  enemyStance: DuelStance;
  playerDamage: number;
  enemyDamage: number;
  summary: LocalizedText;
}

export interface DuelResult {
  winner: 'attacker' | 'defender' | 'draw';
  attackerHeroId: string;
  defenderHeroId: string;
  attackerHpLeft: number;
  defenderHpLeft: number;
  rounds: DuelRoundLog[];
  moraleBonus: number;
  skillUsed: boolean;
}

// --- Core Map & Faction Types ---

export interface City {
  id: string;
  name: LocalizedText;
  region: LocalizedText;
  /** The province (州) the city belongs to; the map groups cities by it when zoomed out. */
  province: ProvinceId;
  x: number;
  y: number;
  owner: FactionId;
  troops: number;
  /** Walls, 1..5. */
  defense: number;
  /** Fields outside the walls, 1..5: grain each season. */
  farming: number;
  /** Markets inside the walls, 1..5: gold each season. */
  trade: number;
  /** How well the garrison is drilled, 0..100: morale it takes into battle. */
  drill: number;
  /** The people's support, 0..100: scales income and levies; unrest when very low. */
  support: number;
  baseGold: number;
  baseFood: number;
  terrain: TerrainType;
  neighbors: string[];
  isCapital?: boolean;
  /** The general appointed governor. Empty, or no longer valid, the best administrator present acts. */
  governorId?: string;
  /** What the governor works on each season; unset means his own judgment. */
  focus?: GovernorFocus;
  /** Works piled up toward the next level of farming, trade and walls, 0..99 each. */
  works?: Partial<Record<'farming' | 'trade' | 'walls', number>>;
  /** Something happening to the city on its own, and how many seasons it still has to run. */
  event?: { kind: CityEventKind; seasonsLeft: number };
  /** Seasons the walls stay visibly broken after a bombardment or a storming. */
  wallScar?: number;
}

/** Things that befall a city without anyone ordering them. */
export type CityEventKind = 'harvest' | 'flood' | 'drought' | 'fair' | 'plague' | 'riot';

/** The five things a governor can spend a season on. */
export type GovernorTask = 'farming' | 'trade' | 'walls' | 'drill' | 'relief';
/** A governor's standing instruction: one task, or 'auto' to leave the choice to him. */
export type GovernorFocus = 'auto' | GovernorTask;

export interface Province {
  id: ProvinceId;
  name: LocalizedText;
  /** The city that stands for the province on the zoomed-out map. */
  seatCityId: string;
  /** Where the province's name is written on the map, in map units. */
  label: { x: number; y: number };
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
  deputyGeneralId?: string;
  defenderGeneralId?: string;
  tactic: TacticId;
  skillTriggered?: LocalizedText;
  bondsTriggered?: LocalizedText[];
  duelWinner?: 'attacker' | 'defender' | 'draw';
  capturedHeroId?: string;
  woundedHeroId?: string;
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
  category: 'battle' | 'diplomacy' | 'economy' | 'ai' | 'system' | 'hero' | 'chrono';
  faction?: FactionId;
  text: LocalizedText;
}

export interface MarchEvent {
  id: string;
  fromCityId: string;
  toCityId: string;
  faction: PlayableFactionId;
  type: 'attack' | 'reinforce' | 'raid' | 'bombard' | 'discord' | 'river_strike';
  captured?: boolean;
}

/** Orders that work on one aspect of a city the player holds. */
export type DomesticOrder = 'farm' | 'trade' | 'drill' | 'relief';

export type MilitaryActionType = 'assault' | 'raid' | 'bombard' | 'discord' | 'river_strike';

export interface BattleModifierTag {
  label: LocalizedText;
  value: string;
  positive: boolean;
}

export interface BattlePreview {
  /** Share of simulated grid battles (tactical AI on both sides) in which the city fell, 3..97. */
  estimatedWinChance: number;
  /** Troops committed to the assault. */
  atkPower: number;
  /** Troops in the garrison. */
  defPower: number;
  modifiers: BattleModifierTag[];
  /** Average casualties across the simulated battles. */
  expectedAttackerLosses?: number;
  expectedDefenderLosses?: number;
  /** How many simulated battles the forecast is based on. */
  samples?: number;
}

export interface OperationReport {
  id: string;
  turn: number;
  type: 'raid' | 'bombard' | 'discord';
  attackerFaction: PlayableFactionId;
  targetCityId: string;
  fromCityId?: string;
  heroId?: string;
  enemyTroopsLost: number;
  friendlyTroopsLost: number;
  goldPlundered: number;
  foodPlundered: number;
  defenseReduced: number;
  loyaltyReduced: number;
  defectedHeroId?: string;
  narrative: LocalizedText;
}

export type TravelerAvatarId = 'male' | 'female';

export interface PlayerProfile {
  name: string;
  avatar: TravelerAvatarId;
  portrait: string;
}

export interface MultiplayerWorldMeta {
  roomCode: string;
  roomName: string;
  humanFactions: PlayableFactionId[];
  turnOrder: PlayableFactionId[];
  activeFaction: PlayableFactionId;
  factionChronos: Record<PlayableFactionId, ChronoState>;
  factionProfiles: Record<PlayableFactionId, PlayerProfile>;
}

export interface GameState {
  turn: number;
  year: number;
  season: Season;
  playerFaction: PlayableFactionId;
  playerProfile: PlayerProfile;
  actionPoints: number;
  maxActionPoints: number;
  factions: Record<PlayableFactionId, FactionState>;
  cities: Record<string, City>;
  generals: Record<string, General>;
  diplomacy: Record<string, DiplomacyRelation>;
  chrono: ChronoState;
  activeEvent: StoryEvent | null;
  chronicle: ChronicleEntry[];
  lastBattle: BattleReport | null;
  lastOperation: OperationReport | null;
  recentMarches: MarchEvent[];
  winner: PlayableFactionId | null;
  isPlayerDefeated: boolean;
  multiplayer?: MultiplayerWorldMeta;
}

// --- AI API Types ---

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

export type HeroEncounterMode = 'recruit' | 'persuade' | 'chat';
export type HeroEncounterApproach = 'righteous' | 'rank' | 'gold' | 'future_intel' | 'custom';

export interface HeroEncounterRequest {
  gameState: GameState;
  heroId: string;
  envoyHeroId?: string;
  mode: HeroEncounterMode;
  approach: HeroEncounterApproach;
  message: string;
  giftGold?: number;
  language: Language;
  aiConfig: AIRequestConfig;
}

export interface HeroEncounterResponse {
  reply: string;
  outcome: 'join' | 'impressed' | 'refuse' | 'bonded';
  loyaltyDelta: number;
  trustDelta: number;
  divergenceDelta: number;
  providerUsed: ResolvedProviderId;
  modelUsed: string;
  fallbackUsed: boolean;
}

export type AITurnActionType =
  | 'attack'
  | 'raid'
  | 'bombard'
  | 'recruit'
  | 'develop'
  | 'farm'
  | 'trade'
  | 'drill'
  | 'relief'
  | 'fortify'
  | 'reinforce'
  | 'hold';

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
