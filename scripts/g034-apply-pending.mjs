#!/usr/bin/env node
// G034 B(+D) — G032 pending 나머지 484(V036 audit/v036-g032.json)를 고치고 활성 · 고친 것과 활성 전환을 한 결정(한 트랜잭션)으로 쓴다
//   (몸통 lib 은 pending 행 고침을 activate 와 함께일 때만 쓴다 — G033 B 와 같은 꼴 · 못 고친 문항은 activate 없이 → 건너뜀(pending 에 남음))
//   입력 audit/g034-decisions.json 의 step 'B' 항목 · 되돌리기 audit/g034-undo-pending.json
//   사용 node scripts/g034-apply-pending.mjs [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs(G033 그대로)
import { cli } from './g033-apply-lib.mjs';
const a = process.argv; if (!a.includes('--step')) a.push('--step', 'B');
await cli('G034', 'g034-decisions.json', 'g034-undo-pending.json', 'G034 B — G032 pending 484 고침 + 활성 — --undo 는 활성 되돌림(pending_review/false)과 글 · 변형을 옛 값으로');
