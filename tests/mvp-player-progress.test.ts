import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMvpView } from '../lib/mvp/engine.ts';
import { getPlayerProgress, getPlayerReports } from '../lib/mvp/player-progress.ts';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import type { Job, MvpWorld, Player } from '../lib/mvp/types.ts';
import type { HabitableTrade } from '../lib/mvp/habitable-commerce.ts';
import { dispatchSocial } from '../lib/mvp/social.ts';
import { give } from '../lib/mvp/helpers.ts';

const NOW=Date.parse('2026-10-16T05:00:00Z');
function fixture(){const world=createMvpWorld('owner',NOW-100000),p=createPlayer(world,{ownerId:'owner',requestId:crypto.randomUUID(),now:NOW-90000,actor:null},{type:'player.create',name:'Alba',stationName:'Puerta del bosque',faction:'cartographers'}),peer=createPlayer(world,{ownerId:'owner',requestId:crypto.randomUUID(),now:NOW-80000,actor:null},{type:'player.create',name:'Bruma',stationName:'Puerta del valle',faction:'cartographers'}),foreign=createPlayer(world,{ownerId:'foreign',requestId:crypto.randomUUID(),now:NOW-70000,actor:null},{type:'player.create',name:'Cauce',stationName:'Puerta del río',faction:'cartographers'});return{world,p,peer,foreign};}
function job(world:MvpWorld,p:Player,id:string,kind:Job['kind']='craft',endsAt=NOW-1000,status:Job['status']='completed'):Job {const j:Job={id,playerId:p.id,kind,status,createdAt:endsAt-10000,startsAt:endsAt-9000,endsAt,ruleVersion:world.rulesVersion,weather:weatherFor('r_1_1',endsAt-9000),route:[p.position],costs:[],payload:kind==='craft'?{recipeId:'plank',qty:1}:kind==='extract'?{itemId:'timber',qty:8}:kind==='survey'?{tileId:p.position}:{},report:[]};world.jobs[id]=j;return j;}
function trade(id:string,status:HabitableTrade['status'],paidAt?:number):HabitableTrade {return{id,buildingId:'shed',status,quantity:2,price:12,escrow:status==='completed'?0:12,acceptedAt:NOW-50000,deadline:NOW+100000,cargo:[],...(paidAt!==undefined?{paidAt,deliveredUnits:2}:{}),caravan:{id,playerId:'unused',plot:{x:0,y:0},destination:{name:'Valleverde',x:146,y:120},route:{points:[{x:0,y:0,height:0},{x:10,y:0,height:0}],length:10,bridges:[]},approachStartsAt:NOW-50000,approachEndsAt:NOW-40000,quantity:2}};}

test('eight completed orders yield eight descending reports even without combat or historical report text',()=>{
  const {world,p}=fixture();for(const i of[2,7,0,4,1,5,3,6])job(world,p,`job_${i}`,'craft',NOW-8000+i*1000);const view=buildMvpView(world,1,p.ownerId,NOW,p.id);assert.equal(view.reports.length,8);assert.deepEqual(view.reports.map(r=>r.jobId),['job_7','job_6','job_5','job_4','job_3','job_2','job_1','job_0']);assert.ok(view.reports.every(r=>r.lines.length&&r.playerId===p.id));assert.equal(view.progress!.orders.completed,8);assert.equal(view.progress!.stats.crafted,8);assert.equal(p.stats.crafted,0);
});

test('reports, statistics and foundation use only the selected explorer even when another profile shares its owner',()=>{
  const {world,p,peer,foreign}=fixture();job(world,p,'mine','extract');job(world,peer,'peer-craft');job(world,peer,'peer-survey','survey');job(world,foreign,'foreign-craft');peer.stats.crafted=20;peer.stats.trades=9;peer.visitedRegions.push('r_0_0');const own=buildMvpView(world,1,p.ownerId,NOW,p.id),other=buildMvpView(world,1,p.ownerId,NOW,peer.id),anonymous=buildMvpView(world,1,'visitor',NOW);
  assert.deepEqual(own.reports.map(r=>r.jobId),['mine']);assert.equal(own.progress!.stats.gathered,8);assert.equal(own.progress!.stats.crafted,0);assert.equal(own.progress!.stats.trades,0);assert.equal(own.progress!.foundation.find(s=>s.id==='survey')!.done,false);assert.equal(other.progress!.stats.gathered,0);assert.equal(other.progress!.stats.crafted,20);assert.equal(other.reports.length,2);assert.equal(anonymous.progress,null);assert.deepEqual(anonymous.reports,[]);
});

test('display statistics recover completed-job evidence without changing raw economic counters or counting pending and cancelled production',()=>{
  const {world,p}=fixture();job(world,p,'timber','extract');job(world,p,'planks').payload.qty=3;job(world,p,'cancelled','craft',NOW+1000,'cancelled').payload.qty=99;job(world,p,'pending','craft',NOW+2000,'running').payload.qty=99;job(world,p,'reserved','craft',NOW+4000,'reserved').payload.qty=99;job(world,p,'crop','farm');const before=structuredClone(world),progress=getPlayerProgress(world,p,NOW);assert.equal(progress.stats.gathered,8);assert.equal(progress.stats.crafted,3);assert.equal(progress.stats.farms,1);assert.deepEqual(progress.orders,{total:6,active:2,completed:3,cancelled:1});assert.deepEqual(world,before);
  p.stats.crafted=42;assert.equal(getPlayerProgress(world,p,NOW).stats.crafted,42);
});

test('the twelve-credit NPC delivery is a real completed exchange while accepted, in-flight and unpaid contracts are not',()=>{
  const {world,p}=fixture();p.habitable={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[],commerce:{sequence:5,contracts:[trade('paid','completed',NOW-500),trade('reserved','accepted'),trade('moving','in_transit'),trade('expired','expired'),trade('unpaid','completed')]}};const before=structuredClone(world),progress=getPlayerProgress(world,p,NOW);assert.equal(progress.stats.npcSales,1);assert.equal(progress.stats.trades,1);assert.equal(progress.foundation.find(s=>s.id==='trade')!.done,true);assert.match(progress.foundation.find(s=>s.id==='trade')!.detail,/Valleverde/);assert.equal(p.stats.trades,0);assert.deepEqual(world,before);
});

test('foundation records real survey and region travel rather than marking map movement or unrelated crafts as exploration',()=>{
  const {world,p}=fixture();job(world,p,'extract','extract');job(world,p,'craft');let progress=getPlayerProgress(world,p,NOW);assert.equal(progress.foundation.find(s=>s.id==='found')!.done,true);assert.equal(progress.foundation.find(s=>s.id==='craft')!.done,true);assert.equal(progress.foundation.find(s=>s.id==='survey')!.done,false);assert.equal(progress.foundation.find(s=>s.id==='region')!.done,false);job(world,p,'survey','survey');p.visitedRegions.push('r_1_2','r_1_2');progress=getPlayerProgress(world,p,NOW);assert.equal(progress.stats.regionsVisited,2);assert.equal(progress.foundation.find(s=>s.id==='survey')!.done,true);assert.equal(progress.foundation.find(s=>s.id==='region')!.done,true);
});

test('report chronology prefers an explicit completion time and labels an undated cancellation by creation instead of its never-reached future finish',()=>{
  const {world,p}=fixture();job(world,p,'latest','extract',NOW-500);const earlier=job(world,p,'actual-latest','craft',NOW-5000);(earlier as Job&{completedAt:number}).completedAt=NOW-100;const cancelled=job(world,p,'cancelled','farm',NOW+90000,'cancelled');cancelled.createdAt=NOW-50000;const reports=getPlayerReports(world,p,NOW);assert.deepEqual(reports.map(r=>r.jobId),['actual-latest','latest','cancelled']);assert.equal(reports[2].at,cancelled.createdAt);assert.equal(reports[2].dateKind,'created');
});

test('a resolved battle replaces its job duplicate and includes a selected defender without leaking unrelated battles',()=>{
  const {world,p,peer,foreign}=fixture();job(world,peer,'battle','battle');world.jobs.battle.payload.defenderPlayerId=p.id;world.battles.battle={id:'battle',attackerId:peer.id,targetId:p.id,npc:false,convoyId:null,status:'resolved',jobId:'battle',rounds:[],winnerId:p.id,loot:[],report:['Encuentro resuelto.'],resolvedAt:NOW-300};job(world,foreign,'unrelated','battle');world.battles.unrelated={...world.battles.battle,id:'unrelated',attackerId:foreign.id,targetId:null,npc:true,jobId:'unrelated'};const reports=getPlayerReports(world,p,NOW);assert.equal(reports.length,1);assert.equal(reports[0].source,'battle');assert.equal(reports[0].playerId,p.id);assert.equal(reports[0].battleId,'battle');assert.equal(reports[0].at,NOW-300);assert.equal(getPlayerReports(world,peer,NOW).filter(r=>r.jobId==='battle').length,1);
});

test('the tutorial kit does not count as production or a sale and projections expose no inventory, account, costs or secret job payload',()=>{
  const {world,p}=fixture(),inventory=structuredClone(p.inventory),progress=getPlayerProgress(world,p,NOW);assert.ok(p.inventory.every(l=>l.bound));assert.equal(progress.stats.gathered,0);assert.equal(progress.stats.crafted,0);assert.equal(progress.stats.trades,0);const j=job(world,p,'expedition','expedition');j.payload.roll='private-outcome';j.costs=structuredClone(p.inventory);j.report=['Hallazgo resuelto.'];const reports=getPlayerReports(world,p,NOW);assert.ok(!JSON.stringify(reports).includes('private-outcome'));assert.ok(!JSON.stringify(reports).includes('provenance'));reports[0].lines[0]='changed locally';assert.deepEqual(j.report,['Hallazgo resuelto.']);assert.deepEqual(p.inventory,inventory);
});

test('actual fair sales count once per item/payment pair and never attribute another profile sale to the selected explorer',()=>{
  const {world,p,peer}=fixture();give(p,'plank',2,NOW-1000,'genuine-test-recipe',[],false);give(peer,'plank',1,NOW-1000,'genuine-peer-recipe',[],false);const sell=(actor:Player)=>dispatchSocial(world,{type:'npc.sell',playerId:actor.id,itemId:'plank',qty:1},{ownerId:actor.ownerId,requestId:crypto.randomUUID(),now:NOW,actor});
  sell(p);assert.equal(world.social.ledger.filter(l=>l.from===p.id||l.to===p.id).length,2);assert.equal(getPlayerProgress(world,p,NOW).stats.npcSales,1);assert.equal(getPlayerProgress(world,p,NOW).stats.trades,1);assert.equal(getPlayerProgress(world,p,NOW).foundation.find(s=>s.id==='trade')!.done,true);assert.match(getPlayerProgress(world,p,NOW).foundation.find(s=>s.id==='trade')!.detail,/Feria regional/);assert.equal(p.stats.trades,0);
  sell(peer);assert.equal(getPlayerProgress(world,p,NOW).stats.npcSales,1);assert.equal(getPlayerProgress(world,peer,NOW).stats.npcSales,1);sell(p);const before=structuredClone(world),progress=getPlayerProgress(world,p,NOW);assert.equal(progress.stats.npcSales,2);assert.equal(progress.stats.trades,2);assert.equal(world.social.accounts[p.id].credits,12);assert.equal(p.stats.trades,0);assert.deepEqual(world,before);
});

test('unrelated NPC credits and future or foreign item receipts cannot mark the fair exchange complete',()=>{
  const {world,p,peer}=fixture();world.social.ledger.push({id:'unrelated-credit',at:NOW,currency:'credits',amount:12,from:'npc-season',to:p.id,reason:'Devolución de reserva'}, {id:'peer-item',at:NOW,currency:'item',amount:1,from:peer.id,to:'npc-season',reason:'Productos entregados al encargo finito',itemId:'plank'}, {id:'future-item',at:NOW+1,currency:'item',amount:1,from:p.id,to:'npc-season',reason:'Productos entregados al encargo finito',itemId:'plank'});assert.equal(getPlayerProgress(world,p,NOW).stats.npcSales,0);assert.equal(getPlayerProgress(world,p,NOW).foundation.find(s=>s.id==='trade')!.done,false);
});
