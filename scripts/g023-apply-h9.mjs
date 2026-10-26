#!/usr/bin/env node
// =============================================================================
// G023 F — 힌트 H9 fix (15 §4-1 H9 — 정체·대표 일화를 바로 드러내는 힌트)
//   ★ 세 판정 파일의 h9 는 { fix · note } 뿐 — 고친 힌트 문장 칸(proposal · fixText)이 없다(G023 확인).
//     → 브리핑 F 대로 이번엔 "제안 없음 — 목록만": audit/g023-h9-pending.json(g023-plan 이 씀) · DB 쓰기 0 · 되돌리기 파일 없음
//   제안 칸이 생기면(다음 판정 라운드) 이 스크립트가 checkHint · H9 꼴 · 120자 검사 뒤 general_hint 를 바꾼다 — 지금은 셈만
//   사용  node scripts/g023-apply-h9.mjs [--dry-run | --apply | --undo]
// =============================================================================
import { loadPlan, readJson, MODE } from './g023-common.mjs';

const plan = loadPlan();
const flagged = Object.entries(plan.items).filter(([, it]) => it.h9);
const withProposal = flagged.filter(([, it]) => it.h9.some((h) => h.proposal));
const by = {}; for (const [, it] of flagged) for (const h of it.h9) by[h.from] = (by[h.from] ?? 0) + 1;
const pend = readJson('g023-h9-pending.json');
console.log(`[g023 F] H9 fix 표시 문항 ${flagged.length} (판정자 표시 ${JSON.stringify(by)}) · 고친 힌트 문장 제안 ${withProposal.length} · 목록 g023-h9-pending.json ${pend.n}`);
if (withProposal.length) { console.error('★ 제안 칸이 생겼다 — 이 스크립트에 적용 단계를 더한다'); process.exit(1); }
console.log(`[g023 F] 제안 없음 — 목록만 (${MODE} · 쓰기 0)`);
