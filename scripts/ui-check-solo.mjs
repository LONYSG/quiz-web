// =============================================================================
// ★★★ R118 — 혼자 하기 · 띠 화면 그림 · 검사 (`node scripts/ui-check.mjs --solo` · SHOT_DIR=r118)
//   서버 스위치를 켠 채(GONGBANG=1 SOLO=1 BELT=1) 돌면: 로비(띠 없음 · [혼자 하기]) · 시작 · 진행(안 A · 키보드 올라온 높이) · 맞힘 · 틀린 답 ·
//     시간 끝 · 나감 · 끝 화면 · 띠 받는 순간(첫 띠 · 단계) · 새로 고침 이어받기 · 그만하기 · 로비 띠 줄 · 방 안 띠(PC 자리 · 휴대폰 참여자 창) · 사람 카드
//     를 360 · 390 · PC 1280 × 파스텔 · 밤으로 찍고, 견준 값 표를 남긴다.
//   스위치를 끈 채(GONGBANG=1 만) 돌면: [혼자 하기] = "곧 열려요" · 띠 줄 없음 · 방 사람 칸에 띠 없음(오늘과 같다).
//   ★ 크롬 탭은 하나 — 방 만들기 · 손님은 소켓 봇(메모리 · R116 교훈).
// =============================================================================

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const THEMES = ['pastel', 'night'];

export async function soloFlow(ctx) {
  const { browser, BASE, sleep, snap, record, realClick, realType, signUp, setTheme, newPage, touchDevice, withPg, ACCOUNT_PREFIX, SHOT_ROOT } = ctx;
  const site = await (await fetch(`${BASE}/api/site`)).json();
  const on = site.solo === true;
  const beltOn = site.belt === true;
  console.log(`\n[R118] 혼자 하기 화면 — 스위치 SOLO ${on ? '켬' : '끔'} · BELT ${beltOn ? '켬' : '끔'} · 공방 ${site.gongbang ? '켬' : '끔'}`);

  const ev = async (page, js) => page.evaluate(js);
  const J = async (page, js) => JSON.parse(await page.evaluate(`JSON.stringify(${js})`));
  const has = async (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)}) !== null`);
  const waitSel = (page, sel, ms = 8000) => page.waitFor(`document.querySelector(${JSON.stringify(sel)}) !== null`, ms);
  const shoot = async (page, name, themes = THEMES) => {
    for (const t of themes) {
      await setTheme(page, t);
      await sleep(150);
      await snap(page, `${name}-${t}`);
    }
    await setTheme(page, 'pastel');
  };
  const mobile = async (page, w, h) => touchDevice(page, w, h, true);
  const pc = async (page, w = 1280, h = 720) => {
    await touchDevice(page, w, h, false);
    await page.setViewport(w, h);
    await sleep(300);
  };

  // ── 소켓 봇(방 만들기)
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
  const answerOf = async (page) => {
    const text = await ev(page, "document.querySelector('[data-solo] .q-text')?.dataset.text ?? ''");
    return withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '');
  };
  const qn = (page) => ev(page, "Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0)");
  // ★ R123 — 결과 뒤 해설(4~12초) → 점 카운트 3초: 해설 중이면 Enter 로 넘기고 기다린다
  const waitNextQ = async (page, after, ms = 20000) => {
    await page.evaluate("document.querySelector('[data-solo-q]')?.dataset.soloPhase === 'explain' && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    return page.waitFor(`Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) > ${after} && document.querySelector('[data-solo-reveal]') === null`, Math.max(ms, 20000));
  };
  const enter = async (page) => {
    await page.key('Enter');
    await sleep(250);
  };

  const H = await newPage(browser, 'solo', true);
  await mobile(H, 360, 740);
  await signUp(H, 'solo', '혼자도장');
  await sleep(700);

  if (!on) {
    // ── 스위치를 끈 채: [혼자 하기] = 곧 열려요 · 띠 줄 없음
    await H.waitFor("document.querySelector('[data-gb-solo]') !== null", 8000);
    const off = await J(H, "({ small: document.querySelector('[data-gb-solo] small')?.innerText ?? '', belt: document.querySelector('[data-gb-belt]') !== null })");
    record('★★ R118 스위치 끔 — [혼자 하기] 아래 "곧 열려요" · 띠 줄 없음(R117 그대로)', off.small === '곧 열려요' && !off.belt, JSON.stringify(off));
    await realClick(H, '[data-gb-solo]');
    await sleep(500);
    const still = await ev(H, "document.querySelector('[data-gb-home]')?.dataset.gbHome");
    record('★★ R118 스위치 끔 — 눌러도 혼자 하기 화면이 안 열린다', still !== 'solo', String(still));
    await snap(H, 'r118-off-lobby-m360-pastel');
    const b = await bot('soff', '끔방장');
    b.emit('room.create', { title: '끔 확인 방' });
    await sleep(800);
    record('★★ R118 스위치 끔 — 방 사람 칸에 belt 칸 자체가 없다', (b.snap?.players ?? []).length > 0 && b.snap.players.every((p) => !('belt' in p)), JSON.stringify(b.snap?.players?.[0] ?? null));
    for (const s of bots) s.disconnect();
    H.close();
    return;
  }

  // [1] 로비 — 띠 없음 · [혼자 하기] "목숨 셋 서바이벌"
  await H.waitFor("document.querySelector('[data-gb-belt]') !== null", 8000);
  const lob = await J(H, "({ belt: document.querySelector('[data-gb-belt]')?.dataset.gbBelt, label: document.querySelector('[data-gb-belt]')?.innerText ?? '', small: document.querySelector('[data-gb-solo] small')?.innerText ?? '' })");
  record('★★ R118 로비 — 띠 없음 아이콘(회색 · 랭크 바 없음) · [혼자 하기] "목숨 셋 서바이벌"', lob.belt === 'none' && lob.label.includes('띠 없음') && lob.small === '목숨 셋 서바이벌', JSON.stringify(lob));
  for (const [w, h, n] of [[360, 740, 'm360'], [390, 844, 'm390']]) {
    await mobile(H, w, h);
    await shoot(H, `r118-01-lobby-nobelt-${n}`);
  }

  // [2] 시작 화면
  await mobile(H, 360, 740);
  await realClick(H, '[data-gb-solo]');
  await waitSel(H, '[data-solo="start"]');
  await H.waitFor("document.querySelector('[data-solo-belt]') !== null", 5000);
  const st = await J(H, "({ rules: document.querySelectorAll('.solo-rules p').length, go: document.querySelector('[data-solo-start]') !== null, belt: document.querySelector('[data-solo-belt]')?.dataset.soloBelt, sub: document.querySelector('[data-solo-belt] small')?.innerText ?? '' })");
  record('★★ R118 시작 — 규칙 세 줄 · [시작] · 띠(없음 · "한 판이면 화이트벨트")', st.rules === 3 && st.go && st.belt === 'none' && st.sub.includes('화이트벨트'), JSON.stringify(st));
  await shoot(H, 'r118-02-start-m360');
  await pc(H);
  await shoot(H, 'r118-02-start-pc', ['pastel']);
  await mobile(H, 360, 740);

  // [3] 진행 — 안 A
  await realClick(H, '[data-solo-start]');
  await H.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 10000);
  await sleep(300);
  const play = await J(H, "({ lives: document.querySelector('[data-lives]')?.dataset.lives, count: document.querySelector('[data-solo-correct]')?.innerText, timer: document.querySelector('.solo-q .q-timer')?.innerText ?? '', bar: document.querySelector('.solo-q .q-timebar') !== null, grade: [...document.querySelectorAll('.solo-q .badge')].map((b) => b.innerText).join('|'), pill: document.querySelector('.solo-q .grade-pill')?.dataset.grade ?? null, input: document.activeElement?.matches('[data-solo-input]') ?? false, noCopy: document.querySelector('.solo-q .no-copy, .solo-q .q-text') !== null })");
  record('★★ R118 진행(안 A) — 목숨 3 · 맞힌 0 · 남은 초 · 시간 막대 · 등급 1(★ R125 C1 점 다섯 알약) · 입력칸 포커스', play.lives === '3' && play.count === '0' && /초$/.test(play.timer) && play.bar && play.pill === '1' && play.input, JSON.stringify(play));
  const copyBlocked = await ev(H, "getComputedStyle(document.querySelector('.solo-q .q-text')).userSelect");
  record('★ R118 진행 — 문제 글 복사 막기(user-select none)', copyBlocked === 'none', copyBlocked);
  await shoot(H, 'r118-03-play-m360');
  // 키보드가 올라온 높이(약 260px) — 목숨 · 맞힌 개수 · 문제 · 시간 · 입력칸이 다 보이나
  for (const [w, h, n] of [[360, 480, 'm360kb'], [390, 584, 'm390kb']]) {
    await mobile(H, w, h);
    await sleep(300);
    const fit = await J(H, "(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); const els = { lives: r('[data-lives]'), count: r('[data-solo-correct]'), timer: r('.solo-q .q-timer'), bar: r('.solo-q .q-timebar'), text: r('.solo-q .q-text'), input: r('[data-solo-input]') }; const out = Object.entries(els).filter(([, b]) => !b || b.top < -1 || b.bottom > innerHeight + 1).map(([k]) => k); return { out, inputBottom: Math.round(els.input?.bottom ?? -1), h: innerHeight }; })()");
    record(`★★★ R118 진행 — 키보드 올라온 높이 ${w}×${h}: 목숨 · 맞힌 개수 · 시간 · 막대 · 문제 · 입력칸이 다 보인다`, fit.out.length === 0, JSON.stringify(fit));
    await snap(H, `r118-04-play-${n}-pastel`);
  }
  await mobile(H, 360, 740);
  await sleep(200);

  // 틀린 답 — 공개 없음 · 입력칸 비움 · ★ R123 "친 답" 줄은 없앰(흔들림 · 부저는 --r123 이 본다)
  await realType(H, '[data-solo-input]', '아무말대잔치');
  await enter(H);
  await sleep(400);
  const wrong = await J(H, "({ reveal: document.querySelector('[data-solo-reveal]') !== null, tried: document.querySelector('.solo-tried') !== null, val: document.querySelector('[data-solo-input]')?.value ?? '' })");
  record('★★ R118 틀린 답 — 공개 없음 · 입력칸 비움 · ★ R123 "친 답" 줄 없음', !wrong.reveal && !wrong.tried && wrong.val === '', JSON.stringify(wrong));
  await snap(H, 'r118-05-wrong-m360-pastel');
  // 맞힘
  const a1 = await answerOf(H);
  await realType(H, '[data-solo-input]', a1);
  await enter(H);
  await H.waitFor("document.querySelector('[data-solo-reveal]')?.dataset.soloReveal === 'ok'", 4000);
  const ok1 = await J(H, "({ count: document.querySelector('[data-solo-correct]')?.innerText, ans: document.querySelector('[data-solo-reveal] b')?.innerText ?? '', timer: document.querySelector('.solo-verdict')?.innerText ?? '' })");
  record('★★ R118 맞힘 — 정답 공개(초록) · ★ R123 크게 "정답!" · 맞힌 개수 1', ok1.count === '1' && ok1.ans.length > 0 && ok1.timer === '정답!', JSON.stringify(ok1));
  await shoot(H, 'r118-06-correct-m360');
  // 다음 문제(0.8초 뒤) · 입력칸 포커스 그대로(키보드 안 내려감)
  await waitNextQ(H, 1, 5000);
  const keep = await ev(H, "document.activeElement?.matches('[data-solo-input]') ?? false");
  record('★ R118 다음 문제 — 입력칸 포커스 그대로(휴대폰 키보드가 내려가지 않게)', keep, '');
  // 새로 고침 → 같은 판을 이어받는다(4-7)
  const nBefore = await qn(H);
  await H.goto(`${BASE}/`);
  await H.waitFor("document.querySelector('[data-solo=\"play\"]') !== null", 10000);
  await H.waitFor(`Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) >= ${nBefore}`, 10000);
  const nAfter = await qn(H);
  record('★★ R118 새로 고침 — 같은 판을 이어받는다(같은 문제 번호 · 맞힌 개수 그대로)', nAfter >= nBefore && (await ev(H, "document.querySelector('[data-solo-correct]')?.innerText")) === '1', JSON.stringify({ nBefore, nAfter }));
  // 시간 끝(그대로 둔다)
  const cur = await qn(H);
  await H.waitFor(`document.querySelector('[data-solo-reveal]') !== null && Number(document.querySelector('[data-solo-q]')?.dataset.soloQ) === ${cur}`, 20000);
  const to = await J(H, "({ reveal: document.querySelector('[data-solo-reveal]')?.dataset.soloReveal, lives: document.querySelector('[data-lives]')?.dataset.lives, timer: document.querySelector('.solo-verdict')?.innerText ?? '', miss: document.querySelector('.solo-q')?.classList.contains('miss') })");
  record('★★ R118 시간 끝 — 정답 보여 줌(빨강) · "시간 끝" · 목숨 2', to.reveal === 'timeout' && to.lives === '2' && to.timer === '시간 끝' && to.miss, JSON.stringify(to));
  await shoot(H, 'r118-07-timeout-m360');
  // 나감(창이 초점을 잃음) → 그 문제 실패
  await waitNextQ(H, cur, 5000);
  const cur2 = await qn(H);
  await ev(H, "window.dispatchEvent(new Event('blur'))");
  await H.waitFor(`document.querySelector('[data-solo-reveal]')?.dataset.soloReveal === 'away'`, 4000);
  record('★★ R118 나감(창 초점 잃음) → 그 문제 실패 · "화면을 벗어남" · 목숨 1', (await ev(H, "document.querySelector('[data-lives]')?.dataset.lives")) === '1', String(cur2));
  await snap(H, 'r118-08-away-m360-pastel');
  // 마지막 목숨 — 시간 끝 → (★ R123 해설 뒤 Enter) 끝 화면 + 띠 받는 순간(첫 띠)
  await waitNextQ(H, cur2, 5000);
  await H.waitFor("document.querySelector('[data-solo-reveal]') !== null", 20000);
  await sleep(300);
  await H.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
  await H.waitFor("document.querySelector('[data-solo=\"end\"]') !== null", 20000);
  await H.waitFor("document.querySelector('[data-solo-promo]') !== null", 3000).catch(() => false);
  const promo = await J(H, "({ on: document.querySelector('[data-solo-promo]') !== null, text: document.querySelector('[data-solo-promo]')?.innerText ?? '', snd: (window.__qwSoundLog ?? []).some((x) => x.id === 'mg-final') })");
  record('★★★ R118 띠 받는 순간 — 끝 화면 위 그림 · "화이트벨트(★ R123 I)" · "첫 띠를 받았어요" · +10P · 소리 하나', promo.on && promo.text.includes('화이트벨트') && promo.text.includes('첫 띠') && promo.text.includes('+10P') && promo.snd, JSON.stringify(promo));
  await shoot(H, 'r118-09-promo-m360');
  await H.waitFor("document.querySelector('[data-solo-promo]') === null", 5000);
  const end = await J(H, "({ score: document.querySelector('[data-solo-score]')?.dataset.soloScore, wq: document.querySelectorAll('[data-wq]').length, wqAns: [...document.querySelectorAll('[data-wq] b')].every((b) => b.innerText.trim().length > 0), belt: document.querySelector('.solo-result [data-solo-belt]')?.dataset.soloBelt, sub: document.querySelector('.solo-result [data-solo-belt] small')?.innerText ?? '', again: document.querySelector('[data-solo-again]') !== null, lobby: document.querySelector('[data-solo-lobby]') !== null })");
  record('★★ R118 끝 화면 — 기록 1 · 틀린 세 문제의 정답 · 띠(칸 0) · ★ R123 "다음 단계까지 2문제" · [다시] · [로비]', end.score === '1' && end.wq === 3 && end.wqAns && end.belt === '0' && end.sub.includes('다음 단계까지 2문제') && end.again && end.lobby, JSON.stringify(end));
  await shoot(H, 'r118-10-end-m360');
  await mobile(H, 390, 844);
  await shoot(H, 'r118-10-end-m390', ['pastel']);
  await pc(H);
  await shoot(H, 'r118-10-end-pc', ['pastel']);
  const pcScroll = await ev(H, 'document.documentElement.scrollWidth > innerWidth + 1');
  record('★ R118 끝 화면 PC — 가로 넘침 없음', !pcScroll, '');

  // [4] [다시] — PC 에서 3개 맞히고 [그만하기] → 단계가 오른다(화이트 I · +5P)
  await realClick(H, '[data-solo-again]');
  await H.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 10000);
  await sleep(300);
  await shoot(H, 'r118-11-play-pc');
  const pcFit = await J(H, "({ v: document.documentElement.scrollHeight > innerHeight + 1, input: Math.round(document.querySelector('[data-solo-input]').getBoundingClientRect().bottom), h: innerHeight })");
  record('★ R118 진행 PC 1280×720 — 세로 스크롤 없음 · 입력칸 화면 안', !pcFit.v && pcFit.input <= pcFit.h, JSON.stringify(pcFit));
  for (let i = 1; i <= 3; i += 1) {
    const a = await answerOf(H);
    await realType(H, '[data-solo-input]', a);
    await enter(H);
    await H.waitFor("document.querySelector('[data-solo-reveal]')?.dataset.soloReveal === 'ok'", 4000);
    if (i < 3) await waitNextQ(H, i, 5000);
  }
  await waitNextQ(H, 3, 5000);
  await realClick(H, '.solo-quit');
  await waitSel(H, '.confirm-modal[data-kind="solo-quit"]');
  await snap(H, 'r118-12-quit-pc-pastel');
  await H.evaluate("document.querySelector('.confirm-modal[data-kind=\"solo-quit\"] .confirm-actions button')?.click()");
  await H.waitFor("document.querySelector('[data-solo=\"end\"]') !== null", 8000);
  await H.waitFor("document.querySelector('[data-solo-promo]') !== null", 3000).catch(() => false);
  const p2 = await ev(H, "document.querySelector('[data-solo-promo]')?.innerText ?? ''");
  record('★★ R118 그만하기 → 끝 · 단계가 오른다(★ R123 화이트벨트 II · "단계가 올랐어요" · +5P)', p2.includes('화이트벨트 II') && p2.includes('단계가 올랐어요') && p2.includes('+5P'), p2.replace(/\n/g, ' '));
  await shoot(H, 'r118-13-promo-pc');
  await H.waitFor("document.querySelector('[data-solo-promo]') === null", 5000);
  const e2 = await J(H, "({ score: document.querySelector('[data-solo-score]')?.dataset.soloScore, newbest: document.querySelector('.solo-newbest') !== null })");
  record('★ R118 끝 — 기록 3 · 새 기록!', e2.score === '3' && e2.newbest, JSON.stringify(e2));

  // [5] [로비] → 띠 줄(화이트벨트 I · 최고 3) · [혼자 하기] 아래 "최고 3"
  await realClick(H, '[data-solo-lobby]');
  await H.waitFor("document.querySelector('[data-gb-belt=\"1\"]') !== null", 6000);
  const lob2 = await J(H, "({ label: document.querySelector('[data-gb-belt]')?.innerText ?? '', small: document.querySelector('[data-gb-solo] small')?.innerText ?? '', w: Math.round(document.querySelector('[data-gb-belt] .belt-ic')?.getBoundingClientRect().width ?? 0) })");
  record('★★ R118 로비 — 띠 줄 "화이트벨트 II(★ R123) · 최고 3" · [혼자 하기] 아래 "최고 3" · PC 띠 20px 이상', lob2.label.includes('화이트벨트 II') && lob2.label.includes('최고 3') && lob2.small === '최고 3' && lob2.w >= 20, JSON.stringify(lob2));
  await shoot(H, 'r118-14-lobby-belt-pc');
  await mobile(H, 360, 740);
  await shoot(H, 'r118-14-lobby-belt-m360');

  // [6] 방 안 띠 — 봇 방에 코드로 들어간다(☰ → 방 코드)
  const host = await bot('shost', '띠없는방장');
  host.emit('room.create', { title: '띠 보기 방' });
  await sleep(900);
  const code = host.snap?.room?.code;
  await realClick(H, '#gb-menu-btn');
  await waitSel(H, '[data-gb-menu-pop]');
  await realClick(H, '[data-menu="code"]');
  await waitSel(H, '#join-code');
  await realType(H, '#join-code', code);
  await H.waitFor("location.pathname.startsWith('/r/') && document.querySelector('.stage') !== null", 10000);
  await sleep(800);
  // 휴대폰 — 참여자 창
  await realClick(H, '.people-btn');
  await waitSel(H, '.people-list');
  await sleep(300);
  const ppl = await J(H, "[...document.querySelectorAll('.people-list li')].map((li) => ({ nick: li.querySelector('.nick')?.textContent?.trim(), belt: li.querySelector('[data-belt]')?.dataset.belt ?? null, deg: li.querySelector('[data-belt]')?.dataset.degree ?? null, w: Math.round(li.querySelector('.belt-ic')?.getBoundingClientRect().width ?? 0) }))");
  const meRow = ppl.find((p) => p.belt === 'white');
  const hostRow = ppl.find((p) => p.belt === 'none');
  record('★★ R118 방 안(휴대폰 참여자 창) — 내 띠 화이트 I · 방장 = 띠 없음 · 24~28px', meRow && meRow.deg === '1' && hostRow && meRow.w >= 24 && meRow.w <= 28, JSON.stringify(ppl));
  await shoot(H, 'r118-15-room-people-m360');
  await H.key('Escape');
  await sleep(300);
  // PC — 자리 카드
  await pc(H);
  await sleep(500);
  const seats = await J(H, "[...document.querySelectorAll('.seat-card:not(.empty)')].map((c) => ({ belt: c.querySelector('[data-belt]')?.dataset.belt ?? null, w: Math.round(c.querySelector('.belt-ic')?.getBoundingClientRect().width ?? 0) }))");
  record('★★ R118 방 안(PC 자리) — 띠 둘(화이트 · 없음) · 20px 이상', seats.some((s) => s.belt === 'white' && s.w >= 20) && seats.some((s) => s.belt === 'none'), JSON.stringify(seats));
  await shoot(H, 'r118-16-room-pc');
  // 사람 카드 — 내 자리 누르기
  const myPid = await ev(H, "[...document.querySelectorAll('.seat-card:not(.empty)')].find((c) => c.querySelector('[data-belt=\"white\"]'))?.querySelector('[data-person]')?.dataset.person ?? ''");
  await realClick(H, `.seat-card [data-person="${myPid}"]`);
  await H.waitFor("document.querySelector('[data-person-belt]') !== null", 6000).catch(() => false);
  const pcard = await J(H, "({ belt: document.querySelector('[data-person-belt]')?.dataset.personBelt ?? null, text: document.querySelector('[data-person-belt]')?.innerText ?? '', w: Math.round(document.querySelector('[data-person-belt] .belt-ic')?.getBoundingClientRect().width ?? 0) })");
  record('★★ R118 사람 카드 — 띠 크게(64px) · "화이트벨트 II"(★ R123) · 최고 3 · 받은 날', pcard.belt === '1' && pcard.text.includes('화이트벨트 II') && pcard.text.includes('최고 3') && pcard.w >= 64, JSON.stringify(pcard));
  await shoot(H, 'r118-17-person-card-pc');
  await H.key('Escape');
  await sleep(300);

  // [7] 견준 값 표 — 새 부품 ↔ 기존 부품(같은 앱인가)
  const M = (sels) => `(() => { const m = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { sel, font: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, h: Math.round(r.height), radius: cs.borderRadius, pad: cs.padding }; }; return ${JSON.stringify(sels)}.map(m).filter(Boolean); })()`;
  await mobile(H, 390, 844);
  const roomVals = await J(H, M(['.chat-input-row input', '.chat-input-row .send-btn', '.card']));
  // 방을 나와 혼자 하기 진행 화면
  await H.evaluate("document.querySelector('button[aria-label=\"나가기\"]')?.click()");
  await sleep(300);
  await H.evaluate("document.querySelector('.confirm-modal .confirm-actions button')?.click()");
  await H.waitFor("document.querySelector('[data-gb-solo]') !== null", 8000);
  const lobVals = await J(H, M(['[data-gb-together]']));
  await realClick(H, '[data-gb-solo]');
  await waitSel(H, '[data-solo-start]');
  const startVals = await J(H, M(['[data-solo-start]', '.solo-rules', '.solo-belt']));
  await realClick(H, '[data-solo-start]');
  await H.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 10000);
  const playVals = await J(H, M(['[data-solo-input]', '.solo-input .send-btn', '.solo-q', '.solo-q .q-timer', '.solo-q .q-text']));
  writeFileSync(path.join(SHOT_ROOT, 'r118-compare.json'), JSON.stringify({ room: roomVals, lobby: lobVals, start: startVals, play: playVals }, null, 2));
  const inSolo = playVals.find((v) => v.sel === '[data-solo-input]');
  const inRoom = roomVals.find((v) => v.sel === '.chat-input-row input');
  record('★ R118 견준 값 — 혼자 하기 입력칸 = 방 채팅 입력칸(글자 · 높이 · 둥근 정도)', inSolo && inRoom && inSolo.font === inRoom.font && inSolo.radius === inRoom.radius && Math.abs(inSolo.h - inRoom.h) <= 2, JSON.stringify({ inSolo, inRoom }));
  const goBtn = startVals.find((v) => v.sel === '[data-solo-start]');
  const together = lobVals[0];
  record('★ R118 견준 값 — [시작] = 로비 [같이 하기]와 같은 big-btn 글자 · 굵기', goBtn && together && goBtn.font === together.font && goBtn.weight === together.weight, JSON.stringify({ goBtn, together }));
  // 밤 테마 진행(나란히 볼 그림)
  await shoot(H, 'r118-18-play-m390');
  await realClick(H, '.solo-quit');
  await waitSel(H, '.confirm-modal[data-kind="solo-quit"]');
  await H.evaluate("document.querySelector('.confirm-modal[data-kind=\"solo-quit\"] .confirm-actions button')?.click()");
  await H.waitFor("document.querySelector('[data-solo=\"end\"]') !== null", 8000);

  for (const s of bots) s.disconnect();
  H.close();
}
