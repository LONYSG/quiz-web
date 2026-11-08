[GEN G043 — ★ 작은 적용 — **V041 노래 fixes 14 · V042 OX fixes 16 · us-state 변형 1** 을 파일에 기계 적용 → 적용한 항목 `status: verified`(18 §0 — 설계가 "VERIFY 제안을 기계 적용한 항목은 G 라운드가 verified 로" 줄을 더함 · §9 와 같은 규칙) → 다음 메뉴 1 때 노래 278 → **292** · OX 384 → **400** 자동 · 파일만 · DB 쓰기 없음 · DG-081 · C109 · 1시간 · 끝나면 gen-next.md(G044)로]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V041(6aabf438)이 노래 293 을 대조 — verified 278 · fix 14(다른 곡 1 「Love」 브아걸 → trackId 365430197 · 리믹스/믹스 판 6 · 연도 어긋남(그 남자 그 여자 2004 → 2006 · Time to Say Goodbye 1995 → 1996 …) · 변형 제안) · rejected 1 · us-state verified(fixes 1 — 매사추세츠 중복 변형). V042(5f0ebe60)가 OX 400 전수 — verified 384 · fix 16(해설 2 · 문장 2 · 거의 맞는 거짓 2(1972 → 2002 · 1950 → 2010) · **너무 쉬운 함정 10**(스칸디나비아 커피 → 브라질 · 6,600년 → 6억 6천만 년 · 맥박 700 → 200 · KTX 3,000km → 600 · 에펠탑 3,000m → 1,000 · 바흐 이탈리아 → 독일 · 쇼팽 트럼펫 → 첼로 · 카르멘 40막 → 10막 · 베이브 루스 1990년대 → 1927년 홈런 25개 · 저커버그 → 발머)) · rejected 0. **10시간 뒤 친구들 테스트** — 이 라운드가 끝나야 메뉴 1 이 나머지를 넣는다.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 13 **C109** · **CV-168 줄 끝** · **CV-170 줄 끝** · README G 표 · 05 Track D · 06 · 07 **DG-081**. DB 없음(백업 불필요). 하위 에이전트 0 · 웹 ≤ 6(새 trackId lookup · OX 제안 숫자 확인 2~3).
■ ★★ 동시 라운드 — **MAIN R086**(리허설 · song/ox/topics 파일 **읽기** — G043 이 쓰는 순간과 겹치면 MAIN 이 다시 읽음 · 파일 쓰기는 한 번에) · **VERIFY V043**(`topics/*.json` 의 **verify 칸**(round V043 · 변형 제안)만 — G043 은 `topics/us-state.json` 의 items 하나(변형 중복)만 고친다 → **us-state 는 V043 이 안 본다**(브리프에 적음) → 겹침 없음). 문서 분담: G043 = 07 DG-081 · 13 C109 · CV-168 · CV-170 · README G / R086 = 07 D-343 · 13 A113 / V043 = 13 C111 · CV-172~.

■ 먼저 읽기: `ai-out/V041.txt`(0절 ①③④ · 2절 fix 14 전부 · 3절 제안 · CV-168 · CV-169) · `audit/v041-song.json`(항목별 proposal — 새 trackId · year · variants add/remove) · `ai-out/V042.txt`(0절 ④⑤ · 3절 fix 16 전부) · `audit/v042-ox.json` · docs/18 §0(★ 설계가 더한 "verified 전환" 줄) · §10 · §11 · `scripts/song-check.mjs` · `ox-check.mjs` · `scripts/g039-topics-fix.mjs`(기계 적용 꼴) · `data/minigame/topics/us-state.json`(verify.fixes 1).

■ 할 일 (순서대로)
A. **준비**(커밋 없음): 13 마지막(C108 → **C109**) · 07 맨 위(DG-080 또는 R085 D-342) · README G 마지막 G042 · song verified 278 · candidate 14 · rejected 1 · ox verified 384 · candidate 16 · us-state fixes 1.
B. **노래 14**: `scripts/g043-song-fix.mjs`(dry-run → --apply · 항목별 proposal 적용 — trackId 교체는 `lookup?id=` 한 번 받아 itunes{} 전부 갱신(trackName · collectionName · previewUrl · artworkUrl100 · releaseDate · fetchedAt) · year 고침 · variants add/remove · 다른 곡(Love)은 title 그대로 trackId 만 · rejected 1 그대로) · 적용한 14 → `status: "verified"` · `verify.appliedRound: "G043"` · song-check 막힘 0 · 새 previewUrl HEAD 14 = 200 · V041 CV-168 의 "영문 변형 아무도 안 치는 것 빼기" 목록도 적용(verified 항목 variants 만 — status 그대로).
C. **OX 16**: proposal 그대로(statement · explanation · 숫자) · 제안이 사실인지 숫자 2~3 웹(맥박 200 · KTX 600 · 에펠탑 1,000 — 2배/자릿수 규칙 §11 만족) · ox-check 막힘 0(길이 · 부정문 · 겹침 --db) · 16 → verified · appliedRound.
D. **us-state** 변형 중복 1 제거(version +1 · verified 그대로) · topics-check 막힘 0.
E. **문서**: 07 DG-081 · 13 C109 · CV-168 줄 끝(적용 14 · 변형 빼기 n) · CV-170 줄 끝(적용 16) · 05 · 06 · README G · `ai-out/G043.txt`(0 ★: ① 노래 14 표(id · 무엇 · 전 → 후) ② OX 16 표 ③ **다음 메뉴 1 때 적재되는 수 — 노래 292 · OX 400** ④ HEAD 결과 · 1 원칙 7 · 2 결정 필요 없음이면 "없음"). 커밋 1~2.
■ 산출물: `data/minigame/song/items.json` · `ox/items.json` · `topics/us-state.json` · `scripts/g043-song-fix.mjs` · `audit/g043-diff.json` · `ai-out/G043.txt` · 07 · 13 · 05 · 06 · README G.
■ DB 쓰기: **없음**.
■ 하지 말 것: V041 · V042 가 ok 로 둔 항목 손대기 · 새 곡 · 새 문장 · topics 다른 파일 · questions · 힌트 · 코드 · 13 A · C110~ · CV-172~ · README R · V.
■ 확인할 것 (원칙 7): fix 수(14 · 16 · 1) · proposal 꼴 · rejected 1 id · 13 마지막 · 07 맨 위 · README G 마지막 · MAIN R086 · VERIFY V043 돎.
■ 커밋: 1~2 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 **`ai-out/briefs/gen-next.md`(G044 문항 생성 500)를 읽고 같은 창에서 바로 시작**(없거나 첫 줄 "보류" 면 멈춤). 그 전 터미널 마지막 줄 "G043 끝 — gen-next(G044) 이어서 · /clear 아직".
■ 답변: 한국어 · 터미널 5줄 이내.
