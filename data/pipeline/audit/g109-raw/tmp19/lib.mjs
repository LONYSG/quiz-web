import fs from 'fs';
const S=JSON.parse(fs.readFileSync('store.json','utf8'));
const rd=f=>fs.readFileSync(f,'utf8');
export const T={
 ko손오공:rd('P-ko-손오공.txt'), ko서유기:S['ko:서유기'].text,
 ko80:rd('P-ko-80일간의_세계_일주.txt'),
 enJ:rd('P-en-Strange_Case_of_Dr_Jekyll_and_Mr_Hyde.txt'), koJ:S['ko:지킬 박사와 하이드 씨'].text,
 koTom:rd('P-ko-톰_소여의_모험.txt'), koCy:rd('P-ko-키클롭스.txt'),
 koCe:rd('P-ko-켄타우로스.txt'), koRh:rd('P-ko-라인강.txt'),
 koMi:rd('P-ko-미시시피강.txt'), koSt:rd('P-ko-상트페테르부르크.txt'),
 koOt:rd('P-ko-오타와.txt'), enOt:rd('P-en-Ottawa.txt'),
 koBai:S['ko:바이칼호'].text, koVic:S['ko:빅토리아 폭포'].text, koBud:S['ko:부처님 오신 날'].text,
 koDan:S['ko:도나우강'].text, koHw:S['ko:황하'].text, koSis:S['ko:시스티나 예배당'].text,
 koLit:S['ko:작은 아씨들'].text, koVol:rd('P-ko-볼가강.txt'),
};
const U={ko손오공:'손오공',ko서유기:'서유기',ko80:'80일간의_세계_일주',koJ:'지킬_박사와_하이드_씨',koTom:'톰_소여의_모험',koCy:'키클롭스',koCe:'켄타우로스',koRh:'라인강',koMi:'미시시피강',koSt:'상트페테르부르크',koOt:'오타와',koBai:'바이칼호',koVic:'빅토리아_폭포',koBud:'부처님_오신_날',koDan:'다뉴브강',koHw:'황하',koSis:'시스티나_경당',koLit:'작은_아씨들',koVol:'볼가강'};
const url=k=>k==='enJ'?'https://en.wikipedia.org/wiki/Strange_Case_of_Dr_Jekyll_and_Mr_Hyde':k==='enOt'?'https://en.wikipedia.org/wiki/Ottawa':'https://ko.wikipedia.org/wiki/'+encodeURIComponent(U[k]);
export const bad=[];
export const Q=(k,text,quote)=>{ if(!T[k].includes(quote)) bad.push(k+' :: '+quote); return {text,url:url(k),quote}; };
export const items=[];
export const D=(answer,also,major,mid,core,story,hint,extra={})=>items.push({answer,also,spelling:'?',major,mid,gradeGuess:1,core,story,hintIdea:hint,legend:false,care:'',why:'',hintRisk:false,spellNote:'',...extra});
