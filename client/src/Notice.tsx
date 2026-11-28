// =============================================================================
// ★★ R123 — 경고 · 주의 문구 한 꼴(찬종 "평소에는 안 뜨는 경고 문구는 색도 다르게 하고 줄바꿈 해서 가독성 좋게.
//   다른 곳에서도 경고/주의 문구는 기본 문구와 다르게")
//   · 자기 줄(블록) · 기존 토큰의 경고색(--warn · 오류는 --bad) · 앞에 작은 표시 하나.
//   · 방 설정 · 모드 바꾸기 · 시작 막힘 · 혼자 하기 등 평소 안 뜨는 문구는 전부 이것으로.
//   · reserve: 문구가 없어도 줄 높이를 비워 둔다(떠도 아래가 밀리지 않게 — 시작 버튼 아래 줄).
// =============================================================================

import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import Icon from './Icon.js';

interface Props {
  tone?: 'warn' | 'bad';
  children?: ReactNode;
  /** 비어 있어도 한 줄 자리를 차지한다 */
  reserve?: boolean;
  className?: string;
  /** 검사용 이름(data-notice-for) */
  name?: string;
  /** ★★★ R125 — 글 줄 안(label 등)에는 span 으로(모양은 같다 — 자기 줄) */
  as?: 'p' | 'span';
  /** 오류는 role=alert 로 읽게(입력 오류 · 실패) */
  alert?: boolean;
}

export default function Notice({ tone = 'warn', children, reserve = false, className, name, as = 'p', alert = false }: Props) {
  const empty = children === null || children === undefined || children === false || children === '';
  if (empty && !reserve) return null;
  const Tag = as;
  return (
    <Tag
      className={`notice-line tone-${tone}${empty ? ' empty' : ''}${className ? ` ${className}` : ''}`}
      role={empty ? undefined : alert ? 'alert' : 'status'}
      data-notice={empty ? undefined : tone}
      data-notice-for={name}
      data-wrap-ok
    >
      {!empty && <Icon icon={TriangleAlert} />}
      {!empty && <span>{children}</span>}
    </Tag>
  );
}
