# assets/emoji — 특별 이모티콘 원본 (R048 · D-230)

특별 이모티콘(테마 · 뽑기)의 **원본 그림 파일**을 두는 자리다. 폴더 하나 = 테마 하나.

```
assets/emoji/
  README.md            ← 이 파일 (git 에 있다)
  chiikawa/            ← 테마 key = 폴더 이름. 원본 GIF 27개 (git 에는 없다 — 아래)
    Chiikawa_1.gif …
  <다음 테마 key>/
```

## 규칙

- **폴더 이름 = 테마 key** (영문 소문자 · 숫자 · `-`). DB `emoji_themes.key` 와 같다.
- 파일은 GIF · PNG · WebP · APNG. 파일명은 `<캐릭터>_<번호>.확장자` 를 권장한다 — 가져오기 스크립트가 캐릭터 이름을 한글로 바꿔 `name_ko` 를 만든다.
- ★ 그림 파일은 **git 에 넣지 않는다** (`.gitignore` 의 `assets/emoji/*/`). 저장소가 public 이고 캐릭터 저작물이라서다.
  **정본은 DB** (`emojis.image` — 백업 `npm run db:backup` 에 함께 들어간다). 찬종이 git 에도 넣기로 하면 `.gitignore` 의 그 한 줄만 뺀다.
- 원본은 크기 제한이 없다. 가져올 때 **256×256 이하 · 1MB 이하**로 줄여 DB 에 넣는다(0013 의 CHECK). 변환본은 파일로 남기지 않는다.

## 가져오기 (DB 에 넣기)

```bash
npm run db:backup
node scripts/emoji-import.mjs --theme chiikawa --name 치이카와 --price 20
```

- 테마가 없으면 만들고(`emoji_themes`), 있으면 이름·가격을 그대로 둔다(바꾸려면 SQL — docs/DB-ADMIN.md).
- 같은 테마 안 **같은 파일명은 건너뛴다**(`emojis.source_name`) — 파일을 더 넣고 다시 돌리면 새 것만 들어간다.
- 결과: 파일마다 원본 크기 → 변환 크기 · 가로세로 를 표로 찍는다.
- 특별 이모티콘은 `kind='custom'` · `category='special'` · `theme_id` — **가진 사람만** 목록에 보이고 보낼 수 있다(뽑기 — R049).
