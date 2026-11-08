// =============================================================================
// ★★★ 주제 세트 저장소 (R080 · D-337 · 0031 · docs/18 §9)
//
// ★ 적재본(topic_sets · topic_items — scripts/topics-load.mjs 가 verified 만 넣는다)을 게임 시작 때 메모리로(loadQuizData 꼴 · 60초 캐시).
//   세트마다 판정 맵(정규화 · flexCanon → 항목 id)을 미리 만든다 — 판정 블록에서 await 하지 않는다.
// ★ 표가 없으면(0031 미적용) 빈 저장소 — 많이 말하기 · 겹치면 무효만 빠진다(게임 시작은 막지 않는다).
// =============================================================================

import { TOPIC_MIN_ITEMS, buildTopicMatcher, topicLabel } from '@quiz/shared';
import { query } from './pool.js';

export interface TopicItem {
  id: string;
  name: string;
  label: string;
  variants: string[];
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
const TTL_MS = 60_000;

export function makeTopicSet(h: { topic: string; nameKo: string; kind: 'closed' | 'open'; timeSec?: number | null }, items: { id: string; name: string; label?: string | null; variants?: string[] }[]): TopicSet {
  const its = items.map((x) => ({ id: x.id, name: x.name, label: topicLabel(x), variants: x.variants ?? [] }));
  return { topic: h.topic, nameKo: h.nameKo, kind: h.kind, timeSec: h.timeSec && h.timeSec > 0 ? h.timeSec : 30, items: its, matcher: buildTopicMatcher(its) };
}

export async function loadTopicStore(force = false): Promise<TopicStore> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  try {
    const [s, it] = await Promise.all([
      query<{ topic: string; name_ko: string; kind: 'closed' | 'open'; time_sec: number }>(`SELECT topic, name_ko, kind, time_sec FROM topic_sets WHERE active ORDER BY topic`),
      query<{ id: string; topic: string; name: string; label: string | null; variants: string[] }>(
        `SELECT id, topic, name, label, variants FROM topic_items WHERE active ORDER BY topic, seq`,
      ),
    ]);
    const by = new Map<string, { id: string; name: string; label: string | null; variants: string[] }[]>();
    for (const r of it.rows) {
      let arr = by.get(r.topic);
      if (!arr) by.set(r.topic, (arr = []));
      arr.push({ id: r.id, name: r.name, label: r.label, variants: Array.isArray(r.variants) ? r.variants : [] });
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
