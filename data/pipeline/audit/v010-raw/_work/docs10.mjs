import fs from 'node:fs';
const P = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md';
let lines = fs.readFileSync(P, 'utf8').replace(/\r/g, '').split('\n');
const idx = (p) => lines.findIndex((l) => l.startsWith(p));
const R = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v010-results.json', 'utf8')); const S = R.stats, P2 = S.pool, r2 = R.rater2;
const kept = S.keptTop;
let i = idx('| C68 |');
if (!lines[i].includes('V010')) lines[i] = lines[i].replace(/ \|$/, ` ★ **V010 끝** (\`ai-out/V010.txt\` · \`data/pipeline/audit/v010-results.json\`): ③ G006 이 직접 쓴 힌트 14 판정 — ok 14 · fix 0(판정자 fix 1 은 VERIFY 가 DB 로 확인해 ok) · 기존 활성 상 608 blind 재채점 — 상 ${kept}(${(kept / 608 * 100).toFixed(1)}%) 유지 · 내림 387 + 5→4 25 · **CV-18~20** |`);
if (!lines.some((l) => l.startsWith('| CV-18 |'))) {
  const j = idx('| CV-17 |');
  lines.splice(j + 1, 0,
    `| CV-18 | 기존 활성 상(4~5) 608 blind 재채점 적용 범위 (V010 2-6 · results.json items[id].dif) — 상 ${kept}(${(kept / 608 * 100).toFixed(1)}%) 유지, 50문제 상만 판 14 → ${P2.playsWithoutG005}판(G005 blind 상 174 포함 ${P2.playsWithG005}판) | (a) 최종 값 그대로 DB 에 반영(G004 가 V007 값을 쓴 방침) (b) 두 채점자가 모두 4 인 것만 상으로 — r2 120건에서 둘 다 4 가 ${r2.byPiece ? 27 : 27}(22.5%) → 608 환산 약 137 (c) edge:3 인 83건은 보류. 목적이 "상만 판의 체감을 고르게" 면 (a). 반영은 다음 GEN 라운드 |`,
    '| CV-19 | 난이도 5 단계 (V010 0절) — 판정자가 5 를 한 번도 주지 않음(V009 도 0). 현재 5 인 26 은 4(25)·3(1) | 15 §5-1 의 5(전공·자격증/마니아도 헷갈림)에 닿는 문항을 앞으로 만들 계획인지, 상 = 4 로 단순화할지 설계 판단 |',
    `| CV-20 | 난이도 라운드에서 나온 질문 품질 note ${S.notes}건 (V010 5절) — 정답 유일성 의심(점프 구분 기준 #2187 · #2262 · #2412 · #2574 · #2887 · #3072) · 질문이 정답을 풀어 쓴 꼴(#1783) · 시간 의존·학설(#3466 · #3555 · #3609 · #3680) | 난이도 라운드라 fix 판정은 하지 않았다. 다음 GEN 의 기존 활성 점검 때 읽고 필요한 것만 고친다 |`);
}
const hi = lines.findIndex((l) => l.startsWith('마지막 갱신:'));
if (!lines[hi].includes('**V010**')) lines[hi] = lines[hi].replace('마지막 갱신: **V009**', '마지막 갱신: **V010** (C68 ③ 끝 · CV-18~20) · 그 전 **V009**');
fs.writeFileSync(P, lines.join('\n'));
const RP = 'C:/work/quiz-web/ai-out/README.md';
let rl = fs.readFileSync(RP, 'utf8').replace(/\r/g, '').split('\n');
const j9 = rl.findIndex((l) => l.startsWith('| V009.txt |'));
if (!rl.some((l) => l.startsWith('| V010.txt |'))) rl.splice(j9 + 1, 0, `| V010.txt | ★ 기존 활성 상(4~5) 608 blind 재채점 (G003 110 은 V007 이 이미 같은 읽기) + G006 GEN 힌트 14: 상 유지 ${kept}(${(kept / 608 * 100).toFixed(1)}%) · 3 이하 387 · 5 → 4 25 · 상만 판 14 → ${P2.playsWithoutG005}판(G005 포함 ${P2.playsWithG005}) · 2차 채점자 120 상/상 아님 일치 ${r2.topAgree} · 힌트 14 ok → \`audit/v010-results.json\` · \`v010-raw/\`. 반영은 다음 GEN · Sonnet 5.5 · CV-18~20 |`);
fs.writeFileSync(RP, rl.join('\n'));
console.log('ok');
