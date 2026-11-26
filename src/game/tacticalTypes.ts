import type {
  DuelResult,
  FactionId,
  General,
  LocalizedText,
  PlayableFactionId,
  TacticId,
  TerrainType,
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
  gateHp?: number; // present on 'gate' tiles; attackers cannot enter while > 0 (0 = breached)
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
  /** Signature skill unavailable this battle (campaign cooldown, held back, or spent in the pre-battle duel). */
  skillLocked: boolean;
  isHiddenAmbush: boolean;
  disorderedTurns: number;
  intimidatedTurns: number; // from Empty Fort Ruse (-25% ATK, -1 Move)
  luredDefDebuffTurns: number; // from Feign Disorder (-15% DEF)
  fortifiedTurns: number; // from Rally/Hold (+25% DEF)
  deathGroundTurns: number; // from Death Ground (+40% ATK, unbreakable)
  wffmStance?: WffmStance;
  wffmTurns: number;
  isFlankSquad?: boolean;
  /** Mountain Ambush plan: forests and hills cost this squad 1 move instead of 2. */
  stealthyMarch?: boolean;
  defeated: boolean;
  /** Morale broke with nowhere to run (encircled or subdued): the survivors lay down arms. */
  surrendered?: boolean;
  /** Morale broke with a way out: the squad left the field and `escapedTroops` survive the battle. */
  routed?: boolean;
  escapedTroops: number;
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
  /** Morale the striking squad loses to the counter-attack. */
  counterMoraleDrop: number;
  /** Damage dealt to the city gate the target is standing in (0 when not on an intact gate). */
  gateDamage: number;
  principles: ArtOfWarPrincipleTag[];
}

export interface GateAttackPreview {
  gateDamage: number;
  gateHpLeft: number;
  breaches: boolean;
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
  kind: 'stratagem' | 'seen_through' | 'skill' | 'fire' | 'ambush' | 'tech' | 'duel' | 'breach';
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
  /** Keep the lead general's signature skill in reserve (War Room "Use Skill" unchecked). */
  holdLeadSkill?: boolean;
}

export interface TacticalBattleState {
  config: TacticalBattleConfig;
  cityName: LocalizedText;
  /** Strategic context carried onto the grid so campaign choices matter in battle. */
  cityDefense: number; // city wall level 1..5: sets gate HP and the rampart DEF bonus
  cityTerrain: TerrainType;
  /** True once a gate is broken or a wall is blown open; the Citadel Flag only counts after this. */
  breached: boolean;
  /** Side fighting with Grand Coalition resolve (+12% ATK & DEF) against the Time-Traveler, if any. */
  coalitionSide: TacticalSide | null;
  /** Attacker ATK bonus vs heroes whose historical flaw matches the chosen tactic (player attacks only). */
  chronoInsightAtk: number;
  /** Extra defender Rampart DEF from Citadel Bastion or Sword Gate (Jiange). */
  extraRampartDef?: number;
  /** Extra defender DEF across the city board (e.g. Jianye Shitoucheng river bluff). */
  defenderCityBonusDef?: number;
  /** Staging Armory / Landmark bonuses for primary attacking squads. */
  attackerStagingAllAtk?: number;
  attackerStagingCavalryAtk?: number;
  attackerStagingRiverAtk?: number;
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
  /** Troops alive at the end: squads still on the field plus routed squads that escaped. */
  attackerRemainingTroops: number;
  defenderRemainingTroops: number;
  /** The part of the remaining troops that left the field as routed squads. */
  attackerEscapedTroops: number;
  defenderEscapedTroops: number;
  attackerGeneralId?: string;
  deputyGeneralId?: string;
  defenderGeneralId?: string;
  /** Signature skill used by an attacking hero (shown in the battle report). */
  skillTriggered?: LocalizedText;
  /** Every hero on either side who spent their signature skill (all go on cooldown). */
  skillUsedHeroIds: string[];
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
