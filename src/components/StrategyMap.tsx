import { useRef, useState } from 'react';
import {
  Box,
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
  {
    fill: string;
    roofLight: string;
    roofDark: string;
    stroke: string;
    badge: string;
  }
> = {
  wei: {
    fill: '#3b82f6',
    roofLight: '#60a5fa',
    roofDark: '#1d4ed8',
    stroke: '#93c5fd',
    badge: '魏',
  },
  shu: {
    fill: '#10b981',
    roofLight: '#34d399',
    roofDark: '#047857',
    stroke: '#6ee7b7',
    badge: '蜀',
  },
  wu: {
    fill: '#f43f5e',
    roofLight: '#fb7185',
    roofDark: '#be123c',
    stroke: '#fda4af',
    badge: '吴',
  },
  neutral: {
    fill: '#94a3b8',
    roofLight: '#cbd5e1',
    roofDark: '#475569',
    stroke: '#e2e8f0',
    badge: '群',
  },
};

const ELEVATION_STYLE: Record<
  (typeof ELEVATION_ZONES)[number]['kind'],
  { fill: string; opacity: number }
> = {
  alpine: { fill: '#64748b', opacity: 0.52 },
  plateau: { fill: '#7c6a52', opacity: 0.42 },
  mountain: { fill: '#4b5563', opacity: 0.5 },
  basin: { fill: '#155e4b', opacity: 0.52 },
  plain: { fill: '#1e4d40', opacity: 0.48 },
  hills: { fill: '#16423c', opacity: 0.46 },
};

function curvedRoadPath(a: City, b: City): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
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

  const [is3D, setIs3D] = useState(true);
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

  const handlePointerUp = () => setIsDragging(false);

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
    <div className="ink-panel rounded-2xl p-2.5 sm:p-3.5 relative overflow-hidden flex flex-col">
      {/* Modern Glass Map Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2.5 text-xs">
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
                  className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20"
                  style={{ backgroundColor: FACTION_PALETTE[fid].fill }}
                />
                <span className="text-slate-200 font-medium">
                  {label} ({count})
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIs3D((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
              is3D
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>{is3D ? (lang === 'zh' ? '3D 立体' : '3D Tilt') : '2D'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTerritory((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
              showTerritory
                ? 'bg-indigo-500/20 border-indigo-400/45 text-indigo-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{lang === 'zh' ? '势力版图' : 'Realms'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGeoLabels((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
              showGeoLabels
                ? 'bg-indigo-500/20 border-indigo-400/45 text-indigo-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <MapIcon className="w-3 h-3" />
            <span>{lang === 'zh' ? '山川地名' : 'Geography'}</span>
          </button>

          <div className="flex items-center rounded-lg border border-slate-700/80 bg-slate-900/80 overflow-hidden ml-0.5">
            <button
              type="button"
              onClick={() => applyZoom(zoom - 0.3)}
              disabled={zoom <= 1}
              className="p-1 text-slate-300 hover:bg-white/10 disabled:opacity-35 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[10px] font-mono text-cyan-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => applyZoom(zoom + 0.3)}
              disabled={zoom >= 2.4}
              className="p-1 text-slate-300 hover:bg-white/10 disabled:opacity-35 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => applyZoom(1)}
                className="p-1 text-slate-300 hover:bg-white/10 border-l border-slate-700 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3D Perspective Tabletop Stage */}
      <div className="relative w-full aspect-[1000/660] rounded-xl overflow-hidden border border-cyan-500/25 bg-[radial-gradient(ellipse_at_center,#0f2947_0%,#071526_70%,#040b16_100%)] shadow-[inset_0_0_50px_rgba(2,6,23,0.9)] map-3d-stage">
        <div
          className={`w-full h-full map-3d-surface ${
            is3D ? 'rounded-xl overflow-hidden ring-1 ring-cyan-400/35 shadow-[0_24px_48px_rgba(2,6,23,0.85)]' : ''
          }`}
          style={{
            transform: is3D
              ? 'rotateX(20deg) scale(0.95) translateY(-1%)'
              : 'rotateX(0deg) scale(1)',
          }}
        >
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
            aria-label="3D Relief Strategic Map of Three Kingdoms China (214 AD)"
          >
            <defs>
              {/* Luminous Modern Sapphire Ocean */}
              <radialGradient id="modernOcean" cx="76%" cy="52%" r="74%">
                <stop offset="0%" stopColor="#12456e" />
                <stop offset="45%" stopColor="#0c2f4f" />
                <stop offset="100%" stopColor="#06172b" />
              </radialGradient>

              {/* Modern Physical Relief Land Gradient */}
              <linearGradient id="modernLandBase" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3c4648" />
                <stop offset="32%" stopColor="#2f413f" />
                <stop offset="68%" stopColor="#213d3a" />
                <stop offset="100%" stopColor="#193335" />
              </linearGradient>

              {/* Vibrant 3D River Water Gradients */}
              <linearGradient id="yellowRiver3D" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="45%" stopColor="#5ec2b7" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <linearGradient id="yangtze3D" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#7dd3fc" />
              </linearGradient>

              {/* Glossy 3D Lake Basin */}
              <radialGradient id="lake3D" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="55%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#0369a1" />
              </radialGradient>

              {/* Dynamic Faction Influence Glows */}
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
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.34" />
                <stop offset="60%" stopColor="#e11d48" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#be123c" stopOpacity="0" />
              </radialGradient>

              {/* Crisp 3D Terrain Micro-Hillshade */}
              <filter id="terrainRelief3D" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.024 0.036"
                  numOctaves="5"
                  seed="214"
                  result="noise"
                />
                <feDiffuseLighting
                  in="noise"
                  lightingColor="#e2f1ff"
                  surfaceScale="4.2"
                  diffuseConstant="1.15"
                  result="light"
                >
                  <feDistantLight azimuth="225" elevation="40" />
                </feDiffuseLighting>
                <feColorMatrix
                  type="matrix"
                  in="light"
                  values="0.58 0 0 0 0
                          0 0.62 0 0 0
                          0 0 0.65 0 0
                          0 0 0 0.34 0"
                />
              </filter>

              <filter id="zoneBlur3D" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              <filter id="ridgeBlur3D" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
              <filter id="cityGlow3D" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Circular Hero Portrait Clip */}
              <clipPath id="mapHeroPortraitClip" clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r="0.5" />
              </clipPath>

              {/* Natural Earth Landmass Clip */}
              <clipPath id="chinaLandClip3D">
                {LAND_PATHS.map((d, i) => (
                  <path key={`clip3d-${i}`} d={d} />
                ))}
              </clipPath>

              <marker
                id="arrowAttack3D"
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
                id="arrowReinforce3D"
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
              {/* 1. Luminous Deep Ocean */}
              <rect
                x="-120"
                y="-120"
                width={MAP_WIDTH + 240}
                height={MAP_HEIGHT + 240}
                fill="url(#modernOcean)"
              />

              {/* Continental Shelf Bathymetric Rings */}
              <g fill="none" strokeLinejoin="round" strokeLinecap="round">
                {LAND_PATHS.map((d, i) => (
                  <g key={`shelf3d-${i}`}>
                    <path d={d} stroke="#0ea5e9" strokeWidth="34" strokeOpacity="0.1" />
                    <path d={d} stroke="#38bdf8" strokeWidth="16" strokeOpacity="0.18" />
                    <path d={d} stroke="#7dd3fc" strokeWidth="5.5" strokeOpacity="0.26" />
                  </g>
                ))}
              </g>

              {/* Subtle Holographic Lat/Lon Grid over Ocean */}
              <g stroke="#38bdf8" strokeOpacity="0.09" strokeWidth="0.8" strokeDasharray="3 6">
                {GRATICULE_LONS.map((g) => (
                  <line key={g.label} x1={g.x} y1={0} x2={g.x} y2={MAP_HEIGHT} />
                ))}
                {GRATICULE_LATS.map((g) => (
                  <line key={g.label} x1={0} y1={g.y} x2={MAP_WIDTH} y2={g.y} />
                ))}
              </g>

              {/* 2. 3D CONTINENTAL EXTRUSION (Raised Tabletop Bedrock Cliff Walls!) */}
              <g pointerEvents="none">
                {/* Deep Cast Ocean Shadow */}
                <g transform="translate(5, 13)">
                  {LAND_PATHS.map((d, i) => (
                    <path key={`cast-${i}`} d={d} fill="#020610" fillOpacity="0.65" />
                  ))}
                </g>
                {/* Lower Basalt Cliff Layer */}
                <g transform="translate(0, 8.5)">
                  {LAND_PATHS.map((d, i) => (
                    <path key={`cliff2-${i}`} d={d} fill="#0f1e2e" stroke="#08111c" strokeWidth="1" />
                  ))}
                </g>
                {/* Upper Coastal Cliff Wall */}
                <g transform="translate(0, 4.5)">
                  {LAND_PATHS.map((d, i) => (
                    <path key={`cliff1-${i}`} d={d} fill="#1f3142" stroke="#132231" strokeWidth="1" />
                  ))}
                </g>
              </g>

              {/* 3. Main Raised Continental Surface */}
              <g>
                {LAND_PATHS.map((d, i) => (
                  <path
                    key={`land3d-${i}`}
                    d={d}
                    fill="url(#modernLandBase)"
                    stroke="#67e8f9"
                    strokeOpacity="0.32"
                    strokeWidth="1.2"
                  />
                ))}
              </g>

              {/* 4. Clipped 3D Physical Relief, Elevation Zones, Mountains, Rivers & Lakes */}
              <g clipPath="url(#chinaLandClip3D)">
                {/* Hypsometric Elevation Biomes */}
                <g filter="url(#zoneBlur3D)">
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
                  filter="url(#terrainRelief3D)"
                  style={{ mixBlendMode: 'overlay' }}
                />

                {/* Dynamic Kingdom Territory Glow Wash */}
                {showTerritory && (
                  <g>
                    {cities
                      .filter((c) => c.owner !== 'neutral')
                      .map((city) => (
                        <circle
                          key={`wash3d-${city.id}`}
                          cx={city.x}
                          cy={city.y}
                          r={city.isCapital ? 135 : 110}
                          fill={`url(#wash-${city.owner})`}
                        />
                      ))}
                  </g>
                )}

                {/* Topographic Contour Lines */}
                <g fill="none" stroke="#94a3b8" strokeOpacity="0.16" strokeWidth="0.9" pointerEvents="none">
                  {CONTOUR_PATHS.map((d, idx) => (
                    <path key={`c3d-${idx}`} d={d} />
                  ))}
                </g>

                {/* 3D Extruded Mountain Ridgelines with Deep SE Cast Shadows */}
                <g pointerEvents="none">
                  {MOUNTAIN_RIDGES.map((ridge) => (
                    <g key={ridge.id}>
                      {/* Deep cast valley shadow */}
                      <g transform="translate(3.5, 4.5)" filter="url(#ridgeBlur3D)">
                        <path d={ridge.darkPath} fill="#040812" fillOpacity="0.48" />
                      </g>
                      {/* Sunlit NW & Shadowed SE Mountain Slopes */}
                      <g filter="url(#ridgeBlur3D)">
                        <path
                          d={ridge.litPath}
                          fill={ridge.alpine ? '#cbd5e1' : '#809190'}
                          fillOpacity={ridge.alpine ? 0.58 : 0.42}
                        />
                        <path
                          d={ridge.darkPath}
                          fill={ridge.alpine ? '#1e293b' : '#131d26'}
                          fillOpacity={ridge.alpine ? 0.72 : 0.62}
                        />
                      </g>
                      {/* Sculpted Spur Ribs */}
                      <g fill="none" strokeLinecap="round">
                        {ridge.spurs.map((sp, sIdx) => (
                          <path
                            key={`${ridge.id}-sp3d-${sIdx}`}
                            d={sp.d}
                            stroke={
                              sp.side === 'lit'
                                ? ridge.alpine
                                  ? '#f1f5f9'
                                  : '#94a3b8'
                                : '#0b121c'
                            }
                            strokeOpacity={sp.side === 'lit' ? 0.44 : 0.48}
                            strokeWidth={ridge.alpine ? 1.65 : 1.25}
                          />
                        ))}
                      </g>
                      {/* Bright Alpine Snow / Ridge Crest */}
                      <path
                        d={ridge.crestPath}
                        fill="none"
                        stroke={ridge.alpine ? '#f8fafc' : '#cbd5e1'}
                        strokeOpacity={ridge.alpine ? 0.78 : 0.42}
                        strokeWidth={ridge.alpine ? 2.1 : 1.3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  ))}
                </g>

                {/* 5. 3D CARVED ANIMATED RIVER NETWORK */}
                <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
                  {RIVER_FEATURES.map((river) => {
                    const isYellow =
                      river.id.includes('yellow') ||
                      river.id === 'wei-river' ||
                      river.id === 'fen-river';
                    return (
                      <g key={river.id}>
                        {/* Recessed 3D Riverbed Canyon Wall (North Shadow) */}
                        <path
                          d={river.d}
                          transform="translate(0, -1)"
                          stroke="#040c18"
                          strokeOpacity="0.72"
                          strokeWidth={river.width + 3.2}
                        />
                        {/* Sunlit South Bank Rim Bevel */}
                        <path
                          d={river.d}
                          transform="translate(0, 1.4)"
                          stroke="#67e8f9"
                          strokeOpacity="0.22"
                          strokeWidth={river.width + 1.4}
                        />
                        {/* Main Vibrant Water Channel */}
                        <path
                          d={river.d}
                          stroke={isYellow ? 'url(#yellowRiver3D)' : 'url(#yangtze3D)'}
                          strokeOpacity="0.92"
                          strokeWidth={river.width}
                        />
                        {/* Animated Flowing Current Shimmer */}
                        <path
                          d={river.d}
                          stroke={isYellow ? '#fef3c7' : '#e0f2fe'}
                          strokeOpacity="0.52"
                          strokeWidth={Math.max(0.9, river.width * 0.34)}
                          strokeDasharray="6 12"
                          className="animate-river-flow"
                        />
                      </g>
                    );
                  })}
                </g>

                {/* 6. 3D Recessed Natural Lakes with Water Glint */}
                <g pointerEvents="none">
                  {LAKE_FEATURES.map((lake) => (
                    <g key={lake.id}>
                      <path
                        d={lake.d}
                        transform="translate(0, -1.2)"
                        fill="#040c18"
                        fillOpacity="0.6"
                      />
                      <path
                        d={lake.d}
                        fill="url(#lake3D)"
                        fillOpacity="0.9"
                        stroke="#bae6fd"
                        strokeOpacity="0.55"
                        strokeWidth="1.1"
                      />
                    </g>
                  ))}
                </g>
              </g>

              {/* Crisp Luminous Coastline Highlight */}
              <g fill="none" pointerEvents="none">
                {LAND_PATHS.map((d, i) => (
                  <path
                    key={`rim3d-${i}`}
                    d={d}
                    stroke="#bae6fd"
                    strokeOpacity="0.38"
                    strokeWidth="1.1"
                  />
                ))}
              </g>

              {/* 7. Geographic Labels */}
              {showGeoLabels && (
                <g pointerEvents="none">
                  {GEO_LABELS.map((lbl, i) => {
                    const styleByKind = {
                      sea: { fill: '#7dd3fc', opacity: 0.48, size: lang === 'zh' ? 13 : 10, ls: '2.5' },
                      region: { fill: '#e2e8f0', opacity: 0.24, size: lang === 'zh' ? 14 : 11, ls: '2' },
                      mountain: { fill: '#cbd5e1', opacity: 0.54, size: lang === 'zh' ? 10.5 : 9, ls: '1' },
                      river: { fill: '#bae6fd', opacity: 0.72, size: lang === 'zh' ? 10 : 8.5, ls: '1' },
                    }[lbl.kind];

                    return (
                      <text
                        key={`glbl3d-${i}`}
                        x={lbl.x}
                        y={lbl.y}
                        textAnchor="middle"
                        fill={styleByKind.fill}
                        fillOpacity={styleByKind.opacity}
                        fontSize={styleByKind.size}
                        letterSpacing={styleByKind.ls}
                        fontStyle={lbl.kind === 'sea' || lbl.kind === 'river' ? 'italic' : 'normal'}
                        className="font-seal"
                      >
                        {tLoc(lbl.text, lang)}
                      </text>
                    );
                  })}
                </g>
              )}

              {/* 8. Curved Elevated Campaign Supply Routes */}
              <g fill="none" strokeLinecap="round">
                {edges.map(({ a, b, isAdjacentToSelected, isRiverRoute }) => {
                  const d = curvedRoadPath(a, b);
                  return (
                    <g key={`road3d-${a.id}-${b.id}`}>
                      <path
                        d={d}
                        stroke="#020617"
                        strokeOpacity={isAdjacentToSelected ? 0.75 : 0.45}
                        strokeWidth={isAdjacentToSelected ? 4.6 : 2.8}
                      />
                      <path
                        d={d}
                        stroke={
                          isAdjacentToSelected
                            ? '#38bdf8'
                            : isRiverRoute
                              ? '#7dd3fc'
                              : '#cbd5e1'
                        }
                        strokeOpacity={isAdjacentToSelected ? 0.95 : 0.36}
                        strokeWidth={isAdjacentToSelected ? 2.2 : 1.25}
                        strokeDasharray={isAdjacentToSelected ? '7 4' : '4 5'}
                      />
                    </g>
                  );
                })}
              </g>

              {/* 9. Animated Campaign March Arcs */}
              <g fill="none">
                {state.recentMarches.slice(0, 3).map((march) => {
                  const from = state.cities[march.fromCityId];
                  const to = state.cities[march.toCityId];
                  if (!from || !to) return null;
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const dist = Math.hypot(dx, dy) || 1;
                  const pad = 24;
                  const sx = from.x + (dx / dist) * pad;
                  const sy = from.y + (dy / dist) * pad;
                  const ex = to.x - (dx / dist) * pad;
                  const ey = to.y - (dy / dist) * pad;
                  const mx = (sx + ex) / 2 - (dy / dist) * 16;
                  const my = (sy + ey) / 2 + (dx / dist) * 16;
                  return (
                    <path
                      key={march.id}
                      d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
                      stroke={march.type === 'attack' ? '#fb923c' : '#38bdf8'}
                      strokeWidth="3.2"
                      strokeDasharray="7 5"
                      className="animate-march-line"
                      markerEnd={
                        march.type === 'attack'
                          ? 'url(#arrowAttack3D)'
                          : 'url(#arrowReinforce3D)'
                      }
                    />
                  );
                })}
              </g>

              {/* 10. 3D ISOMETRIC CHINESE CITADELS & IMPERIAL PALACE CITIES */}
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
                    {/* Glowing Ground Tactical Ring */}
                    {isSelected && (
                      <ellipse
                        cx="0"
                        cy="6"
                        rx="30"
                        ry="17"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.4"
                        className="animate-city-ring"
                      />
                    )}
                    {!isSelected && isAdjacent && (
                      <ellipse
                        cx="0"
                        cy="6"
                        rx="26"
                        ry="15"
                        fill="none"
                        stroke={city.owner === state.playerFaction ? '#38bdf8' : '#fb923c'}
                        strokeWidth="2"
                        strokeDasharray="5 3"
                        strokeOpacity="0.9"
                      />
                    )}

                    {/* Ambient Cast Ground Shadow */}
                    <ellipse cx="4" cy="9" rx={city.isCapital ? 24 : 20} ry={city.isCapital ? 12 : 10} fill="#020617" fillOpacity="0.68" />

                    {/* 3D Isometric Fortress / Palace Model */}
                    <g
                      transform={isHovered || isSelected ? 'translate(0, -3) scale(1.09)' : 'translate(0, 0) scale(1)'}
                      style={{ transition: 'transform 180ms ease' }}
                      filter={isSelected ? 'url(#cityGlow3D)' : undefined}
                    >
                      {/* 3D Stepped Isometric Stone Plinth */}
                      <polygon
                        points="-18,4 0,13 18,4 0,-5"
                        fill="#334155"
                        stroke={palette.stroke}
                        strokeOpacity="0.55"
                        strokeWidth="0.9"
                      />
                      {/* Left Sunlit Plinth Wall */}
                      <polygon points="-18,4 0,13 0,18 -18,9" fill="#64748b" />
                      {/* Right Shadowed Plinth Wall */}
                      <polygon points="0,13 18,4 18,9 0,18" fill="#1e293b" />

                      {/* Main Fortress Inner Wall Box (3D Extruded) */}
                      {/* Left sunlit wall */}
                      <polygon points="-13,1 0,8 0,-2 -13,-9" fill="#cbd5e1" />
                      {/* Right shadowed wall */}
                      <polygon points="0,8 13,1 13,-9 0,-2" fill="#475569" />
                      {/* Top courtyard floor */}
                      <polygon points="-13,-9 0,-2 13,-9 0,-16" fill="#94a3b8" />
                      {/* Arched dark city gate on left sunlit face */}
                      <path d="M -8.5 3.2 L -8.5 -0.8 Q -6.2 -2.2 -4 0.5 L -4 5.5 Z" fill="#0f172a" />

                      {/* Extra 3D Corner Watchtowers for High-Defense Fortresses (Def >= 4) */}
                      {city.defense >= 4 && (
                        <g>
                          <polygon points="-17,-4 -13,-2 -13,-11 -17,-13" fill="#e2e8f0" />
                          <polygon points="-13,-2 -10,-4 -10,-13 -13,-11" fill="#475569" />
                          <polygon points="-18,-12 -13.5,-16.5 -9,-12 -13.5,-10" fill={palette.roofLight} />
                          <polygon points="10,-4 13,-2 13,-11 10,-13" fill="#cbd5e1" />
                          <polygon points="13,-2 17,-4 17,-13 13,-11" fill="#334155" />
                          <polygon points="9,-12 13.5,-16.5 18,-12 13.5,-10" fill={palette.roofDark} />
                        </g>
                      )}

                      {/* 3D Glazed Sloped Pagoda Roofs (Tiered Imperial Palace for Capitals!) */}
                      {city.isCapital ? (
                        <g>
                          {/* Lower Palace Tier Roof */}
                          <polygon points="-16,-8 0,0 0,-12 -15,-14" fill={palette.roofLight} stroke="#f8fafc" strokeOpacity="0.35" strokeWidth="0.5" />
                          <polygon points="0,0 16,-8 15,-14 0,-12" fill={palette.roofDark} />
                          {/* Upper Imperial Pagoda Body */}
                          <polygon points="-8,-13 0,-9 0,-17 -8,-21" fill="#f1f5f9" />
                          <polygon points="0,-9 8,-13 8,-21 0,-17" fill="#64748b" />
                          {/* Upper Swept Golden-Trimmed Eaves */}
                          <polygon points="-12,-19 0,-13 0,-26" fill={palette.roofLight} stroke="#fef08a" strokeWidth="0.7" />
                          <polygon points="0,-13 12,-19 0,-26" fill={palette.roofDark} stroke="#fef08a" strokeOpacity="0.6" strokeWidth="0.6" />
                          {/* Golden Imperial Spire */}
                          <circle cx="0" cy="-27" r="2.2" fill="#facc15" />
                        </g>
                      ) : (
                        <g>
                          {/* Citadel Gatehouse Swept Roof */}
                          <polygon points="-15,-9 0,-2 0,-17" fill={palette.roofLight} stroke="#f8fafc" strokeOpacity="0.4" strokeWidth="0.6" />
                          <polygon points="0,-2 15,-9 0,-17" fill={palette.roofDark} />
                          <line x1="-5" y1="-13.5" x2="5" y2="-13.5" stroke="#fef08a" strokeWidth="1.2" strokeLinecap="round" />
                        </g>
                      )}

                      {/* Fluttering Faction Pennant */}
                      <g transform={`translate(${city.isCapital ? 14 : 13}, ${city.isCapital ? -24 : -18})`}>
                        <line x1="0" y1="0" x2="0" y2="16" stroke="#e2e8f0" strokeWidth="1.2" />
                        <path
                          d="M 0 0 L 13 2.5 L 10.5 5.8 L 13 9 L 0 10 Z"
                          fill={palette.fill}
                          stroke={palette.stroke}
                          strokeWidth="0.6"
                        />
                        <text
                          x="5.6"
                          y="7.4"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="7"
                          fontWeight="800"
                          className="font-seal pointer-events-none"
                        >
                          {palette.badge}
                        </text>
                      </g>

                      {/* Stationed Hero Circular Portrait Medallions */}
                      {generals.slice(0, 2).map((gen, gIdx) => {
                        const gx = gIdx === 0 ? -20 : -26;
                        const gy = gIdx === 0 ? -15 : 4;
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
                            <circle r="11" fill="#090d16" stroke="#38bdf8" strokeWidth="1.4" />
                            <image
                              href={gen.portrait}
                              x="-10"
                              y="-10"
                              width="20"
                              height="20"
                              preserveAspectRatio="xMidYMin slice"
                              clipPath="url(#mapHeroPortraitClip)"
                            />
                          </g>
                        );
                      })}

                      {/* Wandering Legendary Hero Golden Beacon */}
                      {wanderingHere.length > 0 && (
                        <g
                          transform="translate(22, 4)"
                          onClick={(e) => {
                            if (onInspectHero && !dragStart.current.moved) {
                              e.stopPropagation();
                              onInspectHero(wanderingHere[0].id);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            r="12.5"
                            fill="none"
                            stroke="#facc15"
                            strokeWidth="1.5"
                            strokeOpacity="0.9"
                            className="animate-city-ring"
                          />
                          <circle r="10" fill="#171207" stroke="#facc15" strokeWidth="1.5" />
                          <image
                            href={wanderingHere[0].portrait}
                            x="-9"
                            y="-9"
                            width="18"
                            height="18"
                            preserveAspectRatio="xMidYMin slice"
                            clipPath="url(#mapHeroPortraitClip)"
                          />
                        </g>
                      )}
                    </g>

                    {/* Floating Modern Glass Nameplate & Troop Pill */}
                    <g transform="translate(0, 27)">
                      <rect
                        x="-40"
                        y="-9"
                        width="80"
                        height="16.5"
                        rx="5"
                        fill="#090f1d"
                        fillOpacity="0.9"
                        stroke={isSelected ? '#38bdf8' : palette.stroke}
                        strokeOpacity={isSelected ? 0.95 : 0.45}
                        strokeWidth="1"
                      />
                      <text
                        y="2.4"
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="10.2"
                        fontWeight="700"
                        className="pointer-events-none"
                      >
                        {tLoc(city.name, lang)}
                      </text>
                    </g>

                    <g transform="translate(0, 42)">
                      <rect
                        x="-25"
                        y="-6"
                        width="50"
                        height="12.5"
                        rx="6.2"
                        fill={palette.fill}
                        fillOpacity="0.95"
                        stroke="#020617"
                        strokeWidth="0.7"
                      />
                      <text
                        y="2.8"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="8.8"
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

            {/* Fixed Map HUD Chrome */}
            <g pointerEvents="none">
              {GRATICULE_LONS.map((g) => (
                <text
                  key={`tick-lon3d-${g.label}`}
                  x={g.x}
                  y={14}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fillOpacity="0.45"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {g.label}
                </text>
              ))}
              {GRATICULE_LATS.map((g) => (
                <text
                  key={`tick-lat3d-${g.label}`}
                  x={18}
                  y={g.y + 3}
                  textAnchor="start"
                  fill="#38bdf8"
                  fillOpacity="0.45"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {g.label}
                </text>
              ))}

              {/* Modern Cyan Compass Rose (tucked cleanly inside frame) */}
              <g transform="translate(88, 592)" opacity="0.86">
                <circle r="20" fill="#09111f" fillOpacity="0.85" stroke="#38bdf8" strokeOpacity="0.5" strokeWidth="1.1" />
                <polygon points="0,-14 3.8,-2 0,-4.5 -3.8,-2" fill="#38bdf8" />
                <polygon points="0,14 3.8,2 0,4.5 -3.8,2" fill="#64748b" />
                <polygon points="14,0 2,3.8 4.5,0 2,-3.8" fill="#64748b" />
                <polygon points="-14,0 -2,3.8 -4.5,0 -2,-3.8" fill="#64748b" />
                <text y="-23" textAnchor="middle" fill="#bae6fd" fontSize="8.5" fontWeight="700">
                  {lang === 'zh' ? '北' : 'N'}
                </text>
              </g>

              {/* Scale Bar */}
              <g transform="translate(124, 604)" opacity="0.86">
                <rect x="0" y="-12" width="112" height="20" rx="5" fill="#09111f" fillOpacity="0.82" />
                <line x1="10" y1="0" x2="98" y2="0" stroke="#7dd3fc" strokeWidth="1.5" />
                <line x1="10" y1="-4" x2="10" y2="3" stroke="#7dd3fc" strokeWidth="1.2" />
                <line x1="54" y1="-3" x2="54" y2="3" stroke="#7dd3fc" strokeWidth="1" />
                <line x1="98" y1="-4" x2="98" y2="3" stroke="#7dd3fc" strokeWidth="1.2" />
                <text x="54" y="-4" textAnchor="middle" fill="#e0f2fe" fontSize="8" fontFamily="monospace">
                  {lang === 'zh' ? '500 里 · 250 km' : '250 km · 500 Li'}
                </text>
              </g>
            </g>
          </svg>
        </div>

        {/* Floating City Inspector Tooltip */}
        {hoveredCity && (
          <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-xl bg-slate-950/90 border border-cyan-400/45 px-3.5 py-2.5 shadow-2xl backdrop-blur-md text-xs max-w-[240px]">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-display font-bold text-sm text-white">
                {tLoc(hoveredCity.name, lang)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200">
                {tLoc(TERRAIN_TEXT[hoveredCity.terrain], lang)}
              </span>
            </div>
            <div className="text-[11px] text-slate-300 space-y-0.5">
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
                <div className="text-cyan-300 pt-0.5">
                  {lang === 'zh' ? '驻将：' : 'Generals: '}
                  {hoveredGenerals.map((g) => tLoc(g.name, lang)).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Zoom / 3D Hint */}
        {zoom === 1 && (
          <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 text-[10px] text-slate-200/80 bg-slate-950/75 px-3 py-1 rounded-full border border-cyan-400/25 flex items-center gap-1.5 backdrop-blur-md">
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>
              {lang === 'zh'
                ? '3D 沙盘视图 · 滚轮缩放 · 点击头像查看名将档案'
                : '3D Tabletop View · Scroll to zoom · Click portraits to inspect heroes'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
