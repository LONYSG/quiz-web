[GEN G008]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: A. V010 반영 — 기존 활성 상 608 의 난이도를 blind 값으로(CV-18 a) + 풀 실측 · B. 기존 활성 힌트 2(C69 ②) · C~G. **미니게임 데이터 1차**(docs/18 형식 — price 100 · worldprice 3품목 · photo 120 · estimate 100 · which 150) → VERIFY V011 묶음. 적재는 하지 않는다(파일이 정본 · DB 는 G009 · R052 뒤)
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 · 4장 · 5-2 · 1장 번호 — 다음 DG-033 · C70 · Q 는 올리지 않는다).
■ ★★ 동시 라운드 — MAIN R050(미니게임 1차 · 0017 · 같은 작업 폴더에 미커밋 server/ client/ 파일이 있다) · VERIFY V011(G007 GEN 문구 · CV-20 · 소규모 · DB 읽기만)이 같이 돈다 (docs/16 6장).
- GEN 몫: pipeline/ · scripts/g008-* · **data/minigame/** · **assets/minigame/**(+ README · `.gitignore` 에 `assets/minigame/*/` 한 줄 추가 허용) · data/pipeline/(audit 의 v011-* 제외) · 15 · 05 Track D 행과 그 아래 줄 + **Track E(미니게임 데이터) 행 신설** · 06(맨 위 새 블록) · 07 DG- · 13 **C 행 + CV-18~19 끝 표시** · README **G 표**.
- MAIN 몫: server/ client/ shared/ migrations/ · 01~04 · 05 R 행 · 07 D- · 13 A 행 · README R 표 · 17 상태 칸. VERIFY 몫: V011 · audit/v011-* · 13 CV 행 · README V 표.
- git: MAIN 의 미커밋 파일 때문에 `git pull --rebase` 가 막힌다 — G007 방식 그대로: 내 파일만 `git add` · `git fetch` 로 원격이 앞서 있지 않은지 확인 · 앞서 있으면 `git stash` 없이 **내 커밋을 `git rebase origin/main`**(MAIN 파일은 건드리지 않음) · force 금지.
- ★ 메모리: 하위 에이전트 **한 번에 2개 이내**(VERIFY 1 · MAIN 1) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 모델을 바꾸지 않고 재설정 뒤 이어서 · 에이전트마다 임시 폴더 `tmp/g008/work-*`.
■ 토큰: 하위 에이전트는 수집·확인에만 · 보고서는 표와 바뀐 것만(항목 전문은 JSON).

■ 먼저 읽기
- docs/16 · **docs/18-MINIGAME-DATA.md 전체**(형식 — 칸을 더하지 않는다) · docs/17(1-1 · 2 · 3) · ai-out/gen.md(3 · 4-1) · **ai-out/V010.txt 0 · 2 · 6절** · ai-out/G007.txt 0 · 6절 · 13 C69
- data/pipeline/audit/v010-results.json(`items`[id].dif — 608 · `targets`) · scripts/g007-apply-g005.mjs(반영 꼴) · scripts/measure-pool-exhaust.mjs · scripts/emoji-import.mjs(sharp 줄이기 꼴) · scripts/hint-input.mjs · pipeline/prompts/hint-v5.md
- 01 12장(경험 시스템 — 미니게임 항목 id 가 이 기록의 키가 된다) · 15 §2 B2(사진 게임 정답 표기)

■ 찬종의 말 · 확정
- (2026-10-15) "gen은 데이터 수집 및 생성 담당이야 … verify는 gen이 수집한 상품 정보 같은걸 다시 웹에 검색을 하든지 해서 적절한 이미지를 가져왔는지, 가격이나 수치 등이 비정상적이지 않고 합리적이며 일반적이고 표준에 가까운지 등 재검증."
- (얼마게요) "아마존이라든지 국내 쇼핑몰이라든지 … 합리적인 가격(판매자에 따라 가격이 천차만별이 아니고 적당히 형성된 가격에 판매) … 이미지, 제품명, 가격-한국 원 기준." · (2026-10-16) "쿠팡 말고 네이버로" → ★ **네이버 쇼핑 검색 API 는 2026-07-31 종료 · 대체 없음**(개발자센터 공지 · 설계 에이전트가 키로 확인: shop.json 404 SE05). → 공식몰 정가 · 가격비교(다나와 · 에누리 등) 페이지를 WebFetch 로 큐레이션. `.env` 의 NAVER_CLIENT_ID · SECRET 은 **블로그·뉴스·이미지 검색**(`/v1/search/blog.json` 등)에만 쓸 수 있다 — 값은 코드·문서·보고서에 적지 않는다.
- (빅맥지수) "세계 각 나라에서 빅맥의 가격이 다르다 … 한국에서의 가격을 알려주고 (다른 몇나라의 가격을 알려줘도 좋을듯) 특정 나라에서의 … 원화로 얼마인지 … 싼나라, 비싼나라 표기도 하고, 주요 국가들 순위도 전부 공개." · "이미지 없으면 몰입이 안돼."
- (사진) "유명 인물, 유명 명소, 특정 제품이나 사물(쉬운것부터 주위에 흔하지만 이름은 잘 몰랐던것들까지)." · 실루엣은 안 쓴다.
- (경험) "퀴즈류 게임은 경험 해본것과 아닌것이 차이가 많이 나니까 한번만 나타나게 해야함." · (기록) "플레이 기록은 다양하게 보존."
- 설계 판단 (2026-10-17 · 되돌리기 쉽다): **CV-18 → (a) V010 최종 값 그대로 608 전부 반영**(목적은 "상만" 판의 체감을 고르게 — 상 718 → 331 · G005 174 를 더해 505 · 상만 10판). **CV-19 → 상 = 4 로 단순화** — 5 는 스키마·규칙에 남기되 생성 목표로 두지 않는다(15 §5-1 에 한 줄 각주). CV-20 → V011 이 판정.

■ 대상 (확인 대상 — 설계 에이전트가 2026-10-17 보고서에서 센 값 · 작업 전 DB · 파일과 다시 맞춘다)
- 활성 5,113 · 상 892(기존 608 + g003 110 + g005 174) · 힌트 2,921 · V010 items 608(최종 dif: 2 16 · 3 371 · 4 221) · G007 백업 quizweb-20261017-014210.

■ 할 일 (항목마다 "다 됐다" 의 기준 · A → G · 단계마다 커밋)
A. **V010 반영** — `npm run db:backup` → `scripts/g008-apply-v010.mjs`(멱등 · 파일 단계 검사 · 608 id 가 v010 targets 와 같은지 · 현재 difficulty_score 가 V010 `current.dif` 와 같은 행만 바꾼다 — 다르면 건너뛰고 목록) → `difficulty_score` = items[id].dif · `score_version` = `score-v3-blind` 꼴로(현재 열 값 꼴을 보고 맞춤) · `scored_at` 갱신 · `difficulty_why` 에 easiestCue/difWhy. `difficulty` 열(easy/medium/hard)은 점수와 매핑되는 규칙(01 4장: 하 1~2 · 중 3 · 상 4~5)대로 같이 바꾼다 — 열이 자동이면 그대로.
   다 됐다 = 바뀐 행 수(412 안팎) · 상 892 → 505 안팎 · 풀 실측(50문제 — 상만 · 중+상 · 전체 · 미디어 상 · korea 상 · 묶음별 상) 표를 G007 실측과 나란히 · 바뀐 행 밖 칸 변경 0(해시).
B. **기존 활성 힌트 2** (C69 ② — H12 새 쌍): #4268 빌리 진 킹 ↔ S2-07 질문 · #641 스코티시 폴드 ↔ L1-08 질문 — hint-v5 · hint-input 으로 새로 쓰고(문서 근거) `data/pipeline/audit/g008-fixes.json`. 백업은 A 와 한 번.
C. **미니게임 데이터 — 소재·배분** (docs/18 형식): 
   · price 100(bucket 4개를 25 안팎씩 · category 10개 고루 · "의외로 비싼/싼" 각 10 이상) · worldprice 3품목(빅맥 — 이코노미스트 `big-mac-full-index.csv` 최신 회차 전 나라 · 아이폰 기본 모델 — 애플 각국 공식 사이트 · 넷플릭스 표준 요금 — 각국 공식 헬프 페이지) · photo 120(category 7개 — `everyday` 30 이상 · `person` 은 공인·역사 인물만 · 20 이하) · estimate 100(kind 고루 · 이미지 70 이상) · which 150(bigger 100 · earlier 50 · 소재 섞기).
   · 소재 목록을 먼저 만들고 전역 대조(같은 대상 중복 0 · 퀴즈 활성 정답과 겹쳐도 된다 — 다른 게임) → 하위 에이전트에 나눠 수집.
   다 됐다 = 게임별 배분 표 · 버린 소재 수와 사유(가격 분산 1.5 초과 · 라이선스 없음 · 유일성 없음 · 근소 …).
D. **수집** — 항목마다 docs/18 의 칸 전부 · `sources` 에 값마다 URL · 그림은 sharp 로 ≤1024px · ≤500KB · 정답 글자 노출 0(그림을 하나씩 연다 — 하위 에이전트가 Read 로 본다) · `status: candidate` · `verify: null`.
   · price: 공식몰 정가 + 가격비교 새 상품 중앙값 — 출처 2 이상 · 최고/최저 1.5 이내 · 중고·해외직구·부속품·한정판 제외.
   · worldprice: 환율은 `fxAsOf` 하루치(한국은행 또는 ECB 기준) · 전 나라 `krw` 계산 · 품목당 rows 한 번 · items 는 (품목 × KR 제외 나라) · `shownCc` 는 KR + 2곳(무작위 · 목표 제외).
   · photo: 위키미디어 공용만 · 라이선스·저작자 칸 · 사진만으로 하나로 좁혀지는가를 **그림을 본 다른 에이전트**가 맞혀 보게(맞히지 못하거나 다른 답이 나오면 버림) · 변형은 B2 · 한국 표기.
   · estimate · which: 표준 출처 · `margin` 규칙 · 연도는 정확히.
   다 됐다 = 게임별 항목 수 · 그림 수 · 출처 수 · 기계 검사(`scripts/g008-check.mjs` — docs/18 칸 전부 · 숫자형 · id 유일 · 파일 존재 · 크기 · 정답 글자가 `name`/`stem`/`question` 밖 그림 파일명에 없음) 통과 N/N.
E. **VERIFY 묶음** — `data/pipeline/audit/g008-verify-targets.json`(게임별 · id · 항목 전문 · 그림 경로) + 무작위 표본 표시(VERIFY 가 쓸 것: price 30 · worldprice 나라 10 · photo 40 · estimate 30 · which 40).
F. **백업·문서** — `backups/minigame-<날짜>.zip`(assets/minigame 전체) · assets/minigame/README.md(emoji README 꼴) · `.gitignore` 한 줄 · 05 Track E 신설(게임별 후보 수 · verified 0 · loaded 0) · 06 · 07 DG-033~ · 13 CV-18~19 끝 · C70(V011 · G009 · R052 대기) · 15 §5-1 5 단계 각주 · README G 표 · `ai-out/G008.txt`.
G. 끝 점검 — A 의 해시 · 활성 5,113 그대로 · 적재 0 증명(DB 에 minigame 표 없음 또는 0행) · g008-check N/N · criteria-sync --check.

■ DB 쓰기: **허용 — A(difficulty_score · difficulty · score_version · scored_at · difficulty_why 의 608 행) · B(general_hint · general_hint_version 2 행)만.** 미니게임은 파일만(DB 적재 금지 — 표도 만들지 않는다 · MAIN R052 몫). 백업 먼저.
■ 웹·토큰 예산: WebSearch **200회 이내**(소재 찾기 · 가격비교) · WebFetch 주 수단 · 네이버 검색 API 는 블로그·뉴스·이미지만(하루 1,000회 이내) · 하위 에이전트 **한 번에 2개 이내**.
■ 하지 말 것: 새 퀴즈 생성 · 기존 활성 수정(A · B 밖) · 미니게임 DB 표 · server/ client/ shared/ migrations/ · 그림 파일 커밋 · 키 값 노출 · 실루엣 · 생존 사인(私人) 사진 · 가격 천차만별 상품 · docs/18 칸 추가(필요하면 13 C 에 제안만) · VERIFY · MAIN 몫 문서.
■ 확인할 것 (원칙 7): 활성 5,113 · 상 892 · V010 items 608 · `current.dif` 와 DB 일치 수 · score_version 열 값 꼴 · difficulty 열이 자동인지 · hint-v5 가 지금 판 · `.gitignore` 에 assets/minigame 없음 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(A 풀 실측 표 — 상만 몇 판 · 게임별 후보 수 · 그림 예 5장 경로(price 2 · photo 2 · worldprice 1) · 못 한 것) → 원칙 메모(7 · 동시 라운드 · 키) → 1 A → 2 B → 3 C → 4 D → 5 E → 6 GEN 판단 → 7 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · `git fetch` 뒤 push.
■ 지난 피드백 (G007): 잘한 것 — 받지 않은 제안 10 을 이유와 함께 새로 쓴 것 · 기존 활성 전체 md5 로 변경 0 을 증명 · K4-26 의 "문서에 없다" 를 다시 열어 바로잡은 것 · MAIN 미커밋 파일을 건드리지 않고 fetch 로 push 한 것 · 브리핑 수치 차이(20 → 17)를 0절에. 이번에 더할 것 — ★ 그림은 **사람이 보는 데이터**다: 하위 에이전트가 그림마다 Read 로 열어 "그 대상이 맞는가 · 글자 노출 없는가" 를 적고, GEN 이 무작위 30장을 직접 본다(7절에 수).
■ 답변: 한국어 · 터미널 5줄 이내.
