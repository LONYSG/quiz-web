[MAIN R120 — ★ **R119 끝 점검 마저**(봇 남은 30 · full 다시 · npm run verify 나머지) + 터널 본보기에 www 한 줄 : 코드 고침은 점검에서 걸린 것만 · 어림 1시간 · 하위 에이전트 없이]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16 · 앞 지시서 `main-R119.md` · 앞 보고 `ai-out/R119.txt`)

TASK: R119 는 코드 · 확인이 끝났지만 끝 점검이 PC 메모리 부족으로 멈췄다(봇 80 중 50 · full 1 실패 "09 입장 대기 시간 초과" · 남은 30 = mgquiz ~ solooff · verify 의 smoke 뒤 단계 못 돌림). 지금은 다른 창이 다 쉬어 메모리가 넉넉하다.
실행 모델: Opus 5.5(`claude --model claude-opus-5-5`).

★ 실 서버는 이미 R119 로 떠 있다(2026-11-25 15:56 · play/20261125-1556 · 두 .env 에 SITE_ONE=1 · quizdojang.com 200 · beta → 메인 301 · www 200). **실 서버(3000) · 실 DB(quizweb) · 터널은 건드리지 않는다.** 검사는 늘 하던 검사 서버(quizweb_test · 3400 등)로.

1. 봇: R119 가 못 돌린 30(mgquiz ~ solooff)을 돌린다 · full 을 혼자(다른 검사와 겹치지 않게) 다시 돌린다.
2. `npm run verify` 의 smoke 뒤 단계(ui-check 전부)를 돌린다. R119 3절의 함정 — 검사 서버가 실 .env 의 GONGBANG 을 물려받아 옛 로비 흐름이 멈춘다 — 이 또 걸리면, 검사 서버가 실 값을 안 물려받는 목록(server/src/config.ts 31줄 근처)에 GONGBANG · SOLO · BELT 를 넣는 것으로 고친다(검사마다 자기 값을 직접 준다).
3. 걸린 것이 있으면 원인을 찾아 고친다 · 실 서버에 영향이 있는 고침이면 보고 맨 위에 "실 반영 필요" 한 줄(설계가 3-1-1 로 올린다).
4. `ops/cloudflared.example.yml` 에 www 줄(beta 줄과 같은 꼴 · httpHostHeader: www.quizdojang.com) — 설계가 오늘 실 설정(~/.cloudflared/config.yml)에 넣고 DNS 를 붙였다. 본보기만 맞춘다.
5. 보고 `ai-out/R120.txt`(짧게): 봇 숫자(돌린 수 · 통과 · 실패와 까닭) · verify 단계별 통과 · 고친 것 · 커밋.
