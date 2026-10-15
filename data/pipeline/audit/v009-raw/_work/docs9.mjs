import fs from 'node:fs';
const P = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md';
let lines = fs.readFileSync(P, 'utf8').replace(/\r/g, '').split('\n');
const idx = (p) => lines.findIndex((l) => l.startsWith(p));
const R = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v009-results.json', 'utf8')); const S = R.stats, V = R.rescoreVsGen, r2 = V.rater2;
const nd = Object.values(R.items).filter((x) => x.verdict !== 'drop'); const topND = nd.filter((x) => x.dif >= 4).length;
let i = idx('| C67 |');
if (!lines[i].includes('V009 끝')) lines[i] = lines[i].replace(/ \|$/, ` ★ **V009 끝** (\`ai-out/V009.txt\` · \`data/pipeline/audit/v009-results.json\`): 493 판정 ok ${S.verdict.ok} · fix ${S.verdict.fix} · drop ${S.verdict.drop}(2회차 3-3 9 + MD10 1) · blind 재채점 상 307(62%) → ${V.newTop}(${(V.newTop / 493 * 100).toFixed(1)}%) · 2차 채점자 96건 상 ${r2.rater2Top}(30%) · rewrite 227 중 질문 문제 4(L2-27 · L2-28 · K3-08 · M1-20) · 사실 틀림 무작위 0 · 힌트 fix 138(famous-one 115) · 변형 fix 28 · G007 이 ok ${S.verdict.ok} + fix ${S.verdict.fix}(제안 반영) 적재, drop ${S.verdict.drop} 제외 · **CV-14~17** |`);
if (!lines.some((l) => l.startsWith('| CV-14 |'))) {
  const j = idx('| CV-13 |');
  lines.splice(j + 1, 0,
    `| CV-14 | 상(4~5) 재채점 신뢰 (V009 2-2) — GEN 307(62%) → blind ${V.newTop}(${(V.newTop / 493 * 100).toFixed(1)}%) · 2차 채점자 r2 도 96건 중 ${r2.rater2Top}(30%) vs GEN ${r2.genTop}(64%) | DB difficulty_score 에 어느 값을 쓰나 — G004 는 V007 재채점 값을 썼다(같은 방침이면 results.json items[ref].dif). 3/4 경계 표시 409건(dif 3 에 "경계 4" 244 · dif 4 에 "경계 3" 165) · 판정자-r2 상/상 아님 일치 ${r2.topAgree}/96 · 조각별 상 비율 26~47% 라 읽기에 민감하다. 두 채점자가 모두 4 일 때만 상으로 칠지(≈ 상 ${Math.round(topND * 0.65)} 안팎), 풀 추정은 상만 ${Math.floor((718 + topND) / 50)}판(718+${topND}). korea 상은 45+${V.korea.newTopNonDrop}=${45 + V.korea.newTopNonDrop} |`,
    '| CV-15 | 2회차 3-3 drop 9 (34 중 26% — V009 2-8) — K3-14 초당두부 · K3-25 홍길동전 · L2-07 루빅스 큐브 · L2-09 십자말풀이 · L2-10 타로 · L3-02 팟타이 · L3-12 밸런타인데이 · L3-25 데자뷔 · H2-08 사르가소해 | CV-10(범주 단서만으로 풀리면 버린다)을 같은 기준으로 적용. 새 사실이 있어 D6 으로 살릴 수도 있는 경계 4(L3-02 · K3-14 · L3-12 drop vs S1-23 · S1-21 ok). 선이 맞는지, drop 대신 범주 단서를 빼고 다시 쓰게 할지 |',
    '| CV-16 | 변형 경계 3 (V009 4-5) — S1-07 해태 타이거즈(KIA·기아 타이거즈는 같은 구단의 지금 이름 — 질문은 1982 원년) · S2-01 코비 · C1-27 뱀장어 "장어" | S1-07 은 판정자 제안대로 받고 S2-01 "코비"(B5 불필요한 축약 vs A3 짧은 쪽)·C1-27 "장어"(B7 넓은 말)는 B5/B7 대로 뺀다는 기본값 제안. S2-36 "알리" 는 VERIFY 가 B5 로 뺐다 |',
    `| CV-17 | 문서로 못 닫은 주장이 남은 ok — 질문·해설 16건 + 힌트 9건 + 미디어 나무위키 6 (V009 4-1 · 4-2) | 나무위키 403·404 와 요약 모델의 한계로 문서에서 못 찾았다(거짓으로 본 것은 없음). G007 이 방송/기사 등으로 닫아 보고, 못 닫으면 "지식 근거" 표시로 적재하되 제외하지는 않는다는 기본값 제안. K3-01 잡채 "사삼각로" · K4-07 하오체 "부부 사이" 는 G005 가 지식 힌트로 표시한 것 |`);
}
const hi = lines.findIndex((l) => l.startsWith('마지막 갱신:'));
if (!lines[hi].includes('**V009**')) lines[hi] = lines[hi].replace('마지막 갱신: **G006**', '마지막 갱신: **V009** (C67 끝 · CV-14~17) · 그 전 **G006**');
fs.writeFileSync(P, lines.join('\n'));
const RP = 'C:/work/quiz-web/ai-out/README.md';
let rl = fs.readFileSync(RP, 'utf8').replace(/\r/g, '').split('\n');
const j8 = rl.findIndex((l) => l.startsWith('| V008.txt |'));
if (!rl.some((l) => l.startsWith('| V009.txt |'))) rl.splice(j8 + 1, 0, `| V009.txt | ★ G005 상 생성 2차 493 (C67, 적재 전): ok ${S.verdict.ok} · fix ${S.verdict.fix} · drop ${S.verdict.drop} · blind 재채점 상 307(62%) → ${V.newTop}(${(V.newTop / 493 * 100).toFixed(1)}%) · 2차 채점자 상 30% · rewrite 227 질문 문제 4 · 힌트 fix 138(famous-one 115) · 변형 fix 28 · 2회차 drop 9 · 사실 틀림 무작위 0 → \`audit/v009-results.json\` · \`v009-raw/\`. G007 이 반영·적재 · Sonnet 5.5 · CV-14~17 |`);
fs.writeFileSync(RP, rl.join('\n'));
console.log('ok');
