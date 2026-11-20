# 22. 출처 · 라이선스 표기 (R109 · D-369)

화면: ⓘ 안내(PC = ⚙ → 안내 · 모바일 = ☰ → 안내) 맨 아래 작은 글 한 줄 **"출처 · 라이선스"** → 같은 자리에서 열린다.
**문구 정본 = `shared/src/credits.ts`** (이 표는 그 내용을 옮긴 것 — 바꿀 때는 코드 쪽을 먼저).

찬종 2026-11-19: "저작권 표기 같은 건 지인용/공개용 둘 다 반영해." · "캐치마인드 낱말 씨앗은 빼라고. 문제 데이터 라이선스도 없잖아. 전부 ai 창작인데"
→ 넣는 것 = **표기 의무가 있는 것만**. 문제 데이터 · 캐치마인드 낱말 · CC0 효과음처럼 의무가 없는 것은 넣지 않는다.

| 무엇 | 표기 | 자리 | 확인한 원문(2026-11-20) |
|---|---|---|---|
| 이모티콘 그림 | Twemoji © Twitter, Inc 및 기여자 · CC BY 4.0 | 둘 다 | jdecked/twemoji README "Graphics licensed under CC-BY 4.0" · "an 'About' section or footer on a website" 로 표기 받음 |
| 이모티콘 한국어 이름 | emojibase · MIT | 둘 다 | `node_modules/emojibase(-data)/package.json` "license": "MIT" |
| 글꼴 | Pretendard · SIL OFL 1.1 | 둘 다 | `node_modules/pretendard/package.json` "license": "OFL-1.1" |
| 사진 | 사진 게임의 사진은 위키미디어 공용의 자유 이용 사진이며, 사진마다 정답 화면에 찍은 사람과 라이선스를 적습니다. | 둘 다 | 그림마다 `minigame_images.attribution` · `license` |
| 노래 미리듣기 · 앨범 표지 | provided courtesy of iTunes (Apple) | 베타만 | performance-partners.apple.com/search-api — 아래 ★ |
| 치이카와 이모티콘 | © nagano / chiikawa committee | 베타만 | 공식 지침 문서는 못 열었다(chiikawa-info.jp 403) — 정식 상품 표기를 따름 · **확인 필요** |

## 정답 화면의 그림 출처 줄

- 그림이 나오는 미니게임(사진 이름 · 사진 연도 · 얼마나 · 어느 쪽? · 얼마게요) 정답 공개에 `출처: <저작자> (<라이선스>)` — 그림이 둘이면 ` · ` 로 잇는다.
- R109 전에는 저작자만 나왔고(라이선스 이름 없음) **어느 쪽?** 에는 줄이 아예 없었다 → 서버(`loadQuizData`)가 그림마다 "저작자 (라이선스)"로 만들어 보낸다. "cropped" 같은 고침은 저작자 칸에 이미 들어 있다.
- 상품 그림(`product-page`)은 라이선스 이름을 붙이지 않는다(공개 라이선스가 아니다 · 베타 방에서만 나온다).

## ★ Apple 미리듣기 조건 (찬종-확인 10절)

Apple Search API 안내(performance-partners.apple.com/search-api)가 적은 조건:
- 미리듣기에 "provided courtesy of iTunes" 표기
- "Download on iTunes" 배지(그 곡 구매 쪽으로 가는 링크)를 가까이
- 홍보용으로만 — "only to promote store content and not for entertainment purposes"

노래 맞히기는 오락 용도라 셋째 조건과 맞지 않는다. 그래서 노래는 베타(지인) 자리에만 두었고(R109), 표기는 "출처 · 라이선스" 쪽에 한 줄로 넣었다. 배지 · 곡별 링크는 넣지 않았다(찬종 2026-11-11 "Apple Music 표기 완전히 빼" — 곡 화면에는 다시 넣지 않음). 찬종 결정 대기.
