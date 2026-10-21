import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationCodeForPlayer, resolveInvitationPlayerId } from '../lib/mvp/invitations.ts';
import { dispatchSocial, getSocialView, settleSocial } from '../lib/mvp/social.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';
import { executeMvp, quoteMvp, readMvpView } from '../lib/mvp/engine.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpWorld, Player } from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-16T06:00:00Z');
function fixture(){const world=createMvpWorld('parent-owner',NOW),make=(owner:string,request=crypto.randomUUID())=>createPlayer(world,{ownerId:owner,requestId:request,now:NOW,actor:null},{type:'player.create',name:'Explorador de prueba',stationName:'Estación de prueba',faction:'cartographers'}),parent=make('parent-owner'),child=make('child-owner'),sameOwner=make('child-owner');settleSocial(world,NOW);return{world,parent,child,sameOwner};}
function bind(world:MvpWorld,child:Player,code:unknown,now=NOW){return dispatchSocial(world,{type:'referral.bind',playerId:child.id,parentId:code},{ownerId:child.ownerId,requestId:crypto.randomUUID(),now,actor:child});}
class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null=null;writes=0;async read(){return structuredClone(this.record);}async insert(world:MvpWorld){this.record??={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){assert.equal(revision,this.record!.revision);this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}}
const create=(store:MemoryStore,owner:string,request=crypto.randomUUID(),referralCode?:string)=>executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Valle de prueba',faction:'cartographers',...(referralCode!==undefined?{referralCode}:{})},request,undefined,NOW);

test('short invitation codes are stable pure aliases of the existing UUID and require no save migration',()=>{
  assert.equal(invitationCodeForPlayer('p_abcdef12-3456-4789-8123-0123456789ab'),'QFABCDEF123456');assert.equal(invitationCodeForPlayer('p_ABCDEF12-3456-4789-8123-0123456789AB'),'QFABCDEF123456');assert.equal(invitationCodeForPlayer('p_fixture_legacy'),null);const {world,parent}=fixture(),before=structuredClone(world);assert.equal(resolveInvitationPlayerId(world,invitationCodeForPlayer(parent.id)!.toLowerCase()),parent.id);assert.equal(resolveInvitationPlayerId(world,` ${invitationCodeForPlayer(parent.id)} `),parent.id);assert.equal(resolveInvitationPlayerId(world,parent.id),parent.id);assert.deepEqual(world,before);
});

test('a short code binds to the full original parent ID and never changes resources, balances or the immutable parent rule',()=>{
  const {world,parent,child,sameOwner}=fixture(),inventory=structuredClone(child.inventory),accounts=structuredClone(world.social.accounts),npc=structuredClone(world.social.npc);assert.equal(bind(world,child,invitationCodeForPlayer(parent.id)),true);assert.equal(world.social.referrals[0].parentId,parent.id);assert.equal(world.social.referrals[0].childId,child.id);assert.deepEqual(child.inventory,inventory);assert.deepEqual(world.social.accounts,accounts);assert.deepEqual(world.social.npc,npc);assert.throws(()=>bind(world,child,invitationCodeForPlayer(sameOwner.id)),/inmutable/);
});

test('legacy full IDs still bind and malformed, unknown and prototype-shaped codes never select another account',()=>{
  const {world,parent,child}=fixture();for(const code of['QF000000000000','QF123','QF1234567890123','QFZZZZZZZZZZZZ','__proto__','constructor','p_unknown',null,42]){const before=structuredClone(world);assert.equal(resolveInvitationPlayerId(world,code),null);assert.throws(()=>bind(world,child,code));assert.deepEqual(world,before);}bind(world,child,parent.id);assert.equal(world.social.referrals[0].parentId,parent.id);
});

test('a short-code collision rejects ambiguity while each full legacy identifier remains usable',()=>{
  const world=createMvpWorld('owner',NOW),make=(owner:string,request:string)=>createPlayer(world,{ownerId:owner,requestId:request,now:NOW,actor:null},{type:'player.create',name:'Alba',stationName:'Valle',faction:'cartographers'}),a=make('first','11111111-1111-4111-8111-111111111111'),b=make('second','11111111-1111-4222-8222-222222222222'),child=make('child',crypto.randomUUID());settleSocial(world,NOW);assert.equal(invitationCodeForPlayer(a.id),invitationCodeForPlayer(b.id));const before=structuredClone(world);assert.throws(()=>resolveInvitationPlayerId(world,invitationCodeForPlayer(a.id)),/ambiguo/);assert.throws(()=>bind(world,child,invitationCodeForPlayer(a.id)),/ambiguo/);assert.deepEqual(world,before);assert.equal(resolveInvitationPlayerId(world,b.id),b.id);bind(world,child,b.id);assert.equal(world.social.referrals[0].parentId,b.id);
});

test('short aliases retain self, same-owner, cycle, one-day attribution and existing-progress guards',()=>{
  for(const kind of['self','same-owner','cycle','late','progress']){const {world,parent,child,sameOwner}=fixture();let code=invitationCodeForPlayer(parent.id),now=NOW;if(kind==='self')code=invitationCodeForPlayer(child.id);if(kind==='same-owner')code=invitationCodeForPlayer(sameOwner.id);if(kind==='cycle')world.social.referrals.push({childId:parent.id,parentId:child.id,linkedAt:NOW,status:'progressing',validatedAt:null});if(kind==='late')now+=86400001;if(kind==='progress')child.stats.crafted=1;const before=structuredClone(world);assert.throws(()=>bind(world,child,code,now),kind==='cycle'?/ciclo/:kind==='late'||kind==='progress'?/antes de comenzar/:/autorreferidos/);assert.deepEqual(world,before);}
});

test('the social view exposes only the selected owner profile invitation code without adding fields to old saves',()=>{
  const {world,parent,child}=fixture(),before=structuredClone(world);assert.equal(getSocialView(world,parent,parent.ownerId).invitationCode,invitationCodeForPlayer(parent.id));assert.equal(getSocialView(world,child,child.ownerId).invitationCode,invitationCodeForPlayer(child.id));assert.equal(getSocialView(world,parent,child.ownerId).invitationCode,null);assert.equal(getSocialView(world,null,'visitor').invitationCode,null);assert.deepEqual(world,before);
});

test('registration links the exact newly created profile atomically and replay never creates another referral or profile',async()=>{
  const store=new MemoryStore(),parent=(await create(store,'parent-owner')).player!,old=(await create(store,'child-owner')).player!,request=crypto.randomUUID(),code=invitationCodeForPlayer(parent.id)!,cmd={type:'player.create',name:'Bruma',stationName:'Puerta del río',faction:'cartographers',referralCode:code};const quote=await quoteMvp(store,'child-owner',cmd,request,NOW);assert.equal(store.record!.world.social.referrals.length,0);const view=await executeMvp(store,'child-owner',cmd,request,quote.revision,NOW),created=view.player!;assert.equal(created.id,`p_${request}`);assert.notEqual(created.id,old.id);assert.equal(store.record!.world.social.referrals.length,1);assert.equal(store.record!.world.social.referrals[0].childId,created.id);assert.equal(store.record!.world.social.referrals[0].parentId,parent.id);assert.ok(created.inventory.every(l=>l.bound));await readMvpView(store,'child-owner',created.id,NOW);const before=structuredClone(store.record);await executeMvp(store,'child-owner',cmd,request,quote.revision,NOW);assert.deepEqual(store.record,before);
});

test('invalid or same-account invitations abort registration without consuming its profile slot or granting a second kit',async()=>{
  const store=new MemoryStore(),first=(await create(store,'owner')).player!,before=structuredClone(store.record);await assert.rejects(create(store,'owner',crypto.randomUUID(),'QF000000000000'));assert.deepEqual(store.record,before);await assert.rejects(create(store,'owner',crypto.randomUUID(),invitationCodeForPlayer(first.id)!));assert.deepEqual(store.record,before);assert.equal(Object.values(store.record!.world.players).filter(p=>p.ownerId==='owner').length,1);
});
