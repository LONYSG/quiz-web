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
// ★★★ R068 (찬종 2026-10-26 · docs/19 §7) — 3단계 👍 좋아요 · 😐 그냥 · 👎 별로(RATE_CHOICES) · 다시 눌러 취소는 없앴다(바꾸기만).
//   (가) 공개 화면: "방금 문제 어땠어요? (+1P)" → 누르면 그 자리가 "+1P 고마워요"(포인트는 서버가 판단 — 공개 중 첫 평가 한 번) · 사유 칩은 공개 화면에서 뺐다.
//   (나)(다) 결과 · 로비: 같은 3단계(0P) · 머리에 "공개 시간에 누르면 +1P · 자세한 의견은 제보에 적어 주세요(채택되면 +5P)" + 제보 링크 · 👎 사유 · 의견 그대로.
//   결과 화면 목록은 늘 접힌 채로 시작(찬종 #68) · 펼침은 기억(localStorage) · 접혀 있어도 평가 수가 보인다.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import { FEEDBACK_ADOPT_POINTS, FEEDBACK_COMMENT_MAX, FEEDBACK_REASONS, RATE_CHOICES, RATE_POINTS } from '@quiz/shared';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { fetchGameFeedback, postQuestionFeedback, type FeedbackItem } from './api.js';
import { usePopup } from './popup.js';
import { QNo, QReportButton, useOpenReportAt } from './AppReport.js';
import { useUiMode } from './uiMode.js';

type Vote = 1 | 0 | -1 | null;

/** 누를 때 포커스가 버튼으로 가지 않게 — 입력창(답안)과 휴대폰 키보드를 그대로 둔다 */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** ★ R068 — 👍 좋아요 · 😐 그냥 · 👎 별로 (compact = 그림만) */
function VoteButtons({ vote, onVote, compact }: { vote: Vote; onVote: (v: 1 | 0 | -1) => void; compact?: boolean }) {
  return (
    <span className="fb-votes" role="group" aria-label="방금 문제 평가">
      {RATE_CHOICES.map((c) => (
        <button
          key={c.vote}
          type="button"
          className={`fb-vote ${c.vote === 1 ? 'up' : c.vote === 0 ? 'mid' : 'down'}${vote === c.vote ? ' on' : ''}`}
          aria-pressed={vote === c.vote}
          aria-label={c.label}
          title={c.label}
          data-vote={c.vote}
          onMouseDown={keepFocus}
          onClick={() => onVote(c.vote)}
        >
          <span className="fb-vote-emoji" aria-hidden="true">
            {c.emoji}
          </span>
          {!compact && <span className="fb-vote-lbl">{c.label}</span>}
        </button>
      ))}
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
  // ★ R068 — 이번에 받은 포인트(공개 중 첫 평가 1P) · 응답이 왔나
  const [granted, setGranted] = useState(0);
  const [answered, setAnswered] = useState(false);
  const saved = useRef({ vote: init?.vote ?? null, reasons: init?.reasons ?? [], comment: init?.comment ?? '' });
  const save = useCallback(
    (next: { vote: Vote; reasons: string[]; comment: string }) => {
      const prev = saved.current;
      setVote(next.vote);
      setReasons(next.reasons);
      setError(false);
      postQuestionFeedback({ questionId, gameId, vote: next.vote, reasons: next.reasons, comment: next.comment.trim() || null })
        .then((r) => {
          saved.current = next;
          setAnswered(true);
          if (r.granted > 0) {
            setGranted((g) => g + r.granted);
            // ★ 잔액 다시 읽기(포인트샵 빨간 점 · 프로필) — 지급 토스트와 같은 길
            window.dispatchEvent(new Event('qw:grants'));
          }
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
  const onVote = (v: 1 | 0 | -1) => {
    // ★ R068 — 같은 것을 다시 눌러도 그대로(취소 없음) · 👎 가 아니면 사유 · 의견은 버린다(서버도 같다)
    if (vote === v) return;
    save({ vote: v, reasons: v === -1 ? reasons : [], comment: v === -1 ? comment : '' });
    if (v !== -1) setComment('');
  };
  const onToggle = (code: string) => {
    const next = reasons.includes(code) ? reasons.filter((c) => c !== code) : [...reasons, code];
    save({ vote: -1, reasons: next, comment });
  };
  const commitComment = () => {
    if (vote !== -1 || comment.trim() === (saved.current.comment ?? '').trim()) return;
    save({ vote: -1, reasons, comment });
  };
  return { vote, reasons, comment, setComment, error, granted, answered, onVote, onToggle, commitComment };
}

// ── (가) 정답 공개 화면 ─────────────────────────────────────────────────────────
/** ★ R068 — "방금 문제 어땠어요? (+1P)" + 3단계 → 누르면 "+1P 고마워요"(바꾸기는 공개 시간 안에서만 · 포인트는 한 번) */
export function RevealFeedback({ gameId, questionId }: { gameId: string; questionId: string }) {
  const f = useFeedback(gameId, questionId);
  const picked = f.vote !== null;
  // ★ R069 (끝 점검 — main-layout C-4) — 모바일은 물음을 따로 한 줄에 두면 긴 문제의 공개 카드가 넘쳤다 → 한 줄 "+1P" + 버튼 셋
  const mobile = useUiMode() === 'mobile';
  return (
    <span className={picked ? 'reveal-fb picked' : 'reveal-fb'} data-fb-question={questionId} data-rate-granted={f.granted || undefined}>
      <span className="reveal-fb-ask" data-rate-ask aria-live="polite" title={`방금 문제 어땠어요? (+${RATE_POINTS}P)`}>
        {!picked ? (mobile ? `+${RATE_POINTS}P` : `방금 문제 어땠어요? (+${RATE_POINTS}P)`) : f.granted > 0 ? `+${f.granted}P 고마워요` : f.answered ? '고마워요' : '…'}
      </span>
      {/* ★ R069 — 모바일은 그림만(이름은 aria · title) — 360 에서 "N초 후" 와 한 줄 */}
      <VoteButtons vote={f.vote} onVote={f.onVote} compact={picked || mobile} />
      {f.error && <span className="fb-err">저장 실패</span>}
    </span>
  );
}

// ── (나) 결과 화면 · (다) 로비 팝업 — 이번 판 문제 목록 ─────────────────────────────
/** ★ R063 (D-257) — 모바일은 질문 앞 28자 · 줄을 누르면 전체 질문 · 정답(한 줄만 펼침) */
const MOBILE_HEAD = 28;
const headOf = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n).join('')}…` : s);

function FeedbackRow({ gameId, item, open, onToggle }: { gameId: string; item: FeedbackItem; open: boolean; onToggle: () => void }) {
  const mobile = useUiMode() === 'mobile';
  const f = useFeedback(gameId, item.questionId, { vote: item.vote, reasons: item.reasons, comment: item.comment });
  const full = item.full ?? item.text;
  const shown = open ? full : mobile ? headOf(full, MOBILE_HEAD) : item.text;
  return (
    <li className={`fb-row${f.vote === -1 ? ' down' : ''}${open ? ' open' : ''}`} data-fb-question={item.questionId}>
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
  const [openId, setOpenId] = useState<string | null>(null);
  if (err) return <p className="dim fb-empty">문제 목록을 불러오지 못했어요.</p>;
  if (!items) return <p className="dim fb-empty">불러오는 중…</p>;
  if (items.length === 0) return <p className="dim fb-empty">평가할 문제가 없어요.</p>;
  return (
    <ol className="fb-list" data-loaded="1">
      {items.map((it) => (
        <FeedbackRow key={it.questionId} gameId={gameId} item={it} open={openId === it.questionId} onToggle={() => setOpenId((x) => (x === it.questionId ? null : it.questionId))} />
      ))}
    </ol>
  );
}

export function FeedbackList({ gameId }: { gameId: string }) {
  const { items, err } = useGameFeedbackItems(gameId);
  return <FeedbackListView gameId={gameId} items={items} err={err} />;
}

/** ★ R068 — 결과 · 로비 목록 머리 한 줄: 0P 안내 + 제보 링크 */
function RateNote() {
  const openReport = useOpenReportAt();
  return (
    <p className="fb-rate-note dim" data-rate-note data-wrap-ok>
      공개 시간에 누르면 +{RATE_POINTS}P · 자세한 의견은{' '}
      <button type="button" className="link-btn fb-report-link" data-fb-report onClick={() => openReport('menu')}>
        제보
      </button>
      에 적어 주세요(채택되면 +{FEEDBACK_ADOPT_POINTS}P)
    </p>
  );
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
 *  ★ R068 (찬종 #68 "결과 화면에서 문제 평가는 기본은 접은 상태로") — 늘 접힌 채로 시작(옛: 모바일 · 평가한 판은 펼침) ·
 *    직접 펼치면 그 뒤로 펼친 채(localStorage) · 접혀 있어도 머리 줄에 "평가 N/M". */
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
  const done = items?.filter((it) => it.vote !== null).length ?? 0;
  return (
    <div className={open ? 'fb-result open' : 'fb-result'} data-fb-default={open ? 'open' : 'closed'}>
      <button type="button" className="fb-result-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon icon={open ? ChevronDown : ChevronRight} />
        <Icon icon={ClipboardList} /> 이번 판 문제 평가
        {items && items.length > 0 && (
          <span className="mono fb-count" data-fb-count>
            평가 {done}/{items.length}
          </span>
        )}
      </button>
      {open && <RateNote />}
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
        <Icon icon={ClipboardList} /> 지난 판 문제 평가
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
              <RateNote />
              <FeedbackList gameId={gameId} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
