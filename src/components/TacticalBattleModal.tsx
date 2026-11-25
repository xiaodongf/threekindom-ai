import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Bomb,
  Bot,
  Box,
  Compass,
  Crown,
  FastForward,
  Flame,
  Footprints,
  Save,
  Shield,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import {
  ART_OF_WAR_STRATAGEMS,
  WFFM_STANCES,
  WIND_DELTA,
  applyGridDuelResult,
  calculateStratagemSuccess,
  canUseDeathGround,
  createTacticalBattle,
  endTacticalSideTurn,
  executeArtOfWarStratagem,
  executeGateAttack,
  executeGunpowderBomb,
  executeHeroSignatureSkill,
  executeRallyHold,
  executeSingleAITurnStep,
  executeTacticalAttack,
  extractTacticalBattleOutcome,
  getAttackTargets,
  getGateAttackTargets,
  getHeroSkillTargetCoords,
  getRampartDefBonus,
  getReachableTiles,
  getStratagemTargetCoords,
  isIntactGate,
  getUnitEffectiveAttackRange,
  getUnitEffectiveMove,
  manhattan,
  moveTacticalUnit,
  previewAttack,
  previewGateAttack,
} from '../game/tacticalEngine.js';
import type {
  ArtOfWarStratagemId,
  GridCoord,
  TacticalBattleConfig,
  TacticalBattleOutcome,
  TacticalBattleState,
  TacticalCommandMode,
  TacticalTile,
  TacticalTileType,
  TacticalUnit,
  WffmStance,
} from '../game/tacticalTypes.js';
import type { FactionId, GameState, Language, LocalizedText } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { battleAudio } from '../utils/battleAudio.js';
import { DuelModal } from './DuelModal.js';
import { TacticalBoardCanvas } from './tactical/TacticalBoardCanvas.js';
import { ThreatLines, type ThreatLine } from './tactical/ThreatLines.js';
import { UnitToken } from './tactical/UnitToken.js';
import { TacticalVfxCanvas, type TacticalVfxEvent } from './TacticalVfxCanvas.js';
import { Art } from './ui/Art.js';
import { CountUp } from './ui/CountUp.js';
import { Seal } from './ui/Seal.js';

interface TacticalBattleModalProps {
  gameState: GameState;
  config: TacticalBattleConfig;
  lang: Language;
  /** Optional pre-ignited demo setup for visual inspection */
  demoPreset?: boolean;
  /** Optional saved mid-battle state when resuming from disk/cloud */
  initialBattleState?: TacticalBattleState;
  onBattleStateChange?: (battle: TacticalBattleState) => void;
  onSaveAndExit?: (battle: TacticalBattleState) => void;
  onComplete: (outcome: TacticalBattleOutcome) => void;
}

const FACTION_RING: Record<FactionId, { ring: string; bg: string; badge: string; text: string }> = {
  wei: { ring: '#60a5fa', bg: '#1d4ed8', badge: '魏', text: 'text-blue-300' },
  shu: { ring: '#34d399', bg: '#047857', badge: '蜀', text: 'text-emerald-300' },
  wu: { ring: '#fb7185', bg: '#be123c', badge: '吴', text: 'text-rose-300' },
  neutral: { ring: '#cbd5e1', bg: '#475569', badge: '群', text: 'text-slate-300' },
};

const TILE_INFO: Record<TacticalTileType, { name: LocalizedText; hint: LocalizedText }> = {
  plains: {
    name: { en: 'Plains', zh: '平原' },
    hint: { en: 'Move 1 · Cavalry +20% Charge ATK', zh: '移动1 · 骑兵平原冲锋 +20%' },
  },
  forest: {
    name: { en: 'Dense Forest', zh: '密林' },
    hint: {
      en: 'Move 2 · +20% DEF · Ambush · FLAMMABLE (Fire Attack spreads downwind!)',
      zh: '移动2 · 防御+20% · 可设伏 · 易燃（火攻可顺风蔓延！）',
    },
  },
  water: {
    name: { en: 'River / Lake', zh: '江河湖泊' },
    hint: {
      en: 'Blocks land units · Wu / Steamship move 1 (+22~30% Naval ATK)',
      zh: '陆军不可通行 · 东吴/蒸汽战船畅行（水战攻+22~30%）',
    },
  },
  bridge: {
    name: { en: 'Timber Bridge', zh: '浮桥木道' },
    hint: {
      en: 'Move 1 crossing over water · Flammable chokepoint!',
      zh: '渡河要道（移动1）· 可被火攻焚烧！',
    },
  },
  ford: {
    name: { en: 'Shallow Ford', zh: '浅滩渡口' },
    hint: {
      en: 'Move 2 · Sun Tzu "Half-Crossed Water": land units take +25% DMG!',
      zh: '移动2 · 孙子【半渡而击】：陆军涉水受击伤害 +25%！',
    },
  },
  hill: {
    name: { en: 'High Ground Hill', zh: '山地高地' },
    hint: {
      en: 'Move 2 · +25% DEF · +15% downhill ATK · Archers +1 Range',
      zh: '移动2 · 防+25% · 居高临下攻+15% · 弓弩射程+1',
    },
  },
  wall: {
    name: { en: 'City Wall', zh: '坚固城墙' },
    hint: {
      en: 'Defenders here gain the rampart DEF bonus · Blocks attackers (breach with Black Powder!)',
      zh: '守军获城防加成 · 阻挡攻军（可用黑火药轰塌！）',
    },
  },
  gate: {
    name: { en: 'City Gate', zh: '城门要冲' },
    hint: {
      en: 'Closed to attackers until battered down · Defenders gain the rampart DEF bonus · Empty Fort Ruse (空城计)!',
      zh: '攻破之前攻军不可通行 · 守军获城防加成 · 可发动【空城计】！',
    },
  },
  citadel: {
    name: { en: 'Citadel Command Flag', zh: '城池本阵大旗' },
    hint: {
      en: 'Objective! Attackers win by occupying this tile once a gate or wall is breached.',
      zh: '决胜要地！城门或城墙告破后，攻方占领此格即攻克城池！',
    },
  },
};

const CLASS_LABEL: Record<TacticalUnit['unitClass'], LocalizedText> = {
  cavalry: { en: 'Cavalry', zh: '骑兵' },
  infantry: { en: 'Infantry', zh: '重步' },
  archer: { en: 'Strategist / Archer', zh: '策士弓弩' },
  naval: { en: 'Naval Fleet', zh: '江河水师' },
};

const STRATAGEM_ORDER: ArtOfWarStratagemId[] = [
  'fire_attack',
  'feign_disorder',
  'empty_fort_ambush',
  'wffm',
  'death_ground',
  'subdue_chaos',
];

function createInitialTacticalState(
  gameState: GameState,
  config: TacticalBattleConfig,
  demoPreset?: boolean
): TacticalBattleState {
  let st = createTacticalBattle(gameState, config);
  if (demoPreset) {
    // Showcase active Fire Attack spreading on Forest + Sun Tzu Callout for instant visual inspection
    const grid = st.grid.map((r) => r.map((t) => ({ ...t })));
    if (grid[1][4]) grid[1][4].fireTurns = 3;
    if (grid[1][5]) grid[1][5].fireTurns = 2;
    st = {
      ...st,
      wind: 'E',
      sp: { attacker: 3, defender: 2 },
      grid,
      lastCallout: {
        id: 'demo-callout',
        kind: 'fire',
        title: ART_OF_WAR_STRATAGEMS.fire_attack.name,
        quote: ART_OF_WAR_STRATAGEMS.fire_attack.quote,
        subtitle: {
          en: 'Zhuge Liang ignited the riverside forest (95% INT odds)! Flames spread eastward.',
          zh: '诸葛亮借风纵火成功（智力成功率 95%），烈焰正向东蔓延！',
        },
        side: 'attacker',
      },
    };
  }
  return st;
}

export function TacticalBattleModal({
  gameState,
  config,
  lang,
  demoPreset,
  initialBattleState,
  onBattleStateChange,
  onSaveAndExit,
  onComplete,
}: TacticalBattleModalProps) {
  const [battle, setBattle] = useState<TacticalBattleState>(
    () => initialBattleState ?? createInitialTacticalState(gameState, config, demoPreset)
  );

  useEffect(() => {
    onBattleStateChange?.(battle);
  }, [battle, onBattleStateChange]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(() => {
    const first = battle.units.find((u) => !u.defeated && u.side === config.playerSide);
    return first?.id ?? null;
  });
  const [commandMode, setCommandMode] = useState<TacticalCommandMode>('move');
  const [activeStratagem, setActiveStratagem] = useState<ArtOfWarStratagemId | null>(null);
  const [showWffmPicker, setShowWffmPicker] = useState(false);
  const [hoveredCoord, setHoveredCoord] = useState<GridCoord | null>(null);
  const [aiAutoPlay, setAiAutoPlay] = useState(false);
  const [tilt25D, setTilt25D] = useState(false);
  const [muted, setMuted] = useState(battleAudio.muted);
  const [vfxEvent, setVfxEvent] = useState<TacticalVfxEvent | null>(null);
  const [boardShaking, setBoardShaking] = useState(false);
  const [floatingPopups, setFloatingPopups] = useState<
    Array<{ id: string; row: number; col: number; text: string; tone: 'dmg' | 'fire' | 'good' | 'fail' }>
  >([]);
  const [skillCutIn, setSkillCutIn] = useState<{
    id: string;
    heroName: LocalizedText;
    skillName: LocalizedText;
    quote?: LocalizedText;
    portrait?: string;
  } | null>(null);
  const [activeGridDuel, setActiveGridDuel] = useState<{
    atkUnit: TacticalUnit;
    defUnit: TacticalUnit;
  } | null>(null);

  const [shakeAmp, setShakeAmp] = useState(5);
  const [aiSpeed, setAiSpeed] = useState<1 | 2 | 4>(1);
  /** One blow in flight: who lunges, who is struck, and along which direction. */
  const [impact, setImpact] = useState<{
    key: string;
    attackerId?: string;
    targetIds: string[];
    dx: number;
    dy: number;
  } | null>(null);

  /** Shake scales with the blow: `amp` is the travel in pixels. */
  const triggerBoardShake = (amp = 6) => {
    setShakeAmp(amp);
    setBoardShaking(false);
    window.requestAnimationFrame(() => setBoardShaking(true));
    window.setTimeout(() => setBoardShaking(false), 360);
  };

  /** Lunge, hit-stop and recoil for one exchange; `weight` is the share of the target's strength lost. */
  const triggerImpact = (
    attacker: { id: string; row: number; col: number } | undefined,
    targets: Array<{ id: string; row: number; col: number }>,
    weight: number
  ) => {
    if (targets.length === 0) return;
    const first = targets[0];
    let dx = 0;
    let dy = 0;
    if (attacker) {
      const len = Math.hypot(first.col - attacker.col, first.row - attacker.row) || 1;
      dx = (first.col - attacker.col) / len;
      dy = (first.row - attacker.row) / len;
    }
    const key = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setImpact({ key, attackerId: attacker?.id, targetIds: targets.map((t) => t.id), dx, dy });
    window.setTimeout(() => setImpact((cur) => (cur?.key === key ? null : cur)), 440);
    if (weight > 0.06) {
      // The shake lands with the blow, after the lunge has closed the distance
      window.setTimeout(() => triggerBoardShake(Math.min(11, 2.5 + weight * 16)), 120);
    }
  };

  const spawnPopup = (
    row: number,
    col: number,
    text: string,
    tone: 'dmg' | 'fire' | 'good' | 'fail' = 'dmg'
  ) => {
    const id = `pop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFloatingPopups((prev) => [...prev.slice(-4), { id, row, col, text, tone }]);
    window.setTimeout(() => {
      setFloatingPopups((prev) => prev.filter((p) => p.id !== id));
    }, 1350);
  };

  const triggerCutIn = (
    heroName: LocalizedText,
    skillName: LocalizedText,
    quote?: LocalizedText,
    portrait?: string
  ) => {
    const id = `cut-${Date.now()}`;
    setSkillCutIn({ id, heroName, skillName, quote, portrait });
    window.setTimeout(() => {
      setSkillCutIn((prev) => (prev?.id === id ? null : prev));
    }, 1680);
  };

  const playerSide = battle.config.playerSide;
  const isPlayerTurn = battle.activeSide === playerSide && !aiAutoPlay && !battle.winner;

  const selectedUnit = useMemo(
    () => battle.units.find((u) => u.id === selectedUnitId && !u.defeated) ?? null,
    [battle.units, selectedUnitId]
  );

  // Auto-select first ready player unit when player's turn starts or active unit finishes
  useEffect(() => {
    if (!isPlayerTurn) return;
    if (
      !selectedUnit ||
      selectedUnit.side !== playerSide ||
      (selectedUnit.hasMoved && selectedUnit.hasActed)
    ) {
      const nextReady = battle.units.find(
        (u) => !u.defeated && u.side === playerSide && (!u.hasMoved || !u.hasActed)
      );
      if (nextReady) {
        setSelectedUnitId(nextReady.id);
        setCommandMode(nextReady.hasMoved ? 'attack' : 'move');
        setActiveStratagem(null);
        setShowWffmPicker(false);
      }
    }
  }, [battle.activeSide, battle.units, isPlayerTurn, playerSide, selectedUnit]);

  // Step through AI Enemy Turn (or Player AI Auto-Finish mode) smoothly!
  useEffect(() => {
    if (battle.winner || activeGridDuel) return;
    const shouldRunAI = battle.activeSide !== playerSide || aiAutoPlay;
    if (!shouldRunAI) return;

    const delay = (aiAutoPlay ? 180 : 420) / aiSpeed;
    const timer = window.setTimeout(() => {
      // The step rolls dice and plays sounds, so it runs here - exactly once per tick - rather than
      // inside a setState updater (which React may invoke twice). `battle` is the state this
      // effect was scheduled for; any change to it reschedules the timer.
      const beforeCalloutId = battle.lastCallout?.id;
      const { state: next } = executeSingleAITurnStep(battle);
      if (next.lastCallout && next.lastCallout.id !== beforeCalloutId) {
        if (
          next.lastCallout.kind === 'fire' ||
          next.lastCallout.kind === 'tech' ||
          next.lastCallout.kind === 'breach'
        ) {
          battleAudio.playExplosion(0.2);
        } else if (next.lastCallout.kind === 'skill') {
          battleAudio.playSkillSurge(0.2);
        } else {
          battleAudio.playWarDrum(0.18);
        }
      } else {
        battleAudio.playSteelClash(0.1);
      }
      if (next.winner) {
        battleAudio.playOutcomeHorn(next.winner === playerSide, 0.2);
      }
      // Show what the step did: every squad that lost men is struck and its loss is named
      const hurt = next.units
        .map((u) => ({ u, before: battle.units.find((b) => b.id === u.id) }))
        .filter((x) => x.before && x.u.troops < x.before.troops);
      if (hurt.length > 0) {
        const actor = next.units.find((u) => {
          const b = battle.units.find((x) => x.id === u.id);
          return b && !b.hasActed && u.hasActed && u.side === battle.activeSide;
        });
        const struck = hurt.filter((x) => x.u.id !== actor?.id);
        for (const x of hurt.slice(0, 4)) {
          spawnPopup(x.before!.row, x.before!.col, `-${(x.before!.troops - x.u.troops).toLocaleString()}`, 'dmg');
        }
        const worst = Math.max(
          ...hurt.map((x) => (x.before!.troops - x.u.troops) / Math.max(1, x.before!.maxTroops))
        );
        triggerImpact(
          actor ? battle.units.find((b) => b.id === actor.id) : undefined,
          (struck.length > 0 ? struck : hurt).map((x) => x.before!),
          worst
        );
      }
      setBattle(next);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [battle, aiAutoPlay, aiSpeed, playerSide, activeGridDuel]);

  const reachableTiles = useMemo(() => {
    if (!isPlayerTurn || !selectedUnit || selectedUnit.side !== playerSide || commandMode !== 'move') {
      return [];
    }
    return getReachableTiles(battle, selectedUnit);
  }, [battle, commandMode, isPlayerTurn, playerSide, selectedUnit]);

  const attackTargets = useMemo(() => {
    if (!isPlayerTurn || !selectedUnit || selectedUnit.side !== playerSide) return [];
    return getAttackTargets(battle, selectedUnit);
  }, [battle, isPlayerTurn, playerSide, selectedUnit]);

  const stratagemCoords = useMemo(() => {
    if (
      !isPlayerTurn ||
      !selectedUnit ||
      selectedUnit.side !== playerSide ||
      commandMode !== 'stratagem' ||
      !activeStratagem
    ) {
      return [];
    }
    return getStratagemTargetCoords(battle, selectedUnit, activeStratagem);
  }, [activeStratagem, battle, commandMode, isPlayerTurn, playerSide, selectedUnit]);

  const skillTargetCoords = useMemo(() => {
    if (!isPlayerTurn || !selectedUnit || commandMode !== 'hero_skill') return [];
    return getHeroSkillTargetCoords(battle, selectedUnit);
  }, [battle, commandMode, isPlayerTurn, selectedUnit]);

  // Standing, undefended gates the selected squad can batter right now
  const gateTargets = useMemo(() => {
    if (!isPlayerTurn || !selectedUnit || selectedUnit.side !== playerSide) return [];
    return getGateAttackTargets(battle, selectedUnit);
  }, [battle, isPlayerTurn, playerSide, selectedUnit]);

  const bombCoords = useMemo(() => {
    if (
      !isPlayerTurn ||
      !selectedUnit ||
      commandMode !== 'gunpowder_bomb' ||
      battle.gunpowderBombsLeft[playerSide] <= 0
    ) {
      return [];
    }
    const coords: GridCoord[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const d = manhattan(selectedUnit.row, selectedUnit.col, r, c);
        if (d >= 1 && d <= 3) coords.push({ row: r, col: c });
      }
    }
    return coords;
  }, [battle, commandMode, isPlayerTurn, playerSide, selectedUnit]);

  const adjacentDuelTarget = useMemo(() => {
    if (
      !isPlayerTurn ||
      !selectedUnit ||
      selectedUnit.hasActed ||
      !selectedUnit.heroId ||
      battle.duelUsedOnGrid
    ) {
      return null;
    }
    return (
      battle.units.find(
        (u) =>
          !u.defeated &&
          u.side !== selectedUnit.side &&
          Boolean(u.heroId) &&
          manhattan(selectedUnit.row, selectedUnit.col, u.row, u.col) === 1
      ) ?? null
    );
  }, [battle.duelUsedOnGrid, battle.units, isPlayerTurn, selectedUnit]);

  // Live Hover Preview (Damage + Art of War Principles OR Intellect Stratagem Success Rate!)
  const hoverAttackPreview = useMemo(() => {
    if (!hoveredCoord || !selectedUnit || selectedUnit.side !== playerSide || selectedUnit.hasActed) {
      return null;
    }
    if (commandMode !== 'attack' && commandMode !== 'move') return null;
    const occ = battle.units.find(
      (u) => !u.defeated && u.row === hoveredCoord.row && u.col === hoveredCoord.col && u.side !== playerSide
    );
    if (!occ || !attackTargets.some((t) => t.id === occ.id)) return null;
    return { target: occ, preview: previewAttack(battle, selectedUnit, occ) };
  }, [attackTargets, battle, commandMode, hoveredCoord, playerSide, selectedUnit]);

  const hoverGatePreview = useMemo(() => {
    if (!hoveredCoord || !selectedUnit || selectedUnit.hasActed) return null;
    if (commandMode !== 'attack' && commandMode !== 'move') return null;
    if (!gateTargets.some((p) => p.row === hoveredCoord.row && p.col === hoveredCoord.col)) return null;
    return previewGateAttack(battle, selectedUnit, hoveredCoord.row, hoveredCoord.col);
  }, [battle, commandMode, gateTargets, hoveredCoord, selectedUnit]);

  const hoverStratagemPreview = useMemo(() => {
    if (!hoveredCoord || !selectedUnit || commandMode !== 'stratagem' || !activeStratagem) {
      return null;
    }
    if (!stratagemCoords.some((p) => p.row === hoveredCoord.row && p.col === hoveredCoord.col)) {
      return null;
    }
    return calculateStratagemSuccess(
      battle,
      selectedUnit,
      activeStratagem,
      hoveredCoord.row,
      hoveredCoord.col
    );
  }, [activeStratagem, battle, commandMode, hoveredCoord, selectedUnit, stratagemCoords]);

  const hoveredTile: TacticalTile | null = hoveredCoord
    ? battle.grid[hoveredCoord.row][hoveredCoord.col]
    : null;

  const toggleMute = () => {
    const next = !muted;
    battleAudio.muted = next;
    setMuted(next);
  };

  function handleTileClick(row: number, col: number) {
    if (!isPlayerTurn) return;
    const occupant = battle.units.find((u) => !u.defeated && u.row === row && u.col === col);

    // 1. Clicking a friendly squad selects it (unless casting a self-targeted stratagem/skill on self)
    if (
      occupant &&
      occupant.side === playerSide &&
      !(
        selectedUnit?.id === occupant.id &&
        (commandMode === 'stratagem' || commandMode === 'hero_skill')
      )
    ) {
      setSelectedUnitId(occupant.id);
      setCommandMode(occupant.hasMoved ? 'attack' : 'move');
      setActiveStratagem(null);
      setShowWffmPicker(false);
      return;
    }

    if (!selectedUnit || selectedUnit.side !== playerSide) return;

    // 2. Stratagem Cast
    if (commandMode === 'stratagem' && activeStratagem) {
      if (stratagemCoords.some((p) => p.row === row && p.col === col)) {
        const next = executeArtOfWarStratagem(battle, selectedUnit.id, activeStratagem, row, col);
        const failed = next.lastCallout?.kind === 'seen_through';
        setVfxEvent({
          id: `vfx-${Date.now()}`,
          kind: failed ? 'seen_through' : activeStratagem === 'fire_attack' ? 'fire_blast' : 'stratagem_ring',
          fromRow: selectedUnit.row,
          fromCol: selectedUnit.col,
          toRow: row,
          toCol: col,
        });
        if (failed) {
          battleAudio.playWarDrum(0.18);
          spawnPopup(row, col, lang === 'zh' ? '计谋被识破！' : 'SEEN THROUGH!', 'fail');
        } else if (activeStratagem === 'fire_attack') {
          battleAudio.playExplosion(0.24);
          triggerBoardShake();
          spawnPopup(row, col, lang === 'zh' ? '🔥 借风纵火！' : '🔥 FIRE ATTACK!', 'fire');
          triggerCutIn(
            selectedUnit.name,
            ART_OF_WAR_STRATAGEMS.fire_attack.name,
            ART_OF_WAR_STRATAGEMS.fire_attack.quote,
            selectedUnit.portrait
          );
        } else {
          battleAudio.playSkillSurge(0.2);
          spawnPopup(row, col, tLoc(ART_OF_WAR_STRATAGEMS[activeStratagem].name, lang), 'good');
          triggerCutIn(
            selectedUnit.name,
            ART_OF_WAR_STRATAGEMS[activeStratagem].name,
            ART_OF_WAR_STRATAGEMS[activeStratagem].quote,
            selectedUnit.portrait
          );
        }
        if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
        setBattle(next);
        setActiveStratagem(null);
        setCommandMode('move');
      }
      return;
    }

    // 3. Hero Signature Skill
    if (commandMode === 'hero_skill') {
      if (skillTargetCoords.some((p) => p.row === row && p.col === col)) {
        const next = executeHeroSignatureSkill(battle, selectedUnit.id, row, col);
        const heroObj = selectedUnit.heroId ? battle.preBattleHeroes[selectedUnit.heroId] : undefined;
        setVfxEvent({
          id: `vfx-${Date.now()}`,
          kind: heroObj?.signatureSkill.effect === 'fire_ignore_def' ? 'fire_blast' : 'slash',
          fromRow: selectedUnit.row,
          fromCol: selectedUnit.col,
          toRow: row,
          toCol: col,
        });
        triggerBoardShake();
        if (heroObj) {
          triggerCutIn(
            heroObj.name,
            heroObj.signatureSkill.name,
            heroObj.signatureSkill.battleCry,
            heroObj.portrait
          );
          spawnPopup(row, col, `✨ ${tLoc(heroObj.signatureSkill.name, lang)}`, 'fire');
        }
        battleAudio.playSkillSurge(0.26);
        if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
        setBattle(next);
        setCommandMode('move');
      }
      return;
    }

    // 4. Black Powder 2x2 Bomb
    if (commandMode === 'gunpowder_bomb') {
      if (bombCoords.some((p) => p.row === row && p.col === col)) {
        const next = executeGunpowderBomb(battle, selectedUnit.id, row, col);
        setVfxEvent({
          id: `vfx-${Date.now()}`,
          kind: 'bomb_blast',
          fromRow: selectedUnit.row,
          fromCol: selectedUnit.col,
          toRow: row,
          toCol: col,
        });
        triggerBoardShake();
        spawnPopup(row, col, lang === 'zh' ? '💣 震天雷轰炸！' : '💣 BLACK POWDER BLAST!', 'fire');
        battleAudio.playExplosion(0.32);
        if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
        setBattle(next);
        setCommandMode('move');
      }
      return;
    }

    // 5. Direct Attack on an enemy in range (works directly in both 'move' and 'attack' modes!)
    if (occupant && occupant.side !== playerSide && attackTargets.some((t) => t.id === occupant.id)) {
      const prev = previewAttack(battle, selectedUnit, occupant);
      const next = executeTacticalAttack(battle, selectedUnit.id, occupant.id);
      const dist = manhattan(selectedUnit.row, selectedUnit.col, occupant.row, occupant.col);
      setVfxEvent({
        id: `vfx-${Date.now()}`,
        kind: dist > 1 ? 'arrow' : 'slash',
        fromRow: selectedUnit.row,
        fromCol: selectedUnit.col,
        toRow: occupant.row,
        toCol: occupant.col,
      });
      triggerImpact(selectedUnit, [occupant], prev.estimatedDamage / Math.max(1, occupant.maxTroops));
      const topPrinciple = prev.principles.find((p) => p.positive);
      spawnPopup(
        occupant.row,
        occupant.col,
        `-${prev.estimatedDamage.toLocaleString()}${
          topPrinciple ? ` · ${tLoc(topPrinciple.label, lang).split(' ')[0]}` : ''
        }`,
        'dmg'
      );
      if (dist > 1) battleAudio.playArrowVolley(0.18);
      else battleAudio.playSteelClash(0.18);
      if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
      setBattle(next);
      setCommandMode('move');
      return;
    }

    // 5b. Batter a standing, undefended city gate in range
    if (!occupant && gateTargets.some((p) => p.row === row && p.col === col)) {
      const gatePrev = previewGateAttack(battle, selectedUnit, row, col);
      const next = executeGateAttack(battle, selectedUnit.id, row, col);
      const dist = manhattan(selectedUnit.row, selectedUnit.col, row, col);
      setVfxEvent({
        id: `vfx-${Date.now()}`,
        kind: dist > 1 ? 'arrow' : 'slash',
        fromRow: selectedUnit.row,
        fromCol: selectedUnit.col,
        toRow: row,
        toCol: col,
      });
      if (gatePrev.breaches) {
        triggerBoardShake();
        battleAudio.playExplosion(0.26);
        spawnPopup(row, col, lang === 'zh' ? '城门告破！' : 'GATE BREACHED!', 'fire');
      } else {
        battleAudio.playSteelClash(0.18);
        spawnPopup(
          row,
          col,
          `${lang === 'zh' ? '城门' : 'Gate'} -${gatePrev.gateDamage.toLocaleString()}`,
          'dmg'
        );
      }
      if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
      setBattle(next);
      setCommandMode('move');
      return;
    }

    // 6. Move onto reachable tile
    if (commandMode === 'move' && reachableTiles.some((p) => p.row === row && p.col === col)) {
      const next = moveTacticalUnit(battle, selectedUnit.id, row, col);
      battleAudio.playWarDrum(0.16);
      if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
      setBattle(next);
      setCommandMode('attack');
    }
  }

  function handleSelectStratagem(id: ArtOfWarStratagemId) {
    if (!isPlayerTurn || !selectedUnit || selectedUnit.hasActed || selectedUnit.disorderedTurns > 0) {
      return;
    }
    const def = ART_OF_WAR_STRATAGEMS[id];
    if (battle.sp[playerSide] < def.spCost) return;

    if (id === 'wffm') {
      setShowWffmPicker((v) => !v);
      setActiveStratagem('wffm');
      setCommandMode('stratagem');
      return;
    }

    setShowWffmPicker(false);

    // Self-targeted stratagems execute immediately with INT roll!
    if (id === 'death_ground' || id === 'empty_fort_ambush') {
      if (id === 'death_ground' && !canUseDeathGround(battle, selectedUnit)) return;
      const next = executeArtOfWarStratagem(battle, selectedUnit.id, id, selectedUnit.row, selectedUnit.col);
      if (next.lastCallout?.kind === 'seen_through') battleAudio.playWarDrum(0.18);
      else battleAudio.playSkillSurge(0.22);
      setBattle(next);
      setActiveStratagem(null);
      setCommandMode('move');
      return;
    }

    setActiveStratagem(id);
    setCommandMode('stratagem');
  }

  function handleCastWffm(stance: WffmStance) {
    if (!selectedUnit) return;
    const next = executeArtOfWarStratagem(
      battle,
      selectedUnit.id,
      'wffm',
      selectedUnit.row,
      selectedUnit.col,
      stance
    );
    battleAudio.playSkillSurge(0.2);
    setBattle(next);
    setShowWffmPicker(false);
    setActiveStratagem(null);
    setCommandMode(stance === 'wind' && !selectedUnit.hasMoved ? 'move' : 'attack');
  }

  function handleEndPlayerTurn() {
    if (!isPlayerTurn) return;
    setActiveStratagem(null);
    setShowWffmPicker(false);
    setCommandMode('move');
    const next = endTacticalSideTurn(battle);
    if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
    setBattle(next);
  }

  // What each side brought to the field, for the count-down in the verdict
  const atkFielded = battle.units
    .filter((u) => u.side === 'attacker')
    .reduce((sum, u) => sum + u.maxTroops, 0);
  const defFielded = battle.units
    .filter((u) => u.side === 'defender')
    .reduce((sum, u) => sum + u.maxTroops, 0);
  const atkTotalTroops = battle.units
    .filter((u) => u.side === 'attacker' && !u.defeated)
    .reduce((s, u) => s + u.troops, 0);
  const defTotalTroops = battle.units
    .filter((u) => u.side === 'defender' && !u.defeated)
    .reduce((s, u) => s + u.troops, 0);

  const revealsEnemyAmbush =
    playerSide === 'attacker'
      ? battle.attackerHasBalloon || battle.attackerHasSpyglass
      : battle.defenderHasBalloon || battle.defenderHasSpyglass;

  const threatLines = useMemo<ThreatLine[]>(() => {
    if (!isPlayerTurn || !hoveredCoord || !selectedUnit || commandMode !== 'move') return [];
    const onOwnTile = selectedUnit.row === hoveredCoord.row && selectedUnit.col === hoveredCoord.col;
    const canStandThere =
      onOwnTile || reachableTiles.some((p) => p.row === hoveredCoord.row && p.col === hoveredCoord.col);
    if (!canStandThere) return [];
    const lines: ThreatLine[] = [];
    for (const enemy of battle.units) {
      if (enemy.defeated || enemy.side === playerSide) continue;
      if (enemy.isHiddenAmbush && !revealsEnemyAmbush) continue;
      const dist = manhattan(enemy.row, enemy.col, hoveredCoord.row, hoveredCoord.col);
      const range = getUnitEffectiveAttackRange(battle, enemy);
      if (dist <= range) {
        lines.push({ fromRow: enemy.row, fromCol: enemy.col, toRow: hoveredCoord.row, toCol: hoveredCoord.col, direct: true });
      } else if (dist <= range + getUnitEffectiveMove(enemy)) {
        lines.push({ fromRow: enemy.row, fromCol: enemy.col, toRow: hoveredCoord.row, toCol: hoveredCoord.col, direct: false });
      }
    }
    return lines;
  }, [battle, commandMode, hoveredCoord, isPlayerTurn, playerSide, reachableTiles, revealsEnemyAmbush, selectedUnit]);


  const atkShort = tLoc(gameState.factions[battle.config.attackerFaction].shortName, lang);
  const defShort =
    battle.config.defenderFaction === 'neutral'
      ? lang === 'zh'
        ? '守军'
        : 'Garrison'
      : tLoc(gameState.factions[battle.config.defenderFaction].shortName, lang);

  const selectedHeroObj =
    selectedUnit?.heroId ? battle.preBattleHeroes[selectedUnit.heroId] : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-[1400px] w-full overflow-hidden shadow-[0_24px_80px_rgba(6,4,2,0.95)] flex flex-col max-h-[96vh]">
        {/* TOP TACTICAL HUD */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-400/35">
              <Swords className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm sm:text-base font-extrabold text-white">
                  {lang === 'zh'
                    ? `${tLoc(battle.cityName, lang)} 8×8 阵前沙盘战`
                    : `Battle of ${tLoc(battle.cityName, lang)} · 8×8 Tactical Grid`}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-cyan-200">
                  {lang === 'zh'
                    ? `第 ${Math.min(battle.round, battle.maxRounds)}/${battle.maxRounds} 合`
                    : `Round ${Math.min(battle.round, battle.maxRounds)}/${battle.maxRounds}`}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    aiAutoPlay
                      ? 'bg-indigo-500/25 border border-indigo-400/50 text-indigo-200'
                      : isPlayerTurn
                        ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-200'
                        : 'bg-rose-500/20 border border-rose-400/50 text-rose-200 animate-pulse'
                  }`}
                >
                  {aiAutoPlay
                    ? lang === 'zh'
                      ? 'AI 托管指挥中'
                      : 'AI Auto-Command'
                    : isPlayerTurn
                      ? lang === 'zh'
                        ? '我军行动回合'
                        : 'Your Command'
                      : lang === 'zh'
                        ? '敌军行动中…'
                        : 'Enemy Turn…'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300 mt-0.5">
                <span className="flex items-center gap-1 text-amber-300 font-semibold">
                  <Wind className="w-3.5 h-3.5" />
                  {tLoc(WIND_DELTA[battle.wind].label, lang)}
                </span>
                <span className="flex items-center gap-1 text-cyan-300 font-semibold">
                  <Zap className="w-3.5 h-3.5" />
                  {lang === 'zh' ? '军略点' : 'Stratagem SP'}:{' '}
                  <span className="font-mono font-bold text-white">
                    {battle.sp[playerSide]}/{5}
                  </span>
                </span>
                {battle.hasWaterFeature && (
                  <span className="flex items-center gap-1 text-sky-300">
                    <Waves className="w-3.5 h-3.5" />
                    {lang === 'zh' ? '临江水战地形' : 'River/Lake Terrain'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Live Total Troops + Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 px-3 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">{atkShort}</span>
                <span className="font-mono font-extrabold text-cyan-300">
                  {atkTotalTroops.toLocaleString()}
                </span>
              </div>
              <span className="text-rose-400 font-black">VS</span>
              <div>
                <span className="text-[10px] text-slate-400 block">{defShort}</span>
                <span className="font-mono font-extrabold text-rose-300">
                  {defTotalTroops.toLocaleString()}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTilt25D((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                tilt25D
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Toggle 2.5D Tabletop Perspective Tilt"
            >
              <Box className="w-3.5 h-3.5" />
              <span>{tilt25D ? '2.5D' : '2D'}</span>
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
            </button>

            <button
              type="button"
              onClick={() => setAiSpeed((v) => (v === 1 ? 2 : v === 2 ? 4 : 1))}
              title={lang === 'zh' ? '敌军与托管回合的播放速度' : 'Playback speed of enemy and auto-played turns'}
              className="px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-100 flex items-center gap-1 cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{aiSpeed}×</span>
            </button>

            <button
              type="button"
              disabled={Boolean(battle.winner)}
              onClick={() => setAiAutoPlay((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 ${
                aiAutoPlay
                  ? 'bg-indigo-600 border-indigo-300 text-white shadow-[0_0_16px_rgba(208,167,79,0.5)]'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-indigo-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>
                {aiAutoPlay
                  ? lang === 'zh'
                    ? '暂停 AI 托管'
                    : 'Pause AI'
                  : lang === 'zh'
                    ? '交由 AI 托管'
                    : 'AI Auto-Finish'}
              </span>
            </button>

            {onSaveAndExit && !battle.winner && (
              <button
                type="button"
                onClick={() => onSaveAndExit(battle)}
                title={
                  lang === 'zh'
                    ? '封存当前回合沙盘战局并返回标题页，随时可续战'
                    : 'Save current 8×8 battle round and return to title screen'
                }
                className="px-2.5 py-1.5 rounded-lg border border-amber-400/35 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-amber-200 flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lang === 'zh' ? '暂存退回' : 'Save & Exit'}</span>
              </button>
            )}

            <button
              type="button"
              disabled={!isPlayerTurn}
              onClick={handleEndPlayerTurn}
              className="px-3.5 py-1.5 rounded-lg btn-gold text-xs font-bold shadow cursor-pointer disabled:opacity-40"
            >
              {lang === 'zh' ? '结束本回合' : 'End Turn'}
            </button>
          </div>
        </div>

        {/* MAIN BODY: 8x8 GRID + ART OF WAR COMMAND DRAWER */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 bg-slate-950/70">
          {/* LEFT: 8x8 TACTICAL BATTLEFIELD */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-2">
            {/* Sun Tzu Quote / Seen-Through / Skill Callout Banner. Always rendered at a fixed height
                (it shows the objective until the first callout) so the board never jumps under the cursor. */}
            {battle.lastCallout ? (
              <div
                className={`rounded-xl px-3.5 py-2 border flex items-start justify-between gap-3 text-xs h-[58px] overflow-hidden ${
                  battle.lastCallout.kind === 'seen_through'
                    ? 'bg-rose-950/75 border-rose-400/60 text-rose-100'
                    : battle.lastCallout.kind === 'fire' ||
                        battle.lastCallout.kind === 'tech' ||
                        battle.lastCallout.kind === 'breach'
                      ? 'bg-orange-950/75 border-orange-400/60 text-orange-100'
                      : 'bg-cyan-950/75 border-cyan-400/55 text-cyan-100'
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-display font-extrabold tracking-wide flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                    {battle.lastCallout.kind === 'fire' ? (
                      <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    )}
                    <span className="shrink-0">{tLoc(battle.lastCallout.title, lang)}</span>
                    {battle.lastCallout.quote && (
                      <span className="text-[11px] font-normal italic text-amber-200/90 hidden sm:inline truncate">
                        — {tLoc(battle.lastCallout.quote, lang)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-200 line-clamp-2">
                    {tLoc(battle.lastCallout.subtitle, lang)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl px-3.5 py-2 border bg-slate-900/80 border-slate-700/80 text-xs h-[58px] overflow-hidden">
                <div className="font-display font-extrabold tracking-wide text-amber-200 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>{lang === 'zh' ? '作战目标' : 'Objective'}</span>
                </div>
                <div className="text-[11px] text-slate-200 line-clamp-2">
                  {playerSide === 'attacker'
                    ? lang === 'zh'
                      ? `在 ${battle.maxRounds} 回合内攻破一座城门（或炸塌城墙）后夺取本阵大旗，或击溃全部守军。`
                      : `Within ${battle.maxRounds} rounds, break a gate (or blast a wall) and then seize the Citadel Flag — or rout every defending squad.`
                    : lang === 'zh'
                      ? `坚守 ${battle.maxRounds} 回合或击溃来犯之敌。城门一破，务必守住本阵大旗！`
                      : `Hold out for ${battle.maxRounds} rounds or rout the attackers. Once a gate falls, keep a squad on the Citadel Flag!`}
                </div>
              </div>
            )}

            {/* 8x8 Interactive Painted Battlefield + 60fps Canvas VFX Container */}
            <div className="relative p-2 tactical-25d-stage overflow-hidden">
              <div
                className="relative aspect-square w-full max-w-[min(680px,calc(100vh-15.5rem))] mx-auto tactical-25d-board"
                style={{
                  transform: tilt25D ? 'rotateX(18deg) scale(0.95)' : 'rotateX(0deg) scale(1)',
                }}
              >
              <div
                className={`relative w-full h-full scroll-mount overflow-hidden ${
                  boardShaking ? 'anim-board-shake' : ''
                }`}
                style={{ '--shake': `${shakeAmp}px` } as CSSProperties}
              >
                <TacticalBoardCanvas grid={battle.grid} />
                <div className="relative grid grid-cols-8 grid-rows-8 w-full h-full">
                  {battle.grid.map((rowArr, r) =>
                    rowArr.map((tile, c) => {
                      const occupant = battle.units.find(
                        (u) => !u.defeated && u.row === r && u.col === c
                      );
                      const hideOccupant = Boolean(
                        occupant &&
                          occupant.side !== playerSide &&
                          occupant.isHiddenAmbush &&
                          !revealsEnemyAmbush
                      );
                      const visibleUnit = hideOccupant ? undefined : occupant;

                      const isSelectedTile = Boolean(
                        selectedUnit && selectedUnit.row === r && selectedUnit.col === c
                      );
                      const isReachable = reachableTiles.some((p) => p.row === r && p.col === c);
                      const isAttackable =
                        Boolean(visibleUnit && attackTargets.some((t) => t.id === visibleUnit.id)) ||
                        (!occupant && gateTargets.some((p) => p.row === r && p.col === c));
                      const gateIntact = isIntactGate(tile);
                      const gateBreached = tile.type === 'gate' && !gateIntact;
                      const isStratTarget = stratagemCoords.some((p) => p.row === r && p.col === c);
                      const isSkillTarget = skillTargetCoords.some((p) => p.row === r && p.col === c);
                      const isBombTarget = bombCoords.some((p) => p.row === r && p.col === c);

                      const stratOdds =
                        isStratTarget && selectedUnit && activeStratagem
                          ? calculateStratagemSuccess(battle, selectedUnit, activeStratagem, r, c)
                              .chance
                          : null;

                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          onClick={() => handleTileClick(r, c)}
                          onMouseEnter={() => setHoveredCoord({ row: r, col: c })}
                          onMouseLeave={() => setHoveredCoord(null)}
                          className={`relative min-w-0 min-h-0 flex items-center justify-center cursor-pointer ${
                            isSelectedTile
                              ? 'tile-selected z-10'
                              : isStratTarget
                                ? 'tile-stratagem'
                                : isBombTarget
                                  ? 'tile-bomb'
                                  : isSkillTarget
                                    ? 'tile-skill'
                                    : isAttackable
                                      ? 'tile-attack'
                                      : isReachable
                                        ? 'tile-move'
                                        : 'hover:shadow-[inset_0_0_0_2px_rgba(243,230,195,0.55)]'
                          }`}
                        >
                          {/* Markers for the tiles that carry rules */}
                          {tile.type === 'ford' && !visibleUnit && (
                            <span className="pointer-events-none relative z-10 text-[8px] font-black px-1 py-px rounded bg-cyan-950/80 border border-cyan-400/50 text-cyan-100">
                              {lang === 'zh' ? '浅滩' : 'FORD'}
                            </span>
                          )}
                          {tile.type === 'wall' && !visibleUnit && (
                            <span className="pointer-events-none relative z-10 text-[8px] font-black px-1 py-px rounded bg-slate-950/80 border border-slate-400/45 text-slate-200">
                              {lang === 'zh' ? '城墙' : 'WALL'}
                            </span>
                          )}
                          {tile.type === 'gate' && !visibleUnit && (
                            <div className="pointer-events-none relative z-10 flex flex-col items-center justify-end h-full pb-2.5">
                              <span
                                className={`text-[7.5px] font-black px-1.5 py-px rounded border shadow ${
                                  gateBreached
                                    ? 'bg-rose-950/90 border-rose-400/70 text-rose-200'
                                    : 'bg-[#2a1510]/90 border-amber-400/75 text-amber-200'
                                }`}
                              >
                                {gateBreached
                                  ? lang === 'zh'
                                    ? '城门已破'
                                    : 'BREACHED'
                                  : `${lang === 'zh' ? '城门' : 'GATE'} ${tile.gateHp}/${tile.gateMaxHp}`}
                              </span>
                            </div>
                          )}
                          {/* Gate hit points (shown cleanly even while a squad holds the gateway) */}
                          {gateIntact && (
                            <div
                              className="pointer-events-none absolute top-0.5 inset-x-1.5 z-20 h-[5px] rounded-sm bg-black/90 border border-amber-400/55 overflow-hidden shadow"
                              title={`${tile.gateHp} / ${tile.gateMaxHp}`}
                            >
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                                style={{
                                  width: `${Math.round(((tile.gateHp ?? 0) / Math.max(1, tile.gateMaxHp ?? 1)) * 100)}%`,
                                }}
                              />
                            </div>
                          )}
                          {tile.type === 'citadel' && !visibleUnit && (
                            <div className="pointer-events-none relative z-10 flex flex-col items-center">
                              <Crown className="w-5 h-5 text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" />
                              <span className="text-[7.5px] font-black px-1 rounded bg-amber-950/90 border border-amber-400/60 text-amber-200">
                                {lang === 'zh' ? '本阵' : 'FLAG'}
                              </span>
                            </div>
                          )}

                          {/* Blazing Fire Remaining Turns Badge (Volumetric Flames rendered by TacticalVfxCanvas!) */}
                          {tile.fireTurns > 0 && (
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-600/45 via-amber-500/20 to-transparent flex items-start justify-end p-0.5">
                              <span className="relative z-20 flex items-center text-[9px] font-black text-amber-200 bg-orange-950/90 border border-amber-400/50 px-1 rounded shadow">
                                <Flame className="w-2.5 h-2.5 text-orange-400" />
                                {tile.fireTurns}
                              </span>
                            </div>
                          )}

                          {/* Live INT Success % Pill on Stratagem-Targetable Tiles! */}
                          {stratOdds !== null && (
                            <div
                              className={`pointer-events-none absolute top-0.5 left-0.5 z-20 px-1 py-px rounded text-[9px] font-mono font-black shadow-md border border-white/30 ${
                                stratOdds >= 75
                                  ? 'bg-emerald-600/95 text-white'
                                  : stratOdds >= 45
                                    ? 'bg-amber-600/95 text-white'
                                    : 'bg-rose-600/95 text-white'
                              }`}
                            >
                              {stratOdds}%
                            </div>
                          )}

                          {/* Squad token: bust on a plinth */}
                          {visibleUnit && (
                            <UnitToken
                              unit={visibleUnit}
                              lang={lang}
                              ally={visibleUnit.side === playerSide}
                              spent={visibleUnit.hasActed && visibleUnit.side === playerSide}
                              motion={
                                impact?.attackerId === visibleUnit.id
                                  ? { kind: 'lunge', dx: impact.dx, dy: impact.dy, key: impact.key }
                                  : impact?.targetIds.includes(visibleUnit.id)
                                    ? { kind: 'hit', dx: impact.dx, dy: impact.dy, key: impact.key }
                                    : null
                              }
                              previewRatio={
                                hoverAttackPreview?.target.id === visibleUnit.id
                                  ? (visibleUnit.troops - hoverAttackPreview.preview.estimatedDamage) /
                                    Math.max(1, visibleUnit.maxTroops)
                                  : hoverAttackPreview && selectedUnit?.id === visibleUnit.id
                                    ? (visibleUnit.troops - hoverAttackPreview.preview.counterDamage) /
                                      Math.max(1, visibleUnit.maxTroops)
                                    : null
                              }
                              previewLoss={
                                hoverAttackPreview?.target.id === visibleUnit.id
                                  ? hoverAttackPreview.preview.estimatedDamage
                                  : hoverAttackPreview && selectedUnit?.id === visibleUnit.id
                                    ? hoverAttackPreview.preview.counterDamage
                                    : null
                              }
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <ThreatLines lines={threatLines} />

                {/* 60fps Live Canvas VFX Layer: Wind Ribbons, Volumetric Downwind Fire, Projectiles & Explosions */}
                <TacticalVfxCanvas
                  grid={battle.grid}
                  wind={battle.wind}
                  vfxEvent={vfxEvent}
                />

                {/* Floating Combat Damage & Art of War Callout Popups */}
                <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
                  {floatingPopups.map((pop) => (
                    <div
                      key={pop.id}
                      style={{
                        left: `${((pop.col + 0.5) / 8) * 100}%`,
                        top: `${((pop.row + 0.35) / 8) * 100}%`,
                      }}
                      className={`absolute whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-black shadow-xl border animate-float-up ${
                        pop.tone === 'fire'
                          ? 'bg-orange-950/95 border-amber-300 text-amber-200'
                          : pop.tone === 'good'
                            ? 'bg-cyan-950/95 border-cyan-300 text-cyan-100'
                            : pop.tone === 'fail'
                              ? 'bg-rose-950/95 border-rose-300 text-rose-200'
                              : 'bg-rose-950/95 border-rose-400 text-white'
                      }`}
                    >
                      {pop.text}
                    </div>
                  ))}
                </div>
              </div>
              </div>

              {/* KOEI-Style Diagonal Hero Portrait Cut-In Slash Overlay! */}
              {skillCutIn && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-40 animate-cutin-slash bg-gradient-to-r from-slate-950/95 via-amber-950/90 to-slate-950/95 border-y-2 border-amber-300/90 py-3 px-6 flex items-center justify-center gap-4 shadow-[0_0_50px_rgba(251,191,36,0.5)]">
                  {skillCutIn.portrait && (
                    <Art thumb
                      src={skillCutIn.portrait}
                      alt={tLoc(skillCutIn.heroName, lang)}
                      className="w-16 h-16 rounded-2xl object-cover object-top border-2 border-amber-300 shadow-2xl"
                    />
                  )}
                  <div className="max-w-md">
                    <div className="text-[11px] font-black uppercase tracking-widest text-amber-300">
                      {tLoc(skillCutIn.skillName, lang)}
                    </div>
                    <div className="font-display text-lg font-black text-white">
                      {tLoc(skillCutIn.heroName, lang)}
                    </div>
                    {skillCutIn.quote && (
                      <p className="text-xs italic text-cyan-100 mt-0.5">
                        {tLoc(skillCutIn.quote, lang)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Verdict: the same seal that closes every battle */}
              {battle.winner && (
                <div className="absolute inset-0 z-30 bg-[#0a0806]/78 flex flex-col items-center justify-center p-6 text-center">
                  <div className="anim-rise flex items-center gap-5">
                    <Seal
                      char={battle.winner === playerSide ? '勝' : '敗'}
                      size={84}
                      stamped
                      color={battle.winner === playerSide ? undefined : '#3a342c'}
                    />
                    <div className="text-left">
                      <div className="brush-heading font-brush text-3xl sm:text-4xl font-bold text-slate-50 leading-none">
                        {battle.winner === playerSide
                          ? lang === 'zh'
                            ? '沙盘决战大捷'
                            : 'The field is yours'
                          : lang === 'zh'
                            ? '阵前受挫'
                            : 'The field is lost'}
                      </div>
                      {battle.victoryReason && (
                        <p className="mt-4 text-sm text-slate-200 max-w-md leading-relaxed">
                          {tLoc(battle.victoryReason, lang)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="anim-rise [animation-delay:160ms] mt-5 flex items-center gap-6 text-xs text-slate-400">
                    <span>
                      {atkShort}{' '}
                      <span className="text-lg font-bold text-slate-50">
                        <CountUp value={atkTotalTroops} from={atkFielded} />
                      </span>
                    </span>
                    <span className="text-amber-300/70">·</span>
                    <span>
                      {defShort}{' '}
                      <span className="text-lg font-bold text-slate-50">
                        <CountUp value={defTotalTroops} from={defFielded} />
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onComplete(extractTacticalBattleOutcome(battle))}
                    className="anim-rise [animation-delay:280ms] mt-5 px-7 py-2.5 rounded-md btn-gold text-sm cursor-pointer"
                  >
                    {lang === 'zh' ? '结算战果与俘虏' : 'Continue to battle report'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: GENERAL COMMAND & ART OF WAR STRATAGEM PANEL */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-2.5">
            {/* Selected General Inspection Card */}
            {selectedUnit ? (
              <div className="rounded-xl p-3 bg-slate-900/90 border border-slate-700/80 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-12 h-12 rounded-xl overflow-hidden border-2 shrink-0 flex items-center justify-center"
                      style={{
                        borderColor: FACTION_RING[selectedUnit.faction].ring,
                        backgroundColor: FACTION_RING[selectedUnit.faction].bg,
                      }}
                    >
                      {selectedUnit.portrait ? (
                        <Art thumb
                          src={selectedUnit.portrait}
                          alt={tLoc(selectedUnit.name, lang)}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <span className="font-seal text-lg text-white font-bold">
                          {FACTION_RING[selectedUnit.faction].badge}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-base text-white">
                          {tLoc(selectedUnit.name, lang)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-200">
                          {tLoc(CLASS_LABEL[selectedUnit.unitClass], lang)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 flex flex-wrap gap-2 mt-0.5 font-mono">
                        <span>
                          WAR <b className="text-rose-300">{selectedUnit.war}</b>
                        </span>
                        <span>
                          INT <b className="text-cyan-300">{selectedUnit.intellect}</b>
                        </span>
                        <span>
                          CMD <b className="text-amber-300">{selectedUnit.command}</b>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono font-bold text-white">
                      {selectedUnit.troops.toLocaleString()} / {selectedUnit.maxTroops.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-amber-300">
                      {lang === 'zh' ? '士气' : 'Morale'} {selectedUnit.morale}%
                    </div>
                  </div>
                </div>

                {/* Primary Direct Commands */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={!isPlayerTurn || selectedUnit.hasMoved}
                    onClick={() => {
                      setCommandMode('move');
                      setActiveStratagem(null);
                      setShowWffmPicker(false);
                    }}
                    className={`px-2 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 ${
                      commandMode === 'move'
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                        : 'bg-slate-800 border-slate-700 text-slate-200'
                    }`}
                  >
                    <Footprints className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '行军移动' : 'Move'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      !isPlayerTurn ||
                      selectedUnit.hasActed ||
                      (attackTargets.length === 0 && gateTargets.length === 0)
                    }
                    onClick={() => {
                      setCommandMode('attack');
                      setActiveStratagem(null);
                      setShowWffmPicker(false);
                    }}
                    className={`px-2 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 ${
                      commandMode === 'attack'
                        ? 'bg-rose-500/25 border-rose-400 text-rose-100'
                        : 'bg-slate-800 border-slate-700 text-slate-200'
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '攻击' : 'Attack'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isPlayerTurn || selectedUnit.hasActed}
                    onClick={() => {
                      const next = executeRallyHold(battle, selectedUnit.id);
                      battleAudio.playWarDrum(0.16);
                      setBattle(next);
                      setCommandMode('move');
                    }}
                    className="px-2 py-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Shield className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{lang === 'zh' ? '鼓舞坚守' : 'Rally'}</span>
                  </button>

                  {selectedHeroObj && (
                    <button
                      type="button"
                      disabled={
                        !isPlayerTurn ||
                        selectedUnit.hasActed ||
                        selectedUnit.skillUsed ||
                        selectedUnit.skillLocked
                      }
                      title={
                        selectedUnit.skillLocked
                          ? lang === 'zh'
                            ? '绝技冷却中或已留作后手，本战不可用'
                            : 'Signature skill is cooling down or held in reserve this battle'
                          : undefined
                      }
                      onClick={() => {
                        setCommandMode('hero_skill');
                        setActiveStratagem(null);
                        setShowWffmPicker(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 ${
                        commandMode === 'hero_skill'
                          ? 'bg-fuchsia-500/30 border-fuchsia-300 text-white'
                          : 'bg-fuchsia-950/45 border-fuchsia-500/45 text-fuchsia-200'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="truncate">
                        {selectedUnit.skillLocked
                          ? lang === 'zh'
                            ? '绝技冷却中'
                            : 'Skill cooling down'
                          : tLoc(selectedHeroObj.signatureSkill.name, lang)}
                      </span>
                    </button>
                  )}

                  {battle.gunpowderBombsLeft[playerSide] > 0 && (
                    <button
                      type="button"
                      disabled={!isPlayerTurn || selectedUnit.hasActed}
                      onClick={() => {
                        setCommandMode('gunpowder_bomb');
                        setActiveStratagem(null);
                        setShowWffmPicker(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 ${
                        commandMode === 'gunpowder_bomb'
                          ? 'bg-amber-500/30 border-amber-300 text-white'
                          : 'bg-orange-950/50 border-orange-500/50 text-orange-200'
                      }`}
                    >
                      <Bomb className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'zh' ? '震天雷' : 'Bomb'} ({battle.gunpowderBombsLeft[playerSide]})
                      </span>
                    </button>
                  )}

                  {adjacentDuelTarget && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveGridDuel({ atkUnit: selectedUnit, defUnit: adjacentDuelTarget })
                      }
                      className="px-2 py-1.5 rounded-lg border bg-amber-500/20 hover:bg-amber-500/30 border-amber-400 text-amber-200 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer animate-pulse"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>{lang === 'zh' ? '阵前单挑！' : 'Hero Duel!'}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {/* SUN TZU'S ART OF WAR STRATAGEM DOCK (Intellect-Driven!) */}
            <div className="rounded-xl p-3 bg-slate-900/90 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="font-display font-bold text-amber-200 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <span>
                    {lang === 'zh'
                      ? '《孙子兵法》战法（成功率由将领智力决定）'
                      : 'The Art of War Tactics (INT-Driven Success %)'}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-cyan-300 font-bold">
                  {battle.sp[playerSide]} SP
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {STRATAGEM_ORDER.map((sid) => {
                  const def = ART_OF_WAR_STRATAGEMS[sid];
                  const affordable = battle.sp[playerSide] >= def.spCost;
                  const canCastDeath =
                    sid !== 'death_ground' ||
                    (selectedUnit ? canUseDeathGround(battle, selectedUnit) : false);
                  const disabled =
                    !isPlayerTurn ||
                    !selectedUnit ||
                    selectedUnit.hasActed ||
                    selectedUnit.disorderedTurns > 0 ||
                    !affordable ||
                    !canCastDeath;

                  const selfOdds =
                    selectedUnit && (sid === 'wffm' || sid === 'death_ground' || sid === 'empty_fort_ambush')
                      ? calculateStratagemSuccess(
                          battle,
                          selectedUnit,
                          sid,
                          selectedUnit.row,
                          selectedUnit.col
                        ).chance
                      : null;

                  const isActive = commandMode === 'stratagem' && activeStratagem === sid;

                  return (
                    <button
                      key={sid}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectStratagem(sid)}
                      title={tLoc(def.desc, lang)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition cursor-pointer disabled:opacity-40 ${
                        isActive
                          ? 'bg-orange-500/25 border-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.35)]'
                          : 'bg-slate-950/75 hover:bg-slate-800/90 border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-white truncate">
                          {tLoc(def.name, lang)}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-cyan-300 shrink-0">
                          {def.spCost}SP
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                        <span className="truncate">{tLoc(def.chapter, lang)}</span>
                        {selfOdds !== null ? (
                          <span
                            className={`font-mono font-bold shrink-0 ${
                              selfOdds >= 75
                                ? 'text-emerald-300'
                                : selfOdds >= 45
                                  ? 'text-amber-300'
                                  : 'text-rose-300'
                            }`}
                          >
                            {selfOdds}%
                          </span>
                        ) : (
                          <span className="text-amber-300/90 font-mono shrink-0">INT%</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Wind · Forest · Fire · Mountain 4-Stance Sub-Picker */}
              {showWffmPicker && selectedUnit && (
                <div className="p-2 rounded-lg bg-slate-950 border border-cyan-500/45 grid grid-cols-2 gap-1.5">
                  {(['wind', 'forest', 'fire', 'mountain'] as WffmStance[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleCastWffm(st)}
                      className="px-2 py-1.5 rounded bg-slate-900 hover:bg-cyan-500/20 border border-slate-700 hover:border-cyan-400 text-left cursor-pointer"
                    >
                      <div className="text-[11px] font-bold text-cyan-200">
                        {tLoc(WFFM_STANCES[st].name, lang)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {tLoc(WFFM_STANCES[st].desc, lang)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* LIVE HOVER INTEL & FORECAST (Damage + Art of War Principles OR INT Odds!) */}
            <div className="rounded-xl p-3 bg-slate-900/90 border border-slate-700/80 min-h-[108px] text-xs space-y-1.5">
              {hoverStratagemPreview ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-200">
                      {tLoc(ART_OF_WAR_STRATAGEMS[hoverStratagemPreview.stratagemId].name, lang)}
                    </span>
                    <span
                      className={`font-mono font-black text-sm px-2 py-0.5 rounded-full ${
                        hoverStratagemPreview.chance >= 75
                          ? 'bg-emerald-500/25 text-emerald-300'
                          : hoverStratagemPreview.chance >= 45
                            ? 'bg-amber-500/25 text-amber-300'
                            : 'bg-rose-500/25 text-rose-300'
                      }`}
                    >
                      {hoverStratagemPreview.chance}% {lang === 'zh' ? '成功率' : 'Success'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {hoverStratagemPreview.factors.map((f) => (
                      <span
                        key={f.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          f.positive
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                        }`}
                      >
                        {tLoc(f.label, lang)} {f.value}
                      </span>
                    ))}
                  </div>
                </>
              ) : hoverAttackPreview ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-200">
                      {lang === 'zh' ? '预计打击' : 'Strike Forecast'} →{' '}
                      {tLoc(hoverAttackPreview.target.name, lang)}
                    </span>
                    <span className="font-mono font-extrabold text-rose-300">
                      -{hoverAttackPreview.preview.estimatedDamage.toLocaleString()}{' '}
                      {lang === 'zh' ? '兵力' : 'troops'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {lang === 'zh' ? '敌方反击' : 'Counter'}:{' '}
                    <span className="font-mono text-amber-300">
                      -{hoverAttackPreview.preview.counterDamage.toLocaleString()}
                    </span>{' '}
                    · {lang === 'zh' ? '敌士气' : 'Enemy Morale'}:{' '}
                    <span className="font-mono text-cyan-300">
                      -{hoverAttackPreview.preview.moraleDrop}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {hoverAttackPreview.preview.principles.map((p) => (
                      <span
                        key={p.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          p.positive
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                        }`}
                      >
                        {tLoc(p.label, lang)} {p.value}
                      </span>
                    ))}
                  </div>
                </>
              ) : hoverGatePreview ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-200">
                      {lang === 'zh' ? '冲撞城门' : 'Batter the Gate'}
                    </span>
                    <span className="font-mono font-extrabold text-amber-300">
                      -{hoverGatePreview.gateDamage.toLocaleString()}{' '}
                      {hoverGatePreview.breaches
                        ? lang === 'zh'
                          ? '· 城门告破！'
                          : '· BREACH!'
                        : `(${hoverGatePreview.gateHpLeft.toLocaleString()} ${lang === 'zh' ? '剩余' : 'left'})`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {lang === 'zh'
                      ? '城门一破，攻军方可入城并夺取本阵大旗。'
                      : 'Once a gate falls, attackers can enter the city and seize the Citadel Flag.'}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {hoverGatePreview.principles.map((p) => (
                      <span
                        key={p.id}
                        className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                      >
                        {tLoc(p.label, lang)} {p.value}
                      </span>
                    ))}
                  </div>
                </>
              ) : hoveredTile ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-200">
                      {tLoc(TILE_INFO[hoveredTile.type].name, lang)} ({hoveredTile.row + 1},{' '}
                      {hoveredTile.col + 1})
                    </span>
                    {hoveredTile.fireTurns > 0 && (
                      <span className="text-[10px] font-bold text-orange-300 flex items-center gap-1">
                        <Flame className="w-3 h-3" />
                        {lang === 'zh'
                          ? `烈火燃烧 (${hoveredTile.fireTurns}合)`
                          : `Blazing Fire (${hoveredTile.fireTurns}R)`}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {tLoc(TILE_INFO[hoveredTile.type].hint, lang)}
                  </p>
                  {(hoveredTile.type === 'wall' ||
                    hoveredTile.type === 'gate' ||
                    hoveredTile.type === 'citadel') && (
                    <p className="text-[11px] font-mono text-amber-200">
                      {lang === 'zh' ? `城防 Lv.${battle.cityDefense}` : `Walls Lv.${battle.cityDefense}`}
                      {hoveredTile.type === 'gate' && !isIntactGate(hoveredTile)
                        ? lang === 'zh'
                          ? ' · 城门已破，无防御加成'
                          : ' · gate breached, no DEF bonus'
                        : ` · +${Math.round(getRampartDefBonus(battle) * 100)}% DEF`}
                      {isIntactGate(hoveredTile) &&
                        ` · ${lang === 'zh' ? '城门' : 'Gate'} ${(hoveredTile.gateHp ?? 0).toLocaleString()} / ${(hoveredTile.gateMaxHp ?? 0).toLocaleString()}`}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-200">
                    {lang === 'zh' ? '战术提示：' : 'Tactical Tip:'}
                  </div>
                  <p>
                    {lang === 'zh'
                      ? '点击我方将领移动（青色格）或攻击（红色格，含可冲撞的城门），悬停敌军/密林/城门查看《孙子兵法》加成与智力成功率！城门未破，夺旗无效。随时可交由 AI 托管。'
                      : 'Click your generals to move (cyan) or strike (crimson — including a gate you can batter). Hover targets, forests and gates for Art of War bonuses & INT odds. The flag only counts once a gate is down. Toggle AI Auto-Finish anytime.'}
                  </p>
                </div>
              )}
            </div>

            {/* Compact Tactical Chronicle */}
            <div className="rounded-xl p-2.5 bg-slate-950/80 border border-slate-800 space-y-1 max-h-[125px] overflow-y-auto">
              {battle.logs.slice(0, 6).map((entry) => (
                <div key={entry.id} className="text-[11px] text-slate-300 leading-snug">
                  <span className="text-[10px] font-mono text-cyan-400 mr-1.5">R{entry.round}</span>
                  <span>{tLoc(entry.text, lang)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Optional On-Grid Adjacent Hero Duel Modal */}
      {activeGridDuel &&
        activeGridDuel.atkUnit.heroId &&
        activeGridDuel.defUnit.heroId &&
        battle.preBattleHeroes[activeGridDuel.atkUnit.heroId] &&
        battle.preBattleHeroes[activeGridDuel.defUnit.heroId] && (
          <DuelModal
            state={gameState}
            lang={lang}
            attacker={battle.preBattleHeroes[activeGridDuel.atkUnit.heroId]}
            defender={battle.preBattleHeroes[activeGridDuel.defUnit.heroId]}
            terrain={gameState.cities[battle.config.toCityId]?.terrain || 'plains'}
            onComplete={(duelResult) => {
              const next = applyGridDuelResult(
                battle,
                activeGridDuel.atkUnit.id,
                activeGridDuel.defUnit.id,
                duelResult
              );
              setBattle(next);
              setActiveGridDuel(null);
            }}
          />
        )}
    </div>
  );
}
