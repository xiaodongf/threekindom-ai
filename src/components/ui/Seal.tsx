import type { CSSProperties } from 'react';

interface SealProps {
  /** One to four characters; a seal is a mark, not a label. */
  char: string;
  /** Edge length in pixels. */
  size?: number;
  /** Overrides the cinnabar ground, e.g. with a faction colour. */
  color?: string;
  stamped?: boolean;
  className?: string;
  title?: string;
}

/** A carved-seal mark: ownership, commitment and verdicts. */
export function Seal({ char, size = 28, color, stamped = false, className = '', title }: SealProps) {
  const glyphs = [...char];
  const perRow = glyphs.length > 2 ? 2 : glyphs.length;
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: glyphs.length > 2 ? size * 0.36 : glyphs.length === 2 ? size * 0.4 : size * 0.66,
    gridTemplateColumns: `repeat(${perRow}, 1fr)`,
    ...(color
      ? {
          background: `linear-gradient(145deg, ${color} 0%, color-mix(in srgb, ${color} 72%, #000) 100%)`,
          boxShadow: `inset 0 0 0 1.5px rgba(246, 234, 210, 0.82), inset 0 0 0 3px color-mix(in srgb, ${color} 80%, #000), 0 2px 8px rgba(0, 0, 0, 0.45)`,
        }
      : {}),
  };
  return (
    <span
      title={title}
      className={`seal shrink-0 select-none ${stamped ? 'anim-stamp' : ''} ${className}`}
      style={style}
    >
      {glyphs.map((g, i) => (
        <span key={i}>{g}</span>
      ))}
    </span>
  );
}
