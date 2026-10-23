// =============================================================================
// ★★ R064 (D-264 · 찬종 #25 "결과 화면 … 아예 보이지도 않네" · #27 "다시하게/로비로 버튼이 안떠")
//
// ★ 화면 한 조각이 그리다 예외를 던지면 React 는 **방 화면 전체**를 지운다(빈 화면). 그 조각만 대신 그린다.
// ★ 대신 그리는 것: 한 줄 안내 + 방장이면 [로비로] — "아예 안 보임" 대신 다음으로 갈 길이 늘 있다.
// ★ 예외는 console.error 와 clientErrors(제보에 함께 담긴다)에 남긴다.
// =============================================================================

import { Component, type ReactNode } from 'react';
import { noteClientError } from './clientErrors.js';

interface Props {
  /** 어느 조각인가(기록용) */
  name: string;
  children: ReactNode;
  /** 대신 그릴 것 */
  fallback: (error: Error) => ReactNode;
}

export default class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(`[${this.props.name}] 그리기 실패`, error);
    noteClientError(`${this.props.name}: ${error.message}`);
  }

  override render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
