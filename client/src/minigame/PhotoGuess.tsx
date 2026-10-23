// =============================================================================
// ★★★ 사진 이름 맞히기 (R052 · D-239)
//
// ★ 사진이 조금씩 드러난다 — zoom(4배 확대에서 15초 동안 1배로) · mosaic(큰 모자이크에서 풀림) · plain(그대로).
// ★ 이름을 친다 — 여러 번(틀려도 다시) · 판정은 서버(퀴즈 정답과 같은 정규화 · altAnswers) · 맞힌 순간 기기 시간 → 빨리 맞힌 순.
// ★ 질문이 사진이라 입력칸은 복사 막기 대상이 아니다.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { PHOTO_REVEAL_MS } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';
import { QuizImage, SeenBadge, imageUrl, useRetryImage } from './QuizParts.js';
import { isReportOpen } from '../reportGuard.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

/** 모자이크 — 캔버스에 작게 그렸다가 키운다(픽셀이 보이게) */
function Mosaic({ src, level }: { src: string; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // ★ R064 (D-266) — 받기 실패면 2초 뒤 다시 × 2 · 끝내 실패면 글
  const r = useRetryImage(src);
  const { onLoad, onError } = r;
  useEffect(() => {
    if (!r.url) return;
    const im = new Image();
    im.onload = () => {
      setImg(im);
      onLoad();
    };
    im.onerror = () => onError();
    im.src = r.url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.url]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    const W = 480;
    const H = Math.round((W * img.height) / img.width);
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const cells = Math.max(4, Math.round(W / level));
    const tmp = document.createElement('canvas');
    tmp.width = cells;
    tmp.height = Math.max(1, Math.round((cells * H) / W));
    tmp.getContext('2d')?.drawImage(img, 0, 0, tmp.width, tmp.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, W, H);
  }, [img, level]);
  if (r.state === 'fail') {
    return (
      <div className="quiz-img img-fail photo-img" role="img" aria-label="모자이크 사진" data-img-fail>
        <span>사진을 못 받았어요 — 그래도 맞혀 보세요</span>
      </div>
    );
  }
  return (
    <span className="img-wrap" data-img-state={r.state}>
      <canvas ref={ref} className="quiz-img photo-canvas" aria-label="모자이크 사진" />
      {r.state === 'loading' && <span className="img-loading" data-img-loading>그림 불러오는 중</span>}
    </span>
  );
}

export default function PhotoGuess({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const mode = String(p.revealMode ?? 'plain');
  const revealMs = Number(p.revealMs ?? PHOTO_REVEAL_MS);
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const elapsed = view.lab?.elapsedMs ?? (t0 !== null ? Math.max(0, now - t0) : 0);
  const f = Math.min(1, elapsed / revealMs); // 0 → 1 드러남
  // ★ R060 — 남은 시간 막대(둘 다 못 맞히면 제한 시간까지 기다린다 — 얼마나 남았는지 보이게 · 숫자 셋과 같은 막대)
  const playMs = view.round?.playMs ?? revealMs;
  const left = Math.max(0, 1 - elapsed / playMs);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ key: string; correct: boolean; timeMs?: number; wrong: string[] } | null>(null);
  const mine = state?.key === key ? state : null;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText('');
    // ★ R065 — 제보 창이 열려 있으면 포커스를 가져오지 않는다
    if (canPlay && !mobile) window.setTimeout(() => !isReportOpen() && ref.current?.focus({ preventScroll: true }), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canPlay]);

  // 서버의 맞음/틀림
  useEffect(() => {
    const on = (fb: { token: string; roundIndex: number; correct: boolean; timeMs?: number; text?: string }) => {
      if (fb.token !== view.token || fb.roundIndex !== view.roundIndex) return;
      const k = `${fb.token}:${fb.roundIndex}`;
      setState((s) => {
        const prev = s?.key === k ? s : { key: k, correct: false, wrong: [] as string[] };
        return fb.correct ? { ...prev, correct: true, timeMs: fb.timeMs } : { ...prev, wrong: [...prev.wrong, fb.text ?? ''].slice(-3) };
      });
      sfx(fb.correct ? 'mg-done' : 'mg-foul');
      if (fb.correct) ref.current?.blur();
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex]);

  const send = () => {
    const t = text.trim();
    if (!canPlay || mine?.correct || !t || t0 === null) return;
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text: t, elapsedMs: performance.now() - t0 } });
    setText('');
  };

  // 확대 기준점 — 문항마다 다르게(가운데 근처)
  const origin = useMemo(() => {
    let h = 0;
    for (const ch of String(view.round?.itemId ?? p.dummyShape ?? key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `${30 + (h % 40)}% ${30 + ((h >> 8) % 40)}%`;
  }, [view.round?.itemId, p.dummyShape, key]);
  const scale = mode === 'zoom' ? 4 - 3 * f : 1;
  const level = mode === 'mosaic' ? Math.max(1, Math.round(48 * (1 - f) ** 1.6)) : 1;
  const imageId = p.imageId as string | null;

  return (
    <div className={`quiz-stage photo-stage${mobile ? ' m' : ''}`}>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${left * 100}%` }} />
      </div>
      <SeenBadge view={view} />
      <div className="photo-frame" data-mode={mode}>
        {mode === 'mosaic' && imageId && level > 1 ? (
          <Mosaic src={imageUrl(imageId)} level={level} />
        ) : (
          <div className="photo-zoom" style={{ transform: `scale(${scale})`, transformOrigin: origin, filter: mode === 'mosaic' && !imageId && level > 1 ? `blur(${level / 4}px)` : undefined }}>
            <QuizImage imageId={imageId} alt="맞힐 사진" dummy={String(p.dummyShape ?? 'box')} className="photo-img" />
          </div>
        )}
      </div>
      {/* ★ R063 (D-261) — 어려운 사진(d3)은 처음부터 다 보이고 · 2/3 지나면 초성(서버가 그 시각 뒤에만 보낸다) */}
      {typeof p.chosung === 'string' && canPlay && !mine?.correct && (
        <p className="photo-hint" data-photo-hint>
          초성 <strong className="mono">{p.chosung}</strong>
        </p>
      )}
      <form
        className="quiz-num"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="quiz-num-row">
          <input
            ref={ref}
            className="quiz-num-input"
            size={8}
            value={text}
            autoComplete="off"
            enterKeyHint="send"
            disabled={!canPlay || Boolean(mine?.correct)}
            placeholder={view.spectating ? '구경 중' : mine?.correct ? '맞혔어요!' : '이름은?'}
            aria-label="이름 입력"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.stopPropagation();
            }}
          />
          {canPlay && !mine?.correct && (
            <button type="submit" className="primary quiz-num-ok" disabled={!text.trim()}>
              확인
            </button>
          )}
        </div>
        <p className={`quiz-num-help${mine?.correct ? ' ok' : mine && mine.wrong.length ? ' bad' : ' dim'}`} data-feedback={mine?.correct ? 'correct' : mine?.wrong.length ? 'wrong' : ''}>
          {mine?.correct
            ? `정답! ${((mine.timeMs ?? 0) / 1000).toFixed(1)}초`
            : mine?.wrong.length
              ? `"${mine.wrong[mine.wrong.length - 1]}" — 아니에요. 다시!`
              : view.spectating
                ? '구경 중이에요'
                : '틀려도 몇 번이고 다시 칠 수 있어요'}
        </p>
      </form>
    </div>
  );
}
