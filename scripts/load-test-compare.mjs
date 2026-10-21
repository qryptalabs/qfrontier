import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const sum=(values,key)=>values.reduce((n,value)=>n+(value[key]??0),0);
const hash=text=>createHash('sha256').update(text).digest('hex');
const latencies=group=>!group?null:{all:group.latencyMs,successful:group.latencyByStatusMs?.['200']??(Object.keys(group.statuses).length===1&&group.statuses['200']?group.latencyMs:null),note:group.latencyByStatusMs?'Status-specific samples recorded.':'Version1 did not retain status-specific samples; mixed successful latency is unavailable.'};

function extract(report){
  const m=report.phases.mixed,s=Object.values(m.server),c=Object.values(m.client),confirm=m.server['/command'];
  return{setupMs:report.setup.elapsedMs,setupStateBytes:report.setup.stateBytes,burst:{elapsedMs:report.phases.readBurst.elapsedMs,ok:report.phases.readBurst.ok,client:latencies(report.phases.readBurst.client['/view']),server:latencies(report.phases.readBurst.server['/view'])},mixed:{configuredWindowMs:m.configuredWindowMs,elapsedIncludingDrainMs:m.elapsedMs,achievedClosedLoopRequestsPerSecond:m.requestsPerSecond,clientRequests:c.reduce((n,g)=>n+g.latencyMs.count,0),serverRequests:s.reduce((n,g)=>n+g.latencyMs.count,0),clientTransportFailures:c.reduce((n,g)=>n+(g.statuses['0']??0),0),censoredTimeouts:report.formatVersion>=2?sum(c,'censoredTimeouts'):null,acceptedCommands:confirm?.statuses['200']??0,rejected409Commands:confirm?.statuses['409']??0,rejected409Rate:confirm?.latencyMs.count?(confirm.statuses['409']??0)/confirm.latencyMs.count:null,acceptedCommandsPerSecond:(confirm?.statuses['200']??0)/(m.elapsedMs/1000),viewLatency:{client:latencies(m.client['/view']),server:latencies(m.server['/view'])},confirmationLatency:{client:latencies(m.client['/command']),server:latencies(m.server['/command'])},cpuMs:m.processCpuMs,sqlExecutionMs:m.database.sqlite?.sqlMilliseconds??m.database.read.sqlMs+m.database.cas.sqlMs+m.database.insert.sqlMs,storeReads:m.database.read.calls,playerViewReads:m.database.readPlayerView?.calls??0,playerViewProjections:m.database.projectPlayerView?.calls??0,villageReadAttempts:m.database.readVillage?.calls??0,villageReadFallbacks:m.database.readVillage?.fallbacks??0,villageViewProjections:m.database.projectVillageView?.calls??0,villageCommitAttempts:m.database.commitVillage?.calls??0,villageCommitConflicts:m.database.commitVillage?.conflicts??0,villageCommitCommits:m.database.commitVillage?.committed??0,maintenanceReadAttempts:m.database.readVillageMaintenance?.calls??0,maintenanceReadFallbacks:m.database.readVillageMaintenance?.fallbacks??0,maintenanceReadRetries:m.database.readVillageMaintenance?.retries??0,maintenanceCommitAttempts:m.database.commitVillageMaintenance?.calls??0,maintenanceCommitConflicts:m.database.commitVillageMaintenance?.conflicts??0,maintenanceCommitCommits:m.database.commitVillageMaintenance?.committed??0,requestStoreDiagnostics:Object.fromEntries(Object.entries(m.server).map(([endpoint,group])=>[endpoint,group.storeRequests??null])),sqlReturnedRows:s.some(g=>g.sqlReturnedRows!==undefined)?sum(s,'sqlReturnedRows'):null,sqlReturnedCellBytes:s.some(g=>g.sqlReturnedCellBytes!==undefined)?sum(s,'sqlReturnedCellBytes'):null,casAttempts:m.database.cas.calls,casConflicts:m.database.cas.conflicts,casCommits:m.database.cas.committed,villageCasAttempts:m.database.villageCas?.calls??0,villageCasConflicts:m.database.villageCas?.conflicts??0,villageCasCommits:m.database.villageCas?.committed??0,allWriteAttempts:m.database.cas.calls+(m.database.villageCas?.calls??0)+(m.database.commitVillage?.calls??0)+(m.database.commitVillageMaintenance?.calls??0),allWriteConflicts:m.database.cas.conflicts+(m.database.villageCas?.conflicts??0)+(m.database.commitVillage?.conflicts??0)+(m.database.commitVillageMaintenance?.conflicts??0),allWriteCommits:m.database.cas.committed+(m.database.villageCas?.committed??0)+(m.database.commitVillage?.committed??0)+(m.database.commitVillageMaintenance?.committed??0),memory:m.memory??null,generatedJsonBodyBytes:sum(s,'responseBodyBytes'),receivedJsonBodyBytes:sum(c,'responseBodyBytes'),receivedRequestJsonBodyBytes:report.formatVersion>=2?sum(s,'requestBodyBytes'):null},integrity:{checks:report.integrity.checks.length,players:report.integrity.players,jobs:report.integrity.jobs,receipts:report.integrity.receipts,finalStateBytes:report.integrity.stateBytes},storageShape:report.storageShape??{rows:1,maxStateTextBytes:report.integrity.stateBytes}};
}

/** Never describe a changed engine as a storage-layout-only comparison. */
export function compareLoadReports(baseline,candidate,{allowEngineChange=false}={}){
  const sameEngineSource=baseline.sourceLibSha256===candidate.sourceLibSha256;
  assert.ok(sameEngineSource||allowEngineChange,'Different engine source requires --allow-engine-change true; it is not a layout-only comparison.');
  if(!sameEngineSource)assert.ok(candidate.engineIdentity?.mode==='candidate'&&candidate.engineIdentity.label,'Changed-engine report must explicitly identify an unpublished candidate.');
  assert.deepEqual(baseline.config,candidate.config,'Different scenario settings.');
  const sameSetupStateByteCount=baseline.setup.stateBytes===candidate.setup.stateBytes;
  if(sameEngineSource)assert.equal(sameSetupStateByteCount,true,'Same-engine setup state sizes differ.');
  assert.equal(baseline.integrity?.passed,true);assert.equal(candidate.integrity?.passed,true);
  if(candidate.formatVersion>=6&&candidate.storeCapabilities?.requestedVillageReads){assert.equal(candidate.indexIntegrity?.passed,true,'The candidate village index must pass its independent post-drain coverage gate.');assert.equal(candidate.benchmarkPassed,true,'A candidate with a failed benchmark cannot be approved by economic conservation alone.');}
  return{createdAt:new Date().toISOString(),comparisonMode:sameEngineSource?'storage-layout':'candidate-engine',sameEngineSource,sameScenarioSettings:true,sameSetupStateByteCount,engineIdentities:{baseline:{release:baseline.release,sourceLibSha256:baseline.sourceLibSha256,...baseline.engineIdentity},candidate:{release:candidate.release,sourceLibSha256:candidate.sourceLibSha256,...candidate.engineIdentity}},baseline:extract(baseline),partitioned:extract(candidate),conclusions:[
    'Both local runs preserved the tested economic and idempotency invariants. This is correctness evidence, not a concurrent-user capacity certificate.',
    sameEngineSource?'The same engine and scenario ran against different storage layouts.':'The candidate changes engine/read/version semantics as well as storage behavior; observed differences cannot be attributed solely to a storage layout.',
    'The 100-starter scenario did not reach the original 2 MB row limit. Large-record correctness requires the separately identified adapter tests.',
    'Compare accepted commands, HTTP status-specific latency and transport failures together. A rejected or timed-out request is not a completed game action.',
    'Each version has one closed-loop run. Slow responses change the realized request sequence, so achieved throughput alone does not establish an improvement or maximum capacity.',
    'CPU covers the co-located generator/server process, including JSON and GC. Local SQLite execution time is not hosted D1 latency.',
    'Missing measurements remain null. FormatVersion1 has no memory, mixed success-specific latency or received request-byte samples.',
    'No Cloudflare, Access, browser GPU or mature-village/parallel-manager/combat workload was exercised. No 100/500/3000/2 million production capacity is established.'
  ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),positional=args.filter((_,i)=>!args[i].startsWith('--')&&(i===0||!args[i-1].startsWith('--'))),flag=args.indexOf('--allow-engine-change');
  const [baselinePath='work/scalability-load-baseline.json',candidatePath='work/scalability-load-partitioned.json',out='work/scalability-load-comparison.json']=positional;
  const [baselineText,candidateText]=await Promise.all([readFile(baselinePath,'utf8'),readFile(candidatePath,'utf8')]);
  const result=compareLoadReports(JSON.parse(baselineText),JSON.parse(candidateText),{allowEngineChange:flag>=0&&args[flag+1]==='true'});
  result.files={baseline:{path:baselinePath,sha256:hash(baselineText)},partitioned:{path:candidatePath,sha256:hash(candidateText)}};
  await writeFile(out,`${JSON.stringify(result,null,2)}\n`,{flag:'wx'});
  console.log(JSON.stringify({out,comparisonMode:result.comparisonMode,sameEngine:result.sameEngineSource,baseline409Rate:result.baseline.mixed.rejected409Rate,partitioned409Rate:result.partitioned.mixed.rejected409Rate,baselineRps:result.baseline.mixed.achievedClosedLoopRequestsPerSecond,partitionedRps:result.partitioned.mixed.achievedClosedLoopRequestsPerSecond}));
}
