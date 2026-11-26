import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNewGame,
  factionHasTech,
  performDevelopCity,
  performResearchTech,
} from '../src/game/engine.js';
import { buildSaveEnvelope, type SaveEnvelopeV1 } from '../src/game/saveSystem.js';
import type { GameState } from '../src/game/types.js';
import { createApiRouter } from './api.js';
import { openDatabase } from './db.js';
import type { MultiplayerRoomSummary } from './rooms.js';

describe('Network Multi-User SQLite Server (Auth, Solo Cloud Saves & Shared Rooms)', () => {
  let db: ReturnType<typeof openDatabase>;
  let server: Server;
  let baseUrl = '';

  beforeEach(async () => {
    db = openDatabase(':memory:');
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', createApiRouter(db));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  async function api<T>(
    path: string,
    opts?: { method?: string; token?: string; body?: unknown }
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {};
    if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      method: opts?.method ?? 'GET',
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  it('upgrades a guest session in-place on registration, preserving solo saves and isolating users', async () => {
    // 1. Player A starts as an instant guest
    const guestRes = await api<{
      user: { id: string; isGuest: boolean };
      sessionToken: string;
    }>('/api/auth/me?autoGuest=1');
    expect(guestRes.status).toBe(200);
    expect(guestRes.data.user.isGuest).toBe(true);
    const tokenA = guestRes.data.sessionToken;
    const guestIdA = guestRes.data.user.id;

    // 2. Guest saves a Shu campaign into slot-1
    let shuState = createNewGame('shu');
    shuState = performDevelopCity(shuState, 'shu', 'chengdu', true);
    const env = buildSaveEnvelope(
      'slot-1',
      shuState,
      { selectedCityId: 'chengdu', activeTab: 'city', sheetOpen: true },
      { label: 'Chengdu Boom' }
    );
    const putRes = await api<{ summary: { label: string } }>('/api/saves/slot-1', {
      method: 'PUT',
      token: tokenA,
      body: env,
    });
    expect(putRes.status).toBe(200);

    // 3. Guest claims username @kongming — user ID and all saves stay intact!
    const regA = await api<{
      user: { id: string; username: string; isGuest: boolean };
      upgradedFromGuest: boolean;
    }>('/api/auth/register', {
      method: 'POST',
      token: tokenA,
      body: { username: 'kongming', password: 'pin1234', displayName: 'Zhuge Kongming' },
    });
    expect(regA.status).toBe(200);
    expect(regA.data.upgradedFromGuest).toBe(true);
    expect(regA.data.user.id).toBe(guestIdA);
    expect(regA.data.user.isGuest).toBe(false);

    // Verify apiKey is never persisted on PATCH /api/auth/prefs
    const prefRes = await api<{ user: { prefs: { aiConfig?: Record<string, unknown> } } }>(
      '/api/auth/prefs',
      {
        method: 'PATCH',
        token: tokenA,
        body: {
          lang: 'zh',
          aiConfig: { provider: 'gemini', model: 'gemini-4-hydrogen', apiKey: 'AIza-SECRET' },
        },
      }
    );
    expect(prefRes.status).toBe(200);
    expect(prefRes.data.user.prefs.aiConfig?.apiKey).toBeUndefined();

    // 4. Player B registers independently — cannot see Player A's saves
    const regB = await api<{ sessionToken: string }>('/api/auth/register', {
      method: 'POST',
      body: { username: 'simayi', password: 'wei9999', displayName: 'Sima Zhongda' },
    });
    expect(regB.status).toBe(200);
    const tokenB = regB.data.sessionToken;

    const listB = await api<{ saves: unknown[] }>('/api/saves', { token: tokenB });
    expect(listB.data.saves).toHaveLength(0);

    const readByB = await api('/api/saves/slot-1', { token: tokenB });
    expect(readByB.status).toBe(404);

    // 5. Player A logs in from a brand-new device/browser and resumes slot-1!
    const loginA = await api<{ sessionToken: string }>('/api/auth/login', {
      method: 'POST',
      body: { username: 'kongming', password: 'pin1234' },
    });
    expect(loginA.status).toBe(200);

    const loadedA = await api<{ save: SaveEnvelopeV1 }>('/api/saves/slot-1', {
      token: loginA.data.sessionToken,
    });
    expect(loadedA.status).toBe(200);
    expect(loadedA.data.save.label).toBe('Chengdu Boom');
    expect(loadedA.data.save.state.cities.chengdu.farming).toBeGreaterThan(2);
  });

  it('runs a persistent 2-human + 1-AI shared multiplayer campaign across turns and season rollover', async () => {
    const regShu = await api<{ sessionToken: string }>('/api/auth/register', {
      method: 'POST',
      body: { username: 'liubei', password: 'shu214', displayName: 'Liu Xuande' },
    });
    const regWei = await api<{ sessionToken: string }>('/api/auth/register', {
      method: 'POST',
      body: { username: 'caocao', password: 'wei214', displayName: 'Cao Mengde' },
    });
    const shuToken = regShu.data.sessionToken;
    const weiToken = regWei.data.sessionToken;

    // 1. Shu hosts a room; Wei joins by 6-char room code; Wu remains unclaimed -> becomes AI on start
    const created = await api<{ room: MultiplayerRoomSummary }>('/api/rooms', {
      method: 'POST',
      token: shuToken,
      body: { name: 'Battle for Hanzhong', hostFaction: 'shu' },
    });
    expect(created.status).toBe(200);
    const code = created.data.room.code;
    expect(code).toHaveLength(6);

    const joined = await api<{ room: MultiplayerRoomSummary }>(`/api/rooms/${code}/join`, {
      method: 'POST',
      token: weiToken,
      body: { faction: 'wei' },
    });
    expect(joined.status).toBe(200);
    expect(joined.data.room.seats.wei.playerName).toBe('Cao Mengde');

    // Non-host cannot launch
    const badStart = await api(`/api/rooms/${code}/start`, { method: 'POST', token: weiToken });
    expect(badStart.status).toBe(403);

    // Host launches campaign -> Wu auto-converts to AI, turn 1 starts on Wei
    const started = await api<{ room: MultiplayerRoomSummary; state: GameState }>(
      `/api/rooms/${code}/start`,
      { method: 'POST', token: shuToken }
    );
    expect(started.status).toBe(200);
    expect(started.data.room.status).toBe('active');
    expect(started.data.room.seats.wu.seatType).toBe('ai');
    expect(started.data.room.activeFaction).toBe('wei');
    expect(started.data.room.stateVersion).toBe(1);

    // 2. Shu cannot commit orders while it is Wei's turn!
    const illegalCommit = await api(`/api/rooms/${code}/commit`, {
      method: 'POST',
      token: shuToken,
      body: { expectedVersion: 1, state: started.data.state },
    });
    expect(illegalCommit.status).toBe(403);

    // 3. Wei develops Luoyang & unlocks 'stirrups' intra-turn, then ends turn
    let weiState = started.data.state;
    weiState = performDevelopCity(weiState, 'wei', 'luoyang', true);
    weiState = {
      ...weiState,
      factions: { ...weiState.factions, wei: { ...weiState.factions.wei, gold: 2000 } },
      chrono: { ...weiState.chrono, innovationPoints: 3 },
    };
    weiState = performResearchTech(weiState, 'stirrups');

    const weiIntra = await api<{ room: MultiplayerRoomSummary; state: GameState }>(
      `/api/rooms/${code}/commit`,
      {
        method: 'POST',
        token: weiToken,
        body: { expectedVersion: 1, state: weiState, endTurn: false },
      }
    );
    expect(weiIntra.status).toBe(200);
    expect(weiIntra.data.room.stateVersion).toBe(2);

    // Stale expectedVersion = 1 is rejected with 409 Conflict
    const staleCommit = await api(`/api/rooms/${code}/commit`, {
      method: 'POST',
      token: weiToken,
      body: { expectedVersion: 1, state: weiState, endTurn: false },
    });
    expect(staleCommit.status).toBe(409);

    // Wei finishes turn -> rotates to Shu!
    const weiEnd = await api<{ room: MultiplayerRoomSummary; state: GameState }>(
      `/api/rooms/${code}/commit`,
      {
        method: 'POST',
        token: weiToken,
        body: {
          expectedVersion: 2,
          state: weiIntra.data.state,
          endTurn: true,
          aiConfig: { provider: 'heuristic' },
        },
      }
    );
    expect(weiEnd.status).toBe(200);
    expect(weiEnd.data.room.activeFaction).toBe('shu');
    expect(weiEnd.data.state.playerFaction).toBe('shu');

    // 4. Shu unlocks 'gunpowder' and ends turn -> Wu (AI) acts & season advances to Turn 2 Summer!
    let shuTurnState = weiEnd.data.state;
    shuTurnState = {
      ...shuTurnState,
      factions: { ...shuTurnState.factions, shu: { ...shuTurnState.factions.shu, gold: 2500 } },
      chrono: { ...shuTurnState.chrono, innovationPoints: 4 },
    };
    shuTurnState = performResearchTech(shuTurnState, 'gunpowder', 'zhugeliang');

    const shuEnd = await api<{ room: MultiplayerRoomSummary; state: GameState }>(
      `/api/rooms/${code}/commit`,
      {
        method: 'POST',
        token: shuToken,
        body: {
          expectedVersion: weiEnd.data.room.stateVersion,
          state: shuTurnState,
          endTurn: true,
          aiConfig: { provider: 'heuristic' },
        },
      }
    );
    expect(shuEnd.status).toBe(200);
    expect(shuEnd.data.room.turn).toBe(2);
    expect(shuEnd.data.room.season).toBe('summer');
    expect(shuEnd.data.room.activeFaction).toBe('wei');

    // 5. Re-fetching the room later restores full persistent world with both players' independent techs!
    const resumed = await api<{ room: MultiplayerRoomSummary; state: GameState }>(
      `/api/rooms/${code}`,
      { token: shuToken }
    );
    expect(resumed.status).toBe(200);
    expect(resumed.data.room.myFaction).toBe('shu');
    expect(factionHasTech(resumed.data.state, 'wei', 'stirrups')).toBe(true);
    expect(factionHasTech(resumed.data.state, 'shu', 'gunpowder')).toBe(true);
  });
});
