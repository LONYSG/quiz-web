// V007 보고서 생성 → ai-out/V007.txt
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const R = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v007-results.json', 'utf8'));
const items = new Map(JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8')).map((x) => [x.ref, x]));
const s50 = new Map(JSON.parse(fs.readFileSync(SC + '/sample50.json', 'utf8')).map((x) => [x.id, x]));
const p29 = new Map(JSON.parse(fs.readFileSync(SC + '/pairs29.json', 'utf8')).map((x) => [x.id, x]));
const S = R.stats; const G = R.g003;
const one = (s) => (s ?? '').toString().replace(/\s*\n\s*/g, ' ').trim();
const cut = (s, n) => { s = one(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const topics = ['korea', 'sports', 'life', 'arts', 'media', 'science', 'history'];
const TN = { korea: 'korea', sports: 'sports', life: 'life', arts: 'arts', media: 'media', science: 'science', history: 'history' };
const pad = (v, n) => String(v).padEnd(n);
const L = [];
const W = (s = '') => L.push(s);
const H = (n, t) => { W(); W('====================================================================='); W(`${n}${t}`); W('====================================================================='); };

// ── 숫자
const v = S.verdict; const nonok = v.fix + v.drop + (v.unsure || 0);
const readN = S.readN; const matrix = S.difMatrix;
const upN = (matrix['1->2'] || 0) + (matrix['3->4'] || 0) + (matrix['2->4'] || 0);
const downN = Object.entries(matrix).filter(([k]) => { const [a, b] = k.split('->').map(Number); return b < a; }).reduce((s, [, n]) => s + n, 0);
const sameN = 490 - upN - downN;
const gen45 = topics.reduce((s, t) => s + S.difByTopic[t].gen45, 0), new45 = topics.reduce((s, t) => s + S.difByTopic[t].new45, 0);
const nS = R.g002SampleStats; const dS = R.pairs29Stats;
const okRead = readN.border + readN.ok10 + readN.ambig + readN.override;
const pairSame = Object.values(R.pairs29).filter((r) => (r.categories || []).includes('pair-same')).length;
const t60 = R.true60;
const hintFixN = S.hintFixCount;
const factsA = S.facts;
const avb = {}; for (const r of Object.values(R.g002Sample)) { const k = one(r.afterVsBefore).split(/[ —]/)[0]; avb[k] = (avb[k] || 0) + 1; }

W('===========================================');
W('ROUND: V007');
W('DATE: 2026-10-14');
W('TASK: G003 상 생성 1차 490 판정 (C64 — 적재 전) + G002 가 바꾼 중 힌트 484 의 세기 표본 50 + 같은 정답 쌍 ok 쪽 29 (Q-109 나) — 결과는 G004 가 반영·적재');
W('STATUS: 완료');
W('===========================================');
W();
W('[cmd 창 요약]');
W(`1. (가) G003 490 전부 판정(누락 0): ok ${v.ok} · fix ${v.fix} · drop ${v.drop} · unsure 0. 판정자 fix 2건을 ok 로 되돌리고 drop 1건을 fix 로 낮추고 ok 2건을 fix·drop 으로 올림(뒤집기 5 · 직접 재독 ${readN.total}건).`);
W(`2. ★ 난이도 "묻는 사실" 재채점: 상(4~5) ${gen45} → ${new45} (31% → ${(new45 / 4.9).toFixed(0)}%). 올림 ${upN} · 내림 ${downN} · 같음 ${sameN}. 기대(올라가는 쪽)와 반대 — 읽기를 "풀이에 필요한 가장 쉬운 단서" 로 잡은 탓(0절 · CV-07).`);
W(`3. 사실: 열어 본 주장 ${factsA.claims + t60.claims} 중 틀림 ${factsA.false} (전부 fix 에 반영) · 미확인 ${S.unverifiedList.length + t60.tally.unverified}. 열지 않은 항목에서 무작위 60(주장 ${t60.claims})을 열어 틀림 ${t60.tally.false} = 오류율 0%.`);
W(`4. (나) G002 힌트 표본 50: ok ${nS.verdict.ok} · fix ${nS.verdict.fix} (무작위 41 중 ${nS.byGroup['무작위'].fix} · 의심 3 중 3 · 경계 6 중 ${nS.byGroup['경계'].fix}). (다) 쌍 29: fix ${dS.verdict.fix} (같은 사실 pair-same ${pairSame}) · ok ${dS.verdict.ok}.`);
W('5. DB 쓰기 0 · 적재 0. 산출물: ai-out/V007.txt · audit/v007-results.json · v007-raw/ · 13-PENDING(C64·C63·C65·CV-07~10) · README V 표. 모델 Sonnet 5.5 (사용량 한도 429 없음).');
W();
W('0. 찬종이 볼 것');
W(`- ★ 난이도 재채점이 상을 줄였다(C65): GEN 153(31%) → ${new45}(${(new45 / 4.9).toFixed(0)}%). 이유 — 브리핑의 "묻는 사실" 읽기를 나는 "풀이에 필요한 가장 쉬운 충분 단서 하나가 어디서 접하는 지식인가" 로 풀었고(RUBRIC '난이도 읽기'), 그 기준에서는 단서 문장이 교과서 정의·유명 일화인 항목이 많아 4→3 내림 ${matrix['4->3'] + (matrix['5->4'] || 0)}건(4→3 ${matrix['4->3']} · 5→4 ${matrix['5->4']}) · 3→2 ${matrix['3->2']}건이 나왔다. 올림은 3건뿐이다. 설계 에이전트가 예로 든 칠지도·만세전·육계도·직전법·조봉암·하누카·테노치티틀란·필스너는 모두 3 으로 남았다. 반대 읽기("가장 깊은 단서가 요구하는 지식")라면 올라갈 후보가 있다 — 판정자가 difWhy 에 "경계 4" 로 표시한 3점 항목이 ${S.borderDir['3/경계4']}건, 이를 올리면 상이 ${new45 + S.borderDir['3/경계4']}건(${((new45 + S.borderDir['3/경계4']) / 4.9).toFixed(0)}%)으로 GEN 값과 비슷해진다. 어느 읽기가 맞는지는 판단을 맡긴다(CV-07). G004 에 쓸 값은 results.json 의 g003[ref].score.dif 와 difWhy 이고, 기준표(15 §5-1)는 건드리지 않았다.`);
W(`- (가) 판정: ok ${v.ok} · fix ${v.fix} · drop ${v.drop}. fix 비율 ${(100 * (v.fix + v.drop) / 490).toFixed(0)}% — V006 중(3) 힌트 36% 보다 낮다(GEN 이 V006 6절을 입력으로 받고 사실을 문서로 열어 썼다). 가장 많은 사유는 변형(${S.categories.variants}) · 힌트가 대표 사실/정체(famous-one ${S.categories['famous-one']}) · 힌트가 질문 되풀이(${S.categories['question-repeat']}) · 힌트 사실 오류(${S.categories['h-error']}) · 질문 사실 오류(fact-error ${S.categories['fact-error']}) · 단정어(${S.categories.assertive}).`);
W(`- 새 힌트 규칙 ①②③ (이번부터 규칙): ① 꼴만 ${S.hintRules.shapeOnly}건 · ② 정답 아닌 이름으로 유도 ${S.hintRules.wrongName}건(S1-11 호크아이 · S2-30 샤모니몽블랑 · K2-16 혼돈반; 산울림은 (다)) · ③ 같은 정답 활성 문항의 질문·해설과 같은 사실 (가) 0건. GEN 이 입력으로 받은 hint-input 덕에 (가) 에서는 거의 안 걸렸다. 반면 (다) 쌍 29 는 ${dS.verdict.fix}건이 fix 다(pair-same ${pairSame}) — V006 5-2 가 "판정하지 않고 지켜보기" 로 둔 쌍을 규칙대로 읽으니 기존 활성 힌트가 거의 다 같은 사실이었다.`);
W(`- G002 가 이미 반영한 중(3) 힌트도 규칙 눈으로 다시 보면 걸린다: 표본 50 중 fix ${nS.verdict.fix}(무작위 41 에서 ${nS.byGroup['무작위'].fix} = ${(100 * nS.byGroup['무작위'].fix / 41).toFixed(0)}%). 484 전체에 같은 비율을 적용하면 30~40건 안팎이 더 있을 수 있다(표본 41 의 오차 큼 — 전수 재판정은 하지 않았다). 의심으로 넘어온 3건(#1518 탄소 · #3630 한강 · #3817 고추)은 셋 다 fix 로 확정했다.`);
W(`- 미디어 알 가치 2 인 23건: 22 ok · 1 drop(M1-14 단밤 — '이태원 클라쓰' 는 MD10 레전드 기준에 못 미침, 경계라 CV-08). 국민 밈에 가까운 3건(M1-22 · M1-24 · M2-10)은 ok + 층만 대중으로 제안(CV-01).`);
W('- 판단을 맡기는 것: CV-07(난이도 읽기) · CV-08(미디어 레전드 경계) · CV-09("이름이 붙은/이름을 따서" 질문에서 일반어 변형을 빼는 제안 — 억울함과 B2 충돌) · CV-10(2회차를 어디까지 3-3 으로 버리나).');
W('- 하나도 DB 에 쓰지 않았다. 반영·적재는 G004 몫이다.');
W();
W('★ 원칙 메모 — 판정만 했다. DB 쓰기 0(읽기 전용 조회만) · 적재 0 · 생성 0 · 규칙/프롬프트/코드 수정 0 · 서버 기동·빌드·npm run verify 0.');
W(`  (7) 브리핑의 사실 확인 — 대상 490 · 묶음(korea 106 · life 78 · media 65 · science 65 · arts 60 · history 58 · sports 58) · 난이도 1~5 = 8/77/252/149/4 · 알 가치 2 = 23(전부 미디어) · 힌트 405(난이도 3~5 전부 · hintBasis web 405) · selfJudge 391/98/1 · 2회차 9 · facts 1,723(sources 평균 1.22) · 활성 4,143 — 파일·DB 에서 다시 세어 전부 일치. 다른 점 둘: ① 단정어 경고 98 은 항목이 아니라 **문장 히트** 98 이고 항목으로는 88건(질문·해설 기준 · 힌트까지 넣으면 109) ② g002-fixes.json 의 필드 이름은 hint 가 아니라 general_hint 이며 486행 = 중 힌트 484 + #3930 + #741 — 484 는 v006-results 의 중 힌트 대상과 일치(표본 50 도 그 안에서 뽑음). "활성 1건 — 지식 다름" 16 은 활성 DB 에서 같은 정답이 정확히 1건인 항목 16(+ 정답 표기 별칭 일치 1: K2-16 골동반 ↔ #162 비빔밥 별칭).`);
W('  (교훈 F) 보정 표본 10 → RUBRIC 고정 → 판정자 8조각(3개씩) → 직접 재독 → 사실 표본 60 → build.');

W();
W('목차');
W('0. 웹 검색·조회 · 1. 실제 판정 건수·빠진 것 · 2. 종류별 결과(2-0~2-7) · 3. fix·drop·unsure 전부 · 4. unsure·경계·미확인·알 가치 2 판정 23 · 5. 누적·중복 · 6. 반복 오류 유형 · 7. 자기 점검');

H('0. ', '웹 검색·조회 (맨 앞)');
W('- WebSearch: 쓸 수 있었다. 판정자·확인자 보고 합계 5회(j1 2 · j5 1 · j8 2) + VERIFY 직접 2회(학질 발작 간격 · 경주법주) = 7회 — 한도 100 이내, 바닥나지 않았다.');
W('- WebFetch: 주 수단. 판정자 조각(j1~j8)이 합계 약 650회, 사실 확인자(t1~t3)가 약 95회(29+38+28), VERIFY 직접 17회. GEN 이 단 url 을 열었고 검색하지 않았다. 요약 모델을 거치므로 "문서에서 못 찾음" 은 거짓이 아니라 unverified 로 두었다. 긴 영문 문서는 앞 10만 자만 읽힌 것이 있다(t1 보고).');
W('- 사용량 한도(429): 없었다 — 모델도 바꾸지 않았다(규약 16 0장). 실행 모델은 Sonnet 5.5, GEN 은 Opus 5.5 라 독립성 유지. 이번이 이 모델로 첫 라운드라 재독·웹 규칙을 더 엄하게 적용했다(7절).');
W('- 방식 변경 하나: 브리핑은 조각 150 안팎이라 했으나 웹을 여는 판정자의 문맥이 커져서 **58~82건 × 7조각 + (나)(다) 79건 1조각**으로 나눴다(호출 수는 늘었지만 한 번에 3개 이내).');

H('1. ', '실제 판정 건수 · 빠진 것');
W(`- (가) 490 전부에 verdict · categories · reason · score{dif,difWhy} · facts · proposal 이 있다(누락 0 — results.json g003 키 490, ref 유일). 판정자 출력 개수·ref 순서를 기계로 대조해 8/8 일치.`);
W(`- (나) 표본 50(고정 시드 무작위 41 + 의심 3 + 경계 6) · (다) 29 전부 판정. (나) 41 은 G002 가 바꾼 484 가운데 의심·경계 9 를 뺀 475 에서 뽑았다.`);
W(`- 못 한 것(숫자): ① 사실 — 열어 본 항목 ${factsA.openedItems + t60.items}/490 (판정자 ${factsA.openedItems} + 무작위 60 확인자), 못 연 ${490 - factsA.openedItems - t60.items}건의 GEN facts 는 "gen-web"(GEN 이 열었음 · VERIFY 미확인)으로 표시 ② 판정자 ok ${S.okJudge} 중 직접 읽은 것 ${okRead}건(경계 ${readN.border} + 판정자가 애매로 적은 ${readN.ambig} + 무작위 10% ${readN.ok10})이고 나머지는 읽지 않았다 ③ (나) 484 중 434 와 (다) 밖의 같은 정답 쌍은 판정하지 않았다 ④ 다른 활성 중·하 힌트는 목록 밖.`);
W('- 진행: 보정 표본 10 → RUBRIC 고정 → 판정자 j1~j8(웹 확인 포함) → VERIFY 가 fix·drop 전부 + 경계 99 + 애매 ok 92 + 무작위 ok 41 + (나)(다) 79 재독 → 사실 무작위 60 → 기계 검사(제안 힌트·질문) → 합침.');

H('2. ', '종류별 결과');
W('2-0. 보정 표본 10건 (교훈 F — 상 4 · 중 4 · 미디어 2) — 난이도 읽기의 예');
const calib = [
  ['K1-01 칠지도', 3, 3, '풀이에 가장 쉬운 단서 "백제 왕세자가 왜왕을 위해 만든 칼" 이 고교 한국사 본문'],
  ['K3-08 만세전', 3, 3, '이인화 귀국 여정 줄거리 — 고교 문학 근대 소설 단원'],
  ['K2-09 육계도', 3, 3, '"사주로 육지와 이어진 섬" 이 한국지리 해안 지형 정의 문장'],
  ['K1-28 승경도', 4, 4, '300칸 관직판·윤목 — 민속놀이 세부(교과 밖)'],
  ['L2-05 블루머', 4, 4, '1851 신문 \'릴리\' 운동가의 성이 이름 — 복식사 세부'],
  ['S1-19 인필드 플라이', 4, 4, '규칙 설명 → 규칙명, 야구 규칙 애호가'],
  ['S1-16 게겐프레싱', 3, 3, '독일어 압박 전술 이름, 축구를 챙겨 보는 사람(경계 4)'],
  ['H1-01 그림자 내각', 3, 3, '영국 제1야당 조직 — 고교 정치와 법'],
  ['M1-03 아즈라엘', 3, 3, '가가멜의 고양이 이름(wor 2 · MD10 스머프 레전드 ok)'],
  ['M1-09 카카로트', 3, 3, '손오공의 사이어인 본명(wor 2 · 드래곤볼 ok)'],
];
for (const c of calib) W(`  · ${c[0]}: GEN ${c[1]} → ${c[2]} — ${c[3]}. 힌트 ok.`);
W('  → 10건 모두 GEN 값과 같았고 verdict 도 전부 ok. 이 읽기로는 "이름이 흔해서 3" 이던 것이 올라가지 않는다 — 올리려면 풀이에 필요한 단서가 교과서 밖 세부뿐이어야 한다는 선을 RUBRIC 에 적었다. 결과적으로 이 선이 전체에서 3→4 를 1건만 만들었다(0절).');

W();
W('2-1. (가) 전체');
W(`- verdict: ok ${v.ok} · fix ${v.fix} · drop ${v.drop} · unsure 0 (490). 판정자 원래: ok ${S.okJudge} · fix ${Object.values(S.pieceStat).reduce((s, p) => s + (p.fix || 0), 0)} · drop ${Object.values(S.pieceStat).reduce((s, p) => s + (p.drop || 0), 0)}.`);
W('- 조각별(판정자): ' + Object.entries(S.pieceStat).map(([k, p]) => `${k} ${p.n}건 fix ${p.fix || 0}${p.drop ? '·drop ' + p.drop : ''}(${(100 * ((p.fix || 0) + (p.drop || 0)) / p.n).toFixed(0)}%)`).join(' · '));
W(`- 판정자 조각 사이의 fix 비율은 11~21% 로 V006(16~70%) 보다 고르다. 같은 모델·같은 RUBRIC 이었다.`);
W(`- 뒤집기 ${R.flipped.length}건(판정자 → VERIFY): ` + R.flipped.map((f) => `${f.ref} ${f.from}→${f.to}`).join(' · ') + `. 판정자 fix·drop 83 중 되돌림 ${R.flipped.filter((f) => f.from !== 'ok').length}(${(100 * R.flipped.filter((f) => f.from !== 'ok').length / 83).toFixed(1)}%) · 읽은 ok ${okRead} 중 올림 ${S.flipOk}(${(100 * S.flipOk / Math.max(1, okRead)).toFixed(1)}%) — 무작위 10% 표본 ${readN.ok10}건에서는 0건.`);
W('- 제안 기계 검사: 제안 힌트 checkHint 막힘 0 · 120자 이내 · 줄바꿈 없음 · 제안 질문 정답 노출·빈칸 0(단정어 경고 2 — S2-09 "모두" · S2-27 "처음" 은 출처 문장 그대로). 제안 속 새 사실 ' + `${S.propFacts.total}개 중 웹 근거 ${S.propFacts.web} · 지식 근거 ${S.propFacts.knowledge}` + '(V006 은 566 중 118).');

W();
W('2-2. 묶음별 (ok / fix / drop / unsure)');
W('| 묶음 | 건수 | ok | fix | drop | unsure | fix+drop |');
for (const t of topics) { const b = S.byTopic[t]; const n = b.ok + b.fix + b.drop + b.unsure; W(`| ${pad(t, 8)} | ${n} | ${b.ok} | ${b.fix} | ${b.drop} | ${b.unsure} | ${b.fix + b.drop} (${(100 * (b.fix + b.drop) / n).toFixed(0)}%) |`); }
W('- 사유(중복 집계, fix·drop): ' + Object.entries(S.categories).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
W(`- 힌트가 사유에 든 fix ${hintFixN}건 / 힌트 405 중 ${(100 * hintFixN / 405).toFixed(0)}%. 힌트 없는 85건(난이도 1~2)은 변형·사실·표기만 봄.`);

W();
W('2-3. 난이도 재채점 (C65 — "묻는 사실" 읽기)');
W('| 묶음 | GEN 1/2/3/4/5 | 재채점 1/2/3/4/5 | 올림 | 내림 | 같음 | 상 GEN → 재채점 |');
const d5 = (o) => [1, 2, 3, 4, 5].map((k) => o[k] || 0).join('/');
for (const t of topics) { const d = S.difByTopic[t]; W(`| ${pad(t, 8)} | ${d5(d.genDist)} | ${d5(d.newDist)} | ${d.up} | ${d.down} | ${d.same} | ${d.gen45} → ${d.new45} |`); }
W(`| 합 | ${d5(S.difGen)} | ${d5(S.difNew)} | ${upN} | ${downN} | ${sameN} | ${gen45} → ${new45} (${(gen45 / 4.9).toFixed(0)}% → ${(new45 / 4.9).toFixed(0)}%) |`);
W('- GEN→재채점 표: ' + Object.entries(matrix).sort().map(([k, n]) => `${k.replace('->', '→')} ${n}`).join(' · '));
W(`- 경계 표시(판정자 difWhy): 3점 중 "경계 4" ${S.borderDir['3/경계4']} · 3점 중 "경계 2" ${S.borderDir['3/경계2']} · 4점 중 "경계 3" ${S.borderDir['4/경계3']} · 4점 중 "경계 5" ${S.borderDir['4/경계5']} · 2점 중 "경계 3" ${S.borderDir['2/경계3']}. 한 단계 오차는 기준(5-1)이 허용한다.`);
W('- 읽기 기록(RUBRIC): ① "묻는 사실" 한 문장 ② 풀이에 필요한 가장 쉬운 충분 단서 하나 ③ 15 §5-1 표. 정답 이름의 흔함만으로 올리거나 내리지 않음. 알 가치(wor)·접근성(acc)은 GEN 값을 받았고 고친 것 0.');
W(`- 힌트와 난이도: 재채점 뒤 난이도 3 이상인데 힌트 없는 것 ${S.noHintNeeded.length}건(${S.noHintNeeded.map((x) => x.ref + ' ' + x.answer + ' 난이도 ' + x.dif).join(', ')} → 힌트 제안 있음) · 난이도 2 이하로 내렸는데 힌트가 있는 것 ${S.hintExtra.length}건(${S.hintExtra.map((x) => x.ref).join(' ')}) — 15 H0 는 3~5 에 의무, 하(1~2)는 보류이므로 G004 가 두거나 비울지 정한다.`);

W();
W('2-4. 사실 (B)');
W(`- 열어 본 항목: 판정자 ${factsA.openedItems} (웹 확인 미리 정한 287 + 재채점 4~5 가 된 항목 + 의심 항목) + 무작위 60 = ${factsA.openedItems + t60.items}/490. 재채점 4~5 ${new45}건은 **전부** 열었고 미리 표시한 287(경계 98 · 단정어 88 · dbCheck 17 · 2회차 9 · GEN 4~5 153 의 합집합)도 전부 열었다. 못 연 ${490 - factsA.openedItems - t60.items}건은 result "gen-web".`);
W(`- 주장 ${factsA.claims}(판정자, 질문·해설·힌트): 참 ${factsA.true} · **틀림 ${factsA.false}** · 미확인 ${factsA.unverified} · 웹 근거 ${factsA.web} · 지식 근거 ${factsA.knowledge}. 틀림 ${factsA.false}건은 모두 fix 에 반영: ` + S.falseList.map((f) => `${f.ref}[${f.where}] ${cut(f.claim, 40)}`).join(' · '));
W(`- ★ 열지 않은 항목 111 중 무작위 60(고정 시드)을 확인자 3개가 열었다: 주장 ${t60.claims} → 참 ${t60.tally.true} · 거짓 ${t60.tally.false} · 미확인 ${t60.tally.unverified}. **GEN 확인의 오류율 0%** (3% 이내라 범위를 넓히지 않음). 미확인 ${t60.tally.unverified}건은 4절.`);
W(`- 위치 한 가지: 틀림 9 중 7 은 **질문** 속 보조 서술(연도·하사 시점·'합쳐'·'들여오려다'·'가장 흔한')이었다 — GEN 이 문서를 열었어도 문장이 문서와 글자 단위로 안 맞는 꼴.`);

W();
W('2-5. 힌트 405 (사유별)');
const hintCats = ['famous-one', 'question-repeat', 'h-error', 'wrong-name', 'explain-overlap', 'letters', 'meaning', 'spoon-feed', 'weak', 'pair-same', 'shape-only', 'shape', 'alias'];
W(`- 힌트 405 중 힌트를 사유로 fix 한 것 ${hintFixN}건. 사유: ` + hintCats.map((c) => `${c} ${S.categories[c] || 0}`).join(' · '));
W(`- 새 규칙 ①(꼴만) ${S.hintRules.shapeOnly} · ②(정답 아닌 이름으로 유도) ${S.hintRules.wrongName} · ③(같은 정답 다른 활성 문항의 질문·해설) 0. 기계 경고 explain 42 는 읽어 보니 낱말 우연 겹침이 대부분이었고 실제 같은 사실은 explain-overlap ${S.categories['explain-overlap'] || 0}건.`);
W('- 힌트 글자 꼴 점검: 405개 힌트에서 글자 수·자릿수·언어를 말하는 표현 정규식(글자·자릿수·외자·영어/한자어/라틴어 낱말…) 11건 — 전부 사실 서술이거나(호우명 그릇 밑면 글자 수 등) 두 번째 줄 사실과 함께였고 꼴만으로 된 것은 0.');

W();
W('2-6. (나) G002 가 바꾼 중 힌트 표본 50');
W(`- 50 전부 판정: ok ${nS.verdict.ok} · fix ${nS.verdict.fix}. 무작위 41: ok ${nS.byGroup['무작위'].ok} · fix ${nS.byGroup['무작위'].fix} / 의심 3: fix 3 / 경계 6: ok ${nS.byGroup['경계'].ok} · fix ${nS.byGroup['경계'].fix}.`);
W(`- after 가 before 보다 나은가: better ${avb.better || 0} · same ${avb.same || 0} · worse ${avb.worse || 0}. same 6 은 전부 fix(#1156 탈레스 · #3055 표본 · #3628 창원시 · #1518 탄소 · #3630 한강 · #3817 고추) — 옛 힌트의 "가장 유명한 것" 꼴이 다른 "가장 유명한 것" 으로 바뀌었을 뿐이었다. #603 허수단위만 better 이면서 fix.`);
W('- 의심 3 (G002 5절): #1518 탄소 — fix(원자 번호 6·14족은 수헬리베붕탄질산플네로 외운 값, 보통 성인이 바로 "탄소") · #3630 한강 — fix(1950.6.28 인도교 폭파는 한강의 대표 사건) · #3817 고추 — fix(스코빌 지수 = 고추, 질문의 "매운맛" 되풀이이기도). 셋 다 제안은 두 번째 줄 사실이며 웹 근거 있음.');
W('- 경계 6: #603 허수단위 fix(복소수 정의·세로축 눈금 — 고교 수학을 기억하면 바로 "허수") · #791 지명타자 ok(1982 KBO·오타니 규칙, 오타니 규칙을 아는 사람만 바로) · #870 굳히기 ok(한판 20초·항복 규칙, 유도를 모르면 안 나옴) · #3583 콩팥 ok(오른쪽이 간에 눌려 낮음·네프론 100만) · #3792 칸트 ok(『영구 평화를 위하여』·『계몽이란 무엇인가』는 "다른 작품" = 두 번째 줄 사실; 같은 정답 #1832 의 힌트와 책이 겹침) · #3996 루이 14세 ok(낭트 칙령 폐지 — 칙령→왕 한 걸음). CV-05(V006 선 유지)와 같은 선으로 갈랐다.');
W(`- 표본 오류율로 읽으면: 무작위 41 의 fix ${nS.byGroup['무작위'].fix}(7%)는 V006 판정이 낸 "484 개선" 의 잔여 문제 비율의 근사다.`);

W();
W('2-7. (다) 같은 정답 쌍 ok 쪽 29');
W(`- 29 전부 판정: fix ${dS.verdict.fix} · ok ${dS.verdict.ok}(#508 안나 카레니나 · #1323 모나코 · #2026 일리아스). fix 사유: pair-same ${pairSame}(다른 쪽 질문·해설과 같은 사실) · h-error 1(#916 고종 — 정관헌 "휴식 공간" 은 문서에 근거 없음) · famous-one 1(#509) · meaning+wrong-name 1(#2965 산울림 — "산에서 소리가 되돌아오는 현상" = 메아리) · letters+meaning 1(#639).`);
W('- G002 가 "구절 겹침 22건" 으로 센 것은 대부분 실제로 같은 사실이었다(예: #1159 스토아 학파 — 힌트가 #3790 질문과 글자까지 같음 · #473 오이디푸스 · #1053 공무도하가 · #1211 우드스톡 · #3378 에반게리온).');
W('- 쌍의 두 힌트끼리(질문·해설이 아니라 힌트↔힌트) 같은 문장인 것은 규칙 ③ 밖이라 ok 로 두고 5절에 적었다.');

// ── 3
H('3. ', '고칠 것(fix) · 버릴 것(drop) · unsure 전부 — 현재 / 제안 / 사유 한 줄 / 출처');
W(`※ (가) fix ${v.fix} + drop ${v.drop} + unsure 0, (나) fix ${nS.verdict.fix}, (다) fix ${dS.verdict.fix}. ok 는 results.json 에만 있다. 질문·해설·힌트·변형 가운데 **바뀌는 것만** 적는다.`);
W();
W('3-1. (가) G003 490 — fix · drop');
const srcOf = (g) => { if (g.proposalSource) return g.proposalSource; const pf = (g.facts || []).find((f) => f.proposal && f.source); if (pf) return pf.source; const ff = (g.facts || []).find((f) => f.result === 'false' && f.source); if (ff) return ff.source; const wf = (g.facts || []).find((f) => f.source); return wf ? wf.source : '지식 근거'; };
const order = Object.keys(G).filter((r) => G[r].verdict !== 'ok').sort((a, b) => (G[a].topic === G[b].topic ? (a < b ? -1 : 1) : topics.indexOf(G[a].topic) - topics.indexOf(G[b].topic)));
for (const ref of order) {
  const g = G[ref]; const x = items.get(ref); const p = g.proposal;
  W(`- ${ref} ${x.answer} [${g.topic}/${x.sub}] ${g.verdict.toUpperCase()} ${g.categories.join(',')} — ${cut(g.reason, 230)}`);
  if (g.verdict === 'drop') { W(`    현재 질문: ${cut(x.question, 200)}`); }
  if (p.question) { W(`    현재 질문: ${one(x.question)}`); W(`    제안 질문: ${one(p.question)}`); }
  if (p.explanation) { W(`    현재 해설: ${one(x.explanation)}`); W(`    제안 해설: ${one(p.explanation)}`); }
  if (p.hint) { W(`    현재 힌트: ${one(x.hint)}`); W(`    제안 힌트: ${one(p.hint)}`); }
  if (p.dropHint) { W(`    현재 힌트: ${one(x.hint)}`); W('    제안: 힌트를 비운다(재채점 난이도 2 — 15 H0 보류 대상)'); }
  if (p.variants) { W(`    현재 변형: ${x.variants.join(' | ') || '(없음)'}`); W(`    제안 변형: ${p.variants.join(' | ') || '(없음)'}`); }
  if (p.layer) { W(`    제안 층: ${p.layer}`); }
  if (g.verdict === 'fix' && !p.question && !p.explanation && !p.hint && !p.variants && !p.dropHint && !p.layer) W('    (제안 문구 없음 — 사유 참고)');
  W(`    출처: ${srcOf(g)}`);
}
W();
W('3-2. (나) G002 표본 50 — fix 7');
for (const r of Object.values(R.g002Sample).filter((r) => r.verdict === 'fix')) {
  const x = s50.get(r.id);
  W(`- #${r.id} ${x.answer} [${r.group}] FIX ${(r.categories || []).join(',')} — ${cut(r.reason, 200)}`);
  W(`    현재 힌트(DB): ${one(x.after)}`); W(`    제안 힌트: ${one(r.proposal.hint)}`);
  W(`    출처: ${r.proposalSource || (r.facts || []).find((f) => f.proposal && f.source)?.source || (x.g002sources || [])[0] || '지식 근거'}`);
}
W();
W('3-3. (다) 같은 정답 쌍 ok 쪽 29 — fix ' + dS.verdict.fix);
for (const r of Object.values(R.pairs29).filter((r) => r.verdict === 'fix')) {
  const x = p29.get(r.id);
  W(`- #${r.id} ${x.answer} [${x.pairIds.join('↔')}] FIX ${(r.categories || []).join(',')} — ${cut(r.reason, 200)}`);
  W(`    현재 힌트(DB): ${one(x.hint)}`); W(`    제안 힌트: ${one(r.proposal.hint)}`);
  W(`    출처: ${r.proposalSource || (r.facts || []).find((f) => f.proposal && f.source)?.source || (r.facts || []).find((f) => f.source)?.source || '지식 근거'}`);
}

// ── 4
H('4. ', 'unsure · 경계선 · 미확인 주장 · 미디어 알 가치 2 판정 23');
W('4-0. unsure 0. 아래는 판단이 갈린 것(어느 쪽으로 갈랐는지).');
W('- 경계 4(난이도 3↔4 읽기): 3점 중 "경계 4" ' + S.borderDir['3/경계4'] + '건(CV-07) — results.json difWhy 의 "경계 4".');
W('- 변형 제거 제안 중 애매(CV-09): C1-26 랑게르한스섬(췌도·이자섬 제거) · C1-28 유스타키오관(이관 제거) · C2-21 벨크로(찍찍이 제거) · H1-05 과잉금지 원칙(비례의 원칙 제거) · H2-24 암리차르 학살(잘리안왈라 바그 제거). 모두 질문이 "이름을 따서/이름이 붙은/도시 이름으로 불리는" 을 요구해 일반어는 B2 로 뺐지만, 일반어를 친 사람이 억울할 수 있다. 질문 한정을 푸는 쪽이 대안.');
W('- C2-05 메탄 하이드레이트: 질문이 "천연가스" 라 "가스 하이드레이트"(더 넓은 말, B7)도 답이 될 수 있다 — 변형에 넣지 않고 힌트만 fix. 질문에서 한정을 더하면 정답 조각("메탄")이 노출돼 못 고침. G004 가 질문을 다시 써야 한다.');
W('- H2-06 DSM: 판정자는 DSM-5·DSM5 변형을 B7 로 빼라 했으나 질문이 "2013년 판에서 … 이 편람" 이라 DSM-5 도 정답으로 받아야 억울하지 않다 → ok 로 되돌림.');
W('- 2회차 3-3: A2-01 허클베리 핀 — 판정자 drop → fix(짐 단서를 빼고 평 자체로 묻기, 그래도 같은 사실로 보이면 G004 가 버림) · L1-26 스도쿠·L2-21 쌀국수 drop(CV-10) · L1-27 하노이의 탑·L1-33 율리우스력·S2-17 평영·K2-19 깍두기 등은 새 사실이 있어 ok.');
W('- 힌트 H9 경계로 ok 로 둔 것(보통 성인이 바로 닿지는 않으나 아는 사람은 바로): K1-19 조봉암(초대 농림부 장관) · K2-14 서천(국립생태원) · K3-09 생강나무 · S1-03 스로인 · S2-04 세인트앤드루스(fix: 변형) · A1-19 세뇨 · L2-31 스와힐리어 · H1-22 델로스 동맹 · H2-12 다비 · P4-16 동거정부 · #791 지명타자 · #3792 칸트 · #3996 루이 14세.');
W();
W('4-1. 미디어 알 가치 2 판정 23 (15 §5-2 예외 — MD10 작품의 무게 + MD2 팬 세부 + MD11)');
for (const w of S.wor2) W(`- ${w.ref} ${w.answer} (${w.work}, 층 ${w.layer}): ${w.ref === 'M1-14' ? 'DROP — 알 가치 예외 밖: 이태원 클라쓰 는 MD10 레전드 기준에 못 미침(CV-08)' : ['M1-22', 'M1-24', 'M2-10'].includes(w.ref) ? '알 가치 ok, 국민 밈에 가까워 층만 대중으로 제안(CV-01)' : '알 가치 ok (레전드 작품의 팬 세부)'}${w.verdict === 'fix' ? ' · 다른 사유로 FIX(3절)' : ''}`);
W('  → 22 ok · 1 drop. 경계로 ok 둔 것: M1-13 애봉이(마음의 소리) · M1-21 이영호(스타 프로리그 선수) · M2-09 순정마초 · M2-19 카시오페아(CV-08).');
W();
W('4-2. 미확인 주장 (unverified) — 판정자 ' + S.unverifiedList.length + ' + 무작위 확인자 ' + t60.tally.unverified);
for (const u of S.unverifiedList) W(`- ${u.ref}[${u.where}] ${cut(u.claim, 90)} (${u.basis})`);
for (const u of t60.unverifiedList) W(`- ${u.ref}[${u.where}] ${cut(u.claim, 90)} (확인자: ${cut(u.note, 60)})`);
W('  → 미확인은 거짓이 아니다(요약 모델을 거쳐 문서에서 못 찾음 · 인과·세부 표현). ok 항목의 미확인 ' + S.unverifiedList.filter((u) => G[u.ref].verdict === 'ok').length + '건은 사실로 보되 G004 가 적재 전 한 번 더 열면 좋다.');
W();
W('4-3. 웹으로 못 닫은 제안 문구');
const kn = Object.entries(G).flatMap(([ref, g]) => (g.verdict === 'ok' ? [] : (g.facts || [])).filter((f) => f.proposal && f.basis !== 'web').map((f) => `${ref}: ${cut(f.claim, 80)}`));
W('- 제안 속 새 사실 중 지식 근거: ' + (kn.length ? kn.join(' ; ') : '없음') + '. #3678 가시리 제안은 VERIFY 가 ko 위키 문장으로 교체(웹 근거).');
W('- K1-07 별무반 제안(연호군=노비 · 상인·평민 지원 부대)은 en 위키 근거이고 ko 위키에는 없다 — 출처 약함, G004 가 한 번 더.');

// ── 5
H('5. ', '같은 정답 누적 · 같은 지식 중복');
W(`- 누적(활성 4,143 + 이번 490): 정답 하나당 문항 수 1건 ${S.cumulative.distActivePlusThis['1']} · 2건 ${S.cumulative.distActivePlusThis['2']} · **3건 이상 0** (이번 490 안에 같은 정답 0). 2건인 16 은 활성 1건과 같은 정답: ` + S.dbCheck16.map((d) => `${d.ref} ${d.answer}(#${d.activeId}) ${d.verdict}`).join(' · '));
W('- 16 중 같은 지식으로 본 것: A2-01 허클베리 핀(→fix) · L1-26 스도쿠 · L2-21 쌀국수(→drop) · L1-24 모노폴리(→fix, 1회차 해설과 같은 파커 1935 단서 제거). 나머지 12(에베레스트 · 깍두기 · 노랑 · 하노이의 탑 · 율리우스력 · 집 · 시드니 · 사라예보 · 평영 · 악셀 · 줄다리기 · 시드니 오페라 하우스[힌트 누락 fix])는 지식이 달라 ok.');
W('- 정답 표기 별칭 일치 1: K2-16 골동반 ↔ 활성 #162(비빔밥)의 별칭 — 답이 다르고 지식도 다름.');
W('- 눈에 띈 같은 지식 후보(기계 스캔: 활성 질문에 이번 정답이 낱말로 들어 있고 글이 30% 이상 겹침) 5: ' + S.dupscan.map((d) => `${d.ref} ${d.answer} ↔ #${d.id} ${d.activeAnswer}`).join(' · ') + ' — 읽어 보니 **서로의 정답을 질문 단서로 쓰는 쌍**(상대 문제를 본 사람에게 이쪽 정답이 새는 꼴)이지 같은 지식은 아니다. 한 판에 같이 나올 수 있어 G004 가 알아 두면 좋다.');
W('- 쌍의 힌트↔힌트 같은 문장(규칙 ③ 밖): #3679↔#1734(글자까지 같음 · 2·8 독립선언서) · #1323↔#3942(그리말디 가문 공국) · #509↔#4013(피쿼드호) · #3706↔#1064 · G002 가 적은 8쌍(#1065↔#3707 …). 한쪽만 쓰게 하는 편이 낫다.');
W('- 활성 문항 쪽 참고(목록 밖): #2188 악셀 힌트가 S2-23 의 질문과 같은 사실 · #3557 마리오 질문 "창고의 집주인" 은 위키(세갈레는 사무실 집주인)와 어긋남(j8 보고) · #1211 / #3842 우드스톡은 G002 가 이미 고침.');

// ── 6
H('6. ', '반복되는 오류 유형 — deep-v3 · media-v2 · hint-v3 에 되돌려 줄 꼴');
W('※ V006 6절 10꼴과 같은 꼴은 "같다" + 건수. 건수는 중복 집계.');
W(`1) 변형 — 흔한 한국 표기 누락(크로와상 · 비리야니 · 퀸즈베리 룰 · 세인트앤드류스 · 벵갈어 · 10종경기 · 부울) ${S.categories.variants}건 중 12 안팎. 반대로 질문이 "이름을 따서/이름이 붙은" 을 요구하는데 일반어를 변형에 넣은 꼴 5(이관 · 췌도 · 찍찍이 · 비례의 원칙 · 잘리안왈라 바그). → media-v2/deep-v3 의 변형 목록 만들기에 "한국에서 실제로 치는 표기 3종을 검색해 확인" 과 "질문이 요구하는 표현과 변형이 같은 종류인지" 를 넣는다(B2).`);
W(`2) 질문 속 보조 서술이 출처와 글자 단위로 안 맞음 — fact-error ${S.categories['fact-error']} + assertive ${S.categories.assertive}: 하사 연도 · "들여오려다/들여와 팔다가" · "합쳐/곱해" · "가장 흔합니다" · "처음 그렸습니다" · "금보다 비쌌던". → GEN 이 facts[] 에 쓴 주장 요약은 맞는데 질문 문장은 더 단정적으로 쓰인다. "질문 문장의 숫자·연도·동사를 facts note 와 글자 단위로 대조" 를 쓰는 순서에 넣는다(3-2).`);
W(`3) 힌트가 그 대상의 가장 유명한 사실/정체(V006 1번, 같다) ${S.categories['famous-one']}건 — 대표 팀(NC·LG 연고) · 대표 사건(푸틴 영장 · 인도교 폭파) · 정의(14족 6번 · 복소수 · 스코빌) · 대표 일화(피라미드 그림자). 두 번째 줄 사실로.`);
W(`4) 힌트가 질문 되풀이(V006 4번, 같다) ${S.categories['question-repeat']}건 — 질문의 인물·사건을 날짜·장면으로 다시 말함(최척전 · 동동 13연 · 모수자천 · 별무반 · TMV 1935). (다) 에서는 "다른 쪽 질문" 을 되풀이하는 꼴(pair-same)이 ${pairSame}건 — hint-input 이 있었는데도 기존 활성 문항에는 적용 전이었다.`);
W(`5) 힌트 사실 오류 ${S.categories['h-error']}건 — "군청이 있던" · "1950년대 침팬지" · "18세기 하와이 신문" · "자식을 모두" · "1학년 때" · 처칠(→잭 런던). 힌트의 연도·소속·'모두' 는 hintSources 를 열어 글자 대조.`);
W(`6) 정답 노출 ${S.categories.expose}건 — 질문 속 풀이/조각: "두 물이 어우러진다는 뜻"(아우라지) · "빨리 승부를"(승부치기) · "그랜드 슬램"(골든 슬램). answerFragments 경고 66 중 실제 노출은 3.`);
W(`7) 정답 아닌 이름으로 유도(새 규칙 ②) ${S.hintRules.wrongName}건 — 호크아이 · 샤모니몽블랑 · 혼돈반; (다) 산울림(메아리). 힌트가 특정 업체·옛 이름·유의어로 흐르는 꼴.`);
W(`8) 2회차 3-3 ${S.categories['pair-3-3']}건 — 1회차 질문의 단서(짐 · 파커 1935 · 숫자 퍼즐 · 베트남 소고기 국수)를 2회차가 그대로 끌어옴.`);
W(`9) 해설 단정/인과 ${S.categories.explanation}건 — "어릴 적" · "처음" · "질책으로 빠짐" · "2집용으로 만들어졌던".`);
W('10) (좋은 점) 새 규칙 ① 꼴만 0 · ③ (가) 0 · 미디어 알 가치 2 는 23 중 22 가 MD10 통과 — GEN 이 15 §4-1·§5-2 를 잘 지켰다. 사실 확인(웹 열기)을 생성 단계에 넣은 효과: 열지 않은 항목 무작위 60 의 오류 0.');

// ── 7
H('7. ', '자기 점검');
W(`- 실행 모델 Sonnet 5.5(첫 라운드). 판정자 8조각·확인자 3개도 같은 모델 — GEN(Opus 5.5)과 달라 독립성은 유지. 그래서 재독·웹 규칙을 엄하게 적용했다.`);
W(`- 직접 재독 ${readN.total}/490 (+(나)(다) 79 전부): fix·drop ${readN.nonok}(전부) · 경계 ok ${readN.border}(selfJudge 경계 98 + 나쁜 어려움 의심 1 전부) · 판정자가 애매로 적은 ok ${readN.ambig} · 무작위 ok 10% ${readN.ok10} · override 2. **뒤집기**: 판정자 fix·drop 83 중 ${R.flipped.filter((f) => f.from !== 'ok').length}(3.6%) 되돌림, 읽은 ok ${okRead} 중 ${S.flipOk}(0.9%) 올림, 무작위 ok 10%(${readN.ok10})는 0 — 10% 를 넘지 않아 ok 전체 재독은 하지 않았다.`);
W(`- 읽지 않은 ok: 판정자 ok ${S.okJudge} 중 약 ${S.okJudge - (okRead)}건(표본·경계·애매에 안 든 것). 그중 사실은 판정자가 웹으로 열었거나 gen-web.`);
W(`- (나)(다): fix 는 전부 읽었고 ok 는 (나) 무작위 38 전부와 의심·경계 · (다) ok 3 전부 읽음. 제안 힌트 새 사실은 웹 근거(${S.propFacts.web}/${S.propFacts.total}); VERIFY 가 판정자 제안 4건(#3678 · K1-24 · K3-05 · K3-20)을 문서 문장으로 교체했다. 판정자 제안 K3-20 의 "'직' 이라 부르며 횟수" 는 웹으로 못 닫아 철회했다.`);
W('- 교훈 A 인용은 입력에서 가져왔다 · B 세기만으로 fix 한 것은 없다(판정 문장에 걸릴 때만) · C 같은 정답은 묶어 읽었다(16 + 쌍 29) · D 못 한 것을 숫자로(1절) · E 판정자 ok 는 표본·경계·애매 재독 · F 보정 표본 10 · G blind 칸은 쓰지 않았다.');
W(`- 표본으로만 본 영역: 사실 ${490 - factsA.openedItems - t60.items}건은 gen-web · ok 의 나머지 · (나) 484 중 434.`);
W('- 한계: 난이도 읽기는 내 해석(0절)이고 판정자 difWhy 에 경계 표시를 남겨 두었다. 변형 제안 일부는 억울함(§2 기준)과 B2/B7 이 충돌한다(CV-09). 한국 표기 빈도는 검색 없이 지식으로 적은 변형이 있다(크로와상 · 퀸즈베리 룰 등) — G004 가 반영 전에 한 번 더 확인.');
W('- DB 는 읽기 전용(대조·누적 집계)만 썼다. 제안 문구에 줄바꿈 없음(기계 확인) · 제안 힌트 checkHint 막힘 0.');

W();
W('새로 생긴 결정 필요 항목');
W(`- CV-07 — 난이도 "묻는 사실" 읽기(C65): "풀이에 필요한 가장 쉬운 충분 단서" 로 읽으면 상 ${gen45}→${new45}, "가장 깊은 단서가 요구하는 지식" 으로 읽으면 3점 중 경계4 ${S.borderDir['3/경계4']}건이 올라 ${new45 + S.borderDir['3/경계4']} 근처. 어느 쪽을 15·score-v1 에 한 줄로 적을지. (설계 에이전트·찬종)`);
W('- CV-08 — 미디어 알 가치 2 "레전드" 선: M1-14 단밤(이태원 클라쓰) drop · 경계 ok 4(M1-13 · M1-21 · M2-09 · M2-19). 한국 히트작(드라마·웹툰)을 레전드로 칠지.');
W('- CV-09 — 질문이 "이름을 따서/이름이 붙은/도시 이름으로 불리는" 을 요구할 때 일반어(이관 · 췌도 · 찍찍이 · 비례의 원칙 · 잘리안왈라 바그)를 변형에서 빼는 제안 5건. B2 를 지키면 억울한 오답, 풀어 주면 질문 한정이 약해진다 — 어느 쪽 기본값으로 둘지.');
W('- CV-10 — 2회차 3-3: 새 사실이 있어도 "범주 단서만으로 풀리는" 2회차(L1-26 스도쿠 · L2-21 쌀국수)를 drop 으로 보았다. D6(애매하면 살린다)과 충돌 — 난이도 1 이라 상 목표에 쓸모가 적다는 점까지 고려해 drop 했으나 선 확인.');
W();
W('고친 문서');
W('- ai-out/V007.txt (이 문서) · data/pipeline/audit/v007-results.json · data/pipeline/audit/v007-raw/ (RUBRIC · RUBRIC-N · 조각 j1~j8 · 확인 t1~t3 · STATE · _work/) · docs/13-PENDING-CHECKS.md (C64 · C63 (2) · C65 · CV-07~10) · ai-out/README.md (V 표 V007)');

fs.writeFileSync('C:/work/quiz-web/ai-out/V007.txt', L.join('\n') + '\n');
console.log('lines', L.length, 'chars', L.join('\n').length);
