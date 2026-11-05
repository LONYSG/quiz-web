// =============================================================================
// ★★ R074 (§F ① · 찬종 11-05 디스크 8.1GB 중 백업 6.1GB = 덤프 78개) — 백업 자동 정리: 판단만(파일 지우기는 부르는 쪽)
//   backups/quizweb-YYYYMMDD-HHmmss.dump 중 **최신 N 개만** 남긴다(기본 5 · BACKUP_KEEP · --keep N · 0 = 정리 안 함).
//   ★ minigame-*.zip 등 다른 파일은 건드리지 않는다(이름 꼴이 다르다).
// =============================================================================
export const BACKUP_RE = /^quizweb-\d{8}-\d{6}\.dump$/;
export const DEFAULT_KEEP = 5;

/** 남길 개수 — --keep N > BACKUP_KEEP > 5 · 이상한 값은 기본 */
export function keepCount(argv, env) {
  const i = argv.indexOf('--keep');
  const raw = i >= 0 ? argv[i + 1] : env.BACKUP_KEEP;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_KEEP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_KEEP;
}

/** 지울 파일 이름(이름 = 시각이라 이름순 = 시각순) · keep 0 이면 없음 */
export function pickPrune(names, keep) {
  if (!(keep > 0)) return [];
  const dumps = names.filter((n) => BACKUP_RE.test(n)).sort();
  return dumps.slice(0, Math.max(0, dumps.length - keep));
}
