/** Final return-home check over coherent backup files only. No live DB or HTTP. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {comparePrivatePcExplorationBackups} from './private-pc-exploration-save-check.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value);
const point=value=>!!value&&Number.isFinite(value.x)&&Number.isFinite(value.y);
function navigationFields(player){const h=player?.habitable;return{position:h?.position??null,movement:h?.movement??null,exploration:h?.exploration??null};}
export function compareExplorationCheckpoints(before,after,profileRef,expected){
  assert.match(profileRef,/^[a-f0-9]{12}$/,'Use the existing 12-character hashed profile reference.');assert.ok(point(expected),'Expected home coordinates must be finite.');
  const matches=Object.keys(before.players).filter(id=>sha(id).slice(0,12)===profileRef);assert.equal(matches.length,1,'The hashed profile must identify exactly one baseline profile.');const id=matches[0],old=before.players[id]?.habitable,current=after.players[id]?.habitable;assert.ok(old&&current,'The existing local character must be present in both saves.');
  const samePoint=(a,b)=>point(a)&&point(b)&&a.x===b.x&&a.y===b.y;
  const oldOther=Object.fromEntries(Object.keys(before.players).filter(other=>other!==id).sort().map(other=>[other,navigationFields(before.players[other])])),newOther=Object.fromEntries(Object.keys(after.players).filter(other=>other!==id).sort().map(other=>[other,navigationFields(after.players[other])]));
  const checks={sameProfileIds:canonical(Object.keys(before.players).sort())===canonical(Object.keys(after.players).sort()),baselineMatchesExpectedCheckpoint:samePoint(old.position,expected),finalMatchesOriginalCheckpoint:samePoint(current.position,old.position),finalMatchesExpectedCheckpoint:samePoint(current.position,expected),baselineWasHome:!Object.hasOwn(old,'exploration'),finalExplorationAbsent:!Object.hasOwn(current,'exploration'),finalLocalMovementAbsent:!Object.hasOwn(current,'movement'),otherProfilesNavigationExact:canonical(oldOther)===canonical(newOther)};
  return{allPassed:Object.values(checks).every(Boolean),profileRef,checks,before:{localPosition:{...old.position},explorationPresent:Object.hasOwn(old,'exploration'),localMovementPresent:Object.hasOwn(old,'movement')},after:{localPosition:{...current.position},explorationPresent:Object.hasOwn(current,'exploration'),localMovementPresent:Object.hasOwn(current,'movement')},expected:{...expected},otherProfilesChecked:Object.keys(oldOther).length};
}
async function readAlreadyVerifiedBackup(reference){
  const manifestBytes=await readFile(reference.manifest);assert.equal(sha(manifestBytes),reference.manifestSha256,'The verified manifest changed.');const manifest=JSON.parse(manifestBytes),backup=await readFile(manifest.destination);assert.equal(sha(backup),reference.backupSha256,'The verified backup changed.');const db=new DatabaseSync(manifest.destination,{readOnly:true});
  try{db.exec('PRAGMA query_only=ON');assert.equal(db.prepare('PRAGMA query_only').get().query_only,1);const row=db.prepare('SELECT state FROM world_state WHERE id=?').get('frontier-pdf-mvp-v2');assert.equal(sha(row.state),reference.stateSha256);return JSON.parse(row.state);}
  finally{db.close();assert.equal(sha(await readFile(manifest.destination)),reference.backupSha256);assert.equal(sha(await readFile(reference.manifest)),reference.manifestSha256);}
}
export async function inspectPrivatePcExplorationCheckpoint(beforePath,afterPath,profileRef,expected){
  const preservation=await comparePrivatePcExplorationBackups(beforePath,afterPath,{allowExploration:true});
  const before=await readAlreadyVerifiedBackup(preservation.before),after=await readAlreadyVerifiedBackup(preservation.after),checkpoint=compareExplorationCheckpoints(before,after,profileRef,expected);
  return{formatVersion:1,createdAt:new Date().toISOString(),allPassed:preservation.allPassed&&checkpoint.allPassed,localOnly:true,liveDatabaseOpened:false,databaseWrites:0,remoteConnections:0,migrations:0,before:preservation.before,after:preservation.after,checkpoint,preservation:{allPassed:preservation.allPassed,checks:preservation.checks,profileCount:preservation.state.after.profiles,inventoryLots:preservation.state.after.inventoryLots,habitableBuildingCount:preservation.state.after.habitableBuildingCount,jobs:preservation.state.after.jobs.count,receiptsBefore:preservation.state.before.receipts.count,receiptsAfter:preservation.state.after.receipts.count,addedReceipts:preservation.state.addedReceipts,revisionDelta:preservation.revisionDelta,receiptAttributionVerified:false},note:'The underlying audit verifies coherent backups, economic preservation and append-only receipts. This additional check proves the selected original local checkpoint was restored, the optional exploration state is absent, and other profiles kept their navigation state. Command attribution and the visual journey remain external UI/Network evidence.'};
}
function args(values){const out={};for(let i=0;i<values.length;i+=2){const key=values[i];assert.ok(['--before','--after','--profile-ref','--expect-x','--expect-y'].includes(key),'Use --before MANIFEST --after MANIFEST --profile-ref HASH12 --expect-x NUMBER --expect-y NUMBER.');assert.ok(values[i+1]!==undefined&&!Object.hasOwn(out,key),'Missing or duplicate argument.');out[key]=values[i+1];}assert.equal(Object.keys(out).length,5,'All five arguments are required.');return{before:resolve(out['--before']),after:resolve(out['--after']),profileRef:out['--profile-ref'],expected:{x:Number(out['--expect-x']),y:Number(out['--expect-y'])}};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const options=args(process.argv.slice(2)),report=await inspectPrivatePcExplorationCheckpoint(options.before,options.after,options.profileRef,options.expected);console.log(JSON.stringify(report,null,2));if(!report.allPassed)process.exitCode=1;}catch(error){console.log(JSON.stringify({allPassed:false,localOnly:true,liveDatabaseOpened:false,databaseWrites:0,remoteConnections:0,error:error instanceof Error?error.message:'Checkpoint audit failed.'}));process.exitCode=1;}}
