// =============================================================================
// ★★★ R096 — 노래 맞히기 방식 설정(D-353 · 브리프 B · 찬종 #117 "한국(발라드 · 댄스 · 아이돌 등) · 팝송 · J-pop · 연도 10년 단위")
//
// ★ 줄 넷(퀴즈 설정과 같은 set-row · preset 꼴 — 새 CSS 값 없이): 곡 수(5~20 · 기본 10) · 분류(다중) · 연대(다중 + "20세기 명곡") ·
//   한국 장르(다중 · 분류에 한국이 없으면 숨김 · 곡 0 인 칩은 흐리게 + 수) · 아래 한 줄 = 고른 범위 곡 수(모자라면 빨간 줄 — 서버도 시작을 막는다)
// ★ 칩 옆 수 = 그 칩만 바꿔 켰을 때 그 칩에 드는 곡(shared songRangeCounts) · 활성 곡의 고르기 칸은 /api/minigame/song-meta(제목 · 가수 없음)
// =============================================================================

import { useEffect, useState } from 'react';
import {
  SONG_CATEGORIES,
  SONG_DECADES,
  SONG_KR_GENRES,
  SONG_MODE,
  songRangeCounts,
  type SongCategory,
  type SongDecade,
  type SongKrGenre,
  type SongMeta,
  type SongSettings as SongSettingsValue,
} from '@quiz/shared';

let cache: Promise<SongMeta[]> | null = null;
function loadMetas(): Promise<SongMeta[]> {
  cache ??= fetch('/api/minigame/song-meta', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((j: { items?: SongMeta[] }) => j.items ?? [])
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}

const PRESETS = [5, 10, 15, 20];

export default function SongSettings({ value, editable, onChange }: { value: SongSettingsValue; editable: boolean; onChange: (next: SongSettingsValue) => void }) {
  const [metas, setMetas] = useState<SongMeta[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMetas().then((m) => alive && setMetas(m));
    return () => {
      alive = false;
    };
  }, []);
  const counts = metas ? songRangeCounts(metas, value) : null;
  const toggle = <T extends string>(list: readonly T[], all: readonly T[], k: T, keepOne: boolean): T[] => {
    const has = list.includes(k);
    if (has && keepOne && list.length === 1) return [...list];
    return all.filter((x) => (x === k ? !has : list.includes(x)));
  };
  const n = (c: number | undefined) => (counts ? <span className="mono dim song-set-n">{c ?? 0}</span> : null);
  const chip = (on: boolean, label: string, count: number | undefined, onClick: () => void, data: Record<string, string>) =>
    editable ? (
      <button type="button" aria-pressed={on} className={`${on ? 'preset active' : 'preset'}${counts && !count ? ' song-set-empty' : ''}`} onClick={onClick} {...data}>
        {label} {n(count)}
      </button>
    ) : (
      <span className={`${on ? 'chip on' : 'chip'}${counts && !count ? ' song-set-empty' : ''}`} {...data}>
        {label} {n(count)}
      </span>
    );
  const kr = value.songCategories.includes('kr');
  const short = counts !== null && counts.total < value.songCount;
  return (
    <>
      <div className="set-row">
        <span className="set-label">곡 수</span>
        {editable ? (
          <div className="preset-row">
            <input
              type="number"
              className="count-input mg-rounds-input"
              inputMode="numeric"
              min={SONG_MODE.ROUNDS.MIN}
              max={SONG_MODE.ROUNDS.MAX}
              aria-label={`곡 수 (${SONG_MODE.ROUNDS.MIN}~${SONG_MODE.ROUNDS.MAX})`}
              data-song-count
              value={Number.isFinite(value.songCount) ? value.songCount : ''}
              onChange={(e) => onChange({ ...value, songCount: Number.parseInt(e.target.value, 10) })}
            />
            {PRESETS.map((k) => (
              <button key={k} type="button" data-song-count-preset={k} className={value.songCount === k ? 'preset active' : 'preset'} onClick={() => onChange({ ...value, songCount: k })}>
                {k}
              </button>
            ))}
          </div>
        ) : (
          <span className="set-value mono">{value.songCount}곡</span>
        )}
      </div>
      <div className="set-row">
        <span className="set-label">분류</span>
        <div className="preset-row">
          {SONG_CATEGORIES.map((c) =>
            chip(value.songCategories.includes(c.key), c.label, counts?.category[c.key], () => onChange({ ...value, songCategories: toggle<SongCategory>(value.songCategories, SONG_CATEGORIES.map((x) => x.key), c.key, true) }), { 'data-song-cat': c.key }),
          )}
        </div>
      </div>
      <div className="set-row">
        <span className="set-label">연대</span>
        <div className="preset-row">
          {SONG_DECADES.map((d) =>
            chip(value.songDecades.includes(d.key), d.label, counts?.decade[d.key], () => {
              const next = toggle<SongDecade>(value.songDecades, SONG_DECADES.map((x) => x.key), d.key, !value.songLegend);
              onChange({ ...value, songDecades: next });
            }, { 'data-song-decade': d.key }),
          )}
          {chip(value.songLegend, '20세기 명곡', counts?.legend, () => (value.songLegend && value.songDecades.length === 0 ? undefined : onChange({ ...value, songLegend: !value.songLegend })), { 'data-song-legend': '' })}
        </div>
      </div>
      {kr && (
        <div className="set-row">
          <span className="set-label">한국 장르</span>
          <div className="preset-row topic-row">
            {SONG_KR_GENRES.map((g) =>
              chip(value.songGenres.includes(g), g, counts?.genre[g], () => onChange({ ...value, songGenres: toggle<SongKrGenre>(value.songGenres, SONG_KR_GENRES, g, true) }), { 'data-song-genre': g }),
            )}
          </div>
        </div>
      )}
      <p className={short ? 'form-error avail-line' : 'note avail-line'} data-song-avail data-wrap-ok>
        {counts === null
          ? '노래 수를 확인하는 중입니다.'
          : short
            ? `★ 고른 범위의 노래가 ${counts.total}곡뿐이에요. 곡 수를 줄이거나 범위를 넓혀 주세요.`
            : `고른 범위의 노래 ${counts.total}곡 · 들은 적 없는 곡부터 나와요`}
      </p>
    </>
  );
}
