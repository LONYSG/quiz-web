[GEN G062 — ★ 작은 라운드 — **V051 반영 + 찬종 결정(2026-11-11)** — `data/minigame/song/items.json` 만: weak 45곡 inactive · titleKo 변형 5 · genre 2 고침 · 레전드 3 은 G061 대로(뺌 유지) · DG-100 · C137 · DB 쓰기 0 · 30분]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V051(`ai-out/V051.txt`)이 G061 결과를 대조했고 찬종이 골랐다: ① 레전드 엇갈림 3(Poison · I Just Called to Say I Love You · Celebration) = **G061 대로 뺌 유지**(손대지 않음) ② **weak 45곡 전부 비활성**(G061 34 중 V051 동의 30 + V051 추가 15 — V051 0절 ② 목록 · V051 이 "반대" 한 4곡(남자를 몰라 · 정이라고 하자 · HandClap · Hey Ya!)은 **활성 유지**) ③ titleKo 변형 5 추가 · genre 2 고침 · 불확실 3 은 그대로. 찬종: "노래 미니게임 빠지면 안 돼 · 채워질 때까지 플레이 안 할 거니까 **안정적으로 데이터 검수해서 넣는 과정**" → 이 라운드가 데이터 최종 · 적재는 MAIN R096(적재 스크립트가 새 칸을 받도록 고친 뒤 메뉴 1).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16 5-2 그대로. 번호 07 **DG-100** · 13 **C137**(끝 줄) · 05 · 06 · README G · 18 §10 "★ G062 실측" 한 줄(활성 수 · 분포). DB 쓰기 0 · 코드 0(`scripts/g061-song.mjs` 는 그대로 돌려 위반 0 확인). 하위 에이전트 0 · 웹 0. `reports:handle` 안 함.
■ 먼저 읽기: `ai-out/V051.txt` 0절 ② ③ ④ · 3절 · `data/pipeline/audit/v051-song.json` · `ai-out/G061.txt` 0절 ② · docs/18 §10 R096 칸.
■ 할 일
A. **weak 45 → `status: "inactive"` + `inactiveReason: "G062 #117 보편성 약함(찬종 2026-11-11)"`**. 45 = V051 동의 30 + 추가 15 — id 는 v051-song.json 에서. 반대 4 와 레전드 3 은 손대지 않는다. 결정 json `data/pipeline/audit/g062-song-decisions.json`(id · 전 status · 후 status · 사유).
B. **titleKo 변형 5**: song-0250 쉐이프 오브 유 · 0263 프로블럼(weak 라 inactive 지만 변형은 넣는다) · 0229 아일 비 미싱 유(inactive 곡 — 넣는다) · 0277 아이오 츠타에타이다토카 · 0162 휩래시 → `titleVariants` 에 추가(titleKo 는 그대로).
C. **genre 2**: song-0003 사랑했나봐 → OST · song-0148 사건의 지평선 → 발라드(genreWhy 갱신). 불확실 3(0124 · 0132 · 0239)은 그대로.
D. `node scripts/g061-song.mjs` 위반 0 · 활성 수 · 분포 표(category × genre × 연대) 다시 → 18 §10 한 줄 · 보고서.
E. 문서 · `ai-out/G062.txt`(0 ★ 찬종이 볼 것: 활성 n(설계 예상 207) · 비활성 45 목록 한 줄씩 · 분포 표 · "적재는 R096 메뉴 1" · 1 원칙 · 2 결정 필요 — 얇은 장르).
■ 하지 말 것: 곡 추가 · 레전드 재판정 · 코드 · DB · 13 A · CV · 20 · 메뉴 17.
■ 커밋: 1 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "G062 끝 — /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.
