import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {executeMvp,quoteMvp,readMvpView} from '../lib/mvp/engine.ts';
import {advanceHabitableManagerHistory} from '../lib/mvp/habitable-manager.ts';
import {habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import type {ItemId,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import type {MvpStore} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T02:00:00Z');
class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null=null;writes=0;async read(){return structuredClone(this.record);}async insert(world:MvpWorld){assert.equal(this.record,null);this.record={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}}
async function setup(stock=true,at=NOW){const store=new MemoryStore(),owner='manager-owner',view=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Turno finito',faction:'cartographers'},crypto.randomUUID(),undefined,at),s={store,owner,id:view.player!.id,at};await act(s,{type:'habitat.profile',appearance:'pine',profession:'farmer'});
  for(const plan of[{templateId:'shed',x:-2,y:-8,rotation:0},{templateId:'workbench',x:7,y:3,rotation:0},{templateId:'planter',x:8,y:6,rotation:0}]){await act(s,{type:'habitat.build',...plan});s.at=Math.max(...state(s).buildings.map(b=>b.endsAt));await read(s);}await act(s,{type:'habitat.residents.initialize'});
  if(stock){await go(s,habitableBuildingEntrance(state(s),b(s,'shed'))!);for(const[itemId,qty]of[['timber',2],['fiber',3],['water',3],['seed',1],['nutrient',1]]as const)await deposit(s,itemId,qty);await go(s,{x:0,y:1.5});}return s;
}
type Fixture=Awaited<ReturnType<typeof setup>>;
const world=(s:Fixture)=>s.store.record!.world;
const player=(s:Fixture)=>world(s).players[s.id];
const state=(s:Fixture)=>player(s).habitable!;
const b=(s:Fixture,type:string)=>state(s).buildings.find(b=>b.templateId===type)!;
const manager=(s:Fixture)=>state(s).manager!;
const read=(s:Fixture)=>readMvpView(s.store,s.owner,s.id,s.at);
const act=(s:Fixture,c:MvpCommand,request=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...c,playerId:s.id},request,undefined,s.at);
async function go(s:Fixture,point:{x:number;y:number}){await act(s,{type:'habitat.walk',...point});s.at=state(s).movement!.endsAt;await read(s);}
async function deposit(s:Fixture,itemId:ItemId,qty:number){let left=qty;for(const lot of structuredClone(player(s).inventory).filter(l=>l.itemId===itemId)){const use=Math.min(left,lot.qty);if(use){await act(s,{type:'habitat.storage.deposit',buildingId:b(s,'shed').id,lotId:lot.id,qty:use});left-=use;}if(!left)break;}assert.equal(left,0,'the real starter inventory must fund all fixture inputs');}
const config=(s:Fixture):MvpCommand=>({type:'habitat.manager.start',supplyShedId:b(s,'shed').id,workbenchId:b(s,'workbench').id,planterId:b(s,'planter').id,goals:{ration:1,plank:1,cloth:1},durationMinutes:20,maxOrders:6,inputBudget:24});
const jobs=(s:Fixture)=>Object.values(world(s).jobs).filter(j=>j.payload.managerPlanId===manager(s).id);
const shelfQty=(s:Fixture,id:ItemId)=>b(s,'shed').storage!.filter(l=>l.itemId===id).reduce((n,l)=>n+l.qty,0);
async function next(s:Fixture){const at=manager(s).nextAt;assert.ok(at!==null&&at>=s.at);s.at=at;return read(s);}

test('all canonical manager actions pass the unchanged authenticated HTTP action parser',async()=>{
  const hook=registerHooks({resolve(specifier,context,next){if(specifier==='../../app/chatgpt-auth.ts')return{url:`data:text/javascript,${encodeURIComponent('export async function getChatGPTUser(){return {userId:"manager-http-owner"};}')}`,shortCircuit:true};return next(specifier,context);}});
  const {actionRequest,actionSchema}=await import('../lib/mvp/http.ts');hook.deregister();
  for(const suffix of['start','pause','resume','approve-build','revoke-build']){
    const command={type:`habitat.manager.${suffix}`,playerId:'player-http-owner',planId:'plan'},requestId=crypto.randomUUID(),request=new Request('https://game.example/api/mvp/quote',{method:'POST',headers:{origin:'https://game.example'},body:JSON.stringify({requestId,command})}),parsed=await actionRequest(request);
    assert.deepEqual(parsed.body.command,command);assert.equal(parsed.body.requestId,requestId);assert.equal(parsed.user.userId,'manager-http-owner');
  }
  for(const suffix of['approveBuild','revokeBuild'])assert.equal(actionSchema.safeParse({requestId:crypto.randomUUID(),command:{type:`habitat.manager.${suffix}`}}).success,false,'camel-case actions must not widen the shared HTTP command policy');
});

test('the legacy world remains unchanged on reads and JSON cannot impersonate trusted manager authority',async()=>{
  const s=await setup(false),before=structuredClone(s.store.record),writes=s.store.writes;await read(s);s.at+=1000;await read(s);assert.deepEqual(s.store.record,before);assert.equal(s.store.writes,writes);assert.equal(state(s).manager,undefined);
  await assert.rejects(act(s,{type:'habitat.workbench.start',buildingId:b(s,'workbench').id,recipeId:'plank',supplyShedId:b(s,'shed').id,manager:{planId:'forged',turnId:'forged',sequence:1}}),/Acércate/);assert.deepEqual(s.store.record,before);
});

test('an authorized offline turn grows grain and produces its real stock goals with four orders, unchanged costs and exact selected-shed delivery',async()=>{
  const s=await setup(),inventory=structuredClone(player(s).inventory),finance=structuredClone(world(s).social.accounts),npc=world(s).social.npc.remaining,quota=player(s).farmCycles,request=crypto.randomUUID(),cmd=config(s),before=structuredClone(s.store.record),quote=await quoteMvp(s.store,s.owner,{...cmd,playerId:s.id},request,s.at);assert.deepEqual(s.store.record,before);assert.equal(quote.changes.length,0);
  await act(s,cmd,request);assert.equal(jobs(s).length,0);const end=manager(s).turn.endsAt;await act(s,cmd,request);assert.equal(jobs(s).length,0);s.at=end+600000;const view=await read(s);
  assert.equal(manager(s).turn.startedOrders,4);assert.equal(manager(s).turn.completedOrders,4);assert.equal(jobs(s).length,4);assert.equal(manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0),12);assert.equal(player(s).farmCycles,quota+1);assert.deepEqual(player(s).inventory,inventory);assert.deepEqual(world(s).social.accounts,finance);assert.equal(world(s).social.npc.remaining,npc);
  for(const id of['ration','plank','cloth']as const)assert.equal(shelfQty(s,id),1);assert.equal(shelfQty(s,'grain'),1);assert.equal(shelfQty(s,'biomass'),1);assert.equal(view.activity!.progression.xp,135);
  assert.ok(jobs(s).every(j=>j.createdAt<end&&j.payload.outputShedId===b(s,'shed').id&&j.payload.testBoost===undefined&&j.status==='completed'));
  assert.equal(manager(s).status,'expired');const done=structuredClone(s.store.record);await read(s);assert.deepEqual(s.store.record,done);
});

test('pause drains the real order without cancelling or refunding limits and resume authorizes a fresh bounded turn',async()=>{
  const s=await setup();await act(s,config(s));await next(s);const first=jobs(s)[0],spent=manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0);assert.equal(first.kind,'farm');await act(s,{type:'habitat.manager.pause',planId:manager(s).id});assert.equal(manager(s).status,'draining');const oldTurn=manager(s).turn.id;
  await assert.rejects(act(s,{type:'habitat.manager.resume',planId:manager(s).id,durationMinutes:10,maxOrders:2,inputBudget:6}),/regreso/);s.at+=600000;await read(s);assert.equal(manager(s).status,'paused');assert.equal(jobs(s).length,1);assert.equal(jobs(s)[0].status,'completed');assert.equal(manager(s).turn.startedOrders,1);assert.equal(manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0),spent);
  const resumedAt=s.at;await act(s,{type:'habitat.manager.resume',planId:manager(s).id,durationMinutes:10,maxOrders:2,inputBudget:6});assert.notEqual(manager(s).turn.id,oldTurn);assert.equal(manager(s).turn.startedOrders,0);await next(s);assert.ok(jobs(s).some(j=>j.createdAt>resumedAt));
});

test('order and input caps reject excess work before inputs or finite farming quotas are touched',async()=>{
  const s=await setup();await act(s,{...config(s),maxOrders:1,inputBudget:4});s.at+=1800000;await read(s);assert.equal(jobs(s).length,1);assert.equal(manager(s).turn.startedOrders,1);assert.equal(manager(s).turn.completedOrders,1);assert.equal(manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0),4);assert.equal(player(s).farmCycles,1);assert.equal(shelfQty(s,'ration'),0);
  const tiny=await setup();await act(tiny,{...config(tiny),maxOrders:12,inputBudget:2});tiny.at+=1800000;await read(tiny);assert.equal(jobs(tiny).length,1);assert.equal(jobs(tiny)[0].payload.recipeId,'plank');assert.equal(manager(tiny).turn.committedInputs.reduce((n,i)=>n+i.qty,0),2);assert.equal(player(tiny).farmCycles,0,'a rejected farm candidate cannot debit soil quota');assert.equal(shelfQty(tiny,'seed'),1);assert.equal(shelfQty(tiny,'nutrient'),1);
});

test('a blocked plan never backdates late deposited material, and unchanged waiting reads perform no writes',async()=>{
  const s=await setup(false);await act(s,{...config(s),goals:{ration:0,plank:1,cloth:0},durationMinutes:20});const start=s.at;s.at=start+300000;await read(s);assert.equal(jobs(s).length,0);const before=structuredClone(s.store.record),writes=s.store.writes;await read(s);s.at++;await read(s);assert.deepEqual(s.store.record,before);assert.equal(s.store.writes,writes);
  s.at=start+360000;await go(s,habitableBuildingEntrance(state(s),b(s,'shed'))!);await deposit(s,'timber',2);const depositedAt=s.at;await go(s,{x:0,y:1.5});s.at++;await read(s);assert.equal(jobs(s).length,1);assert.ok(jobs(s)[0].createdAt>=depositedAt);assert.ok(jobs(s)[0].startsAt>depositedAt);assert.equal(jobs(s)[0].costs.length,0,'the held lot is consumed only after its physical input trip');
});

test('managed checkpoints do not settle another explorer or repeat their legacy automation',async()=>{
  const s=await setup(),otherOwner='other-owner',other=(await executeMvp(s.store,otherOwner,{type:'player.create',name:'Nora',stationName:'Legado',faction:'cartographers'},crypto.randomUUID(),undefined,s.at)).player!;
  await executeMvp(s.store,otherOwner,{type:'craft.start',playerId:other.id,recipeId:'plank',qty:1},crypto.randomUUID(),undefined,s.at);const otherJob=Object.values(world(s).jobs).find(j=>j.playerId===other.id)!,savedPlayer=structuredClone(world(s).players[other.id]),savedJob=structuredClone(otherJob);
  await act(s,config(s));const memory=structuredClone(world(s));advanceHabitableManagerHistory(memory,s.at+1800000);assert.deepEqual(memory.players[other.id],savedPlayer);assert.deepEqual(memory.jobs[otherJob.id],savedJob);assert.ok(Object.values(memory.jobs).some(j=>j.playerId===s.id&&j.payload.managerPlanId&&j.status==='completed'));
});

test('exhausting the shared checkpoint cap pauses only still-overdue plans and preserves future turns exactly',async()=>{
  const s=await setup(false);await act(s,config(s));const memory=structuredClone(world(s)),template=structuredClone(player(s)),at=s.at+1;
  memory.players={};
  for(let index=0;index<193;index++){const id=`due-${String(index).padStart(3,'0')}`,p=structuredClone(template);p.id=id;p.habitable!.manager!.nextAt=at;memory.players[id]=p;}
  const future=structuredClone(template);future.id='future-turn';future.habitable!.manager!.nextAt=at+1000;memory.players[future.id]=future;const preserved=structuredClone(future);
  advanceHabitableManagerHistory(memory,at);
  assert.deepEqual(memory.players[future.id],preserved,'another account exhausting checkpoints cannot pause or alter a future turn');
  const due=Object.values(memory.players).filter(p=>p.id.startsWith('due-')).map(p=>p.habitable!.manager!);
  assert.equal(due.filter(m=>m.status==='paused').length,1,'only the final overdue checkpoint is safely paused');
  assert.equal(due.filter(m=>m.status==='active'&&m.nextAt===null).length,192,'already processed blocked plans have no overdue work and remain authorized');
  assert.equal(Object.keys(memory.jobs).length,0);assert.ok(due.every(m=>m.turn.startedOrders===0&&m.turn.committedInputs.length===0));
});

test('invalid limits and foreign sources are atomic and cannot consume a boost pass or create an unapproved building',async()=>{
  const s=await setup(),base=config(s);for(const patch of[{durationMinutes:30},{maxOrders:13},{inputBudget:81},{goals:{ration:0,plank:0,cloth:0}},{supplyShedId:'foreign'},{useTestBoost:true}]){const before=structuredClone(s.store.record);await assert.rejects(act(s,{...base,...patch}));assert.deepEqual(s.store.record,before);}await act(s,base);const count=state(s).buildings.length;s.at+=1800000;await read(s);assert.equal(state(s).buildings.length,count);
});

test('an exact approved blueprint survives pause, prevents silent plan replacement and can be revoked only before execution',async()=>{
  const s=await setup();await act(s,config(s));await act(s,{type:'habitat.manager.pause',planId:manager(s).id});const before=structuredClone(player(s).inventory),sources=structuredClone(b(s,'shed').storage),planId=manager(s).id;
  await act(s,{type:'habitat.manager.approve-build',planId,templateId:'workbench',x:-3,y:1,rotation:0});const a=manager(s).approvals[0];assert.deepEqual(player(s).inventory,before);assert.deepEqual(b(s,'shed').storage,sources);assert.equal(a.status,'approved');assert.equal(a.costs.reduce((n,i)=>n+i.qty,0),4);
  await assert.rejects(act(s,config(s)),/planos pendientes/);assert.equal(manager(s).id,planId);await act(s,{type:'habitat.manager.revoke-build',planId,approvalId:a.id});assert.equal(manager(s).approvals[0].status,'revoked');await act(s,config(s));assert.notEqual(manager(s).id,planId);
});

test('only an approved exact blueprint consumes the real shed materials and reserves its idle resident through the complete construction trip',async()=>{
  // Existing districts retain their authored scenery rights; the manager must
  // still use the ordinary exact placement, material and physical trip checks.
  const s=await setup(true,Date.parse('2026-10-16T20:00:00Z'));await act(s,config(s));s.at+=1800000;await read(s);
  assert.equal(shelfQty(s,'plank'),1);assert.equal(shelfQty(s,'cloth'),1);
  await go(s,habitableBuildingEntrance(state(s),b(s,'shed'))!);await deposit(s,'stone',2);await go(s,{x:0,y:1.5});
  const resident=state(s).workforce!.residents.find(r=>r.assignment?.buildingId===b(s,'planter').id)!;
  await act(s,{type:'habitat.resident.unassign',residentId:resident.id});s.at=state(s).workforce!.residents.find(r=>r.id===resident.id)!.relocation!.endsAt;await read(s);
  const origin=structuredClone(state(s).workforce!.residents.find(r=>r.id===resident.id)!.position),inventory=structuredClone(player(s).inventory),buildings=state(s).buildings.length;
  await act(s,{...config(s),planterId:undefined});
  await act(s,{type:'habitat.manager.approve-build',planId:manager(s).id,templateId:'house',x:-12.5,y:1,rotation:1,residentId:resident.id});
  const approval=manager(s).approvals[0],held=structuredClone(b(s,'shed').storage);assert.equal(state(s).buildings.length,buildings);assert.deepEqual(held,b(s,'shed').storage);
  await next(s);const made=state(s).buildings.find(v=>v.id===manager(s).active?.buildingId)!;assert.ok(made);assert.equal(made.templateId,'house');assert.equal(made.x,-12.5);assert.equal(made.y,1);assert.equal(made.rotation,1);assert.equal(made.construction!.residentId,resident.id);assert.equal(made.construction!.sourceBuildingId,b(s,'shed').id);assert.equal(made.construction!.cargo.reduce((n,l)=>n+l.qty,0),4);assert.ok(made.startsAt>s.at);assert.equal(shelfQty(s,'plank'),0);assert.equal(shelfQty(s,'cloth'),0);assert.equal(shelfQty(s,'stone'),0);
  await assert.rejects(act(s,{type:'habitat.resident.assign',residentId:resident.id,buildingId:b(s,'planter').id}),/Espera|ocupado|obra|termin/);
  s.at=made.construction!.crew.endsAt+1;await read(s);assert.equal(manager(s).approvals.find(a=>a.id===approval.id)!.status,'completed');assert.equal(manager(s).turn.completedOrders,1);assert.equal(manager(s).turn.startedOrders,1);assert.equal(manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0),4);assert.equal(state(s).buildings.length,buildings+1);assert.deepEqual(player(s).inventory,inventory);assert.deepEqual(state(s).workforce!.residents.find(r=>r.id===resident.id)!.position,origin);
  const done=structuredClone(s.store.record);await read(s);assert.deepEqual(s.store.record,done);
});

test('an approved house prepares its missing plank and cloth even when both stock goals are zero',async()=>{
  const s=await setup(true,Date.parse('2026-10-16T20:00:00Z'));await act(s,{type:'craft.start',recipeId:'seed',qty:1});s.at=Math.max(...Object.values(world(s).jobs).map(j=>j.endsAt));await read(s);
  await go(s,habitableBuildingEntrance(state(s),b(s,'shed'))!);await deposit(s,'stone',2);await deposit(s,'ration',1);await go(s,{x:0,y:1.5});
  const resident=state(s).workforce!.residents.find(r=>r.assignment?.buildingId===b(s,'planter').id)!;await act(s,{type:'habitat.resident.unassign',residentId:resident.id});s.at=state(s).workforce!.residents.find(r=>r.id===resident.id)!.relocation!.endsAt;await read(s);
  assert.equal(shelfQty(s,'ration'),1);assert.equal(shelfQty(s,'plank'),0);assert.equal(shelfQty(s,'cloth'),0);const inventory=structuredClone(player(s).inventory),count=state(s).buildings.length;
  await act(s,{...config(s),planterId:undefined,goals:{ration:1,plank:0,cloth:0}});await act(s,{type:'habitat.manager.approve-build',planId:manager(s).id,templateId:'house',x:-12.5,y:1,rotation:1,residentId:resident.id});s.at+=1800000;await read(s);
  assert.deepEqual(jobs(s).map(j=>j.payload.recipeId),['plank','cloth']);assert.equal(manager(s).turn.startedOrders,3);assert.equal(manager(s).turn.completedOrders,3);assert.equal(manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0),9);assert.equal(manager(s).approvals[0].status,'completed');assert.equal(state(s).buildings.length,count+1);assert.equal(state(s).buildings.at(-1)!.templateId,'house');assert.equal(shelfQty(s,'ration'),1);for(const id of['plank','cloth','timber','fiber','stone']as const)assert.equal(shelfQty(s,id),0);assert.deepEqual(player(s).inventory,inventory);
});
