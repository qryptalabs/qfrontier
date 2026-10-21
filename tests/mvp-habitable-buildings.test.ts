import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, readMvpView, quoteMvp } from '../lib/mvp/engine.ts';
import { HABITABLE_SPAWN, habitableBuildingEntrance, habitableLineClear, habitablePath, habitablePlacementError } from '../lib/mvp/habitable-data.ts';
import type { HabitableBuilding, HabitableTemplateId } from '../lib/mvp/habitable-data.ts';
import { give, nextLotId } from '../lib/mvp/helpers.ts';
import { dispatchSocial, settleSocial } from '../lib/mvp/social.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { Faction, InventoryLot, MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(!this.record||this.record.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
const NOW=Date.parse('2026-10-16T03:30:00Z');
async function setup(templateId:HabitableTemplateId='shed',faction:Faction='cartographers'){
  const store=new MemoryStore(),owner='facility-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Taller del valle',faction},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'carpenter'},crypto.randomUUID(),undefined,NOW);
  const built=await executeMvp(store,owner,{type:'habitat.build',playerId:id,templateId,x:-2,y:-8,rotation:0},crypto.randomUUID(),undefined,NOW),buildingId=built.player!.habitable!.buildings[0].id,readyAt=built.player!.habitable!.buildings[0].endsAt+1;
  await readMvpView(store,owner,id,readyAt);return{store,owner,id,buildingId,readyAt};
}
type Fixture=Awaited<ReturnType<typeof setup>>;
const act=(s:Fixture,command:MvpCommand,now=s.readyAt,requestId=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...command,playerId:s.id},requestId,undefined,now);
const player=(s:Fixture)=>s.store.record!.world.players[s.id];
const building=(s:Fixture)=>player(s).habitable!.buildings.find(b=>b.id===s.buildingId)!;
async function go(s:Fixture,now=s.readyAt){const access=habitableBuildingEntrance(player(s).habitable!,building(s));assert.ok(access,'physical facility access');const walking=await act(s,{type:'habitat.walk',...access},now),at=walking.player!.habitable!.movement!.endsAt+1;await readMvpView(s.store,s.owner,s.id,at);return at;}
const units=(lots:InventoryLot[],itemId:string)=>lots.filter(l=>l.itemId===itemId).reduce((sum,l)=>sum+l.qty,0);
const both=(s:Fixture)=>[...player(s).inventory,...(building(s).storage??[])];

test('existing completed buildings gain derived facilities without charging, initializing private fields or rewriting legacy saves',async()=>{
  const s=await setup('workbench'),before=structuredClone(s.store.record!),view=await readMvpView(s.store,s.owner,s.id,s.readyAt);
  assert.deepEqual(s.store.record,before);assert.equal(view.habitable.facilities[0].ready,true);assert.ok(view.habitable.facilities[0].access);assert.equal(view.habitable.facilities[0].recipes.length,5);assert.equal(building(s).storage,undefined);assert.equal(building(s).operation,undefined);assert.equal(building(s).visual,undefined);
  assert.deepEqual(view.player!.buildings,before.world.players[s.id].buildings);assert.deepEqual(view.player!.inventory,before.world.players[s.id].inventory);
  assert.equal(view.player!.habitable!.buildings[0].visual!.state,'idle');assert.equal(view.habitable.state!.buildings[0].visual!.state,'idle');assert.equal(view.habitable.actors[0].state.buildings[0].visual!.state,'idle');
});

test('authored collision bounds expose a real safe path to the old workbench and all three templates retain an exterior access',()=>{
  const state={version:1 as const,appearance:'amber' as const,profession:'carpenter' as const,position:{...HABITABLE_SPAWN},buildings:[] as HabitableBuilding[]};
  for(const templateId of['shed','workbench','planter']as const){const b:HabitableBuilding={id:templateId,templateId,x:-2,y:-8,rotation:0,startsAt:0,endsAt:0,bound:true};assert.equal(habitablePlacementError(state,b),null);const proposed={...state,buildings:[b]},access=habitableBuildingEntrance(proposed,b);assert.ok(access);const path=habitablePath(proposed,HABITABLE_SPAWN,access);assert.ok(path);for(let i=1;i<path.length;i++)assert.equal(habitableLineClear(path[i-1],path[i],proposed),true);}
});

test('storage moves actual lots, preserves lineage and all economic metadata, and cannot feed ordinary crafting while stored',async()=>{
  const s=await setup(),at=await go(s),p=player(s),lot=p.inventory.find(l=>l.itemId==='timber')!;lot.quality=2;lot.wear=7;lot.expiresAt=at+3600000;const before=structuredClone(lot),total=lot.qty;
  const deposited=await act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:2},at),stored=deposited.habitable.facilities[0].storage!.lots[0];
  assert.notEqual(stored.id,before.id);assert.equal(stored.originLotId,before.id);assert.equal(player(s).inventory.find(l=>l.id===before.id)!.originLotId,before.id);assert.equal(stored.qty,2);assert.equal(stored.location,`habitat:${s.buildingId}`);
  for(const key of['bound','quality','wear','expiresAt','provenance']as const)assert.deepEqual(stored[key],before[key]);assert.equal(units(both(s),'timber'),total);
  const remaining=player(s).inventory.find(l=>l.itemId==='timber')!;await act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:remaining.id,qty:remaining.qty},at+1);
  await assert.rejects(act(s,{type:'craft.start',recipeId:'plank',qty:1},at+2),/Faltan/);assert.equal(units(player(s).inventory,'timber'),0);
  const withdrew=await act(s,{type:'habitat.storage.withdraw',buildingId:s.buildingId,lotId:stored.id,qty:1},at+3),one=withdrew.player!.inventory.find(l=>l.itemId==='timber')!;
  assert.equal(one.originLotId,before.id);assert.equal(one.location,'station');for(const key of['bound','quality','wear','expiresAt','provenance']as const)assert.deepEqual(one[key],before[key]);assert.equal(units(both(s),'timber'),total);
});

test('the eighty-unit capacity is real and deposit/withdraw transport retries cannot duplicate lots',async()=>{
  const s=await setup(),at=await go(s),lot=give(player(s),'stone',81,at,'test-existing-budget'),id=crypto.randomUUID(),command={type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:80};
  const quote=await quoteMvp(s.store,s.owner,{...command,playerId:s.id},id,at);assert.match(quote.warnings.join(' '),/Transferencia al cobertizo/);assert.equal(building(s).storage,undefined);
  await act(s,command,at,id);await act(s,command,at+1,id);assert.equal(building(s).storage!.reduce((n,l)=>n+l.qty,0),80);assert.equal(player(s).inventory.find(l=>l.id===lot.id)!.qty,1);
  const before=structuredClone(s.store.record);await assert.rejects(act(s,{...command,qty:1},at+2),/ochenta/);assert.deepEqual(s.store.record,before);
  const stored=building(s).storage![0],withdrawId=crypto.randomUUID(),withdraw={type:'habitat.storage.withdraw',buildingId:s.buildingId,lotId:stored.id,qty:80};await act(s,withdraw,at+3,withdrawId);await act(s,withdraw,at+4,withdrawId);assert.equal(building(s).storage!.length,0);assert.equal(units(player(s).inventory.filter(l=>l.provenance.source==='test-existing-budget'),'stone'),81);
});

test('food ages in storage and expires consistently without refresh or permanent phantom capacity',async()=>{
  const s=await setup(),at=await go(s),before=units(player(s).inventory,'ration'),lot=give(player(s),'ration',2,at,'test-food');lot.expiresAt=at+1000;const expiry=lot.expiresAt;await act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:2},at);
  assert.equal(building(s).storage![0].expiresAt,expiry);const aged=await readMvpView(s.store,s.owner,s.id,expiry);assert.equal(aged.habitable.facilities[0].storage!.used,0);assert.equal(units(player(s).inventory,'ration'),before);await assert.rejects(act(s,{type:'habitat.storage.withdraw',buildingId:s.buildingId,lotId:lot.id,qty:1},expiry),/no está disponible/);
});

test('installation actions enforce completion, ownership, proximity, stationarity and the matching building kind',async()=>{
  const s=await setup(),lot=player(s).inventory[0];await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:1},NOW),/construcción/);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:1}),/Acércate/);
  await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:'another-owner-building',lotId:lot.id,qty:1}),/no pertenece/);
  const access=habitableBuildingEntrance(player(s).habitable!,building(s))!;await act(s,{type:'habitat.walk',...access},s.readyAt);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:1},s.readyAt+1),/llegar/);
  const at=player(s).habitable!.movement!.endsAt+1;await readMvpView(s.store,s.owner,s.id,at);await assert.rejects(act(s,{type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'plank'},at),/no es una mesa/);
  await assert.rejects(executeMvp(s.store,'foreign-owner',{type:'habitat.storage.deposit',playerId:s.id,buildingId:s.buildingId,lotId:lot.id,qty:1},crypto.randomUUID(),undefined,at),/no pertenece/);
  await act(s,{type:'world.travel',tileId:'t_4_3'},at+1);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:1},at+2),/llegar/);assert.equal(building(s).storage,undefined);
});

test('the workbench debits the exact original recipe, completes once at its real time and has an independent single slot',async()=>{
  const s=await setup('workbench'),at=await go(s),before=units(player(s).inventory,'timber'),command={type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'plank'},request=crypto.randomUUID(),quote=await quoteMvp(s.store,s.owner,{...command,playerId:s.id},request,at);
  assert.equal(quote.durationSeconds,300);assert.deepEqual(quote.expectedOutputs,[{itemId:'plank',qty:1}]);assert.deepEqual(quote.changes,[{itemId:'timber',delta:-2}]);assert.equal(building(s).operation,undefined);
  const ordered=await act(s,command,at,request),op=ordered.habitable.facilities[0].operation!;assert.equal(units(player(s).inventory,'timber'),before-2);assert.equal(units(player(s).inventory,'plank'),0);assert.equal(op.endsAt-op.startsAt,300000);assert.equal(ordered.habitable.state!.buildings[0].visual!.recipeId,'plank');
  await assert.rejects(act(s,command,at+1),/ranura/);await assert.rejects(act(s,{type:'job.cancel',jobId:op.jobId},at+1),/instalación/);await readMvpView(s.store,s.owner,s.id,op.endsAt-1);assert.equal(units(player(s).inventory,'plank'),0);
  const complete=await readMvpView(s.store,s.owner,s.id,op.endsAt),plank=complete.habitable.facilities[0].logistics!.pending.find(l=>l.itemId==='plank')!;assert.equal(plank.qty,1);assert.equal(plank.bound,true);assert.equal(plank.provenance.source,`recipe:plank:${op.jobId}`);assert.deepEqual(plank.provenance.inputs,[{itemId:'timber',qty:2}]);assert.equal(complete.habitable.facilities[0].operation!.status,'completed');assert.equal(complete.habitable.state!.buildings[0].visual!.state,'idle');
  await act(s,command,op.endsAt+1,request);await readMvpView(s.store,s.owner,s.id,op.endsAt+1000);assert.equal(units(building(s).pending??[],'plank'),1);assert.equal(units(player(s).inventory,'plank'),0);
});

test('workbench cancellation consumes started inputs, frees only its own slot, and never grants cancelled production',async()=>{
  const s=await setup('workbench','forgers'),at=await go(s),before=units(player(s).inventory,'timber'),start=await act(s,{type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'plank'},at),op=start.habitable.facilities[0].operation!;assert.equal(op.endsAt-op.startsAt,270000);
  const cancel={type:'habitat.facility.cancel',buildingId:s.buildingId,jobId:op.jobId},request=crypto.randomUUID();await act(s,cancel,at+1,request);await act(s,cancel,at+2,request);assert.equal(units(player(s).inventory,'timber'),before-2);await readMvpView(s.store,s.owner,s.id,op.endsAt+1);assert.equal(units(player(s).inventory,'plank'),0);await assert.rejects(act(s,cancel,op.endsAt+1),/terminó/);
  await assert.rejects(act(s,{type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'pickaxe'},op.endsAt+2),/no admite/);const next=await act(s,{type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'seed'},op.endsAt+2);assert.notEqual(next.habitable.facilities[0].operation!.jobId,op.jobId);
});

test('physical workbenches do not consume legacy workshop slots or alter original building levels',async()=>{
  const s=await setup('workbench'),at=await go(s),levels=structuredClone(player(s).buildings);
  for(let i=0;i<3;i++)await act(s,{type:'craft.start',recipeId:'cloth',qty:1},at+i);
  await assert.rejects(act(s,{type:'craft.start',recipeId:'cloth',qty:1},at+3),/cola/);
  const working=await act(s,{type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'plank'},at+3);assert.equal(working.habitable.facilities[0].operation!.status,'running');assert.deepEqual(player(s).buildings,levels);assert.equal(working.jobs.filter(j=>j.kind==='craft'&&(j.status==='running'||j.status==='reserved')).length,4);
});

test('a workbench can make genuine transferable products only from genuine unbound inputs',async()=>{
  const s=await setup('workbench'),at=await go(s),p=player(s);p.inventory=p.inventory.filter(l=>l.itemId!=='timber');give(p,'timber',2,at,'test-previous-natural-extraction');
  const ordered=await act(s,{type:'habitat.workbench.start',buildingId:s.buildingId,recipeId:'plank'},at),op=ordered.habitable.facilities[0].operation!,done=await readMvpView(s.store,s.owner,s.id,op.endsAt),plank=done.habitable.facilities[0].logistics!.pending.find(l=>l.itemId==='plank')!;
  assert.equal(plank.bound,false);assert.equal(units(player(s).inventory,'timber'),0);assert.equal(plank.provenance.source,`recipe:plank:${op.jobId}`);assert.deepEqual(plank.provenance.inputs,[{itemId:'timber',qty:2}]);assert.ok(s.store.record!.world.jobs[op.jobId].costs.every(l=>!l.bound&&l.provenance.source==='test-previous-natural-extraction'));
});

test('planters consume existing regional and parcel cycles and harvest genuine bound traceable food exactly once',async()=>{
  const s=await setup('planter'),at=await go(s),world=s.store.record!.world,p=player(s),home=world.tiles[p.settlement!.homeTileId],remaining=world.regions[home.regionId].farmRemaining,before=units(p.inventory,'grain'),command={type:'habitat.planter.start',buildingId:s.buildingId},request=crypto.randomUUID(),quote=await quoteMvp(s.store,s.owner,{...command,playerId:s.id},request,at);
  assert.equal(quote.durationSeconds,45);assert.deepEqual(quote.expectedOutputs,[{itemId:'grain',qty:3},{itemId:'biomass',qty:1}]);const started=await act(s,command,at,request),op=started.habitable.facilities[0].operation!;assert.equal(player(s).farmCycles,1);assert.equal(s.store.record!.world.regions[home.regionId].farmRemaining,remaining-1);assert.equal(units(player(s).inventory,'grain'),before);
  await assert.rejects(act(s,command,at+1),/ranura/);await readMvpView(s.store,s.owner,s.id,op.endsAt-1);assert.equal(units(player(s).inventory,'grain'),before);const harvested=await readMvpView(s.store,s.owner,s.id,op.endsAt);assert.equal(units(player(s).inventory,'grain'),before);assert.equal(units(building(s).pending??[],'grain'),3);const grain=harvested.habitable.facilities[0].logistics!.pending.find(l=>l.provenance.source===`farm:${op.jobId}`&&l.itemId==='grain')!;assert.equal(grain.bound,true);assert.equal(grain.provenance.inputs.length,3);assert.equal(player(s).stats.farms,1);
  await act(s,command,op.endsAt+1,request);await readMvpView(s.store,s.owner,s.id,op.endsAt+1000);assert.equal(units(player(s).inventory,'grain'),before);assert.equal(units(building(s).pending??[],'grain'),3);assert.equal(player(s).farmCycles,1);
});

test('a cancelled started crop never restores quota or inputs and original farming shares the same final cycle',async()=>{
  const s=await setup('planter'),at=await go(s),home=s.store.record!.world.tiles[player(s).settlement!.homeTileId],region=s.store.record!.world.regions[home.regionId],remaining=region.farmRemaining;player(s).farmCycles=9;
  const started=await act(s,{type:'habitat.planter.start',buildingId:s.buildingId},at),op=started.habitable.facilities[0].operation!;await act(s,{type:'habitat.facility.cancel',buildingId:s.buildingId,jobId:op.jobId},at+1);assert.equal(player(s).farmCycles,10);assert.equal(s.store.record!.world.regions[home.regionId].farmRemaining,remaining-1);
  await assert.rejects(act(s,{type:'farm.start'},at+2),/diez ciclos/);await assert.rejects(act(s,{type:'habitat.planter.start',buildingId:s.buildingId},at+2),/diez ciclos/);await readMvpView(s.store,s.owner,s.id,op.endsAt+1);assert.equal(player(s).stats.farms,0);
});

test('exhausted region budgets and unsafe home biomes cannot yield planter food or debit ingredients',async()=>{
  const s=await setup('planter'),at=await go(s),world=s.store.record!.world,home=world.tiles[player(s).settlement!.homeTileId];world.regions[home.regionId].farmRemaining=0;const before=structuredClone(player(s).inventory);await assert.rejects(act(s,{type:'habitat.planter.start',buildingId:s.buildingId},at),/regional/);assert.deepEqual(player(s).inventory,before);assert.equal(player(s).farmCycles,0);
  world.regions[home.regionId].farmRemaining=5;home.biome='desert';await assert.rejects(act(s,{type:'habitat.planter.start',buildingId:s.buildingId},at),/bosque o llanura/);assert.deepEqual(player(s).inventory,before);
});

test('public village actors reveal only geometry and visual aggregates, never storage lots, provenance or operation references',async()=>{
  const s=await setup(),at=await go(s),lot=give(player(s),'grain',3,at,'private-stash-marker');await act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:3},at);
  (building(s)as HabitableBuilding&{secret?:string}).secret='private-secret-marker';const foreign=await readMvpView(s.store,'foreign-owner',undefined,at+1),publicBuilding=foreign.habitable.actors.find(a=>a.playerId===s.id)!.state.buildings[0],serialized=JSON.stringify(foreign);
  assert.equal(publicBuilding.storage,undefined);assert.equal(publicBuilding.operation,undefined);assert.equal(publicBuilding.visual!.storedUnits,3);assert.equal(publicBuilding.visual!.capacity,80);assert.equal(foreign.habitable.facilities.length,0);assert.equal(foreign.players.length,0);assert.equal(foreign.jobs.length,0);assert.ok(!serialized.includes('private-stash-marker'));assert.ok(!serialized.includes('private-secret-marker'));assert.ok(!serialized.includes(lot.id));
});

test('splitting and storing a quality lot preserves one reward origin, while new lot IDs never collide with shelves',async()=>{
  const s=await setup(),at=await go(s),lot=give(player(s),'grain',8,at,'quality-production');lot.quality=2;player(s).stats.crafted=20;
  const multiplier=(source:MvpWorld)=>{const world=structuredClone(source);settleSocial(world,at);dispatchSocial(world,{type:'reward.close',playerId:s.id},{ownerId:s.owner,requestId:crypto.randomUUID(),now:at,actor:world.players[s.id]});return world.social.rewards.allocations.find(a=>a.playerId===s.id)!.multiplier;};
  const before=multiplier(s.store.record!.world);await act(s,{type:'habitat.storage.deposit',buildingId:s.buildingId,lotId:lot.id,qty:6},at);const stored=building(s).storage![0];for(let i=0;i<3;i++)await act(s,{type:'habitat.storage.withdraw',buildingId:s.buildingId,lotId:stored.id,qty:1},at+i+1);
  const qualityLots=both(s).filter(l=>l.provenance.source==='quality-production');assert.equal(qualityLots.length,5);assert.equal(new Set(qualityLots.map(l=>l.originLotId??l.id)).size,1);assert.equal(qualityLots.reduce((n,l)=>n+l.qty,0),8);assert.equal(multiplier(s.store.record!.world),before);
  const p=player(s);p.lotSequence=100;building(s).storage!.push({...structuredClone(stored),id:`lot_${p.id}_101`,qty:1});assert.equal(nextLotId(p),`lot_${p.id}_102`);
});
