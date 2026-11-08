import fs from 'node:fs';import {save,compare,topic,UA} from './lib.mjs';
// LoL
const d=await (await fetch('https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion.json',{headers:UA})).json();
const ch=Object.values(d.data);const names=ch.map(c=>[c.name,c.id]);
save('lol-champion',ch.map(c=>c.name),{version:d.version,ids:ch.map(c=>c.id)});
const t=topic('lol-champion');
const c1=compare('lol-champion',names);console.log('lol',ch.length,JSON.stringify(c1));
// Pokemon names ko
const out=[];
for(let i=1;i<=151;i++){const j=await (await fetch(`https://pokeapi.co/api/v2/pokemon-species/${i}`,{headers:UA})).json();out.push({i,ko:j.names.find(n=>n.language.name==='ko')?.name,en:j.name,ja:j.names.find(n=>n.language.name==='ja-Hrkt')?.name});}
save('pokemon-gen1',out.map(o=>[o.ko,o.en]),{raw:out});
console.log('poke',JSON.stringify(compare('pokemon-gen1',out.map(o=>[o.ko,o.en]))));
