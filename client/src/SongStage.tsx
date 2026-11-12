// =============================================================================
// ★★★ R096 — 노래 맞히기 방식의 판 부품(D-353 · 브리프 C · C-2 · C-3 · D) — Question.tsx(퀴즈 카드)가 곡일 때 이것을 끼운다
//
// ★ 판 흐름 · 힌트 줄 · 스킵 · 공개(빵빠레 · 소감 칸 · 뒷북 · "N초 후") · 방장 확인은 **퀴즈 카드 그대로** — 여기는 다른 것만:
//   SongPlay   — 판 칸 가운데 앨범 표지(어둡게 가림) + 12시부터 시계 방향으로 밝아지는 부채꼴(곡 30초에 맞춰 · 퀴즈 시간 막대와 같은 tick · 같은 linear)
//                · 정답자가 나오면 남은 구간을 재빨리 돌아 한 바퀴 → 강조(살짝 커지며 빛) · 스킵 · 시간 초과 = 강조 없이 전부 공개
//                · 소리 띠(듣기 버튼 · 상태 · 볼륨 — 미니게임 노래 부품 그대로) · 재생 실패 보고(접속자 과반이면 서버가 그 곡을 넘긴다)
//   SongReveal — 공개: 표지 크게(SongPlay 의 표지가 그 자리에서 전부 밝아진 것) · 제목 크게 · 가수 한 단계 작게 · 칩 한 줄 · "○○ 님이 n초 만에 맞혔어요 +1"
//   SongRate   — 공개 화면 평가(👍 😐 👎 · 👎 사유 노래용) — 포인트 없음(1차) · 저장 = /api/minigame/song-rate
// ★ "Apple Music 미리듣기" 표기는 뺐다(찬종 2026-11-11 "완전히 빼" — 출처 근거는 docs/18 §10 저작권 메모에만).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RATE_CHOICES, SONG_FEEDBACK_REASONS } from '@quiz/shared';
import { Headphones, Music, Play, Volume2 } from 'lucide-react';
import Icon from './Icon.js';
import Avatar from './Avatar.js';
import { sfx, setMusicMode } from './sound.js';
import { installSongUnlock, playSong, retrySong, setSongVolume, stopSong, useSongAudio } from './minigame/songAudio.js';

export interface SongPlayView {
  previewUrl: string;
  cover: string | null;
  durationMs: number;
}

export interface SongRevealView {
  id: string;
  title: string;
  artist: string;
  year: number;
  chips: string[];
  cover: string | null;
  failSkipped?: boolean;
}

/** ★ 노래 판 동안 배경음악을 끈다(곡이 게임 내용) — 카드가 붙어 있는 동안 */
export function useSongMusicQuiet(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    setMusicMode('quiet');
    installSongUnlock();
    return () => {
      setMusicMode('normal');
      stopSong();
    };
  }, [on]);
}

/**
 * ★ 판 칸 — 표지 시계 공개 + 소리 띠.
 *   progress: 0~1(흐른 비율 — Question 이 100ms 마다 남은 시간으로 계산 · 일시정지 · 재접속은 남은 시간에서 이어 그린다)
 *   outcome: null(진행 중) · 'won'(정답 — 재빨리 한 바퀴 + 강조) · 'open'(스킵 · 시간 초과 — 강조 없이 전부)
 */
export function SongPlay({
  socket,
  epoch,
  song,
  progress,
  outcome,
  active,
  notice,
}: {
  socket: Socket;
  epoch: number;
  song: SongPlayView;
  progress: number;
  outcome: 'won' | 'open' | null;
  active: boolean;
  notice: string | null;
}) {
  const st = useSongAudio();
  const reported = useRef<number | null>(null);
  const startedFor = useRef<number | null>(null);
  // 곡이 바뀌면 그 곡을 튼다(늦게 들어온 사람 · 재접속은 흐른 초부터) · 공개 동안은 계속 흐른다(다음 곡이 오면 바뀐다)
  // ★★ R098 — 정리(cleanup)에서 표시를 지운다. 옛 코드는 표시가 남아, 효과가 떼였다 다시 붙으면(React 개발 빌드의 StrictMode 이중 실행 —
  //   그 사이 부모 useSongMusicQuiet 정리가 stopSong) "이미 틀었음" 으로 건너뛰어 곡이 꺼진 채 남았다(실 서버 소리 없음의 원인).
  //   같은 곡이 이미 나오는 중이면 playSong 이 스스로 건너뛴다.
  useEffect(() => {
    if (!active || startedFor.current === epoch) return;
    startedFor.current = epoch;
    playSong(song.previewUrl, Math.max(0, (progress * song.durationMs) / 1000));
    return () => {
      startedFor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, active, song.previewUrl]);
  // 재생 실패 → 서버에 한 번(곡 진행 중 · 이 곡)
  useEffect(() => {
    if (st.status !== 'failed' || !active || st.url !== song.previewUrl || reported.current === epoch) return;
    reported.current = epoch;
    socket.emit('song.fail', { epoch });
  }, [st.status, st.url, song.previewUrl, active, epoch, socket]);

  const blocked = active && st.status === 'blocked';
  const failed = active && st.status === 'failed' && st.url === song.previewUrl;
  // ★★ R098 — 버튼은 "누르면 무언가 되는" 때만: 막힘 · 실패(다시) · 이 곡이 안 걸려 있음(idle 등).
  //   옛 조건(!unlocked && status !== 'playing')은 불러오는 중 · 실패 때도 버튼을 띄워 실패 글자를 가렸고, 누르면 아무 일도 없었다
  const needTap = active && (blocked || failed || st.url !== song.previewUrl || (!st.unlocked && st.status === 'idle'));
  const p = outcome ? 1 : Math.max(0, Math.min(1, progress));
  return (
    <div className="song-play">
      <div
        className={`song-cover${outcome === 'won' ? ' won' : ''}${outcome ? ' done' : ''}`}
        data-song-cover
        data-progress={p.toFixed(3)}
        style={{ ['--song-p' as string]: String(p) }}
      >
        {song.cover ? <img src={song.cover} alt="" draggable={false} /> : <span className="song-cover-none" aria-hidden="true"><Icon icon={Music} /></span>}
        <span className="song-cover-veil" aria-hidden="true" />
      </div>
      {notice && (
        <p className="song-notice" role="status" data-song-notice>
          {notice}
        </p>
      )}
      <div className={`song-sound${blocked ? ' blocked' : ''}`} data-song-sound={st.status} data-song-unlocked={st.unlocked ? '1' : '0'}>
        {failed && (
          <span className="song-state" data-song-state>
            <Icon icon={Headphones} /> 미리듣기를 못 불러왔어요
          </span>
        )}
        {needTap ? (
          <button
            type="button"
            className="primary song-listen"
            data-song-listen
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              // ★ R098 — 이 곡을 판에서 흐른 초부터(실패면 다시 불러와서) — 옛 unlockSongAudio() 는 곡이 안 걸려 있으면 무음만 틀었다
              retrySong(song.previewUrl, Math.max(0, (progress * song.durationMs) / 1000));
              sfx('mg-tap');
            }}
          >
            <Icon icon={Play} /> {failed ? '다시 듣기' : '듣기'}
          </button>
        ) : (
          <span className="song-state" data-song-state>
            <Icon icon={Headphones} /> {st.status === 'playing' ? '듣는 중' : st.status === 'loading' ? '불러오는 중…' : ''}
          </span>
        )}
        <label className="song-vol">
          <Icon icon={Volume2} />
          <input type="range" min={0} max={100} step={5} value={Math.round(st.volume * 100)} aria-label="노래 소리 크기" data-song-volume onChange={(e) => setSongVolume(Number(e.target.value) / 100)} />
          <span className="mono song-vol-n">{Math.round(st.volume * 100)}</span>
        </label>
      </div>
    </div>
  );
}

/** 공개 — 제목 · 가수 · 칩 · 맞힌 사람 줄(표지는 SongPlay 가 그 자리에서 밝아진 것) */
export function SongReveal({
  song,
  winner,
  winnerMs,
  reasonTitle,
}: {
  song: SongRevealView;
  winner: { accountId: string; nickname: string; colorIndex: number; avatarV?: number | null } | null;
  winnerMs: number | null;
  reasonTitle: string;
}) {
  return (
    <div className="song-reveal-text">
      <p className="song-title" data-song-title>
        {song.title}
      </p>
      <p className="song-artist">{song.artist}</p>
      <p className="song-chips">
        {song.chips.map((c) => (
          <span key={c} className="badge diff">
            {c}
          </span>
        ))}
        <span className="badge diff mono">{song.year}</span>
      </p>
      {winner ? (
        <p className="song-winner" data-song-winner>
          <Avatar xs nickname={winner.nickname} colorIndex={winner.colorIndex} accountId={winner.accountId} avatarV={winner.avatarV} />
          <span style={{ color: `var(--p${winner.colorIndex})` }}>{winner.nickname}</span> 님이{' '}
          {winnerMs !== null ? <span className="mono">{(winnerMs / 1000).toFixed(1)}초</span> : null} 만에 맞혔어요 <span className="winner-plus">+1</span>
        </p>
      ) : (
        <p className="song-winner dim">{song.failSkipped ? '미리듣기를 못 불러와 넘겼어요' : reasonTitle}</p>
      )}
    </div>
  );
}

/** ★ 공개 화면 평가 — 퀴즈 RevealFeedback 꼴(같은 버튼 · 같은 자리) · 👎 면 노래 사유 칩 · 한 사람 한 곡 하나(바꿀 수 있음) */
export function SongRate({ gameId, songId }: { gameId: string; songId: string }) {
  const [vote, setVote] = useState<1 | 0 | -1 | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setVote(null);
    setReasons([]);
    setSaved(false);
  }, [songId]);
  const send = (v: 1 | 0 | -1, rs: string[]) => {
    void fetch('/api/minigame/song-rate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId, songId, vote: v, reasons: rs }),
    })
      .then((r) => setSaved(r.ok))
      .catch(() => setSaved(false));
  };
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="reveal-fb song-rate" data-song-rate>
      <span className="reveal-fb-ask">{saved && (vote !== -1 || reasons.length) ? '고마워요!' : vote === -1 ? '어떤 점이 별로였어요?' : '방금 노래 어땠어요?'}</span>
      <span className="fb-votes" role="group" aria-label="방금 노래 평가">
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
            onClick={() => {
              setVote(c.vote);
              const rs = c.vote === -1 ? reasons : [];
              if (c.vote !== -1) setReasons([]);
              send(c.vote, rs);
            }}
          >
            <span className="fb-vote-emoji" aria-hidden="true">
              {c.emoji}
            </span>
          </button>
        ))}
      </span>
      {vote === -1 && (
        <span className="reveal-fb-chips fb-chips" role="group" aria-label="별로인 이유">
          {SONG_FEEDBACK_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              className={reasons.includes(r.code) ? 'fb-chip on' : 'fb-chip'}
              aria-pressed={reasons.includes(r.code)}
              data-reason={r.code}
              onMouseDown={keepFocus}
              onClick={() => {
                const next = reasons.includes(r.code) ? reasons.filter((x) => x !== r.code) : [...reasons, r.code];
                setReasons(next);
                send(-1, next);
              }}
            >
              {r.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** ★ 결과 화면 — 곡별 한 줄(작은 표지 · 제목 — 가수 · 누가 맞혔나 / 못 맞힘) · 접이식(기본 펼침) · 중단된 곡은 제목 없이 */
export function SongResultList({
  questions,
  players,
}: {
  questions: { index: number; reason: string; winnerAccountId: string | null; responseMs: number | null; song?: Partial<SongRevealView> & { id: string } | null }[];
  players: { accountId: string; nickname: string; colorIndex: number }[];
}) {
  const rows = questions.filter((q) => q.song);
  if (!rows.length) return null;
  const solved = rows.filter((q) => q.reason === 'correct').length;
  return (
    <details className="song-result" open data-song-result>
      <summary>
        곡 {rows.length} · 맞힌 곡 {solved}
      </summary>
      <ol className="song-result-list">
        {rows.map((q) => {
          const s = q.song!;
          const w = q.winnerAccountId ? players.find((p) => p.accountId === q.winnerAccountId) : null;
          return (
            <li key={q.index} data-song-row={s.id}>
              {s.cover ? <img className="song-result-art" src={s.cover.replace('/600x600bb.', '/100x100bb.')} alt="" /> : <span className="song-result-art none" aria-hidden="true" />}
              <span className="song-result-meta">
                <span className="song-result-title">{s.title ?? '(중단된 곡)'}</span>
                {s.artist && <span className="song-result-artist dim">{s.artist}</span>}
              </span>
              <span className="song-result-who">
                {w ? (
                  <>
                    <span style={{ color: `var(--p${w.colorIndex})` }}>{w.nickname}</span>
                    {q.responseMs !== null && <span className="mono dim"> {(q.responseMs / 1000).toFixed(1)}초</span>}
                  </>
                ) : (
                  <span className="dim">{q.reason === 'aborted' ? '중단' : '못 맞힘'}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
