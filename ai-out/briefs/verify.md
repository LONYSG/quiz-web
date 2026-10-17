[VERIFY V012]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: G008 미니게임 데이터 1차 **642 전수 재검증**(docs/18 6절) — 그림 508 전수(그 대상인가 · 정답 글자 노출) · 값도 **642 전수**(표본이 아니다 — 찬종 2026-10-17 "작업을 최대한 많이") 웹 문서로 다시 열기 · `verify` 칸과 `status` 를 채운다. 반영(fix 적용 · DB 적재)은 G010 · R052 뒤
실행 모델: **Sonnet 5.5** (`claude --model claude-sonnet-5-5`)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 · 4장 · 5-3 · 교훈 A~G · 1장 — 13-PENDING 은 **CV-25** 부터 · README V 표에 V012 · 조각 data/pipeline/audit/v012-raw/).
■ ★★ 동시 라운드 — GEN G009(V011 반영으로 questions 몇 행을 고치고 퀴즈 500 을 생성 — **data/minigame 은 건드리지 않는다**) · MAIN R051(미니게임 2차 · 미커밋 server/ client/ 파일 있음)이 같이 돈다.
  VERIFY 몫: ai-out/V012.txt · data/pipeline/audit/v012-* · **data/minigame/*/items.json 의 `verify` 칸과 `status` 만**(다른 칸·값·순서는 글자 하나도 바꾸지 않는다 — 바꾼 뒤 `node scripts/g008-check.mjs` 가 642/642 막힘 0 이어야 한다) · 13 **CV 행(CV-25~ 추가만)** · README **V 표**. 그 밖은 건드리지 않는다. git: 내 파일만 add · `git fetch` 로 원격 확인 · 앞서 있으면 내 커밋을 `git rebase origin/main` · force 금지.
  ★ 메모리: 판정자 **한 번에 1개**(GEN 2 · MAIN 1) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 모델 유지.
■ 토큰: 넉넉하다(찬종: 이번 주는 토큰을 다 써야 한다) — 아끼려고 표본으로 줄이지 않는다. 그림은 Read 로 한 장씩 보되 판정은 한 줄(ok / 대상 다름 / 글자 노출 / 흐림·워터마크) · 보고서 3절은 fix·drop 만 · 항목 전문은 JSON.

■ 먼저 읽기
- docs/16 · **docs/18-MINIGAME-DATA.md 전체**(0 공통 칸 · 1~5 게임 규칙 · 6 재검증 기준) · docs/17 1-1 · ai-out/G008.txt(0 · 3 · 4 · 5절 — 버린 소재 · 자기 검토 · 걸리는 점 3) · 13 C70 ①
- data/pipeline/audit/g008-verify-targets.json(games[<game>] — count · sample(표본 id) · items(전문 + verifySample)) · data/minigame/<game>/items.json · worldprice/products.json · scripts/g008-check.mjs(읽기 전용 — 기계 규칙이 무엇을 이미 막는지) · assets/minigame/README.md
- docs/15 §2 B2(사진 정답 표기) · §3-2(정답 유일성)

■ 찬종의 말 · 확정
- (2026-10-15) "verify는 gen이 수집한 상품 정보 같은걸 다시 웹에 검색을 하든지 해서 적절한 이미지를 가져왔는지, 가격이나 수치 등이 비정상적이지 않고 합리적이며 일반적이고 표준에 가까운지 등 재검증." · (얼마게요) "판매자에 따라 가격이 천차만별이 아니고 적당히 형성된 가격" · (사진) "실루엣 같은건 누끼를 깔끔하게" — 실루엣은 안 쓴다 · (저작권) "공개 저장소에 넣지마. 상업 이용 안할거니까 그냥 다운 및 표시는 해도 됨"(그림은 git 밖 — 커밋하지 않는다).
- 설계 판단(2026-10-17): worldprice `cc: "EU"`(유로 지역 한 줄)는 **순위 표시에는 허용 · 목표(targetCc)로는 불허** → EU 가 targetCc 인 문항 1 은 drop · shownCc 에 든 3 은 ok(R052 가 "유로 지역" 으로 표시). price 1만 원 미만 20 은 보충하지 않는다.

■ 대상 (확인 대상 — 판정 전에 파일과 다시 맞춘다)
- 642 = price 100 · worldprice 172(품목 3 — 빅맥 54개국 · 아이폰 38 · 넷플릭스 194) · photo 120 · estimate 100 · which 150 · 전부 status candidate · verify null · 그림 508장(`assets/minigame/` — 없으면 `backups/minigame-2026-10-17.zip` 을 같은 자리에 푼다 · zip 은 git 밖).
- 값 재확인은 **전수**: price 100(항목마다 다른 판매처 1곳 새로) · worldprice 나라 **전부**(빅맥 54 · 아이폰 38 · 넷플릭스 194 — 현지가 페이지 다시 열기 · 환율은 통화마다 한 번) · photo 120(라이선스 공용 페이지 · 한국 표기) · estimate 100 · which 150(값 300). verifySample 표시는 무시한다(전수라 의미 없음).
- ★ 그 가운데 **먼저 · 더 깊게 여는 것**(C70 ① · G008 자기 검토) — price: 출처 2곳이 같은 다나와 페이지인 37 중 표본 밖 **10**(다른 판매처 1곳을 새로 연다) · 자동차 4종 · 사치품 전부(병행수입 시세 — 매장 정가와 비교해 1.5 안인가) / photo: 손질 4장(CC BY-SA 고친 사실이 `attribution` 에 있는가) · 한국 표기 근거 약한 7(라바콘 · 빵끈 · 집게핀 · 피자 세이버 · 케이블 타이 · 도어 클로저 · 수평계) · several 5(크루통 · 의사봉 · 빵끈 · 애글릿 · 피자 세이버 — 다른 이름 후보를 altAnswers 에 넣을지) · 만델라(배경 인물) · 서울월드컵경기장(관중) · 간디(서명) / estimate: 열량 7(kJ → kcal 환산) · 그린란드상어 392년 / worldprice: ECB 밖 환율 전부(공개 API 값을 다른 환율 표로 ±3%) · 빅맥 EU 행 / price-0030 로보락(그림의 기능 문구가 정답 단서인가).

■ 기준 — docs/18 6절 그대로. 새 기준 없음.
- 그림(**전수 508**): ① 그 대상이 맞는가 ② 정답 글자·가격 숫자·상표 로고가 보이는가(price 는 상표 로고 허용 — 정답이 가격이다 · photo·which·estimate 는 정답 낱말이 보이면 fix) ③ 흐림·워터마크·캡션 ④ photo 는 사진만 보고 답이 하나인가(비슷한 것이 둘 이상 떠오르면 fix — altAnswers 로 받을 수 있으면 fix · 못 받으면 drop) ⑤ 한국 표기(15 B2 — 한국에서 실제로 치는 표기만 · 영문 원어는 넣지 않는다).
- 값(전수): price 다른 판매처 1곳 ±30% · 중고/부속품/구성 다름 아님 · priceAsOf 1년 안 / worldprice 현지가·환율 ±10% / estimate 표준 출처 ±10% · 범위 값은 note 에 범위 / which 두 값 ±10%(연도는 정확히) · margin 규칙(bigger 1.3 · earlier 5년) · 정답 방향.
- verdict: **ok · fix(proposal 에 바꿀 칸과 값 · 근거 url) · drop(이유)**. 난이도(photo difficulty 1~3)는 120 전부 다시 매겨 proposal 에.
- 교훈 F — 섞은 6건(price 2 · photo 2 · estimate 1 · which 1)으로 RUBRIC 고정(짧게).

■ 할 일 (항목마다 "다 됐다" 의 기준)
A. 그림 전수 508 — 판정자가 Read 로 열어 한 줄씩(`v012-raw/images.json` — file · verdict · note). 다 됐다 = 508 전수 · 대상 다름 · 글자 노출 · photo 유일성 의심 수.
B. 값 — 642 전수(worldprice 는 나라 286 행). 다 됐다 = 건마다 다시 연 url · 다시 읽은 값 · 차이 % · verdict · 게임별 ok/fix/drop 표.
C. `verify` 칸 · `status` 채우기(VERIFY 가 직접 — 스크립트로 · 판정 파일에서 넣는다 · 642 전부):
   - `verify = {round:"V012", verdict, reason, proposal, checked:["image", "value", …]}` · status = ok → `verified` · drop → `rejected` · fix → `candidate` 그대로(G010 이 proposal 을 적용하고 verified 로).
   - worldprice 는 products.json 의 rows 가 값 정본 — 나라별 판정은 `v012-minigame.json` 의 `worldprice` 에(products.json 은 건드리지 않는다) · items.json 의 verify 칸은 그 문항의 targetCc · shownCc 나라가 모두 ok 면 ok · 하나라도 fix/drop 이면 그 verdict.
   다 됐다 = `node scripts/g008-check.mjs` 642/642 막힘 0 · status 집계(verified · candidate · rejected) 게임별 표.
D. 사실 — 제안의 새 값 전부 문서 url 로. E. 직접 재독 — fix · drop 전부 + ok 10%.

■ 웹·토큰 예산: WebSearch **80회 이내** · WebFetch 주 수단(값 재확인 ~900회 예상 — 조각은 게임별 · 100건 안팎씩) · 판정자 **한 번에 1개** · 그림 Read 508.
■ 산출물: `ai-out/V012.txt`(0~7절 — 0절에 게임별 표: 표본 ok/fix/drop · 그림 전수 결과 · status 집계 · "G010 이 반영하면 남는 수") · `data/pipeline/audit/v012-minigame.json`(round · date · model · web · counts · `images`(file 키) · `items`(id 키 — verdict · reason · proposal · checked · urls) · `worldprice`(productId/cc 키) · `flipped`) · `v012-raw/` · items.json 의 verify·status · 13 CV-25~(먼저: EU targetCc drop · several 5 의 altAnswers 제안 · 게임별 fix 비율이 20% 를 넘으면 그 원인 유형) · README V 표.
■ 하지 말 것: DB 쓰기 · items.json 의 verify·status 밖 칸 수정 · 그림 파일 수정·삭제·커밋 · 항목 추가 · 규칙/프롬프트/코드 수정 · Q 올리기 · 서버 기동·빌드 · 퀴즈 문항 판정(G009 몫 아님 — 다음 V013) · 다른 세션 몫 문서.
■ 커밋: 위 파일만(items.json 포함 — 그림은 빼고). 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 642 · 게임별 수 · 그림 508 · 전부 candidate/verify null · g008-check 642/642 — 다르면 0절에.
■ 지난 피드백 (V011): 잘한 것 — 대상을 시작 때 DB 에서 떠 파일로 고정한 것 · G008 이 이미 고친 #4268 · #641 을 DB 로 확인해 판정자 fix 를 ok 로 뒤집은 것 · #3680 을 원문(위키문헌)까지 열어 "고구마 밭" 단정을 잡은 것 · 제안 문구를 chk 로 통과시킨 것. 고칠 것 — 판정자 q1 이 WebFetch 대신 node 로 문서를 열어 횟수가 자기 보고뿐이었다 → 이번엔 판정자에게 **WebFetch 만** 쓰게 하고 url 을 결과 JSON 에 남긴다.
■ ★ 이어서: 이 라운드의 보고서 · 커밋 · push 가 끝나면 **같은 창에서** `ai-out/briefs/verify-next.md` 를 읽고 그 라운드(V013)를 바로 시작한다 — 찬종에게 묻지 않는다(찬종 2026-10-17: "검사는 몰아서 한번에 … 작업을 최대한 많이"). 그 파일이 없거나 첫 줄이 "보류" 면 멈춘다.
■ 답변: 한국어 · 터미널 5줄 이내.
