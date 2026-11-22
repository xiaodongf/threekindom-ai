import { useState } from 'react';
import { Loader2, ScrollText, Send, Sparkles } from 'lucide-react';
import type { AIRequestConfig, GameState, Language } from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';
import { requestAdvisorCounsel } from '../services/aiClient.js';

interface AdvisorMessage {
  id: string;
  role: 'user' | 'advisor';
  text: string;
  meta?: string;
}

interface AdvisorPanelProps {
  state: GameState;
  lang: Language;
  aiConfig: AIRequestConfig;
}

export function AdvisorPanel({ state, lang, aiConfig }: AdvisorPanelProps) {
  const faction = state.factions[state.playerFaction];
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      id: 'welcome',
      role: 'advisor',
      text:
        lang === 'zh'
          ? `主公万安！臣${faction.advisorName.zh}随时恭候垂询。请示当前战局、攻防方略或外交纵横之策。`
          : `Greetings, my Lord! I am ${faction.advisorName.en}, at your command. Ask me where to strike, which borders are exposed, or how to maneuver rival warlords.`,
    },
  ]);

  async function askAdvisor(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const userMsg: AdvisorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await requestAdvisorCounsel({
        gameState: state,
        question: trimmed,
        language: lang,
        aiConfig,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'advisor',
          text: res.reply,
          meta: `${res.providerUsed} · ${res.modelUsed}${res.fallbackUsed ? ' (fallback)' : ''}`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'advisor',
          text:
            lang === 'zh'
              ? `军报传讯受阻：${err instanceof Error ? err.message : '未知错误'}`
              : `Dispatch interrupted: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const quickQuestions = [
    tLoc(UI_TEXT.quickQ1, lang),
    tLoc(UI_TEXT.quickQ2, lang),
    tLoc(UI_TEXT.quickQ3, lang),
  ];

  return (
    <div className="flex flex-col h-[580px] p-4 gap-3">
      {/* Advisor Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-seal text-lg font-bold shadow"
          style={{
            background: `linear-gradient(135deg, ${faction.color}aa, ${faction.color}44)`,
            border: `1px solid ${faction.accent}`,
          }}
        >
          {faction.advisorName.zh[0]}
        </div>
        <div>
          <div className="text-sm font-bold text-[#f7efe0] flex items-center gap-1.5">
            <span>{tLoc(faction.advisorName, lang)}</span>
            <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
          </div>
          <div className="text-xs text-[#9ea3ae]">{tLoc(faction.advisorTitle, lang)}</div>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-1.5">
        {quickQuestions.map((q) => (
          <button
            key={q}
            disabled={loading}
            onClick={() => askAdvisor(q)}
            className="text-[11px] px-2.5 py-1 rounded-full bg-[#d4a853]/12 hover:bg-[#d4a853]/25 border border-[#d4a853]/35 text-[#f2dfb1] transition cursor-pointer disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={`flex items-end gap-2 max-w-[94%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {m.role === 'user' && (
                <img
                  src={state.playerProfile.portrait}
                  alt="You"
                  className="w-7 h-7 rounded-lg object-cover object-top border border-cyan-400 shrink-0"
                />
              )}
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-cyan-500/20 border border-cyan-400/40 text-white'
                    : 'bg-slate-900/90 border border-slate-700/70 text-slate-200'
                }`}
              >
                {m.text}
              </div>
            </div>
            {m.meta && (
              <span className="text-[10px] text-slate-500 mt-1 px-1 flex items-center gap-1">
                <ScrollText className="w-2.5 h-2.5" />
                {m.meta}
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#d4a853] px-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{tLoc(UI_TEXT.consulting, lang)}</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          askAdvisor(input);
        }}
        className="flex gap-2 pt-2 border-t border-white/10"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tLoc(UI_TEXT.advisorPlaceholder, lang)}
          className="flex-1 rounded-xl bg-[#0d1015] border border-white/15 px-3 py-2 text-xs sm:text-sm text-[#f5ecd7] placeholder:text-[#6f7787] focus:outline-none focus:border-[#d4a853]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3.5 py-2 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] disabled:opacity-40 text-[#11151d] font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{tLoc(UI_TEXT.send, lang)}</span>
        </button>
      </form>
    </div>
  );
}
