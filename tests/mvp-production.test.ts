import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ITEMS, RECIPES, RECIPE_CATALOG } from '../lib/mvp/catalog.ts';
import { addLots, available, consume, give, MvpError } from '../lib/mvp/helpers.ts';
import { dispatchProduction, settleProduction } from '../lib/mvp/production.ts';
import { createMvpWorld, HOME_TILE, weatherFor, WEATHER_WINDOW } from '../lib/mvp/world.ts';
import type { Context, ItemId, MvpCommand, MvpWorld, Player } from '../lib/mvp/types.ts';
const START=Date.UTC(2026,9,15,3);
let sequence=0;
function run(world:MvpWorld,playerId:string|null,command:MvpCommand,now=START,ownerId='owner-a'):MvpWorld{
 const next=structuredClone(world),ctx:Context={ownerId,requestId:`command-${++sequence}`,now,actor:playerId?next.players[playerId]:null};
 assert.equal(dispatchProduction(next,command,ctx),true);return next;
}
function setup(veteran=false){const createdAt=START-(veteran?73*3600000:0);let world=createMvpWorld('owner-a',createdAt);world=run(world,null,{type:'player.create',name:'Nova',stationName:'Aurora',faction:'cartographers'},createdAt);return{world,id:Object.keys(world.players)[0]};}
function complete(world:MvpWorld){const pending=Object.values(world.jobs).filter(j=>j.status==='reserved'||j.status==='running');const at=Math.max(START,...pending.map(j=>j.endsAt));settleProduction(world,at);return at;}
function grant(p:Player,itemId:ItemId,qty:number,bound=false){return give(p,itemId,qty,START,'test-budget',[],bound);}
function woodTile(world:MvpWorld){return Object.values(world.tiles).find(t=>t.biome==='forest'&&t.terrain!=='water')!;}
function position(world:MvpWorld,id:string,tileId:string){const p=world.players[id];p.position=tileId;if(!p.discovered.includes(tileId))p.discovered.push(tileId);if(!p.surveyed.includes(tileId))p.surveyed.push(tileId);}

test('catalog has forty objects, twenty-four recipes, and exact PDF resource ratios',()=>{
 assert.equal(ITEMS.length,40);assert.equal(new Set(ITEMS.map(i=>i.id)).size,40);assert.equal(RECIPES.length,24);
 assert.deepEqual(RECIPE_CATALOG.iron_ingot?.inputs,[{itemId:'iron_ore',qty:3}]);
 assert.deepEqual(RECIPE_CATALOG.alloy?.inputs,[{itemId:'iron_ingot',qty:2},{itemId:'copper_wire',qty:1}]);
 assert.deepEqual(RECIPE_CATALOG.ration?.inputs,[{itemId:'grain',qty:2},{itemId:'water',qty:1}]);
 assert.deepEqual(RECIPE_CATALOG.nutrient?.inputs,[{itemId:'biomass',qty:3},{itemId:'water',qty:1}]);
});
test('world has eighty-one tiles, distinct environment layers, finite water and deposits',()=>{
 const world=createMvpWorld('owner-a',START),tiles=Object.values(world.tiles);
 assert.equal(tiles.length,81);assert.equal(new Set(tiles.map(t=>t.biome)).size,5);assert.equal(new Set(tiles.map(t=>t.terrain)).size,6);
 assert.equal(world.social.rewards.endsAt,START+28*86400000);
 for(const t of tiles)for(const d of t.deposits){assert.equal(d.layers.reduce((n,l)=>n+l.budget,0),850);assert.deepEqual(d.layers.map(l=>l.unlocked),[true,false,false]);}
 for(const region of Object.values(world.regions)){const water=tiles.filter(t=>t.regionId===region.id).flatMap(t=>t.deposits).filter(d=>d.itemId==='water').flatMap(d=>d.layers).reduce((n,l)=>n+l.remaining,0);assert.equal(water+region.waterUnassigned,region.waterBudget);assert.equal(region.farmBudget,100);}
 assert.equal(new Set([0,1,2,3].map(n=>weatherFor('r_1_1',START+n*WEATHER_WINDOW).state)).size,4);
});
test('new stations receive bound tutorial lots and a permanent recovery tool',()=>{
 const {world,id}=setup(),p=world.players[id];assert(p.inventory.length>10);assert(p.inventory.every(l=>l.bound));assert.equal(p.basicTool,true);assert.equal(p.position,HOME_TILE);
 assert.throws(()=>consume(p,'timber',1,START,{tradeableOnly:true}),MvpError);
});
test('surveys complete asynchronously with a time-only Cartographer benefit',()=>{
 let {world,id}=setup();const budget=JSON.stringify(world.tiles);world=run(world,id,{type:'world.survey',tileId:'t_4_3'});const job=Object.values(world.jobs)[0];assert.equal(job.endsAt-job.startsAt,11000);assert(!world.players[id].surveyed.includes('t_4_3'));
 complete(world);assert(world.players[id].surveyed.includes('t_4_3'));assert.equal(JSON.stringify(world.tiles),budget);assert.equal(job.report.length,2);
});
test('extract reservation consumes no stock until completion, resolves once and cannot overdraw',()=>{
 let {world,id}=setup();const t=woodTile(world);position(world,id,t.id);const layer=world.tiles[t.id].deposits.find(d=>d.itemId==='timber')!.layers[0];layer.remaining=2;
 const before=available(world.players[id],'timber',START);world=run(world,id,{type:'mining.reserve',tileId:t.id,itemId:'timber',qty:2});let actual=world.tiles[t.id].deposits.find(d=>d.itemId==='timber')!.layers[0];assert.equal(actual.remaining,2);assert.equal(actual.reserved,2);
 assert.throws(()=>run(world,id,{type:'mining.reserve',tileId:t.id,itemId:'timber',qty:1}),MvpError);
 complete(world);actual=world.tiles[t.id].deposits.find(d=>d.itemId==='timber')!.layers[0];assert.equal(actual.remaining,0);assert.equal(actual.reserved,0);assert.equal(actual.extracted,2);assert.equal(available(world.players[id],'timber',START),before+2);
 const settled=JSON.stringify(world);settleProduction(world,START+100000);assert.equal(JSON.stringify(world),settled);
});
test('deep opening preserves total creation budget, requires exhaustion and an unbound module',()=>{
 let {world,id}=setup();const t=woodTile(world);position(world,id,t.id);const p=world.players[id];grant(p,'drill_module_i',1,true);
 assert.throws(()=>run(world,id,{type:'deposit.unlock',tileId:t.id,itemId:'timber',layer:1}),/Agota/);
 const layer=world.tiles[t.id].deposits.find(d=>d.itemId==='timber')!.layers[0];layer.remaining=0;layer.extracted=layer.budget;
 assert.throws(()=>run(world,id,{type:'deposit.unlock',tileId:t.id,itemId:'timber',layer:1}),/transferibles/);grant(p,'drill_module_i',1);
 const total=world.tiles[t.id].deposits.find(d=>d.itemId==='timber')!.layers.reduce((n,l)=>n+l.budget,0);
 world=run(world,id,{type:'deposit.unlock',tileId:t.id,itemId:'timber',layer:1});const deep=world.tiles[t.id].deposits.find(d=>d.itemId==='timber')!.layers;
 assert.equal(deep.reduce((n,l)=>n+l.budget,0),total);assert.equal(deep[1].remaining,250);assert.equal(deep[1].promoterQuota,62);assert.equal(deep[1].promoterExpiresAt,START+86400000);
});
test('mixing tutorial and natural inputs always creates a bound product',()=>{
 let {world,id}=setup();grant(world.players[id],'iron_ore',3);const before=available(world.players[id],'iron_ore',START);
 world=run(world,id,{type:'craft.start',recipeId:'iron_ingot',qty:1});assert.equal(available(world.players[id],'iron_ore',START),before-3);assert.equal(available(world.players[id],'iron_ingot',START),0);
 complete(world);const iron_ingot=world.players[id].inventory.find(l=>l.itemId==='iron_ingot')!;assert(iron_ingot.bound);assert.deepEqual(iron_ingot.provenance.inputs,[{itemId:'iron_ore',qty:3}]);
 assert.throws(()=>consume(world.players[id],'iron_ingot',1,START,{tradeableOnly:true}),MvpError);
});
test('building queues are bounded; queued cancellation refunds once and running work does not',()=>{
 let {world,id}=setup();grant(world.players[id],'iron_ore',30);for(let i=0;i<3;i++)world=run(world,id,{type:'craft.start',recipeId:'iron_ingot',qty:1});
 assert.throws(()=>run(world,id,{type:'craft.start',recipeId:'iron_ingot',qty:1}),/cola/);
 const queued=Object.values(world.jobs).find(j=>j.status==='reserved')!,before=available(world.players[id],'iron_ore',START);
 world=run(world,id,{type:'craft.cancel',jobId:queued.id});assert.equal(available(world.players[id],'iron_ore',START),before+3);assert.throws(()=>run(world,id,{type:'craft.cancel',jobId:queued.id}),/terminó/);
 const running=Object.values(world.jobs).find(j=>j.status==='running')!,remaining=available(world.players[id],'iron_ore',START);world=run(world,id,{type:'craft.cancel',jobId:running.id});assert.equal(available(world.players[id],'iron_ore',START),remaining);
});
test('recycling partial and transferred lots never exceeds sixty percent of actual input',()=>{
 let {world,id}=setup();const p=world.players[id];p.inventory=[];
 const lot=give(p,'bread',2,START,'recipe:test',[{itemId:'grain',qty:1.5},{itemId:'water',qty:0.5}],true);
 world=run(world,id,{type:'craft.recycle',lotId:lot.id,qty:1});world=run(world,id,{type:'craft.recycle',lotId:lot.id,qty:1});assert(available(world.players[id],'grain',START)<=Math.floor(3*.6));assert.equal(available(world.players[id],'water',START),0);
 const tool=give(world.players[id],'pickaxe',1,START,'recipe:test',[{itemId:'iron_ore',qty:5}],true);world=run(world,id,{type:'craft.recycle',lotId:tool.id,qty:1});assert.equal(available(world.players[id],'iron_ore',START),3);assert(world.players[id].inventory.filter(l=>l.itemId==='iron_ore').every(l=>l.bound));
 assert.throws(()=>run(world,id,{type:'craft.recycle',lotId:tool.id,qty:1}),/existe/);
});
test('farming consumes exact inputs and stops at both plot and regional limits',()=>{
 let {world,id}=setup();for(const itemId of ['seed','water','nutrient'] as ItemId[])grant(world.players[id],itemId,40);
 const regionId=world.tiles[HOME_TILE].regionId,initial=world.regions[regionId].farmRemaining;
 for(let i=0;i<10;i++){world=run(world,id,{type:'farm.start'});complete(world);}
 assert.equal(world.players[id].farmCycles,10);assert.equal(world.players[id].stats.farms,10);assert.equal(world.regions[regionId].farmRemaining,initial-10);assert.throws(()=>run(world,id,{type:'farm.start'}),/diez/);
 world.players[id].farmCycles=0;world.regions[regionId].farmRemaining=0;assert.throws(()=>run(world,id,{type:'farm.start'}),/regional/);
});
test('food expiry starts at logical completion, so offline return cannot extend shelf life',()=>{
 let {world,id}=setup();world=run(world,id,{type:'craft.start',recipeId:'ration',qty:1});const job=Object.values(world.jobs)[0];settleProduction(world,job.endsAt+73*3600000);assert.equal(available(world.players[id],'ration',job.endsAt+73*3600000),0);assert.equal(job.status,'completed');
});
test('rain redistributes a finite regional water budget once per six-hour window',()=>{
 let {world,id}=setup();const region=world.regions[world.tiles[HOME_TILE].regionId];let rain=START;while(weatherFor(region.id,rain).state!=='rain')rain+=WEATHER_WINDOW;
 const before=region.waterBudget,unassigned=region.waterUnassigned;world=run(world,id,{type:'world.collect-rain'},rain);assert.equal(world.regions[region.id].waterBudget,before);assert.equal(world.regions[region.id].waterUnassigned,unassigned-20);assert.throws(()=>run(world,id,{type:'world.collect-rain'},rain),/ventana/);
 const stock=Object.values(world.tiles).filter(t=>t.regionId===region.id).flatMap(t=>t.deposits).filter(d=>d.itemId==='water').flatMap(d=>d.layers).reduce((n,l)=>n+l.remaining,0);assert.equal(stock+world.regions[region.id].waterUnassigned,before);
});
test('a confirmed order preserves weather and duration across a changing forecast',()=>{
 let {world,id}=setup();world=run(world,id,{type:'world.travel',tileId:'t_4_3'});const job=Object.values(world.jobs)[0],snapshot=structuredClone(job.weather),duration=job.endsAt-job.startsAt;
 settleProduction(world,START+WEATHER_WINDOW*2);assert.deepEqual(job.weather,snapshot);assert.equal(job.endsAt-job.startsAt,duration);assert.equal(world.players[id].position,'t_4_3');assert.equal(world.players[id].basicTool,true);
});
test('rare expedition candidates use finite regional stock and fall back to a clue',()=>{
 let {world,id}=setup();position(world,id,HOME_TILE);world=run(world,id,{type:'expedition.start',tileId:HOME_TILE});const job=Object.values(world.jobs)[0],region=world.regions[world.tiles[HOME_TILE].regionId];job.payload.roll=9050;
 for(const rare of ['memory_core','ancient_map','artifact_frame','season_relic'] as ItemId[])region.expeditionRemaining[rare]=0;
 complete(world);assert(world.players[id].milestones.includes('blueprint-clue'));assert.equal(world.players[id].inventory.filter(l=>['memory_core','ancient_map','artifact_frame','season_relic'].includes(l.itemId)).length,0);assert(job.report[0].includes('pista'));
});
test('NPC battles have three deterministic rounds and consume existing finite loot',()=>{
 let {world,id}=setup();const t=woodTile(world);position(world,id,t.id);for(const d of world.tiles[t.id].deposits)for(const l of d.layers){l.remaining=0;l.unlocked=false;}const layer=world.tiles[t.id].deposits[0].layers[0];layer.remaining=1;layer.unlocked=true;
 grant(world.players[id],'guard_armor',2);grant(world.players[id],'spear',2);grant(world.players[id],'ration',20);
 world=run(world,id,{type:'army.prepare',unitType:'guard',qty:2});const unitIds=world.players[id].units.map(u=>u.id);
 world=run(world,id,{type:'battle.start',tileId:t.id,unitIds});complete(world);const battle=Object.values(world.battles)[0];assert.equal(battle.rounds.length,3);assert.equal(battle.loot.reduce((n,l)=>n+l.qty,0),1);assert.equal(world.tiles[t.id].deposits[0].layers[0].remaining,0);
 const settled=JSON.stringify(world);settleProduction(world,START+3600000);assert.equal(JSON.stringify(world),settled);
});
test('unit cap, declared supplies and invalid cargo are checked before commitment',()=>{
 let {world,id}=setup();grant(world.players[id],'cloth',30);grant(world.players[id],'ration',50);
 world=run(world,id,{type:'army.prepare',unitType:'scout',qty:6});world=run(world,id,{type:'army.prepare',unitType:'scout',qty:6});assert.equal(world.players[id].units.length,12);assert.throws(()=>run(world,id,{type:'army.prepare',unitType:'scout',qty:1}),/doce/);
 const before=JSON.stringify(world);assert.throws(()=>run(world,id,{type:'convoy.start',tileId:'t_4_3',cargo:[null],unitIds:[world.players[id].units[0].id]}),MvpError);assert.equal(JSON.stringify(world),before);
});
test('lot splitting preserves expiry, binding, quality and real production provenance',()=>{
 const {world,id}=setup(),p=world.players[id],lot=grant(p,'ration',3);lot.quality=2;lot.provenance.inputs=[{itemId:'grain',qty:2},{itemId:'water',qty:1}];
 const reserved=consume(p,'ration',2,START,{tradeableOnly:true});assert.equal(reserved[0].expiresAt,lot.expiresAt);assert.equal(reserved[0].quality,2);assert.notEqual(reserved[0].id,lot.id);addLots(p,reserved);const returned=p.inventory.filter(l=>l.provenance.source==='test-budget');assert.equal(returned.reduce((n,l)=>n+l.qty,0),3);assert(returned.every(l=>l.quality===2&&l.expiresAt===lot.expiresAt));assert.deepEqual(returned[1].provenance.inputs,lot.provenance.inputs);
});

test('crafted equipment batches produce individually identified durable units',()=>{
 let {world,id}=setup();for(const input of RECIPE_CATALOG.pickaxe!.inputs)grant(world.players[id],input.itemId,input.qty*2);world=run(world,id,{type:'craft.start',recipeId:'pickaxe',qty:2});complete(world);
 const tools=world.players[id].inventory.filter(l=>l.itemId==='pickaxe');assert.equal(tools.length,2);assert(tools.every(l=>l.qty===1&&l.wear===20));assert.equal(new Set(tools.map(l=>l.id)).size,2);
});
test('legacy stacked tools acquire unique identities when one is reserved and worn',()=>{
 let {world,id}=setup();const t=woodTile(world);position(world,id,t.id);const old=grant(world.players[id],'pickaxe',1);old.qty=2;
 world=run(world,id,{type:'mining.reserve',tileId:t.id,itemId:'timber',qty:3});complete(world);const tools=world.players[id].inventory.filter(l=>l.itemId==='pickaxe');assert.equal(tools.length,2);assert.equal(new Set(tools.map(l=>l.id)).size,2);assert.deepEqual(tools.map(l=>l.wear).sort(),[19,20]);
});
test('one repair kit restores exactly one unit from a legacy equipment stack',()=>{
 let {world,id}=setup();const old=grant(world.players[id],'pickaxe',1);old.qty=2;old.wear=2;grant(world.players[id],'repair_kit',1);
 world=run(world,id,{type:'tool.repair',lotId:old.id});const tools=world.players[id].inventory.filter(l=>l.itemId==='pickaxe');assert.equal(tools.reduce((n,l)=>n+l.qty,0),2);assert.deepEqual(tools.map(l=>l.wear).sort((a,b)=>a-b),[2,20]);assert.equal(new Set(tools.map(l=>l.id)).size,2);assert.equal(available(world.players[id],'repair_kit',START),0);
});
test('scanner reserves a unit, improves survey and returns it with one wear charge',()=>{
 let {world,id}=setup();grant(world.players[id],'scanner',1);world=run(world,id,{type:'world.survey',tileId:'t_4_3'});const job=Object.values(world.jobs)[0];assert.equal(job.endsAt-job.startsAt,10000);assert.equal(available(world.players[id],'scanner',START),0);complete(world);assert.equal(world.players[id].inventory.find(l=>l.itemId==='scanner')?.wear,19);assert(job.report[1].includes('indicios de'));assert.deepEqual(job.payload.equipment,[]);
});
test('weather cloak mitigates an adverse route without changing its forecast',()=>{
 const base=setup();let at=START;const regionId=base.world.tiles[HOME_TILE].regionId;while(weatherFor(regionId,at).state!=='storm')at+=WEATHER_WINDOW;
 const normal=run(base.world,base.id,{type:'world.travel',tileId:'t_4_3'},at),equipped=structuredClone(base.world);grant(equipped.players[base.id],'weather_cloak',1);const protectedWorld=run(equipped,base.id,{type:'world.travel',tileId:'t_4_3'},at);
 const ordinaryJob=Object.values(normal.jobs)[0],protectedJob=Object.values(protectedWorld.jobs)[0];assert(protectedJob.endsAt-protectedJob.startsAt<ordinaryJob.endsAt-ordinaryJob.startsAt);assert.deepEqual(protectedJob.weather,ordinaryJob.weather);complete(protectedWorld);assert.equal(protectedWorld.players[base.id].inventory.find(l=>l.itemId==='weather_cloak')?.wear,19);
});
test('camp support consumes an actual kit, reduces time and water, and preserves loot odds',()=>{
 let {world,id}=setup();position(world,id,HOME_TILE);grant(world.players[id],'camp_kit',1);const water=available(world.players[id],'water',START);world=run(world,id,{type:'expedition.start',tileId:HOME_TILE});const job=Object.values(world.jobs)[0];assert.equal(job.endsAt-job.startsAt,24000);assert.equal(available(world.players[id],'water',START),water-1);assert.equal(available(world.players[id],'camp_kit',START),0);assert.equal(job.payload.probabilities,'65% común · 20% datos · 5% plano · 1% raro · 9% sin objeto');
});
test('a cart provides bounded real cargo capacity and wears once per completed convoy',()=>{
 let {world,id}=setup();grant(world.players[id],'cloth',1);grant(world.players[id],'ration',20);grant(world.players[id],'timber',30);grant(world.players[id],'stone',30);world=run(world,id,{type:'army.prepare',unitType:'scout',qty:1});const unitIds=world.players[id].units.map(u=>u.id),order={type:'convoy.start',tileId:'t_4_3',cargo:[{itemId:'timber',qty:20},{itemId:'stone',qty:20}],unitIds};assert.throws(()=>run(world,id,order),/Capacidad/);grant(world.players[id],'cart',1);world=run(world,id,order);complete(world);assert.equal(world.players[id].inventory.find(l=>l.itemId==='cart')?.wear,19);assert.equal(Object.values(world.convoys)[0].status,'arrived');
});
test('exposed convoys select actual transferable lots while tutorial supplies remain protected',()=>{
 let {world,id}=setup(true);world.players[id].milestones.push('npc-training');grant(world.players[id],'ration',8);grant(world.players[id],'cloth',1);grant(world.players[id],'timber',10);world=run(world,id,{type:'army.prepare',unitType:'scout',qty:1});world=run(world,id,{type:'pvp.toggle',enabled:true});world=run(world,id,{type:'convoy.start',tileId:'t_4_3',cargo:[{itemId:'timber',qty:10}],unitIds:world.players[id].units.map(u=>u.id),exposed:true});
 const cargo=Object.values(world.convoys)[0].cargo;assert(cargo.every(l=>!l.bound));assert.equal(cargo.reduce((n,l)=>n+l.qty,0),10);assert.equal(world.players[id].inventory.filter(l=>l.itemId==='timber'&&l.bound).reduce((n,l)=>n+l.qty,0),12);
});
test('voluntary PvP transfers at most twenty percent of real cargo and imposes a day of rest',()=>{
 let {world,id}=setup(true);world=run(world,null,{type:'player.create',name:'Orion',stationName:'Horizonte',faction:'forgers'},START,'owner-b');const other=Object.values(world.players).find(p=>p.id!==id)!.id;
 for(const pId of [id,other]){world.players[pId].createdAt=START-73*3600000;world.players[pId].milestones.push('npc-training');world.players[pId].inventory=[];grant(world.players[pId],'ration',30);grant(world.players[pId],'water',30);}
 grant(world.players[id],'guard_armor',2);grant(world.players[id],'spear',2);grant(world.players[other],'cloth',1);grant(world.players[other],'timber',10);
 world=run(world,id,{type:'army.prepare',unitType:'guard',qty:2});world=run(world,other,{type:'army.prepare',unitType:'scout',qty:1},START,'owner-b');
 world=run(world,id,{type:'pvp.toggle',enabled:true});world=run(world,other,{type:'pvp.toggle',enabled:true},START,'owner-b');
 world=run(world,other,{type:'convoy.start',tileId:'t_4_3',cargo:[{itemId:'timber',qty:10}],unitIds:world.players[other].units.map(u=>u.id),exposed:true},START,'owner-b');const convoy=Object.values(world.convoys)[0],attackers=world.players[id].units.map(u=>u.id);
 const withoutAttackerConsent=structuredClone(world);withoutAttackerConsent.players[id].pvpEnabled=false;assert.throws(()=>run(withoutAttackerConsent,id,{type:'battle.raid',convoyId:convoy.id,unitIds:attackers,pvpEnabled:true,enabled:true}),/consentimiento/);
 const withoutDefenderConsent=structuredClone(world);withoutDefenderConsent.players[other].pvpEnabled=false;assert.throws(()=>run(withoutDefenderConsent,id,{type:'battle.raid',convoyId:convoy.id,unitIds:attackers}),/consentimiento/);
 const missingTraining=structuredClone(world);missingTraining.players[id].milestones=[];assert.throws(()=>run(missingTraining,id,{type:'battle.raid',convoyId:convoy.id,unitIds:attackers}),/entrenamiento contra NPC/);
 const totalBefore=available(world.players[id],'timber',START)+convoy.cargo.reduce((n,l)=>n+l.qty,0);world=run(world,id,{type:'battle.raid',convoyId:convoy.id,unitIds:attackers});const battle=Object.values(world.battles)[0],battleJob=world.jobs[battle.jobId];settleProduction(world,battleJob.endsAt);
 const resolved=world.battles[battle.id],remaining=world.convoys[convoy.id].cargo.reduce((n,l)=>n+l.qty,0);assert.equal(resolved.rounds.length,3);assert.equal(resolved.loot.reduce((n,l)=>n+l.qty,0),2);assert.equal(remaining,8);assert.equal(available(world.players[id],'timber',battleJob.endsAt)+remaining,totalBefore);assert.equal(world.players[id].pvpCooldownUntil,battleJob.endsAt+86400000);assert.equal(world.players[other].pvpCooldownUntil,battleJob.endsAt+86400000);
 complete(world);const after=Object.values(world.players).reduce((n,p)=>n+available(p,'timber',START),0);assert.equal(after,totalBefore);
 world=run(world,other,{type:'convoy.start',tileId:HOME_TILE,cargo:[{itemId:'timber',qty:5}],unitIds:world.players[other].units.map(u=>u.id),exposed:true},battleJob.endsAt+40000,'owner-b');const next=Object.values(world.convoys).find(c=>c.status==='traveling')!;assert.throws(()=>run(world,id,{type:'battle.raid',convoyId:next.id,unitIds:attackers},battleJob.endsAt+40000),/descanso/);
});

test('PvP unlocks only after a real NPC encounter completes, while consent remains optional',()=>{
 let {world,id}=setup(true);assert.throws(()=>run(world,id,{type:'pvp.toggle',enabled:true}),/Completa un encuentro de entrenamiento contra NPC/);world=run(world,id,{type:'pvp.toggle',enabled:false});assert.equal(world.players[id].pvpEnabled,false);
 grant(world.players[id],'cloth',1);grant(world.players[id],'ration',6);world=run(world,id,{type:'army.prepare',unitType:'scout',qty:1});world=run(world,id,{type:'battle.start',tileId:HOME_TILE,unitIds:world.players[id].units.map(u=>u.id)});const battle=Object.values(world.battles)[0],job=world.jobs[battle.jobId];assert(!world.players[id].milestones.includes('npc-training'));assert.throws(()=>run(world,id,{type:'pvp.toggle',enabled:true},job.endsAt-1),/entrenamiento contra NPC/);
 settleProduction(world,job.endsAt);assert.equal(world.battles[battle.id].status,'resolved');assert(world.players[id].milestones.includes('npc-training'));world=run(world,id,{type:'pvp.toggle',enabled:true},job.endsAt);assert.equal(world.players[id].pvpEnabled,true);world=run(world,id,{type:'pvp.toggle',enabled:false},job.endsAt);assert.equal(world.players[id].pvpEnabled,false);
});

