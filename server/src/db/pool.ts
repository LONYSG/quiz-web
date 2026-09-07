// =============================================================================
// PostgreSQL 커넥션 풀
//
// ★ 이 설정은 "지금 필요해서"가 아니라 "나중에 클라우드로 옮길 때를 대비해서" 있다.
//   현재 DB는 건우 PC의 로컬 PostgreSQL이므로 유휴 연결을 붙들어도 비용이 들지 않는다.
//   그러나 Neon 같은 서버리스 PostgreSQL로 옮기면 사정이 완전히 달라진다.
//   Neon은 5분간 쿼리가 없으면 컴퓨트를 정지시켜 요금을 0으로 만드는데,
//   커넥션 풀이 유휴 연결을 계속 열어 두면 그 정지가 영원히 발동하지 않는다.
//   그러면 Free 플랜에서는 월 한도를 초과해 DB가 멈추고, 종량제에서는 요금이 20배가 된다.
//   (R002 1-4 시나리오 2 / R002 1-6 / R003 1-4 조건 1)
//
// ★ 따라서 아래 세 가지는 클라우드 전환 여부와 무관하게 항상 지킨다.
//   (1) 유휴 연결을 오래 붙들지 않는다 (idleTimeoutMillis)
//   (2) 풀 크기를 작게 유지한다 (max)
//   (3) ★ DB를 주기적으로 건드리는 코드를 만들지 않는다
//       - 헬스체크(GET /healthz)는 DB에 접근하지 않는다
//       - heartbeat 핸들러는 DB에 접근하지 않는다
//       - 만료 세션 정리 크론을 두지 않는다 (로그인 시 기회주의적으로 정리한다)
//       - 로비 경험률은 진입·인원 변동 시에만 조회하고 주기 갱신하지 않는다
//   자세한 근거는 docs/02-ARCHITECTURE.md 의 "DB 접근 규칙" 절을 본다.
// =============================================================================

import pg from 'pg';

let pool: pg.Pool | null = null;

/** DB를 실제로 한 번이라도 깨운 누적 시간(ms). 사용량 자체 관측용 (R003 1-3 (b)) */
let activeSinceMs: number | null = null;
let cumulativeActiveMs = 0;

export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL 환경 변수가 없습니다. .env.example 을 .env 로 복사한 뒤 값을 채우세요.',
    );
  }

  pool = new pg.Pool({
    connectionString,
    // (2) 풀을 작게 유지한다. 단일 인스턴스 + 최대 10명 규모에서 그 이상은 불필요하다.
    max: 5,
    // (1) 유휴 연결을 60초 뒤에 닫는다.
    //     서버리스 DB의 스케일 투 제로 기준(보통 5분)보다 충분히 짧아야 한다.
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
  });

  // 풀이 처음 연결을 열고 마지막 연결을 닫는 시점을 기록해
  // "이번 실행에서 DB를 몇 시간 깨워 두었는지"를 우리가 직접 알 수 있게 한다.
  // 외부 모니터링에 의존하지 않기 위한 최소 장치다.
  pool.on('connect', () => {
    if (activeSinceMs === null) activeSinceMs = Date.now();
  });
  pool.on('remove', () => {
    if (pool && pool.totalCount === 0 && activeSinceMs !== null) {
      cumulativeActiveMs += Date.now() - activeSinceMs;
      activeSinceMs = null;
    }
  });

  pool.on('error', (err) => {
    // 유휴 클라이언트에서 발생한 오류. 프로세스를 죽이지 않는다.
    console.error('[db] 유휴 커넥션 오류:', err.message);
  });

  return pool;
}

/** DB 활성 누적 시간(ms). 진단용. */
export function getDbActiveMs(): number {
  return cumulativeActiveMs + (activeSinceMs === null ? 0 : Date.now() - activeSinceMs);
}

/**
 * ★ 지연 연결: 서버 기동만으로 DB에 붙지 않는다.
 * 첫 쿼리가 필요할 때 비로소 연결이 열린다(pg.Pool의 기본 동작).
 * 이 함수는 그 사실을 명시적으로 드러내기 위해 존재한다.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
