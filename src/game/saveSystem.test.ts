import { describe, expect, it } from 'vitest';
import {
  advanceSeason as advanceSeasonWith,
  buildAssaultConfig,
  createMultiplayerGame,
  createNewGame,
  factionHasTech,
  performDevelopCity,
  performResearchTech,
  projectStateForViewer,
  syncMultiplayerActiveFaction,
} from './engine.js';
import {
  MAX_SAVED_CHRONICLE_ENTRIES,
  buildSaveEnvelope,
  parseImportedSaveJson,
  sanitizeUserPreferences,
  serializeSaveForDownload,
  validateAndHydrateSave,
} from './saveSystem.js';
import { createTacticalBattle, moveTacticalUnit } from './tacticalEngine.js';

import type { GameState as QuietGameState } from './types.js';

/** A season in which no city event begins, so each test sees only what it sets up. */
const advanceSeason = (state: QuietGameState) => advanceSeasonWith(state, () => 0.999);

describe('Save System & Multiplayer State Engine', () => {
  it('round-trips a campaign save envelope including mid-8x8 tactical battle state', () => {
    let state = createNewGame('shu', {
      name: 'Wolong',
      avatar: 'male',
      portrait: '/portraits/traveler_male.jpg',
    });
    state = performDevelopCity(state, 'shu', 'chengdu', true);
    state = {
      ...state,
      chrono: { ...state.chrono, innovationPoints: 5 },
      factions: {
        ...state.factions,
        shu: { ...state.factions.shu, gold: 2500 },
      },
    };
    state = performResearchTech(state, 'gunpowder', 'zhugeliang');

    const config = buildAssaultConfig(
      state,
      'shu',
      'jiangling',
      'xiangyang',
      8000,
      'fire',
      'guanyu',
      true
    )!;
    let battle = createTacticalBattle(state, config);
    const leadUnit = battle.units.find((u) => u.side === 'attacker' && !u.defeated)!;
    battle = moveTacticalUnit(battle, leadUnit.id, leadUnit.row, Math.min(7, leadUnit.col + 1));

    const envelope = buildSaveEnvelope(
      'slot-1',
      state,
      { selectedCityId: 'chengdu', activeTab: 'tech', sheetOpen: true },
      {
        label: 'Siege of Xiangyang',
        session: {
          activeTactical: {
            config,
            battleState: battle,
            pendingRivalTurn: {
              remainingAiFactions: [{ faction: 'wu', byStaff: false }],
              accumulatedWarSnapshots: [],
            },
          },
        },
      }
    );

    expect(envelope.summary.hasActiveBattle).toBe(true);
    expect(envelope.summary.label).toBe('Siege of Xiangyang');

    const { json } = serializeSaveForDownload(envelope);
    const imported = parseImportedSaveJson(json, 'slot-2');

    expect(imported.slotId).toBe('slot-2');
    expect(imported.state.playerFaction).toBe('shu');
    expect(imported.state.chrono.unlockedTechs).toContain('gunpowder');
    expect(imported.ui.activeTab).toBe('tech');
    expect(imported.session?.activeTactical?.battleState?.units.length).toBe(battle.units.length);
    expect(imported.session?.activeTactical?.pendingRivalTurn?.remainingAiFactions).toEqual([
      { faction: 'wu', byStaff: false },
    ]);
  });

  it('caps chronicle length, hydrates missing defaults, and rejects malformed saves', () => {
    const state = createNewGame('wei');
    const bloatedChronicle = Array.from({ length: 260 }, (_, idx) => ({
      ...state.chronicle[0],
      id: `log-${idx}`,
    }));
    const env = buildSaveEnvelope(
      'autosave',
      { ...state, chronicle: bloatedChronicle },
      { selectedCityId: 'luoyang', activeTab: 'city', sheetOpen: false }
    );
    expect(env.state.chronicle.length).toBe(MAX_SAVED_CHRONICLE_ENTRIES);

    // Simulate older save missing a city or optional properties
    const partialRaw = JSON.parse(JSON.stringify(env));
    delete partialRaw.state.cities.wan;
    delete partialRaw.state.chrono.pendingTechCopies;
    const hydrated = validateAndHydrateSave(partialRaw);
    expect(hydrated.state.cities.wan).toBeDefined();
    expect(hydrated.state.chrono.pendingTechCopies).toEqual([]);

    expect(() => validateAndHydrateSave(null)).toThrow();
    expect(() => validateAndHydrateSave({ state: { playerFaction: 'invalid' } })).toThrow();
    expect(() => parseImportedSaveJson('{bad json')).toThrow();
  });

  it('strips secret API keys from persisted user preferences', () => {
    const sanitized = sanitizeUserPreferences({
      lang: 'zh',
      aiConfig: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-SUPER-SECRET-DO-NOT-STORE',
        baseUrl: 'http://localhost:11434/v1',
      },
    });
    expect(sanitized.lang).toBe('zh');
    expect(sanitized.aiConfig).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseUrl: 'http://localhost:11434/v1',
    });
    expect('apiKey' in (sanitized.aiConfig ?? {})).toBe(false);
  });

  it('isolates per-kingdom Time-Traveler ChronoState & techs in shared multiplayer games', () => {
    let mp = createMultiplayerGame({
      roomCode: 'CHIBI7',
      roomName: 'Red Cliffs Pact',
      humanFactions: ['wei', 'shu'],
      factionProfiles: {
        wei: { name: 'Mengde', avatar: 'male', portrait: '/portraits/traveler_male.jpg' },
        shu: { name: 'Xuande', avatar: 'male', portrait: '/portraits/traveler_male.jpg' },
      },
    });

    expect(mp.playerFaction).toBe('wei');
    mp = {
      ...mp,
      factions: { ...mp.factions, wei: { ...mp.factions.wei, gold: 3000 } },
      chrono: { ...mp.chrono, innovationPoints: 4 },
    };
    mp = syncMultiplayerActiveFaction(performResearchTech(mp, 'stirrups'));

    expect(factionHasTech(mp, 'wei', 'stirrups')).toBe(true);
    expect(factionHasTech(mp, 'shu', 'stirrups')).toBe(false);

    // Projecting for Shu while Wei is active sets Shu's actionPoints to 0 (read-only wait)
    const shuView = projectStateForViewer(mp, 'shu');
    expect(shuView.playerFaction).toBe('shu');
    expect(shuView.actionPoints).toBe(0);
    expect(shuView.chrono.unlockedTechs).toEqual([]);

    // Advancing the season ticks innovationPoints for all human kingdoms
    const nextSeason = advanceSeason(mp);
    expect(nextSeason.multiplayer?.factionChronos.wei.innovationPoints).toBeGreaterThan(
      mp.multiplayer!.factionChronos.wei.innovationPoints
    );
    expect(nextSeason.multiplayer?.factionChronos.shu.innovationPoints).toBe(2);
  });
});
