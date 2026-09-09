#!/usr/bin/env node
// =============================================================================
// 0003 마이그레이션 생성기 (R012 작업 C-3)
//
// ★★ 왜 SQL 을 손으로 쓰지 않고 생성하는가
//   카테고리 트리는 대 7 / 중 63 / 소 296 이다. 366행을 손으로 쓰면
//   ★ categories.ts 와 SQL 이 어긋나는 순간 아무도 알 수 없다.
//   트리를 정본으로 두고 SQL 을 만들어 낸다.
//
// ★ 건우가 카테고리를 조정하면 이 스크립트를 다시 돌려 0004 를 만든다.
//
// 사용법
//   node scripts/gen-migration-0003.mjs > migrations/0003_categories_tree.sql
// =============================================================================

import { MAJORS, MIDS } from '../pipeline/dist/categories.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const out = [];
const p = (s = '') => out.push(s);

p('-- =============================================================================');
p('-- 0003. 카테고리 계층 (R012 / 작업 C-3)');
p('--');
p('-- ★★ 이 파일은 scripts/gen-migration-0003.mjs 가 생성한다. 손으로 고치지 않는다.');
p('--   정본은 pipeline/src/categories.ts 다. 트리를 고치면 스크립트를 다시 돌린다.');
p('--');
p('-- ★★ 계층 설계 (R011 3-5 에서 판단하고 R012 에서 구현)');
p('--');
p('--   questions.category_id 가 가리킬 계층 = ★ 소분류(리프)');
p('--     근거: 가장 세밀한 것을 저장하면 어느 계층으로든 집계할 수 있다. 반대는 불가능하다.');
p('--');
p('--   통계 단위 (guide 40절) = ★ 기본 대분류, 상세 중분류');
p('--     근거: 소분류는 296개다. 한 사람이 소분류당 몇 문제를 못 풀어 정답률이 무의미해진다.');
p('--     대분류 7개면 "역사 72% / 과학 84%" 처럼 읽힌다.');
p('--');
p('--   게임 화면 표시 = ★ 대분류');
p('--     근거: 30초 안에 읽을 것은 짧아야 한다.');
p('--     ★ 그리고 소분류 이름이 힌트가 되는 경우가 있다 —');
p('--       소분류 "조선 전기" 가 보이면 답의 범위가 좁아진다.');
p('--');
p('-- ★ 기존 16개 플랫 카테고리를 지우지 않는다. 시드 문제 53건이 FK 로 참조한다.');
p('--   level=0 으로 표시해 새 트리와 구분한다.');
p('-- =============================================================================');
p('');
p('-- ── 1. 계층 컬럼');
p('ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id smallint REFERENCES categories(id);');
p('');
p('-- ★ level: 0=기존 플랫(R002) / 1=대분류 / 2=중분류 / 3=소분류');
p('--   ★ 0 을 남기는 이유는 위 주석에 있다. 시드 문제가 참조한다.');
p('ALTER TABLE categories ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 0;');
p('');
p('-- ★ 통계 집계에 쓴다. 소분류에서 대분류까지 올라가지 않고 바로 묶을 수 있다.');
p('CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories (parent_id);');
p('CREATE INDEX IF NOT EXISTS categories_level_idx ON categories (level);');
p('');
p('-- ★ 기존 행을 level=0 으로 명시한다 (DEFAULT 로 이미 0 이지만 의도를 남긴다)');
p("UPDATE categories SET level = 0 WHERE parent_id IS NULL AND level = 0;");
p('');
p('-- ── 2. 대분류 (level 1)');
p('--   ★ key 에 접두사를 붙인다. 기존 16개와 이름이 겹칠 수 있기 때문이다');
p("--   (기존 'science' 와 새 대분류 '자연과학' 은 다른 것이다).");
p('');

for (const mj of MAJORS) {
  p(
    `INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ` +
      `(${q('L1:' + mj.key)}, ${q(mj.nameKo)}, ${mj.sortOrder}, 1, NULL) ` +
      `ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;`,
  );
}

p('');
p('-- ── 3. 중분류 (level 2)');
p('');
let midOrder = 0;
for (const mj of MAJORS) {
  const mids = MIDS.filter((m) => m.major === mj.key);
  p(`-- ${mj.nameKo} (${mids.length}개)`);
  for (const m of mids) {
    midOrder += 10;
    p(
      `INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT ` +
        `${q('L2:' + m.key)}, ${q(m.nameKo)}, ${midOrder}, 2, id, ${m.enabled ? 'true' : 'false'} ` +
        `FROM categories WHERE key = ${q('L1:' + mj.key)} ` +
        `ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, ` +
        `sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;`,
    );
  }
  p('');
}

p('-- ── 4. 소분류 (level 3) — ★ questions.category_id 가 가리킬 계층');
p('');
let subOrder = 0;
for (const m of MIDS) {
  p(`-- ${m.nameKo} (${m.subs.length}개)`);
  for (const [i, sub] of m.subs.entries()) {
    subOrder += 10;
    // ★ key 를 midKey#index 로 만든다. 소분류 이름이 바뀌어도 통계가 깨지지 않는다.
    //   R002 주석의 "문자열로 박아두면 이름을 바꿀 때 과거 통계가 깨진다" 와 같은 이유다.
    p(
      `INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT ` +
        `${q(`L3:${m.key}#${i + 1}`)}, ${q(sub)}, ${subOrder}, 3, id, ${m.enabled ? 'true' : 'false'} ` +
        `FROM categories WHERE key = ${q('L2:' + m.key)} ` +
        `ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, ` +
        `sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;`,
    );
  }
  p('');
}

p('-- ── 5. ★ 통계용 뷰');
p('--   ★ 소분류 id 하나만 저장해도 어느 계층으로든 집계할 수 있게 한다.');
p('--   guide 40절이 요구하는 "카테고리별 성적" 이 이 뷰로 계산된다.');
p('CREATE OR REPLACE VIEW category_tree AS');
p('SELECT');
p('  leaf.id            AS category_id,');
p('  leaf.key           AS leaf_key,');
p('  leaf.name_ko       AS sub_name,');
p('  mid.id             AS mid_id,');
p('  mid.key            AS mid_key,');
p('  mid.name_ko        AS mid_name,');
p('  major.id           AS major_id,');
p('  major.key          AS major_key,');
p('  major.name_ko      AS major_name,');
p('  leaf.is_active     AS leaf_active');
p('FROM categories leaf');
p('JOIN categories mid   ON leaf.parent_id = mid.id');
p('JOIN categories major ON mid.parent_id = major.id');
p('WHERE leaf.level = 3;');
p('');
p('-- ★ 사용 예 (통계 단위는 대분류가 기본, 중분류가 상세다)');
p('--   SELECT t.major_name, count(*) FROM questions q');
p('--     JOIN category_tree t ON q.category_id = t.category_id');
p('--    WHERE q.status = \'approved\' AND q.is_active');
p('--    GROUP BY t.major_name ORDER BY t.major_name;');
p('');
p(`-- 생성 시각: ${new Date().toISOString()}`);
p(`-- 트리 규모: 대분류 ${MAJORS.length} / 중분류 ${MIDS.length} / 소분류 ${MIDS.reduce((n, m) => n + m.subs.length, 0)}`);

process.stdout.write(out.join('\n') + '\n');
