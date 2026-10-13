# V006 진행 상태 — 중단 지점 (2026-10-13, 모델 교체를 위해 멈춤)

브리핑: `ai-out/briefs/verify.md` (V006). 기준: `RUBRIC.md`(이 폴더). 작업 파일 사본: `_work/` (원본은 세션 scratchpad `.../scratchpad/v6/` — 같은 세션이면 그쪽을 쓰고, 새 세션이면 `_work/` 의 스크립트 안 `SC` 경로를 바꿔 쓴다).

## 끝난 것
- 원칙 7 건수 확인 — 전부 브리핑과 일치 (1,328 · 길 분포 · gen 9 · 63/2/1 · 겹침 23 · DB 대조 차이 0 · 15 §4-1 은 G001 문구). `_work/summary.json`.
- A. checkHint 전수: 막힘 0 · 경고 17(16건: explain 13 · partial-mid 2 · roman 2) — 전부 직접 읽음: 우연·다른 사실 15, 다른 이유로 fix 2(#3559 소닉 · #3809 튤립). `_work/override.json` 의 mechRead.
- 보정 표본 10건(748 · 1838 · 2816 · 3745 · 591 · 1859 · 3227 · 1846 · 1866 · 3150): ok 8 · fix 2(591 진폭 변조 · 3227 문화 지체 — 유래 길 뜻풀이) → RUBRIC 고정.
- GEN 표시 9건 직접 판정: fix 6(39 · 752 · 880 · 1210 · 3382 · 3480) · ok 3(474 · 1198 · 3376 경계선). `_work/override.json`.
- D. R032 66건 직접 판정 완료 — `_work/r032-judge.json`: edits ok 62 · fix 1(#85 오프사이드 — after 의 '패스를 받는 순간' 이 규칙과 다름, 제안 문구 있음) · variants 2 ok · deactivate 1 ok. 표본 10 웹 확인 10/10 맞음(#1689 전남광주통합특별시는 '통합특별시' 분류 경계선 메모). 참고: #741 상 힌트가 새 질문과 H3 겹침, #352·#2874 힌트는 (가)에서 fix.
- E. C61 #3930: fix(H4 가벼운 겹침) + 제안 힌트(부댕 베이커리 1849 — web). `_work/build.mjs` 안 ref 에 들어 있음.
- B. 판정자 조각: **c01~c04 완료(103씩 · 순서 대조 일치)** · c05 60/103 저장(중단) · c06~c13 미시작. 판정자 출력 = `cNN.out.json`.
  - VERIFY 재독 끝: c01~c04 의 fix·unsure 전부 + 판정자가 애매하다고 표시한 ok (`_work/reread-log.json`). 뒤집은 것: 365 ok→fix · 3378 fix→ok · 1055 ok→fix · unsure 7건 → fix (`_work/okread.json`).
  - 지금까지 판정자 fix 비율 약 25%(109/412) — 유래 길의 뜻풀이(①)·연결 길의 대표 사실(②) 꼴. 세기만으로 fix 한 것은 없음.

## 남은 것 (순서)
1. 판정자 c05(57번째부터 이어서) · c06~c13 — 한 번에 4개 이내. 프롬프트는 이 세션의 c08 프롬프트와 같다(RUBRIC 경로 · `_work/cNN.txt`·`cNN.json` 입력 · `cNN.out.json` 출력 · 20건마다 저장 · WebSearch 8회 이내 · 끝나면 개수·순서 대조).
2. 조각마다 fix·unsure 전부 + 판정자 애매 표시 ok 를 VERIFY 가 읽고 `okread.json`(뒤집기) · `reread-log.json`(기록) 갱신. 기준: 보통 성인에게 유명한 대표 구절·정체·뜻풀이면 fix, 전문가만 아는 연결·외국어 어원은 ok(교훈 B).
3. `node sample.mjs ok` → 판정자 ok 10% 무작위 재독(`oksample.txt`) → 뒤집은 비율 7절에(10% 넘으면 ok 전체 재독).
4. `node sample.mjs true60` → 판정자 true(knowledge) 주장 60 표본 → WebFetch 로 확인 → `true60.json`({id:[{claim,result,source}]}) + `report-meta.json` 에 `true60` 요약·`web`(WebSearch 사용 횟수 — 지금까지 판정자 3+3+3+4 = 13회, VERIFY 직접 0회).
5. `node build.mjs` → `data/pipeline/audit/v006-results.json` + `nonok.txt` · `unverified.txt` · `shape.txt` · `shape-candidates.txt`(기계 후보 — 판정자가 shape 를 안 붙인 것, 읽어서 보정).
6. 보고서 `ai-out/V006.txt` (16 §4 헤더 · 0~7절 · 2-0 보정 표본 · 2-2 길별 · 2-3 사실 · 2-4 R032 · 2-5 C61 · 4절 GEN 9·shape 목록·미확인 · 5절 같은 정답 쌍에서 힌트 = 다른 쪽 질문인 것 · 6절 hint-v3 되돌릴 꼴 · 7절) · 13-PENDING(C60 나 · C55 · C61 · CV-04~) · README V 표 → 커밋(허용 다섯 곳만) · push.

## 메모
- 같은 정답 쌍(148 묶음 299건)에서 한쪽 힌트가 다른 쌍의 질문과 같은 사실인 경우가 많다(341↔3424 · 1014↔3659 …) — 5절 목록 후보, reread-log 의 note 에 적어 둠.
- 힌트 밖 참고: #1148 해설 '2018 평창 은메달' 은 이상호 평행대회전(하프파이프 아님) — GEN 전달.
- 판정자가 "정답이 뜻 하나인 낱말(소리·시그널·협동)은 제안 힌트가 약하다" 고 표시 — 4절.

## 갱신 (모델을 Sonnet 5.5 로 바꾼 뒤 · 사용량 한도로 멈춤)
- 판정자 c01~c13 전부 완료(1,328 · 순서 대조 일치). 내가 fix·unsure 전부와 애매 ok 를 재독 → `_work/okread.json`(뒤집기) · `reread-log.json`.
- ok 10% 표본 81건 재독: 뒤집은 것 2(#96 리눅스 · #1156 탈레스) = 2.5%. 사실 표본 60 웹 확인: 참 53 · 거짓 1(#3842 우드스톡 40만/사흘 → 46만+/나흘) · 미확인 6 = 오류율 1.7%.
- `node _work/build.mjs` 가 `data/pipeline/audit/v006-results.json` 을 만든다(ok 844 · fix 484 · 제안 block 0). 제안 문구 18건은 `_work/propfix.json` 으로 고침.
- 남은 것: ① facts 가 비어 있는 57건(주로 fix 가 판정자 재독에서 확정된 것)에 주장 한두 개씩 채우기 ② doubt 인데 웹 확인 못 한 5건(#2182 #2264 #2385 #3054 #3081) 웹 확인 또는 4절 미확인 ③ ai-out/V006.txt 생성(0~7절, 3절은 fix 484 + R032 #85 + #3930) ④ 13-PENDING(C60 나 · C55 · C61 · CV-04~) · README V 표 ⑤ 커밋(허용 다섯 곳만, 트레일러 Co-Authored-By: Claude Sonnet 5.5) · push.
- 메모: 판정자 fix 비율 높음(34~70%) → 7절에 적을 것. 판정자 모델은 Sonnet 5.5 로 바뀐 뒤 c05(61~103) 이후 사용 — 0절에 적을 것. 힌트 밖 참고: #1148 해설 오류 · #1211 질문의 40만/사흘 · #741 상 힌트 H3.

## 완료 (2026-10-14)
V006 보고서·결과·13-PENDING·README 모두 끝. 커밋·push 는 아래 커밋 참조. 이 STATE 는 기록용이다.
