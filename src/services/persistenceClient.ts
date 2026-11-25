import {
  ALL_SAVE_SLOT_IDS,
  sanitizeUserPreferences,
  serializeSaveForDownload,
  validateAndHydrateGameState,
  validateAndHydrateSave,
  type PersistedUserPreferences,
  type SaveEnvelopeV1,
  type SaveSlotId,
  type SaveSlotSummary,
} from '../game/saveSystem.js';
import type {
  AIRequestConfig,
  FactionId,
  GameState,
  Language,
  MarchEvent,
  PlayableFactionId,
  Season,
  TravelerAvatarId,
} from '../game/types.js';

const TOKEN_STORAGE_KEY = 'tk_session_token_v1';
const PREFS_STORAGE_KEY = 'tk_prefs_v1';

export interface ClientUser {
  id: string;
  username: string | null;
  displayName: string;
  avatar: TravelerAvatarId;
  isGuest: boolean;
  prefs: PersistedUserPreferences;
  offlineOnly?: boolean;
}

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

export interface RoomUpdateEventPayload {
  code: string;
  status: 'lobby' | 'active' | 'finished';
  stateVersion: number;
  activeFaction: PlayableFactionId;
  turnEnded?: boolean;
  latestMarch?: MarchEvent | null;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadCachedPreferences(): PersistedUserPreferences {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeUserPreferences(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveCachedPreferences(prefs: PersistedUserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) errMsg = data.error;
    } catch {
      const txt = await res.text().catch(() => '');
      if (txt) errMsg = txt;
    }
    const error = new Error(errMsg) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return (await res.json()) as T;
}

// ==================== LOCAL MIRROR HELPERS ====================

function slotCacheKey(userId: string, slotId: SaveSlotId): string {
  return `tk_save_v1_${userId}_${slotId}`;
}

function indexCacheKey(userId: string): string {
  return `tk_saves_idx_v1_${userId}`;
}

function readLocalSaveIndex(userId: string): SaveSlotSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(indexCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaveSlotSummary[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSaveIndex(userId: string, list: SaveSlotSummary[]): void {
  if (typeof window === 'undefined') return;
  try {
    const ordered: SaveSlotSummary[] = [];
    for (const id of ALL_SAVE_SLOT_IDS) {
      const hit = list.find((s) => s.slotId === id);
      if (hit) ordered.push(hit);
    }
    window.localStorage.setItem(indexCacheKey(userId), JSON.stringify(ordered));
  } catch {
    // ignore quota errors on mirror
  }
}

function writeLocalSaveMirror(userId: string, envelope: SaveEnvelopeV1): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      slotCacheKey(userId, envelope.slotId),
      JSON.stringify(envelope)
    );
    const existing = readLocalSaveIndex(userId).filter((s) => s.slotId !== envelope.slotId);
    existing.push(envelope.summary);
    writeLocalSaveIndex(userId, existing);
  } catch {
    // ignore quota errors on mirror
  }
}

function removeLocalSaveMirror(userId: string, slotId: SaveSlotId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(slotCacheKey(userId, slotId));
    const existing = readLocalSaveIndex(userId).filter((s) => s.slotId !== slotId);
    writeLocalSaveIndex(userId, existing);
  } catch {
    // ignore
  }
}

function readLocalSaveMirror(userId: string, slotId: SaveSlotId): SaveEnvelopeV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(slotCacheKey(userId, slotId));
    if (!raw) return null;
    return validateAndHydrateSave(JSON.parse(raw), slotId);
  } catch {
    return null;
  }
}

// ==================== AUTH & PREFS API ====================

export async function initAuthSession(): Promise<ClientUser> {
  try {
    const res = await apiFetch<{ user: ClientUser; sessionToken?: string }>(
      '/api/auth/me?autoGuest=1'
    );
    if (res.sessionToken) setStoredToken(res.sessionToken);
    if (res.user.prefs) saveCachedPreferences(res.user.prefs);
    return res.user;
  } catch {
    return {
      id: 'local-offline',
      username: null,
      displayName: 'Chrono-Strategist',
      avatar: 'male',
      isGuest: true,
      prefs: loadCachedPreferences(),
      offlineOnly: true,
    };
  }
}

export async function registerAccount(payload: {
  username: string;
  password: string;
  displayName?: string;
  avatar?: TravelerAvatarId;
}): Promise<{ user: ClientUser; upgradedFromGuest?: boolean }> {
  const prevUserToken = getStoredToken();
  const res = await apiFetch<{
    user: ClientUser;
    sessionToken?: string;
    upgradedFromGuest?: boolean;
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.sessionToken) {
    setStoredToken(res.sessionToken);
  } else if (!prevUserToken) {
    setStoredToken(null);
  }
  if (res.user.prefs) saveCachedPreferences(res.user.prefs);
  return { user: res.user, upgradedFromGuest: res.upgradedFromGuest };
}

export async function loginAccount(payload: {
  username: string;
  password: string;
}): Promise<ClientUser> {
  const res = await apiFetch<{ user: ClientUser; sessionToken?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.sessionToken) setStoredToken(res.sessionToken);
  if (res.user.prefs) saveCachedPreferences(res.user.prefs);
  return res.user;
}

export async function logoutAccount(): Promise<ClientUser> {
  try {
    await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore network error on logout
  }
  setStoredToken(null);
  return initAuthSession();
}

export async function updateServerPreferences(payload: {
  displayName?: string;
  avatar?: TravelerAvatarId;
  lang?: Language;
  aiConfig?: AIRequestConfig;
}): Promise<ClientUser | null> {
  const clean = sanitizeUserPreferences({ lang: payload.lang, aiConfig: payload.aiConfig });
  saveCachedPreferences(clean);
  try {
    const res = await apiFetch<{ user: ClientUser }>('/api/auth/prefs', {
      method: 'PATCH',
      body: JSON.stringify({
        ...(payload.displayName ? { displayName: payload.displayName } : {}),
        ...(payload.avatar ? { avatar: payload.avatar } : {}),
        ...clean,
      }),
    });
    return res.user;
  } catch {
    return null;
  }
}

// ==================== SOLO CLOUD SAVES API ====================

export async function listSoloSaves(userId: string): Promise<SaveSlotSummary[]> {
  try {
    const res = await apiFetch<{ saves: SaveSlotSummary[] }>('/api/saves');
    writeLocalSaveIndex(userId, res.saves);
    return res.saves;
  } catch {
    return readLocalSaveIndex(userId);
  }
}

export async function loadSoloSave(
  userId: string,
  slotId: SaveSlotId
): Promise<SaveEnvelopeV1> {
  try {
    const res = await apiFetch<{ save: SaveEnvelopeV1 }>(`/api/saves/${slotId}`);
    const hydrated = validateAndHydrateSave(res.save, slotId);
    writeLocalSaveMirror(userId, hydrated);
    return hydrated;
  } catch (err) {
    const local = readLocalSaveMirror(userId, slotId);
    if (local) return local;
    throw err;
  }
}

export async function putSoloSave(
  userId: string,
  envelope: SaveEnvelopeV1
): Promise<{ summary: SaveSlotSummary; syncedToCloud: boolean }> {
  writeLocalSaveMirror(userId, envelope);
  try {
    const res = await apiFetch<{ summary: SaveSlotSummary; savedAt: string }>(
      `/api/saves/${envelope.slotId}`,
      {
        method: 'PUT',
        body: JSON.stringify(envelope),
      }
    );
    return { summary: res.summary, syncedToCloud: true };
  } catch {
    return { summary: envelope.summary, syncedToCloud: false };
  }
}

export async function deleteSoloSave(userId: string, slotId: SaveSlotId): Promise<void> {
  removeLocalSaveMirror(userId, slotId);
  try {
    await apiFetch<{ ok: boolean }>(`/api/saves/${slotId}`, { method: 'DELETE' });
  } catch {
    // local mirror already cleared
  }
}

export function triggerSaveFileDownload(envelope: SaveEnvelopeV1): void {
  const { filename, json } = serializeSaveForDownload(envelope);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ==================== SHARED MULTIPLAYER ROOMS API ====================

export async function listMultiplayerRooms(): Promise<{
  myRooms: MultiplayerRoomSummary[];
  openLobbies: MultiplayerRoomSummary[];
}> {
  try {
    return await apiFetch<{
      myRooms: MultiplayerRoomSummary[];
      openLobbies: MultiplayerRoomSummary[];
    }>('/api/rooms');
  } catch {
    return { myRooms: [], openLobbies: [] };
  }
}

export async function createMultiplayerRoom(payload: {
  name?: string;
  hostFaction: PlayableFactionId;
  seatConfig?: Partial<Record<PlayableFactionId, 'human' | 'ai'>>;
  playerName?: string;
  avatar?: TravelerAvatarId;
}): Promise<{ room: MultiplayerRoomSummary; state: GameState | null }> {
  return apiFetch<{ room: MultiplayerRoomSummary; state: GameState | null }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMultiplayerRoom(
  code: string
): Promise<{ room: MultiplayerRoomSummary; state: GameState | null }> {
  const res = await apiFetch<{ room: MultiplayerRoomSummary; state: unknown }>(
    `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}`
  );
  return {
    room: res.room,
    state: res.state ? validateAndHydrateGameState(res.state) : null,
  };
}

export async function joinMultiplayerRoom(
  code: string,
  payload?: {
    faction?: PlayableFactionId;
    playerName?: string;
    avatar?: TravelerAvatarId;
  }
): Promise<{ room: MultiplayerRoomSummary; state: GameState | null }> {
  const res = await apiFetch<{ room: MultiplayerRoomSummary; state: unknown }>(
    `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`,
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }
  );
  return {
    room: res.room,
    state: res.state ? validateAndHydrateGameState(res.state) : null,
  };
}

export async function configureMultiplayerSeat(
  code: string,
  faction: PlayableFactionId,
  seatType: 'human' | 'ai'
): Promise<MultiplayerRoomSummary> {
  const res = await apiFetch<{ room: MultiplayerRoomSummary }>(
    `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/seat`,
    {
      method: 'POST',
      body: JSON.stringify({ faction, seatType }),
    }
  );
  return res.room;
}

export async function leaveMultiplayerRoom(
  code: string
): Promise<{ ok: boolean; deleted?: boolean }> {
  return apiFetch<{ ok: boolean; deleted?: boolean }>(
    `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/leave`,
    { method: 'POST' }
  );
}

export async function deleteMultiplayerRoom(code: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}`, {
    method: 'DELETE',
  });
}

export async function startMultiplayerRoom(
  code: string
): Promise<{ room: MultiplayerRoomSummary; state: GameState }> {
  const res = await apiFetch<{ room: MultiplayerRoomSummary; state: unknown }>(
    `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/start`,
    { method: 'POST' }
  );
  return {
    room: res.room,
    state: validateAndHydrateGameState(res.state),
  };
}

export async function commitMultiplayerState(
  code: string,
  payload: {
    expectedVersion: number;
    state: GameState;
    endTurn?: boolean;
    aiConfig?: AIRequestConfig;
    language?: Language;
  }
): Promise<{
  conflict: boolean;
  room: MultiplayerRoomSummary;
  state: GameState;
}> {
  const token = getStoredToken();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const cleanAi: AIRequestConfig | undefined = payload.aiConfig
    ? {
        provider: payload.aiConfig.provider,
        ...(payload.aiConfig.model ? { model: payload.aiConfig.model } : {}),
        ...(payload.aiConfig.baseUrl ? { baseUrl: payload.aiConfig.baseUrl } : {}),
      }
    : undefined;

  const res = await fetch(
    `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/commit`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        expectedVersion: payload.expectedVersion,
        state: payload.state,
        endTurn: payload.endTurn,
        aiConfig: cleanAi,
        language: payload.language,
      }),
    }
  );

  if (res.status === 409) {
    const conflictData = (await res.json()) as {
      room: MultiplayerRoomSummary;
      state: unknown;
    };
    return {
      conflict: true,
      room: conflictData.room,
      state: validateAndHydrateGameState(conflictData.state),
    };
  }

  if (!res.ok) {
    let errMsg = `Failed to sync room (${res.status})`;
    try {
      const d = (await res.json()) as { error?: string };
      if (d?.error) errMsg = d.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as { room: MultiplayerRoomSummary; state: unknown };
  return {
    conflict: false,
    room: data.room,
    state: validateAndHydrateGameState(data.state),
  };
}

export function subscribeToRoomEvents(
  code: string,
  handlers: {
    onRoomUpdate: (payload: RoomUpdateEventPayload) => void;
    onPresence?: () => void;
    onClosed?: () => void;
  }
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const token = getStoredToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const url = `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/events${qs}`;
  const es = new EventSource(url, { withCredentials: true });

  es.addEventListener('room_update', (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data) as RoomUpdateEventPayload;
      handlers.onRoomUpdate(data);
    } catch {
      // ignore malformed event
    }
  });

  es.addEventListener('presence', () => {
    handlers.onPresence?.();
  });

  es.addEventListener('room_closed', () => {
    handlers.onClosed?.();
  });

  return () => {
    es.close();
  };
}
