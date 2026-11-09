import { flexCanon, normalizeAnswer } from '../../../../../shared/dist/index.js';
export const canon = (s) => flexCanon(String(s ?? ''));
if (process.argv[1].endsWith('canon.mjs')) {
  const t = [['공백 "대한 민국"','대한 민국','대한민국'],['대소문자 "ABC"','ABC','abc'],['조사 "서울이"','서울이','서울'],['끝맺음 "서울이다"','서울이다','서울'],['괄호 "서울(Seoul)"','서울(Seoul)','서울'],['가운뎃점 "스파이더·맨"','스파이더·맨','스파이더맨'],['관사 "The Beatles"','The Beatles','Beatles'],['시 뗀 꼴 "서울시"','서울시','서울'],['하이픈 "스파이더-맨"','스파이더-맨','스파이더맨'],['숫자 "아이언맨 2"','아이언맨 2','아이언맨2'],['로마 "아이언맨Ⅱ"','아이언맨Ⅱ','아이언맨2']];
  for (const [l,a,b] of t) console.log(l, canon(a)===canon(b)?'같음(받음)':'다름');
}
