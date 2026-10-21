/** Offline preservation audit. Reads coherent backups only; never writes a DB or contacts a server. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {compareCameraSaveStates,comparePrivatePcCameraBackups} from './private-pc-camera-save-check.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){if(value===undefined)return 'undefined';if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;}
const digest=value=>sha(canonical(value));
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const point=(value,global=false)=>exactKeys(value,['x','y'])&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&(global?value.x>=-27840&&value.x<=41280&&value.y>=-14976&&value.y<=19584:Math.abs(value.x)<=18.5&&Math.abs(value.y)<=18.5);
const routeId=value=>value===undefined||typeof value==='string'&&/^[a-z0-9][a-z0-9:_-]{0,159}$/.test(value);
const sessionId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function validManualNavigationSave(value){return value===undefined||exactKeys(value,['sessionId','sequence','expiresAt','stopped','retiredSessions'])&&sessionId(value.sessionId)&&Number.isSafeInteger(value.sequence)&&value.sequence>=1&&value.sequence<=2147483647&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>=0&&typeof value.stopped==='boolean'&&(value.retiredSessions===undefined||Array.isArray(value.retiredSessions)&&value.retiredSessions.length<=8&&value.retiredSessions.every(sessionId)&&new Set(value.retiredSessions).size===value.retiredSessions.length&&!value.retiredSessions.includes(value.sessionId));}
function validManualFields(player){const h=player.habitable;if(!h)return true;if(!validManualNavigationSave(h.manualNavigation))return false;for(const move of[h.movement,h.exploration?.movement])if(move&&Object.hasOwn(move,'manualSessionId')&&(!sessionId(move.manualSessionId)||!h.manualNavigation||move.manualSessionId!==h.manualNavigation.sessionId))return false;return true;}
function holds(value){
  if(value.holds===undefined)return true;
  if(!Array.isArray(value.holds)||value.holds.length>128)return false;
  let previousEnd=value.startsAt,previousIndex=-1;
  for(const hold of value.holds){
    if(!exactKeys(hold,['pointIndex','startsAt','endsAt','resourceId'])||!Number.isInteger(hold.pointIndex)||hold.pointIndex<0||hold.pointIndex>=value.points.length||hold.pointIndex<previousIndex||!Number.isFinite(hold.startsAt)||!Number.isFinite(hold.endsAt)||hold.startsAt<previousEnd||hold.startsAt<value.startsAt||hold.endsAt<=hold.startsAt||hold.endsAt>value.endsAt||typeof hold.resourceId!=='string'||!/^[a-z0-9:-]{1,120}$/.test(hold.resourceId))return false;
    if(value.legs&&!value.legs.some(leg=>leg.mode!=='boat'&&hold.pointIndex>=leg.fromIndex&&hold.pointIndex<=leg.toIndex&&hold.startsAt>=leg.startsAt&&hold.endsAt<=leg.endsAt))return false;
    previousEnd=hold.endsAt;previousIndex=hold.pointIndex;
  }
  return true;
}
function movement(value){
  if(value===undefined)return true;
  if(!exactKeys(value,['points','startsAt','endsAt','legs','holds','manualSessionId'])||!Number.isFinite(value.startsAt)||value.startsAt<0||!Number.isFinite(value.endsAt)||value.endsAt<=value.startsAt||!Array.isArray(value.points)||value.points.length<2||!value.points.every(p=>point(p,true))||JSON.stringify(value).length>32768||value.manualSessionId!==undefined&&!sessionId(value.manualSessionId))return false;
  if(value.legs===undefined)return value.points.length<=256&&holds(value);
  if(value.points.length>1024||!Array.isArray(value.legs)||value.legs.length<1||value.legs.length>64)return false;
  let index=0,time=value.startsAt;
  for(const leg of value.legs){
    if(!exactKeys(leg,['mode','fromIndex','toIndex','startsAt','endsAt','routeId','fromPortId','toPortId'])||!['walk','carriage','boat'].includes(leg.mode)||!Number.isInteger(leg.fromIndex)||!Number.isInteger(leg.toIndex)||leg.fromIndex!==index||leg.toIndex<=index||leg.toIndex>=value.points.length||leg.startsAt!==time||!Number.isFinite(leg.endsAt)||leg.endsAt<=time||![leg.routeId,leg.fromPortId,leg.toPortId].every(routeId))return false;
    index=leg.toIndex;time=leg.endsAt;
  }
  return index===value.points.length-1&&time===value.endsAt&&holds(value);
}
export function validExplorationSave(value){return value===undefined||exactKeys(value,['version','position','homePosition','departedAt','movement','destinationId','returning'])&&value.version===1&&point(value.position,true)&&point(value.homePosition)&&Number.isFinite(value.departedAt)&&value.departedAt>=0&&movement(value.movement)&&(value.destinationId===undefined||typeof value.destinationId==='string'&&/^[a-z0-9][a-z0-9:_-]{0,159}$/.test(value.destinationId))&&(value.returning===undefined||typeof value.returning==='boolean');}
function withoutExploration(world){const copy=structuredClone(world);for(const player of Object.values(copy.players??{}))if(player.habitable){delete player.habitable.exploration;delete player.habitable.manualNavigation;if(player.habitable.movement)delete player.habitable.movement.manualSessionId;}return copy;}
function explorationSummary(world){const entries=Object.values(world.players??{}).filter(player=>player.habitable?.exploration!==undefined).map(player=>[player.id,player.habitable.exploration]);return {outsideProfiles:entries.length,sha256:digest(entries)};}

/** Pure comparison: the existing audit still protects every economic/profile field. */
export function compareExplorationSaveStates(before,after,{allowExploration=false}={}){
  if(!allowExploration)return {...compareCameraSaveStates(before,after),allowExploration:false};
  const base=compareCameraSaveStates(withoutExploration(before),withoutExploration(after),{allowWalk:true});
  /** @type {Record<string,boolean>} */
  const checks={...base.checks,sameEntireWorld:canonical(before)===canonical(after),validExplorationFields:Object.values(after.players??{}).every(player=>!player.habitable||validExplorationSave(player.habitable.exploration)),validBaselineExplorationFields:Object.values(before.players??{}).every(player=>!player.habitable||validExplorationSave(player.habitable.exploration)),validManualNavigationFields:Object.values(after.players??{}).every(validManualFields),validBaselineManualNavigationFields:Object.values(before.players??{}).every(validManualFields)};
  // sameEntireWorld is informational in movement QA; every other inherited check remains mandatory.
  const allPassed=Object.entries(checks).filter(([name])=>name!=='sameEntireWorld').every(([,passed])=>passed);
  const beforeExploration=explorationSummary(before),afterExploration=explorationSummary(after);
  return {...base,allPassed,allowExploration:true,checks,exploration:{changed:beforeExploration.sha256!==afterExploration.sha256,before:beforeExploration,after:afterExploration},receiptAttributionVerified:false,receiptAttributionNote:'Only structurally valid exploration state, local walking and appended opaque receipt hashes are permitted. Receipt hashes do not identify commands; verify exploration-only activity independently through observed UI/Network evidence.'};
}
async function readVerifiedWorld(reference){
  const manifestBytes=await readFile(reference.manifest);assert.equal(sha(manifestBytes),reference.manifestSha256,'The verified backup manifest changed.');const manifest=JSON.parse(manifestBytes);
  const bytes=await readFile(manifest.destination);assert.equal(sha(bytes),reference.backupSha256,'The coherent backup changed before the exploration audit.');
  const db=new DatabaseSync(manifest.destination,{readOnly:true});
  try{db.exec('PRAGMA query_only=ON');assert.equal(db.prepare('PRAGMA query_only').get().query_only,1);const row=db.prepare('SELECT state FROM world_state WHERE id=?').get('frontier-pdf-mvp-v2');assert.equal(sha(row.state),reference.stateSha256);return JSON.parse(row.state);}
  finally{db.close();assert.equal(sha(await readFile(manifest.destination)),reference.backupSha256,'A backup changed during the read-only exploration audit.');assert.equal(sha(await readFile(reference.manifest)),reference.manifestSha256,'A manifest changed during the read-only exploration audit.');}
}
export async function comparePrivatePcExplorationBackups(beforePath,afterPath,{allowExploration=false}={}){
  const audit=await comparePrivatePcCameraBackups(beforePath,afterPath,{allowWalk:allowExploration});
  if(!allowExploration)return {...audit,mode:'exact-exploration-release-preservation',allowExploration:false};
  const before=await readVerifiedWorld(audit.before),after=await readVerifiedWorld(audit.after),state=compareExplorationSaveStates(before,after,{allowExploration:true});
  const checks={...audit.checks,statePreserved:state.allPassed};
  return {...audit,formatVersion:1,mode:'preserve-except-exploration-local-walking-and-appended-receipts',allowExploration:true,allPassed:Object.values(checks).every(Boolean),checks,state,note:'The original audit verifies the coherent backup manifests, local DB identity, SQL schema and all protected tables. This wrapper permits only documented navigation fields, bounded traffic holds and strictly validated manual input session/lease metadata during QA. Resources, inventories, stored materials, buildings, jobs, XP inputs, identities and all unrelated world fields remain exact. No live database, game engine, migration or remote endpoint is opened.'};
}
function args(values){const out={allowExploration:false};for(let i=0;i<values.length;i++){const key=values[i];if(key==='--allow-exploration'){assert.equal(out.allowExploration,false,'Duplicate exploration option.');out.allowExploration=true;continue;}assert.ok(key==='--before'||key==='--after','Use --before MANIFEST --after MANIFEST [--allow-exploration].');const name=key.slice(2);assert.ok(values[i+1]&&!values[i+1].startsWith('--')&&!out[name],'Missing or duplicate manifest.');out[name]=resolve(values[++i]);}assert.ok(out.before&&out.after,'Both coherent backup manifests are required.');return out;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const options=args(process.argv.slice(2)),report=await comparePrivatePcExplorationBackups(options.before,options.after,options);console.log(JSON.stringify(report,null,2));if(!report.allPassed)process.exitCode=1;}catch(error){console.log(JSON.stringify({allPassed:false,localOnly:true,remoteConnections:0,databaseWrites:0,migrations:0,error:error instanceof Error?error.message:'Audit failed.'}));process.exitCode=1;}}
