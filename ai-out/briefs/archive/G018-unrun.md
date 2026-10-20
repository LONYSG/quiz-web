> ★ 미실행(2026-10-21 설계 에이전트) — 찬종 "일단 문제 더 만들어보자" 로 G018 번호를 상 생성 4차에 넘겼다. 이 내용은 V021 반영과 묶어 **G019** 로 다시 쓴다(번호 DG- · C- 는 그때 다시 센다).

[GEN G018]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 짧은 라운드 — 하나만 · 끝나면 멈춘다)
TASK: **V020 반영 라운드** — ① 미니게임 CV-59 (b)(photo-0207 · 0141 altAnswers 비우기 + 그림 판단 → items 파일 → 재적재) ② 애매 재판정 fix 10 · drop 2(CV-61) ③ unverified still 7 낮추기·빼기(CV-62) ④ 행정 구역 개편 영향 16(CV-60 — 도 이름 빼기 기본) ⑤ V018 힌트 ambiguous 4(C79 ②) ⑥ 중(3) 힌트 빈 칸 16 한 번 더 찾기(H8 새 줄). **생성 없음**(상 4차는 찬종 답 뒤 — G019)
실행 모델: Opus 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — 다음 **DG-056 · C80 · CV-64**(07 · 13 을 보고) · Q 는 올리지 않는다). 하위 에이전트 ≤1(사실 재확인 조각) · 메모리 1.5GB · 429 면 같은 모델로 이어서.
■ ★★ 동시 라운드 — VERIFY(V021 — g009a/b "애매" 나머지 약 315 전수 + G017 반영 표본 — **questions 읽기만** · audit/v021-* · 13 CV · README V 표). MAIN 은 쉰다. GEN 몫: **questions · question_answers**(백업 뒤 · 대상 행만) · `data/minigame/photo/items*.json` · **minigame_items**(재적재 — 백업 뒤) · scripts/g018-* · audit/g018-* · 05 · 06 · 07 DG- · 13(아래 끝 표시) · docs/18 7절 한 줄(재적재 기록) · README G 표. git: 내 파일만 · fetch → rebase → push. 찬종 없이 간다 — 묻지 말고 13 C 에 적는다.
■ 토큰: 넉넉하다 — 항목 수는 적다(약 50) · 하나하나 문서로 닫는다.

■ 먼저 읽기
- **ai-out/V020.txt 0 · 2 · 3-A · 3-B · 3-C · 3-D · 4절** · `audit/v020-minigame.json`(human.items — photo-0207 · 0141) · `v020-ambiguous.json`(items[] key · id · verdict · categories · proposal · facts · boundary · dbDifficulty) · `v020-unverified.json` · `v020-admin.json`(affected 11 · date-limit 5 · already-ok 11)
- 13 **CV-59 · CV-60 · CV-61 · CV-62 · CV-63 · C79** · ai-out/G017.txt 0절 ②(힌트 빈 칸 31 → 16 · 남은 16 목록은 `audit/g017-fixes.json` 또는 DB 에서 다시 센다) · `audit/v018-hints.json`(ambiguous 4 — M1-23 · L1-28 · C2-14 · K1-19 · 판정 갈림)
- docs/15 §3-2(한정어) · §3-3(2회차 범주 단서) · §4-1 H8(새 줄) · H9 · docs/18 7절 · `scripts/minigame-load.mjs`(같은 id 재적재 = 갱신) · `scripts/g016-apply-v017.mjs`(items 파일 고치는 꼴) · `scripts/g017-apply-active1.mjs`(questions 반영 꼴 — 복제)

■ 찬종의 말 · 확정 · 설계 판단(2026-10-20)
- "퀄리티 있는 문제 수 늘리는게 우선이야." · "이미지 없으면 몰입이 안돼."
- **CV-59 (b)** — 다식 · 다식판은 다른 음식 · 다른 도구라 정답으로 받지 않는다(CV-51 설계 판단을 뒤집음 — V020 판정자 근거 채택). photo-0207 약과 · photo-0141 떡살: altAnswers 에서 다식 · 다식판을 빼고, **그림을 직접 보고** 그 사진만으로 약과/떡살이 하나로 보이면 그대로 · 혼동될 만하면 더 분명한 공용 그림으로 교체(g008-img) · 못 구하면 rejected(쉬게 함). items 파일 status 는 loaded 그대로 두고 값만 고친 뒤 `minigame-load --apply`(갱신) → DB 값 = 파일 값 확인.
- **CV-60 도 이름 빼기 기본** — affected 11 은 V020 제안대로 "전남/전라남도" 를 빼고 군·지명만 남긴다(#1819 는 "진도에서" · #2347 "남해안의 연안 습지" · #4930 "호남의 고기 요리"). date-limit 5: 출생·출신(#4755 · #4832 · #5775)은 도 이름 빼기 · #4926 방언 분포는 그대로 · #5870 "1988년 (당시) 전라남도" 한정어. already-ok 11 은 손대지 않음. **대전충남 · 대구경북은 법령이 없으니 손대지 않는다.** 바뀐 문장도 15 §3-2 한정어 규칙(묻는 문장만 읽고 답이 하나인가)을 지킨다 — 도 이름을 뺐더니 답이 둘 이상이면 다른 단서를 더한다(해설 정보 끌어오지 않고 문서에서).
- **CV-61** — fix 10 반영(변형 5 — S1-02 야구 장갑 · 글로브는 한국 쓰임을 문서(사전 · 기사)로 확인한 뒤 · 힌트 famous-one 3 · h-error 2 는 제안 힌트를 문서로 열어 교체) · drop 2(L2-31 #5269 · S2-12 #5690)는 GEN 이 15 §3-3 으로 다시 읽어 범주 단서가 맞으면 `is_active=false` · `inactive_reason` "3-3 범주 단서(V020)" · 아니면 그대로 두고 13 C 에 한 줄. 난이도는 바꾸지 않는다(blind 85% 같음).
- **CV-62** — still 7 은 제안대로: #1036 곰비임비 용례 문장 빼기 · #3811 연밥 씨 개수 문장 빼기 · #666 "딱 하나만" 낮추기 · #1215 · #594 soften(V020 제안 문장) · #675 · #2557 은 그대로(unverified 표시 유지). 닫힌 7 중 #2137 "광 패" → "비광 패".
- **C79 ② V018 ambiguous 4** — famous-one 이면 교체(문서로) · 아니면 그대로 · 표로.
- **힌트 빈 칸 16** — H8 새 줄대로 문서에서 두 번째 줄 사실을 한 번 더 찾는다(하위 에이전트 1 · 후보 1~2개씩) → 쓴 것 · 못 쓴 것 목록(0 에 가까워야 — 못 쓴 것은 사유).
- 변형 · 사실 기준은 DG-051 · DG-053 · DG-055 그대로.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 미니게임 — CV-59: 그림 2 직접 보기 → 판단 표 → `scripts/g018-apply-v020-mg.mjs`(items 파일 값 고침 · audit/g018-fixes.json parts.mg) → `npm run db:backup` → `minigame-load --apply` → DB ↔ 파일 같음 · 멱등. 다 됐다 = 0207 · 0141 전/후 + 그림 경로.
B. questions — `scripts/g018-apply-v020.mjs`(g017 복제 · 멱등 · before 대조): 애매 fix 10 · drop 2 · unverified 7 + #2137 · 행정 구역 16 · V018 ambiguous 4 · 빈 힌트 16 → 결정 `audit/g018-decisions.json` → 기록 `g018-fixes.json`(rows · notTaken) · hint-check 막힘 0 · 대상 밖 해시 같음. 다 됐다 = 묶음별 표(건수 · 반영 · 받지 않음).
C. 실측 — 활성 · 난이도별 · 3~5 힌트 빈 칸 · 상만 판 수 · 질문 200자 초과 0 · 미니게임 loaded 수.
D. 문서 — 05 · 06 · 07 DG-056 · 13(CV-59 · 60 · 61 · 62 끝 · CV-63 메모 · C79 ② 끝 · C80) · docs/18 7절 한 줄 · README G 표 · `ai-out/G018.txt`(0절: 표 — 미니게임 2 전/후 · 애매 12 · unverified 8 · 행정 구역 16 전/후 문장 · ambiguous 4 · 빈 힌트 16 결과).

■ DB 쓰기: **허용**(백업 뒤 · questions · question_answers 대상 행 · minigame_items/images 는 photo 2 만). 대상 밖 해시 전후 같음.
■ 웹·토큰 예산: WebSearch **40회 이내** · WebFetch 주 수단 · 하위 에이전트 ≤1.
■ 하지 말 것: 생성 · 다른 미니게임 항목 · server/ client/ shared/ · pipeline 프롬프트 · 15 · 13 A · README R/V · Q · 170~200자 질문 70 · 대전충남·대구경북 문항.
■ 확인할 것 (원칙 7): v020-ambiguous fix 10 · drop 2 · v020-unverified still 7 · true 7 · v020-admin affected 11 · date-limit 5 · 활성 6,044(1: 755 · 2: 1,486 · 3: 2,851 · 4: 949 · 5: 3) · 중 힌트 빈 칸 16 · 미니게임 loaded 1,164 · 마지막 DG-055 · C79 · CV-63 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것 → 원칙 메모 → A~D → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "G018 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
