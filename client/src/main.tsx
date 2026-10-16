import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { installAudioUnlock } from './sound.js';
import { initTheme } from './theme.js';
import { installPrefsSync } from './prefsSync.js';
import { installUiMode } from './uiMode.js';
import { installNoCopy } from './noCopy.js';
// ★★ R039 — Pretendard 를 우리 서버에서 낸다 (동적 서브셋 — 화면에 쓰인 글자 조각만 내려받는다)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';

// ★ R033 — 첫 렌더 전에 테마를 붙인다 (기본 테마로 번쩍이는 것을 막는다)
initTheme();
// ★★ R050 — PC/모바일 판정(넓은 화면 + 키보드 환경만 PC) · 첫 렌더 전에 html 클래스를 붙인다 (D-232)
installUiMode();
// ★★ R050 — 질문 · 힌트 복사 막기 (전체 선택으로 복사할 때도 그 부분만 뺀다)
installNoCopy();
// ★ 소리는 첫 클릭·키 입력 뒤부터 (브라우저 자동재생 정책)
installAudioUnlock();
// ★ R034 — 로그인한 동안 테마·소리를 계정에 저장한다
installPrefsSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
