// =============================================================================
// ★★ 자리에 맞춰 글자를 줄이는 한 줄 (R040 — 닉네임 "…" 없애기)
//
// ★ 건우: "닉네임이 너무 길면 '…' 으로 표기되는데, 이렇게 하지 말고 글자 수 제한을 걸자."
//   → 한도(shared nickname.ts — 8칸) 안의 닉네임은 **어느 자리에서도 잘리지 않아야** 한다.
// ★ 방법: CSS 글자 크기(디자인 값)에서 시작해, 자리보다 넓으면 비율만큼 줄인다. 하한(minPx) 아래로는 줄이지 않고
//   그래도 넘치면 **줄을 바꾼다** — 어떤 경우에도 "…" 로 자르지 않는다.
// ★ 자리 폭이 바뀌면(창 크기 · 글꼴 로딩) 다시 잰다.
// =============================================================================

import { useLayoutEffect, useRef, type CSSProperties } from 'react';

interface Props {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** 이 크기 아래로는 줄이지 않는다 (px) */
  minPx?: number;
  as?: 'span' | 'p';
}

export default function FitText({ text, className, style, minPx = 13, as = 'span' }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = '';
      el.dataset.wrap = '0';
      const avail = el.clientWidth;
      const need = el.scrollWidth;
      if (avail === 0 || need <= avail + 0.5) {
        el.dataset.fit = '1';
        return;
      }
      const max = parseFloat(getComputedStyle(el).fontSize);
      const size = Math.max(minPx, Math.floor(((max * avail) / need) * 10) / 10);
      el.style.fontSize = `${size}px`;
      el.dataset.fit = size === max ? '1' : String(+(size / max).toFixed(2));
      if (el.scrollWidth > el.clientWidth + 0.5) el.dataset.wrap = '1';
    };
    fit();
    let w = el.parentElement?.clientWidth ?? 0;
    const ro = new ResizeObserver(() => {
      // ★ 높이만 바뀐 것(글자를 줄여서)에는 다시 재지 않는다 — 고리 방지
      const nw = el.parentElement?.clientWidth ?? 0;
      if (nw !== w) {
        w = nw;
        fit();
      }
    });
    if (el.parentElement) ro.observe(el.parentElement);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [text, minPx]);

  const cls = className ? `fit-text ${className}` : 'fit-text';
  return as === 'p' ? (
    <p ref={(n) => { ref.current = n; }} className={cls} style={style}>
      {text}
    </p>
  ) : (
    <span ref={(n) => { ref.current = n; }} className={cls} style={style}>
      {text}
    </span>
  );
}
