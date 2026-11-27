// 4회~ 영상 자료 만들기(설계 2026-11-27 · 해설 새 방식) — build-02 꼴 그대로, 입력만 다르다
//   입력: 받은것/확정-NN.json(새 방식 확정 해설 · 한 글자도 안 고침) + 받은것/그림-NN-새.json(gpt 그림 지시 · 문단 = 장면)
//         + 아래 SRC(설명글 출처 = 설계가 연 문서만) + SAY(읽는 글 — 숫자 · 영문만 한글로)
//   보탬 사실은 없다 → facts 는 빈 배열(화면 글자는 해설 글에 있는 이름 · 숫자만)
//   node web-desk/vscript/_build/build-03.mjs 04
import { readFileSync, writeFileSync } from 'node:fs';
const WEB = 'C:/work/quiz-web/web-desk/vscript/';
const VID = 'C:/work/quiz-video/data/';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
const base = rd(VID + 'questions-3.json'); // 1회(양식 확정판)
const ledger = rd(WEB + '회차.json');
const eps = ledger.episodes || ledger;
const outNo = { '04': 6, '05': 7 };
const intro = {
  '04': '72초 동안 잡혔다가 다시는 들리지 않은 우주의 전파 이야기를 비롯해, 오늘도 다섯 문제를 준비했습니다.',
  '05': '소설 속에만 있던 주소로 진짜 편지가 쏟아진 탐정 이야기를 비롯해, 오늘도 다섯 문제를 준비했습니다.',
};
const ALSO = { 에펠탑: ['에펠 탑'], 로제타석: ['로제타 스톤', '로제타 석'], '와우! 신호': ['와우 신호', '와우! 시그널', '와우 시그널'] };
// 설명글 출처 — 2026-11-27 설계가 연 문서(각 새3.json 의 "설계 대조" 칸)
const SRC = {
  청진기: ['· Wikipedia, 「René Laennec」(라에네크 『간접 청진법』 인용 포함)'],
  에펠탑: ['· Wikipedia, 「Eiffel Tower」', '· Wikisource, 「Les artistes contre la tour Eiffel」 (Le Temps, 1887)'],
  로제타석: ['· Wikipedia, 「Rosetta Stone」', '· Wikipedia, 「Jean-François Champollion」', '· E. A. Wallis Budge, 「The Rosetta Stone」 (1893)'],
  '와우! 신호': ['· Big Ear Radio Observatory, 「Wow! Signal - 30th Anniversary Report」 (2007)', '· Wikipedia, 「Wow! signal」'],
  플로지스톤: ['· Wikipedia, 「Phlogiston theory」', '· Wikipedia, 「Antoine Lavoisier」'],
  '셜록 홈스': ['· Wikipedia, 「A Study in Scarlet」', '· Wikipedia, 「221B Baker Street」', '· Mental Floss, 「Who Answers Sherlock Holmes's Fan Mail?」'],
  로봇: ['· Wikipedia, 「Robot」', '· Wikipedia, 「R.U.R.」'],
  모노폴리: ['· Wikipedia, 「The Landlord's Game」'],
  '노시보 효과': ['· CIDRAP, 「Most side effects noted in COVID vaccine trials may be due to 'nocebo effect'」 (2022-01-19)', '· EurekAlert!, 「Placebo effect accounts for more than two-thirds of COVID-19 vaccine adverse events」 (2022-01-18)', '· BMJ, 「When I use a word . . . Nocebo」 (2026-04-24)'],
  '계획적 진부화': ['· Wikipedia, 「Phoebus cartel」'],
};
// 읽는 글: [바꿀 글, 읽을 글] — 질문 · 힌트 · 해설 모두에 차례로
const SAY = {
  청진기: [['1816년', '천팔백십육 년']],
  에펠탑: [['1889년', '천팔백팔십구 년'], ['20년', '이십 년'], ['1930년', '천구백삼십 년'], ['41년', '사십일 년']],
  로제타석: [],
  '와우! 신호': [['1977년', '천구백칠십칠 년'], ['‘6EQUJ5’', '‘육 이 큐 유 제이 오’'], ['‘Wow!’', '‘와우’'], ['12초', '십이 초'], ['9를', '구를'],
    ['6에서 출발해 E, Q를 거쳐 U에서 가장 강해졌다가 J와 5로', '육에서 출발해 이, 큐를 거쳐 유에서 가장 강해졌다가 제이와 오로'], ['72초', '칠십이 초']],
  플로지스톤: [['17~18세기', '십칠, 십팔 세기']],
  '셜록 홈스': [['221B', '이백이십일 비'], ['221번지', '이백이십일 번지']],
  로봇: [['1920년', '천구백이십 년'], ['R.U.R.', '알 유 알']],
  모노폴리: [],
  '노시보 효과': [['코로나19', '코로나 일구'], ['1961년', '천구백육십일 년']],
  '계획적 진부화': [['1920년대', '천구백이십 년대']],
};
// ★ 찬종 2026-11-27: 읽는 글에는 기호를 넣지 않는다 — "와우! 신호"를 "와우! (쉼) 신호"로 끊어 읽었다.
//   이름(정답 · SAY 로 바꾼 낱말) 안의 기호 · 따옴표 · 괄호 · 가운뎃점을 뺀다. 문장 끝 . ! ? 와 쉼표는 둔다(억양). 화면 글(text)은 그대로.
const bare = (name) => name.replace(/[!?‘’“”"'「」『』《》〈〉()（）·]/g, '').replace(/\s{2,}/g, ' ').trim();
const plain = (ans, s) => s.split(ans).join(bare(ans))
  .replace(/[‘’“”"'「」『』《》〈〉]/g, '')
  .replace(/[()（）]/g, ' ')
  .replace(/\s*·\s*/g, ', ')
  .replace(/[ \t]{2,}/g, ' ');
const sayOf = (ans, s) => { for (const [a, b] of SAY[ans]) s = s.split(a).join(b); return plain(ans, s); };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const NUM = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const kNum = (n) => { const t = Math.floor(n / 10), o = n % 10; return (t ? (t > 1 ? NUM[t] : '') + '십' : '') + NUM[o]; };

for (const n of process.argv.slice(2)) {
  const m = rd(WEB + `받은것/확정-${n}.json`);
  const g = rd(WEB + `받은것/그림-${n}-새.json`);
  if (!g.done) throw new Error('그림 파일 done 없음');
  const e = eps.find((x) => x.no === +n);
  const [Y, M, D] = e.date.split('-').map(Number);
  if (Y !== 2026) throw new Error('연도 읽기는 2026 만');
  const wd = WD[new Date(Date.UTC(Y, M - 1, D)).getUTCDay()];
  const label = `${String(Y).slice(2)}.${String(M).padStart(2, '0')}.${String(D).padStart(2, '0')}`;
  const dateText = `${Y}년 ${M}월 ${D}일 ${wd}요일`;
  const dateSay = `이천이십육 년 ${kNum(M)}월 ${kNum(D)} 일 ${wd}요일`;
  const dateSentence = `${dateSay}, 오늘의 상식 다섯 문제입니다.`;
  const topics = m.questions.map((q) => q.topic);
  const srcLines = [];
  const factsOut = { note: `${+n}회 — 보탬 사실 없음(2026-11-27 해설 새 방식). 화면 글자 · 숫자는 해설 글(paragraphs.text)에 있는 것만.`, questions: [] };
  const questions = m.questions.map((q) => {
    const gq = g.questions.find((x) => x.answer === q.answer);
    const paras = q.explanation.split(/\n\s*\n/).map((s) => s.trim());
    if (!gq || paras.length !== gq.scenes.length) throw new Error(`${q.answer}: 문단 ${paras.length} · 장면 ${gq?.scenes.length}`);
    const sayParas = paras.map((p) => sayOf(q.answer, p));
    const left = (s) => /[0-9A-Za-z]/.test(s.replace(/[‘’'"]/g, ''));
    for (const s of [...sayParas, sayOf(q.answer, q.question), sayOf(q.answer, q.hint)]) if (left(s)) throw new Error(`${q.answer}: 읽는 글에 숫자 · 영문 남음 — ${s.match(/.{0,12}[0-9A-Za-z].{0,12}/)[0]}`);
    srcLines.push(`${q.no}번 ${q.answer}`, ...SRC[q.answer]);
    factsOut.questions.push({ no: q.no, answer: q.answer, facts: [], conflict: [] });
    return {
      no: q.no, id: null, difficulty: q.no, category: q.topic, topic: q.topic,
      question: q.question, answer: q.answer, also: ALSO[q.answer] || [], hint: q.hint,
      explanation: paras.join('\n\n'),
      say: { question: sayOf(q.answer, q.question), hint: sayOf(q.answer, q.hint), answer: `정답은 ${bare(q.answer)}!`, explanation: sayParas.join('\n\n') },
      paragraphs: paras.map((text, i) => ({ no: i + 1, text, say: sayParas[i] })),
      draw: { moment: gq.moment, care: gq.care, scenes: gq.scenes.map((s, i) => ({ para: i + 1, starts: paras[i].slice(0, 18) + '…', show: s.show, ...(s.text ? { text: s.text } : {}), ...(s.icon ? { icon: s.icon } : {}), ...(s.care ? { care: s.care } : {}) })) },
      sources: [],
    };
  });
  const out = {
    note: `${+n}회 자료(설계 창 2026-11-27 · build-03 · 해설 새 방식). 양식 = 1회(questions-3.json) 그대로. 해설 = 받은것/확정-${n}.json(찬종 확정) — 한 글자도 고치지 않는다. paragraphs = 문단(장면) 단위 화면 글 text 와 읽는 글 say. draw = gpt 그림 지시(받은것/그림-${n}-새.json · 문단 하나 = 장면 하나). 보탬 사실 없음 — 화면 글자는 해설 글에 있는 이름 · 숫자만. 넘치지도 비지도 않게(큰 주인공 하나 · 글자는 이름 · 핵심 숫자 · 원어 풀이 정도 · 의성어 · 대본 되받기 글자 없음). say = 숫자 · 영문만 한글 · 빠르기 1.0.`,
    episode: {
      no: +n, date: e.date, hook: e.hook, title: e.title, noteHook: base.episode.noteHook, topics,
      opening: { text: `${dateText}, 오늘의 상식 다섯 문제입니다. ${topics.join('. ')}. 시작합니다.`, say: `${dateSentence}\n\n${topics.join('.\n\n')}.\n\n시작합니다.`, note: base.episode.opening.note, dateSentence, dateNote: base.episode.opening.dateNote },
      closing: base.episode.closing,
      dateLabel: label, dateText, dateSay, file: e.file, publishAt: e.publishAt,
      description: {
        note: base.episode.description.note,
        head: `${dateText} · 오늘의 상식`,
        intro: `${intro[n]}\n매일 다섯 문제, 답보다 재미있는 뒷이야기를 들려드립니다.`,
        sourcesHead: base.episode.description.sourcesHead, sources: srcLines,
        outro: base.episode.description.outro, hashtags: base.episode.description.hashtags, introNote: base.episode.description.introNote,
      },
    },
    questions,
  };
  if (e.file !== `오늘의 상식 ${label}`) throw new Error('파일 이름 어긋남 ' + e.file);
  writeFileSync(VID + `questions-${outNo[n]}.json`, JSON.stringify(out, null, 1) + '\n');
  writeFileSync(VID + `facts-${outNo[n]}.json`, JSON.stringify(factsOut, null, 1) + '\n');
  console.log(`${n} → questions-${outNo[n]} · ${out.episode.title} · ${dateText} · 문단 ${questions.map((q) => q.paragraphs.length).join('·')}`);
}
