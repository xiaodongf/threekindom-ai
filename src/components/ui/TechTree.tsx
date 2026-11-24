import type { TechId } from '../../game/types.js';

export type BlossomState = 'bloomed' | 'ready' | 'bud';

interface TechTreeProps {
  nodes: Array<{ id: TechId; label: string; tier: number; state: BlossomState }>;
  selected: TechId | null;
  onSelect: (id: TechId) => void;
}

/** Where each discovery flowers: low boughs first, the crown last. */
const SPOT: Record<TechId, { x: number; y: number; side: 'l' | 'r' | 't' | 'b' }> = {
  stirrups: { x: 118, y: 236, side: 'b' },
  medicine: { x: 206, y: 230, side: 'b' },
  agriculture: { x: 290, y: 250, side: 'b' },
  gunpowder: { x: 150, y: 150, side: 't' },
  spyglass: { x: 240, y: 138, side: 'b' },
  printing: { x: 326, y: 160, side: 'b' },
  balloon: { x: 232, y: 62, side: 't' },
  steamship: { x: 348, y: 34, side: 'b' },
};

const PETALS = [0, 72, 144, 216, 288];

/**
 * The traveller's knowledge drawn as one picture: a plum branch in ink on paper. A discovery not
 * yet affordable is a tight bud, one within reach swells with a gold ring, and one that has been
 * built opens into a blossom - so the whole state of research is read at a glance.
 */
export function TechTree({ nodes, selected, onSelect }: TechTreeProps) {
  return (
    <svg viewBox="0 0 400 300" className="block w-full h-auto select-none" role="group">
      <defs>
        <filter id="ink-edge" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.06" numOctaves="3" seed="8" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" />
        </filter>
        <radialGradient id="petal" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#f6d9d1" />
          <stop offset="55%" stopColor="#e18a77" />
          <stop offset="100%" stopColor="#c2432f" />
        </radialGradient>
      </defs>

      {/* The branch: three weights of stroke, roughened like a dry brush */}
      <g filter="url(#ink-edge)" fill="none" stroke="#1a1612" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 300 C 50 252, 40 214, 70 180" strokeWidth="11" />
        <path d="M70 180 C 92 156, 96 128, 132 104 C 168 80, 196 74, 232 62" strokeWidth="7" />
        <path d="M232 62 C 276 48, 312 44, 348 34" strokeWidth="4" />
        <path d="M46 262 C 80 244, 96 240, 118 236 C 152 230, 178 238, 206 230" strokeWidth="5.5" />
        <path d="M206 230 C 236 224, 262 240, 290 250" strokeWidth="3.5" />
        <path d="M70 180 C 100 168, 124 156, 150 150 C 184 142, 210 144, 240 138" strokeWidth="5" />
        <path d="M240 138 C 272 132, 300 148, 326 160" strokeWidth="3.2" />
        {/* twigs */}
        <path d="M132 104 C 124 88, 130 74, 122 60" strokeWidth="2.4" />
        <path d="M150 150 C 160 136, 156 124, 166 114" strokeWidth="2" />
        <path d="M206 230 C 214 214, 208 204, 220 194" strokeWidth="2" />
        <path d="M290 250 C 304 252, 316 262, 330 262" strokeWidth="1.8" />
        <path d="M326 160 C 340 156, 350 164, 364 160" strokeWidth="1.8" />
        <path d="M118 236 C 110 250, 118 262, 110 274" strokeWidth="1.8" />
        <path d="M278 48 C 284 34, 280 24, 290 14" strokeWidth="1.8" />
      </g>
      {/* A lighter wash under the trunk, as ink pools where the brush rests */}
      <path
        d="M30 300 C 50 252, 40 214, 70 180"
        fill="none"
        stroke="#1a1612"
        strokeOpacity="0.16"
        strokeWidth="22"
        strokeLinecap="round"
      />

      {/* stray buds on the twigs */}
      {[
        [122, 60],
        [166, 114],
        [220, 194],
        [330, 262],
        [364, 160],
        [110, 274],
        [290, 14],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="#84281c" opacity="0.8" />
      ))}

      {nodes.map((node) => {
        const spot = SPOT[node.id];
        const isSelected = selected === node.id;
        const labelDy = spot.side === 't' ? -17 : 23;
        return (
          <g
            key={node.id}
            transform={`translate(${spot.x} ${spot.y})`}
            className="cursor-pointer"
            onClick={() => onSelect(node.id)}
            role="button"
            tabIndex={0}
            aria-label={node.label}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(node.id);
            }}
          >
            <circle r="20" fill="transparent" />
            {isSelected && (
              <circle r="15.5" fill="none" stroke="#96702b" strokeWidth="1.6" strokeDasharray="3 2.5" />
            )}

            {node.state === 'bloomed' ? (
              <g className="blossom-open">
                {PETALS.map((deg) => (
                  <ellipse
                    key={deg}
                    rx="5.4"
                    ry="6.6"
                    cy="-6.4"
                    fill="url(#petal)"
                    stroke="#a53323"
                    strokeWidth="0.5"
                    transform={`rotate(${deg})`}
                  />
                ))}
                {PETALS.map((deg) => (
                  <line
                    key={`s${deg}`}
                    y2="-4.4"
                    stroke="#96702b"
                    strokeWidth="0.6"
                    transform={`rotate(${deg + 36})`}
                  />
                ))}
                <circle r="2.3" fill="#d0a74f" stroke="#745623" strokeWidth="0.5" />
              </g>
            ) : (
              <g>
                {node.state === 'ready' && (
                  <circle r="9.5" fill="none" stroke="#b98d38" strokeWidth="1.4" className="blossom-ready" />
                )}
                <ellipse rx="4.6" ry="5.6" fill={node.state === 'ready' ? '#c2432f' : '#6b2a22'} />
                <path d="M-4.4 1.5 Q 0 6.5 4.4 1.5 Q 0 3.5 -4.4 1.5 Z" fill="#1a1612" />
              </g>
            )}

            <text
              y={labelDy}
              textAnchor="middle"
              className="font-display"
              fontSize="10.5"
              fontWeight={isSelected ? 800 : 600}
              fill={node.state === 'bud' ? '#5c5244' : '#1c1712'}
            >
              {node.label}
            </text>
          </g>
        );
      })}

      {/* Tier marks along the trunk */}
      {[
        ['I', 22, 268],
        ['II', 44, 186],
        ['III', 200, 88],
      ].map(([t, x, y]) => (
        <text key={String(t)} x={Number(x)} y={Number(y)} fontSize="9" fill="#84281c" fontWeight="700" className="font-display">
          {t}
        </text>
      ))}
    </svg>
  );
}
