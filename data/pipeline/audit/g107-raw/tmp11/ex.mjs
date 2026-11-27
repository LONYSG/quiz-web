let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=Object.values(JSON.parse(s).query.pages)[0];console.log(p.extract||'')}catch(e){console.log('')}})
