import { useState } from 'react';
import { CheckCircle2, Circle, Cpu, KeyRound, X } from 'lucide-react';
import type {
  AIProviderId,
  AIProviderStatus,
  AIRequestConfig,
  Language,
} from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';

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
              className="rounded-xl bg-[#0d1015]/85 border border-white/10 px-3 py-2 flex items-center justify-between gap-2"
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
              className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-3 py-2 text-sm text-[#f5ecd7] focus:outline-none focus:border-[#d4a853]"
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
                  className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
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
                  className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
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
                    className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-3 py-2 text-xs text-[#f5ecd7] placeholder:text-[#667085] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              )}
            </>
          )}
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
            className="px-5 py-2 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] text-[#11151d] font-bold text-xs cursor-pointer"
          >
            {tLoc(UI_TEXT.saveSettings, lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
