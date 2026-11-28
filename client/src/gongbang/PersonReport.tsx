// =============================================================================
// ★★★ R117 (docs/24 3-8) — 사람 신고 창: 사유 칩 하나 + 한 줄(선택) → POST /api/people/report
//   서버가 그 방 최근 채팅 30줄을 같이 붙인다(신고 때만 · 01 9장). 같은 방 사람만 · 10분 5번.
// =============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PopupClose from '../PopupClose.js';
import BusyButton from '../BusyButton.js';
import { REPORT_REASONS, reportPerson, type ReportReason } from './store.js';
import Notice from '../Notice.js';
import { errorMessage } from '../api.js';

interface Props {
  accountId: string;
  nickname: string;
  onDone: (message: string) => void;
  onClose: () => void;
}

export default function PersonReport({ accountId, nickname, onDone, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setErr(null);
    try {
      await reportPerson(accountId, reason, text);
      onDone('신고했어요. 운영자가 살펴볼게요.');
    } catch (e) {
      setErr(errorMessage(e, '보내지 못했어요'));
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal gb-report" role="dialog" aria-label={`${nickname} 신고`} data-gb-report>
        <div className="pop-head">
          <p className="pop-title">{nickname} 신고</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="preset-row">
          {REPORT_REASONS.map((r) => (
            <button key={r.key} type="button" data-reason={r.key} aria-pressed={reason === r.key} className={reason === r.key ? 'preset active' : 'preset'} onClick={() => setReason(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <input className="gb-report-text" value={text} maxLength={200} placeholder="한 줄 (선택)" onChange={(e) => setText(e.target.value)} />
        {err && <Notice tone="bad" alert name="person-report">{err}</Notice>}
        <BusyButton className="primary gb-wide" data-gb-report-send disabled={!reason} busy={busy} onClick={() => void send()}>
          신고
        </BusyButton>
      </div>
    </div>,
    document.body,
  );
}
