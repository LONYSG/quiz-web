# 작업 기록

> 의미 있는 작업 단위마다 항목 하나를 남긴다.
> "무엇을 / 왜 / 어떤 문제가 있었는지 / 어떤 결정을 했는지 / 어떻게 해결했는지 /
> 어떤 파일·기능에 영향을 주었는지 / 어떻게 검증했는지 / 남은 문제" 를 적는다.
>
> **최신이 위에 온다.**

---

## 2026-09-07 — `npm run dev` 실행 불가 사고 수정 (R006)

### 무엇이 일어났는가

`npm run dev` 가 서버를 띄우지 못했다.

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'server\src\config.js'
imported from server\src\index.ts
```

Phase 1 코드는 정상이었다. **깨진 것은 dev 실행 경로 하나였다.**

### 원인

tsconfig 의 `moduleResolution: NodeNext` 는 상대 import 에 컴파일 결과물의 확장자(`.js`)를
쓰도록 요구한다. 반면 `node --experimental-strip-types` 는 import 문자열을 재작성하지 않고
문자 그대로 파일을 찾는다. 두 규칙이 각각 옳고 조합이 불가능하다.

실측 확인: `--experimental-strip-types` 로 `'./dep.js'` 는 실패, `'./dep.ts'` 는 성공.
Node 22.18 에는 `.js` → `.ts` 재매핑이 없다.

★ 저장소 전체 상대 import 57건을 감사했다. 전부 `.js` 확장자로 **일관**되어 있었다.
즉 소스가 틀린 것이 아니라 **실행기 선택이 틀렸다.**

### ★ 왜 R005에서 발견되지 않았는가

정직하게 적는다. 세 검증이 각각 다른 이유로 못 잡았다.

| 검증 | 왜 못 잡았는가 |
|------|--------------|
| typecheck | `tsc` 는 `./config.js` 를 컴파일 후 파일로 해석한다. TS 관점에서 이 코드는 옳다 |
| build | 같은 이유. 컴파일이 성공하고 `dist/config.js` 가 실제로 만들어진다 |
| 봇 테스트 21항목 | ★ **서버를 `node server/dist/index.js` 로 띄웠다.** 컴파일 산출물이라 정상 동작했다. `npm run dev` 는 한 번도 실행하지 않았다 |

**★ 세 번째가 이번 사건의 본질이다.** 테스트가 사람이 쓰는 실행 경로와 다른 경로를 썼다.
그래서 "테스트 전부 통과"와 "실행 불가"가 동시에 성립했다.

typecheck·build 통과는 컴파일 가능성만 보장한다. **실행 가능성은 보장하지 않는다.**

### 어떻게 고쳤는가

세 선택지를 비교하고 **"dev 도 컴파일 산출물을 실행한다"** 를 택했다.
근거는 [07-DECISIONS.md](07-DECISIONS.md) D-020.

핵심 이유: 다른 선택지는 깨진 경로를 *고치지만*, 이것은 그 경로를 *없앤다*.
이제 `npm run dev` / `npm start` / `smoke` / `bot` 이 전부 같은 파일을 실행한다.
소스를 한 줄도 고치지 않았고 의존성도 늘리지 않았다.

### 재발 방지

1. `npm run smoke` — 빌드 → 기동 → `/healthz` → 클라이언트 서빙 → 소켓 핸드셰이크 →
   종료 → 포트 해제. 9항목
2. `npm run verify` = typecheck + test + smoke. **라운드 종료 게이트**
3. `npm run bot` 이 서버가 없으면 사람과 같은 경로로 직접 띄운다
4. `server/package.json` 의 깨진 `dev` 스크립트를 **제거**했다. 남겨 두면 다시 밟는다
5. dist 부재 시 `--force` 빌드 (tsbuildinfo 만 남아 빌드가 no-op 되는 함정)
6. [10-TESTING.md](10-TESTING.md) 0장에 "매 라운드 마지막에 `npm run verify`" 를 절차로 넣었다
7. 같은 문서 7장에 **브라우저 수동 확인 절차**를 넣었다.
   한글 IME 조합 중 Enter 와 모바일 화면은 봇으로 검증할 수 없다

### 작업 중 발견한 것

**smoke 스크립트 자체의 오탐 1건.**
종료 판정을 `exit` 콜백의 `code` 만으로 했는데, Windows 에서 `child.kill()` 은 즉시 종료라
`code=null, signal='SIGTERM'` 이 온다. `code` 만 보면 "신호로 종료됨"과 "아직 안 죽음"이
둘 다 `null` 이라 구분되지 않았다. 첫 실행에서 실제로 이 오탐이 났다.
→ `signal` 을 함께 추적하고 판정 기준을 "프로세스 소멸 + 포트 해제" 로 바꿨다.

**클라이언트는 문제가 없었다.** Vite 는 `'./api.js'` 를 `/src/api.ts` 로 정상 해석한다.
실측으로 확인했다(`/src/App.tsx` 응답에 `from "/src/api.ts"` 가 보인다).

### 검증

| 항목 | 결과 |
|------|------|
| `npm run dev` | ★ 정상 기동. `/healthz` 200 |
| `npm run smoke` | 9/9 통과 |
| `npm run bot` (서버 없는 상태) | 자동 기동 → duplicate 시나리오 통과 → 자동 종료 |
| `npm run dev:client` | Vite 5173 정상. `/api` 401(미로그인), `/healthz` 프록시 200 |
| Vite 모듈 해석 | `from "/src/api.ts"` — `.js` 지정자를 `.ts` 로 해석 확인 |
| Vitest | 97건 통과 / 13건 skip |
| typecheck / build | 통과 |

### 남은 문제

- 브라우저 수동 확인 4항목은 건우가 직접 해야 한다 (10-TESTING.md 7장)
- 터미널 Ctrl+C 로 graceful shutdown 핸들러가 실행되는지는 확인하지 못했다 (확인 필요)
- Track D 는 다음 라운드로 미뤘다

### 다음 작업

**R007 = Track D** (문제 데이터 파이프라인). R005 9-4의 순서 그대로.

---

## 2026-09-07 — Phase 1 완료 (계정 / 세션 / 방) + Gemini·터널 검증

### 무엇을 했는가

Phase 1 전체(계정·세션·방·방장·메모리 방 관리 구조·클라이언트·봇 클라이언트)와
그에 앞선 두 가지 검증 — Gemini API 키·모델·프롬프트, 그리고 Q-53(터널 URL 유지 여부).

### 왜 했는가

Phase 1은 그 자체 기능보다 **Phase 3의 게임 상태가 얹힐 뼈대를 세우는 것**이 목적이다.
전역 tick, 방 레지스트리, 인바운드 공통 검사, 개인별 브로드캐스트, 스냅샷 생성이 그것이다.
이것을 나중에 만들면 Phase 3에서 전부 뜯어야 한다.

Q-53은 운영 절차가 두 갈래로 남아 있어 닫아야 했다.
Gemini는 Track D 착수 전에 "쓸 수 있는가"를 확인해야 했다.

### 발견한 문제와 해결

**1. ★ R002가 전제한 Gemini 모델을 쓸 수 없다**

`gemini-2.5-flash` / `gemini-2.5-flash-lite` 는 `GET /models` 목록에는 나오지만
`generateContent` 호출 시 404 를 반환한다.

> "no longer available to new users. Please update your code to use models/gemini-3.6-flash"

→ **목록 존재 여부만으로 판단하면 안 된다.** 실제 호출로 확인해야 한다.
검증 스크립트가 후보를 순서대로 호출해 첫 성공 모델을 쓰도록 만들었다.
1차 가공 `gemini-3.6-flash`, 역검증 `gemini-3.5-flash-lite` 로 잠정 채택(Q-59).

**2. ★ 사고(thinking) 토큰이 크다**

프롬프트 1,481 / 출력 1,291 인 요청의 `totalTokenCount` 가 5,403이었다.
차이 약 2,631이 사고 토큰이다.
→ **TPM 한도를 계산할 때 보이는 토큰의 3~4배로 잡아야 한다.** Q-54에 기록했다.

**3. 로컬 `.env` 키와 GitHub Secrets 키가 서로 다른 값이다**

양쪽을 각각 검증했더니 둘 다 유효하지만 값이 다르다(길이 39자 / 53자).
의도한 것이면 문제없으나, 한쪽을 폐기했을 때 혼동이 생긴다. Q-60으로 올렸다.

**4. PowerShell 5.1이 BOM 없는 `.ps1` 을 ANSI로 읽어 한글이 깨졌다**

`verify-tunnel-resilience.ps1` 이 파서 에러로 실행되지 않았다.
→ `.ps1` 은 UTF-8 BOM + CRLF 로 저장한다. `.gitattributes` 정책과 별개로
PowerShell 5.1의 제약이다.

**5. 봇 클라이언트가 부분 갱신 이벤트를 반영하지 않아 검증이 무의미했다**

처음 작성한 봇은 `room.state` 스냅샷만 받고 `room.playerJoined` /
`room.connectionChanged` 를 무시했다. 그래서 "참가자 1명", "활성 인원 2명" 처럼
서버가 옳게 동작하는데도 틀린 값을 보고했다.
→ 부분 갱신 핸들러를 넣고, **표시 유예 5초와 활성 인원 즉시 반영을 실제로 단정하도록** 고쳤다.
로그만 찍고 검증하지 않는 테스트는 없는 것보다 나쁘다.

**6. `RULES.HEARTBEAT_INTERVAL_MS` 가 30초로 잘못 들어가 있었다** (지시받은 수정)

Q-02 확정값은 4분인데 상수는 30,000이었다. 240,000으로 고쳤다.
클라이언트가 아직 heartbeat 를 보내지 않아 동작에는 영향이 없었으나,
RULES 상수의 존재 이유가 "규칙 수치를 한 곳에 모아 놓치지 않게 하는 것"이므로
그 안에 틀린 값이 있으면 목적 자체가 무너진다.
→ 전체 대조 결과 다른 불일치는 없었고, 누락된 상수 6개를 보강했다(R005 3장).

### 영향 범위

새로 만든 것

- `server/src/` — config / seq / tick / auth(password, session) / db(accounts, rooms) /
  http(authRoutes) / rooms(types, registry, emit, snapshot) / socket(guard, index)
- `client/src/` — api / useRoom / AuthScreen / Lobby, App 전면 교체
- `scripts/` — bot.mjs / reset-password.mjs / verify-gemini.mjs / verify-tunnel-resilience.ps1
- `.github/workflows/verify-gemini.yml`

고친 것

- `shared/src/protocol.ts` — HEARTBEAT_INTERVAL_MS 수정, 상수 6개 추가
- `docs/` — 02 / 05 / 07 / 08 / 10 / 11

### 검증

| 항목 | 결과 |
|------|------|
| Vitest | 97건 통과 / 13건 skip |
| typecheck / build | 통과 |
| 비밀값 차단 6항목 | 전부 정상. **히스토리 유출 0건** |
| Gemini 키 (로컬 / Secrets) | 양쪽 유효. 로그에 키 노출 0건 |
| Gemini 판정 정확도 | 샘플 6문제 **6/6 기대와 일치** |
| Gemini 복수 정답 배열 | 변형 많은 6문제 accept 6/6, **평균 4.0개.** "잉글랜드" 함정 회피 |
| Gemini 역검증 | 5/5 일치. **비유일 정답 2건을 ambiguous=true 로 정확히 탐지** |
| **Q-53 터널 URL 유지** | **유지됨.** 100초 차단 후 같은 URL 200, WebSocket 재연결, bootedAt 동일 |
| 방화벽 규칙 제거 | 확인됨 (QUIZWEB* 0건) |
| 봇 join 11명 | 10명 입장 / 11번째 ROOM_FULL |
| 봇 duplicate | session.terminated 수신 + 첫 연결 끊김 + 방 승계 |
| 봇 reconnect | 활성 인원 즉시 1, 표시 유예 2.7초 true → 7.2초 false, 색상 유지 |
| 봇 host | 10초 미이전 → 30초 이전 → 복귀해도 미반환 |
| 봇 chat | 10명 × 20개 = 200건 전송 / 200건 수신, 누락 0 |
| 방 오류 구분 | ROOM_NOT_FOUND / ROOM_CLOSED / ALREADY_HAS_ROOM |
| 계정 규칙 | 아이디 대소문자 무시, `Player` ≠ `player`, 비번 3자 거부 |
| 로그인 실패 메시지 | 아이디 없음과 비번 오류가 동일 문구 |
| **부팅 정리 회귀** | 방 8개 잔존 → 재시작 → 0개 → **같은 사람이 방 재생성 성공** |

### 남은 문제

- 게임 로직 전체 미구현 (Phase 2 이후)
- `maskAnswers()` 미구현 (Phase 6). 테스트 13건 skip 대기
- Track D 미착수. R006에서 시작한다
- Q-54(Gemini 한도) / Q-59(모델 확정) / Q-60(키 불일치) 미결

### 다음 작업

**R006 = Track D** (문제 데이터 파이프라인). 게임 Phase와 라운드 단위로 번갈아 진행한다.
그 다음 R007 = Phase 2 (로비 설정·경험률·게임 시작).

---

## 2026-09-07 — Phase 0 완료

### 무엇을 했는가

Phase 0 전체. 저장소 문서 골격, 모노레포 스캐폴딩, DB(스키마·마이그레이션·시드·백업),
shared 순수 함수 구현과 테스트, 최소 서버·클라이언트, 외부 공개(터널) 검증.

### 왜 했는가

R001에서 Phase 0을 신설한 이유는 "인프라 제약을 Phase 5에서 발견하면 되돌리는 비용이 크다"였다.
게임 로직을 만들기 전에 **실제로 외부에서 접속되는 walking skeleton** 을 먼저 세운다.

### 발견한 문제와 해결

**1. 부팅 시 정리 절차가 없으면 방을 다시 만들 수 없게 된다** (설계 결함)

`rooms` 에 "1인당 열린 방 1개" 부분 UNIQUE 인덱스가 있는데, 방 삭제는 메모리에서 일어난다.
프로세스가 죽으면 `closed_at` 이 NULL인 방이 DB에 남고, 메모리에는 없으므로 영원히 닫히지 않는다.
그 사람은 다시는 방을 만들 수 없다. **로컬 PC 서버는 껐다 켜는 것이 일상이라 반드시 발생한다.**

→ `server/src/db/bootCleanup.ts` 를 만들어 부팅 시 잔여 게임(`server_restart`)과 방을 닫는다.
`question_experiences` 는 삭제하지 않는다(guide 25절).

**2. `buildNormalizedIndex` 의 인덱스 매핑이 이모지에서 어긋났다** (실제 버그)

정규화 결과 문자열과 원문 인덱스 대응표를 만들 때 **코드 포인트 단위로 세고 있었다.**
이모지처럼 서로게이트 페어(코드 유닛 2개)인 문자에서 `norm.length` 와 `map.length` 가 어긋나
이후 인덱스가 전부 밀렸다. 테스트가 잡았다.

→ 코드 유닛마다 map 항목을 하나씩 넣도록 고쳤다.
이 함수는 Phase 6 마스킹의 기반이므로 여기서 잡은 것이 다행이다.

**3. `g` 플래그 정규식으로 `.test()` 를 호출하고 있었다** (잠재 버그)

`ZERO_WIDTH_RE` 에 `g` 플래그가 있는데 `.test()` 를 호출하면 `lastIndex` 가 전진해
같은 입력에 대해 호출마다 다른 결과가 나온다.

→ 판정용 비-global 정규식을 분리했다. 회귀 테스트를 추가했다.

### 영향 범위

새로 만든 것: `docs/` 12개, `shared/src/` 5개 모듈 + 4개 테스트, `server/src/`,
`client/src/`, `migrations/0001_init.sql`, `scripts/` 5개, `data/seed/`,
`docker-compose.yml`, `.env.example`, `vitest.config.ts`

### 검증

| 항목 | 결과 |
|------|------|
| Vitest | **97건 통과**, 13건 skip(Phase 6 예정) |
| 빌드 | shared / server / client 전부 성공 |
| 마이그레이션 | 15개 테이블 생성 확인 |
| 시드 | 53문제 / 정답 표기 139행 |
| 부팅 정리 절차 | 잔여 방 1 → 0, 게임 `server_restart`, 제약 해소 후 방 생성 성공 |
| 커넥션 풀 유휴 종료 | `dbActiveMs` 가 약 60초에서 멈춤 (설정대로 동작) |
| Q-14 제약 | 같은 사람의 두 번째 방 생성이 DB에서 거부됨 |
| 헬스체크 | 로컬·터널 양쪽 200 |
| **WebSocket 터널 통과** | `transport=websocket` 확인 |
| 시계 오프셋 (로컬) | RTT 1ms / offset +4.5ms |
| 시계 오프셋 (터널) | RTT 133~257ms / offset −21~+49.5ms |
| 터널 종료 시 서버 영향 | **없음.** `bootedAt` 유지 확인 |
| cloudflared 재시작 | **URL 변경됨** (quick tunnel은 프로세스 시작 시 새로 발급) |

### 남은 문제

- **네트워크 단절(프로세스는 생존) 시 URL 유지 여부를 강제로 재현하지 못했다.**
  방화벽 규칙에 관리자 권한이 필요했다. 로그 분석상 URL은 프로세스 시작 시 1회 발급되므로
  유지될 것으로 **추정**하나 확인이 필요하다. 절차는 `11-DEPLOY.md` 에 두 경우를 모두 적었다
- `maskAnswers()` 미구현 (Phase 6). 테스트 13건이 skip 상태로 대기 중
- 게임 로직 전체 미구현 (Phase 1 이후)

### 다음 작업

Phase 1 — 계정 / 방. 상세는 `05-STATUS.md` 의 Phase 1 표.

---

## 2026-09-04 — 저장소 초기화 (R003)

Git 저장소를 만들고 R001~R003 설계 기록을 백업했다.
의사결정 기록이 로컬에만 있는 상태를 해소하는 것이 목적이었다.

- `.gitignore` 로 `.env` 계열과 `tmp/` 차단. `git add --dry-run` 으로 실검증
- `.gitattributes` 로 개행을 LF 고정
- `ai-out/README.md` 에 "정본은 docs/" 명시

커밋: `4aae952`(R001~R002 기록), `0a40239`(R003 기록)
