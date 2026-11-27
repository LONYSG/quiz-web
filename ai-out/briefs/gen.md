[GEN — ★ **G114 · 새 카드 4차 32장 싣기 + 실린 카드 해설 한 장 바꾸기** : DB 쓰기(dev + 실) · 카드 글은 한 글자도 고치지 않는다 · 하위 에이전트 없이 · 어림 40분]  (이 파일이 지시 전체 · 방법은 `gen-G113.md` 1 과 같다(→ `gen-G112.md` → `gen-G108.md` 1~4) · 앞 보고 `ai-out/G113.txt` · 스크립트 `scripts/g113-apply.mjs` 를 본떠 `g114-apply.mjs`) (설계 2026-11-27)

실행 모델: Opus 5.5.

1. 싣기(멱등 · `--undo` · 꼬리표 '#g114-' · 실 백업 먼저)
   1-1 V112 ok 31장 — 판정 `data/pipeline/audit/v112-newcards.json`(done true) 에서 verdict ok 인 key 만. 카드 = `web-desk/tone/받은것/새카드-60~66 · 68.json` 의 같은 key(ready) · 재료 = `web-desk/tone/보낼것/새재료-60~66 · 68.json`. 판정의 `alsoAdd`(n6047 "참정권" 등)는 인정어에 더한다 · `second` 가 있으면 출처에 함께.
   1-2 n6005 세뱃돈 — V112 fix → gpt 고침 `web-desk/tone/받은것/새카드-고침-6.json`("done": true · ai-talk/114) 의 card 로 싣는다(바뀐 것은 해설뿐 · "나오지 않는다고 합니다"로 낮춤 — 설계 확인).
   1-3 게이트(형태 · 힌트 hint-check)는 그대로 건다 — 걸리면 싣지 말고 보고.
2. 실린 카드 해설 바꾸기 — n3013 다스 베이더(실 · dev 둘 다 이미 활성)
   · 같은 고침-6 파일의 n3013 card 의 explanation 으로 **해설만** 바꾼다(질문 · 힌트 · 인정어 · 분류 · 등급은 그대로). 새 해설의 "반전을 감추려고 · 촬영이 끝난 뒤 따로 녹음"은 재료 story 2 · 3 의 quote 로 받쳐진다(설계 확인).
   · 바꾸기 전 해설을 `data/pipeline/audit/g114-raw/n3013-before.json` 에(실 · dev 문항 id 함께) · `--undo` 가 되돌린다.
3. 끝 점검: 활성 수(실 8,186 + 실은 수 · dev 7,709 + 실은 수) · hint-check-active 막힘 0 · n3013 해설이 두 DB 에서 같은지.
4. 보고 `ai-out/G114.txt`(짧게): 실은 수 · 못 실은 것과 까닭 · n3013 바꿈 확인 · 되돌리기 명령.
■ 끝: 내 산출물만 `git add` · 커밋 전 `git fetch` → `git rebase --autostash` · push · 멈춘다.
