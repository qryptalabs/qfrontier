import assert from 'node:assert/strict';
import test from 'node:test';
import { executeMvp, readMvpView } from '../lib/mvp/engine.ts';
import { available, give } from '../lib/mvp/helpers.ts';
import { dispatchProduction, settleProduction } from '../lib/mvp/production.ts';
import { dispatchSocial } from '../lib/mvp/social.ts';
import { dispatchTerritory } from '../lib/mvp/territory.ts';
import { globalToTile, normalizeSettlements, PARCEL_DEPTH, PARCEL_SPACING, PARCEL_WIDTH, plotForIndex, STARTER_PROTECTION_MS, starterProtection, tileToGlobal } from '../lib/mvp/settlements.ts';
import { createMvpWorld, createPlayer, HOME_TILE } from '../lib/mvp/world.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpCommand, MvpWorld, Player } from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-20T18:30:00Z'),DAY=86_400_000;
class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;
  async read(){await Promise.resolve();return structuredClone(this.record);}
  async insert(world:MvpWorld){await Promise.resolve();this.record??={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){await Promise.resolve();if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
const create=(name:string)=>({type:'player.create',name,stationName:`Refugio ${name}`,faction:'cartographers'});
function person(world:MvpWorld,owner:string,at=NOW-4*DAY){return createPlayer(world,{ownerId:owner,requestId:crypto.randomUUID(),now:at,actor:null},create(`Persona ${Object.keys(world.players).length}`));}
function step(world:MvpWorld,player:Player,command:MvpCommand,now=NOW){const ctx={ownerId:player.ownerId,requestId:crypto.randomUUID(),now,actor:player};assert.equal(dispatchProduction(world,command,ctx)||dispatchTerritory(world,command,ctx)||dispatchSocial(world,command,ctx),true);}
function stocked(world:MvpWorld,owner:string,at=NOW-4*DAY){const p=person(world,owner,at);p.inventory=[];give(p,'ration',40,NOW,'fixture');give(p,'water',40,NOW,'fixture');give(p,'timber',40,NOW,'fixture');p.units=[{id:`unit_${p.id}`,type:'guard',health:100,busy:false,trainedAt:at}];p.milestones.push('npc-training');p.pvpEnabled=at+STARTER_PROTECTION_MS<=NOW;return p;}
function convoyConflict(){const world=createMvpWorld('owner-a',NOW-4*DAY),attacker=stocked(world,'owner-a'),target=stocked(world,'owner-b');step(world,target,{type:'convoy.start',tileId:'t_4_3',cargo:[{itemId:'timber',qty:10}],unitIds:target.units.map(u=>u.id),exposed:true});return{world,attacker,target,convoy:Object.values(world.convoys)[0]};}

test('permanent parcel spiral is unique, non-overlapping and deterministic across hundreds of stations',()=>{
  const first=Array.from({length:9},(_,i)=>plotForIndex(i));
  assert.deepEqual(first.map(p=>[p.x,p.y]),[[0,0],[48,0],[48,48],[0,48],[-48,48],[-48,0],[-48,-48],[0,-48],[48,-48]]);
  const plots=Array.from({length:800},(_,i)=>plotForIndex(i));
  assert.equal(new Set(plots.map(p=>`${p.x},${p.y}`)).size,plots.length);
  for(const plot of plots){assert.equal(plot.width,PARCEL_WIDTH);assert.equal(plot.depth,PARCEL_DEPTH);assert.ok(plot.x%PARCEL_SPACING===0);assert.ok(plot.y%PARCEL_SPACING===0);assert.deepEqual(plot,plotForIndex(plot.index));}
  for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++)assert.ok(Math.abs(plots[i].x-plots[j].x)>=PARCEL_WIDTH||Math.abs(plots[i].y-plots[j].y)>=PARCEL_DEPTH);
});

test('global coordinates project to existing resource sectors without creating resources outside the atlas',()=>{
  assert.equal(globalToTile(0,0),'t_4_4');assert.equal(globalToTile(95.99,0),'t_4_4');assert.equal(globalToTile(96,0),'t_4_5');assert.equal(globalToTile(-96.01,0),'t_4_3');assert.equal(globalToTile(1e6,-1e6),'t_0_8');
  for(let row=0;row<9;row++)for(let col=0;col<9;col++){const id=`t_${row}_${col}`,point=tileToGlobal(id);assert.equal(globalToTile(point.x,point.y),id);}
  assert.throws(()=>globalToTile(NaN,0));assert.throws(()=>tileToGlobal('t_9_4'));
});

test('simultaneous accounts receive unique CAS-persisted parcels and forged coordinates are ignored',async()=>{
  const store=new MemoryStore();
  const views=await Promise.all(Array.from({length:8},(_,index)=>executeMvp(store,`owner-${index}`,{...create(`Estación ${index}`),settlement:plotForIndex(0),createdAt:0},crypto.randomUUID(),undefined,NOW)));
  const players=Object.values(store.record!.world.players);
  assert.equal(players.length,8);assert.equal(new Set(players.map(p=>p.settlement!.index)).size,8);
  assert.ok(players.every(p=>p.createdAt===NOW));assert.ok(views.every(v=>v.player!.settlement));
  const next=await executeMvp(store,'owner-0',create('Segunda'),crypto.randomUUID(),undefined,NOW+1000);
  assert.equal(next.player!.settlement!.index,8);
});

test('legacy migration assigns missing parcels once while preserving all jobs, holdings and depleted budgets',async()=>{
  const world=createMvpWorld('owner-a',NOW),a=person(world,'owner-a',NOW),b=person(world,'owner-b',NOW+1);
  step(world,a,{type:'craft.start',recipeId:'iron_ingot',qty:1},NOW);
  world.tiles[HOME_TILE].deposits[0].layers[0].remaining-=7;world.tiles[HOME_TILE].deposits[0].layers[0].extracted+=7;
  const retained=structuredClone({jobs:world.jobs,tiles:world.tiles,inventory:a.inventory,stats:a.stats,createdAt:a.createdAt});delete a.settlement;delete b.settlement;
  const store=new MemoryStore();await store.insert(world);
  const first=await readMvpView(store,'owner-a',a.id,NOW);
  assert.equal(store.record!.revision,1);assert.equal(first.settlements.length,2);assert.deepEqual(first.player!.settlement,plotForIndex(0));
  assert.deepEqual({jobs:store.record!.world.jobs,tiles:store.record!.world.tiles,inventory:store.record!.world.players[a.id].inventory,stats:store.record!.world.players[a.id].stats,createdAt:store.record!.world.players[a.id].createdAt},retained);
  const second=await readMvpView(store,'owner-a',a.id,NOW);assert.equal(second.revision,first.revision);
  assert.deepEqual(second.settlements,first.settlements);
});

test('plots remain at their original global position after travel and public settlements reveal no private holdings',async()=>{
  const store=new MemoryStore();const a=await executeMvp(store,'secret-owner-a',create('Alba'),crypto.randomUUID(),undefined,NOW);
  await executeMvp(store,'secret-owner-b',create('Bosque'),crypto.randomUUID(),undefined,NOW);
  const view=await executeMvp(store,'secret-owner-a',{type:'world.travel',playerId:a.player!.id,tileId:'t_4_3'},crypto.randomUUID(),undefined,NOW);
  const end=view.jobs.find(j=>j.kind==='travel')!.endsAt,arrived=await readMvpView(store,'secret-owner-a',a.player!.id,end);
  assert.equal(arrived.player!.position,'t_4_3');assert.deepEqual(arrived.player!.settlement,a.player!.settlement);
  assert.equal(arrived.settlements.length,2);assert.equal(arrived.settlements.filter(s=>s.own).length,1);
  const publicOnly=JSON.stringify(arrived.settlements);assert.ok(!publicOnly.includes('secret-owner'));for(const field of ['inventory','units','ownerId','rngSeed','receipts','credits'])assert.ok(!publicOnly.includes(`"${field}"`));
  await assert.rejects(executeMvp(store,'secret-owner-b',{type:'pvp.toggle',playerId:a.player!.id,enabled:true,starterProtection:{active:false}},crypto.randomUUID(),undefined,end),{status:403});
});

test('partial migration retains valid parcel identities and repairs duplicate legacy assignments deterministically',()=>{
  const world=createMvpWorld('owner-a',NOW),a=person(world,'owner-a'),b=person(world,'owner-b'),c=person(world,'owner-c');a.settlement=plotForIndex(30);b.settlement=plotForIndex(30);delete c.settlement;
  normalizeSettlements(world);const plots=Object.values(world.players).map(p=>p.settlement!);
  assert.equal(new Set(plots.map(p=>p.id)).size,3);assert.equal(plots.filter(p=>p.index===30).length,1);
  const preserved=structuredClone(plots);normalizeSettlements(world);assert.deepEqual(Object.values(world.players).map(p=>p.settlement),preserved);
});

test('protection belongs to the earliest profile of an account and ends at exactly 72 server-clock hours',async()=>{
  const store=new MemoryStore();const first=await executeMvp(store,'owner-a',create('Primero'),crypto.randomUUID(),undefined,NOW);
  const later=await executeMvp(store,'owner-a',create('Segundo'),crypto.randomUUID(),undefined,NOW+DAY);
  for(const p of later.players)assert.deepEqual(p.starterProtection,{startsAt:NOW,endsAt:NOW+STARTER_PROTECTION_MS,active:true});
  store.record!.world.players[first.player!.id].milestones.push('npc-training');
  await assert.rejects(executeMvp(store,'owner-a',{type:'pvp.toggle',playerId:first.player!.id,enabled:true,createdAt:0},crypto.randomUUID(),undefined,NOW+STARTER_PROTECTION_MS-1),/72 horas/);
  const ended=await readMvpView(store,'owner-a',first.player!.id,NOW+STARTER_PROTECTION_MS);assert.equal(ended.player!.starterProtection.active,false);assert.equal(ended.player!.pvpEnabled,false);
  const consent=await executeMvp(store,'owner-a',{type:'pvp.toggle',playerId:first.player!.id,enabled:true},crypto.randomUUID(),undefined,NOW+STARTER_PROTECTION_MS);assert.equal(consent.player!.pvpEnabled,true);
  assert.equal(starterProtection(store.record!.world,store.record!.world.players[later.player!.id],NOW+4*DAY).endsAt,NOW+STARTER_PROTECTION_MS);
});

test('new explorers may train against NPCs while their protected convoys cannot become exposed',()=>{
  const world=createMvpWorld('owner-a',NOW),p=stocked(world,'owner-a',NOW);
  assert.equal(starterProtection(world,p,NOW).active,true);
  assert.throws(()=>step(world,p,{type:'pvp.toggle',enabled:true}),/72 horas/);
  assert.throws(()=>step(world,p,{type:'convoy.start',tileId:'t_4_3',cargo:[{itemId:'timber',qty:5}],unitIds:p.units.map(u=>u.id),exposed:true}),/72 horas/);
  step(world,p,{type:'battle.start',tileId:HOME_TILE,unitIds:p.units.map(u=>u.id)});const battle=Object.values(world.battles)[0];settleProduction(world,world.jobs[battle.jobId].endsAt);
  assert.equal(battle.rounds.length,3);assert.equal(battle.npc,true);assert.equal(battle.status,'resolved');
});

test('convoy attacks reject shielded attackers and shielded defenders despite old persisted consent or forged flags',()=>{
  for(const side of ['attacker','target'] as const){const state=convoyConflict();state[side].createdAt=NOW;const before=structuredClone(state.world);
    assert.throws(()=>step(state.world,state.attacker,{type:'battle.raid',convoyId:state.convoy.id,unitIds:state.attacker.units.map(u=>u.id),protectionUntil:0,starterProtection:{active:false}}),/72 horas/);assert.deepEqual(state.world,before);
  }
});

test('migration voids pending legacy PvP without damage or loot and returns committed supplies exactly once',async()=>{
  const state=convoyConflict();const food=available(state.attacker,'ration',NOW);
  step(state.world,state.attacker,{type:'battle.raid',convoyId:state.convoy.id,unitIds:state.attacker.units.map(u=>u.id)});
  const battle=Object.values(state.world.battles)[0],ends=state.world.jobs[battle.jobId].endsAt;state.target.createdAt=NOW;
  const store=new MemoryStore();await store.insert(state.world);const view=await readMvpView(store,'owner-a',state.attacker.id,ends);
  assert.equal(view.battles[0].winnerId,null);assert.deepEqual(view.battles[0].rounds,[]);assert.deepEqual(view.battles[0].loot,[]);
  assert.equal(view.player!.units[0].health,100);assert.equal(view.player!.units[0].busy,false);assert.equal(available(store.record!.world.players[state.attacker.id],'ration',ends),food);
  assert.equal(store.record!.world.players[state.target.id].pvpEnabled,false);
  await readMvpView(store,'owner-a',state.attacker.id,ends);assert.equal(available(store.record!.world.players[state.attacker.id],'ration',ends),food);
});

test('clan outpost disputes cannot target a protected holder or enlist a protected defensive commander',()=>{
  const world=createMvpWorld('owner-a',NOW-4*DAY),holder=stocked(world,'owner-a'),attacker=stocked(world,'owner-b'),newcomer=stocked(world,'owner-c',NOW);
  step(world,holder,{type:'clan.create',name:'Guardia del Valle'});step(world,attacker,{type:'clan.create',name:'Otra Guardia'});
  const clan=world.social.clans.find(c=>Object.hasOwn(c.members,holder.id))!;step(world,newcomer,{type:'clan.join',clanId:clan.id});clan.members[newcomer.id]='coordinator';
  const site=Object.values(world.tiles).find(t=>!t.protected&&t.terrain!=='water')!;for(const p of [holder,attacker,newcomer])p.position=site.id;
  step(world,holder,{type:'outpost.claim',tileId:site.id,riskAccepted:true});const post=world.social.outposts[0];
  assert.throws(()=>step(world,newcomer,{type:'outpost.defense',outpostId:post.id,unitIds:newcomer.units.map(u=>u.id)}),/72 horas/);
  post.defense={playerId:newcomer.id,unitIds:newcomer.units.map(u=>u.id)};
  assert.throws(()=>step(world,attacker,{type:'battle.outpost',outpostId:post.id,unitIds:attacker.units.map(u=>u.id)}),/72 horas/);
  post.defense=undefined;holder.createdAt=NOW;
  assert.throws(()=>step(world,attacker,{type:'battle.outpost',outpostId:post.id,unitIds:attacker.units.map(u=>u.id)}),/72 horas/);
  assert.equal(post.clanId,clan.id);assert.equal(attacker.units[0].busy,false);
});

test('legacy territorial battles release both formations and preserve the concession when a defender is protected',()=>{
  const world=createMvpWorld('owner-a',NOW-4*DAY),holder=stocked(world,'owner-a'),attacker=stocked(world,'owner-b'),defender=stocked(world,'owner-c');
  step(world,holder,{type:'clan.create',name:'Guardia Antigua'});step(world,attacker,{type:'clan.create',name:'Guardia Distante'});
  const clan=world.social.clans.find(c=>Object.hasOwn(c.members,holder.id))!;step(world,defender,{type:'clan.join',clanId:clan.id});clan.members[defender.id]='coordinator';
  const site=Object.values(world.tiles).find(t=>!t.protected&&t.terrain!=='water')!;for(const p of [holder,attacker,defender])p.position=site.id;
  step(world,holder,{type:'outpost.claim',tileId:site.id,riskAccepted:true});const post=world.social.outposts[0],expires=post.expiresAt;
  step(world,defender,{type:'outpost.defense',outpostId:post.id,unitIds:defender.units.map(u=>u.id)});
  const food=available(attacker,'ration',NOW);step(world,attacker,{type:'battle.outpost',outpostId:post.id,unitIds:attacker.units.map(u=>u.id)});
  const battle=Object.values(world.battles)[0],job=world.jobs[battle.jobId];defender.createdAt=NOW;
  settleProduction(world,job.endsAt);
  assert.equal(battle.status,'resolved');assert.equal(battle.winnerId,null);assert.deepEqual(battle.rounds,[]);assert.deepEqual(battle.loot,[]);
  assert.equal(post.clanId,clan.id);assert.equal(post.holderId,holder.id);assert.equal(post.expiresAt,expires);assert.equal(post.pendingBattleId,null);
  for(const p of [attacker,defender]){assert.equal(p.units[0].health,100);assert.equal(p.units[0].busy,false);assert.equal(p.pvpCooldownUntil,0);}
  assert.equal(available(attacker,'ration',job.endsAt),food);settleProduction(world,job.endsAt);assert.equal(available(attacker,'ration',job.endsAt),food);
});
