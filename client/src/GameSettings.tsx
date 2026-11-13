// =============================================================================
// 게임 설정 (guide 7절 / docs/01-GAME-RULES.md 4장)
//
// ★ 방장만 바꿀 수 있고, 나머지에게는 같은 모양의 읽기 전용으로 보인다.
//   ★ 화면에서 막는 것은 편의일 뿐이다. 권한과 범위는 서버가 다시 검사한다 (guide 44절).
// ★ 검증은 shared/validateRoomSettings 하나만 쓴다 (화면과 서버가 어긋나지 않게).
// ★ 출제 가능 수 안내 (Q-21) — 입력 단계에서 상한을 보여 준다.
//
// ★★★ R057 — 맨 위 "방식" [퀴즈 · 미니게임만](D-249). 미니게임만이면 문제 수 · 난이도 · 분야를 숨기고(값은 남는다)
//   미니게임 수(2~10) + 넣을 미니게임만 남는다.
// ★★ R035 — 카드 테두리를 없앴다. 로비 가운데 **카드 하나**(설정 + 게임 시작) 안에 들어간다 (건우: "칸을 줄여라").
//   ★ 난이도 설명 문구를 지웠다. ★ 게스트에게도 분야 **목록 전체**를 보이고 켜진 것만 진하게 — "전체" 한 단어로는
//     무엇이 들어 있는지 모른다 (건우 지적).
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  DRAW,
  DRAW_TEAM_BLOCK,
  LIAR,
  LIAR_TEAM_BLOCK,
  LIAR_MODES,
  LIAR_MODE_LABEL,
  DIFFICULTY_LEVELS,
  GAME_TOPICS,
  MINIGAMES,
  selectableMinigameKeys,
  MINIGAME_ONLY_ROUNDS,
  minigameSlots,
  minigameInfo,
  type MinigameKey,
  RULES,
  validateRoomSettings,
  SONG_MODE,
  DEFAULT_SONG_SETTINGS,
  type DifficultyLevel,
  type GameTopic,
} from '@quiz/shared';
import type { RoomSettings } from './useRoom.js';
import { Gamepad2 } from 'lucide-react';
import Icon from './Icon.js';
import { usePopup } from './popup.js';
import MinigameCatalog from './minigame/MinigameCatalog.js';
import TopicPicker from './TopicPicker.js';
import SongSettings from './SongSettings.js';

/** Q-10 확정: UI 에 프리셋을 제공한다 */
const PRESETS = [50, 100, 200] as const;
/** ★ R057 — 미니게임 수 프리셋 */
const MG_PRESETS = [5, 10, 20, 30, 50] as const; // ★ R066 — 2~50

interface Props {
  socket: Socket;
  settings: RoomSettings;
  settingsLocked: boolean;
  availableQuestionCount: number | null;
  isHost: boolean;
  /** ★ R079 — 팀전은 2명 이상일 때만 켠다 */
  playerCount?: number;
}

export default function GameSettings({
  socket,
  settings,
  settingsLocked,
  availableQuestionCount,
  isHost,
  playerCount = 1,
}: Props) {
  /**
   * ★ 입력 중인 값은 로컬 상태로 둔다 (숫자를 지우는 순간 커서가 튀지 않게).
   *   ★ 정본은 언제나 서버가 보낸 settings 다.
   */
  const [draft, setDraft] = useState<RoomSettings>(settings);
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const editable = isHost && !settingsLocked;
  const [catOpen, setCatOpen] = usePopup('minigame-catalog');
  const valid = validateRoomSettings(draft);

  /** 서버로 보낸다. 통과하지 못하는 값은 보내지 않는다 */
  const push = (next: RoomSettings) => {
    setDraft(next);
    const check = validateRoomSettings(next);
    if (!check.ok) return;
    socket.emit('lobby.updateSettings', check.settings);
  };

  const shown = editable ? draft : settings;
  const shortage = availableQuestionCount !== null && shown.questionCount > availableQuestionCount;

  /** ★ 분야는 **마지막 하나는 끌 수 없다** (빈 선택 상태를 만들지 않는다 — R025 판단) · ★ R069 난이도는 셋 중 하나(라디오 꼴)라 해당 없음 */
  const [lastHint, setLastHint] = useState<'topic' | null>(null);
  // ★ R068 (찬종 #56) — 마지막 분야를 누르면 그 버튼이 흔들리고 아래 안내
  const [shake, setShake] = useState<string | null>(null);
  const bump = (k: string) => {
    setShake(null);
    window.requestAnimationFrame(() => setShake(k));
    window.setTimeout(() => setShake((s) => (s === k ? null : s)), 500);
  };
  /** ★★★ R069 — 난이도 = 초급 · 중급 · 고급 중 하나 */
  const pickLevel = (level: DifficultyLevel) => {
    if (draft.level === level) return;
    push({ ...draft, level });
  };
  const toggleTopic = (topic: GameTopic) => {
    const has = draft.topics.includes(topic);
    if (has && draft.topics.length === 1) {
      setLastHint('topic');
      bump(topic);
      return;
    }
    setLastHint(null);
    const next = has
      ? draft.topics.filter((t) => t !== topic)
      : GAME_TOPICS.map((i) => i.topic).filter((t) => t === topic || draft.topics.includes(t));
    push({ ...draft, topics: next });
  };
  const topics = shown.topics ?? [];
  const allTopics = topics.length === GAME_TOPICS.length;
  // ★★★ R082 — 방식 세 버튼(퀴즈 · 미니게임만 · 라이어 — D-339). 옛 설정(mode 없음)은 minigameOnly 로
  const mode = shown.mode ?? (shown.minigameOnly === true ? 'minigame' : 'quiz');
  const liar = mode === 'liar';
  // ★★★ R083 — 캐치마인드(라운드 수 · 팀전 잠금 · 문제/미니게임 줄 숨김은 라이어와 같다)
  const drawM = mode === 'draw';
  const topicM = liar || drawM;
  // ★★★ R096 — 노래 맞히기(곡 수 · 분류 · 연대 · 장르 — 문제 · 미니게임 줄 숨김 · 팀전은 퀴즈처럼 같이 된다)
  const songM = mode === 'song';
  const liarMode = shown.liarMode ?? 'basic';
  const mgOnly = mode === 'minigame';
  const roundsMax = topicM ? LIAR.ROUNDS.MAX : MINIGAME_ONLY_ROUNDS.MAX;
  const clampRounds = (n: number | undefined) => Math.min(LIAR.ROUNDS.MAX, Math.max(LIAR.ROUNDS.MIN, Number.isFinite(n) ? (n as number) : LIAR.ROUNDS.DEFAULT));
  const mgRounds = shown.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT;
  const keysOf = (s: RoomSettings) => s.minigameKeys ?? selectableMinigameKeys();
  // ★★★ R079 — 팀전 토글(방식 줄 오른쪽 · 퀴즈 · 미니게임만 어느 쪽과도) · 켜져 있으면 [자동 배정]
  const teamOn = shown.teamMode === true;
  const teamDisabled = !teamOn && playerCount < 2;

  return (
    <div className={editable ? 'settings' : 'settings readonly'}>
      {/* ★★★ R057 — 방식: 퀴즈 / 미니게임만 (기본 퀴즈 · 다시 하기 이어받음) */}
      <div className="set-row mode-row">
        <span className="set-label">방식</span>
        <div className="preset-row">
          {editable ? (
            <>
              <button
                type="button"
                data-mode="quiz"
                aria-pressed={mode === 'quiz'}
                className={mode === 'quiz' ? 'preset active' : 'preset'}
                onClick={() => mode !== 'quiz' && push({ ...draft, mode: 'quiz', minigameOnly: false })}
              >
                퀴즈
              </button>
              <button
                type="button"
                data-mode="minigame"
                aria-pressed={mgOnly}
                className={mgOnly ? 'preset active' : 'preset'}
                onClick={() => !mgOnly && push({ ...draft, mode: 'minigame', minigameOnly: true, minigameKeys: keysOf(draft), minigameRounds: draft.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT })}
              >
                미니게임만
              </button>
              <button
                type="button"
                data-mode="liar"
                aria-pressed={liar}
                className={liar ? 'preset active' : 'preset'}
                title={`라이어 1명 · 한마디씩 → 투표 · ${LIAR.MIN_PLAYERS}명부터`}
                onClick={() => !liar && push({ ...draft, mode: 'liar', minigameOnly: false, teamMode: false, minigameRounds: clampRounds(draft.minigameRounds) })}
              >
                라이어
              </button>
              <button
                type="button"
                data-mode="draw"
                aria-pressed={drawM}
                className={drawM ? 'preset active' : 'preset'}
                title={`출제자가 돌아가며 그림 · 채팅으로 정답 · ${DRAW.MIN_PLAYERS}명부터`}
                onClick={() => !drawM && push({ ...draft, mode: 'draw', minigameOnly: false, teamMode: false, minigameRounds: clampRounds(draft.minigameRounds) })}
              >
                캐치마인드
              </button>
              <button
                type="button"
                data-mode="song"
                aria-pressed={songM}
                className={songM ? 'preset active' : 'preset'}
                title="30초 듣고 채팅으로 제목 · 제일 먼저 맞힌 사람 +1"
                onClick={() => !songM && push({ ...draft, mode: 'song', minigameOnly: false })}
              >
                노래
              </button>
            </>
          ) : (
            <span className="chip on">{songM ? '노래 맞히기' : drawM ? '캐치마인드' : liar ? '라이어' : mgOnly ? '미니게임만' : '퀴즈'}</span>
          )}
          <span className="team-sep" aria-hidden="true" />
          {editable ? (
            <>
              <button
                type="button"
                data-team-toggle
                aria-pressed={teamOn}
                disabled={teamDisabled || topicM}
                title={liar ? LIAR_TEAM_BLOCK : drawM ? DRAW_TEAM_BLOCK : teamDisabled ? '2명 이상일 때 켤 수 있어요' : teamOn ? '팀전 끄기' : '블루 · 레드 두 팀으로'}
                className={teamOn ? 'preset active team-toggle' : 'preset team-toggle'}
                onClick={() => push({ ...draft, teamMode: !teamOn })}
              >
                팀전
              </button>
              {teamOn && (
                <button type="button" className="preset team-auto" data-team-auto title="입장 순서대로 블루 · 레드 번갈아" onClick={() => socket.emit('lobby.autoTeams', {})}>
                  자동 배정
                </button>
              )}
            </>
          ) : (
            teamOn && <span className="chip on" data-team-chip>팀전</span>
          )}
        </div>
      </div>

      {/* ★ R082 — 라이어: 한 줄 설명(규칙 전부는 01 16-R082 · R087 개정) · ★ R088 모드(기본형 · 바보형) */}
      {liar && (
        <>
          <div className="set-row liar-mode-row" data-liar-mode-row>
            <span className="set-label">모드</span>
            {editable ? (
              <>
                {LIAR_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-liar-mode-btn={m}
                    aria-pressed={liarMode === m}
                    className={liarMode === m ? 'preset active' : 'preset'}
                    onClick={() => liarMode !== m && push({ ...draft, liarMode: m })}
                  >
                    {LIAR_MODE_LABEL[m]}
                  </button>
                ))}
              </>
            ) : (
              <span className="chip on" data-liar-mode-chip>
                {LIAR_MODE_LABEL[liarMode]}
              </span>
            )}
          </div>
          <p className="set-note dim" data-liar-note>
            {liarMode === 'fool'
              ? '바보형 — 라이어도 비슷한 다른 단어를 받아 자기가 라이어인 줄 몰라요 · 들킨 뒤 맞히기 +1'
              : '기본형 — 라이어는 주제만 알아요'}{' '}
            · 한마디씩 설명 → 토론 {LIAR.DISCUSS_MS / 1000}초 → 투표 → 변론 → 죽일까 살릴까(최대 {LIAR.VOTE_BOUTS}바퀴) · {LIAR.MIN_PLAYERS}명부터
          </p>
          {/* ★ R090 — 제시어 주제 고르기(접힘) */}
          <TopicPicker kind="liar" picked={shown.liarTopics} editable={editable} onChange={(next) => push({ ...draft, liarTopics: next })} />
        </>
      )}
      {drawM && (
        <p className="set-note dim" data-draw-note>
          출제자가 돌아가며 {DRAW.ROUND_MS / 1000}초 그림 · 먼저 맞힌 한 명 +{DRAW.SCORE_SOLVER} · 그린 사람 +{DRAW.SCORE_DRAWER} · {DRAW.MIN_PLAYERS}명부터
        </p>
      )}
      {drawM && <TopicPicker kind="draw" picked={shown.drawTopics} editable={editable} onChange={(next) => push({ ...draft, drawTopics: next })} />}
      {/* ★★★ R096 — 노래 맞히기: 한 줄 설명 + 곡 수 · 분류 · 연대 · 한국 장르 */}
      {songM && (
        <p className="set-note dim" data-song-note>
          30초 듣고 채팅으로 제목 · 제일 먼저 맞힌 사람 +1 · 15초 남으면 초성 · 넘기기 투표
        </p>
      )}
      {songM && (
        <SongSettings
          value={{ songCount: shown.songCount ?? SONG_MODE.ROUNDS.DEFAULT, songCategories: shown.songCategories ?? DEFAULT_SONG_SETTINGS.songCategories, songDecades: shown.songDecades ?? DEFAULT_SONG_SETTINGS.songDecades, songLegend: shown.songLegend ?? true, songGenres: shown.songGenres ?? DEFAULT_SONG_SETTINGS.songGenres }}
          editable={editable}
          onChange={(next) => push({ ...draft, ...next })}
        />
      )}
      {(mgOnly || topicM) && (
        <div className="set-row">
          <span className="set-label">{topicM ? '라운드 수' : '미니게임 수'}</span>
          {editable ? (
            <div className="preset-row">
              <input
                type="number"
                className="count-input mg-rounds-input"
                inputMode="numeric"
                min={topicM ? LIAR.ROUNDS.MIN : MINIGAME_ONLY_ROUNDS.MIN}
                max={roundsMax}
                aria-label={`${topicM ? '라운드 수' : '미니게임 수'} (${topicM ? LIAR.ROUNDS.MIN : MINIGAME_ONLY_ROUNDS.MIN}~${roundsMax})`}
                value={Number.isFinite(draft.minigameRounds) ? draft.minigameRounds : ''}
                onChange={(e) => push({ ...draft, minigameRounds: Number.parseInt(e.target.value, 10) })}
              />
              {MG_PRESETS.filter((n) => n <= roundsMax).map((n) => (
                <button
                  key={n}
                  type="button"
                  data-rounds={n}
                  className={draft.minigameRounds === n ? 'preset active' : 'preset'}
                  onClick={() => push({ ...draft, minigameRounds: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <span className="set-value mono">{mgRounds}{topicM ? '라운드' : '개'}</span>
          )}
        </div>
      )}

      {mode === 'quiz' && (
        <>
          <div className="set-row">
            <span className="set-label">문제 수</span>
            {editable ? (
              <div className="preset-row">
                <input
                  type="number"
                  className="count-input"
                  inputMode="numeric"
                  min={RULES.QUESTION_COUNT_MIN}
                  max={RULES.QUESTION_COUNT_MAX}
                  aria-label={`문제 수 (${RULES.QUESTION_COUNT_MIN}~${RULES.QUESTION_COUNT_MAX})`}
                  value={Number.isFinite(draft.questionCount) ? draft.questionCount : ''}
                  onChange={(e) => push({ ...draft, questionCount: Number.parseInt(e.target.value, 10) })}
                />
                {/* ★ Q-10 확정: 50 / 100 / 200 프리셋 */}
                {PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={draft.questionCount === n ? 'preset active' : 'preset'}
                    onClick={() => push({ ...draft, questionCount: n })}
                  >
                    {n}
                  </button>
                ))}
                {availableQuestionCount !== null && availableQuestionCount > 0 && (
                  <button
                    type="button"
                    className="preset"
                    onClick={() =>
                      push({ ...draft, questionCount: Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX) })
                    }
                  >
                    최대 ({Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX)})
                  </button>
                )}
              </div>
            ) : (
              <span className="set-value mono">{settings.questionCount}문제</span>
            )}
          </div>

          {/* ★ 출제 가능 수 (Q-21) — 진행에 필요한 알림이다 (부족하면 시작할 수 없다) */}
          <p className={shortage ? 'form-error avail-line' : 'note avail-line'} data-wrap-ok>
            {availableQuestionCount === null
              ? '출제 가능 문제 수를 확인하는 중입니다.'
              : shortage
                ? `★ 지금 출제할 수 있는 문제는 ${availableQuestionCount}개입니다. 이대로 시작할 수 없습니다.`
                : `이번 설정으로 낼 수 있는 문제 ${availableQuestionCount.toLocaleString('ko-KR')}개`}
          </p>

          {/* ★★★ 난이도 (R069 · docs/19 §5) — 초급 · 중급 · 고급 중 하나(라디오 꼴) · 고른 것의 한 줄 설명 */}
          <div className="set-row level-row">
            <span className="set-label">난이도</span>
            <div className="level-box">
              <div className="preset-row" role="radiogroup" aria-label="난이도">
                {DIFFICULTY_LEVELS.map((info) => {
                  const on = shown.level === info.level;
                  return editable ? (
                    <button
                      key={info.level}
                      type="button"
                      role="radio"
                      data-level={info.level}
                      aria-checked={on}
                      className={on ? 'preset active' : 'preset'}
                      onClick={() => pickLevel(info.level)}
                    >
                      {info.label}
                    </button>
                  ) : (
                    <span key={info.level} data-level={info.level} className={on ? 'chip on' : 'chip'}>
                      {info.label}
                    </span>
                  );
                })}
              </div>
              <p className="level-desc dim" data-level-desc data-wrap-ok>
                {DIFFICULTY_LEVELS.find((i) => i.level === shown.level)?.desc}
              </p>
            </div>
          </div>

          {/* ★★ 분야 (R034) — 난이도 × 분야로 출제 가능 수가 바뀐다 */}
          <div className="set-row">
            <span className="set-label">분야</span>
            <div className="preset-row topic-row">
              {editable && (
                <button
                  type="button"
                  aria-pressed={allTopics}
                  className={allTopics ? 'preset active' : 'preset'}
                  onClick={() => {
                    setLastHint(null);
                    if (!allTopics) push({ ...draft, topics: GAME_TOPICS.map((i) => i.topic) });
                  }}
                >
                  전체
                </button>
              )}
              {GAME_TOPICS.map((info) => {
                const on = topics.includes(info.topic);
                return editable ? (
                  <button
                    key={info.topic}
                    type="button"
                    data-topic={info.topic}
                    aria-pressed={on}
                    className={`${on ? 'preset active' : 'preset'}${shake === info.topic ? ' shake' : ''}`}
                    onClick={() => toggleTopic(info.topic)}
                  >
                    {info.label}
                  </button>
                ) : (
                  <span key={info.topic} data-topic={info.topic} className={on ? 'chip on' : 'chip'}>
                    {info.label}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ★★★ R050 — 미니게임 포함 (기본 꺼짐 · 10문제마다 · 5~9문제는 가운데 한 번 · 마지막 문제 뒤에는 없음 — D-234) */}
      {!topicM && !songM && <div className="set-row mg-set-row">
        <span className="set-label">미니게임</span>
        <div className="preset-row">
          {mgOnly ? null : editable ? (
            <label className="mg-check">
              <input
                type="checkbox"
                checked={shown.minigames === true}
                onChange={(e) => push({ ...draft, minigames: e.target.checked, minigameKeys: draft.minigameKeys ?? selectableMinigameKeys() })}
              />
              포함
            </label>
          ) : (
            <span className={shown.minigames ? 'chip on' : 'chip'}>{shown.minigames ? '포함' : '안 함'}</span>
          )}
          {(shown.minigames || mgOnly) && (
            // ★★ R063 (D-258) — 칩 16개 나열 → 버튼 하나 · 누르면 고르기 창(카드 · 방장 아니면 설명 보기)
            // ★ R077 (D-327 · 찬종 "굳이 저런식으로 안보여줘도 · 팝업 뜨면서 확인") — 손님 이름 한 줄(D-281)은 없앴다 · 이름 전체는 버튼 title 에만
            <button
              type="button"
              className="ghost tiny mg-cat-open"
              data-mg-catalog-open
              title={editable ? undefined : (shown.minigameKeys ?? selectableMinigameKeys()).map((k) => minigameInfo(k).name).join(' · ')}
              onClick={() => setCatOpen(true)}
            >
              <Icon icon={Gamepad2} /> {editable ? '미니게임 고르기' : '미니게임 보기'}{' '}
              <span className="mono dim">
                {(shown.minigameKeys ?? selectableMinigameKeys()).length}/{selectableMinigameKeys().length}
              </span>
            </button>
          )}
          {catOpen && (
            <MinigameCatalog
              mode="select"
              editable={editable}
              selected={shown.minigameKeys ?? selectableMinigameKeys()}
              onClose={() => setCatOpen(false)}
              onConfirm={(keys) => {
                setCatOpen(false);
                push({ ...draft, minigames: mgOnly ? draft.minigames : true, minigameKeys: keys });
              }}
            />
          )}
          {/* ★ R063 — "이번 판 N번" 은 없앴다(찬종 #10 "변경도 안되고 이해도 안감") */}
          {shown.minigames && !mgOnly && minigameSlots(Number.isFinite(shown.questionCount) ? shown.questionCount : 0).length === 0 && (
            <span className="dim mg-set-note">문제 5개 이상이면 사이사이 나와요</span>
          )}
        </div>
      </div>}

      {lastHint === 'topic' && (
        <p className="form-error" data-last-hint>
          분야는 하나는 남겨야 해요 — 다른 분야를 먼저 켜 주세요
        </p>
      )}
      {editable && !valid.ok && <p className="form-error">{valid.message}</p>}
    </div>
  );
}
