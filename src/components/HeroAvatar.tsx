import { useState } from 'react';
import type { FactionId, General } from '../game/types.js';
import { Art } from './ui/Art.js';

interface HeroAvatarProps {
  hero: General;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLevel?: boolean;
  className?: string;
}

const FACTION_RING: Record<FactionId, string> = {
  wei: 'border-[#4c78a8] ring-[#4c78a8]/30',
  shu: 'border-[#438554] ring-[#438554]/30',
  wu: 'border-[#c2432f] ring-[#c2432f]/30',
  neutral: 'border-[#d4a853] ring-[#d4a853]/30',
};

const SIZE_CLASSES: Record<NonNullable<HeroAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-10 h-10 text-sm',
  md: 'w-14 h-14 text-lg',
  lg: 'w-20 h-20 text-2xl',
  xl: 'w-28 h-28 text-3xl',
};

export function HeroAvatar({
  hero,
  size = 'md',
  showLevel = false,
  className = '',
}: HeroAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const isLegendaryTier =
    hero.status !== 'executed' &&
    (hero.war >= 95 || hero.intellect >= 95 || hero.command >= 95 || hero.charisma >= 96);

  const ringClass =
    hero.status === 'executed'
      ? 'border-zinc-600 grayscale opacity-60'
      : hero.status === 'captured'
        ? 'border-rose-500/80 ring-rose-500/30'
        : isLegendaryTier
          ? 'border-amber-300 ring-amber-400/50 legendary-foil-ring'
          : FACTION_RING[hero.faction];

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 ring-2 shrink-0 bg-[#171310] flex items-center justify-center ${SIZE_CLASSES[size]} ${ringClass} ${className}`}
    >
      {!imgError ? (
        <Art thumb
          src={hero.portrait}
          alt={hero.name.en}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-top theme-art-grade"
          loading="lazy"
        />
      ) : (
        <span className="font-seal font-black text-[#f7e7be]">{hero.seal}</span>
      )}

      {isLegendaryTier && size !== 'xs' && (
        <span
          title="S-Tier Legendary Hero"
          className="absolute top-0.5 left-0.5 text-[8px] font-black px-1 rounded bg-gradient-to-r from-amber-400 to-yellow-200 text-slate-950 shadow leading-tight"
        >
          SSR
        </span>
      )}

      {hero.status === 'wounded' && (
        <div className="absolute inset-0 bg-amber-950/45 flex items-end justify-center pb-0.5">
          <span className="text-[9px] font-bold px-1 rounded bg-amber-500 text-black">
            伤
          </span>
        </div>
      )}

      {hero.status === 'captured' && (
        <div className="absolute inset-0 bg-rose-950/50 flex items-end justify-center pb-0.5">
          <span className="text-[9px] font-bold px-1 rounded bg-rose-600 text-white">
            俘
          </span>
        </div>
      )}

      {hero.status === 'executed' && (
        <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
          <span className="text-[10px] font-bold px-1 rounded bg-zinc-900/90 text-rose-400 border border-rose-500/40">
            陨
          </span>
        </div>
      )}

      {showLevel && hero.status !== 'executed' && (
        <span className="absolute top-0.5 right-0.5 text-[9px] font-bold px-1 rounded bg-black/75 text-[#f7e7be] border border-[#d4a853]/50 leading-tight">
          Lv.{hero.level}
        </span>
      )}
    </div>
  );
}
