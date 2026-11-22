import { useRef, useState } from 'react';
import {
  Compass,
  Layers,
  Map as MapIcon,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getCityGenerals, getCityWanderingHeroes } from '../game/engine.js';
import {
  CONTOUR_PATHS,
  ELEVATION_ZONES,
  GEO_LABELS,
  GRATICULE_LATS,
  GRATICULE_LONS,
  LAKE_FEATURES,
  LAND_PATHS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MOUNTAIN_RIDGES,
  RIVER_FEATURES,
} from '../game/mapGeo.js';
import type { City, FactionId, GameState, Language } from '../game/types.js';
import { TERRAIN_TEXT, tLoc } from '../i18n/translations.js';

interface StrategyMapProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
  onInspectHero?: (heroId: string) => void;
}

const FACTION_PALETTE: Record<
  FactionId,
  { fill: string; glow: string; stroke: string; badge: string; wash: string }
> = {
  wei: {
    fill: '#2563eb',
    glow: '#3b82f6',
    stroke: '#93c5fd',
    badge: '魏',
    wash: '#2563eb',
  },
  shu: {
    fill: '#059669',
    glow: '#10b981',
    stroke: '#6ee7b7',
    badge: '蜀',
    wash: '#10b981',
  },
  wu: {
    fill: '#dc2626',
    glow: '#ef4444',
    stroke: '#fca5a5',
    badge: '吴',
    wash: '#ef4444',
  },
  neutral: {
    fill: '#78716c',
    glow: '#a8a29e',
    stroke: '#e7e5e4',
    badge: '群',
    wash: '#a8a29e',
  },
};

const ELEVATION_STYLE: Record<
  (typeof ELEVATION_ZONES)[number]['kind'],
  { fill: string; opacity: number }
> = {
  alpine: { fill: '#6c5d4c', opacity: 0.65 },
  plateau: { fill: '#6b573b', opacity: 0.45 },
  mountain: { fill: '#524432', opacity: 0.55 },
  basin: { fill: '#224535', opacity: 0.55 },
  plain: { fill: '#2f4933', opacity: 0.5 },
  hills: { fill: '#213a31', opacity: 0.45 },
};

// Build a gentle curved quadratic Bezier road between two cities
function curvedRoadPath(a: City, b: City): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Deterministic subtle bend based on city IDs so roads look organic around terrain
  const hash = (a.id.charCodeAt(0) + b.id.charCodeAt(0)) % 2 === 0 ? 1 : -1;
  const curve = Math.min(22, dist * 0.14) * hash;
  const cx = mx - (dy / dist) * curve;
  const cy = my + (dx / dist) * curve;
  return `M ${a.x} ${a.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}

export function StrategyMap({
  state,
  lang,
  selectedCityId,
  onSelectCity,
  onInspectHero,
}: StrategyMapProps) {
  const cities = Object.values(state.cities);
  const selectedCity = selectedCityId ? state.cities[selectedCityId] : null;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

  const [showTerritory, setShowTerritory] = useState(true);
  const [showGeoLabels, setShowGeoLabels] = useState(true);
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);

  const clampPan = (nx: number, ny: number, z: number) => {
    const maxX = ((z - 1) * MAP_WIDTH) / 2 + 40;
    const maxY = ((z - 1) * MAP_HEIGHT) / 2 + 30;
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  };

  const applyZoom = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(2.4, Number(nextZoom.toFixed(2))));
    setZoom(clamped);
    setPan((prev) => (clamped === 1 ? { x: 0, y: 0 } : clampPan(prev.x, prev.y, clamped)));
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    applyZoom(zoom + delta);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragStart.current.moved = true;
    }
    setPan(clampPan(dragStart.current.panX + dx, dragStart.current.panY + dy, zoom));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Deduplicate road edges
  const edges: Array<{ a: City; b: City; isAdjacentToSelected: boolean; isRiverRoute: boolean }> =
    [];
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
      const isRiverRoute = city.terrain === 'river' && other.terrain === 'river';
      edges.push({ a: city, b: other, isAdjacentToSelected, isRiverRoute });
    }
  }

  const hoveredCity = hoveredCityId ? state.cities[hoveredCityId] : null;
  const hoveredGenerals = hoveredCity ? getCityGenerals(state, hoveredCity.id) : [];

  const viewTransform = `translate(${MAP_WIDTH / 2 + pan.x}, ${MAP_HEIGHT / 2 + pan.y}) scale(${zoom}) translate(${-MAP_WIDTH / 2}, ${-MAP_HEIGHT / 2})`;

  return (
    <div className="ink-panel rounded-2xl p-2 sm:p-3 relative overflow-hidden flex flex-col">
      {/* Top Map Legend & Layer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
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
                  className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30"
                  style={{ backgroundColor: FACTION_PALETTE[fid].fill }}
                />
                <span className="text-[#d6ceb8] font-medium">
                  {label} ({count})
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTerritory((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition cursor-pointer ${
              showTerritory
                ? 'bg-[#d4a853]/18 border-[#d4a853]/50 text-[#f5e3b3]'
                : 'bg-white/5 border-white/10 text-[#9ea3ae]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{lang === 'zh' ? '势力版图' : 'Realms'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGeoLabels((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition cursor-pointer ${
              showGeoLabels
                ? 'bg-[#d4a853]/18 border-[#d4a853]/50 text-[#f5e3b3]'
                : 'bg-white/5 border-white/10 text-[#9ea3ae]'
            }`}
          >
            <MapIcon className="w-3 h-3" />
            <span>{lang === 'zh' ? '山川地名' : 'Geography'}</span>
          </button>

          <div className="flex items-center rounded-md border border-white/10 bg-[#0d1015]/80 overflow-hidden ml-1">
            <button
              type="button"
              onClick={() => applyZoom(zoom - 0.3)}
              disabled={zoom <= 1}
              title="Zoom Out"
              className="p-1 text-[#cfc7b4] hover:bg-white/10 disabled:opacity-35 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[10px] font-mono text-[#d4a853]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => applyZoom(zoom + 0.3)}
              disabled={zoom >= 2.4}
              title="Zoom In"
              className="p-1 text-[#cfc7b4] hover:bg-white/10 disabled:opacity-35 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => applyZoom(1)}
                title="Reset View"
                className="p-1 text-[#cfc7b4] hover:bg-white/10 border-l border-white/10 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Realistic Topographic SVG Map Viewport */}
      <div className="relative w-full aspect-[1000/660] rounded-xl overflow-hidden border border-[#d4a853]/30 bg-[#081523] shadow-inner">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className={`w-full h-full select-none ${
            zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          role="img"
          aria-label="Realistic Topographic Map of Three Kingdoms China (214 AD)"
        >
          <defs>
            {/* Deep Ocean Bathymetric Gradient */}
            <radialGradient id="oceanDepth" cx="78%" cy="55%" r="72%">
              <stop offset="0%" stopColor="#123047" />
              <stop offset="48%" stopColor="#0c2236" />
              <stop offset="100%" stopColor="#071320" />
            </radialGradient>

            {/* Physical Atlas Base Terrain Gradient (NW arid highland -> SE lush valleys) */}
            <linearGradient id="chinaTerrainBase" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#463d2f" />
              <stop offset="32%" stopColor="#3c3a2d" />
              <stop offset="65%" stopColor="#2c3a2d" />
              <stop offset="100%" stopColor="#23372d" />
            </linearGradient>

            {/* River Water Gradients */}
            <linearGradient id="yellowRiverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#869e9e" />
              <stop offset="50%" stopColor="#94a895" />
              <stop offset="100%" stopColor="#7ca3b0" />
            </linearGradient>
            <linearGradient id="yangtzeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2f85ad" />
              <stop offset="50%" stopColor="#3ea2cc" />
              <stop offset="100%" stopColor="#5cc0e4" />
            </linearGradient>

            {/* Lake Gradient */}
            <radialGradient id="lakeWater" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#4db6de" />
              <stop offset="100%" stopColor="#1f6185" />
            </radialGradient>

            {/* Dynamic Faction Territory Influence Gradients */}
            <radialGradient id="wash-wei" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.34" />
              <stop offset="60%" stopColor="#2563eb" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="wash-shu" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.34" />
              <stop offset="60%" stopColor="#059669" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="wash-wu" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.34" />
              <stop offset="60%" stopColor="#dc2626" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#b91c1c" stopOpacity="0" />
            </radialGradient>

            {/* Procedural Topographic Hillshade & Relief Micro-Texture */}
            <filter id="terrainRelief" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.025 0.036"
                numOctaves="5"
                seed="214"
                result="noise"
              />
              <feDiffuseLighting
                in="noise"
                lightingColor="#efe1be"
                surfaceScale="3.8"
                diffuseConstant="1.08"
                result="light"
              >
                <feDistantLight azimuth="225" elevation="42" />
              </feDiffuseLighting>
              <feColorMatrix
                type="matrix"
                in="light"
                values="0.62 0 0 0 0
                        0 0.58 0 0 0
                        0 0 0.48 0 0
                        0 0 0 0.36 0"
              />
            </filter>

            {/* Soft Ridge Slope Feathering */}
            <filter id="ridgeBlur" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>

            {/* Soft Elevation Zone Feathering */}
            <filter id="zoneBlur" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="16" />
            </filter>

            {/* Landmass Drop Shadow for Realistic Coastline Shelf */}
            <filter id="landShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="1.5" dy="2.5" stdDeviation="3.5" floodColor="#030911" floodOpacity="0.7" />
            </filter>

            {/* City Selection Glow */}
            <filter id="cityGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Circular clip path for miniature hero portraits on map */}
            <clipPath id="mapHeroPortraitClip" clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>

            {/* Clip Path for Natural Earth Landmass */}
            <clipPath id="chinaLandClip">
              {LAND_PATHS.map((d, i) => (
                <path key={`clip-${i}`} d={d} />
              ))}
            </clipPath>

            {/* Arrow Markers */}
            <marker
              id="arrowAttackReal"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#fb923c" />
            </marker>
            <marker
              id="arrowReinforceReal"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
          </defs>

          <g transform={viewTransform}>
            {/* 1. Ocean Base */}
            <rect x="-100" y="-100" width={MAP_WIDTH + 200} height={MAP_HEIGHT + 200} fill="url(#oceanDepth)" />

            {/* Subtle Ocean Bathymetric Contour Halos around Real Coastline */}
            <g fill="none" strokeLinejoin="round" strokeLinecap="round">
              {LAND_PATHS.map((d, i) => (
                <g key={`shelf-${i}`}>
                  <path d={d} stroke="#1d4c6b" strokeWidth="26" strokeOpacity="0.22" />
                  <path d={d} stroke="#2a688d" strokeWidth="12" strokeOpacity="0.28" />
                  <path d={d} stroke="#488cb0" strokeWidth="4" strokeOpacity="0.25" />
                </g>
              ))}
            </g>

            {/* Subtle Cartographic Lat/Lon Graticule over Ocean */}
            <g stroke="#7dd3fc" strokeOpacity="0.07" strokeWidth="0.8" strokeDasharray="3 5">
              {GRATICULE_LONS.map((g) => (
                <line key={g.label} x1={g.x} y1={0} x2={g.x} y2={MAP_HEIGHT} />
              ))}
              {GRATICULE_LATS.map((g) => (
                <line key={g.label} x1={0} y1={g.y} x2={MAP_WIDTH} y2={g.y} />
              ))}
            </g>

            {/* 2. Real Natural Earth 1:50m Landmass Base */}
            <g filter="url(#landShadow)">
              {LAND_PATHS.map((d, i) => (
                <path
                  key={`land-${i}`}
                  d={d}
                  fill="url(#chinaTerrainBase)"
                  stroke="#928362"
                  strokeOpacity="0.55"
                  strokeWidth="1.2"
                />
              ))}
            </g>

            {/* 3. Clipped Topographic Layers (Hypsometric Elevation + Relief Hillshade + Dynamic Faction Realms) */}
            <g clipPath="url(#chinaLandClip)">
              {/* Hypsometric Physical Relief Zones */}
              <g filter="url(#zoneBlur)">
                {ELEVATION_ZONES.map((zone) => {
                  const st = ELEVATION_STYLE[zone.kind];
                  return (
                    <path
                      key={zone.id}
                      d={zone.d}
                      fill={st.fill}
                      fillOpacity={st.opacity}
                    />
                  );
                })}
              </g>

              {/* Procedural Physical Hillshade Texture */}
              <rect
                x="0"
                y="0"
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                filter="url(#terrainRelief)"
                style={{ mixBlendMode: 'overlay' }}
              />

              {/* Dynamic Faction Territorial Control Influence Wash */}
              {showTerritory && (
                <g>
                  {cities
                    .filter((c) => c.owner !== 'neutral')
                    .map((city) => (
                      <circle
                        key={`wash-${city.id}`}
                        cx={city.x}
                        cy={city.y}
                        r={city.isCapital ? 132 : 108}
                        fill={`url(#wash-${city.owner})`}
                      />
                    ))}
                </g>
              )}

              {/* Subtle Inner Land Graticule */}
              <g stroke="#e6d6ae" strokeOpacity="0.06" strokeWidth="0.6">
                {GRATICULE_LONS.map((g) => (
                  <line key={`l-${g.label}`} x1={g.x} y1={0} x2={g.x} y2={MAP_HEIGHT} />
                ))}
                {GRATICULE_LATS.map((g) => (
                  <line key={`la-${g.label}`} x1={0} y1={g.y} x2={MAP_WIDTH} y2={g.y} />
                ))}
              </g>

              {/* Subtle Topographic Elevation Contour Lines */}
              <g fill="none" stroke="#d9c69e" strokeOpacity="0.14" strokeWidth="0.9" pointerEvents="none">
                {CONTOUR_PATHS.map((d, idx) => (
                  <path key={`contour-${idx}`} d={d} />
                ))}
              </g>

              {/* 4. Connected 3D Shaded Mountain Ridgelines (Organic Physical Relief) */}
              <g pointerEvents="none">
                {MOUNTAIN_RIDGES.map((ridge) => (
                  <g key={ridge.id}>
                    {/* Softly feathered sunlit NW flank & shadowed SE flank */}
                    <g filter="url(#ridgeBlur)">
                      <path
                        d={ridge.litPath}
                        fill={ridge.alpine ? '#b8a88d' : '#857456'}
                        fillOpacity={ridge.alpine ? 0.56 : 0.42}
                      />
                      <path
                        d={ridge.darkPath}
                        fill={ridge.alpine ? '#211c17' : '#1b1a15'}
                        fillOpacity={ridge.alpine ? 0.65 : 0.56}
                      />
                    </g>

                    {/* Branching Mountain Spur Hachures */}
                    <g fill="none" strokeLinecap="round">
                      {ridge.spurs.map((sp, sIdx) => (
                        <path
                          key={`${ridge.id}-sp-${sIdx}`}
                          d={sp.d}
                          stroke={
                            sp.side === 'lit'
                              ? ridge.alpine
                                ? '#d9ccb2'
                                : '#a69370'
                              : '#171612'
                          }
                          strokeOpacity={sp.side === 'lit' ? 0.36 : 0.44}
                          strokeWidth={ridge.alpine ? 1.5 : 1.15}
                        />
                      ))}
                    </g>

                    {/* Crisp Jagged Ridge Crest Highlight */}
                    <path
                      d={ridge.crestPath}
                      fill="none"
                      stroke={ridge.alpine ? '#ece5d3' : '#bfa982'}
                      strokeOpacity={ridge.alpine ? 0.62 : 0.36}
                      strokeWidth={ridge.alpine ? 1.6 : 1.15}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                ))}
              </g>

              {/* 5. Authentic River Network (Bank Shadow + Channel + Specular Shimmer) */}
              <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
                {RIVER_FEATURES.map((river) => {
                  const isYellow = river.id.includes('yellow') || river.id === 'wei-river' || river.id === 'fen-river';
                  return (
                    <g key={river.id}>
                      {/* River Valley Bank Shadow */}
                      <path
                        d={river.d}
                        stroke="#0a1622"
                        strokeOpacity="0.55"
                        strokeWidth={river.width + 2.4}
                      />
                      {/* Main Water Course */}
                      <path
                        d={river.d}
                        stroke={isYellow ? 'url(#yellowRiverGrad)' : 'url(#yangtzeGrad)'}
                        strokeOpacity={isYellow ? 0.82 : 0.88}
                        strokeWidth={river.width}
                      />
                      {/* Center Water Glint */}
                      <path
                        d={river.d}
                        stroke={isYellow ? '#d4d0b2' : '#bae6fd'}
                        strokeOpacity="0.32"
                        strokeWidth={Math.max(0.7, river.width * 0.28)}
                      />
                    </g>
                  );
                })}
              </g>

              {/* 6. Major Natural Lakes */}
              <g pointerEvents="none">
                {LAKE_FEATURES.map((lake) => (
                  <path
                    key={lake.id}
                    d={lake.d}
                    fill="url(#lakeWater)"
                    fillOpacity="0.82"
                    stroke="#93c5fd"
                    strokeOpacity="0.4"
                    strokeWidth="0.9"
                  />
                ))}
              </g>
            </g>

            {/* Crisp Coastline Rim Overlay */}
            <g fill="none" pointerEvents="none">
              {LAND_PATHS.map((d, i) => (
                <path
                  key={`coast-${i}`}
                  d={d}
                  stroke="#c9b485"
                  strokeOpacity="0.45"
                  strokeWidth="0.95"
                />
              ))}
            </g>

            {/* 7. Geographic Place Labels (Seas, Rivers, Mountains, Basins) */}
            {showGeoLabels && (
              <g pointerEvents="none">
                {GEO_LABELS.map((lbl, i) => {
                  const styleByKind = {
                    sea: {
                      fill: '#7dd3fc',
                      opacity: 0.42,
                      size: lang === 'zh' ? 13 : 10,
                      letterSpacing: '2.5',
                    },
                    region: {
                      fill: '#ebe0c5',
                      opacity: 0.24,
                      size: lang === 'zh' ? 14 : 11,
                      letterSpacing: '2',
                    },
                    mountain: {
                      fill: '#d6c39c',
                      opacity: 0.52,
                      size: lang === 'zh' ? 10.5 : 9,
                      letterSpacing: '1',
                    },
                    river: {
                      fill: '#bae6fd',
                      opacity: 0.62,
                      size: lang === 'zh' ? 10 : 8.5,
                      letterSpacing: '1',
                    },
                  }[lbl.kind];

                  return (
                    <text
                      key={`glbl-${i}`}
                      x={lbl.x}
                      y={lbl.y}
                      textAnchor="middle"
                      fill={styleByKind.fill}
                      fillOpacity={styleByKind.opacity}
                      fontSize={styleByKind.size}
                      letterSpacing={styleByKind.letterSpacing}
                      fontStyle={lbl.kind === 'sea' || lbl.kind === 'river' ? 'italic' : 'normal'}
                      className="font-seal"
                    >
                      {tLoc(lbl.text, lang)}
                    </text>
                  );
                })}
              </g>
            )}

            {/* 8. Curved Historical Campaign Roads & River Shipping Routes */}
            <g fill="none" strokeLinecap="round">
              {edges.map(({ a, b, isAdjacentToSelected, isRiverRoute }) => {
                const d = curvedRoadPath(a, b);
                return (
                  <g key={`road-${a.id}-${b.id}`}>
                    {/* Road Shadow Casing */}
                    <path
                      d={d}
                      stroke="#0a0e14"
                      strokeOpacity={isAdjacentToSelected ? 0.72 : 0.42}
                      strokeWidth={isAdjacentToSelected ? 4.4 : 2.8}
                    />
                    {/* Track Line */}
                    <path
                      d={d}
                      stroke={
                        isAdjacentToSelected
                          ? '#f0c665'
                          : isRiverRoute
                            ? '#7dd3fc'
                            : '#b8a27a'
                      }
                      strokeOpacity={isAdjacentToSelected ? 0.92 : 0.48}
                      strokeWidth={isAdjacentToSelected ? 2.1 : 1.3}
                      strokeDasharray={isAdjacentToSelected ? '6 4' : '4 4'}
                    />
                  </g>
                );
              })}
            </g>

            {/* 9. Animated Recent Campaign March Arrows */}
            <g fill="none">
              {state.recentMarches.slice(0, 3).map((march) => {
                const from = state.cities[march.fromCityId];
                const to = state.cities[march.toCityId];
                if (!from || !to) return null;
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dist = Math.hypot(dx, dy) || 1;
                const pad = 22;
                const sx = from.x + (dx / dist) * pad;
                const sy = from.y + (dy / dist) * pad;
                const ex = to.x - (dx / dist) * pad;
                const ey = to.y - (dy / dist) * pad;
                const mx = (sx + ex) / 2 - (dy / dist) * 14;
                const my = (sy + ey) / 2 + (dx / dist) * 14;
                return (
                  <path
                    key={march.id}
                    d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
                    stroke={march.type === 'attack' ? '#fb923c' : '#38bdf8'}
                    strokeWidth="3"
                    strokeDasharray="7 5"
                    className="animate-march-line"
                    markerEnd={
                      march.type === 'attack'
                        ? 'url(#arrowAttackReal)'
                        : 'url(#arrowReinforceReal)'
                    }
                  />
                );
              })}
            </g>

            {/* 10. Realistic Fortified Chinese Citadel / Capital City Markers */}
            {cities.map((city) => {
              const palette = FACTION_PALETTE[city.owner];
              const isSelected = city.id === selectedCityId;
              const isHovered = city.id === hoveredCityId;
              const isAdjacent = Boolean(selectedCity?.neighbors.includes(city.id));
              const generals = getCityGenerals(state, city.id);
              const wanderingHere = getCityWanderingHeroes(state, city.id);

              return (
                <g
                  key={city.id}
                  transform={`translate(${city.x}, ${city.y})`}
                  onClick={() => {
                    if (!dragStart.current.moved) onSelectCity(city.id);
                  }}
                  onMouseEnter={() => setHoveredCityId(city.id)}
                  onMouseLeave={() => setHoveredCityId((prev) => (prev === city.id ? null : prev))}
                  className="cursor-pointer"
                >
                  {/* Selection / Target Pulse Halo */}
                  {isSelected && (
                    <circle
                      r="27"
                      fill="none"
                      stroke="#f7e7be"
                      strokeWidth="2.2"
                      className="animate-city-ring"
                    />
                  )}
                  {!isSelected && isAdjacent && (
                    <circle
                      r="23"
                      fill="none"
                      stroke={city.owner === state.playerFaction ? '#38bdf8' : '#fb923c'}
                      strokeWidth="1.9"
                      strokeDasharray="4 3"
                      strokeOpacity="0.88"
                    />
                  )}

                  {/* Ground Contact Shadow */}
                  <ellipse cx="0" cy="8" rx="18" ry="8" fill="#06090e" fillOpacity="0.65" />

                  {/* Citadel Base Plate */}
                  <g
                    transform={isHovered || isSelected ? 'scale(1.08)' : 'scale(1)'}
                    style={{ transition: 'transform 160ms ease' }}
                    filter={isSelected ? 'url(#cityGlow)' : undefined}
                  >
                    {/* Outer Walled Rampart Ring */}
                    <circle
                      r={city.isCapital ? 17.5 : 14.5}
                      fill="#121720"
                      stroke={isSelected ? '#f7e7be' : palette.fill}
                      strokeWidth={isSelected ? 2.8 : 2.3}
                    />
                    <circle
                      r={city.isCapital ? 13.5 : 11}
                      fill={palette.fill}
                      fillOpacity="0.9"
                    />

                    {/* Fortified Gatehouse / Imperial Pagoda Roof Silhouette */}
                    {city.isCapital ? (
                      <g fill="#fdf6e3" stroke="#1e293b" strokeWidth="0.6">
                        {/* Upper eaves */}
                        <path d="M -8 -3 Q 0 -10 8 -3 L 5 -1 L -5 -1 Z" />
                        {/* Lower eaves */}
                        <path d="M -10 2 Q 0 -4 10 2 L 7 4 L -7 4 Z" />
                        {/* Citadel stone wall base */}
                        <rect x="-7" y="4" width="14" height="5" rx="0.8" />
                        <rect x="-2" y="5.8" width="4" height="3.2" fill="#1e293b" />
                      </g>
                    ) : (
                      <g fill="#f8f2e2" stroke="#1e293b" strokeWidth="0.5">
                        {/* Battlement crenellations */}
                        <path d="M -7 -1 L -7 -4 L -4 -4 L -4 -2 L -1.5 -2 L -1.5 -4 L 1.5 -4 L 1.5 -2 L 4 -2 L 4 -4 L 7 -4 L 7 -1 Z" />
                        {/* Fortress wall body */}
                        <rect x="-7" y="-1" width="14" height="7" rx="0.8" />
                        {/* Arched gate */}
                        <path d="M -2.2 6 L -2.2 2.2 A 2.2 2.2 0 0 1 2.2 2.2 L 2.2 6 Z" fill="#1e293b" />
                      </g>
                    )}

                    {/* Faction Pennant Flag */}
                    <g transform={`translate(${city.isCapital ? 13 : 11}, ${city.isCapital ? -15 : -13})`}>
                      <line x1="0" y1="0" x2="0" y2="14" stroke="#e2d4b0" strokeWidth="1.2" />
                      <path
                        d="M 0 0 L 12 2.5 L 9.5 5.5 L 12 8.5 L 0 9.5 Z"
                        fill={palette.fill}
                        stroke={palette.stroke}
                        strokeWidth="0.6"
                      />
                      <text
                        x="5.2"
                        y="7.2"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="6.8"
                        fontWeight="800"
                        className="font-seal pointer-events-none"
                      >
                        {palette.badge}
                      </text>
                    </g>

                    {/* Stationed Hero Painted Portrait Medallions (up to 2 around top-left/left) */}
                    {generals.slice(0, 2).map((gen, gIdx) => {
                      const gx = gIdx === 0 ? -18 : -24;
                      const gy = gIdx === 0 ? -14 : 4;
                      return (
                        <g
                          key={gen.id}
                          transform={`translate(${gx}, ${gy})`}
                          onClick={(e) => {
                            if (onInspectHero && !dragStart.current.moved) {
                              e.stopPropagation();
                              onInspectHero(gen.id);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <circle r="10.5" fill="#0d1118" stroke="#d4a853" strokeWidth="1.4" />
                          <image
                            href={gen.portrait}
                            x="-9.5"
                            y="-9.5"
                            width="19"
                            height="19"
                            preserveAspectRatio="xMidYMin slice"
                            clipPath="url(#mapHeroPortraitClip)"
                          />
                        </g>
                      );
                    })}

                    {/* Wandering Legendary Hero Golden Beacon (bottom-right of citadel) */}
                    {wanderingHere.length > 0 && (
                      <g
                        transform="translate(20, 4)"
                        onClick={(e) => {
                          if (onInspectHero && !dragStart.current.moved) {
                            e.stopPropagation();
                            onInspectHero(wanderingHere[0].id);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          r="12"
                          fill="none"
                          stroke="#facc15"
                          strokeWidth="1.4"
                          strokeOpacity="0.85"
                          className="animate-city-ring"
                        />
                        <circle r="9.5" fill="#1a150a" stroke="#facc15" strokeWidth="1.4" />
                        <image
                          href={wanderingHere[0].portrait}
                          x="-8.5"
                          y="-8.5"
                          width="17"
                          height="17"
                          preserveAspectRatio="xMidYMin slice"
                          clipPath="url(#mapHeroPortraitClip)"
                        />
                      </g>
                    )}
                  </g>

                  {/* City Nameplate + Troop Banner */}
                  <g transform="translate(0, 24)">
                    <rect
                      x="-39"
                      y="-9"
                      width="78"
                      height="16"
                      rx="3.5"
                      fill="#0b1017"
                      fillOpacity="0.9"
                      stroke={isSelected ? '#f0c665' : palette.stroke}
                      strokeOpacity={isSelected ? 0.95 : 0.4}
                      strokeWidth="0.95"
                    />
                    <text
                      y="2.2"
                      textAnchor="middle"
                      fill="#f7efe0"
                      fontSize="10.2"
                      fontWeight="700"
                      className="pointer-events-none"
                    >
                      {tLoc(city.name, lang)}
                    </text>
                  </g>

                  <g transform="translate(0, 38.5)">
                    <rect
                      x="-24"
                      y="-6"
                      width="48"
                      height="12"
                      rx="6"
                      fill={palette.fill}
                      fillOpacity="0.94"
                      stroke="#0a0e14"
                      strokeWidth="0.7"
                    />
                    <text
                      y="2.5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="8.6"
                      fontWeight="700"
                      className="pointer-events-none"
                    >
                      {(city.troops / 1000).toFixed(1)}k
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* Fixed Map Frame Chrome (Graticule Edge Labels, Compass Rose, Scale Bar, Cartographer Seal) */}
          <g pointerEvents="none">
            {/* Coordinate Edge Ticks */}
            {GRATICULE_LONS.map((g) => (
              <text
                key={`tick-lon-${g.label}`}
                x={g.x}
                y={14}
                textAnchor="middle"
                fill="#d4a853"
                fillOpacity="0.48"
                fontSize="8.5"
                fontFamily="monospace"
              >
                {g.label}
              </text>
            ))}
            {GRATICULE_LATS.map((g) => (
              <text
                key={`tick-lat-${g.label}`}
                x={18}
                y={g.y + 3}
                textAnchor="start"
                fill="#d4a853"
                fillOpacity="0.48"
                fontSize="8.5"
                fontFamily="monospace"
              >
                {g.label}
              </text>
            ))}

            {/* Compass Rose (bottom-left) */}
            <g transform="translate(56, 598)" opacity="0.78">
              <circle r="22" fill="#0b131e" fillOpacity="0.75" stroke="#d4a853" strokeOpacity="0.45" strokeWidth="1" />
              <polygon points="0,-16 4,-2 0,-5 -4,-2" fill="#d4a853" />
              <polygon points="0,16 4,2 0,5 -4,2" fill="#94a3b8" />
              <polygon points="16,0 2,4 5,0 2,-4" fill="#94a3b8" />
              <polygon points="-16,0 -2,4 -5,0 -2,-4" fill="#94a3b8" />
              <text y="-25" textAnchor="middle" fill="#e6cfa0" fontSize="8.5" fontWeight="700">
                {lang === 'zh' ? '北' : 'N'}
              </text>
            </g>

            {/* Geographic Scale Bar (bottom-left beside compass) */}
            <g transform="translate(96, 610)" opacity="0.82">
              <rect x="0" y="-12" width="110" height="20" rx="4" fill="#0b131e" fillOpacity="0.72" />
              <line x1="10" y1="0" x2="96" y2="0" stroke="#e6cfa0" strokeWidth="1.5" />
              <line x1="10" y1="-4" x2="10" y2="3" stroke="#e6cfa0" strokeWidth="1.2" />
              <line x1="53" y1="-3" x2="53" y2="3" stroke="#e6cfa0" strokeWidth="1" />
              <line x1="96" y1="-4" x2="96" y2="3" stroke="#e6cfa0" strokeWidth="1.2" />
              <text x="53" y="-4" textAnchor="middle" fill="#e6cfa0" fontSize="8" fontFamily="monospace">
                {lang === 'zh' ? '500 里 · 250 km' : '250 km · 500 Li'}
              </text>
            </g>

            {/* Vermilion Seal Stamp (bottom-right) */}
            <g transform="translate(946, 608)">
              <rect
                x="-24"
                y="-24"
                width="48"
                height="48"
                rx="5"
                fill="#7f1d1d"
                fillOpacity="0.34"
                stroke="#c84b31"
                strokeOpacity="0.75"
                strokeWidth="1.4"
              />
              <text
                y="-4"
                textAnchor="middle"
                fill="#fca5a5"
                fontSize="12.5"
                fontWeight="800"
                className="font-seal"
              >
                三国
              </text>
              <text
                y="13"
                textAnchor="middle"
                fill="#fca5a5"
                fontSize="12.5"
                fontWeight="800"
                className="font-seal"
              >
                舆图
              </text>
            </g>
          </g>
        </svg>

        {/* Floating City Inspector Tooltip on Hover */}
        {hoveredCity && (
          <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-xl bg-[#0b1018]/92 border border-[#d4a853]/45 px-3.5 py-2.5 shadow-2xl backdrop-blur-md text-xs max-w-[240px]">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-display font-bold text-sm text-[#f7efe0]">
                {tLoc(hoveredCity.name, lang)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#d4a853]">
                {tLoc(TERRAIN_TEXT[hoveredCity.terrain], lang)}
              </span>
            </div>
            <div className="text-[11px] text-[#b8b2a2] space-y-0.5">
              <div>
                {lang === 'zh' ? '兵力' : 'Garrison'}:{' '}
                <span className="text-white font-semibold">
                  {hoveredCity.troops.toLocaleString()}
                </span>
              </div>
              <div>
                {lang === 'zh' ? '城防' : 'Defense'} Lv.{hoveredCity.defense} ·{' '}
                {lang === 'zh' ? '繁荣' : 'Prosperity'} Lv.{hoveredCity.development}
              </div>
              {hoveredGenerals.length > 0 && (
                <div className="text-[#f0c665] pt-0.5">
                  {lang === 'zh' ? '驻将：' : 'Generals: '}
                  {hoveredGenerals.map((g) => tLoc(g.name, lang)).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subtle Zoom Hint */}
        {zoom === 1 && (
          <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 text-[10px] text-[#cbd5e1]/75 bg-[#0b1018]/70 px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5">
            <Compass className="w-3 h-3 text-[#d4a853]/85" />
            <span>{lang === 'zh' ? '滚轮缩放 · 拖动浏览' : 'Scroll to zoom · Drag to pan'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
