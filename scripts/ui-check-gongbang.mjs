// =============================================================================
// ★★★ R117 — 공방 화면 그림 · 검사 (`node scripts/ui-check.mjs --gongbang` · SHOT_DIR=r117)
//   서버 스위치를 켠 채(GONGBANG=1) 돌면: 로비 · 공방 목록 · 빠른 입장 옵션 · 비슷한 방 · ☰ · 방 만들기 · 잠긴 방 숫자판(틀림 · 맞음)
//     · 방 안(종류 색 머리 · 방 종류 줄 · 모드 바꾸기 · 정원/잠금 · 초대 창 한 줄) · 사람 카드(신고 · 가리기) · 신고 창 · 가리기(채팅 가림)
//     를 360 · 390 · PC 1280 × 파스텔 · 밤으로 찍고, 기존 화면과 견준 값 표(글자 · 줄 높이 · 버튼 높이 · 둥근 정도 · 여백)를 남긴다.
//   스위치를 끈 채 돌면: 첫 화면 · 방 안이 오늘과 같은지(공방 부품 0) — 그림 + 구조 검사.
//   ★ 크롬 탭은 둘만(방장 · 손님) — 나머지 사람은 소켓 봇(메모리 · R116 교훈).
// =============================================================================

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const SIZES = [
  { w: 360, h: 740, n: 'm360' },
  { w: 390, h: 844, n: 'm390' },
  { w: 1280, h: 720, n: 'pc' },
];
const THEMES = ['pastel', 'night'];

export async function gongbangFlow(ctx) {
  const { browser, BASE, ROOT, sleep, snap, record, realClick, signUp, setTheme, newPage, ACCOUNT_PREFIX } = ctx;
  const site = await (await fetch(`${BASE}/api/site`)).json();
  const on = site.gongbang === true;
  console.log(`\n[R117] 공방 화면 — 스위치 ${on ? '켬' : '끔'}`);

  const ev = async (page, js) => page.evaluate(js);
  const has = async (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)}) !== null`);
  const waitSel = (page, sel, ms = 6000) => page.waitFor(`document.querySelector(${JSON.stringify(sel)}) !== null`, ms);
  const press = async (page, key) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
    await sleep(200);
  };
  /** 지금 화면을 크기 × 테마로 — before(page, size) 가 크기마다 화면을 다시 맞춘다(창이 크기 바뀔 때 닫히는 경우) */
  const shootAll = async (page, name, before = null, sizes = SIZES) => {
    for (const s of sizes) {
      await page.setViewport(s.w, s.h);
      await sleep(450);
      if (before) await before(page, s);
      for (const t of THEMES) {
        await setTheme(page, t);
        await sleep(150);
        await snap(page, `${name}-${s.n}-${t}`);
      }
      await setTheme(page, 'pastel');
    }
  };
  const overflowX = (page) => page.evaluate('document.documentElement.scrollWidth > innerWidth + 1');

  // ── 소켓 봇(사람 · 방 채우기)
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
    s.on('room.state', (st) => (s.snap = st));
    bots.push(s);
    return s;
  };
  const stateOf = (s) => new Promise((r) => s.once('room.state', r));
  const makeRoom = async (s, opts) => {
    const p = stateOf(s);
    s.emit('room.create', opts);
    return (await p).room;
  };
  const joinRoom = async (s, roomId, password) => {
    const p = stateOf(s);
    s.emit('room.join', { roomId, ...(password ? { password } : {}) });
    return (await p).room;
  };
  const patch = (s, change) => s.emit('lobby.updateSettings', { ...s.snap.room.settings, ...change });

  if (!on) {
    // ── 스위치를 끈 채: 오늘 화면 그대로(공방 부품 0)
    const H = await newPage(browser, 'gb-off', true);
    await H.setViewport(360, 740);
    await signUp(H, 'gboff', '끔확인');
    await sleep(500);
    const home = JSON.parse(await ev(H, "JSON.stringify({ gb: document.querySelectorAll('.gb-home, .gb-main, [data-gb-together]').length, cards: [...document.querySelectorAll('.card h2')].map((h) => h.innerText.trim()), bar: document.querySelector('.home-bar') !== null })"));
    record('★★ R117 스위치 끔 — 첫 화면 = 옛 꼴(방 만들기 · 방 코드로 입장 · 친구 카드 · 공방 부품 0)', home.gb === 0 && home.bar && home.cards.join(',') === '방 만들기,방 코드로 입장,친구', JSON.stringify(home));
    await shootAll(H, 'r117-off-home', null, [SIZES[0], SIZES[2]]);
    await H.setViewport(360, 740);
    await H.setInput('.card input', '끔 방');
    await sleep(150);
    await H.click('만들기');
    await H.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 10000);
    await sleep(500);
    const room = JSON.parse(await ev(H, "JSON.stringify({ kindRow: document.querySelector('[data-gb-kind-row]') !== null, modes: [...document.querySelectorAll('.mode-row [data-mode]')].map((b) => b.dataset.mode), headKind: document.querySelector('.room-head')?.dataset.roomKind ?? null, count: document.querySelector('.room-count')?.innerText ?? '' })"));
    record('★★ R117 스위치 끔 — 방 안 = 옛 꼴(방식 칸 다섯 · 방 종류 줄 없음 · 머리 색 없음)', !room.kindRow && room.headKind === null && room.modes.includes('liar') && room.modes.includes('draw'), JSON.stringify(room));
    await shootAll(H, 'r117-off-room', null, [SIZES[0], SIZES[2]]);
    H.close();
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 스위치 켬
  // ═══════════════════════════════════════════════════════════════════════════
  const H = await newPage(browser, 'gb-host', true);
  await H.setViewport(360, 740);
  await signUp(H, 'gbh', '밤톨이');
  await sleep(600);

  // [1] 로비
  const lob = JSON.parse(await ev(H, "JSON.stringify({ home: document.querySelector('[data-gb-home]')?.dataset.gbHome, together: document.querySelector('[data-gb-together]') !== null, solo: document.querySelector('[data-gb-solo]') !== null, friends: document.querySelector('.gb-tools #friends-btn')?.offsetParent !== null, menu: document.querySelector('#gb-menu-btn')?.offsetParent !== null, oldCards: document.querySelectorAll('.home-grid .card').length, foot: document.querySelector('footer.foot') !== null })"));
  record('★★ R117 로비(360) — 같이 하기 · 혼자 하기 · [친구] · [☰] · 옛 카드 · 아래 줄 없음', lob.home === 'lobby' && lob.together && lob.solo && lob.friends && lob.menu && lob.oldCards === 0 && !lob.foot, JSON.stringify(lob));
  await shootAll(H, 'r117-01-lobby', async (p, s) => {
    if (s.n !== 'pc') return;
  }, [SIZES[0], SIZES[1]]);
  record('★ R117 로비 — 가로 넘침 없음(360)', !(await overflowX(H)), '');

  // [2] 빈 목록(방 만들기 전) — 같이 하기
  await H.setViewport(360, 740);
  await sleep(300);
  await realClick(H, '[data-gb-together]');
  await waitSel(H, '[data-dir-list]');
  await H.waitFor("document.querySelector('[data-dir-empty]') !== null || document.querySelector('[data-room-code]') !== null", 4000);
  await sleep(300);
  const empty = await has(H, '[data-dir-empty]');
  record('★ R117 목록 — 방이 없으면 빈 안내 한 줄', empty, '');
  await shootAll(H, 'r117-02-empty', null, [SIZES[0]]);

  // [3] 봇으로 방 채우기
  const b1 = await bot('gb1', '퀴카짱');
  const r1 = await makeRoom(b1, { title: '퇴근 후 상식 한 판', kind: 'quiz', maxPlayers: 8 });
  patch(b1, { level: 'intermediate', minigames: true });
  for (let i = 0; i < 4; i += 1) await joinRoom(await bot(`gb1j${i}`, `손님${i}`), r1.code);
  const b2 = await bot('gb2', '감자도사');
  const r2 = await makeRoom(b2, { title: '초보 환영 · 천천히', kind: 'quiz' });
  patch(b2, { level: 'beginner' });
  await joinRoom(await bot('gb2j', '초코칩'), r2.code);
  const b3 = await bot('gb3', '퀴즈요정');
  const r3 = await makeRoom(b3, { title: '우리 반 모임', kind: 'quiz', maxPlayers: 10, password: '0371' });
  await joinRoom(await bot('gb3j', '반장'), r3.id);
  const b4 = await bot('gb4', '스피드왕');
  const r4 = await makeRoom(b4, { title: '꽉 찬 방', kind: 'quiz', maxPlayers: 2 });
  patch(b4, { level: 'advanced' });
  await joinRoom(await bot('gb4j', '번개'), r4.code);
  const b5 = await bot('gb5', '그림쟁이');
  const r5 = await makeRoom(b5, { title: '그림 한 판', kind: 'draw' });
  await joinRoom(await bot('gb5j', '붓질'), r5.code);
  const b6 = await bot('gb6', '라이어킹');
  const r6 = await makeRoom(b6, { title: '라이어 모여라', kind: 'liar', maxPlayers: 6 });
  await joinRoom(await bot('gb6j', '거짓말'), r6.code);
  await joinRoom(await bot('gb6k', '참말'), r6.code);
  // 진행 중인 방(진행 막대) — 꽉 찬 방을 시작
  b4.emit('game.start', {});
  await sleep(4500);

  await H.waitFor("document.querySelectorAll('[data-room-code]').length >= 4", 6000);
  await sleep(400);
  const rows = JSON.parse(await ev(H, "JSON.stringify([...document.querySelectorAll('[data-room-code]')].map((r) => ({ t: r.querySelector('.dir-title-t')?.innerText, dim: r.classList.contains('dim'), cnt: r.querySelector('.dir-cnt')?.innerText.replace(/\\s+/g, ''), lock: r.dataset.locked === '1', full: r.querySelector('.dir-cnt')?.classList.contains('full') })))"));
  const tabs = await ev(H, "[...document.querySelectorAll('[data-dir-tab] small')].map((s) => s.innerText).join(',')");
  record('★★ R117 목록 퀴즈 탭 — 4줄 · 들어갈 수 있는 방 먼저 · 잠김/꽉 참은 흐리게 아래 · 탭 방 수 4,1,1', rows.length === 4 && !rows[0].dim && !rows[1].dim && rows[2].dim && rows[3].dim && rows.some((r) => r.lock) && rows.some((r) => r.full) && tabs === '방 4,방 1,방 1', JSON.stringify({ rows, tabs }));
  await shootAll(H, 'r117-03-list', null, [SIZES[0], SIZES[1]]);
  record('★ R117 목록 — 가로 넘침 없음(390)', !(await overflowX(H)), '');

  // 탭 바꾸기(라이어)
  await H.setViewport(360, 740);
  await realClick(H, '[data-dir-tab="liar"]');
  await H.waitFor("document.querySelector('[data-dir-list=\"liar\"] [data-room-code]') !== null", 4000);
  await sleep(300);
  await shootAll(H, 'r117-04-list-liar', null, [SIZES[0]]);
  await realClick(H, '[data-dir-tab="quiz"]');
  await H.waitFor("document.querySelector('[data-dir-list=\"quiz\"] [data-room-code]') !== null", 4000);

  // [4] 빠른 입장 옵션 — 고급만 · 미니게임 없는 방 → 저장 → 톱니 점 · "옵션 2"
  await realClick(H, '[data-quick-opts]');
  await waitSel(H, '[data-qj-modal]');
  await realClick(H, '[data-qj="level-advanced"]');
  await realClick(H, '[data-qj="mg-without"]');
  await sleep(200);
  await shootAll(H, 'r117-05-qj-opts', async (p) => {
    if (!(await has(p, '[data-qj-modal]'))) {
      await realClick(p, '[data-quick-opts]');
      await waitSel(p, '[data-qj-modal]');
    }
  }, [SIZES[0], SIZES[1]]);
  await H.setViewport(360, 740);
  await sleep(300);
  if (!(await has(H, '[data-qj-modal]'))) {
    await realClick(H, '[data-quick-opts]');
    await waitSel(H, '[data-qj-modal]');
  }
  await realClick(H, '[data-qj="save"]');
  await sleep(300);
  const dot = await ev(H, "JSON.stringify({ dot: document.querySelector('.qj-opt .dot') !== null, txt: document.querySelector('.qj-opt small')?.innerText ?? '' })");
  record('★ R117 빠른 입장 옵션 저장 → 톱니 점 · "옵션 2"', JSON.parse(dot).dot && JSON.parse(dot).txt === '옵션 2', dot);

  // [5] 빠른 입장 — 고급 · 미니게임 없는 방 = 꽉 찬 방뿐(못 들어감) → 비슷한 방 창(중급 · 미니게임 방 또는 초급)
  await realClick(H, '[data-quick-join]');
  const near = await H.waitFor("document.querySelector('.confirm-modal[data-kind=\"quick-near\"]') !== null", 5000);
  const nearNote = near ? await ev(H, "document.querySelector('.confirm-modal .confirm-note')?.innerText ?? ''") : '';
  record('★★ R117 빠른 입장 — 딱 맞는 방 없음 → "가장 비슷한 방" 창 + 어긋난 칸 한 줄', near && /방이에요/.test(nearNote), nearNote);
  if (near) await shootAll(H, 'r117-06-qj-near', null, [SIZES[0]]);
  await ev(H, "document.querySelector('.confirm-modal .popup-close')?.click()");
  await sleep(200);
  // 옵션 처음대로
  await realClick(H, '[data-quick-opts]');
  await waitSel(H, '[data-qj-modal]');
  await realClick(H, '[data-qj="reset"]');
  await realClick(H, '[data-qj="save"]');
  await sleep(200);

  // [6] ☰ 메뉴
  await realClick(H, '#gb-menu-btn');
  await waitSel(H, '[data-gb-menu-pop]');
  const menu = await ev(H, "[...document.querySelectorAll('[data-gb-menu-pop] .menu-item')].map((b) => b.innerText.trim()).join(',')");
  record('★ R117 ☰ — 방 코드로 입장 · 프로필 · 포인트샵 · 설정 · 안내 · 제보 · 로그아웃', menu === '방 코드로 입장,프로필,포인트샵,설정,안내,제보,로그아웃', menu);
  await shootAll(H, 'r117-07-menu', null, [SIZES[0]]);
  // ☰ → 설정(창이 뜨는가) · ☰ → 포인트샵
  for (const [item, sel] of [['설정', '.prefs-pop'], ['포인트샵', '.shop-pop'], ['프로필', '.rename-pop'], ['안내', '.infotip-pop']]) {
    if (!(await has(H, '[data-gb-menu-pop]'))) await realClick(H, '#gb-menu-btn');
    await waitSel(H, '[data-gb-menu-pop]');
    await ev(H, `[...document.querySelectorAll('[data-gb-menu-pop] .menu-item')].find((b) => b.innerText.trim() === ${JSON.stringify(item)})?.click()`);
    const okPop = await waitSel(H, sel, 3000);
    const vis = okPop ? await ev(H, `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return r.width > 100 && r.left >= -1 && r.right <= innerWidth + 1; })()`) : false;
    record(`★ R117 ☰ → ${item} 창이 화면 안에 뜬다(360)`, okPop && vis, '');
    if (item === '설정') await snap(H, 'r117-08-menu-settings-m360-pastel');
    await press(H, 'Escape');
    await ev(H, "document.querySelector('.popup-close')?.click()");
    await sleep(200);
  }

  // [7] 방 만들기 창
  await realClick(H, '[data-gb-make]');
  await waitSel(H, '[data-gb-create]');
  await realClick(H, '[data-gb-create] [data-kind="quiz"]');
  await H.setInput('[data-gb-title]', '밤톨이네 퀴즈방');
  await realClick(H, '[data-gb-lock]');
  await H.setInput('[data-gb-pin]', '2580');
  await sleep(200);
  await shootAll(H, 'r117-09-create', async (p) => {
    if (!(await has(p, '[data-gb-create]'))) {
      await realClick(p, '[data-gb-make]');
      await waitSel(p, '[data-gb-create]');
      await p.setInput('[data-gb-title]', '밤톨이네 퀴즈방');
      await realClick(p, '[data-gb-lock]');
      await p.setInput('[data-gb-pin]', '2580');
    }
  }, [SIZES[0], SIZES[1]]);
  await H.setViewport(360, 740);
  await sleep(300);
  if (!(await has(H, '[data-gb-create]'))) {
    await realClick(H, '[data-gb-make]');
    await waitSel(H, '[data-gb-create]');
    await H.setInput('[data-gb-title]', '밤톨이네 퀴즈방');
    await realClick(H, '[data-gb-lock]');
    await H.setInput('[data-gb-pin]', '2580');
  }
  // 정원 + 한 번 → 9
  await realClick(H, '[data-gb-max] button[aria-label="정원 늘리기"]');
  await realClick(H, '[data-gb-create] .big-btn');
  const inRoom = await H.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 8000);
  await sleep(600);
  const rs = JSON.parse(await ev(H, "JSON.stringify({ head: document.querySelector('.room-head')?.dataset.roomKind, cnt: document.querySelector('.room-count')?.innerText ?? '', kindRow: document.querySelector('[data-gb-kind-row]')?.dataset.gbKindRow, modes: [...document.querySelectorAll('.mode-row [data-mode]')].map((b) => b.dataset.mode).join(',') })"));
  record('★★ R117 방 만들기(잠금 · 정원 9) → 방 안 — 머리 종류 quiz · 방 종류 줄 · 방식 칸은 퀴즈 안의 것만', inRoom && rs.head === 'quiz' && rs.kindRow === 'quiz' && !rs.modes.includes('liar') && !rs.modes.includes('draw') && rs.cnt.includes('/ 9명'), JSON.stringify(rs));
  await shootAll(H, 'r117-10-room-host', null);

  // [8] 손님 — 목록에서 잠긴 방 → 숫자판 · 틀림 → 맞음
  const G = await newPage(browser, 'gb-guest', true);
  await G.setViewport(360, 740);
  await signUp(G, 'gbg', '쿼카짱');
  await sleep(500);
  await realClick(G, '[data-gb-together]');
  await G.waitFor("document.querySelector('[data-room-code][data-locked=\"1\"]') !== null", 6000);
  await sleep(300);
  // 내 방(밤톨이네)의 줄을 누른다
  await G.waitFor("[...document.querySelectorAll('[data-room-code]')].some((r) => r.innerText.includes('밤톨이네'))", 6000);
  await G.evaluate("[...document.querySelectorAll('[data-room-code]')].find((r) => r.innerText.includes('밤톨이네'))?.scrollIntoView()");
  const myRowCode = await G.evaluate("[...document.querySelectorAll('[data-room-code]')].find((r) => r.innerText.includes('밤톨이네'))?.dataset.roomCode ?? ''");
  await realClick(G, `[data-room-code="${myRowCode}"]`);
  await waitSel(G, '[data-gb-lock-pop]');
  for (const d of '1111') await press(G, d);
  await press(G, 'Enter');
  await G.waitFor("(document.querySelector('[data-gb-lock-msg]')?.innerText ?? '').includes('남았어요')", 5000);
  const wrong = await ev(G, "document.querySelector('[data-gb-lock-msg]')?.innerText ?? ''");
  const toastDup = await has(G, '.toast');
  record('★★ R117 잠긴 방 — 틀리면 "틀렸어요 — 4번 남았어요" · 위 알림 겹침 없음', /4번 남았어요/.test(wrong) && !toastDup, JSON.stringify({ wrong, toastDup }));
  await shootAll(G, 'r117-11-locked-wrong', async (p) => {
    if (!(await has(p, '[data-gb-lock-pop]'))) {
      await realClick(p, `[data-room-code="${myRowCode}"]`);
      await waitSel(p, '[data-gb-lock-pop]');
    }
  }, [SIZES[0], SIZES[1]]);
  await G.setViewport(360, 740);
  await sleep(300);
  if (!(await has(G, '[data-gb-lock-pop]'))) {
    await realClick(G, `[data-room-code="${myRowCode}"]`);
    await waitSel(G, '[data-gb-lock-pop]');
  }
  for (const d of '2580') await press(G, d);
  await realClick(G, '[data-gb-lock-go]');
  const gIn = await G.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 8000);
  record('★★ R117 잠긴 방 — 맞는 비밀번호면 들어간다', gIn, '');
  await sleep(600);

  // [9] 방장 — 참여자 창(정원 · 잠금) · 초대 창 · 모드 바꾸기
  await H.setViewport(360, 740);
  await sleep(400);
  await realClick(H, '#people-btn');
  await waitSel(H, '.people-modal [data-gb-access="host"]');
  const pw = await ev(H, "document.querySelector('[data-gb-access-pw]')?.innerText.trim() ?? ''");
  record('★ R117 참여자 창(방장) — 정원 · 잠금 · 비밀번호 보임', pw.includes('2580'), pw);
  await snap(H, 'r117-12-people-access-m360-pastel');
  await setTheme(H, 'night');
  await snap(H, 'r117-12-people-access-m360-night');
  await setTheme(H, 'pastel');
  await press(H, 'Escape');
  // 손님 참여자 창 — 한 줄만
  await realClick(G, '#people-btn');
  await waitSel(G, '.people-modal [data-gb-access="guest"]');
  const gLine = await ev(G, "document.querySelector('[data-gb-access=\"guest\"]')?.innerText ?? ''");
  record('★ R117 참여자 창(손님) — "정원 9명 · 잠긴 방" 한 줄 · 비밀번호 없음', gLine.includes('정원 9명') && gLine.includes('잠긴 방') && !gLine.includes('2580'), gLine);
  await snap(G, 'r117-13-people-guest-m360-pastel');
  await press(G, 'Escape');
  // PC — 초대 창 아래 정원 · 잠금 + 한 줄
  await H.setViewport(1280, 720);
  await sleep(500);
  await realClick(H, '#invite-btn');
  await waitSel(H, '.invite-pop [data-gb-access="host"]');
  const lockNote = await has(H, '[data-invite-lock-note]');
  record('★ R117 초대 창(PC) — "잠긴 방이어도 이 링크로는 바로 들어와요" · 정원/잠금', lockNote, '');
  for (const t of THEMES) {
    await setTheme(H, t);
    await snap(H, `r117-14-invite-access-pc-${t}`);
  }
  await setTheme(H, 'pastel');
  // 정원 줄이기(9 → 8) · 지금 인원(2)보다 작게는 버튼이 막힘
  await realClick(H, '.invite-pop [data-gb-access-max] button[aria-label="정원 줄이기"]');
  await H.waitFor("(document.querySelector('.room-count')?.innerText ?? '').includes('/ 8명')", 3000);
  record('★ R117 정원 바꾸기(9 → 8) — 머리 인원 표시가 바로 바뀐다', (await ev(H, "document.querySelector('.room-count')?.innerText ?? ''")).includes('/ 8명'), '');
  await press(H, 'Escape');
  await realClick(H, '#invite-btn');
  await sleep(200);
  await press(H, 'Escape');

  // 모드 바꾸기 → 라이어
  await H.setViewport(360, 740);
  await sleep(400);
  await realClick(H, '[data-gb-mode-btn]');
  await waitSel(H, '[data-gb-mode-pop]');
  await realClick(H, '[data-gb-mode-pop] [data-kind="liar"]');
  await sleep(200);
  const note = await ev(H, "document.querySelector('[data-gb-mode-note]')?.innerText ?? ''");
  record('★ R117 모드 바꾸기 창 — 라이어 고름 → "지금 2명이라 3명부터" 미리 알림', note.includes('3명부터'), note);
  await shootAll(H, 'r117-15-mode', async (p) => {
    if (!(await has(p, '[data-gb-mode-pop]'))) {
      await realClick(p, '[data-gb-mode-btn]');
      await waitSel(p, '[data-gb-mode-pop]');
      await realClick(p, '[data-gb-mode-pop] [data-kind="liar"]');
    }
  });
  await H.setViewport(360, 740);
  await sleep(300);
  if (!(await has(H, '[data-gb-mode-pop]'))) {
    await realClick(H, '[data-gb-mode-btn]');
    await waitSel(H, '[data-gb-mode-pop]');
    await realClick(H, '[data-gb-mode-pop] [data-kind="liar"]');
  }
  await realClick(H, '[data-gb-mode-go]');
  await H.waitFor("document.querySelector('.room-head')?.dataset.roomKind === 'liar'", 4000);
  const liarNow = JSON.parse(await ev(H, "JSON.stringify({ head: document.querySelector('.room-head')?.dataset.roomKind, sys: [...document.querySelectorAll('.chat-system')].map((p) => p.innerText).pop() ?? '' })"));
  const gHead = await G.waitFor("document.querySelector('.room-head')?.dataset.roomKind === 'liar'", 4000);
  record('★★ R117 모드 바꾸기 → 라이어 — 머리 색 · 시스템 채팅 한 줄 · 손님 화면도 바뀜', liarNow.head === 'liar' && liarNow.sys.includes('라이어 방으로 바뀌었어요') && gHead, JSON.stringify(liarNow));
  await shootAll(H, 'r117-16-room-liar', null, [SIZES[0], SIZES[2]]);

  // [10] 사람 카드 — 손님 화면에서 방장 카드: [신고] · [내 화면에서 가리기]
  await G.setViewport(360, 740);
  await sleep(300);
  await realClick(G, '#people-btn');
  await waitSel(G, '.people-modal');
  await G.evaluate("[...document.querySelectorAll('.people-row.pickable')].find((b) => b.innerText.includes('밤톨이'))?.click()");
  await waitSel(G, '.person-card [data-act="report"]');
  const acts = await ev(G, "[...document.querySelectorAll('.person-card [data-act]')].map((b) => b.dataset.act).join(',')");
  record('★ R117 사람 카드(손님→방장) — 친구 신청 · 신고 · 가리기', acts.includes('report') && acts.includes('block'), acts);
  await shootAll(G, 'r117-17-person-card', async (p) => {
    if (!(await has(p, '.person-card'))) {
      await realClick(p, '#people-btn');
      await waitSel(p, '.people-modal');
      await p.evaluate("[...document.querySelectorAll('.people-row.pickable')].find((b) => b.innerText.includes('밤톨이'))?.click()");
      await waitSel(p, '.person-card');
    }
  }, [SIZES[0], SIZES[1]]);
  await G.setViewport(360, 740);
  await sleep(300);
  if (!(await has(G, '.person-card'))) {
    await realClick(G, '#people-btn');
    await waitSel(G, '.people-modal');
    await G.evaluate("[...document.querySelectorAll('.people-row.pickable')].find((b) => b.innerText.includes('밤톨이'))?.click()");
    await waitSel(G, '.person-card');
  }
  // 신고
  await realClick(G, '.person-card [data-act="report"]');
  await waitSel(G, '[data-gb-report]');
  await realClick(G, '[data-gb-report] [data-reason="spam"]');
  await G.setInput('.gb-report-text', '검사용 신고');
  await sleep(150);
  await snap(G, 'r117-18-report-m360-pastel');
  await setTheme(G, 'night');
  await snap(G, 'r117-18-report-m360-night');
  await setTheme(G, 'pastel');
  await realClick(G, '[data-gb-report-send]');
  const reported = await G.waitFor("(document.querySelector('.confirm-modal[data-kind=\"gb-note\"] .confirm-title')?.innerText ?? '').includes('신고했어요')", 5000);
  record('★★ R117 신고 — 보내면 "신고했어요" 창', reported, '');
  await ev(G, "document.querySelector('.confirm-modal .confirm-actions button')?.click()");
  await sleep(200);

  // 가리기 — 방장 채팅이 손님 화면에서 사라진다(시스템 줄은 그대로)
  await realClick(G, '#people-btn');
  await waitSel(G, '.people-modal');
  await G.evaluate("[...document.querySelectorAll('.people-row.pickable')].find((b) => b.innerText.includes('밤톨이'))?.click()");
  await waitSel(G, '.person-card [data-act="block"]');
  await realClick(G, '.person-card [data-act="block"]');
  await sleep(600);
  await H.setInput('[data-chat-input]', '가려질 말 ㅋㅋ');
  await H.evaluate("document.querySelector('[data-chat-input]')?.focus()");
  await H.key('Enter');
  await sleep(800);
  const hostSees = await ev(H, "[...document.querySelectorAll('.chat-line')].some((l) => l.innerText.includes('가려질 말'))");
  const guestSees = await ev(G, "[...document.querySelectorAll('.chat-line')].some((l) => l.innerText.includes('가려질 말'))");
  record('★★ R117 가리기 — 방장 채팅이 손님 화면에만 안 보인다', hostSees && !guestSees, JSON.stringify({ hostSees, guestSees }));
  // 설정 안 "가린 사람" → 풀기
  await realClick(G, '#menu-btn');
  await waitSel(G, '.menu-modal');
  await G.evaluate("[...document.querySelectorAll('.menu-modal .menu-item')].find((b) => b.innerText.trim() === '설정')?.click()");
  const blocksShown = await waitSel(G, '[data-gb-blocks]', 3000);
  record('★ R117 ☰ → 설정 — "가린 사람" 칸 · [풀기]', blocksShown, '');
  if (blocksShown) await snap(G, 'r117-19-blocks-m360-pastel');
  await realClick(G, '[data-gb-blocks] [data-unblock]');
  await sleep(500);
  const unblocked = !(await has(G, '[data-gb-blocks]'));
  record('★ R117 가린 사람 풀기 → 칸이 사라진다', unblocked, '');
  await press(G, 'Escape');

  // [11] PC 첫 화면(두 칸) — 손님이 나와서
  await G.setViewport(1280, 720);
  await sleep(300);
  await realClick(G, 'button[aria-label="나가기"]');
  await sleep(300);
  await ev(G, "document.querySelector('.confirm-modal .confirm-actions button')?.click()");
  await G.waitFor("document.querySelector('[data-gb-home]') !== null", 6000);
  await sleep(800);
  const pc = JSON.parse(await ev(G, "JSON.stringify({ home: document.querySelector('[data-gb-home]')?.dataset.gbHome, lobby: document.querySelector('.gb-lobby') !== null, dir: document.querySelector('.gb-dir') !== null, friends: document.querySelector('.gb-tools #friends-btn')?.offsetParent !== null, menu: document.querySelector('#gb-menu-btn')?.offsetParent !== null })"));
  record('★★ R117 PC 첫 화면 — 왼쪽 로비 · 오른쪽 목록 · 위 오른쪽 [친구] · [☰] 보임', pc.home === 'pc' && pc.lobby && pc.dir && pc.friends && pc.menu, JSON.stringify(pc));
  for (const s of [{ w: 1280, h: 720, n: 'pc' }, { w: 1536, h: 864, n: 'lap' }, { w: 1920, h: 1080, n: 'fhd' }]) {
    await G.setViewport(s.w, s.h);
    await sleep(450);
    for (const t of THEMES) {
      await setTheme(G, t);
      await snap(G, `r117-20-home-${s.n}-${t}`);
    }
    await setTheme(G, 'pastel');
    const sc = await ev(G, 'document.documentElement.scrollHeight > innerHeight + 1');
    record(`★ R117 PC 첫 화면 ${s.w}×${s.h} — 세로 스크롤 없음`, !sc, '');
  }
  // PC ☰ 메뉴
  await G.setViewport(1280, 720);
  await sleep(300);
  await realClick(G, '#gb-menu-btn');
  await waitSel(G, '[data-gb-menu-pop]');
  await snap(G, 'r117-21-menu-pc-pastel');
  await press(G, 'Escape');
  // PC 방 만들기
  await realClick(G, '[data-gb-make]');
  await waitSel(G, '[data-gb-create]');
  await snap(G, 'r117-22-create-pc-pastel');
  await press(G, 'Escape');

  // [12] 견준 값 표 — 새 부품 ↔ 기존 부품(같은 앱인가)
  const MEASURE = `JSON.stringify((() => {
    const m = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { sel, font: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, h: Math.round(r.height), radius: cs.borderRadius, pad: cs.padding }; };
    return [m('[data-gb-together]'), m('[data-gb-solo]'), m('.dir-list'), m('.dir-kind'), m('[data-quick-join]'), m('[data-gb-make]'), m('.gb-tools #friends-btn'), m('#gb-menu-btn'), m('.dir-title'), m('.dir-meta .badge')].filter(Boolean);
  })())`;
  await G.setViewport(390, 844);
  await sleep(500);
  const newVals = JSON.parse(await ev(G, MEASURE));
  // 기존: 방 안(대기실) 같은 크기 — 게임 시작 버튼 · 카드 · 프리셋 · 위 막대 버튼
  const OLD = `JSON.stringify((() => {
    const m = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { sel, font: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, h: Math.round(r.height), radius: cs.borderRadius, pad: cs.padding }; };
    return [m('[data-start-btn]'), m('.lobby-card'), m('.preset'), m('#people-btn'), m('#menu-btn'), m('.room-title h1'), m('.badge')].filter(Boolean);
  })())`;
  await H.setViewport(390, 844);
  await sleep(500);
  const oldVals = JSON.parse(await ev(H, OLD));
  const dir = path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r117');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'r117-compare.json'), JSON.stringify({ new: newVals, old: oldVals }, null, 2));
  console.log('  📏 견준 값 → r117-compare.json');
  const fr = newVals.find((v) => v.sel.includes('friends-btn'));
  const pp = oldVals.find((v) => v.sel === '#people-btn');
  record('★ R117 위 [친구] 단추 = 방 안 [참여자] 단추와 같은 높이 · 둥근 정도', fr && pp && fr.h === pp.h && fr.radius === pp.radius, JSON.stringify({ fr, pp }));

  G.close();
  H.close();
  for (const s of bots) s.close();
}
