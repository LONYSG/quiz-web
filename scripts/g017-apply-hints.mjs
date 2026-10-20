#!/usr/bin/env node
// =============================================================================
// G017 B — 힌트 52 반영(V019 fix 41 · V018 새 힌트 fix 11 — CV-53 (c) · CV-56 (a) · CV-57)
//   node scripts/g017-apply-hints.mjs [--apply]   = node scripts/g017-apply-active1.mjs --part h [--apply]
//   결정은 data/pipeline/audit/g017-decisions.json 의 part h (general_hint 만 · 교체 / 채움 / 비움 — 처리 표는 G017.txt 0절)
// =============================================================================
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(here, 'g017-apply-active1.mjs'), '--part', 'h', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
