// V010 보고서 생성 — ai-out/V010.txt
import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const R = JSON.parse(fs.readFileSync(A + '/v010-results.json', 'utf8'));
const S = R.stats, I = R.items, all = Object.values(I), r2 = R.rater2, P = S.pool, RR = R.reread;
const one = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const pc = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
const L = []; const p = (...a) => L.push(...a);
const kept = S.keptTop;
const topics = ['media', 'arts', 'sports', 'life', 'korea', 'history', 'science'];
const g6 = Object.values(R.g006Gen);

p('===========================================', 'ROUND: V010', 'DATE: 2026-10-17', 'TASK: 기존 활성 상(4~5) 608 blind 재채점 — 같은 읽기(V007·V009)로 상 풀을 맞춘다 + G006 에서 GEN 이 직접 쓴 힌트 14 판정. 반영은 다음 GEN 라운드', 'STATUS: 완료', '===========================================', '');
p('[cmd 창 요약]');
p(`1. 활성 상 608(score-v1) blind 재채점: 상 유지 ${kept}(${pc(kept, 608)}) · 3 이하로 내림 ${S.matrix['4→3'] + S.matrix['4→2'] + S.matrix['5→3']}(4→3 ${S.matrix['4→3']} · 4→2 ${S.matrix['4→2']} · 5→3 ${S.matrix['5→3']}) + 5→4 ${S.matrix['5→4']} · 올림 0 — 5 는 한 건도 안 나왔다(옛 5 가 26 → 25 가 4 로).`);
p(`2. 적용하면 상 풀 = g003 110 + 유지 ${kept} = ${P.withoutG005} → 50문제 상만 ${P.playsWithoutG005}판(지금 718 → 14판). G005 blind 상 ${P.g005Blind} 를 더하면 ${P.withG005} → ${P.playsWithG005}판.`);
p(`3. 안정성: 조각별 상 비율 ${Math.min(...Object.values(S.perPiece).map((x) => x.judgePct))}~${Math.max(...Object.values(S.perPiece).map((x) => x.judgePct))}%(V009 는 26~47%) · 두 번째 채점자 120건 상/상 아님 일치 ${r2.topAgree}/120(${pc(r2.topAgree, 120)}) · 정확 일치 ${r2.exact}/120 · 첫 판정자 상 ${r2.judgeTop} vs r2 ${r2.rater2Top}.`);
p(`4. 재독 ${RR.read}(내림 무작위 20% ${RR.down20} + 갈린 ${RR.split}): 무작위 내림 ${RR.down20} 은 바뀐 것 0, 갈린 ${RR.split} 중 ${RR.changedTotal}건을 VERIFY 가 값을 바꿔 정함(→3 ${RR.directions.jTo3} · →4 ${RR.directions.jTo4}).`);
p(`5. (나) G006 GEN 힌트 14: ok ${g6.filter((g) => g.verdict === 'ok').length} · fix ${g6.filter((g) => g.verdict === 'fix').length} (판정자는 #3990 을 fix 로 봤으나 VERIFY 가 DB 를 직접 읽어 ok 로 뒤집음) · worse 0. 산출물 ai-out/V010.txt · v010-results.json · v010-raw/ · 13 CV-18~ · README. DB 쓰기 0 · 429 없음.`);
p('');
p('0. 찬종이 볼 것');
p(`- ★ 이 라운드는 "상만" 판의 크기를 가장 크게 줄인다: 활성 상 718(= g003 110 + 이번 608) 가운데 이번 608 이 같은 읽기(가장 쉬운 충분 단서)로 다시 매겨지니 상으로 남는 것은 ${kept}(${pc(kept, 608)})뿐이다. 반영하면 상 풀은 ${P.withoutG005}, 50문제 상만 판은 14 → ${P.playsWithoutG005}판(G005 blind 상 ${P.g005Blind} 가 들어가면 ${P.playsWithG005}판). 전체 4,630 문제나 중+상 풀은 거의 그대로다(상이 중으로 내려갈 뿐이라 중+상 풀 수는 변하지 않는다 — 3 이상 ${all.filter((x) => x.dif >= 3).length}/608).`);
p(`- 내린 꼴은 V007·V009 와 같다: 질문 한 문장이 교과서 정의·사전 뜻풀이·대표 설명이면 3 이하(예: "선입후출 방식 자료구조" 스택 · "오케스트라 조율 기준음 겹리드 악기" 오보에 · "고대 로마 시민이 입던 통옷" 토가). 상으로 남은 것은 취미 영역의 세부(영화·축구·애니·건축 애호가: 카이저 소제 · 헤이젤 참사 · 참월 · 플라비우스 원형극장).`);
p(`- 묶음별 유지: media ${S.byTopic.media.keep}/${S.byTopic.media.n}(${S.byTopic.media.pct}%) · arts ${S.byTopic.arts.keep}/${S.byTopic.arts.n}(${S.byTopic.arts.pct}%) · sports ${S.byTopic.sports.keep}/${S.byTopic.sports.n}(${S.byTopic.sports.pct}%) · life ${S.byTopic.life.keep}/${S.byTopic.life.n}(${S.byTopic.life.pct}%) · history ${S.byTopic.history.keep}/${S.byTopic.history.n}(${S.byTopic.history.pct}%) · korea ${S.byTopic.korea.keep}/${S.byTopic.korea.n}(${S.byTopic.korea.pct}%) · science ${S.byTopic.science.keep}/${S.byTopic.science.n}(${S.byTopic.science.pct}%). 옛 라운드(2026-09 의 legacy 374)는 30.5% · r030g/n(10-02 심화) 45%/40% · g001 71% — 최근 생성일수록 상이 많이 남는다(생성 지시가 점점 "쉬운 단서를 빼라" 쪽으로 바뀐 영향).`);
p(`- 5 단계가 사라진다: 현재 5 인 26 건은 25 → 4 · 1 → 3 이고, 판정자 둘 다 5 를 한 번도 주지 않았다(CV-19). 상 = 4 만 남는다는 뜻이다.`);
p(`- 판단을 맡기는 것: CV-18(적용 여부·범위 — 정말 608 전부 이 값으로 DB 를 바꿀지, "두 채점자가 모두 4" 인 것만 상으로 칠지) · CV-19(5 단계를 앞으로 어떻게 쓰나) · CV-20(유일성 의심 note 13건 — 난이도 라운드라 fix 판정 안 함).`);
p('');
p('★ 원칙 메모 — 판정만 했다. DB 쓰기 0(읽기 전용 조회만) · 난이도·힌트 고치기 0 · G005·G007 적재분 판정 0 · 문항 fix/drop 판정 0(note 만) · 규칙/프롬프트/코드 수정 0 · 서버 기동·빌드 0.');
p(`  (7) 브리핑의 사실 확인 — 활성 4,630 · 활성 상(4~5) 718(4: 582+g003 · 5: 26) · g003 상 110 · 대상 608(= 718 − 110, score-v1 전부, g005 행 0) · 14 가 g006-fixes by=gen 의 id 와 같다 · 그 14 의 DB 힌트 = g006-fixes after — 전부 일치. 다른 점 없음. 대상 목록은 시작할 때 한 번 떠서 \`v010-raw/targets-ids.json\`(608 id)으로 고정했다 — G007 이 도중에 g005 행을 넣어도 이 목록이 기준.`);
p('  (교훈 F) 보정 표본 12(오래된 짧은 한 문장 질문 꼴 포함 — 스택 · 올리브 · 홍루몽 · 대금 · 제비 · 군주 …) → RUBRIC 고정 → 판정자 8조각(2개씩) → 두 번째 채점자 120 → 직접 재독 → build.');
p('  (V009 피드백) 경계 예를 12건으로 더 촘촘히 잡고 `edge` 를 30% 이하로 아끼게 했다 — 조각별 상 비율 차이를 2절에.');
p('');
p('목차', '0. 웹 · 1. 건수·빠진 것 · 2. 결과 · 3. 내림·올림 전부 · 4. 경계·note·갈림 · 5. 유일성 의심 · 6. 반복되는 꼴 · 7. 자기 점검', '');

p('=====================================================================', '0. 웹 검색·조회 (맨 앞)', '=====================================================================');
p('- WebSearch/WebFetch: 쓸 수 있었다. 이번 (가)는 난이도 읽기라 판정자 8조각·r2 는 웹을 한 번도 쓰지 않았고(0회), (나) 판정자 h1 이 WebFetch 18회·WebSearch 0회(자기 보고), VERIFY 직접 WebFetch 0회 · WebSearch 0회 — 한도 20회 이내. 429 없음 · 모델을 바꾸지 않았다(Sonnet 5.5; GEN 은 Opus 5.5).');
p('- 방식 변경: 브리핑은 조각 75~80(8조각) — 그대로(76×8). 입력이 항목당 약 0.35KB(질문·정답·해설만)라 V009 와 달리 조각이 작아 판정자 3개를 쓰지 않고 브리핑의 "한 번에 2개" 로 5판에 나눠 돌렸다.');
p('');

p('=====================================================================', '1. 실제 판정 건수 · 빠진 것', '=====================================================================');
p(`- (가) 608 전부(누락 0 · results.json items 키 ${Object.keys(I).length}, id 유일). 판정자 출력의 개수·id 순서를 입력과 기계로 대조해 8/8 일치. 두 번째 채점자 r2 120(조각당 15, 시드 고정) 대조 일치. (나) 14 전부(g006Gen 키 14).`);
p(`- 못 한 것(숫자): ① 내림 ${RR.down} 중 직접 읽은 것 ${RR.down20}(무작위 20%) + 갈린 ${RR.split} — 나머지 내림 ${RR.down - RR.down20 - RR.split + (RR.down20 && 0)} 는 판정자 값 그대로 ② 두 번째 채점자는 120(20%)뿐 — 나머지 488 은 판정자 한 명의 값 ③ 질문 정답 유일성·사실은 보지 않았다(note ${S.notes}건만 남김) ④ 올림은 없음(현재 값이 4~5 라 올라갈 수 없고 5 도 주지 않음).`);
p('');

p('=====================================================================', '2. 결과', '=====================================================================');
p('2-0. 보정 표본 12건 (교훈 F) — RUBRIC.md 맨 아래. 밀그램 3(경계 4) · 올리브 3 · 국제장편영화상 3 · 홍루몽 3 · 신동엽 3 · 플라비우스 원형극장 4 · 대금 3 · 제비 2 · 카이저 소제 4 · 헤이젤 참사 4 · 참월 4 · 리니지 군주 3.');
p(`2-1. 분포 (현재 → blind${RR.changedTotal ? ' → 재독 뒤' : ''})`);
p(`  · 현재(score-v1): 4:${S.dist.current[4]} 5:${S.dist.current[5]}`);
p(`  · blind 판정자: 2:${S.dist.judge[2]} 3:${S.dist.judge[3]} 4:${S.dist.judge[4]}  →  VERIFY 재독 뒤(최종): 2:${S.dist.final[2]} 3:${S.dist.final[3]} 4:${S.dist.final[4]}`);
p(`  · 행렬(현재→최종): ${Object.entries(S.matrix).sort().map(([k, v]) => `${k} ${v}`).join(' · ')} — 값이 내려간 것 ${S.down}(상에서 나간 ${S.matrix['4→3'] + S.matrix['4→2'] + S.matrix['5→3']} + 5→4 ${S.matrix['5→4']}) · 올림 ${S.up} · 같음 ${S.same}. 상 유지 ${kept}/608 = ${pc(kept, 608)}.`);
p(`  · 상 유지: 5 였던 26 중 4 유지 25 · 4 였던 582 중 유지 ${S.matrix['4→4']}(${pc(S.matrix['4→4'], 582)}).`);
p(`2-2. 조각별 상 비율(판정자 값 — 재독 전): ${Object.entries(S.perPiece).map(([k, v]) => `${k} ${v.judgeTop}/${v.n}(${v.judgePct}%)`).join(' · ')}. 범위 ${Math.min(...Object.values(S.perPiece).map((x) => x.judgePct))}~${Math.max(...Object.values(S.perPiece).map((x) => x.judgePct))}%(V009: 26~47%). edge 표시 ${S.edge.judge}/608(${pc(S.edge.judge, 608)}) — V009 의 409/479(85%)보다 훨씬 줄었다(dif 3 에 "경계 4" ${S.edge.edge4OnDif3} · dif 4 에 "경계 3" ${S.edge.edge3OnDif4} · "경계 2" ${S.edge.edge2}). p7 이 가장 엄격했다(27.6%) — r2 와 p7 겹침 15건 중 첫 판정자 상 5 vs r2 상 3.`);
p('2-3. 묶음별 상 유지 (최종)');
p('  | 묶음 | 현재 상 | 최종 상 | 유지 비율 |', '  |---|---|---|---|');
for (const tp of topics) p(`  | ${tp} | ${S.byTopic[tp].n} | ${S.byTopic[tp].keep} | ${S.byTopic[tp].pct}% |`);
p(`  | 합계 | 608 | ${kept} | ${pc(kept, 608)} |`);
p(`2-4. 소분류별(n≥4 인 ${Object.entries(S.subsAll).filter(([k, v]) => v.n >= 4).length}곳 중) — 위 5: ${S.topSubs.map(([k, v]) => `${k.replace(/^L3:/, '')} ${v.keep}/${v.n}`).join(' · ')} / 아래 5: ${S.lowSubs.map(([k, v]) => `${k.replace(/^L3:/, '')} ${v.keep}/${v.n}`).join(' · ')}. 중분류로 보면 낮은 쪽: ${Object.entries(S.byC2).filter(([k, v]) => v.n >= 8).sort((a, b) => a[1].pct - b[1].pct).slice(0, 6).map(([k, v]) => `${k} ${v.keep}/${v.n}`).join(' · ')} / 높은 쪽: ${Object.entries(S.byC2).filter(([k, v]) => v.n >= 8).sort((a, b) => b[1].pct - a[1].pct).slice(0, 6).map(([k, v]) => `${k} ${v.keep}/${v.n}`).join(' · ')}.`);
p('2-5. 출처 라운드별 유지 비율');
p('  | 라운드 | 현재 상 | 최종 상 | 유지 |', '  |---|---|---|---|');
for (const [k, v] of Object.entries(S.byLegacyDate).sort()) p(`  | ${k} | ${v.n} | ${v.keep} | ${v.pct}% |`);
p('  (legacy-날짜 = R011~R028 의 옛 생성분을 만든 날 — 소스 라운드 번호가 source_ref 에 없다. r030g/r030n = R030 심화, g001 = G001.)');
p('2-6. 적용하면 상 풀');
p(`  · 지금: 활성 상 718(g003 110 + 이번 608) → 50문제 상만 14판.`);
p(`  · 적용 후: 110 + ${kept} = ${P.withoutG005} → ${P.playsWithoutG005}판. G005 의 blind 상 ${P.g005Blind}(V009, drop 뺀)를 더하면 ${P.withG005} → ${P.playsWithG005}판(G005 만 반영하고 이번 재채점을 안 하면 718 + ${P.g005Blind} = ${718 + P.g005Blind} → 17판).`);
p('  · 3 이하로 내려가는 387(= 현재 상 608 − 유지 221)은 중으로 간다 — 중+상 풀은 그대로(3 이상 비율이 거의 같음), 힌트도 3 이상이라 그대로 둔다(H0).');
p('2-7. 두 번째 채점자(r2) 120');
p(`  · 정확 일치 ${r2.exact}/120(${pc(r2.exact, 120)}) · ±1 이내 ${r2.within1}/120 · 상/상 아님 일치 ${r2.topAgree}/120(${pc(r2.topAgree, 120)}) · 일치 보정(kappa 유사) ${r2.kappaLike}. 평균 dif 첫 판정자 ${r2.meanJudge} · r2 ${r2.meanRater2}. 첫 판정자가 올리고 r2 가 내린 것 ${r2.judgeUpRater2Down} · 반대 ${r2.judgeDownRater2Up}. 상 개수: 첫 판정자 ${r2.judgeTop}(39%) · r2 ${r2.rater2Top}(29%) · VERIFY 결정 뒤 ${r2.finalTop}(36%).`);
p(`  · 조각별(조각당 15): ${Object.entries(r2.byPiece).map(([k, v]) => `${k} 판정자 ${v.judgeTop}/r2 ${v.rater2Top}`).join(' · ')}.`);
p(`  · 해석: 두 채점자는 3/4 선에서 같은 쪽으로 기운다(내림 방향 일치) — 첫 판정자가 r2 보다 상을 더 준다. 갈린 ${RR.split}건은 VERIFY 가 직접 읽고 정했다: ${RR.directions.jTo3} 은 3 으로(올리기 어려운 이유: 단서가 설명이 곧 정의 · 방송/뉴스에서 흔히 접함), ${RR.directions.jTo4} 은 4 로(전문 용어·애호가 영역: 클랩스케이트 · 키블라 · 프리캐스트 · 현상학 · 푸틴), 나머지 14 는 첫 판정자 값 유지. r2 가 안 본 488 건에는 같은 불일치율(약 23%)이 있다고 보면 상 비율은 29~39% 사이다.`);
p(`2-8. 재독 — 내림 ${RR.down} 중 무작위 20% ${RR.down20}건에서 바뀐 것 ${RR.changedFromDown20} · 갈린 ${RR.split}건 중 바뀐 것 ${RR.changedFromSplit}(${pc(RR.changedFromSplit, RR.split)}) · 올림 0. 무작위 내림에서 뒤집힘 0 이라 10% 기준을 넘지 않아 내림 전체 재독은 하지 않았다(갈림은 애초에 애매한 표본이라 바뀐 비율이 높은 것이 정상).`);
p('2-9. (나) G006 에서 GEN 이 직접 쓴 힌트 14');
p(`  · 판정자 h1: ok 13 · fix 1(#3990) → VERIFY 재독: ok ${g6.filter((g) => g.verdict === 'ok').length} · fix ${g6.filter((g) => g.verdict === 'fix').length}. 이전 힌트보다 나은가: better ${g6.filter((g) => String(g.afterVsBefore).startsWith('better')).length} · same ${g6.filter((g) => String(g.afterVsBefore).startsWith('same')).length} · worse 0. 사실: 판정자가 sources 를 열어 주장 전부를 대조(true web, unverified/false 0).`);
p('  · same 3건(#2384 태백산맥 · #3898 14개조 · #3990 메디치): ① #2384 — 대표작 연결(작가의 3부작)에서 "남로당 간부 염상진과 동생 염상구" 로 바뀜 — 인물 사실이라 ok 이나 소설을 읽은 사람은 바로 닿는다(경계, CV-11 에서 "대표 인물" 로 볼 여지) ② #3898 · #3990 — g006-fixes.json 의 before 칸이 after 와 같게 적혀 있어 바뀐 것인지 알 수 없었다. 현재 DB 의 같은 정답 문항 힌트를 직접 읽어 확인했다: #3990 힌트(루벤스 24점 연작 · 앙리 4세 왕비)는 #2012 힌트(위대한 자 로렌초 · 갈릴레이의 목성 위성)와 겹치지 않고, #3898 힌트(독립 폴란드 항목)는 #1957 힌트(첫째 항목 — 비밀 조약)·해설과 겹치지 않는다 → 둘 다 ok.');
p('  · 판정자 h1 의 #3990 fix(hint-hint-same) 는 위 근거로 VERIFY 가 ok 로 뒤집었다(뒤집기 1/14).');
p('  · 한 줄씩: #3005 쪽대본 ok · #3949 사하라 ok(낙타 3세기·7~8세기 문서 일치) · #671 안전지대 ok(도로교통법 사방 10m) · #1029 하늬바람 ok(사전 "높하늬·늦하늬") · #626 목요일 ok(포르투갈어 "다섯째 날") · #728 데즈카 ok · #1316 파프리카 ok(다섯 등급) · #2226 맥주 순수령 ok(빌헬름 4세) · #2384 ok(경계) · #3248 사실주의 ok(제4의 벽) · #3719 헤어질 결심 ok · #3814 토마토 ok(학명 늑대 복숭아) · #3898 ok · #3990 ok.');
p('');

p('=====================================================================', '3. 내림 · 올림 전부 — 한 줄씩 (id 정답 현재→최종 [경계] 가장 쉬운 단서)   · 유지(상 221)는 JSON 에만', '=====================================================================');
p(`3-1. 올림 0`);
const downs = all.filter((x) => x.dif < x.current.dif).sort((a, b) => a.topic.localeCompare(b.topic) || a.id - b.id);
p(`3-2. 값이 내려간 ${downs.length}(상에서 나간 387 + 5→4 25)   (VERIFY 가 정한 ${R.flipped.filter((f) => f.final < f.judge).length}건은 ★)`);
let cur = null;
for (const x of downs) { if (x.topic !== cur) { cur = x.topic; p(`-- ${cur} ${downs.filter((y) => y.topic === cur).length}`); }
  const star = x.verifyDecided ? ' ★' : ''; p(`#${x.id} ${x.answer} ${x.current.dif}→${x.dif}${x.edge ? '[경계 ' + x.edge + ']' : ''}${star} ${one(x.easiestCue).slice(0, 70)}`); }
p(`3-3. VERIFY 가 판정자(첫 채점)와 다르게 정한 ${R.flipped.length}건 — 갈린 것 처리: ` + '');
for (const f of R.flipped) p(`#${f.id} ${f.answer}: 판정자 ${f.judge} · r2 ${f.rater2} → ${f.final} — ${f.why}`);
p('');

p('=====================================================================', '4. 경계 · note · 갈림', '=====================================================================');
p(`- edge 표시 ${S.edge.judge}건(29%) — 위 2-2. 경계에서 "최종 4" 인데 edge:3 인 ${S.edge.edge3OnDif4} 건은 반대로 읽으면 내려갈 후보, "최종 3" 인데 edge:4 인 ${S.edge.edge4OnDif3} 건은 올라갈 후보다. 올라가는 쪽으로 읽으면 상은 최대 ${kept + S.edge.edge4OnDif3}(${pc(kept + S.edge.edge4OnDif3, 608)})까지, 내려가는 쪽으로 읽으면 최소 ${kept - S.edge.edge3OnDif4}(${pc(kept - S.edge.edge3OnDif4, 608)}). 가운데 값이 ${kept}.`);
p(`- r2 와 갈린 28건의 처리는 3-3. 모두 3/4 사이이고 단서가 "용어를 아는가"냐 "정의 문장이 곧 단서인가"냐로 갈렸다.`);
p(`- 유일성·사실 note ${S.notes}건은 5절.`);
p('');

p('=====================================================================', '5. 유일성 의심 · 질문 사실 note (이번 라운드는 fix 판정 안 함 — 목록만)', '=====================================================================');
for (const x of all.filter((y) => y.note)) p(`#${x.id} ${x.answer} (최종 ${x.dif}): ${one(x.note)}`);
p('  → CV-20: 난이도 라운드에서 나온 질문 품질 note. 다음 GEN 라운드가 기존 활성 점검 때 읽고 필요하면 고친다(정답 유일성 의심 2187 점프 구분 기준 · 2262 · 2412 · 2574 · 2887 · 3072 · 1783 정답 풀어 쓴 질문).');
p('');

p('=====================================================================', '6. 반복되는 꼴 — 옛 문항 모음이 score-v1 에서 4 를 받은 이유 (생성·채점 규칙에 되돌려 줄 것)', '=====================================================================');
p('1) 질문 한 문장이 정의/뜻풀이(사전 문장)인 낱말 문제를 4 로 매겼다: "선입후출 방식의 자료구조"(스택) · "생산 연령 인구 비중이 높은 시기"(인구 보너스) · "판결이 확정된 사건에 다시 형사 책임을 못 묻는 원칙"(일사부재리) · "카덴차" · "뇌량". → 낱말 뜻을 묻는 문항은 단서가 곧 정의이므로 3 이하 — score-v2 의 "쉬운 충분 단서" 로 이미 걸러지는 꼴이다.');
p('2) 교과서에 나오는 사건·인물·작품을 이름만 가려 묻는 문항을 4 로 매겼다: 벌지 전투 · 베르됭 · 솜 전투 · 헤지라 · 서프러제트 · 신동엽 · 모옌 · 러시아 5인조. → 고교 교과 단계(3).');
p('3) 상으로 남은 꼴은 일관되게 "취미 영역 세부": 영화(카이저 소제) · 축구(헤이젤 참사) · 건축(플라비우스 원형극장 · 르 코르뷔지에 5원칙) · 애니(참월 · 노블레스 라이) · 철도(로켓호) · 국악 기악 용어. 생성에서 상을 만들 때 이 영역의 세부를 쓰면 4 가 유지된다.');
p('4) 옛 라운드 짧은 한 문장 질문(질문 길이 70자 미만 412/608)이 많아 점수가 질문 길이에 무관하게 "그 한 문장이 쉬운 충분 단서인가" 로만 갈렸다 — 길이로 난이도를 올리거나 내리지 않는다는 RUBRIC 선이 효과가 있었다.');
p(`5) 라운드가 새로울수록 상이 많이 남는다: legacy 30.5% → r030g/n 45%/40% → g001 71% → (G005 blind 35.5%). 생성 지시에 "쉬운 단서를 질문에 같이 두지 않는다" 가 들어간 뒤의 효과가 보인다.`);
p('');

p('=====================================================================', '7. 자기 점검', '=====================================================================');
p('- 실행 모델 Sonnet 5.5. 판정자 8조각·r2·h1 도 같은 모델 — 이 라운드는 GEN 값이 아니라 같은 읽기로 다시 매기는 일이라 GEN(Opus)과 달라도 독립성 문제는 없다. 단 판정자 한 명의 편향은 r2 120 으로만 보았다(첫 판정자가 r2 보다 상을 더 줌).');
p(`- 직접 재독: 내림 무작위 20% ${RR.down20} + 갈린 ${RR.split} = ${RR.read}건. 올림은 0. 뒤집기: 무작위 내림에서 0, 갈림에서 ${RR.changedFromSplit}. (나) 14 전부 읽고 DB 를 직접 확인 — 판정자 fix 1 → ok 1.`);
p('- 교훈 A 인용은 입력에서 가져왔다(easiestCue 는 질문의 구절) · B 세기만으로 fix 한 것 없음 · C 같은 정답 문항은 (나) 에서 함께 읽음 · D 못 한 것을 숫자로(1절) · E 판정자 값은 재독 20% + 갈림으로 확인(읽지 않은 내림 ' + (RR.down - RR.down20 - RR.split) + ') · F 보정 표본 12 · G blind 칸은 쓰지 않았다.');
p(`- 한계: ① 난이도는 읽기에 민감하다(edge 179, 올리는 쪽 읽기 최대 ${kept + S.edge.edge4OnDif3}) ② r2 는 120건뿐 — 나머지 488 은 한 채점자 ③ "5" 를 하나도 못 줬다(판정자가 5 의 기준에 닿는 문항을 못 본 것이지 기준이 없다는 뜻은 아니다) ④ 질문·사실은 보지 않았다 ⑤ 힌트 14 의 g006-fixes 의 before 칸이 after 와 같은 행 2건(#3898 · #3990)이 있어 "무엇이 바뀌었나" 를 DB 로 대신 확인했다.`);
p('- DB 는 읽기 전용(대상 고정·소분류 조회·같은 정답 조회)만 썼다.');
p('');
p('새로 생긴 결정 필요 항목');
p(`- CV-18 — 적용 범위: 이번 608 을 blind 값(최종)으로 DB 에 반영하면 상만 판이 14 → ${P.playsWithoutG005}판(G005 포함 ${P.playsWithG005}판). 대안 (a) 최종 값 그대로 · (b) 두 채점자가 모두 4 인 것만 상으로 · (c) edge:3 인 83건은 보류. 풀 추정: (a) ${kept} (b) 약 137(r2 120건에서 둘 다 4 인 것 27 = 22.5% → 608 환산) (c) ${kept - S.edge.edge3OnDif4}. "상만" 판의 체감을 고르게 맞추는 것이 목적이면 (a). G004 는 V007 값을 그대로 썼다.`);
p('- CV-19 — 5 단계: 이번에도 판정자가 5 를 하나도 주지 않았다(G005 V009 도 0). 현재 5 인 26 은 4 로 내려간다. 기준표 §5-1 의 5(전공·자격증/마니아도 헷갈림)에 닿는 문항을 만들 계획인지, 상 = 4 로 단순화할지.');
p(`- CV-20 — 질문 품질 note ${S.notes}건(5절): 정답 유일성 의심 · 질문이 정답을 풀어 쓴 꼴 · 시간 의존. 난이도 라운드라 fix 판정은 안 했다 — 다음 GEN 의 기존 활성 점검 몫.`);
p('');
p('고친 문서', '- ai-out/V010.txt (이 문서) · data/pipeline/audit/v010-results.json · data/pipeline/audit/v010-raw/ (RUBRIC · STATE · targets-ids · 조각 p1~p8 · r2 · h1 · _work/) · docs/13-PENDING-CHECKS.md (C68 · CV-18~20 · 머리글) · ai-out/README.md (V 표 V010)');

fs.writeFileSync('C:/work/quiz-web/ai-out/V010.txt', L.join('\n') + '\n');
console.log('lines', L.join('\n').split('\n').length);
