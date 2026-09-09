# 실행과 운영

> 이 프로젝트는 클라우드에 배포하지 않는다. **건우 PC를 서버로 쓰고 필요할 때만 켠다.**
> 구조와 이유는 [02-ARCHITECTURE.md](02-ARCHITECTURE.md) 참조.

---

## 1. 처음 한 번만

```bash
# 1) 의존성
npm install

# 2) 환경 변수
#    .env.example 을 .env 로 복사하고 값을 채운다.
#    ★ .env 는 절대 커밋하지 않는다. .gitignore로 차단되어 있다.
cp .env.example .env

# 3) cloudflared 설치 (외부 공개용)
winget install --id Cloudflare.cloudflared

# 4) DB 기동 + 스키마 + 시드
npm run db:up
npm run db:migrate
npm run db:seed
```

`.env` 최소 내용 (값은 직접 채운다)

```
DATABASE_URL=postgresql://quiz:<비밀번호>@localhost:5434/quizweb
PORT=3000
SESSION_SECRET=<충분히 긴 랜덤 문자열>
NODE_ENV=development
```

---

## 2. 친구들과 플레이하기 ★ 매번 하는 절차

```bash
# 0) Docker Desktop이 켜져 있는지 확인

# 1) DB 기동 (이미 떠 있으면 건너뛴다)
npm run db:up

# 2) 클라이언트 빌드 (코드가 바뀌었을 때만)
npm run build

# 3) 터미널 A — 서버
npm run dev

# 4) 터미널 B — 터널
npm run dev:tunnel
```

터미널 B에 이렇게 나온다.

```
==============================================
  외부 접속 주소 (친구들에게 이 주소를 공유하세요)

      https://xxxx-yyyy-zzzz.trycloudflare.com

  로컬:   http://localhost:3000
  종료:   Ctrl+C  (터널만 닫힙니다. 서버와 게임은 그대로 살아 있습니다)
==============================================
```

5) **이 주소를 친구들에게 공유한다.**
6) 건우가 먼저 접속해 방을 만들고, 방 안의 "초대 링크 복사" 로 방 링크를 공유한다.

> **URL은 터널을 새로 띄울 때마다 바뀐다.** 이것은 정상이며 설계상 문제가 되지 않는다.
> 초대 링크를 방장 브라우저의 주소로 만들기 때문에, 방장은 항상 올바른 링크를 얻는다.
>
> ★ 반대로 **터널이 켜져 있는 동안에는 네트워크가 끊겼다 붙어도 URL이 유지된다.**
>   실측으로 확인했다(3-A-1). 그러니 잠깐 끊겼다고 터널을 다시 띄우지 않는 것이 좋다.

### 끝낼 때

```
터미널 B에서 Ctrl+C   (터널)
터미널 A에서 Ctrl+C   (서버)
npm run db:down       (DB. 켜 둬도 무방하다)
```

---

## 3. ★ 네트워크가 끊겼을 때

**가장 먼저 확인할 것: 서버 프로세스(터미널 A)가 살아 있는가.**
이 하나로 대응이 완전히 갈린다.

### 경우 A — 서버 프로세스가 살아 있다 (대부분의 경우)

Wi-Fi가 끊겼다 붙거나, 공유기를 재부팅한 경우다.

**메모리의 방과 게임은 그대로 살아 있다.** 활성 플레이어가 0명이 되면
게임이 자동으로 `PAUSED` 로 멈추고 타이머도 멈춘다. 문제가 소모되지 않는다.

#### A-1. 터널 프로세스(터미널 B)도 살아 있다 → ★ 주 경로. URL이 유지된다

**R005에서 실측으로 확인했다.** cloudflared 프로세스가 살아 있으면
네트워크가 100초 끊겼다 붙어도 **같은 URL이 유지된다.**
URL은 프로세스 시작 시 1회 발급되고, 끊긴 동안에는 엣지 연결만 재등록되기 때문이다.

따라서 할 일이 거의 없다.

1. 친구들의 브라우저가 알아서 재연결한다. **세션 쿠키도 그대로이므로 다시 로그인할 필요가 없다**
2. 전원이 돌아오면 **방장이 재개 를 누른다.** 끝

> ★ **단 재연결에 시간이 걸릴 수 있다.**
> cloudflared 의 재연결 백오프가 지수적으로 늘어난다 (8초 → 16초 → 32초 → 1분 4초).
> 단절이 길었다면 네트워크가 복구된 뒤에도 **최대 1분 이상** 더 기다려야 할 수 있다.
> 조급하게 터널을 재시작하면 오히려 URL이 바뀌어 A-2 경로가 된다.
> **1~2분은 기다려 보는 것이 낫다.**

#### A-2. 터널 프로세스가 죽었다 → 예외 경로. URL이 바뀐다

터미널 B가 종료되었거나 Ctrl+C를 눌렀다면 새 URL을 받아야 한다.

```bash
npm run dev:tunnel
```

1. 새로 출력된 주소를 친구들에게 다시 공유한다
2. 친구들이 새 주소로 접속한다 (**다른 도메인이므로 다시 로그인해야 한다**)
3. 각자 방으로 다시 들어온다
4. **전원이 돌아오면 방장이 재개 를 누른다**

> 게임은 멈춘 그 문제, 그 남은 시간부터 이어진다. 점수도 그대로다.
> **방장이 누르기 전에는 절대 자동으로 재개되지 않는다.**
> 한 명이 먼저 들어왔다고 게임이 돌아가면 나머지가 접속하는 동안 문제가 소모되기 때문이다.

#### A-3. 30분이 지나 버린 경우

게임이 자동 종료된다(`abandoned`). 그때까지의 점수로 결과가 나온다.
진행 중이던 문제는 정답이 공개되지 않았으므로 **경험 기록으로 소모되지 않는다.**
로비로 돌아가 다시 시작하면 된다.

### 경우 B — 서버 프로세스가 죽었다

PC를 재부팅했거나, 터미널 A에서 Ctrl+C를 눌렀거나, 크래시한 경우다.

**메모리의 방과 게임이 사라졌다. 이어하기는 불가능하다.**

```bash
npm run dev          # 서버
npm run dev:tunnel   # 터널
```

서버가 부팅하면서 **자동으로 정리한다.**

- 진행 중이던 게임을 `server_restart` 로 종료
- 닫히지 않은 방을 전부 닫음 (★ 이게 없으면 방을 다시 만들 수 없다)

**이미 기록된 문제 경험은 삭제되지 않는다.** 그 문제들은 실제로 정답이 공개되어
사람들이 화면에서 본 것이므로 기록이 옳다.

새 링크를 공유하고 방을 새로 만들면 된다.

### 세 경우의 차이 정리

| | A-1 네트워크만 끊김 | A-2 터널 재시작 | B 프로세스 종료 |
|---|---|---|---|
| 터미널 A (서버) | 살아 있다 | 살아 있다 | 꺼졌다 |
| 터미널 B (터널) | 살아 있다 | 꺼졌다 | 꺼졌다 |
| **터널 URL** | **유지** | 바뀐다 | 바뀐다 |
| 친구들 재로그인 | **불필요** | 필요 | 필요 |
| 방·게임 | 유지 | 유지 | 소실 |
| 이어하기 | **가능** (방장이 재개) | 가능 (재입장 후 재개) | 불가 |
| 진행 중 문제 | 소모되지 않는다 | 소모되지 않는다 | 소모되지 않는다 |
| 이미 쌓인 경험 기록 | 유지 | 유지 | **유지** |

---
## 4. Cloudflare quick tunnel 조건 (확인일 2026-09-07)

| 항목 | 내용 |
|------|------|
| 계정 / 도메인 | **불필요** |
| 비용 | 무료 |
| **WebSocket** | **지원됨** (실측: `transport=websocket` 확인) |
| Server-Sent Events | 미지원 (우리는 쓰지 않는다) |
| 동시 처리 제한 | 진행 중 요청 200개. 초과 시 429. **10명 규모에서는 무관하다** |
| 세션 지속 시간 | 문서상 제한 없음 |
| URL | **실행할 때마다 바뀐다.** 프로세스 시작 시 1회 발급된다 |
| 공식 안내 | "테스트·개발 목적" 이며 SLA를 보장하지 않는다 |
| RTT (실측) | 133~257ms (엣지 위치에 따라 다름) |

> 공식 문서가 "테스트·개발용" 이라고 안내한다. 친구들끼리 가끔 쓰는 용도이므로 그 범위 안이라고 본다.
> 상시 서비스로 키우려면 다른 방식이 필요하다.

**URL 유지 여부 — ★ 확인 완료 (R005)**

- **cloudflared 프로세스가 살아 있으면 네트워크가 끊겼다 붙어도 URL이 유지된다.**
  방화벽으로 cloudflared 의 아웃바운드만 100초 차단한 뒤 복구해 실측했다.
  같은 URL 200, WebSocket 자동 재연결, 서버 bootedAt 동일.
  로그의 `Requesting new quick Tunnel` 은 1회(프로세스 시작 시)뿐이었고
  차단 중에는 엣지 연결 재등록만 일어났다.
- **cloudflared 를 재시작하면 URL이 바뀐다.** (별도 실측, R004)
- 재현 스크립트: `scripts/verify-tunnel-resilience.ps1` (관리자 권한 필요.
  ★ `.ps1` 은 UTF-8 BOM 으로 저장해야 한다. PowerShell 5.1 은 BOM 없는 파일을 ANSI 로 읽어
  한글이 깨지고 파서 에러가 난다)
- ★ 한계: 방화벽 차단은 Wi-Fi를 실제로 끄는 것과 완전히 같지 않다.
  인터페이스와 라우팅 테이블이 그대로다. 실제 상황에서도 유지될 가능성이 높다는 정도로 해석한다.

---

## 5. DB 백업 ★

**로컬 DB에 모든 데이터가 있으므로 이것이 유일한 안전장치다.**
특히 `question_experiences`(문제 경험 기록)는 한 번 잃으면 복구할 방법이 없다.

```bash
npm run db:backup                                    # backups/quizweb-YYYYMMDD-HHmmss.dump
npm run db:backup -- --out D:/백업/quiz.dump         # 위치 지정
npm run db:restore -- backups/quizweb-20260907-120000.dump
```

**언제 하는가**

- 플레이 세션이 끝난 뒤 (경험 기록이 늘어난 시점)
- `npm run db:reset` 을 돌리기 **전에 반드시**
- 스키마 마이그레이션을 적용하기 전
- Docker 볼륨을 건드리기 전

**권장**: 백업 파일을 가끔 다른 드라이브나 클라우드 드라이브에 복사해 둔다.
`backups/` 는 git에 넣지 않는다(개인 데이터가 들어 있다).

---

## 5-1. 비밀번호 재설정 (운영자 전용)

비밀번호 복구 기능을 만들지 않았다(Q-04). 잊은 사람은 **서버를 켜 주는 사람에게 요청**해야 한다.

```bash
npm run reset-password -- --list                                계정 목록
npm run reset-password -- --login-id chulsoo --password 1234    직접 지정
npm run reset-password -- --login-id chulsoo --generate         안전한 값 생성
```

- `--generate` 로 만든 비밀번호는 **이 터미널에 한 번만 출력된다.** 전달한 뒤 본인이 바꾸도록 안내한다
- ★ 재설정하면 **그 계정의 기존 세션을 전부 무효화한다.** 남의 손에 넘어간 세션이 살아남지 않게 한다
- 계정 목록 출력에 비밀번호 해시는 포함되지 않는다

---

## 6. 문제가 생겼을 때

| 증상 | 확인 |
|------|------|
| 서버가 `DATABASE_URL 환경 변수가 없습니다` 로 죽는다 | `.env` 가 있는지, `DATABASE_URL` 값이 채워졌는지 |
| 서버가 `정리 절차 실패` 로 죽는다 | `npm run db:up` 으로 DB 컨테이너 기동 확인 |
| 포트 3000이 이미 사용 중 | 이전 서버 프로세스가 남아 있다. 종료 후 다시 실행 |
| `cloudflared 를 찾을 수 없습니다` | `winget install --id Cloudflare.cloudflared` |
| 친구가 접속이 안 된다 | 터널 URL이 최신인지, 터미널 B가 살아 있는지 |
| 친구가 로그인 상태가 풀렸다 | 터널 URL이 바뀌면 도메인이 달라져 쿠키가 새로 생긴다. 정상이다 |
| 방을 만들 수 없다 (제약 오류) | 서버를 재시작하면 부팅 정리 절차가 해소한다 |
| 클라이언트 화면이 안 뜬다 | `npm run build` 를 했는지. 개발 중이면 `npm run dev:client` 를 함께 띄운다 |

**서버 상태 확인**

```bash
curl http://localhost:3000/healthz
```

```json
{ "ok": true, "phase": "phase1", "serverTime": ..., "bootedAt": ..., "uptimeMs": ..., "dbActiveMs": ..., "rooms": 0 }
```

- `bootedAt` 이 바뀌지 않았다면 서버 프로세스가 살아 있다는 뜻이다 (3장 경우 A/B 판별)
- `dbActiveMs` 는 DB를 깨워 둔 누적 시간이다. 클라우드로 옮길 때 사용량 지표가 된다.
  **아무도 안 쓰는데 이 값이 계속 증가하면** 어딘가에서 DB를 주기적으로 건드리고 있다는 신호다
  ([02-ARCHITECTURE.md](02-ARCHITECTURE.md) 3장 규칙 위반)

---

## 7. 나중에 클라우드로 옮길 때

이용자가 늘어 상시 가동이 필요해지면 그때 옮긴다.
[02-ARCHITECTURE.md](02-ARCHITECTURE.md) 3장의 "플랫폼 중립 규칙" 을 지켰다면
애플리케이션 코드를 고칠 필요가 없다.

옮길 때 확인할 것

1. 환경 변수만 바꿔서 뜨는지
2. **커넥션 풀 설정이 서버리스 DB의 유휴 정지를 방해하지 않는지**
   (`/healthz` 의 `dbActiveMs` 로 확인)
3. WebSocket이 통과하는지
4. 단일 인스턴스인지 (인스턴스를 늘리면 정답 판정의 원자성이 깨진다)

---

## ★ 문제 데이터 검수와 적재 (Track D)

> 파이프라인의 설계와 근거는 [pipeline/README.md](../pipeline/README.md),
> 실측 결과는 [07-DECISIONS.md](07-DECISIONS.md) D-033 ~ D-042 에 있다.

★★ **R011부터 주 경로가 바뀌었다.** OpenTDB 수확·가공이 아니라 **직접 생성**이다.
아래 "생성 문제" 절차를 먼저 보고, OpenTDB 절차는 참고로 남겨 둔다.

★★ **R012부터 Actions 정기 실행을 쓰지 않는다** (Q-71).
로컬에서 `npm run pipeline:bulk` 로 만든다. ★ 중단하고 재개할 수 있다.

---

### ★★ 생성 문제 절차 (R012 기준. 전부 로컬이다)

```
  건우 PC (로컬) — 틈날 때 돌린다
  ──────────────────────────────
  0. 현황 확인   npm run pipeline:bulk -- --status
  1. 생성        npm run pipeline:bulk -- --target 500
                 ★ 중단되면 다시 실행하면 이어서 채운다
  2. 역검증·규칙 검사·중복 판정이 1에 포함되어 있다
  3. 중복 판정   node scripts/pipeline-dedupe.mjs
  4. 출제 시트   node scripts/pipeline-samples.mjs
  5. 검수        npm run pipeline:review
  6. 적재        npm run pipeline:load
  7. 사후 정리   node scripts/pipeline-dedupe-db.mjs --judge
```

**★ 대량 생성 (주 경로)**

```bash
# ★ 먼저 현황을 본다. 소분류별로 얼마나 찼는지 보여준다
npm run pipeline:bulk -- --status

# 무엇을 요청할지만 본다 (API 를 부르지 않는다)
npm run pipeline:bulk -- --target 500 --plan

# 500건 목표로 생성한다
npm run pipeline:bulk -- --target 500

# 소분류당 목표 건수로 지정할 수도 있다
npm run pipeline:bulk -- --per-sub 3
```

★ **중단·재개가 어떻게 되는가**
진행 상태를 별도 카운터로 두지 않는다. `processed/` 의 모든 배치를 훑어
소분류별 누적 건수를 센다. ★ 그래서 다시 실행하면 **덜 채워진 소분류부터** 이어서 채운다.
★ Claude Code 가 만든 것도 같은 디렉터리에 있으므로 함께 세어진다.

★ 429 를 받으면 **15분 기다렸다가 1회만** 재개한다(Q-62). 또 429 면 그날 중단이다.
★ R012 실측: 그 규칙이 실제로 그대로 동작했다.

**카테고리 트리를 순회하는 방식 (참고)**

```bash
npm run pipeline:generate -- --plan        # 요청 계획만
npm run pipeline:generate                  # 전체 중분류 × 2건
npm run pipeline:generate -- --only symbols,drinks --per 2
npm run pipeline:generate -- --offset 2    # ★ 두 번째 순회는 반드시 --offset
```

★ 자체 건수 상한은 `PIPELINE_DAILY_ITEMS`(기본 200)로 조정한다.
★ 429 를 받으면 **15분 기다렸다가 1회만** 재개한다(Q-62 확정). 또 429 면 그날 중단이다.
그 사이 진행 상황은 `data/pipeline/state/daily.json` 의 `segments` 에 구간별로 남는다.

**5. 출제 시트 읽기**

```bash
node scripts/pipeline-samples.mjs
# → data/pipeline/samples/R011-samples.txt
```

★ 카테고리 순서대로 묶여 있다. 카테고리 단위로 판단하기 위한 것이다.
시트에는 통과분, **탈락분(사유 포함)**, 중복 판정 결과, 통계가 모두 들어 있다.

★ **탈락분을 버리지 않는 이유**: 판정 품질을 평가하는 근거다.
R010에서 역검증 판정이 정상 문제 6건을 전부 오탈락시킨 것을 이 방법으로 찾았다.

**★★ 생성 문제에서 특별히 볼 것 (R012 갱신)**

| # | 항목 | 왜 |
|---|------|-----|
| 1 | ★★ **질문 문장의 사실이 맞는가** | ★ **역검증이 이것을 잡지 못한다.** 정답만 확인하기 때문이다. R012 실측: "라틴어 '수소(Hydrargyrum)'" — Hydrargyrum 은 '물 같은 은' 이다. 역검증은 Hg 를 맞히고 통과시켰다 (Q-73) |
| 2 | ★★ **정답이 유일한가** | ★ 역검증도 놓친다. R012 실측: "가로와 세로 직선으로 무제한 이동하는 기물은?" → 룩. **퀸도 그렇다** ("~만" 이 빠졌다) |
| 3 | ★ **알 가치가 있는가** | 답을 듣고 "알아서 좋았다" 고 느낄 문제인가. ★ 난이도가 높은 것은 문제가 아니다 — 해설이 나오므로 배우는 시간이 된다 (D-044) |
| 4 | ★ **표기 변형이 충분한가** | ★ 이 게임은 정확 문자열 일치로만 판정한다. R012 실측: "설형문자" 에 "쐐기문자" 가 없어 오탈락했다 |
| 5 | 접근성이 2 이하인가 | 2는 전체의 5% 이내로만 통과시킨다 (Q-69) |

★ 선별 기준(Q-69)은 `pipeline/src/select.ts` 에 있고 환경변수로 조정한다.
```bash
PIPELINE_MIN_ACCESS=3        # 접근성 하한
PIPELINE_TOLERATE_RATIO=0.05 # 접근성 2 등급의 총량 상한
PIPELINE_MIN_WORTH=3         # ★ 알 가치 하한 (건우가 정할 값)
PIPELINE_MIN_DIFFICULTY=0    # ★ 0 이면 난이도로 걸러내지 않는다. 바꾸지 않기를 권한다
```

---


### 왜 사람이 승인해야 하는가

★ **자동으로 서비스 DB 에 넣지 않는다.**
이상한 문제 하나가 실전에 나오면 그 판이 망가진다.
이 게임은 정확 문자열 일치로만 판정하므로(guide 16절), 정답을 아는 사람이
계속 오답 처리되는 문제가 섞이면 게임 자체가 재미없어진다.

### 흐름

```
  Actions (클라우드)                        건우 PC (로컬)
  ──────────────────                       ──────────────
  1. 수확  OpenTDB → raw/*.jsonl
  2. 가공  필터 → Gemini → 역검증 → processed/*.json
  3. 커밋  결과 JSON 을 저장소에 push
                    │
                    │  git pull
                    ▼
                                      4. 검수  npm run pipeline:review
                                      5. 적재  npm run pipeline:load
```

### 4. 검수 (사람)

```bash
git pull

# 검수 시트를 읽는다
npm run pipeline:review
```

★ **확인할 것 네 가지**

| # | 항목 | 왜 |
|---|------|-----|
| 1 | 한국인이 답할 수 있는 문제인가 | 모델의 krAccessible 판정이 틀릴 수 있다 |
| 2 | ★ 표기 변형이 충분한가 | **가장 중요하다.** 내가 칠 것 같은 표기가 빠져 있으면 억울하게 진다 |
| 3 | 질문에 정답이 드러나 있지 않은가 | 규칙 검사가 잡지만 번역 뉘앙스는 사람만 안다 |
| 4 | 정답이 유일한가 | 역검증이 잡지만 완벽하지 않다 |

★ **메모가 붙은 항목은 반드시 본다.**
`역검증이 정답을 맞혔으나 집합 밖 대안을 제시했다: …` 가 붙어 있으면,
그 대안이 **추가할 표기 변형**인지 **다른 대상**인지 사람이 판단해야 한다.
- 추가할 표기의 예: `드럼` → `드럼 세트`, `드럼킷` (같은 대상)
- 추가하지 않는 예: `뇌` → `대뇌` (뇌의 일부다), `영국` → `잉글랜드` (영국의 일부다)

```bash
# 전부 승인
npm run pipeline:review -- --approve all

# 일부만 승인
npm run pipeline:review -- --approve otdb-xxxx,otdb-yyyy

# 반려 (사유를 남긴다)
npm run pipeline:review -- --reject otdb-zzzz --note "니치 게임 세부 설정"

# 내용을 고치고 싶으면 processed/ 의 JSON 을 직접 편집한다
#   questionKo / displayAnswer / answers 를 손으로 고쳐도 된다
#   ★ git diff 에 남으므로 무엇을 고쳤는지 볼 수 있다

# approved/ rejected/ 로 나눠 저장
npm run pipeline:review -- --collect
```

★ `rejected/` 는 버리지 않는다. 필터 품질 평가와 프롬프트 개선의 근거다.

### 5. 적재

★ **생성 문제를 처음 적재하기 전에 마이그레이션을 적용해야 한다.**

```bash
npm run db:migrate
#   0002_gemini_gen_source.sql   ★ source_id 'gemini-gen' 등록 (없으면 FK 오류)
#   0003_categories_tree.sql     ★ 카테고리 계층 (없으면 소분류를 찾지 못한다)
```

★ **카테고리 트리를 고쳤다면 마이그레이션을 다시 만들어야 한다.**
```bash
node scripts/gen-migration-0003.mjs > migrations/0004_categories_tree.sql
```
★ SQL 을 손으로 고치지 않는다. 정본은 `pipeline/src/categories.ts` 다.

★ 적재 스크립트가 먼저 확인하고 알려 준다 —
`★ sources 테이블에 없는 소스: gemini-gen`.

```bash
# 무엇이 들어갈지 먼저 본다
npm run pipeline:load -- --dry-run

# 적재
npm run pipeline:load
```

★ 두 번 돌려도 안전하다. `(source_id, source_ref)` 로 중복을 세 겹으로 막는다.
★ 적재하면 곧바로 출제 대상이 된다(`status='approved'`, `is_active=true`).
승인 대기 상태로 넣고 싶으면 `--pending` 을 준다.

### 문제를 빼야 할 때

```sql
-- ★ status 를 rejected 로 되돌리지 않는다. 검수 이력이 오염된다.
--   is_active 만 내린다. 두 값은 다른 축이다 (migrations/0001_init.sql 주석).
UPDATE questions SET is_active = false WHERE id = <문제 id>;
```

### ★ 적재된 문제들 사이의 중복 정리 (R012 신설)

```bash
# 후보만 본다 (API 를 부르지 않는다)
node scripts/pipeline-dedupe-db.mjs

# LLM 판정까지 한다 (DB 는 바꾸지 않는다)
node scripts/pipeline-dedupe-db.mjs --judge

# ★ is_active 를 내린다
node scripts/pipeline-dedupe-db.mjs --judge --apply
```

★ **왜 필요한가** — 적재 전 파일 단계 검사로는 다음을 잡을 수 없다.
- 다른 날 만든 배치 사이의 중복
- ★ 시드 문제(53건)와 생성 문제 사이의 중복

★ R012 첫 실행에서 실제로 하나 찾았다 —
`#7 (manual)` "그리스 신화에서 제우스의 아내는?" 과
`#60 (opentdb)` "그리스 신화에서 주신 제우스의 아내는 누구인가?" 가 둘 다 헤라다.

★ 지우지 않는다. `is_active` 만 내리고 `review_queue.reviewer_note` 에 이유를 남긴다.
★ `--apply` 를 주지 않으면 DB 를 전혀 바꾸지 않는다.

### 예산 상태 확인

```bash
cat data/pipeline/state/daily.json
```

★ `rateLimited: true` 면 그날은 가공이 시작되지 않는다 (Q-54).
짧은 창의 한도였다고 판단되면 `npm run pipeline:reset-limit` 로 사람이 해제한다.
★ 자동으로 해제되지 않는다. 판단이 필요한 일이다.

★ **읽는 방법** (R011에서 항목이 늘었다)

| 필드 | 의미 |
|------|------|
| `items` / `tokens` / `calls` | 오늘 누적. ★ LLM 에 실제로 도달한 건수만 센다 |
| `rateLimitHits` | 429 를 받은 횟수 (재개 후 다시 받은 것도 센다) |
| `resumes` | ★ 15분 대기 후 재개한 이력. 하루 1회까지다 (Q-62) |
| `segments` | ★ 429 사이 구간별 건수·토큰·호출. **한도 측정의 원천 데이터다** |
| `wastedRequests` | ★ 상위 모델 503 으로 낭비된 요청. 모델별 |

★ R011 실측에서 `wastedRequests` 의 3.8-flash 가 10회였다 —
생성 호출 11번 중 10번이 503 이었다. 실질적으로 못 쓰는 모델이라는 뜻이다.
그래도 체인 첫 자리에 두는 이유는 D-033 에 있다(쓸 수 있게 되면 자동으로 쓴다).
