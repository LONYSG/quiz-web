// =============================================================================
// ★★★ 이모티콘 나열(인라인) — 채팅 글 속 이모티콘 토큰 (R057 · D-250)
//
// ★ 찬종: "이모티콘을 글자처럼 쓰고 싶은 경우가 있대 … 기존 방식이 디폴트고 여러개 나열해서 쓰고싶다든가 하는 경우에만."
// ★ 토큰 두 가지 — 채팅 글(chat.send 의 text) 안에 그대로 들어간다
//   · 표준 이모티콘 = **유니코드 글자 그대로**(😂). 키보드로 친 이모지도 같다
//   · 특별 이모티콘(테마 · 그림만 있다) = `:sp:<번호>:` — **가진 것만** 서버가 받는다(아니면 토큰을 버리고 글자만)
// ★ 규칙
//   · 한 줄에 토큰 10개까지(INLINE_EMOJI_MAX) — 넘는 것은 서버가 버린다
//   · 이모티콘만 1~3개(EMOJI_ONLY_BIG_MAX)면 지금 반응 꼴(크게 · 참여자 칸 · 떠 있는 층) · 4개 이상이나 글자와 섞이면 한 줄 인라인
//   · ★ 정답 판정은 **토큰을 뺀 글자로**(글자가 비면 판정 안 함) · 마스킹도 글자 부분만(토큰을 건너뛰고 찾는다)
// =============================================================================

export const INLINE_EMOJI_MAX = 10;
export const EMOJI_ONLY_BIG_MAX = 3;

/** 특별 이모티콘 토큰 `:sp:<번호>:` */
export function specialToken(id: number): string {
  return `:sp:${id}:`;
}

export type EmojiPart = { kind: 'text'; text: string } | { kind: 'char'; text: string } | { kind: 'sp'; id: number; text: string };

const SP_RE = /:sp:(\d{1,9}):/g;
const PICTO_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
let segmenter: Intl.Segmenter | null = null;

/** 유니코드 이모지 한 덩어리인가 (글자 묶음 = grapheme) */
function isEmojiGrapheme(g: string): boolean {
  return PICTO_RE.test(g);
}

/** 글 → 글자 · 이모지 · 특별 토큰 조각. 이어진 글자는 한 조각 */
export function splitEmojiText(text: string): EmojiPart[] {
  const out: EmojiPart[] = [];
  const pushText = (s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.kind === 'text') last.text += s;
    else out.push({ kind: 'text', text: s });
  };
  const pushPlain = (s: string) => {
    if (!s) return;
    if (!PICTO_RE.test(s)) {
      pushText(s);
      return;
    }
    segmenter ??= new Intl.Segmenter('und', { granularity: 'grapheme' });
    for (const { segment } of segmenter.segment(s)) {
      if (isEmojiGrapheme(segment)) out.push({ kind: 'char', text: segment });
      else pushText(segment);
    }
  };
  let at = 0;
  for (const m of text.matchAll(SP_RE)) {
    pushPlain(text.slice(at, m.index));
    out.push({ kind: 'sp', id: Number(m[1]), text: m[0] });
    at = m.index + m[0].length;
  }
  pushPlain(text.slice(at));
  return out;
}

/** 토큰 수 */
export function countEmojiTokens(text: string): number {
  return splitEmojiText(text).filter((p) => p.kind !== 'text').length;
}

/** ★ 판정용 — 토큰을 뺀 글자만 */
export function stripEmojiTokens(text: string): string {
  return splitEmojiText(text)
    .filter((p) => p.kind === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * ★ 서버 — 받을 수 없는 특별 토큰(가지지 않음 · 없는 번호)과 10개를 넘는 토큰을 버린다.
 *   @param allowSpecial 그 번호의 특별 토큰을 받을지
 */
export function capEmojiTokens(text: string, allowSpecial: (id: number) => boolean, max = INLINE_EMOJI_MAX): string {
  let n = 0;
  return splitEmojiText(text)
    .map((p) => {
      if (p.kind === 'text') return p.text;
      if (p.kind === 'sp' && !allowSpecial(p.id)) return '';
      n += 1;
      return n <= max ? p.text : '';
    })
    .join('');
}

/** 이모티콘만인가(공백 말고 글자가 없다) — 그렇다면 토큰 조각들 */
export function emojiOnlyTokens(text: string): Exclude<EmojiPart, { kind: 'text' }>[] | null {
  const parts = splitEmojiText(text);
  if (parts.some((p) => p.kind === 'text' && p.text.trim() !== '')) return null;
  const toks = parts.filter((p): p is Exclude<EmojiPart, { kind: 'text' }> => p.kind !== 'text');
  return toks.length > 0 ? toks : null;
}

/** 마스킹이 건너뛰는 자리표(사설 영역 U+E001~U+E0FF — 가려짐 표시 U+E000 다음부터) */
export const EMOJI_PLACEHOLDER_RE = /[-]/;

/**
 * ★ 마스킹 전에 토큰을 자리표 한 글자로 바꾼다 — 정답 찾기가 토큰을 건너뛴다(마스킹은 글자 부분만).
 *   가린 뒤 restore 로 남은 자리표를 원래 토큰으로 되돌린다(가려진 구간 안의 토큰은 같이 사라진다).
 */
export function protectEmojiTokens(text: string): { text: string; restore: (masked: string) => string } {
  const toks: string[] = [];
  const out = splitEmojiText(text)
    .map((p) => {
      if (p.kind === 'text' || toks.length >= 0xff) return p.text;
      toks.push(p.text);
      return String.fromCharCode(0xe000 + toks.length);
    })
    .join('');
  return {
    text: out,
    restore: (masked) => masked.replace(/[-]/g, (c) => toks[c.charCodeAt(0) - 0xe001] ?? ''),
  };
}
