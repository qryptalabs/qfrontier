import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {HABITABLE_BUILDING_TEMPLATES,habitablePlacementError,habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import {ITEM_CATALOG} from '../lib/mvp/catalog.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import {createOperatorFixture,operatorConfig} from './fixtures/manager-operator.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(!this.record||this.record.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
// Existing parcels can authorize the new manager without changing their legacy scenery rules.
const NOW=Date.parse('2026-10-16T03:30:00Z');
async function fixture(){
  const store=new MemoryStore(),owner='manager-quote-owner';
  const v=await executeMvp(store,owner,{type:'player.create',name:'Artesana',stationName:'Taller',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=v.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'farmer'},crypto.randomUUID(),undefined,NOW);
  let at=NOW;
  for(const spec of [{templateId:'workbench',x:-2,y:-8,rotation:1},{templateId:'shed',x:7,y:3,rotation:0},{templateId:'planter',x:8,y:6,rotation:0}]){
    const built=await executeMvp(store,owner,{type:'habitat.build',playerId:id,...spec},crypto.randomUUID(),undefined,at);at=built.player!.habitable!.buildings.at(-1)!.endsAt+1;await readMvpView(store,owner,id,at);
  }
  await executeMvp(store,owner,{type:'habitat.residents.initialize',playerId:id},crypto.randomUUID(),undefined,at);
  const crafted=await executeMvp(store,owner,{type:'craft.start',playerId:id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,at);
  at=Math.max(...crafted.jobs.filter(j=>j.playerId===id).map(j=>j.endsAt))+1;await readMvpView(store,owner,id,at);
  const h=store.record!.world.players[id].habitable!;
  const command:MvpCommand={type:'habitat.manager.start',playerId:id,supplyShedId:h.buildings.find(b=>b.templateId==='shed')!.id,workbenchId:h.buildings.find(b=>b.templateId==='workbench')!.id,planterId:h.buildings.find(b=>b.templateId==='planter')!.id,goals:{ration:1,plank:1,cloth:1},durationMinutes:10,maxOrders:6,inputBudget:24};
  return{store,owner,id,at,command};
}

test('manager quote authorizes the finite turn and explicit stock targets without reserving a hypothetical entire production',async()=>{
  const f=await fixture(),before=structuredClone(f.store.record),request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,f.command,request,f.at);
  assert.deepEqual(f.store.record,before);assert.deepEqual(q.changes,[]);assert.deepEqual(q.expectedOutputs,[]);assert.equal(q.creditDelta,0);assert.equal(q.simDelta,0);assert.equal(q.boost,null);assert.equal(q.durationSeconds,600);
  assert.match(q.summary,/Autorizar turno/);assert.ok(q.warnings.some(w=>w.includes('6 órdenes')&&w.includes('24 unidades')));assert.ok(q.warnings.some(w=>w.includes('Metas de existencias')));assert.ok(q.warnings.some(w=>w.includes('no renueva la jornada')));
  await validateMvpQuote(f.store,f.owner,f.command,request,q.revision,q.token,q.expiresAt,f.at);
  await assert.rejects(validateMvpQuote(f.store,f.owner,{...f.command,inputBudget:80},request,q.revision,q.token,q.expiresAt,f.at),/no corresponde/);
});

test('manager policy rejects an unsigned old-policy draft but preserves confirmed receipt retries',async()=>{
  const f=await fixture(),request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,f.command,request,f.at),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.store.record!.world.rngSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const oldPayload=new TextEncoder().encode(JSON.stringify({owner:f.owner,command:f.command,request,revision:q.revision,expires:q.expiresAt})),signed=await crypto.subtle.sign('HMAC',key,oldPayload),oldToken=[...new Uint8Array(signed)].map(b=>b.toString(16).padStart(2,'0')).join('');
  await assert.rejects(validateMvpQuote(f.store,f.owner,f.command,request,q.revision,oldToken,q.expiresAt,f.at),/no corresponde/);
  await executeMvp(f.store,f.owner,f.command,request,q.revision,f.at);const after=structuredClone(f.store.record);
  await validateMvpQuote(f.store,f.owner,f.command,request,undefined,undefined,undefined,f.at+1);
  await executeMvp(f.store,f.owner,f.command,request,undefined,f.at);assert.deepEqual(f.store.record,after);
});

test('operator policy rejects a prior priority-v4 signature while explicit disabling remains pure and signed',async()=>{
  const f=await fixture(),command={...f.command,operator:null},request=crypto.randomUUID(),before=structuredClone(f.store.record),q=await quoteMvp(f.store,f.owner,command,request,f.at);
  assert.deepEqual(f.store.record,before);assert.ok(q.warnings.some(w=>w.includes('operador polivalente está desactivado')));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.store.record!.world.rngSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']),payload=new TextEncoder().encode(JSON.stringify({owner:f.owner,command,request,revision:q.revision,expires:q.expiresAt,managerPolicy:'bounded-priority-v4'})),signed=await crypto.subtle.sign('HMAC',key,payload),oldToken=[...new Uint8Array(signed)].map(b=>b.toString(16).padStart(2,'0')).join('');
  await assert.rejects(validateMvpQuote(f.store,f.owner,command,request,q.revision,oldToken,q.expiresAt,f.at),/no corresponde/);
  await assert.rejects(validateMvpQuote(f.store,f.owner,{...command,operator:{residentId:'someone',allowedJobs:['sawmill'],preferredJob:'sawmill'}},request,q.revision,q.token,q.expiresAt,f.at),/no corresponde/);
  await executeMvp(f.store,f.owner,command,request,q.revision,f.at);const after=structuredClone(f.store.record);await validateMvpQuote(f.store,f.owner,command,request,undefined,undefined,undefined,f.at);await executeMvp(f.store,f.owner,command,request,undefined,f.at);assert.deepEqual(f.store.record,after);
});

test('a real multiskilled operator preview names the resident and signs exact permissions and preference without relocating or spending',async()=>{
  const f=await createOperatorFixture(),command:MvpCommand={...operatorConfig(f),playerId:f.id},before=structuredClone(f.store.record),request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,command,request,f.at),operator=command.operator as {residentId:string;allowedJobs:string[];preferredJob:string};
  const name=f.store.record!.world.players[f.id].habitable!.workforce!.residents.find(r=>r.id===operator.residentId)!.name;
  assert.deepEqual(f.store.record,before);assert.deepEqual(q.changes,[]);assert.deepEqual(q.expectedOutputs,[]);assert.equal(q.boost,null);assert.equal(q.creditDelta,0);assert.ok(q.managerForecast);
  assert.ok(q.warnings.some(w=>w.includes(`Operador polivalente autorizado: ${name}`)&&w.includes('puesto forestal')&&w.includes('aserradero')));
  assert.ok(q.warnings.some(w=>w.includes('no produce antes de llegar')&&w.includes('regresa caminando')&&w.includes('ranuras compartidas')));
  await validateMvpQuote(f.store,f.owner,command,request,q.revision,q.token,q.expiresAt,f.at);
  for(const patch of [{residentId:'other-resident'},{allowedJobs:['woodlot']},{preferredJob:'sawmill'}])await assert.rejects(validateMvpQuote(f.store,f.owner,{...command,operator:{...operator,...patch}},request,q.revision,q.token,q.expiresAt,f.at),/no corresponde/);
  assert.deepEqual(f.store.record,before);
  await executeMvp(f.store,f.owner,command,request,q.revision,f.at);const after=structuredClone(f.store.record);await validateMvpQuote(f.store,f.owner,command,request,undefined,undefined,undefined,f.at);await executeMvp(f.store,f.owner,command,request,undefined,f.at);assert.deepEqual(f.store.record,after);
});

test('approving a future construction quotes its catalog costs and location without spending stock or granting experience',async()=>{
  const f=await fixture();await executeMvp(f.store,f.owner,f.command,crypto.randomUUID(),undefined,f.at);await readMvpView(f.store,f.owner,f.id,f.at);
  const p=f.store.record!.world.players[f.id],h=p.habitable!,template=HABITABLE_BUILDING_TEMPLATES.find(t=>t.id==='house')!,site={x:-11,y:4};
  assert.equal(habitablePlacementError(h,{templateId:'house',...site,rotation:0},f.at),null);const command:MvpCommand={type:'habitat.manager.approve-build',playerId:f.id,planId:h.manager!.id,templateId:'house',...site,rotation:0};
  const before=structuredClone(f.store.record),q=await quoteMvp(f.store,f.owner,command,crypto.randomUUID(),f.at);
  assert.deepEqual(f.store.record,before);assert.deepEqual(q.changes,[]);assert.equal(q.durationSeconds,0);assert.match(q.summary,/Aprobar un plano/);
  const warning=q.warnings.find(w=>w.includes('Apruebas un plano'));assert.ok(warning);assert.ok(warning.includes(`X ${site.x}`)&&warning.includes(`Y ${site.y}`));
  for(const input of template.costs)assert.ok(warning.includes(`${input.qty} ${ITEM_CATALOG[input.itemId].name}`));assert.ok(q.warnings.some(w=>w.includes('no renueva el turno')));
});

test('supply policy and minimum reserves are reviewed with a pure forecast before any stock or XP is committed',async()=>{
  const f=await fixture(),command={...f.command,replenishFarmInputs:true,reserves:{grain:2,ration:1,timber:1}},before=structuredClone(f.store.record),request=crypto.randomUUID();
  const q=await quoteMvp(f.store,f.owner,command,request,f.at);
  assert.deepEqual(f.store.record,before,'previewing dependencies must not execute the plan');
  assert.deepEqual(q.changes,[]);assert.deepEqual(q.expectedOutputs,[]);assert.equal(q.creditDelta,0);assert.equal(q.simDelta,0);assert.equal(q.boost,null);
  assert.ok(q.managerForecast);assert.equal(q.managerForecast.conditional,true);assert.equal(q.managerForecast.evaluatedAt,f.at);
  assert.ok(q.warnings.some(w=>w.includes('Reservas mínimas')&&w.includes('2 Grano')&&w.includes('1 Ración')));
  assert.ok(q.warnings.some(w=>w.includes('no son')||w.includes('No son una inmovilización')));
  assert.ok(q.warnings.some(w=>w.includes('Autorizas fabricar semillas y nutrientes')));
  assert.ok(q.warnings.some(w=>w.includes('Semilla:')&&w.includes('1 Grano')));
  assert.ok(q.warnings.some(w=>w.includes('Nutriente:')&&w.includes('3 Biomasa')&&w.includes('1 Agua')));
  await validateMvpQuote(f.store,f.owner,command,request,q.revision,q.token,q.expiresAt,f.at);
  for(const change of [{replenishFarmInputs:false},{reserves:{grain:0,ration:1,timber:1}}]){
    await assert.rejects(validateMvpQuote(f.store,f.owner,{...command,...change},request,q.revision,q.token,q.expiresAt,f.at),/no corresponde/);
    assert.deepEqual(f.store.record,before);
  }
});

test('a prior bounded-shifts signature cannot authorize the new supply rules and confirmed retries remain exact',async()=>{
  const f=await fixture(),command={...f.command,replenishFarmInputs:true,reserves:{grain:1}},request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,command,request,f.at);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.store.record!.world.rngSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const priorPayload=new TextEncoder().encode(JSON.stringify({owner:f.owner,command,request,revision:q.revision,expires:q.expiresAt,managerPolicy:'bounded-shifts-v1'}));
  const signed=await crypto.subtle.sign('HMAC',key,priorPayload),priorToken=[...new Uint8Array(signed)].map(b=>b.toString(16).padStart(2,'0')).join('');
  await assert.rejects(validateMvpQuote(f.store,f.owner,command,request,q.revision,priorToken,q.expiresAt,f.at),/no corresponde/);
  await executeMvp(f.store,f.owner,command,request,q.revision,f.at);const after=structuredClone(f.store.record);
  await validateMvpQuote(f.store,f.owner,command,request,undefined,undefined,undefined,f.at);
  await executeMvp(f.store,f.owner,command,request,undefined,f.at);assert.deepEqual(f.store.record,after);
});

test('resuming an existing plan previews inherited or explicitly revised supply permissions without silently changing the saved policy',async()=>{
  const f=await fixture(),start={...f.command,replenishFarmInputs:true,reserves:{grain:2,water:1}};
  await executeMvp(f.store,f.owner,start,crypto.randomUUID(),undefined,f.at);
  const planId=f.store.record!.world.players[f.id].habitable!.manager!.id;
  await executeMvp(f.store,f.owner,{type:'habitat.manager.pause',playerId:f.id,planId},crypto.randomUUID(),undefined,f.at);
  const command:MvpCommand={type:'habitat.manager.resume',playerId:f.id,planId,durationMinutes:10,maxOrders:3,inputBudget:12},before=structuredClone(f.store.record);
  const q=await quoteMvp(f.store,f.owner,command,crypto.randomUUID(),f.at);
  assert.deepEqual(f.store.record,before);assert.ok(q.managerForecast);
  assert.ok(q.warnings.some(w=>w.includes('Autorizas fabricar semillas y nutrientes')));
  assert.ok(q.warnings.some(w=>w.includes('Reservas mínimas')&&w.includes('2 Grano')));
  const changed=await quoteMvp(f.store,f.owner,{...command,replenishFarmInputs:false,reserves:{ration:3}},crypto.randomUUID(),f.at);
  assert.deepEqual(f.store.record,before);
  assert.ok(changed.warnings.some(w=>w.includes('reposición de semillas y nutrientes está desactivada')));
  assert.ok(changed.warnings.some(w=>w.includes('Reservas mínimas')&&w.includes('3 Ración')));
});

async function parallelQuoteFixture(){
  const f=await fixture(),h=f.store.record!.world.players[f.id].habitable!,resident=h.workforce!.residents.find(r=>r.assignment?.buildingId===f.command.planterId)!;
  await executeMvp(f.store,f.owner,{type:'habitat.resident.unassign',playerId:f.id,residentId:resident.id},crypto.randomUUID(),undefined,f.at);
  f.at=f.store.record!.world.players[f.id].habitable!.workforce!.residents.find(r=>r.id===resident.id)!.relocation!.endsAt+1;
  await readMvpView(f.store,f.owner,f.id,f.at);
  return{...f,command:{...f.command,planterId:undefined,parallel:true,courierResidentId:resident.id}};
}

test('parallel quote reviews one real courier and two shared slots without reserving stock or an extra order',async()=>{
  const f=await parallelQuoteFixture(),before=structuredClone(f.store.record),request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,f.command,request,f.at);
  assert.deepEqual(f.store.record,before);assert.deepEqual(q.changes,[]);assert.deepEqual(q.expectedOutputs,[]);assert.equal(q.creditDelta,0);assert.equal(q.boost,null);
  assert.ok(q.warnings.some(w=>w.includes('dos órdenes simultáneas')&&w.includes('compartiendo el máximo')));
  assert.ok(q.warnings.some(w=>w.includes('transportista elegido queda reservado')&&w.includes('productores siguen abasteciendo')));
  await validateMvpQuote(f.store,f.owner,f.command,request,q.revision,q.token,q.expiresAt,f.at);
  for(const patch of[{parallel:false},{courierResidentId:'foreign-courier'},{woodlotId:'foreign-woodlot',forestry:{tileId:'tile-1',layerId:'layer-1',maxTimber:10}}]){
    await assert.rejects(validateMvpQuote(f.store,f.owner,{...f.command,...patch},request,q.revision,q.token,q.expiresAt,f.at),/no corresponde/);
  }
  assert.deepEqual(f.store.record,before);
});

test('the previous supply signature cannot authorize industrial parallelism while a confirmed parallel receipt remains idempotent',async()=>{
  const f=await parallelQuoteFixture(),request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,f.command,request,f.at);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.store.record!.world.rngSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const payload=new TextEncoder().encode(JSON.stringify({owner:f.owner,command:f.command,request,revision:q.revision,expires:q.expiresAt,managerPolicy:'bounded-supply-v2'}));
  const signed=await crypto.subtle.sign('HMAC',key,payload),oldToken=[...new Uint8Array(signed)].map(b=>b.toString(16).padStart(2,'0')).join('');
  await assert.rejects(validateMvpQuote(f.store,f.owner,f.command,request,q.revision,oldToken,q.expiresAt,f.at),/no corresponde/);
  await executeMvp(f.store,f.owner,f.command,request,q.revision,f.at);const beforeRetry=structuredClone(f.store.record);
  await validateMvpQuote(f.store,f.owner,f.command,request,undefined,undefined,undefined,f.at);
  await executeMvp(f.store,f.owner,f.command,request,undefined,f.at);assert.deepEqual(f.store.record,beforeRetry);
});

test('priority construction allocations and urgent deliveries are separately reviewed and signed without executing a turn',async()=>{
  const f=await fixture(),command={...f.command,priority:'construction',reserveBuildMaterials:true,urgentTransport:true},request=crypto.randomUUID(),before=structuredClone(f.store.record),q=await quoteMvp(f.store,f.owner,command,request,f.at);
  assert.deepEqual(f.store.record,before);assert.deepEqual(q.changes,[]);assert.deepEqual(q.expectedOutputs,[]);assert.equal(q.creditDelta,0);assert.equal(q.boost,null);
  assert.ok(q.warnings.some(w=>w.includes('Construcción → Alimentos → Almacenamiento')));assert.ok(q.warnings.some(w=>w.includes('protegidas frente a retiros, ventas y otros trabajos')));assert.ok(q.warnings.some(w=>w.includes('necesita el transportista del modo paralelo')));
  await validateMvpQuote(f.store,f.owner,command,request,q.revision,q.token,q.expiresAt,f.at);
  for(const patch of[{priority:'food'},{reserveBuildMaterials:false},{urgentTransport:false}])await assert.rejects(validateMvpQuote(f.store,f.owner,{...command,...patch},request,q.revision,q.token,q.expiresAt,f.at),/no corresponde/);
  assert.deepEqual(f.store.record,before);
});

test('an industry-v3 signature cannot authorize the reservation policy but confirmed receipt retries stay exact',async()=>{
  const f=await fixture(),command={...f.command,priority:'stock',reserveBuildMaterials:true,urgentTransport:false},request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,command,request,f.at),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.store.record!.world.rngSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const payload=new TextEncoder().encode(JSON.stringify({owner:f.owner,command,request,revision:q.revision,expires:q.expiresAt,managerPolicy:'bounded-industry-v3'})),signed=await crypto.subtle.sign('HMAC',key,payload),oldToken=[...new Uint8Array(signed)].map(b=>b.toString(16).padStart(2,'0')).join('');
  await assert.rejects(validateMvpQuote(f.store,f.owner,command,request,q.revision,oldToken,q.expiresAt,f.at),/no corresponde/);
  await executeMvp(f.store,f.owner,command,request,q.revision,f.at);const after=structuredClone(f.store.record);
  await validateMvpQuote(f.store,f.owner,command,request,undefined,undefined,undefined,f.at);await executeMvp(f.store,f.owner,command,request,undefined,f.at);assert.deepEqual(f.store.record,after);
});

test('a construction approval previews only its actual partial lot allocation without spending or locking the saved inventory',async()=>{
  const f=await fixture(),getH=()=>f.store.record!.world.players[f.id].habitable!,shedId=String(f.command.supplyShedId),shed=getH().buildings.find(b=>b.id===shedId)!;
  await executeMvp(f.store,f.owner,{type:'habitat.walk',playerId:f.id,...habitableBuildingEntrance(getH(),shed)!},crypto.randomUUID(),undefined,f.at);f.at=getH().movement!.endsAt+1;await readMvpView(f.store,f.owner,f.id,f.at);
  for(const itemId of ['plank','stone']){const lot=f.store.record!.world.players[f.id].inventory.find(l=>l.itemId===itemId&&l.qty>0);assert.ok(lot);await executeMvp(f.store,f.owner,{type:'habitat.storage.deposit',playerId:f.id,buildingId:shedId,lotId:lot.id,qty:1},crypto.randomUUID(),undefined,f.at);}
  await executeMvp(f.store,f.owner,{...f.command,priority:'construction',reserveBuildMaterials:true,urgentTransport:false},crypto.randomUUID(),undefined,f.at);
  const h=getH(),spec={templateId:'house' as const,x:-11,y:4,rotation:0 as const};assert.equal(habitablePlacementError(h,spec,f.at),null);const command={type:'habitat.manager.approve-build',playerId:f.id,planId:h.manager!.id,...spec},before=structuredClone(f.store.record),request=crypto.randomUUID(),q=await quoteMvp(f.store,f.owner,command,request,f.at);
  assert.deepEqual(f.store.record,before);assert.deepEqual(q.changes,[]);assert.equal(q.durationSeconds,0);assert.ok(q.warnings.some(w=>w.includes('Reserva para esta obra:')&&w.includes('1 Tablón')&&w.includes('1 Piedra')&&w.includes('Pendiente de abastecimiento:')&&w.includes('1 Tejido')));
  await validateMvpQuote(f.store,f.owner,command,request,q.revision,q.token,q.expiresAt,f.at);assert.deepEqual(f.store.record,before);
});
