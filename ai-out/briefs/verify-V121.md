[VERIFY V121 — ★ **gpt 가 두 번째로 고친 기존 카드 25장 판정: 고친 칸 ↔ 재료 대조 + 질문 바뀐 카드는 등급 · 알가치 · 블라인드를 같은 자리에서** : DB 읽기만(실 quizweb) · 웹 없음 · 하위 에이전트 한 번에 2개까지 · 어림 20~30분]  (이 파일이 지시 전체 · 입력 `web-desk/tone/받은것/기존-고침-02-p01.json`(gpt 가 고친 글) + `web-desk/tone/보낼것/기존-고침-02-p01.json`(고치기 전 카드 · 재료 · 고칠 까닭 · 앞 판에 걸린 문장 `tried`) · 고침 지시 `web-desk/tone/기존-고침/지시-02-p01.md` · 앞 판 `ai-out/briefs/verify-V120.md` · `ai-out/V120.txt` · 등급 기준 `data/pipeline/audit/v028-raw/INSTRUCTIONS.md` · 알가치 기준 `data/pipeline/audit/v029-raw/INSTRUCTIONS.md` + `anchors60.md` · 보고 `ai-out/V121.txt`)

실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다) · 판정 하위 = sonnet · 블라인드 하위 = haiku

★ 시작 조건: `web-desk/tone/받은것/기존-고침-02-p01.json` 에 `"done": true` 가 있어야 한다. 없으면 아무것도 쓰지 않고 "gpt 기다림" 한 줄로 끝낸다.

■ 왜: V120 이 fix 로 본 15장 · V119 가 출처를 열어 틀렸다고 본 8장 · G121 싣기 게이트(힌트에 정답 조각)에 막힌 2장 = 25장을 gpt(sol) 가 다시 고쳤다. V120 과 **같은 방법**으로 판정한다 — 방법은 `ai-out/briefs/verify-V120.md` 1~4절 그대로이고, 스크립트는 `data/pipeline/audit/v120-raw/` 의 것을 `v121-raw/` 로 옮겨 고쳐 쓴다. 아래는 달라진 것만.

■ 0. 대상
 · `status: "ready"` 인 카드만 판정한다. `need` · `drop` 은 판정하지 않고 목록만(키 · gpt 가 적은 까닭).
 · 키 = 실 DB id(새 카드 n6887 한 장).

■ 1. 기계 대조(V120 1절 그대로) — 받은것 글 ↔ 보낼것 `card` 로 실제 바뀐 칸 · `why` 에 안 걸린 칸이 바뀐 카드 · 정답(과 그 조각)이 질문 · 힌트에 들어간 카드 · 빈 칸 · 보낼것 `card` ≠ 지금 DB 인 카드.
 · 더해서: 고친 문장이 `tried`(앞 판에 걸린 문장)와 같으면 판정 없이 `fix` + `unsolved: true`.

■ 2. 판정(바뀐 칸만 · V120 2절 그대로) + 갈래별로 볼 것
 · **V120 fix 15장**: `why` 의 `kind: "v120"` 까닭이 풀렸는가 — 재료에 없는 말을 뺐는가 · 해설이 질문 · 힌트와 같은 사실을 되풀이하지 않는가 · 해설 주인공이 정답인가.
 · **V119 fix 8장**: `why` 의 `span` 이 `right`(맞는 값)대로 고쳐졌는가(또는 그 문장이 빠지고 해설이 서는가). `right` 와 `material.extra` 가 이 카드의 재료다 — 웹은 다시 열지 않는다. 그 밖에 새로 더한 사실이 있으면 `fix`.
 · **게이트 2장(#6185 · #6522)**: 고친 힌트에 정답 낱말과 조각("책" · "크레" · "파스")이 한 글자도 없는가. `node scripts/hint-check.mjs` 꼴의 검사를 그대로 돌려 본다(스크립트 이름은 `scripts/g121-apply.mjs` 가 부르는 것을 따라간다).
 · 재료 없는 9장: 고치기 전 글에 있던 사실만 썼는가.

■ 3. 질문이 바뀐 카드(1 의 실제 값 + 보낼것 `needsRegrade: true` 4장 #1639 · #2961 · #5540 · n6887 중 ok 인 것)
 · V120 3절 그대로 — 프롬프트 `data/pipeline/audit/v117-raw/prompt.md`(고치지 않는다) · 지금 등급 · 알가치는 안 줌 · 금 표본 10장 섞어 눈금 맞춤 · 블라인드(haiku) · `wide` 는 `fix`.
 · n6887 은 질문이 안 바뀌어도 알가치를 매긴다(새 카드 — 알가치 빈칸).

■ 4. 결과 `data/pipeline/audit/v121-fix.json` — 꼴은 `v120-fix.json` 과 같다(`done` · `cards` · `need` · `drops` · `anchors`) · `"done": true` 는 전부 끝난 뒤 · DB 에는 쓰지 않는다.

■ 보고 `ai-out/V121.txt`(짧게 · 맨 위 표): 대상 수 · ok / fix / drop / need · 갈래별(V120 fix · V119 fix · 게이트) ok 수 · fix 전부를 표로(질문 · 고친 구절 · 재료가 말한 값 — 25장이라 표본이 아니라 전부) · 질문 바뀐 카드 등급 앞 → 새 · 눈금 표 · 못 한 것(까닭) — "남긴 것" 칸은 없다.
■ 다른 창과 안 부딪치게: 같은 때 도는 창 없음(GEN G122 는 이 판의 `done: true` 를 보고 시작한다). `web-desk/` · `scripts/` · `ai-out/briefs/` 는 건드리지 않는다. 임시 파일은 `data/pipeline/audit/v121-raw/` 안에만. 커밋은 내 산출물만 **파일 이름으로** add.
■ `찬종-확인.md` 에는 쓰지 않는다. 끝: 커밋 전 `git fetch` → `git rebase --autostash` · push · 멈춘다.
