// =============================================================================
// ★★★ 완벽한 원 (R051 · D-237) — 한 번에 그린 원의 원다움
//
// ★ 찬종: "한 번에 그린 원의 원다움".
// ★ 3판 · 판마다 8초. 빈 캔버스에 **한 번에**(누른 채 → 뗌) 그린다 · 뗀 순간 제출(한 번만) · 8초 안에 못 떼면 그때까지의 선.
// ★ 점수 = 원다움 %(클수록 좋다) — **서버가 점 배열로 다시 계산한다**(클라이언트 값은 안 믿는다):
//   1) 선을 길이 기준으로 고르게 다시 뽑는다(128점 — 천천히 그린 곳이 점수를 독차지하지 않게)
//   2) 최소제곱 원 맞춤(Kasa) → 중심 · 반지름 R
//   3) 반지름 대비 평균 편차 dev = mean(|거리 − R|) / R → 기본 = 100 × (1 − 4·dev) (편차 0 = 100 · 편차 25% = 0)
//   4) 각도 커버(중심에서 본 가장 큰 빈틈을 뺀 각) 320° 미만이면 × (커버/320)² — "덜 닫힘"
//   5) 지름이 캔버스 짧은 변의 15% 미만이면 0 — "너무 작음" · 반지름이 캔버스보다 훨씬 크면(거의 직선) 0
// ★ 좌표: 캔버스(정사각형) 0~1 · t = 판 시작부터 기기 ms. 점 20개 이상 · t 는 줄지 않음 · 8초(+0.2초) 안.
// =============================================================================

export const CIRCLE_ROUNDS = 3;
export const CIRCLE_PLAY_MS = 8_000;
export const CIRCLE_MIN_POINTS = 20;
/** 보낼 수 있는 점 최대 (화면이 이보다 많으면 솎아서 보낸다) */
export const CIRCLE_MAX_POINTS = 1_200;
export const CIRCLE_MIN_DIAMETER = 0.15;
export const CIRCLE_CLOSE_DEG = 320;
export const CIRCLE_DEV_WEIGHT = 4;
const RESAMPLE = 128;

export interface CircleFit {
  /** 원다움 % (0~100) */
  score: number;
  cx: number;
  cy: number;
  r: number;
  /** 각도 커버(°) */
  coverageDeg: number;
  /** 반지름 대비 평균 편차 (0~) */
  dev: number;
  /** 감점 이유 */
  flaw: 'small' | 'open' | 'line' | null;
}

const ZERO: CircleFit = { score: 0, cx: 0.5, cy: 0.5, r: 0, coverageDeg: 0, dev: 1, flaw: 'line' };

/** 길이 기준으로 고르게 n 점 */
export function resampleStroke(pts: readonly { x: number; y: number }[], n = RESAMPLE): { x: number; y: number }[] {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = cum[cum.length - 1]!;
  if (total <= 0) return [{ x: pts[0]!.x, y: pts[0]!.y }];
  const out: { x: number; y: number }[] = [];
  let j = 1;
  for (let k = 0; k < n; k += 1) {
    const d = (total * k) / (n - 1);
    while (j < pts.length - 1 && cum[j]! < d) j += 1;
    const seg = cum[j]! - cum[j - 1]!;
    const f = seg > 0 ? Math.min(1, (d - cum[j - 1]!) / seg) : 0;
    out.push({ x: pts[j - 1]!.x + (pts[j]!.x - pts[j - 1]!.x) * f, y: pts[j - 1]!.y + (pts[j]!.y - pts[j - 1]!.y) * f });
  }
  return out;
}

/** 최소제곱 원 (Kasa) — 점이 한 줄이면 null */
export function fitCircle(pts: readonly { x: number; y: number }[]): { cx: number; cy: number; r: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const a = (suuu + suvv) / 2;
  const b = (svvv + svuu) / 2;
  const uc = (a * svv - b * suv) / det;
  const vc = (b * suu - a * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  if (!Number.isFinite(r)) return null;
  return { cx: uc + mx, cy: vc + my, r };
}

/** 원다움 채점 (서버 · 화면이 같은 함수) */
export function circleScore(points: readonly { x: number; y: number }[]): CircleFit {
  const pts = resampleStroke(points);
  if (pts.length < 3) return ZERO;
  const fit = fitCircle(pts);
  if (!fit || fit.r <= 0) return ZERO;
  const { cx, cy, r } = fit;
  let sum = 0;
  const angs: number[] = [];
  for (const p of pts) {
    sum += Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
    angs.push(Math.atan2(p.y - cy, p.x - cx));
  }
  const dev = sum / pts.length / r;
  angs.sort((x, y) => x - y);
  let maxGap = angs[0]! + 2 * Math.PI - angs[angs.length - 1]!;
  for (let i = 1; i < angs.length; i += 1) maxGap = Math.max(maxGap, angs[i]! - angs[i - 1]!);
  const coverageDeg = Math.max(0, 360 - (maxGap * 180) / Math.PI);
  if (r > 1.5) return { score: 0, cx, cy, r, coverageDeg, dev, flaw: 'line' };
  if (2 * r < CIRCLE_MIN_DIAMETER) return { score: 0, cx, cy, r, coverageDeg, dev, flaw: 'small' };
  let score = 100 * Math.max(0, 1 - CIRCLE_DEV_WEIGHT * dev);
  let flaw: CircleFit['flaw'] = null;
  if (coverageDeg < CIRCLE_CLOSE_DEG) {
    score *= (coverageDeg / CIRCLE_CLOSE_DEG) ** 2;
    flaw = 'open';
  }
  return { score: Math.round(score * 10_000) / 10_000, cx, cy, r, coverageDeg, dev, flaw };
}

/** 받은 점 검사 — 틀리면 이유, 맞으면 null. 점 = [x, y, t] */
export function circlePointsProblem(raw: unknown, playMs: number): string | null {
  if (!Array.isArray(raw)) return 'not_array';
  if (raw.length < CIRCLE_MIN_POINTS) return 'too_few';
  if (raw.length > CIRCLE_MAX_POINTS) return 'too_many';
  let prevT = -Infinity;
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 3) return 'bad_point';
    const [x, y, t] = p as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number' || typeof t !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) return 'bad_point';
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return 'out_of_canvas';
    if (t < 0 || t < prevT) return 'time_not_increasing';
    if (t > playMs + 200) return 'too_late';
    prevT = t;
  }
  return null;
}

/** 결과 화면에 보낼 선 (솎음 — 64점 · 소수 셋째 자리) */
export function circleThumb(points: readonly { x: number; y: number }[]): [number, number][] {
  return resampleStroke(points, 64).map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);
}
