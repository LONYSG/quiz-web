// =============================================================================
// ★ R108 — 동시접속 부하 재기
//
//   node scripts/load.mjs                         (기본: 300 → 1000 → 3000명 · 단계마다 5분)
//   node scripts/load.mjs --stages 40,80 --hold 30  (짧게 시험)
//
//   · 검사 서버를 따로 띄운다(포트 3410 · quizweb_test) — 실 3000 · 실 DB 는 건드리지 않는다
//     서버는 node --import scripts/load-probe.mjs 로 떠서 2초마다 RSS · heap · CPU · 이벤트 루프 지연 · 틱 밀림을 적는다
//   · 방 하나 = 8명 · 문제 10개 판을 되풀이(끝나면 4초 뒤 '다시 하기')
//     사람처럼: 문제마다 한 사람당 채팅 3~6개(1~12초 사이) · 그중 한 사람이 3~9초에 정답 · 이모티콘 가끔(10%)
//   · 봇은 작업 프로세스 여러 개로 나눈다(한 프로세스 = 방 25개 = 200명) — 봇 쪽 CPU · 이벤트 루프도 같이 적는다
//   · ★ 판정 지연 = 정답을 보낸 순간 → question.resolved 를 받기까지(R015 flood 와 같은 정의)
//     - 측정 방(지휘 프로세스 안 · 2명 · 1.5초에 정답 · 잡담 없음) — 봇 쪽 밀림이 섞이지 않는 값
//     - 부하 방(작업 프로세스들) — 표본이 많다 · 봇 쪽 밀림이 섞일 수 있다
//   · 사람이 느끼는 기준: 판정 지연 p99 100ms 또는 이벤트 루프 지연 p99 200ms
//   · ★ 이 PC 의 남은 메모리가 --min-free-gb(1.5) 아래로 내려가면 그 단계를 끊는다(다른 창이 죽으면 안 된다)
//   · 결과: tmp/r108/result.json · 단계 표는 화면에
//   · 계정 ld_0001… · 측정 방 ld_p01 · ld_p02 — 쿠키는 tmp/r108/cookies.json 에 두고 다시 쓴다(세션 30일)
// =============================================================================
import { fork, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { io } from 'socket.io-client';
import { TEST_DATABASE_URL } from './test-db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tmp', 'r108');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
function opt(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PER_ROOM = 8;
const WRONG = ['음', '뭐지', '아 알았다', '잠깐만', '이거 아닌가', 'ㅋㅋㅋ', '어렵다', '들어본 듯', '헐', '모르겠다'];

// -----------------------------------------------------------------------------
// 소켓 한 사람
// -----------------------------------------------------------------------------
class Player {
  constructor(base, loginId, cookie, stats) {
    this.base = base;
    this.loginId = loginId;
    this.cookie = cookie;
    this.stats = stats;
    this.socket = null;
    this.accountId = null;
    this.roomId = null;
    this.timers = new Set();
    this.closing = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const s = io(this.base, {
        transports: ['websocket'],
        extraHeaders: { cookie: this.cookie },
        reconnection: false,
        forceNew: true,
      });
      this.socket = s;
      const to = setTimeout(() => reject(new Error(`${this.loginId} 연결 타임아웃`)), 30000);
      s.on('connect', () => {
        clearTimeout(to);
        this.stats.connected += 1;
        resolve();
      });
      s.on('connect_error', (e) => {
        clearTimeout(to);
        reject(new Error(`${this.loginId} 연결 실패: ${e.message}`));
      });
      s.on('disconnect', (why) => {
        this.clearTimers();
        if (this.stats.connected > 0) this.stats.connected -= 1;
        if (!this.closing) {
          this.stats.disconnects += 1;
          this.stats.disconnectWhy[why] = (this.stats.disconnectWhy[why] ?? 0) + 1;
        }
      });
      s.on('error', (p) => {
        const code = p?.code ?? 'ERR';
        this.stats.errors[code] = (this.stats.errors[code] ?? 0) + 1;
      });
      s.on('room.state', (snap) => {
        if (snap?.room?.id) this.roomId = snap.room.id;
        if (snap?.self?.accountId) this.accountId = snap.self.accountId;
      });
    });
  }

  later(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  close() {
    this.closing = true;
    this.clearTimers();
    this.socket?.close();
  }
}

// -----------------------------------------------------------------------------
// 방 하나(8명 또는 측정 방 2명)
// -----------------------------------------------------------------------------
class Room {
  /**
   * @param {object} o
   * @param {boolean} o.probe 측정 방(1.5초에 정답 · 잡담 없음)
   */
  constructor({ base, accounts, answers, emojiId, stats, probe = false, seed = 0 }) {
    this.players = accounts.map(([id, cookie]) => new Player(base, id, cookie, stats));
    this.answers = answers;
    this.emojiId = emojiId;
    this.stats = stats;
    this.probe = probe;
    this.seed = seed;
    this.lastActivity = Date.now();
    this.lastResolvedAt = 0;
    this.stopped = false;
  }

  get host() {
    return this.players[0];
  }

  async start() {
    for (const p of this.players) await p.connect();
    for (const [i, p] of this.players.entries()) this.wire(p, i);
    const host = this.host;
    const created = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('방 만들기 타임아웃')), 20000);
      host.socket.once('room.created', (m) => {
        clearTimeout(to);
        resolve(m.roomId);
      });
    });
    host.socket.emit('room.create', { title: this.probe ? '부하 측정' : `부하 ${this.seed}` });
    const roomId = await created;
    for (const p of this.players.slice(1)) {
      const joined = new Promise((resolve) => {
        const to = setTimeout(resolve, 20000);
        p.socket.once('room.state', () => {
          clearTimeout(to);
          resolve();
        });
      });
      p.socket.emit('room.join', { roomId });
      await joined;
    }
    host.socket.emit('lobby.updateSettings', { questionCount: 10 });
    await sleep(500);
    host.socket.emit('game.start', {});
    this.lastActivity = Date.now();
  }

  wire(p, idx) {
    const s = p.socket;
    s.on('question.started', (q) => {
      this.lastActivity = Date.now();
      p.clearTimers();
      if (idx === 0) this.stats.questions += 1;
      const answerer = this.probe ? 0 : (q.index + this.seed) % this.players.length;
      if (idx === answerer) {
        const ans = this.answers[q.text];
        if (ans == null) {
          if (idx === 0 || this.probe) this.stats.noAnswer += 1;
        } else {
          p.later(this.probe ? 1500 : rand(3000, 9000), () => {
            p.sentAt = performance.now();
            p.sentEpoch = q.epoch;
            s.emit('chat.send', { text: ans, epoch: q.epoch });
            this.stats.chats += 1;
          });
        }
      }
      if (this.probe) return;
      const n = Math.floor(rand(3, 7)) - (idx === answerer ? 1 : 0);
      for (let i = 0; i < n; i += 1) {
        p.later(rand(1000, 12000), () => {
          s.emit('chat.send', { text: WRONG[Math.floor(Math.random() * WRONG.length)], epoch: q.epoch });
          this.stats.chats += 1;
        });
      }
      if (this.emojiId && Math.random() < 0.1) {
        p.later(rand(1000, 10000), () => {
          s.emit('emoji.send', { emojiId: this.emojiId });
          this.stats.emojis += 1;
        });
      }
    });
    s.on('question.resolved', (r) => {
      this.lastActivity = Date.now();
      this.lastResolvedAt = Date.now();
      p.clearTimers();
      if (p.sentEpoch === r.epoch && p.sentAt) {
        const ms = performance.now() - p.sentAt;
        (this.probe ? this.stats.probeRtt : this.stats.rtt).push(Math.round(ms * 10) / 10);
        p.sentAt = 0;
      }
      if (idx === 0) {
        if (r.reason === 'answered' || r.winnerAccountId) this.stats.resolvedAnswer += 1;
        else this.stats.resolvedOther += 1;
      }
    });
    s.on('game.result', () => {
      this.lastActivity = Date.now();
      if (idx !== 0) return;
      this.stats.games += 1;
      // ★ 마지막 문제 공개(8초) 뒤 결과까지 걸린 시간 — 판 끝 기록이 늦으면 늘어난다
      if (this.lastResolvedAt) this.stats.resultLag.push(Date.now() - this.lastResolvedAt);
      if (this.stopped) return;
      p.later(4000, () => s.emit('game.again', {}));
    });
  }

  /** 60초 넘게 아무 일도 없으면 멈춘 방 — 다시 시작을 시도한다 */
  watchdog() {
    if (this.stopped || Date.now() - this.lastActivity < 60000) return;
    this.stats.stalls += 1;
    this.lastActivity = Date.now();
    this.host.socket?.emit('game.again', {});
    this.host.socket?.emit('game.start', {});
  }

  stop() {
    this.stopped = true;
    for (const p of this.players) p.close();
  }
}

function newStats() {
  return {
    connected: 0,
    disconnects: 0,
    disconnectWhy: {},
    errors: {},
    questions: 0,
    resolvedAnswer: 0,
    resolvedOther: 0,
    noAnswer: 0,
    games: 0,
    chats: 0,
    emojis: 0,
    stalls: 0,
    rtt: [],
    probeRtt: [],
    resultLag: [],
  };
}

/** 내보낸 뒤 비우는 칸(누적이 아닌 것) */
function drain(stats) {
  const out = { ...stats, disconnectWhy: { ...stats.disconnectWhy }, errors: { ...stats.errors } };
  for (const k of ['disconnects', 'questions', 'resolvedAnswer', 'resolvedOther', 'noAnswer', 'games', 'chats', 'emojis', 'stalls']) stats[k] = 0;
  stats.disconnectWhy = {};
  stats.errors = {};
  stats.rtt = [];
  stats.probeRtt = [];
  stats.resultLag = [];
  return out;
}

// =============================================================================
// 작업 프로세스
// =============================================================================
async function runWorker() {
  const cfg = JSON.parse(process.argv[process.argv.indexOf('--worker') + 1]);
  const answers = JSON.parse(readFileSync(cfg.answersFile, 'utf8'));
  const stats = newStats();
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const rooms = [];
  let lastCpu = process.cpuUsage();
  let lastAt = performance.now();
  const report = setInterval(() => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    const wall = (now - lastAt) * 1000;
    lastCpu = process.cpuUsage();
    lastAt = now;
    for (const r of rooms) r.watchdog();
    process.send?.({
      type: 'stat',
      id: cfg.id,
      rooms: rooms.length,
      cpu: Math.round(((cpu.user + cpu.system) / wall) * 1000) / 10,
      rssMB: Math.round(process.memoryUsage().rss / 1048576),
      elP99: Math.round((h.percentile(99) / 1e6) * 10) / 10,
      ...drain(stats),
    });
    h.reset();
  }, 5000);
  process.on('message', (m) => {
    if (m?.type === 'stop') {
      clearInterval(report);
      for (const r of rooms) r.stop();
      setTimeout(() => process.exit(0), 500);
    }
  });
  process.on('disconnect', () => process.exit(0));
  for (let i = 0; i < cfg.rooms.length; i += 1) {
    const room = new Room({ base: cfg.base, accounts: cfg.rooms[i], answers, emojiId: cfg.emojiId, stats, seed: cfg.firstSeed + i });
    rooms.push(room);
    room.start().catch((e) => {
      stats.errors.START = (stats.errors.START ?? 0) + 1;
      process.send?.({ type: 'log', text: `방 시작 실패: ${e.message}` });
    });
    await sleep(cfg.staggerMs);
  }
}

// =============================================================================
// 지휘
// =============================================================================
async function runController() {
  const stages = opt('--stages', '300,1000,3000').split(',').map(Number);
  const holdSec = Number(opt('--hold', '300'));
  const port = Number(opt('--port', '3410'));
  const perWorker = Number(opt('--per-worker', '25'));
  const minFreeGb = Number(opt('--min-free-gb', '1.5'));
  const extend = !process.argv.includes('--no-extend');
  const base = `http://localhost:${port}`;
  mkdirSync(OUT, { recursive: true });
  const log = (t) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${t}`);
  const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();

  // ── 서버
  const probeFile = path.join(OUT, `probe-${Date.now()}.jsonl`);
  const serverLog = createWriteStream(path.join(OUT, 'server.log'), { flags: 'a' });
  const server = spawn(process.execPath, ['--import', pathToFileURL(path.join(ROOT, 'scripts', 'load-probe.mjs')).href, path.join(ROOT, 'server', 'dist', 'index.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: TEST_DATABASE_URL,
      QUIZ_TEST_SERVER: '1',
      // ★ R107 한도를 푼다 — 이 PC 한 곳에서 수천 명이 붙는다(루프백은 원래 IP 한도에서 빠지지만 확실히)
      SEC_SOCKET_PER_IP: '1000000',
      LOAD_PROBE_FILE: probeFile,
    },
  });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  const workers = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const w of workers) w.proc.kill();
    server.kill();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(130));
  for (let i = 0; ; i += 1) {
    if (server.exitCode !== null) throw new Error('검사 서버가 꺼졌다 — tmp/r108/server.log');
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {
      /* 아직 */
    }
    if (i > 80) throw new Error('검사 서버가 20초 안에 안 떴다');
    await sleep(250);
  }
  log(`검사 서버 ${base} (PID ${server.pid}) · 측정 ${path.relative(ROOT, probeFile)}`);

  // ── 정답표(문항 글 → 정답 하나)
  const answersFile = path.join(OUT, 'answers.json');
  const ans = {};
  for (const r of (await db.query(`SELECT q.question_text t, a.answer_text a FROM questions q JOIN question_answers a ON a.question_id = q.id ORDER BY a.is_primary DESC`)).rows) {
    if (!(r.t in ans)) ans[r.t] = r.a;
  }
  writeFileSync(answersFile, JSON.stringify(ans));
  log(`정답표 ${Object.keys(ans).length}문항`);
  const emojiId = (await (await fetch(`${base}/api/emoji`)).json().catch(() => ({})))?.defaults?.[0] ?? null;

  // ── 계정(쿠키 다시 쓰기)
  const maxPeople = Math.max(...stages, extend ? 5000 : 0);
  const cookieFile = path.join(OUT, 'cookies.json');
  const cookies = existsSync(cookieFile) ? JSON.parse(readFileSync(cookieFile, 'utf8')) : {};
  const need = ['ld_p01', 'ld_p02'];
  for (let i = 1; i <= Math.ceil(maxPeople / PER_ROOM) * PER_ROOM; i += 1) need.push(`ld_${String(i).padStart(4, '0')}`);
  async function authOne(id) {
    const post = async (p, body) => {
      const res = await fetch(`${base}/api/auth/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const c = (res.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('qw_session'));
      return { status: res.status, cookie: c };
    };
    for (let tries = 0; tries < 20; tries += 1) {
      let r = await post('signup', { loginId: id, password: 'load1234', nickname: id.replace('ld_', '부하') });
      if (r.status !== 200 && r.status !== 503) r = await post('login', { loginId: id, password: 'load1234' });
      if (r.status === 200 && r.cookie) return r.cookie;
      if (r.status !== 503) throw new Error(`${id} 인증 실패 ${r.status}`);
      await sleep(300);
    }
    throw new Error(`${id} 인증 실패(계속 503)`);
  }
  // 저장된 쿠키가 아직 살아 있나(표본 3개) — 아니면 전부 다시
  const sample = need.filter((id) => cookies[id]).slice(0, 3);
  for (const id of sample) {
    const r = await fetch(`${base}/api/auth/me`, { headers: { cookie: cookies[id] } });
    if (r.status !== 200) {
      log('저장된 쿠키가 안 먹는다 — 전부 다시 로그인');
      for (const k of Object.keys(cookies)) delete cookies[k];
      break;
    }
  }
  const missing = need.filter((id) => !cookies[id]);
  if (missing.length) {
    const t0 = Date.now();
    log(`계정 ${missing.length}개 만들기 · 로그인(argon2 줄 때문에 천천히)…`);
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < missing.length) {
        const id = missing[next++];
        cookies[id] = await authOne(id);
        if (next % 250 === 0) {
          log(`  ${next}/${missing.length}`);
          writeFileSync(cookieFile, JSON.stringify(cookies));
        }
      }
    }));
    writeFileSync(cookieFile, JSON.stringify(cookies));
    log(`계정 준비 ${Math.round((Date.now() - t0) / 1000)}초`);
  }
  const del = await db.query(`DELETE FROM question_experiences WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'ld\\_%')`);
  log(`부하 계정 경험 기록 지움 ${del.rowCount}줄`);

  // ── 측정 방(이 프로세스 안)
  const probeStats = newStats();
  const probeRoom = new Room({ base, accounts: [['ld_p01', cookies.ld_p01], ['ld_p02', cookies.ld_p02]], answers: ans, emojiId: null, stats: probeStats, probe: true });
  await probeRoom.start();
  const probeWatch = setInterval(() => probeRoom.watchdog(), 5000);

  // ── 모으기
  const gameCount = async () => Number((await db.query(`SELECT count(*) n FROM games WHERE ended_at IS NOT NULL`)).rows[0].n);
  const dbSize = async () => Number((await db.query(`SELECT pg_database_size(current_database()) b`)).rows[0].b);
  const startGames = await gameCount();
  const startSize = await dbSize();
  let window = null;
  const resetWindow = () => {
    window = { probe: [], workers: [], probeRtt: [], machine: [], db: [], cut: null };
  };
  resetWindow();
  let probeOffset = 0;
  const readProbe = () => {
    let text = '';
    try {
      text = readFileSync(probeFile, 'utf8');
    } catch {
      return [];
    }
    const lines = text.slice(probeOffset).split('\n').filter(Boolean);
    probeOffset = text.length;
    return lines.map((l) => JSON.parse(l));
  };
  const workerLatest = new Map();
  let lastCpus = os.cpus();
  const machineSample = () => {
    const now = os.cpus();
    let idle = 0;
    let total = 0;
    now.forEach((c, i) => {
      const a = c.times;
      const b = lastCpus[i].times;
      const t = a.user + a.nice + a.sys + a.idle + a.irq - (b.user + b.nice + b.sys + b.idle + b.irq);
      total += t;
      idle += a.idle - b.idle;
    });
    lastCpus = now;
    return { t: Date.now(), freeGB: Math.round((os.freemem() / 1073741824) * 100) / 100, cpu: total ? Math.round((1 - idle / total) * 1000) / 10 : 0 };
  };
  let lowMem = false;
  const sampler = setInterval(async () => {
    const m = machineSample();
    window.machine.push(m);
    if (m.freeGB < minFreeGb) lowMem = true;
    window.probe.push(...readProbe());
    window.probeRtt.push(...drain(probeStats).probeRtt);
    try {
      const r = await db.query(`SELECT count(*) n, coalesce(max(extract(epoch FROM now() - query_start)) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid()), 0) slow FROM pg_stat_activity WHERE datname = current_database()`);
      window.db.push({ conns: Number(r.rows[0].n), slowMs: Math.round(Number(r.rows[0].slow) * 1000) });
    } catch {
      /* 다음 번 */
    }
  }, 2000);

  // ── 작업 프로세스
  let accountCursor = 0; // ld_0001 부터
  let seed = 0;
  const peopleIds = need.slice(2);
  function spawnWorker(roomCount) {
    const roomsCfg = [];
    for (let i = 0; i < roomCount; i += 1) {
      const ids = peopleIds.slice(accountCursor, accountCursor + PER_ROOM);
      accountCursor += PER_ROOM;
      roomsCfg.push(ids.map((id) => [id, cookies[id]]));
    }
    const id = workers.length + 1;
    const cfg = { id, base, rooms: roomsCfg, answersFile, emojiId, firstSeed: seed, staggerMs: 250 };
    seed += roomCount;
    const proc = fork(fileURLToPath(import.meta.url), ['--worker', JSON.stringify(cfg)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const w = { id, proc, rooms: roomCount, firstAccount: accountCursor - roomCount * PER_ROOM };
    proc.on('message', (m) => {
      if (m.type === 'stat') {
        workerLatest.set(id, m);
        window.workers.push(m);
      } else if (m.type === 'log') log(`  [작업 ${id}] ${m.text}`);
    });
    workers.push(w);
    return w;
  }
  function stopWorker(w) {
    try {
      w.proc.send({ type: 'stop' });
    } catch {
      /* 이미 끝 */
    }
    setTimeout(() => w.proc.kill(), 3000);
    workerLatest.delete(w.id);
    workers.splice(workers.indexOf(w), 1);
    accountCursor = Math.min(accountCursor, w.firstAccount); // 계정 자리는 뒤에서부터 돌려받는다(끝 프로세스만 끈다)
  }
  const roomsNow = () => workers.reduce((a, w) => a + w.rooms, 0);
  async function setPeople(target) {
    const wantRooms = Math.ceil(target / PER_ROOM);
    while (roomsNow() > wantRooms) stopWorker(workers[workers.length - 1]);
    while (roomsNow() < wantRooms) spawnWorker(Math.min(perWorker, wantRooms - roomsNow()));
    // 다 붙을 때까지(최대 4분) — 메모리 바닥이면 거기서 멈춘다
    const until = Date.now() + 240000;
    while (Date.now() < until && !lowMem) {
      const connected = [...workerLatest.values()].reduce((a, m) => a + m.connected, 0);
      if (connected >= wantRooms * PER_ROOM && workerLatest.size === workers.length) break;
      await sleep(2000);
    }
    await sleep(15000); // 첫 판이 돌기 시작하게
  }

  function summarize(people, sec) {
    const w = window;
    const sum = (k) => w.workers.reduce((a, m) => a + (m[k] ?? 0), 0);
    const rtt = w.workers.flatMap((m) => m.rtt);
    const resultLag = w.workers.flatMap((m) => m.resultLag);
    const errors = {};
    const why = {};
    for (const m of w.workers) {
      for (const [k, v] of Object.entries(m.errors)) errors[k] = (errors[k] ?? 0) + v;
      for (const [k, v] of Object.entries(m.disconnectWhy)) why[k] = (why[k] ?? 0) + v;
    }
    const sp = w.probe;
    const maxOf = (arr, k) => (arr.length ? Math.max(...arr.map((x) => x[k])) : null);
    const avgOf = (arr, k) => (arr.length ? Math.round((arr.reduce((a, x) => a + x[k], 0) / arr.length) * 10) / 10 : null);
    const connected = [...workerLatest.values()].reduce((a, m) => a + m.connected, 0);
    const row = {
      people,
      rooms: roomsNow(),
      connected,
      holdSec: sec,
      serverRssMB: maxOf(sp, 'rssMB'),
      serverHeapMB: maxOf(sp, 'heapMB'),
      serverCpuAvg: avgOf(sp, 'cpu'),
      serverCpuMax: maxOf(sp, 'cpu'),
      elP50: pct(sp.map((x) => x.elP50), 50),
      elP99: pct(sp.map((x) => x.elP99), 99),
      elMax: maxOf(sp, 'elMax'),
      tickLateAvg: avgOf(sp, 'tickLateAvg'),
      tickLateMax: maxOf(sp, 'tickLateMax'),
      probeJudgeP50: pct(w.probeRtt, 50),
      probeJudgeP99: pct(w.probeRtt, 99),
      probeJudgeN: w.probeRtt.length,
      loadJudgeP50: pct(rtt, 50),
      loadJudgeP99: pct(rtt, 99),
      loadJudgeN: rtt.length,
      resultLagP50: pct(resultLag, 50),
      resultLagP99: pct(resultLag, 99),
      questions: sum('questions'),
      resolvedAnswer: sum('resolvedAnswer'),
      noAnswer: sum('noAnswer'),
      games: sum('games'),
      chatsPerSec: Math.round(sum('chats') / Math.max(1, sec)),
      emojis: sum('emojis'),
      stalls: sum('stalls'),
      disconnects: sum('disconnects'),
      disconnectWhy: why,
      errors,
      botCpuMax: maxOf(w.workers, 'cpu'),
      botElP99Max: maxOf(w.workers, 'elP99'),
      botRssMBSum: [...workerLatest.values()].reduce((a, m) => a + m.rssMB, 0),
      botProcs: workers.length,
      machineFreeGBMin: w.machine.length ? Math.min(...w.machine.map((x) => x.freeGB)) : null,
      machineCpuAvg: avgOf(w.machine, 'cpu'),
      dbConnsMax: maxOf(w.db, 'conns'),
      dbSlowestActiveMs: maxOf(w.db, 'slowMs'),
      cut: w.cut,
    };
    // ★ 판정 p99 는 표본이 많은 부하 방 값으로 본다(측정 방은 5분에 ~30개 — p99 = 최댓값 하나)
    row.judgeP99 = row.loadJudgeN >= 100 ? row.loadJudgeP99 : row.probeJudgeP99;
    row.felt = (row.judgeP99 ?? 0) > 100 || (row.elP99 ?? 0) > 200;
    return row;
  }

  const results = [];
  const runStage = async (people) => {
    log(`── 단계 ${people}명(${Math.ceil(people / PER_ROOM)}방) — 붙이는 중`);
    await setPeople(people);
    resetWindow();
    readProbe();
    const t0 = Date.now();
    while (Date.now() - t0 < holdSec * 1000) {
      if (lowMem) {
        window.cut = `남은 메모리 ${minFreeGb}GB 아래 — ${Math.round((Date.now() - t0) / 1000)}초에서 끊음`;
        break;
      }
      if (server.exitCode !== null) {
        window.cut = '검사 서버가 꺼짐';
        break;
      }
      await sleep(2000);
    }
    await sleep(2500);
    const row = summarize(people, Math.round((Date.now() - t0) / 1000));
    results.push(row);
    log(`   서버 RSS ${row.serverRssMB}MB · CPU 평균 ${row.serverCpuAvg}% · 루프 p99 ${row.elP99}ms · 틱 밀림 최대 ${row.tickLateMax}ms · 판정 p99 측정방 ${row.probeJudgeP99}ms / 부하방 ${row.loadJudgeP99}ms · 끊김 ${row.disconnects} · 남은 메모리 최저 ${row.machineFreeGBMin}GB${row.cut ? ` · ★ ${row.cut}` : ''}`);
    writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    return row;
  };

  let lastOk = 0;
  let firstBad = null;
  for (const people of stages) {
    const row = await runStage(people);
    if (row.cut) break;
    if (row.felt) {
      firstBad = people;
      break;
    }
    lastOk = people;
  }
  const lastRow = results[results.length - 1];
  // ★ 올라가기만 한다 — 단계를 내리면 끈 봇의 계정이 서버에 남은 옛 방과 부딪힌다(첫 실행에서 확인).
  //   넘은 지점의 가운데는 따로 --stages 로 새로 띄워 잰다.
  if (extend && !lastRow.cut && firstBad == null && lastOk === stages[stages.length - 1] && lastOk < 5000) {
    await runStage(5000);
  }
  if (firstBad != null) log(`기준을 넘은 첫 단계 ${firstBad}명 · 앞 단계 ${lastOk}명 — 가운데는 새로 띄워: --stages ${Math.round((lastOk + firstBad) / 2 / PER_ROOM) * PER_ROOM}`);

  // ── 판 하나가 DB 에 남기는 크기
  const games = (await gameCount()) - startGames;
  const grow = (await dbSize()) - startSize;
  const tail = { games, dbGrowBytes: grow, bytesPerGame: games ? Math.round(grow / games) : null };
  log(`끝난 판 ${games} · DB 늘어난 크기 ${Math.round(grow / 1024)}KB · 판 하나 ≈ ${tail.bytesPerGame ? Math.round(tail.bytesPerGame / 1024) : '-'}KB`);
  writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ at: new Date().toISOString(), results, tail }, null, 2));

  clearInterval(sampler);
  clearInterval(probeWatch);
  probeRoom.stop();
  for (const w of [...workers]) stopWorker(w);
  await sleep(3500);
  await db.end();
  cleanup();
  console.table(results.map((r) => ({ 명: r.people, 붙음: r.connected, 'RSS MB': r.serverRssMB, 'CPU%': r.serverCpuAvg, '루프p99': r.elP99, '판정p99(측정)': r.probeJudgeP99, '판정p99(부하)': r.loadJudgeP99, 끊김: r.disconnects, '남은GB': r.machineFreeGBMin, 판정: r.cut ? '끊음' : r.felt ? '느낌' : '여유' })));
  process.exit(0);
}

if (process.argv.includes('--worker')) runWorker();
else runController().catch((e) => {
  console.error('[load] 오류:', e);
  process.exit(1);
});
