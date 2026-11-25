[MAIN R121 — ★ **R119 · R120 끝 점검 마저(밤샘)** : 봇 mgquiz 다시 + 남은 15 + full + ui-check 전부 · 코드 고침은 걸린 것만 · 어림 3~5시간(천천히 · 하나씩) · 하위 에이전트 없이]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16 · 앞 지시서 `main-R120.md` · 앞 보고 `ai-out/R120.txt` 4절이 순서)

TASK: R120 은 봇 30 중 15 에서 PC 메모리 부족으로 또 끊겼다(시작 빈 메모리 5.5GB → 끊길 때 3.3GB · Claude Code 가 백그라운드 실행을 끊음). 오늘 밤은 찬종이 자는 동안 이 창이 가장 무거운 일이다(영상 창은 쉼 · GEN G113 은 DB 일만).
실행 모델: Opus 5.5(`claude --model claude-opus-5-5`).

★ 실 서버(3000) · 실 DB(quizweb) · 터널은 건드리지 않는다. 검사는 검사 서버(quizweb_test · 3200 등)로.

0. 메모리를 아끼는 돌리기(이번 라운드의 핵심):
   · **하나씩 · 앞에서(foreground) 돌린다** — 백그라운드 실행 · 여러 봇 한꺼번에 · 봇과 ui-check 겹치기 금지. 명령 하나에 시간 한도(10분 안)를 주고, 긴 것은 나눠 돌린다.
   · 봇 하나가 끝날 때마다 검사 서버 · 남은 node · 크롬(headless)이 정리됐는지 보고 빈 메모리를 한 줄 적는다. 3GB 아래면 정리부터(남은 검사 프로세스 끄기) — 그래도 모자라면 거기서 멈추고 보고(억지로 이어 가지 않는다).
1. 순서(R120 4절): `MGQ=photoyear` 로 mgquiz 다시(R120 의 bot.mjs 고침 확인) → 남은 15(emojiinline near rate levelmix grant report signup team flood attack gongbang gongbangoff solo solooff + 끊긴 mgduo) → full 혼자 → `npm run verify` 의 smoke 뒤 ui-check 하나씩.
2. ui-check 에서 GONGBANG 함정(검사 서버가 개발 트리 .env 의 GONGBANG · SOLO · BELT 를 물려받음)이 걸리면 R120 지시대로 server/src/config.ts 의 "실 값을 안 물려받는 목록"에 세 키를 넣고, 검사마다 자기 값을 직접 준다.
3. 걸린 것은 원인을 찾아 고친다. 실 서버에 영향이 있는 고침이면 보고 맨 위에 "실 반영 필요" 한 줄(설계가 3-1-1 로 올린다).
4. 보고 `ai-out/R121.txt`(짧게): 봇 표(이름 · 통과/실패 · 까닭) · ui-check 단계별 · 빈 메모리 기록(시작 · 가장 낮을 때) · 고친 것 · 커밋. 다 못 돌렸으면 다음에 돌릴 순서.
