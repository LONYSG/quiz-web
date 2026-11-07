[VERIFY V036 — ★ G032 pending 647 중 **V035 가 안 본 484** 일곱 눈 전수 판정(사실 · 알가치 · 독립 등급 · 읽기 · 힌트 · 유일성 · 중복) → 활성 전환 자료 · 판정만 · DB 읽기만 · 동시 G033(표본 163 고침 → 활성 · 활성 문항 고침)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V035 가 표본 163 을 판정해 fix 64%(질문·힌트 손질 37%) 가 나왔고 CV-146 권장 (b) = "나머지 484 도 같은 눈으로 판정한 뒤 활성". 생성자(GEN)가 자기 산출물을 판정하지 않는다(16)는 원칙 그대로 VERIFY 가 484 를 **전수** 판정한다. G033 이 동시에 표본 163 을 고쳐 활성하고 있다 — 484 는 G033 이 건드리지 않으므로 글이 바뀌지 않는다. 판정 틀은 V035 와 같다(비교 가능하게) — 다만 V035 7절 교훈 둘을 고친다: ① 조각이 WebSearch 위주라 해설 문장 41 이 unverified 로 남았다 → **조각 지시서에 WebFetch 위키 원문 대조 필수** ② VERIFY 가 p3·p4 fix ≈40 의 제안문을 다 읽지 않았다 → **fix · drop · unsure 전부 재독**(숫자로 7절).
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다 · 429 면 0절에 시각 · 남은 범위 적고 같은 모델로 재개)

■ 고정 규칙: docs/16 5-3 그대로. 13 **C93**(V036 끝) · **CV-153~**(활성 전환 권고 · fix 묶음 · 등급 편향 재확인 · 15 후보) · README **V 표** · 05 · 06. 조각 `audit/v036-raw/_work/`. **DB 읽기만**(`postgresql://quiz:quizlocal@localhost:5434/quizweb` · `audit/v035-raw/_work/*.mjs` 꼴 — 베낀다). 대상 글은 **시작 때 한 번 뽑아 고정**(`v036-raw/targets-g032-484.json` · 시각).
■ ★★ 동시 라운드 — **GEN G033**(DB 쓰기 · 표본 163 고침 → 활성 · 활성 문항 고침 · 표기 지정 문구 삭제 · crossans 코드). 겹치지 않게: ① V036 대상 = pending 647 중 **`audit/v035-g032.json` items 의 163 id 를 뺀 484**(source_ref g032a/b · status pending_review · is_active false — 시작 때 수를 0절에 · 484 가 아니면 1절) ② 문서 분담: V036 = 13 **C93 · CV-153~** · README **V 표** · 05 · 06 자기 줄 / G033 = 07 · 13 C92 · CV-141~152 줄 끝 · README G 표 ③ `g033-*` · `tmp/` 는 add 하지 않는다 · 쓰기 직전 fetch → rebase --autostash · 내 파일만 add · force 금지 ④ G033 이 활성 문항을 고치는 중이라 **dup 짝(활성 문항) 글이 바뀔 수 있다** — 고정 사본 기준으로 판정하고 1절에 적는다.
■ ★★ 조각 — 분량으로: **484 = 조각 50 × 10**(sonnet · 동시 2 · 메모리 1.0GB 아래면 1) → **VERIFY 가 fix · drop · unsure 전부 + keep 10% 를 직접 재독**(V035 교훈 — 수를 7절에). 조각 지시서(V035 `_work` 것을 베끼되) **사실 눈은 WebFetch 로 위키 원문(ko → en)을 열어 대조**하고 WebSearch 는 보조 — 해설 문장도 닫는다(못 닫으면 unverified + "삭제 제안"). 사실 false 는 반드시 출처 URL. User-Agent `quiz-web-v036/1.0` · 개인 정보 금지 · 위키 429 는 4초 간격.
■ 토큰: 넉넉하다 — 484 전부 · 줄이지 않는다. 예상 1.5~3시간(V035 163+197 이 35분이었다 — 이번은 재독을 더 하므로 더 걸려야 정상).

■ 먼저 읽기
- **ai-out/V035.txt 전체**(0절 ★ ① 등급 5×5 · 가장 큰 문제 5 · 2절 종류별 · 7절 교훈) · `audit/v035-g032.json`(163 — 항목 키를 **그대로 쓴다**: id · answer · why · piece · scoreV4 · gradeIndep · worthStored · worthIndep · grade_v · grade_why · fact · fact_notes · fact_fix · worth_v · worth_why · read · read_fix · read_why · hint · hint_form · hint_fix · unique_ok · missing_variants · unique_why · dup · dup_why · verdict · verdict_why · reread) · `audit/v035-raw/_work/`(DB · 조각 · 집계 스크립트) · `ai-out/briefs/archive/V035.md`(판정 틀 원문 — "일곱 눈" 정의)
- **ai-out/G032.txt** 0절 ①~⑨ · 7절(생성 흐름 · 중복 3겹 · blind · 격리) · `audit/g032-dup.json`(중복 살림 17 의 짝 — 484 안에 있는 것) · `audit/g032-blind.json` · `data/pipeline/generated/g032a · g032b/*.json`(생성 원본 — seed · score · sources · hintBasis · DB 행과 같은지 표본 10 대조)
- **docs/19** §1~§4(v2 눈금) · §8 · §9 · **docs/15** §3 · §4-1(H0~H13) · §5-4 · V030.txt 2절 B1~B10(변형 규칙 — missing_variants 는 표기·약칭·영문 표기만)

■ 설계 결정(판정 틀 = V035 와 같다)
- 문항마다 **일곱 눈**: **fact**(질문 · 힌트 · 해설의 고유 사실 — 출처 둘 · true/false/unverified + 고칠 문구 · 해설 문장도) · **worth**(19 §9 1/2/3 vs 저장값) · **grade_v**(★ 19 v2 눈금 1~5 **독립** — score-v4 를 보기 전에 · 사유) · **read**(19 §8 — ok/rewrite + 제안문 240자 안) · **hint**(15 §4-1 — ok/fix + 제안 · hint-check 통과 · H12 핵심 이름은 그대로) · **unique**(정답 유일성 · 빠진 표기 변형) · **dup**(짝 있는 것만 — same/different · 짝 id) → **verdict keep / fix / drop** + 사유 → `audit/v036-g032.json`(484 · V035 와 같은 키 + piece + reread).
- 0절: keep/fix/drop 수와 비율(V035 163 과 나란히) · **등급 5×5(독립 × score-v4)** — 484 에는 score-v4 **4 가 22 쯤** 있다(647 중 28 − 표본 6) → "score-v4 4 가 정말 4 인가" 를 따로 한 줄 · 알가치 일치 · fix 꼴 분포(질문·힌트 손질 / 해설·변형만 / 사실 false / unverified) · 가장 큰 문제 10 · 다른 활성 정답을 담은 힌트(crossans) n · dup same n.
- **CV 셋**: **CV-153** 484 활성 전환 권고((a) drop 뺀 전부 활성 + fix 는 G034 반영 — fix 비율과 무관하게 "질문·힌트 사실 false 는 고친 뒤" 조건 (b) fix 반영 뒤 활성 (c) 등급·분야별 일부 — **권장은 수치로**) · **CV-154** fix 묶음(항목은 JSON · 요약만 — 사실 false 목록은 전부 id) · **CV-155** 등급 편향 재확인(163 + 484 = 647 합산 5×5 · CV-147 결론이 유지되는가 · score-v4 4 의 진짜 4 비율) · 필요하면 CV-156 15·19 후보(반복 꼴).

■ 할 일 (순서대로)
A. 0절 준비: 메모리 · 웹 · 대상 고정 484(163 제외 확인) · 시각 · 13 마지막 번호(C92 는 G033 이 쓰는 중일 수 있다 — **C93** 으로 비워 둔 번호를 쓴다) · 조각 지시서(V035 것 + WebFetch 필수 줄). 커밋 없음.
B. 조각 10(50 씩 · 동시 2) → 집계. 커밋 1(raw).
C. VERIFY 재독: fix · drop · unsure 전부 + keep 10% + crossans · dup same 전부 + 사실 false 전부 **직접 웹**. 커밋 2.
D. 13 C93 · CV-153~ · README V 표 · 05 · 06 · V036.txt(0 준비 · ★ 찬종이 볼 것(권고 한 줄 · 표 · 가장 큰 문제 10) · 1 건수 · 2 종류별 · 3 484 전부 요약(id · verdict · 한 줄) · 4 등급 표 · 5 crossans · dup · 6 (없음) · 7 자기 점검(조각 수 · 재독 수 · WebFetch 대조 수 · unverified 수 · 메모리 · 시간 · 모델 그대로)). 커밋 3 · push.
■ 산출물: `ai-out/V036.txt` · `audit/v036-g032.json`(484) · `v036-raw/`(targets · _work · 조각 in/out) · 13(C93 · CV-153~) · 05 · 06 · README V 표.
■ 하지 말 것: DB 쓰기 · is_active · status 바꾸기 · 문항 고치기(제안만) · 활성 전환(설계 → G034) · **V035 163 다시 판정**(G033 이 고치는 중) · 활성 문항 판정 · 15 · 16 · 19 · 07 · 코드 · 13 의 A · D · C92 · CV-141~152 줄 · `g03*-*` 고치기·add · `npm run build` · 서버 기동 · 키 필요한 API · User-Agent 개인 정보 · force push · 모델 바꾸기 · 조각 생략 · 재독 생략 · 찬종에게 묻기.
■ 커밋: 위 파일만 · B · C · D · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): pending 647 · 163 제외 484 · score-v4 4 ≈22 · 13 마지막 C91 · CV-152(G033 이 C92 를 쓴다) · README V 표 마지막 V035 · 남는 메모리 · GEN 창 돎(G033) · 실 3000 서버 상관없음(읽기만). 다르면 1절에 적고 실측대로.
■ 지난 피드백(V035): 잘한 것 — F0 로 V034 구멍을 메우고 `git show --stat` 로 확인 · 등급 5×5 표 · 조각 8 · 가장 큰 문제 5. 틀린 것 — 조각이 WebSearch 위주라 unverified 41 · p3·p4 fix ≈40 제안문 안 읽음(정직하게 적은 것은 좋다) → 이번은 WebFetch 원문 + 전부 재독.
■ ★ 이어서: 끝나면 멈춘다(verify-next.md 없음). 터미널 마지막 줄 "V036 끝 — 다음 브리핑 대기 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.
