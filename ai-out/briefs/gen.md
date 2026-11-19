[GEN — ★ **G104 · GFDL 그림 6장 · OpenTDB 흔적 지우기(데이터 · 파이프라인 쪽)** (찬종 2026-11-19) : 두 DB · DB 쓰기 허용(지우기) · 어림 40~60분 · **하위 에이전트 · gpt 를 부르지 않는다**]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16 · 앞 지시서 `gen-G103.md`)
TASK: 찬종이 공식 배포(도메인 · 광고)를 생각하면서 자료의 저작권을 정리하기 시작했다. 찬종 2026-11-19: "GFDL · OpenTDB 는 소수거나 안 쓰는 거니까 이제 **모든 곳에서 흔적을 지워**. 우리 작업 히스토리성 문서에만 '잠깐 썼다가 지웠다'는 식으로 기록만 하고, **db 에서도 지우고 문서들에서도 다 지워**." 이 라운드는 **그림 · 데이터 파일 · 파이프라인 코드** 쪽을 맡는다. 서버 · 클라이언트 · 마이그레이션 · docs 00~11 · ai-out 옛 보고서는 MAIN R106 이 맡는다(동시에 돌려도 된다 — 아래 "겹치지 않게").
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16 5-2 · quizweb 과 quizweb_dev 둘 다 · 열린 판 0 일 때 · **지우기 전에 두 DB 백업을 새로 뜬다**(6시간 안 덤프가 있어도 이번에는 뜬다 — 지우는 라운드) · 처음과 끝에 `node web-desk/tone/_status.mjs` · 보고 `ai-out/G104.txt` · 13 · README G · 내 파일만 `git add` · push.
■ 겹치지 않게(MAIN R106 과): 이 라운드는 `client/` · `server/` · `shared/` · `migrations/` · `docs/00~12` · `docs/20` · `ai-out/R*.txt` · 루트 `README.md` 의 "문제 출처" 줄을 **건드리지 않는다**. `questions` · `sources` · `question_raw` 표의 OpenTDB 줄도 지우지 않는다(R106 의 마이그레이션이 지운다 — 기록 표와 묶여 있어서).

■ A. GFDL 그림 6장 — 항목째 지운다(바꿔 넣지 않는다 · 새 그림을 찾지 않는다)
  · 그림: `estimate-0003` · `estimate-0060` · `which-0169-a` · `which-0027-b` · `which-0032-a` · `which-0035-b` (두 DB 의 `minigame_images.license` 가 GFDL · GFDL 1.2 인 것 전부 — 시작할 때 다시 세어 6 이 아니면 그 목록대로).
  · 항목: `estimate-0003` · `estimate-0060` · `which-0169` · `which-0027` · `which-0032` · `which-0035`. 어느 쪽?은 두 장이 한 쌍이라 **짝 그림도 함께** 지운다.
  · 두 DB 에서: `minigame_images` 의 그 그림들 → `minigame_items` 의 그 항목들을 **행째 삭제**. 이 항목을 가리키는 기록(경험 · 판 결과)이 FK 로 막으면 그 항목의 기록 줄도 지우고 수를 보고에 적는다. FK 없이 id 글자만 남는 기록은 그대로 둔다.
  · 파일: `data/minigame/estimate/items.json` · `data/minigame/which/items.json` · `items-2.json` 에서 그 항목을 뺀다 · `assets/minigame/` 의 그 그림 파일도 지운다 · 적재를 한 번 돌려(`minigame-load` — 두 DB) 되살아나지 않는 것을 확인한다.
  · 앞으로 못 들어오게: 자유 라이선스 목록(`g008-check` 의 FREE 등 그림 라이선스를 받는 곳 전부)에서 **GFDL 을 뺀다** · `docs/18` 의 그림 저작권 줄에 "GFDL 은 받지 않는다(2026-11-19)" 한 줄.
  · `data/pipeline/audit/` 의 옛 판정 기록 속 "GFDL" 글자는 **그대로 둔다**(다른 그림의 "CC BY-SA / GFDL 겸용" 표기가 섞여 있어 지우면 기록이 틀려진다 — 설계 판단).
■ B. OpenTDB — 데이터 파일 · 파이프라인 코드 · 스크립트
  · 시작할 때 `git grep -il -E "opentdb|open trivia|otdb"` 로 목록을 뜬다(설계가 센 것 = 78 파일 · 그중 이 라운드 몫 = `data/pipeline/` 19 · `pipeline/src/` 7 · `pipeline/README.md` · `scripts/` 10 · `.github/workflows/` 3 · `DATA_LICENSE.md`).
  · `data/pipeline/`: OpenTDB 에서 받아 온 원본 · 그것을 가공한 묶음 · 그 표본 시트 · 상태 파일은 **파일째 지운다**. 생성 문항과 한 파일에 섞여 있으면 OpenTDB 줄만 뺀다. 지운 파일 목록을 보고에.
  · `pipeline/src/` · `scripts/`: OpenTDB 수확 · 가공 코드(어댑터 · `pipeline-harvest.mjs` 등)를 지우고, 다른 파일의 갈래 · 주석 · 예시 글에서 이름을 뺀다. `package.json` 의 `pipeline:harvest` · `pipeline:process` 가 OpenTDB 전용이면 그 줄도 뺀다(★ `package.json` 은 줄 끝 글자만 달라 "바뀜"으로 떠 있을 수 있다 — `git diff --stat` 으로 보고 내 줄만 바꾼다). `.github/workflows/` 는 OpenTDB 수확용이면 파일째, 아니면 이름만.
  · `pipeline/README.md` · `DATA_LICENSE.md`: OpenTDB 줄 · 절을 빼고 지금 사실대로 다시 쓴다(출처 = 직접 작성 · 생성 · 나무위키 씨앗). "화면 표기의 조건" 절은 통째로 뺀다.
  · 게이트: `npm run typecheck` · `npm test` 통과 · 끝에 `git grep -il -E "opentdb|open trivia|otdb" -- data pipeline scripts .github DATA_LICENSE.md` = **0**(안 되면 남은 것과 까닭을 보고 맨 위에).

■ 보고에: 맨 위에 "GFDL 6항목 지움(두 DB 수 · 함께 지운 기록 줄 수)" · "OpenTDB 파일 지움 n · 고침 m · 남은 것 0/목록" · 백업 파일 이름 둘 · 되돌리는 법(백업 복원 + `git revert`). `찬종-확인.md` 에는 적지 않는다(고를 것 없음).

■ 끝: 현황판 · 커밋 · push · **멈춘다.** 상품 그림 · 치이카와 · 노래는 이번 라운드가 아니다(찬종과 정하는 중).
