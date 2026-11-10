// =============================================================================
// ★★★ 주제 세트 저장소 (R080 · D-337 · 0031 · docs/18 §9)
//
// ★ 적재본(topic_sets · topic_items — scripts/topics-load.mjs 가 verified 만 넣는다)을 게임 시작 때 메모리로(loadQuizData 꼴 · 60초 캐시).
//   세트마다 판정 맵(정규화 · flexCanon → 항목 id)을 미리 만든다 — 판정 블록에서 await 하지 않는다.
// ★ 표가 없으면(0031 미적용) 빈 저장소 — 많이 말하기 · 겹치면 무효만 빠진다(게임 시작은 막지 않는다).
// =============================================================================

import { ORDER_EXCLUDE, ORDER_MIN_YEARS, TOPIC_BINGO_MIN, TOPIC_MIN_ITEMS, buildTopicMatcher, normalizeAnswer, topicLabel } from '@quiz/shared';
import { query } from './pool.js';

export interface TopicItem {
  id: string;
  name: string;
  label: string;
  variants: string[];
  /** ★ R081 — 연도(순서대로) */
  year: number | null;
  /** ★ R082 — 라이어 제시어로 좋은가 · 그림으로 그릴 수 있나(캐치마인드 — R083) */
  liar: boolean;
  draw: boolean;
  /** ★ R088 (0034 · 18 §12) — 바보형 단어 · 시대 · 소분류 · 난이도(없으면 null) */
  fool: string[] | null;
  era: 'classic' | 'modern' | null;
  sub: string | null;
  diff: number | null;
}

export interface TopicSet {
  topic: string;
  nameKo: string;
  kind: 'closed' | 'open';
  timeSec: number;
  /** ★ R088 — 머리 플래그(라이어 · 캐치마인드 세트) · 정답 범위 한 줄 */
  liar: boolean;
  draw: boolean;
  scope: string | null;
  /** ★ R090 (0035) — 같은 group 의 세트는 주제 자동 추첨에서 한 자리 · 방장 주제 고르기 기본 해제 */
  group: string | null;
  optIn: boolean;
  items: TopicItem[];
  matcher: Map<string, string>;
  /** ★ R088 — 세트 안 겹치는 꼬리 이름(정규화 열쇠 → 안내 글 "어느 서구? …") — 판정은 오답 · 본인에게 안내 */
  ambiguous: Map<string, string>;
}

export interface TopicStore {
  sets: TopicSet[];
  loadedAt: number;
}

let cache: TopicStore | null = null;
// ★ R081 — 검사(봇 topicsets)는 0 으로 — 세트를 바꿔 가며 연달아 본다
const TTL_MS = Number(process.env.TOPIC_CACHE_MS ?? 60_000);

type ItemIn = { id: string; name: string; label?: string | null; variants?: string[]; year?: number | null; liar?: boolean; draw?: boolean; fool?: string[] | null; era?: string | null; sub?: string | null; diff?: number | null };

export function makeTopicSet(h: { topic: string; nameKo: string; kind: 'closed' | 'open'; timeSec?: number | null; liar?: boolean; draw?: boolean; scope?: string | null; group?: string | null; optIn?: boolean }, items: ItemIn[]): TopicSet {
  const its: TopicItem[] = items.map((x) => ({
    id: x.id,
    name: x.name,
    label: topicLabel(x),
    variants: x.variants ?? [],
    year: Number.isInteger(x.year) ? (x.year as number) : null,
    liar: x.liar === true,
    draw: x.draw === true,
    fool: Array.isArray(x.fool) && x.fool.length ? x.fool.filter((s) => typeof s === 'string' && s.trim()) : null,
    era: x.era === 'classic' || x.era === 'modern' ? x.era : null,
    sub: typeof x.sub === 'string' ? x.sub : null,
    diff: Number.isInteger(x.diff) ? (x.diff as number) : null,
  }));
  const matcher = buildTopicMatcher(its);
  return {
    topic: h.topic,
    nameKo: h.nameKo,
    kind: h.kind,
    timeSec: h.timeSec && h.timeSec > 0 ? h.timeSec : 30,
    // ★ 옛 호출(머리 플래그 모름)은 항목 플래그로
    liar: h.liar ?? its.some((x) => x.liar),
    draw: h.draw ?? its.some((x) => x.draw),
    scope: typeof h.scope === 'string' && h.scope.trim() ? h.scope.trim() : null,
    group: typeof h.group === 'string' && h.group ? h.group : null,
    optIn: h.optIn === true,
    items: its,
    matcher,
    ambiguous: topicAmbiguous(its, matcher),
  };
}

export async function loadTopicStore(force = false): Promise<TopicStore> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  try {
    const [s, it] = await Promise.all([
      // ★ R088 — 0034 칸(scope · fool · era · sub · diff)은 있으면(to_jsonb 로 꺼내 0034 전 DB 에서도 같은 SQL)
      query<{ topic: string; name_ko: string; kind: 'closed' | 'open'; time_sec: number; liar: boolean; draw: boolean; scope: string | null; grp: string | null; opt_in: string | null }>(
        `SELECT topic, name_ko, kind, time_sec, liar, draw, to_jsonb(s)->>'scope' AS scope, to_jsonb(s)->>'group' AS grp, to_jsonb(s)->>'opt_in' AS opt_in FROM topic_sets s WHERE active ORDER BY topic`,
      ),
      query<{ id: string; topic: string; name: string; label: string | null; variants: string[]; year: number | null; liar: boolean; draw: boolean; fool: string[] | null; era: string | null; sub: string | null; diff: number | null }>(
        `SELECT id, topic, name, label, variants, year, liar, draw, to_jsonb(t)->'fool' AS fool, to_jsonb(t)->>'era' AS era, to_jsonb(t)->>'sub' AS sub, (to_jsonb(t)->>'diff')::int AS diff
           FROM topic_items t WHERE active ORDER BY topic, seq`,
      ),
    ]);
    const by = new Map<string, ItemIn[]>();
    for (const r of it.rows) {
      let arr = by.get(r.topic);
      if (!arr) by.set(r.topic, (arr = []));
      arr.push({ id: r.id, name: r.name, label: r.label, variants: Array.isArray(r.variants) ? r.variants : [], year: r.year, liar: r.liar, draw: r.draw, fool: Array.isArray(r.fool) ? r.fool : null, era: r.era, sub: r.sub, diff: r.diff });
    }
    cache = { sets: s.rows.map((r) => makeTopicSet({ topic: r.topic, nameKo: r.name_ko, kind: r.kind, timeSec: r.time_sec, liar: r.liar, draw: r.draw, scope: r.scope, group: r.grp, optIn: r.opt_in === 'true' }, by.get(r.topic) ?? [])), loadedAt: Date.now() };
  } catch (err) {
    // 42P01 = 표 없음(0031 전) — 빈 저장소
    if ((err as { code?: string }).code !== '42P01') throw err;
    cache = { sets: [], loadedAt: Date.now() };
  }
  return cache;
}

/** 검사용 — 캐시 비우기 */
export function clearTopicCache(): void {
  cache = null;
}

/** 많이 말하기 · 겹치면 무효에 쓸 수 있는 세트(closed · 항목 20 이상) */
export function playableTopics(store: TopicStore | null | undefined): TopicSet[] {
  return (store?.sets ?? []).filter((s) => s.kind === 'closed' && s.items.length >= TOPIC_MIN_ITEMS);
}

/** ★ R081 — 순서대로: closed · 서로 다른 연도 ORDER_MIN_YEARS 이상 · ORDER_EXCLUDE 아님 */
export function orderTopics(store: TopicStore | null | undefined): TopicSet[] {
  return (store?.sets ?? []).filter(
    (s) => s.kind === 'closed' && !ORDER_EXCLUDE.includes(s.topic) && new Set(s.items.map((x) => x.year).filter((y) => y !== null)).size >= ORDER_MIN_YEARS,
  );
}

/** ★ R081 — 빙고: closed · 항목 TOPIC_BINGO_MIN 이상 */
export function bingoTopics(store: TopicStore | null | undefined): TopicSet[] {
  return (store?.sets ?? []).filter((s) => s.kind === 'closed' && s.items.length >= TOPIC_BINGO_MIN);
}

/** ★ R082 — 라이어 제시어가 있는 세트 · ★ R088 (18 §12) 머리 liar 가 true 인 open 세트만(closed 는 데이터가 이미 끔 — 코드로도) */
export function liarTopics(store: TopicStore | null | undefined): TopicSet[] {
  return (store?.sets ?? []).filter((s) => s.kind === 'open' && s.liar && s.items.some((x) => x.liar));
}

/** ★ R083 — 캐치마인드 제시어가 있는 세트 · ★ R088 머리 draw 가 true 인 open 세트만 */
export function drawTopics(store: TopicStore | null | undefined): TopicSet[] {
  return (store?.sets ?? []).filter((s) => s.kind === 'open' && s.draw && s.items.some((x) => x.draw));
}

/**
 * ★ R088 (D-345 · 찬종 "중복 정답이 존재하는 경우('서구') 앞 동네도 같이 적도록 안내 · 오답 처리")
 *   세트 안 항목 이름의 마지막 낱말(띄어쓰기 뒤)이 둘 이상 항목에 걸리고, 그 꼴이 어느 항목의 판정 열쇠도 아니면 "겹치는 이름".
 *   "서구"(부산 서구 · 대구 서구 …) · "고성군"(강원 · 경남) · 끝 글자 구/군/시 를 뗀 꼴("고성")도(2자 이상).
 */
export function topicAmbiguous(items: readonly Pick<TopicItem, 'name'>[], matcher: ReadonlyMap<string, string>): Map<string, string> {
  const count = new Map<string, { n: number; shown: string; example: string }>();
  const add = (shown: string, example: string) => {
    const k = normalizeAnswer(shown);
    if (k.length < 2) return;
    const c = count.get(k);
    if (c) c.n += 1;
    else count.set(k, { n: 1, shown, example });
  };
  for (const it of items) {
    const parts = it.name.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const tail = parts[parts.length - 1]!;
    add(tail, it.name);
    const short = tail.replace(/[구군시]$/, '');
    if (short !== tail) add(short, it.name);
  }
  const out = new Map<string, string>();
  // ★ R090 (D-347 · 찬종 "그건 정답 스포 아니야?") — 실제 지명 예시를 뺀다(어느 것이 정답인지 · 몇 곳인지 알려 주지 않음)
  for (const [k, c] of count) if (c.n >= 2 && !matcher.has(k)) out.set(k, `'${c.shown}' — 같은 이름이 여러 곳이에요. 앞에 시·도 이름을 붙여 주세요`);
  return out;
}

/** ★ R088 — 입력이 겹치는 이름이면 안내 글(아니면 null) */
export function ambiguousHint(ambiguous: ReadonlyMap<string, string> | null | undefined, raw: string): string | null {
  if (!ambiguous || ambiguous.size === 0) return null;
  return ambiguous.get(normalizeAnswer(String(raw ?? ''))) ?? null;
}

/** 게임 키 → 쓸 수 있는 세트 */
export function topicsForKey(key: string, store: TopicStore | null | undefined): TopicSet[] {
  return key === 'order' ? orderTopics(store) : key === 'bingo' ? bingoTopics(store) : playableTopics(store);
}
