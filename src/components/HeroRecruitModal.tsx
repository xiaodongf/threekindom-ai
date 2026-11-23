import { useState } from 'react';
import {
  Coins,
  Eye,
  Heart,
  Loader2,
  Send,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { ACTION_COSTS } from '../game/data.js';
import { getFactionGenerals } from '../game/engine.js';
import type {
  AIRequestConfig,
  GameState,
  HeroEncounterApproach,
  HeroEncounterMode,
  HeroEncounterResponse,
  Language,
} from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { requestHeroEncounter } from '../services/aiClient.js';
import { HeroAvatar } from './HeroAvatar.js';
import { Art } from './ui/Art.js';

interface HeroRecruitModalProps {
  state: GameState;
  lang: Language;
  aiConfig: AIRequestConfig;
  heroId: string;
  mode: HeroEncounterMode;
  onResolved: (
    heroId: string,
    mode: HeroEncounterMode,
    res: HeroEncounterResponse,
    giftGold: number
  ) => void;
  onClose: () => void;
}

export function HeroRecruitModal({
  state,
  lang,
  aiConfig,
  heroId,
  mode,
  onResolved,
  onClose,
}: HeroRecruitModalProps) {
  const hero = state.generals[heroId];
  const player = state.playerFaction;
  const myEnvoys = getFactionGenerals(state, player)
    .filter((g) => g.status === 'active')
    .sort((a, b) => b.charisma - a.charisma);

  const [envoyId, setEnvoyId] = useState<string>(myEnvoys[0]?.id || '');
  const [approach, setApproach] = useState<HeroEncounterApproach>(
    mode === 'chat' ? 'custom' : 'future_intel'
  );
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<HeroEncounterResponse | null>(null);

  if (!hero) return null;

  const giftGold = approach === 'gold' ? ACTION_COSTS.recruitHeroGiftGold : 0;
  const cannotAffordGift = giftGold > 0 && state.factions[player].gold < giftGold;

  async function submitEncounter() {
    if (loading || cannotAffordGift) return;
    setLoading(true);
    try {
      const res = await requestHeroEncounter({
        gameState: state,
        heroId,
        envoyHeroId: envoyId || undefined,
        mode,
        approach,
        message: message.trim(),
        giftGold: giftGold || undefined,
        language: lang,
        aiConfig,
      });
      setResponse(res);
      onResolved(heroId, mode, res, giftGold);
    } finally {
      setLoading(false);
    }
  }

  const titleByMode: Record<HeroEncounterMode, string> = {
    recruit: lang === 'zh' ? '三顾茅庐 · 招贤纳士' : 'Three Visits · Hero Recruitment',
    persuade: lang === 'zh' ? '天牢劝降 · 攻心为上' : 'Prisoner Persuasion · Win Their Heart',
    chat: lang === 'zh' ? '帷幄密谈 · 名将论道' : 'Private Hero Council',
  };

  const approaches: Array<{
    id: HeroEncounterApproach;
    label: string;
    note: string;
  }> = [
    {
      id: 'future_intel',
      label: lang === 'zh' ? '天机点破命数' : 'Reveal Future Fate',
      note:
        state.chrono.divergence >= 60
          ? lang === 'zh'
            ? '警告：历史偏移 ≥60%，先知威力骤降！'
            : 'Warning: Divergence ≥60% weakens prophecy!'
          : lang === 'zh'
            ? '以穿越者先知震动其心（+偏移）'
            : 'Shock them with future insight (+Divergence)',
    },
    {
      id: 'righteous',
      label: lang === 'zh' ? '晓以大义仁德' : 'Appeal to Honor',
      note: lang === 'zh' ? '最得忠义豪杰欢心' : 'Best for righteous & noble heroes',
    },
    {
      id: 'rank',
      label: lang === 'zh' ? '封侯拜将重用' : 'Promise High Command',
      note: lang === 'zh' ? '打动渴望建功的猛将' : 'Appeals to ambitious vanguards',
    },
    {
      id: 'gold',
      label: lang === 'zh' ? `重金礼聘 (${ACTION_COSTS.recruitHeroGiftGold}金)` : `Gold Gift (${ACTION_COSTS.recruitHeroGiftGold}g)`,
      note: lang === 'zh' ? '切忌用以招揽清高武圣' : 'Risky on proud, high-honor legends',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            {mode === 'chat' ? (
              <Heart className="w-5 h-5 text-emerald-400" />
            ) : (
              <UserPlus className="w-5 h-5 text-[#d4a853]" />
            )}
            <h2 className="font-display text-lg font-bold text-[#f7efe0]">
              {titleByMode[mode]}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#9ea3ae] hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* YOU vs Hero Face-to-Face Portrait Spotlight + Chrono Intel */}
        <div className="rounded-xl bg-slate-950/80 border border-cyan-500/25 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Art thumb
                src={state.playerProfile.portrait}
                alt="Player"
                className="w-14 h-14 rounded-xl object-cover object-top border-2 border-cyan-400 shadow-[0_0_16px_rgba(208,167,79,0.3)]"
              />
              <div>
                <div className="text-[10px] font-bold uppercase text-cyan-400">
                  {lang === 'zh' ? '你 · 穿越者' : 'YOU · 2026'}
                </div>
                <div className="font-display text-sm font-bold text-white">
                  {state.playerProfile.name || (lang === 'zh' ? '天命奇士' : 'Chrono-Strategist')}
                </div>
              </div>
            </div>

            <div className="text-xs font-bold text-cyan-300/70">⇄</div>

            <div className="flex items-center gap-2.5 flex-row-reverse text-right">
              <HeroAvatar hero={hero} size="md" showLevel />
              <div>
                <div className="text-[10px] font-semibold text-amber-300">
                  {tLoc(hero.title, lang)}
                </div>
                <div className="font-display text-sm font-bold text-white">
                  {tLoc(hero.name, lang)}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-cyan-100 bg-cyan-950/40 border border-cyan-400/25 rounded-lg p-2 space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-cyan-300">
              <Eye className="w-3 h-3" />
              <span>{lang === 'zh' ? '穿越者攻略提示' : 'Time-Traveler Intel Hint'}</span>
            </div>
            <div>{tLoc(hero.dossier.persuasionHook, lang)}</div>
          </div>
        </div>

        {/* Controls (before resolved or allow continuing chat) */}
        {(!response || mode === 'chat') && (
          <div className="space-y-3">
            {mode !== 'chat' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#d4a853] mb-1">
                    {lang === 'zh' ? '同行使者（影响魅力加成）' : 'Accompanying Envoy (Charisma Bonus)'}
                  </label>
                  <select
                    value={envoyId}
                    onChange={(e) => setEnvoyId(e.target.value)}
                    className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7]"
                  >
                    {myEnvoys.map((e) => (
                      <option key={e.id} value={e.id}>
                        {tLoc(e.name, lang)} ({lang === 'zh' ? '魅力' : 'Cha'} {e.charisma})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#d4a853] mb-1.5">
                    {lang === 'zh' ? '游说策略' : 'Persuasion Approach'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {approaches.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setApproach(a.id)}
                        className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
                          approach === a.id
                            ? 'bg-[#d4a853]/18 border-[#d4a853] text-[#f7efe0]'
                            : 'bg-[#12100d]/70 border-white/10 text-[#b8b2a2] hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          {a.id === 'gold' && <Coins className="w-3 h-3 text-yellow-400" />}
                          {a.id === 'future_intel' && <Sparkles className="w-3 h-3 text-sky-400" />}
                          <span>{a.label}</span>
                        </div>
                        <div className="text-[10px] text-[#9ea3ae] mt-0.5">{a.note}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#cfc7b4] mb-1">
                {mode === 'chat'
                  ? lang === 'zh'
                    ? '与名将对话（可谈现代科技、军机或历史先知）'
                    : 'Speak with this Hero (discuss modern tech, tactics, or history)'
                  : lang === 'zh'
                    ? '亲口游说词（选填：引用其历史命数效果更佳！）'
                    : 'Your Personal Pitch (optional — cite real history to stun them!)'}
              </label>
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  mode === 'chat'
                    ? lang === 'zh'
                      ? '例如：将军对工坊新造的火药或今后北伐方略作何看法？'
                      : 'e.g., General, what do you make of our new black powder and the coming campaign?'
                    : lang === 'zh'
                      ? '例如：先生切莫轻赴落凤坡，唯有投效我主方可一展凤雏宏图！'
                      : 'e.g., Beware Fallen Phoenix Slope! Serve my King and your genius will reshape China!'
                }
                className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs sm:text-sm text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#cfc7b4] cursor-pointer"
              >
                {lang === 'zh' ? '关闭' : 'Close'}
              </button>
              <button
                disabled={loading || cannotAffordGift || (mode === 'chat' && !message.trim())}
                onClick={submitEncounter}
                className="px-5 py-2 rounded-xl bg-[#d4a853] hover:bg-[#e4ba67] disabled:opacity-40 text-[#14110d] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>
                  {mode === 'chat'
                    ? lang === 'zh'
                      ? '交谈'
                      : 'Speak'
                    : lang === 'zh'
                      ? '呈递招贤书'
                      : 'Deliver Pitch'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Hero Response Card */}
        {response && (
          <div className="rounded-xl bg-white/[0.04] border border-[#d4a853]/45 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[#f7e7be]">{tLoc(hero.name, lang)}</span>
              <span
                className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                  response.outcome === 'join' || response.outcome === 'bonded'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : response.outcome === 'impressed'
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                }`}
              >
                {response.outcome === 'join'
                  ? lang === 'zh'
                    ? '归顺麾下！'
                    : 'SWORN ALLEGIANCE!'
                  : response.outcome === 'bonded'
                    ? lang === 'zh'
                      ? '情谊加深'
                      : 'BOND STRENGTHENED'
                    : response.outcome === 'impressed'
                      ? lang === 'zh'
                        ? '心生敬意'
                        : 'IMPRESSED'
                      : lang === 'zh'
                        ? '断然拒绝'
                        : 'REFUSED'}
              </span>
            </div>
            <p className="text-sm text-[#ece5d5] leading-relaxed italic">{response.reply}</p>
            <div className="flex items-center justify-between text-[10px] text-[#8b92a1]">
              <span>
                {response.providerUsed} · {response.modelUsed}
                {response.fallbackUsed ? ' (fallback)' : ''}
              </span>
              {mode !== 'chat' && (
                <button
                  onClick={onClose}
                  className="px-3 py-1 rounded-lg bg-[#d4a853] text-[#14110d] font-bold cursor-pointer"
                >
                  {lang === 'zh' ? '返回战局' : 'Continue'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
