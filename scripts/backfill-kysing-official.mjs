import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const metadataPath=resolve(process.argv[2]||'data/kysing-metadata/kumyoung-2026-09-03-all.json');
const xmlRoot=resolve(process.argv[3]||'U:/KYSing_MusicXML');
const outputDir=resolve(process.argv[4]||'data/kysing-metadata');
const limit=Math.max(1,Number(process.env.KYSING_BACKFILL_LIMIT)||100),delay=Math.max(750,Number(process.env.KYSING_BACKFILL_DELAY_MS)||1500);
const snapshot=JSON.parse(await readFile(metadataPath,'utf8')),known=new Set(snapshot.songs.map(song=>String(Number(song.no))));
const pending=(await readdir(xmlRoot)).filter(name=>/^\d+\.xml$/i.test(name)).map(name=>String(Number(name.replace(/\.xml$/i,'')))).filter(number=>!known.has(number)).sort((a,b)=>Number(a)-Number(b));
await mkdir(outputDir,{recursive:true});
const dataPath=resolve(outputDir,'kumyoung-official-backfill.json'),statePath=resolve(outputDir,'kumyoung-official-backfill-state.json');
const records=existsSync(dataPath)?JSON.parse(await readFile(dataPath,'utf8')):{},state=existsSync(statePath)?JSON.parse(await readFile(statePath,'utf8')):{cursor:0,totalRequests:0};
const decode=value=>String(value||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
const parse=(html,number)=>{for(const chunk of html.split('search_chart_num">').slice(1)){const no=chunk.match(/^\s*(\d+)/)?.[1];if(no!==number)continue;return{brand:'kumyoung',no,title:decode(chunk.match(/<span title="([^"]*)"\s+class="tit">/)?.[1]),singer:decode(chunk.match(/<span title="([^"]*)"\s+class="tit mo-art">/)?.[1]),source:'https://kysing.kr/search/',verifiedAt:new Date().toISOString()}}return null};
const save=async()=>{await writeFile(dataPath,JSON.stringify(records),'utf8');await writeFile(statePath,JSON.stringify({...state,pending:pending.length,updatedAt:new Date().toISOString()},null,2),'utf8')};
let attempted=0,found=0;
for(;state.cursor<pending.length&&attempted<limit;state.cursor++,attempted++){
 const number=pending[state.cursor],url=`https://kysing.kr/search/?category=1&keyword=${encodeURIComponent(number)}`;
 try{const response=await fetch(url,{headers:{accept:'text/html','accept-language':'ko','user-agent':'MUSICANOTE metadata verifier/1.0'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const item=parse(await response.text(),number);if(item){records[number]=item;found++}}
 catch(error){state.lastError={number,message:error.message,at:new Date().toISOString()}}
 state.totalRequests++;if(attempted%10===9)await save();if(state.cursor+1<pending.length&&attempted+1<limit)await new Promise(resolve=>setTimeout(resolve,delay));
}
await save();console.log(JSON.stringify({attempted,found,cursor:state.cursor,pending:pending.length,totalCollected:Object.keys(records).length,dataPath,statePath},null,2));
