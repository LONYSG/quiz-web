// ★★ R050 (D-232) — 닉네임 옆 작은 기기 표시: 🖥 PC(넓은 화면 + 키보드 환경) · 📱 모바일(그 밖 — 태블릿 · 폴드 포함)
import { Monitor, Smartphone } from 'lucide-react';
import Icon from './Icon.js';

export default function DeviceIcon({ device }: { device?: 'pc' | 'mobile' | null }) {
  if (!device) return null;
  const pc = device === 'pc';
  return (
    <span className={pc ? 'device-icon pc' : 'device-icon mobile'} title={pc ? 'PC (키보드)' : '모바일 · 태블릿'} aria-label={pc ? 'PC' : '모바일'} data-device={device}>
      <Icon icon={pc ? Monitor : Smartphone} />
    </span>
  );
}
