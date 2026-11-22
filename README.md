# Three Kingdoms AI · 三国志 AI

A bilingual (**English / 中文**) interactive Three Kingdoms grand strategy web game powered by a **pluggable LLM architecture** (**Google Gemini**, **OpenAI / Compatible**, **Anthropic Claude**) with an intelligent **zero-key built-in tactical AI fallback**.

一款支持 **中英双语切换** 的三国大战略网页游戏，内置 **可插拔大模型引擎**（支持 Google Gemini、OpenAI 及兼容接口、Anthropic Claude），并在未配置 API Key 时自动回退至内置战术规则 AI，开箱即玩。

---

## Features · 核心特性

- **Interactive Strategic Map of 214 AD China (十三城汉末兵图)**: Custom SVG map featuring Wei (魏), Shu (蜀), Wu (吴), and contested border commanderies along the Yellow River and Yangtze River, complete with animated march routes and stationed general seals.
- **Turn-Based Grand Strategy (回合制内政与征伐)**: Manage treasury, grain, seasonal taxes, domestic development, fortifications, troop levies, and tactical battles (`Frontal Assault`, `Fire Attack`, `Mountain Ambush`, `Siege Engines`) led by 12 historical generals (Cao Cao, Sima Yi, Zhuge Liang, Guan Yu, Zhang Fei, Zhao Yun, Sun Quan, Lu Xun, etc.).
- **AI Chief Strategist — War Council (军师献策)**: Consult Sima Yi (司马懿), Zhuge Liang (诸葛亮), or Lu Xun (陆逊) in real time using live map telemetry.
- **AI Warlord Diplomacy (AI 敌国君主外交)**: Propose 3-season truces, send gold gifts, declare war, or write custom diplomatic dispatches; rival warlords respond in character with structured accept/reject decisions and relation shifts.
- **Autonomous Rival AI Turns (敌国自主推演)**: Rival kingdoms evaluate threats, recruit, fortify, reinforce, and launch invasions with in-character proclamations.
- **Pluggable AI Engine (可插拔 AI 提供商)**:
  - **Google Gemini** via official `@google/genai` Interactions API (`gemini-4-hydrogen`)
  - **OpenAI / OpenAI-Compatible** (supports OpenAI, Ollama, DeepSeek, OpenRouter via `OPENAI_BASE_URL`)
  - **Anthropic Claude**
  - **Built-in Heuristic Tactical AI** (automatic offline fallback, zero setup required)

---

## Quick Start · 快速开始

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Configure LLM API keys
cp .env.example .env
# Edit .env and add GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.
# Or leave empty to play immediately with the built-in tactical AI!

# 3. Run development server (API + Web UI)
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Scripts · 常用命令

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Express API (`:3001`) + Vite React dev server (`:5173`) |
| `npm run build` | Type-checks and builds both frontend (`dist/`) and server (`dist-server/`) |
| `npm start` | Runs the production server serving both API and built static UI |
| `npm test` | Runs Vitest game engine unit tests |
| `npm run typecheck` | Runs TypeScript checks for client and server |

---

## Project Structure · 目录结构

```text
├── server/
│   ├── index.ts                 # Express server entrypoint
│   ├── api.ts                   # /api/ai/* REST routes
│   └── ai/
│       ├── prompts.ts           # Bilingual prompts & JSON schemas
│       ├── registry.ts          # Pluggable provider router + automatic fallback
│       └── providers/
│           ├── gemini.ts        # @google/genai Interactions API
│           ├── openai.ts        # OpenAI & compatible endpoints
│           ├── anthropic.ts     # Anthropic Messages API
│           └── heuristic.ts     # Offline bilingual tactical AI fallback
└── src/
    ├── game/
    │   ├── types.ts             # Shared TypeScript interfaces
    │   ├── data.ts              # 13 cities, 3 factions, 12 historical generals
    │   ├── engine.ts            # Pure deterministic strategy & combat engine
    │   └── engine.test.ts       # Unit tests
    ├── i18n/translations.ts     # English + 中文 localization
    ├── services/aiClient.ts     # Frontend API client
    └── components/              # Interactive Map, War Council, Diplomacy, Modals
```
