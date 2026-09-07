// =============================================================================
// 게임 설정 (guide 7절 / docs/01-GAME-RULES.md 4장)
//
// ★ 방장만 바꿀 수 있고, 나머지에게는 읽기 전용으로 보인다.
//   ★ 화면에서 막는 것은 편의일 뿐이다. 권한과 범위는 서버가 다시 검사한다 (guide 44절).
//
// ★ 검증은 shared/validateRoomSettings 하나만 쓴다.
//   화면에만 따로 조건을 쓰면 서버와 어긋나서 "버튼은 눌리는데 서버가 거부하는" 상태가 된다.
//
// ★ 출제 가능 수 안내 (Q-21)
//   시드가 53문제인데 200을 넣고 시작 버튼을 누르면 서버가 거부한다.
//   안내가 없으면 왜 안 되는지 알 수 없으므로, 입력 단계에서 상한을 보여 준다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RULES, validateRoomSettings } from '@quiz/shared';
import type { RoomSettings } from './useRoom.js';

/** Q-10 확정: UI 에 프리셋을 제공한다 */
const PRESETS = [50, 100, 200] as const;

interface Props {
  socket: Socket;
  settings: RoomSettings;
  settingsLocked: boolean;
  availableQuestionCount: number | null;
  isHost: boolean;
}

export default function GameSettings({
  socket,
  settings,
  settingsLocked,
  availableQuestionCount,
  isHost,
}: Props) {
  /**
   * ★ 입력 중인 값은 로컬 상태로 둔다.
   *   서버가 보낸 값을 그대로 input 에 묶으면 숫자를 지우는 순간(빈 문자열)
   *   커서가 튀거나 값이 되돌아간다.
   *   ★ 단 정본은 언제나 서버가 보낸 settings 다. 아래 useEffect 가 동기화한다.
   */
  const [draft, setDraft] = useState<RoomSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const editable = isHost && !settingsLocked;
  const valid = validateRoomSettings(draft);

  /** 서버로 보낸다. 통과하지 못하는 값은 보내지 않는다 */
  const push = (next: RoomSettings) => {
    setDraft(next);
    const check = validateRoomSettings(next);
    if (!check.ok) return;
    socket.emit('lobby.updateSettings', check.settings);
  };

  const shortage =
    availableQuestionCount !== null && draft.questionCount > availableQuestionCount;

  if (!editable) {
    // ── 읽기 전용 표시 (참가자 / 설정 잠금 상태)
    return (
      <section className="card">
        <h2>게임 설정</h2>
        <dl className="settings-view">
          <dt>문제 수</dt>
          <dd>{settings.questionCount}개</dd>
          <dt>시작 방식</dt>
          <dd>
            {settings.startMode === 'instant'
              ? '즉시 시작'
              : `${settings.countdownSec}초 카운트다운`}
          </dd>
          <dt>출제 가능</dt>
          <dd>
            {availableQuestionCount === null ? '—' : `${availableQuestionCount}개`}
          </dd>
        </dl>
        <p className="note">
          {settingsLocked
            ? '게임이 시작되어 설정을 바꿀 수 없습니다.'
            : '설정은 방장만 바꿀 수 있습니다.'}
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>게임 설정</h2>

      <label className="settings-label">
        문제 수 ({RULES.QUESTION_COUNT_MIN}~{RULES.QUESTION_COUNT_MAX})
        <div className="field-row">
          <input
            type="number"
            inputMode="numeric"
            min={RULES.QUESTION_COUNT_MIN}
            max={RULES.QUESTION_COUNT_MAX}
            value={Number.isFinite(draft.questionCount) ? draft.questionCount : ''}
            onChange={(e) =>
              push({ ...draft, questionCount: Number.parseInt(e.target.value, 10) })
            }
          />
        </div>
      </label>

      {/* ★ Q-10 확정: 50 / 100 / 200 프리셋 */}
      <div className="preset-row">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={draft.questionCount === n ? 'preset active' : 'preset'}
            onClick={() => push({ ...draft, questionCount: n })}
          >
            {n}문제
          </button>
        ))}
        {availableQuestionCount !== null && availableQuestionCount > 0 && (
          <button
            type="button"
            className="preset"
            onClick={() =>
              push({
                ...draft,
                questionCount: Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX),
              })
            }
          >
            가능한 최대 ({Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX)})
          </button>
        )}
      </div>

      <p className={shortage ? 'form-error' : 'note'}>
        {availableQuestionCount === null
          ? '출제 가능 문제 수를 확인하는 중입니다.'
          : shortage
            ? `★ 지금 출제할 수 있는 문제는 ${availableQuestionCount}개입니다. 이대로 시작할 수 없습니다.`
            : `지금 출제할 수 있는 문제: ${availableQuestionCount}개`}
      </p>

      <label className="settings-label">
        시작 방식
        <div className="preset-row">
          <button
            type="button"
            className={draft.startMode === 'instant' ? 'preset active' : 'preset'}
            onClick={() => push({ ...draft, startMode: 'instant' })}
          >
            즉시 시작
          </button>
          <button
            type="button"
            className={draft.startMode === 'countdown' ? 'preset active' : 'preset'}
            onClick={() => push({ ...draft, startMode: 'countdown' })}
          >
            카운트다운
          </button>
        </div>
      </label>

      {draft.startMode === 'countdown' && (
        <label className="settings-label">
          카운트다운 ({RULES.COUNTDOWN_SEC_MIN}~{RULES.COUNTDOWN_SEC_MAX}초)
          <div className="field-row">
            <input
              type="number"
              inputMode="numeric"
              min={RULES.COUNTDOWN_SEC_MIN}
              max={RULES.COUNTDOWN_SEC_MAX}
              value={Number.isFinite(draft.countdownSec) ? draft.countdownSec : ''}
              onChange={(e) =>
                push({ ...draft, countdownSec: Number.parseInt(e.target.value, 10) })
              }
            />
          </div>
        </label>
      )}

      {!valid.ok && <p className="form-error">{valid.message}</p>}
    </section>
  );
}
