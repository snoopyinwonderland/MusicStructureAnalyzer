import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const files=['q-p1-002-bwv772.json','q-p1-003-bwv114.json','q-p1-004-repeated-note-query.json'];
const report={createdAt:new Date().toISOString(),note:'Sequential fresh processes; OS filesystem cache not cleared. Experimental only.',cases:[]};
for(const file of files){
  const path=`evaluation/cases/${file}`,runs={};
  for(const strategy of ['baseline','windows']){
    const result=spawnSync(process.execPath,['scripts/run-query-json.mjs',path,'100'],{encoding:'utf8',env:{...process.env,MUSICANOTE_SEED_WINDOWS:strategy==='windows'?'1':'0'},timeout:180000,maxBuffer:16*1024*1024});
    if(result.status!==0)throw new Error(`${file} ${strategy}: ${result.stderr} ${result.error||''}`);
    runs[strategy]=JSON.parse(result.stdout);
    console.log(`${file} ${strategy}: ${runs[strategy].elapsedMs} ms, ${runs[strategy].count} results`);
  }
  const identity=m=>`${m.workId}:${m.startMeasure}:${m.endMeasure}`;
  const baselineIds=new Set(runs.baseline.matches.map(identity)),windowIds=new Set(runs.windows.matches.map(identity));
  report.cases.push({file,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),missing:[...baselineIds].filter(id=>!windowIds.has(id)),added:[...windowIds].filter(id=>!baselineIds.has(id)),...runs});
  writeFileSync('evaluation/runs/performance-stage-2.json',JSON.stringify(report,null,2)+'\n');
}
