import assert from 'node:assert/strict';
import test from 'node:test';
import { available, give, MvpError } from '../lib/mvp/helpers.ts';
import { dispatchSocial, getSocialView, settleSocial } from '../lib/mvp/social.ts';
import { dispatchTerritory, getOutpostRouteFactor, getOutpostSurveyFactor, resolveOutpostBattle, settleTerritory, TERRITORY_PARAMETERS } from '../lib/mvp/territory.ts';
import { createMvpWorld, createPlayer, routeTo } from '../lib/mvp/world.ts';
import type { MvpCommand, MvpWorld, Unit } from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-14T12:00:00Z'),HOUR=3_600_000;
let sequence=0;
function fixture(count=3) {
  const world=createMvpWorld('owner0',NOW),ids:string[]=[];
  for(let index=0;index<count;index++){
    const player=createPlayer(world,{ownerId:`owner${index}`,requestId:`territory_${index}`,actor:null,now:NOW-73*HOUR},{type:'player.create',name:`Explorer ${index}`,stationName:`Station ${index}`,faction:'cartographers'});
    give(player,'timber',30,NOW,'mining');give(player,'ration',10,NOW,'craft');ids.push(player.id);
    player.pvpEnabled=true;
  }
  settleSocial(world,NOW);return {world,ids};
}
function step(world:MvpWorld,playerId:string,command:MvpCommand,now=NOW):void {
  const next=structuredClone(world),player=next.players[playerId];settleTerritory(next,now);settleSocial(next,now);
  const ctx={ownerId:player.ownerId,requestId:`territory_${++sequence}`,actor:player,now};
  const actual={...(command.type==='outpost.claim'?{riskAccepted:true}:{}),...command,playerId};
  assert.equal(dispatchTerritory(next,actual,ctx)||dispatchSocial(next,actual,ctx),true);Object.assign(world,next);
}
function site(world:MvpWorld,index=0) {return Object.values(world.tiles).filter(tile=>!tile.protected&&tile.terrain!=='water')[index].id;}
function clan(world:MvpWorld,playerId:string,name='Frontier clan') {step(world,playerId,{type:'clan.create',name});return world.social.clans.at(-1)!.id;}
function claim(world:MvpWorld,playerId:string,tileId:string,purpose='logistics') {world.players[playerId].position=tileId;step(world,playerId,{type:'outpost.claim',tileId,purpose});return world.social.outposts.at(-1)!.id;}
function rejects(world:MvpWorld,playerId:string,command:MvpCommand,pattern:RegExp,now=NOW) {const original=structuredClone(world);assert.throws(()=>step(world,playerId,command,now),pattern);assert.deepEqual(world,original);}

test('territory requires an owned player and a legitimate clan representative',()=>{
  const {world,ids:[founder,member]}=fixture();const clanId=clan(world,founder);
  step(world,member,{type:'clan.join',clanId});world.players[member].position=site(world);
  rejects(world,member,{type:'outpost.claim',tileId:site(world)},/fundadores y coordinadores/);
  assert.throws(()=>dispatchTerritory(world,{type:'outpost.claim',tileId:site(world)},{ownerId:'attacker',actor:world.players[founder],now:NOW,requestId:'fake'}),(error:unknown)=>error instanceof MvpError&&error.status===403);
  assert.throws(()=>dispatchTerritory(world,{type:'outpost.claim',tileId:site(world)},{ownerId:'owner0',actor:null,now:NOW,requestId:'fake'}),(error:unknown)=>error instanceof MvpError&&error.status===403);
});

test('protected home and remote sectors cannot be claimed; bound tutorial supplies cannot fund a concession',()=>{
  const {world,ids:[founder]}=fixture();clan(world,founder);
  rejects(world,founder,{type:'outpost.claim',tileId:'t_4_4'},/protegidos/);
  rejects(world,founder,{type:'outpost.claim',tileId:site(world)},/Viaja/);
  world.players[founder].position=site(world);world.players[founder].inventory=world.players[founder].inventory.filter(l=>l.bound);
  rejects(world,founder,{type:'outpost.claim',tileId:site(world)},/transferibles/);
});

test('one clan cannot claim a second active or suspended post and one tile cannot be claimed twice',()=>{
  const {world,ids:[first,second]}=fixture();clan(world,first,'First clan');clan(world,second,'Second clan');
  const tileId=site(world);claim(world,first,tileId);world.players[first].position=site(world,1);
  rejects(world,first,{type:'outpost.claim',tileId:site(world,1)},/solo puesto/);
  world.players[second].position=tileId;rejects(world,second,{type:'outpost.claim',tileId},/ya tiene/);
  settleTerritory(world,NOW+25*HOUR);assert.equal(world.social.outposts[0].status,'suspended');
  rejects(world,first,{type:'outpost.claim',tileId:site(world,1)},/solo puesto/,NOW+25*HOUR);
});

test('active alliances cannot exceed two live concessions across three member clans',()=>{
  const {world,ids}=fixture();const clanIds=ids.map((id,index)=>clan(world,id,`Clan ${index}`));
  step(world,ids[0],{type:'alliance.propose',name:'Shared frontier',clanIds});const allianceId=world.social.alliances[0].id;
  step(world,ids[1],{type:'alliance.accept',allianceId});step(world,ids[2],{type:'alliance.accept',allianceId});
  claim(world,ids[0],site(world,0));claim(world,ids[1],site(world,1));world.players[ids[2]].position=site(world,2);
  rejects(world,ids[2],{type:'outpost.claim',tileId:site(world,2)},/dos puestos/);
});

test('forming an alliance cannot bypass the two-post cap using preexisting concessions',()=>{
  const {world,ids}=fixture();const clanIds=ids.map((id,index)=>clan(world,id,`Owners ${index}`));
  ids.forEach((id,index)=>claim(world,id,site(world,index)));
  rejects(world,ids[0],{type:'alliance.propose',name:'Too many posts',clanIds},/dos puestos/);
});

test('missing upkeep suspends real logistics benefits; concession expiry preserves station, inventory and mine budgets',()=>{
  const {world,ids:[founder]}=fixture();clan(world,founder);const tileId=site(world),deposits=structuredClone(world.tiles[tileId].deposits);
  claim(world,founder,tileId);assert.equal(getOutpostRouteFactor(world,founder,[tileId],NOW),0.9);
  assert.equal(getOutpostRouteFactor(world,founder,[tileId],NOW+25*HOUR),1);
  settleTerritory(world,NOW+25*HOUR);assert.equal(world.social.outposts[0].status,'suspended');
  const inventory=structuredClone(world.players[founder].inventory);
  settleTerritory(world,NOW+49*HOUR);settleTerritory(world,NOW+49*HOUR);
  assert.equal(world.social.outposts[0].status,'expired');assert.equal(world.social.outposts[0].history.filter(h=>h.kind==='expired').length,1);
  assert.equal(world.players[founder].basicTool,true);assert.equal(world.players[founder].stationName,'Station 0');assert.deepEqual(world.players[founder].inventory,inventory);
  assert.deepEqual(world.tiles[tileId].deposits,deposits);
});

test('maintenance consumes real supplies and restores services without extending the original concession',()=>{
  const {world,ids:[founder]}=fixture();clan(world,founder);const tileId=site(world),postId=claim(world,founder,tileId);
  const initialWood=available(world.players[founder],'timber',NOW,true),initialFood=available(world.players[founder],'ration',NOW,true);
  step(world,founder,{type:'outpost.maintain',outpostId:postId},NOW+25*HOUR);
  const post=world.social.outposts[0];assert.equal(post.status,'active');assert.equal(post.expiresAt,NOW+48*HOUR);assert.equal(post.maintenanceUntil,post.expiresAt);
  assert.equal(available(world.players[founder],'timber',NOW+25*HOUR,true),initialWood-2);assert.equal(available(world.players[founder],'ration',NOW+25*HOUR,true),initialFood-1);
  assert.equal(getOutpostRouteFactor(world,founder,[tileId],NOW+26*HOUR),0.9);
  rejects(world,founder,{type:'outpost.maintain',outpostId:postId},/cubre toda/,NOW+26*HOUR);
  rejects(world,founder,{type:'outpost.maintain',outpostId:postId},/finalizó/,NOW+49*HOUR);
});

test('release preserves history, refunds no consumed materials and cannot capture another clan post',()=>{
  const {world,ids:[first,second]}=fixture();clan(world,first,'First holder');clan(world,second,'Second holder');const tileId=site(world),postId=claim(world,first,tileId);
  const timber=available(world.players[first],'timber',NOW,true);rejects(world,second,{type:'outpost.release',outpostId:postId},/otro clan/);
  step(world,first,{type:'outpost.release',outpostId:postId});assert.equal(world.social.outposts[0].status,'expired');assert.equal(available(world.players[first],'timber',NOW,true),timber);
  assert.deepEqual(world.social.outposts[0].history.map(h=>h.kind),['claimed','released']);
  claim(world,second,tileId);assert.equal(world.social.outposts.length,2);
});

test('a logistics post never blocks public routes or grants a bonus to strangers',()=>{
  const {world,ids:[first,second]}=fixture();clan(world,first);const tileId=site(world),routeBefore=routeTo(world,'t_4_4',tileId);
  claim(world,first,tileId);const routeAfter=routeTo(world,'t_4_4',tileId);
  assert.deepEqual(routeAfter,routeBefore);assert.equal(getOutpostRouteFactor(world,second,routeAfter,NOW),1);
  assert.equal(getOutpostRouteFactor(world,first,routeAfter,NOW),TERRITORY_PARAMETERS.logisticsTimeFactor);
});

test('an observatory reuses an exhausted mine without recreating material or changing budgets',()=>{
  const {world,ids:[founder]}=fixture();clan(world,founder);const tileId=site(world);world.players[founder].position=tileId;
  rejects(world,founder,{type:'outpost.claim',tileId,purpose:'observatory'},/totalmente agotado/);
  for(const deposit of world.tiles[tileId].deposits)for(const layer of deposit.layers){layer.extracted=layer.budget;layer.remaining=0;layer.reserved=0;}
  const deposits=structuredClone(world.tiles[tileId].deposits);claim(world,founder,tileId,'observatory');
  assert.deepEqual(world.tiles[tileId].deposits,deposits);assert.equal(getOutpostSurveyFactor(world,founder,tileId,NOW),0.9);
  assert.equal(getOutpostRouteFactor(world,founder,[tileId],NOW),1);
  assert.equal(getOutpostSurveyFactor(world,founder,tileId,NOW+25*HOUR),1);
});

test('public outpost history contains no owner identities or foreign private inventory',()=>{
  const {world,ids:[first,second]}=fixture();clan(world,first);claim(world,first,site(world));
  const view=getSocialView(world,world.players[second],'owner1');assert.equal(view.outposts.length,1);
  assert.equal(JSON.stringify(view.outposts).includes('owner0'),false);assert.equal('inventory' in view.outposts[0],false);
  assert.equal(view.parameters.outposts.disputesEnabled,true);
});

const WINDOW=NOW+6*HOUR;
function units(world:MvpWorld,playerId:string,count:number,type:Unit['type']='guard',health=100) {
  const created:Unit[]=Array.from({length:count},(_,index)=>({id:`formation_${playerId}_${world.players[playerId].units.length+index}`,type,health,busy:false,trainedAt:NOW}));
  world.players[playerId].units.push(...created);return created.map(unit=>unit.id);
}
function conflict() {
  const {world,ids:[holder,attacker]}=fixture(2);clan(world,holder,'Defending clan');clan(world,attacker,'Attacking clan');
  const tileId=site(world),postId=claim(world,holder,tileId);world.players[attacker].position=tileId;
  give(world.players[attacker],'ration',20,NOW,'craft');give(world.players[attacker],'water',20,NOW,'mining');
  const attackIds=units(world,attacker,6,'guard'),defenseIds=units(world,holder,1,'scout',25);
  step(world,holder,{type:'outpost.defense',outpostId:postId,unitIds:defenseIds});
  return {world,holder,attacker,tileId,postId,attackIds,defenseIds};
}
function begin(state:ReturnType<typeof conflict>,now=WINDOW) {
  step(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},now);
  return Object.values(state.world.jobs).find(job=>job.payload.outpostId===state.postId)!;
}

test('claim requires explicit territorial risk and PvP consent',()=>{
  const {world,ids:[holder]}=fixture(1);clan(world,holder);world.players[holder].position=site(world);
  rejects(world,holder,{type:'outpost.claim',tileId:site(world),riskAccepted:false},/expresamente/);
  world.players[holder].pvpEnabled=false;rejects(world,holder,{type:'outpost.claim',tileId:site(world),riskAccepted:true},/PvP/);
});

test('outpost disputes reject off-window, nonconsenting, same-owner, allied and resting actors',()=>{
  let state=conflict();rejects(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},/18:00/);
  state.world.players[state.attacker].pvpEnabled=false;rejects(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},/PvP/,WINDOW);
  state=conflict();state.world.players[state.attacker].ownerId=state.world.players[state.holder].ownerId;
  rejects(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},/misma cuenta/,WINDOW);
  state=conflict();state.world.players[state.holder].pvpCooldownUntil=WINDOW+HOUR;
  rejects(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},/descanso/,WINDOW);
  state=conflict();const clanIds=state.world.social.clans.map(c=>c.id);
  step(state.world,state.holder,{type:'alliance.propose',name:'Non aggression',clanIds});const allianceId=state.world.social.alliances[0].id;
  step(state.world,state.attacker,{type:'alliance.accept',allianceId});
  rejects(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},/no agresión/,WINDOW);
});

test('defense and attacks use at most six distinct, available units actually owned by their commander',()=>{
  const state=conflict(),{world,holder,attacker,postId,attackIds,defenseIds}=state;
  rejects(world,holder,{type:'outpost.defense',outpostId:postId,unitIds:attackIds},/ajena/);
  const seven=[...defenseIds,...units(world,holder,6)];rejects(world,holder,{type:'outpost.defense',outpostId:postId,unitIds:seven},/seis/);
  rejects(world,attacker,{type:'battle.outpost',outpostId:postId,unitIds:[attackIds[0],attackIds[0]]},/distintas/,WINDOW);
  rejects(world,attacker,{type:'battle.outpost',outpostId:postId,unitIds:defenseIds},/ajena/,WINDOW);
  world.players[attacker].units[0].busy=true;rejects(world,attacker,{type:'battle.outpost',outpostId:postId,unitIds:attackIds},/ocupada/,WINDOW);
});

test('a committed battle reserves actual rations and weather-adjusted water and locks both formations',()=>{
  const state=conflict(),{world,attacker,holder,postId}=state;
  const food=available(world.players[attacker],'ration',WINDOW),water=available(world.players[attacker],'water',WINDOW);
  const job=begin(state);const battle=world.battles[String(job.payload.battleId)];
  assert.equal(battle.status,'scheduled');assert.equal(job.kind,'battle');assert.equal(job.endsAt,WINDOW+20_000);
  assert.equal(food-available(world.players[attacker],'ration',WINDOW),12);
  assert.equal(water-available(world.players[attacker],'water',WINDOW),Math.ceil(6*job.weather.waterFactor));
  assert.ok(world.players[attacker].units.every(unit=>unit.busy));assert.ok(world.players[holder].units.every(unit=>unit.busy));
  assert.equal(world.social.outposts[0].pendingBattleId,job.id);
  rejects(world,holder,{type:'outpost.release',outpostId:postId},/comprometida/,WINDOW);
  rejects(world,holder,{type:'outpost.maintain',outpostId:postId},/comprometida/,WINDOW);
  rejects(world,holder,{type:'outpost.defense',outpostId:postId,unitIds:[]},/comprometida/,WINDOW);
});

test('insufficient supplies cannot partially debit an attacker or lock formations',()=>{
  const state=conflict();state.world.players[state.attacker].inventory=state.world.players[state.attacker].inventory.filter(lot=>lot.itemId!=='water');
  rejects(state.world,state.attacker,{type:'battle.outpost',outpostId:state.postId,unitIds:state.attackIds},/raciones y agua/,WINDOW);
  assert.ok(state.world.players[state.attacker].units.every(unit=>!unit.busy));assert.equal(Object.keys(state.world.battles).length,0);
});

test('three deterministic rounds capture the original concession with no station loot, currency or new reserves',()=>{
  const state=conflict(),{world,holder,attacker,postId}=state;const expiry=world.social.outposts[0].expiresAt,maintenance=world.social.outposts[0].maintenanceUntil;
  const tiles=structuredClone(world.tiles),accounts=structuredClone(world.social.accounts),defenderInventory=structuredClone(world.players[holder].inventory);
  const job=begin(state),attackerInventory=structuredClone(world.players[attacker].inventory);
  resolveOutpostBattle(world,job,job.endsAt-1);assert.equal(world.battles[String(job.payload.battleId)].status,'scheduled');
  resolveOutpostBattle(world,job,job.endsAt);const after=structuredClone(world);resolveOutpostBattle(world,job,job.endsAt);
  assert.deepEqual(world,after);const battle=world.battles[String(job.payload.battleId)],post=world.social.outposts.find(p=>p.id===postId)!;
  assert.equal(battle.rounds.length,3);assert.equal(battle.status,'resolved');assert.equal(battle.winnerId,attacker);assert.deepEqual(battle.loot,[]);
  assert.equal(post.holderId,attacker);assert.equal(post.clanId,world.social.clans.find(c=>Object.hasOwn(c.members,attacker))!.id);
  assert.equal(post.expiresAt,expiry);assert.equal(post.maintenanceUntil,maintenance);assert.equal(post.pendingBattleId,null);
  assert.deepEqual(world.tiles,tiles);assert.deepEqual(world.social.accounts,accounts);assert.deepEqual(world.players[holder].inventory,defenderInventory);assert.deepEqual(world.players[attacker].inventory,attackerInventory);
  assert.ok(world.players[holder].units.every(unit=>!unit.busy&&unit.health>=1));assert.ok(world.players[attacker].units.every(unit=>!unit.busy&&unit.health>=1));
  assert.equal(world.players[holder].basicTool,true);assert.equal(world.players[holder].stationName,'Station 0');
  assert.equal(post.cooldownUntil,job.endsAt+24*HOUR);assert.equal(world.players[holder].pvpCooldownUntil,job.endsAt+24*HOUR);assert.equal(world.players[attacker].pvpCooldownUntil,job.endsAt+24*HOUR);
});

test('a resolved territorial dispute enforces the same published 24-hour rest for the losing side',()=>{
  const state=conflict(),job=begin(state);resolveOutpostBattle(state.world,job,job.endsAt);
  const replacement=units(state.world,state.holder,1,'guard');
  rejects(state.world,state.holder,{type:'battle.outpost',outpostId:state.postId,unitIds:replacement},/descanso/,WINDOW+21_000);
  step(state.world,state.holder,{type:'battle.outpost',outpostId:state.postId,unitIds:replacement},job.endsAt+24*HOUR+1);
  assert.equal(Object.values(state.world.battles).filter(b=>b.status==='scheduled').length,1);
});

test('pending captures reserve clan capacity and cannot be bypassed by a simultaneous fresh claim',()=>{
  const state=conflict();begin(state);state.world.players[state.attacker].position=site(state.world,2);
  rejects(state.world,state.attacker,{type:'outpost.claim',tileId:site(state.world,2)},/capturas pendientes/,WINDOW);
});

test('diplomacy cannot turn an already committed adversarial battle into a no-aggression capture',()=>{
  const state=conflict();begin(state);
  rejects(state.world,state.attacker,{type:'alliance.propose',name:'Late peace',clanIds:state.world.social.clans.map(c=>c.id)},/disputa territorial/,WINDOW);
});

