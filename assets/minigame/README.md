# assets/minigame — 미니게임 그림 (G008 · docs/18 0장)

퀴즈류 미니게임(얼마게요 · 빅맥지수 · 사진 이름 맞히기 · 얼마나 될까 · 어느 쪽? · 이 사진 몇 년도?)의 **그림 파일**을 두는 자리다. 폴더 하나 = 게임 하나.

```
assets/minigame/
  README.md            ← 이 파일 (git 에 있다)
  price/               ← price-0001.jpg …   (얼마게요 — 공식몰·제조사 상품 사진)
  worldprice/          ← bigmac.jpg · iphone.jpg · netflix.jpg  (품목 그림)
  photo/               ← photo-0001.jpg …   (위키미디어 공용 자유 라이선스만)
  estimate/            ← estimate-0001.jpg …
  which/               ← which-0001-a.jpg · which-0001-b.jpg …
  photoyear/           ← photoyear-0001.jpg …   (이 사진 몇 년도? — 위키미디어 공용 자유 라이선스만 · 데이터 100 verified · ★ 게임 코드 없음 — 적재는 MAIN R068 뒤 · G021)
```

## 규칙

- **파일 이름 = 항목 id**(`<game>-NNNN.<ext>` · which 는 `-a` · `-b`). 정답 글자를 파일 이름에 넣지 않는다.
- ★ 그림 파일은 **git 에 넣지 않는다** (`.gitignore` 의 `assets/minigame/*/`). 저장소가 public 이고 상품 사진·남의 사진이라서다(찬종 2026-10-16 "상업 이용 안 할거니까 그냥 다운 및 표시는 해도 됨").
  정본은 G009 적재 뒤 **DB**(bytea · `npm run db:backup` 에 함께 들어간다). 그때까지는 이 PC 파일뿐이라 GEN 은 라운드 끝에 `backups/minigame-<날짜>.zip` 으로 묶는다.
- 크기: 긴 변 **1024px 이하 · 500KB 이하** — `node scripts/g008-img.mjs "<url>" <game> <id>` 가 받으면서 줄인다(sharp · 메타데이터 제거).
- 라이선스·저작자는 항목의 `image` 칸(`license` · `attribution` · `sourceUrl`)에 있다. 사진 게임은 위키미디어 공용(CC0 · CC BY · CC BY-SA · Public domain)만.
- 워터마크 · 실루엣 · 생존 사인(私人)의 얼굴 사진은 쓰지 않는다. 사진 게임은 정답 글자(간판 · 이름표 · 로고 글자 · 캡션)가 보이면 안 되고, 얼마게요는 가격 숫자가 보이면 안 된다.

## 검사 · 다시 묶기

```bash
node scripts/g008-check.mjs            # docs/18 칸 · 파일 존재 · 크기 · 라이선스 · 게임 규칙
node scripts/g008-build.mjs            # tmp/g008/out 의 중간 파일 → data/minigame/<game>/items.json
```

- 잃어버리면: `backups/minigame-<날짜>.zip` 을 이 폴더에 풀거나, 항목의 `image.sourceUrl` 로 `g008-img.mjs` 를 다시 돌린다(같은 크기 규칙).
