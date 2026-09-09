# 문제 데이터 파이프라인 (Track D)

> **게임 서버와 완전히 분리된 별도 트랙이다.** Phase 1~7과 섞지 않는다.
> 유일한 접점은 DB 스키마이고, 관계는 단방향이다 —
> 파이프라인은 `questions` / `question_answers` 에 **쓰기만** 하고, 게임 서버는 **읽기만** 한다.

---

## 1. 왜 파일 기반인가

원래 설계는 GitHub Actions가 DB에 직접 적재하는 것이었다.
그런데 **DB가 건우 PC의 로컬 PostgreSQL로 바뀌면서 외부에서 접근할 수 없게 되었다.**

그래서 이렇게 바꿨다.

```
  GitHub Actions (클라우드)                     건우 PC (로컬)
  ────────────────────────                     ──────────────
  1. 수집   OpenTDB → 원본 JSON
  2. 필터   규칙 기반 사전 제거
  3. 가공   Gemini: 판정 + 번역 + 복수 정답
  4. 검증   Gemini 역검증 + 규칙 검사
  5. 커밋   결과 JSON을 저장소에 push
                     │
                     │  git pull
                     ▼
                                          6. 검수  JSON 직접 편집으로 승인/반려
                                          7. 적재  npm run pipeline:load → DB
```

### 이 변경의 부수 이점

이것은 손해를 감수한 우회가 아니라 **오히려 나아진 부분이 있다.**

1. **가공 결과가 git에 남아 diff로 검토할 수 있다.**
   Gemini 프롬프트를 고쳤을 때 결과가 어떻게 달라졌는지 눈으로 볼 수 있다.
   DB 직접 적재였다면 이 비교가 불가능했다
2. **CC BY-SA share-alike 의무가 자연스럽게 충족된다.**
   파생 데이터가 공개 저장소에 그대로 있으므로 별도 배포 절차가 필요 없다
3. **되돌리기 쉽다.** 잘못 가공된 배치를 git revert로 되돌릴 수 있다
4. **API 키가 로컬에 필요 없다.** GEMINI_API_KEY는 GitHub Secrets에만 둔다

---

## 2. 디렉터리 구조

```
data/
├─ seed/
│   └─ questions.manual.json        직접 작성한 개발·테스트용 시드 (53문제)
│
└─ pipeline/
    ├─ raw/                          ★ 소스 원본
    │   └─ opentdb/
    │       └─ 2026-09-07.jsonl      수확 시점별 파일. append-only
    │
    ├─ processed/                    Gemini 가공 + 역검증 결과
    │   └─ opentdb/
    │       └─ 2026-09-07-batch01.json
    │
    ├─ approved/                     ★ 사람이 검수해 승인한 것. 적재 대상
    │   └─ opentdb/
    │       └─ 2026-09-07-batch01.json
    │
    └─ rejected/                     반려. 통계와 프롬프트 개선에 쓴다
        └─ opentdb/
            └─ 2026-09-07-batch01.json
```

### 원본(raw)을 저장소에 넣을 것인가

**넣는다.** OpenTDB 전량이 4,500건이고 JSONL로 약 1.5MB 수준이라 부담이 없다.
원본을 버리면 가공 규칙이 바뀔 때마다 소스를 다시 긁어야 하는데,
OpenTDB는 레이트 리밋 때문에 전량 수확에 약 12분이 걸린다.

**단 위키데이터처럼 원본이 수십 MB를 넘는 소스가 생기면 그때 재검토한다.**
그 경우 원본은 로컬에만 두고 `raw/` 를 `.gitignore` 에 넣는다.

---

## 3. 파일 형식

### raw (JSONL, 한 줄에 하나)

모든 소스가 이 형식으로 변환된다. **어댑터가 지켜야 할 유일한 계약이다.**

```json
{
  "sourceId": "opentdb",
  "sourceRef": "otdb-000123",
  "lang": "en",
  "question": "...",
  "correct": "...",
  "incorrect": ["...", "...", "..."],
  "category": "Geography",
  "difficulty": "medium",
  "license": "CC-BY-SA-4.0",
  "raw": { }
}
```

`incorrect` 가 없는 소스(원래 주관식인 소스)도 그대로 들어올 수 있다.
`lang` 이 `ko` 면 번역 단계를 건너뛰고 판정과 복수 정답 생성만 한다.

**새 소스를 붙이는 작업 = 이 형식으로 변환하는 함수 하나를 추가하는 것이다.**
이후 단계는 소스를 전혀 모른다.

### processed / approved / rejected (JSON)

```json
{
  "_meta": {
    "sourceId": "opentdb",
    "batch": "2026-09-07-batch01",
    "model": "gemini-2.5-flash",
    "backcheckModel": "gemini-2.5-flash-lite",
    "generatedAt": "2026-09-07T00:00:00Z",
    "counts": { "input": 200, "filtered": 36, "accepted": 51, "rejected": 113 }
  },
  "items": [
    {
      "sourceRef": "otdb-000123",
      "verdict": "accept",
      "question_ko": "...",
      "displayAnswer": "...",
      "answers": ["...", "..."],
      "hintAnswer": "...",
      "category": "geography",
      "difficulty": "easy",
      "explanation": "...",
      "answerLang": "ko",
      "ai": { "convertible": true, "uniqueAnswer": true, "krAccessible": 4,
              "koreanTerm": true, "confidence": 0.9 },
      "backcheck": { "answer": "...", "result": "pass", "confidence": 0.95 },
      "rules": { "answerInQuestion": false, "duplicate": false },
      "review": { "status": "pending", "note": null }
    }
  ]
}
```

**검수는 `review.status` 를 `pending` → `approved` / `rejected` 로 바꾸고
파일을 `approved/` 또는 `rejected/` 로 옮기는 것이다.**
필요하면 `question_ko` 나 `answers` 를 직접 고친다.

CSV 왕복보다 JSON 직접 편집을 택한 이유: 파일 기반이라 어차피 JSON을 다루게 되었고,
CSV는 왕복 과정에서 인코딩·따옴표 사고가 나기 쉽다. **git diff로 무엇을 고쳤는지 볼 수 있는 것**도 크다.

---

## 4. 중복 적재 방지

`(sourceId, sourceRef)` 가 키다. 세 겹으로 막는다.

1. **수집 단계** — `raw/` 에 이미 있는 `sourceRef` 는 다시 받지 않는다
2. **적재 스크립트** — 적재 전에 DB를 조회해 이미 있는 것은 건너뛴다
3. **DB 제약** — `questions` 에 부분 UNIQUE `(source_id, source_ref)`

세 번째가 최종 방어선이다. 앞의 둘이 실패해도 DB가 막는다.

---

## 5. 가공·검증 규칙

프롬프트 전문과 근거는 `ai-out/R002.txt` 2-3장에 있다. 요약하면 이렇다.

### 판정 (하나라도 실패하면 reject)

| 항목 | 내용 |
|------|------|
| `convertible` | 보기 없이 문장이 성립하는가 |
| **`uniqueAnswer`** | **★ 가장 중요.** 보기를 없앴을 때 정답이 유일하게 결정되는가 |
| `krAccessible` | 한국의 일반 성인이 "알 수도 있겠다" 고 느끼는 수준인가 (1~5, 2 이하 탈락) |
| `koreanTerm` | 대응하는 한국어 표기가 존재하는가 (외래어 표기 정착도 포함) |

`uniqueAnswer` 가 가장 중요한 이유: 게임이 **정확 문자열 일치로만** 판정하므로
("국기가 빨강과 흰색인 나라는?" 처럼) 답이 여럿인 문제는
정답을 아는 사람이 계속 오답 처리되어 게임이 죽는다.
날짜·범위값·근사값·서술형 정답도 여기서 걸러야 한다.

### 생성

`question_ko` / `displayAnswer` / **`answers` (복수 정답 배열)** / `hintAnswer` /
`category` / `difficulty` / `explanation`

> **`answers` 가 이 파이프라인의 가장 중요한 산출물이다.**
> 게임은 fuzzy matching이 금지되어 있어 표기 변형을 확보하지 못하면
> 정답을 아는 사람이 억울하게 지는 일이 반복된다.
> 인명 음차(`반 고흐` / `고흐` / `반고흐` / `van gogh`), 원문 영어 표기,
> 축약형, 숫자의 한글 표기를 넣는다.
> **띄어쓰기와 영문 대소문자 차이는 엔진이 알아서 무시하므로 그 목적으로 변형을 넣지 않는다.**

### 검증

| 검사 | 비용 | 처리 |
|------|------|------|
| **역검증** — 번역된 질문만 주고 정답을 맞혀보게 한다 | LLM 1회 | 일치 → pass / `ambiguous` 또는 대안 2개 이상 → **즉시 reject** / 불일치 + 낮은 confidence → 검수 대기 |
| **질문에 정답이 포함되었는가** | 무료 | 포함되면 reject. ★ 역검증은 이 경우를 통과시키므로 반드시 별도 검사가 필요하다 |
| `displayAnswer` 가 `answers` 에 있는가 | 무료 | 없으면 reject (데이터 정합성) |
| 기존 승인 문제와 중복인가 | 무료 | 정규화된 질문·정답 비교 |

**역검증에 다른 모델을 쓴다.** 같은 모델을 두 번 쓰면 같은 방향으로 틀리는 상관관계가 생긴다.
1차 `gemini-2.5-flash`, 역검증 `gemini-2.5-flash-lite`.

**초기에는 자동 통과분에서 무작위 30건을 사람이 확인한다.**
오류율이 5% 미만으로 안정되면 자동 승인 임계값을 낮춘다.
**자동으로 서비스 DB에 넣지 않는다.**

---

## 6. GitHub Actions 배치

**OpenTDB는 유한 코퍼스이므로 "매일 랜덤 수집" 은 의미가 없다. 중복만 받는다.**
그래서 수집과 가공을 분리한다.

| 잡 | 주기 | 내용 |
|----|------|------|
| `harvest` | **수동 실행** + 월 1회 | 세션 토큰으로 전량 훑어 `raw/` 에 추가. 이미 있는 `sourceRef` 는 건너뛴다. 요청 간격 7초(실측: 문서상 5초로는 레이트 리밋에 걸린다). 전량 약 12분 |
| `process` | 매일 1회 | `raw/` 의 미가공 건을 N개 꺼내 필터 → 가공 → 역검증 → `processed/` 에 커밋. **이 잡이 배치의 본체다** |

- 비밀값은 GitHub Secrets로만 (`GEMINI_API_KEY`). **저장소가 Public이므로 특히 주의한다**
- 일일 처리 상한을 두고 429가 나오면 그날 잡을 중단한다

---

## 7. 라이선스 (Q-41)

OpenTDB는 CC BY-SA 4.0이다. 파생물인 한국어 문제 데이터도 같은 라이선스로 배포해야 한다.

- 저장소 루트의 `DATA_LICENSE.md` 에 명시
- `questions.source_id` / `license` 로 **문제별로** 추적한다.
  이래야 다른 출처(위키데이터 CC0 등)의 문제까지 share-alike가 번지지 않는다
- 게임 화면 하단 또는 정보 화면에 출처를 표기한다
- **코드는 별도 라이선스(MIT)를 유지한다.** ShareAlike는 각색물에 적용되며
  데이터를 사용하는 소프트웨어는 각색물이 아니라고 보는 것이 일반적 해석이다
  (★ 법률 자문이 아니다. 이 해석은 추정이다)

---

## 8. 현재 상태

★★ **R012: 생성 방식과 분류 체계를 확정하는 단계.** 대량 생성은 다음 라운드다.

```
  [R010까지]  수확 → 규칙 필터 → 1차 가공 → 역검증 → 규칙 검사 → 검수 → 적재
  [R011부터]  ★ 생성 ────────────────────→ 역검증 → 규칙 검사 → 중복 판정 → 검수 → 적재
  [R012부터]  ★ 생성(Gemini 또는 Claude Code) → ★ **상대 모델이 역검증** →
              규칙 검사 → ★ LLM 중복 판정 → 선별(Q-69) → 검수 → 적재 → ★ DB 사후 정리
```

★ **자기 생성분을 자기가 검증하지 않는다** (D-043). 그것은 검증이 아니다.

| 파일 | 상태 |
|------|------|
| `pipeline/src/categories.ts` | ★ 대 7 / 중 63 / 소 **297**. ★ 소분류 설계 원칙 5가지 (D-045) |
| `pipeline/src/gen-prompt.ts` | ★ 프롬프트 **`g3`**. 접근성·난이도·**알 가치** 세 축 (D-044) |
| `pipeline/src/select.ts` | ★ **출제 선별 기준** (Q-69). 난이도로 걸러내지 않는다 |
| `pipeline/src/generate.ts` | 생성 오케스트레이션 + 단계별 게이트 + ★ `explicitSlots` |
| `pipeline/src/dedupe.ts` | 후보 추리기. ★ **유사도를 판정에서 제거했다** (D-047) |
| `pipeline/src/dedupe-llm.ts` | ★ **LLM 중복 판정.** 건우 판정과 12/12 일치 |
| `pipeline/src/rules.ts` | 규칙 검사 3종 + `sanitizeVariants` + ★ 약어 예외 (`H.O.T.`) |
| `pipeline/src/budget.ts` | 예산 게이트 + 구간 기록 + ★ `canResumeNow` (Q-62 를 게이트에도 적용) |
| `pipeline/src/config.ts` | 모델·한도. ★ `dailyItems` 를 환경변수로 조정 가능 |
| `pipeline/src/gemini.ts` | 429/503, 모델 체인, 키 스크럽, 낭비 요청 집계 |
| `migrations/0003_categories_tree.sql` | ★ **생성된 파일.** 손으로 고치지 않는다 (D-046) |
| `scripts/pipeline-bulk.mjs` | ★ **주 실행 명령.** 중단·재개 가능 (D-049) |
| `scripts/pipeline-compare-gen.mjs` | ★ 비교 실험용. 슬롯을 파일로 고정한다 |
| `scripts/pipeline-claude-verify.mjs` | ★ Claude Code 생성분 → Gemini 역검증 |
| `scripts/pipeline-gemini-verify.mjs` | ★ Gemini 생성분 → Claude Code 역검증 적용 |
| `scripts/pipeline-compare-report.mjs` | ★ 비교 보고서 (소분류별 나란히) |
| `scripts/pipeline-dedupe.mjs` | ★ LLM 중복 판정 (`--verify-r011` 로 정확도 측정) |
| `scripts/pipeline-dedupe-db.mjs` | ★ 적재된 문제의 사후 중복 정리 (D-048) |
| `scripts/pipeline-recheck-rules.mjs` | ★ 규칙 검사 재적용 (API 0회) |
| `scripts/pipeline-remap-subs.mjs` | 소분류 개정 후 재배정 |
| `scripts/gen-migration-0003.mjs` | ★ 트리에서 마이그레이션 SQL 생성 |
| `scripts/pipeline-score-worth.mjs` | 기존 문제에 알 가치 부여 (Gemini). ★ 429 재개 포함 |
| `scripts/pipeline-apply-worth.mjs` | ★ Claude Code 가 매긴 알 가치 반영 |
| `.github/workflows/pipeline-generate.yml` | ★ **정기 실행 폐기** (Q-71). 수동만 |
| `.github/workflows/pipeline-harvest.yml` | ★ 비활성 (`confirm` 가드) |
| `.github/workflows/pipeline-process.yml` | ★ 정기 실행 해제. 수동만 |

★ 실측 수치는 [docs/05-STATUS.md](../docs/05-STATUS.md) Track D 절,
판단 근거는 [docs/07-DECISIONS.md](../docs/07-DECISIONS.md) D-033~D-049,
남은 판단은 미결 항목 **Q-63 / Q-66 / Q-67 / Q-72 / Q-73 / Q-74** 를 본다.

### ★ 프롬프트 버전

| 버전 | 무엇이 바뀌었는가 |
|------|-----------------|
| `p1` → `p2` (R010) | 역검증 프롬프트에 "alternatives 에는 서로 다른 대상만" 을 추가. p1에서 정상 문제 6건이 전부 오탈락했다 |
| `g1` (R011) | ★ 생성 프롬프트 신설. 접근성·난이도 분리 / 시간 의존 금지 / 카테고리 입력 |
| `g1` → `g2` (R011) | ★ 탈락 10건 중 5건이 한 원인이었다 — 모델이 **표기 변형을 질문에 써 버렸다**. 실패 예시 4개와 자기 점검 목록을 넣었다 → 재실측 0건 |
| `g2` → `g3` (R012) | ★★ **알 가치(worthKnowing) 축 추가.** 건우가 걸러야 할 것을 "어려운 문제" 가 아니라 "알 가치 없는 문제" 로 정의했다. ★ "이것은 어려운 문제를 만들지 말라는 뜻이 아니다" 를 명시했다 — 잘못 읽으면 더 쉬워진다. ★ 결과: 난이도 평균 1.46 → 2.05/2.38, 알 가치 1~2 가 0건 |
