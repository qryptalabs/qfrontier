/** Read-only comparison of two coherent, already-created private PC backups.
 * No live database, migration, remote access, import, or report file writes.
 * --allow-walk proves preservation outside movement, not command attribution:
 * receipts contain payload hashes, so observed Network evidence remains external.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,realpath,lstat,stat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const BACKUPS=join(ROOT,'work','private-pc','backups');
const REALM='frontier-pdf-mvp-v2',DATABASE_ID='8b7617dc-1530-4fc4-91d7-56ac105106bc';
const sha=value=>createHash('sha256').update(value).digest('hex');
const quote=name=>`"${name.replaceAll('"','""')}"`;
function canonical(value){
  if(value===undefined)return 'undefined';
  if(typeof value==='bigint')return JSON.stringify({sqliteInteger:value.toString()});
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(value instanceof Uint8Array)return JSON.stringify({sqliteBlob:Buffer.from(value).toString('base64')});
  if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;
  return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const same=(a,b)=>canonical(a)===canonical(b);
const digest=value=>sha(canonical(value));
function inside(parent,path){const child=relative(parent,path);return child!==''&&!isAbsolute(child)&&child!=='..'&&!child.startsWith(`..${sep}`);}
async function checkedFile(path){
  const value=resolve(path),actual=await realpath(value),base=await realpath(BACKUPS),info=await lstat(value);
  assert.ok(inside(BACKUPS,value)&&inside(base,actual),'Only existing files inside work/private-pc/backups may be inspected.');
  assert.equal(actual.toLowerCase(),value.toLowerCase(),'Symlinks and junction targets are not accepted.');
  assert.ok(info.isFile()&&!info.isSymbolicLink(),'A backup must be an ordinary file.');return value;
}
function tableManifest(db){return Object.fromEntries(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name,sql})=>{
  const statement=db.prepare(`SELECT * FROM ${quote(name)}`);statement.setReadBigInts(true);const rows=[...statement.iterate()].map(canonical).sort();
  return[name,{rows:rows.length,schemaSha256:sha(sql??''),rowsSha256:sha(canonical(rows))}];
}));}
function collection(value){assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'An authoritative collection is missing.');return{count:Object.keys(value).length,sha256:digest(value)};}
function withoutWalking(world){const copy=structuredClone(world);delete copy.receipts;for(const player of Object.values(copy.players)){if(player.habitable){delete player.habitable.position;delete player.habitable.movement;}}return copy;}
function validPoint(value){return!!value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&Object.keys(value).every(key=>key==='x'||key==='y');}
function validMovement(value){return value===undefined||!!value&&Number.isFinite(value.startsAt)&&Number.isFinite(value.endsAt)&&value.endsAt>value.startsAt&&Array.isArray(value.points)&&value.points.length>=2&&value.points.every(validPoint)&&Object.keys(value).every(key=>['points','startsAt','endsAt'].includes(key));}
function profileSummary(world){
  const players=Object.values(world.players),inventory=players.flatMap(player=>player.inventory??[]),habitable=players.flatMap(player=>player.habitable?.buildings??[]);
  const protectedProfiles=players.map(player=>{const copy=structuredClone(player);if(copy.habitable){delete copy.habitable.position;delete copy.habitable.movement;}return copy;});
  return{profiles:players.length,owners:new Set(players.map(player=>player.ownerId)).size,identitySha256:digest(players.map(player=>[player.id,player.ownerId]).sort()),inventoryLots:inventory.length,inventorySha256:digest(players.map(player=>[player.id,player.inventory])),stationBuildingsSha256:digest(players.map(player=>[player.id,player.buildings])),habitableBuildingCount:habitable.length,habitableBuildingsSha256:digest(players.map(player=>[player.id,player.habitable?.buildings??[]])),protectedProfilesSha256:digest(protectedProfiles),progressionInputsSha256:digest({profiles:protectedProfiles,jobs:world.jobs,social:world.social})};
}
function summary(value){return{type:value===undefined?'absent':Array.isArray(value)?'array':value===null?'null':typeof value,...(value&&typeof value==='object'?{entries:Object.keys(value).length}:{}),sha256:digest(value)};}
function publicPath(parts){return'/'+parts.map((part,index)=>{const parent=parts[index-1];return parent&&['players','jobs','receipts','convoys','battles'].includes(parent)?`id-${sha(part).slice(0,12)}`:part.replaceAll('~','~0').replaceAll('/','~1');}).join('/');}
function changedPaths(before,after){
  const changes=[];
  function visit(a,b,path){if(same(a,b))return;const objects=a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b),limit=path[0]==='players'?4:2;
    if(objects&&path.length<limit){for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())visit(a[key],b[key],[...path,key]);}
    else changes.push({path:publicPath(path),before:summary(a),after:summary(b)});
  }
  visit(before,after,[]);return{count:changes.length,paths:changes.slice(0,512),truncated:changes.length>512};
}
/** Exported separately for pure preservation tests. No game engine is run. */
export function compareCameraSaveStates(before,after,{allowWalk=false}={}){
  const beforePlayers=collection(before.players),afterPlayers=collection(after.players),oldReceipts=collection(before.receipts),newReceipts=collection(after.receipts);
  const addedReceiptIds=Object.keys(after.receipts).filter(key=>!Object.hasOwn(before.receipts,key));
  /** @type {Record<string, boolean>} */
  const checks={sameSaveSchema:before.schemaVersion===2&&after.schemaVersion===2,sameProfileIds:same(Object.keys(before.players).sort(),Object.keys(after.players).sort()),sameEntireWorld:same(before,after)};
  const beforeSummary=profileSummary(before),afterSummary=profileSummary(after);
  Object.assign(checks,{sameIdentities:beforeSummary.identitySha256===afterSummary.identitySha256,sameInventories:beforeSummary.inventorySha256===afterSummary.inventorySha256,sameStationBuildings:beforeSummary.stationBuildingsSha256===afterSummary.stationBuildingsSha256,sameHabitableBuildings:beforeSummary.habitableBuildingsSha256===afterSummary.habitableBuildingsSha256,sameProgressionInputs:beforeSummary.progressionInputsSha256===afterSummary.progressionInputsSha256,sameProtectedProfiles:beforeSummary.protectedProfilesSha256===afterSummary.protectedProfilesSha256});
  if(allowWalk){checks.onlyWalkingAndReceiptPathsChanged=same(withoutWalking(before),withoutWalking(after));checks.oldReceiptsExact=Object.entries(before.receipts).every(([key,value])=>Object.hasOwn(after.receipts,key)&&after.receipts[key]===value);checks.validNewReceiptHashes=addedReceiptIds.every(key=>typeof after.receipts[key]==='string'&&/^[a-f0-9]{64}$/.test(after.receipts[key]));checks.validWalkingFields=Object.values(after.players).every(player=>!player.habitable||validPoint(player.habitable.position)&&validMovement(player.habitable.movement));}
  const required=Object.entries(checks).filter(([key])=>key!=='sameEntireWorld'||!allowWalk);
  return{allPassed:required.every(([,passed])=>passed),allowWalk,checks,before:{...beforeSummary,players:beforePlayers,jobs:collection(before.jobs),receipts:oldReceipts},after:{...afterSummary,players:afterPlayers,jobs:collection(after.jobs),receipts:newReceipts},addedReceipts:addedReceiptIds.length,changes:changedPaths(before,after),receiptAttributionVerified:false,receiptAttributionNote:'Receipts store only payload hashes. In allow-walk mode appended hashes are permitted but are not evidence of command type; pair this preservation audit with observed UI/Network walking evidence.'};
}
async function readBackup(manifestPath){
  const path=await checkedFile(manifestPath);assert.ok(path.endsWith('.json'),'Supply a coherent backup manifest JSON.');const manifestBytes=await readFile(path),manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.formatVersion,1);assert.equal(manifest.allPassed,true);assert.equal(manifest.localOnly,true);assert.equal(manifest.remoteWrites,0);assert.equal(manifest.databaseId,DATABASE_ID);assert.equal(manifest.realm,REALM);assert.equal(manifest.checks?.pinnedSnapshot,true);assert.equal(manifest.checks?.allTablesAndRows,true);
  const destination=await checkedFile(manifest.destination);assert.ok(destination.endsWith('.sqlite'),'Manifest destination must be a SQLite backup.');const data=await readFile(destination);
  assert.equal(data.length,manifest.backupBytes,'Backup byte size differs from its manifest.');assert.equal(sha(data),manifest.backupSha256,'Backup file hash differs from its manifest.');
  const wal=await stat(`${destination}-wal`).catch(error=>{if(error.code==='ENOENT')return null;throw error;});assert.ok(!wal||wal.size===0,'A coherent backup must not depend on a nonempty WAL.');
  const db=new DatabaseSync(destination,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON');assert.equal(db.prepare('PRAGMA query_only').get().query_only,1);assert.deepEqual(db.prepare('PRAGMA quick_check').all().map(row=>Object.values(row)[0]),['ok']);
    const tables=tableManifest(db);assert.deepEqual(tables,manifest.tables,'A table, schema or row hash differs from the coherent manifest.');assert.equal(tables.world_state?.rows,1,'Only the original single-realm backup layout is supported.');
    const row=db.prepare('SELECT id,revision,state,updated_at FROM world_state WHERE id=?').get(REALM);assert.ok(row&&typeof row.state==='string');assert.equal(sha(row.state),manifest.stateSha256);assert.equal(Buffer.byteLength(row.state),manifest.stateBytes);assert.equal(row.revision,manifest.revision);assert.equal(row.updated_at,manifest.updatedAt);
    const world=JSON.parse(row.state);assert.equal(world.schemaVersion,2);assert.equal(collection(world.players).count,manifest.profiles);assert.equal(collection(world.jobs).count,manifest.jobs);assert.equal(collection(world.receipts).count,manifest.receipts);
    const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name,tbl_name").all();
    return{manifestPath:path,manifestSha256:sha(manifestBytes),destination,backupSha256:sha(data),backupBytes:data.length,manifest,world,row,tables,schemaSha256:digest(schema)};
  }finally{db.close();assert.equal(sha(await readFile(destination)),sha(data),'A backup changed during this read-only audit.');assert.equal(sha(await readFile(path)),sha(manifestBytes),'A manifest changed during this audit.');}
}
export async function comparePrivatePcCameraBackups(beforePath,afterPath,{allowWalk=false}={}){
  const before=await readBackup(beforePath),after=await readBackup(afterPath),state=compareCameraSaveStates(before.world,after.world,{allowWalk});
  const protectedTables=tables=>Object.fromEntries(Object.entries(tables).filter(([name])=>!['world_state','_cf_METADATA'].includes(name)));
  const schemaExact=before.schemaSha256===after.schemaSha256,otherTablesExact=same(protectedTables(before.tables),protectedTables(after.tables));
  const tableDifferences=[...new Set([...Object.keys(before.tables),...Object.keys(after.tables)])].sort().filter(name=>!same(before.tables[name],after.tables[name])).map(name=>({table:name,classification:name==='_cf_METADATA'?'internal-workerd-metadata':name==='world_state'?'authoritative-game-save':'protected-table',before:before.tables[name]??null,after:after.tables[name]??null}));
  const revisionDelta=after.row.revision-before.row.revision,checks={beforeManifestVerified:true,afterManifestVerified:true,backupsOpenedReadOnly:true,sqliteQuickChecks:true,schemaExact,protectedNonSaveTablesExact:otherTablesExact,sameLogicalLocalDatabase:before.manifest.databaseId===after.manifest.databaseId&&before.manifest.realm===after.manifest.realm,revisionConsistent:allowWalk?Number.isSafeInteger(revisionDelta)&&revisionDelta>=state.addedReceipts:revisionDelta===0,updatedAtConsistent:allowWalk?Number.isFinite(Date.parse(after.row.updated_at))&&Date.parse(after.row.updated_at)>=Date.parse(before.row.updated_at):after.row.updated_at===before.row.updated_at,statePreserved:state.allPassed,exactJsonWhenUnchanged:state.checks.sameEntireWorld?before.row.state===after.row.state:true};
  const reference=value=>({manifest:value.manifestPath,manifestSha256:value.manifestSha256,backupSha256:value.backupSha256,backupBytes:value.backupBytes,revision:value.row.revision,stateSha256:value.manifest.stateSha256,schemaSha256:value.schemaSha256});
  return{formatVersion:1,createdAt:new Date().toISOString(),allPassed:Object.values(checks).every(Boolean),localOnly:true,remoteConnections:0,databaseWrites:0,migrations:0,mode:allowWalk?'preserve-except-walking-fields-and-appended-receipts':'exact-release-preservation',checks,before:reference(before),after:reference(after),revisionDelta,configuration:{sameSha256:before.manifest.configSha256===after.manifest.configSha256,beforeSha256:before.manifest.configSha256,afterSha256:after.manifest.configSha256,note:'The manifest already verifies the same isolated local database ID and realm. Runtime configuration paths may change during a release; the digest difference is reported rather than treated as a game-save mutation.'},tableDifferences,internalMetadataExact:same(before.tables._cf_METADATA,after.tables._cf_METADATA),internalMetadataNote:'workerd may update _cf_METADATA while restarting. Its declared hashes are verified and every difference is shown separately; schema, migration rows, sqlite_sequence and other tables remain protected.',state,note:'This audit reads only coherent files inside the backup directory. It does not open the live PC or hosted database. Manifest digests verify consistency with declared backup hashes; they are not a signature of provenance. No capacity or visual performance claim is made.'};
}
function args(values){const out={allowWalk:false};for(let i=0;i<values.length;i++){const key=values[i];if(key==='--allow-walk'){assert.equal(out.allowWalk,false,'Duplicate --allow-walk.');out.allowWalk=true;continue;}assert.ok(key==='--before'||key==='--after','Use --before MANIFEST --after MANIFEST [--allow-walk].');assert.ok(values[i+1]&&!values[i+1].startsWith('--')&&!out[key.slice(2)],'Missing or duplicate manifest argument.');out[key.slice(2)]=resolve(values[++i]);}assert.ok(out.before&&out.after,'Both backup manifests are required.');return out;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const options=args(process.argv.slice(2)),report=await comparePrivatePcCameraBackups(options.before,options.after,options);console.log(JSON.stringify(report,null,2));if(!report.allPassed)process.exitCode=1;}catch(error){console.log(JSON.stringify({allPassed:false,localOnly:true,remoteConnections:0,databaseWrites:0,migrations:0,error:error instanceof Error?error.message:'Audit failed.'}));process.exitCode=1;}}
