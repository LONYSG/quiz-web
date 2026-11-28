[GEN — ★ **G122 · gpt 가 두 번째로 고친 기존 카드 싣기(V121 ok 만) + 다시 매긴 등급 · 알가치** : DB 쓰기(dev + 실) · 웹 없음 · 하위 에이전트 없이 · 어림 20~30분]  (이 파일이 지시 전체 · 판정 `data/pipeline/audit/v121-fix.json` · 근거 `ai-out/V121.txt` · 고친 글 `web-desk/tone/받은것/기존-고침-02-p01.json` · 고치기 전 `web-desk/tone/보낼것/기존-고침-02-p01.json` · 앞 판 `ai-out/briefs/gen-G121.md` · `ai-out/G121.txt` · 보고 `ai-out/G122.txt`)

실행 모델: Opus 5.5.

★ 시작 조건: `data/pipeline/audit/v121-fix.json` 에 `"done": true` 가 있어야 한다. 없으면 아무것도 쓰지 않고 "V121 기다림" 한 줄로 끝낸다.

■ 왜: G121 이 만든 고침 묶음 02(25장 = V120 fix 15 + V119 fix 8 + 게이트 막힘 2)를 gpt 가 고쳤고 V121 이 판정했다. ok 만 싣는다. 방법은 G121 과 같다 — `scripts/g121-apply.mjs` 를 `scripts/g122-apply.mjs` 로 옮겨 입력만 바꿔 쓴다.

1. 싣기(멱등 · `--undo`(옛 글 · 옛 등급 보관 `audit/g122-undo-<db>.json`) · 실 백업 먼저 · dev 는 source_ref 로 짝 — dev 글이 보낼것과 다르면 G121 처럼 그대로 둔다)
   1-1 V121 `verdict: "ok"` 카드: `changedReal` 칸만 고친 글로. 싣기 전에 지금 DB 글이 보낼것 `card` 와 같은지 본다 — 다르면 싣지 않고 표에.
   1-2 질문이 바뀐 카드: V121 `grade` · `worth`(종류 · 근거)를 같이. 규칙 G119 그대로(올림 전부 · 내림 한 단계까지 · 영상에 나간 카드는 등급 그대로) · 장부 `grade-judged.json` 에 새 질문 해시로(`at` = "V121"). V121 값이 없는 질문 바뀐 카드는 싣지 않는다.
   1-3 새 카드 n6887: ok 면 G121 2절 꼴로 새로 싣는다(꼬리표 source_ref '#g122-' · 등급 · 알가치 = V121 · 소분류는 GEN 판단 · 인정어 = 카드 also + V116 alsoAdd).
   1-4 V121 `add: true` = 인정 답에(G120 눈 · 꼬리표 '#g122').
   1-5 평소 게이트 그대로(힌트 검사 · 정답 드러남 · 같은 정답 겹침). 막힌 카드는 싣지 않고 까닭과 함께 표에.
2. 싣지 않는 것: V121 `fix` · `drop` · gpt `need`. **세 번째 묶음은 만들지 않는다** — 대신 보고에 한 장씩 표로 적는다(키 · 정답 · 걸린 칸 · 까닭 한 줄 · 갈래). 그 가운데 **V119 fix 갈래(출처를 열어 틀렸다고 확인된 구절이 지금도 활성 글에 남아 있는 카드)**는 따로 표시한다 — 설계가 보고 처리한다.
3. 끝 점검(실 · dev): 활성 수(새 카드만큼만 늘어남) · hint-check-active 막힘 0 · grade-fresh-check 장부에 없음 0 · 질문 바뀜 0 · 바뀐 칸 수 = V121 ok 카드 changedReal 합(막힌 것 빼고).
4. 보고 `ai-out/G122.txt`(짧게 · 맨 위 표): 실은 카드 수(칸별 · 질문 바뀜 · 등급 앞 → 새) · 못 실은 것과 까닭(2절 표) · 인정 답 · 되돌리기 명령 · 실 서버를 다시 켜야 하는지 한 줄 · 못 한 것(까닭) — "남긴 것" 칸은 없다.
■ 다른 창과 안 부딪치게: 같은 때 도는 창 없음. `server/` · `client/` · `shared/` 는 건드리지 않는다. 실 서버를 끄거나 켜지 않는다.
■ `찬종-확인.md` 에는 쓰지 않는다. 끝: 내 산출물만 파일 이름으로 `git add`(`data/pipeline/audit` · `web-desk` 통째로 add 하지 않는다) · 커밋 전 `git fetch` → `git rebase --autostash` · push · 멈춘다.
