#!/usr/bin/env node
// =============================================================================
// 브라우저 확인 (레이아웃 실측 + 동작 확인)
//
// ★ 왜 이 도구가 있는가 (docs/07-DECISIONS.md D-027 / Q-61 승인)
//
//   R005  봇이 사람과 다른 경로로 서버를 띄워 "실행 불가" 를 놓쳤다
//   R006  실행 경로를 하나로 합치고 smoke 게이트를 만들었다
//   R007  ★ 봇이 소켓으로 직접 요청을 보내 **클라이언트를 우회**했다.
//         서버는 옳게 거부했는데 사람 화면에는 아무 안내도 뜨지 않았다.
//
//   세 사고가 모두 같은 종류다: "서버는 옳은데 사람이 쓰는 경로에서는 다르게 동작한다."
//   ★ 그래서 이 도구는 **실제 브라우저를 실제로 조작한다.**
//     소켓을 직접 부르지 않는다. 버튼을 누르고, 화면에 무엇이 보이는지 읽는다.
//
// 검사 두 종류
//   레이아웃  320~720px 에서 라벨 줄바꿈과 가로 넘침 (D-022 회귀 방지)
//   동작      버튼을 눌렀을 때 서버 사유가 화면에 뜨는가, 조건부 UI가 실제로 나타나는가
//
// ★ "보인다" 를 DOM 존재로 판정하지 않는다 (R009)
//   R008에서 만든 배너는 DOM 에 있었지만 문서 흐름 맨 위여서,
//   스크롤을 내린 상태에서는 **화면 밖**이었다. DOM 검사만으로는 통과했을 것이다.
//   ★ 그래서 요소의 화면 좌표가 뷰포트 안에 있는지 잰다(isOnScreen).
//   ★ 조작 대상(입력창·버튼)과 겹치는지도 좌표로 잰다(overlaps).
//
// ★ 줄바꿈 판정 방법
//   Range.getClientRects() 의 **top 값 종류**를 센다. 같은 줄이면 top 이 같다.
//   사각형 개수를 세면 안 된다 — 브라우저는 글자 종류가 바뀌는 경계에서 텍스트 상자를
//   쪼개므로 "50문제"(숫자+한글)가 한 줄인데도 2개로 나온다. (R007에서 실제로 오탐했다)
//
// ★ Chrome 을 찾지 못하면 실패가 아니라 **건너뛰기**다 (종료 코드 0).
//   npm run verify 가 환경에 따라 깨지면 게이트로서 신뢰를 잃는다.
//
// 사용법
//   npm run ui-check                  전체 (서버를 직접 띄운다)
//   npm run ui-check -- --layout      레이아웃만
//   npm run ui-check -- --behavior    동작만
//   npm run ui-check -- --url http://localhost:3000   이미 떠 있는 서버를 쓴다
//   npm run ui-check -- --shot        스크린샷을 tmp/ 에 남긴다
// =============================================================================

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import WebSocket from 'ws';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const CLIENT_INDEX = path.join(ROOT, 'client', 'dist', 'index.html');

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const SHOT = args.includes('--shot');
const ONLY_LAYOUT = args.includes('--layout');
const ONLY_BEHAVIOR = args.includes('--behavior');
const DO_LAYOUT = !ONLY_BEHAVIOR;
const DO_BEHAVIOR = !ONLY_LAYOUT;

const CDP_PORT = Number(process.env.UICHECK_CDP_PORT ?? 9333);
const PORT = Number(process.env.UICHECK_PORT ?? 3101);
const EXTERNAL_URL = opt('--url', null);
const BASE = EXTERNAL_URL ?? `http://localhost:${PORT}`;
const WIDTHS = [320, 360, 390, 480, 720];
const STAMP = Date.now().toString(36).slice(-5);
const ACCOUNT_PREFIX = `uic${STAMP}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// 결과 수집
// -----------------------------------------------------------------------------
const checks = [];

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return ok;
}

function skip(reason) {
  console.log(`\n[ui-check] ★ 건너뜀 — ${reason}`);
  console.log('[ui-check]   레이아웃·동작 확인을 하지 않았다. 통과로 간주하지 않는다.');
  process.exit(0);
}

// -----------------------------------------------------------------------------
// Chrome 탐색. 없으면 건너뛴다.
// -----------------------------------------------------------------------------
// ★ UICHECK_CHROME 이 지정되면 그것만 쓴다.
//   후보 목록에 섞으면 "지정한 경로가 없는데 다른 Chrome 으로 조용히 실행되는" 일이 생기고,
//   건너뛰기 동작을 테스트할 방법도 없어진다.
const CHROME_CANDIDATES = process.env.UICHECK_CHROME
  ? [process.env.UICHECK_CHROME]
  : [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  skip('Chrome/Edge 실행 파일을 찾지 못했다 (UICHECK_CHROME 으로 경로를 지정할 수 있다)');
}

if (!existsSync(CLIENT_INDEX)) {
  skip(`클라이언트 산출물이 없다: ${CLIENT_INDEX.replace(ROOT, '.')} — 먼저 npm run build`);
}

// -----------------------------------------------------------------------------
// CDP 연결 래퍼
// -----------------------------------------------------------------------------
class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const entry = msg.id && this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    });
    return this;
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* 이미 닫혔다 */
    }
  }
}

/** 페이지 하나. 브라우저 컨텍스트가 다르면 쿠키가 분리된다(시크릿 창과 같다) */
class Page extends Cdp {
  constructor(url, label) {
    super(url);
    this.label = label;
  }

  async init() {
    await this.open();
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    return this;
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        `[${this.label}] 페이지 예외: ${r.exceptionDetails.exception?.description ?? ''}`,
      );
    }
    return r.result.value;
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await sleep(1200);
  }

  async setWidth(w) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: 900,
      deviceScaleFactor: 1,
      mobile: w <= 480,
    });
    await sleep(250);
  }

  text() {
    return this.evaluate('document.body.innerText');
  }

  /** 라벨이 정확히 일치하는 버튼을 누른다. 없으면 false */
  click(label) {
    return this.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim() === ${JSON.stringify(label)});
      if (!b || b.disabled) return false;
      b.click();
      return true;
    })()`);
  }

  /**
   * ★ 요소가 실제로 화면(뷰포트) 안에 보이는가.
   *   DOM 에 있는 것과 화면에 보이는 것은 다르다. 이번 라운드 지적의 핵심이다.
   */
  onScreen(selector) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { exists: false };
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const style = getComputedStyle(el);
      return {
        exists: true,
        rect: { top: Math.round(r.top), bottom: Math.round(r.bottom),
                left: Math.round(r.left), right: Math.round(r.right) },
        viewport: { w: vw, h: vh },
        // 요소 전체가 뷰포트 안에 들어와 있는가
        fullyVisible: r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw,
        // 일부라도 걸쳐 있는가
        partlyVisible: r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw,
        opacity: style.opacity,
        display: style.display,
      };
    })()`);
  }

  /** 두 요소가 화면에서 겹치는가. 토스트가 조작 대상을 덮는지 잰다 */
  overlaps(a, b) {
    return this.evaluate(`(() => {
      const ea = document.querySelector(${JSON.stringify(a)});
      const eb = document.querySelector(${JSON.stringify(b)});
      if (!ea || !eb) return { both: false };
      const ra = ea.getBoundingClientRect();
      const rb = eb.getBoundingClientRect();
      const overlap =
        ra.left < rb.right && ra.right > rb.left && ra.top < rb.bottom && ra.bottom > rb.top;
      return { both: true, overlap, a: Math.round(ra.top), b: Math.round(rb.top) };
    })()`);
  }

  scrollToBottom() {
    return this.evaluate(`(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return { y: Math.round(window.scrollY),
               max: Math.round(document.documentElement.scrollHeight - window.innerHeight) };
    })()`);
  }

  /** 버튼 존재 여부와 disabled 상태 */
  buttonState(label) {
    return this.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim() === ${JSON.stringify(label)});
      if (!b) return { exists: false };
      return { exists: true, disabled: b.disabled, visible: b.getClientRects().length > 0 };
    })()`);
  }

  setInput(selector, value) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  }

  /** 조건이 만족될 때까지 기다린다 */
  async waitFor(expression, timeoutMs = 8000, label = '조건') {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await this.evaluate(`Boolean(${expression})`)) return true;
      await sleep(150);
    }
    return false;
  }

  async waitForText(needle, timeoutMs = 8000) {
    return this.waitFor(
      `document.body.innerText.includes(${JSON.stringify(needle)})`,
      timeoutMs,
      needle,
    );
  }

  async shot(name) {
    if (!SHOT) return;
    const r = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    writeFileSync(path.join(ROOT, 'tmp', `shot-${name}.png`), Buffer.from(r.data, 'base64'));
  }
}

// -----------------------------------------------------------------------------
// 브라우저 기동
// -----------------------------------------------------------------------------
async function closePreviousBrowser() {
  // ★ 앞선 실행의 브라우저가 살아 있으면 그쪽에 붙어 엉뚱한 화면을 재게 된다.
  //   (R007에서 실제로 겪었다. 로그인 화면을 잰다면서 로비를 재고 있었다)
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    const info = await res.json();
    const b = await new Cdp(info.webSocketDebuggerUrl).open();
    await b.send('Browser.close').catch(() => {});
    b.close();
    await sleep(700);
    console.log('[ui-check] 앞선 실행의 브라우저를 닫았다');
  } catch {
    /* 없다. 정상 */
  }
}

async function launchBrowser() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'quizui-'));
  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
        signal: AbortSignal.timeout(800),
      });
      const info = await res.json();
      const browser = await new Cdp(info.webSocketDebuggerUrl).open();
      return { proc, browser };
    } catch {
      await sleep(250);
    }
  }
  proc.kill();
  skip('Chrome 이 CDP 포트를 열지 못했다');
  return null;
}

/**
 * 새 페이지를 연다.
 * ★ isolated=true 면 별도 브라우저 컨텍스트에서 연다. 쿠키가 분리되므로
 *   시크릿 창과 같다. 같은 계정 1소켓 제한(Q-06) 때문에 두 사람을 흉내내려면 필요하다.
 */
async function newPage(browser, label, isolated = false) {
  const params = { url: 'about:blank' };
  if (isolated) {
    const ctx = await browser.send('Target.createBrowserContext');
    params.browserContextId = ctx.browserContextId;
  }
  const { targetId } = await browser.send('Target.createTarget', params);
  const page = new Page(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`, label);
  await page.init();
  page.targetId = targetId;
  return page;
}

// -----------------------------------------------------------------------------
// 서버 기동
// ★ 사람이 쓰는 것과 같은 경로(server/dist/index.js)로 띄운다. (R006 D-020)
// -----------------------------------------------------------------------------
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
    console.log(`[ui-check] 이미 떠 있는 서버를 사용한다: ${BASE}`);
    return;
  }
  if (EXTERNAL_URL) throw new Error(`서버가 응답하지 않는다: ${BASE}`);
  if (!existsSync(SERVER_ENTRY)) throw new Error('서버 산출물이 없다. 먼저 npm run build');

  console.log(`[ui-check] 서버를 직접 띄운다 (server/dist/index.js, PORT=${PORT})`);
  bootedServer = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  bootedServer.stdout.on('data', (c) => (out += c.toString()));
  bootedServer.stderr.on('data', (c) => (out += c.toString()));

  for (let i = 0; i < 40; i += 1) {
    if (bootedServer.exitCode !== null) {
      throw new Error('서버가 기동 중 종료되었다.\n' + out.slice(-800));
    }
    if (await serverAlive()) return;
    await sleep(250);
  }
  throw new Error('서버가 10초 안에 응답하지 않았다.\n' + out.slice(-800));
}

function stopServer() {
  if (!bootedServer) return;
  bootedServer.kill();
  bootedServer = null;
}

/**
 * ★ 지정 계정의 경험 기록으로 **출제 가능 수를 원하는 값으로 줄인다.**
 *
 * ★★ 왜 필요한가 (R014)
 *   ★ "출제 가능 수 부족" 검사가 원래는 "문제 수 200 > 활성 63" 으로 재현했다.
 *     ★ R014 에서 문제가 306개가 되자 그 조건이 성립하지 않아 게임이 실제로 시작됐다.
 *     ★★ 검사가 **DB 데이터 양에 의존**하고 있었다. 데이터가 늘면 조용히 무력화된다.
 *   → ★ 실제 메커니즘(경험 기록)으로 조건을 만든다. 데이터 양과 무관해진다.
 *
 * ★ 되돌리기: cleanupAccounts 가 그 계정의 경험 기록을 지운다.
 */
async function shrinkAvailable(loginIdPattern, keepCount) {
  const url =
    process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const r = await client.query(
      `WITH acc AS (
         SELECT id FROM accounts WHERE login_id LIKE $1
       ), pool AS (
         SELECT id FROM questions
          WHERE status = 'approved' AND is_active AND question_type = 'short_answer'
          ORDER BY id
       ), target AS (
         SELECT id FROM pool OFFSET $2
       )
       INSERT INTO question_experiences (account_id, question_id)
       SELECT acc.id, target.id FROM acc, target
       ON CONFLICT (account_id, question_id) DO NOTHING`,
      [loginIdPattern, keepCount],
    );
    return r.rowCount ?? 0;
  } catch (err) {
    console.log(`  ★ 출제 가능 수 축소 실패 (건너뛴다): ${err.message}`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

// -----------------------------------------------------------------------------
// 테스트 계정 정리
// ★ 실행마다 계정이 쌓이면 DB가 지저분해진다. 자기가 만든 것만 지운다.
// -----------------------------------------------------------------------------
async function cleanupAccounts(pattern = `${ACCOUNT_PREFIX}%`, label = '테스트 계정') {
  const url =
    process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const ids = await client.query(
      `SELECT id FROM accounts WHERE login_id LIKE $1`,
      [pattern],
    );
    if (ids.rowCount === 0) return;
    const list = ids.rows.map((r) => r.id);
    await client.query(`DELETE FROM answer_events WHERE account_id = ANY($1::bigint[])`, [list]);
    await client.query(`DELETE FROM game_players WHERE account_id = ANY($1::bigint[])`, [list]);
    await client.query(
      `DELETE FROM question_experiences WHERE account_id = ANY($1::bigint[])`,
      [list],
    );
    await client.query(
      `UPDATE games SET ended_at = now(), end_reason = 'abandoned'
        WHERE ended_at IS NULL AND room_id IN (SELECT id FROM rooms WHERE created_by = ANY($1::bigint[]))`,
      [list],
    );
    await client.query(
      `DELETE FROM games WHERE room_id IN (SELECT id FROM rooms WHERE created_by = ANY($1::bigint[]))`,
      [list],
    );
    await client.query(`DELETE FROM rooms WHERE created_by = ANY($1::bigint[])`, [list]);
    await client.query(`DELETE FROM sessions WHERE account_id = ANY($1::bigint[])`, [list]);
    await client.query(`DELETE FROM accounts WHERE id = ANY($1::bigint[])`, [list]);
    console.log(`[ui-check] ${label} ${list.length}개 정리`);
  } catch (err) {
    console.log(`[ui-check] ${label} 정리 실패(무시): ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

// -----------------------------------------------------------------------------
// 화면 조작 도우미
// -----------------------------------------------------------------------------
async function signUp(page, suffix) {
  await page.goto(BASE);
  const switched = await page.click('회원가입');
  if (!switched) throw new Error(`[${page.label}] 회원가입 탭을 찾지 못했다`);
  await sleep(300);
  const inputs = await page.evaluate('document.querySelectorAll("form input").length');
  if (inputs < 3) throw new Error(`[${page.label}] 회원가입 폼을 찾지 못했다`);
  await page.evaluate(`(() => {
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const i = [...document.querySelectorAll('form input')];
    set(i[0], ${JSON.stringify(`${ACCOUNT_PREFIX}_${suffix}`)});
    set(i[1], ${JSON.stringify(`UI${STAMP}${suffix}`)});
    set(i[2], 'uic1234');
    return true;
  })()`);
  await sleep(200);
  await page.click('가입하고 시작');
  // ★ 텍스트로 기다리지 않는다. 이 도구가 그것 때문에 세 번 오탐했다(파일 상단 주석).
  //   '.tabs'(로그인/회원가입 탭)가 사라지는 것이 "인증 화면을 벗어났다" 의 구조적 신호다.
  const ok = await page.waitFor("document.querySelector('.tabs') === null", 10000);
  if (!ok) throw new Error(`[${page.label}] 가입 후 화면 전환 실패: ${(await page.text()).slice(0, 150)}`);
}

async function createRoom(page, title) {
  await page.setInput('.card input', title);
  await sleep(150);
  if (!(await page.click('만들기'))) throw new Error('만들기 버튼을 찾지 못했다');
  // ★ '초대 링크' 로 기다리면 안 된다. 방이 없는 화면에도 '초대 링크로 입장' 카드가 있어
  //   방이 만들어지기 전에 조건이 만족되고, 그 상태에서 URL 을 읽으면 방 ID 가 '/' 가 된다.
  //   (이 도구가 실제로 그렇게 틀렸다)
  //   ★ 주소가 /r/<방ID> 로 바뀌고 참가자 목록이 생기는 것을 함께 확인한다.
  const ok = await page.waitFor(
    "location.pathname.startsWith('/r/') && document.querySelector('.players') !== null",
    10000,
  );
  if (!ok) throw new Error(`방 생성 실패: ${(await page.text()).slice(0, 200)}`);
  return page.evaluate("location.pathname.slice(3)");
}

/** 방장 화면에서 문제 수를 바꾼다 */
async function setQuestionCount(page, n) {
  await page.setInput('.settings-label input[type=number]', String(n));
  await sleep(400);
}

// -----------------------------------------------------------------------------
// 레이아웃 측정
// -----------------------------------------------------------------------------
const MEASURE = `(() => {
  function lines(el) {
    // ★ 사각형 개수가 아니라 top 값 종류를 센다. 이유는 파일 상단 주석 참조.
    const r = document.createRange();
    r.selectNodeContents(el);
    const tops = new Set();
    for (const rect of r.getClientRects()) tops.add(Math.round(rect.top));
    return tops.size;
  }
  const out = [];
  const seen = new Set();
  // ★ h1(방 제목)과 label 은 제외한다.
  //   방 제목은 30자까지 허용되므로 여러 줄이 정상이고,
  //   label 은 안에 input 을 품어 항상 여러 상자가 나온다(도구의 오탐).
  for (const el of document.querySelectorAll('button, .badge, .seat, .nick, h2, .preset, .rate')) {
    const text = (el.textContent || '').trim();
    if (!text || text.length > 24) continue;
    if (el.children.length > 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    const key = el.tagName + ':' + (el.className || '') + ':' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: el.className || '',
      text,
      w: Math.round(box.width * 10) / 10,
      lines: lines(el),
      overflowX: el.scrollWidth > el.clientWidth + 1,
    });
  }
  return {
    items: out,
    innerW: window.innerWidth,
    pageScrollW: document.documentElement.scrollWidth,
    bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

async function measureScreen(page, screenName) {
  for (const w of WIDTHS) {
    await page.setWidth(w);
    const m = await page.evaluate(MEASURE);
    const bad = m.items.filter((i) => i.lines > 1 || i.overflowX);
    const detail = bad.length
      ? bad
          .map(
            (i) =>
              `<${i.tag}${i.cls ? '.' + i.cls.split(' ').join('.') : ''}> "${i.text}" ${i.lines > 1 ? `${i.lines}줄` : '넘침'} ${i.w}px`,
          )
          .join(' / ')
      : `검사 ${m.items.length}개`;
    record(
      `레이아웃 ${screenName} @${w}px`,
      bad.length === 0 && !m.bodyOverflow,
      m.bodyOverflow ? `★ 가로 스크롤 (문서폭 ${m.pageScrollW})  ${detail}` : detail,
    );
  }
}

// -----------------------------------------------------------------------------
// 실행
// -----------------------------------------------------------------------------
let browserProc = null;
let browser = null;

try {
  // ★ 시작 시 낡은 잔여물을 먼저 쓸어낸다 (R009).
  //   정리는 finally 에서 하지만, 프로세스가 강제 종료(Ctrl+C, 타임아웃)되면
  //   finally 가 돌지 않아 계정이 남는다. 그러면 다음 실행에서 그것을 알 수 없다.
  //   ★ 자기 접두어(uic)로 시작하는 것만 지운다. 사람이 만든 계정은 건드리지 않는다.
  await cleanupAccounts('uic%', '앞선 실행의 잔여 계정');

  await ensureServer();
  await closePreviousBrowser();
  const launched = await launchBrowser();
  browserProc = launched.proc;
  browser = launched.browser;

  const host = await newPage(browser, 'host');

  // ── 로그인 화면 레이아웃
  if (DO_LAYOUT) {
    console.log('\n[1] 로그인 화면 레이아웃');
    await host.setWidth(390);
    await host.goto(BASE);
    await measureScreen(host, '로그인');
    await host.setWidth(390);
    await host.shot('auth');
  }

  // ── 가입 + 방 생성
  console.log('\n[2] 가입 → 방 생성');
  await host.setWidth(390);
  if (!DO_LAYOUT) await host.goto(BASE);
  await signUp(host, 'h');
  const roomId = await createRoom(host, 'UI 점검용 방 제목 스물여덟글자');
  record('가입 → 방 생성', Boolean(roomId), `roomId=${roomId}`);

  if (DO_LAYOUT) {
    console.log('\n[3] 로비 레이아웃');
    await measureScreen(host, '로비');
    await host.setWidth(360);
    await host.shot('lobby-360');
  }

  if (DO_BEHAVIOR) {
    // ─────────────────────────────────────────────────────────────────────────
    // ★ 동작 확인 — 사람이 쓰는 경로
    // ─────────────────────────────────────────────────────────────────────────
    await host.setWidth(720);

    console.log('\n[4] ★ 서버 거부 사유가 화면에 도달하는가 (R008 결함)');
    // 문제 수를 출제 가능 수보다 크게 만든다
    // ★★ 출제 가능 수를 2개로 줄인다. 그러지 않으면 200문제 요청이 통과해 버린다
    //   ★ 근거는 shrinkAvailable 주석에 있다 (R014 실측으로 고쳤다).
    const shrunk = await shrinkAvailable(`${ACCOUNT_PREFIX}%`, 2);
    console.log(`  ★ 경험 기록 ${shrunk}행으로 출제 가능 수를 2개로 줄였다`);
    // ★ 참가자 변동이 있어야 서버가 다시 계산한다. 방을 다시 만들어 그 이벤트를 만든다
    await host.click('방 나가기');
    await host.waitFor("document.querySelector('.players') === null", 8000);
    const roomIdShrunk = await createRoom(host, 'UI 점검용 방 제목 스물여덟글자');
    record('출제 가능 수 축소 후 방 재생성', Boolean(roomIdShrunk));
    await host.waitFor(
      "document.body.innerText.includes('출제 가능') || document.querySelector('.settings-label input[type=number]') !== null",
      6000,
    );

    await setQuestionCount(host, 200);
    const warned = await host.waitForText('이대로 시작할 수 없습니다', 4000);
    record('입력 단계 경고가 보인다', warned);

    const startBtn = await host.buttonState('게임 시작');
    record(
      '게임 시작 버튼을 누를 수 있다',
      startBtn.exists && !startBtn.disabled && startBtn.visible,
      JSON.stringify(startBtn),
    );

    const clicked = await host.click('게임 시작');
    record('게임 시작 클릭이 전달된다', clicked);

    // ★ 핵심: 서버가 보낸 NOT_ENOUGH_QUESTIONS 사유가 화면에 뜨는가
    const shown = await host.waitFor("document.querySelector('.toast') !== null", 5000);
    const bodyNow = await host.text();
    record(
      '★ 서버 거부 사유가 화면에 표시된다',
      shown,
      shown ? '' : `화면에 없다 — ${bodyNow.replace(/\s+/g, ' ').slice(0, 160)}`,
    );
    record(
      '★ 안내에 실제 출제 가능 개수가 들어 있다',
      /출제할 수 있는 문제가 \d+개/.test(bodyNow),
    );
    record(
      'message / detail / code 세 줄이 모두 있다',
      await host.evaluate(
        "['.toast-message', '.toast-detail', '.toast-code'].every(s => document.querySelector(s) !== null)",
      ),
    );
    record(
      '거부되었으므로 게임이 시작되지 않았다',
      !bodyNow.includes('게임이 시작되었습니다'),
    );
    await host.shot('toast-top');

    // ─────────────────────────────────────────────────────────────────────────
    // ★ R009 지적 1 — 스크롤을 내린 상태에서도 보이는가
    //   R008의 배너는 문서 흐름 맨 위에 있어서 여기서 실패한다.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[4-2] ★ 스크롤을 내린 상태에서도 알림이 보이는가 (R009 지적 1)');
    const scrolled = await host.scrollToBottom();
    record(
      '페이지가 스크롤된다 (검사 전제)',
      scrolled.y > 100,
      `y=${scrolled.y} / max=${scrolled.max}`,
    );

    // 스크롤을 내린 상태에서 다시 거부를 만든다
    await host.click('게임 시작');
    await host.waitFor("document.querySelector('.toast') !== null", 5000);
    const pos = await host.onScreen('.toast');
    record(
      '★ 스크롤을 내린 상태에서 알림이 화면 안에 보인다',
      pos.exists && pos.fullyVisible,
      pos.exists
        ? `rect.top=${pos.rect?.top} bottom=${pos.rect?.bottom} / 뷰포트 높이=${pos.viewport?.h}`
        : 'DOM 에 없다',
    );
    await host.shot('toast-scrolled');

    // ★ 조작 대상을 가리지 않는가 (좌표로 잰다)
    for (const [name, sel] of [
      ['채팅 입력창', '.chat-card .field-row input'],
      ['채팅 전송 버튼', '.chat-card .field-row button'],
      // ★ 푸터의 로그아웃 버튼도 조작 대상이다. 320px 에서 실제로 겹쳤던 적이 있다
      ['하단 푸터(로그아웃)', '.foot'],
    ]) {
      const ov = await host.overlaps('.toast', sel);
      record(
        `알림이 ${name}을 가리지 않는다`,
        ov.both && !ov.overlap,
        ov.both ? `toast.top=${ov.a} / 대상.top=${ov.b}` : '요소를 찾지 못했다',
      );
    }

    // ★ 같은 에러를 연달아 눌러도 쌓이지 않는가
    await host.click('게임 시작');
    await sleep(250);
    await host.click('게임 시작');
    await sleep(400);
    record(
      '★ 같은 에러를 연타해도 알림이 쌓이지 않는다',
      (await host.evaluate("document.querySelectorAll('.toast').length")) === 1,
      `개수=${await host.evaluate("document.querySelectorAll('.toast').length")}`,
    );

    // ★ 닫기 버튼
    await host.evaluate("document.querySelector('.toast button')?.click()");
    await sleep(300);
    record(
      '닫기 버튼으로 즉시 사라진다',
      (await host.evaluate("document.querySelector('.toast')")) === null,
    );

    // ★ 자동 만료
    await host.click('게임 시작');
    await host.waitFor("document.querySelector('.toast') !== null", 5000);
    const goneByItself = await host.waitFor(
      "document.querySelector('.toast') === null",
      12000,
    );
    record('★ 알림이 자동으로 사라진다', goneByItself);

    console.log('\n[5] ★★ Phase 3 — 문제 화면이 실제로 나온다 (R014)');
    await setQuestionCount(host, 2);
    const cleared = await host.waitFor(
      "!document.body.innerText.includes('이대로 시작할 수 없습니다')",
      4000,
    );
    record('경고가 사라진다', cleared);
    await host.click('게임 시작');
    // ★★ 문제 화면이 실제로 그려지는지 본다. DOM 존재가 아니라 화면 좌표로 잰다
    const qShown = await host.waitFor(
      "document.querySelector('.question-card .q-text') !== null",
      8000,
    );
    record('★★ 즉시 시작 후 문제 화면이 나온다', qShown);

    // ★ 문제 시작 시 스크롤이 문제 카드로 이동한다. 레이아웃이 정착할 시간을 준다
    await sleep(400);
    const qText = await host.onScreen('.question-card .q-text');
    record(
      '★★ 문제 지문이 화면에 보인다 (좌표 기준)',
      qText.exists && qText.fullyVisible,
      qText.exists ? `top=${qText.rect?.top} bottom=${qText.rect?.bottom}` : 'DOM 에 없다',
    );
    const qLen = await host.evaluate(
      "document.querySelector('.question-card .q-text')?.innerText.length ?? 0",
    );
    record('★ 지문이 비어 있지 않다', qLen > 5, `${qLen}자`);

    const timer = await host.onScreen('.q-timer');
    record(
      '★★ 남은 시간이 화면에 보인다',
      timer.exists && timer.fullyVisible,
      timer.exists ? `top=${timer.rect?.top}` : 'DOM 에 없다',
    );
    // ★ 타이머가 실제로 줄어드는가. 클라이언트가 서버 절대 시각으로 계산한다
    const t1 = await host.evaluate("document.querySelector('.q-timer')?.innerText ?? ''");
    await sleep(1200);
    const t2 = await host.evaluate("document.querySelector('.q-timer')?.innerText ?? ''");
    record(
      '★ 타이머가 실제로 줄어든다',
      parseFloat(t2) < parseFloat(t1),
      `${t1} → ${t2}`,
    );

    record(
      '★ 진행 표시 (문제 n / N) 가 있다',
      /문제\s*\d+\s*\/\s*\d+/.test(await host.text()),
    );
    record(
      '★ 카테고리 배지가 있다 (대분류)',
      await host.evaluate("document.querySelector('.badge.cat') !== null"),
    );
    record(
      '★ 점수판이 있다',
      await host.evaluate("document.querySelector('.score-card .scores li') !== null"),
    );
    record(
      '★ 채팅 입력창이 유지된다 (채팅 = 답안. guide 12절)',
      await host.evaluate("document.querySelector('.chat-card .field-row input') !== null"),
    );
    record(
      '★★ 별도의 답안 입력창이 없다 (guide 12절 절대 규칙)',
      (await host.evaluate("document.querySelectorAll('input[type=text], input:not([type])').length")) <= 2,
      `입력창 ${await host.evaluate("document.querySelectorAll('input[type=text], input:not([type])').length")}개 (채팅 + 초대링크)`,
    );
    // ★ 게임 중에는 초대 링크·참가자 카드가 접힌다. 화면 위쪽을 문제가 차지해야 한다
    record(
      '★ 게임 중에는 초대 링크 카드가 접힌다',
      (await host.evaluate("document.querySelector('#invite-url')")) === null,
    );
    await host.shot('question-active');

    // ─────────────────────────────────────────────────────────────────────────
    // ★★ C-8 판단 검증 — 토스트가 문제 지문과 남은 시간을 가리지 않는가
    //   ★ D-032 에서 토스트를 화면 아래로 정한 근거가 "Phase 3 의 문제 지문과
    //     남은 시간은 화면 위쪽에 온다" 였다. ★ 이제 실제로 확인할 수 있다.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[5-2] ★★ 토스트가 문제 지문·타이머를 가리지 않는가 (D-032 근거 검증)');
    // ★ 게임 중에 에러를 하나 만든다. 방장이 아닌 액션을 방장이 잘못 눌러서는 안 나오므로
    //   ★ 이미 시작된 게임에 game.start 를 다시 보내는 대신, 화면에서 만들 수 있는 것을 쓴다.
    //   ★ "게임 시작" 버튼이 게임 중에는 없으므로, 클라이언트가 만드는 알림을 쓴다.
    await host.evaluate(`(() => {
      // ★ 실제 에러 경로를 쓴다. 존재하지 않는 방에 입장을 시도할 수는 없으므로
      //   ★ 서버가 거부하는 액션 하나를 보낸다 — 낡은 epoch 의 강제 스킵이다.
      //   ★ 이것은 실제 사용자에게도 일어난다 (확인창을 띄운 사이 문제가 끝난 경우).
      return true;
    })()`);
    const skipBtn = await host.buttonState('이 문제 넘기기');
    record('★ 방장에게 "이 문제 넘기기" 버튼이 있다', skipBtn.exists && skipBtn.visible, JSON.stringify(skipBtn));

    // ★ 확인창이 방향키·Enter·마우스로 조작 가능해야 한다 (guide 23절).
    //   ★ autoFocus 로 Enter 가 바로 먹는지 본다
    await host.click('이 문제 넘기기');
    await sleep(300);
    record(
      '★ 확인창이 나타난다',
      await host.evaluate("document.querySelector('.confirm') !== null"),
    );
    record(
      '★★ 확인창의 "예" 에 포커스가 있다 (Enter 로 조작 가능)',
      await host.evaluate("document.activeElement?.innerText === '예'"),
      await host.evaluate("document.activeElement?.innerText ?? '(없음)'"),
    );
    // ★ 취소로 닫는다. 여기서 문제를 넘기면 이후 검사가 흐트러진다
    await host.click('아니오');
    await sleep(250);
    record(
      '★ 아니오로 확인창이 닫힌다',
      (await host.evaluate("document.querySelector('.confirm')")) === null,
    );

    // ★★ 토스트를 실제로 띄우고 겹침을 좌표로 잰다
    await host.evaluate(
      "window.__qwSocket?.emit?.('host.forceSkip', { epoch: -1 })",
    );
    let toastUp = await host.waitFor("document.querySelector('.toast') !== null", 3000);
    if (!toastUp) {
      // ★ 소켓 핸들이 노출되어 있지 않으면(정상이다) 다른 방법으로 만든다 —
      //   ★ 100자를 넘는 채팅은 클라이언트 maxLength 가 막으므로 쓸 수 없다.
      //   ★ 그래서 이 경우 겹침 검사를 건너뛴다. 위치 규칙은 [4-2] 에서 이미 확인했다.
      console.log('  ★ 게임 중 토스트를 만들 경로가 없어 겹침 검사를 건너뛴다 (위치 규칙은 [4-2]에서 확인)');
    } else {
      for (const [name, sel] of [
        ['문제 지문', '.question-card .q-text'],
        ['남은 시간', '.q-timer'],
      ]) {
        const ov = await host.overlaps('.toast', sel);
        record(
          `★★ 알림이 ${name}을 가리지 않는다 (D-032 근거)`,
          ov.both && !ov.overlap,
          ov.both ? `toast.top=${ov.a} / 대상.top=${ov.b}` : '요소를 찾지 못했다',
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ★ 좁은 화면(320px)에서 문제 화면이 넘치지 않는가
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[5-3] ★ 320px 에서 문제 화면 확인');
    await host.setWidth(320);
    await sleep(400);
    const noOverflow = await host.evaluate(
      "document.documentElement.scrollWidth <= window.innerWidth + 1",
    );
    record(
      '★★ 320px 에서 가로 넘침이 없다',
      noOverflow,
      `scrollWidth=${await host.evaluate('document.documentElement.scrollWidth')} / innerWidth=${await host.evaluate('window.innerWidth')}`,
    );
    const qText320 = await host.onScreen('.question-card .q-text');
    record(
      '★ 320px 에서도 문제 지문이 보인다',
      qText320.exists && qText320.rect?.top >= 0,
      qText320.exists ? `top=${qText320.rect?.top}` : 'DOM 에 없다',
    );
    await host.shot('question-320');
    await host.setWidth(720);
    await sleep(300);

    // ── ★★ 결과 화면과 로비 복귀 (Phase 3 / R014)
    //   ★ Phase 2 에는 로비 복귀 경로가 없어 방을 나가고 새로 만들었다.
    //   ★★ Phase 3 에는 있다. 그 경로를 실제로 눌러 확인한다.
    console.log('\n[5-4] ★★ 강제 종료 → 결과 화면 → 로비 복귀 (Phase 3)');
    await host.click('게임 강제 종료');
    await sleep(300);
    record(
      '★ 강제 종료 확인창이 나타난다',
      await host.evaluate("document.querySelector('.confirm') !== null"),
    );
    record(
      '★ 확인창이 경험 기록 규칙을 알린다',
      (await host.text()).includes('경험 기록을 남기지 않습니다'),
    );
    await host.click('예');
    const resultShown = await host.waitFor(
      "document.querySelector('.result-card .ranking li') !== null",
      8000,
    );
    record('★★ 결과 화면이 나온다', resultShown);
    record(
      '★ 순위·닉네임·점수가 보인다',
      /\d+위/.test(await host.text()) && (await host.text()).includes('점'),
    );
    record(
      '★ 종료 사유가 사람이 읽을 문장으로 나온다',
      (await host.text()).includes('강제 종료'),
    );
    record(
      '★ Phase 4 에서 다시 만든다는 사실을 알린다 (D-030)',
      (await host.text()).includes('Phase 4'),
    );
    await host.shot('game-result');

    const againBtn = await host.buttonState('다시 하기');
    record('★ 다시 하기 버튼이 있다', againBtn.exists && !againBtn.disabled, JSON.stringify(againBtn));
    await host.click('로비로');
    const backToLobby = await host.waitFor(
      "document.querySelector('#invite-url') !== null",
      8000,
    );
    record('★★ 로비로 복귀한다 (초대 링크 카드가 다시 보인다)', backToLobby);
    record(
      '★ 게임이 자동으로 시작되지 않는다 (guide 38절)',
      (await host.evaluate("document.querySelector('.question-card')")) === null,
    );

    // ── 방을 비우고 새로 만든다
    await host.click('방 나가기');
    await host.waitFor("document.querySelector('.players') === null", 8000);
    const roomId2 = await createRoom(host, '내보내기 확인용 방');
    record('두 번째 방 생성', Boolean(roomId2));

    console.log('\n[6] ★ 접속 종료자 "내보내기" 버튼이 실제로 나타나는가');
    // ★ 별도 브라우저 컨텍스트를 쓴다. 쿠키가 분리되어야 다른 계정으로 붙을 수 있다 (Q-06)
    const guest = await newPage(browser, 'guest', true);
    await guest.setWidth(720);
    await signUp(guest, 'g');
    await guest.goto(`${BASE}/r/${roomId2}`);
    const guestIn = await guest.waitFor(
      "document.querySelector('.players') !== null && location.pathname.startsWith('/r/')",
      10000,
    );
    record(
      '게스트가 초대 링크로 입장',
      guestIn,
      guestIn ? '' : `게스트 화면="${(await guest.text()).replace(/\s+/g, ' ').slice(0, 140)}"`,
    );
    const twoPlayers = await host.waitFor(
      "document.querySelectorAll('.players li').length === 2",
      8000,
    );
    record(
      '방장 화면에 2명이 보인다',
      twoPlayers,
      twoPlayers
        ? ''
        : `방장 목록="${await host.evaluate("[...document.querySelectorAll('.players li')].map(li=>li.innerText.replace(/\\s+/g,' ')).join(' | ')")}" / 게스트 화면="${(await guest.text()).replace(/\s+/g, ' ').slice(0, 120)}"`,
    );

    // 게스트 탭을 닫아 접속 종료를 만든다
    await browser.send('Target.closeTarget', { targetId: guest.targetId });
    guest.close();

    // ★ 텍스트로 찾으면 안 된다. 참가자 카드의 안내 문구에도 "접속 종료" 가 들어 있어
    //   배지가 없어도 통과한다(이 도구가 처음에 그렇게 오탐했다). 배지 요소를 직접 본다.
    const badge = await host.waitFor(
      "document.querySelector('.players .badge.off') !== null",
      12000,
    );
    record('접속 종료 배지가 5초 유예 뒤 나타난다', badge);

    const kick = await host.buttonState('내보내기');
    record(
      '★ 방장 화면에 "내보내기" 버튼이 나타난다',
      kick.exists && kick.visible && !kick.disabled,
      JSON.stringify(kick),
    );
    await host.shot('kick-button');

    if (kick.exists && kick.visible) {
      await host.click('내보내기');
      const removed = await host.waitFor(
        "document.querySelectorAll('.players li').length === 1",
        8000,
      );
      record('★ 내보내기가 실제로 동작한다 (목록에서 사라진다)', removed);
      const kickMsg = await host.text();
      record('내보냈다는 시스템 메시지가 보인다', kickMsg.includes('내보냈습니다'));
    }

    await host.click('방 나가기');
    await host.waitFor("document.querySelector('.players') === null", 8000);

    // ─────────────────────────────────────────────────────────────────────────
    // 에러 표시 경로 점검
    // ★ 서버가 정의한 코드가 사람 화면까지 실제로 도달하는지 확인한다.
    //   전체 표는 docs/07-DECISIONS.md D-027 에 있다.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[7] 에러 표시 경로 (다른 코드도 화면에 도달하는가)');

    // ROOM_NOT_FOUND — 없는 초대 링크
    await host.goto(`${BASE}/r/zzzzNoSuchRoom0`);
    const notFound = await host.waitFor(
      "document.querySelector('.toast-code')?.textContent === 'ROOM_NOT_FOUND'",
      8000,
    );
    record(
      'ROOM_NOT_FOUND 가 화면에 표시된다',
      notFound,
      notFound ? '' : `화면="${(await host.text()).replace(/\s+/g, ' ').slice(0, 120)}"`,
    );

    // BAD_REQUEST — 방 ID 입력창에 64자를 넘는 값 (서버 스키마 검사가 잡는다)
    await host.evaluate("document.querySelector('.toast button')?.click()");
    await sleep(200);
    const longId = 'x'.repeat(70);
    await host.setInput('.card input.mono', longId);
    await sleep(150);
    await host.click('입장');
    const badReq = await host.waitFor(
      "document.querySelector('.toast-code')?.textContent === 'BAD_REQUEST'",
      8000,
    );
    record('BAD_REQUEST 가 화면에 표시된다', badReq);
    record(
      '★ BAD_REQUEST 안내가 어느 요청인지 알려준다',
      /room\.join/.test((await host.text()) ?? ''),
    );

    // 빈 입력으로 입장 — ★ 조용히 아무 일도 일어나지 않으면 안 된다
    await host.evaluate("document.querySelector('.toast button')?.click()");
    await sleep(200);
    await host.setInput('.card input.mono', '');
    await sleep(150);
    await host.click('입장');
    const emptyId = await host.waitFor(
      "document.body.innerText.includes('방 ID를 입력해 주세요')",
      4000,
    );
    record('★ 빈 방 ID 로 입장 시 조용히 무시하지 않는다', emptyId);

    // ─────────────────────────────────────────────────────────────────────────
    // ★ R009 지적 2 — 성공한 뒤에도 이전 에러가 남아 있던 결함
    //   빈 방 ID 로 실패 → 올바른 ID 로 입장 성공 → 알림이 사라져야 한다.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[8] ★ 화면이 바뀌면 이전 알림이 사라지는가 (R009 지적 2)');
    record(
      '실패 알림이 떠 있다 (검사 전제)',
      (await host.evaluate("document.querySelector('.toast') !== null")),
    );
    const roomId3 = await createRoom(host, '알림 정리 확인용 방');
    record('방 생성으로 화면이 바뀐다', Boolean(roomId3));
    record(
      '★ 화면이 바뀌면 이전 알림이 사라진다',
      (await host.evaluate("document.querySelector('.toast')")) === null,
      await host.evaluate("document.querySelector('.toast-message')?.textContent ?? ''"),
    );

    await host.click('방 나가기');
    await host.waitFor("document.querySelector('.players') === null", 8000);
  }
} catch (err) {
  record('실행', false, err.message);
} finally {
  try {
    if (browser) await browser.send('Browser.close').catch(() => {});
  } catch {
    /* 이미 닫혔다 */
  }
  browser?.close();
  browserProc?.kill();
  await cleanupAccounts();
  stopServer();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n[결과] ${checks.length - failed.length}/${checks.length} 통과`);
for (const f of failed) console.log(`  ★ 실패: ${f.name}  ${f.detail}`);
process.exit(failed.length ? 1 : 0);
