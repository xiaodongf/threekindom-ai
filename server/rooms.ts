import type Database from 'better-sqlite3';
import { Router, type Response } from 'express';
import crypto from 'node:crypto';
import { rivalOrdersForRealmSize } from '../src/game/data.js';
import {
  activateMultiplayerSeat,
  advanceSeason,
  checkVictoryState,
  createDefaultPlayerProfile,
  createMultiplayerGame,
  executeAITurnAction,
  getFactionCities,
  syncMultiplayerActiveFaction,
} from '../src/game/engine.js';
import {
  MAX_SAVED_CHRONICLE_ENTRIES,
  validateAndHydrateGameState,
} from '../src/game/saveSystem.js';
import type {
  AIRequestConfig,
  FactionId,
  GameState,
  Language,
  MarchEvent,
  PlayableFactionId,
  PlayerProfile,
  Season,
  TravelerAvatarId,
} from '../src/game/types.js';
import { handleAITurnRequest } from './ai/registry.js';
import { requireAuthMiddleware } from './auth.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYABLE_FACTIONS: PlayableFactionId[] = ['wei', 'shu', 'wu'];

export interface RoomSeatInfo {
  faction: PlayableFactionId;
  seatType: 'human' | 'ai';
  userId: string | null;
  playerName: string;
  avatar: TravelerAvatarId;
  online: boolean;
}

export interface MultiplayerRoomSummary {
  code: string;
  name: string;
  hostUserId: string;
  status: 'lobby' | 'active' | 'finished';
  activeFaction: PlayableFactionId;
  stateVersion: number;
  year: number;
  season: Season;
  turn: number;
  winner: PlayableFactionId | null;
  cityCounts: Record<FactionId, number>;
  seats: Record<PlayableFactionId, RoomSeatInfo>;
  myFaction: PlayableFactionId | null;
  updatedAt: string;
}

interface RoomRow {
  id: string;
  code: string;
  name: string;
  host_user_id: string;
  status: 'lobby' | 'active' | 'finished';
  active_faction: PlayableFactionId;
  state_version: number;
  summary_json: string;
  state_json: string | null;
  created_at: string;
  updated_at: string;
}

interface SeatRow {
  room_id: string;
  faction: PlayableFactionId;
  seat_type: 'human' | 'ai';
  user_id: string | null;
  player_name: string;
  avatar: string;
  last_seen_at: string | null;
}

interface StoredStateSummary {
  year: number;
  season: Season;
  turn: number;
  winner: PlayableFactionId | null;
  cityCounts: Record<FactionId, number>;
}

interface SseClient {
  id: string;
  userId: string;
  res: Response;
}

class RoomEventHub {
  private byCode = new Map<string, Set<SseClient>>();

  add(code: string, client: SseClient): void {
    const key = code.toUpperCase();
    let set = this.byCode.get(key);
    if (!set) {
      set = new Set();
      this.byCode.set(key, set);
    }
    set.add(client);
  }

  remove(code: string, client: SseClient): void {
    const key = code.toUpperCase();
    const set = this.byCode.get(key);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) {
      this.byCode.delete(key);
    }
  }

  isUserOnline(code: string, userId: string | null): boolean {
    if (!userId) return false;
    const set = this.byCode.get(code.toUpperCase());
    if (!set) return false;
    for (const c of set) {
      if (c.userId === userId) return true;
    }
    return false;
  }

  broadcast(code: string, event: string, payload: unknown): void {
    const set = this.byCode.get(code.toUpperCase());
    if (!set || set.size === 0) return;
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of set) {
      try {
        client.res.write(data);
      } catch {
        // Closed socket will clean up on 'close'
      }
    }
  }
}

function generateRoomCode(db: Database.Database): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
    }
    const exists = db.prepare(`SELECT 1 FROM mp_rooms WHERE code = ?`).get(code);
    if (!exists) return code;
  }
  return crypto.randomUUID().slice(0, 6).toUpperCase();
}

function summarizeState(state: GameState | null): StoredStateSummary {
  if (!state) {
    return {
      year: 214,
      season: 'spring',
      turn: 1,
      winner: null,
      cityCounts: { wei: 14, shu: 7, wu: 7, neutral: 4 },
    };
  }
  const counts: Record<FactionId, number> = { wei: 0, shu: 0, wu: 0, neutral: 0 };
  for (const c of Object.values(state.cities)) {
    counts[c.owner] = (counts[c.owner] ?? 0) + 1;
  }
  return {
    year: state.year,
    season: state.season,
    turn: state.turn,
    winner: state.winner ?? null,
    cityCounts: counts,
  };
}

function isRecentlySeen(lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return false;
  const ts = Date.parse(lastSeenIso);
  return Number.isFinite(ts) && Date.now() - ts < 45_000;
}

export function createRoomsRouter(db: Database.Database): Router {
  const router = Router();
  const hub = new RoomEventHub();

  router.use(requireAuthMiddleware);

  function buildRoomSummary(row: RoomRow, viewerUserId: string): MultiplayerRoomSummary {
    const seatRows = db
      .prepare(`SELECT * FROM mp_room_players WHERE room_id = ?`)
      .all(row.id) as SeatRow[];

    let storedSummary: StoredStateSummary;
    try {
      storedSummary = JSON.parse(row.summary_json) as StoredStateSummary;
      if (!storedSummary?.cityCounts) storedSummary = summarizeState(null);
    } catch {
      storedSummary = summarizeState(null);
    }

    const seats = {} as Record<PlayableFactionId, RoomSeatInfo>;
    let myFaction: PlayableFactionId | null = null;

    for (const fid of PLAYABLE_FACTIONS) {
      const s = seatRows.find((r) => r.faction === fid);
      const userId = s?.user_id ?? null;
      if (userId && userId === viewerUserId) {
        myFaction = fid;
      }
      seats[fid] = {
        faction: fid,
        seatType: s?.seat_type === 'ai' ? 'ai' : 'human',
        userId,
        playerName:
          s?.seat_type === 'ai'
            ? 'AI Warlord'
            : s?.player_name || (userId ? 'Strategist' : ''),
        avatar: s?.avatar === 'female' ? 'female' : 'male',
        online:
          s?.seat_type === 'ai'
            ? true
            : hub.isUserOnline(row.code, userId) || isRecentlySeen(s?.last_seen_at ?? null),
      };
    }

    return {
      code: row.code,
      name: row.name,
      hostUserId: row.host_user_id,
      status: row.status,
      activeFaction: row.active_faction,
      stateVersion: row.state_version,
      year: storedSummary.year,
      season: storedSummary.season,
      turn: storedSummary.turn,
      winner: storedSummary.winner,
      cityCounts: storedSummary.cityCounts,
      seats,
      myFaction,
      updatedAt: row.updated_at,
    };
  }

  function loadRoomByCode(codeRaw: string): RoomRow | undefined {
    const code = codeRaw.trim().toUpperCase();
    return db.prepare(`SELECT * FROM mp_rooms WHERE code = ?`).get(code) as RoomRow | undefined;
  }

  router.get('/', (req, res) => {
    const userId = req.authUser!.id;

    const myRows = db
      .prepare(
        `SELECT DISTINCT r.*
         FROM mp_rooms r
         JOIN mp_room_players p ON p.room_id = r.id
         WHERE p.user_id = ?
         ORDER BY r.updated_at DESC
         LIMIT 25`
      )
      .all(userId) as RoomRow[];

    const myRooms = myRows
      .map((r) => buildRoomSummary(r, userId))
      .sort((a, b) => {
        const aMyTurn = a.status === 'active' && a.myFaction === a.activeFaction ? 1 : 0;
        const bMyTurn = b.status === 'active' && b.myFaction === b.activeFaction ? 1 : 0;
        if (aMyTurn !== bMyTurn) return bMyTurn - aMyTurn;
        return b.updatedAt.localeCompare(a.updatedAt);
      });

    const lobbyRows = db
      .prepare(
        `SELECT DISTINCT r.*
         FROM mp_rooms r
         JOIN mp_room_players p ON p.room_id = r.id
         WHERE r.status = 'lobby' AND p.seat_type = 'human' AND p.user_id IS NULL
         ORDER BY r.updated_at DESC
         LIMIT 20`
      )
      .all() as RoomRow[];

    const myCodes = new Set(myRooms.map((r) => r.code));
    const openLobbies = lobbyRows
      .filter((r) => !myCodes.has(r.code))
      .map((r) => buildRoomSummary(r, userId));

    res.json({ myRooms, openLobbies });
  });

  router.post('/', (req, res) => {
    const user = req.authUser!;
    const body = (req.body || {}) as {
      name?: string;
      hostFaction?: PlayableFactionId;
      seatConfig?: Partial<Record<PlayableFactionId, 'human' | 'ai'>>;
      playerName?: string;
      avatar?: TravelerAvatarId;
    };

    const hostFaction: PlayableFactionId = PLAYABLE_FACTIONS.includes(
      body.hostFaction as PlayableFactionId
    )
      ? (body.hostFaction as PlayableFactionId)
      : 'shu';

    const roomId = crypto.randomUUID();
    const code = generateRoomCode(db);
    const nowIso = new Date().toISOString();
    const roomName =
      (body.name || '').trim().slice(0, 40) || `${user.displayName}'s Campaign`;
    const hostPlayerName =
      (body.playerName || '').trim().slice(0, 28) || user.displayName || 'Chrono-Strategist';
    const hostAvatar: TravelerAvatarId =
      body.avatar === 'female' ? 'female' : body.avatar === 'male' ? 'male' : user.avatar;

    const initialSummary = summarizeState(null);

    const createTx = db.transaction(() => {
      db.prepare(
        `INSERT INTO mp_rooms (id, code, name, host_user_id, status, active_faction, state_version, summary_json, state_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'lobby', ?, 0, ?, NULL, ?, ?)`
      ).run(
        roomId,
        code,
        roomName,
        user.id,
        hostFaction,
        JSON.stringify(initialSummary),
        nowIso,
        nowIso
      );

      for (const fid of PLAYABLE_FACTIONS) {
        if (fid === hostFaction) {
          db.prepare(
            `INSERT INTO mp_room_players (room_id, faction, seat_type, user_id, player_name, avatar, last_seen_at)
             VALUES (?, ?, 'human', ?, ?, ?, ?)`
          ).run(roomId, fid, user.id, hostPlayerName, hostAvatar, nowIso);
        } else {
          const st = body.seatConfig?.[fid] === 'ai' ? 'ai' : 'human';
          db.prepare(
            `INSERT INTO mp_room_players (room_id, faction, seat_type, user_id, player_name, avatar, last_seen_at)
             VALUES (?, ?, ?, NULL, ?, 'male', NULL)`
          ).run(roomId, fid, st, st === 'ai' ? 'AI Warlord' : '');
        }
      }
    });
    createTx();

    const row = loadRoomByCode(code)!;
    res.json({ room: buildRoomSummary(row, user.id), state: null });
  });

  router.get('/:code', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Multiplayer room not found' });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE mp_room_players SET last_seen_at = ? WHERE room_id = ? AND user_id = ?`
    ).run(nowIso, row.id, user.id);

    let state: GameState | null = null;
    if (row.state_json) {
      try {
        state = validateAndHydrateGameState(JSON.parse(row.state_json));
      } catch {
        state = null;
      }
    }

    res.json({ room: buildRoomSummary(row, user.id), state });
  });

  router.post('/:code/join', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const body = (req.body || {}) as {
      faction?: PlayableFactionId;
      playerName?: string;
      avatar?: TravelerAvatarId;
    };

    const seatRows = db
      .prepare(`SELECT * FROM mp_room_players WHERE room_id = ?`)
      .all(row.id) as SeatRow[];

    const existingMine = seatRows.find((s) => s.user_id === user.id);
    if (row.status !== 'lobby') {
      if (existingMine) {
        const nowIso = new Date().toISOString();
        db.prepare(
          `UPDATE mp_room_players SET last_seen_at = ? WHERE room_id = ? AND faction = ?`
        ).run(nowIso, row.id, existingMine.faction);
        const state = row.state_json
          ? validateAndHydrateGameState(JSON.parse(row.state_json))
          : null;
        res.json({ room: buildRoomSummary(row, user.id), state });
        return;
      }
      res.status(409).json({ error: 'This campaign has already started' });
      return;
    }

    const desiredFaction: PlayableFactionId | undefined = PLAYABLE_FACTIONS.includes(
      body.faction as PlayableFactionId
    )
      ? (body.faction as PlayableFactionId)
      : seatRows.find((s) => s.seat_type === 'human' && (!s.user_id || s.user_id === user.id))
          ?.faction;

    if (!desiredFaction) {
      res.status(409).json({ error: 'No open human seats left in this room' });
      return;
    }

    const targetSeat = seatRows.find((s) => s.faction === desiredFaction);
    if (!targetSeat || targetSeat.seat_type !== 'human') {
      res.status(409).json({ error: 'Selected kingdom is assigned to AI' });
      return;
    }
    if (targetSeat.user_id && targetSeat.user_id !== user.id) {
      res.status(409).json({ error: 'Selected kingdom is already claimed by another player' });
      return;
    }

    const playerName =
      (body.playerName || '').trim().slice(0, 28) || user.displayName || 'Chrono-Strategist';
    const avatar: TravelerAvatarId =
      body.avatar === 'female' ? 'female' : body.avatar === 'male' ? 'male' : user.avatar;
    const nowIso = new Date().toISOString();

    const joinTx = db.transaction(() => {
      db.prepare(
        `UPDATE mp_room_players
         SET user_id = NULL, player_name = '', last_seen_at = NULL
         WHERE room_id = ? AND user_id = ? AND faction != ?`
      ).run(row.id, user.id, desiredFaction);

      db.prepare(
        `UPDATE mp_room_players
         SET user_id = ?, player_name = ?, avatar = ?, last_seen_at = ?
         WHERE room_id = ? AND faction = ?`
      ).run(user.id, playerName, avatar, nowIso, row.id, desiredFaction);

      db.prepare(`UPDATE mp_rooms SET updated_at = ? WHERE id = ?`).run(nowIso, row.id);
    });
    joinTx();

    const updated = loadRoomByCode(row.code)!;
    const summary = buildRoomSummary(updated, user.id);
    hub.broadcast(row.code, 'room_update', {
      code: row.code,
      status: updated.status,
      stateVersion: updated.state_version,
      activeFaction: updated.active_faction,
    });
    res.json({ room: summary, state: null });
  });

  router.post('/:code/seat', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (row.host_user_id !== user.id) {
      res.status(403).json({ error: 'Only the room host can configure seats' });
      return;
    }
    if (row.status !== 'lobby') {
      res.status(409).json({ error: 'Cannot change seat types after campaign starts' });
      return;
    }

    const body = (req.body || {}) as {
      faction?: PlayableFactionId;
      seatType?: 'human' | 'ai';
    };
    const faction = body.faction;
    const seatType = body.seatType;
    if (
      !faction ||
      !PLAYABLE_FACTIONS.includes(faction) ||
      (seatType !== 'human' && seatType !== 'ai')
    ) {
      res.status(400).json({ error: 'Invalid faction or seatType' });
      return;
    }

    const target = db
      .prepare(`SELECT * FROM mp_room_players WHERE room_id = ? AND faction = ?`)
      .get(row.id, faction) as SeatRow | undefined;

    if (target?.user_id === user.id && seatType === 'ai') {
      res.status(400).json({ error: 'Cannot convert your own host seat to AI' });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE mp_room_players
       SET seat_type = ?, user_id = NULL, player_name = ?, last_seen_at = NULL
       WHERE room_id = ? AND faction = ?`
    ).run(seatType, seatType === 'ai' ? 'AI Warlord' : '', row.id, faction);
    db.prepare(`UPDATE mp_rooms SET updated_at = ? WHERE id = ?`).run(nowIso, row.id);

    const updated = loadRoomByCode(row.code)!;
    hub.broadcast(row.code, 'room_update', {
      code: row.code,
      status: updated.status,
      stateVersion: updated.state_version,
      activeFaction: updated.active_faction,
    });
    res.json({ room: buildRoomSummary(updated, user.id) });
  });

  router.post('/:code/leave', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (row.status !== 'lobby') {
      res.status(409).json({ error: 'Campaign is active; you can return anytime to resume' });
      return;
    }
    if (row.host_user_id === user.id) {
      db.prepare(`DELETE FROM mp_rooms WHERE id = ?`).run(row.id);
      hub.broadcast(row.code, 'room_closed', { code: row.code });
      res.json({ ok: true, deleted: true });
      return;
    }
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE mp_room_players
       SET user_id = NULL, player_name = '', last_seen_at = NULL
       WHERE room_id = ? AND user_id = ?`
    ).run(row.id, user.id);
    db.prepare(`UPDATE mp_rooms SET updated_at = ? WHERE id = ?`).run(nowIso, row.id);
    hub.broadcast(row.code, 'room_update', {
      code: row.code,
      status: row.status,
      stateVersion: row.state_version,
      activeFaction: row.active_faction,
    });
    res.json({ ok: true });
  });

  router.post('/:code/start', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (row.host_user_id !== user.id) {
      res.status(403).json({ error: 'Only the room host can launch the campaign' });
      return;
    }
    if (row.status !== 'lobby') {
      res.status(409).json({ error: 'Campaign has already started' });
      return;
    }

    const seatRows = db
      .prepare(`SELECT * FROM mp_room_players WHERE room_id = ?`)
      .all(row.id) as SeatRow[];

    const claimedHumans = seatRows.filter((s) => s.seat_type === 'human' && Boolean(s.user_id));
    if (claimedHumans.length < 1) {
      res.status(400).json({ error: 'At least one human ruler is required' });
      return;
    }

    const humanFactions: PlayableFactionId[] = [];
    const factionProfiles: Partial<Record<PlayableFactionId, PlayerProfile>> = {};

    const nowIso = new Date().toISOString();
    const startTx = db.transaction(() => {
      for (const s of seatRows) {
        if (s.seat_type === 'human' && s.user_id) {
          humanFactions.push(s.faction);
          factionProfiles[s.faction] = createDefaultPlayerProfile(
            s.avatar === 'female' ? 'female' : 'male',
            s.player_name || 'Chrono-Strategist'
          );
        } else {
          // Unclaimed seats automatically become AI warlords upon campaign launch
          db.prepare(
            `UPDATE mp_room_players
             SET seat_type = 'ai', user_id = NULL, player_name = 'AI Warlord'
             WHERE room_id = ? AND faction = ?`
          ).run(row.id, s.faction);
        }
      }

      const initialState = createMultiplayerGame({
        roomCode: row.code,
        roomName: row.name,
        humanFactions,
        factionProfiles,
      });
      const summary = summarizeState(initialState);
      const firstActive = initialState.multiplayer!.activeFaction;

      db.prepare(
        `UPDATE mp_rooms
         SET status = 'active',
             active_faction = ?,
             state_version = 1,
             summary_json = ?,
             state_json = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        firstActive,
        JSON.stringify(summary),
        JSON.stringify(initialState),
        nowIso,
        row.id
      );
    });
    startTx();

    const updated = loadRoomByCode(row.code)!;
    const state = validateAndHydrateGameState(JSON.parse(updated.state_json!));
    hub.broadcast(row.code, 'room_update', {
      code: row.code,
      status: updated.status,
      stateVersion: updated.state_version,
      activeFaction: updated.active_faction,
    });
    res.json({ room: buildRoomSummary(updated, user.id), state });
  });

  router.post('/:code/commit', async (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row || !row.state_json) {
      res.status(404).json({ error: 'Active multiplayer room not found' });
      return;
    }
    if (row.status !== 'active') {
      res.status(409).json({ error: `Room is ${row.status}` });
      return;
    }

    const body = (req.body || {}) as {
      expectedVersion?: number;
      state?: unknown;
      endTurn?: boolean;
      aiConfig?: AIRequestConfig;
      language?: Language;
    };

    const seatRows = db
      .prepare(`SELECT * FROM mp_room_players WHERE room_id = ?`)
      .all(row.id) as SeatRow[];
    const activeSeat = seatRows.find((s) => s.faction === row.active_faction);

    if (!activeSeat || activeSeat.user_id !== user.id) {
      res.status(403).json({
        error: `It is currently ${row.active_faction.toUpperCase()}'s turn`,
      });
      return;
    }

    if (
      typeof body.expectedVersion !== 'number' ||
      body.expectedVersion !== row.state_version
    ) {
      const latestState = validateAndHydrateGameState(JSON.parse(row.state_json));
      res.status(409).json({
        error: 'Campaign state changed in another tab; synced latest state',
        room: buildRoomSummary(row, user.id),
        state: latestState,
      });
      return;
    }

    let prevState: GameState;
    let submitted: GameState;
    try {
      prevState = validateAndHydrateGameState(JSON.parse(row.state_json));
      submitted = validateAndHydrateGameState(body.state);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid GameState payload',
      });
      return;
    }

    const prevMp = prevState.multiplayer!;
    // Preserve authoritative server multiplayer roster & turn order; merge active faction's progress
    let working: GameState = syncMultiplayerActiveFaction(
      checkVictoryState({
        ...submitted,
        playerFaction: row.active_faction,
        chronicle: submitted.chronicle.slice(0, MAX_SAVED_CHRONICLE_ENTRIES),
        multiplayer: {
          ...prevMp,
          activeFaction: row.active_faction,
          factionChronos: {
            ...prevMp.factionChronos,
            ...(submitted.multiplayer?.factionChronos ?? {}),
            [row.active_faction]: submitted.chrono,
          },
          factionProfiles: {
            ...prevMp.factionProfiles,
            [row.active_faction]: submitted.playerProfile,
          },
        },
      })
    );

    const prevTopMarchId = prevState.recentMarches?.[0]?.id;
    let nextActiveFaction: PlayableFactionId = row.active_faction;
    let nextStatus: RoomRow['status'] = working.winner ? 'finished' : 'active';

    if (body.endTurn && !working.winner) {
      const turnOrder = working.multiplayer!.turnOrder;
      const humanSet = new Set(working.multiplayer!.humanFactions);
      let idx = turnOrder.indexOf(row.active_faction);
      if (idx < 0) idx = 0;

      const safeAiConfig: AIRequestConfig = {
        provider: body.aiConfig?.provider ?? 'auto',
        ...(body.aiConfig?.model ? { model: body.aiConfig.model } : {}),
        ...(body.aiConfig?.baseUrl ? { baseUrl: body.aiConfig.baseUrl } : {}),
      };
      const lang: Language = body.language === 'zh' ? 'zh' : 'en';

      let crossedSeason = false;
      for (let step = 0; step < 12; step++) {
        idx = (idx + 1) % turnOrder.length;
        if (idx === 0) {
          working = advanceSeason(working);
          crossedSeason = true;
          if (working.winner) {
            nextStatus = 'finished';
            break;
          }
        }

        const candidate = turnOrder[idx];
        if (working.factions[candidate].isEliminated) {
          continue;
        }

        if (humanSet.has(candidate)) {
          working = activateMultiplayerSeat(working, candidate, crossedSeason);
          nextActiveFaction = candidate;
          break;
        }

        // AI Warlord Kingdom Seat: execute seasonal orders automatically!
        const heldCount = getFactionCities(working, candidate).length;
        const orderCount = rivalOrdersForRealmSize(heldCount);
        for (let n = 0; n < orderCount; n++) {
          if (working.winner || working.factions[candidate].isEliminated) break;
          const byStaff = n > 0;
          try {
            const decision = await handleAITurnRequest({
              gameState: working,
              factionId: candidate,
              language: lang,
              aiConfig: byStaff ? { provider: 'heuristic' } : safeAiConfig,
            });
            if (decision.action.type === 'hold') break;
            working = executeAITurnAction(
              working,
              candidate,
              decision.action,
              byStaff ? undefined : decision.proclamation
            );
            working = syncMultiplayerActiveFaction(checkVictoryState(working));
          } catch {
            break;
          }
        }
        if (working.winner) {
          nextStatus = 'finished';
          break;
        }
      }
    }

    if (working.winner) {
      nextStatus = 'finished';
    }

    const nowIso = new Date().toISOString();
    const summary = summarizeState(working);
    const updateResult = db
      .prepare(
        `UPDATE mp_rooms
         SET status = ?,
             active_faction = ?,
             state_version = state_version + 1,
             summary_json = ?,
             state_json = ?,
             updated_at = ?
         WHERE id = ? AND state_version = ?`
      )
      .run(
        nextStatus,
        nextActiveFaction,
        JSON.stringify(summary),
        JSON.stringify(working),
        nowIso,
        row.id,
        row.state_version
      );

    if (updateResult.changes === 0) {
      const freshRow = loadRoomByCode(row.code)!;
      const freshState = validateAndHydrateGameState(JSON.parse(freshRow.state_json!));
      res.status(409).json({
        error: 'Concurrent state update detected; synced latest state',
        room: buildRoomSummary(freshRow, user.id),
        state: freshState,
      });
      return;
    }

    db.prepare(
      `UPDATE mp_room_players SET last_seen_at = ? WHERE room_id = ? AND user_id = ?`
    ).run(nowIso, row.id, user.id);

    const updatedRow = loadRoomByCode(row.code)!;
    const latestMarch: MarchEvent | null =
      working.recentMarches?.[0] && working.recentMarches[0].id !== prevTopMarchId
        ? working.recentMarches[0]
        : null;

    hub.broadcast(row.code, 'room_update', {
      code: row.code,
      status: updatedRow.status,
      stateVersion: updatedRow.state_version,
      activeFaction: updatedRow.active_faction,
      turnEnded: Boolean(body.endTurn),
      latestMarch,
    });

    res.json({ room: buildRoomSummary(updatedRow, user.id), state: working });
  });

  router.delete('/:code', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (row.host_user_id !== user.id) {
      res.status(403).json({ error: 'Only the room host can delete this room' });
      return;
    }
    db.prepare(`DELETE FROM mp_rooms WHERE id = ?`).run(row.id);
    hub.broadcast(row.code, 'room_closed', { code: row.code });
    res.json({ ok: true });
  });

  router.get('/:code/events', (req, res) => {
    const user = req.authUser!;
    const row = loadRoomByCode(req.params.code);
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client: SseClient = {
      id: crypto.randomUUID(),
      userId: user.id,
      res,
    };
    hub.add(row.code, client);

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE mp_room_players SET last_seen_at = ? WHERE room_id = ? AND user_id = ?`
    ).run(nowIso, row.id, user.id);

    res.write(
      `event: connected\ndata: ${JSON.stringify({
        code: row.code,
        stateVersion: row.state_version,
      })}\n\n`
    );
    hub.broadcast(row.code, 'presence', { code: row.code });

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      hub.remove(row.code, client);
      hub.broadcast(row.code, 'presence', { code: row.code });
    });
  });

  return router;
}
