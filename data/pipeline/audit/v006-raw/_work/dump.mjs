import fs from 'node:fs';
const [,, chunk, extra=''] = process.argv;
const a=JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v006-raw/'+chunk+'.out.json','utf8'));
const T=JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/r047-verify-targets.json','utf8')).midHints.targets;const by=new Map(T.map(x=>[x.id,x]));
const want=new Set(extra.split(',').filter(Boolean).map(Number));
const c={};for(const r of a){c[r.verdict]=(c[r.verdict]||0)+1}
let f={t:0,fa:0,u:0,d:0,w:0};for(const r of a)for(const x of r.facts||[]){if(x.proposal)continue;if(x.result==='true')f.t++;else if(x.result==='false')f.fa++;else f.u++;if(x.doubt)f.d++;if(x.basis==='web')f.w++}
console.log(chunk, a.length, JSON.stringify(c), 'facts', JSON.stringify(f));
for(const r of a){if(r.verdict!=='ok'||want.has(r.id)){const x=by.get(r.id);console.log('## #'+r.id+' ['+r.verdict+'] '+(r.categories||[]).join(',')+' '+x.path+' A='+x.answer+(x.variants&&x.variants.length?' V='+x.variants.join('|'):'')+'\n Q: '+x.question.replace(/\n/g,' ')+'\n H: '+x.hint+'\n E: '+(x.explanation||'')+'\n alone: '+r.hintAlone+'\n reason: '+r.reason+'\n prop: '+(r.proposal&&r.proposal.hint||'-')+'\n')}}
