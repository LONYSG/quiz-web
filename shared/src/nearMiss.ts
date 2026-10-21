// =============================================================================
// ★★ 근접 오답 (R058 · A83 (나) · D-252)
//
// ★ 왜 — R057 복수정답 측정에서 "틀린 제출로 유형 세기" 를 할 수 없었다(answer_events 는 맞은 제출만 · 채팅은 DB 에 남기지 않는다).
//   → **정답에 가까운 틀린 제출만** 정규화 글로 남겨 복수정답 보강(GEN 변형 추가)의 근거로 쓴다.
// ★ 가깝다 = 정규화 글이 정답 집합 중 하나를
//   (1) 포함한다(contains — "이순신이다" ⊃ "이순신" · 정답 2자 이상)
//   (2) 포함된다(contained — "이순" ⊂ "이순신" · 제출 2자 이상)
//   (3) 편집 거리 ≤ 2(edit — 정답 2자면 ≤ 1 · 1자 정답은 보지 않는다)
// ★ 판정에는 쓰지 않는다(오타 허용 · 유사도 판정 없음 — 01 10장). 기록만 한다.
// =============================================================================

/** 편집 거리 상한 */
export const NEAR_MISS_MAX_EDIT = 2;
/** 정규화 글 길이 상한(글자) — 긴 잡담은 남기지 않는다 */
export const NEAR_MISS_MAX_LEN = 40;
/** 한 판 한 문제 한 사람 최대 행 */
export const NEAR_MISS_PER_QUESTION = 5;
/** 보관 일수(서버 부팅 때 지난 것을 지운다) */
export const NEAR_MISS_KEEP_DAYS = 90;
/** 봇 · 검사 계정(남기지 않는다) — 서버는 NEAR_MISS_SKIP_LOGIN 으로 덮어쓸 수 있다(검사용) */
export const NEAR_MISS_SKIP_LOGIN = '^(bot|uic|r10_)';

export type NearMissKind = 'contains' | 'contained' | 'edit';

export interface NearMiss {
  /** 가장 가까운 정답(정규화) */
  answer: string;
  /** 편집 거리(포함 · 포함됨이면 길이 차) */
  distance: number;
  kind: NearMissKind;
}

/** 편집 거리(글자 = 코드 포인트). max 를 넘으면 null */
export function editDistanceWithin(a: string, b: string, max: number): number | null {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > max) return null;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j += 1) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return null;
    prev = cur;
  }
  const d = prev[y.length]!;
  return d <= max ? d : null;
}

/**
 * 정규화된 제출 글이 정답 집합 중 하나에 가까운가 — 가장 가까운 것(거리가 같으면 포함 · 포함됨 먼저).
 * ★ 정답과 같으면(맞은 제출) null · 빈 글 · 40자 넘는 글도 null.
 */
export function nearestAnswer(norm: string, answers: Iterable<string>): NearMiss | null {
  const n = [...norm].length;
  if (n === 0 || n > NEAR_MISS_MAX_LEN) return null;
  let best: NearMiss | null = null;
  const take = (m: NearMiss) => {
    if (!best || m.distance < best.distance || (m.distance === best.distance && best.kind === 'edit' && m.kind !== 'edit')) best = m;
  };
  for (const ans of answers) {
    if (!ans) continue;
    if (ans === norm) return null;
    const a = [...ans].length;
    if (a >= 2 && n > a && norm.includes(ans)) take({ answer: ans, distance: n - a, kind: 'contains' });
    else if (n >= 2 && a > n && ans.includes(norm)) take({ answer: ans, distance: a - n, kind: 'contained' });
    else if (a >= 2 && n >= 2) {
      const d = editDistanceWithin(norm, ans, Math.min(NEAR_MISS_MAX_EDIT, a - 1));
      if (d !== null) take({ answer: ans, distance: d, kind: 'edit' });
    }
  }
  return best;
}
