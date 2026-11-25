import { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Crown,
  Globe,
  LogIn,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { createInitialFactions } from '../game/data.js';
import type { GameState, Language, PlayableFactionId } from '../game/types.js';
import { SEASONS_TEXT, tLoc } from '../i18n/translations.js';
import {
  configureMultiplayerSeat,
  createMultiplayerRoom,
  deleteMultiplayerRoom,
  fetchMultiplayerRoom,
  joinMultiplayerRoom,
  leaveMultiplayerRoom,
  listMultiplayerRooms,
  startMultiplayerRoom,
  subscribeToRoomEvents,
  type ClientUser,
  type MultiplayerRoomSummary,
} from '../services/persistenceClient.js';
import { Seal } from './ui/Seal.js';

interface MultiplayerModalProps {
  lang: Language;
  user: ClientUser;
  activeRoomCode?: string | null;
  onEnterCampaign: (room: MultiplayerRoomSummary, state: GameState) => void;
  onOpenAuth: () => void;
  onClose: () => void;
}

const FACTIONS_ORDER: PlayableFactionId[] = ['wei', 'shu', 'wu'];

export function MultiplayerModal({
  lang,
  user,
  activeRoomCode,
  onEnterCampaign,
  onOpenAuth,
  onClose,
}: MultiplayerModalProps) {
  const zh = lang === 'zh';
  const factions = createInitialFactions();

  const [myRooms, setMyRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [openLobbies, setOpenLobbies] = useState<MultiplayerRoomSummary[]>([]);
  const [focusedLobby, setFocusedLobby] = useState<MultiplayerRoomSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create room form
  const [newRoomName, setNewRoomName] = useState('');
  const [hostFaction, setHostFaction] = useState<PlayableFactionId>('shu');

  // Join by code form
  const [joinCode, setJoinCode] = useState('');

  async function refreshLists() {
    setLoading(true);
    try {
      const res = await listMultiplayerRooms();
      setMyRooms(res.myRooms);
      setOpenLobbies(res.openLobbies);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshLists();
  }, [user.id]);

  // Live SSE updates while waiting inside a lobby
  useEffect(() => {
    if (!focusedLobby) return;
    const code = focusedLobby.code;
    const unsub = subscribeToRoomEvents(code, {
      onRoomUpdate: async () => {
        try {
          const fresh = await fetchMultiplayerRoom(code);
          if (fresh.room.status === 'active' && fresh.state) {
            onEnterCampaign(fresh.room, fresh.state);
            onClose();
            return;
          }
          setFocusedLobby(fresh.room);
        } catch {
          // ignore
        }
      },
      onPresence: async () => {
        try {
          const fresh = await fetchMultiplayerRoom(code);
          setFocusedLobby(fresh.room);
        } catch {
          // ignore
        }
      },
      onClosed: () => {
        setFocusedLobby(null);
        void refreshLists();
      },
    });
    return unsub;
  }, [focusedLobby?.code]);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createMultiplayerRoom({
        name: newRoomName.trim() || undefined,
        hostFaction,
        playerName: user.displayName,
        avatar: user.avatar,
      });
      setFocusedLobby(res.room);
      void refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinByCode(codeRaw: string, faction?: PlayableFactionId) {
    const code = codeRaw.trim().toUpperCase();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await joinMultiplayerRoom(code, {
        faction,
        playerName: user.displayName,
        avatar: user.avatar,
      });
      if (res.room.status !== 'lobby' && res.state) {
        onEnterCampaign(res.room, res.state);
        onClose();
        return;
      }
      setFocusedLobby(res.room);
      setJoinCode('');
      void refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join room');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenExistingRoom(room: MultiplayerRoomSummary) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchMultiplayerRoom(room.code);
      if (res.room.status === 'lobby') {
        setFocusedLobby(res.room);
      } else if (res.state) {
        onEnterCampaign(res.room, res.state);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open campaign');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleSeatType(faction: PlayableFactionId, nextType: 'human' | 'ai') {
    if (!focusedLobby || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await configureMultiplayerSeat(focusedLobby.code, faction, nextType);
      setFocusedLobby(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update seat');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartLobby() {
    if (!focusedLobby || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startMultiplayerRoom(focusedLobby.code);
      onEnterCampaign(res.room, res.state);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch campaign');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeaveLobby() {
    if (!focusedLobby || busy) return;
    setBusy(true);
    setError(null);
    try {
      await leaveMultiplayerRoom(focusedLobby.code);
      setFocusedLobby(null);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave room');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRoom(code: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMultiplayerRoom(code);
      if (focusedLobby?.code === code) setFocusedLobby(null);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room');
    } finally {
      setBusy(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-400/15 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-[#d4a853]" />
            <div>
              <h2 className="font-display text-lg font-bold text-[#f7efe0] leading-tight">
                {zh ? '联机天下 · 多人共享战局大厅' : 'Network Hall · Shared Multiplayer Campaigns'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {zh
                  ? '2–3 名玩家同处一世执掌魏蜀吴，支持实时同步与随时离线续玩'
                  : '2–3 human rulers command Wei, Shu & Wu in one persistent world — live or async'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-chrono-400/35 bg-chrono-500/10 hover:bg-chrono-500/20 text-[11px] font-semibold text-chrono-200 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>
                {user.isGuest
                  ? zh
                    ? `${user.displayName}（绑定账号）`
                    : `${user.displayName} (Bind Account)`
                  : `@${user.username}`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void refreshLists()}
              title={zh ? '刷新房间列表' : 'Refresh rooms'}
              className="p-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg bg-rose-950/70 border border-rose-500/40 px-3 py-2 text-xs text-rose-200 shrink-0">
            {error}
          </div>
        )}

        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {focusedLobby ? (
            /* ==================== LOBBY WAITING ROOM ==================== */
            <div className="space-y-4">
              <div className="rounded-xl bg-[#14110d] border border-amber-400/35 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-amber-300 font-bold">
                    {zh ? '待开局联机房间' : 'Campaign Lobby · Waiting for Rulers'}
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-50">
                    {focusedLobby.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-black/60 border border-amber-300/40 px-3 py-1.5 flex items-center gap-2">
                    <span className="text-[10px] uppercase text-slate-400">
                      {zh ? '邀请码' : 'Room Code'}
                    </span>
                    <span className="font-mono text-base font-extrabold tracking-widest text-amber-200">
                      {focusedLobby.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCode(focusedLobby.code)}
                      className="text-slate-300 hover:text-white cursor-pointer"
                      title={zh ? '复制房间码' : 'Copy room code'}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFocusedLobby(null)}
                    className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-slate-300 cursor-pointer"
                  >
                    {zh ? '返回大厅' : 'Back'}
                  </button>
                </div>
              </div>

              {/* Three Kingdom Seats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {FACTIONS_ORDER.map((fid) => {
                  const fac = factions[fid];
                  const seat = focusedLobby.seats[fid];
                  const isHost = focusedLobby.hostUserId === user.id;
                  const isMine = seat.userId === user.id;
                  const canClaim = seat.seatType === 'human' && !seat.userId;

                  return (
                    <div
                      key={fid}
                      className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                        isMine
                          ? 'bg-[#1b1610] border-amber-300/70 shadow-[0_0_16px_rgba(212,168,83,0.16)]'
                          : 'bg-[#12100d]/95 border-white/15'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Seal char={fac.bannerChar} size={34} color={fac.color} />
                            <div>
                              <div className="font-brush text-lg font-bold text-slate-50 leading-none">
                                {tLoc(fac.name, lang)}
                              </div>
                              <div className="text-[11px] text-amber-200/80">
                                {tLoc(fac.rulerName, lang)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="gold-rule" />

                        {seat.seatType === 'ai' ? (
                          <div className="flex items-center gap-1.5 text-xs text-indigo-200 py-1">
                            <Bot className="w-4 h-4 text-indigo-300" />
                            <span>{zh ? 'AI 君主执掌' : 'Commanded by AI Warlord'}</span>
                          </div>
                        ) : seat.userId ? (
                          <div className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-200 truncate">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  seat.online ? 'bg-emerald-400' : 'bg-slate-500'
                                }`}
                              />
                              <span className="truncate">{seat.playerName}</span>
                            </div>
                            {isMine && (
                              <span className="text-[10px] font-bold text-amber-300">
                                {zh ? '（你）' : '(You)'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 py-1">
                            {zh ? '空缺玩家席位（输入房间码即可加入）' : 'Open seat — waiting for player'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {canClaim && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleJoinByCode(focusedLobby.code, fid)}
                            className="w-full py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/50 text-xs font-bold text-amber-100 cursor-pointer"
                          >
                            {zh ? `改选${fac.shortName.zh}` : `Switch to ${fac.shortName.en}`}
                          </button>
                        )}

                        {isHost && !isMine && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleToggleSeatType(
                                fid,
                                seat.seatType === 'ai' ? 'human' : 'ai'
                              )
                            }
                            className="w-full py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 cursor-pointer"
                          >
                            {seat.seatType === 'ai'
                              ? zh
                                ? '设为开放玩家席位'
                                : 'Open for Human Player'
                              : zh
                                ? '设为 AI 君主'
                                : 'Set as AI Warlord'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-slate-400">
                  {zh
                    ? '提示：将 6 位邀请码发给同伴加入；未坐满的势力开局后自动由 AI 君主接管。'
                    : 'Share the 6-character code with friends. Any unclaimed seats automatically become AI Warlords on launch.'}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLeaveLobby()}
                    className="px-3 py-2 rounded-xl border border-rose-400/35 bg-rose-950/40 hover:bg-rose-950/70 text-xs font-semibold text-rose-200 cursor-pointer"
                  >
                    {focusedLobby.hostUserId === user.id
                      ? zh
                        ? '解散房间'
                        : 'Close Lobby'
                      : zh
                        ? '离开席位'
                        : 'Leave Seat'}
                  </button>

                  {focusedLobby.hostUserId === user.id && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleStartLobby()}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-xl btn-gold text-xs font-bold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{zh ? '挥师开局' : 'Launch Campaign'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ==================== MAIN MULTIPLAYER HALL ==================== */
            <>
              {/* Top Row: Join by Code + Create New Room */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleJoinByCode(joinCode);
                  }}
                  className="rounded-xl bg-[#13100d] border border-white/15 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                    <LogIn className="w-4 h-4 text-amber-300" />
                    <span>{zh ? '凭房间码加入战局' : 'Join by 6-Character Room Code'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder={zh ? '输入邀请码，如 CHIBI7' : 'Enter code, e.g. CHIBI7'}
                      className="flex-1 rounded-lg bg-black/60 border border-white/15 px-3 py-2 font-mono text-sm uppercase tracking-widest text-amber-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      disabled={busy || !joinCode.trim()}
                      className="px-4 py-2 rounded-lg btn-gold text-xs font-bold cursor-pointer disabled:opacity-40"
                    >
                      {zh ? '加入' : 'Join'}
                    </button>
                  </div>
                </form>

                <form
                  onSubmit={handleCreateRoom}
                  className="rounded-xl bg-[#13100d] border border-amber-400/25 p-4 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                    <Plus className="w-4 h-4 text-amber-300" />
                    <span>{zh ? '创建多人共享战局' : 'Host New Shared Campaign'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      placeholder={zh ? '战局名称（可选）' : 'Room name (optional)'}
                      className="flex-1 rounded-lg bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                    />
                    <select
                      value={hostFaction}
                      onChange={(e) => setHostFaction(e.target.value as PlayableFactionId)}
                      className="rounded-lg bg-black/60 border border-white/15 px-2 py-1.5 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                    >
                      <option value="wei">{zh ? '执掌曹魏' : 'Play Wei'}</option>
                      <option value="shu">{zh ? '执掌蜀汉' : 'Play Shu'}</option>
                      <option value="wu">{zh ? '执掌东吴' : 'Play Wu'}</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3.5 py-1.5 rounded-lg btn-gold text-xs font-bold cursor-pointer shrink-0"
                    >
                      {zh ? '创建' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>

              {/* My Active & Resumable Multiplayer Campaigns */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5" />
                    <span>{zh ? '我的联机战局（随时断点续玩）' : 'My Multiplayer Campaigns (Resume Anytime)'}</span>
                  </h3>
                </div>

                {myRooms.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#110f0c]/60 p-5 text-center text-xs text-slate-400">
                    {zh
                      ? '暂未参与联机战局。可上方创建新房间或输入同伴的 6 位邀请码加入！'
                      : 'No multiplayer campaigns yet — create a room above or enter a friend’s 6-character code!'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myRooms.map((room) => {
                      const myFac = room.myFaction ? factions[room.myFaction] : null;
                      const activeFac = factions[room.activeFaction];
                      const isMyTurn =
                        room.status === 'active' && room.myFaction === room.activeFaction;
                      const isCurrentOpen = activeRoomCode === room.code;

                      return (
                        <div
                          key={room.code}
                          className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                            isMyTurn
                              ? 'bg-gradient-to-r from-[#221b11] to-[#14110d] border-amber-300/60'
                              : 'bg-[#14110d]/95 border-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {myFac && (
                              <Seal char={myFac.bannerChar} size={38} color={myFac.color} />
                            )}
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-50 truncate">
                                  {room.name}
                                </span>
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-amber-200">
                                  {room.code}
                                </span>
                                {room.status === 'lobby' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-200 border border-sky-400/30">
                                    {zh ? '候战大厅' : 'Lobby'}
                                  </span>
                                ) : room.status === 'finished' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-300">
                                    {zh ? '已完结' : 'Finished'}
                                  </span>
                                ) : isMyTurn ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-400/25 text-amber-100 border border-amber-300/60">
                                    {zh ? '⚡ 轮到你下令！' : '⚡ YOUR TURN!'}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-300 border border-white/10">
                                    {zh
                                      ? `等待${activeFac.shortName.zh}行动`
                                      : `Waiting for ${activeFac.shortName.en}`}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                                <span>
                                  {zh
                                    ? `${room.year}年${SEASONS_TEXT[room.season].zh} · 第 ${room.turn} 季`
                                    : `${room.year} AD ${SEASONS_TEXT[room.season].en} · T${room.turn}`}
                                </span>
                                {FACTIONS_ORDER.map((f) => {
                                  const s = room.seats[f];
                                  return (
                                    <span key={f} className="inline-flex items-center gap-1">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          s.seatType === 'ai'
                                            ? 'bg-indigo-400'
                                            : s.online
                                              ? 'bg-emerald-400'
                                              : 'bg-slate-600'
                                        }`}
                                      />
                                      <span className="text-slate-300">
                                        {factions[f].shortName[lang]}({room.cityCounts[f] ?? 0}):
                                      </span>
                                      <span>
                                        {s.seatType === 'ai'
                                          ? 'AI'
                                          : s.playerName || (zh ? '待加入' : 'Open')}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleOpenExistingRoom(room)}
                              className="px-3.5 py-1.5 rounded-lg btn-gold text-xs font-bold cursor-pointer"
                            >
                              {isCurrentOpen
                                ? zh
                                  ? '已在局中'
                                  : 'Viewing'
                                : room.status === 'lobby'
                                  ? zh
                                    ? '进入房间'
                                    : 'Open Lobby'
                                  : zh
                                    ? '继续战局'
                                    : 'Resume'}
                            </button>

                            {room.hostUserId === user.id && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDeleteRoom(room.code)}
                                title={zh ? '删除该联机房间' : 'Delete multiplayer room'}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Open Public Lobbies on Server */}
              {openLobbies.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-chrono-300" />
                    <span>{zh ? '服务器公开招募房间' : 'Open Lobbies on This Server'}</span>
                  </h3>
                  <div className="space-y-2">
                    {openLobbies.map((lobby) => (
                      <div
                        key={lobby.code}
                        className="rounded-xl bg-[#12100d]/90 border border-white/10 p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-100">
                            {lobby.name}{' '}
                            <span className="font-mono text-amber-300 ml-1">#{lobby.code}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {FACTIONS_ORDER.map((f) => {
                              const s = lobby.seats[f];
                              return `${factions[f].shortName[lang]}: ${
                                s.seatType === 'ai'
                                  ? 'AI'
                                  : s.playerName || (zh ? '空缺可入' : 'Open')
                              }`;
                            }).join(' · ')}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleJoinByCode(lobby.code)}
                          className="px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/50 text-xs font-bold text-amber-100 cursor-pointer"
                        >
                          {zh ? '加入候战' : 'Join Lobby'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
