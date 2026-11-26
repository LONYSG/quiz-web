[MAIN R122 — ★ **어느 창에서나 gpt 를 부르는 러너 `scripts/gpt-run.mjs`** : 새 스크립트 하나 + bat 하나 + docs/16 한 절 · 서버 · DB · 봇 안 건드림 · 어림 1~2시간 · 하위 에이전트 없이]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16 · 앞 지시서 `main-R121.md` · 본보기 = `scripts/gpt-cards.mjs`(카드 전용 러너 · 2026-11-14))

TASK: 찬종 2026-11-26 — "모든 세션에서 gpt 의 개입이 필요하거나 의견을 나눌 만한 일은 각자 세션에서 gpt 를 호출해서 쓸 수 있도록" · "gpt 를 좀 더 적극적으로 · 필요한 부분엔 팍팍(일부러 안 해도 되는 재검증은 말고)". 지금은 gpt 일(새 카드 · 고침 · 대본 · 그림)을 찬종이 gpt 창에 "ai-talk 확인"을 쳐서 돌린다. `gpt-cards.mjs` 는 Codex 를 `codex exec` 로 새로 불러 일을 맡기는 러너였지만 **카드 다시 쓰기 전용**이었다. 이것을 **아무 일 · 아무 창**에서 쓰는 일반 러너로 만든다. gpt 는 매번 새로 불린다(기억 없음 — 할 일은 전부 지시서 파일에 있다).
실행 모델: Sonnet 5.5 로 충분하다(작은 스크립트).

1. `scripts/gpt-run.mjs` — 쓰는 법(파일 머리 주석에 그대로):
   ```
   node scripts/gpt-run.mjs --brief <지시 md 파일> --out <경로>[,<경로>…] [--read] [--model astra] [--label 짧은이름] [--wait]
   ```
   · `--brief` = gpt 가 할 일 전체를 적은 md(부르는 창이 쓴다 · ai-talk 글이어도 된다).
   · `--out` = gpt 가 **쓸 수 있는 파일 전부**(이것 말고는 쓰지 않는다 — 프롬프트에 박는다). `--read` = 의견 묻기: 샌드박스 read-only, 답(마지막 메시지 전체)을 `-o` 로 `--out` 첫 경로에 받는다.
   · 프롬프트 뼈대: "AGENTS.md 를 따른다. 이번 실행은 러너(scripts/gpt-run.mjs)가 부른 것이다(AGENTS.md 3-3). <brief 경로> 를 읽고 그대로 한다. 쓸 수 있는 파일 = <out 목록>뿐. ai-talk 글은 쓰지 않는다. 묻지 말고 끝까지. JSON 결과는 다 쓴 뒤 한 번에 저장하고 맨 위에 "done": true. 마지막 메시지는 한 줄(무엇을 · 몇 장 · 걸린 것)." — `--read` 면 "파일을 쓰지 않는다 · 답을 마지막 메시지로" 로 바꾼다.
   · Codex 호출은 `gpt-cards.mjs` 와 같게(`codex exec -s workspace-write --skip-git-repo-check -o … -`, `--read` 면 `-s read-only`). `--model` 이 없으면 Codex 기본(지금 `~/.codex/config.toml` = gpt-6.2-sol · medium). `--model astra` = 찬종이 말한 상위 모델 — **정확한 모델 이름을 Codex 에서 확인**해(`codex` 도움말 · 모델 목록 · 짧은 시험 호출) 스크립트 안 표(`astra → <실제 이름>`)에 적는다. 못 찾으면 그 줄을 비우고 보고에 "astra 이름 찬종 확인 필요".
2. ★ **떨어진 창 · 줄 세우기 · 잠금**(gpt-cards 의 교훈 — Claude 창 안 배경 실행은 그 창이 한도로 끊길 때 같이 죽었다):
   · 부르면 일을 `tmp/gpt-run/queue/<시각>-<label>.json` 에 적고, 일꾼(`gpt-run.bat` → `node scripts/gpt-run.mjs --worker`)이 안 돌고 있으면 **떨어진 새 창**(`Start-Process … -WindowStyle Minimized`)으로 띄운다. 일꾼은 줄을 **한 번에 하나씩** 차례로 돌고, 줄이 비면 끝난다. 잠금 `tmp/gpt-run.lock`(죽은 pid 의 잠금은 무시).
   · 일마다 상태 파일 `tmp/gpt-run/<id>.json`: `queued | running | done | failed | limit` · 시작 · 끝 · 분 · 마지막 한 줄 · tokens used(Codex 출력에 있으면). `--wait` 면 부른 쪽이 그 상태 파일이 끝날 때까지 기다렸다가(5초마다 · 최대 60분) 결과 한 줄을 찍고 끝난다. 기다리지 않으면 id 만 찍는다.
   · 끝 판정: `--out` 이 JSON 이면 파일이 있고 `"done": true` · 아니면 파일이 비어 있지 않음. 아니면 `failed`(한 번 더 돌린다 · 또 안 되면 다음 일로).
   · **한도**: Codex stderr · 마지막 메시지에 사용량 한도(usage limit · rate limit 등 — 실제 문구는 gpt-cards.log 와 Codex 출력에서 확인)가 보이면 그 일을 `limit` 로 두고 **줄 전체를 멈춘다**(남은 일은 queued 로 남김 · 다시 부르면 이어서).
   · 기록 `tmp/gpt-run.log`: 한 줄에 시각 · id · label · brief · out · model · 상태 · 분 · tokens.
3. `node scripts/gpt-run.mjs --status` = 줄 · 도는 것 · 최근 10개를 표로(찬종 · 다른 창이 보는 용).
4. 시험(돈 적게 — 짧은 brief 로): ① `--read` 로 "AGENTS.md 의 3 번 목록에서 파일 몇 종류인지 한 줄" ② 쓰기: tmp/gpt-run-test.json 에 `{"done": true, "n": 3}` 쓰기 ③ 둘을 연달아 불러 줄이 차례로 도는지 · `--wait` 결과 ④ `--status`. 시험 파일은 끝나고 지운다.
5. docs/16 에 한 절 "gpt 부르기(모든 창)": 언제 부르나(문장 쓰기 · 자연어 마지막 손질 · 의견 · 반론 — 찬종 2026-11-20 "자연어의 마지막 단계는 gpt"), 쓰는 법 두 줄, brief 에 넣을 것(할 일 · 입력 파일 · 출력 경로 · 기준 문서 · 검색 여부), 하지 말 것(이미 판정된 것 다시 검증 · 같은 일 두 번), 결과는 부른 창이 읽고 판단한다 · ai-talk 에는 부른 창이 필요하면 한 줄.
6. 커밋 · 보고 `ai-out/R122.txt`(짧게): 만든 것 · 시험 결과 · astra 실제 이름 · 걸린 것. **실 반영 필요 없음**(서버 코드 아님).

하지 않는 것: gpt-cards.mjs 고치기(그대로 둔다) · 서버 · DB · 봇 · 빌드.
