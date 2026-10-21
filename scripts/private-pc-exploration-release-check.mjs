/** Post-build exploration gate. Writes evidence only: no build, process, DB, migration or network. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,stat,mkdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url))),PROFILE=path.join(ROOT,'work/private-pc'),CHECKS=path.join(PROFILE,'exploration-20261017');
const sha=value=>createHash('sha256').update(value).digest('hex'),slash=value=>value.replaceAll('\\','/');
const DATABASE_ID='8b7617dc-1530-4fc4-91d7-56ac105106bc',FACTORY='0b712695de5cf610b8bd8309aa5582423fc8be1800904a9f50cc4403de901deb';
const ROLLBACK='work/private-pc/runtime/2026-10-18T01-17-02-644Z-35af0611';
const FIRST_FEATURE='work/private-pc/runtime/2026-10-18T01-42-48-648Z-a33edb00',FIRST_GATE='work/private-pc/exploration-20261017/release-gate-1792287714878.json';
const FIRST_BUILD='5e82b565d4d1ec9f489af8774884e97db1498968c9dc3384efba96af88a563ce';
const QUICK_FIX='work/private-pc/runtime/2026-10-18T01-48-28-933Z-95170249',QUICK_GATE='work/private-pc/exploration-20261017/release-gate-1792287968156.json';
const QUICK_BUILD='1efa74c8c51f76b8af1bd51039f6b2f039f58651bbfb9b8576764bb138a8afb3';
const WORLD_TRAVEL='work/private-pc/runtime/2026-10-18T03-23-36-261Z-50d63bc8',WORLD_GATE='work/private-pc/exploration-20261017/release-gate-1792293781856.json';
const WORLD_BUILD='9f9bada1ad5ca859af4c5e3d300c6351460eccfa7615f3c3ec58229d5b414874';
const WORLD_FINAL='work/private-pc/runtime/2026-10-18T03-46-20-973Z-a7bcd1b7',WORLD_FINAL_GATE='work/private-pc/exploration-20261017/release-gate-1792295155343.json';
const WORLD_FINAL_BUILD='98c4f6ebc7b18ec58e2eae81273de20bb764c525370a36f94c44c337999ef10d';
const PINS={
  'work/private-pc/camera-source-baseline-1792283327526.json':'10cec88469f011da89d497f350263d815605fc193c5b0a7ff83e3a7ae2734f8d',
  'work/private-pc/camera-release-gate-1792286197640.json':'58b7a826bad00b13cd59f5a13802e8e2a82e564eac2060162fd725765f0e916f',
  'work/projection-expiry-final-summary.json':'7f2c90c76fbcc2da5ce5a89106c0d3017087a0b23cf4637c75fc035e2791d3e8',
  [`${ROLLBACK}/manifest.json`]:'221b25c3cca9971b064f99c9c0f35ff0fe1ded911b9161ec1276e183bce32589',
  [FIRST_GATE]:'f23b0529bc15197f25fdd8f2755b00343aaa0eaaca40979d5483fe3bc0823895',
  [`${FIRST_FEATURE}/manifest.json`]:'40e23f42adb0fc685af6b693e9087d9156bb3af41fed79e1ff7d82f36d87b424',
  [QUICK_GATE]:'6c6cc4348544ee2d1de0e58c8eb4998ca1287a1f4e3aaddb0bff53a8746519f7',
  [`${QUICK_FIX}/manifest.json`]:'11d48a44e0fb0af417f8d3e77b205b288111f7080a4225877e994c583f59b7c2',
  [WORLD_GATE]:'c57db0780f33e922a9cf5a888c85b83f679699684898d714ecf472511e32e7e8',
  [`${WORLD_TRAVEL}/manifest.json`]:'2f0036bd5fa0deaebc131d6266ea1d69d48ae6ffb484a657898e2f4f50d4a12c',
  [WORLD_FINAL_GATE]:'9709ca5d855b3a76d39c8e9800d5d83f5147ac20b8cac449c3e140a9bfe54a34',
  [`${WORLD_FINAL}/manifest.json`]:'8ec0abefe61f6989e741e1befa558327a7aecc04fbbe4ce5f9c47a8f34d25ac4',
};
const CHANGED=new Set(['lib/mvp/habitable-data.ts','lib/mvp/habitable.ts','lib/mvp/exploration-data.ts','lib/mvp/exploration.ts','lib/mvp/engine.ts','lib/mvp/types.ts','lib/client/quick-command.ts','lib/graphics/world-terrain-renderer.ts','lib/graphics/habitable-district.ts','lib/graphics/exploration-district.ts','app/graphics/habitable-scene.tsx','app/habitable-client.tsx','app/mvp-client.tsx','app/exploration-panel.tsx','app/exploration.css']);
const ADDED=new Set(['lib/mvp/exploration-data.ts','lib/mvp/exploration.ts','lib/client/quick-command.ts','lib/graphics/exploration-district.ts','app/exploration-panel.tsx','app/exploration.css']);
// Additive world travel and physical support share the existing authority and renderer.
for(const name of ['app/graphics/habitable-scene.css','lib/graphics/living-zone.ts','lib/graphics/inhabited-world.ts','lib/graphics/fishing-community.ts','lib/graphics/habitable-commerce.ts','lib/graphics/district-navigation.ts'])CHANGED.add(name);
for(const name of ['lib/mvp/exploration-network.ts','lib/mvp/exploration-network-data.ts','lib/mvp/exploration-network.generated.json','lib/graphics/kinematic-physics.ts','lib/graphics/world-collision.ts','lib/graphics/world-scenery-clearance.ts','lib/graphics/terrain-surface.ts','lib/graphics/terrain-ramps.ts','lib/graphics/exploration-transport.ts','lib/graphics/exploration-infrastructure.ts','app/ensayos/viajes/page.tsx','app/ensayos/viajes/travel-physics-lab.tsx']){CHANGED.add(name);ADDED.add(name);}
for(const name of ['lib/graphics/public-station-layout.ts','lib/graphics/public-station-bounds.json']){CHANGED.add(name);ADDED.add(name);}
CHANGED.add('lib/mvp/exploration-vessel.ts');ADDED.add('lib/mvp/exploration-vessel.ts');
CHANGED.add('lib/graphics/habitable-workers.ts');
// Keep existing landmark meshes and solid footprints on the same voxel data.
for(const name of ['lib/graphics/world-models.ts','lib/graphics/models.ts'])CHANGED.add(name);
for(const name of ['lib/graphics/landmark-model-data.ts','lib/graphics/world-landmark-geometry.ts']){CHANGED.add(name);ADDED.add(name);}
// Bounded manual leases and terrestrial traffic remain on the original authority.
CHANGED.add('lib/client/district-controls.ts');
for(const name of ['lib/mvp/manual-navigation.ts','lib/mvp/exploration-timing.ts','lib/mvp/exploration-traffic.ts','lib/graphics/exploration-traffic-layer.ts']){CHANGED.add(name);ADDED.add(name);}
const protectedSource=name=>/^(?:db|drizzle|public|vendor)\//.test(name)||/^app\/api\//.test(name)||/^lib\/auth\//.test(name)||['wrangler.jsonc','build/cloudflare-worker.ts','lib/mvp/store.ts','lib/mvp/http.ts','package-lock.json','app/chatgpt-auth.ts','app/game-page.tsx'].includes(name);
function validName(name){return typeof name==='string'&&name!==''&&!path.isAbsolute(name)&&!name.includes('\\')&&name.split('/').every(piece=>piece!=='.'&&piece!=='..'&&piece!=='');}

/** Pure allowlist audit: source deletions and all protected changes always fail. */
export function compareExplorationReleaseSources(expected,current){
  const before=new Map(),after=new Map();for(const [rows,map]of[[expected,before],[current,after]])for(const row of rows){assert.ok(validName(row.path),'Invalid source manifest path.');assert.ok(!map.has(row.path),'Duplicate source manifest path.');assert.match(row.sha256,/^[a-f0-9]{64}$/);map.set(row.path,row.sha256);}
  const changes=[],additions=[];
  for(const[name,hash]of before)if(after.get(name)!==hash)changes.push({path:name,beforeSha256:hash,afterSha256:after.get(name)??null,protected:protectedSource(name),allowed:after.has(name)&&!protectedSource(name)&&CHANGED.has(name)});
  for(const[name,hash]of after)if(!before.has(name))additions.push({path:name,sha256:hash,protected:protectedSource(name),allowed:!protectedSource(name)&&ADDED.has(name)});
  return{allPassed:changes.every(row=>row.allowed)&&additions.every(row=>row.allowed),changes,additions,protectedSourceCount:[...before.keys()].filter(protectedSource).length};
}
export function qualifiesExplorationBuild(record){return record?.check==='build'&&record.finished===true&&record.code===0&&record.signal===null&&Array.isArray(record.command)&&record.command.at(-1)==='build'&&record.command.some(value=>typeof value==='string'&&slash(value).endsWith('vinext/dist/cli.js'))&&Number.isFinite(Date.parse(record.startedAt))&&Number.isFinite(Date.parse(record.finishedAt))&&Date.parse(record.finishedAt)>=Date.parse(record.startedAt)&&/^[a-f0-9]{64}$/.test(record.logSha256??'');}
export function qualifiesPinnedExplorationRuntime(release,buildSha256){return release===ROLLBACK&&buildSha256==='f435813476378faf3be25f775ee0c6938d787f1de4e62aaa7e9da3832ab5dabb'||release===FIRST_FEATURE&&buildSha256===FIRST_BUILD||release===QUICK_FIX&&buildSha256===QUICK_BUILD||release===WORLD_TRAVEL&&buildSha256===WORLD_BUILD||release===WORLD_FINAL&&buildSha256===WORLD_FINAL_BUILD;}
async function json(name){return JSON.parse(await readFile(name,'utf8'));}
async function pinned(name){const bytes=await readFile(path.join(ROOT,name));assert.equal(sha(bytes),PINS[name],`Pinned provenance changed: ${name}`);return JSON.parse(bytes);}
function inside(base,target){const rel=path.relative(base,target);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${path.sep}`);}
async function ordinary(base,name){assert.ok(validName(name),'Invalid relative file.');const full=path.join(base,name),actual=await realpath(full);assert.equal(actual.toLowerCase(),path.resolve(full).toLowerCase(),'Linked files are not accepted.');assert.ok((await stat(full)).isFile(),'Expected ordinary file.');return full;}
async function list(base,relative=''){
  const rows=[];for(const entry of(await readdir(path.join(base,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){assert.ok(!entry.isSymbolicLink(),'Linked source/build entries are forbidden.');const name=slash(path.join(relative,entry.name));if(entry.isDirectory())rows.push(...await list(base,name));else if(entry.isFile())rows.push(name);}return rows;
}
async function fingerprints(base,names){const rows=[];for(const name of names){const file=await ordinary(base,name),bytes=await readFile(file);rows.push({path:name,bytes:bytes.length,sha256:sha(bytes)});}return rows;}

export async function checkPrivatePcExplorationRelease(){
  const baseline=await pinned('work/private-pc/camera-source-baseline-1792283327526.json'),camera=await pinned('work/private-pc/camera-release-gate-1792286197640.json'),summary=await pinned('work/projection-expiry-final-summary.json'),rollback=await pinned(`${ROLLBACK}/manifest.json`);
  assert.ok(baseline.currentDistByteIdenticalToActiveRuntime&&baseline.backendMatchesVerifiedStudySource&&baseline.legacyFactoryMatchesExpected&&baseline.candidateBackendStillNotActivated,'Unqualified original source provenance.');
  assert.ok(camera.allPassed&&camera.factoryExact&&camera.localProfileUnchanged&&camera.buildSha256===rollback.buildSha256,'Unqualified camera release provenance.');
  assert.equal(rollback.buildSha256,'f435813476378faf3be25f775ee0c6938d787f1de4e62aaa7e9da3832ab5dabb');
  const active=await json(path.join(PROFILE,'active-runtime.json')),activeRelease=slash(path.relative(ROOT,path.resolve(active.release)));
  assert.ok([ROLLBACK,FIRST_FEATURE,QUICK_FIX,WORLD_TRAVEL,WORLD_FINAL].includes(activeRelease),'The active runtime is not one of the five explicitly approved versions.');
  const activeManifest=activeRelease===ROLLBACK?rollback:await pinned(`${activeRelease}/manifest.json`);
  assert.equal(path.resolve(active.manifest),path.join(ROOT,activeRelease,'manifest.json'),'Active manifest path differs from its qualified release.');
  assert.ok(qualifiesPinnedExplorationRuntime(activeRelease,activeManifest.buildSha256),'Unapproved active release/build pair.');
  if(activeRelease!==ROLLBACK){const approved=await pinned(activeRelease===FIRST_FEATURE?FIRST_GATE:activeRelease===QUICK_FIX?QUICK_GATE:activeRelease===WORLD_TRAVEL?WORLD_GATE:WORLD_FINAL_GATE);assert.ok(approved.allPassed&&approved.approvedToPreparePrivateProfile&&Object.values(approved.checks).every(Boolean)&&approved.buildSha256===activeManifest.buildSha256,'The exploration release was not qualified by its pinned gate.');assert.equal(approved.compiled.length,activeManifest.files.length);const approvedFiles=new Map(approved.compiled.map(row=>[row.path,row]));assert.ok(activeManifest.files.every(row=>approvedFiles.get(row.path)?.sha256===row.sha256&&approvedFiles.get(row.path)?.bytes===row.bytes),'Active manifest differs from its pinned exploration gate.');}
  const expected=new Map();for(const[name,value]of Object.entries(summary.source.snapshots))expected.set(name,{path:name,sha256:value.sha256});
  for(const row of baseline.nonLibraryBaselineFiles)expected.set(row.path,{path:row.path,sha256:row.expectedSha256});
  for(const row of rollback.protectedSources)expected.set(row.path,{path:row.path,sha256:row.sha256});
  const exportDir=path.resolve(ROOT,baseline.priorExportPackages[0].directory);assert.ok(inside(path.join(ROOT,'outputs'),exportDir),'Unexpected prior export directory.');
  for(const row of(await json(path.join(exportDir,'EXPORT-MANIFEST.json'))).files.filter(row=>row.path.startsWith('vendor/')))expected.set(row.path,{path:row.path,sha256:row.sha256});
  for(const row of camera.sourceChanges){assert.equal(row.allowed,true);assert.ok(expected.has(row.path));assert.equal(expected.get(row.path).sha256,row.beforeSha256);expected.set(row.path,{path:row.path,sha256:row.afterSha256});}
  for(const row of camera.sourceAdditions){assert.equal(row.allowed,true);assert.ok(!expected.has(row.path));expected.set(row.path,{path:row.path,sha256:row.sha256});}
  const current=new Map();
  for(const dir of['app','lib','components','hooks','public','db','drizzle','vendor','build'])for(const row of await fingerprints(ROOT,(await list(path.join(ROOT,dir))).map(name=>`${dir}/${name}`)))current.set(row.path,row);
  for(const name of expected.keys())if(!current.has(name)){try{const row=(await fingerprints(ROOT,[name]))[0];current.set(name,row);}catch(error){if(error.code!=='ENOENT')throw error;}}
  const sources=compareExplorationReleaseSources([...expected.values()],[...current.values()]);
  const records=(await readdir(CHECKS)).filter(name=>/^build-\d+\.json$/.test(name)).sort((a,b)=>Number(b.slice(6,-5))-Number(a.slice(6,-5)));assert.ok(records.length,'A recorded exploration build is required.');
  const recordPath=await ordinary(CHECKS,records[0]),record=await json(recordPath);assert.ok(qualifiesExplorationBuild(record),'The latest exploration build is failed, incomplete or not a full Vinext build.');
  const log=path.resolve(record.log);assert.ok(inside(CHECKS,log),'Build log must remain in the exploration checks directory.');assert.equal(await realpath(log),log);assert.equal(sha(await readFile(log)),record.logSha256,'Build log hash changed.');
  const newerSources=[];for(const name of current.keys())if((await stat(path.join(ROOT,name))).mtimeMs>Date.parse(record.startedAt))newerSources.push(name);
  const compiled=await fingerprints(path.join(ROOT,'dist'),await list(path.join(ROOT,'dist'))),manifest=await json(path.join(ROOT,'dist/server/.vite/manifest.json'));
  for(const name of['server/index.js','server/wrangler.json','server/.vite/manifest.json','server/ssr/index.js','client/_headers'])assert.ok(compiled.some(row=>row.path===name),`Incomplete build output: ${name}`);
  const signatures={leave:false,walk:false,travel:false,return:false,stop:false,firstPerson:false,thirdPerson:false};
  for(const row of compiled.filter(row=>row.path.endsWith('.js'))){const text=await readFile(path.join(ROOT,'dist',row.path),'utf8');for(const action of['leave','walk','travel','return','stop'])signatures[action] ||=text.includes(`habitat.explore.${action}`);signatures.firstPerson ||=text.includes('first-person');signatures.thirdPerson ||=text.includes('third-person');}
  const backendChunks=[];for(const name of['engine','http','cloudflare-access','app/api/mvp/route.ts','app/api/mvp/quote/route.ts']){const locate=data=>name.startsWith('app/')?data[name]?.file:Object.values(data).find(row=>row.name===name)?.file,currentFile=locate(manifest);assert.ok(currentFile&&validName(currentFile),`Missing backend build entry: ${name}`);backendChunks.push({name,file:currentFile,sha256:sha(await readFile(path.join(ROOT,'dist/server',currentFile))),byteIdentityRequired:false});}
  // The previous immutable camera runtime is rollback evidence and must never be overwritten.
  const rollbackNames=await list(path.join(ROOT,ROLLBACK,'dist')),rollbackFiles=await fingerprints(path.join(ROOT,ROLLBACK,'dist'),rollback.files.map(row=>row.path)),rollbackExact=JSON.stringify([...rollbackNames].sort())===JSON.stringify(rollback.files.map(row=>row.path).sort())&&rollbackFiles.every((row,index)=>row.sha256===rollback.files[index].sha256&&row.bytes===rollback.files[index].bytes);
  const activeNames=await list(path.join(ROOT,activeRelease,'dist')),activeFiles=await fingerprints(path.join(ROOT,activeRelease,'dist'),activeManifest.files.map(row=>row.path)),activeRuntimeExact=JSON.stringify([...activeNames].sort())===JSON.stringify(activeManifest.files.map(row=>row.path).sort())&&activeFiles.every((row,index)=>row.sha256===activeManifest.files[index].sha256&&row.bytes===activeManifest.files[index].bytes);
  const activeProtectedExact=activeManifest.protectedSources.length===rollback.protectedSources.length&&activeManifest.protectedSources.every(row=>rollback.protectedSources.some(original=>original.path===row.path&&original.sha256===row.sha256));
  const store=await readFile(path.join(ROOT,'lib/mvp/store.ts'),'utf8'),factoryAt=store.indexOf('export function getMvpStore(');
  const factoryExact=factoryAt>=0&&sha(store.slice(factoryAt))===FACTORY&&store.includes("const REALM_ID = 'frontier-pdf-mvp-v2';");
  const entryPoints=[];for(const name of['app/api/mvp/route.ts','app/api/mvp/quote/route.ts','app/game-page.tsx']){const text=await readFile(path.join(ROOT,name),'utf8');entryPoints.push({path:name,legacyFactory:text.includes('getMvpStore('),partitionedStoreImported:/partitioned-store/.test(text)});}
  const settingsBytes=await readFile(path.join(PROFILE,'settings.json')),configBytes=await readFile(path.join(PROFILE,'wrangler.local.json')),settings=JSON.parse(settingsBytes),config=JSON.parse(configBytes),db=config.d1_databases?.[0];
  const travelNetwork=await json(path.join(ROOT,'lib/mvp/exploration-network.generated.json'));
  const travelChecks=travelNetwork.checks??{},travelNodes=new Set((travelNetwork.nodes??[]).map(row=>row.id));
  const worldTravelPhysicallyValidated=travelNetwork.validated===true&&travelNetwork.version===1&&travelNetwork.destinations?.length===45&&new Set(travelNetwork.destinations.map(row=>row.id)).size===45&&travelNetwork.destinations.every(row=>travelNodes.has(row.nodeId))&&['fineStaticPassed','vehicleBodiesPassed','boatHullPassed','freshProcessValidated','all45Connected'].every(name=>travelChecks[name]===true)&&Array.isArray(travelChecks.failures)&&travelChecks.failures.length===0;
  const localProfileUnchanged=sha(JSON.stringify(settings))===activeManifest.settingsSha256&&sha(configBytes)===activeManifest.configSha256&&settings.hostname==='qfrontier.example.invalid'&&config.dev?.ip==='127.0.0.1'&&config.dev?.port===5180&&config.dev?.host===settings.hostname&&config.dev?.local_protocol==='http'&&config.dev?.upstream_protocol==='https'&&config.assets?.run_worker_first===true&&config.workers_dev===false&&config.preview_urls===false&&config.d1_databases?.length===1&&db.database_id===DATABASE_ID&&db.remote===false;
  const checks={pinnedProvenance:true,sourceAllowlist:sources.allPassed,fullLatestBuild:true,buildLogVerified:true,noSourceChangedAfterBuildStarted:newerSources.length===0,allExplorationAndCameraSignatures:Object.values(signatures).every(Boolean),worldTravelPhysicallyValidated,legacyFactoryExact:factoryExact,partitionedCandidateNotActivated:entryPoints.every(row=>row.legacyFactory&&!row.partitionedStoreImported),saveSchemaSourceStill2:/schemaVersion\s*:\s*2\b/.test(await readFile(path.join(ROOT,'lib/mvp/types.ts'),'utf8')),samePrivateProfile:localProfileUnchanged,rollbackRuntimeExact:rollbackExact,activeRuntimeQualifiedByPinnedGate:activeRuntimeExact&&activeProtectedExact};
  const allPassed=Object.values(checks).every(Boolean);
  return{formatVersion:1,createdAt:new Date().toISOString(),allPassed,approvedToPreparePrivateProfile:allPassed,checks,pinnedEvidence:PINS,originalRuntimeRelease:rollback.release,completeBuild:{status:slash(path.relative(ROOT,recordPath)),startedAt:record.startedAt,finishedAt:record.finishedAt,logSha256:record.logSha256},sourceChanges:sources.changes,sourceAdditions:sources.additions,protectedSourceCount:sources.protectedSourceCount,newerSources,backendChunks,signatures,compiledFiles:compiled.length,compiledBytes:compiled.reduce((sum,row)=>sum+row.bytes,0),buildSha256:sha(JSON.stringify(compiled)),compiled,entryPoints,factoryExact,localProfileUnchanged,saveComparisonRequired:true,note:'Engine and dependency chunks may change for this feature. Auth, HTTP/API source, deployment configuration, legacy store, schema/assets/vendor and unrelated source remain protected. This gate does not replace exact offline backup comparison before/after activation or the exploration-only QA save audit. It authorizes no original-domain deployment, provisioning, migration or partitioned-store activation.',buildExecutedByThisScript:false,runtimePrepared:false,servicesRestarted:false,databaseOpened:false,databaseWrites:0,remoteWrites:0};
}
async function main(){assert.equal(process.argv.length,2,'Usage: node scripts/private-pc-exploration-release-check.mjs');const report=await checkPrivatePcExplorationRelease();await mkdir(CHECKS,{recursive:true});const output=path.join(CHECKS,`release-gate-${Date.now()}.json`);await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});console.log(JSON.stringify({report:output,allPassed:report.allPassed,approvedToPreparePrivateProfile:report.approvedToPreparePrivateProfile,checks:report.checks,sourceChanges:report.sourceChanges.map(row=>({path:row.path,allowed:row.allowed})),unexpectedAdditions:report.sourceAdditions.filter(row=>!row.allowed).map(row=>row.path),newerSources:report.newerSources,databaseOpened:false,remoteWrites:0},null,2));if(!report.allPassed)process.exitCode=1;}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.log(JSON.stringify({allPassed:false,databaseOpened:false,databaseWrites:0,remoteWrites:0,error:error instanceof Error?error.message:'Release gate failed.'}));process.exitCode=1;});
