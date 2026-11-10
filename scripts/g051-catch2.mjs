#!/usr/bin/env node
// =============================================================================
// G051 C — 캐치마인드 2차 합치기(찬종 2026-11-10 "일단 전부 넣고 태그 정보만 가지고 있어") — 파일만 · DB 쓰기 없음
//   입력: web-desk/catch2/_merged.json(웹 Sonnet 5.5 · 21 조각 · keep 4,621 · 18 §12 캐치 단어 기준 개정)
//   넣는 것 = keep 전부 − ① 실존 연예인·선수·방송인 중 2026 20~40대가 세대 불문 아는 사람이 아닌 이 (CELEB_KEEP 밖 · CELEB 목록) −
//            ② GEN 재독: 논란 · 비속(GEN_DROP) − ③ 기존 캐치 항목과 같은 말(name·변형 정규화 같음 — 자동)
//   같은 새 항목끼리 같은 말(앞 항목의 변형과 같음)은 합침 · 웹 "같은말:<기존>" 87 → 그 항목의 변형(유일성 통과만 · 기존 1,639 에는 변형 더하기만)
//   항목 칸: id · name · variants(웹 var — 다른 항목과 겹치면 뺌 · VAR_DROP) · tags [] · diff · g(1 밋밋 · 2 무난 · 3 재미 — 새 칸) · draw · liar · qid
//   ★ 세트 status 가 candidate 면 topics-load 가 세트를 통째로 빼고 기존 항목을 쉬게 한다 → 기존 10 테마의 새 항목은 별도 파일 draw-<테마>-2(같은 nameKo · candidate)
//   draw-etc 1,515 → 새 세트 4(draw-title 제목 · draw-world 나라·도시 · draw-body 몸·건강 · draw-concept 개념·상태) + 가수 그룹 · 예능인 → 인물
//   산출: topics/draw-*-2.json · draw-title · draw-world · draw-body · draw-concept · 기존 draw-* 변형 더하기 · audit/g051-catch2.json · audit/g051-celeb-drop.json
// 사용: node scripts/g051-catch2.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const C = (s) => flexCanon(String(s ?? ''));
const W = (s) => s.split(/\s+/).filter(Boolean);
const merged = JSON.parse(readFileSync(path.join(ROOT, 'web-desk/catch2/_merged.json'), 'utf8'));

// ── ① 실존 연예인 · 선수 · 방송인(인물 세트 + etc 에서 옮긴 그룹) ─────────────────
const CELEB = W(`최지우 아이유 데미무어 인순이 강동원 강호동 호나우도 이문세 박미선 웨인루니 성시경 신해철 최불암 은지원 소녀시대 박주영 문근영 하정우 장나라 전지현
 손연재 윤계상 김영철 조혜련 안정환 최강희 다니엘헤니 젝스키스 펠레 설운도 김영만 신하균 차두리 원더걸스 윤은혜 샤이니 서인영 최민식 배두나 에스이에스 차승원 조수미
 한가인 김종국 하리수 차범근 이경규 안성기 송승헌 권상우 신민아 박진영 이종석 박찬호 호나우두 정형돈 박명수 김신영 정준하 김명민 한석규 설경구 이루마 이동국 슈퍼주니어
 이영표 엠마왓슨 유승호 심은하 김국진 류승룡 컬투 에픽하이 김상중 문희준 이민정 최수종 조인성 황정민 유상철 지단 박보영 고소영 김보성 핑클 허재 조승우 성룡 조여정
 송일국 메시 톰행크스 빌게이츠 이효리 박준형 김혜수 김수미 유지태 김연경 신동엽 원빈 싸이 신현준 서장훈 황영조 김장훈 홍명보 유해진 김광석 송대관 조용필 나훈아 장미란
 현빈 박신양 이순재 유세윤 손흥민 이봉주 손예진 하지원 공효진 추신수 이동건 유동근 유호정 김준호 이정재 이미숙 이승철 엄정화 박민영 김대희 신애라 신승훈 김희선 이민호
 황선홍 강원래 박지성 브래드피트 고현정 김태희 이선희 박세리 최진실 구준엽 샤라포바 김광현 장동민 소유진 히딩크 유재석 서태지 문소리 장동건 선동렬 이나영 소지섭 동방신기
 이서진 김연아 오드리헵번 한효주 기성용 이대호 이승엽 송해 송중기 마라도나 태진아 윤도현 우사인볼트 이운재 이민기 이영애 송강호 전도연 윤종신 김하늘 허정무 윤상현 차태현
 스티븐시걸 김래원 앤헤서웨이 김병만 송혜교 타이거우즈 지오디 에이치오티 클론 자우림 비스트 에프엑스 하하`);
/** 2026 년 20~40대가 세대 불문 아는 사람(강호동 · 유재석 · 원빈 · 아이유 · 박지성급) — GEN 판단 */
const CELEB_KEEP = new Set(W(`아이유 강동원 강호동 성시경 소녀시대 하정우 전지현 김종국 박진영 정형돈 박명수 정준하 유재석 신동엽 원빈 싸이 서장훈 손흥민 박지성 김연아 이효리
 송중기 송강호 현빈 손예진 공효진 이정재 이민호 김태희 송혜교 장동건 유해진 황정민 조인성 최민식 류승룡 이순재 김혜수 이영애 차승원 이서진 박보영 한효주 유승호 이종석 신민아
 박민영 고현정 김희선 소지섭 차태현 전도연 설경구 한석규 김상중 하지원 엄정화 윤종신 이선희 이승철 조용필 나훈아 서태지 동방신기 슈퍼주니어 샤이니 원더걸스 핑클 젝스키스
 지오디 에이치오티 김연경 장미란 박세리 박찬호 이승엽 이대호 추신수 기성용 안정환 차범근 홍명보 이영표 이동국 히딩크 김국진 김병만 김준호 김신영 박미선 조혜련 김영철 송해 김수미
 하하 메시 우사인볼트 엠마왓슨 브래드피트 빌게이츠 성룡 톰행크스 펠레 지단 타이거우즈 오드리헵번`));
// ── ② GEN 재독 — 논란 · 비속(낯섦 · 그리기 어려움 · 밋밋함으로는 빼지 않음) ─────────
const GEN_DROP = { 꽃뱀: '비속(여성 비하)', 듣보잡: '비속(잡놈)', 식인종: '혐오 표현', 맹인: '차별어(시각장애인)', 동성연애: '논란(성소수자 비하로 쓰이는 옛말)', 정신분열증: '차별어(현행 조현병)' };
/** 웹 var 중 상위어·다른 뜻(표본 확인) */
const VAR_DROP = { 핵폭탄: ['핵폭발'], 신분증: ['주민등록증'] };
// ── etc 나누기 ──────────────────────────────────────────────────────────────
const TO_CHAR = new Set(W('지오디 에이치오티 클론 자우림 비스트 에프엑스 하하'));
const TITLE = new Set(W(`여인의향기 꽃보다남자 공부의신 달마야놀자 투캅스 마법의성 클레멘타인 봄날은간다 해피엔드 식스센스 하여가 서편제 에덴의동쪽 화려한휴가 노팅힐 아이리스 여고시절
 야인시대 나는가수다 나홀로집에 반지의제왕 살인의추억 라이온킹 실미도 공공의적 쉬리 과속스캔들 조폭마누라 태조왕건 전원일기 트로이 올드보이 트와일라잇 인셉션 공주의남자 아마게돈
 오만과편견 맘마미아 장화홍련 주홍글씨 천일의약속 정글북 쇼생크탈출 개그콘서트 아바타 말아톤 인어아가씨 여름향기 너는내운명 아마데우스 청춘의덫 시크릿가든 원령공주 서동요 올인
 국화꽃향기 여고괴담 가을동화 찬란한유산 워낭소리 천국의계단 슬램덩크 두사부일체 사탄의인형 풀하우스 겨울연가 로마의휴일 타이타닉 마이웨이 늑대의유혹 시네마천국 써니 밀양 달콤한인생
 추격자 왕의남자 나쁜남자 도전골든벨 전설의고향 쏘우 무한도전 라디오스타 일박이일 양들의침묵 매트릭스 러브스토리 삼국지 동의보감 난중일기 목민심서 관동별곡 춘향가 삼국사기
 삼국유사 손자병법 팔만대장경 애국가 주기도문 요한계시록 창세기 십계명`));
const WORLD = new Set(W(`바르셀로나 인도네시아 스웨덴 미국 캐나다 불가리아 멕시코 서울 네덜란드 러시아 인도 브라질 우루과이 우크라이나 헝가리 베트남 뉴질랜드 이탈리아 에스파냐 유럽 한국
 이스라엘 프랑스 일본 루마니아 수원 리비아 사천성 독도 대한민국 영국 가나 터키 칠레 자카르타 스페인 중국 파라과이 아시아 핀란드 호주 독일 부탄 아르헨티나 아프리카 제주도 한반도
 오스트리아 고구려 백제 신라 고려 조선 청나라 금수강산 팔도강산 중부지방 타국 해외 지구촌 분단국가 중립국 핵보유국 산유국 공산국가 적대국 종주국 유엔`));
const BODY = new Set(W(`엄지손가락 여성호르몬 남성호르몬 무좀 허파 혓바늘 엄지손톱 매부리코 알통 주먹코 피부 미간 게거품 충치 몸매 체지방 맹장 내장 탯줄 갈비뼈 콧물 가래침 팔꿈치 관절염 뱁새눈
 주름살 땀방울 염통 손등 개미허리 천식 코털 턱수염 팔뚝 홍역 불면증 정맥 동맥 신경통 보조개 방광 여드름 관자놀이 자라목 평발 체온 중추신경 콧등 송곳니 발등 저체온증 손끝 머리 관절
 옆구리 비듬 이마 설사 현기증 몽고반점 우울증 들창코 어깨뼈 콧날 근육 닭살 뒤통수 치질 폐결핵 편도선 편도선염 티눈 구레나룻 광견병 손톱 습진 인체 연골 창자 양팔 두개골 핏줄 쌍꺼풀
 통증 종양 콧잔등 엄지발가락 손바닥 위경련 점액 혓바닥 췌장암 체세포 주걱턱 종기 치매 상반신 엄지발톱 오른팔 왼팔 오른손 왼손 오른발 왼발 쓸개 태아 물렁살 물렁뼈 고막 피부암 시력
 청력 덧니 통뼈 뻐드렁니 사랑니 머리통 잇몸 똥배 곱슬머리 손금 굳은살 어금니 오장육부 기미 타액 안면 손목 골다공증 주근깨 장염 식도 잔털 피부염 피부색 종아리 백발 콧김 볼기짝
 볼기 소아마비 피멍 폐병 잔주름 흉터 어깨 이목구비 땀샘 정강이 발가락 올챙이배 팔다리 표피 배꼽 머리카락 발목 겨드랑이 인중 턱뼈 웃통 얼굴 허리 혀끝 쌍가마 맨손 맨발 신장 콧대
 두드러기 열병 찰과상 타박상 상처 진땀 소름 알콜중독 알코올중독 언어장애 난치병 불치병 전염병 천연두 합병증 과로사 염색체 유전자 호르몬 인슐린 콜레스테롤 체형 체질 체격 육체미 꼬리
 앞다리 뒷다리 생명선 가슴앓이 급소 고소공포증 자폐증 정신착란 인사불성 생체리듬 바이오리듬 운동신경 평형감각 지능지수 정신연령 체력 지구력 질병 중병 진통 염증 통뼈 노이로제 콤플렉스`));
const SET_NAME = {
  'draw-title': ['작품 제목', ['캐치마인드', '제목']],
  'draw-world': ['나라·도시·역사', ['캐치마인드', '지리']],
  'draw-body': ['몸·건강', ['캐치마인드', '몸']],
  'draw-concept': ['개념·상태', ['캐치마인드', '개념']],
};
const TITLE_RENAME = {}; // (없음)

// ── 기존 캐치 세트 읽기 ─────────────────────────────────────────────────────
const files = readdirSync(DIR).filter((f) => /^draw-.*\.json$/.test(f) && !/-2\.json$/.test(f) && !Object.keys(SET_NAME).includes(f.replace('.json', '')));
const exist = files.map((f) => ({ file: path.join(DIR, f), t: JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) }));
const taken = new Map(); // canon → {item, topic}
for (const { t } of exist) for (const it of t.items) for (const v of [it.name, ...it.variants]) taken.set(C(v), { it, topic: t.topic, old: true });

const rep = { round: 'G051', input: merged.length, keep: merged.filter((x) => x.keep).length, celebDrop: [], celebKeep: [], genDrop: [], sameAsOld: [], mergedNew: [], synAdded: [], synSkipped: [], varDropped: [], moved: {} };
const out = new Map(); // slug → items[]
function setOf(x) {
  if (x.set !== 'draw-etc') return `${x.set}-2`;
  if (TO_CHAR.has(x.w)) { rep.moved[x.w] = 'draw-character-2'; return 'draw-character-2'; }
  if (TITLE.has(x.w)) return 'draw-title';
  if (WORLD.has(x.w)) return 'draw-world';
  if (BODY.has(x.w)) return 'draw-body';
  return 'draw-concept';
}
/** 같은 말 짝에서 대표로 둘 흔한 이름(먼저 처리) */
const PREFER = new Set(W('아내 할인 종이 여자 어린이 장난감 알코올중독 스페인 한증막 옹고집 카카오나무 예수 월급 칼로리 저축 정치인 사이렌 벨트 어머니 우유 천국 설렁탕 별명 무전기 사투리 학부모 깍두기'));
/** var 가 다른 항목 이름과 겹쳐도 뜻이 달라 따로 두는 것 */
const KEEP_SEPARATE = new Set(W('음반 육감 아동 퍼센트 핵폭탄 신분증 지오디 에이치오티'));
const ordered = merged.filter((m) => m.keep).map((m, i) => ({ m, i })).sort((a, b) => (PREFER.has(b.m.w) - PREFER.has(a.m.w)) || a.i - b.i).map((x) => x.m);
for (const x of ordered) {
  if (CELEB.includes(x.w)) { if (!CELEB_KEEP.has(x.w)) { rep.celebDrop.push(x.w); continue; } rep.celebKeep.push(x.w); }
  if (GEN_DROP[x.w]) { rep.genDrop.push({ w: x.w, why: GEN_DROP[x.w] }); continue; }
  const c = C(x.w);
  const hit = taken.get(c);
  if (hit) {
    if (hit.old) { rep.sameAsOld.push({ w: x.w, as: `${hit.it.id} ${hit.it.name}` }); continue; }
    rep.mergedNew.push({ w: x.w, into: hit.it.name }); continue; // 앞 새 항목의 변형과 같음 → 합침(그 변형으로 이미 받음)
  }
  // 웹이 "뜻이 같은 다른 이름" 으로 단 var 가 이미 있는 **항목 이름**이면 → 같은 말 → 그 항목의 변형으로 합침(기존 1,639 에는 변형 더하기만)
  const synHit = (x.var ?? []).filter((v) => !(VAR_DROP[x.w] ?? []).includes(v)).map((v) => taken.get(C(v))).find((o) => o && C(o.it.name) !== c && (x.var ?? []).some((v) => C(v) === C(o.it.name)));
  if (synHit && !KEEP_SEPARATE.has(x.w)) {
    synHit.it.variants.push(x.w); taken.set(c, synHit);
    rep.mergedNew.push({ w: x.w, into: synHit.it.name, old: !!synHit.old });
    continue;
  }
  const slug = setOf(x);
  const it = { id: null, name: x.w, variants: [], tags: [], diff: x.diff, g: x.g, draw: true, liar: false, qid: null };
  taken.set(c, { it, topic: slug });
  for (const v of x.var ?? []) {
    if ((VAR_DROP[x.w] ?? []).includes(v)) { rep.varDropped.push({ w: x.w, v, why: '상위어·다른 뜻' }); continue; }
    const cv = C(v);
    if (!cv || cv === c) continue;
    const o = taken.get(cv);
    if (o) { rep.varDropped.push({ w: x.w, v, why: `${o.it.name} 과 겹침` }); continue; }
    if (/[^\p{L}\p{N} .·'\-&:!?]/u.test(v)) { rep.varDropped.push({ w: x.w, v, why: '특수문자' }); continue; }
    it.variants.push(v); taken.set(cv, { it, topic: slug });
  }
  (out.get(slug) ?? out.set(slug, []).get(slug)).push(it);
}
// 웹 "같은말:<기존>" → 그 항목 변형
for (const x of merged.filter((m) => !m.keep && /^같은말:/.test(m.why))) {
  const target = x.why.slice(4).trim();
  const t = taken.get(C(target));
  const c = C(x.w);
  if (!t) { rep.synSkipped.push({ w: x.w, target, why: '대상 항목 없음' }); continue; }
  if (taken.has(c)) { rep.synSkipped.push({ w: x.w, target, why: `이미 ${taken.get(c).it.name} 의 name·변형` }); continue; }
  t.it.variants.push(x.w); taken.set(c, t);
  rep.synAdded.push({ w: x.w, into: `${t.it.id ?? t.topic} ${t.it.name}` });
}
// 세트 만들기
const built = [];
const oldBySlug = Object.fromEntries(exist.map((e) => [e.t.topic, e.t]));
for (const [slug, items] of [...out.entries()].sort()) {
  items.forEach((it, i) => { it.id = `${slug}-${String(i + 1).padStart(3, '0')}`; });
  const base = oldBySlug[slug.replace(/-2$/, '')];
  const [nameKo, tags] = base ? [base.nameKo, base.tags] : SET_NAME[slug];
  built.push({
    file: path.join(DIR, `${slug}.json`),
    t: {
      topic: slug, nameKo, kind: 'open', version: 1, asOf: '2026-11-10', createdRound: 'G051', status: 'candidate',
      source: [{ url: 'https://namu.wiki/w/캐치마인드/문제 목록', note: 'G051 — G048 이 떨군 나무위키 씨앗 5,829 를 웹 Claude(Sonnet 5.5 · 21 조각 · 18 §12 "아는 단어인가" 기준)가 다시 판정(web-desk/catch2) → GEN 이 실존 연예인 · 논란 · 같은 말만 더 거름 · g = 게임성(보관만)', fetchedAt: '2026-11-10', read: true }],
      liar: false, draw: true, timeSec: 90, tags, count: items.length, items, verify: null,
    },
  });
}
// 전후 표
const dist = (items, k) => [1, 2, 3].map((d) => items.filter((i) => i[k] === d).length).join('/');
rep.sets = built.map((b) => ({ slug: b.t.topic, nameKo: b.t.nameKo, count: b.t.count, diff: dist(b.t.items, 'diff'), g: dist(b.t.items, 'g'), ex: b.t.items.slice(0, 5).map((i) => i.name) }));
rep.total = built.reduce((a, b) => a + b.t.count, 0);
rep.oldTotal = exist.reduce((a, e) => a + e.t.count, 0);
rep.oldTouched = [...new Set(rep.synAdded.filter((s) => /^draw-[a-z]+-\d{3}/.test(s.into) && !/-2-/.test(s.into)).map((s) => s.into.split('-').slice(0, 2).join('-')))];
for (const s of rep.sets) console.log(s.slug.padEnd(20), s.nameKo.padEnd(14), String(s.count).padStart(4), 'diff', s.diff, 'g', s.g, '·', s.ex.join(' '));
console.log('합', rep.total, '(기존', rep.oldTotal, ') · 연예인 뺌', rep.celebDrop.length, '남김', rep.celebKeep.length, '· GEN 뺌', rep.genDrop.length, '· 기존과 같은 말', rep.sameAsOld.length, '· 새끼리 합침', rep.mergedNew.length, '· 같은말 변형', rep.synAdded.length, '건너뜀', rep.synSkipped.length, '· var 뺌', rep.varDropped.length);
if (APPLY) {
  for (const { file, t } of built) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
  // 기존 세트: 변형만 더함(같은말) — version +1 · status 그대로
  for (const { file, t } of exist) {
    const before = JSON.parse(readFileSync(file, 'utf8'));
    const changed = t.items.some((it, i) => it.variants.length !== before.items[i].variants.length);
    if (changed) { t.version += 1; writeFileSync(file, JSON.stringify(t, null, 1) + '\n'); console.log('변형 더함', t.topic); }
  }
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g051-catch2.json'), JSON.stringify(rep, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g051-celeb-drop.json'), JSON.stringify({ round: 'G051', rule: '2026 년 20~40대가 세대 불문 아는 사람만(강호동 · 유재석 · 원빈 · 아이유 · 박지성급) — GEN 판단', drop: rep.celebDrop, keep: rep.celebKeep }, null, 1) + '\n');
  console.log('적용');
} else console.log('dry-run (--apply 로 씀)');
