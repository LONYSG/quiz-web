// =============================================================================
// 문제 지문 (R035) — 문장마다 줄을 바꾸고, 긴 문장은 글자를 조금 줄여 한 줄에 넣는다
//
// ★ 건우: "2문장 이상이면 중간에 줄바꿈을 해서 글이 최대한 끊기지 않게. 한 문장이 줄이 바뀌어 버리면 가독성이 확 떨어진다."
// ★ 방법
//   1. shared/splitSentences 로 문장을 나눈다 (기준과 예외는 그 파일 헤더)
//   2. 문장 한 줄씩 그린다 (줄바꿈 금지 상태로 잰다)
//   3. 가장 긴 줄이 칸보다 넓으면 글자를 1px 씩 줄인다 — 최소 MIN_PX 까지
//   4. 그래도 넘치는 아주 긴 문장만 **어절 단위로** 줄을 바꾼다 (예외)
//   ★ 칸 폭이 바뀌면(창 크기) 다시 잰다.
// =============================================================================

import { splitSentences } from '@quiz/shared';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

/** 기본 글자 크기(px) — R034 의 1.28rem(20.5px)에서 조금 줄였다 */
const BASE_PX = 19;
/** 긴 문장을 위해 여기까지 줄인다 */
const MIN_PX = 15;

export default function QuestionText({ text }: { text: string }) {
  const lines = useMemo(() => splitSentences(text), [text]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ px: number; wrap: boolean }>({ px: BASE_PX, wrap: false });

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const spans = [...box.querySelectorAll<HTMLElement>('.q-line')];
      const width = box.clientWidth;
      let px = BASE_PX;
      const widest = () => Math.max(0, ...spans.map((el) => el.scrollWidth));
      box.style.setProperty('--q-px', `${px}px`);
      box.dataset.wrap = '0';
      while (px > MIN_PX && widest() > width) {
        px -= 1;
        box.style.setProperty('--q-px', `${px}px`);
      }
      const wrap = widest() > width;
      // ★★ R039 — 잴 때 바꾼 줄바꿈 상태를 **DOM 에도 다시** 적는다.
      //   ★ 옛 코드의 결함: 재측정(창 크기·글꼴 로딩) 때 data-wrap 을 '0' 으로 바꿔 놓고, 결과가 이전과 같으면 React 가
      //     다시 그리지 않아 '0'(줄바꿈 금지) 이 그대로 남았다 → 긴 문장이 **칸 밖으로 잘렸다** (R039 1장)
      box.dataset.wrap = wrap ? '1' : '0';
      setFit((prev) => (prev.px === px && prev.wrap === wrap ? prev : { px, wrap }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [lines]);

  return (
    <div
      ref={boxRef}
      className="q-text"
      data-text={text}
      data-wrap={fit.wrap ? '1' : '0'}
      style={{ ['--q-px' as string]: `${fit.px}px` }}
    >
      {lines.map((line, i) => (
        <span key={i} className="q-line">
          {line}
        </span>
      ))}
    </div>
  );
}
