// =============================================================================
// ★★★ 퀴즈류 미니게임 공용 조각 (R052 · D-239) — 그림 · 숫자 입력 · "이미 본 문항" 표시
//
// ★ 그림은 /api/minigame/image/:imageId (DB bytea · 로그인만). 연습 판(더미)은 그림이 없어 누가 봐도 가짜인 도형을 그린다.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { formatNumberInput, parseNumberInput } from '@quiz/shared';
import { Eye, Package } from 'lucide-react';
import Icon from '../Icon.js';
import type { MinigameView } from '../useRoom.js';
import { isReportOpen } from '../reportGuard.js';

export const imageUrl = (id: string) => `/api/minigame/image/${encodeURIComponent(id)}`;

/**
 * ★ R063 (D-261 · 찬종 #18 "이미지 렌더링을 미리 해놓던가") — 받기 + decode 까지 한 번만(주소별 약속을 기억).
 *   decode 가 끝난 그림은 <img> 로 그릴 때 깜빡임 · 로딩 표시가 없다.
 */
const decoded = new Map<string, Promise<void>>();
export function decodeImage(src: string): Promise<void> {
  let p = decoded.get(src);
  if (!p) {
    const img = new Image();
    img.src = src;
    // ★ R064 — 실패한 약속은 잊는다(다음에 다시 받을 수 있게)
    p = (img.decode ? img.decode() : new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; })).catch(() => {
      decoded.delete(src);
    });
    decoded.set(src, p);
  }
  return p;
}
/** 지금 decode 가 끝났나(동기) */
const done = new Set<string>();
export function isDecoded(src: string): boolean {
  return done.has(src);
}
export function preloadAll(srcs: readonly string[]): Promise<void> {
  return Promise.all(srcs.map((s) => decodeImage(s).then(() => void done.add(s)))).then(() => undefined);
}

/** 다음 판 그림을 미리 받아 둔다(준비 단계) — ★ R063 decode 까지 */
export function preloadQuizImages(view: MinigameView): void {
  const p = view.round?.params ?? {};
  const ids = [p.imageId, (p.a as { imageId?: string } | undefined)?.imageId, (p.b as { imageId?: string } | undefined)?.imageId].filter((x): x is string => typeof x === 'string');
  void preloadAll(ids.map(imageUrl));
}

/** ★ R064 — 그림 받기 실패 시 다시 받기 횟수 · 간격 */
export const IMAGE_RETRIES = 2;
export const IMAGE_RETRY_MS = 2000;

/**
 * ★★ R064 (D-266 · 찬종 #21 "사진이 안나와서 새로고침 했대") — 그림이 안 오면 2초 뒤 다시 받기 × 2 · 그동안 "그림 불러오는 중" ·
 *   그래도 안 되면 'fail'(부르는 쪽이 글로 대신 · 진행은 막지 않는다). 다시 받을 때는 주소 끝에 ?r=n 을 붙여 캐시된 실패를 피한다.
 */
export function useRetryImage(src: string | null): { url: string | null; state: 'loading' | 'ok' | 'fail'; onLoad: () => void; onError: () => void } {
  const [tryN, setTryN] = useState(0);
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>(() => (src && isDecoded(src) ? 'ok' : 'loading'));
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setTryN(0);
    setState(src && isDecoded(src) ? 'ok' : 'loading');
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [src]);
  const onLoad = () => setState('ok');
  const onError = () => {
    if (tryN >= IMAGE_RETRIES) {
      setState('fail');
      return;
    }
    setState('loading');
    timer.current = window.setTimeout(() => setTryN((n) => n + 1), IMAGE_RETRY_MS);
  };
  const url = src === null ? null : tryN === 0 ? src : `${src}?r=${tryN}`;
  return { url, state, onLoad, onError };
}

/** 문항 그림 — 없으면(연습 더미) 도형 · 상자 · ★ R064 받기 실패면 다시 받기 · 끝내 실패면 글 */
export function QuizImage({ imageId, alt, className, dummy = 'box' }: { imageId: string | null | undefined; alt: string; className?: string; dummy?: string }) {
  if (imageId) return <RetryImg src={imageUrl(imageId)} alt={alt} className={className} />;
  return (
    <div className={`quiz-img dummy ${className ?? ''}`} role="img" aria-label={`${alt} (연습용)`}>
      {dummy === 'circle' ? (
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" /></svg>
      ) : dummy === 'triangle' ? (
        <svg viewBox="0 0 100 100"><polygon points="50,14 88,84 12,84" /></svg>
      ) : dummy === 'square' ? (
        <svg viewBox="0 0 100 100"><rect x="18" y="18" width="64" height="64" rx="4" /></svg>
      ) : (
        <Icon icon={Package} className="quiz-dummy-ico" />
      )}
      <span className="quiz-dummy-tag">연습용</span>
    </div>
  );
}

function RetryImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const r = useRetryImage(src);
  if (r.state === 'fail') {
    return (
      <div className={`quiz-img img-fail ${className ?? ''}`} role="img" aria-label={alt} data-img-fail>
        <span>사진을 못 받았어요 — 그래도 맞혀 보세요</span>
      </div>
    );
  }
  return (
    <span className="img-wrap" data-img-state={r.state}>
      {r.url && <img key={r.url} className={`quiz-img ${className ?? ''}`} src={r.url} alt={alt} draggable={false} onLoad={r.onLoad} onError={r.onError} />}
      {r.state === 'loading' && <span className="img-loading" data-img-loading>그림 불러오는 중</span>}
    </span>
  );
}

/** "이미 본 문항" — 이 문항은 점수 0 */
export function SeenBadge({ view }: { view: MinigameView }) {
  if (!view.round?.private?.experienced) return null;
  return (
    <p className="quiz-seen">
      <Icon icon={Eye} /> 이미 본 문항 — 이 문항은 점수가 없어요
    </p>
  );
}

/** 숫자 입력 — 천 단위 쉼표 자동 · Enter/확인 한 번 · 보낸 뒤 잠김 */
export function NumberInput({
  view,
  socket,
  unit,
  allowDecimal,
  t0,
  placeholder,
  allowZero = false,
  max,
  year,
}: {
  view: MinigameView;
  socket: { emit: (ev: string, p: unknown) => void };
  unit: string;
  allowDecimal: boolean;
  t0: number | null;
  placeholder: string;
  /** ★ R053 — 0 도 받는다 · 최댓값(평균의 2/3 — 0~100) */
  allowZero?: boolean;
  max?: number;
  /** ★ R068 — 사진 연도: 숫자 4자리(쉼표 없음) · 범위 안만 보낸다(모바일 숫자 키패드) */
  year?: { min: number; max: number };
}) {
  const key = `${view.token}:${view.roundIndex}`;
  const [text, setText] = useState('');
  const [sent, setSent] = useState<{ key: string; value: number } | null>(null);
  const mine = sent?.key === key ? sent : null;
  const ref = useRef<HTMLInputElement>(null);
  const canPlay = view.phase === 'play' && !view.spectating;
  useEffect(() => {
    setText('');
    // ★ R065 — 제보 창이 열려 있으면 포커스를 가져오지 않는다
    if (canPlay) window.setTimeout(() => !isReportOpen() && ref.current?.focus({ preventScroll: true }), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canPlay]);
  const raw = year ? (/^\d{4}$/.test(text) ? Number(text) : null) : parseNumberInput(text, allowZero);
  const value = raw !== null && (max === undefined || raw <= max) && (!year || (raw >= year.min && raw <= year.max)) ? raw : null;
  const yearOut = year && /^\d{4}$/.test(text) && value === null;
  const submit = () => {
    if (!canPlay || mine || value === null) return;
    setSent({ key, value });
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { value, elapsedMs: t0 !== null ? Math.round(performance.now() - t0) : null } });
    ref.current?.blur();
  };
  return (
    <form
      className="quiz-num"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="quiz-num-row">
        <input
          ref={ref}
          className="quiz-num-input mono"
          size={year ? 5 : 8}
          maxLength={year ? 4 : undefined}
          pattern={year ? '[0-9]*' : undefined}
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          enterKeyHint="done"
          value={mine ? (year ? String(mine.value) : formatNumberInput(String(mine.value), allowDecimal)) : text}
          disabled={!canPlay || Boolean(mine)}
          placeholder={view.spectating ? '구경 중' : placeholder}
          aria-label="숫자 입력"
          onChange={(e) => setText(year ? e.target.value.replace(/\D/g, '').slice(0, 4) : formatNumberInput(e.target.value, allowDecimal))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation();
          }}
        />
        <span className="quiz-num-unit">{unit}</span>
        {canPlay && !mine && (
          <button type="submit" className="primary quiz-num-ok" disabled={value === null}>
            확인
          </button>
        )}
      </div>
      <p className={`quiz-num-help${yearOut ? ' bad' : ' dim'}`}>
        {mine ? '보냈어요! 정답 공개를 기다리는 중…' : view.spectating ? '구경 중이에요' : yearOut && year ? `${year.min} ~ ${year.max} 사이로 적어 주세요` : ''}
      </p>
    </form>
  );
}
