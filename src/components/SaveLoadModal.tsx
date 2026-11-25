import { useRef, useState } from 'react';
import {
  Archive,
  Castle,
  Cloud,
  Coins,
  Download,
  FolderOpen,
  Save,
  Swords,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { createInitialFactions } from '../game/data.js';
import {
  MANUAL_SAVE_SLOT_IDS,
  parseImportedSaveJson,
  type SaveEnvelopeV1,
  type SaveSlotId,
  type SaveSlotSummary,
} from '../game/saveSystem.js';
import type { Language } from '../game/types.js';
import { SEASONS_TEXT, tLoc } from '../i18n/translations.js';
import type { ClientUser } from '../services/persistenceClient.js';
import { Seal } from './ui/Seal.js';

interface SaveLoadModalProps {
  lang: Language;
  user: ClientUser;
  saves: SaveSlotSummary[];
  canSaveCurrent: boolean;
  onSaveSlot: (slotId: SaveSlotId, label?: string) => Promise<void>;
  onLoadSlot: (slotId: SaveSlotId) => Promise<void>;
  onDeleteSlot: (slotId: SaveSlotId) => Promise<void>;
  onExportSlot: (slotId: SaveSlotId) => Promise<void>;
  onExportCurrent?: () => void;
  onImportEnvelope: (envelope: SaveEnvelopeV1) => Promise<void>;
  onOpenAuth: () => void;
  onClose: () => void;
}

const SLOT_TITLES: Record<SaveSlotId, { en: string; zh: string }> = {
  autosave: { en: 'Rolling Autosave', zh: '自动墨卷存档' },
  'slot-1': { en: 'Chronicle Scroll I', zh: '墨卷其一' },
  'slot-2': { en: 'Chronicle Scroll II', zh: '墨卷其二' },
  'slot-3': { en: 'Chronicle Scroll III', zh: '墨卷其三' },
  'slot-4': { en: 'Chronicle Scroll IV', zh: '墨卷其四' },
  'slot-5': { en: 'Chronicle Scroll V', zh: '墨卷其五' },
};

function formatRelativeTime(iso: string, zh: boolean): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 15) return zh ? '刚刚' : 'just now';
  if (diffSec < 60) return zh ? `${diffSec} 秒前` : `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return zh ? `${mins} 分钟前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return zh ? `${hrs} 小时前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return zh ? `${days} 天前` : `${days}d ago`;
}

export function SaveLoadModal({
  lang,
  user,
  saves,
  canSaveCurrent,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
  onExportSlot,
  onExportCurrent,
  onImportEnvelope,
  onOpenAuth,
  onClose,
}: SaveLoadModalProps) {
  const zh = lang === 'zh';
  const factions = createInitialFactions();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [noteBySlot, setNoteBySlot] = useState<Partial<Record<SaveSlotId, string>>>({});
  const [confirmAction, setConfirmAction] = useState<{
    slotId: SaveSlotId;
    kind: 'overwrite' | 'delete';
  } | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const bySlot = new Map<SaveSlotId, SaveSlotSummary>();
  for (const s of saves) bySlot.set(s.slotId, s);

  async function handleSaveClick(slotId: SaveSlotId) {
    const existing = bySlot.get(slotId);
    if (
      existing &&
      !(confirmAction?.slotId === slotId && confirmAction.kind === 'overwrite')
    ) {
      setConfirmAction({ slotId, kind: 'overwrite' });
      return;
    }
    setConfirmAction(null);
    setBusySlot(slotId);
    setStatusMsg(null);
    try {
      await onSaveSlot(slotId, noteBySlot[slotId]?.trim() || undefined);
      setStatusMsg({
        tone: 'ok',
        text: zh
          ? `已妥善封存至【${SLOT_TITLES[slotId].zh}】！`
          : `Saved campaign to ${SLOT_TITLES[slotId].en}!`,
      });
    } catch (err) {
      setStatusMsg({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Save failed',
      });
    } finally {
      setBusySlot(null);
    }
  }

  async function handleLoadClick(slotId: SaveSlotId) {
    setBusySlot(slotId);
    setStatusMsg(null);
    try {
      await onLoadSlot(slotId);
      onClose();
    } catch (err) {
      setStatusMsg({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Failed to load save',
      });
    } finally {
      setBusySlot(null);
    }
  }

  async function handleDeleteClick(slotId: SaveSlotId) {
    if (!(confirmAction?.slotId === slotId && confirmAction.kind === 'delete')) {
      setConfirmAction({ slotId, kind: 'delete' });
      return;
    }
    setConfirmAction(null);
    setBusySlot(slotId);
    setStatusMsg(null);
    try {
      await onDeleteSlot(slotId);
    } catch (err) {
      setStatusMsg({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Delete failed',
      });
    } finally {
      setBusySlot(null);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusySlot('import');
    setStatusMsg(null);
    try {
      const text = await file.text();
      const targetSlot: SaveSlotId =
        MANUAL_SAVE_SLOT_IDS.find((id) => !bySlot.has(id)) ?? 'slot-1';
      const envelope = parseImportedSaveJson(text, targetSlot);
      await onImportEnvelope(envelope);
      onClose();
    } catch (err) {
      setStatusMsg({
        tone: 'err',
        text:
          err instanceof Error
            ? err.message
            : zh
              ? '存档文件格式有误'
              : 'Invalid chronicle JSON file',
      });
    } finally {
      setBusySlot(null);
    }
  }

  function renderSlotCard(slotId: SaveSlotId, isAuto: boolean) {
    const summary = bySlot.get(slotId);
    const title = SLOT_TITLES[slotId];
    const faction = summary ? factions[summary.playerFaction] : null;
    const isBusy = busySlot === slotId;

    return (
      <div
        key={slotId}
        className={`rounded-xl border p-3.5 transition ${
          isAuto
            ? 'bg-gradient-to-r from-[#1d1812] to-[#14110d] border-amber-400/35'
            : summary
              ? 'bg-[#14110d]/95 border-white/15 hover:border-amber-400/35'
              : 'bg-[#110f0c]/75 border-white/10 border-dashed'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {faction ? (
              <Seal char={faction.bannerChar} size={40} color={faction.color} className="shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center text-xs text-slate-500 shrink-0">
                {zh ? '空' : '—'}
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300/90">
                  {tLoc(title, lang)}
                </span>
                {summary && (
                  <span className="text-[11px] text-slate-400">
                    · {formatRelativeTime(summary.savedAt, zh)}
                  </span>
                )}
                {summary?.hasActiveBattle && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/25 text-rose-200 border border-rose-400/40">
                    {zh
                      ? `⚔️ 沙盘激战中${summary.activeBattleCityName ? `（${summary.activeBattleCityName.zh}）` : ''}`
                      : `⚔️ Mid-Battle${summary.activeBattleCityName ? ` (${summary.activeBattleCityName.en})` : ''}`}
                  </span>
                )}
              </div>

              {summary && faction ? (
                <>
                  <div className="text-sm font-bold text-[#f7efe0] truncate">
                    {summary.label}
                    {summary.playerName ? ` · ${summary.playerName}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                    <span className="text-amber-200/95 font-medium">
                      {zh
                        ? `${summary.year}年${SEASONS_TEXT[summary.season].zh} · 第 ${summary.turn} 季`
                        : `${summary.year} AD ${SEASONS_TEXT[summary.season].en} · Turn ${summary.turn}`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Castle className="w-3 h-3 text-amber-300" />
                      {summary.citiesOwned}/{summary.totalCities}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Swords className="w-3 h-3 text-amber-300" />
                      {summary.totalTroops.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Coins className="w-3 h-3 text-amber-300" />
                      {summary.gold.toLocaleString()}
                    </span>
                    <span className="text-chrono-300">
                      {zh ? `偏移 ${summary.divergence}%` : `Div ${summary.divergence}%`}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  {isAuto
                    ? zh
                      ? '尚无自动存档——开局征战后每步自动封存'
                      : 'No autosave yet — created automatically as you play'
                    : zh
                      ? '空白书卷——可随时封存重要战役节点'
                      : 'Empty scroll — save a checkpoint before decisive campaigns'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {summary && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleLoadClick(slotId)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg btn-gold text-xs font-bold cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{zh ? '读取续玩' : 'Load'}</span>
              </button>
            )}

            {!isAuto && canSaveCurrent && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleSaveClick(slotId)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                  confirmAction?.slotId === slotId && confirmAction.kind === 'overwrite'
                    ? 'bg-amber-500/30 border-amber-300 text-amber-100'
                    : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-100'
                }`}
              >
                <Save className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {confirmAction?.slotId === slotId && confirmAction.kind === 'overwrite'
                    ? zh
                      ? '确认覆盖？'
                      : 'Confirm Overwrite?'
                    : summary
                      ? zh
                        ? '覆盖保存'
                        : 'Overwrite'
                      : zh
                        ? '保存至此'
                        : 'Save Here'}
                </span>
              </button>
            )}

            {summary && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onExportSlot(slotId)}
                title={zh ? '下载 .json 备份文件' : 'Download .json backup file'}
                className="p-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}

            {summary && !isAuto && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleDeleteClick(slotId)}
                title={zh ? '删除该存档' : 'Delete save slot'}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                  confirmAction?.slotId === slotId && confirmAction.kind === 'delete'
                    ? 'bg-rose-600/35 border-rose-400 text-rose-100 font-bold'
                    : 'border-white/10 bg-white/5 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmAction?.slotId === slotId && confirmAction.kind === 'delete' && (
                  <span>{zh ? '确认删除' : 'Confirm'}</span>
                )}
              </button>
            )}
          </div>
        </div>

        {!isAuto && canSaveCurrent && (
          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-2">
            <input
              type="text"
              value={noteBySlot[slotId] ?? ''}
              onChange={(e) =>
                setNoteBySlot((prev) => ({ ...prev, [slotId]: e.target.value }))
              }
              placeholder={
                zh
                  ? '可选备注（如：北伐襄阳前夕 / 庞统归顺）'
                  : 'Optional note (e.g. Before Xiangyang Siege)'
              }
              className="flex-1 rounded-lg bg-[#0d0b09] border border-white/10 px-2.5 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400/50"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-400/15 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Archive className="w-5 h-5 text-[#d4a853]" />
            <div>
              <h2 className="font-display text-lg font-bold text-[#f7efe0] leading-tight">
                {zh ? '兰台墨卷 · 单人战役存档录' : 'Imperial Archives · Campaign Saves'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {zh
                  ? '每步指令与 8×8 沙盘战局均自动封存，亦可手动分卷备份或导出文件'
                  : 'Auto-checkpoints every turn & 8×8 battle round, plus 5 manual scrolls & JSON backup'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-chrono-400/35 bg-chrono-500/10 hover:bg-chrono-500/20 text-[11px] font-semibold text-chrono-200 cursor-pointer"
            >
              {user.isGuest ? (
                <>
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{zh ? '绑定账号防丢失' : 'Bind Account'}</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>@{user.username}</span>
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-amber-300" />
              <span>{zh ? '导入 .json' : 'Import .json'}</span>
            </button>

            {canSaveCurrent && onExportCurrent && (
              <button
                type="button"
                onClick={onExportCurrent}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-300" />
                <span>{zh ? '导出当前' : 'Export Live'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`mx-6 mt-3 rounded-lg px-3 py-2 text-xs border shrink-0 ${
              statusMsg.tone === 'ok'
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Scrollable Slots */}
        <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
          {renderSlotCard('autosave', true)}
          <div className="gold-rule my-2" />
          {MANUAL_SAVE_SLOT_IDS.map((slotId) => renderSlotCard(slotId, false))}
        </div>
      </div>
    </div>
  );
}
