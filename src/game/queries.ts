import { HERO_BONDS } from './heroes.js';
import type {
  FactionId,
  GameState,
  General,
  HeroBond,
  TechId,
  TimelineStage,
} from './types.js';

/**
 * Pure read-only GameState queries shared by the strategic engine and the 8x8 tactical engine.
 * They live here (rather than in engine.ts) so the strategic engine can resolve battles on the
 * grid without the two engines importing each other.
 */

export function getTimelineStage(divergence: number): TimelineStage {
  if (divergence < 30) return 'sharp';
  if (divergence < 60) return 'distorted';
  return 'shattered';
}

export function getChronoInsightBonus(state: GameState): number {
  const stage = getTimelineStage(state.chrono.divergence);
  if (stage === 'sharp') return 0.18;
  if (stage === 'distorted') return 0.09;
  return state.chrono.unlockedTechs.includes('spyglass') ? 0.12 : 0;
}

export function factionHasTech(
  state: GameState,
  faction: FactionId,
  techId: TechId
): boolean {
  if (faction === 'neutral') return false;
  if (faction === state.playerFaction) {
    return state.chrono.unlockedTechs.includes(techId);
  }
  return state.chrono.rivalTechs[faction]?.includes(techId) ?? false;
}

export function getCityGenerals(state: GameState, cityId: string): General[] {
  const city = state.cities[cityId];
  if (!city) return [];
  return Object.values(state.generals).filter(
    (g) => g.cityId === cityId && g.faction === city.owner && g.status === 'active'
  );
}

export function getActiveBondsForHeroes(heroIds: string[]): HeroBond[] {
  const set = new Set(heroIds);
  return Object.values(HERO_BONDS).filter((bond) => {
    const count = bond.memberIds.filter((id) => set.has(id)).length;
    return count >= 2;
  });
}
