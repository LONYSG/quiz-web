// =============================================================================
// G029 — H12 기계 대조(V031 ⑥ · V032 CV-133 · G028 5절): 힌트 속에 **다른 활성 문항의 대표 정답**이 글자 그대로 있는가
//   · 대표 정답만 본다(변형은 보지 않는다) · 정규화(normalizeAnswer) 3글자 이상은 글자 그대로 · ★ 2글자는 낱말 단위로만(조사 떼고 — 파랑 · 공생) · 같은 정답 무리(대표 정답이 같은 문항)는 제외
//   · 흔한 낱말(COMMON)은 제외 — 핵심에 필요한 이름은 그대로 쓴다(15 H12 · 서버 R050 shownNorm 이 "보여 준 글에 정답이 든 후보" 를 뒤로 미룬다)
//   · 막힘이 아니라 경고(kind 'crossans') — scripts/hint-check-active.mjs 가 쓴다
//   ★ G037(V038 CV-162 (c)): 3글자 이상도 낱말 경계(WORD_END · 숫자 정답은 뒤 숫자만 아니면) · 오탐 쌍 명단 crossans-skip.json(SKIP) · COMMON 4
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../shared/dist/index.js';

/** 흔한 낱말 — 다른 문항의 정답이지만 힌트에 흔히 나오는 일반어(G028 crossans 178 줄에서 고름 · G029) */
export const COMMON = [
  '고양이', '러시아', '그리스', '신호등', '독일어', '프랑스', '이탈리아', '스페인', '아메리카', '아프리카', '오스트레일리아',
  '지중해', '자외선', '바이러스', '휴대전화', '스마트폰', '인터넷', '컴퓨터', '텔레비전', '소문자', '대문자',
  '1984', '기획사', '밀리언셀러', '알제리', '사실주의', '심폐소생술', '플루트', '스노보드', '우리은하', '전염병',
  '대류권', '아몬드', '양귀비', '포인트', '콧수염', '흰동가리', '마라톤', '올림픽', '월드컵', '노벨상',
  // 나라 · 땅 · 바다 · 도시(일반 지명)
  '잉글랜드', '스위스', '브라질', '캐나다', '스코틀랜드', '아르헨티나', '파키스탄', '스웨덴', '리비아', '덴마크', '뉴질랜드', '자메이카', '인도네시아',
  '에티오피아', '아이슬란드', '싱가포르', '바티칸', '태평양', '대서양', '경기도', '제주도', '울릉도', '하와이', '아테네', '베를린', '마드리드', '이스탄불', '보스턴', '로스앤젤레스',
  // 일반 낱말 · 분야 · 숫자
  '테니스', '물고기', '반도체', '플라스틱', '리스트', '교향곡', '브리지', '토마토', '이산화탄소', '유네스코', '에이스', '라틴어', '하우스', '삼각형',
  '공화국', '크리스마스', '개구리', '현악기', '코끼리', '붙는다', '마스코트', '대나무', '협주곡', '조리개', '미생물', '나이트', '고추장', '갈매기', '방사능', '광합성', '아리아',
  '999', '400', '2001', '1982', '1945',
  // 2글자(낱말 단위로만 본다 — 흔한 것은 뺀다)
  '서울', '한국', '일본', '중국', '미국', '영국', '인도', '바다', '하늘', '사람', '하나', '여름', '겨울', '봄', '가을', '노래', '영화', '축구', '야구', '농구',
  '소리', '유럽', '사랑', '로마', '파리', '작가', '뉴욕', '영어', '거리', '비극', '날개', '런던', '몸통', '소금', '지방', '소련', '자라', '기관', '과학', '생물',
  '골프', '신화', '전자', '산소', '맥주', '태양', '유엔', '북한', '군주', '임금', '헌법', '대륙', '껍질', '온도', '한강', '웹툰', '깃털', '행성', '보석', '중세',
  '괴물', '잡지', '식초', '평균', '세균', '흰색', '김치', '왼쪽', '심장', '부모', '현장', '되어', '앉아', '단골', '양력', '하지', '유도', '광주', '대구', '전주',
  // G033 — V034 CV-141 오탐 중 흔한 낱말 12
  '파랑', '파란색', '무지개', '타자기', '번호판', '티셔츠', '기네스', '비누', '단백질', '냉장고', '수석', '녹색',
  // G034 — 484 활성 뒤 crossans: 설명에 꼭 쓰이는 갈래·일반어 13(애니메이션 30 · 할리우드 13 · 고려가요 7 …)
  '애니메이션', '할리우드', '알파벳', '피렌체', '고려가요', '아이콘', '자전거', '양서류', '오케스트라', '에세이', '로맨스', '피고인', '기하학',
  // G037 — V038 ⓒ 오탐 F 의 일반어(단위 · 동작 · 길 · 팀 — 동음이의 호박 · 영동 · 광장은 쌍 명단 crossans-skip.json 쪽)
  '킬로그램', '회전', '건널목', '국가대표',
  // G038 — 전수 판정 F 가운데 3회 이상 나온 일반어(선물 9 · 광장 9 · 3월 7 · 냄새 6 · 조정 5 · 바늘 5 · 위치 4 · 규모 4 · 구름 4 · 소원 4 · 횟수 3 · 유리창 3 · 무게 3) — 동음이의·이름(돌리 · 고수 · 3M · 링크 · 기린 …)은 쌍 명단 쪽
  '선물', '광장', '3월', '냄새', '조정', '바늘', '위치', '규모', '구름', '소원', '횟수', '유리창', '무게',
];

/** ★ G037 — 오탐 쌍 명단 `data/pipeline/audit/crossans-skip.json` items [[hostId, crossId, why]] (V038 F 부터 · 뒤 라운드가 더한다) → "host:cross" */
export function loadSkip(file = SKIP_FILE) {
  try { return new Set(JSON.parse(readFileSync(file, 'utf8')).items.map(([h, c]) => `${h}:${c}`)); } catch { return new Set(); }
}
const SKIP_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/pipeline/audit/crossans-skip.json');
export const SKIP = loadSkip();

/** 낱말 나누기(원문) — 공백 · 문장 부호 */
const SEP = /[\s·,.'"“”‘’()「」『』[\]~!?\-:;/]+/;
/** 따옴표 묶음(제목 · 이름) — 그 안의 일치가 묶음보다 짧으면 긴 이름의 일부(R2) */
const QUOTE = /'[^']+'|"[^"]+"|‘[^’]+’|“[^”]+”|「[^」]+」|『[^』]+』/g;
/** R1 — 일치의 끝 낱말에 남아도 되는 꼬리(조사 · 어미) — ★ G037: 3글자 이상도 이 꼬리 밖이면 낱말 일부로 본다(페트라르카 ⊃ 페트라 · 국가대표팀 ⊃ 국가대표) */
const TAIL = /^(은|는|이|가|을|를|의|에|와|과|도|로|으로|에서|에게|까지|부터|처럼|보다|만|이다|이며|였다|이고|와의|과의|에서의|라는|이라는|란|이란|들|들이|들을|들의|에는|에도|으로는|로는|이나|나|랑|이랑|이자|인|이라고|라고|에서는|으로써|로써|이었다|이었던|였던|이던|던|에게서|한테|께서|마저|조차|에선|으로서|로서|와도|과도|이라|라|에서도|만큼|이며|이지만|지만|적|적인|식|풍|다|보다는|보다도|에서만|마다|으로도|로도|만을|만이)$/;
/** ★ G037 — 3글자 이상 한 낱말 안 일치의 끝에 붙어도 "그 이름을 말한 것" 으로 보는 꼬리:
 *  한 글자 갈래 말(에베레스트산 · 진시황릉 · 타이타닉호 · 설렁탕집 · 올리브유 · 루게릭병 · 이데아론 · 인문주의자 · 스키점프팀 · 오사카부) + 조사 · 하다/되다 꼴(드리블하던) */
const SUFFIX1 = '산|강|호|릉|집|유|병|팀|부|론|자|빛|상|섬|탑|성|시|군|도|국|배|왕|선|법|학|파|족|가|단|전|날|절|교|어';
const WORD_END = new RegExp(`^(?:(?:${SUFFIX1})(?:${TAIL.source.slice(2, -2)})?|(?:하|되|시키|당하)\\S*)$`);
/** 숫자 정답(1789 · 108 · 110)은 뒤에 숫자만 아니면 낱말 끝(1789년 · 108배 · 110m — 1822년 ⊅ 182) */
const NUM = /^[0-9]+$/;

/** 원문을 낱말로 — 정규화 문자열 위치(s · e) · 원문 위치(os · oe) · 따옴표 묶음 번호 */
function tokens(hint) {
  const quotes = []; for (const m of String(hint).matchAll(QUOTE)) quotes.push([m.index, m.index + m[0].length]);
  const out = []; let pos = 0; const re = new RegExp(SEP.source, 'g'); let last = 0; const raw = [];
  for (const m of String(hint).matchAll(re)) { if (m.index > last) raw.push([last, m.index]); last = m.index + m[0].length; }
  if (last < String(hint).length) raw.push([last, String(hint).length]);
  for (const [os, oe] of raw) {
    const w = String(hint).slice(os, oe); const n = normalizeAnswer(w); if (!n) continue;
    const qi = quotes.findIndex(([a, b]) => os >= a && oe <= b);
    out.push({ w, n, s: pos, e: pos + n.length, os, oe, q: qi });
    pos += n.length;
  }
  return out;
}

/** 낱말 끝 조사(2글자 정답을 낱말 단위로 볼 때 뗀다) */
const JOSA = /(은|는|이|가|을|를|의|에|와|과|도)$/;

/**
 * @param {{ id: string|number, hint: string, answerNorm: string }} q  검사할 문항(answerNorm = 대표 정답 정규화)
 * @param {Array<{ id: string|number, norm: string, answer: string }>} answers  활성 문항 대표 정답 목록
 * @param {{ common?: Iterable<string> }} [opt]
 * @returns {Array<{ id: string, answer: string }>}  힌트에 든 다른 문항 정답(정규화 값마다 하나)
 */
export function crossAnswers(q, answers, opt = {}) {
  const common = new Set([...(opt.common ?? COMMON)].map((s) => normalizeAnswer(s)));
  const skip = opt.skip ?? SKIP;
  const h = normalizeAnswer(q.hint ?? '');
  if (!h) return [];
  const words = new Set(String(q.hint).split(/[\s·,.'"“”‘’()「」[\]~!?-]+/).filter(Boolean).flatMap((w) => [w, w.replace(JOSA, '')]).map((w) => normalizeAnswer(w)));
  const tk = tokens(q.hint); const hh = tk.map((t) => t.n).join('');
  const seen = new Map(); const spans = [];
  for (const a of answers) {
    if (String(a.id) === String(q.id) || a.norm === q.answerNorm) continue;
    if (skip.has(`${q.id}:${a.id}`)) continue; // ★ G037 — 오탐 쌍 명단(crossans-skip.json)
    const n = [...a.norm].length;
    if (n < 2 || common.has(a.norm) || seen.has(a.norm) || (n === 2 && /^[0-9]+$/.test(a.norm))) continue;
    if (n === 2 && !words.has(a.norm)) continue;
    if (n > 2 && !h.includes(a.norm)) continue;
    // ★ G033 R1 · R2(V034 CV-141) — 일치 자리마다 본다 · 하나라도 통과하면 센다
    const cands = [];
    if (n === 2) { for (let k = 0; k < tk.length; k++) if (tk[k].n === a.norm || tk[k].n.replace(JOSA, '') === a.norm) cands.push([tk[k].s, tk[k].s + a.norm.length]); }
    else for (let at = hh.indexOf(a.norm); at >= 0; at = hh.indexOf(a.norm, at + 1)) cands.push([at, at + a.norm.length]);
    if (n === 2 && !cands.length) { seen.set(a.norm, { id: String(a.id), answer: a.answer }); continue; } // 낱말 대조와 낱말 나누기가 다를 때 — 옛 동작
    for (const [at, end] of cands) {
      const i = tk.findIndex((t) => at >= t.s && at < t.e); const j = tk.findIndex((t) => end > t.s && end <= t.e);
      if (i < 0 || j < 0) continue;
      const tail = tk[j].n.slice(end - tk[j].s); const tailOk = tail === '' || TAIL.test(tail);
      // R1 — 여러 낱말에 걸친 일치는 낱말 처음에서 시작하고 낱말 끝(또는 조사 꼬리)에서 끝나야 한다(사바나와 "달리 아시아" ≠ 달리아)
      if (j > i && (at !== tk[i].s || !tailOk)) continue;
      // ★ G037(V038 CV-162 (c)) — 3글자 이상도 낱말 경계: 한 낱말 안 일치는 낱말 처음에서 시작하고 끝(또는 꼬리)에서 끝나야 한다 · 영문은 낱말 단위와 같다
      if (n > 2 && j === i && (at !== tk[i].s || !(tailOk || WORD_END.test(tail) || (NUM.test(a.norm) && !/^[0-9]/.test(tail))))) continue;
      // R2 — 긴 이름의 일부: ① 따옴표 묶음(제목) 안인데 묶음이 더 길다('브레이킹 배드' · '슈퍼 마리오 브라더스' · '슈퍼맨이 돌아왔다')
      const qi = tk[i].q;
      if (qi >= 0 && tk[j].q === qi) { const inQ = tk.filter((t) => t.q === qi); if (inQ[0].s < at || inQ.at(-1).e > (tailOk ? tk[j].e : end)) continue; }
      // ② 바로 옆 낱말이 라틴 대문자·숫자 한두 글자(케니 G)
      const nx = tk[j + 1]; const pv = tk[i - 1];
      if (end === tk[j].e && nx && /^[A-Z0-9]{1,2}$/.test(nx.w) && /^\s+$/.test(String(q.hint).slice(tk[j].oe, nx.os))) continue;
      if (at === tk[i].s && pv && /^[A-Z0-9]{1,2}$/.test(pv.w) && /^\s+$/.test(String(q.hint).slice(pv.oe, tk[i].os))) continue;
      seen.set(a.norm, { id: String(a.id), answer: a.answer }); spans.push({ norm: a.norm, s: at, e: end });
      break;
    }
  }
  // R2 ③ — 더 긴 다른 정답 일치 안에 든 짧은 일치는 뺀다(미키 마우스 ⊃ 마우스)
  for (const x of spans) if (spans.some((y) => y !== x && y.s <= x.s && y.e >= x.e && y.e - y.s > x.e - x.s)) seen.delete(x.norm);
  return [...seen.values()];
}
