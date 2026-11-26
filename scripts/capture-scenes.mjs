// Capture-and-timing harness for the game's scenes.
//
// Shoots a fixed set of named camera presets in headless Chrome (real GPU), and records what each
// one costs: draw calls and triangles per frame, and with --timing the frame interval and GPU time
// with the frame limiter off. Run it before and after a graphics change, then build a
// side-by-side sheet of the two runs.
//
//   npm run dev:client   (and the API server)   must already be running
//   npm run capture -- --label before
//   npm run capture -- --label after --only duel,war --looks myth
//   npm run capture -- --label after --timing
//   npm run capture -- --sheet before after
//
// Output goes to captures/<label>/ (ignored by git): one PNG per preset and metrics.json.
// Options: --only a,b   scenes to run (default all)      --looks myth,classic (default both)
//          --timing     also measure uncapped frame cost --base http://localhost:5173
//          --motion     shoot each preset twice, 0.4 s apart, and report how much of it moved
//          --query k=v  extra address parameters, e.g. --query quality=low or --query tone=agx
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = path.join(ROOT, 'captures');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------ presets
/** Tilt the map camera to `polar` radians from vertical at `len` units from its target. */
const mapTilt = (polar, len) =>
  `(()=>{const m=window.__map;const t=m.controls.target;const o=m.camera.position.clone().sub(t);` +
  `const y=Math.cos(${polar})*${len};const h=Math.sin(${polar})*${len};const hl=Math.hypot(o.x,o.z)||1;` +
  `m.camera.position.set(t.x+o.x/hl*h,y,t.z+o.z/hl*h);m.controls.update();return 1})()`;
const cityGoal = (district, radius, phi, theta, extra = '') =>
  `(()=>{const c=window.__city;const w=c.getWorld();const t=w.districts.${district}.focus.clone();${extra}` +
  `c.setGoal({target:t,radius:${radius},phi:${phi},theta:${theta},rate:6});return 1})()`;
const duelCam = (...v) => `(()=>{window.__duelStage.debugCam=[${v.join(',')}];return 1})()`;

const READY = {
  map: '!!window.__map',
  city: '!!(window.__city && window.__city.getWorld())',
  duel: "!!(window.__duelStage && window.__duelStage.phase === 'idle')",
  // The campaign map's canvas is already there; the battle adds its own
  war: "document.querySelectorAll('canvas').length >= 2",
};

/**
 * Each scene opens one page and takes its shots in order. The harness waits until `ready` is
 * true in the page (the scene's debug hook exists, the duel has finished its entrance), then for
 * `settle` milliseconds;
 * a shot's `eval` moves the camera and `wait` lets it arrive. `clip: 'canvas'` crops to the
 * scene's own canvas (the duel stage and the tactical board do not fill the window).
 */
const SCENES = {
  map: {
    url: '/?faction=shu&lang=en&mapDebug=1',
    ready: READY.map,
    settle: 4500,
    shots: [
      { name: 'far_realm' },
      { name: 'province_jing', eval: "window.__map.api.flyToProvince('jing')", wait: 3500 },
      { name: 'near_cities', eval: mapTilt(0.62, 26), wait: 1500 },
      { name: 'near_lowangle', eval: mapTilt(0.97, 27), wait: 1500 },
    ],
  },
  mapmarch: {
    url: '/?faction=shu&lang=en&mapDebug=1',
    ready: READY.map,
    settle: 3500,
    shots: [
      {
        name: 'near_army_march',
        eval:
          "(()=>{const m=window.__map;m.debug.march={id:'dbg1',fromCityId:'jiangling',toCityId:'xiangyang'," +
          "faction:'shu',mode:'assault',heroPortrait:'/portraits/guanyu.jpg'};m.debug.marchT=0.55;return 1})()",
        wait: 6000,
      },
    ],
  },
  mapterrain: {
    url: '/?faction=shu&lang=en&mapDebug=1&mapView=terrain',
    ready: READY.map,
    settle: 4500,
    shots: [{ name: 'far_terrainview' }],
  },
  city: {
    url: '/?faction=shu&lang=en&demoCity=chengdu&cityDebug=1',
    ready: READY.city,
    settle: 6500,
    shots: [
      { name: 'chengdu_overview' },
      { name: 'chengdu_market_close', eval: cityGoal('market', 34, 1.12, 0.5), wait: 2600 },
      { name: 'chengdu_barracks_close', eval: cityGoal('barracks', 30, 1.2, -0.4), wait: 2600 },
      { name: 'chengdu_gate_lowangle', eval: cityGoal('walls', 40, 1.3, 0.25), wait: 2600 },
      { name: 'chengdu_hall_close', eval: cityGoal('hall', 44, 1.05, 0.3), wait: 2600 },
      { name: 'chengdu_fields_low', eval: cityGoal('fields', 60, 1.25, 0.2), wait: 2600 },
    ],
  },
  cityriver: {
    url: '/?faction=wu&lang=en&demoCity=jianye&cityDebug=1',
    ready: READY.city,
    settle: 6500,
    shots: [
      { name: 'jianye_river_overview' },
      { name: 'jianye_market_quay', eval: cityGoal('market', 38, 1.15, 0.9), wait: 2600 },
    ],
  },
  cityriot: {
    url: '/?faction=shu&lang=en&demoCity=jiangling&cityDebug=1&demoScene=riot,breached&demoSeason=autumn',
    ready: READY.city,
    settle: 6500,
    shots: [
      { name: 'jiangling_riot_breached_autumn' },
      { name: 'jiangling_horizon_sky_river', eval: cityGoal('fields', 150, 1.335, -0.6), wait: 3000 },
    ],
  },
  duel: {
    url: '/?faction=shu&lang=en&demoDuel=1',
    ready: READY.duel,
    settle: 1200,
    dpr: 2,
    clip: 'canvas',
    shots: [
      { name: 'plains_idle_stage' },
      { name: 'closeup_left_rider', eval: duelCam(-2.0, 2.7, 4.4, -3.5, 2.3, 0, 26), wait: 1500 },
      { name: 'closeup_right_horse', eval: duelCam(4.6, 1.5, 3.8, 3.5, 1.45, 0, 30), wait: 1500 },
      { name: 'wide_arena_ring', eval: duelCam(0, 5.5, 17, 0, 2.2, -4, 40), wait: 1500 },
      { name: 'closeup_spectators', eval: duelCam(-7.5, 1.8, 1.5, -12, 1.5, -5, 34), wait: 1500 },
    ],
  },
  duelnight: {
    url: '/?faction=shu&lang=en&demoDuel=1&demoTerrain=fortress&demoNight=1&atk=zhaoyun&def=zhangliao',
    ready: READY.duel,
    settle: 1200,
    dpr: 2,
    clip: 'canvas',
    shots: [
      { name: 'fortress_night_stage' },
      { name: 'fortress_night_brazier', eval: duelCam(-4.2, 1.9, 0.2, -6.4, 1.75, -5.2, 30), wait: 1500 },
    ],
  },
  // The war theater plays on a clock with no hold, so its shots are taken at fixed times
  // after its canvas appears.
  war: {
    url: '/?faction=shu&lang=en&demoWar=1&demoTerrain=plains',
    ready: READY.war,
    settle: 1300,
    shots: [{ name: 'plains_melee_early' }, { name: 'plains_melee_mid', wait: 700 }, { name: 'plains_melee_late', wait: 500 }],
  },
  warriver: {
    url: '/?faction=shu&lang=en&demoWar=1',
    ready: READY.war,
    settle: 1500,
    shots: [{ name: 'river_fleet_clash' }, { name: 'river_fleet_late', wait: 500 }],
  },
  tactical: {
    url: '/?faction=shu&lang=en&demoTactical=1',
    settle: 7000,
    dpr: 2,
    clip: 'canvas',
    shots: [{ name: 'river_board' }],
  },
};

// ---------------------------------------------------------------------- page-side measurement
// Counts draw calls and triangles on every WebGL context, times frames, and where the timer-query
// extension exists measures GPU time per frame.
const HOOK = `
(() => {
  const s = (window.__gl = { calls: 0, tris: 0, frames: [], last: { calls: 0, tris: 0 }, lastTs: 0, ms: [], gpu: [], list: [] });
  const P = WebGL2RenderingContext.prototype;
  const triOf = (mode, count) => (mode === 4 ? count / 3 : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0);
  const wrap = (name, fn) => { const o = P[name]; P[name] = function (...a) { s.calls++; s.tris += fn(a); return o.apply(this, a); }; };
  wrap('drawElements', (a) => triOf(a[0], a[1]));
  wrap('drawArrays', (a) => triOf(a[0], a[2]));
  wrap('drawElementsInstanced', (a) => triOf(a[0], a[1]) * a[4]);
  wrap('drawArraysInstanced', (a) => triOf(a[0], a[2]) * a[3]);
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = gc.call(this, type, ...rest);
    if (c && type === 'webgl2' && !s.list.some((e) => e.gl === c)) {
      s.list.push({ gl: c, ext: c.getExtension('EXT_disjoint_timer_query_webgl2'), open: null, waiting: [] });
    }
    return c;
  };
  const tick = (ts) => {
    let gpuNs = 0, gpuSeen = false;
    for (const e of s.list) {
      try {
        if (window.__glSync) e.gl.finish();
        if (!e.ext || !window.__glTime || e.gl.isContextLost()) continue;
        if (e.open) { e.gl.endQuery(e.ext.TIME_ELAPSED_EXT); e.waiting.push(e.open); e.open = null; }
        const disjoint = e.gl.getParameter(e.ext.GPU_DISJOINT_EXT);
        while (e.waiting.length && e.gl.getQueryParameter(e.waiting[0], e.gl.QUERY_RESULT_AVAILABLE)) {
          const q = e.waiting.shift();
          if (!disjoint) { gpuNs += e.gl.getQueryParameter(q, e.gl.QUERY_RESULT); gpuSeen = true; }
          e.gl.deleteQuery(q);
        }
        e.open = e.gl.createQuery();
        e.gl.beginQuery(e.ext.TIME_ELAPSED_EXT, e.open);
      } catch (err) { e.ext = null; }
    }
    if (gpuSeen) { s.gpu.push(gpuNs / 1e6); if (s.gpu.length > 240) s.gpu.shift(); }
    s.frames.push({ calls: s.calls - s.last.calls, tris: Math.round(s.tris - s.last.tris) });
    if (s.frames.length > 240) s.frames.shift();
    s.last = { calls: s.calls, tris: s.tris };
    if (s.lastTs) { s.ms.push(ts - s.lastTs); if (s.ms.length > 240) s.ms.shift(); }
    s.lastTs = ts;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const med = (arr) => { const b = [...arr].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const p90 = (arr) => { const b = [...arr].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length * 0.9)] : 0; };
  window.__glReset = () => { s.frames.length = 0; s.ms.length = 0; s.gpu.length = 0; };
  window.__glStats = () => {
    const f = s.frames.slice(-120).filter((x) => x.calls > 0);
    const ms = s.ms.slice(-120);
    const gpu = s.gpu.slice(-120);
    return {
      drawCalls: med(f.map((x) => x.calls)),
      triangles: med(f.map((x) => x.tris)),
      frameMs: +med(ms).toFixed(2),
      frameMsP90: +p90(ms).toFixed(2),
      gpuMs: gpu.length ? +med(gpu).toFixed(2) : null,
      gpuMsP90: gpu.length ? +p90(gpu).toFixed(2) : null,
    };
  };
})();
`;

// The stage to crop to is the smallest canvas of a useful size: the campaign map's canvas is
// still in the page behind a duel or a tactical battle, and it is the larger one.
const CLIP_CANVAS = `(()=>{let best=null,area=Infinity;for(const c of document.querySelectorAll('canvas')){const r=c.getBoundingClientRect();
const a=r.width*r.height;if(r.width>=300&&r.height>=200&&a<area){area=a;best=r}}return best?{x:best.x,y:best.y,width:best.width,height:best.height}:null})()`;

// -------------------------------------------------------------------------- headless Chrome
function findChrome() {
  const names = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = names.find((n) => n && existsSync(n));
  if (!found) throw new Error('No Chrome found; set CHROME=/path/to/chrome');
  return found;
}

/** Opens one page in its own headless Chrome and hands back a small driver for it. */
async function openPage({ url, width, height, dpr, uncapped, port }) {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'tk-capture-'));
  const flags = [
    '--headless=new',
    // Without these two, headless Chrome renders in software at about 2 fps
    '--use-gl=angle',
    '--use-angle=gl-egl',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--force-device-scale-factor=1',
    'about:blank',
  ];
  if (uncapped) flags.unshift('--disable-frame-rate-limit', '--disable-gpu-vsync');
  const chrome = spawn(findChrome(), flags, { stdio: 'ignore' });

  let ws;
  let nextId = 0;
  const pending = new Map();
  const logs = [];
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const close = () => {
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
    chrome.kill('SIGKILL');
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 400);
  };

  try {
    let target;
    for (let i = 0; i < 75 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {
        /* Chrome is still starting */
      }
      if (!target) await sleep(200);
    }
    if (!target) throw new Error('Chrome did not open a debugging target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        logs.push('exception: ' + (d?.exception?.description || d?.text || '').slice(0, 300));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        logs.push('error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await send('Page.navigate', { url });
  } catch (err) {
    close();
    throw err;
  }

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const screenshotBuffer = async (clip) => {
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    });
    return Buffer.from(r.data, 'base64');
  };
  const screenshot = async (file, clip) => {
    const data = await screenshotBuffer(clip);
    writeFileSync(file, data);
    return data;
  };
  return { evaluate, screenshot, screenshotBuffer, close, logs };
}

/** Waits until the scene says it is ready, then for its settle time. */
async function waitReady(page, def) {
  if (def.ready) {
    const deadline = Date.now() + 30000;
    for (;;) {
      if (await page.evaluate(def.ready).catch(() => false)) break;
      if (Date.now() > deadline) throw new Error('scene never became ready');
      await sleep(200);
    }
  }
  await sleep(def.settle);
}

/** Share of pixels (in percent) that differ visibly between two screenshots of the same size. */
async function movedPercent(first, second) {
  const { default: sharp } = await import('sharp');
  const [a, b] = await Promise.all(
    [first, second].map((png) => sharp(png).removeAlpha().resize(800, null).raw().toBuffer({ resolveWithObject: true }))
  );
  if (a.data.length !== b.data.length) return null;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 3) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 24) changed += 1;
  }
  return +((changed / (a.data.length / 3)) * 100).toFixed(2);
}

const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms))]);

// ------------------------------------------------------------------------------------- runs
let portCounter = 9500 + Math.floor(Math.random() * 300);

async function captureScene(key, look, opts, outDir) {
  const def = SCENES[key];
  const extra = opts.query.length ? '&' + opts.query.join('&') : '';
  const url = `${opts.base}${def.url}&look=${look}${extra}`;
  const page = await openPage({ url, width: 1600, height: 900, dpr: def.dpr ?? 1, uncapped: false, port: ++portCounter });
  const results = [];
  try {
    await waitReady(page, def);
    for (const shot of def.shots) {
      if (shot.eval) await page.evaluate(shot.eval);
      if (shot.wait) await sleep(shot.wait);
      await page.evaluate('window.__glReset(); 1');
      await sleep(450);
      const stats = await page.evaluate('window.__glStats()');
      const clip = def.clip === 'canvas' ? await page.evaluate(CLIP_CANVAS) : null;
      const file = `${key}_${look}_${shot.name}.png`;
      const first = await page.screenshot(path.join(outDir, file), clip);
      let moved = null;
      if (opts.motion) {
        await sleep(400);
        moved = await movedPercent(first, await page.screenshotBuffer(clip));
      }
      results.push({ preset: `${key}_${look}_${shot.name}`, file, drawCalls: stats.drawCalls, triangles: stats.triangles, moved });
      console.log(
        `  ${file}  ${stats.drawCalls} draw calls, ${stats.triangles} triangles` + (moved === null ? '' : `, ${moved}% of the picture moved in 0.4 s`)
      );
    }
  } finally {
    if (page.logs.length) console.log('  page reported:', [...new Set(page.logs)].slice(0, 4).join(' | '));
    page.close();
  }
  return results;
}

/** Frame interval and GPU time with the frame limiter off, at pixel ratio 1, on the scene's first preset. */
async function timeScene(key, look, opts) {
  const def = SCENES[key];
  const extra = opts.query.length ? '&' + opts.query.join('&') : '';
  const url = `${opts.base}${def.url}&look=${look}${extra}`;
  const page = await openPage({ url, width: 1600, height: 900, dpr: 1, uncapped: true, port: ++portCounter });
  try {
    await waitReady(page, def);
    await sleep(600);
    await page.evaluate('window.__glSync = true; window.__glTime = true; window.__glReset(); 1');
    await sleep(2600);
    const stats = await page.evaluate('window.__glStats()');
    console.log(
      `  ${key}_${look}: frame ${stats.frameMs} ms (p90 ${stats.frameMsP90}), GPU ${stats.gpuMs ?? 'n/a'} ms, ` +
        `${stats.drawCalls} draw calls, ${stats.triangles} triangles`
    );
    return { preset: `${key}_${look}`, ...stats };
  } finally {
    page.close();
  }
}

async function runCapture(opts) {
  const outDir = path.join(OUT_ROOT, opts.label);
  mkdirSync(outDir, { recursive: true });
  const metricsFile = path.join(outDir, 'metrics.json');
  const metrics = existsSync(metricsFile) ? JSON.parse(readFileSync(metricsFile, 'utf8')) : { shots: {}, timing: {} };
  const failures = [];
  for (const key of opts.only) {
    for (const look of opts.looks) {
      console.log(`${key} (${look})`);
      try {
        const def = SCENES[key];
        const budget = def.settle + def.shots.reduce((n, s) => n + (s.wait ?? 0) + 1500, 0) + 60000;
        for (const r of await withTimeout(captureScene(key, look, opts, outDir), budget, `${key} ${look}`)) {
          metrics.shots[r.preset] = { file: r.file, drawCalls: r.drawCalls, triangles: r.triangles, ...(r.moved === null ? {} : { movedPercent: r.moved }) };
        }
        if (opts.timing) {
          const t = await withTimeout(timeScene(key, look, opts), def.settle + 65000, `${key} ${look} timing`);
          metrics.timing[t.preset] = t;
        }
      } catch (err) {
        failures.push(`${key} ${look}: ${err.message}`);
        console.log(`  FAILED: ${err.message}`);
      }
    }
  }
  metrics.capturedAt = new Date().toISOString();
  writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  console.log(`\nSaved to ${path.relative(ROOT, outDir)}/ (metrics.json)`);
  if (failures.length) {
    console.log(`${failures.length} run(s) failed:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------------------------ sheets
/** Stitches each preset's before and after shot side by side, with the cost of each underneath. */
async function runSheet(before, after) {
  const { default: sharp } = await import('sharp');
  const dirA = path.join(OUT_ROOT, before);
  const dirB = path.join(OUT_ROOT, after);
  const outDir = path.join(dirB, `sheets-vs-${before}`);
  mkdirSync(outDir, { recursive: true });
  const load = (dir) => (existsSync(path.join(dir, 'metrics.json')) ? JSON.parse(readFileSync(path.join(dir, 'metrics.json'), 'utf8')) : { shots: {}, timing: {} });
  const mA = load(dirA);
  const mB = load(dirB);
  const files = readdirSync(dirB).filter((f) => f.endsWith('.png') && existsSync(path.join(dirA, f)));
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cost = (m, preset) => {
    const s = m.shots[preset];
    const t = m.timing[preset.split('_').slice(0, 2).join('_')];
    const parts = [];
    if (s) parts.push(`${s.drawCalls} draw calls`, `${Math.round(s.triangles / 1000)}k triangles`);
    if (t) parts.push(`frame ${t.frameMs} ms`, t.gpuMs != null ? `GPU ${t.gpuMs} ms` : 'GPU n/a');
    return parts.join(' · ');
  };
  for (const f of files) {
    const preset = f.replace(/\.png$/, '');
    const a = sharp(path.join(dirA, f));
    const meta = await a.metadata();
    const w = 1200;
    const h = Math.round((meta.height / meta.width) * w);
    const bar = 46;
    const gap = 8;
    const label = (text, sub) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${bar}"><rect width="100%" height="100%" fill="#14110d"/>` +
          `<text x="14" y="20" font-family="sans-serif" font-size="16" font-weight="700" fill="#e9d9b4">${esc(text)}</text>` +
          `<text x="14" y="38" font-family="sans-serif" font-size="13" fill="#b3a488">${esc(sub)}</text></svg>`
      );
    await sharp({ create: { width: w * 2 + gap, height: h + bar, channels: 3, background: '#000000' } })
      .composite([
        { input: await a.resize(w, h).toBuffer(), left: 0, top: bar },
        { input: await sharp(path.join(dirB, f)).resize(w, h).toBuffer(), left: w + gap, top: bar },
        { input: label(`${before} · ${preset}`, cost(mA, preset)), left: 0, top: 0 },
        { input: label(`${after} · ${preset}`, cost(mB, preset)), left: w + gap, top: 0 },
      ])
      .png()
      .toFile(path.join(outDir, f));
  }
  console.log(`${files.length} sheet(s) written to ${path.relative(ROOT, outDir)}/`);
}

// -------------------------------------------------------------------------------------- main
function parseArgs(argv) {
  const opts = { label: 'run', only: Object.keys(SCENES), looks: ['myth', 'classic'], timing: false, motion: false, base: 'http://localhost:5173', query: [], sheet: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--label') opts.label = argv[++i];
    else if (a === '--only') opts.only = argv[++i].split(',').filter(Boolean);
    else if (a === '--looks') opts.looks = argv[++i].split(',').filter(Boolean);
    else if (a === '--timing') opts.timing = true;
    else if (a === '--motion') opts.motion = true;
    else if (a === '--base') opts.base = argv[++i].replace(/\/$/, '');
    else if (a === '--query') opts.query.push(argv[++i]);
    else if (a === '--sheet') opts.sheet = [argv[++i], argv[++i]];
    else throw new Error(`Unknown option ${a}`);
  }
  const unknown = opts.only.filter((k) => !SCENES[k]);
  if (unknown.length) throw new Error(`Unknown scene(s): ${unknown.join(', ')}. Known: ${Object.keys(SCENES).join(', ')}`);
  if (!/^[\w.-]+$/.test(opts.label)) throw new Error('--label may only contain letters, digits, dot, dash and underscore');
  return opts;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.sheet) await runSheet(opts.sheet[0], opts.sheet[1]);
  else {
    if (typeof WebSocket === 'undefined') throw new Error('Run with: node --experimental-websocket scripts/capture-scenes.mjs (Node 20), or use npm run capture');
    await runCapture(opts);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
// Chrome children are killed as each page closes; make sure a stray timer cannot hold the process open
setTimeout(() => process.exit(process.exitCode ?? 0), 800);
