// =============================================================================
// ★★ 첫 이모티콘 가이드 (R066 · D-290 · 찬종 #40 "첫 이모티콘 구매 순간 팝업으로 설명해줘. 예시 그림도 넣어서 …
//   온라인 게임에서 스킬 처음 배우면 스킬 세팅법이랑 사용법 나오잖아? 그런 식으로")
//
// ★ 첫 구매(가진 특별 이모티콘 0 → 1) 직후 한 번 — 그림(단축키 줄 1~0 · 산 이모티콘이 1번 자리에) + 세 단계 → [알겠어요].
//   본 것은 계정에 남는다(accountFlags · emojiGuideSeen). ⓘ 안내 "이모티콘" 에서 다시 보기.
// ★ 그림은 SVG(캡처 아님) — 자리 10칸 · 1번에 산 그림 · 2번 위 ✎ 표시.
// =============================================================================

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import Icon from './Icon.js';
import { setFlag } from './accountFlags.js';
import { emojiSrc, useEmojiCatalog } from './emojiCatalog.js';
import { useUiMode } from './uiMode.js';

let shown: { emojiId: number | null } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 가이드 열기 — 산 이모티콘 번호(없으면 빈 그림) */
export function openEmojiGuide(emojiId: number | null = null): void {
  shown = { emojiId };
  emit();
}
function closeGuide() {
  shown = null;
  setFlag('emojiGuideSeen');
  emit();
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** App 에 하나 */
export default function EmojiGuideHost() {
  const g = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => shown,
  );
  const cat = useEmojiCatalog();
  const mobile = useUiMode() === 'mobile';
  useEffect(() => {
    if (!g) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeGuide();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [g]);
  if (!g) return null;
  const meta = g.emojiId !== null ? cat?.byId.get(g.emojiId) : undefined;
  const src = meta ? emojiSrc(meta) : null;
  return createPortal(
    <div className="modal-back popup-back" onPointerDown={(e) => e.target === e.currentTarget && closeGuide()}>
      <div className="modal emoji-guide" role="dialog" aria-label="이모티콘 가이드" data-emoji-guide>
        <p className="emoji-guide-title">
          <Icon icon={Sparkles} /> 새 이모티콘을 얻었어요!
        </p>
        {/* 그림 — 단축키 줄 10칸 · 1번 자리에 산 이모티콘 · 2번 자리에 ✎ */}
        <svg className="emoji-guide-art" viewBox="0 0 420 96" role="img" aria-label="단축키 줄 — 1번 자리에 새 이모티콘">
          <rect x={2} y={8} width={416} height={70} rx={14} className="eg-bar" />
          {KEYS.map((k, i) => {
            const x = 12 + i * 40.4;
            return (
              <g key={k}>
                <rect x={x} y={16} width={34} height={34} rx={9} className={i === 0 ? 'eg-slot on' : 'eg-slot'} />
                {i === 0 && src && <image href={src} x={x + 4} y={20} width={26} height={26} />}
                {i === 0 && !src && <text x={x + 17} y={39} textAnchor="middle" className="eg-star">★</text>}
                {i === 1 && <text x={x + 17} y={39} textAnchor="middle" className="eg-pen">✎</text>}
                <text x={x + 17} y={68} textAnchor="middle" className={i === 0 ? 'eg-key on' : 'eg-key'}>
                  {k}
                </text>
              </g>
            );
          })}
          <path d="M29 94 L29 84" className="eg-arrow" />
        </svg>
        <ol className="emoji-guide-steps">
          <li>
            <strong>1번 자리</strong>에 넣어 뒀어요.
          </li>
          <li>
            <strong>✎</strong> 또는 숫자 자리를 눌러 다른 자리에 바꿔 넣어요.
          </li>
          <li>{mobile ? '자리를 누르면 보내고 · 길게 누르면 입력창에 넣어요.' : '숫자 키(Alt+1~0)나 자리를 누르면 보내요 · Shift+클릭은 입력창에 넣어요.'}</li>
        </ol>
        <div className="emoji-guide-actions">
          <button type="button" className="primary" autoFocus data-emoji-guide-ok onClick={closeGuide}>
            알겠어요
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
