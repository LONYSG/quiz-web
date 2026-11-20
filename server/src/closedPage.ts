// =============================================================================
// ★★ R111 (D-371) — 닫힌 공개 자리의 "준비 중" 한 장(찬종 2026-11-21 "퀴즈 사이트는 좀 더 정비하고 올리는 걸로 할 거야")
//   서버가 작은 html 한 장을 낸다 — 앱 묶음(js) · 문항 · 그림 길은 닫힌 동안 공개 주소로 나가지 않는다.
//   모양 = 웹 첫 화면과 같은 집안(파스텔 테마의 바탕 번짐 · 글자색 · 공식 로고 · 이름 "퀴즈도장") · 버튼 · 입력칸 · 베타 주소 안내 없음.
//   한 줄 문구 = shared SITE_TEXT.closedLine(사람이 읽는 글의 마지막 단계는 gpt — 설계 창이 그 상수만 바꾼다).
//   로고 = docs/design/logo/quizdojang-logo.svg 그대로(R110 BrandLogo 와 같은 그림) · 글꼴 = 시스템 한글 글꼴(묶음의 Pretendard 를 내려보내지 않는다).
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_TEXT } from '@quiz/shared';
import { config } from './config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOGO_FILE = path.join(ROOT, 'docs', 'design', 'logo', 'quizdojang-logo.svg');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let cached: string | null = null;

/** 준비 중 한 장(서버가 켜질 때 한 번 만든다 — 값은 .env · 상수에서) */
export function closedPageHtml(): string {
  if (cached) return cached;
  const logo = existsSync(LOGO_FILE)
    ? readFileSync(LOGO_FILE, 'utf8').replace('<svg ', '<svg class="logo" width="112" height="112" aria-hidden="true" ')
    : '';
  const yt = config.youtubeUrl
    ? `<p class="foot"><a href="${esc(config.youtubeUrl)}" rel="noopener" target="_blank">${esc(SITE_TEXT.closedYoutube)}</a></p>`
    : '';
  cached = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>퀴즈도장</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: radial-gradient(1200px 600px at 10% -10%, #ffe3f1 0%, transparent 60%),
      radial-gradient(1000px 700px at 110% 10%, #dcefff 0%, transparent 55%),
      radial-gradient(900px 600px at 50% 120%, #fff2c9 0%, transparent 60%), #fff8f0;
    background-attachment: fixed;
    color: #3a3156;
    font-family: 'Pretendard Variable', 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    text-align: center;
  }
  main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .logo { display: block; filter: drop-shadow(0 6px 14px rgba(138, 107, 255, 0.28)); animation: float 3.2s ease-in-out infinite; }
  h1 { font-size: 2.2rem; margin: 14px 0 6px; letter-spacing: -0.01em; }
  .line { margin: 0; font-size: 1.05rem; color: #8d82a8; font-weight: 600; }
  .foot { margin: 24px 0 0; font-size: 0.85rem; }
  .foot a { color: #8d82a8; text-decoration: none; border-bottom: 1px solid #e6dcf7; }
  .foot a:hover { color: #8a6bff; }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { .logo { animation: none; } }
  @media (max-width: 480px) { .logo { width: 88px; height: 88px; } h1 { font-size: 1.8rem; } }
</style>
</head>
<body data-closed>
<main>
${logo}
<h1>퀴즈도장</h1>
<p class="line">${esc(SITE_TEXT.closedLine)}</p>
</main>
${yt}
</body>
</html>
`;
  return cached;
}
