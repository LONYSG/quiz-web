// ★ R039 — 이모티콘 그림 하나 (번호 → 그림). 목록을 아직 못 받았으면 빈 자리
// ★★ R074 (D-322 ①) — 사무실 모드면 그림 대신 글자 `:이름:` (같은 자리 크기 안 · 특별 이모티콘도)
// ★★ R075 (D-322 2판 · 찬종 "이모티콘이 글자로만 나오고 실제로 출력이 아예 안된다") — 옛 글자 크기(size×0.42 · 10~16px) + 칸 폭 줄임표라
//   사실상 안 보였다 → 글자 크기는 CSS(본문 0.95rem)가 정하고 칸이 글자에 맞춰 늘어난다(styles [data-theme='office'] .emoji-text)
import { emojiSrc, useEmojiCatalog } from './emojiCatalog.js';
import { useIsOffice } from './office.js';

export default function Emoji({ id, size = 24, className }: { id: number; size?: number; className?: string }) {
  const cat = useEmojiCatalog();
  const office = useIsOffice();
  const e = cat?.byId.get(id);
  if (!e) return <span className={className} style={{ display: 'inline-block', width: size, height: size }} aria-hidden="true" />;
  if (office)
    return (
      <span className={className ? `emoji emoji-text ${className}` : 'emoji emoji-text'} title={e.name} data-emoji-id={e.id} role="img" aria-label={e.name}>
        :{e.name}:
      </span>
    );
  return (
    <img
      className={className ? `emoji ${className}` : 'emoji'}
      src={emojiSrc(e)}
      alt={e.char ?? e.name}
      title={e.name}
      width={size}
      height={size}
      draggable={false}
      data-emoji-id={e.id}
    />
  );
}
