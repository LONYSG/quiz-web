// V009 보고서 생성 — ai-out/V009.txt (결과 JSON + 입력에서 기계로)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v9';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const R = JSON.parse(fs.readFileSync(A + '/v009-results.json', 'utf8'));
const T = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8')).map((x) => [x.ref, x]));
const S = R.stats, V = R.rescoreVsGen, F = R.factStats, I = R.items, all = Object.values(I);
const one = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
const topics = ['korea', 'sports', 'life', 'media', 'arts', 'science', 'history'];
const tname = { korea: 'korea', sports: 'sports', life: 'life', media: 'media', arts: 'arts', science: 'science', history: 'history' };
const L = []; const P = (...a) => L.push(...a);
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
const nd = all.filter((x) => x.verdict !== 'drop');
const newTopND = nd.filter((x) => x.dif >= 4).length, newGe3ND = nd.filter((x) => x.dif >= 3).length;
const mediaTopND = nd.filter((x) => x.topic === 'media' && x.dif >= 4).length, koreaTopND = nd.filter((x) => x.topic === 'korea' && x.dif >= 4).length;
const pool = (cur, add) => `${cur}+${add}=${cur + add} → ${Math.floor((cur + add) / 50)}판`;
const r2 = V.rater2;
const fixHintItems = all.filter((x) => x.verdict === 'fix' && x.hasHint && x.categories.some((c) => ['famous-one', 'meaning', 'question-repeat', 'h-error', 'weak', 'letters', 'spoon-feed', 'pair-same', 'explain-overlap', 'wrong-name', 'alias', 'shape-only', 'shape'].includes(c)));
const famous = all.filter((x) => x.categories.includes('famous-one'));
const noHintFix = all.filter((x) => x.verdict === 'fix' && !x.hasHint);
const kn = Object.entries(R.factChecks).filter(([ref, f]) => f.claims.some((c) => c.result !== 'true' && c.where !== 'h' && c.where !== 'ph') && I[ref].verdict === 'ok').map(([ref]) => ref);
const knH = Object.entries(R.factChecks).filter(([ref, f]) => f.claims.some((c) => c.result !== 'true' && c.where === 'h') && I[ref].verdict === 'ok').map(([ref]) => ref);

P('===========================================', 'ROUND: V009', 'DATE: 2026-10-15', 'TASK: G005 상 생성 2차 493 판정 — 문항(ok/fix/drop) · 난이도 blind 재채점(score-v2) · 고친 질문(rewrite 227) 확인 · 사실 · 힌트 464 · 변형. 반영·적재는 G007', 'STATUS: 완료', '===========================================', '');
P('[cmd 창 요약]');
P(`1. 493 전수: ok ${S.verdict.ok} · fix ${S.verdict.fix} · drop ${S.verdict.drop} (drop 10 = 2회차 3-3 9 + 미디어 알 가치 1). 판정자 fix·drop 192 전부와 ok 32 를 직접 읽어 2건을 ok→fix 로 뒤집음.`);
P(`2. ★ blind 재채점: 상(4~5) GEN 307(62%) → ${V.newTop}(${pct(V.newTop, 493)}). 4→3 ${V.matrix['4→3']} · 3→4 ${V.matrix['3→4']}. 두 번째 채점자 96건도 상 ${r2.rater2Top}(${pct(r2.rater2Top, 96)}) vs GEN ${r2.genTop}(${pct(r2.genTop, 96)}) — 내림은 한 채점자의 편향이 아니다(CV-14).`);
P(`3. rewrite 227: 질문이 틀리거나 유일하지 않거나 마이너해져 걸린 것 ${S.rewrite.issues.length}(${S.rewrite.issues.join(' · ')}) — 나머지는 통과. GEN 상 106 → blind 상 ${V.rewriteChanged227.newTop}(유지 ${V.rewriteChanged227.kept}).`);
P(`4. 사실: 열지 못한 64·미확인 105·무작위 재확인 40 = 주장 ${F.all.claims} → 틀림 ${F.all.false}(M1-20, 이미 drop) · 무작위 R ${F.bySet.R.claims} 중 틀림 0(오류율 0%). 힌트 464 중 fix ${fixHintItems.length}(famous-one ${famous.length}) — 변형 fix ${S.variants.fix.length}.`);
P('5. 산출물: ai-out/V009.txt · audit/v009-results.json · v009-raw/ · 13 CV-14~17 · README V 표. DB 쓰기 0 · 429 없음 · Sonnet 5.5. 커밋은 아래 보고.');
P('');
P('0. 찬종이 볼 것');
P(`- ★ 상(4~5) 비율이 크게 내려갔다: G005 보고서의 GEN 최종 307/493(62%)을 blind 로 다시 매겼더니 ${V.newTop}(${pct(V.newTop, 493)}), drop 10 을 빼면 ${newTopND}/${nd.length}. 상이 많이 내려간 묶음: history 39→13 · sports 61→30 · arts 38→22 · science 40→26 · life 55→32. korea 는 41→31(28%). 두 번째 독립 채점자(96건)는 상 ${r2.rater2Top}건으로 첫 판정자(${r2.judgeTop})보다도 적었다 — 쉬운 충분 단서를 고르는 읽기가 흔한 단서를 찾는 쪽으로 기울면 이렇게 나온다. G003 때 V007 이 153→110(31→22%)으로 내린 것과 같은 방향이다. 다만 판정자 사이 일치는 완전하지 않다(상/상 아님 일치 ${r2.topAgree}/96, 정확 일치 ${r2.exact}/96, ±1 이내 96/96) — 조각별 상 비율도 26~47% 로 벌어졌다(7절·CV-14).`);
P(`- 들어가면(드롭 10 뺀 483, blind dif) 50문제 판: 상만 ${pool(718, newTopND)} (G005 추정 20판) · 중+상 ${pool(2437, newGe3ND)} · 전체 ${pool(4630, 483)} · 미디어 상 ${pool(105, mediaTopND)} · 미디어 전체 ${pool(699, 59)} · korea 상만 ${pool(45, koreaTopND)}(G005 추정 86).`);
P(`- rewrite 227(쉬운 단서를 빼고 한 번 고친 것): 고침이 상을 지켜 주긴 했다 — 1차 채점에서 상이던 201(고치지 않음)은 blind 에서 ${V.neverRewritten201.newTop}(${pct(V.neverRewritten201.newTop, 201)})만 남았는데, 고친 227 은 GEN 상 106 중 ${V.rewriteChanged227.kept} 유지에 3→4 올림 ${V.rewriteChanged227.newTop - V.rewriteChanged227.kept} 로 ${V.rewriteChanged227.newTop}(${pct(V.rewriteChanged227.newTop, 227)}). 질문 자체가 문제인 것은 4건뿐이다(유일성 L2-27 · L2-28, 사실 K3-08 · M1-10 연도, 마이너 M1-20).`);
P(`- 힌트: CV-11 이 확정된 뒤 힌트 464 중 ${fixHintItems.length}(${pct(fixHintItems.length, 464)})가 fix, 그중 famous-one(대표 사실/정체) ${famous.length}. hint-v4 로 만든 힌트인데도 4 건 중 1 건 꼴이다 — 생성 지시 쪽 보강이 필요하다(6절).`);
P('- 2회차 (가) 34: ok 18 · fix 7 · drop 9 (26%). G005 가 §3-3 으로 이미 버린 뒤에도 범주 단서만으로 풀리는 2회차가 9건 더 있었다(CV-10 적용) — 6절·CV-15.');
P(`- 판단을 맡기는 것: CV-14(상 재채점 기준 — blind 175 vs GEN 307 — DB 에 어느 dif 를 쓰나) · CV-15(2회차 3-3 drop 9 — 선 확인) · CV-16(변형 경계 3건: KIA 타이거즈 · 코비 · 장어) · CV-17(나무위키만 근거인 미디어 6 · 문서 못 연 미확인 ${kn.length}건).`);
P('');
P('★ 원칙 메모 — 판정만 했다. DB 쓰기 0(읽기 전용 조회만) · 적재 0 · 생성 0 · 규칙/프롬프트/코드 수정 0 · 서버 기동·빌드·npm run verify 0 · 기존 활성 판정 0.');
P('  (7) 브리핑의 사실 확인 — targets 493 · 묶음(korea 110 · sports 84 · life 89 · media 60 · arts 50 · science 50 · history 50) · GEN 최종 상 307 · rewrite.changed 227(그대로 65 · 없음 201) · 힌트 464(web 454 · knowledge 10) · 2회차 34 · 같은 정답 활성 50(+별칭 일치 포함 52 — 2건은 별칭만 같음) · 미디어 알 가치 2 = 24 · 변형 181 문항 · 227 · 활성 4,630 · DB 의 g005 source_ref 0 — 전부 파일·DB 에서 다시 세어 일치. 단정어 경고는 문장 히트 124(힌트 포함 항목 153) — 보고서의 139 는 게이트 경고 수라 세는 단위가 다르다.');
P('  (교훈 F) 보정 표본 10(korea 3 · media 2 · rewrite 3 · 그 밖 2 + 보너스 1) → RUBRIC 고정(v009-raw/RUBRIC.md) → 판정자 8조각(3개씩) → 직접 재독 → 사실 확인 → 두 번째 채점자 → build.');
P('  (V008 피드백 D★) 사실 확인자 지시문에 처음부터 "항목마다 문서를 연다 · 지식 판정은 무효" 를 넣었다 — x1~x4·y1·y2 는 다시 돌린 것이 없다.');
P('');
P('목차', '0. 웹 · 1. 건수·빠진 것 · 2. 종류별 결과 · 3. fix·drop 전부 · 4. 경계·미확인 · 5. 누적·중복 · 6. 반복 오류 유형 · 7. 자기 점검', '');

P('=====================================================================', '0. 웹 검색·조회 (맨 앞)', '=====================================================================');
P(`- WebSearch: 쓸 수 있었다. 판정자 31회 + 확인자 12회 = ${R.web.webSearch.used}회 / 한도 80. 429 없음 — 모델을 바꾸지 않았다(Sonnet 5.5; GEN 은 Opus 5.5).`);
P(`- WebFetch: 주 수단. 판정자 p1~p8 약 ${R.web.webFetch.judges}회, 확인자 x1~x4·y1·y2 약 ${R.web.webFetch.verifiers}회, VERIFY 직접 ${R.web.webFetch.verify}회(자기 보고 값). 나무위키는 403·404 라 못 연 것이 많다(4절). 요약 모델을 거치므로 "문서에서 못 찾음" 은 거짓이 아니라 unverified 로 두었다.`);
P('- 방식 변경(이유와 함께): ① 브리핑은 조각 125 안팎 4조각이었으나 항목 입력이 한 조각 280KB(항목당 약 2.3KB — facts note·REWRITE·sameAnswerActive 포함)라 웹을 여는 판정자의 문맥이 넘칠 것으로 보여 **8조각(61~62건)** 으로 나눴다(3개씩 3판). ② 사실 확인자 지시문에 처음부터 문서 열기를 못 박았다. ③ 두 번째 독립 채점자 r2(96건 — 조각당 12)를 더했다(브리핑 밖 — 재채점이 흔들리는지 보려고).');
P('');

P('=====================================================================', '1. 실제 판정 건수 · 빠진 것', '=====================================================================');
P(`- 493 전부(누락 0 · results.json items 키 ${Object.keys(I).length}, ref 유일). 판정자 출력의 개수·ref 순서를 입력과 기계로 대조해 8/8 일치.`);
P(`- 판정자 원판정 ok ${S.judgeVerdict.ok} · fix ${S.judgeVerdict.fix} · drop ${S.judgeVerdict.drop} → VERIFY 재독 뒤집기 ${R.flipped.length}(ok→fix: ${R.flipped.map((f) => f.ref).join(' · ')}) → 최종 ok ${S.verdict.ok} · fix ${S.verdict.fix} · drop ${S.verdict.drop}. 제안 문구는 VERIFY 가 ${S.proposals.byVerifyReplaced.length}건을 교체했다(3절 ★).`);
P(`- 못 한 것(숫자): ① 판정자 ok 301 중 직접 재독 32(10.6%, 시드 고정) — 나머지 269 는 판정자 ok 를 그대로 받았다(그중 "애매" 표시 ${S.amb}건은 4절) ② 사실: 판정자가 열지 못한 64 전부와 미확인 주장이 남은 105 를 확인자가 다시 열었지만, 판정자가 true 로 닫은 항목은 무작위 40 만 재확인(나머지 약 280 은 판정자 웹 근거를 믿음) ③ 제안 새 사실은 71 항목(제안 ${S.proposals.hint + S.proposals.question + S.proposals.explanation} 중 약 43%)을 재확인 — 나머지는 판정자 웹 근거 ④ 변형 181 문항은 판정자 전수 판정 + fix 28 만 직접 읽음.`);
P('');

P('=====================================================================', '2. 종류별 결과', '=====================================================================');
P('2-0. 보정 표본 10건 (교훈 F)');
P('  · K1-01 왕오천축국전 3 · K3-07 엿 3(힌트 fix) · K1-11 해동제국기 3 · K4-16 뚱딴지 3(힌트 fix meaning) · M1-01 강변북로 가요제 4 · M2-20 갤러그 3 · C1-10 모세혈관 3(힌트 fix) · L2-19 바세린 4 · L3-16 서머타임 4(3-3 통과) · S1-16 사이영상 4 · H1-18 블랙 먼데이 4(보너스).');
P('  → 이 읽기로는 "정답 이름이 흔하거나 단서가 사전 뜻풀이·교과서 문장 그대로이면 3, 단서가 교과서 밖 세부(경위·수치·수상 순서)뿐이면 4". 11건 중 4 는 5건(45%) — GEN 의 62% 보다 낮게 읽히며, 실제 전체도 그렇게 나왔다.');
P('2-1. 문항 판정 — 묶음별');
P('  | 묶음 | n | ok | fix | drop | GEN 상 | blind 상 | blind 상 비율 | 상(drop 뺀) |', '  |---|---|---|---|---|---|---|---|---|');
for (const tp of topics) { const b = S.byTopic[tp], v = V.byTopic[tp]; P(`  | ${tp} | ${v.n} | ${b.ok || 0} | ${b.fix || 0} | ${b.drop || 0} | ${v.genTop} (${v.genPct}%) | ${v.newTop} | ${v.newPct}% | ${v.newTopNonDrop} |`); }
P(`  | 합계 | 493 | ${S.verdict.ok} | ${S.verdict.fix} | ${S.verdict.drop} | 307 (62.3%) | ${V.newTop} | ${pct(V.newTop, 493)} | ${newTopND} |`);
P(`  · 조각별 fix+drop: ${Object.entries(S.byPiece).map(([k, v]) => `${k} ${(v.fix || 0) + (v.drop || 0)}/${sum(v)}`).join(' · ')} — 판정자 사이 23~46% 로 벌어졌다(p6 23% vs p3·p5·p7 45% 안팎). 힌트 fix 사유가 판정자의 CV-11 엄격도에 달려 있다.`);
P('  · drop 10 의 사유: 2회차 3-3(CV-10) 9 — K3-14 초당두부 · K3-25 홍길동전 · L2-07 루빅스 큐브 · L2-09 십자말풀이 · L2-10 타로 · L3-02 팟타이 · L3-12 밸런타인데이 · L3-25 데자뷔 · H2-08 사르가소해(1회차 해설과 같은 사실) / 미디어 알 가치 2 MD10 1 — M1-20 Hug(동방신기 데뷔 싱글 — 무게가 크지 않은 작품의 세부).');
P(`  · fix 사유(중복): ${Object.entries(S.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
P('2-2. 난이도 재채점 (blind — C65·CV-07 읽기 "가장 쉬운 충분 단서")');
P(`  · 분포(blind): ${Object.entries(all.reduce((m, x) => (m[x.dif] = (m[x.dif] || 0) + 1, m), {})).map(([k, v]) => `${k}:${v}`).join(' ')} — GEN: 1:2 2:27 3:157 4:302 5:5. blind 는 5 가 하나도 없다(GEN 의 5 다섯 건은 전부 4).`);
P(`  · 행렬(GEN→blind): ${Object.entries(V.matrix).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}. 상이던 307 중 ${V.genTopToNot} 이 3 이하로, 3 이하이던 186 중 ${V.notToTop} 이 4 로.`);
P(`  · 상 유지 비율: 전체 ${V.matrix['4→4'] + V.matrix['5→4']}/307 = ${pct(V.matrix['4→4'] + V.matrix['5→4'], 307)}. rewrite 227 안에서는 GEN 상 ${V.rewriteChanged227.genTop} 중 ${V.rewriteChanged227.kept} 유지(${pct(V.rewriteChanged227.kept, V.rewriteChanged227.genTop)}), 고치기 전 1차 상이던 201 은 ${V.neverRewritten201.kept} 유지(${pct(V.neverRewritten201.kept, 201)}), 고치지 않은 65 는 6 이 4 로 올라감.`);
P(`  · 내린 것의 꼴(169건 4→3): difWhy 의 단계 이름이 "관심 있는 사람이 안다" 19 · 고교 한국사 6 · 고교 세계사 5 · 스포츠/축구 상식 6 · 영화 팬 3 · 게이머/시사/대중 상식 6 … — 단서가 "대중이 접하는 정의·일화" 이거나 쉬운 단서가 질문에 같이 있다고 읽은 경우가 대부분이다. 상으로 남은 175 의 단계 이름은 "애호가"(야구·축구·국악·클래식·음식·맥주·자동차·뮤지컬 …) 약 55 · 대학 교양 7 · 교과 밖 세부 3 — 취미 영역의 세부일 때 상이다.`);
P(`  · 경계 표시: dif 3 으로 매기며 "(경계 4)" 를 단 것 244, dif 4 로 매기며 "(경계 3)" 를 단 것 165 — 채점자 대부분이 3/4 선에 걸려 있다고 적었다. 반대 쪽으로 읽으면 상은 최대 약 419(85%)까지도 나온다는 뜻이므로 상 비율 175 는 읽기에 민감한 값이다(CV-14).`);
P(`  · 두 번째 채점자 r2(조각당 12건 = 96건, 질문·정답·해설만 봄): 정확 일치 ${r2.exact}/96 · ±1 이내 96/96 · 상/상 아님 일치 ${r2.topAgree}/96 · 첫 판정자 상 ${r2.judgeTop} · r2 상 ${r2.rater2Top} · GEN 상 ${r2.genTop} · 평균 dif 첫 판정자 ${r2.meanJudge} · r2 ${r2.meanRater2} · GEN ${r2.meanGen}. 갈린 33건 중 첫 판정자가 올린 것 ${r2.disagreeTop.filter((d) => d.judge >= 4).length} · r2 가 올린 것 ${r2.disagreeTop.filter((d) => d.rater2 >= 4).length}. 조각별로 보면 p7 은 r2 가 오히려 더 올렸고(첫 판정자 2 · r2 6) p5·p8 은 r2 가 더 내렸다 — 판정자 한 명의 편향이 아니라 3/4 선 자체가 흔들리는 것이다.`);
P(`  · korea 상: 활성 45 + 이번 blind ${koreaTopND}(drop 뺀) = ${45 + koreaTopND} → 상만 ${Math.floor((45 + koreaTopND) / 50)}판은 되지만 G005 추정 86 에는 10 모자란다.`);
P('2-3. 고친 질문(rewrite changed 227) — ① 정답이 하나인가 ② 새 단서가 facts 문서 문장에 있는가 ③ 마이너해지지 않았나 ④ 읽기 어려워지지 않았나');
P(`  · rewriteCheck 227 전부 채움. 걸린 것 ${S.rewrite.issues.length}: L2-27 킬트(벨티드 플레이드 이름을 뺀 뒤 치마류도 답이 됨 — 고치기 전 문장으로 되돌리자는 제안) · L2-28 오트 쿠튀르(마지막 "이것"이 조합으로도 읽힘 — 묻는 문장에 대상을 못 박는 제안) · K3-08 오메기떡(질문의 "간식보다" 가 문서 "안주용으로 사용하는 대신" 과 달라 fact-error — 질문 교정) · M1-20 Hug(마이너해짐 → drop). 그 밖 223 은 ①~④ 통과.`);
P(`  · rewrite 227 의 verdict: ok ${S.rewrite.changed227.ok} · fix ${S.rewrite.changed227.fix} · drop ${S.rewrite.changed227.drop} — fix 96 의 대부분은 질문이 아니라 힌트(쉬운 단서를 질문에서 빼 힌트로 옮긴 꼴 "질문에서 뺀 단서의 재도입": K1-23 다부동 · K1-13 동래성 · S1-28 펠레 · K1-08 황산대첩 등).`);
P('  · 고친 질문에서 새로 들어간 단서의 사실은 facts 의 문서 문장과 글자 대조했다: M1-10 고스트스테이션(MBC FM4U 이동 2003-10 인데 질문은 "같은 해 10월" — 문서와 어긋나 fact-error) · L3-01 버터 치킨("경쟁 식당" 서술을 문서로 못 닫음) · M1-05(1993~1994 연도를 문서가 "1990년대 중반" 으로만 적음) · L1-11("처음 널리 퍼뜨렸다" 는 [citation needed]).');
P('2-4. 사실 (D)');
P(`  · 판정자 웹: 열었다 ${F.webOpened.true}/493 · 열지 않았다 ${F.webOpened.false}(재채점 3 이하 + webOpen false). 판정자가 단 질문·해설·힌트 주장 ${F.judgeFacts.true + F.judgeFacts.unverified + F.judgeFacts.false.length}: true ${F.judgeFacts.true} · unverified ${F.judgeFacts.unverified}(웹 못 열음 포함) · false ${F.judgeFacts.false.length} — false 7 은 전부 fix 에 반영: ${F.judgeFacts.false.join(' · ')}.`);
P(`  · 확인자 x1~x4(항목마다 문서 열기): 항목 ${F.all.items} · 주장 ${F.all.claims} → true ${F.all.true} · unverified ${F.all.unverified} · false ${F.all.false}. false 1 은 M1-20 힌트("2024년 라이즈가 Hug 를 새로 불렀다" — en 위키는 2025-01-08)로 이미 drop.`);
P(`    · U(판정자가 열지 못한 ${F.bySet.U.items}): 주장 ${F.bySet.U.claims} → true ${F.bySet.U.true} · unverified ${F.bySet.U.unverified} · false 0`);
P(`    · B(판정자가 열었으나 미확인으로 남긴 ${F.bySet.B.items}): 주장 ${F.bySet.B.claims} → true ${F.bySet.B.true} · unverified ${F.bySet.B.unverified} · false ${F.bySet.B.false || 0}`);
P(`    · R(판정자가 true 로 닫은 항목 중 무작위 ${F.bySet.R.items}, 시드 고정): 주장 ${F.bySet.R.claims} → true ${F.bySet.R.true} · unverified ${F.bySet.R.unverified} · false 0 → ★ 오류율 0%(브리핑 3% 기준 미달 — 넓히지 않음)`);
P(`  · 제안 힌트·질문·해설의 새 사실 재확인 y1·y2: 항목 ${F.proposals.items} · 주장 ${F.proposals.claims} → true ${F.proposals.true} · unverified ${F.proposals.unverified} · false 0. unverified 8 항목(S1-08 · C1-13 · K4-26 · K4-27 · L1-11 · L3-15 · S2-36 · S2-30)은 VERIFY 가 문서 문장대로 줄이거나 교체했다(3절 ★).`);
P('  · G005 2절의 "출처가 약한 것": 나무위키 6(M1-02 까나리카노 · 가족오락관 · 인생극장 · 관심법 · 부라보콘 · 빅마마) — 나무위키 403·404 라 M1-06 · M1-09 · M1-16 의 해설·질문 주장은 문서로 못 닫음(4절) · 기사 1건 3(K2-20 비금도 · S1-25 코너킥 · K4-27 회혼례) — 열어서 K4-27 은 73세/사흘 전 같은 세부가 문서와 어긋나 힌트 fix(출처 약함) · 변형 약한 4(회혼식 · 숀더쉽 · 코나미 · 윌헬름) — 4건 모두 변형은 한국어 쓰임을 문서로 못 닫았고 M2-31 의 "윌헬름" 은 판정자가 변형 보강을 제안.');
P('  · 지식 힌트 10: K3-33 · K3-22 · K2-14 · K2-04 · K2-19 · K4-16 · K3-07 · K4-02 는 fix(문서 근거 없음 + 대표 사실/뜻풀이) · K3-01 잡채(사삼각로) · K4-07 하오체(부부 사이 쓰임)는 판정자 ok 이지만 문서로 못 닫아 4절에 미확인으로 남김.');
P('2-5. 힌트 464');
P(`  · fix ${fixHintItems.length}(${pct(fixHintItems.length, 464)}) + 힌트 없어 새로 붙이자는 것 ${noHintFix.length}(난이도 3 이상인데 힌트 없음 — H0). 사유: famous-one ${famous.length} · question-repeat ${S.categories['question-repeat']} · h-error ${S.categories['h-error']} · weak ${S.categories.weak} · meaning ${S.categories.meaning} · letters ${S.categories.letters} · spoon-feed ${S.categories['spoon-feed']} · explain-overlap ${S.categories['explain-overlap']}.`);
P(`  · 새 규칙: ① H7 꼴만 ${S.hint.newRules.shapeOnly.length}(${S.hint.newRules.shapeOnly.join(' ')} — 히브리어 "22자 알파벳 · 오른쪽에서 왼쪽") · ② H10 반대 꼴(wrong-name/alias) ${S.hint.newRules.wrongName.length}(${S.hint.newRules.wrongName.join(' · ')}) · ③ H12 같은 정답 활성 문항의 질문·해설과 같은 사실 ${S.hint.newRules.pairSame.length}(${S.hint.newRules.pairSame.join(' · ')}). hint-input 의 sameAnswerActive 를 받은 덕에 ③ 은 거의 없다.`);
P(`  · CV-11 적용: 나라·도시의 기본 정체(경기도 K3-27 …)·대표 제품/사건 힌트 fix — 예: 지역 힌트 "이 군에서 일어난 사건"(영동) · "인천대교로 송도와 이어진다"(영종도) · "주왕산국립공원 안에 있다"(주산지) · "2007 새 경기장 133m 아치"(웸블리).`);
P(`  · 힌트가 없는데 blind 난이도 3 이상이라 새로 붙이자는 것 ${noHintFix.length}: ${noHintFix.map((x) => x.ref).join(' ')}. (GEN 은 난이도 2 이하로 보고 힌트 보류 — H0 각주 "재채점으로 3 이상이 됐는데 없으면 붙인다" 에 따른 제안이다.)`);
P('2-6. 변형 (181 문항 · 227 변형)');
P(`  · 변형이 있는 ${S.variants.itemsWithVariants} 문항 전부 판정. fix ${S.variants.fix.length}: 빠진 흔한 한국 표기 추가 20 안팎(스테인레스 · 보스포러스 · 벤포드 법칙 · 붉은 여왕 효과 · 하이브리드 띠어리 · 노스트로모호 · 퉁구스카 폭발 · 달마대사 · 비너 슈니첼 · 블랙스완 …) · B2/B7 로 뺀 것 5(H1-04 국제형사경찰기구 · L1-04 포토스 · H1-20 피렌체 증후군 · L1-25 자유 이용 저작물 · H1-03 불가능성 정리) · 상표/구단 동일체 S1-07(해태→KIA 타이거즈) · L1-14 퍼플. VERIFY 가 S2-36 의 "알리" 를 B5 로 뺐다. 한국어 쓰임을 문서로 못 닫은 변형 제안은 4절.`);
P(`2-7. 미디어 알 가치 2 — 24건: ok ${S.media.wor2Verdict.ok} · fix ${S.media.wor2Verdict.fix} · drop ${S.media.wor2Verdict.drop}(M1-20 Hug). MD10(레전드 작품의 팬 세부, CV-08 넓은 선)에 걸려 drop 한 것은 M1-20 하나 — 동방신기는 레전드이나 판정 대상이 그룹이 아니라 데뷔 싱글이라 무게가 크지 않은 작품의 세부. 이태원 클라쓰급 선으로 모두 통과.`);
P(`2-8. 2회차 (가) 34: ok ${S.second.verdict.ok} · fix ${S.second.verdict.fix} · drop ${S.second.verdict.drop}. 판정 문장 "1회차만 아는 사람이 새 사실 없이 바로 푸는가" — 사실이 새로워도 질문의 범주 단서(점술 카드 · 국수 요리 · 신문 낱말 퍼즐 · 짝을 고르는 날)만으로 풀리면 drop(CV-10).`);
P('');

P('=====================================================================', '3. 고칠 것(fix) · 버릴 것(drop) 전부 — 현재 / 제안 / 사유 한 줄 / 출처   (★ = VERIFY 가 판정자 제안을 교체 · ⚑ = VERIFY 뒤집기)', '=====================================================================');
const row = (x) => {
  const t = T[x.ref]; const p = x.proposal; const star = p.byVerify ? ' ★' : ''; const flip = R.flipped.some((f) => f.ref === x.ref) ? ' ⚑' : '';
  const lines = [`#${x.ref} [${x.answer}] ${x.verdict} ${x.categories.join(',')}${star}${flip}  (blind dif ${x.dif}${x.genDif !== x.dif ? `, GEN ${x.genDif}` : ''}${x.rewriteChanged ? ', 고친 질문' : ''}${t.method === '가' ? ', 2회차' : ''})`];
  if (x.verdict === 'fix') {
    if (p.question) { lines.push(`  현재 질문: ${one(t.question)}`, `  제안 질문: ${one(p.question)}`); }
    if (p.explanation) { lines.push(`  현재 해설: ${one(t.explanation)}`, `  제안 해설: ${one(p.explanation)}`); }
    if (p.variants) lines.push(`  현재 변형: ${JSON.stringify(t.variants)}  →  제안 변형: ${JSON.stringify(p.variants)}`);
    if (p.hint !== undefined && p.hint !== null) lines.push(`  현재 힌트: ${t.hint ? one(t.hint) : '(없음)'}`, `  제안 힌트: ${one(p.hint)}`);
    else if (p.byVerify?.hint) lines.push(`  현재 힌트: ${t.hint ? one(t.hint) : '(없음)'}`, '  제안 힌트: (제안 없음 — G007 이 새로 쓰거나 H8)');
    else if (x.categories.some((c) => ['famous-one', 'meaning', 'weak', 'h-error', 'question-repeat', 'spoon-feed', 'letters', 'explain-overlap', 'wrong-name', 'alias', 'shape-only', 'pair-same', 'no-hint', 'hint-missing'].includes(c)) && !p.question && !p.explanation && !p.variants) lines.push(`  현재 힌트: ${t.hint ? one(t.hint) : '(없음)'}`, '  제안 힌트: (제안 없음 — G007 이 새로 쓰거나 H8)');
  }
  lines.push(`  사유: ${one(x.reason)}`);
  if (p.byVerify) for (const [k, b] of Object.entries(p.byVerify)) if (b.why) lines.push(`  ★ ${k}: ${one(b.why)}${b.judge && JSON.stringify(b.judge) !== JSON.stringify(b.verify) ? ' (판정자 제안: ' + one(typeof b.judge === 'string' ? b.judge : JSON.stringify(b.judge)) + ')' : ''}`);
  const src = [...new Set([...(x.facts || []).filter((f) => f.proposal && f.source).map((f) => f.source), ...(p.byVerify ? Object.values(p.byVerify).map((b) => b.source).filter(Boolean) : [])])];
  lines.push(`  출처: ${src.join(' ; ') || '-'}${x.facts.some((f) => f.proposal && f.result !== 'true') ? '  [제안 사실 미확인]' : ''}`);
  return lines.join('\n');
};
const fixes = all.filter((x) => x.verdict === 'fix'), drops = all.filter((x) => x.verdict === 'drop');
P(`3-1. fix ${fixes.length}`);
for (const tp of topics) { const a = fixes.filter((x) => x.topic === tp); P(`-- ${tp} ${a.length}`); for (const x of a) P(row(x)); }
P('', `3-2. drop ${drops.length}`);
for (const x of drops) P(row(x));
P('');

P('=====================================================================', '4. 경계 · 미확인 · 판정자 사이 갈림', '=====================================================================');
P(`4-1. 문서로 못 닫은 질문·해설 주장이 남은 ok ${kn.length}건 — 적재 전 G007 이 다시 열거나 보류: ${kn.map((r) => r).join(' · ')}.`);
P('  · M1-06 관심법 · M1-09 부라보콘 · M1-16 빅마마(나무위키 403 — 방송 주제가·CM송·뮤직비디오 세부가 다른 문서에 없음) · M1-03 "고요 속의 외침" 게임 · M2-14 화룡도 "으뜸" · K1-05 사택적덕 · H1-17 기소 "3월" · K1-17 "2월" · K1-14 편지 110자 · H2-04 템플 기사단 전설 · H2-18 한비/한비자 · K2-06 두들마을 석보면 · H2-05 허영의 소각 세부 · L1-19 사자=용기 · K3-01 이충 식사 일화 · H2-01 지롱드 표기. (모두 질문·해설이 문서보다 약간 단정적이거나 요약 모델이 문장을 못 찾은 경우 — 거짓으로 본 것은 없음.)');
P(`4-2. 문서로 못 닫은 힌트 주장이 남은 ok ${knH.length}건: ${knH.join(' · ')} — K3-01 잡채 "사삼각로" · K4-07 하오체 "부부 사이" 는 G005 가 지식 힌트로 표시한 것(광해군일기·높임말 문서 밖).`);
P(`4-3. 판정자가 "애매" 로 표시한 ok ${S.amb}건 — 직접 읽은 것은 위 32 중 일부. 선이 갈릴 만한 꼴: ① 인물/작품을 한 걸음 거치는 힌트(리베라 · 훔멜 협주곡 · 1994 210안타 — 둘은 뒤집음) ② 줄거리 요지(세비야의 이발사 · 아키라) ③ 정의가 질문에 같이 있는 낱말 문제(뚱딴지 · 만장 · 하오체) ④ 2회차 범주 단서(S1-23 · S1-21 ok vs L3-02 drop) → CV-11·CV-15.`);
P('4-4. 제안이 없는 fix: K4-06 하소서체(두 번째 줄 사실을 문서로 못 찾음) · K4-02 개차반(사전에 용례·유래 없음) · K4-26 머슴날(문서의 사실을 질문·해설이 다 썼고 남은 것은 다른 이름뿐 — H10). 15 H8: 정말 없으면 비우고 목록으로 보고.');
P('4-5. 변형 경계(CV-16): S1-07 해태 타이거즈 — KIA·기아 타이거즈는 같은 구단의 지금 이름인데 질문이 1982 원년을 묻는다 · S2-01 코비 — "코비" 는 B5(불필요한 축약)와 A3(짧은 쪽) 사이 · C1-27 뱀장어 — "장어" 는 B7(넓은 말)이라 넣지 않았으나 한국인이 많이 침. S2-36 "알리" 는 뺐다.');
P(`4-6. 판정자 ${r2.disagreeTop.length}건 갈림(2차 채점자 r2 와 상/상 아님이 다른 것): ${r2.disagreeTop.map((d) => `${d.ref}(${d.judge}/${d.rater2})`).join(' ')} — 첫 판정자 값이 results.json items[].dif 이고 r2 값은 rescoreVsGen.rater2 에 있다.`);
P('');

P('=====================================================================', '5. 같은 정답 누적 · 중복', '=====================================================================');
P('- 이번 정답 493 의 활성+이번 누적: 1건 443 · 2건 50 · 3건 이상 0(G005 와 같음 — 정답 기준 / 별칭 일치 포함 52). 2건인 52 의 판정: ok 27(그중 dup 표시 18) · fix 16(그중 dup 8) · drop 9 — dup 범주가 붙은 drop 은 3(K3-14 · H2-08 · L2-07 — 1회차 해설과 같은 연결/사실), 나머지 drop 은 3-3 범주 단서다. D6(애매하면 살린다)으로 살린 것: L1-21(활성 #1249 해설과 같은 사실) · S2-18(활성 #3735 해설과 같은 사실 — 질문 지식이 달라).');
P('- H12(힌트가 같은 정답 활성 문항의 질문·해설과 같은 사실): K3-13 청국장(1회차 #997 의 빠른 발효) · S1-05 지명타자(1회차 #791 해설) — 2건만 걸렸다. 같은 정답 활성 문항은 이번 힌트 생성 때 hint-input 으로 받았다.');
P('- 별칭 일치 활성 문항 3(aliasMatchActive)은 모두 지식이 달라 중복 아님.');
P('');

P('=====================================================================', '6. 반복되는 오류 유형 — deep-v4 · media-v3 · hint-v4 · score-v2 에 되돌려 줄 꼴', '=====================================================================');
P(`1) 힌트가 대표 사실/정체(famous-one ${famous.length} — 힌트 464 의 ${pct(famous.length, 464)}): hint-v4 의 "쓰는 순서 10" 이 있었는데도 4건 중 1건 꼴이다. 가장 흔한 꼴: ① 질문에서 빼낸 쉬운 단서를 힌트로 옮김(rewrite 가 질문의 쉬운 단서를 지우고 힌트에 되살림 — 다부동 "경북 칠곡군 가산면" · 동래성 "싸우려면 싸우고…" · 황산대첩 "아지발도" · 펠레 "코스모스") ② 나라·도시·산·섬의 기본 정체(경기도 수도권 · 영종도 인천대교 · 주산지 주왕산 · 지브롤터 헤라클레스의 기둥) ③ 정의/대표 쓰임("시험 붙으라고 선물하는 엿" · "탄닌을 우려 앙금으로 쑨다" · "구멍 난 조각 여러 장 — 스위스 치즈 모델"). → 힌트 지시에 "rewrite 가 지운 쉬운 단서를 힌트에 쓰지 않는다"와 "정답 대상의 소재지·대표 쓰임·정의를 쓰지 않는다"를 더한다.`);
P('2) 질문 되풀이(question-repeat 15): 힌트가 질문의 조건 문장을 다른 말로 다시 한다(왕이 직접 연주 · 빠듯한 일정 · 흑백 세로줄).');
P('3) 힌트의 사실 오류(h-error 11): 한 갈래(PCUSA 만)를 개신교 전체로 · 서석대 설명을 입석대에 · "유일한 방법" 단정 · 비수류 어원 · 2024 라이즈 → 2025. 힌트의 연도·소속·"모두·처음" 은 문서 문장과 글자 대조(hint-v4 순서 10 — 지켜지지 않은 곳).');
P('4) 2회차 3-3: 34 중 9 drop. 범주 단서(점술 카드 · 국수 요리 · 신문 낱말 퍼즐 · 짝을 고르는 날 · 프랑스어 느낌 · 20번 돌려 푸는 풀이)가 질문에 그대로 들어간다. 새 사실(제블랭·에테이야 · 카스마)이 꾸밈이 된다. → deep-v4 §3-3: "1회차 정답의 정의 문장을 이 질문의 단서로 쓰면 범주 단서이다" 를 쓰기 전 점검에 더한다.');
P('5) rewrite 의 부작용: 쉬운 단서를 지우다 정답이 넓어짐(L2-27 치마류 · C2-08 유도 전류 → 소용돌이 한정) · 대상이 흐려짐(L2-28 "이것") · 문서보다 단정적인 보조 서술이 남음(K3-08 · M1-10 · L3-01 · L1-11). → 고침 에이전트가 "고친 뒤 정답이 유일한지" 를 한 번 더 기계/눈으로 점검.');
P('6) 변형 누락: 한국에서 흔한 표기(스테인레스 · 보스포러스 · 노스트로모호 · 벤포드 법칙 · 퉁구스카 폭발)가 빠지는 꼴 20 안팎 — V007 6절과 같다(검색 확인은 했으나 쓰임을 문서로 못 닫은 것이 많다). 반대로 B2(이름 요구 질문에 일반어)와 B7(넓은 말)이 4건.');
P('7) 난이도 채점: GEN 의 score-v2 채점자(다른 에이전트 4~5개)는 62% 를 상으로 매겼고 blind 판정자 둘은 30~38% 였다. 차이의 대부분은 "쉬운 충분 단서" 를 질문 문장 어디에 두느냐다 — 질문의 앞부분에 정답을 거의 정의하는 문장이 있으면 판정자는 그것을 쉬운 단서로 잡는다. → score-v2 에 "질문의 모든 문장을 하나씩 읽고 그 문장만으로 풀리는 사람이 있는지 본다" 를 더한다.');
P('8) (좋은 점) 사실: 질문·해설 사실 오류는 거의 없다(false 7 중 질문·해설은 3 — K3-08 · M1-10 · H1-08). 무작위 재확인 40 틀림 0. 질문 숫자 대조를 생성 단계에서 한 효과가 보인다. 정답 노출 0, 새 규칙 ① 1건 · ② 3건으로 적다. 미디어 알 가치 2 도 MD10 으로 거의 통과.');
P('');

P('=====================================================================', '7. 자기 점검', '=====================================================================');
P('- 실행 모델 Sonnet 5.5. 판정자 8조각·확인자 7개·r2 도 같은 모델 — GEN(Opus 5.5)과 달라 독립성은 유지. 이 라운드가 Sonnet 으로는 세 번째라 판정자 ok 가 느슨하다는 교훈 E 를 감안해 재독 범위를 숫자로 적었다.');
P(`- 직접 재독: 판정자 fix·drop 192 전부 + 판정자 ok 32(시드 고정 무작위, 10.6%) + 사실 불일치로 올라온 것 전부. 뒤집기: 판정자 ok 32 중 2(6%: S1-19 이치로 · S2-22 제시 오언스 — 둘 다 힌트가 대표 기록/사건이라 CV-11) → 10% 를 넘지 않아 ok 전체 재독은 하지 않았다. 판정자 fix·drop → ok 로 되돌린 것: 0. 제안 교체 ${S.proposals.byVerifyReplaced.length}.`);
P('- 교훈 A 인용은 입력에서 가져왔다 · B 세기만으로 fix 한 것은 없다(판정 문장에 걸릴 때만; 단 CV-11 확정 뒤 "대표 사실/정체" 를 fix 로 읽는 선이 판정자마다 다르다) · C 같은 정답 문항 52 는 sameAnswerActive 와 함께 읽었다 · D 못 한 것을 숫자로(1절) · E 판정자 ok 재독 32 · F 보정 표본 10 · G blind 칸은 쓰지 않았다.');
P('- 한계: ① 난이도는 읽기에 민감하다(경계 표시 409 — 3/4 선) ② 판정자 조각 사이 fix 비율 23~46% 차이(CV-11 엄격도) ③ 사실 — 판정자가 true 로 닫은 ok 의 웹 근거는 무작위 40 만 재확인 ④ 제안 새 사실의 약 57% 는 판정자 웹 근거 그대로 ⑤ 나무위키 403 으로 미디어 6건은 문서로 못 닫음 ⑥ 판정자·확인자 횟수는 자기 보고 값.');
P('- DB 는 읽기 전용(대조·누적 집계)만 썼다. 제안 문구에 줄바꿈 없음 · 제안 힌트 checkHint 막힘 0(기계 확인).');
P('');
P('새로 생긴 결정 필요 항목');
P(`- CV-14 — 상(4~5) 재채점 신뢰: GEN 307(62%) → blind ${V.newTop}(${pct(V.newTop, 493)}), r2 도 30%. DB difficulty_score 에 어느 값을 쓰나(G004 는 V007 값을 썼다 — 같은 방침이면 blind dif 사용 → 상 풀 718+${newTopND}), 3/4 경계 ${244 + 165}건은 어떻게 할지(두 채점자가 모두 4 인 것만 상으로 칠지). 풀 추정: 상만 ${pool(718, newTopND)}.`);
P('- CV-15 — 2회차 3-3 drop 9(34 중 26%): 새 사실이 있어도 범주 단서만으로 풀리면 버리는 선(CV-10)을 이번에도 같은 기준으로 적용했다. D6(애매하면 살린다)과 충돌하는 경계가 4건(L3-02 · K3-14 · L3-12 drop vs S1-23 · S1-21 ok). 선이 맞는지, drop 대신 질문의 범주 단서를 빼고 다시 쓰게 할지.');
P('- CV-16 — 변형 경계 3건: S1-07 해태 타이거즈(KIA·기아 타이거즈는 같은 구단 — 질문은 1982 원년) · S2-01 코비(B5) · C1-27 뱀장어("장어" B7). 기본값 제안: S1-07 은 받는다 · 나머지는 B5/B7 대로 뺀다.');
P(`- CV-17 — 문서로 못 닫은 주장이 남은 ok ${kn.length}건(질문·해설) + 힌트 ${knH.length}건 + 미디어 나무위키 6: 적재 전 반드시 닫을지, 층/알 가치 판정은 ok 이므로 그대로 적재하고 G007 이 가능한 것만 닫을지. 기본값 제안: 문서로 못 닫은 질문 주장은 G007 이 방송/기사로 닫아 보고 못 닫으면 제외 하지 않고 "지식 근거" 표시.`);
P('');
P('고친 문서', '- ai-out/V009.txt (이 문서) · data/pipeline/audit/v009-results.json · data/pipeline/audit/v009-raw/ (RUBRIC · STATE · 조각 p1~p8 · 확인 x1~x4 · y1~y2 · r2 · _work/) · docs/13-PENDING-CHECKS.md (C67 · CV-14~17 · 머리글) · ai-out/README.md (V 표 V009)');

fs.writeFileSync('C:/work/quiz-web/ai-out/V009.txt', L.join('\n') + '\n');
console.log('lines', L.join('\n').split('\n').length, 'bytes', Buffer.byteLength(L.join('\n')));
