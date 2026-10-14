import fs from 'node:fs';
const P = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md';
let lines = fs.readFileSync(P, 'utf8').replace(/\r/g, '').split('\n');
const idx = (p) => lines.findIndex((l) => l.startsWith(p));
const R = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v008-results.json', 'utf8')); const S = R.stats;
// C63
let i = idx('| C63 |');
if (!lines[i].includes('V008')) lines[i] = lines[i].replace(/ \|$/, ` ★ **V008** (\`ai-out/V008.txt\` · \`data/pipeline/audit/v008-results.json\`): (4) G002 가 바꾼 힌트 나머지 ${S.ga.n} 전수 — ok ${S.ga.ok} · fix ${S.ga.fix}(${S.ga.fixPct}%, 사유 대부분 famous-one) · (나) G004 GEN 문구 40 — ok ${S.na.ok} · fix ${S.na.fix} · worse 1(#1029) · (다) H12 후보 ${S.da.n} — fix ${S.da.fix}(pair-same) · ok ${S.da.ok} · 사실 틀림: 무작위 40 → 0, 의심 97 → 1(#455 — 이미 fix) · 반영은 G006 |`);
// CV-11~13 after CV-10
if (!lines.some((l) => l.startsWith('| CV-11 |'))) {
  const j = idx('| CV-10 |');
  lines.splice(j + 1, 0,
    '| CV-11 | H9 "대표 사실/정체" 의 선 (V008 4절) — 나라·도시의 기본 정체(서울·인천과 함께 수도권 · 공용어 4개 · 소재 기업)와 대표 제품(패미컴 → 닌텐도 · 콜라병)을 fix 로 볼지 | (가) fix 35 중 30 이 이 꼴이고 판정자 사이 갈렸다(노키아 #2146 · #3454 는 g2 fix · d3 ok → VERIFY 가 fix · #3947 수도 누크 ok · #3956 · #3960 fix). 지금 기준은 CV-05 판정 문장 "질문을 모르는 보통 한국 성인이 그 힌트만 보고 정답을 바로 말하는가" — 선이 맞는지, 이 꼴을 G005 이후 생성에 어떻게 반영할지 설계 에이전트 판단 |',
    '| CV-12 | 같은 정답 두 문항의 **힌트↔힌트**가 같은 사실인데 문장이 다른 쌍 27 (V008 4-6) | 규칙 ③(H12)은 다른 쪽 질문·해설만 본다. G004 는 같은 문장 3건만 고쳤다. 같은 정답 두 문항이 한 판에 같이 나올 일이 드물어 ok 로 두었다 — 사실이 같으면 한쪽을 바꾸게 할지 선 확인 |',
    '| CV-13 | 질문·힌트에 **서로의 정답**이 들어 있는 쌍(C66 확대) — 활성 전체 기계 스캔 64쌍 (V008 4-5) | 같은 정답이 아닌 쌍이라 H12 가 아니라 MAIN 출제(한 판에 같이 나오는 문제)의 과제 — C66 · Q-103 과 함께. 단순 포함 검사라 우연 포함이 섞였을 수 있음 |');
}
const hi = lines.findIndex((l) => l.startsWith('마지막 갱신:'));
if (!lines[hi].includes('**V008**')) lines[hi] = lines[hi].replace('마지막 갱신: **G004**', '마지막 갱신: **V008** (C63 (4) 끝 · CV-11~13) · 그 전 **G004**');
fs.writeFileSync(P, lines.join('\n'));
// README
const RP = 'C:/work/quiz-web/ai-out/README.md';
let rl = fs.readFileSync(RP, 'utf8').replace(/\r/g, '').split('\n');
const j7 = rl.findIndex((l) => l.startsWith('| V007.txt |'));
if (!rl.some((l) => l.startsWith('| V008.txt |'))) rl.splice(j7 + 1, 0, `| V008.txt | ★ 기존 활성 힌트 점검 (C63 (4)) — (가) G002 가 바꾼 중 힌트 나머지 ${S.ga.n}: ok ${S.ga.ok} · fix ${S.ga.fix} · (나) G004 에서 GEN 이 쓴 문구 40: ok ${S.na.ok} · fix ${S.na.fix}(worse 1) · (다) H12 후보 ${S.da.n}: fix ${S.da.fix} · ok ${S.da.ok} · 사실 틀림 무작위 40 → 0 → \`audit/v008-results.json\` · \`v008-raw/\`. G006 이 반영 · Sonnet 5.5 · CV-11~13 |`);
fs.writeFileSync(RP, rl.join('\n'));
console.log('ok');
