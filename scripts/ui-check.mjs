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
const THEME_IDS = ['pastel', 'pop', 'night'];
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
    if (el.closest('.chat-log')) continue;
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
    // ★ R033 — 3문제를 남긴다. 2번째 문제에서 **정답자 연출**을 보려면 한 문제가 더 필요하다
    const shrunk = await shrinkAvailable(`${ACCOUNT_PREFIX}%`, 3);
    console.log(`  ★ 경험 기록 ${shrunk}행으로 출제 가능 수를 2개로 줄였다`);
    // ★ 참가자 변동이 있어야 서버가 다시 계산한다. 방을 다시 만들어 그 이벤트를 만든다
    await host.click('나가기');
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
        "[...document.querySelectorAll('.card p')].map(p => p.innerText).find(s => s.includes('출제할 수 있는 문제')) ?? ''",
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
      `([...document.querySelectorAll('.card p')].map(p => p.innerText).find(s => s.includes('출제할 수 있는 문제')) ?? '') !== ${JSON.stringify(beforeAvail)}`,
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
      `([...document.querySelectorAll('.card p')].map(p => p.innerText).find(s => s.includes('출제할 수 있는 문제')) ?? '') !== ${JSON.stringify(beforeTopic)}`,
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
      `([...document.querySelectorAll('.card p')].map(p => p.innerText).find(s => s.includes('출제할 수 있는 문제')) ?? '') === ${JSON.stringify(beforeTopic)}`,
      6000,
    );

    // ── ★★ R034 단축키 Alt+T / Alt+M · 계정 저장
    console.log('\n[4-9c] ★★ Alt+T 테마 · Alt+M 소리 · 설정 계정 저장 (R034)');
    const themeBefore = await host.evaluate('document.documentElement.dataset.theme || "pastel"');
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('t', { alt: true });
    const themeAfter = await host.evaluate('document.documentElement.dataset.theme || "pastel"');
    record('★★ Alt+T 로 테마가 바뀐다', themeAfter !== themeBefore, `${themeBefore} → ${themeAfter}`);
    await host.key('m', { alt: true });
    const muted = await host.evaluate("JSON.parse(localStorage.getItem('qw.sound.v1') || '{}')");
    record('★★ Alt+M 으로 소리가 모두 꺼진다', muted.bgmOn === false && muted.sfxOn === false, JSON.stringify(muted));
    await host.key('m', { alt: true });
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
    await host.setWidth(360);
    await sleep(300);
    const scrolled = await host.scrollToBottom();
    record(
      '페이지가 스크롤된다 (검사 전제)',
      // ★ R038 — 모바일에서 참여자 칸을 숨겨 화면이 짧아졌다. 스크롤되기만 하면 전제가 선다
      scrolled.y > 40,
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
      // ★ R035 — 방 안에는 푸터가 없다 (로그아웃은 상단 바 ⚙ 안). 단축키 버튼을 대신 본다
      ['입력 줄 단축키 버튼', '.chat-card .keybar-btn'],
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
    const skipBtn = await host.buttonState('방장 넘기기');
    record('★ 방장에게 "방장 넘기기" 버튼이 있다', skipBtn.exists && skipBtn.visible, JSON.stringify(skipBtn));

    // ★ 확인창이 방향키·Enter·마우스로 조작 가능해야 한다 (guide 23절).
    //   ★ autoFocus 로 Enter 가 바로 먹는지 본다
    await host.click('방장 넘기기');
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
          "[...document.querySelectorAll('.question-card .q-hint')].filter(p => !p.classList.contains('q-hint-general')).length === 0",
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

    // ── Q-56 단축키 안내가 화면에 있다. ★ R034 — 넘기기 투표만 크게(버튼 위), 나머지는 접어 둔다
    const keybar = await host.onScreen('.keybar-btn');
    record(
      '★★ Q-56 — 단축키 버튼이 화면에 보인다 (접혀 있다)',
      keybar.exists && keybar.fullyVisible &&
        (await host.evaluate("document.querySelector('.keylist') === null")),
      JSON.stringify(keybar.rect ?? keybar),
    );
    record(
      '★★ R034 — 넘기기 투표 버튼에 Alt+S 가 크게 붙어 있다 (Q-33: 화면에는 조합키)',
      (await host.evaluate("document.querySelector('.skip-btn kbd')?.innerText ?? ''")) === 'Alt+S',
    );

    // ── ★★★ 단독 문자키는 단축키로 먹지 않는다 (채팅 입력을 방해하지 않는다)
    //   ★ 이것이 Q-56 의 핵심 제약이다. 입력창은 항상 포커스다
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
    record(
      '★★ 단독 키로는 단축키 목록이 열리지 않는다',
      (await host.evaluate("document.querySelector('.keylist') === null")),
    );

    // ── ★ Alt 조합은 문자를 만들지 않고 단축키로 동작한다
    await host.key('g', { alt: true });
    const listOpen = await host.evaluate("document.querySelector('.keylist') !== null");
    record('★★ Alt+G 로 단축키 전체 목록이 열린다', listOpen);
    const stillTyped = await host.evaluate(
      "document.querySelector('.chat-card input')?.value ?? ''",
    );
    record(
      '★★★ Alt 조합은 입력창에 문자를 넣지 않는다',
      stillTyped === 'g',
      `입력창="${stillTyped}"`,
    );
    record(
      '★ 펼친 목록에 F키 안내가 함께 있다 (Q-33)',
      (await host.evaluate("document.querySelector('.keylist')?.innerText ?? ''")).includes('F'),
    );
    await host.key('g', { alt: true });
    record(
      '★ Alt+G 를 다시 누르면 접힌다',
      await host.evaluate("document.querySelector('.keylist') === null"),
    );
    // ★ R034 — F9 도 같은 일을 한다 (단축키 동작 표)
    await host.key('F9');
    const f9open = await host.evaluate("document.querySelector('.keylist') !== null");
    await host.key('F9');
    record(
      '★★ F9 로 단축키 목록이 열리고 다시 F9 로 접힌다',
      f9open && (await host.evaluate("document.querySelector('.keylist') === null")),
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

    // ── ★ R034 — F4 도 방장 넘기기 확인창을 연다 (단축키 동작 표). 아니오로 닫는다
    await host.key('F4');
    const f4open = await host.evaluate("document.querySelector('.confirm') !== null");
    await host.click('아니오');
    await sleep(200);
    record(
      '★★ F4 로 방장 넘기기 확인창이 열린다 (아니오로 닫힌다)',
      f4open && (await host.evaluate("document.querySelector('.confirm') === null")),
    );

    // ── ★★ 단축키가 버튼과 같은 확인창 경로를 탄다 + Enter 만으로 확정된다
    await host.key('k', { alt: true });
    const skipConfirm = await host.evaluate("document.querySelector('.confirm') !== null");
    record('★★ Alt+K 가 방장 넘기기 확인창을 띄운다 (버튼과 같은 경로)', skipConfirm);
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
      await host.waitFor("document.querySelector('.confirm') === null", 4000),
    );
    record(
      '★ 확정 뒤 포커스가 채팅 입력으로 돌아온다',
      Boolean((await host.activeEl())?.inChatCard),
      JSON.stringify(await host.activeEl()),
    );
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

    // ── ★★ Q-82 게임 중 나가기 확인창
    await host.key('x', { alt: true });
    const leaveConfirm = await host.evaluate(
      "document.querySelector('.confirm-card') !== null",
    );
    record('★★ Q-82 — 게임 중 나가기에 확인창이 뜬다', leaveConfirm);
    const leaveText = await host.evaluate(
      "document.querySelector('.confirm-card')?.innerText ?? ''",
    );
    record(
      '★★ 확인창이 "마지막 접속자면 방이 사라진다" 를 알린다',
      leaveText.includes('방이 즉시 사라집니다'),
    );
    record(
      '★★ 끊김과 나가기가 다르다는 사실도 알린다 (Q-82 두 갈래)',
      leaveText.includes('일시정지'),
    );
    await host.click('취소');
    record(
      '★ 취소하면 게임이 그대로다',
      (await host.evaluate("document.querySelector('.confirm-card') === null")) &&
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

      // ★ 단축키로 재개한다 (마우스 없이)
      await host.key('r', { alt: true });
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
      "document.querySelector('.question-card .q-hint-general') !== null && [...document.querySelectorAll('.question-card .q-hint')].some(p => !p.classList.contains('q-hint-general'))",
      45000,
    );
    record('★★ 남은 15초부터 일반 힌트와 초성 힌트가 함께 보인다 (R034)', bothShown);
    if (bothShown) await measureOneScreen(host, '게임 화면 (힌트 두 줄)', { shotName: '2-game' });
    await host.setWidth(720);
    await sleep(250);

    console.log('\n[5-6] ★★ 강제 종료 → 결과 화면 → 로비 복귀 (Phase 3)');
    // ★ R034 — 단축키 Alt+Q 로 연다 (단축키 동작 표)
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('q', { alt: true });
    await sleep(300);
    record(
      '★ Alt+Q 로 강제 종료 확인창이 나타난다',
      await host.evaluate("document.querySelector('.confirm') !== null"),
    );
    // ★ R035 — 여러 해상도를 재는 동안 문제가 시간 종료됐을 수 있다. 그때는 이 알림이 없는 것이 맞다
    const stillActive = await host.evaluate("document.querySelector('.q-timebar') !== null");
    record(
      '★ 확인창이 경험 기록 규칙을 알린다 (문제 진행 중일 때)',
      !stillActive || (await host.text()).includes('경험 기록을 남기지 않습니다'),
      stillActive ? '' : '(이미 정답 공개 중 — 해당 없음)',
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
    // ★ R034 — 단축키 Alt+L (단축키 동작 표)
    await host.key('l', { alt: true });
    const backToLobby = await host.waitFor(
      "document.querySelector('.lobby-card') !== null",
      8000,
    );
    record('★★ Alt+L 로 로비로 복귀한다 (초대 링크 카드가 다시 보인다)', backToLobby);
    record(
      '★ 게임이 자동으로 시작되지 않는다 (guide 38절)',
      await host.evaluate("document.querySelector('.question-card') === null"),
    );

    // ── 방을 비우고 새로 만든다
    await host.click('나가기');
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
    const maskedBubble = await host.waitFor(
      `document.querySelector('.seat-card[data-account="${ids?.g}"] .seat-msg .masked-chip') !== null`,
      5000,
    );
    const bubbleText = await host.evaluate(
      `document.querySelector('.seat-card[data-account="${ids?.g}"] .seat-msg')?.innerText ?? ''`,
    );
    record(
      '★★★ 방장 화면 — 경험자가 쓴 정답이 **참여자 칸 메시지에서도** 가려진다',
      maskedBubble && Boolean(ans1) && !bubbleText.includes(ans1),
      `말풍선="${bubbleText}"`,
    );
    const logText = await host.evaluate("document.querySelector('.chat-log')?.innerText ?? ''");
    record('★★★ 채팅 로그에서도 가려진다 (같은 메시지)', Boolean(ans1) && !logText.includes(ans1));
    record(
      '★ 본인(게스트) 칸 메시지에는 원문 + "가려져서 전송됨"',
      (await guest.evaluate(
        `document.querySelector('.seat-card[data-account="${ids?.g}"] .seat-msg')?.innerText ?? ''`,
      )).includes('가려져서 전송됨'),
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
        count: document.querySelector('.skip-count')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
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
    await host.evaluate("document.querySelector('.skip-btn')?.click()");
    const v1 = await host.waitFor("document.querySelector('.skip-count')?.innerText.replace(/\\s+/g,' ').trim() === '1 / 2'", 4000);
    const s1h = await skipState(host);
    const s1g = await guest.waitFor("document.querySelector('.skip-count')?.innerText.replace(/\\s+/g,' ').trim() === '1 / 2'", 4000);
    const s1gs = await skipState(guest);
    record('★★★ 방장이 투표하면 두 화면 모두 "1 / 2"', v1 && s1g, `방장=${JSON.stringify(s1h)} / 게스트=${JSON.stringify(s1gs)}`);
    record('★★ 투표한 사람 버튼은 "넘기기 취소" 로 바뀐다 (본인 투표 여부)', s1h.pressed === 'true' && /취소/.test(s1h.btn ?? ''));
    record('★★ 안 누른 사람 버튼은 그대로 "넘기기 투표"', s1gs.pressed === 'false' && /투표/.test(s1gs.btn ?? ''));
    // ★ 취소 — 한글 자판 상태를 흉내 낸다 (key 는 'ㄴ', 자판 위치는 S). R034 에서 e.code 로 고친 부분
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('ㄴ', { alt: true, code: 'KeyS', vk: 83 });
    record(
      '★★★ Alt+S (한글 자판 상태에서도) 로 투표가 취소된다 → "0 / 2"',
      await host.waitFor("document.querySelector('.skip-count')?.innerText.replace(/\\s+/g,' ').trim() === '0 / 2'", 4000),
    );
    // ★ 다시 투표 — F2
    await host.key('F2');
    record(
      '★★ F2 로 다시 투표된다 → "1 / 2"',
      await host.waitFor("document.querySelector('.skip-count')?.innerText.replace(/\\s+/g,' ').trim() === '1 / 2'", 4000),
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

    await host.setInput('.chat-card input', ans2 ?? '');
    await host.click('전송');
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
    record(
      '★★★ 결과 화면은 정답 공개 약 8초 뒤에 나온다 (R035)',
      resultUp && waited >= 7300 && waited <= 10500,
      `${waited}ms`,
    );

    // ── ★★ R038 — 결과 화면 방향키: 버튼 사이를 오간다 (글자 사이로 캐럿이 가지 않는다)
    await third.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '나가기')?.click()");
    await host.evaluate("[...document.querySelectorAll('.next-row button')][0]?.focus()");
    await host.key('ArrowRight');
    const afterRight = await host.evaluate("document.activeElement?.innerText.replace(/Alt\\+\\w/, '').trim() ?? ''");
    await host.key('ArrowLeft');
    const afterLeft = await host.evaluate("document.activeElement?.innerText.replace(/Alt\\+\\w/, '').trim() ?? ''");
    record('★★ R038 — 결과 화면에서 → 로 "로비로", ← 로 "다시 하기" 버튼으로 옮겨 간다', afterRight === '로비로' && afterLeft === '다시 하기', `${afterRight} / ${afterLeft}`);
    await browser.send('Target.closeTarget', { targetId: third.targetId });
    third.close();

    // ── ★★ 다시 하기 (Alt+A) — R035: 같은 설정으로 **5초 뒤 바로 시작**
    await host.evaluate("document.querySelector('.chat-card input')?.focus()");
    await host.key('a', { alt: true });
    const againCd =
      (await host.waitFor("document.querySelector('.countdown-box') !== null", 6000)) &&
      (await guest.waitFor("document.querySelector('.countdown-box') !== null", 4000));
    record('★★★ R035 — Alt+A (다시 하기) 를 누르면 두 화면 모두 곧바로 5초 카운트다운', againCd);
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

    // ── 말풍선 (마스킹 없는 보통 말) — 방장이 쓴 말이 게스트 화면의 방장 칸에 뜬다
    await host.setInput('.chat-card input', '말풍선 확인');
    await host.click('전송');
    record(
      '★★ 채팅이 참여자 칸에 뜬다 (마지막 메시지)',
      await guest.waitFor(
        `document.querySelector('.seat-card[data-account="${ids?.h}"] .seat-msg')?.innerText.includes('말풍선 확인') === true`,
        4000,
      ),
    );
    record(
      '★★ R035 — 새 메시지는 반짝 강조된다',
      await guest.evaluate(`document.querySelector('.seat-card[data-account="${ids?.h}"] .seat-msg.fresh') !== null`),
    );
    await sleep(5000);
    record(
      '★★★ R035 — 마지막 메시지가 5초 뒤에도 칸에 그대로 남는다 (사라지지 않는다)',
      (await guest.evaluate(`document.querySelector('.seat-card[data-account="${ids?.h}"] .seat-msg')?.innerText ?? ''`)).includes('말풍선 확인'),
    );

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

    // ★ R038 — 모바일 폭(720)에서는 참여자 칸 대신 위쪽 "내보내기" 줄에 보인다
    const kickMob = await host.onScreen('.mobile-kick button');
    record('★★ R038 모바일 — 방장에게 접속 종료자 "내보내기" 줄이 보인다', kickMob.exists && kickMob.partlyVisible, JSON.stringify(kickMob.rect ?? kickMob));
    await host.setViewport(1280, 720);
    await sleep(300);
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
        "document.querySelectorAll('.seat-card:not(.empty)').length === 1",
        8000,
      );
      record('★ 내보내기가 실제로 동작한다 (목록에서 사라진다)', removed);
      const kickMsg = await host.text();
      record('내보냈다는 시스템 메시지가 보인다', kickMsg.includes('내보냈습니다'));
    }

    await host.click('나가기');
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

    await host.click('나가기');
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
  const restoredHints = await clearUiHints();
  console.log(`[ui-check] 테스트용 일반 힌트 ${restoredHints ?? 0}건을 되돌렸다`);
  stopServer();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n[결과] ${checks.length - failed.length}/${checks.length} 통과`);
for (const f of failed) console.log(`  ★ 실패: ${f.name}  ${f.detail}`);
process.exit(failed.length ? 1 : 0);
