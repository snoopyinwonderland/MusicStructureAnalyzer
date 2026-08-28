import fs from 'node:fs';
import path from 'node:path';

const API='https://www.googleapis.com/youtube/v3';
const inventoryPath=process.env.MUSIC_ANALYSIS_INVENTORY||'K:/Music Analysis/output/corpus_inventory.json';
const cachePath=path.resolve('data/youtube-matches.json');
const statePath=path.resolve('data/youtube-backfill-state.json');
const maxDaily=Math.min(100,Math.max(1,Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT||100)));
const watch=process.argv.includes('--watch');
const arrangement=/\b(?:piano\s+solo|melody|violin|viola|cello|contrabass|duet|trio|quartet|string\s+orchestra|piano\s+quintet)\b/gi;
export const normalizeWorkTitle=name=>path.basename(name).replace(/\.musicxml(?:\.xml)?$|\.xml$/i,'').replace(/^\s*\d+\.?\s*/,'').replace(arrangement,' ').replace(/[,_]+/g,' ').replace(/\s+/g,' ').trim();
const keyFor=title=>normalizeWorkTitle(title).toLocaleLowerCase('en-US');
const pacificDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const load=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const api=async(endpoint,params)=>{params.set('key',process.env.YOUTUBE_API_KEY);const response=await fetch(`${API}/${endpoint}?${params}`);if(!response.ok)throw new Error(`${endpoint} ${response.status}: ${(await response.text()).slice(0,300)}`);return response.json()};
const tokens=s=>new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean));
const titleScore=(work,video)=>{const a=tokens(work),b=tokens(video.snippet.title),hit=[...a].filter(x=>b.has(x)).length/Math.max(1,a.size);const official=/official|topic|vevo|soundtrack|ost/i.test(`${video.snippet.title} ${video.snippet.channelTitle}`)?.16:0;return hit+official+Math.log10(Number(video.statistics.viewCount||0)+1)/100};

async function searchRepresentative(title){
  const query=`${title} official music`;
  const found=await api('search',new URLSearchParams({part:'snippet',q:query,type:'video',maxResults:'10',order:'viewCount',videoEmbeddable:'true',videoSyndicated:'true',safeSearch:'moderate'}));
  const ids=found.items.map(x=>x.id.videoId).filter(Boolean);if(!ids.length)return null;
  const details=await api('videos',new URLSearchParams({part:'snippet,status,statistics,contentDetails',id:ids.join(',')}));
  const eligible=details.items.filter(v=>v.status?.embeddable!==false&&v.status?.privacyStatus==='public'&&!v.contentDetails?.regionRestriction?.blocked?.includes('KR'));
  eligible.sort((a,b)=>titleScore(title,b)-titleScore(title,a));const best=eligible[0];if(!best)return null;
  return {videoId:best.id,url:`https://www.youtube.com/watch?v=${best.id}`,title:best.snippet.title,channelTitle:best.snippet.channelTitle,viewCount:Number(best.statistics.viewCount||0),embeddable:true,selectedAt:new Date().toISOString(),query};
}

async function runOnce(){
  if(!process.env.YOUTUBE_API_KEY){console.log('YOUTUBE_API_KEY is not set; no API calls were made.');return}
  const inventory=load(inventoryPath,{files:[]});const cache=load(cachePath,{schemaVersion:1,updatedAt:null,works:{}});let state=load(statePath,{pacificDate:null,searchCalls:0,cursor:0});const today=pacificDate();if(state.pacificDate!==today)state={pacificDate:today,searchCalls:0,cursor:state.cursor||0};
  const works=[...new Map(inventory.files.filter(f=>!f.duplicate_of&&!f.excluded_reason).map(f=>{const title=normalizeWorkTitle(f.relative_path);return[keyFor(title),title]})).entries()];
  let handled=0;while(state.searchCalls<maxDaily&&handled<works.length){const [key,title]=works[state.cursor%works.length];state.cursor=(state.cursor+1)%works.length;handled++;if(cache.works[key]?.videoId)continue;
    try{const match=await searchRepresentative(title);state.searchCalls++;cache.works[key]={normalizedTitle:title,...(match||{videoId:null,reason:'no-embeddable-result'}),arrangementShared:true};console.log(`${state.searchCalls}/${maxDaily} ${title}: ${match?.videoId||'no match'}`)}catch(error){console.error(`${title}: ${error.message}`);break}save(statePath,state);save(cachePath,{...cache,updatedAt:new Date().toISOString()});
  }
  save(statePath,state);save(cachePath,{...cache,updatedAt:new Date().toISOString()});console.log(`Backfill complete: ${state.searchCalls}/${maxDaily} search calls for ${today} PT.`)
}

await runOnce();
if(watch)setInterval(runOnce,30*60*1000);
