import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TipProps {
  /** What the slip says. It may contain further <Tip> terms. */
  content: ReactNode;
  children: ReactNode;
  /** Render the trigger as an underlined term (for words inside another slip). */
  term?: boolean;
  /** Which edge of the trigger the slip hangs from. */
  align?: 'left' | 'right' | 'center';
  className?: string;
}

const ARM_MS = 600;

/**
 * A tooltip in the Crusader Kings manner: it opens on hover, and if the pointer rests on its
 * trigger for a moment it locks, so the pointer can travel into it and open the terms it contains.
 * A slip that never locked closes at once, so skimming along the top strip leaves nothing behind.
 */
export function Tip({ content, children, term = false, align = 'center', className = '' }: TipProps) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const armTimer = useRef<number | null>(null);

  const clear = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const enter = () => {
    clear(closeTimer);
    if (!open) {
      setOpen(true);
      clear(armTimer);
      armTimer.current = window.setTimeout(() => setLocked(true), ARM_MS);
    }
  };

  const leave = () => {
    clear(closeTimer);
    closeTimer.current = window.setTimeout(
      () => {
        clear(armTimer);
        setOpen(false);
        setLocked(false);
      },
      locked ? 260 : 70
    );
  };

  useEffect(
    () => () => {
      clear(closeTimer);
      clear(armTimer);
    },
    []
  );

  const side =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      tabIndex={term ? 0 : undefined}
    >
      <span className={term ? 'tip-term' : 'contents'}>{children}</span>
      {open && (
        <span
          role="tooltip"
          className={`paper-sheet absolute top-full ${side} z-[70] mt-2 w-max max-w-[300px] rounded-sm px-3 py-2.5 text-left text-[12px] font-normal leading-relaxed normal-case tracking-normal cursor-default`}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[2px] ${
              locked ? 'bg-[#b98d38]' : 'tip-arming bg-[#96702b]/60'
            }`}
          />
          {content}
        </span>
      )}
    </span>
  );
}
