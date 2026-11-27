// =============================================================================
// ★★★ R124 — 혼자 하기 반응 속도 · 시작 카운트다운 · 끝 화면 틀린 문제 전부(`node scripts/ui-check.mjs --r124` · SHOT_DIR=r124)
//   서버 스위치: GONGBANG=1 SOLO=1 BELT=1 SOLO_TEST_TIME_MS=60000(문제 시간을 길게 — 한 문제에서 여러 번 잰다)
//   잰 것(브라우저 안 performance.now — 화면 반영까지):
//     · [시작] 누름(pointerdown) → 카운트다운이 화면에 생김 · 3 · 2 · 1 → 첫 문제
//     · 틀린 답 Enter(keydown) → 입력칸 흔들림(class input-shake) — 새 길(화면 미리 보기) · 옛 길(서버 solo.wrong 을 기다림 · localStorage qw.solo.noProbe=1)
//       ★ CDP Network.emulateNetworkConditions 의 지연은 웹소켓 프레임에 걸리지 않는다(2026-11-28 실측: 지연 300 에서도 옛 길 26ms) —
//         바깥 주소의 왕복은 소켓 재기(tmp/r124/rtt2.mjs · 보고 1-3 표)로 따로 잰다
//     · 맞힌 답 Enter → "정답!" 이 화면에 생김
//   사진: 카운트다운 3 · 2 · 1 → 첫 문제 · 오답 흔들림(PC 1280 · 모바일 360) · 끝 화면 틀린 문제 = 가장 긴 질문 셋(PC · 360)
// =============================================================================

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/** 혼자 하기 풀의 가장 긴 질문 셋(실 DB · dev DB 중 더 긴 것 · 읽기만) — 풀 규칙: 활성 · 분야 있음 · 알가치 1 아님 · 정답 6글자 이하 · 이모지 아님 */
async function longestSolo() {
  const sh = await import(new URL('../shared/dist/index.js', import.meta.url).href);
  const rows = [];
  for (const db of ['quizweb', 'quizweb_dev']) {
    const c = new pg.Client({ connectionString: `postgresql://quiz:quizlocal@localhost:5434/${db}` });
    try {
      await c.connect();
      const r = await c.query(`SELECT q.id::text, q.question_text AS text, q.display_answer AS answer, q.explanation, q.worth FROM questions q
          WHERE q.is_active AND EXISTS (SELECT 1 FROM category_game_topics g WHERE g.category_id = q.category_id) AND coalesce(q.worth, 2) <> 1
          ORDER BY char_length(q.question_text) DESC LIMIT 60`);
      for (const x of r.rows) if (sh.soloAnswerFits(x.answer) && !sh.isEmojiQuestion(x.text)) rows.push({ db, ...x });
    } catch (e) {
      console.log('[R124] 가장 긴 질문 읽기 실패', db, e.message);
    } finally {
      await c.end().catch(() => {});
    }
  }
  rows.sort((a, b) => b.text.length + (b.explanation ?? '').length - (a.text.length + (a.explanation ?? '').length));
  return { worst: rows.slice(0, 3), live: rows.filter((x) => x.db === 'quizweb').slice(0, 3) };
}

const stat = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return { n: s.length, median: s.length ? +s[s.length >> 1].toFixed(1) : null, max: s.length ? +s.at(-1).toFixed(1) : null };
};

export async function r124Flow(ctx) {
  const { browser, BASE, ROOT, sleep, snap, record, realClick, realType, signUp, newPage, touchDevice, withPg } = ctx;
  const sets = await longestSolo();
  const longest = sets.worst;
  console.log('[R124] 실 DB 가장 긴 셋:', sets.live.map((x) => `#${x.id} 질문 ${x.text.length}자 · 해설 ${(x.explanation ?? '').length}자`).join(' / '));
  console.log('[R124] 두 DB 가장 긴 셋:', longest.map((x) => `${x.db}#${x.id} 질문 ${x.text.length}자 · 해설 ${(x.explanation ?? '').length}자`).join(' / '));
  const site = await (await fetch(`${BASE}/api/site`)).json();
  if (!site.gongbang || !site.solo) {
    record('★ R124 — 서버 스위치 GONGBANG=1 SOLO=1 BELT=1 로 돌려야 한다', false, JSON.stringify(site));
    return;
  }
  const J = async (page, js) => JSON.parse(await page.evaluate(`JSON.stringify(${js})`));
  const qn = (page) => page.evaluate("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0)");
  const fit = async (page) => J(page, "({ doc: document.scrollingElement.scrollHeight <= innerHeight + 1, sh: document.scrollingElement.scrollHeight, ih: innerHeight })");
  const answerOf = async (page) => {
    const text = await page.evaluate("document.querySelector('[data-solo] .q-text')?.dataset.text ?? ''");
    return withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '');
  };
  // 페이지 안 시계: keydown(입력칸 Enter) · 흔들림 · 공개가 생긴 때
  const arm = (page) =>
    page.evaluate(`(() => {
      window.__t = { key: null, shake: null, reveal: null, cd: null, down: null };
      const inp = document.querySelector('[data-solo-input]');
      if (inp && !inp.__armed) {
        inp.__armed = true;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.__t.key = performance.now(); }, true);
        new MutationObserver(() => { if (inp.classList.contains('input-shake') && window.__t.shake === null) window.__t.shake = performance.now(); }).observe(inp, { attributes: true });
      }
      if (!window.__bodyObs) {
        window.__bodyObs = new MutationObserver(() => {
          if (window.__t.reveal === null && document.querySelector('[data-solo-reveal="ok"]')) window.__t.reveal = performance.now();
          if (window.__t.cd === null && document.querySelector('[data-solo-countdown]')) window.__t.cd = performance.now();
        });
        window.__bodyObs.observe(document.body, { childList: true, subtree: true, attributes: true });
        document.addEventListener('pointerdown', () => { window.__t.down = performance.now(); }, true);
      }
      return true;
    })()`);

  const S = await newPage(browser, 'r124-solo', true);
  await touchDevice(S, 360, 740, true);
  await signUp(S, 'r124s', '빠른도장');
  await S.waitFor("document.querySelector('[data-gb-solo]') !== null", 8000);
  await realClick(S, '[data-gb-solo]');
  await S.waitFor("document.querySelector('[data-solo-start]') !== null", 8000);
  await sleep(500);

  // ── 2. 시작 카운트다운(모바일 360)
  await arm(S);
  await realClick(S, '[data-solo-start]');
  await S.waitFor("document.querySelector('[data-solo-countdown]') !== null", 3000).catch(() => false);
  const cd = await J(S, "({ down: window.__t.down, cd: window.__t.cd, sec: document.querySelector('[data-solo-countdown]')?.dataset.soloCountdown ?? null, startScreen: document.querySelector('[data-solo=\"start\"]') !== null })");
  const cdMs = cd.down !== null && cd.cd !== null ? cd.cd - cd.down : null;
  record('★★ R124 2 — [시작] 누름 → 곧바로 카운트다운(100ms 안 · 시작 화면은 사라짐)', cdMs !== null && cdMs < 100 && !cd.startScreen, JSON.stringify({ ...cd, cdMs }));
  const shotSecs = [];
  for (const sec of ['3', '2', '1']) {
    const ok = await S.waitFor(`document.querySelector('[data-solo-countdown]')?.dataset.soloCountdown === '${sec}'`, 2500).catch(() => false);
    if (ok) {
      shotSecs.push(sec);
      await snap(S, `r124-countdown-${sec}-m360-pastel`);
    }
  }
  record('★★ R124 2 — 카운트다운 3 · 2 · 1 이 차례로 보인다', shotSecs.join('') === '321', shotSecs.join(','));
  await S.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 4000);
  const first = await J(S, "({ sec: document.querySelector('.q-timer')?.innerText ?? '', snd: (window.__qwSoundLog ?? []).filter((x) => x.id === 'tick').length })");
  record('★★ R124 2 — 첫 문제 시간은 처음부터(60초 문제 → 60초) · 카운트다운 소리 tick', /^(60|59)초$/.test(first.sec) && first.snd >= 2, JSON.stringify(first));
  await snap(S, 'r124-first-question-m360-pastel');

  // ── 1. 틀린 답 → 흔들림(화면 반영까지)
  const wrongRun = async (label, n) => {
    const v = [];
    for (let i = 0; i < n; i++) {
      await realType(S, '[data-solo-input]', `봇틀린답${label.length}${i}zz`);
      await arm(S);
      await S.key('Enter');
      await S.waitFor('window.__t.shake !== null', 3000).catch(() => false);
      const t = await J(S, 'window.__t');
      if (t.shake !== null && t.key !== null) v.push(t.shake - t.key);
      await sleep(420);
    }
    return v;
  };
  const table = {};
  table['틀림 · 새 길(미리 보기) · 지연 0'] = stat(await wrongRun('a', 20));
  await snap(S, 'r124-wrong-shake-m360-pastel');
  await S.evaluate("localStorage.setItem('qw.solo.noProbe', '1')");
  table['틀림 · 옛 길(서버 기다림) · 지연 0'] = stat(await wrongRun('bb', 20));
  await S.evaluate("localStorage.removeItem('qw.solo.noProbe')");
  const nw = table['틀림 · 새 길(미리 보기) · 지연 0'];
  record('★★ R124 1 — 틀린 답 Enter → 흔들림 100ms 안(20번 모두)', nw.n === 20 && nw.max < 100, JSON.stringify(nw));

  // 맞힌 답 → "정답!"(지연 0 · 다섯 문제) — 해설은 Enter 로 넘김
  const okv = [];
  for (let k = 0; k < 5; k++) {
    const n0 = await qn(S);
    const ans = await answerOf(S);
    await realType(S, '[data-solo-input]', ans);
    await arm(S);
    await S.key('Enter');
    await S.waitFor('window.__t.reveal !== null', 3000).catch(() => false);
    const t = await J(S, 'window.__t');
    if (t.reveal !== null && t.key !== null) okv.push(t.reveal - t.key);
    await sleep(300);
    await S.key('Enter');
    await S.waitFor(`Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) > ${n0} && document.querySelector('[data-solo-reveal]') === null`, 8000);
    await sleep(200);
  }
  table['맞힘 → 정답! · 지연 0'] = stat(okv);
  record('★★ R124 1 — 맞힌 답 Enter → "정답!" 100ms 안(지연 0 · 다섯 번)', okv.length === 5 && Math.max(...okv) < 100, JSON.stringify(table['맞힘 → 정답! · 지연 0']));

  // ── 3-2. 끝 화면 — 세 문제를 "화면 벗어남"으로 잃는다(blur) → 끝 → 가장 긴 질문 셋으로 바꿔 넣고 사진
  for (let k = 0; k < 3; k++) {
    const n0 = await qn(S);
    await S.evaluate("window.dispatchEvent(new Event('blur'))");
    await S.waitFor("document.querySelector('[data-solo-reveal]') !== null", 4000).catch(() => false);
    await sleep(300);
    await S.key('Enter');
    if (k < 2) await S.waitFor(`Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) > ${n0} && document.querySelector('[data-solo-reveal]') === null`, 8000);
  }
  await S.waitFor("document.querySelector('[data-solo=\"end\"]') !== null", 15000);
  await sleep(2900); // 띠 받는 그림이 지나가게
  await S.evaluate("document.querySelector('[data-solo-promo]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  const natural = await J(S, "[...document.querySelectorAll('.solo-wq-text')].map((p) => ({ ell: getComputedStyle(p).textOverflow === 'ellipsis' && p.scrollWidth > p.clientWidth + 1, lines: Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight || '20')) }))");
  record('★★ R124 3-2 — 끝 화면 틀린 문제 셋 · 말줄임 없음', natural.length === 3 && natural.every((x) => !x.ell), JSON.stringify(natural));
  const fill = (rows) =>
    S.evaluate(`(() => {
      const rows = ${JSON.stringify(rows)};
      const els = [...document.querySelectorAll('.solo-wq')];
      els.forEach((el, i) => {
        const r = rows[i]; if (!r) return;
        el.querySelector('.solo-wq-text').textContent = r.text;
        el.querySelector('.solo-wq-ans b').textContent = r.answer;
        let ex = el.querySelector('.solo-wq-expl');
        if (r.explanation) { if (!ex) { ex = document.createElement('p'); ex.className = 'solo-wq-expl dim'; el.appendChild(ex); } ex.textContent = r.explanation; } else ex?.remove();
      });
      return els.length;
    })()`);
  const sizes = [
    { w: 360, h: 740, n: 'm360', m: true },
    { w: 390, h: 844, n: 'm390', m: true },
    { w: 1280, h: 720, n: 'pc1280', m: false },
    { w: 1536, h: 864, n: 'pc1536', m: false },
  ];
  const endRows = [];
  for (const [setName, rows] of [['live', sets.live], ['worst', longest]]) {
  await fill(rows);
  for (const s of sizes) {
    await touchDevice(S, s.w, s.h, s.m);
    if (!s.m) await S.setViewport(s.w, s.h);
    await sleep(400);
    const f = await fit(S);
    const w = await J(S, "(() => { const c = document.querySelector('[data-solo-wrongs]'); const a = document.querySelector('[data-solo-again]').getBoundingClientRect(); return { inner: c.scrollHeight <= c.clientHeight + 1, sh: c.scrollHeight, ch: c.clientHeight, btnIn: a.bottom <= innerHeight, qfs: parseFloat(getComputedStyle(document.querySelector('.solo-wq-text')).fontSize) }; })()");
    endRows.push({ set: setName, size: s.n, docH: f.sh, ih: f.ih, doc: f.doc, ...w });
    record(`★★ R124 3-2 끝 화면 ${setName === 'live' ? '실 DB' : '두 DB'} ${s.w}×${s.h} — 가장 긴 질문 셋 · 정답 · 해설(말줄임 없음) · 문서 스크롤 없음 · [로비] · [다시] 화면 안`, f.doc && w.btnIn, JSON.stringify({ docH: f.sh, ih: f.ih, ...w }));
    if (setName === 'live') record(`★★ R124 3-2 실 DB 가장 긴 셋 ${s.w}×${s.h} — 틀린 문제 칸 안 스크롤 없이 다 보임`, w.inner, JSON.stringify({ sh: w.sh, ch: w.ch }));
    if (!w.inner) console.log(`  [R124] ${setName} ${s.n}:`);
    if (!w.inner) console.log(`  [R124] ${s.n}: 가장 긴 셋은 틀린 문제 칸 안에서 내려 본다(칸 ${w.ch}px · 글 ${w.sh}px)`);
    await snap(S, `r124-end-longest-${setName}-${s.n}-pastel`);
  }
  }

  // ── PC 1280 — [다시](아이템 없음 → 곧바로) → 카운트다운 · 첫 문제 · 오답 흔들림
  await touchDevice(S, 1280, 720, false);
  await S.setViewport(1280, 720);
  await sleep(400);
  await arm(S);
  await realClick(S, '[data-solo-again]');
  await S.waitFor("document.querySelector('[data-solo-countdown]') !== null", 3000).catch(() => false);
  const cd2 = await J(S, '({ down: window.__t.down, cd: window.__t.cd })');
  const cd2Ms = cd2.down !== null && cd2.cd !== null ? cd2.cd - cd2.down : null;
  record('★★ R124 2 — [다시] 누름 → 곧바로 카운트다운(PC · 100ms 안)', cd2Ms !== null && cd2Ms < 100, JSON.stringify({ cd2Ms }));
  for (const sec of ['3', '2', '1']) {
    if (await S.waitFor(`document.querySelector('[data-solo-countdown]')?.dataset.soloCountdown === '${sec}'`, 2500).catch(() => false)) await snap(S, `r124-countdown-${sec}-pc1280-pastel`);
  }
  await S.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 4000);
  await snap(S, 'r124-first-question-pc1280-pastel');
  await realType(S, '[data-solo-input]', '봇틀린답피씨');
  await arm(S);
  await S.key('Enter');
  await S.waitFor('window.__t.shake !== null', 3000).catch(() => false);
  await snap(S, 'r124-wrong-shake-pc1280-pastel');
  const pcw = await J(S, 'window.__t');
  table['틀림 · 새 길 · PC 1280 · 한 번'] = stat(pcw.shake !== null ? [pcw.shake - pcw.key] : []);
  table['[시작] → 카운트다운 보임'] = stat([cdMs, cd2Ms].filter((x) => x !== null));

  const out = { table, endRows };
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r124', 'r124-timing.json'), JSON.stringify(out, null, 1));
  console.log('\n[R124] 잰 값(ms · 브라우저 안 · 화면 반영까지)');
  for (const [k, v] of Object.entries(table)) console.log(`  ${k.padEnd(34)} n=${v.n} 중간 ${v.median} 최대 ${v.max}`);
}
