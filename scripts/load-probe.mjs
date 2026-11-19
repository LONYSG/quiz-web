// =============================================================================
// ★ R108 — 부하 재기용 서버 측정기(서버 코드를 고치지 않는다)
//   node --import ./scripts/load-probe.mjs server/dist/index.js  (scripts/load.mjs 가 이렇게 띄운다)
//   LOAD_PROBE_FILE 에 2초마다 한 줄(JSON): rss · heap · CPU%(코어 하나 = 100) · 이벤트 루프 지연 p50/p99/max · 틱 밀림
//   ★ 틱 밀림 = 100ms 간격 setInterval(서버 전역 틱 — server/src/tick.ts)이 예정보다 늦게 돈 만큼(최대 · 평균)
// =============================================================================
import { appendFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const FILE = process.env.LOAD_PROBE_FILE;
const EVERY_MS = 2000;

if (FILE) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();

  // ── 틱 밀림: 100ms setInterval 만 감싼다(다른 타이머는 그대로)
  const tick = { n: 0, sum: 0, max: 0 };
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = function patched(fn, ms, ...args) {
    if (ms !== 100 || typeof fn !== 'function') return realSetInterval(fn, ms, ...args);
    let last = performance.now();
    return realSetInterval(function wrapped(...a) {
      const now = performance.now();
      const late = Math.max(0, now - last - ms);
      last = now;
      tick.n += 1;
      tick.sum += late;
      if (late > tick.max) tick.max = late;
      return fn.apply(this, a);
    }, ms, ...args);
  };

  let lastCpu = process.cpuUsage();
  let lastAt = performance.now();
  const timer = realSetInterval(() => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    const wall = (now - lastAt) * 1000; // µs
    lastCpu = process.cpuUsage();
    lastAt = now;
    const m = process.memoryUsage();
    const ms = (ns) => Math.round((ns / 1e6) * 10) / 10;
    const line = {
      t: Date.now(),
      rssMB: Math.round(m.rss / 1048576),
      heapMB: Math.round(m.heapUsed / 1048576),
      cpu: Math.round(((cpu.user + cpu.system) / wall) * 1000) / 10,
      elP50: ms(h.percentile(50)),
      elP99: ms(h.percentile(99)),
      elMax: ms(h.max),
      tickN: tick.n,
      tickLateAvg: tick.n ? Math.round((tick.sum / tick.n) * 10) / 10 : 0,
      tickLateMax: Math.round(tick.max * 10) / 10,
    };
    h.reset();
    tick.n = 0;
    tick.sum = 0;
    tick.max = 0;
    try {
      appendFileSync(FILE, JSON.stringify(line) + '\n');
    } catch {
      /* 측정 파일 못 씀 — 서버는 그대로 */
    }
  }, EVERY_MS);
  timer.unref();
}
