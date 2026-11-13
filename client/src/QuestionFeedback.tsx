// =============================================================================
// ★★★ 지난 판 문제 목록 — R056 · D-246 문제 평가(설문)에서 ★ R099 평가 입력을 뺀 것
//
// ★★★ R099 (찬종 2026-11-12 · #127 "왜 문제 평가를 안 받아?" 에 답): "평가 버튼 그냥 빼자. 평가는 나만 할게 — 제보로.
//   다른 애들은 포인트 벌 생각밖에 없어." → 공개 화면 평가 줄(R056 · R068 +1P · R071 요청 문항) · 결과 · 로비 목록의 👍 😐 👎 · 사유 · 의견을 뺐다.
// ★ 남긴 것: 문제 목록(번호 · 문항 번호 복사 · 질문 앞 60자 → 누르면 전체 · 정답) + 줄마다 제보(📝 — 그 문항이 채워진 제보 창).
//   (나) 결과 화면 — ResultFeedback: 순위 아래 접이식 "이번 판 문제" (늘 접힌 채 시작 · 펼침은 기억)
//   (다) 로비 — LastGameFeedback: "지난 판 문제" 링크 → 같은 목록을 팝업으로(D-217 — ✕ · 바깥 · Esc)
// ★ 미니게임 문항은 넣지 않는다(퀴즈 문제만).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { fetchGameFeedback, type FeedbackItem } from './api.js';
import { usePopup } from './popup.js';
import { QNo, QReportButton } from './AppReport.js';
import { useUiMode } from './uiMode.js';

// ── (나)(다) 결과 · 로비 목록 ─────────────────────────────────────────────────
/** 모바일 접힌 줄에 보이는 질문 앞 글자 수 */
const MOBILE_HEAD = 28;
const headOf = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n).join('')}…` : s);

function FeedbackRow({ item, open, onToggle }: { item: FeedbackItem; open: boolean; onToggle: () => void }) {
  const mobile = useUiMode() === 'mobile';
  const full = item.full ?? item.text;
  const shown = open ? full : mobile ? headOf(full, MOBILE_HEAD) : item.text;
  return (
    <li className={`fb-row${open ? ' open' : ''}`} data-fb-question={item.questionId}>
      <div className="fb-row-head">
        {/* ★ R063 — 번호 둘(순번 · #id)은 고정폭 열 — 자릿수가 달라도 질문 시작 자리가 같다 */}
        <span className="fb-no mono">{item.index}</span>
        {/* ★ R061 — 문항 번호(누르면 복사) */}
        <QNo id={item.questionId} />
        <button type="button" className="fb-q" aria-expanded={open} onClick={onToggle}>
          {/* ★ 질문은 복사 막기 그대로(R050) */}
          <span className="fb-text no-copy" data-wrap-ok={open || undefined}>{shown}</span>
          {(open || !mobile) && (
            <span className="fb-answer dim">
              정답 <strong>{item.answer}</strong>
            </span>
          )}
        </button>
        <QReportButton questionId={item.questionId} questionIndex={item.index} />
      </div>
    </li>
  );
}

/** 이번 판 문제 목록 불러오기 */
function useGameFeedbackItems(gameId: string) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setItems(null);
    setErr(false);
    fetchGameFeedback(gameId)
      .then((x) => alive && setItems(x))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [gameId]);
  return { items, err };
}

function FeedbackListView({ items, err }: { items: FeedbackItem[] | null; err: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (err) return <p className="dim fb-empty">문제 목록을 불러오지 못했어요.</p>;
  if (!items) return <p className="dim fb-empty">불러오는 중…</p>;
  if (items.length === 0) return <p className="dim fb-empty">문제가 없어요.</p>;
  return (
    <ol className="fb-list" data-loaded="1">
      {items.map((it) => (
        <FeedbackRow key={it.questionId} item={it} open={openId === it.questionId} onToggle={() => setOpenId((x) => (x === it.questionId ? null : it.questionId))} />
      ))}
    </ol>
  );
}

export function FeedbackList({ gameId }: { gameId: string }) {
  const { items, err } = useGameFeedbackItems(gameId);
  return <FeedbackListView items={items} err={err} />;
}

const OPEN_KEY = 'qw.fbResultOpen';
const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

/** 결과 화면 — 순위 아래 접이식. ★ PC 는 결과 카드가 남는 높이만 쓰고 목록만 줄어든다(안에서 스크롤)
 *  ★ R068 (찬종 #68) — 늘 접힌 채로 시작 · 직접 펼치면 그 뒤로 펼친 채(localStorage) · 접혀 있어도 머리 줄에 문제 수. */
export function ResultFeedback({ gameId }: { gameId: string }) {
  const { items, err } = useGameFeedbackItems(gameId);
  const [open, setOpenState] = useState<boolean>(readOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      /* 저장 못 해도 화면은 그대로 */
    }
  };
  return (
    <div className={open ? 'fb-result open' : 'fb-result'} data-fb-default={open ? 'open' : 'closed'}>
      <button type="button" className="fb-result-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon icon={open ? ChevronDown : ChevronRight} />
        <Icon icon={ClipboardList} /> 이번 판 문제
        {items && items.length > 0 && (
          <span className="mono fb-count" data-fb-count>
            {items.length}문제
          </span>
        )}
      </button>
      {open && <FeedbackListView items={items} err={err} />}
    </div>
  );
}

/** 로비 — "지난 판 문제" 링크 + 팝업(D-217 — ✕ · 바깥 · Esc) */
export function LastGameFeedback({ gameId }: { gameId: string }) {
  const [open, setOpen] = usePopup('feedback-last');
  const close = useCallback(() => setOpen(false), [setOpen]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);
  return (
    <>
      <button type="button" id="feedback-last-btn" className="link-btn fb-last-btn" onClick={() => setOpen(true)}>
        <Icon icon={ClipboardList} /> 지난 판 문제
      </button>
      {open &&
        createPortal(
          <div
            className="modal-back popup-back"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="modal fb-modal" role="dialog" aria-label="지난 판 문제">
              <div className="pop-head">
                <p className="pop-title">
                  <Icon icon={ClipboardList} /> 지난 판 문제
                </p>
                <PopupClose onClose={close} />
              </div>
              <FeedbackList gameId={gameId} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
