// =============================================================================
// ★★ R074 (§F ① · 찬종 11-05 디스크 8.1GB 중 백업 6.1GB = 덤프 78개) — 백업 자동 정리: 판단만(파일 지우기는 부르는 쪽)
//   backups/<DB>-YYYYMMDD-HHmmss.dump 중 DB 이름마다 **최신 N 개만** 남긴다(기본 3 — R100 · BACKUP_KEEP · --keep N · 0 = 정리 안 함).
//   ★ minigame-*.zip 등 다른 파일은 건드리지 않는다(이름 꼴이 다르다).
// =============================================================================
// ★★ R095 (D-352) — 파일 이름 = <DB 이름>-YYYYMMDD-HHmmss.dump(quizweb-… · quizweb_dev-…) · "최신 N" 은 **같은 DB 이름끼리만** 센다
//   (G060 사고: dev 백업도 quizweb-* 이름이라 정리에 섞여 실 백업 quizweb-20261110-221145 가 지워짐)
export const BACKUP_RE = /^([A-Za-z0-9_]+)-\d{8}-\d{6}\.dump$/;
// ★ R100 (B · 찬종 2026-11-13) — 5 → 3: GEN 라운드가 두 DB 를 한 번에 뜨면서 금방 찬다(덤프 하나 ≈ 190MB)
export const DEFAULT_KEEP = 3;

/** 백업 파일 이름 — DB 이름이 이상하면(경로 문자 등) quizweb */
export function backupName(db, stamp) {
  const safe = /^[A-Za-z0-9_]+$/.test(db ?? '') ? db : 'quizweb';
  return `${safe}-${stamp}.dump`;
}

/** 덤프할 DB 이름 — DB_NAME > DATABASE_URL 의 DB 이름 > quizweb */
export function dbNameOf(env) {
  if (env.DB_NAME) return env.DB_NAME;
  try {
    const name = decodeURIComponent(new URL(env.DATABASE_URL ?? '').pathname.replace(/^\//, ''));
    if (name) return name;
  } catch {
    /* 주소가 없거나 이상하면 기본 */
  }
  return 'quizweb';
}

/** 남길 개수 — --keep N > BACKUP_KEEP > 3 · 이상한 값은 기본 */
export function keepCount(argv, env) {
  const i = argv.indexOf('--keep');
  const raw = i >= 0 ? argv[i + 1] : env.BACKUP_KEEP;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_KEEP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_KEEP;
}

/** 지울 파일 이름 — DB 이름마다 최신 keep 개만 남김(같은 이름 안에서 이름순 = 시각순) · keep 0 이면 없음 */
export function pickPrune(names, keep) {
  if (!(keep > 0)) return [];
  const groups = new Map();
  for (const n of names) {
    const m = BACKUP_RE.exec(n);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(n);
  }
  const gone = [];
  for (const g of groups.values()) {
    g.sort();
    gone.push(...g.slice(0, Math.max(0, g.length - keep)));
  }
  return gone.sort();
}

// =============================================================================
// ★★ R100 (A · 찬종 2026-11-13 "ops 에서 뭐 하나 할 때마다 백업 만들던데 그렇게까지 해야 해?")
//   ops 의 행 하나 고치는 일(포인트 · 비밀번호 · 제보 처리 · 채택) 앞 백업은 **같은 DB 의 덤프가 6시간 안이면 건너뛴다**.
//   BACKUP_FRESH_HOURS 로 덮음 · 0 = 늘 뜸. 메뉴 12(손으로 누른 백업)와 GEN 의 "쓰기 전 백업"은 이 규칙을 쓰지 않는다(늘 뜬다).
// =============================================================================
export const DEFAULT_FRESH_HOURS = 6;

/** 신선 기준 시간 — BACKUP_FRESH_HOURS > 6 · 이상한 값은 기본 · 0 = 늘 뜸 */
export function freshHours(env) {
  const raw = env.BACKUP_FRESH_HOURS;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_FRESH_HOURS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FRESH_HOURS;
}

/** 파일 이름의 시각(로컬) → ms · 꼴이 다르면 null */
export function stampMs(name) {
  const m = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  return new Date(y, mo - 1, d, h, mi, se).getTime();
}

/**
 * 이 DB 의 가장 새 덤프가 hours 안이면 { name, ageMs } · 아니면 null
 *   entries: [{ name, size }] — 0 바이트(실패한 덤프)는 치지 않는다 · 다른 DB 이름은 치지 않는다 · 미래 시각도 치지 않는다
 */
export function freshBackup(entries, db, hours, now = Date.now()) {
  if (!(hours > 0)) return null;
  let best = null;
  for (const { name, size } of entries) {
    const m = BACKUP_RE.exec(name);
    if (!m || m[1] !== db || !(size > 0)) continue;
    const t = stampMs(name);
    if (t === null || t > now + 60_000) continue;
    if (!best || t > best.t) best = { name, t };
  }
  if (!best) return null;
  const ageMs = now - best.t;
  return ageMs <= hours * 3_600_000 ? { name: best.name, ageMs } : null;
}
