// =============================================================================
// ★★★ R084 — 노래 둘 화면 (D-341 · docs/18 §10): 노래 맞히기 · 이 노래 몇 년도?
//
// ★ 소리(SongSound — MinigameStage 가 판 내내 붙여 둔다): 판(play)에 들어가면 같은 <audio> 요소로 previewUrl 을 튼다
//   (늦게 들어온 사람은 흐른 초부터) · 공개(roundResult) 동안 계속 흐름 · 준비 · 최종 · 끝에서 멈춤.
//   규칙 단계에 [▶ 듣기](조작 한 번 — iOS · 모바일 자동 재생 막힘) · 막히면 판 중에도 같은 버튼 · 볼륨 슬라이더(효과음 설정과 별개).
//   재생 실패 → "미리듣기를 못 불러왔어요" + 서버에 한 번 보고({ fail: true } — 접속자 과반이면 그 곡 건너뜀).
// ★ 노래 맞히기: 입력칸(Enter 마다) · 서버 답(나에게만)으로 ✓ 제목 / ✓ 가수 · 남의 답 안 보임.
// ★ 이 노래 몇 년도?: 연도 4자리 · 바꿀 수 있음(마지막).
// ★ 공개: 앨범 그림(artworkUrl100 → 300px 판) · 제목 · 가수 · 연도 · "Apple Music 미리듣기" — 판 중에는 그림 없음(정답 노출).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Check, Headphones, Music, Play, Volume2, X } from 'lucide-react';
import Icon from '../Icon.js';
import { sfx } from '../sound.js';
import type { MinigameRoundRow, MinigameView } from '../useRoom.js';
import { isReportOpen } from '../reportGuard.js';
import { TopicInput, useTimer } from './TopicGames.js';
import { installSongUnlock, playSong, setSongVolume, stopSong, unlockSongAudio, useSongAudio } from './songAudio.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

export const SONG_KEYS = new Set(['song', 'songyear']);

/** 앨범 그림 — 100px 주소를 300px 판으로(같은 CDN 규칙) */
export function artwork(url: unknown, px = 300): string | null {
  return typeof url === 'string' && url.startsWith('https://') ? url.replace(/\/\d+x\d+bb\./, `/${px}x${px}bb.`) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 소리 — 판 내내(규칙 ~ 공개) 붙어 있는 띠: 듣기 버튼 · 상태 · 볼륨
// ─────────────────────────────────────────────────────────────────────────────
export function SongSound({ socket, view, serverNow }: { socket: Socket; view: MinigameView; serverNow: () => number }) {
  const st = useSongAudio();
  const url = typeof view.round?.params?.previewUrl === 'string' ? (view.round.params.previewUrl as string) : null;
  const roundKey = `${view.token}:${view.roundIndex}`;
  const reported = useRef<string | null>(null);
  useEffect(() => {
    installSongUnlock();
    return () => stopSong();
  }, []);
  // 단계 → 틀기 · 멈춤
  useEffect(() => {
    if (view.phase === 'play' && url) playSong(url, Math.max(0, (serverNow() - view.phaseStartedAt) / 1000));
    else if (view.phase === 'roundResult') {
      // 공개 동안 계속(끊긴 채 들어온 사람은 틀지 않는다)
    } else stopSong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, url, roundKey]);
  // 재생 실패 → 서버에 한 번(참가자만 · 판 진행 중)
  useEffect(() => {
    if (st.status !== 'failed' || view.phase !== 'play' || view.spectating || st.url !== url) return;
    if (reported.current === roundKey) return;
    reported.current = roundKey;
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { fail: true } });
  }, [st.status, st.url, url, view.phase, view.spectating, roundKey, socket, view.token, view.roundIndex]);

  const early = view.phase === 'intro' || view.phase === 'rules' || view.phase === 'ready';
  const blocked = view.phase === 'play' && st.status === 'blocked';
  const failed = view.phase === 'play' && st.status === 'failed' && st.url === url;
  return (
    <div className={`song-sound${blocked ? ' blocked' : ''}`} data-song-sound={st.status} data-song-unlocked={st.unlocked ? '1' : '0'}>
      {(early && !st.unlocked) || blocked ? (
        <button
          type="button"
          className="primary song-listen"
          data-song-listen
          onClick={() => {
            unlockSongAudio();
            sfx('mg-tap');
          }}
        >
          <Icon icon={Play} /> 듣기
        </button>
      ) : (
        <span className="song-state" data-song-state>
          <Icon icon={Headphones} /> {failed ? '미리듣기를 못 불러왔어요' : st.status === 'playing' ? '듣는 중' : st.status === 'loading' ? '불러오는 중…' : early ? '소리 준비됨' : ''}
        </span>
      )}
      {(early && !st.unlocked) || blocked ? <span className="song-sound-help dim">{blocked ? '소리가 막혔어요 — 눌러 주세요' : '소리를 켜 주세요 — 한 번만 누르면 돼요'}</span> : null}
      <label className="song-vol">
        <Icon icon={Volume2} />
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(st.volume * 100)}
          aria-label="노래 소리 크기"
          data-song-volume
          onChange={(e) => setSongVolume(Number(e.target.value) / 100)}
        />
        <span className="mono song-vol-n">{Math.round(st.volume * 100)}</span>
      </label>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 노래 맞히기
// ─────────────────────────────────────────────────────────────────────────────
type Fb = { result: 'ok' | 'dup' | 'wrong'; part?: 'title' | 'artist'; text?: string; title?: boolean; artist?: boolean };

export function SongGuess({ socket, view, serverNow, mobile }: Props) {
  const t = useTimer(view, serverNow);
  const [st, setSt] = useState<{ key: string; title: boolean; artist: boolean; last: Fb | null } | null>(null);
  const mine = st?.key === t.key ? st : null;
  useEffect(() => {
    const on = (fb: Fb & { token: string; roundIndex: number }) => {
      if (fb.token !== view.token || fb.roundIndex !== view.roundIndex || !('result' in fb)) return;
      const k = `${fb.token}:${fb.roundIndex}`;
      setSt((s) => {
        const prev = s?.key === k ? s : { key: k, title: false, artist: false, last: null };
        return { key: k, title: fb.title ?? prev.title, artist: fb.artist ?? prev.artist, last: fb };
      });
      sfx(fb.result === 'ok' ? 'mg-tap' : 'mg-foul');
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex]);
  const send = (text: string) => {
    if (t.t0 === null) return;
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text, elapsedMs: Math.round(performance.now() - t.t0) } });
  };
  const last = mine?.last ?? null;
  const both = Boolean(mine?.title && mine?.artist);
  return (
    <div className="quiz-stage topic-stage song-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${t.left * 100}%` }} />
      </div>
      <p className="topic-title song-ask">
        <Icon icon={Music} /> <strong>제목</strong>
        <span className="dim"> 또는 </span>
        <strong>가수</strong>
        <span className="dim"> — </span>
        <span className="mono topic-left">{t.leftSec}초</span>
      </p>
      <div className="song-parts" aria-label="내가 맞힌 것">
        <span className={`song-part${mine?.title ? ' ok' : ''}`} data-song-part="title" data-ok={mine?.title ? '1' : '0'}>
          {mine?.title ? <Icon icon={Check} /> : null} 제목
        </span>
        <span className={`song-part${mine?.artist ? ' ok' : ''}`} data-song-part="artist" data-ok={mine?.artist ? '1' : '0'}>
          {mine?.artist ? <Icon icon={Check} /> : null} 가수
        </span>
        {both && <span className="song-both mono">+1</span>}
      </div>
      <TopicInput
        canPlay={t.canPlay && !both}
        mobile={mobile}
        resetKey={t.key}
        placeholder={view.spectating ? '구경 중' : both ? '둘 다 맞혔어요!' : mine?.title ? '가수도 맞혀 보세요 (+1)' : mine?.artist ? '제목도 맞혀 보세요 (+1)' : '제목이나 가수 → Enter'}
        label="제목 또는 가수"
        onSend={send}
      />
      <p className={`quiz-num-help topic-fb${last?.result === 'ok' ? ' ok' : last ? ' bad' : ' dim'}`} data-feedback={last?.result ?? ''}>
        {last?.result === 'ok' ? (
          <>
            <Icon icon={Check} /> {last.part === 'title' ? '제목' : '가수'} 맞음!
          </>
        ) : last?.result === 'dup' ? (
          `이미 맞힌 ${last.part === 'title' ? '제목' : '가수'}이에요`
        ) : last?.result === 'wrong' ? (
          <>
            <Icon icon={X} /> "{last.text}" — 아니에요
          </>
        ) : view.spectating ? (
          '구경 중이에요'
        ) : (
          '먼저 맞힐수록 높은 점수 · 남의 답은 안 보여요'
        )}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 이 노래 몇 년도?
// ─────────────────────────────────────────────────────────────────────────────
export function SongYearPlay({ socket, view, serverNow, mobile }: Props) {
  const t = useTimer(view, serverNow);
  const p = view.round?.params ?? {};
  const min = Number(p.min ?? 1950);
  const max = Number(p.max ?? new Date().getFullYear());
  const [text, setText] = useState('');
  const [sent, setSent] = useState<{ key: string; value: number } | null>(null);
  const mine = sent?.key === t.key ? sent : null;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText('');
    if (t.canPlay && !mobile) window.setTimeout(() => !isReportOpen() && ref.current?.focus({ preventScroll: true }), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.key, t.canPlay]);
  const v = /^\d{4}$/.test(text) ? Number(text) : null;
  const ok = v !== null && v >= min && v <= max;
  const out = /^\d{4}$/.test(text) && !ok;
  const submit = () => {
    if (!t.canPlay || !ok || v === null) return;
    setSent({ key: t.key, value: v });
    setText('');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { value: v, elapsedMs: t.t0 !== null ? Math.round(performance.now() - t.t0) : null } });
  };
  return (
    <div className="quiz-stage song-stage songyear-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${t.left * 100}%` }} />
      </div>
      <p className="topic-title song-ask">
        <Icon icon={Music} /> <strong>몇 년도</strong>
        <span className="dim"> 노래일까요? — </span>
        <span className="mono topic-left">{t.leftSec}초</span>
      </p>
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
            data-songyear-input
            size={5}
            maxLength={4}
            pattern="[0-9]*"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={text}
            disabled={!t.canPlay}
            placeholder={view.spectating ? '구경 중' : mine ? String(mine.value) : '예: 2009'}
            aria-label="연도 입력"
            onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.stopPropagation();
            }}
          />
          <span className="quiz-num-unit">년</span>
          {t.canPlay && (
            <button type="submit" className="primary quiz-num-ok" disabled={!ok} onMouseDown={(e) => e.preventDefault()}>
              확인
            </button>
          )}
        </div>
        <p className={`quiz-num-help${out ? ' bad' : mine ? ' ok' : ' dim'}`} data-songyear-sent={mine?.value ?? ''}>
          {out ? `${min} ~ ${max} 사이로 적어 주세요` : mine ? `보낸 답 ${mine.value}년 — 바꿔도 돼요(마지막 답)` : view.spectating ? '구경 중이에요' : '가장 가까운 사람이 1등'}
        </p>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 · 표의 값
// ─────────────────────────────────────────────────────────────────────────────
export function SongReveal({ view, mine }: { view: MinigameView; mine: MinigameRoundRow | undefined }) {
  const rv = view.round?.reveal ?? {};
  const art = artwork(rv.artworkUrl);
  const skipped = rv.skipped === true;
  return (
    <div className="song-reveal" data-song-reveal={skipped ? 'skipped' : 'ok'}>
      <div className="song-card">
        {art ? <img className="song-art" src={art} alt="" width={120} height={120} loading="eager" data-song-art /> : <span className="song-art none" aria-hidden="true"><Icon icon={Music} /></span>}
        <div className="song-meta">
          <p className="song-title" data-song-title>
            {String(rv.title ?? '')}
          </p>
          <p className="song-artist">{String(rv.artist ?? '')}</p>
          <p className="song-year mono" data-song-year={String(rv.year ?? '')}>
            {String(rv.year ?? '')}년
          </p>
          <p className="song-credit dim">Apple Music 미리듣기</p>
        </div>
      </div>
      {skipped ? (
        <p className="song-skipped bad" data-song-skipped>
          미리듣기를 못 불러온 사람이 많아 이 곡은 점수 없이 넘어가요({Number(rv.fails ?? 0)}명)
        </p>
      ) : mine && !view.spectating ? (
        <p className="song-mine" data-song-mine>
          {view.key === 'song' ? songMineText(mine) : songYearMineText(mine)}
        </p>
      ) : null}
    </div>
  );
}

function songMineText(r: MinigameRoundRow): string {
  const t = r.extra?.title === true;
  const a = r.extra?.artist === true;
  if (!t && !a) return '못 맞혔어요';
  return `${t && a ? '제목 · 가수 둘 다' : t ? '제목' : '가수'} 맞힘 — +${r.points}점`;
}
function songYearMineText(r: MinigameRoundRow): string {
  if (r.extra?.guess === undefined) return '안 냈어요';
  const off = Number(r.extra.off ?? 0);
  return `내 답 ${String(r.extra.guess)}년 — ${off === 0 ? '정확!' : `${off}년 차이`}`;
}

/** 판 결과 표의 값 */
export function songValueText(view: MinigameView, r: MinigameRoundRow): string {
  if (r.extra?.skipped) return '건너뜀';
  if (view.key === 'song') {
    const t = r.extra?.title === true;
    const a = r.extra?.artist === true;
    return t && a ? '제목 ✓ 가수 ✓' : t ? '제목 ✓' : a ? '가수 ✓' : '못 맞힘';
  }
  if (r.extra?.guess === undefined) return '안 냄';
  const off = Number(r.extra.off ?? 0);
  return `${String(r.extra.guess)}년 (${off === 0 ? '정확' : `±${off}`})`;
}
