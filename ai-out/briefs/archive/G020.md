[GEN G020 — 묵은 판정 반영(V020 · V021 · V023 · V025 · V026) · g019 적재 · 친숙도 1 확정 246 비활성 · 제보 문항 4 · ★ DB 쓰기 허용(questions · question_answers)]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: VERIFY 가 쌓아 둔 결정을 한 번에 DB 에 반영한다 — 13 **CV-60~62 · 64~68 · 71 · 84~90**(찬종 결정 2026-10-26: 설계 기본값대로 · 아래 ■ 결정) + 찬종 제보 문항 4(#2411 · #1531 · #841 · #2122) + **g019a/b 적재**(691 − drop 4 − 격리). ★ 문항 **생성은 중단**(찬종 2026-10-25) — 이번은 반영·적재만. ★ 난이도는 곧 v2 로 전수 재판정된다(docs/19 · VERIFY V027 이 지금 돈다) → 이번에 적재하는 g019 의 difficulty_score 는 **blind 재채점 값(판정자)** 그대로 넣고, 기존 활성의 등급은 **건드리지 않는다**(CV-66 #2051 등 등급 조정 제안은 전부 v2 재판정에 맡긴다).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13 CV 끝 표시 "끝(G020)" · README G 표 · **DG-059** 부터 · 07). **DB 쓰기 허용 — questions · question_answers(변형) · 적재 테이블**. 쓰기 전 `npm run db:backup`. 모든 쓰기는 `scripts/g020-apply-*.mjs` 로 **멱등** · 되돌리기 파일(`audit/g020-undo.json` — 바꾼 행의 전 값) · 바꾼 수를 0절 표로. 하위 에이전트 ≤1 · 남는 메모리 1.5GB.
■ ★★ 동시 라운드 — **VERIFY V027**(난이도 재판정 1라운드 — 시작 직후 대상 약 1,000 을 `audit/v027-targets.json` 에 고정 · DB 읽기만)이 같이 돈다. G020 이 기존 활성의 변형·힌트·질문을 고치면 V027 사본과 달라질 수 있다 — 괜찮다(V027 이 끝 점검에서 센다). ★ **V027 이 보는 문항(v027-targets.json 의 id)은 비활성하지 않는다** — 246 비활성 대상과 겹치면 그 id 는 건너뛰고 0절에(겹침 수). MAIN 은 쉼. GEN 몫: data/pipeline/generated/g019a · g019b(fix 적용) · scripts/g020-* · audit/g020-* · docs 13 · 05 · 06 · 07 · README · G020.txt. 05 · 06 · 13 · README 는 쓰기 직전 fetch · rebase · 내 파일만 add · force 금지. **실 서버(3000)가 떠 있으면** 쓰기 단계는 열린 방·판이 없을 때(ops 상태 · games.ended_at NULL 0) — 0절에 시각.
■ 먼저 읽기: 13 **CV-60 · 61 · 62 · 64 · 65 · 66 · 67 · 68 · 71 · 84 · 85 · 86 · 87 · 88 · 89 · 90 전부** · `audit/v020-admin.json` · `v020-ambiguous.json` · `v020-unverified.json` · `v021-ambiguous.json`(items[key].proposal · finalVerdict) · `v021-g017.json` · `v023-cross.json`(mid/top[id].confirmed · verifyLikely2) · `v025-results.json` · `v026-results.json`(items[ref].verdict · proposal · layer · contextBound) · ai-out/V026.txt 3·4절 · V025.txt 3절 · G019.txt 5절(게이트 · 적재 묶음) · scripts/pipeline-load.mjs(--round g019a,g019b · --gate-only · --dry-run) · scripts/g014-apply-active3.mjs · g013-apply-v015a.mjs(기존 활성 고치는 멱등 스크립트 꼴) · **docs/19-DIFFICULTY.md §8**(제보 문항 4 를 고칠 때의 읽기 규칙 · 8-3 에 #841 · #2122 고침 예가 있다 — 그대로 써도 된다) · 15 §3-1 · §3-2.

■ 결정(찬종 2026-10-26 "제안대로" — 설계 기본값)
- CV-60 행정 구역 16: affected 11 은 **도 이름 빼기**(제안대로 — "보성군" 꼴) · date-limit 5 는 **날짜 한정어**("2026년 6월까지" 꼴 — 제안 문장) · 질문 사실 불변 확인.
- CV-61 fix 10 · drop 2 반영(S1-02 변형은 문서 확인 뒤).
- CV-62 still 7: 제안대로 문장 낮추기·빼기(#1036 용례 빼기 · #3811 씨 개수 문장 빼기 · #666 "딱 하나만" 낮추기 · 나머지는 그대로 unverified).
- CV-64 fix 92 · drop 2(L1-28 · L1-35) 반영 — 순서: 변형 37 → 힌트 41 → 질문 19. 지식 근거 변형 5 는 한국어 쓰임을 열어 확정(못 닫으면 안 넣고 0절에).
- CV-65 (a) refill 14 전부 H9 로 다시 읽어 걸리는 것만 새 힌트 또는 비움(#2228 은 비움).
- CV-66 #2051: 제안 힌트는 문서 근거 확인 뒤 채움 · 변형 "압축열" 빼기 · 난이도는 안 바꿈(v2 재판정).
- CV-67 경계 6 은 ok 유지(drop 2 만).
- **CV-68/71: 확정 268 − "2 로 보임" 22 = 246 비활성**(`inactive_reason "친숙도 1(V023)"` · 되돌리기 목록 · 경계 182 는 그대로 · ★ v027-targets 와 겹치면 건너뜀).
- CV-84 a/b fix 211 · drop 4: generated/g019a · g019b 파일에 proposal 적용(힌트 · 질문 · 해설 · 변형 · 층) → 게이트 다시 → 적재. 한국어 쓰임 못 닫은 변형(피쉬아이 · 연속기 · 알리 외 · 터보 · H2-16 · M2-27 · S2-15 · H2-15 · C1-21 · M1-20 · M2-02)과 문서 요약으로만 닫힌 새 힌트 사실(C2-17 · K2-17 · S1-10 · H2-16 · C1-10 · S1-23 · M1-13)은 **열어 확인** · 못 닫으면 안 넣음. CV-79 의 ⓐⓒ ok 14 는 H9 로 한 번 더 읽어 걸리면 새 힌트/비움.
- CV-85 (a) 경계 · 근접 유지. CV-86: 생성 규칙 메모만(15 는 설계 몫 — 0절에 "질문 쪽 쉬운 단서 규칙 필요" 한 줄).
- **CV-87 contextBound 11: 힌트 비움(H0 예외 — hint null · hintNote "정답이 맥락 자체")** · 단 S1-15 · L1-06 은 판정자 제안 힌트(더 먼 사실)를 문서로 닫으면 그것으로.
- CV-88 (b) 룩 · 예거마이스터 알 가치 재채점 — 3 이상이면 격리 풀고 적재 · 아니면 격리 유지. 나머지 4 격리.
- CV-89 제안대로(S1-21 "1973~74년 시즌부터" · disputed · K2-14 헤지 · K2-26 그대로 + 힌트 비움 · S2-24 브라들 안 씀).
- CV-90 (a) media 층 21 고침 · sports 층 없음 유지.
- 제보 문항 4(찬종): **#2411** 정답 "늘어나고 줄어든다" → 단답 꼴("열팽창" — 질문을 "…현상은?" 으로 · 변형 "열 팽창 · 열팽창 현상") · **#1531** 카논 — 주어 둘 → 19 §8-2 로 고쳐 씀 · **#841** 이온결합 → 19 §8-3 의 고침 그대로 · **#2122** 생물 다양성 → 19 §8-3 의 고침 그대로. 넷 다 app_reports note 에 "G020 고침" 덧붙임(`reports:handle --undo` 가 아니라 note 만 — 이미 처리됨).

■ 할 일 (묶음 다섯 · 커밋 다섯)
A. **기존 활성 고침**(`scripts/g020-apply-active.mjs` — CV-60 · 61 · 62 · 64 · 65 · 66 · 67 · 제보 4): 백업 → dry-run 표(행 · 칸) → 적용 → 되돌리기 파일. 바뀐 문항은 `updated_at` 갱신 · 질문을 고친 것은 `scripts/qcheck` 꼴 기계 검사(200자 · 정답 노출 · 막힘).
B. **g019a/b 파일 반영**(`scripts/g020-apply-g019.mjs` — CV-84 · 87 · 88 · 89 · 90): proposal 적용 · drop 4 제외 · 격리(친숙도 1 a 2 · 알 가치 2 b 6 중 재채점 결과) 제외 · hint-check · 게이트 `pipeline-load --round g019a,g019b --gate-only` N/N.
C. **적재**: 백업 → `--dry-run` → `--apply`(difficulty = 판정자 blind 재채점 값 — v025/v026-results 의 rescore) → 적재 수 = 파일 수 · 같은 정답 누적 3 이상 0 · 실측(상만 · 중+상 · 전체 판 수 · 7묶음).
D. **친숙도 1 확정 246 비활성**(`scripts/g020-deactivate-fam1.mjs` — v023-cross confirmed && !verifyLikely2 · v027-targets 겹침 건너뜀 · 되돌리기 목록) → 실측 다시.
E. 문서 — 13(CV 끝 표시 · C83 ③ 줄에 "G020 적재분 약 680 은 v2 2라운드 대상") · 07 DG-059~ · 05 · 06 · README G 표 · `ai-out/G020.txt`(0절: 고친 수 표(활성 · g019) · 적재 표 · 비활성 246(겹침 제외 수) · 실측 전/후 · 못 닫은 변형·힌트 목록 · 쓰기 시각 · questions 활성 수 시작/끝).
■ 끝 점검: 게이트 N/N · 적재 수 = 파일 수 · `git status` 미추적 GEN 파일 0 · 되돌리기 파일 셋 존재 · 백업 파일 이름 0절.
■ 하지 말 것: 문항 생성 · 기존 활성 난이도 바꾸기 · 15 · 19 수정 · 미니게임 데이터 · client/server/shared · V027 파일 · force push.
■ 확인할 것 (원칙 7): 활성 6,044(시작) · g019a 346 · g019b 345 · drop 4(L1-15 · C2-08 · L2-19 · H1-22) · v023-cross confirmed 268 · verifyLikely2 22 · CV-60 16 · CV-61 12 · CV-62 7 · CV-64 94 · CV-65 14 · 제보 #2411 · #1531 · #841 · #2122 활성 — 다르면 0절에.
■ 커밋: 묶음마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "G020 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
