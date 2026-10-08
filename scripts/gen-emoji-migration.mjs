#!/usr/bin/env node
// =============================================================================
// ★★ R039 — 표준 이모티콘 목록 → migrations/0013_emojis.sql 생성 (한 번 돌려 만든 파일을 커밋한다)
//
//   데이터: emojibase-data/ko (한국어 이름 · 검색어 · 분류 · 정렬)
//   그림:   @twemoji/svg (Twemoji — 기기마다 그림이 달라지지 않게 모두 같은 그림)
//   ★ 피부색 변형은 넣지 않는다 (기본형만). "구성 요소" 분류도 뺀다. 그림 파일이 없는 것도 뺀다.
//   ★ code = Twemoji 파일 이름 (소문자 16진수, ZWJ 가 없으면 FE0F 를 뺀다 — Twemoji 이름 규칙)
//
//   node scripts/gen-emoji-migration.mjs
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/emojibase-data/ko/data.json'), 'utf8'));
const SVG = path.join(ROOT, 'node_modules/@twemoji/svg');

/** emojibase 분류 번호 → 우리 분류 키 (화면 탭 순서) */
const GROUPS = {
  0: 'smileys',
  1: 'people',
  3: 'animals',
  4: 'food',
  6: 'activities',
  5: 'travel',
  7: 'objects',
  8: 'symbols',
  9: 'flags',
};

export function twemojiCode(hexcode) {
  let c = hexcode.toLowerCase();
  if (!c.includes('200d')) c = c.split('-').filter((p) => p !== 'fe0f').join('-');
  return c;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = [];
let skipped = 0;
for (const e of data) {
  if (!(e.group in GROUPS)) continue;
  const code = twemojiCode(e.hexcode);
  if (!existsSync(path.join(SVG, `${code}.svg`))) {
    skipped += 1;
    continue;
  }
  const tags = (e.tags ?? []).slice(0, 12);
  rows.push(
    `(${q('standard')}, ${q(code)}, ${q(e.emoji)}, ${q(e.label)}, ARRAY[${tags.map(q).join(', ')}]::text[], ${q(GROUPS[e.group])}, ${e.order ?? 0})`,
  );
}

const sql = `-- =============================================================================
-- 0013. 이모티콘 (R039 / D-187) — ★ 이 파일은 scripts/gen-emoji-migration.mjs 가 만든다
--
-- ★★ 이모티콘은 **번호(id)** 로 주고받는다 — 보내기 · 채팅 로그 · 참여자 칸 · 개인 10칸 저장 전부.
--   ★ 근거: "😂" 글자로 짜면 나중에 글자가 없는 캐릭터 그림(직접 등록)을 끼울 수 없다 (건우의 앞으로 계획).
-- ★ kind = 'standard' (표준 — 그림은 Twemoji SVG, 서버가 /emoji/<code>.svg 로 낸다)
--        | 'custom'   (직접 등록 — 그림을 **DB 에 저장**: image + mime. 프사와 같은 방식이라 백업에 함께 들어간다)
--   ★ 직접 등록 화면은 아직 없다 — docs/DB-ADMIN.md "이모티콘 직접 등록" 에 SQL 로 넣는 방법이 있다.
--   ★ 움직이는 그림(GIF · 움직이는 PNG/WebP)도 받을 수 있게 형식을 열어 둔다.
-- ★ category: smileys · people · animals · food · activities · travel · objects · symbols · flags · custom
-- =============================================================================

CREATE TABLE IF NOT EXISTS emojis (
  id         serial      PRIMARY KEY,
  kind       text        NOT NULL CHECK (kind IN ('standard', 'custom')),
  code       text        UNIQUE,
  char       text,
  name_ko    text        NOT NULL,
  tags       text[]      NOT NULL DEFAULT '{}',
  category   text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  image      bytea,
  mime       text        CHECK (mime IS NULL OR mime IN ('image/png', 'image/gif', 'image/webp', 'image/apng', 'image/svg+xml')),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'standard' AND code IS NOT NULL) OR (kind = 'custom' AND image IS NOT NULL AND mime IS NOT NULL)),
  CHECK (image IS NULL OR octet_length(image) <= 1048576)
);
CREATE INDEX IF NOT EXISTS emojis_category_idx ON emojis (category, sort_order);

INSERT INTO emojis (kind, code, char, name_ko, tags, category, sort_order) VALUES
${rows.join(',\n')}
ON CONFLICT (code) DO NOTHING;
`;
writeFileSync(path.join(ROOT, 'migrations', '0013_emojis.sql'), sql);
console.log(`[emoji] ${rows.length}개 (그림 없어 뺀 것 ${skipped}) → migrations/0013_emojis.sql`);
