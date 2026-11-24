// =============================================================================
// 출제 풀 로드 (Phase 3)
//
// ★★ 왜 게임 시작 때 한 번에 읽는가 (04-PROTOCOL 3장 / D-054)
//   문제 선정은 매 문제마다 일어나고, 그 절차는 **30초 타이머가 시작되기 전에**
//   끝나야 한다. 매 문제마다 DB 를 다시 읽으면 그 절차가 느려진다.
//   ★ 그리고 정답 중복 검사(Q-76)는 정답 집합의 교집합 연산이다.
//     문자열 Set 교집합은 메모리에서 즉시 끝난다. 수천 건이어도 문제되지 않는다.
//
// ★ 출제 대상의 정의는 db/questions.ts 와 **같아야 한다.**
//   ★ 조건이 어긋나면 "출제 가능 수" 검증을 통과했는데 선정에서 못 찾는 일이 생긴다.
//   → POOL_WHERE 를 그 파일에서 가져온다. 문자열을 복사하지 않는다.
//
// ★ 판정에 쓰는 정규화 정답은 DB 의 question_answers.answer_norm 을 그대로 쓴다.
//   ★ 적재 시점에 shared/normalizeAnswer() 로 만든 값이다. 서버가 다시 계산하지 않는다.
//     ★ 다시 계산하면 정규화 버전이 바뀌었을 때 DB 와 메모리가 조용히 갈라진다.
// =============================================================================

import { levelScores } from '@quiz/shared';
import { query } from './pool.js';
import { experienceWindowSql, filterParams, filterWhere, POOL_WHERE, type PoolFilter } from './questions.js';

/**
 * 출제 풀의 문제 하나.
 *
 * ★ 이 구조체가 게임 진행 중 메모리에 상주한다. 필드를 늘릴 때 주의한다.
 *   10,000 건 × 참가자 10명 규모를 가정한다.
 */
export interface PoolQuestion {
  id: string;
  text: string;
  /** ★ 화면에 보여줄 카테고리. **대분류**다 (R012 3-3 확정: 소분류 이름은 힌트가 된다) */
  categoryName: string;
  displayAnswer: string;
  /** 힌트 생성 기준. null 이면 displayAnswer 를 쓴다 */
  hintAnswer: string | null;
  /** ★ 일반 힌트 (R028 / 0008). null 이면 없다 */
  generalHint: string | null;
  explanation: string | null;
  /** ★ 판정에 쓰는 정규화 정답 집합 */
  answersNorm: string[];
  /** ★ 마스킹에 쓰는 원문 표기 (Phase 6) */
  answersRaw: string[];
  /** ★★ R069 — 등급(difficulty_score 1~5 · 비율 출제) · 알가치(questions.worth 1~3 · 판정 전 null = 2 로 친다) */
  grade: number;
  worth: number | null;
  /** ★ R080 — 중분류 id(category_tree.mid_id — 객관식 5연속 보기). 트리가 없으면 null */
  categoryMid?: string | null;
}

// =============================================================================
// ★★★ R110 — 문항 풀 **한 벌**(R108 병목 1 · 2: 판마다 활성 문항 전체를 그 방만을 위해 읽어 방당 11~16MB)
//   서버 전체에 활성 문항 한 벌(PoolQuestion 그대로)을 두고, 방의 설정(난이도 × 분야)은 그 한 벌을 **거른 참조 배열**로 만든다
//   — 문항 객체를 복사하지 않는다. 같은 설정의 거른 배열은 풀이 바뀔 때까지 캐시한다(설정 조합 = 난이도 3 × 분야 부분집합).
//   ★ 거르는 조건은 SQL(POOL_WHERE · filterWhere)과 같은 결과여야 한다 → scripts/pool-equiv.mjs 가 모든 조합에서 id 집합을 대조한다.
//   ★ 언제 다시 읽나: **판 시작 때마다** 지문 한 줄(세 표의 행 수 + xmin 합 · ~5ms)을 보고 달라졌으면 다시 읽는다.
//     xmin = 그 행을 마지막으로 쓴 트랜잭션 번호 → 어떤 칸을 어떤 길로 바꿔도(updated_at 을 안 건드리는 옛 GEN 스크립트 포함) 커밋되면 지문이 바뀐다.
//     세 표 = questions · question_answers · categories(분야 묶음 · 대분류 이름 · category_tree 뷰의 바탕). 되돌린(ROLLBACK) 쓰기는 안 바뀐다.
//   ★ 동시에 여러 방이 시작하면 지문 확인 · 다시 읽기는 **하나만** 돌고 나머지는 그것을 기다린다.
//   ★ 돌고 있는 판은 시작할 때 받은 배열을 끝까지 쓴다(새 풀로 바뀌어도 옛 객체는 그 판이 쥐고 있다).
//   ★ 풀의 객체 · 배열은 함께 본다 — 고치면 다른 방이 깨진다. 검사 서버(QUIZ_TEST_SERVER) · POOL_FREEZE=1 에서는 얼려(Object.freeze) 잡는다.
// =============================================================================

interface SharedPool {
  fp: string;
  all: readonly PoolQuestion[];
  /** all[i] 의 분야 키(category_game_topics · 없으면 null) */
  topicOf: readonly (string | null)[];
  byFilter: Map<string, readonly PoolQuestion[]>;
  approxBytes: number;
}
let shared: SharedPool | null = null;
let inflight: Promise<SharedPool> | null = null;
const FREEZE = process.env.QUIZ_TEST_SERVER === '1' || process.env.POOL_FREEZE === '1';

const FP_SQL = `SELECT (SELECT count(*) || ':' || coalesce(sum(xmin::text::bigint), 0) FROM questions) || '|' ||
                       (SELECT count(*) || ':' || coalesce(sum(xmin::text::bigint), 0) FROM question_answers) || '|' ||
                       (SELECT count(*) || ':' || coalesce(sum(xmin::text::bigint), 0) FROM categories) AS fp`;

/** 출제 풀 지문(세 표의 행 수 + xmin 합) — 바뀌면 다시 읽는다 */
export async function poolFingerprint(): Promise<string> {
  const r = await query<{ fp: string }>(FP_SQL);
  return String(r.rows[0]?.fp ?? '');
}

const FILTER_CACHE_MAX = 64;
const filterKey = (f: PoolFilter) => `${f.level}|${[...f.topics].sort().join(',')}`;

/**
 * ★★★ R110 — 이 설정의 출제 풀(한 벌을 거른 참조 배열 · 복사 없음). 판 시작 때 부른다(판정 블록에서 부르지 않는다 — D-054).
 *   이름은 옛 그대로(start.ts 가 부르는 자리) — 결과는 옛 SQL 길(loadQuestionPoolSql)과 같은 문항 집합이다(pool-equiv).
 */
export async function loadQuestionPool(filter: PoolFilter): Promise<PoolQuestion[]> {
  const p = await ensureSharedPool();
  const key = filterKey(filter);
  let hit = p.byFilter.get(key);
  if (hit) {
    // 최근에 쓴 것을 뒤로(Map 순서 = 오래된 것부터 버린다)
    p.byFilter.delete(key);
    p.byFilter.set(key, hit);
  } else {
    const scores = new Set(levelScores(filter.level));
    const topics = new Set<string>(filter.topics);
    const out: PoolQuestion[] = [];
    for (let i = 0; i < p.all.length; i++) {
      const q = p.all[i]!;
      const t = p.topicOf[i];
      if (scores.has(q.grade) && t != null && topics.has(t)) out.push(q);
    }
    hit = FREEZE ? Object.freeze(out) : out;
    p.byFilter.set(key, hit);
    // ★ 조합은 많아야 381(난이도 3 × 분야 부분집합 127 · 판 기록에 설정이 안 남아 실제 쓰임은 못 셈) · 배열 하나 = 참조뿐(≤ 6,890 × 8B)
    //   → 최근 64개만 둔다(최악 ≈ 3.5MB). 버린 배열도 그것을 쥔 판은 끝까지 쓴다
    if (p.byFilter.size > FILTER_CACHE_MAX) p.byFilter.delete(p.byFilter.keys().next().value!);
  }
  // ★ 타입은 옛 그대로(PoolQuestion[]) — 받는 쪽은 배열을 고치지 않는다(검사 서버에서는 얼어 있어 고치면 바로 깨진다)
  return hit as PoolQuestion[];
}

/** 지금 한 벌(기동 로그 · 검사용) — 아직 안 읽었으면 null */
export function sharedPoolInfo(): { count: number; approxMB: number; filters: number } | null {
  return shared ? { count: shared.all.length, approxMB: Math.round(shared.approxBytes / 1e5) / 10, filters: shared.byFilter.size } : null;
}

/** 지문을 보고 필요하면 다시 읽는다 — 동시에 부르면 하나만 돌고 나머지는 그것을 기다린다 */
export function ensureSharedPool(): Promise<SharedPool> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const fp = await poolFingerprint();
      if (shared && shared.fp === fp) return shared;
      const t0 = Date.now();
      const { questions, topics } = await readPool(null);
      // 읽는 사이에 바뀌었으면 지문을 비워 둔다 → 다음 판 시작 때 다시 읽는다
      const fp2 = await poolFingerprint();
      const approxBytes = estimateBytes(questions);
      if (FREEZE) for (const q of questions) deepFreeze(q);
      shared = { fp: fp2 === fp ? fp : '', all: FREEZE ? Object.freeze(questions) : questions, topicOf: topics, byFilter: new Map(), approxBytes };
      console.log(`[pool] 문항 풀 한 벌 ${questions.length}개 · 약 ${Math.round(approxBytes / 1e5) / 10} MB · ${Date.now() - t0}ms${fp2 === fp ? '' : ' · ★ 읽는 중에 바뀜 — 다음 판에 다시 읽는다'}`);
      return shared;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function deepFreeze(q: PoolQuestion): void {
  Object.freeze(q.answersNorm);
  Object.freeze(q.answersRaw);
  Object.freeze(q);
}

/** 대략 크기(문자열 UTF-16 2바이트 + 객체 머리) — 기동 로그 · 보고용 */
function estimateBytes(qs: readonly PoolQuestion[]): number {
  let n = 0;
  const str = (s: string | null | undefined) => (s ? 2 * s.length + 16 : 0);
  for (const q of qs) {
    n += 120 + str(q.id) + str(q.text) + str(q.categoryName) + str(q.displayAnswer) + str(q.hintAnswer) + str(q.generalHint) + str(q.explanation) + str(q.categoryMid);
    for (const a of q.answersNorm) n += str(a) + 8;
    for (const a of q.answersRaw) n += str(a) + 8;
  }
  return n;
}

/** ★ 옛 길 — 설정마다 SQL 로 거른다(R109 까지 판 시작 때마다 이것을 불렀다). 지금은 대조 검사(pool-equiv)만 쓴다 */
export async function loadQuestionPoolSql(filter: PoolFilter): Promise<PoolQuestion[]> {
  return (await readPool(filter)).questions;
}

/**
 * 출제 대상을 읽는다(filter = null 이면 전체 + 분야 키 · R110).
 *
 * ★ 카테고리 이름은 대분류를 쓴다.
 *   ★ 0003 마이그레이션의 category_tree 뷰가 있으면 그것으로 대분류를 찾고,
 *     없으면(레거시 플랫 카테고리) 그 카테고리 이름을 그대로 쓴다.
 *   ★ 뷰가 없다고 게임이 멈추면 안 되므로 두 경로를 모두 둔다.
 */
async function readPool(filter: PoolFilter | null): Promise<{ questions: PoolQuestion[]; topics: (string | null)[] }> {
  const viewCheck = await query<{ n: number }>(
    `SELECT 1 AS n FROM information_schema.views WHERE table_name = 'category_tree'`,
  );
  const hasTree = (viewCheck.rowCount ?? 0) > 0;

  // ★★ R028 — 일반 힌트 열(0008)이 있는지 본다.
  //   ★ 없으면 NULL 로 읽는다. 마이그레이션을 깜빡 안 돌렸다고 **게임 시작이 실패하면 안 된다**
  //     (출제 풀 로드가 실패하면 게임을 시작하지 않는다 — D-059).
  const hintColCheck = await query<{ n: number }>(
    `SELECT 1 AS n FROM information_schema.columns
      WHERE table_name = 'questions' AND column_name = 'general_hint'`,
  );
  const generalHintExpr = (hintColCheck.rowCount ?? 0) > 0 ? 'q.general_hint' : 'NULL::text';
  // ★ R069 — 알가치 열(0026)도 없으면 NULL(= 2) 로 읽는다(마이그레이션 전이라고 시작이 실패하면 안 된다)
  const worthColCheck = await query<{ n: number }>(
    `SELECT 1 AS n FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'worth'`,
  );
  const worthExpr = (worthColCheck.rowCount ?? 0) > 0 ? 'q.worth' : 'NULL::smallint';
  if ((hintColCheck.rowCount ?? 0) === 0) {
    console.warn('[pool] ★ questions.general_hint 열이 없다 (0008 미적용). 일반 힌트 없이 진행한다 — npm run db:migrate');
  }

  // ★ 대분류 이름을 고르는 식.
  //   ★ category_tree 뷰(0003)는 리프(level 3)에 대해 major_name 을 준다.
  //     조인 키는 category_id 다 (id 가 아니다 — 실측에서 이것 때문에 한 번 깨졌다).
  //   ★ 레거시 플랫 카테고리(level 0)는 뷰에 없으므로 자기 이름을 쓴다.
  const categoryExpr = hasTree ? `coalesce(t.major_name, c.name_ko)` : `c.name_ko`;
  const treeJoin = hasTree
    ? `LEFT JOIN category_tree t ON t.category_id = q.category_id`
    : '';

  const rows = await query<{
    id: string;
    question_text: string;
    category_name: string;
    display_answer: string;
    hint_answer: string | null;
    general_hint: string | null;
    explanation: string | null;
    answers_norm: string[];
    answers_raw: string[];
    grade: number;
    worth: number | null;
    category_mid: string | null;
    game_topic: string | null;
  }>(
    `SELECT q.id::text                        AS id,
            q.question_text,
            ${categoryExpr}                   AS category_name,
            q.display_answer,
            q.hint_answer,
            ${generalHintExpr}                AS general_hint,
            q.explanation,
            q.difficulty_score                AS grade,
            ${worthExpr}                      AS worth,
            ${hasTree ? 't.mid_id::text' : 'NULL::text'} AS category_mid,
            -- ★ 정답을 한 번의 쿼리로 모은다. 문제마다 따로 조회하면 N+1 이 된다
            coalesce(a.norms, '{}')           AS answers_norm,
            coalesce(a.raws,  '{}')           AS answers_raw,
            -- ★ R110 — 한 벌을 읽을 때만 분야 키(거르기를 코드가 한다 · topicWhere 와 같은 뷰)
            ${filter ? 'NULL::text' : '(SELECT g.game_topic FROM category_game_topics g WHERE g.category_id = q.category_id)'} AS game_topic
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       ${treeJoin}
       LEFT JOIN (
         SELECT question_id,
                array_agg(answer_norm) AS norms,
                array_agg(answer_text) AS raws
           FROM question_answers
          GROUP BY question_id
       ) a ON a.question_id = q.id
      WHERE ${POOL_WHERE}
        -- ★★ R025 / R034 — 선택한 난이도 × 분야만. countAvailableQuestions 와 같은 조건이다
        ${filter ? `AND ${filterWhere(1)}` : ''}`,
    // ★ R110 — ORDER BY 를 넣지 않는다: 옛 길(설정마다 SQL)과 같은 읽기 순서를 지켜 같은 씨앗 → 같은 뽑기(pool-equiv 가 순서까지 대조)
    filter ? filterParams(filter) : [],
  );

  const out: PoolQuestion[] = [];
  const topics: (string | null)[] = [];
  for (const r of rows.rows) {
    // ★ 정답이 하나도 없는 문제는 출제하지 않는다.
    //   ★ 아무도 맞힐 수 없고, 시간 종료로만 끝난다. 조용히 넣으면 원인을 찾기 어렵다.
    const norms = (r.answers_norm ?? []).filter((s) => typeof s === 'string' && s.length > 0);
    if (norms.length === 0) {
      console.warn(`[pool] ★ 정답이 없는 문제를 제외했다: #${r.id} ${r.question_text}`);
      continue;
    }
    out.push({
      id: r.id,
      text: r.question_text,
      categoryName: r.category_name ?? '기타',
      displayAnswer: r.display_answer,
      hintAnswer: r.hint_answer,
      // ★ 공백뿐인 값은 힌트 없음으로 본다 (0008 CHECK 가 막지만 방어한다)
      generalHint: r.general_hint && r.general_hint.trim().length > 0 ? r.general_hint.trim() : null,
      explanation: r.explanation,
      answersNorm: norms,
      answersRaw: (r.answers_raw ?? []).filter((s) => typeof s === 'string' && s.length > 0),
      grade: Number(r.grade),
      worth: r.worth === null || r.worth === undefined ? null : Number(r.worth),
      categoryMid: r.category_mid ?? null,
    });
    topics.push(r.game_topic ?? null);
  }
  return { questions: out, topics };
}

/**
 * 계정별 경험한 문제 id 집합.
 *
 * ★ 문제 선정(전원 미경험 / 1명 이상 미경험)과 경험자 배지에 둘 다 쓴다.
 * ★ 출제 대상인 문제만 담는다. 비활성 문제의 경험은 선정에 영향을 주지 않는다.
 *
 * ★ 중간 참가자가 들어오면 그 사람 것만 따로 불러 합친다.
 *   ★ 그 호출은 join 핸들러에서 일어난다. 판정 블록이 아니므로 await 가 허용된다.
 */
export async function loadExperienced(
  accountIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const id of accountIds) out.set(id, new Set());
  if (accountIds.length === 0) return out;

  const rows = await query<{ account_id: string; question_id: string }>(
    `SELECT qe.account_id::text AS account_id, qe.question_id::text AS question_id
       FROM question_experiences qe
       JOIN questions q ON q.id = qe.question_id
      WHERE qe.account_id = ANY($1::bigint[])
        AND ${POOL_WHERE}${experienceWindowSql('qe')}`,
    [accountIds],
  );
  for (const r of rows.rows) {
    let set = out.get(r.account_id);
    if (!set) {
      set = new Set();
      out.set(r.account_id, set);
    }
    set.add(r.question_id);
  }
  return out;
}

// =============================================================================
// ★★★ R118 (docs/24 4-1 · 4-3) — 솔로 풀: 같은 한 벌에서 분야가 있는 문항 전부 · 알가치 1 뺌 · 등급별(참조만 · 복사 없음)
//   한 벌이 바뀌면(지문) 다시 만든다 — 판 시작 때 부른다(판정 블록이 아니다).
// =============================================================================
let soloCache: { all: readonly PoolQuestion[]; byGrade: Map<number, PoolQuestion[]> } | null = null;
export async function loadSoloPool(build: (all: readonly PoolQuestion[], topicOf: readonly (string | null)[]) => Map<number, PoolQuestion[]>): Promise<ReadonlyMap<number, readonly PoolQuestion[]>> {
  const p = await ensureSharedPool();
  if (!soloCache || soloCache.all !== p.all) soloCache = { all: p.all, byGrade: build(p.all, p.topicOf) };
  return soloCache.byGrade;
}
