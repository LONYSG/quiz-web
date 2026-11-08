// =============================================================================
// ★★★ R084 — 노래(song) 항목 형식 검사 (docs/18 §10) — minigame-load.mjs 가 부른다 · 단위 테스트(minigame-song.test.mjs)
//
// ★ 칸: 공통(§0 — id · status · createdRound · sources · tags · verify — image 는 없어도 된다) + title · titleVariants · artist ·
//   artistVariants · year · itunes{trackId · previewUrl · artworkUrl100 · releaseDate …} · pool · chart · qid
// ★ previewUrl 이 없으면 넣지 않는다(§10) · 소리 파일은 저장하지 않는다(화면이 Apple CDN 을 스트리밍)
// =============================================================================

export const SONG_FIELDS = ['title', 'titleVariants', 'artist', 'artistVariants', 'year', 'itunes', 'pool', 'chart', 'qid'];
export const SONG_OPTIONAL = ['image'];
export const SONG_POOLS = ['kpop-year', 'kpop-classic', 'pop', 'jpop'];
const ITUNES_NEED = ['trackId', 'previewUrl', 'artworkUrl100', 'releaseDate'];

const strArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** song 항목 하나의 칸별 문제(빈 배열이면 통과) — 공통 칸 · 모르는 칸 검사는 부르는 쪽(minigame-load problems) */
export function songProblems(it) {
  const p = [];
  if (typeof it.title !== 'string' || !it.title.trim()) p.push('title');
  if (typeof it.artist !== 'string' || !it.artist.trim()) p.push('artist');
  if (!strArr(it.titleVariants)) p.push('titleVariants 배열');
  if (!strArr(it.artistVariants)) p.push('artistVariants 배열');
  if (!Number.isInteger(it.year) || it.year < 1900 || it.year > 2100) p.push('year');
  if (!SONG_POOLS.includes(it.pool)) p.push(`pool ${it.pool}`);
  const t = it.itunes;
  if (!t || typeof t !== 'object') p.push('itunes');
  else {
    for (const k of ITUNES_NEED) if (t[k] === undefined || t[k] === null || t[k] === '') p.push(`itunes.${k} 없음`);
    if (typeof t.previewUrl === 'string' && !/^https:\/\//.test(t.previewUrl)) p.push('itunes.previewUrl https');
    if (typeof t.artworkUrl100 === 'string' && !/^https:\/\//.test(t.artworkUrl100)) p.push('itunes.artworkUrl100 https');
  }
  if (it.chart !== null && (typeof it.chart !== 'object' || !Number.isInteger(it.chart.year))) p.push('chart');
  if (it.qid !== null && typeof it.qid !== 'string' && !Number.isInteger(it.qid)) p.push('qid'); // 문항 id(숫자 · 글)
  return p;
}

/** 넣을 status — verified · loaded(§0) · --allow-candidate 면 candidate 도(검사 DB 만 — 빗장은 topics-load candidateGate) */
export function loadableStatus(status, allowCandidate) {
  return status === 'verified' || status === 'loaded' || (allowCandidate && status === 'candidate');
}
