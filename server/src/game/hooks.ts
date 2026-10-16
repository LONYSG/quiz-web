// ★★ R050 — 문제 진행과 미니게임 엔진 사이의 갈림길 (서로 import 하지 않게 — 모듈 순환을 피한다)
//   question.ts 는 다음 문제로 가기 직전에 beforeNextQuestion 을 부르고, 미니게임 엔진이 시작할 때 등록한다.
import type { Room } from '../rooms/types.js';

let beforeNextQuestion: ((room: Room) => boolean) | null = null;

export function setBeforeNextQuestion(fn: (room: Room) => boolean): void {
  beforeNextQuestion = fn;
}

/** true 면 다음 문제를 미룬다 (미니게임이 끝나면 엔진이 beginQuestion 을 부른다) */
export function runBeforeNextQuestion(room: Room): boolean {
  return beforeNextQuestion?.(room) ?? false;
}
