// =============================================================================
// ★★★ R073 (D-319) — 첫 안내 투어: 포인트샵 → 뽑기 → 😊 → 안내 카드 (네 단계 · 스포트라이트 + 말풍선)
//
// ★ 찬종 2026-11-05: "가입 50P 알림이 없다시피 하니 로비 첫 진입 때 포인트샵 강조 + 포인트 쓰는 법(지금은 뽑기뿐) +
//   이모티콘 버튼 강조 + 단축키 등록법까지 안내 · 기존 유저도 한 번씩" · "게임 중엔 말고 로비 아니어도 게임 끝나면 보여도 됨".
// ★ 조건: 로그인(방 안) · 계정 값을 받은 뒤 tourSeen 없음(prefs — 기존 계정 전원 없음 → 모두 한 번) ·
//   방 상태 LOBBY 또는 GAME_RESULT · 다른 팝업 없음(popup.ts). 게임이 시작되면 숨기고(본 것으로 치지 않음) 다음 로비·결과에서 처음부터.
// ★ 단계: ① 🎁 포인트샵(PC 위 막대 · 모바일은 ☰ 를 열어 그 안의 포인트샵 줄) — 가입 선물 · 지금 NP
//         ② 포인트샵을 열어 [뽑기 20P] ③ 창을 닫고 😊 ④ 😊 창을 열어 안내 카드(D-318 · 다시 보지 않음 체크 가능) → 끝.
//   강조한 것을 사람이 직접 눌러도 다음 단계로 간다(① 포인트샵 열기 · ③ 😊 열기). 끝내거나 건너뛰면 tourSeen 저장.
// ★ 가입 선물 창(D-289)은 ①로 합쳤다 — GrantToast 가 투어 전이면 창을 띄우지 않는다(isTourPending).
// ★ 화면: 구멍 둘레 네 판(누르기 막음 · 어둡게) — 구멍 안(강조한 것)은 눌린다. 말풍선은 구멍 아래(자리가 없으면 위).
// =============================================================================

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SIGNUP_GIFT_POINTS } from '@quiz/shared';
import { closePopup, openPopup, useCurrentPopup } from './popup.js';
import { getFlag, setFlag, useFlag } from './accountFlags.js';
import { whenPrefsLoaded } from './prefsSync.js';
import { fetchShop } from './api.js';
import { armEmojiHelp, EMOJI_HELP_CLOSED, openEmojiHelp } from './EmojiHelp.js';

// ── 다시 보기(ⓘ 놀이 탭) · 가입 선물 창이 묻는 곳 ───────────────────────────────
let replay = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
/** ⓘ [처음 안내 다시 보기] — 방 안이면 지금(로비 · 결과) 다시 */
export function replayTour(): void {
  replay = true;
  closePopup();
  emit();
}
/** 가입 선물 창을 투어 ①이 대신하나(계정 값을 받은 뒤 tourSeen 없음) */
export async function isTourPending(): Promise<boolean> {
  await whenPrefsLoaded();
  return !getFlag('tourSeen');
}

type Step = 0 | 1 | 2 | 3;
const STEPS = 4;
/** 시작 전 기다림 — 방에 막 들어온 화면이 그려지고 나서 */
const START_DELAY_MS = 1200;

interface Props {
  /** 방 상태 */
  state: string;
  mobile: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function targetSel(step: Step, mobile: boolean): string {
  if (step === 0) return mobile ? '[data-menu-shop]' : '#shop-btn';
  if (step === 1) return '.shop-pop .shop-draw';
  if (step === 2) return '.emoji-btn';
  return '[data-emoji-help]';
}

export default function TourHost({ state, mobile }: Props) {
  const seen = useFlag('tourSeen');
  const replayNow = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => replay,
  );
  const popup = useCurrentPopup();
  const calm = state === 'LOBBY' || state === 'GAME_RESULT';
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const stepRef = useRef<Step | null>(null);
  stepRef.current = step;
  const stepPopup = useRef<string | null>(null);
  stepPopup.current = popup;
  /** ④ — 😊 창이 열린 것을 본 뒤에 닫히면 끝 */
  const emojiSeen = useRef(false);

  // 계정 값을 받은 뒤에만(다른 기기에서 본 투어를 또 띄우지 않는다)
  useEffect(() => {
    let alive = true;
    void whenPrefsLoaded().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // 시작 — 조용한 화면 · 팝업 없음이 잠깐 이어지면
  const want = ready && calm && (!seen || replayNow);
  useEffect(() => {
    if (!want || step !== null || popup !== null) return undefined;
    const t = window.setTimeout(() => {
      replay = false;
      emit();
      setStep(0);
      void fetchShop().then((v) => {
        if (!v) return;
        setBalance(v.balance);
        setPrice(v.themes[0]?.price ?? null);
      });
    }, START_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [want, step, popup]);

  // 게임이 시작되면 숨긴다(본 것으로 치지 않는다)
  useEffect(() => {
    if (!calm && step !== null) {
      armEmojiHelp(false);
      setStep(null);
    }
  }, [calm, step]);

  const finish = () => {
    setFlag('tourSeen');
    armEmojiHelp(false);
    replay = false;
    setStep(null);
  };

  // 단계에 들어갈 때 할 일
  useEffect(() => {
    if (step === 0 && mobile) openPopup('menu');
    if (step === 1) openPopup('shop');
    if (step === 2) {
      closePopup('shop');
      closePopup('menu');
      armEmojiHelp(); // 사람이 😊 을 눌러 열어도 카드가 보이게
    }
    if (step === 3) {
      emojiSeen.current = false;
      // 사람이 😊 을 눌러 왔으면 이미 열려 있다(③에서 카드를 걸어 뒀다)
      // ★ R074 (D-321) — ④ 는 자동 시연도 보여 준다
      if (stepPopup.current !== 'emoji' && !openEmojiHelp(true, true)) finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 강조한 것을 사람이 눌렀으면 다음으로 · ④에서 창을 닫으면 끝
  useEffect(() => {
    if (step === 0 && popup === 'shop') setStep(1);
    if (step === 2 && popup === 'emoji') setStep(3);
    if (step === 3 && popup === 'emoji') emojiSeen.current = true;
    if (step === 3 && popup !== 'emoji' && emojiSeen.current) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, step]);
  useEffect(() => {
    if (step !== 3) return undefined;
    const on = () => finish();
    window.addEventListener(EMOJI_HELP_CLOSED, on);
    return () => window.removeEventListener(EMOJI_HELP_CLOSED, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // Esc = 건너뛰기
  useEffect(() => {
    if (step === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      skip();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 강조할 것의 자리(매 프레임 — 창이 뜨는 애니메이션 · 크기 바뀜을 따라간다)
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (step === null) {
      setBox(null);
      return undefined;
    }
    let raf = 0;
    const sel = targetSel(step, mobile);
    const tick = () => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
      const r = el?.getBoundingClientRect();
      setBox((prev) => {
        if (!r || r.width === 0) return prev === null ? prev : null;
        const pad = 6;
        const next = { x: Math.round(r.left - pad), y: Math.round(r.top - pad), w: Math.round(r.width + pad * 2), h: Math.round(r.height + pad * 2) };
        return prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next;
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step, mobile]);

  const skip = () => {
    const s = stepRef.current;
    if (s === 0 && mobile) closePopup('menu');
    if (s === 1) closePopup('shop');
    finish();
  };
  const next = () => {
    if (step === null) return;
    if (step === STEPS - 1) {
      finish();
      return;
    }
    setStep((step + 1) as Step);
  };

  if (step === null) return null;
  const n = step + 1;
  const draw = price ?? 20;
  const text: { title: string; lines: string[] } = [
    {
      title: mobile ? '☰ 메뉴 → 🎁 포인트샵' : '🎁 포인트샵',
      lines: [`가입 선물로 ${SIGNUP_GIFT_POINTS}P를 드렸어요`, balance !== null ? `지금 ${balance.toLocaleString('ko-KR')}P` : ''].filter(Boolean),
    },
    { title: `뽑기 ${draw}P`, lines: ['포인트는 이모티콘 뽑기에 써요', '맞힌 문제 1개 = 1P'] },
    { title: '😊 이모티콘', lines: ['눌러서 열고 골라 보내요'] },
    { title: '단축키 등록', lines: [mobile ? '길게 눌러 1~0 자리로 끌어요' : '끌어서 1~0 자리에 놓아요', "'다시 보지 않음'도 여기서"] },
  ][step]!;

  // 말풍선 자리 — 구멍 아래(자리가 없으면 위) · 좌우는 화면 안
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = Math.min(300, vw - 24);
  const bh = 128;
  let bx = 12;
  let by = vh / 2 - bh / 2;
  if (box) {
    bx = Math.max(12, Math.min(vw - bw - 12, box.x + box.w / 2 - bw / 2));
    by = box.y + box.h + 10 + bh <= vh - 8 ? box.y + box.h + 10 : Math.max(8, box.y - bh - 10);
  }
  const hole = box ?? { x: vw / 2, y: vh / 2, w: 0, h: 0 };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div className="tour" data-tour data-tour-step={n} onPointerDown={stop} onClick={stop}>
      {/* 구멍 둘레 네 판 — 누르기를 막는다(구멍 안은 눌린다) */}
      <div className="tour-shade" style={{ left: 0, top: 0, width: vw, height: Math.max(0, hole.y) }} />
      <div className="tour-shade" style={{ left: 0, top: hole.y + hole.h, width: vw, height: Math.max(0, vh - hole.y - hole.h) }} />
      <div className="tour-shade" style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
      <div className="tour-shade" style={{ left: hole.x + hole.w, top: hole.y, width: Math.max(0, vw - hole.x - hole.w), height: hole.h }} />
      {box && <div className="tour-ring" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      <div className="tour-bubble" role="dialog" aria-label="처음 안내" style={{ left: bx, top: by, width: bw }}>
        <p className="tour-title">
          <span>{text.title}</span>
          <span className="tour-count mono">
            {n}/{STEPS}
          </span>
        </p>
        {text.lines.map((l) => (
          <p key={l} className="tour-line">
            {l}
          </p>
        ))}
        <div className="tour-actions">
          <button type="button" className="ghost tiny" data-tour-skip onClick={skip}>
            건너뛰기
          </button>
          <button type="button" className="primary tiny" data-tour-next autoFocus onClick={next}>
            {n === STEPS ? '끝' : '다음'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
