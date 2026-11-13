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

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import WebSocket from 'ws';
import { TEST_DATABASE_URL, assertTestServer, useTestDb } from './test-db.mjs';
import { guardExit, rmDirRetry, sweepTemp } from './proc-lib.mjs';

// ★★★ R060 (D-253) — 검사는 quizweb_test 만(실 DB 로 서버를 띄우지 않는다 · 없으면 npm run db:test-init)
await useTestDb('ui-check');

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

/**
 * ★ CDP 포트. 지정하지 않으면 **후보를 차례로** 시도한다 (R028).
 *
 * ★★ 왜 — Windows 는 Hyper-V·WSL·Docker 가 TCP 포트 구간을 **동적으로 예약**한다
 *   (`netsh interface ipv4 show excludedportrange protocol=tcp`).
 *   ★ R028 실측: 9178~9677 이 예약되어 있어 기본값 9333 에서 Chrome 이
 *     "bind() … 액세스 권한에 의해 숨겨진 소켓" 으로 DevTools 서버를 못 열었다. 코드 결함이 아니라 환경이다.
 *   ★ 예약 구간은 재부팅마다 바뀔 수 있으므로 한 값에 묶지 않는다.
 */
const CDP_PORT_CANDIDATES = process.env.UICHECK_CDP_PORT
  ? [Number(process.env.UICHECK_CDP_PORT)]
  : [9333, 9922, 19333, 29333, 39333];
let CDP_PORT = CDP_PORT_CANDIDATES[0];
/**
 * ★ 서버 포트 — 지정하지 않으면 **열 수 있는 후보**를 고른다 (R033).
 *   ★ D-124 와 같은 이유다. Windows 가 TCP 구간을 동적으로 예약한다 —
 *     R033 실측: 3039~3138 이 예약되어 기본값 3101 에서 서버가 EACCES 로 죽었다.
 */
async function bindable(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}
const PORT_CANDIDATES = process.env.UICHECK_PORT
  ? [Number(process.env.UICHECK_PORT)]
  : [3101, 3301, 4101, 5101, 6101];
let PORT = PORT_CANDIDATES[0];
for (const cand of PORT_CANDIDATES) {
  if (await bindable(cand)) {
    PORT = cand;
    break;
  }
}
if (PORT !== PORT_CANDIDATES[0]) console.log(`[ui-check] ★ 서버 포트 ${PORT} 를 쓴다 (앞 후보는 열 수 없었다)`);
const EXTERNAL_URL = opt('--url', null);
const BASE = EXTERNAL_URL ?? `http://localhost:${PORT}`;
// ★ R038 — 휴대폰 폭 430 을 더했다 (큰 휴대폰)
const WIDTHS = [320, 360, 390, 430, 480, 720];
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
      // ★ R064 — 페이지 예외 · console.error 를 모아 둔다(결과 화면 "아예 안 보임" 같은 것을 숫자로 잡는다)
      if (msg.method === 'Runtime.exceptionThrown') {
        (this.pageErrors ??= []).push(String(msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? '').slice(0, 300));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        (this.pageErrors ??= []).push(('console.error ' + (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')).slice(0, 300));
      }
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
  /** ★ R053 ⓪ — 연결만 끊지 않고 **탭을 닫는다**(메모리를 돌려준다). 옛 close() 는 웹소켓만 닫아 탭이 남았다 */
  close() {
    super.close();
    const b = globalThis.__uicBrowser;
    if (b && this.targetId) void b.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }

  /** 페이지 안에서 쓸 라벨 추출 함수. <kbd> 배지를 뺀 버튼 이름을 돌려준다 */
  static LABEL_FN = `const labelOf = (el) => [...el.childNodes]
        .filter(n => !(n.nodeType === 1 && n.tagName === 'KBD'))
        .map(n => n.textContent)
        .join('')
        .trim();`;

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

  /**
   * ★ 폭과 높이를 함께 지정한다 (R016 — 한 화면 검사).
   *
   * ★★ 높이를 지정하지 않으면 "한 화면에 들어오는가" 를 잴 수 없다.
   *   ★ 기준 해상도를 정하고 그 높이로 재야 수치가 의미를 갖는다.
   */
  async setViewport(w, h) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);
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

  /**
   * 라벨이 정확히 일치하는 버튼을 누른다. 없으면 false
   *
   * ★★ 단축키 배지(<kbd>Alt+K</kbd>)는 라벨에서 제외한다 (R015).
   *   ★ 근거: 사람이 읽는 버튼 이름은 "이 문제 넘기기" 다. 배지는 안내일 뿐이다.
   *     ★ 배지를 붙인 순간 textContent 비교가 전부 깨졌다. 의미대로 비교해야 한다.
   */
  click(label) {
    return this.evaluate(`(() => {
      ${Page.LABEL_FN}
      // ★ R038 — 같은 이름의 버튼이 숨은 것과 보이는 것 둘이면 보이는 것을 고른다 (모바일 전용 줄 등)
      const all = [...document.querySelectorAll('button')].filter(x => labelOf(x) === ${JSON.stringify(label)});
      const b = all.find(x => x.getClientRects().length > 0) ?? all[0];
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

  /** 버튼 존재 여부와 disabled 상태. ★ 단축키 배지는 라벨에서 제외한다 */
  buttonState(label) {
    return this.evaluate(`(() => {
      ${Page.LABEL_FN}
      // ★ R038 — 같은 이름의 버튼이 숨은 것과 보이는 것 둘이면 보이는 것을 고른다 (모바일 전용 줄 등)
      const all = [...document.querySelectorAll('button')].filter(x => labelOf(x) === ${JSON.stringify(label)});
      const b = all.find(x => x.getClientRects().length > 0) ?? all[0];
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

  /**
   * ★★ 실제 키보드 입력을 보낸다 (Q-56 단축키 확인용).
   *
   * ★ 자바스크립트로 KeyboardEvent 를 만들어 dispatch 하지 않는다.
   *   ★★ 근거: 합성 이벤트는 브라우저의 기본 동작(문자 입력·메뉴)을 일으키지 않는다.
   *     그러면 "Alt 조합이 정말 문자를 만들지 않는가" 를 확인할 수 없다.
   *     ★ 이 도구의 존재 이유가 "사람이 쓰는 경로로 확인" 이다 (D-027).
   *
   * @param key      KeyboardEvent.key 값 ('g' / 'Escape' / 'Enter' / 'F8')
   * @param opts.alt Alt 조합인가
   * @param opts.text 문자로 입력되어야 하는가 (단독 문자키 확인용)
   */
  async key(key, opts = {}) {
    // ★ R034 — opts.code 로 자판 위치를 따로 줄 수 있다 (한글 자판 상태: key='ㄴ', code='KeyS')
    const code =
      opts.code ??
      (key.length === 1
        ? `Key${key.toUpperCase()}`
        : key);
    const vk = {
      Escape: 27,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      Enter: 13,
      Tab: 9,
      F2: 113,
      F4: 115,
      F8: 119,
      F9: 120,
    }[key] ?? opts.vk ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    const modifiers = opts.alt ? 1 : 0;
    // ★★ Enter 로 포커스된 버튼을 누르려면 **문자 이벤트**여야 한다.
    //   ★ rawKeyDown 만 보내면 keydown 리스너는 받지만 버튼의 기본 동작(click)이 안 난다.
    //     ★ 그 차이를 모르면 "Enter 만으로 확정" 을 검사할 수 없다.
    const text = opts.text ? key : key === 'Enter' ? '\r' : null;
    await this.send('Input.dispatchKeyEvent', {
      type: text === null ? 'rawKeyDown' : 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
      ...(text === null ? {} : { text }),
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
    await sleep(150);
  }

  /** 지금 포커스가 어디에 있는가. 확인창을 닫은 뒤 입력창으로 돌아왔는지 잰다 */
  activeEl() {
    return this.evaluate(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName,
        cls: el.className || null,
        inChatCard: Boolean(el.closest('.chat-card')),
        placeholder: el.getAttribute ? el.getAttribute('placeholder') : null,
      };
    })()`);
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
  for (const port of CDP_PORT_CANDIDATES) {
    CDP_PORT = port;
    const r = await launchBrowserOn();
    if (r) {
      if (port !== CDP_PORT_CANDIDATES[0]) console.log(`[ui-check] ★ CDP 포트 ${port} 를 썼다 (앞 후보는 열리지 않았다)`);
      return r;
    }
  }
  skip('Chrome 이 CDP 포트를 열지 못했다 (후보 전부 실패 — 포트 예약 구간을 확인하라)');
  return null;
}

// ★★ R100 (D) — 만든 Chrome 프로필 · 임시 폴더는 이 실행이 끝날 때(정상 · 실패 · 예외 · process.exit · Ctrl+C · 부모가 죽음) 지운다
//   (찬종 2026-11-13: %TEMP%\quizui-* 183개 · 9.1GB 가 쌓여 C 드라이브 360MB)
const tempDirs = [];
async function launchBrowserOn() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'quizui-'));
  tempDirs.push(profile);
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
      ...(process.env.NO_BFCACHE ? ['--disable-features=BackForwardCache'] : []),

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
  await sleep(500);
  rmDirRetry(profile);
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

/**
 * ★★★ "스크롤 없이 한 화면" 게이트 (R016 / 건우 요구).
 *
 * ★ 건우: "스크롤 없이 한 화면에 모든 요소가 다 보여야 한다. 스크롤 있으면 굉장히 조잡하다."
 *
 * ★★ 기준 해상도 — **1280×720 뷰포트**.
 *   ★ 근거: 노트북 1280×800 에서 브라우저 크롬(탭·주소창·북마크)을 빼면 내부 높이가
 *     약 720px 남는다(추정. 크롬 구성에 따라 다르다). 실사용 조합 중 가장 빡빡한 쪽이다.
 *   ★ 여기서 통과하면 더 큰 화면은 자동으로 만족한다.
 *
 * ★★ 콘솔에 남기기만 하면 회귀를 막지 못한다. **게이트로 만든다** (C-4 지시).
 *   ★ 화면 요소는 Phase 마다 늘어난다. 늘어난 그 라운드에서 걸려야 한다.
 */
const ONE_SCREEN = { w: 1280, h: 720 };

/**
 * ★★ R033 — 테마 3종. 한 화면 게이트는 **테마마다** 통과해야 한다.
 *   ★ 테마는 색·테두리·둥글기만 바꾸고 간격은 같게 두었지만, 테두리 두께가 달라 높이가 몇 px 달라질 수 있다.
 * ★ DESIGN_SHOTS=1 이면 테마마다 docs/design/<테마>-<화면>.png 를 찍는다 (docs/design-review.md 가 쓴다).
 */
const THEME_IDS = ['pastel', 'night']; // ★ R044 — 원색 삭제
const DESIGN_SHOTS = process.env.DESIGN_SHOTS === '1';

/**
 * ★★ R035 — **여러 PC 해상도** 에서 잰다 (건우: "어떤 PC 해상도에서든 스크롤 없이 — 노트북부터 큰 모니터까지").
 *   1280×720(가장 빡빡한 노트북 창) · 1366×768 · 1536×864(125% 배율 노트북) · 1920×1080 · 2560×1440
 */
const PC_SIZES = [
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1536, h: 864 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
];

/**
 * ★★ R035 — "컴포넌트 안 스크롤도 없다. 채팅만 예외" — 스크롤이 생기는 요소를 찾는다.
 *   overflow 가 auto/scroll 이고 내용이 칸보다 큰 요소. 채팅 로그(.chat-log)만 뺀다.
 */
const INNER_SCROLLERS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.chat-log') || el.closest('.emoji-grid')) continue;
    const st = getComputedStyle(el);
    if (!/(auto|scroll)/.test(st.overflowY + st.overflowX)) continue;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      out.push((el.className || el.tagName) + ' ' + el.scrollHeight + '/' + el.clientHeight);
    }
  }
  return out;
})()`;

async function measureOneScreen(page, label, { gate = true, shotName = null, sizes = PC_SIZES } = {}) {
  const original = await page.evaluate('document.documentElement.dataset.theme || "pastel"');
  let worst = 0;
  for (const theme of THEME_IDS) {
    await page.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    for (const size of sizes) {
      const r = await measureOneScreenOnce(page, `${label} [${theme} ${size.w}×${size.h}]`, { gate, size });
      worst = Math.max(worst, r);
      if (DESIGN_SHOTS && shotName && size.w === ONE_SCREEN.w) {
        const shot = await page.send('Page.captureScreenshot', { format: 'png' });
        const dir = path.join(ROOT, 'docs', 'design');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `${theme}-${shotName}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
  }
  await page.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(original)}`);
  await page.setViewport(ONE_SCREEN.w, ONE_SCREEN.h);
  return worst;
}

/**
 * ★★ R042 E — 라벨·버튼 글자가 꺾였는가 (두 줄 이상). 화면 크기별 글자(R041)로 고정 폭 자리가 모자라면 생긴다.
 *   채팅 · 떠 있는 창 안의 긴 글 · 글자 맞춤(FitText)은 뺀다.
 */
const LABEL_WRAPS = `(() => {
  const sel = 'button, .badge, .set-label, .hint-label, .state-pill, .preset, .chip, .pill, .seg-btn, .q-progress, .room-count, .skip-status, .winner-label, .late-label, .q-timer, .seat-rate, .pop-title, .confirm-title, .invite-code, .people-score, .menu-item, .people-sub, .list-head, .count-badge';
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.closest('.chat-log, .emoji-pop, .people-modal, .info-list, .keylist, .menu-modal, .confirm-modal')) continue;
    if (el.classList.contains('fit-text') || !(el.innerText || '').trim()) continue;
    // ★ 글자 줄의 개수 = 글자(텍스트 노드) 줄 상자의 서로 다른 세로 위치 수 (아이콘·여백·높이와 무관)
    const tops = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const rc of rg.getClientRects()) {
        if (rc.width < 1 || rc.height < 1) continue;
        if (!tops.some((t) => Math.abs(t - rc.top) < rc.height * 0.5)) tops.push(rc.top);
      }
    }
    if (tops.length > 1) out.push((el.className || el.tagName) + ':' + el.innerText.trim().slice(0, 12) + ':' + tops.length + '줄');
  }
  return out;
})()`;

async function measureOneScreenOnce(page, label, { gate = true, size = ONE_SCREEN } = {}) {
  await page.setViewport(size.w, size.h);
  await page.evaluate('window.scrollTo(0, 0)');
  await sleep(250);
  const m = JSON.parse(
    await page.evaluate(
      "JSON.stringify({ doc: document.documentElement.scrollHeight, view: window.innerHeight })",
    ),
  );
  const ratio = m.doc / m.view;
  const detail = `${m.doc}px / ${m.view}px = ${ratio.toFixed(2)}배`;
  if (gate) {
    record(`★★★ ${label} — 스크롤 없이 한 화면에 들어온다`, ratio <= 1.0, detail);
    const inner = await page.evaluate(INNER_SCROLLERS);
    record(`★★ ${label} — 칸 안 스크롤도 없다 (채팅 제외)`, inner.length === 0, inner.join(' / '));
    // ★ 검사 자체 확인용 (R042) — 옛 결함(라벨 52px · 줄바꿈 허용)을 되살려 이 검사가 실제로 잡는지 본다
    if (process.env.WRAP_SELFTEST) await page.evaluate("(() => { if (document.getElementById('wrap-selftest')) return; const st = document.createElement('style'); st.id = 'wrap-selftest'; st.textContent = '.set-label{flex:0 0 52px!important;white-space:normal!important}'; document.head.appendChild(st); })()");
    const wraps = await page.evaluate(LABEL_WRAPS);
    record(`★★ ${label} — 라벨·버튼 글자가 꺾이지 않는다 (R042 E)`, wraps.length === 0, wraps.join(' / '));
    if (ratio > 1.0) {
      // ★ R028 — 넘쳤을 때 무엇이 자리를 먹는지 바로 보이게 한다 (원인을 찾느라 다시 돌리지 않게)
      const parts = await page.evaluate(`(() => {
        const out = [];
        for (const col of ['.seats-left', '.center-main', '.chat-card', '.seats-right']) {
          const el = document.querySelector(col);
          if (!el) continue;
          out.push(col + ' ' + Math.round(el.getBoundingClientRect().height) + 'px: ' +
            [...el.children].map(c => (c.className || c.tagName) + '=' + Math.round(c.getBoundingClientRect().height)).join(' / '));
        }
        const q = document.querySelector('.question-card');
        if (q) out.push('question-card: ' + [...q.children].map(c => (c.className || c.tagName) + '=' + Math.round(c.getBoundingClientRect().height)).join(' / '));
        return out.join('\\n');
      })()`);
      console.log(`  ★ 높이 내역\n${parts.split('\n').map((l) => '    ' + l).join('\n')}`);
    }
  } else {
    console.log(`  ★ ${label} 높이: ${detail} (참고값. 게이트 아님)`);
  }
  return ratio;
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
    await assertTestServer(BASE, 'ui-check');
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
  bootedServer.stdout.on('data', (c) => {
    out += c.toString();
    if (process.env.UICHECK_SERVER_LOG) process.stdout.write(`[srv] ${c}`);
  });
  bootedServer.stderr.on('data', (c) => {
    out += c.toString();
    if (process.env.UICHECK_SERVER_LOG) process.stdout.write(`[srv!] ${c}`);
  });
  bootedServer.on('exit', (code) => {
    if (code !== null && code !== 0) console.log(`[ui-check] ★ 자기 서버가 꺼졌다 (code ${code}) — 마지막 출력:
${out.slice(-1500)}`);
  });

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
    process.env.DATABASE_URL ?? TEST_DATABASE_URL;
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

/**
 * ★★ R028 — 테스트용 일반 힌트를 출제 풀 맨 앞 두 문제에 잠깐 넣는다.
 *
 * ★ 왜 — DB 에는 아직 일반 힌트가 없다(GEN 이 다음 라운드에 채운다).
 *   ★ 힌트가 보이는 상태에서 "한 화면" 이 지켜지는지를 재려면 힌트가 있어야 한다.
 *   ★ ui-check 의 게임은 출제 가능 수를 2 로 줄여 풀 맨 앞 두 문제가 나온다 → 그 두 문제에 넣는다.
 * ★★ 규칙 — 비어 있는 행에만 넣고, 버전을 'ui-check' 로 표시해 끝나면 그 표시가 있는 행만 되돌린다.
 */
const UI_HINT_VERSION = 'ui-check';
// ★ 길이는 0008 의 상한(120자)을 꽉 채운다 — 가장 긴 경우에서 한 화면이 지켜지는지 본다
const UI_HINT_TEXT = (() => {
  const base = '[ui-check] 한 화면 검사를 위해 잠깐 넣은 일반 힌트입니다. 상한 길이를 꽉 채워 가장 긴 경우를 흉내 냅니다. ';
  let s = base;
  while (s.length < 120) s += '가나다라마바사아자차카타파하';
  return s.slice(0, 120);
})();

async function withPg(fn) {
  const url = process.env.DATABASE_URL ?? TEST_DATABASE_URL;
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    console.log(`  ★ DB 작업 실패 (건너뛴다): ${err.message}`);
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

function setUiHints() {
  return withPg(async (c) => {
    const r = await c.query(
      `UPDATE questions SET general_hint = $1, general_hint_version = $2
        WHERE id IN (SELECT id FROM questions
                      WHERE status = 'approved' AND is_active AND question_type = 'short_answer'
                      ORDER BY id LIMIT 3)
          AND general_hint IS NULL`,
      [UI_HINT_TEXT, UI_HINT_VERSION],
    );
    return r.rowCount ?? 0;
  });
}

function clearUiHints() {
  return withPg(async (c) => {
    const r = await c.query(
      `UPDATE questions SET general_hint = NULL, general_hint_version = NULL WHERE general_hint_version = $1`,
      [UI_HINT_VERSION],
    );
    return r.rowCount ?? 0;
  });
}

async function cleanupAccounts(pattern = `${ACCOUNT_PREFIX}%`, label = '테스트 계정') {
  const url =
    process.env.DATABASE_URL ?? TEST_DATABASE_URL;
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
/**
 * ★★ R073 (D-318 · D-319) — 옛 묶음은 첫 안내 투어 · 😊 안내 카드를 본 것으로 시작한다(투어 판이 화면을 덮어 옛 진짜 클릭이 막힌다).
 *   r073 묶음만 fresh=true 로 처음 상태(새 계정 = 투어 · 카드가 뜬다)를 본다.
 */
async function presetSeen(page) {
  await page.evaluate("(() => { try { localStorage.setItem('qw.flag.tourSeen', '1'); localStorage.setItem('qw.flag.emojiHelpDismissed', '1'); localStorage.setItem('qw.flag.emojiDemoSeen', '1'); } catch {} })()");
}
async function signUp(page, suffix, nickname = null, { fresh = false } = {}) {
  await page.goto(BASE);
  if (!fresh) await presetSeen(page);
  // ★ R097 — goto 는 고정 1.2초만 기다린다 → 느린 판에서도 탭이 그려질 때까지 기다린다(M2-lab 의 진짜 원인은 쿠키 공유 — r051Lab)
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === '회원가입')`, 10000);
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
    set(i[1], ${JSON.stringify(nickname ?? `UI${STAMP}${suffix}`)});
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
    "location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null",
    10000,
  );
  if (!ok) throw new Error(`방 생성 실패: ${(await page.text()).slice(0, 200)}`);
  return page.evaluate("location.pathname.slice(3)");
}

/** 방장 화면에서 문제 수를 바꾼다 */
async function setQuestionCount(page, n) {
  await page.setInput('.count-input', String(n));
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
    // ★★ R035 — 모바일(좁은 화면)은 **화면 스크롤 하나만**. 칸 안 스크롤은 없다 (채팅도 스크롤하지 않는다)
    if (screenName !== '로그인') {
      const inner = await page.evaluate(INNER_SCROLLERS);
      const chatOverflow = await page.evaluate("document.querySelector('.chat-log') ? getComputedStyle(document.querySelector('.chat-log')).overflowY : 'none'");
      record(
        `★★ ${screenName} @${w}px — 화면 스크롤 하나만 (칸 안 스크롤 0 · 채팅도 스크롤 없음)`,
        inner.length === 0 && (chatOverflow === 'hidden' || chatOverflow === 'none'),
        `${inner.join(' / ')} chat=${chatOverflow}`,
      );
    }
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

// -----------------------------------------------------------------------------
// ★★★ R039 — 스크린샷 검수 흐름 (`npm run ui-check -- --shots`)
//   ★ 건우: "스크린샷을 찍어 직접 보고 고쳐라." 숫자 게이트가 못 보는 어색한 간격·불균형을 사람이(=나) 눈으로 본다.
//   ★ 로그인 → 회원가입 → 방 목록 → 로비(방장·게스트) → 게임(힌트 잠김·일반·초성) → 확인창 → 정답 공개(세레머니·뒷북)
//     → 결과 · 모바일 키보드 올림/내림 을 PC·모바일 크기로 찍어 docs/design/r039/ 에 남긴다. 검사(기록)는 하지 않는다.
// -----------------------------------------------------------------------------
const SHOTS_ONLY = args.includes('--shots');
/** ★ R040 C-4 — 가장 긴 문제·정답·해설만 나오게 한 판을 모바일 폭에서 찍는다 (`--long`) */
const LONG_ONLY = args.includes('--long');
/** ★ R042 D — 소리 전수 점검 (`--sound`): 클릭(PC)·터치 흉내(모바일)로 한 판 — 소리마다 호출·재생 경로를 본다 */
const SOUND_ONLY = args.includes('--sound');
// ★ R041 — 1536×864 = 15인치 FHD 125% (건우 노트북). lap2 = 같은 노트북 브라우저 안쪽 높이(주소창·탭을 뺀 추정치)
const SHOT_PC = [
  { w: 1280, h: 720, n: 'pc' },
  { w: 1536, h: 864, n: 'lap' },
  { w: 1536, h: 730, n: 'lap2' },
  { w: 1920, h: 1080, n: 'fhd' },
  { w: 2560, h: 1440, n: 'qhd' },
];
const SHOT_MOB = [{ w: 360, h: 740, n: 'm360' }, { w: 390, h: 844, n: 'm390' }, { w: 430, h: 932, n: 'm430' }];

async function snap(page, name) {
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r040');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(dir, `${name}.png`), Buffer.from(r.data, 'base64'));
  console.log(`  📸 ${name}`);
  if (WRAP_AUDIT) await wrapAudit(page, name);
}

/**
 * ★★ R064 (D-267 · 찬종 #31 "줄바꿈 되는게 최악 … 다른 요소에서도 줄바꿈 되는거 없는지 검토해") — 줄바꿈 전수 감사.
 *   `--wrap-audit`(또는 WRAP_AUDIT=1) 이면 그림을 찍을 때마다 그 화면에서 **두 줄 이상으로 그려진 글**을 모은다.
 *   글 상자(자기 글자를 가진 요소)마다 Range 로 줄 수를 센다(white-space: pre/pre-wrap 은 뺀다 — 일부러 줄을 나눈 자리).
 *   [data-wrap-ok] 안은 "의도한 설명문"(문제 글 · 채팅 · 해설 등) — 목록에는 남기되 ok 표시.
 *   결과: docs/design/<SHOT_DIR>/wrap-audit.txt (묶음마다 한 파일 · 같은 자리+글은 한 번)
 */
const WRAP_AUDIT = process.argv.includes('--wrap-audit') || process.env.WRAP_AUDIT === '1';
const wrapSeen = new Set();
const WRAP_PROBE = `JSON.stringify((() => {
  const out = [];
  const path = (el) => { const parts = []; let e = el; for (let i = 0; i < 3 && e && e !== document.body; i += 1) { parts.unshift(e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')); e = e.parentElement; } return parts.join(' > '); };
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'svg', 'TEXTAREA', 'INPUT', 'OPTION'].includes(el.tagName)) continue;
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (texts.length === 0) continue;
    const cs = getComputedStyle(el);
    if (/pre/.test(cs.whiteSpace) || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.bottom < 0 || box.top > innerHeight) continue;
    const tops = [];
    for (const t of texts) {
      const rg = document.createRange();
      rg.selectNodeContents(t);
      for (const q of rg.getClientRects()) if (q.width > 1 && q.height > 0 && !tops.some((y) => Math.abs(y - q.top) < q.height * 0.5)) tops.push(q.top);
    }
    // ★ R064 — 넘침(#28 "글자가 튀어나감"): 글이 제 상자 밖으로 그려짐 · 일부러 자르는 자리(overflow hidden · …)는 뺀다
    const clipped = cs.overflowX !== 'visible' || (el.parentElement && getComputedStyle(el.parentElement).overflowX !== 'visible');
    let spill = false;
    if (!clipped) {
      for (const t of texts) {
        const rg = document.createRange();
        rg.selectNodeContents(t);
        for (const q of rg.getClientRects()) if (q.width > 1 && (q.right > box.right + 2 || q.left < box.left - 2)) spill = true;
      }
    }
    if (spill) {
      const text = texts.map((t) => t.textContent.trim()).join(' ').replace(/\\s+/g, ' ');
      out.push({ sel: path(el) + ' [넘침]', lines: tops.length, w: Math.round(box.width), text: text.slice(0, 40), ok: false, vw: innerWidth });
      continue;
    }
    if (tops.length < 2) continue;
    const text = texts.map((t) => t.textContent.trim()).join(' ').replace(/\\s+/g, ' ');
    out.push({ sel: path(el), lines: tops.length, w: Math.round(box.width), text: text.slice(0, 40), ok: !!el.closest('[data-wrap-ok]'), vw: innerWidth });
  }
  return out;
})())`;
async function wrapAudit(page, name) {
  /** @type {{ sel: string; lines: number; w: number; text: string; ok: boolean; vw: number }[]} */
  let rows = [];
  try {
    rows = JSON.parse(await page.evaluate(WRAP_PROBE));
  } catch {
    return [];
  }
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r040');
  const lines = [];
  const fresh = [];
  for (const r of rows) {
    const k = `${r.sel}|${r.text}|${r.ok}`;
    if (wrapSeen.has(k)) continue;
    wrapSeen.add(k);
    fresh.push(r);
    lines.push(`${r.ok ? 'ok  ' : 'WRAP'} | ${name} @${r.vw} | ${r.sel} | ${r.lines}줄 · ${r.w}px | ${r.text}`);
  }
  const file = path.join(dir, 'wrap-audit.txt');
  // 한 번 돌 때마다 새로(앞선 실행의 목록과 섞이지 않게)
  if (!wrapAudit.started) {
    wrapAudit.started = true;
    writeFileSync(file, '');
  }
  if (lines.length) appendFileSync(file, lines.join('\n') + '\n');
  return fresh;
}
async function snapSizes(page, name, sizes) {
  for (const s of sizes) {
    await page.setViewport(s.w, s.h);
    await sleep(450);
    await page.evaluate('window.scrollTo(0, 0)');
    await snap(page, `${name}-${s.n}`);
  }
}

// ★ R040 — 검수 스크린샷은 **한도 길이의 한글 닉네임**으로 찍는다 (가장 넓게 차지하는 경우)
const SHOT_NICKS = (process.env.SHOT_NICKS ?? '').split(',').filter(Boolean);
const shotNick = (i) => SHOT_NICKS[i] ?? null;
/** ★ R040 — 닉네임이 나오는 자리마다 폭·넘침·줄 수를 잰다 (한도 근거) */
const NICK_PROBE = `(() => {
  const sels = ['.seat-nick', '.winner-name', '.ceremony-head', '.late-item', '.ranking .nick', '.champion-name', '.chat-line .nick', '.room-head .nick', '.toast'];
  const c = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(el);
    c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const ga = c.measureText('가').width;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
    // ★ R041 — 닉네임이 담긴 카드(참여자 칸 · 순위 줄 등)의 안쪽 오른쪽 끝을 넘는가 (글자 자체가 안 넘쳐도 자리가 밀려 나갈 수 있다)
    const box = el.closest('.seat-card, .ranking li, .ceremony, .reveal, .chat-line, .champion');
    let outR = 0;
    if (box) { const br = box.getBoundingClientRect(); const pr = parseFloat(getComputedStyle(box).paddingRight) || 0; outR = Math.round(r.right - (br.right - pr)); }
    out.push({ sel, w: Math.round(r.width), cw: el.clientWidth, sw: el.scrollWidth, font: cs.fontSize, ga: +ga.toFixed(1), lines: Math.round(r.height / lh), fit: Math.floor(el.clientWidth / ga), outR, text: el.innerText.slice(0, 30) });
  }
  return JSON.stringify(out);
})()`;
async function probeNicks(page, label) {
  if (!process.env.NICK_PROBE) return;
  console.log(`[nick-probe] ${label} ${page.label} ${await page.evaluate('innerWidth')}px ${await page.evaluate(NICK_PROBE)}`);
}

/**
 * ★★ R040 C-4 — 가장 긴 문제 · 정답 · 해설 (DB 에서 고른다) 을 모바일 360 · 390 · 430 과 PC 에서 찍고 잰다.
 *   ★ 문제 데이터는 건드리지 않는다 — 테스트 계정에 **나머지 문제의 경험 기록**을 넣어 출제 풀을 그 문제들만 남긴다
 *     (테스트 계정을 지우면 경험 기록도 함께 지워진다 — ON DELETE CASCADE).
 */
const LONG_SIZES = [
  { n: 'm360', w: 360, h: 740 },
  { n: 'm390', w: 390, h: 844 },
  { n: 'm430', w: 430, h: 932 },
  { n: 'pc', w: 1280, h: 720 },
  // ★ R041 — 건우 노트북(15인치 FHD 125%) · 같은 노트북 브라우저 안쪽 높이(추정) · FHD · QHD
  { n: 'lap', w: 1536, h: 864 },
  { n: 'lap2', w: 1536, h: 730 },
  { n: 'fhd', w: 1920, h: 1080 },
  { n: 'qhd', w: 2560, h: 1440 },
];
/** ★ R041 — 한글 10자 닉네임 (실행마다 다르게 — 시각 글자를 한글 음절로) */
const HANGUL10 = '십자닉네임' + [...STAMP].map((ch) => String.fromCharCode(0xac00 + parseInt(ch, 36) * 84 + 7)).join('');
async function longestQuestionIds() {
  return withPg(async (c) => {
    const base = `status = 'approved' AND is_active AND question_type = 'short_answer'`;
    const q = (await c.query(`SELECT id FROM questions WHERE ${base} ORDER BY char_length(question_text) DESC, id LIMIT 1`)).rows[0].id;
    const e = (await c.query(`SELECT id FROM questions WHERE ${base} ORDER BY char_length(coalesce(explanation, '')) DESC, id LIMIT 1`)).rows[0].id;
    const a = (
      await c.query(
        `SELECT q.id FROM questions q JOIN question_answers a ON a.question_id = q.id AND a.is_primary WHERE ${base.replaceAll('status', 'q.status').replace('is_active', 'q.is_active').replace('question_type', 'q.question_type')}
         ORDER BY char_length(a.answer_text) DESC, q.id LIMIT 1`,
      )
    ).rows[0].id;
    return [...new Set([q, e, a].map(String))];
  });
}
async function measureLong(page) {
  return JSON.parse(
    await page.evaluate(`JSON.stringify((() => {
      const se = document.scrollingElement;
      const qt = document.querySelector('.q-text');
      const f = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontSize : null; };
      return {
        pageScroll: se.scrollHeight - innerHeight,
        hScroll: se.scrollWidth - innerWidth,
        qFont: f('.q-line') ?? f('.q-text'),
        explainFont: f('.reveal-explain'),
        answerFont: f('.reveal-answer strong'),
        qOverflow: qt ? qt.scrollHeight - qt.clientHeight : null,
        qs: document.querySelector('.room')?.dataset.qs ?? null,
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
        // ★ R041 — 닉네임 자리: "…" · 넘침 · 담긴 칸 밖으로 밀려남
        nickBad: [...document.querySelectorAll('.seat-nick, .winner-name, .ceremony-head, .ranking .nick, .champion-name, .late-item, .chat-line .nick')].filter((el) => el.getBoundingClientRect().width > 0).filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.textOverflow === 'ellipsis') return true;
          if (el.classList.contains('fit-text') && el.scrollWidth > el.clientWidth + 1) return true;
          const box = el.closest('.seat-card, .ranking li, .ceremony, .reveal-main');
          if (!box) return false;
          const br = box.getBoundingClientRect();
          return el.getBoundingClientRect().right > br.right - (parseFloat(getComputedStyle(box).paddingRight) || 0) + 1;
        }).map((el) => el.className + ':' + el.innerText.slice(0, 12)),
        // ★ R042 G — 해설: 자기 자리 안(넘침 없음 — 글자 맞춤 · 마지막 줄 줄임) · 소감 · 뒷북과 겹치지 않는다
        explain: (() => {
          const ex = document.querySelector('.reveal-explain');
          if (!ex) return null;
          const a = ex.getBoundingClientRect();
          const hit = (sel) => { const o = document.querySelector(sel); if (!o) return false; const b = o.getBoundingClientRect(); return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; };
          return { over: ex.scrollHeight - ex.clientHeight, clamp: ex.dataset.clamp, fit: ex.dataset.fit, hitCeremony: hit('.ceremony'), hitLate: hit('.late-row'), hitNext: hit('.reveal-next') };
        })(),
        cardH: Math.round(document.querySelector('.question-card')?.getBoundingClientRect().height ?? 0),
        // ★ R041 E-2 — "+1" 은 닉네임 바로 옆
        plus: (() => { const n = document.querySelector('.winner-name'); const pl = document.querySelector('.winner-plus'); if (!n || !pl) return null; const a = n.getBoundingClientRect(); const b = pl.getBoundingClientRect(); return { gap: Math.round(b.left - a.right), dy: Math.round((b.top + b.height / 2) - (a.top + a.height / 2)) }; })(),
        squeeze: document.querySelector('.room')?.classList.contains('squeeze') ?? false,
      };
    })())`),
  );
}
async function longFlow(browser, suffix = 'h') {
  const ids = await longestQuestionIds();
  console.log(`[long] 가장 긴 문제·해설·정답 = ${ids.join(', ')}`);
  const host = await newPage(browser, `long-${suffix}`, true);
  await host.setViewport(1280, 720);
  await signUp(host, suffix, suffix === 'h' ? (shotNick(0) ?? HANGUL10) : HANGUL10);
  await createRoom(host, '긴 글 확인');
  const marked = await withPg(async (c) =>
    (
      await c.query(
        `INSERT INTO question_experiences (account_id, question_id)
         SELECT a.id, q.id FROM accounts a, questions q WHERE a.login_id = $1 AND NOT (q.id = ANY($2::bigint[]))
         ON CONFLICT DO NOTHING`,
        [`${ACCOUNT_PREFIX}_${suffix}`, ids],
      )
    ).rowCount,
  );
  console.log(`[long] 테스트 계정 경험 기록 ${marked}행 (나머지 문제 제외용)`);
  await setQuestionCount(host, ids.length);
  await sleep(600);
  await host.click('게임 시작');
  const out = [];
  for (let i = 0; i < ids.length; i += 1) {
    const up = await host.waitFor("document.querySelector('.q-timebar') !== null && document.querySelector('.reveal') === null", 20000);
    if (!up) break;
    await sleep(500);
    const qid = await withPg(async (c) =>
      (await c.query(`SELECT id FROM questions WHERE question_text = $1`, [await host.evaluate("document.querySelector('.q-text')?.dataset.text ?? ''")])).rows[0]?.id,
    );
    for (const sz of LONG_SIZES) {
      await host.setViewport(sz.w, sz.h);
      await sleep(450);
      await host.evaluate('window.scrollTo(0, 0)');
      if (LONG_ONLY) await snap(host, `20-long-q${qid}-game-${sz.n}`);
      out.push({ qid, at: 'game', size: sz.n, ...(await measureLong(host)) });
    }
    const ans = await withPg(async (c) =>
      (await c.query(`SELECT answer_text FROM question_answers WHERE question_id = $1 ORDER BY is_primary DESC, id LIMIT 1`, [qid])).rows[0]?.answer_text ?? '',
    );
    await host.setInput('.chat-card input', ans);
    await host.click('전송');
    await host.waitFor("document.querySelector('.reveal') !== null", 5000);
    await host.setInput('.chat-card input', '이 정도 길이면 소감 칸은 어떻게 보일까? 줄이 바뀌고 넘치면 줄임표로 끝나야 한다 ㅋㅋㅋ 정말 긴 소감');
    await host.click('전송');
    await host.evaluate("document.activeElement?.blur()"); // ★ 키보드가 내려간 상태 (C-3 — 정답 공개 때 모바일은 내린다)
    for (const sz of LONG_SIZES) {
      await host.setViewport(sz.w, sz.h);
      await sleep(450);
      await host.evaluate('window.scrollTo(0, 0)');
      if (LONG_ONLY) await snap(host, `20-long-q${qid}-reveal-${sz.n}`);
      if (process.env.SEAT_DEBUG && sz.n === 'pc') {
        console.log('[seat-debug] ' + await host.evaluate(`JSON.stringify([...document.querySelectorAll('.seat-nick')].map(el => {
          const cs = getComputedStyle(el); const p = el.parentElement; const card = el.closest('.seat-card');
          return { cw: el.clientWidth, sw: el.scrollWidth, fit: el.dataset.fit, wrap: el.dataset.wrap, minW: cs.minWidth, flex: cs.flex, fs: cs.fontSize, inline: el.style.fontSize,
            pcw: p.clientWidth, psw: p.scrollWidth, cardCw: card.clientWidth, cls: card.className, kids: [...p.children].map(k => k.className + ':' + Math.round(k.getBoundingClientRect().width)) };
        }))`));
      }
      out.push({ qid, at: 'reveal', size: sz.n, ...(await measureLong(host)) });
    }
    await host.setViewport(1280, 720);
  }
  for (const o of out) console.log(`[long] ${JSON.stringify(o)}`);
  return out;
}

/** ★ R040 A-9 — 닉네임 자리에 "…" 줄임이 없고, 자리에 맞게 들어갔는가 */
const NICK_NO_ELLIPSIS = `JSON.stringify((() => {
  const bad = [];
  for (const el of document.querySelectorAll('.seat-nick, .winner-name, .ceremony-head, .ranking .nick, .champion-name, .late-item, .chat-line .nick')) {
    if (el.getBoundingClientRect().width === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') bad.push('ellipsis:' + el.className);
    if (el.classList.contains('fit-text') && el.scrollWidth > el.clientWidth + 1) bad.push('넘침:' + el.className + ':' + el.innerText);
  }
  return bad;
})())`;

/**
 * ★★ R042 D — 소리 전수 점검.
 *   방장 = PC 1280 (마우스 클릭) · 참가자 = 모바일 흉내 390 (터치 흉내 + 탭).
 *   ★ 헤드리스 Chrome 은 자동재생 정책을 재현하지 못한다(실측) — "터치가 조작으로 인정되는가" 는 실기기에서만.
 *   한 판: 입장 → 카운트다운 → 1번 시간 종료(힌트·마지막 5초 포함) → 2번 참가자 정답(소감 채팅 · 이모티콘) → 3번 넘기기 투표 → 결과.
 *   ★ 참가자는 정답 공개 직전에 입력칸에 포커스가 있다 — R040·R041 의 "키보드 내림(포커스 해제)" 이 소리를 막는지 본다.
 *   두 화면의 window.__qwSoundLog (호출 · 실제로 울렸나 · 그때 오디오 상태) 를 모아 표로 찍는다.
 */
async function trustedClick(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function trustedTap(page, x, y) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function soundFlow(browser) {
  const host = await newPage(browser, 'host');
  await host.setViewport(1280, 720);
  await signUp(host, 'h');
  const roomId = await createRoom(host, '소리 점검');
  await setQuestionCount(host, 3);
  const before = await host.evaluate("document.documentElement.dataset.audio ?? 'none'");
  await trustedClick(host, 640, 22);
  const hostAudio = await host.waitFor("document.documentElement.dataset.audio === 'running'", 4000);
  console.log(`[sound] 방장(PC) — 클릭 전 ${before} · 진짜 클릭 뒤 running=${hostAudio}`);

  const guest = await newPage(browser, 'guest', true);
  await guest.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await guest.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await signUp(guest, 'g');
  await guest.goto(`${BASE}/r/${roomId}`);
  await guest.waitFor("document.querySelector('.stage') !== null", 10000);
  const gBefore = await guest.evaluate("document.documentElement.dataset.audio ?? 'none'");
  // ★ 검사의 전제 — 스크립트 클릭(사용자 조작 아님)으로는 소리가 열리지 않아야 한다 (자동재생 정책이 실제로 걸려 있는가)
  await guest.evaluate("document.body.click()");
  await sleep(400);
  const gScript = await guest.evaluate("document.documentElement.dataset.audio ?? 'none'");
  console.log(`[sound] 참가자 — 스크립트 클릭만 했을 때 ${gScript}`);
  // ★★ 실측 (R042): 이 헤드리스 Chrome 은 --autoplay-policy=user-gesture-required 를 줘도 스크립트 클릭으로 소리가 열린다 —
  //   자동재생 정책이 **재현되지 않는다**. 그래서 이 검사는 "터치가 사용자 조작으로 인정되는가" 를 증명하지 못한다 → 실기기(13-PENDING A40·A43).
  //   이 검사가 확인하는 것: 소리마다 호출·재생 경로가 살아 있는가 · 키보드 내림(포커스 해제)이 문제 끝 소리를 막는가.
  await trustedTap(guest, 100, 30);
  const guestAudio = await guest.waitFor("document.documentElement.dataset.audio === 'running'", 4000);
  console.log(`[sound] 참가자(모바일 흉내) — 탭 전 ${gBefore} · 진짜 탭 뒤 running=${guestAudio}`);
  await sleep(500);

  // 게임 시작 → 1번은 시간 종료까지 둔다 (힌트 · 마지막 5초 · 시간 종료)
  await host.click('게임 시작');
  await host.waitFor("document.querySelector('.q-timebar') !== null", 15000);
  await guest.evaluate("document.querySelector('.chat-card input')?.focus()");
  await host.waitFor("document.querySelector('.reveal') !== null", 50000);
  const kb1 = await guest.evaluate("JSON.stringify({ tag: document.activeElement?.tagName, dropped: document.documentElement.dataset.kbDropped ?? '0' })");
  console.log(`[sound] 1번 시간 종료 — 참가자 포커스 ${kb1}`);
  // 2번 — 참가자가 입력칸에서 정답 → 소감 채팅 → 방장 이모티콘
  await host.waitFor("document.querySelector('.reveal') === null && document.querySelector('.q-timebar') !== null", 15000);
  const text = await host.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
  const ans = await withPg(async (c) =>
    (await c.query(`SELECT a.answer_text FROM questions q JOIN question_answers a ON a.question_id = q.id WHERE q.question_text = $1 ORDER BY a.is_primary DESC, a.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '',
  );
  await host.setInput('.chat-card input', '이거 뭐지');
  await host.click('전송');
  await guest.evaluate("document.querySelector('.chat-card input')?.focus()");
  await guest.setInput('.chat-card input', ans);
  await guest.click('전송');
  await host.waitFor("document.querySelector('.reveal') !== null", 5000);
  await sleep(300);
  const kb2 = await guest.evaluate("JSON.stringify({ tag: document.activeElement?.tagName, dropped: document.documentElement.dataset.kbDropped ?? '0' })");
  console.log(`[sound] 2번 정답 — 참가자 포커스 ${kb2}`);
  await guest.setInput('.chat-card input', '메롱');
  await guest.click('전송');
  await host.evaluate("document.querySelector('.chat-card input')?.focus()");
  await host.key('2', { alt: true, code: 'Digit2', vk: 50 });
  // 3번 — 둘 다 넘기기 투표
  await host.waitFor("document.querySelector('.reveal') === null && document.querySelector('.q-timebar') !== null", 15000);
  await sleep(400);
  await host.evaluate("document.querySelector('.skip-btn')?.click()");
  await guest.evaluate("document.querySelector('.skip-btn')?.click()");
  await host.waitFor("document.querySelector('.result-card') !== null", 20000);
  await sleep(800);

  const logs = {};
  for (const [name, pg] of [['방장 PC', host], ['참가자 모바일', guest]]) {
    logs[name] = JSON.parse(await pg.evaluate('JSON.stringify(window.__qwSoundLog ?? [])'));
  }
  const ids = ['bgm:bounce', 'join', 'tick', 'go', 'question', 'hint', 'urgent', 'timeout', 'correct', 'mine', 'skip', 'result', 'chat:chat', 'chat:taunt', 'chat:emoji'];
  console.log('[sound] 소리         | 방장 PC (울림/호출)      | 참가자 모바일 (울림/호출)');
  const table = [];
  for (const id of ids) {
    const row = [id];
    for (const name of Object.keys(logs)) {
      const l = logs[name].filter((e) => e.id === id);
      const played = l.filter((e) => e.played).length;
      const why = [...new Set(l.filter((e) => !e.played).map((e) => e.why))].join(',');
      row.push(`${played}/${l.length}${why ? ' (' + why + ')' : ''}`);
    }
    table.push(row);
    console.log(`[sound] ${row[0].padEnd(12)} | ${row[1].padEnd(24)} | ${row[2]}`);
  }
  record('★ R042 D — PC: 클릭 뒤 오디오가 깨어 있다', hostAudio);
  record('★ R042 D — 모바일 흉내(터치): 탭 뒤 오디오가 깨어 있다', guestAudio);
  const mustHost = ['bgm:bounce', 'join', 'tick', 'go', 'question', 'urgent', 'timeout', 'correct', 'skip', 'result', 'chat:chat', 'chat:taunt', 'chat:emoji'];
  const mustGuest = ['bgm:bounce', 'tick', 'go', 'question', 'urgent', 'timeout', 'mine', 'skip', 'result', 'chat:chat', 'chat:taunt', 'chat:emoji'];
  for (const [name, must] of [['방장 PC', mustHost], ['참가자 모바일', mustGuest]]) {
    const miss = must.filter((id) => !logs[name].some((e) => e.id === id && e.played));
    record(`★★★ R042 D — ${name}: 소리마다 실제로 울렸다 (${must.length}종)`, miss.length === 0, miss.length ? `안 울림: ${miss.join(', ')}` : '');
  }
  record(
    '★★★ R042 D — 모바일: 정답 공개 때 키보드를 내려도(포커스 해제) 문제 끝 소리(시간 종료 · 정답 · 넘김)가 울린다',
    // ★ R096 — 낡은 기대 고침: R075 (D-325) 부터 판 중(공개 포함)에는 키보드를 내리지 않는다(결과 · 로비 · 일시정지만) → 해제 횟수는 적기만 하고 소리 셋이 울리는지만 본다
    ['timeout', 'mine', 'skip'].every((id) => logs['참가자 모바일'].some((e) => e.id === id && e.played)),
    `포커스 해제 ${JSON.parse(kb2).dropped}번(R075 뒤 판 중 0 이 맞다)`,
  );
  return { hostAudio, guestAudio, logs, table };
}

/** ★ R043 — 단축키(Alt+K·Q·R·A·L·X)를 껐다 → 검사·촬영도 화면의 버튼으로 같은 경로를 탄다 */
async function openHostSkip(page) {
  await page.evaluate("[...document.querySelectorAll('.host-tools button')].find(b => b.innerText.trim() === '방장')?.click()");
  await sleep(250);
}
async function openHostEnd(page) {
  const clicked = await page.evaluate("(() => { const b = [...document.querySelectorAll('.host-tools button, .paused-card button')].find(b => /종료/.test(b.innerText)); b?.click(); return Boolean(b); })()");
  if (!clicked) console.log('  ★ 종료 버튼을 찾지 못했다');
  await sleep(250);
}
/** 나가기 — 상단 버튼(또는 ☰) → 확인 팝업 "나가기" (R043: 로비에서도 확인) */
async function leaveViaUi(page) {
  await page.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
  await page.waitFor("document.querySelector('.confirm-modal[data-kind=\"leave\"]') !== null", 3000);
  await page.evaluate("document.querySelector('.confirm-modal[data-kind=\"leave\"] .confirm-actions button')?.click()");
}
/**
 * ★★★ R044 A-2 — **진짜 클릭**(CDP 마우스 입력). element.click() 은 화면에서 무엇이 덮고 있든 그 요소에 바로 눌린다 —
 *   사람이 누르는 것과 다르다(덮인 버튼 · 눌림 순서 · 바깥 누르기 닫힘을 못 본다). 버튼 가운데 좌표를 진짜로 누른다.
 *   반환: { ok, hit } — hit = 그 좌표에서 실제로 맨 위에 있던 요소가 그 버튼(또는 그 안)인가
 */
async function realClick(page, selector, text = null) {
  const info = JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((b) => b.offsetParent !== null || getComputedStyle(b).position === 'fixed');
    const el = ${text === null ? 'els[0]' : `els.find((b) => b.innerText.trim() === ${JSON.stringify(text)})`};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, hit: Boolean(top && (top === el || el.contains(top))), top: top ? (top.className || top.tagName) : null };
  })())`));
  if (!info) return { ok: false, hit: false };
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: info.x, y: info.y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
  return { ok: true, hit: info.hit, top: info.top };
}
/** 진짜 클릭으로 화면 바깥 빈 곳(왼쪽 아래 구석)을 누른다 */
async function realClickAt(page, x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
}
/** ★ R044 B — 맨 위 팝업을 ✕ 로 닫는다 ([취소] 버튼은 없앴다). 확인 팝업이 있으면 그것부터 */
async function closeTop(page) {
  await page.evaluate("(document.querySelector('.confirm-modal .popup-close') ?? [...document.querySelectorAll('.popup-close')].filter((b) => b.offsetParent !== null).pop())?.click()");
  await sleep(150);
}
/** 확인 팝업의 첫 버튼(확정) */
async function confirmFirst(page) {
  await page.evaluate("document.querySelector('.confirm-modal .confirm-actions button')?.click()");
}

// -----------------------------------------------------------------------------
// ★★★ R043 C/D — 친구 · 알림 · 초대 · 새 비밀번호 화면 스크린샷 (`npm run ui-check -- --social`)
//   ★ 새 화면을 PC 1280·1536×864·1920·2560 / 모바일 360·390·430, 방장·게스트로 찍는다.
//   ★ 비교 그림: 친구 창 ↔ 참여자 창(👥), 알림 창 ↔ 설정 창(⚙)
// -----------------------------------------------------------------------------
const SOCIAL_ONLY = args.includes('--social');
if (SOCIAL_ONLY) process.env.SHOT_DIR ??= 'verify'; // ★ R048 — 옛 라운드 그림(r045 …)을 verify 가 덮어쓰지 않게. 라운드 그림은 SHOT_DIR=rNNN 로 따로
const loginOf = (suffix) => `${ACCOUNT_PREFIX}_${suffix}`.toLowerCase();
async function clickIn(page, selector, text) {
  return page.evaluate(
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.innerText.trim() === ${JSON.stringify(text)} && b.offsetParent !== null); b?.click(); return Boolean(b); })()`,
  );
}
async function requestFriend(page, loginId) {
  await page.setInput('.friend-add input', loginId);
  await sleep(150);
  await clickIn(page, '.friend-add button', '신청');
  await sleep(700);
}
/** ★ R043 D — 떠 있는 창 검사: 화면 안 · ✕ 크기·자리 · 칸 안 스크롤 없음 · 글자 꺾임 없음 */
const POPUP_PROBE = (sel) => `(() => {
  const p = document.querySelector(${JSON.stringify(sel)});
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const x = p.querySelector('.popup-close')?.getBoundingClientRect();
  const inner = [...p.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1; }).length
    + (p.scrollHeight > p.clientHeight + 1 ? 1 : 0);
  return { inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
    x: x ? { w: Math.round(x.width), h: Math.round(x.height), dr: Math.round(r.right - x.right), dt: Math.round(x.top - r.top) } : null, inner };
})()`;
const xSeen = [];
async function probePopup(page, sel, label) {
  const raw = await page.evaluate(POPUP_PROBE(sel));
  if (!raw) return record(`★ ${label} — 창이 열린다`, false, sel);
  record(`★★ ${label} — 화면 안에 다 보인다`, raw.inView);
  record(`★★ ${label} — 칸 안 스크롤 없음`, raw.inner === 0, String(raw.inner));
  if (raw.x) xSeen.push({ label, ...raw.x });
  const wraps = await page.evaluate(LABEL_WRAPS);
  record(`★★ ${label} — 글자 꺾임 0`, wraps.length === 0, wraps.join(' / '));
  return true;
}
// -----------------------------------------------------------------------------
// ★★★ R048 — A 도배 방지 안내(본인에게만 · 남은 초 · 테두리 · 떨림) · B 단축키 꾹 누름 (`npm run ui-check:spam`, verify 포함)
//   두 창(방장 PC · 게스트): 게스트가 6개를 빠르게 치면 게스트 창에만 안내가 뜬다. PC 파스텔 · 밤 · 모바일 390 — 잠긴 순간 · 3초 뒤.
// -----------------------------------------------------------------------------
const SPAM_ONLY = args.includes('--spam');
if (SPAM_ONLY) process.env.SHOT_DIR ??= 'verify';
async function typeAndEnter(page, text) {
  await page.send('Input.insertText', { text });
  await page.key('Enter', { code: 'Enter', vk: 13 });
}
const noteText = (page) => page.evaluate("document.querySelector('.throttle-note')?.innerText ?? ''");
const noteSec = async (page) => Number(((await noteText(page)).match(/(\d+)초/) ?? [])[1] ?? -1);
async function spamFlow(browser) {
  const H = await newPage(browser, 'S-host');
  await H.setViewport(1280, 720);
  await signUp(H, 'sh', '방장님');
  const G = await newPage(browser, 'S-guest', true);
  await G.setViewport(1280, 720);
  await signUp(G, 'sg', '도배손님');
  const roomId = await createRoom(H, 'R048 도배 방지');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(600);

  for (const theme of ['pastel', 'night']) {
    await G.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    await H.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    await sleep(200);
    // ── 게스트가 6개를 빠르게 (진짜 입력 · Enter)
    await realClick(G, '.chat-card input');
    const hostLines0 = await H.evaluate("document.querySelectorAll('.chat-line').length");
    for (let i = 1; i <= 6; i += 1) await typeAndEnter(G, `도배 ${i} ${theme}`);
    const shown = await G.waitFor("document.querySelector('.throttle-note') !== null", 3000);
    await sleep(150);
    const sec0 = await noteSec(G);
    const locked = await G.evaluate("document.querySelector('.chat-card input')?.classList.contains('locked')");
    const draftKept = await G.evaluate("document.querySelector('.chat-card input')?.value ?? ''");
    await snap(G, `90-spam-locked-${theme}-pc`);
    record(`★★★ A ${theme} — 6번째에 안내가 뜬다 · 남은 초(4~5) · 입력창 경고 테두리`, shown && sec0 >= 4 && sec0 <= 5 && locked === true, `초=${sec0} locked=${locked} 글=${draftKept}`);
    record(`★★ A ${theme} — 방장 창에는 안내가 없고 5개만 도착`, (await H.evaluate("document.querySelector('.throttle-note') === null")) && (await H.evaluate("document.querySelectorAll('.chat-line').length")) - hostLines0 === 5, `${(await H.evaluate("document.querySelectorAll('.chat-line').length")) - hostLines0}개`);
    await snap(H, `90-spam-host-${theme}-pc`);
    // 잠긴 채 보내기 — 글은 남고 입력창이 떨린다 · 안내 숫자가 줄어든다
    await G.send('Input.insertText', { text: '잠긴 중' });
    await G.key('Enter', { code: 'Enter', vk: 13 });
    await sleep(60);
    const shook = await G.evaluate("document.querySelector('.chat-card input')?.classList.contains('input-shake')");
    const kept = await G.evaluate("document.querySelector('.chat-card input')?.value ?? ''");
    record(`★★ A ${theme} — 잠긴 채 보내면: 안 보내고(글이 남는다) 입력창이 떨린다`, shook === true && kept === '잠긴 중', `shake=${shook} 글="${kept}"`);
    await sleep(2800);
    const sec1 = await noteSec(G);
    await snap(G, `91-spam-3s-${theme}-pc`);
    record(`★★ A ${theme} — 3초 뒤 남은 초가 줄었다 (${sec0} → ${sec1})`, sec1 >= 0 && sec1 < sec0, `${sec0}→${sec1}`);
    await G.waitFor("document.querySelector('.throttle-note') === null", 4000);
    record(`★ A ${theme} — 풀리면 안내가 사라지고 테두리도 원래대로`, await G.evaluate("document.querySelector('.throttle-note') === null && !document.querySelector('.chat-card input').classList.contains('locked')"));
    // 남아 있던 글을 그대로 보낼 수 있다
    await G.key('Enter', { code: 'Enter', vk: 13 });
    await sleep(400);
    record(`★ A ${theme} — 풀린 뒤 남아 있던 글이 그대로 간다`, await H.evaluate("[...document.querySelectorAll('.chat-line')].some((l) => l.innerText.includes('잠긴 중'))"));
    await G.evaluate("(() => { const i = document.querySelector('.chat-card input'); const d = Object.getOwnPropertyDescriptor(i.constructor.prototype, 'value'); d.set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await sleep(5300); // 창이 비도록
  }
  await G.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await H.evaluate("document.documentElement.dataset.theme = 'pastel'");
  // ── 모바일 390 — 잠긴 순간 · 3초 뒤 (키보드 위 자리 — 기존 throttle-note 와 같은 문서 흐름)
  await G.setViewport(390, 844);
  await sleep(400);
  await realClick(G, '.chat-card input');
  for (let i = 1; i <= 6; i += 1) await typeAndEnter(G, `모바일 도배 ${i}`);
  await G.waitFor("document.querySelector('.throttle-note') !== null", 3000);
  await sleep(150);
  await G.evaluate("document.querySelector('.throttle-note')?.scrollIntoView({ block: 'center' })");
  await snap(G, '92-spam-locked-m390');
  const mIn = await G.evaluate("(() => { const r = document.querySelector('.throttle-note')?.getBoundingClientRect(); return Boolean(r) && r.top >= 0 && r.bottom <= innerHeight; })()");
  record('★★ A 모바일 390 — 안내가 입력창 위 · 화면 안', mIn);
  await sleep(3000);
  await snap(G, '93-spam-3s-m390');
  await G.waitFor("document.querySelector('.throttle-note') === null", 4000);
  await G.setViewport(1280, 720);
  await sleep(5300);

  // ── 이모티콘 — 같은 안내 (kind=emoji) · 채팅은 그대로
  await realClick(G, '.emoji-btn');
  await sleep(250);
  for (let i = 0; i < 6; i += 1) {
    await realClick(G, '.emoji-slot');
    await sleep(80);
  }
  // ★ R097 — R071 (D-314) 부터 이모티콘 도배 제한 기본 끔(config.tuning.emojiRateLimit · 켜는 줄 EMOJI_RATE_LIMIT=1 은 봇 emojilimit 이 확인)
  //   → 기본 설정의 기대 = 6번째도 가고 안내 없음 (옛 기대 "6번째 안내" 가 R071 뒤로 낡았다)
  await sleep(1500);
  const eShown = await G.evaluate("(document.querySelector('.throttle-note')?.innerText ?? '').includes('이모티콘')");
  await snap(G, '94-spam-emoji-pc');
  record('★★ A 이모티콘 (D-314 기본 끔) — 6번째도 간다 · "이모티콘 도배 방지" 안내 없음', !eShown, await noteText(G));
  await closeTop(G);
  await realClick(G, '.chat-card input');
  await typeAndEnter(G, '이모티콘 잠겨도 채팅');
  await sleep(400);
  record('★ A 이모티콘이 잠겨도 채팅은 간다 (따로 센다)', await H.evaluate("[...document.querySelectorAll('.chat-line')].some((l) => l.innerText.includes('이모티콘 잠겨도 채팅'))"));
  await G.waitFor("document.querySelector('.throttle-note') === null", 7000);
  await sleep(5300);

  // ── ★★ B 단축키 꾹 누름 — Alt+1 을 자동 반복(autoRepeat)으로 5번 보내도 이모티콘은 1번 · keyup 뒤 다시 1번
  const emojiLines = () => H.evaluate("[...document.querySelectorAll('.chat-line')].filter((l) => l.querySelector('.chat-emoji, img.emoji')).length");
  const e0 = await emojiLines();
  await realClick(G, '.chat-card input');
  const down = (autoRepeat) => G.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 1, autoRepeat });
  await down(false);
  for (let i = 0; i < 4; i += 1) await down(true);
  await sleep(500);
  const e1 = await emojiLines();
  record('★★★ B — Alt+1 을 꾹(자동 반복 5번) → 이모티콘 1번만', e1 - e0 === 1, `${e1 - e0}번`);
  // keyup 없이 다시 keydown(반복 플래그 없음) — 그래도 1번만
  await down(false);
  await sleep(400);
  const e2 = await emojiLines();
  record('★★ B — keyup 전에는 같은 키를 다시 받지 않는다', e2 - e0 === 1, `${e2 - e0}번`);
  await G.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 1 });
  await down(false);
  await sleep(500);
  const e3 = await emojiLines();
  record('★★ B — keyup 뒤 다시 누르면 1번 더', e3 - e0 === 2, `${e3 - e0}번`);
  await G.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 1 });
  await snap(H, '95-keyhold-host-pc');

  // ── ★ C 포인트 — 프로필 창(게임 중에도 열린다)에 "포인트 N" · API 값과 같다
  await realClick(H, '#rename-btn');
  await H.waitFor("document.querySelector('.profile-points strong') !== null && document.querySelector('.profile-points strong').innerText !== '—'", 5000);
  const shownPts = await H.evaluate("document.querySelector('.profile-points strong')?.innerText ?? ''");
  const apiPts = await H.evaluate("fetch('/api/me/points').then((r) => r.json()).then((j) => String(j.balance))");
  await snap(H, '96-profile-points-pc');
  record('★★ C — 프로필 창 "포인트 N" = /api/me/points balance', shownPts.replace(/,/g, '') === apiPts, `${shownPts} / ${apiPts}`);
  await closeTop(H);
}

// -----------------------------------------------------------------------------
// ★★★ R049 — 포인트샵 · 뽑기 · ✨ 특별 탭 · 10칸 · 떠 있는 큰 반응 · 특별 도배 (`npm run ui-check:shop`, verify 에 포함)
//   ★ 포인트가 있는 계정이 필요하다 → **봇 계정**(bot_02 · 비밀번호는 scripts/bot.mjs 의 것)으로 로그인해 실제 값(20P)으로 뽑는다 (찬종 계정 안 씀).
//     7/27 그림은 uic 테스트 계정에 account_emojis 를 직접 넣어 만든다(끝나면 계정과 함께 지워진다 — CASCADE). 27/27 은 bot_01(봇 shop 이 다 모았다).
//   ★ 표시 방식 두 가지(기본 float · 대안 inline)를 **같은 장면**으로 찍는다 — localStorage 'qw.specialDisplay' (D-231)
// -----------------------------------------------------------------------------
const SHOP_ONLY = args.includes('--shop');
if (SHOP_ONLY) process.env.SHOT_DIR ??= 'verify';
const BOT_PASSWORD = 'bot1234';
async function loginAs(page, loginId, password, { fresh = false } = {}) {
  await page.goto(BASE);
  if (!fresh) await presetSeen(page);
  await page.waitFor("document.querySelectorAll('form input').length >= 2", 8000);
  await page.evaluate(`(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const i = [...document.querySelectorAll('form input')];
    set(i[0], ${JSON.stringify(loginId)}); set(i[1], ${JSON.stringify(password)});
  })()`);
  await page.evaluate("document.querySelector('form').requestSubmit()");
  const ok = await page.waitFor("document.querySelector('.tabs') === null", 10000);
  if (!ok) throw new Error(`[${page.label}] ${loginId} 로그인 실패: ${(await page.text()).slice(0, 150)}`);
}
const rectOf = (page, sel) => page.evaluate(`JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom } : null; })())`).then((s) => JSON.parse(s));
const altDigit = async (page, d) => {
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: d, code: `Digit${d}`, windowsVirtualKeyCode: 48 + Number(d), modifiers: 1 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: d, code: `Digit${d}`, windowsVirtualKeyCode: 48 + Number(d), modifiers: 1 });
};
async function shopFlow(browser) {
  const H = await newPage(browser, 'K-host');
  await H.setViewport(1280, 720);
  await signUp(H, 'kh', '샵방장');
  const roomId = await createRoom(H, 'R049 포인트샵');
  const G = await newPage(browser, 'K-bot2', true);
  await G.setViewport(1280, 720);
  await loginAs(G, 'bot_02', BOT_PASSWORD);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(500);
  const shopJson = (page) => page.evaluate("fetch('/api/shop').then((r) => r.json())");
  const pts = (page) => page.evaluate("document.querySelector('.shop-points strong')?.innerText ?? ''").then((s) => Number(String(s).replace(/,/g, '')));
  const ownedText = (page) => page.evaluate("document.querySelector('.shop-theme-owned')?.innerText ?? ''");
  const drawBtn = (page) => page.evaluate("JSON.stringify((() => { const b = document.querySelector('.shop-draw'); return b ? { text: b.innerText.trim(), disabled: b.disabled } : null; })())").then((s) => JSON.parse(s));

  // ── ★ B-1 상단 바 🎁 — 다른 버튼과 같은 높이 · 같은 줄
  const rShop = await rectOf(H, '#shop-btn');
  const rInvite = await rectOf(H, '#invite-btn');
  record('★★ B 상단 바 🎁 "포인트샵" — 초대 버튼과 같은 높이 · 같은 줄', rShop && rInvite && Math.abs(rShop.h - rInvite.h) < 1 && Math.abs(rShop.y - rInvite.y) < 1, JSON.stringify({ rShop, rInvite }));

  // ── ★ B-2 포인트 0 계정 — "20점 모자라요" 비활성
  await realClick(H, '#shop-btn');
  await H.waitFor("document.querySelector('.shop-pop .shop-draw') !== null", 5000);
  await sleep(200);
  const d0 = await drawBtn(H);
  await snap(H, '100-shop-0pts-pc');
  record('★★ B 포인트 0 — [N점 모자라요] 비활성 · 0/27 · 물음표 27칸', d0 && d0.disabled && /모자라요/.test(d0.text) && (await ownedText(H)) === '0/27' && (await H.evaluate("document.querySelectorAll('.shop-cell.none').length")) === 27, JSON.stringify(d0));
  // Esc → 닫히고 채팅 입력으로 포커스
  await H.key('Escape', { code: 'Escape', vk: 27 });
  await sleep(200);
  record('★ B Esc 로 닫히고 채팅 입력에 포커스', await H.evaluate("document.querySelector('.shop-pop') === null && document.activeElement === document.querySelector('.chat-card input')"));

  // ── ★★★ B-3 bot_02 — 0/27 · 뽑기 → 애니메이션 → 결과 카드 → 한 번 더 → 닫기
  const before = await shopJson(G);
  const ownedBefore = before.themes[0].owned.length;
  await realClick(G, '#shop-btn');
  await G.waitFor("document.querySelector('.shop-pop .shop-draw') !== null", 5000);
  await sleep(200);
  const shownPts = await pts(G);
  await snap(G, `101-shop-${ownedBefore}of27-pc`);
  record('★★ B 샵 창 "내 포인트" = /api/shop balance', shownPts === before.balance, `${shownPts} / ${before.balance}`);
  const dG = await drawBtn(G);
  record('★★ B 포인트 있으면 [뽑기 — 20P] 활성', dG && !dG.disabled && /뽑기/.test(dG.text) && /20P/.test(dG.text), JSON.stringify(dG));
  const t0 = Date.now();
  await realClick(G, '.shop-draw');
  const drawing = await G.waitFor("document.querySelector('.gacha') !== null", 5000);
  await sleep(450);
  await snap(G, '102-shop-drawing-pc');
  record('★★ B 뽑기 → 캡슐 애니메이션(.gacha)', drawing);
  const resultShown = await G.waitFor("document.querySelector('.gacha-result') !== null", 4000);
  const took = Date.now() - t0;
  await sleep(300);
  await snap(G, '103-shop-result-pc');
  const resName = await G.evaluate("document.querySelector('.gacha-result-name')?.innerText ?? ''");
  record(`★★★ B 결과 카드 — "새 이모티콘! <이름> · ${ownedBefore + 1}/27" (${took}ms)`, resultShown && resName.includes(`${ownedBefore + 1}/27`) && took >= 1200 && took < 4000, resName);
  const after1 = await shopJson(G);
  record('★★ B 잔액 −20 · 보유 +1 (API)', after1.balance === before.balance - 20 && after1.themes[0].owned.length === ownedBefore + 1, `${before.balance}→${after1.balance} · ${ownedBefore}→${after1.themes[0].owned.length}`);
  record('★ B 창의 포인트도 −20', (await pts(G)) === before.balance - 20, String(await pts(G)));
  // 한 번 더 (포커스가 가 있다 → Enter) → 애니메이션을 눌러 건너뜀
  record('★ B 결과 카드에서 [한 번 더] 에 포커스', await G.evaluate("document.activeElement?.innerText?.includes('한 번 더') ?? false"));
  await G.key('Enter', { code: 'Enter', vk: 13 });
  await G.waitFor("document.querySelector('.gacha') !== null", 5000);
  await sleep(200);
  await realClick(G, '.gacha');
  const skipped = await G.waitFor("document.querySelector('.gacha-result') !== null", 800);
  record('★★ B 애니메이션을 누르면 바로 결과', skipped);
  // 방향키 → [닫기] → Enter → 목록 (격자에 그림 2칸)
  await G.key('ArrowRight', { code: 'ArrowRight', vk: 39 });
  await sleep(100);
  record('★ B 방향키로 [닫기] 로 이동', await G.evaluate("document.activeElement?.innerText?.trim() === '닫기'"));
  await G.key('Enter', { code: 'Enter', vk: 13 });
  await G.waitFor("document.querySelector('.shop-list') !== null", 3000);
  await sleep(250);
  const after2 = await shopJson(G);
  record(`★★ B 닫기 → 목록 · ${ownedBefore + 2}/27 · 격자에 가진 그림 ${ownedBefore + 2}칸`, (await ownedText(G)) === `${ownedBefore + 2}/27` && (await G.evaluate("document.querySelectorAll('.shop-cell.has img').length")) === ownedBefore + 2 && after2.themes[0].owned.length === ownedBefore + 2, `${await ownedText(G)} · has=${await G.evaluate("document.querySelectorAll('.shop-cell.has img').length")}`);
  await snap(G, `104-shop-${ownedBefore + 2}of27-pc`);
  // 밤 · 1920
  await G.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(200);
  await snap(G, '105-shop-night-pc');
  await G.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await G.setViewport(1920, 1080);
  await sleep(300);
  await snap(G, '106-shop-pc-1920');
  await G.setViewport(1280, 720);
  await closeTop(G);

  // ── 7/27 — 테스트 계정(H)에 직접 넣는다 (그림용)
  await withPg(async (c) => {
    await c.query(`INSERT INTO account_emojis (account_id, emoji_id) SELECT a.id, e.id FROM accounts a, (SELECT id FROM emojis WHERE category = 'special' ORDER BY random() LIMIT 7) e WHERE a.login_id = $1 ON CONFLICT DO NOTHING`, [`${ACCOUNT_PREFIX}_kh`]);
  });
  await realClick(H, '#shop-btn');
  await H.waitFor("document.querySelector('.shop-pop .shop-draw') !== null", 5000);
  await sleep(300);
  record('★ B 7/27 (직접 넣은 뒤) — 가진 7칸은 그림', (await ownedText(H)) === '7/27' && (await H.evaluate("document.querySelectorAll('.shop-cell.has img').length")) === 7, await ownedText(H));
  await snap(H, '107-shop-7of27-pc');
  await closeTop(H);

  // ── 27/27 — bot_01 (봇 shop 이 다 모았다) → "완성!"
  const P = await newPage(browser, 'K-bot1', true);
  await P.setViewport(1280, 720);
  await loginAs(P, 'bot_01', BOT_PASSWORD);
  await P.waitFor("document.querySelector('#shop-btn') !== null", 8000);
  await realClick(P, '#shop-btn');
  await P.waitFor("document.querySelector('.shop-pop .shop-draw') !== null", 5000);
  await sleep(300);
  const dP = await drawBtn(P);
  const ownP = await ownedText(P);
  if (ownP === '27/27') {
    record('★★ B 27/27 — [완성!] 비활성 (방 목록 화면에서도 같은 창)', dP && dP.disabled && /완성/.test(dP.text), JSON.stringify(dP));
    await snap(P, '108-shop-complete-pc');
  } else record('★ B 27/27 그림 — bot_01 이 다 모은 상태가 아니라 건너뜀 (봇 shop 을 먼저 돌리면 된다)', true, ownP);
  await closeTop(P);

  // ── 모바일 390 — ☰ → 포인트샵 → 화면 가운데 창
  await G.setViewport(390, 844);
  await sleep(400);
  await realClick(G, '#menu-btn');
  await sleep(200);
  await realClick(G, '.menu-item', '포인트샵');
  await G.waitFor("document.querySelector('.shop-pop') !== null", 4000);
  await sleep(300);
  const rPop = await rectOf(G, '.shop-pop');
  await snap(G, '109-shop-m390');
  record('★★ B 모바일 390 — ☰ → 포인트샵 → 창이 화면 안', rPop && rPop.x >= 0 && rPop.y >= 0 && rPop.b <= 844 && rPop.x + rPop.w <= 390, JSON.stringify(rPop));
  await closeTop(G);
  await G.setViewport(1280, 720);
  await sleep(300);

  // ── ★★ C 고르기 창 ✨ 특별 탭 (가진 사람만) · 테마 머리글 · 10칸에 넣기
  await realClick(H, '.emoji-btn');
  await sleep(250);
  record('★ C 가진 특별이 없으면 ✨ 탭이 없다 (방장 — 목록은 들어올 때 받은 것)', await H.evaluate("![...document.querySelectorAll('.emoji-tab')].some((t) => t.innerText.includes('✨'))"));
  await closeTop(H);
  await realClick(G, '.emoji-btn');
  await sleep(250);
  const hasTab = await G.evaluate("[...document.querySelectorAll('.emoji-tab')].some((t) => t.innerText.includes('✨'))");
  record('★★ C 뽑은 사람은 ✨ 특별 탭', hasTab);
  await realClick(G, '.emoji-tab', '✨');
  await sleep(250);
  const head = await G.evaluate("document.querySelector('.emoji-group-head')?.innerText ?? ''");
  const cells = await G.evaluate("document.querySelectorAll('.emoji-cell.special').length");
  await snap(G, '110-picker-special-pc');
  record(`★★ C ✨ 탭 — 테마 머리글 "치이카와 ${ownedBefore + 2}/27" · 가진 것만 ${ownedBefore + 2}칸`, head.includes('치이카와') && head.includes(`${ownedBefore + 2}/27`) && cells === ownedBefore + 2, `${head} · ${cells}`);
  // 칸 바꾸기 → 1번 칸 → 특별 (★ R073 D-317 — 특별 칸을 끌어 1번 자리에 놓는다 · 옛 숫자 자리 누르기는 없앴다)
  await dragTo(G, '.emoji-cell.special', '.emoji-slot-cell[data-drop-slot="0"]');
  await sleep(300);
  const slot1 = await G.evaluate("Number(document.querySelector('.emoji-slot img')?.dataset.emojiId ?? 0)");
  const ownedIds = after2.themes[0].owned;
  record('★★ C 칸 바꾸기 — 1번 칸에 특별 이모티콘', ownedIds.includes(slot1), `slot1=${slot1}`);
  await snap(G, '111-picker-slot-pc');
  await closeTop(G);
  await sleep(1200); // 계정 저장(prefsSync)
  const prefsSlots = await G.evaluate("fetch('/api/auth/prefs').then((r) => r.json()).then((j) => JSON.stringify(j.prefs?.emojiSlots ?? null))").then((s) => JSON.parse(s));
  record('★★ C 10칸이 계정에 저장된다 (재로그인에도 같음 — 봇 shop 도 확인)', Array.isArray(prefsSlots) && prefsSlots[0] === slot1, JSON.stringify(prefsSlots));

  // ── ★★★ D 떠 있는 큰 반응 — 보낸 직후 · 3개 · 3초 뒤 · 4번째 잠금 · 표준은 따로
  const floats = (page) => page.evaluate("document.querySelectorAll('.special-layer .special-float').length");
  const specialLines = (page) => page.evaluate("document.querySelectorAll('.chat-line .chat-special').length");
  await realClick(G, '.chat-card input');
  const l0 = await specialLines(H);
  await altDigit(G, '1');
  const f1 = await H.waitFor("document.querySelectorAll('.special-layer .special-float').length === 1", 3000);
  await sleep(350);
  await snap(H, '120-special-float-pc');
  await sleep(400); // 튀어 오르는 애니메이션(650ms)이 끝난 뒤 크기를 잰다
  const rPic = await rectOf(H, '.special-float-pic');
  const rInput = await rectOf(H, '.chat-card input');
  const nick = await H.evaluate("document.querySelector('.special-float-nick')?.innerText ?? ''");
  const gNick = await G.evaluate("document.querySelector('.seat.me .seat-name, .seat.me .name')?.innerText ?? ''");
  // ★ R064 (D-267) — PC 반응 층 특별 96 → 144px(1.5배)
  record('★★★ D 특별을 보내면 상대 화면 입력창 **위에 큰 반응**(PC 144px · 닉네임)', f1 && rPic && Math.round(rPic.w) === 144 && rInput && rPic.b <= rInput.y && nick.length > 0, JSON.stringify({ rPic, inputTop: rInput?.y, nick, gNick }));
  record('★★ D 로그엔 "닉네임 + 작은 그림(32px)" 한 줄', (await specialLines(H)) === l0 + 1 && (await H.evaluate("document.querySelector('.chat-line .chat-special')?.getBoundingClientRect().width")) === 32, String(await H.evaluate("document.querySelector('.chat-line .chat-special')?.getBoundingClientRect().width")));
  await altDigit(G, '1');
  await sleep(120);
  await altDigit(G, '1');
  const f3 = await H.waitFor("document.querySelectorAll('.special-layer .special-float').length === 3", 3000);
  await sleep(300);
  await snap(H, '121-special-float-3-pc');
  record('★★ D 3개 겹치면 옆으로 나란히 (동시 최대 3)', f3 && (await H.evaluate("(() => { const r = [...document.querySelectorAll('.special-float')].map((e) => e.getBoundingClientRect()); return r.length === 3 && r[0].right <= r[1].left + 1 && r[1].right <= r[2].left + 1; })()")));
  // ★ R064 (D-269) — R066 5초 5회: 4 · 5번째는 가고 6번째 → 특별 도배 방지 (보낸 사람 화면)
  await altDigit(G, '1');
  await sleep(120);
  await altDigit(G, '1');
  await sleep(120);
  await altDigit(G, '1');
  // ★ R071 (D-314) 뒤로 특별 이모티콘 도배 제한이 없다 — 6번째도 가고 안내 줄은 없다(R073 끝 점검에서 낡은 기대를 고침)
  await sleep(1500);
  const locked = await G.evaluate("document.querySelector('.throttle-note') !== null");
  await snap(G, '122-special-locked-pc');
  record('★★★ D (D-314) 5초 안 6번째도 간다 · 도배 방지 안내 없음(보낸 사람 · 받는 사람)', !locked && (await H.evaluate("document.querySelector('.throttle-note') === null")), await G.evaluate("document.querySelector('.throttle-note')?.innerText ?? ''"));
  record('★ D (D-314) 상대 화면에 6개 모두', (await specialLines(H)) === l0 + 6, String((await specialLines(H)) - l0));
  await H.waitFor("document.querySelectorAll('.special-layer .special-float').length === 0", 4500);
  await sleep(200);
  await snap(H, '123-special-after-pc');
  record('★★ D 3초 뒤 큰 반응은 사라지고 로그 줄만 남는다', (await floats(H)) === 0 && (await specialLines(H)) === l0 + 6);
  // 특별이 잠겨도 표준 이모티콘은 간다
  const e0 = await H.evaluate("document.querySelectorAll('.chat-line .chat-emoji').length");
  await realClick(G, '.emoji-btn');
  await sleep(200);
  await realClick(G, '.emoji-tab', '😀');
  await sleep(150);
  await realClick(G, '.emoji-cell');
  await sleep(500);
  record('★ D 특별이 잠겨도 표준 이모티콘은 간다 (따로 센다)', (await H.evaluate("document.querySelectorAll('.chat-line .chat-emoji').length")) === e0 + 1);
  await closeTop(G);
  await G.waitFor("document.querySelector('.throttle-note') === null", 12000);
  await sleep(300);

  // 밤 테마 1장 (보낸 직후)
  for (const p of [H, G]) await p.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(200);
  await realClick(G, '.chat-card input');
  await altDigit(G, '1');
  await H.waitFor("document.querySelectorAll('.special-layer .special-float').length >= 1", 3000);
  await sleep(350);
  await snap(H, '124-special-float-night-pc');
  for (const p of [H, G]) await p.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await H.waitFor("document.querySelectorAll('.special-layer .special-float').length === 0", 4500);

  // 모바일 390 — 보낸 사람 자신도 본다 (같은 자리). 키보드 올라온 상태(390×470 + 입력 포커스)
  await G.setViewport(390, 844);
  await sleep(400);
  await realClick(G, '.chat-card input');
  await altDigit(G, '1');
  await G.waitFor("document.querySelectorAll('.special-layer .special-float').length >= 1", 3000);
  await sleep(350);
  await snap(G, '125-special-float-m390');
  await sleep(400);
  const rM = await rectOf(G, '.special-float-pic');
  const rMi = await rectOf(G, '.chat-card input');
  record('★★ D 모바일 390 — 입력창 위에 큰 반응 · 화면 안', rM && rMi && rM.y >= 0 && rM.b <= rMi.y + 1 && rM.b <= 844, JSON.stringify({ rM, inputTop: rMi?.y }));
  await G.waitFor("document.querySelectorAll('.special-layer .special-float').length === 0", 4500);
  await G.setViewport(390, 470);
  await sleep(400);
  await realClick(G, '.chat-card input');
  await G.evaluate("document.querySelector('.chat-card input')?.scrollIntoView({ block: 'end' })");
  await sleep(200);
  await altDigit(G, '1');
  await G.waitFor("document.querySelectorAll('.special-layer .special-float').length >= 1", 3000);
  await sleep(350);
  await snap(G, '126-special-float-m390-keyboard');
  await sleep(400);
  const rK = await rectOf(G, '.special-float-pic');
  const rKi = await rectOf(G, '.chat-card input');
  record('★★ D 모바일 390 키보드 올라온 상태(390×470) — 큰 반응이 입력창 위 · 화면 안', rK && rKi && rK.y >= 0 && rK.b <= rKi.y + 1 && rKi.b <= 471, JSON.stringify({ rK, input: rKi }));
  await G.waitFor("document.querySelectorAll('.special-layer .special-float').length === 0", 4500);
  await G.setViewport(1280, 720);
  await sleep(300);
  await G.waitFor("document.querySelector('.throttle-note') === null", 12000);
  await sleep(5500); // 특별 창(5초 — R066)이 비도록

  // ── ★ D 대안 — 로그 안에 크게(96px) : 상대(H)만 inline 으로 바꿔 같은 장면
  await H.evaluate("localStorage.setItem('qw.specialDisplay', 'inline')");
  await H.goto(`${BASE}/r/${roomId}`);
  await H.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(600);
  await realClick(G, '.chat-card input');
  const b0 = await H.evaluate("document.querySelectorAll('.chat-special-big').length");
  await altDigit(G, '1');
  const big1 = await H.waitFor(`document.querySelectorAll('.chat-special-big').length === ${b0 + 1}`, 3000);
  await sleep(350);
  await snap(H, '130-special-inline-pc');
  record('★★ D 대안(inline) — 로그 안에 96px 한 줄 · 떠 있는 층 없음', big1 && (await floats(H)) === 0 && (await H.evaluate("document.querySelector('.chat-special-big')?.getBoundingClientRect().width")) === 96);
  await altDigit(G, '1');
  await sleep(120);
  await altDigit(G, '1');
  await H.waitFor(`document.querySelectorAll('.chat-special-big').length === ${b0 + 3}`, 3000);
  await sleep(300);
  await snap(H, '131-special-inline-3-pc');
  await sleep(3300);
  await snap(H, '132-special-inline-after-pc');
  await H.evaluate("localStorage.removeItem('qw.specialDisplay')");
  record('★ D 대안 그림 3장 (130~132) — 기본 float 그림(120 · 121 · 123)과 같은 장면', true);
}

// -----------------------------------------------------------------------------
// ★★★ R050 A — 질문 · 힌트 복사 막기 + PC/모바일 판정 · 🖥/📱 (`npm run ui-check:copy`, verify 에 포함)
// ★★★ R050 B — 태블릿 · 폴드 (`npm run ui-check:devices`, verify 에 포함) — 새 판정으로 모바일 UI 가 되는가 · 깨진 곳
//   터치 흉내: Emulation.setTouchEmulationEnabled → (pointer: coarse)(hover: none) — 실측(R050): 기본 헤드리스는 fine/hover 다
// -----------------------------------------------------------------------------
const COPY_ONLY = args.includes('--copy');
if (COPY_ONLY) process.env.SHOT_DIR ??= 'verify';
const DEVICES_ONLY = args.includes('--devices');
if (DEVICES_ONLY) process.env.SHOT_DIR ??= 'verify';
async function touchDevice(page, w, h, on = true) {
  await page.send('Emulation.setTouchEmulationEnabled', on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: on });
  await sleep(350);
}
const uiClass = (page) => page.evaluate("document.documentElement.classList.contains('ui-mobile') ? 'mobile' : document.documentElement.classList.contains('ui-pc') ? 'pc' : '?'");
async function answerCurrent(page, sender = page) {
  const text = await page.evaluate("document.querySelector('.q-text')?.dataset.text ?? ''");
  const ans = await withPg(async (c) =>
    (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '',
  );
  await sender.setInput('.chat-card input', ans);
  await sender.click('전송');
  return ans;
}
/** 마우스로 끌어 고르기 (진짜 입력) — 고른 글 */
async function dragSelect(page, selector) {
  const r = JSON.parse(await page.evaluate(`JSON.stringify((() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x0: b.left + 4, x1: b.right - 4, y: b.top + Math.min(b.height / 2, 14) }; })())`));
  if (!r) return null;
  await page.evaluate('document.getSelection()?.removeAllRanges()');
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x0, y: r.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i += 1) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x0 + ((r.x1 - r.x0) * i) / 6, y: r.y, button: 'left', buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x1, y: r.y, button: 'left', clickCount: 1 });
  await sleep(120);
  return page.evaluate("document.getSelection()?.toString() ?? ''");
}
/** 진짜 오른쪽 클릭 — 기본 메뉴가 막혔나 */
async function rightClickBlocked(page, selector) {
  await page.evaluate("window.__ctx = null; window.addEventListener('contextmenu', (e) => { window.__ctx = e.defaultPrevented; }, { once: true })");
  const p = JSON.parse(await page.evaluate(`JSON.stringify((() => { const b = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 12) } : null; })())`));
  if (!p) return null;
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', clickCount: 1 });
  await sleep(150);
  return page.evaluate('window.__ctx');
}
/** 복사 명령(Ctrl+C 와 같은 copy 이벤트) — 클립보드에 들어갈 글 (막혔으면 '') */
async function copiedText(page) {
  return page.evaluate(`(() => { let out = null; const on = (e) => { out = e.defaultPrevented ? (e.clipboardData?.getData('text/plain') ?? '') : (document.getSelection()?.toString() ?? ''); }; window.addEventListener('copy', on, { once: true }); document.execCommand('copy'); return out ?? ''; })()`);
}
async function copyFlow(browser) {
  const H = await newPage(browser, 'C-host');
  await H.setViewport(1280, 720);
  await signUp(H, 'ch', '복사방장');
  const roomId = await createRoom(H, 'R050 복사 막기');
  const G = await newPage(browser, 'C-guest', true);
  await signUp(G, 'cg', '폰손님');
  await touchDevice(G, 390, 844);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(800);
  // ── ★ 판정: PC 창 = ui-pc · 터치 390 = ui-mobile
  record('★★ A 판정 — PC 1280(마우스 · 키보드) = PC UI', (await uiClass(H)) === 'pc');
  record('★★ A 판정 — 터치 390 = 모바일 UI', (await uiClass(G)) === 'mobile');
  // ── 🖥/📱 — 방장 화면 참여자 칸 · 손님(모바일) 명단
  await H.waitFor("document.querySelectorAll('.seat-card .device-icon').length >= 2", 5000);
  const hostIcons = await H.evaluate("JSON.stringify([...document.querySelectorAll('.seat-card')].map((s) => [s.querySelector('.seat-nick')?.innerText ?? '', s.querySelector('.device-icon')?.dataset.device ?? '']).filter((x) => x[0]))");
  record('★★ A 참여자 칸 — 방장 🖥 · 손님 📱', hostIcons.includes('"복사방장","pc"') && hostIcons.includes('"폰손님","mobile"'), hostIcons);
  await snap(H, '10-device-icons-seats-pc');
  await realClick(G, '#people-btn');
  await G.waitFor("document.querySelector('.people-row .device-icon') !== null", 4000);
  const gIcons = await G.evaluate("JSON.stringify([...document.querySelectorAll('.people-row')].map((r) => [r.querySelector('.nick')?.innerText ?? '', r.querySelector('.device-icon')?.dataset.device ?? '']))");
  record('★★ A 모바일 명단 — 방장 🖥 · 나 📱', gIcons.includes('"복사방장","pc"') && gIcons.includes('"폰손님","mobile"'), gIcons);
  await snap(G, '11-device-icons-people-m390');
  await closeTop(G);
  // ── 판정이 바뀌면 다시 알린다 — 손님 창을 PC 로(터치 끔 · 1280) → 방장 화면 🖥
  await touchDevice(G, 1280, 720, false);
  await G.evaluate("window.dispatchEvent(new Event('resize'))");
  const flipped = await H.waitFor("[...document.querySelectorAll('.seat-card')].some((s) => s.querySelector('.seat-nick')?.innerText === '폰손님' && s.querySelector('.device-icon')?.dataset.device === 'pc')", 5000);
  record('★ A 입력 장치 · 창 크기가 바뀌면 다시 판정 · 다시 알림 (📱 → 🖥)', flipped && (await uiClass(G)) === 'pc');
  await touchDevice(G, 390, 844);
  await G.evaluate("window.dispatchEvent(new Event('resize'))");
  await sleep(500);

  // ── 게임 — 질문 · 힌트가 보이는 동안
  await setQuestionCount(H, 2);
  await sleep(500);
  await H.click('게임 시작');
  await H.waitFor("document.querySelector('.q-text') !== null && document.querySelector('.reveal') === null", 15000);
  // 힌트 칸(잠긴 칸 · 열린 칸 어느 쪽이든 — 막는 것은 칸 전체)
  await H.waitFor("document.querySelector('.q-hints') !== null", 5000);
  await sleep(300);
  const qText = await H.evaluate("document.querySelector('.q-text')?.dataset.text ?? ''");
  // PC — 끌어 고르기
  const selQ = await dragSelect(H, '.q-text');
  record('★★★ A PC — 질문을 마우스로 끌어도 고를 수 없다', selQ !== null && selQ.trim() === '', JSON.stringify(selQ).slice(0, 60));
  const selH = await dragSelect(H, '.q-hints');
  record('★★★ A PC — 힌트도 고를 수 없다', selH !== null && selH.trim() === '', JSON.stringify(selH).slice(0, 60));
  record('★★ A PC — 질문 위 오른쪽 클릭 메뉴가 막힌다', (await rightClickBlocked(H, '.q-text')) === true);
  // 전체 선택(Ctrl+A) → 복사: 질문 · 힌트만 빠진다
  await H.evaluate("document.getSelection().selectAllChildren(document.body)");
  const all = await copiedText(H);
  const hintText = await H.evaluate("document.querySelector('.q-hints')?.innerText ?? ''");
  record('★★★ A 전체 선택 → 복사 — 질문 · 힌트 글은 빠지고 나머지는 복사된다', all.length > 0 && !all.includes(qText.slice(0, 12)) && (hintText === '' || !all.includes(hintText.replace(/\s+/g, ' ').slice(0, 6))) && all.includes('복사방장'), `${all.length}자`);
  await H.evaluate('document.getSelection()?.removeAllRanges()');
  // 채팅은 된다
  await H.setInput('.chat-card input', '채팅은 복사돼요 12345');
  await H.click('전송');
  await H.waitFor("[...document.querySelectorAll('.chat-line')].some((l) => l.innerText.includes('채팅은 복사돼요'))", 4000);
  const lastLine = "[...document.querySelectorAll('.chat-line')].filter((l) => l.innerText.includes('채팅은 복사돼요')).pop()";
  await H.evaluate(`${lastLine}?.querySelector('.chat-text, span:last-child')?.setAttribute('data-copytest', '1')`);
  const selC = await dragSelect(H, '[data-copytest="1"]');
  record('★★ A PC — 채팅은 고를 수 있다', (selC ?? '').includes('복사'), JSON.stringify(selC).slice(0, 40));
  const cc = await copiedText(H);
  record('★★ A PC — 채팅은 복사된다', cc.includes('복사'), JSON.stringify(cc).slice(0, 40));
  record('★ A PC — 채팅 위 오른쪽 클릭은 그대로', (await rightClickBlocked(H, '[data-copytest="1"]')) === false);
  // 모바일 — CSS(꾹 누름 메뉴 · 선택 핸들 없음) + 꾹 누름 흉내
  const mStyle = await G.evaluate("JSON.stringify(['.q-text', '.q-hints', '.chat-card input'].map((s) => { const el = document.querySelector(s); if (!el) return null; const cs = getComputedStyle(el); return [cs.userSelect || cs.webkitUserSelect, cs.webkitTouchCallout ?? '']; }))");
  const ms = JSON.parse(mStyle);
  record('★★★ A 모바일 — 질문 · 힌트 = 선택 안 됨 · 꾹 누름 메뉴 없음(user-select · touch-callout none)', ms[0]?.[0] === 'none' && ms[1]?.[0] === 'none' && (ms[0]?.[1] === 'none' || ms[0]?.[1] === ''), mStyle);
  const tp = JSON.parse(await G.evaluate("JSON.stringify((() => { const el = document.querySelector('.q-text'); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 10 }; })())"));
  await G.evaluate("window.__ctx = null; window.addEventListener('contextmenu', (e) => { window.__ctx = e.defaultPrevented; }, { once: true })");
  await G.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.x, y: tp.y }] });
  await sleep(900);
  await G.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
  const longSel = await G.evaluate("document.getSelection()?.toString() ?? ''");
  const longCtx = await G.evaluate('window.__ctx');
  record('★★ A 모바일 — 질문을 꾹 눌러도 글이 골라지지 않는다(메뉴가 뜨면 막힘)', longSel.trim() === '' && longCtx !== false, `sel="${longSel.slice(0, 20)}" ctx=${longCtx}`);
  await snap(G, '12-copy-question-m390');
  await snap(H, '13-copy-question-pc');
  // 정답 공개 화면 — 해설은 복사돼도 된다(지금처럼)
  await answerCurrent(H);
  await H.waitFor("document.querySelector('.reveal') !== null", 6000);
  await sleep(300);
  const ex = await H.evaluate("getComputedStyle(document.querySelector('.reveal-explain') ?? document.body).userSelect");
  record('★ A 정답 공개 · 해설은 막지 않는다', ex !== 'none', ex);
  await H.click('강제 종료').catch(() => undefined);
}

const DEVICE_SIZES = [
  { n: 'fold-folded', w: 344, h: 882 },
  { n: 'fold-open', w: 673, h: 841 },
  { n: 'ipad-mini', w: 744, h: 1133 },
  { n: 'ipad-air', w: 820, h: 1180 },
  { n: 'tab', w: 800, h: 1280 },
  { n: 'ipad-pro', w: 1024, h: 1366 },
];
const DEVICE_VIEWS = DEVICE_SIZES.flatMap((d) => [
  { n: `${d.n}-portrait`, w: d.w, h: d.h },
  { n: `${d.n}-landscape`, w: d.h, h: d.w },
]);
/** 깨짐 잣대 — 가로 넘침 · 화면 밖으로 잘린 칸/버튼 · 모바일 UI 인가 */
async function deviceMeasure(page) {
  return JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const W = innerWidth;
    const over = document.documentElement.scrollWidth - W;
    const cut = [];
    for (const el of document.querySelectorAll('.card, .room-head, button, input, .shop-pop, .rename-pop, .seat, .chat-card, .q-text, .reveal')) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('.emoji-grid, .chat-log, .shop-grid, .settings .chips, .friend-list')) continue;
      if (r.left < -1 || r.right > W + 1) cut.push((el.className || el.tagName).toString().slice(0, 30) + '@' + Math.round(r.left) + '..' + Math.round(r.right));
    }
    const ui = document.documentElement.classList.contains('ui-mobile') ? 'mobile' : 'pc';
    const menu = Boolean(document.querySelector('#menu-btn') && document.querySelector('#menu-btn').offsetParent !== null);
    const seatsShown = [...document.querySelectorAll('.seats')].some((s) => s.offsetParent !== null && s.getBoundingClientRect().width > 0);
    return { ui, over, cut: cut.slice(0, 6), menu, seatsShown };
  })())`));
}
async function shootDevices(page, screen, views = DEVICE_VIEWS, fast = false) {
  const bad = [];
  for (const v of views) {
    await touchDevice(page, v.w, v.h);
    await page.evaluate("window.dispatchEvent(new Event('resize'))");
    await sleep(fast ? 220 : 380);
    await page.evaluate('window.scrollTo(0, 0)');
    const m = await deviceMeasure(page);
    await snap(page, `20-dev-${screen}-${v.n}`);
    const room = await page.evaluate("document.querySelector('.room') !== null");
    const ok = m.ui === 'mobile' && m.over <= 1 && m.cut.length === 0 && (!room || (m.menu && !m.seatsShown));
    if (!ok) bad.push(`${v.n}: ${JSON.stringify(m)}`);
  }
  record(`★★ B ${screen} — 12 크기(폴드 · iPad · 탭 세로/가로) 모두 모바일 UI · 가로 넘침 0 · 잘림 0${screen === 'home' || screen === 'shop-home' ? '' : ' · ☰ 있음 · 참여자 칸 숨김'}`, bad.length === 0, bad.join(' | ').slice(0, 600));
}
async function devicesFlow(browser) {
  const H = await newPage(browser, 'D-host');
  await H.setViewport(1280, 720);
  await signUp(H, 'dh', '태블릿방장');
  const T = await newPage(browser, 'D-tab', true);
  await signUp(T, 'dt', '태블릿손님');
  // 방 목록 화면 · 샵(방 밖) · 프로필(방 밖)
  await shootDevices(T, 'home');
  await touchDevice(T, 1366, 1024);
  await realClick(T, '#shop-btn');
  await T.waitFor("document.querySelector('.shop-pop') !== null", 5000);
  await shootDevices(T, 'shop-home', DEVICE_VIEWS.filter((v) => ['fold-folded-portrait', 'fold-open-portrait', 'ipad-pro-landscape', 'tab-landscape', 'ipad-mini-portrait'].includes(v.n)));
  await closeTop(T);
  await realClick(T, '#rename-btn');
  await T.waitFor("document.querySelector('.rename-pop') !== null", 5000);
  await shootDevices(T, 'profile-home', DEVICE_VIEWS.filter((v) => ['fold-folded-portrait', 'ipad-pro-landscape', 'tab-landscape'].includes(v.n)));
  await closeTop(T);
  // 로비
  const roomId = await createRoom(H, 'R050 태블릿 · 폴드');
  await T.goto(`${BASE}/r/${roomId}`);
  await T.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(600);
  await shootDevices(T, 'lobby');
  // 모바일 ☰ → 포인트샵 · 프로필 (로비)
  await touchDevice(T, 1366, 1024);
  await realClick(T, '#menu-btn');
  await sleep(250);
  await snap(T, '21-dev-menu-ipad-pro-landscape');
  await realClick(T, '.menu-item', '프로필');
  await T.waitFor("document.querySelector('.rename-pop') !== null", 4000);
  await snap(T, '21-dev-profile-ipad-pro-landscape');
  await closeTop(T);
  // 게임 — 힌트가 다 보이는 때 · 정답 공개 · 결과
  await setQuestionCount(H, 3);
  await sleep(500);
  await H.click('게임 시작');
  await H.waitFor("document.querySelector('.q-text') !== null && document.querySelector('.reveal') === null", 15000);
  await H.waitFor("document.querySelectorAll('.q-hint.open').length >= 2", 30000);
  await shootDevices(T, 'game', DEVICE_VIEWS, true);
  await answerCurrent(H);
  await H.waitFor("document.querySelector('.reveal') !== null", 6000);
  await shootDevices(T, 'reveal', DEVICE_VIEWS.slice(0, 6), true);
  await H.waitFor("document.querySelector('.q-text') !== null && document.querySelector('.reveal') === null", 15000);
  await answerCurrent(H);
  await H.waitFor("document.querySelector('.reveal') !== null", 6000);
  await shootDevices(T, 'reveal2', DEVICE_VIEWS.slice(6), true);
  await H.waitFor("document.querySelector('.q-text') !== null && document.querySelector('.reveal') === null", 15000);
  await answerCurrent(H);
  await T.waitFor("document.querySelector('.result-card, .game-result') !== null", 20000);
  await sleep(400);
  await shootDevices(T, 'result');
  // 게임 중 샵 (모바일 ☰)
  await touchDevice(T, 1180, 820);
  await realClick(T, '#menu-btn');
  await sleep(250);
  await realClick(T, '.menu-item', '포인트샵');
  await T.waitFor("document.querySelector('.shop-pop') !== null", 4000);
  await shootDevices(T, 'shop-room', DEVICE_VIEWS.filter((v) => ['fold-folded-portrait', 'fold-open-landscape', 'ipad-air-landscape', 'ipad-pro-landscape'].includes(v.n)));
  await closeTop(T);
}

// -----------------------------------------------------------------------------
// ★★★ R050 D·E — 미니게임 화면 (`npm run ui-check:minigame`, verify 에 포함)
//   [1] /lab/minigame — 균형의 수호자 물건 넷(정해진 시드) · 장면(가짜 보기)을 PC 1280 · 1920 · 모바일 390 · 폴드 접힘 · 파스텔/밤으로
//   [2] 실제 연습 판 — 네 기기가 한 방에: H(PC 1280 파스텔) · N(PC 1920 밤) · G(모바일 390 터치) · F(폴드 접힘 344 터치)
//       케이크: H Space · N Enter · G 톡 · F 안 누름 / 균형: H 방향키 · N 마우스 끌기 · G 손가락 끌기 · F 안 움직임 → 기록(DB)과 화면
//   ★ 이 모드는 자기 서버의 미니게임 단계(판 진행 밖)를 2배로 늘린다 — 단계마다 네 기기 그림을 찍을 틈 (판 진행 시간은 그대로)
// -----------------------------------------------------------------------------
const MINIGAME_ONLY = args.includes('--minigame');
if (MINIGAME_ONLY) {
  process.env.SHOT_DIR ??= 'verify';
  process.env.MINIGAME_PHASE_SCALE ??= '2';
  // ★ R052 — 퀴즈 판 3문제를 빨리 넘기려고 정답 공개 대기를 줄인다(퀴즈류 미니게임은 5문제 판 3번째 뒤)
  process.env.RESOLVED_WAIT_MS ??= '1500';
}
async function setTheme(page, t) {
  await page.evaluate(`document.documentElement.dataset.theme = '${t}'`);
  await sleep(120);
}
/** ★ R067 (D-300) — PC 방 위 막대 ⚙ 창을 이 탭으로 연다(ⓘ 안내 · 제보 버튼은 ⚙ 탭으로 모였다) */
async function openGearTab(page, tab) {
  if (!(await page.evaluate("document.querySelector('[data-gear-pop]') !== null"))) await page.evaluate("document.querySelector('[data-gear-btn]')?.click()");
  await page.waitFor("document.querySelector('[data-gear-pop]') !== null", 3000).catch(() => false);
  await page.evaluate(`document.querySelector('[data-gear-tab="${tab}"]')?.click()`);
  await sleep(250);
}
async function waitPhase(page, phase, timeout = 30000) {
  return page.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${phase}'`, timeout);
}
// -----------------------------------------------------------------------------
// ★★★ R051 — 미니게임 2차 화면 점검 (ui-check:minigame 에 이어서 · MG_GAMES=reaction,typing,circle,angle 로 고를 수 있다)
//   [1] /lab/minigame 장면 — 네 게임 × 단계 (PC 1280 · 모바일 390 · 폴드 344 넘침)
//   [2] 실제 연습 판 — H(PC 1280 · 키보드 · 마우스) · G(모바일 390 · 터치) 두 기기
//       번개손: H 초록 뒤 Space · G 1판 성급 → 실격 화면 / 타자: 복사 · 붙여넣기 · 끌어 놓기 막힘 · 틀린 글자 빨강 · 조합 중 글자 · 모바일 키보드 올린 390×470
//       원: 마우스 · 손가락으로 그림(손가락은 화면이 스크롤되지 않는다) · 서버 값 = 점으로 다시 계산 / 각도: 끌기 · ← → 0.5° · Enter 확정 · 미확정 = 그때 각
// -----------------------------------------------------------------------------
const R051_GAMES = (process.env.MG_GAMES ?? 'reaction,typing,circle,angle').split(',').filter(Boolean);
async function sharedDist() {
  return import(new URL('../shared/dist/index.js', import.meta.url).href);
}
async function spaceKey(page) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
}
async function r051Lab(browser) {
  // ★ R097 — 앞 M-lab 이 기본 브라우저 맥락에서 가입해 쿠키가 남는다 → 같은 맥락이면 BASE 가 곧장 홈(인증 화면 없음) = "회원가입 탭 못 찾음"(R094 · R096 메모). 따로 맥락
  const L = await newPage(browser, 'M2-lab', true);
  await L.setViewport(1280, 720);
  await signUp(L, 'm2l', '그림점검둘');
  const scenes = [];
  if (R051_GAMES.includes('reaction'))
    scenes.push(['reaction', 'rules', ''], ['reaction', 'play', 'wait'], ['reaction', 'play', 'fake-color'], ['reaction', 'play', 'fake-text'], ['reaction', 'play', 'go'], ['reaction', 'roundResult', ''], ['reaction', 'final', '']);
  if (R051_GAMES.includes('typing')) scenes.push(['typing', 'rules', ''], ['typing', 'play', 'typed'], ['typing', 'roundResult', '']);
  if (R051_GAMES.includes('circle')) scenes.push(['circle', 'rules', ''], ['circle', 'play', ''], ['circle', 'roundResult', '']);
  if (R051_GAMES.includes('angle')) scenes.push(['angle', 'rules', ''], ['angle', 'play', ''], ['angle', 'roundResult', '']);
  const num = { reaction: 60, typing: 61, circle: 62, angle: 63 };
  for (const [k, ph, st] of scenes) {
    const name = `${num[k]}-scene-${k}-${ph}${st ? `-${st}` : ''}`;
    for (const [dev, w, h, touch] of [['pc', 1280, 720, false], ['m390', 390, 844, true]]) {
      if (touch) await touchDevice(L, w, h);
      else {
        await touchDevice(L, w, h, false);
        await L.setViewport(w, h);
      }
      await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024${st ? `&state=${st}` : ''}`);
      await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${ph}'`, 6000);
      await sleep(ph === 'roundResult' ? 900 : 350);
      await snap(L, `${name}-${dev}`);
      if (touch && (ph === 'play' || ph === 'roundResult')) {
        await touchDevice(L, 344, 882);
        await L.evaluate("window.dispatchEvent(new Event('resize'))");
        await sleep(250);
        const over = await L.evaluate('document.documentElement.scrollWidth - innerWidth');
        record(`★ R051 장면 ${k}/${ph}${st ? `/${st}` : ''} — 폴드 접힘(344) 가로 넘침 없음`, over <= 1, String(over));
        if (k !== 'reaction' || st === 'go') await snap(L, `${name}-fold`);
      }
    }
    if (k === 'reaction' && ph === 'play') {
      const s = await L.evaluate("document.querySelector('.reaction-stage')?.dataset.state ?? ''");
      record(`★★ A 번개손 장면 — ${st} 화면`, s === st, s);
    }
  }
  await touchDevice(L, 1280, 720, false);
  await L.setViewport(1280, 720);
  await L.close?.();
}

async function r051Room(browser, label) {
  const H = await newPage(browser, `M2-${label}-host`, true);
  await H.setViewport(1280, 720);
  await signUp(H, `${label}h`, `${label}방장`);
  const roomId = await createRoom(H, `R051 ${label}`);
  const G = await newPage(browser, `M2-${label}-m390`, true);
  await signUp(G, `${label}g`, `${label}폰`);
  await touchDevice(G, 390, 844);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(500);
  return { H, G, roomId };
}
/** ★ R063 — 골라 하기 창(카드)에서 하나 골라 [시작] */
async function pickCard(H, key) {
  await H.evaluate(`document.querySelector('.mg-cat-card[data-key="${key}"]')?.scrollIntoView({ block: 'center' })`);
  await sleep(150);
  const c = await realClick(H, `.mg-cat-card[data-key="${key}"]`);
  await sleep(100);
  await realClick(H, '[data-mg-start]');
  return c;
}
/** ★ R063 — 설정의 미니게임 고르기 창에서 keys 만 골라 [확정] · 확정한 목록을 돌려준다 */
async function selectMinigames(H, keys) {
  // ★ R087 (D-344) — 숨긴 미니게임(빙고 · 이 노래 몇 년도 · 객관식)도 옛 회귀 검사는 그대로 — 검사 화면만 보이게
  await H.evaluate('window.__qwShowHidden?.(true)');
  await realClick(H, '[data-mg-catalog-open]');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 4000);
  const want = JSON.stringify(keys);
  await H.evaluate(`(() => { const want = new Set(${want}); const cards = [...document.querySelectorAll('.mg-cat-card')];
    for (const c of cards) if (want.has(c.dataset.key) && c.getAttribute('aria-pressed') !== 'true') c.click();
    for (const c of [...document.querySelectorAll('.mg-cat-card')]) if (!want.has(c.dataset.key) && c.getAttribute('aria-pressed') === 'true') c.click(); })()`);
  await sleep(200);
  const on = await H.evaluate("[...document.querySelectorAll('.mg-cat-card[aria-pressed=\"true\"]')].map((b) => b.dataset.key).join(',')");
  await H.evaluate("document.querySelector('[data-mg-confirm]')?.click()");
  await sleep(400);
  return on;
}
async function r051Start(H, key) {
  await realClick(H, '#minigame-pick-btn');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 3000);
  const c = await pickCard(H, key);
  record(`★ R051 골라 하기 — "${key}" 항목이 화면 안에서 눌린다`, c.hit === true, JSON.stringify(c));
  if (!(await waitPhase(H, 'intro', 8000))) throw new Error(`${key} 연습이 시작되지 않았다`);
}
async function r051Db(roomId, key) {
  return withPg(async (c) =>
    (
      await c.query(
        `SELECT a.login_id, r.round_index, r.submitted, r.input, r.value, r.error FROM minigame_results r JOIN accounts a ON a.id = r.account_id
          WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1 AND minigame_key = $2) ORDER BY r.round_index, a.login_id`,
        [roomId, key],
      )
    ).rows,
  );
}
const stateOf = (p) => p.evaluate("document.querySelector('.reaction-stage')?.dataset.state ?? ''");

async function r051Reaction(browser) {
  const { H, G, roomId } = await r051Room(browser, 'rx');
  await r051Start(H, 'reaction');
  await waitPhase(H, 'rules', 12000);
  await sleep(400);
  await snap(H, '60-live-reaction-rules-pc');
  await snap(G, '60-live-reaction-rules-m390');
  record('★ A 번개손 규칙 — 초록 = 진짜 · 소리를 꺼도 된다는 안내', (await H.evaluate("document.querySelector('.mg-rules')?.innerText ?? ''")).includes('초록'));
  let sawFake = new Set();
  for (let round = 0; round < 5; round += 1) {
    await H.waitFor(`document.querySelector('.mg-card')?.dataset.phase === 'play' && document.querySelector('.reaction-stage') !== null`, 30000);
    if (round === 0) {
      await sleep(300);
      await snap(H, '60-live-reaction-wait-pc');
      // G — 초록 전에 톡 (성급)
      const r = await rectOf(G, '.rx-panel');
      await trustedTap(G, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      record('★★★ A 번개손 모바일 — 초록 전에 톡 → "성급!" 실격 화면', (await stateOf(G)) === 'foul' && (await G.evaluate("document.querySelector('.rx-big')?.innerText ?? ''")).includes('성급'), await stateOf(G));
      await snap(G, '60-live-reaction-foul-m390');
    }
    // H — 화면을 지켜보다가(가짜는 기록) 초록이면 0.15초 뒤 Space
    const until = Date.now() + 9000;
    let go = false;
    while (Date.now() < until) {
      const s = await stateOf(H);
      if (s === 'fake-color' || s === 'fake-text') {
        if (!sawFake.has(s)) {
          sawFake.add(s);
          await snap(H, `60-live-reaction-${s}-pc`);
        }
      }
      if (s === 'go') {
        go = true;
        break;
      }
      await sleep(40);
    }
    if (round === 0) await snap(H, '60-live-reaction-go-pc');
    await sleep(150);
    if (go) await spaceKey(H);
    // ★ 둘 다 누르면 판이 바로 끝난다 — 내 화면 판정은 누른 직후에 읽는다
    const myBig = await H.evaluate("document.querySelector('.rx-big')?.innerText ?? document.querySelector('.mg-r051-big')?.innerText ?? ''");
    if (round === 0) await snap(H, '60-live-reaction-done-pc');
    if (round >= 1) {
      // G — 초록이면 톡
      const s = await stateOf(G);
      if (s === 'go') {
        const r = await rectOf(G, '.rx-panel');
        await trustedTap(G, r.x + r.w / 2, r.y + r.h / 2);
      }
    }
    await sleep(250);
    if (round === 0) {
      record('★★ A 번개손 PC — 초록 뒤 Space → "NNNms" 내 화면', /^\d+ms$/.test(myBig.trim()), myBig);
    }
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 12000);
    if (round === 0 || round === 2) {
      await sleep(500);
      await snap(H, `60-live-reaction-result${round + 1}-pc`);
      await snap(G, `60-live-reaction-result${round + 1}-m390`);
    }
  }
  record('★ A 번개손 — 퀵드로우 판에서 가짜 화면(색 또는 글자)을 한 번 이상 보았다', sawFake.size >= 1, [...sawFake].join(','));
  await waitPhase(H, 'final', 30000);
  await sleep(700);
  await snap(H, '60-live-reaction-final-pc');
  await snap(G, '60-live-reaction-final-m390');
  const db = await r051Db(roomId, 'reaction');
  const hv = db.filter((r) => r.login_id.endsWith('_rxh'));
  const gv = db.filter((r) => r.login_id.endsWith('_rxg'));
  record('★★★ A 번개손 기록 — PC 5판 값(100~600ms) · 모바일 1판 실격', hv.length === 5 && hv.every((r) => r.value !== null && r.value >= 100 && r.value < 600) && gv[0]?.submitted === true && gv[0]?.value === null, JSON.stringify([hv.map((r) => r.value), gv.map((r) => r.value)]));
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
  await H.close?.();
  await G.close?.();
}

async function r051Typing(browser) {
  const { H, G, roomId } = await r051Room(browser, 'tp');
  await r051Start(H, 'typing');
  await waitPhase(H, 'play', 30000);
  await sleep(400);
  const target = await H.evaluate("document.querySelector('.typing-target')?.innerText ?? ''");
  record('★★ B 타자 PC — 입력칸에 바로 포커스', await H.evaluate("document.activeElement?.classList.contains('typing-input') === true"));
  // 복사 막기 — 끌어 고르기 · 복사 명령
  const sel = await dragSelect(H, '.typing-target');
  const copied = await copiedText(H);
  record('★★★ B 제시 문장 — 끌어 고르기 · 복사 막힘', (sel ?? '').trim() === '' && copied === '', `${JSON.stringify(sel)} · ${JSON.stringify(copied)}`);
  record('★ B 제시 문장 — 오른쪽 클릭 메뉴 막힘', (await rightClickBlocked(H, '.typing-target')) === true);
  await H.evaluate("document.querySelector('.typing-input').focus()");
  // 붙여넣기 · 끌어 놓기 · beforeinput(insertFromPaste)
  const pasteBlocked = await H.evaluate(`(() => {
    const el = document.querySelector('.typing-input');
    const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(target)});
    const p = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(p);
    const d = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(d);
    const b = new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: ${JSON.stringify(target)}, bubbles: true, cancelable: true });
    el.dispatchEvent(b);
    return JSON.stringify([p.defaultPrevented, d.defaultPrevented, b.defaultPrevented, el.value]);
  })()`);
  record('★★★ B 입력칸 — 붙여넣기 · 끌어 놓기 · insertFromPaste 모두 막힘 · 값 그대로', pasteBlocked === JSON.stringify([true, true, true, '']), pasteBlocked);
  await sleep(200);
  record('★ B 붙여넣기를 막으면 안내 글', (await H.evaluate("document.querySelector('.typing-help')?.innerText ?? ''")).includes('붙여넣기'));
  // 틀린 글자 → 빨강
  await H.send('Input.insertText', { text: 'X' });
  await sleep(200);
  record('★★ B 틀린 글자 → 빨강 · 입력칸 빨간 테두리', (await H.evaluate("document.querySelectorAll('.typing-target .tc.bad').length")) === 1 && (await H.evaluate("document.querySelector('.typing-input').classList.contains('bad')")));
  await snap(H, '61-live-typing-bad-pc');
  await H.key('Backspace', { code: 'Backspace', vk: 8 });
  await sleep(150);
  // 조합 중 글자 (한글 판 — 첫 글자의 초성만 조합 중)
  await H.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
  await sleep(200);
  const comp = await H.evaluate("JSON.stringify([document.querySelectorAll('.typing-target .tc.composing').length, document.querySelectorAll('.typing-target .tc.bad').length])");
  record('★★ B 한글 조합 중 글자는 빨강이 아니다(조합 중 표시)', comp === JSON.stringify([1, 0]) || target.startsWith('ㄱ'), comp);
  await snap(H, '61-live-typing-composing-pc');
  await H.send('Input.insertText', { text: target.slice(0, 6) });
  await sleep(150);
  await H.send('Input.insertText', { text: target.slice(6) });
  await sleep(300);
  record('★★★ B 다 맞게 치면 바로 끝 — "N.NN초"', (await H.evaluate("document.querySelector('.typing-stage')?.dataset.done")) === '1', await H.evaluate("document.querySelector('.typing-help')?.innerText ?? ''"));
  await snap(H, '61-live-typing-done-pc');
  // G — 모바일: 입력칸을 눌러(키보드) 390×470 에서도 문장이 보인다
  const gi = await rectOf(G, '.typing-input');
  await trustedTap(G, gi.x + gi.w / 2, gi.y + gi.h / 2);
  await sleep(200);
  await G.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 470, deviceScaleFactor: 1, mobile: true });
  await G.evaluate("window.dispatchEvent(new Event('resize')); document.querySelector('.typing-input')?.scrollIntoView({ block: 'center' })");
  await sleep(700);
  const vis = JSON.parse(await G.evaluate(`JSON.stringify((() => { const t = document.querySelector('.typing-target').getBoundingClientRect(); const i = document.querySelector('.typing-input').getBoundingClientRect(); return { t: [Math.round(t.top), Math.round(t.bottom)], i: [Math.round(i.top), Math.round(i.bottom)], h: innerHeight, focus: document.activeElement?.className ?? '' }; })())`));
  record('★★★ B 모바일 키보드 올린 390×470 — 제시 문장과 입력칸이 함께 보인다', vis.t[0] >= 0 && vis.t[1] <= vis.h && vis.i[0] >= 0 && vis.i[1] <= vis.h, JSON.stringify(vis));
  record('★ B 모바일 입력칸 — 자동 대문자 · 자동 고침 · 맞춤법 끔', (await G.evaluate("(() => { const e = document.querySelector('.typing-input'); return [e.getAttribute('autocapitalize'), e.getAttribute('autocorrect'), e.getAttribute('spellcheck')].join(','); })()")) === 'off,off,false');
  await snap(G, '61-live-typing-kbd-m390x470');
  for (const ch of [...target]) await G.send('Input.insertText', { text: ch });
  await sleep(300);
  // ★ 둘 다 끝내면 판이 바로 끝난다 — 완성 화면 또는 판 결과
  record('★★ B 모바일도 다 치면 끝', (await G.evaluate("document.querySelector('.typing-stage')?.dataset.done === '1' || document.querySelector('.mg-card')?.dataset.phase === 'roundResult'")) === true);
  await touchDevice(G, 390, 844);
  await waitPhase(H, 'roundResult', 40000);
  await sleep(600);
  await snap(H, '61-live-typing-result1-pc');
  await snap(G, '61-live-typing-result1-m390');
  // 2판(영어) — H 반만 치고 둔다 → 미완 %
  await waitPhase(H, 'play', 30000);
  await sleep(400);
  const t2 = await H.evaluate("document.querySelector('.typing-target')?.innerText ?? ''");
  await H.evaluate("document.querySelector('.typing-input').focus()");
  await H.send('Input.insertText', { text: t2.slice(0, Math.floor(t2.length / 2)) });
  await sleep(300);
  await snap(H, '61-live-typing-en-half-pc');
  await waitPhase(H, 'roundResult', 45000);
  await sleep(600);
  await snap(H, '61-live-typing-result2-pc');
  record('★★ B 미완 — 판 결과에 "미완 N%"', (await H.evaluate("document.querySelector('.mg-table')?.innerText ?? ''")).includes('미완'));
  const db = await r051Db(roomId, 'typing');
  const h0 = db.find((r) => r.login_id.endsWith('_tph') && r.round_index === 0);
  const g0 = db.find((r) => r.login_id.endsWith('_tpg') && r.round_index === 0);
  const h1 = db.find((r) => r.login_id.endsWith('_tph') && r.round_index === 1);
  record('★★★ B 기록 — 1판 PC · 모바일 완성(초) · 2판 PC 미완(submitted=false · 값 1000+)', h0?.submitted && h0.value > 0 && h0.value < 30 && g0?.submitted && h1 && !h1.submitted && h1.value > 1000, JSON.stringify([h0?.value, g0?.value, h1?.value]));
  await waitPhase(H, 'final', 60000);
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
  await H.close?.();
  await G.close?.();
}

/** 원 그리기 — kind: 'mouse' | 'touch' · shape: 'circle' | 'half' */
async function drawCircle(page, kind, shape = 'circle', snapName = null) {
  const r = await rectOf(page, '.circle-pad');
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = r.w * 0.36;
  const to = shape === 'half' ? 180 : 368;
  const steps = 60;
  const at = (i) => {
    const d = (to * i) / steps;
    const a = (d * Math.PI) / 180;
    const wob = 1 + 0.025 * Math.sin(d / 20);
    return { x: cx + Math.cos(a) * rad * wob, y: cy + Math.sin(a) * rad * wob };
  };
  const p0 = at(0);
  if (kind === 'mouse') await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y, button: 'left', clickCount: 1 });
  else await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y }] });
  for (let i = 1; i <= steps; i += 1) {
    const p = at(i);
    if (kind === 'mouse') await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 });
    else await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
    if (i === Math.floor(steps * 0.6) && snapName) await snap(page, snapName);
    await sleep(12);
  }
  const pe = at(steps);
  if (kind === 'mouse') await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pe.x, y: pe.y, button: 'left', clickCount: 1 });
  else await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
}

async function r051Circle(browser) {
  const sh = await sharedDist();
  const { H, G, roomId } = await r051Room(browser, 'cr');
  await r051Start(H, 'circle');
  await waitPhase(H, 'play', 30000);
  await sleep(400);
  await snap(H, '62-live-circle-empty-pc');
  await drawCircle(H, 'mouse', 'circle', '62-live-circle-drawing-pc');
  const hs = await H.evaluate("document.querySelector('.circle-score')?.innerText ?? ''");
  record('★★ C 원 PC — 마우스로 그리고 떼면 바로 "NN.N%" · 맞춘 원(점선)', /\d+\.\d%/.test(hs) && (await H.evaluate("document.querySelector('.circle-pad .circle-fit') !== null")), hs);
  await snap(H, '62-live-circle-done-pc');
  // ★ 스크롤될 수 있는 상태에서 잰다(문서가 화면보다 길다 — 아래 여백을 잠깐 붙임)
  await G.evaluate("document.body.style.paddingBottom = '900px'");
  const y0 = await G.evaluate('scrollY');
  await drawCircle(G, 'touch', 'circle', '62-live-circle-drawing-m390');
  const y1 = await G.evaluate('scrollY');
  await G.evaluate("document.body.style.paddingBottom = ''");
  record('★★★ C 원 모바일 — 손가락으로 그리는 동안 화면이 스크롤되지 않는다 · 그림이 됨', y0 === y1 && (await G.evaluate("document.querySelector('.circle-stage')?.dataset.done === '1' || document.querySelector('.mg-card')?.dataset.phase === 'roundResult'")) === true, `${y0}→${y1}`);
  await snap(G, '62-live-circle-done-m390');
  await waitPhase(H, 'roundResult', 20000);
  await sleep(700);
  await snap(H, '62-live-circle-result1-pc');
  await snap(G, '62-live-circle-result1-m390');
  record('★★ C 판 결과 — 내 선 + 맞춘 원 겹쳐 · 둘의 그림', (await H.evaluate("document.querySelector('.circle-result .circle-ink') !== null && document.querySelector('.circle-result .circle-fit') !== null")) && (await H.evaluate("document.querySelectorAll('.mg-thumb-circle').length")) === 2);
  // 2판 — 반원 (덜 닫힘)
  await waitPhase(H, 'play', 30000);
  await sleep(400);
  await drawCircle(H, 'mouse', 'half');
  record('★★ C 반원 → "덜 닫혔어요"', (await H.evaluate("document.querySelector('.circle-help')?.innerText ?? ''")).includes('덜 닫혔'));
  await snap(H, '62-live-circle-half-pc');
  await waitPhase(H, 'final', 60000);
  const db = await r051Db(roomId, 'circle');
  const same = db.filter((r) => r.submitted).every((r) => Math.abs(sh.circleScore(r.input.points.map(([x, y]) => ({ x, y }))).score - r.value) < 0.01);
  const h0 = db.find((r) => r.login_id.endsWith('_crh') && r.round_index === 0);
  record('★★★ C 서버 값 = 기록된 점으로 다시 계산한 값 · PC 1판 80% 이상', same && h0?.value >= 80, JSON.stringify(db.map((r) => [r.login_id.slice(-3), r.round_index, r.value])));
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
  await H.close?.();
  await G.close?.();
}

/** 지금 각(화면의 손잡이 위치로) */
async function shownAngle(page) {
  return page.evaluate(`(() => { const t = document.querySelector('.angle-pad .angle-handle')?.getAttribute('transform') ?? ''; const m = t.match(/translate\\(([-\\d.]+) ([-\\d.]+)\\)/); if (!m) return null; return Math.atan2(108 - Number(m[2]), Number(m[1]) - 100) * 180 / Math.PI; })()`);
}
async function dragAngle(page, deg, kind) {
  const r = await rectOf(page, '.angle-pad');
  const toScr = (d) => ({ x: r.x + ((100 + Math.cos((d * Math.PI) / 180) * 70) / 200) * r.w, y: r.y + ((108 - Math.sin((d * Math.PI) / 180) * 70) / 120) * r.h });
  const s = toScr(90);
  const e = toScr(deg);
  if (kind === 'mouse') await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.x, y: s.y, button: 'left', clickCount: 1 });
  else await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y }] });
  for (let i = 1; i <= 10; i += 1) {
    const p = { x: s.x + ((e.x - s.x) * i) / 10, y: s.y + ((e.y - s.y) * i) / 10 };
    if (kind === 'mouse') await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 });
    else await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await sleep(15);
  }
  if (kind === 'mouse') await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: e.x, y: e.y, button: 'left', clickCount: 1 });
  else await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
}

async function r051Angle(browser) {
  const { H, G, roomId } = await r051Room(browser, 'ag');
  await r051Start(H, 'angle');
  await waitPhase(H, 'play', 30000);
  await sleep(400);
  await snap(H, '63-live-angle-start-pc');
  await snap(G, '63-live-angle-start-m390');
  const target = Number((await H.evaluate("document.querySelector('.angle-target')?.innerText ?? ''")).replace(/[^\d]/g, ''));
  // ★ 판은 10초 — 모바일을 먼저 끝낸다
  // G — 손가락으로 끌고 확정 버튼
  await dragAngle(G, target + 8, 'touch');
  await snap(G, '63-live-angle-drag-m390');
  const ok = await rectOf(G, '.angle-ok');
  await trustedTap(G, ok.x + ok.w / 2, ok.y + ok.h / 2);
  await sleep(300);
  record('★★ D 모바일 — 손가락 끌기 · 확정 버튼', (await G.evaluate("document.querySelector('.angle-stage')?.dataset.done")) === '1');
  await dragAngle(H, target + 3, 'mouse');
  const a1 = await shownAngle(H);
  await H.key('ArrowRight', { code: 'ArrowRight', vk: 39 });
  const a2 = await shownAngle(H);
  await H.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 });
  await H.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 });
  const a3 = await shownAngle(H);
  record('★★ D 각도 PC — 마우스 끌기 · → 는 −0.5° · ← 는 +0.5°', Math.abs(a1 - (target + 3)) < 1.5 && Math.abs(a2 - (a1 - 0.5)) < 0.05 && Math.abs(a3 - (a2 + 1)) < 0.05, JSON.stringify([target, a1, a2, a3]));
  // 목표 쪽으로 ← → 다듬기 (0.5° 씩)
  let cur = a3;
  for (let i = 0; i < 20 && Math.abs(cur - target) > 0.3; i += 1) {
    await H.key(cur > target ? 'ArrowRight' : 'ArrowLeft', { code: cur > target ? 'ArrowRight' : 'ArrowLeft', vk: cur > target ? 39 : 37 });
    cur = await shownAngle(H);
  }
  await snap(H, '63-live-angle-aim-pc');
  await H.key('Enter');
  await sleep(200);
  // ★ 모바일이 먼저 확정했으니 판이 바로 끝날 수 있다 — 확정 화면 또는 판 결과
  record('★★ D Enter 확정', (await H.evaluate("document.querySelector('.angle-stage')?.dataset.done === '1' || document.querySelector('.mg-card')?.dataset.phase === 'roundResult'")) === true);
  await waitPhase(H, 'roundResult', 20000);
  await sleep(700);
  await snap(H, '63-live-angle-result1-pc');
  await snap(G, '63-live-angle-result1-m390');
  record('★★ D 판 결과 — 내 각 · 목표 각(점선) 겹쳐 · 둘의 그림', (await H.evaluate("document.querySelector('.angle-result .angle-ray.target') !== null && document.querySelector('.angle-result .angle-ray.mine') !== null")) && (await H.evaluate("document.querySelectorAll('.mg-thumb-angle').length")) === 2);
  // 2판 — H 는 끌기만(확정 안 함) → 마감 때 그때 각
  await waitPhase(H, 'play', 30000);
  await sleep(300);
  const t2 = Number((await H.evaluate("document.querySelector('.angle-target')?.innerText ?? ''")).replace(/[^\d]/g, ''));
  await dragAngle(H, t2 - 6, 'mouse');
  const left = await shownAngle(H);
  await waitPhase(H, 'roundResult', 20000);
  const db = await r051Db(roomId, 'angle');
  const h0 = db.find((r) => r.login_id.endsWith('_agh') && r.round_index === 0);
  const g0 = db.find((r) => r.login_id.endsWith('_agg') && r.round_index === 0);
  const h1 = db.find((r) => r.login_id.endsWith('_agh') && r.round_index === 1);
  record('★★★ D 기록 — PC 1판 오차 < 0.5 · 모바일 ≈ 8 · 2판 미확정 = 그때 각', h0?.value < 0.5 && Math.abs((g0?.value ?? 0) - 8) < 1.5 && h1?.submitted && Math.abs(h1.input.deg - left) < 0.6, JSON.stringify([h0?.value, g0?.value, h1?.input, left]));
  await waitPhase(H, 'final', 60000);
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
  await H.close?.();
  await G.close?.();
}

async function r051Flow(browser) {
  if (!process.env.MG_SKIP_LAB) await r051Lab(browser);
  if (process.env.MG_SKIP_LIVE) return;
  if (R051_GAMES.includes('reaction')) await r051Reaction(browser);
  if (R051_GAMES.includes('typing')) await r051Typing(browser);
  if (R051_GAMES.includes('circle')) await r051Circle(browser);
  if (R051_GAMES.includes('angle')) await r051Angle(browser);
}

// -----------------------------------------------------------------------------
// ★★★ R052 — 퀴즈류 다섯 화면 점검 (ui-check:minigame 에 이어서 · MG_QUIZ=price,worldprice,photo,estimate,which · MG_SKIP_R052)
//   [1] 실험실 장면(더미 · 실제 그림 id) — 규칙 · 진행 · 정답 공개 · 최종 · 사진 zoom/mosaic(실제 그림) · 빅맥 전체 순위 표
//   [2] 실제 퀴즈 판 — H(PC 1280) · G(390 터치): 5문제 판 · 미니게임 하나만 켬 · 두 사람이 3문제를 맞혀 넘김 → 미니게임
//       숫자: H 키보드(정답 × 1.1) · G 톡 입력(정답 × 0.8) / 사진: H 틀림 → 맞힘 · G 맞힘 / 어느 쪽: H ← → · G 톡
// -----------------------------------------------------------------------------
const R052_GAMES = (process.env.MG_QUIZ ?? 'price,worldprice,photo,estimate,which').split(',').filter(Boolean);
async function quizRoundItem(roomId) {
  return withPg(async (c) =>
    (
      await c.query(
        `SELECT r.item_id, i.payload, i.game FROM minigame_rounds r JOIN minigame_items i ON i.item_id = r.item_id
          WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1) ORDER BY r.round_index DESC LIMIT 1`,
        [roomId],
      )
    ).rows[0] ?? null,
  );
}
async function quizAnswerNumber(row) {
  if (!row) return null;
  if (row.game === 'price') return row.payload.priceKrw;
  if (row.game === 'estimate') return row.payload.value;
  const pr = await withPg(async (c) => (await c.query(`SELECT payload FROM minigame_products WHERE product_id = $1`, [row.payload.productId])).rows[0]?.payload);
  return pr?.rows.find((x) => x.cc === row.payload.targetCc)?.krw ?? null;
}
async function r052Lab(browser) {
  const L = await newPage(browser, 'M3-lab', true); // ★ R097 — 따로 맥락(앞 가입 쿠키면 인증 화면 없음)
  await L.setViewport(1280, 720);
  await signUp(L, 'm3l', '그림점검셋');
  const imgs = await withPg(async (c) =>
    Object.fromEntries(
      (
        await c.query(
          `SELECT DISTINCT ON (k) k, image_id FROM (
             SELECT CASE WHEN payload->>'revealMode' = 'zoom' THEN 'zoom' WHEN payload->>'revealMode' = 'mosaic' THEN 'mosaic' ELSE game END k, image_ids[1] image_id, item_id
               FROM minigame_items WHERE active AND cardinality(image_ids) > 0) x ORDER BY k, item_id`,
        )
      ).rows.map((r) => [r.k, r.image_id]),
    ),
  );
  console.log(`[r052-lab] 실제 그림 ${JSON.stringify(imgs)}`);
  const scenes = [];
  for (const k of R052_GAMES) for (const ph of ['rules', 'play', 'roundResult', 'final']) scenes.push([k, ph, '']);
  if (R052_GAMES.includes('photo')) scenes.push(['photo', 'play', `&image=${imgs.zoom}&mode=zoom&at=2500`, 'zoom-real-2s'], ['photo', 'play', `&image=${imgs.zoom}&mode=zoom&at=11000`, 'zoom-real-11s'], ['photo', 'play', `&image=${imgs.mosaic}&mode=mosaic&at=2500`, 'mosaic-real-2s'], ['photo', 'play', `&image=${imgs.mosaic}&mode=mosaic&at=11000`, 'mosaic-real-11s']);
  if (R052_GAMES.includes('price')) scenes.push(['price', 'play', `&image=${imgs.price}&state=seen`, 'real-seen']);
  const num = { price: 70, worldprice: 71, photo: 72, estimate: 73, which: 74 };
  for (const [k, ph, extra, tag] of scenes) {
    const name = `${num[k]}-scene-${k}-${ph}${tag ? `-${tag}` : ''}`;
    for (const [dev, w, h, touch] of [['pc', 1280, 720, false], ['m390', 390, 844, true]]) {
      if (touch) await touchDevice(L, w, h);
      else {
        await touchDevice(L, w, h, false);
        await L.setViewport(w, h);
      }
      await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024${extra}`);
      await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${ph}'`, 6000);
      await L.waitFor("[...document.querySelectorAll('img.quiz-img')].every((i) => i.complete)", 5000);
      await sleep(ph === 'roundResult' ? 700 : 450);
      await snap(L, `${name}-${dev}`);
      if (touch && (ph === 'play' || ph === 'roundResult')) {
        await touchDevice(L, 344, 882);
        await L.evaluate("window.dispatchEvent(new Event('resize'))");
        await sleep(250);
        const over = await L.evaluate('document.documentElement.scrollWidth - innerWidth');
        record(`★ R052 장면 ${k}/${ph}${tag ? `/${tag}` : ''} — 폴드 접힘(344) 가로 넘침 없음`, over <= 1, String(over));
      }
    }
    if (tag && tag.startsWith('zoom') || tag?.startsWith('mosaic')) {
      const ok = await L.evaluate(tag.startsWith('zoom') ? "Boolean(document.querySelector('.photo-zoom img.quiz-img')?.naturalWidth)" : "Boolean(document.querySelector('canvas.photo-canvas') || document.querySelector('.photo-zoom img.quiz-img')?.naturalWidth)");
      record(`★★ E 사진 ${tag} — 실제 그림(DB bytea)이 /api/minigame/image 로 보인다`, ok === true);
    }
  }
  // 빅맥 전체 순위 표 · 주요국 · 이미 본 문항
  if (R052_GAMES.includes('worldprice')) {
    await touchDevice(L, 1280, 720, false);
    await L.setViewport(1280, 720);
    await L.goto(`${BASE}/lab/minigame?scene=1&key=worldprice&phase=roundResult&seed=2024`);
    await L.waitFor("document.querySelectorAll('.wp-table li').length > 3", 5000);
    record('★★ D 빅맥 정답 공개 — 전체 순위 표 · 목표국 강조 · 한국 강조 · 최저/최고', (await L.evaluate("[document.querySelectorAll('.wp-table li').length, document.querySelectorAll('.wp-table li.target').length, document.querySelectorAll('.wp-table li.kr').length, Boolean(document.querySelector('.wp-minmax'))].join()")) === '5,1,1,true');
  }
  if (R052_GAMES.includes('price')) {
    await L.goto(`${BASE}/lab/minigame?scene=1&key=price&phase=play&seed=2024&state=seen`);
    await L.waitFor("document.querySelector('.quiz-seen') !== null", 5000);
    record('★★ B "이미 본 문항" 표시', (await L.evaluate("document.querySelector('.quiz-seen')?.innerText ?? ''")).includes('이미 본 문항'));
  }
  await touchDevice(L, 1280, 720, false);
  await L.close?.();
}

/** 로비 설정 — 미니게임 하나만 · 문제 5 */
async function onlyMinigame(H, key) {
  if (!(await H.evaluate("document.querySelector('.mg-check input')?.checked === true"))) {
    await realClick(H, '.mg-check input');
    await H.waitFor("document.querySelector('[data-mg-catalog-open]') !== null", 4000);
  }
  // ★ R063 — 칩 나열 → 고르기 창(카드 · [확정])
  const on = await selectMinigames(H, [key]);
  await setQuestionCount(H, 5);
  record(`★ 설정 — 미니게임 '${key}' 하나만 켬`, on === key, on);
}
/** 퀴즈 판 시작 → 3문제를 두 사람이 맞혀 넘긴다 → 미니게임 시작(intro)까지 */
async function toMinigame(H, G) {
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  for (let q = 0; q < 3; q += 1) {
    await H.waitFor("document.querySelector('.question-card .q-text') !== null && document.querySelector('.mg-card') === null", 30000);
    const before = await H.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
    await answerCurrent(H, H);
    await answerCurrent(H, G);
    await H.waitFor(`document.querySelector('.mg-card') !== null || (document.querySelector('.question-card .q-text')?.dataset.text ?? '') !== ${JSON.stringify(before)}`, 30000);
  }
  return waitPhase(H, 'intro', 30000);
}
async function typeNumber(page, value, viaTap) {
  const s = String(Math.round(value));
  if (viaTap) {
    const r = await rectOf(page, '.quiz-num-input');
    await trustedTap(page, r.x + r.w / 2, r.y + r.h / 2);
  } else await page.evaluate("document.querySelector('.quiz-num-input')?.focus()");
  await page.send('Input.insertText', { text: s });
  await sleep(150);
}
async function r052Live(browser, key) {
  const { H, G, roomId } = await r051Room(browser, `q${key.slice(0, 2)}`);
  await onlyMinigame(H, key);
  await sleep(300);
  if (!(await toMinigame(H, G))) throw new Error(`${key} 미니게임이 시작되지 않았다`);
  const num = { price: 70, worldprice: 71, photo: 72, estimate: 73, which: 74 }[key];
  await sleep(500);
  await snap(H, `${num}-live-${key}-intro-pc`);
  const items = key === 'which' ? 10 : 5;
  for (let i = 0; i < items; i += 1) {
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'play'", 30000);
    await H.waitFor("[...document.querySelectorAll('img.quiz-img')].every((x) => x.complete)", 4000);
    await sleep(300);
    const row = await quizRoundItem(roomId);
    if (i === 0) {
      await snap(H, `${num}-live-${key}-play-pc`);
      await snap(G, `${num}-live-${key}-play-m390`);
      // ★ 어느 쪽?은 그림 없는 문항(null)도 있다 — 그때는 그림이 0장이어도 된다
      // ★ R055 — 사진은 판마다 확대/모자이크가 뽑힌다: 모자이크는 <canvas> 라 img 가 0장이었다(검사 결함 — R053 은 확대가 뽑혀 통과)
    const imgOk = await H.evaluate(`(() => { const xs = [...document.querySelectorAll('img.quiz-img')]; const cv = [...document.querySelectorAll('canvas.photo-canvas')].filter((c) => c.width > 0 && c.height > 0); return (xs.length + cv.length > 0 || '${key}' === 'which') && xs.every((x) => x.naturalWidth > 0); })()`);
      record(`★★ ${key} 진행 — 그림이 실제로 보인다(naturalWidth > 0)`, imgOk === true);
    }
    if (key === 'price' || key === 'worldprice' || key === 'estimate') {
      const ans = await quizAnswerNumber(row);
      await typeNumber(H, ans * 1.1, false);
      if (i === 0) {
        record(`★★ ${key} 숫자 입력 — 쉼표 자동`, (await H.evaluate("document.querySelector('.quiz-num-input')?.value ?? ''")).includes(',') || ans * 1.1 < 1000);
        await snap(H, `${num}-live-${key}-typed-pc`);
      }
      await H.key('Enter');
      await typeNumber(G, ans * 0.8, true);
      const ok = await rectOf(G, '.quiz-num-ok');
      if (ok) await trustedTap(G, ok.x + ok.w / 2, ok.y + ok.h / 2);
    } else if (key === 'photo') {
      if (i === 0) {
        await sleep(2200);
        await snap(H, `${num}-live-photo-reveal-${row?.payload.revealMode}-pc`);
      }
      await H.evaluate("document.querySelector('.quiz-num-input')?.focus()");
      await H.send('Input.insertText', { text: '전혀아닌답' });
      await H.key('Enter');
      await H.waitFor("document.querySelector('.quiz-num-help')?.dataset.feedback === 'wrong'", 3000);
      if (i === 0) {
        record('★★ E 사진 틀림 → "아니에요. 다시!"', (await H.evaluate("document.querySelector('.quiz-num-help')?.innerText ?? ''")).includes('아니에요'));
        await snap(H, `${num}-live-photo-wrong-pc`);
      }
      await H.send('Input.insertText', { text: row.payload.answer });
      await H.key('Enter');
      await H.waitFor("document.querySelector('.quiz-num-help')?.dataset.feedback === 'correct'", 3000);
      if (i === 0) {
        record('★★★ E 사진 맞힘 → "정답! N.N초"', (await H.evaluate("document.querySelector('.quiz-num-help')?.innerText ?? ''")).includes('정답'));
        await snap(H, `${num}-live-photo-correct-pc`);
      }
      const gi = await rectOf(G, '.quiz-num-input');
      await trustedTap(G, gi.x + gi.w / 2, gi.y + gi.h / 2);
      await G.send('Input.insertText', { text: row.payload.answer });
      const ok = await rectOf(G, '.quiz-num-ok');
      if (ok) await trustedTap(G, ok.x + ok.w / 2, ok.y + ok.h / 2);
    } else {
      const ans = row.payload.answer;
      await H.key(ans === 'a' ? 'ArrowLeft' : 'ArrowRight', { code: ans === 'a' ? 'ArrowLeft' : 'ArrowRight', vk: ans === 'a' ? 37 : 39 });
      const other = ans === 'a' ? 'b' : 'a';
      const c = await rectOf(G, `.which-card[data-side="${i % 2 ? ans : other}"]`);
      if (c) await trustedTap(G, c.x + c.w / 2, c.y + c.h / 2);
      if (i === 0) await snap(H, `${num}-live-which-picked-pc`);
    }
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 20000);
    if (i === 0) {
      await sleep(500);
      await snap(H, `${num}-live-${key}-result-pc`);
      await snap(G, `${num}-live-${key}-result-m390`);
      record(`★★ ${key} 정답 공개 — 정답 영역 · 표`, (await H.evaluate("document.querySelector('.quiz-reveal') !== null && document.querySelectorAll('.mg-table li').length === 2")) === true);
    }
  }
  await waitPhase(H, 'final', 30000);
  await sleep(600);
  await snap(H, `${num}-live-${key}-final-pc`);
  await snap(G, `${num}-live-${key}-final-m390`);
  const db = await withPg(async (c) =>
    (await c.query(`SELECT a.login_id, r.round_index, r.points, r.input FROM minigame_results r JOIN accounts a ON a.id = r.account_id WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1) ORDER BY r.round_index`, [roomId])).rows,
  );
  const hPts = db.filter((r) => /h$/.test(r.login_id)).reduce((s, r) => s + r.points, 0);
  const gPts = db.filter((r) => /g$/.test(r.login_id)).reduce((s, r) => s + r.points, 0);
  const exp = await withPg(async (c) => (await c.query(`SELECT count(*)::int n FROM minigame_item_experiences e JOIN accounts a ON a.id = e.account_id WHERE e.minigame_key = $2 AND a.login_id LIKE $1`, [`%_q${key.slice(0, 2)}%`, key])).rows[0].n);
  record(`★★★ ${key} 기록 — 문항 × 2명 · 경험 ${items * 2}행 · 점수(H ${hPts} · G ${gPts})`, db.length === items * 2 && exp === items * 2, `${db.length} · ${exp}`);
  const gSub = db.filter((r) => /g$/.test(r.login_id) && r.input).length;
  record(`★★ ${key} 모바일(G)도 입력이 서버에 닿았다`, gSub >= Math.min(3, items), String(gSub));
  if (key === 'which') record('★★ G 어느 쪽 최종 — 문항별 정리 표', (await H.evaluate("document.querySelectorAll('.which-summary tbody tr').length")) === 2);
  await H.waitFor("document.querySelector('.mg-card') === null", 30000);
  await H.close?.();
  await G.close?.();
}
async function r052Flow(browser) {
  if (!process.env.MG_SKIP_LAB) await r052Lab(browser);
  if (process.env.MG_SKIP_LIVE) return;
  for (const k of R052_GAMES) await r052Live(browser, k);
}

// -----------------------------------------------------------------------------
// ★★★ R053 — 미니게임 3차 화면 점검 (MG_R053=minority,oddone,gauge · MG_SKIP_R053 · R060 twothirds 삭제)
//   [1] 실험실 장면 — 규칙 · 진행 · 판 결과 · 최종 · 다른 하나 4×4/7×7 · 게이지 가림 (PC 1280 · 390 · 폴드 344)
//   [2] 연습 판 — H(PC 1280 · 키보드/마우스) · G(390 터치)
// -----------------------------------------------------------------------------
const R053_GAMES = (process.env.MG_R053 ?? 'minority,oddone,gauge').split(',').filter(Boolean);
async function r053Lab(browser) {
  const L = await newPage(browser, 'M4-lab', true); // ★ R097 — 따로 맥락(앞 가입 쿠키면 인증 화면 없음)
  await L.setViewport(1280, 720);
  await signUp(L, 'm4l', '그림점검넷');
  const num = { minority: 80, oddone: 82, gauge: 83 };
  const scenes = [];
  for (const k of R053_GAMES) for (const ph of ['rules', 'play', 'roundResult', 'final']) scenes.push([k, ph, '', '']);
  if (R053_GAMES.includes('oddone')) scenes.push(['oddone', 'play', '&size=7', '7x7']);
  if (R053_GAMES.includes('gauge')) scenes.push(['gauge', 'play', '&state=hidden&at=480', 'hidden']);
  for (const [k, ph, extra, tag] of scenes) {
    const name = `${num[k]}-scene-${k}-${ph}${tag ? `-${tag}` : ''}`;
    for (const [dev, w, h, touch] of [['pc', 1280, 720, false], ['m390', 390, 844, true], ['fold', 344, 882, true]]) {
      if (dev === 'fold' && ph !== 'play' && ph !== 'roundResult') continue;
      if (touch) await touchDevice(L, w, h);
      else {
        await touchDevice(L, w, h, false);
        await L.setViewport(w, h);
      }
      await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024${extra}`);
      await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${ph}'`, 6000);
      await sleep(450);
      await snap(L, `${name}-${dev}`);
      if (dev === 'fold') {
        const over = await L.evaluate('document.documentElement.scrollWidth - innerWidth');
        record(`★ R053 장면 ${k}/${ph}${tag ? `/${tag}` : ''} — 폴드(344) 가로 넘침 없음`, over <= 1, String(over));
        if (k === 'oddone' && tag === '7x7') {
          const cw = await L.evaluate("Math.round(document.querySelector('.oddone-cell')?.getBoundingClientRect().width ?? 0)");
          record('★★ C 7×7 폴드 접힘 — 칸 폭이 손가락에 맞는가(≥ 36px)', cw >= 36, `${cw}px`);
        }
      }
    }
  }
  if (R053_GAMES.includes('gauge')) {
    await touchDevice(L, 1280, 720, false);
    await L.setViewport(1280, 720);
    await L.goto(`${BASE}/lab/minigame?scene=1&key=gauge&phase=play&seed=2024&state=hidden&at=480`);
    await L.waitFor("document.querySelector('.gauge-mask') !== null", 5000);
    record('★★ D 게이지 4~5판 — 가운데 30% 가림', (await L.evaluate("Math.round(parseFloat(document.querySelector('.gauge-mask').style.width))")) === 30);
  }
  await touchDevice(L, 1280, 720, false);
  await L.close?.();
}
async function r053Live(browser, key) {
  const { H, G, roomId } = await r051Room(browser, `n${key.slice(0, 3)}`);
  const num = { minority: 80, oddone: 82, gauge: 83 }[key];
  await r051Start(H, key);
  await waitPhase(H, 'rules', 12000);
  await sleep(400);
  await snap(H, `${num}-live-${key}-rules-pc`);
  await snap(G, `${num}-live-${key}-rules-m390`);
  const rounds = { minority: 5, oddone: 5, gauge: 5 }[key];
  for (let i = 0; i < rounds; i += 1) {
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'play'", 30000);
    await sleep(300);
    if (key === 'minority') {
      // ★ R097 — R077 (D-327) 선택지 = 인원 − 1(최소 2) → 2명 방은 1 · 2 뿐(옛 기대 '3 키' 는 없는 카드)
      await H.key('1', { code: 'Digit1', vk: 49, text: true });
      const c = await rectOf(G, '.minority-card[data-n="2"]');
      await trustedTap(G, c.x + c.w / 2, c.y + c.h / 2);
      await sleep(200);
      if (i === 0) {
        record('★★ A 소수파 (D-327 2명 = 1~2) — PC 1 키 · 모바일 톡으로 고름', (await H.evaluate("document.querySelector('.minority-card.picked')?.dataset.n")) === '1' && (await G.evaluate("document.querySelector('.minority-card.picked')?.dataset.n")) === '2');
        await snap(H, `${num}-live-minority-picked-pc`);
        await snap(G, `${num}-live-minority-picked-m390`);
      }
    } else if (key === 'oddone') {
      const cells = JSON.parse(await H.evaluate(`JSON.stringify((() => { const cs = [...document.querySelectorAll('.oddone-cell')]; const srcs = cs.map((c) => c.querySelector('img')?.getAttribute('src')); const cnt = {}; for (const s of srcs) cnt[s] = (cnt[s] ?? 0) + 1; const odd = srcs.findIndex((s) => cnt[s] === 1); return { odd, n: cs.length }; })())`));
      const cell = async (page, idx) => rectOf(page, `.oddone-cell[data-i="${idx}"]`);
      // H — 한 번 틀리고 맞힘 · G — 바로 맞힘(톡)
      const w = await cell(H, cells.odd === 0 ? 1 : 0);
      await trustedClick(H, w.x + w.w / 2, w.y + w.h / 2);
      await sleep(250);
      if (i === 0) {
        record('★★ C 틀림 → +2초 안내', (await H.evaluate("document.querySelector('.quiz-num-help')?.innerText ?? ''")).includes('+2초'));
        await snap(H, `${num}-live-oddone-wrong-pc`);
      }
      const r = await cell(H, cells.odd);
      await trustedClick(H, r.x + r.w / 2, r.y + r.h / 2);
      const g = await cell(G, cells.odd);
      if (g) await trustedTap(G, g.x + g.w / 2, g.y + g.h / 2);
      await sleep(250);
      // ★ R071 (D-315) — 판마다 한 장(격자 4~8 · 2판부터 어려운 쌍)
      await snap(H, `${num}-live-oddone-r${i + 1}-pc`);
      if (i === 0 || i === 4) await snap(G, `${num}-live-oddone-r${i + 1}-m390`);
    } else {
      // 게이지 — 가운데 근처에 올 때 Space (H) · G 는 톡
      let pressed = false;
      for (let t = 0; t < 80 && !pressed; t += 1) {
        const left = await H.evaluate("parseFloat(document.querySelector('.gauge-marker')?.style.left ?? '0')");
        if (Math.abs(left - 50) < 8) {
          await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
          await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
          pressed = true;
        } else await sleep(15);
      }
      const tr = await rectOf(G, '.gauge-track');
      await trustedTap(G, tr.x + tr.w / 2, tr.y + tr.h / 2);
      await sleep(200);
      if (i === 0 || i === 3) {
        await snap(H, `${num}-live-gauge-r${i + 1}-pc`);
        await snap(G, `${num}-live-gauge-r${i + 1}-m390`);
      }
    }
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 20000);
    if (i === 0) {
      await sleep(500);
      await snap(H, `${num}-live-${key}-result-pc`);
      await snap(G, `${num}-live-${key}-result-m390`);
    }
  }
  await waitPhase(H, 'final', 30000);
  await sleep(600);
  await snap(H, `${num}-live-${key}-final-pc`);
  const db = await withPg(async (c) =>
    (await c.query(`SELECT a.login_id, r.round_index, r.submitted, r.value, r.points, r.input FROM minigame_results r JOIN accounts a ON a.id = r.account_id WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1) ORDER BY r.round_index`, [roomId])).rows,
  );
  const h = db.filter((r) => /h$/.test(r.login_id));
  const g = db.filter((r) => /g$/.test(r.login_id));
  const ok =
    key === 'minority'
      ? h.every((r) => r.input?.pick === 1) && g.every((r) => r.input?.pick === 2) && h.every((r) => r.points === 1) && g.every((r) => r.points === 1)
      : key === 'oddone'
          ? h.every((r) => r.submitted && r.input?.wrong === 1 && r.value >= 2000) && g.filter((r) => r.submitted).length >= 3
          : h.every((r) => r.submitted && r.value < 25) && g.every((r) => r.submitted);
  record(`★★★ ${key} 실제 판 기록(DB) — 입력 · 값`, ok, JSON.stringify([h.map((r) => r.value), g.map((r) => r.value)]));
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
  await H.close?.();
  await G.close?.();
}
async function r053Flow(browser) {
  if (!process.env.MG_SKIP_LAB) await r053Lab(browser);
  if (process.env.MG_SKIP_LIVE) return;
  for (const k of R053_GAMES) {
    await closeAllTabs(browser);
    await r053Live(browser, k);
  }
}

// -----------------------------------------------------------------------------
// ★★ R054 — 전적 · 업적 창 · 업적 토스트 · 풍선 · 연타 (MG_R054=balloon,tap · MG_SKIP_R054 · UICHECK_STATS)
// -----------------------------------------------------------------------------
const R054_GAMES = (process.env.MG_R054 ?? 'balloon,tap').split(',').filter(Boolean);
async function r054Lab(browser) {
  const L = await newPage(browser, 'M5-lab', true); // ★ R097 — 따로 맥락(앞 가입 쿠키면 인증 화면 없음)
  await L.setViewport(1280, 720);
  await signUp(L, 'm5l', '그림점검다섯');
  const num = { balloon: 90, tap: 91 };
  const scenes = [];
  for (const k of R054_GAMES) for (const ph of ['rules', 'play', 'roundResult', 'final']) scenes.push([k, ph, '', '']);
  if (R054_GAMES.includes('balloon')) scenes.push(['balloon', 'roundResult', '&state=popped', 'popped']);
  for (const [k, ph, extra, tag] of scenes) {
    const name = `${num[k]}-scene-${k}-${ph}${tag ? `-${tag}` : ''}`;
    for (const [dev, w, h, touch] of [['pc', 1280, 720, false], ['m390', 390, 844, true]]) {
      if (touch) await touchDevice(L, w, h);
      else {
        await touchDevice(L, w, h, false);
        await L.setViewport(w, h);
      }
      await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024${extra}`);
      await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${ph}'`, 6000);
      await sleep(450);
      await snap(L, `${name}-${dev}`);
      if (touch && ph === 'play') {
        const over = await L.evaluate('document.documentElement.scrollWidth - innerWidth');
        record(`★ R054 장면 ${k}/${ph} — 390 가로 넘침 없음`, over <= 1, String(over));
      }
    }
  }
  await touchDevice(L, 1280, 720, false);
  await L.close?.();
}
async function r054Live(browser, key) {
  const { H, G, roomId } = await r051Room(browser, `x${key.slice(0, 3)}`);
  const num = { balloon: 90, tap: 91 }[key];
  await r051Start(H, key);
  for (let i = 0; i < 3; i += 1) {
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'play'", 30000);
    await sleep(300);
    if (key === 'balloon') {
      await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
      // ★ R097 — R063 (D-261) 풍선 = 펌프 규칙(누를 때마다 한 번 · Space / [펌프] 버튼) — 옛 '꾹 누르기(상자 터치)' 는 펌프가 아니다 → G 는 [펌프] 버튼을 톡
      const gr = await rectOf(G, '[data-balloon-pump]');
      await G.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gr.x + gr.w / 2, y: gr.y + gr.h / 2 }] });
      await sleep(1200);
      if (i === 0) {
        await snap(H, `${num}-live-balloon-holding-pc`);
        await snap(G, `${num}-live-balloon-holding-m390`);
        // ★ R055 — PC 에서 풍선이 칸을 넘쳐 % 글자를 덮던 결함: 풍선 몸통이 상자 안 · 글자 위에
        for (const [P, nm] of [[H, 'PC'], [G, 'm390']]) {
          const fit = JSON.parse(
            await P.evaluate(
              "(() => { const b = document.querySelector('.balloon-body')?.getBoundingClientRect(); const box = document.querySelector('.balloon-box')?.getBoundingClientRect(); const t = document.querySelector('.balloon-pct')?.getBoundingClientRect(); return JSON.stringify(b && box && t ? { bw: Math.round(b.width), boxW: Math.round(box.width), inBox: b.top >= box.top - 1 && b.bottom <= box.bottom + 1, aboveText: b.bottom <= t.top + 1 } : null); })()",
            ),
          );
          record(`★★ ${nm} 풍선이 상자 안 · % 글자를 덮지 않음`, !!fit && fit.inBox && fit.aboveText, JSON.stringify(fit));
        }
      }
      await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await sleep(600);
      await G.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (let t = 0; t < 20; t += 1) {
        await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
        await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await sleep(30);
      }
      // 꾹 누름(자동 반복 5번) — 한 번만 센다
      await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
      for (let t = 0; t < 5; t += 1) await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ', autoRepeat: true });
      await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      const b = await rectOf(G, '.tap-btn');
      for (let t = 0; t < 15; t += 1) await trustedTap(G, b.x + b.w / 2, b.y + b.h / 2);
      if (i === 0) {
        record('★★ D 연타 — PC 20번 + 꾹 누름 1번 = 21', (await H.evaluate("document.querySelector('.tap-count')?.dataset.count")) === '21', await H.evaluate("document.querySelector('.tap-count')?.dataset.count"));
        await snap(H, `${num}-live-tap-pc`);
        await snap(G, `${num}-live-tap-m390`);
      }
    }
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 20000);
    if (i === 0) {
      await sleep(500);
      await snap(H, `${num}-live-${key}-result-pc`);
      await snap(G, `${num}-live-${key}-result-m390`);
    }
  }
  await waitPhase(H, 'final', 30000);
  const db = await withPg(async (c) =>
    (await c.query(`SELECT a.login_id, r.round_index, r.submitted, r.value, r.input FROM minigame_results r JOIN accounts a ON a.id = r.account_id WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1) ORDER BY r.round_index`, [roomId])).rows,
  );
  const h = db.filter((r) => /h$/.test(r.login_id));
  const g = db.filter((r) => /g$/.test(r.login_id));
  // ★ R097 — D-261 펌프 규칙: 한 번 누름 = pumps 1 · total = 첫 바람(BALLOON_PUMP_MIN 6 ~ MAX 16) · 안 터짐 (옛 기대 input.size 105~125 = 꾹 누르기 시절)
  const pumped1 = (r) => r.submitted && r.input?.pumps === 1 && r.input?.total >= 6 && r.input?.total <= 16 && r.input?.popped === false;
  const ok = key === 'balloon' ? h.length === 3 && h.every(pumped1) && g.length === 3 && g.every(pumped1) : h.every((r) => r.value === 21) && g.every((r) => r.value >= 10);
  record(`★★★ ${key} 실제 판 기록(DB)`, ok, JSON.stringify([h.map((r) => r.input), g.map((r) => r.value)]));
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
  await H.close?.();
  await G.close?.();
}
/** 전적 · 업적 창 — bot_01(기록이 많다)로 · 숫자를 DB 와 대조 · 업적 토스트(새 계정 첫 정답) */
async function r054Stats(browser) {
  const P = await newPage(browser, 'S-bot01', true);
  await P.setViewport(1280, 720);
  await loginAs(P, 'bot_01', 'bot1234');
  await P.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.includes('프로필'))?.click()");
  await P.waitFor("document.querySelector('.stats-open') !== null", 5000);
  await realClick(P, '.stats-open');
  await P.waitFor("document.querySelector('.stats-body')?.dataset.loaded === '1'", 8000);
  await sleep(400);
  await snap(P, '92-stats-pc');
  const shown = JSON.parse(await P.evaluate("JSON.stringify({ correct: document.querySelector('[data-stat=correct]')?.innerText, balance: document.querySelector('[data-stat=balance]')?.innerText })"));
  const db = await withPg(async (c) => (await c.query(`SELECT (SELECT count(*) FROM answer_events e JOIN accounts a ON a.id = e.account_id WHERE a.login_id = 'bot_01' AND e.accepted)::int c`)).rows[0].c);
  const api = await P.evaluate("fetch('/api/me/points').then((r) => r.json()).then((j) => String(j.balance))");
  record('★★★ A 전적 — 맞힌 수 = DB · 포인트 = /api/me/points', Number(shown.correct) === db && shown.balance === api, `${JSON.stringify(shown)} · DB ${db} · API ${api}`);
  await realClick(P, '.stats-tabs [data-tab="ach"]');
  await P.waitFor("document.querySelector('.ach-list')?.dataset.loaded === '1'", 5000);
  await sleep(300);
  await snap(P, '92-achievements-pc');
  const on = await P.evaluate("document.querySelectorAll('.ach.on').length");
  const dbOn = await withPg(async (c) => (await c.query(`SELECT count(*)::int n FROM achievements a JOIN accounts x ON x.id = a.account_id WHERE x.login_id = 'bot_01'`)).rows[0].n);
  record('★★ B 업적 칸 — 밝은 것 = 표의 행 수', on === dbOn, `${on} / ${dbOn}`);
  await P.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(200);
  await snap(P, '92-achievements-pc-night');
  await touchDevice(P, 390, 844);
  await P.evaluate("window.dispatchEvent(new Event('resize'))");
  await sleep(300);
  await snap(P, '92-achievements-m390-night');
  await realClick(P, '.stats-tabs [data-tab="stats"]');
  await sleep(300);
  await P.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await sleep(600); // ★ R055 — 테마 바꾼 직후에 찍으면 색 넘어가는 중간이 찍힌다
  await snap(P, '92-stats-m390');
  await P.close?.();
  // 업적 토스트 — 새 계정이 첫 문제를 맞힌다
  const H = await newPage(browser, 'S-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'ach', '업적방장');
  await createRoom(H, 'R054 업적');
  await setQuestionCount(H, 5);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.question-card .q-text') !== null", 30000);
  await answerCurrent(H, H);
  const got = await H.waitFor("document.querySelector('.ach-toast') !== null", 8000);
  await snap(H, '93-achievement-toast-pc');
  record('★★★ B 업적 토스트 — 첫 정답 → "🏅 업적 — 첫 정답" · 채팅 한 줄', got && (await H.evaluate("(document.querySelector('.ach-toast')?.innerText ?? '').includes('첫 정답')")) && (await H.evaluate("(document.querySelector('.chat-log')?.innerText ?? '').includes('🏅')")));
  await H.close?.();
}
// =============================================================================
// ★★★ R056 — 문제 평가(설문) · 작은 수정 넷 (UICHECK_R056=1 · SHOT_DIR=r056)
//   R056_BEFORE=1 이면 옛 빌드로 "전" 그림만(골라 하기 가로 스크롤 · 이모티콘 "없어요")
// =============================================================================
/** 골라 하기 창 — 가로로 넘치나(창 scrollWidth > clientWidth) · 가장 넓은 칸 */
const PICK_OVER = "JSON.stringify((() => { const p = document.querySelector('.mg-cat'); if (!p) return null; const items = [...p.querySelectorAll('.mg-cat-card')]; const w = Math.max(...items.map((i) => Math.round(i.scrollWidth))); return { pop: Math.round(p.clientWidth), scroll: Math.round(p.scrollWidth), over: p.scrollWidth - p.clientWidth, widest: w, white: items[0] ? getComputedStyle(items[0]).whiteSpace : null }; })())";
/** "없어요" 줄 수 · 너비 */
const NONE_LINES = "JSON.stringify((() => { const el = [...document.querySelectorAll('.emoji-grid p')].find((p) => p.textContent.trim() === '없어요'); if (!el) return null; const r = document.createRange(); r.selectNodeContents(el); const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top))); return { lines: tops.size, w: Math.round(el.getBoundingClientRect().width) }; })())";
async function r056PickerEmoji(H, tag) {
  // 골라 하기 — PC · m390
  for (const [w, h, nm, touch] of [[1280, 720, 'pc', false], [390, 844, 'm390', true]]) {
    if (touch) await touchDevice(H, w, h);
    else {
      await touchDevice(H, w, h, false);
      await H.setViewport(w, h);
    }
    await H.evaluate("window.dispatchEvent(new Event('resize'))");
    await sleep(500);
    if (!(await H.evaluate("document.querySelector('.mg-cat') !== null"))) await realClick(H, '#minigame-pick-btn');
    await H.waitFor("document.querySelector('.mg-cat') !== null", 5000);
    await sleep(300);
    const m = JSON.parse(await H.evaluate(PICK_OVER));
    await snap(H, `94-${tag}-picker-${nm}`);
    record(`★★ ${tag === 'before' ? '(전) ' : ''}E-a 골라 하기 ${nm} 가로 스크롤 ${tag === 'before' ? '있음(재현)' : '0'}`, tag === 'before' ? !!m && m.over > 0 : !!m && m.over <= 0, JSON.stringify(m));
    await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(300);
    if (await H.evaluate("document.querySelector('.mg-cat') !== null")) await realClick(H, '#minigame-pick-btn');
    await sleep(200);
    // 이모티콘 찾기 결과 없음
    await realClick(H, '.emoji-btn');
    await H.waitFor("document.querySelector('.emoji-search') !== null", 5000);
    await realType(H, '.emoji-search', 'zzqqxx');
    await sleep(300);
    const n = JSON.parse(await H.evaluate(NONE_LINES));
    await snap(H, `95-${tag}-emoji-none-${nm}`);
    record(`★★ ${tag === 'before' ? '(전) ' : ''}E-b 이모티콘 "없어요" ${nm} ${tag === 'before' ? '격자 칸 하나에 갇힘(재현)' : '한 줄 · 격자 한 줄 전체'}`, tag === 'before' ? !!n && (n.lines > 1 || n.w <= 40) : !!n && n.lines === 1 && n.w > 40, JSON.stringify(n));
    await realClick(H, '.emoji-pop .popup-close');
    await sleep(200);
  }
  await touchDevice(H, 1280, 720, false);
  await H.setViewport(1280, 720);
  await H.evaluate("window.dispatchEvent(new Event('resize'))");
  await sleep(400);
}
/** 목록 안(줄어든 스크롤 칸) 요소는 먼저 보이게 한 뒤 누른다 */
const clickInView = async (P, sel) => {
  await P.evaluate(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'nearest', inline: 'nearest' })`);
  await sleep(150);
  return realClick(P, sel);
};
const FOOT = "JSON.stringify([...document.querySelectorAll('.reveal-foot, .reveal-foot > *, .reveal-main, .ceremony')].map((e) => (e.className.split(' ')[0]) + ':' + Math.round(e.getBoundingClientRect().height * 10) / 10))";
const pressKey = async (P, key, code, vk) => {
  await P.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
  await P.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
};
const tapOn = async (P, sel) => {
  // ★ 가로 스크롤 안에 숨은 칩은 먼저 보이게(사람도 밀어서 누른다)
  await P.evaluate(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await sleep(150);
  const r = await rectOf(P, sel);
  if (!r) return false;
  await trustedTap(P, r.x + r.w / 2, r.y + r.h / 2);
  await sleep(250);
  return true;
};
async function r056Flow(browser) {
  // ★ 정답 공개는 실제 8초로 돌린다(묶음 env RESOLVED_WAIT_MS=8000 — 미니게임 모드 기본 1.5초면 누를 틈이 없다)
  const H = await newPage(browser, 'F-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'fh', '평가방장');
  const roomId = await createRoom(H, 'R056 평가');
  if (process.env.R056_BEFORE) {
    await r056PickerEmoji(H, 'before');
    await H.close?.();
    return;
  }
  const G = await newPage(browser, 'F-guest', true);
  await touchDevice(G, 390, 844);
  await signUp(G, 'fg', '평가손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  // ★ R058 (A80) — PC 로 들어와 👍/👎 를 하나도 안 누르는 사람(결과 목록 기본 접힘을 본다)
  const Q = await newPage(browser, 'F-quiet', true);
  await Q.setViewport(1280, 720);
  await signUp(Q, 'fq', '평가조용');
  await Q.goto(`${BASE}/r/${roomId}`);
  await Q.waitFor("document.querySelector('.stage') !== null", 10000);
  // ── E (a)(b) — 후
  await r056PickerEmoji(H, 'after');
  // ── B ★ R099 — 정답 공개에 평가 줄 없음(찬종 "평가 버튼 그냥 빼자 · 평가는 나만 · 제보로") · 카드 높이 = 진행 안내만
  await setQuestionCount(H, 3);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.question-card .q-text') !== null", 30000);
  await answerCurrent(H, H);
  await H.waitFor("document.querySelector('.reveal') !== null", 8000);
  await G.waitFor("document.querySelector('.reveal') !== null", 4000);
  await sleep(500);
  const noFb = JSON.parse(await H.evaluate("JSON.stringify({ fb: document.querySelectorAll('.reveal-fb, .fb-vote, [data-rate-ask], [data-song-rate]').length, foot: document.querySelector('.reveal-foot')?.children.length ?? -1 })"));
  const gNoFb = await G.evaluate("document.querySelectorAll('.reveal-fb, .fb-vote, [data-rate-ask]').length");
  await snap(G, '96-reveal-nofb-m390');
  await snap(H, '96-reveal-nofb-pc');
  record('★★★ B R099 정답 공개 — 평가 줄(👍 😐 👎 · 사유 칩) 없음(방장 PC · 손님 m390) · 아래 줄 = 진행 안내 하나', noFb.fb === 0 && gNoFb === 0 && noFb.foot === 1, JSON.stringify({ noFb, gNoFb }));
  const hLogin = `${ACCOUNT_PREFIX}_fh`;
  const gLogin = `${ACCOUNT_PREFIX}_fg`;
  // 나머지 두 문제
  for (let i = 2; i <= 3; i += 1) {
    await H.waitFor("document.querySelector('.question-card .q-text') !== null && document.querySelector('.reveal') === null", 20000);
    await sleep(300);
    await answerCurrent(H, H);
    await H.waitFor("document.querySelector('.reveal') !== null", 8000);
  }
  // ── C 결과 화면 — "이번 판 문제"(접힌 채 시작 · 펼치면 줄마다 제보 📝 · 평가 버튼 없음)
  await Q.waitFor("document.querySelector('.fb-result') !== null", 30000);
  await H.waitFor("document.querySelector('.fb-result') !== null", 10000);
  await sleep(700);
  const RES = "JSON.stringify({ def: document.querySelector('.fb-result')?.dataset.fbDefault ?? null, open: document.querySelector('.fb-result')?.classList.contains('open'), head: document.querySelector('.fb-result-head')?.innerText ?? '', list: document.querySelector('.fb-list') !== null, doc: document.documentElement.scrollHeight <= innerHeight + 1 })";
  const q0 = JSON.parse(await Q.evaluate(RES));
  await snap(Q, '103-result-fb-pc-closed');
  record('★★★ C 결과 — "이번 판 문제 · 3문제" 접힌 채 시작 · 한 화면', q0.def === 'closed' && !q0.open && !q0.list && /이번 판 문제/.test(q0.head) && /3문제/.test(q0.head) && !/평가/.test(q0.head) && q0.doc, JSON.stringify(q0));
  await realClick(Q, '.fb-result-head');
  await Q.waitFor("document.querySelector('.fb-list')?.dataset.loaded === '1'", 4000);
  await sleep(300);
  const q1 = JSON.parse(await Q.evaluate("JSON.stringify({ rows: document.querySelectorAll('.fb-row').length, report: document.querySelectorAll('.fb-row .qreport-btn, .fb-row [data-qreport]').length, votes: document.querySelectorAll('.fb-vote, .fb-comment, .fb-chip, [data-rate-note]').length, noCopy: [...document.querySelectorAll('.fb-text')].every((e) => e.classList.contains('no-copy')), doc: document.documentElement.scrollHeight <= innerHeight + 1 })"));
  await snap(Q, '103-result-fb-pc-opened');
  record('★★★ C 펼친 목록 — 3문제 · 줄마다 제보 버튼 · 평가 버튼 · 사유 · 의견 · "+1P" 안내 0 · 질문 복사 막기 · 한 화면', q1.rows === 3 && q1.report === 3 && q1.votes === 0 && q1.noCopy && q1.doc, JSON.stringify(q1));
  await realClick(Q, '.fb-result-head');
  await sleep(200);
  record('★ C 다시 누르면 접힘', await Q.evaluate("!document.querySelector('.fb-result')?.classList.contains('open')"));
  await Q.close?.();
  if (!(await G.evaluate("document.querySelector('.fb-result.open') !== null"))) await tapOn(G, '.fb-result-head');
  await G.waitFor("document.querySelector('.fb-list')?.dataset.loaded === '1'", 6000).catch(() => false);
  await sleep(300);
  const gDoc = JSON.parse(await G.evaluate("JSON.stringify({ doc: document.documentElement.scrollWidth, vw: innerWidth, rows: document.querySelectorAll('.fb-row').length })"));
  await snap(G, '97-result-fb-m390');
  record('★★ C m390 결과 목록 — 3문제 · 가로 넘침 없음', gDoc.rows === 3 && gDoc.doc <= gDoc.vw, JSON.stringify(gDoc));
  await H.evaluate("document.documentElement.dataset.theme = 'night'");
  if (!(await H.evaluate("document.querySelector('.fb-result.open') !== null"))) await realClick(H, '.fb-result-head');
  await sleep(450);
  await snap(H, '97-result-fb-pc-night');
  await H.evaluate("document.documentElement.dataset.theme = 'pastel'");
  // ── C 로비 링크 "지난 판 문제"
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '로비로')?.click()");
  await H.waitFor("document.querySelector('#feedback-last-btn') !== null", 10000);
  record('★★ C 로비 "지난 판 문제" 링크(평가 글 없음)', await H.evaluate("/지난 판 문제/.test(document.querySelector('#feedback-last-btn')?.innerText ?? '') && !/평가/.test(document.querySelector('#feedback-last-btn').innerText)"));
  await realClick(H, '#feedback-last-btn');
  await H.waitFor("document.querySelector('.fb-modal .fb-list')?.dataset.loaded === '1'", 6000);
  await sleep(300);
  await snap(H, '98-lobby-fb-pc');
  const pop = JSON.parse(await H.evaluate("JSON.stringify({ rows: document.querySelectorAll('.fb-modal .fb-row').length, votes: document.querySelectorAll('.fb-modal .fb-vote, .fb-modal .fb-comment').length })"));
  record('★★ C 팝업 목록 = 결과 화면과 같은 3문제 · 평가 버튼 없음', pop.rows === 3 && pop.votes === 0, JSON.stringify(pop));
  const fbRows = await withPg(async (c) => (await c.query(`SELECT count(*)::int n FROM question_feedback f JOIN accounts a ON a.id = f.account_id WHERE a.login_id = $1`, [hLogin])).rows[0].n);
  record('★ C 평가 표 새 행 0', fbRows === 0, String(fbRows));
  await pressKey(H, 'Escape', 'Escape', 27);
  await sleep(300);
  record('★ C 팝업 Esc 로 닫힘', await H.evaluate("document.querySelector('.fb-modal') === null"));
  // ── E (c)(d) 프사 확대 · 업적
  const sharp = (await import('sharp')).default;
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ffb347"/><circle cx="128" cy="110" r="60" fill="#8a6bff"/><rect x="58" y="180" width="140" height="50" rx="25" fill="#18b26b"/></svg>');
  const png = await sharp(svg).png().toBuffer();
  await G.waitFor("document.querySelector('.lobby-card') !== null", 10000);
  const up = await G.evaluate(`fetch('/api/avatar', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: Uint8Array.from(atob('${png.toString('base64')}'), (c) => c.charCodeAt(0)), credentials: 'same-origin' }).then((r) => r.status)`);
  const gId = await withPg(async (c) => String((await c.query(`SELECT id FROM accounts WHERE login_id = $1`, [gLogin])).rows[0].id));
  const seatAv = `.seat-card img[data-person="${gId}"]`;
  await H.waitFor(`document.querySelector('${seatAv}') !== null`, 6000);
  await realClick(H, seatAv);
  await H.waitFor("document.querySelector('.person-card .person-photo') !== null", 4000);
  await H.waitFor("document.querySelector('.person-ach')?.dataset.loaded === '1'", 4000);
  await sleep(500);
  const ph = JSON.parse(await H.evaluate("JSON.stringify({ w: Math.round(document.querySelector('.person-photo')?.getBoundingClientRect().width ?? 0), nat: document.querySelector('.person-photo')?.naturalWidth, kick: document.querySelector('.confirm, .confirm-modal') !== null })"));
  await snap(H, '99-avatar-zoom-pc');
  record('★★★ E-c 참여자 칸 아바타 → 사진 크게(원본 256 → 화면 300px 이상) · 강퇴 창은 안 뜸', up === 200 && ph.w >= 300 && ph.nat === 256 && !ph.kick, `${up} · ${JSON.stringify(ph)}`);
  await realClick(H, '.person-all-btn');
  await H.waitFor("document.querySelector('.ach-all-modal .ach-list')?.dataset.loaded === '1'", 5000);
  await sleep(300);
  const all = JSON.parse(await H.evaluate("JSON.stringify({ n: document.querySelectorAll('.ach-all .ach').length, on: document.querySelectorAll('.ach-all .ach.on').length })"));
  const dbG = await withPg(async (c) => (await c.query(`SELECT count(*)::int n FROM achievements a JOIN accounts x ON x.id = a.account_id WHERE x.login_id = $1`, [gLogin])).rows[0].n);
  await snap(H, '99-ach-all-pc');
  record('★★★ E-d 다른 사람 전체 업적 — 모든 업적 · 깬 것 = 표', all.n >= 20 && all.on === dbG, `${JSON.stringify(all)} · DB ${dbG}`);
  await pressKey(H, 'Escape', 'Escape', 27);
  await sleep(300);
  // 채팅 줄 아바타
  await H.setInput('.chat-input-row > input', '안녕'); // ★ R057 뒤 — 채팅 줄 첫 input 은 이모티콘 찾기 칸일 수 있다
  await H.click('전송');
  await G.waitFor("document.querySelector('.chat-line [data-person]') !== null", 4000);
  // ★ R058 — 셋째 참가자로 채팅이 길어져 첫 줄은 가려질 수 있다 → 마지막 채팅 줄("안녕")을 누른다
  await G.evaluate("[...document.querySelectorAll('.chat-line')].at(-1)?.setAttribute('data-uic-last', '1')");
  await tapOn(G, '.chat-line[data-uic-last] [data-person]');
  const chatCard = await G.waitFor("document.querySelector('.person-card') !== null", 3000);
  const letter = await G.evaluate("document.querySelector('.person-card .person-letter') !== null && document.querySelector('.person-card .person-photo') === null");
  await G.waitFor("document.querySelector('.person-ach')?.dataset.loaded === '1'", 4000);
  await sleep(300);
  await snap(G, '99-person-letter-m390');
  record('★★ E-c 채팅 줄 아바타 → 카드 · 글자 아바타는 확대 안 함(m390)', chatCard && letter);
  await tapOn(G, '.person-all-btn');
  await G.waitFor("document.querySelector('.ach-all-modal .ach-list')?.dataset.loaded === '1'", 5000);
  await G.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(450);
  const gw = JSON.parse(await G.evaluate("JSON.stringify({ doc: document.documentElement.scrollWidth, vw: innerWidth, cols: getComputedStyle(document.querySelector('.ach-all')).gridTemplateColumns.split(' ').length })"));
  await snap(G, '99-ach-all-m390-night');
  record('★★ E-d 전체 업적 m390 — 세로 목록(1열) · 가로 넘침 없음', gw.cols === 1 && gw.doc <= gw.vw, JSON.stringify(gw));
  await G.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await pressKey(G, 'Escape', 'Escape', 27);
  await sleep(300);
  // 👥 창 아바타(모바일)
  await tapOn(G, '#people-btn');
  await G.waitFor(`document.querySelector('.people-list [data-person="${gId}"]') !== null`, 4000);
  await tapOn(G, `.people-list [data-person="${gId}"]`);
  const peopleCard = await G.waitFor("document.querySelector('.person-card .person-photo') !== null", 3000);
  await sleep(400);
  await snap(G, '99-avatar-zoom-m390');
  const gph = Math.round(Number(await G.evaluate("document.querySelector('.person-photo')?.getBoundingClientRect().width ?? 0")));
  record('★★ E-c 👥 창 아바타 → 사진 크게(m390 거의 전체 폭)', peopleCard && gph >= 300, `${gph}px`);
  await pressKey(G, 'Escape', 'Escape', 27);
  // 내 프로필 → 전체 업적
  await realClick(H, '#rename-btn');
  await H.waitFor("document.querySelector('.ach-all-open') !== null", 4000);
  await realClick(H, '.ach-all-open');
  const mine = await H.waitFor("document.querySelector('.ach-all-modal .ach-list')?.dataset.loaded === '1'", 5000);
  record('★★ E-d 내 프로필 → 전체 업적 창', mine);
  await pressKey(H, 'Escape', 'Escape', 27);
  await G.close?.();
  await H.close?.();
}
async function r054Flow(browser) {
  if (!process.env.MG_SKIP_LAB) await r054Lab(browser);
  if (process.env.MG_SKIP_LIVE) return;
  for (const k of R054_GAMES) {
    await closeAllTabs(browser);
    await r054Live(browser, k);
  }
}

/** ★ R053 ⓪ — 열린 탭을 모두 닫는다(묶음 사이 · 탭 ≤3 유지) */
async function closeAllTabs(browser) {
  const { targetInfos } = await browser.send('Target.getTargets');
  for (const t of targetInfos.filter((x) => x.type === 'page')) await browser.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
  await sleep(300);
}

// =============================================================================
// ★★★ R057 — 미니게임만 모드 · 이모티콘 나열(인라인) (UICHECK_R057=1 · SHOT_DIR=r057 · MINIGAME_PHASE_SCALE 0.3)
// =============================================================================
const shiftClick = async (P, sel) => {
  const r = await rectOf(P, sel);
  if (!r) return false;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await P.send('Input.dispatchMouseEvent', { type, x: r.x + r.w / 2, y: r.y + r.h / 2, button: 'left', clickCount: 1, modifiers: 8 });
  }
  await sleep(250);
  return true;
};
const longPress = async (P, sel, ms = 700) => {
  await P.evaluate(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' })`);
  await sleep(150);
  const r = await rectOf(P, sel);
  if (!r) return false;
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  await P.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(ms);
  await P.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
  return true;
};
/** ★ 채팅 입력창 — 줄 안의 첫 input 은 이모티콘 찾기 칸이다(고르기 창이 앞에 있다) */
const CHAT_IN = '.chat-input-row > input';
const inputVal = (P) => P.evaluate(`document.querySelector('${CHAT_IN}')?.value ?? null`);
async function r057Flow(browser) {
  const H = await newPage(browser, 'M-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'mh', '미니방장');
  const roomId = await createRoom(H, 'R057 미니게임만');
  const G = await newPage(browser, 'M-guest', true);
  await touchDevice(G, 390, 844);
  await signUp(G, 'mg', '미니손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);

  // ── A 설정 — 방식 미니게임만 · 2개 · 연타만
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  // ★ R063 — 칩 나열 → 고르기 창
  const tapOnly = await selectMinigames(H, ['tap']);
  await sleep(300);
  const st = JSON.parse(await H.evaluate("JSON.stringify({ count: document.querySelector('.settings .count-input:not(.mg-rounds-input)') !== null, rounds: document.querySelector('.mg-rounds-input')?.value, n: document.querySelector('[data-mg-catalog-open] .mono')?.innerText ?? '', tier: document.querySelector('.settings [data-level]') !== null })"));
  st.on = tapOnly.split(',');
  record('★★★ A 설정 — 미니게임만이면 문제 수 · 난이도 · 분야 숨김 · 미니게임 수 · 고르기만', !st.count && !st.tier && st.rounds === '2' && st.on.join() === 'tap', JSON.stringify(st));
  await G.waitFor("[...document.querySelectorAll('.settings .chip')].some((c) => c.innerText.trim() === '미니게임만')", 4000);
  const gst = JSON.parse(await G.evaluate("JSON.stringify({ mode: [...document.querySelectorAll('.settings .chip')].some((c) => c.innerText.trim() === '미니게임만'), rounds: document.querySelector('.settings .set-value')?.innerText, doc: document.documentElement.scrollWidth, vw: innerWidth })"));
  record('★★ A 손님(m390) — 읽기 전용 "미니게임만 · 2개" · 가로 넘침 없음', gst.mode && /2개/.test(gst.rounds ?? '') && gst.doc <= gst.vw, JSON.stringify(gst));
  await snap(H, '100-settings-mgonly-pc');
  await snap(G, '100-settings-mgonly-m390');
  // ── A 진행
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.mg-series') !== null", 20000);
  const intro1 = await H.evaluate("JSON.stringify({ series: document.querySelector('.mg-series')?.dataset.series, intro: document.querySelector('.mg-intro')?.innerText ?? null })");
  await snap(H, '101-mgonly-intro-pc');
  record('★★★ A 첫 미니게임 — 깜짝 연출 "미니게임만 — 2개 이어서!" · 1/2', /1\/2/.test(intro1) && /미니게임만/.test(intro1), intro1);
  await H.waitFor("document.querySelector('.mg-series')?.dataset.series === '2/2'", 60000);
  await sleep(150);
  const second = await H.evaluate("JSON.stringify({ intro: document.querySelector('.mg-intro') !== null, rules: document.querySelector('.mg-rules') !== null })");
  await snap(H, '101-mgonly-second-pc');
  await snap(G, '101-mgonly-second-m390');
  record('★★ A 둘째 미니게임 — 연출 없이 규칙 안내부터 · 2/2', /"intro":false/.test(second), second);
  await H.waitFor("document.querySelector('.mg-result-sub') !== null", 60000);
  await G.waitFor("document.querySelector('.mg-result-sub') !== null", 10000);
  await sleep(600);
  const rs = JSON.parse(await H.evaluate("JSON.stringify({ rows: document.querySelectorAll('.ranking li').length, fb: document.querySelector('.fb-result') !== null, sub: document.querySelector('.mg-result-sub')?.innerText })"));
  record('★★★ A 결과 — 미니게임 순위 점수 합 · 문제 평가 없음', rs.rows === 2 && !rs.fb && /2개/.test(rs.sub ?? ''), JSON.stringify(rs));
  await snap(H, '102-mgonly-result-pc');
  await snap(G, '102-mgonly-result-m390');
  await H.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(450);
  await snap(H, '102-mgonly-result-pc-night');
  await H.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '로비로')?.click()");
  await H.waitFor("document.querySelector('button[data-mode=\"minigame\"]')?.getAttribute('aria-pressed') === 'true'", 10000);
  record('★★ A 로비로 — 미니게임만 설정 그대로', true);

  // ── B 이모티콘 나열 — 손님에게 특별 하나(테스트 행) · 다시 읽기
  const gLogin = `${ACCOUNT_PREFIX}_mg`;
  const sp = await withPg(async (c) => {
    const id = (await c.query(`SELECT id FROM emojis WHERE theme_id IS NOT NULL AND active ORDER BY id LIMIT 1`)).rows[0]?.id;
    if (id) await c.query(`INSERT INTO account_emojis (account_id, emoji_id) SELECT id, $2 FROM accounts WHERE login_id = $1 ON CONFLICT DO NOTHING`, [gLogin, id]);
    return id;
  });
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.chat-card') !== null", 10000);
  await sleep(800);
  // PC — 고르기 창 · 토글
  await realClick(H, '.emoji-btn');
  await H.waitFor("document.querySelector('.emoji-mode') !== null", 4000);
  await sleep(300);
  const modeDefault = await H.evaluate("document.querySelector('[data-emoji-mode=\"send\"]')?.getAttribute('aria-pressed')");
  await snap(H, '103-emoji-mode-send-pc');
  record('★★ B 고르기 창 맨 위 [바로 보내기 · 입력창에 넣기] — 기본 바로 보내기', modeDefault === 'true', modeDefault);
  // Shift+클릭 = 넣기(토글과 무관)
  await shiftClick(H, '.emoji-grid .emoji-cell:nth-child(1)');
  const afterShift = await inputVal(H);
  record('★★★ B PC Shift+클릭 → 입력창에 넣기(보내지 않음)', typeof afterShift === 'string' && afterShift.length > 0, afterShift);
  await realClick(H, '[data-emoji-mode="insert"]');
  for (const n of [2, 3]) await realClick(H, `.emoji-grid .emoji-cell:nth-child(${n})`);
  const three = await inputVal(H);
  await snap(H, '103-emoji-mode-insert-pc');
  record('★★ B 입력창에 넣기 — 셋이 입력창에(커서 자리)', [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(three ?? '')].length === 3, three);
  await pressKey(H, 'Escape', 'Escape', 27);
  await sleep(200);
  // 끝에 글자를 덧붙인다(realType 은 전체를 덮어쓴다)
  await H.evaluate(`(() => { const el = document.querySelector('${CHAT_IN}'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); })()`);
  await H.send('Input.insertText', { text: ' 대박' });
  await sleep(200);
  await H.click('전송');
  await sleep(500);
  // 이모티콘만 2개(반응 꼴) · 5개(인라인)
  const hostPrefs = await H.evaluate("fetch('/api/auth/prefs', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => j.prefs?.emojiInsert ?? null)");
  record('★ B 토글은 계정에 저장(prefs.emojiInsert)', hostPrefs === true, String(hostPrefs));
  await H.setInput(CHAT_IN, '😂👍');
  await H.click('전송');
  await sleep(400);
  await H.setInput(CHAT_IN, '😂😂😂😂😂');
  await H.click('전송');
  await sleep(600);
  // 모바일 — 특별 탭에서 ★ R073 (D-317) 길게 눌러 집어 채팅 입력창에 놓기 → :sp: 토큰 · 미리 보기(옛 "길게 누르기 = 넣기" 는 집어 올리기로 바뀜)
  await tapOn(G, '.emoji-btn');
  await G.waitFor("document.querySelector('.emoji-mode') !== null", 4000);
  await tapOn(G, '.emoji-tab[title="특별"]');
  await sleep(300);
  await dragTo(G, '.emoji-grid .emoji-cell.special', '[data-chat-input]', { touch: true });
  const gv = await inputVal(G);
  const stillOpen = await G.evaluate("document.querySelector('.emoji-pop') !== null");
  record('★★★ B 모바일 길게 집어 입력창에 놓기 → 입력창에 :sp: 토큰(보내지 않음 · 창은 열린 채)', /:sp:\d+:/.test(gv ?? '') && stillOpen, `${gv} · ${stillOpen}`);
  await tapOn(G, '.emoji-pop .popup-close');
  await sleep(200);
  await G.setInput(CHAT_IN, `${gv}안녕 ㅋㅋ`);
  await sleep(300);
  const prev = await G.evaluate("JSON.stringify({ shown: document.querySelector('.chat-preview') !== null, img: document.querySelectorAll('.chat-preview img').length })");
  await snap(G, '104-emoji-preview-m390');
  record('★★ B 특별 토큰이 든 글 — 입력창 위 미리 보기(그림)', /"shown":true,"img":1/.test(prev), prev);
  await tapOn(G, '.send-btn');
  await sleep(700);
  const log = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('.chat-line')].slice(-4).map((l) => ({ inline: l.querySelectorAll('.chat-inline-emoji').length, special: l.querySelectorAll('.chat-inline-special').length, big: l.querySelectorAll('.chat-emoji').length, text: l.querySelector('.chat-text')?.innerText ?? '' })))"));
  record('★★★ B 채팅 — 글 섞인 줄(인라인 3) · 이모티콘만 2(반응 꼴) · 5개(인라인 5) · 특별 토큰 줄(32px 1)', log.length === 4 && log[0].inline === 3 && log[1].big === 2 && log[2].inline === 5 && log[3].special === 1, JSON.stringify(log));
  const seat = await H.evaluate("document.querySelectorAll('.seat-emoji-pop img').length");
  await snap(H, '105-inline-chat-pc');
  await snap(G, '105-inline-chat-m390');
  await G.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(450);
  await snap(G, '105-inline-chat-m390-night');
  await G.evaluate("document.documentElement.dataset.theme = 'pastel'");
  // ★ R066 (D-275 · 찬종 #37) — 채팅으로 보낸 이모티콘(입력창에 넣기)은 참여자 칸에 뜨지 않는다
  record('★★ B 채팅으로 보낸 이모티콘은 참여자 칸에 안 뜬다(R066)', seat === 0, String(seat));
  const gw = JSON.parse(await G.evaluate("JSON.stringify({ doc: document.documentElement.scrollWidth, vw: innerWidth })"));
  record('★★ B m390 가로 넘침 없음', gw.doc <= gw.vw, JSON.stringify(gw));
  await withPg((c) => c.query(`DELETE FROM account_emojis WHERE account_id IN (SELECT id FROM accounts WHERE login_id = $1)`, [gLogin]));
  void sp;
  await G.close?.();
  await H.close?.();
}
// ★★★ R060 — 어젯밤 버그 넷 그림 (UICHECK_R060=1 · 묶음 r060 · docs/design/r060)
//   (가) 미니게임만 사이 문구 · (나) 긴 단위 줄바꿈 · (다) 이모티콘 바로 보내기 뒤 창 닫힘 · (라) 공동 1위
async function r060Flow(browser) {
  const L = await newPage(browser, 'R060-lab', true); // ★ R097 — 따로 맥락(앞 가입 쿠키면 인증 화면 없음)
  await L.setViewport(1280, 720);
  await signUp(L, 'r6', '둘이서점검');
  const lab = async (qs, dev, phase) => {
    const [w, h, touch] = { pc: [1280, 720, false], m390: [390, 844, true], fold: [344, 882, true] }[dev];
    if (touch) await touchDevice(L, w, h);
    else {
      await touchDevice(L, w, h, false);
      await L.setViewport(w, h);
    }
    await L.goto(`${BASE}/lab/minigame?scene=1&seed=2024&${qs}`);
    await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${phase}'`, 6000);
    await sleep(450);
  };
  // ── (가) 미니게임만 사이 문구
  for (const [series, want, tag] of [['1/3', '다음 미니게임으로!', 'next'], ['3/3', '결과로!', 'last'], ['', '퀴즈로 돌아갑니다!', 'quiz']]) {
    for (const dev of ['pc', 'm390']) {
      await lab(`key=tap&phase=outro${series ? `&series=${series}` : ''}`, dev, 'outro');
      const t = await L.evaluate("document.querySelector('.mg-outro-line')?.innerText.trim() ?? ''");
      if (dev === 'pc') record(`★★★ (가) 사이 문구 — ${series ? `미니게임만 ${series}` : '퀴즈 판'} → "${want}"`, t === want, t);
      if (tag !== 'quiz') await snap(L, `110-outro-${tag}-${dev}`);
    }
  }
  // ── (나) 긴 단위 — 숫자 · 단위가 한 줄(인라인 조각이 하나)
  for (const [unit, value, tag] of [['광년', 41300000, 'lightyear'], ['킬로미터', 12742, 'km'], ['만 원', 3800, 'manwon']]) {
    for (const dev of ['m390', 'fold']) {
      await lab(`key=estimate&phase=roundResult&unit=${encodeURIComponent(unit)}&value=${value}`, dev, 'roundResult');
      const ans = JSON.parse(await L.evaluate("JSON.stringify((() => { const n = document.querySelector('.quiz-answer .nowrap'); const rg = document.createRange(); if (n) rg.selectNodeContents(n); const lines = n ? new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size : -1; return { rects: lines, text: n?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth }; })())"));
      record(`★★★ (나) ${unit} 정답(${dev}) — 숫자 · 단위 한 줄 · 가로 넘침 없음`, ans.rects === 1 && ans.text.includes(unit) && ans.over <= 1, JSON.stringify(ans));
      if (tag === 'lightyear') await snap(L, `111-unit-${tag}-reveal-${dev}`);
      await lab(`key=estimate&phase=play&unit=${encodeURIComponent(unit)}`, dev, 'play');
      const ask = JSON.parse(await L.evaluate("JSON.stringify((() => { const n0 = document.querySelector('.quiz-ask .nowrap'); const rg = document.createRange(); if (n0) rg.selectNodeContents(n0); const n = n0 ? { getClientRects: () => ({ length: new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size }) } : null; const u = document.querySelector('.quiz-num-unit'); const lh = u ? parseFloat(getComputedStyle(u).lineHeight) || parseFloat(getComputedStyle(u).fontSize) * 1.5 : 0; return { ask: n ? n.getClientRects().length : -1, unitH: u ? Math.round(u.getBoundingClientRect().height) : -1, lh: Math.round(lh) }; })())"));
      record(`★★ (나) ${unit} 놀이 화면(${dev}) — "단위:" · 입력칸 옆 단위 한 줄`, ask.ask === 1 && ask.unitH > 0 && ask.unitH <= ask.lh + 2, JSON.stringify(ask));
      if (tag === 'lightyear') await snap(L, `111-unit-${tag}-play-${dev}`);
    }
  }
  // ── (라) 공동 1위
  for (const dev of ['pc', 'm390', 'fold']) {
    await lab('key=tap&phase=final&tie=1', dev, 'final');
    const f = JSON.parse(await L.evaluate("JSON.stringify({ ranks: [...document.querySelectorAll('.mg-final .mg-rank')].map((e) => e.innerText.trim()), oneLine: [...document.querySelectorAll('.mg-final .mg-rank')].every((e) => e.getClientRects().length === 1 && e.getBoundingClientRect().height < 40), over: document.documentElement.scrollWidth - innerWidth })"));
    record(`★★★ (라) 최종 — "공동 1위" 둘 · 다음은 3위(${dev}) · 한 줄 · 넘침 없음`, f.ranks.join(',') === '공동 1위,공동 1위,3위,4위' && f.oneLine && f.over <= 1, JSON.stringify(f));
    await snap(L, `113-final-tie-${dev}`);
  }
  await touchDevice(L, 1280, 720, false);
  await L.close?.();

  // ── (다) 이모티콘 — 바로 보내기면 창이 닫힌다 · 넣기는 열린 채 · 특별(큰 반응)이 창에 가리지 않는다
  const H = await newPage(browser, 'R060-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r6h', '이모방장');
  const roomId = await createRoom(H, 'R060 이모티콘');
  const G = await newPage(browser, 'R060-guest', true);
  await touchDevice(G, 390, 844);
  await signUp(G, 'r6g', '이모손님');
  const gLogin = `${ACCOUNT_PREFIX}_r6g`;
  await withPg(async (c) => {
    const id = (await c.query(`SELECT id FROM emojis WHERE theme_id IS NOT NULL AND active ORDER BY id LIMIT 1`)).rows[0]?.id;
    if (id) await c.query(`INSERT INTO account_emojis (account_id, emoji_id) SELECT id, $2 FROM accounts WHERE login_id = $1 ON CONFLICT DO NOTHING`, [gLogin, id]);
  });
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.chat-card') !== null", 10000);
  await sleep(800);
  // PC 바로 보내기
  await realClick(H, '.emoji-btn');
  await H.waitFor("document.querySelector('.emoji-pop') !== null", 4000);
  await sleep(250);
  await realClick(H, '.emoji-grid .emoji-cell:nth-child(1)');
  await sleep(250);
  const pc = JSON.parse(await H.evaluate("JSON.stringify({ open: document.querySelector('.emoji-pop') !== null, flash: document.querySelector('.emoji-flash') !== null })"));
  record('★★★ (다) PC 바로 보내기 → 고르기 창 닫힘 · 보냈다 표시', !pc.open && pc.flash, JSON.stringify(pc));
  await snap(H, '112-emoji-sent-pc');
  // PC 넣기 모드 — 창은 열린 채(여러 개)
  await realClick(H, '.emoji-btn');
  await H.waitFor("document.querySelector('.emoji-pop') !== null", 4000);
  await realClick(H, '[data-emoji-mode="insert"]');
  await realClick(H, '.emoji-grid .emoji-cell:nth-child(2)');
  await sleep(250);
  record('★★ (다) 입력창에 넣기 모드 — 창은 열린 채', await H.evaluate("document.querySelector('.emoji-pop') !== null"));
  await realClick(H, '[data-emoji-mode="send"]');
  await pressKey(H, 'Escape', 'Escape', 27);
  // 모바일 — 특별 이모티콘 바로 보내기 → 창 닫힘 · 큰 반응 층이 보인다
  await tapOn(G, '.emoji-btn');
  await G.waitFor("document.querySelector('.emoji-mode') !== null", 4000);
  await tapOn(G, '.emoji-tab[title="특별"]');
  await sleep(300);
  await tapOn(G, '.emoji-grid .emoji-cell.special');
  await G.waitFor("document.querySelector('.special-layer .special-float') !== null", 4000).catch(() => undefined);
  await sleep(200);
  const mob = JSON.parse(await G.evaluate("JSON.stringify((() => { const layer = document.querySelector('.special-layer'); const f = document.querySelector('.special-float-pic'); let top = null; if (f) { const r = f.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); top = el ? (el.closest('.special-float') ? 'float' : el.closest('.emoji-pop') ? 'pop' : el.className || el.tagName) : null; } return { open: document.querySelector('.emoji-pop') !== null, layer: layer !== null, z: layer ? getComputedStyle(layer).zIndex : null, top }; })())"));
  record('★★★ (다) 모바일 특별 바로 보내기 → 창 닫힘 · 보낸 사람 화면에 큰 반응이 보인다', !mob.open && mob.layer, JSON.stringify(mob));
  await snap(G, '112-emoji-special-sent-m390');
  const gw = JSON.parse(await G.evaluate("JSON.stringify({ doc: document.documentElement.scrollWidth, vw: innerWidth })"));
  record('★ (다) m390 가로 넘침 없음', gw.doc <= gw.vw, JSON.stringify(gw));
  await withPg((c) => c.query(`DELETE FROM account_emojis WHERE account_id IN (SELECT id FROM accounts WHERE login_id = $1)`, [gLogin]));
  void roomId;
  await G.close?.();
  await H.close?.();
}
// ★★★ R066 §A — 결과 화면 잘림(#25 #27 · 찬종 캡처 2560×1313 미니게임만 10판 3명): 채팅이 길면 결과 카드가 줄고 채팅 카드에 깔린다
//   (UICHECK_R066=1 · R066_ONLY=result 면 이것만 · 묶음 r066 · docs/design/r066)
async function socketGuests(roomId, n, tag) {
  const { io: ioc } = await import('socket.io-client');
  const socks = [];
  for (let i = 0; i < n; i += 1) {
    const loginId = `${ACCOUNT_PREFIX}_${tag}${i}`.toLowerCase();
    const body = JSON.stringify({ loginId, password: 'uic1234', nickname: `${tag}손님${i}` });
    let res = await fetch(`${BASE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (res.status !== 200) res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password: 'uic1234' }) });
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('qw_session=')) ?? '';
    const s = ioc(BASE, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    await new Promise((r) => s.once('connect', r));
    s.emit('room.join', { roomId });
    await new Promise((r) => s.once('room.state', r));
    socks.push(s);
  }
  return socks;
}
/** 채팅 n 줄 — 손님들이 돌아가며(채팅 도배 5초 5회 안에서) */
async function chatLines(socks, n) {
  for (let i = 0; i < n; i += 1) {
    socks[i % socks.length].emit('chat.send', { text: `채팅 ${i + 1}줄 ㅋㅋ`, epoch: null });
    await sleep(Math.ceil(1100 / socks.length));
  }
  await sleep(600);
}
/** 결과 카드 — 3위 줄 · 다시 하기 · 로비로가 화면 안 + 그 자리를 누르면 그 요소(덮임 없음) · 순위는 다 보이거나 목록 안 스크롤 */
const RESULT_FULL = `JSON.stringify((() => {
  const card = document.querySelector('.result-card');
  if (!card) return { card: false };
  const hit = (el) => { if (!el) return false; const b = el.getBoundingClientRect(); if (b.width === 0 || b.top < 0 || b.bottom > innerHeight + 1) return false; const t = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)); return !!t && (el === t || el.contains(t)); };
  const btn = (t) => [...card.querySelectorAll('.next-row button')].find((b) => b.innerText.trim().endsWith(t));
  const ranks = [...card.querySelectorAll('.ranking li')];
  const list = card.querySelector('.ranking');
  const r = card.getBoundingClientRect();
  const chat = document.querySelector('.chat-card')?.getBoundingClientRect();
  return { card: true, n: ranks.length, third: hit(ranks[2]), again: hit(btn('다시 하기')), lobby: hit(btn('로비로')),
    allRanks: ranks.every(hit), listScroll: list ? list.scrollHeight > list.clientHeight + 1 && getComputedStyle(list).overflowY !== 'visible' : false,
    cardH: Math.round(r.height), cardBottom: Math.round(r.bottom), chatTop: chat ? Math.round(chat.top) : null, chatH: chat ? Math.round(chat.height) : null, vh: innerHeight };
})())`;
const R066_PC = [{ w: 2560, h: 1313 }, { w: 1536, h: 864 }, { w: 1280, h: 720 }];
// ★★★ R067 — 고기 굽기 새로(상태 다섯 · 세 크기) · 타자 연습칸 · 기준 날짜 · ⚙ 탭 셋
const R067_MEAT = "JSON.stringify((() => { const c = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: Math.round((r.left + r.right) / 2), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null; }; const lab = document.querySelector('.cake-stage [data-meat-label]'); const cnt = document.querySelector('.cake-count'); return { count: c('.cake-count'), meat: c('.cake-stage .meat-art'), label: c('.cake-stage [data-meat-label]'), help: c('.cake-help'), text: lab?.innerText ?? '', n: cnt?.dataset.cakeCount, hidden: cnt?.dataset.hidden, op: cnt ? getComputedStyle(cnt).opacity : null, color: cnt ? getComputedStyle(cnt).color : null, dots: document.querySelectorAll('.cake-beats, .cake-dot').length }; })())";
async function r067CakeFlow(L) {
  const states = [
    ['count', 'at=2300'],
    ['hidden', 'at=7500'],
    ['pressed-perfect', 'at=11000&pressed=0.1'],
    ['pressed-raw', 'at=6000&pressed=-3'],
    ['timeout', 'at=14500'],
  ];
  const all = {};
  for (const [dev, w, h, touch] of [['1536', 1536, 864, false], ['2560', 2560, 1313, false], ['m390', 390, 844, true]]) {
    await touchDevice(L, w, h, touch);
    if (!touch) await L.setViewport(w, h);
    const rows = {};
    for (const [nm, q] of states) {
      await L.goto(`${BASE}/lab/minigame?scene=1&key=cake&phase=play&${q}`);
      await L.waitFor("document.querySelector('.cake-stage') !== null", 8000).catch(() => false);
      await sleep(nm === 'hidden' ? 900 : 400);
      rows[nm] = JSON.parse(await L.evaluate(R067_MEAT));
      await snap(L, `200-cake-${nm}-${dev}`);
    }
    all[dev] = rows;
    const v = Object.values(rows);
    const meatTop = new Set(v.map((r) => r.meat?.top));
    const labelTop = new Set(v.map((r) => r.label?.top));
    const helpTop = new Set(v.map((r) => r.help?.top));
    record(`★★★ R067 A 고기 ${dev} — 다섯 상태 모두 고기 · 문구 자리 같음(위치 차 0) · 문구 = 고기 가운데 · 초 칸 가운데`, meatTop.size === 1 && labelTop.size === 1 && helpTop.size === 1 && v.every((r) => r.meat && r.label && r.count && Math.abs(r.label.x - r.meat.x) <= 3 && Math.abs(r.count.x - r.meat.x) <= 3), JSON.stringify(rows));
  }
  const r = all['1536'];
  record('★★ R067 A 고기 — 정수 초만 · 가린 뒤 투명(자리 그대로) · 결과 문구(딱 좋게 · 생고기 · 새까맣게 탐) · 박자 점 없음',
    /^\d+$/.test(r.count.n) && Number(r.count.n) <= 10 && r.count.hidden === '0' && r.hidden.hidden === '1' && Number(r.hidden.op) < 0.05 && r.hidden.count.top === r.count.count.top && /딱 좋게/.test(r['pressed-perfect'].text) && /생고기/.test(r['pressed-raw'].text) && /새까맣게/.test(r.timeout.text) && v067NoDots(all),
    JSON.stringify({ count: r.count, hidden: r.hidden }));
  record('★★ R067 A 고기 — 초 글자색이 검정 아님(강조색 쪽)', !/^rgb\(0, 0, 0\)|^rgb\(2[0-9], 2[0-9], 3[0-9]\)/.test(r.count.color ?? 'rgb(0, 0, 0)'), r.count.color);
}
/** ★ R067 B — 타자 연습 입력칸: 준비 단계에 입력칸 · 자동 포커스 · 친 글은 판 시작에 비워지고 같은 칸에 포커스가 남는다 */
async function r067TypingFlow(browser) {
  for (const [dev, w, h, touch] of [['pc', 1536, 864, false], ['m390', 390, 844, true]]) {
    const H = await newPage(browser, `U-typ-${dev}`, true);
    await H.setViewport(1536, 864);
    await signUp(H, `ut${dev}`.slice(0, 6), `타자${dev}`);
    await createRoom(H, 'R067 타자');
    if (touch) {
      await touchDevice(H, w, h);
      await H.evaluate("window.dispatchEvent(new Event('resize'))");
      await sleep(400);
    } else await H.setViewport(w, h);
    await r051Start(H, 'typing');
    const ready = await waitPhase(H, 'ready', 20000);
    await sleep(400);
    const r1 = JSON.parse(await H.evaluate("JSON.stringify((() => { const el = document.querySelector('[data-typing-input]'); if (el) el.__r067 = 1; return { has: !!el, practice: document.querySelector('[data-typing-practice]')?.dataset.typingPractice, focused: !!el && document.activeElement === el, ph: el?.placeholder ?? '', target: !!document.querySelector('.typing-target'), lang: document.querySelector('[data-typing-lang]')?.innerText ?? '' }; })())"));
    await H.send('Input.insertText', { text: 'abc' });
    await sleep(250);
    const r2 = JSON.parse(await H.evaluate("JSON.stringify({ v: document.querySelector('[data-typing-input]')?.value ?? null, warn: !!document.querySelector('[data-typing-lang-warn]') })"));
    await snap(H, `210-typing-practice-${dev}`);
    const play = await waitPhase(H, 'play', 15000);
    await sleep(300);
    const r3 = JSON.parse(await H.evaluate("JSON.stringify((() => { const el = document.querySelector('[data-typing-input]'); return { v: el?.value ?? null, same: !!el && el.__r067 === 1, focused: !!el && document.activeElement === el, target: !!document.querySelector('.typing-target') }; })())"));
    await snap(H, `211-typing-play-${dev}`);
    const ko = /한글/.test(r1.lang);
    record(`★★★ R067 B 타자 연습칸 ${dev} — 준비 단계 입력칸 · 자동 포커스 · "여기서 미리 쳐 보세요" · 문장은 아직 없음`, ready && r1.has && r1.practice === '1' && r1.focused && /미리 쳐/.test(r1.ph) && !r1.target, JSON.stringify(r1));
    record(`★★ R067 B 타자 연습칸 ${dev} — 친 글이 남고 · 틀린 언어면 빨간 안내(한글 판에 영문)`, r2.v === 'abc' && r2.warn === ko, JSON.stringify({ ...r2, ko }));
    record(`★★★ R067 B 타자 연습칸 ${dev} — 판 시작에 비워지고 같은 칸에 포커스 그대로`, play && r3.v === '' && r3.same && r3.focused && r3.target, JSON.stringify(r3));
    H.close();
  }
}
/** ★ R067 C — 소리 기록: 미니게임이 시작될 때 배경음악이 바로 미니게임 곡으로 바뀌나(연습 1판 · 미니게임만 첫 판 · 퀴즈 판 첫 미니게임) */
const R067_SOUND = (since) => `JSON.stringify((window.__qwSoundLog ?? []).filter((e) => e.t >= ${since} && /^(music|bgm):/.test(e.id)).map((e) => ({ t: e.t - ${since}, id: e.id, state: e.state })))`;
async function r067BgmAt(H, label) {
  // 시작 직전 기준 시각 · intro 가 보인 뒤 1초까지의 음악 기록
  const t0 = await H.evaluate('Math.round(performance.now())');
  const seen = await H.waitFor("document.querySelector('.mg-card') !== null", 240000).catch(() => false);
  const tIntro = await H.evaluate('Math.round(performance.now())');
  const phase = await H.evaluate("document.querySelector('.mg-card')?.dataset.phase ?? ''");
  await sleep(1000);
  const log = JSON.parse(await H.evaluate(R067_SOUND(t0)));
  const audio = await H.evaluate('document.documentElement.dataset.audio ?? "none"');
  const tail = JSON.parse(await H.evaluate("JSON.stringify((window.__qwSoundLog ?? []).filter((e) => /^(music|bgm):/.test(e.id)).slice(-6).map((e) => e.id + '@' + e.t))"));
  const row = { label, seen, phase, introAt: tIntro - t0, audio, log, tail };
  r067BgmFlow.rows.push(row);
  const first = log.find((e) => e.id === 'bgm:minigame');
  record(`★★★ R067 C BGM ${label} — 미니게임 화면이 뜬 뒤 1초 안에 bgm:minigame(실제로 튼다)`, seen && !!first && first.t <= tIntro - t0 + 1000, JSON.stringify(row));
}
async function r067BgmFlow(browser) {
  r067BgmFlow.rows = [];
  // ① 연습 1판(로비)
  const H = await newPage(browser, 'U-bgm', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'ubg', '소리방장');
  await createRoom(H, 'R067 소리');
  await realClick(H, '.stage');
  await sleep(1500);
  await realClick(H, '#minigame-pick-btn');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 3000);
  const startP = r067BgmAt(H, '① 연습 1판');
  await pickCard(H, 'tap');
  await startP;
  await H.waitFor("document.querySelector('.mg-card') === null", 240000).catch(() => false);
  await sleep(1500);
  // ② 미니게임만 첫 판
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(300);
  await selectMinigames(H, ['tap', 'typing']);
  await sleep(300);
  const p2 = r067BgmAt(H, '② 미니게임만 첫 판');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await p2;
  H.close();
  // ③ 퀴즈 판 첫 미니게임(5문제 → 3번 뒤) — 방장이 문제를 넘겨 빨리
  const Q = await newPage(browser, 'U-bgm3', true);
  await Q.setViewport(1536, 864);
  await signUp(Q, 'ubq', '소리퀴즈');
  await createRoom(Q, 'R067 소리 퀴즈');
  await realClick(Q, '.stage');
  await setQuestionCount(Q, 5);
  await Q.evaluate("(() => { const c = document.querySelector('.mg-check input'); if (c && !c.checked) c.click(); })()");
  await sleep(500);
  await selectMinigames(Q, ['tap']);
  await sleep(300);
  const p3 = r067BgmAt(Q, '③ 퀴즈 판 첫 미니게임');
  await Q.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  for (let i = 0; i < 3; i += 1) {
    const ok = await Q.waitFor("[...document.querySelectorAll('.host-tools button')].some((b) => b.innerText.includes('방장'))", 60000).catch(() => false);
    if (!ok) break;
    await sleep(400);
    await Q.evaluate("[...document.querySelectorAll('.host-tools button')].find((b) => b.innerText.includes('방장'))?.click()");
    await sleep(400);
    await Q.evaluate("[...document.querySelectorAll('button')].filter((b) => !b.classList.contains('skip-btn') && b.innerText.trim() === '넘기기').pop()?.click()");
    await Q.waitFor("![...document.querySelectorAll('.host-tools button')].some((b) => b.innerText.includes('방장'))", 20000).catch(() => false);
  }
  await p3;
  Q.close();
  writeFileSync(path.join(ROOT, 'docs', 'design', 'r067', 'bgm-log.json'), JSON.stringify(r067BgmFlow.rows, null, 1));
}
/** ★ R067 D — 기준 날짜: 얼마게요 · 빅맥 실제 판(미니게임만 · 손님 하나) — 준비 · 판 · 정답 공개 내내 머리줄 끝 같은 자리 */
const R067_ASOF = "JSON.stringify((() => { const el = document.querySelector('.mg-head [data-asof]'); const r = el?.getBoundingClientRect(); const head = document.querySelector('.mg-head')?.getBoundingClientRect(); return { phase: document.querySelector('.mg-card')?.dataset.phase ?? '', text: el?.innerText ?? '', asOf: el?.dataset.asof ?? '', fx: el?.dataset.fxAsof ?? '', right: r && head ? Math.round(head.right - r.right) : null, lines: el ? el.getClientRects().length : 0 }; })())";
async function r067AsofFlow(browser) {
  for (const key of ['price', 'worldprice']) {
    const H = await newPage(browser, `U-asof-${key}`, true);
    await H.setViewport(1536, 864);
    await signUp(H, `ua${key.slice(0, 3)}`, `기준${key.slice(0, 3)}`);
    const roomId = await createRoom(H, `R067 기준 ${key}`);
    const socks = await socketGuests(roomId, 1, `as${key.slice(0, 2)}`);
    await sleep(600);
    await realClick(H, 'button[data-mode="minigame"]');
    await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
    await H.setInput('.mg-rounds-input', '2');
    await sleep(300);
    await selectMinigames(H, [key]);
    await sleep(300);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
    const rows = {};
    for (const ph of ['ready', 'play', 'roundResult']) {
      const ok = await waitPhase(H, ph, 90000).catch(() => false);
      await sleep(ph === 'play' ? 600 : 300);
      rows[ph] = ok ? JSON.parse(await H.evaluate(R067_ASOF)) : null;
      if (ph !== 'ready') await snap(H, `220-asof-${key}-${ph}`);
      if (ph === 'play') {
        await touchDevice(H, 390, 844);
        await H.evaluate("window.dispatchEvent(new Event('resize'))");
        await sleep(500);
        rows.m390 = JSON.parse(await H.evaluate(R067_ASOF));
        await snap(H, `220-asof-${key}-play-m390`);
        await touchDevice(H, 1536, 864, false);
        await H.setViewport(1536, 864);
        await H.evaluate("window.dispatchEvent(new Event('resize'))");
      }
    }
    const v = ['ready', 'play', 'roundResult'].map((k) => rows[k]);
    const want = key === 'price' ? /^기준 \d{4}-\d{2}-\d{2}$/ : /^가격 기준 \d{2}-\d{2} · 환율 \d{2}-\d{2}$/;
    record(`★★★ R067 D 기준 날짜 ${key} — 준비 · 판 · 정답 공개 내내 머리줄 끝("${key === 'price' ? '기준 YYYY-MM-DD' : '가격 기준 MM-DD · 환율 MM-DD'}") · 같은 글 · 한 줄`,
      v.every((r) => r && want.test(r.text) && r.lines === 1 && r.right !== null && r.right <= 24) && new Set(v.map((r) => r.text)).size === 1 && rows.m390?.lines === 1,
      JSON.stringify(rows));
    for (const so of socks) so.close();
    H.close();
  }
}
/** ★ R067 E — 위 막대 7 → 5 · ⚙ 탭 셋(설정 · 안내 · 제보) · Alt+B = ⚙ 제보 탭 · 모바일 ☰ 그대로 */
const R067_TOPBAR = "JSON.stringify([...document.querySelectorAll('.room-tools button')].filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0 && !b.closest('[role=dialog]')).map((b) => (b.getAttribute('aria-label') || b.innerText.trim()).slice(0, 12)))";
const altB = async (P) => {
  await P.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'b', code: 'KeyB', windowsVirtualKeyCode: 66, modifiers: 1 });
  await P.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'b', code: 'KeyB', windowsVirtualKeyCode: 66, modifiers: 1 });
  await sleep(300);
};
async function r067GearFlow(browser) {
  const H = await newPage(browser, 'U-gear', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'ugr', '톱니방장');
  await createRoom(H, 'R067 톱니');
  // 빨간 점은 포인트가 있을 때만(검사 계정은 0) — 검사 DB 에 가입 선물 한 줄 → 다시 열기 → 끝에 지움
  const gid = await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE nickname = $1`, ['톱니방장'])).rows[0]?.id ?? null);
  if (gid) await withPg((c) => c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, 50, 'signup', '가입 선물')`, [gid]));
  await H.goto(await H.evaluate('location.href'));
  await H.waitFor("document.querySelector('.room-tools') !== null", 8000).catch(() => false);
  await H.waitFor("document.querySelector('[data-signup-gift]') !== null", 4000).catch(() => false);
  // 가입 선물 창은 [닫기]로만 닫는다(포인트샵을 열면 점이 꺼진다)
  await H.evaluate("[...document.querySelectorAll('[data-signup-gift] button')].find((b) => b.innerText.trim() === '닫기')?.click()");
  await H.waitFor("document.querySelector('[data-signup-gift]') === null", 3000).catch(() => false);
  await sleep(500);
  const bar = JSON.parse(await H.evaluate(R067_TOPBAR));
  const dot = await H.waitFor("!!document.querySelector('.room-tools [data-shop-dot]')?.offsetParent", 8000).catch(() => false);
  await snap(H, '230-topbar-1536');
  // ★ 프로필(✏)은 대기실(LOBBY)에만 있는 버튼 — 브리핑의 일곱(게임 중 캡처)에 없다 → 빼고 센다
  const core = bar.filter((b) => b !== '프로필');
  const bal = await H.evaluate("fetch('/api/shop').then((r) => r.json()).then((j) => j.balance).catch(() => -1)");
  const flag = await H.evaluate("localStorage.getItem('qw.flag.shopOpened')");
  record('★★★ R067 E 위 막대 PC — 버튼 다섯(초대 · 친구 · 포인트샵 · ⚙ · 나가기 — 대기실은 프로필 더) · 포인트샵 빨간 점 그대로', core.length === 5 && dot, JSON.stringify({ bar, dot, gid, bal, flag }));
  // ⚙ — 설정 탭부터 · 안내 · 제보
  await realClick(H, '[data-gear-btn]');
  await H.waitFor("document.querySelector('[data-gear-pop]') !== null", 3000).catch(() => false);
  const t0 = await H.evaluate("document.querySelector('[data-gear-pop]')?.dataset.gearPop ?? ''");
  const hasTheme = await H.evaluate("!!document.querySelector('[data-gear-pop] .prefs-title')");
  await snap(H, '231-gear-settings-1536');
  await realClick(H, '[data-gear-tab="info"]');
  await sleep(250);
  const info = await H.evaluate("!!document.querySelector('[data-gear-pop=\"info\"] .info-tabs')");
  const infoBox = JSON.parse(await H.evaluate("JSON.stringify((() => { const r = document.querySelector('[data-gear-pop]')?.getBoundingClientRect(); return r ? { l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) } : null; })())"));
  await snap(H, '232-gear-info-1536');
  await realClick(H, '[data-gear-tab="report"]');
  await sleep(250);
  const rep = await H.evaluate("document.querySelectorAll('[data-gear-pop=\"report\"] [data-report-pick]').length");
  await snap(H, '233-gear-report-1536');
  await H.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(200);
  await snap(H, '233-gear-report-1536-night');
  await H.evaluate("document.documentElement.dataset.theme = 'pastel'");
  record('★★★ R067 E ⚙ 창 — 설정 탭부터 · 안내 탭(안내 넷) · 제보 탭(두 갈래) · 화면 안', t0 === 'settings' && hasTheme && info && rep === 2 && infoBox && infoBox.l >= 0 && infoBox.r <= 1536 && infoBox.b <= 864, JSON.stringify({ t0, hasTheme, info, rep, infoBox }));
  // 제보 탭 → "문제 · 미니게임 제보" = 제보 창 목록 단계(⚙ 는 닫힘)
  await realClick(H, '[data-gear-report] [data-report-pick="recent"]');
  const list = await H.waitFor("document.querySelector('[data-report-list]') !== null", 3000).catch(() => false);
  const gearClosed = await H.evaluate("document.querySelector('[data-gear-pop]') === null");
  record('★★ R067 E ⚙ 제보 탭 → 제보 창(목록 단계) · ⚙ 는 닫힘', list && gearClosed, JSON.stringify({ list, gearClosed }));
  await pressKey(H, 'Escape', 'Escape', 27);
  await sleep(300);
  // Alt+B — ⚙ 제보 탭 · 다시 누르면 닫힘
  await realClickAt(H, 1400, 600);
  await altB(H);
  const b1 = await H.evaluate("document.querySelector('[data-gear-pop]')?.dataset.gearPop ?? ''");
  await altB(H);
  const b2 = await H.evaluate("document.querySelector('[data-gear-pop]') === null && document.querySelector('.report-modal') === null");
  record('★★★ R067 E Alt+B — PC 방 안은 ⚙ 의 제보 탭 · 다시 누르면 닫힘', b1 === 'report' && b2, JSON.stringify({ b1, b2 }));
  await snap(H, '230-topbar-1536');
  await H.setViewport(2560, 1313);
  await sleep(300);
  const bar2560 = JSON.parse(await H.evaluate(R067_TOPBAR));
  await openGearTab(H, 'info');
  await snap(H, '232-gear-info-2560');
  await closeTop(H);
  // 모바일 ☰ 그대로 · Alt+B 는 옛 제보 창
  await touchDevice(H, 390, 844);
  await H.evaluate("window.dispatchEvent(new Event('resize'))");
  await sleep(500);
  const mBar = JSON.parse(await H.evaluate(R067_TOPBAR));
  await tapOn(H, '#menu-btn');
  const menu = await H.waitFor("document.querySelector('[data-menu-report]') !== null", 3000).catch(() => false);
  const menuItems = await H.evaluate("[...document.querySelectorAll('.menu-list button')].map((b) => b.innerText.trim()).filter(Boolean).join(' | ')");
  await snap(H, '234-menu-m390');
  await pressKey(H, 'Escape', 'Escape', 27);
  await sleep(200);
  await altB(H);
  const mAlt = await H.evaluate("document.querySelector('[data-report-menu]') !== null");
  if (gid) await withPg((c) => c.query(`DELETE FROM point_grants WHERE account_id = $1 AND reason = 'signup'`, [gid]));
  record('★★ R067 E 모바일 — ☰ 그대로(제보 · 설정 · 안내 메뉴) · Alt+B 는 제보 창', menu && /안내/.test(menuItems) && /설정/.test(menuItems) && mAlt && bar2560.filter((b) => b !== '프로필').length === 5, JSON.stringify({ mBar, menuItems, mAlt, bar2560 }));
  H.close();
}
function v067NoDots(all) {
  return Object.values(all).every((rows) => Object.values(rows).every((x) => x.dots === 0));
}
async function r067Flow(browser) {
  const L = await newPage(browser, 'U-lab', true);
  await L.setViewport(1536, 864);
  await signUp(L, 'ul', '실험실');
  if (!process.env.R067_ONLY || process.env.R067_ONLY === 'cake') await r067CakeFlow(L);
  if (!process.env.R067_ONLY || process.env.R067_ONLY === 'typing') await r067TypingFlow(browser);
  if (!process.env.R067_ONLY || process.env.R067_ONLY === 'bgm') await r067BgmFlow(browser);
  if (!process.env.R067_ONLY || process.env.R067_ONLY === 'asof') await r067AsofFlow(browser);
  if (!process.env.R067_ONLY || process.env.R067_ONLY === 'gear') await r067GearFlow(browser);
  await touchDevice(L, 1536, 864, false);
  await L.setViewport(1536, 864);
}

// =============================================================================
// ★★★ R068 — 찬종 제보 20 · 정답 공개 평가 3단계 · photoyear · 긴 질문(QLEN 240) 검사
//   R068_ONLY = lab | room | game | avatar (없으면 전부)
//   lab   고기 가림 뒤 소리 0(#55) · 풍선 펌프 · 결과 가운데 + 점수 규칙(#54) · photoyear 그림(310) · 미니게임 사진 잘림 없음(330)
//   room  ⚙ 제보 탭(#65) · 미니게임 고르기 정렬(#69) · 난이도 끄기(#56) · 업적 설명(#52) · 이모티콘 찾기 포커스(340) · ✎ 정렬(#57) · 2560 특별 둘째 줄(#65)
//   game  긴 질문 140 · 197 · 240 × 360 · 1536 · 2560(320 · #61) · 정답 공개 평가(300) · 세레모니 이모티콘 셋(#66) · 결과 접힘(#68) · 지난 판 평가 m360(#53)
//   avatar 프로필 사진 올리기(#71) — jpg 56KB · 큰 jpg · png · webp · 회전 jpg
// =============================================================================
const R068_DEVS = [['1536', 1536, 864, false], ['2560', 2560, 1313, false], ['m390', 390, 844, true]];
async function r068Flow(browser) {
  const only = process.env.R068_ONLY ?? '';
  if (!only || only === 'lab') await r068LabFlow(browser);
  if (!only || only === 'room') await r068RoomFlow(browser);
  if (!only || only === 'avatar') await r068AvatarFlow(browser);
  if (!only || only === 'game') await r068GameFlow(browser);
}

// ── lab ─────────────────────────────────────────────────────────────────────
async function r068LabFlow(browser) {
  const L = await newPage(browser, 'R068-lab', true);
  await L.setViewport(1536, 864);
  await signUp(L, 'rl', '실험실');
  // #55 고기 — 가린 뒤 소리 0
  await L.goto(`${BASE}/lab/minigame?scene=1&key=cake&phase=play&at=2300`);
  await L.waitFor("document.querySelector('.cake-stage') !== null", 8000).catch(() => false);
  await trustedClick(L, 20, 860);
  await L.waitFor("document.documentElement.dataset.audio === 'running'", 4000).catch(() => false);
  await L.goto(`${BASE}/lab/minigame?scene=1&key=cake&phase=play&at=2300`);
  await L.waitFor("document.querySelector('.cake-stage') !== null", 8000).catch(() => false);
  await trustedClick(L, 20, 860);
  const tStart = await L.evaluate('Math.round(performance.now())');
  await L.waitFor("document.querySelector('.cake-count')?.dataset.hidden === '1'", 9000).catch(() => false);
  const tHide = await L.evaluate('Math.round(performance.now())');
  await sleep(4500);
  const ticks = JSON.parse(await L.evaluate(`JSON.stringify((window.__qwSoundLog ?? []).filter((e) => /^cake-t/.test(e.id) && e.t >= ${tStart}).map((e) => ({ t: Math.round(e.t - ${tHide}), played: e.played })))`));
  const before = ticks.filter((x) => x.t < 0 && x.played).length;
  const after = ticks.filter((x) => x.t > 150 && x.played).length;
  record('★★★ R068 #55 고기 — 가린 뒤 똑딱 0(가리기 전에는 울림) · 찬종 "가리면 소리도 끊는다"', before > 0 && after === 0, JSON.stringify({ before, after, audio: await L.evaluate("document.documentElement.dataset.audio ?? ''"), ticks: ticks.slice(-6) }));

  // #54 풍선 — 펌프 줄 · 결과 풍선 가운데 · 점수 규칙 한 줄
  const mid = (sel) => `(() => { const r = document.querySelector('${sel}')?.getBoundingClientRect(); const c = document.querySelector('.mg-card')?.getBoundingClientRect(); return r && c ? Math.round((r.left + r.right) / 2 - (c.left + c.right) / 2) : null; })()`;
  const bal = {};
  for (const [dev, w, h, touch] of R068_DEVS) {
    await touchDevice(L, w, h, touch);
    if (!touch) await L.setViewport(w, h);
    await L.goto(`${BASE}/lab/minigame?scene=1&key=balloon&phase=play&at=4000`);
    await L.waitFor("document.querySelector('.balloon-stage') !== null", 8000).catch(() => false);
    await sleep(400);
    const play = JSON.parse(await L.evaluate(`JSON.stringify({ art: ${mid('.balloon-box .balloon-art')}, pump: ${mid('.balloon-actions')}, pct: ${mid('.balloon-pct')}, help: document.querySelector('.balloon-stage .quiz-num-help')?.innerText ?? '', label: (() => { const b = document.querySelector('[data-balloon-pump]'); if (!b) return null; const rg = document.createRange(); rg.selectNodeContents(b.firstChild); const t = rg.getBoundingClientRect(); const r = b.getBoundingClientRect(); return Math.round((t.left + t.right) / 2 - (r.left + r.right) / 2 + (b.querySelector('kbd') ? (b.querySelector('kbd').getBoundingClientRect().width + 6) / 2 : 0)); })() })`));
    await snap(L, `350-balloon-play-${dev}`);
    await L.goto(`${BASE}/lab/minigame?scene=1&key=balloon&phase=roundResult`);
    await L.waitFor("document.querySelector('.balloon-result') !== null", 8000).catch(() => false);
    await sleep(400);
    const res = JSON.parse(await L.evaluate(`JSON.stringify({ art: ${mid('.balloon-result .balloon-art')}, big: ${mid('.balloon-result .mg-r051-big')}, rule: document.querySelector('[data-balloon-rule]')?.innerText ?? '' })`));
    await snap(L, `351-balloon-result-${dev}`);
    bal[dev] = { play, res };
  }
  await touchDevice(L, 1536, 864, false);
  await L.setViewport(1536, 864);
  const ok54 = Object.values(bal).every((b) => [b.play.art, b.play.pump, b.play.pct, b.play.label, b.res.art, b.res.big].every((x) => x !== null && Math.abs(x) <= 3) && /6/.test(b.play.help) && /16/.test(b.play.help) && /6/.test(b.res.rule));
  record('★★ R068 #54 풍선 — 그림 · 펌프 줄 · [펌프] 글(버튼 안) · 숫자 · 결과 풍선이 가운데(±3px) · 점수 규칙 "한 번에 6~16" 이 판 · 결과에 한 줄(1536 · 2560 · m390)', ok54, JSON.stringify(bal));

  // photoyear 그림 — play · reveal(판 결과) · result(최종) × 1536 · m390
  const pyImg = await withPg(async (c) => (await c.query(`SELECT image_ids[1] AS id FROM minigame_items WHERE game = 'photoyear' AND active ORDER BY item_id LIMIT 1`)).rows[0]?.id ?? null);
  const py = {};
  for (const [dev, w, h, touch] of [R068_DEVS[0], R068_DEVS[2]]) {
    await touchDevice(L, w, h, touch);
    if (!touch) await L.setViewport(w, h);
    for (const [nm, phase] of [['play', 'play'], ['reveal', 'roundResult'], ['result', 'final']]) {
      await L.goto(`${BASE}/lab/minigame?scene=1&key=photoyear&phase=${phase}${pyImg ? `&image=${pyImg}` : ''}`);
      await L.waitFor("document.querySelector('.mg-card') !== null", 8000).catch(() => false);
      await sleep(900);
      py[`${nm}-${dev}`] = JSON.parse(await L.evaluate("JSON.stringify({ input: document.querySelector('.photoyear-stage .quiz-num-input')?.getAttribute('inputmode') ?? null, max: document.querySelector('.photoyear-stage .quiz-num-input')?.maxLength ?? null, img: !!document.querySelector('.photo-frame img.quiz-img, .photoyear-reveal img.quiz-img'), fit: getComputedStyle(document.querySelector('.photo-frame img, .photoyear-reveal img') ?? document.body).objectFit, answer: document.querySelector('[data-photoyear-answer]')?.innerText ?? '', scrollX: document.documentElement.scrollWidth > innerWidth + 1 })"));
      await snap(L, `310-photoyear-${nm}-${dev}`);
    }
  }
  await touchDevice(L, 1536, 864, false);
  await L.setViewport(1536, 864);
  record('★★★ R068 photoyear 화면 — 판: 사진(contain) + 숫자 키패드 4자리 · 공개: "1988년" · 가로 넘침 없음(1536 · m390)', py['play-1536']?.input === 'numeric' && py['play-1536']?.max === 4 && py['play-m390']?.img && /1988년/.test(py['reveal-1536']?.answer ?? '') && Object.values(py).every((v) => !v.scrollX && (v.fit === 'contain' || !v.img)), JSON.stringify(py));

  // 미니게임 사진 — 잘라내지 않는다(contain) · 가로 · 세로 사진 각 1 · 판 · 공개
  const imgs = await withPg(async (c) => (await c.query(`
    SELECT i.game, i.item_id, im.image_id, im.width, im.height
      FROM minigame_items i JOIN minigame_images im ON im.image_id = i.image_ids[1]
     WHERE i.active AND i.game IN ('photo', 'price', 'estimate', 'which', 'photoyear')
     ORDER BY i.item_id`)).rows ?? []);
  const fit = {};
  for (const game of ['photo', 'price', 'estimate', 'which', 'photoyear']) {
    const land = imgs.find((x) => x.game === game && x.width > x.height * 1.2);
    const port = imgs.find((x) => x.game === game && x.height > x.width * 1.15);
    for (const [kind, it] of [['land', land], ['port', port]]) {
      if (!it) continue;
      for (const [dev, w, h, touch] of [R068_DEVS[0], R068_DEVS[2]]) {
        await touchDevice(L, w, h, touch);
        if (!touch) await L.setViewport(w, h);
        for (const phase of ['play', 'roundResult']) {
          await L.goto(`${BASE}/lab/minigame?scene=1&key=${game}&phase=${phase}&image=${it.image_id}${game === 'photo' ? '&mode=plain' : ''}`);
          await L.waitFor("document.querySelector('.mg-card img.quiz-img') !== null", 8000).catch(() => false);
          await sleep(700);
          fit[`${game}-${kind}-${dev}-${phase}`] = JSON.parse(await L.evaluate("JSON.stringify([...document.querySelectorAll('.mg-card img.quiz-img')].map((im) => ({ fit: getComputedStyle(im).objectFit, zoom: getComputedStyle(im.closest('.photo-zoom') ?? im).transform })))"));
          if (phase === 'play' || game === 'photo') await snap(L, `330-mgimg-${game}-${kind}-${phase === 'play' ? '' : 'reveal-'}${dev}`);
        }
      }
    }
  }
  await touchDevice(L, 1536, 864, false);
  await L.setViewport(1536, 864);
  const allFit = Object.values(fit).flat();
  record('★★★ R068 사진 규칙 — 미니게임 사진은 모두 contain(잘라내지 않음) · 확대(transform)는 판 진행의 사진 맞히기 확대 모드만(plain · 공개는 없음)', allFit.length > 10 && allFit.every((x) => x.fit === 'contain' && (x.zoom === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(x.zoom))), JSON.stringify(fit).slice(0, 600));
  L.close();
}

/** ★ R068 — 터치 기기 흉내 + 진짜 휴대폰처럼 (hover: none · pointer: coarse) — CDP 터치 흉내만으로는 hover 미디어가 그대로라 눌린 뒤 :hover 가 남는 것을 못 본다 */
async function r068Touch(page, w, h, on = true) {
  await touchDevice(page, w, h, on);
  await page.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] : [] });
}
// ── room ────────────────────────────────────────────────────────────────────
async function r068RoomFlow(browser) {
  const H = await newPage(browser, 'R068-room', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'rr', '방장알파');
  const roomId = await createRoom(H, 'R068 방');
  const socks = await socketGuests(roomId, 1, 'rr');
  await sleep(600);
  const inside = (child, parent) => `(() => { const p = document.querySelector('${parent}')?.getBoundingClientRect(); const els = [...document.querySelectorAll('${child}')]; return p && els.length ? els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1 && r.bottom <= p.bottom + 1; }) : null; })()`;

  // #65 ⚙ 제보 탭 — 버튼이 창 안
  const gear = {};
  for (const [w, h] of [[1536, 864], [2560, 1313], [1280, 720]]) {
    await H.setViewport(w, h);
    await sleep(300);
    await openGearTab(H, 'report');
    gear[w] = await H.evaluate(inside('[data-gear-report] .report-menu-item', '[data-gear-pop]'));
    await snap(H, `352-gear-report-${w}`);
    await H.key('Escape');
    await sleep(200);
  }
  await H.setViewport(1536, 864);
  record('★★★ R068 #65 ⚙ 제보 탭 — 두 버튼이 창 안(넘침 없음 · 1536 · 2560 · 1280)', Object.values(gear).every((v) => v === true), JSON.stringify(gear));

  // #69 미니게임 고르기 — 아이콘 · 체크 세로 가운데 · 체크 24px · 오른쪽 12px
  const cat = {};
  for (const [dev, w, h, touch] of R068_DEVS) {
    await r068Touch(H, w, h, touch);
    if (!touch) await H.setViewport(w, h);
    await H.evaluate("document.querySelector('button[data-mode=\"minigame\"]')?.click()");
    await sleep(300);
    if (touch) await tapOn(H, '[data-mg-catalog-open]');
    else await realClick(H, '[data-mg-catalog-open]');
    await H.waitFor("document.querySelector('.mg-cat') !== null", 4000).catch(() => false);
    await sleep(300);
    cat[dev] = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('.mg-cat-card')].slice(0, 4).map((c) => { const r = c.getBoundingClientRect(); const a = c.querySelector('.mg-cat-art').getBoundingClientRect(); const k = c.querySelector('.mg-cat-check')?.getBoundingClientRect(); const mid = (x) => Math.round((x.top + x.bottom) / 2 - (r.top + r.bottom) / 2); const ico = c.querySelector('.mg-cat-art svg')?.getBoundingClientRect(); return { art: mid(a), check: k ? mid(k) : null, size: k ? Math.round(k.width) : null, right: k ? Math.round(r.right - k.right) : null, ico: ico ? [Math.round((ico.left + ico.right) / 2 - (a.left + a.right) / 2), Math.round((ico.top + ico.bottom) / 2 - (a.top + a.bottom) / 2)] : null }; }))"));
    await snap(H, `353-catalog-${dev}`);
    await H.evaluate("document.querySelector('.mg-cat .popup-close')?.click()");
    await sleep(200);
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  await H.evaluate("document.querySelector('button[data-mode=\"quiz\"]')?.click()");
  await sleep(300);
  record('★★★ R068 #69 고르기 — 아이콘 칸 · 체크 칸이 카드 세로 가운데(±2) · 아이콘이 칸 가운데(±1) · 체크 24px · 오른쪽 12px(1536 · 2560 · m390)', Object.values(cat).every((rows) => rows.length === 4 && rows.every((x) => Math.abs(x.art) <= 2 && Math.abs(x.check) <= 2 && x.size === 24 && Math.abs(x.right - 12) <= 1 && x.ico && Math.abs(x.ico[0]) <= 1 && Math.abs(x.ico[1]) <= 1)), JSON.stringify(cat));

  // #56 (R069 — 난이도는 셋 중 하나가 되어 끄기가 없다 → 같은 꼴인 분야 버튼으로) — PC 클릭 · m390 터치로 끄기 · 마지막 하나는 이유가 보인다
  const tierState = "JSON.stringify([...document.querySelectorAll('button[data-topic]')].map((b) => { const cs = getComputedStyle(b); return { t: b.dataset.topic, on: b.getAttribute('aria-pressed'), bg: cs.backgroundColor, bd: cs.borderTopColor, fg: cs.color }; }))";
  await realClick(H, 'button[data-topic="korea"]');
  await H.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 850 });
  await sleep(500);
  const pc1 = JSON.parse(await H.evaluate(tierState));
  await snap(H, '354-diff-pc');
  await realClick(H, 'button[data-topic="korea"]');
  await sleep(400);
  await r068Touch(H, 390, 844, true);
  await sleep(300);
  await tapOn(H, 'button[data-topic="media"]');
  await sleep(500);
  const m1 = JSON.parse(await H.evaluate(tierState));
  await snap(H, '354-diff-m390-off');
  for (const t of ['korea', 'history', 'science', 'arts', 'sports']) await tapOn(H, `button[data-topic="${t}"]`);
  await sleep(300);
  await tapOn(H, 'button[data-topic="life"]');
  await sleep(150);
  const last = JSON.parse(await H.evaluate("JSON.stringify({ shake: document.querySelector('button[data-topic].shake') !== null, hint: document.querySelector('[data-last-hint]')?.innerText ?? '', on: [...document.querySelectorAll('button[data-topic][aria-pressed=\"true\"]')].map((b) => b.dataset.topic) })"));
  await snap(H, '354-diff-m390-last');
  await H.evaluate("[...document.querySelectorAll('.topic-row button')].find((b) => b.innerText.trim() === '전체')?.click()");
  await sleep(300);
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  const offLooksOff = (rows, t) => { const off = rows.find((r) => r.t === t); const on = rows.find((r) => r.on === 'true'); return off && on && off.on === 'false' && off.bd !== on.bd && off.bg !== on.bg && off.fg !== on.fg; };
  record('★★★ R068 #56 버튼 끄기(분야 — R069 난이도는 라디오) — 누르면 꺼짐(aria · 배경 · 테두리 · 글자색 모두 켜진 것과 다름) · PC 클릭 · m390 터치(눌린 뒤 hover 가 남지 않음)', offLooksOff(pc1, 'korea') && offLooksOff(m1, 'media'), JSON.stringify({ pc1, m1 }));
  record('★★ R068 #56 마지막 하나 끄기(분야) — 흔들림 + "하나는 남겨야" 안내 · 그대로 켜짐', last.shake && /하나/.test(last.hint) && last.on.join(',') === 'life', JSON.stringify(last));

  // #52 업적 설명 — 생략 없이 두 줄까지
  const ach = {};
  for (const [dev, w, h, touch] of [R068_DEVS[0], R068_DEVS[2]]) {
    await r068Touch(H, w, h, touch);
    if (!touch) await H.setViewport(w, h);
    await sleep(300);
    await H.evaluate("document.querySelector('#rename-btn')?.click()");
    await H.waitFor("document.querySelector('.ach-all-open') !== null", 3000).catch(() => false);
    await H.evaluate("document.querySelector('.ach-all-open')?.click()");
    await H.waitFor("document.querySelector('.ach-all .ach-desc') !== null", 5000).catch(() => false);
    await sleep(300);
    ach[dev] = JSON.parse(await H.evaluate("JSON.stringify((() => { const d = [...document.querySelectorAll('.ach-all .ach-desc')]; const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || 16; return { n: d.length, cut: d.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.innerText.slice(0, 12)), maxLines: Math.max(...d.map((e) => Math.round(e.getBoundingClientRect().height / lh(e)))), mg: document.querySelector('.ach-all [data-ach=\"mg-win-1\"] .ach-desc')?.innerText ?? '' }; })())"));
    await snap(H, `355-ach-${dev}`);
    await H.key('Escape');
    await sleep(150);
    await H.key('Escape');
    await sleep(150);
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  record('★★ R068 #52 업적 — 설명 생략(…) 없음 · 두 줄까지 · "미니게임 첫 1위" 설명 전부(1536 · m390)', Object.values(ach).every((a) => a.n > 5 && a.cut.length === 0 && a.maxLines <= 2 && /연습 제외/.test(a.mg)), JSON.stringify(ach));

  // 이모티콘 — 찾기 포커스(340) · ✎ 정렬(#57) · 2560 특별 둘째 줄(#65)
  const hId = await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_rr`])).rows[0]?.id);
  const sp = await withPg(async (c) => (await c.query(`SELECT e.id FROM emojis e JOIN emoji_themes t ON t.id = e.theme_id WHERE e.category = 'special' ORDER BY t.id, e.id LIMIT 24`)).rows.map((r) => Number(r.id)) ?? []);
  if (hId && sp?.length) await withPg((c) => c.query(`INSERT INTO account_emojis (account_id, emoji_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`, [hId, sp]));
  await H.goto(`${BASE}/r/${roomId}`);
  await H.waitFor("document.querySelector('.stage') !== null", 10000).catch(() => false);
  await sleep(600);
  const search = {};
  for (const [dev, w, h, touch] of [R068_DEVS[0], R068_DEVS[2]]) {
    await r068Touch(H, w, h, touch);
    if (!touch) await H.setViewport(w, h);
    await sleep(300);
    if (!(await H.evaluate("document.querySelector('.emoji-pop') !== null"))) await H.evaluate("document.querySelector('.emoji-btn')?.click()");
    await H.waitFor("document.querySelector('.emoji-search') !== null", 3000).catch(() => false);
    const probe = "JSON.stringify((() => { const w = document.querySelector('.emoji-search-wrap'); const i = document.querySelector('.emoji-search'); const wr = w.getBoundingClientRect(); const ir = i.getBoundingClientRect(); const cs = getComputedStyle(i); return { wh: Math.round(wr.height), wb: getComputedStyle(w).borderTopColor, ishadow: cs.boxShadow, ioutline: cs.outlineStyle, inside: ir.top >= wr.top - 0.5 && ir.bottom <= wr.bottom + 0.5, fs: cs.fontSize }; })())";
    await sleep(400); // 창 pop-in(크기 애니메이션 140ms)이 끝난 뒤 잰다
    const idle = JSON.parse(await H.evaluate(probe));
    await snap(H, `340-emoji-search-idle-${dev}`);
    if (touch) await tapOn(H, '.emoji-search');
    else await realClick(H, '.emoji-search');
    await sleep(250);
    const focus = JSON.parse(await H.evaluate(probe));
    await snap(H, `340-emoji-search-focus-${dev}`);
    // ★ R073 (D-317) — ✎ 는 없앴다(없음을 본다)
    const pen = await H.evaluate("document.querySelector('[data-emoji-edit]') === null");
    if (touch) await snap(H, '341-emoji-edit-m390');
    search[dev] = { idle, focus, pen };
    await H.evaluate("document.querySelector('.emoji-pop .popup-close')?.click()");
    await sleep(200);
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  record('★★★ R068 찾기 칸 포커스 — 입력칸 그림자 · 테두리 없음 · 둥근 칸(wrap) 높이 그대로 · 테두리 색만 바뀜 · 모바일 16px(1536 · m390)', Object.values(search).every((s) => s.focus.ishadow === 'none' && s.focus.inside && s.focus.wh === s.idle.wh && s.focus.wb !== s.idle.wb) && search.m390?.focus.fs === '16px', JSON.stringify(search));
  record('★★ R068 #57 ✎ → R073 (D-317) ✎ 없음(끌어서 등록 · 1536 · m390)', Object.values(search).every((s) => s.pen === true), JSON.stringify(Object.fromEntries(Object.entries(search).map(([k, v]) => [k, v.pen]))));
  // #65 2560 · 편집 모드 · 3번 자리 → 특별 탭 둘째 줄 첫 칸
  await H.setViewport(2560, 1313);
  await sleep(300);
  await realClick(H, '.emoji-btn');
  await H.waitFor("document.querySelector('.emoji-pop') !== null", 3000).catch(() => false);
  await realClick(H, '.emoji-tab[title="특별"]');
  await sleep(300);
  const second = JSON.parse(await H.evaluate("JSON.stringify((() => { const cells = [...document.querySelectorAll('.emoji-group-cells .emoji-cell')]; if (cells.length < 2) return null; const top0 = cells[0].getBoundingClientRect().top; const c = cells.find((x) => x.getBoundingClientRect().top > top0 + 10); if (!c) return { rows: 1, n: cells.length }; c.dataset.r068 = '1'; const id = c.querySelector('img')?.getAttribute('src') ?? ''; return { rows: 2, n: cells.length, id }; })())"));
  // ★ R073 (D-317) — 편집 모드 대신 끌어서 3번 자리에(둘째 줄 칸이 진짜 입력에 잡히는지)
  const dr = second?.rows === 2 ? await dragTo(H, '.emoji-cell[data-r068="1"]', '.emoji-slot-cell[data-drop-slot="2"]') : { ok: false };
  const hit = { hit: Boolean(dr.ok && dr.hover?.ghost && dr.hover.slot === '2'), hover: dr.hover };
  await sleep(300);
  const slot3 = await H.evaluate("document.querySelector('.emoji-slot-cell:nth-child(3) .emoji-slot img')?.getAttribute('src') ?? ''");
  await snap(H, '342-emoji-special-row2-2560');
  record('★★★ R068 #65 2560 · (R073 끌기) — 특별 둘째 줄 칸을 끌어 3번 자리에 놓으면 들어간다', hit.hit && second?.id && slot3 === second.id, JSON.stringify({ second, hit, slot3 }));
  await H.key('Escape');
  await H.key('Escape');
  await H.setViewport(1536, 864);
  for (const s of socks) s.close();
  H.close();
}

// ── avatar ──────────────────────────────────────────────────────────────────
async function r068AvatarFlow(browser) {
  const sharp = (await import('sharp')).default;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'r068av-'));
  tempDirs.push(dir); // ★ R100 (D)
  const noise = (w, h) => { const b = Buffer.alloc(w * h * 3); for (let i = 0; i < b.length; i += 1) b[i] = (i * 2654435761) >>> 24; return sharp(b, { raw: { width: w, height: h, channels: 3 } }); };
  const files = {
    'jpg-56k': path.join(dir, 'a.jpg'),
    'jpg-big': path.join(dir, 'big.jpg'),
    png: path.join(dir, 'c.png'),
    webp: path.join(dir, 'd.webp'),
    'jpg-rot': path.join(dir, 'rot.jpg'),
  };
  await noise(420, 320).jpeg({ quality: 70 }).toFile(files['jpg-56k']);
  await noise(4032, 3024).jpeg({ quality: 88 }).toFile(files['jpg-big']);
  await noise(600, 600).png().toFile(files.png);
  await noise(800, 600).webp().toFile(files.webp);
  await noise(640, 480).jpeg().withMetadata({ orientation: 6 }).toFile(files['jpg-rot']);
  // ★ 휴대폰 HEIC 를 이름만 .jpg 로 바꾼 파일(앞머리 ftypheic) — 브라우저가 못 연다 → 바꾸는 법 안내
  const heic = path.join(dir, 'phone.jpg');
  writeFileSync(heic, Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), Buffer.alloc(4000, 7)]));
  const H = await newPage(browser, 'R068-av', true);
  await H.setViewport(2560, 1313);
  await signUp(H, 'ra', '사진손님');
  await createRoom(H, 'R068 사진');
  await H.evaluate("(() => { const f = window.fetch; window.__av = []; window.fetch = async (...a) => { const r = await f(...a); if (String(a[0]).includes('/api/avatar')) { const c = r.clone(); window.__av.push({ s: r.status, b: (await c.text()).slice(0, 120) }); } return r; }; })()");
  const out = {};
  for (const [k, f] of Object.entries(files)) {
    await H.evaluate("window.__av = []");
    if (!(await H.evaluate("document.querySelector('.rename-pop') !== null"))) await realClick(H, '#rename-btn');
    await H.waitFor("document.querySelector('#avatar-file') !== null", 3000).catch(() => false);
    const doc = await H.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await H.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
    await H.send('DOM.setFileInputFiles', { nodeId, files: [f] });
    await H.waitFor("document.querySelector('.profile-editor .crop-stage img') !== null || document.querySelector('.profile-editor .form-error') !== null", 8000).catch(() => false);
    await sleep(300);
    const err0 = await H.evaluate("document.querySelector('.profile-editor .form-error')?.innerText ?? ''");
    if (!err0) await realClick(H, '.profile-editor button', '등록');
    await H.waitFor("document.querySelector('.rename-pop .rename-msg')?.innerText.includes('사진') || document.querySelector('.profile-editor .form-error') !== null", 8000).catch(() => false);
    out[k] = JSON.parse(await H.evaluate("JSON.stringify({ msg: document.querySelector('.rename-pop .rename-msg')?.innerText ?? '', err: document.querySelector('.profile-editor .form-error')?.innerText ?? '', net: window.__av })"));
    if (k === 'jpg-56k') await snap(H, '360-avatar-ok-2560');
    if (out[k].err) await snap(H, `360-avatar-err-${k}`);
    await H.evaluate("document.querySelector('.profile-editor .popup-close')?.click()");
    await sleep(200);
  }
  record(`★★★ R068 #71 프로필 사진 — jpg 56KB · 4032×3024 jpg · png · webp · 회전 jpg 모두 [등록] → "바꿨습니다"(PUT 200 · PC 2560)${EXTERNAL_URL ? ' · 터널' : ''}`, Object.values(out).every((o) => /바꿨/.test(o.msg) && !o.err && o.net.some((n) => n.s === 200)), JSON.stringify(out));
  // HEIC 를 .jpg 로 바꾼 것
  if (!(await H.evaluate("document.querySelector('.rename-pop') !== null"))) await realClick(H, '#rename-btn');
  await H.waitFor("document.querySelector('#avatar-file') !== null", 3000).catch(() => false);
  {
    const doc = await H.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await H.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
    await H.send('DOM.setFileInputFiles', { nodeId, files: [heic] });
  }
  await H.waitFor("document.querySelector('.profile-editor .form-error') !== null", 8000).catch(() => false);
  await sleep(300);
  const he = await H.evaluate("document.querySelector('.profile-editor .form-error')?.innerText ?? ''");
  await snap(H, '361-avatar-heic-as-jpg');
  record('★★ R068 #71 휴대폰 HEIC 를 이름만 .jpg 로 — "HEIC · 이름만 .jpg 로 바꿔서는 안 돼요 · JPG 로 저장" 안내', /HEIC/.test(he) && /\.jpg 로 바꿔서는/.test(he) && /JPG/.test(he), he);
  H.close();
}

// ── game ────────────────────────────────────────────────────────────────────
// ★ 실제 긴 문제처럼 문장 넷(문장마다 줄을 바꾸는 QuestionText 규칙 — 짧은 문장을 여럿 두면 줄 수가 실제보다 많아진다)
const QLEN_FILL = '이 문장은 긴 질문 화면을 검사하려고 일부러 길게 늘여 쓴 연습용 글이며 실제로 나오는 문제는 아닙니다. ';
async function r068GameFlow(browser) {
  // 검사 DB 에 240자 질문 하나(5760 을 본뜸) · 이 판에는 140(5760) · 197(가장 긴 활성) · 240 세 문제만 나오게 잠깐 나머지를 쉬게 한다(끝나면 되돌림)
  const prep = await withPg(async (c) => {
    const longest = (await c.query(`SELECT id::text FROM questions WHERE is_active AND id <> 5760 ORDER BY char_length(question_text) DESC, id LIMIT 1`)).rows[0].id;
    const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'questions' AND column_name NOT IN ('id', 'question_text', 'source_ref') AND is_generated = 'NEVER' AND column_default IS DISTINCT FROM 'nextval(''questions_id_seq''::regclass)'`)).rows.map((r) => r.column_name);
    let text = '[QLEN 240] ';
    while ([...text].length < 240) text += QLEN_FILL;
    text = [...text].slice(0, 239).join('') + '?';
    const ins = await c.query(`INSERT INTO questions (question_text, ${cols.join(', ')}) SELECT $1, ${cols.join(', ')} FROM questions WHERE id = 5760 RETURNING id::text`, [text]);
    const nid = ins.rows[0].id;
    const acols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'question_answers' AND column_name NOT IN ('id', 'question_id')`)).rows.map((r) => r.column_name);
    await c.query(`INSERT INTO question_answers (question_id, ${acols.join(', ')}) SELECT $1, ${acols.join(', ')} FROM question_answers WHERE question_id = 5760`, [nid]);
    await c.query(`DROP TABLE IF EXISTS _r068_active`);
    await c.query(`CREATE TABLE _r068_active AS SELECT id FROM questions WHERE is_active`);
    await c.query(`UPDATE questions SET is_active = (id = ANY($1::bigint[])) WHERE is_active OR id = ANY($1::bigint[])`, [[5760, longest, nid]]);
    return { longest, nid, len: [...text].length };
  });
  console.log(`  [r068] QLEN 준비 ${JSON.stringify(prep)}`);
  try {
    await r068GamePlay(browser, prep);
  } finally {
    await withPg(async (c) => {
      await c.query(`UPDATE questions SET is_active = true WHERE id IN (SELECT id FROM _r068_active)`);
      await c.query(`DROP TABLE IF EXISTS _r068_active`);
      if (prep?.nid) {
        await c.query(`DELETE FROM question_feedback WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM question_experiences WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM answer_events WHERE question_id = $1`, [prep.nid]).catch(() => undefined);
        await c.query(`DELETE FROM game_questions WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM question_answers WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM questions WHERE id = $1`, [prep.nid]).catch((e) => console.log(`  [r068] 240자 질문 지우기 실패(남겨 둠): ${e.message}`));
      }
    });
  }
}
const QLEN_PROBE = `JSON.stringify((() => {
  const q = document.querySelector('.q-text'); const card = document.querySelector('.question-card');
  if (!q) return null;
  const cs = getComputedStyle(q); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45;
  const head = document.querySelector('.q-head'); const timer = document.querySelector('.q-timer'); const prog = document.querySelector('.q-progress');
  const input = document.querySelector('.chat-card input, .chat-form input'); const hints = document.querySelector('.q-hints');
  const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= -1; };
  return {
    len: [...(q.dataset.text ?? q.innerText)].length,
    fs: cs.fontSize,
    lines: Math.round(q.getBoundingClientRect().height / lh),
    timerOneLine: timer && prog ? Math.abs((timer.getBoundingClientRect().top + timer.getBoundingClientRect().bottom) / 2 - (prog.getBoundingClientRect().top + prog.getBoundingClientRect().bottom) / 2) < 6 && timer.getBoundingClientRect().height < parseFloat(getComputedStyle(timer).fontSize) * 2.2 : null,
    headH: head ? Math.round(head.getBoundingClientRect().height) : null,
    input: vis(input), hints: vis(hints),
    inputOver: input ? Math.round(input.getBoundingClientRect().bottom - innerHeight) : null,
    pageScroll: document.scrollingElement.scrollHeight > innerHeight + 1,
    cardScroll: card ? card.scrollHeight > card.clientHeight + 1 : null,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
  };
})())`;
async function r068GamePlay(browser, prep) {
  const H = await newPage(browser, 'R068-game', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'rq', '긴질문방장');
  const roomId = await createRoom(H, 'R068 긴 질문');
  const socks = await socketGuests(roomId, 1, 'rq');
  const guest = socks[0];
  await sleep(600);
  await setQuestionCount(H, 3);
  await sleep(300);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const table = [];
  const rate = {};
  let cere = null;
  const sizes = [['m360', 360, 740, true], ['1536', 1536, 864, false], ['2560', 2560, 1313, false]];
  for (let i = 0; i < 3; i += 1) {
    await H.waitFor(`document.querySelector('.question-card .q-progress')?.innerText.trim().startsWith('${i + 1} ')`, 60000).catch(() => false);
    await sleep(500);
    const len = await H.evaluate("[...(document.querySelector('.q-text')?.dataset.text ?? '')].length");
    const tag = len >= 230 ? '240' : len >= 180 ? '198' : '140';
    for (const [dev, w, h, touch] of sizes) {
      await touchDevice(H, w, h, touch);
      if (!touch) await H.setViewport(w, h);
      await H.evaluate("window.dispatchEvent(new Event('resize'))");
      await sleep(450);
      // 크기를 바꾼 뒤 지문 맞춤(QuestionText ResizeObserver)을 한 번 더 — 바뀌는 도중의 뿌리 글자 크기로 잰 값을 버린다
      await H.evaluate("(() => { const q = document.querySelector('.q-text'); if (q) { q.style.width = '99%'; requestAnimationFrame(() => { q.style.width = ''; }); } })()");
      await sleep(450);
      const m = JSON.parse(await H.evaluate(QLEN_PROBE));
      table.push({ ...m, chars: m?.len, len: tag, dev });
      if (dev === 'm360' || dev === '1536') await snap(H, `320-qlen-${tag}-${dev === 'm360' ? 'm390' : '1536'}`);
      if (dev === 'm360') {
        // ★ 실험(브리핑 "글자 크기를 줄이면 240자가 되는지도 따로") — 지문 글자를 16 · 15px 로 눌러 본다(15 = QuestionText 하한)
        for (const px of [16, 15]) {
          await H.evaluate(`(() => { let st = document.getElementById('r068-qpx'); if (!st) { st = document.createElement('style'); st.id = 'r068-qpx'; document.head.appendChild(st); } st.textContent = '.q-text { --q-px: ${px}px !important; font-size: ${px}px !important; }'; })()`);
          await sleep(300);
          const e = JSON.parse(await H.evaluate(QLEN_PROBE));
          table.push({ ...e, chars: e?.len, len: tag, dev: `m360-${px}px` });
          if (tag === '240' && px === 15) await snap(H, '320-qlen-240-m390-15px');
        }
        await H.evaluate("document.getElementById('r068-qpx')?.remove()");
        await sleep(200);
      }
      if (dev === '2560') await snap(H, `320-qlen-${tag}-2560`);
    }
    if (tag === '240') {
      await touchDevice(H, 360, 740, true);
      await setTheme(H, 'night');
      await sleep(300);
      await snap(H, '320-qlen-240-m390-night');
      await setTheme(H, 'pastel');
    }
    // 정답 공개 — i=0 손님이 맞히고 이모티콘 셋(#66) · 그 밖은 방장 넘기기
    await touchDevice(H, 1536, 864, false);
    await H.setViewport(1536, 864);
    await sleep(300);
    if (i === 0) {
      await answerCurrent(H);
      await H.waitFor("document.querySelector('.reveal') !== null", 8000).catch(() => false);
      await sleep(400);
      await H.setInput('.chat-card input', '😀😂👍');
      await H.click('전송');
      await sleep(900);
      cere = JSON.parse(await H.evaluate("JSON.stringify({ n: document.querySelectorAll('.ceremony-msg img.emoji, .ceremony-msg .emoji').length })"));
      await snap(H, '357-ceremony-emoji3-1536');
    } else {
      await openHostSkip(H);
      await H.evaluate("document.querySelector('.confirm-modal[data-kind=\"host-skip\"] .confirm-actions button')?.click()");
      await H.waitFor("document.querySelector('.reveal') !== null", 8000).catch(() => false);
      await sleep(400);
    }
    if (i === 0) {
      // ★★★ R099 — 공개 화면 평가 줄 없음(옛 R068 "방금 문제 어땠어요? (+1P)")
      rate.none = await H.evaluate("document.querySelectorAll('.reveal-fb, [data-rate-ask], .fb-vote').length");
      await snap(H, '300-reveal-nofb');
    }
    if (i === 1) {
      await touchDevice(H, 390, 844, true);
      await sleep(400);
      rate.mNone = await H.evaluate("document.querySelectorAll('.reveal-fb, [data-rate-ask], .fb-vote').length");
      await snap(H, '300-reveal-nofb-m390');
      await touchDevice(H, 1536, 864, false);
      await H.setViewport(1536, 864);
    }
  }
  // 결과 — 접힘 기본(#68) · 평가 수 · 펼침 기억 · 0P 안내
  await H.waitFor("document.querySelector('.result-card') !== null", 60000).catch(() => false);
  await sleep(600);
  await H.evaluate("localStorage.removeItem('qw.fbResultOpen')");
  const res1 = JSON.parse(await H.evaluate("JSON.stringify({ def: document.querySelector('.fb-result')?.dataset.fbDefault ?? '', count: document.querySelector('[data-fb-count]')?.innerText ?? '', list: !!document.querySelector('.fb-list') })"));
  await snap(H, '300-rate-result-folded');
  await realClick(H, '.fb-result-head');
  await sleep(500);
  const res2 = JSON.parse(await H.evaluate("JSON.stringify({ list: !!document.querySelector('.fb-list'), mem: localStorage.getItem('qw.fbResultOpen'), votes: document.querySelectorAll('.fb-list .fb-vote').length, report: document.querySelectorAll('.fb-list .qreport-btn').length })"));
  await snap(H, '300-rate-result');
  const pts = await withPg(async (c) => (await c.query(`SELECT coalesce(sum(g.amount), 0)::int n FROM point_grants g JOIN accounts a ON a.id = g.account_id WHERE a.login_id = $1 AND g.reason = 'rate'`, [`${ACCOUNT_PREFIX}_rq`])).rows[0].n);
  record('★★★ R099 정답 공개 — 평가 줄 없음(PC · m390) · 평가 1P 0(검사 DB)', rate.none === 0 && rate.mNone === 0 && pts === 0, JSON.stringify({ ...rate, pts }));
  record('★★★ R068 #68 → R099 결과 — "이번 판 문제" 접힌 채 시작 · 접혀도 "3문제" · 펼치면 줄마다 제보 · 평가 버튼 0 · 펼침 기억', res1.def === 'closed' && !res1.list && /3문제/.test(res1.count) && res2.list && res2.votes === 0 && res2.report === 3 && res2.mem === '1', JSON.stringify({ res1, res2 }));
  record('★★★ R068 #66 세레모니 — 붙여 보낸 이모티콘 셋이 셋 다', cere?.n === 3, JSON.stringify(cere));
  // QLEN 표
  const row = (len, dev) => table.find((t) => t.len === len && t.dev === dev);
  console.log('  [r068] QLEN 표');
  for (const t of table) console.log(`    ${t.len}(${t.chars})자 · ${t.dev} — 줄 ${t.lines} · 글자 ${t.fs} · 시간 한 줄 ${t.timerOneLine} · 입력칸 ${t.input}(${t.inputOver}px) · 힌트 ${t.hints} · 페이지 스크롤 ${t.pageScroll} · 카드 스크롤 ${t.cardScroll} · 가로 넘침 ${t.overflowX}`);
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r068', 'qlen-table.json'), JSON.stringify(table, null, 1));
  record('★★★ R068 #61 시간 표시 — 360 폭에서 140 · 197 · 240자 모두 머리줄 한 줄', ['140', '198', '240'].every((l) => row(l, 'm360')?.timerOneLine === true), JSON.stringify(table.filter((t) => t.dev === 'm360').map((t) => [t.len, t.timerOneLine, t.headH])));
  record('★★ R068 QLEN — 1536 · 2560 에서 140 · 197 · 240자 입력칸 · 힌트 줄이 스크롤 없이 보임(판단 근거 표 — 360 은 표로만)', ['140', '198', '240'].every((l) => ['1536', '2560'].every((d) => row(l, d)?.input && row(l, d)?.hints && !row(l, d)?.pageScroll)), JSON.stringify(table.map((t) => [t.len, t.dev, t.lines, t.input, t.hints, t.pageScroll])));
  // #53 로비 "지난 판 문제" m360 — 펼친 줄이 화면 밖으로 안 나감
  await H.evaluate("[...document.querySelectorAll('.result-card button')].find((b) => /로비/.test(b.innerText))?.click()");
  await H.waitFor("document.querySelector('#feedback-last-btn') !== null", 10000).catch(() => false);
  await touchDevice(H, 360, 640, true);
  await sleep(400);
  await tapOn(H, '#feedback-last-btn');
  await H.waitFor("document.querySelector('.fb-modal .fb-row') !== null", 6000).catch(() => false);
  await tapOn(H, '.fb-modal .fb-row:nth-child(3) .fb-q');
  await sleep(400);
  const last = JSON.parse(await H.evaluate("JSON.stringify((() => { const m = document.querySelector('.fb-modal'); const r = m?.getBoundingClientRect(); const bad = [...(m?.querySelectorAll('*') ?? [])].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1 || b.right > r.right + 1); }).map((e) => e.className).slice(0, 5); return { open: !!m?.querySelector('.fb-row.open'), bad, docX: document.documentElement.scrollWidth > innerWidth + 1, modalX: m ? m.scrollWidth > m.clientWidth + 1 : null, note: m?.querySelector('[data-rate-note]')?.innerText ?? '' }; })())"));
  await snap(H, '358-fblast-m360');
  record('★★★ R068 #53 로비 지난 판 문제 m360 — 줄을 펼쳐도 글이 창 · 화면 밖으로 안 나감(R099 평가 안내 없음)', last.open && last.bad.length === 0 && !last.docX && !last.modalX && !/\+1P/.test(last.note ?? ''), JSON.stringify(last));
  await touchDevice(H, 1536, 864, false);
  for (const s of socks) s.close();
  H.close();
}

// =============================================================================
// ★★★ R085 — OX 10연속 화면 (D-342) (UICHECK_R085=1 · 묶음 r085 · docs/design/r085)
//   방장 PC 1280×720 · 손님 m360 터치 · 소켓 손님 1 — 미니게임만 1개(OX)
//   큰 O/X 두 버튼 · 키(O · →) · 바꾸기 · m360 버튼 화면 안 · 가장 긴 문장 넘침 0 · 공개(정답 · 해설) · 최종 목록 10 · 세 테마
// =============================================================================
async function r085Flow(browser) {
  const H = await newPage(browser, 'R085-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'oxh', 'OX방장');
  const roomId = await createRoom(H, 'R085 OX');
  const G = await newPage(browser, 'R085-g', true);
  await signUp(G, 'oxg', 'OX손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'oxs');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r085] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const over = (P) => P.evaluate('document.documentElement.scrollWidth - innerWidth');
  const stateOf = (P) => P.evaluate("(() => { const c = document.querySelector('.mg-card'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; const k = [...c.classList].find((x) => x.startsWith('mg-') && !x.startsWith('mg-phase') && x !== 'mg-card'); return `${k?.slice(3)}:${c.dataset.phase}:${document.querySelector('.mg-round')?.innerText ?? ''}`; })()");
  const answerOf = (id) => withPg(async (c) => (await c.query(`SELECT payload FROM minigame_items WHERE item_id = $1`, [id])).rows[0]?.payload ?? null);
  const key = async (P, k, code) => {
    await P.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 39 });
    await P.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 39 });
  };
  let sMg = null;
  S.on('minigame.state', (p) => (sMg = p.minigame));
  // 가장 긴 문장(넘침 확인용 — 화면에 직접 넣어 본다)
  const longest = await withPg(async (c) => (await c.query(`SELECT payload->>'statement' s FROM minigame_items WHERE game = 'ox' AND active ORDER BY length(payload->>'statement') DESC LIMIT 1`)).rows[0]?.s ?? '');

  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(300);
  await realClick(H, '[data-mg-catalog-open]');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 4000).catch(() => false);
  await sleep(300);
  const first = await H.evaluate("document.querySelector('.mg-cat-card')?.dataset.key ?? ''");
  await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
  const picked = await selectMinigames(H, ['ox']);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const done = new Set();
  const res = { play: null, gPlay: null, reveal: null, final: null, themes: [] };
  const t0 = Date.now();
  let tok = null;
  while (Date.now() - t0 < 300000) {
    const st = await stateOf(H);
    if (st === 'result') break;
    if (!st || done.has(st)) {
      await sleep(120);
      continue;
    }
    done.add(st);
    const [k, phase, roundTxt] = st.split(':');
    const round = Number((roundTxt ?? '').split('/')[0].trim()) || 0;
    if (k !== 'ox') continue;
    if (phase === 'play') {
      tok ??= sMg?.token;
      if (sMg?.token !== tok) continue; // 둘째 판은 그냥 흘려 보낸다
      await sleep(250);
      const it = sMg?.round?.itemId ? await answerOf(sMg.round.itemId) : null;
      const ans = it?.answer === true;
      if (round === 1) {
        // 방장: 틀린 쪽 키 → 맞는 쪽 키로 바꿈 · 손님: 맞는 쪽 톡
        await key(H, ans ? 'x' : 'o', ans ? 'KeyX' : 'KeyO');
        await sleep(250);
        const first = await H.evaluate("document.querySelector('[data-ox-mine]')?.dataset.oxMine ?? ''");
        await key(H, ans ? 'o' : 'x', ans ? 'KeyO' : 'KeyX');
        await sleep(250);
        const second = await H.evaluate("JSON.stringify({ mine: document.querySelector('[data-ox-mine]')?.dataset.oxMine ?? '', pressed: [...document.querySelectorAll('.ox-btn')].map((b) => b.dataset.ox + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(','), stmt: document.querySelector('[data-ox-statement]')?.innerText ?? '' })");
        await realClick(G, `.ox-btn[data-ox="${ans ? 'O' : 'X'}"]`);
        await sleep(250);
        res.play = { ans: ans ? 'O' : 'X', first, ...JSON.parse(second) };
        res.gPlay = JSON.parse(await G.evaluate("JSON.stringify({ mine: document.querySelector('[data-ox-mine]')?.dataset.oxMine ?? '', btnIn: [...document.querySelectorAll('.ox-btn')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.height >= 70; }), count: document.querySelector('.mg-submitted')?.innerText ?? '' })"));
        await snap(H, 'ox-play-pc');
        await snap(G, 'ox-play-m360');
        // 가장 긴 문장을 넣어 m360 넘침
        await G.evaluate(`(() => { const e = document.querySelector('[data-ox-statement]'); if (e) e.lastChild.textContent = ' ' + ${JSON.stringify(longest)}; })()`);
        await sleep(150);
        res.themes.push(['ox-play-long m360', await over(G)]);
        await snap(G, 'ox-play-long-m360');
        await theme(G, 'office');
        await sleep(150);
        await snap(G, 'ox-play-office-m360');
        await theme(G, 'pastel');
        S.emit('minigame.submit', { token: sMg.token, roundIndex: sMg.roundIndex, input: { pick: !ans, elapsedMs: 900 } });
      } else {
        await realClick(H, `.ox-btn[data-ox="${ans ? 'O' : 'X'}"]`).catch(() => undefined);
      }
    }
    if (phase === 'roundResult' && round === 1 && sMg?.token === tok) {
      await sleep(200);
      res.reveal = JSON.parse(await H.evaluate("JSON.stringify({ ans: document.querySelector('[data-ox-reveal]')?.dataset.oxReveal ?? '', my: document.querySelector('[data-ox-my]')?.dataset.oxMy ?? '', expl: document.querySelector('[data-ox-expl]')?.innerText ?? '' })"));
      await snap(H, 'ox-reveal-pc');
      await snap(G, 'ox-reveal-m360');
      res.themes.push(['ox-reveal m360', await over(G)]);
      await theme(H, 'night');
      await sleep(150);
      await snap(H, 'ox-reveal-night-pc');
      await theme(H, 'pastel');
    }
    if (phase === 'final' && !res.final) {
      await sleep(250);
      res.final = JSON.parse(await H.evaluate("JSON.stringify({ rows: document.querySelectorAll('[data-ox-row]').length, ok: document.querySelectorAll('[data-ox-row=\"ok\"]').length, expl: document.querySelectorAll('.ox-a-e').length, summary: !!document.querySelector('.which-summary') })"));
      await snap(H, 'ox-final-pc');
      await snap(G, 'ox-final-m360');
      res.themes.push(['ox-final m360', await over(G)]);
      await theme(H, 'office');
      await sleep(150);
      await snap(H, 'ox-final-office-pc');
      await theme(H, 'pastel');
    }
    await sleep(80);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  await sleep(400);
  const result = await H.evaluate("document.querySelectorAll('.ranking li').length");
  await snap(H, 'result-pc');
  note('고르기 창', { first, picked });
  note('판', { play: res.play, g: res.gPlay, longest: [...longest].length });
  note('공개', res.reveal);
  note('최종', res.final);
  note('넘침', res.themes);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r085'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r085'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r085', 'r085.json'), JSON.stringify(rows, null, 1));
  const p = res.play;
  record('★★ R085 고르기 창 — 맨 앞 OX 10연속 · 고름', first === 'ox' && picked === 'ox', JSON.stringify({ first, picked }));
  record('★★★ R085 판 — 문장 · 키로 틀린 쪽 → 맞는 쪽 바꿈(눌림 표시 하나)', Boolean(p && p.stmt && p.first && p.first !== p.ans && p.mine === p.ans && p.pressed.split(',').filter((x) => x.endsWith('*')).length === 1), JSON.stringify(p));
  record('★★★ R085 m360 — 손님 톡 · 두 버튼 화면 안 · 높이 70 이상 · 낸 수 줄', Boolean(res.gPlay && res.gPlay.mine && res.gPlay.btnIn && /명/.test(res.gPlay.count)), JSON.stringify(res.gPlay));
  record('★★★ R085 공개 — 정답 · 내 답 맞음 · 해설', Boolean(res.reveal && res.reveal.ans === p?.ans && res.reveal.my === 'ok' && res.reveal.expl.length > 5), JSON.stringify(res.reveal));
  record('★★★ R085 최종 — 10 문장 목록 · 해설 · 문항별 표', Boolean(res.final && res.final.rows === 10 && res.final.expl >= 9 && res.final.summary), JSON.stringify(res.final));
  record('★★ R085 넘침 0(가장 긴 문장 m360 · 공개 · 최종) · 결과 3명', res.themes.every(([, o]) => o <= 1) && result === 3, JSON.stringify({ t: res.themes, result }));
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R084 — 노래 둘 화면 (D-341) (UICHECK_R084=1 · 묶음 r084 · docs/design/r084)
//   방장 PC 1280×720 · 손님 m360 터치 · 소켓 손님 1 — 미니게임만 2개(노래 맞히기 · 이 노래 몇 년도?)
//   [▶ 듣기] 버튼 · audio 요소 src = previewUrl · 입력 · ✓ 제목/가수 칸 · 공개 카드(앨범 그림 · 표기) · 연도 입력(바꾸기) ·
//   재생 실패(화면 audio error) → 건너뜀 · 세 테마 · m360 넘침. ★ 소리가 실제로 나는지는 검사하지 않는다(찬종 A111) — 상태만 적는다
// ★★ R092 (D-349) 개정 — 노래 맞히기 = 제목만 · 첫 사람만 +1 · 맞힌 순간 공개: 판1 방장 오답 → 손님 가수("가수 말고 제목" · warn 색)
//   → 방장 제목 → 곡 즉시 끝 · 공개 "내가 … 맞혔어요" / 손님 "노래방장 님이 …" (✓ 제목/가수 칸 · 둘 다 +1 은 없어짐)
// =============================================================================
async function r084Flow(browser) {
  const H = await newPage(browser, 'R084-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'sgh', '노래방장');
  const roomId = await createRoom(H, 'R084 노래');
  const G = await newPage(browser, 'R084-g', true);
  await signUp(G, 'sgg', '노래손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'sgs');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r084] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const over = (P) => P.evaluate('document.documentElement.scrollWidth - innerWidth');
  const stateOf = (P) => P.evaluate("(() => { const c = document.querySelector('.mg-card'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; const k = [...c.classList].find((x) => x.startsWith('mg-') && !x.startsWith('mg-phase') && x !== 'mg-card'); return `${k?.slice(3)}:${c.dataset.phase}:${document.querySelector('.mg-round')?.innerText ?? ''}`; })()");
  const itemOf = (id) => withPg(async (c) => (await c.query(`SELECT payload FROM minigame_items WHERE item_id = $1`, [id])).rows[0]?.payload ?? null);
  const audioOf = (P) => P.evaluate("JSON.stringify({ src: document.querySelector('[data-song-audio]')?.getAttribute('src') ?? null, sound: document.querySelector('[data-song-sound]')?.dataset.songSound ?? null, unlocked: document.querySelector('[data-song-sound]')?.dataset.songUnlocked ?? null, listen: !!document.querySelector('[data-song-listen]'), vol: document.querySelector('[data-song-volume]')?.value ?? null })").then((s) => JSON.parse(s));
  const enterText = async (P, t) => {
    await P.setInput('[data-topic-input]', t);
    await P.evaluate("document.querySelector('.topic-form')?.requestSubmit()");
    await sleep(300);
  };
  const enterYear = async (P, y) => {
    await P.setInput('[data-songyear-input]', String(y));
    await P.evaluate("document.querySelector('[data-songyear-input]')?.closest('form')?.requestSubmit()");
    await sleep(300);
  };
  let sMg = null;
  S.on('minigame.state', (p) => (sMg = p.minigame));
  const subS = (input) => S.emit('minigame.submit', { token: sMg?.token, roundIndex: sMg?.roundIndex, input });

  // ── 설정 — 미니게임만 · 2개 · 노래 둘 (고르기 창 그림)
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(300);
  // ★ R087 — 이 노래 몇 년도는 숨김(hidden) — 옛 검사는 검사 스위치로 그대로
  await H.evaluate('window.__qwShowHidden?.(true)');
  await realClick(H, '[data-mg-catalog-open]');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 4000).catch(() => false);
  await sleep(300);
  // ★ R085 — OX 가 맨 앞에 와서 노래 둘은 OX 다음(ox 를 빼고 앞 둘)
  const cat = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('.mg-cat-card')].filter((c) => c.dataset.key !== 'ox').slice(0, 2).map((c) => c.dataset.key + ':' + (c.querySelector('svg') ? 'icon' : '-')))"));
  await snap(H, 'catalog-pc');
  await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
  const picked = await selectMinigames(H, ['song', 'songyear']);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const done = new Set();
  const res = { rules: null, play: null, reveal: null, year: null, yearReveal: null, skipped: null, themes: [], result: null };
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const st = await stateOf(H);
    if (st === 'result') break;
    if (!st || done.has(st)) {
      await sleep(150);
      continue;
    }
    done.add(st);
    const [key, phase, roundTxt] = st.split(':');
    const round = Number((roundTxt ?? '').split('/')[0].trim()) || 0;
    if (key === 'song' && phase === 'rules') {
      await sleep(300);
      const h0 = await audioOf(H);
      const g0 = await audioOf(G);
      await snap(H, 'song-rules-pc');
      await snap(G, 'song-rules-m360');
      await realClick(H, '[data-song-listen]').catch(() => undefined);
      await realClick(G, '[data-song-listen]').catch(() => undefined);
      await sleep(400);
      res.rules = { h0, g0, h1: await audioOf(H), g1: await audioOf(G) };
    }
    if (key === 'song' && phase === 'play') {
      await sleep(400);
      const id = sMg?.round?.itemId;
      const it = id ? await itemOf(id) : null;
      const url = sMg?.round?.params?.previewUrl ?? null;
      if (round === 1) {
        const a0 = { h: await audioOf(H), g: await audioOf(G) };
        const help0 = await H.evaluate("JSON.stringify({ help: document.querySelector('.topic-fb')?.innerText ?? '', ph: document.querySelector('[data-topic-input]')?.getAttribute('placeholder') ?? '', ask: document.querySelector('.song-ask')?.innerText ?? '', parts: document.querySelectorAll('[data-song-part]').length })").then((x) => JSON.parse(x));
        await enterText(H, '아무노래아님');
        const wrongFb = await H.evaluate("document.querySelector('.topic-fb')?.dataset.feedback ?? ''");
        await enterText(G, it?.artist ?? ''); // ★ R092 — 가수 → 점수 없이 "가수 말고 제목"
        const gFb = await G.evaluate("JSON.stringify({ fb: document.querySelector('.topic-fb')?.dataset.feedback ?? '', cls: document.querySelector('.topic-fb')?.className ?? '', text: document.querySelector('.topic-fb')?.innerText ?? '', color: getComputedStyle(document.querySelector('.topic-fb')).color, input: !document.querySelector('[data-topic-input]')?.disabled })").then((x) => JSON.parse(x));
        await sleep(1200);
        const a1 = { h: await audioOf(H), g: await audioOf(G) };
        const submittedLine = await H.evaluate("document.querySelector('.mg-submitted') !== null");
        const stillPlay = await H.evaluate("document.querySelector('.mg-card')?.dataset.phase ?? ''");
        await snap(H, 'song-play-pc');
        await snap(G, 'song-play-artist-m360');
        res.themes.push(['song-play m360', await over(G)]);
        await theme(G, 'office');
        await sleep(200);
        await snap(G, 'song-play-office-m360');
        await theme(G, 'pastel');
        // ★ R092 — 방장 제목 → 곡 즉시 끝
        const tHit = Date.now();
        await enterText(H, it?.title ?? '');
        const ended = await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 4000).catch(() => false);
        res.play = { url, a0, a1, help0, wrongFb, gFb, stillPlay, submittedLine, ended: Boolean(ended), endMs: Date.now() - tHit };
      } else {
        await enterText(H, it?.title ?? '');
        await enterText(G, it?.title ?? '');
        subS({ text: it?.artist ?? '' });
      }
    }
    if (key === 'song' && phase === 'roundResult' && round === 1) {
      await sleep(900);
      const rv = JSON.parse(await H.evaluate("JSON.stringify({ title: document.querySelector('[data-song-title]')?.innerText ?? '', year: document.querySelector('[data-song-year]')?.dataset.songYear ?? '', art: (() => { const i = document.querySelector('[data-song-art]'); return i ? { w: i.naturalWidth, src: i.getAttribute('src') } : null; })(), credit: document.querySelector('.song-credit')?.innerText ?? '', all: document.querySelector('.mg-card')?.innerText ?? '', mine: document.querySelector('[data-song-winner]')?.innerText ?? '', rows: [...document.querySelectorAll('.mg-table li .mg-points')].map((e) => e.innerText).join(' '), audioStill: document.querySelector('[data-song-audio]')?.getAttribute('src') ?? null })"));
      rv.gWinner = await G.evaluate("document.querySelector('[data-song-winner]')?.innerText ?? ''");
      res.reveal = rv;
      await snap(H, 'song-reveal-pc');
      await snap(G, 'song-reveal-m360');
      res.themes.push(['song-reveal m360', await over(G)]);
      for (const th of ['office', 'night']) {
        await theme(H, th);
        await sleep(200);
        await snap(H, `song-reveal-${th}-pc`);
      }
      await theme(H, 'pastel');
    }
    if (key === 'songyear' && phase === 'play') {
      await sleep(400);
      const id = sMg?.round?.itemId;
      const it = id ? await itemOf(id) : null;
      const y = Number(it?.year ?? 2000);
      if (round === 1) {
        await enterYear(H, y + 3 > 2026 ? y - 3 : y + 3);
        await enterYear(H, y);
        const sent = await H.evaluate("document.querySelector('[data-songyear-sent]')?.dataset.songyearSent ?? ''");
        await enterYear(G, 1900);
        const gOut = await G.evaluate("document.querySelector('.songyear-stage .quiz-num-help')?.className ?? ''");
        await enterYear(G, y - 2);
        const count = await H.evaluate("document.querySelector('.mg-submitted')?.innerText ?? ''");
        await snap(H, 'songyear-play-pc');
        await snap(G, 'songyear-play-m360');
        res.themes.push(['songyear-play m360', await over(G)]);
        res.year = { y, sent, gOut, count };
        subS({ value: y + 1 > 2026 ? y - 1 : y + 1 });
      } else if (round === 2) {
        // 재생 실패 — 손님 화면의 audio 에서 error(실제 경로) + 소켓 손님 보고 → 2/3 과반 건너뜀
        await G.evaluate("document.querySelector('[data-song-audio]')?.dispatchEvent(new Event('error'))");
        await sleep(400);
        const gState = await G.evaluate("document.querySelector('[data-song-state]')?.innerText ?? ''");
        await snap(G, 'songyear-fail-m360');
        subS({ fail: true });
        res.skipped = { gState };
      } else {
        await enterYear(H, y);
        await enterYear(G, y);
      }
    }
    if (key === 'songyear' && phase === 'roundResult') {
      await sleep(700);
      const rv = JSON.parse(await H.evaluate("JSON.stringify({ state: document.querySelector('[data-song-reveal]')?.dataset.songReveal ?? '', mine: document.querySelector('[data-song-mine]')?.innerText ?? '', skippedLine: document.querySelector('[data-song-skipped]')?.innerText ?? '', vals: [...document.querySelectorAll('.mg-table li .mg-value')].map((e) => e.innerText).join(' | ') })"));
      if (round === 1) {
        res.yearReveal = rv;
        await snap(H, 'songyear-reveal-pc');
        await snap(G, 'songyear-reveal-m360');
        res.themes.push(['songyear-reveal m360', await over(G)]);
      } else if (round === 2) {
        res.skipped = { ...(res.skipped ?? {}), ...rv };
        await snap(H, 'songyear-skipped-pc');
      }
    }
    if (key === 'songyear' && phase === 'final') {
      await sleep(300);
      res.finalAudio = await audioOf(H);
      await snap(H, 'songyear-final-pc');
    }
    await sleep(100);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 20000).catch(() => false);
  await sleep(500);
  res.result = await H.evaluate("document.querySelectorAll('.ranking li').length");
  await snap(H, 'result-pc');
  await snap(G, 'result-m360');
  note('고르기 창', { cat, picked });
  note('규칙(듣기)', res.rules);
  note('노래 판', res.play);
  note('노래 공개', res.reveal);
  note('연도 판', res.year);
  note('연도 공개', res.yearReveal);
  note('건너뜀', res.skipped);
  note('최종 소리', res.finalAudio);
  note('넘침', res.themes);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r084'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r084'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r084', 'r084.json'), JSON.stringify(rows, null, 1));
  const p = res.play;
  record('★★ R084 고르기 창 — 맨 앞 노래 맞히기 · 이 노래 몇 년도?(아이콘) · 둘 고름', cat.join() === 'song:icon,songyear:icon' && /song/.test(picked), JSON.stringify({ cat, picked }));
  record('★★★ R084 규칙 — 아직 안 열린 화면(m360)은 [▶ 듣기] · 누르면 열림(버튼 사라짐) · 이미 조작한 PC 는 버튼 없이 열림 · 볼륨 70', Boolean(res.rules && res.rules.g0.listen && res.rules.g0.unlocked === '0' && res.rules.g1.unlocked === '1' && !res.rules.g1.listen && (res.rules.h0.listen || res.rules.h1.unlocked === '1') && res.rules.h0.vol === '70'), JSON.stringify(res.rules).replace(/data:audio[^"]+/g, 'data:…'));
  record('★★★ R084 노래 판 — audio src = previewUrl(PC · m360) · ✗ 오답 · 남의 진행 줄 없음 · ★ R092 안내 "제목 … 한 사람만 +1" · 제목/가수 칸 없음', Boolean(p && p.url && p.a0.h.src === p.url && p.a0.g.src === p.url && p.wrongFb === 'wrong' && !p.submittedLine && /한 사람만 \+1/.test(p.help0.help) && /제목/.test(p.help0.ph) && p.help0.parts === 0), JSON.stringify(p));
  record('★★★ R092 가수 → "가수 말고 제목을 쳐 주세요"(warn 색 · 틀림과 다름) · 곡 계속 · 입력 열림', Boolean(p && p.gFb.fb === 'artist' && /warn/.test(p.gFb.cls) && /가수 말고 제목/.test(p.gFb.text) && p.gFb.input && p.stillPlay === 'play'), JSON.stringify(p?.gFb));
  record('★★★ R092 제목 맞힌 순간 곡 끝 → 공개(4초 안)', Boolean(p && p.ended && p.endMs < 4000), JSON.stringify({ ended: p?.ended, ms: p?.endMs }));
  record('★★★ R084 노래 공개 — 앨범 그림 · 제목 · 연도 · ★ R096 "Apple Music" 표기 없음(찬종 "완전히 빼") · 공개 동안 노래 계속 · ★ R092 "내가 n초 만에 맞혔어요 +1" · 손님 "노래방장 님이"', Boolean(res.reveal && res.reveal.art && /300x300bb/.test(res.reveal.art.src ?? '') && res.reveal.title && /^\d{4}$/.test(res.reveal.year) && !/Apple/.test(res.reveal.credit) && !/Apple/.test(res.reveal.all ?? '') && /^내가 .*초 만에 맞혔어요/.test(res.reveal.mine) && /노래방장 님이 .*맞혔어요/.test(res.reveal.gWinner) && res.reveal.audioStill), JSON.stringify(res.reveal));
  record('★★★ R084 연도 판 — 바꾼 마지막 답 · 범위 밖 안내 · 낸 사람 수 줄', Boolean(res.year && Number(res.year.sent) === res.year.y && /bad/.test(res.year.gOut) && /명/.test(res.year.count)), JSON.stringify(res.year));
  record('★★★ R084 연도 공개 — 정확 · 표에 연도(정확/±)', Boolean(res.yearReveal && /정확/.test(res.yearReveal.mine) && /정확/.test(res.yearReveal.vals)), JSON.stringify(res.yearReveal));
  record('★★★ R084 재생 실패(audio error) → "못 불러왔어요" · 과반 → 건너뜀 줄', Boolean(res.skipped && /못 불러왔어요/.test(res.skipped.gState) && res.skipped.state === 'skipped' && /넘어가요/.test(res.skipped.skippedLine)), JSON.stringify(res.skipped));
  record('★★ R084 최종 — 노래 멈춤(src 없음) · 결과 3명 · m360 넘침 0', Boolean(res.finalAudio && !res.finalAudio.src && res.result === 3 && res.themes.every(([, o]) => o <= 1)), JSON.stringify({ f: res.finalAudio, r: res.result, t: res.themes }));
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R083 — 캐치마인드 화면 (D-340) (UICHECK_R083=1 · 묶음 r083 · docs/design/r083)
//   방장 PC 1280×720(1라운드 출제 — 마우스로 그림) · 손님 m360 터치(2라운드 출제 — 손가락) · 소켓 손님 1 · 2라운드
//   설정 네 버튼 · 캔버스 + 도구(출제자만) · 채팅 줄임 · 선이 다른 화면에 · 정답 시스템 줄 · 공개 · 결과 · 세 테마 · m360
// =============================================================================
async function r083Flow(browser) {
  const H = await newPage(browser, 'R083-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'dwh', '그림방장');
  const roomId = await createRoom(H, 'R083 캐치마인드');
  const G = await newPage(browser, 'R083-g', true);
  await signUp(G, 'dwg', '그림손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'dws');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r083] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const say = (P, text) => P.setInput('.chat-card input', text).then(() => P.click('전송'));
  const canvasRect = (P) => P.evaluate("JSON.stringify((() => { const r = document.querySelector('[data-draw-canvas]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth }; })())").then((s) => JSON.parse(s));
  const mousePath = async (P, pts) => {
    await P.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1] });
    await P.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1 });
    for (const [x, y] of pts.slice(1)) {
      await P.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
      await sleep(30);
    }
    const [lx, ly] = pts[pts.length - 1];
    await P.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lx, y: ly, button: 'left', buttons: 0, clickCount: 1 });
  };
  const touchPath = async (P, pts) => {
    await P.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    for (const [x, y] of pts.slice(1)) {
      await P.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await sleep(30);
    }
    await P.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const circle = (r, n = 18) => Array.from({ length: n + 1 }, (_, i) => [r.x + r.w / 2 + Math.cos((i / n) * Math.PI * 2) * r.w * 0.3, r.y + r.h / 2 + Math.sin((i / n) * Math.PI * 2) * r.h * 0.3]);

  // ── 설정
  await realClick(H, 'button[data-mode="draw"]');
  await H.waitFor("document.querySelector('[data-draw-note]') !== null", 4000).catch(() => false);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  const setting = JSON.parse(await H.evaluate("JSON.stringify({ modes: [...document.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(','), note: !!document.querySelector('[data-draw-note]'), quizRows: !!document.querySelector('.settings .count-input:not(.mg-rounds-input)'), team: document.querySelector('[data-team-toggle]')?.disabled ?? null })"));
  await snap(H, 'settings-draw-pc');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null", 20000).catch(() => false);
  await sleep(600);
  // ── 1라운드 — 방장 출제(마우스)
  const r1 = JSON.parse(await H.evaluate("JSON.stringify({ tools: !!document.querySelector('[data-draw-tools]'), kw: document.querySelector('[data-draw-keyword]')?.innerText ?? '', chatH: Math.round(document.querySelector('.chat-card').getBoundingClientRect().height), side: Math.round(document.querySelector('[data-draw-canvas]').getBoundingClientRect().width), chatBeside: document.querySelector('.chat-card').getBoundingClientRect().left >= document.querySelector('[data-draw-canvas]').getBoundingClientRect().right, hintBtns: document.querySelectorAll('[data-draw-hint-btn]').length, toolsIn: [...document.querySelectorAll('[data-draw-tools] button')].every((b) => b.getBoundingClientRect().bottom <= innerHeight) })"));
  const gTools = await G.evaluate("!!document.querySelector('[data-draw-tools]')");
  const rect = await canvasRect(H);
  await mousePath(H, circle(rect));
  await realClick(H, '[data-draw-color-dot]'); // ★ R095 — 팔레트는 색 점 팝업 안
  await realClick(H, '[data-draw-color="#e5383b"]');
  await mousePath(H, [[rect.x + rect.w * 0.2, rect.y + rect.h * 0.8], [rect.x + rect.w * 0.5, rect.y + rect.h * 0.6], [rect.x + rect.w * 0.8, rect.y + rect.h * 0.8]]);
  await sleep(800);
  const gStrokes = await G.evaluate("Number(document.querySelector('[data-draw-canvas]')?.dataset.strokes ?? -1)");
  await snap(H, 'draw-drawer-pc');
  await snap(G, 'draw-guesser-m360');
  const gRect = await canvasRect(G);
  await say(G, '혹시모를오답');
  await sleep(300);
  await say(G, r1.kw);
  await sleep(500);
  const gSolved = await G.evaluate("!!document.querySelector('.draw-mine-ok')");
  const sysLine = await H.evaluate("(document.querySelector('.chat-log')?.innerText ?? '').split(String.fromCharCode(10)).filter((l) => l.includes('정답!')).join(' | ')");
  await snap(H, 'draw-solved-pc');
  S.emit('chat.send', { text: r1.kw, epoch: null });
  await H.waitFor("document.querySelector('[data-draw-phase=\"reveal\"]') !== null", 8000).catch(() => false);
  await sleep(300);
  const rev = JSON.parse(await H.evaluate("JSON.stringify({ kw: document.querySelector('[data-draw-keyword]')?.innerText ?? '', solved: Number(document.querySelector('[data-draw-solved]')?.dataset.drawSolved ?? -1) })"));
  await snap(H, 'reveal-pc');
  await snap(G, 'reveal-m360');
  for (const th of ['office', 'night']) {
    await theme(H, th);
    await sleep(200);
    await snap(H, `reveal-${th}-pc`);
  }
  await theme(H, 'pastel');
  // ── 2라운드 — 손님(m360) 출제(손가락)
  await G.waitFor("document.querySelector('[data-draw-tools]') !== null", 15000).catch(() => false);
  await sleep(500);
  const g2 = JSON.parse(await G.evaluate("JSON.stringify({ tools: !!document.querySelector('[data-draw-tools]'), kw: document.querySelector('[data-draw-keyword]')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth, toolsIn: (() => { const r = document.querySelector('[data-draw-tools]')?.getBoundingClientRect(); return r ? r.right <= innerWidth + 1 : false; })() })"));
  const gr = await canvasRect(G);
  await touchPath(G, circle(gr, 14));
  await sleep(800);
  const hStrokes = await H.evaluate("Number(document.querySelector('[data-draw-canvas]')?.dataset.strokes ?? -1)");
  await snap(G, 'draw-drawer-m360');
  await theme(G, 'office');
  await sleep(200);
  await snap(G, 'draw-drawer-office-m360');
  await theme(G, 'pastel');
  await snap(H, 'draw-guesser-pc');
  await say(H, g2.kw);
  S.emit('chat.send', { text: g2.kw, epoch: null });
  await H.waitFor("document.querySelector('.ranking') !== null", 20000).catch(() => false);
  await sleep(600);
  const result = await H.evaluate("document.querySelectorAll('.ranking li').length");
  await snap(H, 'result-pc');
  await snap(G, 'result-m360');
  note('설정', setting);
  note('1라운드', { r1, gTools, gStrokes, gRect, gSolved, sysLine, rev });
  note('2라운드', { g2, hStrokes, result });
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r083'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r083'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r083', 'r083.json'), JSON.stringify(rows, null, 1));
  record('★★★ R083 설정 — 방식 네 버튼(캐치마인드 눌림) · 한 줄 설명 · 문제 수 숨김 · 팀전 잠김', setting.modes === 'quiz,minigame,liar,draw*' && setting.note && !setting.quizRows && setting.team === true, JSON.stringify(setting));
  // ★ R087 (D-344) — 채팅은 캔버스 옆(PC) · 캔버스 1280×720 에서 ≥ 560 · 힌트 버튼 셋 · 도구 화면 안
  record('★★★ R083/R087 출제자(PC 1280×720) — 도구 · 제시어 · 채팅 옆 · 캔버스 ≥ 560 · 힌트 버튼 3 · 도구 화면 안 · 맞히는 쪽은 도구 없음', r1.tools && !!r1.kw && r1.chatBeside && r1.side >= 560 && r1.hintBtns === 3 && r1.toolsIn && !gTools, JSON.stringify({ r1, gTools }));
  record('★★★ R083 마우스로 그린 선 2개가 손님(m360) 캔버스에 · m360 캔버스 화면 안', gStrokes === 2 && gRect.x >= 0 && gRect.x + gRect.w <= gRect.vw + 1, JSON.stringify({ gStrokes, gRect }));
  record('★★★ R083 채팅 정답 — 맞힘 표시 · 시스템 줄 "정답!" · 공개 키워드 · 맞힌 2', gSolved && /정답!/.test(sysLine) && rev.kw === r1.kw && rev.solved === 2, JSON.stringify({ gSolved, sysLine, rev }));
  record('★★ R083 손님(m360) 출제 — 도구 한 줄 화면 안 · 손가락 선이 PC 에 · 넘침 0', g2.tools && g2.toolsIn && g2.over <= 1 && hStrokes >= 1, JSON.stringify({ g2, hStrokes }));
  record('★★ R083 결과 — 3명', result === 3, String(result));
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R090 — 방장 제시어 주제 고르기 (D-347) (UICHECK_R090=1 · 묶음 r090 · docs/design/r090)
//   방장 PC 1280 · FHD 125% · 손님 m360 — 라이어: 접힌 묶음 → 펼침 · 하나 끔 → 손님 화면에 흐리게(읽기만) · 전부 끔 → "하나 이상" · 시작 막힘 · 전부 → 다시
//   캐치마인드: 같은 이름 세트(draw-*-2)는 한 줄 · 화면 넘침 0 · 세 테마 아님(설정 카드 한 묶음)
// =============================================================================
async function r090Flow(browser) {
  const H = await newPage(browser, 'R090-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r0h', '주제방장');
  const roomId = await createRoom(H, 'R090 주제');
  const G = await newPage(browser, 'R090-g', true);
  await signUp(G, 'r0g', '주제손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  await socketGuests(roomId, 1, 'r0s');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r090] ${k}: ${JSON.stringify(v)}`);
  };
  const J = async (P, expr) => JSON.parse(await P.evaluate(`JSON.stringify(${expr})`));
  const PICK = "(() => { const d = document.querySelector('[data-topic-pick]'); if (!d) return null; const r = d.getBoundingClientRect(); return { kind: d.dataset.topicPick, on: Number(d.dataset.topicOn), open: d.open, items: d.querySelectorAll('[data-topic-item]').length, off: d.querySelectorAll('.topic-pick-item.off').length, dis: d.querySelectorAll('input[disabled]').length, multi: [...d.querySelectorAll('[data-topic-item]')].filter((x) => x.dataset.topicItem.includes(',')).length, sum: d.querySelector('.topic-pick-sum')?.innerText ?? '', h: Math.round(r.height), bottom: Math.round(r.bottom), over: document.documentElement.scrollWidth - innerWidth, start: document.querySelector('[data-start-btn]')?.disabled ?? null }; })()";
  await realClick(H, 'button[data-mode="liar"]');
  await H.waitFor("document.querySelector('[data-topic-pick]') !== null", 6000).catch(() => false);
  const closed = await J(H, PICK);
  await snap(H, 'liar-closed-pc');
  await H.evaluate("document.querySelector('[data-topic-pick] > summary').click()");
  await sleep(300);
  const opened = await J(H, PICK);
  await snap(H, 'liar-open-pc');
  // 하나 끔
  await H.evaluate("document.querySelector('[data-topic-item] input').click()");
  await sleep(700);
  const oneOff = await J(H, PICK);
  await G.waitFor(`Number(document.querySelector('[data-topic-pick]')?.dataset.topicOn) === ${oneOff.on}`, 5000).catch(() => false);
  await G.evaluate("document.querySelector('[data-topic-pick] > summary')?.click()");
  await sleep(300);
  const guest = await J(G, PICK);
  await snap(G, 'liar-guest-m360');
  // 전부 끔 → 시작 막힘
  await H.evaluate("(() => { const a = document.querySelector('[data-topic-all]'); if (a.checked) a.click(); else { a.click(); } })()");
  await sleep(500);
  await H.evaluate("(() => { const a = document.querySelector('[data-topic-all]'); if (a.checked) a.click(); })()");
  await sleep(700);
  const none = await J(H, PICK);
  await snap(H, 'liar-none-pc');
  await H.evaluate("document.querySelector('[data-topic-all]').click()");
  await sleep(700);
  const allOn = await J(H, PICK);
  await H.send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 864, deviceScaleFactor: 1.25, mobile: false });
  await sleep(400);
  const fhd125 = await J(H, PICK);
  await snap(H, 'liar-open-fhd125');
  await H.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  // 캐치마인드
  await realClick(H, 'button[data-mode="draw"]');
  await H.waitFor("document.querySelector('[data-topic-pick=\"draw\"]') !== null", 6000).catch(() => false);
  await H.evaluate("(() => { const d = document.querySelector('[data-topic-pick]'); if (d && !d.open) d.querySelector('summary').click(); })()");
  await sleep(400);
  const draw = await J(H, PICK);
  await snap(H, 'draw-open-pc');
  note('라이어', { closed, opened, oneOff, guest, none, allOn, fhd125 });
  note('캐치', draw);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r090'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r090'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r090', 'r090.json'), JSON.stringify(rows, null, 1));
  record('★★★ R090 주제 고르기 — 접힘이 기본 · 펼치면 주제 줄(같은 이름 묶음) · 하나 끄면 n-1 · 손님 = 같은 수 · 체크 막힘 · 꺼진 줄 흐림', closed && !closed.open && closed.on >= 1 && opened.open && opened.items >= closed.on && oneOff.on === opened.on - 1 && guest?.on === oneOff.on && guest.dis === guest.items && guest.off >= 1, JSON.stringify({ closed, opened, oneOff, guest }));
  record('★★★ R090 전부 끔 → 머리 "하나 이상 골라 주세요" · 시작 버튼 막힘 → 전부 → 다시 열림', none.on === 0 && /하나 이상/.test(none.sum) && none.start === true && allOn.on === allOn.items && allOn.start === false, JSON.stringify({ none, allOn }));
  record('★★ R090 화면 — 1280 · FHD 125% · m360 넘침 0 · 목록 높이 상한(펼쳐도 260 이하)', [opened, fhd125, guest].every((x) => x && x.over <= 1 && x.h <= 260), JSON.stringify({ opened: [opened.h, opened.over], fhd125: [fhd125.h, fhd125.over], guest: [guest?.h, guest?.over] }));
  record('★★ R090 캐치마인드 — 같은 컴포넌트 · 같은 이름 세트 한 줄(draw-*-2 묶음 ≥ 1)', draw?.kind === 'draw' && draw.items >= 5 && draw.multi >= 1, JSON.stringify(draw));
}

// ★★★ R089 — 캐치마인드 그리기 도구 (D-346) (UICHECK_R089=1 · 묶음 r089 · docs/design/r089)
//   방장 PC 출제(1280 · FHD 125% · 1920) · 손님 m360 터치 · 늦게 온 손님 PC · 소켓 1 · 2라운드(2라운드는 손님 m360 출제)
//   네모(한붓) → 페인트통 안쪽 → 세 화면 격자 해시 같음 · 되돌리기 → 해시가 채우기 전과 같음 · 굵기 · 세부 색 · 최근 색 · 스포이드 버튼 · 세 테마
// =============================================================================
async function r089Flow(browser) {
  const H = await newPage(browser, 'R089-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r9h', '그림방장');
  const roomId = await createRoom(H, 'R089 그리기');
  const G = await newPage(browser, 'R089-g', true);
  await signUp(G, 'r9g', '그림손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'r9s');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r089] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const J = async (P, expr) => JSON.parse(await P.evaluate(`JSON.stringify(${expr})`));
  const hash = (P) => P.evaluate('window.__drawGridHash?.() ?? ""');
  const setPc = (w, h, dpr = 1) => H.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false }).then(() => sleep(400));
  await realClick(H, 'button[data-mode="draw"]');
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('[data-draw-tools]') !== null", 15000).catch(() => false);
  await sleep(500);
  const box = await J(H, "(() => { const r = document.querySelector('[data-draw-canvas]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; })()");
  const at = (fx, fy) => ({ x: box.x + box.w * fx, y: box.y + box.w * fy });
  const mouse = (type, p, buttons = 1) => H.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons, clickCount: 1 });
  // 네모 한붓(굵기 8)
  await realClick(H, '[data-draw-width="8"]');
  const corners = [at(0.2, 0.2), at(0.8, 0.2), at(0.8, 0.8), at(0.2, 0.8), at(0.2, 0.2)];
  await mouse('mousePressed', corners[0]);
  for (let i = 1; i < corners.length; i += 1) {
    const a = corners[i - 1];
    const b = corners[i];
    for (let t = 1; t <= 10; t += 1) await mouse('mouseMoved', { x: a.x + ((b.x - a.x) * t) / 10, y: a.y + ((b.y - a.y) * t) / 10 });
  }
  await mouse('mouseReleased', corners[4], 0);
  await sleep(400);
  // 늦게 온 손님(PC)
  const L = await newPage(browser, 'R089-late', true);
  await L.setViewport(1536, 864);
  await signUp(L, 'r9l', '늦은손님');
  await L.goto(`${BASE}/r/${roomId}`);
  await L.waitFor("document.querySelector('[data-draw-canvas]') !== null", 10000).catch(() => false);
  await sleep(600);
  // 페인트통 — 하늘색 안쪽
  await realClick(H, '[data-draw-tool="fill"]');
  await realClick(H, '[data-draw-color-dot]'); // ★ R095 — 팔레트는 색 점 팝업 안
  await realClick(H, '[data-draw-color="#38bdf8"]');
  const before = await hash(H);
  await mouse('mousePressed', at(0.5, 0.5));
  await mouse('mouseReleased', at(0.5, 0.5), 0);
  await sleep(900);
  const filled = { h: await hash(H), g: await hash(G), l: await hash(L) };
  const inside = await J(H, "(() => { const c = document.querySelector('[data-draw-canvas]'); const d = c.getContext('2d').getImageData(Math.round(c.width / 2), Math.round(c.width / 2), 1, 1).data; return [d[0], d[1], d[2]]; })()");
  await snap(H, 'fill-pc');
  await snap(G, 'fill-guesser-m360');
  await snap(L, 'fill-late-1536');
  // 되돌리기 — 채우기만 빠짐 → 해시 = 채우기 전
  await realClick(H, '[data-draw-undo]');
  await sleep(700);
  const undone = { h: await hash(H), g: await hash(G), l: await hash(L) };
  await snap(H, 'undo-pc');
  // Ctrl+Z — 네모까지
  await H.evaluate('document.activeElement?.blur()');
  await H.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
  await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
  await sleep(700);
  const empty = { h: await hash(H), g: await hash(G), strokes: await H.evaluate("document.querySelector('[data-draw-canvas]')?.dataset.strokes ?? ''") };
  // ★ R090 (D-347) — Ctrl+Y = 네모 다시 · 다시 실행 버튼 = 채우기 다시 · 전체 지우기 → 되돌리기 = 통째로 되살아남 · 세 화면 같음
  await H.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'y', code: 'KeyY', windowsVirtualKeyCode: 89, modifiers: 2 });
  await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'y', code: 'KeyY', windowsVirtualKeyCode: 89, modifiers: 2 });
  await sleep(700);
  const redo1 = { h: await hash(H), g: await hash(G), l: await hash(L) };
  await realClick(H, '[data-draw-redo]');
  await sleep(900);
  const redo2 = { h: await hash(H), g: await hash(G), l: await hash(L), redoOff: await H.evaluate("document.querySelector('[data-draw-redo]')?.disabled ?? null") };
  await realClick(H, '[data-draw-clear]');
  await sleep(700);
  const cleared = { h: await hash(H), g: await hash(G), redoOff: await H.evaluate("document.querySelector('[data-draw-redo]')?.disabled ?? null") };
  await realClick(H, '[data-draw-undo]');
  await sleep(1000);
  const restored = { h: await hash(H), g: await hash(G), l: await hash(L), redoOn: await H.evaluate("document.querySelector('[data-draw-redo]')?.disabled === false") };
  await snap(H, 'redo-restored-pc');
  await snap(G, 'redo-restored-m360');
  // 굵기 · 세부 색 · 최근 · 지우개 · 단축키
  await realClick(H, '[data-draw-color-dot]'); // ★ R095 — 세부 색 · 최근은 색 점 팝업 안
  await sleep(200);
  await H.evaluate(`(() => { const i = document.querySelector('[data-draw-custom]'); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, '#123456'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
  const custom = await J(H, "({ recent: [...document.querySelectorAll('[data-draw-recent]')].map((b) => b.dataset.drawRecent), value: document.querySelector('[data-draw-custom]')?.value ?? '' })");
  await H.key('e');
  await sleep(200);
  await H.key(']');
  await sleep(200);
  const eraser = await J(H, "({ tool: document.querySelector('[data-draw-tools]')?.dataset.tool ?? '', w: document.querySelector('.draw-width.on')?.dataset.drawWidth ?? '' })");
  await H.key('p');
  await sleep(200);
  const pen = await J(H, "({ tool: document.querySelector('[data-draw-tools]')?.dataset.tool ?? '', w: document.querySelector('.draw-width.on')?.dataset.drawWidth ?? '' })");
  const eye = await H.evaluate("document.querySelector('[data-draw-tool=\"pick\"]')?.dataset.eyedropper ?? ''");
  // 크기 셋 · 세 테마
  const sizes = {};
  for (const [n, w, h, dpr] of [['pc', 1280, 720, 1], ['fhd125', 1536, 864, 1.25], ['fhd', 1920, 1080, 1]]) {
    await setPc(w, h, dpr);
    sizes[n] = await J(H, "(() => { const t = [...document.querySelectorAll('[data-draw-tools] button, [data-draw-tools] label')]; const c = document.querySelector('[data-draw-canvas]').getBoundingClientRect(); return { side: Math.round(c.width), toolsIn: t.every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; }), over: document.documentElement.scrollWidth - innerWidth, n: t.length }; })()");
    await snap(H, `tools-${n}`);
  }
  await setPc(1280, 720);
  for (const th of ['night', 'office']) {
    await theme(H, th);
    await sleep(200);
    await snap(H, `tools-${th}-pc`);
  }
  await theme(H, 'pastel');
  // 1라운드 끝 — 정답
  const kw = await H.evaluate("document.querySelector('[data-draw-keyword]')?.innerText ?? ''");
  for (const P of [G, L]) {
    await P.setInput('.chat-card input', kw);
    await P.click('전송');
  }
  S.emit('chat.send', { text: kw, epoch: null });
  // 2라운드 — 손님(m360) 출제
  await G.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null && !!document.querySelector('[data-draw-tools]')", 20000).catch(() => false);
  await sleep(500);
  const mob = await J(G, "(() => { const t = [...document.querySelectorAll('[data-draw-tools] button, [data-draw-tools] label')]; return { n: t.length, inX: t.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }), over: document.documentElement.scrollWidth - innerWidth, eye: document.querySelector('[data-draw-tool=\"pick\"]')?.dataset.eyedropper ?? '' }; })()");
  await snap(G, 'tools-drawer-m360');
  await theme(G, 'office');
  await sleep(200);
  await snap(G, 'tools-drawer-office-m360');
  await theme(G, 'pastel');
  const kw2 = await G.evaluate("document.querySelector('[data-draw-keyword]')?.innerText ?? ''");
  for (const P of [H, L]) {
    await P.setInput('.chat-card input', kw2);
    await P.click('전송');
  }
  S.emit('chat.send', { text: kw2, epoch: null });
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  note('채우기', { before, filled, inside });
  note('되돌리기', { undone, empty });
  note('도구', { custom, eraser, pen, eye, sizes, mob });
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r089'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r089'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r089', 'r089.json'), JSON.stringify(rows, null, 1));
  record('★★★ R089 페인트통 — 네모 안이 하늘색 · 세 화면(방장 PC · 손님 m360 · 늦게 온 1536) 격자 해시 같음', !!filled.h && filled.h === filled.g && filled.h === filled.l && filled.h !== before && Math.abs(inside[0] - 0x38) < 20 && Math.abs(inside[2] - 0xf8) < 20, JSON.stringify({ before, filled, inside }));
  record('★★★ R089 되돌리기 — 버튼 = 채우기만 빠짐(해시 = 채우기 전 · 세 화면 같음) · Ctrl+Z = 네모까지(빈 판)', undone.h === before && undone.g === before && undone.l === before && empty.strokes === '0' && empty.h === empty.g, JSON.stringify({ undone, before, empty }));
  record(
    '★★★ R090 다시 실행 — Ctrl+Y = 네모(해시 = 채우기 전) · 버튼 = 채우기(해시 = 채운 뒤 · 할 것 없으면 흐림) · 전체 지우기 = 빈 판(다시 실행 흐림) → 되돌리기 = 통째로 되살아남 · 세 화면 같음',
    redo1.h === before && redo1.g === before && redo1.l === before && redo2.h === filled.h && redo2.g === filled.h && redo2.l === filled.h && redo2.redoOff === true && cleared.h === empty.h && cleared.g === empty.h && cleared.redoOff === true && restored.h === filled.h && restored.g === filled.h && restored.l === filled.h && restored.redoOn,
    JSON.stringify({ before, filled, redo1, redo2, cleared, restored }),
  );
  record('★★ R089 세부 색 → 최근 색 · E(지우개) · ](굵게) · P(펜 — 굵기 따로) · 스포이드 버튼', custom.recent[0] === '#123456' && eraser.tool === 'eraser' && pen.tool === 'pen' && eraser.w !== '' && pen.w !== '' && eraser.w !== pen.w && ['system', 'canvas'].includes(eye), JSON.stringify({ custom, eraser, pen, eye }));
  // ★ R095 — 팔레트 12 · 세부 색 · 최근은 색 점 팝업 안이라 닫힌 도구 띠 버튼 수는 16(옛 기준 20 → 12)
  record('★★★ R089 도구 띠 — PC 1280 · FHD 125% · FHD 도구 화면 안 · 넘침 0 · 모바일 출제 도구 가로 화면 안(줄 바꿈) · 넘침 0', Object.values(sizes).every((m) => m.toolsIn && m.over <= 1) && mob.n >= 12 && mob.inX && mob.over <= 1, JSON.stringify({ sizes, mob }));
  S.close();
  H.close();
  G.close();
  L.close();
}

// =============================================================================
// ★★★ R091 — 라이어 맞히기 이의제기 화면 (D-348) (UICHECK_R091=1 · 묶음 r091 · docs/design/r091)
//   방장 PC 1280(+ FHD 125% = 1536×864 @1.25) · 손님 m360 터치 · 소켓 손님 1(3명) · 기본형 3라운드(라이어가 셋 다 한 번씩)
//   라운드마다: 다 같이 라이어 지목 → 죽인다 → 라이어가 일부러 틀림 → [이의제기] → 화면 두 사람 [인정] · 소켓 손님 [기각]
//   → 소켓 손님이 라이어인 판 = 2 : 0 인정 · 화면 사람이 라이어인 판 = 1 : 1 기각
//   본다: 라이어 화면에만 버튼(+ 한 줄) · 투표 화면(라이어의 답 · 키워드 · 두 버튼 · PC · FHD 125% · m360) · 공개 줄(인정 · 기각) · 넘침 0
// =============================================================================
async function r091Flow(browser) {
  const H = await newPage(browser, 'R091-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r91h', '이의방장');
  const roomId = await createRoom(H, 'R091 이의제기');
  const G = await newPage(browser, 'R091-g', true);
  await signUp(G, 'r91g', '이의손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'r91s');
  const idOfLogin = async (l) => (await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_${l}`.toLowerCase()])).rows[0]?.id)) ?? null;
  const ids = { h: await idOfLogin('r91h'), g: await idOfLogin('r91g'), s: await idOfLogin('r91s0') };
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r091] ${k}: ${JSON.stringify(v)}`);
  };
  const J = async (P, expr) => JSON.parse(await P.evaluate(`JSON.stringify(${expr})`));
  const set125 = () => H.send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 864, deviceScaleFactor: 1.25, mobile: false }).then(() => sleep(380));
  const set1280 = () => H.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }).then(() => sleep(380));
  let sView = null;
  const did = new Set();
  // 소켓 손님: 설명 · 지목(라이어) · 죽인다 · 틀린 답 · 이의제기 · 기각
  S.on('liar.state', (p) => {
    const v = p.liar;
    sView = v;
    if (!v) return;
    const k = `${v.round}:${v.phase}:${v.phaseStartedAt}:${v.turn}`;
    if (did.has(k)) return;
    did.add(k);
    setTimeout(() => {
      if ((v.phase === 'describe' || v.phase === 'defense') && v.turn === ids.s) S.emit('liar.say', { text: v.phase === 'defense' ? '저는 아니에요' : '자주 봐요' });
      else if (v.phase === 'final' && v.accused !== ids.s) S.emit('liar.final', { yes: true });
      else if (v.phase === 'discuss') S.emit('liar.discussEnd', {}); // ★ R101
      else if (v.phase === 'guess' && v.amLiar) S.emit('liar.guess', { text: '모르겠다' });
      else if (v.phase === 'appeal' && v.amLiar) S.emit('liar.appeal', {});
      else if (v.phase === 'appealVote' && !v.amLiar) S.emit('liar.appealVote', { yes: false });
    }, 900);
  });
  // ── 설정: 라이어 · 3라운드
  await realClick(H, 'button[data-mode="liar"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000).catch(() => false);
  await H.setInput('.mg-rounds-input', '3');
  await sleep(500);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const res = { btn: [], wait: [], vote: [], reveal: [] };
  const seen = new Set();
  const liarOf = {};
  const t0 = Date.now();
  const SCREEN = "({ phase: document.querySelector('[data-liar-phase]')?.dataset.liarPhase ?? '', btn: !!document.querySelector('[data-liar-appeal-btn]'), hint: document.querySelector('.liar-appeal-me')?.innerText ?? '', appeal: document.querySelector('[data-liar-appeal]')?.innerText ?? '', vote: document.querySelector('[data-liar-appeal-vote]')?.innerText ?? '', yesNo: !!document.querySelector('[data-liar-appeal-yes]') && !!document.querySelector('[data-liar-appeal-no]'), line: document.querySelector('[data-liar-appeal-result]')?.dataset.liarAppealResult ?? '', lineText: document.querySelector('[data-liar-appeal-result]')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth })";
  while (Date.now() - t0 < 360000) {
    const st = await H.evaluate("(() => { const c = document.querySelector('[data-liar-phase]'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; return `${c.dataset.liarPhase}:${document.querySelector('.liar-round')?.innerText ?? ''}:${document.querySelector('[data-liar-turn=\"1\"] .liar-nick')?.innerText ?? ''}:${c.dataset.liarBout}`; })()");
    if (st === 'result') break;
    if (!st || seen.has(st)) {
      await sleep(150);
      continue;
    }
    seen.add(st);
    const [phase, roundTxt] = st.split(':');
    const round = Number((roundTxt ?? '').split('/')[0]);
    if (!liarOf[round] && (phase === 'describe' || phase === 'vote')) {
      const hMe = await H.evaluate("document.querySelector('[data-liar-me]')?.dataset.liarMe ?? ''");
      const gMe = await G.evaluate("document.querySelector('[data-liar-me]')?.dataset.liarMe ?? ''");
      liarOf[round] = hMe === 'liar' ? 'h' : gMe === 'liar' ? 'g' : sView?.amLiar ? 's' : null;
    }
    if (phase === 'describe' || phase === 'defense') {
      for (const P of [H, G]) {
        if (await P.evaluate("!!document.querySelector('[data-liar-say-input]')")) {
          await P.setInput('[data-liar-say-input]', phase === 'defense' ? '아니라니까요' : '자주 봐요');
          await P.evaluate("document.querySelector('[data-liar-say-form]')?.requestSubmit()");
        }
      }
    }
    if (phase === 'vote' || phase === 'revote') {
      await sleep(300);
      const L = liarOf[round];
      const tgt = (who) => ids[L === who ? (who === 'h' ? 'g' : 'h') : L];
      if (L) {
        await realClick(H, `[data-liar-target="${tgt('h')}"]`).catch(() => {});
        await tapOn(G, `[data-liar-target="${tgt('g')}"]`).catch(() => {});
        S.emit('liar.vote', { target: L === 's' ? ids.h : ids[L] });
      }
    }
    if (phase === 'discuss') {
      // ★ R101 — 자유 토론: 두 화면도 [토론 끝](과반이면 바로 투표)
      await sleep(250);
      await realClick(H, '[data-liar-discuss-end]').catch(() => {});
      await tapOn(G, '[data-liar-discuss-end]').catch(() => {});
    }
    if (phase === 'final') {
      await sleep(200);
      await realClick(H, '[data-liar-yes]').catch(() => {});
      await tapOn(G, '[data-liar-yes]').catch(() => {});
    }
    if (phase === 'guess') {
      for (const P of [H, G]) {
        if (await P.evaluate("!!document.querySelector('[data-liar-guess-input]')")) {
          await P.setInput('[data-liar-guess-input]', '모르겠다');
          await P.evaluate("document.querySelector('[data-liar-guess] form')?.requestSubmit()");
        }
      }
    }
    if (phase === 'appeal') {
      await sleep(300);
      const L = liarOf[round];
      const h = await J(H, SCREEN);
      const g = await J(G, SCREEN);
      note(`R${round} 이의제기 단계(라이어 ${L})`, { h, g });
      const liarP = L === 'h' ? H : L === 'g' ? G : null;
      if (liarP) {
        res.btn.push({ round, who: L, liar: L === 'h' ? h : g, other: L === 'h' ? g : h });
        await snap(liarP, `appeal-btn-${L === 'h' ? 'pc' : 'm360'}`);
        if (L === 'h') {
          await set125();
          await snap(H, 'appeal-btn-fhd125');
          await set1280();
        }
        if (L === 'h') await realClick(H, '[data-liar-appeal-btn]').catch(() => {});
        else await tapOn(G, '[data-liar-appeal-btn]').catch(() => {});
      } else {
        res.wait.push({ round, h, g });
        await snap(H, 'appeal-wait-pc');
      }
    }
    if (phase === 'appealVote') {
      await sleep(300);
      const L = liarOf[round];
      const h = await J(H, SCREEN);
      const g = await J(G, SCREEN);
      res.vote.push({ round, liar: L, h, g });
      if (L !== 'h') await snap(H, `appeal-vote-pc-r${round}`);
      if (L !== 'g') await snap(G, `appeal-vote-m360-r${round}`);
      if (L !== 'h') {
        await set125();
        await snap(H, `appeal-vote-fhd125-r${round}`);
        await set1280();
      }
      if (L === 'h' || L === 'g') await snap(L === 'h' ? H : G, `appeal-vote-liar-${L === 'h' ? 'pc' : 'm360'}`);
      if (L !== 'h') await realClick(H, '[data-liar-appeal-yes]').catch(() => {});
      if (L !== 'g') await tapOn(G, '[data-liar-appeal-yes]').catch(() => {});
    }
    if (phase === 'reveal') {
      await sleep(300);
      const h = await J(H, SCREEN);
      const g = await J(G, SCREEN);
      res.reveal.push({ round, liar: liarOf[round], h, g });
      await snap(H, `reveal-appeal-pc-r${round}`);
      await snap(G, `reveal-appeal-m360-r${round}`);
    }
    await sleep(100);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  note('결과', res);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r091'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r091'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r091', 'r091.json'), JSON.stringify(rows, null, 1));
  record('★★★ R091 이의제기 버튼 — 라이어 화면에만(+ "오타 · 같은 뜻이면") · 다른 화면엔 "정하는 중" · 넘침 0', res.btn.length >= 1 && res.btn.every((x) => x.liar.btn && /오타/.test(x.liar.hint) && !x.other.btn && /정하는 중/.test(x.other.appeal) && x.liar.over <= 1 && x.other.over <= 1), JSON.stringify(res.btn));
  const pv = res.vote.filter((x) => x.liar !== 'h').map((x) => x.h);
  const mv = res.vote.filter((x) => x.liar !== 'g').map((x) => x.g);
  record('★★★ R091 투표 화면 — 라이어의 답 · 키워드 · 인정/기각 두 버튼 · PC 1280 · m360 · 넘침 0', pv.length >= 1 && mv.length >= 1 && [...pv, ...mv].every((x) => /모르겠다/.test(x.vote) && /키워드/.test(x.vote) && x.yesNo && x.over <= 1), JSON.stringify(res.vote));
  record('★★ R091 투표 중 라이어 화면 — 버튼 없이 "정하는 중"', res.vote.filter((x) => x.liar === 'h' || x.liar === 'g').every((x) => { const me = x.liar === 'h' ? x.h : x.g; return !me.yesNo && /정하는 중/.test(me.vote); }), JSON.stringify(res.vote));
  const lines = res.reveal.map((x) => [x.liar, x.h.line, x.g.line]);
  record('★★★ R091 공개 줄 — 소켓 라이어 판 "인정(2 : 0)" · 화면 라이어 판 "기각(1 : 1)" · 두 화면 같음', res.reveal.length === 3 && res.reveal.every((x) => x.h.line === x.g.line && x.h.line === (x.liar === 's' ? 'passed' : 'rejected') && /이의제기 (인정\(2 : 0\)|기각\(1 : 1\))/.test(x.h.lineText)), JSON.stringify(lines));
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R093 — 실전 제보 화면 셋 (D-350 · #120 · #121) (UICHECK_R093=1 · 묶음 r093 · docs/design/r093)
//   방장 PC(제보 2560×1313 + 1280×720) · 손님 m360 터치 · 소켓 손님 1 — 미니게임만 1개(순서대로 1판)
//   ① 로비 방식 줄 — 팀전 앞 세로 선 없음(여백만) ② 순서대로 카드 — 보기 글이 카드 한가운데(번호 전 · 후) ③ 결과 내 줄 — 테두리가 목록 안(잘림 0)
// =============================================================================
async function r093Flow(browser) {
  const H = await newPage(browser, 'R093-host', true);
  await H.setViewport(2560, 1313);
  await signUp(H, 'r93h', '제보방장');
  const roomId = await createRoom(H, 'R093 제보');
  const G = await newPage(browser, 'R093-g', true);
  await signUp(G, 'r93g', '제보손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'r93s');
  const rows = [];
  const res = {};
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r093] ${k}: ${JSON.stringify(v)}`);
  };
  const SEP = `JSON.stringify((() => { const s = document.querySelector('.team-sep'); const t = document.querySelector('[data-team-toggle]'); const d = document.querySelector('button[data-mode="draw"]'); if (!s || !t || !d) return null; const cs = getComputedStyle(s); return { bg: cs.backgroundColor, img: cs.backgroundImage, border: cs.borderLeftStyle + cs.borderRightStyle, gap: Math.round(t.getBoundingClientRect().left - d.getBoundingClientRect().right), over: document.documentElement.scrollWidth - innerWidth }; })())`;
  const sepOk = (x) => !!x && /rgba\(0, 0, 0, 0\)|transparent/.test(x.bg) && x.img === 'none' && !/solid|dashed|dotted/.test(x.border) && x.gap >= 12 && x.over <= 1;
  for (const [n, w, h] of [['pc2560', 2560, 1313], ['pc1280', 1280, 720]]) {
    await H.setViewport(w, h);
    await sleep(400);
    res[`sep-${n}`] = JSON.parse(await H.evaluate(SEP));
    await snapClip(H, `lobby-mode-${n}`, '.mode-row');
  }
  await H.setViewport(2560, 1313);
  note('방식 줄', { pc2560: res['sep-pc2560'], pc1280: res['sep-pc1280'] });

  const CARDS = `JSON.stringify([...document.querySelectorAll('[data-order-card]')].map((b) => { const r = b.getBoundingClientRect(); const l = b.querySelector('.order-label').getBoundingClientRect(); return { dy: Math.round((l.top + l.height / 2) - (r.top + r.height / 2)), dx: Math.round((l.left + l.width / 2) - (r.left + r.width / 2)), w: Math.round(r.width), at: b.dataset.orderAt }; }))`;
  const centred = (a) => Array.isArray(a) && a.length >= 3 && a.every((c) => Math.abs(c.dy) <= 3 && Math.abs(c.dx) <= 3) && new Set(a.map((c) => c.w)).size === 1;
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '1');
  await sleep(300);
  await selectMinigames(H, ['order']);
  await sleep(300);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const playing = await H.waitFor("document.querySelector('[data-order-card]:not(:disabled)') !== null", 120000).catch(() => false);
  if (playing) {
    await G.waitFor("document.querySelector('[data-order-card]') !== null", 8000).catch(() => false);
    res.cardsPc0 = JSON.parse(await H.evaluate(CARDS));
    await snapClip(H, 'order-cards-pc2560-0', '.order-cards');
    for (let i = 0; i < 2; i += 1) await H.evaluate(`[...document.querySelectorAll('[data-order-card]')].filter((b) => !b.classList.contains('picked'))[0]?.click()`);
    await sleep(300);
    res.cardsPc2 = JSON.parse(await H.evaluate(CARDS));
    await snapClip(H, 'order-cards-pc2560-2', '.order-cards');
    res.cardsM360 = JSON.parse(await G.evaluate(CARDS));
    await snapClip(G, 'order-cards-m360', '.order-cards');
    note('순서대로 카드', { pc0: res.cardsPc0, pc2: res.cardsPc2, m360: res.cardsM360 });
  }
  await H.waitFor("document.querySelector('.room-result .ranking li.mine') !== null", 180000).catch(() => false);
  await G.waitFor("document.querySelector('.room-result .ranking li.mine') !== null", 10000).catch(() => false);
  await sleep(800);
  const MINE = `JSON.stringify((() => { const li = document.querySelector('.room-result .ranking li.mine'); if (!li) return null; const ol = li.closest('.ranking'); const cs = getComputedStyle(li); const ow = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset || '0'); const r = li.getBoundingClientRect(); const o = ol.getBoundingClientRect(); const ocs = getComputedStyle(ol); const clips = ocs.overflowX !== 'visible' || ocs.overflowY !== 'visible'; const cut = clips ? Math.max(0, o.left - (r.left - ow), (r.right + ow) - o.right, o.top - (r.top - ow)) : 0; return { outline: cs.outlineStyle, shadow: /inset/.test(cs.boxShadow), cut: Math.round(cut * 10) / 10, clips, over: document.documentElement.scrollWidth - innerWidth }; })())`;
  for (const [n, w, h] of [['pc2560', 2560, 1313], ['pc1280', 1280, 720]]) {
    await H.setViewport(w, h);
    await sleep(450);
    res[`mine-${n}`] = JSON.parse(await H.evaluate(MINE));
    await snapClip(H, `result-mine-${n}`, '.room-result .ranking');
  }
  res['mine-m360'] = JSON.parse(await G.evaluate(MINE));
  await snapClip(G, 'result-mine-m360', '.room-result .ranking');
  note('결과 내 줄', { pc2560: res['mine-pc2560'], pc1280: res['mine-pc1280'], m360: res['mine-m360'] });
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r093'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r093'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r093', 'r093.json'), JSON.stringify(rows, null, 1));
  record('★★★ R093 로비 방식 줄 — 팀전 앞 세로 선 없음(여백 ≥ 12px) · 2560 · 1280 · 넘침 0', sepOk(res['sep-pc2560']) && sepOk(res['sep-pc1280']), JSON.stringify([res['sep-pc2560'], res['sep-pc1280']]));
  record('★★★ R093 순서대로 카드 — 보기 글이 카드 한가운데(±3px · 번호 전 · 후 · PC 2560 · m360) · 카드 폭 같음', centred(res.cardsPc0) && centred(res.cardsPc2) && centred(res.cardsM360), JSON.stringify({ pc0: res.cardsPc0, pc2: res.cardsPc2, m360: res.cardsM360 }));
  record('★★★ R093 결과 내 줄 — 안쪽 그림자 · 바깥 outline 없음 · 목록 가장자리 잘림 0 · 2560 · 1280 · m360', ['pc2560', 'pc1280', 'm360'].every((n) => { const x = res[`mine-${n}`]; return x && x.outline === 'none' && x.shadow && x.cut === 0 && x.over <= 1; }), JSON.stringify([res['mine-pc2560'], res['mine-pc1280'], res['mine-m360']]));
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R094 — 실전 제보 화면 셋 2차 (D-351 · #123 · #124 · #125) (UICHECK_R094=1 · 묶음 r094 · docs/design/r094)
//   ① 번개손 결과 "나 · 퀵드로우 — 가짜 신호 1번" — 실험실 장면(/lab/minigame reaction roundResult) · 2560 · 1280 · m360 — 칸 밖 넘침 0
//   ② 숫자 정답 초성 힌트 "____" 옆 "숫자 4자리" — 검사 DB 에서 숫자 정답 한 문제 + 긴 문제 하나만 잠깐 활성(끝나면 되돌림)
//   ③ 문제 칸 · 채팅 칸 크기(2560 · 1280 · FHD 125%) — 전 · 후 숫자
// =============================================================================
const R094_RX = `JSON.stringify((() => { const box = document.querySelector('.rx-result'); if (!box) return null; const cell = box.getBoundingClientRect(); const ps = [...box.querySelectorAll('p')].map((p) => { const r = p.getBoundingClientRect(); return { t: p.innerText.replace(/\\n/g, ' / '), sw: p.scrollWidth, cw: p.clientWidth, l: Math.round(r.left - cell.left), r: Math.round(cell.right - r.right) }; }); const out = ps.some((p) => p.sw > p.cw + 1 || p.l < -1 || p.r < -1); return { w: Math.round(cell.width), ps, out, over: document.documentElement.scrollWidth - innerWidth }; })())`;
const R094_Q = `JSON.stringify((() => { const q = document.querySelector('.q-text'); const card = document.querySelector('.question-card'); const chat = document.querySelector('.room .chat-card'); const center = document.querySelector('.center'); const hint = [...document.querySelectorAll('.q-hint.open')].pop(); if (!q || !card) return null; const cs = getComputedStyle(q); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45; const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }; return { len: [...(q.dataset.text ?? q.innerText)].length, fs: cs.fontSize, lines: Math.round(q.getBoundingClientRect().height / lh), card: R(card), chat: R(chat), center: R(center), hint: hint ? hint.innerText.replace(/\\s+/g, ' ').trim() : '', kind: document.querySelector('.hint-kind')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth }; })())`;
// =============================================================================
// ★★★ R101 — 화면 스크롤 0 · 채팅 줄 수 · 내용 잘림 (UICHECK_R101=1 · 묶음 r101 · docs/design/r101 · 고치기 전 = SHOT_DIR r101-before)
//   찬종 2026-11-13: "노래 맞히기 할때 채팅창이 너무 작다. 정답공개할때 125% fhd 에서는 스크롤도 생김. 다른 화면도 마찬가지."
//     폼: "채팅이 최소 5개? 적절한 라인은 최소한 보여주도록 … 어떠한 경우에도 화면에 스크롤이 생기면 안돼."
//   방장 PC(H) · 손님 m360(G · 터치) · 소켓 손님 3 — 로비 · 설정(라이어 · 노래) · 퀴즈 문제 / 힌트 / 공개 / 결과 · 노래 듣는 중 / 정답 공개 / 결과 ·
//   미니게임 판 / 공개 · 라이어 설명 / 토론 / 투표 / 변론 / 죽일까 / 공개 · 캐치마인드 그리는 중 / 맞히는 중 / 공개 · 판 결과
//   화면마다 창 6 크기(R101_SIZES) — ① 페이지 스크롤 0(세로 · 가로) ② 채팅 보이는 줄 ≥ 6(입력칸 뺀 목록 높이 ÷ 한 줄) ③ 판 안 내용이 판 밖 · 화면 밖으로 안 나감
//   + m360 은 페이지 스크롤만 적는다(고치지 않음 — 이번 제보는 PC) · 1536×730 그림 한 장씩
// =============================================================================
const R101_SIZES = [
  { w: 1536, h: 864, dsf: 1.25, n: '1536x864' },
  { w: 1536, h: 730, dsf: 1.25, n: '1536x730' },
  { w: 1920, h: 1080, dsf: 1, n: '1920x1080' },
  { w: 1920, h: 945, dsf: 1, n: '1920x945' },
  { w: 1280, h: 720, dsf: 1, n: '1280x720' },
  { w: 2560, h: 1440, dsf: 1, n: '2560x1440' },
];
const R101_MIN_LINES = 6;
const R101_FIT = `JSON.stringify((() => {
  const se = document.scrollingElement || document.documentElement;
  const out = { sy: se.scrollHeight - innerHeight, sx: se.scrollWidth - innerWidth };
  const log = document.querySelector('.room .chat-log');
  if (log) {
    const cs = getComputedStyle(log);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const probe = document.createElement('p');
    probe.className = 'chat-line';
    probe.style.cssText = 'visibility:hidden;position:absolute;left:0;top:0;animation:none';
    probe.textContent = '가';
    log.appendChild(probe);
    const pc = getComputedStyle(probe);
    const lineH = probe.getBoundingClientRect().height + parseFloat(pc.marginBottom || '0');
    probe.remove();
    out.lineH = Math.round(lineH * 10) / 10;
    out.logH = Math.round(log.clientHeight - pad);
    out.lines = Math.floor(((log.clientHeight - pad) / lineH) * 10) / 10;
    const card = log.closest('.chat-card');
    const r = card.getBoundingClientRect();
    out.chatW = Math.round(r.width);
    out.chatH = Math.round(r.height);
    const inp = card.querySelector('input');
    if (inp) out.inputIn = Math.round(innerHeight - inp.getBoundingClientRect().bottom);
  }
  const main = document.querySelector('.room .center-main');
  if (main) {
    const r = main.getBoundingClientRect();
    out.mainH = Math.round(r.height);
    out.mainW = Math.round(r.width);
    const clip = [];
    for (const el of main.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      if (el.closest('.draw-color-pop, .emoji-pop, .info-pop, [role=dialog], .tip-pop, .confetti')) continue;
      if (el.closest('details:not([open])') && !el.closest('summary')) continue; // 접힌 묶음(주제 고르기) 속은 그려지지 않는다
      let sc = el.parentElement;
      let inScroller = false;
      while (sc && sc !== main) {
        // 스크롤 목록 안쪽만 뺀다 — overflow hidden 은 내용을 숨기는 것이라 잘림으로 센다(첫 실행이 노래 공개 상자 숨김을 놓쳤다)
        if (/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) { inScroller = true; break; }
        sc = sc.parentElement;
      }
      if (inScroller) continue;
      let hid = el.parentElement;
      let hiddenCut = false;
      while (hid && hid !== main) {
        if (getComputedStyle(hid).overflowY === 'hidden' && b.bottom > hid.getBoundingClientRect().bottom + 2) { hiddenCut = true; break; }
        hid = hid.parentElement;
      }
      if (hiddenCut || b.bottom > innerHeight + 1 || b.bottom > r.bottom + 2) clip.push(String(el.className || el.tagName).split(' ')[0] + ':' + Math.round(b.bottom - Math.min(innerHeight, r.bottom)));
    }
    out.clip = clip.slice(0, 4);
    out.clipN = clip.length;
  }
  const media = document.querySelector('[data-song-cover], .draw-canvas, .center-main .photo-frame, .center-main .img-wrap img, .center-main .quiz-img');
  if (media) {
    const b = media.getBoundingClientRect();
    out.media = Math.round(b.width) + 'x' + Math.round(b.height);
  }
  return out;
})())`;

async function r101Flow(browser) {
  const DIR = process.env.SHOT_DIR ?? 'r101';
  const H = await newPage(browser, 'R101-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r101h', '스크롤방장');
  const roomId = await createRoom(H, 'R101 스크롤 0');
  const G = await newPage(browser, 'R101-g', true);
  await signUp(G, 'r101g', '폰손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const socks = await socketGuests(roomId, 3, 'r101s');
  const ids = await Promise.all(socks.map(async (_, i) => (await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_r101s${i}`.toLowerCase()])).rows[0]?.id)) ?? null));
  for (const [i, s] of socks.entries()) s.__id = ids[i];
  const table = [];
  const mobile = [];
  const setSize = async (s) => {
    await H.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dsf, mobile: false });
    await sleep(320);
  };
  /** 화면 하나 — 여섯 크기 · 1536×730 그림 · m360 페이지 스크롤 */
  const fit = async (screen) => {
    for (const s of R101_SIZES) {
      await setSize(s);
      const m = JSON.parse(await H.evaluate(R101_FIT));
      const ok = m.sy <= 0 && m.sx <= 0 && (m.lines ?? 99) >= R101_MIN_LINES && (m.clipN ?? 0) === 0;
      table.push({ screen, size: s.n, ok, ...m });
      if (s.n === '1536x730') await snap(H, `${screen}-1536x730`);
      if (s.n === '1920x945') await snap(H, `${screen}-1920x945`);
    }
    await setSize({ w: 1280, h: 720, dsf: 1 });
    const g = JSON.parse(await G.evaluate("JSON.stringify((() => { const se = document.scrollingElement || document.documentElement; return { sy: se.scrollHeight - innerHeight, sx: se.scrollWidth - innerWidth }; })())"));
    mobile.push({ screen, ...g });
    const row = table.filter((t) => t.screen === screen);
    console.log(`  [r101] ${screen}: ${row.map((t) => `${t.size} ${t.ok ? 'OK' : 'NG'}(sy ${t.sy} · ${t.lines}줄 · 잘림 ${t.clipN ?? 0})`).join(' | ')} · m360 sy ${g.sy}`);
  };
  const say = async (P, t) => {
    await P.setInput('.chat-card input', t);
    await P.click('전송');
    await sleep(200);
  };
  const skipAll = async (epoch) => {
    for (const s of socks) s.emit('skip.vote', { vote: true, epoch });
    await realClick(H, '.skip-btn').catch(() => {});
    await tapOn(G, '.skip-btn').catch(() => {});
  };
  const toLobby = async () => {
    await H.waitFor("document.querySelector('.ranking') !== null || document.querySelector('.lobby-card') !== null", 60000).catch(() => false);
    // 결과 버튼 줄이 늦게 그려질 수 있다 — 로비가 보일 때까지 몇 번
    for (let i = 0; i < 8 && !(await H.evaluate("!!document.querySelector('.lobby-card')")); i += 1) {
      await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim().endsWith('로비로'))?.click()");
      await H.waitFor("document.querySelector('.lobby-card') !== null", 3000).catch(() => false);
    }
    await sleep(500);
  };
  const start = async () => {
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  };
  // ── 채팅 채움(목록이 차 있어야 줄 수가 그림으로 보인다)
  await chatLines(socks, 10);
  await sleep(600);
  // ── 로비 · 설정
  await fit('lobby');
  await realClick(H, 'button[data-mode="liar"]');
  await sleep(600);
  await fit('settings-liar');
  await realClick(H, 'button[data-mode="song"]');
  await H.waitFor("document.querySelector('[data-song-avail]')?.innerText.includes('곡 ·')", 6000).catch(() => false);
  await sleep(400);
  await fit('settings-song');

  // ── 퀴즈 2문제: 문제 · 힌트 · 공개 · 결과
  await realClick(H, 'button[data-mode="quiz"]');
  await sleep(400);
  await H.setInput('.count-input', '2');
  await sleep(600);
  let qEpoch = null;
  for (const s of socks) s.on('question.started', (p) => (qEpoch = p.epoch ?? qEpoch));
  await start();
  await H.waitFor("document.querySelector('.question-card') !== null", 15000).catch(() => false);
  await sleep(800);
  await fit('quiz-question');
  // 힌트가 있는 문제면 열릴 때까지(남은 30초 · 15초) · 없으면 문제 화면 그대로(힌트 줄 "없음")
  await H.waitFor("document.querySelector('.q-hint.open') !== null || !document.querySelector('.question-card')", 45000).catch(() => false);
  await sleep(400);
  await fit('quiz-hint');
  await skipAll(qEpoch);
  await H.waitFor("document.querySelector('.reveal') !== null", 8000).catch(() => false);
  await sleep(900);
  await fit('quiz-reveal');
  await H.waitFor("document.querySelector('.reveal') === null && document.querySelector('.question-card') !== null", 20000).catch(() => false);
  await sleep(500);
  await skipAll(qEpoch);
  await H.waitFor("document.querySelector('.ranking') !== null", 40000).catch(() => false);
  await sleep(900);
  await fit('quiz-result');
  await toLobby();

  // ── 노래 5곡: 듣는 중 · 정답 공개 · 결과
  await realClick(H, 'button[data-mode="song"]');
  await H.waitFor("document.querySelector('[data-song-count]') !== null", 4000).catch(() => false);
  await realClick(H, '[data-song-count-preset="5"]').catch(() => {});
  await sleep(500);
  let sQ = null;
  socks[0].on('question.started', (p) => (sQ = p));
  await start();
  await H.waitFor("document.querySelector('[data-song-cover]') !== null", 15000).catch(() => false);
  await sleep(1200);
  await fit('song-play');
  const it = sQ ? await withPg(async (c) => (await c.query(`SELECT payload FROM minigame_items WHERE item_id = $1`, [sQ.questionId])).rows[0]?.payload ?? null) : null;
  await say(H, it?.title ?? '모름');
  await H.waitFor("document.querySelector('.reveal') !== null", 6000).catch(() => false);
  await sleep(1600);
  await chatLines(socks, 3);
  await fit('song-reveal');
  for (let i = 0; i < 4; i += 1) {
    await H.waitFor("document.querySelector('.reveal') === null && document.querySelector('[data-song-cover]') !== null", 20000).catch(() => false);
    await sleep(300);
    await skipAll(sQ?.epoch);
    await H.waitFor("document.querySelector('.reveal') !== null || document.querySelector('.ranking') !== null", 8000).catch(() => false);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  await sleep(900);
  await fit('song-result');
  await toLobby();

  // ── 미니게임만 1판: 판 · 공개
  await realClick(H, 'button[data-mode="minigame"]');
  await sleep(500);
  await H.setInput('.mg-rounds-input', '2').catch(() => {});
  await sleep(500);
  await start();
  await H.waitFor("document.querySelector('.mg-card') !== null", 15000).catch(() => false);
  await sleep(1500);
  await fit('minigame-board');
  await H.waitFor("document.querySelector('.mg-card[data-phase=\"roundResult\"], .mg-card[data-phase=\"final\"]') !== null", 90000).catch(() => false);
  await sleep(600);
  await fit('minigame-reveal');
  await H.waitFor("document.querySelector('.ranking') !== null", 120000).catch(() => false);
  await toLobby();

  // ── 라이어 2라운드: 설명 · 토론 · 투표 · 변론 · 죽일까 · 공개 (소켓 손님이 바로바로 · 방장 화면은 직접)
  const target = ids[0];
  for (const s of socks) {
    const did = new Set();
    s.on('liar.state', (p) => {
      const v = p.liar;
      if (!v) return;
      const k = `${v.round}:${v.phase}:${v.phaseStartedAt}:${v.turn}`;
      if (did.has(k)) return;
      did.add(k);
      setTimeout(() => {
        if ((v.phase === 'describe' || v.phase === 'defense') && v.turn === s.__id) s.emit('liar.say', { text: v.phase === 'defense' ? '진짜 아니에요 저는 시민이에요' : '이건 자주 볼 수 있는 거예요' });
        else if (v.phase === 'discuss' && v.round > 1) s.emit('liar.discussEnd', {});
        else if (v.phase === 'vote' || v.phase === 'revote') s.emit('liar.vote', { target: s.__id === target ? ids[1] : target });
        else if (v.phase === 'final' && v.accused !== s.__id) s.emit('liar.final', { yes: true });
        else if (v.phase === 'guess' && v.amLiar) s.emit('liar.guess', { text: '모르겠다' });
      }, 700);
    });
  }
  await realClick(H, 'button[data-mode="liar"]');
  await sleep(400);
  await H.setInput('.mg-rounds-input', '2').catch(() => {});
  await sleep(500);
  await start();
  await H.waitFor("document.querySelector('[data-liar-phase]') !== null", 15000).catch(() => false);
  const liarSeen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const st = await H.evaluate("(() => { const c = document.querySelector('[data-liar-phase]'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; return c.dataset.liarPhase + ':' + (document.querySelector('.liar-round')?.innerText ?? '') + ':' + c.dataset.liarBout + ':' + !!document.querySelector('[data-liar-say-input]') + ':' + !!document.querySelector('[data-liar-guess-input]'); })()");
    if (st === 'result') break;
    if (!st) {
      await sleep(150);
      continue;
    }
    const [phase, roundTxt] = st.split(':');
    const round = Number((roundTxt ?? '').split('/')[0]);
    if (round === 1 && !liarSeen.has(phase) && ['describe', 'discuss', 'vote', 'defense', 'final', 'reveal'].includes(phase)) {
      liarSeen.add(phase);
      if (phase === 'describe') await chatLines(socks, 2);
      await fit(`liar-${phase}`);
    }
    if (await H.evaluate("!!document.querySelector('[data-liar-say-input]')")) {
      await H.setInput('[data-liar-say-input]', '동그랗고 자주 써요');
      await H.evaluate("document.querySelector('[data-liar-say-form]')?.requestSubmit()");
    }
    if (phase === 'discuss') {
      await sleep(300);
      await realClick(H, '[data-liar-discuss-end]').catch(() => {});
      if (round === 1) for (const s of socks) s.emit('liar.discussEnd', {});
    }
    if ((phase === 'vote' || phase === 'revote') && !(await H.evaluate('!!document.querySelector(".liar-person.picked")'))) await realClick(H, `[data-liar-target="${target}"]`).catch(() => {});
    if (phase === 'final') await realClick(H, '[data-liar-yes]').catch(() => {});
    if (await H.evaluate("!!document.querySelector('[data-liar-guess-input]')")) {
      await H.setInput('[data-liar-guess-input]', '모르겠다');
      await H.evaluate("document.querySelector('[data-liar-guess] form')?.requestSubmit()");
    }
    await sleep(250);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 60000).catch(() => false);
  await sleep(700);
  await fit('liar-result');
  await toLobby();

  // ── 캐치마인드 2라운드: 방장 그리는 중 · 공개 · 방장 맞히는 중 · 포기 공개
  await realClick(H, 'button[data-mode="draw"]');
  await sleep(400);
  await H.setInput('.mg-rounds-input', '2').catch(() => {});
  await sleep(500);
  await start();
  await H.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null", 15000).catch(() => false);
  await sleep(800);
  await fit('draw-drawing');
  const kw = await H.evaluate("document.querySelector('[data-draw-keyword]')?.innerText ?? ''");
  socks[0].emit('chat.send', { text: kw, epoch: null });
  await H.waitFor("document.querySelector('[data-draw-phase=\"reveal\"]') !== null", 6000).catch(() => false);
  await sleep(500);
  await fit('draw-reveal');
  await H.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null", 15000).catch(() => false);
  await sleep(800);
  await fit('draw-guess');
  for (const s of socks) s.emit('draw.giveUp', {});
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  await sleep(800);
  await fit('draw-result');

  // ── 정리 · 표
  const out = path.join(ROOT, 'docs', 'design', DIR);
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'r101-fit.json'), JSON.stringify({ table, mobile }, null, 1));
  const screens = [...new Set(table.map((t) => t.screen))];
  for (const sc of screens) {
    const rows = table.filter((t) => t.screen === sc);
    const bad = rows.filter((t) => !t.ok);
    record(`★★★ R101 ${sc} — 여섯 크기 페이지 스크롤 0 · 채팅 ≥ ${R101_MIN_LINES}줄 · 판 내용 잘림 0`, bad.length === 0, bad.map((t) => `${t.size} sy ${t.sy} sx ${t.sx} · ${t.lines}줄 · 잘림 ${t.clipN} ${t.clip?.join(',') ?? ''}`).join(' / '));
  }
  const want = ['lobby', 'settings-liar', 'settings-song', 'quiz-question', 'quiz-hint', 'quiz-reveal', 'quiz-result', 'song-play', 'song-reveal', 'song-result', 'minigame-board', 'minigame-reveal', 'liar-describe', 'liar-discuss', 'liar-vote', 'liar-defense', 'liar-final', 'liar-reveal', 'liar-result', 'draw-drawing', 'draw-reveal', 'draw-guess', 'draw-result'];
  const missing = want.filter((w) => !screens.includes(w));
  record('★★ R101 화면을 다 돌았다(못 본 화면 0)', missing.length === 0, missing.join(', '));
  console.log(`  [r101] m360(참고 · 고치지 않음): ${mobile.map((m) => `${m.screen} ${m.sy}`).join(' · ')}`);
  for (const s of socks) s.disconnect();
}

// =============================================================================
// ★★★ R096 — 노래 맞히기 방식 화면 (D-353) (UICHECK_R096=1 · 묶음 r096 · docs/design/r096)
//   방장 PC 1280×720(→ 2560×1440 한 장) · 손님 m360 터치 · 소켓 손님 1 — 방식 [노래] · 설정(곡 수 · 분류 · 연대 · 장르 칩 수) ·
//   판: 표지 부채꼴 0% · 50%(+ 15초 초성 · 퀴즈 힌트 자리) · 가수 → 본인 알림 · 채팅 정답(글 숨김 · 시스템 줄) · 정답 뒤 100% + 강조 ·
//   공개(제목 · 가수 · 칩 · 맞힌 줄 · 소감 칸 · 평가 노래 사유 · "N초 후 다음 곡") · 스킵(강조 없음) · 결과(곡 목록) · 세 테마 · 넘침
//   ★ 소리가 실제로 나는지는 검사하지 않는다(A111 그대로) — audio 상태만 적는다 · Apple 표기 0
// =============================================================================
async function r096Flow(browser) {
  const H = await newPage(browser, 'R096-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r96h', '노래방장');
  const roomId = await createRoom(H, 'R096 노래 맞히기');
  const G = await newPage(browser, 'R096-g', true);
  await signUp(G, 'r96g', '노래손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'r96s');
  let sQ = null;
  S.on('question.started', (p) => (sQ = p));
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r096] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const over = (P) => P.evaluate('document.documentElement.scrollWidth - innerWidth');
  const itemOf = (id) => withPg(async (c) => (await c.query(`SELECT payload FROM minigame_items WHERE item_id = $1`, [id])).rows[0]?.payload ?? null);
  const coverOf = (P) =>
    P.evaluate("JSON.stringify((() => { const c = document.querySelector('[data-song-cover]'); if (!c) return null; const b = c.getBoundingClientRect(); return { p: Number(c.dataset.progress), won: c.classList.contains('won'), done: c.classList.contains('done'), w: Math.round(b.width), h: Math.round(b.height), img: c.querySelector('img')?.getAttribute('src') ?? null, veil: getComputedStyle(c.querySelector('.song-cover-veil')).backgroundImage.slice(0, 40) }; })())").then((s) => JSON.parse(s));
  // ★★★ R099 — 가림막 비침 0: 칠한 색(투명 아닌 쪽)에 알파가 없다(rgb) · 가림막이 표지 칸을 다 덮는다(inset -1px)
  const veilOf = (P) =>
    P.evaluate("JSON.stringify((() => { const c = document.querySelector('[data-song-cover]'); const v = c?.querySelector('.song-cover-veil'); if (!v) return null; const bg = getComputedStyle(v).backgroundImage; const cols = bg.match(/rgba?\\([^)]*\\)/g) ?? []; const paint = cols.filter((x) => !/,\\s*0\\)$/.test(x)); const cr = c.getBoundingClientRect(); const vr = v.getBoundingClientRect(); return { paint, opaque: paint.length > 0 && paint.every((x) => x.startsWith('rgb(') || /,\\s*1\\)$/.test(x)), covers: vr.left <= cr.left && vr.top <= cr.top && vr.right >= cr.right && vr.bottom >= cr.bottom, theme: document.documentElement.dataset.theme ?? '' }; })())").then((x) => JSON.parse(x));
  const hintOf = (P) => P.evaluate("JSON.stringify({ rows: document.querySelectorAll('.q-hints .q-hint').length, open: document.querySelector('.q-hints .q-hint.open .hint-value')?.innerText ?? null, label: [...document.querySelectorAll('.q-hints .hint-label')].map((e) => e.innerText).join(',') })").then((s) => JSON.parse(s));
  const say = async (P, t) => {
    await P.setInput('.chat-card input', t);
    await P.click('전송');
    await sleep(250);
  };
  const res = { settings: null, mobileSettings: null, p0: null, p50: null, artist: null, won: null, reveal: null, skip: null, result: null, themes: [], apple: [] };
  const appleOf = async (P, at) => res.apple.push([at, await P.evaluate("document.body.innerText.includes('Apple')")]);

  // ── 설정 — 방식 [노래] · 칩 수
  await realClick(H, 'button[data-mode="song"]');
  await H.waitFor("document.querySelector('[data-song-count]') !== null", 4000).catch(() => false);
  await H.waitFor("document.querySelector('[data-song-avail]')?.innerText.includes('곡 ·')", 6000).catch(() => false);
  await sleep(300);
  res.settings = JSON.parse(
    await H.evaluate(
      "JSON.stringify({ mode: document.querySelector('[data-mode=\"song\"]')?.getAttribute('aria-pressed'), count: document.querySelector('[data-song-count]')?.value, cats: [...document.querySelectorAll('[data-song-cat]')].map((e) => e.innerText.replace(/\\s+/g, ' ')), decades: [...document.querySelectorAll('[data-song-decade],[data-song-legend]')].map((e) => e.innerText.replace(/\\s+/g, ' ')), genres: [...document.querySelectorAll('[data-song-genre]')].map((e) => e.innerText.replace(/\\s+/g, ' ') + (e.classList.contains('song-set-empty') ? '(흐림)' : '')), avail: document.querySelector('[data-song-avail]')?.innerText ?? '', mgRow: !!document.querySelector('.mg-set-row'), qRow: !!document.querySelector('.level-row') })",
    ),
  );
  await snap(H, 'settings-pc');
  await G.waitFor("document.querySelector('[data-song-avail]') !== null", 4000).catch(() => false);
  await sleep(500);
  res.mobileSettings = { over: await over(G), genres: await G.evaluate("document.querySelectorAll('[data-song-genre]').length") };
  await snap(G, 'settings-guest-m360');
  // 분류에서 한국을 끄면 장르 줄이 사라진다 → 다시 켬
  await realClick(H, '[data-song-cat="kr"]');
  await sleep(400);
  res.settings.noKrGenres = await H.evaluate("document.querySelectorAll('[data-song-genre]').length");
  await realClick(H, '[data-song-cat="kr"]');
  await sleep(300);
  await realClick(H, '[data-song-count-preset="5"]');
  await sleep(300);
  await appleOf(H, 'settings');

  // ── 시작
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('[data-song-cover]') !== null", 15000).catch(() => false);
  await sleep(400);
  // 곡 1 — 0%
  res.p0 = { h: await coverOf(H), g: await coverOf(G), hint: await hintOf(H), sound: await H.evaluate("document.querySelector('[data-song-sound]')?.dataset.songSound ?? null"), cat: await H.evaluate("document.querySelector('.q-head .badge.cat')?.innerText ?? ''") };
  await snap(H, 'play-0-pc');
  await snap(G, 'play-0-m360');
  res.themes.push(['play m360', await over(G)]);
  res.veil = { p0: await veilOf(H), g0: await veilOf(G) };
  const it1 = sQ ? await itemOf(sQ.questionId) : null;
  // 가수 → 본인 알림(채팅에 안 나감)
  const chatBefore = await H.evaluate("document.querySelectorAll('.chat-line').length");
  await say(G, it1?.artist ?? '');
  await sleep(300);
  res.artist = { notice: await G.evaluate("document.querySelector('[data-song-notice]')?.innerText ?? ''"), hostChatDelta: (await H.evaluate("document.querySelectorAll('.chat-line').length")) - chatBefore };
  await snap(G, 'play-artist-m360');
  // ★ R099 — 30%(부채꼴 안만 보이고 나머지는 불투명)
  await H.waitFor("Number(document.querySelector('[data-song-cover]')?.dataset.progress ?? 0) >= 0.3", 20000).catch(() => false);
  await sleep(150);
  res.veil.p30 = { h: await coverOf(H), v: await veilOf(H) };
  await snap(H, 'play-30-pc');
  await snap(G, 'play-30-m360');
  // 50% — 15초 남음 → 초성
  await H.waitFor("Number(document.querySelector('[data-song-cover]')?.dataset.progress ?? 0) >= 0.5", 20000).catch(() => false);
  await sleep(400);
  res.p50 = { h: await coverOf(H), hint: await hintOf(H), gHint: await hintOf(G) };
  await snap(H, 'play-50-hint-pc');
  await snap(G, 'play-50-hint-m360');
  await H.setViewport(2560, 1440);
  await sleep(400);
  res.p50.big = await coverOf(H);
  await snap(H, 'play-50-hint-2560');
  await H.setViewport(1280, 720);
  await sleep(300);
  for (const th of ['office', 'night']) {
    await theme(H, th);
    await sleep(200);
    await snap(H, `play-50-${th}-pc`);
    res.veil[th] = await veilOf(H);
  }
  // ★ R099 — 확대 125%(장치 배율) · 줄인 움직임에서도 가림막이 표지를 다 덮는다
  await H.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1.25, mobile: false });
  await sleep(250);
  res.veil.zoom125 = await veilOf(H);
  await snap(H, 'play-50-zoom125-pc');
  await H.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await H.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(250);
  res.veil.reduced = await veilOf(H);
  await H.send('Emulation.setEmulatedMedia', { features: [] });
  await theme(H, 'pastel');
  // 정답 — 방장이 채팅으로 제목 → 표지 100% + 강조 · 공개
  const sysBefore = await H.evaluate("document.querySelectorAll('.chat-system').length");
  await say(H, it1?.title ?? '');
  await H.waitFor("document.querySelector('.reveal') !== null", 5000).catch(() => false);
  await sleep(1600);
  await say(H, '이 노래 완전 좋아요 🎉');
  await sleep(500);
  res.won = { h: await coverOf(H), g: await coverOf(G) };
  // ★ R099 — 다음 곡 표지 칸이 **처음 그려진 프레임**을 잡아 둔다(새 칸 · 계산된 --song-p · 진행) — 옛 칸을 다시 쓰면 앞 곡 1 에서 되감기며 새 표지가 비쳤다
  await H.evaluate("(() => { window.__nextCover = null; const first = document.querySelector('[data-song-cover]'); const t0 = Date.now(); const look = () => { if (window.__nextCover) return; const c = document.querySelector('[data-song-cover]'); if (!c || !c.querySelector('img')) return; if (c !== first) window.__nextCover = { p: Number(c.dataset.progress), cssP: Number(getComputedStyle(c).getPropertyValue('--song-p')), done: c.classList.contains('done'), at: Date.now() - t0 }; else if (!c.classList.contains('done')) window.__nextCover = { same: true, p: Number(c.dataset.progress), cssP: Number(getComputedStyle(c).getPropertyValue('--song-p')), at: Date.now() - t0 }; if (window.__nextCover) mo.disconnect(); }; const mo = new MutationObserver(look); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); })()");
  res.reveal = JSON.parse(
    await H.evaluate(
      "JSON.stringify({ title: document.querySelector('[data-song-title]')?.innerText ?? '', artist: document.querySelector('.song-reveal-text .song-artist')?.innerText ?? '', chips: [...document.querySelectorAll('.song-chips .badge')].map((e) => e.innerText), winner: document.querySelector('[data-song-winner]')?.innerText ?? '', ceremony: document.querySelector('.ceremony-msg')?.innerText ?? '', rate: document.querySelectorAll('[data-song-rate], .reveal-fb').length, next: document.querySelector('.reveal-next')?.innerText ?? '', sys: document.querySelectorAll('.chat-system').length, lines: [...document.querySelectorAll('.chat-line')].map((e) => e.innerText).slice(-4) })",
    ),
  );
  res.reveal.sysDelta = res.reveal.sys - sysBefore;
  res.reveal.gWinner = await G.evaluate("document.querySelector('[data-song-winner]')?.innerText ?? ''");
  // ★ 공개 중에도 채팅 입력칸이 화면 안(소감 · 뒷북을 칠 수 있게) — PC 1280×720 · 1536×864 · m360 (첫 그림에서 1280 이 밀려 나간 것을 잡는 검사)
  const chatIn = (P) => P.evaluate("(() => { const i = document.querySelector('.chat-card input'); if (!i) return null; const b = i.getBoundingClientRect(); return Math.round(innerHeight - b.bottom); })()");
  await sleep(500);
  res.reveal.chatIn = { pc: await chatIn(H), m360: await chatIn(G) };
  await H.setViewport(1536, 864);
  await sleep(400);
  res.reveal.chatIn.lap = await chatIn(H);
  await snap(H, 'reveal-won-1536');
  await H.setViewport(1280, 720);
  await sleep(300);
  await snap(H, 'reveal-won-pc');
  await snap(G, 'reveal-won-m360');
  res.themes.push(['reveal m360', await over(G)]);
  // ★★★ R099 — 노래 평가 줄 없음(찬종 "평가는 나만 · 제보로")
  res.reveal.rateRow = await G.evaluate("document.querySelectorAll('[data-song-rate], .reveal-fb, .fb-vote').length");
  await H.setViewport(2560, 1440);
  await sleep(300);
  await snap(H, 'reveal-won-2560');
  await H.setViewport(1280, 720);
  await appleOf(H, 'reveal');
  // 곡 2 — 넘기기 투표(강조 없이 전부 공개)
  await H.waitFor("document.querySelector('.reveal') === null && document.querySelector('[data-song-cover]') !== null", 15000).catch(() => false);
  // ★ R099 — 다음 곡 첫 프레임: 새 칸(같은 칸 다시 쓰기 아님) · 계산된 --song-p 가 진행과 같다(되감기 없음) · 불투명
  res.veil.next = { first: JSON.parse(await H.evaluate('JSON.stringify(window.__nextCover)')), v: await veilOf(H) };
  await sleep(500);
  await realClick(H, '.skip-btn').catch(() => undefined);
  await realClick(G, '.skip-btn').catch(() => undefined);
  await H.waitFor("document.querySelector('.reveal') !== null", 5000).catch(() => false);
  await sleep(1200);
  res.skip = { h: await coverOf(H), winner: await H.evaluate("document.querySelector('.song-winner')?.innerText ?? ''") };
  await snap(H, 'reveal-skip-pc');
  // 나머지 3곡 — 방장 넘기기(확인 팝업)로 빨리
  for (let i = 0; i < 3; i += 1) {
    await H.waitFor("document.querySelector('.reveal') === null && document.querySelector('[data-song-cover]') !== null", 15000).catch(() => false);
    await sleep(400);
    S.emit('host.forceSkip', { epoch: sQ?.epoch }); // 방장이 아니라 거절 — 소켓 손님은 투표로
    S.emit('skip.vote', { vote: true, epoch: sQ?.epoch });
    await realClick(H, '.skip-btn').catch(() => undefined);
    await H.waitFor("document.querySelector('.reveal') !== null", 5000).catch(() => false);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 20000).catch(() => false);
  await sleep(600);
  res.result = JSON.parse(await H.evaluate("JSON.stringify({ rank: document.querySelectorAll('.ranking li').length, songs: document.querySelectorAll('[data-song-row]').length, titles: [...document.querySelectorAll('.song-result-title')].map((e) => e.innerText), audio: document.querySelector('[data-song-audio]')?.getAttribute('src') ?? null })"));
  await snap(H, 'result-pc');
  await snap(G, 'result-m360');
  res.themes.push(['result m360', await over(G)]);
  await appleOf(H, 'result');
  for (const [k, v] of Object.entries(res)) note(k, v);
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r096', 'r096.json'), JSON.stringify(rows, null, 1));
  const st = res.settings;
  record('★★★ R096 설정 — 방식 [노래] · 곡 수 기본 10 · 분류 셋 · 연대 셋 + 20세기 명곡 · 한국 장르 9(트로트 0 흐림) · 칩 수 · 고른 범위 줄 · 퀴즈 · 미니게임 줄 숨김 · 한국 끄면 장르 줄 없음', Boolean(st && st.mode === 'true' && st.count === '10' && st.cats.length === 3 && st.decades.length === 4 && st.genres.length === 9 && st.genres.some((x) => /트로트 0\(흐림\)/.test(x)) && /고른 범위의 노래 \d+곡/.test(st.avail) && !st.mgRow && !st.qRow && st.noKrGenres === 0 && res.mobileSettings.over <= 1), JSON.stringify({ st, m: res.mobileSettings }));
  record('★★★ R096 판 0% — 표지(600) 거의 가림 · 머리 "노래 맞히기" · 힌트 줄 = 초성 한 줄(잠김 15초) · PC 표지 ≈ 288~360px · m360 표지 ≤ 칸 너비', Boolean(res.p0?.h && res.p0.h.p < 0.1 && /600x600bb/.test(res.p0.h.img ?? '') && res.p0.cat === '노래 맞히기' && res.p0.hint.rows === 1 && res.p0.hint.label === '초성' && res.p0.h.w >= 250 && res.p0.h.w <= 361 && res.p0.g && res.p0.g.w <= 340), JSON.stringify(res.p0));
  record('★★★ R096 가수 → 본인에게만 "가수 말고 제목" · 방장 채팅 줄 늘지 않음', Boolean(res.artist && /가수 말고 제목/.test(res.artist.notice) && res.artist.hostChatDelta === 0), JSON.stringify(res.artist));
  record('★★★ R096 판 50% — 부채꼴 절반 · 15초 초성 열림(퀴즈 힌트 자리 · 방장 · 손님 같음) · 2560 표지 ≤ 360', Boolean(res.p50?.h && res.p50.h.p >= 0.49 && res.p50.h.p <= 0.62 && res.p50.hint.open && res.p50.hint.open === res.p50.gHint.open && res.p50.big.w <= 361), JSON.stringify(res.p50));
  record('★★★ R096 정답 — 표지 100% + 강조(won) · 손님도 · 공개 제목 · 가수 · 칩 · "님이 n초 만에 맞혔어요 +1" · 소감 칸 · ★ R099 평가 줄 없음 · "N초 후 다음 곡" · 맞힌 글은 채팅에 안 나감(시스템 줄 +1)', Boolean(res.won?.h && res.won.h.p === 1 && res.won.h.won && res.won.g?.won && res.reveal.title === it1?.title && res.reveal.artist === it1?.artist && res.reveal.chips.length >= 2 && /맞혔어요/.test(res.reveal.winner) && /맞혔어요/.test(res.reveal.gWinner) && /좋아요/.test(res.reveal.ceremony) && res.reveal.rate === 0 && /다음 곡|^\s*$/.test(res.reveal.next) && res.reveal.sysDelta >= 1 && !res.reveal.lines.some((l) => l.endsWith(it1?.title ?? '\u0000'))), JSON.stringify({ won: res.won, reveal: res.reveal }));
  record('★★★ R096 공개 중 채팅 입력칸이 화면 안 — PC 1280×720 · 1536×864 · m360(표지는 한 바퀴 뒤 한 단계 줄어든다)', Boolean(res.reveal.chatIn && [res.reveal.chatIn.pc, res.reveal.chatIn.lap, res.reveal.chatIn.m360].every((v) => typeof v === 'number' && v >= 0)), JSON.stringify(res.reveal.chatIn));
  record('★★ R099 노래 공개 — 평가 줄(👍 😐 👎 · 노래 사유) 없음(손님 m360)', res.reveal.rateRow === 0, String(res.reveal.rateRow));
  const vOk = (v) => v && v.opaque && v.covers;
  record('★★★ R099 가림막 비침 0 — 칠한 색 알파 없음 · 표지 칸 전부 덮음(0% PC · m360 · 30% · 사무실 · 밤 · 확대 125% · 줄인 움직임 · 다음 곡 첫 순간)', [res.veil?.p0, res.veil?.g0, res.veil?.p30?.v, res.veil?.office, res.veil?.night, res.veil?.zoom125, res.veil?.reduced, res.veil?.next?.v].every(vOk) && res.veil.p30.h.p >= 0.29 && res.veil.p30.h.p <= 0.45 && !!res.veil.next.first && !res.veil.next.first.same && res.veil.next.first.p < 0.1 && Math.abs(res.veil.next.first.cssP - res.veil.next.first.p) < 0.02 && res.veil.next.first.done === false, JSON.stringify(res.veil));
  record('★★ R096 넘기기 — 표지 전부 공개 · 강조 없음 · "투표로 넘겼습니다"', Boolean(res.skip?.h && res.skip.h.p === 1 && !res.skip.h.won && /넘겼/.test(res.skip.winner)), JSON.stringify(res.skip));
  record('★★★ R096 결과 — 순위 3 · 곡 목록 5(제목 공개) · 노래 멈춤', Boolean(res.result && res.result.rank === 3 && res.result.songs === 5 && res.result.titles.every((t) => t && t !== '(중단된 곡)')), JSON.stringify(res.result));
  record('★★ R096 Apple 표기 0(설정 · 공개 · 결과) · m360 넘침 0', res.apple.every(([, a]) => !a) && res.themes.every(([, o]) => o <= 1), JSON.stringify({ apple: res.apple, t: res.themes }));
  S.disconnect();
}

// ★★★ R095 — 실전 제보 3차 (D-352 · #116 캐치 초성 · 도구 아이콘 · 색 점 팝업 / #117 미니게임 판:채팅) (UICHECK_R095=1 · R095_TAG=before|after · 묶음 r095 · docs/design/r095)
const R095_MG = `JSON.stringify((() => { const card = document.querySelector('.mg-card'); const chat = document.querySelector('.room .chat-card'); const center = document.querySelector('.center'); const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) }; }; return { card: R(card), chat: R(chat), center: R(center), vh: innerHeight, over: document.documentElement.scrollWidth - innerWidth }; })())`;
async function r095Flow(browser) {
  const TAG = process.env.R095_TAG ?? 'after';
  const rows = [];
  const res = {};
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r095] ${k}: ${JSON.stringify(v)}`);
  };
  const J = async (P, expr) => JSON.parse(await P.evaluate(`JSON.stringify(${expr})`));
  const share = (x) => (x && x.card && x.chat ? Math.round((x.card.h / (x.card.h + x.chat.h)) * 100) / 100 : 0);
  // ── C. 미니게임 판:채팅 — lab 방 틀(판 큰 것 넷)
  const H = await newPage(browser, 'R095-host', true);
  await H.setViewport(2560, 1313);
  await signUp(H, 'r95h', '그림방장');
  const G = await newPage(browser, 'R095-g', true);
  await signUp(G, 'r95g', '그림손님');
  await r068Touch(G, 360, 740, true);
  for (const [key, phase] of [['song', 'play'], ['reaction', 'play'], ['order', 'play'], ['many', 'play']]) {
    for (const [P, n, w, h] of [[H, 'pc2560', 2560, 1313], [H, 'pc1280', 1280, 720], [G, 'm360', 0, 0]]) {
      if (w) await P.setViewport(w, h);
      await P.goto(`${BASE}/lab/minigame?scene=1&room=1&key=${key}&phase=${phase}&seed=2024`);
      await P.waitFor("document.querySelector('.mg-card') !== null", 8000).catch(() => false);
      await sleep(600);
      res[`mg-${key}-${n}`] = JSON.parse(await P.evaluate(R095_MG));
      await snap(P, `mg-${key}-${n}-${TAG}`);
    }
  }
  const mgShare = Object.fromEntries(['song', 'reaction', 'order', 'many'].map((k) => [k, Object.fromEntries(['pc2560', 'pc1280', 'm360'].map((n) => [n, share(res[`mg-${k}-${n}`])]))]));
  note('미니게임 판 비율(판 ÷ 판 + 채팅)', mgShare);
  note('미니게임 넘침', Object.fromEntries(Object.entries(res).filter(([k]) => k.startsWith('mg-')).map(([k, v]) => [k, v?.over ?? null])));

  // ── A · B. 캐치마인드 — 방장(PC) 출제
  await H.setViewport(2560, 1313);
  await H.goto(`${BASE}/`);
  await sleep(500);
  const roomId = await createRoom(H, 'R095 그리기');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'r95s');
  await realClick(H, 'button[data-mode="draw"]');
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('[data-draw-tools]') !== null", 15000).catch(() => false);
  await sleep(600);
  const TOOLS = "(() => { const t = document.querySelector('[data-draw-tools]'); const side = document.querySelector('.draw-side')?.getBoundingClientRect(); const c = document.querySelector('[data-draw-canvas]')?.getBoundingClientRect(); const btn = (s) => { const b = document.querySelector(s); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), svg: !!b.querySelector('svg'), text: b.innerText.trim(), label: b.getAttribute('aria-label') ?? '', title: b.title }; }; const pen = btn('[data-draw-tool=\"pen\"]'); const dot = btn('[data-draw-color-dot]'); const penR = document.querySelector('[data-draw-tool=\"pen\"]')?.getBoundingClientRect(); const dotR = document.querySelector('[data-draw-color-dot]')?.getBoundingClientRect(); return { pen, fill: btn('[data-draw-tool=\"fill\"]'), pick: btn('[data-draw-tool=\"pick\"]'), eraser: btn('[data-draw-tool=\"eraser\"]'), dot, sameRow: penR && dotR ? Math.abs(penR.top - dotR.top) < 2 : false, paletteOut: document.querySelectorAll('[data-draw-tools] > .draw-palette, [data-draw-tools] > .draw-custom').length, side: side ? Math.round(side.width) : 0, canvas: c ? Math.round(c.width) : 0, inView: t ? [...t.querySelectorAll('button')].every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.left >= -1; }) : false, over: document.documentElement.scrollWidth - innerWidth }; })()";
  const POP = "(() => { const p = document.querySelector('[data-draw-color-pop]'); if (!p) return null; const r = p.getBoundingClientRect(); const d = document.querySelector('[data-draw-color-dot]').getBoundingClientRect(); return { colors: p.querySelectorAll('[data-draw-color]').length, custom: !!p.querySelector('[data-draw-custom]'), below: r.top >= d.bottom - 1, inView: r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, w: Math.round(r.width), h: Math.round(r.height) }; })()";
  for (const [n, w, h] of [['pc2560', 2560, 1313], ['pc1280', 1280, 720]]) {
    await H.setViewport(w, h);
    await sleep(500);
    res[`tools-${n}`] = await J(H, TOOLS);
    await snap(H, `draw-drawer-${n}-${TAG}`);
    await snapClip(H, `draw-side-${n}-${TAG}`, '.draw-side');
    if (TAG === 'after') {
      await realClick(H, '[data-draw-color-dot]');
      await sleep(300);
      res[`pop-${n}`] = await J(H, POP);
      await snap(H, `draw-pop-${n}-${TAG}`);
      await realClick(H, '[data-draw-color="#e5383b"]');
      await sleep(200);
      res[`pick-${n}`] = await J(H, "({ dot: document.querySelector('[data-draw-color-dot]')?.dataset.drawColorDot ?? '', open: !!document.querySelector('[data-draw-color-pop]') })");
    }
    note(`도구 ${n}`, { tools: res[`tools-${n}`], pop: res[`pop-${n}`] ?? null, pick: res[`pick-${n}`] ?? null });
  }
  // 초성 힌트(A) — 손님 화면
  const kw = await H.evaluate("document.querySelector('[data-draw-keyword]')?.innerText ?? ''");
  await realClick(H, '[data-draw-hint-btn="initial"]');
  await G.waitFor("document.querySelector('[data-draw-hint=\"initial\"]') !== null", 5000).catch(() => false);
  await sleep(300);
  res.initial = { kw, hint: await G.evaluate("document.querySelector('[data-draw-hint=\"initial\"] strong')?.innerText ?? ''"), sys: await G.evaluate("[...document.querySelectorAll('.chat-log *')].some((e) => /출제자가 초성을 공개했어요/.test(e.textContent ?? ''))") };
  note('초성 힌트', res.initial);
  await snap(G, `draw-guess-initial-m360-${TAG}`);
  // 1라운드 끝 → 2라운드 손님(m360) 출제
  await G.setInput('.chat-card input', kw);
  await G.click('전송');
  S.emit('chat.send', { text: kw, epoch: null });
  await G.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null && !!document.querySelector('[data-draw-tools]')", 20000).catch(() => false);
  await sleep(600);
  res['tools-m360'] = await J(G, TOOLS);
  await snap(G, `draw-drawer-m360-${TAG}`);
  if (TAG === 'after') {
    await realClick(G, '[data-draw-color-dot]');
    await sleep(300);
    res['pop-m360'] = await J(G, POP);
    await snap(G, `draw-pop-m360-${TAG}`);
    await G.key('Escape');
    await sleep(200);
    res['esc-m360'] = await G.evaluate("!document.querySelector('[data-draw-color-pop]')");
  }
  note('도구 m360', { tools: res['tools-m360'], pop: res['pop-m360'] ?? null, esc: res['esc-m360'] ?? null });
  try {
    S.disconnect();
  } catch {
    /* 이미 끊김 */
  }
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r095');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `r095-${TAG}.json`), JSON.stringify(rows, null, 1));
  const syl = [...kw.replace(/\s/g, '')].length;
  record(`★★★ R095 캐치 초성 = 제시어 전체 초성(글자 수 ${syl} · 띄어쓰기 유지) + 시스템 줄 "출제자가 초성을 공개했어요" [${TAG}]`, kw.length > 0 && [...res.initial.hint.replace(/\s/g, '')].length === syl && res.initial.hint.split(' ').length === kw.trim().split(/\s+/).length && res.initial.sys, JSON.stringify(res.initial));
  const toolsOk = (t) => t && ['pen', 'eraser', 'fill', 'pick'].every((k) => t[k] && t[k].svg && t[k].text === '' && t[k].label) && t.dot && t.sameRow && t.paletteOut === 0 && t.inView && t.over <= 1;
  record(`★★★ R095 도구 = 아이콘(글자 0 · aria-label) · 지금 색 점이 도구 줄 같은 줄 · 팔레트 판은 팝업 안 · 2560 · 1280 · m360 [${TAG}]`, ['pc2560', 'pc1280', 'm360'].every((n) => toolsOk(res[`tools-${n}`])), JSON.stringify(['pc2560', 'pc1280', 'm360'].map((n) => res[`tools-${n}`])));
  record(`★★★ R095 색 점 → 그 밑 팝업(12색 · 세부 색 · 화면 안) · 고르면 닫힘 · Esc 닫힘 [${TAG}]`, ['pc2560', 'pc1280', 'm360'].every((n) => { const p = res[`pop-${n}`]; return p && p.colors === 12 && p.custom && p.below && p.inView; }) && ['pc2560', 'pc1280'].every((n) => res[`pick-${n}`]?.dot === '#e5383b' && !res[`pick-${n}`]?.open) && res['esc-m360'] === true, JSON.stringify({ pop: ['pc2560', 'pc1280', 'm360'].map((n) => res[`pop-${n}`]), pick: res['pick-pc2560'], esc: res['esc-m360'] }));
  record(`★★★ R095 미니게임 판 칸 ≥ 가운데 높이 반(판 ÷ 판 + 채팅 ≥ 0.5 · 노래 · 반응 · 순서대로 · 많이 말하기 × 2560 · 1280) · 넘침 0 [${TAG}]`, ['song', 'reaction', 'order', 'many'].every((k) => ['pc2560', 'pc1280'].every((n) => mgShare[k][n] >= 0.5) && ['pc2560', 'pc1280', 'm360'].every((n) => (res[`mg-${k}-${n}`]?.over ?? 9) <= 1)), JSON.stringify(mgShare));
}

async function r094Flow(browser) {
  const rows = [];
  const res = {};
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r094] ${k}: ${JSON.stringify(v)}`);
  };
  // ── ① 번개손 결과
  const H = await newPage(browser, 'R094-host', true);
  await H.setViewport(2560, 1313);
  await signUp(H, 'r94h', '제보방장');
  const G = await newPage(browser, 'R094-g', true);
  await signUp(G, 'r94g', '제보손님');
  await r068Touch(G, 360, 740, true);
  for (const [P, n, w, h] of [[H, 'pc2560', 2560, 1313], [H, 'pc1280', 1280, 720], [G, 'm360', 0, 0]]) {
    if (w) await P.setViewport(w, h);
    await P.goto(`${BASE}/lab/minigame?scene=1&key=reaction&phase=roundResult&seed=2024`);
    await P.waitFor("document.querySelector('.rx-result') !== null", 8000).catch(() => false);
    await sleep(500);
    res[`rx-${n}`] = JSON.parse(await P.evaluate(R094_RX));
    await snapClip(P, `reaction-result-${n}`, '.mg-result');
  }
  note('번개손 결과', { pc2560: res['rx-pc2560'], pc1280: res['rx-pc1280'], m360: res['rx-m360'] });
  await H.setViewport(2560, 1313);

  // ── ② · ③ 퀴즈 두 문제(숫자 정답 + 긴 문제)
  const prep = await withPg(async (c) => {
    const num = (await c.query(`SELECT q.id::text FROM questions q WHERE q.is_active AND q.status = 'approved' AND q.question_type = 'short_answer' AND coalesce(q.hint_answer, q.display_answer) ~ '^[0-9]{4}$' ORDER BY q.id LIMIT 1`)).rows[0]?.id;
    const long = (await c.query(`SELECT q.id::text FROM questions q WHERE q.is_active AND q.status = 'approved' AND q.question_type = 'short_answer' AND char_length(q.question_text) BETWEEN 120 AND 160 AND coalesce(q.hint_answer, q.display_answer) ~ '^[가-힣]{3,6}$' ORDER BY q.id LIMIT 1`)).rows[0]?.id;
    await c.query(`DROP TABLE IF EXISTS _r094_active`);
    await c.query(`CREATE TABLE _r094_active AS SELECT id FROM questions WHERE is_active`);
    await c.query(`UPDATE questions SET is_active = (id = ANY($1::bigint[])) WHERE is_active`, [[num, long]]);
    return { num, long };
  });
  note('문항', prep);
  try {
    await H.goto(`${BASE}/`);
    await sleep(500);
    const roomId = await createRoom(H, 'R094 제보');
    await G.goto(`${BASE}/r/${roomId}`);
    await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
    await sleep(600);
    await setQuestionCount(H, 2);
    await sleep(300);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
    let lastEp = '';
    for (let i = 0; i < 2; i += 1) {
      const up = await H.waitFor(`document.querySelector('.room')?.dataset.state === 'QUESTION_ACTIVE' && document.querySelector('.room')?.dataset.epoch !== ${JSON.stringify(lastEp)}`, 40000).catch(() => false);
      if (!up) break;
      lastEp = await H.evaluate("document.querySelector('.room')?.dataset.epoch ?? ''");
      await H.waitFor("document.querySelectorAll('.q-hint.open').length >= 2", 30000).catch(() => false);
      await sleep(700);
      const hint = await H.evaluate("document.querySelector('.q-hint.open:last-child .hint-value')?.innerText ?? ''");
      const tag = /^_+$/.test(hint) ? 'num' : 'long';
      for (const [n, w, h, dpr] of [['pc2560', 2560, 1313, 1], ['pc1280', 1280, 720, 1], ['fhd125', 1536, 864, 1.25]]) {
        await H.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
        await H.evaluate("window.dispatchEvent(new Event('resize'))");
        await sleep(450);
        await H.evaluate("(() => { const q = document.querySelector('.q-text'); if (q) { q.style.width = '99%'; requestAnimationFrame(() => { q.style.width = ''; }); } })()");
        await sleep(450);
        res[`${tag}-${n}`] = JSON.parse(await H.evaluate(R094_Q));
        await snap(H, `game-${tag}-${n}`);
      }
      await H.send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1313, deviceScaleFactor: 1, mobile: false });
      res[`${tag}-m360`] = JSON.parse(await G.evaluate(R094_Q));
      await snap(G, `game-${tag}-m360`);
      if (tag === 'num') await snapClip(H, 'hint-num-pc2560', '.q-hints');
      note(`문제 ${tag}`, { pc2560: res[`${tag}-pc2560`], pc1280: res[`${tag}-pc1280`], fhd125: res[`${tag}-fhd125`], m360: res[`${tag}-m360`] });
    }
  } finally {
    await withPg(async (c) => {
      await c.query(`UPDATE questions SET is_active = true WHERE id IN (SELECT id FROM _r094_active)`);
      await c.query(`DROP TABLE IF EXISTS _r094_active`);
    });
  }
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r094'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r094'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r094', 'r094.json'), JSON.stringify(rows, null, 1));
  record('★★★ R094 번개손 결과 — "나 · 퀵드로우 — 가짜 신호 1번" 칸 안(넘침 0) · 2560 · 1280 · m360', ['pc2560', 'pc1280', 'm360'].every((n) => { const x = res[`rx-${n}`]; return x && !x.out && x.over <= 1 && x.ps.some((p) => /가짜 신호 1번/.test(p.t)); }), JSON.stringify([res['rx-pc2560'], res['rx-pc1280'], res['rx-m360']]));
  record('★★★ R094 숫자 정답 초성 힌트 — "____" 옆 "숫자 4자리" · PC · m360 / 한글 정답엔 표시 없음', ['pc2560', 'pc1280', 'fhd125', 'm360'].every((n) => /숫자 4자리/.test(res[`num-${n}`]?.kind ?? '')) && ['pc2560', 'm360'].every((n) => res[`long-${n}`] && res[`long-${n}`].kind === ''), JSON.stringify({ num: res['num-pc2560'], numM: res['num-m360'], long: res['long-pc2560'] }));
  const qShare = (x) => (x && x.card && x.chat ? x.card.h / (x.card.h + x.chat.h) : 0);
  res.share = Object.fromEntries(['pc2560', 'pc1280', 'fhd125'].map((n) => [n, Math.round(qShare(res[`long-${n}`]) * 100) / 100]));
  note('문제 칸 비율(문제 ÷ 문제 + 채팅)', res.share);
  record('★★★ R094 문제 칸 넓게 · 채팅 좁게 — 문제 칸 비율 ≥ 0.5(긴 문제 · 숫자 문제) · 2560 지문 ≥ 32px · 넘침 0 · 2560 · 1280 · FHD 125% / m360 그대로 · 넘침 0', ['pc2560', 'pc1280', 'fhd125'].every((n) => res.share[n] >= 0.5 && qShare(res[`num-${n}`]) >= 0.5 && (res[`long-${n}`]?.over ?? 9) <= 1) && parseFloat(res['long-pc2560']?.fs ?? '0') >= 32 && (res['long-m360']?.over ?? 9) <= 1, JSON.stringify({ share: res.share, num: ['pc2560', 'pc1280', 'fhd125'].map((n) => Math.round(qShare(res[`num-${n}`]) * 100) / 100), fs: ['pc2560', 'pc1280', 'fhd125', 'm360'].map((n) => res[`long-${n}`]?.fs) }));
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R088 — 라이어 바보형 화면 (D-345) (UICHECK_R088=1 · 묶음 r088 · docs/design/r088)
//   방장 PC 1280 · FHD 125%(1536×864 @1.25) · 손님 m360 터치 · 소켓 손님 1(3명) · 2라운드
//   설정: 방식 라이어 → 모드 줄(기본형 · 바보형) · 바보형 누름 → 손님 칩 / 배정: 셋 다 시민 카드(라이어도 키워드) · 머리 "바보형" / 공개: "라이어가 받은 단어" · 세 테마
// =============================================================================
async function r088Flow(browser) {
  const H = await newPage(browser, 'R088-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r8h', '바보방장');
  const roomId = await createRoom(H, 'R088 바보형');
  const G = await newPage(browser, 'R088-g', true);
  await signUp(G, 'r8g', '바보손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'r8s');
  const sid = (await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_r8s0`.toLowerCase()])).rows[0]?.id)) ?? null;
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r088] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const J = async (P, expr) => JSON.parse(await P.evaluate(`JSON.stringify(${expr})`));
  const set125 = () => H.send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 864, deviceScaleFactor: 1.25, mobile: false }).then(() => sleep(380));
  const set1280 = () => H.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }).then(() => sleep(380));
  let sView = null;
  const did = new Set();
  S.on('liar.state', (p) => {
    const v = p.liar;
    sView = v;
    if (!v) return;
    const k = `${v.round}:${v.phase}:${v.phaseStartedAt}:${v.turn}`;
    if (did.has(k)) return;
    did.add(k);
    setTimeout(() => {
      if ((v.phase === 'describe' || v.phase === 'defense') && v.turn === sid) S.emit('liar.say', { text: v.phase === 'defense' ? '저는 아니에요' : '자주 마셔요' });
      else if (v.phase === 'final' && v.accused !== sid) S.emit('liar.final', { yes: true });
      else if (v.phase === 'discuss') S.emit('liar.discussEnd', {}); // ★ R101
      else if (v.phase === 'guess' && v.amLiar) S.emit('liar.guess', { text: '모르겠다' });
    }, 1500);
  });
  // ── 설정
  await realClick(H, 'button[data-mode="liar"]');
  await H.waitFor("document.querySelector('[data-liar-mode-row]') !== null", 4000).catch(() => false);
  const before = await J(H, "({ btns: [...document.querySelectorAll('[data-liar-mode-btn]')].map((b) => b.dataset.liarModeBtn + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(','), note: document.querySelector('[data-liar-note]')?.innerText ?? '' })");
  await realClick(H, '[data-liar-mode-btn="fool"]');
  await H.setInput('.mg-rounds-input', '2');
  await sleep(500);
  const after = await J(H, "({ btns: [...document.querySelectorAll('[data-liar-mode-btn]')].map((b) => b.dataset.liarModeBtn + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(','), note: document.querySelector('[data-liar-note]')?.innerText ?? '' })");
  await G.waitFor("document.querySelector('[data-liar-mode-chip]')?.innerText.includes('바보형')", 4000).catch(() => false);
  const gChip = await G.evaluate("document.querySelector('[data-liar-mode-chip]')?.innerText ?? ''");
  await snap(H, 'settings-fool-pc');
  await snap(G, 'settings-fool-m360');
  await set125();
  await snap(H, 'settings-fool-fhd125');
  await set1280();
  note('설정', { before, after, gChip });
  // ── 판
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const res = { assign: null, reveal: null };
  const seen = new Set();
  const t0 = Date.now();
  const CARD = "({ me: document.querySelector('[data-liar-me]')?.dataset.liarMe ?? '', kw: document.querySelector('[data-liar-keyword]')?.innerText ?? '', chip: !!document.querySelector('[data-liar-mode=\"fool\"]'), over: document.documentElement.scrollWidth - innerWidth })";
  while (Date.now() - t0 < 240000) {
    const st = await H.evaluate("(() => { const c = document.querySelector('[data-liar-phase]'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; return `${c.dataset.liarPhase}:${document.querySelector('.liar-round')?.innerText ?? ''}:${document.querySelector('[data-liar-turn=\"1\"] .liar-nick')?.innerText ?? ''}:${c.dataset.liarBout}`; })()");
    if (st === 'result') break;
    if (!st || seen.has(st)) {
      await sleep(150);
      continue;
    }
    seen.add(st);
    const [phase, roundTxt] = st.split(':');
    const round = Number((roundTxt ?? '').split('/')[0]);
    if ((phase === 'assign' || phase === 'describe') && round === 1 && !res.assign) {
      await sleep(300);
      res.assign = { h: await J(H, CARD), g: await J(G, CARD), s: { amLiar: sView?.amLiar, kw: sView?.keyword } };
      await snap(H, 'assign-fool-pc');
      await snap(G, 'assign-fool-m360');
      for (const th of ['night', 'office']) {
        await theme(H, th);
        await sleep(200);
        await snap(H, `assign-fool-${th}-pc`);
      }
      await theme(H, 'pastel');
      await set125();
      await snap(H, 'assign-fool-fhd125');
      await set1280();
    }
    if (phase === 'describe' || phase === 'defense') {
      for (const P of [H, G]) {
        if (await P.evaluate("!!document.querySelector('[data-liar-say-input]')")) {
          await P.setInput('[data-liar-say-input]', phase === 'defense' ? '아니라니까요' : '자주 봐요');
          await P.evaluate("document.querySelector('[data-liar-say-form]')?.requestSubmit()");
        }
      }
    }
    if (phase === 'vote' || phase === 'revote') {
      // 라이어 = 셋 중 키워드가 다른 사람
      await sleep(300);
      const kws = { h: await H.evaluate("document.querySelector('[data-liar-keyword]')?.innerText ?? ''"), g: await G.evaluate("document.querySelector('[data-liar-keyword]')?.innerText ?? ''"), s: sView?.keyword ?? '' };
      const odd = kws.h !== kws.g && kws.h !== kws.s ? 'h' : kws.g !== kws.h && kws.g !== kws.s ? 'g' : 's';
      const targetOf = async (P, who) => {
        const list = await J(P, "[...document.querySelectorAll('[data-liar-target]')].map((b) => ({ id: b.dataset.liarTarget, name: b.innerText.trim() }))");
        const want = { h: '바보방장', g: '바보손님', s: 'r8s손님0' }[who];
        return (list.find((x) => x.name.startsWith(want)) ?? list[0])?.id;
      };
      const hT = await targetOf(H, odd === 'h' ? 'g' : odd);
      if (hT) await realClick(H, `[data-liar-target="${hT}"]`).catch(() => {});
      const gT = await targetOf(G, odd === 'g' ? 'h' : odd);
      if (gT) await tapOn(G, `[data-liar-target="${gT}"]`).catch(() => {});
      const sT = await (async () => {
        const tid = await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_${{ h: 'r8h', g: 'r8g', s: 'r8s0' }[odd === 's' ? 'h' : odd]}`.toLowerCase()])).rows[0]?.id);
        return tid;
      })();
      if (sT) S.emit('liar.vote', { target: sT });
    }
    if (phase === 'discuss') {
      // ★ R101 — 자유 토론: 두 화면도 [토론 끝](과반이면 바로 투표)
      await sleep(250);
      await realClick(H, '[data-liar-discuss-end]').catch(() => {});
      await tapOn(G, '[data-liar-discuss-end]').catch(() => {});
    }
    if (phase === 'final') {
      await sleep(200);
      await realClick(H, '[data-liar-yes]').catch(() => {});
      await tapOn(G, '[data-liar-yes]').catch(() => {});
    }
    if (phase === 'guess') {
      for (const P of [H, G]) {
        if (await P.evaluate("!!document.querySelector('[data-liar-guess-input]')")) {
          await P.setInput('[data-liar-guess-input]', '모르겠다');
          await P.evaluate("document.querySelector('[data-liar-guess] form')?.requestSubmit()");
        }
      }
    }
    if (phase === 'reveal' && !res.reveal) {
      await sleep(300);
      res.reveal = { h: await J(H, "({ outcome: document.querySelector('[data-liar-reveal]')?.dataset.liarReveal ?? '', fool: document.querySelector('[data-liar-fool-word]')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth })"), g: await J(G, "({ fool: document.querySelector('[data-liar-fool-word]')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth })") };
      await snap(H, 'reveal-fool-pc');
      await snap(G, 'reveal-fool-m360');
      await set125();
      await snap(H, 'reveal-fool-fhd125');
      await set1280();
    }
    await sleep(100);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  note('배정', res.assign);
  note('공개', res.reveal);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r088'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r088'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r088', 'r088.json'), JSON.stringify(rows, null, 1));
  record('★★★ R088 설정 — 라이어 모드 줄(기본형 눌림 → 바보형) · 한 줄 설명 바뀜 · 손님 칩 "바보형"', before.btns === 'basic*,fool' && after.btns === 'basic,fool*' && /바보형/.test(after.note) && /바보형/.test(gChip), JSON.stringify({ before, after, gChip }));
  const a = res.assign;
  record('★★★ R088 바보형 배정 — 셋 다 시민 카드(라이어도 키워드) · 머리 "바보형" · 키워드 하나만 다름 · 넘침 0', !!a && a.h.me === 'citizen' && a.g.me === 'citizen' && a.s.amLiar === false && a.h.chip && a.g.chip && new Set([a.h.kw, a.g.kw, a.s.kw]).size === 2 && a.h.over <= 1 && a.g.over <= 1, JSON.stringify(a));
  record('★★ R088 공개 — "라이어가 받은 단어" PC · m360 · 넘침 0', !!res.reveal && /라이어가 받은 단어/.test(res.reveal.h.fool) && /라이어가 받은 단어/.test(res.reveal.g.fool) && res.reveal.h.over <= 1 && res.reveal.g.over <= 1, JSON.stringify(res.reveal));
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R087 — 테스트 1 피드백 화면 (D-344) (UICHECK_R087=1 · 묶음 r087 · docs/design/r087)
//   찬종 "이 사항들은 모든 해상도/배율/모바일에서 전부 재점검" — 방장 PC(1280 · 1536×864 · 1536×730 · 1920 · 2560 + ★ FHD 125% = 1536×864 @1.25)
//   · 손님 모바일 터치(360 · 390 · 430) · 세 테마(파스텔 · 밤 · 사무실) · 소켓 손님 2
//   ① 카탈로그: 숨긴 셋(빙고 · 이 노래 몇 년도 · 객관식) 없음 · 미니게임 수 1 받음
//   ② OX(버튼 가운데 · 버튼 글자 O/X 만 · 안내 아래 줄) · 순서대로 공개(맞은 쌍 크게) · 노래 공개(항목 번호 없음)
//   ③ 라이어: 큰 줄 · 설명칸 · 기록 패널(Tab) · 넘침 0
//   ④ 캐치마인드: 출제자 PC — 채팅 옆 · 캔버스 크기 · 도구 화면 안 · 힌트 셋 → 손님 힌트 띠 / 출제자 모바일 — 도구 줄 · 캔버스 너비
// =============================================================================
async function r087Flow(browser) {
  const PCV = [
    { n: 'pc', w: 1280, h: 720 },
    { n: 'lap', w: 1536, h: 864 },
    { n: 'lap2', w: 1536, h: 730 },
    { n: 'fhd', w: 1920, h: 1080 },
    { n: 'qhd', w: 2560, h: 1440 },
    { n: 'fhd125', w: 1536, h: 864, dpr: 1.25 },
  ];
  const MV = [
    { n: 'm360', w: 360, h: 740 },
    { n: 'm390', w: 390, h: 844 },
    { n: 'm430', w: 430, h: 932 },
  ];
  const setPc = async (P, v) => {
    await P.send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: v.dpr ?? 1, mobile: false });
    await sleep(380);
  };
  const setM = (P, v) => r068Touch(P, v.w, v.h, true);
  const H = await newPage(browser, 'R087-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'r7h', '칠방장');
  const roomId = await createRoom(H, 'R087 피드백');
  const G = await newPage(browser, 'R087-g', true);
  await signUp(G, 'r7g', '칠손님');
  await setM(G, MV[0]);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const socks = await socketGuests(roomId, 2, 'r7s');
  const sockIds = await withPg(async (c) => (await c.query(`SELECT id::text, login_id FROM accounts WHERE login_id = ANY($1)`, [[0, 1].map((i) => `${ACCOUNT_PREFIX}_r7s${i}`.toLowerCase())])).rows);
  socks.forEach((s, i) => (s.__id = sockIds.find((r) => r.login_id === `${ACCOUNT_PREFIX}_r7s${i}`.toLowerCase())?.id ?? null));
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r087] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const themes3 = async (P, name) => {
    for (const th of ['night', 'office']) {
      await theme(P, th);
      await sleep(200);
      await snap(P, `${name}-${th}`);
    }
    await theme(P, 'pastel');
  };
  const J = async (P, expr) => JSON.parse(await P.evaluate(`JSON.stringify(${expr})`));
  const OVER = 'document.documentElement.scrollWidth - innerWidth';
  const start = () => H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const waitResultBack = async () => {
    await H.waitFor("document.querySelector('.ranking') !== null", 300000).catch(() => false);
    await sleep(600);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '로비로')?.click()");
    await H.waitFor("document.querySelector('button[data-mode]') !== null", 8000).catch(() => false);
    await sleep(500);
  };

  // ── ① 카탈로그 · 미니게임 수 1
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '1');
  await sleep(500);
  const one = await J(H, "({ v: document.querySelector('.mg-rounds-input')?.value ?? '', min: document.querySelector('.mg-rounds-input')?.min ?? '' })");
  one.g = await G.evaluate("[...document.querySelectorAll('.set-value')].map((e) => e.innerText).join('|')");
  await realClick(H, '[data-mg-catalog-open]');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 4000).catch(() => false);
  await sleep(300);
  const cat = await J(H, "({ keys: [...document.querySelectorAll('.mg-cat-card')].map((c) => c.dataset.key), count: document.querySelector('.mg-cat-count')?.innerText ?? '' })");
  await snap(H, 'catalog-pc');
  await H.key('Escape');
  await sleep(300);
  note('미니게임 수 1 · 카탈로그', { one, cat });

  // ── ② OX · 순서대로 · 노래 (미니게임만 3개 — 하나씩)
  await H.setInput('.mg-rounds-input', '3');
  await sleep(300);
  await selectMinigames(H, ['ox', 'order', 'song']);
  await start();
  const stateOf = (P) => P.evaluate("(() => { const c = document.querySelector('.mg-card'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; const k = [...c.classList].find((x) => x.startsWith('mg-') && !x.startsWith('mg-phase') && x !== 'mg-card'); return `${k?.slice(3)}:${c.dataset.phase}:${document.querySelector('.mg-round')?.innerText ?? ''}`; })()");
  const OXM = "({ off: (() => { const b = document.querySelector('.ox-buttons')?.getBoundingClientRect(); const p = document.querySelector('.ox-buttons')?.parentElement?.getBoundingClientRect(); return b && p ? Math.round(Math.abs((b.left + b.right) / 2 - (p.left + p.right) / 2)) : null; })(), txt: [...document.querySelectorAll('.ox-btn')].map((b) => b.innerText.trim()).join(','), help: document.querySelector('[data-ox-mine]')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth, w: innerWidth })";
  const res = { ox: {}, order: {}, song: {}, liar: {}, draw: {} };
  const done = new Set();
  let oxQ = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 400000) {
    const st = await stateOf(H);
    if (st === 'result') break;
    if (!st || done.has(st)) {
      await sleep(120);
      continue;
    }
    done.add(st);
    const [k, phase] = st.split(':');
    if (k === 'ox' && phase === 'play' && oxQ < 3) {
      const pcs = PCV.slice(oxQ * 2, oxQ * 2 + 2);
      const mv = MV[oxQ];
      oxQ += 1;
      await sleep(150);
      await Promise.all([
        (async () => {
          for (const v of pcs) {
            await setPc(H, v);
            res.ox[v.n] = await J(H, OXM);
            await snap(H, `ox-play-${v.n}`);
          }
        })(),
        (async () => {
          await setM(G, mv);
          res.ox[mv.n] = await J(G, OXM);
          await snap(G, `ox-play-${mv.n}`);
        })(),
      ]);
      if (oxQ === 1) await themes3(H, 'ox-play-fhd125');
      await setPc(H, PCV[0]);
      await setM(G, MV[0]);
    }
    if (k === 'order' && phase === 'play') {
      // 방장이 다섯 장을 차례로(맞든 틀리든 — 공개에 "맞은 쌍 n / 10" 이 나오게)
      for (let i = 0; i < 5; i += 1) await H.evaluate(`[...document.querySelectorAll('[data-order-card]')].filter((b) => !b.classList.contains('picked'))[0]?.click()`);
    }
    if (k === 'order' && phase === 'roundResult' && !res.order.pc) {
      await sleep(300);
      for (const v of [PCV[0], PCV[5], PCV[3]]) {
        await setPc(H, v);
        res.order[v.n] = await J(H, "({ big: document.querySelector('.order-pairs-big')?.innerText ?? '', why: !!document.querySelector('.order-pairs-why'), over: document.documentElement.scrollWidth - innerWidth })");
        await snap(H, `order-reveal-${v.n}`);
      }
      res.order.m360 = await J(G, "({ big: document.querySelector('.order-pairs-big')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth })");
      await snap(G, 'order-reveal-m360');
      await setPc(H, PCV[0]);
    }
    if (k === 'song' && phase === 'roundResult' && !res.song.pc) {
      await sleep(300);
      res.song.pc = await J(H, "({ qno: document.querySelectorAll('.mg-result .qno').length, reveal: !!document.querySelector('.mg-result'), over: document.documentElement.scrollWidth - innerWidth })");
      await snap(H, 'song-reveal-pc');
      res.song.m360 = await J(G, "({ qno: document.querySelectorAll('.mg-result .qno').length, over: document.documentElement.scrollWidth - innerWidth })");
      await snap(G, 'song-reveal-m360');
    }
    await sleep(100);
  }
  note('OX · 순서대로 · 노래', res.ox);
  note('순서대로', res.order);
  note('노래', res.song);
  await waitResultBack();

  // ── ③ 라이어 (4명 · 2라운드) — 소켓은 4초 뒤에 말해 크기를 바꿔 찍을 틈을 둔다
  await realClick(H, 'button[data-mode="liar"]');
  await H.waitFor("document.querySelector('[data-liar-note]') !== null", 4000).catch(() => false);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  for (const s of socks) {
    const did = new Set();
    s.removeAllListeners('liar.state');
    s.on('liar.state', (p) => {
      const v = p.liar;
      if (!v) return;
      const key = `${v.round}:${v.phase}:${v.phaseStartedAt}:${v.turn}`;
      if (did.has(key)) return;
      did.add(key);
      setTimeout(() => {
        if ((v.phase === 'describe' || v.phase === 'defense') && v.turn === s.__id) s.emit('liar.say', { text: v.phase === 'defense' ? '진짜 아니에요 저는 시민' : '이건 자주 볼 수 있는 거예요' });
        else if (v.phase === 'vote' || v.phase === 'revote') {
          const pool = (v.phase === 'revote' && v.candidates ? v.candidates : v.participants).filter((a) => a !== s.__id);
          if (pool.length) s.emit('liar.vote', { target: pool[0] });
        } else if (v.phase === 'final' && v.accused !== s.__id) s.emit('liar.final', { yes: true });
        else if (v.phase === 'discuss') s.emit('liar.discussEnd', {}); // ★ R101
        else if (v.phase === 'guess' && v.amLiar) s.emit('liar.guess', { text: '모르겠다' });
      }, v.phase === 'describe' || v.phase === 'defense' ? 4000 : 600);
    });
  }
  await start();
  const LIM = "({ line: document.querySelector('[data-liar-stage-text]')?.innerText ?? '', fs: parseFloat(getComputedStyle(document.querySelector('[data-liar-stage-text]') ?? document.body).fontSize), say: !!document.querySelector('[data-liar-say-input]'), log: document.querySelector('[data-liar-log]')?.dataset.liarLog ?? '', over: document.documentElement.scrollWidth - innerWidth })";
  const ldone = new Set();
  let lineShot = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 300000) {
    const st = await H.evaluate("(() => { const c = document.querySelector('[data-liar-phase]'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; return `${c.dataset.liarPhase}:${document.querySelector('.liar-round')?.innerText ?? ''}:${document.querySelector('[data-liar-turn=\"1\"] .liar-nick')?.innerText ?? ''}:${c.dataset.liarBout}`; })()");
    if (st === 'result') break;
    if (!st || ldone.has(st)) {
      await sleep(150);
      continue;
    }
    ldone.add(st);
    const [phase] = st.split(':');
    const hTurn = await H.evaluate("!!document.querySelector('.liar-order li.me.turn')");
    const gTurn = await G.evaluate("!!document.querySelector('.liar-order li.me.turn')");
    if (phase === 'describe' && !lineShot && (await H.evaluate("!!document.querySelector('[data-liar-stage-text]') && !document.querySelector('.liar-stage-text.dim')")) && !hTurn && !gTurn) {
      lineShot = true;
      await Promise.all([
        (async () => {
          for (const v of PCV.slice(0, 3)) {
            await setPc(H, v);
            res.liar[v.n] = await J(H, LIM);
            await snap(H, `liar-describe-${v.n}`);
          }
        })(),
        (async () => {
          await setM(G, MV[1]);
          res.liar.m390 = await J(G, LIM);
          await snap(G, 'liar-describe-m390');
        })(),
      ]);
      await themes3(H, 'liar-describe-pc');
      await setPc(H, PCV[0]);
      await setM(G, MV[0]);
    }
    if ((phase === 'describe' || phase === 'defense') && (hTurn || gTurn)) {
      const P = hTurn ? H : G;
      if (!res.liar.sayShot) {
        res.liar.sayShot = await J(P, LIM);
        await snap(P, `liar-say-${hTurn ? 'pc' : 'm360'}`);
      }
      await P.setInput('[data-liar-say-input]', phase === 'defense' ? '저 아니에요 진짜로' : '동그랗고 자주 써요');
      await P.evaluate("document.querySelector('[data-liar-say-form]')?.requestSubmit()");
    }
    if (phase === 'vote' && !res.liar.vote) {
      await sleep(200);
      await H.evaluate('document.activeElement?.blur()');
      await H.key('Tab');
      await sleep(250);
      res.liar.vote = {};
      for (const v of [PCV[3], PCV[5]]) {
        await setPc(H, v);
        res.liar.vote[v.n] = await J(H, LIM);
        await snap(H, `liar-vote-log-${v.n}`);
      }
      await setPc(H, PCV[0]);
      await H.key('Tab');
    }
    if (phase === 'vote' || phase === 'revote') {
      const ids = await J(H, "[...document.querySelectorAll('[data-liar-target]')].map((b) => b.dataset.liarTarget)");
      if (ids[0]) await realClick(H, `[data-liar-target="${ids[0]}"]`).catch(() => {});
      const gIds = await J(G, "[...document.querySelectorAll('[data-liar-target]')].map((b) => b.dataset.liarTarget)");
      if (gIds[0]) await tapOn(G, `[data-liar-target="${gIds[0]}"]`).catch(() => {});
    }
    if (phase === 'discuss') {
      // ★ R101 — 자유 토론: 두 화면도 [토론 끝](과반이면 바로 투표)
      await sleep(250);
      await realClick(H, '[data-liar-discuss-end]').catch(() => {});
      await tapOn(G, '[data-liar-discuss-end]').catch(() => {});
    }
    if (phase === 'final') {
      await sleep(200);
      if (!res.liar.final) {
        res.liar.final = await J(H, "({ stage: document.querySelector('[data-liar-stage-line]')?.dataset.liarStageLine ?? '', btns: [...document.querySelectorAll('[data-liar-final] button')].map((b) => b.innerText.trim()).join(',') })");
        if (!res.liar.final.btns) res.liar.final.btns = await G.evaluate("[...document.querySelectorAll('[data-liar-final] button')].map((b) => b.innerText.trim()).join(',')");
        await snap(H, 'liar-final-pc');
        await snap(G, 'liar-final-m360');
      }
      await realClick(H, '[data-liar-yes]').catch(() => {});
      await tapOn(G, '[data-liar-yes]').catch(() => {});
    }
    if (phase === 'guess') {
      for (const P of [H, G]) {
        if (await P.evaluate("!!document.querySelector('[data-liar-guess-input]')")) {
          await P.setInput('[data-liar-guess-input]', '모르겠다');
          await P.evaluate("document.querySelector('[data-liar-guess] form')?.requestSubmit()");
        }
      }
    }
    await sleep(100);
  }
  note('라이어', res.liar);
  await waitResultBack();

  // ── ④ 캐치마인드 (4명 · 2라운드 — 출제 방장(PC) → 손님(모바일))
  await realClick(H, 'button[data-mode="draw"]');
  await H.waitFor("document.querySelector('button[data-mode=\"draw\"][aria-pressed=\"true\"]') !== null", 4000).catch(() => false);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  await start();
  const DRM = "(() => { const c = document.querySelector('[data-draw-canvas]')?.getBoundingClientRect(); const chat = document.querySelector('.chat-card')?.getBoundingClientRect(); const tools = [...document.querySelectorAll('[data-draw-tools] button')]; return { side: c ? Math.round(c.width) : 0, sq: c ? Math.abs(c.width - c.height) < 2 : false, inView: c ? c.bottom <= innerHeight + 1 && c.right <= innerWidth + 1 : false, chatBeside: c && chat ? chat.left >= c.right : false, tools: tools.length, toolsIn: tools.every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; }), hints: document.querySelector('[data-draw-hints]')?.dataset.drawHints ?? '', topicHidden: !!document.querySelector('[data-draw-topic-hidden]'), over: document.documentElement.scrollWidth - innerWidth, w: innerWidth, h: innerHeight }; })()";
  await H.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null", 15000).catch(() => false);
  await sleep(500);
  // 방장이 선 하나
  const box = await J(H, "(() => { const r = document.querySelector('[data-draw-canvas]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; })()");
  await H.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x + box.w * 0.2, y: box.y + box.w * 0.3, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 24; i += 1) await H.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + box.w * (0.2 + i * 0.025), y: box.y + box.w * (0.3 + Math.sin(i / 4) * 0.15), button: 'left', buttons: 1 });
  await H.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + box.w * 0.8, y: box.y + box.w * 0.3, button: 'left', clickCount: 1 });
  await sleep(400);
  res.draw.before = await J(G, DRM);
  for (const v of PCV) {
    await setPc(H, v);
    res.draw[v.n] = await J(H, DRM);
    await snap(H, `draw-drawer-${v.n}`);
  }
  await setPc(H, PCV[0]);
  await themes3(H, 'draw-drawer-pc');
  for (const kind of ['length', 'initial', 'topic']) {
    await realClick(H, `[data-draw-hint-btn="${kind}"]`).catch(() => {});
    await sleep(250);
  }
  res.draw.hostBtns = await J(H, "[...document.querySelectorAll('[data-draw-hint-btn]')].map((b) => b.disabled)");
  for (const v of MV) {
    await setM(G, v);
    res.draw[`g-${v.n}`] = await J(G, DRM);
    await snap(G, `draw-guesser-${v.n}`);
  }
  await setM(G, MV[0]);
  const kw = await H.evaluate("document.querySelector('[data-draw-keyword]')?.innerText ?? ''");
  await G.setInput('.chat-card input', kw);
  await G.click('전송');
  for (const s of socks) s.emit('chat.send', { text: kw, epoch: null });
  // 2라운드 — 손님(모바일) 출제
  await G.waitFor("document.querySelector('[data-draw-phase=\"draw\"]') !== null && !!document.querySelector('[data-draw-tools]')", 20000).catch(() => false);
  await sleep(500);
  for (const v of MV) {
    await setM(G, v);
    res.draw[`gd-${v.n}`] = await J(G, DRM);
    await snap(G, `draw-drawer-${v.n}`);
  }
  await setM(G, MV[0]);
  await snap(H, 'draw-guesser-pc');
  const kw2 = await G.evaluate("document.querySelector('[data-draw-keyword]')?.innerText ?? ''");
  await H.setInput('.chat-card input', kw2);
  await H.click('전송');
  for (const s of socks) s.emit('chat.send', { text: kw2, epoch: null });
  await H.waitFor("document.querySelector('.ranking') !== null", 30000).catch(() => false);
  note('캐치마인드', res.draw);

  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r087'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r087'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r087', 'r087.json'), JSON.stringify(rows, null, 1));
  const HIDDEN = ['bingo', 'songyear', 'choice'];
  record('★★★ R087 카탈로그 — 숨긴 셋(빙고 · 이 노래 몇 년도 · 객관식) 없음 · 미니게임 수 1 받음(최소 1)', cat.keys.length > 10 && !cat.keys.some((k) => HIDDEN.includes(k)) && one.v === '1' && one.min === '1' && /1개/.test(one.g), JSON.stringify({ one, cat }));
  const oxv = Object.entries(res.ox);
  record('★★★ R087 OX — 크기 9(PC 5 + 125% · 모바일 3) 버튼 가운데(≤ 2px) · 버튼 글자 O/X 만 · 넘침 0 · PC 키 안내 아래 줄 · 모바일 안내 없음', oxv.length === 9 && oxv.every(([, m]) => m.off !== null && m.off <= 2 && m.txt === 'O,X' && m.over <= 1) && oxv.filter(([n]) => !n.startsWith('m')).every(([, m]) => /O · X 키/.test(m.help) || /골랐어요/.test(m.help)) && oxv.filter(([n]) => n.startsWith('m')).every(([, m]) => !/키/.test(m.help)), JSON.stringify(res.ox));
  record('★★ R087 순서대로 공개 — "맞은 쌍 n / 10 → n점" 크게 · 뜻 한 줄 · 넘침 0(PC 3 · m360)', ['pc', 'fhd125', 'fhd'].every((n) => /맞은 쌍 .*\/ 10/.test(res.order[n]?.big ?? '') && res.order[n].why && res.order[n].over <= 1) && res.order.m360?.over <= 1, JSON.stringify(res.order));
  record('★★ R087 노래 공개 — 항목 번호(song-0000) 안 보임 · 넘침 0', res.song.pc?.reveal && res.song.pc.qno === 0 && res.song.m360?.qno === 0 && res.song.pc.over <= 1 && res.song.m360.over <= 1, JSON.stringify(res.song));
  const lv = ['pc', 'lap', 'lap2', 'm390'].map((n) => res.liar[n]);
  record('★★★ R087 라이어 — 큰 줄(설명 · 1.1rem↑) 크기 4 · 내 차례 설명칸 · Tab 기록 펼침(FHD · 125%) · 죽인다/살린다 · 넘침 0', lv.every((m) => m && m.line && m.fs >= 17 && m.over <= 1) && res.liar.sayShot?.say === true && ['fhd', 'fhd125'].every((n) => res.liar.vote?.[n]?.log === 'open') && /죽인다/.test(res.liar.final?.btns ?? ''), JSON.stringify(res.liar));
  const dpc = PCV.map((v) => res.draw[v.n]);
  record('★★★ R087 캐치마인드 출제자 PC 6 — 채팅 옆 · 정사각 · 화면 안 · 도구 화면 안 · 넘침 0 · 1280×720 ≥ 560 · FHD ≥ 760 · 125% ≥ 560', dpc.every((m) => m && m.chatBeside && m.sq && m.inView && m.toolsIn && m.over <= 1) && res.draw.pc.side >= 560 && res.draw.fhd.side >= 760 && res.draw.fhd125.side >= 560, JSON.stringify(dpc.map((m) => m && [m.w, m.side, m.chatBeside, m.toolsIn, m.over])));
  record('★★★ R087 캐치마인드 힌트 — 손님은 처음 주제 숨김 · 힌트 셋 뒤 띠 3(모바일 3 크기) · 방장 버튼 셋 다 꺼짐', res.draw.before?.topicHidden === true && MV.every((v) => res.draw[`g-${v.n}`]?.hints === 'length,initial,topic') && res.draw.hostBtns?.every(Boolean), JSON.stringify({ b: res.draw.before?.topicHidden, g: MV.map((v) => res.draw[`g-${v.n}`]?.hints), btns: res.draw.hostBtns }));
  record('★★ R087 캐치마인드 모바일 — 맞히는 쪽 캔버스 ≈ 화면 너비(−60 안) · 출제자 도구 줄 · 넘침 0(3 크기 × 2)', MV.every((v) => { const g = res.draw[`g-${v.n}`]; const d = res.draw[`gd-${v.n}`]; return g && d && g.side >= v.w - 60 && d.side >= v.w - 60 && d.tools >= 10 && g.over <= 1 && d.over <= 1; }), JSON.stringify(MV.map((v) => [res.draw[`g-${v.n}`]?.side, res.draw[`gd-${v.n}`]?.side, res.draw[`gd-${v.n}`]?.tools])));
  for (const s of socks) s.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R082 — 라이어 게임 화면 (D-339) (UICHECK_R082=1 · 묶음 r082 · docs/design/r082)
//   방장 PC 1280×720 · 손님 m360 터치 · 소켓 손님 2(4명) · 2라운드
//   설정 방식 세 버튼 · 주제/키워드 카드 · 라이어 카드 · 설명 차례(차례 아닌 채팅 알림) · 투표 카드 · 집계 · 항변 · 찬반 · 공개 · 결과 · 세 테마 · m360
// =============================================================================
async function r082Flow(browser) {
  const H = await newPage(browser, 'R082-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'lyh', '라이어방장');
  const roomId = await createRoom(H, 'R082 라이어');
  const G = await newPage(browser, 'R082-g', true);
  await signUp(G, 'lyg', '라이어손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const socks = await socketGuests(roomId, 2, 'lys');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r082] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const over = (P) => P.evaluate('document.documentElement.scrollWidth - innerWidth');
  const sv = new Map();
  const sockIds = await withPg(async (c) => (await c.query(`SELECT id::text, login_id FROM accounts WHERE login_id = ANY($1)`, [[0, 1].map((i) => `${ACCOUNT_PREFIX}_lys${i}`.toLowerCase())])).rows);
  socks.forEach((s, i) => (s.__id = sockIds.find((r) => r.login_id === `${ACCOUNT_PREFIX}_lys${i}`.toLowerCase())?.id ?? null));
  // ★ 소켓 손님은 스스로 — 자기 차례 한마디 · 항변 · 투표(첫 후보) · 찬성 · 라이어면 아무 답
  for (const s of socks) {
    const did = new Set();
    s.on('liar.state', (p) => {
      const v = p.liar;
      sv.set(s, v);
      if (!v) return;
      const k = `${v.round}:${v.phase}:${v.phaseStartedAt}:${v.turn}`;
      if (did.has(k)) return;
      did.add(k);
      setTimeout(() => {
        // ★ R087 — 설명 · 변론은 설명칸(liar.say) · 투표는 바퀴마다 전원 대상
        if ((v.phase === 'describe' || v.phase === 'defense') && v.turn === s.__id) s.emit('liar.say', { text: v.phase === 'defense' ? '아니라니까요' : '음 그거요' });
        else if (v.phase === 'vote' || v.phase === 'revote') {
          const pool = (v.phase === 'revote' && v.candidates ? v.candidates : v.participants).filter((a) => a !== s.__id);
          if (pool.length) s.emit('liar.vote', { target: pool[0] });
        } else if (v.phase === 'final' && v.accused !== s.__id) s.emit('liar.final', { yes: true });
        else if (v.phase === 'discuss') s.emit('liar.discussEnd', {}); // ★ R101
        else if (v.phase === 'guess' && v.amLiar) s.emit('liar.guess', { text: '모르겠다' });
      }, 600);
    });
  }
  const chat = (P, text) => P.setInput('.chat-card input', text).then(() => P.click('전송'));
  // ★ R087 — 설명 · 변론은 설명칸
  const say = (P, text) => P.setInput('[data-liar-say-input]', text).then(() => P.evaluate("document.querySelector('[data-liar-say-form]')?.requestSubmit()"));

  // ── 설정 — 방식 라이어
  await realClick(H, 'button[data-mode="liar"]');
  await H.waitFor("document.querySelector('[data-liar-note]') !== null", 4000).catch(() => false);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(400);
  const setting = JSON.parse(await H.evaluate("JSON.stringify({ modes: [...document.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(','), note: !!document.querySelector('[data-liar-note]'), quizRows: !!document.querySelector('.settings .count-input:not(.mg-rounds-input)'), team: document.querySelector('[data-team-toggle]')?.disabled ?? null, rounds: document.querySelector('.mg-rounds-input')?.value })"));
  await snap(H, 'settings-liar-pc');
  await G.waitFor("[...document.querySelectorAll('.settings .chip')].some((c) => c.innerText.trim() === '라이어')", 4000).catch(() => false);
  await snap(G, 'settings-liar-m360');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const done = new Set();
  const res = { assign: null, notice: null, vote: null, tally: null, final: null, reveal: [], guess: null };
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await H.evaluate("(() => { const c = document.querySelector('[data-liar-phase]'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; return `${c.dataset.liarPhase}:${document.querySelector('.liar-round')?.innerText ?? ''}:${document.querySelector('[data-liar-turn=\"1\"] .liar-nick')?.innerText ?? ''}:${document.querySelectorAll('.liar-order .defense').length}`; })()");
    if (st === 'result') break;
    if (!st || done.has(st)) {
      await sleep(150);
      continue;
    }
    done.add(st);
    const [phase, roundTxt] = st.split(':');
    const round = Number((roundTxt ?? '').split('/')[0]);
    if ((phase === 'assign' || phase === 'describe') && round === 1 && !res.assign) {
      await sleep(300);
      res.assign = JSON.parse(await H.evaluate("JSON.stringify({ topic: document.querySelector('[data-liar-topic]')?.innerText ?? '', me: document.querySelector('[data-liar-me]')?.dataset.liarMe ?? '', kw: document.querySelector('[data-liar-keyword]')?.innerText ?? null })"));
      res.assignG = JSON.parse(await G.evaluate("JSON.stringify({ me: document.querySelector('[data-liar-me]')?.dataset.liarMe ?? '', over: document.documentElement.scrollWidth - innerWidth })"));
      await snap(H, 'assign-pc');
      await snap(G, 'assign-m360');
    }
    if (phase === 'describe') {
      const hTurn = await H.evaluate("!!document.querySelector('.liar-order li.me.turn')");
      const gTurn = await G.evaluate("!!document.querySelector('.liar-order li.me.turn')");
      if (round === 1 && res.notice === null && !gTurn) {
        res.gSayInput = await G.evaluate("!!document.querySelector('[data-liar-say-input]') && !document.querySelector('.liar-order li.me.turn')");
        await chat(G, '내가 먼저 채팅');
        await sleep(500);
        res.notice = await G.evaluate("document.querySelector('[data-liar-notice]')?.innerText ?? ''");
        res.chatShown = await H.evaluate("document.querySelector('.chat-card')?.innerText.includes('내가 먼저 채팅') ?? false");
        await snap(G, 'describe-chat-m360');
      }
      if (round === 1 && !res.stageLine && (await H.evaluate("!!document.querySelector('[data-liar-stage-text]')"))) {
        res.stageLine = await H.evaluate("document.querySelector('[data-liar-stage-text]')?.innerText ?? ''");
        await snap(H, 'describe-stage-line-pc');
      }
      if (hTurn) {
        if (round === 1) {
          res.hSayInput = await H.evaluate("!!document.querySelector('[data-liar-say-input]')");
          await snap(H, 'describe-myturn-pc');
        }
        await say(H, '자주 먹어요');
      } else if (gTurn) await say(G, '좋아해요');
    }
    if (phase === 'vote' || phase === 'revote') {
      await sleep(300);
      const ids = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('[data-liar-target]')].map((b) => b.dataset.liarTarget))"));
      if (round === 1) {
        res.vote = { n: ids.length, gN: await G.evaluate("document.querySelectorAll('[data-liar-target]').length"), gOver: await over(G) };
        await snap(H, 'vote-pc');
        await snap(G, 'vote-m360');
      }
      const target = ids[0];
      await realClick(H, `[data-liar-target="${target}"]`).catch(() => {});
      if (round === 1) {
        await sleep(250);
        res.picked = await H.evaluate("document.querySelector('.liar-person.picked')?.dataset.liarTarget ?? ''");
        await snap(H, 'vote-picked-pc');
      }
      const gIds = JSON.parse(await G.evaluate("JSON.stringify([...document.querySelectorAll('[data-liar-target]')].map((b) => b.dataset.liarTarget))"));
      await tapOn(G, `[data-liar-target="${gIds.includes(target) ? target : gIds[0]}"]`).catch(() => {});
    }
    if ((phase === 'defense' || phase === 'revote') && !res.tally) {
      // ★ R101 — 투표 결과 화면(tally) 없이 다음 단계 위쪽 줄로 남는다
      await sleep(200);
      res.tally = await H.evaluate("document.querySelectorAll('[data-liar-tally] li').length");
      await snap(H, 'tally-pc');
      // ★ R087 — 설명 기록 패널: Tab 으로 펼침 · 다시 Tab 으로 접음
      await H.evaluate('document.activeElement?.blur()');
      await H.key('Tab');
      await sleep(250);
      res.log = { open: await H.evaluate("document.querySelector('[data-liar-log]')?.dataset.liarLog ?? ''"), n: await H.evaluate("document.querySelectorAll('[data-liar-log-list] li').length") };
      await snap(H, 'log-open-pc');
      await tapOn(G, '[data-liar-log-toggle]').catch(() => {});
      await sleep(250);
      res.logG = await G.evaluate("document.querySelector('[data-liar-log]')?.dataset.liarLog ?? ''");
      await snap(G, 'log-open-m360');
      await H.key('Tab');
      await sleep(200);
      res.log.closed = await H.evaluate("document.querySelector('[data-liar-log]')?.dataset.liarLog ?? ''");
    }
    if (phase === 'defense') {
      if (!res.defenseShot) {
        res.defenseShot = true;
        await snap(H, 'defense-pc');
        await snap(G, 'defense-m360');
      }
      const hTurn = await H.evaluate("!!document.querySelector('.liar-order li.me.turn')");
      const gTurn = await G.evaluate("!!document.querySelector('.liar-order li.me.turn')");
      if (hTurn) await say(H, '저 아니에요');
      else if (gTurn) await say(G, '억울해요');
    }
    if (phase === 'discuss') {
      // ★ R101 — 자유 토론: 두 화면도 [토론 끝](과반이면 바로 투표)
      await sleep(250);
      await realClick(H, '[data-liar-discuss-end]').catch(() => {});
      await tapOn(G, '[data-liar-discuss-end]').catch(() => {});
    }
    if (phase === 'final') {
      await sleep(200);
      if (!res.final) {
        res.final = { btns: await H.evaluate("document.querySelectorAll('[data-liar-final] button').length"), gBtns: await G.evaluate("document.querySelectorAll('[data-liar-final] button').length"), labels: (await H.evaluate("[...document.querySelectorAll('[data-liar-final] button')].map((b) => b.innerText.trim()).join(',')")) || (await G.evaluate("[...document.querySelectorAll('[data-liar-final] button')].map((b) => b.innerText.trim()).join(',')")), stage: await H.evaluate("document.querySelector('[data-liar-stage-line]')?.dataset.liarStageLine ?? ''") };
        await snap(H, 'final-pc');
        await snap(G, 'final-m360');
      }
      await realClick(H, '[data-liar-yes]').catch(() => {});
      await tapOn(G, '[data-liar-yes]').catch(() => {});
    }
    if (phase === 'guess') {
      await sleep(200);
      if (!res.guess) {
        res.guess = true;
        await snap(H, 'guess-pc');
      }
      if (await H.evaluate("!!document.querySelector('[data-liar-guess-input]')")) {
        await H.setInput('[data-liar-guess-input]', '모르겠다');
        await H.evaluate("document.querySelector('[data-liar-guess] form')?.requestSubmit()");
      }
      if (await G.evaluate("!!document.querySelector('[data-liar-guess-input]')")) {
        await G.setInput('[data-liar-guess-input]', '모르겠다');
        await G.evaluate("document.querySelector('[data-liar-guess] form')?.requestSubmit()");
      }
    }
    if (phase === 'reveal') {
      await sleep(300);
      res.reveal.push(JSON.parse(await H.evaluate("JSON.stringify({ outcome: document.querySelector('[data-liar-reveal]')?.dataset.liarReveal ?? '', text: document.querySelector('.liar-reveal-main')?.innerText ?? '' })")));
      if (res.reveal.length === 1) {
        await snap(H, 'reveal-pc');
        await snap(G, 'reveal-m360');
        await theme(H, 'office');
        await sleep(200);
        await snap(H, 'reveal-office-pc');
        await theme(H, 'night');
        await sleep(200);
        await snap(H, 'reveal-night-pc');
        await theme(H, 'pastel');
        await theme(G, 'office');
        await sleep(200);
        await snap(G, 'reveal-office-m360');
        await theme(G, 'pastel');
      }
    }
    await sleep(100);
  }
  await H.waitFor("document.querySelector('.ranking') !== null", 20000).catch(() => false);
  await sleep(500);
  const result = JSON.parse(await H.evaluate("JSON.stringify({ rows: document.querySelectorAll('.ranking li').length })"));
  await snap(H, 'result-pc');
  await snap(G, 'result-m360');
  note('설정', setting);
  note('진행', res);
  note('결과', result);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r082'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r082'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r082', 'r082.json'), JSON.stringify(rows, null, 1));
  record('★★★ R082 설정 — 방식 세 버튼(라이어 눌림) · 한 줄 설명 · 문제 수 숨김 · 팀전 잠김 · 라운드 2', ['quiz,minigame,liar*', 'quiz,minigame,liar*,draw'].includes(setting.modes) && setting.note && !setting.quizRows && setting.team === true && setting.rounds === '2', JSON.stringify(setting));
  record('★★★ R082 배정 — 주제 · 내 카드(시민 = 키워드 / 라이어 = 카드) · m360 넘침 0', res.assign && res.assign.topic && (res.assign.me === 'liar' ? res.assign.kw === null : !!res.assign.kw) && res.assignG?.me && res.assignG.over <= 1, JSON.stringify({ a: res.assign, g: res.assignG }));
  record('★★★ R087 설명칸 분리 — 차례 아닌 채팅은 그대로 채팅(알림 없음 · 설명칸 없음) · 내 차례에만 설명칸 · 큰 줄에 설명', res.notice === '' && res.chatShown === true && res.gSayInput === false && res.hSayInput !== false && !!res.stageLine, JSON.stringify({ n: res.notice, c: res.chatShown, g: res.gSayInput, h: res.hSayInput, line: res.stageLine }));
  record('★★★ R087 설명 기록 — Tab 펼침(기록 4+) · 다시 Tab 접힘 · 폰 버튼 펼침', res.log?.open === 'open' && res.log.n >= 4 && res.log.closed === 'closed' && res.logG === 'open', JSON.stringify({ l: res.log, g: res.logG }));
  record('★★★ R082 투표 — 사람 카드 3(나 빼고) · m360 3 · 고른 카드 표시', res.vote?.n === 3 && res.vote.gN === 3 && res.vote.gOver <= 1 && !!res.picked, JSON.stringify({ v: res.vote, p: res.picked }));
  record('★★ R082 집계 · 죽일까 버튼(지목된 사람 아니면 둘 · 죽인다 · 살린다) · 변론 큰 줄', (res.tally ?? 0) >= 3 && res.final !== null && /죽인다/.test(res.final.labels ?? '') && res.final.stage === 'defense', JSON.stringify({ t: res.tally, f: res.final }));
  record('★★★ R082 공개 2라운드 — 라이어 · 키워드 · 결과 · 결과 화면', res.reveal.length === 2 && res.reveal.every((x) => x.outcome && /라이어는/.test(x.text)) && result.rows === 4, JSON.stringify({ r: res.reveal, result }));
  for (const s of socks) s.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R081 — 순서대로 · 빙고 화면 (D-338) (UICHECK_R081=1 · 묶음 r081 · docs/design/r081)
//   방장 PC 1280×720 · 손님 m360 터치 · 소켓 손님 1 — 미니게임만 2개(순서대로 · 빙고)
//   순서대로: 카드 번호 ①~⑤ · 다시 눌러 취소 · 공개(정답 · 연도 · 맞은 쌍 10) / 빙고: 채우기 입력 → 판 · 직접 n칸 · 호명(칸 누르기) · 칠함 · 호명 띠 · 결과 · 세 테마 · m360 4×4 넘침 0
// =============================================================================
async function r081Flow(browser) {
  const H = await newPage(browser, 'R081-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'obh', '순서방장');
  const roomId = await createRoom(H, 'R081 미니게임');
  const G = await newPage(browser, 'R081-g', true);
  await signUp(G, 'obg', '빙고손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'obs');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r081] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const over = (P) => P.evaluate('document.documentElement.scrollWidth - innerWidth');
  const itemsOf = (topic) => withPg(async (c) => (await c.query(`SELECT name FROM topic_items WHERE topic = $1 AND active ORDER BY seq`, [topic])).rows.map((r) => (r.name.length > 30 ? r.name.replace(/\s*\(.*$/, '') : r.name)));
  const stateOf = (P) => P.evaluate("(() => { const c = document.querySelector('.mg-card'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; const k = [...c.classList].find((x) => x.startsWith('mg-') && !x.startsWith('mg-phase') && x !== 'mg-card'); return `${k?.slice(3)}:${c.dataset.phase}:${document.querySelector('.mg-round')?.innerText ?? ''}`; })()");

  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(300);
  const picked = await selectMinigames(H, ['order', 'bingo']);
  await sleep(300);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const done = new Set();
  const res = { order: [], bingo: { calls: [] } };
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const st = await stateOf(H);
    if (st === 'result') break;
    if (!st || done.has(st)) {
      await sleep(150);
      continue;
    }
    done.add(st);
    const [key, phase] = st.split(':');
    if (key === 'order' && phase === 'rules') await snap(H, 'order-rules-pc');
    if (key === 'order' && phase === 'play') {
      const ids = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('[data-order-card]')].map((b) => b.dataset.orderCard))"));
      const years = await withPg(async (c) => new Map((await c.query(`SELECT id, year FROM topic_items WHERE id = ANY($1)`, [ids])).rows.map((r) => [r.id, r.year])));
      const right = [...ids].sort((a, b) => years.get(a) - years.get(b));
      const first = res.order.length === 0;
      if (first) {
        for (const id of right.slice(0, 3)) await realClick(H, `[data-order-card="${id}"]`);
        await sleep(200);
        const nums = await H.evaluate("[...document.querySelectorAll('[data-order-card]')].map((b) => b.dataset.orderAt).join(',')");
        await snap(H, 'order-play-pc');
        await realClick(H, `[data-order-card="${right[1]}"]`);
        await sleep(150);
        const after = await H.evaluate("[...document.querySelectorAll('[data-order-at]')].filter((b) => b.dataset.orderAt).length");
        res.order.push({ nums, cancelLeft: after });
        for (const id of right.slice(1)) await realClick(H, `[data-order-card="${id}"]`);
        await tapOn(G, `[data-order-card="${right[4]}"]`).catch(() => {});
        await tapOn(G, `[data-order-card="${right[0]}"]`).catch(() => {});
        await sleep(200);
        res.gOrder = JSON.parse(await G.evaluate("JSON.stringify({ over: document.documentElement.scrollWidth - innerWidth, n: document.querySelectorAll('[data-order-card]').length, inView: [...document.querySelectorAll('[data-order-card]')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }) })"));
        await snap(G, 'order-play-m360');
      } else {
        for (const id of right) await realClick(H, `[data-order-card="${id}"]`);
        res.order.push({});
      }
    }
    if (key === 'order' && phase === 'roundResult' && !res.orderReveal) {
      await sleep(300);
      res.orderReveal = JSON.parse(await H.evaluate("JSON.stringify({ rows: document.querySelectorAll('.order-answer li').length, ok: document.querySelectorAll('.order-answer li.ok').length, pairs: document.querySelector('[data-order-pairs]')?.dataset.orderPairs ?? '' })"));
      await snap(H, 'order-reveal-pc');
      await snap(G, 'order-reveal-m360');
      await theme(H, 'office');
      await sleep(200);
      await snap(H, 'order-reveal-office-pc');
      await theme(H, 'pastel');
    }
    if (key === 'bingo' && phase === 'rules') await snap(H, 'bingo-rules-pc');
    if (key === 'bingo' && phase === 'play' && st.includes('채우기')) {
      const topic = await H.evaluate("document.querySelector('[data-topic]')?.dataset.topic ?? ''");
      const names = await itemsOf(topic);
      const enter = async (P, t) => {
        await P.setInput('[data-topic-input]', t);
        await P.evaluate("document.querySelector('.topic-form')?.requestSubmit()");
        await sleep(120);
      };
      for (const n of names.slice(0, 6)) await enter(H, n);
      await snap(H, 'bingo-fill-pc');
      for (const n of names.slice(6, 16)) await enter(H, n);
      for (const n of [names[0], names[20], names[21]]) await enter(G, n);
      await sleep(300);
      res.bingo.fillH = await H.evaluate("[...document.querySelectorAll('[data-bingo-cell]')].filter((c) => !c.classList.contains('empty')).length");
      res.bingo.fillG = JSON.parse(await G.evaluate("JSON.stringify({ filled: [...document.querySelectorAll('[data-bingo-cell]')].filter((c) => !c.classList.contains('empty')).length, over: document.documentElement.scrollWidth - innerWidth, board: (() => { const r = document.querySelector('[data-bingo-board]')?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.right), innerWidth] : null; })() })"));
      await snap(G, 'bingo-fill-m360');
    }
    if (key === 'bingo' && phase === 'roundResult' && st.includes('채우기')) {
      await sleep(300);
      res.bingo.fillReveal = await G.evaluate("document.querySelector('[data-bingo-mine]')?.innerText ?? ''");
      await snap(H, 'bingo-filled-pc');
      await snap(G, 'bingo-filled-m360');
    }
    if (key === 'bingo' && phase === 'play' && st.includes('호명')) {
      await realClick(H, '[data-bingo-cell]:not([data-on="1"]):not(:disabled)').catch(() => {});
      await tapOn(G, '[data-bingo-cell]:not([data-on="1"]):not(:disabled)').catch(() => {});
      if (res.bingo.calls.length === 0) {
        await sleep(200);
        await snap(H, 'bingo-call-pc');
        await snap(G, 'bingo-call-m360');
      }
    }
    if (key === 'bingo' && phase === 'roundResult' && st.includes('호명')) {
      await sleep(250);
      const r = JSON.parse(await H.evaluate("JSON.stringify({ band: Number(document.querySelector('[data-bingo-band]')?.dataset.bingoBand ?? 0), on: document.querySelectorAll('[data-bingo-cell][data-on=\"1\"]').length, newB: document.querySelector('[data-bingo-new]') !== null })"));
      res.bingo.calls.push(r);
      if (res.bingo.calls.length === 1) {
        await snap(H, 'bingo-reveal-pc');
        await snap(G, 'bingo-reveal-m360');
        await theme(G, 'office');
        await sleep(200);
        await snap(G, 'bingo-reveal-office-m360');
        await theme(G, 'night');
        await sleep(200);
        await snap(G, 'bingo-reveal-night-m360');
        await theme(G, 'pastel');
      }
    }
    if (key === 'bingo' && phase === 'final') {
      await sleep(300);
      res.bingo.final = await H.evaluate("document.querySelectorAll('.mg-final li').length");
      await snap(H, 'bingo-final-pc');
      await snap(G, 'bingo-final-m360');
      res.bingo.overG = await over(G);
    }
    await sleep(100);
  }
  note('순서대로', { order: res.order, reveal: res.orderReveal, g: res.gOrder });
  note('빙고', res.bingo);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r081'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r081'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r081', 'r081.json'), JSON.stringify(rows, null, 1));
  const o0 = res.order[0] ?? {};
  const b = res.bingo;
  record('★★★ R081 순서대로 — 누른 차례 ①②③ · 둘째를 다시 누르면 그것과 뒤 취소(1장 남음)', /1/.test(o0.nums ?? '') && (o0.nums ?? '').split(',').filter(Boolean).length === 3 && o0.cancelLeft === 1, JSON.stringify(o0));
  record('★★ R081 순서대로 m360 — 카드 5 · 화면 안 · 넘침 0', res.gOrder?.n === 5 && res.gOrder.inView && res.gOrder.over <= 1, JSON.stringify(res.gOrder));
  record('★★★ R081 순서대로 공개 — 정답 5줄 · 내 자리 다 맞음 · 맞은 쌍 10', res.orderReveal?.rows === 5 && res.orderReveal.ok === 5 && res.orderReveal.pairs === '10', JSON.stringify(res.orderReveal));
  record('★★★ R081 빙고 채우기 — 방장 16칸 · 손님 3칸(m360 판 화면 안 · 넘침 0)', b.fillH === 16 && b.fillG?.filled === 3 && b.fillG.over <= 1 && b.fillG.board && b.fillG.board[0] >= 0 && b.fillG.board[1] <= b.fillG.board[2], JSON.stringify({ h: b.fillH, g: b.fillG }));
  record('★★ R081 빙고 — 판 완성 뒤 "직접 채운 3칸 · 나머지 13칸은 자동"', /직접 채운 3칸/.test(b.fillReveal ?? ''), b.fillReveal ?? '');
  record('★★★ R081 빙고 호명 — 띠 3명 · 칠한 칸이 늘어남 · 끝', b.calls.length >= 1 && b.calls[0].band === 3 && b.calls[b.calls.length - 1].on > b.calls[0].on - 1 && b.calls[0].on >= 1, JSON.stringify(b.calls.slice(0, 3)));
  record('★★ R081 빙고 최종 — 3명 · m360 넘침 0', b.final === 3 && b.overG <= 1, JSON.stringify({ f: b.final, o: b.overG }));
  record('★ R081 설정 — 둘 고름', picked.split(',').length === 2, picked);
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R080 — 미니게임 1차 화면 (D-330 · D-337) (UICHECK_R080=1 · 묶음 r080 · docs/design/r080)
//   방장 PC 1280×720 · 손님 m360 터치 · 소켓 손님 1 — 미니게임만 3개(많이 말하기 · 겹치면 무효 · 객관식 5연속)
//   많이 말하기: 입력 ✓ / 이미 말함 / ✗ · 판 중 남의 답·참여 수 없음 · 공개(나만 · 못 말한 것) · 제보 버튼(채워진 글) · 모바일 입력
//   겹치면 무효: 같은 답 둘 = 겹침 · 혼자 = +1 · 객관식: 보기 넷 · 정답 표시 · 최종 10문제 정답 · 세 테마 · 넘침 0
// =============================================================================
async function r080Flow(browser) {
  const H = await newPage(browser, 'R080-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'mgh', '말하기방장');
  const roomId = await createRoom(H, 'R080 미니게임');
  const G = await newPage(browser, 'R080-g', true);
  await signUp(G, 'mgg', '모바일손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const [S] = await socketGuests(roomId, 1, 'mgs');
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r080] ${k}: ${JSON.stringify(v)}`);
  };
  const theme = (P, th) => P.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(th)})`);
  const over = (P) => P.evaluate('document.documentElement.scrollWidth - innerWidth');
  // ★ R081 — 긴 이름(통화)은 괄호 앞만(입력칸 40자)
  const itemsOf = (topic) => withPg(async (c) => (await c.query(`SELECT name, variants FROM topic_items WHERE topic = $1 AND active ORDER BY seq`, [topic])).rows.map((r) => ({ ...r, name: r.name.length > 30 ? r.name.replace(/\s*\(.*$/, '') : r.name })));
  const answerOf = (text) => withPg(async (c) => (await c.query(`SELECT display_answer FROM questions WHERE question_text = $1 LIMIT 1`, [text])).rows[0]?.display_answer ?? null);
  const stateOf = (P) => P.evaluate("(() => { const c = document.querySelector('.mg-card'); if (!c) return document.querySelector('.ranking') ? 'result' : ''; const k = [...c.classList].find((x) => x.startsWith('mg-') && !x.startsWith('mg-phase') && x !== 'mg-card'); return `${k?.slice(3)}:${c.dataset.phase}:${document.querySelector('.mg-round')?.innerText ?? ''}`; })()");
  let sMg = null;
  S.on('minigame.state', (p) => (sMg = p.minigame));

  // ── 설정 — 미니게임만 · 3개 · 셋만
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '3');
  await sleep(300);
  const picked = await selectMinigames(H, ['many', 'unique', 'choice']);
  await sleep(300);
  await snap(H, 'settings-pc');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const done = new Set();
  const res = { many: null, unique: [], choice: [], report: null, themes: [] };
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await stateOf(H);
    if (st === 'result') break;
    if (!st || done.has(st)) {
      await sleep(150);
      continue;
    }
    done.add(st);
    const [key, phase] = st.split(':');
    if (key === 'many' && phase === 'rules') await snap(H, 'many-rules-pc');
    if (key === 'many' && phase === 'play') {
      const topic = await H.evaluate("document.querySelector('[data-topic]')?.dataset.topic ?? ''");
      const its = await itemsOf(topic);
      const enter = async (P, t) => {
        await P.setInput('[data-topic-input]', t);
        await P.evaluate("document.querySelector('.topic-form')?.requestSubmit()");
        await sleep(250);
      };
      for (const t of [its[0].name, its[1].name, its[0].name, '정답아닌말']) await enter(H, t);
      const fbH = await H.evaluate("document.querySelector('.topic-fb')?.dataset.feedback ?? ''");
      await enter(H, its[2].name);
      await enter(G, its[0].name);
      await enter(G, its[3].name);
      S.emit('minigame.submit', { token: sMg?.token, roundIndex: 0, input: { text: its[4].name } });
      await sleep(400);
      const mid = JSON.parse(await H.evaluate("JSON.stringify({ count: Number(document.querySelector('[data-many-count]')?.dataset.manyCount ?? -1), chips: document.querySelectorAll('.topic-mine .topic-chip').length, submittedLine: document.querySelector('.mg-submitted') !== null, focus: document.activeElement?.matches?.('[data-topic-input]') ?? false })"));
      const gMid = JSON.parse(await G.evaluate("JSON.stringify({ count: Number(document.querySelector('[data-many-count]')?.dataset.manyCount ?? -1), over: document.documentElement.scrollWidth - innerWidth, inputIn: (() => { const r = document.querySelector('[data-topic-input]')?.getBoundingClientRect(); return r ? r.right <= innerWidth + 1 && r.left >= 0 : false; })() })"));
      res.many = { topic, fbH, mid, gMid };
      await snap(H, 'many-play-pc');
      await snap(G, 'many-play-m360');
    }
    if (key === 'many' && phase === 'roundResult') {
      await sleep(400);
      const rv = JSON.parse(await H.evaluate("JSON.stringify({ rows: [...document.querySelectorAll('[data-many-row]')].map((r) => Number(r.dataset.manyRow)), only: document.querySelectorAll('.many-reveal [data-only]').length, missed: Number(document.querySelector('[data-missed]')?.dataset.missed ?? -1), report: document.querySelector('[data-topic-report]') !== null })"));
      res.many.rv = rv;
      await snap(H, 'many-reveal-pc');
      await snap(G, 'many-reveal-m360');
      res.themes.push(['many-reveal m360', await over(G)]);
      await theme(H, 'office');
      await sleep(200);
      await snap(H, 'many-reveal-office-pc');
      await theme(H, 'night');
      await sleep(200);
      await snap(H, 'many-reveal-night-pc');
      await theme(H, 'pastel');
      await realClick(H, '[data-topic-report]');
      await H.waitFor("document.querySelector('.qreport-modal') !== null", 3000).catch(() => false);
      await sleep(250);
      res.report = JSON.parse(await H.evaluate("JSON.stringify({ title: document.querySelector('.qreport-modal .pop-title')?.innerText ?? '', text: document.querySelector('.qreport-modal textarea')?.value ?? '', reason: document.querySelector('.qreport-modal [data-reason=\"answer\"]')?.getAttribute('aria-pressed') })"));
      await snap(H, 'many-report-pc');
      await H.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(200);
    }
    if (key === 'many' && phase === 'final') await snap(H, 'many-final-pc');
    if (key === 'unique' && phase === 'play') {
      // ★★★ R099 — 여러 답: 방장 ✗ 하나 + 정답 둘(0 · 2) · 손님 0 · 1 · 소켓 3 → 공개: 안 겹침 2 · 1 · 3(각 1개) · 겹침 0(둘) · 목록 밖 1
      const topic = await H.evaluate("document.querySelector('[data-topic]')?.dataset.topic ?? ''");
      const its = await itemsOf(topic);
      const enter = async (P, t) => {
        await P.setInput('[data-topic-input]', t);
        await P.evaluate("document.querySelector('.topic-form')?.requestSubmit()");
        await sleep(250);
      };
      await enter(H, '정답아님');
      const bad = await H.evaluate("document.querySelector('.topic-fb')?.dataset.feedback ?? ''");
      await enter(H, its[0].name);
      const ok = await H.evaluate("document.querySelector('.topic-fb')?.dataset.feedback ?? ''");
      await enter(H, its[2].name);
      await enter(H, its[0].name);
      const again = await H.evaluate("document.querySelector('.topic-fb')?.dataset.feedback ?? ''");
      await enter(G, its[0].name);
      await enter(G, its[1].name);
      S.emit('minigame.submit', { token: sMg?.token, roundIndex: sMg?.roundIndex, input: { text: its[3].name } });
      await sleep(400);
      const mid = JSON.parse(await H.evaluate("JSON.stringify({ count: Number(document.querySelector('[data-unique-count]')?.dataset.uniqueCount ?? -1), label: document.querySelector('[data-unique-count]')?.innerText ?? '', ok: document.querySelectorAll('[data-unique-sent=\"ok\"]').length, out: document.querySelectorAll('[data-unique-sent=\"out\"]').length, strike: getComputedStyle(document.querySelector('[data-unique-sent=\"out\"]') ?? document.body).textDecorationLine, focus: document.activeElement?.matches?.('[data-topic-input]') ?? false })"));
      const gMid = JSON.parse(await G.evaluate("JSON.stringify({ count: Number(document.querySelector('[data-unique-count]')?.dataset.uniqueCount ?? -1), over: document.documentElement.scrollWidth - innerWidth, inputIn: (() => { const r = document.querySelector('[data-topic-input]')?.getBoundingClientRect(); return r ? r.right <= innerWidth && r.bottom <= innerHeight : false; })() })"));
      res.unique.push({ bad, ok, again, mid, gMid });
      if (res.unique.length === 1) {
        await snap(H, 'unique-play-pc');
        await snap(G, 'unique-play-m360');
        res.themes.push(['unique-play m360', await over(G)]);
      }
    }
    if (key === 'unique' && phase === 'roundResult') {
      await sleep(300);
      const rv = JSON.parse(await H.evaluate("JSON.stringify({ rows: [...document.querySelectorAll('[data-unique-row]')].map((r) => Number(r.dataset.uniqueRow)).sort().join(), only: document.querySelectorAll('[data-unique-chip=\"only\"]').length, dup: document.querySelectorAll('[data-unique-chip=\"dup\"]').length, out: document.querySelectorAll('[data-unique-chip=\"out\"]').length, report: document.querySelector('.unique-reveal [data-topic-report]') !== null })"));
      res.unique[res.unique.length - 1].rv = rv;
      if (res.unique.length === 1) {
        await snap(H, 'unique-reveal-pc');
        await snap(G, 'unique-reveal-m360');
        res.themes.push(['unique-reveal m360', await over(G)]);
        await theme(G, 'office');
        await sleep(200);
        await snap(G, 'unique-reveal-office-m360');
        await theme(G, 'night');
        await sleep(200);
        await snap(G, 'unique-reveal-night-m360');
        await theme(G, 'pastel');
        for (const [w, h] of [[1280, 720], [2560, 1440]]) {
          await H.setViewport(w, h);
          await sleep(250);
          await snap(H, `unique-reveal-${w}`);
        }
        await H.setViewport(1280, 720);
      }
    }
    if (key === 'unique' && phase === 'final' && !res.uniqueFinal) {
      await sleep(300);
      res.uniqueFinal = await H.evaluate("document.querySelector('.mg-card')?.innerText.slice(0, 300) ?? ''");
      await snap(H, 'unique-final-pc');
    }
    if (key === 'choice' && phase === 'play') {
      const text = await H.evaluate("document.querySelector('.choice-q')?.innerText.replace(/^\\S+\\s/, '') ?? ''");
      const opts = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('[data-choice]')].map((b) => b.innerText.replace(/^\\d\\s*/, '').trim()))"));
      const q = sMg?.round?.params;
      const ans = await answerOf(String(q?.text ?? text));
      const idx = (q?.options ?? opts).indexOf(ans);
      if (res.choice.length === 0) await snap(H, 'choice-play-pc');
      await realClick(H, `[data-choice="${Math.max(0, idx)}"]`);
      await tapOn(G, `[data-choice="${(Math.max(0, idx) + 1) % 4}"]`).catch(() => {});
      S.emit('minigame.submit', { token: sMg?.token, roundIndex: sMg?.roundIndex, input: { choice: 0, elapsedMs: 900 } });
      res.choice.push({ n: opts.length, idx });
      if (res.choice.length === 1) {
        await sleep(150);
        await snap(G, 'choice-play-m360');
      }
    }
    if (key === 'choice' && phase === 'roundResult' && res.choice.length === 1) {
      await sleep(150);
      await snap(H, 'choice-reveal-pc');
      res.choiceReveal = await H.evaluate("document.querySelectorAll('[data-choice-answer]').length");
    }
    if (key === 'choice' && phase === 'final') {
      await sleep(300);
      res.choiceFinal = JSON.parse(await H.evaluate("JSON.stringify({ answers: document.querySelectorAll('[data-choice-answers] li').length, ok: document.querySelectorAll('[data-choice-answers] li.ok').length })"));
      await snap(H, 'choice-final-pc');
      await snap(G, 'choice-final-m360');
      res.themes.push(['choice-final m360', await over(G)]);
      await theme(H, 'office');
      await sleep(200);
      await snap(H, 'choice-final-office-pc');
      await theme(H, 'pastel');
    }
    await sleep(100);
  }
  note('많이 말하기', res.many);
  note('제보 창', res.report);
  note('겹치면 무효', res.unique);
  note('객관식', { n: res.choice.length, reveal: res.choiceReveal, final: res.choiceFinal });
  note('넘침', res.themes);
  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r080'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r080'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r080', 'r080.json'), JSON.stringify(rows, null, 1));
  const m = res.many;
  record('★★★ R080 많이 말하기 — ✓ 셋 · 이미 말함 · ✗ · 내 칩 3 · 입력칸 포커스 유지 · 참여 수 줄 없음', m && m.mid.count === 3 && m.mid.chips === 3 && !m.mid.submittedLine && m.mid.focus && m.fbH === 'wrong', JSON.stringify(m?.mid));
  record('★★ R080 많이 말하기 m360 — 입력칸 화면 안 · 넘침 0 · 내 개수 2', m && m.gMid.inputIn && m.gMid.over <= 1 && m.gMid.count === 2, JSON.stringify(m?.gMid));
  record('★★★ R080 많이 말하기 공개 — 사람 셋(3 · 2 · 1) · 나만 말한 답 · 못 말한 것 · 제보 버튼', m?.rv && m.rv.rows.slice().sort().join() === '1,2,3' && m.rv.only >= 3 && m.rv.missed > 0 && m.rv.report, JSON.stringify(m?.rv));
  record('★★★ R080 "이건 왜 정답 아냐?" — 제보 창 머리 주제 · 내 오답 채움 · 사유 "답" 켜짐', res.report && /많이 말하기/.test(res.report.title) && /정답아닌말/.test(res.report.text) && res.report.reason === 'true', JSON.stringify(res.report));
  const uOk = (u) => u.bad === 'wrong' && u.ok === 'ok' && u.again === 'dup' && u.mid.count === 3 && u.mid.ok === 2 && u.mid.out === 1 && /내가 낸 답 3개/.test(u.mid.label) && /line-through/.test(u.mid.strike) && u.mid.focus;
  record('★★★ R099 겹치면 무효 판 — 3판 · 여러 답(✗ · ✓ · ✓ · 이미 냈어요) · "내가 낸 답 3개" 칩(목록 밖 취소선) · 입력칸 포커스 유지', res.unique.length === 3 && res.unique.every(uOk), JSON.stringify(res.unique.map((u) => ({ bad: u.bad, ok: u.ok, again: u.again, mid: u.mid }))));
  record('★★ R099 겹치면 무효 m360 — 입력칸 화면 안 · 넘침 0 · 손님 낸 답 2', res.unique[0]?.gMid?.inputIn && res.unique[0].gMid.over <= 1 && res.unique[0].gMid.count === 2, JSON.stringify(res.unique[0]?.gMid));
  record('★★★ R099 겹치면 무효 공개 — 사람마다 안 겹친 수(1 · 1 · 1) · 안 겹친 칩 ★ 3 · 겹친 칩 흐림 2 · 목록 밖 취소선 1 · 제보 버튼', res.unique.length === 3 && res.unique.every((u) => u.rv && u.rv.rows === '1,1,1' && u.rv.only === 3 && u.rv.dup === 2 && u.rv.out === 1 && u.rv.report), JSON.stringify(res.unique.map((u) => u.rv)));
  record('★★★ R080 객관식(R090 5연속) — 5문항 · 보기 4 · 정답 표시 · 최종 정답 5줄(방장 다 맞힘)', res.choice.length === 5 && res.choice.every((c) => c.n === 4 && c.idx >= 0) && res.choiceReveal === 1 && res.choiceFinal?.answers === 5 && res.choiceFinal?.ok === 5, JSON.stringify({ c: res.choice.slice(0, 2), r: res.choiceReveal, f: res.choiceFinal }));
  record('★★ R080 모바일 넘침 0(공개 · 최종)', res.themes.every(([, o]) => o <= 1), JSON.stringify(res.themes));
  record('★ R080 설정 — 셋 고름', picked === 'many,unique,choice' || picked.split(',').length === 3, picked);
  S.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R079 — 팀전 1차 화면 (D-329 · D-335) (UICHECK_R079=1 · 묶음 r079 · docs/design/r079)
//   방장 PC 1280×720 · 손님 m360 터치 · 소켓 손님 5 (7명) — 토글 → 두 색 칸 · 끌기 전후 · 6:1 칸 · 👥 사람 카드 팀 버튼(모바일) ·
//   자동 배정 · 세 테마(사무실 B/R 글자) · 판 중 막대(PC · m360) · 결과 팀 줄 + 보너스 · 넘침 0(R077_OVERFLOW)
// =============================================================================
async function r079Flow(browser) {
  const H = await newPage(browser, 'R079-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'tmh', '블루방장');
  const roomId = await createRoom(H, 'R079 팀전');
  const G = await newPage(browser, 'R079-g', true);
  await signUp(G, 'tmg', '레드손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const socks = await socketGuests(roomId, 5, 'tm');
  await sleep(600);
  const ids = await withPg(async (c) => (await c.query(`SELECT id::text, login_id FROM accounts WHERE login_id = ANY($1) ORDER BY login_id`, [[0, 1, 2, 3, 4].map((i) => `${ACCOUNT_PREFIX}_tm${i}`.toLowerCase())])).rows.map((r) => r.id));
  const sides = (P) =>
    P.evaluate("JSON.stringify({ blue: document.querySelectorAll('[data-team-side=\"blue\"] .seat-card:not(.empty)').length, red: document.querySelectorAll('[data-team-side=\"red\"] .seat-card:not(.empty)').length, rows: [...document.querySelectorAll('[data-team-side]')].map((a) => a.children.length), tags: [...document.querySelectorAll('.seat-card [data-team-tag]')].map((t) => t.innerText).join(''), bar: document.querySelector('[data-team-bar]') ? [Number(document.querySelector('[data-team-bar]').dataset.blue), Number(document.querySelector('[data-team-bar]').dataset.red)] : null, over: document.documentElement.scrollWidth - innerWidth })").then((s) => JSON.parse(s));
  const overflow = async (P) => JSON.parse(await P.evaluate(R077_OVERFLOW));
  const rows = [];
  const note = (k, v) => {
    rows.push([k, v]);
    console.log(`  [r079] ${k}: ${JSON.stringify(v)}`);
  };

  // ── 1. 토글 전 · 후
  await snap(H, 'lobby-off-pc');
  await realClick(H, 'button[data-team-toggle]');
  await H.waitFor("document.querySelectorAll('[data-team-side] .seat-card:not(.empty)').length === 7", 5000).catch(() => false);
  await sleep(400);
  const on = await sides(H);
  note('켬 — 블루 · 레드 · 칸 수 · 태그', on);
  await snap(H, 'lobby-on-pc');
  const ov1 = await overflow(H);
  // ── 2. 방장 끌기 — 블루의 소켓 손님 하나 → 레드 칸
  const dragSel = `[data-team-side="blue"] .seat-card[data-account="${ids[0]}"]`;
  const d = await dragTo(H, dragSel, '[data-team-side="red"] .seat-card.empty', { onMid: () => snap(H, 'drag-mid-pc') });
  await sleep(500);
  const dragged = await sides(H);
  const draggedTeam = await H.evaluate(`document.querySelector('.seat-card[data-account="${ids[0]}"]')?.dataset.team ?? ''`);
  note('끌기 뒤', { ...dragged, draggedTeam, ok: d.ok });
  await snap(H, 'drag-after-pc');
  // 끌고 난 칸을 눌러도 사람 카드가 안 열린다(끌기 뒤 클릭 막기)
  const cardAfterDrag = await H.evaluate("document.querySelector('.person-card') !== null");
  // ── 3. 6:1 — 레드 소켓 손님들이 스스로 블루로(본인 자기 팀)
  for (const i of [0, 1, 2, 3, 4]) socks[i].emit('lobby.setTeam', { accountId: ids[i], team: 'blue' });
  await H.waitFor("document.querySelectorAll('[data-team-side=\"blue\"] .seat-card:not(.empty)').length === 6", 5000).catch(() => false);
  await sleep(400);
  const six = await sides(H);
  note('6:1 — 칸 수 6 · 5', six);
  await snap(H, 'lobby-6to1-pc');
  const ov6 = await overflow(H);
  // ── 4. 자동 배정
  await realClick(H, 'button[data-team-auto]');
  await H.waitFor("document.querySelectorAll('[data-team-side=\"blue\"] .seat-card:not(.empty)').length === 4", 5000).catch(() => false);
  await sleep(300);
  const auto = await sides(H);
  note('자동 배정', auto);
  // ── 5. 모바일 손님 — 👥 → 내 줄 → 사람 카드 "블루로"
  await snap(G, 'lobby-m360');
  await tapOn(G, '#people-btn');
  await G.waitFor("document.querySelector('.people-modal') !== null", 3000).catch(() => false);
  await sleep(300);
  await snap(G, 'people-m360');
  const peopleTags = await G.evaluate("document.querySelectorAll('.people-modal [data-team-tag]').length");
  await tapOn(G, '.people-modal li .people-row.pickable:has(.badge.me)');
  await G.waitFor("document.querySelector('.person-card [data-act^=\"team-\"]') !== null", 3000).catch(() => false);
  await sleep(300);
  await snap(G, 'person-card-m360');
  const btn = await G.evaluate("document.querySelector('.person-card [data-act^=\"team-\"]')?.dataset.act ?? ''");
  await tapOn(G, '.person-card [data-act^="team-"]');
  await sleep(600);
  const gTeam = await H.evaluate("[...document.querySelectorAll('.seat-card')].find((c) => c.innerText.includes('레드손님'))?.dataset.team ?? ''");
  note('모바일 사람 카드 버튼 → 내 팀', { peopleTags, btn, gTeam });
  // 되돌림(레드로) — 결과 줄에서 레드 승을 만들 손님
  await tapOn(G, '#people-btn').catch(() => {});
  await sleep(300);
  await tapOn(G, '.people-modal li .people-row.pickable:has(.badge.me)').catch(() => {});
  await sleep(300);
  await tapOn(G, '.person-card [data-act="team-red"]').catch(() => {});
  await sleep(500);
  // ── 6. 세 테마 — 로비 그림 · 넘침
  const themeRows = [];
  for (const th of ['night', 'office', 'pastel']) {
    await pickTheme(H, th);
    await pickTheme(G, th);
    await sleep(300);
    themeRows.push({ th, pc: await overflow(H), m: await overflow(G), tagColor: await H.evaluate("getComputedStyle(document.querySelector('.seat-card [data-team-tag]')).backgroundColor") });
    await snap(H, `lobby-${th}-pc`);
    if (th === 'office') await snap(G, 'lobby-office-m360');
  }
  note('테마 — 넘침 · 태그 바탕', themeRows.map((r) => [r.th, r.pc.length, r.m.length, r.tagColor]));
  // ── 7. 판 — 1문제(손님이 맞힘 → 레드 승 1:0 · 보너스 1P)
  await setQuestionCount(H, 1);
  await sleep(300);
  await H.click('게임 시작');
  await H.waitFor("document.querySelector('.q-timebar') !== null && document.querySelector('[data-team-bar]') !== null", 20000).catch(() => false);
  await sleep(500);
  const g0 = await sides(H);
  await snap(H, 'game-bar-pc');
  await G.waitFor("document.querySelector('[data-team-bar]') !== null", 5000).catch(() => false);
  await snap(G, 'game-bar-m360');
  const gBar = await G.evaluate("(() => { const b = document.querySelector('[data-team-bar]'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), vw: innerWidth, lines: Math.round(r.height / parseFloat(getComputedStyle(b).lineHeight || '20')) }; })()");
  const text = await H.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
  const ans = await withPg(async (c) => (await c.query(`SELECT a.answer_text FROM questions q JOIN question_answers a ON a.question_id = q.id WHERE q.question_text = $1 ORDER BY a.is_primary DESC, a.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '');
  await G.setInput('.chat-card input', ans);
  await G.click('전송');
  await H.waitFor("document.querySelector('[data-team-bar]')?.dataset.red === '1'", 5000).catch(() => false);
  const g1 = await sides(H);
  await snap(H, 'game-bar-scored-pc');
  // ── 8. 결과
  await H.waitFor("document.querySelector('[data-team-result]') !== null", 30000).catch(() => false);
  await sleep(600);
  const res = JSON.parse(await H.evaluate("JSON.stringify({ text: document.querySelector('[data-team-result]')?.innerText.replace(/\\s+/g, ' ') ?? '', winner: document.querySelector('[data-team-result]')?.dataset.winner, bonus: document.querySelector('[data-team-result]')?.dataset.bonus, rowTags: document.querySelectorAll('.ranking li [data-team-tag]').length, over: document.documentElement.scrollWidth - innerWidth })"));
  note('결과 줄', res);
  for (const th of ['pastel', 'night', 'office']) {
    await pickTheme(H, th);
    await sleep(250);
    await snap(H, `result-${th}-pc`);
  }
  await pickTheme(H, 'pastel');
  await G.waitFor("document.querySelector('[data-team-result]') !== null", 5000).catch(() => false);
  await snap(G, 'result-m360');
  const gRes = await G.evaluate("(() => { const p = document.querySelector('[data-team-result]'); if (!p) return null; const r = p.getBoundingClientRect(); return { in: r.left >= 0 && r.right <= innerWidth + 1, over: document.documentElement.scrollWidth - innerWidth }; })()");
  note('결과 줄 m360', gRes);

  if (!existsSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r079'))) mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r079'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r079', 'r079.json'), JSON.stringify(rows, null, 1));
  record('★★★ R079 토글 — 7명 블루 4 · 레드 3 · 칸 5+5 · 태그 B/R 7', on.blue === 4 && on.red === 3 && on.rows.join() === '5,5' && on.tags.length === 7 && /^[BR]+$/.test(on.tags), JSON.stringify(on));
  record('★★★ R079 방장 PC 끌기 — 블루 → 레드 칸에 놓기 · 끌기 뒤 사람 카드 안 열림', d.ok && dragged.blue === 3 && dragged.red === 4 && draggedTeam === 'red' && !cardAfterDrag, JSON.stringify({ dragged, draggedTeam, cardAfterDrag }));
  record('★★ R079 6:1 — 블루 칸 6줄 · 레드 5 · 넘침 0', six.blue === 6 && six.red === 1 && six.rows.join() === '6,5' && ov6.length === 0 && six.over <= 1, JSON.stringify({ six, ov6 }));
  record('★★ R079 자동 배정 버튼 — 4:3', auto.blue === 4 && auto.red === 3, JSON.stringify(auto));
  record('★★ R079 모바일 👥 팀 태그 · 내 사람 카드 "블루로" → 블루', peopleTags === 7 && btn === 'team-blue' && gTeam === 'blue', JSON.stringify({ peopleTags, btn, gTeam }));
  record('★★ R079 세 테마 로비 넘침 0 (PC · m360) · 사무실 태그 무채색', ov1.length === 0 && themeRows.every((r) => r.pc.length === 0 && r.m.length === 0) && /204, 204, 204/.test(themeRows.find((r) => r.th === 'office').tagColor), JSON.stringify(themeRows.map((r) => [r.th, r.pc, r.m, r.tagColor])).slice(0, 600));
  record('★★★ R079 판 중 막대 — 0:0 → 레드 1 · 모바일 한 줄', g0.bar?.join() === '0,0' && g1.bar?.join() === '0,1' && gBar && gBar.h <= 40 && gBar.w <= gBar.vw, JSON.stringify({ g0: g0.bar, g1: g1.bar, gBar }));
  record('★★★ R079 결과 줄 — 레드 승 1 : 0 · 보너스 +1P · 행 태그 7 · m360 안', res.winner === 'red' && res.bonus === '1' && /레드 승 1 : 0/.test(res.text) && /\+1P/.test(res.text) && res.rowTags === 7 && res.over <= 1 && gRes?.in && gRes.over <= 1, JSON.stringify({ res, gRes }));
  for (const s of socks) s.close();
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R077 — 로비 카드 넘침 settings-overflow (D-327 · 찬종 11-06 "사무실 왔다갔다 해도 저 글자가 튀어나가")
//   (UICHECK_R077=1 · 묶음 r077 · docs/design/r077) · R077_TAG = before | after · R077_ONLY = overflow | minority
//   손님 · 방장 × 크기(lap2 1536×695 @1.25 · pc 1280×720 · m360 터치) × 테마 순환(처음 → pastel → office → pastel → night → office → pastel · Alt+T 는 R043 A-9 로 꺼져 있어 ⚙ 단추로)
//   설정 카드(.lobby-card) · 참여자 칸(.seats) · 채팅 카드(.chat-card) 안 요소 · 글자 줄이 카드 밖으로 나간 것(조상이 잘라 내면 뺀다)
// =============================================================================
const R077_TAG = process.env.R077_TAG ? `-${process.env.R077_TAG}` : '';
const R077_OVERFLOW = `JSON.stringify((() => {
  const out = [];
  const clipped = (el, card) => { for (let a = el.parentElement; a && a !== card; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible') return a; } return null; };
  const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase());
  for (const sel of ['.lobby-card', '.seats-left', '.seats-right', '.chat-card']) {
    const card = document.querySelector(sel);
    if (!card || card.getClientRects().length === 0) continue;
    const c = card.getBoundingClientRect();
    for (const el of card.querySelectorAll('*')) {
      if (el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const clip = clipped(el, card);
      const box = clip ? clip.getBoundingClientRect() : c;
      const over = Math.max(r.right - box.right, box.left - r.left, r.right - c.right, c.left - r.left);
      if (over > 1 && !clip) out.push({ card: sel, el: label(el), px: Math.round(over), text: (el.innerText || '').slice(0, 30) });
      // 글자 줄(자식 글 노드)이 상자 밖
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const lr of rg.getClientRects()) {
          const o = Math.max(lr.right - c.right, c.left - lr.left);
          if (o > 1 && getComputedStyle(el).overflowX === 'visible' && !clipped(el, card)) out.push({ card: sel, el: label(el) + ' #text', px: Math.round(o), text: n.textContent.slice(0, 30) });
        }
      }
    }
  }
  return out;
})())`;
async function r077Overflow(browser) {
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r077');
  const H = await newPage(browser, 'R077-host', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'oh', '넘침방장');
  const roomId = await createRoom(H, 'R077 넘침');
  const G = await newPage(browser, 'R077-g', true);
  await G.setViewport(1536, 864);
  await signUp(G, 'og', '넘침손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  // ★ 사진과 같은 꼴 — 미니게임만 · 여럿 고름(전부가 아니어서 이름이 줄줄이)
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000).catch(() => false);
  await selectMinigames(H, ['cake', 'balance', 'reaction', 'typing', 'circle', 'angle', 'price', 'worldprice', 'photo', 'estimate', 'which', 'minority', 'gauge', 'balloon']);
  await sleep(600);
  const SIZES = [
    { n: 'lap2', set: (P) => P.send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 695, deviceScaleFactor: 1.25, mobile: false }) },
    { n: 'pc', set: (P) => P.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }) },
    { n: 'm360', set: (P) => r068Touch(P, 360, 740, true) },
  ];
  // ★ ⚙ 테마 단추(PC) — 모바일(⚙ 창 꼴이 다름)에서 안 바뀌면 setTheme 과 같은 일(html data-theme · 저장 · qw:theme)
  const setT = async (P, id) => {
    await pickTheme(P, id);
    if ((await P.evaluate("document.documentElement.dataset.theme ?? ''")) !== id) await P.evaluate(`(() => { document.documentElement.dataset.theme = '${id}'; try { localStorage.setItem('qw.theme.v1', '${id}'); } catch {} window.dispatchEvent(new CustomEvent('qw:theme', { detail: '${id}' })); })()`);
  };
  const theme = (P) => P.evaluate("document.documentElement.dataset.theme ?? ''");
  const table = [];
  for (const S of SIZES) {
    for (const [P, who] of [[G, 'guest'], [H, 'host']]) {
      if (S.n === 'm360') await r068Touch(P, 360, 740, true);
      else {
        await r068Touch(P, 1536, 864, false);
        await S.set(P);
      }
      await sleep(300);
      await setT(P, 'pastel');
      const seq = [['처음', null], ['pastel', 'pastel'], ['office', 'office'], ['pastel', 'pastel'], ['night', 'night'], ['office', 'office'], ['pastel', 'pastel']];
      for (const [name, act] of seq) {
        if (act) await setT(P, act);
        await sleep(300);
        const over = JSON.parse(await P.evaluate(R077_OVERFLOW));
        table.push({ size: S.n, who, step: name, theme: await theme(P), over });
        if (over.length && !table.some((t) => t.shot)) {
          table[table.length - 1].shot = true;
          await snap(P, `mg-names-overflow${R077_TAG}`);
        }
      }
      if (who === 'guest' && S.n === 'lap2') await snap(P, `settings-guest-lap2${R077_TAG}`);
      await setT(P, 'pastel');
    }
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `settings-overflow${R077_TAG}.json`), JSON.stringify(table, null, 1));
  console.log('  [r077] 크기 · 누구 · 단계 · 테마 → 넘친 요소(px)');
  for (const t of table) console.log(`    ${t.size}\t${t.who}\t${t.step}\t${t.theme}\t${t.over.map((o) => `${o.card} ${o.el} ${o.px}px「${o.text}」`).join(' | ') || '0'}`);
  const bad = table.filter((t) => t.over.length > 0);
  record('★★★ R077 settings-overflow — 테마 셋 순환(⚙) 뒤 설정 카드 · 참여자 칸 · 채팅 카드 자식 넘침 0(손님 · 방장 × lap2@1.25 · pc · m360)', bad.length === 0, JSON.stringify(bad.map((t) => `${t.size}/${t.who}/${t.step}:${t.over.map((o) => o.el + ' ' + o.px).join(',')}`)).slice(0, 600));
  H.close();
  G.close();
}

// ★★★ R077 — 소수파 선택지 = 인원 − 1 (D-327) — 실제 연습 판 3 · 4 · 6명(방장 PC 1280 · 손님 m360 터치 · 나머지 소켓)
//   규칙 줄 "1~n" · 카드 n 장 · 키 n+1 무시 · 키 n 고름 · 결과 막대 n 개 → 그림 minority-{3,4,6}p-{pc,m360}(-result)
async function r077Minority(browser) {
  const rows = [];
  for (const np of [3, 4, 6]) {
    const n = Math.min(5, Math.max(2, np - 1));
    const H = await newPage(browser, `R077-mn${np}`, true);
    await H.setViewport(1280, 720);
    await signUp(H, `mn${np}h`, `소수${np}방장`);
    const roomId = await createRoom(H, `R077 소수파 ${np}명`);
    const G = await newPage(browser, `R077-mn${np}-g`, true);
    await signUp(G, `mn${np}g`, `소수${np}폰`);
    await r068Touch(G, 360, 740, true);
    await G.goto(`${BASE}/r/${roomId}`);
    await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
    const socks = await socketGuests(roomId, np - 2, `mn${np}s`);
    await sleep(500);
    await r051Start(H, 'minority');
    await waitPhase(H, 'rules', 15000);
    await sleep(300);
    const line = await H.evaluate("document.querySelector('.mg-rules-line')?.innerText ?? ''");
    const ctrl = await H.evaluate("document.querySelector('.mg-rules-ctrl')?.innerText ?? ''");
    if (np === 3) await snap(H, 'minority-3p-rules-pc');
    await waitPhase(H, 'play', 30000);
    await waitPhase(G, 'play', 5000);
    await sleep(300);
    const cards = async (P) => JSON.parse(await P.evaluate("JSON.stringify({ n: document.querySelectorAll('.minority-card').length, data: document.querySelector('.minority-cards')?.dataset.choices ?? '', help: document.querySelector('.quiz-num-help')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth })"));
    const pc = await cards(H);
    const m = await cards(G);
    // 키 n+1 은 무시 · 키 n 은 고름
    const d = String(n + 1);
    await H.key(d, { code: `Digit${d}`, vk: 48 + n + 1, text: true });
    await sleep(150);
    const ignored = (await H.evaluate("document.querySelector('.minority-card.picked')?.dataset.n ?? ''")) === '';
    await H.key(String(n), { code: `Digit${n}`, vk: 48 + n, text: true });
    const c1 = await rectOf(G, '.minority-card[data-n="1"]');
    await trustedTap(G, c1.x + c1.w / 2, c1.y + c1.h / 2);
    await sleep(250);
    const picked = [await H.evaluate("document.querySelector('.minority-card.picked')?.dataset.n ?? ''"), await G.evaluate("document.querySelector('.minority-card.picked')?.dataset.n ?? ''")];
    await snap(H, `minority-${np}p-pc`);
    await snap(G, `minority-${np}p-m360`);
    await waitPhase(H, 'roundResult', 20000);
    await sleep(500);
    const bars = [await H.evaluate("document.querySelectorAll('.minority-bar').length"), await G.evaluate("document.querySelectorAll('.minority-bar').length")];
    await snap(H, `minority-${np}p-pc-result`);
    await snap(G, `minority-${np}p-m360-result`);
    rows.push({ np, n, line, ctrl, pc, m, ignored, picked, bars });
    for (const s2 of socks) s2.close();
    H.close();
    G.close();
    await sleep(300);
  }
  console.log('  [r077] 인원 → 선택지 · 규칙 줄 · 카드 PC/m360 · 키 n+1 무시 · 고름 · 결과 막대');
  for (const r of rows) console.log(`    ${r.np}명 → ${r.n}	「${r.line}」 「${r.ctrl}」 카드 ${r.pc.n}/${r.m.n} · 무시 ${r.ignored} · 고름 ${r.picked} · 막대 ${r.bars} · 넘침 ${r.pc.over}/${r.m.over}`);
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r077', 'minority.json'), JSON.stringify(rows, null, 1));
  const ok = rows.every((r) => r.line.startsWith(`1~${r.n} 중`) && r.ctrl.includes(`1 ~ ${r.n} 키`) && r.pc.n === r.n && r.m.n === r.n && r.ignored && r.picked[0] === String(r.n) && r.picked[1] === '1' && r.bars.every((b) => b === r.n) && r.pc.over <= 1 && r.m.over <= 1);
  record('★★★ R077 minority — 3명 → 1~2 · 4명 → 1~3 · 6명 → 1~5(규칙 줄 · 카드 PC/m360 · 키 n+1 무시 · 결과 막대 n · 넘침 0)', ok, JSON.stringify(rows.map((r) => ({ np: r.np, n: r.n, pc: r.pc.n, m: r.m.n, ig: r.ignored, pk: r.picked, bars: r.bars }))));
}

// =============================================================================
// ★★★ R076 — 문제 카드 세로 흔들림 card-jitter (D-326 · 찬종 11-06 "사무실 모드 문제 부분이 위아래로 미친듯이 흔들려")
//   (UICHECK_R076=1 · 묶음 r076 · docs/design/r076) · R076_TAG = before | after
//   테마 셋 × 크기(PC 1280 · 1536×730 / m360 · m390 터치) × 상태(시작 · 힌트 · 초성 · 마지막 5초 · 공개) — 2초 동안 프레임마다 카드 · 지문 top/height ·
//   지문 style/data-wrap 바뀜 수 · 지문 크기 바뀜(ResizeObserver) 수
// =============================================================================
const R076_TAG = process.env.R076_TAG ? `-${process.env.R076_TAG}` : '';
const R076_SAMPLE = (ms) => `new Promise((done) => {
  const card = () => document.querySelector('.question-card');
  const qt = () => document.querySelector('.question-card .q-text');
  const rows = [];
  let mut = 0;
  let ro = 0;
  const q0 = qt();
  const mo = new MutationObserver((l) => { mut += l.length; });
  if (q0) mo.observe(q0, { attributes: true, attributeFilter: ['style', 'data-wrap'] });
  const rob = new ResizeObserver(() => { ro += 1; });
  if (q0) rob.observe(q0);
  const t0 = performance.now();
  const tick = () => {
    const c = card()?.getBoundingClientRect();
    const q = qt()?.getBoundingClientRect();
    rows.push([c ? Math.round(c.top * 10) / 10 : null, c ? Math.round(c.height * 10) / 10 : null, q ? Math.round(q.top * 10) / 10 : null, q ? Math.round(q.height * 10) / 10 : null, qt()?.style.getPropertyValue('--q-px') ?? '', qt()?.dataset.wrap ?? '']);
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick);
    else {
      mo.disconnect();
      rob.disconnect();
      const ch = (i) => { let n = 0; let amp = 0; for (let k = 1; k < rows.length; k += 1) { if (rows[k][i] !== rows[k - 1][i] && rows[k][i] !== null && rows[k - 1][i] !== null) { n += 1; amp = Math.max(amp, Math.abs(rows[k][i] - rows[k - 1][i])); } } return [n, Math.round(amp * 10) / 10]; };
      const vals = (i) => [...new Set(rows.map((r) => r[i]))].slice(0, 6);
      done(JSON.stringify({ frames: rows.length, cardTop: ch(0), cardH: ch(1), qTop: ch(2), qH: ch(3), px: vals(4), wrap: vals(5), mut, ro: Math.max(0, ro - 1) }));
    }
  };
  requestAnimationFrame(tick);
})`;
async function r076Flow(browser) {
  const H = await newPage(browser, 'R076-host', true);
  await H.setViewport(1536, 730);
  await signUp(H, 'jh', '흔들방장');
  const roomId = await createRoom(H, 'R076 흔들림');
  const G = await newPage(browser, 'R076-g', true);
  await signUp(G, 'jg', '흔들손님');
  await r068Touch(G, 360, 740, true);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const PCS = [{ w: 1280, h: 720, n: 'pc' }, { w: 1536, h: 730, n: 'lap2' }];
  const MOBS = [{ w: 360, h: 740, n: 'm360' }, { w: 390, h: 844, n: 'm390' }];
  const table = [];
  const sample = async (theme, phase, extra = '') => {
    for (let i = 0; i < 2; i += 1) {
      await H.setViewport(PCS[i].w, PCS[i].h);
      await r068Touch(G, MOBS[i].w, MOBS[i].h, true);
      await sleep(250);
      const [a, b] = await Promise.all([H.evaluate(R076_SAMPLE(1800)), G.evaluate(R076_SAMPLE(1800))]);
      table.push({ theme: theme + extra, phase, size: PCS[i].n, ...JSON.parse(a) });
      table.push({ theme: theme + extra, phase, size: MOBS[i].n, ...JSON.parse(b) });
    }
  };
  const remain = (P) => P.evaluate("Number(document.querySelector('.q-timer')?.innerText.replace(/[^0-9]/g, '') || 0)");
  const untilRemain = async (s) => { for (let k = 0; k < 400; k += 1) { if ((await remain(H)) <= s) return; await sleep(100); } };
  const game = async (theme, extra = '') => {
    await pickTheme(H, theme);
    await pickTheme(G, theme);
    // ★ '+줄인움직임' = OS 설정 "애니메이션 효과 끔"(prefers-reduced-motion) — 같은 1ms 규칙이 있다
    const rm = extra === '+줄인움직임';
    await H.send('Emulation.setEmulatedMedia', { features: rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] });
    await G.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, ...(rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])] });
    await setQuestionCount(H, 1).catch(() => {});
    await sleep(300);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.replace(/[\\[\\] ]/g, '').trim() === '게임시작')?.click()");
    await H.waitFor("document.querySelector('.room')?.dataset.state === 'QUESTION_ACTIVE'", 30000).catch(() => false);
    if (extra === '+막대숨김') for (const P of [H, G]) await P.evaluate("(() => { const s = document.createElement('style'); s.id = 'r076-nobar'; s.textContent = '.q-timebar{display:none !important}'; document.head.appendChild(s); })()");
    await sleep(500);
    if (theme === 'office' && !extra) {
      for (const [P, n] of [[H, 'lap2'], [G, 'm360']]) {
        if (n === 'lap2') await H.setViewport(1536, 730);
        else await r068Touch(G, 360, 740, true);
        for (let t = 0; t < 3; t += 1) {
          await snap(P, `jitter-office-${n}-t${t}${R076_TAG}`);
          await sleep(60);
        }
      }
    }
    await sample(theme, '시작', extra);
    // ★ 같은 문제 위 A/B — 옛 규칙(모든 속성 1ms 전이)만 다시 넣고 PC 둘을 잰다(원인 확인)
    if (theme === 'office' && !extra) {
      await H.evaluate("(() => { const s = document.createElement('style'); s.id = 'r076-old'; s.textContent = \"[data-theme='office'] *:not(.mg-card, .mg-card *) { transition: all 1ms !important; }\"; document.head.appendChild(s); })()");
      for (const sz of PCS) {
        await H.setViewport(sz.w, sz.h);
        await sleep(250);
        table.push({ theme: 'office+옛1ms(AB)', phase: '시작', size: sz.n, ...JSON.parse(await H.evaluate(R076_SAMPLE(1800))) });
      }
      await H.evaluate("document.getElementById('r076-old')?.remove()");
      await H.setViewport(1536, 730);
      await sleep(250);
      table.push({ theme: 'office+옛규칙뺌', phase: '시작', size: 'lap2', ...JSON.parse(await H.evaluate(R076_SAMPLE(1800))) });
    }
    if (extra) {
      for (const P of [H, G]) await P.evaluate("document.getElementById('r076-nobar')?.remove()");
      await H.evaluate("document.querySelector('.host-tools button, .paused-card button') && [...document.querySelectorAll('.host-tools button')].find((b) => /종료/.test(b.innerText))?.click()");
      await sleep(300);
      await confirmFirst(H).catch(() => {});
    } else {
      await untilRemain(29);
      await sleep(400);
      await sample(theme, '힌트');
      await untilRemain(14);
      await sleep(400);
      await sample(theme, '초성');
      await untilRemain(5);
      await sleep(200);
      await sample(theme, '마지막5초');
      await H.waitFor("document.querySelector('.reveal') !== null", 15000).catch(() => false);
      await sleep(400);
      await sample(theme, '공개');
    }
    await H.waitFor("document.querySelector('.room')?.dataset.state === 'GAME_RESULT'", 30000).catch(() => false);
    await sleep(500);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => /로비로/.test(b.innerText))?.click()");
    await H.waitFor("document.querySelector('.room')?.dataset.state === 'LOBBY'", 15000).catch(() => false);
    await sleep(600);
  };
  const only = process.env.R076_ONLY ?? '';
  if (!only) for (const th of ['pastel', 'night', 'office']) await game(th);
  if (!only) await game('office', '+막대숨김');
  if (!only || only === 'reduced') await game('pastel', '+줄인움직임');
  await pickTheme(H, 'pastel');
  await pickTheme(G, 'pastel');
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r076', `card-jitter${R076_TAG}.json`), JSON.stringify(table, null, 1));
  console.log('  [r076] 테마 · 상태 · 크기 — 카드 top 바뀜(번 · 최대px) · 카드 높이 · 지문 높이 · 지문 style/wrap 바뀜 · 지문 크기 바뀜 · px · wrap · 프레임');
  for (const r of table) console.log(`    ${r.theme.padEnd(14)} ${r.phase.padEnd(6)} ${r.size.padEnd(5)} top ${r.cardTop.join('/')} · H ${r.cardH.join('/')} · qH ${r.qH.join('/')} · mut ${r.mut} · ro ${r.ro} · px ${r.px.join(',')} · wrap ${r.wrap.join(',')} · f ${r.frames}`);
  // 마지막 5초 표본은 둘째 크기가 시간 종료(공개로 바뀜)에 걸린다 — 카드 높이 한 번은 그 전환
  const bad = table.filter((r) => !/AB/.test(r.theme) && r.phase !== '공개' && (r.cardTop[0] > 0 || r.cardH[0] > (r.phase === '마지막5초' ? 1 : 0) || r.qH[0] > 0 || r.mut > 2));
  record('★★★ R076 card-jitter — 테마 셋 × PC 둘 · 모바일 둘 × 시작 · 힌트 · 초성 · 마지막 5초 — 2초 동안 카드 top · 높이 · 지문 높이 바뀜 0 · 지문 재측정(style/wrap) ≤ 2', bad.length === 0, JSON.stringify(bad.map((r) => `${r.theme}/${r.phase}/${r.size}:top${r.cardTop[0]}·H${r.cardH[0]}·qH${r.qH[0]}·mut${r.mut}`)).slice(0, 600));
  G.close();
  H.close();
}

// =============================================================================
// ★★★ R075 — 단축키 문구(§A · D-324) · 사무실 모드 2판 office-palette(§B · D-322 2판) · 모바일 화면 움직임 mobile-motion(§C · D-325)
//   (UICHECK_R075=1 · 묶음 r075 · docs/design/r075) · R075_ONLY = shortcut | office | motion (없으면 전부)
//   R075_TAG = before | after → 그림 이름 꼬리(고치기 전 빌드로 먼저 돌려 "전" 그림 · 수를 남긴다)
// =============================================================================
const R075_TAG = process.env.R075_TAG ? `-${process.env.R075_TAG}` : '';
async function r075Flow(browser) {
  const only = process.env.R075_ONLY ?? '';
  if (!only || only === 'shortcut') await r075ShortcutFlow(browser);
  if (!only || only === 'office') await r075OfficeFlow(browser);
  if (!only || only === 'motion') await r075MotionFlow(browser);
}
/** 요소 둘레만 찍는다(글자 읽힘 확인용) */
async function snapClip(page, name, sel, pad = 8) {
  const r = await rectOf(page, sel);
  if (!r || r.w < 1) return false;
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r075');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const vw = await page.evaluate('innerWidth');
  const vh = await page.evaluate('innerHeight');
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  const clip = { x, y, width: Math.min(vw - x, r.w + pad * 2), height: Math.min(vh - y, r.h + pad * 2), scale: 2 };
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip });
  writeFileSync(path.join(dir, `${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  📸 ${name} (부분)`);
  return true;
}

// ── §A 단축키 문구 — 카드 PC · ⓘ 이모티콘 탭 PC · 투어 ④ PC (1280 · 1536×730) ───────────────
async function r075ShortcutFlow(browser) {
  const H = await newPage(browser, 'R075-short', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'sk', '단축키방장');
  await createRoom(H, 'R075 단축키');
  // ★ R075 — 2560 도(⓪ 탭 글이 1440 높이에서 두 줄로 꺾였다 — r073 info 가 잡음)
  const sizes = [{ w: 1280, h: 720, n: 'pc' }, { w: 1536, h: 730, n: 'lap2' }, { w: 2560, h: 1440, n: 'qhd' }];
  const rows = {};
  for (const s of sizes) {
    await H.setViewport(s.w, s.h);
    await sleep(300);
    await H.evaluate("localStorage.removeItem('qw.flag.emojiHelpDismissed'); localStorage.setItem('qw.flag.emojiDemoSeen', '1')");
    await openPicker(H);
    await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
    await sleep(300);
    const card = JSON.parse(await H.evaluate(LINE_COUNTS('.emoji-help-lines li')));
    await snap(H, `shortcut-card-${s.n}${R075_TAG}`);
    await H.evaluate("document.querySelector('[data-emoji-help-close]')?.click()");
    await sleep(150);
    await closePicker(H);
    await openGearTab(H, 'info');
    await H.evaluate(`document.querySelector('[data-gear-pop] [data-info-tab="emoji"]')?.click()`);
    await sleep(250);
    const info = JSON.parse(await H.evaluate(LINE_COUNTS('[data-gear-pop] .info-list li')));
    await snap(H, `shortcut-info-${s.n}${R075_TAG}`);
    await closeTop(H);
    rows[s.n] = { card, info };
  }
  // 투어 ④ — 새 계정(투어 안 봄)
  const T = await newPage(browser, 'R075-tour', true);
  await T.setViewport(1280, 720);
  await signUp(T, 'st', '단축키투어', { fresh: true });
  await createRoom(T, 'R075 투어');
  await T.waitFor("document.querySelector('[data-tour]') !== null", 8000).catch(() => false);
  await T.evaluate("localStorage.setItem('qw.flag.emojiDemoSeen', '1')");
  for (let i = 0; i < 3; i += 1) {
    await sleep(600);
    await realClick(T, '[data-tour-next]');
  }
  await T.waitFor("document.querySelector('[data-emoji-help]') !== null", 4000).catch(() => false);
  await sleep(600);
  for (const s of sizes) {
    await T.setViewport(s.w, s.h);
    await sleep(500);
    const st = await tourState(T);
    const lines = JSON.parse(await T.evaluate(LINE_COUNTS('.tour-line')));
    await snap(T, `shortcut-tour-${s.n}${R075_TAG}`);
    rows[s.n].tour = { st, lines };
  }
  T.close();
  H.close();
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r075', `shortcut${R075_TAG}.json`), JSON.stringify(rows, null, 1));
  console.log(`  [r075] 단축키 문구 ${JSON.stringify(Object.fromEntries(Object.entries(rows).map(([n, r]) => [n, { card: r.card.map((l) => `${l.n}:${l.t}`), info: r.info.map((l) => `${l.n}:${l.t}`), tour: r.tour?.lines.map((l) => `${l.n}:${l.t}`) }])))}`);
  const OLD = /Alt\+1~0|1~0 도|Alt도 넣기/;
  const one = (ls) => ls.length > 0 && ls.every((l) => l.n === 1);
  record(
    '★★★ R075 §A 카드 PC(1280 · 1536×730) — "누르면 바로 보내요" / "Alt 누른 채 숫자 1~0 = 그 번호 자리 보내기" / 우클릭 한 줄 · 줄마다 한 줄 · 옛 "Alt+1~0 도" 없음',
    sizes.every((s) => { const c = rows[s.n].card; return c.length === 3 && one(c) && /Alt 누른 채 숫자 1~0/.test(c[1].t) && !c.some((l) => OLD.test(l.t)); }),
    JSON.stringify(Object.fromEntries(sizes.map((s) => [s.n, rows[s.n].card]))),
  );
  record(
    '★★★ R075 §A ⓘ 이모티콘 탭 PC — "Alt 누른 채 숫자 1~0" · "Shift 누른 채 클릭" · "Alt+숫자도 입력창에" · 줄마다 한 줄 · 옛 축약 없음',
    sizes.every((s) => { const c = rows[s.n].info; const j = c.map((l) => l.t).join('|'); return one(c) && /Alt 누른 채 숫자 1~0/.test(j) && /Shift 누른 채 클릭/.test(j) && /Alt\+숫자도 입력창에/.test(j) && !OLD.test(j); }),
    JSON.stringify(Object.fromEntries(sizes.map((s) => [s.n, rows[s.n].info.map((l) => `${l.n}:${l.t}`)]))),
  );
  record(
    '★★ R075 §A 투어 ④ PC — "Alt 누른 채 숫자로 보내요" · 줄마다 한 줄 · 말풍선 화면 안',
    sizes.every((s) => { const t = rows[s.n].tour; return t?.st?.step === 4 && t.st.bubbleIn && one(t.lines) && t.lines.some((l) => /Alt 누른 채 숫자로/.test(l.t)); }),
    JSON.stringify(Object.fromEntries(sizes.map((s) => [s.n, rows[s.n].tour]))),
  );
}

// ── §B 사무실 모드 2판 — 팔레트 7 밖 색 · 이모티콘 :이름: 다섯 곳 ──────────────────────────────
/** 팔레트(바탕 · 표면 = #0c0c0c · 표면-2 #151515 · 선 #262626 · 글자 #cccccc · 흐림 #808080 · 강조 #f2f2f2) */
const R075_PALETTE = ['#0c0c0c', '#151515', '#262626', '#cccccc', '#808080', '#f2f2f2'];
/** 보이는 모든 요소(+ ::before · ::after)의 color · background · border · outline · box-shadow · text-shadow · svg stroke/fill · gradient · 체크박스 accent 를 모아 팔레트 밖을 센다(투명 · 미니게임 판 안 제외) */
const R075_PALETTE_PROBE = `JSON.stringify((() => {
  const ok = new Set(${JSON.stringify(R075_PALETTE)});
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
  const parse = (s) => { const out = []; const re = /rgba?\\(([^)]+)\\)/g; let m; while ((m = re.exec(String(s)))) { const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); const a = p.length > 3 ? p[3] : 1; if (!(a > 0)) continue; out.push({ hex: hex(p[0], p[1], p[2]), a }); } return out; };
  const cls = (e) => { const c = typeof e.className === 'string' ? e.className : (e.getAttribute && e.getAttribute('class')) || ''; return c.trim() ? '.' + c.trim().split(/\\s+/).slice(0, 2).join('.') : ''; };
  const sel = (el) => { const p = el.parentElement; return (p ? p.tagName.toLowerCase() + cls(p) + ' > ' : '') + el.tagName.toLowerCase() + cls(el); };
  const bad = new Map();
  const add = (el, prop, v, ps = '') => { for (const c of parse(v)) { if (ok.has(c.hex)) continue; const k = sel(el) + ps + ' | ' + prop + ' ' + c.hex + (c.a < 1 ? '/' + c.a : ''); bad.set(k, (bad.get(k) || 0) + 1); } };
  const borders = (el, cs, ps) => { for (const s of ['Top', 'Right', 'Bottom', 'Left']) if (cs['border' + s + 'Style'] !== 'none' && parseFloat(cs['border' + s + 'Width']) > 0) add(el, 'border', cs['border' + s + 'Color'], ps); };
  let n = 0;
  let imgs = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.mg-card') || ['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'BR'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || el.getClientRects().length === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    n += 1;
    if (el.tagName === 'IMG' || el.tagName === 'CANVAS') imgs += 1;
    const text = [...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (text) add(el, 'color', cs.color);
    if (el instanceof SVGElement) { if (cs.stroke && cs.stroke !== 'none') add(el, 'stroke', cs.stroke); if (cs.fill && cs.fill !== 'none' && el.tagName !== 'svg') add(el, 'fill', cs.fill); }
    add(el, 'background', cs.backgroundColor);
    if (/gradient/.test(cs.backgroundImage)) { const k = sel(el) + ' | gradient'; bad.set(k, (bad.get(k) || 0) + 1); }
    borders(el, cs, '');
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) add(el, 'outline', cs.outlineColor);
    if (cs.boxShadow !== 'none') add(el, 'shadow', cs.boxShadow);
    if (cs.textShadow !== 'none') add(el, 'text-shadow', cs.textShadow);
    if (/drop-shadow/.test(cs.filter)) add(el, 'filter', cs.filter);
    // 색 그림 글자(이모지 글꼴 — 👍 🏆 🥇 …): 흑백 필터(grayscale) 밖이면 결함
    if ([...el.childNodes].some((x) => x.nodeType === 3 && /\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F/u.test(x.textContent))) {
      let gray = false;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) if (/grayscale\\(1\\)/.test(getComputedStyle(a).filter)) { gray = true; break; }
      if (!gray) { const k = sel(el) + ' | 색 그림 글자 ' + [...el.textContent.matchAll(/\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F/gu)].map((m) => m[0]).slice(0, 3).join(''); bad.set(k, (bad.get(k) || 0) + 1); }
    }
    if (el.tagName === 'INPUT' && /checkbox|radio|range/.test(el.type) && cs.accentColor === 'auto') { const k = sel(el) + ' | accent auto(기본 파랑)'; bad.set(k, (bad.get(k) || 0) + 1); } else if (el.tagName === 'INPUT' && /checkbox|radio|range/.test(el.type)) add(el, 'accent', cs.accentColor);
    for (const ps of ['::before', '::after']) {
      const p = getComputedStyle(el, ps);
      if (!p.content || p.content === 'none' || p.content === 'normal' || p.display === 'none') continue;
      if (p.content !== '""' && p.content !== "''") add(el, 'color', p.color, ps);
      add(el, 'background', p.backgroundColor, ps);
      if (/gradient/.test(p.backgroundImage)) { const k = sel(el) + ps + ' | gradient'; bad.set(k, (bad.get(k) || 0) + 1); }
      borders(el, p, ps);
      if (p.boxShadow !== 'none') add(el, 'shadow', p.boxShadow, ps);
    }
  }
  const rows = [...bad.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ×' + v);
  return { els: n, imgs, kinds: rows.length, hits: [...bad.values()].reduce((a, b) => a + b, 0), rows };
})())`;
/** :이름: 글자(.emoji-text) — 글자 크기 · 잘림 · 줄임표 · 조상 상자에 잘림 */
const R075_EMOJI_PROBE = (scope) => `JSON.stringify((() => {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const body = parseFloat(getComputedStyle(document.querySelector('.chat-line, .room') || document.body).fontSize);
  return [...document.querySelectorAll(${JSON.stringify(scope)})].filter((e) => e.getClientRects().length > 0).slice(0, 12).map((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    let cut = false;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const b = a.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) { cut = true; break; }
    }
    return { t: e.innerText.trim().slice(0, 24), fs: +parseFloat(cs.fontSize).toFixed(1), rem: +(parseFloat(cs.fontSize) / root).toFixed(2), body: +body.toFixed(1), clip: e.scrollWidth > e.clientWidth + 1, ell: cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1, cut, color: cs.color, w: Math.round(r.width), h: Math.round(r.height) };
  });
})())`;
const R075_EMOJI_OK = (list) => list.length > 0 && list.every((e) => e.rem >= 0.85 && !e.clip && !e.ell && !e.cut);
async function r075OfficeFlow(browser) {
  const H = await newPage(browser, 'R075-office', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'oh', '사무실방장');
  const roomId = await createRoom(H, 'R075 사무실');
  const G = await newPage(browser, 'R075-office-g', true);
  await signUp(G, 'og', '사무실손님');
  await G.setViewport(1280, 720);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  // 특별 이모티콘(세레모니 · ✨ 탭) — 방장 계정에 7개
  await withPg((c) => c.query(`INSERT INTO account_emojis (account_id, emoji_id) SELECT a.id, e.id FROM accounts a, (SELECT id FROM emojis WHERE category = 'special' ORDER BY id LIMIT 7) e WHERE a.login_id = $1 ON CONFLICT DO NOTHING`, [`${ACCOUNT_PREFIX}_oh`]));
  await H.goto(`${BASE}/r/${roomId}`);
  await H.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  await pickTheme(H, 'office');
  await sleep(300);
  const pal = {};
  const emo = {};
  const SZ = [{ w: 1280, h: 720, n: 'pc', touch: false }, { w: 1536, h: 730, n: 'lap2', touch: false }, { w: 360, h: 740, n: 'm360', touch: true }];
  /** 세 크기 그림 + 크기마다 팔레트 */
  const shots = async (screen) => {
    for (const s of SZ) {
      await r068Touch(H, s.w, s.h, s.touch);
      if (!s.touch) await H.setViewport(s.w, s.h);
      await sleep(450);
      await H.evaluate('window.scrollTo(0, 0)');
      pal[`${screen}@${s.n}`] = JSON.parse(await H.evaluate(R075_PALETTE_PROBE));
      await snap(H, `office-${screen}-${s.n}${R075_TAG}`);
    }
    await r068Touch(H, 1280, 720, false);
    await H.setViewport(1280, 720);
    await sleep(300);
  };
  // ── 로비 + 이모티콘 다섯 곳(채팅 줄 · 내 자리 · 😊 10칸 · 목록 · 특별 세레모니)
  await realClick(H, '[data-chat-input]');
  await H.setInput('.chat-card input', '안녕하세요 사무실 모드');
  await H.click('전송');
  await G.setInput('.chat-card input', '반가워요');
  await G.click('전송');
  await sleep(300);
  await realClick(H, '[data-chat-input]');
  await altDigit(H, '1');
  await sleep(500);
  emo.seat = JSON.parse(await H.evaluate(R075_EMOJI_PROBE('.seat-card.mine .seat-emoji-pop .emoji-text')));
  await snapClip(H, `office-emoji${R075_TAG || '-now'}-seat`, '.seat-card.mine');
  emo.chat = JSON.parse(await H.evaluate(R075_EMOJI_PROBE('.chat-log .emoji-text')));
  await snapClip(H, `office-emoji${R075_TAG || '-now'}-chat`, '.chat-log');
  await shots('lobby');
  await openPicker(H);
  await sleep(400);
  emo.slots = JSON.parse(await H.evaluate(R075_EMOJI_PROBE('.emoji-pop .emoji-slot .emoji-text')));
  emo.grid = JSON.parse(await H.evaluate(R075_EMOJI_PROBE('.emoji-pop .emoji-grid .emoji-text')));
  await snapClip(H, `office-emoji${R075_TAG || '-now'}-picker`, '.emoji-pop');
  await shots('emoji');
  // 특별 — ✨ 탭 첫 칸을 누르면 바로 보냄(떠 있는 큰 반응)
  await openPicker(H);
  await sleep(300);
  const hasSpecial = await H.evaluate("(() => { const t = [...document.querySelectorAll('.emoji-tab')].find((b) => /✨|특별/.test(b.title + b.innerText)); t?.click(); return Boolean(t); })()");
  await sleep(300);
  await realClick(H, '.emoji-pop .emoji-grid .emoji-cell');
  await H.waitFor("document.querySelector('.special-layer .special-float') !== null", 3000).catch(() => false);
  await sleep(250);
  emo.special = JSON.parse(await H.evaluate(R075_EMOJI_PROBE('.special-layer .emoji-text')));
  await snapClip(H, `office-emoji${R075_TAG || '-now'}-special`, '.special-layer .special-float');
  pal['special@pc'] = JSON.parse(await H.evaluate(R075_PALETTE_PROBE));
  await closePicker(H);
  await sleep(3200);
  // ⚙ · 포인트샵
  await openGearTab(H, 'settings');
  await shots('gear');
  await closeTop(H);
  await realClick(H, '#shop-btn');
  await H.waitFor("document.querySelector('.shop-pop') !== null", 5000).catch(() => false);
  await sleep(400);
  await shots('shop');
  await closeTop(H);
  // ── 게임 중 · 정답 공개 · 결과
  await setQuestionCount(H, 3).catch(() => {});
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.replace(/[\\[\\] ]/g, '').trim() === '게임시작')?.click()");
  await H.waitFor("document.querySelector('.question-card .q-text') !== null", 30000).catch(() => false);
  await sleep(600);
  await G.setInput('.chat-card input', '틀린답이에요');
  await G.click('전송');
  await sleep(300);
  await shots('game');
  await answerCurrent(H, G);
  await H.waitFor("document.querySelector('.reveal') !== null", 10000).catch(() => false);
  await sleep(500);
  await shots('reveal');
  await openHostEnd(H).catch(() => {});
  await sleep(300);
  await confirmFirst(H).catch(() => {});
  await H.waitFor("document.querySelector('.result-card, .room-result') !== null", 20000).catch(() => false);
  await sleep(700);
  await shots('result');
  // 표
  const table = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, v.kinds]));
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r075', `office-palette${R075_TAG}.json`), JSON.stringify({ table, pal, emo }, null, 1));
  console.log(`  [r075] office-palette 종류 수 ${JSON.stringify(table)}`);
  const allRows = [...new Set(Object.values(pal).flatMap((v) => v.rows.map((r) => r.replace(/ ×\d+$/, ''))))];
  console.log(`  [r075] office-palette 밖 색(합쳐서 ${allRows.length}) ${JSON.stringify(allRows.slice(0, 60))}`);
  console.log(`  [r075] 이모티콘 다섯 곳 ${JSON.stringify(Object.fromEntries(Object.entries(emo).map(([k, v]) => [k, v.slice(0, 3)])))}`);
  record('★★★ R075 §B office-palette — 로비 · 😊 · ⚙ · 포인트샵 · 게임 · 공개 · 결과 × (1280 · 1536×730 · 360) 보이는 모든 요소 색이 팔레트 7 안(0)', Object.values(pal).every((v) => v.kinds === 0), JSON.stringify(table));
  record('★★★ R075 §B 사무실 이모티콘 :이름: 다섯 곳(채팅 · 내 자리 · 😊 10칸 · 목록 · 특별) — 글자 ≥ 0.85rem · 잘림 0 · 줄임표 0', hasSpecial && ['chat', 'seat', 'slots', 'grid', 'special'].every((k) => R075_EMOJI_OK(emo[k] ?? [])), JSON.stringify(Object.fromEntries(Object.entries(emo).map(([k, v]) => [k, v.slice(0, 2)]))));
  const fav = await H.evaluate("document.querySelector('link[data-office-icon]')?.href ?? ''");
  record('★★ R075 §B 파비콘 = 검은 네모 하나(선 · 띠 없음) · 탭 제목 "명령 프롬프트"', !/path|x='7'|height='3'/.test(decodeURIComponent(fav)) && (await H.evaluate('document.title')) === '명령 프롬프트', decodeURIComponent(fav).slice(0, 200));
  await pickTheme(H, 'pastel');
  G.close();
  H.close();
}

// ── §C 모바일 화면 움직임 — 손님 m360 · m390 · m430(터치) · 방장 PC · 한 판 5문제(힌트 · 초성 포함) ───────
const R075_KB = 320; // 화면 키보드 높이(흉내) — 360×740 에서 남는 높이 420
/** 프레임마다(값이 바뀔 때만) 한 줄 — 상태 · scrollY · 넘침 · visualViewport · kbDropped · --qs · fitOver · 카드 · 입력창 · 내 자리 top · layout-shift */
const R075_MOTION_SAMPLER = `(() => {
  if (window.__mm) return true;
  const s = (window.__mm = { list: [], cls: 0, clsAll: 0, shifts: [] });
  const sel = (n) => !n || !n.tagName ? '#text' : n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        s.clsAll += e.value;
        if (!e.hadRecentInput) s.cls += e.value;
        s.shifts.push({ t: Math.round(performance.now()), v: +e.value.toFixed(4), input: e.hadRecentInput, st: document.querySelector('.room')?.dataset.state ?? '', src: (e.sources || []).slice(0, 4).map((x) => sel(x.node) + ':' + Math.round(x.previousRect.top) + '→' + Math.round(x.currentRect.top)) });
      }
    }).observe({ type: 'layout-shift', buffered: false });
  } catch {}
  const top = (q) => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().top) : null; };
  let last = '';
  const tick = () => {
    const se = document.scrollingElement;
    const room = document.querySelector('.room');
    const vv = window.visualViewport;
    const a = document.activeElement;
    const inp = document.querySelector('.chat-input-row input');
    const focus = a && a.tagName === 'INPUT' ? 1 : 0;
    // ★ 화면 그대로 꼴(iOS · 새 크롬 — 키보드가 보이는 영역만 줄이고 입력창이 보이게 화면을 밀어 올림): 밀리는 양 = 계산
    const pan = window.__mmKB && focus && inp ? Math.max(0, Math.round(inp.getBoundingClientRect().bottom + 8 - (innerHeight - window.__mmKB))) : 0;
    const row = { st: room?.dataset.state ?? '', ep: room?.dataset.epoch ?? '', hint: document.querySelectorAll('.q-hint.open').length, rv: document.querySelector('.reveal') ? 1 : 0, sy: Math.round(scrollY), over: Math.max(0, se.scrollHeight - innerHeight), ih: innerHeight, vh: vv ? Math.round(vv.height) : 0, vo: vv ? Math.round(vv.offsetTop) : 0, kb: Number(document.documentElement.dataset.kbDropped ?? 0), qs: room?.dataset.qs ?? '', fo: room?.dataset.fitOver ?? '', card: top('.question-card'), input: top('.chat-input-row input'), seat: top('.seat-card.mine'), focus, pan };
    const k = JSON.stringify(row);
    if (k !== last) { last = k; row.t = Math.round(performance.now()); row.cls = +s.cls.toFixed(4); s.list.push(row); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;
/** 손님 기록 → 상태별 움직임 표 */
function r075MotionTable(rows) {
  const by = {};
  const lab = (r) => (r.st === 'QUESTION_ACTIVE' && r.hint > 0 ? `QUESTION_ACTIVE+힌트${r.hint}` : r.st);
  let kbUps = 0;
  let flipT = -1e9;
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1];
    const b = rows[i];
    const k = lab(b);
    const o = (by[k] ??= { n: 0, card: 0, cardN: 0, cardKb: 0, input: 0, inputN: 0, seat: 0, sy: 0, syMax: 0, overMax: 0, pan: 0, panN: 0, kbDrop: 0, qs: new Set(), fo: 0 });
    o.n += 1;
    const sameQ = a.ep === b.ep;
    // 키보드가 오르내리는 때(포커스 · 보이는 높이가 바뀐 뒤 0.4초)의 이동은 따로(cardKb) — 브리핑 "입력창 top 변화는 키보드 올라올 때 한 번"
    if (a.focus !== b.focus || a.ih !== b.ih || a.vh !== b.vh) flipT = b.t;
    const kbMove = b.t - flipT <= 400;
    if (a.card !== null && b.card !== null && a.card !== b.card && sameQ) {
      if (kbMove) o.cardKb += Math.abs(b.card - a.card);
      else {
        o.card += Math.abs(b.card - a.card);
        o.cardN += 1;
      }
    }
    if (a.input !== null && b.input !== null && a.input !== b.input) {
      o.input += Math.abs(b.input - a.input);
      o.inputN += 1;
    }
    if (a.seat !== null && b.seat !== null && a.seat !== b.seat) o.seat += Math.abs(b.seat - a.seat);
    if (a.sy !== b.sy) o.sy += Math.abs(b.sy - a.sy);
    o.syMax = Math.max(o.syMax, b.sy);
    o.overMax = Math.max(o.overMax, b.over);
    if (a.pan !== b.pan) {
      o.pan += Math.abs(b.pan - a.pan);
      o.panN += 1;
    }
    if (b.kb > a.kb) o.kbDrop += b.kb - a.kb;
    if (!a.focus && b.focus) kbUps += 1;
    if (b.qs) o.qs.add(b.qs);
    o.fo = Math.max(o.fo, Number(b.fo || 0));
  }
  for (const o of Object.values(by)) o.qs = [...o.qs].join('/');
  return { by, kbUps };
}
async function r075MotionFlow(browser) {
  const mode = process.env.R075_KB_MODE ?? 'resize'; // resize = 키보드가 innerHeight 를 줄임(안드로이드 옛 꼴 · 일부 브라우저) · visual = 화면 그대로(iOS · 새 크롬 — 밀어 올림은 계산값 pan)
  const H = await newPage(browser, 'R075-mm-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'mh', '움직임방장');
  const roomId = await createRoom(H, 'R075 움직임');
  const guests = [];
  for (const s of SHOT_MOB) {
    const P = await newPage(browser, `R075-mm-${s.n}`, true);
    await r068Touch(P, s.w, s.h, true);
    await signUp(P, `m${s.n.slice(1)}`, `폰${s.n.slice(1)}`);
    await P.goto(`${BASE}/r/${roomId}`);
    await P.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
    await sleep(500);
    if (mode === 'visual') await P.evaluate(`window.__mmKB = ${R075_KB}`);
    await P.evaluate(R075_MOTION_SAMPLER);
    guests.push({ P, s, kb: false, kbLog: [] });
  }
  // ★ 화면 키보드 흉내(resize): 입력창에 포커스가 가면 높이를 키보드만큼 줄이고 입력창이 보이게 민다(안드로이드가 하는 일) · 풀리면 되돌림
  const sim = { on: mode === 'resize' };
  const loop = (async () => {
    while (sim.on) {
      for (const g of guests) {
        const f = await g.P.evaluate("(() => { const a = document.activeElement; return Boolean(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')); })()").catch(() => g.kb);
        if (f === g.kb) continue;
        g.kb = f;
        g.kbLog.push(`${f ? '↑' : '↓'}${await g.P.evaluate("document.querySelector('.room')?.dataset.state ?? ''").catch(() => '')}`);
        await g.P.send('Emulation.setDeviceMetricsOverride', { width: g.s.w, height: f ? g.s.h - R075_KB : g.s.h, deviceScaleFactor: 1, mobile: true }).catch(() => {});
        if (f) await g.P.evaluate("document.activeElement?.scrollIntoView({ block: 'nearest' })").catch(() => {});
      }
      await sleep(50);
    }
  })();
  const state = () => H.evaluate("JSON.stringify({ st: document.querySelector('.room')?.dataset.state ?? '', ep: document.querySelector('.room')?.dataset.epoch ?? '' })").then((x) => JSON.parse(x));
  const typeWrong = async (g, text) => {
    if (!(await g.P.evaluate("document.activeElement?.matches?.('.chat-input-row input') ?? false"))) await tapOn(g.P, '.chat-input-row input');
    await sleep(250);
    await g.P.send('Input.insertText', { text });
    await sleep(80);
    await g.P.key('Enter');
  };
  const shotAll = async (tag) => {
    for (const g of guests) await snap(g.P, `mobile-motion-${g.s.n}-${tag}${R075_TAG}`);
  };
  await setQuestionCount(H, 5);
  await sleep(500);
  await H.click('게임 시작');
  await H.waitFor("document.querySelector('.room')?.dataset.state === 'COUNTDOWN'", 10000).catch(() => false);
  await sleep(400);
  await shotAll('countdown');
  let lastEp = '';
  for (let i = 0; i < 5; i += 1) {
    const up = await H.waitFor(`document.querySelector('.room')?.dataset.state === 'QUESTION_ACTIVE' && document.querySelector('.room')?.dataset.epoch !== ${JSON.stringify(lastEp)}`, 30000).catch(() => false);
    if (!up) break;
    lastEp = (await state()).ep;
    await sleep(700);
    // 손님: 문제마다 입력창을 누르고(키보드 올림) 한 번 답을 친다
    for (const g of guests) await typeWrong(g, `오답${i + 1}`);
    if (i === 0) await shotAll('active');
    if (i === 0) {
      // 힌트(30초 남았을 때) 까지 기다린다
      await H.waitFor("document.querySelectorAll('.q-hint.open').length >= 1", 15000).catch(() => false);
      await sleep(900);
      await shotAll('hint');
    } else if (i === 1) {
      // 초성(15초 남았을 때) 까지
      await H.waitFor("document.querySelectorAll('.q-hint.open').length >= 2", 30000).catch(() => false);
      await sleep(900);
      await shotAll('chosung');
    } else await sleep(1500);
    await answerCurrent(H);
    await H.waitFor("document.querySelector('.room')?.dataset.state === 'QUESTION_RESOLVED'", 8000).catch(() => false);
    await sleep(900);
    if (i === 0) await shotAll('resolved');
    // 공개 동안 손님이 소감 한 줄(키보드 다시 올림)
    if (i === 0) for (const g of guests) await typeWrong(g, 'ㅋㅋ');
  }
  await H.waitFor("document.querySelector('.room')?.dataset.state === 'GAME_RESULT'", 30000).catch(() => false);
  await sleep(1500);
  await shotAll('result');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => /로비로/.test(b.innerText))?.click()");
  await H.waitFor("document.querySelector('.room')?.dataset.state === 'LOBBY'", 15000).catch(() => false);
  await sleep(1500);
  await shotAll('lobby');
  sim.on = false;
  await loop;
  const out = {};
  for (const g of guests) {
    const mm = JSON.parse(await g.P.evaluate('JSON.stringify(window.__mm ?? null)'));
    const t = r075MotionTable(mm?.list ?? []);
    // ★ 화면이 바뀌는 순간(상태 · 문제 · 공개가 바뀐 뒤 0.8초 — 로비 카드 → 문제 카드처럼 내용이 갈리는 때)의 이동은 "움직임" 이 아니다 → 같은 화면 안 CLS 를 따로
    const rows = mm?.list ?? [];
    const cuts = rows.filter((r, i) => i > 0 && (r.st !== rows[i - 1].st || r.ep !== rows[i - 1].ep || r.rv !== rows[i - 1].rv)).map((r) => r.t);
    // 채팅 줄만 움직인 것(새 말이 올라와 옛 줄이 위로)은 채팅이 하는 일 — 화면 움직임에서 뺀다(전체 값은 cls 로 남긴다)
    const chatOnly = (x) => x.src.length > 0 && x.src.every((s) => /^p\.chat-(line|system)|^#text/.test(s));
    const inScreen = (mm?.shifts ?? []).filter((x) => !x.input && !chatOnly(x) && !cuts.some((c) => x.t >= c - 50 && x.t <= c + 800));
    const clsScreen = +inScreen.reduce((a, x) => a + x.v, 0).toFixed(4);
    out[g.s.n] = { mode, table: t.by, kbUps: t.kbUps, kbLog: g.kbLog, cls: mm?.cls ?? null, clsAll: mm?.clsAll ?? null, clsScreen, screenShifts: inScreen.slice(0, 20), shifts: (mm?.shifts ?? []).filter((x) => x.v >= 0.001).slice(0, 40), rows };
  }
  const file = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r075', `mobile-motion-${mode}${R075_TAG}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  for (const [n, o] of Object.entries(out)) {
    console.log(`  [r075] mobile-motion ${mode} ${n} — 키보드 올림 ${o.kbUps} · 내림 ${JSON.stringify(o.kbLog)} · CLS ${o.cls} (입력 포함 ${o.clsAll} · 같은 화면 안 ${o.clsScreen})`);
    for (const [st, v] of Object.entries(o.table)) console.log(`      ${st.padEnd(24)} 카드 ${v.card}px/${v.cardN}번(키보드 때 ${v.cardKb}px) · 입력창 ${v.input}px/${v.inputN}번 · 내 자리 ${v.seat}px · scrollY 변화 ${v.sy}px(최대 ${v.syMax}) · 넘침 최대 ${v.overMax} · 밀림(pan) ${v.pan}px/${v.panN}번 · kb내림 ${v.kbDrop} · qs ${v.qs} · fitOver ${v.fo}`);
  }
  // 고친 뒤 기준(브리핑 §C 다 됐다): 한 판 동안 scrollY 0 · 넘침 0 · 카드 top 변화 0(문제가 바뀔 때 빼고) · 입력창 변화 = 키보드 올라올 때 · CLS < 0.05 · kbDropped = 판 끝(결과 · 로비)에만
  const IN_GAME = ['COUNTDOWN', 'QUESTION_ACTIVE', 'QUESTION_RESOLVED'];
  const verdict = Object.fromEntries(Object.entries(out).map(([n, o]) => {
    const game = Object.entries(o.table).filter(([st]) => IN_GAME.some((x) => st.startsWith(x)));
    return [n, {
      sy: game.reduce((a, [, v]) => a + v.sy, 0),
      over: Math.max(0, ...game.map(([, v]) => v.overMax)),
      card: game.reduce((a, [, v]) => a + v.card, 0),
      pan: game.reduce((a, [, v]) => a + v.panN, 0),
      kbDropInGame: game.reduce((a, [, v]) => a + v.kbDrop, 0),
      kbUps: o.kbUps,
      cls: o.cls,
      clsScreen: o.clsScreen,
    }];
  }));
  console.log(`  [r075] mobile-motion 판정 ${JSON.stringify(verdict)}`);
  record(
    `★★★ R075 §C mobile-motion(${mode}) — 세 크기 한 판: 판 중 scrollY 변화 0 · 넘침 0 · 문제 카드 top 변화 ≤ 8px(문제 바뀔 때 · 키보드 처음 올라올 때 빼고) · 판 중 키보드 내림 0 · 키보드 올림 ≤ 2 · 같은 화면 안 CLS < 0.05`,
    Object.values(verdict).every((v) => v.sy === 0 && v.over === 0 && v.card <= 8 && v.kbDropInGame === 0 && v.kbUps <= 2 && (v.clsScreen ?? 1) < 0.05),
    JSON.stringify(verdict),
  );
  for (const g of guests) g.P.close();
  H.close();
}

// =============================================================================
// ★★★ R074 — 사진 공개 레이아웃(§A) · 내 자리 · 팝업 아래 끝(§B) · 등록 안내(§C) · 사무실 모드 · 밤 테마(§D)
//   (UICHECK_R074=1 · 묶음 r074 · docs/design/r074) · R074_ONLY = photo | bottom | emoji | theme (없으면 전부)
// =============================================================================
const R074_SIZES = [...SHOT_PC.map((s) => ({ ...s, touch: false })), ...SHOT_MOB.map((s) => ({ ...s, touch: true }))];
const R074_SHOT_SIZES = new Set((process.env.R074_SHOT_SIZES ?? 'lap2,fhd,m360').split(','));
async function r074Flow(browser) {
  const only = process.env.R074_ONLY ?? '';
  if (!only || only === 'photo') await r074PhotoFlow(browser);
  if (!only || only === 'live') await r074PhotoLive(browser);
  if (only === 'calib') await r074Calib(browser);
  if (!only || only === 'bottom' || only === 'seat') await r074BottomFlow(browser);
  if (!only || only === 'emoji') await r074EmojiFlow(browser);
  if (!only || only === 'theme') await r074ThemeFlow(browser);
}

/** ★ R074 §A — 그림 칸 · 문서 높이 · 가운데 칸 넘침 · 안쪽 스크롤 */
const R074_PROBE = `(() => {
  const card = document.querySelector('.mg-card');
  const box = [...document.querySelectorAll('.mg-card .photo-frame, .mg-card .quiz-reveal .img-wrap, .mg-card .quiz-q .img-wrap, .mg-card .which-card .img-wrap, .mg-card .quiz-reveal .quiz-img.dummy, .mg-card .quiz-reveal .quiz-img.img-fail')]
    .filter((e) => e.getClientRects().length && !e.parentElement?.closest('.photo-frame'))
    .map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); });
  const center = document.querySelector('.center');
  const scrollers = [...document.querySelectorAll('.room *')].filter((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1 && !e.closest('.chat-log') && !e.closest('.wp-table'); }).map((e) => String(e.className).split(' ')[0]);
  const img = document.querySelector('.mg-card .quiz-reveal img, .mg-card .which-card img, .mg-card .photo-frame img, .mg-card .quiz-q img');
  return { sh: document.documentElement.scrollHeight, ih: innerHeight, card: card ? Math.round(card.getBoundingClientRect().height) : 0, box: box.join(' '), cOver: center ? Math.max(0, center.scrollHeight - center.clientHeight) : 0, scrollers: scrollers.join(','), loaded: img ? img.complete && img.naturalWidth > 0 : null, phase: card?.dataset.phase ?? '' };
})()`;
const R074_SAMPLER = `(() => { const s = (window.__r074 = { on: true, list: [] }); const tick = () => { if (!s.on) return; s.list.push(${R074_PROBE}); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`;
const r074Probe = (P) => P.evaluate(`JSON.stringify(${R074_PROBE})`).then((s) => JSON.parse(s));
const raf2 = (P) => P.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
/** 느린 망 · 캐시 끔 (CDP Network) */
async function r074Throttle(P, on) {
  await P.send('Network.enable');
  await P.send('Network.setCacheDisabled', { cacheDisabled: on });
  await P.send(
    'Network.emulateNetworkConditions',
    on ? { offline: false, latency: 300, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  );
}

// ── §A 사진 공개 ────────────────────────────────────────────────────────────
async function r074PhotoFlow(browser) {
  const L = await newPage(browser, 'R074-photo', true);
  await L.setViewport(1536, 864);
  await signUp(L, 'pa', '사진공개');
  const tag = process.env.R074_TAG ?? 'after';
  const pick = async (game, port) =>
    withPg(async (c) => {
      const imgCol = game === 'which' ? "(SELECT x FROM unnest(i.image_ids) x WHERE x LIKE '%-a' LIMIT 1)" : game === 'worldprice' ? 'NULL' : 'i.image_ids[1]';
      if (game === 'worldprice') {
        const r = await c.query(`SELECT im.image_id, im.width, im.height FROM minigame_products p JOIN minigame_images im ON im.image_id = p.image_id ORDER BY im.bytes DESC LIMIT 1`);
        return r.rows[0] ?? null;
      }
      const r = await c.query(
        `SELECT im.image_id, im.width, im.height FROM minigame_items i JOIN minigame_images im ON im.image_id = ${imgCol}
          WHERE i.active AND i.game = $1 AND ${port ? 'im.height > im.width * 1.2' : 'im.width > im.height * 1.3'} ORDER BY im.bytes DESC LIMIT 1`,
        [game],
      );
      return r.rows[0] ?? null;
    });
  // 게임 × (모드) — 그림을 쓰는 게임 전부(코드 확인: QuizImage 를 쓰는 곳 = photo · photoyear · price · estimate · which · worldprice)
  const CASES = (process.env.R074_CASES ?? 'photo:zoom,photo:mosaic,photo:plain,photoyear,price,estimate,which,worldprice').split(',').map((x) => {
    const [game, mode] = x.split(':');
    return { game, mode: mode ?? '', port: game !== 'estimate' && game !== 'which' && game !== 'worldprice' && mode !== 'plain' };
  });
  const sizes = R074_SIZES.filter((s) => !process.env.R074_SIZES || process.env.R074_SIZES.split(',').includes(s.n));
  const table = [];
  for (const cs of CASES) {
    const it = (await pick(cs.game, cs.port)) ?? (await pick(cs.game, !cs.port));
    if (!it) {
      table.push({ game: cs.game, mode: cs.mode, skip: '그림 없음' });
      continue;
    }
    const name = `${cs.game}${cs.mode ? `-${cs.mode}` : ''}`;
    for (const sz of sizes) {
      await r074Throttle(L, false);
      if (sz.touch) await r068Touch(L, sz.w, sz.h, true);
      else {
        await r068Touch(L, sz.w, sz.h, false);
        await L.setViewport(sz.w, sz.h);
      }
      await r074Throttle(L, true);
      const dims = process.env.R074_NO_DIMS ? '' : `&dims=${it.width},${it.height}`;
      const at = cs.game === 'photo' ? (cs.mode === 'plain' ? 2000 : 10000) : 0;
      await L.goto(`${BASE}/lab/minigame?scene=1&room=1&key=${cs.game}&phase=play&image=${it.image_id}${cs.mode ? `&mode=${cs.mode}` : ''}${cs.game === 'photo' ? `&at=${at}` : ''}${dims}`);
      await L.waitFor("document.querySelector('.mg-card') !== null", 15000).catch(() => false);
      // 문제 중 그림이 다 올 때까지(느린 망) · ★ R074_EARLY=1 이면 기다리지 않고 1.2초 뒤 공개(그림을 다 받기 전에 정답 공개가 오는 판)
      if (process.env.R074_EARLY) await sleep(1200);
      else await L.waitFor("(() => { const i = document.querySelector('.mg-card img, .mg-card canvas.photo-canvas'); return Boolean(i && (i.tagName === 'CANVAS' ? i.width > 300 : i.complete && i.naturalWidth > 0)); })()", 25000).catch(() => false);
      await sleep(300);
      const row = { game: cs.game, mode: cs.mode, size: sz.n, img: `${it.image_id} ${it.width}x${it.height}` };
      // (판 안) 사진 맞히기 확대 · 모자이크 → 다 드러남(15초)
      if (cs.game === 'photo' && cs.mode !== 'plain') {
        const p0 = await r074Probe(L);
        await L.evaluate(R074_SAMPLER);
        await L.evaluate('window.__labSet({ at: 15000 })');
        await raf2(L);
        await L.waitFor("(() => { const i = document.querySelector('.mg-card .photo-frame img'); return Boolean(i && i.complete && i.naturalWidth > 0); })()", 25000).catch(() => false);
        await sleep(500);
        const list = JSON.parse(await L.evaluate('(window.__r074.on = false, JSON.stringify(window.__r074.list))'));
        const boxes = [...new Set(list.map((x) => x.box))];
        row.inplay = { before: p0.box, boxes: boxes.slice(0, 4), shMax: Math.max(...list.map((x) => x.sh)), frames: list.length };
      }
      const b = await r074Probe(L);
      if (R074_SHOT_SIZES.has(sz.n)) await snap(L, `${tag === 'after' ? '' : `${tag}/`}photo-reveal-${name}-${sz.n}-before`);
      await L.evaluate(R074_SAMPLER);
      await L.evaluate("window.__labSet({ phase: 'roundResult' })");
      await raf2(L);
      const r = await r074Probe(L);
      if (R074_SHOT_SIZES.has(sz.n)) await snap(L, `${tag === 'after' ? '' : `${tag}/`}photo-reveal-${name}-${sz.n}-reveal`);
      await L.waitFor("(() => { const i = document.querySelector('.mg-card .quiz-reveal img, .mg-card .which-card img'); return !i || (i.complete && i.naturalWidth > 0); })()", 25000).catch(() => false);
      await raf2(L);
      const o = await r074Probe(L);
      await sleep(500);
      const a = await r074Probe(L);
      if (R074_SHOT_SIZES.has(sz.n)) await snap(L, `${tag === 'after' ? '' : `${tag}/`}photo-reveal-${name}-${sz.n}-after`);
      const list = JSON.parse(await L.evaluate('(window.__r074.on = false, JSON.stringify(window.__r074.list))')).filter((x) => x.phase === 'roundResult');
      const boxes = [...new Set(list.map((x) => x.box))];
      const shs = list.map((x) => x.sh);
      const cards = list.map((x) => x.card);
      Object.assign(row, {
        before: { sh: b.sh, ih: b.ih, card: b.card, box: b.box, cOver: b.cOver },
        reveal: { sh: r.sh, card: r.card, box: r.box, cOver: r.cOver },
        onload: { sh: o.sh, card: o.card, box: o.box, cOver: o.cOver },
        after: { sh: a.sh, card: a.card, box: a.box, cOver: a.cOver, scrollers: a.scrollers },
        frames: list.length,
        boxN: boxes.length,
        boxes: boxes.slice(0, 5),
        cardGrow: Math.max(...cards) - Math.min(...cards),
        shGrow: Math.max(...shs) - Math.min(...shs),
        // ★ 모바일은 화면 스크롤 하나가 설계(styles 2124) — 문서 스크롤은 PC 만 결함 · 모바일은 공개 뒤 높이 변화(shGrow)로 본다
        docScroll: !sz.touch && Math.max(...shs, b.sh) > a.ih + 1,
        overMax: sz.touch ? 0 : Math.max(...list.map((x) => x.cOver), b.cOver),
      });
      row.ok =
        row.boxN === 1 &&
        row.cardGrow === 0 &&
        row.shGrow === 0 &&
        !row.docScroll &&
        row.overMax === 0 &&
        !a.scrollers &&
        (!row.inplay || (row.inplay.boxes.length === 1 && row.inplay.boxes[0] === row.inplay.before));
      table.push(row);
      console.log(
        `  §A ${name} ${sz.n} ${row.ok ? 'ok' : 'NG'} box ${row.boxes.join(' → ')} card±${row.cardGrow} sh±${row.shGrow} doc ${row.docScroll} over ${row.overMax} scr[${a.scrollers}]${row.inplay ? ` · 판 안 ${row.inplay.before} → ${row.inplay.boxes.join(' → ')}` : ''}`,
      );
    }
  }
  await r074Throttle(L, false);
  await r068Touch(L, 1536, 864, false);
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r074');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `photo-reveal-${tag}.json`), JSON.stringify(table, null, 1));
  const bad = table.filter((x) => !x.skip && !x.ok);
  record(
    `★★★ R074 §A 사진 공개 — 그림 쓰는 게임 ${CASES.length} × 크기 ${sizes.length} · 캐시 끔 · 느린 망 · 공개 순간~onLoad~500ms 그림 칸 · 카드 · 문서 높이 변화 0 · 문서 스크롤 0 · 가운데 넘침 0 (${tag})`,
    bad.length === 0 && table.length >= CASES.length * sizes.length,
    `NG ${bad.length}/${table.length}: ${bad
      .slice(0, 6)
      .map((x) => `${x.game}${x.mode ? '-' + x.mode : ''}@${x.size} ${x.boxes?.join('→')} card±${x.cardGrow} doc ${x.docScroll} over ${x.overMax}`)
      .join(' | ')}`,
  );
  L.close();
}

/**
 * ★★★ R074 §A (실제 판) — 진짜 방(위 막대 · 자리 · 채팅 · 평가 줄)에서 미니게임 하나만 켜고 판 2개 동안 프레임마다 잰다.
 *   H = PC(R074_LIVE_PC · 기본 lap2 1536×730) · G = 모바일 m360. 둘 다 캐시 끔 · 느린 망(R074_LIVE_SLOW=0 이면 보통 망).
 *   판(play) 안 그림 칸 변화 · 공개(roundResult) 뒤 그림 칸 · 카드 · 문서 높이 변화 · 가운데 칸 넘침(PC) 을 본다.
 */
async function r074PhotoLive(browser) {
  const keys = (process.env.R074_LIVE ?? 'photo,photoyear,price,estimate,which,worldprice').split(',').filter(Boolean);
  const pc = SHOT_PC.find((s) => s.n === (process.env.R074_LIVE_PC ?? 'lap2')) ?? SHOT_PC[2];
  const tag = process.env.R074_TAG ?? 'after';
  const rows = [];
  for (const [ki, key] of keys.entries()) {
    const { H, G, roomId } = await r051Room(browser, `v${ki}${key.slice(0, 2)}`);
    await H.setViewport(pc.w, pc.h);
    await onlyMinigame(H, key);
    await sleep(300);
    if (!(await toMinigame(H, G))) {
      rows.push({ key, skip: '미니게임 시작 안 됨' });
      H.close();
      G.close();
      continue;
    }
    if (process.env.R074_LIVE_SLOW !== '0') {
      await r074Throttle(H, true);
      await r074Throttle(G, true);
    }
    for (let i = 0; i < 2; i += 1) {
      await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'play'", 40000).catch(() => false);
      await H.evaluate(R074_SAMPLER);
      await G.evaluate(R074_SAMPLER);
      const item = await quizRoundItem(roomId);
      // 한 사람만 맞혀도 기다림이 길다 — 둘 다 그냥 시간 끝까지(사진은 20초) · 숫자 게임은 H 가 답을 내서 빨리
      await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 40000).catch(() => false);
      await G.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 5000).catch(() => false);
      await H.waitFor("[...document.querySelectorAll('.mg-card img')].every((x) => x.complete)", 20000).catch(() => false);
      await G.waitFor("[...document.querySelectorAll('.mg-card img')].every((x) => x.complete)", 20000).catch(() => false);
      await sleep(600);
      if (i === 0) {
        await snap(H, `${tag === 'after' ? '' : `${tag}/`}photo-live-${key}-${pc.n}`);
        await snap(G, `${tag === 'after' ? '' : `${tag}/`}photo-live-${key}-m360`);
      }
      for (const [P, dev, touch] of [[H, pc.n, false], [G, 'm360', true]]) {
        const list = JSON.parse(await P.evaluate('(window.__r074.on = false, JSON.stringify(window.__r074.list))'));
        const play = list.filter((x) => x.phase === 'play');
        const rev = list.filter((x) => x.phase === 'roundResult');
        const uniq = (xs) => [...new Set(xs)];
        const playBoxes = uniq(play.map((x) => x.box).filter(Boolean));
        const revBoxes = uniq(rev.map((x) => x.box));
        const shs = rev.map((x) => x.sh);
        const cards = rev.map((x) => x.card);
        const r = {
          key,
          round: i + 1,
          dev,
          item: item?.item_id ?? '?',
          playBoxes: playBoxes.slice(0, 5),
          revBoxes: revBoxes.slice(0, 5),
          playSh: uniq(play.map((x) => x.sh)).slice(0, 5),
          revSh: uniq(shs).slice(0, 5),
          cardGrow: cards.length ? Math.max(...cards) - Math.min(...cards) : 0,
          shGrow: shs.length ? Math.max(...shs) - Math.min(...shs) : 0,
          docScroll: !touch && Math.max(...list.map((x) => x.sh)) > (list[0]?.ih ?? 0) + 1,
          overMax: touch ? 0 : Math.max(0, ...list.map((x) => x.cOver)),
          frames: [play.length, rev.length],
        };
        r.ok = playBoxes.length <= 1 && revBoxes.length === 1 && r.cardGrow === 0 && r.shGrow === 0 && !r.docScroll && r.overMax === 0;
        rows.push(r);
        console.log(`  §A live ${key} #${i + 1} ${dev} ${r.ok ? 'ok' : 'NG'} play ${r.playBoxes.join('→')} · reveal ${r.revBoxes.join('→')} card±${r.cardGrow} sh±${r.shGrow} [${r.revSh.join(',')}] doc ${r.docScroll} over ${r.overMax}`);
      }
    }
    await r074Throttle(H, false);
    await r074Throttle(G, false);
    H.close();
    G.close();
  }
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r074');
  writeFileSync(path.join(dir, `photo-live-${tag}.json`), JSON.stringify(rows, null, 1));
  const bad = rows.filter((x) => !x.skip && !x.ok);
  record(
    `★★★ R074 §A 실제 판 — 미니게임 ${keys.length} × 판 2 · PC ${pc.n} + m360 · 느린 망 · 판 안 그림 칸 하나 · 공개 뒤 그림 칸 · 카드 · 문서 높이 변화 0 · PC 문서 스크롤 · 가운데 넘침 0 (${tag})`,
    bad.length === 0 && rows.filter((x) => !x.skip).length >= keys.length * 4,
    `NG ${bad.length}/${rows.length}: ${bad.slice(0, 6).map((x) => `${x.key}#${x.round}@${x.dev} ${x.revBoxes?.join('→')} card±${x.cardGrow} sh±${x.shGrow} doc ${x.docScroll} over ${x.overMax}`).join(' | ')}`,
  );
}

/** ★ R074 §A 보정 — 카드 여분(카드 − 그림) · 채팅 칸 · 표 줄 높이 · 움직이는 애니메이션 */
async function r074Calib(browser) {
  const L = await newPage(browser, 'R074-calib', true);
  await L.setViewport(1536, 730);
  await signUp(L, 'pc', '보정');
  const img = await withPg(async (c) => (await c.query(`SELECT image_id, width, height FROM minigame_images WHERE image_id LIKE 'photo-%' AND height > width * 1.2 ORDER BY bytes DESC LIMIT 1`)).rows[0]);
  for (const [w, h] of [[1536, 730], [1280, 720], [1920, 1080]]) {
    await L.setViewport(w, h);
    for (const key of ['photo', 'photoyear', 'which', 'price', 'estimate']) {
      for (const phase of ['play', 'roundResult']) {
        await L.goto(`${BASE}/lab/minigame?scene=1&room=1&key=${key}&phase=${phase}&image=${img.image_id}&mode=plain`);
        await L.waitFor("document.querySelector('.mg-card') !== null", 8000).catch(() => false);
        await sleep(900);
        const m = JSON.parse(await L.evaluate(`JSON.stringify((() => {
          const card = document.querySelector('.mg-card');
          const pic = document.querySelector('.mg-card .photo-frame, .mg-card .which-card .img-wrap, .mg-card .quiz-reveal .img-wrap, .mg-card .quiz-q .img-wrap');
          const chat = document.querySelector('.chat-card');
          const li = [...document.querySelectorAll('.mg-card .mg-table li')];
          const center = document.querySelector('.center');
          const anims = document.getAnimations().map((a) => (a.effect?.target?.className ?? '') + ':' + (a.animationName ?? ''));
          return { card: card.offsetHeight, pic: pic ? pic.offsetHeight : 0, picW: pic ? pic.offsetWidth : 0, chat: chat.offsetHeight, center: center.clientHeight, centerSH: center.scrollHeight, rows: li.length, rowH: li[0] ? li[0].offsetHeight : 0, rowsH: li.length ? li[li.length - 1].getBoundingClientRect().bottom - li[0].getBoundingClientRect().top : 0, anims };
        })())`));
        console.log(`  calib ${w}x${h} ${key} ${phase} card ${m.card} pic ${m.picW}x${m.pic} over ${m.card - m.pic} chat ${m.chat} center ${m.center}/${m.centerSH} rows ${m.rows}×${m.rowH} (${Math.round(m.rowsH)}) anim ${m.anims.join(' ')}`);
      }
    }
  }
  L.close();
}

// ── §B 내 자리 이모티콘 · 팝업 아래 끝 ─────────────────────────────────────────
/** 화면 배율(DPR) — CSS 크기는 그대로 · 픽셀만 (FHD 125% = 1536×~730 CSS · DPR 1.25) */
async function r074Dpr(P, w, h, dpr, touch = false) {
  await P.send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await P.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: touch });
  await sleep(400);
}
const SEAT_PROBE = `(() => {
  const card = document.querySelector('.seat-card.mine');
  const box = card?.querySelector('.seat-emoji');
  const imgs = [...(card?.querySelectorAll('.seat-emoji-pop img') ?? [])];
  if (!card || !box || !imgs.length) return null;
  const c = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const inner = c.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
  const b = box.getBoundingClientRect();
  const ir = imgs.map((i) => i.getBoundingClientRect());
  const bottom = Math.max(...ir.map((r) => r.bottom));
  const right = Math.max(...ir.map((r) => r.right));
  const left = Math.min(...ir.map((r) => r.left));
  const top = Math.min(...ir.map((r) => r.top));
  const f = (v) => Math.round(v * 10) / 10;
  return { card: f(c.height), box: f(b.height), boxW: f(b.width), img: f(ir[0].height), n: imgs.length,
    cutB: f(Math.max(0, bottom - b.bottom)), cutR: f(Math.max(0, right - b.right)), cutL: f(Math.max(0, b.left - left)), cutT: f(Math.max(0, b.top - top)),
    shadowRoom: f(Math.min(b.bottom, inner) - bottom), cardCut: f(Math.max(0, bottom - inner)) };
})()`;
async function sendSeatEmoji(H, n) {
  // n 개 — 입력창에 넣기 토글로 Alt+1 × n → Enter (R073: Alt 는 토글을 따른다)
  await H.setInput('[data-chat-input]', '');
  if (n === 1) {
    await realClick(H, '[data-chat-input]');
    await altDigit(H, '1');
    return;
  }
  // 이모티콘 글자 n 개만 보내면 자리에 나란히(R057) — 입력창에 글자로 넣고 전송
  await H.setInput('[data-chat-input]', ['👍', '😂', '😮'].slice(0, n).join(''));
  await H.click('전송');
}
/** 팝업 뿌리(보이는 것 · 다른 뿌리 안이 아닌 것) — 아래 끝 · 안쪽 스크롤로 마지막 버튼까지 닿나 */
const POP_BOTTOM_PROBE = `(() => {
  const sel = '[role="dialog"], [role="alertdialog"], .modal, .emoji-pop, .shop-pop, .prefs-pop, .social-pop, .invite-pop, .people-pop, .tour-bubble, [data-emoji-help], .person-card, .stats-modal, .gacha-result, .result-card .next-row, .mg-cat';
  const all = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height > 30 && getComputedStyle(e).visibility !== 'hidden');
  const roots = all.filter((e) => !all.some((o) => o !== e && o.contains(e)));
  return roots.map((p) => {
    const scs = [p, ...p.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1; });
    for (const s of scs) s.scrollTop = s.scrollHeight;
    const r = p.getBoundingClientRect();
    const btns = [...p.querySelectorAll('button, input, a[href]')].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden');
    const last = btns.length ? btns.reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a)) : null;
    const lb = last ? last.getBoundingClientRect().bottom : r.bottom;
    for (const s of scs) s.scrollTop = 0;
    return { cls: String(p.className).split(' ').slice(0, 2).join('.'), top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight, over: Math.round(Math.max(0, r.bottom - innerHeight)), topOver: Math.round(Math.max(0, -r.top)), lastOver: Math.round(Math.max(0, lb - innerHeight)), scroll: scs.length };
  });
})()`;
async function r074BottomFlow(browser) {
  const H = await newPage(browser, 'R074-bottom', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'bo', '아래끝방장');
  const roomId = await createRoom(H, 'R074 아래 끝');
  const G = await newPage(browser, 'R074-bottom-g', true);
  await signUp(G, 'bg', '아래끝손님');
  await G.setViewport(1280, 720);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  await H.waitFor("document.querySelectorAll('.seat-card:not(.empty)').length >= 2", 8000).catch(() => false);
  const tag = process.env.R074_TAG ?? 'after';
  const pre = tag === 'after' ? '' : `${tag}/`;

  // ① 내 자리 이모티콘 — PC 6 크기 × DPR 1 · 1.25 × 1개 · 3개
  const seatSizes = [...SHOT_PC, { w: 1366, h: 768, n: 'hd' }].filter((s) => !process.env.R074_SEAT_SIZES || process.env.R074_SEAT_SIZES.split(',').includes(s.n));
  const seat = [];
  for (const sz of seatSizes) {
    for (const dpr of [1, 1.25]) {
      await r074Dpr(H, sz.w, sz.h, dpr);
      // ★ R066 (D-275) 뒤로 자리에는 '이모티콘 보내기' 한 개만 뜬다(채팅에 섞은 이모티콘은 글) → 한 개만 잰다
      for (const n of [1]) {
        await sendSeatEmoji(H, n);
        const shown = await H.waitFor(`document.querySelectorAll('.seat-card.mine .seat-emoji-pop img').length === ${n}`, 3000).catch(() => false);
        if (!shown) console.log('  §B seat 안 뜸', n, await H.evaluate("JSON.stringify({ seat: document.querySelector('.seat-card.mine .seat-emoji')?.innerHTML.slice(0, 300), last: [...document.querySelectorAll('.chat-log > *')].slice(-2).map((e) => e.innerText), input: document.querySelector('[data-chat-input]')?.value })"));
        await sleep(330);
        const peak = JSON.parse(await H.evaluate(`JSON.stringify(${SEAT_PROBE})`));
        await sleep(700);
        const rest = JSON.parse(await H.evaluate(`JSON.stringify(${SEAT_PROBE})`));
        if (n === 1 && (sz.n === 'lap2' || sz.n === 'pc') && (dpr === 1.25 || sz.n === 'pc')) {
          const r = await rectOf(H, '.seat-card.mine');
          if (r) {
            const shot = await H.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x - 4, y: r.y - 4, width: r.w + 8, height: r.h + 8, scale: 2 } });
            const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r074', ...(pre ? [pre] : []));
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(path.join(dir, `seat-emoji-${sz.n}-dpr${dpr === 1 ? '100' : '125'}.png`), Buffer.from(shot.data, 'base64'));
          }
        }
        const row = { size: `${sz.w}x${sz.h}`, n: sz.n, dpr, count: n, rest, peak };
        row.ok = Boolean(rest) && rest.cutB === 0 && rest.cutR === 0 && rest.cutL === 0 && rest.cutT === 0 && rest.cardCut === 0 && rest.shadowRoom >= 0 && Boolean(peak) && peak.cardCut === 0;
        seat.push(row);
        console.log(`  §B seat ${sz.n} ${sz.w}x${sz.h} dpr ${dpr} ×${n} ${row.ok ? 'ok' : 'NG'} card ${rest?.card} box ${rest?.box}x${rest?.boxW} img ${rest?.img} cut B${rest?.cutB} R${rest?.cutR} cardCut ${rest?.cardCut} shadowRoom ${rest?.shadowRoom} · peak cut B${peak?.cutB} cardCut ${peak?.cardCut}`);
        await sleep(2600); // 3초 뒤 사라짐 — 다음 것과 겹치지 않게
      }
    }
  }
  await r074Dpr(H, 1536, 864, 1);
  const badSeat = seat.filter((x) => !x.ok);
  record('★★★ R074 §B 내 자리 이모티콘 — PC 6 크기 × DPR 1 · 1.25 · 쉴 때 자리 안(아래 · 옆 잘림 0 · 그림자 자리) · 튀어 오를 때 카드 밖으로 안 나감', badSeat.length === 0 && seat.length === seatSizes.length * 2, `NG ${badSeat.length}/${seat.length}: ${badSeat.slice(0, 5).map((x) => `${x.n}@${x.dpr}×${x.count} cutB ${x.rest?.cutB} cardCut ${x.rest?.cardCut}/${x.peak?.cardCut} room ${x.rest?.shadowRoom}`).join(' | ')}`);

  if (process.env.R074_ONLY === 'seat') {
    G.close();
    H.close();
    return;
  }
  // ② 팝업 전부 × PC 5 + 모바일 3 — 아래 끝이 화면 안 · 안쪽 스크롤로 마지막 버튼까지
  const pops = [];
  const viaMenu = async (label) => {
    await realClick(H, '#menu-btn');
    await H.waitFor("document.querySelector('.menu-modal') !== null", 3000).catch(() => false);
    await H.evaluate(`[...document.querySelectorAll('.menu-modal .menu-item')].find((b) => b.innerText.includes(${JSON.stringify(label)}))?.click()`);
    await sleep(350);
  };
  const vis = (sel) => H.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].some((e) => e.getClientRects().length > 0)`);
  const openBy = async (sel, menuLabel) => {
    if (await vis(sel)) await realClick(H, sel);
    else if (menuLabel) await viaMenu(menuLabel);
    await sleep(450);
  };
  const closeAll = async () => {
    for (let i = 0; i < 3; i += 1) {
      await H.key('Escape');
      await sleep(120);
    }
    await H.evaluate("document.querySelectorAll('.popup-close').forEach((b) => b.getClientRects().length && b.click())");
    await sleep(250);
  };
  const KINDS = [
    ['invite', () => openBy('#invite-btn', '초대')],
    ['friends', () => openBy('#friends-btn', '친구')],
    ['notices', () => openBy('#bell-btn', '알림')],
    ['profile', () => openBy('#rename-btn', '프로필')],
    ['shop', () => openBy('#shop-btn', '포인트샵')],
    ['people', () => openBy('#people-btn', null)],
    ['prefs', () => openBy('.prefs-toggle', '설정')],
    ['prefs-report', async () => { await openBy('.prefs-toggle', '설정'); await H.evaluate("[...document.querySelectorAll('[role=tab], .prefs-tab, .gear-tab')].find((b) => /제보/.test(b.innerText))?.click()"); await sleep(300); }],
    ['report', async () => { await H.key('b', { alt: true, code: 'KeyB', vk: 66 }); await sleep(450); }],
    ['info', async () => { if (await vis('#menu-btn')) await viaMenu('안내'); else await openGearTab(H, 'info'); await sleep(300); }],
    ['leave', () => openBy('button[aria-label="나가기"]', '나가기')],
    ['emoji', () => openBy('.emoji-btn', null)],
    ['emoji-help', async () => { await H.evaluate("localStorage.removeItem('qw.emojiHelp.v1')"); await openBy('.emoji-btn', null); await H.evaluate("document.querySelector('[data-emoji-help-open], [data-emoji-help-again]')?.click()"); await sleep(300); }],
    ['logout', async () => { await openBy('.prefs-toggle', '설정'); await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '로그아웃' && b.getClientRects().length)?.click()"); await sleep(350); }],
    ['photo', async () => { await openBy('#rename-btn', '프로필'); await H.evaluate("document.querySelector('button.profile-photo')?.click()"); await sleep(350); }],
    ['photo-delete', async () => { await openBy('#rename-btn', '프로필'); await H.evaluate("document.querySelector('button.profile-photo')?.click()"); await sleep(250); await H.evaluate("[...document.querySelectorAll('[role=menuitem]')].find((b) => /삭제/.test(b.innerText))?.click()"); await sleep(300); }],
    ['minigame-pick', async () => { await H.evaluate("[...document.querySelectorAll('button')].find((b) => /골라 하기/.test(b.innerText) && b.getClientRects().length)?.click()"); await sleep(500); }],
    ['minigame-catalog', async () => { if (!(await H.evaluate("document.querySelector('.mg-check input')?.checked === true"))) await H.evaluate("document.querySelector('.mg-check input')?.click()"); await sleep(250); await H.evaluate("document.querySelector('[data-mg-catalog-open]')?.click()"); await sleep(450); }],
    ['kick', async () => { await H.evaluate("document.querySelector('.seat-card.pickable:not(.mine)')?.click()"); await sleep(400); }],
    ['person-card', async () => { await H.evaluate("document.querySelector('.seat-card.mine .avatar, .seat-card.mine .seat-top img, .seat-card.mine .seat-top .av')?.click()"); await sleep(400); }],
    ['stats', async () => { await openBy('#rename-btn', '프로필'); await H.evaluate("document.querySelector('.stats-open')?.click()"); await sleep(400); }],
  ];
  const sizes = [...SHOT_PC.map((s) => ({ ...s, touch: false })), ...SHOT_MOB.map((s) => ({ ...s, touch: true }))];
  for (const sz of sizes) {
    await r068Touch(H, sz.w, sz.h, sz.touch);
    if (!sz.touch) await H.setViewport(sz.w, sz.h);
    await sleep(300);
    for (const [kind, open] of KINDS) {
      await closeAll();
      await open();
      const roots = JSON.parse(await H.evaluate(`JSON.stringify(${POP_BOTTOM_PROBE})`));
      const r = roots.find((x) => !/result-card|next-row/.test(x.cls)) ?? null;
      const row = { kind, size: sz.n, root: r?.cls ?? null, bottom: r?.bottom, ih: r?.ih, over: r?.over ?? null, topOver: r?.topOver ?? null, lastOver: r?.lastOver ?? null, scroll: r?.scroll ?? 0 };
      row.ok = r ? r.over === 0 && r.topOver === 0 && r.lastOver === 0 : null;
      pops.push(row);
      if (sz.n === 'lap2' || sz.n === 'm360') if (r && !row.ok) await snap(H, `${pre}popup-${kind}-${sz.n}`);
    }
    await closeAll();
  }
  // 결과 화면 버튼 줄 — 판 하나(1문제) 끝까지: 방장 강제 종료 → 결과
  const resultRows = [];
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  await setQuestionCount(H, 5).catch(() => {});
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.question-card') !== null", 30000).catch(() => false);
  // 강제 종료 확인 창(host-end)도 잰다
  for (const sz of sizes) {
    await r068Touch(H, sz.w, sz.h, sz.touch);
    if (!sz.touch) await H.setViewport(sz.w, sz.h);
    await closeAll();
    await openHostEnd(H).catch(() => {});
    await sleep(400);
    const roots = JSON.parse(await H.evaluate(`JSON.stringify(${POP_BOTTOM_PROBE})`));
    const r = roots[0] ?? null;
    pops.push({ kind: 'host-end', size: sz.n, root: r?.cls ?? null, bottom: r?.bottom, ih: r?.ih, over: r?.over ?? null, topOver: r?.topOver ?? null, lastOver: r?.lastOver ?? null, scroll: r?.scroll ?? 0, ok: r ? r.over === 0 && r.topOver === 0 && r.lastOver === 0 : null });
    await closeAll();
    await openHostSkip(H).catch(() => {});
    await sleep(400);
    const r2 = JSON.parse(await H.evaluate(`JSON.stringify(${POP_BOTTOM_PROBE})`))[0] ?? null;
    pops.push({ kind: 'host-skip', size: sz.n, root: r2?.cls ?? null, bottom: r2?.bottom, ih: r2?.ih, over: r2?.over ?? null, topOver: r2?.topOver ?? null, lastOver: r2?.lastOver ?? null, scroll: r2?.scroll ?? 0, ok: r2 ? r2.over === 0 && r2.topOver === 0 && r2.lastOver === 0 : null });
    await closeAll();
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  await openHostEnd(H).catch(() => {});
  await sleep(300);
  await confirmFirst(H).catch(() => {});
  await H.waitFor("document.querySelector('.result-card, .room-result') !== null", 20000).catch(() => false);
  await sleep(800);
  for (const sz of sizes) {
    await r068Touch(H, sz.w, sz.h, sz.touch);
    if (!sz.touch) await H.setViewport(sz.w, sz.h);
    await sleep(400);
    const m = JSON.parse(await H.evaluate("JSON.stringify((() => { const row = document.querySelector('.result-card .next-row, .next-row'); if (!row) return null; row.scrollIntoView({ block: 'nearest' }); const r = row.getBoundingClientRect(); return { bottom: Math.round(r.bottom), ih: innerHeight, sh: document.documentElement.scrollHeight }; })())"));
    resultRows.push({ size: sz.n, ...m, ok: m ? m.bottom <= m.ih : null });
    if ((sz.n === 'lap2' || sz.n === 'm360') && m && m.bottom > m.ih) await snap(H, `${pre}result-row-${sz.n}`);
  }
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r074');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `bottom-${tag}.json`), JSON.stringify({ seat, pops, resultRows }, null, 1));
  const seen = pops.filter((x) => x.ok !== null);
  const badPop = seen.filter((x) => !x.ok);
  // PC 에 없는 버튼(참여자 = 모바일 전용 · 알림 = 받은 알림이 있을 때만 🔔)은 못 연 것에서 뺀다
  const missing = [...new Set(pops.filter((x) => x.ok === null && !(/^(people|notices)$/.test(x.kind) && !/^m/.test(x.size))).map((x) => `${x.kind}@${x.size}`))];
  console.log(`  §B 팝업 잰 것 ${seen.length} · 못 연 것 ${missing.length}: ${missing.slice(0, 30).join(' ')}`);
  for (const b of badPop) console.log(`  §B popup NG ${b.kind} ${b.size} ${b.root} bottom ${b.bottom}/${b.ih} over ${b.over} top ${b.topOver} last ${b.lastOver}`);
  record('★★★ R074 §B 팝업 아래 끝 — 종류 전부 × PC 5 + 모바일 3 · 아래 끝 ≤ 화면 · 위로도 안 나감 · 안쪽 스크롤로 마지막 버튼까지 화면 안', badPop.length === 0 && seen.length >= 120, `NG ${badPop.length}/${seen.length}: ${badPop.slice(0, 8).map((x) => `${x.kind}@${x.size} +${x.over}/${x.lastOver}`).join(' | ')} · 못 연 것 ${missing.length}`);
  const badRes = resultRows.filter((x) => x.ok === false);
  record('★★ R074 §B 결과 화면 버튼 줄 — PC 5 + 모바일 3 에서 화면 안(모바일은 스크롤해서 닿음)', badRes.length === 0 && resultRows.filter((x) => x.ok).length >= 6, JSON.stringify(resultRows));
  G.close();
  H.close();
}

// ── §C 등록 안내 넷(D-321) ─────────────────────────────────────────────────────
const demoState = (P) => P.evaluate("JSON.stringify({ demo: document.querySelector('.emoji-pop')?.dataset.emojiDemo ?? null, ghost: document.querySelector('[data-emoji-demo-ghost]') !== null, cap: document.querySelector('[data-emoji-slots-cap]')?.innerText ?? '', seen: localStorage.getItem('qw.flag.emojiDemoSeen') })").then((s) => JSON.parse(s));
async function rightClickAt(P, sel) {
  const r = await rectOf(P, sel);
  if (!r) return false;
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  await P.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await P.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await P.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(250);
  return true;
}
async function r074EmojiFlow(browser) {
  const H = await newPage(browser, 'R074-emoji', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'em', '등록안내');
  await createRoom(H, 'R074 등록 안내');
  // 가 — 처음 열면 자동 시연(기존 계정 전원 한 번 = 플래그 없음)
  await H.evaluate("localStorage.removeItem('qw.flag.emojiDemoSeen')");
  const s0 = await (async () => {
    await openPicker(H);
    return slotIds(H);
  })();
  await sleep(1300);
  const mid = await demoState(H);
  await snap(H, 'emoji-demo-pc-mid');
  await sleep(2600);
  const end = await demoState(H);
  const s1 = await slotIds(H);
  await snap(H, 'emoji-demo-pc-end');
  await sleep(900);
  const pf = await serverPrefs(H);
  record(
    '★★★ R074 §C 가 — 😊 를 처음 열면 고스트가 1번 자리로 혼자 들어가는 시연(3초) · 자리 줄 글 "여기에 놓으세요" · 끝나면 사라짐 · 자리는 그대로 · emojiDemoSeen(이 브라우저 · 계정)',
    mid.demo === 'playing' && mid.ghost && /여기에 놓으세요/.test(mid.cap) && end.demo === 'done' && !end.ghost && JSON.stringify(s0) === JSON.stringify(s1) && end.seen === '1' && pf?.emojiDemoSeen === true,
    JSON.stringify({ mid, end, same: JSON.stringify(s0) === JSON.stringify(s1), server: pf?.emojiDemoSeen }),
  );
  await closePicker(H);
  await openPicker(H);
  await sleep(900);
  const again = await demoState(H);
  record('★★ R074 §C 가 — 본 계정은 다시 열어도 시연 없음', again.demo === 'idle' && !again.ghost, JSON.stringify(again));
  await closePicker(H);
  // 누르면 바로 멈춤
  await H.evaluate("localStorage.removeItem('qw.flag.emojiDemoSeen')");
  await openPicker(H);
  await sleep(900);
  const playing = await demoState(H);
  await realClick(H, '.emoji-pop .pop-title');
  await sleep(120);
  const stopped = await demoState(H);
  record('★★ R074 §C 가 — 시연 중 사용자가 누르면 즉시 멈춤(고스트 없음)', playing.demo === 'playing' && stopped.demo === 'done' && !stopped.ghost, JSON.stringify({ playing, stopped }));
  await closePicker(H);
  // 라 — 카드(그림 중심) · [시연 보기]
  await H.evaluate("localStorage.removeItem('qw.flag.emojiHelpDismissed')");
  await openPicker(H);
  await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
  await sleep(400);
  const card = JSON.parse(await H.evaluate("JSON.stringify({ lines: [...document.querySelectorAll('.emoji-help-lines li')].map((l) => l.innerText.trim()), art: document.querySelector('[data-emoji-help-art] .eh-fly') !== null, anim: getComputedStyle(document.querySelector('[data-emoji-help-art] .eh-fly') ?? document.body).animationName, demoBtn: document.querySelector('[data-emoji-help-demo]') !== null })"));
  const cardLines = JSON.parse(await H.evaluate(LINE_COUNTS('.emoji-help-lines li')));
  await snap(H, 'emoji-help-v2-pc');
  await realClick(H, '[data-emoji-help-demo]');
  await sleep(1000);
  const replay = await demoState(H);
  record(
    '★★★ R074 §C 라 — 카드: 움직이는 그림(eh-fly 애니메이션) + 글 2줄 + "우클릭으로도 돼요" 한 줄 · 줄마다 한 줄 · [시연 보기] 누르면 시연',
    card.art && card.anim === 'eh-fly' && card.lines.length === 3 && /우클릭으로도/.test(card.lines[2]) && cardLines.every((l) => l.n === 1) && card.demoBtn && replay.demo === 'playing',
    JSON.stringify({ card, cardLines, replay }),
  );
  await sleep(2600);
  await H.evaluate("document.querySelector('[data-emoji-help-close]')?.click()");
  await sleep(200);
  // 나 — 자리 줄 글 · 끌기 시작 = 흔들림 + "여기에 놓으세요"
  const cap0 = await H.evaluate("document.querySelector('[data-emoji-slots-cap]')?.innerText ?? ''");
  let capMid = null;
  await realClick(H, '.emoji-tab[title="표정"]');
  await sleep(200);
  await dragTo(H, '.emoji-grid .emoji-cell:nth-child(8)', '.emoji-slot-cell[data-drop-slot="4"]', {
    onMid: async () => {
      capMid = JSON.parse(await H.evaluate("JSON.stringify({ cap: document.querySelector('[data-emoji-slots-cap]')?.innerText ?? '', shake: document.querySelector('.emoji-slots')?.classList.contains('shake') ?? false, anim: getComputedStyle(document.querySelector('.emoji-slots')).animationName })"));
      await snap(H, 'emoji-drag-shake-pc');
    },
  });
  record('★★ R074 §C 나 — 자리 줄 위 연한 글 "끌어다 놓기" · 끌기 시작하면 자리 줄이 한 번 흔들리고 "여기에 놓으세요"', /끌어다 놓기/.test(cap0) && /여기에 놓으세요/.test(capMid?.cap ?? '') && capMid?.shake && capMid?.anim === 'emoji-slots-shake', JSON.stringify({ cap0, capMid }));
  // 다 — PC 우클릭 메뉴
  const pick = Number(await H.evaluate("document.querySelector('.emoji-grid .emoji-cell:nth-child(11) img, .emoji-grid .emoji-cell:nth-child(11) [data-emoji-id]')?.dataset.emojiId ?? 0"));
  await rightClickAt(H, '.emoji-grid .emoji-cell:nth-child(11)');
  const menu = JSON.parse(await H.evaluate("JSON.stringify((() => { const m = document.querySelector('[data-emoji-menu]'); const p = document.querySelector('.emoji-pop'); if (!m || !p) return null; const a = m.getBoundingClientRect(); const b = p.getBoundingClientRect(); return { cells: m.querySelectorAll('[data-menu-slot]').length, inPop: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1, inView: a.bottom <= innerHeight && a.top >= 0, title: m.innerText.split('\\n')[0] }; })())"));
  await snap(H, 'emoji-menu-pc');
  await realClick(H, '[data-emoji-menu] [data-menu-slot="3"]');
  await sleep(300);
  const sm = await slotIds(H);
  const noteM = await H.evaluate("document.querySelector('[data-emoji-drop-note]')?.innerText ?? ''");
  record('★★★ R074 §C 다 — PC 우클릭 → 작은 메뉴(10칸 미리 보기 · 창 안 · 화면 안) → 4번 누르면 그 자리 교체 · "4번 자리에 넣었어요" · 메뉴 닫힘', menu?.cells === 10 && menu.inPop && menu.inView && sm[3] === pick && /4번 자리에 넣었어요/.test(noteM) && (await H.evaluate("document.querySelector('[data-emoji-menu]') === null")), JSON.stringify({ menu, pick, s3: sm[3], noteM }));
  // 메뉴 Esc · 자리 우클릭 = 바꾸기 메뉴
  await rightClickAt(H, '.emoji-slot-cell[data-drop-slot="0"] .emoji-slot');
  const slotMenu = await H.evaluate("document.querySelector('[data-emoji-menu] .emoji-slot-menu-title')?.innerText ?? ''");
  await H.key('Escape', { code: 'Escape', vk: 27 });
  await sleep(150);
  const escOk = await H.evaluate("document.querySelector('[data-emoji-menu]') === null && document.querySelector('.emoji-pop') !== null");
  record('★★ R074 §C 다 — 자리 우클릭 = "어느 자리와 바꿀까요?" · Esc = 메뉴만 닫힘(창은 그대로)', /바꿀까요/.test(slotMenu) && escOk, JSON.stringify({ slotMenu, escOk }));
  // 다 — 모바일 길게 눌렀다 떼기 → 메뉴
  await r068Touch(H, 360, 740, true);
  await sleep(400);
  await closePicker(H);
  await openPicker(H, true);
  await tapOn(H, '.emoji-tab[title="표정"]');
  const mcap = await H.evaluate("document.querySelector('[data-emoji-slots-cap]')?.innerText ?? ''");
  const mpick = Number(await H.evaluate("document.querySelector('.emoji-grid .emoji-cell:nth-child(5)')?.querySelector('[data-emoji-id]')?.dataset.emojiId ?? document.querySelector('.emoji-grid .emoji-cell:nth-child(5)')?.dataset.emojiId ?? 0"));
  const c5 = await rectOf(H, '.emoji-grid .emoji-cell:nth-child(5)');
  await H.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c5.x + c5.w / 2, y: c5.y + c5.h / 2 }] });
  await sleep(620);
  await H.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
  const mm = JSON.parse(await H.evaluate("JSON.stringify((() => { const m = document.querySelector('[data-emoji-menu]'); if (!m) return null; const a = m.getBoundingClientRect(); return { cells: m.querySelectorAll('[data-menu-slot]').length, inView: a.left >= 0 && a.right <= innerWidth && a.bottom <= innerHeight && a.top >= 0, popOpen: document.querySelector('.emoji-pop') !== null }; })())"));
  await snap(H, 'emoji-menu-m360');
  await tapOn(H, '[data-emoji-menu] [data-menu-slot="1"]');
  await sleep(300);
  const ms = await slotIds(H);
  record('★★★ R074 §C 다 — 모바일 360 길게 눌렀다 안 움직이고 떼면 메뉴(10칸 · 화면 안 · 창 열린 채) → 2번 누르면 교체 · 자리 줄 글 "길게 눌러 끌기"', mm?.cells === 10 && mm.inView && mm.popOpen && ms[1] === mpick && /길게 눌러 끌기/.test(mcap), JSON.stringify({ mm, mpick, s1: ms[1], mcap }));
  // 짧게 누르기 = 보내기(그대로)
  await tapOn(H, '.emoji-grid .emoji-cell:nth-child(6)');
  await sleep(300);
  record('★★ R074 §C — 모바일 짧게 누르기는 그대로 바로 보내기(창 닫힘 · R073)', await H.evaluate("document.querySelector('.emoji-pop') === null"));
  // 카드 모바일 그림
  await H.evaluate("localStorage.removeItem('qw.flag.emojiHelpDismissed')");
  await openPicker(H, true);
  await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
  await sleep(300);
  const mLines = JSON.parse(await H.evaluate(LINE_COUNTS('.emoji-help-lines li')));
  await snap(H, 'emoji-help-v2-m360');
  record('★★ R074 §C 라 — 모바일 카드: 글 2줄 + "길게 눌러 떼면 자리 메뉴" · 360 에서 줄마다 한 줄', mLines.length === 3 && /길게 눌러 떼면/.test(mLines[2]?.t ?? '') && mLines.every((l) => l.n === 1), JSON.stringify(mLines));
  await closePicker(H);
  // 투어 ④ = 카드 + 시연 — 새 계정(투어 안 봄 · 서버 값도 없음) · 시연은 '봤다' 로 둔 채(억지로 보이는지)
  H.close();
  const T = await newPage(browser, 'R074-tour', true);
  await T.setViewport(1536, 864);
  await signUp(T, 'et', '투어시연', { fresh: true });
  await createRoom(T, 'R074 투어');
  await T.waitFor("document.querySelector('[data-tour]') !== null", 8000).catch(() => false);
  await T.evaluate("localStorage.setItem('qw.flag.emojiDemoSeen', '1')");
  for (let i = 0; i < 3; i += 1) {
    await sleep(600);
    await realClick(T, '[data-tour-next]');
  }
  await T.waitFor("document.querySelector('[data-emoji-help]') !== null", 4000).catch(() => false);
  await sleep(900);
  const t4 = await demoState(T);
  await snap(T, 'emoji-demo-tour4-pc');
  record('★★ R074 §C — 투어 ④ 는 안내 카드 + 시연(본 계정이어도 억지로)', t4.demo === 'playing' && t4.ghost && (await T.evaluate("document.querySelector('[data-tour]')?.dataset.tourStep === '4'")), JSON.stringify(t4));
  T.close();
}

// ── §D 사무실 모드(D-322) · 밤 테마(D-323) ─────────────────────────────────────
/** ★ 밤 "전" 그림 — 옛 밤 토큰 · 예외(HEAD 의 styles.css)를 페이지 끝에 덧붙여 그린다(같은 빌드 · 같은 화면) */
function oldNightCss() {
  const src = execFileSync('git', ['show', 'HEAD:client/src/styles.css'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const block = (start) => {
    const i = src.indexOf(start);
    if (i < 0) return '';
    const j = src.indexOf('}', i);
    return src.slice(i, j + 1);
  };
  return [block("[data-theme='night'] {"), block("[data-theme='night'] .brand-mark {"), block("[data-theme='night'] .avatar:not(.photo) {"), "[data-theme='night'] .ceremony { animation: pop-in 300ms var(--ease-pop), ceremony-glow 1600ms ease-in-out infinite alternate; } [data-theme='night'] .mg-card::before { background: linear-gradient(90deg, var(--p1, #ff7aa2), var(--accent), var(--p4, #ffc14d)); } [data-theme='night'] .mg-intro-name { background: linear-gradient(90deg, var(--p1, #ff7aa2), var(--accent), var(--p4, #ffc14d)); -webkit-background-clip: text; background-clip: text; color: transparent; }"].join('\n');
}
const injectCss = (P, css) => P.evaluate(`(() => { let s = document.getElementById('r074-old'); if (!s) { s = document.createElement('style'); s.id = 'r074-old'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(css)}; return true; })()`);
const clearCss = (P) => P.evaluate("document.getElementById('r074-old')?.remove() ?? true");
async function pickTheme(P, id) {
  await openGearTab(P, 'settings').catch(() => {});
  await sleep(200);
  const ok = await P.evaluate(`(() => { const b = document.querySelector('[data-theme-btn="${id}"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(250);
  await P.evaluate("document.querySelector('[data-gear-pop] .popup-close, .prefs-pop .popup-close')?.click()");
  await sleep(200);
  return ok;
}
async function r074ThemeFlow(browser) {
  const H = await newPage(browser, 'R074-theme', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'th', '사무실방장');
  const roomId = await createRoom(H, 'R074 사무실');
  const G = await newPage(browser, 'R074-theme-g', true);
  await signUp(G, 'tg', '사무실손님');
  await G.setViewport(1280, 720);
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  // 소리 켬 상태에서 사무실로 → 꺼짐 · 안내 한 줄 · 탭 제목 · 파비콘
  await H.evaluate("localStorage.setItem('qw.sound.v1', JSON.stringify({ ...(JSON.parse(localStorage.getItem('qw.sound.v1') || '{}')), bgmOn: true, sfxOn: true, chatOn: true }))");
  await H.goto(`${BASE}/r/${roomId}`);
  await H.waitFor("document.querySelector('.stage') !== null", 8000).catch(() => false);
  const picked = await pickTheme(H, 'office');
  await sleep(300);
  const on = JSON.parse(await H.evaluate("JSON.stringify({ theme: document.documentElement.dataset.theme, title: document.title, icon: document.querySelector('link[data-office-icon]')?.href?.slice(0, 30) ?? null, sound: JSON.parse(localStorage.getItem('qw.sound.v1') || '{}'), saved: localStorage.getItem('qw.office.sound.v1'), toast: document.querySelector('.toast')?.innerText ?? '', font: getComputedStyle(document.body).fontFamily.slice(0, 40), bg: getComputedStyle(document.body).backgroundColor, radius: getComputedStyle(document.querySelector('.seat-card')).borderRadius, shadow: getComputedStyle(document.querySelector('.seat-card')).boxShadow, anim: getComputedStyle(document.querySelector('.seat-card')).animationDuration })"));
  record(
    '★★★ R074 §D 사무실 — 고르면 data-theme=office · 탭 제목 "명령 프롬프트" · 검은 네모 파비콘 · 소리 셋 꺼짐(전 값 기억) + 한 줄 안내 · 검은 바탕 · 고정폭 글꼴 · 둥글기 · 그림자 0 · 움직임 끔',
    picked && on.theme === 'office' && on.title === '명령 프롬프트' && Boolean(on.icon) && on.sound.bgmOn === false && on.sound.sfxOn === false && on.sound.chatOn === false && Boolean(on.saved) && /소리를 껐어요/.test(on.toast) && /Consolas/.test(on.font) && on.bg === 'rgb(12, 12, 12)' && on.radius === '0px' && on.shadow === 'none' && on.anim === '0.001s',
    JSON.stringify(on),
  );
  // 이모티콘 · 아바타 = 글자
  await realClick(H, '[data-chat-input]');
  await altDigit(H, '1');
  await sleep(700);
  const txt = JSON.parse(await H.evaluate("JSON.stringify({ seatText: document.querySelector('.seat-card.mine .seat-emoji-pop .emoji-text')?.innerText ?? null, seatImg: document.querySelectorAll('.seat-emoji-pop img.emoji').length, chatImg: document.querySelectorAll('.chat-log img.emoji').length, chatText: document.querySelector('.chat-log .emoji-text')?.innerText ?? null, avatarImg: document.querySelectorAll('img.avatar.photo').length, avatar: getComputedStyle(document.querySelector('.seat-card .avatar'), '::before').content })"));
  await snapSizes(H, 'office-lobby', [...SHOT_PC]);
  // ★ R075 (D-322 2판) — 아바타 괄호 [ ] 를 뺐다(첫 글자 하나)
  record('★★★ R074 §D 사무실 ① — 이모티콘 = :이름: 글자(자리 · 채팅) · 그림 0 · 아바타 = 첫 글자(R075 2판 — 괄호 없음)', /^:.+:$/.test(txt.seatText ?? '') && txt.seatImg === 0 && txt.chatImg === 0 && /^:.+:$/.test(txt.chatText ?? '') && txt.avatarImg === 0 && !/\[/.test(txt.avatar), JSON.stringify(txt));
  await openPicker(H);
  await sleep(300);
  await snap(H, 'office-emoji-pc');
  await closePicker(H);
  for (const s of SHOT_MOB) {
    await r068Touch(H, s.w, s.h, true);
    await sleep(400);
    await snap(H, `office-lobby-${s.n}`);
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  // 게임 중 · 정답 공개 · 결과
  await setQuestionCount(H, 5).catch(() => {});
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.replace(/[\\[\\] ]/g, '').trim() === '게임시작')?.click()");
  await H.waitFor("document.querySelector('.question-card .q-text') !== null", 30000).catch(() => false);
  await sleep(600);
  const game = JSON.parse(await H.evaluate("JSON.stringify({ q: document.querySelector('.question-card') !== null, band: getComputedStyle(document.querySelector('.question-card')).backgroundImage })"));
  await snapSizes(H, 'office-game', [...SHOT_PC]);
  for (const s of SHOT_MOB) {
    await r068Touch(H, s.w, s.h, true);
    await sleep(400);
    await snap(H, `office-game-${s.n}`);
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  await answerCurrent(H, G);
  await H.waitFor("document.querySelector('.reveal, .ceremony') !== null", 10000).catch(() => false);
  await sleep(500);
  const rev = JSON.parse(await H.evaluate("JSON.stringify({ reveal: document.querySelector('.reveal, .ceremony') !== null, cerAnim: getComputedStyle(document.querySelector('.ceremony') ?? document.body).animationName, imgs: document.querySelectorAll('.ceremony img.emoji, .special-float img').length })"));
  await snapSizes(H, 'office-reveal', [...SHOT_PC]);
  await r068Touch(H, 390, 844, true);
  await sleep(400);
  await snap(H, 'office-reveal-m390');
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  record('★★ R074 §D 사무실 ④ — 문제 카드 그라데이션 없음 · 정답 공개 세레모니 움직임 없음(animation none)', game.q && game.band === 'none' && rev.reveal && (rev.cerAnim === 'none' || rev.cerAnim === ''), JSON.stringify({ game, rev }));
  await openHostEnd(H).catch(() => {});
  await sleep(300);
  await confirmFirst(H).catch(() => {});
  await H.waitFor("document.querySelector('.result-card, .room-result') !== null", 20000).catch(() => false);
  await sleep(700);
  await snapSizes(H, 'office-result', [...SHOT_PC]);
  for (const s of SHOT_MOB) {
    await r068Touch(H, s.w, s.h, true);
    await sleep(400);
    await snap(H, `office-result-${s.n}`);
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  // 되돌리면 소리 · 탭 제목 복원
  await pickTheme(H, 'pastel');
  await sleep(300);
  const back = JSON.parse(await H.evaluate("JSON.stringify({ theme: document.documentElement.dataset.theme, title: document.title, icon: document.querySelector('link[data-office-icon]') !== null, sound: JSON.parse(localStorage.getItem('qw.sound.v1') || '{}'), saved: localStorage.getItem('qw.office.sound.v1'), img: document.querySelectorAll('.emoji-text').length })"));
  record('★★★ R074 §D 사무실 ② ③ — 파스텔로 되돌리면 소리 셋 전 값(켬) 복원 · 탭 제목 "상식 퀴즈" · 파비콘 없음 · 이모티콘 그림으로', back.theme === 'pastel' && back.title === '상식 퀴즈' && !back.icon && back.sound.bgmOn === true && back.sound.sfxOn === true && back.sound.chatOn === true && !back.saved && back.img === 0, JSON.stringify(back));
  // ── 밤 전 · 후(같은 화면 넷: 로비 · 게임 · 공개 · 결과 — 결과는 지금 화면)
  await pickTheme(H, 'night');
  const oldCss = oldNightCss();
  const nightShots = async (tag) => {
    for (const [s, touch] of [[{ w: 1536, h: 730, n: 'lap2' }, false], [{ w: 390, h: 844, n: 'm390' }, true]]) {
      await r068Touch(H, s.w, s.h, touch);
      if (!touch) await H.setViewport(s.w, s.h);
      await sleep(400);
      await injectCss(H, '');
      await snap(H, `night-after-${tag}-${s.n}`);
      await injectCss(H, oldCss);
      await sleep(150);
      await snap(H, `night-before-${tag}-${s.n}`);
      await clearCss(H);
    }
    await r068Touch(H, 1536, 864, false);
    await H.setViewport(1536, 864);
  };
  await nightShots('result');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => /로비로|대기실/.test(b.innerText))?.click()");
  await H.waitFor("document.querySelector('.lobby-card') !== null", 15000).catch(() => false);
  await sleep(600);
  await nightShots('lobby');
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.question-card .q-text') !== null", 30000).catch(() => false);
  await sleep(600);
  await nightShots('game');
  await answerCurrent(H, G);
  await H.waitFor("document.querySelector('.reveal, .ceremony') !== null", 10000).catch(() => false);
  await sleep(400);
  await nightShots('reveal');
  const nightTok = JSON.parse(await H.evaluate("JSON.stringify((() => { const cs = getComputedStyle(document.documentElement); return ['--page', '--surface', '--text', '--accent', '--accent-2'].map((k) => cs.getPropertyValue(k).trim()); })())"));
  record('★★ R074 §D 밤 — 바탕 #121212 · 표면 #1e1e1e · 글자 #e6e6e6 · 강조 하나(accent = accent-2) · 전/후 그림 넷 × 2 크기', nightTok[0] === '#121212' && nightTok[1] === '#1e1e1e' && nightTok[2] === '#e6e6e6' && nightTok[3] === nightTok[4], JSON.stringify(nightTok));
  await pickTheme(H, 'pastel');
  G.close();
  H.close();
}

// =============================================================================
// ★★★ R073 — 이모티콘 끌어서 등록(D-317) · 😊 안내 카드(D-318) · 첫 안내 투어(D-319) · ⓘ 리뉴얼(D-320)
//   (UICHECK_R073=1 · 묶음 r073 · docs/design/r073) · R073_ONLY = drag | card | tour | info (없으면 전부)
// =============================================================================
/** ★ R073 — 끌어서 놓기(진짜 입력). 마우스: 누름 → 단계 이동 → 뗌 · 터치: 누름 → hold(집어 올림) → 이동 → 뗌.
 *  to = 선택자 또는 {x,y} · onMid/onEnd = 가운데 · 놓기 직전에 부른다(그림) */
async function dragTo(page, fromSel, to, { touch = false, hold = 560, steps = 14, onMid = null, onEnd = null } = {}) {
  const c = (sel) =>
    page
      .evaluate(`JSON.stringify((() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.offsetParent !== null || getComputedStyle(x).position === 'fixed'); if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })())`)
      .then((s) => JSON.parse(s));
  const a = await c(fromSel);
  const b = typeof to === 'string' ? await c(to) : to;
  if (!a || !b) return { ok: false, a, b };
  if (touch) {
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    await sleep(hold);
  } else {
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  }
  for (let i = 1; i <= steps; i += 1) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (touch) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    else await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(18);
    if (i === Math.round(steps / 2) && onMid) await onMid();
  }
  await sleep(80);
  const hover = JSON.parse(await page.evaluate("JSON.stringify({ ghost: document.querySelector('[data-emoji-ghost]') !== null, slot: document.querySelector('.emoji-slot-cell.drop-hover')?.dataset.dropSlot ?? null, input: document.body.classList.contains('emoji-drop-input'), dragging: document.body.classList.contains('emoji-dragging') })"));
  if (onEnd) await onEnd();
  if (touch) await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(300);
  return { ok: true, hover };
}
const slotIds = (P) => P.evaluate("JSON.stringify([...document.querySelectorAll('.emoji-pop .emoji-slot img')].map((i) => Number(i.dataset.emojiId)))").then((s) => JSON.parse(s));
const serverPrefs = (P) => P.evaluate("fetch('/api/auth/prefs').then((r) => r.json()).then((j) => JSON.stringify(j.prefs ?? null))").then((s) => JSON.parse(s));
/** 글 상자마다 줄 수(Range top 종류) */
const LINE_COUNTS = (sel) => `JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel)})].filter((li) => li.getClientRects().length > 0).map((li) => { const tops = []; const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const rc of rg.getClientRects()) { if (rc.width < 1) continue; if (!tops.some((t) => Math.abs(t - rc.top) < rc.height * 0.5)) tops.push(rc.top); } } return { t: li.innerText.trim(), n: tops.length, len: [...li.innerText.trim()].length }; }))`;
const openPicker = async (P, touch = false) => {
  if (!(await P.evaluate("document.querySelector('.emoji-pop') !== null"))) {
    if (touch) await tapOn(P, '.emoji-btn');
    else await realClick(P, '.emoji-btn');
  }
  return P.waitFor("document.querySelectorAll('.emoji-pop .emoji-slot').length === 10", 4000).catch(() => false);
};
const closePicker = async (P) => {
  await P.evaluate("document.querySelector('.emoji-pop .popup-close')?.click()");
  await sleep(200);
};
const tourState = (P) => P.evaluate("JSON.stringify((() => { const t = document.querySelector('[data-tour]'); const ring = document.querySelector('.tour-ring')?.getBoundingClientRect(); const b = document.querySelector('.tour-bubble')?.getBoundingClientRect(); return t ? { step: Number(t.dataset.tourStep), text: document.querySelector('.tour-bubble')?.innerText.replace(/\\s+/g, ' ') ?? '', ring: ring ? [Math.round(ring.left), Math.round(ring.top), Math.round(ring.width), Math.round(ring.height)] : null, bubbleIn: b ? b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight : false, shop: document.querySelector('.shop-pop') !== null, menu: document.querySelector('.menu-modal') !== null, pop: document.querySelector('.emoji-pop') !== null, card: document.querySelector('[data-emoji-help]') !== null, gift: document.querySelector('[data-signup-gift]') !== null } : null; })())").then((s) => JSON.parse(s));
/** 강조 테두리가 그 요소를 감싸나 */
const ringWraps = (P, sel) => P.evaluate(`(() => { const r = document.querySelector('.tour-ring')?.getBoundingClientRect(); const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.offsetParent !== null || getComputedStyle(x).position === 'fixed')?.getBoundingClientRect(); return Boolean(r && e && r.left <= e.left + 1 && r.top <= e.top + 1 && r.right >= e.right - 1 && r.bottom >= e.bottom - 1); })()`);

async function r073Flow(browser) {
  const only = process.env.R073_ONLY ?? '';
  if (!only || only === 'drag') await r073DragFlow(browser);
  if (!only || only === 'card') await r073CardFlow(browser);
  if (!only || only === 'tour') await r073TourFlow(browser);
  if (!only || only === 'info') await r073InfoFlow(browser);
}

// ── §A 끌어서 등록 ────────────────────────────────────────────────────────────
async function r073DragFlow(browser) {
  const H = await newPage(browser, 'R073-drag', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'xd', '끌기방장');
  await createRoom(H, 'R073 끌기');
  await openPicker(H);
  const removed = JSON.parse(await H.evaluate("JSON.stringify({ pen: document.querySelector('[data-emoji-edit]') !== null, keyBtn: document.querySelector('button.emoji-key') !== null, keySpan: document.querySelectorAll('span.emoji-key[data-slot-key]').length, tip: document.querySelector('[data-slot-tip], [data-slot-edit], [data-slot-assign]') !== null, card: document.querySelector('[data-emoji-help]') !== null })"));
  record('★★★ R073 §A 없앤 것 — ✎ · 숫자 자리 버튼 · 편집/고르기 안내 없음 · 숫자 10개는 글자(표시만) · (다시 보지 않음 계정이라 카드 없음)', !removed.pen && !removed.keyBtn && removed.keySpan === 10 && !removed.tip && !removed.card, JSON.stringify(removed));
  await realClick(H, '.emoji-tab[title="표정"]');
  await sleep(200);
  const s0 = await slotIds(H);
  const pick = Number(await H.evaluate("document.querySelector('.emoji-grid .emoji-cell:nth-child(7) img')?.dataset.emojiId ?? 0"));
  // ① 이모티콘 → 2번 자리 (끄는 중 · 자리 위 그림)
  const d1 = await dragTo(H, '.emoji-grid .emoji-cell:nth-child(7)', '.emoji-slot-cell[data-drop-slot="1"]', {
    onMid: () => snap(H, 'emoji-drag-pc-moving'),
    onEnd: () => snap(H, 'emoji-drag-pc-slot'),
  });
  const s1 = await slotIds(H);
  const note1 = await H.evaluate("document.querySelector('[data-emoji-drop-note]')?.innerText ?? ''");
  await snap(H, 'emoji-drag-pc-dropped');
  record('★★★ R073 §A PC 끌기 — 6px 넘게 움직이면 고스트 · 자리 위에서 그 자리 커짐 · 놓으면 2번 자리 교체 · "2번 자리에 넣었어요" · 창은 열린 채', d1.hover?.ghost && d1.hover.slot === '1' && s1[1] === pick && s1[0] === s0[0] && /2번 자리에 넣었어요/.test(note1) && (await H.evaluate("document.querySelector('.emoji-pop') !== null")), JSON.stringify({ hover: d1.hover, pick, s0: s0.slice(0, 3), s1: s1.slice(0, 3), note1 }));
  // ② 자리끼리 = 서로 바꿈 (1번 ⇄ 0번)
  await dragTo(H, '.emoji-slot-cell[data-drop-slot="0"] .emoji-slot', '.emoji-slot-cell[data-drop-slot="9"]');
  const s2 = await slotIds(H);
  const note2 = await H.evaluate("document.querySelector('[data-emoji-drop-note]')?.innerText ?? ''");
  record('★★★ R073 §A 자리 → 자리 = 서로 바꿈(1번 ⇄ 0번) · 한 줄 안내', s2[0] === s1[9] && s2[9] === s1[0] && s2[1] === s1[1] && /1번 ⇄ 0번/.test(note2), JSON.stringify({ s1: [s1[0], s1[9]], s2: [s2[0], s2[9]], note2 }));
  await sleep(1300);
  const pf = await serverPrefs(H);
  record('★★ R073 §A 바꾼 자리가 계정에 저장(prefs emojiSlots)', Array.isArray(pf?.emojiSlots) && pf.emojiSlots[1] === pick && pf.emojiSlots[0] === s2[0], JSON.stringify(pf?.emojiSlots));
  // ③ 채팅 입력창에 놓기 = 넣기(창은 열어 둔다)
  const before = await H.evaluate("document.querySelector('[data-chat-input]').value");
  const d3 = await dragTo(H, '.emoji-grid .emoji-cell:nth-child(3)', '[data-chat-input]', { onEnd: () => snap(H, 'emoji-drag-pc-input') });
  const after = await H.evaluate("document.querySelector('[data-chat-input]').value");
  const s3 = await slotIds(H);
  record('★★★ R073 §A 채팅 입력창에 놓기 = 입력창에 넣기(입력창 밝아짐) · 자리 그대로 · 창 열린 채', d3.hover?.input && after.length > before.length && JSON.stringify(s3) === JSON.stringify(s2) && (await H.evaluate("document.querySelector('.emoji-pop') !== null")), JSON.stringify({ hover: d3.hover, before, after }));
  // ④ 그 밖에 놓기 = 취소
  const d4 = await dragTo(H, '.emoji-grid .emoji-cell:nth-child(4)', { x: 40, y: 300 });
  const s4 = await slotIds(H);
  const after4 = await H.evaluate("document.querySelector('[data-chat-input]').value");
  record('★★ R073 §A 그 밖에 놓기 = 아무 일 없음(자리 · 입력창 그대로)', d4.ok && JSON.stringify(s4) === JSON.stringify(s2) && after4 === after && !(await H.evaluate("document.body.classList.contains('emoji-dragging')")), JSON.stringify({ hover: d4.hover }));
  // ⑤ 안 움직이고 누르기 = 지금처럼 보내기(창 닫힘)
  await realClick(H, '.emoji-grid .emoji-cell:nth-child(5)');
  await sleep(300);
  const sentClosed = await H.evaluate("document.querySelector('.emoji-pop') === null");
  record('★★ R073 §A 누르기(움직임 없음) = 바로 보내기 · 창 닫힘(R060 그대로)', sentClosed);
  // ⑥ Alt+1 은 토글을 따른다
  await H.evaluate("document.querySelector('[data-chat-input]').value = ''");
  await H.setInput('[data-chat-input]', '');
  await openPicker(H);
  await realClick(H, '[data-emoji-mode="insert"]');
  await closePicker(H);
  await realClick(H, '[data-chat-input]');
  const seatBefore = await H.evaluate("document.querySelectorAll('.seat-emoji-pop img.emoji').length");
  await altDigit(H, '1');
  await sleep(500);
  const altIns = JSON.parse(await H.evaluate("JSON.stringify({ v: document.querySelector('[data-chat-input]').value, seat: document.querySelectorAll('.seat-emoji-pop img.emoji').length })"));
  await openPicker(H);
  await realClick(H, '[data-emoji-mode="send"]');
  await closePicker(H);
  await H.setInput('[data-chat-input]', '');
  await realClick(H, '[data-chat-input]');
  await altDigit(H, '2');
  const altSent = await H.waitFor("document.querySelector('.seat-emoji-pop img.emoji') !== null", 3000).catch(() => false);
  const v2 = await H.evaluate("document.querySelector('[data-chat-input]').value");
  record('★★★ R073 §A Alt 키는 토글을 따름 — [입력창에 넣기] 면 Alt+1 = 넣기(안 보냄) · [바로 보내기] 면 Alt+2 = 보내기', altIns.v.length > 0 && altIns.seat === seatBefore && altSent && v2 === '', JSON.stringify({ altIns, seatBefore, altSent, v2 }));
  // ⑦ 모바일 m360 — 길게 눌러 집어 올림 · 끌어 놓기 · 짧게 누르기 = 보내기 · 빨리 밀기 = 스크롤(끌기 아님)
  await r068Touch(H, 360, 740, true);
  await sleep(500);
  await openPicker(H, true);
  await tapOn(H, '.emoji-tab[title="표정"]');
  const m0 = await slotIds(H);
  const mpick = Number(await H.evaluate("document.querySelector('.emoji-grid .emoji-cell:nth-child(9) img')?.dataset.emojiId ?? 0"));
  const dm = await dragTo(H, '.emoji-grid .emoji-cell:nth-child(9)', '.emoji-slot-cell[data-drop-slot="2"]', {
    touch: true,
    onMid: () => snap(H, 'emoji-drag-m360-pickup'),
    onEnd: () => snap(H, 'emoji-drag-m360-slot'),
  });
  const m1 = await slotIds(H);
  record('★★★ R073 §A 모바일 360 — 450ms 길게 눌러 집어 올림(고스트) · 3번 자리 위 · 놓으면 교체 · 창 열린 채', dm.hover?.ghost && dm.hover.slot === '2' && m1[2] === mpick && m1[0] === m0[0] && (await H.evaluate("document.querySelector('.emoji-pop') !== null")), JSON.stringify({ hover: dm.hover, mpick, m1: m1.slice(0, 4) }));
  // 빨리 밀기(집어 올리기 전 40px) — 끌기 아님 · 자리 그대로
  const cell = await rectOf(H, '.emoji-grid .emoji-cell:nth-child(12)');
  await H.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }] });
  for (let i = 1; i <= 5; i += 1) {
    await H.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 - i * 9 }] });
    await sleep(20);
  }
  await sleep(600);
  const swipeGhost = await H.evaluate("document.querySelector('[data-emoji-ghost]') !== null");
  await H.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const m2 = await slotIds(H);
  record('★★ R073 §A 모바일 — 집어 올리기 전에 밀면(스크롤) 끌기가 아니다(고스트 없음 · 자리 그대로)', !swipeGhost && JSON.stringify(m2) === JSON.stringify(m1), JSON.stringify({ swipeGhost }));
  // 모바일 입력창에 놓기
  const mb = await H.evaluate("document.querySelector('[data-chat-input]').value");
  const dmi = await dragTo(H, '.emoji-grid .emoji-cell:nth-child(2)', '[data-chat-input]', { touch: true, onEnd: () => snap(H, 'emoji-drag-m360-input') });
  const ma = await H.evaluate("document.querySelector('[data-chat-input]').value");
  record('★★★ R073 §A 모바일 — 채팅 입력창에 놓으면 입력창에 넣기(창 열린 채)', dmi.hover?.input && ma.length > mb.length && (await H.evaluate("document.querySelector('.emoji-pop') !== null")), JSON.stringify({ hover: dmi.hover, mb, ma }));
  // 짧게 누르기 = 보내기
  await tapOn(H, '.emoji-grid .emoji-cell:nth-child(6)');
  await sleep(300);
  record('★★ R073 §A 모바일 짧게 누르기 = 바로 보내기(창 닫힘)', await H.evaluate("document.querySelector('.emoji-pop') === null"));
  await r068Touch(H, 1536, 864, false);
  H.close();
}

// ── §B 안내 카드 ──────────────────────────────────────────────────────────────
async function r073CardFlow(browser) {
  const H = await newPage(browser, 'R073-card', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'xc', '카드방장');
  await createRoom(H, 'R073 카드');
  await H.evaluate("localStorage.removeItem('qw.flag.emojiHelpDismissed')");
  const cardAt = async (label, touch) => {
    await openPicker(H, touch);
    await sleep(250);
    const lines = JSON.parse(await H.evaluate(LINE_COUNTS('[data-emoji-help] li')));
    const fit = JSON.parse(await H.evaluate("JSON.stringify((() => { const p = document.querySelector('.emoji-pop')?.getBoundingClientRect(); const c = document.querySelector('[data-emoji-help]')?.getBoundingClientRect(); return { card: Boolean(c), popIn: Boolean(p) && p.top >= 0 && p.left >= 0 && p.right <= innerWidth && p.bottom <= innerHeight, h: p ? Math.round(p.height) : 0 }; })())"));
    await snap(H, `emoji-help-${label}`);
    return { lines, fit };
  };
  const sizes = [...SHOT_PC.map((s) => ({ ...s, touch: false })), ...SHOT_MOB.map((s) => ({ ...s, touch: true }))];
  const rows = {};
  for (const s of sizes) {
    if (s.touch) await r068Touch(H, s.w, s.h, true);
    else {
      await r068Touch(H, s.w, s.h, false);
      await H.setViewport(s.w, s.h);
    }
    await sleep(400);
    rows[s.n] = await cardAt(s.n, s.touch);
    await closePicker(H);
  }
  // ★ R074 (D-321 라) — 카드는 글 2줄 + 한 줄(우클릭 · 길게 떼기) = PC · 모바일 모두 3줄
  const want = () => 3;
  record('★★★ R073 §B → R074 😊 열 때마다 안내 카드 — PC · 모바일 3줄(2줄 + 한 줄) · 줄마다 한 줄 · 창이 화면 안(PC 5 · 모바일 3)', Object.entries(rows).every(([n, r]) => r.fit.card && r.fit.popIn && r.lines.length === want(n) && r.lines.every((l) => l.n === 1)), JSON.stringify(Object.fromEntries(Object.entries(rows).map(([n, r]) => [n, { ...r.fit, lines: r.lines.map((l) => `${l.n}:${l.len}`) }]))));
  console.log(`  [r073] 카드 문구 ${JSON.stringify(Object.fromEntries(Object.entries(rows).filter(([n]) => n === 'pc' || n === 'm360').map(([n, r]) => [n, r.lines.map((l) => l.t)])))}`);
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  await sleep(300);
  // 체크 없이 닫기 → 다음에 또 · 체크하고 닫기 → 안 뜸(계정)
  await openPicker(H);
  await realClick(H, '[data-emoji-help-close]');
  const closedOnce = await H.evaluate("document.querySelector('[data-emoji-help]') === null && document.querySelector('.emoji-pop') !== null");
  await closePicker(H);
  await openPicker(H);
  const again = await H.evaluate("document.querySelector('[data-emoji-help]') !== null");
  await realClick(H, '[data-emoji-help-never]');
  await snap(H, 'emoji-help-never-checked');
  await realClick(H, '[data-emoji-help-close]');
  await closePicker(H);
  await openPicker(H);
  const gone = await H.evaluate("document.querySelector('[data-emoji-help]') === null");
  await sleep(1200);
  const pf = await serverPrefs(H);
  record('★★★ R073 §B [닫기](체크 없음) = 이번만 · 다시 열면 또 · [다시 보지 않음]+[닫기] = 안 뜸 · 계정 emojiHelpDismissed', closedOnce && again && gone && pf?.emojiHelpDismissed === true, JSON.stringify({ closedOnce, again, gone, flag: pf?.emojiHelpDismissed }));
  await closePicker(H);
  // ⓘ 이모티콘 탭 [안내 다시 보기] → 😊 창 + 카드(다시 보지 않음이어도 한 번)
  await openGearTab(H, 'info');
  await realClick(H, '[data-info-tab="emoji"]');
  await realClick(H, '[data-info-guide]');
  await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
  const replay = JSON.parse(await H.evaluate("JSON.stringify({ card: document.querySelector('[data-emoji-help]') !== null, gear: document.querySelector('[data-gear-pop]') !== null })"));
  await snap(H, 'emoji-help-replay-pc');
  await closePicker(H);
  await openPicker(H);
  const replayOnce = await H.evaluate("document.querySelector('[data-emoji-help]') === null");
  await closePicker(H);
  record('★★ R073 §B ⓘ [안내 다시 보기] → ⚙ 닫히고 😊 창 + 카드 · 그다음 열기는 다시 안 뜸', replay.card && !replay.gear && replayOnce, JSON.stringify({ replay, replayOnce }));
  // 첫 뽑기 → 1번 자리 · 포인트샵 닫으면 😊 창 + 카드(옛 가이드 창 없음)
  await H.evaluate("localStorage.removeItem('qw.flag.emojiHelpDismissed')");
  const hId = await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_xc`])).rows[0]?.id);
  await withPg((c) => c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, 100, 'admin', 'ui-check R073')`, [hId]));
  await realClick(H, '#shop-btn');
  await H.waitFor("document.querySelector('.shop-draw:not([disabled])') !== null", 6000).catch(() => false);
  await realClick(H, '.shop-draw:not([disabled])');
  await H.waitFor("document.querySelector('.gacha-result') !== null", 8000).catch(() => false);
  await sleep(900);
  const noGuide = await H.evaluate("document.querySelector('[data-emoji-guide]') === null && document.querySelector('.shop-pop') !== null");
  await H.evaluate("document.querySelector('.shop-pop .popup-close')?.click()");
  await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
  await sleep(250);
  const first = JSON.parse(await H.evaluate("JSON.stringify({ pop: document.querySelector('.emoji-pop') !== null, card: document.querySelector('[data-emoji-help]') !== null, slot1: Number(document.querySelector('.emoji-pop .emoji-slot img')?.dataset.emojiId ?? 0), special: document.querySelector('.emoji-pop .emoji-slot-cell[data-drop-slot=\"0\"] img')?.getAttribute('src')?.includes('special') ?? null })"));
  await snap(H, 'emoji-help-first-draw-pc');
  const owned = await withPg(async (c) => (await c.query(`SELECT emoji_id FROM account_emojis WHERE account_id = $1`, [hId])).rows.map((r) => Number(r.emoji_id)));
  record('★★★ R073 §B 첫 뽑기 — 결과 화면에 옛 가이드 창 없음 · 포인트샵 닫으면 😊 창 + 카드 · 산 이모티콘이 1번 자리', noGuide && first.pop && first.card && owned.includes(first.slot1), JSON.stringify({ noGuide, first, owned }));
  await closePicker(H);
  await withPg((c) => c.query(`DELETE FROM account_emojis WHERE account_id = $1`, [hId]).catch(() => undefined));
  H.close();
}

// ── §C 첫 안내 투어 ────────────────────────────────────────────────────────────
async function r073TourFlow(browser) {
  // PC 1536 — 새 계정(fresh): 가입 선물 창 없음 · 네 단계 · ①은 포인트샵을 직접 눌러도 다음
  const H = await newPage(browser, 'R073-tour', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'xt', '투어방장', { fresh: true });
  const giftHome = await H.evaluate("document.querySelector('[data-signup-gift]') !== null");
  // 검사 계정은 가입 선물이 없다(accounts.ts — 봇 · 검사 빼고) → 실제 새 계정처럼 50P 를 넣어 그림을 찍는다
  const grant50 = (sfx) => withPg((c) => c.query(`INSERT INTO point_grants (account_id, amount, reason, note) SELECT id, 50, 'admin', 'ui-check R073 가입 선물 흉내' FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_${sfx}`]));
  await grant50('xt');
  await createRoom(H, 'R073 투어');
  await H.waitFor("document.querySelector('[data-tour]') !== null", 6000).catch(() => false);
  await sleep(500);
  const t1 = await tourState(H);
  const w1 = await ringWraps(H, '#shop-btn');
  await snap(H, 'tour-1-pc');
  record('★★★ R073 §C 새 계정 — 가입 선물 창 없음 · 로비에서 투어 ① 🎁 포인트샵 강조 · "가입 선물로 50P" · "지금 NP" · 말풍선 화면 안', !giftHome && t1?.step === 1 && w1 && /가입 선물로 50P/.test(t1.text) && /지금 \d+P/.test(t1.text) && t1.bubbleIn && !t1.gift, JSON.stringify({ giftHome, t1, w1 }));
  // 덮인 곳은 눌리지 않는다(진짜 클릭 — 나가기 버튼)
  const cover = await realClick(H, 'button[aria-label="나가기"]');
  record('★★ R073 §C 투어 판이 다른 버튼을 덮는다(진짜 클릭이 판에 맞음 · 나가기 확인 안 뜸)', !cover.hit && (await H.evaluate("document.querySelector('.confirm-modal') === null")), JSON.stringify(cover));
  await realClick(H, '#shop-btn');
  await H.waitFor("document.querySelector('[data-tour]')?.dataset.tourStep === '2'", 4000).catch(() => false);
  await H.waitFor("document.querySelector('.shop-pop .shop-draw') !== null", 5000).catch(() => false);
  await sleep(500);
  const t2 = await tourState(H);
  const w2 = await ringWraps(H, '.shop-pop .shop-draw');
  await snap(H, 'tour-2-pc');
  record('★★★ R073 §C ② 포인트샵 열림 · [뽑기] 강조 · "포인트는 이모티콘 뽑기에 써요" · "맞힌 문제 1개 = 1P" (①은 강조한 포인트샵을 직접 눌러 넘어옴)', t2?.step === 2 && t2.shop && w2 && /뽑기에 써요/.test(t2.text) && /1개 = 1P/.test(t2.text), JSON.stringify({ t2, w2 }));
  await realClick(H, '[data-tour-next]');
  await sleep(500);
  const t3 = await tourState(H);
  const w3 = await ringWraps(H, '.emoji-btn');
  await snap(H, 'tour-3-pc');
  record('★★★ R073 §C ③ 포인트샵 닫힘 · 😊 강조', t3?.step === 3 && !t3.shop && w3 && /이모티콘/.test(t3.text), JSON.stringify({ t3, w3 }));
  await realClick(H, '[data-tour-next]');
  await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
  await sleep(500);
  const t4 = await tourState(H);
  const w4 = await ringWraps(H, '[data-emoji-help]');
  await snap(H, 'tour-4-pc');
  record('★★★ R073 §C ④ 😊 창 + 안내 카드 강조 · "끌어서 1~0 자리" · [끝]', t4?.step === 4 && t4.pop && t4.card && w4 && /1~0 자리/.test(t4.text) && /끝/.test(t4.text), JSON.stringify({ t4, w4 }));
  // 카드의 다시 보지 않음을 구멍 안에서 진짜 클릭 → [닫기] → 투어 끝
  await realClick(H, '[data-emoji-help-never]');
  await realClick(H, '[data-emoji-help-close]');
  await sleep(400);
  const end = JSON.parse(await H.evaluate("JSON.stringify({ tour: document.querySelector('[data-tour]') !== null, seen: localStorage.getItem('qw.flag.tourSeen'), help: localStorage.getItem('qw.flag.emojiHelpDismissed') })"));
  await sleep(1200);
  const pf = await serverPrefs(H);
  record('★★★ R073 §C ④에서 카드 [다시 보지 않음]+[닫기] = 투어 끝 · tourSeen · emojiHelpDismissed 둘 다 계정에', !end.tour && end.seen === '1' && end.help === '1' && pf?.tourSeen === true && pf?.emojiHelpDismissed === true, JSON.stringify({ end, pf: { tourSeen: pf?.tourSeen, help: pf?.emojiHelpDismissed } }));
  await closePicker(H);
  // 새로 고침 → 다시 안 뜸 · 가입 선물은 이미 받음(창 없음)
  await H.goto(await H.evaluate('location.href'));
  await H.waitFor("document.querySelector('.stage') !== null", 10000).catch(() => false);
  await sleep(3000);
  record('★★ R073 §C 본 계정은 새로 고침해도 투어 없음', await H.evaluate("document.querySelector('[data-tour]') === null"));
  // ⓘ 놀이 탭 [처음 안내 다시 보기] → 투어 다시 · [건너뛰기]
  await openGearTab(H, 'info');
  await realClick(H, '[data-info-tab="play"]');
  await realClick(H, '[data-info-tour]');
  const rep = await H.waitFor("document.querySelector('[data-tour]')?.dataset.tourStep === '1'", 4000).catch(() => false);
  await realClick(H, '[data-tour-skip]');
  await sleep(300);
  record('★★ R073 §C ⓘ [처음 안내 다시 보기] → 투어 ① · [건너뛰기] 로 끝', rep && (await H.evaluate("document.querySelector('[data-tour]') === null")), String(rep));

  // 게임 중엔 안 띄움 · 결과 화면이면 띄움 — 새 계정 둘째(방장) + 손님
  const P = await newPage(browser, 'R073-tour-game', true);
  await P.setViewport(1280, 720);
  await signUp(P, 'xg', '투어게임', { fresh: true });
  const roomId = await createRoom(P, 'R073 투어 게임');
  const G = await newPage(browser, 'R073-tour-guest', true);
  await G.setViewport(1280, 720);
  await signUp(G, 'xq', '투어손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000).catch(() => false);
  await P.waitFor("document.querySelector('[data-tour]') !== null", 6000).catch(() => false);
  await setQuestionCount(P, 2);
  await P.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await P.waitFor("document.querySelector('[data-tour]') === null", 4000).catch(() => false);
  await P.waitFor("document.querySelector('.q-text') !== null", 15000).catch(() => false);
  await sleep(2500);
  const inGame = JSON.parse(await P.evaluate("JSON.stringify({ tour: document.querySelector('[data-tour]') !== null, seen: localStorage.getItem('qw.flag.tourSeen') })"));
  await snap(P, 'tour-ingame-none-pc');
  await openHostEnd(P);
  await P.click('끝내기');
  await P.waitFor("document.querySelector('.result-card') !== null", 10000).catch(() => false);
  const onResult = await P.waitFor("document.querySelector('[data-tour]')?.dataset.tourStep === '1'", 8000).catch(() => false);
  await sleep(400);
  await snap(P, 'tour-result-pc');
  record('★★★ R073 §C 게임이 시작되면 투어를 숨김(본 것으로 치지 않음) · 게임 중 없음 · 결과 화면에서 처음부터 다시', !inGame.tour && inGame.seen === null && onResult, JSON.stringify({ inGame, onResult }));
  await realClick(P, '[data-tour-skip]');
  P.close();
  G.close();

  // 기존 계정(계정 값에 tourSeen 없음) — 로그인하면 한 번
  const loginId = `${ACCOUNT_PREFIX}_xo`;
  const O = await newPage(browser, 'R073-old', true);
  await O.setViewport(1536, 864);
  await signUp(O, 'xo', '옛계정');
  await sleep(1500);
  O.close();
  await withPg((c) => c.query(`UPDATE accounts SET prefs = prefs - 'tourSeen' - 'emojiHelpDismissed' WHERE login_id = $1`, [loginId]));
  const O2 = await newPage(browser, 'R073-old2', true);
  await O2.setViewport(1536, 864);
  await loginAs(O2, loginId, 'uic1234', { fresh: true });
  await createRoom(O2, 'R073 옛계정');
  const oldTour = await O2.waitFor("document.querySelector('[data-tour]')?.dataset.tourStep === '1'", 6000).catch(() => false);
  await snap(O2, 'tour-1-old-account-pc');
  record('★★★ R073 §C 기존 계정(계정 값에 tourSeen 없음)도 로그인 뒤 로비에서 한 번', oldTour);
  await realClick(O2, '[data-tour-skip]');
  O2.close();

  // 모바일 m360 · m390 — ①은 ☰ 를 열어 그 안의 포인트샵 줄 · 끝까지 [다음] · ④ 카드는 체크 없이 [닫기]
  for (const [sz, suffix] of [[{ w: 360, h: 740, n: 'm360' }, 'xm'], [{ w: 390, h: 844, n: 'm390' }, 'xn']]) {
    const M = await newPage(browser, `R073-tour-${sz.n}`, true);
    await r068Touch(M, sz.w, sz.h, true);
    await signUp(M, suffix, `투어${sz.n}`, { fresh: true });
    await grant50(suffix);
    await createRoom(M, `R073 투어 ${sz.n}`);
    await M.waitFor("document.querySelector('[data-tour]') !== null", 6000).catch(() => false);
    await sleep(600);
    const m1 = await tourState(M);
    const mw1 = await ringWraps(M, '[data-menu-shop]');
    await snap(M, `tour-1-${sz.n}`);
    await tapOn(M, '[data-tour-next]');
    await M.waitFor("document.querySelector('.shop-pop .shop-draw') !== null", 5000).catch(() => false);
    await sleep(600);
    const m2 = await tourState(M);
    const mw2 = await ringWraps(M, '.shop-pop .shop-draw');
    await snap(M, `tour-2-${sz.n}`);
    await tapOn(M, '[data-tour-next]');
    await sleep(600);
    const m3 = await tourState(M);
    const mw3 = await ringWraps(M, '.emoji-btn');
    await snap(M, `tour-3-${sz.n}`);
    await tapOn(M, '[data-tour-next]');
    await M.waitFor("document.querySelector('[data-emoji-help]') !== null", 3000).catch(() => false);
    await sleep(600);
    const m4 = await tourState(M);
    const mw4 = await ringWraps(M, '[data-emoji-help]');
    await snap(M, `tour-4-${sz.n}`);
    await tapOn(M, '[data-emoji-help-close]');
    await sleep(400);
    const mend = JSON.parse(await M.evaluate("JSON.stringify({ tour: document.querySelector('[data-tour]') !== null, seen: localStorage.getItem('qw.flag.tourSeen'), help: localStorage.getItem('qw.flag.emojiHelpDismissed') })"));
    record(`★★★ R073 §C 모바일 ${sz.n} — ① ☰ 안 포인트샵 줄 · ② 뽑기 · ③ 😊 · ④ 카드 · 말풍선 화면 안 · 카드 [닫기](체크 없음) = 투어 끝 · 카드는 다음에 또`, m1?.step === 1 && m1.menu && mw1 && m2?.step === 2 && m2.shop && mw2 && m3?.step === 3 && mw3 && m4?.step === 4 && m4.card && mw4 && [m1, m2, m3, m4].every((t) => t.bubbleIn) && !mend.tour && mend.seen === '1' && mend.help === null, JSON.stringify({ m1, m2, m3, m4, w: [mw1, mw2, mw3, mw4], mend }));
    M.close();
  }
}

// ── §D ⓘ 안내 — 네 탭 · PC 5 · 모바일 3 · 줄마다 한 줄 ─────────────────────────────
async function r073InfoFlow(browser) {
  const H = await newPage(browser, 'R073-info', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'xi', '안내방장');
  await createRoom(H, 'R073 안내');
  const table = {};
  const texts = {};
  for (const s of SHOT_PC) {
    await H.setViewport(s.w, s.h);
    await sleep(300);
    await openGearTab(H, 'info');
    for (const tab of ['play', 'points', 'emoji', 'report']) {
      await H.evaluate(`document.querySelector('[data-info-tab="${tab}"]')?.click()`);
      await sleep(150);
      const rows = JSON.parse(await H.evaluate(LINE_COUNTS('[data-gear-pop] .info-list li, [data-gear-pop] .info-guide-btn')));
      table[`${s.n}:${tab}`] = rows.map((r) => r.n);
      if (s.n === 'pc') texts[`pc:${tab}`] = rows.map((r) => r.t);
      if (s.n === 'pc' || s.n === 'qhd') await snap(H, `info-${tab}-${s.n}`);
    }
    await closeTop(H);
  }
  for (const s of SHOT_MOB) {
    await r068Touch(H, s.w, s.h, true);
    await sleep(400);
    for (const tab of ['play', 'points', 'emoji', 'report']) {
      if (!(await H.evaluate("document.querySelector('.infotip-pop') !== null"))) {
        await tapOn(H, '#menu-btn');
        await sleep(250);
        await H.evaluate("[...document.querySelectorAll('.menu-item')].find((b) => b.innerText.includes('안내'))?.click()");
        await H.waitFor("document.querySelector('.infotip-pop') !== null", 3000).catch(() => false);
      }
      await H.evaluate(`document.querySelector('.infotip-pop [data-info-tab="${tab}"]')?.click()`);
      await sleep(150);
      const rows = JSON.parse(await H.evaluate(LINE_COUNTS('.infotip-pop .info-list li, .infotip-pop .info-guide-btn')));
      table[`${s.n}:${tab}`] = rows.map((r) => r.n);
      if (s.n === 'm360') texts[`m360:${tab}`] = rows.map((r) => `${r.t} (${r.len})`);
      if (s.n === 'm360') await snap(H, `info-${tab}-m360`);
    }
    await closeTop(H);
  }
  console.log(`  [r073] ⓘ 줄 수 ${JSON.stringify(table)}`);
  console.log(`  [r073] ⓘ 글 ${JSON.stringify(texts)}`);
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r073', 'info-lines.json'), JSON.stringify({ table, texts }, null, 1));
  const all = Object.values(table);
  record('★★★ R073 §D ⓘ 네 탭 — PC 5 · 모바일 3 크기 · 모든 줄(+다시 보기 버튼) 한 줄 · 탭마다 3줄 이상', all.length === 32 && all.every((r) => r.length >= 3 && r.every((n) => n === 1)), JSON.stringify(table));
  const joined = JSON.stringify(texts);
  record('★★ R073 §D 뺀 것 — "답은 채팅창에" · "먼저 맞힌" · "끊겨도" · "✎" 없음 · 넣은 것 — 난이도 · 업적 한 줄 · 뽑기 · 횟수 제한 없음 · ★ R099 평가 줄(정답 공개 평가 · 👍 😐 👎) 없음', !/답은 채팅창에|먼저 맞힌|끊겨도|✎/.test(joined) && /난이도/.test(joined) && /업적 \d+종/.test(joined) && !/정답 공개 평가/.test(joined) && /뽑기/.test(joined) && /횟수 제한이 없어요/.test(joined) && !/😐/.test(joined), joined.slice(0, 400));
  await r068Touch(H, 1280, 720, false);
  H.close();
}

// =============================================================================
// ★★★ R071 — 정답 공개 평가 손질 · 다른 하나 찾기 8×8 (D-313 · D-315) · ★ R099 — reveal 은 "평가 줄 없음" 확인으로 바뀜
//   R071_ONLY = reveal | oddone (없으면 둘 다) · 묶음 env: RESOLVED_WAIT_MS 12000

// =============================================================================
const R071_FB = `JSON.stringify((() => {
  const fb = document.querySelector('.reveal-fb'); const chips = document.querySelector('.reveal-fb-chips');
  const ask = document.querySelector('[data-rate-ask]'); const card = document.querySelector('.reveal');
  const inp = document.querySelector('.chat-card input, .chat-form input')?.getBoundingClientRect();
  const c = chips?.getBoundingClientRect(); const chip = document.querySelector('.reveal-fb-chips .fb-chip')?.getBoundingClientRect();
  const st = document.querySelector('.stage, .question-card')?.getBoundingClientRect();
  return {
    fb: !!fb, ask: ask?.innerText ?? null, chips: !!chips, chipN: document.querySelectorAll('.reveal-fb-chips .fb-chip').length,
    chipH: chip ? Math.round(chip.height) : null,
    chipsBelow: !!c && !!fb && c.top >= fb.getBoundingClientRect().bottom - 1,
    chipsInView: !!c && c.bottom <= innerHeight + 1 && c.top >= 0,
    cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
    cardOver: card ? card.scrollHeight > card.clientHeight + 1 : null,
    input: !!inp && inp.bottom <= innerHeight + 1,
    overlap: !!c && !!inp && c.bottom > inp.top + 1 && c.top < inp.bottom,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    chipsScroll: chips ? chips.querySelector('.fb-chips').scrollWidth > chips.querySelector('.fb-chips').clientWidth : null,
    nextSameLine: (() => { const n = document.querySelector('.reveal-next')?.getBoundingClientRect(); const f = fb?.getBoundingClientRect(); return !!n && !!f && Math.abs((n.top + n.bottom) / 2 - (f.top + f.bottom) / 2) < 8; })(),
    docH: document.scrollingElement.scrollHeight - innerHeight,
  };
})())`;
async function r071Flow(browser) {
  const only = process.env.R071_ONLY ?? '';
  if (!only || only === 'reveal') await r071RevealFlow(browser);
  if (!only || only === 'oddone') await r071OddoneFlow(browser);
}
async function r071RevealFlow(browser) {
  // ★★★ R099 — 평가 없앰(찬종 "평가 버튼 그냥 빼자 · 평가는 나만 · 제보로"): 옛 R071 👎 사유 칩 · 요청 1/3 검사 → 세 문항 모두 평가 줄 없음 · 카드 안 넘침 · 1P 0
  const H = await newPage(browser, 'R071-host', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'th', '평가없음방장');
  const roomId = await createRoom(H, 'R099 평가 없음');
  const G = await newPage(browser, 'R071-guest', true);
  await touchDevice(G, 390, 844);
  await signUp(G, 'tg', '평가없음손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  await sleep(500);
  await setQuestionCount(H, 3);
  await sleep(300);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const out = { sizes: {} };
  for (let i = 1; i <= 3; i += 1) {
    await H.waitFor("document.querySelector('.question-card .q-text') !== null && document.querySelector('.reveal') === null", 30000);
    await sleep(300);
    if (i === 3) {
      await setTheme(G, 'night');
      await touchDevice(G, 360, 740);
    }
    await answerCurrent(H);
    await H.waitFor("document.querySelector('.reveal') !== null", 8000);
    await G.waitFor("document.querySelector('.reveal') !== null", 4000).catch(() => false);
    await sleep(600);
    out[`h${i}`] = JSON.parse(await H.evaluate(R071_FB));
    out[`g${i}`] = JSON.parse(await G.evaluate(R071_FB));
    await snap(H, `400-reveal-nofb-${i}-1536`);
    await snap(G, `400-reveal-nofb-${i}-${i === 3 ? 'm360-night' : 'm390'}`);
    if (i === 1) {
      for (const [w, h] of [[1280, 720], [1536, 730], [1920, 1080], [2560, 1440]]) {
        await H.setViewport(w, h);
        await sleep(350);
        out.sizes[`${w}x${h}`] = JSON.parse(await H.evaluate(R071_FB));
        await snap(H, `400-reveal-nofb-${w}x${h}`);
      }
      await H.setViewport(1536, 864);
    }
  }
  await setTheme(G, 'pastel');
  await H.waitFor("document.querySelector('.result-card') !== null", 60000).catch(() => false);
  await sleep(600);
  const pts = await withPg(async (c) =>
    (await c.query(`SELECT coalesce(sum(g.amount), 0)::int n FROM accounts a JOIN point_grants g ON g.account_id = a.id AND g.reason = 'rate' WHERE a.login_id = ANY($1)`, [[`${ACCOUNT_PREFIX}_th`, `${ACCOUNT_PREFIX}_tg`]])).rows[0].n,
  );
  const all = [out.h1, out.g1, out.h2, out.g2, out.h3, out.g3, ...Object.values(out.sizes)];
  console.log(`  [r071] ${JSON.stringify({ pts, h1: out.h1, g1: out.g1 })}`);
  record('★★★ R099 공개 화면 — 세 문항 모두 평가 줄(👍 😐 👎 · 사유 칩 · "+1P") 없음 · 방장 PC 1536 · 손님 m390 · 밤 m360', all.every((m) => m && !m.fb && !m.ask && !m.chips), JSON.stringify(all.map((m) => m && [m.fb, m.ask, m.chips])));
  // ★ 카드 안쪽 넘침(cardOver)은 적기만 — 1280×720 · 1536×730 에서 등장 연출 중 1~2px 이 잡히나 그림상 잘림 없음(R099 4절) · 옛 R071 도 이 값은 판정에 안 썼다
  record('★★★ R099 공개 카드 — PC 1280 · 1536×730 · 1920 · 2560 · m390 · m360 입력칸 화면 안 · 가로 넘침 없음', all.every((m) => m && m.input && !m.overflowX), JSON.stringify(all.map((m) => m && [m.cardH, m.cardOver, m.input, m.overflowX])));
  record('★★ R099 평가 1P 0(검사 DB)', pts === 0, String(pts));
  H.close();
  G.close();
}
async function r071OddoneFlow(browser) {
  const L = await newPage(browser, 'R071-odd');
  await L.setViewport(1280, 720);
  await signUp(L, 'to', '다른하나점검');
  const cw = {};
  for (const size of [4, 5, 6, 7, 8]) {
    for (const [dev, w, h, touch] of [['pc', 1280, 720, false], ['m360', 360, 740, true], ['fold', 344, 882, true]]) {
      if (dev !== 'm360' && size !== 8 && dev !== 'pc') continue;
      if (touch) await touchDevice(L, w, h);
      else {
        await touchDevice(L, w, h, false);
        await L.setViewport(w, h);
      }
      await L.goto(`${BASE}/lab/minigame?scene=1&key=oddone&phase=play&seed=2024&size=${size}`);
      await L.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'play'", 6000);
      await sleep(450);
      const m = JSON.parse(await L.evaluate("JSON.stringify({ cw: Math.round(document.querySelector('.oddone-cell')?.getBoundingClientRect().width ?? 0), n: document.querySelectorAll('.oddone-cell').length, over: document.documentElement.scrollWidth - innerWidth, inView: (() => { const g = document.querySelector('.oddone-grid')?.getBoundingClientRect(); return !!g && g.bottom <= innerHeight + 1; })() })"));
      cw[`${size}-${dev}`] = m;
      await snap(L, `410-oddone-${size}x${size}-${dev}`);
    }
  }
  console.log(`  [r071] oddone 실험실 ${JSON.stringify(cw)}`);
  record('★★ R071 C 격자 4~8 — 실험실 360 에서 모두 격자가 화면 안(세로) · 가로 넘침 없음(실험실 카드는 실제 판보다 좁다 — 칸 폭 판정은 아래 실제 판)', [4, 5, 6, 7, 8].every((n) => cw[`${n}-m360`]?.inView && cw[`${n}-m360`]?.over <= 1), JSON.stringify(Object.fromEntries([4, 5, 6, 7, 8].map((n) => [n, cw[`${n}-m360`]]))));
  await touchDevice(L, 1280, 720, false);
  L.close();
  // ── 실제 연습 판 — H(PC 1280 · 마우스) · G(360 터치) · 판마다 그림 한 장 · 5판(8×8)에서 360 · 폴드 344 칸 폭
  const { H, G } = await r051Room(browser, 'r71o');
  await touchDevice(G, 360, 740);
  await r051Start(H, 'oddone');
  await waitPhase(H, 'rules', 15000);
  const live = [];
  for (let i = 0; i < 5; i += 1) {
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'play' && document.querySelector('.oddone-grid')?.dataset.ready === '1'", 30000);
    await G.waitFor("document.querySelector('.oddone-grid')?.dataset.ready === '1'", 8000).catch(() => false);
    await sleep(300);
    const info = JSON.parse(await H.evaluate(`JSON.stringify((() => { const cs = [...document.querySelectorAll('.oddone-cell')]; const srcs = cs.map((c) => c.querySelector('img')?.getAttribute('src')); const cnt = {}; for (const s of srcs) cnt[s] = (cnt[s] ?? 0) + 1; const odd = srcs.findIndex((s) => cnt[s] === 1); return { odd, n: cs.length, size: Number(document.querySelector('.oddone-grid')?.dataset.size), pair: [...new Set(srcs)].map((s) => s?.split('/').pop()) }; })())`));
    const g = JSON.parse(await G.evaluate("JSON.stringify({ cw: Math.round(document.querySelector('.oddone-cell')?.getBoundingClientRect().width ?? 0), over: document.documentElement.scrollWidth - innerWidth })"));
    await snap(H, `411-oddone-live-r${i + 1}-${info.size}x${info.size}-pc`);
    await snap(G, `411-oddone-live-r${i + 1}-${info.size}x${info.size}-m360`);
    let fold = null;
    if (i === 4) {
      await touchDevice(G, 344, 882);
      await sleep(400);
      fold = JSON.parse(await G.evaluate("JSON.stringify({ cw: Math.round(document.querySelector('.oddone-cell')?.getBoundingClientRect().width ?? 0), over: document.documentElement.scrollWidth - innerWidth })"));
      await snap(G, `411-oddone-live-r5-8x8-fold344`);
    }
    live.push({ ...info, g, fold });
    const r = await rectOf(H, `.oddone-cell[data-i="${info.odd}"]`);
    await trustedClick(H, r.x + r.w / 2, r.y + r.h / 2);
    const gr = await rectOf(G, `.oddone-cell[data-i="${info.odd}"]`);
    if (gr) await trustedTap(G, gr.x + gr.w / 2, gr.y + gr.h / 2);
    await H.waitFor("document.querySelector('.mg-card')?.dataset.phase === 'roundResult'", 20000);
  }
  console.log(`  [r071] oddone 실제 판 ${JSON.stringify(live)}`);
  const pairs = (await sharedDist()).ODD_PAIRS;
  const lv = (x) => pairs.find((p) => x.pair.includes(`${p.base}.svg`) && x.pair.includes(`${p.odd}.svg`))?.level ?? '?';
  record('★★★ R071 C 실제 판 — 격자 4·5·6·7·8 · 1판 쉬운 쌍 · 2~5판 어려운 쌍', JSON.stringify(live.map((x) => x.size)) === '[4,5,6,7,8]' && JSON.stringify(live.map(lv)) === '["easy","hard","hard","hard","hard"]', JSON.stringify(live.map((x) => [x.size, lv(x), x.pair])));
  record('★★★ R071 C 실제 판 8×8 — 360 · 폴드 344 칸 ≥ 36px · 가로 넘침 없음', live[4]?.g.cw >= 36 && live[4]?.fold?.cw >= 36 && live[4].g.over <= 1 && live[4].fold.over <= 1, JSON.stringify({ m360: live[4]?.g, fold: live[4]?.fold }));
  await waitPhase(H, 'final', 30000).catch(() => false);
  H.close();
  G.close();
}

// =============================================================================
// ★★★ R069 — 난이도 초급 · 중급 · 고급(설정 · 뱃지 · 전적) · 좁은 칸 지문 글자 규칙(240자) · 이모티콘 "자주" 탭
//   R069_ONLY = settings | game | emoji (없으면 전부)
// =============================================================================
const R069_PC = [[1280, 720], [1536, 864], [1536, 730], [1920, 1080], [2560, 1440]];
async function r069Flow(browser) {
  const only = process.env.R069_ONLY ?? '';
  if (!only || only === 'settings') await r069SettingsFlow(browser);
  if (!only || only === 'emoji') await r069EmojiFlow(browser);
  if (!only || only === 'game') await r069GameFlow(browser);
}

const R069_LEVEL = "JSON.stringify((() => { const btns = [...document.querySelectorAll('.settings button[data-level]')]; const d = document.querySelector('[data-level-desc]'); const lh = d ? parseFloat(getComputedStyle(d).lineHeight) || 16 : 16; const row = document.querySelector('.level-row')?.getBoundingClientRect(); return { labels: btns.map((b) => b.innerText.trim()), on: btns.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.level), desc: d?.innerText ?? '', descLines: d ? Math.round(d.getBoundingClientRect().height / lh) : null, tierBtns: document.querySelectorAll('button[data-tier]').length, overflowX: document.documentElement.scrollWidth > innerWidth + 1, rowRight: row ? Math.round(innerWidth - row.right) : null }; })())";

async function r069SettingsFlow(browser) {
  const H = await newPage(browser, 'R069-set', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'vs', '난이도방장');
  const roomId = await createRoom(H, 'R069 난이도');
  const out = {};
  for (const [w, h] of R069_PC) {
    await H.setViewport(w, h);
    await sleep(400);
    out[`${w}x${h}`] = JSON.parse(await H.evaluate(R069_LEVEL));
    await snap(H, `400-level-${w}x${h}`);
  }
  const d0 = out['1536x864'];
  record('★★★ R069 설정 — 버튼 셋 초급 · 중급 · 고급 · 기본 중급 · 한 줄 설명 · 옛 하·중·상 버튼 없음(PC 5크기)', Object.values(out).every((o) => o.labels.join(',') === '초급,중급,고급' && o.on.join(',') === 'intermediate' && /학교/.test(o.desc) && o.tierBtns === 0 && !o.overflowX && o.descLines <= 1), JSON.stringify(out));
  await H.setViewport(1536, 864);
  await realClick(H, 'button[data-level="advanced"]');
  await H.waitFor("document.querySelector('button[data-level=\"advanced\"]')?.getAttribute('aria-checked') === 'true'", 4000).catch(() => false);
  await sleep(300);
  const adv = JSON.parse(await H.evaluate(R069_LEVEL));
  const avail = await H.evaluate("document.querySelector('.avail-line')?.innerText ?? ''");
  await snap(H, '401-level-advanced-1536');
  await realClick(H, 'button[data-level="advanced"]');
  await sleep(300);
  const again = JSON.parse(await H.evaluate(R069_LEVEL));
  record('★★★ R069 고급 진짜 클릭 → 하나만 켜짐 · 설명 "알아 둘 만한" · 다시 눌러도 그대로(끄기 없음) · 출제 가능 수 줄', adv.on.join(',') === 'advanced' && /알아 둘/.test(adv.desc) && again.on.join(',') === 'advanced' && /문제/.test(avail), JSON.stringify({ adv, again, avail }));
  // 모바일 360 · 390 — 설명 두 줄 안
  const m = {};
  for (const w of [360, 390]) {
    await r068Touch(H, w, 800, true);
    await H.evaluate("window.dispatchEvent(new Event('resize'))");
    await sleep(400);
    for (const lv of ['beginner', 'intermediate', 'advanced']) {
      await tapOn(H, `button[data-level="${lv}"]`);
      await sleep(250);
      m[`${w}-${lv}`] = JSON.parse(await H.evaluate(R069_LEVEL));
      if (lv === 'advanced') await snap(H, `402-level-m${w}`);
    }
  }
  await r068Touch(H, 1536, 864, false);
  await H.setViewport(1536, 864);
  record('★★ R069 모바일 360 · 390 — 셋 다 탭으로 바뀜 · 설명 두 줄 안 · 가로 넘침 없음', Object.entries(m).every(([k, o]) => o.on.join(',') === k.split('-')[1] && o.descLines <= 2 && !o.overflowX), JSON.stringify(m));
  // 손님 화면 — 고른 것만 진하게(칩)
  const G = await newPage(browser, 'R069-guest', true);
  await G.setViewport(1536, 864);
  await signUp(G, 'vg', '난이도손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.settings') !== null", 10000).catch(() => false);
  await sleep(600);
  const gv = JSON.parse(await G.evaluate("JSON.stringify({ chips: [...document.querySelectorAll('.settings .chip[data-level]')].map((c) => c.innerText.trim() + ':' + c.classList.contains('on')), btns: document.querySelectorAll('.settings button[data-level]').length, desc: document.querySelector('[data-level-desc]')?.innerText ?? '' })"));
  await snap(G, '403-level-guest-1536');
  record('★★ R069 손님 — 단계 셋이 칩(누를 수 없음) · 고른 것만 진하게 · 설명', gv.btns === 0 && gv.chips.join(',') === '초급:false,중급:false,고급:true' && /알아 둘/.test(gv.desc), JSON.stringify(gv));
  // 전적 — 등급별
  await H.evaluate("document.querySelector('#rename-btn')?.click()");
  await H.waitFor("document.querySelector('.stats-open') !== null", 3000).catch(() => false);
  await H.evaluate("document.querySelector('.stats-open')?.click()");
  await H.waitFor("document.body.innerText.includes('등급별')", 6000).catch(() => false);
  await sleep(300);
  const st = await H.evaluate("[...document.querySelectorAll('.modal *')].map((e) => e.childElementCount === 0 ? e.innerText : '').join(' ')");
  await snap(H, '404-stats-grades-1536');
  record('★★ R069 전적 — "등급별 1등급 … 5등급"(옛 하·중·상 없음)', /등급별 1등급 \d+ · 2등급 \d+ · 3등급 \d+ · 4등급 \d+ · 5등급 \d+/.test(st), (st.match(/등급별[^\n]{0,60}/) ?? [''])[0]);
  G.close();
  H.close();
}

async function r069EmojiFlow(browser) {
  const H = await newPage(browser, 'R069-emoji', true);
  await H.setViewport(1536, 864);
  await signUp(H, 've', '자주손님');
  await createRoom(H, 'R069 자주');
  await H.evaluate("localStorage.removeItem('qw.emoji.recent')");
  await realClick(H, '.emoji-btn');
  await H.waitFor("document.querySelector('.emoji-pop') !== null", 3000).catch(() => false);
  const before = JSON.parse(await H.evaluate("JSON.stringify({ tab: document.querySelector('.emoji-tab.on')?.title ?? '', recent: !!document.querySelector('.emoji-tab[title=\"자주\"]') })"));
  // 세 개 보내기(진짜 클릭) — 표정 탭 3번째 · 5번째 · 3번째(같은 것 다시 = 맨 앞)
  const sent = [];
  for (const nth of [3, 5, 3]) {
    if (!(await H.evaluate("document.querySelector('.emoji-pop') !== null"))) {
      await realClick(H, '.emoji-btn');
      await H.waitFor("document.querySelector('.emoji-pop') !== null", 3000).catch(() => false);
      await realClick(H, '.emoji-tab[title="표정"]');
      await sleep(200);
    }
    sent.push(await H.evaluate(`document.querySelector('.emoji-grid .emoji-cell:nth-child(${nth}) img')?.getAttribute('src') ?? ''`));
    await realClick(H, `.emoji-grid .emoji-cell:nth-child(${nth})`);
    await sleep(5200 / 4);
  }
  await sleep(600);
  if (!(await H.evaluate("document.querySelector('.emoji-pop') !== null"))) await realClick(H, '.emoji-btn');
  await H.waitFor("document.querySelector('.emoji-pop') !== null", 3000).catch(() => false);
  await sleep(300);
  const after = JSON.parse(await H.evaluate("JSON.stringify({ first: document.querySelector('.emoji-tabs .emoji-tab')?.title ?? '', on: document.querySelector('.emoji-tab.on')?.title ?? '', cells: [...document.querySelectorAll('.emoji-grid .emoji-cell img')].map((i) => i.getAttribute('src')) })"));
  await snap(H, '410-emoji-recent-1536');
  await r068Touch(H, 390, 844, true);
  await sleep(400);
  await snap(H, '410-emoji-recent-m390');
  await r068Touch(H, 1536, 864, false);
  record('★★★ R069 #70 "자주" 탭 — 처음엔 없음 · 보낸 뒤 첫 탭 · 창을 열면 그 탭 · 최근 순(같은 것은 맨 앞 한 번) · 2개', !before.recent && after.first === '자주' && after.on === '자주' && after.cells.length === 2 && after.cells[0] === sent[2] && after.cells[1] === sent[1], JSON.stringify({ before, sent, after }));
  H.close();
}

async function r069GameFlow(browser) {
  // 검사 DB: 240자 질문(5760 본뜸 · 문장 넷) + 5760(140) + 가장 긴 활성만 쉬지 않게(끝나면 되돌림) — r068 과 같은 준비
  const prep = await withPg(async (c) => {
    const longest = (await c.query(`SELECT id::text FROM questions WHERE is_active AND id <> 5760 ORDER BY char_length(question_text) DESC, id LIMIT 1`)).rows[0].id;
    const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'questions' AND column_name NOT IN ('id', 'question_text', 'source_ref') AND is_generated = 'NEVER' AND column_default IS DISTINCT FROM 'nextval(''questions_id_seq''::regclass)'`)).rows.map((r) => r.column_name);
    let text = '[QLEN 240] ';
    while ([...text].length < 240) text += QLEN_FILL;
    text = [...text].slice(0, 239).join('') + '?';
    const nid = (await c.query(`INSERT INTO questions (question_text, ${cols.join(', ')}) SELECT $1, ${cols.join(', ')} FROM questions WHERE id = 5760 RETURNING id::text`, [text])).rows[0].id;
    const acols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'question_answers' AND column_name NOT IN ('id', 'question_id')`)).rows.map((r) => r.column_name);
    await c.query(`INSERT INTO question_answers (question_id, ${acols.join(', ')}) SELECT $1, ${acols.join(', ')} FROM question_answers WHERE question_id = 5760`, [nid]);
    await c.query(`DROP TABLE IF EXISTS _r068_active`);
    await c.query(`CREATE TABLE _r068_active AS SELECT id FROM questions WHERE is_active`);
    await c.query(`UPDATE questions SET is_active = (id = ANY($1::bigint[])) WHERE is_active OR id = ANY($1::bigint[])`, [[5760, longest, nid]]);
    return { longest, nid };
  });
  console.log(`  [r069] 준비 ${JSON.stringify(prep)}`);
  try {
    const H = await newPage(browser, 'R069-game', true);
    await H.setViewport(1536, 864);
    await signUp(H, 'vq', '지문방장');
    const roomId = await createRoom(H, 'R069 지문');
    const socks = await socketGuests(roomId, 1, 'vq');
    await sleep(500);
    await realClick(H, 'button[data-level="advanced"]');
    await sleep(300);
    await setQuestionCount(H, 3);
    await sleep(300);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
    const rows = [];
    let badge = '';
    for (let i = 0; i < 3; i += 1) {
      await H.waitFor(`document.querySelector('.question-card .q-progress')?.innerText.trim().startsWith('${i + 1} ')`, 60000).catch(() => false);
      await sleep(400);
      if (i === 0) {
        badge = await H.evaluate("document.querySelector('.q-head .badge.diff')?.innerText ?? ''");
        await snap(H, '405-badge-1536');
      }
      const len = await H.evaluate("[...(document.querySelector('.q-text')?.dataset.text ?? '')].length");
      const tag = len >= 230 ? '240' : len >= 180 ? '197' : '140';
      // 같은 문제를 PC → 360 → 390 → PC 순으로 두 번씩 재서 값이 같은지(재는 때에 안 흔들림)
      const m = {};
      for (const [dev, w, h, touch] of [['m360', 360, 740, true], ['m390', 390, 844, true], ['m360b', 360, 740, true]]) {
        await r068Touch(H, w, h, touch);
        await H.evaluate("window.dispatchEvent(new Event('resize'))");
        await sleep(500);
        m[dev] = JSON.parse(await H.evaluate(QLEN_PROBE));
        if (dev === 'm360') await snap(H, `420-qlen-${tag}-m360`);
      }
      await r068Touch(H, 1536, 864, false);
      await H.setViewport(1536, 864);
      await sleep(300);
      const pc = JSON.parse(await H.evaluate(QLEN_PROBE));
      rows.push({ tag, chars: len, m360: m.m360, m360b: m.m360b, m390: m.m390, pc });
      await openHostSkip(H);
      await H.evaluate("document.querySelector('.confirm-modal[data-kind=\"host-skip\"] .confirm-actions button')?.click()");
      await sleep(1500);
    }
    console.log('  [r069] 지문 표');
    for (const r of rows) console.log(`    ${r.tag}(${r.chars})자 — 360: ${r.m360?.fs} ${r.m360?.lines}줄 입력칸 ${r.m360?.input}(${r.m360?.inputOver}px) · 다시 360: ${r.m360b?.fs} ${r.m360b?.lines}줄 · 390: ${r.m390?.fs} ${r.m390?.lines}줄 입력칸 ${r.m390?.input} · PC 1536: ${r.pc?.fs} ${r.pc?.lines}줄`);
    writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r069', 'qlen-r069.json'), JSON.stringify(rows, null, 1));
    const r240 = rows.find((r) => r.tag === '240');
    const r197 = rows.find((r) => r.tag === '197');
    const r140 = rows.find((r) => r.tag === '140');
    record('★★★ R069 뱃지 — "난이도 고급"', /난이도 고급/.test(badge), badge);
    record('★★★ R069 좁은 칸 글자 규칙 — 360: 240 · 197 = 15px · 140 = 17px · 두 번 재도 같음 · 240 은 입력칸 보임', r240?.m360?.fs === '15px' && r197?.m360?.fs === '15px' && r140?.m360?.fs === '17px' && rows.every((r) => r.m360?.fs === r.m360b?.fs && r.m360?.lines === r.m360b?.lines) && r240?.m360?.input === true && r197?.m360?.input === true, JSON.stringify(rows.map((r) => [r.tag, r.m360?.fs, r.m360?.lines, r.m360?.input, r.m360b?.fs])));
    record('★★ R069 PC 는 옛 자동 맞춤 그대로(240 1536 = 4줄 · 입력칸 보임)', r240?.pc?.input === true && r240?.pc?.lines <= 5, JSON.stringify(rows.map((r) => [r.tag, r.pc?.fs, r.pc?.lines])));
    for (const s of socks) s.close();
    H.close();
  } finally {
    await withPg(async (c) => {
      await c.query(`UPDATE questions SET is_active = true WHERE id IN (SELECT id FROM _r068_active)`);
      await c.query(`DROP TABLE IF EXISTS _r068_active`);
      if (prep?.nid) {
        await c.query(`DELETE FROM question_feedback WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM question_experiences WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM answer_events WHERE question_id = $1`, [prep.nid]).catch(() => undefined);
        await c.query(`DELETE FROM game_questions WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM question_answers WHERE question_id = $1`, [prep.nid]);
        await c.query(`DELETE FROM questions WHERE id = $1`, [prep.nid]).catch((e) => console.log(`  [r069] 240자 질문 지우기 실패(남겨 둠): ${e.message}`));
      }
    });
  }
}

async function r066ResultAt(H, label, shot) {
  const out = {};
  for (const z of R066_PC) {
    await H.setViewport(z.w, z.h);
    await sleep(400);
    out[`${z.w}x${z.h}`] = JSON.parse(await H.evaluate(RESULT_FULL));
    if (shot && z.w === 2560) await snap(H, shot);
  }
  const ok = Object.values(out).every((o) => o.card && o.third && o.again && o.lobby && (o.allRanks || o.listScroll));
  record(`★★★ R066 §A ${label} — 3위 줄 · 다시 하기 · 로비로가 보이고 눌린다(덮임 없음) · 순위는 다 보이거나 목록 안 스크롤 — 2560 · 1536 · 1280`, ok, JSON.stringify(out));
  return ok;
}
async function r066ResultFlow(browser) {
  const tagShot = process.env.R066_BEFORE ? 'before' : 'after';
  // ⓐ 미니게임만 2판 · 3명 · 채팅 25줄 / ⓑ 10명(두 열)
  for (const [label, guests, tag] of [['ⓐ 미니게임만 3명 · 채팅 25줄', 2, 'ra'], ['ⓑ 미니게임만 10명(두 열) · 채팅 25줄', 9, 'rb']]) {
    const H = await newPage(browser, `R066-${tag}`, true);
    await H.setViewport(2560, 1313);
    await signUp(H, `${tag}h`, `${tag}방장`);
    const roomId = await createRoom(H, `R066 ${tag}`);
    const socks = await socketGuests(roomId, guests, tag);
    await sleep(800);
    await realClick(H, 'button[data-mode="minigame"]');
    await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
    await H.setInput('.mg-rounds-input', '2');
    await sleep(300);
    await selectMinigames(H, ['tap', 'reaction']);
    await sleep(300);
    await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
    if (label.startsWith('ⓐ') && !process.env.R066_BEFORE) {
      // ★ R066 B7 (찬종 #42) — 2번째 게임은 intro 없이 rules 부터 · 그 순간 배경음악이 미니게임으로(옛: 첫 판 결과 뒤에야)
      await H.waitFor("document.querySelector('.mg-series[data-series=\"2/2\"]') !== null && document.querySelector('.mg-card[data-phase=\"rules\"]') !== null", 240000).catch(() => false);
      await sleep(300);
      const music = JSON.parse(await H.evaluate("JSON.stringify((window.__qwSoundLog ?? []).filter((e) => e.id.startsWith('music:')).map((e) => e.id).slice(-3))"));
      record('★★ R066 B7 미니게임만 2번째 게임 rules — 마지막 음악 = music:minigame(바로 바뀜)', music[music.length - 1] === 'music:minigame', JSON.stringify(music));
    }
    await H.waitFor("document.querySelector('.result-card') !== null", 420000).catch(() => false);
    await chatLines(socks, 25);
    await r066ResultAt(H, label, label.startsWith('ⓐ') ? `170-result-mgonly-2560-${tagShot}` : `171-result-mgonly10-2560-${tagShot}`);
    for (const s of socks) s.close();
    await H.close?.();
  }
  if (process.env.R066_BEFORE) return;
  // ⓒ 퀴즈 3문제 · 평가 목록 접힘 + 채팅 25줄 / ⓓ 목록 펼침
  const H = await newPage(browser, 'R066-rc', true);
  await H.setViewport(2560, 1313);
  await signUp(H, 'rch', 'rc방장');
  const roomId = await createRoom(H, 'R066 rc');
  const socks = await socketGuests(roomId, 2, 'rc');
  await sleep(800);
  await setQuestionCount(H, 3);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  for (let i = 0; i < 3; i += 1) {
    await H.waitFor("document.querySelector('.question-card .host-tools button') !== null || document.querySelector('.result-card') !== null", 60000).catch(() => false);
    if (await H.evaluate("document.querySelector('.result-card') !== null")) break;
    await openHostSkip(H);
    await H.evaluate("document.querySelector('.confirm-modal[data-kind=\"host-skip\"] .confirm-actions button')?.click()");
    await sleep(1500);
  }
  await H.waitFor("document.querySelector('.result-card') !== null", 90000).catch(() => false);
  await chatLines(socks, 25);
  await H.evaluate("(() => { const h = document.querySelector('.fb-result-head'); if (h?.getAttribute('aria-expanded') === 'true') h.click(); })()");
  await sleep(300);
  await r066ResultAt(H, 'ⓒ 퀴즈 3문제 · 평가 목록 접힘 · 채팅 25줄', '172-result-quiz-folded-2560');
  await H.setViewport(2560, 1313);
  await H.evaluate("(() => { const h = document.querySelector('.fb-result-head'); if (h?.getAttribute('aria-expanded') !== 'true') h?.click(); })()");
  await sleep(300);
  await r066ResultAt(H, 'ⓓ 퀴즈 · 평가 목록 펼침 · 채팅 25줄', '173-result-quiz-open-2560');
  for (const s of socks) s.close();
  await H.close?.();
}

// ★★ R066 — 제보 #32~#51 화면(고르기 창 · 손님 목록 · 대기 안내 · ⓘ 탭 · 가입 선물 · 첫 구매 가이드 · 사람 카드 · 사진 칸 · 고기 문구 · 소수파 색 · 타자 언어 · 균형 12종 · BGM)
const NO_ELLIPSIS = (root) => `(() => { const bad = []; for (const el of document.querySelectorAll('${root} *')) { const cs = getComputedStyle(el); if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) bad.push(el.className + ':' + el.innerText.slice(0, 20)); if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) bad.push('clamp:' + el.className); } return JSON.stringify(bad); })()`;
async function r066Flow(browser) {
  const wrapRows = [];
  const auditAt = async (page, label) => wrapRows.push(...(await wrapAudit(page, label, true)));
  const labOnly = process.env.R066_ONLY === 'lab';
  let H = null;
  let G = null;
  let hId = null;
  if (!labOnly) {
  H = await newPage(browser, 'U-host', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'uh', '설명방장');
  const roomId = await createRoom(H, 'R066 화면');
  G = await newPage(browser, 'U-guest', true);
  await G.setViewport(1536, 864);
  await signUp(G, 'ug', '설명손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  await sleep(500);

  // ── B3 손님 대기 안내 — 카드 오른쪽 아래
  const wait = JSON.parse(await G.evaluate("JSON.stringify((() => { const n = document.querySelector('.start-wait')?.getBoundingClientRect(); const c = document.querySelector('.lobby-card')?.getBoundingClientRect(); return n && c ? { right: Math.round(c.right - n.right), bottom: Math.round(c.bottom - n.bottom), mid: Math.round((n.top + n.bottom) / 2 - (c.top + c.bottom) / 2) } : null; })())"));
  await snap(G, '180-guest-wait-1536');
  record('★★ R066 B3 손님 "기다려 주세요" — 로비 카드 오른쪽 아래(가운데 아님)', !!wait && wait.right < 40 && wait.bottom < 30 && wait.mid > 10, JSON.stringify(wait));

  // ── C1 · C2 방장이 미니게임을 고르는 동안 손님 화면 — 이름 줄 · 열린 창이 바로 따라감 · 생략 없음
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await realClick(G, '[data-mg-catalog-open]');
  await G.waitFor("document.querySelector('.mg-cat') !== null", 4000);
  const before = await G.evaluate("document.querySelector('.mg-cat-count')?.innerText ?? ''");
  await selectMinigames(H, ['angle', 'photo', 'balance']);
  await sleep(600);
  const after = JSON.parse(await G.evaluate("JSON.stringify({ count: document.querySelector('.mg-cat-count')?.innerText ?? '', on: [...document.querySelectorAll('.mg-cat-card.on')].map((c) => c.dataset.key) })"));
  // ★ R077 (D-327) — 이름 한 줄(D-281)은 없앴다 → 손님 "미니게임 보기" 버튼 title 에 이름 전체 · 줄 요소는 없어야
  const names = await G.evaluate("(document.querySelector('[data-mg-names]') ? 'LINE ' : '') + (document.querySelector('[data-mg-catalog-open]')?.title ?? '')");
  const ell = { pc: JSON.parse(await G.evaluate(NO_ELLIPSIS('.mg-cat'))) };
  await snap(G, '181-catalog-guest-1536');
  await auditAt(G, 'catalog-guest@1536');
  await G.key('Escape');
  await touchDevice(G, 390, 844);
  await sleep(400);
  await tapOn(G, '[data-mg-catalog-open]');
  await G.waitFor("document.querySelector('.mg-cat') !== null", 4000);
  ell.m = JSON.parse(await G.evaluate(NO_ELLIPSIS('.mg-cat')));
  await snap(G, '181-catalog-guest-m390');
  await auditAt(G, 'catalog-guest@m390');
  await G.evaluate("document.querySelector('.mg-cat .popup-close')?.click()");
  await touchDevice(G, 390, 844, false);
  await G.setViewport(1536, 864);
  record('★★★ R066 C1 · C2 손님 — 방장이 고르는 대로 열린 창(3/17 · 켜진 셋)이 바로 · 버튼 title 에 이름(R077 — 이름 줄 없음) · 고르기 창은 생략(…) 없음(PC · m390)', /3\/17/.test(after.count) && after.on.length === 3 && !names.startsWith('LINE') && /각도|사진|균형/.test(names) && ell.pc.length === 0 && ell.m.length === 0, JSON.stringify({ before, after, names, ell }));

  // ── D1 ⓘ 안내 탭 넷
  await openGearTab(H, 'info'); // ★ R067 — ⓘ 는 ⚙ 의 안내 탭
  await H.waitFor("document.querySelector('.info-tabs') !== null", 3000);
  const tabs = [];
  let pts = '';
  for (const t of ['play', 'points', 'emoji', 'report']) {
    await realClick(H, `[data-info-tab="${t}"]`);
    await sleep(150);
    if (t === 'points') pts = await H.evaluate("document.querySelector('[data-info-points]')?.innerText ?? ''");
    tabs.push({ t, n: await H.evaluate("[...document.querySelectorAll('.infotip-pop .info-list li, [data-gear-pop] .info-list li')].filter((li) => li.getClientRects().length > 0).length") });
    await snap(H, `182-info-${t}-1536`);
    await auditAt(H, `info-${t}@1536`);
  }
  await H.key('Escape');
  // ★ R073 (D-320) — 채택 +5P 는 제보 탭으로 옮겼다 · 포인트 탭 = 정답 1P · 평가 1P · 보너스 · 50P · 뽑기 20P
  record('★★ R066 D1 ⓘ 안내 네 묶음(놀이 · 포인트 · 이모티콘 · 제보) · 포인트 묶음(1P · 평가 · 보너스 · 50P · 뽑기 20P — R073)', tabs.every((x) => x.n > 0) && /1P/.test(pts) && /평가/.test(pts) && /보너스/.test(pts) && /50P/.test(pts) && /20P/.test(pts), JSON.stringify({ tabs, pts }));

  // ── D4 첫 구매 가이드 — 포인트를 주고 샵에서 처음 뽑으면 1번 자리 + 가이드(한 번)
  hId = await withPg(async (c) => (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_uh`])).rows[0]?.id);
  await withPg((c) => c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, 500, 'admin', 'ui-check R066')`, [hId]));
  // ★ R073 (D-318) — 옛 가이드 창은 없앴다: 첫 뽑기 → 1번 자리 · 포인트샵을 닫으면 😊 창 + 안내 카드
  await H.evaluate("localStorage.removeItem('qw.flag.emojiHelpDismissed')");
  await H.evaluate("document.querySelector('#shop-btn')?.click()");
  await H.waitFor("document.querySelector('.shop-draw:not([disabled])') !== null", 6000).catch(() => false);
  await H.evaluate("document.querySelector('.shop-draw:not([disabled])')?.click()");
  await H.waitFor("document.querySelector('.gacha-result') !== null", 8000).catch(() => false);
  await sleep(300);
  await H.evaluate("document.querySelector('.shop-pop .popup-close')?.click()");
  await H.waitFor("document.querySelector('[data-emoji-help]') !== null", 4000).catch(() => false);
  await sleep(300);
  const guide = JSON.parse(await H.evaluate("JSON.stringify({ shown: document.querySelector('[data-emoji-help]') !== null, old: document.querySelector('[data-emoji-guide]') !== null, lines: document.querySelectorAll('[data-emoji-help] li').length, slot1: JSON.parse(localStorage.getItem('qw.emoji.v1') ?? 'null')?.[0] ?? null })"));
  await snap(H, '183-emoji-guide-1536');
  await auditAt(H, 'guide@1536');
  record('★★★ R066 D4 → R073 (D-318) 첫 구매 → 1번 자리 · 포인트샵 닫으면 😊 창 + 안내 카드(옛 가이드 창 없음 · R074 카드 3줄)', guide.shown && !guide.old && guide.lines === 3 && Number.isInteger(guide.slot1), JSON.stringify(guide));
  await H.key('Escape');
  await withPg((c) => c.query(`DELETE FROM account_emojis WHERE account_id = $1`, [hId]).catch(() => undefined));

  // ── D5 사람 카드(방장 시점) — 버튼 줄은 동작만
  await H.evaluate("[...document.querySelectorAll('.seat-card[role=\"button\"]')].find((c) => c.innerText.includes('설명손님'))?.click()");
  await H.waitFor("document.querySelector('.person-card') !== null", 3000).catch(() => false);
  await sleep(300);
  const person = JSON.parse(await H.evaluate("JSON.stringify({ stateInActs: document.querySelector('[data-person-acts] [data-act=\"friend-state\"]') !== null, acts: [...document.querySelectorAll('[data-person-acts] [data-act]')].map((b) => b.dataset.act) })"));
  await snap(H, '184-person-host-1536');
  await H.key('Escape');
  record('★★ R066 D5 사람 카드 — 버튼 줄에는 동작만(친구 상태 글 없음)', !person.stateInActs && person.acts.length > 0, JSON.stringify(person));
  }

  // ── lab — 사진 칸 크기 고정 · 고기 문구 · 소수파 색 · 타자 언어 · 균형 12종
  const L = await newPage(browser, 'U-lab', true);
  await L.setViewport(1536, 864);
  await signUp(L, 'ul', '실험실');
  const img = await withPg(async (c) => (await c.query(`SELECT image_ids[1] AS id FROM minigame_items WHERE game = 'photo' AND active AND array_length(image_ids, 1) > 0 ORDER BY item_id LIMIT 1`)).rows[0]?.id ?? null);
  const frame = {};
  for (const mode of ['mosaic', 'zoom']) {
    for (const at of [0, 6000, 16000]) {
      await L.goto(`${BASE}/lab/minigame?scene=1&key=photo&phase=play&mode=${mode}&at=${at}${img ? `&image=${img}` : ''}`);
      await L.waitFor("document.querySelector('.photo-frame') !== null", 8000).catch(() => false);
      await sleep(900);
      frame[`${mode}@${at}`] = JSON.parse(await L.evaluate("JSON.stringify((() => { const r = document.querySelector('.photo-frame')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : [0, 1]; })())"));
      if (at !== 6000) await snap(L, `185-photo-${mode}-${at}`);
    }
  }
  const sizes = new Set(Object.values(frame).map((v) => v.join('x')));
  record('★★★ R066 B8 사진 칸 크기 — 모자이크 · 확대 모두 시작 · 중간 · 끝이 같은 크기(4:3)', sizes.size === 1 && Object.values(frame).every(([w, h]) => Math.abs(w / h - 4 / 3) < 0.02), JSON.stringify({ img, frame }));
  const meat = {};
  for (const err of ['-2.5', '-1', '0.1', '0.8', '3', 'none']) {
    await L.goto(`${BASE}/lab/minigame?scene=1&key=cake&phase=roundResult&err=${err}`);
    await L.waitFor("document.querySelector('.mg-cake-result') !== null", 8000).catch(() => false);
    await sleep(300);
    meat[err] = JSON.parse(await L.evaluate("JSON.stringify((() => { const a = document.querySelector('.mg-cake-result .meat-art')?.getBoundingClientRect(); const l = document.querySelector('.mg-cake-result .meat-label')?.getBoundingClientRect(); return a && l ? { dx: Math.round((l.left + l.right) / 2 - (a.left + a.right) / 2), gap: Math.round(l.top - a.bottom), text: document.querySelector('.mg-cake-result .meat-label').innerText } : null; })())"));
    await snap(L, `186-meat-${err}`);
  }
  await L.setViewport(2560, 1313);
  await L.goto(`${BASE}/lab/minigame?scene=1&key=cake&phase=roundResult&err=3`);
  await L.waitFor("document.querySelector('.mg-cake-result') !== null", 8000).catch(() => false);
  await sleep(300);
  meat.at2560 = JSON.parse(await L.evaluate("JSON.stringify((() => { const a = document.querySelector('.mg-cake-result .meat-art')?.getBoundingClientRect(); const l = document.querySelector('.mg-cake-result .meat-label')?.getBoundingClientRect(); return a && l ? { dx: Math.round((l.left + l.right) / 2 - (a.left + a.right) / 2), gap: Math.round(l.top - a.bottom), text: 'w2560' } : null; })())"));
  await snap(L, '186-meat-3-2560');
  await L.setViewport(1536, 864);
  record('★★ R066 B9 고기 결과 문구 다섯(생고기 · 덜 익음 · 딱 좋게 · 조금 탐 · 새까맣게 탐 · 안 누름) — 고기 그림 바로 아래 가운데', Object.values(meat).every((m) => m && Math.abs(m.dx) <= 4 && m.gap >= -2 && m.gap <= 16), JSON.stringify(meat));
  await L.goto(`${BASE}/lab/minigame?scene=1&key=minority&phase=roundResult`);
  await L.waitFor("document.querySelector('.minority-bars') !== null", 8000).catch(() => false);
  await sleep(300);
  const mino = JSON.parse(await L.evaluate("JSON.stringify({ segs: [...document.querySelectorAll('.minority-bar.win .minority-seg')].map((s) => s.style.background), grey: getComputedStyle(document.querySelector('.minority-bar:not(.win) .minority-fill')).backgroundColor })"));
  await snap(L, '187-minority-colors');
  record('★★ R066 C6 소수파 — 이긴 막대는 고른 사람 색 조각 · 진 막대는 회색', mino.segs.length === 2 && mino.segs.every((b) => /--p\d/.test(b)), JSON.stringify(mino));
  await L.goto(`${BASE}/lab/minigame?scene=1&key=typing&phase=play&state=wronglang`);
  await L.waitFor("document.querySelector('.typing-stage') !== null", 8000).catch(() => false);
  await sleep(300);
  const lang = await L.evaluate("document.querySelector('[data-typing-lang-warn]')?.innerText ?? ''");
  await snap(L, '188-typing-wronglang');
  await L.goto(`${BASE}/lab/minigame?scene=1&key=typing&phase=ready`);
  await L.waitFor("document.querySelector('.mg-ready') !== null", 8000).catch(() => false);
  await sleep(300);
  const ready = await L.evaluate("document.querySelector('[data-typing-lang]')?.innerText ?? ''");
  await snap(L, '188-typing-ready');
  record('★★ R066 C7 타자 — 준비에 "다음 글 한글/영어" · 한글 글에 영문을 치면 "한/영 키를 누르세요"', /한/.test(lang) && /다음 글/.test(ready), JSON.stringify({ lang, ready }));
  await L.goto(`${BASE}/lab/minigame`);
  await L.waitFor("document.querySelectorAll('[data-balance-kind]').length > 0", 8000).catch(() => false);
  await sleep(500);
  const kinds = await L.evaluate("document.querySelectorAll('[data-balance-kind]').length");
  await snap(L, '189-balance-12');
  await L.setViewport(2560, 1313);
  await sleep(400);
  await snap(L, '189-balance-12-2560');
  record('★★ R066 C8 균형의 수호자 — 물건 12종 · 장면 셋(그대로 · 도마 · 소풍 천) 그림', kinds === 12, String(kinds));
  await L.close?.();

  // ── 감사 · 정리
  const bad = wrapRows.filter((r) => !r.ok);
  record('★★ R066 새 글(안내 탭 · 가이드 · 고르기 창) 줄바꿈 · 넘침 감사 0건', bad.length === 0, bad.slice(0, 8).map((r) => `${r.sel} @${r.vw} ${r.text}`).join(' / '));
  if (hId) await withPg((c) => c.query(`DELETE FROM point_grants WHERE account_id = $1 AND note = 'ui-check R066'`, [hId]));
  await G?.close?.();
  await H?.close?.();
}

// ★★ R065 — 제보 메뉴 두 갈래 · 최근 문제 · 미니게임 목록 · 창이 열린 채 미니게임(UICHECK_R065=1 · 묶음 r065 · docs/design/r065)
const R065_SIZES = [
  { w: 1280, h: 720 },
  { w: 1536, h: 864 },
  { w: 2560, h: 1313 },
  { m: true },
];
async function r065Flow(browser) {
  const H = await newPage(browser, 'T-host', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'th', '메뉴방장');
  const roomId = await createRoom(H, 'R065 제보');
  const G = await newPage(browser, 'T-guest', true);
  await G.setViewport(1280, 720);
  await signUp(G, 'tg', '제보중손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  G.pageErrors = [];
  const wrapRows = [];
  const auditAt = async (page, label) => {
    const rows = await wrapAudit(page, label, true);
    wrapRows.push(...rows);
  };

  // ── §C 손님이 제보 창(일반)을 열고 글을 쓰는 중에 방장이 미니게임(타자 · 풍선)을 시작한다
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(300);
  await selectMinigames(H, ['typing', 'balloon']);
  await sleep(300);
  await G.evaluate("document.querySelector('.chat-card input')?.focus()");
  await G.key('b', { alt: true });
  await G.waitFor("document.querySelector('[data-report-menu]') !== null", 3000);
  await snap(G, '160-report-menu-1280');
  await realClick(G, '[data-report-pick="general"]');
  await G.waitFor("document.querySelector('.report-modal .report-text') !== null", 3000);
  await G.send('Input.insertText', { text: '제보 중' });
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  const seen = {};
  const typeSpace = async () => {
    await G.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 });
    await G.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  };
  const TA = "(() => { const t = document.querySelector('.report-modal .report-text'); const ae = document.activeElement; return JSON.stringify({ open: !!t, focus: ae === t, ae: ae === t ? '' : `${ae?.tagName}.${ae?.className}`, value: t?.value ?? null }); })()";
  // ★ 타자는 여러 판(play 여러 번) · 순서는 섞인다 — 둘 다 볼 때까지
  for (let i = 0; i < 8 && !('balloon' in seen && 'typing' in seen); i += 1) {
    if (!(await G.waitFor("document.querySelector('.mg-card[data-phase=\"play\"]') !== null", 90000).catch(() => false))) break;
    const k = await G.evaluate("(() => { const c = document.querySelector('.mg-card[data-phase=\"play\"]'); return c ? [...c.classList].find((x) => x.startsWith('mg-') && x !== 'mg-card' && !x.startsWith('mg-phase')).slice(3) : ''; })()");
    await sleep(700);
    const before = JSON.parse(await G.evaluate(TA));
    await typeSpace();
    await G.send('Input.insertText', { text: k });
    await sleep(200);
    const after = JSON.parse(await G.evaluate(TA));
    if (!(k in seen)) seen[k] = { before, after, ok: true };
    seen[k].ok &&= before.open && before.focus && after.focus && after.value === `${before.value} ${k}`;
    if (i === 0) await snap(G, '161-report-open-during-minigame');
    await G.waitFor("document.querySelector('.mg-card[data-phase=\"play\"]') === null", 90000).catch(() => false);
  }
  const kept = Object.values(seen).every((v) => v.ok);
  record('★★★ R065 §C 제보 창이 열린 채 미니게임(타자 · 풍선) — 창 그대로 · 글칸 포커스 안 뺏김 · Space 는 글칸에(펌프 안 눌림) · 글 남음', kept && 'typing' in seen && 'balloon' in seen, JSON.stringify(seen));
  // 보내기 — 맥락은 연 때(대기실) 것
  await G.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 });
  await G.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 });
  await G.waitFor("document.querySelector('[data-report-toast]') !== null", 4000).catch(() => false);
  await sleep(300);
  const row = await withPg(async (c) => (await c.query(`SELECT r.text, r.screen, r.minigame_key FROM app_reports r JOIN accounts a ON a.id = r.account_id WHERE a.login_id = $1 ORDER BY r.id DESC LIMIT 1`, [`${ACCOUNT_PREFIX}_tg`])).rows[0]);
  const pumps = await withPg(async (c) => (await c.query(`SELECT count(*)::int AS n FROM minigame_results mr JOIN minigame_runs r ON r.id = mr.run_id JOIN accounts a ON a.id = mr.account_id WHERE r.room_id = $1 AND r.minigame_key = 'balloon' AND a.login_id = $2 AND mr.submitted`, [roomId, `${ACCOUNT_PREFIX}_tg`])).rows[0]?.n ?? -1);
  // ★ 화면(screen)은 연 때 것 · 방의 판 · 미니게임 칸은 서버가 보낼 때의 방 상태로 붙인다(그대로)
  record('★★ R065 §C 맥락은 창을 연 때 것(화면 = 대기실 — 미니게임 화면 아님) · 풍선 제출 없음(Space 가 게임으로 안 감)', !!row && row.screen === 'room' && row.text.startsWith('제보 중') && pumps === 0, JSON.stringify({ row, pumps }));

  // ── §A 최근 목록 — 방금 미니게임 둘이 위에(새것 위) · 크기 · 테마
  await H.waitFor("document.querySelector('.result-card') !== null", 60000).catch(() => false);
  const shotsList = {};
  for (const z of R065_SIZES) {
    if (z.m) await touchDevice(G, 390, 844);
    else await G.setViewport(z.w, z.h);
    await sleep(400);
    const tag = z.m ? 'm390' : `${z.w}x${z.h}`;
    if (z.m) {
      await tapOn(G, '#menu-btn');
      await G.waitFor("document.querySelector('[data-menu-report]') !== null", 3000);
      await tapOn(G, '[data-menu-report]');
    } else {
      await G.evaluate("document.querySelector('[data-report-btn]')?.click()");
    }
    await G.waitFor("document.querySelector('[data-report-menu]') !== null", 3000);
    await sleep(250);
    if (z.w === 1536 || z.m) await snap(G, `162-report-menu-${tag}`);
    await auditAt(G, `r065-menu@${tag}`);
    const menu = JSON.parse(await G.evaluate("JSON.stringify((() => { const m = document.querySelector('[data-report-menu]').getBoundingClientRect(); const b = [...document.querySelectorAll('.report-menu-item')].map((x) => x.getBoundingClientRect()); return { n: b.length, inView: m.top >= 0 && m.bottom <= innerHeight && m.left >= 0 && m.right <= innerWidth, h: b.map((x) => Math.round(x.height)), over: document.documentElement.scrollWidth - innerWidth }; })())"));
    if (z.m) await tapOn(G, '[data-report-pick="recent"]');
    else await realClick(G, '[data-report-pick="recent"]');
    await G.waitFor("document.querySelector('[data-report-list]') !== null", 3000);
    await sleep(250);
    if (z.w === 1536 || z.w === 2560 || z.m) await snap(G, `163-report-list-${tag}`);
    await auditAt(G, `r065-list@${tag}`);
    const list = JSON.parse(await G.evaluate("JSON.stringify((() => { const rows = [...document.querySelectorAll('.report-recent-row')]; return { rows: rows.map((r) => r.innerText.replace(/\\s+/g, ' ')), oneLine: rows.every((r) => r.getBoundingClientRect().height <= 44), over: document.documentElement.scrollWidth - innerWidth }; })())"));
    shotsList[tag] = { menu, list };
    if (z.m) await G.evaluate("document.querySelector('.report-modal .popup-close')?.click()");
    else await G.key('Escape');
    await sleep(250);
    if (z.m) {
      await touchDevice(G, 390, 844, false);
      await G.setViewport(1280, 720);
    }
  }
  const okList = Object.values(shotsList).every((v) => v.menu.n === 2 && v.menu.inView && v.menu.over <= 1 && v.list.rows.length >= 2 && v.list.oneLine && v.list.over <= 1 && /^풍선|^타자/.test(v.list.rows[0] ?? ''));
  record('★★★ R065 §A 제보 메뉴 두 갈래 · 최근 목록(미니게임 이름 · 시각 · 한 줄 · 새것 위) — 1280 · 1536 · 2560 · m390', okList, JSON.stringify(shotsList));
  const badWrap = wrapRows.filter((r) => !r.ok);
  record('★★ R065 메뉴 · 목록 줄바꿈 · 넘침 감사 0건(1280 · 1536 · 2560 · m390)', badWrap.length === 0, badWrap.slice(0, 6).map((r) => `${r.sel} @${r.vw} ${r.text}`).join(' / '));
  // 밤 테마
  await G.evaluate("document.documentElement.dataset.theme = 'night'");
  await G.setViewport(1536, 864);
  await G.evaluate("document.querySelector('[data-report-btn]')?.click()");
  await G.waitFor("document.querySelector('[data-report-menu]') !== null", 3000);
  await realClick(G, '[data-report-pick="recent"]');
  await sleep(300);
  await snap(G, '164-report-list-night');
  // 목록에서 미니게임 하나를 고르면 그 대상 창(이름 머리 · 칩 7) → 보내면 참가한 판 id
  await realClick(G, '.report-recent-row');
  await G.waitFor("document.querySelector('.qreport-modal') !== null", 3000);
  const head = await G.evaluate("document.querySelector('.qreport-modal .pop-title')?.innerText ?? ''");
  await realClick(G, '.qreport-modal .fb-chip[data-reason="unclear"]');
  await realClick(G, '.qreport-modal .report-actions button:last-child');
  await G.waitFor("document.querySelector('[data-report-toast]') !== null", 4000).catch(() => false);
  await sleep(300);
  await G.evaluate("document.documentElement.dataset.theme = 'pastel'");
  const qrow = await withPg(async (c) => (await c.query(`SELECT r.kind, r.minigame_key, r.minigame_run_id::text AS run, r.game_id::text AS game FROM app_reports r JOIN accounts a ON a.id = r.account_id WHERE a.login_id = $1 ORDER BY r.id DESC LIMIT 1`, [`${ACCOUNT_PREFIX}_tg`])).rows[0]);
  record('★★ R065 목록에서 고른 미니게임 — 창 머리 이름 · 보내면 key · 참가한 미니게임 판 id · 판 id · 예외 0', /풍선|타자/.test(head) && qrow?.kind === 'question' && !!qrow.minigame_key && !!qrow.run && !!qrow.game && G.pageErrors.length === 0, JSON.stringify({ head, qrow, err: G.pageErrors.slice(0, 3) }));
  await withPg((c) => c.query(`DELETE FROM app_reports WHERE account_id IN (SELECT id FROM accounts WHERE login_id = ANY($1))`, [[`${ACCOUNT_PREFIX}_th`, `${ACCOUNT_PREFIX}_tg`]]));
  await G.close?.();
  await H.close?.();
}

// ★★ R064 — 찬종 제보 #20~#31 (UICHECK_R064=1 · 묶음 r064 · docs/design/r064 · 찬종 새 환경 2560×1313 @1 먼저 → 고친 뒤 전 크기)
const R064_PC = [
  { w: 1280, h: 720 },
  { w: 1536, h: 864 },
  { w: 1536, h: 730 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1313 },
];
/** 결과 화면 — 순위 카드가 화면 안에 보이고 · 방장이면 다시 하기 · 로비로가 보이고 · 덮는 것 없음 */
const RESULT_SEEN = `JSON.stringify((() => {
  const card = document.querySelector('.result-card');
  const r = card?.getBoundingClientRect();
  const vis = (el) => { if (!el) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight + 1 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5; };
  const btn = (t) => [...document.querySelectorAll('.result-card .next-row button')].find((b) => b.innerText.trim().endsWith(t));
  const ranks = [...document.querySelectorAll('.result-card .ranking li')];
  const top = r ? document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + Math.min(40, r.height / 2))) : null;
  return { card: !!card, h: r ? Math.round(r.height) : 0, top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, vh: innerHeight, vw: innerWidth,
    ranks: ranks.length, ranksVis: ranks.length > 0 && ranks.every(vis), again: vis(btn('다시 하기')), lobby: vis(btn('로비로')), note: vis(document.querySelector('.result-card .next-row .note')),
    covered: !!(top && card && !card.contains(top)), coverBy: top && card && !card.contains(top) ? String(top.className || top.tagName) : null,
    page: document.documentElement.scrollHeight - innerHeight };
})())`;
async function r064ResultAt(page, sizes, host) {
  const out = {};
  for (const z of sizes) {
    await page.setViewport(z.w, z.h);
    await sleep(350);
    out[`${z.w}x${z.h}`] = JSON.parse(await page.evaluate(RESULT_SEEN));
  }
  const ok = Object.values(out).every((o) => o.card && o.ranksVis && !o.covered && (host ? o.again && o.lobby : o.note));
  return { ok, out };
}

async function r064Flow(browser) {
  const H = await newPage(browser, 'S-host', true);
  await H.setViewport(2560, 1313);
  await signUp(H, 'sh', '결과방장');
  const roomId = await createRoom(H, 'R064 결과');
  const G = await newPage(browser, 'S-guest', true);
  await G.setViewport(2560, 1313);
  await signUp(G, 'sg', '결과손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  const X = await newPage(browser, 'S-leave', true);
  await X.setViewport(1280, 720);
  await signUp(X, 'sx', '중간나감');
  await X.goto(`${BASE}/r/${roomId}`);
  await X.waitFor("document.querySelector('.stage') !== null", 10000);
  H.pageErrors = [];
  G.pageErrors = [];

  // ── §A-1 미니게임만 2개(연타) · 셋째 사람은 첫 미니게임 중에 나감(#27 판 2186 과 같은 꼴 — 나간 사람 final 없음)
  await realClick(H, 'button[data-mode="minigame"]');
  await H.waitFor("document.querySelector('.mg-rounds-input') !== null", 4000);
  await H.setInput('.mg-rounds-input', '2');
  await sleep(300);
  await selectMinigames(H, ['tap']);
  await sleep(300);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.mg-series') !== null", 20000);
  await sleep(1500);
  // ★ 판 2186 그대로 — 셋째는 **끊김**(탭 닫기) → 결과 뒤 끊김 제한(묶음 DISCONNECT_REMOVE_MS) 이 지나 방에서 빠진다(room.playerLeft + lobby.settingsUpdated)
  X.close?.();
  await H.waitFor("document.querySelector('.result-card') !== null", 120000).catch(() => false);
  await G.waitFor("document.querySelector('.result-card') !== null", 10000).catch(() => false);
  await H.waitFor("document.querySelectorAll('.seats .seat-card:not(.empty)').length <= 2 && ![...document.querySelectorAll('.seat-card')].some((c) => c.innerText.includes('중간나감'))", 40000).catch(() => false);
  await sleep(1200);
  await snap(H, '150-mgonly-result-2560');
  await snap(G, '150-mgonly-result-2560-guest');
  const a1h = await r064ResultAt(H, [{ w: 2560, h: 1313 }], true);
  const a1g = await r064ResultAt(G, [{ w: 2560, h: 1313 }], false);
  record('★★★ §A 미니게임만 결과(2560×1313 · 셋째 중간 나감) — 순위 카드 보임 · 방장 다시 하기 · 로비로 · 손님 안내 · 예외 0', a1h.ok && a1g.ok && H.pageErrors.length === 0 && G.pageErrors.length === 0, JSON.stringify({ h: a1h.out, g: a1g.out, errH: H.pageErrors.slice(0, 3), errG: G.pageErrors.slice(0, 3) }));
  const a1all = await r064ResultAt(H, R064_PC, true);
  await touchDevice(G, 390, 844);
  await sleep(400);
  const a1m = JSON.parse(await G.evaluate(RESULT_SEEN));
  await snap(G, '151-mgonly-result-m390');
  await touchDevice(G, 390, 844, false);
  await G.setViewport(2560, 1313);
  record('★★ §A 미니게임만 결과 — PC 다섯 크기 모두 · m390 손님', a1all.ok && a1m.card && a1m.ranksVis && a1m.note, JSON.stringify({ pc: a1all.out, m390: a1m }));

  // ── §A-2 퀴즈 판 결과(문제 평가 목록 있음) — 2560 먼저
  await H.setViewport(2560, 1313);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '로비로')?.click()");
  await H.waitFor("document.querySelector('button[data-mode=\"quiz\"]') !== null", 10000);
  await realClick(H, 'button[data-mode="quiz"]');
  await sleep(300);
  // ★ 판 2185 처럼 문제가 많고(12) 방장이 👎 를 눌러 결과 목록이 펼쳐진 꼴
  const QN = 12;
  await setQuestionCount(H, QN);
  H.pageErrors = [];
  G.pageErrors = [];
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  for (let i = 1; i <= QN; i += 1) {
    await H.waitFor("document.querySelector('.question-card .q-text') !== null && document.querySelector('.reveal') === null", 40000);
    await sleep(300);
    await answerCurrent(H, H);
    await H.waitFor("document.querySelector('.reveal') !== null || document.querySelector('.result-card') !== null", 15000);
    if (i <= 2) await H.evaluate("document.querySelector('.reveal-fb .fb-vote.down')?.click()");
  }
  await H.waitFor("document.querySelector('.result-card') !== null", 60000).catch(() => false);
  await sleep(1500);
  await snap(H, '152-quiz-result-2560');
  await snap(G, '152-quiz-result-2560-guest');
  const a2 = await r064ResultAt(H, R064_PC, true);
  const a2g = JSON.parse(await G.evaluate(RESULT_SEEN));
  record('★★★ §A 퀴즈 결과(문제 평가 목록) — PC 다섯 크기(2560 포함) 순위 · 버튼 보임 · 손님 · 예외 0', a2.ok && a2g.card && a2g.ranksVis && H.pageErrors.length === 0 && G.pageErrors.length === 0, JSON.stringify({ h: a2.out, g: a2g, errH: H.pageErrors.slice(0, 3), errG: G.pageErrors.slice(0, 3) }));
  await H.setViewport(2560, 1313);

  if (process.env.R064_ONLY === 'A') return;
  // ── §B 사진 그림 실패 — 없는 그림 id → "그림 불러오는 중" → 2초 뒤 다시 × 2 → 글로 대신(진행은 그대로)
  const L = await newPage(browser, 'S-lab', true);
  await L.setViewport(2560, 1313);
  await signUp(L, 'sl', '실험실');
  const imgFail = {};
  for (const mode of ['zoom', 'mosaic']) {
    await L.goto(`${BASE}/lab/minigame?scene=1&key=photo&phase=play&seed=2024&mode=${mode}&image=photo-none-r064&at=2000`);
    const loading = await L.waitFor("document.querySelector('[data-img-loading]') !== null", 4000).catch(() => false);
    const failed = await L.waitFor("document.querySelector('[data-img-fail]') !== null", 9000).catch(() => false);
    const input = await L.evaluate("document.querySelector('.quiz-num input') !== null");
    imgFail[mode] = { loading, failed, input, text: await L.evaluate("document.querySelector('[data-img-fail]')?.innerText ?? ''") };
    if (mode === 'zoom') await snap(L, '153-photo-imgfail-2560');
  }
  record('★★ §B 사진 그림 실패 — 불러오는 중 → 다시 받기 2번 → "사진을 못 받았어요" · 입력칸 그대로(확대 · 모자이크)', Object.values(imgFail).every((o) => o.loading && o.failed && o.input && /못 받았어요/.test(o.text)), JSON.stringify(imgFail));

  // ── §C 줄바꿈 전수 감사 — 실험실 16게임 × (규칙 · 진행 · 판 결과) × (2560 · 1536 · 1280 · m390) + 화면(고르기 창 · 제보 창 · 전체 업적 · 결과)
  const wrapRows = [];
  const auditAt = async (page, label) => {
    const rows = await wrapAudit(page, label, true);
    wrapRows.push(...rows);
  };
  const LAB_SIZES = [{ w: 2560, h: 1313 }, { w: 1536, h: 864 }, { w: 1280, h: 720 }, { w: 390, h: 844, m: true }];
  const keys = JSON.parse(await L.evaluate("fetch('/api/minigames').then((r) => r.ok ? r.json() : null).then((j) => JSON.stringify((j?.minigames ?? []).map((m) => m.key))).catch(() => '[]')"));
  const KEYS16 = keys.length ? keys : ['cake', 'balance', 'reaction', 'typing', 'circle', 'angle', 'price', 'worldprice', 'photo', 'estimate', 'which', 'minority', 'oddone', 'gauge', 'balloon', 'tap'];
  for (const z of LAB_SIZES) {
    if (z.m) await touchDevice(L, z.w, z.h);
    else await L.setViewport(z.w, z.h);
    for (const k of KEYS16) {
      for (const ph of ['rules', 'play', 'roundResult']) {
        await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024`);
        await sleep(250);
        await auditAt(L, `lab-${k}-${ph}@${z.w}`);
      }
    }
  }
  if (true) await touchDevice(L, 390, 844, false);
  // 화면 — 방 대기실(방장 H): 고르기 창 · 제보 창 · 이모티콘 창 / 첫 화면(L): 전체 업적
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '로비로')?.click()");
  await H.waitFor("document.querySelector('[data-mg-catalog-open]') !== null", 10000);
  await realClick(H, 'button[data-mode="minigame"]');
  await sleep(300);
  const SURF = [...R064_PC, { w: 390, h: 844, m: true }];
  for (const z of SURF) {
    if (z.m) await touchDevice(H, z.w, z.h);
    else await H.setViewport(z.w, z.h);
    await sleep(300);
    const tag = `${z.w}x${z.h}`;
    // 고르기 창
    await H.evaluate("document.querySelector('[data-mg-catalog-open]')?.click()");
    await H.waitFor("document.querySelector('.mg-catalog') !== null", 4000).catch(() => false);
    await sleep(350);
    if (z.w === 2560) await snap(H, '154-catalog-2560');
    if (z.m) await snap(H, '154-catalog-m390');
    await auditAt(H, `catalog@${tag}`);
    await H.key('Escape');
    await sleep(250);
    // 제보 창
    if (!z.m) {
      await H.evaluate("document.querySelector('[data-report-btn]')?.click()");
      await H.waitFor("document.querySelector('.report-modal') !== null", 4000).catch(() => false);
      // ★ R065 — 메뉴도 감사 → ② 일반 제보 창
      await auditAt(H, `report-menu@${tag}`);
      await H.evaluate("document.querySelector('[data-report-pick=\"general\"]')?.click()");
      await sleep(300);
      if (z.w === 2560) await snap(H, '155-report-2560');
      await auditAt(H, `report@${tag}`);
      await H.key('Escape');
      await sleep(250);
    }
    // 결과 대신 대기실 자체
    await auditAt(H, `room@${tag}`);
  }
  await touchDevice(H, 390, 844, false);
  await H.setViewport(2560, 1313);
  // 전체 업적 — 첫 화면(L)
  await L.goto(`${BASE}/`);
  await L.waitFor("document.querySelector('#rename-btn') !== null", 10000);
  for (const z of SURF) {
    if (z.m) await touchDevice(L, z.w, z.h);
    else await L.setViewport(z.w, z.h);
    await sleep(300);
    await L.evaluate("document.querySelector('#rename-btn')?.click()");
    await L.waitFor("document.querySelector('.ach-all-open') !== null", 4000).catch(() => false);
    await L.evaluate("document.querySelector('.ach-all-open')?.click()");
    await L.waitFor("document.querySelector('.ach-all-modal .ach-list')?.dataset.loaded === '1'", 5000).catch(() => false);
    await sleep(350);
    if (z.w === 2560) await snap(L, '156-ach-all-2560');
    if (z.m) await snap(L, '156-ach-all-m390');
    await auditAt(L, `ach-all@${z.w}x${z.h}`);
    await L.key('Escape');
    await sleep(200);
    await L.key('Escape');
    await sleep(200);
  }
  await touchDevice(L, 390, 844, false);
  const bad = wrapRows.filter((r) => !r.ok);
  const bySel = {};
  for (const r of bad) bySel[r.sel] = (bySel[r.sel] ?? 0) + 1;
  record('★★★ §C 줄바꿈 · 넘침 감사 — 의도한 설명문([data-wrap-ok]) 말고는 두 줄 0 · 상자 밖으로 넘친 글 0 (실험실 16게임 × 3단계 × 4크기 · 고르기 창 · 제보 창 · 업적 창 · 대기실 × 6크기)', bad.length === 0, `${bad.length}건 · ${JSON.stringify(Object.entries(bySel).sort((a, b) => b[1] - a[1]).slice(0, 12))}`);

  // ── §D 이모티콘 단축키 자리 — ★ R073 (D-317) 숫자 자리 누르기 · ✎ 편집 모드는 없앴다 → 끌어서 3번 자리에 놓기 · 창은 열린 채 · 숫자는 표시만
  await H.setViewport(1536, 864);
  await sleep(300);
  await H.evaluate("document.querySelector('.emoji-btn')?.click()");
  await H.waitFor("document.querySelectorAll('.emoji-pop .emoji-slot').length === 10", 4000);
  const pickId = Number(await H.evaluate("document.querySelector('.emoji-grid .emoji-cell img')?.dataset.emojiId ?? 0"));
  await dragTo(H, '.emoji-grid .emoji-cell', '.emoji-slot-cell[data-drop-slot="2"]');
  const asg = await H.evaluate("document.querySelector('[data-emoji-drop-note]')?.innerText ?? ''");
  await snap(H, '157-emoji-assign-pc');
  await sleep(1300);
  const slots = JSON.parse(await H.evaluate("fetch('/api/auth/prefs').then((r) => r.json()).then((j) => JSON.stringify(j.prefs?.emojiSlots ?? null))"));
  const done = JSON.parse(await H.evaluate("JSON.stringify({ pop: document.querySelector('.emoji-pop') !== null, edit: document.querySelector('[data-emoji-edit], button.emoji-key, [data-slot-assign]') !== null })"));
  await H.key('Escape');
  record('★★★ §D (R073) 끌어서 3번 자리 → "3번 자리에 넣었어요" · 3번 칸 저장 · 창은 열린 채 · ✎ · 숫자 자리 버튼 · 고르기 안내 없음', /3번 자리/.test(asg) && Array.isArray(slots) && slots[2] === pickId && done.pop && !done.edit, JSON.stringify({ asg, pickId, slot3: slots?.[2], done }));
  L.close?.();
}

// ★★ R063 — 찬종 제보 19건 (UICHECK_R063=1 · 묶음 r063 · docs/design/r063 · 찬종 환경 1536×864 @1.25 먼저)
/** 글꼴 감사 — 글자가 보이는 요소의 computed font-family 가 --font(Pretendard…)로 시작하나(일부러 mono 인 자리는 뺀다) */
const FONT_AUDIT = "JSON.stringify((() => { const bad = new Map(); for (const el of document.querySelectorAll('body *')) { if (!(el instanceof HTMLElement) || !el.offsetParent && getComputedStyle(el).position !== 'fixed') continue; const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(el.tagName); if (!own) continue; const f = getComputedStyle(el).fontFamily; if (/Pretendard/.test(f.split(',')[0]) || /monospace|Cascadia|Consolas/.test(f)) continue; const k = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : ''); bad.set(k, f.split(',')[0]); } return [...bad.entries()].slice(0, 12); })())";
async function r063Flow(browser) {
  const fontBad = [];
  const audit = async (P, where) => {
    const b = JSON.parse(await P.evaluate(FONT_AUDIT));
    for (const [k, f] of b) fontBad.push(`${where}:${k}(${f})`);
  };
  const H = await newPage(browser, 'R063-host', true);
  await H.setViewport(1536, 864);
  await signUp(H, 'oh', '굽기방장');
  const roomId = await createRoom(H, 'R063 제보 19');
  const G = await newPage(browser, 'R063-guest', true);
  await touchDevice(G, 390, 844);
  await signUp(G, 'og', '굽기손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  await sleep(400);
  await audit(H, '방(PC)');
  // ── A 제보 — PC 위 막대 · 모바일 메뉴 · 떠 있는 🐞 없음
  // ★ R067 (D-300) — PC 는 ⚙ 창의 "제보" 탭(위 막대 "제보" 버튼은 ⚙ 로 모였다)
  const a1 = JSON.parse(await H.evaluate("JSON.stringify({ btn: !!document.querySelector('.room-tools [data-gear-btn]')?.offsetParent && !document.querySelector('.room-tools [data-report-btn]')?.offsetParent, float: document.querySelector('.report-float') !== null })"));
  await snap(H, '130-report-topbar-pc');
  await openGearTab(H, 'report');
  await snap(H, '130-report-gear-tab-pc');
  // ★ R065 — 메뉴 → ② 일반 제보 (★ R067 — ⚙ 제보 탭의 두 갈래)
  await realClick(H, '[data-gear-report] [data-report-pick="general"]');
  await H.waitFor("document.querySelector('.report-text') !== null", 3000);
  const ctxHidden = await H.evaluate("document.querySelector('[data-report-ctx]') === null");
  const ph = await H.evaluate("document.querySelector('.report-text')?.placeholder ?? ''");
  await pressKey(H, 'Escape', 'Escape', 27);
  await tapOn(G, '#menu-btn');
  await G.waitFor("document.querySelector('[data-menu-report]') !== null", 3000);
  const g1 = JSON.parse(await G.evaluate("JSON.stringify({ menu: !!document.querySelector('[data-menu-report]'), barBtn: !!document.querySelector('.room-tools [data-report-btn]')?.offsetParent, float: document.querySelector('.report-float') !== null })"));
  await snap(G, '131-report-menu-m390');
  await pressKey(G, 'Escape', 'Escape', 27);
  record('★★★ A 제보 — PC ⚙ 의 "제보" 탭(R067) · 모바일은 ☰ 메뉴만 · 떠 있는 🐞 없음 · 대기실은 맥락 줄 숨김 · placeholder 한 줄', a1.btn && !a1.float && g1.menu && !g1.barBtn && !g1.float && ctxHidden && ph === '무엇이 이상했나요?', JSON.stringify({ a1, g1, ctxHidden, ph }));
  // ── C 미니게임 고르기 창
  if (!(await H.evaluate("document.querySelector('.mg-check input')?.checked === true"))) await realClick(H, '.mg-check input');
  await H.waitFor("document.querySelector('[data-mg-catalog-open]') !== null", 4000);
  await realClick(H, '[data-mg-catalog-open]');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 3000);
  await sleep(300);
  const CAT = "JSON.stringify((() => { const m = document.querySelector('.mg-cat'); const l = m.querySelector('.mg-cat-list'); const f = m.querySelector('.mg-cat-foot').getBoundingClientRect(); const r = m.getBoundingClientRect(); return { cards: m.querySelectorAll('.mg-cat-card').length, ex: m.querySelectorAll('.mg-cat-ex').length, page: document.documentElement.scrollHeight - innerHeight, inner: l.scrollHeight > l.clientHeight, top: Math.round(r.top), footIn: f.bottom <= innerHeight, confirm: !!m.querySelector('[data-mg-confirm]'), nth: /이번 판/.test(document.body.innerText) }; })())";
  const c1 = JSON.parse(await H.evaluate(CAT));
  await snap(H, '132-mg-catalog-pc');
  await pressKey(H, 'Escape', 'Escape', 27);
  await G.waitFor("document.querySelector('[data-mg-catalog-open]') !== null", 4000);
  await tapOn(G, '[data-mg-catalog-open]');
  await G.waitFor("document.querySelector('.mg-cat') !== null", 3000);
  await sleep(300);
  const c2 = JSON.parse(await G.evaluate(CAT));
  await snap(G, '133-mg-catalog-m390');
  await pressKey(G, 'Escape', 'Escape', 27);
  record('★★★ C 고르기 창 — 카드 17 · 예시 6(R068 사진 연도) · 창 안에서만 스크롤(페이지 0) · 꼬리 보임 · 방장 [확정] · 손님은 보기만 · "이번 판 N번" 없음', c1.cards === 17 && c1.ex === 6 && c1.page <= 0 && c1.footIn && c1.top >= 0 && c1.confirm && !c1.nth && c2.cards === 17 && c2.page <= 0 && c2.footIn && !c2.confirm && c2.inner, JSON.stringify({ c1, c2 }));
  // ── G④ 프로필 카드 하나(사람 → 사진 · 업적 + 친구 · 강퇴 · 차단)
  const gId = await withPg(async (c) => String((await c.query(`SELECT id FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_og`])).rows[0].id));
  const hId = await withPg(async (c) => String((await c.query(`SELECT id FROM accounts WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_oh`])).rows[0].id));
  await H.evaluate(`[...document.querySelectorAll('.seat-card.pickable')].find((s) => s.querySelector('[data-person="${gId}"]'))?.click()`);
  await H.waitFor("document.querySelector('.person-card [data-person-acts]') !== null", 4000);
  await sleep(300);
  const p1 = JSON.parse(await H.evaluate("JSON.stringify({ acts: [...document.querySelectorAll('.person-card [data-act]')].map((b) => b.dataset.act), ask: /어떻게 할까요/.test(document.body.innerText), pop: document.querySelectorAll('.modal').length })"));
  await snap(H, '134-personcard-pc');
  await realClick(H, '.person-card [data-act="kick"]');
  const kickConfirm = await H.waitFor("document.querySelector('.confirm-modal[data-kind=\"kick-kick\"]') !== null", 3000);
  await pressKey(H, 'Escape', 'Escape', 27);
  await sleep(200);
  await tapOn(G, '#people-btn');
  await G.waitFor(`document.querySelector('.people-list [data-person="${hId}"]') !== null`, 4000);
  await G.evaluate(`document.querySelector('.people-list [data-person="${hId}"]')?.closest('button')?.click()`);
  await G.waitFor("document.querySelector('.person-card') !== null", 3000);
  await sleep(300);
  const p2 = JSON.parse(await G.evaluate("JSON.stringify({ acts: [...document.querySelectorAll('.person-card [data-act]')].map((b) => b.dataset.act), top: Math.round(document.querySelector('.person-card').getBoundingClientRect().top), over: document.documentElement.scrollWidth - innerWidth })"));
  await snap(G, '135-personcard-m390');
  await pressKey(G, 'Escape', 'Escape', 27);
  record('★★★ G④ 사람 → 프로필 카드 하나 — 방장: 친구 · 방장 넘기기 · 강퇴 · 차단(→ 최종 확인) · 손님: 친구만 · "어떻게 할까요?" 없음', p1.acts.includes('friend') && p1.acts.includes('kick') && p1.acts.includes('ban') && !p1.ask && p1.pop === 1 && kickConfirm && p2.acts.join() === 'friend' && p2.top >= 0 && p2.over <= 0, JSON.stringify({ p1, kickConfirm, p2 }));
  // ── G③ 프로필 사진 메뉴 하나(1536×864)
  const sharp = (await import('sharp')).default;
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ffb347"/><circle cx="128" cy="110" r="60" fill="#8a6bff"/></svg>')).png().toBuffer();
  await H.evaluate(`fetch('/api/avatar', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: Uint8Array.from(atob('${png.toString('base64')}'), (c) => c.charCodeAt(0)), credentials: 'same-origin' }).then((r) => r.status)`);
  await H.goto(`${BASE}/r/${roomId}`);
  await H.waitFor("document.querySelector('#rename-btn') !== null", 8000);
  await realClick(H, '#rename-btn');
  await H.waitFor("document.querySelector('[data-photo-btn]') !== null", 3000);
  await sleep(300);
  await realClick(H, '[data-photo-btn]');
  await H.waitFor("document.querySelector('[data-photo-menu]') !== null", 3000);
  const m1 = JSON.parse(await H.evaluate("JSON.stringify({ items: [...document.querySelectorAll('[data-photo-menu] button')].map((b) => b.innerText.trim()), over: document.documentElement.scrollWidth - innerWidth, maxRight: Math.max(...[...document.querySelectorAll('[data-photo-menu] button')].map((b) => Math.round(b.getBoundingClientRect().right))), vw: innerWidth, old: !!document.querySelector('.photo-zoom') })"));
  await snap(H, '136-photo-menu-pc1536');
  await pressKey(H, 'Escape', 'Escape', 27);
  record('★★★ G③ 프로필 사진을 누르면 메뉴 하나(크게 보기 · 사진 바꾸기 · 사진 지우기) · 옛 버튼 없음 · 화면 안(1536)', m1.items.join() === '크게 보기,사진 바꾸기,사진 지우기' && !m1.old && m1.over <= 0 && m1.maxRight <= m1.vw, JSON.stringify(m1));
  // ── B 평가 목록 — 3문제 판
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await setQuestionCount(H, 3);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  for (let i = 1; i <= 3; i += 1) {
    await H.waitFor("document.querySelector('.question-card .q-text') !== null && document.querySelector('.reveal') === null", 30000);
    if (i === 1) {
      await sleep(300);
      await audit(H, '문제(PC)');
      await audit(G, '문제(m390)');
    }
    await answerCurrent(H, H);
    await H.waitFor("document.querySelector('.reveal') !== null", 8000);
  }
  await H.waitFor("document.querySelector('.fb-result') !== null", 30000);
  // ★ R068 (#68) — 결과 목록은 모바일도 접힌 채 시작 → 손님(m390)도 머리를 눌러 편다
  await G.waitFor("document.querySelector('.fb-result-head') !== null", 10000);
  if (!(await G.evaluate("document.querySelector('.fb-result.open') !== null"))) await tapOn(G, '.fb-result-head');
  await G.waitFor("document.querySelector('.fb-list[data-loaded]') !== null", 10000);
  if (!(await H.evaluate("document.querySelector('.fb-result.open') !== null"))) await realClick(H, '.fb-result-head');
  await H.waitFor("document.querySelector('.fb-list[data-loaded]') !== null", 5000);
  await sleep(300);
  await audit(H, '결과(PC)');
  const b1 = JSON.parse(await H.evaluate("JSON.stringify((() => { const rows = [...document.querySelectorAll('.fb-row')]; return { n: rows.length, qnoW: [...new Set(rows.map((r) => Math.round(r.querySelector('.qno').getBoundingClientRect().width)))], textX: [...new Set(rows.map((r) => Math.round(r.querySelector('.fb-q').getBoundingClientRect().left)))], gap: Math.round(rows[0].querySelector('.fb-q').getBoundingClientRect().left - rows[0].querySelector('.fb-no').getBoundingClientRect().right) }; })())"));
  await snap(H, '137-fb-list-pc');
  await tapOn(G, '.fb-row .fb-q');
  await sleep(300);
  const b2 = JSON.parse(await G.evaluate("JSON.stringify((() => { const rows = [...document.querySelectorAll('.fb-row')]; const shut = rows.filter((r) => !r.classList.contains('open')); return { open: rows.filter((r) => r.classList.contains('open')).length, openAns: !!document.querySelector('.fb-row.open .fb-answer'), shutLen: shut.map((r) => [...r.querySelector('.fb-text').innerText].length), over: document.documentElement.scrollWidth - innerWidth }; })())"));
  await snap(G, '138-fb-open-m390');
  record('★★★ B 평가 목록 — 번호 열 고정폭(자릿수로 안 밀림 · 질문 시작 자리 같음) · 모바일 앞 28자 · 누르면 한 줄만 펼침(정답까지)', b1.n === 3 && b1.qnoW.length === 1 && b1.textX.length === 1 && b1.gap <= 80 && b2.open === 1 && b2.openAns && b2.shutLen.every((n) => n <= 29) && b2.over <= 0, JSON.stringify({ b1, b2 }));
  // ── E 가입 선물 토스트(봇 · 검사 계정은 원래 제외 — 검사 DB 에서 행을 넣어 토스트만 본다)
  await withPg((c) => c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, 50, 'signup', '가입 선물')`, [hId]));
  // ★ R066 (D-289 · D-288) — 가입 선물은 창(토스트 아님) · 포인트샵 빨간 점(열면 꺼짐) · 상점 설명 줄 없음(ⓘ 포인트로)
  await H.evaluate("localStorage.removeItem('qw.flag.shopOpened')");
  await H.goto(`${BASE}/`);
  await H.waitFor("document.querySelector('[data-signup-gift]') !== null", 8000).catch(() => undefined);
  await sleep(300);
  const toast = await H.evaluate("document.querySelector('[data-signup-gift]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  const dotBefore = await H.waitFor("document.querySelector('#shop-btn [data-shop-dot]') !== null", 6000).catch(() => false);
  const dotDiag = await H.evaluate("fetch('/api/shop').then((r) => r.json()).then((j) => ({ bal: j.balance, flag: localStorage.getItem('qw.flag.shopOpened'), btns: document.querySelectorAll('#shop-btn').length })).catch((e) => String(e))");
  await snap(H, '139-signup-gift-pc');
  await H.evaluate("document.querySelector('[data-signup-shop]')?.click()");
  await H.waitFor("document.querySelector('.shop-pop') !== null", 4000).catch(() => undefined);
  await sleep(500);
  const shopLine = await H.evaluate("document.querySelector('.shop-points-sub')?.innerText ?? ''");
  const dotAfter = await H.evaluate("document.querySelector('#shop-btn [data-shop-dot]') !== null");
  record('★★ E R066 가입 선물 창 "가입 선물 50P · 포인트샵" → [포인트샵 가기] 로 샵 · 빨간 점(열기 전 있음 · 연 뒤 없음) · 상점 설명 줄 없음', /가입 선물 50P/.test(toast) && /포인트샵/.test(toast) && dotBefore && !dotAfter && shopLine === '', JSON.stringify({ toast, dotBefore, dotAfter, shopLine, dotDiag }));
  await withPg((c) => c.query(`DELETE FROM point_grants WHERE account_id = $1 AND reason = 'signup'`, [hId]));
  // ── A 로그인 전 제보(m390) — 아이디 칸만 읽고 비밀번호는 안 읽는다
  const L = await newPage(browser, 'R063-anon', true);
  await touchDevice(L, 390, 844);
  await L.goto(BASE);
  await L.waitFor("document.querySelector('[data-report-link]') !== null", 8000);
  await audit(L, '로그인(m390)');
  const loginId = `${ACCOUNT_PREFIX}_anon`;
  await L.evaluate(`(() => { const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set(document.querySelector('input[autocomplete="username"]'), ${JSON.stringify(loginId)}); set(document.querySelector('input[type="password"]'), 'SECRETpw-9931'); })()`);
  await tapOn(L, '[data-report-link]');
  await L.waitFor("document.querySelector('.report-modal') !== null", 3000);
  await L.send('Input.insertText', { text: '로그인 버튼이 가끔 안 눌려요' });
  await sleep(200);
  await snap(L, '140-auth-report-m390');
  await tapOn(L, '.report-modal .report-actions button:last-child');
  await L.waitFor("document.querySelector('[data-report-toast]') !== null", 4000);
  await sleep(300);
  const ar = await withPg(async (c) => (await c.query(`SELECT account_id, login_hint, ip_hash, screen, row_to_json(r)::text AS raw FROM app_reports r WHERE login_hint = $1 ORDER BY id DESC LIMIT 1`, [loginId])).rows[0]);
  record('★★★ A 로그인 전 — 카드 아래 링크 · 계정 없이 저장 · login_hint = 아이디 칸 · 비밀번호는 어디에도 없음', ar && ar.account_id === null && ar.screen === 'auth' && !!ar.ip_hash && !ar.raw.includes('SECRETpw'), JSON.stringify(ar && { ...ar, raw: undefined }));
  await withPg((c) => c.query(`DELETE FROM app_reports WHERE login_hint = $1`, [loginId]));
  // ── G① 모바일 방 목록 위 막대 — Q 로고와 버튼이 안 겹침(390 · 폴드 344 · 320)
  await signUp(L, 'ol', '굽기새손님');
  await L.waitFor("document.querySelector('.home-bar') !== null", 8000);
  await audit(L, '로비(m390)');
  const OVL = "JSON.stringify((() => { const m = document.querySelector('.brand-mark').getBoundingClientRect(); const hit = [...document.querySelectorAll('.home-bar button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && !(r.right <= m.left || r.left >= m.right || r.bottom <= m.top || r.top >= m.bottom); }).length; const bar = document.querySelector('.home-bar').getBoundingClientRect(); return { hit, over: document.documentElement.scrollWidth - innerWidth, bar: [Math.round(bar.top), Math.round(bar.bottom)], mark: [Math.round(m.top), Math.round(m.bottom)], btns: [...document.querySelectorAll('.home-bar button')].map((b) => { const r = b.getBoundingClientRect(); return (b.className || b.textContent.trim().slice(0, 6)) + ':' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + 'x' + Math.round(r.height); }) }; })())";
  const ov = {};
  for (const w of [390, 344, 320]) {
    await touchDevice(L, w, 844);
    await sleep(300);
    ov[w] = JSON.parse(await L.evaluate(OVL));
    if (w === 390) await snap(L, '145-home-top-m390');
  }
  record('★★ G① 모바일 방 목록 — Q 로고 · 위 버튼 안 겹침(390 · 344 · 320) · 가로 넘침 없음', Object.values(ov).every((o) => o.hit === 0 && o.over <= 0), JSON.stringify(ov));
  // ── G② 전체 업적 창(m390 높이 600) — 위가 안 잘리고 창 안에서만 스크롤
  await touchDevice(L, 390, 600);
  await sleep(300);
  // ★ 방 목록 자체가 600 보다 길다(페이지 스크롤은 원래 있음) → 창을 열어도 **늘지 않는지**를 본다
  const pageBefore = Number(await L.evaluate('document.documentElement.scrollHeight - innerHeight'));
  await tapOn(L, '#rename-btn');
  await L.waitFor("document.querySelector('.ach-all-open') !== null", 4000);
  await tapOn(L, '.ach-all-open');
  await L.waitFor("document.querySelector('.ach-all-modal .ach-list')?.dataset.loaded === '1'", 5000);
  await sleep(300);
  const ach = JSON.parse(await L.evaluate("JSON.stringify((() => { const r = document.querySelector('.ach-all-modal').getBoundingClientRect(); const l = document.querySelector('.ach-all'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, inner: l.scrollHeight > l.clientHeight, page: document.documentElement.scrollHeight - innerHeight, head: Math.round(document.querySelector('.ach-all-modal .pop-head').getBoundingClientRect().top) }; })())"));
  ach.pageBefore = pageBefore;
  await snap(L, '146-ach-all-m390-600');
  record('★★★ G② 전체 업적 m390 높이 600 — 위 안 잘림 · 머리 고정 · 창 안 스크롤 · 창 때문에 페이지가 안 길어짐', ach.top >= 0 && ach.bottom <= ach.vh && ach.head >= 0 && ach.inner && ach.page <= Math.max(0, pageBefore), JSON.stringify(ach));
  await pressKey(L, 'Escape', 'Escape', 27);
  // ── F 그림(실험실) — 고기 4단계 · 풍선 펑 · 사진 d3 초성 · 타자 키보드 높이
  const X = await newPage(browser, 'R063-lab', true);
  await X.setViewport(1536, 864);
  await signUp(X, 'ox', '실험실');
  await X.goto(`${BASE}/lab/minigame`);
  await X.waitFor("document.querySelectorAll('[data-meat]').length === 4", 8000);
  const meat = await X.evaluate("[...document.querySelectorAll('[data-meat] svg')].map((s) => s.dataset.doneness).join(',')");
  await X.evaluate("document.querySelector('[data-meat]')?.scrollIntoView({ block: 'center' })");
  await sleep(300);
  await snap(X, '141-meat-stages-pc');
  await X.goto(`${BASE}/lab/minigame?scene=1&key=cake&phase=play&seed=2024`);
  await sleep(1200);
  await audit(X, '미니게임(PC)');
  // ★ R067 (D-295) — 소수점 없이 정수 초만(.cake-num) — 옛 "큰 정수 + 작은 소수" 는 없앴다
  const cake = JSON.parse(await X.evaluate("JSON.stringify({ big: document.querySelector('.cake-num')?.innerText, small: document.querySelector('.cake-small')?.innerText ?? null, name: document.body.innerText.includes('케이크') })"));
  await X.goto(`${BASE}/lab/minigame?scene=1&key=balloon&phase=roundResult&seed=2024&state=popped`);
  await sleep(800);
  await snap(X, '142-balloon-pop-pc');
  await X.goto(`${BASE}/lab/minigame?scene=1&key=balloon&phase=rules&seed=2024`);
  await sleep(600);
  const bal = await X.evaluate("document.body.innerText.includes('딱 100')");
  record('★★ F 고기 굽기 4단계(색 다름) · 정수 초만(R067 — 소수 없음) · 케이크 글자 없음 · 풍선 규칙 "딱 100"', meat === '0.00,0.55,1.00,1.50' && /^\d+$/.test(cake.big ?? '') && cake.small === null && !cake.name && bal, JSON.stringify({ meat, cake, bal }));
  await touchDevice(X, 390, 844);
  await X.goto(`${BASE}/lab/minigame?scene=1&key=photo&phase=play&seed=2024&hard=1`);
  await X.waitFor("document.querySelector('[data-photo-hint]') !== null", 5000).catch(() => undefined);
  await sleep(300);
  const hint = await X.evaluate("document.querySelector('[data-photo-hint]')?.innerText ?? ''");
  await snap(X, '143-photo-hint-m390');
  await touchDevice(X, 390, 500);
  await X.goto(`${BASE}/lab/minigame?scene=1&key=typing&phase=play&seed=2024`);
  await sleep(900);
  const ty = JSON.parse(await X.evaluate("JSON.stringify((() => { const t = document.querySelector('.typing-target')?.getBoundingClientRect(); const i = document.querySelector('.typing-input')?.getBoundingClientRect(); return t && i ? { tTop: Math.round(t.top), iBottom: Math.round(i.bottom), vh: innerHeight } : null; })())"));
  await snap(X, '144-typing-kbd-m390');
  record('★★ F 사진 d3 — 초성 줄 · 타자 m390 키보드 높이(500)에서 문장 · 입력칸이 함께 보임', /초성/.test(hint) && !!ty && ty.tTop >= 0 && ty.iBottom <= ty.vh, JSON.stringify({ hint, ty }));
  // ── H 글꼴 감사
  record('★★★ H 글꼴 — 로그인 · 로비 · 방 · 문제 · 결과 · 미니게임에서 Pretendard 아닌 글자 0(mono 자리 제외)', fontBad.length === 0, fontBad.join(' | ') || '0');
  for (const P of [X, L, G, H]) await P.close?.();
}
// ★★ R061 — 앱 제보 🐞 · 📝 문항 피드백 · 문항 번호 복사 (UICHECK_R061=1 · 묶음 r061 · docs/design/r061)
async function r061Flow(browser) {
  const H = await newPage(browser, 'R061-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'rh', '제보방장');
  const roomId = await createRoom(H, 'R061 제보');
  const G = await newPage(browser, 'R061-guest', true);
  await touchDevice(G, 390, 844);
  await signUp(G, 'rg', '제보손님');
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 10000);
  await setQuestionCount(H, 3);
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '게임 시작')?.click()");
  await H.waitFor("document.querySelector('.question-card .q-ids .qno') !== null", 30000);
  await G.waitFor("document.querySelector('.question-card .q-ids .qno') !== null", 5000);
  await sleep(400);
  // ① 번호 · 📝 — 카드 높이 그대로(숨겼을 때와 ±1px) · PC · m390
  const HIDE = "(() => { const s = document.createElement('style'); s.id = 'r061-hide'; s.textContent = '.q-ids{display:none!important}'; document.head.appendChild(s); })()";
  const UNHIDE = "document.getElementById('r061-hide')?.remove()";
  const hA = (await rectOf(H, '.question-card'))?.h;
  const gA = (await rectOf(G, '.question-card'))?.h;
  await H.evaluate(HIDE);
  await G.evaluate(HIDE);
  const hB = (await rectOf(H, '.question-card'))?.h;
  const gB = (await rectOf(G, '.question-card'))?.h;
  await H.evaluate(UNHIDE);
  await G.evaluate(UNHIDE);
  const qid = await H.evaluate("document.querySelector('.question-card .qno')?.dataset.qno ?? ''");
  const noCopyOut = await H.evaluate("document.querySelector('.question-card .qno')?.closest('.no-copy') === null");
  // ★ R065 (D-270) — 문제 카드의 📝 는 뺐다(제보 메뉴 ① 최근 목록으로)
  const noQBtn = (await H.evaluate("document.querySelector('.question-card .qreport-btn') === null")) && (await G.evaluate("document.querySelector('.question-card .qreport-btn') === null"));
  record('★★★ R061 문제 단계 — 문항 번호 #id(복사 막기 바깥) · R065 📝 없음 · 카드 높이 그대로(PC · m390 ±1px)', /^\d+$/.test(qid) && noCopyOut && noQBtn && Math.abs(hA - hB) <= 1 && Math.abs(gA - gB) <= 1, `#${qid} · 📝없음 ${noQBtn} · pc ${hB}→${hA} · m390 ${gB}→${gA}`);
  // ② ★ R065 — 제보 메뉴(☰ "제보") → ① 문제 · 미니게임 제보 → 최근 목록. 문제가 아직 안 끝났으면 "아직 본 문제가 없어요"
  const openMenuM = async () => {
    await tapOn(G, '#menu-btn');
    await G.waitFor("document.querySelector('[data-menu-report]') !== null", 3000);
    await tapOn(G, '[data-menu-report]');
    await G.waitFor("document.querySelector('[data-report-menu]') !== null", 3000);
  };
  await openMenuM();
  await tapOn(G, '[data-report-pick="recent"]');
  await G.waitFor("document.querySelector('[data-report-list]') !== null", 3000);
  const emptyList = await G.evaluate("document.querySelector('[data-recent-empty]')?.innerText ?? ''");
  await G.evaluate("document.querySelector('.report-modal .popup-close')?.click()");
  // 방장이 1번을 넘긴다 → question.resolved → 목록에 들어간다
  await openHostSkip(H);
  await H.evaluate("document.querySelector('.confirm-modal[data-kind=\"host-skip\"] .confirm-actions button')?.click()");
  await G.waitFor(`document.querySelector('.reveal-card, .resolution, [data-reveal]') !== null || !document.querySelector('.question-card .qno[data-qno="${qid}"]')`, 8000).catch(() => false);
  await sleep(300);
  await openMenuM();
  await tapOn(G, '[data-report-pick="recent"]');
  await G.waitFor(`document.querySelector('[data-recent="${qid}"]') !== null`, 3000).catch(() => false);
  const rowText = await G.evaluate(`document.querySelector('[data-recent="${qid}"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
  await snap(G, '125-report-recent-m390');
  record('★★★ R065 제보 메뉴(m390 ☰) — 두 갈래 · 문제 끝나기 전 "아직 본 문제가 없어요" · 끝나면 "문제 1 · #id · 앞글" 줄', emptyList.includes('아직 본 문제가 없어요') && /^문제 1 #\d+ /.test(rowText) && rowText.includes(`#${qid}`), JSON.stringify({ emptyList, rowText }));
  await tapOn(G, `[data-recent="${qid}"]`);
  await G.waitFor("document.querySelector('.qreport-modal') !== null", 3000);
  const gq = JSON.parse(await G.evaluate("JSON.stringify({ head: document.querySelector('.qreport-modal .pop-title')?.innerText ?? '', chips: document.querySelectorAll('.qreport-modal .fb-chip').length, over: document.documentElement.scrollWidth - innerWidth })"));
  await tapOn(G, '.qreport-modal .fb-chip[data-reason="answer"]');
  await sleep(200);
  await snap(G, '121-qreport-m390');
  await tapOn(G, '.qreport-modal .report-actions button:last-child');
  await G.waitFor("document.querySelector('[data-report-toast]') !== null", 4000);
  const gToast = await G.evaluate("document.querySelector('[data-report-toast]')?.innerText ?? ''");
  await sleep(300);
  const qRow = await withPg(async (c) => (await c.query(`SELECT r.kind, r.reasons, r.question_id::text, r.game_id::text, r.screen FROM app_reports r JOIN accounts a ON a.id = r.account_id WHERE a.login_id = $1 ORDER BY r.id DESC LIMIT 1`, [`${ACCOUNT_PREFIX}_rg`])).rows[0]);
  record('★★★ R061 📝 (R065 최근 목록에서 고름 · m390) — 머리 #id · 칩 7 · 보내면 토스트 · 행(question · 문항 · 참가한 판)', gq.head.includes(`#${qid}`) && gq.chips === 7 && gq.over <= 1 && /피드백 접수/.test(gToast) && qRow?.kind === 'question' && qRow.question_id === qid && !!qRow.game_id && qRow.reasons.join() === 'answer', JSON.stringify({ gq, gToast, qRow }));
  // ③ 🐞 PC — Alt+B · 맥락 줄 · Ctrl+Enter 보내기 · 토스트 · 행(화면 · 판 · 문항) · 포커스 돌려줌
  await H.evaluate("document.querySelector('.chat-card input')?.focus()");
  await H.key('b', { alt: true });
  // ★ R065 — Alt+B 는 메뉴 → ② 일반 제보
  await H.waitFor("document.querySelector('[data-report-menu]') !== null", 3000);
  await realClick(H, '[data-report-pick="general"]');
  await H.waitFor("document.querySelector('.report-modal .report-text') !== null", 3000);
  await H.send('Input.insertText', { text: '정답 공개 뒤 채팅이 잠깐 안 보였어요' });
  const ctxLine = await H.evaluate("document.querySelector('[data-report-ctx]')?.innerText ?? ''");
  await sleep(150);
  await snap(H, '122-report-pc');
  await H.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 });
  await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 });
  await H.waitFor("document.querySelector('[data-report-toast]') !== null", 4000);
  const hToast = await H.evaluate("document.querySelector('[data-report-toast]')?.innerText ?? ''");
  await snap(H, '123-report-toast-pc');
  const hFocus = await H.evaluate("document.activeElement === document.querySelector('.chat-card input')");
  await sleep(300);
  const bRow = await withPg(async (c) => (await c.query(`SELECT r.kind, r.text, r.screen, r.game_id::text, r.question_id::text, r.device, jsonb_array_length(coalesce(r.recent, '[]')) AS nrecent FROM app_reports r JOIN accounts a ON a.id = r.account_id WHERE a.login_id = $1 ORDER BY r.id DESC LIMIT 1`, [`${ACCOUNT_PREFIX}_rh`])).rows[0]);
  record('★★★ R061 🐞 PC — Alt+B · 맥락 줄(R063 쉬운 말 "문제 N (#id)") · Ctrl+Enter · "제보 접수 #n" · 행(bug · game: 화면 · 판 · 문항 · 기기 · 최근 이벤트) · 포커스 돌려줌', /^(문제 \d+|정답 공개) \(#\d+\)$/.test(ctxLine) && /제보 접수 #\d+/.test(hToast) && hFocus && bRow?.kind === 'bug' && /^game:/.test(bRow.screen) && !!bRow.game_id && !!bRow.question_id && bRow.device?.mobile === false && bRow.nrecent > 0, JSON.stringify({ ctxLine, hToast, hFocus, bRow }));
  // ④ 🐞 m390 — 오른쪽 위 🐞 · 키보드가 올라온 높이(844 → 500)에서도 [보내기] 가 화면 안
  await touchDevice(G, 390, 500);
  await sleep(300);
  // ★ R063 — 떠 있는 🐞 없앰 → ☰ 메뉴 "제보"
  await tapOn(G, '#menu-btn');
  await G.waitFor("document.querySelector('[data-menu-report]') !== null", 3000);
  await tapOn(G, '[data-menu-report]');
  await G.waitFor("document.querySelector('[data-report-menu]') !== null", 3000);
  await tapOn(G, '[data-report-pick="general"]');
  await G.waitFor("document.querySelector('.report-modal .report-text') !== null", 3000);
  await G.send('Input.insertText', { text: '폴드에서 버튼이 겹쳐요' });
  await sleep(200);
  const gm = JSON.parse(await G.evaluate("JSON.stringify((() => { const b = [...document.querySelectorAll('.report-modal .report-actions button')].pop()?.getBoundingClientRect(); return { sendBottom: b ? Math.round(b.bottom) : -1, vh: innerHeight, over: document.documentElement.scrollWidth - innerWidth, chips: document.querySelectorAll('.report-modal .fb-chip').length }; })())"));
  await snap(G, '124-report-m390');
  record('★★ R061 🐞 m390 — ☰ 메뉴 "제보" 로 열림 · 칩 4 · 키보드 높이(500)에서 [보내기] 보임 · 가로 넘침 없음', gm.sendBottom > 0 && gm.sendBottom <= gm.vh && gm.chips === 4 && gm.over <= 1, JSON.stringify(gm));
  await G.evaluate("[...document.querySelectorAll('.report-modal .report-actions button')][0]?.click()");
  await touchDevice(G, 390, 844);
  // ⑤ 번호 누르면 복사(안 되면 선택) — 토스트
  await H.waitFor("document.querySelector('.question-card .qno') !== null", 15000).catch(() => false);
  const qid2 = await H.evaluate("document.querySelector('.question-card .qno')?.dataset.qno ?? ''");
  await realClick(H, '.question-card .qno');
  await H.waitFor("document.querySelector('[data-report-toast]')?.innerText.includes('#') === true", 2000);
  const cp = await H.evaluate("document.querySelector('[data-report-toast]')?.innerText ?? ''");
  record('★★ R061 번호 누르면 복사 — "#id 복사됨"(또는 선택됨)', cp.includes(`#${qid2}`) && /복사됨|선택됨/.test(cp), cp);
  await withPg((c) => c.query(`DELETE FROM app_reports WHERE account_id IN (SELECT id FROM accounts WHERE login_id = ANY($1))`, [[`${ACCOUNT_PREFIX}_rh`, `${ACCOUNT_PREFIX}_rg`]]));
  await G.close?.();
  await H.close?.();
}
// ★★ R059 — 보너스 포인트 토스트(로그인 뒤 한 번) · PC · m390 (UICHECK_R059=1 · 묶음 r059 · docs/design/r059)
async function r059Flow(browser) {
  for (const [dev, suffix, touch] of [['pc', 'g9p', false], ['m390', 'g9m', true]]) {
    const P = await newPage(browser, `R059-${dev}`, true);
    if (touch) await touchDevice(P, 390, 844);
    else await P.setViewport(1280, 720);
    await signUp(P, suffix, dev === 'pc' ? '제보왕' : '제보손님');
    const login = `${ACCOUNT_PREFIX}_${suffix}`;
    await withPg(async (c) => {
      const f = (await c.query(`INSERT INTO question_feedback (question_id, account_id, vote, reasons, comment) SELECT (SELECT id FROM questions WHERE is_active ORDER BY id LIMIT 1), id, -1, '{answer}', 'ui-check' FROM accounts WHERE login_id = $1 ON CONFLICT (question_id, account_id) DO UPDATE SET vote = -1 RETURNING id`, [login])).rows[0];
      const g = (await c.query(`INSERT INTO point_grants (account_id, amount, reason, ref_type, ref_id) SELECT id, 5, 'feedback_adopted', 'question_feedback', $2 FROM accounts WHERE login_id = $1 RETURNING id`, [login, f.id])).rows[0];
      await c.query(`UPDATE question_feedback SET adopted_at = now(), adopted_grant_id = $2 WHERE id = $1`, [f.id, g.id]);
    });
    await P.goto(`${BASE}/`);
    await P.waitFor("document.querySelector('.grant-toast') !== null", 8000).catch(() => undefined);
    await sleep(300);
    const t = JSON.parse(await P.evaluate("JSON.stringify({ text: document.querySelector('.grant-toast')?.innerText ?? '', over: document.documentElement.scrollWidth - innerWidth })"));
    record(`★★★ R059 보너스 토스트(${dev}) — "제보가 채택됐어요 +5P · '문제 앞 30자'" · 넘침 없음`, /제보가 채택됐어요 \+5P/.test(t.text) && /'/.test(t.text) && t.over <= 1, JSON.stringify(t));
    await snap(P, `120-grant-toast-${dev}`);
    await P.goto(`${BASE}/`);
    await sleep(1500);
    record(`★★ R059 다시 들어오면 토스트 없음(${dev} — seen_at)`, await P.evaluate("document.querySelector('.grant-toast') === null"));
    await withPg((c) => c.query(`DELETE FROM point_grants WHERE account_id IN (SELECT id FROM accounts WHERE login_id = $1)`, [login]));
    await P.close?.();
  }
}
async function minigameFlow(browser) {
  // ── [1] 그림 모음 · 장면 (MG_SKIP_LAB=1 이면 건너뛴다 — 실제 판만 다시 볼 때)
  // ★ R051 — MG_SKIP_R050=1 이면 R050 두 게임을 건너뛰고 · 넷(번개손 · 타자 · 원 · 각도)만 (MG_GAMES 로 더 좁힌다)
  if (!process.env.MG_SKIP_R050) {
    if (!process.env.MG_SKIP_LAB) await minigameLab(browser);
    await closeAllTabs(browser);
    if (!process.env.MG_SKIP_LIVE) await minigameLive(browser);
  }
  if (!process.env.MG_SKIP_R051) {
    await closeAllTabs(browser);
    await r051Flow(browser);
  }
  if (!process.env.MG_SKIP_R052) {
    await closeAllTabs(browser);
    await r052Flow(browser);
  }
  if (!process.env.MG_SKIP_R053) {
    await closeAllTabs(browser);
    await r053Flow(browser);
  }
  if (!process.env.MG_SKIP_R054) {
    await closeAllTabs(browser);
    await r054Flow(browser);
  }
  if (process.env.UICHECK_STATS) {
    await closeAllTabs(browser);
    await r054Stats(browser);
  }
  // ★ R056 — 문제 평가 · 작은 수정 넷
  if (process.env.UICHECK_R056) {
    await closeAllTabs(browser);
    await r056Flow(browser);
  }
  // ★ R057 — 미니게임만 · 이모티콘 나열
  if (process.env.UICHECK_R057) {
    await closeAllTabs(browser);
    await r057Flow(browser);
  }
  // ★ R059 — 보너스 포인트 토스트
  if (process.env.UICHECK_R059) {
    await closeAllTabs(browser);
    await r059Flow(browser);
  }
  // ★ R063 — 찬종 제보 19건
  if (process.env.UICHECK_R063) {
    await closeAllTabs(browser);
    await r063Flow(browser);
  }
  // ★ R064 — 찬종 제보 #20~#31(결과 화면 · 사진 · 줄바꿈 · 단축키)
  if (process.env.UICHECK_R064) {
    await closeAllTabs(browser);
    await r064Flow(browser);
  }
  // ★ R066 — 결과 화면 잘림(§A) · 그 밖 R066 화면
  if (process.env.UICHECK_R066) {
    await closeAllTabs(browser);
    if (process.env.R066_ONLY !== 'lab') await r066ResultFlow(browser);
    if (process.env.R066_ONLY !== 'result') await r066Flow(browser);
  }
  // ★ R067 — 고기 굽기 새로 · 타자 연습칸 · 기준 날짜 · ⚙
  if (process.env.UICHECK_R067) {
    await closeAllTabs(browser);
    await r067Flow(browser);
  }
  // ★ R069 — 난이도 초급 · 중급 · 고급 · 좁은 칸 지문 글자 · 이모티콘 자주 탭
  if (process.env.UICHECK_R069) {
    await closeAllTabs(browser);
    await r069Flow(browser);
  }
  // ★ R074 — 사진 공개 · 내 자리/팝업 아래 끝 · 등록 안내 · 사무실 모드 · 밤 테마
  if (process.env.UICHECK_R074) {
    await closeAllTabs(browser);
    await r074Flow(browser);
  }
  // ★ R077 — 로비 카드 넘침(settings-overflow) · 소수파 선택지 = 인원 − 1(minority)
  if (process.env.UICHECK_R077) {
    await closeAllTabs(browser);
    if (process.env.R077_ONLY !== 'minority') await r077Overflow(browser);
    if (process.env.R077_ONLY !== 'overflow') await r077Minority(browser);
  }
  // ★ R079 — 팀전 1차 화면
  if (process.env.UICHECK_R079) {
    await closeAllTabs(browser);
    await r079Flow(browser);
  }
  // ★ R090 — 방장 제시어 주제 고르기
  if (process.env.UICHECK_R090) {
    await closeAllTabs(browser);
    await r090Flow(browser);
  }
  // ★ R089 — 캐치마인드 그리기 도구
  if (process.env.UICHECK_R089) {
    await closeAllTabs(browser);
    await r089Flow(browser);
  }
  // ★ R093 — 실전 제보 화면 셋
  if (process.env.UICHECK_R093) {
    await closeAllTabs(browser);
    await r093Flow(browser);
  }
  // ★ R101 — 스크롤 0 · 채팅 줄 수 · 잘림(창 6 크기 × 화면 23)
  if (process.env.UICHECK_R101) {
    await closeAllTabs(browser);
    await r101Flow(browser);
  }
  // ★ R096 — 노래 맞히기 방식
  if (process.env.UICHECK_R096) {
    await closeAllTabs(browser);
    await r096Flow(browser);
  }
  // ★ R095 — 실전 제보 3차(캐치 초성 · 도구 아이콘 · 색 점 팝업 · 미니게임 판:채팅)
  if (process.env.UICHECK_R095) {
    await closeAllTabs(browser);
    await r095Flow(browser);
  }
  // ★ R094 — 실전 제보 화면 셋 2차
  if (process.env.UICHECK_R094) {
    await closeAllTabs(browser);
    await r094Flow(browser);
  }
  // ★ R091 — 라이어 맞히기 이의제기
  if (process.env.UICHECK_R091) {
    await closeAllTabs(browser);
    await r091Flow(browser);
  }
  // ★ R088 — 라이어 바보형
  if (process.env.UICHECK_R088) {
    await closeAllTabs(browser);
    await r088Flow(browser);
  }
  // ★ R087 — 테스트 1 피드백(전 크기 · 125%)
  if (process.env.UICHECK_R087) {
    await closeAllTabs(browser);
    await r087Flow(browser);
  }
  // ★ R085 — OX 10연속
  if (process.env.UICHECK_R085) {
    await closeAllTabs(browser);
    await r085Flow(browser);
  }
  // ★ R084 — 노래 둘
  if (process.env.UICHECK_R084) {
    await closeAllTabs(browser);
    await r084Flow(browser);
  }
  // ★ R083 — 캐치마인드
  if (process.env.UICHECK_R083) {
    await closeAllTabs(browser);
    await r083Flow(browser);
  }
  // ★ R082 — 라이어 게임
  if (process.env.UICHECK_R082) {
    await closeAllTabs(browser);
    await r082Flow(browser);
  }
  // ★ R081 — 순서대로 · 빙고
  if (process.env.UICHECK_R081) {
    await closeAllTabs(browser);
    await r081Flow(browser);
  }
  // ★ R080 — 미니게임 1차 셋
  if (process.env.UICHECK_R080) {
    await closeAllTabs(browser);
    await r080Flow(browser);
  }
  // ★ R076 — 문제 카드 세로 흔들림(card-jitter)
  if (process.env.UICHECK_R076) {
    await closeAllTabs(browser);
    await r076Flow(browser);
  }
  // ★ R075 — 단축키 문구 · 사무실 모드 2판(office-palette) · 모바일 화면 움직임(mobile-motion)
  if (process.env.UICHECK_R075) {
    await closeAllTabs(browser);
    await r075Flow(browser);
  }
  // ★ R073 — 이모티콘 끌어서 등록 · 😊 안내 카드 · 첫 안내 투어 · ⓘ 리뉴얼
  if (process.env.UICHECK_R073) {
    await closeAllTabs(browser);
    await r073Flow(browser);
  }
  // ★ R071 — 정답 공개 평가 손질(👎 칩 줄 · 요청 밖 문항) · 다른 하나 찾기 8×8
  if (process.env.UICHECK_R071) {
    await closeAllTabs(browser);
    await r071Flow(browser);
  }
  // ★ R068 — 찬종 제보 20 · 정답 공개 평가 · photoyear · 긴 질문
  if (process.env.UICHECK_R068) {
    await closeAllTabs(browser);
    await r068Flow(browser);
  }
  // ★ R065 — 제보 메뉴 두 갈래 · 최근 목록 · 창이 열린 채 미니게임
  if (process.env.UICHECK_R065) {
    await closeAllTabs(browser);
    await r065Flow(browser);
  }
  // ★ R061 — 앱 제보 🐞 · 📝 · 문항 번호
  if (process.env.UICHECK_R061) {
    await closeAllTabs(browser);
    await r061Flow(browser);
  }
  // ★ R060 — 어젯밤 버그 넷(사이 문구 · 긴 단위 · 이모티콘 창 닫힘 · 공동 1위)
  if (process.env.UICHECK_R060) {
    await closeAllTabs(browser);
    await r060Flow(browser);
  }
}
/** ★ R050 F — /lab/sound — 후보 버튼 · 실제 파일 길이(브라우저가 읽은 duration) · 누르면 소리가 난다(오류 없음) */
async function soundLab(L) {
  await L.setViewport(1280, 900);
  await L.goto(`${BASE}/lab/sound`);
  await L.waitFor("document.querySelectorAll('.lab-sound-btn').length > 20", 8000);
  await sleep(400);
  await snap(L, '50-lab-sound-pc');
  const n = await L.evaluate("document.querySelectorAll('.lab-sound-btn').length");
  const kinds = await L.evaluate("JSON.stringify([...new Set([...document.querySelectorAll('.lab-sound-kind')].map((e) => e.innerText))])");
  record('★★ F 들어 보기 페이지 — 후보 버튼 · 세 갈래(지금 · 만든 후보 · CC0)', n > 30 && kinds.includes('지금') && kinds.includes('만든 후보') && kinds.includes('CC0'), `${n} · ${kinds}`);
  const durs = JSON.parse(
    await L.evaluate(`(async () => {
      const files = [...new Set([...document.querySelectorAll('.lab-sound-src')].map((e) => e.innerText))];
      const out = {};
      for (const f of files) {
        out[f] = await new Promise((res) => { const a = new Audio('/sounds/kenney/' + f); a.addEventListener('loadedmetadata', () => res(Math.round(a.duration * 100) / 100)); a.addEventListener('error', () => res(-1)); });
      }
      return JSON.stringify(out);
    })()`),
  );
  console.log(`[lab-sound] 파일 길이(초) ${JSON.stringify(durs)}`);
  record('★ F CC0 파일이 모두 열린다 (길이 > 0)', Object.values(durs).every((d) => d > 0), JSON.stringify(durs));
  // 몇 개 눌러 본다 (진짜 클릭) — 오류 없음
  const errs = [];
  L.onConsoleError = (m) => errs.push(m);
  for (const id of ['jingle-now', 'jingle-b', 'k-nes00', 'cake-a', 'bgm-b']) {
    await realClick(L, `.lab-sound-btn[data-cand="${id}"]`);
    await sleep(250);
  }
  const log = await L.evaluate("JSON.stringify((window.__qwSoundLog ?? []).slice(-10).map((e) => e.id + ':' + e.played))");
  record('★ F 눌러 보기 — 기존 소리는 소리 기록에 남는다(울림) · 페이지 오류 없음', log.includes('mg-jingle:true'), log);
}
async function minigameLab(browser) {
  const L = await newPage(browser, 'M-lab');
  await L.setViewport(1280, 900);
  await signUp(L, 'ml', '그림점검');
  await L.goto(`${BASE}/lab/minigame`);
  await L.waitFor("document.querySelectorAll('.lab-item').length >= 4", 8000);
  await sleep(500);
  const kinds = await L.evaluate("[...document.querySelectorAll('.lab-item[data-kind]')].map((e) => e.dataset.kind).join(',')");
  // ★ R097 — R066 (D-286) 이 물건을 4 → 12종으로 늘렸다(shared BALANCE_KINDS) → 기대 = 목록 실제 순서 그대로
  const { BALANCE_KINDS } = await import('../shared/dist/balance.js');
  record(`★★ E 그림 모음 — 물건 ${BALANCE_KINDS.length}종 (D-286 · shared BALANCE_KINDS 순서)`, kinds === BALANCE_KINDS.join(','), kinds);
  await snap(L, '30-balance-items-pc-pastel');
  await setTheme(L, 'night');
  await snap(L, '31-balance-items-pc-night');
  await setTheme(L, 'pastel');
  await touchDevice(L, 390, 1100);
  await L.evaluate("window.dispatchEvent(new Event('resize'))");
  await sleep(300);
  await snap(L, '32-balance-items-m390');
  await touchDevice(L, 1280, 900, false);
  await soundLab(L);
  // 장면 — 키 × 단계
  const scenes = [
    ['cake', 'intro'], ['cake', 'rules'], ['cake', 'play'], ['cake', 'roundResult'], ['cake', 'final'],
    ['balance', 'rules'], ['balance', 'play'], ['balance', 'roundResult'], ['balance', 'final'], ['balance', 'outro'],
  ];
  for (const [k, ph] of scenes) {
    await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024`);
    await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${ph}'`, 6000);
    await sleep(ph === 'roundResult' ? 1600 : 500);
    await L.setViewport(1280, 720);
    await sleep(150);
    await snap(L, `33-scene-${k}-${ph}-pc`);
  }
  // 장면 — 크기 · 테마 (균형 판 진행 · 케이크 판 진행 · 균형 판 결과)
  for (const [k, ph] of [['balance', 'play'], ['cake', 'play'], ['balance', 'roundResult']]) {
    await L.goto(`${BASE}/lab/minigame?scene=1&key=${k}&phase=${ph}&seed=2024`);
    await L.waitFor(`document.querySelector('.mg-card')?.dataset.phase === '${ph}'`, 6000);
    await sleep(ph === 'roundResult' ? 1600 : 500);
    await setTheme(L, 'night');
    await L.setViewport(1920, 1080);
    await sleep(200);
    await snap(L, `34-scene-${k}-${ph}-pc1920-night`);
    await setTheme(L, 'pastel');
    await touchDevice(L, 390, 844);
    await L.evaluate("window.dispatchEvent(new Event('resize'))");
    await sleep(300);
    await snap(L, `34-scene-${k}-${ph}-m390`);
    await touchDevice(L, 344, 882);
    await L.evaluate("window.dispatchEvent(new Event('resize'))");
    await sleep(300);
    const over = await L.evaluate('document.documentElement.scrollWidth - innerWidth');
    await snap(L, `34-scene-${k}-${ph}-fold`);
    record(`★ E 장면 ${k}/${ph} — 폴드 접힘(344) 가로 넘침 없음`, over <= 1, String(over));
    await touchDevice(L, 1280, 720, false);
    await L.evaluate("window.dispatchEvent(new Event('resize'))");
  }

}
async function minigameLive(browser) {
  // ── [2] 실제 연습 판 — 네 기기
  const H = await newPage(browser, 'M-host', true);
  await H.setViewport(1280, 720);
  await signUp(H, 'mh', '미니방장');
  const roomId = await createRoom(H, 'R050 미니게임');
  const N = await newPage(browser, 'M-pc1920', true);
  await N.setViewport(1920, 1080);
  await signUp(N, 'mn', '큰화면');
  await setTheme(N, 'night');
  const G = await newPage(browser, 'M-m390', true);
  await signUp(G, 'mg', '폰손님');
  await touchDevice(G, 390, 844);
  const F = await newPage(browser, 'M-fold', true);
  await signUp(F, 'mf', '폴드손님');
  await touchDevice(F, 344, 882);
  for (const p of [N, G, F]) {
    await p.goto(`${BASE}/r/${roomId}`);
    await p.waitFor("document.querySelector('.stage') !== null", 8000);
  }
  await setTheme(N, 'night');
  await sleep(600);
  // 설정 줄 — 미니게임 포함 체크
  await realClick(H, '.mg-check input');
  await H.waitFor("document.querySelector('.mg-check input')?.checked === true && document.querySelectorAll('.mg-set-row [data-minigame]').length === 6", 4000);
  await sleep(300);
  await snap(H, '40-lobby-minigame-setting-pc');
  record('★★ D 로비 설정 — "미니게임 포함" 체크 → 손님 화면에도 "포함"', await G.waitFor("[...document.querySelectorAll('.mg-set-row .chip')].some((c) => c.innerText === '포함')", 4000));
  const fit = await H.evaluate("document.documentElement.scrollHeight <= innerHeight + 1");
  record('★★ D 로비 PC 1280×720 — 미니게임 줄이 생겨도 한 화면(스크롤 없음)', fit);
  await snap(G, '40-lobby-minigame-setting-m390');
  // 골라 하기 팝업
  await realClick(H, '#minigame-pick-btn');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 3000);
  await snap(H, '41-lobby-minigame-pick-pc');
  record('★ D 골라 하기 — 손님에게는 버튼이 없다', await G.evaluate("document.querySelector('#minigame-pick-btn') === null"));

  // 케이크
  await pickCard(H, 'cake');
  const pages = [
    ['pc', H],
    ['pc1920-night', N],
    ['m390', G],
    ['fold', F],
  ];
  const snapAll = async (name) => {
    for (const [n, p] of pages) await snap(p, `42-cake-${name}-${n}`);
  };
  await waitPhase(H, 'intro', 8000);
  await sleep(700);
  await snapAll('intro');
  await waitPhase(H, 'rules', 10000);
  await sleep(500);
  await snapAll('rules');
  record('★ E 규칙 안내 — PC 는 Space · Enter / 모바일은 톡', (await H.evaluate("document.querySelector('.mg-rules-ctrl')?.innerText ?? ''")).includes('Space') && (await G.evaluate("document.querySelector('.mg-rules-ctrl')?.innerText ?? ''")).includes('톡'));
  // 1판 — 10초 · 5초 뒤 가림
  await waitPhase(H, 'play', 20000);
  const t0 = Date.now();
  await sleep(2000);
  await snapAll('play-visible');
  record('★★ E 케이크 — 처음엔 숫자가 보인다', (await H.evaluate("document.querySelector('.cake-count')?.dataset.hidden")) === '0');
  await sleep(Math.max(0, 6400 - (Date.now() - t0)));
  await snapAll('play-hidden');
  record('★★★ E 케이크 — 5초 지나면 숫자가 가려진다', (await H.evaluate("document.querySelector('.cake-count')?.dataset.hidden")) === '1' && (await G.evaluate("document.querySelector('.cake-count')?.dataset.hidden")) === '1');
  // 누르기 — H 10.0초 Space · N 9.6초 Enter · G 10.4초 톡 · F 없음
  const pressAt = async (ms, fn) => {
    const wait = ms - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    await fn();
  };
  await pressAt(9600, () => N.key('Enter', { code: 'Enter', vk: 13 }));
  await pressAt(10000, () => H.key(' ', { code: 'Space', vk: 32 }));
  await pressAt(10400, async () => {
    const r = JSON.parse(await G.evaluate("JSON.stringify(document.querySelector('.cake-stage').getBoundingClientRect())"));
    await G.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
    await G.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await sleep(300);
  await snap(H, '42-cake-pressed-pc');
  await waitPhase(H, 'roundResult', 8000);
  await sleep(900);
  await snapAll('roundResult');
  const res1 = await H.evaluate("JSON.stringify([...document.querySelectorAll('.mg-table li')].map((l) => l.innerText.replace(/\\s+/g, ' ')))");
  record('★★ E 케이크 판 결과 — 4명 · 안 누른 사람 꼴찌 "안 누름"', JSON.parse(res1).length === 4 && JSON.parse(res1)[3].includes('안 누름'), res1);
  // 나머지 판은 넘긴다(방장 그만하기 전에 최종 화면을 보려면 끝까지) — 2~4판은 아무도 안 누른다
  await waitPhase(H, 'final', 120000);
  await sleep(800);
  await snapAll('final');
  record('★★ E 최종 결과 — 연습이라 보상 칸 "연습"', (await H.evaluate("[...document.querySelectorAll('.mg-final .mg-reward')].every((e) => e.innerText === '연습')")) === true);
  await waitPhase(H, 'outro', 30000);
  await sleep(300);
  await snap(H, '42-cake-outro-pc');
  await H.waitFor("document.querySelector('.mg-card') === null && document.querySelector('.lobby-card') !== null", 15000);
  record('★★ D 연습이 끝나면 로비로 (모두)', await G.waitFor("document.querySelector('.lobby-card') !== null", 5000));
  const cakeDb = await withPg(async (c) =>
    (
      await c.query(
        `SELECT a.login_id, r.submitted, r.error FROM minigame_results r JOIN accounts a ON a.id = r.account_id
          WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1 AND minigame_key = 'cake') AND r.round_index = 0 ORDER BY a.login_id`,
        [roomId],
      )
    ).rows,
  );
  const errOf = (s) => cakeDb.find((r) => r.login_id.endsWith(`_${s}`))?.error;
  // ★ R097 — R063 (D-261) 부터 처음 1초는 "10.00" 에 멈춘다 → 목표 = (10 + 1)초 = cakeTargetMs(11000). 옛 기대(목표 10초 · 오차 0 · ±0.4)가 낡아
  //   R096 실측 −0.84 · −1.23 · −0.42 를 "오차" 로 보였다 — 사이 간격(−0.39 · +0.42)은 누른 때와 맞았다(서버 판정 정상 · mf 미제출은 일부러 안 누름).
  //   t0 = 검사가 'play' 를 본 때(폴링) — 기기 시작보다 늦을 뿐이라 잰 값은 기대보다 0 ~ 0.35초 크다(한쪽 여유).
  const { CAKE_ROUNDS, cakeTargetMs } = await import('../shared/dist/minigame.js');
  const cakeT = cakeTargetMs(CAKE_ROUNDS[0]) / 1000;
  const near = (e, pressSec) => typeof e === 'number' && e >= pressSec - cakeT - 0.05 && e <= pressSec - cakeT + 0.35;
  record(`★★★ E 케이크 진짜 입력 (D-261 목표 ${cakeT}초) — Space(10.0초) · Enter(9.6초) · 톡(10.4초) 오차가 누른 때와 맞다(폴링 여유 0.35초) · 사이 간격 ±0.15 · 안 누른 사람 미제출`,
    near(errOf('mh'), 10.0) && near(errOf('mn'), 9.6) && near(errOf('mg'), 10.4) &&
      Math.abs(errOf('mn') - errOf('mh') + 0.4) < 0.15 && Math.abs(errOf('mg') - errOf('mh') - 0.4) < 0.15 &&
      cakeDb.find((r) => r.login_id.endsWith('_mf'))?.submitted === false,
    JSON.stringify(cakeDb));

  // 균형
  await realClick(H, '#minigame-pick-btn');
  await H.waitFor("document.querySelector('.mg-cat') !== null", 3000);
  await pickCard(H, 'balance');
  const snapB = async (name) => {
    for (const [n, p] of pages) await snap(p, `43-balance-${name}-${n}`);
  };
  await waitPhase(H, 'rules', 12000);
  await sleep(400);
  await snapB('rules');
  await waitPhase(H, 'play', 20000);
  await sleep(500);
  await snapB('play-start');
  const startH = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('.balance-handle')].map((g) => g.getAttribute('transform')))"));
  // H — 방향키: → 꾹(자동 반복) · ↓ 로 아래 점 · ← 몇 번
  for (let i = 0; i < 12; i += 1) await H.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, autoRepeat: i > 0 });
  await H.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await H.key('ArrowDown', { code: 'ArrowDown', vk: 40 });
  for (let i = 0; i < 6; i += 1) await H.key('ArrowLeft', { code: 'ArrowLeft', vk: 37 });
  await sleep(200);
  const afterH = JSON.parse(await H.evaluate("JSON.stringify([...document.querySelectorAll('.balance-handle')].map((g) => g.getAttribute('transform')))"));
  record('★★ E 균형 PC — → 꾹 누르면 위 점이 오른쪽으로 · ↓ 뒤 ← 는 아래 점이 왼쪽으로', afterH[0] !== startH[0] && afterH[1] !== startH[1], `${JSON.stringify(startH)} → ${JSON.stringify(afterH)}`);
  // N — 마우스로 위 점을 가운데로
  const nr = JSON.parse(await N.evaluate("JSON.stringify((() => { const s = document.querySelector('.balance-svg').getBoundingClientRect(); const h = document.querySelector('.balance-handle .balance-handle-dot').getBoundingClientRect(); return { sx: s.x, sw: s.width, hx: h.x + h.width / 2, hy: h.y + h.height / 2 }; })())"));
  await N.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: nr.hx, y: nr.hy, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) await N.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: nr.hx + ((nr.sx + nr.sw * 0.5 - nr.hx) * i) / 8, y: nr.hy, button: 'left', buttons: 1 });
  await N.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: nr.sx + nr.sw * 0.5, y: nr.hy, button: 'left', clickCount: 1 });
  // G — 손가락으로 아래 점을 가운데로
  const gr = JSON.parse(await G.evaluate("JSON.stringify((() => { const s = document.querySelector('.balance-svg').getBoundingClientRect(); const hs = document.querySelectorAll('.balance-handle .balance-handle-dot'); const h = hs[1].getBoundingClientRect(); return { sx: s.x, sw: s.width, hx: h.x + h.width / 2, hy: h.y + h.height / 2 }; })())"));
  await G.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gr.hx, y: gr.hy }] });
  for (let i = 1; i <= 8; i += 1) await G.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gr.hx + ((gr.sx + gr.sw * 0.5 - gr.hx) * i) / 8, y: gr.hy }] });
  await G.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  await snapB('play-moved');
  await waitPhase(H, 'roundResult', 15000);
  await sleep(1700);
  await snapB('roundResult');
  const thumbs = await H.evaluate("document.querySelectorAll('.mg-thumb').length");
  record('★★ E 균형 판 결과 — 칼 · 두 조각 · "a : b" · 넷의 자른 선 그림', thumbs === 4 && /\d+(\.\d+)? : \d+/.test(await H.evaluate("document.querySelector('.balance-split')?.innerText ?? ''")), `${thumbs} · ${await H.evaluate("document.querySelector('.balance-split')?.innerText ?? ''")}`);
  const balDb = await withPg(async (c) =>
    (
      await c.query(
        `SELECT a.login_id, r.submitted, r.input FROM minigame_results r JOIN accounts a ON a.id = r.account_id
          WHERE r.run_id = (SELECT max(id) FROM minigame_runs WHERE room_id = $1 AND minigame_key = 'balance') AND r.round_index = 0 ORDER BY a.login_id`,
        [roomId],
      )
    ).rows,
  );
  const inp = (s) => balDb.find((r) => r.login_id.endsWith(`_${s}`))?.input;
  record('★★★ E 균형 진짜 입력 — 마우스(위 점) · 손가락(아래 점)을 가운데(≈50)로 옮긴 값이 기록된다', Math.abs((inp('mn')?.top ?? 0) - 50) < 3 && Math.abs((inp('mg')?.bottom ?? 0) - 50) < 3, JSON.stringify(balDb.map((r) => [r.login_id, r.input])));
  // 끝까지 (2 · 3판은 아무도 안 움직인다 — 시작 점 그대로가 마지막 값)
  await waitPhase(H, 'final', 90000);
  await sleep(800);
  await snapB('final');
  await H.waitFor("document.querySelector('.lobby-card') !== null", 40000);
}

// -----------------------------------------------------------------------------
// ★★★ R046 — 나가기 · 끊김 · 옮기기: 사람 동작을 **진짜 클릭**으로 (`npm run ui-check:leave`, verify 에 포함)
//   ★ 이 모드는 자기 서버를 띄울 때 끊김 60초 → 5초 · 방장 이전 30초 → 2초로 줄인다 (값만 다르고 경로는 같다)
// -----------------------------------------------------------------------------
const LEAVE_ONLY = args.includes('--leave');
if (LEAVE_ONLY) {
  process.env.SHOT_DIR ??= 'verify';
  process.env.DISCONNECT_REMOVE_MS ??= '5000';
  process.env.HOST_TRANSFER_GRACE_MS ??= '2000';
}
const chatHas = (page, text) => page.evaluate(`(document.querySelector('.chat-log')?.innerText ?? '').includes(${JSON.stringify(text)})`);
const seatNames = (page) => page.evaluate("[...document.querySelectorAll('.seat-card:not(.empty) .seat-nick')].map((e) => e.textContent.trim()).join(',')");
async function leaveByButton(page) {
  if (await page.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.offsetParent !== null")) await realClick(page, 'button[aria-label="나가기"]');
  else {
    await realClick(page, '#menu-btn');
    await sleep(250);
    await realClick(page, '.menu-item', '나가기');
  }
  await page.waitFor("document.querySelector('.confirm-modal[data-kind=\"leave\"]') !== null", 3000);
  const r = await realClick(page, '.confirm-modal button', '나가기');
  await page.waitFor("document.querySelector('#join-code') !== null", 8000);
  return r.hit;
}
async function createRightAway(page, label) {
  await page.setInput('.card input', `${label} 새 방`);
  await sleep(150);
  await realClick(page, '.card button', '만들기');
  const ok = await page.waitFor("document.querySelector('.stage') !== null", 6000);
  const toast = await page.evaluate("document.querySelector('.toast-code')?.textContent ?? ''");
  record(`★★★ ${label} — 곧바로 새 방 만들기 (진짜 클릭 · "이미 방이 있다" 없음)`, ok && !toast.includes('ALREADY'), toast);
  if (ok) await leaveByButton(page);
}
async function joinByCode(page, code) {
  await realType(page, '#join-code', code);
  return page.waitFor("document.querySelector('.stage') !== null", 8000);
}
async function leaveFlow(browser) {
  const H = await newPage(browser, 'L-host');
  await H.setViewport(1280, 720);
  await signUp(H, 'lh', '방장님');
  const G = await newPage(browser, 'L-guest', true);
  await G.setViewport(1280, 720);
  await signUp(G, 'lg', '손님하나');
  const M = await newPage(browser, 'L-mobile', true);
  await M.setViewport(390, 844);
  await signUp(M, 'lm', '손님모바일');
  const F = await newPage(browser, 'L-friend', true);
  await F.setViewport(1280, 720);
  await signUp(F, 'lf', '친구방장');
  // 친구: 게스트 · 모바일 → 친구방장 (친구방장이 수락)
  await requestFriend(G, loginOf('lf'));
  await requestFriend(M, loginOf('lf'));
  await F.waitFor("(document.querySelector('.home-friends')?.innerText ?? '').includes('받은 신청')", 5000);
  await realClick(F, '.home-friends button', '수락');
  await sleep(800);
  await realClick(F, '.home-friends button', '수락');
  await sleep(800);

  // ── 방장 방 · 둘 입장 (코드)
  const roomId = await createRoom(H, 'R046 나가기 방');
  await realClick(H, '#invite-btn');
  await sleep(300);
  const code = await H.evaluate("(document.querySelector('.invite-code')?.innerText ?? '').replace(/\\D/g, '')");
  await closeTop(H);
  await joinByCode(G, code);
  await joinByCode(M, code);
  await sleep(800);

  // ── [로비 · 게스트 · 나가기]
  record('★★★ 로비 · 게스트 · 나가기 — 버튼 → 확인 → 방 목록 화면', await leaveByButton(G));
  await sleep(500);
  record('★★ 로비 · 게스트 · 나가기 — 참여자 칸에서 바로 빠짐', !(await seatNames(H)).includes('손님하나'), await seatNames(H));
  record('★★ 로비 · 게스트 · 나가기 — 채팅 "손님하나 님이 나갔습니다."', await chatHas(H, '손님하나 님이 나갔습니다.'));
  await createRightAway(G, '로비 나가기 뒤');
  await joinByCode(G, code);
  await sleep(600);

  // ── 게임 시작
  await realClick(H, 'button', '게임 시작');
  await H.waitFor("document.querySelector('.room-game') !== null", 12000);
  await H.waitFor("document.querySelector('.q-text') !== null", 12000);
  await sleep(500);

  // ── [문제 중 · 게스트(모바일 ☰) · 나가기]
  record('★★★ 문제 중 · 게스트(모바일) · ☰ → 나가기 → 확인', await leaveByButton(M));
  await sleep(500);
  record('★★★ 문제 중 · 게스트 · 나가기 — 바로 빠짐 (옛: 접속 종료로 자리 차지)', !(await seatNames(H)).includes('손님모바일'), await seatNames(H));
  record('★★ 문제 중 · 게스트 · 나가기 — 채팅 "나갔습니다"', await chatHas(H, '손님모바일 님이 나갔습니다.'));
  await snap(H, '80-game-guest-left-pc');
  await createRightAway(M, '문제 중 나가기 뒤(모바일)');

  // ── [문제 중 · 게스트 · 정답 → 새로고침(60초 안)] — 점수 그대로
  const qText = await H.evaluate("document.querySelector('.q-text')?.dataset.text ?? ''");
  const ans = (await withPg(async (c) => (await c.query(`SELECT a.answer_text FROM questions q JOIN question_answers a ON a.question_id = q.id WHERE q.question_text = $1 ORDER BY a.is_primary DESC, a.id LIMIT 1`, [qText])).rows))?.[0]?.answer_text;
  if (ans) {
    await realType(G, '.chat-card input', ans);
    await G.key('Enter', { code: 'Enter', vk: 13 });
  }
  const gScore = () => H.evaluate("(() => { const c = [...document.querySelectorAll('.seat-card:not(.empty)')].find((c) => c.innerText.includes('손님하나')); return (c?.querySelector('.seat-score')?.innerText ?? '').trim().match(/(\\d+)$/)?.[1] ?? '' })()");
  await H.waitFor("[...document.querySelectorAll('.seat-card:not(.empty)')].some((c) => c.innerText.includes('손님하나') && /(^|\\D)1$/.test((c.querySelector('.seat-score')?.innerText ?? '').trim()))", 6000);
  const s1 = await gScore();
  record('★ (준비) 손님하나 1점', s1 === '1', s1);
  await G.goto(await G.evaluate('location.href'));
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(800);
  record('★★★ 끊김 → 60초 안 복귀(새로고침) — 자리 · 점수 그대로', (await seatNames(H)).includes('손님하나') && (await gScore()) === '1', `${await seatNames(H)} · ${await gScore()}점`);

  // ── [문제 중 · 게스트 · 끊김 60초 넘김(탭을 떠남)] → 빠짐 · "나갔습니다" → 다시 들어오면 점수 이어서
  await G.goto('about:blank');
  await H.waitFor("![...document.querySelectorAll('.seat-card:not(.empty) .seat-nick')].some((e) => e.textContent.includes('손님하나'))", 12000);
  record('★★★ 끊김 → 60초(테스트 5초) 넘김 — 나간 것과 똑같이 빠짐', !(await seatNames(H)).includes('손님하나'), await seatNames(H));
  record('★★ 60초 빠짐 — 채팅도 "나갔습니다" (나감과 같은 문구)', await chatHas(H, '손님하나 님이 나갔습니다.'));
  await G.goto(`${BASE}/r/${roomId}`);
  await G.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(800);
  record('★★★ 빠진 뒤 같은 게임에 다시 들어오면 점수를 되살린다', (await gScore()) === '1', `${await gScore()}점`);
  record('★★ 채팅 "다시 들어왔습니다. (점수 1점 이어서)"', await chatHas(H, '손님하나 님이 다시 들어왔습니다. (점수 1점 이어서)'));
  await snap(H, '81-rejoin-score-restored-pc');

  // ── [문제 중 · 게스트 · 친구 방으로 옮기기] — 친구 창 [들어가기] → "지금 방을 나가고 들어갈까요?" → 옮기기
  await F.goto(BASE);
  await F.waitFor("document.querySelector('#join-code') !== null", 8000);
  const fRoom = await createRoom(F, '친구 방');
  await sleep(1500);
  await realClick(G, '#friends-btn');
  await G.waitFor("(document.querySelector('.friends-pop')?.innerText ?? '').includes('들어가기')", 5000);
  await realClick(G, '.friends-pop button', '들어가기');
  const sw = await G.waitFor("document.querySelector('.confirm-modal[data-kind=\"switch-room\"]') !== null", 3000);
  await snap(G, '82-move-confirm-pc');
  const r = await realClick(G, '.confirm-modal button', '옮기기');
  const moved = await G.waitFor(`location.pathname === '/r/${fRoom}' && document.querySelector('.stage') !== null`, 8000);
  const err = await G.evaluate("document.querySelector('.toast-code')?.textContent ?? ''");
  record('★★★ 게임 중 친구 방 [들어가기] → 확인 → 옮겨진다 (옛: "이미 방이 있다")', sw && r.hit && moved && !err.includes('ALREADY'), err);
  await sleep(500);
  record('★★ 떠난 방에서 빠짐 · 채팅 "나갔습니다"', !(await seatNames(H)).includes('손님하나') && (await chatHas(H, '손님하나 님이 나갔습니다.')));

  // ── [결과 · 게스트(모바일) · 초대 수락] — 모바일이 방장 방에 다시 들어와 있다가 결과 화면에서 초대 토스트 [수락]
  await joinByCode(M, code);
  await sleep(600);
  await openHostEnd(H);
  await confirmFirst(H);
  await M.waitFor("document.querySelector('.room-result') !== null", 10000);
  await realClick(F, '#friends-btn');
  await F.waitFor("(document.querySelector('.friends-pop')?.innerText ?? '').includes('손님모바일')", 5000);
  await F.evaluate("(() => { const li = [...document.querySelectorAll('.friends-pop li')].find((l) => l.innerText.includes('손님모바일')); [...(li?.querySelectorAll('button') ?? [])].find((b) => b.innerText.trim() === '초대')?.click(); })()");
  const toast = await M.waitFor("document.querySelector('.invite-toast') !== null", 6000);
  await snap(M, '83-result-invite-toast-m390');
  await realClick(M, '.invite-toast button', '수락');
  await M.waitFor("document.querySelector('.confirm-modal[data-kind=\"switch-room\"]') !== null", 3000);
  await realClick(M, '.confirm-modal button', '옮기기');
  const moved2 = await M.waitFor(`location.pathname === '/r/${fRoom}' && document.querySelector('.stage') !== null`, 8000);
  record('★★★ 결과 화면 · 초대 토스트 [수락] → 확인 → 친구 방으로', toast && moved2);
  await sleep(500);
  record('★★ 결과 화면에서 옮김 — 떠난 방 채팅 "나갔습니다"', await chatHas(H, '손님모바일 님이 나갔습니다.'));

  // ── [문제 중 · 방장 · 나가기] — 친구방장이 게임을 시작하고 나간다 → 남은 사람에게 즉시 이전 · 친구방장은 곧바로 새 방
  await closeTop(F);
  await realClick(F, 'button', '게임 시작');
  await F.waitFor("document.querySelector('.room-game') !== null", 12000);
  await sleep(600);
  record('★★★ 문제 중 · 방장 · 나가기 — 버튼 → 확인', await leaveByButton(F));
  const newHost = await G.waitFor("[...document.querySelectorAll('.seat-card.mine .crown, .host-tools')].length > 0 || (document.querySelector('.room-tools')?.innerText ?? '').length > 0 && document.querySelector('.host-tools') !== null", 5000)
    || (await M.waitFor("document.querySelector('.host-tools') !== null", 3000));
  record('★★ 방장이 나가면 남은 사람에게 즉시 방장 (방장 도구가 보인다)', newHost);
  record('★★ 채팅 "친구방장 님이 나갔습니다." · "방장이 되었습니다"', (await chatHas(G, '친구방장 님이 나갔습니다.')) && (await chatHas(G, '방장이 되었습니다')));
  await snap(G, '84-host-left-pc');
  await createRightAway(F, '방장 게임 중 나가기 뒤');

  // ── ★★ R046 D — 방 목록 화면에서 프로필 (로비와 같은 창) → 친구들 화면(친구 목록)에 바로
  await F.setViewport(1280, 720);
  record('★★ D 방 목록 화면에 [프로필] 이 있다', await F.evaluate("document.querySelector('.home-bar #rename-btn') !== null"));
  await realClick(F, '#rename-btn');
  await F.waitFor("document.querySelector('.rename-pop') !== null", 3000);
  await snap(F, '85-home-profile-pc');
  await realType(F, '#rename-input', '새이름친구');
  const rr = await realClick(F, '.rename-pop button', '바꾸기');
  const okMsg = await F.waitFor("(document.querySelector('.rename-pop .rename-msg')?.innerText ?? '').includes('바꿨습니다')", 5000);
  record('★★★ D 방 목록 화면 — [바꾸기] 진짜 클릭 → 바뀜 · 인사도 새 이름', rr.hit && okMsg && (await F.evaluate("document.querySelector('.home-me')?.innerText.includes('새이름친구') ?? false")));
  await realClick(G, '#friends-btn');
  record('★★★ D 친구 화면(친구 목록)에 바로 새 이름', await G.waitFor("(document.querySelector('.friends-pop')?.innerText ?? '').includes('새이름친구')", 5000));
  await closeTop(G);
  await closeTop(F);
  // 방 목록 화면에서 사진 등록 → 인사 옆 사진
  await realClick(F, '#rename-btn');
  await F.waitFor("document.querySelector('.rename-pop') !== null", 3000);
  {
    const doc = await F.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await F.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
    await F.send('DOM.setFileInputFiles', { nodeId, files: [path.join(ROOT, 'docs', 'design', 'pastel-3-reveal.png')] });
  }
  await F.waitFor("document.querySelector('.profile-editor .crop-stage img') !== null", 5000);
  await realClick(F, '.profile-editor button', '등록');
  await F.waitFor("(document.querySelector('.rename-pop .rename-msg')?.innerText ?? '').includes('사진')", 6000);
  await closeTop(F);
  await sleep(500);
  record('★★ D 방 목록 화면 — 사진 등록 → 인사 옆 사진', await F.evaluate("document.querySelector('.home-me img.avatar.photo') !== null"));
  record('★★ D 친구 화면에도 사진', await (async () => { await realClick(G, '#friends-btn'); const ok = await G.waitFor("[...document.querySelectorAll('.friends-pop li')].some((l) => l.innerText.includes('새이름친구') && l.querySelector('img.avatar.photo'))", 5000); await closeTop(G); return ok; })());
  await snap(F, '86-home-after-profile-pc');

  // ── ★ R046 E — 밤 테마 첫 글자: 사람 색이 밝아 흰 글자가 안 읽혔다 → 짙은 글자
  await G.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(300);
  const nightInk = await G.evaluate("(() => { const a = document.querySelector('.seat-card .avatar:not(.photo)'); return a ? getComputedStyle(a).color : '' })()");
  await snap(G, '87-night-initials-pc');
  // ★ R097 — R074 (D-323) 밤 토큰 다크모드화로 첫 글자 색이 #14163a → #121212(바탕과 같은 짙은 색)로 바뀌었다(styles.css R074 블록)
  record('★★ E 밤 테마 — 첫 글자는 짙은 색 (밝은 사람 색 위에서 읽힌다 · D-323 #121212)', nightInk === 'rgb(18, 18, 18)', nightInk);
  await G.evaluate("document.documentElement.dataset.theme = 'pastel'");
}

// -----------------------------------------------------------------------------
// ★★★ R045 A — 이모티콘이 참여자 칸의 글자를 가리지 않는가 (`npm run ui-check -- --emoji`, verify 의 ui-check:social 끝에도 돈다)
//   10명(방장 화면 + 소켓 손님 9명) · 폭 1536 높이 864 → 650 · 1280×720 · 1366×768 · 파스텔 · 밤
//   ★ 칸마다: 이모티콘(그림 + 그 상자)이 닉네임 · 배지 · 경험률 · 점수 · 마지막 말 글자와 겹친 넓이 = 0
// -----------------------------------------------------------------------------
const EMOJI_ONLY = args.includes('--emoji');
if (EMOJI_ONLY) process.env.SHOT_DIR ??= 'verify';
const EMOJI_PROBE = `(() => {
  const out = [];
  for (const card of document.querySelectorAll('.seat-card:not(.empty)')) {
    const pop = card.querySelector('.seat-emoji-pop');
    if (!pop) continue;
    const boxes = [pop, ...pop.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const texts = [...card.querySelectorAll('.seat-nick, .seat-badges .badge, .seat-rate, .seat-score, .seat-rank, .seat-msg, .crown')];
    let worst = 0, who = '';
    for (const t of texts) {
      const b = t.getBoundingClientRect();
      if (b.width === 0) continue;
      for (const a of boxes) {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0.5 && h > 0.5 && w * h > worst) { worst = Math.round(w * h); who = t.className.split(' ')[0]; }
      }
    }
    // ★ 글자 줄이 눌려 잘렸는가 (R045 — 겹침이 아니라 줄 높이가 줄어 바탕이 덮는 모양이었다)
    for (const t of card.querySelectorAll('.seat-nick, .seat-rate, .seat-badges')) {
      const r = t.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.3;
      if (r.height > 0 && (r.height < lh * 0.9 || t.scrollHeight > t.clientHeight + 1)) { worst = Math.max(worst, 1); who = 'clipped:' + t.className.split(' ')[0]; }
    }
    const cr = card.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    out.push({ nick: card.querySelector('.seat-nick')?.textContent?.trim() ?? '?', worst, who, cardH: Math.round(cr.height), popH: Math.round(pr.height), inCard: pr.top >= cr.top - 0.5 && pr.bottom <= cr.bottom + 0.5 });
  }
  return JSON.stringify(out);
})()`;
async function emojiGuests(roomId, n) {
  const { io: ioc } = await import('socket.io-client');
  const socks = [];
  for (let i = 0; i < n; i += 1) {
    const loginId = `${ACCOUNT_PREFIX}_e${i}`.toLowerCase();
    const body = JSON.stringify({ loginId, password: 'uic1234', nickname: `이모${i}손님${STAMP.slice(-2)}` });
    let res = await fetch(`${BASE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (res.status !== 200) res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password: 'uic1234' }) });
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('qw_session=')) ?? '';
    const s = ioc(BASE, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    await new Promise((r) => s.once('connect', r));
    s.emit('room.join', { roomId });
    await new Promise((r) => s.once('room.state', r));
    socks.push(s);
  }
  return socks;
}
async function emojiFlow(browser) {
  const host = await newPage(browser, 'e-host', true); // ★ R097 — 따로 맥락(앞 가입 쿠키면 인증 화면 없음)
  await host.setViewport(1536, 864);
  await signUp(host, 'eh', shotNick(0) ?? '가나다라마바사아자차');
  const roomId = await createRoom(host, '이모티콘 확인');
  const socks = await emojiGuests(roomId, 9);
  await sleep(1200);
  // 손님 몇은 마지막 말이 있게 (말풍선 칸이 있는 경우)
  socks[0].emit('chat.send', { text: '안녕하세요 반가워요', epoch: null });
  // ★ 튀어 오르는 순간도 본다 (0.1 · 0.3 · 0.5초) — 자리 잡은 뒤만 재면 순간 겹침을 못 본다
  for (const theme of ['pastel', 'night']) {
    await host.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    await host.setViewport(1536, 700);
    await sleep(300);
    socks[1].emit('emoji.send', { emojiId: 1 });
    let worstMid = 0;
    for (const t of [100, 200, 200]) {
      await sleep(t);
      const rows = JSON.parse(await host.evaluate(EMOJI_PROBE));
      worstMid = Math.max(worstMid, ...rows.map((r) => r.worst));
      await snap(host, `71-emoji-mid-${theme}-${t}`);
    }
    record(`★★ A ${theme} 1536×700 — 튀어 오르는 순간(0.1~0.5초)에도 글자를 가리지 않는다`, worstMid === 0, `가장 큰 겹침 ${worstMid}px²`);
    await sleep(6000);
  }
  const SIZES = [
    { w: 1536, h: 864 }, { w: 1536, h: 800 }, { w: 1536, h: 730 }, { w: 1536, h: 700 }, { w: 1536, h: 650 },
    { w: 1280, h: 720 }, { w: 1366, h: 768 },
  ];
  for (const theme of ['pastel', 'night']) {
    await host.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    for (const sz of SIZES) {
      await host.setViewport(sz.w, sz.h);
      await sleep(350);
      // 모두 이모티콘 (방장은 진짜 클릭 · 손님은 소켓)
      for (const s of socks) s.emit('emoji.send', { emojiId: 1 });
      await realClick(host, '.emoji-btn');
      await sleep(250);
      await realClick(host, '.emoji-slot');
      await closeTop(host);
      await sleep(1000); // 튀어 오르기(0.65초) 뒤 자리 잡은 모습
      const rows = JSON.parse(await host.evaluate(EMOJI_PROBE));
      const bad = rows.filter((r) => r.worst > 0 || !r.inCard);
      if (sz.h === 864 || sz.h === 650 || sz.w !== 1536) await snap(host, `70-emoji-${theme}-${sz.w}x${sz.h}`);
      record(`★★★ A ${theme} ${sz.w}×${sz.h} — 10명 · 이모티콘이 칸 안 글자를 가리지 않는다 · 칸 밖으로 안 나간다`, rows.length >= 10 && bad.length === 0,
        `${rows.length}칸 · 칸 높이 ${Math.min(...rows.map((r) => r.cardH))}~${Math.max(...rows.map((r) => r.cardH))} · 그림 ${Math.min(...rows.map((r) => r.popH))}px` + (bad.length ? ` · 겹침 ${bad.map((b) => `${b.nick}:${b.who}=${b.worst}${b.inCard ? '' : '·칸밖'}`).join(' ')}` : ''));
      await sleep(5200); // 이모티콘이 사라질 때까지(6초 흐려짐) — 다음 크기에서 새로 띄운다
    }
  }
  await host.evaluate("document.documentElement.dataset.theme = 'pastel'");
  for (const s of socks) s.close();
}

// -----------------------------------------------------------------------------
// ★★★ R045 D — 닉네임 · 프로필 사진: 진짜 클릭 · 진짜 키 입력 (`npm run ui-check -- --profile`, verify 의 ui-check:social 끝에도 돈다)
//   혼자 · 둘 / 방장 · 게스트 / 바꾼 뒤 — 내 화면(참여자 칸 · 프로필 창 · 채팅) · 다른 사람 화면 · 새로고침 뒤 · 다시 로그인 뒤
// -----------------------------------------------------------------------------
const PROFILE_ONLY = args.includes('--profile');
if (PROFILE_ONLY) process.env.SHOT_DIR ??= 'verify';
/** 진짜 키 입력 — 입력칸을 진짜로 누르고 전부 고른 뒤(Ctrl+A) 글자를 넣는다 (IME 를 거치지 않는 insertText) */
async function realType(page, selector, text) {
  await realClick(page, selector);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await page.send('Input.insertText', { text });
  await sleep(200);
}
const seatNicks = (page) => page.evaluate("[...document.querySelectorAll('.seat-card .seat-nick')].map((e) => e.textContent.trim()).join(',')");
async function renameVia(page, next, label) {
  if (!(await page.evaluate("document.querySelector('.rename-pop') !== null"))) {
    // 모바일은 [프로필] 이 ☰ 안에 있다
    if (await page.evaluate("document.querySelector('#rename-btn')?.offsetParent !== null")) await realClick(page, '#rename-btn');
    else {
      await realClick(page, '#menu-btn');
      await sleep(250);
      await realClick(page, '.menu-item', '프로필');
    }
  }
  await page.waitFor("document.querySelector('.rename-pop') !== null", 3000);
  await realType(page, '#rename-input', next);
  const r = await realClick(page, '.rename-pop button', '바꾸기');
  const ok = await page.waitFor("document.querySelector('.rename-pop .rename-msg')?.className.includes('note') ?? false", 5000);
  const msg = await page.evaluate("document.querySelector('.rename-pop .rename-msg')?.innerText ?? '(없음)'");
  record(`★★ D ${label} — [바꾸기] 진짜 클릭 → "바꿨습니다"`, r.hit && ok, `${msg} · hit=${r.hit} ${r.top ?? ''}`);
  return ok;
}
async function profileFlow(browser) {
  const sfx = `${STAMP.slice(-3)}`;
  const host = await newPage(browser, 'p-host', true); // ★ R097 — 따로 맥락(앞 social 'host' 가입 쿠키면 인증 화면 없음)
  await host.setViewport(1280, 720);
  await signUp(host, 'ph', `방장${sfx}`);
  await createRoom(host, '프로필 확인');
  await sleep(600);
  // ── 혼자 로비
  const n1 = `혼자바꿈${sfx}`;
  await renameVia(host, n1, '방장 혼자 로비');
  await sleep(500);
  record('★★★ D 혼자 — 참여자 칸 닉네임이 바뀐다', (await seatNicks(host)).includes(n1), await seatNicks(host));
  record('★★ D 혼자 — 프로필 창 입력칸이 새 닉네임', (await host.evaluate("document.querySelector('#rename-input')?.value ?? ''")) === n1, await host.evaluate("document.querySelector('#rename-input')?.value ?? ''"));
  record('★ D 혼자 — 채팅에 "이름을 바꿨습니다" 한 줄', await host.evaluate(`document.querySelector('.chat-log')?.innerText.includes(${JSON.stringify(`${n1}(으)로 이름을 바꿨습니다`)}) ?? false`));
  await snap(host, '60-rename-alone-pc');
  await closeTop(host);
  // 채팅을 치면 새 이름으로 나간다
  await realType(host, '.chat-card input', '이름 바꾼 뒤 채팅');
  await host.key('Enter', { code: 'Enter', vk: 13 });
  await sleep(500);
  record('★★ D 혼자 — 바꾼 뒤 채팅이 새 이름으로', await host.evaluate(`(() => { const lines = [...document.querySelectorAll('.chat-line')]; const l = lines[lines.length - 1]; return Boolean(l && l.innerText.includes(${JSON.stringify(n1)}) && l.innerText.includes('이름 바꾼 뒤 채팅')); })()`));
  // ★ 한글 입력 그대로 — 조합 중(IME)에 Enter 로 바꾸기 (사람이 실제로 치는 방식)
  {
    await realClick(host, '#rename-btn');
    await host.waitFor("document.querySelector('.rename-pop') !== null", 3000);
    await realType(host, '#rename-input', `엔터${sfx}`);
    await host.send('Input.imeSetComposition', { text: '기', selectionStart: 1, selectionEnd: 1 });
    await sleep(100);
    // 조합 중 Enter — 브라우저는 먼저 조합을 끝낸다(isComposing) → 앱은 이 Enter 를 무시한다 → 사람은 한 번 더 누른다
    await host.key('Enter', { code: 'Enter', vk: 13 });
    await host.send('Input.insertText', { text: '' });
    await sleep(200);
    const afterFirst = await host.evaluate("document.querySelector('.rename-pop .rename-msg')?.innerText ?? ''");
    await host.key('Enter', { code: 'Enter', vk: 13 });
    await sleep(800);
    const val = await host.evaluate("document.querySelector('#rename-input')?.value ?? ''");
    const nicksNow = await seatNicks(host);
    console.log(`  ★ 진단 — IME 조합 중 Enter: 첫 Enter 뒤 안내="${afterFirst}" · 둘째 Enter 뒤 입력칸="${val}" · 참여자 칸="${nicksNow}"`);
    record('★★ D 혼자 — 한글 조합 중 Enter 로도 바뀐다 (Enter 두 번 이내)', nicksNow.includes(`엔터${sfx}`), `${nicksNow} · 입력칸=${val}`);
    await closeTop(host);
  }
  const n1b = (await seatNicks(host)).split(',')[0];
  // ★★★ 바꾼 뒤 — 같은 접속으로 나갔다가 방을 다시 만든다 (새로고침 없이) → 새 방에서도 새 닉네임이어야 한다
  {
    // ★★ R045 B — 혼자(마지막)면: 확인 문구 "방이 사라져요" · 나가면 코드 칸 비움
    await realClick(host, 'button[aria-label="나가기"]');
    await host.waitFor("document.querySelector('.confirm-modal[data-kind=\"leave\"]') !== null", 3000);
    const note = await host.evaluate("document.querySelector('.confirm-modal .confirm-note')?.innerText ?? ''");
    await snap(host, '63-leave-last-pc');
    record('★★ B 마지막 사람 — 나가기 확인 문구 "방이 사라져요"', note.includes('방이 사라져요'), note);
    await realClick(host, '.confirm-modal button', '나가기');
    await host.waitFor("document.querySelector('#join-code') !== null", 8000);
    record('★★ B 마지막 사람 — 나간 뒤 방 코드 칸이 비어 있다', (await host.evaluate("document.querySelector('#join-code')?.value ?? '-'")) === '');
    // ★★ R045 C — 밤 테마 로고 (방 목록 화면) — 크기는 offsetWidth 로 (로고는 기울어 떠 있어 화면 상자 크기가 순간마다 다르다)
    const logoP = await host.evaluate("getComputedStyle(document.querySelector('.brand-mark')).backgroundImage");
    await host.evaluate("document.documentElement.dataset.theme = 'night'");
    await sleep(300);
    const logoN = await host.evaluate("getComputedStyle(document.querySelector('.brand-mark')).backgroundImage");
    const sizeSame = await host.evaluate("(() => { const e = document.querySelector('.brand-mark'); return e.offsetWidth + 'x' + e.offsetHeight; })()");
    await snap(host, '64-logo-night-home-pc');
    await host.setViewport(390, 844);
    await sleep(300);
    await snap(host, '64-logo-night-home-m390');
    await host.setViewport(1280, 720);
    await host.evaluate("document.documentElement.dataset.theme = 'pastel'");
    await sleep(300);
    await snap(host, '64-logo-pastel-home-pc');
    record('★★ C 밤 테마 로고 — 파스텔과 다른 밤 색 (크기 같음)', logoP !== logoN && sizeSame === (await host.evaluate("(() => { const e = document.querySelector('.brand-mark'); return e.offsetWidth + 'x' + e.offsetHeight; })()")), `${sizeSame}`);
    await createRoom(host, '다시 만든 방');
    await sleep(600);
    record('★★★ D 혼자 — 바꾼 뒤 나갔다가 방을 다시 만들어도 새 닉네임 (새로고침 없이)', (await seatNicks(host)).includes(n1b), `${await seatNicks(host)} / 기대 ${n1b}`);
    await snap(host, '60b-rename-then-new-room-pc');
  }
  // 새로고침 뒤
  await host.goto(await host.evaluate('location.href'));
  await host.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(500);
  record('★★ D 혼자 — 새로고침 뒤에도 새 닉네임', (await seatNicks(host)).includes(n1b), await seatNicks(host));

  // ── 둘: 게스트가 들어온다 → 방장이 다시 바꾼다 → 게스트 화면 / 게스트가 바꾼다 → 방장 화면
  const roomPath = await host.evaluate('location.pathname');
  const guest = await newPage(browser, 'p-guest', true);
  await guest.setViewport(390, 844);
  await signUp(guest, 'pg', `손님${sfx}`);
  await guest.goto(`${BASE}${roomPath}`);
  await guest.waitFor("document.querySelector('.stage') !== null", 8000);
  await sleep(600);
  const n2 = `둘째바꿈${sfx}`;
  await renameVia(host, n2, '방장 · 둘');
  await sleep(600);
  record('★★★ D 둘 — 방장이 바꾸면 게스트 화면에도', await guest.evaluate(`document.body.innerText.includes(${JSON.stringify(n2)})`));
  await closeTop(host);
  const g1 = `손님바꿈${sfx}`;
  await renameVia(guest, g1, '게스트(모바일) · 둘');
  await sleep(600);
  record('★★★ D 둘 — 게스트가 바꾸면 방장 화면 참여자 칸에도', (await seatNicks(host)).includes(g1), await seatNicks(host));
  await snap(guest, '61-rename-guest-m390');
  await closeTop(guest);

  // ── 프로필 사진: 등록 → 내 칸 · 다른 사람 칸 · 새로고침 뒤 / 지우기 → 첫 글자
  await realClick(host, '#rename-btn');
  await host.waitFor("document.querySelector('.rename-pop') !== null", 3000);
  {
    const doc = await host.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await host.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
    await host.send('DOM.setFileInputFiles', { nodeId, files: [path.join(ROOT, 'docs', 'design', 'pastel-3-reveal.png')] });
  }
  await host.waitFor("document.querySelector('.profile-editor .crop-stage img') !== null", 5000);
  await sleep(300);
  let r = await realClick(host, '.profile-editor button', '등록');
  const back = await host.waitFor("document.querySelector('.rename-pop .rename-msg')?.innerText.includes('사진') ?? false", 6000);
  record('★★ D 사진 등록 — [등록] 진짜 클릭 → 프로필 창으로 돌아와 "바꿨습니다"', r.hit && back, `hit=${r.hit}`);
  await sleep(800);
  const hostImg = "document.querySelector('.seat-card.mine img.avatar.photo, .seat-card img.avatar.photo') !== null";
  record('★★★ D 사진 — 내 참여자 칸에 사진', await host.evaluate(hostImg));
  record('★★★ D 사진 — 다른 사람(게스트) 화면에도 사진', await guest.waitFor("document.querySelector('img.avatar.photo') !== null", 4000));
  await snap(host, '62-photo-set-pc');
  // ★ R097 — R063 (D-262) 부터 사진 지우기는 사진을 누른 메뉴 안(옆 버튼 없앰) → 사진 → 메뉴 [사진 지우기]
  await realClick(host, '.rename-pop [data-photo-btn]');
  await host.waitFor("document.querySelector('[data-photo-menu]') !== null", 3000);
  r = await realClick(host, '[data-photo-menu] button', '사진 지우기');
  await host.waitFor("document.querySelector('.confirm-modal[data-kind=\"photo-delete\"]') !== null", 3000);
  const r2 = await realClick(host, '.confirm-modal button', '지우기');
  await sleep(1000);
  record('★★ D 사진 지우기 — 진짜 클릭 → 확인 → 내 칸이 첫 글자로', r.hit && r2.hit && (await host.evaluate("document.querySelector('.seat-card img.avatar.photo') === null")), `hit=${r.hit}/${r2.hit}`);
  record('★★ D 사진 지우기 — 다른 사람 화면에서도 첫 글자로', await guest.waitFor("document.querySelector('img.avatar.photo') === null", 4000));

  // ── 다시 로그인 뒤: 방 목록 화면 인사 · 방 칸 모두 새 닉네임
  await closeTop(host);
  // ★★ R045 B — 다른 사람이 남아 있으면: "방 코드 N 으로 다시 들어올 수 있어요" · 코드 칸 채움
  await realClick(host, 'button[aria-label="나가기"]');
  await host.waitFor("document.querySelector('.confirm-modal[data-kind=\"leave\"]') !== null", 3000);
  const note2 = await host.evaluate("document.querySelector('.confirm-modal .confirm-note')?.innerText ?? ''");
  record('★★ B 남은 사람이 있으면 — 확인 문구에 방 코드', /방 코드 \d{6}/.test(note2), note2);
  await realClick(host, '.confirm-modal button', '나가기');
  await host.waitFor("document.querySelector('#join-code') !== null", 8000);
  record('★★ B 남은 사람이 있으면 — 나간 뒤 코드 칸에 그 방 코드', /^\d{6}$/.test(await host.evaluate("document.querySelector('#join-code')?.value ?? ''")));
  record('★★ D 방 목록 화면 — 인사에 새 닉네임', await host.evaluate(`document.querySelector('.home-me')?.innerText.includes(${JSON.stringify(n2)}) ?? false`), await host.evaluate("document.querySelector('.home-me')?.innerText ?? ''"));
  const relog = await newPage(browser, 'p-relog', true);
  await relog.setViewport(1280, 720);
  await relog.goto(BASE);
  await relog.evaluate(`(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const i = [...document.querySelectorAll('form input')];
    set(i[0], ${JSON.stringify(`${ACCOUNT_PREFIX}_ph`)}); set(i[1], 'uic1234');
  })()`);
  await relog.evaluate("document.querySelector('form').requestSubmit()");
  await relog.waitFor("document.querySelector('.home-me') !== null", 8000);
  record('★★ D 다시 로그인 뒤 — 새 닉네임', await relog.evaluate(`document.querySelector('.home-me')?.innerText.includes(${JSON.stringify(n2)}) ?? false`), await relog.evaluate("document.querySelector('.home-me')?.innerText ?? ''"));
}

async function socialFlow(browser) {
  const host = await newPage(browser, 'host');
  await host.setViewport(1280, 720);
  await signUp(host, 'h', shotNick(0));
  const guest = await newPage(browser, 'guest', true);
  await guest.setViewport(390, 844);
  await signUp(guest, 'g', shotNick(1));
  const third = await newPage(browser, 'third', true);
  await third.setViewport(1280, 720);
  await signUp(third, 'x', '셋째친구');
  const fourth = await newPage(browser, 'fourth', true);
  await fourth.setViewport(1280, 720);
  await signUp(fourth, 'y', '넷째');
  const zed = await newPage(browser, 'zed', true);
  await zed.setViewport(1280, 720);
  await signUp(zed, 'z', '다섯째');
  const idRows = await withPg(async (c) => (await c.query(`SELECT id::text, login_id FROM accounts WHERE login_id = ANY($1)`, [['g', 'x', 'y', 'z'].map(loginOf)])).rows);
  const idOf = (sfx) => idRows?.find((r) => r.login_id === loginOf(sfx))?.id ?? '-';
  const row = (sfx) => `li[data-account="${idOf(sfx)}"]`;

  // ── ★★ A-1 — 아이디로 친구 신청: 누름 → 안내가 뜰 때까지 (화면 기준 실측)
  await host.setInput('.friend-add input', loginOf('g'));
  await sleep(150);
  const reqMs = await host.evaluate(`(async () => {
    const b = [...document.querySelectorAll('.friend-add button')].find((b) => b.innerText.trim() === '신청');
    const t0 = performance.now();
    b.click();
    while (!document.querySelector('.friend-msg') && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 5));
    return Math.round(performance.now() - t0);
  })()`);
  record('★★ A-1 — 아이디로 친구 신청: 누름 → "보냈어요" 까지 500ms 이하 (화면 실측)', reqMs <= 500, `${reqMs}ms`);
  await sleep(500);
  await snapSizes(host, '30-home-request-sent', [SHOT_PC[0]]);
  record('★★ A-3 — 🔔 알림 버튼이 없다 (방 목록 화면)', await host.evaluate("document.querySelector('#bell-btn') === null"));

  // ── 받은 쪽(모바일 게스트): 화면 위 알림 한 줄 없음 · 방 목록 친구 칸에서 수락
  await guest.setViewport(390, 844);
  await sleep(700);
  record('★★ A-4 — 친구 신청을 받아도 화면 위 알림 한 줄(토스트)이 뜨지 않는다', await guest.evaluate("document.querySelector('.toast') === null"));
  record('★★ A-4 — 받은 신청은 친구 칸에서 (수락 · 거절)', await guest.evaluate("(document.querySelector('.home-friends')?.innerText ?? '').includes('받은 신청')"));
  await snapSizes(guest, '31-home-incoming', SHOT_MOB);
  await guest.setViewport(390, 844);
  const acc = await realClick(guest, '.home-friends button', '수락');
  record('★ 수락(방 목록 화면) — 진짜 클릭이 버튼에 닿는다', acc.hit, acc.top ?? '');
  record('★★★ 수락 → 친구 목록에 들어온다', await guest.waitFor("(document.querySelector('.home-friends')?.innerText ?? '').includes('친구 1')", 5000));
  await snap(guest, '33-home-accepted-m390');
  // 셋째 · 넷째 → 방장에게 신청 / 다섯째 → 게스트에게 신청 (게스트가 수락)
  await requestFriend(third, loginOf('h'));
  await requestFriend(fourth, loginOf('h'));
  await requestFriend(zed, loginOf('g'));
  await guest.waitFor("(document.querySelector('.home-friends')?.innerText ?? '').includes('받은 신청')", 4000);
  await realClick(guest, '.home-friends button', '수락');
  await sleep(600);
  await snapSizes(host, '35-home-friends', [...SHOT_PC, ...SHOT_MOB]);
  for (const sz of SHOT_PC) {
    await host.setViewport(sz.w, sz.h);
    await sleep(250);
    const m = JSON.parse(await host.evaluate("JSON.stringify({ d: document.documentElement.scrollHeight, v: innerHeight })"));
    record(`★★★ 방 목록 화면(친구 칸 포함) PC ${sz.w}×${sz.h} — 스크롤 없음`, m.d <= m.v, `${m.d}/${m.v}`);
    const wraps = await host.evaluate(LABEL_WRAPS);
    record(`★★ 방 목록 화면 PC ${sz.w}×${sz.h} — 글자 꺾임 0`, wraps.length === 0, wraps.join(' / '));
  }
  for (const sz of SHOT_MOB) {
    await host.setViewport(sz.w, sz.h);
    await sleep(250);
    const inner = await host.evaluate(INNER_SCROLLERS);
    record(`★★ 방 목록 화면 모바일 ${sz.w} — 칸 안 스크롤 없음 (페이지 스크롤 하나)`, inner.length === 0, inner.join(' / '));
  }

  // ── 방: 방장이 만든다 → 게스트 방 목록 화면에 "대기실 · 1명 · 들어가기"
  await host.setViewport(1280, 720);
  const roomId = await createRoom(host, '금요일 퀴즈방');
  await sleep(1600);
  await guest.setViewport(390, 844);
  await snapSizes(guest, '36-home-friend-in-room', [SHOT_MOB[1], SHOT_PC[0]]);
  record('★★★ 실시간 상태 — 친구가 방을 만들면 "대기실 · 1명" + [들어가기]', await guest.evaluate("(() => { const t = document.querySelector('.home-friends')?.innerText ?? ''; return t.includes('대기실 · 1명') && t.includes('들어가기'); })()"));
  await guest.setViewport(390, 844);
  await realClick(guest, '.home-friends button', '들어가기');
  record('★★★ 방 목록 화면 친구 [들어가기] → 그 방', await guest.waitFor("document.querySelector('.stage') !== null", 8000));
  await sleep(800);
  record('★★ A-3 — 🔔 알림 버튼이 없다 (방 안)', await host.evaluate("document.querySelector('#bell-btn') === null"));
  await host.evaluate("document.querySelector('#invite-btn')?.click()");
  await sleep(300);
  const roomCode = await host.evaluate("(document.querySelector('.invite-code')?.innerText ?? '').replace(/\\D/g, '')");
  await closeTop(host);

  // ── ★★★ A-2 — 방 안 친구 창: 버튼 전부 **진짜 클릭** (수락 · 거절 · 신청 · 취소 · 초대 · 삭제)
  await host.setViewport(1280, 720);
  record('★★ A-4 — 친구 버튼 숫자 = 받은 신청 2', (await host.evaluate("document.querySelector('#friends-btn .count-badge')?.innerText ?? ''")) === '2');
  await realClick(host, '#friends-btn');
  record('★ 방 안 친구 창이 열린다 (진짜 클릭)', await host.waitFor("document.querySelector('.friends-pop') !== null", 3000));
  for (const s of SHOT_PC) {
    await host.setViewport(s.w, s.h);
    await sleep(350);
    await snap(host, `37-friends-pop-${s.n}`);
    await probePopup(host, '.friends-pop', `친구 창 PC ${s.w}×${s.h}`);
  }
  await host.setViewport(1280, 720);
  await sleep(300);
  let r = await realClick(host, `.friends-pop ${row('x')} button`, '수락');
  record('★★★ A-2 방 안 [수락] — 버튼에 닿고 친구가 된다', r.hit && (await host.waitFor(`document.querySelector('.friends-pop ${row('x')}')?.innerText.includes('접속 중') ?? false`, 4000)), r.top ?? '');
  r = await realClick(host, `.friends-pop ${row('y')} button`, '거절');
  record('★★★ A-2 방 안 [거절] — 받은 신청에서 빠진다', r.hit && (await host.waitFor(`document.querySelector('.friends-pop ${row('y')}') === null`, 4000)), r.top ?? '');
  await host.setInput('.friends-pop .friend-add input', loginOf('z'));
  await sleep(150);
  r = await realClick(host, '.friends-pop .friend-add button', '신청');
  record('★★★ A-2 방 안 아이디 [신청] — 보낸 신청 줄', r.hit && (await host.waitFor(`(document.querySelector('.friends-pop ${row('z')}')?.innerText ?? '').includes('수락을 기다려요')`, 4000)), r.top ?? '');
  r = await realClick(host, `.friends-pop ${row('z')} button`, '취소');
  record('★★★ A-2 방 안 보낸 신청 [취소] — 줄이 빠진다', r.hit && (await host.waitFor(`document.querySelector('.friends-pop ${row('z')}') === null`, 4000)), r.top ?? '');
  r = await realClick(host, `.friends-pop ${row('x')} button`, '초대');
  record('★★★ A-2 방 안 [초대] — "초대했어요"', r.hit && (await host.waitFor("(document.querySelector('.friends-pop .friend-msg.ok')?.innerText ?? '').includes('초대했어요')", 4000)), r.top ?? '');
  await snap(host, '38-friends-invited-pc');
  record('★ 버튼을 눌러도 친구 창은 열린 채', await host.evaluate("document.querySelector('.friends-pop') !== null"));

  // ── ★★★ A-5 — 초대 토스트 (셋째 — 방 목록 화면): [거절] → 사라짐 · 친구 줄 "나를 초대했어요"
  record('★★★ A-5 — 초대를 받으면 아래 토스트 (수락 · 거절)', await third.waitFor("document.querySelector('.invite-toast') !== null", 5000));
  record('★★ A-5 — 친구 줄에도 "나를 초대했어요" + [들어가기]', await third.evaluate("(document.querySelector('.home-friends')?.innerText ?? '').includes('나를 초대했어요')"));
  record('★ A-5 — 초대 토스트에 ✕', await third.evaluate("document.querySelector('.invite-toast .popup-close') !== null"));
  await snap(third, '40-invite-toast-pc');
  await third.setViewport(390, 844);
  await sleep(350);
  await snap(third, '40-invite-toast-m390');
  await third.setViewport(1280, 720);
  r = await realClick(third, '.invite-toast button', '거절');
  record('★★ A-5 초대 [거절] — 토스트가 닫히고 친구 줄에서도 빠진다', r.hit && (await third.waitFor("document.querySelector('.invite-toast') === null && !(document.querySelector('.home-friends')?.innerText ?? '').includes('나를 초대했어요')", 4000)), r.top ?? '');
  // 다시 초대(20초 간격) → [수락] → 그 방
  await sleep(20500);
  if (!(await host.evaluate("document.querySelector('.friends-pop') !== null"))) await realClick(host, '#friends-btn');
  await realClick(host, `.friends-pop ${row('x')} button`, '초대');
  await third.waitFor("document.querySelector('.invite-toast') !== null", 5000);
  r = await realClick(third, '.invite-toast button', '수락');
  record('★★★ A-5 초대 [수락] → 그 방으로', r.hit && (await third.waitFor("document.querySelector('.stage') !== null", 8000)), r.top ?? '');
  await sleep(800);
  record('★ 초대받은 방에 들어가면 초대는 지워진다 (토스트 없음)', await third.evaluate("document.querySelector('.invite-toast') === null"));
  // [삭제] — 확인 팝업이 친구 창 위에 뜬다 (A-2 원인)
  if (!(await host.evaluate("document.querySelector('.friends-pop') !== null"))) await realClick(host, '#friends-btn');
  r = await realClick(host, `.friends-pop ${row('x')} button[aria-label$="친구 삭제"]`);
  const delUp = await host.waitFor("document.querySelector('.confirm-modal[data-kind=\"friend-delete\"]') !== null", 3000);
  record('★★★ A-2 방 안 [삭제] — 확인 팝업이 뜨고 친구 창은 그대로 (옛 결함: 둘 다 사라졌다)', r.hit && delUp && (await host.evaluate("document.querySelector('.friends-pop') !== null")), r.top ?? '');
  await snap(host, '38b-friend-delete-confirm-pc');
  r = await realClick(host, '.confirm-modal button', '지우기');
  record('★★★ A-2 방 안 삭제 [지우기] — 친구에서 빠진다', r.hit && (await host.waitFor(`document.querySelector('.friends-pop ${row('x')}') === null`, 4000)), r.top ?? '');
  // 바깥을 누르면 친구 창이 닫힌다 (진짜 클릭 — 채팅 기록 칸 가운데)
  await realClickAt(host, 640, 420);
  record('★★ B — 친구 창: 바깥 누르기 = 닫힘', await host.evaluate("document.querySelector('.friends-pop') === null"));

  // ── ★★ B — 팝업 규칙 (방장 PC 로비): ✕ 있음 · 바깥 누르기 닫힘 · Esc 닫힘 · 정보 창은 뒤를 어둡게 하지 않는다
  const POPS = [
    ['.prefs-toggle', '.prefs-pop', '설정'],
    // ★ R067 (D-300) — ⓘ 안내는 PC 에서 ⚙ 창의 탭(같은 창 — 위 줄이 맡는다)
    ['#invite-btn', '.invite-pop', '초대'],
    ['#friends-btn', '.friends-pop', '친구'],
    ['#rename-btn', '.rename-pop', '프로필'],
    ['.emoji-btn', '.emoji-pop', '이모티콘'],
  ];
  for (const [btn, pop, name] of POPS) {
    await realClick(host, btn);
    const up = await host.waitFor(`document.querySelector('${pop}') !== null`, 2000);
    const hasX = await host.evaluate(`document.querySelector('${pop} .popup-close') !== null`);
    // 바깥 = 오른쪽 빈 참여자 칸 (어느 창도 덮지 않는 자리 — 이모티콘 창은 채팅 칸 가운데까지 덮는다)
    await realClickAt(host, 1170, 600);
    const closedOut = await host.evaluate(`document.querySelector('${pop}') === null`);
    await realClick(host, btn);
    await host.waitFor(`document.querySelector('${pop}') !== null`, 2000);
    await host.key('Escape', { code: 'Escape', vk: 27 });
    await sleep(200);
    const closedEsc = await host.evaluate(`document.querySelector('${pop}') === null`);
    record(`★★ B — ${name} 창: ✕ 있음 · 바깥 누르기 닫힘 · Esc 닫힘`, up && hasX && closedOut && closedEsc, `열림=${up} ✕=${hasX} 바깥=${closedOut} Esc=${closedEsc}`);
    if (!closedEsc) await closeTop(host);
  }
  // ── 다른 사람(넷째)을 방에 넣는다 → 셋째(방장 아님) 가 넷째 칸 → 친구 신청만 · ✕ · 바깥 = 닫힘 · 뒤 어둡게
  await fourth.goto(`${BASE}/r/${roomId}`);
  await fourth.waitFor("document.querySelector('.stage') !== null", 8000);
  await third.setViewport(1280, 720);
  await sleep(700);
  // ★ R097 — R063 (D-262) 부터 사람을 누르면 '어떻게 할까요?' 확인 창이 아니라 프로필 카드 하나(.person-card · 버튼 data-act).
  //   옛 기대(.confirm-modal [취소] 없이)가 R063 뒤로 낡아 null.closest 예외로 이 묶음 뒷부분(방장 · C-1 · C-2 …)이 통째로 안 돌았다.
  const actsOf = (pg) => pg.evaluate("[...document.querySelectorAll('.person-card [data-person-acts] button')].map(b => b.dataset.act).join(',')");
  r = await realClick(third, `.seat-card.pickable`);
  await third.waitFor("document.querySelector('.person-card') !== null", 3000);
  await sleep(300);
  const acts = await actsOf(third);
  await snap(third, '42-guest-pick-friend-pc');
  record('★★ B (D-262) — 프로필 카드: 친구 신청만 · ✕ (방장 아님 — 강퇴 · 차단 · 방장 넘기기 없음)', acts === 'friend' && (await third.evaluate("document.querySelector('.person-card .popup-close') !== null")), acts);
  const dim = await third.evaluate("(() => { const b = document.querySelector('.person-card')?.closest('.modal-back'); return b ? getComputedStyle(b).backgroundColor : 'none'; })()");
  record('★★ B — 프로필 카드는 뒤를 어둡게 한다', dim !== 'rgba(0, 0, 0, 0)' && dim !== 'transparent' && dim !== 'none', dim);
  await realClickAt(third, 30, 700);
  await sleep(200);
  record('★★ B — 프로필 카드: 바깥 누르기 = 닫힘', await third.evaluate("document.querySelector('.person-card') === null"));
  // 방장: 넷째 칸 → 친구 신청 · 강퇴 · 차단 · 방장 넘기기 (넷째는 거절당해 친구가 아니다)
  await realClick(host, '.seat-card.pickable');
  await host.waitFor("document.querySelector('.person-card') !== null", 3000);
  await sleep(300);
  await snap(host, '43-host-pick-pc');
  const hacts = await actsOf(host);
  record('★ 방장 프로필 카드 — 방장 넘기기 · 강퇴 · 차단 (친구면 친구 신청은 없다)', ['host', 'kick', 'ban'].every((a) => hacts.split(',').includes(a)), hacts);
  await host.key('Escape', { code: 'Escape', vk: 27 });
  await sleep(200);

  // ── ★★ C-1 — 테마는 색만: 파스텔 ↔ 밤 크기·자리 같음 (방장 PC 로비)
  const geo = () => host.evaluate("JSON.stringify(['.room-head', '.seat-card', '.lobby-card', '.chat-card', '#friends-btn', '.settings'].map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') : '-'; }))");
  await host.evaluate("document.documentElement.dataset.theme = 'pastel'");
  await sleep(250);
  const gPastel = await geo();
  await host.evaluate("document.documentElement.dataset.theme = 'night'");
  await sleep(250);
  const gNight = await geo();
  record('★★ C-1 — 테마를 바꿔도 크기·자리가 같다 (파스텔 ↔ 밤)', gPastel === gNight, `${gPastel} | ${gNight}`);
  await snap(host, '52-night-lobby-pc');
  await host.evaluate("document.documentElement.dataset.theme = 'pastel'");
  record('★ C-1 — 설정 창 테마는 셋 (파스텔 · 밤 · 사무실 — D-322)', await (async () => {
    await realClick(host, '.prefs-toggle');
    const t = await host.evaluate("[...document.querySelectorAll('.prefs-pop .seg')[0]?.querySelectorAll('button') ?? []].map(b => b.innerText.trim()).join(',')");
    await closeTop(host);
    return t === '파스텔,밤,사무실'; // ★ R097 — R074 (D-322) 사무실 테마가 더해져 셋
  })());

  // ── ★★ C-2 — 이모티콘이 경험률 · 닉네임 글자를 가리지 않는다 (1536×864 · 1536×730 로비)
  for (const sz of [SHOT_PC[1], SHOT_PC[2]]) {
    await host.setViewport(sz.w, sz.h);
    await sleep(400);
    await realClick(host, '.emoji-btn');
    await sleep(300);
    await realClick(host, '.emoji-slot');
    await sleep(900);
    const ov = JSON.parse(await host.evaluate(`JSON.stringify((() => {
      const card = document.querySelector('.seat-card.mine') ?? document.querySelector('.seat-card');
      const img = card?.querySelector('.seat-emoji-pop img, .seat-emoji-pop');
      if (!img) return { none: true };
      const a = img.getBoundingClientRect();
      const hit = (sel) => { const t = card.querySelector(sel); if (!t) return 0; const b = t.getBoundingClientRect(); const w = Math.min(a.right, b.right) - Math.max(a.left, b.left); const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0.5 && h > 0.5 ? Math.round(w * h) : 0; };
      return { rate: hit('.seat-rate'), nick: hit('.seat-nick'), badges: hit('.seat-badges') };
    })())`));
    await snap(host, `50-emoji-${sz.n}`);
    record(`★★ C-2 — ${sz.w}×${sz.h} 이모티콘이 경험률 · 닉네임 · 배지 글자를 가리지 않는다`, !ov.none && ov.rate === 0 && ov.nick === 0 && ov.badges === 0, JSON.stringify(ov));
    await closeTop(host);
    await sleep(200);
  }
  // ── ★ C-3 — "문제 수" 줄과 "이번 설정으로 낼 수 있는 문제" 간격 (★ R058 — R057 "방식" 줄이 맨 위라 그 줄은 건너뛴다)
  await host.setViewport(1280, 720);
  await sleep(300);
  const gap = await host.evaluate("(() => { const a = document.querySelector('.settings .set-row:not(.mode-row)'); const b = document.querySelector('.avail-line'); return a && b ? Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) : null; })()");
  await snap(host, '51-avail-gap-pc');
  record('★ C-3 — 문제 수 ↔ 낼 수 있는 문제 간격 4px 이하', gap !== null && gap <= 4, `${gap}px`);
  // ── ★★ C-4 — 안내 창: 한 항목 한 줄 (PC 5 · 모바일 3)
  const INFO_LINES = "(() => [...document.querySelectorAll('.infotip-pop .info-list li, [data-gear-pop] .info-list li')].filter((li) => li.getClientRects().length > 0).map((li) => { const tops = []; const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const rc of rg.getClientRects()) { if (rc.width < 1) continue; if (!tops.some((t) => Math.abs(t - rc.top) < rc.height * 0.5)) tops.push(rc.top); } } return tops.length; }))()";
  for (const s of SHOT_PC) {
    await host.setViewport(s.w, s.h);
    await sleep(300);
    await openGearTab(host, 'info'); // ★ R067 — ⚙ 의 안내 탭
    const lines = await host.evaluate(INFO_LINES);
    const inView = await host.evaluate("(() => { const r = document.querySelector('.infotip-pop, [data-gear-pop]')?.getBoundingClientRect(); return Boolean(r) && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()");
    if (s.n === 'pc' || s.n === 'qhd') await snap(host, `53-info-${s.n}`);
    record(`★★ C-4 — 안내 PC ${s.w}×${s.h}: 줄마다 한 줄 · 화면 안`, lines.length > 0 && lines.every((n) => n === 1) && inView, lines.join(','));
    await closeTop(host);
  }

  // ── 모바일 게스트: ☰ 빨간 점(받은 신청) · 메뉴(알림 없음) · 친구 창 ↔ 👥 참여자 창(뒤 어둡게 안 함) · 설정 · 안내
  await fourth.evaluate("document.querySelector('#friends-btn')?.click()");
  await sleep(300);
  await requestFriendInRoom(fourth, loginOf('g'));
  for (const s of SHOT_MOB) {
    await guest.setViewport(s.w, s.h);
    await sleep(400);
    await guest.evaluate("document.querySelector('.toast button')?.click()");
    await sleep(200);
    await snap(guest, `44-room-dot-${s.n}`);
    record(`★★ A-4 모바일 ${s.w} — 받은 신청이 있으면 ☰ 빨간 점 · 화면 위 알림 한 줄 없음`, await guest.evaluate("document.querySelector('#menu-btn .red-dot') !== null && document.querySelector('.toast') === null"));
    await realClick(guest, '#menu-btn');
    await sleep(300);
    await snap(guest, `45-menu-${s.n}`);
    record(`★ A-3 모바일 ${s.w} — ☰ 안에 알림이 없다 · 친구 숫자 1`, await guest.evaluate("(() => { const items = [...document.querySelectorAll('.menu-item')].map((b) => b.innerText); return !items.some((t) => t.includes('알림')) && items.some((t) => t.includes('친구') && t.includes('1')); })()"));
    const menuBack = await guest.evaluate("getComputedStyle(document.querySelector('.menu-modal').closest('.modal-back')).backgroundColor");
    record(`★★ B 모바일 ${s.w} — 메뉴(정보 창)는 뒤를 어둡게 하지 않는다`, menuBack === 'rgba(0, 0, 0, 0)', menuBack);
    await realClick(guest, '.menu-item:nth-child(2)');
    await sleep(350);
    await snap(guest, `46-cmp-friends-${s.n}`);
    await probePopup(guest, '.friends-pop', `친구 창 모바일 ${s.w}`);
    await realClickAt(guest, 10, s.h - 10);
    record(`★★ B 모바일 ${s.w} — 친구 창 바깥 누르기 = 닫힘`, await guest.evaluate("document.querySelector('.friends-pop') === null"));
    await realClick(guest, '#people-btn');
    await sleep(350);
    await snap(guest, `46-cmp-people-${s.n}`);
    const pBack = await guest.evaluate("getComputedStyle(document.querySelector('.people-modal').closest('.modal-back')).backgroundColor");
    record(`★★ B 모바일 ${s.w} — 참여자 창(정보 창)은 뒤를 어둡게 하지 않는다`, pBack === 'rgba(0, 0, 0, 0)', pBack);
    await realClickAt(guest, 10, s.h - 10);
    record(`★★ B 모바일 ${s.w} — 참여자 창 바깥 누르기 = 닫힘`, await guest.evaluate("document.querySelector('.people-modal') === null"));
    await realClick(guest, '#menu-btn');
    await sleep(250);
    await realClick(guest, '.menu-item', '설정');
    await sleep(350);
    await snap(guest, `47-cmp-prefs-${s.n}`);
    await closeTop(guest);
    await realClick(guest, '#menu-btn');
    await sleep(250);
    await realClick(guest, '.menu-item', '안내');
    await sleep(350);
    const mlines = await guest.evaluate(INFO_LINES);
    const mInView = await guest.evaluate("(() => { const r = document.querySelector('.infotip-pop')?.getBoundingClientRect(); return Boolean(r) && r.top >= 0 && r.bottom <= innerHeight; })()");
    await snap(guest, `53-info-${s.n}`);
    record(`★★ C-4 — 안내 모바일 ${s.w}: 줄마다 한 줄 · 한 화면`, mlines.length > 0 && mlines.every((n) => n === 1) && mInView, mlines.join(','));
    await closeTop(guest);
    await sleep(150);
  }

  // ── ★★★ A-5 — 게임 중에는 초대 토스트를 띄우지 않는다 → 게임이 끝나면 뜬다
  //   다섯째(게스트의 친구)가 자기 방을 만들어 게임 중인 게스트를 초대한다
  await zed.goto(BASE);
  await zed.waitFor("document.querySelector('#join-code') !== null", 8000);
  await createRoom(zed, '다섯째 방');
  await host.setViewport(1280, 720);
  await guest.setViewport(390, 844);
  await host.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '게임 시작')?.click()");
  await guest.waitFor("document.querySelector('.room-game') !== null", 12000);
  await guest.evaluate("document.querySelector('.toast button')?.click()");
  await realClick(zed, '#friends-btn');
  await sleep(300);
  r = await realClick(zed, `.friends-pop button`, '초대');
  await sleep(1200);
  record('★★★ A-5 — 게임 중: 초대 토스트가 뜨지 않는다', await guest.evaluate("document.querySelector('.invite-toast') === null && document.querySelector('.toast') === null"), `초대 클릭=${r.hit}`);
  record('★★ A-5 — 게임 중: ☰ 빨간 점으로만', await guest.evaluate("document.querySelector('#menu-btn .red-dot') !== null"));
  await snap(guest, '47z-game-no-toast-m390');
  // 방장이 게임을 끝낸다 → 결과 화면 → 아직 살아 있는 초대가 토스트로
  await openHostEnd(host);
  await confirmFirst(host);
  await guest.waitFor("document.querySelector('.room-result') !== null", 12000);
  record('★★★ A-5 — 게임이 끝나 결과 화면이 되면 초대 토스트가 뜬다', await guest.waitFor("document.querySelector('.invite-toast') !== null", 5000));
  await snap(guest, '47y-result-invite-toast-m390');
  r = await realClick(guest, '.invite-toast button', '수락');
  record('★★ A-5 — 다른 방에 있을 때 [수락] → "지금 방을 나가고 들어갈까요?"', r.hit && (await guest.waitFor("document.querySelector('.confirm-modal[data-kind=\"switch-room\"]') !== null", 3000)));
  await snap(guest, '47x-switch-confirm-m390');
  await closeTop(guest);
  record('★ ✕ 로 닫으면 방에 그대로', await guest.evaluate("document.querySelector('.confirm-modal') === null && document.querySelector('.stage') !== null"));

  // ── ★★ 나가면 방 코드 칸에 그 방 코드
  await leaveViaUi(guest);
  await guest.waitFor("document.querySelector('#join-code') !== null", 8000);
  const pre = await guest.evaluate("document.querySelector('#join-code')?.value ?? ''");
  record('★★ 나오면 방 코드 칸에 그 방 6자리', /^\d{6}$/.test(pre) && pre === roomCode, `${pre} / ${roomCode}`);
  const sizesX = new Set(xSeen.map((x) => `${x.w}×${x.h}`));
  record('★★ 창마다 ✕ 크기가 같다', xSeen.length > 0 && sizesX.size === 1, [...sizesX].join(' '));
  const pos = new Set(xSeen.map((x) => `${x.dr},${x.dt}`));
  record('★ ✕ 자리(창 오른쪽 위 여백)가 같다', pos.size === 1, [...pos].join(' | '));

  // ── ★★★ 반드시 거쳐야 하는 화면 — 새 비밀번호 (✕ 없음 · 바깥 · Esc 로 안 닫힘)
  const pw = await newPage(browser, 'pw', true);
  await pw.setViewport(1280, 720);
  await signUp(pw, 'p', '비번초기화');
  await withPg((c) => c.query(`UPDATE accounts SET must_change_password = true WHERE login_id = $1`, [loginOf('p')]));
  await pw.goto(BASE);
  await pw.waitFor("document.querySelector('.password-change') !== null", 8000);
  await snapSizes(pw, '48-password-change', [...SHOT_PC, ...SHOT_MOB]);
  await pw.setViewport(1280, 720);
  await realClickAt(pw, 20, 700);
  await pw.key('Escape', { code: 'Escape', vk: 27 });
  await sleep(200);
  record('★★★ 필수 화면 — 새 비밀번호: ✕ 없음 · 바깥 · Esc 로 안 닫힘', await pw.evaluate("document.querySelector('.password-change') !== null && document.querySelector('.password-change .popup-close') === null && document.querySelector('#join-code') === null"));
  await pw.evaluate(`(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const i = [...document.querySelectorAll('.password-change input')];
    set(i[0], '0000'); set(i[1], '0000');
  })()`);
  await clickIn(pw, '.password-change button', '저장하고 시작');
  await sleep(500);
  await snap(pw, '49-password-0000-pc');
  record('★★★ 새 비밀번호로 0000 은 안 된다', await pw.evaluate("(document.querySelector('.password-change .form-error')?.innerText ?? '').includes('0000')"));
  await pw.evaluate(`(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const i = [...document.querySelectorAll('.password-change input')];
    set(i[0], 'newpw77'); set(i[1], 'newpw77');
  })()`);
  await clickIn(pw, '.password-change button', '저장하고 시작');
  record('★★★ 새 비밀번호를 정하면 방 목록 화면', await pw.waitFor("document.querySelector('#join-code') !== null", 6000));
  // 방 코드 6자리 → 바로 입장 · 만들기 즉시 잠금
  await pw.setInput('#join-code', roomCode);
  record('★★★ 방 코드 6자리를 치면 바로 그 방', await pw.waitFor("document.querySelector('.stage') !== null", 8000));
  await leaveViaUi(pw);
  await pw.waitFor("document.querySelector('#join-code') !== null", 8000);
  await pw.setInput('.card input', '로딩 확인');
  const lock = await pw.evaluate("(async () => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '만들기'); b.click(); await new Promise((r) => setTimeout(r, 0)); return b.disabled && b.classList.contains('is-busy'); })()");
  record('★★ 만들기 — 누르는 즉시 잠기고 도는 표시 (연타 막음)', lock);
  await pw.waitFor("document.querySelector('.stage') !== null", 8000);
  // ── ★★★ 반드시 거쳐야 하는 창 — 닉네임 바꿔야 함 (R040): ✕ 없음 · 바깥 · Esc 로 안 닫힘
  await withPg((c) => c.query(`UPDATE accounts SET nickname = $2 WHERE login_id = $1`, [loginOf('p'), `아주아주긴옛닉네임${STAMP.slice(-2)}`]));
  await pw.goto(`${BASE}/r/${await pw.evaluate("location.pathname.slice(3)")}`);
  await pw.waitFor("document.querySelector('.rename-pop') !== null", 8000);
  await realClickAt(pw, 640, 420);
  await pw.key('Escape', { code: 'Escape', vk: 27 });
  await sleep(250);
  await snap(pw, '54-must-rename-pc');
  record('★★★ 필수 창 — 닉네임 바꿔야 함: ✕ 없음 · 바깥 · Esc 로 안 닫힘', await pw.evaluate("document.querySelector('.rename-pop') !== null && document.querySelector('.rename-pop .popup-close') === null"));
}
async function requestFriendInRoom(page, loginId) {
  await page.setInput('.friends-pop .friend-add input', loginId);
  await sleep(150);
  await clickIn(page, '.friends-pop .friend-add button', '신청');
  await sleep(700);
  await page.evaluate("document.querySelector('.friends-pop .popup-close')?.click()");
}

async function shotsFlow(browser) {
  const host = await newPage(browser, 'host');
  await host.setViewport(1280, 720);
  await host.goto(BASE);
  await sleep(800);
  await snapSizes(host, '01-login', [...SHOT_PC, ...SHOT_MOB]);
  await host.click('회원가입');
  await sleep(300);
  await snapSizes(host, '02-signup', [SHOT_PC[0], SHOT_MOB[1]]);
  await host.setViewport(1280, 720);
  await signUp(host, 'h', shotNick(0));
  await sleep(500);
  await snapSizes(host, '03-home', [...SHOT_PC, ...SHOT_MOB]);
  await host.setViewport(1280, 720);
  const roomId = await createRoom(host, '금요일 퀴즈방');
  await sleep(600);
  await snapSizes(host, '04-lobby-host', [...SHOT_PC, ...SHOT_MOB]);

  const guest = await newPage(browser, 'guest', true);
  await guest.setViewport(390, 844);
  await signUp(guest, 'g', shotNick(1));
  await guest.goto(`${BASE}/r/${roomId}`);
  await guest.waitFor("document.querySelector('.stage') !== null", 10000);
  await host.setInput('.chat-card input', '다들 준비됐어?');
  await host.click('전송');
  await guest.setInput('.chat-card input', 'ㅇㅇ 시작하자');
  await guest.click('전송');
  await sleep(600);
  await snapSizes(guest, '05-lobby-guest', [SHOT_MOB[1], SHOT_PC[0]]);
  // ★ 모바일 키보드 — 보이는 높이가 줄어든 상태를 흉내 낸다 (실기기 확인은 13 A29)
  await guest.setViewport(390, 844);
  await guest.evaluate("document.querySelector('.chat-card input')?.focus()");
  await guest.setViewport(390, 470);
  await sleep(500);
  await guest.evaluate("document.querySelector('.chat-card input')?.scrollIntoView({ block: 'end' })");
  await sleep(300);
  await snap(guest, '06-mobile-keyboard-open');
  await guest.evaluate("document.querySelector('.chat-card input')?.blur()");
  await guest.setViewport(390, 844);
  await sleep(700);
  await snap(guest, '07-mobile-keyboard-closed');

  // ── 프로필 편집 (PC 방장 · 모바일 게스트)
  await host.setViewport(1280, 720);
  await host.evaluate("document.querySelector('#rename-btn')?.click()");
  await sleep(300);
  await snap(host, '07b-profile-pop-pc');
  {
    const doc = await host.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await host.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
    await host.send('DOM.setFileInputFiles', { nodeId, files: [path.join(ROOT, 'docs', 'design', 'pastel-3-reveal.png')] });
  }
  await host.waitFor("document.querySelector('.profile-editor .crop-stage img') !== null", 5000);
  await sleep(300);
  await snap(host, '07c-profile-editor-pc');
  await host.evaluate("[...document.querySelectorAll('.profile-editor button')].find(b => b.innerText.trim() === '등록')?.click()");
  await sleep(1200);
  await host.evaluate("document.querySelector('#rename-btn')?.click()");
  await guest.evaluate("document.querySelector('#rename-btn')?.click()");
  await sleep(200);
  {
    const doc = await guest.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await guest.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
    await guest.send('DOM.setFileInputFiles', { nodeId, files: [path.join(ROOT, 'docs', 'design', 'pop-1-lobby.png')] });
  }
  await guest.waitFor("document.querySelector('.profile-editor .crop-stage img') !== null", 5000);
  await sleep(300);
  await snap(guest, '07d-profile-editor-m390');
  await guest.evaluate("[...document.querySelectorAll('.profile-editor button')].find(b => b.innerText.trim() === '등록')?.click()");
  await sleep(1200);
  await guest.evaluate("document.querySelector('#rename-btn')?.click()");
  // ── ★ R041 — 강퇴/차단 (PC 방장 — 참여자 칸을 누른다) · ⓘ 안내 (PC)
  await host.setViewport(1280, 720);
  await host.evaluate("document.querySelectorAll('.seat-card.pickable')[0]?.click()");
  await sleep(300);
  await snap(host, '07n-kick-choose-pc');
  await host.click('강퇴');
  await sleep(300);
  await snap(host, '07o-kick-confirm-pc');
  await closeTop(host);
  await openGearTab(host, 'info'); // ★ R067 — ⚙ 의 안내 탭
  await snap(host, '07p-info-pc');
  // ★ R043 — 초대 팝업 (PC — 설정처럼 버튼 아래 · 모바일 — ☰ → 초대, 화면 가운데)
  await closeTop(host);
  await host.evaluate("document.querySelector('#invite-btn')?.click()");
  await sleep(300);
  await snap(host, '07r-invite-pc');
  await host.evaluate("document.querySelector('.invite-pop .popup-close')?.click()");
  await guest.evaluate("document.querySelector('#menu-btn')?.click()");
  await sleep(250);
  await guest.evaluate("[...document.querySelectorAll('.menu-item')].find(b => b.innerText.includes('초대'))?.click()");
  await sleep(300);
  await snap(guest, '07s-invite-m390');
  await guest.evaluate("document.querySelector('.invite-pop .popup-close')?.click()");
  // ★ R043 — 로비 나가기 확인 팝업
  await host.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
  await sleep(300);
  await snap(host, '07t-leave-lobby-pc');
  await closeTop(host);
  await host.evaluate("document.querySelector('.infotip-close')?.click()");
  await sleep(200);
  // ── 이모티콘 고르기 · 칸에 뜬 순간
  await host.evaluate("document.querySelector('.emoji-btn')?.click()");
  await sleep(600);
  await snap(host, '07e-emoji-picker-pc');
  await host.evaluate("[...document.querySelectorAll('.emoji-tools button')][0]?.click()");
  await sleep(300);
  await snap(host, '07i-emoji-edit-pc');
  await host.evaluate("[...document.querySelectorAll('.emoji-tools button')][0]?.click()");
  await host.key('Escape');
  await guest.evaluate("document.querySelector('.emoji-btn')?.click()");
  await sleep(600);
  await snap(guest, '07f-emoji-picker-m390');
  await guest.key('Escape');
  for (const [sel, name] of [
    ['.prefs-toggle', '07j-pop-prefs-m390'],
    ['.infotip-btn', '07k-pop-info-m390'],
    ['#rename-btn', '07l-pop-profile-m390'],
    ['#people-btn', '07m-people-m390'],
    ['#menu-btn', '07q-menu-m390'],
  ]) {
    await guest.evaluate(`document.querySelector('${sel}')?.click()`);
    await sleep(350);
    await snap(guest, name);
    await guest.evaluate(`document.querySelector('${sel}')?.click()`);
    await sleep(200);
  }
  await guest.evaluate("document.querySelector('.emoji-btn')?.click()");
  await sleep(400);
  await guest.evaluate("document.querySelectorAll('.emoji-pop .emoji-slot')[6]?.click()");
  await guest.key('Escape');
  await host.evaluate("document.querySelector('.chat-card input')?.focus()");
  await host.key('2', { alt: true, code: 'Digit2', vk: 50 });
  await sleep(500);
  await snap(host, '07g-seat-emoji-pc');
  await snap(guest, '07h-emoji-sent-m390');

  await host.setViewport(1280, 720);
  await setQuestionCount(host, 3);
  await host.click('게임 시작');
  await host.waitFor("document.querySelector('.question-card .q-text') !== null", 15000);
  await sleep(500);
  await snap(host, '08-game-locked-pc');
  await snap(guest, '08-game-locked-m390');
  await host.waitFor("document.querySelector('.q-hint-general') !== null", 15000);
  await sleep(300);
  await snap(host, '09-game-hint1-pc');
  await snap(guest, '09-game-hint1-m390');
  await host.waitFor("[...document.querySelectorAll('.q-hint.open')].some(p => !p.classList.contains('q-hint-general'))", 20000);
  await sleep(300);
  await snap(host, '10-game-hint2-pc');
  await snap(guest, '10-game-hint2-m390');
  await guest.evaluate("document.querySelector('.skip-btn')?.click()");
  await sleep(300);
  await snap(host, '11-game-skipvote-pc');
  // 확인창 (방장, PC · 모바일)
  await openHostSkip(host);
  await snap(host, '12-confirm-pc');
  await closeTop(host);
  await sleep(200);
  // ★ R041 — 나가기 팝업 · 모바일 참여자 창(게임 중 — 점수·순위)
  await host.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
  await sleep(300);
  await snap(host, '12b-leave-pc');
  await closeTop(host);
  await guest.evaluate("document.querySelector('#people-btn')?.click()");
  await sleep(350);
  await snap(guest, '12c-people-game-m390');
  await guest.evaluate("document.querySelector('.people-modal .popup-close')?.click()");
  await sleep(200);
  await openHostSkip(host);
  await host.setViewport(390, 844);
  await sleep(400);
  await snap(host, '12-confirm-m390');
  await closeTop(host);
  await host.setViewport(1280, 720);

  // 정답 · 뒷북 · 세레머니
  const text = await host.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
  const ans = await withPg(async (c) =>
    (await c.query(`SELECT a.answer_text FROM questions q JOIN question_answers a ON a.question_id = q.id WHERE q.question_text = $1 ORDER BY a.is_primary DESC, a.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '',
  );
  await host.setInput('.chat-card input', ans);
  await host.click('전송');
  await guest.setInput('.chat-card input', ans);
  await guest.click('전송');
  await host.waitFor("document.querySelector('.reveal') !== null", 5000);
  await host.setInput('.chat-card input', '이걸 몰라? ㅋㅋㅋ');
  await host.click('전송');
  await sleep(900);
  await snap(host, '13-reveal-pc');
  await snap(guest, '13-reveal-m390');
  await probeNicks(host, 'reveal');
  await probeNicks(guest, 'reveal');
  for (const w of [1000, 360]) {
    await host.setViewport(w, w === 360 ? 780 : 720);
    await sleep(300);
    await probeNicks(host, 'reveal');
  }
  await host.setViewport(1280, 720);
  await host.setViewport(1920, 1080);
  await sleep(300);
  await snap(host, '13-reveal-fhd');
  for (const sz of [{ w: 1536, h: 864, n: 'lap' }, { w: 1536, h: 730, n: 'lap2' }, { w: 2560, h: 1440, n: 'qhd' }]) {
    await host.setViewport(sz.w, sz.h);
    await sleep(350);
    await snap(host, `13-reveal-${sz.n}`);
    await probeNicks(host, `reveal ${sz.n}`);
  }
  await host.setViewport(1280, 720);

  // ── 일시정지 — 둘 다 끊겼다가 방장만 돌아온다
  await host.waitFor("document.querySelector('.reveal') === null && document.querySelector('.q-timebar') !== null", 15000);
  await guest.goto('about:blank');
  await sleep(6500); // ★ 게스트 접속 종료 유예(5초)가 지나야 "활성 0명" 이 된다
  await host.goto('about:blank');
  console.log(`[shots] 방장 이동: ${await host.evaluate('location.href')} · 게스트: ${await guest.evaluate('location.href')}`);
  await sleep(7000); // 방장도 유예가 지나야 활성 0명 → PAUSED
  await host.goto(`${BASE}/r/${roomId}`);
  const pausedUp = await host.waitFor("document.querySelector('.paused-card') !== null", 15000);
  console.log(`[shots] 일시정지 화면: ${pausedUp} · 상태=${await host.evaluate("document.querySelector('.room-head .badge, .room-head .state')?.innerText ?? '-'")}`);
  if (!pausedUp) await snap(host, 'zz-debug-pause');
  if (pausedUp) {
    await sleep(400);
    await snap(host, '13b-paused-pc');
    await host.setViewport(390, 844);
    await sleep(400);
    await snap(host, '13b-paused-m390');
    await host.setViewport(1280, 720);
    await host.click('재개');
    await host.waitFor("document.querySelector('.q-timebar') !== null", 8000);
  }

  // 남은 문제는 방장이 넘긴다 → 결과
  for (let i = 0; i < 3; i += 1) {
    if (await host.evaluate("document.querySelector('.result-card') !== null")) break;
    await host.waitFor("document.querySelector('.result-card') !== null || (document.querySelector('.reveal') === null && document.querySelector('.q-timebar') !== null)", 15000);
    if (await host.evaluate("document.querySelector('.result-card') !== null")) break;
    await openHostSkip(host);
    await host.key('Enter');
  }
  await host.waitFor("document.querySelector('.result-card') !== null", 20000);
  await sleep(800);
  await snapSizes(host, '14-result-host', [...SHOT_PC, SHOT_MOB[0], SHOT_MOB[1]]);
  for (const w of [1280, 1000, 360]) {
    await host.setViewport(w, w === 360 ? 780 : 720);
    await sleep(300);
    await probeNicks(host, 'result');
  }
  // 다른 테마도 깨지지 않는지 (결과·게임은 위에서 파스텔)
  for (const th of ['night']) { // ★ R044 — 원색 삭제
    await host.evaluate(`document.documentElement.dataset.theme = '${th}'`);
    await host.setViewport(1280, 720);
    await sleep(300);
    await snap(host, `15-result-${th}-pc`);
  }
  await host.evaluate("document.documentElement.dataset.theme = 'pastel'");
  {
    const other = await newPage(browser, 'other', true);
    await other.setViewport(1280, 720);
    await other.goto(BASE);
    await other.evaluate(`(() => {
      const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const i = [...document.querySelectorAll('form input')];
      set(i[0], ${JSON.stringify(`${ACCOUNT_PREFIX}_h`)});
      set(i[1], 'uic1234');
    })()`);
    await sleep(150);
    await other.evaluate("document.querySelector('form').requestSubmit()");
    const term = await host.waitFor("document.querySelector('.terminated') !== null", 8000);
    if (term) await snapSizes(host, '16-terminated', [SHOT_PC[0], SHOT_MOB[0], SHOT_MOB[1]]);
    await browser.send('Target.closeTarget', { targetId: other.targetId });
    other.close();
  }
  console.log('\n[shots] docs/design/ 에 저장했다');
}

let browserProc = null;
let browser = null;
// ★★ R100 (D · D2) — 어떻게 끝나든 띄운 chrome · 서버를 나무째 끝내고 임시 폴더를 지운다 · 시작 때 앞선 실행의 잔여 폴더를 쓸어 낸다
guardExit({ label: 'ui-check', pids: () => [browserProc?.pid, bootedServer?.pid], dirs: () => tempDirs });
{
  const sw = sweepTemp();
  if (sw.removed || sw.failed) console.log(`[ui-check] 앞선 실행의 임시 폴더 ${sw.removed}개(${sw.mb}MB)를 지웠다${sw.failed ? ` · 잠겨서 못 지움 ${sw.failed}` : ''}`);
}

try {
  // ★ 시작 시 낡은 잔여물을 먼저 쓸어낸다 (R009).
  //   정리는 finally 에서 하지만, 프로세스가 강제 종료(Ctrl+C, 타임아웃)되면
  //   finally 가 돌지 않아 계정이 남는다. 그러면 다음 실행에서 그것을 알 수 없다.
  //   ★ 자기 접두어(uic)로 시작하는 것만 지운다. 사람이 만든 계정은 건드리지 않는다.
  await cleanupAccounts('uic%', '앞선 실행의 잔여 계정');
  await clearUiHints(); // ★ 앞선 실행이 중간에 죽었을 때 남은 테스트 힌트

  await ensureServer();
  await closePreviousBrowser();
  const launched = await launchBrowser();
  browserProc = launched.proc;
  browser = launched.browser;
  globalThis.__uicBrowser = browser;
  // ★★ R028 — 테스트용 일반 힌트는 **브라우저가 뜬 뒤에** 넣는다.
  //   ★ 브라우저를 못 띄우면 skip() 이 process.exit 으로 끝나 되돌릴 기회가 없다 (R028 실측으로 남았다)
  const uiHints = await setUiHints();
  console.log(`[ui-check] 테스트용 일반 힌트 ${uiHints ?? 0}건을 넣었다 (끝나면 되돌린다)`);

  if (SHOTS_ONLY) {
    await shotsFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (SPAM_ONLY) {
    await spamFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (SHOP_ONLY) {
    await shopFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (COPY_ONLY) {
    await copyFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (DEVICES_ONLY) {
    await devicesFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (MINIGAME_ONLY) {
    await minigameFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (LEAVE_ONLY) {
    await leaveFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (EMOJI_ONLY) {
    await emojiFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (PROFILE_ONLY) {
    await profileFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (SOCIAL_ONLY) {
    await socialFlow(browser);
    // ★ R045 — verify 에서는 이어서 돈다. UICHECK_NO_CHAIN=1 이면 친구 흐름만 (나눠 돌릴 때 — 메모리 · 시간)
    if (!process.env.UICHECK_NO_CHAIN) {
      await profileFlow(browser); // ★ R045 D
      await emojiFlow(browser); // ★ R045 A
    }
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (LONG_ONLY) {
    await longFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  if (SOUND_ONLY) {
    await soundFlow(browser);
    throw Object.assign(new Error('shots done'), { shotsDone: true });
  }
  const host = await newPage(browser, 'host');

  // ── 로그인 화면 레이아웃
  if (DO_LAYOUT) {
    console.log('\n[1] 로그인 화면 레이아웃');
    await host.setWidth(390);
    await host.goto(BASE);
    await measureScreen(host, '로그인');
    // ★★ R039 — 방 밖 화면도 PC 여러 해상도에서 스크롤 0 (옛 검사는 방 안 화면만 봤다)
    await measureOneScreen(host, '로그인 화면');
    await host.click('회원가입');
    await sleep(300);
    await measureOneScreen(host, '회원가입 화면');
    await host.click('로그인');
    await host.setWidth(390);
    await host.shot('auth');
  }

  // ── 가입 + 방 생성
  console.log('\n[2] 가입 → 방 생성');
  await host.setWidth(390);
  if (!DO_LAYOUT) await host.goto(BASE);
  await signUp(host, 'h');
  if (DO_LAYOUT) {
    await measureOneScreen(host, '방 목록 화면');
    await measureScreen(host, '방 목록');
    await host.setWidth(390);
  }
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
    // ★ R033 — 3문제를 남긴다. 2번째 문제에서 **정답자 연출**을 보려면 한 문제가 더 필요하다
    const shrunk = await shrinkAvailable(`${ACCOUNT_PREFIX}%`, 3);
    console.log(`  ★ 경험 기록 ${shrunk}행으로 출제 가능 수를 2개로 줄였다`);
    // ★ 참가자 변동이 있어야 서버가 다시 계산한다. 방을 다시 만들어 그 이벤트를 만든다
    await leaveViaUi(host);
    await host.waitFor("document.querySelector('.stage') === null", 8000);
    const roomIdShrunk = await createRoom(host, 'UI 점검용 방 제목 스물여덟글자');
    record('출제 가능 수 축소 후 방 재생성', Boolean(roomIdShrunk));
    await host.waitFor(
      "document.body.innerText.includes('출제 가능') || document.querySelector('.count-input') !== null",
      6000,
    );

    await setQuestionCount(host, 200);
    const warned = await host.waitForText('이대로 시작할 수 없습니다', 4000);
    record('입력 단계 경고가 보인다', warned);

    // ★ 로비 화면도 재어 둔다.
    //   ★★ 지금은 **게이트가 아니다** — 건우 우선순위가 "게임 화면 우선" 이고,
    //     로비는 30초 승부 중이 아니라 스크롤이 조잡함으로 이어지는 정도가 다르다.
    //   ★ 수치는 남긴다. 09-BACKLOG 의 다음 목표가 된다.
    // ── ★★ R025 난이도 선택
    //   ★ 버튼을 실제로 눌러 출제 가능 수 안내가 바뀌는지 본다 (서버 재계산이 화면까지 오는가)
    console.log('\n[4-9] ★★ 난이도 단계 (R069 · 옛 R025)');
    const availText = () =>
      host.evaluate(
        "document.querySelector('.avail-line')?.innerText ?? ''",
      );
    const lvBtns = await host.evaluate(
      "[...document.querySelectorAll('.card button[data-level]')].map(b => b.innerText.trim() + ':' + b.getAttribute('aria-checked')).join(',')",
    );
    record('★★ 난이도 버튼 셋(초급 · 중급 · 고급) · 기본 중급', lvBtns === '초급:false,중급:true,고급:false', lvBtns);
    const beforeAvail = await availText();
    await host.click('초급');
    const changed = await host.waitFor(
      `(document.querySelector('.avail-line')?.innerText ?? '') !== ${JSON.stringify(beforeAvail)}`,
      6000,
    );
    // ★ R074 (§F ②) — 검사 DB 는 초급 출제 가능 수가 중급과 같을 수 있다(문항 3개 — R073 3절) → "바뀜" 또는 "초급이 눌리고 수 안내가 있음"
    const afterAvail = await availText();
    const begOn = await host.evaluate("document.querySelector('.card button[data-level=\"beginner\"]')?.getAttribute('aria-checked') === 'true'");
    record('★★ 초급으로 바꾸면 출제 가능 수 안내가 다시 계산된다(1~3 등급 · 같은 수일 수 있음)', changed || (begOn && /\d/.test(afterAvail)), `${beforeAvail} → ${afterAvail} · 초급 ${begOn}`);
    // 원래대로 (뒤 검사가 중급 기준이다)
    await host.click('중급');
    await host.waitFor("document.querySelector('.card button[data-level=\"intermediate\"]')?.getAttribute('aria-checked') === 'true'", 4000);
    await sleep(800);

    // ── ★★ R034 분야 선택 — 출제 가능 수가 난이도 × 분야로 다시 계산되는가
    console.log('\n[4-9b] ★★ 분야 선택 (R034)');
    const topicStates = () =>
      host.evaluate("[...document.querySelectorAll('.card button[data-topic]')].map(b => b.getAttribute('aria-pressed')).join(',')");
    const t0 = await topicStates();
    record('★★ 분야 버튼 일곱 개가 있고 기본은 전부 켜짐', t0 === 'true,true,true,true,true,true,true', t0);
    // ★ 지금 출제 가능한 문제(방장 미경험 앞 3문제) 중 첫 문제의 분야를 끈다 — 그래야 수가 반드시 바뀐다
    const firstTopic = await withPg(async (c) => {
      const r = await c.query(
        `SELECT t.game_topic FROM questions q JOIN category_game_topics t ON t.category_id = q.category_id
          WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'
          ORDER BY q.id LIMIT 1`,
      );
      return r.rows[0]?.game_topic ?? null;
    });
    const beforeTopic = await availText();
    await host.evaluate(`document.querySelector('.card button[data-topic="${firstTopic}"]')?.click()`);
    const topicChanged = await host.waitFor(
      `(document.querySelector('.avail-line')?.innerText ?? '') !== ${JSON.stringify(beforeTopic)}`,
      6000,
    );
    record(
      `★★ 분야(${firstTopic})를 끄면 출제 가능 수가 다시 계산된다 (난이도 × 분야 같은 조건)`,
      topicChanged,
      `${beforeTopic} → ${await availText()}`,
    );
    await host.click('전체');
    record(
      '★ "전체" 를 누르면 분야가 모두 켜진다',
      await host.waitFor(
        "[...document.querySelectorAll('.card button[data-topic]')].every(b => b.getAttribute('aria-pressed') === 'true')",
        4000,
      ),
    );
    await host.waitFor(
      `(document.querySelector('.avail-line')?.innerText ?? '') === ${JSON.stringify(beforeTopic)}`,
      6000,
    );

    // ── ★★ R034 단축키 Alt+T / Alt+M · 계정 저장
    console.log('\n[4-9c] ★★ 테마 · 소리 · 설정 계정 저장 (R034) — ★ R043: Alt+T · Alt+M 단축키는 껐다');
    const themeBefore = await host.evaluate('document.documentElement.dataset.theme || "pastel"');
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('t', { alt: true });
    record('★ R043 A-9 — Alt+T 는 더 이상 테마를 바꾸지 않는다 (비활성)', (await host.evaluate('document.documentElement.dataset.theme || "pastel"')) === themeBefore);
    // ⚙ 설정 창에서 바꾼다
    await host.evaluate("document.querySelector('.prefs-toggle')?.click()");
    await sleep(250);
    await host.evaluate("[...document.querySelectorAll('.prefs-pop .seg button')].find(b => !b.classList.contains('on') && b.getAttribute('aria-pressed') !== 'true')?.click()");
    await sleep(200);
    const themeAfter = await host.evaluate('document.documentElement.dataset.theme || "pastel"');
    record('★★ ⚙ 설정 창에서 테마가 바뀐다', themeAfter !== themeBefore, `${themeBefore} → ${themeAfter}`);
    const bgmBox = "[...document.querySelectorAll('.prefs-pop input[type=checkbox]')][0]";
    await host.evaluate(`${bgmBox}?.click()`);
    const muted = await host.evaluate("JSON.parse(localStorage.getItem('qw.sound.v1') || '{}')");
    record('★★ ⚙ 설정 창에서 배경음악을 끈다', muted.bgmOn === false, JSON.stringify(muted));
    await host.evaluate(`${bgmBox}?.click()`);
    await host.evaluate("document.querySelector('.prefs-pop .popup-close')?.click()");
    await sleep(1200); // ★ 계정 저장은 0.6초 모아서 한 번
    const savedPrefs = await host.evaluate("fetch('/api/auth/prefs').then(r => r.json())");
    record(
      '★★ 바꾼 테마·소리가 계정에 저장된다',
      savedPrefs?.prefs?.theme === themeAfter && savedPrefs?.prefs?.bgmOn === true,
      JSON.stringify(savedPrefs?.prefs ?? savedPrefs),
    );
    globalThis.__uicSavedTheme = themeAfter;

    const noWrap = await host.evaluate(`(() => {
      const bs = [...document.querySelectorAll('.card button[aria-pressed]')];
      return bs.every(b => { const r = document.createRange(); r.selectNodeContents(b);
        return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size <= 1; });
    })()`);
    record('★ 난이도 버튼 라벨이 쪼개지지 않는다 (D-022)', noWrap);

    // ★★ R033 — 로비도 **게이트**가 되었다 (2.54 → 1.55 → 1.71 → ★ 1.00배).
    //   ★ 세로 칸 두 개(설정·시작 | 초대·참가자)로 다시 짜고 참가자 목록을 고정 높이로 가뒀다.
    //   ★ 이 시점의 로비는 "출제 가능 수 부족" 경고가 두 줄로 떠 있다 — 긴 쪽에서 잰다
    await measureOneScreen(host, '로비 화면', { shotName: '1-lobby' });
    await host.setWidth(720);
    await sleep(250);

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
    // ★ R035 — 로비가 작아져 720px 에서는 거의 스크롤이 없다. 더 좁은 폭(360px)에서 잰다
    await host.setViewport(360, 420);
    await sleep(300);
    const scrolled = await host.scrollToBottom();
    record(
      '페이지가 스크롤된다 (검사 전제)',
      // ★ R038 — 모바일에서 참여자 칸을 숨겨 화면이 짧아졌다. 스크롤되기만 하면 전제가 선다
      scrolled.y > 20,
      `y=${scrolled.y} / max=${scrolled.max}`,
    );

    // ★ R044 진단 — 가만히 있는 로비에서 App 이 3초 동안 몇 번 다시 그려지나 (참고값)
    {
      const r0 = await host.evaluate('window.__qwAppRenders ?? 0');
      await sleep(3000);
      const r1 = await host.evaluate('window.__qwAppRenders ?? 0');
      console.log(`  ★ 진단 — 가만히 있는 로비 3초 동안 App 렌더 ${r1 - r0}번`);
    }
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
    const rr0 = await host.evaluate('window.__qwAppRenders ?? 0');
    await sleep(3000);
    console.log(`  ★ 진단 — 알림이 떠 있는 3초 동안 App 렌더 ${(await host.evaluate('window.__qwAppRenders ?? 0')) - rr0}번`);
    const goneByItself = await host.waitFor(
      "document.querySelector('.toast') === null",
      12000,
    );
    record('★ 알림이 자동으로 사라진다', goneByItself);
    await host.setWidth(720);

    console.log('\n[5] ★★ Phase 3 — 문제 화면이 실제로 나온다 (R014)');
    await setQuestionCount(host, 3);
    const cleared = await host.waitFor(
      "!document.body.innerText.includes('이대로 시작할 수 없습니다')",
      4000,
    );
    record('경고가 사라진다', cleared);
    await host.click('게임 시작');
    // ★★ 문제 화면이 실제로 그려지는지 본다. DOM 존재가 아니라 화면 좌표로 잰다
    // ★ R033 (Q-11 개정) — 시작은 항상 5초 카운트다운이다. 그만큼 더 기다린다
    const qShown = await host.waitFor(
      "document.querySelector('.question-card .q-text') !== null",
      14000,
    );
    record('★★ 5초 카운트다운 뒤 문제 화면이 나온다', qShown);

    // ★ 문제 시작 시 스크롤이 문제 카드로 이동한다. 레이아웃이 정착할 시간을 준다
    await sleep(400);
    const qText = await host.onScreen('.question-card .q-text');
    record(
      '★★ 문제 지문이 화면에 보인다 (좌표 기준)',
      qText.exists && qText.fullyVisible,
      qText.exists ? `top=${qText.rect?.top} bottom=${qText.rect?.bottom}` : 'DOM 에 없다',
    );
    const qLen = await host.evaluate(
      "document.querySelector('.question-card .q-text')?.dataset.text.length ?? 0",
    );
    record('★ 지문이 비어 있지 않다', qLen > 5, `${qLen}자`);

    // ★★ R039 — 힌트 두 자리가 처음부터 잠긴 칸으로 보인다 (🔒 + 열리는 시점)
    record(
      '★★ R039 — 문제 시작 때 힌트 두 칸이 잠긴 채로 자리를 잡고 있다',
      // ★ R042 — 자물쇠는 이제 선 아이콘(svg)이다 (🔒 글자 아님)
      await host.evaluate("document.querySelectorAll('.question-card .q-hint.locked').length === 2 && document.querySelector('.question-card .q-hint.locked svg.lucide-lock') !== null"),
    );
    // ★★ R039 — 폰트 통일: 버튼·입력칸·본문이 모두 Pretendard (폼 요소가 시스템 글꼴을 쓰던 결함)
    const fonts = JSON.parse(await host.evaluate(`JSON.stringify({
      body: getComputedStyle(document.body).fontFamily,
      button: getComputedStyle(document.querySelector('.skip-btn') ?? document.body).fontFamily,
      input: getComputedStyle(document.querySelector('.chat-card input')).fontFamily,
      loaded: document.fonts.check('16px "Pretendard Variable"') })`));
    record(
      '★★ R039 — 본문·버튼·입력칸 글꼴이 모두 Pretendard (내려받은 글꼴)',
      [fonts.body, fonts.button, fonts.input].every((f) => /Pretendard/.test(f)) && fonts.loaded,
      JSON.stringify(fonts),
    );
    // ★★ R038 — 시간 막대가 남은 시간에 비례하는가 (문제 시간 40초 기준)
    const barCheck = JSON.parse(await host.evaluate(`JSON.stringify({
      ratio: Number(document.querySelector('.q-timebar-fill')?.dataset.ratio ?? -1),
      sec: parseInt(document.querySelector('.q-timer')?.innerText ?? '-1', 10) })`));
    record(
      '★★ R038 — 시간 막대 = 남은 시간 ÷ 40초 (1초 오차 안)',
      barCheck.ratio >= 0 && Math.abs(barCheck.ratio * 40 - barCheck.sec) <= 1.2,
      JSON.stringify(barCheck),
    );
    record('★ 채팅 입력 최대 길이 300자 (R038)', (await host.evaluate("document.querySelector('.chat-card input')?.maxLength")) === 300);
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
      /^\d+\s*\/\s*\d+$/.test((await host.evaluate("document.querySelector('.q-progress')?.innerText ?? ''")).trim()),
    );
    record(
      '★ 카테고리 배지가 있다 (대분류)',
      await host.evaluate("document.querySelector('.badge.cat') !== null"),
    );
    record(
      '★ 참여자 칸에 점수가 있다 (R034 — 점수판을 참여자 칸으로 옮겼다)',
      await host.evaluate("document.querySelector('.seat-card .seat-score') !== null"),
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
      (await host.evaluate("document.querySelector('.lobby-card')")) === null,
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
    const skipBtn = await host.buttonState('방장');
    record('★ 방장에게 "방장 넘기기" 버튼이 있다', skipBtn.exists && skipBtn.visible, JSON.stringify(skipBtn));

    // ★ 확인창이 방향키·Enter·마우스로 조작 가능해야 한다 (guide 23절).
    //   ★ autoFocus 로 Enter 가 바로 먹는지 본다
    await host.click('방장');
    await sleep(300);
    record(
      '★ 확인창이 나타난다',
      await host.evaluate("document.querySelector('.confirm-modal') !== null"),
    );
    record(
      '★★ 확인 팝업의 "넘기기" 에 포커스가 있다 (Enter 로 조작 가능)',
      await host.evaluate("document.activeElement?.innerText === '넘기기'"),
      await host.evaluate("document.activeElement?.innerText ?? '(없음)'"),
    );
    // ★ 취소로 닫는다. 여기서 문제를 넘기면 이후 검사가 흐트러진다
    await closeTop(host);
    await sleep(250);
    record(
      '★ 취소로 확인 팝업이 닫힌다',
      (await host.evaluate("document.querySelector('.confirm-modal')")) === null,
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
    // ★★ 폭을 줄이면 문서가 길어지므로, 직전 스크롤 위치가 남아 있으면 문제 카드가
    //   화면 위로 밀려 나간다. ★ 그것은 레이아웃 결함이 아니라 스크롤 위치 문제다.
    //   ★ 그래서 맨 위로 올린 뒤 잰다. "지문이 화면 안에 들어오는가" 가 이 검사의 뜻이다.
    //   ★★ 진짜 문제는 **화면 하나에 다 들어오지 않는다**는 것이고,
    //     그것은 건우 지시로 09-BACKLOG(Phase 7) 에 올렸다. 여기서 고칠 것이 아니다.
    await host.evaluate('window.scrollTo(0, 0)');
    await sleep(200);
    const noOverflow = await host.evaluate(
      "document.documentElement.scrollWidth <= window.innerWidth + 1",
    );
    record(
      '★★ 320px 에서 가로 넘침이 없다',
      noOverflow,
      `scrollWidth=${await host.evaluate('document.documentElement.scrollWidth')} / innerWidth=${await host.evaluate('window.innerWidth')}`,
    );
    const inner320 = await host.evaluate(INNER_SCROLLERS);
    record('★★ R035 — 320px 게임 화면도 칸 안 스크롤 0 (화면 스크롤 하나만)', inner320.length === 0, inner320.join(' / '));
    const qText320 = await host.onScreen('.question-card .q-text');
    record(
      '★ 320px 에서도 문제 지문이 보인다',
      qText320.exists && qText320.rect?.top >= 0,
      qText320.exists ? `top=${qText320.rect?.top}` : 'DOM 에 없다',
    );
    await host.shot('question-320');
    // ★ 09-BACKLOG "스크롤 없이 한 화면" 의 근거 실측값을 남긴다 (지금 고치지 않는다)
    const h320 = await host.evaluate(
      "JSON.stringify({ doc: document.documentElement.scrollHeight, view: window.innerHeight })",
    );
    console.log(`  ★ 320px 문제 화면 높이: ${h320} (스크롤 없이 한 화면 = 09-BACKLOG Phase 7)`);
    await host.setWidth(720);
    await sleep(300);
    const h720 = await host.evaluate(
      "JSON.stringify({ doc: document.documentElement.scrollHeight, view: window.innerHeight })",
    );
    console.log(`  ★ 720px 문제 화면 높이: ${h720}`);

    // ─────────────────────────────────────────────────────────────────────────
    // ★★ Q-83 / Q-56 — 정수 타이머와 단축키 (R015)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[5-3b] ★★★ 한 화면 검사 — 게임 화면');
    // ★★ R028 — 일반 힌트가 보이는 상태에서 잰다 (가장 긴 경우)
    const genShown = await host.waitFor(
      "document.querySelector('.question-card .q-hint-general') !== null",
      25000,
    );
    record('★★ 남은 30초에 일반 힌트가 화면에 나온다 (R034 — 40초 문제)', genShown);
    if (genShown) {
      record(
        '★ 일반 힌트는 초성보다 먼저 나온다 (그 순간 초성 줄이 없다)',
        await host.evaluate(
          "[...document.querySelectorAll('.question-card .q-hint.open')].filter(p => !p.classList.contains('q-hint-general')).length === 0",
        ),
      );
    }
    // ★ R035 — 문제 시간(40초) 안에서 재야 하므로 여기서는 1280×720 만. 여러 해상도는 '힌트 두 줄' 화면에서 잰다
    await measureOneScreen(host, '게임 화면 (일반 힌트 표시 중)', { sizes: [ONE_SCREEN] });
    // ★★ R035 — 문장마다 줄을 바꾸고, 문장 한 줄이 칸을 넘지 않는다 (줄여도 넘치는 아주 긴 문장만 예외)
    const lineFit = await host.evaluate(`(() => {
      const box = document.querySelector('.question-card .q-text');
      if (!box) return { ok: false, why: 'no q-text' };
      const lines = [...box.querySelectorAll('.q-line')];
      const wrap = box.dataset.wrap === '1';
      const over = lines.filter(l => l.scrollWidth > box.clientWidth + 1).length;
      return { ok: lines.length > 0 && (wrap || over === 0), lines: lines.length, wrap, over, px: getComputedStyle(box).fontSize };
    })()`);
    record('★★ R035 — 문제 지문: 문장마다 한 줄 (넘치면 글자를 줄인다)', lineFit.ok, JSON.stringify(lineFit));
    record(
      '★ 게임 화면에 이 판의 난이도가 보인다 (R025)',
      (await host.evaluate("document.querySelector('.question-card .badge.diff')?.innerText ?? ''")).includes('난이도'),
    );
    // ★ 핵심 정보가 실제로 화면 안에 있는지도 좌표로 확인한다.
    //   ★★ "문서가 짧다" 와 "중요한 것이 보인다" 는 다른 말이다 (R009 교훈)
    for (const [name, sel] of [
      ['문제 지문', '.question-card .q-text'],
      ['남은 시간', '.q-timer'],
      ['채팅 입력창', '.chat-card input'],
    ]) {
      const on = await host.onScreen(sel);
      record(
        `★★ 한 화면에서 ${name}이(가) 보인다`,
        on.exists && on.fullyVisible,
        JSON.stringify(on.rect ?? on),
      );
    }
    await host.shot('one-screen-game');
    await host.setWidth(720);
    await sleep(250);

    console.log('\n[5-4] ★★ Q-83 정수 타이머 / Q-56 단축키');

    // ── Q-83 소수점이 보이지 않는다
    const timerText = await host.evaluate(
      "document.querySelector('.q-timer')?.innerText ?? ''",
    );
    record(
      '★★ Q-83 — 남은 시간이 정수 초다 (소수점이 없다)',
      /^\d+초$/.test(timerText.trim()),
      `표시="${timerText.trim()}"`,
    );

    // ── ★★ R043 A-9 (건우) — 단축키는 넘기기(Alt+S · F2)와 이모티콘(Alt+1~0)만. 목록 창·여는 버튼·설명은 없앴다
    record('★★ R043 — 단축키 목록 버튼이 없다', await host.evaluate("document.querySelector('.keybar-btn') === null && document.querySelector('.keylist') === null"));
    record(
      '★★ R039 — 버튼에 단축키 표기가 없다',
      (await host.evaluate("document.querySelectorAll('.room button kbd').length")) === 0,
    );

    // ── ★★★ 단독 문자키는 단축키로 먹지 않는다 (채팅 입력을 방해하지 않는다)
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('g', { text: true });
    const typed = await host.evaluate(
      "document.querySelector('.chat-card input')?.value ?? ''",
    );
    record(
      '★★★ 단독 문자키는 그대로 입력된다 (단축키로 가로채지 않는다)',
      typed === 'g',
      `입력창="${typed}"`,
    );
    // ★ 꺼진 단축키는 아무 일도 하지 않는다 (Alt+G 목록 · F9 · Alt+K 방장 넘기기 · Alt+Q 종료)
    await host.key('g', { alt: true });
    await host.key('F9');
    await host.key('k', { alt: true });
    await host.key('q', { alt: true });
    await sleep(200);
    record(
      '★★ R043 — 꺼진 단축키(Alt+G · F9 · Alt+K · Alt+Q)는 아무 창도 열지 않는다',
      await host.evaluate("document.querySelector('.keylist') === null && document.querySelector('.confirm-modal') === null"),
    );
    // 입력창을 비워 둔다 (다음 검사에 영향을 주지 않게)
    await host.setInput('.chat-card input', '');

    // ── ★ Esc 로 입력창으로 돌아온다 (마우스 없이 돌아가야 한다)
    await host.evaluate("document.activeElement?.blur()");
    await host.key('Escape');
    const focusBack = await host.activeEl();
    record(
      '★★ Esc 를 누르면 포커스가 채팅 입력으로 돌아온다',
      Boolean(focusBack?.inChatCard) && focusBack?.tag === 'INPUT',
      JSON.stringify(focusBack),
    );

    // ── ★★ 방장 넘기기 버튼 → 확인 팝업 + Enter 만으로 확정된다 (R043: 단축키 Alt+K · F4 는 껐다)
    await openHostSkip(host);
    const skipConfirm = await host.evaluate("document.querySelector('.confirm-modal') !== null");
    record('★★ 방장 넘기기 버튼이 확인 팝업을 띄운다', skipConfirm);
    const confirmFocus = await host.activeEl();
    record(
      '★★ 확인창이 열리면 포커스가 확인창 안으로 이동한다',
      confirmFocus?.tag === 'BUTTON',
      JSON.stringify(confirmFocus),
    );
    const qTextBefore = await host.evaluate(
      "document.querySelector('.question-card .q-text')?.dataset.text ?? ''",
    );
    await host.key('Enter');
    record(
      '★★★ Enter 만으로 확인창이 확정된다 (마우스 없이)',
      await host.waitFor("document.querySelector('.confirm-modal') === null", 4000),
    );
    {
      // ★ R040 C-3 — 모바일 폭이면 정답 공개(넘기기)에서 키보드를 내린다(포커스 해제)였다 → ★ R075 (D-325) 판 중(공개 포함)에는 내리지 않는다 — 두 폭 모두 채팅 입력으로
      const narrow = (await host.evaluate('innerWidth')) < 1000;
      const ae = await host.activeEl();
      record(
        narrow ? '★ 확정 뒤 — 모바일 폭도 정답 공개에서 키보드를 내리지 않는다 (R075 D-325 · 채팅 입력 그대로)' : '★ 확정 뒤 포커스가 채팅 입력으로 돌아온다',
        Boolean(ae?.inChatCard),
        JSON.stringify(ae),
      );
    }
    record(
      '★★ 넘기기가 실제로 실행됐다 (정답 공개 화면으로 바뀐다)',
      await host.waitForText('정답', 6000),
    );
    // 다음 문제를 기다린다
    await host.waitFor(
      `document.querySelector('.question-card .q-text') !== null &&
       document.querySelector('.question-card .q-text').dataset.text !== ${JSON.stringify(qTextBefore)}`,
      16000,
    );

    if (await host.evaluate(`document.querySelector('.question-card .q-text')?.dataset.text === ${JSON.stringify(qTextBefore)}`))
    console.log('  ★ 진단: ' + (await host.evaluate(`JSON.stringify({ pill: document.querySelector('.state-pill')?.innerText, q: document.querySelector('.question-card .q-text')?.dataset.text, before: ${JSON.stringify(qTextBefore)}, reveal: !!document.querySelector('.reveal'), head: document.querySelector('.q-head')?.innerText, all: [...document.querySelectorAll('.q-text')].map(e => (e.dataset.text || '') + ' || ' + e.innerText) })`)));
    // ── ★★ R033 — 정답자 연출. 2번째 문제는 방장이 정답을 친다
    console.log('\n[5-4b] ★★ 정답 공개 — 정답자를 가장 크게 (R033)');
    const q2Text = await host.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
    const q2Answer = await withPg(async (c) => {
      const r = await c.query(
        `SELECT a.answer_text FROM questions q JOIN question_answers a ON a.question_id = q.id
          WHERE q.question_text = $1 ORDER BY a.is_primary DESC, a.id LIMIT 1`,
        [q2Text],
      );
      return r.rows[0]?.answer_text ?? null;
    });
    record('정답을 DB 에서 찾았다 (검사 전제)', Boolean(q2Answer), q2Text.slice(0, 30));
    await host.setInput('.chat-card input', q2Answer ?? '');
    await host.click('전송');
    const winnerShown = await host.waitFor("document.querySelector('.reveal .winner-name') !== null", 6000);
    const revealAt0 = Date.now();
    record('★★ 정답이 나오면 정답자 이름이 크게 나온다', winnerShown);
    const cardH0 = await host.evaluate("document.querySelector('.question-card')?.getBoundingClientRect().height ?? 0");
    record(
      '★★ R040 A-3 — 정답 공개 순간 소감 칸은 비어 있다 (정답 채팅을 넣지 않는다) · 이름은 "의 소감"',
      await host.evaluate("document.querySelector('.ceremony') !== null && document.querySelectorAll('.ceremony-msg').length === 0 && document.querySelector('.ceremony-head')?.innerText.includes('의 소감') === true"),
      await host.evaluate("document.querySelector('.ceremony')?.innerText ?? '-'"),
    );
    record(
      '★★ R035 — 정답자 칸도 반짝인다 (양옆까지 이어지는 연출)',
      await host.evaluate("document.querySelector('.seat-card.winner') !== null"),
    );
    record(
      '★★ R035 — 정답 공개 앞 3초는 "다음 문제" 안내가 없다 (정답·해설만)',
      (await host.evaluate("document.querySelector('.reveal-next')?.innerText.trim() ?? 'x'")) === '',
    );
    const noticeUp = await host.waitFor(
      "/\\d초 후 다음 문제/.test(document.querySelector('.reveal-next')?.innerText ?? '')",
      6000,
    );
    const noticeAt = Date.now() - revealAt0;
    const cardH1 = await host.evaluate("document.querySelector('.question-card')?.getBoundingClientRect().height ?? 0");
    record('★★ R040 A-5 — "N초 후" 안내가 나와도 정답 카드 크기가 그대로다', cardH0 > 0 && Math.abs(cardH0 - cardH1) < 0.5, `${cardH0} → ${cardH1}`);
    record(
      '★★★ R035 — 약 3초 뒤 "N초 후 다음 문제" 가 나온다 (5·4·3·2·1)',
      noticeUp && noticeAt >= 2300 && noticeAt <= 4200,
      `${noticeAt}ms / "${await host.evaluate("document.querySelector('.reveal-next')?.innerText ?? ''")}"`,
    );
    if (winnerShown) {
      const sizes = await host.evaluate(`(() => {
        const fs = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
        return { winner: fs('.reveal .winner-name'), text: fs('.question-card .q-text') };
      })()`);
      record(
        '★★ 정답자 이름이 화면에서 가장 큰 글씨다 (문제 지문보다 크다)',
        sizes.winner > sizes.text,
        JSON.stringify(sizes),
      );
      // ★ R035 — 정답 공개는 8초뿐이라 두 해상도(가장 작은 것·FHD)만 잰다
      await measureOneScreen(host, '정답 공개 화면', { shotName: '3-reveal', sizes: [ONE_SCREEN, { w: 1920, h: 1080 }] });
      await host.setWidth(720);
      await sleep(250);
    }
    // 3번째 문제를 기다린다 (정답 공개 5초 뒤)
    await host.waitFor(
      `document.querySelector('.question-card .q-text') !== null &&
       document.querySelector('.question-card .q-text').dataset.text !== ${JSON.stringify(q2Text)}`,
      16000,
    );

    // ── ★ 새 문제가 시작되면 지문이 화면 안으로 들어온다 (R014 실측 결함의 회귀 방지)
    const qAfterSkip = await host.onScreen('.question-card .q-text');
    record(
      '★★ 새 문제가 시작되면 지문이 화면 안에 들어온다 (R014 결함 회귀 방지)',
      qAfterSkip.exists && qAfterSkip.rect?.top >= 0,
      qAfterSkip.exists ? `top=${qAfterSkip.rect?.top}` : 'DOM 에 없다',
    );

    // ── ★★ Q-82 게임 중 나가기 확인창 (R043: Alt+X 는 껐다 → 나가기 버튼)
    await host.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
    await sleep(250);
    const leaveConfirm = await host.evaluate(
      "document.querySelector('.confirm-modal') !== null",
    );
    record('★★ Q-82 — 게임 중 나가기에 확인창이 뜬다', leaveConfirm);
    const leaveText = await host.evaluate(
      "document.querySelector('.confirm-modal')?.innerText ?? ''",
    );
    // ★ R045 B — 문구는 상황에 맞게: 나 말고 접속 중인 사람이 있으면 "방 코드 N 으로 다시 …" / 없으면 "방이 사라져요" (D-222)
    const othersOnline = await host.evaluate("[...document.querySelectorAll('.seat-card:not(.empty):not(.mine)')].some((c) => !c.classList.contains('offline'))");
    record(
      '★★ 확인창 문구가 상황에 맞다 (다른 접속자 있음 → 방 코드 / 없음 → 방이 사라져요)',
      othersOnline ? /방 코드 \d{6}/.test(leaveText) : leaveText.includes('방이 사라져요'),
      `다른 접속자=${othersOnline} · ${leaveText.replace(/\s+/g, ' ')}`,
    );
    record(
      '★ R041 — 나가기 팝업 문구는 짧게 (제목 한 줄 + 한 줄 설명)',
      (await host.evaluate("document.querySelector('.confirm-modal .confirm-note')?.innerText.length ?? 99")) <= 30,
    );
    await closeTop(host);
    record(
      '★ 취소하면 게임이 그대로다',
      (await host.evaluate("document.querySelector('.confirm-modal') === null")) &&
        (await host.evaluate("document.querySelector('.question-card') !== null")),
    );
    record(
      '★ 취소 뒤 포커스가 채팅 입력으로 돌아온다',
      Boolean((await host.activeEl())?.inChatCard),
    );

    // ─────────────────────────────────────────────────────────────────────────
    // ★★★ Phase 5 — 네트워크 끊김 → 일시정지 → 방장 재개 (R015)
    //
    //   ★ 이 프로젝트의 일상적인 사고를 그대로 재현한다: 접속이 끊기고 다시 들어온다.
    //   ★★ **새로고침**으로 만든다. 소켓을 코드로 닫지 않는다.
    //     ★ 근거: 새로고침은 사람이 실제로 하는 동작이고(건우가 Phase 3 에서 확인한 경로),
    //       소켓이 진짜로 끊겨 활성 0명이 된다 → 서버가 PAUSED 로 간다.
    //     ★ 오프라인 에뮬레이션(Network.emulateNetworkConditions)도 시도했는데
    //       이미 열린 WebSocket 을 끊지 못해 PAUSED 가 만들어지지 않았다 (R015 실측).
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[5-5] ★★★ Phase 5 — 끊김(새로고침) → 일시정지 → 재개');
    await host.goto(BASE);
    const pausedShown = await host.waitFor(
      "document.querySelector('.paused-card') !== null",
      20000,
    );
    record('★★★ 끊겼다 돌아오면 일시정지 화면이 나온다', pausedShown);
    if (pausedShown) {
      const pausedText = await host.evaluate(
        "document.querySelector('.paused-card')?.innerText ?? ''",
      );
      record('★★ 왜 멈췄는지 알려준다', pausedText.includes('멈췄습니다'));
      record(
        '★★ 몇 명이 돌아왔는지 보여준다',
        /\d+\s*\/\s*\d+/.test(pausedText),
        pausedText.split('\n')[1] ?? '',
      );
      record(
        '★★ 멈춘 시점의 남은 시간을 보여준다 (정수 초)',
        /멈춘 시점의 남은 시간\s*\d+초/.test(pausedText.replace(/\n/g, ' ')),
      );
      record(
        '★★ 방이 사라지기까지 남은 시간을 보여준다 (Q-82)',
        pausedText.includes('방이 사라집니다'),
      );
      record(
        '★★★ 자동 재개되지 않는다는 사실을 알린다 (D-030)',
        pausedText.includes('자동으로 재개되지 않습니다'),
      );
      record(
        '★ 일시정지 화면에 소수점이 없다 (Q-83)',
        !/\d\.\d/.test(pausedText),
        pausedText.replace(/\n/g, ' / ').slice(0, 120),
      );
      const pausedOnScreen = await host.onScreen('.paused-card');
      record(
        '★ 일시정지 카드가 화면 안에 보인다',
        pausedOnScreen.exists && pausedOnScreen.partlyVisible,
        JSON.stringify(pausedOnScreen.rect ?? {}),
      );
      const resumeBtn = await host.buttonState('재개');
      record('★★ 방장에게 재개 버튼이 있다', resumeBtn.exists && !resumeBtn.disabled);
      await host.shot('paused');

      // ★★ 자동 재개가 없다는 것을 시간으로 확인한다
      await sleep(3000);
      record(
        '★★★ 3초를 기다려도 자동으로 재개되지 않는다 (Q-30)',
        await host.evaluate("document.querySelector('.paused-card') !== null"),
      );

      // ★ 재개 버튼 (R043: Alt+R 단축키는 껐다)
      await host.click('재개');
      const resumed = await host.waitFor(
        "document.querySelector('.question-card') !== null && document.querySelector('.paused-card') === null",
        8000,
      );
      record('★★★ Alt+R 로 재개된다 (문제 화면으로 돌아온다)', resumed);
      const timerAfter = await host.evaluate(
        "document.querySelector('.q-timer')?.innerText ?? ''",
      );
      record(
        '★★ 재개 후 남은 시간이 이어진다 (0초가 아니다)',
        /^\d+초$/.test(timerAfter.trim()) && Number(timerAfter.replace(/[^0-9]/g, '')) > 0,
        `표시="${timerAfter.trim()}"`,
      );
    }

    // ── ★★ 결과 화면과 로비 복귀 (Phase 3 / R014)
    //   ★ Phase 2 에는 로비 복귀 경로가 없어 방을 나가고 새로 만들었다.
    //   ★★ Phase 3 에는 있다. 그 경로를 실제로 눌러 확인한다.
    // ★★ R028 — 가장 긴 경우: 일반 힌트 + 초성 힌트가 **둘 다** 보일 때 한 화면인가
    console.log('\n[5-5b] ★★★ 한 화면 검사 — 일반 힌트 + 초성 힌트 동시 표시');
    const bothShown = await host.waitFor(
      "document.querySelector('.question-card .q-hint-general') !== null && [...document.querySelectorAll('.question-card .q-hint.open')].some(p => !p.classList.contains('q-hint-general'))",
      45000,
    );
    record('★★ 남은 15초부터 일반 힌트와 초성 힌트가 함께 보인다 (R034)', bothShown);
    if (bothShown) await measureOneScreen(host, '게임 화면 (힌트 두 줄)', { shotName: '2-game' });
    await host.setWidth(720);
    await sleep(250);

    console.log('\n[5-6] ★★ 강제 종료 → 결과 화면 → 로비 복귀 (Phase 3)');
    // ★ 종료 버튼으로 연다 (R043: Alt+Q 는 껐다)
    await openHostEnd(host);
    record(
      '★ 종료 버튼으로 강제 종료 확인 팝업이 나타난다',
      await host.evaluate("document.querySelector('.confirm-modal') !== null"),
    );
    // ★ R035 — 여러 해상도를 재는 동안 문제가 시간 종료됐을 수 있다. 그때는 이 알림이 없는 것이 맞다
    const stillActive = await host.evaluate("document.querySelector('.q-timebar') !== null");
    record(
      '★ 확인창이 경험 기록 규칙을 알린다 (문제 진행 중일 때)',
      !stillActive || (await host.text()).includes('경험 기록이 남지 않아요'),
      stillActive ? '' : '(이미 정답 공개 중 — 해당 없음)',
    );
    await host.click('끝내기');
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
    // ★★ R035 — 결과 화면은 순위만 (마지막 문제 정답 · 응답 속도 · 문제별 기록을 지웠다)
    record(
      '★★ R035 — 결과 화면에 문제별 기록·응답 속도·마지막 문제 정답이 없다 (순위만)',
      await host.evaluate(
        "document.querySelector('.qlog') === null && document.querySelector('.last-reveal') === null && !document.querySelector('.result-card').innerText.includes('평균')",
      ),
    );
    await host.shot('game-result');

    // ★★ 결과 화면도 한 화면이어야 한다 (Phase 4 에서 요소가 늘었다)
    console.log('\n[5-6b] ★★★ 한 화면 검사 — 결과 화면');
    await measureOneScreen(host, '결과 화면', { shotName: '4-result' });
    await host.shot('one-screen-result');
    await host.setWidth(720);
    await sleep(250);

    const againBtn = await host.buttonState('다시 하기');
    record('★ 다시 하기 버튼이 있다', againBtn.exists && !againBtn.disabled, JSON.stringify(againBtn));
    // ★ 로비로 버튼 (R043: Alt+L 은 껐다)
    await host.click('로비로');
    const backToLobby = await host.waitFor(
      "document.querySelector('.lobby-card') !== null",
      8000,
    );
    record('★★ 로비로 버튼으로 로비에 돌아온다', backToLobby);
    record(
      '★ 게임이 자동으로 시작되지 않는다 (guide 38절)',
      await host.evaluate("document.querySelector('.question-card') === null"),
    );

    // ── 방을 비우고 새로 만든다
    await leaveViaUi(host);
    await host.waitFor("document.querySelector('.stage') === null", 8000);
    const roomId2 = await createRoom(host, '내보내기 확인용 방');
    record('두 번째 방 생성', Boolean(roomId2));

    console.log('\n[6] ★ 접속 종료자 "내보내기" 버튼이 실제로 나타나는가');
    // ★ 별도 브라우저 컨텍스트를 쓴다. 쿠키가 분리되어야 다른 계정으로 붙을 수 있다 (Q-06)
    const guest = await newPage(browser, 'guest', true);
    await guest.setWidth(720);
    await signUp(guest, 'g');
    await guest.goto(`${BASE}/r/${roomId2}`);
    const guestIn = await guest.waitFor(
      "document.querySelector('.stage') !== null && location.pathname.startsWith('/r/')",
      10000,
    );
    record(
      '게스트가 초대 링크로 입장',
      guestIn,
      guestIn ? '' : `게스트 화면="${(await guest.text()).replace(/\s+/g, ' ').slice(0, 140)}"`,
    );
    const twoPlayers = await host.waitFor(
      "document.querySelectorAll('.seat-card:not(.empty)').length === 2",
      8000,
    );
    record(
      '방장 화면에 2명이 보인다',
      twoPlayers,
      twoPlayers
        ? ''
        : `방장 목록="${await host.evaluate("[...document.querySelectorAll('.seat-card:not(.empty)')].map(li=>li.innerText.replace(/\\s+/g,' ')).join(' | ')")}" / 게스트 화면="${(await guest.text()).replace(/\s+/g, ' ').slice(0, 120)}"`,
    );

    // ─────────────────────────────────────────────────────────────────────────
    // ★★★ R034 — 두 사람 게임: 말풍선 마스킹 · 스킵 투표 · 마지막 문제 5초 · 닉네임 · 단축키
    //   ★ 건우: "스킵 투표가 아예 안 된다." — R033 까지는 봇만 투표를 시험했다(봇은 화면을 거치지 않는다).
    //     ★ 그래서 **두 브라우저가 실제 버튼·단축키로** 투표한다.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[6-A0] ★★★ R041 — 팝업 하나 · 키보드 · 칸 누르기(강퇴/차단) · 상단 바 · 소리 · ⓘ');
    {
      const prev = JSON.parse(await host.evaluate('JSON.stringify([innerWidth, innerHeight])'));
      await host.setViewport(1280, 720);
      await sleep(300);
      record(
        '★ R041 E-1 → R067 — 웹 상단 바는 글자까지 (초대 · 설정 · 나가기 — 안내 · 제보는 ⚙ 탭)',
        await host.evaluate("(() => { const t = document.querySelector('.room-tools')?.innerText ?? ''; return ['초대', '설정', '나가기'].every((w) => t.includes(w)) && !t.includes('안내'); })()"),
        await host.evaluate("document.querySelector('.room-tools')?.innerText.replace(/\\s+/g, ' ') ?? ''"),
      );
      // ★ R043 — 앞 단계가 단축키(진짜 키 입력) 대신 스크립트 클릭(.click() — 사용자 조작으로 치지 않는다)으로 바뀌었다
      //   → "한 번 누르기" 를 진짜 마우스 입력(CDP)으로 한다. 빈 곳(상단 바 가운데)을 누른다
      for (const type of ['mousePressed', 'mouseReleased']) {
        await host.send('Input.dispatchMouseEvent', { type, x: 520, y: 14, button: 'left', clickCount: 1 });
      }
      record('★★ R041 G — 화면을 한 번 누르면 소리가 깨어 있다 (AudioContext running)', await host.waitFor("document.documentElement.dataset.audio === 'running'", 3000), await host.evaluate("document.documentElement.dataset.audio ?? '-'"));
      // 팝업 하나 — ⓘ 를 연 채 ⚙ 를 열면 ⓘ 는 닫힌다 · 나가기(Alt+X)를 열면 ⚙ 도 닫힌다
      // ★ R067 — ⓘ 는 ⚙ 의 탭이 됐다 → 친구 창을 연 채 ⚙ 를 열면 친구 창이 닫힌다
      await host.evaluate("document.querySelector('#friends-btn')?.click()");
      await sleep(200);
      await host.evaluate("document.querySelector('.prefs-toggle')?.click()");
      await sleep(200);
      const pops1 = await host.evaluate("[!!document.querySelector('.friends-pop'), !!document.querySelector('.prefs-pop')].join(',')");
      record('★★★ R041 B — 팝업은 하나만: 친구 창을 연 채 ⚙ 를 열면 친구 창이 닫힌다', pops1 === 'false,true', pops1);
      // ★ 로비에서는 나가기 확인이 없다(Q-82 — 바로 나간다) — 대신 칸 누르기로 강퇴 팝업을 띄운다
      await host.evaluate("document.querySelector('.seat-card.pickable')?.click()");
      await sleep(250);
      // ★ R074 (§F ②) — R056 (D-292) 뒤로 칸을 누르면 사람 카드(친구 · 방장 넘기기 · 강퇴 · 차단 버튼) — 옛 강퇴 고르기 창(kick-choose)은 없다
      const pops2 = JSON.parse(await host.evaluate("JSON.stringify({ prefs: !!document.querySelector('.prefs-pop'), cards: document.querySelectorAll('.person-card').length, modals: document.querySelectorAll('.confirm-modal').length, acts: [...document.querySelectorAll('.person-card [data-person-acts] button')].map((b) => b.dataset.act) })"));
      record('★★★ R041 B·C → R056 — PC 방장이 참여자 칸을 누르면 사람 카드(강퇴 · 차단 있음) · ⚙ 창은 닫힌다 (하나만)', !pops2.prefs && pops2.cards === 1 && pops2.modals === 0 && pops2.acts.includes('kick') && pops2.acts.includes('ban'), JSON.stringify(pops2));
      record('★ R041 C — 자기 칸은 누를 수 없다', await host.evaluate("document.querySelector('.seat-card.mine')?.classList.contains('pickable') === false"));
      // 키보드 — 첫 버튼에 포커스 · → 로 다음 버튼 · Esc 로 닫힘
      // ★ R074 (§F ②) — 사람 카드는 첫 버튼에 포커스를 두지 않는다(R056) → 할 일 버튼이 키보드로 닿는가(tabIndex) · Esc 로 닫힘
      const kb = JSON.parse(await host.evaluate("JSON.stringify([...document.querySelectorAll('.person-card [data-person-acts] button')].map((b) => ({ t: b.innerText.trim(), tab: b.tabIndex, dis: b.disabled })))"));
      record('★★ R041 B → R056 — 사람 카드 할 일 버튼은 키보드로 닿는다(tabIndex ≥ 0 · 켜짐)', kb.length >= 2 && kb.every((b) => b.tab >= 0 && !b.dis), JSON.stringify(kb));
      await host.key('Escape', { code: 'Escape', vk: 27 });
      await sleep(200);
      record('★★ R041 B — Esc 로 닫힌다', await host.evaluate("document.querySelector('.person-card') === null && document.querySelector('.confirm-modal') === null"));
      // 팝업 글자 — 위아래 가운데
      await host.evaluate("document.querySelector('.seat-card.pickable')?.click()");
      await sleep(250);
      // ★ R074 (§F ②) — 옛 코드는 .confirm-modal(null)을 재다 예외로 main-behavior 가 222/327 에서 멈췄다 → 사람 카드(없으면 null 로 기록하고 지나간다)
      const mid = JSON.parse(await host.evaluate(`JSON.stringify((() => { const e = document.querySelector('.person-card, .confirm-modal'); if (!e) return null; const r = e.getBoundingClientRect(); return { dy: Math.round(r.top + r.height / 2 - innerHeight / 2), dx: Math.round(r.left + r.width / 2 - innerWidth / 2) }; })())`));
      record('★ R041 B — 팝업(사람 카드)은 화면 가운데', Boolean(mid) && Math.abs(mid.dx) <= 3 && Math.abs(mid.dy) <= 3, JSON.stringify(mid));
      await closeTop(host);
      // ⓘ — ✕ 로 닫힌다 · 짧다
      await openGearTab(host, 'info'); // ★ R067 — ⚙ 의 안내 탭
      const infoLines = await host.evaluate("[...document.querySelectorAll('[data-gear-pop] .info-list li')].filter((li) => li.getClientRects().length > 0).length");
      await host.evaluate("document.querySelector('[data-gear-pop] .popup-close')?.click()");
      await sleep(200);
      record('★★ R041 D — ⓘ(⚙ 안내 탭)는 짧게(8줄 이하) · ✕ 로 닫힌다', infoLines > 0 && infoLines <= 8 && (await host.evaluate("document.querySelector('[data-gear-pop]') === null")), `${infoLines}줄`);
      // ★ R043 A-9 — 단축키 목록 창 자체가 없다 (R041 E-3 검사는 대상이 사라졌다)
      await guest.setViewport(1280, 720);
      await sleep(300);
      // ★ R043 C — 방장이 아니어도 칸을 누를 수 있다: **친구 신청만** (강퇴·차단·방장 넘기기는 없다)
      await guest.evaluate("document.querySelector('.seat-card.pickable')?.click()");
      await sleep(250);
      const guestActs = await guest.evaluate("[...document.querySelectorAll('.person-card [data-person-acts] button, .confirm-modal .confirm-actions button')].map(b => b.dataset.act ?? b.innerText.trim()).join(',')");
      record('★ R041 C → R043 C → R056 — 방장이 아니면 칸을 눌러도 친구 신청만(강퇴 · 차단 · 방장 넘기기 없음)', /friend|친구 신청/.test(guestActs) && !/kick|ban|host/.test(guestActs), guestActs);
      await guest.key('Escape', { code: 'Escape', vk: 27 });
      await sleep(150);
      await guest.setViewport(720, 900);
      await host.setViewport(prev[0], prev[1]);
      await sleep(300);
    }

    console.log('\n[6-A] ★★★ R034/R035 — 두 사람 게임 (스킵 투표 · 칸 메시지 마스킹 · 마지막 문제 8초 · 다시 하기)');
    const ids = await withPg(async (c) => {
      const r = await c.query(`SELECT login_id, id::text AS id FROM accounts WHERE login_id = ANY($1)`, [
        [`${ACCOUNT_PREFIX}_h`, `${ACCOUNT_PREFIX}_g`],
      ]);
      return Object.fromEntries(r.rows.map((x) => [x.login_id.endsWith('_h') ? 'h' : 'g', x.id]));
    });
    // ★ 방장은 앞 게임에서 문제를 봐서 경험이 늘었다 → 다시 "앞의 3문제만 미경험" 으로 맞춘다.
    //   ★ 게스트는 **모든 문제의 경험자**로 만든다 → 게스트가 쓴 정답은 방장 화면에서 가려져야 한다
    await withPg((c) => c.query(`DELETE FROM question_experiences WHERE account_id = $1`, [ids?.h]));
    // ★ R035 — 4문제를 남긴다. 2문제를 풀고도 2문제가 남아야 "다시 하기" 가 실제로 시작된다
    await shrinkAvailable(`${ACCOUNT_PREFIX}_h`, 4);
    await withPg((c) =>
      c.query(
        `INSERT INTO question_experiences (account_id, question_id)
         SELECT $1, q.id FROM questions q
          WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'
         ON CONFLICT DO NOTHING`,
        [ids?.g],
      ),
    );
    await setQuestionCount(host, 2);
    await sleep(300);
    await host.click('게임 시작');
    const bothQ = (await host.waitFor("document.querySelector('.question-card .q-text') !== null", 15000)) &&
      (await guest.waitFor("document.querySelector('.question-card .q-text') !== null", 5000));
    record('★ 두 사람 게임이 시작된다', bothQ);
    {
      // ★★ R040 A-6 — 일반 힌트 있음/없음은 **문제 시작부터** (내용은 30초에)
      const qtext = await host.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
      const has = await withPg(async (c) => {
        const r = await c.query(`SELECT general_hint FROM questions WHERE question_text = $1`, [qtext]);
        return Boolean(r.rows[0]?.general_hint?.trim());
      });
      const hintState = await host.evaluate(`(() => {
        const g = document.querySelector('.q-hints .q-hint');
        return g ? (g.classList.contains('open') ? 'open' : g.classList.contains('none') ? 'none' : g.querySelector('svg.lucide-lock') ? 'locked' : 'other') : 'missing';
      })()`);
      record(
        '★★ R040 — 일반 힌트 있음/없음이 문제 시작부터 보인다 (있음 = 🔒 30초 · 없음 = "없음")',
        has ? hintState === 'locked' : hintState === 'none',
        `DB 힌트=${has} / 화면=${hintState}`,
      );
    }

    const answerOf = async (page) => {
      const text = await page.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
      return withPg(async (c) => {
        const r = await c.query(
          `SELECT a.answer_text FROM questions q JOIN question_answers a ON a.question_id = q.id
            WHERE q.question_text = $1 ORDER BY a.is_primary DESC, a.id LIMIT 1`,
          [text],
        );
        return r.rows[0]?.answer_text ?? null;
      });
    };

    // ── 경험자 표시 — 참여자 칸 배지
    record(
      '★★ 방장 화면 — 게스트 칸에 "경험" 배지가 붙는다',
      await host.waitFor(`document.querySelector('.seat-card[data-account="${ids?.g}"] .badge.exp') !== null`, 4000),
    );

    // ── ★★★ 말풍선 마스킹 — 경험자(게스트)가 정답을 쓴다
    const ans1 = await answerOf(guest);
    record('정답을 DB 에서 찾았다 (검사 전제)', Boolean(ans1));
    await guest.setInput('.chat-card input', ans1 ?? '');
    await guest.click('전송');
    const maskedLog = await host.waitFor("document.querySelector('.chat-log .masked-chip') !== null", 5000);
    const logText = await host.evaluate("document.querySelector('.chat-log')?.innerText ?? ''");
    record('★★★ 방장 화면 — 경험자가 쓴 정답이 채팅 로그에서 가려진다', maskedLog && Boolean(ans1) && !logText.includes(ans1), logText.slice(-80));
    record(
      '★ 본인(게스트) 채팅 로그에는 원문 + "가려져서 전송됨"',
      (await guest.evaluate("document.querySelector('.chat-log')?.innerText ?? ''")).includes('가려져서 전송됨'),
    );
    record(
      '★★ R039 — 참여자 칸에는 채팅이 보이지 않는다 (채팅은 로그에서만 — 건우 확인)',
      await host.evaluate(`document.querySelector('.seat-card[data-account="${ids?.g}"]')?.innerText.includes(${JSON.stringify(ans1 ?? '@@')}) === false`),
    );
    record(
      '★ 경험자의 정답은 판정되지 않는다 (정답 공개가 없다)',
      await host.evaluate("document.querySelector('.reveal') === null"),
    );

    // ── ★ 게임 중 닉네임 변경은 서버가 막는다
    const renameInGame = await guest.evaluate(`fetch('/api/auth/nickname', { method: 'PATCH',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'UIzz${STAMP}' }) })
      .then(r => r.status)`);
    record('★★ 게임 중 닉네임 변경은 거부된다 (409)', renameInGame === 409, `status=${renameInGame}`);

    // ── ★★★ 스킵 투표 — 두 사람이 실제 버튼·단축키로
    const skipState = (page) =>
      page.evaluate(`JSON.stringify({
        count: (() => { const e = document.querySelector('.skip-icons'); return e ? e.dataset.votes + ' / ' + e.dataset.threshold : null; })(),
        btn: document.querySelector('.skip-btn')?.innerText ?? null,
        disabled: document.querySelector('.skip-btn')?.disabled ?? null,
        pressed: document.querySelector('.skip-btn')?.getAttribute('aria-pressed') ?? null })`).then(JSON.parse);
    const s0h = await skipState(host);
    const s0g = await skipState(guest);
    record(
      '★★★ 문제 시작부터 넘기기 투표 버튼이 켜져 있고 "0 / 2" 가 보인다 (두 사람 모두)',
      s0h.count === '0 / 2' && s0h.disabled === false && s0g.count === '0 / 2' && s0g.disabled === false,
      `방장=${JSON.stringify(s0h)} / 게스트=${JSON.stringify(s0g)}`,
    );
    const skipW0 = await host.evaluate("document.querySelector('.skip-btn')?.getBoundingClientRect().width ?? 0");
    await host.evaluate("document.querySelector('.skip-btn')?.click()");
    const v1 = await host.waitFor("document.querySelector('.skip-icons')?.dataset.votes === '1'", 4000);
    const skipW1 = await host.evaluate("document.querySelector('.skip-btn')?.getBoundingClientRect().width ?? 0");
    record('★★ R040 A-4 — 넘기기 / 취소 버튼 크기가 같다 (토글해도 고정)', skipW0 > 0 && Math.abs(skipW0 - skipW1) < 0.5, `${skipW0} → ${skipW1}`);
    const s1h = await skipState(host);
    const s1g = await guest.waitFor("document.querySelector('.skip-icons')?.dataset.votes === '1'", 4000);
    const s1gs = await skipState(guest);
    record('★★★ 방장이 투표하면 두 화면 모두 "1 / 2"', v1 && s1g, `방장=${JSON.stringify(s1h)} / 게스트=${JSON.stringify(s1gs)}`);
    record('★★ 투표한 사람 버튼은 "취소" 로 바뀐다 (본인 투표 여부)', s1h.pressed === 'true' && /취소/.test(s1h.btn ?? ''));
    record(
      '★★ R039 — 넘기기는 숫자 없이 접속 인원 수만큼 아이콘 · 하나가 채워졌다',
      await host.evaluate("document.querySelectorAll('.skip-icons i').length === 2 && document.querySelectorAll('.skip-icons i.on').length === 1 && !/\\d/.test(document.querySelector('.action-bar')?.innerText ?? '')"),
    );
    record('★★ 안 누른 사람 버튼은 그대로 "넘기기"', s1gs.pressed === 'false' && !/취소/.test(s1gs.btn ?? ''));
    // ★ 취소 — 한글 자판 상태를 흉내 낸다 (key 는 'ㄴ', 자판 위치는 S). R034 에서 e.code 로 고친 부분
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('ㄴ', { alt: true, code: 'KeyS', vk: 83 });
    record(
      '★★★ Alt+S (한글 자판 상태에서도) 로 투표가 취소된다 → "0 / 2"',
      await host.waitFor("document.querySelector('.skip-icons')?.dataset.votes === '0'", 4000),
    );
    // ★ 다시 투표 — F2
    await host.key('F2');
    record(
      '★★ F2 로 다시 투표된다 → "1 / 2"',
      await host.waitFor("document.querySelector('.skip-icons')?.dataset.votes === '1'", 4000),
    );
    const q1Text = await host.evaluate("document.querySelector('.question-card .q-text')?.dataset.text ?? ''");
    await guest.evaluate("document.querySelector('.chat-card input')?.focus()");
    await guest.key('s', { alt: true });
    const skipped = await host.waitFor(
      "document.querySelector('.reveal')?.innerText.includes('투표로 넘겼습니다') === true",
      5000,
    );
    record('★★★ 게스트가 Alt+S 로 투표하면 2/2 — 문제가 넘어간다 ("투표로 넘겼습니다")', skipped);

    // ── ★★ 마지막 문제 — 정답 공개 5초 뒤 결과 (Q-17 개정)
    console.log('\n[6-B] ★★ 마지막 문제도 정답 공개 5초 뒤 결과 (R034 Q-17 개정)');
    const q2Up = await host.waitFor(
      `document.querySelector('.question-card .q-text') !== null &&
       document.querySelector('.reveal') === null &&
       document.querySelector('.question-card .q-text').dataset.text !== ${JSON.stringify(q1Text)}`,
      16000,
    );
    if (!q2Up) console.log('  ★ 진단: ' + (await host.evaluate(`JSON.stringify({ pill: document.querySelector('.state-pill')?.innerText, q: document.querySelector('.question-card .q-text')?.dataset.text, q1: ${JSON.stringify(q1Text)}, reveal: document.querySelector('.reveal')?.innerText, head: document.querySelector('.q-head')?.innerText, all: [...document.querySelectorAll('.q-text')].map(e => (e.dataset.text || '') + ' || ' + e.innerText) })`)));
    record('★ 2번째(마지막) 문제가 시작된다', q2Up);
    const ans2 = await answerOf(host);

    // ── ★★ R038 — 세 번째 참가자가 **휴대폰 폭(390)** 으로 중간 참가한다 (경험 없음 → 뒷북 후보)
    const third = await newPage(browser, 'third', true);
    await third.setViewport(390, 800);
    await signUp(third, 't');
    await third.goto(`${BASE}/r/${roomId2}`);
    const thirdIn = await third.waitFor("document.querySelector('.question-card .q-text') !== null", 10000);
    record('★ 휴대폰 폭 참가자가 게임 중에 들어온다', thirdIn);
    const mob = JSON.parse(await third.evaluate(`JSON.stringify({
      seats: getComputedStyle(document.querySelector('.seats')).display,
      qOver: (() => { const b = document.querySelector('.question-card .q-text'); return b ? b.scrollWidth > b.clientWidth + 1 : true; })(),
      cardOver: (() => { const c = document.querySelector('.question-card'); return c ? c.scrollWidth > c.clientWidth + 1 : true; })(),
      pageX: document.documentElement.scrollWidth > window.innerWidth + 1 })`));
    record('★★ R038 모바일 — 참여자 칸을 숨긴다 (문제·채팅에 집중)', mob.seats === 'none', JSON.stringify(mob));
    record('★★ R038 모바일 — 문제 지문이 잘리지 않는다 (가로 넘침 없음)', !mob.qOver && !mob.cardOver && !mob.pageX, JSON.stringify(mob));
    const innerMob = await third.evaluate(INNER_SCROLLERS);
    record('★★ R038 모바일 — 칸 안 스크롤 0 (화면 스크롤 하나만)', innerMob.length === 0, innerMob.join(' / '));
    record(
      '★ 모바일 채팅은 스크롤하지 않는다 (overflow hidden)',
      (await third.evaluate("getComputedStyle(document.querySelector('.chat-log')).overflowY")) === 'hidden',
    );

    // ★★ R041 C-2 — 휴대폰 참가자: ⓘ 가 한 화면에 들어오는가 · 👥 참여자 창을 연 채로 점수가 바로 바뀌는가
    await third.evaluate("document.querySelector('.infotip-btn')?.click()");
    await sleep(250);
    const infoM = JSON.parse(await third.evaluate(`JSON.stringify((() => { const p = document.querySelector('.infotip-pop'); if (!p) return null; const r = p.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, inner: p.scrollHeight - p.clientHeight, close: !!p.querySelector('.infotip-close') }; })())`));
    record('★★ R041 D — 모바일 ⓘ: 한 화면 · 안에서 스크롤 없음 · ✕ 있음', infoM && infoM.top >= 0 && infoM.bottom <= infoM.h && infoM.inner <= 1 && infoM.close, JSON.stringify(infoM));
    await third.evaluate("document.querySelector('.infotip-close')?.click()");
    await sleep(150);
    await third.evaluate("document.querySelector('#people-btn')?.click()");
    const pUp = await third.waitFor("document.querySelector('.people-modal') !== null", 3000);
    const pInfo = JSON.parse(await third.evaluate(`JSON.stringify((() => { const m = document.querySelector('.people-modal'); const rows = [...m.querySelectorAll('.people-list li')]; const rh = rows.length ? rows[0].getBoundingClientRect().height + 4 : 0; const r = m.getBoundingClientRect(); return { rows: rows.length, photos: m.querySelectorAll('.avatar').length, rowH: Math.round(rh), modalH: Math.round(r.height), h: innerHeight, est10: Math.round(r.height + rh * (10 - rows.length)), text: m.innerText.replace(/\\s+/g, ' ').slice(0, 80) }; })())`));
    record('★★★ R041 C-2 — 모바일 👥 참여자 창: 사람마다 사진·닉네임·점수', pUp && pInfo.rows === 3 && pInfo.photos === 3 && /점/.test(pInfo.text), JSON.stringify(pInfo));
    record('★★ R041 C-2 — 10명이어도 한 화면 (한 줄 높이로 계산)', pInfo.est10 <= pInfo.h - 16, `10명 예상 ${pInfo.est10}px / 화면 ${pInfo.h}px`);
    await host.setInput('.chat-card input', ans2 ?? '');
    await host.click('전송');
    const liveScore = await third.waitFor(`(() => { const li = document.querySelector('.people-modal li[data-account="${ids?.h}"]'); return li ? /[1-9]\d*점/.test(li.innerText) && li.innerText.includes('위') : false; })()`, 5000);
    record('★★★ R041 C-2 — 창을 열어 둔 채로 점수·순위가 바로 바뀐다', liveScore, await third.evaluate(`document.querySelector('.people-modal li[data-account="${ids?.h}"]')?.innerText.replace(/\\s+/g, ' ') ?? '-'`));
    await third.evaluate("document.querySelector('.people-modal .popup-close')?.click()");
    await sleep(150);
    // ★ 세 번째 참가자가 곧바로 같은 정답 → 간발의 차로 늦는다 = 뒷북
    await third.setInput('.chat-card input', ans2 ?? '');
    await third.click('전송');
    const revealUp = await host.waitFor("document.querySelector('.reveal .winner-name') !== null", 5000);
    const revealAt = Date.now();
    record('★★ 마지막 문제도 정답 공개 화면이 나온다', revealUp);

    // ── ★★★ 세레머니 · 뒷북 (PC 방장 화면 + 휴대폰 화면)
    record('★★★ R038 — 정답자가 있으면 세레머니 칸이 나온다', await host.evaluate("document.querySelector('.ceremony') !== null"));
    await host.setInput('.chat-card input', '메롱 세레머니');
    await host.click('전송');
    const cerHost = await host.waitFor("[...document.querySelectorAll('.ceremony-msg')].some(e => e.innerText.includes('메롱 세레머니'))", 4000);
    const cerMob = await third.waitFor("[...document.querySelectorAll('.ceremony-msg')].some(e => e.innerText.includes('메롱 세레머니'))", 4000);
    record('★★★ 세레머니 시간에 정답자가 친 채팅이 모두에게 크게 보인다 (PC · 휴대폰)', cerHost && cerMob);
    {
      const c = JSON.parse(await host.evaluate(`JSON.stringify((() => {
        const box = document.querySelector('.ceremony-msgs').getBoundingClientRect();
        const m = document.querySelector('.ceremony-msg').getBoundingClientRect();
        return { dx: Math.round((m.left + m.width / 2) - (box.left + box.width / 2)), dy: Math.round((m.top + m.height / 2) - (box.top + box.height / 2)) };
      })())`));
      record('★★ R040 A-3 — 소감은 칸의 좌우·상하 가운데', Math.abs(c.dx) <= 3 && Math.abs(c.dy) <= 3, JSON.stringify(c));
      record(
        '★ R040 A-3 — 소감 칸 글: 넘치면 줄바꿈, 세로로 넘치면 "…" (줄 수 제한)',
        await host.evaluate("(() => { const cs = getComputedStyle(document.querySelector('.ceremony-msg')); return cs.whiteSpace !== 'nowrap' && cs.webkitLineClamp !== 'none'; })()"),
      );
      // ★ R040 C-3 — 키보드 검사 준비: 휴대폰 참가자가 입력칸에 있다 (결과 화면으로 바뀔 때 내려가야 한다 — 아래)
      await third.evaluate("document.querySelector('.chat-card input')?.focus()");
      record('★★ R040 C-3 — PC 는 포커스를 그대로 둔다 (바로 칠 수 있게)', (await host.evaluate("document.activeElement?.tagName ?? ''")) === 'INPUT');
      const nickBad = JSON.parse(await host.evaluate(NICK_NO_ELLIPSIS));
      record('★★★ R040 A-9 — 닉네임 자리에 "…" 줄임이 없고 잘리지 않는다 (PC 정답 공개)', nickBad.length === 0, nickBad.join(' / '));
      const nickBadM = JSON.parse(await third.evaluate(NICK_NO_ELLIPSIS));
      record('★★ R040 A-9 — 같은 검사 (휴대폰 390)', nickBadM.length === 0, nickBadM.join(' / '));
      await third.evaluate("document.querySelector('.prefs-toggle')?.click()");
      await sleep(300);
      const pc = JSON.parse(await third.evaluate(`JSON.stringify((() => {
        const r = document.querySelector('.prefs-pop')?.getBoundingClientRect();
        return r ? { dx: Math.round(r.left + r.width / 2 - innerWidth / 2), dy: Math.round(r.top + r.height / 2 - innerHeight / 2), l: Math.round(r.left), r: Math.round(innerWidth - r.right) } : null;
      })())`));
      record('★★ R040 C-1 — 모바일 상단 메뉴 창(⚙)이 화면 가운데에 뜬다 (밖으로 나가지 않는다)', pc && Math.abs(pc.dx) <= 3 && Math.abs(pc.dy) <= 3 && pc.l >= 8 && pc.r >= 8, JSON.stringify(pc));
      await third.evaluate("document.querySelector('.prefs-toggle')?.click()");
    }
    const cerOn = await third.onScreen('.ceremony');
    record('★★ R038 모바일 — 세레머니 칸이 화면에 보인다', cerOn.exists && cerOn.partlyVisible, JSON.stringify(cerOn.rect ?? {}));
    const lateHost = await host.waitFor(`document.querySelector('.late-row')?.innerText.includes(${JSON.stringify(`UI${STAMP}t`)}) === true`, 4000);
    const lateText = await host.evaluate("document.querySelector('.late-row')?.innerText ?? ''");
    record('★★★ R038 — 뒷북 칸에 늦은 사람과 시간 차가 뜬다', lateHost && /\+\d+(\.\d+)?초/.test(lateText), lateText);
    const lateMob = await third.onScreen('.late-row');
    record('★★ R038 모바일 — 뒷북 칸이 보인다', lateMob.exists, JSON.stringify(lateMob.rect ?? {}));
    record(
      '★ 세레머니가 문제·정답·해설을 가리지 않는다 (겹침 없음)',
      !(await host.overlaps('.ceremony', '.reveal-answer')).overlap && !(await host.overlaps('.ceremony', '.question-card .q-text')).overlap,
    );
    record(
      '★★ 마지막 문제는 "N초 후 결과 화면" 으로 안내한다',
      await host.waitFor("/\\d초 후 결과 화면/.test(document.querySelector('.reveal-next')?.innerText ?? '')", 6000),
    );
    const resultUp = await host.waitFor("document.querySelector('.result-card') !== null", 12000);
    const waited = Date.now() - revealAt;
    {
      await third.waitFor("document.querySelector('.result-card') !== null", 4000);
      await sleep(200);
      const kb = JSON.parse(await third.evaluate("JSON.stringify({ tag: document.activeElement?.tagName ?? null, dropped: document.documentElement.dataset.kbDropped ?? '0' })"));
      record('★★★ R040 C-3 — 이벤트(결과 화면) 때 모바일은 키보드를 내린다 (입력칸 포커스 해제 — 정답자 아닌 사람도)', kb.tag !== 'INPUT' && Number(kb.dropped) >= 1, JSON.stringify(kb));
    }
    record(
      '★★★ 결과 화면은 정답 공개 약 8초 뒤에 나온다 (R035)',
      resultUp && waited >= 7300 && waited <= 10500,
      `${waited}ms`,
    );

    // ── ★★ R038 — 결과 화면 방향키: 버튼 사이를 오간다 (글자 사이로 캐럿이 가지 않는다)
    await leaveViaUi(third);
    await host.evaluate("[...document.querySelectorAll('.next-row button')][0]?.focus()");
    await host.key('ArrowRight');
    const afterRight = await host.evaluate("document.activeElement?.innerText.replace(/Alt\\+\\w/, '').trim() ?? ''");
    await host.key('ArrowLeft');
    const afterLeft = await host.evaluate("document.activeElement?.innerText.replace(/Alt\\+\\w/, '').trim() ?? ''");
    record('★★ R038 — 결과 화면에서 → 로 "로비로", ← 로 "다시 하기" 버튼으로 옮겨 간다', afterRight === '로비로' && afterLeft === '다시 하기', `${afterRight} / ${afterLeft}`);
    await browser.send('Target.closeTarget', { targetId: third.targetId });
    third.close();

    // ── ★★ 다시 하기 — R035: 같은 설정으로 **5초 뒤 바로 시작** (R043: Alt+A 는 껐다 → 버튼)
    await host.click('다시 하기');
    const againCd =
      (await host.waitFor("document.querySelector('.countdown-box') !== null", 6000)) &&
      (await guest.waitFor("document.querySelector('.countdown-box') !== null", 4000));
    record('★★★ R035 — 다시 하기를 누르면 두 화면 모두 곧바로 5초 카운트다운', againCd);
    record(
      '★ 같은 설정이다 (문제 수 2)',
      parseInt(await host.evaluate("document.querySelector('.count-input')?.value ?? document.querySelector('.set-value')?.innerText ?? ''"), 10) === 2,
    );
    // ★ 이번에는 시작하지 않는다 — 방장이 취소한다 (기존대로)
    await host.click('카운트다운 취소');
    record(
      '★ 카운트다운 취소로 로비에 남는다',
      await host.waitFor("document.querySelector('.countdown-box') === null && document.querySelector('.lobby-card') !== null", 4000),
    );

    // ── ★★ 닉네임 바꾸기 (로비)
    console.log('\n[6-C] ★★ 닉네임 바꾸기 (R034)');
    await guest.waitFor("document.querySelector('#rename-btn') !== null", 6000);
    await guest.evaluate("document.querySelector('#rename-btn').click()");
    await guest.waitFor("document.querySelector('#rename-input') !== null", 3000);

    // ── ★★ R039 — 프로필 사진: 파일 고르기 → 원형 편집기 → 등록 → 방장 화면 참여자 칸에 사진
    console.log('\n[6-C0] ★★ 프로필 사진 (R039)');
    {
      const doc = await guest.send('DOM.getDocument', { depth: -1, pierce: true });
      const { nodeId } = await guest.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#avatar-file' });
      await guest.send('DOM.setFileInputFiles', { nodeId, files: [path.join(ROOT, 'docs', 'design', 'pastel-1-lobby.png')] });
      const editorUp = await guest.waitFor("document.querySelector('.profile-editor .crop-stage img') !== null", 5000);
      record('★★ 사진을 고르면 원형 편집기가 열린다 (미리보기 포함)', editorUp && (await guest.evaluate("document.querySelectorAll('.crop-preview canvas').length === 2")));
      // 확대 · 끌기
      await guest.evaluate(`(() => { const r = document.querySelector('.crop-zoom'); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(r, '1.6'); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(200);
      await guest.evaluate("[...document.querySelectorAll('.profile-editor button')].find(b => b.innerText.trim() === '등록')?.click()");
      const hostSees = await host.waitFor(`document.querySelector('.seat-card[data-account="${ids?.g}"] img.avatar.photo')?.naturalWidth === 256`, 8000);
      record('★★★ 등록하면 방장 화면 참여자 칸에 사진이 뜬다 (256×256 으로 줄여 올렸다)', hostSees);
      const bytes = await withPg(async (c) => (await c.query(`SELECT bytes, mime FROM account_avatars WHERE account_id = $1`, [ids?.g])).rows[0]);
      record('★ DB 에 작게 저장된다 (200KB 이하 · webp)', bytes && bytes.bytes <= 200 * 1024, JSON.stringify(bytes));
      record('★ 채팅 줄에도 같은 사진 (작은 아바타)', await host.evaluate(`[...document.querySelectorAll('.chat-line img.avatar.xs')].length > 0`));
      // ★★ R040 A-1 — 채팅 줄의 글자 아바타 · 사진 아바타가 닉네임과 같은 높이 (가운데 차이)
      const al = JSON.parse(await host.evaluate(`JSON.stringify((() => {
        const out = { photo: [], letter: [] };
        for (const line of document.querySelectorAll('.chat-line')) {
          const a = line.querySelector('.avatar.xs'); const n = line.querySelector('.nick');
          if (!a || !n) continue;
          const ar = a.getBoundingClientRect(); const nr = n.getBoundingClientRect();
          const d = Math.round(((ar.top + ar.height / 2) - (nr.top + nr.height / 2)) * 10) / 10;
          (a.tagName === 'IMG' ? out.photo : out.letter).push(d);
        }
        return out;
      })())`));
      const maxOff = Math.max(...al.photo.map(Math.abs), ...al.letter.map(Math.abs));
      const gap = al.photo.length && al.letter.length ? Math.abs(al.photo[0] - al.letter[0]) : 99;
      record('★★ R040 A-1 — 채팅의 글자 아바타가 사진 아바타와 같은 높이 (닉네임 가운데와 2px 이내)', al.photo.length > 0 && al.letter.length > 0 && maxOff <= 2 && gap <= 1, JSON.stringify(al));
    }
    const expBefore = await withPg(async (c) =>
      (await c.query(`SELECT count(*)::int AS n FROM question_experiences WHERE account_id = $1`, [ids?.g])).rows[0].n,
    );
    const newNick = `UIr${STAMP}`;
    await guest.setInput('#rename-input', newNick);
    await sleep(150);
    await guest.click('바꾸기');
    const sysLine = await host.waitFor(
      `document.querySelector('.chat-log')?.innerText.includes(${JSON.stringify(`${newNick}(으)로 이름을 바꿨습니다`)}) === true`,
      5000,
    );
    record('★★ 채팅 로그에 "○○ 님이 △△(으)로 이름을 바꿨습니다" 가 남는다', sysLine);
    record(
      '★★ 방장 화면의 참여자 칸 이름이 바뀐다',
      await host.waitFor(
        `document.querySelector('.seat-card[data-account="${ids?.g}"] .seat-nick')?.innerText === ${JSON.stringify(newNick)}`,
        4000,
      ),
    );
    const expAfter = await withPg(async (c) =>
      (await c.query(`SELECT count(*)::int AS n FROM question_experiences WHERE account_id = $1`, [ids?.g])).rows[0].n,
    );
    record('★★ 경험 기록은 계정에 그대로 붙어 있다 (개수 동일)', expBefore === expAfter && expAfter > 0, `${expBefore} → ${expAfter}`);
    // ★ 겹치는 닉네임 — 방장 이름으로 바꾸려 한다
    await guest.setInput('#rename-input', `UI${STAMP}h`);
    await sleep(150);
    await guest.click('바꾸기');
    record(
      '★★ 다른 사람이 쓰는 닉네임이면 막고 알려 준다',
      await guest.waitForText('이미 사용 중인 닉네임', 4000),
    );
    // ★★ R041 — 폭 한도 10칸: 한글 11자는 화면에서 막히고 **빨갛게 + 떨림 + "글자 수를 넘었어요"** (칸 수 표시는 없앴다) / 영어 12자는 된다
    record('★ R041 — 닉네임 칸 수 표시("6.4/8" 같은)가 없다', await guest.evaluate("document.querySelector('.rename-units') === null"));
    await guest.setInput('#rename-input', '가나다라마바사아자차카');
    await sleep(150);
    record(
      '★★ R041 — 한글 11자: 바꾸기 꺼짐 · 입력칸 빨강+떨림 · "글자 수를 넘었어요"',
      await guest.evaluate("[...document.querySelectorAll('.rename-pop button')].find(b => b.innerText.trim() === '바꾸기')?.disabled === true && document.querySelector('#rename-input.nick-input-over') !== null && getComputedStyle(document.querySelector('#rename-input')).animationName === 'nick-shake' && (document.querySelector('.rename-pop')?.innerText ?? '').includes('글자 수를 넘었어요')"),
    );
    await guest.setInput('#rename-input', '가나다라마바사아자차');
    await sleep(150);
    record('★ R041 — 한글 10자는 빨갛지 않다 (한도 안)', await guest.evaluate("document.querySelector('#rename-input.nick-input-over') === null"));
    const longStatus = await guest.evaluate(`fetch('/api/auth/nickname', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '가나다라마바사아자차카' }) }).then(r => r.status)`);
    record('★★ R041 — 서버도 막는다 (한글 11자 → 400)', longStatus === 400, `status=${longStatus}`);
    const tenLatin = `Ab${STAMP}xyzuv`.slice(0, 12);
    await guest.setInput('#rename-input', tenLatin);
    await sleep(150);
    await guest.click('바꾸기');
    record(
      '★★ R041 — 영어·숫자 12자(9.6칸)는 된다',
      await host.waitFor(`document.querySelector('.seat-card[data-account="${ids?.g}"] .seat-nick')?.innerText === ${JSON.stringify(tenLatin)}`, 4000),
      tenLatin,
    );
    // ★★ R040 — 한도를 넘는 옛 닉네임: 로비에 들어오면 프로필 창이 열려 있고 바꾸라는 안내 · 방장이 시작하면 막힌다
    await withPg((c) => c.query(`UPDATE accounts SET nickname = $2 WHERE login_id = $1`, [`${ACCOUNT_PREFIX}_g`, `옛닉네임아주긴${STAMP}`]));
    await guest.goto(`${BASE}/r/${roomId2}`);
    const mustUp = await guest.waitFor("document.querySelector('.rename-must') !== null && document.querySelector('.rename-pop') !== null", 8000);
    record('★★★ R040 — 한도를 넘는 옛 닉네임은 로비에 들어오면 바꾸라는 안내가 열려 있다', mustUp);
    record('★ R040 — 방장 화면 그 사람 칸에 "닉네임 변경 필요"', await host.waitFor(`document.querySelector('.seat-card[data-account="${ids?.g}"]')?.innerText.includes('닉네임 변경 필요') === true`, 4000));
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.click('게임 시작');
    record('★★★ R040 — 바꾸기 전에는 게임 시작이 막힌다 (방 전체에 이유)', await host.waitForText('닉네임을 바꿔야 시작할 수 있어요', 5000));
    await guest.setInput('#rename-input', `UIb${STAMP}`);
    await sleep(150);
    await guest.click('바꾸기');
    record('★★ R040 — 바꾸면 안내가 닫힐 수 있다 (안내 사라짐)', await guest.waitFor("document.querySelector('.rename-must') === null", 5000));

    // ── ★★★ R039 — 이모티콘: Alt+숫자 · 칸에 크게 · 로그 한 줄 · 고르기 창 · 10칸 바꾸기 저장 · 모바일 보내기
    console.log('\n[6-E] ★★★ 이모티콘 (R039)');
    await host.setViewport(1280, 720);
    await sleep(400);
    await host.waitFor("document.querySelector('.emoji-btn') !== null", 4000);
    await sleep(800); // 목록 받기
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('2', { alt: true, code: 'Digit2', vk: 50 });
    const seatEmoji = await host.waitFor(`document.querySelector('.seat-card[data-account="${ids?.h}"] .seat-emoji-pop img.emoji') !== null`, 4000);
    record('★★★ Alt+2 → 내 칸에 이모티콘이 크게 튀어 오른다', seatEmoji);
    const emoSize = await host.evaluate(`(() => { const i = document.querySelector('.seat-card[data-account="${ids?.h}"] .seat-emoji-pop'); const n = document.querySelector('.seat-card[data-account="${ids?.h}"] .seat-nick'); return i && n ? Math.round(i.getBoundingClientRect().height) + '/' + Math.round(n.getBoundingClientRect().height) : '-'; })()`);
    // ★ R074 (§B) — 이모티콘은 자리 안에 들어가게(자리 − 그림자 ÷ 튀어 오름) — 옛 '닉네임 × 1.5' 대신 닉네임보다 높다
    record('★★ 이모티콘 자리가 칸에서 가장 크다 (닉네임보다 높다 — R074 자리 안)', /^(\d+)\/(\d+)$/.test(emoSize) && Number(emoSize.split('/')[0]) > Number(emoSize.split('/')[1]), emoSize);
    record('★★ 채팅 로그에 작게 한 줄 (닉네임 + 그림)', await guest.waitFor("document.querySelector('.chat-log .chat-emoji') !== null", 4000));
    record('★ 그림 세트(Twemoji SVG)로 그린다', await host.evaluate("document.querySelector('.seat-emoji-pop img.emoji')?.getAttribute('src')?.startsWith('/emoji/') === true"));
    // 고르기 창 · 10칸 바꾸기
    await host.evaluate("document.querySelector('.emoji-btn').click()");
    // ★ R069 — 보낸 적이 있으면 "자주" 탭(최근 12)부터 연다 → 칸 수 대신 탭 줄 · 칸이 있음
    const pop = await host.waitFor("document.querySelectorAll('.emoji-pop .emoji-slot').length === 10 && document.querySelectorAll('.emoji-grid .emoji-cell').length > 0 && document.querySelectorAll('.emoji-tabs .emoji-tab').length >= 8", 4000);
    record('★★ 😊 → 고르기 창 (내 10칸 + 분류별 목록)', pop);
    // ★ R073 (D-317) — 찾은 하트를 끌어 1번 자리에(옛 숫자 자리 누르기는 없앴다)
    await host.setInput('.emoji-search', '하트');
    await sleep(300);
    const firstHeart = await host.evaluate("Number(document.querySelector('.emoji-grid .emoji-cell img')?.dataset.emojiId ?? 0)");
    record('★ 검색 (한국어 이름·검색어)', firstHeart > 0, String(firstHeart));
    await dragTo(host, '.emoji-grid .emoji-cell', '.emoji-slot-cell[data-drop-slot="0"]');
    await sleep(1300);
    const slots = await host.evaluate("fetch('/api/auth/prefs').then(r => r.json()).then(j => j.prefs?.emojiSlots ?? null)");
    record('★★ 10칸 바꾸기 → 첫 칸이 바뀌고 계정에 저장된다', Array.isArray(slots) && slots[0] === firstHeart, JSON.stringify(slots));
    await host.key('Escape');
    // ★ R043 — 단축키 목록 창은 없앴다. Alt+1~0 은 ⓘ 안내(웹)에 적는다
    // 모바일(게스트 720) — 😊 → 칸을 누르면 바로 보내고, 보냈다는 표시
    await guest.evaluate("document.querySelector('.emoji-btn').click()");
    await guest.waitFor("document.querySelectorAll('.emoji-pop .emoji-slot').length === 10", 4000);
    await guest.evaluate("document.querySelectorAll('.emoji-pop .emoji-slot')[2].click()");
    const flash = await guest.waitFor("document.querySelector('.emoji-flash img') !== null", 2000);
    const hostGot = await host.waitFor(`document.querySelector('.seat-card[data-account="${ids?.g}"] .seat-emoji-pop img.emoji') !== null`, 4000);
    record('★★★ 모바일 — 😊 에서 누르면 바로 보내고 "보냈다" 표시가 떠오른다 · 방장 칸에 뜬다', flash && hostGot);
    await guest.key('Escape');
    await host.setWidth(720);
    await sleep(300);

    // ── ★★ R035 — 채팅: 스크롤바 없음 · 휠로 올려 보는 중 새 메시지 → ↓ 버튼 → 누르면 최신으로
    await guest.setViewport(1280, 720);
    for (let i = 1; i <= 14; i += 1) {
      await host.setInput('.chat-card input', `채팅 줄 ${i}`);
      await host.click('전송');
      await sleep(5); // ★ R038 — 몰아쳐 보낸다 (옛 방식은 이때 맨 아래 따라가기가 꺼졌다)
    }
    await guest.waitFor("document.querySelector('.chat-log')?.innerText.includes('채팅 줄 14') === true", 5000);
    const sbHidden = await guest.evaluate(`(() => { const el = document.querySelector('.chat-log');
      return getComputedStyle(el).scrollbarWidth === 'none' || el.offsetWidth === el.clientWidth; })()`);
    record('★★ R035 — 채팅 스크롤바가 보이지 않는다', sbHidden);
    const atBottom = await guest.evaluate(`(() => { const el = document.querySelector('.chat-log');
      return el.scrollHeight - el.scrollTop - el.clientHeight < 24; })()`);
    record('★★★ R038 — 채팅을 몰아쳐도 맨 아래에 붙어 있다 (건드리지 않으면 항상 최하단)', atBottom);
    // 휠로 올려 본다 (스크롤 이벤트까지)
    // ★ R038 — "올려 보기" 는 사용자 동작(휠 위로)으로만 켜진다. 휠 이벤트를 보내고 실제로 올린다
    await guest.evaluate(`(() => { const el = document.querySelector('.chat-log'); el.scrollTop = 0; el.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true })); el.dispatchEvent(new Event('scroll')); })()`);
    await sleep(200);
    await host.setInput('.chat-card input', '새 메시지 도착');
    await host.click('전송');
    const downUp = await guest.waitFor("document.querySelector('.chat-down') !== null", 4000);
    record('★★★ R035 — 올려 보는 중에 새 메시지가 오면 ↓ 버튼이 뜬다', downUp);
    if (downUp) {
      await guest.evaluate("document.querySelector('.chat-down').click()");
      await sleep(300);
      record(
        '★★ ↓ 를 누르면 최신 메시지로 내려가고 버튼이 사라진다',
        await guest.evaluate(`(() => { const el = document.querySelector('.chat-log');
          return document.querySelector('.chat-down') === null && el.scrollHeight - el.scrollTop - el.clientHeight < 24; })()`),
      );
    }

    // 게스트 탭을 닫아 접속 종료를 만든다
    await browser.send('Target.closeTarget', { targetId: guest.targetId });
    guest.close();

    // ★ 텍스트로 찾으면 안 된다. 참가자 카드의 안내 문구에도 "접속 종료" 가 들어 있어
    //   배지가 없어도 통과한다(이 도구가 처음에 그렇게 오탐했다). 배지 요소를 직접 본다.
    const badge = await host.waitFor(
      "document.querySelector('.seat-card .badge.off') !== null",
      12000,
    );
    record('접속 종료 배지가 5초 유예 뒤 나타난다', badge);

    // ★★★ R041 — 모바일(720): 👥 참여자 창 → 사람 줄 → 강퇴/차단 고르기 → 최종 확인 (옛 R038 "내보내기" 줄을 합쳤다)
    await host.evaluate("document.querySelector('#people-btn')?.click()");
    const peopleUp = await host.waitFor("document.querySelector('.people-modal') !== null", 3000);
    record('★★ R041 모바일 — 👥 를 누르면 참여자 창이 뜬다', peopleUp);
    record(
      '★ 참여자 창 — 사람마다 한 줄 · 접속 종료 표시',
      await host.evaluate("document.querySelectorAll('.people-modal .people-list li').length === 2 && document.querySelector('.people-modal')?.innerText.includes('접속 종료') === true"),
    );
    await host.evaluate("document.querySelector('.people-modal button.people-row')?.click()");
    // ★ R074 (§F ②) — R056 뒤로 사람을 누르면 사람 카드(강퇴 · 차단 버튼)
    const choose = await host.waitFor("document.querySelector('.person-card [data-act=\"kick\"]') !== null && document.querySelector('.people-modal') === null", 3000);
    record('★★★ R041 → R056 — 사람을 누르면 사람 카드(강퇴 · 차단) · 참여자 창은 닫힌다(팝업은 하나)', choose);
    await host.click('강퇴');
    const fin = await host.waitFor("document.querySelector('.confirm-modal[data-kind=\"kick-kick\"]') !== null", 3000);
    record(
      '★★★ R041 — 바로 적용하지 않고 최종 확인 팝업이 한 번 더 (아직 그대로)',
      fin && (await host.evaluate("document.querySelectorAll('.seat-card:not(.empty)').length")) === 2,
    );
    await host.click('내보내기');
    const removed = await host.waitFor("document.querySelectorAll('.seat-card:not(.empty)').length === 1", 8000);
    record('★ 강퇴가 실제로 동작한다 (목록에서 사라진다)', removed);
    record('내보냈다는 시스템 메시지가 보인다', (await host.text()).includes('내보냈습니다'));
    await host.setViewport(1280, 720);
    await sleep(300);

    await leaveViaUi(host);
    await host.waitFor("document.querySelector('.stage') === null", 8000);

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
      "document.body.innerText.includes('방 코드 6자리를 입력해 주세요')",
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

    await leaveViaUi(host);
    await host.waitFor("document.querySelector('.stage') === null", 8000);

    // ─────────────────────────────────────────────────────────────────────────
    // ★★ R034 — 설정 계정 저장: 브라우저 저장소가 빈 곳에서 로그인하면 계정의 테마가 나온다
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[9] ★★ 다른 브라우저에서 로그인 → 계정에 저장된 테마 (R034)');
    const other = await newPage(browser, 'other', true);
    await other.setWidth(720);
    await other.goto(BASE);
    await other.evaluate(`(() => {
      const set = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const i = [...document.querySelectorAll('form input')];
      set(i[0], ${JSON.stringify(`${ACCOUNT_PREFIX}_h`)});
      set(i[1], 'uic1234');
      return true;
    })()`);
    await sleep(150);
    // ★ '로그인' 글자의 버튼이 둘(탭·제출)이라 글자로 누르면 탭이 눌린다 — 폼을 제출한다
    await other.evaluate("document.querySelector('form').requestSubmit()");
    record('다른 브라우저에서 같은 계정으로 로그인 (검사 전제)', await other.waitFor("document.querySelector('.tabs') === null", 8000));
    const otherTheme = await other.waitFor(
      `document.documentElement.dataset.theme === ${JSON.stringify(globalThis.__uicSavedTheme ?? '')}`,
      5000,
    );
    record(
      '★★ 새 브라우저(저장소 비어 있음)에서 로그인하면 계정에 저장된 테마가 적용된다',
      otherTheme,
      `기대=${globalThis.__uicSavedTheme} / 실제=${await other.evaluate('document.documentElement.dataset.theme')}`,
    );
    await browser.send('Target.closeTarget', { targetId: other.targetId });
    other.close();
  }

  // ── ★★ R040 C-4 — 가장 긴 문제·정답·해설: 모바일 360·390·430 에서 화면 스크롤 없이 (글자를 맞춘다)
  {
    console.log('\n[10] ★★ R040 — 가장 긴 문제·정답·해설 (모바일 맞춤 글자)');
    const out = await longFlow(browser, 'long');
    const mob = out.filter((o) => o.size !== 'pc');
    record('★ 긴 글 세 문제를 모두 돌았다 (검사 전제)', new Set(out.map((o) => o.qid)).size >= 2 && mob.length >= 12, `${out.length}건`);
    const scrolled = out.filter((o) => o.pageScroll > 0 || o.hScroll > 0);
    record('★★★ R040 C-4 — 긴 문제·정답·해설에도 화면 스크롤이 없다 (360·390·430·PC · 문제·정답 공개)', scrolled.length === 0, scrolled.map((o) => `${o.qid}/${o.at}/${o.size}:${o.pageScroll}`).join(' '));
    const tooSmall = mob.filter((o) => Number(o.qs ?? 1) < 0.75);
    record('★★ R040 C-4 — 글자는 하한(75%) 아래로 줄지 않는다', tooSmall.length === 0, mob.map((o) => `${o.size}:${o.qs}`).join(' '));
    // ★★★ R041 — 한글 10자 닉네임이 모든 크기(1536×864 포함)에서 "…" 없이 · 자리 밖으로 나가지 않는다
    const nickBad = out.filter((o) => o.nickBad.length > 0);
    record('★★★ R041 A — 한글 10자 닉네임: 1280·1536×864·1536×730·1920·2560·모바일 모두 "…" 없음 · 넘침 없음', nickBad.length === 0, nickBad.map((o) => `${o.size}/${o.at}:${o.nickBad.join(',')}`).join(' | ').slice(0, 300));
    const lap = out.filter((o) => o.size === 'lap' || o.size === 'lap2');
    record('★★ R041 A — 1536×864 에서 한 화면 (스크롤 없음)', lap.length > 0 && lap.every((o) => o.pageScroll === 0 && o.hScroll === 0), lap.map((o) => `${o.size}/${o.at}:${o.pageScroll}`).join(' '));
    // ★★ R041 A — 화면이 클수록 글자가 커진다 (뿌리 글자)
    const root = Object.fromEntries(out.filter((o) => o.at === 'game').map((o) => [o.size, o.rootPx]));
    record(
      '★★ R041 A — 화면 크기별 글자: 1280×720 16 · 1536×864 17.6 · 1920×1080 20 · 2560×1440 24 · 모바일 16 (px)',
      Math.abs(root.pc - 16) < 0.2 && Math.abs(root.lap - 17.6) < 0.2 && Math.abs(root.fhd - 20) < 0.2 && Math.abs(root.qhd - 24) < 0.2 && root.m390 === 16,
      JSON.stringify(root),
    );
    // ★★ R042 G — 가장 긴 해설: 자기 자리 안 · 소감·뒷북·안내와 겹침 0 (모든 크기)
    const exBad = out.filter((o) => o.at === 'reveal' && o.explain && (o.explain.hitCeremony || o.explain.hitLate || o.explain.hitNext || (o.explain.over > 1 && o.explain.clamp !== '1')));
    record('★★★ R042 G — 긴 해설이 자기 자리 안에 있다 · 소감·뒷북 칸과 겹치지 않는다 (모바일 3 · PC 5 크기)', exBad.length === 0, exBad.map((o) => `${o.qid}/${o.size}:${JSON.stringify(o.explain)}`).join(' | ').slice(0, 300));
    const plus = out.filter((o) => o.at === 'reveal' && o.plus);
    record('★★ R041 E-2 — "+1" 이 닉네임 바로 옆 (간격 0~16px · 같은 줄)', plus.length > 0 && plus.every((o) => o.plus.gap >= 0 && o.plus.gap <= 16 && Math.abs(o.plus.dy) <= 8), plus.map((o) => `${o.size}:${JSON.stringify(o.plus)}`).join(' '));
  }
} catch (err) {
  if (!err?.shotsDone) record('실행', false, err.message);
} finally {
  try {
    if (browser) await browser.send('Browser.close').catch(() => {});
  } catch {
    /* 이미 닫혔다 */
  }
  browser?.close();
  browserProc?.kill();
  await cleanupAccounts();
  const restoredHints = await clearUiHints();
  console.log(`[ui-check] 테스트용 일반 힌트 ${restoredHints ?? 0}건을 되돌렸다`);
  stopServer();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n[결과] ${checks.length - failed.length}/${checks.length} 통과`);
for (const f of failed) console.log(`  ★ 실패: ${f.name}  ${f.detail}`);
process.exit(failed.length ? 1 : 0);
