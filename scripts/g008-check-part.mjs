#!/usr/bin/env node
// G008 — 하위 에이전트 중간 파일 검사: node scripts/g008-check-part.mjs tmp/g008/out/<game>-<part>.json  (= g008-check --part)
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['scripts/g008-check.mjs', '--part', process.argv[2]], { stdio: 'inherit' });
process.exit(r.status ?? 1);
