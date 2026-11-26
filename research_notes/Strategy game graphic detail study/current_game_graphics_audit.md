# Current state of graphic detail in the game: scene-by-scene audit from source code and live captures

Audit basis. Sources are the repository's own source files (cited as `path:line`, relative to `/home/xiaodong/workspace/threekindom-ai`), 41 screenshots of the running dev build taken on 2026-11-26 between 08:51 and 09:06 local time (cited as `captures/<file>`, folder `/home/xiaodong/workspace/threekindom-ai/research_notes/Strategy game graphic detail study/captures/`), numbers read from the running page (three.js `renderer.info`, and a WebGL draw-call counter injected by the capture script), and `git log`. Captures used headless Chrome 1600x900 on the machine's NVIDIA RTX 5000 Ada through ANGLE/OpenGL ES, at device pixel ratio 1 unless a file name ends in `2x`. No web sources were used.

Moving-target warning. Another session was editing the working tree while this audit ran. `src/components/city/cityScene.ts` grew from 1,313 to 1,631 lines at 08:54 (uncommitted), `cityLayout.ts`, `CityView.tsx`, `App.tsx` and others changed up to 09:04, and `dist/` was rebuilt at 09:07. Line numbers for `cityScene.ts`, `App.tsx` and `CityView.tsx` are those of the working tree at 09:05; for `cityScene.ts` lines up to 1040 are the same as commit `faf25cd`; everything after is shifted (by +85 up to the smoke code, by +299 in the frame-update function) and includes new uncommitted props (steamship, waterwheels, balloon, governor's pennant, wayfarer pavilion). City captures taken at 08:53–08:54 predate those props; two captures at 09:06 show them. All other audited rendering files were unchanged since 2026-11-25.

---

## 1. Per scene: how is the image produced (geometry, counts, materials, maps, lighting, shadows, atmosphere, effects, animation, post, colour, antialiasing, pixel ratio, tiers, renderer sharing)?

### Takeaway
Everything in every 3D scene is built at run time from three.js primitives, lofts and extrusions with `MeshStandardMaterial`; the only image files ever used as WebGL textures are four painted battle backdrops and one height map, and there are no normal, roughness, metalness or AO maps, no glTF models, no skeletal animation and no shared renderer or quality-tier system. The four 3D scenes each create their own `WebGLRenderer` with different antialiasing, tone-mapping, pixel-ratio, shadow, fog and post-processing settings, and only the duel has image-based lighting.

### Cited Findings

#### Cross-scene comparison (code facts plus measured numbers)

| Property | Campaign map | City close-up | Cavalry duel | War theater | Tactical board |
|---|---|---|---|---|---|
| Technology | three.js WebGL + DOM labels | three.js WebGL + DOM labels | three.js WebGL + DOM overlays | three.js WebGL (2D canvas fallback exists) | Canvas 2D + DOM tokens + SVG lines + Canvas 2D VFX |
| Renderer created | once per map mount, `WebGLStrategyMap.tsx:207`; remounted when the look changes (`StrategyMap.tsx:475` `key={artLook}`) | once per city view, `CityStage3D.tsx:69`; scene rebuilt inside it on any spec change (`:147-179`, `:289-293`) | per duel, `DuelStage3D.tsx:175` (effect deps `:836`) | per battle scene, `WarStage3D.tsx:150-153` (deps `:1344`) | none |
| Context antialias flag | `antialias: true` (`:207`) | `false` (`:69`) | `false` (`:175`) | `true` (`:151`) | n/a |
| Effective AA | default-framebuffer MSAA | 4x MSAA on a half-float composer target (`duel/duelVfx3D.ts:105-108`) | same 4x MSAA target | classic: default-framebuffer MSAA; myth: 4x MSAA composer target (`WarStage3D.tsx:956`) | browser 2D |
| Pixel-ratio cap | `min(1.5, dpr)` (`:219`) | `min(1.5, dpr)` (`CityStage3D.tsx:78`) | `min(2, dpr)` (`DuelStage3D.tsx:182`) | `min(2, dpr)` (`WarStage3D.tsx:169`) | board canvas fixed 1024x1024 (`tactical/TacticalBoardCanvas.tsx:18`); VFX canvas 580 logical px x `min(2, dpr)` (`TacticalVfxCanvas.tsx:72`, `:185-188`) |
| Canvas size measured at dpr 2, 1600x900 window | 2316x1275 | 2316x1275 | 1704x810 (stage is only 852x405 CSS px) | 3200x1654 | board shown at 650 CSS px |
| Adaptive quality | one-shot: drop to pixel ratio 1 if mean frame > 24 ms over frames 41–160 (`:622-629`) | same rule (`CityStage3D.tsx:296-302`) | none | none | none |
| Tone mapping | `NoToneMapping` (`:224`) | ACES Filmic (`CityStage3D.tsx:84`), exposure 1.0 myth / 0.86 classic (`city/cityEnvironment.ts:448`) | ACES Filmic (`DuelStage3D.tsx:189`), exposure 0.98–1.2 by arena look (`duel/duelArena3D.ts:72,98,124,149,185,209,233,256`) | ACES Filmic (`WarStage3D.tsx:172-173`) | n/a |
| Output colour space | not set (three default sRGB); the terrain shader writes display-referred colour straight to `gl_FragColor` (`map/mapTerrain.ts:278`) | `SRGBColorSpace` set (`CityStage3D.tsx:83`) | default | `SRGBColorSpace` set (`WarStage3D.tsx:171`) | n/a |
| Post-processing | none in WebGL; a CSS radial-gradient vignette div sits over the canvas (`WebGLStrategyMap.tsx:1031-1038`) | RenderPass → UnrealBloom (strength 0.34, radius 0.55, threshold 1.18) → grade pass → OutputPass (`CityStage3D.tsx:111-117`, `duel/duelVfx3D.ts:109-116`) | same chain, bloom 0.28 / 0.55 / 1.18 (`duelVfx3D.ts:111`), grade driven per frame (`DuelStage3D.tsx:790-799`) | classic: none (`WarStage3D.tsx:1327-1328`); myth: same chain, vignette 0.5, saturation 1.02 (`:956-960`) | CSS `filter: var(--art-grade)` on the board canvas (`TacticalBoardCanvas.tsx:525`, `index.css:253-255`) |
| Environment map / IBL | none | none | yes: PMREM of a generated sky sphere + bright "sun" sphere, `environmentIntensity 0.8` (`DuelStage3D.tsx:206-227`) | none | n/a |
| Shadows | none (renderer shadow map never enabled); a 64 px radial-gradient blob decal under each city (`map/mapCities.ts:231-260`) | 1 directional, 2048², PCF, bias −0.0005, normalBias 0.35, frustum ±(outer+96) units, drawn once per build (`city/cityEnvironment.ts:398-411`, `CityStage3D.tsx:85-88,163`) | 1 directional, 2048², frustum 26x22 units, bias −0.0004, normalBias 0.03, every frame (`DuelStage3D.tsx:235-247`) | 1 directional, 1024², frustum 44x32 units, bias −0.0006, every frame (`WarStage3D.tsx:188-199`) | canvas `shadowBlur` under pieces (`TacticalBoardCanvas.tsx:158-160`), CSS box-shadows on tokens |
| Fog | no scene fog; distance haze computed only inside the terrain shader (`mapTerrain.ts:244-247`), so city models and the army are not hazed | `FogExp2`, density 0.0021 myth / 0.0013 classic, colour = sky horizon colour, also used as background (`cityEnvironment.ts:447`, `CityStage3D.tsx:160-161`) | `FogExp2` density 0.012–0.03 by look (`DuelStage3D.tsx:202`) | same look x0.92 (`WarStage3D.tsx:179`) | painted mist blobs in myth (`TacticalBoardCanvas.tsx:449-469`) |
| Lights | hemisphere + 1 directional (`:263-270`) | hemisphere + sun + fill directional (`cityEnvironment.ts:397-416`) + 4 warm point lights (`city/cityScene.ts:1298-1304`) + up to 3 fire point lights (`:1292`) | hemisphere + sun + fill (`DuelStage3D.tsx:233-251`), clash and hero point lights (`:253-257`), 4 brazier point lights when the look has torches (`duelArena3D.ts:463-466`) | hemisphere + sun + fill (`WarStage3D.tsx:185-203`), blast point light (`:213-215`), one torch point light in myth (`:207-211`) | none |
| Measured draw calls per frame (dpr 1) | 37 far; 41–91 near; 102–149 with a marching army | 83–172 incl. post passes | 204–378 incl. shadow and post passes | land 289–331; river 319–328 | 0 WebGL |
| Measured triangles per frame | 138,138 far; 140,854–149,686 near; 158,472–166,798 with army | 249,201–321,813 | 244,263–279,607 (shadow casters counted twice) | land ~221,300–221,700; river 18,605–18,991 | 0 |

Reading the citations: all source paths are under `src/components/` unless they start with `src/`, `scripts/`, `public/` or `reports/`; a bare `:n` continues the file named just before it in the same cell or bullet, and where a table cell names no file it is the scene's stage component (`WebGLStrategyMap.tsx`, `CityStage3D.tsx`, `DuelStage3D.tsx`, `WarStage3D.tsx`).

Measured values come from `renderer.info` (map: `mapDebug` hook, `WebGLStrategyMap.tsx:570-587`) and from a counter wrapped around `drawElements/drawArrays(/Instanced)` in the capture script; for scenes with a post chain `renderer.info` is useless because the last full-screen pass resets it (it reported "calls 1, triangles 1" in the city).

- No material in the audited scene code uses `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `alphaMap`, `MeshPhysicalMaterial`, clearcoat or sheen; there is no `GLTFLoader`, `KTX2`, `SkinnedMesh`, `AnimationMixer` or `onBeforeCompile`. `bumpMap` appears 13 times (duel/war ground, armour, horse coat, fortress wall). Only two scene `ShaderMaterial`s exist: the map terrain (`map/mapTerrain.ts:323`) and the city sky dome (`city/cityEnvironment.ts:355`), plus the post grade shader (`duel/duelVfx3D.ts:20-87`) — repo-wide grep on `src`.
- The Settings dialog offers the art look but no graphics-quality option — `src/components/SettingsModal.tsx:214` (grep for "quality" returns nothing).
- The map canvas and its WebGL context stay alive under the other scenes and are paused, not destroyed: `paused` is true once the city view covers (700 ms after opening), during duels, tactical battles and war scenes — `src/App.tsx:2060-2065`, `:424`; frame loop early-out at `WebGLStrategyMap.tsx:618`. Measured: with the tactical modal open the page issued 0 WebGL draw calls.
- Geometry merging is the shared draw-call strategy: `mergeRigid` collapses every rigid cluster into one mesh per material and bakes plain colours into vertex colours of two shared "palette" materials — `duel/duelGeometry3D.ts:211-282`. It is used by the duel rig (`duel/duelModels3D.ts:860`), map cities (`map/mapCities.ts:226`) and the city kit (`city/cityParts.ts:447-458`).

#### Campaign map (`src/components/WebGLStrategyMap.tsx`, `src/components/map/`)

- Camera and controls: perspective, FOV 36° (re-fitted to 30–58° on resize), near 0.5, far 600; OrbitControls with polar angle limited to 0.14–0.98 rad, distance 26 to `fitDistance x 1.25`, zoom to cursor — `WebGLStrategyMap.tsx:234-261`, `:455-464`. The camera can never see a horizon.
- Stage: a 900x900 flat `MeshBasicMaterial` "table" plane, a lacquer tray box (`MeshStandardMaterial`, roughness 0.42) and a thin gilt rim box (metalness 0.8) — `:272-293`. Background is a single dark colour (`:232`).
- Terrain mesh: one `PlaneGeometry(100, 66, 320, 211)` = 135,040 triangles, displaced in the vertex shader from a height texture, never frustum-culled — `map/mapTerrain.ts:298-305`, `:26-33`, `:350-351`. World sheet is 100x66 units for a 1000x660 map (`map/mapWorld.ts:13-14`).
- Height data: real elevation baked once from AWS Terrain Tiles zoom 6 into `public/map/china_height.png`, 1024x676, 8-bit greyscale, sqrt-encoded to 6,500 m — `scripts/build-terrain.mjs:1-9`, `:23-27`, `:109`. At load it is box-blurred (radius 1, 2 passes) and remapped with `7.4 x (m/5200)^0.66` — `map/mapWorld.ts:16-27`, `:196-218`.
- Runtime data textures (no mipmaps, linear or nearest filtering): height RG half-float 1024x676 (`mapWorld.ts:219-224`); mask RGBA8 1024x676 with land, blurred coast distance, rivers, roads (`:184-194`); lake RG8 1024x676 (`:144-152`); province index RG8 512x338 nearest and border distance RG8 512x338 (`:226-278`); a float city table, one column per city (`mapTerrain.ts:307-320`). Land, rivers, lakes and roads are rasterised from the game's SVG path data into canvases at height-map resolution — `mapWorld.ts:120-177`; roads are 1.5-unit dashed quadratic curves between neighbouring cities (`:154-177`).
- Terrain shading is entirely in one fragment shader, unlit by scene lights: normals from four height taps (`mapTerrain.ts:98-104`); a fixed light direction and a two-tone shade ramp plus curvature darkening (`:122-126`); six flat pigment colours blended by altitude (plain, low hill, malachite, azurite, high rock, snow) with a slope tint and one 4-octave value-noise mottle (`:128-142`); rivers as one flat colour through the mask (`:144-146`); lakes as a two-colour shelf gradient with a sine ripple line (`:147-151`); roads as a pale tint (`:152`); sea as a two-colour shelf gradient with shore-parallel sine ripple lines and grain (`:154-159`); drifting cloud shadows from fbm noise (`:163-165`); a complete second "paper" rendering — xuan-paper colour with grain, ink relief hatching from slope and shade, pale washes, ink lake shores (`:167-183`); an ink shoreline stroke (`:187-189`).
- Realm rendering in the same shader: nearest-city ownership from the province texture with an fbm warp of the lookup (`:191-198`), realm washes with rim emphasis (`:215-223`), fine city borders (`:225-228`), heavy brushed province borders with a pale edge (`:230-235`), selected-city and hovered-province glow (`:237-242`), and an animated "ink soak" when a city changes owner (`:204-211`, driven from `:354-367`).
- Zoom levels: one value `level` (0 cities, 1 provinces) and one `paper` value follow camera distance; relief is flattened to 16 % in paper view — `WebGLStrategyMap.tsx:684-697`, `mapTerrain.ts:9`. Chief cities scale 0.94 → 1.32 as the view pulls back, minor cities shrink to nothing and are replaced by DOM dots — `:82-83`, `:722-746`, `:1144-1160`.
- City miniatures: built from one unit box, one 4-sided cone (as a hip roof) and one low sphere (`map/mapCities.ts:73-76`): earth slab, four wall boxes with a darker walkway strip, a gate block with a dark door box, plaster box and roof, two banner poles with flat banner slabs, corner towers from tier 3, 3–12 house boxes with pyramid roofs placed by a seeded scatter, a 1–3 storey hall, a gold sphere finial for capitals — `:128-228`. Five size tiers 2.0–4.0 units and house counts 3/5/7/9/12 (`:21-22`). Two shared materials only: matte (roughness 0.82, metalness 0.02) and metal (0.35 / 0.85), colours baked per vertex (`:51-58`). Models are rebuilt when owner, tier or rounded defence changes (`:27-29`, `WebGLStrategyMap.tsx:728-735`).
- Measured: near view with most cities drawn = 91 draw calls and 149,686 triangles; minus the 135,040-triangle terrain this leaves about 14,600 triangles for 32 cities, their blobs, rings and the tray (about 450 triangles per city).
- Army on the march: the duel's full horse-and-rider rig is reused at scale 1.55 x clamp(camDist/54, 0.72, 2.1), with a 96x160 canvas banner (flat colour, gold frame, one glyph) on a 4x6-segment plane whose vertices are waved by a sine each frame; gait is `gallop`, then `rear` + `victory_raise` on arrival — `map/mapArmy.ts:11`, `:39-74`, `:107-152`. Past marches are flat brushed arrow ribbons (28 segments, `MeshBasicMaterial`, opacity 0.72) — `:163-251`; the planned route is the same ribbon in gold with pulsing opacity (`WebGLStrategyMap.tsx:833-893`).
- Particles: 150 `THREE.Points` with an untextured `PointsMaterial` (size 0.26, opacity 0.55), tinted per season and moved on the CPU — `WebGLStrategyMap.tsx:524-540`, `:895-910`.
- Everything textual is DOM positioned from projected coordinates every frame: city plaques with name, garrison, event seal and 28 px portrait thumbs, province names in a brush font, paper-map seals and dots — `:914-957`, `:1040-1282`.
- `renderer.compileAsync` is awaited before the first frame on this scene only — `:563-567`.
- Flat fallback: an SVG map with CSS-3D tilt, `feTurbulence`/`feDiffuseLighting` relief filter and a 2D "atmosphere" canvas (7 cloud ellipses, 34–68 seasonal particles, lantern pulses, smoke puffs) is still in the code, used only with `?mapMode=2d` or after a WebGL failure — `src/components/StrategyMap.tsx:192-196`, `:497-516`, `:566-600`; `src/components/MapAtmosphereCanvas.tsx:65-102`, `:137-272`; `captures/map_2d_fallback_svg.png`.

#### City close-up (`src/components/CityStage3D.tsx`, `src/components/city/`)

- Camera: FOV 34°, near 2, far 4200; OrbitControls polar 0.32–1.34 rad, distance 24 to `(outer x 3.7 + 34) x 1.42`; the camera glides to district goals and shifts its view offset when a panel opens — `CityStage3D.tsx:95-109`, `:133-145`, `:165-168`, `:315-348`.
- Build kit (`city/cityParts.ts`): seven shared `MeshStandardMaterial` surfaces — `matte` (roughness 0.86) and `metal` (0.38 / 0.85) untextured; `roof`, `wall`, `pave`, `earth`, `field` each with one greyscale tiling canvas colour map multiplied by vertex colour (`:325-352`). Texture sizes: roof tiles 128² (8 half-round columns, 4 course lines, 260 specks; `:53-77`), wall courses 256² (16 rows of blocks, 1,800 specks, 44 vertical soot streaks; `:80-105`), paving 256² (8x8 slabs; `:107-122`), earth 256² (90 blotches, 1,400 specks; `:124-144`), furrows 128² (8 gradient rows; `:146-161`). Anisotropy 8, sRGB (`:40-44`). World-space repeat: roof 3.6, wall 5.6, pave 6.4, earth 15, field 4.4 units (`:164-170`); wall, pave and earth UVs are re-projected from world position after merging (`:173-186`, `:453-454`).
- Primitives: unit box; "batter" box whose top is 80 % as deep (`:375-380`); 10-sided cylinders/cones (`:413-423`); a hipped roof made of four curved slopes, 6x5 quads each (240 triangles), with sagging slopes and up-turned corners (`:204-257`); flat field patches (`:429-438`). `finish` merges all of a town into one mesh per surface material (`:447-458`).
- What a city contains (`city/cityScene.ts`): battered curtain walls with walkway, parapet and merlons from defence 2, projecting towers from defence 4 and roofed towers at 5 (`:270-299`); gatehouses with a dark box as the gateway, stone jambs, two open door leaves, a 0–2 storey gate tower, banner poles and bronze braziers (`:344-386`); roads and moat bridges (`:388-397`); corner towers (`:404-423`); packed-earth floor and streets, paved from tier 3 (`:441-457`); the hall compound with fence walls, gate, podium, main hall (double-eaved for tier ≥ 4 or a capital, gilt crest for a capital), side halls, palace gate towers (`:460-536`); houses on a 6.6x5.9 grid with density 0.44–0.95 by tier, thatch or one of four tile tones, a dark door slab, optional smoke source (`:591-626`); granaries as three stacked cylinders (`:627-640`); market shops, awnings, a tower and up to 26 stalls of four posts, a cloth pyramid, a counter and three goods boxes (`:649-757`); palisaded barracks with rows, a drill ground, tents, weapon racks, watchtower (`:760-885`); field patches with season/event palettes, farmhouses and haystacks (`:888-975`); fair booths or plague tents outside the gate (`:978-1012`); quays, moored boats and warehouses for river ports (`:1015-1044`). `hallBlock` is the one building recipe reused for every official building (`:98-150`).
- State dressing already in the scene: breach with rubble and scaffold (`:312-331`), governor's works scaffolds (`:336-342`, `:688-704`, `:914-923`), riot crowd, burning stall and fires (`:541-552`, `:705-720`), grain relief queue (`:553-571`), festival lanterns (`:572-587`), drill formations by drill band (`:800-840`), harvest stooks (`:949-959`), flood sheets (`:1195-1219`).
- Uncommitted additions seen at 09:05: a steamship hull at the quay with animated paddle wheels (`:1045-1069`, `:1392-1416`), aqueduct troughs and two turning waterwheels of torus rims and boxes (`:1075-1090`, `:1361-1391`), a tethered balloon — 18x14 sphere envelope, band, basket, ropes, burner sprite (`:1092-1099`, `:1418-1497`), a governor's pennant with a 128x256 canvas texture carrying a glyph and "太守" (`:1101-1109`, `:1499-1543`), and a "wayfarer pavilion" with a metal-palette roof, glow sprite and extra point light (`:1111-1129`, `:1545-1565`) — `captures/city_myth_jiangling_new_props_overview.png`, `captures/city_myth_jiangling_new_props_hall_pennant.png`.
- Figures: one body `BoxGeometry(0.4, 0.74, 0.28)` and one head `SphereGeometry(0.17, 8, 6)` for soldiers and townsfolk alike, drawn as `InstancedMesh` with per-instance colour; soldiers add an instanced box "spear" — `cityScene.ts:1136-1187`. Drill-ground strength is `min(cols x rows, 240, troops/120)` (`:799`).
- Environment (`city/cityEnvironment.ts`): one 1400x1400 ground plane with 230x230 segments (105,800 triangles) displaced on the CPU by a height function that is flat under the town and rises into terrain-specific hills (`:135-170`); vertex colours for grass/earth/banded rock/snow/mud (`:173-203`) over one 256² speckle texture repeating every 16 units (`:205-226`); water as flat planes with a 128² streak texture, roughness 0.2, scrolled by UV offset (`:231-279`, `:452-453`); 620 or 900 trees placed by noise as two `InstancedMesh`es — pine = 6-sided trunk + 3 seven-sided cones (66 triangles), leafy = trunk + 4 squashed icosahedra (344 triangles) — with per-instance tint (`:82-121`, `:281-346`); a sky dome `ShaderMaterial` with a two-colour gradient, a sun-side glow and sine "cloud bars" (`:349-395`); sun, fill and hemisphere lights (`:397-416`); 14 or 30 mist sprites drifting on a sine (`:418-443`, `:454-456`).
- Lights and emissive dressing: lamps, lanterns and fires are additive `Sprite`s using a 64² glow texture with HDR colour multipliers (`cityScene.ts:1237-1297`); real light comes from four fixed warm point lights at the gate, hall, market and barracks and up to three fire lights (`:1292`, `:1298-1304`); hearth smoke is 4 sprites per source for at most 16 sources, fire smoke 11 dark sprites per fire, each sprite with its own cloned material (`:1306-1351`).
- Motion: flags yaw as rigid 1x1-segment planes (`:1222-1235`, `:1604`); lamp and fire sprites flicker in scale (`:1589`, `:1605-1607`); smoke rises and fades (`:1335-1350`); water UVs scroll; mist drifts; companies shuffle and bob only while the governor's task is `drill` (`:1591-1603`); the new wheels and balloon turn and bob (`:1608-1626`). Houses, trees, townsfolk, stalls, boats and fields never move.
- The shadow map is rendered once per build ("Nothing that casts a shadow moves", `CityStage3D.tsx:87-88`), although flags, drilling ranks and the new balloon envelope are shadow casters that move (`cityScene.ts:1232`, `:1166`, `:1437`).
- Measured for Chengdu (capital, mountain terrain, myth): 286,040 triangles in the scene = ground 105,800 + 258 leafy trees 88,752 + 646 pines 42,636 + all roofs 14,220 + all matte parts 12,328 + 113 soldier heads 9,040 + all walls 4,660 + 42 townsfolk heads 3,360 + everything else < 5,000; 45 meshes, 7 instanced meshes, 83 sprites, 7 lights, 24 geometries, 28 textures, 26 shader programs, 129 draw calls per frame with post, world build time 136 ms. Other cities: Jianye classic 121 calls / 321,813 triangles / 147 ms; Jiangling riot 158 / 299,561 / 142 ms; Jiange fortress 83 / 249,201 / 118 ms; Jiangling with the new props 172 / 302,143 / 142 ms (98 meshes, 115 sprites).
- The post chain is disposed and rebuilt on every resize instead of resized — `CityStage3D.tsx:243-253`.

#### Cavalry duel (`src/components/DuelStage3D.tsx`, `src/components/duel/`)

- The stage is a `aspect-[21/10]` box inside a `max-w-4xl` modal (`src/components/DuelModal.tsx:335`, `DuelStage3D.tsx:864`); at a 1600x900 window it measured 852x405 CSS px — `captures/duel_myth_plains_idle_fullscreen.png`.
- Camera: FOV 34° base, near 0.2, far 200, driven by sampled choreography with cuts, exponential follow, trauma shake, punch-in and roll — `DuelStage3D.tsx:229`, `:732-788`.
- Horse-and-rider rig (`duel/duelModels3D.ts:356-880`): bodies are Catmull-Rom lofts over elliptical rings (`duel/duelGeometry3D.ts:69-145`) — barrel 12 rings x 18 radial (`:427-441`), neck 14 radial (`:512`), skull 12 (`:554`), legs 10 and 8 (`:151`, `:162`), saddle cloth as a partial-arc loft (`:456-468`), rider torso 14 (`:722-734`); haunch and shoulder muscles are scaled spheres (`:443-453`); rider limbs are tapered cylinders with sphere joints (`duelGeometry3D.ts:150-174`, `duelModels3D.ts:666-677`, `:810-838`); belt, collar, stirrups are tori; pauldrons are partial spheres; armour skirt plates are boxes (`:679-688`); the head is a sphere with a cone nose (`:788-794`); the tail is a chain of 7-sided cylinders and the mane a row of lock meshes (`:524-537`, `:611-625`); the cloak is a 6x9 plane re-shaped each frame (`:776-782`, `:1399-1416`); reins are two thin planes (`:707-715`). Weapons are extruded 2D shapes, cylinders, cones, tubes and tori (`duel/duelWeapons3D.ts:48-49`, `:101-246`).
- Rig materials (`duelModels3D.ts:370-410`): horse coat = 256² canvas colour map + 256² bump map, bumpScale 0.6, roughness 0.46; armour = 256² lamellar colour + bump tiled 3x3, bumpScale 1.4, roughness 0.34, metalness 0.78; saddle cloth = 256² brocade canvas; face = 256² painted canvas (skin tone, hairline, eyes, brows, beard, scars; `duel/duelTextures3D.ts:487-671`); cloak, robe, mane, hair, leather, skin, hooves are flat colours baked into a shared matte palette (roughness 0.68); trim is baked into a metal palette (roughness 0.27, metalness 1, `envMapIntensity 1.2`).
- Measured: staging one marching general on the map with the camera held still raised that scene from 91 to 149 draw calls, from 149,686 to 166,798 triangles, from 42 to 100 geometries and from 8 to 15 textures — so one rig with its weapon, pole and flag is about 17,100 triangles, 58 draw calls and 7 canvas textures (`mapDebug` hook, `renderer.info`).
- Arena (`duel/duelArena3D.ts`): sky sphere with an 8x256 gradient texture (`:323-329`); a painted backdrop — one of four 1376x768 images, upper band only — on a 64-segment cylinder of radius 46 spanning 150°, mirrored at the ends, tinted by the look (`:331-350`, `duelTextures3D.ts:359-374`); a 150x150 ground plane, 60x60 segments, with a 512² trampled-earth canvas (150 blotches, 90 hoof-print arcs, 5,200 specks, 70 pebbles) as colour and bump map repeated 14x14, bumpScale 2.2, vertex-coloured from an inner to an outer tone (`:353-387`, `duelTextures3D.ts:217-314`); for fortress terrain a 70x6x2.4 box wall with a 256² brick map and bump, box merlons, a box gate hall, a 4-sided cone roof and six emissive lantern spheres (`:391-435`); braziers of a cylinder stand, a bowl, and two emissive cones as flame with a flickering point light (`:437-468`); 14 mist sprites in myth (`:471-491`); two war drums (`:586-610`); six banners, 1.5x3.2 planes of 6x12 segments with a 128x256 canvas (gradient, double gold frame, roundel, one glyph) (`:613-656`, `duelTextures3D.ts:317-352`).
- Spectators: 156 foot soldiers (2 sides x 3 rows x 26) wrapped round the duel, each side three `InstancedMesh`es (armour, iron, flesh+wood); the soldier is merged cylinders, spheres, a box shield, a cone crest and a spear, roughly 640 triangles (`duelArena3D.ts:494-584`). All instances of a side share one material and colour; scale varies ±6 % (`:567`).
- Effects (`duel/duelVfx3D.ts`): 220 additive spark points plus 220 velocity streak lines (`:167`, `:221-264`, `:452-468`, `:513-551`); a pool of 72 dust sprites (`:266-291`); one star-burst flare sprite and one ground shock-ring plane (`:293-326`); 130 drifting ember points (`:328-355`); two weapon-trail ribbons splined through 9 samples x 3 subdivisions (`:135-137`, `:360-450`); armour hit-flash by emissive (`duelModels3D.ts:413-417`, `:1445-1451`); screen-space radial blur (10 taps), chromatic fringe, flash, tint and vignette in the grade pass (`duelVfx3D.ts:51-84`); letterbox bars and a "chrono" frame as DOM (`DuelStage3D.tsx:872-891`).
- Animation is procedural: choreography functions return per-frame targets (`duel/duelChoreography.ts`, 881 lines), poses are blended from a small pose library (`duelModels3D.ts:917-1046`), horse legs and rider arms are solved by two-bone IK (`:1048-1104`), gaits are gallop/trot/rear, mane, tail and cloak sway from sines (`:1309-1320`, `:1399-1416`); banners are re-waved and their normals recomputed each frame (`DuelStage3D.tsx:708-721`); spectators only bob as two rigid groups when cheering (`:722-724`); hit-stop freezes the simulation clock (`:418-423`).

#### War theater (`src/components/WarStage3D.tsx`, `src/components/WarSceneModal.tsx`)

- Full-screen modal (`WarSceneModal.tsx:1021`, `:1105-1111`); measured canvas 1600x827 at a 1600x900 window. A scripted 5.4-second scene (`WarSceneModal.tsx:99`, `WarStage3D.tsx:1016-1020`).
- Reuses the duel's look table, sky gradient, painted backdrop (radius 52, 165°), ground textures and banner texture — `WarStage3D.tsx:164`, `:217-251`, `:287-317`, `:443-456`.
- Land armies: the same merged toy-soldier geometry as the duel's spectators but with a levelled spear; 24–64 figures per side scaled to troop ratio (`:499-562`, `:548-549`); three `InstancedMesh`es per side; matrices rewritten on the CPU every frame (`:1095-1148`). Motion is translation only: an eased advance, a ±0.28 lunge, a small vertical bob, a turn and retreat for the loser, and a 85° topple for the fallen (`:1106-1141`). Commanders are two duel rigs at 1.06 scale cycling four poses (`:465-481`, `:1056-1093`).
- River battles: 3–6 ships per side, each a separate group of an extruded hull, box cabins, a 4-sided cone roof, a ram cone, lantern spheres, a mast and a flat sail carrying the banner texture or (steam) a funnel and a cylinder paddle wheel, ten box oars, and a flat ring as wake; meshes are not merged or instanced (`:613-768`). The water is a 160x140 plane of 72x56 segments with vertex colours, emissive tint, roughness 0.24–0.32, moved by two sines on the CPU without recomputing normals (`:254-285`, `:1022-1032`).
- Props: fortress rampart box with one 256² stone texture, merlons, box hall, cone roof, two lantern spheres (`:72-102`, `:320-380`); balloon of a sphere, torus, cylinder basket and emissive burner (`:382-413`); four banners on land only (`:418-463`).
- Effects: 56 instanced arrows of an emissive cylinder+cone on parabolas in four volleys (`:770-798`, `:1174-1198`); up to four shells with an additive core sphere, flare sprite, ground ring and three smoke sprites each, plus a point-light flash and camera shake (`:800-882`, `:1200-1255`); 18 dust sprites and 10 clash-spark sprites on loops (`:884-913`, `:1257-1285`); in myth 16 mist sprites and 70 ember points (`:915-955`, `:1302-1325`).
- No `scene.environment` is set in this file, the map, or the city (grep: only `DuelStage3D.tsx:226` sets one), so metal-rough materials here (iron 0.84 metalness, `:528-534`) are lit only by direct lights.
- A 2D canvas version of the war scene remains in `WarSceneModal.tsx` as a fallback (`:1105`, `:1131-1135`).

#### Tactical board (`src/components/tactical/`, `src/components/TacticalVfxCanvas.tsx`, `src/components/TacticalBattleModal.tsx`)

- The 8x8 field is one 1024x1024 Canvas 2D painting composed at battle start from eight 1024² tile paintings: a repeating plains pattern spanning 2.6 cells (`TacticalBoardCanvas.tsx:79-89`); hill, forest, water and ford "washes" laid through blurred circular masks with a multiplied dark rim (`:91-148`); bridge and citadel as clipped rounded-rectangle pieces with a drop shadow (`:151-171`, `:409-418`); ford stones drawn as ellipses (`:173-218`); walls as the wall tile per cell joined along their run, with a vector-drawn gatehouse or breach (`:220-399`); five random soft-light gradients (`:422-435`); a vignette (`:480-484`); 2 px grid lines (`:486-495`). It is repainted only when the grid signature or look changes (`:498-518`).
- Units are DOM: a bust portrait (256 px AVIF thumb) in an arched frame, a gradient ellipse plinth, a class icon, a morale pennant, a two-layer strength bar and emoji status glyphs — `tactical/UnitToken.tsx:107-195`. Threat lines are SVG dashed strokes — `tactical/ThreatLines.tsx:16-59`.
- A transparent Canvas 2D overlay (580 logical px, displayed at about 650 CSS px in the capture) animates ten wind streaks, fire on burning tiles (radial glow, three Bézier flame tongues, sparks), shock rings, slash arcs, arrows/fireballs and particles — `TacticalVfxCanvas.tsx:190-391`.
- The board is capped at `min(680px, 100vh − 15.5rem)` (`TacticalBattleModal.tsx:1056`); an optional CSS perspective tilt exists (`index.css:748-755`).

#### Status of the previous study's rendering recommendations (`reports/Strategy game visual craft study.md`)

- AVIF with JPG fallback and 256 px thumbnails: done — `src/utils/art.ts:1-45`, `public/` inventory in section 4.
- Map atmosphere (cloud shadows, distance fog, one grade): done inside the terrain shader — `mapTerrain.ts:163-165`, `:244-247`, `:253-272`; no tilt-shift.
- One WebGL map with a paper far zoom, mode buttons and a table frame: done, but the paper map is a procedural shader view, not the painted ink-wash illustration the report proposed — `mapTerrain.ts:167-183`, `WebGLStrategyMap.tsx:272-293`, `StrategyMap.tsx:197-200`.
- Territory as an ID texture with shader borders and ink-bleed conquest: done — `mapWorld.ts:226-278`, `mapTerrain.ts:191-235`.
- Exaggerated relief from open elevation data, rivers/coast from masks: done — `scripts/build-terrain.mjs`, `mapWorld.ts:120-218` (blurred raster masks, not true distance fields).
- Tiered procedural cities and a general-with-banner army miniature: done — `map/mapCities.ts`, `map/mapArmy.ts`.
- Shared renderer, three quality tiers, merged post pass, `compileAsync` on every transition: not done — four renderers (lines above), no tier system, `compileAsync` only at `WebGLStrategyMap.tsx:564`.
- "Prefer Neutral or AgX tone mapping to ACES" (report line 82): not followed — ACES in city, duel and war (`CityStage3D.tsx:84`, `DuelStage3D.tsx:189`, `WarStage3D.tsx:172`).
- Bloom at half resolution: not done — bloom runs on the full composer target (`duelVfx3D.ts:105-112`).
- Tactical painted battlefield, bust tokens, threat lines; full-screen war scene with crowds and a verdict seal; duel ring of soldiers: done — files above, `captures/war_myth_river_verdict_card.png`, `duelArena3D.ts:557-561`.
- Git history for these: `651a8b7` (2026-11-23, one 3D map), `ac8c762` (ink look, AVIF), `4c86e45` (duel rigs and arenas), `d804620` (3D war theater), `bdd88e0` (2026-11-25, city close-up and myth default), `faf25cd` (city state dressing) — `git log`.

### Inferences
- Because walls, roofs, paving and earth share one small texture each for a whole city (and all cities), every wall in the game is the same 256² image at the same world scale; variety can only come from vertex colour. The same holds for the duel/war ground (one 512² tile) and every suit of armour (one 256² lamellar tile recoloured).
- The triangle budget is spent where the eye is not: in the city about 83 % of triangles are ground and trees, while the entire built town (walls, roofs, houses, hall, market, about 32,000 triangles) is smaller than the tree instances, and soldier heads (9,040) outweigh the walls (4,660). In the duel roughly 200,000 of about 279,000 per-frame triangles are the 156 spectators drawn in the colour and shadow passes (156 x ~640 x 2, counted from `duelArena3D.ts:502-529`); the two hero rigs are about 34,000 (68,000 with their shadow pass).
- With `antialias: true` and a 4x MSAA composer target at the same time, the war scene in myth allocates multisampled storage twice; at dpr 2 full screen the composer target is 3200x1654 half-float with 4 samples.
- The city post chain reads the look once when created (`duelVfx3D.ts:114`), and is recreated only on resize, so a look switch made while a city is open probably leaves the grade's `uMyth` stale until the next resize (not tested).
- Since `renderer.shadowMap.autoUpdate` is false in the city, the shadows of flags, drilling companies and the new balloon are frozen in their build-time pose (code reading; visible as a fixed balloon shadow in `captures/city_myth_jiangling_new_props_overview.png`).

### Gaps
- Exact per-rig and per-scene mesh counts for the duel and war scenes were not read from the scene graph (no debug hook exposes the scene); figures there come from the WebGL call counter and from reading geometry constructors.
- `duelChoreography.ts` and the pose code in `duelModels3D.ts:880-1462` were skimmed, not read line by line; animation statements cite the parts that were read.
- The 2D fallback war scene in `WarSceneModal.tsx` and the SVG fallback map were not audited in detail.
- DOM-only screens (title, faction select, panels, portraits, `src/utils/parallax.ts`) are outside this audit.

---

## 2. What differs between the "myth" and "classic" looks in each scene?

### Takeaway
The two looks share all geometry, textures and effects code; "myth" (the default) is a relight and regrade — darker skies, lower fill, denser fog, mist sprites, firelight, cold-shadow/bronze-highlight grading and desaturation — and in the war theater it is the only look that gets bloom and a grade at all.

### Cited Findings
- Selection: `myth` is the default; `?look=classic|myth` previews, a saved setting persists, 3D scenes read the look when built — `src/utils/artLook.ts:3-14`, `:17-18`, `:25-36`.
- Map: background and table colour `0x090a0b` vs `0x15110d` (`WebGLStrategyMap.tsx:232`, `:275`); hemisphere light cool 0.7 vs warm 1.25 and sun 1.7 vs 1.9 (`:263-268`); tray and rim darker (`:282`, `:289`); in the shader `uMyth` desaturates to 58 %, applies gamma 1.32 x 0.82, split-tones cold shadows and bronze lights, adds a second drifting fbm "mist" over lowlands, turns the paper sheet into tea-stained "silk" with its own mottling, and darkens radially by 38–52 % (`mapTerrain.ts:249-272`). City models, particles, borders and labels are identical — `captures/map_myth_far_realm.png` vs `captures/map_classic_far_realm.png`; `captures/map_myth_near_cities.png` vs `captures/map_classic_near_cities.png`.
- City: sky top/horizon/glow colours, hemisphere 1.5 vs 2.1, sun 5.6 vs 6.0, fill 1.9 vs 1.5 (`cityEnvironment.ts:349-351`); fog density 0.0021 vs 0.0013 and exposure 1.0 vs 0.86 (`:447-448`); mist 30 sprites at opacity 0.17 vs 14 at 0.09 (`:423-430`); water colour (`:254-258`); soldier iron tone (`cityScene.ts:1188`); lamp, lantern and fire sprite brightness x3–3.4 vs x1.6–2 (`:1242`, `:1260`, `:1278`); warm point lights 46 vs 20 and fire lights 90 vs 40 (`:1292`, `:1301`); smoke tint (`:1310`); plus the post grade's myth branch (`duelVfx3D.ts:72-80`, `:83`) — `captures/city_myth_chengdu_overview.png` vs `captures/city_classic_jianye_river_overview.png`.
- Duel: `mythLook` overrides sky stops, fog colour and density (0.026–0.03 vs 0.012–0.017), ground tones, sun colour/intensity/position, hemisphere and fill, exposure (1.15–1.2 vs 0.98–1.18), forces torches on except on the river, multiplies the painted backdrop by a dark tint (0.30–0.50), adds mist (0.75–1.0) and pulls spectator armour 42–46 % toward dark iron — `duelArena3D.ts:51-158`, classic base `:166-261`, switch `:160-164`; the grade pass desaturates to 74 %, split-tones and adds 0.1 vignette (`duelVfx3D.ts:72-83`) — `captures/duel_myth_plains_idle_stage2x.png` vs `captures/duel_classic_plains_idle_stage2x.png`.
- War: same look table; myth alone adds a lens-side torch light (`WarStage3D.tsx:205-211`), 16 mist banks and 70 embers (`:915-955`), darker water (`:262-282`), and the whole bloom + grade chain (`:956-960`); classic renders straight to the canvas (`:1327-1328`) — `captures/war_myth_plains_melee_early.png` vs `captures/war_classic_plains_melee_blast.png`.
- Tactical: after painting, myth applies a 34 % saturation pull, a cool multiply, screen-blended mist over water and six random spots, one warm soft-light glow from the south-west and a heavier vignette (`TacticalBoardCanvas.tsx:437-484`); the CSS art grade is `saturate(0.8) contrast(1.1) brightness(0.93)` vs `saturate(0.98) contrast(1.04)` (`index.css:1063`, `:194`) — `captures/tactical_myth_river_board2x.png` vs `captures/tactical_classic_mountain_board2x.png`.
- Interface: myth only overrides palette tokens (slate, amber, rose, emerald, ink/paper/gold/seal), panel gradients and shadows — `index.css:993-1160`.

### Inferences
- Classic exposes the primitive geometry more than myth does: in bright even light the peg soldiers, tube limbs and flat coats are plainly visible (`captures/duel_classic_plains_idle_stage2x.png`, `captures/war_classic_plains_melee_blast.png`), while myth hides part of it in shadow, fog and bloom. An upgrade judged only under myth will under-estimate the model-detail gap.
- Because classic war has no bloom, its HDR emissive colours (blast core, arrows, lanterns) clip to flat shapes; the same assets look acceptable under myth only because of the post chain.

### Gaps
- The classic look was captured for the map (far, near), one city, the duel (idle), the war theater (land) and the tactical board (mountain), not for every terrain and time of day.
- Night and mountain arena variants were captured only once (night fortress, myth).

---

## 3. Which details exist only as flat colour or simple shapes, where does repetition show, and where is there no ambient motion?

### Takeaway
Almost every surface a viewer would expect to carry material detail is a flat vertex colour or one small tiling procedural texture on a box, cylinder, cone or sphere; people are pegs or merged-primitive toy soldiers cloned without variation; water is a flat plane everywhere; and outside the duel most of each scene is static.

### Cited Findings
Ground
- Map terrain: six altitude colours, a slope tint and one low-frequency noise mottle; no ground texture, vegetation, farmland or rock detail at any zoom — `mapTerrain.ts:128-142`; `captures/map_myth_near_cities.png`.
- City ground: vertex colour over one 256² speckle tile repeating every 16 units; hills are a smooth displaced grid of 6.1-unit cells (1400/230) — `cityEnvironment.ts:164-226`; `captures/city_myth_jiange_fortress_winter.png`.
- Duel/war ground: one 512² tile repeated 14x14 over 150 units, vertex-coloured; beyond the ring it is a featureless fogged plane up to the painted backdrop — `duelArena3D.ts:353-387`; `captures/duel_myth_wide_arena_ring2x.png`.

Walls, gates, doors
- Map cities: untextured boxes; the gate is a darker box — `mapCities.ts:147-166`.
- City walls: battered boxes with one 256² course texture every 5.6 units; the gateway is a box painted `0x15120e`; doors of halls and houses are dark slabs; there are no windows, columns, brackets, steps or rammed-earth layering — `cityScene.ts:270-283`, `:348-356`, `:136`, `:617`; `captures/city_myth_chengdu_gate_lowangle.png`, `captures/city_myth_chengdu_hall_close.png`.
- Duel/war fortress: one box with a tiled brick map, box merlons, a box hall and a 4-sided cone — `duelArena3D.ts:391-425`, `WarStage3D.tsx:320-364`; `captures/duel_myth_fortress_night_stage2x.png`.

Roofs
- Map: 4-sided cones, flat colour (`mapCities.ts:74-75`, `:98-115`).
- City: curved hipped shells with a 128² stripe texture; ridge is a box, no eave tiles, ridge beasts or underside structure; the roof is an open double-sided shell (`cityParts.ts:204-257`, `:354`; `cityScene.ts:128-133`).

Armour, cloth, skin, faces
- Hero armour: one lamellar tile recoloured per hero; cloak, robe and sleeves flat colour; hands are spheres; the face is a texture on a sphere and the beard is geometry-free paint or a slab — `duelModels3D.ts:376-379`, `:788-794`, `:833`; `duelTextures3D.ts:41-102`, `:635-668`; `captures/duel_myth_closeup_left_rider2x.png`.
- Rank and file: one colour per side for armour, one iron, one flesh/wood; faces are bare spheres — `duelArena3D.ts:530-553`, `WarStage3D.tsx:528-546`; `captures/duel_myth_closeup_spectators2x.png`.
- City people: box and sphere, six cloth tones (`cityScene.ts:1136-1193`); `captures/city_myth_chengdu_market_close.png`.

Horse coat
- A left-right gradient with 700 faint strokes and a bump copy; dapples for two coats only; mane, tail and legs are flat mane colour — `duelTextures3D.ts:108-171`, `duelModels3D.ts:370-373`; `captures/duel_myth_closeup_right_horse2x.png`.

Water
- Map: rivers one colour through a mask; lakes and sea two-colour gradients with sine ripple lines (`mapTerrain.ts:144-159`).
- City: flat planes, one colour, a 128² streak texture scrolling; no shoreline geometry, reflection or depth cue (`cityEnvironment.ts:231-279`).
- War river: flat vertex-coloured plane with sine heave and fixed normals; wakes are flat rings (`WarStage3D.tsx:254-285`, `:736-740`, `:1022-1032`).
- Tactical: a painted tile, static (`TacticalBoardCanvas.tsx:147`).

Trees and vegetation
- Map: none. City: two low-poly instanced trees with per-instance tint; no grass, crops, reeds or bushes; fields are textured quads (`cityEnvironment.ts:82-121`, `cityScene.ts:939-948`). Duel/war: none in 3D, only in the painting.

Banners and flags
- Map city banners: flat slabs (`mapCities.ts:163-166`). City flags: untextured faction-colour rectangles swinging as rigid planes (`cityScene.ts:1222-1235`, `:1604`); the uncommitted governor's pennant is the first with a glyph (`:1499-1543`). Duel/war banners and the map army flag: canvas glyph textures on waved planes (`duelTextures3D.ts:317-352`, `mapArmy.ts:42-63`).

Crowds
- Duel 156, war 48–128, city up to 240 soldiers plus townsfolk; all are instances of one mesh per scene with no per-instance variation beyond ±6 % scale (duel) or a colour pick (city) — `duelArena3D.ts:540-584`, `WarStage3D.tsx:548-562`, `cityScene.ts:1146-1187`.

Sky
- Map: none (a dark table). City: a procedural gradient dome that the captures never show, because the camera's polar limit and the ring of skyline hills keep it out of frame (`cityEnvironment.ts:141-142`, `:349-395`; `CityStage3D.tsx:100-101`; `captures/city_myth_jiangling_horizon_sky_river.png`). Duel/war: the only real image content in any 3D scene — a painted 1376x768 backdrop on a cylinder under a gradient dome (`duelArena3D.ts:323-350`).

Fire and light sources
- Braziers are two emissive cones (duel) or a bare cylinder with a glow sprite (city); lanterns are emissive spheres; there is no flame animation beyond scale flicker — `duelArena3D.ts:437-468`, `DuelStage3D.tsx:725-730`, `cityScene.ts:1237-1297`.

Where repetition shows (seen in captures)
- City wall courses and soot streaks repeat along every wall face — `captures/city_myth_chengdu_gate_lowangle.png`, `captures/city_myth_chengdu_fields_low.png`.
- Roof stripes band and shimmer at distance and glancing angles — `captures/city_myth_chengdu_hall_close.png`, `captures/city_myth_jiangling_new_props_hall_pennant.png`.
- Paving is a perfectly regular slab grid — `captures/city_myth_chengdu_market_close.png`.
- Identical soldiers in ranks, all spears the same height — `captures/duel_myth_closeup_spectators2x.png`, `captures/war_myth_plains_melee_early.png`.
- Tactical plains pattern: the same curved dirt path recurs about every 2.6 tiles and tile-edge seams run as straight lines; the wall tile repeats per cell — `captures/tactical_myth_river_board2x.png`, `captures/tactical_classic_mountain_board2x.png`.
- Map far view: relief hatching forms a uniform worm-like pattern across hill country — `captures/map_myth_far_realm.png`, `captures/map_classic_far_realm.png`.

Where there is no ambient motion (code)
- Map: city models are static (no smoke, lights, traffic or banner motion); rivers do not flow; only cloud shadows, lake/sea ripple lines, 150 particles, selection rings and a march in progress move — `mapTerrain.ts:147-165`, `WebGLStrategyMap.tsx:757-764`, `:895-910`.
- City: townsfolk, stalls, boats, trees, fields, garrison (unless drilling) are static; see the motion list in section 1.
- Duel: spectators stand still except a group bob on cheers; drums are static; ground and backdrop static.
- War: backdrop, ground, fort, banners' poles static; soldiers have no limb motion.
- Tactical: board painting static; tokens move only on actions (CSS lunge/hit, `index.css:833-884`).

### Inferences
- The gap between the painted assets (portraits, tiles, backdrops) and the procedural 3D is widest exactly where they sit side by side: the duel HUD shows a painted portrait next to a sphere-headed rider, and the tactical tokens show painted busts over painted ground while the war scene shows the same generals as tube-limbed dolls.
- Faction colour is defined three different ways — map pigments `0x4c78a8 / 0x438554 / 0xc2432f` (`mapTerrain.ts:13-18`), duel `#1d4ed8 / #047857 / #be123c` (`duelArena3D.ts:281-286`), war `#2f5d8c / #2f6e49 / #a62c22` (`WarStage3D.tsx:30-35`) — so the same realm reads as a different hue from scene to scene.

### Gaps
- Whether the roof-stripe shimmer is objectionable in motion was judged from stills only.
- Winter, summer and the flood, fair, plague, harvest and drought dressings were not captured individually (only autumn riot/breach and a winter fortress).

---

## 4. What textures and images ship today, and are any loaded as WebGL textures?

### Takeaway
The shipped image set is 240 files, 65 MB on disk, all 2D paintings plus one height map; only five of them ever reach WebGL (four backdrops and the height map), and every other texture in the 3D scenes is a canvas of 512 px or less generated at run time.

### Cited Findings
- `public/` holds 85 JPG (57.7 MB), 154 AVIF (7.7 MB) and 1 PNG (0.47 MB); `public/art` 24 MB, `public/portraits` 42 MB, `public/map` 476 KB — measured with `find`/`du` on 2026-11-26.
- `public/art`: 16 paintings at 1376x768 (8 backdrops `bg_*`, 8 `tech_*`), each as JPG (0.65–1.0 MB) and AVIF (47–121 KB); 8 terrain tiles `tile_*` at 1024x1024 as JPG (0.79–1.2 MB) and AVIF (68–173 KB) plus a 256x256 AVIF thumbnail each — measured with `sharp` metadata.
- `public/portraits`: 61 images at 1024x1024 (57 named officers and 4 `unit_*` squad portraits), each as JPG, AVIF and a 256x256 AVIF thumbnail (183 files).
- `public/map/china_height.png`: 1024x676, 8-bit greyscale, 482,644 bytes — `scripts/build-terrain.mjs:17`, `:23-24`.
- Loading policy: AVIF when the browser decodes a probe image, else JPG; thumbnails for portraits and tiles — `src/utils/art.ts:6-45`.
- Loaded as WebGL textures: (a) the battle backdrop for the duel and war theater via the only `TextureLoader` call in the codebase, sRGB, mirrored repeat, anisotropy 8, one of `bg_plains_siege`, `bg_mountain_pass`, `bg_yangtze_river`, `bg_night_raid` — `duel/duelTextures3D.ts:359-374`, `duel/duelArena3D.ts:169,193,217,240`; (b) the height map, decoded through a 2D canvas into a half-float `DataTexture` — `map/mapWorld.ts:116`, `:196-224`.
- Not loaded as WebGL textures: portraits (DOM images), tech paintings (DOM), faction backdrops (DOM), tile paintings (drawn into the tactical board's 2D canvas, `TacticalBoardCanvas.tsx:6-16`, `:62-89`).
- Run-time procedural textures and their sizes: lamellar armour 256² colour + bump (`duelTextures3D.ts:41-102`); horse coat 256² colour + bump (`:108-171`); caparison 256² (`:174-214`); trampled ground 512² colour + bump (`:217-314`); silk banner 128x256 (`:317-352`); sky gradient 8x256 (`:377-384`); dust puff 128² (`:387-405`); glow 64² (`:408-418`); impact flare 256² (`:421-454`); shock ring 256² (`:457-468`); weapon trail 64² (`:471-481`); hero face 256² (`:487-671`); fortress brick 256² colour + bump (`:674-715`); war stone wall 256² (`WarStage3D.tsx:72-102`); city roof 128², wall 256², paving 256², earth 256², furrows 128² (`cityParts.ts:347-351`); city ground speckle 256² and water streaks 128² (`cityEnvironment.ts:205-251`); district glow 128² (`cityScene.ts:224-237`); governor pennant 128x256 (`:1501-1525`, uncommitted); map city blob shadow 64² (`mapCities.ts:231-241`); map army flag 96x160 (`mapArmy.ts:42-58`).
- Fonts are not shipped; they load from Google Fonts (Crimson Pro, Inter, Ma Shan Zheng, Noto Serif SC) and canvas glyph textures depend on them being ready — `index.html:7-10`, `duelTextures3D.ts:346`, `mapArmy.ts:53`.
- Interface textures are inline SVG `feTurbulence` data URIs (grain, fibre, brush strokes, seal wear) — `index.css:174-180`.
- The production bundle is a single JavaScript chunk of 1,833,190 bytes and 170,104 bytes of CSS (`dist/assets/`, built 09:07 on 2026-11-26 by another session).

### Inferences
- GPU texture memory is tiny today (a handful of ≤512² canvases, one 1376x768 backdrop, four ≤1024x676 data textures per scene), so there is large headroom for authored texture sets; the constraint is download size and authoring, not VRAM.
- The 8 tile paintings at 1024² and 61 portraits at 1024² are the highest-detail assets in the game and are currently confined to 2D uses; none is seamless-tiling by construction (seams show on the tactical board), so they are not drop-in WebGL ground textures.
- Canvas textures containing glyphs are drawn once at build; if the web font has not loaded yet the glyph is drawn in a fallback serif (not observed in captures; code reading only).

### Gaps
- Per-file byte sizes were listed for `public/art` only; portraits were tallied by count and dimension.
- Whether any image is unused by the code was not checked.
- Actual GPU memory use was not measured.

---

## 5. From the captures: the most visible detail weaknesses per scene, in order of harm, and what already looks good

### Takeaway
At far or wide framings the map's paper view, the city overview and the duel's backlit wide shot hold up; every scene breaks down at its nearest framing, where placeholder-grade figures (pegs and tube-limbed dolls), untextured or single-tile surfaces, flat water and empty middle distance dominate the image.

### Cited Findings

#### Campaign map
Weaknesses, most harmful first:
1. Near-zoom ground is a smooth colour ramp with soft shading and nothing on it — no forests, fields, rock or settlement texture; at the nearest zoom a terrain quad spans about 16 screen pixels and a height texel about 5 — `captures/map_myth_near_cities.png`, `captures/map_myth_near_lowangle.png`, `captures/map_classic_near_cities.png`.
2. City miniatures read as grey-box placeholders: hard-edged boxes and pyramids in flat colour, no texture, no cast shadow, houses barely legible, the same silhouette for every city of a tier — same captures.
3. The seasonal particles render as hard pale squares scattered over the map (untextured points); they look like dead pixels, not petals or motes — visible at about (703, 746) in `captures/map_myth_near_lowangle.png` and throughout `captures/map_classic_near_cities.png`.
4. Water is flat: rivers are pale bands with blurred edges and no banks or flow; lakes are flat discs with thin ring lines and visibly stair-stepped edges near the camera — `captures/map_myth_near_lowangle.png` (lake at bottom centre).
5. Nothing grounds objects in the world: no shadows, no haze on models, and beyond the sheet a black void with a thin gilt line — `captures/map_myth_far_terrainview.png`.
6. The marching general is almost a black silhouette under myth: PBR metal with no environment map on the map scene — `captures/map_myth_near_army_march.png`.
7. In the far paper view the hill hatching becomes a busy worm pattern in the south-east, and all minor cities are flat interface dots and squares — `captures/map_myth_far_realm.png`.
8. Roads are faint dashed tints; borders overprint terrain without interacting with relief.

What looks good and should be protected: the far "silk/paper" sheet with realm washes, brushed province borders and legible seals; real relief that makes the geography recognisable; the ink-soak ownership change; drifting cloud shadow; plaques and labels that stay readable; the level and paper transitions; the low cost (37–91 draw calls).

#### City close-up
1. People are pegs: a box with a ball on top, soldiers the same with a stick; on the drill ground and in the market they are the subject of the shot — `captures/city_myth_chengdu_barracks_close.png`, `captures/city_myth_chengdu_market_close.png`, `captures/city_classic_jianye_market_quay.png`.
2. Walls and gates: one tiling course texture with repeating streaks on every face, block merlons, a black box for the gateway, slab doors, no architectural members — `captures/city_myth_chengdu_gate_lowangle.png`.
3. Roofs: the stripe texture bands and aliases; no eave, ridge or bracket detail; near geometry clips when the camera gets under an eave (near plane 2) — `captures/city_myth_chengdu_hall_close.png`, `captures/city_myth_chengdu_gate_lowangle.png` (top of frame).
4. Country around the town: low-poly blob and cone trees, smooth dune-like mountain flanks, fields as flat striped rectangles with no crops, hedges, paths' edges or workers — `captures/city_myth_jiange_fortress_winter.png`, `captures/city_myth_jiange_horizon_sky.png`, `captures/city_myth_chengdu_fields_low.png`.
5. Water: moat and river are flat blue-grey slabs with straight edges — `captures/city_classic_jianye_river_overview.png`, `captures/city_myth_jiangling_horizon_sky_river.png`.
6. Light sources are oversized glow balls floating over plain cylinders; fires and smoke are a few sprites — `captures/city_myth_chengdu_market_close.png`, `captures/city_myth_jiangling_riot_breached_autumn.png`.
7. Flags are blank coloured rectangles; stalls are cloth pyramids on four sticks with three cubes of goods — `captures/city_myth_chengdu_barracks_close.png`.
8. The horizon is fog-coloured hills; no sky, sun or cloud is ever in frame; shadows are soft-blurred at close range (2048² over about 300 units) — `captures/city_myth_jiangling_horizon_sky_river.png`.

What looks good: the overview reads at once as a walled Han city with five distinct districts; curved hipped roofs give the right silhouette; warm firelight against the cold myth grade; state changes are legible from afar (smoke columns, breach, lanterns, balloon); classic overview is a clean tabletop model; builds take 118–147 ms.

#### Cavalry duel
1. The ring of soldiers: identical toy figures with slab shields and bead faces, sharply lit and close behind the heroes in every cut — `captures/duel_myth_closeup_spectators2x.png`, `captures/duel_myth_closeup_left_rider2x.png`.
2. Hero figures: tube limbs with ball joints, ball hands, a sphere head with a painted face, a slab beard; they read as jointed dolls beside the painted portraits in the HUD — `captures/duel_myth_closeup_left_rider2x.png`, `captures/duel_classic_plains_idle_stage2x.png`.
3. Horses: glossy uniform coat with almost no visible hair or muscle definition, saw-tooth mane, bead eye, tube legs — `captures/duel_myth_closeup_right_horse2x.png`, `captures/duel_myth_fortress_night_stage2x.png` (white horses look like plastic).
4. Brazier flames are solid white cones blown out by bloom; night lanterns are flat cream discs — `captures/duel_myth_closeup_spectators2x.png`, `captures/duel_myth_fortress_night_stage2x.png`.
5. Empty middle distance: the fogged ground plane meets the painting at a straight line and reads as a grey sea; no tents, palisades, standards or terrain between ring and backdrop — `captures/duel_myth_wide_arena_ring2x.png`.
6. Armour is one regular scale pattern everywhere, sparkling under bloom; cloaks and saddle cloths are flat — `captures/duel_myth_closeup_left_rider2x.png`.
7. The stage occupies 852x405 px of a 1600x900 window; the scene's best lighting is shown at about a quarter of the screen — `captures/duel_myth_plains_idle_fullscreen.png`.
8. Fortress wall and gatehouse are plain boxes; the hit flash turns the struck rider a flat cream colour — `captures/duel_myth_fortress_night_stage2x.png`, `captures/duel_myth_skill_exchange_t1.17_stage2x.png`.

What looks good: the low back-lit sun with long shadows over bump-mapped trampled earth; the painted sky and mountains tinted into the scene; glyph banners; bloom on blades; reflections on metal from the generated environment map; camera cuts, letterbox, shock ring, sparks and hit-stop; the wide establishing shot — `captures/duel_myth_plains_idle_stage2x.png`, `captures/duel_myth_wide_arena_ring2x.png`.

#### War theater
1. Armies are 24–64 cloned pawns per side that slide without leg movement and fall as rigid pieces — `captures/war_myth_plains_melee_early.png`, `captures/war_myth_plains_melee_casualties.png`.
2. Behind the front there is only the fogged flat plane up to the painting — same captures.
3. River battles: ships are boxes with pyramid roofs; water is a dark flat sheet; wakes are hard white ellipses; lanterns are blown-out blobs — `captures/war_myth_river_fleet_clash.png`.
4. Projectiles and blasts: arrows are uniform white bars, the shell is a black ball, and under classic the blast is a flat yellow disc — `captures/war_classic_plains_melee_blast.png`.
5. Without an environment map helmets and iron go near black with pin highlights, most obviously under classic — `captures/war_classic_plains_melee_blast.png`.
6. Only four banners and two commanders give the armies identity; ranks have no officers, cavalry, archers or standards.

What looks good: full-screen staging; myth mood (mist, embers, rim light, backdrop); the commanders' silhouettes; the verdict card with seal — `captures/war_myth_river_verdict_card.png`.

#### Tactical board
1. Seams and repeats in the ground: straight tile-edge lines, the same path motif every few cells, terrain washes as soft circular stickers, hill art with its own oblique perspective — `captures/tactical_classic_mountain_board2x.png`, `captures/tactical_myth_river_board2x.png`.
2. Bridge, citadel and wall are rounded-rectangle cut-outs with their own lighting; the wall repeats cell by cell — `captures/tactical_myth_river_board2x.png`.
3. Fire is three flat triangles and a glow against painted ground — same capture (two burning tiles).
4. Nothing on the field moves: water, trees and grass are a still image; tokens are flat cards with emoji status marks.
5. The board is 650 px wide in a 1600 px window; half the modal is text — `captures/tactical_myth_river_board_fullscreen.png`.
6. Under myth the already dark painting loses terrain contrast (forest vs plains) — `captures/tactical_myth_river_board2x.png`.

What looks good: this is the only scene with real painted texture density; busts are recognisable; tile-state overlays, strength bars and labels are clear.

#### Capture index (all in `/home/xiaodong/workspace/threekindom-ai/research_notes/Strategy game graphic detail study/captures/`)

| File | What it shows |
|---|---|
| `map_myth_far_realm.png` | Map, myth, whole realm (auto view = paper/silk sheet), province level |
| `map_myth_far_terrainview.png` | Map, myth, whole realm forced to terrain view (`?mapView=terrain`) |
| `map_myth_province_jing.png` | Map, myth, flown to Jing province, city level |
| `map_myth_near_cities.png` | Map, myth, nearest zoom (distance 26), steep angle |
| `map_myth_near_lowangle.png` | Map, myth, nearest zoom at the lowest allowed angle |
| `map_myth_near_army_march.png` | Map, myth, debug-staged march: general miniature between Jiangling and Xiangyang |
| `map_classic_far_realm.png` | Map, classic, whole realm paper view |
| `map_classic_near_cities.png` | Map, classic, nearest zoom |
| `map_2d_fallback_svg.png` | Flat SVG fallback map (`?mapMode=2d`) |
| `city_myth_chengdu_overview.png` | City, myth, Chengdu (capital, mountain) overview |
| `city_myth_chengdu_market_close.png` | Chengdu market close-up |
| `city_myth_chengdu_barracks_close.png` | Chengdu drill ground and flags close-up |
| `city_myth_chengdu_gate_lowangle.png` | Chengdu south gate and wall from a low angle |
| `city_myth_chengdu_hall_close.png` | Chengdu palace court close-up |
| `city_myth_chengdu_fields_low.png` | Chengdu fields, moat and wall from low over the farmland |
| `city_classic_jianye_river_overview.png` | City, classic, Jianye (capital, river port) overview |
| `city_classic_jianye_market_quay.png` | Jianye market close-up, classic |
| `city_myth_jiangling_riot_breached_autumn.png` | Jiangling with riot, breached wall, autumn fields (`?demoScene=riot,breached&demoSeason=autumn`) |
| `city_myth_jiange_fortress_winter.png` | Jiange (fortress pass, defence 5), winter |
| `city_myth_jiange_horizon_sky.png` | Jiange from the widest, lowest view: cliffs and woods, no sky in frame |
| `city_myth_jiangling_horizon_sky_river.png` | Jiangling at the lowest allowed angle toward the river: skyline hills, no sky |
| `city_myth_jiangling_new_props_overview.png` | Jiangling with the uncommitted props: balloon, waterwheels, wayfarer pavilion, lanterns |
| `city_myth_jiangling_new_props_hall_pennant.png` | Hall court with the uncommitted governor's pennant |
| `duel_myth_plains_idle_fullscreen.png` | Whole 1600x900 window with the duel modal (stage 852x405) |
| `duel_myth_plains_idle_stage2x.png` | Duel stage only, pixel ratio 2, plains, myth, idle |
| `duel_myth_closeup_left_rider2x.png` | Debug-camera close-up of Guan Yu and horse |
| `duel_myth_closeup_right_horse2x.png` | Debug-camera close-up of the right horse's flank and rider leg |
| `duel_myth_wide_arena_ring2x.png` | Debug-camera high wide view of ring, banners, backdrop |
| `duel_myth_closeup_spectators2x.png` | Debug-camera close-up of spectators and a brazier |
| `duel_myth_skill_exchange_t1.17_stage2x.png` | Signature-skill exchange at the impact (hit flash, shock ring, sparks, callout) |
| `duel_myth_skill_exchange_t1.32_stage2x.png` | Same exchange 0.15 s later (rearing horse, follow-through) |
| `duel_classic_plains_idle_stage2x.png` | Duel stage, classic look, plains |
| `duel_myth_fortress_night_stage2x.png` | Duel stage, myth, fortress at night (Zhao Yun vs Zhang Liao) |
| `war_myth_plains_melee_early.png` | War theater, myth, land battle, early melee with arrow volley |
| `war_myth_plains_melee_casualties.png` | Same battle later: fallen soldiers, shell in flight |
| `war_myth_river_fleet_clash.png` | War theater, myth, river fleet battle |
| `war_myth_river_verdict_card.png` | Verdict card over the blurred river scene |
| `war_classic_plains_melee_blast.png` | War theater, classic, land battle with a shell burst |
| `tactical_myth_river_board_fullscreen.png` | Whole window with the tactical modal, myth, river battle |
| `tactical_myth_river_board2x.png` | Board only, pixel ratio 2, myth, river battle with fire tiles |
| `tactical_classic_mountain_board2x.png` | Board only, pixel ratio 2, classic, mountain battle |

Scenes were reached with query parameters found in the code: `?faction=shu` starts a game (`App.tsx:369-374`); `&mapDebug` exposes `window.__map` (`WebGLStrategyMap.tsx:576-587`); `&demoCity=<id>&cityDebug` opens a city and exposes `window.__city` (`App.tsx:409-416`, `CityStage3D.tsx:259-271`); `&demoScene=…&demoSeason=…` dress it (`CityView.tsx:217-262`); `&demoDuel=1[&demoDuelAction=…&demoTerrain=…&demoNight=1&atk=…&def=…]` (`App.tsx:655-691`) with `window.__duelStage.debugCam` (`DuelStage3D.tsx:72-76`, `:390-393`, `:746-751`); `&demoWar=1[&demoTerrain=plains]` (`App.tsx:731-`); `&demoTactical=1[&demoTerrain=mountain]` (`App.tsx:693-729`); `&look=classic` (`artLook.ts:28`). The capture script is `/tmp/claude-1001/-home-xiaodong--claude-spares-spare-sMWfua/9aebb34a-55cb-48b7-bce9-9f6593d95937/scratchpad/cap.mjs`.

### Inferences
- The ranking criterion used is how much of the frame the weakness occupies at the framing players are led to (the city's district goals, the duel's cut-in close-ups, the war scene's low sweeping camera): figures and wall/roof surfaces therefore outrank sky or shadow resolution.
- The duel's wide shot and the map's far view succeed for the same reason: a 2D or shader-painted layer carries the detail and the 3D only has to supply silhouette and light. Close framings remove that support.
- Three low-effort defects are visible in stills and are bugs rather than missing art: square map particles, black marching general under myth, and blown-out cone flames.

### Gaps
- No capture shows the map's ink-soak conquest, a city changing tier, or the march from start to arrival.
- The duel finale, chrono counter and a bow or fan duel were not captured; spark and dust density was seen in one impact frame only.
- War scene modes `bombard`, `raid`, `pincer` flanking and a fortress assault were not captured.
- Stills cannot show flicker, shimmer or animation quality; statements about motion come from code.
- All captures are from one workstation GPU at 1600x900; nothing was captured on an integrated GPU or a phone-sized viewport.

---

## 6. Performance facts measured or recorded in the code

### Takeaway
On this workstation every scene is trivially cheap (60 fps capped; 0.3–4.4 ms main-thread frame intervals uncapped) and the scenes are small — 0.14–0.32 million triangles and 37–378 draw calls per frame — so there is real headroom for more detail here; nothing in the repository records performance on weaker hardware except one unexplained "36 fps" remark about the duel in the previous report.

### Cited Findings
- Per-frame load at 1600x900, dpr 1, vsync on (all scenes held 16.7 ms median and p90): map 37 calls / 138,138 triangles (far), 91 / 149,686 (province view), 102–149 / 158,472–166,798 (with army); city 129 / 286,107 (Chengdu), 121 / 321,813 (Jianye), 158 / 299,561 (Jiangling riot), 83 / 249,201 (Jiange), 172 / 302,143 (new props); duel 204–378 / 244,263–279,607; war land 289–331 / ~221,500; war river 319–328 / ~18,800; tactical 0 WebGL calls — measured in page by the capture script.
- With the frame limiter off (`--disable-frame-rate-limit --disable-gpu-vsync`, rAF interval, median / p90): map 0.3–0.5 ms / 1.3–3.9 ms at dpr 1 and 2; city 0.4–0.5 / 0.6–0.9 ms; duel 1.4–1.9 / 1.6–2.7 ms; war myth 2.6–4.4 / 5.9–12.7 ms; war classic 2.3–2.7 / 3.8–5.1 ms. Forcing `gl.finish()` every frame did not change these figures.
- The duel's own JavaScript frame-time meter (`DuelStage3D.tsx:413`, `:817`) read 2.0–2.8 ms.
- City world build time (`CityStage3D.tsx:154-156`) measured 118–147 ms; the code treats a rebuild as "one long frame" and excludes it from the frame-rate measure (`:289-293`).
- The only run-time adaptation is the one-way pixel-ratio drop on the map and city when the mean frame exceeds 24 ms over 120 frames (`WebGLStrategyMap.tsx:622-629`, `CityStage3D.tsx:296-302`); the duel and war scenes have none and render at up to pixel ratio 2.
- City shadows are rendered once per build (`CityStage3D.tsx:87-88`, `:163`); the measured city draw calls therefore contain no shadow pass, while duel and war redraw their shadow maps each frame.
- In the development build each renderer is created twice because the app is wrapped in `StrictMode` (`src/main.tsx:11-15`); the capture counter saw 2 WebGL contexts for the map alone and 4 with a second scene open.
- One run of the war scene at dpr 2 (3200x1654 canvas) showed 400–600 ms gaps between frames about 4 s after navigation with no draws in the sampled window; a second run sampled at 4.8 s and 7.3 s was normal (3.2–4.4 ms). Start-up stall, not steady-state cost.
- The demo tactical route logs a React "Maximum update depth exceeded" error in the console (seen in three runs); not a rendering fault.
- Recorded in documents: "the duel's 36 fps" is mentioned once, without conditions, in `reports/Strategy game visual craft study.md:82`.
- Code paths that do per-frame CPU work proportional to content: instance matrices for up to 128 soldiers x 3 meshes (`WarStage3D.tsx:1095-1148`); river water vertices 73x57 (`:1022-1032`); `computeVertexNormals` on six banner meshes every frame (`DuelStage3D.tsx:710-721`); 220 sparks and 130 motes buffer rewrites (`duelVfx3D.ts:513-551`, `:587-596`); 150 map particles (`WebGLStrategyMap.tsx:895-906`); every DOM plaque and province label transform each frame (`:914-957`); terrain owner table refreshed every frame (`:721`).
- Draw-call structure: sprites are one call each — 83–115 in the city, each smoke puff with its own cloned material (`cityScene.ts:1316-1334`); the duel's dust pool is 72 sprites with 72 materials (`duelVfx3D.ts:267-291`); war ships are unmerged (about 25 meshes per ship, `WarStage3D.tsx:666-741`), which is why a river battle costs about 320 calls for under 19,000 triangles.
- Load-time work: province and border textures are computed by brute force, 512x338 pixels x every city x 2 loops (`mapWorld.ts:235-270`); the city ground evaluates a multi-octave noise height function for 53,361 vertices plus tree placement tries up to 16,000 (`cityEnvironment.ts:135-170`, `:308-327`).

### Inferences
- The uncapped intervals are main-thread submission times on a workstation GPU and say little about fill-rate cost; they show the scenes are not CPU-bound (the heaviest, war, is about 3 ms of script and driver work per frame), not that they are cheap on integrated graphics.
- The likeliest costs on weak GPUs, from the configuration alone, are the full-resolution half-float 4x MSAA target plus full-resolution bloom at pixel ratio up to 2 in duel and war, and the terrain fragment shader on the map (five 4-octave fbm evaluations, seven under myth, plus twelve texture fetches per pixel, `mapTerrain.ts:93-278`), which covers the whole screen at pixel ratio up to 1.5.
- Triangle and draw-call counts leave an order of magnitude of headroom on discrete GPUs: the built town is about 32,000 triangles and a hero rig about 17,000.
- Because scenes build in 0.1–0.2 s from code, replacing procedural parts with authored assets would add download and decode time that does not exist today.

### Gaps
- No measurement on an integrated GPU, laptop or mobile device; no GPU timer queries; no memory measurement.
- The origin and conditions of the "36 fps" duel figure are unknown.
- Scene start-up times (shader compile, texture generation) for the duel and war scenes were not measured; only the city build time was.
- Whether `gl.finish()` actually blocks on GPU completion under headless Chrome/ANGLE was not verified, so the uncapped numbers may omit GPU time.
