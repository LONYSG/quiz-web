[VERIFY V014]  (이 파일이 지시 전체다 — docs/16 2장. V013 을 끝낸 같은 창에서 이어서 한다. 다 읽고 시작한다)
TASK: **활성 난이도 3 나머지 전수 판정**(2,386 − V013 표본 300 = **2,086** · V013 (나) 기준 그대로 · 조각 50) — 단 **조각 하나 끝날 때마다 origin/main 에 `g009a`/`g009b` 묶음이 올라왔는지 보고, 올라왔으면 그 묶음 전수 판정을 먼저**(V013 브리핑의 (가) 꼴) 하고 나머지 조각을 이어서 한다. 반영은 G011
실행 모델: Sonnet 5.5 (같은 창 — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (3장 · 4장 · 5-3 · 교훈 A~G · 1장 — 13-PENDING 은 V013 이 쓴 다음 **CV-34** 부터 · README V 표 · 조각 `audit/v014-raw/`).
■ ★★ 동시 라운드 — GEN(G009 생성 1,000 → G010 미니게임 2차 — questions 는 G009 A 12행뿐 · 이미 끝났다) · MAIN(R053 → R054 — questions 안 건드림)이 같이 돈다. VERIFY 몫: V014.txt · audit/v014-* · 13 CV 행 · README V 표. git: 내 파일만 · fetch · rebase · force 금지. 판정자 **한 번에 1개** · 띄우기 전 남는 메모리 1.5GB(모자라면 2분 × 10 · 그래도 모자라면 1개는 띄운다 — 판정자 하나는 가볍다).
■ 토큰: 넉넉하다 — 2,086 **전수** · 표본으로 줄이지 않는다. g009 묶음도 전수.

■ 먼저 읽기
- docs/16 · **ai-out/V013.txt 전체**(이번 기준의 본보기 — 2절 종류 · 3절 fix 꼴 · 6절 반복 유형 ①②③ · CV-32 · CV-33) · ai-out/verify.md 는 이 파일 · `ai-out/briefs/archive/V013.md`(g009 묶음 판정 (가) 의 할 일 A~F · 기준 — 묶음이 올라오면 그대로 따른다) · V009.txt 2절·6절·7절(묶음 판정 꼴) · V010.txt 2절(blind 재채점)
- docs/15 전체 · pipeline/prompts/score-v3.md · hint-v5 · deep-v5 · scripts/hint-check.mjs(읽기 전용)
- `data/pipeline/audit/v013-active3.json`(표본 300 의 id — **이번 대상에서 뺀다**) · v013-raw/ 의 판정자 지시(같은 기준 파일을 쓴다 — 바꾸지 않는다 · 보정 표본은 V013 의 6건 그대로 다시 한 번)

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단: CV-32 → **(b) 나머지 2,086 전수**(찬종 "작업 최대한 많이 · 토큰 빨리") · CV-33 → H2 "번역·한자 뜻풀이로 정답 조각" 꼴은 **이번 판정에서 fix 로 센다**(15 에 넣는 것은 G011 — 판정 기준으로는 지금부터) · drop 은 사실 오류 · 정답 비유일 · 범주 단서 2회차 · 마이너 대상에만 · 같은 정답 활성 쌍의 "같은 사실 다른 문장"(H12) 은 fix.

■ 대상 — `SELECT id … FROM questions WHERE is_active AND difficulty_score = 3` (읽기 전용 · 2,386 이어야 한다) 에서 `v013-active3.json` 의 300 을 뺀 **2,086** · id 오름차순 · 50건 조각 → 약 42조각 · 항목마다 질문 · 정답 · 변형(question_answers) · 해설 · 힌트(general_hint) · 분류 · 같은 정답 활성 쌍(V013 꼴) 을 입력에.
■ 기준 — V013 (나) 와 같다: 정답 유일성(3-2) · 질문·해설 사실(문서 — WebFetch · 못 열면 unverified) · 힌트 H0~H12(hint-v5 · H2 번역·한자 뜻풀이 꼴 포함 · H12 같은 정답 쌍 같은 사실) · 변형 누락(한국어 문서가 같은 말로 소개하는 별칭·표기 — B2) · 단정(시간·학설) · 해설(E2 되풀이) · 3-1 읽기 좋음 → ok/fix/drop · proposal 전체 문구 · url.
■ 할 일 — A. 조각 42 전수 verdict(ok/fix/drop · categories · reason · proposal · url) B. 보정 표본 6(V013 과 같은 것)으로 첫 조각 전 기준 맞춤 C. 직접 재독(fix · drop 전부 · ok 10%) D. 집계 — 출처 라운드별 fix 율(V013 2절 꼴) · 유형별 · CV-32 (b) 의 답이 되게 "난이도 3 전체(V013 300 + 이번 2,086) fix N건" E. **조각마다** `git fetch origin` 뒤 `git ls-tree --name-only origin/main data/pipeline/audit/ | grep -E 'g009[ab]-verify-targets'` — 나타나면 자기 커밋을 push 한 뒤 `git pull --rebase` 로 받고 **그 묶음 전수 판정(archive/V013.md 의 A~F 그대로 — blind 재채점 전수 · 보정 12 · r2 100 · 2회차 양방향 · 힌트 전수 · 고침 효과 · 묶음별 집계)** 을 먼저 끝내고 `audit/v014-results.json`(V009 꼴) 에 쓴 뒤 나머지 조각으로 돌아온다(b 가 a 뒤에 오면 같은 방법) F. **중간 커밋** — 조각 10개(500건)마다 `audit/v014-active3.json` 을 `{"partial": true, "done": N}` 머리와 함께 커밋 · push(G011 이 일찍 집을 수 있게) · 끝나면 partial 을 뗀다.
■ 웹·토큰 예산: WebSearch **150회 이내** · WebFetch 주 수단(판정자도 WebFetch 만 · url 을 JSON 에) · 판정자 ≤1.
■ 산출물: `ai-out/V014.txt`(0~7절 — 0절에 g009 묶음 판정 여부 · 2,086 집계 · 난이도 3 전체 fix 율) · `audit/v014-active3.json`(2,086 모두 키로 한 번씩 — V013 꼴) · `audit/v014-results.json`(g009 묶음을 판정했을 때만 — V009 꼴 · 안 했으면 만들지 않는다) · `v014-raw/` · 13 CV-34~ · README V 표.
■ 하지 말 것: DB 쓰기 · 문항 고치기(제안만) · 미니게임 판정(2차 items-2.json 은 V015) · 규칙/프롬프트/코드 수정 · Q · 서버 · 다른 세션 몫.
■ 커밋: 위 파일만 · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 활성 5,113 · 난이도 3 = 2,386 · v013-active3.json 키 수 300 · 시작 시점 origin/main 에 g009a 묶음 없음(있으면 E 를 먼저) — 다르면 0절에.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 같은 창에서 **`ai-out/briefs/verify-next.md`** 를 읽고 V015 를 바로 시작한다(찬종에게 묻지 않는다 · 파일이 없거나 첫 줄이 "보류" 면 멈춘다).
■ 답변: 한국어 · 터미널 5줄 이내.
