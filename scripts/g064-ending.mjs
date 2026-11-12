// G064 — 힌트 · 해설 끝말 "~다." → "~습니다/입니다"(문장 끝마다 · 뜻 · 낱말 그대로) · 판단이 애매한 것은 flag
const B = 0xac00;
const jong = (ch) => (ch.charCodeAt(0) - B) % 28;
const setJong = (ch, j) => String.fromCharCode(ch.charCodeAt(0) - jong(ch) + j);
const J_N = 4, J_B = 17, J_SS = 20, J_L = 8;
// 받침 없는 + 다 로 끝나는 그림씨(형용사)·잡음씨 — 마지막 낱말 전체가 이것일 때만 ㅂ니다 · 나머지는 체언 + (이)다 → 입니다
const ADJ = new Set(['크', '다르', '빠르', '느리', '아니', '바쁘', '기쁘', '예쁘', '나쁘', '아프', '비싸', '싸', '짜', '흐리', '이르', '어리', '마르', '거세', '드세', '그르', '바르', '고르', '자유로', '새로', '해로', '이로']);
export function endSentence(s) {
  if (/니다[.!?]?['"’”)]*\s*$/.test(s)) return { out: s, kind: 'formal' };
  const m = s.match(/^(.*?)([가-힣])다(\.?)(\s*)$/s);
  if (!m) return { out: s, kind: /(니까|요)[.!?]?['"’”)]*\s*$/.test(s) ? 'formal' : 'other' };
  const [, head, ch, , sp] = m; const end = (x) => head + x + '.' + sp;
  const j = jong(ch);
  const tail = (head.match(/[가-힣]*$/)[0] ?? '') + ch;
  if (ch === '이') return { out: end('입니다'), kind: 'copula' };   // ~이다
  if (ch === '는' && tail.length > 1) return { out: head + '습니다.' + sp, kind: 'neunda' }; // 받는다 → 받습니다
  if (j === J_SS) return { out: end(ch + '습니다'), kind: 'past' };
  if (j === J_N) return { out: end(setJong(ch, J_B) + '니다'), kind: 'nda' };          // 한다 → 합니다 · 돈다 → 돕니다
  if (j !== 0) return { out: end(ch + '습니다'), kind: 'batchim', flag: j === J_L ? 'ㄹ받침 ← ' + s : undefined };
  if (ch === '하') return { out: end('합니다'), kind: 'hada' };
  if (ADJ.has(tail)) return { out: end(setJong(ch, J_B) + '니다'), kind: 'adj' };
  return { out: end(ch + '입니다'), kind: 'noun', flag: tail.length <= 1 ? `noun1(${tail}) ← ${s}` : undefined };
}
// 문장 나누기: 한글 · 닫는 따옴표 · 괄호 뒤의 마침표에서만(이름 머리글자 'D.' · 'km.' 에서 안 자름)
export function endText(t) {
  if (!t) return { out: t, changed: [], flags: [] };
  const trail = t.match(/\s*$/)[0];
  const parts = t.trimEnd().split(/(?<=[가-힣'"’”)][.!?])(\s+)/);
  const changed = []; const flags = [];
  const out = parts.map((p) => {
    if (!p || /^\s+$/.test(p)) return p;
    const r = endSentence(p);
    if (r.out !== p) changed.push({ from: p, to: r.out, kind: r.kind });
    if (r.flag) flags.push(r.flag);
    if (r.kind === 'other') flags.push('other ← ' + p);
    return r.out;
  }).join('');
  return { out: out + trail, changed, flags };
}
