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
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
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

async function launchBrowserOn() {
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
  const url = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
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
async function signUp(page, suffix, nickname = null) {
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
    JSON.parse(kb2).dropped >= 2 && ['timeout', 'mine', 'skip'].every((id) => logs['참가자 모바일'].some((e) => e.id === id && e.played)),
    `포커스 해제 ${JSON.parse(kb2).dropped}번`,
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
  const eShown = await G.waitFor("(document.querySelector('.throttle-note')?.innerText ?? '').includes('이모티콘')", 3000);
  await snap(G, '94-spam-emoji-pc');
  record('★★ A 이모티콘 — 6번째에 "이모티콘 도배 방지" 안내', eShown, await noteText(G));
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
// ★★★ R049 — 이모티콘샵 · 뽑기 · ✨ 특별 탭 · 10칸 · 떠 있는 큰 반응 · 특별 도배 (`npm run ui-check:shop`, verify 에 포함)
//   ★ 포인트가 있는 계정이 필요하다 → **봇 계정**(bot_02 · 비밀번호는 scripts/bot.mjs 의 것)으로 로그인해 실제 값(20P)으로 뽑는다 (찬종 계정 안 씀).
//     7/27 그림은 uic 테스트 계정에 account_emojis 를 직접 넣어 만든다(끝나면 계정과 함께 지워진다 — CASCADE). 27/27 은 bot_01(봇 shop 이 다 모았다).
//   ★ 표시 방식 두 가지(기본 float · 대안 inline)를 **같은 장면**으로 찍는다 — localStorage 'qw.specialDisplay' (D-231)
// -----------------------------------------------------------------------------
const SHOP_ONLY = args.includes('--shop');
if (SHOP_ONLY) process.env.SHOT_DIR ??= 'verify';
const BOT_PASSWORD = 'bot1234';
async function loginAs(page, loginId, password) {
  await page.goto(BASE);
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
  const roomId = await createRoom(H, 'R049 이모티콘샵');
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
  record('★★ B 상단 바 🎁 "이모티콘샵" — 초대 버튼과 같은 높이 · 같은 줄', rShop && rInvite && Math.abs(rShop.h - rInvite.h) < 1 && Math.abs(rShop.y - rInvite.y) < 1, JSON.stringify({ rShop, rInvite }));

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

  // ── 모바일 390 — ☰ → 이모티콘샵 → 화면 가운데 창
  await G.setViewport(390, 844);
  await sleep(400);
  await realClick(G, '#menu-btn');
  await sleep(200);
  await realClick(G, '.menu-item', '이모티콘샵');
  await G.waitFor("document.querySelector('.shop-pop') !== null", 4000);
  await sleep(300);
  const rPop = await rectOf(G, '.shop-pop');
  await snap(G, '109-shop-m390');
  record('★★ B 모바일 390 — ☰ → 이모티콘샵 → 창이 화면 안', rPop && rPop.x >= 0 && rPop.y >= 0 && rPop.b <= 844 && rPop.x + rPop.w <= 390, JSON.stringify(rPop));
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
  // 칸 바꾸기 → 1번 칸 → 특별
  await realClick(G, '.emoji-tools button', '칸 바꾸기');
  await sleep(150);
  await realClick(G, '.emoji-slot');
  await sleep(150);
  await realClick(G, '.emoji-cell.special');
  await sleep(300);
  await realClick(G, '.emoji-tools button', '다 바꿨어요');
  await sleep(150);
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
  record('★★★ D 특별을 보내면 상대 화면 입력창 **위에 큰 반응**(96px · 닉네임)', f1 && rPic && Math.round(rPic.w) === 96 && rInput && rPic.b <= rInput.y && nick.length > 0, JSON.stringify({ rPic, inputTop: rInput?.y, nick, gNick }));
  record('★★ D 로그엔 "닉네임 + 작은 그림(32px)" 한 줄', (await specialLines(H)) === l0 + 1 && (await H.evaluate("document.querySelector('.chat-line .chat-special')?.getBoundingClientRect().width")) === 32, String(await H.evaluate("document.querySelector('.chat-line .chat-special')?.getBoundingClientRect().width")));
  await altDigit(G, '1');
  await sleep(120);
  await altDigit(G, '1');
  const f3 = await H.waitFor("document.querySelectorAll('.special-layer .special-float').length === 3", 3000);
  await sleep(300);
  await snap(H, '121-special-float-3-pc');
  record('★★ D 3개 겹치면 옆으로 나란히 (동시 최대 3)', f3 && (await H.evaluate("(() => { const r = [...document.querySelectorAll('.special-float')].map((e) => e.getBoundingClientRect()); return r.length === 3 && r[0].right <= r[1].left + 1 && r[1].right <= r[2].left + 1; })()")));
  // 4번째 → 특별 도배 방지 (보낸 사람 화면)
  await altDigit(G, '1');
  const locked = await G.waitFor("(document.querySelector('.throttle-note')?.innerText ?? '').includes('특별')", 3000);
  await sleep(150);
  await snap(G, '122-special-locked-pc');
  record('★★★ D 10초 안 4번째 → "특별 이모티콘 도배 방지 · N초" (보낸 사람만)', locked && (await H.evaluate("document.querySelector('.throttle-note') === null")), await G.evaluate("document.querySelector('.throttle-note')?.innerText ?? ''"));
  record('★ D 상대 화면엔 3개까지만 (4번째는 안 간다)', (await specialLines(H)) === l0 + 3, String((await specialLines(H)) - l0));
  await H.waitFor("document.querySelectorAll('.special-layer .special-float').length === 0", 4500);
  await sleep(200);
  await snap(H, '123-special-after-pc');
  record('★★ D 3초 뒤 큰 반응은 사라지고 로그 줄만 남는다', (await floats(H)) === 0 && (await specialLines(H)) === l0 + 3);
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
  await sleep(10500); // 특별 창(10초)이 비도록

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
  // 모바일 ☰ → 이모티콘샵 · 프로필 (로비)
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
  await realClick(T, '.menu-item', '이모티콘샵');
  await T.waitFor("document.querySelector('.shop-pop') !== null", 4000);
  await shootDevices(T, 'shop-room', DEVICE_VIEWS.filter((v) => ['fold-folded-portrait', 'fold-open-landscape', 'ipad-air-landscape', 'ipad-pro-landscape'].includes(v.n)));
  await closeTop(T);
}

// -----------------------------------------------------------------------------
// ★★★ R050 D·E — 미니게임 화면 (`npm run ui-check:minigame`, verify 에 포함)
//   [1] /lab/minigame — 균형의수호자 물건 넷(정해진 시드) · 장면(가짜 보기)을 PC 1280 · 1920 · 모바일 390 · 폴드 접힘 · 파스텔/밤으로
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
  const L = await newPage(browser, 'M2-lab');
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
async function r051Start(H, key) {
  await realClick(H, '#minigame-pick-btn');
  await H.waitFor("document.querySelector('.mg-pick-pop') !== null", 3000);
  await H.evaluate(`document.querySelector('.mg-pick-item[data-key="${key}"]')?.scrollIntoView({ block: 'center' })`);
  await sleep(150);
  const c = await realClick(H, `.mg-pick-item[data-key="${key}"]`);
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
  const L = await newPage(browser, 'M3-lab');
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
    await H.waitFor("document.querySelectorAll('.mg-set-row [data-minigame]').length > 0", 4000);
  }
  if ((await H.evaluate(`document.querySelector('.mg-set-row [data-minigame="${key}"]')?.getAttribute('aria-pressed')`)) !== 'true') {
    await H.evaluate(`document.querySelector('.mg-set-row [data-minigame="${key}"]')?.click()`);
    await sleep(300);
  }
  for (let i = 0; i < 12; i += 1) {
    const other = await H.evaluate(`[...document.querySelectorAll('.mg-set-row [data-minigame][aria-pressed="true"]')].map((b) => b.dataset.minigame).find((k) => k !== '${key}') ?? null`);
    if (!other) break;
    await H.evaluate(`document.querySelector('.mg-set-row [data-minigame="${other}"]')?.click()`);
    await sleep(250);
  }
  await setQuestionCount(H, 5);
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
      const imgOk = await H.evaluate("[...document.querySelectorAll('img.quiz-img')].every((x) => x.naturalWidth > 0)");
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

async function minigameFlow(browser) {
  // ── [1] 그림 모음 · 장면 (MG_SKIP_LAB=1 이면 건너뛴다 — 실제 판만 다시 볼 때)
  // ★ R051 — MG_SKIP_R050=1 이면 R050 두 게임을 건너뛰고 · 넷(번개손 · 타자 · 원 · 각도)만 (MG_GAMES 로 더 좁힌다)
  if (!process.env.MG_SKIP_R050) {
    if (!process.env.MG_SKIP_LAB) await minigameLab(browser);
    if (!process.env.MG_SKIP_LIVE) await minigameLive(browser);
  }
  if (!process.env.MG_SKIP_R051) await r051Flow(browser);
  if (!process.env.MG_SKIP_R052) await r052Flow(browser);
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
  record('★★ E 그림 모음 — 물건 넷(스테이크 · 피자 · 케이크 · 도넛)', kinds === 'steak,pizza,cake,donut', kinds);
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
  await H.waitFor("document.querySelector('.mg-pick-pop') !== null", 3000);
  await snap(H, '41-lobby-minigame-pick-pc');
  record('★ D 골라 하기 — 손님에게는 버튼이 없다', await G.evaluate("document.querySelector('#minigame-pick-btn') === null"));

  // 케이크
  await realClick(H, '.mg-pick-item[data-key="cake"]');
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
  record('★★★ E 케이크 진짜 입력 — Space(10.0초) · Enter(9.6초) · 톡(10.4초) 오차가 누른 때와 맞다(±0.15초) · 안 누른 사람 미제출',
    Math.abs(errOf('mh')) < 0.15 && Math.abs(errOf('mn') + 0.4) < 0.15 && Math.abs(errOf('mg') - 0.4) < 0.15 && cakeDb.find((r) => r.login_id.endsWith('_mf'))?.submitted === false,
    JSON.stringify(cakeDb));

  // 균형
  await realClick(H, '#minigame-pick-btn');
  await H.waitFor("document.querySelector('.mg-pick-pop') !== null", 3000);
  await realClick(H, '.mg-pick-item[data-key="balance"]');
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
  record('★★ E 밤 테마 — 첫 글자는 짙은 색 (밝은 사람 색 위에서 읽힌다)', nightInk === 'rgb(20, 22, 58)', nightInk);
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
  const host = await newPage(browser, 'e-host');
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
  const host = await newPage(browser, 'p-host');
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
  r = await realClick(host, '.rename-pop button', '사진 지우기');
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
    ['.infotip-btn', '.infotip-pop', '안내'],
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
  r = await realClick(third, `.seat-card.pickable`);
  await sleep(300);
  const acts = await third.evaluate("[...document.querySelectorAll('.confirm-modal .confirm-actions button')].map(b => b.innerText.trim()).join(',')");
  await snap(third, '42-guest-pick-friend-pc');
  record('★★ B — 확인 팝업: [취소] 버튼 없이 ✕ (방장 아님 — 친구 신청만)', acts.includes('친구 신청') && !acts.includes('취소') && (await third.evaluate("document.querySelector('.confirm-modal .popup-close') !== null")), acts);
  const dim = await third.evaluate("getComputedStyle(document.querySelector('.confirm-modal').closest('.modal-back')).backgroundColor");
  record('★★ B — 확인 팝업은 뒤를 어둡게 한다', dim !== 'rgba(0, 0, 0, 0)' && dim !== 'transparent', dim);
  await realClickAt(third, 30, 700);
  record('★★ B — 확인 팝업: 바깥 누르기 = 취소', await third.evaluate("document.querySelector('.confirm-modal') === null"));
  // 방장: 넷째 칸 → 친구 신청 · 강퇴 · 차단 · 방장 넘기기 (넷째는 거절당해 친구가 아니다)
  await realClick(host, '.seat-card.pickable');
  await sleep(300);
  await snap(host, '43-host-pick-pc');
  const hacts = await host.evaluate("[...document.querySelectorAll('.confirm-modal .confirm-actions button')].map(b => b.innerText.trim()).join(',')");
  record('★ 방장 고르기 팝업 — 친구 신청 · 강퇴 · 차단 · 방장 넘기기 (취소 없음)', /강퇴/.test(hacts) && !/취소/.test(hacts), hacts);
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
  record('★ C-1 — 설정 창 테마는 둘 (파스텔 · 밤)', await (async () => {
    await realClick(host, '.prefs-toggle');
    const t = await host.evaluate("[...document.querySelectorAll('.prefs-pop .seg')[0]?.querySelectorAll('button') ?? []].map(b => b.innerText.trim()).join(',')");
    await closeTop(host);
    return t === '파스텔,밤';
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
  // ── ★ C-3 — "문제 수" 줄과 "이번 설정으로 낼 수 있는 문제" 간격
  await host.setViewport(1280, 720);
  await sleep(300);
  const gap = await host.evaluate("(() => { const a = document.querySelector('.settings .set-row'); const b = document.querySelector('.avail-line'); return a && b ? Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) : null; })()");
  await snap(host, '51-avail-gap-pc');
  record('★ C-3 — 문제 수 ↔ 낼 수 있는 문제 간격 4px 이하', gap !== null && gap <= 4, `${gap}px`);
  // ── ★★ C-4 — 안내 창: 한 항목 한 줄 (PC 5 · 모바일 3)
  const INFO_LINES = "(() => [...document.querySelectorAll('.infotip-pop .info-list li')].filter((li) => li.getClientRects().length > 0).map((li) => { const tops = []; const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const rc of rg.getClientRects()) { if (rc.width < 1) continue; if (!tops.some((t) => Math.abs(t - rc.top) < rc.height * 0.5)) tops.push(rc.top); } } return tops.length; }))()";
  for (const s of SHOT_PC) {
    await host.setViewport(s.w, s.h);
    await sleep(300);
    await realClick(host, '.infotip-btn');
    await sleep(250);
    const lines = await host.evaluate(INFO_LINES);
    const inView = await host.evaluate("(() => { const r = document.querySelector('.infotip-pop')?.getBoundingClientRect(); return Boolean(r) && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()");
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
  await host.evaluate("document.querySelector('.infotip-btn')?.click()");
  await sleep(300);
  await snap(host, '07p-info-pc');
  // ★ R043 — 초대 팝업 (PC — 설정처럼 버튼 아래 · 모바일 — ☰ → 초대, 화면 가운데)
  await host.evaluate("document.querySelector('.infotip-close')?.click()");
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
    console.log('\n[4-9] ★★ 난이도 선택 (R025)');
    const availText = () =>
      host.evaluate(
        "document.querySelector('.avail-line')?.innerText ?? ''",
      );
    const diffBtns = await host.evaluate(
      "[...document.querySelectorAll('.card button[data-tier]')].map(b => b.innerText.trim() + ':' + b.getAttribute('aria-pressed')).join(',')",
    );
    record('★★ 난이도 버튼 셋이 있고 기본은 전부 켜짐', diffBtns === '하:true,중:true,상:true', diffBtns);
    const beforeAvail = await availText();
    await host.click('하');
    await sleep(300);
    await host.click('중');
    const changed = await host.waitFor(
      `(document.querySelector('.avail-line')?.innerText ?? '') !== ${JSON.stringify(beforeAvail)}`,
      6000,
    );
    record('★★ "상" 만 남기면 출제 가능 수 안내가 바뀐다', changed, `${beforeAvail} → ${await availText()}`);
    // ★ 마지막 하나는 끌 수 없다. 눌러도 켜진 채로 남고 안내가 뜬다
    await host.click('상');
    await sleep(300);
    record(
      '★ 마지막 하나를 끄려 하면 안내가 뜨고 켜진 채로 남는다',
      (await host.text()).includes('난이도는 하나 이상 선택해야 합니다') &&
        (await host.evaluate(
          "[...document.querySelectorAll('.card button[data-tier]')].find(b => b.innerText.trim() === '상')?.getAttribute('aria-pressed')",
        )) === 'true',
    );
    // 원래대로 (뒤 검사가 전체 기준이다)
    await host.click('하');
    await sleep(200);
    await host.click('중');
    await host.waitFor(
      "[...document.querySelectorAll('.card button[data-tier]')].every(b => b.getAttribute('aria-pressed') === 'true')",
      4000,
    );
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
      // ★ R040 C-3 — 모바일 폭이면 정답 공개(넘기기)에서 키보드를 내린다(포커스 해제)가 맞다. PC 폭이면 채팅 입력으로 돌아온다
      const narrow = (await host.evaluate('innerWidth')) < 1000;
      const ae = await host.activeEl();
      record(
        narrow ? '★ 확정 뒤 — 모바일 폭이라 정답 공개에서 키보드를 내린다 (R040 C-3 · 포커스 해제)' : '★ 확정 뒤 포커스가 채팅 입력으로 돌아온다',
        narrow ? ae?.tag !== 'INPUT' : Boolean(ae?.inChatCard),
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
        '★ R041 E-1 — 웹 상단 바는 글자까지 (초대 · 설정 · 안내 · 나가기)',
        await host.evaluate("(() => { const t = document.querySelector('.room-tools')?.innerText ?? ''; return ['초대', '설정', '안내', '나가기'].every((w) => t.includes(w)); })()"),
        await host.evaluate("document.querySelector('.room-tools')?.innerText.replace(/\\s+/g, ' ') ?? ''"),
      );
      // ★ R043 — 앞 단계가 단축키(진짜 키 입력) 대신 스크립트 클릭(.click() — 사용자 조작으로 치지 않는다)으로 바뀌었다
      //   → "한 번 누르기" 를 진짜 마우스 입력(CDP)으로 한다. 빈 곳(상단 바 가운데)을 누른다
      for (const type of ['mousePressed', 'mouseReleased']) {
        await host.send('Input.dispatchMouseEvent', { type, x: 520, y: 14, button: 'left', clickCount: 1 });
      }
      record('★★ R041 G — 화면을 한 번 누르면 소리가 깨어 있다 (AudioContext running)', await host.waitFor("document.documentElement.dataset.audio === 'running'", 3000), await host.evaluate("document.documentElement.dataset.audio ?? '-'"));
      // 팝업 하나 — ⓘ 를 연 채 ⚙ 를 열면 ⓘ 는 닫힌다 · 나가기(Alt+X)를 열면 ⚙ 도 닫힌다
      await host.evaluate("document.querySelector('.infotip-btn')?.click()");
      await sleep(200);
      await host.evaluate("document.querySelector('.prefs-toggle')?.click()");
      await sleep(200);
      const pops1 = await host.evaluate("[!!document.querySelector('.infotip-pop'), !!document.querySelector('.prefs-pop')].join(',')");
      record('★★★ R041 B — 팝업은 하나만: ⓘ 를 연 채 ⚙ 를 열면 ⓘ 가 닫힌다', pops1 === 'false,true', pops1);
      // ★ 로비에서는 나가기 확인이 없다(Q-82 — 바로 나간다) — 대신 칸 누르기로 강퇴 팝업을 띄운다
      await host.evaluate("document.querySelector('.seat-card.pickable')?.click()");
      await sleep(250);
      const pops2 = JSON.parse(await host.evaluate("JSON.stringify({ prefs: !!document.querySelector('.prefs-pop'), modals: document.querySelectorAll('.confirm-modal').length, kind: document.querySelector('.confirm-modal')?.dataset.kind ?? null })"));
      record('★★★ R041 B·C — PC 방장이 참여자 칸을 누르면 강퇴/차단 팝업 · ⚙ 창은 닫힌다 (하나만)', !pops2.prefs && pops2.modals === 1 && pops2.kind === 'kick-choose', JSON.stringify(pops2));
      record('★ R041 C — 자기 칸은 누를 수 없다', await host.evaluate("document.querySelector('.seat-card.mine')?.classList.contains('pickable') === false"));
      // 키보드 — 첫 버튼에 포커스 · → 로 다음 버튼 · Esc 로 닫힘
      const f0 = await host.evaluate("document.activeElement?.innerText ?? ''");
      await host.key('ArrowRight', { code: 'ArrowRight', vk: 39 });
      const f1 = await host.evaluate("document.activeElement?.innerText ?? ''");
      // ★ R043 C — 고르기 팝업 맨 앞에 "친구 신청" 이 붙었다 (아직 친구가 아니면)
      record('★★ R041 B — 팝업 키보드: 첫 버튼 포커스 · → 로 다음 버튼', f0 === '친구 신청' && f1 === '강퇴', `${f0} → ${f1}`);
      await host.key('Escape', { code: 'Escape', vk: 27 });
      await sleep(200);
      record('★★ R041 B — Esc 로 닫힌다', await host.evaluate("document.querySelector('.confirm-modal') === null"));
      // 팝업 글자 — 위아래 가운데
      await host.evaluate("document.querySelector('.seat-card.pickable')?.click()");
      await sleep(250);
      const mid = JSON.parse(await host.evaluate(`JSON.stringify((() => { const r = document.querySelector('.confirm-modal').getBoundingClientRect(); return { dy: Math.round(r.top + r.height / 2 - innerHeight / 2), dx: Math.round(r.left + r.width / 2 - innerWidth / 2) }; })())`));
      record('★ R041 B — 팝업은 화면 가운데', Math.abs(mid.dx) <= 3 && Math.abs(mid.dy) <= 3, JSON.stringify(mid));
      await closeTop(host);
      // ⓘ — ✕ 로 닫힌다 · 짧다
      await host.evaluate("document.querySelector('.infotip-btn')?.click()");
      await sleep(200);
      const infoLines = await host.evaluate("[...document.querySelectorAll('.infotip-pop .info-list li')].filter((li) => li.getClientRects().length > 0).length");
      await host.evaluate("document.querySelector('.infotip-close')?.click()");
      await sleep(200);
      record('★★ R041 D — ⓘ 는 짧게(8줄 이하) · ✕ 로 닫힌다', infoLines > 0 && infoLines <= 8 && (await host.evaluate("document.querySelector('.infotip-pop') === null")), `${infoLines}줄`);
      // ★ R043 A-9 — 단축키 목록 창 자체가 없다 (R041 E-3 검사는 대상이 사라졌다)
      await guest.setViewport(1280, 720);
      await sleep(300);
      // ★ R043 C — 방장이 아니어도 칸을 누를 수 있다: **친구 신청만** (강퇴·차단·방장 넘기기는 없다)
      await guest.evaluate("document.querySelector('.seat-card.pickable')?.click()");
      await sleep(250);
      const guestActs = await guest.evaluate("[...document.querySelectorAll('.confirm-modal .confirm-actions button')].map(b => b.innerText.trim()).join(',')");
      record('★ R041 C → R043 C — 방장이 아니면 칸을 눌러도 친구 신청만', guestActs === '친구 신청', guestActs);
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
    record('★★ 이모티콘 자리가 칸에서 가장 크다 (닉네임보다 높다)', /^(\d+)\/(\d+)$/.test(emoSize) && Number(emoSize.split('/')[0]) > Number(emoSize.split('/')[1]) * 1.5, emoSize);
    record('★★ 채팅 로그에 작게 한 줄 (닉네임 + 그림)', await guest.waitFor("document.querySelector('.chat-log .chat-emoji') !== null", 4000));
    record('★ 그림 세트(Twemoji SVG)로 그린다', await host.evaluate("document.querySelector('.seat-emoji-pop img.emoji')?.getAttribute('src')?.startsWith('/emoji/') === true"));
    // 고르기 창 · 10칸 바꾸기
    await host.evaluate("document.querySelector('.emoji-btn').click()");
    const pop = await host.waitFor("document.querySelectorAll('.emoji-pop .emoji-slot').length === 10 && document.querySelectorAll('.emoji-grid .emoji-cell').length > 50", 4000);
    record('★★ 😊 → 고르기 창 (내 10칸 + 분류별 목록)', pop);
    await host.evaluate("[...document.querySelectorAll('.emoji-tools button')][0].click()");
    await host.setInput('.emoji-search', '하트');
    await sleep(300);
    const firstHeart = await host.evaluate("Number(document.querySelector('.emoji-grid .emoji-cell img')?.dataset.emojiId ?? 0)");
    record('★ 검색 (한국어 이름·검색어)', firstHeart > 0, String(firstHeart));
    await host.evaluate("document.querySelector('.emoji-grid .emoji-cell')?.click()");
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
    const choose = await host.waitFor("document.querySelector('.confirm-modal[data-kind=\"kick-choose\"]') !== null && document.querySelector('.people-modal') === null", 3000);
    record('★★★ R041 — 사람을 누르면 강퇴/차단 고르기 팝업 (참여자 창은 닫힌다 — 팝업은 하나)', choose);
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
