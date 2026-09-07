#!/usr/bin/env node
// =============================================================================
// 봇 클라이언트
//
// ★ 왜 필요한가
//   브라우저 창을 10개 띄우는 것은 현실적으로 불가능하다.
//   guide 70절이 요구하는 테스트 중 "10명 동시 접속", "동시 정답 제출",
//   "연결 종료·재접속" 은 봇 없이는 검증할 수 없다.
//   ★ Phase 3의 동시 정답 100회 반복 테스트가 이것 위에 세워진다.
//
// 시나리오
//   join       N명이 회원가입·로그인 후 방에 들어간다 (정원 초과 확인)
//   duplicate  같은 계정으로 두 번 접속해 기존 연결이 끊기는지 확인 (Q-06)
//   reconnect  끊고 다시 붙어 점수·색상이 유지되는지 확인
//   host       방장을 끊어 30초 뒤 이전되는지 확인 (Q-29)
//   chat       동시 채팅 부하
//
// 사용법
//   node scripts/bot.mjs join --count 11
//   node scripts/bot.mjs duplicate
//   node scripts/bot.mjs reconnect
//   node scripts/bot.mjs host --grace 35
//   node scripts/bot.mjs chat --count 10 --messages 20
//
//   --url http://localhost:3000   대상 서버 (기본값)
//   --prefix bot                   계정 아이디 접두어
//   --no-boot                      서버가 안 떠 있어도 직접 띄우지 않는다
//
// ★ 서버 자동 기동 (R006에서 추가)
//   대상 서버가 응답하지 않으면 봇이 직접 띄운다.
//   ★ 사람이 쓰는 것과 완전히 같은 경로로 띄운다 — server/dist/index.js.
//     npm run dev / npm start / smoke / bot 이 전부 이 파일을 실행한다.
//   R005에서 봇 테스트는 통과했는데 npm run dev 는 실행되지 않는 사고가 있었다.
//   테스트가 실제 실행 경로와 다른 경로를 쓰면 그 사고가 반복된다.
// =============================================================================

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const scenario = args[0] ?? 'join';
function opt(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
const BASE = opt('--url', 'http://localhost:3000');
const COUNT = Number(opt('--count', '3'));
const PREFIX = opt('--prefix', 'bot');
const MESSAGES = Number(opt('--messages', '5'));
const GRACE = Number(opt('--grace', '35'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// 서버 자동 기동
// ★ 사람이 쓰는 것과 같은 경로(server/dist/index.js)로 띄운다.
// -----------------------------------------------------------------------------
const NO_BOOT = args.includes('--no-boot');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
let bootedServer = null;

async function serverAlive() {
  try {
    const r = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverAlive()) {
    console.log('[bot] 이미 떠 있는 서버를 사용합니다:', BASE);
    return;
  }
  if (NO_BOOT) {
    throw new Error(`서버가 응답하지 않습니다: ${BASE} (--no-boot 이므로 띄우지 않습니다)`);
  }
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(
      `서버 산출물이 없습니다: ${SERVER_ENTRY}\n먼저 npm run build 를 실행하세요.`,
    );
  }
  if (!BASE.includes('localhost')) {
    throw new Error(`원격 서버는 직접 띄울 수 없습니다: ${BASE}`);
  }

  console.log('[bot] 서버가 없으므로 직접 띄웁니다 (server/dist/index.js)');
  bootedServer = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  bootedServer.stdout.on('data', (c) => {
    out += c.toString();
  });
  bootedServer.stderr.on('data', (c) => {
    out += c.toString();
  });

  for (let i = 0; i < 40; i += 1) {
    if (bootedServer.exitCode !== null) {
      throw new Error('서버가 기동 중 종료되었습니다.\n' + out.slice(-800));
    }
    if (await serverAlive()) {
      console.log('[bot] 서버 기동 확인');
      return;
    }
    await sleep(250);
  }
  throw new Error('서버가 10초 안에 응답하지 않았습니다.\n' + out.slice(-800));
}

function stopBootedServer() {
  if (!bootedServer) return;
  console.log('[bot] 직접 띄운 서버를 종료합니다');
  bootedServer.kill('SIGTERM');
  bootedServer = null;
}

const stamp = () => new Date().toISOString().slice(11, 23);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

/**
 * 계정 하나를 만들고(또는 로그인하고) 쿠키를 들고 있는 봇.
 * ★ 쿠키를 직접 관리한다. Node 의 fetch 는 쿠키 저장소가 없다.
 */
class Bot {
  constructor(name) {
    this.name = name;
    this.loginId = `${PREFIX}_${name}`.toLowerCase();
    this.password = 'bot1234';
    this.nickname = `${PREFIX}-${name}`;
    this.cookie = null;
    this.socket = null;
    this.snapshot = null;
    this.events = [];
  }

  async #post(pathname, body) {
    const res = await fetch(`${BASE}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const raw of setCookie) {
      const pair = raw.split(';')[0];
      if (pair.startsWith('qw_session=')) this.cookie = pair;
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  async auth() {
    const signup = await this.#post('/api/auth/signup', {
      loginId: this.loginId,
      password: this.password,
      nickname: this.nickname,
    });
    if (signup.status === 200) return;
    // 이미 있으면 로그인
    const login = await this.#post('/api/auth/login', {
      loginId: this.loginId,
      password: this.password,
    });
    if (login.status !== 200) {
      throw new Error(`${this.name} 인증 실패: ${login.status} ${JSON.stringify(login.json)}`);
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(BASE, {
        transports: ['websocket'],
        extraHeaders: { cookie: this.cookie ?? '' },
        reconnection: false,
      });
      const s = this.socket;
      s.on('room.state', (snap) => {
        this.snapshot = snap;
        this.events.push({ type: 'room.state', reason: snap.reason });
      });
      s.on('room.created', (p) => this.events.push({ type: 'room.created', roomId: p.roomId }));
      // 참가자 목록 부분 갱신을 반영한다. 그러지 않으면 스냅샷이 입장 시점에 멈춘다.
      const patch = (p) => {
        if (!this.snapshot || !p?.players) return;
        this.snapshot.players = p.players;
        if (typeof p.activeCount === 'number') this.snapshot.room.activeCount = p.activeCount;
      };
      s.on('room.playerJoined', patch);
      s.on('room.playerLeft', patch);
      s.on('room.playersUpdated', patch);
      // ★ 끊김은 connectionChanged 로 온다. 활성 인원은 끊김 즉시 반영된다 (Q-29).
      s.on('room.connectionChanged', (p) => {
        this.events.push({ type: 'room.connectionChanged', accountId: p.accountId, connected: p.connected });
        if (!this.snapshot) return;
        if (typeof p.activeCount === 'number') this.snapshot.room.activeCount = p.activeCount;
      });
      s.on('error', (p) => this.events.push({ type: 'error', code: p.code }));
      s.on('session.terminated', (p) =>
        this.events.push({ type: 'session.terminated', reason: p.reason }),
      );
      s.on('room.hostChanged', (p) =>
        this.events.push({ type: 'room.hostChanged', hostAccountId: p.hostAccountId }),
      );
      s.on('chat.message', (m) => this.events.push({ type: 'chat', text: m.text }));
      s.on('connect', () => resolve());
      s.on('connect_error', (e) => reject(new Error(`${this.name} 연결 실패: ${e.message}`)));
      setTimeout(() => reject(new Error(`${this.name} 연결 타임아웃`)), 15000);
    });
  }

  createRoom(title) {
    this.socket.emit('room.create', { title });
  }

  join(roomId) {
    this.socket.emit('room.join', { roomId });
  }

  chat(text) {
    this.socket.emit('chat.send', { text });
  }

  disconnect() {
    this.socket?.close();
  }

  lastError() {
    return [...this.events].reverse().find((e) => e.type === 'error') ?? null;
  }
}

async function makeBots(n) {
  const bots = [];
  for (let i = 1; i <= n; i += 1) {
    const bot = new Bot(String(i).padStart(2, '0'));
    await bot.auth();
    bots.push(bot);
  }
  return bots;
}

// -----------------------------------------------------------------------------
async function scenarioJoin() {
  log(`시나리오 join — ${COUNT}명`);
  const bots = await makeBots(COUNT);

  const host = bots[0];
  await host.connect();
  host.createRoom('봇 테스트 방');
  await sleep(700);

  const roomId = host.snapshot?.room.id;
  if (!roomId) throw new Error('방 생성 실패: ' + JSON.stringify(host.events));
  log(`방 생성: ${roomId}`);

  let joined = 1;
  let rejected = 0;
  for (const bot of bots.slice(1)) {
    await bot.connect();
    bot.join(roomId);
    await sleep(400);
    if (bot.snapshot) joined += 1;
    else {
      rejected += 1;
      log(`  ${bot.nickname} 거부: ${bot.lastError()?.code ?? '(사유 없음)'}`);
    }
  }

  await sleep(500);
  log(`결과: 입장 ${joined}명 / 거부 ${rejected}명`);
  log(`방 참가자 수(방장 스냅샷 기준): ${host.snapshot?.players.length}`);
  const expected = Math.min(COUNT, 10);
  const ok = joined === expected && rejected === Math.max(0, COUNT - 10);
  log(ok ? '★ 통과 — 정원 10명 제한이 지켜졌다' : '★ 실패 — 기대와 다르다');

  bots.forEach((b) => b.disconnect());
  return ok;
}

// -----------------------------------------------------------------------------
async function scenarioDuplicate() {
  log('시나리오 duplicate — 같은 계정 두 번 접속 (Q-06)');
  const [bot] = await makeBots(1);

  await bot.connect();
  bot.createRoom('중복 접속 테스트');
  await sleep(700);
  const roomId = bot.snapshot?.room.id;
  log(`첫 연결 OK, 방 ${roomId}`);

  // 같은 쿠키로 두 번째 연결
  const second = new Bot(bot.name);
  second.cookie = bot.cookie;
  let firstDisconnected = false;
  bot.socket.on('disconnect', () => {
    firstDisconnected = true;
  });

  await second.connect();
  await sleep(1200);

  const terminated = bot.events.some((e) => e.type === 'session.terminated');
  log(`첫 연결이 session.terminated 를 받았는가: ${terminated}`);
  log(`첫 연결이 실제로 끊겼는가: ${firstDisconnected}`);
  log(`두 번째 연결이 방을 승계했는가: ${second.snapshot?.room.id === roomId}`);

  const ok = terminated && firstDisconnected && second.snapshot?.room.id === roomId;
  log(ok ? '★ 통과 — 기존 연결을 끊고 승계했다' : '★ 실패');

  bot.disconnect();
  second.disconnect();
  return ok;
}

// -----------------------------------------------------------------------------
async function scenarioReconnect() {
  log('시나리오 reconnect — 끊고 다시 붙기');
  const bots = await makeBots(2);
  const [host, guest] = bots;

  await host.connect();
  host.createRoom('재접속 테스트');
  await sleep(700);
  const roomId = host.snapshot.room.id;

  await guest.connect();
  guest.join(roomId);
  await sleep(600);
  const colorBefore = guest.snapshot?.me.colorIndex;
  log(`게스트 입장. colorIndex=${colorBefore}`);

  guest.disconnect();
  await sleep(1200);
  const activeAfterDrop = host.snapshot?.room.activeCount;
  log(`끊긴 직후 방장이 본 활성 인원: ${activeAfterDrop} (1 이어야 한다 — Q-29 즉시 반영)`);

  // ★ 표시 유예 5초를 실제로 단정한다 (Q-15 보완)
  const guestId = guest.snapshot?.me.accountId;
  const shownAt = () => host.snapshot?.players.find((p) => p.accountId === guestId)?.connected;
  await sleep(1500);
  const early = shownAt();
  log(`  끊긴 뒤 약 2.7초 — 표시상 connected=${early} (true 여야 한다)`);
  await sleep(4500);
  const late = shownAt();
  log(`  끊긴 뒤 약 7.2초 — 표시상 connected=${late} (false 여야 한다)`);
  const graceOk = early === true && late === false;
  log(graceOk ? '  ★ 표시 유예 5초 통과' : '  ★ 표시 유예 실패');

  const guest2 = new Bot(guest.name);
  guest2.cookie = guest.cookie;
  await guest2.connect();
  await sleep(900);

  const colorAfter = guest2.snapshot?.me.colorIndex;
  log(`재접속. colorIndex=${colorAfter} (같아야 한다)`);
  log(`자동으로 같은 방에 복귀했는가: ${guest2.snapshot?.room.id === roomId}`);

  const ok = colorAfter === colorBefore && guest2.snapshot?.room.id === roomId && graceOk && activeAfterDrop === 1;
  log(ok ? '★ 통과 — 색상 유지 + 같은 방 복귀' : '★ 실패');

  host.disconnect();
  guest2.disconnect();
  return ok;
}

// -----------------------------------------------------------------------------
async function scenarioHost() {
  log(`시나리오 host — 방장 이전 (유예 30초, ${GRACE}초 대기)`);
  const bots = await makeBots(3);
  const [host, a, b] = bots;

  await host.connect();
  host.createRoom('방장 이전 테스트');
  await sleep(700);
  const roomId = host.snapshot.room.id;
  const hostAccountId = host.snapshot.me.accountId;

  await a.connect();
  a.join(roomId);
  await sleep(400);
  await b.connect();
  b.join(roomId);
  await sleep(400);
  log(`3명 입장. 방장=${host.nickname}`);

  host.disconnect();
  log('방장 접속 종료. 유예 동안은 이전되지 않아야 한다.');

  await sleep(10000);
  const changedEarly = a.events.some((e) => e.type === 'room.hostChanged');
  log(`10초 경과 — 이전되었는가: ${changedEarly} (false 여야 한다)`);

  await sleep((GRACE - 10) * 1000);
  const changed = a.events.filter((e) => e.type === 'room.hostChanged');
  log(`${GRACE}초 경과 — room.hostChanged 수신 ${changed.length}건`);
  if (changed.length > 0) {
    const newHost = changed[changed.length - 1].hostAccountId;
    log(`새 방장 accountId=${newHost}`);
    log(`입장 순서가 가장 빠른 활성 플레이어(${a.nickname})인가: ${newHost === a.snapshot?.me.accountId}`);
  }

  // ★ 원래 방장이 돌아와도 돌려받지 않는다 (Q-15)
  const hostAgain = new Bot(host.name);
  hostAgain.cookie = host.cookie;
  await hostAgain.connect();
  await sleep(900);
  const isHostAgain = hostAgain.snapshot?.me.isHost;
  log(`원래 방장이 복귀했을 때 다시 방장인가: ${isHostAgain} (false 여야 한다)`);

  const ok = !changedEarly && changed.length === 1 && isHostAgain === false;
  log(ok ? '★ 통과' : '★ 실패');

  void hostAccountId;
  [a, b, hostAgain].forEach((x) => x.disconnect());
  return ok;
}

// -----------------------------------------------------------------------------
async function scenarioChat() {
  log(`시나리오 chat — ${COUNT}명 × ${MESSAGES}개 동시 전송`);
  const bots = await makeBots(COUNT);
  const [host] = bots;

  await host.connect();
  host.createRoom('채팅 부하 테스트');
  await sleep(700);
  const roomId = host.snapshot.room.id;

  for (const bot of bots.slice(1)) {
    await bot.connect();
    bot.join(roomId);
  }
  await sleep(1000);
  log(`${bots.filter((b) => b.snapshot).length}명 입장`);

  const started = Date.now();
  const before = host.events.filter((e) => e.type === 'chat').length;
  // ★ 동시에 쏟아붓는다. Phase 3의 동시 정답 테스트가 이 패턴을 재사용한다.
  await Promise.all(
    bots
      .filter((b) => b.snapshot)
      .map(async (bot, index) => {
        for (let i = 0; i < MESSAGES; i += 1) {
          bot.chat(`${bot.nickname} 메시지 ${i + 1}`);
          await sleep(30 + index * 3);
        }
      }),
  );
  await sleep(1500);

  const received = host.events.filter((e) => e.type === 'chat').length - before;
  const senders = bots.filter((b) => b.snapshot).length;
  const expected = senders * MESSAGES;
  log(`전송 ${expected}건 / 방장이 수신 ${received}건 / ${Date.now() - started}ms`);
  log(received >= expected ? '★ 통과 — 누락 없음' : `★ 누락 ${expected - received}건`);

  bots.forEach((b) => b.disconnect());
  return received >= expected;
}

// -----------------------------------------------------------------------------
const SCENARIOS = {
  join: scenarioJoin,
  duplicate: scenarioDuplicate,
  reconnect: scenarioReconnect,
  host: scenarioHost,
  chat: scenarioChat,
};

const run = SCENARIOS[scenario];
if (!run) {
  console.error(`알 수 없는 시나리오: ${scenario}`);
  console.error(`가능한 값: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

try {
  await ensureServer();
  const ok = await run();
  await sleep(300);
  stopBootedServer();
  await sleep(200);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error('[bot] 오류:', err.message);
  stopBootedServer();
  process.exit(1);
}
