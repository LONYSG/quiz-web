[GEN — ★ **말투 다듬기 적용 · 되풀이 라운드**(G065 부터 — 돌릴 때마다 다음 번호) : 아직 안 실은 gpt 다듬기 조각 전부 + VERIFY 가 통과시킨 재구성 전부 → **두 DB** · flag 처리 · 힌트 · 해설 끝말 · DB 쓰기 허용 · 한 번에 1~3시간(쌓인 양만큼)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 찬종 목표 = **오늘(2026-11-13) 안에 전 문항 말투 다듬기를 끝낸다.** gpt(Codex)가 조각을 계속 쓰고(10조각 묶음), VERIFY 가 재구성을 판정한다. 이 브리프는 **같은 명령으로 여러 번** 돌린다 — 돌릴 때마다 "그때까지 쌓인 것 중 아직 안 실은 것"을 싣고 끝낸다. 첫 적용 G064 가 본보기다(`ai-out/G064.txt` · `scripts/g064-*.mjs` · `data/pipeline/tone/g064-apply.json`). 질문 문장을 취향으로 다시 고치지 않는다(재판정 금지).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16 5-2 그대로. **DB 쓰기 허용**(쓰기 전 `node scripts/backup.mjs`) · **quizweb 과 quizweb_dev 둘 다**(★ 메뉴 17 금지) · dev 는 G064 처럼 before 가 다른 문항은 통째로 건너뛰고 수만 적는다 · 파일 → 기계 게이트 → DB · 열린 판 0 일 때 DB(`tmp/ops/play.json` 꼴). **라운드 번호**: `ai-out/G0NN.txt` 중 가장 큰 번호 + 1(첫 회 = G065). 보고 `ai-out/G0NN.txt` · 13(C · DG 다음 번호) · README G. 다른 창(MAIN R099 · VERIFY)이 같은 트리에서 돈다 — 커밋은 내 파일만 `git add`.
■ 첫 회에만: `scripts/g064-build · ending · finish · apply · gate.mjs` 를 라운드 번호를 인자로 받는 `scripts/tone-build.mjs` … `tone-apply.mjs --round g0NN` 꼴로 일반화한다(동작 같게 · g064 산출물은 그대로 둔다). 이미 실은 문항 = `data/pipeline/tone/g0*-apply.json` 에 있는 id 전부.
■ 할 일
A. **실을 것 고르기**(돌릴 때마다 새로 센다 — 보고서 1절 표):
  1. **다듬기 조각**: `web-desk/tone/받은것/결과-13.json` ~ `결과-73.json` 과 `결과-76.json` ~ `결과-80.json`(옛 web 조각 01~05 를 gpt 가 다시 판정한 것) 중 **비어 있지 않고**, `web-desk/tone` 에서 `PYTHONIOENCODING=utf-8 python _check.py NN` 이 "빠짐 0 · 더함 0" 인 조각. 그 안의 `rewrite` → `question` 그대로 / `keep` → 질문 그대로(끝말만) / `rebuild` → **싣지 않는다**(아래 2 로 온다) / `discard` → 싣지 않고 목록만(보고서 0절 — 찬종이 정한다).
     ★ 싣지 않는 파일: `결과-00~05` · `결과-74` · `결과-75`(옛 web 것 — 76~80 이 대신한다).
  2. **재구성**: `받은것/재구성-NN.json` 의 문항 중 **VERIFY 판정이 있는 것만** — `data/pipeline/audit/v0NN-tone.json`(V054 부터 · 키 = id) 에서 `lane` 이 `rebuild` 이고 `verdict` 가 `ok` 또는 `fix` 인 것. `ok` → 재구성 파일의 question · hint · explanation / `fix` → 그 json 의 `fixed` 에 있는 칸이 이긴다 / `reject` · 판정 없음 · status 가 ready 아님 → 싣지 않는다(수만). 변형 추가 · 삭제 제안이 `why` 에 있으면 따른다(G064 의 #2246 처럼).
  3. **VERIFY 가 고친 다듬기 문장**: 같은 json 에서 `lane` 이 `sample` 류이고 `verdict` 가 `fix` 인 것은 `fixed.question` 이 조각 문장을 이긴다. `to-rebuild` 판정은 싣지 않고 목록만(설계가 gpt 에게 보낸다).
  4. 이미 비활성 · 이미 실은 id 는 건너뛴다.
B. **flag 처리**(지시서 v10.1 — gpt 가 다듬는 김에 힌트 · 해설에서 본 문제를 `flag` 한 줄로 표시했다 · 조각 13~17 에 58): flag 마다 읽고 ① 맞는 지적이면 고친다 — 힌트의 정답 글자 · 다른 이름 건넴 · 질문 되풀이 · 해설 잘림 · 빔 · 힌트와 같은 사실 → 원문 재료 안에서(해설에 둘째 사실이 필요하면 웹으로 확인해 한 문장) ② "사실 의심" → 출처를 열어 맞으면 그대로(확인 URL 을 적는다) · 틀리면 고친다 ③ 틀린 지적이면 그대로 두고 한 줄 사유. 결과를 `g0NN-apply.json` 에 `flag: fixed | kept | fact-ok | fact-fixed` 로.
C. **힌트 · 해설 끝말**(G064 B 그대로 — `tone-ending` 규칙 · "~다." → "~입니다/습니다" · 새 사실 0) + 새 질문 ↔ 힌트 겹침(`checkHint` warn `question` · block 이 **새로** 생긴 것만 힌트를 다시 쓴다). `kind: ending | rewrite`.
D. **게이트 → DB**(G064 D 그대로): 새 질문에 정답 · 변형이 새로 든 것 0 · `checkHint` block 0 · 질문 200자(넘는 것은 원문도 넘던 것 · gpt note '200자 초과') · before = 지금 DB 값 → 백업 → 두 DB → `hint-check-active` 막힘 0 → 멱등 확인.
E. **VERIFY 묶음** `data/pipeline/audit/g0NN-verify-targets.json`(G064 꼴 그대로): 이번에 `rewrite` 한 힌트 · 해설 전부(flag 로 고친 것 포함) + `ending` 무작위 40 + 실은 다듬기 질문 무작위 50(조각 고루 — VERIFY 가 되부르기 · 뜻 바뀜을 표본으로 본다).
F. 보고 `ai-out/G0NN.txt`: 0 찬종이 볼 것(이번에 바뀐 질문 수 · **지금까지 누적 / 전체**(다듬기 대상 = 조각 02~73 의 7,104 + 조각 01 의 47) · 남은 조각 · discard 제안 목록 · flag 로 드러난 사실 오류) · 1 A 표(조각별 · 재구성 묶음별 수) · 2 B flag 표 · 3 C · D 숫자 · 두 DB · 4 못 한 것 · GEN 판단.
G. **마지막 회**(조각 13~73 · 76~80 이 전부 실렸고 재구성 판정도 다 실렸을 때 — 보고서 0절에 "다듬기 전부 끝" 이라고 쓴다): 제보 #118 처리 표시(`npm run reports:handle -- --id 118 --note "말투 다듬기 전 문항 적용 G064~G0NN" --yes` · 실 DB) · 활성 문항 중 질문 끝이 아직 "~는?" · "~ㅂ니까?" 인 것의 수(이모지 문항 제외)를 세어 목록으로.
H. **이모지 숫자 손질(한 번만 — `data/pipeline/tone/` 에 `emoji-number-fix.json` 이 이미 있으면 건너뛴다)** — 찬종 2026-11-13: "제목에 숫자가 있는 경우 숫자 이모지를 그대로 쓰지 마라(300 · 프로듀스 101). 내용상 의미 있는 숫자면 괜찮다. 상징적인 장면을 먼저, 정말 없거나 숫자 자체가 중요하면 써도 된다." 대상 = 활성 이모지 문항 중 숫자 이모지가 **제목의 숫자(또는 제목 속 수사)** 를 옮긴 것: #8065 300 · #8002 프로듀스 101 · #7857 7번방의 선물 · #7991 1박 2일 · #7786 비밀번호 486 · #7782 8282 · #7783 1,2,3,4 · #7765 서른 즈음에 · #7778 10 Minutes · #7814 Eleven · #7995 삼시세끼 · #7744 삼년고개 · #7687 세 살 버릇 여든까지 간다 · #7663 하룻강아지 범 무서운 줄 모른다. **그대로 두는 것**(내용의 숫자): #7485 드래곤볼 · #7513 백설공주 · #7858 명량 · #7750 구운몽 · #7714 천 리 길도 한 걸음부터. 문항마다 ① 상징 장면 · 소품으로 이모지 줄을 다시 쓴다(3~5개 · `web-desk/emoji/지시서.md` v2.1 §2 — 같은 분야의 다른 활성 문항과 줄이 겹치지 않게) ② 다시 써도 그 작품 하나로 모이지 않으면(8282 · 1,2,3,4 처럼 제목이 숫자뿐인 노래) **비활성**(`inactive_reason='emoji-number'`) ③ 숫자가 정말 그 작품의 전부라 남기는 것은 숫자를 한 번만 + 사유. 두 DB · 고치기 전/뒤를 `emoji-number-fix.json` 과 보고서 0절에 · 고친 줄은 VERIFY 묶음에 넣는다(블라인드).
■ 실을 것이 0 이면(위 H 도 이미 했으면): DB 를 만지지 않고 "실을 것 없음 — gpt · VERIFY 대기"와 남은 조각 수만 터미널에 쓰고 끝낸다(보고서 · 커밋 없음).
■ 하지 말 것: 질문 문장 재판정 · rebuild 문항을 직접 새로 쓰기 · 코드(`server/ client/ shared/`) · 지시서 · 받은것 파일 수정 · `찬종-확인.md` · 20 · 메뉴 17.
■ 커밋: 1 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "G0NN 끝 — 누적 n / 7,151 · 남은 조각 m — /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.
