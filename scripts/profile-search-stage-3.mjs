import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const query='evaluation/cases/q-p1-004-repeated-note-query.json',runs={};
for(const strategy of ['baseline','windows']){
 const child=spawnSync(process.execPath,['scripts/run-query-json.mjs',query,'100'],{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,env:{...process.env,MUSICANOTE_PROFILE_SEARCH:'1',MUSICANOTE_SEED_WINDOWS:strategy==='windows'?'1':'0'}});
 if(child.status!==0)throw new Error(`${strategy}: ${child.stderr||child.error}`);
 runs[strategy]=JSON.parse(child.stdout);console.log(`${strategy}: ${runs[strategy].elapsedMs} ms`,runs[strategy].profile);
}
const report={createdAt:new Date().toISOString(),query,note:'Fresh child processes; OS filesystem cache is not cleared. Profile timers overlap candidateEvaluationMs by design.',runs};
writeFileSync('evaluation/runs/performance-stage-3-profile.json',JSON.stringify(report,null,2)+'\n');
