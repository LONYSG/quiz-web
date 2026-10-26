#!/usr/bin/env node
// =============================================================================
// G023 A — 계획표 audit/g023-plan.json (★ DB 읽기만 · 쓰기 전에 전부 계산)
//   입력  audit/v027-rerate.json · v028-rerate.json · g022-rerate.json (+ 고정 사본 v027-targets · v028-targets · g022-raw/targets)
//   합산  V027 984 = v027 값 · V028 2,870 = v028 값 · G022 2,653 = g022 값 · 겹침 200 = v028 값(CV-106 (a))
//         CV-107 — G022 7-1 "4 의견" 28 은 고른 값이 5 일 때 reread.v2(4)로 · 그 밖 reread 값은 쓰지 않는다
//   읽기  규칙 CV-99 (a) + CV-108 + 브리핑 C ①~⑦ — 판정 + 기계 검사(고정 사본 원문 · 지금 DB 문구 대조)
//   그 밖 사실 fix 6 · H9 · 분야 · 변형(안전한 종류만) · 제보 6 · 목록(I)
//   사용  node scripts/g023-plan.mjs   (언제 돌려도 같은 결과 — DB 의 지금 값이 바뀌면 그만큼만 달라진다)
// =============================================================================
import { connect, loadSources, writeJson, len } from './g023-common.mjs';
import { checkAnswerSet, classifyVariant } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, QUESTION_MAX } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const QLEN = QUESTION_MAX; // 15 §3-1 SYNC:QLEN — 200 (R068 이 240 을 권고해도 설계가 15 를 고치기 전엔 200)
const CV107 = [4739, 4788, 5076, 5272, 5274, 5279, 5287, 5434, 5550, 5599, 5601, 5624, 5626, 5881, 5991, 6042, 6085, 6126, 6294, 6421, 6432, 6506, 6515, 6727, 6748, 6816, 2810, 5734];
const REREAD_SKIP = [6366, 5551, 5915, 4734, 5132]; // G022 재독 의견 우선(reread.read reject/fix) — 적용 안 함
const READ_REVERT = { 6312: 'G023 표본 재독 — "미군 준장인 소장" 으로 뜻이 흐려짐(원문이 더 읽기 쉬움)' }; // C 적용 뒤 표본 60 에서 되돌린 것
const REPORTED = [3813, 1619, 2096, 1438, 500, 1941]; // D 에서 따로 — C 의 읽기 제안은 쓰지 않는다
const FACT = [
  { id: 3439, field: 'question_text', from: '약 7천 5백만 년 전', to: '약 6천 6백만 년 전', src: 'V027 7절 · 영어 위키 Coelacanth' },
  { id: 1334, field: 'general_hint', from: '공사에 8년이 걸렸고', to: '공사에 5~6년이 걸렸고', src: 'V027 7절 · 영어 위키 Grand Canal 604~609' },
  { id: 4197, field: 'question_text', from: "'국민 ○○'이라는 별명", to: "'○○ 승기'라는 별명", src: "V027 7절 · v027 fact note '허당 승기' · 국민 허당 근거 없음" },
  { id: 5806, field: 'question_text', from: '1999년 6월 18일', to: '1999년 6월 19일', src: 'V028 7절 · developer.valvesoftware.com' },
  { id: 6414, field: 'general_hint', from: '넷째 총장', to: '셋째 총장', src: 'G022 6절 · 영어 위키 List of presidents of Harvard' },
  { id: 4457, field: 'general_hint', from: '제주도 다음으로 큰 섬', to: '제주의 부속 섬 가운데 가장 큰 섬', src: 'V028 7절(부분)' },
];

// ---------------------------------------------------------------------------
const sq = (s) => String(s ?? '').replace(/[\s·\-]/g, '').toLowerCase();
const nums = (s) => String(s ?? '').match(/\d+/g) ?? [];
const ASKS = (p) => /[?？]\s*$/.test(p.trim()) || /(은|는|인가요|일까요|입니까|합니까|무엇인가요)\??$/.test(p.trim());
const eqT = (a, b) => String(a ?? '').normalize('NFC').trim() === String(b ?? '').normalize('NFC').trim();

// 숫자 읽기 — 한자어(사십이) · 숫자 하나씩(오일팔) · 고유어(일곱 · 스물네)
const SINO = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
function sino(n) {
  if (n === 0) return '영';
  let s = ''; const u = [['천', 1000], ['백', 100], ['십', 10]];
  for (const [w, v] of u) { const d = Math.floor(n / v) % 10; if (d) s += (d === 1 ? '' : SINO[d]) + w; }
  if (n >= 10000) return null;
  return s + (n % 10 ? SINO[n % 10] : '');
}
const NAT1 = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NAT1A = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NAT10 = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
function readings(digits) {
  const n = Number(digits); const out = new Set();
  const s = sino(n); if (s) out.add(s);
  out.add([...digits].map((d) => SINO[+d]).join(''));
  if (n > 0 && n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    out.add(NAT10[t] + NAT1[o]); out.add((t === 2 && o === 0 ? '스무' : NAT10[t]) + NAT1A[o]);
  }
  return [...out].filter(Boolean);
}
const PUNCT = /[\s·.\-()（）]/g;
const COUNTERS = ['개', '명', '번', '회', '홀', '장', '가지', '살', '마리', '권', '층', '점', '세트'];
const SUFFIX = ['신', '씨', '님', '섬', '꽃'];
const JOSA = ['이', '가', '은', '는', '을', '를'];
const OKCHARS = /^[\p{L}\p{N} ·.\-&']+$/u;

/** 변형 한 개의 종류(안전한 것만 이름이 붙는다 · 나머지 other) */
function variantKind(ans, v) {
  const A = ans.normalize('NFC'), V = v.normalize('NFC');
  const pa = A.replace(PUNCT, '').toLowerCase(), pv = V.replace(PUNCT, '').toLowerCase();
  if (pa === pv) return 'punct'; // 띄어쓰기·중점·하이픈·괄호 차이
  // 숫자 표기 — 숫자 덩어리를 읽기로 바꿔 같아지는가(양쪽 어느 쪽이 숫자여도)
  const numMatch = (X, Y) => {
    const runs = X.match(/\d+/g); if (!runs || /\d/.test(Y)) return false;
    let forms = [X];
    for (const r of runs) { const next = []; for (const f of forms) for (const rd of readings(r)) next.push(f.replace(r, rd)); forms = next.slice(0, 200); }
    const y = Y.replace(PUNCT, '');
    return forms.some((f) => { const g = f.replace(PUNCT, ''); return g === y || COUNTERS.some((c) => g + c === y); });
  };
  if (numMatch(A, V) || numMatch(V, A)) return 'number';
  if (/^\d+$/.test(A) && COUNTERS.some((c) => pv === A + c)) return 'counter';
  // 영문 원어 ↔ 한글 표기 — ★ GEN 판단(후보 581 을 읽어 보니 번역 · 조각 · 다른 대상이 섞임): 자동은 두 꼴만
  //   latin = 영문 대문자 약어(2자+ · 대문자·숫자만) · hangul-of-latin = 대문자 약어를 글자 이름으로 읽은 것(DNS → 디엔에스)
  if (/[가-힣]/.test(A) && /^[A-Z0-9][A-Z0-9 .\-&]*$/.test(V) && (V.match(/[A-Z]/g) ?? []).length >= 2) return 'latin';
  if (/[A-Za-z]/.test(A) && !/[A-Za-z]/.test(V) && /[가-힣]/.test(V) && spelled(A, V)) return 'hangul-of-latin';
  // 접미 유무(신 · 씨 · 님 · 섬 · 꽃) — 분야가 맞을 때만(부른 쪽이 확인 · 조사는 넣지 않는다)
  for (const x of SUFFIX) {
    if (pv === pa + x && pa.length >= 2) return `suffix:${x}`;
    if (pa === pv + x && pv.length >= 2) return `suffix:${x}`;
  }
  if (JOSA.some((x) => pv === pa + x)) return 'other';
  return 'other';
}
// 대문자 약어를 한글 글자 이름으로 — 나머지(한글 · 숫자)는 그대로이거나 숫자 읽기
const LETTER = { A: ['에이'], B: ['비'], C: ['씨', '시'], D: ['디'], E: ['이'], F: ['에프'], G: ['지', '쥐'], H: ['에이치', '에치'], I: ['아이'], J: ['제이'], K: ['케이'], L: ['엘'], M: ['엠'], N: ['엔'], O: ['오'], P: ['피'], Q: ['큐'], R: ['알'], S: ['에스'], T: ['티'], U: ['유'], V: ['브이', '비'], W: ['더블유', '더블류'], X: ['엑스'], Y: ['와이'], Z: ['제트', '지'] };
const EN = ['제로', '원', '투', '쓰리', '포', '파이브', '식스', '세븐', '에잇', '나인'];
function spelled(A, V) {
  const a = A.replace(PUNCT, ''); if (/[a-z]/.test(a)) return false; // 소문자 낱말(Tears · pH)은 읽기가 아니다
  let forms = [''];
  for (const ch of a) {
    let opts;
    if (LETTER[ch]) opts = LETTER[ch];
    else if (/\d/.test(ch)) opts = [ch, SINO[+ch], EN[+ch]];
    else opts = [ch];
    const next = []; for (const f of forms) for (const o of opts) next.push(f + o); forms = next.slice(0, 500);
  }
  const v = V.replace(PUNCT, '');
  return forms.includes(v);
}
// GEN 이 자동 후보 382 를 다 읽고 뺀 것(다른 대상 · 더 넓은 말)
const GEN_NO = { 6331: ['EXO-K'], 4278: ['MBC'], 3662: ['JSA'], 886: ['MFA'] };
const SUFFIX_CAT = { 신: /신화|종교/, 섬: /지리|섬|여행|관광|한국 지역/, 꽃: /식물|꽃/, 씨: /./, 님: /./ };

// ---------------------------------------------------------------------------
const { S, T } = loadSources();
const c = await connect();
const { rows: Q } = await c.query(`select q.id, q.is_active, q.question_text, q.display_answer, q.general_hint, q.general_hint_version, q.explanation,
    q.category_id, q.difficulty_score, q.difficulty, q.difficulty_why, cat.key cat_key, cat.name_ko cat_name, cat.level cat_level, concat_ws(' > ', c1.name_ko, c2.name_ko, cat.name_ko) cat_path,
    coalesce((select json_agg(a.answer_text order by a.id) from question_answers a where a.question_id=q.id and not a.is_primary),'[]') variants
    from questions q left join categories cat on cat.id=q.category_id left join categories c2 on c2.id=cat.parent_id left join categories c1 on c1.id=c2.parent_id where q.is_active`);
const DB = new Map(Q.map((r) => [String(r.id), r]));
const { rows: CATS } = await c.query(`select c3.id, c3.key, c3.name_ko, c2.name_ko p2, c1.name_ko p1 from categories c3
    left join categories c2 on c2.id=c3.parent_id left join categories c1 on c1.id=c2.parent_id where c3.level=3 and c3.is_active`);
const { rows: PRIM } = await c.query('select a.question_id, a.answer_norm from question_answers a join questions q on q.id=a.question_id where q.is_active and a.is_primary');
await c.end();
const primByNorm = new Map(); for (const r of PRIM) { const k = r.answer_norm; if (!primByNorm.has(k)) primByNorm.set(k, []); primByNorm.get(k).push(String(r.question_id)); }

const ids = [...new Set([...Object.keys(S.V027.items), ...Object.keys(S.V028.items), ...Object.keys(S.G022.items)])].sort((a, b) => a - b);
const items = {}; const problems = [];
const dist = { cur: {}, v2: {} }; const move = {};
const readRows = []; const readSkipped = []; const catPending = []; const varPending = []; const h9Pending = [];

for (const id of ids) {
  const db = DB.get(id); if (!db) { problems.push(`${id}: 활성 아님/없음`); continue; }
  const v7 = S.V027.items[id], v8 = S.V028.items[id], g2 = S.G022.items[id];
  const it = {};
  // ── v2 ──
  let v2, src;
  if (v7) { v2 = v7.v2; src = 'V027'; } else if (v8) { v2 = v8.v2; src = 'V028'; } else { v2 = g2.v2; src = 'G022'; }
  it.cur = db.difficulty_score; it.src = src; it.overlapRule = !!(v8 && g2);
  if (CV107.includes(+id)) {
    const r = g2?.reread?.v2;
    if (r !== 4) problems.push(`${id}: CV-107 reread.v2 = ${r}`);
    if (v2 === 5) { v2 = r ?? 4; it.cv107 = '5→4'; } else it.cv107 = `이미 ${v2}(${src})`;
  }
  it.v2 = v2; it.why = (src === 'V027' ? v7 : src === 'V028' ? v8 : g2).why;
  if (it.cv107 === '5→4') it.why = `4 — CV-107 G022 재독(R5 ㉡ 이름은 널리 알려짐 · 단서만 전문 세부) · 판정자 ${it.why}`;
  if (![1, 2, 3, 4, 5].includes(v2)) problems.push(`${id}: v2 ${v2}`);
  dist.cur[db.difficulty_score] = (dist.cur[db.difficulty_score] ?? 0) + 1; dist.v2[v2] = (dist.v2[v2] ?? 0) + 1;
  move[`${db.difficulty_score}>${v2}`] = (move[`${db.difficulty_score}>${v2}`] ?? 0) + 1;

  // ── 읽기 ──
  const cands = [['V027', v7], ['V028', v8], ['G022', g2]].filter(([, x]) => x?.flags?.read?.proposal);
  const tries = [];
  for (const [s, x] of cands) {
    const r = x.flags.read; const rv = r.review ?? {}; const snap = T[s][id];
    const easier = rv.easier ?? rv.better ?? null;
    let action = 'skip', text = null, reason = null;
    if (+id === 1619 && s === 'V027') reason = '⑤ 1619 V027 제안 안 씀(D 에서 따로)';
    else if (REPORTED.includes(+id)) reason = '제보 문항 — D 에서 따로';
    else if (READ_REVERT[id]) reason = READ_REVERT[id];
    else if (s === 'G022' && REREAD_SKIP.includes(+id)) reason = `④ G022 재독 우선(reread.read ${g2.reread?.read})`;
    else if (rv.verdict === 'ok') {
      if (rv.leak || rv.factChange) reason = `① ok 이지만 leak ${rv.leak} · factChange ${rv.factChange}`;
      else if (easier !== 'yes') reason = `③ ok · 더 읽기 쉬움 ${easier}`;
      else { action = 'apply'; text = r.proposal; }
    } else if (rv.verdict === 'fix') {
      if (easier === 'no') reason = '③ fix · 더 읽기 쉬움 no';
      else if (!rv.fixText) reason = '② fix 인데 fixText 없음';
      else { action = 'fixText'; text = rv.fixText; }
    } else if (rv.verdict === 'reject') reason = '③ reject';
    else reason = `검토 없음(${rv.verdict})`;
    // ⑦ 기계 검사 — 원문 = 고정 사본(판정 때 본 문구) · 지금 DB 문구와 같아야 한다
    if (text) {
      const orig = snap?.question; const nt = text.trim();
      const forms = [db.display_answer, ...db.variants, ...(snap?.variants ?? [])].filter((f) => len(f) >= 2);
      const leak = forms.filter((f) => sq(nt).includes(sq(f)) && !sq(orig).includes(sq(f)));
      const added = nums(nt).filter((n) => !nums(orig).includes(n));
      const g = checkAnswerSet(nt, db.display_answer, db.variants, normalizeAnswer);
      const g0 = checkAnswerSet(orig, db.display_answer, db.variants, normalizeAnswer);
      const newBlocked = g.blocked.filter((b) => !g0.blocked.some((x) => x.answer === b.answer));
      if (!orig) reason = '고정 사본 없음';
      else if (!eqT(orig, db.question_text) && !eqT(nt, db.question_text)) reason = '판정 뒤 지금 문구가 바뀜(고정 사본 ≠ DB)';
      else if (eqT(nt, orig)) reason = '⑦ 원문과 같음';
      else if (len(nt) > QLEN) reason = `⑥ ${len(nt)}자 > QLEN ${QLEN}`;
      else if (leak.length) reason = `⑦ 정답·변형 글자 새로 등장(${leak.join('/')})`;
      else if (newBlocked.length) reason = `⑦ 정답이 낱말로 새로 들어감(${newBlocked.map((b) => b.answer).join('/')})`;
      else if (!ASKS(nt)) reason = '⑦ 끝이 묻는 문장 아님';
      else if (added.length) reason = `⑦ 새 숫자(${added.join(',')})`;
      else if (!blankCheck(nt, db.display_answer).ok) reason = '⑦ 빈칸 수';
      if (reason) { action = 'skip'; text = null; }
    }
    tries.push({ from: s, grade: r.grade, verdict: rv.verdict ?? null, easier, action, ...(text ? { text: text.trim() } : {}), ...(reason ? { reason } : {}) });
  }
  if (tries.length) {
    // 겹침: VERIFY(V028) 제안을 먼저 · 못 쓰면 G022 제안
    const pick = tries.find((t) => t.from === 'V028' && t.action !== 'skip') ?? tries.find((t) => t.action !== 'skip');
    it.read = pick ? { ...pick, before: T[pick.from][id].question, ...(tries.length > 1 ? { others: tries.filter((t) => t !== pick).map(({ from, action, reason }) => ({ from, action, reason })) } : {}) }
      : { action: 'skip', tries: tries.map(({ from, grade, verdict, easier, reason }) => ({ from, grade, verdict, easier, reason })) };
    if (pick) readRows.push(+id); else readSkipped.push({ id: +id, answer: db.display_answer, tries: it.read.tries });
  }

  // ── H9 ──
  const h9 = [['V027', v7], ['V028', v8], ['G022', g2]].filter(([, x]) => x?.h9?.fix).map(([s, x]) => ({ from: s, note: x.h9.note, ...(x.h9.proposal || x.h9.fixText ? { proposal: x.h9.proposal ?? x.h9.fixText } : {}) }));
  if (h9.length) { it.h9 = h9; h9Pending.push({ id: +id, answer: db.display_answer, hint: db.general_hint, notes: h9 }); }

  // ── 분야 ──
  const cs = [['V027', v7], ['V028', v8], ['G022', g2]].filter(([, x]) => x?.flags?.category && x.flags.category.ok === false && x.flags.category.suggest);
  if (cs.length && +id !== 3813) {
    const tried = cs.map(([s, x]) => {
      const sug = x.flags.category.suggest;
      const segs = sug.split('>').map((t) => t.replace(/\([^)]*\)/g, '').trim()).filter(Boolean);
      let hit = CATS.filter((k) => sug.includes(k.key));
      if (!hit.length) { const last = segs.at(-1); hit = CATS.filter((k) => k.name_ko === last); if (hit.length > 1 && segs.length >= 2) hit = hit.filter((k) => k.p2 === segs.at(-2)); }
      return { from: s, suggest: sug, to: hit.length === 1 ? { id: hit[0].id, key: hit[0].key, name: `${hit[0].p1} > ${hit[0].p2} > ${hit[0].name_ko}` } : null, n: hit.length };
    });
    const ok = tried.filter((t) => t.to);
    const tos = [...new Set(ok.map((t) => t.to.id))];
    const now = { id: db.category_id, key: db.cat_key, name: db.cat_name, level: db.cat_level };
    if (tos.length === 1 && tos[0] !== db.category_id) it.category = { action: 'apply', before: now, to: ok[0].to, from: ok.map((t) => t.from), tried };
    else {
      const why = tos.length > 1 ? '판정자끼리 다른 분야' : tos.length === 1 ? '이미 그 분야' : '제안이 L3 이름·key 와 정확히 맞지 않음';
      it.category = { action: 'skip', reason: why, before: now, tried };
      if (tos.length !== 1 || tos[0] !== db.category_id) catPending.push({ id: +id, answer: db.display_answer, now, reason: why, tried });
    }
  }

  // ── 변형 ──
  const raw = [];
  for (const [s, x] of [['V027', v7], ['V028', v8], ['G022', g2]]) {
    if (!x) continue;
    for (const v of x.flags.variants ?? []) raw.push({ v, from: s, via: 'variants' });
    if (x.flags.inputForm?.flag) for (const m of String(x.flags.inputForm.note ?? '').matchAll(/['‘’"“”]([^'‘’"“”]{1,30})['‘’"“”]/g)) raw.push({ v: m[1], from: s, via: 'inputForm' });
  }
  if (raw.length) {
    const have = new Set([normalizeAnswer(db.display_answer), ...db.variants.map(normalizeAnswer)]);
    const seen = new Set(); const take = []; const pend = []; let redundant = 0;
    for (const r of raw) {
      const v = String(r.v).normalize('NFC').trim().replace(/\s+/g, ' ');
      const nv = normalizeAnswer(v);
      if (!v || seen.has(nv)) continue; seen.add(nv);
      if (have.has(nv)) { redundant++; continue; }
      const p = (why, kind) => pend.push({ v, kind, from: r.from, via: r.via, why });
      if (!OKCHARS.test(v)) { p('특수문자(15 A5)', 'chars'); continue; }
      const kind = variantKind(db.display_answer, v);
      if (kind === 'other') { p('안전한 종류 밖 — 판정 라운드 재료', kind); continue; }
      if (GEN_NO[id]?.includes(v)) { p('GEN 재독 — 다른 대상·더 넓은 말', kind); continue; }
      if (kind.startsWith('suffix:') && !SUFFIX_CAT[kind.slice(7)].test(db.cat_path ?? '')) { p(`접미 '${kind.slice(7)}' 인데 분야가 안 맞음(${db.cat_path})`, kind); continue; }
      if (kind === 'punct' && (/^[-.]|[-.]$/.test(v) && !/^[-.]|[-.]$/.test(db.display_answer))) { p('앞뒤 기호만 붙음', kind); continue; }
      if ((kind === 'latin' || kind === 'hangul-of-latin') && /우리말|한국어|한글로|영문|영어|약자|약칭|줄임말/.test(db.question_text)) { p('질문이 표기를 정함(15 B2)', kind); continue; }
      const others = (primByNorm.get(nv) ?? []).filter((q) => q !== id);
      if (others.length) { p(`다른 문항 주 답과 같음(${others.join(',')})`, kind); continue; }
      if (normalizeAnswer(v).length < 2 && !/^\d+$/.test(v)) { p('한 글자', kind); continue; }
      take.push({ v, kind, from: r.from, via: r.via });
    }
    // 적재 게이트(15 B4 · B6 · B8 · B9 의 기계 몫) — 지금 질문 · 기존 변형과 함께 · 걸린 것은 대기로
    const g = checkAnswerSet(db.question_text, db.display_answer, [...db.variants, ...take.map((t) => t.v)], normalizeAnswer);
    for (const t of [...take]) {
      const d = g.dropped.find((x) => x.answer === t.v); const b = g.blocked.find((x) => x.answer === t.v);
      if (d || b) { take.splice(take.indexOf(t), 1); pend.push({ ...t, why: b ? '게이트 — 질문에 낱말로 있음(15 B9)' : `게이트 ${d.kind} — ${d.why}` }); }
    }
    // 한 문항 상한(15 에 수 상한이 없다 — GEN 판단: 이번 자동 추가 ≤ 3 · 비대표 합 ≤ 7 = 지금 DB 최대)
    while (take.length > Math.min(3, 7 - db.variants.length)) { const t = take.pop(); pend.push({ ...t, why: '한 문항 상한(자동 3 · 합 7)' }); }
    if (take.length || pend.length) it.variants = { take, pend, redundant };
    for (const x of pend) varPending.push({ id: +id, answer: db.display_answer, ...x });
  }

  // ── 그 밖 표시(목록 I) ──
  const flag = (k) => [['V027', v7], ['V028', v8], ['G022', g2]].filter(([, x]) => x?.flags?.[k]?.flag).map(([s, x]) => ({ from: s, note: x.flags[k].note ?? null, ...(x.flags[k].web ? { web: x.flags[k].web } : {}) }));
  const un = flag('unique'); if (un.length) it.unique = un;
  const se = flag('sensitive'); if (se.length) it.sensitive = se;
  const fa = flag('fact'); if (fa.length) it.factFlag = fa;
  const tb = [['V027', v7], ['V028', v8], ['G022', g2]].filter(([, x]) => x?.flags?.timeBound).map(([s, x]) => ({ from: s, v: x.flags.timeBound }));
  if (tb.length) it.timeBound = tb;
  const fam = (v7 ?? v8 ?? g2).familiarity; if (fam) it.familiarity = fam;
  if (v8 && g2) it.familiarityGen = g2.familiarity ?? null;
  it.hintless3 = v2 >= 3 && !db.general_hint;
  items[id] = it;
}

// 사실 fix 6 — 지금 문구에 바꿀 글귀가 있는지(C 가 질문을 바꾸면 C 뒤 문구에서 다시 본다)
const fact = FACT.map((f) => {
  const db = DB.get(String(f.id)); const cur = db?.[f.field] ?? null;
  const afterC = f.field === 'question_text' && items[f.id]?.read?.text ? items[f.id].read.text : cur;
  return { ...f, answer: db?.display_answer, current: cur, inCurrent: !!cur?.includes(f.from), inAfterC: !!afterC?.includes(f.from) };
});
for (const f of fact) { items[f.id].fact = { field: f.field, from: f.from, to: f.to }; if (!f.inAfterC) problems.push(`${f.id}: 사실 fix 글귀 "${f.from}" 가 C 뒤 문구에 없음`); }

// 제보 6
const REP = S.V028.meta.reported;
for (const id of REPORTED) items[id].reported = { verdict: REP[id]?.verdict ?? null, suggest: REP[id]?.suggest ?? null, src: REP[id]?.src ?? null };

// ── 요약 ──
const cnt = (f) => Object.values(items).filter(f).length;
const readBy = {}; for (const id of readRows) { const r = items[id].read; const k = `${r.from} ${r.grade} ${r.action}`; readBy[k] = (readBy[k] ?? 0) + 1; }
const skipBy = {}; for (const s of readSkipped) for (const t of s.tries) { const k = `${t.from} ${t.reason?.replace(/\(.*$/, '').replace(/\d+자 > QLEN \d+/, '길이 > QLEN')}`; skipBy[k] = (skipBy[k] ?? 0) + 1; }
const varBy = {}; for (const it of Object.values(items)) for (const x of it.variants?.take ?? []) varBy[x.kind] = (varBy[x.kind] ?? 0) + 1;
const varPendBy = {}; for (const x of varPending) varPendBy[x.why.replace(/\(.*$/, '')] = (varPendBy[x.why.replace(/\(.*$/, '')] ?? 0) + 1;
const summary = {
  total: ids.length, active: DB.size, dist, expect: { 1: 572, 2: 1706, 3: 2561, 4: 1373, 5: 295 },
  cv107: { moved: cnt((x) => x.cv107 === '5→4'), already: Object.entries(items).filter(([, x]) => x.cv107 && x.cv107 !== '5→4').map(([i, x]) => `${i} ${x.cv107}`) },
  pools: { low: (dist.v2[1] ?? 0) + (dist.v2[2] ?? 0), mid: dist.v2[3] ?? 0, high: (dist.v2[4] ?? 0) + (dist.v2[5] ?? 0) },
  changedScore: Object.values(items).filter((x) => x.v2 !== x.cur).length, move,
  hintless3: cnt((x) => x.hintless3),
  read: { candidates: Object.values(items).filter((x) => x.read).length, apply: readRows.length, by: readBy, skippedItems: readSkipped.length, skipBy },
  h9: { flagged: h9Pending.length, withProposal: h9Pending.filter((h) => h.notes.some((n) => n.proposal)).length },
  category: { apply: cnt((x) => x.category?.action === 'apply'), pending: catPending.length },
  variants: { items: cnt((x) => x.variants?.take?.length), rows: Object.values(varBy).reduce((a, b) => a + b, 0), by: varBy, pending: varPending.length, pendBy: varPendBy },
  fact, problems,
};
writeJson('g023-plan.json', { round: 'G023', builtAt: new Date().toISOString(), qlen: QLEN, note: 'G023 계획표 — items[id]: v2 · why · src · overlapRule · cv107 · cur · read{action apply/fixText/skip · from · text · reason · before} · h9[] · category · variants{take · pend} · fact · reported · unique · sensitive · factFlag · timeBound · familiarity · hintless3', summary, items });
writeJson('g023-text-skipped.json', { round: 'G023', note: '읽기 고친 문장 중 적용하지 않은 문항(계획 단계) — tries[].reason', n: readSkipped.length, items: readSkipped });
writeJson('g023-h9-pending.json', { round: 'G023', note: 'H9 fix 표시 — 세 판정 파일 h9 에 고친 힌트 문장 칸이 없다(fix · note 만) → 이번엔 목록만 · 힌트 다시 쓰기 라운드 재료', n: h9Pending.length, items: h9Pending });
writeJson('g023-category-pending.json', { round: 'G023', note: '분야 오분류 표시 중 적용하지 않은 것 — 제안이 L3 name_ko/key 와 정확히 맞지 않거나 판정자끼리 다름', n: catPending.length, items: catPending });
writeJson('g023-variants-pending.json', { round: 'G023', note: '변형 제안 중 자동으로 넣지 않은 것(안전한 종류 밖 · 다른 문항 주 답 · 특수문자 · 한 글자) — 판정 라운드 재료', n: varPending.length, items: varPending });
console.log(JSON.stringify(summary, null, 1));
