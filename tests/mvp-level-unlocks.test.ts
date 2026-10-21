import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_UNLOCK_LEVELS, RECIPE_UNLOCK_LEVELS, UNLOCK_RULES_EFFECTIVE_AT, buildingUnlockAccess, getLevelUnlocks, recipeUnlockAccess, requireBuildingUnlock } from '../lib/mvp/level-unlocks.ts';
import { ACTIVITY_COMPLETION_LIMIT, activityLevelThreshold, getActivityProgression } from '../lib/mvp/activity-progression.ts';
import { RECIPES } from '../lib/mvp/catalog.ts';
import { HABITABLE_BUILDING_TEMPLATES } from '../lib/mvp/habitable-data.ts';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import { buildMvpView, executeMvp, quoteMvp, readMvpView, validateMvpQuote } from '../lib/mvp/engine.ts';
import { give } from '../lib/mvp/helpers.ts';
import type { Job, MvpWorld, Player } from '../lib/mvp/types.ts';
import type { MvpStore } from '../lib/mvp/store.ts';

const NOW=UNLOCK_RULES_EFFECTIVE_AT+3600000;
function fixture(createdAt=UNLOCK_RULES_EFFECTIVE_AT+1000){const world=createMvpWorld('owner',createdAt-1000),p=createPlayer(world,{ownerId:'owner',requestId:crypto.randomUUID(),now:createdAt,actor:null},{type:'player.create',name:'Alba',stationName:'Planos propios',faction:'cartographers'});return{world,p};}
function record(world:MvpWorld,p:Player,id:string,kind:Job['kind'],payload:Job['payload'],createdAt=NOW-10000,status:Job['status']='completed',endsAt=NOW-1000):Job {const j:Job={id,playerId:p.id,kind,status,createdAt,startsAt:createdAt,endsAt,ruleVersion:world.rulesVersion,weather:weatherFor('r_1_1',createdAt),route:[p.position],costs:[],payload,report:[]};world.jobs[id]=j;return j;}
function earnLevel(world:MvpWorld,p:Player,level:number){const xp=activityLevelThreshold(level),surveys=Math.floor(xp/20);for(let i=0;i<surveys;i++)record(world,p,`level-survey-${i}`,'survey',{tileId:Object.keys(world.tiles)[i]},NOW-20000-i,'completed',NOW-10000-i);if(xp%20)record(world,p,'level-craft','craft',{recipeId:'plank',qty:1},NOW-20000,'completed',NOW-10000);}
class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null;writes=0;constructor(world?:MvpWorld){this.record=world?{revision:0,world:structuredClone(world)}:null;}async read(){return structuredClone(this.record);}async insert(world:MvpWorld){if(this.record)throw Error('No reset');this.record={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}}

test('all 24 existing recipes and six plans have server-derived free milestones while starter necessities and defensive recipes remain level one',()=>{
  const{world,p}=fixture(),before=structuredClone(world),view=getLevelUnlocks(world,p,NOW)!;assert.equal(view.level,1);assert.equal(view.recipes.length,24);assert.equal(view.buildings.length,6);assert.deepEqual(view.buildings.map(b=>b.id),HABITABLE_BUILDING_TEMPLATES.map(b=>b.id));assert.deepEqual(view.milestones.map(m=>[m.level,m.xp]),[[1,0],[2,100],[3,250],[4,450],[5,700]]);assert.equal(view.next!.level,2);assert.deepEqual(view.policy,{gameplayFree:true,xpPurchasable:false,levelSkipsPurchasable:false});
  for(const id of['plank','cloth','seed','nutrient','ration','bread','iron_ingot','pickaxe','guard_armor','spear','arrow_bundle'])assert.equal(view.recipes.find(r=>r.id===id)!.unlocked,true,id);
  for(const id of['shed','workbench','planter'])assert.equal(view.buildings.find(b=>b.id===id)!.unlocked,true,id);for(const id of['house','woodlot','sawmill'])assert.equal(view.buildings.find(b=>b.id===id)!.unlocked,false,id);
  assert.equal(view.recipes.find(r=>r.id==='copper_wire')!.requiredLevel,2);assert.equal(view.recipes.find(r=>r.id==='repair_kit')!.requiredLevel,3);assert.equal(view.recipes.find(r=>r.id==='alloy')!.requiredLevel,3);assert.ok(view.recipes.every(r=>r.legacy===false));assert.deepEqual(world,before);assert.equal(getLevelUnlocks(world,null,NOW),null);assert.equal(buildMvpView(world,1,'visitor',NOW).unlocks,null);
});

test('levels two through five unlock only their advertised catalog rows and never spend experience',()=>{
  for(const level of[1,2,3,4,5]){const{world,p}=fixture();earnLevel(world,p,level);const before=structuredClone(world),view=getLevelUnlocks(world,p,NOW)!;assert.equal(view.level,level);for(const r of view.recipes)assert.equal(r.unlocked,(RECIPE_UNLOCK_LEVELS[r.id]??1)<=level,r.id);for(const b of view.buildings)assert.equal(b.unlocked,BUILDING_UNLOCK_LEVELS[b.id]<=level,b.id);assert.equal(view.next?.level??null,level<5?level+1:null);assert.deepEqual(world,before);}
});

test('bought or tutorial items, initial station levels, and another profile cannot manufacture a legacy unlock',()=>{
  const{world,p}=fixture(UNLOCK_RULES_EFFECTIVE_AT-100000),peer=createPlayer(world,{ownerId:'owner',requestId:crypto.randomUUID(),now:UNLOCK_RULES_EFFECTIVE_AT-90000,actor:null},{type:'player.create',name:'Bruma',stationName:'Otra ruta',faction:'cartographers'});give(p,'scanner',1,NOW-1000,'market:existing-item',[],false);give(p,'alloy',3,NOW-1000,'tutorial',[],true);record(world,peer,'peer-advanced','craft',{recipeId:'scanner',qty:1},UNLOCK_RULES_EFFECTIVE_AT-10000);const before=structuredClone(world),view=getLevelUnlocks(world,p,NOW)!;assert.equal(view.level,1);for(const id of['glass','alloy','scanner','drill_module_ii']){const row=view.recipes.find(r=>r.id===id)!;assert.equal(row.unlocked,false,id);assert.equal(row.legacy,false,id);}assert.deepEqual(world,before);
});

test('pre-policy paid recipe orders preserve capability while cancelled, future or newly crafted evidence does not grandfather new recipes',()=>{
  const{world,p}=fixture(UNLOCK_RULES_EFFECTIVE_AT-100000);record(world,p,'completed','craft',{recipeId:'glass',qty:1},UNLOCK_RULES_EFFECTIVE_AT-1000,'completed',UNLOCK_RULES_EFFECTIVE_AT-1);record(world,p,'running','craft',{recipeId:'medkit',qty:1},UNLOCK_RULES_EFFECTIVE_AT-1000,'running',NOW+1000);record(world,p,'reserved','craft',{recipeId:'cart',qty:1},UNLOCK_RULES_EFFECTIVE_AT-1000,'reserved',NOW+2000);record(world,p,'cancelled','craft',{recipeId:'weather_cloak',qty:1},UNLOCK_RULES_EFFECTIVE_AT-1000,'cancelled',NOW+1000);record(world,p,'future','craft',{recipeId:'scanner',qty:1},UNLOCK_RULES_EFFECTIVE_AT-1000,'completed',NOW+1000);record(world,p,'modern','craft',{recipeId:'camp_kit',qty:1},UNLOCK_RULES_EFFECTIVE_AT+1000);
  for(const id of['glass','medkit','cart']as const){const row=recipeUnlockAccess(world,p,id,NOW);assert.equal(row.legacy,true,id);assert.equal(row.unlocked,true,id);}for(const id of['weather_cloak','scanner','camp_kit']as const){const row=recipeUnlockAccess(world,p,id,NOW);assert.equal(row.legacy,false,id);assert.equal(row.unlocked,false,id);}
});

test('advanced historical station buildings are preserved but post-policy upgrades cannot bypass recipe experience gates',()=>{
  const{world,p}=fixture(UNLOCK_RULES_EFFECTIVE_AT-100000);p.buildings.workshop=2;assert.equal(recipeUnlockAccess(world,p,'scanner',NOW).legacy,true);assert.equal(recipeUnlockAccess(world,p,'glass',NOW).legacy,true);assert.equal(recipeUnlockAccess(world,p,'drill_module_ii',NOW).legacy,false);
  p.buildings.workshop=3;record(world,p,'new-upgrade','upgrade',{building:'workshop',fromLevel:2,toLevel:3},UNLOCK_RULES_EFFECTIVE_AT+1000);assert.equal(recipeUnlockAccess(world,p,'scanner',NOW).legacy,true);assert.equal(recipeUnlockAccess(world,p,'drill_module_ii',NOW).legacy,false);
  record(world,p,'new-upgrade-first','upgrade',{building:'workshop',fromLevel:1,toLevel:2},UNLOCK_RULES_EFFECTIVE_AT+1);assert.equal(recipeUnlockAccess(world,p,'scanner',NOW).legacy,false);assert.equal(recipeUnlockAccess(world,p,'scanner',NOW).unlocked,false);assert.equal(recipeUnlockAccess(world,p,'glass',NOW).legacy,false);
});

test('only pre-policy authored construction preserves its plan and continues through a future completion without a migration',()=>{
  const{world,p}=fixture(UNLOCK_RULES_EFFECTIVE_AT-100000);p.habitable={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[{id:'old-woodlot',templateId:'woodlot',x:-12,y:1,rotation:0,startsAt:UNLOCK_RULES_EFFECTIVE_AT-1,endsAt:NOW+10000,bound:true},{id:'new-sawmill',templateId:'sawmill',x:-12,y:5,rotation:0,startsAt:UNLOCK_RULES_EFFECTIVE_AT+1000,endsAt:NOW+10000,bound:true}]};const before=structuredClone(world);assert.equal(buildingUnlockAccess(world,p,'woodlot',NOW).legacy,true);assert.doesNotThrow(()=>requireBuildingUnlock(world,p,'woodlot',NOW));assert.equal(buildingUnlockAccess(world,p,'sawmill',NOW).legacy,false);assert.throws(()=>requireBuildingUnlock(world,p,'sawmill',NOW),/nivel 3/);assert.deepEqual(world,before);
});

test('quote and direct commit reject forged level fields before spending materials or reserving a locked recipe or construction',async()=>{
  const{world,p}=fixture();p.habitable={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[]};const store=new MemoryStore(world);await readMvpView(store,p.ownerId,p.id,NOW);const before=structuredClone(store.record),writes=store.writes;
  for(const command of[{type:'craft.start',playerId:p.id,recipeId:'copper_wire',qty:1,level:5,xp:700,unlocked:true},{type:'habitat.build',playerId:p.id,templateId:'woodlot',x:-12,y:1,rotation:0,level:5,xp:700},{type:'habitat.build',playerId:p.id,templateId:'sawmill',x:-12,y:5,rotation:0,unlocked:true}]){
    await assert.rejects(quoteMvp(store,p.ownerId,command,crypto.randomUUID(),NOW),/nivel [23]/);await assert.rejects(executeMvp(store,p.ownerId,command,crypto.randomUUID(),undefined,NOW),/nivel [23]/);assert.deepEqual(store.record,before);
  }assert.equal(store.writes,writes);
});

test('a new real recipe order at its required level keeps original inputs, clocks, output binding and signed idempotence',async()=>{
  for(const recipe of RECIPES.filter(r=>(RECIPE_UNLOCK_LEVELS[r.id]??1)>1)){
    const{world,p}=fixture();earnLevel(world,p,RECIPE_UNLOCK_LEVELS[recipe.id]!);p.buildings[recipe.building]=recipe.level;for(const input of recipe.inputs)give(p,input.itemId,input.qty,NOW-1000,'genuine-test-input',[],false);const store=new MemoryStore(world),command={type:'craft.start',playerId:p.id,recipeId:recipe.id,qty:1,transferableOnly:true},request=crypto.randomUUID(),quote=await quoteMvp(store,p.ownerId,command,request,NOW);await validateMvpQuote(store,p.ownerId,command,request,quote.revision,quote.token,quote.expiresAt,NOW);let view=await executeMvp(store,p.ownerId,command,request,quote.revision,NOW);const ordered=view.jobs.find(j=>j.createdAt===NOW&&j.kind==='craft')!;assert.equal(ordered.endsAt-ordered.startsAt,recipe.seconds*1000,recipe.id);assert.ok(ordered.costs.every(l=>!l.bound));assert.deepEqual(ordered.costs.map(l=>[l.itemId,l.qty]),recipe.inputs.map(i=>[i.itemId,i.qty]));const saved=structuredClone(store.record);await executeMvp(store,p.ownerId,command,request,quote.revision,NOW);assert.deepEqual(store.record,saved);view=await readMvpView(store,p.ownerId,p.id,ordered.endsAt);for(const output of recipe.output){const lot=view.player!.inventory.find(l=>l.provenance.source===`recipe:${recipe.id}:${ordered.id}`&&l.itemId===output.itemId)!;assert.equal(lot.qty,output.qty);assert.equal(lot.bound,false);}assert.ok(!('level' in store.record!.world.players[p.id]));
  }
});

test('a level-two construction uses its existing geometry and costs and a receipt cannot debit it twice',async()=>{
  const{world,p}=fixture();earnLevel(world,p,2);p.habitable={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[]};const store=new MemoryStore(world),command={type:'habitat.build',playerId:p.id,templateId:'woodlot',x:-12,y:1,rotation:0},request=crypto.randomUUID(),quote=await quoteMvp(store,p.ownerId,command,request,NOW);assert.equal(quote.durationSeconds,25);assert.deepEqual(quote.changes.filter(c=>c.delta!==0).map(c=>[c.itemId,c.delta]).sort(),[['stone',-1],['timber',-1]]);let view=await executeMvp(store,p.ownerId,command,request,quote.revision,NOW);assert.equal(view.habitable.state!.buildings.length,1);const saved=structuredClone(store.record);view=await executeMvp(store,p.ownerId,command,request,quote.revision,NOW);assert.deepEqual(store.record,saved);assert.equal(view.habitable.state!.buildings[0].x,-12);assert.equal(view.habitable.state!.buildings[0].y,1);assert.equal(view.habitable.state!.buildings[0].endsAt,NOW+25000);
});

test('an old running craft finishes after rollout and its capability remains usable without recosting or changing its real output',async()=>{
  const{world,p}=fixture(UNLOCK_RULES_EFFECTIVE_AT-10000),store=new MemoryStore(world),command={type:'craft.start',playerId:p.id,recipeId:'glass',qty:1},request=crypto.randomUUID(),at=UNLOCK_RULES_EFFECTIVE_AT-1000;let view=await executeMvp(store,p.ownerId,command,request,undefined,at);const j=view.jobs[0],costs=structuredClone(j.costs);assert.equal(view.unlocks!.recipes.find(r=>r.id==='glass')!.unlocked,true);view=await readMvpView(store,p.ownerId,p.id,NOW);assert.equal(view.unlocks!.recipes.find(r=>r.id==='glass')!.legacy,true);assert.equal(view.player!.inventory.filter(l=>l.itemId==='glass').reduce((n,l)=>n+l.qty,0),1);assert.deepEqual(view.jobs.find(job=>job.id===j.id)!.costs,costs);assert.equal(view.jobs.find(job=>job.id===j.id)!.endsAt,at+600000);const before=structuredClone(store.record),writes=store.writes;await readMvpView(store,p.ownerId,p.id,NOW+1);assert.deepEqual(store.record,before);assert.equal(store.writes,writes);await assert.doesNotReject(quoteMvp(store,p.ownerId,command,crypto.randomUUID(),NOW+2));
});

test('level notices cross real thresholds once, retain their source event time and award no extra XP on reload or offline jumps',()=>{
  const{world,p}=fixture();record(world,p,'batch','craft',{recipeId:'plank',qty:60},NOW-10000,'completed',NOW-1);const before=structuredClone(world),view=getActivityProgression(world,p,NOW)!,notices=view.completions.filter(e=>e.kind==='level-up');assert.equal(view.progression.xp,600);assert.equal(view.progression.activityCount,1);assert.equal(view.progression.level,4);assert.deepEqual(notices.map(e=>e.id).sort(),[2,3,4].map(level=>`level:${p.id}:${level}`).sort());assert.ok(notices.every(e=>e.xp===0&&e.points===0&&e.completedAt===NOW-1&&e.target.profileId===p.id));assert.deepEqual(getActivityProgression(world,p,NOW+1000),view);assert.deepEqual(world,before);
  world.jobs.batch.endsAt=NOW+1;assert.equal(getActivityProgression(world,p,NOW)!.completions.length,0);assert.equal(getActivityProgression(world,p,NOW)!.progression.level,1);
});

test('extreme stored XP creates at most the notification cap of level notices while retaining the full derived total',()=>{
  const{world,p}=fixture();record(world,p,'huge','extract',{itemId:'timber',qty:1_000_000_000});const view=getActivityProgression(world,p,NOW)!;assert.equal(view.progression.xp,3_000_000_000);assert.ok(view.progression.level>1000);assert.equal(view.completions.length,ACTIVITY_COMPLETION_LIMIT);assert.ok(view.completions.filter(e=>e.kind==='level-up').length<=ACTIVITY_COMPLETION_LIMIT);assert.equal(new Set(view.completions.map(e=>e.id)).size,view.completions.length);
});
