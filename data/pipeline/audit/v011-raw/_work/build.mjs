// V011 build — 판정자 출력(q1·q2) + VERIFY 재독 결정 → data/pipeline/audit/v011-results.json + ai-out/V011.txt
import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v011-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const tg = J(R + '/targets-ids.json'); const summary = J(R + '/_work/summary.json');
const q1 = Object.fromEntries(J(R + '/q1.out.json').map((x) => [x.key, x]));
const q2 = Object.fromEntries(J(R + '/q2.out.json').map((x) => [x.key, x]));
const idOf = Object.fromEntries(tg.ga.map((x) => [x.key, x.id]));
const knId = Object.fromEntries(tg.knowledge.map((x) => [x.ref + ':knowledge', x.id]));

// VERIFY 재독 결정
const ov2 = {
  'S2-07': { verdict: 'ok', side: null, why: '판정자 fix(1회차 힌트 #4268 이 2회차 질문과 같은 사실) — 그러나 #4268 은 G008 이 이미 고쳐 DB 힌트가 "남동생이 자이언츠 구원 투수" 로 바뀌어 겹침이 사라졌다(DB 직접 읽음). 대상 밖이라 참고만', note: 'DB #4268 현재 힌트: 그의 남동생은 1972~1981년 샌프란시스코 자이언츠에서 뛴 메이저리그 구원 투수였다.' },
  'L1-08': { verdict: 'ok', side: null, why: '판정자 fix(1회차 힌트 #641 이 2회차 질문과 같은 사실) — #641 은 G008 이 이미 고쳐 DB 힌트가 "CFA 1978 챔피언십 지위" 로 바뀌어 겹침이 사라졌다(DB 직접 읽음). 대상 밖이라 참고만', note: 'DB #641 현재 힌트: 미국의 고양이 등록 단체 CFA는 1978년 이 품종에 챔피언십 지위를 주었다.' },
  'S1-05': { replaceProposal: { hint: '2014년 프랭크 토머스는 다른 어느 자리보다 이 역할로 더 많은 경기를 뛴 선수로는 처음 명예의 전당에 올랐다.' }, why: 'VERIFY: 판정자 제안 "경기의 과반" 은 en 위키 Frank Thomas 문서의 "more games as a DH than in any other position" 과 달라 문서 문구로 교체(chk 통과)' },
};
const pairs = {}; const flipped = [];
for (const [ref, x] of Object.entries(q2)) {
  const id = tg.pairs.find((p) => p.ref === ref); const o = ov2[ref];
  let verdict = x.verdict, proposal = x.proposal, side = x.fixSide || null, reason = x.reason;
  if (o?.verdict) { flipped.push({ key: ref, from: x.verdict, to: o.verdict, why: o.why }); verdict = o.verdict; proposal = null; side = null; reason = o.why; }
  if (o?.replaceProposal) { proposal = { ...x.proposal, ...o.replaceProposal }; reason = x.reason + ' / ' + o.why; }
  pairs[`${id.id}↔${id.pairedId}`] = { ref, id: id.id, pairedId: id.pairedId, verdict, judgeVerdict: x.verdict, threeThree: x.threeThree, h12: x.h12, fixSide: side, proposal, reason, note: o?.note ?? x.note ?? null, verifyOverride: !!o?.verdict };
}
const g007Gen = {}; for (const t of tg.ga) { const x = q1[t.key]; g007Gen[t.key] = { ref: t.key.split(':')[0], field: t.key.split(':')[1], id: t.id, verdict: x.verdict, categories: x.categories, reason: x.reason, afterVsBefore: x.afterVsBefore, alone: x.alone, proposal: x.proposal, facts: x.facts, note: x.note ?? null }; }
const knowledge = {}; for (const t of tg.knowledge) { const k = t.ref + ':knowledge'; const x = q1[k]; knowledge[k] = { ref: t.ref, id: t.id, verdict: x.verdict, reason: x.reason, facts: x.facts, tried: x.tried, note: x.note }; }
const cv20 = {}; for (const id of tg.cv20) { const x = q1[String(id)]; cv20[id] = { id, verdict: x.verdict, categories: x.categories, reason: x.reason, proposal: x.proposal, otherAnswers: x.otherAnswers, facts: x.facts, note: x.note ?? null, tried: x.tried ?? null }; }
const gv = Object.values(g007Gen);
const kfacts = Object.values(knowledge).flatMap((k) => k.facts);
const web = { note: '판정자 q1 은 WebFetch 도구 대신 node 로 문서를 약 90회 열고(자기 보고) WebSearch 4회, 판정자 q2 는 WebFetch 37회·WebSearch 3회, VERIFY 직접 WebFetch 6회·WebSearch 0회', webSearch: 7, webFetchTool: 43, nodeFetch: 90, limitWebSearch: 30, r429: 0 };
const counts = { activeDb: summary.activeDb, g005InDb: summary.g005InDb, g007Gen: gv.length, g007GenFields: summary.genFields, g007GenRefs: summary.genRefs, knowledge: 5, cv20: 13, pairs: 25, pairedDropped: summary.pairedDropped };
const stats = {
  g007Gen: { ok: gv.filter((x) => x.verdict === 'ok').length, fix: gv.filter((x) => x.verdict === 'fix').length, afterVsBefore: cnt(gv, (x) => String(x.afterVsBefore).split(/[ —]/)[0]) },
  knowledge: { total: 5, closedTrue: ['H2-01', 'M1-03', 'M1-05'], partial: ['K4-07', 'M1-02'], unverifiedClaims: kfacts.filter((f) => f.result === 'unverified').length, trueClaims: kfacts.filter((f) => f.result === 'true').length },
  cv20: { ok: Object.values(cv20).filter((x) => x.verdict === 'ok').length, fix: Object.values(cv20).filter((x) => x.verdict === 'fix').length, fixIds: Object.values(cv20).filter((x) => x.verdict === 'fix').map((x) => x.id), okIds: Object.values(cv20).filter((x) => x.verdict === 'ok').map((x) => x.id) },
  pairs: { ok: Object.values(pairs).filter((x) => x.verdict === 'ok').length, fix: Object.values(pairs).filter((x) => x.verdict === 'fix').length, judgeFix: Object.values(pairs).filter((x) => x.judgeVerdict === 'fix').length, fixSides: cnt(Object.values(pairs).filter((x) => x.verdict === 'fix'), (x) => x.fixSide), threeThreeProblem: Object.values(pairs).filter((x) => !/^ok/.test(x.threeThree)).length },
};
fs.writeFileSync(A + '/v011-results.json', JSON.stringify({ round: 'V011', date: '2026-10-17', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)', web, counts, stats, targets: tg, g007Gen, knowledge, cv20, pairs, flipped }, null, 1));
console.log(JSON.stringify({ counts, stats, flipped: flipped.map((f) => f.key) }, null, 1));
