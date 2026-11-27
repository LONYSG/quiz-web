// =============================================================================
// ★★★ R123 — 찬종 첫 플레이 피드백 그림 · 검사 (`node scripts/ui-check.mjs --r123` · SHOT_DIR=r123)
//   서버 스위치: GONGBANG=1 SOLO=1 BELT=1 (SOLO_TEST_TIME_MS 로 문제 시간을 줄여도 된다 — 해설 · 카운트는 진짜 시간)
//
//   크기 일곱(PC 1536×864 = 찬종 노트북 · 1920×1080 · 1366×768 · 1280×720 · 1000×700 · 모바일 390×844 · 360×740) ×
//     로비 · 방 설정(퀴즈 · 캐치마인드 · 라이어) · 모드 바꾸기 · 혼자 하기 시작 · 판 · 해설 · 결과 · 단계표
//   ★ 화면마다 문서 전체 세로 스크롤 0(document.scrollingElement.scrollHeight <= innerHeight) 단정 — 안쪽 칸(채팅 · 목록) 스크롤은 괜찮다.
//   ★ 방 설정 세 모드에서 게임 시작 버튼의 자리 · 크기가 같다(크기마다).
//   ★ 크롬 탭은 둘(방장 · 혼자 하기) — 손님은 소켓 봇.
// =============================================================================

import { writeFileSync } from 'node:fs';
import path from 'node:path';

export const R123_SIZES = [
  { w: 1536, h: 864, n: 'pc1536', m: false },
  { w: 1920, h: 1080, n: 'pc1920', m: false },
  { w: 1366, h: 768, n: 'pc1366', m: false },
  { w: 1280, h: 720, n: 'pc1280', m: false },
  { w: 1000, h: 700, n: 'pc1000', m: false },
  { w: 390, h: 844, n: 'm390', m: true },
  { w: 360, h: 740, n: 'm360', m: true },
];

export async function r123Flow(ctx) {
  const { browser, BASE, sleep, snap, record, realClick, realType, signUp, setTheme, newPage, touchDevice, withPg, ACCOUNT_PREFIX, SHOT_ROOT } = ctx;
  const site = await (await fetch(`${BASE}/api/site`)).json();
  console.log(`\n[R123] 첫 플레이 피드백 — 공방 ${site.gongbang ? '켬' : '끔'} · 혼자 하기 ${site.solo ? '켬' : '끔'} · 띠 ${site.belt ? '켬' : '끔'} · trim ${JSON.stringify(site.trim)}`);
  if (!site.gongbang || !site.solo) {
    record('★ R123 — 서버 스위치 GONGBANG=1 SOLO=1 BELT=1 로 돌려야 한다', false, JSON.stringify(site));
    return;
  }
  const ev = async (page, js) => page.evaluate(js);
  const J = async (page, js) => JSON.parse(await page.evaluate(`JSON.stringify(${js})`));
  const has = async (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)}) !== null`);
  const waitSel = (page, sel, ms = 8000) => page.waitFor(`document.querySelector(${JSON.stringify(sel)}) !== null`, ms);
  const size = async (page, s) => {
    await touchDevice(page, s.w, s.h, s.m);
    if (!s.m) await page.setViewport(s.w, s.h);
    await sleep(350);
  };
  const noScroll = async (page) => J(page, "({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth })");
  /** 표: 화면 × 크기 → 스크롤 0 */
  const table = {};
  const checkFit = async (page, screen, s) => {
    const f = await noScroll(page);
    const ok = f.sh <= f.ih && f.sw <= f.iw + 1;
    (table[screen] ??= {})[s.n] = ok ? 'OK' : `넘침 ${f.sh - f.ih}px`;
    record(`★★ R123 ${screen} ${s.w}×${s.h} — 문서 전체 스크롤 0`, ok, JSON.stringify(f));
    return ok;
  };
  const press = async (page, key, code = key, mods = 0) => {
    await page.send('Input.dispatchKeyEvent', { type: mods ? 'rawKeyDown' : 'keyDown', key, code, modifiers: mods, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : /^\d$/.test(key) ? 48 + Number(key) : 0 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers: mods, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : /^\d$/.test(key) ? 48 + Number(key) : 0 });
    await sleep(200);
  };

  // ── 소켓 봇(손님)
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

  // ━━━━━━━━ A. 같이 하기 ━━━━━━━━
  const H = await newPage(browser, 'r123-host', true);
  await size(H, R123_SIZES[0]);
  await signUp(H, 'r123h', '도토리방장');
  await sleep(700);
  // 로비(공방 첫 화면)
  for (const s of R123_SIZES) {
    await size(H, s);
    await checkFit(H, '로비', s);
    await snap(H, `r123-lobby-${s.n}-pastel`);
  }
  await size(H, R123_SIZES[0]);
  // 방 만들기(퀴즈)
  await realClick(H, '[data-gb-together]');
  await sleep(500);
  await realClick(H, '[data-gb-make]');
  await waitSel(H, '[data-gb-create]');
  await realClick(H, '[data-gb-create] [data-kind="quiz"]');
  await H.setInput('[data-gb-title]', '도토리네 방');
  await realClick(H, '[data-gb-create] .big-btn');
  await H.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 10000);
  await sleep(700);

  // A1 — 문구: 낼 수 있는 문제 · 난이도 설명이 없다 · 게임 한 줄
  const a1 = await J(H, "({ avail: document.querySelector('.avail-line')?.innerText ?? null, desc: document.querySelector('[data-level-desc]') !== null, line: document.querySelector('[data-game-line]')?.innerText ?? '', minigameOnly: document.querySelector('[data-mode=\"minigame\"]') !== null, pick: document.querySelector('[data-mg-catalog-open], #minigame-pick-btn') !== null, dots: [...document.querySelectorAll('.lobby-card *')].filter((e) => e.children.length === 0 && (e.textContent ?? '').includes('·')).map((e) => e.textContent.trim()).slice(0, 5) })");
  record('★★ R123 A1 방 설정(퀴즈) — "낼 수 있는 문제 N개" · 난이도 설명 없음 · 한 줄 "문제를 보고 가장 먼저 맞혀요" · 미니게임만 · 고르기 버튼 없음 · 카드 안 · 없음', a1.avail === null && !a1.desc && a1.line === '문제를 보고 가장 먼저 맞혀요' && !a1.minigameOnly && !a1.pick && a1.dots.length === 0, JSON.stringify(a1));
  // A7 — 대결 줄(개인전 / 팀전) · 1명에서 팀전 → 시작 버튼 꺼짐 + 아래 한 줄
  const startRect = async () => J(H, "(() => { const b = document.querySelector('[data-start-btn]')?.getBoundingClientRect(); return b ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null; })()");
  await realClick(H, '[data-team-toggle]');
  await sleep(500);
  const team = await J(H, "({ off: document.querySelector('[data-start-btn]')?.disabled ?? null, note: document.querySelector('[data-notice-for=\"start-block\"]')?.innerText ?? '', row: document.querySelector('[data-team-row]') !== null })");
  record('★★ R123 A3 · A7 — 팀전(1명) → 시작 버튼 꺼짐 · 아래 "팀전은 짝수 인원일 때 시작할 수 있어요"', team.off === true && team.note.includes('팀전은 짝수 인원일 때') && team.row, JSON.stringify(team));
  await snap(H, 'r123-team-block-pc1536-pastel');
  await realClick(H, '[data-team-solo]');
  await sleep(400);
  // A2 — 경고 꼴: 경고색 · 자기 줄
  await realClick(H, '[data-team-toggle]');
  await sleep(300);
  const warnCol = await J(H, "(() => { const n = document.querySelector('[data-notice-for=\"start-block\"]'); const base = document.querySelector('[data-game-line]'); return n && base ? { notice: getComputedStyle(n).color, base: getComputedStyle(base).color, display: getComputedStyle(n).display } : null; })()");
  record('★ R123 A2 — 경고 한 줄은 기본 문구와 다른 색 · 자기 줄(flex 블록)', warnCol && warnCol.notice !== warnCol.base && warnCol.display === 'flex', JSON.stringify(warnCol));
  await realClick(H, '[data-team-solo]');
  await sleep(300);

  // A4 · A5 — 모드마다 크기 일곱 · 시작 버튼 자리 · 크기 같음
  const btnBy = {};
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
  // 모드 바꾸기 창(지금 모드 = 체크 · 변경하기 꺼짐)
  await realClick(H, '[data-gb-mode-btn]');
  await waitSel(H, '[data-gb-mode-pop]');
  await sleep(250);
  const mc = await J(H, "({ items: document.querySelectorAll('[data-gb-mode-pop] [data-kind]').length, now: document.querySelector('[data-gb-mode-pop] [data-now]')?.dataset.kind ?? null, nowDisabled: document.querySelector('[data-gb-mode-pop] [data-now]')?.disabled ?? null, goOff: document.querySelector('[data-gb-mode-go]')?.disabled ?? null, goText: document.querySelector('[data-gb-mode-go]')?.innerText ?? '', lines: [...document.querySelectorAll('[data-gb-mode-pop] .gb-mode-line')].map((e) => e.innerText), jigeum: (document.querySelector('[data-gb-mode-pop]')?.innerText ?? '').includes('(지금)') })");
  record('★★ R123 A4 모드 바꾸기 — 세 줄(이름 + 한 줄) · 지금 모드는 켜진 채 체크 · 지금 모드면 "변경하기" 꺼짐 · "(지금)" 글 없음', mc.items === 3 && mc.now === 'quiz' && mc.nowDisabled === false && mc.goOff === true && mc.goText === '변경하기' && !mc.jigeum && mc.lines.every((l) => !l.includes('·')), JSON.stringify(mc));
  const goBefore = await J(H, "(() => { const b = document.querySelector('[data-gb-mode-go]').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })()");
  await realClick(H, '[data-gb-mode-pop] [data-kind="liar"]');
  await sleep(150);
  const goAfter = await J(H, "(() => { const b = document.querySelector('[data-gb-mode-go]').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), off: document.querySelector('[data-gb-mode-go]').disabled, text: document.querySelector('[data-gb-mode-go]').innerText }; })()");
  record('★ R123 A4 — 다른 모드를 고르면 "변경하기" 켜짐 · 글 · 크기 그대로', !goAfter.off && goAfter.text === '변경하기' && goAfter.w === goBefore.w && goAfter.h === goBefore.h, JSON.stringify({ goBefore, goAfter }));
  for (const s of R123_SIZES) {
    await size(H, s);
    await snap(H, `r123-modechange-${s.n}-pastel`);
    await checkFit(H, '모드 바꾸기', s);
  }
  await press(H, 'Escape');
  await sleep(300);

  for (const kind of ['quiz', 'draw', 'liar']) {
    if (kind !== 'quiz') {
      await size(H, R123_SIZES[0]);
      await toMode(kind);
    }
    for (const s of R123_SIZES) {
      await size(H, s);
      const r = await startRect();
      (btnBy[s.n] ??= {})[kind] = r;
      await checkFit(H, `방 설정 ${kind}`, s);
      await snap(H, `r123-settings-${kind}-${s.n}-pastel`);
      if (s.n === 'pc1536' || s.n === 'm360') {
        await setTheme(H, 'night');
        await sleep(150);
        await snap(H, `r123-settings-${kind}-${s.n}-night`);
        await setTheme(H, 'pastel');
      }
    }
    await size(H, R123_SIZES[0]);
    const k = await J(H, "({ line: document.querySelector('[data-game-line]')?.innerText ?? '', label: document.querySelector('[data-rounds-row] .set-label')?.innerText ?? '', presets: [...document.querySelectorAll('[data-rounds-row] [data-rounds]')].map((b) => b.dataset.rounds).join(','), input: document.querySelector('[data-rounds-row] input') !== null, topic: document.querySelector('.topic-picker, [data-topic-picker]') !== null, team: document.querySelector('[data-team-row]') !== null, note: document.querySelector('[data-notice-for=\"start-block\"]')?.innerText ?? '', off: document.querySelector('[data-start-btn]')?.disabled ?? null })");
    if (kind === 'draw') record('★★ R123 A1 · A8 캐치마인드 — 한 줄 · "문제 수" 10 · 20 · 30 · 50(숫자 칸 없음) · 주제 고르기 없음 · 대결 줄 없음 · 1명 → "캐치마인드는 2명부터 할 수 있어요"', k.line === '한 사람이 그린 그림을 보고 제시어를 맞혀요' && k.label === '문제 수' && k.presets === '10,20,30,50' && !k.input && !k.topic && !k.team && k.note.includes('캐치마인드는 2명부터') && k.off === true, JSON.stringify(k));
    if (kind === 'liar') record('★★ R123 A1 · A8 라이어 — 한 줄 · "판 수" · 주제 고르기 없음 · 1명 → "라이어 게임은 3명부터 할 수 있어요"', k.line.startsWith('모두 같은 제시어를 받지만') && k.label === '판 수' && !k.topic && !k.team && k.note.includes('라이어 게임은 3명부터') && k.off === true, JSON.stringify(k));
  }
  // 시작 버튼 자리 · 크기 — 크기마다 세 모드가 같다
  for (const s of R123_SIZES) {
    const b = btnBy[s.n];
    const same = b && b.quiz && b.draw && b.liar && ['x', 'y', 'w', 'h'].every((key) => Math.abs(b.quiz[key] - b.draw[key]) <= 1 && Math.abs(b.quiz[key] - b.liar[key]) <= 1);
    record(`★★ R123 A5 ${s.w}×${s.h} — 게임 시작 버튼 자리 · 크기가 세 모드에서 같다`, same, JSON.stringify(b));
  }
  // 손님 둘 → 라이어 3명 → 시작 줄 비고 버튼 켜짐(줄 자리는 그대로)
  await size(H, R123_SIZES[0]);
  const code = await ev(H, "document.querySelector('[data-room-code], .room-code')?.dataset.roomCode ?? document.querySelector('.room-code')?.innerText ?? ''");
  const roomId = await ev(H, "location.pathname.split('/')[2] ?? ''");
  const g1 = await bot('r123g1', '손님하나');
  const g2 = await bot('r123g2', '손님둘');
  g1.emit('room.join', { roomId });
  g2.emit('room.join', { roomId });
  await sleep(1200);
  const three = await J(H, "({ off: document.querySelector('[data-start-btn]')?.disabled ?? null, note: document.querySelector('[data-notice-for=\"start-block\"]')?.innerText ?? '', h: Math.round(document.querySelector('[data-notice-for=\"start-block\"]')?.getBoundingClientRect().height ?? -1), y: Math.round(document.querySelector('[data-start-btn]')?.getBoundingClientRect().top ?? -1) })");
  record('★ R123 A3 — 3명 라이어 → 시작 버튼 켜짐 · 경고 줄 비었지만 자리는 남음(버튼 안 움직임)', three.off === false && three.note === '' && three.h > 0 && three.y === btnBy.pc1536.liar.y, JSON.stringify({ three, before: btnBy.pc1536.liar, code }));
  await snap(H, 'r123-settings-liar-3p-pc1536-pastel');
  // 퀴즈 팀전 3명(홀수) → 막힘 · 4명이면 풀림은 봇 team 이 본다
  await toMode('quiz');
  await realClick(H, '[data-team-toggle]');
  await sleep(500);
  const odd = await J(H, "({ off: document.querySelector('[data-start-btn]')?.disabled ?? null, note: document.querySelector('[data-notice-for=\"start-block\"]')?.innerText ?? '' })");
  record('★ R123 A3 · A7 — 퀴즈 팀전 3명(홀수) → 시작 꺼짐 · "팀전은 짝수 인원일 때"', odd.off === true && odd.note.includes('짝수'), JSON.stringify(odd));
  await snap(H, 'r123-team-odd-pc1536-pastel');
  await realClick(H, '[data-team-solo]');
  await sleep(300);
  // A10 — "지난 판 문제"는 방 설정 카드에 없다(지난 판이 있으면 위 막대 제보 옆)
  const fb = await J(H, "({ inCard: document.querySelector('.lobby-card #feedback-last-btn') !== null })");
  record('★ R123 A10 — "지난 판 문제"가 방 설정 카드 안에 없다', !fb.inCard, JSON.stringify(fb));
  for (const s of bots) s.disconnect();
  bots.length = 0;
  // 방에서 나간다
  await H.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
  await sleep(300);
  await H.evaluate("document.querySelector('.confirm-modal .confirm-actions button')?.click()");
  await sleep(800);
  H.close();

  // ━━━━━━━━ B. 혼자 하기 ━━━━━━━━
  const S = await newPage(browser, 'r123-solo', true);
  await size(S, R123_SIZES[6]);
  await signUp(S, 'r123s', '혼자도토리');
  await sleep(700);
  // 포인트 100 을 준다(아이템 사기)
  const loginId = `${ACCOUNT_PREFIX}_r123s`.toLowerCase();
  await withPg(async (c) => {
    const a = (await c.query(`SELECT id FROM accounts WHERE login_id = $1`, [loginId])).rows[0];
    if (a) await c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, 100, 'admin', 'ui-check r123')`, [a.id]);
  });
  await S.waitFor("document.querySelector('[data-gb-solo]') !== null", 8000);
  // B1 — 시작 화면이 첫 그림부터 다 그려져 있다(띠 칸이 열자마자 있다)
  await realClick(S, '[data-gb-solo]');
  const first = await J(S, "({ start: document.querySelector('[data-solo=\"start\"]') !== null, belt: document.querySelector('[data-solo-belt]') !== null })");
  record('★★ R123 B1 — 혼자 하기를 누른 첫 그림에 띠 칸이 이미 있다(로비 값으로)', first.start && first.belt, JSON.stringify(first));
  await waitSel(S, '[data-solo-items-pick]');
  await sleep(600);
  for (const s of R123_SIZES) {
    await size(S, s);
    await checkFit(S, '혼자 하기 시작', s);
    await snap(S, `r123-solo-start-${s.n}-pastel`);
  }
  // B3 — 단계표
  for (const s of R123_SIZES) {
    await size(S, s);
    await realClick(S, '[data-belt-table-open]');
    await waitSel(S, '[data-belt-table]');
    await sleep(250);
    const bt = await J(S, "(() => { const p = document.querySelector('[data-belt-table]').getBoundingClientRect(); return { cells: document.querySelectorAll('[data-belt-cell]').length, top: Math.round(p.top), bottom: Math.round(p.bottom), ih: innerHeight, inner: document.querySelector('[data-belt-table]').scrollHeight <= document.querySelector('[data-belt-table]').clientHeight + 1 }; })()");
    record(`★★ R123 B3 단계표 ${s.w}×${s.h} — 25칸 · 창이 화면 안 · 창 안 스크롤 없음`, bt.cells === 25 && bt.top >= 0 && bt.bottom <= bt.ih && bt.inner, JSON.stringify(bt));
    (table['단계표'] ??= {})[s.n] = bt.top >= 0 && bt.bottom <= bt.ih && bt.inner ? 'OK' : '넘침';
    await snap(S, `r123-belt-table-${s.n}-pastel`);
    await press(S, 'Escape');
    await sleep(200);
  }
  // B6 — 아이템 고르기: 힌트 1 · 초성 1 · 넘기기 1 = 45P
  await size(S, R123_SIZES[6]);
  for (const k of ['hint', 'initial', 'skip']) await realClick(S, `[data-item-plus="${k}"]`);
  await sleep(200);
  const sum = await J(S, "({ cost: document.querySelector('[data-item-sum]')?.dataset.itemSum, text: document.querySelector('[data-item-sum]')?.innerText ?? '' })");
  record('★★ R123 B6 — 고르면 쓸 포인트 45P · 지금 · 남을 포인트를 바로 보여 준다', sum.cost === '45' && sum.text.includes('45P') && sum.text.includes('100P') && sum.text.includes('55P'), JSON.stringify(sum));
  await snap(S, 'r123-solo-items-m360-pastel');
  // 시작
  await realClick(S, '[data-solo-start]');
  await S.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 10000);
  await sleep(400);
  // (판 화면 크기 일곱은 맨 끝 새 판에서 — 크기를 바꾸는 에뮬레이션이 창 초점을 빼앗아 그 문제가 "화면 벗어남"이 된다)
  const items1 = await J(S, "({ row: document.querySelector('[data-solo-items]') !== null, left: [...document.querySelectorAll('[data-solo-item]')].map((b) => b.dataset.left).join(','), tried: document.querySelector('.solo-tried') !== null })");
  record('★★ R123 B5 · B6 — 판 중 아이템 줄(남은 1 · 1 · 1) · "친 답" 줄 없음', items1.row && items1.left === '1,1,1' && !items1.tried, JSON.stringify(items1));
  // Alt+2 초성(입력칸에 글자를 치는 중에도 · 모바일 화면에서도)
  await realType(S, '[data-solo-input]', '가');
  await press(S, '2', 'Digit2', 1);
  await S.waitFor("document.querySelector('[data-solo-initial]') !== null", 4000).catch(() => false);
  const ini = await J(S, "({ ini: document.querySelector('[data-solo-initial]')?.innerText ?? '', left: document.querySelector('[data-solo-item=\"initial\"]')?.dataset.left })");
  record('★★ R123 B6 — Alt+2(모바일 화면 · 입력 중) → 초성이 뜨고 남은 초성 0', ini.ini.includes('초성') && ini.left === '0', JSON.stringify(ini));
  // 틀린 답 → 바로 흔들림 · 공개 없음
  await S.evaluate("document.querySelector('[data-solo-input]').value = ''");
  await realType(S, '[data-solo-input]', '아무말대잔치');
  await S.evaluate("window.__shook = false; new MutationObserver(() => { if (document.querySelector('[data-solo-input]')?.classList.contains('input-shake')) window.__shook = true; }).observe(document.querySelector('[data-solo-input]'), { attributes: true })");
  await press(S, 'Enter');
  await sleep(500);
  const wr = await J(S, "({ shook: window.__shook, reveal: document.querySelector('[data-solo-reveal]') !== null, snd: (window.__qwSoundLog ?? []).some((x) => x.id === 'mg-foul') })");
  record('★★ R123 B5 — 틀린 답 → 입력칸 흔들림 + 짧은 부저 · 공개 없음(다시 칠 수 있다)', wr.shook && !wr.reveal && wr.snd, JSON.stringify(wr));
  // 맞힘 → "정답!" 크게 · 시간(x.x초) 없음 · 해설 → Enter → 점 카운트
  const text = await ev(S, "document.querySelector('[data-solo] .q-text')?.dataset.text ?? ''");
  const ans = await withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '');
  await realType(S, '[data-solo-input]', ans);
  await press(S, 'Enter');
  await S.waitFor("document.querySelector('[data-solo-reveal]')?.dataset.soloReveal === 'ok'", 4000);
  await sleep(300);
  const ok = await J(S, "({ verdict: document.querySelector('.solo-verdict')?.innerText ?? '', fs: parseFloat(getComputedStyle(document.querySelector('.solo-verdict')).fontSize), ms: /\\d\\.\\d초/.test(document.querySelector('[data-solo-q]')?.innerText ?? ''), phase: document.querySelector('[data-solo-q]')?.dataset.soloPhase })");
  record('★★ R123 B5 — 맞힘 → 크고 또렷한 "정답!" · 맞힌 시간 표기 없음 · 해설 단계', ok.verdict === '정답!' && ok.fs >= 26 && !ok.ms && ok.phase === 'explain', JSON.stringify(ok));
  await snap(S, 'r123-solo-correct-m360-pastel');
  await press(S, 'Enter');
  await S.waitFor("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'count'", 3000).catch(() => false);
  await sleep(1300);
  const cnt = await J(S, "({ phase: document.querySelector('[data-solo-q]')?.dataset.soloPhase, dots: Number(document.querySelector('[data-solo-next]')?.dataset.soloNext ?? 0), snd: (window.__qwSoundLog ?? []).filter((x) => x.id === 'nextCount').length })");
  record('★★ R123 B5 — 해설 중 Enter → 바로 점 카운트(점 하나씩 · 똑 = 영상 nextCount)', cnt.phase === 'count' && cnt.dots >= 2 && cnt.snd >= 2, JSON.stringify(cnt));
  await snap(S, 'r123-solo-count-m360-pastel');
  await S.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 2 && document.querySelector('[data-solo-reveal]') === null", 6000);
  // Alt+3 넘기기 → 목숨 그대로 · "넘겼어요"
  const livesBefore = await ev(S, "document.querySelector('[data-lives]')?.dataset.lives");
  await press(S, '3', 'Digit3', 1);
  await S.waitFor("document.querySelector('[data-solo-reveal]')?.dataset.soloReveal === 'skip'", 4000).catch(() => false);
  const sk = await J(S, "({ reveal: document.querySelector('[data-solo-reveal]')?.dataset.soloReveal ?? null, lives: document.querySelector('[data-lives]')?.dataset.lives, correct: document.querySelector('[data-solo-correct]')?.innerText })");
  record('★★ R123 B6 — Alt+3 넘기기 → 목숨 그대로 · 맞힌 수 그대로 · 정답 + 해설 보여 줌', sk.reveal === 'skip' && sk.lives === livesBefore && sk.correct === '1', JSON.stringify(sk));
  await snap(S, 'r123-solo-skip-m360-pastel');
  // 해설 화면(넘기기 결과) — 크기 일곱
  for (const s of R123_SIZES) {
    await size(S, s);
    await checkFit(S, '혼자 하기 해설', s);
    await snap(S, `r123-solo-explain-${s.n}-pastel`);
  }
  await size(S, R123_SIZES[6]);
  // 남은 목숨 셋 — 시간 끝까지(해설 · 카운트는 진짜 시간)
  for (let i = 0; i < 3; i += 1) {
    const n0 = Number(await ev(S, "document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0"));
    await S.waitFor(`(Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) > ${n0} && document.querySelector('[data-solo-reveal]') === null) || document.querySelector('[data-solo="end"]') !== null`, 30000);
    if (await has(S, '[data-solo="end"]')) break;
    await S.waitFor("document.querySelector('[data-solo-reveal]') !== null", 30000);
    if (i < 2) await press(S, 'Enter');
  }
  // 마지막 해설 → Enter → 끝 화면
  await sleep(500);
  if (!(await has(S, '[data-solo="end"]'))) await press(S, 'Enter');
  await S.waitFor("document.querySelector('[data-solo=\"end\"]') !== null", 20000);
  await S.waitFor("document.querySelector('[data-solo-promo]') === null", 6000).catch(() => false);
  await sleep(400);
  const end = await J(S, "({ meta: document.querySelector('[data-solo-end-meta]')?.innerText ?? '', wq: document.querySelectorAll('[data-wq]').length, ans: document.querySelectorAll('.solo-wrongs .solo-wq-ans').length, ell: [...document.querySelectorAll('.solo-wq-text')].some((p) => getComputedStyle(p).textOverflow === 'ellipsis') })");
  // ★ R124 3-2 — R123 B7 의 "질문 한 줄 + 정답(해설 뺌)"을 바꿨다: 질문 · 정답 · 해설 전부(말줄임 없음)
  record('★★ R123 B6 끝 — 쓴 아이템 · 돌려받음 · ★ R124 3-2 틀린 문제마다 정답 줄 · 말줄임 없음', end.meta.includes('쓴 아이템') && end.meta.includes('돌려받음') && end.ans === end.wq && !end.ell, JSON.stringify(end));
  const bal = await withPg(async (c) => {
    const a = (await c.query(`SELECT id FROM accounts WHERE login_id = $1`, [loginId])).rows[0];
    return (await c.query(`SELECT coalesce(sum(amount), 0)::int AS spent FROM point_spends WHERE account_id = $1 AND reason = 'solo-item'`, [a.id])).rows[0].spent;
  });
  record('★★ R123 B6 — 값: 45P 를 냈고 안 쓴 힌트(5P)를 돌려받아 쓴 것 = 40P', bal === 40, String(bal));
  for (const s of R123_SIZES) {
    await size(S, s);
    await checkFit(S, '혼자 하기 결과', s);
    await snap(S, `r123-solo-end-${s.n}-pastel`);
    if (s.n === 'm360') {
      // B7 두 꼴 — 틀린 문제 질문 + 정답(지금) / 틀린 문제 없앰
      await S.evaluate("document.querySelector('[data-solo-wrongs]')?.style.setProperty('display', 'none')");
      await snap(S, `r123-solo-end-${s.n}-nowrongs-pastel`);
      await S.evaluate("document.querySelector('[data-solo-wrongs]')?.style.removeProperty('display')");
      await setTheme(S, 'night');
      await sleep(150);
      await snap(S, `r123-solo-end-${s.n}-night`);
      await setTheme(S, 'pastel');
    }
  }
  // 판 화면 크기 일곱 — 새 판(아이템 없음 · 다시 → 바로 시작). 크기를 바꾸면 초점을 잃어 그 문제가 끝날 수 있어 크기마다 다음 문제를 기다린다
  await size(S, R123_SIZES[6]);
  await realClick(S, '[data-solo-again]');
  await S.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) >= 1", 10000).catch(() => false);
  for (const s of R123_SIZES) {
    await size(S, s);
    await S.evaluate("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'explain' && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    await S.waitFor("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'question' || document.querySelector('[data-solo=\"end\"]') !== null", 15000).catch(() => false);
    if (await has(S, '[data-solo="end"]')) break;
    await checkFit(S, '혼자 하기 판', s);
    await snap(S, `r123-solo-play-${s.n}-pastel`);
  }
  writeFileSync(path.join(SHOT_ROOT, 'r123-fit.json'), JSON.stringify(table, null, 2));
  console.log('[R123] 스크롤 0 표', JSON.stringify(table));
  for (const s of bots) s.disconnect();
  S.close();
}
