// =============================================================================
// 메모리 방 모델
//
// ★★ 이 구조 위에 Phase 3의 게임 상태가 얹힌다. 뼈대를 잘못 세우면 전부 뜯어야 한다.
//
// 왜 메모리인가 (docs/07-DECISIONS.md D-008)
//   guide 48절이 "진행 중인 실시간 게임 상태는 서버 메모리와 DB를 적절히 조합해 구현할 수 있다"고
//   명시적으로 허용한다. 참가자 접속 상태는 초 단위로 바뀌므로 DB에 반영하면 DB를 계속 깨워 둔다.
//   그리고 서버가 재시작되면 소켓이 전부 끊기므로 참가자 목록을 복원해도 의미가 없다.
//   DB에는 rooms 레코드만 둔다.
//
// ★ Phase 3에서 여기에 추가될 것 (지금은 자리만 비워 둔다)
//   game / currentQuestion / skipVotes / scores / paused
//   필드를 미리 선언해 두면 Phase 3에서 채우기만 하면 되고,
//   스냅샷 생성 함수(snapshot.ts)도 구조를 바꿀 필요가 없다.
// =============================================================================

import type { RoomState } from '@quiz/shared';

export interface Player {
  accountId: string;
  nickname: string;
  /** 색상 팔레트 인덱스. 게임 세션 동안 유지되고 재접속해도 같다 (guide 35절) */
  colorIndex: number;
  /** 입장 순서. 방장 이전 순서를 결정한다 (입장이 가장 빠른 활성 플레이어) */
  joinOrder: number;
  /** 현재 소켓이 붙어 있는가 */
  connected: boolean;
  socketId: string | null;
  /**
   * 끊긴 시각. null이면 접속 중.
   * ★ 점수판의 "접속 종료" 표시는 끊긴 뒤 5초가 지나야 나타난다 (Q-15 보완).
   *   새로고침은 보통 1~3초라 즉시 표시하면 표기가 깜빡여 사용자 경험이 나쁘다.
   *   ★ 단 스킵 분모와 활성 인원 판정은 끊김 즉시 반영한다 (Q-29). 두 축을 분리한다.
   */
  disconnectedAt: number | null;
  /** 현재 게임에서의 점수. Phase 3에서 사용한다 */
  score: number;
}

export interface RoomSettings {
  questionCount: number;
  startMode: 'instant' | 'countdown';
  countdownSec: number;
}

export interface Room {
  id: string;
  title: string;
  /** 현재 방장. 이전되면 바뀐다 (rooms.host_account_id 는 생성 당시 값으로 고정) */
  hostAccountId: string;
  createdBy: string;
  createdAt: number;

  state: RoomState;

  /** 입장 순서를 보존하기 위해 Map 을 쓴다 (JS Map 은 삽입 순서를 보장한다) */
  players: Map<string, Player>;
  nextJoinOrder: number;

  settings: RoomSettings;
  settingsLocked: boolean;

  /** 직전 게임 설정. "다시 하기"에서 복원한다 (Q-31) */
  lastGameSettings: RoomSettings | null;

  /**
   * 채팅 버퍼. 최근 CHAT_BUFFER_SIZE 개.
   * ★ 마스킹은 브로드캐스트 시점에 확정하고 여기에 원문과 치환본을 함께 저장한다.
   *   스냅샷에서 재계산하면 문제가 바뀔 때 과거 메시지의 마스킹이 흔들린다 (R003 3-4).
   */
  chat: ChatEntry[];

  /**
   * 방장 이전 유예 만료 시각. null이면 유예 중이 아니다 (Q-29, 30초).
   * ★ 활성 0명 동안에는 이 타이머를 정지한다. 이전할 대상이 없기 때문이다.
   */
  hostGraceUntil: number | null;

  /**
   * 활성 인원이 0명이 된 시각. 방 삭제 타이머(10분)의 기준이다 (Q-14).
   * ★ PAUSED 중에는 이 타이머를 정지한다. 그러지 않으면 10분 뒤 방이 사라져
   *   일시정지가 무의미해진다. (Phase 5에서 PAUSED 도입 시 적용)
   */
  emptySince: number | null;

  // ── Phase 3에서 채운다. 지금은 항상 null 이다.
  game: null;
  currentQuestion: null;
  paused: null;
}

export interface ChatEntry {
  id: string;
  seq: number;
  accountId: string;
  nickname: string;
  colorIndex: number;
  /** NFC 정규화된 원문. 발신자 본인에게 보낼 값 */
  rawNfc: string;
  /** 마스킹된 텍스트. 마스킹이 없었으면 null (Phase 6에서 사용) */
  maskedText: string | null;
  ts: number;
  /** 시스템 메시지(입퇴장, 게임 시작 구분선 등)면 true */
  system: boolean;
}
