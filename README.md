# Three Kingdoms AI · 三国志 AI

A bilingual (**English / 中文**) **Time-Traveler × Hero-Centric** Three Kingdoms grand strategy web game set on a **realistic topographic map of 214 AD China**, powered by a **pluggable LLM engine** (**Google Gemini**, **OpenAI / Compatible**, **Anthropic Claude**) with an intelligent **zero-key tactical AI fallback**.

一款 **穿越三国 · 名将核心** 中英双语大战略网页游戏：你乘时空穿梭机降临建安十九年（214年），在 **真实地形山川兵图** 上携二十一世纪现代科技与二十四位名将的历史命数档案辅佐明主，同时对抗 **硬核蝴蝶效应、朝堂猜忌、敌国窃密与天下合纵**！

---

## Core Features · 核心玩法

- **Time-Traveler Plot & Hardcore Butterfly Effect (`穿越三国 · 硬核蝴蝶效应`)**:
  - Pledge to **Cao Cao (曹操)**, **Liu Bei (刘备)**, or **Sun Quan (孙权)** as a mysterious **Chrono-Strategist (`天命奇士`)**.
  - Balance **Lord's Trust (`主公信任`)**, **Court Suspicion (`朝堂猜忌`)**, and **Timeline Divergence (`历史偏移度`)**:
    - `0–29%` **Sharp Foresight**: Full historical dossiers & `+18%` Chrono-Insight counters.
    - `30–59%` **Distorted Timeline**: Foresight weakens while rival geniuses (**Zhuge Liang / Sima Yi / Lu Xun**) **reverse-engineer your modern inventions** within 2 seasons!
    - `60%+` **Shattered Timeline**: Textbook weaknesses are obscured (until restored with **Optical Spyglasses**), What-If crises erupt, and rival kingdoms forge a two-front **Anti-Anomaly Grand Coalition (`天下合纵讨逆`)**.
    - If **Court Suspicion > Lord's Trust**, conservative elders launch harsh **Sorcerer Court Trials (`妖言惑众`)**!
- **24 Iconic Heroes with Painted Portraits (`二十四名将 · 羁绊绝技`)**:
  - 18 starting legends across Wei/Shu/Wu + **6 Wandering Heroes** (**Ma Chao, Huang Zhong, Pang Tong, Xu Huang, Taishi Ci, Diaochan**) visible on the map with golden beacons.
  - 5 classic stats (`War`, `Intellect`, `Command`, `Politics`, `Charisma`), Levels 1–5 + XP, Loyalty, unique **Signature Skills (`专属绝技`)**, **Sworn Bonds (`桃园结义 / 五虎上将 / 卧龙凤雏` 等)**, and **1-AP strategic hero relocation**.
- **Interactive 3-Round Pre-Battle Hero Duels (`阵前单挑`)**:
  - Challenge opposing heroes before army battles using Stances, Signature Skills, and Chrono-Insight Counters to swing army morale and capture odds.
- **AI "Three Visits" Recruitment, Prisoner Drama & Execute Vendettas (`三顾茅庐 · 劝降斩首`)**:
  - Recruit wandering legends, persuade captured prisoners, or hold private hero councils via `POST /api/ai/hero-encounter` — heroes react with awe when you invoke their real historical secrets!
  - Full prisoner fate drama: **Persuade (`劝降`)**, **Ransom (+350 Gold)**, **Release with Honor (`义释`)**, or **Execute (`斩首`)** — permanently removing the hero and igniting a **Sworn Vendetta (`血海深仇`, +20% vengeance combat)** on all bonded comrades!
- **Modern Tech Lab (`格物工坊 · 现代科技树`)**:
  - 3 tiers of inventions (**Steel Stirrups, Field Antiseptics, Crop Rotation, Black Powder, Optical Spyglasses, Movable-Type Printing, Recon Hot-Air Balloons, Steam Paddle Warships**) engineered alongside scholar heroes.
- **Realistic 214 AD Topographic Map (`自然地球真实舆图`)**:
  - Built from **Natural Earth 1:50m** coastlines, connected 3D hillshaded mountain ranges, real river systems & lakes, zoom/pan, realm overlays, and clickable hero portrait medallions.

---

## Quick Start · 快速开始

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Configure LLM API keys
cp .env.example .env
# Add GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY
# (or leave empty to play immediately with the built-in heuristic AI!)

# 3. Start API + Web Dev Server
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Runs Express API (`:3001`) + Vite React dev server (`:5173`) |
| `npm run build` | Type-checks and builds frontend (`dist/`) + server (`dist-server/`) |
| `npm start` | Starts production server serving both API and built UI |
| `npm test` | Runs Vitest game engine & Butterfly Effect unit tests |
| `npm run typecheck` | Type-checks client and server TypeScript |
| `npm run capture -- --label <name>` | Shoots every 3D scene from fixed camera presets in headless Chrome and records its cost (see below) |

### Checking a graphics change

`scripts/capture-scenes.mjs` makes "does it look better, and what did it cost" a pair of pictures and a number. With the dev servers running:

```bash
npm run capture -- --label before --timing      # before the change
npm run capture -- --label after --timing       # after it
npm run capture -- --sheet before after         # side-by-side sheets with the cost of each
```

Output goes to `captures/<label>/` (ignored by git): one PNG per preset in both looks, and `metrics.json` with draw calls and triangles per shot and, with `--timing`, the frame interval and GPU time with the frame limiter off. `--only duel,war` and `--looks myth` narrow a run; `--query quality=low` or `--query tone=agx` adds address parameters. `--motion` shoots each preset twice, 0.4 s apart, and reports how much of the picture moved, which is how wind, water and marching are checked without watching them.

Address parameters for looking at one thing at a time (nothing is saved):

| Parameter | Effect |
| --- | --- |
| `?look=myth` / `?look=classic` | Preview an art style |
| `?quality=low` / `medium` / `high` | Preview a graphics-quality tier (the saved choice is in Settings) |
| `?tone=aces` / `agx` / `neutral` | Preview a tone-mapping curve (ACES is what ships) |
| `?fxOff=env,fog,ao,contact` | Switch off ambient sky light, height fog, baked occlusion or contact shadows |
