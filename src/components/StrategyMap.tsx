import { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Globe,
  Layers,
  Map as MapIcon,
  Maximize2,
  Swords,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  getCityGenerals,
  getCityWanderingHeroes,
  getStrikeableEnemyCityIds,
} from '../game/engine.js';
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
import type {
  City,
  FactionId,
  GameState,
  Language,
  LocalizedText,
  PlayableFactionId,
} from '../game/types.js';
import { TERRAIN_TEXT, tLoc } from '../i18n/translations.js';
import { useArtLook } from '../utils/artLook.js';
import { MapAtmosphereCanvas } from './MapAtmosphereCanvas.js';
import { WebGLStrategyMap, type MapViewMode } from './WebGLStrategyMap.js';

export interface ActiveMapMarch {
  id: string;
  fromCityId: string;
  toCityId: string;
  pincerFromCityId?: string;
  faction: PlayableFactionId;
  mode: 'assault' | 'pincer' | 'river_strike' | 'raid' | 'bombard' | 'discord';
  heroPortrait?: string;
  isPlayerDefending?: boolean;
  label?: LocalizedText;
}

interface StrategyMapProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  attackMode: boolean;
  activeMapMarch?: ActiveMapMarch | null;
  onToggleAttackMode: () => void;
  onSelectCity: (cityId: string) => void;
  onQuickTargetEnemy: (targetCityId: string) => void;
  onInspectHero?: (heroId: string) => void;
  /** Goes down into a city's close-up view. */
  onEnterCity?: (cityId: string) => void;
  /** The city whose close-up is open; the map flies down to it as the close-up fades in. */
  diveCityId?: string | null;
  /** True while a battle or duel covers the map, so the 3D view can stop drawing. */
  paused?: boolean;
  /** A march being planned, to be drawn before it is ordered. */
  previewRoute?: {
    fromCityId: string;
    toCityId: string;
    pincerFromCityId?: string;
    coverRightPx?: number;
  } | null;
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
    fill: '#4c78a8',
    roofLight: '#6a94c2',
    roofDark: '#2d4a6c',
    stroke: '#b9d0e6',
    badge: '魏',
  },
  shu: {
    fill: '#438554',
    roofLight: '#5c9f6e',
    roofDark: '#295436',
    stroke: '#add4b6',
    badge: '蜀',
  },
  wu: {
    fill: '#c2432f',
    roofLight: '#d4614c',
    roofDark: '#84281c',
    stroke: '#edb3a5',
    badge: '吴',
  },
  neutral: {
    fill: '#968a73',
    roofLight: '#c9bda2',
    roofDark: '#4c4438',
    stroke: '#d9cdb2',
    badge: '群',
  },
};

const ELEVATION_STYLE: Record<
  (typeof ELEVATION_ZONES)[number]['kind'],
  { fill: string; opacity: number }
> = {
  alpine: { fill: '#6e6453', opacity: 0.52 },
  plateau: { fill: '#7c6a52', opacity: 0.42 },
  mountain: { fill: '#4c4438', opacity: 0.5 },
  basin: { fill: '#155e4b', opacity: 0.52 },
  plain: { fill: '#1e4d40', opacity: 0.48 },
  hills: { fill: '#16423c', opacity: 0.46 },
};

/** City markers on the flat drawing are shrunk so thirty-two of them stand clear of each other. */
const FLAT_CITY_SCALE = 0.7;

function getQuadraticBezierControl(a: City, b: City, extraCurve = false): { cx: number; cy: number } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const hash = (a.id.charCodeAt(0) + b.id.charCodeAt(0)) % 2 === 0 ? 1 : -1;
  const curve = (extraCurve ? Math.min(36, dist * 0.18) : Math.min(22, dist * 0.14)) * hash;
  return {
    cx: mx - (dy / dist) * curve,
    cy: my + (dx / dist) * curve,
  };
}

function curvedRoadPath(a: City, b: City, extraCurve = false): string {
  const { cx, cy } = getQuadraticBezierControl(a, b, extraCurve);
  return `M ${a.x} ${a.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}

function evalQuadBezier(
  a: City,
  b: City,
  t: number,
  extraCurve = false
): { x: number; y: number; angleDeg: number } {
  const { cx, cy } = getQuadraticBezierControl(a, b, extraCurve);
  const clamped = Math.max(0, Math.min(1, t));
  const mt = 1 - clamped;
  const x = mt * mt * a.x + 2 * mt * clamped * cx + clamped * clamped * b.x;
  const y = mt * mt * a.y + 2 * mt * clamped * cy + clamped * clamped * b.y;
  const vx = 2 * mt * (cx - a.x) + 2 * clamped * (b.x - cx);
  const vy = 2 * mt * (cy - a.y) + 2 * clamped * (b.y - cy);
  return { x, y, angleDeg: (Math.atan2(vy, vx) * 180) / Math.PI };
}

export function StrategyMap({
  state,
  lang,
  selectedCityId,
  attackMode,
  activeMapMarch,
  onToggleAttackMode,
  onSelectCity,
  onQuickTargetEnemy,
  onInspectHero,
  onEnterCity,
  diveCityId = null,
  paused = false,
  previewRoute = null,
}: StrategyMapProps) {
  const cities = Object.values(state.cities);
  // The 3D map reads the art look when it is built, so a change of look rebuilds it.
  const artLook = useArtLook();
  const selectedCity = selectedCityId ? state.cities[selectedCityId] : null;
  const strikeableIds = new Set(getStrikeableEnemyCityIds(state, state.playerFaction));

  // The living 3D map is the map; the flat drawing stays as the fallback for machines without WebGL.
  const [mapMode, setMapMode] = useState<'webgl' | '2d'>(() => {
    const p = new URLSearchParams(window.location.search).get('mapMode');
    return p === '2d' ? '2d' : 'webgl';
  });
  const [viewMode, setViewMode] = useState<MapViewMode>(() => {
    const p = new URLSearchParams(window.location.search).get('mapView');
    return p === 'paper' || p === 'terrain' ? p : 'auto';
  });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

  const [showTerritory, setShowTerritory] = useState(true);
  const [showGeoLabels, setShowGeoLabels] = useState(true);
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
  const [marchProgress, setMarchProgress] = useState(0);

  useEffect(() => {
    if (!activeMapMarch) {
      setMarchProgress(0);
      return;
    }
    let rafId = 0;
    const start = performance.now();
    const durationMs = 880;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setMarchProgress(t);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeMapMarch?.id]);

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
    <div className="absolute inset-0 map-table overflow-hidden">
      {/* Map tools float over the table; the map itself owns the space */}
      <div className="absolute top-2.5 inset-x-3 z-30 flex flex-wrap items-start justify-between gap-2 text-xs pointer-events-none">
        <div className="pointer-events-auto ink-panel rounded-md px-3 py-1.5 flex flex-wrap items-center gap-3">
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

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={state.actionPoints < 1 || strikeableIds.size === 0}
            onClick={onToggleAttackMode}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer disabled:opacity-40 ${
              attackMode
                ? 'bg-gradient-to-r from-rose-600 to-orange-600 border-rose-300 text-white shadow-[0_0_16px_rgba(244,63,94,0.45)] animate-pulse'
                : 'bg-rose-500/18 hover:bg-rose-500/30 border-rose-400/50 text-rose-200'
            }`}
          >
            {attackMode ? <Crosshair className="w-3.5 h-3.5" /> : <Swords className="w-3.5 h-3.5" />}
            <span>
              {attackMode
                ? lang === 'zh'
                  ? '点击敌城发动进攻'
                  : 'Click Target City'
                : lang === 'zh'
                  ? '出兵攻城'
                  : 'Attack City'}
            </span>
          </button>

          {/* Map view: living 3D map (terrain or paper sheet) or the flat drawing */}
          <div className="flex items-center rounded-md border border-slate-700/80 bg-slate-900/85 overflow-hidden text-[11px] font-semibold">
            {(
              [
                { id: 'auto', en: 'Auto', zh: '自动' },
                { id: 'terrain', en: 'Terrain', zh: '山河' },
                { id: 'paper', en: 'Paper map', zh: '舆图' },
              ] as Array<{ id: MapViewMode; en: string; zh: string }>
            ).map((opt, idx) => {
              const active = mapMode === 'webgl' && viewMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setMapMode('webgl');
                    setViewMode(opt.id);
                  }}
                  title={
                    opt.id === 'auto'
                      ? lang === 'zh'
                        ? '近看山河，拉远自动变为舆图'
                        : 'Terrain up close, paper map when zoomed out'
                      : undefined
                  }
                  className={`flex items-center gap-1 px-2 py-1 cursor-pointer ${
                    idx > 0 ? 'border-l border-slate-700/80' : ''
                  } ${active ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {idx === 0 && <Globe className="w-3.5 h-3.5" />}
                  <span>{lang === 'zh' ? opt.zh : opt.en}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMapMode('2d')}
              title={lang === 'zh' ? '平面地图（无需 WebGL）' : 'Flat drawing (no WebGL needed)'}
              className={`px-2 py-1 border-l border-slate-700/80 cursor-pointer ${
                mapMode === '2d' ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'zh' ? '平面' : 'Flat'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTerritory((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
              showTerritory
                ? 'bg-indigo-500/20 border-indigo-400/45 text-indigo-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{lang === 'zh' ? '势力版图' : 'Realms'}</span>
          </button>

          {mapMode !== 'webgl' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* 3D Perspective Tabletop / Real-Time Three.js WebGL World Stage */}
      <div
        className={
          mapMode === 'webgl'
            ? 'absolute inset-0'
            : 'absolute inset-0 flex items-center justify-center px-4 pb-4 pt-14 [container-type:size]'
        }
      >
      <div
        className="relative map-3d-stage"
        style={
          mapMode === 'webgl'
            ? { width: '100%', height: '100%' }
            : { width: 'min(100cqw, calc(100cqh * 1000 / 660))', aspectRatio: '1000 / 660' }
        }
      >
        {mapMode === 'webgl' ? (
          <WebGLStrategyMap
            key={artLook}
            state={state}
            lang={lang}
            selectedCityId={selectedCityId}
            attackMode={attackMode}
            activeMapMarch={activeMapMarch}
            onSelectCity={onSelectCity}
            onQuickTargetEnemy={onQuickTargetEnemy}
            onInspectHero={onInspectHero}
            onEnterCity={onEnterCity}
            diveCityId={diveCityId}
            viewMode={viewMode}
            showRealms={showTerritory}
            paused={paused}
            previewRoute={previewRoute}
            onWebGLFallback={() => setMapMode('2d')}
          />
        ) : (
          <div
            className="w-full h-full map-3d-surface relative theme-art-grade scroll-mount overflow-hidden"
          >
            {/* 60fps Seasonal Weather, Volumetric Drifting Clouds & Battle Smoke Overlay */}
            <MapAtmosphereCanvas
              season={state.season}
              cities={cities}
              recentMarches={state.recentMarches}
            />
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
                <stop offset="0%" stopColor="#2c5654" />
                <stop offset="45%" stopColor="#1e3f41" />
                <stop offset="100%" stopColor="#11282a" />
              </radialGradient>

              {/* Modern Physical Relief Land Gradient */}
              <linearGradient id="modernLandBase" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6f6649" />
                <stop offset="32%" stopColor="#5a6149" />
                <stop offset="68%" stopColor="#485a41" />
                <stop offset="100%" stopColor="#3c503d" />
              </linearGradient>

              {/* Vibrant 3D River Water Gradients */}
              <linearGradient id="yellowRiver3D" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7fb8b0" />
                <stop offset="45%" stopColor="#5ec2b7" />
                <stop offset="100%" stopColor="#7fb8b0" />
              </linearGradient>
              <linearGradient id="yangtze3D" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3f7f7c" />
                <stop offset="50%" stopColor="#7fb8b0" />
                <stop offset="100%" stopColor="#a9d1c8" />
              </linearGradient>

              {/* Glossy 3D Lake Basin */}
              <radialGradient id="lake3D" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#a9d1c8" />
                <stop offset="55%" stopColor="#4f9791" />
                <stop offset="100%" stopColor="#2f6562" />
              </radialGradient>

              {/* Dynamic Faction Influence Glows */}
              <radialGradient id="wash-wei" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4c78a8" stopOpacity="0.34" />
                <stop offset="60%" stopColor="#3a5f8a" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#2d4a6c" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="wash-shu" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#438554" stopOpacity="0.34" />
                <stop offset="60%" stopColor="#346a43" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#295436" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="wash-wu" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c2432f" stopOpacity="0.34" />
                <stop offset="60%" stopColor="#a53323" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#84281c" stopOpacity="0" />
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
                  lightingColor="#f3e6c8"
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
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#d1864a" />
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
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#7fb8b0" />
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
                    <path d={d} stroke="#4f9791" strokeWidth="34" strokeOpacity="0.1" />
                    <path d={d} stroke="#7fb8b0" strokeWidth="16" strokeOpacity="0.18" />
                    <path d={d} stroke="#a9d1c8" strokeWidth="5.5" strokeOpacity="0.26" />
                  </g>
                ))}
              </g>

              {/* Subtle Holographic Lat/Lon Grid over Ocean */}
              <g stroke="#7fb8b0" strokeOpacity="0.09" strokeWidth="0.8" strokeDasharray="3 6">
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
                    <path key={`cliff1-${i}`} d={d} fill="#2b2620" stroke="#231f1a" strokeWidth="1" />
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
                    stroke="#8fc2b0"
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
                          r={city.isCapital ? 104 : 84}
                          fill={`url(#wash-${city.owner})`}
                        />
                      ))}
                  </g>
                )}

                {/* Topographic Contour Lines */}
                <g fill="none" stroke="#968a73" strokeOpacity="0.16" strokeWidth="0.9" pointerEvents="none">
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
                          fill={ridge.alpine ? '#c9bda2' : '#809190'}
                          fillOpacity={ridge.alpine ? 0.58 : 0.42}
                        />
                        <path
                          d={ridge.darkPath}
                          fill={ridge.alpine ? '#231f1a' : '#1c1813'}
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
                                  ? '#f0e8d6'
                                  : '#968a73'
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
                        stroke={ridge.alpine ? '#f5eddc' : '#c9bda2'}
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
                          stroke="#0d0b09"
                          strokeOpacity="0.72"
                          strokeWidth={river.width + 3.2}
                        />
                        {/* Sunlit South Bank Rim Bevel */}
                        <path
                          d={river.d}
                          transform="translate(0, 1.4)"
                          stroke="#8fc2b0"
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
                          stroke={isYellow ? '#f3e6c3' : '#e6efe6'}
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
                        fill="#0d0b09"
                        fillOpacity="0.6"
                      />
                      <path
                        d={lake.d}
                        fill="url(#lake3D)"
                        fillOpacity="0.9"
                        stroke="#cfe3da"
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
                    stroke="#cfe3da"
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
                      sea: { fill: '#a9d1c8', opacity: 0.48, size: lang === 'zh' ? 13 : 10, ls: '2.5' },
                      region: { fill: '#d9cdb2', opacity: 0.24, size: lang === 'zh' ? 14 : 11, ls: '2' },
                      mountain: { fill: '#c9bda2', opacity: 0.54, size: lang === 'zh' ? 10.5 : 9, ls: '1' },
                      river: { fill: '#cfe3da', opacity: 0.72, size: lang === 'zh' ? 10 : 8.5, ls: '1' },
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
                        stroke="#0a0806"
                        strokeOpacity={isAdjacentToSelected ? 0.75 : 0.45}
                        strokeWidth={isAdjacentToSelected ? 4.6 : 2.8}
                      />
                      <path
                        d={d}
                        stroke={
                          isAdjacentToSelected
                            ? '#7fb8b0'
                            : isRiverRoute
                              ? '#a9d1c8'
                              : '#c9bda2'
                        }
                        strokeOpacity={isAdjacentToSelected ? 0.95 : 0.36}
                        strokeWidth={isAdjacentToSelected ? 2.2 : 1.25}
                        strokeDasharray={isAdjacentToSelected ? '7 4' : '4 5'}
                      />
                    </g>
                  );
                })}
              </g>

              {/* 9. Animated Campaign March Arcs & Operation Impact FX */}
              <g fill="none">
                {state.recentMarches.slice(0, 4).map((march) => {
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

                  const strokeColor =
                    march.type === 'reinforce'
                      ? '#7fb8b0'
                      : march.type === 'river_strike'
                        ? '#68a895'
                        : march.type === 'raid'
                          ? '#e0b53a'
                          : march.type === 'bombard'
                            ? '#c2432f'
                            : march.type === 'discord'
                              ? '#c49bc8'
                              : '#d1864a';

                  const showLine = from.id !== to.id;
                  return (
                    <g key={march.id}>
                      {showLine && (
                        <path
                          d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
                          stroke={strokeColor}
                          strokeWidth={march.type === 'raid' ? '2.4' : '3.2'}
                          strokeDasharray={march.type === 'raid' ? '4 4' : '7 5'}
                          className="animate-march-line"
                          markerEnd={
                            march.type === 'reinforce' || march.type === 'river_strike'
                              ? 'url(#arrowReinforce3D)'
                              : 'url(#arrowAttack3D)'
                          }
                        />
                      )}
                      {(march.type === 'bombard' || march.type === 'discord' || march.type === 'raid') && (
                        <circle
                          cx={to.x}
                          cy={to.y}
                          r="26"
                          stroke={strokeColor}
                          strokeWidth="2.2"
                          strokeOpacity="0.8"
                          className="animate-city-ring"
                        />
                      )}
                    </g>
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

                const isStrikeTarget = attackMode && strikeableIds.has(city.id);

                return (
                  <g
                    key={city.id}
                    transform={`translate(${city.x}, ${city.y}) scale(${FLAT_CITY_SCALE})`}
                    onClick={() => {
                      if (dragStart.current.moved) return;
                      if (isStrikeTarget) {
                        onQuickTargetEnemy(city.id);
                      } else {
                        onSelectCity(city.id);
                      }
                    }}
                    onMouseEnter={() => setHoveredCityId(city.id)}
                    onMouseLeave={() => setHoveredCityId((prev) => (prev === city.id ? null : prev))}
                    className="cursor-pointer"
                  >
                    {/* Attack Mode Pulsing Crimson Crosshair Target Reticle! */}
                    {isStrikeTarget && (
                      <g>
                        <ellipse
                          cx="0"
                          cy="5"
                          rx="34"
                          ry="21"
                          fill="#c2432f"
                          fillOpacity="0.16"
                          stroke="#d4614c"
                          strokeWidth="2.5"
                          className="animate-city-ring"
                        />
                        <line x1="-38" y1="5" x2="-24" y2="5" stroke="#d4614c" strokeWidth="2" />
                        <line x1="24" y1="5" x2="38" y2="5" stroke="#d4614c" strokeWidth="2" />
                        <line x1="0" y1="-22" x2="0" y2="-13" stroke="#d4614c" strokeWidth="2" />
                      </g>
                    )}

                    {/* Glowing Ground Tactical Ring */}
                    {isSelected && (
                      <ellipse
                        cx="0"
                        cy="6"
                        rx="30"
                        ry="17"
                        fill="none"
                        stroke="#7fb8b0"
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
                        stroke={city.owner === state.playerFaction ? '#7fb8b0' : '#d1864a'}
                        strokeWidth="2"
                        strokeDasharray="5 3"
                        strokeOpacity="0.9"
                      />
                    )}

                    {/* Ambient Cast Ground Shadow */}
                    <ellipse cx="4" cy="9" rx={city.isCapital ? 24 : 20} ry={city.isCapital ? 12 : 10} fill="#0a0806" fillOpacity="0.68" />

                    {/* 3D Isometric Fortress / Palace Model */}
                    <g
                      transform={isHovered || isSelected ? 'translate(0, -3) scale(1.09)' : 'translate(0, 0) scale(1)'}
                      style={{ transition: 'transform 180ms ease' }}
                      filter={isSelected ? 'url(#cityGlow3D)' : undefined}
                    >
                      {/* 3D Stepped Isometric Stone Plinth */}
                      <polygon
                        points="-18,4 0,13 18,4 0,-5"
                        fill="#352f27"
                        stroke={palette.stroke}
                        strokeOpacity="0.55"
                        strokeWidth="0.9"
                      />
                      {/* Left Sunlit Plinth Wall */}
                      <polygon points="-18,4 0,13 0,18 -18,9" fill="#6e6453" />
                      {/* Right Shadowed Plinth Wall */}
                      <polygon points="0,13 18,4 18,9 0,18" fill="#231f1a" />

                      {/* Main Fortress Inner Wall Box (3D Extruded) */}
                      {/* Left sunlit wall */}
                      <polygon points="-13,1 0,8 0,-2 -13,-9" fill="#c9bda2" />
                      {/* Right shadowed wall */}
                      <polygon points="0,8 13,1 13,-9 0,-2" fill="#4c4438" />
                      {/* Top courtyard floor */}
                      <polygon points="-13,-9 0,-2 13,-9 0,-16" fill="#968a73" />
                      {/* Arched dark city gate on left sunlit face */}
                      <path d="M -8.5 3.2 L -8.5 -0.8 Q -6.2 -2.2 -4 0.5 L -4 5.5 Z" fill="#171411" />

                      {/* Extra 3D Corner Watchtowers for High-Defense Fortresses (Def >= 4) */}
                      {city.defense >= 4 && (
                        <g>
                          <polygon points="-17,-4 -13,-2 -13,-11 -17,-13" fill="#d9cdb2" />
                          <polygon points="-13,-2 -10,-4 -10,-13 -13,-11" fill="#4c4438" />
                          <polygon points="-18,-12 -13.5,-16.5 -9,-12 -13.5,-10" fill={palette.roofLight} />
                          <polygon points="10,-4 13,-2 13,-11 10,-13" fill="#c9bda2" />
                          <polygon points="13,-2 17,-4 17,-13 13,-11" fill="#352f27" />
                          <polygon points="9,-12 13.5,-16.5 18,-12 13.5,-10" fill={palette.roofDark} />
                        </g>
                      )}

                      {/* 3D Glazed Sloped Pagoda Roofs (Tiered Imperial Palace for Capitals!) */}
                      {city.isCapital ? (
                        <g>
                          {/* Lower Palace Tier Roof */}
                          <polygon points="-16,-8 0,0 0,-12 -15,-14" fill={palette.roofLight} stroke="#f5eddc" strokeOpacity="0.35" strokeWidth="0.5" />
                          <polygon points="0,0 16,-8 15,-14 0,-12" fill={palette.roofDark} />
                          {/* Upper Imperial Pagoda Body */}
                          <polygon points="-8,-13 0,-9 0,-17 -8,-21" fill="#f0e8d6" />
                          <polygon points="0,-9 8,-13 8,-21 0,-17" fill="#6e6453" />
                          {/* Upper Swept Golden-Trimmed Eaves */}
                          <polygon points="-12,-19 0,-13 0,-26" fill={palette.roofLight} stroke="#f2dc8c" strokeWidth="0.7" />
                          <polygon points="0,-13 12,-19 0,-26" fill={palette.roofDark} stroke="#f2dc8c" strokeOpacity="0.6" strokeWidth="0.6" />
                          {/* Golden Imperial Spire */}
                          <circle cx="0" cy="-27" r="2.2" fill="#e0b53a" />
                        </g>
                      ) : (
                        <g>
                          {/* Citadel Gatehouse Swept Roof */}
                          <polygon points="-15,-9 0,-2 0,-17" fill={palette.roofLight} stroke="#f5eddc" strokeOpacity="0.4" strokeWidth="0.6" />
                          <polygon points="0,-2 15,-9 0,-17" fill={palette.roofDark} />
                          <line x1="-5" y1="-13.5" x2="5" y2="-13.5" stroke="#f2dc8c" strokeWidth="1.2" strokeLinecap="round" />
                        </g>
                      )}

                      {/* Fluttering Faction Pennant */}
                      <g transform={`translate(${city.isCapital ? 14 : 13}, ${city.isCapital ? -24 : -18})`}>
                        <line x1="0" y1="0" x2="0" y2="16" stroke="#d9cdb2" strokeWidth="1.2" />
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
                            <circle r="11" fill="#090d16" stroke="#7fb8b0" strokeWidth="1.4" />
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
                            stroke="#e0b53a"
                            strokeWidth="1.5"
                            strokeOpacity="0.9"
                            className="animate-city-ring"
                          />
                          <circle r="10" fill="#171207" stroke="#e0b53a" strokeWidth="1.5" />
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
                        stroke={isSelected ? '#7fb8b0' : palette.stroke}
                        strokeOpacity={isSelected ? 0.95 : 0.45}
                        strokeWidth="1"
                      />
                      <text
                        y="2.4"
                        textAnchor="middle"
                        fill="#f5eddc"
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
                        stroke="#0a0806"
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

              {/* 11. LIVE CINEMATIC ON-MAP MARCH ANIMATION (Precedes War Scene Theater!) */}
              {activeMapMarch && (() => {
                const toCity = state.cities[activeMapMarch.toCityId];
                const fromCity = state.cities[activeMapMarch.fromCityId];
                const pincerCity = activeMapMarch.pincerFromCityId
                  ? state.cities[activeMapMarch.pincerFromCityId]
                  : undefined;
                if (!toCity) return null;

                const pal = FACTION_PALETTE[activeMapMarch.faction];
                const accentColor =
                  activeMapMarch.mode === 'river_strike'
                    ? '#68a895'
                    : activeMapMarch.mode === 'raid'
                      ? '#e0b53a'
                      : activeMapMarch.mode === 'bombard'
                        ? '#b96c32'
                        : activeMapMarch.mode === 'discord'
                          ? '#c49bc8'
                          : pal.fill;

                // Ease-in-out curve for crisp marching momentum
                const eased =
                  marchProgress < 0.5
                    ? 2 * marchProgress * marchProgress
                    : 1 - Math.pow(-2 * marchProgress + 2, 2) / 2;
                const moveT = Math.min(1, eased / 0.86);
                const impactT = Math.max(0, (marchProgress - 0.72) / 0.28);
                const isRiverStrike = activeMapMarch.mode === 'river_strike';
                const hasRoute = Boolean(fromCity && fromCity.id !== toCity.id);

                const renderColumn = (origin: City, isFlank: boolean) => {
                  const pos = evalQuadBezier(origin, toCity, moveT, isRiverStrike);
                  const trail1 = evalQuadBezier(origin, toCity, Math.max(0, moveT - 0.08), isRiverStrike);
                  const trail2 = evalQuadBezier(origin, toCity, Math.max(0, moveT - 0.16), isRiverStrike);
                  const routePath = curvedRoadPath(origin, toCity, isRiverStrike);

                  return (
                    <g key={isFlank ? 'march-flank' : 'march-main'} pointerEvents="none">
                      {/* Highlighted Glowing Campaign Path */}
                      <path
                        d={routePath}
                        fill="none"
                        stroke={accentColor}
                        strokeOpacity="0.28"
                        strokeWidth={isFlank ? '7' : '9'}
                      />
                      <path
                        d={routePath}
                        fill="none"
                        stroke={accentColor}
                        strokeWidth={isFlank ? '2.6' : '3.4'}
                        strokeDasharray="8 5"
                        className="animate-march-line"
                      />

                      {/* Glowing Energy Wake Dots */}
                      <circle cx={trail2.x} cy={trail2.y} r="3.5" fill={accentColor} fillOpacity="0.35" />
                      <circle cx={trail1.x} cy={trail1.y} r="5.5" fill={accentColor} fillOpacity="0.6" />

                      {/* Animated Army / Warship Token */}
                      <g transform={`translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`}>
                        {/* Ground Glow Pulse */}
                        <circle
                          r={isFlank ? 14 : 18}
                          fill={accentColor}
                          fillOpacity="0.24"
                          stroke={accentColor}
                          strokeWidth="1.6"
                        />
                        {/* Directional Spearhead / Warship Protrusion */}
                        <g transform={`rotate(${pos.angleDeg.toFixed(1)})`}>
                          {isRiverStrike ? (
                            <polygon
                              points="17,0 -9,-8 -5,0 -9,8"
                              fill="#68a895"
                              stroke="#ffffff"
                              strokeWidth="1.2"
                            />
                          ) : (
                            <polygon
                              points="18,0 4,-7 7,0 4,7"
                              fill="#ebc95c"
                              stroke="#171411"
                              strokeWidth="0.9"
                            />
                          )}
                        </g>
                        {/* Commander Medallion or Faction Crest */}
                        <circle
                          r={isFlank ? 10 : 12.5}
                          fill={pal.fill}
                          stroke="#f2dc8c"
                          strokeWidth="2"
                        />
                        {!isFlank && activeMapMarch.heroPortrait ? (
                          <image
                            href={activeMapMarch.heroPortrait}
                            x="-11.5"
                            y="-11.5"
                            width="23"
                            height="23"
                            preserveAspectRatio="xMidYMin slice"
                            clipPath="url(#mapHeroPortraitClip)"
                          />
                        ) : (
                          <text
                            y="3.5"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize={isFlank ? '9' : '11'}
                            fontWeight="800"
                            className="font-seal"
                          >
                            {pal.badge}
                          </text>
                        )}
                      </g>
                    </g>
                  );
                };

                return (
                  <g pointerEvents="none">
                    {hasRoute && fromCity && renderColumn(fromCity, false)}
                    {pincerCity && pincerCity.id !== toCity.id && renderColumn(pincerCity, true)}

                    {/* Covert Infiltration Converging Rings (for Sow Discord without adjacent staging) */}
                    {!hasRoute && (
                      <g transform={`translate(${toCity.x}, ${toCity.y})`}>
                        <circle
                          r={Math.max(8, 52 * (1 - moveT))}
                          fill="none"
                          stroke="#c49bc8"
                          strokeWidth="3"
                          strokeDasharray="6 4"
                          strokeOpacity={0.9 - moveT * 0.3}
                        />
                        <circle
                          r={Math.max(4, 32 * (1 - moveT))}
                          fill="#8d5a94"
                          fillOpacity="0.22"
                          stroke="#dcc3de"
                          strokeWidth="2"
                        />
                      </g>
                    )}

                    {/* Expanding Clash Shockwave Ring on Target City! */}
                    {impactT > 0 && (
                      <g transform={`translate(${toCity.x}, ${toCity.y})`}>
                        <circle
                          r={12 + impactT * 42}
                          fill={accentColor}
                          fillOpacity={(1 - impactT) * 0.32}
                          stroke="#f2dc8c"
                          strokeWidth={3.5 * (1 - impactT) + 0.8}
                          strokeOpacity={1 - impactT}
                        />
                        <circle
                          r={6 + impactT * 26}
                          fill="none"
                          stroke={accentColor}
                          strokeWidth="2.4"
                          strokeOpacity={Math.max(0, 1 - impactT * 0.9)}
                        />
                      </g>
                    )}
                  </g>
                );
              })()}
            </g>

            {/* Fixed Map HUD Chrome */}
            <g pointerEvents="none">
              {GRATICULE_LONS.map((g) => (
                <text
                  key={`tick-lon3d-${g.label}`}
                  x={g.x}
                  y={14}
                  textAnchor="middle"
                  fill="#7fb8b0"
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
                  fill="#7fb8b0"
                  fillOpacity="0.45"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {g.label}
                </text>
              ))}

              {/* Modern Cyan Compass Rose (tucked cleanly inside frame) */}
              <g transform="translate(88, 592)" opacity="0.86">
                <circle r="20" fill="#14110d" fillOpacity="0.85" stroke="#7fb8b0" strokeOpacity="0.5" strokeWidth="1.1" />
                <polygon points="0,-14 3.8,-2 0,-4.5 -3.8,-2" fill="#7fb8b0" />
                <polygon points="0,14 3.8,2 0,4.5 -3.8,2" fill="#6e6453" />
                <polygon points="14,0 2,3.8 4.5,0 2,-3.8" fill="#6e6453" />
                <polygon points="-14,0 -2,3.8 -4.5,0 -2,-3.8" fill="#6e6453" />
                <text y="-23" textAnchor="middle" fill="#cfe3da" fontSize="8.5" fontWeight="700">
                  {lang === 'zh' ? '北' : 'N'}
                </text>
              </g>

              {/* Scale Bar */}
              <g transform="translate(124, 604)" opacity="0.86">
                <rect x="0" y="-12" width="112" height="20" rx="5" fill="#14110d" fillOpacity="0.82" />
                <line x1="10" y1="0" x2="98" y2="0" stroke="#a9d1c8" strokeWidth="1.5" />
                <line x1="10" y1="-4" x2="10" y2="3" stroke="#a9d1c8" strokeWidth="1.2" />
                <line x1="54" y1="-3" x2="54" y2="3" stroke="#a9d1c8" strokeWidth="1" />
                <line x1="98" y1="-4" x2="98" y2="3" stroke="#a9d1c8" strokeWidth="1.2" />
                <text x="54" y="-4" textAnchor="middle" fill="#e6efe6" fontSize="8" fontFamily="monospace">
                  {lang === 'zh' ? '500 里 · 250 km' : '250 km · 500 Li'}
                </text>
              </g>
            </g>
          </svg>
          </div>
        )}

        {/* Floating Live Campaign March Banner */}
        {activeMapMarch && (
          <div
            className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-full px-4 py-1.5 border shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold tracking-wide ${
              activeMapMarch.isPlayerDefending
                ? 'bg-rose-950/92 border-rose-400/75 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.45)]'
                : 'bg-slate-950/92 border-cyan-400/70 text-cyan-100 shadow-[0_0_24px_rgba(208,167,79,0.4)]'
            }`}
          >
            <Swords className={`w-3.5 h-3.5 ${activeMapMarch.isPlayerDefending ? 'text-rose-400' : 'text-amber-300'} animate-pulse`} />
            <span>
              {activeMapMarch.label
                ? tLoc(activeMapMarch.label, lang)
                : lang === 'zh'
                  ? `大军急行军奔袭 ${tLoc(state.cities[activeMapMarch.toCityId]?.name || { en: '', zh: '' }, lang)}…`
                  : `Forces advancing on ${tLoc(state.cities[activeMapMarch.toCityId]?.name || { en: '', zh: '' }, lang)}…`}
            </span>
          </div>
        )}

        {/* Floating City Inspector Tooltip */}
        {mapMode !== 'webgl' && hoveredCity && (
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
                {lang === 'zh' ? '城防' : 'Walls'} {hoveredCity.defense} ·{' '}
                {lang === 'zh' ? '农' : 'Farming'} {hoveredCity.farming} ·{' '}
                {lang === 'zh' ? '商' : 'Trade'} {hoveredCity.trade}
              </div>
              <div>
                {lang === 'zh' ? '训练' : 'Drill'} {hoveredCity.drill} ·{' '}
                {lang === 'zh' ? '民心' : 'Support'} {hoveredCity.support}
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
        {mapMode !== 'webgl' && zoom === 1 && (
          <div className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] text-slate-200/80 bg-slate-950/75 px-3 py-1 rounded-full border border-amber-400/25 flex items-center gap-1.5">
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>
              {lang === 'zh'
                ? '平面地图 · 滚轮缩放 · 点击头像查看名将档案'
                : 'Flat map · Scroll to zoom · Click portraits to inspect heroes'}
            </span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
