// =============================================================================
// ★★ R074 (§F ① · 찬종 11-05 디스크 8.1GB 중 백업 6.1GB = 덤프 78개) — 백업 자동 정리: 판단만(파일 지우기는 부르는 쪽)
//   backups/<DB>-YYYYMMDD-HHmmss.dump 중 DB 이름마다 **최신 N 개만** 남긴다(기본 5 · BACKUP_KEEP · --keep N · 0 = 정리 안 함).
//   ★ minigame-*.zip 등 다른 파일은 건드리지 않는다(이름 꼴이 다르다).
// =============================================================================
// ★★ R095 (D-352) — 파일 이름 = <DB 이름>-YYYYMMDD-HHmmss.dump(quizweb-… · quizweb_dev-…) · "최신 N" 은 **같은 DB 이름끼리만** 센다
//   (G060 사고: dev 백업도 quizweb-* 이름이라 정리에 섞여 실 백업 quizweb-20261110-221145 가 지워짐)
export const BACKUP_RE = /^([A-Za-z0-9_]+)-\d{8}-\d{6}\.dump$/;
export const DEFAULT_KEEP = 5;

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

/** 남길 개수 — --keep N > BACKUP_KEEP > 5 · 이상한 값은 기본 */
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
