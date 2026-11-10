// =============================================================================
// ★★ R090 (D-347 · 찬종 "방장이 주제를 체크/체크 해제해서 원하는 주제의 키워드만") — 라이어 · 캐치마인드 제시어 주제 고르기
//
//   · 접히는 한 묶음(docs/16 §5-1 — 버튼 줄 · 설명 문장 없음) — 머리 "제시어 주제 n / m"
//   · 같은 이름(nameKo)의 세트(draw-object · draw-object-2 · liar-food · liar-food-2)는 한 줄 · 단어 수는 합
//   · 기본(null) = optIn 아닌 세트 전부 · [전부] 체크 하나 · 0 개면 머리에 "하나 이상 골라 주세요"(시작은 서버 · 로비가 막는다)
//   · 손님은 읽기만(체크 막힘 · 꺼진 주제는 흐리게)
// =============================================================================
import { useEffect, useState } from 'react';

export interface TopicRow {
  topic: string;
  nameKo: string;
  count: number;
  optIn: boolean;
}
type Lists = { liar: TopicRow[]; draw: TopicRow[] };

let cache: Promise<Lists | null> | null = null;
function loadLists(): Promise<Lists | null> {
  cache ??= fetch('/api/minigame/topics', { credentials: 'same-origin' })
    .then(async (r) => (r.ok ? ((await r.json()) as Lists) : null))
    .catch(() => null)
    .then((x) => {
      if (!x) cache = null; // 실패면 다음에 다시
      return x;
    });
  return cache;
}

interface Group {
  nameKo: string;
  topics: string[];
  count: number;
}
function groupsOf(rows: readonly TopicRow[]): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const g = m.get(r.nameKo) ?? m.set(r.nameKo, { nameKo: r.nameKo, topics: [], count: 0 }).get(r.nameKo)!;
    g.topics.push(r.topic);
    g.count += r.count;
  }
  return [...m.values()];
}

export default function TopicPicker({ kind, picked, editable, onChange }: { kind: 'liar' | 'draw'; picked: string[] | null | undefined; editable: boolean; onChange: (next: string[] | null) => void }) {
  const [rows, setRows] = useState<TopicRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadLists().then((x) => live && setRows(x ? x[kind] : []));
    return () => {
      live = false;
    };
  }, [kind]);
  if (!rows || rows.length === 0) return null;
  const all = rows.map((r) => r.topic);
  const on = new Set(picked == null ? rows.filter((r) => !r.optIn).map((r) => r.topic) : picked.filter((t) => all.includes(t)));
  const groups = groupsOf(rows);
  const groupOn = (g: Group) => g.topics.some((t) => on.has(t));
  const nOn = groups.filter(groupOn).length;
  const words = groups.filter(groupOn).reduce((n, g) => n + g.count, 0);
  const toggle = (g: Group) => {
    const next = new Set(on);
    if (groupOn(g)) for (const t of g.topics) next.delete(t);
    else for (const t of g.topics) next.add(t);
    onChange(all.filter((t) => next.has(t)));
  };
  const everyOn = nOn === groups.length;
  return (
    <details className="topic-pick" data-topic-pick={kind} data-topic-on={nOn}>
      <summary>
        <span className="set-label">주제</span>
        <span className={nOn === 0 ? 'topic-pick-sum warn' : 'topic-pick-sum'}>
          {nOn === 0 ? '하나 이상 골라 주세요' : `${nOn} / ${groups.length} · 단어 ${words.toLocaleString()}`}
        </span>
      </summary>
      <div className="topic-pick-list">
        {editable && (
          <label className="topic-pick-item all">
            <input type="checkbox" data-topic-all checked={everyOn} onChange={() => onChange(everyOn ? [] : all)} />
            <span>전부</span>
          </label>
        )}
        {groups.map((g) => (
          <label key={g.nameKo} className={groupOn(g) ? 'topic-pick-item' : 'topic-pick-item off'} data-topic-item={g.topics.join(',')}>
            <input type="checkbox" checked={groupOn(g)} disabled={!editable} onChange={() => toggle(g)} />
            <span className="topic-pick-name">{g.nameKo}</span>
            <span className="topic-pick-n dim">{g.count}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
