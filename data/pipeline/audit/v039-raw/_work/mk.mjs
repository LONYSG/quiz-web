import fs from 'node:fs';
export function mk(slug,o){
  const v={round:'V039',checkedAt:o.at||new Date().toISOString(),sources:o.sources,missing:o.missing||[],extra:o.extra||[],rename:o.rename||[],variantNotes:o.variantNotes||[],tagNotes:o.tagNotes||[],fixes:o.fixes||[],verdict:o.verdict,why:o.why};
  fs.writeFileSync(`C:/work/quiz-web/data/pipeline/audit/v039-raw/${slug}.verify.json`,JSON.stringify(v,null,1));
}
