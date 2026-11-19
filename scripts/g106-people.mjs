#!/usr/bin/env node
// =============================================================================
// G106 — 사진 속 사람 세기(살아 있는 유명인 사진이 몇 장인가) · DB 읽기만(그림 data 칸은 읽지 않음)
//   대상: 활성 minigame_items 가운데 그림이 있는 것(photo · which · estimate · photoyear · price)
//   가름: 주인공(그 사람을 알아보는 문제 · 얼굴이 크게) / 곁다리(군중 · 경기 장면 · 그림 속 사람 · 이름 없는 일반인) / 없음
//   생존: data/pipeline/audit/g106-raw/wikidata.json(위키백과 문서 → 위키데이터 P569 · P570 · 2026-11-20 조회)
//   가름은 항목 글 · 그림 파일 이름 · 공용 파일 페이지 설명(애매한 것만)으로 GEN 이 손으로 정한 표(아래 PEOPLE · WHICH · EXTRA)
//   출력 data/pipeline/audit/g106-people.json + 표(콘솔)
//   사용 node scripts/g106-people.mjs [--db quizweb_dev]
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';

process.loadEnvFile?.(path.join(ROOT, '.env'));
const a = process.argv.slice(2);
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const WD = new Map(JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g106-raw/wikidata.json'), 'utf8')).map((x) => [x.key, x]));

// 직업 · 한국인 — GEN 이 정함. 정치 = 근현대 정치인 · 국가원수 · 정치 운동가(정치로 읽힐 수 있는 사람) · 왕 = 옛 왕 · 황제 · 독립운동 따로
const JOB = {
  정치: ['링컨', '간디', '처칠', '마틴 루터 킹', '넬슨 만델라', '케네디', '오바마', '엘리자베스 2세', '레닌', '반기문', '김대중', '마오쩌둥', '카를 마르크스', '린든 존슨'],
  왕: ['고종', '나폴레옹', '정조', '세종대왕', '칭기즈 칸'],
  독립운동: ['김구', '안창호', '안중근', '유관순', '윤봉길'],
  연예인: ['찰리 채플린', '마릴린 먼로', '오드리 헵번', '마이클 잭슨', '엘비스 프레슬리', '이소룡', '존 레논', '폴 매카트니', '링고 스타', '조지 해리슨', '싸이', '프레디 머큐리'],
  운동선수: ['손기정', '손흥민', '김연아', '무하마드 알리', '펠레', '스피리돈 루이스', '모리스 가랭', '토마스 뢸러'],
};
const KOREAN = new Set(['김구', '안중근', '유관순', '안창호', '고종', '윤봉길', '반기문', '손기정', '김대중', '손흥민', '김연아', '이순신', '정약용', '정조', '세종대왕', '이중섭', '김홍도', '이황', '윤동주', '싸이']);
const jobOf = (n) => Object.entries(JOB).find(([, v]) => v.includes(n))?.[0] ?? '그 밖';

// 사진 게임 person 48 은 정답 = 이름. 아래는 그 밖의 게임(주인공 · 곁다리)과 덧말
const WHICH = {
  'which-0128': ['이순신', '셰익스피어'], 'which-0129': ['정약용', '모차르트'], 'which-0130': ['아인슈타인', '찰리 채플린'],
  'which-0131': ['나폴레옹', '정조'], 'which-0132': ['엘리자베스 2세', '케네디'], 'which-0133': ['레오나르도 다 빈치', '세종대왕'],
  'which-0136': ['존 레논', '폴 매카트니', '조지 해리슨', '링고 스타', '프레디 머큐리'], 'which-0137': ['싸이'],
  'which-0107': ['버즈 올드린'], 'which-0143': ['스피리돈 루이스'], 'which-0145': ['모리스 가랭'], 'which-0148': ['칭기즈 칸'],
  'which-0263': ['비발디'], 'which-0272': ['베토벤', '정약용'], 'which-0273': ['김홍도', '모차르트'], 'which-0274': ['안중근', '간디'],
  'which-0275': ['피카소', '이중섭'], 'which-0276': ['마이클 잭슨', '엘비스 프레슬리'], 'which-0277': ['넬슨 만델라', '마틴 루터 킹'],
  'which-0278': ['유관순', '마리 퀴리'], 'which-0279': ['미켈란젤로', '이황'], 'which-0280': ['유리 가가린', '에드먼드 힐러리', '텐징 노르가이'],
  'which-0281': ['알프레드 노벨'], 'which-0286': ['세종대왕', '잔 다르크'], 'which-0296': ['알렉산더 플레밍'],
  'which-0298': ['에디슨', '오귀스트 뤼미에르', '루이 뤼미에르'], 'which-0373': ['김구', '마크 트웨인'], 'which-0379': ['다윈', '카를 마르크스'],
  'which-0386': ['안창호', '니콜라 테슬라'], 'which-0390': ['손기정'], 'which-0393': ['바흐', '루소'], 'which-0400': ['윤동주', '오드리 헵번'],
  'which-0411': ['갈릴레오', '데카르트'],
  'estimate-0260': ['버즈 올드린'], 'estimate-0276': ['토마스 뢸러'], 'estimate-0264': ['알렉산더 플레밍'],
};
const NOTE = {
  'which-0107': '올드린 — 우주복 헬멧 가리개로 얼굴이 안 보임(가리개에 암스트롱이 비침)', 'estimate-0260': '올드린 — 우주복 · 얼굴 거의 안 보임',
  'which-0136': '비틀스 1964 단체 사진(넷) + 프레디 머큐리 동상', 'which-0133': '세종 = 동상', 'which-0279': '이황 = 동상', 'which-0286': '세종 = 동상 · 잔 다르크 = 옛 그림',
  'which-0128': '이순신 = 흉상', 'which-0390': '패럴림픽 쪽 = 1960 경기장 곁다리(안토니오 마글리오 1912~1988)', 'which-0137': 'BTS 쪽 = 음반 표지 그림(사람 사진 아님)',
  'which-0281': '아카데미 쪽 = 1929 시상식 단체 사진(곁다리)', 'which-0277': '킹 쪽 = 린든 존슨과 함께 찍힌 사진을 잘라 킹만',
  'estimate-0276': '독일 창던지기 선수가 던지는 장면',
};
// 곁다리(이름으로 세지 않음) — 군중 · 경기 장면 · 사람이 든 옛 그림 · 이름 없는 일반인
const SIDE = {
  which: { '0106': '라이트 형제 첫 비행(작게 · 둘 다 고인)', '0144': '2008 올림픽 농구 경기 장면 · 1877 윔블던 그림', '0145': '1924 봅슬레이 선수들', '0263': '9번 교향곡 초연 그림', '0287': '대관식 · 바스티유 그림', '0293': '연방 회의 · 독립 선언 그림', '0402': '접종 그림 둘', '0414': '마네 · 르누아르 그림', '0374': '렘브란트 · 벨라스케스 그림', '0398': '보스턴 차 사건 · 워털루 그림', '0410': '부산진 순절도', '0408': '열기구 그림', '0415': '2002 서울광장 응원 인파 · 1989 브란덴부르크 문 인파', '0323': '경기장 관중', '0140': '로빈슨 크루소 · 걸리버 삽화', '0256': '코제트 삽화 · 프랑켄슈타인 삽화', '0258': '절규 · 키스(그림 속 인물)', '0382': '다비드상(조각)', '0281': '1929 아카데미 시상식', '0390': '1960 패럴림픽 경기장' },
  estimate: { '0255': '2024 트라이애슬론 선수들', '0256': '아이언맨 수영 출발 인파', '0257': '2004 올림픽 경보 선수들', '0269': '럭비 스크럼', '0278': '바벨 드는 남자(이름 없는 일반인 · 크게)', '0043': '성 베드로 광장 인파', '0263': '콜럼버스 상륙 그림', '0188': '살바토르 문디(그림)', '0190': '모나리자(그림)' },
  photo: { '0144': '복조리 만드는 손', '0230': '칼 가는 손' },
};
// photoyear: 단서 · 제목에 사람 낱말이 있으면 곁다리(모두 이름 없는 일반인 · 거리 풍경)
const PEOPLE_WORDS = /사람|행인|인파|아이|학생|여성|여인|관광객|승객|차림|인부|선생님|소년|남자|배달원|모델|이용자|응원단|시민|판매원|노인|행상|머리 모양|옷차림|관람객|운전자|대열|줄 선|군중|머리|구경/;
const MINOR = /아이|학생|소년|어린이|초등|국민학교|운동회/;

const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
const db = url.pathname.slice(1);
const rows = (await c.query(`select i.game, i.item_id, i.payload - 'sources' - 'verify' p,
  coalesce((select array_agg(m.source_url order by m.image_id) from minigame_images m where m.image_id = any(i.image_ids)), '{}') src,
  coalesce((select array_agg(m.license order by m.image_id) from minigame_images m where m.image_id = any(i.image_ids)), '{}') lic
  from minigame_items i where i.active and cardinality(i.image_ids) > 0 order by 1, 2`)).rows;
await c.end();

const out = [];
for (const r of rows) {
  const p = r.p; const no = r.item_id.split('-').pop();
  let names = [], kind = '없음', note = NOTE[r.item_id] ?? '';
  if (r.game === 'photo' && p.category === 'person') names = [p.answer];
  else if (WHICH[r.item_id]) names = WHICH[r.item_id];
  if (names.length) kind = '주인공';
  else if (SIDE[r.game]?.[no] !== undefined) { kind = '곁다리'; note = SIDE[r.game][no] || note; }
  else if (r.game === 'photoyear' && PEOPLE_WORDS.test(`${p.title} ${p.cues}`)) { kind = '곁다리'; note = '거리 풍경 속 이름 없는 일반인'; }
  if (kind === '곁다리' && SIDE[r.game]?.[no] === '') kind = '없음';
  const people = names.map((n) => {
    const w = WD.get(n);
    if (!w) throw new Error(`위키 없음 ${n}`);
    return { name: n, alive: !w.died, born: w.born, died: w.died ?? null, job: jobOf(n), korean: KOREAN.has(n), source: w.url };
  });
  const label = r.game === 'photo' ? p.answer : r.game === 'which' ? `${p.a?.label} / ${p.b?.label}` : r.game === 'estimate' ? p.question : r.game === 'photoyear' ? p.title : p.name;
  const minor = r.game === 'photoyear' && MINOR.test(`${p.title} ${p.cues}`);
  out.push({ id: r.item_id, game: r.game, label, kind, people, note, minor, image: r.lic.includes('product-page') ? 'product-page(상품 사진 · 이름만 봄)' : r.src.map((s) => decodeURIComponent(String(s).replace(/.*(FilePath\/|File:|\/)/, '').replace(/\?.*/, ''))) });
}

// 표
const G = ['photo', 'which', 'estimate', 'photoyear', 'price'];
const T = G.map((g) => {
  const xs = out.filter((x) => x.game === g);
  const lead = xs.filter((x) => x.kind === '주인공');
  const living = lead.filter((x) => x.people.some((y) => y.alive));
  const krLiving = lead.filter((x) => x.people.some((y) => y.alive && y.korean && ['연예인', '운동선수'].includes(y.job)));
  const politic = lead.filter((x) => x.people.some((y) => y.job === '정치'));
  return { game: g, items: xs.length, lead: lead.length, living: living.length, krLiving: krLiving.length, side: xs.filter((x) => x.kind === '곁다리').length, left: xs.length - living.length, politic: politic.length, politicLiving: politic.filter((x) => x.people.some((y) => y.job === '정치' && y.alive)).length };
});
const sum = (k) => T.reduce((s, x) => s + x[k], 0);
T.push({ game: '합', items: sum('items'), lead: sum('lead'), living: sum('living'), krLiving: sum('krLiving'), side: sum('side'), left: sum('left'), politic: sum('politic'), politicLiving: sum('politicLiving') });
const livingList = out.filter((x) => x.people.some((y) => y.alive)).map((x) => ({ id: x.id, who: x.people.filter((y) => y.alive).map((y) => `${y.name}(${y.born}~ · ${y.job}${y.korean ? ' · 한국' : ''})`).join(', '), note: x.note }));
const minors = out.filter((x) => x.minor).map((x) => `${x.id} ${x.label}`);
writeFileSync(path.join(ROOT, 'data/pipeline/audit/g106-people.json'), JSON.stringify({ round: 'G106', db, at: new Date().toISOString(), rule: '주인공 = 그 사람을 알아보는 문제이거나 얼굴이 크게 · 곁다리 = 군중 · 경기 장면 · 사람이 든 옛 그림 · 이름 없는 일반인 · 생존 = 위키데이터 P570(사망일) 없음', table: T, living: livingList, minors, items: out }, null, 1) + '\n');
console.log(db); console.table(T); console.log(livingList); console.log('미성년(사진 찍힐 때 아이)', minors.length, minors);
