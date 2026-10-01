#!/usr/bin/env node
// =============================================================================
// 일반 힌트 검사 — 기준서 4장 H2·H3·H4 를 기계로 본다 (R027)
//
// ★★ 왜: 지금의 노출 검사(answer-rules findAnswerInQuestion)는 **정답 전체**만 본다.
//   R026 에서 정답의 **일부 낱말**이 힌트에 들어가는 부분 노출이 나왔다 —
//     밤비노의 저주 ← "밤비노" / 살수대첩 ← "대첩"
//   초성 힌트와 합쳐지면 답이 된다. 그래서 정답을 이루는 조각까지 본다.
//
// 판정
//   block  full     정답·변형이 통째로 들어 있다
//          partial  정답·변형을 이루는 조각이 들어 있다 (한글 2글자 이상 / 로마자 3글자 이상)
//                   ★ 단 질문에 이미 있는 조각은 빼고, 조각은 힌트 낱말의 첫머리에 올 때만 본다
//   warn   question 힌트의 낱말 대부분이 질문에 이미 있다 (H3 — 되풀이)
//          explain  힌트와 해설이 같은 구절(한글 4글자 이상 연속)을 나눈다 (H4 — 해설과 겹침)
//          ★ R030 (V003 5절 라 — 정답 글자 노출의 사각지대 두 곳)
//          partial-mid  정답 조각이 힌트 낱말의 **중간**에 있다 (지구돋이 ← "해돋이" 의 "돋이")
//                       ★ 경고로만 둔다 — 우연의 일치가 많다 (V003 실측: 5건 중 진짜 1건). 사람이 본다
//          roman        힌트의 로마자 낱말이 정답 낱말을 소리로 옮긴 것일 수 있다 (테아닌 ← 'Thea' / 세이버메트릭스 ← 'SABR')
//                       ★ 경고로만 둔다 — 원어를 일부러 보여 주는 좋은 힌트도 있다 (커피 벨트 ← 'Corn Belt' 는 건우가 든 좋은 예)
//
// ★ 세기(도와주기/떠먹여 주기)와 다른 이름(H10)은 기계가 보지 않는다 — 규칙(hint-v3)과 사람 읽기로 막는다
//
// ★ 한계 — 한 글자 조각("~궤" 꼴)은 보지 않는다. 한 글자까지 보면 거의 모든 힌트가 걸린다.
// =============================================================================
import { normalizeAnswer } from '../shared/dist/index.js';

const HANGUL = /[가-힣]/;
const strip = (s) => normalizeAnswer(s ?? '').replace(/[^0-9a-z가-힣]/g, '');

/** 정답 하나에서 조각을 뽑는다 — 한글은 2글자 이상 연속, 로마자는 3글자 이상 */
function fragments(ans) {
  const out = new Set();
  for (const word of (ans ?? '').split(/[\s·\-]+/).map(strip).filter(Boolean)) {
    const min = HANGUL.test(word) ? 2 : 3;
    for (let len = min; len <= word.length; len++) for (let i = 0; i + len <= word.length; i++) out.add(word.slice(i, i + len));
  }
  return [...out];
}

// ── ★ R030 로마자 ↔ 한글 소리 대조 ─────────────────────────────────────────
//   한글 → 로마자(국어의 로마자 표기법에 가깝게) / 로마자 → 자음 골격으로 맞대 본다. 정밀하지 않다 — 경고용이다
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
function romanize(word) {
  let out = '';
  for (const ch of word) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) continue;
    out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
  }
  return out;
}
/** 자음 골격 — 소리가 비슷한 자음을 한 부류로 */
function skeleton(latin) {
  const t = latin.toLowerCase().replace(/ph/g, 'p').replace(/th/g, 't').replace(/sh|ch|tch/g, 's').replace(/ck/g, 'k').replace(/ng/g, 'n').replace(/x/g, 'ks');
  const cls = { p: 'P', b: 'P', f: 'P', v: 'P', t: 'T', d: 'T', k: 'K', g: 'K', c: 'K', q: 'K', s: 'S', z: 'S', j: 'S', l: 'L', r: 'L', m: 'M', n: 'N' };
  let out = '';
  for (const ch of t) { const k = cls[ch]; if (k && out[out.length - 1] !== k) out += k; }
  return out;
}
const latinNorm = (w) => w.toLowerCase().replace(/ph/g, 'p').replace(/th/g, 't').replace(/h/g, '').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/f/g, 'p').replace(/v/g, 'b');
/** 로마자 낱말 tok 이 한글 낱말 word 를 소리로 옮긴 것처럼 보이는가 */
export function soundsLike(tok, word) {
  const rr = romanize(word);
  if (!rr || tok.length < 3) return false;
  const n = latinNorm(tok);
  if (n.length >= 3 && rr.startsWith(n.slice(0, 3))) return true;
  const a = skeleton(tok), b = skeleton(rr);
  // ★ 앞 두 자음 부류만 본다 — SABR(S·P·L) ↔ 세이버(S·P·M…) 처럼 영어 철자와 한글 표기의 뒤쪽은 자주 어긋난다
  return a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2);
}

const grams = (s, n) => { const t = strip(s); const g = new Set(); for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n)); return g; };

export function checkHint({ hint, answer, variants = [], question = '', explanation = '' }) {
  const res = { block: [], warn: [] };
  if (!hint) return res;
  const h = strip(hint);
  for (const a of [answer, ...variants]) {
    const na = strip(a);
    if (na && h.includes(na)) { res.block.push({ kind: 'full', frag: a }); continue; }
    // ★ 조각 — 긴 것부터 보고, 이미 잡은 조각에 들어가는 짧은 것은 다시 적지 않는다
    // ★ R027 실측으로 두 가지를 좁혔다 (R026 힌트 20개를 돌려 본 결과)
    //   (1) 질문에 이미 있는 조각은 새로 새는 정보가 아니다 — 헬라 세포 ← "세포" (질문에 "세포주")
    //   (2) 낱말 전체가 아닌 조각은 힌트 **낱말의 첫머리**에 올 때만 본다 — 테트리스 ← "그리스어" 속 "리스" 는 우연이다
    const qs = strip(question);
    const words = (hint ?? '').split(/[\s·,.'"“”‘’()「」\-]+/).map(strip).filter(Boolean);
    const whole = new Set((a ?? '').split(/[\s·\-]+/).map(strip).filter(Boolean));
    const hit = fragments(a)
      .filter((f) => h.includes(f) && !qs.includes(f))
      .filter((f) => whole.has(f) || words.some((w) => w.startsWith(f)))
      .sort((x, y) => y.length - x.length);
    const kept = []; for (const f of hit) if (!kept.some((k) => k.includes(f))) kept.push(f);
    for (const f of kept) res.block.push({ kind: 'partial', frag: f, of: a });
    // ★ R030 — 낱말 중간 일치 (경고). 막힘으로 잡은 조각과 그 안의 짧은 조각은 다시 적지 않는다
    const mid = fragments(a)
      .filter((f) => HANGUL.test(f) && h.includes(f) && !qs.includes(f) && !kept.some((k) => k.includes(f)))
      .filter((f) => !whole.has(f) && words.some((w) => w.includes(f) && !w.startsWith(f)))
      .sort((x, y) => y.length - x.length);
    const midKept = []; for (const f of mid) if (!midKept.some((k) => k.includes(f))) midKept.push(f);
    for (const f of midKept) res.warn.push({ kind: 'partial-mid', frag: f, of: a });
    // ★ R030 — 로마자 음차 (경고). 질문에 이미 있는 로마자는 뺀다
    const qLatin = new Set((question.match(/[A-Za-z]{3,}/g) ?? []).map((x) => x.toLowerCase()));
    for (const tok of (hint.match(/[A-Za-z]{3,}/g) ?? [])) {
      if (qLatin.has(tok.toLowerCase())) continue;
      for (const w of (a ?? '').split(/[\s·\-]+/).filter((x) => HANGUL.test(x))) {
        if (soundsLike(tok, w)) { res.warn.push({ kind: 'roman', frag: tok, of: a }); break; }
      }
    }
  }
  // H3 — 질문 되풀이: 힌트의 2글자 조각 가운데 질문에도 있는 비율
  const hg = grams(hint, 2), qg = grams(question, 2);
  if (hg.size) { const share = [...hg].filter((g) => qg.has(g)).length / hg.size; if (share >= 0.6) res.warn.push({ kind: 'question', share: Math.round(share * 100) }); }
  // H4 — 해설과 겹침: 한글 4글자 연속 구절을 나누는가
  const eg = grams(explanation, 4); const shared = [...grams(hint, 4)].filter((g) => eg.has(g) && HANGUL.test(g));
  if (shared.length) res.warn.push({ kind: 'explain', shared: shared.slice(0, 3) });
  return res;
}

// 직접 실행하면 R026 사례로 스스로 검사한다
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/hint-check.mjs')) {
  const cases = [
    [{ hint: '밤비노는 이탈리아어로 아기를 뜻한다', answer: '밤비노의 저주' }, 'partial'],
    [{ hint: '귀주·한산도 대첩과 함께 3대 대첩', answer: '살수대첩' }, 'partial'],
    // ★★ R026 에서 GEN 이 "밤비노" 만 빼고 통과시켰던 실제 힌트 — "저주" 도 정답 조각이다. 이 검사기가 처음 잡았다
    [{ hint: '저주를 받았다는 구단은 보스턴 레드삭스이고, 이름은 루스의 별명에서 왔다', answer: '밤비노의 저주' }, 'partial'],
    [{ hint: '보스턴 레드삭스가 오랫동안 우승하지 못한 까닭으로 떠돈 말이다', answer: '밤비노의 저주' }, 'none'],
    [{ hint: '싸움터가 된 강은 지금의 청천강으로 보는 견해가 많다', answer: '살수대첩' }, 'none'],
    [{ hint: '영어 약자 두 글자로도 부른다', answer: '집적회로', variants: ['IC'] }, 'none'],
    [{ hint: '흔히 IC 라 부른다', answer: '집적회로', variants: ['IC'] }, 'full'],
    // ★ R027 — 오탐 두 가지를 막는다
    [{ hint: '세포를 떼어 낸 환자의 이름에서 따왔다', answer: '헬라 세포', question: '…연구에 쓰이는 세포주는?' }, 'none'],
    [{ hint: "이름은 '넷' 을 뜻하는 그리스어 접두어에서 왔다", answer: '테트리스' }, 'none'],
  ];
  // ★ R030 — 경고 (V003 실측 사례)
  const warnCases = [
    [{ hint: "해가 떠오르는 '해돋이'에 빗댄 이름이다", answer: '지구돋이', question: '달 지평선 위로 지구가 떠오르는 사진은?' }, 'partial-mid'],
    [{ hint: "차나무의 옛 속명 'Thea'에서 이름이 왔다", answer: '테아닌' }, 'roman'],
    [{ hint: '이름은 미국야구연구협회의 영어 약칭 SABR에서 왔다', answer: '세이버메트릭스' }, 'roman'],
    [{ hint: '녹차의 감칠맛을 내는 성분으로도 꼽힌다', answer: '테아닌' }, 'none'],
    [{ hint: '오른쪽에서 왼쪽으로 써 나가는 문자를 쓰는 언어다', answer: '아랍어' }, 'none'],
  ];
  let ok = 0;
  for (const [c, want] of cases) {
    const r = checkHint(c); const got = r.block[0]?.kind ?? 'none';
    const pass = got === want || (want === 'none' && !r.block.length);
    console.log(`${pass ? 'ok  ' : '★실패'} [${c.answer}] "${c.hint}" → ${got}${r.block[0]?.frag ? ` (${r.block[0].frag})` : ''} / 기대 ${want}`);
    if (pass) ok++;
  }
  for (const [c, want] of warnCases) {
    const r = checkHint(c); const got = r.warn.find((w) => w.kind === 'partial-mid' || w.kind === 'roman')?.kind ?? 'none';
    const pass = got === want;
    console.log(`${pass ? 'ok  ' : '★실패'} [${c.answer}] "${c.hint}" → 경고 ${got} / 기대 ${want}`);
    if (pass) ok++;
  }
  const all = cases.length + warnCases.length;
  console.log(`[hint-check] ${ok}/${all}`);
  if (ok !== all) process.exit(1);
}
