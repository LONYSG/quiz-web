// 카드 작업 현황판 — 읽기만 한다(DB · 파일 · git 을 고치지 않는다). 어느 창이든 시작할 때 · 끝낼 때 돌린다.
//   node web-desk/tone/_status.mjs          → 묶음별 단계 + "지금 돌릴 창"
//   node web-desk/tone/_status.mjs --json   → 같은 내용을 JSON 으로(스크립트가 읽을 때)
//
// ★ 충돌을 막는 약속(2026-11-13 · G067 사고 뒤):
//   - 쓰는 쪽은 파일을 **다 쓴 뒤 한 번에** 저장하고 맨 위에 `"done": true` 를 넣는다(카드 · 재료 둘 다).
//   - 읽는 쪽(GEN · VERIFY · gpt)은 이 현황판이 "끝남"이라고 한 파일만 읽는다. done 이 없거나 JSON 이 깨졌으면 "쓰는 중"이다.
//   - 옛 파일(카드-18 · 001~004 · 029)은 done 표시 없이 끝난 것으로 본다(LEGACY).
import fs from 'node:fs';
const T = 'web-desk/tone/', A = 'data/pipeline/audit/', P = 'data/pipeline/tone/';
const LEGACY = new Set(['18', '001', '002', '003', '004', '029']);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const size = (p) => { try { return fs.statSync(p).size; } catch { return -1; } };
const ls = (d, re) => { try { return fs.readdirSync(d).filter((f) => re.test(f)).sort(); } catch { return []; } };

// 판정 · 적재 기록 모으기
const judged = new Map();   // 카드 id → verdict (v0NN-tone.json · 나중 것이 이긴다)
for (const f of ls(A, /^v0\d+-tone\.json$/)) { const j = read(A + f); if (j) for (const [k, v] of Object.entries(j)) if (v && v.verdict) judged.set(String(v.id ?? k), v.verdict); }
const material = new Map(); // chunk → 판정 파일 이름
for (const f of ls(A, /^v0\d+-material(-\d+)?\.json$/)) { const j = read(A + f); if (j && j.chunk) material.set(String(j.chunk), f); }
const applied = new Map();  // 카드 id → 마지막으로 실은 파일
for (const f of ls(P, /^g0\d+-apply\.json$/)) { const j = read(P + f); for (const it of (j && j.items) || []) if (String(it.src || it.file || '').startsWith('카드-')) applied.set(String(it.id), String(it.src || it.file).replace('.json', '')); }

const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const lastApply = Math.max(0, mtime(P + '_gen-last-run.json'), ...ls(P, /^g0\d+-apply\.json$/).map((f) => mtime(P + f)));
const lastVerdict = Math.max(0, ...ls(A, /^v0\d+-(tone|material(-\d+)?)\.json$/).map((f) => mtime(A + f)));
const names = ['18', ...Array.from({ length: 72 }, (_, i) => String(i + 1).padStart(3, '0'))];
const rows = [];
for (const n of names) {
  const cardP = `${T}받은것/카드-${n}.json`, matP = `${T}보낼것/재료-${n}.json`;
  const cs = size(cardP), ms = size(matP);
  if (cs <= 0 && ms <= 0) continue;
  const r = { chunk: n, material: 'none', materialJudged: null, card: 'none', cards: 0, ready: 0, claims: 0, claimsWaiting: 0, loadable: 0, loaded: 0, next: [] };
  if (ms > 0) {
    const m = read(matP);
    r.material = !m ? 'writing' : m.done === true ? 'done' : 'writing';
    r.materialJudged = material.get(n) || null;
  }
  let res = null;
  if (cs > 0) {
    const c = read(cardP);
    r.card = !c || !Array.isArray(c.results) ? 'writing' : (c.done === true || LEGACY.has(n)) ? 'done' : 'writing';
    if (r.card === 'done') res = c.results;
  }
  if (res) {
    r.cards = res.length;
    const usesMaterial = r.material === 'done' && r.materialJudged;
    for (const k of res) {
      const id = String(k.id);
      if (k.status !== 'ready') continue;
      r.ready++;
      const hasClaims = Array.isArray(k.claims) && k.claims.length > 0;
      if (hasClaims) r.claims++;
      const v = judged.get(id);
      const ok = !hasClaims || usesMaterial || v === 'ok' || v === 'fix';
      if (hasClaims && !usesMaterial && !v) r.claimsWaiting++;
      if (applied.get(id) === `카드-${n}`) r.loaded++; else if (ok && v !== 'reject') r.loadable++;
    }
  }
  // 다음에 누가 움직이나
  if (r.material === 'writing') r.next.push('max(재료 쓰는 중 — 기다림)');
  if (r.material === 'done' && !r.materialJudged) r.next.push('VERIFY(재료 판정)');
  if (r.material === 'done' && r.materialJudged && r.card === 'none') r.next.push('gpt(카드 쓰기)');
  if (r.card === 'writing') r.next.push('gpt(카드 쓰는 중 — 기다림 · done 표시 없음)');
  if (r.claimsWaiting) r.next.push(`VERIFY(claims ${r.claimsWaiting})`);
  // GEN 은 '마지막 적재 뒤에 새로 생긴 것'이 있을 때만 부른다(게이트에서 늘 빠지는 카드 때문에 헛돌지 않게)
  const fresh = (r.card === 'done' && mtime(cardP) > lastApply) || lastVerdict > lastApply;
  if (r.loadable && fresh) r.next.push(`GEN(실을 것 약 ${r.loadable})`);
  rows.push(r);
}
const who = (w) => rows.filter((r) => r.next.some((x) => x.startsWith(w + '('))).map((r) => r.chunk);
const todo = { VERIFY: who('VERIFY'), gpt: rows.filter((r) => r.next.some((x) => x.startsWith('gpt(카드 쓰기)'))).map((r) => r.chunk), GEN: who('GEN') };
if (process.argv.includes('--json')) { console.log(JSON.stringify({ rows, todo }, null, 1)); process.exit(0); }
console.log('묶음   재료     재료판정            카드     장수 ready claims 판정대기 실음  → 다음');
for (const r of rows) console.log([r.chunk.padEnd(5), r.material.padEnd(8), String(r.materialJudged || '-').padEnd(19), r.card.padEnd(8), String(r.cards).padStart(4), String(r.ready).padStart(5), String(r.claims).padStart(6), String(r.claimsWaiting).padStart(8), String(r.loaded).padStart(5), ' → ' + (r.next.join(' · ') || '끝')].join(' '));
console.log('\n지금 돌릴 창:');
console.log('  VERIFY : ' + (todo.VERIFY.length ? '묶음 ' + todo.VERIFY.join(' ') : '할 것 없음'));
console.log('  gpt    : ' + (todo.gpt.length ? '묶음 ' + todo.gpt.join(' ') + ' (재료 판정이 끝난 것)' : '재료 판정을 기다림 — 쓸 묶음 없음'));
console.log('  GEN    : ' + (todo.GEN.length ? '묶음 ' + todo.GEN.join(' ') : '할 것 없음'));
console.log('(실을 것 수는 어림이다 — 게이트 · 다시 싣기는 GEN 이 정한다. "쓰는 중"인 파일은 어느 창도 읽지 않는다.)');
