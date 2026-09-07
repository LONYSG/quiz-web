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
//   lobby      ★ Phase 2 — 설정 검증 / 권한 / 경험률 / 출제 가능 수 (Q-10·11·12·21)
//   countdown  ★ Phase 2 — 카운트다운 시작·취소·만료·중간 입장 / 게임 레코드 (Q-11)
//
// 사용법
//   node scripts/bot.mjs join --count 11
//   node scripts/bot.mjs duplicate
//   node scripts/bot.mjs reconnect
//   node scripts/bot.mjs host --grace 35
//   node scripts/bot.mjs chat --count 10 --messages 20
//   node scripts/bot.mjs lobby
//   node scripts/bot.mjs countdown
//
// ★ 로그만 찍지 않는다 (R005 5-1의 교훈).
//   lobby / countdown 은 expect() 로 단정하고, 하나라도 틀리면 0이 아닌 코드로 끝난다.
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
import pg from 'pg';
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
      s.on('error', (p) =>
        this.events.push({ type: 'error', code: p.code, message: p.message, detail: p.detail }),
      );
      s.on('session.terminated', (p) =>
        this.events.push({ type: 'session.terminated', reason: p.reason }),
      );
      s.on('room.hostChanged', (p) =>
        this.events.push({ type: 'room.hostChanged', hostAccountId: p.hostAccountId }),
      );
      s.on('chat.message', (m) => this.events.push({ type: 'chat', text: m.text }));

      // ── Phase 2 이벤트
      s.on('lobby.settingsUpdated', (p) => {
        this.events.push({ type: 'lobby.settingsUpdated', ...p });
        if (this.snapshot) {
          this.snapshot.room.settings = p.settings;
          this.snapshot.room.availableQuestionCount = p.availableQuestionCount;
          if (typeof p.settingsLocked === 'boolean') {
            this.snapshot.room.settingsLocked = p.settingsLocked;
          }
        }
      });
      s.on('lobby.experienceRates', (p) => {
        this.events.push({ type: 'lobby.experienceRates', rates: p.rates });
        if (this.snapshot) this.snapshot.experienceRates = p.rates;
      });
      s.on('game.countdownStarted', (p) => {
        this.events.push({ type: 'game.countdownStarted', endsAt: p.endsAt, at: Date.now() });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.room.settingsLocked = p.settingsLocked;
          this.snapshot.countdown = { endsAt: p.endsAt };
        }
      });
      s.on('game.countdownCancelled', (p) => {
        this.events.push({ type: 'game.countdownCancelled', reason: p.reason ?? null });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.room.settingsLocked = p.settingsLocked;
          this.snapshot.countdown = null;
        }
      });
      s.on('game.started', (p) => {
        this.events.push({ type: 'game.started', gameId: p.gameId, at: Date.now() });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.game = { gameId: p.gameId, totalQuestions: p.totalQuestions };
        }
      });
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

  /** 이 시점 이후의 이벤트만 보기 위한 표식 */
  mark() {
    return this.events.length;
  }

  since(from, type) {
    return this.events.slice(from).filter((e) => e.type === type);
  }

  /** 조건을 만족할 때까지 기다린다. 고정 sleep 보다 흔들림이 적다 */
  async waitFor(predicate, timeoutMs = 6000, label = '조건') {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (predicate()) return true;
      await sleep(50);
    }
    throw new Error(`대기 시간 초과: ${label}`);
  }
}

// -----------------------------------------------------------------------------
// 단정 수집기
//
// ★ assert 를 그대로 쓰면 첫 실패에서 멈춰 나머지 항목의 상태를 알 수 없다.
//   그래서 전부 실행해 결과를 모으고, 하나라도 실패하면 마지막에 실패로 끝낸다.
//   ★ "로그만 찍고 통과라고 보고" 하는 것과는 다르다. 실패가 있으면 종료 코드가 1이다.
// -----------------------------------------------------------------------------
const checks = [];

function expect(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  checks.push({ name, ok, actual: a, expected: b });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${ok ? '' : `  기대=${b} 실제=${a}`}`);
  return ok;
}

function expectTrue(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, actual: String(condition), expected: 'true' });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}

function checkSummary() {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n[결과] ${checks.length - failed.length}/${checks.length} 통과`);
  for (const f of failed) console.log(`  ★ 실패: ${f.name} — 기대 ${f.expected} / 실제 ${f.actual}`);
  return failed.length === 0;
}

// -----------------------------------------------------------------------------
// DB 직접 조회 (게임 레코드 검증용)
// ★ 서버가 정말로 games / game_players 를 만들었는지는 DB를 봐야 알 수 있다.
//   소켓 이벤트만 보면 "서버가 만들었다고 말한 것" 까지만 확인된다.
// -----------------------------------------------------------------------------
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

async function withDb(fn) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function gamesOfRoom(roomId) {
  return withDb(async (c) => {
    const games = await c.query(
      `SELECT id::text AS id, setting_question_count, setting_start_mode,
              setting_countdown_sec, planned_question_count, ended_at, end_reason
         FROM games WHERE room_id = $1 ORDER BY id`,
      [roomId],
    );
    if (games.rows.length === 0) return { games: [], players: [] };
    const players = await c.query(
      `SELECT game_id::text AS game_id, account_id::text AS account_id,
              color_index, is_midgame_join, final_score
         FROM game_players WHERE game_id = ANY($1::bigint[]) ORDER BY account_id`,
      [games.rows.map((g) => g.id)],
    );
    return { games: games.rows, players: players.rows };
  });
}

async function activeQuestionCount() {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT count(*)::int AS n FROM questions
        WHERE status = 'approved' AND is_active AND question_type = 'short_answer'`,
    );
    return r.rows[0].n;
  });
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
// Phase 2 — 로비 설정 / 권한 / 경험률 / 출제 가능 수
// -----------------------------------------------------------------------------
async function scenarioLobby() {
  log('시나리오 lobby — Phase 2 설정 검증 / 권한 / 경험률 (Q-10·11·12·21)');

  const seedTotal = await activeQuestionCount();
  log(`DB 활성 문제 수: ${seedTotal}개`);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 2 설정 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;

  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');
  await host.waitFor(() => host.snapshot.players.length === 2, 6000, '참가자 2명');

  // ── 1. 경험률 (Q-12)
  log('\n[1] 경험률');
  await host.waitFor(() => host.snapshot.experienceRates !== null, 6000, '경험률 수신');
  const rates = host.snapshot.experienceRates;
  expect('경험률이 참가자 수만큼 온다', rates.length, 2);
  // ★ 분모가 0이면 백분율 계산에서 0으로 나누기가 발생한다. 반드시 확인한다.
  expect('경험률 분모가 활성 문제 수와 같다', rates[0].total, seedTotal);
  expectTrue('★ 경험률 분모가 0이 아니다', rates.every((r) => r.total > 0));
  expectTrue('경험 기록이 없어 전원 0문제', rates.every((r) => r.experienced === 0));

  // ── 2. 출제 가능 수 (Q-21)
  log('\n[2] 출제 가능 문제 수');
  expect(
    '출제 가능 수가 활성 문제 수와 같다 (경험 기록 없음)',
    host.snapshot.room.availableQuestionCount,
    seedTotal,
  );

  // ── 3. 설정 범위 검증 (Q-10 / Q-11)
  log('\n[3] 설정 범위 — 서버가 거부해야 한다');
  const cases = [
    ['문제 수 0', { questionCount: 0, startMode: 'instant', countdownSec: 5 }],
    ['문제 수 201', { questionCount: 201, startMode: 'instant', countdownSec: 5 }],
    ['문제 수 소수점', { questionCount: 10.5, startMode: 'instant', countdownSec: 5 }],
    ['카운트다운 2초', { questionCount: 10, startMode: 'countdown', countdownSec: 2 }],
    ['카운트다운 61초', { questionCount: 10, startMode: 'countdown', countdownSec: 61 }],
    ['시작 방식 오타', { questionCount: 10, startMode: 'INSTANT', countdownSec: 5 }],
  ];
  for (const [label, payload] of cases) {
    const from = host.mark();
    host.socket.emit('lobby.updateSettings', payload);
    await sleep(300);
    const err = host.since(from, 'error')[0];
    expect(`${label} → BAD_REQUEST`, err?.code ?? '(에러 없음)', 'BAD_REQUEST');
    expectTrue(`${label} → 이유를 알려준다`, Boolean(err?.detail), err?.detail ?? '');
    expect(`${label} → 설정이 바뀌지 않았다`, host.snapshot.room.settings.questionCount, 20);
  }

  // ── 4. 정상 범위는 통과 (경계값)
  log('\n[4] 경계값은 통과한다');
  for (const [label, payload, expectCount] of [
    ['문제 수 1', { questionCount: 1, startMode: 'instant', countdownSec: 5 }, 1],
    ['문제 수 200', { questionCount: 200, startMode: 'instant', countdownSec: 5 }, 200],
    ['카운트다운 3초', { questionCount: 5, startMode: 'countdown', countdownSec: 3 }, 5],
    ['카운트다운 60초', { questionCount: 5, startMode: 'countdown', countdownSec: 60 }, 5],
  ]) {
    const from = host.mark();
    host.socket.emit('lobby.updateSettings', payload);
    await host.waitFor(
      () => host.since(from, 'lobby.settingsUpdated').length > 0,
      4000,
      label,
    );
    expect(`${label} → 반영됨`, host.snapshot.room.settings.questionCount, expectCount);
  }
  // 게스트에게도 전파되어야 한다 (읽기 전용으로 같은 값을 본다)
  expect('게스트도 같은 설정을 본다', guest.snapshot.room.settings.countdownSec, 60);

  // ── 5. 권한 (guide 44절)
  log('\n[5] 비방장 권한 차단');
  let from = guest.mark();
  guest.socket.emit('lobby.updateSettings', {
    questionCount: 7,
    startMode: 'instant',
    countdownSec: 5,
  });
  await sleep(300);
  expect('비방장 설정 변경 → NOT_HOST', guest.since(from, 'error')[0]?.code, 'NOT_HOST');
  expect('설정이 바뀌지 않았다', host.snapshot.room.settings.questionCount, 5);

  from = guest.mark();
  guest.socket.emit('game.start', {});
  await sleep(300);
  expect('비방장 게임 시작 → NOT_HOST', guest.since(from, 'error')[0]?.code, 'NOT_HOST');
  expect('상태가 그대로 LOBBY', host.snapshot.room.state, 'LOBBY');

  // ── 6. ★ 출제 가능 수 부족 (Q-21)
  log('\n[6] ★ 문제 수 200 + 출제 가능 53 → 시작 거부');
  host.socket.emit('lobby.updateSettings', {
    questionCount: 200,
    startMode: 'instant',
    countdownSec: 5,
  });
  await sleep(300);
  from = host.mark();
  host.socket.emit('game.start', {});
  await sleep(600);
  const shortage = host.since(from, 'error')[0];
  expect('시작 거부 코드', shortage?.code ?? '(에러 없음)', 'NOT_ENOUGH_QUESTIONS');
  expectTrue(
    '★ 안내에 실제 가능 개수가 들어 있다',
    typeof shortage?.detail === 'string' && shortage.detail.includes(String(seedTotal)),
    shortage?.detail ?? '',
  );
  expect('게임이 시작되지 않았다 (상태 유지)', host.snapshot.room.state, 'LOBBY');
  expect('게임 레코드도 없다', (await gamesOfRoom(roomId)).games.length, 0);

  host.disconnect();
  guest.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// Phase 2 — 카운트다운과 게임 레코드
// -----------------------------------------------------------------------------
async function scenarioCountdown() {
  log('시나리오 countdown — 카운트다운 시작·취소·만료 / 중간 입장 / 게임 레코드 (Q-11)');

  const [host, guest, late] = await makeBots(3);
  await host.connect();
  host.createRoom('Phase 2 카운트다운 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');

  const setSettings = async (payload) => {
    const from = host.mark();
    host.socket.emit('lobby.updateSettings', payload);
    await host.waitFor(
      () => host.since(from, 'lobby.settingsUpdated').length > 0,
      4000,
      '설정 반영',
    );
  };

  // ── 1. 카운트다운 시작 → 취소 (T01 → T03)
  log('\n[1] 카운트다운 시작 → 방장 취소');
  await setSettings({ questionCount: 3, startMode: 'countdown', countdownSec: 30 });
  let from = host.mark();
  host.socket.emit('game.start', {});
  await host.waitFor(
    () => host.since(from, 'game.countdownStarted').length > 0,
    5000,
    '카운트다운 시작',
  );
  expect('상태가 COUNTDOWN', host.snapshot.room.state, 'COUNTDOWN');
  expect('설정이 잠긴다', host.snapshot.room.settingsLocked, true);
  expect('게스트도 COUNTDOWN 을 본다', guest.snapshot.room.state, 'COUNTDOWN');

  // ★ 카운트다운 중 설정 변경은 거부된다
  from = host.mark();
  host.socket.emit('lobby.updateSettings', {
    questionCount: 9,
    startMode: 'countdown',
    countdownSec: 10,
  });
  await sleep(300);
  expect(
    '★ 카운트다운 중 설정 변경 → INVALID_STATE',
    host.since(from, 'error')[0]?.code,
    'INVALID_STATE',
  );
  expect('설정이 그대로다', host.snapshot.room.settings.questionCount, 3);

  // ★ 카운트다운 중 신규 입장 허용 (Q-11)
  await late.connect();
  late.join(roomId);
  await late.waitFor(() => late.snapshot !== null, 6000, '카운트다운 중 입장');
  expect('★ 카운트다운 중 입장이 허용된다', late.snapshot.room.state, 'COUNTDOWN');
  await host.waitFor(() => host.snapshot.players.length === 3, 5000, '3명');
  expect('입장자가 목록에 들어간다', host.snapshot.players.length, 3);

  // ★ endsAt 이 서버 기준 절대 시각인지 (남은 시간이 설정값 이하이고 줄어드는가)
  const endsAt = host.snapshot.countdown.endsAt;
  const startedEvent = host.events.find((e) => e.type === 'game.countdownStarted');
  const remainAtStart = endsAt - startedEvent.at;
  expectTrue(
    '★ endsAt 이 서버 기준 절대 시각이다 (설정 30초와 오차 2초 이내)',
    Math.abs(remainAtStart - 30000) < 2000,
    `수신 시점 남은 시간 ${remainAtStart}ms`,
  );
  await sleep(1200);
  const remainLater = endsAt - Date.now();
  expectTrue(
    '★ 남은 시간이 실제 경과만큼 줄어든다',
    remainLater < remainAtStart - 1000,
    `${remainAtStart}ms → ${remainLater}ms`,
  );

  // 취소 (T03)
  from = host.mark();
  host.socket.emit('game.cancelCountdown', {});
  await host.waitFor(
    () => host.since(from, 'game.countdownCancelled').length > 0,
    5000,
    '카운트다운 취소',
  );
  expect('★ 취소하면 LOBBY 로 돌아간다', host.snapshot.room.state, 'LOBBY');
  expect('★ 설정 잠금이 풀린다', host.snapshot.room.settingsLocked, false);
  expect('게스트도 LOBBY 를 본다', guest.snapshot.room.state, 'LOBBY');
  expect('취소했으므로 게임 레코드가 없다', (await gamesOfRoom(roomId)).games.length, 0);

  // 잠금이 풀렸으므로 설정을 다시 바꿀 수 있다
  await setSettings({ questionCount: 4, startMode: 'countdown', countdownSec: 3 });
  expect('취소 후 설정 변경이 다시 된다', host.snapshot.room.settings.questionCount, 4);

  // ── 2. 카운트다운 만료 → 게임 시작 (T04)
  log('\n[2] 카운트다운 만료 → 게임 시작');
  from = host.mark();
  const startRequestedAt = Date.now();
  host.socket.emit('game.start', {});
  await host.waitFor(
    () => host.since(from, 'game.started').length > 0,
    12000,
    '게임 시작',
  );
  const startedAt = host.since(from, 'game.started')[0].at;
  const elapsed = startedAt - startRequestedAt;
  expectTrue(
    '★ 3초 카운트다운이 지난 뒤에 시작된다 (2.5~5초)',
    elapsed > 2500 && elapsed < 5000,
    `${elapsed}ms 경과`,
  );
  expect('상태가 QUESTION_ACTIVE', host.snapshot.room.state, 'QUESTION_ACTIVE');
  expect('전원이 game.started 를 받는다', guest.since(0, 'game.started').length, 1);
  expect('중간 입장자도 받는다', late.since(0, 'game.started').length, 1);

  // ── 3. 게임 레코드 (B-5)
  log('\n[3] 게임 레코드');
  await sleep(400); // DB 기록은 상태 전이 뒤에 이어진다
  const { games, players } = await gamesOfRoom(roomId);
  expect('games 1행', games.length, 1);
  expect('setting_question_count', games[0]?.setting_question_count, 4);
  expect('setting_start_mode', games[0]?.setting_start_mode, 'countdown');
  expect('setting_countdown_sec', games[0]?.setting_countdown_sec, 3);
  expectTrue(
    'planned_question_count 가 출제 가능 수로 기록된다 (Q-21)',
    games[0]?.planned_question_count >= 4,
    `${games[0]?.planned_question_count}`,
  );
  expect('아직 종료되지 않았다', games[0]?.ended_at, null);
  expect('game_players 3행 (카운트다운 중 입장자 포함)', players.length, 3);
  expectTrue(
    '★ 진행 중에는 final_score 를 쓰지 않는다',
    players.every((p) => p.final_score === null),
  );
  expectTrue(
    '시작 시점 참가자는 중간 참가가 아니다',
    players.every((p) => p.is_midgame_join === false),
  );
  expect(
    'game.started 의 gameId 가 DB 와 일치한다',
    host.snapshot.game.gameId,
    games[0]?.id,
  );

  // ── 4. 시작 뒤에는 설정을 바꿀 수 없다
  log('\n[4] 시작 후 잠금');
  from = host.mark();
  host.socket.emit('lobby.updateSettings', {
    questionCount: 9,
    startMode: 'instant',
    countdownSec: 5,
  });
  await sleep(300);
  expect(
    '게임 시작 후 설정 변경 → INVALID_STATE',
    host.since(from, 'error')[0]?.code,
    'INVALID_STATE',
  );
  from = host.mark();
  host.socket.emit('game.start', {});
  await sleep(300);
  expect(
    '이미 시작된 게임을 다시 시작 → INVALID_STATE',
    host.since(from, 'error')[0]?.code,
    'INVALID_STATE',
  );
  expect('games 는 여전히 1행', (await gamesOfRoom(roomId)).games.length, 1);

  // ── 5. ★ 방이 사라질 때 열린 게임을 닫는다
  log('\n[5] 전원 퇴장 시 게임 레코드 종료 기록');
  host.socket.emit('room.leave', {});
  guest.socket.emit('room.leave', {});
  late.socket.emit('room.leave', {});
  await sleep(900);
  const after = await gamesOfRoom(roomId);
  expectTrue(
    '★ ended_at 이 기록된다 (열린 게임을 남기지 않는다)',
    after.games[0]?.ended_at !== null,
    String(after.games[0]?.end_reason),
  );
  expect('종료 사유', after.games[0]?.end_reason, 'abandoned');

  host.disconnect();
  guest.disconnect();
  late.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// Phase 2 — 활성 0명 동안 카운트다운 보류 (B-4 판단)
//
// ★ 확정 규칙은 "활성 0명이면 즉시 PAUSED" 다 (T20).
//   PAUSED 는 Phase 5이므로 Phase 2에서는 T04 의 조건("활성 ≥ 1")만 지켜 만료를 보류한다.
//   ★ 이 테스트는 그 판단이 실제로 그렇게 동작하는지를 단정한다.
//     "아무도 없는데 게임이 시작되어 빈 게임 레코드가 남는" 사고를 막는 것이 핵심이다.
// -----------------------------------------------------------------------------
async function scenarioEmptyCountdown() {
  log('시나리오 empty — 활성 0명 동안 카운트다운 보류 (B-4)');

  const [host] = await makeBots(1);
  await host.connect();
  host.createRoom('활성 0명 카운트다운 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;

  let from = host.mark();
  host.socket.emit('lobby.updateSettings', {
    questionCount: 2,
    startMode: 'countdown',
    countdownSec: 3,
  });
  await host.waitFor(() => host.since(from, 'lobby.settingsUpdated').length > 0, 4000, '설정');

  from = host.mark();
  host.socket.emit('game.start', {});
  await host.waitFor(
    () => host.since(from, 'game.countdownStarted').length > 0,
    5000,
    '카운트다운 시작',
  );

  // 카운트다운 도중 전원 접속 종료
  host.disconnect();
  log('  전원 접속 종료. 카운트다운(3초)이 지나도 시작되지 않아야 한다.');
  await sleep(6000);

  expect(
    '★ 활성 0명 동안에는 게임이 시작되지 않는다',
    (await gamesOfRoom(roomId)).games.length,
    0,
  );

  // 돌아오면 시작된다
  const back = new Bot(host.name);
  back.cookie = host.cookie;
  await back.connect();
  await back.waitFor(() => back.snapshot !== null, 6000, '재접속');
  log('  재접속했다. 만료 시각이 이미 지났으므로 곧 시작되어야 한다.');
  await back.waitFor(() => back.since(0, 'game.started').length > 0, 6000, '게임 시작');
  expect('★ 사람이 돌아오면 시작된다', back.snapshot.room.state, 'QUESTION_ACTIVE');
  await sleep(400);
  expect('게임 레코드 1행', (await gamesOfRoom(roomId)).games.length, 1);

  back.socket.emit('room.leave', {});
  await sleep(700);
  back.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
const SCENARIOS = {
  join: scenarioJoin,
  duplicate: scenarioDuplicate,
  reconnect: scenarioReconnect,
  host: scenarioHost,
  chat: scenarioChat,
  lobby: scenarioLobby,
  countdown: scenarioCountdown,
  empty: scenarioEmptyCountdown,
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
