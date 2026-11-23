import type {
  DuelResult,
  FactionId,
  General,
  LocalizedText,
  PlayableFactionId,
  TacticId,
} from './types.js';

export const TACTICAL_GRID_SIZE = 8;
export const TACTICAL_MAX_ROUNDS = 10;
export const TACTICAL_MAX_SP = 5;

export type TacticalTileType =
  | 'plains'
  | 'forest'
  | 'water'
  | 'bridge'
  | 'ford'
  | 'hill'
  | 'wall'
  | 'gate'
  | 'citadel';

export type WindDirection = 'N' | 'S' | 'E' | 'W';

export type TacticalUnitClass = 'cavalry' | 'infantry' | 'archer' | 'naval';

export type TacticalSide = 'attacker' | 'defender';

export type WffmStance = 'wind' | 'forest' | 'fire' | 'mountain';

export type ArtOfWarStratagemId =
  | 'fire_attack'
  | 'feign_disorder'
  | 'empty_fort_ambush'
  | 'wffm'
  | 'death_ground'
  | 'subdue_chaos';

export type TacticalCommandMode =
  | 'move'
  | 'attack'
  | 'stratagem'
  | 'hero_skill'
  | 'gunpowder_bomb'
  | 'duel';

export interface GridCoord {
  row: number;
  col: number;
}

export interface TacticalTile {
  row: number;
  col: number;
  type: TacticalTileType;
  fireTurns: number; // >0 means tile is Blazing Fire!
  gateHp?: number; // present on 'gate' tiles (when 0, gate is breached)
  gateMaxHp?: number;
}

export interface TacticalUnit {
  id: string;
  side: TacticalSide;
  faction: FactionId;
  heroId?: string;
  name: LocalizedText;
  title: LocalizedText;
  portrait?: string;
  unitClass: TacticalUnitClass;
  isNavalCapable: boolean; // Wu, Steamship tech, or River Strike embarked
  row: number;
  col: number;
  troops: number;
  maxTroops: number;
  morale: number; // 0..100
  war: number;
  intellect: number;
  command: number;
  specialty: TacticId;
  moveRange: number;
  attackRange: number;
  hasMoved: boolean;
  hasActed: boolean;
  skillUsed: boolean;
  isHiddenAmbush: boolean;
  disorderedTurns: number;
  intimidatedTurns: number; // from Empty Fort Ruse (-25% ATK, -1 Move)
  luredDefDebuffTurns: number; // from Feign Disorder (-15% DEF)
  fortifiedTurns: number; // from Rally/Hold (+25% DEF)
  deathGroundTurns: number; // from Death Ground (+40% ATK, unbreakable)
  wffmStance?: WffmStance;
  wffmTurns: number;
  isFlankSquad?: boolean;
  defeated: boolean;
  surrendered?: boolean;
  encircledWhenDefeated?: boolean;
}

export interface ArtOfWarPrincipleTag {
  id: string;
  label: LocalizedText;
  value: string;
  positive: boolean;
}

export interface AttackDamagePreview {
  estimatedDamage: number;
  counterDamage: number;
  moraleDrop: number;
  principles: ArtOfWarPrincipleTag[];
}

export interface StratagemSuccessPreview {
  stratagemId: ArtOfWarStratagemId;
  chance: number; // 15..98
  casterInt: number;
  targetInt: number;
  spCost: number;
  factors: ArtOfWarPrincipleTag[];
  summary: LocalizedText;
}

export interface TacticalCallout {
  id: string;
  kind: 'stratagem' | 'seen_through' | 'skill' | 'fire' | 'ambush' | 'tech' | 'duel';
  title: LocalizedText;
  quote?: LocalizedText;
  subtitle: LocalizedText;
  side: TacticalSide;
}

export interface TacticalLogEntry {
  id: string;
  round: number;
  side: TacticalSide | 'system';
  text: LocalizedText;
}

export interface TacticalBattleConfig {
  id: string;
  fromCityId: string;
  toCityId: string;
  attackerFaction: PlayableFactionId;
  defenderFaction: FactionId;
  playerSide: TacticalSide;
  primaryTroops: number;
  pincerFromCityId?: string;
  pincerTroops?: number;
  tactic: TacticId;
  isRiverStrike?: boolean;
  attackerGeneralId?: string;
  deputyGeneralId?: string;
  consumeAP: boolean;
  initialDuelResult?: DuelResult;
}

export interface TacticalBattleState {
  config: TacticalBattleConfig;
  cityName: LocalizedText;
  hasWaterFeature: boolean;
  grid: TacticalTile[][]; // 8 rows x 8 cols
  units: TacticalUnit[];
  round: number;
  maxRounds: number;
  activeSide: TacticalSide;
  wind: WindDirection;
  sp: Record<TacticalSide, number>;
  attackerHasGunpowder: boolean;
  attackerHasStirrups: boolean;
  attackerHasSteamship: boolean;
  attackerHasBalloon: boolean;
  attackerHasSpyglass: boolean;
  attackerHasMedicine: boolean;
  defenderHasGunpowder: boolean;
  defenderHasStirrups: boolean;
  defenderHasSteamship: boolean;
  defenderHasBalloon: boolean;
  defenderHasSpyglass: boolean;
  defenderHasMedicine: boolean;
  gunpowderBombsLeft: Record<TacticalSide, number>;
  attackerStartTroops: number;
  defenderStartTroops: number;
  winner: TacticalSide | null;
  victoryReason?: LocalizedText;
  lastCallout: TacticalCallout | null;
  logs: TacticalLogEntry[];
  duelUsedOnGrid: boolean;
  preBattleHeroes: Record<string, General>;
}

export interface TacticalBattleOutcome {
  config: TacticalBattleConfig;
  attackerWon: boolean;
  attackerStartTroops: number;
  defenderStartTroops: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerRemainingTroops: number;
  defenderRemainingTroops: number;
  attackerGeneralId?: string;
  deputyGeneralId?: string;
  defenderGeneralId?: string;
  skillTriggered?: LocalizedText;
  defeatedEnemyHeroIds: string[];
  surrenderedOrEncircledHeroIds: string[];
  roundsPlayed: number;
  victoryReason: LocalizedText;
}

export interface ArtOfWarStratagemDef {
  id: ArtOfWarStratagemId;
  name: LocalizedText;
  chapter: LocalizedText;
  quote: LocalizedText;
  desc: LocalizedText;
  spCost: number;
  baseChance: number;
  range: number; // 0 = self/around caster
  targetsEnemy: boolean;
  targetsTile: boolean;
}
