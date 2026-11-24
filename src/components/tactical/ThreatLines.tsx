export interface ThreatLine {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  /** true: can strike from where it stands; false: only after moving. */
  direct: boolean;
}

/**
 * Lines from every enemy that could strike the tile under the cursor: solid for those already in
 * range, faint and dashed for those that would have to move first. The danger of a move is drawn
 * on the board before the move is made.
 */
export function ThreatLines({ lines }: { lines: ThreatLine[] }) {
  if (lines.length === 0) return null;
  return (
    <svg
      viewBox="0 0 8 8"
      className="pointer-events-none absolute inset-0 w-full h-full z-20"
      aria-hidden
    >
      <defs>
        <marker id="threat-head" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" fill="#e18a77" />
        </marker>
      </defs>
      {lines.map((l, i) => {
        const x1 = l.fromCol + 0.5;
        const y1 = l.fromRow + 0.5;
        const x2 = l.toCol + 0.5;
        const y2 = l.toRow + 0.5;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        // Stop short of both tokens so the line reads as "from him to here"
        const sx = x1 + ((x2 - x1) / len) * 0.36;
        const sy = y1 + ((y2 - y1) / len) * 0.36;
        const ex = x2 - ((x2 - x1) / len) * 0.3;
        const ey = y2 - ((y2 - y1) / len) * 0.3;
        return (
          <g key={i}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#0d0b09" strokeWidth={l.direct ? 0.12 : 0.08} strokeOpacity="0.55" strokeLinecap="round" />
            <line
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke="#e18a77"
              strokeWidth={l.direct ? 0.06 : 0.045}
              strokeOpacity={l.direct ? 0.95 : 0.75}
              strokeDasharray={l.direct ? '0.3 0.12' : '0.1 0.14'}
              strokeLinecap="round"
              markerEnd={l.direct ? 'url(#threat-head)' : undefined}
              className={l.direct ? 'anim-threat' : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
