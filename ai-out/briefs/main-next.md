[MAIN R085 — ★ **OX 10연속** `ox`(D-330 ⑴ · 18 §11 · G041 400 문장) — 문장 10 · O/X 두 버튼 · 5초 · 앞 5 는 grade 1 · 같은 pairId 한 판 금지 · 공개 때 explanation · 적재 = `minigame-load.mjs` 에 `ox`(minigame_items 재사용 · verified 만 · 메뉴 1 자동) · 반나절 · 실 DB 쓰기 0 · R084 와 같은 창에서 이어서]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 찬종 2026-11-08 2차 답 ⑴ "**OX 퀴즈**를 만든다 — 문장은 새로 생성". 데이터 = G041 `data/minigame/ox/items.json` **400**(참 200 · 거짓 200 · grade 165/158/77 · trap 5축 · pairId 쌍 44 · 전부 candidate — **VERIFY V042 가 전수 판정 중**(V041 뒤) · 실 DB 에는 verified 만). 형식 docs/18 **§11**(설계가 "게임 규칙(R085)" 줄을 더함 — G041 결정 ①②③ 설계 답: ① 10 문장 · 5초 ② 쌍 같은 판 금지 ③ **앞 5 문장 grade 1 · 뒤 5 는 2·3 섞기**). 객관식 10연속(R080 `choice` — "문항 하나 = 판 하나 × 10" · CHOICE_* 상수 · 보기 → 여기선 두 버튼)을 그대로 본뜬다.
실행 모델: Opus 5.5 (R084 와 같은 창)

■ 고정 규칙: docs/16 그대로 (번호 — R084 다음 · R084 보고서에서 확인: **D-342** · **A112** · 마이그레이션 없음 · 10 **65절** · 01 **16-R085** · 04 "R085"). 하위 에이전트 0. quizweb_test · 메뉴 15. 동시 라운드(G042/G043 · V041/V042) 와 겹침 없음 — ox 파일은 **읽기만**(V042 가 verify · status 를 쓴다 · 쓰는 중이면 1분 뒤). 문서 분담은 R084 와 같다(R085 = 07 D · 13 A112 · 10 · 01 · 04 · 18 §11 적재 한 줄 · README R).

■ 먼저 읽기: `ai-out/R084.txt` · `ai-out/G041.txt`(0절 ① 표 · ③ 예 · 5절 결정) · docs/18 **§11**(칸 · ★ 게임 규칙 줄) · `server/src/minigame/topicGames.ts` choice 320~(판 흐름 · CHOICE_READY/PLAY/REVEAL · 쓴 문항 집합 · 경험 안 남김 → OX 는 **경험 남김**(item 단위 — 데이터 항목이라)) · `client/src/minigame/TopicGames.tsx` ChoicePick/ChoiceReveal/ChoiceAnswers · `scripts/minigame-load.mjs`(R084 가 song 을 넣은 꼴) · docs/10 64절.

■ 설계 결정 (MAIN 판단 · 상수는 `shared/src/minigame/ox.ts`)
① **적재**: minigame-load GAMES_ALL 에 `ox`(칸 = §11 — statement · answer · explanation · category · grade · trap · pairId · image 없음) · verified 만 · --allow-candidate(R084 빗장 그대로) · 메뉴 1 훅의 `--game song` → `--game song,ox` · test/dev 에 400 candidate.
② **게임**(`ox` · 이름 "OX 10연속" · kind 'quiz' · rounds **10**(문장 하나 = 판 하나) · scoring 'correct' · tiebreak 'timeSum' · better 'low' · unit 'ms' — choice 꼴): 판 시작 때 서버가 10 문장 고름 — **앞 5 = grade 1 · 뒤 5 = grade 2 · 3 섞기**(모자라면 채움) · **같은 pairId 둘 금지** · 분야 섞기(같은 l1 ≤ 3) · 경험(item 단위 `ox|<id>` · 전원 본 것 뒤로) · 문장마다 **5초** · O / X 두 버튼(PC: O · X 키 또는 ← →) · 누르면 바꿀 수 있음(마지막) · 맞히면 1 · 끝나면 10 문장 **정답 + explanation 목록**(틀린 것 표시 · 거짓이면 "실제로는 …") · 경험 기록 남김(본 문장은 다시 안 나옴 — 400 이라 금방 돎 · 전원 경험 뒤 다시 허용) · 항목 < 10 이면 안 뽑힘.
③ **카탈로그**: 맨 앞(ox → song · songyear → …) · oneLine · controls · 아이콘 · 세 테마 · m360(두 버튼 크게).
④ **봇 · ui-check**: 봇(O/X 누름 · 안 누름 · 바꿈 · 10 문장 · pairId 금지 확인 · grade 순서 · 경험) · ui-check **r085**(두 버튼 · 문장 길이 90자 m360 넘침 0 · 공개 목록 · 세 테마) → docs/design/r085.
⑤ 되돌리기: 끄면 끝 · 적재 더하기만.

■ 할 일: A 적재 ox(커밋 1) · B 게임(서버 · 화면 · 공개)(2) · C 봇 · ui-check r085 · 그림 보고 고침(3) · D 끝 점검(단계별 — typecheck · vitest · build · smoke · 봇 mgonly · result · ui-check r085 + r084 · main-behavior · 메모리) · E 문서(07 D · 01 16-R085 · 04 · 10 65절 · 11 · 18 §11 적재 줄 · 13 **A112**(체감 — 5초가 맞는지 · 문장이 애매한 것(제보로) · grade 순서 체감 · explanation 읽을 시간 · 두 버튼 폰) · 05 · 06 · README R · `ai-out/R085.txt` 0절 첫 줄 "메뉴 1 [1] → 적재 줄(노래 n · OX m) → A106~A112" · 실 DB OX 수 = V042 verified 수).
■ DB 쓰기: quizweb 없음 · test/dev 자유. ■ 하지 말 것: ox 파일 쓰기(V042 것) · 노래 · topics · questions · hint · `.env` · 태그 · force push · 플레이 트리 커밋 · 실 DB 적재 · 새 마이그레이션.
■ 확인할 것 (원칙 7): R084 마지막 번호 · 07 맨 위 · ox 400 · status(candidate 또는 V042 verified 몇) · grade 분포 165/158/77 · pairId 44 쌍 · minigame-load song 꼴 · choice 코드 꼴 · 열린 판 0 · 남는 메모리.
■ 커밋: 1~3 + E · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ ★ 이어서: 끝나면 멈춘다(main-next2.md 없음). 터미널 마지막 줄 "R085 끝 — 다음 브리핑 대기 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.
