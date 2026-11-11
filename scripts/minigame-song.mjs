// =============================================================================
// ★★★ R084 — 노래(song) 항목 형식 검사 (docs/18 §10) — minigame-load.mjs 가 부른다 · 단위 테스트(minigame-song.test.mjs)
//
// ★ 칸: 공통(§0 — id · status · createdRound · sources · tags · verify — image 는 없어도 된다) + title · titleVariants · artist ·
//   artistVariants · year · itunes{trackId · previewUrl · artworkUrl100 · releaseDate …} · pool · chart · qid
// ★ previewUrl 이 없으면 넣지 않는다(§10) · 소리 파일은 저장하지 않는다(화면이 Apple CDN 을 스트리밍)
// ★★ R096 (D-353 · 18 §10 R096 데이터 칸 · G061 · G062) — 새 칸 category · genre · genreWhy · titleKo · legend · legendWhy · inactiveReason 을 받는다
//   (옛: 모르는 칸으로 거부 → 메뉴 1 이 노래를 전부 쉬게 했다 — G061 1절 실측) · 넣는 항목(verified · loaded · candidate)은 category · titleKo 필수 ·
//   kr 은 genre(9종) 필수 · titleKo 는 한글 · 숫자 · 기호 · 띄어쓰기만(초성 힌트 재료) · status 'inactive' = 넣지 않고 DB 행 active=false(지우지 않는다)
// =============================================================================

export const SONG_FIELDS = ['title', 'titleVariants', 'artist', 'artistVariants', 'year', 'itunes', 'pool', 'chart', 'qid'];
export const SONG_OPTIONAL = ['image', 'category', 'genre', 'genreWhy', 'titleKo', 'legend', 'legendWhy', 'inactiveReason'];
export const SONG_POOLS = ['kpop-year', 'kpop-classic', 'pop', 'jpop'];
/** ★ R096 — 방 설정 "분류"(18 §10) */
export const SONG_CATEGORIES = ['kr', 'pop', 'jpop'];
/** ★ R096 — 한국 세부 장르(18 §10 · 방 설정 칩 순서) */
export const SONG_KR_GENRES = ['아이돌', '발라드', '댄스', '힙합', 'R&B', '록/밴드', 'OST', '트로트', '포크/인디'];
const ITUNES_NEED = ['trackId', 'previewUrl', 'artworkUrl100', 'releaseDate'];

const strArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
/** titleKo — 한글 · 숫자 · 띄어쓰기 · 기호(라틴 · 가나 · 한자 없음) */
const KO_ONLY = /^[가-힣ㄱ-ㆎ0-9\s!-/:-@[-`{-~·…’'“”]+$/;
const LATIN_OR_KANA = /[A-Za-z぀-ヿ一-鿿]/;

/** ★ R096 — titleKo 가 초성 재료로 쓸 수 있나 */
export function titleKoOk(s) {
  return typeof s === 'string' && s.trim().length > 0 && !LATIN_OR_KANA.test(s) && KO_ONLY.test(s);
}

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
  // ── ★ R096 새 칸(있으면 꼴 검사 · 넣는 항목은 필수 — loadableStatus 를 통과한 항목만 여기 온다)
  if (!SONG_CATEGORIES.includes(it.category)) p.push(`category ${it.category}`);
  if (it.category === 'kr' && !SONG_KR_GENRES.includes(it.genre)) p.push(`genre ${it.genre}`);
  if (it.category !== 'kr' && it.genre !== undefined && it.genre !== null && typeof it.genre !== 'string') p.push('genre 글');
  if (!titleKoOk(it.titleKo)) p.push(`titleKo ${it.titleKo}`);
  if (it.legend !== undefined && typeof it.legend !== 'boolean') p.push('legend 참/거짓');
  for (const k of ['genreWhy', 'legendWhy', 'inactiveReason']) if (it[k] !== undefined && it[k] !== null && typeof it[k] !== 'string') p.push(`${k} 글`);
  return p;
}

/** 넣을 status — verified · loaded(§0) · --allow-candidate 면 candidate 도(검사 DB 만 — 빗장은 topics-load candidateGate) · ★ R096 inactive 는 넣지 않는다 */
export function loadableStatus(status, allowCandidate) {
  return status === 'verified' || status === 'loaded' || (allowCandidate && status === 'candidate');
}
