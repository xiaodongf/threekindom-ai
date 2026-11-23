import { useState } from 'react';
import { Gift, Handshake, Loader2, MessageSquare, Send, Swords } from 'lucide-react';
import { ACTION_COSTS } from '../game/data.js';
import { getFactionCities, getRelation } from '../game/engine.js';
import type {
  AIRequestConfig,
  DiplomacyProposalType,
  DiplomacyResponse,
  GameState,
  Language,
  PlayableFactionId,
} from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';
import { requestDiplomacyNegotiation } from '../services/aiClient.js';

interface DiplomacyPanelProps {
  state: GameState;
  lang: Language;
  aiConfig: AIRequestConfig;
  onDiplomacyResolved: (
    targetFaction: PlayableFactionId,
    proposalType: DiplomacyProposalType,
    result: DiplomacyResponse,
    giftGold: number
  ) => void;
}

export function DiplomacyPanel({
  state,
  lang,
  aiConfig,
  onDiplomacyResolved,
}: DiplomacyPanelProps) {
  const rivals = (['wei', 'shu', 'wu'] as PlayableFactionId[]).filter(
    (f) => f !== state.playerFaction
  );
  const [selectedRival, setSelectedRival] = useState<PlayableFactionId>(rivals[0]);
  const [envoyText, setEnvoyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastReplies, setLastReplies] = useState<
    Partial<Record<PlayableFactionId, DiplomacyResponse>>
  >({});

  const activeRival = rivals.includes(selectedRival) ? selectedRival : rivals[0];
  const rivalFaction = state.factions[activeRival];
  const playerFaction = state.factions[state.playerFaction];
  const relation = getRelation(state, state.playerFaction, activeRival);
  const rivalCities = getFactionCities(state, activeRival).length;

  async function dispatchDiplomacy(proposalType: DiplomacyProposalType, customMsg?: string) {
    if (loading || rivalFaction.isEliminated) return;
    const giftGold = proposalType === 'gift' ? ACTION_COSTS.giftGold : 0;
    if (giftGold > 0 && playerFaction.gold < giftGold) return;

    setLoading(true);
    try {
      const res = await requestDiplomacyNegotiation({
        gameState: state,
        targetFaction: activeRival,
        proposalType,
        message: customMsg || '',
        giftGold: giftGold || undefined,
        language: lang,
        aiConfig,
      });
      setLastReplies((prev) => ({ ...prev, [activeRival]: res }));
      onDiplomacyResolved(activeRival, proposalType, res, giftGold);
      if (proposalType === 'message') setEnvoyText('');
    } finally {
      setLoading(false);
    }
  }

  const lastReply = lastReplies[activeRival];

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Rival Switcher Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {rivals.map((fid) => {
          const rf = state.factions[fid];
          const rel = getRelation(state, state.playerFaction, fid);
          const active = fid === activeRival;
          return (
            <button
              key={fid}
              onClick={() => setSelectedRival(fid)}
              className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                active
                  ? 'bg-white/[0.07] border-[#d4a853]'
                  : 'bg-[#12100d]/80 border-white/10 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-[#f7efe0]">
                  {tLoc(rf.rulerName, lang)}
                </span>
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center font-seal text-xs font-bold text-white"
                  style={{ backgroundColor: rf.color }}
                >
                  {rf.bannerChar}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#9ea3ae]">
                  {rel ? tLoc(UI_TEXT.statusLabels[rel.status], lang) : '-'}
                </span>
                <span
                  className={`font-mono font-bold ${
                    (rel?.score ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(rel?.score ?? 0) >= 0 ? `+${rel?.score ?? 0}` : rel?.score ?? 0}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Warlord Detail */}
      <div className="rounded-xl bg-[#12100d]/85 border border-white/10 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#f7efe0]">
              {tLoc(rivalFaction.name, lang)} · {tLoc(rivalFaction.rulerName, lang)}
            </div>
            <div className="text-xs text-[#9ea3ae]">
              {tLoc(UI_TEXT.cities, lang)}: {rivalCities}
              {relation && relation.truceTurnsLeft > 0
                ? lang === 'zh'
                  ? ` · 停战余 ${relation.truceTurnsLeft} 季`
                  : ` · Truce: ${relation.truceTurnsLeft} turns`
                : ''}
            </div>
          </div>
          {relation && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/8 text-[#f2dfb1]">
              {tLoc(UI_TEXT.statusLabels[relation.status], lang)}
            </span>
          )}
        </div>

        {/* Relation Progress Bar */}
        {relation && (
          <div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.round(((relation.score + 100) / 200) * 100)}%`,
                  backgroundColor:
                    relation.score >= 20
                      ? '#438554'
                      : relation.score <= -25
                        ? '#c2432f'
                        : '#d4a853',
                }}
              />
            </div>
          </div>
        )}

        {/* Quick Diplomatic Actions */}
        {rivalFaction.isEliminated ? (
          <div className="text-xs text-[#9ea3ae] italic">
            {lang === 'zh' ? '该势力已覆灭。' : 'This kingdom has been eliminated.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            <button
              disabled={loading}
              onClick={() => dispatchDiplomacy('alliance')}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 disabled:opacity-40 text-xs font-semibold text-emerald-200 transition cursor-pointer"
            >
              <Handshake className="w-3.5 h-3.5" />
              <span>{tLoc(UI_TEXT.proposeAlliance, lang)}</span>
            </button>

            <button
              disabled={loading || playerFaction.gold < ACTION_COSTS.giftGold}
              onClick={() => dispatchDiplomacy('gift')}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 disabled:opacity-40 text-xs font-semibold text-amber-200 transition cursor-pointer"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>{tLoc(UI_TEXT.sendGift, lang)}</span>
            </button>

            <button
              disabled={loading}
              onClick={() => dispatchDiplomacy('war')}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 disabled:opacity-40 text-xs font-semibold text-rose-200 transition cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>{tLoc(UI_TEXT.declareWar, lang)}</span>
            </button>
          </div>
        )}
      </div>

      {/* Custom Envoy Letter */}
      {!rivalFaction.isEliminated && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (envoyText.trim()) dispatchDiplomacy('message', envoyText.trim());
          }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#d4a853]">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '遣使游说（自由外交对话）' : 'Custom Diplomatic Dispatch'}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={envoyText}
              onChange={(e) => setEnvoyText(e.target.value)}
              placeholder={tLoc(UI_TEXT.envoyPlaceholder, lang)}
              className="flex-1 rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#6f7787] focus:outline-none focus:border-[#d4a853]"
            />
            <button
              type="submit"
              disabled={loading || !envoyText.trim()}
              className="px-3 py-2 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] disabled:opacity-40 text-[#14110d] font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{tLoc(UI_TEXT.sendEnvoy, lang)}</span>
            </button>
          </div>
        </form>
      )}

      {/* Warlord Response Box */}
      {lastReply && (
        <div className="rounded-xl bg-white/[0.04] border border-[#d4a853]/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#f7e7be]">
              {tLoc(rivalFaction.rulerName, lang)}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-[#d4a853]">
              {lastReply.decision} ({lastReply.relationDelta >= 0 ? '+' : ''}
              {lastReply.relationDelta})
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#e4ddcc] leading-relaxed italic">
            “{lastReply.reply}”
          </p>
          <div className="text-[10px] text-[#7c8496]">
            {lastReply.providerUsed} · {lastReply.modelUsed}
            {lastReply.fallbackUsed ? ' (fallback)' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
