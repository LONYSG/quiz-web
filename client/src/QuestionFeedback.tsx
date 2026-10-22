// =============================================================================
// ★★★ 문제 평가(설문) — R056 · D-246
//
// ★ 찬종(2026-10-21): "문제마다 별로인 문제 평가 버튼이 따로 있어서 설문조사를 하게 하면 어때? 선택지를 몇개 지정 + 기타 의견란도."
// ★ 세 곳:
//   (가) 정답 공개 화면(8초) — RevealFeedback: 👍 좋아 · 👎 별로(Lucide 선 아이콘 + 글자 — 반응 이모티콘과 구분).
//        누르면 바로 저장 · 다시 누르면 취소. 👎 면 **같은 줄**에 사유 칩(다중 · 가로 스크롤) — 카드가 세로로 늘지 않는다.
//        ★ 입력창 포커스를 빼앗지 않는다(채팅 = 답안) — 누를 때 mousedown 기본 동작을 막는다(전송 버튼과 같은 방법). 기타 의견은 여기서 안 받는다.
//   (나) 결과 화면 — FeedbackList: 문제 번호 · 질문 앞 60자(복사 막기) · 정답 · 👍/👎 · 사유 칩 · 기타 의견(≤200자 · 칸을 벗어나면 저장).
//   (다) 로비 — "지난 판 문제 평가" 링크 → 같은 목록을 팝업으로(FeedbackPopup).
// ★ 포인트 보상 없음 · 미니게임 문항은 넣지 않는다(퀴즈 문제만).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, ClipboardList, ThumbsDown, ThumbsUp } from 'lucide-react';
import { FEEDBACK_ADOPT_POINTS, FEEDBACK_COMMENT_MAX, FEEDBACK_REASONS } from '@quiz/shared';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { fetchGameFeedback, postQuestionFeedback, type FeedbackItem } from './api.js';
import { usePopup } from './popup.js';
import { useUiMode } from './uiMode.js';

type Vote = 1 | -1 | null;

/** 누를 때 포커스가 버튼으로 가지 않게 — 입력창(답안)과 휴대폰 키보드를 그대로 둔다 */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** 👍 / 👎 두 버튼 */
function VoteButtons({ vote, onVote, compact }: { vote: Vote; onVote: (v: 1 | -1) => void; compact?: boolean }) {
  return (
    <span className="fb-votes">
      <button
        type="button"
        className={vote === 1 ? 'fb-vote up on' : 'fb-vote up'}
        aria-pressed={vote === 1}
        aria-label="좋아"
        title="좋아"
        onMouseDown={keepFocus}
        onClick={() => onVote(1)}
      >
        <Icon icon={ThumbsUp} />
        {!compact && <span className="fb-vote-lbl">좋아</span>}
      </button>
      <button
        type="button"
        className={vote === -1 ? 'fb-vote down on' : 'fb-vote down'}
        aria-pressed={vote === -1}
        aria-label="별로"
        title={`별로 — 사유·의견이 채택되면 보너스 ${FEEDBACK_ADOPT_POINTS}P`}
        onMouseDown={keepFocus}
        onClick={() => onVote(-1)}
      >
        <Icon icon={ThumbsDown} />
        {!compact && <span className="fb-vote-lbl">별로</span>}
      </button>
    </span>
  );
}

/** 사유 칩 한 줄 (다중 선택 · 가로로 넘치면 가로 스크롤 — 스크롤바는 숨기고(높이가 늘지 않게) 마우스 휠도 가로로) */
function ReasonChips({ reasons, onToggle }: { reasons: string[]; onToggle: (code: string) => void }) {
  return (
    <span
      className="fb-chips"
      role="group"
      aria-label="별로인 이유"
      onWheel={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        el.scrollLeft += e.deltaY;
      }}
    >
      {FEEDBACK_REASONS.map((r) => (
        <button
          key={r.code}
          type="button"
          className={reasons.includes(r.code) ? 'fb-chip on' : 'fb-chip'}
          aria-pressed={reasons.includes(r.code)}
          data-reason={r.code}
          onMouseDown={keepFocus}
          onClick={() => onToggle(r.code)}
        >
          {r.label}
        </button>
      ))}
    </span>
  );
}

/** 한 문제의 평가 상태 + 저장(낙관적 — 실패하면 되돌린다) */
function useFeedback(gameId: string, questionId: string, init?: { vote: Vote; reasons: string[]; comment: string | null }) {
  const [vote, setVote] = useState<Vote>(init?.vote ?? null);
  const [reasons, setReasons] = useState<string[]>(init?.reasons ?? []);
  const [comment, setComment] = useState<string>(init?.comment ?? '');
  const [error, setError] = useState(false);
  const saved = useRef({ vote: init?.vote ?? null, reasons: init?.reasons ?? [], comment: init?.comment ?? '' });
  const save = useCallback(
    (next: { vote: Vote; reasons: string[]; comment: string }) => {
      const prev = saved.current;
      setVote(next.vote);
      setReasons(next.reasons);
      setError(false);
      postQuestionFeedback({ questionId, gameId, vote: next.vote, reasons: next.reasons, comment: next.comment.trim() || null })
        .then(() => {
          saved.current = next;
        })
        .catch(() => {
          setVote(prev.vote);
          setReasons(prev.reasons);
          setComment(prev.comment);
          setError(true);
        });
    },
    [gameId, questionId],
  );
  const onVote = (v: 1 | -1) => {
    // 같은 것을 다시 누르면 취소 · 👍 로 바꾸면 사유 · 의견은 버린다(서버도 같다)
    if (vote === v) save({ vote: null, reasons: [], comment: '' });
    else save({ vote: v, reasons: v === -1 ? reasons : [], comment: v === -1 ? comment : '' });
    if (v === 1 || vote === v) setComment('');
  };
  const onToggle = (code: string) => {
    const next = reasons.includes(code) ? reasons.filter((c) => c !== code) : [...reasons, code];
    save({ vote: -1, reasons: next, comment });
  };
  const commitComment = () => {
    if (vote !== -1 || comment.trim() === (saved.current.comment ?? '').trim()) return;
    save({ vote: -1, reasons, comment });
  };
  return { vote, reasons, comment, setComment, error, onVote, onToggle, commitComment };
}

// ── (가) 정답 공개 화면 ─────────────────────────────────────────────────────────
export function RevealFeedback({ gameId, questionId }: { gameId: string; questionId: string }) {
  const f = useFeedback(gameId, questionId);
  return (
    <span className={f.vote === -1 ? 'reveal-fb down' : 'reveal-fb'} data-fb-question={questionId}>
      <VoteButtons vote={f.vote} onVote={f.onVote} compact={f.vote === -1} />
      {f.vote === -1 && <ReasonChips reasons={f.reasons} onToggle={f.onToggle} />}
      {f.error && <span className="fb-err">저장 실패</span>}
    </span>
  );
}

// ── (나) 결과 화면 · (다) 로비 팝업 — 이번 판 문제 목록 ─────────────────────────────
function FeedbackRow({ gameId, item }: { gameId: string; item: FeedbackItem }) {
  const f = useFeedback(gameId, item.questionId, { vote: item.vote, reasons: item.reasons, comment: item.comment });
  return (
    <li className={f.vote === -1 ? 'fb-row down' : 'fb-row'} data-fb-question={item.questionId}>
      <div className="fb-row-head">
        <span className="fb-no mono">{item.index}</span>
        <span className="fb-q">
          {/* ★ 질문은 복사 막기 그대로(R050) */}
          <span className="fb-text no-copy">{item.text}</span>
          <span className="fb-answer dim">
            정답 <strong>{item.answer}</strong>
          </span>
        </span>
        <VoteButtons vote={f.vote} onVote={f.onVote} compact />
      </div>
      {f.vote === -1 && (
        <div className="fb-row-more">
          <ReasonChips reasons={f.reasons} onToggle={f.onToggle} />
          <input
            className="fb-comment"
            value={f.comment}
            maxLength={FEEDBACK_COMMENT_MAX}
            placeholder={`기타 의견 (${FEEDBACK_COMMENT_MAX}자까지)`}
            aria-label="기타 의견"
            onChange={(e) => f.setComment(e.target.value)}
            onBlur={f.commitComment}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                f.commitComment();
              }
            }}
          />
        </div>
      )}
      {f.error && <p className="fb-err">저장하지 못했어요. 다시 눌러 주세요.</p>}
    </li>
  );
}

/** 이번 판 문제 목록 + 내 평가 불러오기 */
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

function FeedbackListView({ gameId, items, err }: { gameId: string; items: FeedbackItem[] | null; err: boolean }) {
  if (err) return <p className="dim fb-empty">문제 목록을 불러오지 못했어요.</p>;
  if (!items) return <p className="dim fb-empty">불러오는 중…</p>;
  if (items.length === 0) return <p className="dim fb-empty">평가할 문제가 없어요.</p>;
  return (
    <ol className="fb-list" data-loaded="1">
      {items.map((it) => (
        <FeedbackRow key={it.questionId} gameId={gameId} item={it} />
      ))}
    </ol>
  );
}

export function FeedbackList({ gameId }: { gameId: string }) {
  const { items, err } = useGameFeedbackItems(gameId);
  return <FeedbackListView gameId={gameId} items={items} err={err} />;
}

/** 결과 화면 — 순위 아래 접이식. ★ PC 는 결과 카드가 남는 높이만 쓰고 목록만 줄어든다(안에서 스크롤)
 *  ★ R058 (A80 · D-252 앞) — PC 는 **기본 접힘**(채팅 칸을 R055 처럼 넓게) · 공개 화면에서 👍/👎 를 하나라도 눌렀으면 펼침 ·
 *    모바일은 그대로 펼침(세로 스크롤). 직접 접고 펼친 것은 그대로 둔다. */
export function ResultFeedback({ gameId }: { gameId: string }) {
  const mode = useUiMode();
  const { items, err } = useGameFeedbackItems(gameId);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const voted = !!items?.some((it) => it.vote !== null);
  const open = userOpen ?? (mode === 'mobile' || voted);
  return (
    <div className={open ? 'fb-result open' : 'fb-result'} data-fb-default={userOpen === null ? (open ? 'open' : 'closed') : undefined}>
      <button type="button" className="fb-result-head" aria-expanded={open} onClick={() => setUserOpen(!open)}>
        <Icon icon={open ? ChevronDown : ChevronRight} />
        <Icon icon={ClipboardList} /> 이번 판 문제 평가 <span className="dim fb-sub">별로인 문제를 알려 주세요</span>
        {/* ★ R059 (D-254) — 접혀 있어도 보이게 머리 줄에 */}
        <span className="fb-bonus" data-fb-bonus>
          👎 사유·의견이 채택되면 보너스 포인트를 드려요(채택 1건 {FEEDBACK_ADOPT_POINTS}P)
        </span>
      </button>
      {open && <FeedbackListView gameId={gameId} items={items} err={err} />}
    </div>
  );
}

/** 로비 — "지난 판 문제 평가" 링크 + 팝업(D-217 — ✕ · 바깥 · Esc) */
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
        <Icon icon={ClipboardList} /> 지난 판 문제 평가 <span className="dim fb-bonus-tip">· 채택되면 포인트</span>
      </button>
      {open &&
        createPortal(
          <div
            className="modal-back popup-back"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="modal fb-modal" role="dialog" aria-label="지난 판 문제 평가">
              <div className="pop-head">
                <p className="pop-title">
                  <Icon icon={ClipboardList} /> 지난 판 문제 평가
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
