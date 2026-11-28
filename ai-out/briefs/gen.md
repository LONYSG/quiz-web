[GEN — ★ **G121 · gpt 가 고친 기존 카드 싣기(V120 ok 만) + 다시 매긴 등급 · 알가치 + 다음 고침 묶음 만들기** : DB 쓰기(dev + 실) · 웹 없음 · 하위 에이전트 없이 · 어림 1시간]  (이 파일이 지시 전체 · 판정 `data/pipeline/audit/v120-fix.json` · 근거 `ai-out/V120.txt` · 고친 글 `web-desk/tone/받은것/기존-고침-01-p01~p08.json` · 고치기 전 `web-desk/tone/보낼것/기존-고침-01-p01~p08.json` · 보고 `ai-out/G121.txt`)

실행 모델: Opus 5.5.

★ 시작 조건: `data/pipeline/audit/v120-fix.json` 에 `"done": true` 가 있어야 한다. 없으면 아무것도 쓰지 않고 "V120 기다림" 한 줄로 끝낸다.

■ 왜: V118 · V116 이 찾은 흠을 gpt 가 고쳤고(ready 268) V120 이 재료와 대조했다. ok 인 것만 싣는다. 질문이 바뀐 카드는 V120 이 같은 자리에서 등급 · 알가치를 다시 매겼다 — 그 값을 같이 실어야 게이트(grade-fresh-check)를 지난다.

1. 싣기(`scripts/g121-apply.mjs` · 멱등 · `--undo`(옛 글 · 옛 등급 보관 `audit/g121-undo-<db>.json`) · 실 백업 먼저 · dev 는 source_ref 로 짝)
   1-1 V120 `verdict: "ok"` 카드: V120 `changedReal` 칸만 고친 글로 바꾼다(다른 칸은 한 글자도 안 바꾼다). 싣기 전에 지금 DB 글이 보낼것 `card` 와 같은지 본다 — 다르면 싣지 않고 표에.
   1-2 질문이 바뀐 카드: V120 `grade` · `worth`(종류 · 근거) 를 같이 싣는다. 등급 규칙은 G119 그대로 — 올림 전부 · 내림은 한 단계까지 · **영상에 나간 카드(`web-desk/vscript/회차.json`)는 등급 그대로**. 장부 `data/pipeline/audit/grade-judged.json` 에 새 질문 해시로 줄을 갈아 넣는다(`at` = "V120"). V120 값이 없는 질문 바뀐 카드는 싣지 않는다.
   1-3 새 카드 14장(n 번호): 지금 DB 의 그 카드(G118 이 실은 것 · source_ref 로 찾음 — 아직 안 실린 것이면 새로 싣는다 · g118-apply 꼴)에 고친 글 + V120 알가치.
   1-4 V120 `add: true`(블라인드 표기) = 인정 답에(G120 눈으로 — 같은 대상의 다른 표기만 · 다른 카드 정답과 겹치면 안 넣음 · 꼬리표 '#g121').
   1-5 #5024: V120 `spelling` 대로 정답 · 인정 답을 맞춘다(사전 표기 = 정답 · 다른 표기 = 인정 답). 질문 글에 정답 표기가 들어 있지 않으면 등급은 그대로.
   1-6 평소 게이트 그대로: 힌트 검사(hint-check) · 정답 드러남 · 같은 정답 겹침. 막힌 카드는 싣지 않고 까닭과 함께 표에.
2. 싣지 않는 것(표에 수만): V120 `fix` · `drop` · `need` 15(찬종 11-28: 그대로 둔다 — 보강 판 없음 · 지금 글 그대로 활성).
3. 다음 gpt 묶음 `web-desk/tone/보낼것/기존-고침-02.json`(꼴 = `기존-고침-01.json` · `scripts/g120-pack.mjs` 를 고쳐 씀 · 맨 위 `"done": true` 는 다 만든 뒤)
   · V120 `fix` 전부(고친 글이 아니라 **지금 DB 글**을 `card` 로 · `why` 에 V118 까닭 + V120 이 적은 것 · gpt 가 한 번 고쳤다 걸린 문장은 `tried` 칸에 참고로)
   · V119 fix 8장(#2592 · #2608 · #2820 · #2969 · #4462 · #4991 · #5012 · #7455 — `data/pipeline/audit/v119-check.json` cards[id].fix 의 구절 · 맞는 값 · 연 주소를 `why` 와 `material.extra` 에)
   · 1-6 에서 막힌 카드.
   묶음이 비면 만들지 않는다. 설계가 `web-desk/tone/기존-고침/_나눠서-부르기.mjs` 로 gpt 줄에 넣는다(이 판은 gpt 를 부르지 않는다).
4. 끝 점검(실 · dev): 활성 수 그대로 · hint-check-active 막힘 0 · grade-fresh-check 장부에 없음 0 · 질문 바뀜 0 · 바뀐 칸 수 = V120 changedReal 합.
5. 보고 `ai-out/G121.txt`(짧게 · 맨 위 표): 실은 카드 수(칸별 · 질문 바뀜 · 등급 바뀜 앞 → 새) · 못 실은 것과 까닭 · 인정 답 · #5024 · 다음 묶음 장수와 갈래 · 되돌리기 명령 · 못 한 것(까닭) — "남긴 것" 칸은 없다.
■ 다른 창과 안 부딪치게: 같은 때 도는 창 없음. `server/` · `client/` · `shared/` 는 건드리지 않는다. 실 서버를 끄거나 켜지 않는다(문항 풀을 서버가 쥐고 있어 다시 켜야 하면 보고 맨 위에 한 줄 — 설계가 한다).
■ `찬종-확인.md` 에는 쓰지 않는다. 끝: 내 산출물만 파일 이름으로 `git add`(`data/pipeline/audit` · `web-desk` 통째로 add 하지 않는다) · 커밋 전 `git fetch` → `git rebase --autostash` · push · 멈춘다.
