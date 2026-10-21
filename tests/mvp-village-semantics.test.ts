import test from 'node:test';
import assert from 'node:assert/strict';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import { attachVillageEvidence, getVillageEvidence, ledgerEntriesAdjacent, playerIdentity, resourceExtractions } from '../lib/mvp/village-evidence.ts';
import type { VillageEvidence } from '../lib/mvp/village-evidence.ts';
import { assertVillageExecutionClosure, deriveVillageEntityValues, deriveVillageVersionChanges, villageInvalidatedAggregateKeys } from '../lib/mvp/village-semantics.ts';
import { deriveEntityValues, advanceEntityVersions } from '../lib/mvp/entity-versions.ts';
import { cloneOperationWorld, beginVillageOperation } from '../lib/mvp/operation-ids.ts';
import { getBoostPassWallet } from '../lib/mvp/boost-passes.ts';
import { dispatchProduction } from '../lib/mvp/production.ts';
import { settleSocial } from '../lib/mvp/social.ts';
import type { MvpWorld } from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-20T12:00:00Z');
function fixture(configure?:(world:MvpWorld,ownIds:string[],foreignIds:string[])=>void){
  const full=createMvpWorld('admin',NOW),add=(ownerId:string,name:string)=>createPlayer(full,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'});
  const own=[add('owner','Alba'),add('owner','Luna')],foreign=[add('foreign-a','Beto'),add('foreign-b','Cora')];settleSocial(full,NOW);
  configure?.(full,own.map(p=>p.id),foreign.map(p=>p.id));
  const state=structuredClone(full),ids=new Set(own.map(p=>p.id));
  state.players=Object.fromEntries(Object.entries(state.players).filter(([id])=>ids.has(id)));
  state.jobs=Object.fromEntries(Object.entries(state.jobs).filter(([,job])=>ids.has(job.playerId)));
  state.social.accounts=Object.fromEntries(Object.entries(state.social.accounts).filter(([id])=>ids.has(id)));
  state.social.activity=Object.fromEntries(Object.entries(state.social.activity).filter(([id])=>ids.has(id)));
  state.social.ledger=state.social.ledger.filter(entry=>ids.has(entry.from)||ids.has(entry.to));
  state.events=[];
  const evidence:VillageEvidence={ownerId:'owner',playerId:own[0].id,profileIds:own.map(p=>p.id),totalPlayerCount:4,identities:Object.fromEntries(Object.values(full.players).map(p=>[p.id,{id:p.id,ownerId:p.ownerId,name:p.name,stationName:p.stationName,faction:p.faction}])),playerOrdinals:Object.fromEntries(Object.keys(full.players).map((id,index)=>[id,index])),ledgerOrdinals:Object.fromEntries(full.social.ledger.map((entry,index)=>[entry.id,index])),commerceFleet:[],extractionJobs:Object.values(full.jobs).flatMap(j=>j.kind==='extract'&&(j.status==='running'||j.status==='reserved')?[{id:j.id,playerId:j.playerId,ownerId:full.players[j.playerId].ownerId,kind:'extract' as const,status:j.status,endsAt:j.endsAt,payload:{tileId:String(j.payload.tileId),itemId:String(j.payload.itemId),qty:Number(j.payload.qty)}}]:[]),nextSharedDueAt:null,sharedComplete:true,complete:{profiles:true,ownJobs:true,ownLedger:true,ownAccounts:true,resources:true,extractionJobs:true,sharedSocial:true,ownBattles:true,fleet:true}};
  attachVillageEvidence(state,evidence);
  return{full,state,evidence,own,foreign};
}

test('closed village values equal the full world for every materialized key without tombstoning foreign records',()=>{
  const f=fixture((world,own,foreign)=>{world.social.offers.push({id:'completed-peer-trade',makerId:foreign[0],takerId:own[0],mode:'credits',itemId:'timber',qty:1,lots:[],wantItemId:null,wantQty:0,price:2,fee:0,status:'filled',createdAt:NOW,expiresAt:NOW+1000});});
  const full=deriveEntityValues(f.full),scoped=deriveVillageEntityValues(f.state);
  for(const[key,value]of Object.entries(scoped))assert.equal(value,full[key],key);
  assert.equal(scoped['lectura:compartida'],undefined);assert.equal(scoped['transporte:flota'],undefined);
  assert.ok(Object.keys(scoped).every(key=>!key.startsWith('indice:extraccion:')));
  assert.equal(scoped[`aldea:${f.foreign[0].id}`],undefined);assert.equal(scoped['cuenta:foreign-a'],undefined);
  const versions=Object.fromEntries(Object.keys(full).map(key=>[key,7]));assert.deepEqual(advanceEntityVersions(f.state,cloneOperationWorld(f.state),versions),versions);
});

test('foreign identities are explicit facts and never fabricated private players',()=>{
  const f=fixture();assert.equal(f.state.players[f.foreign[0].id],undefined);
  assert.equal(playerIdentity(f.state,f.foreign[0].id)?.ownerId,'foreign-a');
  assert.equal(playerIdentity(f.state,'genuinely-missing'),undefined);
  assert.equal(JSON.stringify(f.state).includes('village-loaded-evidence'),false);
});

test('filtering foreign ledger rows cannot manufacture an earned NPC sale pass',()=>{
  const f=fixture((world,own,foreign)=>{world.social.ledger.push({id:'debit',at:NOW,currency:'item',amount:1,from:own[0],to:'npc-season',reason:'Productos entregados al encargo finito',itemId:'timber'},{id:'foreign-between',at:NOW,currency:'credits',amount:1,from:foreign[0],to:'service',reason:'Foreign receipt'},{id:'paid',at:NOW,currency:'credits',amount:2,from:'npc-season',to:own[0],reason:'Encargo NPC con presupuesto limitado'});});
  assert.equal(f.state.social.ledger.length,2);assert.equal(ledgerEntriesAdjacent(f.state,f.state.social.ledger[0],f.state.social.ledger[1]),false);
  assert.equal(getBoostPassWallet(f.full,'owner',NOW).contractEarned,0);assert.equal(getBoostPassWallet(f.state,'owner',NOW).contractEarned,0);
  const clone=cloneOperationWorld(f.state);assert.equal(getVillageEvidence(clone),f.evidence);assert.equal(getBoostPassWallet(clone,'owner',NOW).contractEarned,0);
  clone.social.ledger.push({id:'new-debit',at:NOW,currency:'item',amount:1,from:f.own[0].id,to:'npc-season',reason:'Productos entregados al encargo finito',itemId:'plank'},{id:'new-paid',at:NOW,currency:'credits',amount:6,from:'npc-season',to:f.own[0].id,reason:'Encargo NPC con presupuesto limitado'});
  assert.equal(getBoostPassWallet(clone,'owner',NOW).contractEarned,1);
  assert.equal(ledgerEntriesAdjacent(clone,clone.social.ledger[1],clone.social.ledger[2]),false);
});

test('compact foreign extraction facts preserve both real shared slots without private job payloads',()=>{
  const f=fixture((world,own,foreign)=>{const tile=Object.values(world.tiles).find(t=>t.deposits.some(d=>d.itemId==='timber'))!;world.players[own[0]].position=tile.id;world.players[own[0]].surveyed.push(tile.id);for(const[id,index]of foreign.map((id,index)=>[id,index]as const)){world.jobs[`foreign-${index}`]={id:`foreign-${index}`,playerId:id,kind:'extract',status:'running',createdAt:NOW,startsAt:NOW,endsAt:NOW+10_000,ruleVersion:world.rulesVersion,weather:weatherFor(tile.regionId,NOW),route:[tile.id],costs:[],payload:{tileId:tile.id,itemId:'timber',qty:1,privateForeignPayload:'must-not-load'},report:[]};}});
  assert.equal(Object.keys(f.state.jobs).length,0);assert.equal(resourceExtractions(f.state,f.state.players[f.own[0].id].position,'timber').length,2);
  assert.equal(JSON.stringify(f.state).includes('privateForeignPayload'),false);
  assert.throws(()=>dispatchProduction(f.state,{type:'mining.reserve',playerId:f.own[0].id,tileId:f.state.players[f.own[0].id].position,itemId:'timber',qty:1},{ownerId:'owner',now:NOW,requestId:crypto.randomUUID(),actor:f.state.players[f.own[0].id]}),/ranuras/);
});

test('shared invalidations are explicit impacts rather than fingerprints of partial aggregates',()=>{
  const f=fixture(),next=cloneOperationWorld(f.state);beginVillageOperation(next);
  next.events.unshift({id:'event-local',playerId:f.own[0].id,playerName:'Alba',at:NOW,text:'Evento propio'});
  assert.deepEqual(villageInvalidatedAggregateKeys(f.state,next),['lectura:compartida']);
  const change=deriveVillageVersionChanges(f.state,next);assert.ok(change.changedKeys.includes('lectura:compartida'));assert.match(change.values['lectura:compartida'],/shared-delta-impact/);
  assert.equal(deriveVillageEntityValues(next)['lectura:compartida'],undefined);
});

test('scope admission rejects unsupported participants and due shared leases before execution',()=>{
  const f=fixture();assertVillageExecutionClosure(f.state,{type:'craft.start',playerId:f.own[0].id,recipeId:'plank',qty:1},NOW);
  assert.throws(()=>assertVillageExecutionClosure(f.state,{type:'market.fill',playerId:f.own[0].id,offerId:'other'},NOW),/completa/);
  const due=cloneOperationWorld(f.state);attachVillageEvidence(due,{...f.evidence,nextSharedDueAt:NOW});assert.throws(()=>assertVillageExecutionClosure(due,undefined,NOW),/vencida/);
  assert.throws(()=>attachVillageEvidence(structuredClone(f.state),{...f.evidence,profileIds:[f.own[0].id]}),/perfiles/);
});
