// ★ R039 — 이모티콘 그림 하나 (번호 → 그림). 목록을 아직 못 받았으면 빈 자리
import { emojiSrc, useEmojiCatalog } from './emojiCatalog.js';

export default function Emoji({ id, size = 24, className }: { id: number; size?: number; className?: string }) {
  const cat = useEmojiCatalog();
  const e = cat?.byId.get(id);
  if (!e) return <span className={className} style={{ display: 'inline-block', width: size, height: size }} aria-hidden="true" />;
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
