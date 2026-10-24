// =============================================================================
// ★★★ 포인트샵 · 뽑기(갓챠) (R049 / D-231)
//
// ★ 찬종: "포인트샵을 만들어서 언제든지 (게임 플레이 중이더라도) 방문해서 내가 여태 맞힌 문제수 = 1 point 로 해서 돈처럼 쓸 수 있게.
//   테마는 선택할 수 있지만 원하는 gif 를 고를 수는 없어. 무작위 뽑기 시스템이야. 각 테마별로 내가 보유한 이모티콘 개수를 보여주고 (0/27) …
//   갓챠 애니메이션 효과도 있으면 좋겠지."
// ★ 입구: 상단 바 🎁 "포인트샵"(로비 · 게임 중 · 결과) · 모바일 ☰ 한 줄 · 방 목록 화면 오른쪽 위. 전부 **이 창 하나**.
// ★ 창: 맨 위 "내 포인트 N" → 테마 카드(이름 · 값 · 보유 x/N · 격자: 가진 것은 그림, 못 가진 것은 흐린 물음표) → [뽑기 — 20P]
//   · 포인트가 모자라면 비활성 + "N점 모자라요" · 다 모으면 "완성!" 비활성 (환불 · 재뽑기 없음 — 찬종 확정)
// ★ 뽑기: 서버 응답을 **받은 뒤** 애니메이션(캡슐이 흔들리다 열림 · 약 1.5초 · 누르면 건너뜀 · 효과음은 정답 코인 소리)
//   → 결과 카드("새 이모티콘! 치이카와 3 · 7/27") → [한 번 더] [닫기]. 뽑은 뒤 이모티콘 목록을 다시 받아 고르기 창 ✨ 탭에 바로 나온다.
// ★ 팝업 규칙(popup.ts — 한 번에 하나 · ✕ · 바깥 · Esc) 그대로. 닫으면 채팅 입력으로 포커스를 돌린다 (onClosed).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import Emoji from './Emoji.js';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { DrawError, drawEmoji, fetchShop, type DrawResult, type ShopView } from './api.js';
import { reloadEmojiCatalog, setStoredSlots, useEmojiCatalog, useEmojiSlots } from './emojiCatalog.js';
import { openEmojiGuide } from './EmojiGuide.js';
import { getFlag } from './accountFlags.js';
import { usePopup } from './popup.js';
import { sfx } from './sound.js';
import { useDismiss } from './useDismiss.js';
import { setFlag, useFlag } from './accountFlags.js';

/**
 * ★★ R066 (D-288 · 찬종 #39 "최초 가입 후에 '포인트샵'에 빨간불 알림 표시해서 … 이모티콘 구매 유도") —
 *   포인트샵을 한 번도 안 열었고 포인트가 있으면 빨간 점(위 막대 · 모바일 ☰ · 메뉴 줄). 열면 꺼진다(계정에 저장).
 */
let dotBalance: number | null = null;
export function useShopDot(): boolean {
  const opened = useFlag('shopOpened');
  const [bal, setBal] = useState<number | null>(dotBalance);
  useEffect(() => {
    if (opened || dotBalance !== null) return undefined;
    let alive = true;
    void fetchShop().then((v) => {
      dotBalance = v?.balance ?? 0;
      if (alive) setBal(dotBalance);
    });
    return () => {
      alive = false;
    };
  }, [opened]);
  return !opened && (bal ?? 0) > 0;
}

interface Props {
  /** 창이 닫힌 뒤 (로비: 채팅 입력으로 포커스 복귀) */
  onClosed?: () => void;
}

/** 갓챠 연출 길이 (캡슐 흔들림 1.0초 + 열림 0.5초). 누르면 건너뛴다 */
const GACHA_MS = 1500;

type Stage = { kind: 'list' } | { kind: 'drawing'; result: DrawResult } | { kind: 'result'; result: DrawResult };

export default function ShopPanel({ onClosed }: Props) {
  const [open, setOpen] = usePopup('shop');
  const close = useCallback(() => {
    setOpen(false);
    onClosed?.();
  }, [setOpen, onClosed]);
  useDismiss(open, close, '.shop');
  const cat = useEmojiCatalog();

  const [shop, setShop] = useState<ShopView | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'list' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  // ★ R066 (D-290 · 찬종 #40) — 첫 구매면 1번 자리에 넣고 결과를 보여 준 뒤 가이드를 연다(한 번만)
  const slots = useEmojiSlots();
  const guideFor = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const v = await fetchShop();
    if (v) setShop(v);
    return v;
  }, []);

  // 창을 열 때마다 새로 읽는다 (게임 중에 맞혀 포인트가 늘었을 수 있다)
  useEffect(() => {
    if (!open) {
      setStage({ kind: 'list' });
      setErr(null);
      return undefined;
    }
    let alive = true;
    setFlag('shopOpened');
    void fetchShop().then((v) => {
      if (alive && v) setShop(v);
    });
    return () => {
      alive = false;
    };
  }, [open]);
  const dot = useShopDot();
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reveal = (result: DrawResult) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    sfx('correct');
    setStage({ kind: 'result', result });
    if (guideFor.current !== null) {
      const id = guideFor.current;
      guideFor.current = null;
      window.setTimeout(() => openEmojiGuide(id), 700);
    }
  };

  const draw = async (themeKey: string) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const first = shop !== null && shop.themes.every((t) => t.owned.length === 0);
      const result = await drawEmoji(themeKey);
      if (first) {
        const next = [...slots];
        next[0] = result.emoji.id;
        setStoredSlots(next);
        if (!getFlag('emojiGuideSeen')) guideFor.current = result.emoji.id;
      }
      // ★ 서버가 확정한 뒤에만 연출 — 연출 중에 실패해 보이는 일이 없다
      setStage({ kind: 'drawing', result });
      timer.current = window.setTimeout(() => reveal(result), GACHA_MS);
      // 목록(고르기 창 ✨ 탭 · 보유 격자)을 미리 받아 둔다
      void reloadEmojiCatalog();
      void refresh();
    } catch (e) {
      if (e instanceof DrawError) {
        setErr(e.message);
        void refresh();
      } else setErr('뽑기에 실패했어요. 다시 해 주세요.');
      setStage({ kind: 'list' });
    } finally {
      setBusy(false);
    }
  };

  const themeOf = (key: string) => shop?.themes.find((t) => t.key === key) ?? null;

  return (
    <span className="shop">
      <button type="button" id="shop-btn" className="ghost tiny" aria-expanded={open} aria-label="포인트샵" onClick={() => setOpen((v) => !v)}>
        <Icon icon={Gift} />
        <span className="lbl">포인트샵</span>
        {dot && <span className="red-dot" data-shop-dot aria-label="새 포인트샵" />}
      </button>
      {open && (
        <div className="shop-pop" role="dialog" aria-label="포인트샵">
          <div className="pop-head">
            <p className="pop-title">
              <Icon icon={Gift} /> 포인트샵
            </p>
            <PopupClose onClose={close} />
          </div>
          {/* ★ 맨 위 — 내 포인트 */}
          <p className="shop-points" aria-live="polite">
            <span className="dim">내 포인트</span> <strong className="mono">{shop ? shop.balance.toLocaleString('ko-KR') : '—'}</strong>
            {/* ★ R066 (D-287 · 찬종 #39) — 얻는 길 설명은 ⓘ 안내 "포인트" 로 옮겼다 */}
          </p>

          {stage.kind === 'list' && (
            <div className="shop-list">
              {shop === null && <p className="dim">불러오는 중…</p>}
              {shop?.themes.length === 0 && <p className="dim">아직 테마가 없어요</p>}
              {shop?.themes.map((t) => {
                const done = t.owned.length >= t.total;
                const short = t.price - shop.balance;
                const ownedSet = new Set(t.owned);
                const ids = cat ? cat.list.filter((e) => e.category === 'special' && cat.themes.some((th) => th.key === t.key && th.id === e.themeId)).map((e) => e.id) : [];
                return (
                  <section key={t.key} className={done ? 'shop-theme done' : 'shop-theme'} data-theme-key={t.key}>
                    <div className="shop-theme-head">
                      <h3 className="shop-theme-name">{t.name}</h3>
                      <span className="shop-theme-price mono">{t.price}P</span>
                      <span className="shop-theme-owned mono" aria-label="보유">
                        {t.owned.length}/{t.total}
                      </span>
                    </div>
                    <div className="shop-grid" aria-label={`${t.name} 이모티콘`}>
                      {ids.map((id) =>
                        ownedSet.has(id) ? (
                          <span key={id} className="shop-cell has">
                            <Emoji id={id} size={28} />
                          </span>
                        ) : (
                          <span key={id} className="shop-cell none" aria-hidden="true">
                            ?
                          </span>
                        ),
                      )}
                      {ids.length === 0 && Array.from({ length: t.total }, (_, i) => (
                        <span key={i} className="shop-cell none" aria-hidden="true">
                          ?
                        </span>
                      ))}
                    </div>
                    {done ? (
                      <button type="button" className="primary shop-draw" disabled>
                        <Icon icon={Sparkles} /> 완성!
                      </button>
                    ) : short > 0 ? (
                      <button type="button" className="primary shop-draw" disabled>
                        {short}점 모자라요
                      </button>
                    ) : (
                      <button type="button" className="primary shop-draw" disabled={busy} onClick={() => void draw(t.key)}>
                        <Icon icon={Gift} /> 뽑기 — {t.price}P
                      </button>
                    )}
                  </section>
                );
              })}
              {err && <p className="form-error shop-msg">{err}</p>}
            </div>
          )}

          {stage.kind === 'drawing' && (
            // ★ 갓챠 — 캡슐이 흔들리다 열린다 (CSS 만). 누르면 바로 결과
            <button type="button" className="gacha" aria-label="뽑는 중 — 누르면 바로 보기" onClick={() => reveal(stage.result)}>
              <span className="gacha-capsule" aria-hidden="true">
                <span className="gacha-top" />
                <span className="gacha-bottom" />
                <span className="gacha-shine" />
              </span>
              <span className="gacha-tip">두근두근…</span>
            </button>
          )}

          {stage.kind === 'result' && (
            <div className="gacha-result" role="status" aria-live="polite">
              <p className="gacha-result-title">
                <Icon icon={Sparkles} /> 새 이모티콘!
              </p>
              <span className="gacha-result-pic">
                <Emoji id={stage.result.emoji.id} size={96} />
              </span>
              <p className="gacha-result-name">
                <strong>{stage.result.emoji.name}</strong>
                <span className="dim mono">
                  {' '}
                  · {stage.result.owned.length}/{stage.result.total}
                </span>
              </p>
              <div className="gacha-result-actions" data-arrow-nav>
                {(() => {
                  const t = themeOf(stage.result.emoji.themeKey);
                  const done = stage.result.owned.length >= stage.result.total;
                  const short = stage.result.price - (shop?.balance ?? stage.result.balance);
                  if (done)
                    return (
                      <button type="button" className="primary" disabled>
                        <Icon icon={Sparkles} /> 완성!
                      </button>
                    );
                  if (short > 0)
                    return (
                      <button type="button" className="primary" disabled>
                        {short}점 모자라요
                      </button>
                    );
                  return (
                    <button type="button" className="primary" autoFocus disabled={busy} onClick={() => void draw(t?.key ?? stage.result.emoji.themeKey)}>
                      한 번 더 — {stage.result.price}P
                    </button>
                  );
                })()}
                <button type="button" className="ghost" onClick={() => setStage({ kind: 'list' })}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
