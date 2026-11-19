/**
 * ★ R105 — "덕아웃"으로 · "와이파이"로 — 끝 글자 받침으로 조사를 고른다(ㄹ 받침 · 받침 없음 = 로).
 *   한글이 아니면 읽는 소리로 어림: 숫자 0 · 3 · 6 과 영문 M · N 은 "으로", 나머지는 "로".
 */
export function euroParticle(word: string): '으로' | '로' {
  const t = word.replace(/[\s"'”’)\]}.!?~…·-]+$/u, '');
  const ch = t.slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  return /[036mn]/i.test(ch) ? '으로' : '로';
}
