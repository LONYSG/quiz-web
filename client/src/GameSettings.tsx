// =============================================================================
// 게임 설정 (guide 7절 / docs/01-GAME-RULES.md 4장)
//
// ★ 방장만 바꿀 수 있고, 나머지에게는 같은 모양의 읽기 전용으로 보인다.
//   ★ 화면에서 막는 것은 편의일 뿐이다. 권한과 범위는 서버가 다시 검사한다 (guide 44절).
// ★ 검증은 shared/validateRoomSettings 하나만 쓴다 (화면과 서버가 어긋나지 않게).
//
// ★★★ R123 (찬종 첫 플레이 피드백 · "설명은 간결하게 · 설명하는 공간은 '안내' 메뉴에") —
//   · 게임 설명은 무슨 게임인지 한 줄만(GAME_LINE) · 규칙 나열 · 난이도 설명 · "낼 수 있는 문제 N개" 는 뺐다(규칙은 InfoText).
//   · 방식 = 퀴즈 · 노래(미니게임만은 TRIM.minigameOnly 로 끔) · 대결 = 개인전 / 팀전(다른 줄 · 늘 고를 수 있다 · 시작만 짝수).
//   · 캐치마인드 "문제 수" 10 · 20 · 30 · 50 · 라이어 "판 수" · 주제 고르기 · 미니게임 고르기 · 노래 연대 · 장르는 TRIM 으로 끔.
//   · 평소 안 뜨는 경고는 Notice 한 꼴.
// ★★ R035 — 카드 테두리를 없앴다. 로비 가운데 **카드 하나**(설정 + 게임 시작) 안에 들어간다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  DRAW,
  LIAR,
  LIAR_MODES,
  LIAR_MODE_LABEL,
  DIFFICULTY_LEVELS,
  GAME_TOPICS,
  selectableMinigameKeys,
  MINIGAME_ONLY_ROUNDS,
  minigameSlots,
  minigameInfo,
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
import TopicPicker, { loadLists } from './TopicPicker.js';
import SongSettings, { loadMetas } from './SongSettings.js';
import Notice from './Notice.js';
import { siteInfo } from './site.js';
import { ArrowLeftRight } from 'lucide-react';
import type { RoomKind } from '@quiz/shared';
import ModeChange from './gongbang/ModeChange.js';
import { GAME_LINE, KIND_ICON, KIND_LABEL } from './gongbang/kinds.js';

/** Q-10 확정: UI 에 프리셋을 제공한다 */
const PRESETS = [50, 100, 200] as const;
/** ★ R057 — 미니게임 수 프리셋 */
const MG_PRESETS = [5, 10, 20, 30, 50] as const; // ★ R066 — 2~50
/** ★ R123 — 캐치마인드 문제 수(그림 수) 네 버튼 */
const DRAW_PRESETS = [10, 20, 30, 50] as const;

interface Props {
  socket: Socket;
  settings: RoomSettings;
  settingsLocked: boolean;
  availableQuestionCount: number | null;
  isHost: boolean;
  /** ★ R079 — 팀전 */
  playerCount?: number;
  /** ★★★ R117 — 공방 방의 종류(없으면 옛 방 — 방식 칸 그대로). 있으면 맨 위 "방 종류" 줄 + [모드 바꾸기] · 방식 칸은 그 종류 안의 것만 */
  gongbangKind?: RoomKind | null;
}

export default function GameSettings({
  socket,
  settings,
  settingsLocked,
  availableQuestionCount,
  isHost,
  playerCount = 1,
  gongbangKind = null,
}: Props) {
  /**
   * ★ 입력 중인 값은 로컬 상태로 둔다 (숫자를 지우는 순간 커서가 튀지 않게).
   *   ★ 정본은 언제나 서버가 보낸 settings 다.
   */
  const [draft, setDraft] = useState<RoomSettings>(settings);
  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  // ★★★ R125 B1 — 노래 곡 수 · 주제 목록을 방에 들어올 때 미리(모드를 바꿔 연 순간 숫자까지 다 그려져 있다)
  useEffect(() => {
    const t = setTimeout(() => {
      void loadMetas();
      if (!siteInfo().trim.topicPick) void loadLists();
    }, 500);
    return () => clearTimeout(t);
  }, []);

  const editable = isHost && !settingsLocked;
  const [catOpen, setCatOpen] = usePopup('minigame-catalog');
  const [modeOpen, setModeOpen] = usePopup('gb-mode');
  const valid = validateRoomSettings(draft, { trim: siteInfo().trim });

  /** 서버로 보낸다. 통과하지 못하는 값은 보내지 않는다 */
  const push = (next: RoomSettings) => {
    setDraft(next);
    const check = validateRoomSettings(next, { trim: siteInfo().trim });
    if (!check.ok) return;
    socket.emit('lobby.updateSettings', check.settings);
  };

  const shown = editable ? draft : settings;
  const shortage = availableQuestionCount !== null && shown.questionCount > availableQuestionCount;

  /** ★ 분야는 **마지막 하나는 끌 수 없다** (빈 선택 상태를 만들지 않는다 — R025 판단) */
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
  // ★★★ R082 — 방식. 옛 설정(mode 없음)은 minigameOnly 로 · ★ R123 TRIM 이면 미니게임만 = 퀴즈
  const mode0 = shown.mode ?? (shown.minigameOnly === true ? 'minigame' : 'quiz');
  const mode = siteInfo().trim.minigameOnly && mode0 === 'minigame' ? 'quiz' : mode0;
  const liar = mode === 'liar';
  const drawM = mode === 'draw';
  const topicM = liar || drawM;
  const songM = mode === 'song';
  const songHidden = siteInfo().hidden.modes.includes('song');
  const liarMode = shown.liarMode ?? 'basic';
  const mgOnly = mode === 'minigame';
  const roundsMin = drawM ? DRAW.ROUNDS.MIN : liar ? LIAR.ROUNDS.MIN : MINIGAME_ONLY_ROUNDS.MIN;
  const roundsMax = drawM ? DRAW.ROUNDS.MAX : liar ? LIAR.ROUNDS.MAX : MINIGAME_ONLY_ROUNDS.MAX;
  const clampFor = (k: 'draw' | 'liar', n: number | undefined) => {
    const R = k === 'draw' ? DRAW.ROUNDS : LIAR.ROUNDS;
    // ★ R123 — 캐치마인드는 네 버튼 중 하나로(옛 값이 버튼에 없으면 기본 10)
    if (k === 'draw') return DRAW_PRESETS.includes(n as (typeof DRAW_PRESETS)[number]) ? (n as number) : R.DEFAULT;
    return Math.min(R.MAX, Math.max(R.MIN, Number.isFinite(n) ? (n as number) : R.DEFAULT));
  };
  const mgRounds = shown.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT;
  const keysOf = (s: RoomSettings) => s.minigameKeys ?? selectableMinigameKeys();
  // ★★★ R079 — 팀전 · ★ R123 늘 고를 수 있다(시작만 짝수 인원 — 시작 버튼 아래 한 줄)
  const teamOn = shown.teamMode === true;
  /** ★ R117 — 모드 바꾸기 = 그 종류의 첫 방식으로(옛 방식 버튼과 같은 값) */
  const toKind = (k: RoomKind) => {
    setModeOpen(false);
    if (k === 'quiz') push({ ...draft, mode: 'quiz', minigameOnly: false });
    else push({ ...draft, mode: k, minigameOnly: false, teamMode: false, minigameRounds: clampFor(k, draft.minigameRounds) });
  };
  const gbQuiz = gongbangKind === 'quiz';
  const modeName = songM ? '노래' : drawM ? '캐치마인드' : liar ? '라이어' : mgOnly ? '미니게임만' : '퀴즈';
  const line = GAME_LINE[songM ? 'song' : drawM ? 'draw' : liar ? 'liar' : 'quiz'];

  const modeBtn = (key: string, on: boolean, label: string, next: () => RoomSettings) => (
    <button
      key={key}
      type="button"
      data-mode={key}
      aria-pressed={on}
      className={on ? 'preset active' : 'preset'}
      onClick={() => !on && push(next())}
    >
      {label}
    </button>
  );

  return (
    <div className={editable ? 'settings' : 'settings readonly'} data-settings-mode={mode}>
      {/* ★★★ R117 — 공방 방: 방 종류 + [모드 바꾸기](방장 · 대기실) */}
      {gongbangKind && (
        <div className="set-row gb-kind-row" data-gb-kind-row={gongbangKind}>
          <span className="set-label">방 종류</span>
          <div className="preset-row mode-now">
            <span className={`kind-tag k-${gongbangKind}`}>
              <Icon icon={KIND_ICON[gongbangKind]} /> {KIND_LABEL[gongbangKind]}
            </span>
            {isHost && (
              <button
                type="button"
                className="preset"
                data-gb-mode-btn
                disabled={!editable}
                title={editable ? undefined : '이 판이 끝나면 바꿀 수 있어요'}
                onClick={() => setModeOpen(true)}
              >
                <Icon icon={ArrowLeftRight} /> 모드 바꾸기
              </button>
            )}
          </div>
        </div>
      )}
      {modeOpen && gongbangKind && <ModeChange current={gongbangKind} onPick={toKind} onClose={() => setModeOpen(false)} />}
      {/* ★ 방식 — 공방 캐치 · 라이어 방은 방식 칸이 비어 줄째 숨긴다 */}
      <div className={gongbangKind && !gbQuiz ? 'set-row mode-row gb-hide' : 'set-row mode-row'}>
        <span className="set-label">방식</span>
        <div className="preset-row">
          {editable && gongbangKind && !gbQuiz ? null : editable ? (
            <>
              {modeBtn('quiz', mode === 'quiz', '퀴즈', () => ({ ...draft, mode: 'quiz', minigameOnly: false }))}
              {!siteInfo().trim.minigameOnly &&
                modeBtn('minigame', mgOnly, '미니게임만', () => ({ ...draft, mode: 'minigame', minigameOnly: true, minigameKeys: keysOf(draft), minigameRounds: draft.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT }))}
              {!gongbangKind && modeBtn('liar', liar, '라이어', () => ({ ...draft, mode: 'liar', minigameOnly: false, teamMode: false, minigameRounds: clampFor('liar', draft.minigameRounds) }))}
              {!gongbangKind && modeBtn('draw', drawM, '캐치마인드', () => ({ ...draft, mode: 'draw', minigameOnly: false, teamMode: false, minigameRounds: clampFor('draw', draft.minigameRounds) }))}
              {/* ★ R109 — 공개 주소에서는 노래 방식이 없다(지인 전용 · 서버도 막는다) */}
              {!songHidden && modeBtn('song', songM, '노래', () => ({ ...draft, mode: 'song', minigameOnly: false }))}
            </>
          ) : gongbangKind && !gbQuiz ? null : (
            <span className="chip on">{modeName}</span>
          )}
        </div>
      </div>
      {/* ★ R123 — 무슨 게임인지 한 줄만 */}
      <p className="set-note dim game-line" data-game-line={mode} data-wrap-ok>
        {line}
      </p>

      {/* ★★ R123 — 대결: 개인전 / 팀전(방식과 다른 줄 · 늘 고를 수 있다 · 캐치 · 라이어는 팀전이 없어 줄을 안 보임) */}
      {!topicM && (
        <div className="set-row team-row" data-team-row>
          <span className="set-label">대결</span>
          <div className="preset-row">
            {editable ? (
              <>
                <button type="button" data-team-solo aria-pressed={!teamOn} className={!teamOn ? 'preset active' : 'preset'} onClick={() => teamOn && push({ ...draft, teamMode: false })}>
                  개인전
                </button>
                <button type="button" data-team-toggle aria-pressed={teamOn} className={teamOn ? 'preset active team-toggle' : 'preset team-toggle'} onClick={() => !teamOn && push({ ...draft, teamMode: true })}>
                  팀전
                </button>
                {teamOn && (
                  <button type="button" className="preset team-auto" data-team-auto onClick={() => socket.emit('lobby.autoTeams', {})}>
                    자동 배정
                  </button>
                )}
              </>
            ) : (
              <span className="chip on" data-team-chip={teamOn ? '' : undefined}>
                {teamOn ? '팀전' : '개인전'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ★ R088 — 라이어 모드(기본형 · 바보형) · ★ R123 규칙 설명은 안내로 */}
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
          {/* ★ R090 — 제시어 주제 고르기(접힘) · ★ R123 TRIM.topicPick 이면 없음(전체 주제) */}
          {!siteInfo().trim.topicPick && <TopicPicker kind="liar" picked={shown.liarTopics} editable={editable} onChange={(next) => push({ ...draft, liarTopics: next })} />}
        </>
      )}
      {drawM && !siteInfo().trim.topicPick && <TopicPicker kind="draw" picked={shown.drawTopics} editable={editable} onChange={(next) => push({ ...draft, drawTopics: next })} />}
      {songM && (
        <SongSettings
          value={{ songCount: shown.songCount ?? SONG_MODE.ROUNDS.DEFAULT, songCategories: shown.songCategories ?? DEFAULT_SONG_SETTINGS.songCategories, songDecades: shown.songDecades ?? DEFAULT_SONG_SETTINGS.songDecades, songLegend: shown.songLegend ?? true, songGenres: shown.songGenres ?? DEFAULT_SONG_SETTINGS.songGenres }}
          editable={editable}
          onChange={(next) => push({ ...draft, ...next })}
        />
      )}
      {/* ★ R123 — 캐치마인드 "문제 수"(네 버튼) · 라이어 "판 수" · 미니게임만 "미니게임 수" */}
      {(mgOnly || topicM) && (
        <div className="set-row" data-rounds-row>
          <span className="set-label">{drawM ? '문제 수' : liar ? '판 수' : '미니게임 수'}</span>
          {editable ? (
            <div className="preset-row">
              {!drawM && (
                <input
                  type="number"
                  className="count-input mg-rounds-input"
                  inputMode="numeric"
                  min={roundsMin}
                  max={roundsMax}
                  aria-label={`${liar ? '판 수' : '미니게임 수'} (${roundsMin}~${roundsMax})`}
                  value={Number.isFinite(draft.minigameRounds) ? draft.minigameRounds : ''}
                  onChange={(e) => push({ ...draft, minigameRounds: Number.parseInt(e.target.value, 10) })}
                />
              )}
              {(drawM ? DRAW_PRESETS : MG_PRESETS.filter((n) => n <= roundsMax)).map((n) => (
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
            <span className="set-value mono">
              {mgRounds}
              {drawM ? '문제' : liar ? '판' : '개'}
            </span>
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

          {/* ★ 출제 가능 수 (Q-21) — ★ R123 모자랄 때만(평소 문구 "낼 수 있는 문제 N개" 는 뺐다) */}
          {shortage && (
            <Notice tone="bad" name="avail" className="avail-line">
              지금 낼 수 있는 문제는 {availableQuestionCount}개예요
              <br />
              문제 수를 줄여야 시작할 수 있어요
            </Notice>
          )}

          {/* ★★★ 난이도 (R069) — 초급 · 중급 · 고급 중 하나 · ★ R123 설명 없이 이름만 */}
          <div className="set-row level-row">
            <span className="set-label">난이도</span>
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
          </div>

          {/* ★★ 분야 (R034) */}
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

      {/* ★★★ R050 — 미니게임 포함 · ★ R123 고르기 버튼 없음(TRIM.minigamePick) — 체크해도 아래가 밀리지 않는다 */}
      {!topicM && !songM && (
        <div className="set-row mg-set-row">
          <span className="set-label">미니게임</span>
          <div className="preset-row">
            {mgOnly ? null : editable ? (
              <label className="mg-check">
                <input
                  type="checkbox"
                  checked={shown.minigames === true}
                  onChange={(e) => push({ ...draft, minigames: e.target.checked, minigameKeys: siteInfo().trim.minigamePick ? selectableMinigameKeys() : (draft.minigameKeys ?? selectableMinigameKeys()) })}
                />
                포함
              </label>
            ) : (
              <span className={shown.minigames ? 'chip on' : 'chip'}>{shown.minigames ? '포함' : '안 함'}</span>
            )}
            {!siteInfo().trim.minigamePick && (shown.minigames || mgOnly) && (
              <button
                type="button"
                className="ghost tiny mg-cat-open"
                data-mg-catalog-open
                title={editable ? undefined : (shown.minigameKeys ?? selectableMinigameKeys()).map((k) => minigameInfo(k).name).join(', ')}
                onClick={() => setCatOpen(true)}
              >
                <Icon icon={Gamepad2} /> {editable ? '미니게임 고르기' : '미니게임 보기'}{' '}
                <span className="mono dim">
                  {(shown.minigameKeys ?? selectableMinigameKeys()).length}/{selectableMinigameKeys().length}
                </span>
              </button>
            )}
            {catOpen && !siteInfo().trim.minigamePick && (
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
          </div>
        </div>
      )}
      {!topicM && !songM && shown.minigames && !mgOnly && minigameSlots(Number.isFinite(shown.questionCount) ? shown.questionCount : 0).length === 0 && (
        <Notice name="mg-slots">문제가 5개 이상이어야 미니게임이 나와요</Notice>
      )}

      {lastHint === 'topic' && (
        <Notice name="last-topic">
          분야는 하나는 남겨야 해요
          <br />
          다른 분야를 먼저 켜 주세요
        </Notice>
      )}
      {editable && !valid.ok && <Notice tone="bad" name="invalid">{valid.message}</Notice>}
    </div>
  );
}
