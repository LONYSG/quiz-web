// =============================================================================
// ★★★ R125 B — 화면 넓게 훑기(`node scripts/ui-check.mjs --r125=sweep` · SHOT_DIR=r125)
//   서버 스위치: GONGBANG=1 SOLO=1 BELT=1 (SOLO_TEST_TIME_MS=60000 이면 혼자 하기 문제가 길다)
//   B1 — 누른 뒤 "덜 그려진 모습" 0: 문서가 뜰 때부터 지켜보는 눈(addScriptToEvaluateOnNewDocument)이
//        "불러오는 중" · "?P" · 자리만 잡은 칸(*-wait)이 **한 프레임이라도** 생기면 적는다 · 화면마다 누르기 전에 지우고 누른 뒤 읽는다.
//   B2 — 화면에 개발 말(BAD_REQUEST 같은 대문자 코드 · Failed to fetch · undefined · null)이 보이면 적는다.
//   B3 — 화면 글(문제 글 · 해설 · 정답 · 이름 칸 제외)에 '·'가 보이면 적는다.
//   B4 · B5 — 큰 틀 스크롤 0: 화면 × 크기 표(문서 전체 세로 · 가로) · 사진.
//   B6 — 모바일 꼴(휴대폰 390 · 좁힌 PC 창 990)에서 단축키가 듣는다.
//   C1 — 문제 카드 머리 = 등급 말 + 점 다섯(같이 하기 · 혼자 하기) · 방 머리 = 방 난이도.
// =============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const R125_SIZES = [
  { w: 1536, h: 864, n: 'pc1536', m: false },
  { w: 1920, h: 1080, n: 'pc1920', m: false },
  { w: 1366, h: 768, n: 'pc1366', m: false },
  { w: 1280, h: 720, n: 'pc1280', m: false },
  { w: 2560, h: 1440, n: 'pc2560', m: false },
  { w: 1000, h: 700, n: 'pc1000', m: false },
  { w: 990, h: 700, n: 'pc990', m: false },
  { w: 390, h: 844, n: 'm390', m: true },
  { w: 360, h: 740, n: 'm360', m: true },
];

// 문서가 뜰 때부터 지켜보는 눈 — 덜 그려진 모습 · 개발 말 · 첫 로비 그림
const WATCH = `(() => {
  window.__bad = [];
  window.__lobbyFirst = null;
  const WAIT = '.person-ach-wait, .person-belt-wait, .ach-all-wait, .stats-wait, .shop-wait, .fb-wait, .dir-wait';
  const scan = () => {
    const b = document.body;
    if (!b) return;
    const t = b.innerText || '';
    if (t.includes('불러오는 중')) window.__bad.push({ at: performance.now(), what: '불러오는 중' });
    if (/(^|[^0-9])\\?P/.test(t)) window.__bad.push({ at: performance.now(), what: '?P' });
    const w = document.querySelector(WAIT);
    if (w) window.__bad.push({ at: performance.now(), what: 'wait:' + w.className });
    if (!window.__lobbyFirst && document.querySelector('[data-gb-together]')) {
      window.__lobbyFirst = { belt: !!document.querySelector('[data-gb-belt]'), at: performance.now() };
    }
  };
  const start = () => {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
    scan();
  };
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start);
})();`;

export async function r125SweepFlow(ctx) {
  const { browser, BASE, ROOT, sleep, snap, record, realClick, signUp, setTheme, newPage, touchDevice, withPg, ACCOUNT_PREFIX } = ctx;
  const SHOT = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r125');
  mkdirSync(SHOT, { recursive: true });
  const site = await (await fetch(`${BASE}/api/site`)).json();
  if (!site.gongbang || !site.solo) {
    record('★ R125 sweep — 서버 스위치 GONGBANG=1 SOLO=1 BELT=1 로 돌려야 한다', false, JSON.stringify(site));
    return;
  }
  const J = async (page, js) => JSON.parse(await page.evaluate(`JSON.stringify(${js})`));
  const has = async (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)}) !== null`);
  const waitSel = (page, sel, ms = 8000) => page.waitFor(`document.querySelector(${JSON.stringify(sel)}) !== null`, ms);
  const size = async (page, s) => {
    await touchDevice(page, s.w, s.h, s.m);
    if (!s.m) await page.setViewport(s.w, s.h);
    await sleep(350);
  };
  const press = async (page, key, code = key, mods = 0) => {
    const vk = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'F2' ? 113 : /^\d$/.test(key) ? 48 + Number(key) : /^[A-Z]$/.test(key) ? key.charCodeAt(0) : 0;
    await page.send('Input.dispatchKeyEvent', { type: mods ? 'rawKeyDown' : 'keyDown', key, code, modifiers: mods, windowsVirtualKeyCode: vk });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers: mods, windowsVirtualKeyCode: vk });
    await sleep(250);
  };
  const ALT = 1;

  // ── 표
  const fit = {};
  const bad1 = [];
  const devWords = [];
  const dots = [];
  const checkFit = async (page, screen, s) => {
    const f = await J(page, "({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth })");
    const ok = f.sh <= f.ih && f.sw <= f.iw + 1;
    (fit[screen] ??= {})[s.n] = ok ? 'OK' : `넘침 세로 ${f.sh - f.ih} 가로 ${f.sw - f.iw}`;
    record(`★★★ R125 B4 ${screen} ${s.w}×${s.h} — 큰 틀 스크롤 0`, ok, JSON.stringify(f));
    return ok;
  };
  /** 화면 글 훑기 — 개발 말 · '·'(문제 글 · 해설 · 정답 · 사람 이름 · 방 제목 · 채팅 제외) */
  const SCAN = `(() => {
    const skip = (el) => el.closest('.q-text, .badge.cat, [data-draw-topic], [data-solo-expl], .solo-expl, .reveal, .solo-reveal-big, .solo-wq, .chat-line, .chat-log, .seat-name, .nick, .room-title h1, [data-wrap-ok].explain, .explain-text, .song-reveal-text, .fb-list, .dir-row-title, .person-ach-list, .ach-all, title, script, style, [hidden]');
    const out = { dev: [], dots: [] };
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = (n.textContent || '').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || skip(el)) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (/\\b[A-Z]{2,}_[A-Z_]{2,}\\b|Failed to fetch|NetworkError|\\bundefined\\b|\\bnull\\b|\\bNaN\\b|\\[object /.test(t)) out.dev.push(t.slice(0, 60));
      if (t.includes('·')) out.dots.push(t.slice(0, 60));
    }
    return out;
  })()`;
  const scanText = async (page, screen) => {
    const r = await J(page, SCAN);
    for (const d of r.dev) devWords.push(`${screen}: ${d}`);
    for (const d of r.dots) dots.push(`${screen}: ${d}`);
  };
  /** 누르기 전 눈을 비우고 → 누르고 → 1.2초 뒤 읽는다 */
  const opened = async (page, label, act, readySel) => {
    await page.evaluate('window.__bad = []');
    await act();
    if (readySel) await waitSel(page, readySel, 6000).catch(() => false);
    await sleep(1200);
    const b = await J(page, '(window.__bad ?? []).map((x) => x.what)');
    const uniq = [...new Set(b)];
    if (uniq.length) bad1.push(`${label}: ${uniq.join(', ')}`);
    record(`★★★ R125 B1 ${label} — 누른 뒤 "불러오는 중" · "?P" · 빈 자리가 한 프레임도 없다`, uniq.length === 0, JSON.stringify(uniq));
    return uniq.length === 0;
  };

  const keyRows = [];
  const keyCheck = async (page, label, s, fn) => {
    const ok = await fn();
    keyRows.push({ label, size: s.n, ok });
    record(`★★★ R125 B6 ${label} — ${s.n}(모바일 꼴)에서 듣는다`, ok, '');
  };

  // ── 손님 봇
  const { io: ioc } = await import('socket.io-client');
  const bots = [];
  const bot = async (tag, nick) => {
    const loginId = `${ACCOUNT_PREFIX}_${tag}`.toLowerCase();
    const body = JSON.stringify({ loginId, password: 'uic1234', nickname: nick });
    let res = await fetch(`${BASE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (res.status !== 200) res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password: 'uic1234' }) });
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('qw_session=')) ?? '';
    const s = ioc(BASE, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    await new Promise((r) => s.once('connect', r));
    s.epoch = null;
    s.on('question.started', (p) => (s.epoch = p.epoch));
    bots.push(s);
    return s;
  };

  // ━━━━━━━━ 1. 로비(공방 첫 화면) ━━━━━━━━
  const H = await newPage(browser, 'r125-host', true);
  await H.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
  await size(H, R125_SIZES[0]);
  await signUp(H, 'r125h', '바른도장');
  const loginId = `${ACCOUNT_PREFIX}_r125h`.toLowerCase();
  const myId = await withPg(async (c) => {
    const a = (await c.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [loginId])).rows[0];
    if (a) await c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, 200, 'admin', 'ui-check r125')`, [a.id]);
    return a?.id ?? null;
  });
  await waitSel(H, '[data-gb-solo]');
  // 새로 고침 — 로비 첫 그림에 띠 줄이 이미 있나(앱이 켜질 때 같이 받음)
  await H.goto(BASE);
  await waitSel(H, '[data-gb-together]', 10000);
  await sleep(1500);
  const lf = await J(H, '({ first: window.__lobbyFirst, bad: [...new Set((window.__bad ?? []).map((x) => x.what))] })');
  record('★★★ R125 B1 로비 — 첫 그림에 띠 줄이 이미 있다 · 덜 그려진 것 없음(새로 고침)', lf.first?.belt === true && lf.bad.length === 0, JSON.stringify(lf));
  if (lf.bad.length) bad1.push(`로비 첫 그림: ${lf.bad.join(', ')}`);
  for (const s of R125_SIZES) {
    await size(H, s);
    await checkFit(H, '로비', s);
    await snap(H, `r125-lobby-${s.n}-pastel`);
  }
  await scanText(H, '로비');
  await size(H, R125_SIZES[0]);

  // ── B1 · 창 하나씩(PC 1536)
  await opened(H, '내 사람 카드(프로필 줄)', () => realClick(H, '[data-gb-me]'), '.person-card');
  await scanText(H, '내 사람 카드');
  await snap(H, 'r125-b1-personcard-me-pc1536-pastel');
  await opened(H, '전체 업적', () => realClick(H, '.person-card .person-all-btn'), '.ach-all-modal');
  await snap(H, 'r125-b1-ach-all-pc1536-pastel');
  await press(H, 'Escape');
  await press(H, 'Escape');
  await opened(H, '프로필 창(포인트)', async () => {
    await realClick(H, '#gb-menu-btn');
    await waitSel(H, '[data-gb-menu-pop]');
    await realClick(H, '[data-menu="profile"]');
  }, '.rename-pop');
  await scanText(H, '프로필 창');
  await snap(H, 'r125-b1-profile-pc1536-pastel');
  await opened(H, '전적 창', () => realClick(H, '.rename-pop .stats-open'), '.stats-modal');
  await scanText(H, '전적 창');
  await snap(H, 'r125-b1-stats-pc1536-pastel');
  await press(H, 'Escape');
  await press(H, 'Escape');
  await opened(H, '포인트샵', async () => {
    await realClick(H, '#gb-menu-btn');
    await waitSel(H, '[data-gb-menu-pop]');
    await realClick(H, '[data-menu-shop]');
  }, '.shop-pop');
  await scanText(H, '포인트샵');
  await snap(H, 'r125-b1-shop-pc1536-pastel');
  for (const s of [R125_SIZES[0], R125_SIZES[3], R125_SIZES[7], R125_SIZES[8]]) {
    await size(H, s);
    await checkFit(H, '포인트샵', s);
  }
  await size(H, R125_SIZES[0]);
  await press(H, 'Escape');
  await opened(H, '안내', async () => {
    await realClick(H, '#gb-menu-btn');
    await waitSel(H, '[data-gb-menu-pop]');
    await realClick(H, '[data-menu="info"]');
  });
  await scanText(H, '안내');
  for (const s of [R125_SIZES[0], R125_SIZES[3], R125_SIZES[7], R125_SIZES[8]]) {
    await size(H, s);
    await checkFit(H, '안내', s);
    await snap(H, `r125-info-${s.n}-pastel`);
  }
  await size(H, R125_SIZES[0]);
  await press(H, 'Escape');

  // ── 공방 목록 — 다른 사람의 방 셋(종류마다) · 탭을 바꿔도 곧바로 다 그려짐(모바일 목록 화면)
  const gq = await bot('r125gq', '목록퀴즈');
  const gd = await bot('r125gd', '목록캐치');
  const gl = await bot('r125gl', '목록라이어');
  for (const [b, kind, title] of [[gq, 'quiz', '퀴즈방하나'], [gd, 'draw', '캐치방하나'], [gl, 'liar', '라이어방하나']]) {
    b.emit('room.create', { title, kind, maxPlayers: 8 });
  }
  await sleep(1500);
  await size(H, R125_SIZES[7]);
  await sleep(500);
  await opened(H, '공방 목록 열기(모바일)', () => realClick(H, '[data-gb-together]'), '[data-dir-list]');
  for (const k of ['draw', 'liar', 'quiz']) {
    await opened(H, `공방 목록 탭 ${k}`, () => realClick(H, `[data-dir-tab="${k}"]`), `[data-dir-list="${k}"]`);
  }
  await scanText(H, '공방 목록');
  // B6 — 잠긴 방 숫자판: 모바일 꼴에서 숫자 키 · Backspace · Enter(틀림 → 남은 횟수 줄) · Esc 닫기
  gq.emit('room.updateAccess', { password: '4321' });
  await sleep(1600);
  if (await has(H, '[data-dir-tab="quiz"]')) await realClick(H, '[data-dir-tab="quiz"]');
  await sleep(600);
  const lockedSel = '[data-room-code][data-locked="1"]';
  if (await has(H, lockedSel)) {
    await realClick(H, lockedSel);
    await waitSel(H, '[data-gb-lock-pop]', 4000).catch(() => false);
    await keyCheck(H, '잠긴 방 숫자판 숫자 키 · Backspace · Enter', R125_SIZES[7], async () => {
      for (const d of ['1', '2', '3']) await press(H, d, `Digit${d}`);
      const three = await H.evaluate("[...document.querySelectorAll('[data-gb-lock-pop] .pin span')].filter((e) => e.textContent.trim()).length");
      await press(H, 'Backspace', 'Backspace');
      const two = await H.evaluate("[...document.querySelectorAll('[data-gb-lock-pop] .pin span')].filter((e) => e.textContent.trim()).length");
      for (const d of ['9', '9']) await press(H, d, `Digit${d}`);
      await press(H, 'Enter');
      await sleep(800);
      const msg = await H.evaluate("document.querySelector('[data-gb-lock-msg]')?.innerText ?? ''");
      return three === 3 && two === 2 && /남았어요|틀렸어요/.test(msg);
    });
    await snap(H, 'r125-lock-wrong-m390-pastel');
    await keyCheck(H, '잠긴 방 Esc 닫기', R125_SIZES[7], async () => {
      await press(H, 'Escape');
      return !(await has(H, '[data-gb-lock-pop]'));
    });
  } else record('★ R125 B6 잠긴 방 — 목록에 잠긴 방이 안 보임', false, '');
  for (const s of [R125_SIZES[7], R125_SIZES[8]]) {
    await size(H, s);
    await checkFit(H, '공방 목록(모바일)', s);
    await snap(H, `r125-dir-${s.n}-pastel`);
  }
  await H.evaluate('history.back()');
  await sleep(600);
  for (const b of [gq, gd, gl]) b.disconnect();
  await size(H, R125_SIZES[0]);

  // ── B6 — 모바일 꼴 로비: Alt+T 테마 · Alt+M 소리 · Alt+B 제보 · Esc 닫기
  for (const s of [R125_SIZES[7], R125_SIZES[6]]) {
    await size(H, s);
    const ui = await H.evaluate("document.documentElement.dataset.ui ?? ''");
    record(`★ R125 B6 ${s.n} — 모바일 꼴이다`, ui === 'mobile', ui);
    // ★ Alt+T · Alt+M 은 R043 A-9(찬종)에서 꺼 둔 단축키(Prefs.tsx 주석) — 듣지 않는 것이 맞다
    await keyCheck(H, '로비 Alt+B 제보 · Esc 닫기', s, async () => {
      await press(H, 'b', 'KeyB', ALT);
      const open = await has(H, '.report-modal');
      await press(H, 'Escape');
      const closed = !(await has(H, '.report-modal'));
      return open && closed;
    });
    await keyCheck(H, '로비 메뉴 Esc 닫기', s, async () => {
      await realClick(H, '#gb-menu-btn');
      const open = await has(H, '[data-gb-menu-pop]');
      await press(H, 'Escape');
      return open && !(await has(H, '[data-gb-menu-pop]'));
    });
  }
  await size(H, R125_SIZES[0]);

  // ━━━━━━━━ 2. 방(퀴즈) — 설정 세 모드 · 게임 · 공개 · 결과 ━━━━━━━━
  await realClick(H, '[data-gb-together]');
  await sleep(500);
  await realClick(H, '[data-gb-make]');
  await waitSel(H, '[data-gb-create]');
  await realClick(H, '[data-gb-create] [data-kind="quiz"]');
  await H.setInput('[data-gb-title]', '바른도장 방');
  await realClick(H, '[data-gb-create] .big-btn');
  await H.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 10000);
  await sleep(800);
  const roomId = await H.evaluate("location.pathname.split('/')[2] ?? ''");
  const toMode = async (kind) => {
    await realClick(H, '[data-gb-mode-btn]');
    await waitSel(H, '[data-gb-mode-pop]');
    await sleep(200);
    await realClick(H, `[data-gb-mode-pop] [data-kind="${kind}"]`);
    await sleep(150);
    await realClick(H, '[data-gb-mode-go]');
    await H.waitFor(`document.querySelector('[data-gb-kind-row]')?.dataset.gbKindRow === '${kind}'`, 6000);
    await sleep(500);
  };
  for (const kind of ['draw', 'liar', 'quiz']) {
    await size(H, R125_SIZES[0]);
    await toMode(kind);
    for (const s of R125_SIZES) {
      await size(H, s);
      await checkFit(H, `방 설정 ${kind}`, s);
      if (['pc1536', 'pc2560', 'pc990', 'm360'].includes(s.n)) await snap(H, `r125-settings-${kind}-${s.n}-pastel`);
    }
    await scanText(H, `방 설정 ${kind}`);
  }
  await size(H, R125_SIZES[0]);
  // C1 — 방 머리 = 방 난이도(퀴즈 방)
  const head = await J(H, "({ level: document.querySelector('.room-head .room-level')?.innerText ?? null })");
  record('★★★ R125 C1 — 방 머리에 방 난이도(초급 · 중급 · 고급)', /초급|중급|고급/.test(head.level ?? ''), JSON.stringify(head));
  // 손님 하나 → 문제 셋
  const g1 = await bot('r125g1', '손님도장');
  g1.emit('room.join', { roomId });
  await sleep(1000);
  await H.setInput('.count-input', '3');
  await sleep(500);
  // B1 — 사람 카드(손님 자리) — 손님 업적 · 띠는 앉는 순간 미리 읽었다
  await sleep(800);
  const seatSel = `[data-person="${(await J(H, `(() => { const ids = [...document.querySelectorAll('[data-person]')].map((e) => e.dataset.person); return ids; })()`)).find((x) => x !== myId) ?? ''}"]`;
  if (await has(H, seatSel)) {
    await opened(H, '손님 사람 카드', () => realClick(H, seatSel), '.person-card');
    await snap(H, 'r125-b1-personcard-guest-pc1536-pastel');
    await press(H, 'Escape');
  } else {
    // 자리 칸(사진 없음)을 누른다
    const seat = await J(H, "(() => { const els = [...document.querySelectorAll('.seat, [data-seat]')]; const i = els.findIndex((e) => !(e.innerText || '').includes('바른도장')); return i; })()");
    if (seat >= 0) {
      await opened(H, '손님 사람 카드(자리)', () => H.evaluate(`[...document.querySelectorAll('.seat, [data-seat]')][${seat}].click()`), '.person-card');
      await press(H, 'Escape');
    } else record('★ R125 B1 손님 사람 카드 — 자리를 못 찾음', false, '');
  }
  await realClick(H, '[data-start-btn]');
  await H.waitFor("document.querySelector('.question-card .q-text') !== null", 15000);
  await sleep(800);
  // C1 — 문제 카드 머리 = 등급 점 다섯
  const pill = await J(H, "(() => { const p = document.querySelector('.question-card .grade-pill'); return p ? { grade: Number(p.dataset.grade), dots: p.querySelectorAll('.grade-dots i').length, on: p.querySelectorAll('.grade-dots i.on').length, word: p.querySelector('.grade-word')?.innerText ?? '', diffText: [...document.querySelectorAll('.q-head .badge.diff')].map((e) => e.innerText).join('|') } : null; })()");
  record('★★★ R125 C1 같이 하기 — 문제 카드 머리 = 등급 말 + 점 다섯(켜진 점 = 등급) · "난이도 중급" 글 없음', pill && pill.dots === 5 && pill.on === pill.grade && pill.word.length > 0 && !/난이도/.test(pill.diffText), JSON.stringify(pill));
  for (const s of R125_SIZES) {
    await size(H, s);
    await checkFit(H, '게임 문제', s);
    if (['pc1536', 'pc1280', 'pc2560', 'm390', 'm360'].includes(s.n)) await snap(H, `r125-game-q-${s.n}-pastel`);
  }
  await scanText(H, '게임 문제');
  await size(H, R125_SIZES[0]);
  // B6 — 게임 중 모바일 꼴: Alt+S 스킵 투표 · Esc → 입력칸 · Enter 보내기 · Alt+1 이모티콘
  for (const s of [R125_SIZES[7], R125_SIZES[6]]) {
    await size(H, s);
    if (!(await has(H, '.question-card .q-text')) || (await has(H, '.reveal'))) break;
    await keyCheck(H, '게임 Alt+S 스킵 투표', s, async () => {
      const before = Number(await H.evaluate("document.querySelector('[data-votes]')?.dataset.votes ?? -1"));
      await press(H, 's', 'KeyS', ALT);
      await sleep(400);
      const after = Number(await H.evaluate("document.querySelector('[data-votes]')?.dataset.votes ?? -1"));
      await press(H, 's', 'KeyS', ALT); // 되돌림(투표 취소)
      return after !== before;
    });
    await keyCheck(H, '게임 Esc → 입력칸 초점', s, async () => {
      await H.evaluate('document.activeElement?.blur()');
      await press(H, 'Escape');
      return H.evaluate("document.activeElement?.matches?.('.chat-card input') ?? false");
    });
    await keyCheck(H, '게임 Alt+1 이모티콘', s, async () => {
      const n0 = await H.evaluate("document.querySelectorAll('.chat-emoji').length");
      await press(H, '1', 'Digit1', ALT);
      await sleep(500);
      return (await H.evaluate("document.querySelectorAll('.chat-emoji').length")) > n0;
    });
  }
  await size(H, R125_SIZES[0]);
  // 공개(손님이 맞힘)
  const qtext = await H.evaluate("document.querySelector('.q-text')?.dataset.text ?? ''");
  const ans = await withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [qtext])).rows[0]?.answer_text ?? '');
  g1.emit('chat.send', { text: ans, epoch: g1.epoch });
  await H.waitFor("document.querySelector('.reveal') !== null", 8000).catch(() => false);
  await sleep(500);
  for (const s of R125_SIZES) {
    await size(H, s);
    await checkFit(H, '정답 공개', s);
    if (['pc1536', 'pc1280', 'm360'].includes(s.n)) await snap(H, `r125-game-reveal-${s.n}-pastel`);
  }
  await size(H, R125_SIZES[0]);
  // 나머지 두 문제는 방장 스킵(Alt+K 는 꺼져 있다 — 소켓으로)
  for (let i = 0; i < 2; i++) {
    await H.waitFor("document.querySelector('.question-card .q-text') !== null && document.querySelector('.reveal') === null", 20000).catch(() => false);
    await sleep(300);
    const t2 = await H.evaluate("document.querySelector('.q-text')?.dataset.text ?? ''");
    const a2 = await withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [t2])).rows[0]?.answer_text ?? '');
    g1.emit('chat.send', { text: a2, epoch: g1.epoch });
    await H.waitFor("document.querySelector('.reveal') !== null", 8000).catch(() => false);
  }
  await H.waitFor("document.querySelector('.result-card') !== null", 30000).catch(() => false);
  await sleep(800);
  for (const s of R125_SIZES) {
    await size(H, s);
    await checkFit(H, '결과', s);
    if (['pc1536', 'pc1280', 'pc2560', 'm390', 'm360'].includes(s.n)) await snap(H, `r125-result-${s.n}-pastel`);
  }
  await scanText(H, '결과');
  await size(H, R125_SIZES[0]);
  // 로비로 → "지난 판 문제" 창(결과 화면이 이미 받은 목록)
  await H.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.includes('로비로'))?.click()");
  await H.waitFor("document.querySelector('#feedback-last-btn') !== null", 10000).catch(() => false);
  await sleep(800);
  if (await has(H, '#feedback-last-btn')) {
    await opened(H, '지난 판 문제', () => realClick(H, '#feedback-last-btn'), '.fb-modal');
    await snap(H, 'r125-b1-lastgame-pc1536-pastel');
    for (const s of [R125_SIZES[0], R125_SIZES[8]]) {
      await size(H, s);
      await checkFit(H, '지난 판 문제', s);
    }
    await size(H, R125_SIZES[0]);
    await press(H, 'Escape');
  } else record('★ R125 B1 지난 판 문제 — 버튼이 안 보임', false, '');
  // B6 — 캐치 그리기 도구 키(P · E · B)와 라이어 Tab(설명 기록) — 모바일 꼴
  const g2 = await bot('r125g2', '손님둘도장');
  g2.emit('room.join', { roomId });
  await sleep(800);
  await size(H, R125_SIZES[0]);
  await toMode('draw');
  await realClick(H, '[data-start-btn]');
  await H.waitFor("document.querySelector('.draw-stage, [data-draw-stage], [data-draw-keyword]') !== null", 15000).catch(() => false);
  await size(H, R125_SIZES[7]);
  await H.waitFor("document.querySelector('[data-draw-tools]') !== null", 25000).catch(() => false);
  if (await has(H, '[data-draw-tools]')) {
    await keyCheck(H, '캐치 E 지우개 · B 채우기 · P 펜', R125_SIZES[7], async () => {
      await H.evaluate('document.activeElement?.blur()');
      await press(H, 'e', 'KeyE');
      const a = await H.evaluate("document.querySelector('[data-draw-tools]')?.dataset.tool");
      await press(H, 'b', 'KeyB');
      const b = await H.evaluate("document.querySelector('[data-draw-tools]')?.dataset.tool");
      await press(H, 'p', 'KeyP');
      const c = await H.evaluate("document.querySelector('[data-draw-tools]')?.dataset.tool");
      return a === 'eraser' && b === 'fill' && c === 'pen';
    });
    await snap(H, 'r125-draw-tools-m390-pastel');
  } else record('★ R125 B6 캐치 — 방장이 그리는 차례가 오지 않음(키 검사 못 함)', false, '');
  await checkFit(H, '캐치 판', R125_SIZES[7]);
  await scanText(H, '캐치 판');
  // 캐치 판에서 나와(나가기) 라이어 방을 새로 만든다 — 손님 둘이 들어와 셋
  const leaveRoom = async () => {
    await H.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
    await sleep(300);
    await H.evaluate("document.querySelector('.confirm-modal .confirm-actions button')?.click()");
    await H.waitFor("document.querySelector('[data-gb-together]') !== null", 10000).catch(() => false);
    await sleep(600);
  };
  await size(H, R125_SIZES[0]);
  await leaveRoom();
  record('★ R125 B6 — 캐치 판에서 나와 로비로', await has(H, '[data-gb-together]'), '');
  await realClick(H, '[data-gb-together]');
  await sleep(500);
  await realClick(H, '[data-gb-make]');
  await waitSel(H, '[data-gb-create]');
  await realClick(H, '[data-gb-create] [data-kind="liar"]');
  await H.setInput('[data-gb-title]', '라이어 도장');
  await realClick(H, '[data-gb-create] .big-btn');
  await H.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 10000).catch(() => false);
  await sleep(800);
  const liarRoom = await H.evaluate("location.pathname.split('/')[2] ?? ''");
  g1.emit('room.leave', {});
  g2.emit('room.leave', {});
  await sleep(600);
  g1.emit('room.join', { roomId: liarRoom });
  g2.emit('room.join', { roomId: liarRoom });
  await sleep(1200);
  let liarOk = false;
  if (await has(H, '[data-start-btn]:not([disabled])')) {
    await realClick(H, '[data-start-btn]');
    await H.waitFor("document.querySelector('[data-liar-log]') !== null", 15000).catch(() => false);
    await size(H, R125_SIZES[7]);
    if (await has(H, '[data-liar-log]')) {
      liarOk = true;
      await keyCheck(H, '라이어 Tab 설명 기록 열기 · 닫기', R125_SIZES[7], async () => {
        const a = await H.evaluate("document.querySelector('[data-liar-log]')?.dataset.liarLog");
        await press(H, 'Tab', 'Tab');
        const b = await H.evaluate("document.querySelector('[data-liar-log]')?.dataset.liarLog");
        await press(H, 'Tab', 'Tab');
        return a !== b;
      });
      await checkFit(H, '라이어 판', R125_SIZES[7]);
      await scanText(H, '라이어 판');
      await snap(H, 'r125-liar-m390-pastel');
    }
  }
  record('★ R125 B6 라이어 — 판 화면까지 갔다(Tab 검사 함)', liarOk, '');
  g2.disconnect();
  g1.disconnect();
  await size(H, R125_SIZES[0]);
  // 방에서 나간다
  await H.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
  await sleep(300);
  await H.evaluate("document.querySelector('.confirm-modal .confirm-actions button')?.click()");
  await sleep(1000);

  // ━━━━━━━━ 3. 혼자 하기 — 시작(잔액) · 단계표 · 판(등급 점) · 끝 ━━━━━━━━
  await waitSel(H, '[data-gb-solo]', 10000);
  await opened(H, '혼자 하기 시작(띠 · 아이템 잔액)', () => realClick(H, '[data-gb-solo]'), '[data-solo-items-pick]');
  const bal = await J(H, "({ text: document.querySelector('[data-solo-items-pick]')?.innerText ?? '' })");
  record('★★★ R125 B1 혼자 하기 아이템 — 잔액이 처음부터 숫자("?P" 없음)', /지금\s*\d[\d,]*P/.test(bal.text) && !bal.text.includes('?P'), JSON.stringify(bal));
  for (const s of R125_SIZES) {
    await size(H, s);
    await checkFit(H, '혼자 하기 시작', s);
    if (['pc1536', 'pc2560', 'm360'].includes(s.n)) await snap(H, `r125-solo-start-${s.n}-pastel`);
  }
  await scanText(H, '혼자 하기 시작');
  await size(H, R125_SIZES[0]);
  await opened(H, '띠 단계표', () => realClick(H, '[data-belt-table-open]'), '[data-belt-table]');
  await press(H, 'Escape');
  await realClick(H, '[data-solo-start]');
  await H.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) >= 1", 10000).catch(() => false);
  await sleep(400);
  const spill = await J(H, "(() => { const p = document.querySelector('[data-solo-q] .grade-pill'); return p ? { grade: Number(p.dataset.grade), dots: p.querySelectorAll('.grade-dots i').length, on: p.querySelectorAll('.grade-dots i.on').length } : null; })()");
  record('★★★ R125 C1 혼자 하기 — 문제 카드 머리 = 등급 말 + 점 다섯', spill && spill.dots === 5 && spill.on === spill.grade, JSON.stringify(spill));
  for (const s of R125_SIZES) {
    await size(H, s);
    await H.evaluate("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'explain' && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    await H.waitFor("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'question' || document.querySelector('[data-solo=\"end\"]') !== null", 15000).catch(() => false);
    if (await has(H, '[data-solo="end"]')) break;
    await checkFit(H, '혼자 하기 판', s);
    if (['pc1536', 'pc2560', 'm390', 'm360'].includes(s.n)) await snap(H, `r125-solo-play-${s.n}-pastel`);
  }
  await scanText(H, '혼자 하기 판');
  // B6 — 혼자 하기 모바일 꼴: Enter 로 해설 넘기기(입력칸 밖) — 한 문제를 맞혀 해설로
  await size(H, R125_SIZES[7]);
  if (await has(H, '[data-solo-input]')) {
    const st = await H.evaluate("document.querySelector('[data-solo] .q-text')?.dataset.text ?? ''");
    const sa = await withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [st])).rows[0]?.answer_text ?? '');
    await H.setInput('[data-solo-input]', sa);
    await press(H, 'Enter');
    await H.waitFor("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'explain'", 4000).catch(() => false);
    await keyCheck(H, '혼자 하기 Enter 해설 넘기기', R125_SIZES[7], async () => {
      await H.evaluate('document.activeElement?.blur()');
      await press(H, 'Enter');
      return H.waitFor("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'count'", 3000).then(() => true, () => false);
    });
  }
  // 목숨 셋을 "화면 벗어남"(blur)으로 잃는다 → 끝 화면(틀린 문제 셋)
  for (let k = 0; k < 6 && !(await has(H, '[data-solo="end"]')); k++) {
    await H.waitFor("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'question' || document.querySelector('[data-solo=\"end\"]') !== null", 15000).catch(() => false);
    if (await has(H, '[data-solo="end"]')) break;
    await H.evaluate("window.dispatchEvent(new Event('blur'))");
    await H.waitFor("document.querySelector('[data-solo-reveal]') !== null", 4000).catch(() => false);
    await sleep(300);
    await press(H, 'Enter');
  }
  await H.waitFor("document.querySelector('[data-solo=\"end\"]') !== null", 20000).catch(() => false);
  await sleep(3200);
  await H.evaluate("document.querySelector('[data-solo-promo]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  await sleep(300);
  for (const s of R125_SIZES) {
    await size(H, s);
    await checkFit(H, '혼자 하기 끝', s);
    if (['pc1536', 'pc2560', 'm390', 'm360'].includes(s.n)) await snap(H, `r125-solo-end-${s.n}-pastel`);
  }
  await scanText(H, '혼자 하기 끝');
  await setTheme(H, 'night');
  await size(H, R125_SIZES[8]);
  await snap(H, 'r125-solo-end-m360-night');
  await setTheme(H, 'pastel');

  // ── 끝 화면 틀린 문제가 아주 길 때(R124 의 360 넘침 — 칸 안에서만 내려 봄 · 문서는 안 넘침 · 버튼은 늘 화면 안)
  const longest = (await withPg(async (c) => (await c.query(`SELECT q.question_text AS text, q.display_answer AS answer, q.explanation FROM questions q WHERE q.is_active ORDER BY char_length(q.question_text) + coalesce(char_length(q.explanation), 0) DESC LIMIT 3`)).rows)).map((x) => ({ text: x.text, answer: x.answer, explanation: x.explanation }));
  const endHasWrongs = await has(H, '.solo-wq');
  record('★ R125 B4 끝 화면 — 틀린 문제 칸이 있다(넘침 검사 가능)', endHasWrongs, '');
  if (endHasWrongs) {
    await H.evaluate(`(() => {
      const rows = __ROWS__;
      const els = [...document.querySelectorAll('.solo-wq')];
      els.forEach((el, i) => {
        const r = rows[i]; if (!r) return;
        el.querySelector('.solo-wq-text').textContent = r.text;
        el.querySelector('.solo-wq-ans b').textContent = r.answer;
        let ex = el.querySelector('.solo-wq-expl');
        if (r.explanation) { if (!ex) { ex = document.createElement('p'); ex.className = 'solo-wq-expl dim'; el.appendChild(ex); } ex.textContent = r.explanation; } else ex?.remove();
      });
      return els.length;
    })()`.replace('__ROWS__', JSON.stringify(longest)));
    for (const s of R125_SIZES) {
      await size(H, s);
      await checkFit(H, '혼자 하기 끝(가장 긴 틀린 문제 셋)', s);
      const w = await J(H, "(() => { const a = document.querySelector('[data-solo-again]')?.getBoundingClientRect(); const c = document.querySelector('[data-solo-wrongs]'); return { btnIn: a ? a.bottom <= innerHeight && a.top >= 0 : false, inner: c ? c.scrollHeight <= c.clientHeight + 1 : null }; })()");
      record(`★★★ R125 B4 끝 화면 가장 긴 셋 ${s.w}×${s.h} — [다시] · [로비] 버튼 늘 화면 안(넘치면 틀린 문제 칸 안에서만)`, w.btnIn, JSON.stringify(w));
      if (['pc1536', 'pc1280', 'm390', 'm360'].includes(s.n)) await snap(H, `r125-solo-end-longest-${s.n}-pastel`);
    }
  }

  const out = { fit, bad1, devWords, dots, keyRows, longest: longest.map((x) => x.text.length) };
  writeFileSync(path.join(SHOT, 'r125-sweep.json'), JSON.stringify(out, null, 1));
  record('★★★ R125 B2 — 화면에 개발 말(대문자 코드 · Failed to fetch · undefined · null) 0', devWords.length === 0, JSON.stringify(devWords.slice(0, 10)));
  record('★★★ R125 B3 — 화면 글(문제 · 해설 · 이름 제외)에 "·" 0', dots.length === 0, JSON.stringify(dots.slice(0, 15)));
  console.log('\n[R125] 스크롤 0 표', JSON.stringify(fit, null, 1));
  console.log('[R125] B1 덜 그려짐', JSON.stringify(bad1));
  console.log('[R125] B2 개발 말', JSON.stringify(devWords));
  console.log('[R125] B3 가운뎃점', JSON.stringify(dots));
  for (const b of bots) b.disconnect();
}
