import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,isAbsolute,relative,resolve} from 'node:path';
import {run} from 'node:test';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const entityVersioning=process.env.QFRONTIER_TEST_ENTITY_VERSIONS==='1';
const villageWrites=process.env.QFRONTIER_TEST_VILLAGE_WRITES==='1';
const villageReads=process.env.QFRONTIER_TEST_VILLAGE_READS==='1';
assert.ok(!villageReads||villageWrites&&entityVersioning,'Bounded mode requires versioned village writes.');
assert.ok(!villageWrites||entityVersioning,'Village regression mode requires entity versions.');
const testExecutionContract=process.env.QFRONTIER_TEST_CONTRACT??'original-assertions';
assert.ok(['original-assertions','village-ids-v1'].includes(testExecutionContract));
assert.ok(testExecutionContract==='original-assertions'||villageWrites);
const value=key=>{const index=args.indexOf(key);return index>=0?args[index+1]:undefined;};
const baseline=resolve(value('--baseline-dir')??resolve(root,'../qa-baselines/scalability-source'));
const selected=value('--file'),baselineFiles=readdirSync(resolve(baseline,'tests')).filter(name=>name.endsWith('.test.ts')).sort();
const names=selected?[basename(selected)]:baselineFiles;
for(const name of names)assert.ok(baselineFiles.includes(name),'Run only tests present in the frozen 698-case baseline.');
const files=names.map(name=>resolve(root,'tests',name));for(const file of files)assert.ok(existsSync(file));
const full=selected===undefined;
const requireSql=full||args.includes('--require-sql');
const minimumSqlEngineFiles=full?30:requireSql?1:0;
if(full)assert.equal(files.length,83,'The baseline file list changed. Review the suite boundary explicitly.');
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const name of baselineFiles)assert.equal(digest(resolve(root,'tests',name)),digest(resolve(baseline,'tests',name)),`Existing regression test changed from the frozen baseline: ${name}`);
const baselineFixture=resolve(baseline,'tests/fixtures/manager-operator.ts');
assert.equal(digest(resolve(root,'tests/fixtures/manager-operator.ts')),digest(baselineFixture),'The shared operator fixture changed from the frozen baseline.');
const runId=`scalability-review-sql-run-${Date.now()}`,reportFolder=resolve(root,'work',runId);
assert.ok(!isAbsolute(relative(root,reportFolder))&&!relative(root,reportFolder).startsWith('..'));
mkdirSync(reportFolder,{recursive:true});process.env.QFRONTIER_SQL_TEST_REPORT_DIR=reportFolder;
const hash=digest;
const testedHashes=Object.fromEntries(files.map(file=>[relative(root,file).replaceAll('\\','/'),hash(file)]));
const libraryPaths=[];
function collectLibrary(directory,prefix){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=`${prefix}/${entry.name}`,absolute=resolve(directory,entry.name);if(entry.isDirectory())collectLibrary(absolute,path);else if(entry.isFile())libraryPaths.push(path);else throw new Error(`Unexpected library source link: ${path}`);}}
collectLibrary(resolve(root,'lib'),'lib');
const sourcePaths=[...libraryPaths.sort(),'tests/support/d1-sqlite.ts','db/partitioned-world.sql','db/player-read-model.sql','scripts/test-partitioned-preload.mjs','scripts/test-partitioned-store.mjs',...(villageWrites?['db/village-writes.sql']:[]),...(villageReads?['db/bounded-village-reads.sql']:[]),...(testExecutionContract==='village-ids-v1'?['scripts/reviewed-village-id-contract.json']:[])];
const sourceHashes=Object.fromEntries(sourcePaths.map(path=>[path,hash(resolve(root,path))]));
const cases=[],failures=[],messages=[];let summary;
console.log(JSON.stringify({started:true,full,files:files.length,baseline,reportFolder,localOnly:true,cloudflareConnections:0,entityVersioning,villageWrites,villageReads,testExecutionContract,playerReads:villageReads,maxBatchStatements:entityVersioning?900:40,requireSql,minimumSqlEngineFiles}));
const stream=run({files,isolation:'process',concurrency:Number(value('--concurrency')??2),execArgv:['--experimental-strip-types','--import',pathToFileURL(resolve(root,'scripts/test-partitioned-preload.mjs')).href]});
for await(const event of stream){
  const data=event.data;
  if(event.type==='test:pass'||event.type==='test:fail'){
    if(data.file&&files.includes(resolve(data.file))&&data.details?.type!=='suite'){
      const entry={name:data.name,file:relative(root,data.file).replaceAll('\\','/'),line:data.line,passed:event.type==='test:pass',skipped:!!data.skip,todo:!!data.todo};cases.push(entry);
      if(!entry.passed){const cause=data.details?.error?.cause??data.details?.error;failures.push({...entry,error:cause?.message??String(cause),stack:cause?.stack});console.error(JSON.stringify(failures.at(-1)));}
    }
  }else if(event.type==='test:summary'&&!data.file)summary=data;
  else if(event.type==='test:stderr'&&data.message&&!data.message.includes('ExperimentalWarning'))messages.push({file:data.file,message:data.message});
}
const usage=readdirSync(reportFolder).filter(name=>name.endsWith('.test.ts.json')).map(name=>JSON.parse(readFileSync(resolve(reportFolder,name),'utf8')));
const byFile=usage.map(row=>({file:relative(root,row.testFile).replaceAll('\\','/'),cases:cases.filter(test=>resolve(root,test.file)===row.testFile).length,legacyFaultSuite:row.legacyFaultSuite,entityVersioning:row.entityVersioning,villageWrites:row.villageWrites,villageReads:row.villageReads,testExecutionContract:row.testExecutionContract,assertionsExecutedUnmodified:row.assertionsExecutedUnmodified,reviewedCaseAdaptations:row.reviewedCaseAdaptations,playerReads:row.playerReads,maxBatchStatements:row.maxBatchStatements,transformedEngine:row.transformedEngine,stores:row.stores,engineEntries:row.engineEntries,fixtureImports:row.fixtureImports,fixtureAssertionFullReads:row.fixtureAssertionFullReads??0,villageReadReasons:row.villageReadReasons??null,productionCalls:row.productionCalls,sql:row.sql}));
const changed=[];for(const[path,sha]of Object.entries(sourceHashes))if(hash(resolve(root,path))!==sha)changed.push(path);
for(const[path,sha]of Object.entries(testedHashes))if(hash(resolve(root,path))!==sha)changed.push(path);
const exercisedSql=row=>row.transformedEngine&&Object.keys(row.engineEntries).length>0&&row.stores>0&&row.sql.statements>0&&(row.productionCalls.reads>0||(row.productionCalls.villageReads??0)>0);
const engineFiles=byFile.filter(exercisedSql).length;
const productionCalls=usage.reduce((out,row)=>{for(const[key,amount]of Object.entries(row.productionCalls))out[key]=(out[key]??0)+amount;return out;},{});
const villageReadReasons={village:{},maintenance:{}};for(const row of usage)for(const operation of ['village','maintenance'])for(const[reason,count]of Object.entries(row.villageReadReasons?.[operation]??{}))villageReadReasons[operation][reason]=(villageReadReasons[operation][reason]??0)+count;
const sql=usage.reduce((out,row)=>{for(const[key,amount]of Object.entries(row.sql))out[key]=(out[key]??0)+amount;return out;},{});
const reviewedCaseAdaptations=usage.flatMap(row=>row.reviewedCaseAdaptations??[]),expectedAdaptations=testExecutionContract==='village-ids-v1'&&names.includes('mvp-test-boosts.test.ts')?2:0;
const coverageChecks={frozenRegressionSourcesUnchanged:true,allFilesHaveUsageReport:usage.length===files.length,sourceFrozen:changed.length===0,requestedMetadataMode:usage.every(row=>row.entityVersioning===entityVersioning&&row.villageWrites===villageWrites&&row.villageReads===villageReads&&row.testExecutionContract===testExecutionContract&&row.playerReads===villageReads),noTestFailures:failures.length===0,noSkippedCases:cases.every(test=>!test.skipped&&!test.todo),allEngineFilesUseRealSql:byFile.every(row=>row.legacyFaultSuite||Object.keys(row.engineEntries).length===0||exercisedSql(row)),minimumSqlEngineCoverage:engineFiles>=minimumSqlEngineFiles,productionSqlReads:!requireSql||productionCalls.reads+(productionCalls.villageReads??0)>0,productionSqlCompareAndSwaps:!requireSql||productionCalls.compareAndSwaps+(productionCalls.villageCompareAndSwaps??0)+(productionCalls.villageCommits??0)>0,productionSqlConfirmedWrites:!requireSql||productionCalls.confirmed>0,productionSqlVillageWrites:!villageWrites||!requireSql||productionCalls.villageCompareAndSwaps+(productionCalls.villageCommits??0)>0,productionSqlVillageConfirmed:!villageWrites||!requireSql||productionCalls.villageConfirmed+(productionCalls.villageCommitConfirmed??0)>0,productionSqlBoundedReads:!villageReads||!requireSql||(productionCalls.villageReads??0)>(productionCalls.villageReadFallbacks??0),productionSqlBoundedConfirmed:!villageReads||!requireSql||(productionCalls.villageCommitConfirmed??0)>0,baselineCaseCount:!full||cases.length===698,reviewedAssertionContract:reviewedCaseAdaptations.length===expectedAdaptations&&new Set(reviewedCaseAdaptations.map(row=>row.file+':'+row.caseName)).size===expectedAdaptations};
const result={recordedAt:new Date().toISOString(),runId,localOnly:true,cloudflareConnections:0,entityVersioning,villageWrites,villageReads,testExecutionContract,assertionsExecutedUnmodified:reviewedCaseAdaptations.length===0,reviewedCaseAdaptations,originalFilesMeaning:'All frozen physical test inputs remain unchanged. Optional reviewed mode changes only two declared identity comparisons in memory; it is not unmodified execution of those two cases.',fixtureAssertionFullReads:usage.reduce((n,row)=>n+(row.fixtureAssertionFullReads??0),0),fixtureMetadataImports:usage.reduce((n,row)=>n+(row.fixtureMetadataImports??0),0),fixtureVersionFloorMax:Math.max(0,...usage.map(row=>row.fixtureVersionFloorMax??0)),playerReads:villageReads,maxBatchStatements:entityVersioning?900:40,requireSql,minimumSqlEngineFiles,full,baseline,baselineExpectedCases:full?698:null,caseCount:cases.length,passed:cases.filter(test=>test.passed).length,failed:failures.length,allPassed:Object.values(coverageChecks).every(Boolean),coverageChecks,engineFiles,controlFiles:byFile.length-engineFiles,fixtureImports:usage.reduce((n,row)=>n+row.fixtureImports,0),fixtureImportRows:usage.reduce((n,row)=>n+row.fixtureImportRows,0),productionCalls,villageReadReasons,sql,sourceHashes,changed,byFile,cases,failures,messages,summary};
writeFileSync(resolve(reportFolder,'summary.json'),JSON.stringify(result,null,2));writeFileSync(resolve(root,value('--latest-output')??(villageReads?'work/bounded-reviewed-sql-latest.json':testExecutionContract==='village-ids-v1'?'work/village-reviewed-sql-latest.json':villageWrites?'work/village-review-sql-latest.json':'work/scalability-review-sql-latest.json')),JSON.stringify({runId,reportFolder,summary:resolve(reportFolder,'summary.json'),full,entityVersioning,villageWrites,villageReads,testExecutionContract,allPassed:result.allPassed,caseCount:result.caseCount},null,2));
console.log(JSON.stringify({...result,byFile:result.byFile.length,cases:result.cases.length,messages:result.messages.length},null,2));
if(!result.allPassed)process.exitCode=1;
