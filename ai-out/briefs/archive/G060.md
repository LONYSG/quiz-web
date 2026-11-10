[GEN G060 — ★ 작은 라운드 — **문항 제보 1**(찬종 실전 #122 2026-11-10 "이건 양궁에서만 쓰는 말은 아니잖아" — #2458 "양궁 단체전이나 계주에서 남녀가 한 팀을 이뤄 겨루는 방식은?" → 혼성) · 고치거나 비활성 · 두 DB · DG-098 · C134 · 20분 · ★ 열린 판 0 일 때]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: #2458 은 "혼성" 이 양궁 · 계주만의 말이 아닌데 그 둘을 들어 묻는다 — 정답이 너무 넓은 일반어(15 §1 · §3-2 한정) . 설계 판단: **고친다**(예: "올림픽 양궁 · 탁구 · 배드민턴 등에서 **남녀 한 명씩** 짝을 이뤄 겨루는 종목을 가리키는 말은?" → 정답 "혼성" · 변형 "혼합 복식 · 혼성 단체전" 은 **다른 말이라 넣지 않음** — 15 §2) · 자연스럽게 못 고치면 비활성(`inactive_reason='G060 제보 #122'`). 같은 꼴(스포츠 일반어를 한 종목에 묶어 묻는 것)이 더 있는지는 **찾지 않는다**(제보 하나 — 전수는 다음 측정 라운드에).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16 5-2 그대로. 07 **DG-098** · 13 **C134**(끝 줄) · 05 · 06 · README G · `reports:handle --id 122 --note "G060 …" --yes`. DB 쓰기 = 이 한 행(`g059-apply.mjs` 꼴 · 결정 json · before 같을 때만 · undo `audit/g060-undo.json`) · 쓰기 전 `node scripts/backup.mjs` · **열린 판 0 일 때만** · **quizweb 와 quizweb_dev 둘 다**(dev 에 같은 id 가 있을 때만). 웹 0 · 하위 에이전트 0.
■ 먼저 읽기: `npm run reports:report`(#122) · `ai-out/G059.txt`(1절 — 고침 꼴 · 두 DB 적용) · `scripts/g059-apply.mjs` · docs/15 §1 · §2 · §3-2 · `scripts/hint-check.mjs`.
■ 할 일: A. 번호 · 열린 판 · #2458 전문(두 DB 같은지). B. 질문 · 힌트 · 해설 다시 씀(사실 그대로 · 길이 · checkHint · checkAnswerSet · crossans 전후) → 결정 json → dry-run → 적용(두 DB) → `hint-check-active` 막힘 0. C. 문서 · `reports:handle` 122 · `ai-out/G060.txt`(0 ★ 찬종이 볼 것: 전 → 후 한 줄 · 켜진 서버에도 다음 판부터 · 1 원칙 7 · 2 결정 필요).
■ 하지 말 것: 다른 문항 · 전수 검색 · 코드 · 13 A · CV · 20 · 메뉴 17.
■ 커밋: 1 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "G060 끝 — /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.
