import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,readMvpView} from '../lib/mvp/engine.ts';
import {habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import {getSocialView} from '../lib/mvp/social.ts';
import {give} from '../lib/mvp/helpers.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpCommand,MvpWorld} from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
const NOW=Date.parse('2026-10-16T03:30:00Z');
type Fixture={store:MemoryStore;owner:string;id:string;shedId:string;at:number;initialRemaining:number};
const world=(s:Fixture)=>s.store.record!.world;
const player=(s:Fixture)=>world(s).players[s.id];
const contract=(s:Fixture)=>player(s).habitable!.commerce!.contracts.at(-1)!;
const act=(s:Fixture,command:MvpCommand)=>executeMvp(s.store,s.owner,{...command,playerId:s.id},crypto.randomUUID(),undefined,s.at);
async function read(s:Fixture,time:number){s.at=time;return readMvpView(s.store,s.owner,s.id,s.at);}
async function walk(s:Fixture,point:{x:number;y:number}){await act(s,{type:'habitat.walk',...point});await read(s,player(s).habitable!.movement!.endsAt+1);}
async function setup():Promise<Fixture>{
  const store=new MemoryStore(),owner='accounting-owner',created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Contabilidad comercial',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'carrier'},crypto.randomUUID(),undefined,NOW);
  const built=await executeMvp(store,owner,{type:'habitat.build',playerId:id,templateId:'shed',x:7,y:3,rotation:0},crypto.randomUUID(),undefined,NOW),b=built.player!.habitable!.buildings[0];
  const s={store,owner,id,shedId:b.id,at:b.endsAt+1,initialRemaining:store.record!.world.social.npc.remaining};await read(s,s.at);
  const stock=give(player(s),'plank',4,s.at,'existing-accounting-test-stock',[{itemId:'timber',qty:2}],false);player(s).inventory=player(s).inventory.filter(l=>l.id!==stock.id);stock.location=`habitat:${s.shedId}`;const shed=player(s).habitable!.buildings.find(v=>v.id===s.shedId)!;shed.storage=[stock];
  await walk(s,habitableBuildingEntrance(player(s).habitable!,shed)!);return s;
}
function balanced(s:Fixture,credits:number,escrow:number,spent:number){
  const before=structuredClone(world(s)),view=getSocialView(world(s),player(s),s.owner),admin=view.admin!;
  assert.ok(admin);assert.equal(view.account!.credits,credits);assert.equal(admin.creditCirculation,credits+escrow);assert.equal(admin.creditDiscrepancy,0);assert.equal(admin.creditNpcRemaining,s.initialRemaining-spent);assert.equal(admin.creditSourceBudget-admin.creditNpcRemaining,admin.creditCirculation);
  assert.equal(player(s).habitable?.commerce?.contracts.reduce((n,c)=>n+c.escrow,0)??0,escrow);assert.deepEqual(world(s),before,'Reading accounting must never create or move credits');
}

test('commercial reserves remain in circulation through acceptance, refund, a second contract and actual payment',async()=>{
  const s=await setup();balanced(s,0,0,0);assert.equal(world(s).social.ledger.length,0);
  await act(s,{type:'habitat.trade.accept',buildingId:s.shedId});balanced(s,0,12,12);assert.equal(world(s).social.ledger.length,0);
  await act(s,{type:'habitat.trade.cancel',buildingId:s.shedId});balanced(s,0,0,0);assert.equal(world(s).social.ledger.length,0);
  await read(s,contract(s).caravan.returnTrip!.endsAt+3001);balanced(s,0,0,0);
  await act(s,{type:'habitat.trade.accept',buildingId:s.shedId});balanced(s,0,12,12);assert.equal(player(s).habitable!.commerce!.contracts.length,2);
  await read(s,contract(s).caravan.approachEndsAt+1);await walk(s,{x:5.8,y:5.9});await act(s,{type:'habitat.trade.dispatch',buildingId:s.shedId});balanced(s,0,12,12);
  const unload=contract(s).caravan.delivery!.unloadsAt;await read(s,unload-1);balanced(s,0,12,12);assert.equal(world(s).social.ledger.length,0);
  await read(s,unload);balanced(s,12,0,12);assert.equal(world(s).social.ledger.length,1);assert.equal(world(s).social.ledger[0].amount,12);
  const done=structuredClone(world(s));await read(s,unload+1000);balanced(s,12,0,12);assert.deepEqual(world(s),done,'A later read cannot count escrow and payment twice');
});

test('an expired uncollected purchase releases its counted escrow without minting credits',async()=>{
  const s=await setup();await act(s,{type:'habitat.trade.accept',buildingId:s.shedId});balanced(s,0,12,12);const deadline=contract(s).deadline;
  await read(s,deadline);assert.equal(contract(s).status,'expired');balanced(s,0,0,0);assert.equal(world(s).social.ledger.length,0);
  const refunded=structuredClone(world(s));await read(s,deadline+1000);balanced(s,0,0,0);assert.deepEqual(world(s),refunded);
});
