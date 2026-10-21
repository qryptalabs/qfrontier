import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_COMPLETION_LIMIT, ACTIVITY_XP, activityLevelThreshold, activityProgressionForXp, getActivityProgression } from '../lib/mvp/activity-progression.ts';
import { buildMvpView, executeMvp, quoteMvp, readMvpView, validateMvpQuote } from '../lib/mvp/engine.ts';
import { dispatchSocial } from '../lib/mvp/social.ts';
import { give } from '../lib/mvp/helpers.ts';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import type { HabitableBuilding, HabitableDailyJourney } from '../lib/mvp/habitable-data.ts';
import type { HabitableTrade } from '../lib/mvp/habitable-commerce.ts';
import type { Job, MvpWorld, Player } from '../lib/mvp/types.ts';
import type { MvpStore } from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T08:00:00Z');
function fixture(){
  const world=createMvpWorld('owner',NOW-100000);
  const player=(ownerId:string,label:string)=>createPlayer(world,{ownerId,requestId:crypto.randomUUID(),now:NOW-90000,actor:null},{type:'player.create',name:label,stationName:`Estación ${label}`,faction:'cartographers'});
  return{world,p:player('owner','Alba'),peer:player('owner','Bruma'),foreign:player('foreign-owner','Cauce'),foreignPeer:player('foreign-owner','Duna'),third:player('third-owner','Estero')};
}
function job(world:MvpWorld,p:Player,id:string,kind:Job['kind'],payload:Job['payload']={},at=NOW-1000,status:Job['status']='completed'):Job {
  const result:Job={id,playerId:p.id,kind,status,createdAt:at-10000,startsAt:at-9000,endsAt:at,ruleVersion:world.rulesVersion,weather:weatherFor('r_1_1',at-9000),route:[p.position],costs:[],payload,report:[]};world.jobs[id]=result;return result;
}
function building(id:string,templateId:HabitableBuilding['templateId'],at=NOW-10000):HabitableBuilding{return{id,templateId,x:templateId==='workbench'?-2:7,y:templateId==='workbench'?-8:3,rotation:0,startsAt:at-30000,endsAt:at,bound:true};}
function habitat(p:Player,list:HabitableBuilding[]=[]){p.habitable={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:list};return p.habitable;}
const activity=(world:MvpWorld,p:Player,at=NOW)=>getActivityProgression(world,p,at)!;

test('new and anonymous explorers receive no invented XP, points, completions or persistent fields',()=>{
  const{world,p}=fixture(),before=structuredClone(world),view=activity(world,p);
  assert.equal(getActivityProgression(world,null,NOW),null);assert.equal(view.progression.xp,0);assert.equal(view.progression.points,0);assert.equal(view.progression.level,1);assert.equal(view.progression.nextLevelXp,100);assert.equal(view.progression.progressPercent,0);assert.deepEqual(view.completions,[]);assert.equal(view.nextCompletionAt,null);assert.deepEqual(world,before);assert.ok(!('activity' in p));
});

test('only completed, dated activities earn their defined units and selected profile history stays isolated',()=>{
  const{world,p,peer,foreign}=fixture();
  job(world,p,'survey','survey',{tileId:'t_4_3'});job(world,p,'extract','extract',{itemId:'timber',qty:2});job(world,p,'craft','craft',{recipeId:'plank',qty:3});job(world,p,'farm','farm');job(world,p,'upgrade','upgrade',{building:'workshop',toLevel:2});job(world,p,'expedition','expedition');job(world,p,'convoy','convoy');job(world,p,'travel','travel',{tileId:'t_4_3'});
  for(const status of['running','reserved','cancelled']as const)job(world,p,status,'craft',{recipeId:'plank',qty:999},NOW-1,status);
  job(world,p,'future','craft',{recipeId:'plank',qty:999},NOW+1);job(world,peer,'peer','extract',{itemId:'timber',qty:100});job(world,foreign,'foreign','survey');
  const before=structuredClone(world),view=buildMvpView(world,10,p.ownerId,NOW,p.id),projection=view.activity!;
  assert.equal(projection.playerId,p.id);assert.equal(projection.progression.xp,156);assert.equal(projection.progression.points,156);assert.equal(projection.progression.activityCount,8);assert.equal(projection.completions.filter(e=>e.kind!=='level-up').length,8);assert.equal(projection.completions.filter(e=>e.kind==='level-up').length,1);assert.ok(projection.completions.every(e=>e.playerId===p.id&&e.target.profileId===p.id));assert.equal(projection.progression.level,2);assert.equal(projection.progression.intoLevelXp,56);assert.equal(projection.progression.xpToNextLevel,94);assert.equal(buildMvpView(world,10,'visitor',NOW).activity,null);assert.deepEqual(world,before);
});

test('level thresholds and progress are exact at boundaries without spending XP or retroactively changing counters',()=>{
  assert.deepEqual([1,2,3,4,5].map(activityLevelThreshold),[0,100,250,450,700]);
  for(const level of[1,2,3,10,100,1000]){const threshold=activityLevelThreshold(level),view=activityProgressionForXp(threshold);assert.equal(view.level,level);assert.equal(view.intoLevelXp,0);assert.equal(view.progressPercent,0);assert.equal(view.points,threshold);if(level>1)assert.equal(activityProgressionForXp(threshold-1).level,level-1);}
  assert.equal(activityProgressionForXp(99).progressPercent,99);assert.equal(activityProgressionForXp(175).progressPercent,50);assert.equal(activityProgressionForXp(NaN).xp,0);assert.equal(activityProgressionForXp(-1).level,1);assert.throws(()=>activityLevelThreshold(0),RangeError);
});

test('travel earns once per actual destination and never for returning home or using raw visited-region counters',()=>{
  const{world,p}=fixture();for(const[id,tile,at]of[['a','t_4_3',NOW-5000],['b','t_4_4',NOW-4000],['c','t_4_3',NOW-3000],['d','t_3_3',NOW-2000],['e','t_3_3',NOW-1000]]as const)job(world,p,id,'travel',{tileId:tile},at);
  p.stats.explored=999;p.stats.trades=999;p.visitedRegions.push('r_0_0');p.surveyed.push('t_3_3');const first=activity(world,p);assert.equal(first.progression.xp,10);assert.equal(first.completions.length,5);assert.deepEqual(first.completions.filter(e=>e.xp>0).map(e=>e.id).sort(),['job:a','job:d']);
  p.position='t_3_3';assert.equal(activity(world,p).progression.xp,10);world.jobs=Object.fromEntries(Object.entries(world.jobs).reverse());assert.deepEqual(activity(world,p),first);
});

test('explicit completion dates, duplicate identities and future records cannot grant early or duplicate XP',()=>{
  const{world,p}=fixture(),j=job(world,p,'original','craft',{recipeId:'plank',qty:1},NOW-2000);(j as Job&{completedAt:number}).completedAt=NOW-1000;world.jobs.alias=structuredClone(j);const future=job(world,p,'future','survey',{},NOW-2000);(future as Job&{completedAt:number}).completedAt=NOW+1000;job(world,p,'invalid','extract',{itemId:'timber',qty:-5});job(world,p,'invalid-time','craft',{recipeId:'plank',qty:999},NaN);
  const before=structuredClone(world),view=activity(world,p);assert.equal(view.progression.xp,10);assert.equal(view.completions.filter(e=>e.id==='job:original').length,1);assert.equal(view.completions.find(e=>e.id==='job:original')!.completedAt,NOW-1000);assert.ok(!view.completions.some(e=>e.id==='job:future'||e.id==='job:invalid-time'));assert.deepEqual(world,before);
});

test('notification history is bounded while XP uses all eligible history before truncation',()=>{
  const{world,p}=fixture();for(let i=0;i<ACTIVITY_COMPLETION_LIMIT+7;i++)job(world,p,`s${String(i).padStart(3,'0')}`,'survey',{tileId:'t_4_3'},NOW-1000-i);
  const view=activity(world,p);assert.equal(view.completions.length,ACTIVITY_COMPLETION_LIMIT);assert.equal(view.progression.xp,(ACTIVITY_COMPLETION_LIMIT+7)*ACTIVITY_XP.survey);assert.equal(view.progression.activityCount,ACTIVITY_COMPLETION_LIMIT+7);assert.equal(view.completions[0].id,'job:s000');assert.ok(view.completions.some(e=>e.kind==='level-up'));assert.equal(new Set(view.completions.map(e=>e.id)).size,view.completions.length);assert.deepEqual(activity(world,p),view);
});

test('physical production and final warehouse unload notify separately while the same goods earn XP only once',()=>{
  const{world,p}=fixture(),bench=building('bench','workbench'),shed=building('shed','shed');habitat(p,[bench,shed]);const j=job(world,p,'craft','craft',{recipeId:'plank',qty:1,habitableBuildingId:bench.id,habitableLogistics:1});bench.operation={jobId:j.id};bench.pending=[{id:'private-lot',itemId:'plank',qty:1,bound:true,quality:1,expiresAt:null,wear:0,location:`production:${bench.id}`,provenance:{source:'private-provenance',creatorId:p.id,seasonId:world.seasonId,inputs:[{itemId:'timber',qty:2}]}}];
  const before=activity(world,p);assert.equal(before.progression.xp,70);assert.match(before.completions.find(e=>e.id==='job:craft')!.result,/pendientes de entrega/);assert.equal(before.completions.filter(e=>e.kind==='delivery').length,0);
  bench.pending=[];bench.shipment={id:'shipment:craft',jobId:j.id,workerId:'resident',sourceBuildingId:bench.id,destinationBuildingId:shed.id,points:[{x:0,y:0},{x:1,y:1}],startsAt:NOW-800,pickupAt:NOW-700,arrivesAt:NOW-500,unloadsAt:NOW-400,endsAt:NOW+1000,quantity:1,cargo:[],deliveredQuantity:1,expiredQuantity:0,depositedAt:NOW-400};
  const after=activity(world,p);assert.equal(after.progression.xp,70);const delivery=after.completions.find(e=>e.kind==='delivery')!;assert.equal(delivery.xp,0);assert.equal(delivery.completedAt,NOW-400);assert.equal(delivery.target.facilityId,shed.id);assert.match(delivery.result,/ya fueron depositadas/);assert.match(after.completions.find(e=>e.id==='job:craft')!.result,/entrega al cobertizo quedó confirmada/);assert.ok(!JSON.stringify(after).includes('private-provenance'));assert.ok(!JSON.stringify(after).includes('private-lot'));
  bench.shipment.deliveredQuantity=0;bench.shipment.expiredQuantity=1;assert.ok(!activity(world,p).completions.some(e=>e.kind==='delivery'));
});

test('construction, actual level-two completion and timed deadlines never claim unfinished upgrades',()=>{
  const{world,p,peer}=fixture(),shed=building('shed','shed');habitat(p,[shed]);shed.upgrade={fromLevel:1,toLevel:2,startsAt:NOW-1000,endsAt:NOW+1000,constructionStand:{x:5,y:5}};const future=building('future','house',NOW+2000);p.habitable!.buildings.push(future);job(world,p,'own','craft',{recipeId:'plank',qty:1},NOW+500,'running');job(world,peer,'other','craft',{recipeId:'plank',qty:1},NOW+100,'running');
  let view=activity(world,p);assert.equal(view.nextCompletionAt,NOW+500);assert.equal(view.progression.xp,30);assert.equal(view.completions.length,1);
  world.jobs.own.status='cancelled';view=activity(world,p);assert.equal(view.nextCompletionAt,NOW+1000);assert.ok(!view.completions.some(e=>e.kind==='upgrade'));
  shed.upgrade.endsAt=NOW-1;assert.ok(!activity(world,p).completions.some(e=>e.kind==='upgrade'));shed.level=2;view=activity(world,p);assert.equal(view.progression.xp,70);assert.equal(view.completions.find(e=>e.kind==='upgrade')!.id,'building:shed:upgrade:2');assert.equal(view.nextCompletionAt,NOW+2000);assert.equal(view.completions.find(e=>e.kind==='build')!.id,'building:shed:complete');
});

test('actual fair item debit and credit payment award only the first NPC sale and expose no mutable ledger objects',()=>{
  const{world,p,peer}=fixture();give(p,'plank',2,NOW-10000,'genuine-fixture-recipe',[],false);give(peer,'plank',1,NOW-10000,'peer-recipe',[],false);
  const sell=(actor:Player,now:number)=>dispatchSocial(world,{type:'npc.sell',playerId:actor.id,itemId:'plank',qty:1},{ownerId:actor.ownerId,requestId:crypto.randomUUID(),now,actor});sell(p,NOW-2000);sell(p,NOW-1000);sell(peer,NOW-500);
  world.social.ledger.push({id:'refund',at:NOW,currency:'credits',amount:999,from:'npc-season',to:p.id,reason:'Devolución de reserva'},{id:'future',at:NOW+1,currency:'credits',amount:6,from:'npc-season',to:p.id,reason:'Encargo NPC con presupuesto limitado'});
  const before=structuredClone(world),view=activity(world,p);assert.equal(view.progression.xp,20);assert.equal(view.completions.length,2);assert.equal(view.completions.filter(e=>e.xp===20).length,1);assert.equal(world.social.accounts[p.id].credits,12);assert.equal(p.stats.trades,0);view.completions[0].result='changed';assert.deepEqual(world,before);assert.equal(activity(world,peer).progression.xp,20);
});

test('market XP uses confirmed item receipts and distinct foreign owners, never open offers or swaps between own profiles',()=>{
  const{world,p,peer,foreign,foreignPeer,third}=fixture();give(p,'plank',5,NOW-10000,'fixture-planks',[],false);
  const fill=(taker:Player,at:number)=>{give(taker,'stone',1,at,'fixture-stone',[],false);dispatchSocial(world,{type:'market.publish',playerId:p.id,mode:'barter',itemId:'plank',qty:1,wantItemId:'stone',wantQty:1},{ownerId:p.ownerId,requestId:crypto.randomUUID(),now:at,actor:p});const offer=world.social.offers.at(-1)!;dispatchSocial(world,{type:'market.fill',playerId:taker.id,offerId:offer.id},{ownerId:taker.ownerId,requestId:crypto.randomUUID(),now:at+1,actor:taker});return offer;};
  fill(peer,NOW-5000);fill(foreign,NOW-4000);fill(foreignPeer,NOW-3000);fill(foreign,NOW-2000);fill(third,NOW-1000);const view=activity(world,p);assert.equal(view.progression.xp,40);assert.equal(view.completions.length,5);assert.equal(view.completions.filter(e=>e.xp===20).length,2);assert.equal(activity(world,peer).progression.xp,0);assert.equal(activity(world,foreign).progression.xp,20);
  world.social.offers[4].status='open';assert.equal(activity(world,p).progression.xp,20);world.social.offers[4].status='filled';world.social.ledger=world.social.ledger.filter(l=>l.from!==world.social.offers[4].id);assert.equal(activity(world,p).progression.xp,20);
});

test('Valleverde and district deliveries require confirmed payment and share one first-NPC-sale XP award',()=>{
  const{world,p}=fixture(),shed=building('shed','shed');const h=habitat(p,[shed]);
  const c:HabitableTrade={id:'trade-1',buildingId:shed.id,status:'completed',quantity:2,price:12,escrow:0,acceptedAt:NOW-50000,deadline:NOW+100000,paidAt:NOW-1000,deliveredUnits:2,cargo:[],deliveredLots:[],caravan:{id:'caravan-1',playerId:p.id,plot:{x:0,y:0},destination:{name:'Valleverde',x:146,y:120},route:{points:[{x:0,y:0,height:0},{x:10,y:0,height:0}],length:10,bridges:[]},approachStartsAt:NOW-50000,approachEndsAt:NOW-45000,delivery:{startsAt:NOW-40000,arrivesAt:NOW-2000,unloadsAt:NOW-1000},quantity:2}};h.commerce={sequence:1,contracts:[c]};assert.ok(!activity(world,p).completions.some(e=>e.kind==='trade'));
  world.social.ledger.push({id:'caravan-paid',at:c.paidAt!,currency:'credits',amount:12,from:'npc',to:p.id,reason:'Entrega forestal trade-1',itemId:'plank'});assert.equal(activity(world,p).progression.xp,50);
  h.job={id:'district',status:'completed',escrow:0,rewardCredits:16,acceptedAt:NOW-50000,expiresAt:NOW+100000,sourceTileId:'t_4_3',layerId:'layer_0',timberQty:4,plankQty:2,reservedTimber:0,harvested:true,deliveredAt:NOW-500};world.social.ledger.push({id:'district-paid',at:NOW-500,currency:'credits',amount:16,from:'district',to:p.id,reason:'Entrega verificada de dos tablones para el distrito'});const result=activity(world,p);assert.equal(result.progression.xp,50);assert.equal(result.completions.filter(e=>e.kind==='trade'||e.kind==='district-contract').length,2);assert.equal(result.completions.find(e=>e.kind==='district-contract')!.xp,0);
  c.deliveredUnits=0;assert.equal(activity(world,p).completions.filter(e=>e.kind==='trade').length,0);c.status='in_transit';c.caravan.delivery!.unloadsAt=NOW+100;assert.equal(activity(world,p).nextCompletionAt,NOW+100);
});

test('daily return and final industrial delivery notify only after authoritative completion and add no production XP',()=>{
  const{world,p}=fixture(),bench=building('saw','sawmill'),shed=building('shed','shed');const h=habitat(p,[bench,shed]),j=job(world,p,'cycle','craft',{recipeId:'plank',qty:1,habitableBuildingId:bench.id,habitableIndustry:'sawmill'});bench.shipment={id:'shipment:cycle',jobId:j.id,workerId:'resident',sourceBuildingId:bench.id,destinationBuildingId:shed.id,points:[{x:0,y:0},{x:1,y:1}],startsAt:NOW-800,pickupAt:NOW-700,arrivesAt:NOW-500,unloadsAt:NOW-400,endsAt:NOW+1000,quantity:1,cargo:[],deliveredQuantity:1,depositedAt:NOW-400};bench.workOrder={id:'order',status:'active',target:1,started:1,completed:0,supplyShedId:shed.id,lastSettledJobId:j.id,createdAt:NOW-50000};
  const journey:HabitableDailyJourney={id:'journey',workerId:'resident',sourceBuildingId:shed.id,startsAt:NOW-10000,endsAt:NOW+500,legs:[],cargo:[],residents:[{residentId:'resident',deliveredAt:NOW-5000,fedUntil:NOW+100000}],maintenanceQty:1,maintenanceAt:NOW-1000,rationsConsumed:1,timberConsumed:1};h.daily={optedInAt:NOW-10000,sequence:1,journey,rationsConsumed:1,timberConsumed:1};
  let view=activity(world,p);assert.equal(view.progression.xp,70);assert.equal(view.nextCompletionAt,NOW+500);assert.ok(!view.completions.some(e=>e.kind==='daily'||e.kind==='work-order'));
  journey.completedAt=NOW-1;journey.endsAt=NOW-1;bench.shipment.endsAt=NOW-2;bench.workOrder.status='completed';bench.workOrder.completed=1;view=activity(world,p);assert.equal(view.progression.xp,70);assert.equal(view.completions.filter(e=>e.kind==='daily'||e.kind==='work-order').length,2);assert.ok(view.completions.filter(e=>e.kind==='daily'||e.kind==='work-order').every(e=>e.xp===0));assert.equal(view.nextCompletionAt,null);
});

class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null=null;writes=0;async read(){return structuredClone(this.record);}async insert(world:MvpWorld){if(this.record)throw Error('No reset');this.record={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}}
test('a genuine new-player first sale survives signed receipt replay and reload with 61 derived XP and zero projection writes',async()=>{
  const store=new MemoryStore(),owner='activity-owner';let at=NOW;let view=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Ruta primera',faction:'cartographers'},crypto.randomUUID(),undefined,at);const id=view.player!.id,kit=structuredClone(view.player!.inventory);assert.equal(view.activity!.progression.xp,0);
  for(let step=0;step<8&&view.firstTrade.stage!=='complete';step++){
    const command=view.firstTrade.command!,requestId=crypto.randomUUID();assert.ok(command);const quote=await quoteMvp(store,owner,command,requestId,at);await validateMvpQuote(store,owner,command,requestId,quote.revision,quote.token,quote.expiresAt,at);view=await executeMvp(store,owner,command,requestId,quote.revision,at);const ids:string[]=view.activity!.completions.map(e=>e.id),xp:number=view.activity!.progression.xp;view=await executeMvp(store,owner,command,requestId,quote.revision,at);assert.equal(view.activity!.progression.xp,xp);assert.deepEqual(view.activity!.completions.map(e=>e.id),ids);
    if(view.firstTrade.job){assert.equal(view.activity!.nextCompletionAt,view.firstTrade.job.endsAt);at=view.firstTrade.job.endsAt;view=await readMvpView(store,owner,id,at);}
  }
  assert.equal(view.firstTrade.stage,'complete');assert.equal(view.activity!.progression.xp,61);assert.equal(view.activity!.progression.points,61);assert.equal(view.activity!.progression.level,1);assert.equal(view.activity!.completions.length,5);assert.deepEqual(view.player!.inventory,kit);const before=structuredClone(store.record),writes=store.writes;const reloaded=await readMvpView(store,owner,id,at+1000);assert.deepEqual(reloaded.activity,view.activity);assert.deepEqual(store.record,before);assert.equal(store.writes,writes);
});
