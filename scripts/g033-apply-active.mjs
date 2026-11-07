#!/usr/bin/env node
// G033 C · D · F — 활성 문항 고침(V034 CV-142~145 · V035 CV-149~151 · 제보 #112 · #114) / E — 표기 지정 문구(--notation)
//   입력 audit/g033-decisions.json(step C · D · F) 또는 audit/g033-notation.json(step E) · 되돌리기 audit/g033-undo-active.json · g033-undo-notation.json
//   사용 node scripts/g033-apply-active.mjs [--step C|D|F[,..]] [--notation] [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs
import { cli } from './g033-apply-lib.mjs';
const a = process.argv; const nt = a.includes('--notation');
if (!a.includes('--step')) a.push('--step', nt ? 'E' : 'C,D,F');
await cli('G033', nt ? 'g033-notation.json' : 'g033-decisions.json', nt ? 'g033-undo-notation.json' : 'g033-undo-active.json',
  nt ? 'G033 E — 표기 지정 괄호 문구 삭제 + 같은 이름 다른 표기 변형 — --undo' : 'G033 C·D·F — 활성 고침 — --undo');
