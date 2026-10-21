import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,quoteMvp,readMvpView} from '../lib/mvp/engine.ts';
import {getHabitableManagerForecast} from '../lib/mvp/habitable-manager-forecast.ts';
import {habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import type {ItemId,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import type {MvpStore} from '../lib/mvp/store.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;writes=0;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){assert.equal(this.record,null);this.record={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}
}
const NOW=Date.parse('2026-10-17T02:00:00Z');
async function fixture(){
  const store=new MemoryStore(),owner='manager-forecast-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Artesana',stationName:'Previsión finita',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  const f={store,owner,id,at:NOW};
  await act(f,{type:'habitat.profile',appearance:'pine',profession:'farmer'});
  for(const spec of[{templateId:'shed',x:-2,y:-8,rotation:0},{templateId:'workbench',x:7,y:3,rotation:0},{templateId:'planter',x:8,y:6,rotation:0}]){
    await act(f,{type:'habitat.build',...spec});f.at=Math.max(...state(f).buildings.map(b=>b.endsAt))+1;await readMvpView(store,owner,id,f.at);
  }
  await act(f,{type:'habitat.residents.initialize'});
  const access=habitableBuildingEntrance(state(f),building(f,'shed'));assert.ok(access);
  await act(f,{type:'habitat.walk',...access});f.at=state(f).movement!.endsAt;await readMvpView(store,owner,id,f.at);
  return f;
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const world=(f:Fixture)=>f.store.record!.world;
const player=(f:Fixture)=>world(f).players[f.id];
const state=(f:Fixture)=>player(f).habitable!;
const building=(f:Fixture,templateId:string)=>{const found=state(f).buildings.find(b=>b.templateId===templateId);assert.ok(found);return found;};
const act=(f:Fixture,command:MvpCommand)=>executeMvp(f.store,f.owner,{...command,playerId:f.id},crypto.randomUUID(),undefined,f.at);
async function deposit(f:Fixture,itemId:ItemId,qty:number){
  const lot=player(f).inventory.find(l=>l.itemId===itemId&&l.qty>=qty);assert.ok(lot,'the real starter stock must fund every deposit');
  await act(f,{type:'habitat.storage.deposit',buildingId:building(f,'shed').id,lotId:lot.id,qty});
}
const command=(f:Fixture,patch:Record<string,unknown>={}):MvpCommand=>({type:'habitat.manager.start',playerId:f.id,supplyShedId:building(f,'shed').id,workbenchId:building(f,'workbench').id,planterId:building(f,'planter').id,goals:{ration:3,plank:0,cloth:0},durationMinutes:20,maxOrders:12,inputBudget:80,...patch});
const units=(items:readonly {itemId:ItemId;qty:number}[],itemId:ItemId)=>items.find(i=>i.itemId===itemId)?.qty??0;

test('forecast spends across physical input lots and cannot project three rations from only four grains',async()=>{
  const f=await fixture();for(const qty of[1,1,2])await deposit(f,'grain',qty);await deposit(f,'water',3);
  assert.deepEqual(building(f,'shed').storage!.filter(l=>l.itemId==='grain').map(l=>l.qty),[1,1,2]);
  await act(f,command(f,{planterId:undefined}));
  const before=structuredClone(f.store.record),forecast=getHabitableManagerForecast(world(f),player(f),f.at);assert.ok(forecast);
  assert.equal(forecast.projectedOrders,2);assert.equal(units(forecast.inputs,'grain'),4);assert.equal(units(forecast.inputs,'water'),2);assert.equal(units(forecast.outputs,'ration'),2);
  assert.deepEqual(f.store.record,before,'forecasting cannot debit, merge or remove the real source lots');
});

test('one remaining regional harvest does not authorize seed or nutrient preparation for a second harvest',async()=>{
  const f=await fixture();for(const[itemId,qty]of[['seed',1],['nutrient',1],['water',8],['biomass',3]] as const)await deposit(f,itemId,qty);
  const home=world(f).tiles[player(f).settlement!.homeTileId];world(f).regions[home.regionId].farmRemaining=1;
  await act(f,command(f,{goals:{ration:5,plank:0,cloth:0},replenishFarmInputs:true}));
  const before=structuredClone(f.store.record),forecast=getHabitableManagerForecast(world(f),player(f),f.at);assert.ok(forecast);
  assert.equal(forecast.farm.regionCycles,1);assert.equal(forecast.projectedOrders,2,'one crop and one ration order are supported by the current stock and finite quota');
  assert.equal(units(forecast.outputs,'grain'),3);assert.equal(units(forecast.outputs,'ration'),1);assert.equal(units(forecast.outputs,'seed'),0);assert.equal(units(forecast.outputs,'nutrient'),0);assert.equal(units(forecast.inputs,'biomass'),0,'no nutrient recipe is prepared for a harvest the region cannot supply');
  assert.deepEqual(f.store.record,before);assert.equal(player(f).farmCycles,0);assert.equal(world(f).regions[home.regionId].farmRemaining,1);
});

test('quote and repeated direct forecasts are pure projections with no jobs, lots, quota changes or writes',async()=>{
  const f=await fixture();await deposit(f,'grain',5);await deposit(f,'water',5);
  const start=command(f,{goals:{ration:2,plank:0,cloth:0},replenishFarmInputs:true,reserves:{grain:1}}),initial=structuredClone(f.store.record),writes=f.store.writes;
  assert.equal(getHabitableManagerForecast(world(f),player(f),f.at),null,'a legacy district does not acquire a manager from a projection');
  const quote=await quoteMvp(f.store,f.owner,start,crypto.randomUUID(),f.at);assert.ok(quote.managerForecast);assert.equal(quote.managerForecast.conditional,true);assert.equal(quote.managerForecast.projectedOrders,2);assert.deepEqual(quote.changes,[]);assert.deepEqual(quote.expectedOutputs,[]);
  assert.deepEqual(f.store.record,initial);assert.equal(f.store.writes,writes);assert.equal(state(f).manager,undefined);
  await act(f,start);const before=structuredClone(f.store.record),afterWrites=f.store.writes;
  const first=getHabitableManagerForecast(world(f),player(f),f.at);assert.ok(first);
  assert.deepEqual(getHabitableManagerForecast(world(f),player(f),f.at),first);
  assert.equal(units(first.outputs,'ration'),2);assert.equal(units(first.inputs,'grain'),4);
  assert.deepEqual(f.store.record,before);assert.equal(f.store.writes,afterWrites);assert.equal(Object.values(world(f).jobs).filter(j=>j.payload.managerPlanId).length,0);
  assert.ok(building(f,'shed').storage!.every(l=>!l.id.startsWith('forecast:')&&l.provenance.source!=='forecast-only'));
});
