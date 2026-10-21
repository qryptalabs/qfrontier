import assert from 'node:assert/strict';
import test from 'node:test';
import { available, give, MvpError } from '../lib/mvp/helpers.ts';
import { areAllied, dispatchSocial, getSocialView, settleSocial } from '../lib/mvp/social.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';
import type { ItemId, MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-14T12:00:00Z');
const HOUR=3_600_000;
const DAY=24*HOUR;
let sequence=0;
function fixture(count=3) {
  const world=createMvpWorld('owner0',NOW),ids:string[]=[];
  for(let index=0;index<count;index++){
    const player=createPlayer(world,{ownerId:`owner${index}`,requestId:`fixture_${index}`,now:NOW,actor:null},{type:'player.create',name:`Player ${index}`,stationName:`Station ${index}`,faction:['cartographers','forgers','custodians'][index%3]});
    ids.push(player.id);
  }
  settleSocial(world,NOW);return {world,ids};
}
/** The engine clones before a command; failed validation never commits changes. */
function step(world:MvpWorld,playerId:string,command:MvpCommand,now=NOW):void {
  const next=structuredClone(world),player=next.players[playerId];
  settleSocial(next,now);
  assert.equal(dispatchSocial(next,{...command,playerId},{ownerId:player.ownerId,requestId:`social_test_${++sequence}`,now,actor:player}),true);
  settleSocial(next,now);Object.assign(world,next);
}
function stock(world:MvpWorld,playerId:string,itemId:ItemId,qty:number,quality=1,expiresAt?:number) {
  const lot=give(world.players[playerId],itemId,qty,NOW,'craft',[],false);
  lot.quality=quality;if(expiresAt!==undefined)lot.expiresAt=expiresAt;return lot;
}
function qty(world:MvpWorld,playerId:string,itemId:ItemId,now=NOW) {return available(world.players[playerId],itemId,now,true);}
function wallet(world:MvpWorld,playerId:string) {return world.social.accounts[playerId];}
function earn(world:MvpWorld,playerId:string,amount=10) {stock(world,playerId,'timber',amount);step(world,playerId,{type:'npc.sell',itemId:'timber',qty:amount});}
function rejected(world:MvpWorld,playerId:string,command:MvpCommand,pattern?:RegExp) {
  const before=structuredClone(world);
  assert.throws(()=>step(world,playerId,command),pattern??MvpError);assert.deepEqual(world,before);
}
function reconcile(world:MvpWorld) {
  const view=getSocialView(world,world.players[Object.keys(world.players)[0]],'owner0');
  assert.equal(view.admin?.creditDiscrepancy,0);assert.equal(view.admin?.simulationDiscrepancy,0);
}

test('tutorial materials and credits cannot enter transfers, NPC sales, clans or simulated financing',()=>{
  const {world,ids:[first,second]}=fixture();
  rejected(world,first,{type:'market.publish',mode:'barter',itemId:'timber',qty:1,wantItemId:'stone',wantQty:1},/transferibles/);
  rejected(world,first,{type:'npc.sell',itemId:'timber',qty:1},/transferibles/);
  step(world,first,{type:'clan.create',name:'Bound guards'});
  rejected(world,first,{type:'clan.deposit',itemId:'timber',qty:1},/transferibles/);
  rejected(world,first,{type:'clan.deposit',currency:'credits',amount:1},/vinculado/);
  rejected(world,first,{type:'funding.open',itemId:'ration',qty:1,unitsPerCoupon:1,pricePerCoupon:5,deadlineHours:1,deliveryHours:1},/transferibles/);
  stock(world,first,'stone',1);step(world,first,{type:'market.publish',mode:'credits',itemId:'stone',qty:1,price:5});
  rejected(world,second,{type:'market.fill',offerId:world.social.offers[0].id},/vinculado/);
  assert.equal(wallet(world,second).boundCredits,50);reconcile(world);
});

test('credit sale reserves lots, charges the reference floor 2% fee, transfers once and never uses SIM units',()=>{
  const {world,ids:[first,second]}=fixture();earn(world,second,50);stock(world,first,'iron_ingot',3);
  step(world,first,{type:'market.publish',mode:'credits',itemId:'iron_ingot',qty:3,price:51});
  const offerId=world.social.offers[0].id;
  assert.equal(qty(world,first,'iron_ingot'),0);assert.equal(world.social.offers[0].fee,1);
  rejected(world,second,{type:'market.fill',offerId,currency:'SIM_QRYP'},/créditos/);
  const simBefore=wallet(world,second).simUnits;
  step(world,second,{type:'market.fill',offerId});
  assert.equal(qty(world,second,'iron_ingot'),3);assert.equal(wallet(world,first).credits,50);
  assert.equal(wallet(world,second).credits,49);assert.equal(world.social.creditFees,1);
  assert.equal(wallet(world,second).simUnits,simBefore);
  rejected(world,second,{type:'market.fill',offerId},/disponible/);reconcile(world);
});

test('barter cancellation and expiration return the exact reserved stock once',()=>{
  const {world,ids:[first]}=fixture();stock(world,first,'iron_ingot',7);
  step(world,first,{type:'market.publish',mode:'barter',itemId:'iron_ingot',qty:3,wantItemId:'stone',wantQty:2});
  const offerId=world.social.offers[0].id;assert.equal(qty(world,first,'iron_ingot'),4);
  step(world,first,{type:'market.cancel',offerId});assert.equal(qty(world,first,'iron_ingot'),7);
  rejected(world,first,{type:'market.cancel',offerId},/cerró/);
  step(world,first,{type:'market.publish',mode:'barter',itemId:'iron_ingot',qty:3,wantItemId:'stone',wantQty:2});
  settleSocial(world,NOW+8*DAY);settleSocial(world,NOW+8*DAY);
  assert.equal(qty(world,first,'iron_ingot',NOW+8*DAY),7);
});

test('finite NPC demand and budget cannot be overdrawn by successive sales',()=>{
  const {world,ids:[first]}=fixture();stock(world,first,'timber',151);
  step(world,first,{type:'npc.sell',itemId:'timber',qty:100});step(world,first,{type:'npc.sell',itemId:'timber',qty:50});
  rejected(world,first,{type:'npc.sell',itemId:'timber',qty:1},/demanda/);
  assert.equal(wallet(world,first).credits,300);assert.equal(world.social.npc.remaining,9700);reconcile(world);
});

test('delivery verifies quality, destination and reserved credits; repeated delivery cannot pay twice',()=>{
  const {world,ids:[requester,carrier]}=fixture();earn(world,requester,20);stock(world,carrier,'iron_ingot',2,1);
  step(world,requester,{type:'contract.publish',kind:'delivery',itemId:'iron_ingot',qty:2,quality:2,destination:'t_3_4',price:20,deadlineHours:24});
  const contractId=world.social.contracts[0].id;
  assert.equal(wallet(world,requester).credits,40);step(world,carrier,{type:'contract.accept',contractId});assert.equal(wallet(world,requester).credits,20);
  rejected(world,carrier,{type:'contract.deliver',contractId},/destino/);
  world.players[carrier].position='t_3_4';rejected(world,carrier,{type:'contract.deliver',contractId},/calidad/);
  stock(world,carrier,'iron_ingot',2,2);step(world,carrier,{type:'contract.deliver',contractId});
  assert.equal(qty(world,requester,'iron_ingot'),2);assert.equal(qty(world,carrier,'iron_ingot'),2);
  assert.equal(wallet(world,carrier).credits,20);assert.equal(world.social.contracts[0].escrow,0);
  rejected(world,carrier,{type:'contract.deliver',contractId},/cerrado/);reconcile(world);
});

test('transport reserves existing cargo and refunds money and cargo after its finite deadline',()=>{
  const {world,ids:[requester,carrier]}=fixture();earn(world,requester,10);stock(world,requester,'iron_ingot',3);
  step(world,requester,{type:'contract.publish',kind:'transport',itemId:'iron_ingot',qty:3,destination:'t_3_4',price:10,deadlineHours:1});
  const contractId=world.social.contracts[0].id;step(world,carrier,{type:'contract.accept',contractId});
  assert.equal(qty(world,requester,'iron_ingot'),0);assert.equal(qty(world,carrier,'iron_ingot'),0);
  settleSocial(world,NOW+2*HOUR);settleSocial(world,NOW+2*HOUR);
  assert.equal(qty(world,requester,'iron_ingot'),3);assert.equal(wallet(world,requester).credits,20);
  assert.equal(wallet(world,carrier).credits,0);assert.equal(world.social.contracts[0].status,'expired');reconcile(world);
});

test('mixed clans enforce independent treasury permissions and two distinct owner approvals',()=>{
  const {world,ids:[founder,coordinator,member]}=fixture();earn(world,founder,100);
  step(world,founder,{type:'clan.create',name:'Mixed frontier'});const clanId=world.social.clans[0].id;
  step(world,coordinator,{type:'clan.join',clanId});step(world,member,{type:'clan.join',clanId});
  step(world,founder,{type:'clan.role',targetId:coordinator,role:'coordinator'});
  step(world,founder,{type:'clan.deposit',currency:'credits',amount:150});
  rejected(world,member,{type:'clan.withdraw',currency:'credits',amount:1},/rol/);
  step(world,founder,{type:'clan.withdraw',currency:'credits',amount:100});
  const proposalId=world.social.clans[0].withdrawals[0].id;
  assert.equal(wallet(world,founder).credits,50);assert.equal(world.social.clans[0].credits,50);
  rejected(world,founder,{type:'clan.approve',proposalId},/otra cuenta/);
  step(world,coordinator,{type:'clan.approve',proposalId});assert.equal(wallet(world,founder).credits,150);
  rejected(world,coordinator,{type:'clan.approve',proposalId},/disponible/);reconcile(world);
});

test('a second profile of the same owner cannot satisfy dual approval',()=>{
  const {world,ids:[founder]}=fixture(1);
  const second=createPlayer(world,{ownerId:'owner0',requestId:'same_owner_second',now:NOW,actor:null},{type:'player.create',name:'Alt profile',stationName:'Second station',faction:'custodians'}).id;
  settleSocial(world,NOW);earn(world,founder,60);step(world,founder,{type:'clan.create',name:'Identity guards'});const clanId=world.social.clans[0].id;
  step(world,second,{type:'clan.join',clanId});step(world,founder,{type:'clan.role',targetId:second,role:'coordinator'});
  step(world,founder,{type:'clan.deposit',currency:'credits',amount:120});step(world,founder,{type:'clan.withdraw',currency:'credits',amount:100});
  rejected(world,second,{type:'clan.approve',proposalId:world.social.clans[0].withdrawals[0].id},/otra cuenta/);reconcile(world);
});

test('material withdrawals reserve exact quantities and expire without duplication',()=>{
  const {world,ids:[founder,keeper]}=fixture();stock(world,founder,'timber',40);
  step(world,founder,{type:'clan.create',name:'Material treasury'});const clanId=world.social.clans[0].id;
  step(world,keeper,{type:'clan.join',clanId});step(world,founder,{type:'clan.role',targetId:keeper,role:'storekeeper'});
  step(world,founder,{type:'clan.deposit',itemId:'timber',qty:40});step(world,founder,{type:'clan.withdraw',itemId:'timber',qty:20});
  assert.equal(world.social.clans[0].lots.reduce((sum,l)=>sum+l.qty,0),20);
  settleSocial(world,NOW+2*DAY);settleSocial(world,NOW+2*DAY);
  assert.equal(world.social.clans[0].lots.reduce((sum,l)=>sum+l.qty,0),40);assert.equal(qty(world,founder,'timber'),0);reconcile(world);
});

test('cancelled collective work refunds reserved inputs, while completed bridge changes the world once',()=>{
  const {world,ids:[founder]}=fixture();stock(world,founder,'plank',4);stock(world,founder,'iron_ingot',2);stock(world,founder,'stone',2);
  step(world,founder,{type:'clan.create',name:'Bridge builders'});const tileId=Object.values(world.tiles).find(t=>t.terrain==='water')!.id;
  step(world,founder,{type:'clan.project.open',tileId});let projectId=world.social.projects[0].id;
  step(world,founder,{type:'clan.project.contribute',projectId,itemId:'plank',qty:4});
  step(world,founder,{type:'clan.project.cancel',projectId});assert.equal(qty(world,founder,'plank'),4);assert.equal(world.tiles[tileId].bridge,false);
  step(world,founder,{type:'clan.project.open',tileId});projectId=world.social.projects[1].id;
  for(const [itemId,amount] of [['plank',4],['iron_ingot',2],['stone',2]] as [ItemId,number][])step(world,founder,{type:'clan.project.contribute',projectId,itemId,qty:amount});
  step(world,founder,{type:'clan.project.complete',projectId});assert.equal(world.tiles[tileId].bridge,true);assert.equal(qty(world,founder,'plank'),0);
  rejected(world,founder,{type:'clan.project.complete',projectId},/disponible/);
});

test('alliances require every clan representative and forbid a fourth clan',()=>{
  const {world,ids}=fixture(4);
  ids.forEach((id,index)=>step(world,id,{type:'clan.create',name:`Clan ${index}`}));
  const clanIds=world.social.clans.map(c=>c.id);
  rejected(world,ids[0],{type:'alliance.propose',name:'Too large',clanIds},/tres clanes/);
  step(world,ids[0],{type:'alliance.propose',name:'Three-way pact',clanIds:clanIds.slice(0,3)});
  const allianceId=world.social.alliances[0].id;
  assert.equal(areAllied(world,ids[0],ids[1]),false);
  step(world,ids[1],{type:'alliance.accept',allianceId});assert.equal(areAllied(world,ids[0],ids[1]),false);
  step(world,ids[2],{type:'alliance.accept',allianceId});assert.equal(areAllied(world,ids[0],ids[1]),true);
  step(world,ids[2],{type:'alliance.leave',allianceId});assert.equal(areAllied(world,ids[0],ids[2]),false);
});

test('referrals have one immutable parent, reject self and cycles, and require first-week milestones',()=>{
  const {world,ids:[parent,child,third]}=fixture();
  rejected(world,child,{type:'referral.bind',parentId:child},/autorreferidos/);
  step(world,child,{type:'referral.bind',parentId:parent});
  rejected(world,child,{type:'referral.bind',parentId:third},/inmutable/);
  rejected(world,parent,{type:'referral.bind',parentId:child},/ciclo/);
  rejected(world,parent,{type:'referral.validate',targetId:child},/Falta tutorial/);
  const target=world.players[child];target.stats.crafted=1;target.stats.explored=1;target.stats.gathered=1;
  target.visitedRegions.push('r_0_1');target.activityDays=['2026-10-14','2026-10-15','2026-10-16'];
  step(world,parent,{type:'referral.validate',targetId:child},NOW+3*DAY);
  assert.equal(world.social.referrals[0].status,'valid');
  rejected(world,parent,{type:'referral.validate',targetId:child},/disponible/);
});

test('mentorship caps active apprentices and releases a slot explicitly',()=>{
  const {world,ids}=fixture(5);
  for(const apprentice of ids.slice(1,4))step(world,ids[0],{type:'mentor.assign',targetId:apprentice});
  rejected(world,ids[0],{type:'mentor.assign',targetId:ids[4]},/tres aprendices/);
  step(world,ids[0],{type:'mentor.release',targetId:ids[1]});step(world,ids[0],{type:'mentor.assign',targetId:ids[4]});
  assert.equal(Object.values(world.social.mentors).filter(id=>id===ids[0]).length,3);
});

test('clan membership stops at twenty and cannot be duplicated across clans',()=>{
  const {world,ids}=fixture(22);step(world,ids[0],{type:'clan.create',name:'Twenty members'});
  const clanId=world.social.clans[0].id;
  for(const member of ids.slice(1,20))step(world,member,{type:'clan.join',clanId});
  rejected(world,ids[20],{type:'clan.join',clanId},/veinte/);
  step(world,ids[21],{type:'clan.create',name:'Another clan'});
  rejected(world,ids[19],{type:'clan.join',clanId:world.social.clans[1].id},/perteneces/);
  assert.equal(Object.keys(world.social.clans[0].members).length,20);
});

test('only five reviewed referrals validate per parent and per season',()=>{
  const {world,ids}=fixture(7),parent=ids[0];
  for(const child of ids.slice(1)){
    step(world,child,{type:'referral.bind',parentId:parent});
    const candidate=world.players[child];candidate.milestones.push('tutorial');candidate.stats.crafted=1;
    candidate.activityDays=['2026-10-14','2026-10-15','2026-10-16'];candidate.visitedRegions.push('r_0_0');
  }
  for(const child of ids.slice(1,6))step(world,parent,{type:'referral.validate',targetId:child},NOW+3*DAY);
  rejected(world,parent,{type:'referral.validate',targetId:ids[6]},/cinco invitados/);
  assert.equal(world.social.referrals.filter(r=>r.status==='valid').length,5);
});

test('malformed amounts, fake identifiers and inherited object keys cannot become economic actors',()=>{
  const {world,ids:[first]}=fixture();stock(world,first,'timber',10);
  for(const amount of [true,-1,0,1.2,Number.MAX_SAFE_INTEGER])rejected(world,first,{type:'npc.sell',itemId:'timber',qty:amount},/entero/);
  rejected(world,first,{type:'referral.bind',parentId:'__proto__'},/autorreferidos/);
  rejected(world,first,{type:'mentor.assign',targetId:'constructor'},/otra cuenta/);
  rejected(world,first,{type:'contract.publish',kind:'delivery',itemId:'iron_ingot',qty:1,destination:'__proto__',price:1},/desconocido/);
});

test('bound credits buy an actual equipment repair and never convert into transferable credits',()=>{
  const {world,ids:[first]}=fixture();const gear=stock(world,first,'pickaxe',1);gear.wear=3;
  step(world,first,{type:'credit.service',lotId:gear.id});
  assert.equal(world.players[first].inventory.find(l=>l.id===gear.id)!.wear,20);
  assert.equal(world.players[first].inventory.find(l=>l.id===gear.id)!.bound,true);
  assert.equal(wallet(world,first).boundCredits,40);assert.equal(wallet(world,first).credits,0);
  rejected(world,first,{type:'credit.service',lotId:gear.id},/desgastado/);reconcile(world);
});

test('repair service improves only one unit of a stack and keeps tutorial improvements bound',()=>{
  const {world,ids:[first]}=fixture();const gear=stock(world,first,'pickaxe',1);gear.qty=3;gear.wear=3;
  step(world,first,{type:'credit.service',lotId:gear.id});
  const lots=world.players[first].inventory.filter(l=>l.itemId==='pickaxe');
  assert.equal(lots.reduce((sum,l)=>sum+l.qty,0),3);
  assert.equal(lots.filter(l=>l.wear===20).reduce((sum,l)=>sum+l.qty,0),1);
  assert.equal(lots.find(l=>l.wear===20)!.bound,true);
  assert.equal(lots.find(l=>l.wear===3)!.qty,2);
});

test('funding rejects credit currency and food expiring before delivery; material and financial ledgers stay separate',()=>{
  const {world,ids:[promoter]}=fixture();stock(world,promoter,'preserved_food',5,1,NOW+3*HOUR);
  rejected(world,promoter,{type:'funding.open',currency:'credits',itemId:'preserved_food',qty:5,unitsPerCoupon:1,pricePerCoupon:10,deadlineHours:1,deliveryHours:1},/SIM_QRYP/);
  rejected(world,promoter,{type:'funding.open',itemId:'preserved_food',qty:5,unitsPerCoupon:1,pricePerCoupon:10,deadlineHours:2,deliveryHours:2},/vigencia/);
  assert.equal(qty(world,promoter,'preserved_food'),5);assert.equal(wallet(world,promoter).simUnits,1000);reconcile(world);
});

test('delivery and simulated release are independent; failed release retains its obligation and retries exactly once',()=>{
  const {world,ids:[promoter,buyer]}=fixture();stock(world,promoter,'preserved_food',5);
  step(world,promoter,{type:'funding.open',itemId:'preserved_food',qty:5,unitsPerCoupon:1,pricePerCoupon:10,deadlineHours:1,deliveryHours:1});
  const projectId=world.social.funding[0].id;
  step(world,buyer,{type:'funding.contribute',projectId,coupons:5});assert.equal(wallet(world,buyer).simUnits,950);assert.equal(world.social.funding[0].heldUnits,50);
  rejected(world,promoter,{type:'funding.release',projectId},/entrega/);
  step(world,promoter,{type:'funding.deliver',projectId});assert.equal(qty(world,buyer,'preserved_food'),5);assert.equal(wallet(world,promoter).simUnits,1000);
  step(world,promoter,{type:'funding.release',projectId,simulateFailure:true});assert.equal(world.social.funding[0].status,'delivering');assert.equal(world.social.funding[0].heldUnits,50);reconcile(world);
  step(world,promoter,{type:'funding.release',projectId});step(world,promoter,{type:'funding.release',projectId});
  assert.equal(wallet(world,promoter).simUnits,1050);assert.equal(wallet(world,buyer).credits,0);assert.equal(world.social.funding[0].heldUnits,0);reconcile(world);
});

test('underfunded expiration returns goods while failed refund preserves reserved SIM funds',()=>{
  const {world,ids:[promoter,buyer]}=fixture();stock(world,promoter,'preserved_food',5);
  step(world,promoter,{type:'funding.open',itemId:'preserved_food',qty:5,unitsPerCoupon:1,pricePerCoupon:10,deadlineHours:1,deliveryHours:1});const projectId=world.social.funding[0].id;
  step(world,buyer,{type:'funding.contribute',projectId,coupons:2});settleSocial(world,NOW+2*HOUR);
  assert.equal(qty(world,promoter,'preserved_food'),5);assert.equal(world.social.funding[0].heldUnits,20);
  step(world,buyer,{type:'funding.refund',projectId,simulateFailure:true},NOW+2*HOUR);
  assert.equal(wallet(world,buyer).simUnits,980);assert.equal(world.social.funding[0].status,'refund-pending');reconcile(world);
  step(world,buyer,{type:'funding.refund',projectId},NOW+2*HOUR);step(world,buyer,{type:'funding.refund',projectId},NOW+2*HOUR);
  assert.equal(wallet(world,buyer).simUnits,1000);assert.equal(world.social.funding[0].heldUnits,0);reconcile(world);
});

test('partial coupon delivery refunds only undelivered entitlements and retains a failed release separately',()=>{
  const {world,ids:[promoter,firstBuyer,secondBuyer]}=fixture();stock(world,promoter,'iron_ingot',10);
  step(world,promoter,{type:'funding.open',itemId:'iron_ingot',qty:10,unitsPerCoupon:5,pricePerCoupon:100,deadlineHours:1,deliveryHours:1});
  const projectId=world.social.funding[0].id;
  step(world,firstBuyer,{type:'funding.contribute',projectId,coupons:1});step(world,secondBuyer,{type:'funding.contribute',projectId,coupons:1});
  step(world,promoter,{type:'funding.deliver',projectId,buyerId:firstBuyer,coupons:1});
  assert.equal(qty(world,firstBuyer,'iron_ingot'),5);assert.equal(qty(world,secondBuyer,'iron_ingot'),0);
  step(world,promoter,{type:'funding.release',projectId,simulateFailure:true});settleSocial(world,NOW+3*HOUR);
  assert.equal(world.social.funding[0].status,'refund-pending');assert.equal(qty(world,promoter,'iron_ingot'),5);
  step(world,secondBuyer,{type:'funding.refund',projectId},NOW+3*HOUR);
  assert.equal(wallet(world,firstBuyer).simUnits,900);assert.equal(wallet(world,secondBuyer).simUnits,1000);
  assert.equal(world.social.funding[0].heldUnits,100);reconcile(world);
  step(world,promoter,{type:'funding.release',projectId},NOW+3*HOUR);
  assert.equal(wallet(world,promoter).simUnits,1100);assert.equal(world.social.funding[0].heldUnits,0);
  assert.equal(world.social.funding[0].status,'refunded');reconcile(world);
});

test('rewards use an isolated prefunded pool, ignore market volume, cap every grant at 2% and retain rounding reserve',()=>{
  const {world,ids:[first,second]}=fixture();
  world.players[first].stats.trades=999999;settleSocial(world,NOW);
  assert.equal(world.social.activity[first].points,0);
  world.players[first].stats.gathered=100;world.players[first].stats.crafted=100;world.players[first].stats.explored=100;
  world.players[second].stats.farms=100;settleSocial(world,NOW);
  assert.equal(world.social.activity[first].points,11);assert.equal(world.social.activity[second].points,3);
  world.players[first].stats.gathered+=100;settleSocial(world,NOW);assert.equal(world.social.activity[first].points,11);
  step(world,first,{type:'reward.close'});const rewards=world.social.rewards;
  assert.ok(rewards.allocations.every(r=>r.amount<=20&&r.multiplier<=1.8));
  assert.equal(rewards.reserve+rewards.allocations.reduce((sum,r)=>sum+r.amount,0),1000);reconcile(world);
  const allocation=rewards.allocations.find(r=>r.playerId===first)!;
  step(world,first,{type:'reward.claim',simulateFailure:true});assert.equal(wallet(world,first).simUnits,1000);
  step(world,first,{type:'reward.claim'});step(world,first,{type:'reward.claim'});
  assert.equal(wallet(world,first).simUnits,1000+allocation.amount);reconcile(world);
});

test('only the season owner can close rewards or compensate recorded incidents',()=>{
  const {world,ids:[admin,other]}=fixture();
  rejected(world,other,{type:'reward.close'},/administrador/);
  rejected(world,other,{type:'social.incident',hours:1,reason:'Server delay'},/administrador/);
  earn(world,admin,5);step(world,admin,{type:'contract.publish',kind:'delivery',itemId:'iron_ingot',qty:1,destination:'t_4_4',price:1,deadlineHours:1});
  const deadline=world.social.contracts[0].deadline;
  step(world,admin,{type:'social.incident',hours:2,reason:'Compensación de interrupción registrada'});
  assert.equal(world.social.contracts[0].deadline,deadline+2*HOUR);assert.equal(world.social.incidents.length,1);reconcile(world);
});

test('social read model redacts foreign wallets, inventories, owner identities and approval identities',()=>{
  const {world,ids:[first,second]}=fixture();earn(world,second,5);stock(world,second,'season_relic',1);
  const view=getSocialView(world,world.players[first],'owner0'),serialized=JSON.stringify(view);
  assert.equal(view.account?.credits,0);assert.equal(serialized.includes('owner1'),false);
  assert.equal(serialized.includes('season_relic'),false);assert.equal(serialized.includes('approvals'),false);
  const unaffiliated=getSocialView(world,world.players[second],'owner0');assert.equal(unaffiliated.account,null);assert.equal(unaffiliated.clan,null);
});

