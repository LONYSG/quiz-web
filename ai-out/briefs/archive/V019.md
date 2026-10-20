[VERIFY V019]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 짧은 라운드 — 하나만 · 끝나면 멈춘다)
TASK: **GEN 이 밤새 새로 쓴 힌트 전수 점검** — g009b 새 힌트 23(`audit/g012-decisions.json` newHint) · G013 제안 없이 쓴 11(`g013-decisions.json`) · G014 가 쓴 59 + 비운 31(`g014-fixes.json` rows gen) · G015 9 — 합 약 130 · 기준 H0~H12 + H9 새 세 줄(CV-37 · CV-46 · CV-33) + **blind 맞혀 보기**(힌트만 읽은 판정자가 정답을 맞히는가 — CV-54 의 방법을 미리 재 본다). 반영은 G017
실행 모델: Sonnet 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13-PENDING 은 V018 이 쓴 다음 CV- 부터 · README V 표 · 조각 `audit/v019-raw/`). 판정자 한 번에 1개 · 메모리 1.5GB.
■ ★★ 동시 라운드 — GEN(G016 미니게임 반영·적재 — data/minigame · minigame_* 표 · 13 CV-47~51) · MAIN(R055 마무리). VERIFY 몫: V019.txt · audit/v019-* · 13 CV · C74 ② · C75 ③ · C76 ② 처리 표시 · README V 표. questions 읽기만. git: 내 파일만 · fetch · rebase.
■ 토큰: 넉넉하다 — 약 130 전수 · 두 판정자(힌트 판정 1 + blind 맞혀 보기 1 — 한 번에 1개씩).

■ 먼저 읽기
- ai-out/V018.txt 2절 · 6절 ③(새 힌트 28 중 fix 11 · famous-one 꼴 · 판정자 갈림) · `audit/v018-hints.json`(판정 꼴 · **그대로 재사용** — 대상 88 은 뺀다) · `v018-raw/` 지시 파일 · 13 CV-53 · CV-54 · C74 ② · C75 ③ · C76 ②
- G012.txt · G013.txt · G014.txt · G015.txt 의 "새 힌트" 절 · 각 decisions/fixes JSON(newHint · gen rows · 출처 url — 신문 · 블로그 출처 표시: M1-20 세계일보 · K1-40 한경 · S3-39 수영 블로그) · docs/15 §4-1(H9 세 줄 · H2 번역·한자) · hint-v5 · scripts/hint-check.mjs(읽기 전용)

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단(2026-10-19): famous-one · 번역·한자 뜻풀이 · 질문 되풀이 · 같은 정답 쌍 같은 사실 = fix · 출처가 신문·블로그뿐이면 unverified 표시(fix 아님 — 사실이 틀리면 fix) · blind 맞혀 보기는 **판정에 쓰지 않고 수치만 잰다**(16 교훈 G — "힌트만으로 맞힌 비율" 을 fix 율과 나란히 보고).

■ 할 일 — A. 대상 목록(약 130 — id · 힌트 · 출처 · 어느 라운드가 썼나) · 비운 31 은 "비운 게 맞는가(문서에 두 번째 줄 사실이 있는가)" 만 B. 힌트 판정 전수(ok/fix · categories · proposal · url) C. blind 맞혀 보기 전수(정답 · 질문 안 보여 주고 힌트만 — 맞힘/틀림/모름) D. 직접 재독(fix 전부 · ok 10%) E. 집계 — 라운드별 fix 율 · famous-one 비율 · blind 맞힘 비율(fix 와 겹침) · CV-54 판단 재료 한 줄("blind 가 fix 를 몇 % 잡는가").
■ 웹·토큰 예산: WebSearch **40회 이내** · WebFetch 주 수단 · 판정자 ≤1(두 판정자 순서대로).
■ 산출물: `ai-out/V019.txt`(0~7절) · `audit/v019-hints.json`(전부 키로 · blind 칸) · `v019-raw/` · 13 CV- · C74 ② · C75 ③ · C76 ② 끝 표시 · README V 표.
■ 하지 말 것: DB 쓰기 · 문항 고치기 · 미니게임(G016 이 적재 중) · 규칙/프롬프트/코드 수정 · Q · 서버.
■ 커밋: 위 파일만 · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): newHint 수(g009b 23 · G013 11 · G014 59 · 비움 31 · G015 9) — JSON 에서 센 수로 · 활성 6,043 — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "V019 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
