import { getCityGenerals } from '../game/engine.js';
import type { City, FactionId, GameState, Language } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';

interface StrategyMapProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
}

const FACTION_COLORS: Record<FactionId, { fill: string; stroke: string; badge: string }> = {
  wei: { fill: '#2563eb', stroke: '#93c5fd', badge: '魏' },
  shu: { fill: '#059669', stroke: '#6ee7b7', badge: '蜀' },
  wu: { fill: '#dc2626', stroke: '#fca5a5', badge: '吴' },
  neutral: { fill: '#78716c', stroke: '#d6d3d1', badge: '群' },
};

export function StrategyMap({
  state,
  lang,
  selectedCityId,
  onSelectCity,
}: StrategyMapProps) {
  const cities = Object.values(state.cities);
  const selectedCity = selectedCityId ? state.cities[selectedCityId] : null;

  // Deduplicate road edges
  const edges: Array<{ a: City; b: City; isAdjacentToSelected: boolean }> = [];
  const seen = new Set<string>();
  for (const city of cities) {
    for (const neighborId of city.neighbors) {
      const pairKey = [city.id, neighborId].sort().join('--');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const other = state.cities[neighborId];
      if (!other) continue;
      const isAdjacentToSelected = Boolean(
        selectedCity && (city.id === selectedCity.id || other.id === selectedCity.id)
      );
      edges.push({ a: city, b: other, isAdjacentToSelected });
    }
  }

  return (
    <div className="ink-panel rounded-2xl p-2 sm:p-3 relative overflow-hidden flex flex-col">
      {/* Map Legend Overlay */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs">
        <div className="flex items-center gap-3">
          {(['wei', 'shu', 'wu', 'neutral'] as FactionId[]).map((fid) => {
            const count = cities.filter((c) => c.owner === fid).length;
            const label =
              fid === 'neutral'
                ? lang === 'zh'
                  ? '中立'
                  : 'Neutral'
                : tLoc(state.factions[fid].shortName, lang);
            return (
              <div key={fid} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: FACTION_COLORS[fid].fill }}
                />
                <span className="text-[#cfc7b4] font-medium">
                  {label} ({count})
                </span>
              </div>
            );
          })}
        </div>
        <span className="text-[11px] text-[#8d95a5] hidden sm:inline">
          {lang === 'zh' ? '点击城池查看详情与发兵路线' : 'Click any commandery to inspect & issue orders'}
        </span>
      </div>

      {/* SVG Map Canvas */}
      <div className="relative w-full aspect-[1000/610] rounded-xl overflow-hidden border border-[#d4a853]/20 bg-[#0c1118]">
        <svg
          viewBox="0 0 1000 610"
          className="w-full h-full select-none"
          role="img"
          aria-label="Three Kingdoms Strategic Map"
        >
          <defs>
            <radialGradient id="mapBgGlow" cx="52%" cy="48%" r="60%">
              <stop offset="0%" stopColor="#1b2430" />
              <stop offset="65%" stopColor="#111720" />
              <stop offset="100%" stopColor="#0a0e14" />
            </radialGradient>
            <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#202731" />
              <stop offset="50%" stopColor="#1a212b" />
              <stop offset="100%" stopColor="#151b23" />
            </linearGradient>
            <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="arrowAttack"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f97316" />
            </marker>
            <marker
              id="arrowReinforce"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
          </defs>

          {/* Sea / Parchment Ocean Background */}
          <rect x="0" y="0" width="1000" height="610" fill="url(#mapBgGlow)" />

          {/* Subtle cartographic grid lines */}
          <g stroke="#d4a853" strokeOpacity="0.05" strokeWidth="1">
            {[150, 300, 450, 600, 750, 900].map((x) => (
              <line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={610} />
            ))}
            {[120, 240, 360, 480].map((y) => (
              <line key={`gy-${y}`} x1={0} y1={y} x2={1000} y2={y} />
            ))}
          </g>

          {/* Stylized Late Han China Mainland Silhouette */}
          <path
            d="M 110 80 L 420 55 L 700 65 L 785 125 L 760 190 L 845 230 L 820 285 L 915 350 L 925 460 L 870 555 L 680 585 L 480 575 L 250 560 L 125 495 L 95 365 L 145 250 Z"
            fill="url(#landGrad)"
            stroke="#d4a853"
            strokeOpacity="0.22"
            strokeWidth="2"
          />

          {/* Mountain ridge motifs (Qinling & Ba-Shu) */}
          <g fill="none" stroke="#8b95a5" strokeOpacity="0.22" strokeWidth="1.5">
            <path d="M 165 340 L 185 312 L 205 340 M 200 345 L 222 315 L 244 345 M 240 285 L 265 255 L 290 285" />
            <path d="M 355 290 L 378 265 L 401 290 M 395 295 L 415 272 L 435 295" />
            <path d="M 140 445 L 160 420 L 180 445 M 295 495 L 315 470 L 335 495" />
          </g>

          {/* Yellow River (黄河) */}
          <path
            d="M 170 175 C 275 180, 355 190, 435 195 C 510 200, 585 185, 680 140 C 735 115, 785 120, 835 130"
            fill="none"
            stroke="#d4a853"
            strokeOpacity="0.3"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <text x="415" y="178" fill="#d4a853" fillOpacity="0.45" fontSize="11" className="font-seal">
            {lang === 'zh' ? '黄 河' : 'Yellow River'}
          </text>

          {/* Yangtze River (长江) */}
          <path
            d="M 145 480 C 235 460, 330 435, 435 425 C 540 415, 625 410, 725 395 C 805 385, 865 360, 935 365"
            fill="none"
            stroke="#38bdf8"
            strokeOpacity="0.35"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <text x="615" y="395" fill="#7dd3fc" fillOpacity="0.5" fontSize="11" className="font-seal">
            {lang === 'zh' ? '长 江' : 'Yangtze River'}
          </text>

          {/* Regional Watermarks */}
          <g fill="#ebe5d5" fillOpacity="0.07" className="font-seal" fontSize="28" fontWeight="700">
            <text x="470" y="135">{lang === 'zh' ? '中原' : 'CENTRAL PLAINS'}</text>
            <text x="155" y="405">{lang === 'zh' ? '巴蜀' : 'BA-SHU'}</text>
            <text x="745" y="470">{lang === 'zh' ? '江东' : 'JIANGDONG'}</text>
          </g>

          {/* Strategic Road Connections */}
          <g>
            {edges.map(({ a, b, isAdjacentToSelected }) => (
              <line
                key={`${a.id}-${b.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isAdjacentToSelected ? '#d4a853' : '#64748b'}
                strokeOpacity={isAdjacentToSelected ? 0.8 : 0.35}
                strokeWidth={isAdjacentToSelected ? 2.8 : 1.7}
                strokeDasharray={isAdjacentToSelected ? '6 4' : '4 4'}
              />
            ))}
          </g>

          {/* Recent March Animated Arrows */}
          <g>
            {state.recentMarches.slice(0, 3).map((march) => {
              const from = state.cities[march.fromCityId];
              const to = state.cities[march.toCityId];
              if (!from || !to) return null;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const dist = Math.hypot(dx, dy) || 1;
              const offset = 26;
              const x1 = from.x + (dx / dist) * offset;
              const y1 = from.y + (dy / dist) * offset;
              const x2 = to.x - (dx / dist) * offset;
              const y2 = to.y - (dy / dist) * offset;
              return (
                <line
                  key={march.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={march.type === 'attack' ? '#f97316' : '#38bdf8'}
                  strokeWidth="3.2"
                  strokeDasharray="8 6"
                  className="animate-march-line"
                  markerEnd={march.type === 'attack' ? 'url(#arrowAttack)' : 'url(#arrowReinforce)'}
                />
              );
            })}
          </g>

          {/* City Nodes */}
          {cities.map((city) => {
            const palette = FACTION_COLORS[city.owner];
            const isSelected = city.id === selectedCityId;
            const isAdjacent = Boolean(selectedCity?.neighbors.includes(city.id));
            const generals = getCityGenerals(state, city.id);
            const isPlayerCity = city.owner === state.playerFaction;

            return (
              <g
                key={city.id}
                transform={`translate(${city.x}, ${city.y})`}
                onClick={() => onSelectCity(city.id)}
                className="cursor-pointer group"
              >
                {/* Selection / Adjacency Halo */}
                {isSelected && (
                  <circle
                    r="30"
                    fill="none"
                    stroke="#f7e7be"
                    strokeWidth="2.5"
                    className="animate-city-ring"
                  />
                )}
                {!isSelected && isAdjacent && (
                  <circle
                    r="26"
                    fill="none"
                    stroke={city.owner === state.playerFaction ? '#38bdf8' : '#f97316'}
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeOpacity="0.8"
                  />
                )}

                {/* Main City Medallion */}
                <circle
                  r={city.isCapital ? 21 : 18}
                  fill="#0f141c"
                  stroke={palette.fill}
                  strokeWidth={isSelected ? 4 : 3}
                  filter={isSelected ? 'url(#softGlow)' : undefined}
                />
                <circle
                  r={city.isCapital ? 15 : 13}
                  fill={palette.fill}
                  fillOpacity={isPlayerCity ? 0.92 : 0.78}
                />

                {/* Faction Seal Character inside node */}
                <text
                  y="5"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={city.isCapital ? '14' : '12'}
                  fontWeight="800"
                  className="font-seal pointer-events-none"
                >
                  {palette.badge}
                </text>

                {/* Capital Star Badge */}
                {city.isCapital && (
                  <g transform="translate(0, -25)">
                    <polygon
                      points="0,-6 2,-1 7,-1 3,2 4,7 0,4 -4,7 -3,2 -7,-1 -2,-1"
                      fill="#facc15"
                      stroke="#713f12"
                      strokeWidth="0.7"
                    />
                  </g>
                )}

                {/* General Seal Indicator (top-right) */}
                {generals.length > 0 && (
                  <g transform="translate(17, -14)">
                    <circle r="8.5" fill="#1e293b" stroke="#d4a853" strokeWidth="1.2" />
                    <text
                      y="3.5"
                      textAnchor="middle"
                      fill="#f7e7be"
                      fontSize="9"
                      fontWeight="700"
                      className="font-seal"
                    >
                      {generals[0].seal}
                    </text>
                  </g>
                )}

                {/* City Name Label */}
                <g transform="translate(0, 32)">
                  <rect
                    x="-42"
                    y="-10"
                    width="84"
                    height="18"
                    rx="4"
                    fill="#0d1117"
                    fillOpacity="0.88"
                    stroke={isSelected ? '#d4a853' : palette.stroke}
                    strokeOpacity={isSelected ? 0.9 : 0.35}
                    strokeWidth="1"
                  />
                  <text
                    y="3"
                    textAnchor="middle"
                    fill="#f5ecd7"
                    fontSize="11"
                    fontWeight="700"
                    className="pointer-events-none"
                  >
                    {tLoc(city.name, lang)}
                  </text>
                </g>

                {/* Troop Pill */}
                <g transform="translate(0, 49)">
                  <rect
                    x="-28"
                    y="-7"
                    width="56"
                    height="14"
                    rx="7"
                    fill={palette.fill}
                    fillOpacity="0.92"
                  />
                  <text
                    y="3"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="700"
                    className="pointer-events-none"
                  >
                    {(city.troops / 1000).toFixed(1)}k
                  </text>
                </g>
              </g>
            );
          })}

          {/* Corner Cartographer Stamp */}
          <g transform="translate(918, 558)">
            <rect
              x="-24"
              y="-24"
              width="48"
              height="48"
              rx="6"
              fill="#7f1d1d"
              fillOpacity="0.28"
              stroke="#c84b31"
              strokeOpacity="0.7"
              strokeWidth="1.5"
            />
            <text
              y="-4"
              textAnchor="middle"
              fill="#fca5a5"
              fontSize="13"
              fontWeight="800"
              className="font-seal"
            >
              三国
            </text>
            <text
              y="14"
              textAnchor="middle"
              fill="#fca5a5"
              fontSize="13"
              fontWeight="800"
              className="font-seal"
            >
              兵图
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
