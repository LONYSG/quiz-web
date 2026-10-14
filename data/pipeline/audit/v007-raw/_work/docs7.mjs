import fs from 'node:fs';
const P = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md';
let lines = fs.readFileSync(P, 'utf8').replace(/\r/g, '').split('\n');
const idx = (p) => lines.findIndex((l) => l.startsWith(p));
const R = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v007-results.json', 'utf8'));
const S = R.stats; const v = S.verdict; const nS = R.g002SampleStats; const dS = R.pairs29Stats;
const topics = ['korea', 'sports', 'life', 'arts', 'media', 'science', 'history'];
const gen45 = topics.reduce((s, t) => s + S.difByTopic[t].gen45, 0), new45 = topics.reduce((s, t) => s + S.difByTopic[t].new45, 0);

// C63
let i = idx('| C63 |');
if (!lines[i].includes('V007 끝')) lines[i] = lines[i].replace(/ \|$/, ` ★ **V007 끝** (\`ai-out/V007.txt\`): (2) 쌍 ok 쪽 29 판정 — fix ${dS.verdict.fix} · ok ${dS.verdict.ok}(#508 · #1323 · #2026) — 대부분 다른 쪽 질문·해설과 같은 사실(pair-same) · 제안 힌트는 G004 가 반영 (4) 표본 50 판정 — ok ${nS.verdict.ok} · fix ${nS.verdict.fix}(의심 3 모두 fix · 경계 6 중 #603 fix) · (1) #3557 마리오 질문: V007 판정자(j8)도 위키와 어긋난다고 확인(세갈레는 사무실 집주인) — GEN 이 기존 활성 점검 때 고칠 것 · 새 참고: #2188 악셀 힌트가 G003 S2-23 질문과 같은 사실 |`);
// C64
i = idx('| C64 |');
if (!lines[i].includes('V007 끝')) lines[i] = lines[i].replace(/ \|$/, ` ★ **V007 끝** (\`ai-out/V007.txt\` · \`data/pipeline/audit/v007-results.json\`): 490 판정 ok ${v.ok} · fix ${v.fix} · drop ${v.drop} · unsure 0 · 사실 틀림 ${S.facts.false}(전부 fix 에 반영) · 열지 않은 항목 무작위 60 오류 0 · 난이도 재채점 상 ${gen45}→${new45} · 새 힌트 규칙 ①0 ②3 ③0 · 미디어 알 가치 2 23 중 drop 1(M1-14) · G004 가 ok ${v.ok} + fix ${v.fix}(제안 반영) 을 적재하고 drop ${v.drop} 은 제외 |`);
// C65
i = idx('| C65 |');
if (!lines[i].includes('V007')) lines[i] = lines[i].replace(/ \|$/, ` ★ **설계 판단 (2026-10-14) — 묻는 사실 읽기 · V007 재채점 · G004 가 15 에 한 줄 적는다** · V007 결과: VERIFY 가 "풀이에 필요한 가장 쉬운 충분 단서" 로 읽어 490 을 재채점 → 상 ${gen45}→${new45}(올림 3 · 내림 57) — 기대와 반대. 반대 읽기("가장 깊은 단서")면 경계 4 표시 ${S.borderDir['3/경계4']}건이 올라 ${new45 + S.borderDir['3/경계4']} 근처 — **CV-07 에서 선택** |`);
// CV-07~10 after CV-06
if (!lines.some((l) => l.startsWith('| CV-07 |'))) {
  const j = idx('| CV-06 |');
  const add = [
    `| CV-07 | 난이도 "묻는 사실" 읽기 (C65 · 15 §5-1) — V007 은 풀이에 필요한 가장 쉬운 충분 단서로 읽어 상 ${gen45}→${new45} | 반대 읽기(가장 깊은 단서 · 정답 이름이 교과서에 흔해도 소장처·경위·판정 이유 같은 세부가 단서면 올림)면 3점 중 경계 4 ${S.borderDir['3/경계4']}건이 4 로 올라 상 ${new45 + S.borderDir['3/경계4']} 근처. 어느 읽기를 15 · score-v1 에 한 줄로 적을지 설계 에이전트·찬종 판단. 근거 한 줄은 results.json g003[ref].score.difWhy ("묻는 사실: …") |`,
    '| CV-08 | 미디어 알 가치 2 예외의 "레전드" 선 (15 §5-2 · MD10) — M1-14 단밤(이태원 클라쓰)은 drop, 경계로 ok 둔 4건(M1-13 애봉이 · M1-21 이영호 · M2-09 순정마초 · M2-19 카시오페아) | 한국 히트 드라마·웹툰(이태원 클라쓰)·인기 예능 곡을 레전드로 칠지. 선이 넓으면 M1-14 를 ok 로 되돌린다 |',
    '| CV-09 | 질문이 "이름을 따서 / 이름이 붙은 / 도시 이름으로 불리는" 을 요구할 때 일반어 변형을 빼는 제안 5건 — C1-26 랑게르한스섬(췌도·이자섬) · C1-28 유스타키오관(이관) · C2-21 벨크로(찍찍이) · H1-05 과잉금지 원칙(비례의 원칙) · H2-24 암리차르 학살(잘리안왈라 바그) | B2 를 지키면 일반어를 친 사람이 억울하고, 풀어 주면 질문 한정이 약해진다. 기본값을 정하고(질문 한정을 푸는 쪽도 가능) G004 가 5건에 같은 방향으로 적용 |',
    '| CV-10 | 2회차 3-3 에서 새 사실이 있어도 범주 단서만으로 풀리는 것을 버리는 선 — L1-26 스도쿠(숫자 퍼즐 + 일본 이름) · L2-21 쌀국수 drop, A2-01 허클베리 핀은 단서를 바꿔 fix | D6(애매하면 살린다)과 충돌 — 난이도 1 이라 상 목표에 쓸모가 적어 drop 했다. 선 확인 |',
  ];
  lines.splice(j + 1, 0, ...add);
}
const hi = lines.findIndex((l) => l.startsWith('마지막 갱신:'));
if (!lines[hi].includes('**V007**')) lines[hi] = lines[hi].replace('마지막 갱신: **G003**', '마지막 갱신: **V007** (C64 끝 · C63 (2)(4) 끝 · C65 · CV-07~10) · 그 전 **G003**');
fs.writeFileSync(P, lines.join('\n'));

// README
const RP = 'C:/work/quiz-web/ai-out/README.md';
let rl = fs.readFileSync(RP, 'utf8').replace(/\r/g, '').split('\n');
const j6 = rl.findIndex((l) => l.startsWith('| V006.txt |'));
if (!rl.some((l) => l.startsWith('| V007.txt |'))) rl.splice(j6 + 1, 0, `| V007.txt | ★ G003 상 생성 1차 490 (C64, 적재 전) + G002 가 바꾼 중 힌트 표본 50 + 같은 정답 쌍 ok 쪽 29 (C63): (가) ok ${v.ok} · fix ${v.fix} · drop ${v.drop} · 난이도 "묻는 사실" 재채점 상 ${gen45}→${new45} · 사실 틀림 ${S.facts.false}(fix 반영)·무작위 60 오류 0 · (나) fix ${nS.verdict.fix}/50 · (다) fix ${dS.verdict.fix}/29 → \`audit/v007-results.json\` · \`v007-raw/\`. G004 가 반영·적재 · Sonnet 5.5 첫 라운드 · CV-07~10 |`);
fs.writeFileSync(RP, rl.join('\n'));
console.log('ok', gen45, new45);
