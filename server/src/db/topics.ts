// =============================================================================
// ★★★ 주제 세트 저장소 (R080 · D-337 · 0031 · docs/18 §9)
//
// ★ 적재본(topic_sets · topic_items — scripts/topics-load.mjs 가 verified 만 넣는다)을 게임 시작 때 메모리로(loadQuizData 꼴 · 60초 캐시).
//   세트마다 판정 맵(정규화 · flexCanon → 항목 id)을 미리 만든다 — 판정 블록에서 await 하지 않는다.
// ★ 표가 없으면(0031 미적용) 빈 저장소 — 많이 말하기 · 겹치면 무효만 빠진다(게임 시작은 막지 않는다).
// =============================================================================

import { ORDER_EXCLUDE, ORDER_MIN_YEARS, TOPIC_BINGO_MIN, TOPIC_MIN_ITEMS, buildTopicMatcher, topicLabel } from '@quiz/shared';
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
}

export interface TopicSet {
  topic: string;
  nameKo: string;
  kind: 'closed' | 'open';
  timeSec: number;
  items: TopicItem[];
  matcher: Map<string, string>;
}

export interface TopicStore {
  sets: TopicSet[];
  loadedAt: number;
}

let cache: TopicStore | null = null;
// ★ R081 — 검사(봇 topicsets)는 0 으로 — 세트를 바꿔 가며 연달아 본다
const TTL_MS = Number(process.env.TOPIC_CACHE_MS ?? 60_000);

export function makeTopicSet(h: { topic: string; nameKo: string; kind: 'closed' | 'open'; timeSec?: number | null }, items: { id: string; name: string; label?: string | null; variants?: string[]; year?: number | null; liar?: boolean; draw?: boolean }[]): TopicSet {
  const its = items.map((x) => ({ id: x.id, name: x.name, label: topicLabel(x), variants: x.variants ?? [], year: Number.isInteger(x.year) ? (x.year as number) : null, liar: x.liar === true, draw: x.draw === true }));
  return { topic: h.topic, nameKo: h.nameKo, kind: h.kind, timeSec: h.timeSec && h.timeSec > 0 ? h.timeSec : 30, items: its, matcher: buildTopicMatcher(its) };
}

export async function loadTopicStore(force = false): Promise<TopicStore> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  try {
    const [s, it] = await Promise.all([
      query<{ topic: string; name_ko: string; kind: 'closed' | 'open'; time_sec: number }>(`SELECT topic, name_ko, kind, time_sec FROM topic_sets WHERE active ORDER BY topic`),
      query<{ id: string; topic: string; name: string; label: string | null; variants: string[]; year: number | null; liar: boolean; draw: boolean }>(
        `SELECT id, topic, name, label, variants, year, liar, draw FROM topic_items WHERE active ORDER BY topic, seq`,
      ),
    ]);
    const by = new Map<string, { id: string; name: string; label: string | null; variants: string[]; year: number | null; liar: boolean; draw: boolean }[]>();
    for (const r of it.rows) {
      let arr = by.get(r.topic);
      if (!arr) by.set(r.topic, (arr = []));
      arr.push({ id: r.id, name: r.name, label: r.label, variants: Array.isArray(r.variants) ? r.variants : [], year: r.year, liar: r.liar, draw: r.draw });
    }
    cache = { sets: s.rows.map((r) => makeTopicSet({ topic: r.topic, nameKo: r.name_ko, kind: r.kind, timeSec: r.time_sec }, by.get(r.topic) ?? [])), loadedAt: Date.now() };
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

/** ★ R082 — 라이어 제시어가 있는 세트(liar 항목 1개 이상 · open/closed 둘 다) */
export function liarTopics(store: TopicStore | null | undefined): TopicSet[] {
  return (store?.sets ?? []).filter((s) => s.items.some((x) => x.liar));
}

/** 게임 키 → 쓸 수 있는 세트 */
export function topicsForKey(key: string, store: TopicStore | null | undefined): TopicSet[] {
  return key === 'order' ? orderTopics(store) : key === 'bingo' ? bingoTopics(store) : playableTopics(store);
}
