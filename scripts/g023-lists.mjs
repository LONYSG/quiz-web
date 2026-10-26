#!/usr/bin/env node
// G023 I — 목록만(쓰지 않는다): audit/g023-lists.json · audit/g023-fam1-candidates.json
//   정답 비유일 · 친숙도 1 후보(비활성 안 함 — V029 알가치 판정자에게 "낮음 후보") · 시간 의존 · 민감 · 같은 정답 쌍 · 읽기 건너뜀 · 힌트 없는 3+
import { connect, loadPlan, readJson, writeJson, loadSources } from './g023-common.mjs';
const plan = loadPlan(); const { S } = loadSources();
const c = await connect();
const { rows } = await c.query(`select q.id, q.display_answer, a.answer_norm from questions q join question_answers a on a.question_id=q.id and a.is_primary where q.is_active`);
await c.end();
const A = new Map(rows.map((r) => [String(r.id), r]));
const pick = (f) => Object.entries(plan.items).filter(([, x]) => f(x)).map(([id, x]) => ({ id: +id, answer: A.get(id)?.display_answer, v2: x.v2 }));
const unique = Object.entries(plan.items).filter(([, x]) => x.unique).map(([id, x]) => ({ id: +id, answer: A.get(id).display_answer, v2: x.v2, notes: x.unique }));
const sensitive = Object.entries(plan.items).filter(([, x]) => x.sensitive).map(([id, x]) => ({ id: +id, answer: A.get(id).display_answer, notes: x.sensitive }));
const timeBound = Object.entries(plan.items).filter(([, x]) => x.timeBound).map(([id, x]) => ({ id: +id, answer: A.get(id).display_answer, notes: x.timeBound }));
// 친숙도 1 — 각 판정 파일이 그 라운드에 새로 매긴 것(V027 54 · V028 판정 · G022 둘째 판정) + 옮겨 온 옛 판정 1 은 따로
const fam = []; const famOld = [];
for (const [id, x] of Object.entries(plan.items)) {
  const f = x.familiarity; if (f?.level !== 1) continue;
  const src = String(f.source ?? x.src);
  const row = { id: +id, answer: A.get(id).display_answer, v2: x.v2, pct: f.pct ?? null, source: src, judgedIn: x.src };
  if (x.src === 'V027' || x.src === 'V028' || /^G022/.test(src)) fam.push(row); else famOld.push(row);
}
// 같은 정답 쌍(활성 주 답 정규화가 같은 것)
const byNorm = new Map(); for (const r of rows) { if (!byNorm.has(r.answer_norm)) byNorm.set(r.answer_norm, []); byNorm.get(r.answer_norm).push(+r.id); }
const sameAnswer = [...byNorm.entries()].filter(([, v]) => v.length > 1).map(([k, ids]) => ({ answer: A.get(String(ids[0])).display_answer, ids, v2: ids.map((i) => plan.items[i]?.v2) }));
const hintless = readJson('g023-hintless.json');
const skipped = readJson('g023-text-skipped.json');
const out = { round: 'G023', builtAt: new Date().toISOString(), note: '목록만 — DB 쓰기 없음 · 사람 확인 · 다음 판정 라운드 재료',
  counts: { unique: unique.length, fam1: fam.length, fam1Old: famOld.length, timeBound: timeBound.length, sensitive: sensitive.length, sameAnswerGroups: sameAnswer.length, sameAnswerItems: sameAnswer.reduce((a, g) => a + g.ids.length, 0), readSkipped: skipped.n, hintless3: hintless.n },
  unique, timeBound, sensitive, sameAnswer, readSkipped: skipped.items.map((s) => s.id), hintless3: hintless.items.map((h) => h.id) };
writeJson('g023-lists.json', out);
writeJson('g023-fam1-candidates.json', { round: 'G023', note: '정답 친숙도 1 후보 — 비활성 안 함(찬종 2026-10-26) · V029 알가치 판정자에게 "낮음 후보" · items = V027 54 · V028 118(보고서 3절 ① 그대로 — 옮겨 온 출처 포함) · G022 둘째 판정 5 · old = G022 반에서 옛 판정(V022~V026)이 옮겨 온 1(G020 은 확정만 비활성)', n: fam.length, nOld: famOld.length, items: fam, old: famOld });
console.log(JSON.stringify(out.counts), 'fam1 by', JSON.stringify(fam.reduce((a, r) => ((a[r.judgedIn] = (a[r.judgedIn] ?? 0) + 1), a), {})));
