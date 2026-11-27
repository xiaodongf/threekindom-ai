import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/game/engine.js';
import type { GameState } from '../../src/game/types.js';
import { validateAITurnAction } from './registry.js';

describe('AI Turn Action Validation Guardrails', () => {
  it('blocks attack, raid, and bombard across active truces', () => {
    const state = createNewGame('shu');
    // Shu and Wu start 214 AD with a 2-turn truce (shu-wu truceTurnsLeft: 2)
    expect(state.diplomacy['shu-wu'].truceTurnsLeft).toBeGreaterThan(0);

    for (const type of ['attack', 'raid', 'bombard'] as const) {
      const res = validateAITurnAction(
        { gameState: state, factionId: 'wu', language: 'en' },
        { type, cityId: 'jiangxia', targetCityId: 'jiangling' }
      );
      expect(res).toBeNull();
    }
  });

  it('requires >= 3000 staging troops and unscarred or Lv.4+ walls for AI bombard', () => {
    const base = createNewGame('shu');

    // Valid initial bombard from Chencang (7,500) against Hanzhong (Lv.4, unscarred)
    const ok = validateAITurnAction(
      { gameState: base, factionId: 'wei', language: 'en' },
      { type: 'bombard', cityId: 'chencang', targetCityId: 'hanzhong' }
    );
    expect(ok).toEqual({ type: 'bombard', cityId: 'chencang', targetCityId: 'hanzhong' });

    // Rejects when staging garrison < 3000
    const lowTroops: GameState = {
      ...base,
      cities: {
        ...base.cities,
        chencang: { ...base.cities.chencang, troops: 2400 },
      },
    };
    expect(
      validateAITurnAction(
        { gameState: lowTroops, factionId: 'wei', language: 'en' },
        { type: 'bombard', cityId: 'chencang', targetCityId: 'hanzhong' }
      )
    ).toBeNull();

    // Rejects repeat bombard spam once Hanzhong walls are already scarred and dropped below Lv.4
    const alreadyScarred: GameState = {
      ...base,
      cities: {
        ...base.cities,
        hanzhong: { ...base.cities.hanzhong, defense: 3, wallScar: 2 },
      },
    };
    expect(
      validateAITurnAction(
        { gameState: alreadyScarred, factionId: 'wei', language: 'en' },
        { type: 'bombard', cityId: 'chencang', targetCityId: 'hanzhong' }
      )
    ).toBeNull();
  });
});
