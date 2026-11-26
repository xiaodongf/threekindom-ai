import { useState } from 'react';
import { CheckCircle2, Circle, Cpu, KeyRound, X } from 'lucide-react';
import type {
  AIProviderId,
  AIProviderStatus,
  AIRequestConfig,
  Language,
} from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';
import { getArtLook, setArtLook, type ArtLook } from '../utils/artLook.js';
import {
  applyMotionPreference,
  loadMotionPreference,
  type MotionPreference,
} from '../utils/motion.js';

const MOTION_OPTIONS: Array<{ id: MotionPreference; en: string; zh: string }> = [
  { id: 'system', en: 'Follow system', zh: '跟随系统' },
  { id: 'reduced', en: 'Reduced', zh: '减弱' },
  { id: 'full', en: 'Full', zh: '完整' },
];

const LOOK_OPTIONS: Array<{ id: ArtLook; en: string; zh: string }> = [
  { id: 'myth', en: 'Dark myth', zh: '玄暗神话' },
  { id: 'classic', en: 'Classic ink', zh: '经典水墨' },
];

interface SettingsModalProps {
  lang: Language;
  providers: AIProviderStatus[];
  currentConfig: AIRequestConfig;
  onSave: (config: AIRequestConfig) => void;
  onClose: () => void;
}

export function SettingsModal({
  lang,
  providers,
  currentConfig,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [provider, setProvider] = useState<AIProviderId>(currentConfig.provider);
  const [model, setModel] = useState(currentConfig.model || '');
  const [apiKey, setApiKey] = useState(currentConfig.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(currentConfig.baseUrl || '');
  const [motion, setMotion] = useState<MotionPreference>(() => loadMotionPreference());
  const [look, setLook] = useState<ArtLook>(() => getArtLook());

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#d4a853]" />
            <h2 className="font-display text-lg font-bold text-[#f7efe0]">
              {tLoc(UI_TEXT.providerSettingsTitle, lang)}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#9ea3ae] hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#b8b2a2] leading-relaxed">
          {tLoc(UI_TEXT.providerSettingsDesc, lang)}
        </p>

        {/* Server Detected Providers */}
        <div className="grid grid-cols-2 gap-2">
          {providers.map((p) => (
            <div
              key={p.id}
              className="rounded-xl bg-[#12100d]/85 border border-white/10 px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#f5ecd7] truncate">{p.name}</div>
                <div className="text-[10px] text-[#8b92a1] truncate">{p.model}</div>
              </div>
              {p.configured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-white/20 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Provider Selector */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#d4a853] mb-1">
              {tLoc(UI_TEXT.activeProvider, lang)}
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProviderId)}
              className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-sm text-[#f5ecd7] focus:outline-none focus:border-[#d4a853]"
            >
              <option value="auto">
                {lang === 'zh' ? 'Auto（自动检测已配置 LLM，无密钥时自动回退）' : 'Auto (First configured LLM → Heuristic fallback)'}
              </option>
              <option value="gemini">Google Gemini (gemini-4-hydrogen)</option>
              <option value="openai">OpenAI / Compatible (Ollama, DeepSeek, etc.)</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="heuristic">
                {lang === 'zh' ? '内置规则战术 AI（无需 API Key）' : 'Built-in Tactical AI (Offline, No API Key)'}
              </option>
            </select>
          </div>

          {provider !== 'heuristic' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#cfc7b4] mb-1">
                  {tLoc(UI_TEXT.modelOverride, lang)}
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={
                    provider === 'gemini'
                      ? 'gemini-4-hydrogen'
                      : provider === 'anthropic'
                        ? 'claude-sonnet-4-20250514'
                        : 'gpt-4o-mini'
                  }
                  className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#cfc7b4] mb-1">
                  <KeyRound className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>{tLoc(UI_TEXT.sessionApiKey, lang)}</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-... / AIza..."
                  className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              {provider === 'openai' && (
                <div>
                  <label className="block text-xs font-semibold text-[#cfc7b4] mb-1">
                    {tLoc(UI_TEXT.openaiBaseUrl, lang)}
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                    className="w-full rounded-xl bg-[#12100d] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Motion: quick by default, and always possible to turn down */}
        <div className="border-t border-white/10 pt-4">
          <div className="text-xs font-semibold text-[#f5ecd7] mb-1">
            {lang === 'zh' ? '界面动效' : 'Interface motion'}
          </div>
          <p className="text-[11px] text-[#b8b2a2] mb-2">
            {lang === 'zh'
              ? '减弱后将关闭过场、印章与数字滚动等装饰性动画。'
              : 'Reduced turns off banners, stamps, count-ups and other decorative animation.'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {MOTION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setMotion(opt.id);
                  applyMotionPreference(opt.id);
                }}
                className={`py-1.5 rounded-md border text-xs font-semibold cursor-pointer ${
                  motion === opt.id
                    ? 'border-amber-300 bg-amber-400/15 text-amber-100'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {lang === 'zh' ? opt.zh : opt.en}
              </button>
            ))}
          </div>
        </div>

        {/* Art style: switches at once; battle scenes pick it up the next time they open */}
        <div className="border-t border-white/10 pt-4">
          <div className="text-xs font-semibold text-[#f5ecd7] mb-1">
            {lang === 'zh' ? '美术风格' : 'Art style'}
          </div>
          <p className="text-[11px] text-[#b8b2a2] mb-2">
            {lang === 'zh'
              ? '玄暗神话：低调光影、冷雾、乌铁与火光。经典水墨：暖色夕照与青绿设色。'
              : 'Dark myth: low light, cold mist, black iron and firelight. Classic ink: warm sunsets and blue-green pigments.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {LOOK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={look === opt.id}
                onClick={() => {
                  setLook(opt.id);
                  setArtLook(opt.id);
                }}
                className={`py-1.5 rounded-md border text-xs font-semibold cursor-pointer ${
                  look === opt.id
                    ? 'border-amber-300 bg-amber-400/15 text-amber-100'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {lang === 'zh' ? opt.zh : opt.en}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#cfc7b4] cursor-pointer"
          >
            {tLoc(UI_TEXT.cancel, lang)}
          </button>
          <button
            onClick={() => {
              onSave({
                provider,
                model: model.trim() || undefined,
                apiKey: apiKey.trim() || undefined,
                baseUrl: baseUrl.trim() || undefined,
              });
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] text-[#14110d] font-bold text-xs cursor-pointer"
          >
            {tLoc(UI_TEXT.saveSettings, lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
