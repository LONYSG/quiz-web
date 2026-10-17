[VERIFY V015]  (이 파일이 지시 전체다 — docs/16 2장. V014 를 끝낸 같은 창에서 이어서 한다. 다 읽고 시작한다)
TASK: **우선순위 차례로** — ① origin/main 에 **g009a · g009b** 묶음이 있고 아직 판정 안 한 것이 있으면 그 전수 판정(archive/V013.md 의 (가) A~F) ② `data/minigame/*/items-2.json`(G010 2차)이 있으면 **미니게임 2차 전수 재검증**(archive/V012.md 꼴 — 그림 전수 · 값 전수 · verify·status 칸을 items-2.json 에 직접) ③ 그 뒤 **활성 난이도 4 전부(503 + 난이도 5 의 2) 전수** → ④ **활성 난이도 2 전수(1,465)** — ③④ 는 V014 기준 그대로 · 조각마다 ①② 가 새로 나타났는지 다시 본다(나타나면 끼어들어 먼저). 반영은 G011~
실행 모델: Sonnet 5.5 (같은 창 — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13-PENDING 은 V014 가 쓴 다음 CV- 부터 · README V 표 · 조각 `audit/v015-raw/`). 동시 라운드(GEN · MAIN) · git · 판정자 ≤1 · 메모리 규칙은 V014 와 같다.
■ 토큰: 넉넉하다 — 전수 · 줄이지 않는다. ④ 가 너무 길면 조각 10개마다 중간 커밋(V014 F 꼴)을 하고 끝까지 간다.

■ 먼저 읽기
- ai-out/V014.txt(0절 — g009 묶음 판정 여부 · 난이도 3 집계 · 반복 유형) · `ai-out/briefs/archive/V013.md`(① 의 할 일) · `archive/V012.md`(② 의 할 일 · C70 ① 항목 · 판정 칸 규칙) · ai-out/V012.txt 6절(2차에서 반복되면 안 되는 유형 — attribution 손질 표시 · 라이선스 칸 · 영문 변형 · 별칭) · ai-out/G010.txt(있으면 — 0절 수 · 그림 수 · 버린 소재) · docs/18 전체(0절 묶음 파일 규칙 — `items-2.json` 의 verify·status 는 2차 행에만 쓴다 · 1차 items.json 은 건드리지 않는다)
- docs/15 · score-v3 · hint-v5 · scripts/hint-check.mjs · g008-check.mjs(읽기만 — G010 이 items*.json 을 읽게 고쳤을 것)

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단: 상 = 4 · blind 재채점 값이 최종 난이도 · ③ 난이도 4 는 V009/V010 때 blind 를 이미 거쳤으니 **blind 재채점은 하지 않는다**(힌트 · 변형 · 단정 · 사실 · 유일성만) · 미니게임 2차의 EU 목표 불허 · 영문 변형 금지 · photo 의 라이선스 칸은 공용 페이지와 같아야.

■ 할 일
① g009a/b — archive/V013.md A~F 그대로 → `audit/v015-results.json`(V009 꼴 · 이미 V014 가 a 를 했으면 b 만 — 0절에 어느 묶음을 했는지).
② 미니게임 2차 — archive/V012.md 와 같다: `audit/g010-verify-targets.json` 전수 · 그림 전수 Read · 값 전수(worldprice 새 품목 2 의 나라 행 전부 · 환율) · 판정 칸(verify · status) 을 **items-2.json** 과 `products.json` 의 **새 품목 rows** 에만 직접 씀(기존 rows · items.json 불변 — 기계로 확인) → `audit/v015-minigame.json` · 게임별 fix 율 · 반복 유형.
③ 난이도 4·5 (505) — V014 기준 · 조각 50 → `audit/v015-active4.json`(505 모두 키로).
④ 난이도 2 (1,465) — 같은 기준 · 조각 50 · 중간 커밋 → `audit/v015-active2.json`.
- 조각 사이 `git fetch` → ①② 재확인. 집계: 난이도별 fix 율 · 출처 라운드별 · 유형별 · "활성 전체 fix 추정" 한 줄.
■ 웹·토큰 예산: WebSearch **200회 이내** · WebFetch 주 수단 · 판정자 ≤1.
■ 산출물: `ai-out/V015.txt`(0절 — ①②③④ 중 한 것 · 안 한 것과 이유) · 위 JSON 들 · `v015-raw/` · 13 CV- · README V 표.
■ 하지 말 것: DB 쓰기 · 문항 고치기 · items.json(1차) 쓰기 · 규칙/프롬프트/코드 수정 · Q · 서버 · 다른 세션 몫.
■ 커밋: 위 파일 + items-2.json · products.json 새 rows(② 때만) · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 난이도 4 = 503 · 5 = 2 · 2 = 1,465(시작 때 DB — G011 이 적재했으면 늘어 있다 → 그때 값으로 · 0절에) · items-2.json 유무 · g009 묶음 유무 — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "V015 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
