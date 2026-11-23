import { useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  Bomb,
  Bot,
  Compass,
  Crosshair,
  Crown,
  Flame,
  Footprints,
  Mountain,
  Shield,
  Sparkles,
  Swords,
  Trees,
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
  executeGunpowderBomb,
  executeHeroSignatureSkill,
  executeRallyHold,
  executeSingleAITurnStep,
  executeTacticalAttack,
  extractTacticalBattleOutcome,
  getAttackTargets,
  getReachableTiles,
  getStratagemTargetCoords,
  manhattan,
  moveTacticalUnit,
  previewAttack,
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

interface TacticalBattleModalProps {
  gameState: GameState;
  config: TacticalBattleConfig;
  lang: Language;
  /** Optional pre-ignited demo setup for visual inspection */
  demoPreset?: boolean;
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
      en: 'Defender +30% DEF · Blocks attackers (breach with Black Powder!)',
      zh: '守军防+30% · 阻挡攻军（可用黑火药轰塌！）',
    },
  },
  gate: {
    name: { en: 'City Gate', zh: '城门要冲' },
    hint: {
      en: 'Defender +30% DEF · Enables Empty Fort Ruse (空城计)!',
      zh: '守军防+30% · 在此可发动【空城计】震慑敌军！',
    },
  },
  citadel: {
    name: { en: 'Citadel Command Flag', zh: '城池本阵大旗' },
    hint: {
      en: 'Objective! Attackers win immediately upon occupying this tile.',
      zh: '决胜要地！攻方占领此格即刻攻克城池！',
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
  onComplete,
}: TacticalBattleModalProps) {
  const [battle, setBattle] = useState<TacticalBattleState>(() =>
    createInitialTacticalState(gameState, config, demoPreset)
  );
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(() => {
    const first = battle.units.find((u) => !u.defeated && u.side === config.playerSide);
    return first?.id ?? null;
  });
  const [commandMode, setCommandMode] = useState<TacticalCommandMode>('move');
  const [activeStratagem, setActiveStratagem] = useState<ArtOfWarStratagemId | null>(null);
  const [showWffmPicker, setShowWffmPicker] = useState(false);
  const [hoveredCoord, setHoveredCoord] = useState<GridCoord | null>(null);
  const [aiAutoPlay, setAiAutoPlay] = useState(false);
  const [muted, setMuted] = useState(battleAudio.muted);
  const [activeGridDuel, setActiveGridDuel] = useState<{
    atkUnit: TacticalUnit;
    defUnit: TacticalUnit;
  } | null>(null);

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

    const delay = aiAutoPlay ? 180 : 420;
    const timer = window.setTimeout(() => {
      setBattle((prev) => {
        if (prev.winner) return prev;
        const beforeCalloutId = prev.lastCallout?.id;
        const { state: next } = executeSingleAITurnStep(prev);
        if (next.lastCallout && next.lastCallout.id !== beforeCalloutId) {
          if (next.lastCallout.kind === 'fire' || next.lastCallout.kind === 'tech') {
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
        return next;
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [battle, aiAutoPlay, playerSide, activeGridDuel]);

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
    if (!isPlayerTurn || !selectedUnit || commandMode !== 'hero_skill' || selectedUnit.skillUsed) {
      return [];
    }
    const hero = selectedUnit.heroId ? battle.preBattleHeroes[selectedUnit.heroId] : undefined;
    if (!hero) return [];
    const eff = hero.signatureSkill.effect;
    if (
      eff === 'casualty_shield' ||
      eff === 'mandate_rally' ||
      eff === 'morale_shatter' ||
      eff === 'charisma_charm'
    ) {
      return [{ row: selectedUnit.row, col: selectedUnit.col }];
    }
    const maxR = eff === 'fire_ignore_def' || eff === 'river_pierce' ? 3 : 2;
    const coords: GridCoord[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (manhattan(selectedUnit.row, selectedUnit.col, r, c) <= maxR) {
          const occ = battle.units.find((u) => !u.defeated && u.row === r && u.col === c);
          if ((occ && occ.side !== selectedUnit.side) || eff === 'fire_ignore_def') {
            coords.push({ row: r, col: c });
          }
        }
      }
    }
    return coords;
  }, [battle, commandMode, isPlayerTurn, selectedUnit]);

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
        if (next.lastCallout?.kind === 'fire') battleAudio.playExplosion(0.24);
        else if (next.lastCallout?.kind === 'seen_through') battleAudio.playWarDrum(0.18);
        else battleAudio.playSkillSurge(0.2);
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
        battleAudio.playExplosion(0.32);
        if (next.winner) battleAudio.playOutcomeHorn(next.winner === playerSide, 0.22);
        setBattle(next);
        setCommandMode('move');
      }
      return;
    }

    // 5. Direct Attack on an enemy in range (works directly in both 'move' and 'attack' modes!)
    if (occupant && occupant.side !== playerSide && attackTargets.some((t) => t.id === occupant.id)) {
      const next = executeTacticalAttack(battle, selectedUnit.id, occupant.id);
      battleAudio.playSteelClash(0.18);
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
      <div className="ink-panel gold-border-glow rounded-2xl max-w-[1260px] w-full overflow-hidden shadow-[0_24px_80px_rgba(2,6,23,0.95)] flex flex-col max-h-[96vh]">
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
                    ? `第 ${battle.round}/${battle.maxRounds} 合`
                    : `Round ${battle.round}/${battle.maxRounds}`}
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
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
            </button>

            <button
              type="button"
              disabled={Boolean(battle.winner)}
              onClick={() => setAiAutoPlay((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 ${
                aiAutoPlay
                  ? 'bg-indigo-600 border-indigo-300 text-white shadow-[0_0_16px_rgba(99,102,241,0.5)]'
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

            <button
              type="button"
              disabled={!isPlayerTurn}
              onClick={handleEndPlayerTurn}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold shadow cursor-pointer disabled:opacity-40"
            >
              {lang === 'zh' ? '结束本回合' : 'End Turn'}
            </button>
          </div>
        </div>

        {/* MAIN BODY: 8x8 GRID + ART OF WAR COMMAND DRAWER */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 bg-slate-950/70">
          {/* LEFT: 8x8 TACTICAL BATTLEFIELD */}
          <div className="lg:col-span-7 flex flex-col gap-2">
            {/* Sun Tzu Quote / Seen-Through / Skill Callout Banner */}
            {battle.lastCallout && (
              <div
                className={`rounded-xl px-3.5 py-2 border flex items-start justify-between gap-3 text-xs ${
                  battle.lastCallout.kind === 'seen_through'
                    ? 'bg-rose-950/75 border-rose-400/60 text-rose-100'
                    : battle.lastCallout.kind === 'fire' || battle.lastCallout.kind === 'tech'
                      ? 'bg-orange-950/75 border-orange-400/60 text-orange-100'
                      : 'bg-cyan-950/75 border-cyan-400/55 text-cyan-100'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-display font-extrabold tracking-wide flex items-center gap-1.5">
                    {battle.lastCallout.kind === 'fire' ? (
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>{tLoc(battle.lastCallout.title, lang)}</span>
                    {battle.lastCallout.quote && (
                      <span className="text-[11px] font-normal italic text-amber-200/90 hidden sm:inline">
                        — {tLoc(battle.lastCallout.quote, lang)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-200">
                    {tLoc(battle.lastCallout.subtitle, lang)}
                  </div>
                </div>
              </div>
            )}

            {/* 8x8 Interactive Grid Container */}
            <div className="relative rounded-2xl p-2 bg-slate-900/90 border border-cyan-500/30 shadow-inner">
              <div className="grid grid-cols-8 grid-rows-8 gap-1 aspect-square w-full max-w-[580px] mx-auto">
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
                    const isAttackable = Boolean(
                      visibleUnit && attackTargets.some((t) => t.id === visibleUnit.id)
                    );
                    const isStratTarget = stratagemCoords.some((p) => p.row === r && p.col === c);
                    const isSkillTarget = skillTargetCoords.some((p) => p.row === r && p.col === c);
                    const isBombTarget = bombCoords.some((p) => p.row === r && p.col === c);

                    // Compute live INT success chance badge when Stratagem targeting is active!
                    const stratOdds =
                      isStratTarget && selectedUnit && activeStratagem
                        ? calculateStratagemSuccess(battle, selectedUnit, activeStratagem, r, c)
                            .chance
                        : null;

                    const tileBg: Record<TacticalTileType, string> = {
                      plains: 'bg-gradient-to-br from-[#1d3a2f] to-[#152b24]',
                      forest: 'bg-gradient-to-br from-[#144029] to-[#0c291b]',
                      water: 'bg-gradient-to-br from-[#0c4a6e] to-[#082f49]',
                      bridge: 'bg-gradient-to-br from-[#78350f] to-[#451a03]',
                      ford: 'bg-gradient-to-br from-[#155e75] to-[#164e63]',
                      hill: 'bg-gradient-to-br from-[#57534e] to-[#3f3c37]',
                      wall: 'bg-gradient-to-br from-[#475569] to-[#1e293b]',
                      gate: 'bg-gradient-to-br from-[#64748b] to-[#334155]',
                      citadel: 'bg-gradient-to-br from-[#713f12] to-[#422006]',
                    };

                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        onClick={() => handleTileClick(r, c)}
                        onMouseEnter={() => setHoveredCoord({ row: r, col: c })}
                        onMouseLeave={() => setHoveredCoord(null)}
                        className={`relative min-w-0 min-h-0 rounded-lg overflow-hidden border transition-all flex items-center justify-center cursor-pointer ${
                          tileBg[tile.type]
                        } ${
                          isSelectedTile
                            ? 'ring-2 ring-cyan-300 border-cyan-200 z-10 shadow-[0_0_18px_rgba(56,189,248,0.55)]'
                            : isStratTarget
                              ? 'ring-2 ring-orange-400 border-amber-300 shadow-[0_0_14px_rgba(251,146,60,0.45)]'
                              : isBombTarget
                                ? 'ring-2 ring-amber-400 border-yellow-300'
                                : isSkillTarget
                                  ? 'ring-2 ring-fuchsia-400 border-fuchsia-300'
                                  : isAttackable
                                    ? 'ring-2 ring-rose-500 border-rose-300 shadow-[0_0_14px_rgba(244,63,94,0.45)]'
                                    : isReachable
                                      ? 'border-cyan-400/80 ring-1 ring-cyan-400/50 bg-cyan-500/10'
                                      : 'border-slate-700/60 hover:border-slate-400/70'
                        }`}
                      >
                        {/* Terrain Backdrop Visuals */}
                        {tile.type === 'forest' && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-50">
                            <Trees className="w-7 h-7 text-emerald-400" />
                          </div>
                        )}
                        {tile.type === 'water' && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-45">
                            <Waves className="w-6 h-6 text-sky-300" />
                          </div>
                        )}
                        {tile.type === 'ford' && (
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-60">
                            <Waves className="w-4 h-4 text-cyan-200" />
                            <span className="text-[8px] font-bold text-cyan-100">
                              {lang === 'zh' ? '浅滩' : 'FORD'}
                            </span>
                          </div>
                        )}
                        {tile.type === 'bridge' && (
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-70">
                            <div className="w-full h-1.5 bg-amber-700/80 mb-1" />
                            <div className="w-full h-1.5 bg-amber-700/80 mb-1" />
                            <div className="w-full h-1.5 bg-amber-700/80" />
                          </div>
                        )}
                        {tile.type === 'hill' && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-50">
                            <Mountain className="w-6 h-6 text-amber-200" />
                          </div>
                        )}
                        {tile.type === 'wall' && (
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between py-1 opacity-75">
                            <div className="flex gap-1">
                              <span className="w-2.5 h-1.5 bg-slate-300 rounded-xs" />
                              <span className="w-2.5 h-1.5 bg-slate-300 rounded-xs" />
                              <span className="w-2.5 h-1.5 bg-slate-300 rounded-xs" />
                            </div>
                            <span className="text-[8px] font-bold text-slate-300">
                              {lang === 'zh' ? '城墙' : 'WALL'}
                            </span>
                          </div>
                        )}
                        {tile.type === 'gate' && (
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-75">
                            <div className="w-5 h-6 rounded-t-full bg-slate-950/85 border border-amber-400/60" />
                            <span className="text-[7px] font-bold text-amber-200 mt-0.5">
                              {lang === 'zh' ? '城门' : 'GATE'}
                            </span>
                          </div>
                        )}
                        {tile.type === 'citadel' && (
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <Crown className="w-6 h-6 text-amber-300 drop-shadow" />
                            <span className="text-[7px] font-extrabold text-amber-200">
                              {lang === 'zh' ? '本阵' : 'FLAG'}
                            </span>
                          </div>
                        )}

                        {/* Blazing Fire Overlay! */}
                        {tile.fireTurns > 0 && (
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-600/65 via-amber-500/35 to-transparent flex items-start justify-end p-0.5 animate-pulse">
                            <span className="flex items-center text-[9px] font-black text-amber-200 bg-orange-950/80 px-1 rounded">
                              <Flame className="w-2.5 h-2.5 text-orange-400" />
                              {tile.fireTurns}
                            </span>
                          </div>
                        )}

                        {/* Reachable Move Indicator Dot */}
                        {isReachable && !visibleUnit && (
                          <div className="pointer-events-none w-2.5 h-2.5 rounded-full bg-cyan-300/80 shadow-[0_0_8px_#38bdf8]" />
                        )}

                        {/* Live INT Success % Pill on Stratagem-Targetable Tiles! */}
                        {stratOdds !== null && (
                          <div
                            className={`pointer-events-none absolute top-0.5 left-0.5 z-20 px-1 py-0.2 rounded text-[9px] font-mono font-black shadow ${
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

                        {/* Tactical Unit Token */}
                        {visibleUnit && (
                          <div
                            className={`relative z-10 w-full h-full flex flex-col items-center justify-center p-0.5 ${
                              visibleUnit.hasActed && visibleUnit.side === playerSide
                                ? 'opacity-65'
                                : ''
                            }`}
                          >
                            <div
                              className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 shadow-lg flex items-center justify-center shrink-0"
                              style={{
                                borderColor: FACTION_RING[visibleUnit.faction].ring,
                                backgroundColor: FACTION_RING[visibleUnit.faction].bg,
                              }}
                            >
                              {visibleUnit.portrait ? (
                                <img
                                  src={visibleUnit.portrait}
                                  alt={tLoc(visibleUnit.name, lang)}
                                  className="w-full h-full object-cover object-top"
                                />
                              ) : (
                                <span className="font-seal font-bold text-white text-sm">
                                  {FACTION_RING[visibleUnit.faction].badge}
                                </span>
                              )}

                              {/* Unit Class Mini-Badge */}
                              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-950/95 border border-slate-500 flex items-center justify-center text-[8px] text-cyan-200">
                                {visibleUnit.unitClass === 'naval' ? (
                                  <Anchor className="w-2.5 h-2.5" />
                                ) : visibleUnit.unitClass === 'archer' ? (
                                  <Crosshair className="w-2.5 h-2.5" />
                                ) : visibleUnit.unitClass === 'cavalry' ? (
                                  <Wind className="w-2.5 h-2.5" />
                                ) : (
                                  <Shield className="w-2.5 h-2.5" />
                                )}
                              </span>
                            </div>

                            {/* Name & Compact HP + Morale Bars */}
                            <div className="w-full px-0.5 mt-0.5 space-y-0.5">
                              <div className="h-1.5 w-full bg-slate-950/90 rounded-full overflow-hidden border border-slate-700/80">
                                <div
                                  className={`h-full ${
                                    visibleUnit.side === playerSide
                                      ? 'bg-emerald-400'
                                      : 'bg-rose-400'
                                  }`}
                                  style={{
                                    width: `${Math.max(
                                      6,
                                      Math.round((visibleUnit.troops / visibleUnit.maxTroops) * 100)
                                    )}%`,
                                  }}
                                />
                              </div>
                              <div className="text-[8.5px] leading-none font-bold text-white text-center truncate drop-shadow">
                                {tLoc(visibleUnit.name, lang)}
                              </div>
                            </div>

                            {/* Status Effect Badges */}
                            {(visibleUnit.isHiddenAmbush ||
                              visibleUnit.disorderedTurns > 0 ||
                              visibleUnit.deathGroundTurns > 0 ||
                              visibleUnit.wffmStance) && (
                              <div className="absolute top-0.5 right-0.5 flex gap-0.5 text-[9px] bg-slate-950/85 px-1 rounded">
                                {visibleUnit.isHiddenAmbush && <span title="Ambush">🌲</span>}
                                {visibleUnit.disorderedTurns > 0 && <span title="Disordered">💫</span>}
                                {visibleUnit.deathGroundTurns > 0 && <span title="Death Ground">🩸</span>}
                                {visibleUnit.wffmStance === 'wind' && <span title="Wind">🌪️</span>}
                                {visibleUnit.wffmStance === 'fire' && <span title="Fire">🔥</span>}
                                {visibleUnit.wffmStance === 'mountain' && <span title="Mountain">⛰️</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Victory / Defeat Overlay */}
              {battle.winner && (
                <div className="absolute inset-0 z-30 rounded-2xl bg-slate-950/78 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div
                    className={`px-6 py-2.5 rounded-2xl border-2 font-display text-2xl sm:text-3xl font-black flex items-center gap-2.5 shadow-2xl ${
                      battle.winner === playerSide
                        ? 'bg-emerald-950/90 border-emerald-400 text-emerald-200'
                        : 'bg-rose-950/90 border-rose-400 text-rose-200'
                    }`}
                  >
                    {battle.winner === playerSide ? (
                      <Crown className="w-7 h-7 text-amber-300" />
                    ) : (
                      <Shield className="w-7 h-7 text-rose-400" />
                    )}
                    <span>
                      {battle.winner === playerSide
                        ? lang === 'zh'
                          ? '沙盘决战大捷！'
                          : 'TACTICAL VICTORY!'
                        : lang === 'zh'
                          ? '阵前受挫'
                          : 'TACTICAL DEFEAT'}
                    </span>
                  </div>
                  {battle.victoryReason && (
                    <p className="text-sm text-slate-100 max-w-md bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5">
                      {tLoc(battle.victoryReason, lang)}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => onComplete(extractTacticalBattleOutcome(battle))}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg cursor-pointer"
                  >
                    {lang === 'zh' ? '结算战果与俘虏' : 'Continue to Battle Report'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: GENERAL COMMAND & ART OF WAR STRATAGEM PANEL */}
          <div className="lg:col-span-5 flex flex-col gap-2.5">
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
                        <img
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
                    disabled={!isPlayerTurn || selectedUnit.hasActed || attackTargets.length === 0}
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
                      disabled={!isPlayerTurn || selectedUnit.hasActed || selectedUnit.skillUsed}
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
                      <span className="truncate">{tLoc(selectedHeroObj.signatureSkill.name, lang)}</span>
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
                </>
              ) : (
                <div className="text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-200">
                    {lang === 'zh' ? '战术提示：' : 'Tactical Tip:'}
                  </div>
                  <p>
                    {lang === 'zh'
                      ? '点击我方将领移动（青色格）或攻击（红色格），悬停敌军/密林查看《孙子兵法》地形加成与智力成功率！随时可点击右上角交由 AI 托管。'
                      : 'Click your generals to move (cyan) or strike (crimson). Hover targets to inspect Art of War terrain bonuses & General INT stratagem odds, or toggle AI Auto-Finish anytime.'}
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
