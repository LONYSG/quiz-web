// 2~4회 영상 자료 만들기: 마무리-NN.json(gpt 확정 대본) + draw.json(설계의 그림 지시) + 설명출처-NN.json(다시 연 문서) → quiz-video/data/questions-{4,5,6}.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const WEB = 'C:/work/quiz-web/web-desk/vscript/';
const VID = 'C:/work/quiz-video/data/';
const here = new URL('.', import.meta.url);
const draw = JSON.parse(readFileSync(new URL('draw.json', here), 'utf8'));
const base = JSON.parse(readFileSync(VID + 'questions-3.json', 'utf8'));
const diff = { '02': { 포스트잇: 2, 아킬레스건: 1, 도루묵: 3, 파넨카: 4, 몬더그린: 5 }, '03': { 모나리자: 1, 버그: 2, 감칠맛: 3, 배면뛰기: 4, '이중 내륙국': 5 }, '04': { 신호등: 1, 스타벅스: 3, 로제타석: 3, '와우! 신호': 4, 마그네트론: 4 } };
const outNo = { '02': 4, '03': 5, '04': 6 };
for (const n of ['02', '03', '04']) {
  const m = JSON.parse(readFileSync(WEB + '받은것/마무리-' + n + '.json', 'utf8'));
  const d = draw[n];
  const srcFile = WEB + '설명출처-' + n + '.json';
  const src = existsSync(srcFile) ? JSON.parse(readFileSync(srcFile, 'utf8')) : null;
  const hook = m.episode.hook;
  const title = `${hook} | 오늘의 상식 ${d.label}`;
  const topics = m.questions.map((q) => q.topic);
  const sayTopics = topics.join('.\n\n') + '.';
  const dateSentence = `${d.say}, 오늘의 상식 다섯 문제입니다.`;
  let sources = null;
  if (src && src.done) {
    sources = [];
    for (const q of src.questions) {
      sources.push(`${q.no}번 ${q.answer}`);
      for (const i of q.pick) { const x = q.docs[i]; const site = x.site.replace(/&amp;/g, '&').replace(/ \((?:[^)]*\.(?:com|org|kr)[^)]*|Collection[^)]*|[^)]*본사[^)]*)\)/, ''); const year = /UEFA/.test(x.site) ? null : x.year; sources.push(`· ${site}, 「${x.title.replace(/&amp;/g, '&')}」` + (year ? ` (${year})` : '')); }
    }
  }
  const out = {
    note: `${m.episode.no}회 자료(설계 창 2026-11-21). 글 = gpt 확정 대본 web-desk/vscript/받은것/마무리-${n}.json rev ${m.rev} 그대로(한 글자도 고치지 않는다). 틀 · 규칙은 questions-3.json 의 note 와 같다(say = 읽는 글 · 숫자만 한글 · 영어는 원어 그대로 · 말투 지시말 없음 · 빠르기 1.0). draw = 설계가 정한 그릴 것 · 터지는 순간 · 조심할 것 — 대본에 없는 사실을 그림으로 보태지 않는다. also = 같은 정답의 다른 이름(화면에는 쓰지 않는다 · 게임 쪽 인정어).`,
    episode: {
      no: m.episode.no, date: d.date, hook, title, noteHook: base.episode.noteHook, topics,
      opening: { text: `${d.text}, 오늘의 상식 다섯 문제입니다. ${topics.join('. ')}. 시작합니다.`, say: `${dateSentence}\n\n${sayTopics}\n\n시작합니다.`, note: base.episode.opening.note, dateSentence, dateNote: base.episode.opening.dateNote },
      closing: base.episode.closing,
      dateLabel: d.label, dateText: d.text, dateSay: d.say, file: `오늘의 상식 ${d.label}`, publishAt: `${d.date} 07:00`,
      description: {
        note: base.episode.description.note,
        head: `${d.text} · 오늘의 상식`,
        intro: `${d.intro}\n매일 다섯 문제, 답보다 재미있는 뒷이야기를 들려드립니다.`,
        sourcesHead: base.episode.description.sourcesHead,
        sources,
        outro: base.episode.description.outro, hashtags: base.episode.description.hashtags,
        introNote: base.episode.description.introNote,
        sourcesNote: '★ 설계 창이 싣기 직전에 다시 연 문서만(web-desk/vscript/설명출처-' + n + '.json 의 pick). null 이면 영상 창은 "(출처 정리 중)" 한 줄 — 이 창이 채우지 않는다.',
      },
    },
    questions: m.questions.map((q, i) => ({
      no: q.no, id: null, difficulty: diff[n][q.answer], category: q.topic, topic: q.topic,
      question: q.question, answer: q.answer, also: q.also || [], hint: q.hint, explanation: q.explanation,
      say: { question: q.say.question, hint: q.say.hint, answer: q.say.answer, explanation: q.say.explanation },
      say_v3: { question: q.say.question, hint: q.say.hint, answer: q.say.answer, explanation: q.say.explanation },
      draw: d.draw[i],
      sources: src ? src.questions[i].docs.filter((x) => x.reopened).map((x) => x.url) : [],
    })),
  };
  if (out.questions.some((q) => !q.difficulty || !q.draw)) throw new Error('missing ' + n);
  writeFileSync(VID + `questions-${outNo[n]}.json`, JSON.stringify(out, null, 1) + '\n');
  console.log(n, '→ questions-' + outNo[n], title, '| sources', sources ? sources.length : 'null', '| 글자', out.questions.reduce((a, q) => a + Object.values(q.say).join('').length, 0) + out.episode.opening.say.length + out.episode.closing.say.length);
}
