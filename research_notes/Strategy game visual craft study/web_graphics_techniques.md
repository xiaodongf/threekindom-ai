# Real-time web graphics for a three.js strategy game — state of the art, late 2026

Research date: 23 Nov 2026. Method: official docs / release notes / repos fetched directly; where only a search-result snippet was available this is marked "(snippet only)". Release pages on GitHub show day and month but not the year; years below are inferred from PR merge dates (r182's `setEffects` PR merged 9 Dec 2025) and are marked "(year inferred)". The web-search budget for this session ran out part-way through, so some sub-topics (noted in each Gaps list) rest on fewer sources than intended.

Rating key used in the Inferences tables: Payoff / Effort / Runtime cost are each L (low), M (medium), H (high), judged for the stated target (single-player browser grand-strategy game, React 19 + Vite, three.js r187 WebGLRenderer + EffectComposer, 3D map of China with ~24 cities, procedural-geometry duel scene, no art team).

---

## 1. Renderer: WebGPURenderer + TSL vs classic WebGLRenderer; browser WebGPU support; what an r187 WebGL project gains or risks by migrating

### Takeaway
As of r187 (npm `three@0.187.0`) the official manual still calls WebGPURenderer "experimental", says WebGLRenderer is "still maintained and the recommended choice for pure WebGL 2 applications", and an open high-priority issue plus 2026 forum benchmarks show WebGPURenderer (on either backend) costing roughly 2x the CPU of WebGLRenderer in many-mesh scenes. WebGLRenderer has meanwhile gained a built-in HDR/effects path (`outputBufferType` + `setEffects()`, r182), opt-in TSL node-material support (`WebGLNodesHandler`), and `SunLight` cascaded shadows (r186), so a project with custom GLSL passes can get most of the new look without migrating.

### Cited Findings

Versions and release cadence
- Latest npm release is `three` 0.187.0, exporting `.`, `./webgpu`, `./tsl`, `./addons/*` entry points — [npm registry](https://registry.npmjs.org/three/latest)
- Recent GitHub releases: r184 (16 Apr), r185 (01 Jul), r186 (24 Sep), r187 (30 Oct) — year 2026 inferred — [three.js releases](https://github.com/mrdoob/three.js/releases); r183 is dated 20 Feb — [r183 notes](https://github.com/mrdoob/three.js/releases/tag/r183); r182 is dated 10 Dec (2025, since its headline PR merged 9 Dec 2025) — [r182 notes](https://github.com/mrdoob/three.js/releases/tag/r182), [PR #32461](https://github.com/mrdoob/three.js/pull/32461)
- The migration guide already carries a "187 → 188" section (r188 is not on npm yet): `AmbientLight`/`HemisphereLight` will add specular to Standard/Physical materials, multi-bounce AO weakens occlusion on bright/metallic surfaces, `LightProbe` is deprecated and no longer affects lighting, `iblIrradiance` removed — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)

Official status statements
- Manual: "The renderer itself is still in an experimental state although its maturity level has been greatly improved in the last years." and you may hit "missing features or a better performance with `WebGLRenderer`" — [three.js manual: WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- Manual: "`WebGLRenderer` is still maintained and the recommended choice for pure WebGL 2 applications"; "there are no plans to add larger new features to the renderer since the project's focus is now on `WebGPURenderer`"; the team is "investigating the possibility to add limited node material support to `WebGLRenderer`" — [three.js manual: WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- Manual, what breaks on migration: "Custom materials based on `ShaderMaterial`, `RawShaderMaterial` and modifications of built-in materials via `onBeforeCompile()` are not supported in `WebGPURenderer`. This part of your application must be ported to node materials and TSL." and "`EffectComposer` with its effect passes are not supported" — [three.js manual: WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- Manual, fallback: "If a device/browser doesn't support WebGPU, the renderer can automatically fall back to using a WebGL 2 backend"; force it with `new THREE.WebGPURenderer({ forceWebGL: true })`; import from `three/webgpu`; init is async (`setAnimationLoop()` or `await renderer.init()`) — [three.js manual: WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- Maintainer Don McCurdy (29 Oct 2025): "WebGPURenderer is currently experimental, including the WebGL fallback/forcing feature." and "It is an entirely separate renderer and doesn't use WebGLRenderer internally."; alpha blending and post-processing differ between the two — [three.js forum](https://discourse.threejs.org/t/webgpurenderer-forcewebgl-true-vs-webglrenderer/87805)
- Disagreement: agency blog posts (Utsubo, 2026) claim "Three.js r171 made WebGPU production-ready with zero-config imports", which is stronger than the official manual wording — [Utsubo migration guide (snippet only)](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) vs [three.js manual](https://threejs.org/manual/pages/webgpurenderer.html)

TSL and the node post-processing stack
- TSL is "a node-based shader abstraction written in JavaScript", renderer-agnostic, generating WGSL (`WGSLNodeBuilder`) or GLSL for WebGL2 (`GLSLNodeBuilder`) — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- `PostProcessing` was renamed `RenderPipeline` in r183; "The instance of `RenderPipeline` replaces the previous instance of `EffectComposer`"; effects are node compositions with "full, built-in MRT support" and automatic pass combination; tone mapping and colour-space conversion are applied automatically at the end unless `outputColorTransform = false` and `renderOutput()` is placed manually (needed e.g. before FXAA) — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [manual: WebGPU post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html)
- Manual claims "All common effects have already been ported to `WebGPURenderer` and exist in a more performant version as a node class"; SSGI, SSS and a better DoF are exclusive to the new renderer — [three.js manual: WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- Node-stack API churn per release is substantial: r181 deprecated `renderAsync()`/`computeAsync()`; r183 renamed `PostProcessing`→`RenderPipeline` and changed `SSRNode` blending; r185 reimplemented premultiplied alpha in WebGPURenderer, removed `AnamorphicNode` and `TiledLighting`, changed `SSRNode`/`SSGINode` APIs, made `GTAONode` darker/wider; r186 removed `PCFSoftShadowMap` from WebGPURenderer; r187 changed custom-light registration and struct storage buffers — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- r187 WebGPURenderer additions: "Introduce `StandardDrawingPipeline`, `MeshletDrawingPipeline` and `VisibilityBufferDrawingPipeline`" (#35191), "Compile pipelines in parallel in `compileAsync()`" (#34816), "Merge consecutive `BatchedMesh` draws that share a geometry range" (#35259); r185 added WebXR on WebGPU; r186 added `compileComputeAsync()` and `DirectRenderPipeline` — [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187), [releases](https://github.com/mrdoob/three.js/releases)

Performance evidence (WebGPURenderer vs WebGLRenderer)
- Forum benchmark, 29 May 2026, r183, Chrome 148, RTX 4090 laptop, 4,000 meshes / ~8M tris: WebGLRenderer 4.5 ms CPU per render and 32 ms cold first frame; WebGPURenderer (WebGPU backend) 9.7 ms and 167 ms; WebGPURenderer (`forceWebGL`) 10.3 ms and 344 ms. No maintainer replied in the thread — [three.js forum](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)
- GitHub issue #30560 "WebGPURenderer: Current UBO system has severe performance issues with many render items" is still open (labels High priority; last activity 15 Sep 2026). Mugen87: "Because every object has its own UBO for managing their object scope uniforms, each frame all UBOs must be bound and updated." His Jan 2026 measurements on the WebGL 2 backend: ~12 FPS (WebGPURenderer) vs 60 FPS (WebGLRenderer) in Chrome, 19 vs 57 FPS on Android. sunag: "The buffer should be shared between similar objects and updated only once per render call." — [three.js issue #30560](https://github.com/mrdoob/three.js/issues/30560)
- Jan 2026 thread on r182 WebGPU being slower than r170 WebGL: Mugen87 said regressions were fixed on dev "so `r183` should give you a noticeable performance boost compared to `r182`"; community advice was to stay on WebGLRenderer unless WebGPU-specific features are needed — [three.js forum](https://discourse.threejs.org/t/webgpu-significant-performance-drop-and-shadow-quality-regression-in-r182-vs-webgl-r170/89322)

What WebGLRenderer itself gained in 2025–2026 (relevant to staying put)
- r182: "Add `outputBufferType` and `setEffects()`" (#32461) — mrdoob: "Adds internal HDR rendering and simplified post-processing API."; usage `new WebGLRenderer({ outputBufferType: HalfFloatType }); renderer.setEffects([ taaPass, bloomPass ]); renderer.render( scene, camera );`; a redundant `OutputPass` inside `setEffects()` triggers a warning; effects only run when `outputBufferType` is not `UnsignedByteType` — [PR #32461](https://github.com/mrdoob/three.js/pull/32461), [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)
- r187: "Support `needsDepthTexture` in `setEffects()`" (#34858) — [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- The official `webgl_postprocessing_unreal_bloom` example still uses `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass` with `renderer.toneMapping = ACESFilmicToneMapping` — i.e. EffectComposer is still the documented WebGL path; a PR (#33392) to migrate examples to `setEffects()` was still open — [example source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_unreal_bloom.html), [PR #32461](https://github.com/mrdoob/three.js/pull/32461)
- TSL node materials now run on WebGLRenderer through an addon: `import { WebGLNodesHandler } from 'three/addons/tsl/WebGLNodesHandler.js'; renderer.setNodesHandler( new WebGLNodesHandler() );` with materials such as `MeshPhongNodeMaterial` from `three/webgpu` and nodes from `three/tsl`; official examples `webgl_tsl_shadowmap`, `webgl_tsl_skinning`, `webgl_tsl_clearcoat`, `webgl_tsl_instancing` — [example source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_tsl_instancing.html), [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json). The docs describe it only as "Compatibility loader and builder for TSL Node materials in WebGLRenderer" with no feature/limitation list — [WebGLNodesHandler docs](https://threejs.org/docs/pages/WebGLNodesHandler.html). r186 added "Support Node Materials in `compile()`" (#34232); r187 fixed `WebGLNodesHandler` PMREM and `fogDensity` — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- r186: "Add SunLight with cascaded shadow maps" (#34221) for WebGLRenderer, plus `LightProbeGridWebGL`; `reversedDepthBuffer` constructor option (needs `EXT_clip_control`) — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)
- r187 behaviour changes that can bite custom passes on WebGL: "`setViewport()` and `setScissor()` no longer scale by pixel ratio when a render target is bound"; PMREMs now based on cube render targets and `CubeUVReflectionMapping` removed (materials look slightly different); both renderers use `WeakRef`/`FinalizationRegistry` — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)

Browser WebGPU support (late 2026)
- caniuse: Chrome and Edge from 113; Safari desktop from 26.0 (marked partial); iOS Safari from 26.0; Samsung Internet from 24; Chrome for Android listed at 157; Firefox desktop listed as "disabled by default" through 163 and Firefox Android disabled; global usage 88.63% (86.83% + 1.8% partial) — [caniuse: WebGPU](https://caniuse.com/webgpu)
- gpuweb implementation status wiki (more granular, and disagrees with caniuse on Firefox): Chromium — Windows x86/x64, macOS, ChromeOS from 113; Android 12+ on ARM/Qualcomm/Intel from 121, Imagination on Android 16+ from 139; Linux Intel Gen12+ from 144, NVIDIA (driver 535.183.01+) on Wayland from 147, other Linux GPUs behind a flag; Windows ARM64 behind a flag. Firefox — Windows from 141; macOS Apple Silicon from 145 (macOS 26+) and from 147 on all macOS versions; Linux Nightly only ("Mozilla expects a Stable release in 2026"); Android behind a flag. Safari — macOS/iOS/iPadOS/visionOS 26 enabled by default — [gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- Chrome's WebGPU changelog confirms the Linux theme: "WebGPU on Linux with NVIDIA" in Chrome 147–148 and f16 on Linux NVIDIA in 155–156; latest posts cover Chrome 155–156 — [Chrome WebGPU news](https://developer.chrome.com/docs/web-platform/webgpu/news)
- Mozilla's graphics blog has "Shipping WebGPU on Windows in Firefox 141" (15 Jul 2025) and no later post announcing Linux/Android shipping — [Mozilla gfx blog](https://mozillagfx.wordpress.com/)
- Third-party libraries most relevant to this project are WebGL-only: pmndrs `postprocessing` (no WebGPU mention; v6.39.6 pins `three >= 0.168.0 < 0.188.0`), N8AO ("WebGPU: Not yet supported"), `@takram/three-clouds` ("WebGPU is not supported") — [postprocessing npm](https://registry.npmjs.org/postprocessing/latest), [N8AO](https://github.com/N8python/n8ao), [three-clouds](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/clouds)

### Inferences
- For the stated project (r187, WebGLRenderer, EffectComposer, custom GLSL ShaderPasses, a few dozen cities and modest mesh counts) there is no rendering feature on the wish-list that strictly requires WebGPU. The things that are WebGPU-only in practice are compute shaders (GPU particle sims at 100k+), SSGI/TRAA node effects, and the instanced-skinning examples. None is essential to a map-and-diorama look.
- Migration cost is concrete: every `ShaderMaterial`, `onBeforeCompile` hook and custom `ShaderPass` (including the grading pass) must be rewritten in TSL, and the bloom/grading chain rebuilt as a `RenderPipeline`. Migration risk is also concrete: "experimental" label, per-release API churn in the node stack, the open per-object UBO issue, and the fact that the WebGL 2 fallback is the same new renderer (measured slower than WebGLRenderer, not a route back to the old one).
- The fallback path would be exercised by a non-trivial share of desktop users in late 2026 (Firefox on Linux/Android, Chromium on Linux with AMD or older Intel GPUs, Windows on ARM), so "reliable fallback" matters; the evidence says it works but is officially experimental and can differ in alpha blending and post-processing output.
- A lower-risk hybrid exists on r187: keep WebGLRenderer; adopt `outputBufferType: HalfFloatType`; optionally write new materials in TSL through `WebGLNodesHandler` so they are portable later. Because `WebGLNodesHandler` has no documented limitation list, treat it as experimental too and test each node material.
- Upgrade watch-outs while staying on WebGL: r188 will visibly change lighting (ambient specular, multi-bounce AO), and pmndrs `postprocessing` 6.39.6 does not yet allow r188.

| Option | Payoff | Effort | Runtime cost | Verdict for this project |
|---|---|---|---|---|
| Stay on WebGLRenderer + EffectComposer (status quo) | M | L | L | Default; officially recommended for pure WebGL 2 apps |
| WebGLRenderer + `outputBufferType: HalfFloatType` (+ `setEffects`) | M | L–M | L–M (extra half-float target) | Worth trialling; EffectComposer already uses half-float targets so gain is mostly API simplicity |
| TSL materials on WebGLRenderer via `WebGLNodesHandler` | M | M | L | Good way to future-proof new shaders; undocumented limits |
| Full migration to WebGPURenderer + TSL + RenderPipeline | M–H (SSGI, TRAA, compute) | H | CPU overhead up to ~2x in many-mesh scenes | Not justified now; revisit when issue #30560 closes and "experimental" label is dropped |

### Gaps
- No official statement was found on when the "experimental" label will be removed, or on a fix timeline for issue #30560.
- Firefox WebGPU status on Linux/Android for the very latest Firefox versions could not be confirmed beyond the gpuweb wiki (which says Nightly-only/behind flag) and caniuse (disabled by default through 163); the wiki's last-edit date was not captured.
- Safari 26 WebGPU bug reports specific to three.js (iOS memory limits, crashes) could not be researched (search budget exhausted).
- Minor inconsistency: a forum thread dated 10–16 Sep 2026 discusses "upgrading to r186" although the GitHub release page lists r186 on 24 Sep; one of the two dates may be mis-rendered — [forum](https://discourse.threejs.org/t/csm-makes-any-gltf-assets-with-metalness-black/94231), [releases](https://github.com/mrdoob/three.js/releases)
- The feature coverage and limitations of `WebGLNodesHandler` are undocumented; not verified which TSL features (e.g. `viewportDepthTexture`, MRT) work on WebGLRenderer.

---

## 2. Terrain and map rendering: heightmaps, splatting/triplanar, stylised map shaders, elevation data, water, forests, clouds, fog, borders, tilt-shift

### Takeaway
Everything needed for a good-looking regional map is achievable on WebGL 2 with a displaced plane, a hand-written splat/painterly fragment shader and public-domain or open elevation data (Mapzen Terrarium tiles, Copernicus GLO-30, Natural Earth); the three.js repo has no official splatting or parchment-map solution, so these remain custom shaders, while water, sky/clouds, fog and tilt-shift each have an official example or a maintained library to start from.

### Cited Findings

Heightmap terrain, splatting, triplanar
- Official examples that exist in the current examples index: `webgl_geometry_terrain`, `webgl_geometry_terrain_raycast`, `webgpu_tsl_procedural_terrain`, `webgpu_tsl_raging_sea`, `webgpu_tsl_earth`, `webgpu_custom_fog` (terrain), `physics_rapier_terrain` (URL pattern `https://threejs.org/examples/#<name>`) — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- Forum guidance (older, still accurate per search): "There is no texture splatting solution available in the official three.js repository" — [three.js forum (snippet only)](https://discourse.threejs.org/t/how-to-create-a-multiple-textured-terrain/5069)
- TSL ships a built-in `triplanarTexture( textureX, textureY = null, textureZ = null, scale = float( 1 ), position = positionLocal, normal = normalLocal )` — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- `three-landscape` (R3F library, MIT): `TerrainMaterial` extends meshStandardMaterial with splat mapping (up to four surfaces per RGBA splat), stochastic sampling, triplanar mapping, automatic texture atlasing to exceed the 16-texture limit, `MartiniGeometry` for error-bounded terrain meshes, `useProgressiveTexture`; cannot generate terrain procedurally; its examples use old APIs (`planeBufferGeometry`, `uv2`) and no release dates were visible — [three-landscape](https://github.com/nwpointer/three-landscape)
- Three.js Journey's WebGPU & TSL course has a 2h26m "Stylized Nature Scene" lesson (terrain, grass, water): loads colour + data textures, applies a displacement map for elevation, and computes a normal map from the elevation data because "displacement moves vertices but doesn't update normals, which breaks shadows"; starter uses WebGPURenderer + RenderPipeline (bloom) + SkyMesh — [Three.js Journey](https://threejs-journey.com/lessons/webgpu-tsl/stylized-nature-scene)

Elevation and map data sources
- Mapzen/Tilezen Terrain Tiles on AWS Open Data: global bare-earth heights in S3 bucket `elevation-tiles-prod` (us-east-1; EU replica `elevation-tiles-prod-eu`), listable without an account (`aws s3 ls --no-sign-request s3://elevation-tiles-prod/`); attribution terms live in the joerd repo — [AWS registry: Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
- Terrain Tiles formats: Terrarium PNG (Web Mercator; 256/260/512/516 px), Normal PNG, GeoTIFF (512 px), Skadi `.hgt.gz` (1°x1°, WGS84, SRTMGL1-based). Terrarium decode: `(red * 256 + green + blue / 256) - 32768` metres — [joerd formats doc](https://raw.githubusercontent.com/tilezen/joerd/master/docs/formats.md)
- Copernicus DEM GLO-30 and GLO-90 are on AWS as Cloud-Optimized GeoTIFFs in 1°x1° tiles (bucket `copernicus-dem-30m`, eu-central-1), "available on a free basis for the general public under the terms and conditions of the Licence"; a small subset of GLO-30 tiles for specific countries is not public; ocean has no tiles — [AWS registry: Copernicus DEM (snippet only)](https://registry.opendata.aws/copernicus-dem/)
- Natural Earth: "All versions of Natural Earth raster + vector map data found on this website are in the public domain"; no permission or credit needed; scales 1:10m, 1:50m, 1:110m; includes river and lake data — [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/)

Grand-strategy map techniques (borders, territory fill)
- "Simulating the EU4 map in the browser with WebGL" (Nick Babcock, 23 Aug 2021): one 5632x2048 colour-coded province image (33 MB BMP → sub-500 KB PNG), a sorted colour array binary-searched in the shader plus primary/secondary colour lookup arrays; borders are drawn by checking whether neighbouring pixels differ (province borders compare raw colours, country borders compare owner colours, water-water skipped); stripes where primary≠secondary colour (occupation); stage 2 upscales with a GPU pixel-art scaler and applies normal map/water textures; ~600 lines of GLSL, WebGL2 `texelFetch`, ~0.1 ms full redraw on GPU vs 60–150 ms on CPU; "panning and zooming stutter on an older Intel HD 4400 with terrain enabled"; texture creation was 99.5% of the startup pause — [nickb.dev](https://nickb.dev/blog/simulating-the-eu4-map-in-the-browser-with-webgl)
- Smoother borders use a province lookup texture → border seed → jump-flood → distance field → final territory shader; a Unity implementation warns that textures ≤4096 can leave gaps on near-straight lines — [GrandStrategyFactionTerritories-Unity (snippet only)](https://github-users.yhajoa.workers.dev/jorlmn/GrandStrategyFactionTerritories-Unity)
- SDF edge formula for anti-aliased lines/outlines/glow in a fragment shader: `(threshold - distance) * 1/width + 0.5`; WebGL line widths other than 1 are not guaranteed, so thick borders belong in shaders — [Red Blob Games SDF article (snippet only)](https://www.redblobgames.com/articles/sdf-fonts/), [Red Blob terrain shader experiments (snippet only)](https://redblobgames.com/x/1730-terrain-shader-experiments)

Water
- Official examples: `webgl_shaders_ocean` (Water addon), `webgl_gpgpu_water`, `webgpu_water`, `webgpu_ocean`, `webgpu_backdrop_water`, `webgpu_compute_water`, `webgpu_caustics`, `webgpu_tsl_raging_sea` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- TSL exposes `viewportDepthTexture`, `viewportLinearDepth`, `viewportSharedTexture`, `screenUV`, `rotateUV` — the inputs for depth-based colour, shoreline foam and refraction — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- Codrops (4 Mar 2025) has a cartoon-style water tutorial for React Three Fiber; a three.js forum thread covers "Toon water shader with depth based fog and intersection foam" — [Codrops (snippet only)](https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/), [forum (snippet only)](https://discourse.threejs.org/t/toon-water-shader-with-depth-based-fog-and-intersection-foam/35978)
- "Susurrus" (Codrops case study, 24 Apr 2026) builds water from three layers: a low-resolution `MeshReflectorMaterial` for performance, a custom shader on a separate plane for surface detail/animation, and tuned lighting — [Tproger translation of the Codrops article](https://tproger.ru/translations/webgl-portfolio-susurrus-akvarelnyj-3d-mir-na-three-js-i-kuwah)
- Flow maps: "Flow supplies motion while masks decide where foam belongs", feed shoreline distance from depth intersection — [GameDev.net shader lab (snippet only)](https://gamedev.net/shaderlab/53-foam-with-flow-mapping/)

Instanced forests and grass
- `InstancedMesh2` (`@three.ez/instanced-mesh` 0.3.16, MIT, peer `three >=0.159.0`): dynamic capacity, per-instance frustum culling, dynamic BVH, sorting, per-instance visibility/opacity/uniforms, LOD and shadow LOD, skinning; live examples include "1kk static trees" and "Skinning 3k instances" (no benchmark figures on the page) — [instanced-mesh repo](https://github.com/agargaro/instanced-mesh), [npm](https://registry.npmjs.org/@three.ez/instanced-mesh/latest)
- Forum showcase (1 Aug 2025): 3072x3072 terrain with 200k trees using InstancedMesh2 + BVH culling, a meshoptimizer-simplified LOD for distance 15–100 and an octahedral impostor beyond 100; the impostor library is self-described as WIP ("there is still work to be done before it is truly usable"); no FPS numbers given — [three.js forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735), [octahedral-impostor repo](https://github.com/agargaro/octahedral-impostor)
- Impostor engineering notes (Cinevva, 4 May 2026): bake diffuse + world-normal atlases per prop, render one camera-facing quad per tree; a distant tree is ~2,000 triangles vs one quad with a ~1 MB texture; 12x12 hemi-octahedral atlas ≈ 9 MB vs 1.6 MB for a 5x5 azimuth/elevation grid; bilinear blending of 2x2 tiles (8 taps) removes popping; pitfall — the instanced unit quad gets frustum-culled as a whole unless an explicit bounding sphere is set; scales to about a million trees — [Cinevva blog](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)
- Official examples: `webgl_instancing_scatter`, `webgl_instancing_performance`, `webgl_batch_lod_bvh`, `webgl_mesh_batch` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- "Three.js Grassworks" (Sep–Nov 2026): a paid grass system "built specifically for WebGPU" and TSL with LOD via blade removal + spatial dithering and a camera-following influence map; no WebGL fallback mentioned and no performance numbers published — [three.js forum](https://discourse.threejs.org/t/high-performance-grass-rendering-in-three-js-webgpu/94175)

Clouds, cloud shadows, sky
- r186: "Sky, SkyMesh: More realistic clouds" (#33942) — the built-in `Sky` addon now draws clouds; r186 removed the `up` uniform (always +Y) — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186)
- `@takram/three-clouds` (MIT, beta): volumetric clouds with Beer shadow maps, cloud shadows cast on scene objects, light shafts, temporal upscaling; must sit inside pmndrs `postprocessing` `EffectComposer` before `AerialPerspective`; quality presets Low/Medium/High/Ultra; measured (v0.0.1, Tokyo scene) iPhone 13 Low 36–53 FPS, iPad Pro M4 60 FPS at Medium, MacBook Pro M3 Max 92–95 FPS at High, 31 FPS at High without temporal upscaling; "Clouds are expensive"; max 4 cloud layers; WebGPU not supported — [three-clouds README](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/clouds)
- Official volumetric examples: `webgl_volume_cloud`, `webgl_volume_perlin`, `webgpu_volume_cloud`, `webgpu_volume_lighting`, `webgpu_volume_lighting_traa`, `webgpu_loader_vdb` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)

Fog
- Official examples: `webgpu_fog_height`, `webgpu_custom_fog`, `webgpu_custom_fog_background`, `webgpu_custom_fog_scattering`, `webgpu_postprocessing_fog`; r186 added a post-processing volumetric fog example (#34319) — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186)
- TSL fog helpers: `fog( color, factor )`, `rangeFogFactor( near, far )`, `densityFogFactor( density )` — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- "Explore Primland" (Awwwards Site of the Day, Feb 2026) is credited with three.js 3D terrain, atmospheric fog and a scroll-driven camera flythrough — [Utsubo round-up](https://www.utsubo.com/blog/best-threejs-websites-2026)

Tilt-shift / diorama look
- pmndrs `postprocessing` includes `TiltShiftEffect` and `TiltShiftBlurPass` alongside `DepthOfFieldEffect` — [postprocessing API index](https://pmndrs.github.io/postprocessing/public/docs/identifiers.html)
- three.js addons: `webgl_postprocessing_dof`, `webgl_postprocessing_dof2`, `webgpu_postprocessing_dof`, `webgpu_postprocessing_dof_basic`; r180 gave `DepthOfFieldNode` a new implementation — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- Forum advice for tilt-shift: start from the depth-of-field shader with a narrow focus, use a near-orthographic narrow-FOV perspective camera, optionally add a saturation boost — [three.js forum (snippet only)](https://discourse.threejs.org/t/how-to-have-a-tilt-shift-effect-on-a-3d-scene/40606)

### Inferences
- For a ~24-city map of China the cheapest high-payoff recipe is: bake one heightmap (e.g. 2048² or 4096² 16-bit packed into two 8-bit channels) offline from Terrarium tiles or GLO-30 cropped to roughly 73–135°E / 18–54°N, displace a ~256²–512² plane in the vertex shader, and compute normals from the height texture in the fragment shader (the Three.js Journey lesson's approach). Exaggerate vertical scale; real relief at continental scale is visually flat.
- Rivers (Yellow River, Yangtze, Huai, Han) and coastline can come from Natural Earth 1:10m vectors rasterised offline into a distance-field mask; that single SDF texture then drives river colour, bank darkening, foam/ink edges and animated flow along a baked flow-direction channel — far cheaper than real water meshes.
- A parchment/ink-wash map is fundamentally a 2D shading problem: sample the height for slope hatching and contour banding, quantise to 3–5 ink tones, multiply by a tiling paper-fibre texture, and darken along SDF edges of coast/rivers/borders. No official example exists; it is an afternoon-scale custom fragment shader once the masks are baked, and it costs one or two texture fetches more than plain splatting.
- Territory fill + borders: the EU4 approach (ID texture + small ownership lookup texture updated on conquest + neighbour-compare borders) fits a 2-dozen-city game well; a jump-flood SDF baked once offline (regions never change shape, only owners) gives soft glowing borders at near-zero runtime cost.
- Cloud shadows: a full volumetric library (takram) is overkill and pulls in pmndrs postprocessing; a scrolling tileable noise texture projected along the sun direction and multiplied into terrain lighting gives the "living map" effect at one extra texture fetch. Sprite/billboard cloud layers above the map add parallax.
- Tilt-shift is a high payoff for a strategy map because it makes simple geometry read as a miniature; the blur can run at half resolution.

| Technique | Payoff | Effort | Runtime cost | Verdict |
|---|---|---|---|---|
| Baked DEM heightmap + displaced plane + shader normals | H | M (offline bake script) | L | Do first |
| Splatting by height/slope (3–4 layers) | M | M | L | Optional if going painterly instead |
| Triplanar on cliffs | L–M | L (TSL) / M (GLSL) | M (3x fetches) | Skip at map scale |
| Parchment / ink-wash map shader (tone bands, paper, ink edges) | H | M | L | Best fit for a Three Kingdoms theme with no art team |
| SDF rivers/coast with flow-scroll + foam | H | M | L | Do |
| Mesh water with reflections (Water/Reflector) | M | L | M–H (extra scene render) | Only for close-up scenes |
| Province-ID territory overlay + SDF borders | H | M | L | Do |
| Instanced trees with LOD/impostors | M | M–H | M | Use simple instanced low-poly clumps; impostors unnecessary below ~10k trees |
| Noise-texture cloud shadows + billboard cloud layer | H | L | L | Do |
| Volumetric clouds (takram) | H | M | H | Skip (integrated GPUs) |
| Height/distance fog in shader | M–H | L | L | Do |
| Tilt-shift DoF | H | L (pmndrs) / M (custom pass) | M (blur passes; run half-res) | Do, with a quality toggle |

### Gaps
- No documented three.js or GLSL implementation of a parchment/"old map" terrain shader was found; the recipe above is inference from general NPR sources.
- Copernicus DEM licence text and Terrain Tiles attribution text were not retrieved verbatim (GitHub pages returned 503); check [joerd attribution doc](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) and the Copernicus licence before shipping.
- Terrain Tiles maximum zoom and URL pattern were not in the fetched formats doc.
- Codrops articles (False Earth, Apr 2026; stylised water, Mar 2025) returned HTTP 403 to the fetch tool, so their details are unverified beyond titles/snippets.
- No measured cost of tilt-shift/DoF on integrated GPUs was found.

---

## 3. Lighting and post-processing: IBL, CSM, AO, bloom, tone mapping, LUTs, SSR/SSGI, god rays; pmndrs vs EffectComposer vs node RenderPipeline

### Takeaway
On WebGLRenderer r187 the practical stack is: PMREM environment lighting, one shadowed directional/`SunLight`, EffectComposer (or `setEffects`) with bloom (made cheaper in r186), an AO pass (N8AO at half-res or `GTAOPass`), a LUT/grading pass and AgX or Neutral tone mapping; SSGI and TRAA exist only in the node/WebGPURenderer stack, and pmndrs `postprocessing` remains WebGL-only with a version pin that currently stops at r187.

### Cited Findings

Tone mapping and colour
- `WebGLRenderer.toneMapping` options: `NoToneMapping`, `LinearToneMapping`, `ReinhardToneMapping`, `CineonToneMapping`, `ACESFilmicToneMapping`, `CustomToneMapping`, `AgXToneMapping`, `NeutralToneMapping` — [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)
- Khronos PBR Neutral (16 May 2024) maps colours 1:1 up to a threshold and uses the remainder as highlight headroom to preserve base colour hue/saturation; Khronos says ACES can make bright yellow/green/cyan look washed out and suits strongly HDR or stylised looks; three.js is a named adopter — [Khronos press release](https://www.khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products)
- r183: the three.js editor's default tone mapping changed to Neutral — [r183 notes](https://github.com/mrdoob/three.js/releases/tag/r183)
- pmndrs guidance: leave `renderer.toneMapping` at `NoToneMapping` and "use a `ToneMappingEffect` at the end of the pipeline"; intermediate buffers default to `UnsignedByteType` and `HalfFloatType` is recommended for precision — [pmndrs postprocessing README](https://github.com/pmndrs/postprocessing)
- Node stack: tone mapping + colour-space conversion applied automatically at the end of the chain; FXAA must run after `renderOutput()` in sRGB — [manual: WebGPU post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html)

IBL / environment lighting
- r180 renamed `RGBELoader` to `HDRLoader`; r181 improved PBR indirect specular and PMREM reflections ("slightly changes material appearance"; rough materials somewhat brighter); r183 moved `RoomEnvironment`'s scene so PMREM lighting from it looks different; r187 rebuilt PMREMs on cube render targets and removed `CubeUVReflectionMapping` — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- The `webgl_lights_sunlight` example builds IBL from the procedural sky: `pmremGenerator.fromScene( sceneEnv )` → `scene.environment`, with `scene.environmentIntensity = 0.5`, ACES tone mapping at exposure 0.6 — [example source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_lights_sunlight.html)
- r186–r187: `LightProbeGridWebGL` (WebGL) and a WebGPU version, with incremental baking (#34486), ~4x faster bakes via ArrayCamera batching (#34909) and faster multi-bounce (#35145); examples `webgl_lightprobes`, `webgl_lightprobes_complex`, `webgl_lightprobes_sponza` — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187), [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)

Shadows and CSM
- `WebGLRenderer.shadowMap.type` is now `BasicShadowMap | PCFShadowMap | VSMShadowMap`, default `PCFShadowMap`; `PCFSoftShadowMap` was deprecated on WebGLRenderer in r182 ("Use `PCFShadowMap`, which is now soft") — [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html), [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- `CSM` addon (`three/addons/csm/CSM.js`): "This module can only be used with WebGLRenderer"; defaults `cascades: 3`, `maxFar: 100000`, `mode: 'practical'`, `shadowMapSize: 2048`; requires `setupMaterial()` per material and `update()` each frame; example `webgl_shadowmap_csm` — [CSM docs](https://threejs.org/docs/pages/CSM.html)
- `SunLight` addon (r186, `three/addons/lights/SunLight.js`): "casts Cascaded Shadow Maps (CSM) via SunLightShadow, suited for lighting large scenes"; "not a good fit for small, bounded scenes like dioramas, single rooms or model-viewers"; no target (direction from position to origin); for WebGPURenderer call `SunLight.registerNode( SunLightNode )` — [SunLight docs](https://threejs.org/docs/pages/SunLight.html)
- `SunLightShadow`: "using two cascaded shadow maps"; default `mapSize` 1024x1024 per cascade; frusta fitted automatically up to `camera.far`; adjacent cascades blend — [SunLightShadow docs](https://threejs.org/docs/pages/SunLightShadow.html)
- User reports (Sep 2026): after r186 the old `CSM` addon turned metallic glTF assets black under WebGL; switching to `SunLight` was faster ("CSM triggered their laptop fan … SunLight did not") with slightly softer shadows; SunLight/Sky azimuth appeared 180° off for one user — [three.js forum](https://discourse.threejs.org/t/csm-makes-any-gltf-assets-with-metalness-black/94231)
- r187: "Only use SunLight in larger scenes" (#34586); "Fix PCF shadow bias with reversed depth" (#34892); "Fix point light shadow seams" (#35267) — [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187), [releases](https://github.com/mrdoob/three.js/releases)
- Rule-of-thumb sizes (Utsubo, updated 11 Sep 2026): shadow maps 512–1024 on mobile, 1024–2048 desktop, 4096 quality-critical; CSM 4 cascades desktop / 2 mobile; freeze static shadows with `light.shadow.autoUpdate = false`; a shadowed PointLight costs 6 renders — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

Ambient occlusion
- N8AO 2.1.0 (ISC; peers `three >=0.137`, `postprocessing >=6.30.0`): `N8AOPass` replaces `RenderPass` in three's EffectComposer, `N8AOPostPass` for pmndrs; quality modes Performance (8 AO samples/4 denoise), Low (16/4), Medium (16/8, default), High (64/8), Ultra (64/16); `halfRes = true` gives "2x to 4x" speed-up with depth-aware upsampling; recommends Performance for mobile/low-end integrated GPUs and Low for high-end mobile/integrated; supports log depth and orthographic cameras; WebGPU not yet supported; published timings are from an Apple M5 Max only — [N8AO README](https://github.com/N8python/n8ao), [npm](https://registry.npmjs.org/n8ao/latest)
- three.js WebGL addons: `webgl_postprocessing_gtao` (GTAOPass), `webgl_postprocessing_ssao`, `webgl_postprocessing_sao`; r187 `GTAOPass`: "Remove combined depth and normal texture support" (#34836) — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- Node stack: `GTAONode` got quadratic ray stepping, clip-space ray marching and baked sample counts in r186; it is "more physically correct, but darker and wider" since r185; example `webgpu_postprocessing_ao` — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- pmndrs has only `SSAOEffect` built in — [postprocessing API index](https://pmndrs.github.io/postprocessing/public/docs/identifiers.html)

Bloom, LUTs, god rays, SSR, SSGI
- r186 `UnrealBloomPass`: "Don't request depth buffer" (#34036) and "Merge adjacent taps into bilinear fetches" (#34479); r182 fixed its alpha handling — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [r182 notes](https://github.com/mrdoob/three.js/releases/tag/r182)
- Bloom starting ranges (Utsubo): intensity 0.5–2.0, luminance threshold 0.8–1.0, radius 0.5–1.0; half-resolution post-processing "can roughly double frame rate" in fill-rate-bound scenes — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- LUT grading: `webgl_postprocessing_3dlut` / `webgpu_postprocessing_3dlut` (three), `LUT3DEffect` and `LUT1DEffect` (pmndrs); r186 Inspector gained a "Color Grading extension" (#34216) — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [postprocessing API index](https://pmndrs.github.io/postprocessing/public/docs/identifiers.html), [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186)
- God rays: `webgl_postprocessing_godrays`, `webgpu_postprocessing_godrays`, pmndrs `GodRaysEffect` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [postprocessing API index](https://pmndrs.github.io/postprocessing/public/docs/identifiers.html)
- SSR: WebGL `webgl_postprocessing_ssr`; node `SSRNode` got an optional denoiser (r185) and in r187 defaults to the full GGX lobe with stochastic reflections (`webgpu_postprocessing_ssr_stochastic`, `_ssr_mirror`, `_ssr_animation`) — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- SSGI exists only as a node effect (`webgpu_postprocessing_ssgi`, `_ssgi_ballpool`; `SSGINode` uses an `RG11B10` target since r185 and supports resolution scale since r187) — [manual](https://threejs.org/manual/pages/webgpurenderer.html), [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)

The three post-processing stacks compared
- three `EffectComposer`: passes "executed in order of their addition"; manual says the old WebGL post stack "had many conceptual issues": cumbersome MRT and "no automatic pass/effect combination" — [manual: WebGPU post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html)
- pmndrs `postprocessing`: `EffectPass` "automatically organizes and merges any given combination of effects" into fewer fullscreen passes; effect list includes Bloom, SelectiveBloom, DepthOfField, TiltShift, LUT1D/3D, GodRays, Outline, SSAO, SMAA/FXAA, ToneMapping, Vignette, Noise, LensDistortion, ASCII, Pixelation; Zlib licence; latest v6.39.6 (1 Nov) requires `three ≥ 0.168.0 < 0.188.0`; v7.0.0-beta.16 (19 Feb) requires `three ≥ 0.179.0 < 0.184.0` and makes no WebGPU claim — [README](https://github.com/pmndrs/postprocessing), [API index](https://pmndrs.github.io/postprocessing/public/docs/identifiers.html), [releases](https://github.com/pmndrs/postprocessing/releases), [npm](https://registry.npmjs.org/postprocessing/latest)
- Node `RenderPipeline`: MRT + auto-combination, effects as TSL functions (`bloom`, `fxaa`, `traa`, `Lut3DNode`, `dotScreen`, …), all MRT attachments RGBA16F by default (can be lowered to RGBA8 per attachment) — [manual: WebGPU post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html)

### Inferences
- A custom GLSL grading `ShaderPass` plus `UnrealBloomPass` in EffectComposer is still the documented and supported WebGL path in r187; nothing forces a move. The free upgrade on r186+ is that bloom is cheaper (no depth buffer, bilinear tap merging).
- Folding the grading pass, vignette, paper-grain and LUT into a single fullscreen shader is the main cost lever on integrated GPUs: each EffectComposer pass is a full-resolution fill plus a render-target switch. pmndrs gets this merging automatically, but adopting it means rewriting the custom pass as an `Effect` and accepting the `<0.188` pin.
- Tone mapping: for a painterly/ink-wash palette where authored colours should survive, `NeutralToneMapping` or `AgXToneMapping` is a better default than ACES (ACES desaturates bright yellows/greens — relevant for faction colours). This is an inference from Khronos' rationale, not a tested result.
- `SunLight`'s own docs warn against diorama-scale scenes; a China map viewed from a bounded tilted camera is closer to a diorama than an open world, so a single `DirectionalLight` with a tightly fitted orthographic shadow frustum (2048² map, `autoUpdate = false` since the terrain is static, re-render only when units move or just use blob shadows for units) is likely better than CSM here.
- AO on a mostly-terrain map has low payoff relative to its cost; bake AO/cavity into the terrain texture offline instead and reserve screen-space AO (N8AO half-res "Performance") for the close-up duel scene on a "high" quality tier.
- SSR/SSGI are not worth pursuing for this project: WebGL SSR is expensive and SSGI needs the node stack.

| Technique | Payoff | Effort | Runtime cost (integrated GPU) | Verdict |
|---|---|---|---|---|
| PMREM sky/environment IBL | H | L | L | Do |
| AgX/Neutral tone mapping + exposure tuning | M–H | L | ~0 | Do |
| 3D LUT or merged grading pass | H | L | L | Do (already have a grading pass; merge passes) |
| UnrealBloom (half-res, high threshold) | M–H | L (in place) | M | Keep; tier off on low |
| Single fitted directional shadow, static caching | H | L–M | L–M | Do |
| CSM / SunLight | M | L | M–H (2–3 extra scene renders) | Only for a large open duel arena |
| N8AO half-res | M | L | M | High tier only |
| GTAO/SSAO passes | M | L | M–H | Prefer N8AO |
| God rays | M | L | M | Occasional set-piece only |
| SSR (WebGL) | L–M | M | H | Skip |
| SSGI / TRAA (node stack only) | M–H | H (migration) | H | Skip |
| Baked light probes (`LightProbeGridWebGL`) | M | M | L at runtime | Optional for static duel arenas |

### Gaps
- No primary-source millisecond costs for bloom/AO/DoF on Intel UHD/Iris Xe or Apple M-series integrated GPUs were found; N8AO and takram publish Apple-silicon numbers only. Budgeting must be measured on target hardware.
- `ToneMappingMode` enum values in pmndrs (whether AgX/Neutral are included) were not confirmed from the page fetched.
- Whether `setEffects()` accepts `UnrealBloomPass`/`ShaderPass` exactly as EffectComposer does is not explicitly documented (PR text names TAA/bloom passes generically).
- No evaluation of community WebGL SSGI/SSR libraries (e.g. realism-effects) could be made — not researched (search budget exhausted).

---

## 4. Stylised rendering: toon, outlines, Kuwahara/painterly, ink-wash, hatching, paper overlays

### Takeaway
Documented, copyable implementations exist for toon materials, depth+normal Sobel outlines, hatching and Kuwahara painterly filters (Maxime Heckel's two articles are the canonical GLSL references and a 2026 Awwwards-style project shipped with a single simplified Kuwahara pass); a genuine sumi-e pipeline has no off-the-shelf three.js implementation and must be assembled from tone quantisation, edge darkening, bleed blur and a paper multiply.

### Cited Findings
- Official building blocks: `webgl_materials_toon` (MeshToonMaterial), `webgl_postprocessing_outline` (OutlinePass), `webgl_postprocessing_sobel`, `webgl_postprocessing_rgb_halftone`, `webgl_postprocessing_pixel`; node equivalents `webgpu_materials_toon`, `webgpu_postprocessing_outline`, `webgpu_postprocessing_sobel`, `webgpu_postprocessing_retro`, `webgpu_postprocessing_pixel`, `webgpu_tsl_halftone` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- TSL has `outline( scene, camera, params )` for selected-object outlines; r187 added `emissiveNode` to lambert, phong and toon node materials — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- "On Crafting Painterly Shaders" (Maxime Heckel, 29 Oct 2024): basic Kuwahara = 4 sectors, pick mean of lowest-variance sector (luminance weights 0.299/0.587/0.114), kernel size 6 in demos, looks "too boxy"; Papari extension = circular kernel with 8 sectors and Gaussian weights (sigma = radius/3), replaced by a cheaper polynomial weight (eta 0.1, lambda 0.5); anisotropic Kuwahara = pass 1 structure tensor (Sobel), pass 2 kernel scaled/rotated by eigenvector with alpha raised to 25, pass 3 final touches; final pass quantises luminance (n = 16, clamped 0.2–0.7), boosts saturation 1.5, ACES tone-maps and blends a paper texture; author recommends Papari + polynomial weights as "enough" for most cases and "relatively performant compared to its anisotropic counterpart" — [Maxime Heckel](https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders)
- "Moebius-style post-processing" (Maxime Heckel, 26 Mar 2024): Sobel on a depth buffer and a normal buffer combined (depth weighted x25), hand-drawn wobble by displacing sample offsets with hashed sin/cos at ~0.08 frequency, crosshatched shadows by luma tiers using `mod` stripes (diagonal, then vertical, then horizontal), speculars forced white so they get outlined; needs an extra depth render target and a normals render via `scene.overrideMaterial`, i.e. extra scene renders per frame; built as a custom `Pass` from the `postprocessing` package inside R3F — [Maxime Heckel](https://blog.maximeheckel.com/posts/moebius-style-post-processing)
- "Susurrus: Crafting a Cozy Watercolor World with Three.js and Shaders" (Wei Xianyao, Codrops, 24 Apr 2026): stack is React + R3F + Drei + Rapier; the Kuwahara pass is the only post-processing pass, a simplified version of Heckel's without the tensor pass; the look was set up before modelling so Blender assets were authored to suit the filter; aims at mobile and older devices — [Tproger translation](https://tproger.ru/translations/webgl-portfolio-susurrus-akvarelnyj-3d-mir-na-three-js-i-kuwah), original at [Codrops](https://tympanus.net/codrops/2026/04/24/susurrus-crafting-a-cozy-watercolor-world-with-three-js-and-shaders/)
- A Codrops case study titled "Still: From Akira to Ink Wash, Building a Generative Garden in WebGPU" was published 9 Sep 2026 (content not retrievable — HTTP 403) — [Codrops](https://tympanus.net/codrops/2026/09/09/still-from-akira-to-ink-wash-building-a-generative-garden-in-webgpu/)
- Ink-wash references outside three.js: a 2020 Trinity College Dublin dissertation on real-time sumi-e rendering (tone-texture approach allowing ink bleed into paper); a sumi-e game write-up that used a colour ramp to enforce ink bands and found per-object tuning did not scale — [TCD dissertation (snippet only)](https://publications.scss.tcd.ie/theses/diss/2020/TCD-SCSS-DISSERTATION-2020-056.pdf), [Forgotten Colors write-up (snippet only)](https://bentobaux.github.io/posts/forgotten-colors-capturing-sumi-e-in-3d)
- A three.js forum thread "Painterly shader with brush texture in three js" exists (not fetched) — [three.js forum (snippet only)](https://discourse.threejs.org/t/painterly-shader-with-brush-texture-in-three-js/80770)
- `MeshMatcapMaterial`: "defined by a MatCap (or Lit Sphere) texture, which encodes the material color and shading … does not respond to lights since the matcap image file encodes baked lighting"; casts but does not receive shadows — [MeshMatcapMaterial docs](https://threejs.org/docs/pages/MeshMatcapMaterial.html)

### Inferences
- Because the project's 3D content is procedural geometry (no textures, no art team), a strong unifying post-filter is the most efficient way to hide simple models: Susurrus demonstrates the strategy of committing to one Kuwahara pass and authoring everything to suit it.
- Cost model for Kuwahara: an 8-sector Papari kernel of radius r samples on the order of π·r² texels per pixel (radius 6 ≈ 110+ fetches). At 1080p on an integrated GPU that is too heavy at full resolution; run at half resolution, cap radius at 3–4, and disable on the low tier. The anisotropic variant adds two more passes for a benefit "mostly visible up close".
- A sumi-e look for the map and duel can be assembled as one fullscreen pass after the scene render: (1) luminance → 4–5 ink tones via a 1D ramp texture; (2) edge darkening from a depth Sobel (depth only, to avoid the extra normals render); (3) cheap "bleed" by sampling a blurred/mip-biased copy for dark tones; (4) multiply by tiling rice-paper texture in screen or world space; (5) optional red-seal accent colour pass-through for faction colours. This reuses techniques that are individually documented (Heckel's quantisation + paper blend, Moebius depth Sobel) but the combination is untested here.
- Toon shading with a 3–4-step gradient map (`MeshToonMaterial.gradientMap`) plus inverted-hull or depth-Sobel outlines is the cheapest stylisation for the mounted duel and costs almost nothing at runtime.
- Matcap materials are a near-zero-cost way to give procedural horse/rider/armour geometry a "painted lacquer/bronze" look without lights or textures; limitation is no received shadows.

| Technique | Payoff | Effort | Runtime cost | Verdict |
|---|---|---|---|---|
| MeshToonMaterial + gradient ramp | M–H | L | L | Do for units/duel |
| Depth-Sobel ink outlines (single pass, wobble) | H | M | L–M | Do |
| Depth+normal outlines (extra normals render) | H | M | M–H (second scene render) | Only if depth-only misses creases |
| Tone-quantise + paper multiply in grading pass | H | L | L | Do (merge into existing grading pass) |
| Kuwahara (Papari, half-res, small radius) | H | M | H | High tier only |
| Anisotropic Kuwahara | H | H | H+ | Skip |
| Cross-hatching by luma tiers | M | L–M | L | Optional (suits parchment map) |
| Matcap materials | M | L | L | Do for props |

### Gaps
- No verified, documented three.js sumi-e shader implementation was found; the "Still" Codrops article (Sep 2026) probably is one but could not be read.
- No frame-time measurements for Kuwahara passes on integrated GPUs were found.

---

## 5. Many animated units: InstancedMesh, BatchedMesh, instanced skinning / VAT, impostors, particles

### Takeaway
For the unit counts of a 24-city strategy map, plain `InstancedMesh` (rigid parts, per-instance colour/morph) and `BatchedMesh` cover the need on WebGL; true instanced skeletal animation is officially demonstrated only on WebGPURenderer, with `InstancedMesh2` as the maintained WebGL library option, and `three.quarks` is the current batched particle library.

### Cited Findings
- `InstancedMesh`: "render a large number of objects with the same geometry and material(s) but with different world transformations"; `setMatrixAt`, `setColorAt`, `setMorphAt` (per-instance morph weights via `morphTexture`); bounding sphere computed automatically for culling but may need recomputing after `setMatrixAt` — [InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html)
- `BatchedMesh`: "multi draw batch rendering … large number of objects with the same material but with different geometries or world transformations"; `perObjectFrustumCulled` and `sortObjects` default true; `setColorAt`, `setVisibleAt`, `optimize()`; all geometries must share the first geometry's attribute layout; negative scale unsupported — [BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html)
- r187 fixed several BatchedMesh bugs (sort corruption #34828, draw ranges #34983, matrix memory leak #35272) and InstancedMesh shader reuse (#34872); r184 removed deprecated instancing render paths — [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187), [releases](https://github.com/mrdoob/three.js/releases)
- Official instancing examples: WebGL `webgl_instancing_morph`, `webgl_instancing_dynamic`, `webgl_instancing_performance`, `webgl_mesh_batch`, `webgl_batch_lod_bvh`, `webgl_buffergeometry_instancing_billboards`; WebGPU-only `webgpu_skinning_instancing`, `webgpu_skinning_instancing_individual`, `webgpu_instance_sprites`, `webgpu_instancing_morph` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- `InstancedMesh2` supports skeletal animation per instance (`initSkeleton`, `setBonesAt`) with a "Skinning 3k instances" demo, plus LOD and shadow LOD — [instanced-mesh repo](https://github.com/agargaro/instanced-mesh)
- Classic approach for crowds: store every bone matrix for every frame in a texture and read it in the vertex shader — [GPU Gems 3 ch. 2 (snippet only)](https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch02.html); forum thread on 100–1000 skinned meshes identifies CPU bottlenecks — [three.js forum (snippet only)](https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196)
- r183 WebGLRenderer: "Consider skinning / instancing when sorting objects" (#28125) — [r183 notes](https://github.com/mrdoob/three.js/releases/tag/r183)
- Billboards/impostors: three.js manual describes rendering a 3D object into a `WebGLRenderTarget` and using it on `Sprite`s ("facades"), noting a 64x64 texture is adequate for distant objects and that multi-angle facades (e.g. 8 directions) solve the single-view limitation — [three.js manual: billboards](https://threejs.org/manual/pages/billboards.html); TSL has `billboarding( { position, horizontal, vertical } )` and r186 added a `horizontalRotation` option and `softParticles()` — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language), [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186)
- `three.quarks` 0.18.0 (MIT, peer `three >=0.182.0`): batched renderer to cut draw calls; billboard, stretched-billboard, mesh and trail renderers; emitter shapes and behaviours; Unity Shuriken import; visual editor at quarks.art; R3F package; a `three.quarks/webgpu` entry point built on TSL that also runs on the WebGL2 fallback; soft particles need a depth pre-pass on WebGL — [three.quarks repo](https://github.com/Alchemist0823/three.quarks), [npm](https://registry.npmjs.org/three.quarks/latest)
- GPU particles via compute are WebGPU-backend only (`webgpu_compute_particles`, `_particles_rain`, `_particles_snow`, `_particles_fluid`, `webgpu_tsl_vfx_flames`, `_vfx_tornado`); "CPU-updated particles typically top out in the tens to low hundreds of thousands" — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Draw-call guidance: 1,000 separate trees = 1,000 draw calls vs 1 with InstancedMesh; target ~100 draw calls on mobile, "several hundred to low thousands" on desktop — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

### Inferences
- A 24-city map needs at most dozens of armies on screen, so a crowd system is only relevant if each army is drawn as a formation of soldiers (e.g. 20–50 figures per army → 1–2k figures). At that scale: one `InstancedMesh` per rigid body part (torso, head, spear, horse body, legs) with procedural bob/sway in the vertex shader driven by a per-instance phase attribute gives convincing "marching" without any skeletons — matching the project's procedural-geometry approach.
- 2D war scenes on canvas could instead be moved to instanced sprite quads with a sprite-sheet atlas (UV offset per instance) — thousands of animated sprites in one draw call; this is the cheapest "many animated units" technique and suits AI-generated sprite sheets.
- VAT is only worth building if rigged glTF characters enter the pipeline; no maintained, documented three.js VAT library was verified in this research.
- Because instanced meshes are culled as one object, set generous bounding spheres (pitfall documented by Cinevva) or disable culling for map-wide formations.
- Particle needs for a strategy game (dust, smoke, embers, arrows, banners) are in the low thousands; `three.quarks` batched CPU particles are sufficient and keep the WebGL path. Note its peer range (`>=0.182`) fits r187.

| Technique | Payoff | Effort | Runtime cost | Verdict |
|---|---|---|---|---|
| InstancedMesh rigid-part formations + shader sway | H | M | L | Do |
| Instanced sprite-sheet billboards | H | M | L | Do for distant armies / battle scenes |
| BatchedMesh for varied static props (cities, camps) | M | L–M | L | Do |
| InstancedMesh2 (culling, LOD, skinning) | M | M | L | Only if counts exceed ~10k or skinned glTF arrives |
| VAT / instanced skinning | M | H | L–M | Skip for now |
| Octahedral impostors | L–M | H | L | Skip |
| three.quarks batched particles | M–H | L–M | L–M | Do |
| WebGPU compute particles | M | H (migration) | M | Skip |

### Gaps
- No maintained three.js VAT (vertex-animation-texture) library with documentation was verified (search budget exhausted before this could be checked).
- No published benchmark for InstancedMesh2 skinning or for three.quarks on integrated GPUs was found.
- BatchedMesh skinning support is not documented either way.

---

## 6. Asset pipeline: glTF compression, KTX2/Basis, AVIF/WebP for paintings, lazy loading, atlases, Spine/Live2D/Rive

### Takeaway
The 50 MB of ~800 KB JPG paintings is primarily a download problem that AVIF (96.7% support) solves without code risk, while GPU-memory problems are solved only by KTX2/Basis (4–8x less VRAM); glTF Transform 4.5 covers geometry/texture optimisation in one CLI; for animated 2D characters Rive's runtimes are MIT, Spine requires a paid editor licence ($69/$379, Enterprise above $500k revenue), and Live2D exempts individuals and small businesses.

### Cited Findings

Image formats for large paintings
- AVIF: Chrome 85+, Firefox 93+, Safari 16.4+ (iOS 16.0+), Edge 121+; global support 96.71% — [caniuse: AVIF](https://caniuse.com/avif)
- JPEG XL: Chrome 155+ (re-enabled after being flagged in 145–154), Firefox 158+, Safari 17+ (partial), Edge not supported through 157; global 69.25% — [caniuse: JPEG XL](https://caniuse.com/jpegxl)
- PNG/JPEG/WebP/AVIF are fully decompressed for the GPU: memory = width × height × 4 bytes × 1.333 with mipmaps (a 4096² texture ≈ 90 MB); "file size doesn't determine memory use" — [Don McCurdy, Feb 2024](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- GPU-compressed formats cut memory "4–8x" and upload time similarly; Basis Universal in KTX2 transcodes at runtime to whatever the device supports; ETC1S = low/medium quality at JPEG-like file size (weak for normal maps); UASTC ≈ BC7 quality, with Zstd typically 1–2x the size of JPEG/ETC1S; advice: WebP/AVIF when first paint matters and visuals are simple, KTX2 for long sessions with heavy texture use; use `ImageBitmapLoader` to decode off the main thread and `renderer.initTexture()` to upload early — [Don McCurdy](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- A 200 KB PNG at 2048² becomes ~21 MiB of VRAM with mipmaps; keep textures ≤2048 unless hero assets — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- `KTX2Loader`: needs `setTranscoderPath()` (WASM transcoder; default `examples/jsm/libs/basis`) and `detectSupport( renderer )` before loading; supports Basis Universal payloads only ("other hardware-specific formats, this loader does not yet parse them"); `detectSupportAsync` deprecated (r181) — [KTX2Loader docs](https://threejs.org/docs/pages/KTX2Loader.html), [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- r187 GLTFLoader: "Parse embedded KTX2 images without a Blob" (#35193); r185 WebGPURenderer "Support all BPTC formats" — [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187), [releases](https://github.com/mrdoob/three.js/releases)

glTF optimisation
- glTF Transform CLI 4.5.0: `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp`; `inspect` to find problems; commands `draco`, `meshopt`, `quantize`, `simplify`, `weld`, `instance`, `join`, `flatten`, `palette`, `dedup`, `prune`, `resize`, `webp`, `avif`, `etc1s`, `uastc`; uses Sharp for images — [glTF Transform CLI](https://gltf-transform.dev/cli)
- Mixed KTX2 recipe from the three.js forum: ETC1S for base colour, UASTC + `--zstd 22` for everything else (`gltf-transform etc1s … --slots "baseColorTexture"` then `uastc … --slots "!baseColorTexture"`); example sizes 5.03 MB original → 2.65 MB ETC1S vs 13.44 MB UASTC — [three.js forum / sample repo (snippet only)](https://discourse.threejs.org/t/how-to-create-ktx2-correctly/40963), [sample](https://github.com/klich3/threejs-gltf-with-compressions-sample)
- Bruno Simon's folio-2025 (MIT) pipeline: `npm run compress` uses gltf-transform CLI + KTX-Software (`toktx`) to compress GLB-embedded textures to ETC1S at quality 255, standalone PNG/JPG textures to ETC1S presets, and UI images to WebP — [folio-2025 README](https://github.com/brunosimon/folio-2025)
- Draco "can shrink geometry by about 95% in many cases. Meshopt decodes faster than Draco"; quantisation takes a vertex from 32 to ~20 bytes — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- r185: `DRACOLoader.setDecoderConfig()` deprecated; loader moving to WASM only; r186: `SimplifyModifier` now meshoptimizer-based and async — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- Progressive loading example exists officially: `webgl_loader_gltf_progressive_lod` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)

2D animation runtimes and licences
- Spine: Essential $69, Professional $379, Enterprise $2,499 + $379/user/year; "Businesses with more than $500,000 USD annual revenue require a Spine Enterprise license"; "Your Spine license also grants you permission to use the Spine Runtimes in your games and applications"; official runtimes include Web Canvas, WebGL, Three.js (`spine-ts/spine-threejs`), PixiJS, Phaser, Web Player, Web Components; current major version 4.3 — [Spine purchase](https://esotericsoftware.com/spine-purchase), [Spine runtimes](https://esotericsoftware.com/spine-runtimes)
- Rive: "MIT-licensed runtimes"; "No revenue share, no runtime fees, no royalties"; runtimes for Web, React, Unity, Unreal, etc. — no three.js runtime listed; editor is the paid part (free exports show a splash unless upgraded, per search snippet); `@rive-app/webgl2` is the recommended web package and `@rive-app/webgl` is deprecated after v2.37.0 — [Rive runtimes](https://rive.app/runtimes), [Rive pricing (snippet only)](https://rive.app/pricing), [Rive canvas-vs-webgl docs (snippet only)](https://rive.app/docs/runtimes/web/canvas-vs-webgl)
- Live2D Cubism SDK: release licence "required for business entities publishing a content using Live2D SDK"; "Individuals and Small-Scale Enterprises are exempted from the license and payment (except Expandable Application)"; small-scale = latest annual sales under 10 million JPY (help centre); agreement due at least one month before release — [Live2D SDK licence](https://www.live2d.com/en/sdk/license/), [Live2D help (snippet only)](https://help.live2d.com/en/?p=5838)

### Inferences
- If the ~60 large JPGs are shown as DOM/CSS images (event art, portraits, backgrounds), convert to AVIF at quality ~50–60 with a JPEG or WebP fallback via `<picture>`; expect roughly half or less of the bytes at similar quality (estimate; not measured here), lazy-load per screen, and show a blurred tiny placeholder (LQIP) for progressive reveal. JPEG XL is not yet safe as the only format (69% support, no Edge).
- If any of those paintings are used as WebGL textures (map base, battle backdrops), their VRAM cost is what matters: a 4096x2048 painting is ~43 MB with mips regardless of file format. Use KTX2 UASTC (or ETC1S at q255, as folio-2025 does) for those, cap at 2048 on low tier, and dispose textures when leaving a scene.
- `gltf-transform optimize --compress meshopt --texture-compress webp` is the low-effort default for any AI-generated GLB; add `simplify` and `resize` because image-to-3D outputs are dense with oversized textures.
- Runtime choice for animated 2D characters with no art team: Rive (free MIT runtime, renders to its own canvas which can be layered over or used as a `CanvasTexture`) or simple shader-driven portrait animation (see §8) are the cheapest; Spine has an official three.js runtime but requires buying the editor and someone to rig; Live2D gives the most "alive" portraits but needs rigged models that AI tools do not yet output reliably.

| Technique | Payoff | Effort | Runtime cost | Verdict |
|---|---|---|---|---|
| AVIF (+fallback) for painted JPGs, lazy-load + LQIP | H (load time) | L | Decode slightly slower than JPEG | Do first |
| KTX2 for in-scene textures | M–H (VRAM, hitches) | M | Lower VRAM; WASM transcoder to host | Do for map/arena textures |
| gltf-transform optimize for GLBs | M | L | — | Do when GLBs are introduced |
| Sprite sheets / atlases for units & VFX | M–H | M | L | Do |
| Rive for UI/character motion | M | M | L–M | Consider |
| Spine + spine-threejs | M–H | H (rigging + licence) | L | Only with an animator |
| Live2D | H for portraits | H | M | Skip without rigged models |

### Gaps
- No measured AVIF-vs-JPEG size saving for painterly artwork was sourced; test on the actual images.
- Rive editor pricing for 2026 was only seen via third-party snippets; confirm at rive.app/pricing.
- Khronos KTX Artist Guide could not be fetched (HTTP 503), so per-slot ETC1S/UASTC recommendations rest on Don McCurdy's article and a forum recipe.
- iOS/Android browser memory ceilings for WebGL contexts were not researched (search budget exhausted).

---

## 7. AI-assisted asset creation in 2026: image/text-to-3D, rigging, licences, glTF pipelines; 2D sprite/portrait/layer tools

### Takeaway
By late 2026 image-to-3D is good enough for static props and buildings (GLB with PBR textures in seconds to a minute) but still produces dense, retopology-needing meshes; Meshy is the most integrated hosted option (auto-rig for bipeds and quadrupeds, paid plans grant ownership), TRELLIS.2 is the strongest permissively licensed open model (MIT, but 24 GB VRAM), and Hunyuan3D 2.1's licence excludes the EU, UK and South Korea. For 2D, permissively licensed depth estimators (Depth Anything V2-Small / DA3-Base) and layer decomposition (Qwen-Image-Layered, Apache 2.0) make parallax-ready art from a single painting practical.

### Cited Findings

3D generators
- TRELLIS.2 (Microsoft): 4B-parameter image-to-3D model on an "O-Voxel" sparse structure; 512³–1536³ resolution; PBR base colour/roughness/metallic/opacity; GLB export (WebP textures); code and model MIT (nvdiffrast/nvdiffrec have separate terms); needs an NVIDIA GPU with ≥24 GB, Linux-tested; ~3 s at 512³, ~17 s at 1024³, ~60 s at 1536³ on an H100; paper arXiv 2512.14692 (Dec 2025) — [TRELLIS.2 repo](https://github.com/microsoft/TRELLIS.2)
- Hunyuan3D 2.1 (Tencent, 13–14 Jun 2025): open weights + training code; Shape model 3.3B params, Paint (PBR texture) model 2B; VRAM ≈10 GB shape, 21 GB texture, 29 GB both — [Hunyuan3D-2.1 repo](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)
- Hunyuan3D 2.1 licence: "Tencent Hunyuan 3D 2.1 Community License Agreement" — "DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA"; Territory = worldwide excluding those; "Tencent claims no rights in Outputs You generate"; outputs may not be used to improve other AI models; separate licence required above 1 million monthly active users — [LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2.1/main/LICENSE)
- Later Hunyuan3D versions: a 2.5 technical report (Jun 2025) and a "Hunyuan 3D 3.0" launch are reported by secondary sources; open-source status of 3.x unconfirmed — [arXiv 2506.16504 (snippet only)](https://arxiv.org/abs/2506.16504), [Notebookcheck (snippet only)](https://www.notebookcheck.net/Tencent-s-new-Hunyuan-3D-3-0-brings-realistic-AI-model-generation-to-developers-and-creators.1116964.0.html)
- Meshy pricing (yearly billing per month): Free $0 / 100 credits; Pro $12 / 1,000; Premium $20 / 3,000; Ultra $80 / 8,000; Studio $56 + $10/seat. Free outputs are CC BY 4.0; Pro and above are "Private & Customer owned"; rigging and animation on all plans (20 animations free, 500+ paid); Remesh on Pro+; exports .fbx .obj .usdz .glb .stl .blend .3mf; "Meshy 6 Lite" is the model named on the free tier — [Meshy pricing](https://www.meshy.ai/pricing)
- Meshy rigging API: supports humanoid bipeds and four-legged animals (`animation_type: quadruped`); input must be a textured GLB facing +Z with ≤380,000 triangles; outputs rigged GLB + FBX plus basic walking/running clips; biped skeleton templates include Mixamo, UE5, Unity, Rigify; "not suitable" for assets that are neither humanoid nor four-legged — [Meshy docs](https://docs.meshy.ai/en/api/rigging-and-animation)
- Rodin / Hyper3D pricing: Free; Creator $30/mo ($24 yearly) ≈ 60 models with "Unlimited export and any use", HD texture, Smart Low-Poly; Business $120/mo ($96 yearly) ≈ 416 models with High-Poly Quads; direct credits $1.5 each — [Hyper3D pricing](https://hyper3d.ai/pricing). Third-party sources say Gen-2.5 is the current generation and exports GLB/FBX/OBJ/STL/USDZ, and disagree on which tiers carry commercial rights — [Picasso IA blog (snippet only)](https://blog.picassoia.com/rodin-gen-2-5-hyper3d-image-to-3d-pricing-and-quality), [Costbench (snippet only)](https://www.costbench.com/software/ai-3d-generation/rodin-hyper3d/)
- Comparison blogs (2026; several vendor-run; no standard benchmark) broadly agree: Meshy best all-rounder for game assets (PBR + rigging); Tripo praised for speed and a low-poly "P1" model ("from 2,000 faces"); Rodin highest fidelity with quad topology; TRELLIS 2 the best free/open option; Hunyuan3D strong on textures. They disagree on rankings and cite different versions (Meshy 6 vs 7.1, Tripo P1 vs H3.1); common caveat: "Most generators output dense meshes that need retopology" — [inker.si](https://inker.si/blog/best-ai-3d-model-generators-2026), [vitalify (Jul 2026)](https://www.vitalify.asia/en/blog/ai-image-to-3d-generators-comparison), [3daistudio](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/best-image-to-3d-tools-2026), [trellis2.app](https://trellis2.app/blog/best-ai-3d-model-generator) (all snippet only)

2D tools: depth, layers, portrait animation, sprites
- Depth Anything V2 (14 Jun 2024): Small 24.8M params Apache-2.0; Base 97.5M, Large 335.3M, Giant 1.3B are CC-BY-NC-4.0; community Transformers.js WebGPU browser demo and ONNX port exist — [Depth Anything V2 repo](https://github.com/DepthAnything/Depth-Anything-V2)
- Depth Anything 3 (14 Nov 2025): DA3-Base, DA3-Small, DA3MONO-LARGE and DA3METRIC-LARGE are Apache 2.0; Giant/Large/Nested are CC BY-NC 4.0; exports depth, PLY point clouds, GLB, 3D Gaussians — [Depth Anything 3 repo](https://github.com/ByteDance-Seed/Depth-Anything-3)
- Qwen-Image-Layered (model released 19 Dec 2025, Apache 2.0): decomposes an image into multiple RGBA layers (adjustable, 3–8; layers can be recursively decomposed); recommended resolution 640 in this version; text-to-layers performs poorly — [Qwen-Image-Layered repo](https://github.com/QwenLM/Qwen-Image-Layered)
- LivePortrait (KlingAIResearch): animates a source image from a driving video or motion template; humans plus cats/dogs mode; last listed update 1 Jun 2025; NVIDIA GPU expected; licence type not confirmed from the README text — [LivePortrait repo](https://github.com/KwaiVGI/LivePortrait)
- Sprite tools seen in 2026: Ludo.ai Sprite Generator (animated sprite sheets, portrait type; edits re-render the whole animation); SpriteFlow 8-direction generator; open-source front-ends that call hosted models — `sprite-sheet-creator` (fal.ai; includes 3-layer parallax scenes), `perfectpixel-studio` (5 generated + 3 mirrored directions; identity checks by colour histogram + dHash; Aseprite JSON export), `agent-sprite-forge` (sheet QC for identity/drift, parallax seam checks) — [Ludo.ai docs](https://ludo.ai/docs/sprite-generator), [SpriteFlow](https://spriteflow.io/direction-sprite-generator), [sprite-sheet-creator](https://github.com/blendi-remade/sprite-sheet-creator), [perfectpixel-studio](https://github.com/gykim80/perfectpixel-studio), [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) (all snippet only)

### Inferences
- Practical 3D pipeline for this project: concept image (existing AI painting style) → Meshy/Tripo/Rodin or local TRELLIS.2 → GLB → Blender or `gltf-transform simplify/weld/resize` (target 2–10k triangles and 512–1024 px textures for map props) → `gltf-transform optimize --compress meshopt` + KTX2 → `GLTFLoader` with `MeshoptDecoder`/`KTX2Loader`. Static assets (city walls, gates, pagodas, siege engines, trees, tents, banners, weapons) are the sweet spot.
- AI-generated PBR textures clash with a stylised/ink look; re-shade generated meshes with toon/matcap materials and the global post filter so they match procedural geometry. This also hides texture seams and low-res bakes.
- Rigged characters: Meshy's auto-rig (biped + quadruped, GLB out, Mixamo-compatible skeleton) is the only verified one-stop route to an animated horse and rider; quality for mounted combat (two rigs interacting) will still need manual animation work, so the existing procedural IK duel may remain the better investment.
- Licence hygiene: use a paid tier of a hosted generator (Meshy Pro+ is unambiguous: "Private & Customer owned") or MIT TRELLIS.2; avoid Hunyuan3D open weights if developing or distributing from the EU/UK/South Korea; free-tier Meshy output needs CC BY attribution.
- 2D: generating depth for each painting with an Apache-licensed model (DA V2-Small or DA3-Base) is a one-off offline step producing a greyscale PNG — the cheapest AI-assisted upgrade (see §8). Layer decomposition gives cleaner parallax than a single depth map for foreground characters but is limited to ~640 px in the current release, so use it for masks rather than final pixels.

| Technique | Payoff | Effort | Runtime cost | Verdict |
|---|---|---|---|---|
| Image-to-3D static props → simplified GLB + toon/matcap | H | M | L (after simplify) | Do |
| AI auto-rigged characters (Meshy) | M | M–H | M (skinned meshes) | Experiment; keep procedural duel as fallback |
| Local open models (TRELLIS.2) | H | H (24 GB GPU) | — | Only if hardware exists |
| Offline depth maps for paintings (DA V2-S / DA3-Base) | H | L | L | Do |
| RGBA layer decomposition for parallax | M–H | M | L | Trial on hero scenes |
| AI sprite sheets for units | M–H | M (consistency QC) | L | Trial; verify frame consistency |
| LivePortrait-style talking portraits (pre-rendered video/sprite) | M | M | M (video decode) | Optional; check licence |

### Gaps
- Tripo's pricing/licence pages returned HTTP 403; Tripo plan terms, model names and free-tier licence are unverified (only secondary blog claims).
- Current flagship versions of Meshy (6 vs 7.x), Tripo and Rodin could not be confirmed from primary pages; comparison blogs disagree.
- Hunyuan3D 3.x availability/licence not confirmed from a primary source.
- No independent, standardised late-2026 benchmark of generator output quality (topology, texture seams) was found; all rankings are blog opinion.
- LivePortrait licence and any non-commercial dependency caveats were not confirmed.
- General image models for consistent character/portrait generation (reference-pinned editing models) were not researched (search budget exhausted).

---

## 8. 2D-plus-3D hybrid techniques: depth-map parallax, 2.5D billboards, HD-2D, baked lighting, matcap

### Takeaway
Hybrid techniques give this project the best look-per-effort: existing paintings can be brought to life with a depth map and a ~20-line displacement/parallax shader, units can be camera-facing sprites inside the 3D map, and tilt-shift + bloom over sprites (the HD-2D recipe) plus matcap/baked lighting avoid most real-time lighting cost.

### Cited Findings
- three.js ships a parallax example on the node stack: `webgpu_parallax_uv` — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- Monocular depth models suitable for generating a depth map from a single painting, with permissive licences for the small/base variants: Depth Anything V2-Small (Apache-2.0), DA3-Base/Small (Apache 2.0); community browser demos run V2 via Transformers.js/WebGPU — [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2), [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3)
- Billboards: `Sprite`/`SpriteMaterial` always face the camera; sprites can intersect nearby geometry from some angles; "facade" technique renders a 3D object once to a render target and reuses it on many sprites, optionally from ~8 directions — [three.js manual: billboards](https://threejs.org/manual/pages/billboards.html)
- TSL `billboarding()` (with `horizontalRotation` option since r186) and `webgpu_instance_sprites` / `webgl_buffergeometry_instancing_billboards` examples for instanced billboards — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language), [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- HD-2D reference (non-three.js, DX12): deferred lighting of 2D sprites, normal-mapped sprites for volume, plus depth of field — [dev.to write-up (snippet only)](https://dev.to/feed/gaurav_de)
- Tilt-shift/DoF building blocks: pmndrs `TiltShiftEffect`, `DepthOfFieldEffect`; three `BokehPass` examples — [postprocessing API index](https://pmndrs.github.io/postprocessing/public/docs/identifiers.html), [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)
- Baked lighting options inside three.js: `webgl_shadowmap_progressive` (progressive lightmap accumulation), `webgpu_lightmap_baking`, `webgpu_materials_lightmap`, `LightProbeGridWebGL` with incremental baking — [examples index](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json), [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186)
- Matcap: lighting baked into a sphere texture; ignores lights; casts but does not receive shadows — [MeshMatcapMaterial docs](https://threejs.org/docs/pages/MeshMatcapMaterial.html)
- A 2026 sprite tool generates "3 layer parallax scene (sky, midground, foreground)" backdrops — [sprite-sheet-creator (snippet only)](https://github.com/blendi-remade/sprite-sheet-creator)

### Inferences
- Depth-map parallax recipe (WebGL-safe): load painting + 8-bit depth PNG; in the fragment shader offset UV by `(depth − focus) × pointer/gyro/camera drift × strength` (optionally 8–16 step parallax-occlusion march for larger motion); add slow idle sway, depth-masked fog/dust particles and depth-keyed colour grading. Cost is 2–17 texture fetches on one quad — trivial even on integrated GPUs. Artefacts appear at depth discontinuities when strength is high; keep motion subtle or split into 2–3 layers with inpainted backgrounds.
- The same depth map lets paintings receive 3D-scene effects: depth-aware bloom/haze, snow/rain passing behind foreground figures, and tilt-shift on a painting.
- The DOM-based 8×8 tactical grid and 2D-canvas war scenes can adopt HD-2D cheaply: render the board as a textured plane in three.js with instanced billboard sprites for units, a low-angle perspective camera, a tilt-shift band and bloom on highlights. Sprites need alpha-tested (not blended) materials to write depth so DoF and shadows behave; a blob or projected shadow under each sprite grounds it.
- For the city/map dioramas, bake lighting offline or once at load (static sun) and reserve dynamic shadows for moving units; with a parchment/ink style, lighting can be almost entirely pre-painted.
- This hybrid direction plays to the project's existing asset base (large painted images, AI-generated art) rather than requiring 3D modelling.

| Technique | Payoff | Effort | Runtime cost | Verdict |
|---|---|---|---|---|
| Depth-map parallax on existing paintings | H | L | L | Do first — best ratio |
| Layered (2–3 plane) parallax with inpainted backgrounds | H | M | L | Hero scenes |
| Billboard sprites in 3D map/battle (HD-2D) + tilt-shift + bloom | H | M | L–M | Do for tactical battles |
| Normal-mapped lit sprites | M | M–H (needs normal maps) | L | Later |
| Baked/static lighting, cached shadows | M–H | L–M | L | Do |
| Matcap props | M | L | L | Do |
| Painted skybox / matte-painting backdrops behind 3D arenas | H | L | L | Do (already aligned with painted arenas) |

### Gaps
- No up-to-date three.js tutorial on depth-map parallax of a single image was verified (Codrops's classic "fake 3D image" tutorial was not retrievable; search budget exhausted).
- No documented three.js HD-2D implementation was found; the recipe is inferred from generic sources.

---

## 9. Performance practice: budgets, frame pacing, adaptive quality, profiling, shader-compile stalls, memory, mobile

### Takeaway
Draw calls and fill rate, not triangles, are the binding constraints on integrated GPUs: published rules of thumb are ~100 draw calls on mobile and a few hundred to low thousands on desktop, pixel ratio capped at ≤2 (lower on weak GPUs), post-processing at half resolution, shader pre-compilation with `compileAsync()`, and a feedback-driven quality tier modelled on drei's `PerformanceMonitor`.

### Cited Findings
- Budgets (Utsubo, updated 11 Sep 2026): "Target ~100 draw calls per frame on mobile"; Don McCurdy guideline "<100 draw calls and <100,000 vertices if you can"; desktop "several hundred to low thousands"; no explicit triangle budget — draw calls matter more; "3 or fewer dynamic lights"; cap `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`; half-res post "can roughly double frame rate" when fill-rate bound; disable native AA when post handles it and put SMAA/FXAA last — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Profiling: `renderer.info` "Holds a series of statistical information about the GPU memory and the rendering process"; with multi-pass rendering set `renderer.info.autoReset = false` and call `renderer.info.reset()` once per frame; draw calls at `renderer.info.render.calls` (WebGL) — [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html), [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Shader stalls: `compileAsync()` "makes use of the `KHR_parallel_shader_compile` WebGL extension … recommended to use this version of `compile()` whenever possible" and resolves "when the given scene can be rendered without unnecessary stalling due to shader compilation"; lighting and environment must be configured before calling; third parameter targets a different scene — [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)
- compileAsync fixes landed in r185 ("Fix `compileAsync()`", #33784), r186 (crash when a tracked material is disposed mid-flight, #34378; clipping honoured in `compile()`, #34507; node materials supported, #34232); WebGPURenderer compiles pipelines in parallel in `compileAsync()` from r187 (#34816) — [releases](https://github.com/mrdoob/three.js/releases), [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- Texture upload hitches: decode + upload cause frame stalls; mitigate with `ImageBitmapLoader` (off-main-thread decode) and `renderer.initTexture()` (early upload); compressed GPU formats upload 4–8x faster — [Don McCurdy](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- In the EU4 WebGL map, creating textures from preloaded images was 99.5% of the initial pause, and an Intel HD 4400 stuttered when panning with the terrain post-process enabled (users could disable it) — [nickb.dev](https://nickb.dev/blog/simulating-the-eu4-map-in-the-browser-with-webgl)
- Adaptive quality: drei `PerformanceMonitor` collects average FPS over windows (`ms: 250`, `iterations: 10`, `threshold: 0.75`), default bounds `refreshrate > 90 ? [50, 90] : [50, 60]`, calls `onIncline`/`onDecline`, exposes a 0–1 `factor` (step 0.1), and `flipflops` + `onFallback` stop oscillation; example toggles DPR between 1 and 2 or scales it continuously from 0.5 to 2 — [drei docs](https://drei.docs.pmnd.rs/performances/performance-monitor)
- Shadows: 512–1024 maps on mobile, 1024–2048 desktop; `light.shadow.autoUpdate = false` for static scenes; `WebGLRenderer.shadowMap.autoUpdate`/`needsUpdate` documented for manual updates — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)
- AO tiering guidance: N8AO "Performance"/"Neural-Performance" for mobile and low-end integrated GPUs, "Low" for high-end mobile/integrated; half-res gives 2–4x — [N8AO README](https://github.com/N8python/n8ao)
- Memory: both renderers now use `WeakRef`/`FinalizationRegistry` (r187); r186 added `Object3D.dispose()` and async `Renderer.dispose()`; r187 improved WebGL geometry/texture disposal (#34529, #34530) — [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)
- Texture memory arithmetic: 4096² RGBA = 64 MiB (~85–90 MiB with mips); KTX2 4–8x less — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [Don McCurdy](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- Mobile shader precision: Qualcomm says mediump fragment shaders can be "up to twice as fast" on Adreno (as cited by Utsubo) — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- WebGPU is "not universally faster. Profile before migrating for speed alone." — [Utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- Dev tooling: the three.js Inspector (node stack) gained split screen, timeline, colour-grading extension and overdraw mode in r186–r187 — [r186 notes](https://github.com/mrdoob/three.js/releases/tag/r186), [r187 notes](https://github.com/mrdoob/three.js/releases/tag/r187)

### Inferences
- For a strategy map the scene is mostly static between inputs, so the biggest single win is render-on-demand: stop the RAF loop (or drop to ~15–30 fps for ambient animation) when the camera is idle and no animation is playing. This also addresses laptop fan/battery complaints better than any shader optimisation. (Inference; no source claims this for this project.)
- A three-tier quality system keyed to a measured frame time is appropriate: Low (DPR 1, no bloom/AO/DoF, no shadows, grading + paper only), Medium (DPR ≤1.5, half-res bloom, static shadow, tilt-shift), High (DPR ≤2, N8AO half-res, Kuwahara in duel, cloud shadows). Pick the initial tier from a 1–2 s warm-up benchmark, then adapt DPR with hysteresis (PerformanceMonitor pattern). Because the app is React 19, drei's component can be used directly if R3F is adopted; otherwise the logic is ~40 lines.
- Fill rate dominates on integrated GPUs: at 1920x1080 and DPR 2 the canvas is 8.3 MP; each fullscreen pass at that size is expensive. Capping DPR at 1–1.25 on integrated GPUs and merging passes matters more than reducing triangles.
- Avoid scene-transition hitches (map → duel → battle) by calling `renderer.compileAsync(scene, camera)` and `renderer.initTexture()` behind the transition animation/loading painting, and by keeping one WebGLRenderer/context for all 3D views rather than creating one per React component.
- Frame pacing: use `renderer.setAnimationLoop`, clamp delta time, and avoid allocating in the loop; React re-renders should not be driven per frame (keep the 3D state outside React state).

| Practice | Payoff | Effort | Verdict |
|---|---|---|---|
| Render-on-demand / idle throttling | H | L–M | Do |
| DPR cap + adaptive DPR with hysteresis | H | L | Do |
| Quality tiers toggling post effects/shadows | H | M | Do |
| `compileAsync` + `initTexture` pre-warm at scene transitions | M–H | L | Do |
| Merge fullscreen passes; half-res bloom/DoF | H | M | Do |
| Instancing/batching to keep draw calls < ~200 | M | M | Do |
| KTX2 to cut VRAM/upload hitches | M | M | Do for scene textures |
| `renderer.info` overlay in dev builds | M | L | Do |

### Gaps
- No authoritative draw-call/triangle budget specific to Intel UHD/Iris Xe or Apple-silicon laptops was found; the figures above are rules of thumb from a single agency article citing Don McCurdy.
- No primary data on frame-pacing behaviour (rAF vs display refresh, 120 Hz handling) in late-2026 browsers was gathered.
- Mobile browser WebGL memory limits and context-loss behaviour were not researched (search budget exhausted).

---

## 10. Showcase references 2024–2026: what the best-looking browser work credits

### Takeaway
The most admired three.js work of 2025–2026 is stylised rather than photoreal, and its credited techniques are consistent: a committed art direction enforced by one or two custom shaders/post passes, baked or simplified lighting, aggressive texture compression (KTX2 ETC1S), instancing for vegetation, and — for the newest pieces — WebGPURenderer + TSL with a WebGL fallback; no widely cited three.js grand-strategy showcase was found.

### Cited Findings
- Bruno Simon's Folio 2025 (open source, MIT): a driving-game portfolio whose game loop lists terrain, grass, foliage, leaves, floor, water surface, wind, fog, snow, rain lines, lightning, a tornado, day-cycle lighting, tracks and trails; assets authored in Blender with a palette texture set on the three.js material; textures compressed to KTX2 ETC1S via gltf-transform + KTX-Software, UI images to WebP — [folio-2025 README](https://github.com/brunosimon/folio-2025). His Three.js Journey "WebGPU & TSL" course teaches a "Stylized Nature Scene" (terrain, grass, water) with WebGPURenderer + RenderPipeline bloom + SkyMesh, arguing stylised low-poly nature is a good way to focus on performance — [Three.js Journey](https://threejs-journey.com/lessons/webgpu-tsl/stylized-nature-scene)
- Utsubo's "8 Best Three.js Websites of 2026" (updated 24 Sep 2026): Oryzo (Lusion; Awwwards Site of the Month, Apr 2026); IVRESS (Utsubo; FWA Site of the Month, May 2026) — "WebGPU renderer with WebGL fallback; TSL shaders that compile to both backends"; Lacoste Ace Breaker (three.js/WebGL browser game); Hubtown (Unseen Studio); Explore Primland (three.js 3D terrain, atmospheric fog, scroll-driven flythrough; Awwwards SOTD Feb 2026); Cartier Watches & Wonders 2026 (Immersive Garden; three.js + GLSL + GSAP) — [Utsubo round-up](https://www.utsubo.com/blog/best-threejs-websites-2026) (note: agency-authored list that includes its own work)
- "Susurrus" (Weisdevice; Codrops 24 Apr 2026): cozy watercolor world; credits a single simplified Kuwahara post pass (after Maxime Heckel), a look defined before modelling, layered low-res reflector water, R3F + Drei + Rapier, mobile-first performance goals — [Tproger translation](https://tproger.ru/translations/webgl-portfolio-susurrus-akvarelnyj-3d-mir-na-three-js-i-kuwah)
- Codrops 2026 case studies relevant to terrain and ink styles (titles verified, bodies not retrievable): "False Earth: From WebGL Limits to a WebGPU-Driven World" (21 Apr 2026), "Still: From Akira to Ink Wash, Building a Generative Garden in WebGPU" (9 Sep 2026) — [False Earth](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/), [Still](https://tympanus.net/codrops/2026/09/09/still-from-akira-to-ink-wash-building-a-generative-garden-in-webgpu/)
- webgpu.com showcase (undated entries): "Maad Maxxing: Procedural Desert Combat in Three.js and WebGPU" (Andrew Blumson, featured), "Project Endurance: Rain-Soaked GT3 Racing to WebGPU" (Anderson Mancini, featured), "The Aviator Returns as a Full Three.js Browser Game" (Karim Maaloul), "Starter Kit Racing: mrdoob's Track Editor and Racing Game in Three.js", "Softbody Tetris" (WebGPU + three.js), "Choo-Choo World" (Lusion, WebGL), "Narrow One" (Pelican Party, WebGL); the game tag lists 33 works and none is a strategy title — [webgpu.com showcase](https://webgpu.com/showcase/), [webgpu.com game tag](https://webgpu.com/tags/game/)
- three.js forum top showcase topics over the past year include an infinite procedural winter driving game, "Terrain Rider" (real-world terrain mountain-bike game), "3D map 2500km² running on three.js and 3dtilesrenderer", "Roadarium", "Tides of Fortune: an open-world pirate game with zero asset files" (Nov 2026), "Quake 3 in WebGPU", and two WebGPU grass systems — again no strategy game — [three.js forum showcase (top, yearly)](https://discourse.threejs.org/c/showcase/7/l/top?period=yearly)
- Vegetation showcases credit InstancedMesh2 + BVH culling + LOD + octahedral impostors (200k trees) and WebGPU/TSL grass with dithered LOD — [forest of impostors](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735), [Grassworks](https://discourse.threejs.org/t/high-performance-grass-rendering-in-three-js-webgpu/94175)
- Reference technique write-ups that showcase authors cite: Maxime Heckel's painterly (Oct 2024) and Moebius (Mar 2024) articles — [painterly](https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders), [Moebius](https://blog.maximeheckel.com/posts/moebius-style-post-processing)
- Closest strategy-map precedent in the browser is a raw-WebGL2 EU4 map viewer (2021), not a three.js game — [nickb.dev](https://nickb.dev/blog/simulating-the-eu4-map-in-the-browser-with-webgl)

### Inferences
- The pattern across admired work: pick one strong stylisation and build everything to suit it (Susurrus), keep lighting simple or baked, let weather/atmosphere layers (wind, fog, rain, clouds) do the "alive" work (Folio 2025), and compress textures hard. This is achievable without an art team and on WebGL 2.
- WebGPU/TSL appears in the newest showcase pieces mainly where authors want compute (grass, particles, fluids) or are building teaching material; the WebGL pieces in the same lists are not visibly inferior. Showcase prestige is not evidence that a strategy game needs WebGPU.
- The absence of a celebrated three.js grand-strategy game means there is no established visual bar in the browser for this genre; a cohesive ink-wash/parchment map with animated rivers, cloud shadows, tilt-shift and parallax-painted event scenes would be distinctive.

### Gaps
- No three.js or WebGPU grand-strategy/4X browser game from 2024–2026 with a published technical breakdown was found; a low-quality blog list naming browser RTS titles could not be verified and is not cited.
- Awwwards/FWA pages were not fetched directly; award attributions come from the Utsubo article.
- Technique credits for webgpu.com entries (Maad Maxxing, Project Endurance) were not retrieved — listing pages show titles only.
- Codrops case studies (False Earth, Still, Susurrus original) were blocked (HTTP 403); Susurrus details come from a Russian translation.
- Showcase research was cut short by the session's web-search limit; Acerola-style breakdowns, 80.lv and Inigo Quilez articles named in the brief were not consulted.
