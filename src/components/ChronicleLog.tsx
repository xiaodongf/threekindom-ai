import { ScrollText } from 'lucide-react';
import type { ChronicleEntry, Language } from '../game/types.js';
import { SEASONS_TEXT, tLoc } from '../i18n/translations.js';

interface ChronicleLogProps {
  entries: ChronicleEntry[];
  lang: Language;
}

const CATEGORY_STYLES: Record<ChronicleEntry['category'], string> = {
  battle: 'border-l-rose-500 bg-rose-950/15',
  diplomacy: 'border-l-emerald-500 bg-emerald-950/15',
  economy: 'border-l-amber-500 bg-amber-950/10',
  ai: 'border-l-sky-500 bg-sky-950/15',
  system: 'border-l-[#d4a853] bg-[#d4a853]/10',
};

export function ChronicleLog({ entries, lang }: ChronicleLogProps) {
  return (
    <div className="p-4 space-y-2.5 overflow-y-auto max-h-[580px]">
      {entries.length === 0 ? (
        <div className="text-center text-xs text-[#9ea3ae] py-8">
          <ScrollText className="w-6 h-6 mx-auto mb-2 opacity-50" />
          {lang === 'zh' ? '尚无史记记载' : 'No chronicle entries yet.'}
        </div>
      ) : (
        entries.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-r-xl border-l-2 px-3 py-2.5 text-xs leading-relaxed ${CATEGORY_STYLES[entry.category]}`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9ea3ae] mb-1">
              {lang === 'zh'
                ? `${entry.year}年 · ${SEASONS_TEXT[entry.season].zh}（第 ${entry.turn} 季）`
                : `${entry.year} AD · ${SEASONS_TEXT[entry.season].en} (Turn ${entry.turn})`}
            </div>
            <div className="text-[#ece5d5]">{tLoc(entry.text, lang)}</div>
          </div>
        ))
      )}
    </div>
  );
}
