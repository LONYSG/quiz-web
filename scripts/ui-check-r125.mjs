// =============================================================================
// ★★★ R125 — `node scripts/ui-check.mjs --r125` · SHOT_DIR=r125
//   A. 맞힌 답도 바로 "정답!"(정답 지문) — 서버 스위치: GONGBANG=1 SOLO=1 BELT=1 SOLO_TEST_TIME_MS=60000 SOLO_TEST_LAG_MS=600
//      (판정 답을 600ms 늦게 — 바깥 주소 왕복 흉내 · CDP 지연은 웹소켓에 안 걸린다)
//      · 맞힌 답 Enter → "정답!" · 해설이 서버를 안 기다리고 100ms 안 · 옛 길(qw.solo.noSure=1)은 ≈ 600ms
//      · 틀린 답 Enter → 흔들림 100ms 안(지문 하나로 · probe 없음)
//      · 뒤에 온 서버 solo.result 에 소리 · 연출이 두 번 나지 않는다(정답 소리 1번)
// =============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const stat = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return { n: s.length, median: s.length ? +s[s.length >> 1].toFixed(1) : null, max: s.length ? +s.at(-1).toFixed(1) : null };
};

export async function r125SoloFlow(ctx) {
  const { browser, BASE, ROOT, sleep, snap, record, realClick, realType, signUp, newPage, touchDevice, withPg } = ctx;
  const site = await (await fetch(`${BASE}/api/site`)).json();
  if (!site.gongbang || !site.solo) {
    record('★ R125 — 서버 스위치 GONGBANG=1 SOLO=1 BELT=1 로 돌려야 한다', false, JSON.stringify(site));
    return {};
  }
  const J = async (page, js) => JSON.parse(await page.evaluate(`JSON.stringify(${js})`));
  const qn = (page) => page.evaluate("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0)");
  const answerOf = async (page) => {
    const text = await page.evaluate("document.querySelector('[data-solo] .q-text')?.dataset.text ?? ''");
    return withPg(async (c) => (await c.query(`SELECT qa.answer_text FROM question_answers qa JOIN questions q ON q.id = qa.question_id WHERE q.question_text = $1 ORDER BY qa.is_primary DESC, qa.id LIMIT 1`, [text])).rows[0]?.answer_text ?? '');
  };
  const hasExpl = async (page) => {
    const text = await page.evaluate("document.querySelector('[data-solo] .q-text')?.dataset.text ?? ''");
    return withPg(async (c) => Boolean((await c.query(`SELECT explanation FROM questions WHERE question_text = $1 LIMIT 1`, [text])).rows[0]?.explanation));
  };
  const arm = (page) =>
    page.evaluate(`(() => {
      window.__t = { key: null, shake: null, reveal: null, expl: null };
      const inp = document.querySelector('[data-solo-input]');
      if (inp && !inp.__armed) {
        inp.__armed = true;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.__t.key = performance.now(); }, true);
        new MutationObserver(() => { if (inp.classList.contains('input-shake') && window.__t.shake === null) window.__t.shake = performance.now(); }).observe(inp, { attributes: true });
      }
      if (!window.__bodyObs) {
        window.__bodyObs = new MutationObserver(() => {
          if (window.__t.reveal === null && document.querySelector('[data-solo-reveal="ok"]')) window.__t.reveal = performance.now();
          if (window.__t.expl === null && document.querySelector('[data-solo-expl]')) window.__t.expl = performance.now();
        });
        window.__bodyObs.observe(document.body, { childList: true, subtree: true, attributes: true });
      }
      return true;
    })()`);

  const S = await newPage(browser, 'r125-solo', true);
  await touchDevice(S, 390, 844, true);
  await signUp(S, 'r125s', '바로도장');
  await S.waitFor("document.querySelector('[data-gb-solo]') !== null", 8000);
  await realClick(S, '[data-gb-solo]');
  await S.waitFor("document.querySelector('[data-solo-start]') !== null", 8000);
  await sleep(400);
  await realClick(S, '[data-solo-start]');
  await S.waitFor("Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) === 1", 8000);
  await sleep(300);

  const table = {};
  const okRun = async (label, k, old) => {
    const v = [];
    const ex = [];
    const snd = [];
    let withExpl = 0;
    if (old) await S.evaluate("localStorage.setItem('qw.solo.noSure', '1')");
    for (let i = 0; i < k; i++) {
      const n0 = await qn(S);
      const ans = await answerOf(S);
      if (await hasExpl(S)) withExpl += 1;
      await realType(S, '[data-solo-input]', ans);
      await arm(S);
      const s0 = await S.evaluate("(window.__qwSoundLog ?? []).filter((x) => x.id === 'correct').length");
      await S.key('Enter');
      await S.waitFor('window.__t.reveal !== null', 3000).catch(() => false);
      const t = await J(S, 'window.__t');
      if (t.reveal !== null && t.key !== null) v.push(t.reveal - t.key);
      if (t.expl !== null && t.key !== null) ex.push(t.expl - t.key);
      if (i === 0 && !old) await snap(S, 'r125-correct-instant-m390-pastel');
      await sleep(900); // 서버 solo.result(600ms 늦게)가 오고 난 뒤
      snd.push((await S.evaluate("(window.__qwSoundLog ?? []).filter((x) => x.id === 'correct').length")) - s0);
      await S.key('Enter');
      await S.waitFor(`Number(document.querySelector('[data-solo-q]')?.dataset.soloQ ?? 0) > ${n0} && document.querySelector('[data-solo-reveal]') === null`, 10000);
      await sleep(250);
    }
    if (old) await S.evaluate("localStorage.removeItem('qw.solo.noSure')");
    table[`맞힘 → 정답! · ${label}`] = stat(v);
    table[`맞힘 → 해설 · ${label}`] = stat(ex);
    return { v, ex, snd, withExpl };
  };
  const nw = await okRun('새 길(지문) · 서버 600ms 늦음', 5, false);
  record('★★★ R125 A — 맞힌 답 Enter → "정답!" · 해설 100ms 안(서버 답 600ms 늦어도 · 다섯 번)', nw.v.length === 5 && Math.max(...nw.v) < 100 && nw.ex.length === nw.withExpl && (nw.ex.length === 0 || Math.max(...nw.ex) < 100), JSON.stringify({ ...table, withExpl: nw.withExpl }));
  record('★★★ R125 A — 뒤에 온 서버 solo.result 에 정답 소리가 두 번 나지 않는다(문제마다 1번)', nw.snd.every((x) => x === 1), JSON.stringify(nw.snd));
  const od = await okRun('옛 길(서버 기다림) · 600ms 늦음', 3, true);
  record('★★★ R125 A — 대조: 옛 길은 서버를 기다린다(≥ 550ms) — 흉내가 실제로 걸렸다', od.v.length === 3 && Math.min(...od.v) >= 550, JSON.stringify(table));

  const wrongRun = async (k) => {
    const v = [];
    for (let i = 0; i < k; i++) {
      await realType(S, '[data-solo-input]', `봇틀린답${i}zz`);
      await arm(S);
      await S.key('Enter');
      await S.waitFor('window.__t.shake !== null', 3000).catch(() => false);
      const t = await J(S, 'window.__t');
      if (t.shake !== null && t.key !== null) v.push(t.shake - t.key);
      await sleep(800);
    }
    return v;
  };
  const wv = await wrongRun(10);
  table['틀림 → 흔들림 · 지문 · 서버 600ms 늦음'] = stat(wv);
  record('★★★ R125 A — 틀린 답 Enter → 흔들림 100ms 안(열 번 · 서버 답 늦어도) · 서버 solo.wrong 에 두 번 흔들지 않음', wv.length === 10 && Math.max(...wv) < 100, JSON.stringify(table['틀림 → 흔들림 · 지문 · 서버 600ms 늦음']));
  const still = await J(S, "({ q: document.querySelector('[data-solo-reveal]') === null, lives: document.querySelectorAll('[data-solo-life].on, .solo-life.on').length })");
  record('★★★ R125 A — 틀린 답 뒤에도 문제 그대로(목숨 · 판정은 서버)', still.q, JSON.stringify(still));
  await S.close?.();

  mkdirSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r125'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', 'design', process.env.SHOT_DIR ?? 'r125', 'r125-timing.json'), JSON.stringify(table, null, 1));
  console.log('\n[R125] 잰 값(ms · 브라우저 안 · 화면 반영까지 · 검사 서버 판정 답 600ms 늦춤)');
  for (const [k, v] of Object.entries(table)) console.log(`  ${k.padEnd(36)} n=${v.n} 중간 ${v.median} 최대 ${v.max}`);
  return table;
}

/** 묶음 고르기 — --r125(전부) · --r125=solo · … */
export async function r125Flow(ctx, part) {
  const parts = part === 'all' ? ['solo', 'sweep'] : part.split(',');
  if (parts.includes('solo')) await r125SoloFlow(ctx);
  if (parts.includes('sweep')) {
    const { r125SweepFlow } = await import('./ui-check-r125-sweep.mjs');
    await r125SweepFlow(ctx);
  }
}
