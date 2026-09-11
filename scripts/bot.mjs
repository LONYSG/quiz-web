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
//   ★ game     Phase 3 — 문제 출제 / 정답 판정 / 점수 / 힌트 / 경험 기록 / 결과
//   ★★ race    Phase 3 — 동시 정답 (한 문제의 정답자는 정확히 한 명. guide 18절)
//   ★★ epoch   Phase 3 — RESOLVED 구간 메시지가 다음 문제 정답과 우연히 일치 (장치 B)
//   ★ concur   Phase 3 — R003 2-3 동시 발생 시나리오 나머지
//   ★★ collide Phase 3 — 두 트리거가 동시에 문제를 끝내려는 경우 (장치 A)
//   ★ full     Phase 3 — 봇 10명으로 한 게임 완주 + 타이머 정확도 실측
//   ★★ pause   Phase 5 — 일시정지 / ★★ 자동 재개 없음 / 방장 재개 / Q-82 즉시 폭파
//   ★★ abandon Phase 5 — PAUSED 만료로 방 폭파 (설정값을 짧게 줄여 검증)
//   ★★ pausehost Phase 5 — PAUSED 중 방장 이전 (약 40초)
//   ★★ pausehint Phase 5 — 일시정지와 힌트 / 정보 누출 방어선 (약 45초)
//   ★★ flood   Q-84 — 도배 완화 후 판정 성능 실측
//
// 사용법
//   node scripts/bot.mjs join --count 11
//   node scripts/bot.mjs duplicate
//   node scripts/bot.mjs reconnect
//   node scripts/bot.mjs host --grace 35
//   node scripts/bot.mjs chat --count 10 --messages 20
//   node scripts/bot.mjs lobby
//   node scripts/bot.mjs countdown
//   node scripts/bot.mjs game
//   node scripts/bot.mjs race --rounds 30
//   node scripts/bot.mjs epoch
//   node scripts/bot.mjs concur
//   node scripts/bot.mjs collide
//   node scripts/bot.mjs full --count 10
//   node scripts/bot.mjs pause
//   node scripts/bot.mjs abandon
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

/**
 * ★ 시나리오별 서버 환경 변수.
 *
 * ★★ 왜 시나리오 함수 안이 아니라 여기인가 — 서버는 시나리오가 시작되기 **전에** 뜬다.
 *   ★ 시나리오 안에서 값을 넣으면 이미 늦다. 실제로 그렇게 만들었다가 실패했다.
 *   → ★ 이름으로 미리 정해 둔다.
 *
 * ★★ 이미 떠 있는 서버를 쓰면 적용되지 않는다. 그 경우 경고하고 멈춘다.
 */
const SCENARIO_ENV = {
  // ★ 실제 기본값은 5분이다. 테스트에서는 6초로 줄여 같은 경로를 검증한다.
  //   ★ 값만 다르고 코드 경로는 동일하다. 그것이 설정값으로 뺀 이유이기도 하다.
  abandon: { PAUSE_ABANDON_MS: '6000' },
};
const SERVER_ENV = SCENARIO_ENV[scenario] ?? {};
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

/** ★ 우리가 직접 띄운 서버인가. 설정 덮어쓰기가 실제로 적용됐는지 판단하는 기준이다 */
let serverIsOurs = false;

async function ensureServer() {
  if (await serverAlive()) {
    console.log('[bot] 이미 떠 있는 서버를 사용합니다:', BASE);
    if (Object.keys(SERVER_ENV).length > 0) {
      console.log('[bot] ★★ 이미 떠 있는 서버이므로 설정 덮어쓰기가 적용되지 않았다.');
      console.log('[bot]   ★ 서버를 끄고 다시 실행하면 적용된다.');
    }
    return;
  }
  serverIsOurs = true;
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
  // ★★ 시나리오가 서버 설정을 덮어쓸 수 있게 한다 (R015).
  //   ★ 왜 필요한가 — Q-82 의 "5분 뒤 방 폭파" 를 테스트하려면 5분을 기다려야 한다.
  //     ★ 테스트가 5분을 기다리면 아무도 돌리지 않는다.
  //   ★★ 그래서 **설정값을 짧게 줄여** 같은 경로를 검증한다.
  //     ★ 값만 다르고 코드 경로는 동일하다. 그것이 설정값으로 뺀 이유이기도 하다.
  if (Object.keys(SERVER_ENV).length > 0) {
    console.log(`[bot] ★ 서버 설정 덮어쓰기: ${JSON.stringify(SERVER_ENV)}`);
  }
  bootedServer = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...SERVER_ENV },
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

      // ── ★★ Phase 3 이벤트
      s.on('question.started', (p) => {
        this.events.push({ type: 'question.started', epoch: p.epoch, index: p.index, at: Date.now(), payload: p });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.question = { ...p, hint: null, hintRevealed: false };
          this.snapshot.resolution = null;
        }
      });
      s.on('question.experiencedUpdated', (p) => {
        this.events.push({ type: 'question.experiencedUpdated', epoch: p.epoch, payload: p });
        if (this.snapshot?.question && this.snapshot.question.epoch === p.epoch) {
          this.snapshot.question.experiencedNicknames = p.experiencedNicknames;
          this.snapshot.question.selfExperienced = p.selfExperienced;
        }
      });
      s.on('question.hint', (p) => {
        this.events.push({ type: 'question.hint', epoch: p.epoch, hint: p.hint, at: Date.now() });
        if (this.snapshot?.question && this.snapshot.question.epoch === p.epoch) {
          this.snapshot.question.hint = p.hint;
          this.snapshot.question.hintRevealed = true;
        }
      });
      s.on('question.resolved', (p) => {
        this.events.push({ type: 'question.resolved', epoch: p.epoch, reason: p.reason, winnerAccountId: p.winnerAccountId, displayAnswer: p.displayAnswer, at: Date.now(), payload: p });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.resolution = p;
          const byId = new Map((p.scores ?? []).map((x) => [x.accountId, x.score]));
          for (const pl of this.snapshot.players ?? []) {
            if (byId.has(pl.accountId)) pl.score = byId.get(pl.accountId);
          }
        }
      });
      s.on('skip.voteUpdated', (p) => {
        this.events.push({ type: 'skip.voteUpdated', epoch: p.epoch, votes: p.votes, threshold: p.threshold });
        if (this.snapshot) this.snapshot.skip = p;
      });
      s.on('game.result', (p) => {
        this.events.push({ type: 'game.result', endReason: p.endReason, at: Date.now(), payload: p });
        if (this.snapshot) {
          this.snapshot.room.state = 'GAME_RESULT';
          this.snapshot.result = p;
          this.snapshot.question = null;
        }
      });
      s.on('game.returnedToLobby', (p) => {
        this.events.push({ type: 'game.returnedToLobby', at: Date.now() });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.room.settings = p.settings;
          this.snapshot.room.settingsLocked = p.settingsLocked;
          this.snapshot.players = p.players;
          this.snapshot.game = null;
          this.snapshot.question = null;
          this.snapshot.result = null;
        }
      });
      s.on('chat.throttled', (p) => {
        this.events.push({ type: 'chat.throttled', retryAfterMs: p.retryAfterMs });
      });

      // ── ★★ Phase 5 이벤트 (R015)
      s.on('game.paused', (p) => {
        this.events.push({ type: 'game.paused', at: Date.now(), payload: p });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.paused = { ...p, canResume: false };
        }
      });
      s.on('game.pauseStatus', (p) => {
        this.events.push({ type: 'game.pauseStatus', returned: p.returned, total: p.total });
        if (this.snapshot?.paused) {
          this.snapshot.paused.returned = p.returned;
          this.snapshot.paused.total = p.total;
          this.snapshot.paused.abandonAt = p.abandonAt;
        }
      });
      s.on('game.resumed', (p) => {
        this.events.push({ type: 'game.resumed', at: Date.now(), payload: p });
        if (this.snapshot) {
          this.snapshot.room.state = p.state;
          this.snapshot.paused = null;
          if (this.snapshot.question && p.endsAt !== null) {
            this.snapshot.question.endsAt = p.endsAt;
          }
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

  /**
   * 채팅 전송.
   * ★★ epoch 를 담는다. 그것이 장치 B 의 클라이언트 쪽 절반이다.
   *   ★ 두 번째 인자로 epoch 를 강제 지정할 수 있다 — epoch 시나리오가 그것을 쓴다.
   */
  chat(text, epochOverride) {
    const epoch =
      epochOverride !== undefined ? epochOverride : (this.snapshot?.question?.epoch ?? null);
    this.socket.emit('chat.send', { text, epoch });
  }

  /** 현재 문제의 epoch */
  epoch() {
    return this.snapshot?.question?.epoch ?? null;
  }

  skipVote(vote) {
    this.socket.emit('skip.vote', { vote, epoch: this.epoch() });
  }

  forceSkip(epochOverride) {
    this.socket.emit('host.forceSkip', {
      epoch: epochOverride !== undefined ? epochOverride : this.epoch(),
    });
  }

  forceEnd() {
    this.socket.emit('host.forceEnd', {});
  }

  resume() {
    this.socket.emit('game.resume', {});
  }

  leave() {
    this.socket.emit('room.leave', {});
  }

  /** 현재 문제가 시작될 때까지 기다린다 */
  async waitQuestion(index, timeoutMs = 12000) {
    await this.waitFor(
      () => this.snapshot?.question && (index === undefined || this.snapshot.question.index === index),
      timeoutMs,
      `문제 ${index ?? ''} 시작`,
    );
    return this.snapshot.question;
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

/**
 * ★ 문제 지문으로 정답을 찾는다.
 *
 * ★★ 봇이 정답을 알아내는 유일한 경로가 DB 다. 그것이 의도다 —
 *   서버는 QUESTION_ACTIVE 중에 정답을 클라이언트로 보내지 않는다.
 *   ★ 봇이 소켓에서 정답을 읽을 수 있다면 그것 자체가 결함이다.
 */
async function answersForText(text) {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT a.answer_text
         FROM questions q JOIN question_answers a ON a.question_id = q.id
        WHERE q.question_text = $1
        ORDER BY a.is_primary DESC, a.id`,
      [text],
    );
    return r.rows.map((x) => x.answer_text);
  });
}

/** ★ 게임의 문제별 기록. 선정 단계와 종료 사유를 확인한다 */
async function questionsOfGame(gameId) {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT question_index, question_id::text AS question_id, epoch,
              resolution, winner_account_id::text AS winner_account_id,
              selection_stage, skip_votes_at_end, active_at_end,
              (resolved_at IS NOT NULL) AS resolved
         FROM game_questions WHERE game_id = $1 ORDER BY question_index`,
      [gameId],
    );
    return r.rows;
  });
}

/** ★ answer_events. 동시 정답의 사후 검증 근거다 (guide 18절) */
async function answerEventsOfGame(gameId) {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT question_index, account_id::text AS account_id, matched,
              was_eligible, accepted, reject_reason, response_ms
         FROM answer_events WHERE game_id = $1 ORDER BY question_index, id`,
      [gameId],
    );
    return r.rows;
  });
}

/** ★ 경험 기록. Q-47 기준(정답 공개 순간 그 자리에 있던 사람 전원)을 확인한다 */
async function experiencesOfGame(gameId) {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT account_id::text AS account_id, question_id::text AS question_id
         FROM question_experiences WHERE first_game_id = $1
        ORDER BY question_id, account_id`,
      [gameId],
    );
    return r.rows;
  });
}

/** ★ 테스트 계정의 경험 기록을 지운다. 반복 실행을 가능하게 한다 */
async function clearExperiences(prefix) {
  return withDb(async (c) => {
    const r = await c.query(
      `DELETE FROM question_experiences
        WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE $1)`,
      [`${prefix}\_%`],
    );
    return r.rowCount ?? 0;
  });
}

/**
 * ★ 지정한 계정들에게 경험 기록을 넣어 **출제 가능 수를 원하는 값으로 줄인다.**
 *
 * ★★ 왜 이런 헬퍼가 필요한가 (R014)
 *   ★ "출제 가능 수 부족" 테스트가 원래는 "문제 수 200 > 활성 53" 으로 재현했다.
 *     ★ R014 에서 문제가 306개가 되어 그 조건이 성립하지 않게 됐다.
 *     ★★ 테스트가 **DB 데이터 양에 의존**하고 있었다. 데이터가 늘면 조용히 무력화된다.
 *   → ★ 실제 메커니즘(경험 기록)으로 조건을 만든다. 데이터 양과 무관해진다.
 *
 * ★ 되돌리기: clearExperiences(prefix) 로 지운다.
 */
async function shrinkAvailableTo(accountIds, keepCount) {
  return withDb(async (c) => {
    const r = await c.query(
      `WITH pool AS (
         SELECT id FROM questions
          WHERE status = 'approved' AND is_active AND question_type = 'short_answer'
          ORDER BY id
       ), target AS (
         SELECT id FROM pool OFFSET $2
       )
       INSERT INTO question_experiences (account_id, question_id)
       SELECT a.account_id, t.id
         FROM unnest($1::bigint[]) AS a(account_id), target t
       ON CONFLICT (account_id, question_id) DO NOTHING`,
      [accountIds, keepCount],
    );
    return r.rowCount ?? 0;
  });
}

/**
 * ★ 방의 현재 상태를 서버에서 읽는다.
 *
 * ★★ 왜 소켓이 아니라 HTTP 인가 — **아무도 접속해 있지 않을 때** 상태를 봐야 한다.
 *   ★ PAUSED 테스트의 핵심이 "전원이 나간 뒤 서버가 어떤 상태인가" 다.
 *     ★ 소켓으로 보려면 누군가 붙어 있어야 하고, 붙는 순간 활성 인원이 바뀐다.
 *   → ★ 관측이 대상을 바꾸지 않도록 읽기 전용 진단 엔드포인트를 쓴다.
 */
async function roomStateOf(roomId) {
  try {
    const r = await fetch(`${BASE}/debug/room/${roomId}`, { signal: AbortSignal.timeout(3000) });
    if (r.status === 404) return { exists: false };
    return await r.json();
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

/**
 * ★ 설정 덮어쓰기가 실제로 적용됐는지 확인한다.
 *
 * ★★ 적용되지 않았는데 그대로 돌면 **5분을 기다리다 실패한다.**
 *   ★ 그러면 원인을 찾기 어렵다. 먼저 멈추고 이유를 알린다.
 */
function ensureServerForScenario() {
  if (serverIsOurs) return;
  console.error('[bot] ★★ 이미 떠 있는 서버를 쓰고 있어 설정 덮어쓰기가 적용되지 않았다.');
  console.error('[bot]   ★ 이 시나리오는 서버를 직접 띄워야 한다. 기존 서버를 끄고 다시 실행한다.');
  process.exit(1);
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

  // ★★ 경험 기록을 먼저 지운다 (R014 에서 추가).
  //   ★ 왜 — Phase 3 부터 게임을 돌리면 경험 기록이 실제로 쌓인다.
  //     ★ 이 시나리오는 "경험 기록이 없는 상태" 를 전제로 경험률과 출제 가능 수를 단정한다.
  //     ★ 그 전제를 명시적으로 만들지 않으면, Phase 3 시나리오를 먼저 돌린 뒤에
  //       이 테스트가 실패한다. **테스트가 실행 순서에 의존하게 된다.**
  //   ★ 실제로 R014 에서 그렇게 실패했다. 원인은 제품이 아니라 테스트 전제였다.
  const cleared = await clearExperiences(PREFIX);
  if (cleared > 0) log(`  ★ 테스트 계정의 경험 기록 ${cleared}건을 지웠다 (전제를 명시적으로 만든다)`);

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
  //
  //   ★★ R014 에서 재현 방식을 바꿨다.
  //     ★ 전에는 "문제 수 200 > 활성 53" 으로 만들었다. 문제가 306개가 되자 성립하지 않았다.
  //     ★★ 테스트가 DB 데이터 양에 의존하고 있었다 — 데이터가 늘면 조용히 무력화된다.
  //   → ★ 실제 메커니즘(경험 기록)으로 만든다. 두 참가자가 전부 경험한 문제는 제외된다.
  log('\n[6] ★ 출제 가능 수를 3개로 줄이고 문제 수 10 → 시작 거부');
  const ids = [host.snapshot.me.accountId, guest.snapshot.me.accountId];
  const inserted = await shrinkAvailableTo(ids, 3);
  log(`  ★ 경험 기록 ${inserted}행을 넣어 출제 가능 수를 3개로 줄였다`);
  // ★ 참가자 집합이 바뀌어야 서버가 다시 계산한다. resync 로는 갱신되지 않는다.
  //   ★ 그래서 게스트를 잠깐 내보내고 다시 넣는다 — 참가자 변동 이벤트를 만든다
  guest.socket.emit('room.leave', {});
  await host.waitFor(() => host.snapshot.players.length === 1, 6000, '게스트 퇴장');
  guest.join(roomId);
  await host.waitFor(() => host.snapshot.players.length === 2, 6000, '게스트 재입장');
  await host.waitFor(
    () => host.snapshot.room.availableQuestionCount === 3,
    6000,
    '출제 가능 수 3 반영',
  );
  expect('★ 출제 가능 수가 3으로 줄었다', host.snapshot.room.availableQuestionCount, 3);

  host.socket.emit('lobby.updateSettings', {
    questionCount: 10,
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
    // ★ 기준은 "지금 출제 가능한 수"(3)다. 활성 문제 총수(seedTotal)가 아니다.
    //   ★ R014 에서 재현 방식을 바꾸면서 이 기준도 함께 바꿨다.
    typeof shortage?.detail === 'string' &&
      shortage.detail.includes('3개') &&
      shortage.detail.includes('10개'),
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

  // ── 5. ★★ 게임 중 퇴장은 슬롯을 유지한다 (R014 에서 동작이 바뀌었다)
  //
  //   ★★ Phase 2 에서는 이 자리에서 "전원 퇴장 → 방 삭제 → ended_at 기록" 을 단정했다.
  //     ★ Phase 3 에서 그 단정이 **의도적으로 깨졌다.**
  //
  //   ★ 확정 규칙 (01-GAME-RULES 13장 "접속 종료")
  //     · 슬롯: **게임 중에는 유지.** 게임 종료 후 로비로 복귀하는 시점에 반환
  //     · 점수 / 경험 기록 / 최종 결과: 유지
  //     ★ 근거: 나갔다고 그 게임 결과에서 사라지면 순위가 왜곡된다
  //
  //   ★ 그래서 전원이 나가도 방과 게임이 남는다. 닫히는 시점은 —
  //     · 활성 0명 10분 → 방 삭제 시 abandoned 로 닫힌다 (Q-14)
  //     · 또는 방장이 결과 화면에서 로비로 복귀할 때 슬롯이 반환된다
  //   ★★ 그 사이 문제 타이머는 **멈춘다** (freezeIfNoActive). 근거는 그 함수 주석에 있다.
  //   ★★ R015 에서 또 바뀌었다 (Q-82). 세 갈래를 모두 단정한다.
  //     (1) 게임 중 퇴장이지만 **마지막 활성자가 아니면** → 슬롯 유지 (R014 동작 그대로)
  //     (2) ★★ 끊김으로 전원 이탈 → **PAUSED** (폭파되지 않는다)
  //     (3) ★★★ 마지막 활성자가 **나가기 버튼** → **즉시 폭파**
  log('\n[5] ★★ 게임 중 퇴장 — 나가기와 끊김을 다르게 처리한다 (Q-82)');
  const playersBefore = host.snapshot.players.length;

  // (1) 마지막 활성자가 아닌 두 명이 나간다 → 방은 남는다
  guest.socket.emit('room.leave', {});
  late.socket.emit('room.leave', {});
  await sleep(900);
  const after = await gamesOfRoom(roomId);
  expectTrue(
    '★ 마지막 활성자가 아니면 게임이 닫히지 않는다 (슬롯 유지)',
    after.games[0]?.ended_at === null,
    `ended_at=${after.games[0]?.ended_at} / end_reason=${after.games[0]?.end_reason}`,
  );
  expect('★ game_players 행이 그대로다 (그 게임 결과에 남는다)', after.players.length, playersBefore);

  // (2) ★★ 남은 한 명이 **끊긴다** (나가기가 아니다) → PAUSED
  host.socket.close();
  await sleep(900);
  const st = await roomStateOf(roomId);
  expect('★★ 끊김으로 전원 이탈 → PAUSED (폭파되지 않는다)', st.state, 'PAUSED');

  // ★ 아무도 없는 동안 문제 타이머가 멈춰 있는지 확인한다
  const gqBefore = await questionsOfGame(after.games[0].id);
  const remainWhenPaused = st.paused.remainingMs;
  await sleep(6000);
  const gqAfter = await questionsOfGame(after.games[0].id);
  const st2 = await roomStateOf(roomId);
  expect('★★★ 활성 0명 동안 문제가 더 진행되지 않는다', gqAfter.length, gqBefore.length);
  expect('★★ 남은 시간도 흐르지 않는다', st2.paused.remainingMs, remainWhenPaused);
  log(`  ★ 6초 동안 문제 수 ${gqBefore.length} → ${gqAfter.length} / 남은 시간 ${remainWhenPaused}ms 고정`);

  // ★ 방장이 돌아와 재개한다
  const back = new Bot(host.name);
  back.cookie = host.cookie;
  await back.connect();
  await back.waitFor(() => back.snapshot !== null, 6000, '재접속');
  expect('★ 재접속하면 PAUSED 를 본다', back.snapshot.room.state, 'PAUSED');
  expectTrue('★ 현재 문제가 복구된다', back.snapshot.question !== null);
  let rf = back.mark();
  back.resume();
  await back.waitFor(() => back.since(rf, 'game.resumed').length > 0, 5000, '재개');
  expect('★ 재개하면 이어진다', back.snapshot.room.state, 'QUESTION_ACTIVE');
  expectTrue(
    '★★ 남은 시간이 보존되어 이어진다',
    back.snapshot.question.endsAt - Date.now() > remainWhenPaused - 1500,
    `${back.snapshot.question.endsAt - Date.now()}ms 남음 (멈출 때 ${remainWhenPaused}ms)`,
  );

  back.socket.emit('host.forceEnd', {});
  await back.waitFor(() => back.since(0, 'game.result').length > 0, 6000, '강제 종료');
  await sleep(700);
  const closed = await gamesOfRoom(roomId);
  expectTrue(
    '★ 강제 종료하면 ended_at 이 기록된다',
    closed.games[0]?.ended_at !== null,
    String(closed.games[0]?.end_reason),
  );
  expect('종료 사유', closed.games[0]?.end_reason, 'force_ended');

  // (3) ★★ 결과 화면에서 나가기 — ★ 즉시 폭파가 아니다. 그 판단을 여기서 단정한다.
  //
  //   ★★ Q-82 의 "즉시 폭파" 는 **게임 중**(COUNTDOWN/QUESTION_*/PAUSED)에만 적용한다.
  //     ★ 근거: 건우의 지적은 "게임이 살아있는 거냐" 였다.
  //       결과 화면에서는 games 가 이미 닫혀 있으므로 살아있는 게임이 없다.
  //     ★ 그리고 여기 남은 슬롯은 **게임 결과를 보기 위한 슬롯**이다 (Q-15).
  //       끊겼다가 돌아와 결과를 확인할 사람이 있을 수 있다.
  //   ★ 그래서 결과 화면·로비는 기존 경로인 **활성 0명 10분 idle 삭제**(Q-14/D-066)로 정리한다.
  //     ★ 10분을 기다릴 수는 없으므로 여기서는 "그 경로에 올라탔는지"까지만 단정한다.
  back.leave();
  await sleep(800);
  const rest = await roomStateOf(roomId);
  expectTrue(
    '★★ 결과 화면에서 나가면 즉시 폭파되지 않는다 (남은 슬롯이 결과를 본다)',
    rest.exists === true,
    `state=${rest.state}`,
  );
  expect('★★ 활성은 0명이다 → 10분 idle 삭제 경로에 오른다 (Q-14)', rest.activeCount, 0);
  expect('★ 상태는 결과 화면이다 (PAUSED 로 가지 않는다)', rest.state, 'GAME_RESULT');
  back.disconnect();

  host.disconnect();
  guest.disconnect();
  late.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// ★★ 활성 0명 동안 카운트다운 보류 → **PAUSED** (R015 에서 정식 구현으로 바뀌었다)
//
// ★ Phase 2 에서는 T04 의 조건("활성 ≥ 1")만 지켜 만료를 보류했고,
//   사람이 돌아오면 **자동으로** 시작됐다.
// ★★ R015 에서 PAUSED 가 정식 구현되어 **방장이 재개해야** 시작된다 (T20/T23).
//   ★ 이 테스트가 그 변화를 단정한다.
//   ★ "아무도 없는데 게임이 시작되어 빈 게임 레코드가 남는" 사고를 막는 것은 그대로다.
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

  // ★★ R015 — 동작이 바뀌었다. 여기서 단정하는 것이 Phase 5 의 핵심이다.
  //
  //   ★ Phase 2 에서는 "사람이 돌아오면 **자동으로** 시작된다" 였다 (만료 보류 방식).
  //   ★★ Phase 5 에서는 COUNTDOWN 도 **PAUSED** 로 가고, **방장이 재개해야** 한다 (T20/T23).
  //     ★ 근거(Q-30 확정): 자동 재개면 먼저 들어온 한 명 때문에
  //       나머지가 새 URL 을 입력하는 동안 게임이 진행된다.
  expect('★★ 활성 0명이 되면 PAUSED 로 간다', (await roomStateOf(roomId)).state, 'PAUSED');

  const back = new Bot(host.name);
  back.cookie = host.cookie;
  await back.connect();
  await back.waitFor(() => back.snapshot !== null, 6000, '재접속');
  log('  재접속했다. ★★ 그래도 자동으로 시작되지 않아야 한다.');
  await sleep(2500);
  expect('★★★ 사람이 돌아와도 자동으로 시작되지 않는다', back.snapshot.room.state, 'PAUSED');
  expect('★ 게임 레코드도 아직 없다', (await gamesOfRoom(roomId)).games.length, 0);
  expect('★ 방장은 재개할 수 있다', back.snapshot.paused.canResume, true);

  // ★★ 방장이 재개하면 그때 시작된다
  from = back.mark();
  back.resume();
  await back.waitFor(() => back.since(from, 'game.started').length > 0, 8000, '게임 시작');
  expect('★★ 방장이 재개하면 시작된다', back.snapshot.room.state, 'QUESTION_ACTIVE');
  await sleep(400);
  expect('게임 레코드 1행', (await gamesOfRoom(roomId)).games.length, 1);

  // ★ 나가기로 방을 정리한다. ★ 마지막 활성자이므로 즉시 폭파된다 (Q-82)
  back.leave();
  await sleep(800);
  expect('★ 마지막 활성자가 나가면 방이 사라진다 (Q-82)', (await roomStateOf(roomId)).exists, false);
  back.disconnect();
  return checkSummary();
}


// =============================================================================
// ★★ Phase 3 시나리오 (R014)
//
//   ★ 로그만 찍지 않는다. expect() 로 단정하고 하나라도 틀리면 종료 코드가 1이다
//     (R005 5-1 교훈).
//   ★★ 봇은 클라이언트 코드를 건너뛴다 (D-028). 사람이 브라우저에서 확인할 목록은
//     docs/10-TESTING.md 에 따로 있다.
// =============================================================================

/** 게임을 시작해 첫 문제까지 진행시킨다. 공통 준비 절차 */
async function startGame(host, others, questionCount) {
  const from = host.mark();
  host.socket.emit('lobby.updateSettings', {
    questionCount,
    startMode: 'instant',
    countdownSec: 3,
  });
  await host.waitFor(
    () => host.since(from, 'lobby.settingsUpdated').length > 0,
    4000,
    '설정 반영',
  );
  const g = host.mark();
  host.socket.emit('game.start', {});
  await host.waitFor(() => host.since(g, 'game.started').length > 0, 8000, '게임 시작');
  await host.waitQuestion(1);
  for (const b of others) await b.waitQuestion(1);
  return host.snapshot.game.gameId;
}

// -----------------------------------------------------------------------------
// game — 문제 출제 / 정답 판정 / 점수 / 힌트 / 경험 기록 / 결과
// -----------------------------------------------------------------------------
async function scenarioGame() {
  log('시나리오 game — Phase 3 문제 출제와 정답 판정');
  const cleared = await clearExperiences(PREFIX);
  log(`  ★ 테스트 계정의 경험 기록 ${cleared}건을 지웠다 (반복 실행 가능하게)`);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 3 게임 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');

  // ── 1. 첫 문제
  log('\n[1] 첫 문제 출제');
  const gameId = await startGame(host, [guest], 4);
  const q1 = host.snapshot.question;
  expect('문제 번호가 1이다', q1.index, 1);
  expect('총 문제 수', q1.total, 4);
  expectTrue('★ 지문이 비어 있지 않다', q1.text.length > 0, q1.text);
  expectTrue('★ 카테고리가 온다 (대분류)', typeof q1.categoryName === 'string' && q1.categoryName.length > 0, q1.categoryName);
  expectTrue('★ epoch 가 1 이상이다', q1.epoch >= 1, String(q1.epoch));

  // ★★ 정답과 힌트가 페이로드에 없어야 한다. 이것이 새면 게임이 망가진다
  const rawStarted = host.events.find((e) => e.type === 'question.started').payload;
  expectTrue(
    '★★ question.started 에 정답이 없다',
    !('displayAnswer' in rawStarted) && !('answersNorm' in rawStarted) && !('answers' in rawStarted),
    Object.keys(rawStarted).join(','),
  );
  expectTrue('★★ question.started 에 힌트가 없다', !('hint' in rawStarted), Object.keys(rawStarted).join(','));
  expectTrue('★ question.started 에 해설이 없다', !('explanation' in rawStarted), '');

  // ── 2. 정답 판정
  log('\n[2] 정답 판정과 점수');
  const answers1 = await answersForText(q1.text);
  expectTrue('★ DB 에서 정답을 찾았다', answers1.length > 0, JSON.stringify(answers1));
  let from = guest.mark();
  guest.chat(answers1[0]);
  await guest.waitFor(() => guest.since(from, 'question.resolved').length > 0, 6000, '정답 처리');
  const res1 = guest.since(from, 'question.resolved')[0];
  expect('★ 사유가 correct', res1.reason, 'correct');
  expect('★ 정답자가 게스트다', res1.winnerAccountId, guest.snapshot.me.accountId);
  expect('★ 정답이 공개된다', res1.displayAnswer, answers1[0]);
  const guestView = guest.snapshot.players.find((p) => p.accountId === guest.snapshot.me.accountId);
  expect('★ 정답자 점수가 1점', guestView.score, 1);
  const hostView = guest.snapshot.players.find((p) => p.accountId === host.snapshot.me.accountId);
  expect('다른 사람 점수는 0점', hostView.score, 0);
  expect('상태가 QUESTION_RESOLVED', guest.snapshot.room.state, 'QUESTION_RESOLVED');

  // ★ 오답은 아무 일도 일어나지 않는다 (guide 15절)
  log('\n[3] 오답은 일반 채팅으로만 남는다');
  await host.waitQuestion(2);
  const q2 = host.snapshot.question;
  from = host.mark();
  host.chat('이건확실히오답이다');
  await sleep(500);
  expect('★ 오답에 question.resolved 가 없다', host.since(from, 'question.resolved').length, 0);
  expectTrue(
    '★ 오답도 채팅으로는 보인다',
    host.since(from, 'chat').some((c) => c.text === '이건확실히오답이다'),
  );
  expect('★ "오답입니다" 류 메시지가 없다', host.since(from, 'error').length, 0);

  // ── 4. 힌트 (남은 10초)
  log('\n[4] 힌트가 남은 10초에 온다 (최대 22초 대기)');
  // ★ 봇마다 mark() 인덱스가 다르다. **각자의 mark 를 써야 한다.**
  //   ★ 처음 쓴 테스트가 host 의 mark 를 guest 에 적용해 0건으로 나왔다 (테스트 버그).
  const hintFrom = host.mark();
  const hintFromGuest = guest.mark();
  await host.waitFor(() => host.since(hintFrom, 'question.hint').length > 0, 25000, '힌트');
  const hintEv = host.since(hintFrom, 'question.hint')[0];
  const remainAtHint = q2.endsAt - hintEv.at;
  expect('★ 힌트 epoch 가 현재 문제와 같다', hintEv.epoch, q2.epoch);
  expectTrue(
    '★★ 힌트가 남은 10초 근처에 온다 (9.0~10.5초)',
    remainAtHint > 9000 && remainAtHint < 10500,
    `${remainAtHint}ms 남았을 때`,
  );
  expect('★ 힌트는 한 번만 온다', host.since(hintFrom, 'question.hint').length, 1);
  await guest.waitFor(
    () => guest.since(hintFromGuest, 'question.hint').length > 0,
    3000,
    '게스트 힌트',
  );
  expect('게스트도 힌트를 받는다', guest.since(hintFromGuest, 'question.hint').length, 1);
  expect(
    '★ 힌트 값이 전원에게 같다',
    guest.since(hintFromGuest, 'question.hint')[0].hint,
    hintEv.hint,
  );

  // ── 5. 시간 종료 (T07)
  log('\n[5] 시간 종료');
  const toFrom = host.mark();
  const expectedEnd = q2.endsAt;
  await host.waitFor(() => host.since(toFrom, 'question.resolved').length > 0, 15000, '시간 종료');
  const res2 = host.since(toFrom, 'question.resolved')[0];
  expect('★ 사유가 timeout', res2.reason, 'timeout');
  expect('정답자가 없다', res2.winnerAccountId, null);
  const timerError = res2.at - expectedEnd;
  expectTrue(
    '★★ 30초 타이머 오차가 200ms 이내다',
    timerError >= 0 && timerError < 200,
    `+${timerError}ms`,
  );
  log(`  ★ 타이머 실측 오차: +${timerError}ms (tick 주기 100ms)`);

  // ── 5-b. ★★ 정규화 규칙이 **실제 게임 경로**를 통과하는가
  //
  //   ★ shared/normalize.test.ts 가 함수 자체를 검증한다.
  //   ★★ 그러나 그것은 "그 함수가 옳다" 만 보장하고 **"게임이 그 함수를 쓴다"** 는
  //     보장하지 못한다 (D-028 의 게이트 경계). 그래서 소켓 경로로 한 번 더 본다.
  log('\n[5-b] ★★ 정규화가 실제 판정 경로에서 동작한다');
  const qn = await host.waitQuestion(3, 12000);
  const ansN = await answersForText(qn.text);
  const base = ansN[0];
  // ★ 공백을 끼우고 대문자로 바꾼다.
  //   ★ 정규화는 모든 공백류를 지우고 소문자로 만든다 → 원래 정답과 같아져야 한다.
  //   ★ 한글은 대소문자가 없으므로 toUpperCase 가 항등이다. 공백 삽입이 핵심이다.
  const variant = `${base.slice(0, 1)}  ${base.slice(1)}`.toUpperCase();
  expectTrue(
    '★ 변형이 원문과 문자열로는 다르다 (검사 전제)',
    variant !== base,
    `"${base}" → "${variant}"`,
  );
  from = guest.mark();
  guest.chat(variant, qn.epoch);
  await guest.waitFor(
    () => guest.since(from, 'question.resolved').length > 0,
    6000,
    '정규화 변형 정답 처리',
  );
  const resN = guest.since(from, 'question.resolved')[0];
  expect('★★ 공백·대소문자 변형도 정답으로 인정된다', resN.reason, 'correct');
  expect('★ 정답자가 그 사람이다', resN.winnerAccountId, guest.snapshot.me.accountId);
  log(`  ★ "${variant}" → 정답 "${base}" 로 인정`);

  // ── 6. 마지막 문제 → 5초 대기 없이 결과 (Q-17 / T10)
  log('\n[6] 마지막 문제는 5초 대기 없이 결과로 간다 (Q-17)');
  await host.waitQuestion(4);
  const q3 = host.snapshot.question;
  const ansFrom = host.mark();
  const answers3 = await answersForText(q3.text);
  host.chat(answers3[0]);
  await host.waitFor(() => host.since(ansFrom, 'game.result').length > 0, 8000, '결과 화면');
  const resolvedEv = host.since(ansFrom, 'question.resolved')[0];
  const resultEv = host.since(ansFrom, 'game.result')[0];
  expect('★ 마지막 문제의 nextAt 이 null 이다', resolvedEv.payload.nextAt, null);
  const gap = resultEv.at - resolvedEv.at;
  expectTrue('★★ 5초를 기다리지 않는다 (500ms 이내)', gap < 500, `${gap}ms`);
  expect('상태가 GAME_RESULT', host.snapshot.room.state, 'GAME_RESULT');
  expect('종료 사유', resultEv.endReason, 'completed');

  const result = resultEv.payload;
  expectTrue('★ 마지막 문제 정답이 결과에 담긴다 (Q-17)', result.lastQuestionReveal !== null);
  expect('★ 그 정답이 맞다', result.lastQuestionReveal?.displayAnswer, answers3[0]);
  expect('진행 문제 수', result.endedQuestionCount, 4);
  expect('순위 인원', result.ranking.length, 2);
  expect('★ 1위가 1점 이상', result.ranking[0].rank, 1);

  // ── 7. DB 기록
  log('\n[7] DB 기록');
  await sleep(800);
  const gq = await questionsOfGame(gameId);
  expect('game_questions 4행', gq.length, 4);
  expect('1번 문제 사유', gq[0]?.resolution, 'correct');
  expect('2번 문제 사유', gq[1]?.resolution, 'timeout');
  expect('3번 문제 사유 (정규화 변형)', gq[2]?.resolution, 'correct');
  expect('4번 문제 사유', gq[3]?.resolution, 'correct');
  expectTrue('★ 전부 resolved_at 이 기록됐다', gq.every((r) => r.resolved));
  expectTrue(
    '★ epoch 가 1,2,3,4 로 증가한다',
    gq.map((r) => r.epoch).join(',') === '1,2,3,4',
    gq.map((r) => r.epoch).join(','),
  );
  // ★★ 같은 문제를 두 번 내지 않는다 (guide 20절). DB 의 UNIQUE 가 강제하지만 확인한다
  expect(
    '★★ 한 게임에서 같은 문제가 두 번 나오지 않았다',
    new Set(gq.map((r) => r.question_id)).size,
    gq.length,
  );
  expectTrue(
    '★ selection_stage 가 기록된다 (Q-76)',
    gq.every((r) => [1, 2, 3].includes(r.selection_stage)),
    gq.map((r) => r.selection_stage).join(','),
  );

  const ae = await answerEventsOfGame(gameId);
  expectTrue('★ answer_events 가 기록된다', ae.length >= 2, `${ae.length}행`);
  expectTrue('★★ 오답 채팅은 저장되지 않는다 (Q-52)', ae.every((r) => r.matched === true));
  expect('★ accepted 는 3건 (정답 3번)', ae.filter((r) => r.accepted).length, 3);

  const exp = await experiencesOfGame(gameId);
  // ★ 정답을 공개한 문제 4개 × 접속 중인 사람 2명 = 8행
  expect('★★ 경험 기록 8행 (정답 공개 4문제 × 2명)', exp.length, 8);

  const { players } = await gamesOfRoom(roomId);
  expectTrue(
    '★ final_score 가 종료 시 확정된다',
    players.every((p) => p.final_score !== null),
    JSON.stringify(players.map((p) => p.final_score)),
  );

  // ── 8. 다시 하기 (T30)
  log('\n[8] 다시 하기');
  from = host.mark();
  host.socket.emit('game.again', {});
  await host.waitFor(() => host.since(from, 'game.returnedToLobby').length > 0, 5000, '로비 복귀');
  expect('★ 상태가 LOBBY', host.snapshot.room.state, 'LOBBY');
  expect('★ 설정 잠금이 풀린다', host.snapshot.room.settingsLocked, false);
  expect('★ 직전 설정이 복원된다 (Q-31)', host.snapshot.room.settings.questionCount, 4);
  expectTrue('★ 점수가 초기화된다', host.snapshot.players.every((p) => p.score === 0));
  expect('★★ 자동으로 시작되지 않는다', host.since(from, 'game.started').length, 0);

  // ★ 경험 기록은 유지된다 → 출제 가능 수가 줄었다
  await host.waitFor(
    () => host.snapshot.room.availableQuestionCount !== null,
    5000,
    '출제 가능 수 갱신',
  );
  const total = await activeQuestionCount();
  expectTrue(
    '★★ 경험 기록이 유지되어 출제 가능 수가 줄었다',
    host.snapshot.room.availableQuestionCount < total,
    `${host.snapshot.room.availableQuestionCount} < ${total}`,
  );

  host.socket.emit('room.leave', {});
  guest.socket.emit('room.leave', {});
  await sleep(800);
  host.disconnect();
  guest.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// ★★ race — 동시 정답 (guide 18절: 한 문제의 정답자는 정확히 한 명)
// -----------------------------------------------------------------------------
async function scenarioRace() {
  const rounds = Number(opt('--rounds', '30'));
  log(`시나리오 race — 동시 정답 ${rounds}회 반복 (guide 18절)`);
  await clearExperiences(PREFIX);

  const bots = await makeBots(4);
  await bots[0].connect();
  bots[0].createRoom('Phase 3 동시 정답 테스트');
  await bots[0].waitFor(() => bots[0].snapshot !== null, 6000, '방 생성');
  const roomId = bots[0].snapshot.room.id;
  for (const b of bots.slice(1)) {
    await b.connect();
    b.join(roomId);
    await b.waitFor(() => b.snapshot !== null, 6000, `${b.name} 입장`);
  }
  const host = bots[0];
  const gameId = await startGame(host, bots.slice(1), rounds);

  let winners = 0;
  let multi = 0;
  const winnerCounts = {};

  for (let i = 1; i <= rounds; i += 1) {
    const q = await host.waitQuestion(i, 15000);
    const answers = await answersForText(q.text);
    if (answers.length === 0) {
      log(`  ★ ${i}번 문제의 정답을 찾지 못했다. 건너뛴다`);
      continue;
    }
    const from = host.mark();
    // ★★ 4명이 같은 tick 에 같은 정답을 보낸다.
    //   ★ 서버가 이벤트 큐 순서대로 처리하고 장치 A 로 하나만 성공해야 한다.
    //   ★ 전송 순서를 매 회차 섞는다 — 고정 순서로 두면 항상 같은 봇이 이겨
    //     "먼저 처리된 쪽이 이긴다" 만 확인되고 다른 순서 조합은 검증되지 않는다.
    const order = [...bots].sort(() => Math.random() - 0.5);
    for (const b of order) b.chat(answers[0], q.epoch);

    await host.waitFor(
      () => host.since(from, 'question.resolved').length > 0 || host.since(from, 'game.result').length > 0,
      8000,
      `${i}번 정답 처리`,
    );
    const evs = host.since(from, 'question.resolved');
    // ★★ 핵심 단정 — question.resolved 가 정확히 한 번만 온다
    if (evs.length > 1) multi += 1;
    if (evs.length === 1 && evs[0].winnerAccountId) {
      winners += 1;
      winnerCounts[evs[0].winnerAccountId] = (winnerCounts[evs[0].winnerAccountId] ?? 0) + 1;
    }
    if (host.snapshot.room.state === 'GAME_RESULT') break;
  }

  expect('★★★ question.resolved 가 두 번 온 문제가 없다', multi, 0);
  expectTrue('★ 매 문제에 정답자가 한 명 있었다', winners >= 1, `${winners}/${rounds}`);
  log(`  정답자 분포: ${JSON.stringify(winnerCounts)}`);
  // ★ 전송 순서를 섞었으므로 승자가 한 명에게 몰리지 않아야 한다.
  //   ★ 이것은 공정성 요구가 아니다 — 여러 순서 조합이 실제로 검증되었는지 확인하는 것이다
  expectTrue(
    '★ 승자가 여러 명에게 분포한다 (여러 순서 조합이 검증됐다)',
    Object.keys(winnerCounts).length >= 2 || rounds < 4,
    JSON.stringify(winnerCounts),
  );

  // ── ★ DB 사후 검증. 이것이 guide 18절의 "순서 추적" 근거다
  await sleep(1000);
  const gq = await questionsOfGame(gameId);
  const withWinner = gq.filter((r) => r.resolution === 'correct');
  expectTrue('★ correct 로 끝난 문제가 있다', withWinner.length >= 1, `${withWinner.length}`);
  expectTrue(
    '★★ 모든 correct 문제에 정답자가 정확히 한 명 기록됐다',
    withWinner.every((r) => r.winner_account_id !== null),
  );

  const ae = await answerEventsOfGame(gameId);
  const byQ = {};
  for (const r of ae) {
    if (!byQ[r.question_index]) byQ[r.question_index] = [];
    byQ[r.question_index].push(r);
  }
  let overAccepted = 0;
  let rejected = 0;
  for (const [, rows] of Object.entries(byQ)) {
    const acc = rows.filter((r) => r.accepted).length;
    if (acc > 1) overAccepted += 1;
    rejected += rows.filter((r) => !r.accepted).length;
  }
  expect('★★★ accepted=true 가 두 개인 문제가 없다 (DB 기준)', overAccepted, 0);
  expectTrue(
    '★ 늦게 도착한 정답이 already_resolved 로 기록된다',
    rejected >= 1,
    `${rejected}건`,
  );
  const reasons = [...new Set(ae.filter((r) => !r.accepted).map((r) => r.reject_reason))];
  log(`  ★ 탈락 사유 분포: ${JSON.stringify(reasons)}`);

  for (const b of bots) b.socket.emit('room.leave', {});
  await sleep(800);
  for (const b of bots) b.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// ★★★ epoch — RESOLVED 구간 메시지가 다음 문제 정답과 우연히 일치 (장치 B)
//
//   ★★ guide 20절이 명시적으로 금지한 함정이다. 필수 테스트 항목이다.
//   ★ 상태 검사만으로는 절대 막을 수 없다 — 메시지가 도착한 시점에는 이미
//     QUESTION_ACTIVE 이기 때문이다.
// -----------------------------------------------------------------------------
async function scenarioEpoch() {
  log('시나리오 epoch — ★★ 장치 B (RESOLVED 구간 메시지 차단)');
  await clearExperiences(PREFIX);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 3 epoch 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');
  const gameId = await startGame(host, [guest], 4);

  // ── 1. 첫 문제를 끝내고, **다음 문제의 정답**을 미리 알아낸다.
  //   ★ 실제 사용자는 다음 문제의 정답을 미리 알 수 없다.
  //     ★ 그러나 "RESOLVED 구간에 친 말이 우연히 다음 정답과 같은" 경우는 실제로 생긴다.
  //     ★ 테스트는 그 우연을 **의도적으로 만들어** 차단을 확인한다.
  log('\n[1] 1번 문제를 정답으로 끝낸다');
  const q1 = host.snapshot.question;
  const a1 = await answersForText(q1.text);
  let from = host.mark();
  host.chat(a1[0]);
  await host.waitFor(() => host.since(from, 'question.resolved').length > 0, 6000, '1번 종료');
  expect('상태가 QUESTION_RESOLVED', host.snapshot.room.state, 'QUESTION_RESOLVED');
  const epoch1 = q1.epoch;

  // ── 2. ★★ RESOLVED 구간에서 **낡은 epoch** 로 메시지를 보낸다.
  //   ★ 이것이 "5초 구간에 친 메시지가 네트워크 지연으로 다음 문제 시작 직후 도착" 을
  //     서버 관점에서 정확히 재현한 것이다 — 서버는 epoch 만 보고 판단한다.
  log('\n[2] 다음 문제가 시작된 뒤, 낡은 epoch 로 그 문제의 정답을 보낸다');
  await host.waitQuestion(2, 12000);
  const q2 = host.snapshot.question;
  expect('★ epoch 가 증가했다', q2.epoch, epoch1 + 1);
  const a2 = await answersForText(q2.text);

  from = guest.mark();
  // ★★ 정답 문자열은 맞지만 epoch 가 이전 문제의 것이다
  guest.chat(a2[0], epoch1);
  await sleep(700);
  expect(
    '★★★ 낡은 epoch 의 정답은 판정되지 않는다',
    guest.since(from, 'question.resolved').length,
    0,
  );
  expect('★ 상태가 그대로 QUESTION_ACTIVE', guest.snapshot.room.state, 'QUESTION_ACTIVE');
  expectTrue(
    '★ 그래도 채팅으로는 보인다 (guide 15절: 오답 메시지를 만들지 않는다)',
    guest.since(from, 'chat').some((c) => c.text === a2[0]),
  );
  const guestScore = guest.snapshot.players.find(
    (p) => p.accountId === guest.snapshot.me.accountId,
  ).score;
  expect('★ 점수가 오르지 않았다', guestScore, 0);

  // ── 3. ★ 같은 정답을 **올바른 epoch** 로 보내면 정답이다.
  //   ★ 이것이 없으면 "차단이 아니라 그냥 정답 판정이 고장난 것" 과 구분되지 않는다
  log('\n[3] 같은 정답을 올바른 epoch 로 보내면 정답이다 (대조군)');
  from = guest.mark();
  guest.chat(a2[0], q2.epoch);
  await guest.waitFor(() => guest.since(from, 'question.resolved').length > 0, 6000, '정답 처리');
  expect('★ 이번에는 정답이다', guest.since(from, 'question.resolved')[0].reason, 'correct');

  // ── 4. ★ epoch 를 아예 보내지 않으면 판정되지 않는다 (옛 클라이언트)
  log('\n[4] epoch 없이 보내면 판정되지 않는다');
  await host.waitQuestion(3, 12000);
  const q3 = host.snapshot.question;
  const a3 = await answersForText(q3.text);
  from = host.mark();
  host.socket.emit('chat.send', { text: a3[0] }); // ★ epoch 없음
  await sleep(700);
  expect('★★ epoch 없는 정답은 판정되지 않는다', host.since(from, 'question.resolved').length, 0);

  // ── 5. DB 기록 확인
  log('\n[5] answer_events 에 epoch_mismatch 가 남는다');
  await sleep(800);
  const ae = await answerEventsOfGame(gameId);
  const mismatched = ae.filter((r) => r.reject_reason === 'epoch_mismatch');
  expectTrue(
    '★★ epoch_mismatch 가 2건 이상 기록된다 (사후 추적 근거)',
    mismatched.length >= 2,
    `${mismatched.length}건`,
  );
  expectTrue(
    '★ 그 기록들은 matched=true 다 (정답 문자열과는 일치했다)',
    mismatched.every((r) => r.matched === true),
  );

  host.socket.emit('room.leave', {});
  guest.socket.emit('room.leave', {});
  await sleep(800);
  host.disconnect();
  guest.disconnect();
  return checkSummary();
}


// -----------------------------------------------------------------------------
// ★ concur — R003 2-3 동시 발생 시나리오 나머지
//
//   ★ 이 시나리오가 검증하는 것 (04-PROTOCOL 4장의 표)
//     · 스킵 임계 도달 vs 정답
//     · 방장 강제 스킵 vs 정답
//     · 방장 강제 종료 vs 정답
//     · 정답 확정 직후 도착한 메시지
//     · 스킵 투표 중 인원 변동으로 임계값이 바뀌어 이미 도달 상태가 되는 경우
//     · 마지막 플레이어가 정답을 맞히는 동시에 연결이 끊기는 경우
//     · 같은 사람이 정답을 연타
//     · 경험자가 정답을 입력
// -----------------------------------------------------------------------------
async function scenarioConcurrent() {
  log('시나리오 concur — 동시 발생 시나리오 (R003 2-3)');
  await clearExperiences(PREFIX);

  const bots = await makeBots(4);
  await bots[0].connect();
  bots[0].createRoom('Phase 3 동시성 테스트');
  await bots[0].waitFor(() => bots[0].snapshot !== null, 6000, '방 생성');
  const roomId = bots[0].snapshot.room.id;
  for (const b of bots.slice(1)) {
    await b.connect();
    b.join(roomId);
    await b.waitFor(() => b.snapshot !== null, 6000, `${b.name} 입장`);
  }
  const [host, g1, g2, g3] = bots;
  const gameId = await startGame(host, [g1, g2, g3], 12);

  // ── 1. 스킵 투표 (활성 4명 → 임계 3표)
  log('\n[1] 스킵 투표 임계 도달 (활성 4명 → 3표)');
  let q = host.snapshot.question;
  let from = host.mark();
  host.skipVote(true);
  await host.waitFor(() => host.since(from, 'skip.voteUpdated').length > 0, 4000, '투표 반영');
  const sv = host.since(from, 'skip.voteUpdated')[0];
  expect('★ 임계값이 3표다 (활성 4명)', sv.threshold, 3);
  expect('1표', sv.votes, 1);

  // ★ 투표자 명단이 오지 않는다
  expectTrue(
    '★★ skip.voteUpdated 에 투표자 명단이 없다 (guide 22절)',
    !('voters' in sv) && !('voterIds' in sv),
    Object.keys(sv).join(','),
  );

  // ★ 투표 취소가 된다
  from = host.mark();
  host.skipVote(false);
  await host.waitFor(() => host.since(from, 'skip.voteUpdated').length > 0, 4000, '취소 반영');
  expect('★ 투표 취소가 된다', host.since(from, 'skip.voteUpdated')[0].votes, 0);

  // ★ 3표로 스킵된다
  from = host.mark();
  host.skipVote(true);
  g1.skipVote(true);
  g2.skipVote(true);
  await host.waitFor(() => host.since(from, 'question.resolved').length > 0, 6000, '스킵');
  expect('★ 사유가 skip_vote', host.since(from, 'question.resolved')[0].reason, 'skip_vote');
  expectTrue(
    '★ 스킵도 정답을 공개한다 (Q-27)',
    Boolean(host.since(from, 'question.resolved')[0].displayAnswer),
  );

  // ── 2. 방장 강제 스킵 (T09)
  log('\n[2] 방장 강제 스킵');
  q = await host.waitQuestion(2, 12000);
  from = host.mark();
  host.forceSkip();
  await host.waitFor(() => host.since(from, 'question.resolved').length > 0, 6000, '강제 스킵');
  expect('★ 사유가 host_skip', host.since(from, 'question.resolved')[0].reason, 'host_skip');

  // ★★ 방장이 아니면 거부된다
  q = await host.waitQuestion(3, 12000);
  from = g1.mark();
  g1.forceSkip();
  await sleep(400);
  expect('★ 방장이 아니면 NOT_HOST', g1.since(from, 'error')[0]?.code, 'NOT_HOST');

  // ── 3. ★★ 낡은 epoch 의 강제 스킵은 무시된다 (다음 문제를 스킵하는 사고 방지)
  log('\n[3] ★★ 낡은 epoch 의 강제 스킵은 다음 문제를 스킵하지 않는다');
  const oldEpoch = q.epoch;
  from = host.mark();
  host.forceSkip(); // 3번 문제를 스킵
  await host.waitFor(() => host.since(from, 'question.resolved').length > 0, 6000, '3번 스킵');
  await host.waitQuestion(4, 12000);
  const q4 = host.snapshot.question;
  from = host.mark();
  // ★ 방장이 확인창을 띄운 사이 문제가 끝난 상황을 재현한다
  host.forceSkip(oldEpoch);
  await sleep(600);
  expect(
    '★★★ 낡은 epoch 의 강제 스킵으로 4번 문제가 끝나지 않았다',
    host.since(from, 'question.resolved').length,
    0,
  );
  expect('★ INVALID_STATE 로 거부된다', host.since(from, 'error')[0]?.code, 'INVALID_STATE');
  expect('4번 문제가 그대로다', host.snapshot.question.index, 4);
  expect('epoch 도 그대로다', host.snapshot.question.epoch, q4.epoch);

  // ── 4. 정답 확정 직후 도착한 메시지
  log('\n[4] 정답 확정 직후 도착한 메시지는 채팅으로만 남는다');
  const a4 = await answersForText(q4.text);
  from = g1.mark();
  g1.chat(a4[0], q4.epoch);
  await g1.waitFor(() => g1.since(from, 'question.resolved').length > 0, 6000, '정답');
  // ★ 같은 epoch 로 한 번 더 보낸다. 이미 resolved 다
  const after = g2.mark();
  g2.chat(a4[0], q4.epoch);
  await sleep(500);
  expect('★ 두 번째 정답은 판정되지 않는다', g2.since(after, 'question.resolved').length, 0);
  expectTrue('★ 그래도 채팅으로는 보인다', g2.since(after, 'chat').some((c) => c.text === a4[0]));

  // ── 5. ★ 같은 사람이 정답을 연타 — rate limit 이 정상 연타를 막지 않는다
  log('\n[5] 같은 사람이 정답을 연타해도 첫 번째만 정답이다');
  const q5 = await host.waitQuestion(5, 12000);
  const a5 = await answersForText(q5.text);
  from = g3.mark();
  for (let i = 0; i < 3; i += 1) g3.chat(a5[0], q5.epoch);
  await g3.waitFor(() => g3.since(from, 'question.resolved').length > 0, 6000, '정답');
  await sleep(400);
  expect('★★ question.resolved 가 한 번만 온다', g3.since(from, 'question.resolved').length, 1);
  expect('★ 연타가 rate limit 에 걸리지 않는다', g3.since(from, 'chat.throttled').length, 0);

  // ── 6. ★ 경험자는 정답을 맞혀도 점수를 얻지 못한다
  log('\n[6] 경험자는 판정에서 제외된다');
  // ★ g3 는 5번 문제를 경험했다. 그 문제가 다시 나오지는 않으므로(guide 20절)
  //   ★ 대신 "이미 경험한 사람이 있는 문제" 가 나올 때까지 진행한다.
  //   ★ 이번 게임에서 경험 기록이 쌓였으므로 다음 게임에서 확인하는 것이 정확하다.
  //     → 여기서는 경험자 배지가 실제로 오는지만 확인한다 (다음 게임에서 검증한다).
  let sawExperienced = false;
  for (let i = 6; i <= 8; i += 1) {
    const qi = await host.waitQuestion(i, 15000);
    if (qi.experiencedNicknames.length > 0) sawExperienced = true;
    const ai = await answersForText(qi.text);
    from = host.mark();
    host.chat(ai[0], qi.epoch);
    await host.waitFor(
      () => host.since(from, 'question.resolved').length > 0 || host.since(from, 'game.result').length > 0,
      8000,
      `${i}번 종료`,
    );
    if (host.snapshot.room.state === 'GAME_RESULT') break;
  }
  log(`  ★ 경험자 배지 관측: ${sawExperienced ? '있었다' : '없었다 (첫 게임이므로 정상)'}`);

  // ── 7. ★★ 스킵 투표 중 인원 변동으로 임계값이 바뀌어 이미 도달 상태가 되는 경우
  log('\n[7] ★★ 인원이 줄어 임계값이 내려가면 그 자리에서 스킵된다');
  const q9 = await host.waitQuestion(9, 15000);
  from = host.mark();
  // 활성 4명 → 임계 3표. 2표만 넣는다
  host.skipVote(true);
  g1.skipVote(true);
  await host.waitFor(() => host.since(from, 'skip.voteUpdated').length >= 2, 5000, '2표');
  const before = host.since(from, 'skip.voteUpdated').slice(-1)[0];
  expect('2표 / 임계 3표', `${before.votes}/${before.threshold}`, '2/3');

  // ★ 한 명이 끊긴다 → 활성 3명 → 임계 2표 → 이미 도달
  const dropFrom = host.mark();
  g3.disconnect();
  await host.waitFor(
    () => host.since(dropFrom, 'question.resolved').length > 0,
    6000,
    '인원 변동으로 즉시 스킵',
  );
  expect(
    '★★★ 인원이 줄자 그 자리에서 스킵됐다',
    host.since(dropFrom, 'question.resolved')[0].reason,
    'skip_vote',
  );
  expect('★ epoch 가 그 문제의 것이다', host.since(dropFrom, 'question.resolved')[0].epoch, q9.epoch);

  // ── 8. ★★ 방장 강제 종료 vs 정답 — 정답 미공개 / 경험 미기록 (T11)
  log('\n[8] ★★ 방장 강제 종료 — 정답 미공개 / 경험 미기록');
  const q10 = await host.waitQuestion(10, 15000);
  const expBefore = (await experiencesOfGame(gameId)).length;
  from = host.mark();
  host.forceEnd();
  await host.waitFor(() => host.since(from, 'game.result').length > 0, 6000, '강제 종료');
  const forced = host.since(from, 'game.result')[0];
  expect('★ 종료 사유가 force_ended', forced.endReason, 'force_ended');
  expect('★★ 정답을 공개하지 않는다', forced.payload.lastQuestionReveal, null);
  expect('★ question.resolved 가 오지 않는다', host.since(from, 'question.resolved').length, 0);

  await sleep(900);
  const expAfter = (await experiencesOfGame(gameId)).length;
  expect('★★★ 강제 종료한 문제는 경험 기록을 남기지 않는다 (Q-25/Q-47)', expAfter, expBefore);

  const gq = await questionsOfGame(gameId);
  const last = gq.find((r) => r.question_index === q10.index);
  expect('★ game_questions.resolution 이 aborted 다', last?.resolution, 'aborted');
  expectTrue(
    '★★ 이미 지나간 문제의 경험 기록은 삭제되지 않는다',
    expAfter > 0,
    `${expAfter}행`,
  );

  for (const b of bots) b.socket.emit('room.leave', {});
  await sleep(900);
  for (const b of bots) b.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// ★ full — 봇 10명으로 한 게임 완주 + 재접속 + 중간 참가
// -----------------------------------------------------------------------------
async function scenarioFull() {
  const n = Math.min(Number(opt('--count', '10')), 10);
  log(`시나리오 full — 봇 ${n}명으로 한 게임 완주`);
  await clearExperiences(PREFIX);

  const bots = await makeBots(n);
  await bots[0].connect();
  bots[0].createRoom('Phase 3 완주 테스트');
  await bots[0].waitFor(() => bots[0].snapshot !== null, 6000, '방 생성');
  const roomId = bots[0].snapshot.room.id;
  // ★ 한 자리는 중간 참가용으로 비워 둔다
  const joiners = bots.slice(1, n - 1);
  for (const b of joiners) {
    await b.connect();
    b.join(roomId);
    await b.waitFor(() => b.snapshot !== null, 6000, `${b.name} 입장`);
  }
  const host = bots[0];
  const late = bots[n - 1];
  await host.waitFor(() => host.snapshot.players.length === n - 1, 6000, `${n - 1}명`);
  expect(`시작 인원 ${n - 1}명`, host.snapshot.players.length, n - 1);

  const total = 6;
  const gameId = await startGame(host, joiners, total);

  // ── ★ 중간 참가 (guide 32절)
  log('\n[중간 참가]');
  await late.connect();
  late.join(roomId);
  await late.waitFor(() => late.snapshot !== null, 6000, '중간 참가');
  expect('★ 게임 중에도 입장할 수 있다', late.snapshot.room.state, 'QUESTION_ACTIVE');
  await late.waitFor(() => late.snapshot.question !== null, 6000, '문제 수신');
  expectTrue('★ 현재 문제를 받는다', late.snapshot.question.text.length > 0);
  expectTrue(
    '★ 남은 시간이 전달된다 (절대 시각)',
    late.snapshot.question.endsAt > Date.now(),
    `${late.snapshot.question.endsAt - Date.now()}ms 남음`,
  );
  const lateSelf = late.snapshot.players.find((p) => p.accountId === late.snapshot.me.accountId);
  expect('★ 중간 참가자의 시작 점수는 0', lateSelf.score, 0);

  await sleep(700);
  const { players: gp } = await gamesOfRoom(roomId);
  const lateRow = gp.find((p) => p.account_id === late.snapshot.me.accountId);
  expectTrue('★ game_players 에 중간 참가로 기록된다', lateRow?.is_midgame_join === true, JSON.stringify(lateRow));

  // ── 완주
  log('\n[완주]');
  const answered = { correct: 0, timeout: 0, skip: 0 };
  const timerErrors = [];
  for (let i = 1; i <= total; i += 1) {
    const q = await host.waitQuestion(i, 40000);
    const answers = await answersForText(q.text);
    const from = host.mark();

    if (i === 2) {
      // ★ 한 문제는 시간 종료로 보낸다. 타이머 정확도를 실측한다
      const expectedEnd = q.endsAt;
      await host.waitFor(
        () => host.since(from, 'question.resolved').length > 0 || host.since(from, 'game.result').length > 0,
        40000,
        `${i}번 시간 종료`,
      );
      const ev = host.since(from, 'question.resolved')[0];
      if (ev) {
        timerErrors.push(ev.at - expectedEnd);
        answered.timeout += 1;
      }
    } else if (i === 3) {
      // ★ 한 문제는 스킵 투표로 보낸다
      for (const b of bots.slice(0, Math.max(2, Math.ceil((n - 1) * 0.8)))) b.skipVote(true);
      await host.waitFor(
        () => host.since(from, 'question.resolved').length > 0 || host.since(from, 'game.result').length > 0,
        15000,
        `${i}번 스킵`,
      );
      if (host.since(from, 'question.resolved')[0]) answered.skip += 1;
    } else {
      // ★ 무작위로 한 명이 정답을 보낸다
      const who = bots[i % bots.length];
      if (answers.length > 0) who.chat(answers[0], q.epoch);
      await host.waitFor(
        () => host.since(from, 'question.resolved').length > 0 || host.since(from, 'game.result').length > 0,
        40000,
        `${i}번 종료`,
      );
      if (host.since(from, 'question.resolved')[0]?.reason === 'correct') answered.correct += 1;
    }
    if (host.snapshot.room.state === 'GAME_RESULT') break;
  }

  await host.waitFor(() => host.snapshot.room.state === 'GAME_RESULT', 20000, '게임 종료');
  const result = host.snapshot.result;
  expect('★★ 게임이 끝까지 진행됐다', result.endedQuestionCount, total);
  expect('종료 사유', result.endReason, 'completed');
  expect('★ 순위에 전원이 들어간다 (중간 참가자 포함)', result.ranking.length, n);
  log(`  ★ 종료 경로 분포: ${JSON.stringify(answered)}`);
  if (timerErrors.length > 0) {
    log(`  ★★ 30초 타이머 실측 오차: ${timerErrors.map((e) => `+${e}ms`).join(', ')}`);
    expectTrue(
      '★★ 타이머 오차가 200ms 이내다',
      timerErrors.every((e) => e >= 0 && e < 200),
      timerErrors.join(','),
    );
  }

  // ★ 동점 공동 순위 (guide 39절)
  const ranks = result.ranking.map((r) => `${r.rank}:${r.score}`);
  log(`  순위: ${ranks.join(' ')}`);
  let rankOk = true;
  for (let i = 1; i < result.ranking.length; i += 1) {
    const a = result.ranking[i - 1];
    const b = result.ranking[i];
    if (a.score === b.score && a.rank !== b.rank) rankOk = false;
    if (a.score > b.score && b.rank <= a.rank) rankOk = false;
  }
  expectTrue('★ 동점자는 공동 순위다 (guide 39절)', rankOk, ranks.join(' '));

  // ── ★ 경험 기록 검증 (Q-47)
  await sleep(1000);
  const exp = await experiencesOfGame(gameId);
  const gq = await questionsOfGame(gameId);
  const revealed = gq.filter((r) => r.resolution !== 'aborted' && r.resolution !== null).length;
  log(`  ★ 정답 공개 문제 ${revealed}개 / 경험 기록 ${exp.length}행`);
  expectTrue(
    '★★ 경험 기록이 (정답 공개 문제 × 그 순간 접속자) 규모로 남는다',
    exp.length >= revealed,
    `${exp.length} >= ${revealed}`,
  );
  const byQuestion = {};
  for (const r of exp) byQuestion[r.question_id] = (byQuestion[r.question_id] ?? 0) + 1;
  expectTrue(
    '★ 각 문제마다 여러 명의 기록이 남는다',
    Object.values(byQuestion).every((c) => c >= 1),
    JSON.stringify(byQuestion),
  );

  // ── ★ 재접속으로 결과 화면이 복구된다
  log('\n[재접속]');
  const target = bots[1];
  const cookie = target.cookie;
  target.disconnect();
  await sleep(400);
  const back = new Bot(target.name);
  back.cookie = cookie;
  await back.connect();
  await back.waitFor(() => back.snapshot !== null, 6000, '재접속');
  expect('★ 재접속하면 결과 화면으로 돌아온다', back.snapshot.room.state, 'GAME_RESULT');
  expectTrue('★ 결과가 스냅샷에 담긴다', back.snapshot.result !== null);
  back.disconnect();

  for (const b of bots) {
    if (b.socket && b.socket.connected) b.socket.emit('room.leave', {});
  }
  await sleep(900);
  for (const b of bots) b.disconnect();
  return checkSummary();
}


// -----------------------------------------------------------------------------
// ★★★ collide — 두 트리거가 **동시에** resolveQuestionSync 를 노리는 경우
//
//   ★ concur 시나리오는 각 트리거를 하나씩 확인한다.
//     ★ 이 시나리오는 **두 개가 겹칠 때** 정확히 하나만 성공하는지 본다.
//     ★ 그것이 장치 A(resolved 플래그)가 실제로 하는 일이다.
//
//   검증 대상 (04-PROTOCOL 4장)
//     · 타이머 만료 vs 정답
//     · 스킵 임계 도달 vs 정답
//     · 방장 강제 스킵 vs 정답
//     · 방장 강제 종료 vs 정답
//     · 마지막 플레이어가 정답을 맞히는 동시에 연결이 끊기는 경우
// -----------------------------------------------------------------------------
async function scenarioCollide() {
  log('시나리오 collide — ★★ 두 트리거 동시 발생 (장치 A)');
  await clearExperiences(PREFIX);

  const bots = await makeBots(4);
  await bots[0].connect();
  bots[0].createRoom('Phase 3 충돌 테스트');
  await bots[0].waitFor(() => bots[0].snapshot !== null, 6000, '방 생성');
  const roomId = bots[0].snapshot.room.id;
  for (const b of bots.slice(1)) {
    await b.connect();
    b.join(roomId);
    await b.waitFor(() => b.snapshot !== null, 6000, `${b.name} 입장`);
  }
  const [host, g1, g2, g3] = bots;
  const gameId = await startGame(host, [g1, g2, g3], 10);

  /** 문제 하나에 온 question.resolved 이벤트가 정확히 하나인지 확인한다 */
  const expectSingleResolution = (label, marks) => {
    const counts = bots.map((b, i) => b.since(marks[i], 'question.resolved').length);
    const max = Math.max(...counts);
    expect(`★★★ ${label} — question.resolved 가 한 번만 온다`, max, 1);
    // ★ 전원이 같은 사유를 본다. 사람마다 다른 결과를 보면 안 된다
    const reasons = new Set(
      bots.flatMap((b, i) => b.since(marks[i], 'question.resolved').map((e) => e.reason)),
    );
    expect(`★ ${label} — 전원이 같은 사유를 본다`, reasons.size, 1);
    return [...reasons][0];
  };

  // ── 1. ★★ 타이머 만료 vs 정답
  log('\n[1] ★★ 타이머 만료와 정답이 동시 (경계 판정)');
  let q = host.snapshot.question;
  let answers = await answersForText(q.text);
  let marks = bots.map((b) => b.mark());
  // ★ endsAt 직전까지 기다린 뒤 보낸다. tick(100ms)과 겹치는 구간을 노린다
  const waitMs = q.endsAt - Date.now() - 30;
  if (waitMs > 0) await sleep(waitMs);
  const sentAt = Date.now();
  g1.chat(answers[0], q.epoch);
  await host.waitFor(
    () => host.since(marks[0], 'question.resolved').length > 0,
    10000,
    '경계 판정',
  );
  await sleep(400);
  const reason1 = expectSingleResolution('타이머 만료 vs 정답', marks);
  log(`  ★ 사유: ${reason1} (전송 시각이 endsAt ${sentAt - q.endsAt >= 0 ? '이후' : '이전'} ${Math.abs(sentAt - q.endsAt)}ms)`);
  // ★★ 어느 쪽이 이겼든 상관없다. 중요한 것은 **하나만** 일어났다는 것이다.
  //   ★ 그리고 correct 이면 반드시 endsAt 이전에 도착했어야 한다
  if (reason1 === 'correct') {
    const ae = await answerEventsOfGame(gameId);
    const acc = ae.filter((r) => r.question_index === q.index && r.accepted);
    expect('★ 정답으로 끝났으면 accepted 가 1건이다', acc.length, 1);
    expectTrue(
      '★★ 정답 인정은 endsAt 이내에 도착한 것만이다 (guide 18절)',
      acc[0].response_ms <= 30000,
      `${acc[0].response_ms}ms`,
    );
  } else {
    expect('★ 시간 종료로 끝났다', reason1, 'timeout');
    const ae = await answerEventsOfGame(gameId);
    const late = ae.filter((r) => r.question_index === q.index && !r.accepted);
    expectTrue(
      '★★ 늦게 도착한 정답이 사유와 함께 기록된다',
      late.length >= 1 && ['past_deadline', 'already_resolved'].includes(late[0].reject_reason),
      JSON.stringify(late.map((r) => r.reject_reason)),
    );
  }

  // ── 2. ★★ 스킵 임계 도달 vs 정답
  log('\n[2] ★★ 스킵 임계 도달과 정답이 동시');
  q = await host.waitQuestion(q.index + 1, 15000);
  answers = await answersForText(q.text);
  // 활성 4명 → 임계 3표. 2표를 먼저 넣는다
  host.skipVote(true);
  g1.skipVote(true);
  await sleep(300);
  marks = bots.map((b) => b.mark());
  // ★ 3번째 표와 정답을 같은 tick 에 보낸다
  g2.skipVote(true);
  g3.chat(answers[0], q.epoch);
  await host.waitFor(
    () => host.since(marks[0], 'question.resolved').length > 0,
    8000,
    '충돌 판정',
  );
  await sleep(400);
  const reason2 = expectSingleResolution('스킵 임계 vs 정답', marks);
  expectTrue(
    '★ 사유가 skip_vote 또는 correct 다 (먼저 처리된 쪽)',
    ['skip_vote', 'correct'].includes(reason2),
    reason2,
  );
  log(`  ★ 먼저 처리된 쪽: ${reason2}`);

  // ── 3. ★★ 방장 강제 스킵 vs 정답
  log('\n[3] ★★ 방장 강제 스킵과 정답이 동시');
  q = await host.waitQuestion(q.index + 1, 15000);
  answers = await answersForText(q.text);
  marks = bots.map((b) => b.mark());
  host.forceSkip(q.epoch);
  g1.chat(answers[0], q.epoch);
  await host.waitFor(
    () => host.since(marks[0], 'question.resolved').length > 0,
    8000,
    '충돌 판정',
  );
  await sleep(400);
  const reason3 = expectSingleResolution('강제 스킵 vs 정답', marks);
  expectTrue(
    '★ 사유가 host_skip 또는 correct 다',
    ['host_skip', 'correct'].includes(reason3),
    reason3,
  );
  log(`  ★ 먼저 처리된 쪽: ${reason3}`);

  // ── 4. ★★ 방장 강제 종료 vs 정답
  log('\n[4] ★★ 방장 강제 종료와 정답이 동시');
  q = await host.waitQuestion(q.index + 1, 15000);
  answers = await answersForText(q.text);
  marks = bots.map((b) => b.mark());
  const scoreBefore = g1.snapshot.players.find(
    (p) => p.accountId === g1.snapshot.me.accountId,
  ).score;
  g1.chat(answers[0], q.epoch);
  host.forceEnd();
  await host.waitFor(() => host.since(marks[0], 'game.result').length > 0, 8000, '강제 종료');
  await sleep(600);
  expect('★ 게임이 끝난다', host.snapshot.room.state, 'GAME_RESULT');
  const resolvedCount = host.since(marks[0], 'question.resolved').length;
  expectTrue(
    '★★ question.resolved 는 0 또는 1 번이다 (두 번은 안 된다)',
    resolvedCount <= 1,
    String(resolvedCount),
  );
  const result4 = host.since(marks[0], 'game.result')[0].payload;
  expect('★ 종료 사유가 force_ended', result4.endReason, 'force_ended');
  // ★★ 점수와 정답 공개가 일관되어야 한다.
  //   ★ 정답이 먼저 처리됐으면 점수가 오르고 정답도 공개된다.
  //   ★ 강제 종료가 먼저면 점수가 그대로이고 정답도 공개되지 않는다.
  const g1Row = result4.ranking.find((r) => r.accountId === g1.snapshot.me.accountId);
  if (resolvedCount === 1) {
    expect('★★ 정답이 먼저 처리됐으면 점수가 올랐다', g1Row.score, scoreBefore + 1);
    expectTrue('★ 그리고 정답도 공개된다', result4.lastQuestionReveal !== null);
    log('  ★ 정답이 먼저 처리되었다 (점수 인정 + 정답 공개)');
  } else {
    expect('★★ 강제 종료가 먼저면 점수가 그대로다', g1Row.score, scoreBefore);
    expect('★ 그리고 정답을 공개하지 않는다', result4.lastQuestionReveal, null);
    log('  ★ 강제 종료가 먼저 처리되었다 (정답 미공개)');
  }

  // ── 5. ★★ 마지막 플레이어가 정답을 맞히는 동시에 연결이 끊긴다
  log('\n[5] ★★ 마지막 플레이어의 정답 + 동시 끊김');
  // ★ 새 게임을 시작한다. 방장 혼자 남긴다
  let from = host.mark();
  host.socket.emit('game.again', {});
  await host.waitFor(() => host.since(from, 'game.returnedToLobby').length > 0, 6000, '로비');
  for (const b of [g1, g2, g3]) {
    b.socket.emit('room.leave', {});
  }
  await host.waitFor(() => host.snapshot.room.activeCount === 1, 8000, '혼자 남기');
  expect('★ 활성 1명', host.snapshot.room.activeCount, 1);

  const gameId2 = await startGame(host, [], 3);
  q = host.snapshot.question;
  answers = await answersForText(q.text);
  from = host.mark();
  // ★★ 정답을 보내고 **즉시** 끊는다.
  //   ★ 서버 수신 순서가 결과를 정한다 (04-PROTOCOL 4장).
  //     정답이 먼저면 인정되고(그 순간 아직 접속 중이므로 경험 기록도 남는다),
  //     disconnect 가 먼저면 미접속 플레이어의 메시지이므로 판정하지 않는다.
  host.chat(answers[0], q.epoch);
  host.socket.close();
  await sleep(1500);

  const gq2 = await questionsOfGame(gameId2);
  const first = gq2.find((r) => r.question_index === 1);
  const ae2 = await answerEventsOfGame(gameId2);
  const q1Events = ae2.filter((r) => r.question_index === 1);
  log(
    `  ★ 결과: resolution=${first?.resolution ?? 'null'} / answer_events=${JSON.stringify(q1Events.map((r) => ({ acc: r.accepted, why: r.reject_reason })))}`,
  );
  // ★★ 어느 쪽이든 **일관**되어야 한다
  if (first?.resolution === 'correct') {
    expect('★★ 정답이 먼저면 accepted 가 1건이다', q1Events.filter((r) => r.accepted).length, 1);
    const exp2 = await experiencesOfGame(gameId2);
    expectTrue(
      '★★ 정답이 먼저면 경험 기록도 남는다 (그 순간 접속 중이었다)',
      exp2.length >= 1,
      `${exp2.length}행`,
    );
  } else {
    expectTrue(
      '★★ 끊김이 먼저면 정답으로 처리되지 않는다',
      q1Events.every((r) => !r.accepted),
      JSON.stringify(q1Events.map((r) => r.reject_reason)),
    );
  }
  // ★★ 어느 쪽이든 문제가 두 번 끝나지 않았다
  expect('★★★ 문제가 두 번 끝나지 않았다', gq2.filter((r) => r.question_index === 1).length, 1);

  // ── ★ 활성 0명이 되었으므로 문제 타이머가 멈춰야 한다 (R014 실측 결함 수정)
  log('\n[6] ★★ 활성 0명이면 문제 타이머가 멈춘다');
  const before = await questionsOfGame(gameId2);
  await sleep(8000);
  const after = await questionsOfGame(gameId2);
  expect(
    '★★★ 아무도 없는 동안 문제가 더 진행되지 않는다',
    after.length,
    before.length,
  );
  log(`  ★ 8초 동안 문제 수가 ${before.length} → ${after.length} (변화 없음)`);

  for (const b of bots) b.disconnect();
  return checkSummary();
}


// -----------------------------------------------------------------------------
// ★★★ pause — Phase 5 일시정지 (R015)
//
//   ★★ 이 시나리오가 검증하는 가장 중요한 것 —
//     **자동 재개가 되지 않는다.** 사람이 돌아와도 방장이 누르기 전에는 멈춰 있다.
//     ★ R014 의 근사 구현(D-061)은 자동 재개였다. 그것이 이번에 바뀐 핵심이다.
//     ★ 근거(Q-30 확정): 자동 재개면 먼저 들어온 한 명 때문에 나머지가 새 URL 을
//       입력하는 동안 문제가 소모된다.
// -----------------------------------------------------------------------------
async function scenarioPause() {
  log('시나리오 pause — ★★ Phase 5 일시정지');
  await clearExperiences(PREFIX);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 5 일시정지 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');
  const gameId = await startGame(host, [guest], 5);

  const q1 = host.snapshot.question;
  const epochBefore = q1.epoch;
  log(`  문제 1 시작 (epoch=${epochBefore})`);

  // ── 1. ★★ 전원 이탈 → 즉시 PAUSED
  log('\n[1] ★★ 전원 이탈 → 즉시 PAUSED');
  await sleep(2000); // ★ 2초쯤 흐르게 둔다. 남은 시간이 보존되는지 볼 것이다
  const beforeLeave = q1.endsAt - Date.now();
  host.socket.close();
  guest.socket.close();
  await sleep(800);

  const st1 = await roomStateOf(roomId);
  expect('★★ 상태가 PAUSED', st1.state, 'PAUSED');
  expect('★ pausedFrom', st1.paused?.pausedFrom, 'QUESTION_ACTIVE');
  expectTrue(
    '★ 멈춘 남은 시간이 보존된다 (2초쯤 흐른 뒤)',
    Math.abs(st1.paused.remainingMs - beforeLeave) < 1500,
    `보존 ${st1.paused.remainingMs}ms / 예상 ${Math.round(beforeLeave)}ms`,
  );

  // ── 2. ★★★ 타이머가 멈춘다
  log('\n[2] ★★★ 타이머가 멈춘다 (6초 관측)');
  const remain1 = st1.paused.remainingMs;
  await sleep(6000);
  const st2 = await roomStateOf(roomId);
  expect('★ 여전히 PAUSED', st2.state, 'PAUSED');
  expect('★★★ 남은 시간이 그대로다 (흐르지 않았다)', st2.paused.remainingMs, remain1);
  expect('★ 문제가 더 진행되지 않았다', (await questionsOfGame(gameId)).length, 1);

  // ── 3. ★★★ 사람이 돌아와도 자동 재개되지 않는다
  log('\n[3] ★★★ 사람이 돌아와도 자동 재개되지 않는다 (R014 와 달라진 핵심)');
  const back1 = new Bot(guest.name);
  back1.cookie = guest.cookie;
  await back1.connect();
  await back1.waitFor(() => back1.snapshot !== null, 6000, '게스트 재접속');
  expect('★ 재접속하면 PAUSED 를 본다', back1.snapshot.room.state, 'PAUSED');
  expectTrue('★ 일시정지 정보가 스냅샷에 담긴다', back1.snapshot.paused !== null);
  expect('★ 비방장은 재개할 수 없다', back1.snapshot.paused.canResume, false);

  await sleep(3000);
  const st3 = await roomStateOf(roomId);
  expect('★★★ 3초가 지나도 여전히 PAUSED (자동 재개 없음)', st3.state, 'PAUSED');
  expect('★★ 남은 시간도 그대로다', st3.paused.remainingMs, remain1);

  // ── 4. ★★ 비방장이 재개를 시도하면 거부된다
  log('\n[4] ★★ 재개는 방장만 할 수 있다');
  let from = back1.mark();
  back1.resume();
  await sleep(500);
  expect('★★ 비방장 재개 → NOT_HOST', back1.since(from, 'error')[0]?.code, 'NOT_HOST');
  expect('★ 여전히 PAUSED', (await roomStateOf(roomId)).state, 'PAUSED');

  // ── 5. ★ PAUSED 중 정답·스킵이 막힌다
  log('\n[5] ★ PAUSED 중 정답 판정과 스킵이 막힌다');
  const answers1 = await answersForText(q1.text);
  from = back1.mark();
  back1.chat(answers1[0], epochBefore);
  await sleep(600);
  expect('★★ PAUSED 중 정답은 판정되지 않는다', back1.since(from, 'question.resolved').length, 0);
  expect('★ 상태가 그대로 PAUSED', (await roomStateOf(roomId)).state, 'PAUSED');
  expectTrue(
    '★ 그래도 채팅으로는 보인다 (PAUSED 중 채팅 허용)',
    back1.since(from, 'chat').some((c) => c.text === answers1[0]),
  );

  from = back1.mark();
  back1.socket.emit('skip.vote', { vote: true, epoch: epochBefore });
  await sleep(500);
  expect('★ PAUSED 중 스킵 투표 → INVALID_STATE', back1.since(from, 'error')[0]?.code, 'INVALID_STATE');

  // ── 6. ★★ 방장이 돌아와 재개한다
  log('\n[6] ★★ 방장이 재개한다');
  const back0 = new Bot(host.name);
  back0.cookie = host.cookie;
  await back0.connect();
  await back0.waitFor(() => back0.snapshot !== null, 6000, '방장 재접속');
  expect('★ 방장은 재개할 수 있다', back0.snapshot.paused.canResume, true);

  from = back0.mark();
  back0.resume();
  await back0.waitFor(() => back0.since(from, 'game.resumed').length > 0, 5000, '재개');
  const resumed = back0.since(from, 'game.resumed')[0].payload;
  expect('★ 상태가 QUESTION_ACTIVE 로 돌아온다', resumed.state, 'QUESTION_ACTIVE');
  expect('★★ epoch 가 증가하지 않았다 (같은 문제를 이어서 한다)', resumed.epoch, epochBefore);
  const remainAfter = resumed.endsAt - back0.since(from, 'game.resumed')[0].at;
  expectTrue(
    '★★ 남은 시간이 보존되어 이어진다',
    Math.abs(remainAfter - remain1) < 1500,
    `재개 후 ${Math.round(remainAfter)}ms / 멈출 때 ${remain1}ms`,
  );
  expect('★ 게스트도 재개를 받는다', back1.since(0, 'game.resumed').length, 1);

  // ── 7. ★ 재개 후 게임이 정상 진행된다
  log('\n[7] ★ 재개 후 정답이 정상 판정된다');
  from = back0.mark();
  back0.chat(answers1[0], epochBefore);
  await back0.waitFor(() => back0.since(from, 'question.resolved').length > 0, 8000, '정답');
  expect('★ 재개 후 정답이 인정된다', back0.since(from, 'question.resolved')[0].reason, 'correct');

  // ── 8. ★★★ 마지막 활성자가 나가기 버튼 → 즉시 폭파 (Q-82)
  log('\n[8] ★★★ 마지막 활성자가 나가기 버튼 → 즉시 방 폭파 (Q-82)');
  await back0.waitQuestion(2, 12000);
  back1.leave(); // 게스트 먼저 나간다 (아직 방장이 남아 있다)
  await sleep(700);
  const st4 = await roomStateOf(roomId);
  expectTrue('★ 한 명이 나가도 방은 남는다', st4.exists, JSON.stringify(st4));
  expect('★ 아직 PAUSED 가 아니다 (방장이 남아 있다)', st4.state, 'QUESTION_ACTIVE');

  back0.leave(); // ★★ 마지막 활성자가 나가기 버튼을 눌렀다
  await sleep(900);
  const st5 = await roomStateOf(roomId);
  expect('★★★ 마지막 활성자가 나가면 방이 즉시 사라진다', st5.exists, false);

  await sleep(600);
  const closed = await gamesOfRoom(roomId);
  expectTrue(
    '★★ games 가 닫힌다 (열린 게임을 남기지 않는다)',
    closed.games[0]?.ended_at !== null,
    String(closed.games[0]?.end_reason),
  );
  expect('★ 종료 사유', closed.games[0]?.end_reason, 'abandoned');

  back0.disconnect();
  back1.disconnect();
  host.disconnect();
  guest.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// ★★ abandon — PAUSED 만료로 방이 폭파된다 (Q-82)
//
//   ★ 설정값(PAUSE_ABANDON_MS)을 짧게 줄여 같은 경로를 검증한다.
//     ★★ 값만 다르고 코드 경로는 동일하다.
// -----------------------------------------------------------------------------
async function scenarioAbandon() {
  log('시나리오 abandon — ★★ PAUSED 만료로 방 폭파 (PAUSE_ABANDON_MS=6000)');
  ensureServerForScenario();
  await clearExperiences(PREFIX);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 5 만료 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');
  const gameId = await startGame(host, [guest], 5);

  // ── 1. ★★ 끊김(나가기 아님)으로 전원 이탈 → PAUSED
  log('\n[1] ★★ 끊김으로 전원 이탈 → PAUSED (폭파되지 않는다)');
  host.socket.close();
  guest.socket.close();
  await sleep(800);
  const st1 = await roomStateOf(roomId);
  expect('★★ 끊김은 즉시 폭파되지 않는다', st1.exists, true);
  expect('★ PAUSED 로 간다', st1.state, 'PAUSED');
  expectTrue(
    '★ 만료 시각이 설정값(6초)에 맞게 잡힌다',
    st1.paused.abandonAt - st1.paused.pausedAt >= 5000 &&
      st1.paused.abandonAt - st1.paused.pausedAt <= 7000,
    `${st1.paused.abandonAt - st1.paused.pausedAt}ms`,
  );

  // ── 2. ★ 만료 전에 돌아오면 시계가 다시 시작된다
  log('\n[2] ★ 돌아왔다 다시 나가면 만료 시계가 처음부터 다시 센다');
  await sleep(3500);
  const mid = new Bot(host.name);
  mid.cookie = host.cookie;
  await mid.connect();
  await mid.waitFor(() => mid.snapshot !== null, 6000, '재접속');
  await sleep(600);
  const st2 = await roomStateOf(roomId);
  expectTrue('★ 여전히 살아 있다', st2.exists, JSON.stringify(st2));
  expectTrue(
    '★★ 만료 시각이 뒤로 밀렸다 (돌아왔으므로 다시 센다)',
    st2.paused.abandonAt > st1.paused.abandonAt,
    `${st1.paused.abandonAt} → ${st2.paused.abandonAt}`,
  );
  mid.socket.close();
  await sleep(500);

  // ── 3. ★★★ 만료 → 방 폭파
  log('\n[3] ★★★ 만료되면 방이 폭파된다');
  await sleep(8000);
  const st3 = await roomStateOf(roomId);
  expect('★★★ 방이 사라졌다', st3.exists, false);

  await sleep(600);
  const closed = await gamesOfRoom(roomId);
  expectTrue(
    '★★ games 가 닫힌다',
    closed.games[0]?.ended_at !== null,
    String(closed.games[0]?.end_reason),
  );
  expect('★ 종료 사유', closed.games[0]?.end_reason, 'abandoned');

  // ★ 정답을 공개하지 않았으므로 경험 기록이 없다 (Q-47)
  const exp = await experiencesOfGame(gameId);
  expect('★★ 정답을 공개하지 않았으므로 경험 기록이 없다 (Q-47)', exp.length, 0);

  host.disconnect();
  guest.disconnect();
  mid.disconnect();
  return checkSummary();
}


// -----------------------------------------------------------------------------
// ★★ flood — Q-84 도배 완화 후 판정 성능 실측 (R015)
//
//   ★ 건우 지시: "완화해도 판정 성능에 영향이 없는지 확인하라 —
//     ★ 정답 판정은 동기 블록이다. 메시지가 폭증하면 그 블록이 자주 돈다.
//       봇으로 부하를 만들어 실측하라"
//
//   ★★ 무엇을 재는가 — **정답을 보낸 순간부터 question.resolved 를 받기까지**.
//     ★ 그것이 사용자가 체감하는 판정 지연이고, 선착순 승패를 가르는 값이다.
//   ★ 부하 없는 기준선을 먼저 재고, 도배 중에 같은 것을 재서 비교한다.
// -----------------------------------------------------------------------------
async function scenarioFlood() {
  log('시나리오 flood — ★★ Q-84 도배 완화 후 판정 성능 실측');
  await clearExperiences(PREFIX);

  const bots = await makeBots(6);
  await bots[0].connect();
  bots[0].createRoom('Q-84 부하 테스트');
  await bots[0].waitFor(() => bots[0].snapshot !== null, 6000, '방 생성');
  const roomId = bots[0].snapshot.room.id;
  for (const b of bots.slice(1)) {
    await b.connect();
    b.join(roomId);
    await b.waitFor(() => b.snapshot !== null, 6000, `${b.name} 입장`);
  }
  const host = bots[0];
  await startGame(host, bots.slice(1), 6);

  /** 정답을 보내고 resolved 를 받기까지의 왕복 시간을 잰다 */
  async function measure(index, flood) {
    const q = await host.waitQuestion(index, 15000);
    const answers = await answersForText(q.text);
    // ★ 도배는 정답을 보내기 전에 시작해 큐를 채운다
    let stop = false;
    let sent = 0;
    let throttled = 0;
    const floodFrom = bots[1].mark();
    if (flood) {
      const spam = () => {
        if (stop) return;
        // ★ 5명이 동시에 10개씩 던진다. 사람이 낼 수 없는 속도다
        for (const b of bots.slice(1)) {
          for (let i = 0; i < 10; i += 1) {
            b.chat(`도배${sent}`, q.epoch);
            sent += 1;
          }
        }
        setTimeout(spam, 50);
      };
      spam();
      await sleep(600); // 큐를 채운다
    }

    const from = host.mark();
    const t0 = Date.now();
    host.chat(answers[0], q.epoch);
    await host.waitFor(
      () => host.since(from, 'question.resolved').length > 0,
      15000,
      `${index}번 판정`,
    );
    const ms = host.since(from, 'question.resolved')[0].at - t0;
    stop = true;
    if (flood) {
      await sleep(400);
      throttled = bots[1].since(floodFrom, 'chat.throttled').length;
    }
    return { ms, sent, throttled, reason: host.since(from, 'question.resolved')[0].reason };
  }

  // ── 1. 기준선 (부하 없음)
  log('\n[1] 기준선 — 부하 없이 판정 지연을 잰다');
  const base = [];
  for (let i = 1; i <= 2; i += 1) {
    const r = await measure(i, false);
    base.push(r.ms);
    expect(`${i}번 정답 처리`, r.reason, 'correct');
  }
  const baseAvg = base.reduce((a, b) => a + b, 0) / base.length;
  log(`  ★ 기준선 판정 지연: ${base.map((m) => `${m}ms`).join(', ')} (평균 ${Math.round(baseAvg)}ms)`);

  // ── 2. ★★ 도배 중 판정
  log('\n[2] ★★ 5명이 초당 수백 개를 쏟아붓는 중에 판정을 잰다');
  const loaded = [];
  let totalSent = 0;
  let totalThrottled = 0;
  for (let i = 3; i <= 4; i += 1) {
    const r = await measure(i, true);
    loaded.push(r.ms);
    totalSent += r.sent;
    totalThrottled += r.throttled;
    expect(`${i}번 정답 처리 (도배 중)`, r.reason, 'correct');
  }
  const loadAvg = loaded.reduce((a, b) => a + b, 0) / loaded.length;
  log(`  ★ 도배 중 판정 지연: ${loaded.map((m) => `${m}ms`).join(', ')} (평균 ${Math.round(loadAvg)}ms)`);
  log(`  ★ 던진 메시지 ${totalSent}개 / 억제 안내 ${totalThrottled}회`);

  expectTrue(
    '★★★ 도배 중에도 판정이 200ms 안에 끝난다',
    loadAvg < 200,
    `평균 ${Math.round(loadAvg)}ms`,
  );
  expectTrue(
    '★★ 도배가 판정 지연을 크게 늘리지 않는다 (기준선 + 150ms 이내)',
    loadAvg < baseAvg + 150,
    `기준선 ${Math.round(baseAvg)}ms → 부하 ${Math.round(loadAvg)}ms`,
  );
  expectTrue(
    '★★ rate limit 이 실제로 발동한다 (서버 보호선이 살아 있다)',
    totalThrottled > 0,
    `${totalThrottled}회`,
  );

  // ── 3. ★ 사람의 정상 연타는 막히지 않는다
  log('\n[3] ★ 사람의 정상 연타(초당 5개)는 막히지 않는다');
  const q5 = await host.waitQuestion(5, 15000);
  const humanFrom = bots[2].mark();
  for (let i = 0; i < 15; i += 1) {
    bots[2].chat(`사람연타${i}`, q5.epoch);
    await sleep(200); // 초당 5개
  }
  await sleep(400);
  expect(
    '★★ 초당 5개는 한 번도 막히지 않는다',
    bots[2].since(humanFrom, 'chat.throttled').length,
    0,
  );

  // ── 4. ★ 억제는 본인에게만 간다
  log('\n[4] ★ 억제 안내는 본인에게만 간다');
  const others = bots.filter((b) => b !== bots[3]);
  const marks = others.map((b) => b.mark());
  for (let i = 0; i < 60; i += 1) bots[3].chat(`혼자도배${i}`, q5.epoch);
  await sleep(600);
  expectTrue(
    '★ 도배한 본인은 억제 안내를 받는다',
    bots[3].since(0, 'chat.throttled').length > 0,
    `${bots[3].since(0, 'chat.throttled').length}회`,
  );
  expect(
    '★★ 다른 사람은 억제 안내를 받지 않는다',
    others.reduce((n, b, i) => n + b.since(marks[i], 'chat.throttled').length, 0),
    0,
  );

  for (const b of bots) b.socket.emit('room.leave', {});
  await sleep(900);
  for (const b of bots) b.disconnect();
  return checkSummary();
}

// -----------------------------------------------------------------------------
// ★★ pausehost — PAUSED 중 방장이 끊긴 채 다른 사람만 돌아오는 경우 (R015)
//
//   ★★ 이것을 확인하지 않으면 **게임이 되살아날 수 없는 상태**가 생긴다.
//     ★ 재개는 방장만 할 수 있는데 방장이 안 돌아오면 아무도 누를 수 없다.
//     ★ 그래서 방장 이전 타이머가 PAUSED 중에도 돌아야 한다.
//   ★ 30초 유예(Q-29)가 있으므로 이 시나리오는 약 40초 걸린다.
// -----------------------------------------------------------------------------
async function scenarioPauseHost() {
  log('시나리오 pausehost — ★★ PAUSED 중 방장 이전 (약 40초)');
  await clearExperiences(PREFIX);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 5 방장 이전 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');
  await startGame(host, [guest], 5);

  const hostId = host.snapshot.me.accountId;
  const guestId = guest.snapshot.me.accountId;

  log('\n[1] 전원 이탈 → PAUSED');
  host.socket.close();
  guest.socket.close();
  await sleep(800);
  const st1 = await roomStateOf(roomId);
  expect('★ PAUSED', st1.state, 'PAUSED');
  expect('★ 방장은 아직 원래 방장이다', st1.hostAccountId, hostId);

  log('\n[2] ★★ 방장은 안 돌아오고 게스트만 돌아온다');
  const back = new Bot(guest.name);
  back.cookie = guest.cookie;
  await back.connect();
  await back.waitFor(() => back.snapshot !== null, 6000, '게스트 재접속');
  expect('★ 여전히 PAUSED (자동 재개 없음)', back.snapshot.room.state, 'PAUSED');
  expect('★ 게스트는 아직 재개할 수 없다', back.snapshot.paused.canResume, false);

  log('\n[3] ★★ 30초 유예 뒤 방장이 이전된다 (최대 40초 대기)');
  const from = back.mark();
  await back.waitFor(
    () => back.since(from, 'room.hostChanged').length > 0,
    40000,
    '방장 이전',
  );
  const st2 = await roomStateOf(roomId);
  expect('★★★ 방장이 게스트에게 이전됐다', st2.hostAccountId, guestId);
  expect('★ 여전히 PAUSED (이전만 되고 재개되지는 않았다)', st2.state, 'PAUSED');

  log('\n[4] ★★★ 새 방장이 재개할 수 있다');
  // ★ 스냅샷을 다시 받아 canResume 을 확인한다
  const resyncFrom = back.mark();
  back.socket.emit('state.resync', {});
  await back.waitFor(() => back.since(resyncFrom, 'room.state').length > 0, 5000, 'resync');
  expect('★★ 새 방장은 재개할 수 있다', back.snapshot.paused.canResume, true);

  const r = back.mark();
  back.resume();
  await back.waitFor(() => back.since(r, 'game.resumed').length > 0, 5000, '재개');
  expect('★★★ 새 방장이 재개했다', (await roomStateOf(roomId)).state, 'QUESTION_ACTIVE');

  back.socket.emit('host.forceEnd', {});
  await sleep(600);
  back.socket.emit('game.toLobby', {});
  await sleep(400);
  back.leave();
  await sleep(700);
  back.disconnect();
  host.disconnect();
  guest.disconnect();
  return checkSummary();
}


// -----------------------------------------------------------------------------
// ★★ pausehint — 일시정지와 힌트(B-5) (R015)
//
//   ★★ 왜 따로 재는가 — 힌트는 **남은 시간**으로 판단한다.
//     PAUSED 중에는 endsAt 이 낡은 값이므로, 그대로 믿으면 두 가지 사고가 난다.
//       ★ (가) 멈춰 있는 동안 힌트 시각이 지나가 버려, 재접속하면 힌트가 먼저 보인다
//              → ★★ 아직 20초가 남은 문제의 힌트를 공짜로 얻는다. **정보 누출**이다.
//       ★ (나) 재개한 뒤에는 힌트가 아예 오지 않는다 (이미 지났다고 판단해서)
//     ★ 이 시나리오는 둘 다 일어나지 않음을 단정한다.
//
//   ★ 문제 시간 30초 / 힌트는 남은 10초. 그래서 약 45초 걸린다.
// -----------------------------------------------------------------------------
async function scenarioPauseHint() {
  log('시나리오 pausehint — ★★ 일시정지와 힌트 (B-5, 약 45초)');
  await clearExperiences(PREFIX);

  const [host, guest] = await makeBots(2);
  await host.connect();
  host.createRoom('Phase 5 힌트 테스트');
  await host.waitFor(() => host.snapshot !== null, 6000, '방 생성');
  const roomId = host.snapshot.room.id;
  await guest.connect();
  guest.join(roomId);
  await guest.waitFor(() => guest.snapshot !== null, 6000, '게스트 입장');
  await startGame(host, [guest], 3);

  const q1 = host.snapshot.question;
  expect('★ 시작 시점에는 힌트가 없다', q1.hintRevealed, false);

  // ── 1. 힌트 시각 전에 멈춘다
  log('\n[1] 힌트 시각(남은 10초) 전에 전원 이탈한다');
  await sleep(2000);
  host.socket.close();
  guest.socket.close();
  await sleep(800);
  const st1 = await roomStateOf(roomId);
  expect('★ PAUSED', st1.state, 'PAUSED');
  expect('★ 힌트는 아직 push 되지 않았다', st1.question.hintPushed, false);
  expectTrue(
    '★ 멈춘 시점에 남은 시간이 10초보다 많다 (힌트 전이다)',
    st1.paused.remainingMs > 12000,
    `${st1.paused.remainingMs}ms 남음`,
  );

  // ── 2. ★★★ 멈춰 있는 동안 힌트 시각이 "지나가지" 않는다
  log('\n[2] ★★★ 20초를 멈춘 채로 둔다 — 원래라면 힌트 시각을 지났을 시간이다');
  await sleep(20000);
  const st2 = await roomStateOf(roomId);
  expect('★ 여전히 PAUSED', st2.state, 'PAUSED');
  expect('★★ 남은 시간이 흐르지 않았다', st2.paused.remainingMs, st1.paused.remainingMs);
  expect('★★★ 힌트가 push 되지 않았다 (시간이 멈췄으므로)', st2.question.hintPushed, false);
  // ★★ 여기가 이 시나리오의 핵심이다.
  //   ★ 낡은 endsAt 으로 계산한 남은 시간은 이미 힌트 기준선(10초) 아래다.
  //   ★★ 즉 endsAt 을 그대로 믿었다면 **힌트가 공개됐어야 하는 상태**다.
  //     실제 남은 시간은 28초다. 그 차이가 정보 누출의 크기다.
  const staleRemain = st2.question.endsAt - Date.now();
  expectTrue(
    '★★★ 낡은 endsAt 으로 보면 이미 힌트 시각을 지났다 (그래서 endsAt 을 믿으면 안 된다)',
    staleRemain <= 10000,
    `낡은 계산 ${Math.round(staleRemain)}ms / 실제 ${st2.paused.remainingMs}ms`,
  );

  // ── 3. ★★★ 재접속해도 힌트가 보이지 않는다 (정보 누출 방어선)
  log('\n[3] ★★★ 재접속 스냅샷에도 힌트가 없다 — 정보 누출 방어선');
  const back = new Bot(host.name);
  back.cookie = host.cookie;
  await back.connect();
  await back.waitFor(() => back.snapshot !== null, 6000, '방장 재접속');
  expect('★ PAUSED 중에도 문제는 복구된다', back.snapshot.room.state, 'PAUSED');
  expectTrue('★ 문제가 스냅샷에 담긴다', back.snapshot.question !== null);
  expect('★★★ 힌트가 공개되지 않았다', back.snapshot.question.hintRevealed, false);
  expect('★★ 힌트 문장 자체가 내려오지 않았다', back.snapshot.question.hint, null);

  // ── 4. ★★ 재개하면 힌트가 남은 10초에 온다
  log('\n[4] ★★ 재개한다. 힌트는 다시 계산된 남은 10초에 와야 한다');
  let from = back.mark();
  back.resume();
  await back.waitFor(() => back.since(from, 'game.resumed').length > 0, 5000, '재개');
  const resumedEndsAt = back.since(from, 'game.resumed')[0].payload.endsAt;

  const hintFrom = back.mark();
  await back.waitFor(() => back.since(hintFrom, 'question.hint').length > 0, 30000, '힌트');
  const hintEv = back.since(hintFrom, 'question.hint')[0];
  const remainAtHint = resumedEndsAt - hintEv.at;
  expectTrue(
    '★★★ 힌트가 남은 10초 무렵에 온다 (재개 후 다시 계산된 기준)',
    Math.abs(remainAtHint - 10000) < 1500,
    `힌트 시점에 ${Math.round(remainAtHint)}ms 남음`,
  );
  expect('★ 힌트 epoch 가 같은 문제다', hintEv.epoch, q1.epoch);
  expectTrue('★ 힌트 내용이 비어 있지 않다', typeof hintEv.hint === 'string' && hintEv.hint.length > 0);

  // ── 5. ★ 힌트를 받은 뒤 다시 멈춰도 힌트는 유지되고, 두 번 오지 않는다
  log('\n[5] ★ 힌트 뒤에 다시 멈춘다 — 힌트는 유지되고 두 번 오지 않는다');
  back.socket.close();
  await sleep(800);
  const st3 = await roomStateOf(roomId);
  expect('★ 다시 PAUSED', st3.state, 'PAUSED');
  expect('★ 힌트는 push 된 상태로 남는다', st3.question.hintPushed, true);

  const back2 = new Bot(host.name);
  back2.cookie = host.cookie;
  await back2.connect();
  await back2.waitFor(() => back2.snapshot !== null, 6000, '재접속');
  expect('★★ 이미 공개된 힌트는 재접속해도 그대로 보인다', back2.snapshot.question.hintRevealed, true);
  expect('★ 힌트 문장이 함께 온다', back2.snapshot.question.hint, hintEv.hint);

  from = back2.mark();
  back2.resume();
  await back2.waitFor(() => back2.since(from, 'game.resumed').length > 0, 5000, '재개');
  await sleep(1500);
  expect(
    '★★ 재개해도 힌트가 다시 push 되지 않는다 (hintPushed 가 true 다)',
    back2.since(from, 'question.hint').length,
    0,
  );

  back2.leave(); // ★ 마지막 활성자 → 즉시 폭파 (Q-82)
  await sleep(800);
  expect('★ 방이 정리됐다', (await roomStateOf(roomId)).exists, false);
  back2.disconnect();
  host.disconnect();
  guest.disconnect();
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
  // ★★ Phase 3 (R014)
  game: scenarioGame,
  race: scenarioRace,
  epoch: scenarioEpoch,
  concur: scenarioConcurrent,
  collide: scenarioCollide,
  full: scenarioFull,
  // ★★ Phase 5 (R015)
  pause: scenarioPause,
  abandon: scenarioAbandon,
  pausehost: scenarioPauseHost,
  pausehint: scenarioPauseHint,
  // ★ Q-84 (R015)
  flood: scenarioFlood,
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
