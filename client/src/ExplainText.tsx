// =============================================================================
// ★★ 해설 — 자기 자리 안에서만 (R042 G · 건우: "해설이 길면 소감 칸을 침범하나? 튀어나가거나 컴포넌트 크기가 변하면 안 된다")
//
// ★ 자리: 최대 4줄 높이(CSS --explain-lines). 그 안에서 줄을 바꾼다.
// ★ 넘치면 글자를 줄인다 (R040 모바일 맞춤과 같은 방식 — 하한 75%). 그래도 넘치면 마지막 줄 "…" (전체는 채팅·결과 기록에 없으니 판단 — 4장)
// ★ 자리 폭이 바뀌면(창 크기 · 글꼴 로딩) 다시 잰다.
// =============================================================================

import { useLayoutEffect, useRef } from 'react';

const MIN_SCALE = 0.75;

export default function ExplainText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.removeProperty('--ex');
      el.dataset.clamp = '0';
      let k = 1;
      while (el.scrollHeight > el.clientHeight + 1 && k > MIN_SCALE) {
        k = Math.max(MIN_SCALE, Math.round((k - 0.05) * 100) / 100);
        el.style.setProperty('--ex', String(k));
      }
      if (el.scrollHeight > el.clientHeight + 1) el.dataset.clamp = '1';
      el.dataset.fit = String(k);
    };
    fit();
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [text]);
  return (
    <p ref={ref} className="reveal-explain">
      {text}
    </p>
  );
}
