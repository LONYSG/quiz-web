#!/usr/bin/env node
// G033 B — G032 pending 표본 163(V035 audit/v035-g032.json)을 고치고 활성(162) · drop 1 은 status rejected
//   입력 audit/g033-decisions.json 의 step 'B' 항목 · 되돌리기 audit/g033-undo-pending.json
//   사용 node scripts/g033-apply-pending.mjs [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs
import { cli } from './g033-apply-lib.mjs';
const a = process.argv; if (!a.includes('--step')) a.push('--step', 'B');
await cli('G033', 'g033-decisions.json', 'g033-undo-pending.json', 'G033 B — G032 pending 163 고침 + 활성 162 · rejected 1 — --undo 는 활성 되돌림(pending_review/false)과 글 · 변형을 옛 값으로');
