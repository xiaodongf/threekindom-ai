import type { DuelRoundLog, DuelStance, LocalizedText } from '../../game/types.js';

export type DuelStagePhase = 'intro' | 'idle' | 'exchange' | 'finale';

export type DuelMatchupOutcome =
  | 'guard_break'
  | 'riposte'
  | 'parry_punish'
  | 'mirror_clash'
  | 'skill_burst'
  | 'chrono_counter'
  | 'enemy_dominates';

export interface DuelCalloutBanner {
  id: string;
  side: 'left' | 'right' | 'center';
  text: LocalizedText;
  tone: 'gold' | 'crimson' | 'cyan' | 'emerald';
}

export interface DuelCutInState {
  side: 'left' | 'right';
  heroName: LocalizedText;
  skillName: LocalizedText;
  battleCry: LocalizedText;
  portrait: string;
  accentColor: string;
  kind: 'skill' | 'chrono';
}

export interface DuelExchangeEvent {
  id: number;
  round: number;
  log: DuelRoundLog;
  matchup: DuelMatchupOutcome;
  /** True if this round finishes the duel (KO or round 3 end) */
  isFinalRound: boolean;
  winnerIfFinal?: 'attacker' | 'defender' | 'draw';
  atkHpAfter: number;
  defHpAfter: number;
}

export type HorseGaitMode = 'idle' | 'gallop' | 'rear' | 'skid' | 'stagger' | 'trot';

export type RiderActionPose =
  | 'ready'
  | 'salute'
  | 'charge_windup'
  | 'slash_overhead'
  | 'slash_sweep'
  | 'thrust'
  | 'guard_parry'
  | 'evade_duck'
  | 'stagger_hit'
  | 'victory_raise'
  | 'defeat_slump';

export interface RiderFrameState {
  x: number;
  z: number;
  yaw: number;
  gait: HorseGaitMode;
  gaitSpeed: number;
  rearAngle: number;
  bodyPitch: number;
  pose: RiderActionPose;
  /** 0..1 progress within the active pose */
  poseBlend: number;
  /** Normalized 0..1 weapon ribbon trail intensity */
  trailIntensity: number;
  trailColor: string;
  /** True if weapon is knocked away in KO finale */
  disarmed: boolean;
  /** 0..1 fatigue level based on remaining HP */
  fatigue: number;
}

export interface CameraFrameState {
  posX: number;
  posY: number;
  posZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
  shake: number;
  /** Changes whenever the shot cuts, so the camera rig jumps instead of gliding */
  cutId: number;
}

export interface ClashBurstEvent {
  key: string;
  time: number;
  x: number;
  y: number;
  z: number;
  kind: 'parry' | 'heavy' | 'skill' | 'chrono' | 'whiff';
  /** Who delivers the blow; the stage places the effect on the actual blades */
  striker: 'left' | 'right' | 'both';
  hitStopSec: number;
  shake: number;
  callout?: DuelCalloutBanner;
  dmgLeft?: number;
  dmgRight?: number;
}

/** What one general does during an exchange, as moments on the exchange clock */
export interface SideScript {
  /** Times at which this general's blows make contact */
  strikes: number[];
  guard?: [number, number];
  duckAt?: number;
  staggerAt?: number;
  /** How far the general is driven back after the decisive blow */
  knock: number;
}

export interface ExchangeScript {
  left: SideScript;
  right: SideScript;
  firstContact: number;
  lastContact: number;
  /** Both horses rear against each other during this window */
  rear?: [number, number];
  /** Whose blow decides the exchange (the camera favours them) */
  focus: 'left' | 'right' | 'both';
  closeUp?: { side: 'left' | 'right'; start: number; end: number };
  letterbox: number;
  /** Half the distance between the riders when blades meet, and their sideways offset */
  contactHalf: number;
  contactZ: number;
}

export interface ExchangePlan {
  duration: number;
  script: ExchangeScript;
  matchup: DuelMatchupOutcome;
  playerStance: DuelStance;
  enemyStance: DuelStance;
  playerDamage: number;
  enemyDamage: number;
  cutIn?: {
    start: number;
    end: number;
    side: 'left' | 'right';
    kind: 'skill' | 'chrono';
  };
  chronoScanWindow?: {
    start: number;
    end: number;
  };
  bursts: ClashBurstEvent[];
  slowMoWindows: Array<{ start: number; end: number; scale: number }>;
  hpApplyTime: number;
  /** Audio swing timestamps */
  swingCues: Array<{ key: string; time: number; weight: 'light' | 'heavy' }>;
}

export interface SampledDuelFrame {
  left: RiderFrameState;
  right: RiderFrameState;
  camera: CameraFrameState;
  timeScale: number;
  letterbox: number;
  chronoScanAlpha: number;
  bannerCheer: number;
  /** Zoom-blur strength for the sense of speed during a charge */
  radialBlur: number;
}
