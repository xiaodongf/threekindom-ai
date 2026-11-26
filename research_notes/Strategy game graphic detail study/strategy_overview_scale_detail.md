# Fine visual detail in strategy, management and city-building games at overview scale (2024 – November 2026)

Research date: 26 November 2026. Scope: what is on screen when the player zooms in on maps, city dioramas and army-scale battles, how it is made, and the rules teams use to stop detail becoming noise.

**How to read the evidence tags.** Every finding carries a provenance tag and a verification tag.

- Provenance: **[Dev]** = statement by the developer (blog, patch note, interview quote, store description written by the developer). **[Review]** = press/reviewer impression. **[Community]** = forum/player comment. **[PR]** = marketing or store-listing copy.
- Verification: **(read)** = I opened the page and the claim was extracted from its text. **(snippet)** = the claim comes from a search-result summary of the page; the page itself was not opened or could not be opened (Paradox forum, unrealengine.com, Epic Games Store and overclock3d all refused automated fetches). Treat (snippet) items as leads to re-verify before quoting.

Research limits to know about: the session's web-search budget ran out before every title was covered, several primary pages were blocked, and I found **no GDC 2024–2026 talk or Vault write-up** specific to these titles. Coverage is therefore uneven: strong for Anno 117, Civilization VII, Total War/Warcore, Dynasty Warriors: Origins, crowd-rendering technique and readability rules; thin for Europa Universalis V map internals, Manor Lords internals, Koei city screens, Bannerlord, Age of Empires IV, Old World and Chinese Three Kingdoms titles.

---

## 1. Which fine details are praised or shown off, title by title

### Takeaway
The details that developers themselves choose to show off are consistently small-scale *process* details rather than more polygons: terrain whose material layout comes from simulated erosion, ground that carries sticks, roots and paving stones, every torch and lit window casting light at night, citizens and animals with their own behaviours, and army models that visibly encode culture, quality and discipline. For several titles on the list (Bannerlord: War Sails, Age of Empires IV, Pharaoh Dynasties, Old World) I found no developer statement about fine graphic detail at all.

### Cited Findings

**Anno 117: Pax Romana (Ubisoft Mainz, released November 2025)**
- [Dev] (read) Terrain: the team "quadrupled our texture splatting resolution" versus Anno 1800; splat maps are generated together with the terrain using "algorithms that simulate aspects of nature such as erosion, thermal weathering, deposition, terrain wear"; displacement mapping lets textures alter terrain shape to add detail without extra 3D assets; maximum buildable slope doubled from 12% to 24%. Later passes add rocks, vegetation, decals, particle effects, water bodies, then "environmental storytelling" and points of interest. Author Björn Frechenhäuser, Senior Level Artist, 8 April 2025 — [Anno Union: Island Creation](https://www.anno-union.com/devblog-island-creation-in-anno-117-pax-romana/)
- [Dev] (read) Citizens and animals ("feedback units"): "Feedback Unit is the term we use for people walking, working, eating"; the team "drastically increased the quality and detail" versus Anno 1800; humans were motion-captured; animals have a few variants "so that not all wolves" look the same; a wolf has three cycles (walk, run, idle) while humans have "many more" (carrying, farm work, factory work); animals run away when buildings are placed near them; herd sizes differ by species. Detail is capped "for performance reasons ... since there are so many feedback units", and LOD reduces quality as you zoom out — [Anno 117 DevBlog: Animating animals (devtrackers mirror)](https://devtrackers.gg/anno-1800/p/721951f5-devblog-animating-animals-models-rigs-and-animations); new feedback-unit set and mocap first announced 28 November 2024 — [Anno Union project update](https://www.anno-union.com/?p=20092)
- [Review] (read) PC Games Hardware's tech check: pipeline moved to physically based rendering with a new global-illumination system; each light source including torches, fire bowls and lit citizen windows at night casts its own shadows; reflections include dynamic objects such as population figures; heavy tessellation means small details such as sticks, roots, gravel and paving stones come from terrain geometry; ground fog settles in forests, marshes and depressions; volumetric clouds are used in the fog of war. PCGH singled out night lighting, fog and clouds as the most atmospheric elements. No developer is quoted — [PCGH Technik-Check](https://www.pcgameshardware.de/Anno-117-Pax-Romana-Spiel-74719/Specials/Raytracing-PBR-Technik-Check-Benchark-Kandidat-1480212/)
- [Dev/PR] (snippet) Ubisoft's PC spec post lists ray tracing, global illumination and atmospheric scattering — [Ubisoft News](https://news.ubisoft.com/en-us/article/52rVna7ggbsmPejs9MXwHj/anno-117-pax-romana-pc-specs-revealed). [Review] (snippet) Ray tracing is optional; without it, lighting relies on precomputed shadows and GI with screen-space reflections on water and buildings — [GameGPU](https://en.gamegpu.com/test-gpu/rts-strategii/anno-117-pax-romana-test-gpu-cpu). [Review] (snippet) Demo RT presets were Low (GI), Medium (GI), High (GI + reflections); one benchmark fell from about 97 fps to about 62 fps going Low to High — [PCGH demo test](https://www.pcgameshardware.de/Anno-117-Pax-Romana-Spiel-74719/Specials/Demo-Test-Steam-Gameplay-Systemanforderungen-Release-1481091/)

**Europa Universalis V (Paradox Tinto, released 4 November 2025)**
- [Dev] (snippet; forum page blocked) Tinto Talks #64, 21 May 2025, on army models: a median army shows about 15 models (from 1 up to roughly 30); each model stands for one regiment and reflects its unit type, culture and ethnicity, so multi-ethnic armies look mixed; three visual tiers per age (peasant, soldier, knight); a hidden "uniformity" system driven by discipline, experience, army tradition and levy-versus-regular status moves regiments toward an "ideal" look derived from the country's primary culture; the game launches with seven graphical archetypes that also split character portraits, city buildings, event illustrations and UI skins — [Paradox forum: Tinto Talks #64](https://admin-forum.paradoxplaza.com/forum/developer-diary/tinto-talks-64-21st-of-may-2025.1756210/post-30382940)
- [Community] (snippet) In the same thread players said the army models are too small to see at normal zoom, and asked for smaller city models on the terrain map; one reply reports the developers then made cities smaller — [thread page 12](https://admin-forum.paradoxplaza.com/forum/developer-diary/tinto-talks-64-21st-of-may-2025.1756210/page-12), [page 14](https://admin-forum.paradoxplaza.com/forum/developer-diary/tinto-talks-64-21st-of-may-2025.1756210/page-14)
- [Review] (snippet) 28,570 locations versus about 2,500 in base EU4 — [CGMagazine review](https://www.cgmagonline.com/review/europa-universalis-v-pc-review/). Terrain, building, grain and field textures noticeably improved over earlier Paradox titles — [GameGPU](https://en.gamegpu.com/test-gpu/rts-strategii/europa-universalis-v-test-gpu-cpu). Minimum spec reportedly needs 6 GB of video memory — [VideoGamer](https://www.videogamer.com/europa-universalis-v-colonialism)

**Civilization VII (Firaxis, February 2025; updates through 1.5.1 on 10 November 2026)**
- [Dev] (read) Unit fidelity "has gone up substantially", down to buckles and armour; units pair off and stay engaged until the turn ends ("continuous combat"); ships "smash into each other" with crews fighting on deck (John Fitzgerald). Every building is made to reflect its civilization; shared architecture is re-coloured regionally and grander civs get "nicer materials like gold or marble" (Matthew Quickel) — [Hooked Gamers interview, 23 October 2024](https://hookedgamers.com/features/2024/10/23/the_art_of_civilization_vii_-_an_interview.html)
- [Dev] (read) 2K Valencia built buildings, improvements and wonders "including the advancing build states of the Wonders", textured in 3ds Max and Substance Painter — [2K Valencia](https://valencia.2k.com/civ-vii-environment-art/)
- [Dev] (read) Districts appear automatically when a building is placed; each urban tile holds two buildings; new districts must touch the city centre and "expand outward", giving cities "a more organic, natural layout as they grow"; two unique buildings on one tile form a Unique Quarter with "distinct visual flair"; each wonder occupies a full tile (Edward Zhang, Dev Diary #3) — [Firaxis dev diary](https://civilization.2k.com/civ-vii/game-guide/dev-diary/managing-your-empire/)

**Manor Lords (Slavic Magic, early access April 2024; 0.8.117 on 31 October 2026)**
- [Dev] (read) Store description: "gridless city-building experience with full freedom of placement and rotation"; residents "build their homes in accordance with the historical burgage plot system", with areas "subdivided based on your roads and the allotted space, and homes will scale accordingly"; extensions are built behind larger homes; deer herds migrate away from settlement; over-cutting causes visible deforestation; spring rains and winter snows — [Steam store page](https://store.steampowered.com/app/1363080/Manor_Lords/)
- [Dev] (snippet; page blocked) Greg Styczeń used photogrammetry, motion capture and pre-calculated destruction simulations in Unreal Engine 4, and Megascans assets — [Epic Games Store news](https://store.epicgames.com/news/manor-lords-solo-developer-s-highly-anticipated-medieval-strategy-game-hits-this-month); early experiments included grass bending under feet using distance fields — [Unreal Engine developer interview](https://www.unrealengine.com/en-US/developer-interviews/solo-dev-makes-sophisticated-sim-manor-lords-using-unreal-engine)
- [Review] (snippet) 2026 patches: August beta 0.8.097 made seasons drive animal breeding and produce availability — [PCGamesN](https://www.pcgamesn.com/manor-lords/update-august-2026-beta); 0.8.117 reached the default branch on 31 October 2026 — [The Click](https://www.theclick.gg/?p=101812)

**Total War (Creative Assembly)**
- [Dev] (read) Total War: Warhammer 40,000 FAQ, 9 February 2026: "blood and dismemberment is key to creating an authentic experience", included in the base game — [totalwar.sega.com](https://totalwar.sega.com/en/details/40kannouncement.html)
- [Review] (read) Gamescom 2026 hands-on: players blast ruined buildings and create large craters; rubble and scrap then serve as cover (Stefan L, 31 August 2026) — [TheSixthAxis](https://www.thesixthaxis.com/?p=475673). A developer confirmed a parked train could be blown up to open a route (Eric Van Allen, 1 September 2026) — [Game Informer](https://gameinformer.com/gamescom-2026/2026/09/01/total-war-at-40000-times-scale)
- [Dev] (read) Medieval III Q&A, 6 April 2026: a goal is to "put everything on the map" and "bring regions to life more than in previous games"; the game is still in pre-production — [totalwar.sega.com](https://totalwar.sega.com/en/details/medieval3-qa-part1.html)
- [PR] (snippet) Total War: Warhammer III "Lords of the End Times" was dated for 24 September 2026 — [Game Developer press listing](https://www.gamedeveloper.com/press-release/new-gameplay-for-total-war-warhammer-40-000-revealed-alongside-behind-the-scenes-studio-footage). I found no statement about its visuals.

**Age of Mythology: Retold (World's Edge, September 2024)**
- [Dev] (read) Kristen Pirillo on the Argus: formerly "a rough sphere with some tentacles", now "a ton of eyeballs that all move independently, it slithers around" — the stated goal is to "amp everything up" — [Xbox Wire, 20 August 2024](https://news.xbox.com/en-us/2024/08/20/beyond-a-remake-how-age-of-mythology-retold-revives-and-retools-a-beloved-classic/)
- [Review] (snippet; outlet-to-quote mapping not verified) Reviews credit better contrast in unit silhouettes, stronger lighting and more readable terrain, but say effects get busy when several god powers fire at once — [Wccftech review](https://wccftech.com/review/age-of-mythology-retold/), [PCGamesN review](https://www.pcgamesn.com/age-of-mythology-retold/review)

**Endless Legend 2 (Amplitude, early access September 2025)**
- [Review] (snippet) Praised for "very good use of texture on terrain to show different ground types" — [PC Gamer review](https://www.pcgamer.com/games/strategy/endless-legend-2-review/)

**Heroes of Might & Magic: Olden Era (Unfrozen, early access 2026)**
- [Dev] (snippet) After community feedback the town screen and adventure map were "completely redesigned" to be more detailed and atmospheric — [Ensigame](https://ensigame.com/news/gaming/developers-of-heroes-of-might-and-magic-olden-era-share-game-changes-based-on-community-feedback)

**Frostpunk 2 (11 bit studios, September 2024)**
- [Review] (snippet) You can zoom in on one building per district to see "a little vignette of citizens at work", though the reviewer felt it never reads as a living place — [PC Gamer review](https://pcgamer.com/games/city-builder/frostpunk-2-review). Another reviewer saw crowds and automatons "working, celebrating, or rioting" on zoom-in, and described the city as monochrome from afar but vibrant in detail up close — [Windows Central review](https://windowscentral.com/gaming/frostpunk-2-review) (outlet mapping not verified)

**Farthest Frontier 1.0 (Crate, 23 October 2025)**
- [Review] (snippet) Season change is "entirely dynamic and smooth": leaves turn orange and brown, then the ground is covered in snow; villagers huddle indoors during blizzards — [Entertainium review, 22 October 2025](https://entertainium.co/2025/10/22/farthest-frontier-review/)

**Cities: Skylines II (Colossal Order; City Corner #14, 29 October 2026)**
- [Dev] (read) Ground textures are being reworked so that "grass, dirt, sand, and other ground textures ... blend together naturally"; four new biomes (arid, tropical, alpine, Mediterranean) change which plants and rock colours appear — [City Corner #14](https://www.paradoxinteractive.com/games/cities-skylines-ii/news/shaping-the-environment)

**Tempest Rising (Slipgate Ironworks, April 2025)**
- [Review reporting developer intent] (snippet) Troop designs carry real-world props, such as an engineer's red toolbox and shovel, to strengthen silhouettes without breaking the grounded look — [Creative Bloq](https://www.creativebloq.com/3d/video-game-design/how-tempest-rising-uses-unreal-engine-5-to-channel-the-heart-of-90s-strategy-games-without-losing-its-soul)

**Three Kingdoms titles**
- [PR] (snippet) Romance of the Three Kingdoms 8 Remake (Koei Tecmo, October 2024; Power-Up Kit bundle 29 January 2026) presents scenery "using ink paintings, combining 2D visuals and 3D depth" — [Steam](https://store.steampowered.com/app/2288150), [Gematsu](https://www.gematsu.com/games/romance-of-the-three-kingdoms-8-remake)
- [PR] (snippet) Three Kingdoms: World Conquest (Rastar, mobile) advertises "1:1 historical architecture replicas, true terrain and dynamic seasonal weather" — [Google Play listing](https://play.google.com/store/apps/details?id=com.rastargames.zdwjsea&hl=en)
- [PR] (snippet; Chinese portal/store pages, exact page-to-claim mapping not verified) 鸿图之下 (Zulong/Tencent, Unreal Engine 4) claims a 4-million-tile fully 3D world with real terrain, real-time weather, day-night and four seasons; 三国:谋定天下 claims a seamless 3D map that turns to snow in winter with battle effects; 三国群英传:策定九州 claims Unreal Engine 5 and a main city based on late-Han archaeology, with frame-rate dips reported at 1,000 units on screen — [Xiaomi game portal](https://game.xiaomi.com/viewpoint/1651274718_1772032760436_100), [App Store listing](https://apps.apple.com/cn/app/id1595027904)

### Inferences
- (My inference) The developer-highlighted details cluster into five families that are all achievable procedurally: (1) terrain material placement driven by slope/erosion-like rules rather than hand painting; (2) ground micro-relief; (3) many small local lights at night; (4) autonomous small actors with a handful of looping behaviours; (5) army figures whose look is data-driven by the simulation (culture, tier, discipline).
- (My inference) EU5's "uniformity" idea — the more disciplined and experienced the regiment, the more uniform its look — is a cheap, legible way to show army quality on a map with only about 15 figures per army.
- (My inference) Anno's wolf with three cycles shows how little animation is needed for an actor to read as alive at overview scale; behaviour triggers (flee when building is placed) carry more of the effect than animation count.

### Gaps
- No developer source found on fine detail for Bannerlord: War Sails (TaleWorlds dev blogs [Setting Sail](https://www.taleworlds.com/en/News/578) and [Ships](https://www.taleworlds.com/en/News/583) cover ship classes, wind and damage, not rendering), Age of Empires IV updates, Total War: Pharaoh Dynasties, Old World, or Ultimate General.
- EU5 terrain, rivers, seasons and city models: the relevant Tinto Talks could not be opened; only the army-model diary is covered, and only through a snippet.
- Manor Lords: I could not confirm from an opened source the commonly described staged construction, worn footpaths or snow build-up; the Unreal Engine and Epic interviews were blocked.
- No Three Kingdoms strategy release from June–November 2026 with documented visuals was found; the Chinese mobile claims above are marketing copy.
- Reviews of Anno 117 that describe zoomed-in city life in detail (PC Gamer) could not be read.

---

## 2. How it is done technically, where documented

### Takeaway
Documented techniques are: procedurally generated high-resolution splat maps plus displacement for terrain (Anno 117), image-based tree LODs with shared textures (Cities: Skylines II), tool-defined movement areas and randomised scripted actors for city life (Anno), and vertex-animation textures with GPU instancing for crowds (two 2026 engine write-ups with numbers). I found no developer documentation in this period for Paradox's map-object system, terrain virtual texturing, Manor Lords' plot generator internals or any strategy-game water shader.

### Cited Findings

**Terrain**
- [Dev] (read) Anno 117: terrain generation is procedural; splat maps are generated with the terrain from erosion, thermal weathering, deposition and wear simulations at four times Anno 1800's splat resolution; texture displacement adds relief; vegetation is scattered with Houdini after the procedural steps and then hand-adjusted; islands are concepted in World Machine and blocked out in the proprietary Anno Editor; decals and particle effects are a late pass — [Anno Union: Island Creation](https://www.anno-union.com/devblog-island-creation-in-anno-117-pax-romana/)
- [Review] (read) Anno 117 uses tessellation heavily so that small ground details are real geometry — [PCGH](https://www.pcgameshardware.de/Anno-117-Pax-Romana-Spiel-74719/Specials/Raytracing-PBR-Technik-Check-Benchark-Kandidat-1480212/)
- [Dev] (read) Cities: Skylines II designs terrain textures, biomes and vegetation together and is reworking texture transitions to blend naturally — [City Corner #14](https://www.paradoxinteractive.com/games/cities-skylines-ii/news/shaping-the-environment)
- [Dev] (snippet) Cities: Skylines II's optimisation guide describes virtual texturing only as a way to use video memory more efficiently for textures — [Paradox support](https://support.paradoxplaza.com/hc/en-us/articles/14648080779538-Cities-Skylines-2-Our-Guide-to-Optimizing-Performance)

**Vegetation and impostors**
- [Dev] (read) Cities: Skylines II tree LODs are not hand-made models: the game uses "a few pictures of the tree taken from various angles" instead of "thousands of triangles per tree"; new trees share one texture across growth stages; this "helps keep the rendering performance manageable" with trees to the horizon — [City Corner #14, 29 October 2026](https://www.paradoxinteractive.com/games/cities-skylines-ii/news/shaping-the-environment)

**City life systems**
- [Dev] (read; Anno 1800, January 2018 — outside the date window but the only detailed description of the system Anno 117 inherits) Buildings have distinct producing and idle animation states, with smoke and fire effects reduced or removed when idle; randomisation parameters mean "animations will not play out the same"; the in-house BoB tool defines movable areas, no-clip construction areas and click hitboxes and places chimney smoke and props such as streetlights and crates; a Feedback Editor assigns triggers; scripted "actors" (a baker, an innkeeper, a cat-and-dog chase) appear at designer-set frequency along spline or dummy paths (Carsten Eckhardt, senior 3D artist) — [Anno Union: Visual Feedback](https://www.anno-union.com/devblog-visual-feedback/)
- [Dev] (read) Anno 117 actor pipeline: 2D concept, low-poly mesh, high-poly sculpt baked to a normal map, Substance Painter textures; rigs are "reduced in complexity" (the wolf cannot move its eyes but can move its ears); a control rig drives several bones at once — [Anno 117 DevBlog: Animating animals](https://devtrackers.gg/anno-1800/p/721951f5-devblog-animating-animals-models-rigs-and-animations)

**Crowds: vertex-animation textures (VAT) and instancing**
- [Dev/technical artist write-up] (read) Unreal Engine stadium crowd, 6,072 agents: skeletal meshes gave 28.37 fps, 34.15 ms game thread, 21,369 draw calls; VAT on hierarchical instanced static meshes gave 57.31 fps, 0.66 ms game thread, 276 draw calls (RTX 3070, 1080p). Each animation frame is "a horizontal row in the texture" and the V coordinate scrolls over time; a per-instance random value offsets start time so agents do not sync and also drives a hue shift; shirt colours are per-instance custom data set once at spawn; several baked clips are blended in the shader; a stadium wave is computed entirely in the shader from each agent's ID. 16-bit float textures are required because 8-bit "doesn't have enough precision" and causes vertex jitter; constant mesh topology is required. Mesh budget about 14,000 triangles per agent (Yeonju "Kaley" Cho, 10 June 2026) — [80.lv](https://80.lv/articles/6-000-agents-on-one-game-thread-novel-high-performance-framework-for-gpu-driven-crowd-systems/)
- [Dev] (read) Mega Cat Studios (Backyard Baseball, Unity, 14 August 2026): with skinned meshes "you can only render a few dozen characters before performance starts to drop"; "by combining VAT with GPU instancing, you can push thousands of animated entities on screen at once"; the same technique drives swaying grass; per-instance shader properties (for example leaf colour) give variation from one mesh and one material; static batching was their top optimisation and its main constraint is minimising the number of materials; VAT trades CPU for memory — [Unity blog](https://unity.com/blog/rendering-at-scale-efficient-strategies-for-massive-object-counts)
- [Dev] (snippet) Manor Lords' Styczeń says his units are crowd simulations, so they cannot carry as much animation fidelity as full skeletal animation Blueprints — [Unreal Engine developer interview](https://www.unrealengine.com/en-US/developer-interviews/solo-dev-makes-sophisticated-sim-manor-lords-using-unreal-engine)
- [Review] (headline only) An Unreal Engine 5 gladiator game, Trakonius (Edvar Studio), renders 18,000 characters in real time (5 September 2025); the technique was not retrievable — [Creative Bloq](https://www.creativebloq.com/3d/video-game-design/you-wont-believe-how-many-characters-are-real-time-rendered-in-this-unreal-engine-5-gladiator-game)

**Procedural buildings and modular kits**
- [Dev] (read) Manor Lords: plots are subdivided from the player's roads and the allotted space and "homes will scale accordingly"; back-yard extensions attach behind larger homes — [Steam store page](https://store.steampowered.com/app/1363080/Manor_Lords/)
- [Dev] (read) Civilization VII: shared architecture sets are varied by regional colour and material upgrades; "more LODs" and "a robust LOD system" were needed to support the fidelity (Matthew Quickel) — [Hooked Gamers](https://hookedgamers.com/features/2024/10/23/the_art_of_civilization_vii_-_an_interview.html)

**Engines and lighting**
- [Dev] (read) Total War's new Warcore engine lets the team "improve how we render things and the quality that we are rendering things at", "build modular animations in a more modern way" and "handle the sheer volume of projectiles" (Dave Petry, battle product owner, Gamescom 2026) — [TechRadar, 7 September 2026](https://techradar.com/gaming/creative-assembly-says-its-new-warcore-engine-has-allowed-it-to-take-total-war-warhammer-40-000-into-space-and-build-a-bigger-play-area-for-all-the-planets-all-the-solar-systems-the-whole-galaxy-i-think-thats-the-biggest-thing-for-campaign)
- [Review] (snippet) Warcore moves Total War to DirectX 12 and includes Havok physics; it also powers Medieval III and targets consoles — [GameWatcher preview](https://www.gamewatcher.com/previews/total-war-warhammer-40000-preview/13503), [GamesRadar](https://www.gamesradar.com/games/total-war/total-wars-new-warcore-engine-will-power-total-war-medieval-3-bring-the-strategy-series-to-console-and-restore-modding-we-want-to-put-these-tools-in-the-hands-of-players)

### Inferences
- (My inference, for a WebGL2/three.js procedural project) The VAT recipe maps directly onto `InstancedMesh` plus a float data texture sampled in the vertex shader: one row per frame, a per-instance phase offset and tint, clip blending in the shader. The 80.lv numbers suggest the win is almost entirely CPU and draw-call side, which is the usual WebGL bottleneck. Half-float textures are needed for precision (the 8-bit jitter warning applies).
- (My inference) Because all geometry here is procedural, "baking" a VAT can be done at load time by evaluating the existing procedural pose function for each frame and writing positions to a texture; no authored animation is required.
- (My inference) Anno's splat-from-simulation approach can be approximated in a shader from height, slope, curvature and flow accumulation to place rock, scree, grass, silt and wear, instead of authoring maps.
- (My inference) Cities: Skylines II's multi-angle tree pictures are classic impostors; for a tilted, mostly fixed-pitch campaign camera a small set of pre-rendered angles (or a single card per tree at far zoom) would suffice.
- (My inference) Anno's BoB/Feedback Editor is, in effect, a per-building data record: walkable areas, effect anchors, prop anchors and trigger rules. A procedural diorama can carry the same record per district so that actors, smoke and props are placed by rule.

### Gaps
- Paradox map-object system (EU5): no developer documentation reachable.
- Terrain virtual texturing and height-blended materials: no 2024–2026 strategy-game developer explanation found beyond the one-line Cities: Skylines II guide.
- Water (river flow, shore foam, reflections): no developer technique write-up found for any listed title; only reviewer notes that Anno 117's water and waves are more detailed and use screen-space or ray-traced reflections.
- Manor Lords burgage-plot generation internals and Anno 117's modular building kits: not documented in any source I could open.
- GPU-driven rendering / indirect draws in these specific games: nothing found.
- No GDC 2024–2026 session, ArtStation breakdown or Digital Foundry piece on these titles was located before the search budget ran out.

---

## 3. City close-up dioramas and showing city state without numbers

### Takeaway
The best-documented method is Anno's: every building has visibly different working and idle states (people and machines moving, smoke and fire on or off), events such as fire play out on the buildings themselves, and scripted mini-scenes with randomised timing make streets feel inhabited. Civilization VII sells its city diorama through civilization-specific architecture, outward organic growth and staged wonder construction; Frostpunk 2's one-vignette-per-district approach is the cautionary example reviewers found too abstract.

### Cited Findings
- [Dev] (read; Anno 1800, 2018) Visual feedback "helps the player to have a better understanding what is currently going on in their metropolis" and indicates whether a building is "productive, idling or affected by events", for example "a blazing fire spreading through your residential district". Idle factories lose or reduce smoke and fire effects and worker activity — [Anno Union: Visual Feedback](https://www.anno-union.com/devblog-visual-feedback/)
- [Dev] (read; Anno 1800) Small story vignettes (a baker's routine, a cat-and-dog chase across the market square) are a deliberate goal; designers set how often an actor appears and how long it stays; randomised movement areas stop units repeating the same action in the same place — [Anno Union: Visual Feedback](https://www.anno-union.com/devblog-visual-feedback/)
- [Review] (read) Anno 117 at night: each torch, fire bowl and lit citizen window is a shadow-casting light, and PCGH found the night lighting especially atmospheric — [PCGH](https://www.pcgameshardware.de/Anno-117-Pax-Romana-Spiel-74719/Specials/Raytracing-PBR-Technik-Check-Benchark-Kandidat-1480212/)
- [Review] (snippet) Anno 117 "has a variety of subtle feedback systems, enough to tip you off to how all the game's mechanics and simulations work, but not so much that you feel led by the nose" — [PCGamesN](https://www.pcgamesn.com/anno-117-pax-romana/new-ubisoft-city-building-game)
- [Dev] (read) Civilization VII: the camera "can come right up to the front door" of buildings; buildings reflect the owning civilization with regional colour and richer materials for grander civs; motifs, statues and religious elements are used to "bring it all together to make a cohesive city" (Matthew Quickel) — [Hooked Gamers](https://hookedgamers.com/features/2024/10/23/the_art_of_civilization_vii_-_an_interview.html)
- [Dev] (read) Civilization VII: growth is shown by districts spreading outward from the centre; wonders have "advancing build states"; Unique Quarters give "distinct visual flair that reflects your civilization's culture and progress" — [Dev Diary #3](https://civilization.2k.com/civ-vii/game-guide/dev-diary/managing-your-empire/), [2K Valencia](https://valencia.2k.com/civ-vii-environment-art/)
- [Dev] (read) Civilization VII 1.5.1 (10 November 2026): "Urban districts on Vegetated tiles now have updated visuals to show this more clearly", and the "Repair All" option now appears even if only one tile is damaged — [Civ VII update notes](https://civilization.2k.com/civ-vii/game-update-notes/)
- [Dev] (read) Manor Lords shows prosperity through the plots themselves: house size follows plot size, and back-yard extensions (vegetable gardens, chickens, goats, workshops) appear behind homes — [Steam store page](https://store.steampowered.com/app/1363080/Manor_Lords/)
- [Review] (snippet) Frostpunk 2: zooming shows one building per district with a small vignette of citizens at work, but "it never feels like you're peering into a living, breathing place" — [PC Gamer review](https://pcgamer.com/games/city-builder/frostpunk-2-review); art director Łukasz Juszczyk describes light in the art as "a way to represent [continued] life and the passage of time" — [Epic Games Store interview](https://store.epicgames.com/news/frostpunk-2-exclusive-interview-leave-your-fingerprint-on-a-frozen-world) (page blocked; via snippet)
- [Dev/PR] (snippet) Farthest Frontier: town centre and housing "advance through multiple building tiers as the prosperity and desirability of your town increases" — [Game Developer press release](https://www.gamedeveloper.com/press-release/farthest-frontier-forges-ahead-roadmap-revealed-) (page-to-quote mapping not verified)
- [Review] (snippet; 2023 title, outside window) Nobunaga's Ambition: Awakening: zooming the campaign map shows farms, mines and other facilities appearing over time around castles without the player placing them — [GameGrin review](https://gamegrin.com/reviews/nobunagas-ambition-awakening-review) (outlet mapping not verified)
- [Dev] (read) Total War: Medieval III aims to "put everything on the map" and "bring regions to life more than in previous games" — [Medieval III Q&A, 6 April 2026](https://totalwar.sega.com/en/details/medieval3-qa-part1.html)

### Inferences
- (My inference) A state-to-visual vocabulary assembled from the sources above: **prosperity** = building tier/size and richer materials (Civ VII, Farthest Frontier), filled back yards and extensions (Manor Lords), more actors and vignettes (Anno); **activity versus stagnation** = chimney smoke, moving workers and machines on or off (Anno); **unrest or disaster** = fire on the buildings, crowds rioting rather than working (Anno, Frostpunk 2); **damage** = per-tile damaged state that is later repaired (Civ VII); **construction** = staged build states (Civ VII wonders); **night** = many small warm lights from windows and torches (Anno 117); **season** = foliage colour then snow cover (Farthest Frontier).
- (My inference) Frostpunk 2's reception suggests a diorama needs activity spread across the whole district, not one showcase spot per district, to read as inhabited.
- (My inference) Garrison strength was not addressed by any source; the EU5 principle of one figure per regiment with tier-dependent appearance could be reused on walls and parade grounds.

### Gaps
- Koei Romance of the Three Kingdoms city screens and mobile SLG inner-city scenes: no developer or reviewer description of how they visualise city state was found.
- Total War settlement visuals (growth, siege damage states) in 2024–2026 titles: nothing found.
- Old World city visuals: not researched before the search budget ran out.
- Anno 117-specific description of riot, fire and unhappiness visuals: not found; the 2018 Anno 1800 blog is the nearest source.
- No source described how garrison size or time of day is used to convey city state.

---

## 4. Army-scale battles

### Takeaway
Dynasty Warriors: Origins reached "several thousand" soldiers on screen (against a programmer target of 10,000) and its makers treat the mass as atmosphere, pulling the camera back and designing ordinary soldiers not to interrupt the player. Creative Assembly attributes readable melee to matched (paired) animations and is rebuilding animation, rendering and projectile handling in Warcore. The concrete, numbers-backed crowd method available in 2026 write-ups is VAT plus instancing with per-instance phase and colour variation.

### Cited Findings

**Dynasty Warriors: Origins (Omega Force / Koei Tecmo, January 2025)**
- [Dev] (read) Producer Tomohiko Sho: programmers were asked from the planning stage to "display as many soldiers as possible"; the count is at least ten times that of Dynasty Warriors 7 and 8 — where about 100 appeared, about 1,000 now do — and peaks at "several thousand" on screen. Because of the numbers the camera sometimes pulls farther from the hero and players may ask "where am I?", which the team was still tuning. Ordinary soldiers are aggressive but do not interrupt the player's attack animations. Guard soldiers had been cut after the third game to free rendering capacity for more soldiers and return here. Morale visibly changes how hard soldiers fight — [Famitsu interview, July 2024](https://www.famitsu.com/article/202407/10868)
- [Dev] (read) "The programmers on our team wanted to show at least 10,000 soldiers on the screen" (Sho, to TheGamer) — [GamingBolt](https://gamingbolt.com/dynasty-warriors-origins-could-only-be-made-on-current-gen-hardware-developer-says); (snippet) the aim was "as many enemies as the PS5 could handle" — [Automaton](https://automaton-media.com/en/news/dynasty-warriors-origins-devs-aimed-to-put-as-many-enemies-as-the-ps5-could-handle-on-screen/)
- [Dev] (read) The director (named in the article as Sekiguchi) said the starting point was concept art of massive armies clashing under a rain of arrows, that there are "truly several thousand people on screen", and that falling sparks contribute to atmosphere — [Game Watch interview](https://game.watch.impress.co.jp/docs/interview/1624598.html)

**Total War**
- [Dev] (read) Greg Alston, art director for Total War: matched animations began on Medieval II, where "we started to understand more about the readability of animations"; Rome's combat had been plain motion capture with few tweaks, and its soldiers lacked shoulder bones, making attacks stiff; animators from Spartan: Total Warrior made the motions more theatrical — [DBLTAP, 2 September 2025](https://www.dbltap.com/news/total-war-medieval-2-matched-combat-animations-spartan-total-warrior-history)
- [Review reporting developers] (snippet) In Total War: Warhammer a matched animation is a single animation shared by two entities; the newer system lets one strike hit several soldiers who each react separately, with matched animations kept for major moments or kills — [PCGamesN](https://www.pcgamesn.com/total-war-warhammer/total-war-warhammer-revealed-creative-assembly-unleash-a-beast)
- [Dev] (read) Warcore: modular animation system, improved render quality, large projectile volumes; destruction leaves rubble and craters that become cover — [TechRadar](https://techradar.com/gaming/creative-assembly-says-its-new-warcore-engine-has-allowed-it-to-take-total-war-warhammer-40-000-into-space-and-build-a-bigger-play-area-for-all-the-planets-all-the-solar-systems-the-whole-galaxy-i-think-thats-the-biggest-thing-for-campaign), [TheSixthAxis](https://www.thesixthaxis.com/?p=475673)

**Map-scale armies**
- [Dev] (snippet) EU5 shows about 15 figures for a median army, one per regiment, with culture, tier and uniformity variation — [Tinto Talks #64](https://admin-forum.paradoxplaza.com/forum/developer-diary/tinto-talks-64-21st-of-may-2025.1756210/post-30382940)
- [Dev] (read) Civilization VII: "every single unit is just a smaller member of an overall army"; units pair off and stay locked in combat until the turn ends, which adds visual variety (John Fitzgerald) — [Hooked Gamers](https://hookedgamers.com/features/2024/10/23/the_art_of_civilization_vii_-_an_interview.html)

**Crowd rendering numbers and variation tricks**
- [Dev write-up] (read) 6,072 animated agents at 57 fps with 276 draw calls using VAT and instancing; desynchronisation by per-instance random start time; colour variety by per-instance hue shift and per-instance clothing colours; coordinated mass motion (a wave) computed in the shader from agent ID — [80.lv, 10 June 2026](https://80.lv/articles/6-000-agents-on-one-game-thread-novel-high-performance-framework-for-gpu-driven-crowd-systems/)
- [Dev] (read) Skinned characters top out at "a few dozen"; VAT plus instancing reaches "thousands" — [Unity blog, 14 August 2026](https://unity.com/blog/rendering-at-scale-efficient-strategies-for-massive-object-counts)
- [Dev] (snippet; 2010s title) Ultimate General: Gettysburg showed more than 7,000 visible soldiers — [Game-Labs blog](https://ultimategeneral.com/blog/august-progress)
- [Dev] (read) Manor Lords: battles account for "fatigue, weather conditions, and equipment" and "each fallen soldier represents a lost person from your city" — [Steam store page](https://store.steampowered.com/app/1363080/Manor_Lords/)

### Inferences
- (My inference) Three levers recur for keeping a mass of soldiers from looking cloned: time offset per instance, colour/kit variation per instance, and a small share of paired "hero" interactions (matched animations) reserved for the front line or key moments. All three are compatible with an instanced, shader-animated crowd.
- (My inference) The 80.lv stadium wave shows that formation-wide motion (a charge rippling down a line, shields raising in sequence, a volley released rank by rank) can be driven from a per-instance index in the shader with no per-soldier CPU work.
- (My inference) Omega Force's choices imply a hierarchy: the mass is backdrop and atmosphere, and gameplay-relevant figures must stay legible on top of it — hence camera pull-back and non-interrupting rank and file.
- (My inference) At map scale, EU5's one-figure-per-regiment rule keeps armies countable; a marching general with a small escort whose size and look reflect the army may read better than a literal crowd.

### Gaps
- No technical explanation of Dynasty Warriors: Origins' crowd system (LOD, simulation tiers, GPU versus CPU) was found; a CEDEC 2025 search returned nothing.
- No 2024–2026 developer statement found on arrow volleys, dust, banners, battle debris or formation rendering in Total War, Manor Lords, Bannerlord or Ultimate General.
- Unit counts for Total War: Warhammer 40,000 battles are not stated in any source read.
- Manor Lords' crowd animation method beyond "crowd simulation, lower animation fidelity" is unconfirmed (source blocked).

---

## 5. Miniature lighting: sun angle, shadows, ambient occlusion, colour

### Takeaway
I found no source that states a numeric sun angle, shadow length or ambient-occlusion setting for any of these games. What is stated: Firaxis lights and colours Civilization VII as a painted museum diorama or tabletop board ("readable realism": Civ VI's vibrant palette with more realism but without "gritty muddiness"); Stormgate changed its lighting angle specifically to make terrain relief read; and Anno 117's richness at night comes from many small shadow-casting lights.

### Cited Findings
- [Dev] (read) Civilization VII's art director Jason Johnson took "what was best about 6 with its vibrant color palette" and added "more of the realism, but not so much of the gritty muddiness", calling it "readable realism"; inspiration came from museum dioramas and "some of the best game boards ever made and painted"; he "loves that he's basically creating the best looking tabletop game on the planet" (Dennis Shirk, executive producer) — [TechRadar](https://techradar.com/gaming/consoles-pc/civilization-7-interview-preview-gamescom-art-direction)
- [Dev] (read) A museum-diorama style "communicates gameplay information first" and encourages visual exploration (John Fitzgerald); tabletop dioramas "can't put all the detail into it", so the question is which information to keep (Matthew Quickel) — [Hooked Gamers](https://hookedgamers.com/features/2024/10/23/the_art_of_civilization_vii_-_an_interview.html)
- [Dev] (read) Stormgate 0.1.0: "Lighting angles were also changed to make the terrain more readable and pop. This accentuates the normal maps and helps add shine to the terrain"; "All maps across all modes have received a visual pass to improve lighting and clarity" — [Stormgate 0.1.0 notes](https://playstormgate.com/news/content-update-0-1-0)
- [Dev] (snippet) Stormgate Community Update: a team-colour pass on all units "for saturation and luminance consistency", plus unit material updates "to better distinguish them and help readability" — [Stormgate Community Update](https://playstormgate.com/news/the-stormgate-community-update)
- [Review] (read) Anno 117: PBR materials with global illumination; every light source casts shadows; ground fog pools in low terrain — [PCGH](https://www.pcgameshardware.de/Anno-117-Pax-Romana-Spiel-74719/Specials/Raytracing-PBR-Technik-Check-Benchark-Kandidat-1480212/)
- [Dev] (read) Civilization VII 1.5.0 (15 September 2026) added an option to turn off specular reflection highlights on Deep Ocean tiles — [Civ VII update notes](https://civilization.2k.com/civ-vii/game-update-notes/)
- [Dev] (read) Olden Era prototypes: an early pass experimented with lighting, shadows and saturation; the next made objects easier to see with clearer shapes and *less intense* colours; a later pass unified saturation across objects and decorations — [Heroes 3.5 WoG portal summary of Unfrozen's devlog, 25 April 2026](https://heroes3wog.net/homm-olden-era-from-prototype-to-production/)
- [Dev] (snippet; 2015, outside window, but the clearest stated value rule found) Tooth and Tail: environment art limits value changes, number of hues and saturation, while units get wider value range, more hues and more saturation so they "pop off the environment" — [Pocketwatch Games blog](https://blog.pocketwatchgames.com/post/134808733616/pixel-ark-the-look-of-the-animals-in-tooth-and)
- [Review] (snippet) Frostpunk 2 reads as near-monochrome from afar and reveals colour and detail on zoom-in — [Windows Central review](https://windowscentral.com/gaming/frostpunk-2-review) (outlet mapping not verified)

### Inferences
- (My inference) The stated rules reduce to: light for relief (a raking key light that makes normal and height detail read — Stormgate's fix), keep terrain lower in contrast and saturation than the things the player must find (Tooth and Tail, Olden Era's desaturation pass, Stormgate's luminance-consistent team colours), and keep palettes clean rather than muddy (Civ VII).
- (My inference) The Civ VII ocean-specular toggle indicates that bright specular glints on large water areas are a real readability and comfort problem at map scale; water highlights should be restrained or optional.
- (My inference) "Painted tabletop miniature" as a target implies readable, slightly exaggerated local contrast on small models (edge highlights, darkened recesses) rather than purely physical shading; this is my reading of the diorama/tabletop reference, not something Firaxis spelled out.
- (My inference) Night scenes gain richness from many small warm point sources against cool ambient light (Anno 117), which a WebGL scene can fake with emissive windows and a few real lights rather than per-light shadows.

### Gaps
- No numeric sun elevation, shadow-length rule or ambient-occlusion radius was stated by any developer in sources I could reach.
- No lighting-artist breakdown (ArtStation, 80.lv, GDC) for Anno 117, Civilization VII, Manor Lords, Total War or Age of Empires IV was located.
- Time-of-day and season lighting rules for diorama views are undocumented in the sources found.

---

## 6. Readability limits: rules and post-launch fixes

### Takeaway
Studios state the same hierarchy: readability first, detail second. Firaxis simplifies building surface detail at distance ("less rows of bricks") while keeping door-level detail up close; Unfrozen ranks readability above artistic cohesion and found gritty photorealism hurts both readability and performance; fixes shipped after launch in 2025–2026 were about making terrain relief read, toning down effects, clarifying districts against vegetation, unifying team-colour luminance and adding missing levels of detail.

### Cited Findings

**Stated rules**
- [Dev] (read) "Readable realism": keep things realistic so "your actions have weight", but "readable from a distance" (John Fitzgerald). The camera "can come right up to the front door", but zoomed out the team needs "less rows of bricks so that it's readable from the camera" (Matthew Quickel). Units must read at distance; leaders are always large so they can be more realistic (Ryan Andrade). The team needed "more LODs" and "a robust LOD system" — [Hooked Gamers](https://hookedgamers.com/features/2024/10/23/the_art_of_civilization_vii_-_an_interview.html)
- [Dev] (read) Olden Era pillars: "Visual clarity is essential — everything must be easy to read"; "Readability and performance have always been and probably will stay crucial for the genre"; "Factions should have their leading colour palette, but it shouldn't dictate everything within it"; "Stylisation ... prolongs the life of the art style" — [GameSpace summary of Unfrozen devlog](https://gamespace.com/all-articles/news/heroes-of-might-and-magic-olden-era-tackles-the-artstyle/). The team concluded "readability is even more critical within this genre" than artistic cohesion and noted that gritty photorealism hurt readability and performance in earlier 3D strategy games; prototypes iterated on contrast, silhouettes, scale and background detail — [Heroes 3.5 WoG portal, 25 April 2026](https://heroes3wog.net/homm-olden-era-from-prototype-to-production/)
- [Dev] (read) Anno 117: feedback units are capped in detail "for performance reasons ... since there are so many", with LOD reducing quality as you zoom out — [Animating animals DevBlog](https://devtrackers.gg/anno-1800/p/721951f5-devblog-animating-animals-models-rigs-and-animations)
- [Dev] (read) Total War: matched animations taught the team "more about the readability of animations" (Greg Alston) — [DBLTAP](https://www.dbltap.com/news/total-war-medieval-2-matched-combat-animations-spartan-total-warrior-history)
- [Review reporting developer intent] (snippet) Tempest Rising balances "gritty realism" with clarity by giving infantry recognisable props to strengthen silhouettes — [Creative Bloq](https://www.creativebloq.com/3d/video-game-design/how-tempest-rising-uses-unreal-engine-5-to-channel-the-heart-of-90s-strategy-games-without-losing-its-soul)

**Post-launch fixes and toning down**
- [Dev] (read) Stormgate 0.1.0: environment visual pass after feedback; lighting angle changed so terrain is "more readable and pop"; Cryo Tank attack effects "were a little too intense, so we've cooled them down a bit" — [Stormgate 0.1.0 notes](https://playstormgate.com/news/content-update-0-1-0); (snippet) team-colour saturation and luminance consistency pass — [Community Update](https://playstormgate.com/news/the-stormgate-community-update)
- [Dev] (read) Civilization VII 1.5.1 (10 November 2026): urban districts on vegetated tiles re-done "to show this more clearly"; a Map Search panel to "highlight items" on the visible map and a Unit List were added; 1.5.0 fixed naval unit flag icons overlapping and added the ocean specular toggle — [Civ VII update notes](https://civilization.2k.com/civ-vii/game-update-notes/)
- [Dev] (read) Cities: Skylines II (29 October 2026): tree LODs are image-based because full geometry would mean "thousands of triangles per tree"; any change's "impact needs to be monitored and tested carefully" — [City Corner #14](https://www.paradoxinteractive.com/games/cities-skylines-ii/news/shaping-the-environment)
- [Dev/Review] (snippet) Cities: Skylines II launch lesson: the developer acknowledged LOD was among the problems, with some models missing LOD variants, while denying that citizens' modelled teeth were the cause; citizens were detailed because a photo-mode camera can get close; the first performance patch made LOD independent of render resolution — [PC Gamer](https://pcgamer.com/cities-skyline-2-dev-says-yes-our-characters-have-teeth-no-the-characters-teeth-are-not-affecting-performance), [Tom's Hardware](https://www.tomshardware.com/pc-components/gpus/cities-skylines-2-performance-autopsy-highlights-massive-optimization-failures)
- [Community → Dev] (snippet) EU5: players found army models too small at normal zoom and city models too large on the terrain map; a forum reply reports the developers reduced city size; the developers called the map work in progress — [Tinto Talks #64 thread](https://admin-forum.paradoxplaza.com/forum/developer-diary/tinto-talks-64-21st-of-may-2025.1756210/page-14)
- [Review] (snippet) Endless Legend 2: Amplitude "already acknowledged that some work needs to be done to improve readability" in early access — [PCGamesN](https://www.pcgamesn.com/endless-legend-2/out-now-early-access-impressions)
- [Dev] (snippet) Olden Era: interface reworked toward the classic layout after criticism (March 2026) — [iXBT Games](https://ixbt.games/en/news/2026/03/08/heroes-of-might-and-magic-olden-era-peredelali-posle-kritiki-interfeis-stal-blize-k-klassiceskim-geroiam.amp.html)
- [Review] (read) Total War: Warhammer 40,000 preview: the ability-trigger UI was "too small and not obvious enough" amid the chaos — [TheSixthAxis](https://www.thesixthaxis.com/?p=475673)
- [Community] (snippet) Tempest Rising players complained many units lack strong silhouettes, with size, colour scheme and animation too similar — [Steam discussion](https://steamcommunity.com/app/1486920/discussions/0/594013058474466051)
- [Dev] (read) Dynasty Warriors: Origins: with thousands on screen the pulled-back camera can make players lose their own character, which the team said it was still adjusting — [Famitsu](https://www.famitsu.com/article/202407/10868)

### Inferences
- (My inference) A practical rule set distilled from the above: (1) detail density must fall with distance — fewer, bolder surface features at overview, full detail only at the closest zoom; (2) the player's own pieces need a guaranteed luminance and saturation margin over terrain; (3) effects are tuned down, not up, after players see them at scale; (4) built-up areas must contrast with forest and vegetation; (5) every repeated object needs a cheap far representation before it is multiplied; (6) scale is negotiated — figures large enough to see, cities small enough not to swamp the map.
- (My inference) The Cities: Skylines II episode shows that detail justified by an occasional close camera still needs LODs for the normal view; in a procedural pipeline the far LOD should be generated by the same code path with coarser parameters.
- (My inference) Several fixes (Civ VII's Map Search, Unit List, flag de-overlap) are interface answers to visual clutter; when detail rises, findability tools need to rise with it.

### Gaps
- No studio published a quantified LOD policy (triangle budgets per zoom band, pixel-size thresholds) in the sources reached.
- No explicit scale-exaggeration ratios (unit-to-building or building-to-terrain) were stated by any developer.
- Anno 117 and Manor Lords post-launch visual clutter or readability adjustments: none found.
- Age of Empires IV readability statements in 2024–2026: none found (a patch note about per-pixel terrain projection and lighting surfaced in search but could not be dated or opened).
