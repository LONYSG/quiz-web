// 2~4회 영상 자료 만들기(설계 2026-11-24 · build-01 꼴) — 1회에서 굳은 양식 그대로
//   입력: 받은것/마무리-NN.json(gpt 확정 대본 · 한 글자도 안 고침) + 받은것/그림-NN.json(gpt 그림 지시 · 문단 = 장면)
//         + 설명출처-NN.json(설계가 다시 연 문서 · pick) + 보탬-NN*.json(화면에 보탤 사실 → facts-N.json)
//   날짜 · 제목 · 파일 이름 = 장부(회차.json) · 여는 말 = 1회 틀(날짜 문장 + 주제 하나씩 + 시작합니다)
//   node web-desk/vscript/_build/build-02.mjs [02 03 04]
import { readFileSync, writeFileSync } from 'node:fs';
const WEB = 'C:/work/quiz-web/web-desk/vscript/';
const VID = 'C:/work/quiz-video/data/';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
const base = rd(VID + 'questions-3.json'); // 1회(양식 확정판)
const ledger = rd(WEB + '회차.json');
const eps = ledger.episodes || ledger;

const diff = { '02': { 포스트잇: 1, 아킬레스건: 2, 도루묵: 3, 파넨카: 4, 몬더그린: 5 }, '03': { 모나리자: 1, 버그: 2, 감칠맛: 3, 배면뛰기: 4, 실러캔스: 4 }, '04': { 신호등: 1, 스타벅스: 3, 로제타석: 3, '와우! 신호': 4, 마그네트론: 4 } };
const outNo = { '02': 4, '03': 5, '04': 6 };
// 설명출처-NN 에 아직 없는 정답(다시 연 문서 목록이 따로 있다) — 싣기 전에 설계가 채운다
const extraFacts = { '03': ['보탬-03-실러캔스.json'], '04': ['보탬-04-스타벅스-더.json'] };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const NUM = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const kNum = (n) => { // 1~99 한글 읽기
  const t = Math.floor(n / 10), o = n % 10;
  return (t ? (t > 1 ? NUM[t] : '') + '십' : '') + NUM[o];
};
const intro = {
  '02': '쓸 곳을 못 찾던 약한 접착제가 메모지가 된 이야기를 비롯해, 오늘도 다섯 문제를 준비했습니다.',
  '03': '도둑맞은 뒤에야 세상에서 가장 유명해진 그림 이야기를 비롯해, 오늘도 다섯 문제를 준비했습니다.',
  '04': '72초 동안 잡혔다가 다시는 들리지 않은 우주의 전파 이야기를 비롯해, 오늘도 다섯 문제를 준비했습니다.',
};

const only = process.argv.slice(2);
for (const n of only.length ? only : ['02', '03', '04']) {
  const m = rd(WEB + `받은것/마무리-${n}.json`);
  const g = rd(WEB + `받은것/그림-${n}.json`);
  const src = rd(WEB + `설명출처-${n}.json`);
  const bt = rd(WEB + `보탬-${n}.json`);
  const e = eps.find((x) => x.no === +n);
  const [Y, M, D] = e.date.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(Y, M - 1, D)).getUTCDay()];
  const label = `${String(Y).slice(2)}.${String(M).padStart(2, '0')}.${String(D).padStart(2, '0')}`;
  const dateText = `${Y}년 ${M}월 ${D}일 ${wd}요일`;
  const dateSay = `이천이십육 년 ${kNum(M)}월 ${kNum(D)} 일 ${wd}요일`;
  if (Y !== 2026) throw new Error('연도 읽기는 2026 만');
  const topics = m.questions.map((q) => q.topic);
  const dateSentence = `${dateSay}, 오늘의 상식 다섯 문제입니다.`;

  const factsOut = { note: `${+n}회 문제별 사실 모음(설계 창이 문서를 다시 열어 뽑은 보탬 자료 · quote = 그 문서의 문장 그대로). 대본에 없는 사실을 화면(글자 · 숫자 · 그림)에 보탤 때는 여기 있는 것만, quote 가 말하는 만큼만 쓴다. conflict = 문서끼리 서로 다른 곳 — 거기 적힌 안전한 굵기를 지킨다.`, questions: [] };
  const extra = (extraFacts[n] || []).map((f) => rd(WEB + f));
  const srcLines = [];
  const questions = m.questions.map((q) => {
    const gq = g.questions.find((x) => x.answer === q.answer);
    const paras = q.explanation.split(/\n\s*\n/).map((s) => s.trim());
    const sayParas = q.say.explanation.split(/\n\s*\n/).map((s) => s.trim());
    if (!gq || paras.length !== gq.scenes.length || paras.length !== sayParas.length) throw new Error(`${n} ${q.answer}: 문단 ${paras.length} · 읽는 글 ${sayParas.length} · 장면 ${gq?.scenes.length}`);
    const sq = src.questions.find((x) => x.answer === q.answer);
    srcLines.push(`${q.no}번 ${q.answer}`);
    let urls = [];
    if (sq) {
      for (const i of sq.pick) {
        const x = sq.docs[i];
        const site = x.site.replace(/&amp;/g, '&').replace(/ \((?:[^)]*\.(?:com|org|kr)[^)]*|Collection[^)]*|[^)]*본사[^)]*)\)/, '');
        const year = /UEFA/.test(x.site) ? null : x.year;
        srcLines.push(`· ${site}, 「${x.title.replace(/&amp;/g, '&')}」` + (year ? ` (${year})` : ''));
      }
      urls = sq.docs.filter((x) => x.reopened).map((x) => x.url);
    } else srcLines.push('· (출처 정리 중)');
    const bq = bt.questions.find((x) => x.answer === q.answer);
    const ex = extra.find((x) => (x.answer || '스타벅스') === q.answer);
    const facts = [...(bq?.facts || []), ...(ex?.facts || [])].map(({ id, text, quote, site, title, year, url }) => ({ id, text, quote, site, title, year, url }));
    factsOut.questions.push({ no: q.no, answer: q.answer, facts, conflict: [bq?.conflict, ex?.conflict].filter(Boolean) });
    return {
      no: q.no, id: null, difficulty: diff[n][q.answer], category: q.topic, topic: q.topic,
      question: q.question, answer: q.answer, also: q.also || [], hint: q.hint,
      explanation: paras.join('\n\n'),
      say: { question: q.say.question, hint: q.say.hint, answer: q.say.answer, explanation: sayParas.join('\n\n') },
      paragraphs: paras.map((text, i) => ({ no: i + 1, text, say: sayParas[i] })),
      draw: { moment: gq.moment, care: gq.care, scenes: gq.scenes.map((s, i) => ({ para: i + 1, starts: paras[i].slice(0, 18) + '…', show: s.show, ...(s.text ? { text: s.text } : {}), ...(s.icon ? { icon: s.icon } : {}), ...(s.care ? { care: s.care } : {}) })) },
      sources: urls,
    };
  });
  for (const q of questions) if (!q.difficulty) throw new Error('난이도 없음 ' + q.answer);

  const out = {
    note: `${+n}회 자료(설계 창 2026-11-24 · build-02). 양식 = 1회(questions-3.json · 2026-11-24 찬종 확정) 그대로. 해설 = gpt 확정 대본 web-desk/vscript/받은것/마무리-${n}.json rev ${m.rev} — 한 글자도 고치지 않는다. paragraphs = 문단(장면) 단위 화면 글 text 와 읽는 글 say. draw = gpt 그림 지시(받은것/그림-${n}.json · 문단 하나 = 장면 하나 · show = 그 문단에서 보여 줄 것 · text = 화면 글자 · care = 조심할 것). 화면에 보탤 사실은 data/facts-${outNo[n]}.json 에 있는 것만. 넘치지도 비지도 않게(큰 주인공 하나 · 글자는 이름 · 핵심 숫자 · 원어 풀이 정도 · 의성어 · 대본 되받기 글자 없음). say = 숫자만 한글 · 빠르기 1.0.`,
    episode: {
      no: +n, date: e.date, hook: e.hook, title: e.title, noteHook: base.episode.noteHook, topics,
      opening: { text: `${dateText}, 오늘의 상식 다섯 문제입니다. ${topics.join('. ')}. 시작합니다.`, say: `${dateSentence}\n\n${topics.join('.\n\n')}.\n\n시작합니다.`, note: base.episode.opening.note, dateSentence, dateNote: base.episode.opening.dateNote },
      closing: base.episode.closing,
      dateLabel: label, dateText, dateSay, file: e.file, publishAt: e.publishAt,
      description: {
        note: base.episode.description.note,
        head: `${dateText} · 오늘의 상식`,
        intro: `${intro[n]}\n매일 다섯 문제, 답보다 재미있는 뒷이야기를 들려드립니다.`,
        sourcesHead: base.episode.description.sourcesHead,
        sources: srcLines,
        outro: base.episode.description.outro, hashtags: base.episode.description.hashtags,
        introNote: base.episode.description.introNote,
      },
    },
    questions,
  };
  if (e.file !== `오늘의 상식 ${label}`) throw new Error('파일 이름 어긋남 ' + e.file);
  writeFileSync(VID + `questions-${outNo[n]}.json`, JSON.stringify(out, null, 1) + '\n');
  writeFileSync(VID + `facts-${outNo[n]}.json`, JSON.stringify(factsOut, null, 1) + '\n');
  console.log(`${n} → questions-${outNo[n]} · ${out.episode.title} · ${dateText} / ${dateSay} · 문단 ${questions.map((q) => q.paragraphs.length).join('·')} · 보탬 사실 ${factsOut.questions.map((q) => q.facts.length).join('·')}`);
  console.log('   ' + srcLines.join('\n   '));
}
