[VERIFY V034 — 밤샘(혼자 다 한다 · 찬종 자는 중): ① **crossans 2,454 표본 100 판정**(핵심 이름 / 덧붙임 이름 / 오탐 → 흔한 낱말 후보 · 고칠 범위) ② **👎 많은 문항 38 재검토**(문항 자체 — 알가치 · 읽기 · 사실 · 유일성) ③ 열린 답 #2189 · #2653 변형 재독 ④ **실측 대조 — 사람 판 answer_events 로 문항별 정답률·풀이 시간을 VERIFY 가 직접 뽑아(n ≥ 3) 등급과 어긋나는 후보를 19 v2 눈금으로 재판정** ⑤ G029 blind miss 14 + 그대로 둔 unsure 12 동의/반대 · 판정만(DB 쓰기 없음)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 찬종(2026-11-06): "문제는 대체로 좋았다 · **실제 문제 맞히는 시간과 정답률 데이터를 같이 확인해서 데이터를 많이 신뢰하자**". G029 가 넣은 H12 기계 대조(crossans)가 2,454 를 가리키는데 표본 30 으로는 핵심 20 · 덧붙임 10 이었다 — 전체를 어떻게 다룰지(흔한 낱말 목록 · 고칠 범위) 표본 100 으로 정한다. 평가 👎 가 몰린 38 문항과 열린 답 2 는 사람 표가 아니라 **문항 자체**로 본다. 그리고 쌓인 플레이 데이터(사람 판 · 11-01 · 11-05 포함)로 **등급이 실측과 어긋나는 문항**을 처음 뽑는다.
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로 (13 은 **CV-141** 부터 · **C89** 줄 신설(실측 대조 첫 회 + crossans 표본) · README V 표 · 조각 `audit/v034-raw/_work/`). 판정자 하위 에이전트 **한 번에 1~2개** · 남는 메모리 1.5GB(GEN · MAIN 과 셋이 돈다 · 시작 때 재고 0절에 · 1.5GB 아래면 조각 없이 VERIFY 직접). 찬종에게 묻지 않는다(결정은 CV 로). 웹 확인(WebFetch · WebSearch · 키 없는 공개 API — User-Agent `quiz-web-v034/1.0` · 개인 정보 금지) 허용 · 위키 API 429 는 4초 간격 재시도. **DB 는 읽기만.**
■ ★★ 동시 라운드 — **GEN G030 → G031 → G032**(등급 3·4·5 질문 다시 쓰기 · 등급 1·2 힌트 쓰기 · 새 문항 생성 — questions 쓰기) · **MAIN R074**(client · 스크립트 · 0029 는 검사 DB 만). 그러므로 ① ② ③ ④ 의 대상은 **시작 때 한 번 DB 에서 뽑아 고정**(`audit/v034-raw/targets-*.json` — 시각) · G030 이 고치는 질문(160자 초과 · 등급 5)은 ② ④ 에서 "지금 글" 이 바뀔 수 있다 → 고정 사본으로 판정하고 1절에 적는다. 새 문항(G032 · is_active false 로 들어온다)은 보지 않는다.
■ 토큰: 넉넉하다 — 밤새. ① 100 · ② 38 · ③ 2 · ④ 후보 전부 · ⑤ 26 · 줄이지 않는다.

■ 먼저 읽기
- **ai-out/G029.txt 0절 ④ · 7절 ④**(crossans 규칙 — 3글자+ 글자 그대로 · 2글자 낱말 단위 · 같은 정답 무리 제외 · COMMON 목록 · 표본 30 분류 · 오탐 예 '월드 시리즈 오브 포커') · `scripts/hint-crossans.mjs`(COMMON 상수 · 판정 함수) · `node scripts/hint-check-active.mjs --list`(crossans 목록 — 시작 때 한 번 돌려 고정) · docs/15 §4-1 **H12**(★ 설계 2026-11-05 예시 — 핵심 이름은 그대로 · 덧붙임 이름만 뺀다 · 서버 R050 shownNorm 이 보여 준 글에 정답이 든 문항을 뒤로 미룸)
- `tmp/feedback-report.md`(설계 2026-11-06 00:14 · `--no-bots` · "👎 많은 문제 38" 표 — id · 등급 · 분야 · 사유) · docs/19 §8 · §9(알가치 1~3 정의) · docs/15 §3 · V032.txt ⑤ 평가 13 판정 꼴 · `audit/v032-feedback.json`
- **G029.txt 7절 ⑥**(#2189 진로와 거리 · #2653 작가 — V030 이 기존 변형에 맞춘 넓은 변형) · `audit/v030-variants.json` 해당 항목 · V030.txt 2절 규칙 B1~B10
- `scripts/hint-solve-report.mjs`(사람 첫 정답 시각 · 봇 정규식 `^(bot|uic|r10_)` · game_questions.grade/worth · 공개 못 한 문항 제외 — ④ 의 SQL 바탕) · `answer_events`(game_id · question_id · account_id · response_ms · accepted · was_eligible) · `game_questions`(resolved_at · resolution · target_grade · grade · worth · skip_votes_at_end) · `game_players` · `accounts.login_id` · **docs/19 §1~§4**(v2 눈금 · V027·V028 판정 꼴 · `audit/v028-rerate.json` 의 키) · 설계 실측(2026-11-06 00:30 KST): 사람 판(봇·검사 계정만 있는 판 제외) 최근 30일 **57판** · 나온 문항 등급별 1:170 · 2:404 · 3:400 · 4:149 · 5:62 · 전체 hint:solve 표(tmp/hint-solve.md — 등급 4 힌트만 15초 24% · 등급 5 11% · 힌트 없는 등급 1·2 못 맞힘 17%)
- `audit/g029-blind-miss.json`(14) · G029.txt 0절 ■ "그대로 둔 14"(unsure 12 + 평가 1 + 사실 1 · GEN 사유)

■ 설계 결정(이 라운드의 판정 틀 — 여기 적힌 대로)
- ① **crossans 표본 100**(seed 34 · `--list` 결과 2,454 에서 무작위 · 고정): 항목마다 (힌트 문항 id · 힌트 · 걸린 낱말 · 그 낱말이 정답인 다른 문항 id) → 판정 **core**(핵심에 필요한 이름 — 15 H12 예시 · 그대로) / **addon**(덧붙임 — 빼거나 다른 말로 · 제안 문구) / **false**(오탐 — 긴 이름의 일부 · 흔한 낱말 · 조사 붙은 꼴) + 사유 한 줄 → `audit/v034-crossans.json`. 결과 = 비율 셋 · **흔한 낱말 후보 목록**(false 중 낱말 — COMMON 에 넣을 것) · addon 의 꼴 분류(어느 분야 · 어떤 덧붙임) · 2,454 전체 추정(addon ≈ n%) → **CV 한 줄**(처리안: (a) COMMON 넓히고 addon 만 GEN 이 고침 — 표본 밖은 기계로 못 가르니 "addon 꼴 규칙" 을 적는다 (b) 2,454 전부 사람 판정 (c) 그대로).
- ② **👎 많은 문항 38**(`tmp/feedback-report.md` 표 그대로 · 상위 38 — 찬종 표 유무 · 사유 적힌 것 표시): 표 수는 보지 않고 **문항 자체** — 알가치(19 §9 · 1/2/3 과 지금 값 비교) · 읽기(§8 ⓐⓑⓒ ⑨) · 사실(웹 · 출처 둘) · 정답 유일성(다른 답도 맞는가) · 힌트가 핵심인가 → 한 문항 세 줄(의견 · 고칠 것 · 제안) + verdict keep / fix / deactivate-candidate → `audit/v034-feedback.json` → **CV 한 줄**(묶어서 — fix 목록 · 비활성 후보는 설계·찬종).
- ③ **#2189 · #2653**: 지금 대표 정답 · 변형 전부를 읽고 "어느 답까지 받는 게 맞나" — 정답 범위가 넓어 '방향' 하나로도 정답인 게 문제인지 · 질문을 좁힐지(제안 문장) · 변형을 줄일지 → `audit/v034-open-answers.json` → CV 한 줄.
- ④ **실측 대조(첫 회)**: VERIFY 가 SQL 로 직접 — 사람 판(game_players 의 계정 login_id 가 `^(bot|uic|r10_|test$|test2$|timer136$|timer1346$)` 에 **안** 걸리는 계정이 하나라도 있는 판) · 공개된 문항(resolved_at 있음)만 · 문항마다 n(나온 판) · 첫 정답(accepted · 사람) 넷 비율(힌트 전 <10,000ms · 힌트만 10,000~25,000 · 초성 뒤 ≥25,000 · 못 맞힘) · 첫 정답 중앙 ms · 지금 등급(game_questions.grade 있으면 그것 · 없으면 questions.difficulty_score) · 알가치 → `audit/v034-playstats.json`(전 문항 · 방법 메모) + 0절 요약 표(등급별 n ≥ 3 문항 수 · 등급별 평균 넷). **어긋남 후보**(n ≥ 3): 등급 4·5 인데 힌트 전 정답률 ≥ 50% → 쉬움 의심 · 등급 1·2 인데 못 맞힘 ≥ 50% → 어려움 의심 · 등급 3 은 70%/60% → 후보 전부를 VERIFY 가 **19 v2 눈금으로 다시 판정**(V028 꼴 · 지금 등급 · 실측 · 재판정 등급 · 사유) → `audit/v034-rerate.json` → **CV 한 줄**(재판정이 실측 쪽이면 등급 바꿀 목록 — 적용은 GEN · 판정 기준이 틀린 것 같으면 19 후보 한 줄). ★ n 이 작아(57판) 후보가 적어도 그대로 — "첫 회 · 표본 작음" 을 적고, 앞으로 `play:stats`(MAIN R074 가 만드는 중)가 같은 셈을 돌린다.
- ⑤ **G029 miss 14 + 그대로 둔 14**: 힌트를 읽고 동의/반대 한 줄씩(반대면 제안) → `audit/v034-g029-reread.json` → 반대가 있으면 CV 한 줄.

■ 할 일 (순서대로)
A. 0절 준비: 웹 · 메모리 · 고정(crossans 목록 · 100 표본 · 38 · 2 · playstats SQL 결과 · 26) · 시각.
B. ① 100(조각 50 × 2 · 보정 10 은 VERIFY 직접 · fix·addon 전부 재독).
C. ② 38 · ③ 2 — VERIFY 직접(웹 출처 둘).
D. ④ SQL → 표 → 후보 → 재판정(VERIFY 직접 · 후보 ≤ 60 이면 전부 · 넘으면 조각).
E. ⑤ 26 직접.
F. 13: **C89** · **CV-141~**(① 처리안 + COMMON 후보 · ② fix 묶음 · 비활성 후보 · ③ · ④ 등급 바꿀 목록 + 19 후보 · ⑤ 반대) — 항목마다 처리안 + 권장 (a) · 05 · 06 · README V 표.
G. 자기 점검(7절): 표본 · 웹 대조 비율 · 조각 · 메모리 · 동시 라운드 영향(G030 이 바꾼 글을 판정했는지).
■ 보고서 절(16 5-3): 0 웹 · 메모리 · 고정 시각 · **찬종이 볼 것**(crossans 비율 셋 한 줄 + 예 5 · 👎 38 중 정말 고칠 것 n · 비활성 후보 n · 실측 대조 표(등급별 정답률 — "등급 배치가 데이터와 맞는가" 한 줄 평) · 어긋남 후보 n 과 재판정 결과 · 2189/2653 제안) · 1 건수 · 2 종류별 · 3 crossans 100 전부 · 4 👎 38 전부 · 5 open 2 · 6 실측 표 + 재판정 전부 · 7 자기 점검.
■ 산출물: `ai-out/V034.txt` · `audit/v034-crossans.json`(100) · `v034-feedback.json`(38) · `v034-open-answers.json`(2) · `v034-playstats.json` · `v034-rerate.json` · `v034-g029-reread.json`(26) · `v034-raw/` · 13(C89 · CV-141~) · 05 · 06 · README V 표.
■ 하지 말 것: DB 쓰기 · 힌트·질문·등급 고치기(제안만) · COMMON 상수 고치기(후보만) · 새 문항(G032 · is_active false) 보기 · 등급 1·2 힌트 판정(V033 했다 · G031 쓰는 중) · blind 돌리기 · 15 · 16 · 07 · 19 · 코드 · `g03*-*` 고치기 · 13 의 A·D 줄 · `npm run build` · 서버 기동 · 키 필요한 API · User-Agent 개인 정보 · force push · 찬종에게 묻기.
■ 커밋: 위 파일만 · 단계마다 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): `hint-check-active --list` crossans 2,454(G030 이 돌면 ±) · feedback 표 38 · G029 miss 14 · 그대로 둔 14 · 사람 판 30일 57 · answer_events 열(response_ms · accepted · was_eligible) · game_questions 열(grade · worth · resolved_at) · 13 마지막 CV-140 · C88 · A101(MAIN 이 A102 를 쓴다) · 07 마지막 D-320 · DG-067(GEN 이 DG-068~ 을 쓴다). 다르면 1절에 적고 실측대로.
■ ★ 이어서: 끝나면 멈춘다(verify-next.md 없음). 터미널 마지막 줄 "V034 끝 — 다음 브리핑 대기 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.
