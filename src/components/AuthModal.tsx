import { useState } from 'react';
import { CheckCircle2, KeyRound, LogIn, LogOut, ShieldCheck, UserPlus, X } from 'lucide-react';
import type { Language, TravelerAvatarId } from '../game/types.js';
import {
  loginAccount,
  logoutAccount,
  registerAccount,
  type ClientUser,
} from '../services/persistenceClient.js';
import { Art } from './ui/Art.js';

interface AuthModalProps {
  lang: Language;
  user: ClientUser;
  onAuthChanged: (nextUser: ClientUser) => void;
  onClose: () => void;
}

export function AuthModal({ lang, user, onAuthChanged, onClose }: AuthModalProps) {
  const zh = lang === 'zh';
  const [mode, setMode] = useState<'register' | 'login'>(user.isGuest ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(
    user.isGuest && user.displayName !== 'Chrono-Strategist' ? user.displayName : ''
  );
  const [avatar, setAvatar] = useState<TravelerAvatarId>(user.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccessNote(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        const res = await registerAccount({
          username,
          password,
          displayName: displayName.trim() || username.trim(),
          avatar,
        });
        onAuthChanged(res.user);
        setSuccessNote(
          res.upgradedFromGuest
            ? zh
              ? '已将当前游客进度升级绑定至正式账号！'
              : 'Guest saves & rooms are now bound to your account!'
            : zh
              ? '账号创建成功！'
              : 'Account created and signed in!'
        );
        setUsername('');
        setPassword('');
      } else {
        const nextUser = await loginAccount({ username, password });
        onAuthChanged(nextUser);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const guest = await logoutAccount();
      onAuthChanged(guest);
      setMode('login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-amber-400/15 pb-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#d4a853]" />
            <div>
              <h2 className="font-display text-lg font-bold text-[#f7efe0] leading-tight">
                {zh ? '天命谱籍 · 账号与云存档' : 'Chronicle Account & Cloud Sync'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {zh
                  ? '跨设备保存个人进度，并加入多人联机战局'
                  : 'Keep solo saves & multiplayer kingdoms across any device'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Identity Card */}
        <div className="rounded-xl bg-[#12100d]/90 border border-amber-400/20 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Art
              thumb
              src={
                user.avatar === 'female'
                  ? '/portraits/traveler_female.jpg'
                  : '/portraits/traveler_male.jpg'
              }
              alt=""
              className="w-10 h-10 rounded-md object-cover object-top border border-chrono-400/70 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-100 truncate">
                  {user.displayName}
                </span>
                {user.isGuest ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                    {zh ? '游客会话' : 'Guest'}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />@{user.username}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {user.offlineOnly
                  ? zh
                    ? '离线浏览器模式（仅本地存储）'
                    : 'Offline mode (browser storage only)'
                  : user.isGuest
                    ? zh
                      ? '当前进度暂存于本机会话；注册即可永久绑定'
                      : 'Register below to bind your current saves to a username'
                    : zh
                      ? '已同步至服务器数据库，可在任意设备登录续玩'
                      : 'Synced to server SQLite — sign in from any browser to resume'}
              </p>
            </div>
          </div>

          {!user.isGuest && (
            <button
              type="button"
              disabled={busy}
              onClick={handleLogout}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{zh ? '退出' : 'Sign out'}</span>
            </button>
          )}
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#12100d] border border-white/10">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              mode === 'register'
                ? 'bg-amber-400/20 text-amber-100 border border-amber-300/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>
              {user.isGuest
                ? zh
                  ? '升级绑定账号'
                  : 'Claim Account'
                : zh
                  ? '注册新账号'
                  : 'New Account'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              mode === 'login'
                ? 'bg-amber-400/20 text-amber-100 border border-amber-300/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{zh ? '登录已有账号' : 'Sign In'}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#cfc7b4] mb-1">
              {zh ? '账号名（字母/数字，3–24位）' : 'Username (3–24 chars)'}
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={zh ? '例如：kongming_214' : 'e.g. kongming_214'}
              className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-slate-500 focus:outline-none focus:border-[#d4a853]"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#cfc7b4] mb-1">
              <KeyRound className="w-3.5 h-3.5 text-[#d4a853]" />
              <span>{zh ? '口令 / PIN（至少 4 位）' : 'Password / PIN (min 4 chars)'}</span>
            </label>
            <input
              type="password"
              required
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-slate-500 focus:outline-none focus:border-[#d4a853]"
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#cfc7b4] mb-1">
                  {zh ? '主公/奇士尊号（显示名，可选）' : 'Strategist Display Name (optional)'}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={zh ? '例如：卧龙先生' : 'e.g. Sleeping Dragon'}
                  className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-slate-500 focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-xs font-semibold text-[#cfc7b4]">
                  {zh ? '穿越者形象' : 'Traveler Portrait'}
                </span>
                <div className="flex items-center rounded-lg border border-white/15 overflow-hidden text-xs">
                  {(['male', 'female'] as TravelerAvatarId[]).map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setAvatar(av)}
                      className={`px-3 py-1 font-semibold cursor-pointer ${
                        avatar === av
                          ? 'bg-chrono-500/30 text-chrono-100'
                          : 'bg-[#12100d] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {av === 'male' ? (zh ? '男奇士' : 'Male') : zh ? '女奇士' : 'Female'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-rose-950/70 border border-rose-500/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {successNote && (
            <div className="rounded-lg bg-emerald-950/70 border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200">
              {successNote}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || Boolean(user.offlineOnly)}
            className="w-full py-2.5 rounded-xl btn-gold text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {busy
              ? zh
                ? '正在连通服务器...'
                : 'Syncing with server...'
              : mode === 'register'
                ? user.isGuest
                  ? zh
                    ? '绑定并保存当前所有进度'
                    : 'Claim Account & Keep Progress'
                  : zh
                    ? '创建新账号并切换'
                    : 'Create & Switch Account'
                : zh
                  ? '登录并同步云端存档'
                  : 'Sign In & Load Cloud Saves'}
          </button>
        </form>
      </div>
    </div>
  );
}
