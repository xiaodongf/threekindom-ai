import { describe, expect, it } from 'vitest';
import {
  buildExchangePlan,
  classifyDuelMatchup,
  FINALE_DURATION,
  INTRO_DURATION,
  sampleExchangeFrame,
  sampleFinaleFrame,
  sampleIdleFrame,
  sampleIntroFrame,
} from '../components/duel/duelChoreography.js';
import type { DuelExchangeEvent } from '../components/duel/duelTypes.js';
import { resolveDuelRound } from './engine.js';
import {
  getHeroDuelProfile,
  HERO_DUEL_PROFILES,
  HORSE_COAT_PALETTES,
} from './heroDuelProfiles.js';
import { createInitialHeroes } from './heroes.js';

describe('3D Cavalry Duel Roster & Choreography', () => {
  const heroes = createInitialHeroes();

  it('provides an explicit mounted Three Kingdoms visual profile for every hero', () => {
    const heroIds = Object.keys(heroes);
    expect(heroIds.length).toBeGreaterThanOrEqual(55);

    for (const id of heroIds) {
      expect(HERO_DUEL_PROFILES[id], `Missing duel profile for ${id}`).toBeDefined();
      const profile = getHeroDuelProfile(heroes[id]);
      expect(HORSE_COAT_PALETTES[profile.horseCoat]).toBeDefined();
      expect(profile.horseName.en.length).toBeGreaterThan(0);
      expect(profile.horseName.zh.length).toBeGreaterThan(0);
    }

    // Iconic historical pairings
    expect(HERO_DUEL_PROFILES.guanyu.horseCoat).toBe('red_hare');
    expect(HERO_DUEL_PROFILES.guanyu.weaponClass).toBe('guandao');
    expect(HERO_DUEL_PROFILES.guanyu.hasLongBeard).toBe(true);
    expect(HERO_DUEL_PROFILES.lubu.horseCoat).toBe('red_hare');
    expect(HERO_DUEL_PROFILES.lubu.weaponClass).toBe('halberd');
    expect(HERO_DUEL_PROFILES.lubu.hasTwinPlumes).toBe(true);
    expect(HERO_DUEL_PROFILES.zhaoyun.horseCoat).toBe('white_dragon');
    expect(HERO_DUEL_PROFILES.zhugeliang.weaponClass).toBe('fan');
  });

  it('classifies all stance matchups and builds valid choreography plans', () => {
    const guanYu = heroes.guanyu;
    const luBu = heroes.lubu;
    const atkProf = getHeroDuelProfile(guanYu);
    const defProf = getHeroDuelProfile(luBu);

    const cases = [
      { p: 'strike' as const, e: 'guard' as const, expected: 'guard_break' },
      { p: 'feint' as const, e: 'strike' as const, expected: 'riposte' },
      { p: 'guard' as const, e: 'feint' as const, expected: 'parry_punish' },
      { p: 'strike' as const, e: 'strike' as const, expected: 'mirror_clash' },
      { p: 'skill' as const, e: 'guard' as const, expected: 'skill_burst' },
      { p: 'chrono_counter' as const, e: 'strike' as const, expected: 'chrono_counter' },
    ];

    for (const c of cases) {
      const log = resolveDuelRound(guanYu, luBu, 1, c.p, c.e, 0.25);
      const matchup = classifyDuelMatchup(log);
      expect(matchup).toBe(c.expected);

      const ev: DuelExchangeEvent = {
        id: 1,
        round: 1,
        log,
        matchup,
        isFinalRound: false,
        atkHpAfter: Math.max(0, 100 - log.enemyDamage),
        defHpAfter: Math.max(0, 100 - log.playerDamage),
      };
      const plan = buildExchangePlan(ev, atkProf, defProf);
      expect(plan.duration).toBeGreaterThan(2.0);
      expect(plan.bursts.length).toBeGreaterThanOrEqual(1);
      expect(plan.hpApplyTime).toBeLessThan(plan.duration);

      // Sample across entire duration and verify finite coordinates
      for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        const frame = sampleExchangeFrame(
          plan.duration * frac,
          plan,
          100,
          100,
          atkProf,
          defProf
        );
        expect(Number.isFinite(frame.left.x)).toBe(true);
        expect(Number.isFinite(frame.right.x)).toBe(true);
        expect(Number.isFinite(frame.camera.posZ)).toBe(true);
      }
    }
  });

  it('produces smooth intro, idle, and slow-motion KO finale frames', () => {
    const atkProf = getHeroDuelProfile(heroes.zhaoyun);
    const defProf = getHeroDuelProfile(heroes.xiahoudun);

    const introStart = sampleIntroFrame(0, atkProf, defProf);
    const introRear = sampleIntroFrame(INTRO_DURATION * 0.72, atkProf, defProf);
    expect(introStart.left.gait).toBe('gallop');
    expect(introRear.left.gait).toBe('rear');
    expect(introRear.left.rearAngle).toBeGreaterThan(0.2);

    const idle = sampleIdleFrame(1.2, 30, 80, atkProf, defProf);
    expect(idle.left.fatigue).toBeGreaterThan(0);
    expect(idle.right.fatigue).toBe(0);

    const finaleEnd = sampleFinaleFrame(FINALE_DURATION * 0.8, 'attacker', atkProf, defProf);
    expect(finaleEnd.left.pose).toBe('victory_raise');
    expect(finaleEnd.right.pose).toBe('defeat_slump');
    expect(finaleEnd.right.disarmed).toBe(true);
  });
});
