// =============================================================================
// ★★★ R117 (docs/24 3-6 · 3-7 · 8절 "공방 목록") — 탭 셋 · 방 줄(줄 안 ①) · 아래(엄지) [빠른 입장 | ⚙] + [방 만들기]
//   ★ 화면에 있는 동안만 구독한다 — directory.watch { kind } / 떠날 때 directory.unwatch. 1초마다 서버가 바뀐 때만 보낸다.
//   ★ 줄 = 왼쪽 상태(대기 · 진행 막대) · 가운데 제목 · 🔒 · 난이도 · 미니게임 · 오른쪽 인원 "5/8"(꽉 차면 빨강) — 방장 이름 · 띠 없음.
//   ★ 들어갈 수 없는 방(잠김 · 꽉 참)은 흐리게 아래로(정렬은 서버) · 🔒 방을 누르면 숫자판.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  ROOM_KINDS,
  canEnter,
  quickJoinOptCount,
  type DifficultyLevel,
  type QuickJoinField,
  type QuickJoinOpts,
  type RoomKind,
  type RoomListItem,
} from '@quiz/shared';
import { Gamepad2, Lock, Plus, Settings, Zap } from 'lucide-react';
import Icon from '../Icon.js';
import ConfirmModal from '../ConfirmModal.js';
import PopupClose from '../PopupClose.js';
import { usePopup } from '../popup.js';
import { KIND_ICON, KIND_LABEL, LEVEL_LABEL } from './kinds.js';
import { setQuickJoin, useQuickJoin } from './store.js';
import type { CreatePrefill } from './CreateRoom.js';

type QuickResult =
  | { status: 'joined'; kind: RoomKind; code: string }
  | { status: 'near'; kind: RoomKind; room: RoomListItem; mismatch: QuickJoinField[]; createWith: CreatePrefill }
  | { status: 'none'; kind: RoomKind; createWith: CreatePrefill };

interface Props {
  socket: Socket;
  kind: RoomKind;
  onKind: (k: RoomKind) => void;
  counts: Record<RoomKind, number> | null;
  onCounts: (c: Record<RoomKind, number>) => void;
  onJoin: (item: RoomListItem) => void;
  onCreate: (prefill: CreatePrefill) => void;
}

const LEVELS: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

/** 어긋난 칸 한 줄(비슷한 방 창) */
function mismatchLine(room: RoomListItem, mm: QuickJoinField[], o: QuickJoinOpts): string {
  const parts = mm.map((f) => {
    if (f === 'level') return `${room.level ? LEVEL_LABEL[room.level] : '다른 난이도'} 방이에요`;
    if (f === 'minigame') return room.minigames ? '미니게임이 켜진 방이에요' : '미니게임이 없는 방이에요';
    if (f === 'waiting') return '게임이 진행 중인 방이에요';
    return o.size === 'small' ? '사람이 많은 방이에요' : '사람이 적은 방이에요';
  });
  return parts.join(' · ');
}

function RoomRow({ item, onJoin }: { item: RoomListItem; onJoin: (it: RoomListItem) => void }) {
  const full = item.players >= item.max;
  const open = canEnter(item);
  const pct = item.progress && item.progress.total > 0 ? Math.min(100, Math.round((item.progress.done / item.progress.total) * 100)) : 0;
  return (
    <button
      type="button"
      className={open ? 'dir-row' : 'dir-row dim'}
      data-room-code={item.code}
      data-locked={item.locked ? '1' : undefined}
      aria-label={`${item.title} — ${item.players}/${item.max}명${item.locked ? ' · 잠김' : ''}${full ? ' · 가득 참' : ''}`}
      onClick={() => onJoin(item)}
    >
      <span className="dir-state">
        {item.phase === 'waiting' || !item.progress ? (
          <span className="pill-wait">대기</span>
        ) : (
          <>
            <span className="mono">
              {item.progress.done}/{item.progress.total}
            </span>
            <span className="prog">
              <i style={{ width: `${pct}%` }} />
            </span>
          </>
        )}
      </span>
      <span className="dir-mid">
        <span className="dir-title">
          {item.locked && (
            <span className="lock">
              <Icon icon={Lock} />
            </span>
          )}
          <span className="dir-title-t">{item.title}</span>
        </span>
        <span className="dir-meta">
          {item.tag === 'minigame' ? (
            <span className="badge diff">미니게임만</span>
          ) : item.tag === 'song' ? (
            <span className="badge diff">노래</span>
          ) : (
            item.level && <span className="badge diff">{LEVEL_LABEL[item.level]}</span>
          )}
          {item.minigames && (
            <span className="mg-on">
              <Icon icon={Gamepad2} />
              미니게임
            </span>
          )}
        </span>
      </span>
      <span className={full ? 'dir-cnt full' : 'dir-cnt'}>
        {item.players}
        <small>/{item.max}</small>
      </span>
    </button>
  );
}

/** ⚙ — 빠른 입장 옵션(칩 · 체크칸만 · 설명 문장 없음) */
function QuickOptions({ kind, onClose }: { kind: RoomKind; onClose: () => void }) {
  const saved = useQuickJoin();
  const [d, setD] = useState<QuickJoinOpts>(saved);
  const quiz = kind === 'quiz';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const toggleLevel = (l: DifficultyLevel) => setD((o) => ({ ...o, levels: o.levels.includes(l) ? o.levels.filter((x) => x !== l) : LEVELS.filter((x) => x === l || o.levels.includes(x)) }));
  const chip = (on: boolean, label: string, onClick: () => void, data?: string) => (
    <button type="button" className={on ? 'preset active' : 'preset'} aria-pressed={on} data-qj={data} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal qj-modal" role="dialog" aria-label="빠른 입장 옵션" data-qj-modal>
        <div className="pop-head">
          <p className="pop-title">빠른 입장 옵션</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="settings">
          {quiz && (
            <div className="set-row">
              <span className="set-label">난이도</span>
              <div className="preset-row">{LEVELS.map((l) => chip(d.levels.includes(l), LEVEL_LABEL[l], () => toggleLevel(l), `level-${l}`))}</div>
            </div>
          )}
          {quiz && (
            <div className="set-row">
              <span className="set-label">미니게임</span>
              <div className="preset-row">
                {chip(d.minigame === 'any', '상관없음', () => setD({ ...d, minigame: 'any' }), 'mg-any')}
                {chip(d.minigame === 'with', '있는 방', () => setD({ ...d, minigame: 'with' }), 'mg-with')}
                {chip(d.minigame === 'without', '없는 방', () => setD({ ...d, minigame: 'without' }), 'mg-without')}
              </div>
            </div>
          )}
          <div className="set-row">
            <span className="set-label">인원</span>
            <div className="preset-row">
              {chip(d.size === 'any', '상관없음', () => setD({ ...d, size: 'any' }), 'size-any')}
              {chip(d.size === 'small', '적은 방', () => setD({ ...d, size: 'small' }), 'size-small')}
              {chip(d.size === 'big', '북적이는 방', () => setD({ ...d, size: 'big' }), 'size-big')}
            </div>
          </div>
          <div className="set-row">
            <span className="set-label">대기 중인 방만</span>
            <div className="preset-row">
              <label className="mg-check">
                <input type="checkbox" data-qj="waiting" checked={d.waitingOnly} onChange={(e) => setD({ ...d, waitingOnly: e.target.checked })} />
                켜기
              </label>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" data-qj="reset" onClick={() => setD({ levels: [], minigame: 'any', size: 'any', waitingOnly: false })}>
            처음대로
          </button>
          <button
            type="button"
            className="primary"
            data-qj="save"
            onClick={() => {
              setQuickJoin(d);
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Directory({ socket, kind, onKind, counts, onCounts, onJoin, onCreate }: Props) {
  const [list, setList] = useState<{ kind: RoomKind; rooms: RoomListItem[]; more: boolean } | null>(null);
  const [optOpen, setOptOpen] = usePopup('quick-join-opts');
  const [result, setResult] = useState<QuickResult | null>(null);
  const [nearOpen, setNearOpen] = usePopup('quick-join-near');
  const [busy, setBusy] = useState(false);
  const opts = useQuickJoin();
  // 탭이 아닌 칸(난이도 · 미니게임)은 퀴즈 탭에서만 뜻이 있다 — 다른 탭에서는 보내지 않고 세지도 않는다
  const sentOpts: QuickJoinOpts = kind === 'quiz' ? opts : { ...opts, levels: [], minigame: 'any' };
  const optCount = quickJoinOptCount(sentOpts);

  // ── 구독(탭을 바꾸면 다시 · 떠나면 끊는다)
  useEffect(() => {
    const onList = (p: { kind: RoomKind; rooms: RoomListItem[]; more: boolean; counts?: Record<RoomKind, number> }) => {
      if (p.counts) onCounts(p.counts);
      if (p.kind !== kind) return;
      setList({ kind: p.kind, rooms: p.rooms, more: p.more });
    };
    const watch = () => socket.emit('directory.watch', { kind });
    socket.on('directory.list', onList);
    socket.on('connect', watch);
    if (socket.connected) watch();
    return () => {
      socket.off('directory.list', onList);
      socket.off('connect', watch);
    };
  }, [socket, kind, onCounts]);
  useEffect(() => () => void socket.emit('directory.unwatch', {}), [socket]);

  // ── 빠른 입장 결과
  useEffect(() => {
    const onResult = (r: QuickResult) => {
      setBusy(false);
      if (r.status === 'joined') return;
      setResult(r);
      setNearOpen(true);
    };
    const onErr = () => setBusy(false);
    socket.on('directory.quickJoinResult', onResult);
    socket.on('error', onErr);
    return () => {
      socket.off('directory.quickJoinResult', onResult);
      socket.off('error', onErr);
    };
  }, [socket, setNearOpen]);

  const quick = (code?: string) => {
    setBusy(true);
    socket.emit('directory.quickJoin', { kind, opts: sentOpts, ...(code ? { code } : {}) });
  };

  const rooms = list && list.kind === kind ? list.rooms : null;

  return (
    <>
      <div className="dir-kinds" role="tablist" aria-label="방 종류">
        {ROOM_KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} data-dir-tab={k} className={`dir-kind k-${k}${kind === k ? ' on' : ''}`} onClick={() => onKind(k)}>
            <Icon icon={KIND_ICON[k]} />
            <b>{KIND_LABEL[k]}</b>
            <small>방 {counts ? counts[k] : '–'}</small>
          </button>
        ))}
      </div>
      <section className="card dir-list" data-dir-list={kind} aria-busy={rooms === null}>
        {rooms === null ? (
          <p className="dim dir-empty">불러오는 중…</p>
        ) : rooms.length === 0 ? (
          <p className="dim dir-empty" data-dir-empty>
            아직 열린 {KIND_LABEL[kind]} 방이 없어요
          </p>
        ) : (
          rooms.map((it) => <RoomRow key={it.code} item={it} onJoin={onJoin} />)
        )}
        {list?.more && <p className="dim dir-more">방이 많아 100개까지 보여요 · 빠른 입장을 써 보세요</p>}
      </section>
      <div className="dir-bottom">
        <div className="qj-split">
          <button type="button" className="qj-main" data-quick-join disabled={busy} onClick={() => quick()}>
            <Icon icon={Zap} /> 빠른 입장
          </button>
          <span className="qj-div" aria-hidden="true" />
          <button type="button" className="qj-opt" data-quick-opts aria-label={optCount ? `빠른 입장 옵션 ${optCount}개` : '빠른 입장 옵션'} onClick={() => setOptOpen(true)}>
            <Icon icon={Settings} />
            {optCount > 0 && <i className="dot" />}
            {optCount > 0 && <small>옵션 {optCount}</small>}
          </button>
        </div>
        <button type="button" className="gb-make" data-gb-make onClick={() => onCreate({ kind, level: null, minigames: null })}>
          <Icon icon={Plus} /> 방 만들기
        </button>
      </div>
      {optOpen && <QuickOptions kind={kind} onClose={() => setOptOpen(false)} />}
      {nearOpen && result && result.status === 'near' && (
        <ConfirmModal
          kind="quick-near"
          title="옵션에 딱 맞는 방이 없어서, 가장 비슷한 방으로 들어가요"
          note={`「${result.room.title}」 · ${result.room.level ? `${LEVEL_LABEL[result.room.level]} · ` : ''}${result.room.players}/${result.room.max} — ${mismatchLine(result.room, result.mismatch, sentOpts)}`}
          actions={[
            {
              label: '확인',
              onClick: () => {
                setNearOpen(false);
                quick(result.room.code);
              },
            },
            {
              label: '이 옵션으로 방 만들기',
              onClick: () => {
                setNearOpen(false);
                onCreate(result.createWith);
              },
            },
          ]}
          onCancel={() => setNearOpen(false)}
        />
      )}
      {nearOpen && result && result.status === 'none' && (
        <ConfirmModal
          kind="quick-none"
          title="지금 들어갈 수 있는 방이 없어요"
          actions={[
            {
              label: optCount ? '이 옵션으로 방 만들기' : '방 만들기',
              onClick: () => {
                setNearOpen(false);
                onCreate(result.createWith);
              },
            },
          ]}
          onCancel={() => setNearOpen(false)}
        />
      )}
    </>
  );
}
