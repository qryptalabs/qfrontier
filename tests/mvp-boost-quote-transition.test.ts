import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpCommand,MvpWorld} from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){assert.equal(this.record,null);this.record={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
// Wire format used by the published free-booster release, before passes existed.
async function legacyToken(world:MvpWorld,owner:string,command:MvpCommand,request:string,revision:number,expires:number){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(world.rngSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify({owner,command,request,revision,expires})));
  return Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,'0')).join('');
}
test('pre-pass boosted drafts require a new cost review while ordinary quotes and committed retries remain compatible',async()=>{
  const store=new MemoryStore(),owner='transition-owner',now=Date.parse('2026-10-18T09:00:00Z');
  const initial=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Cotizaciones seguras',faction:'cartographers'},crypto.randomUUID(),undefined,now);
  const playerId=initial.player!.id;await readMvpView(store,owner,playerId,now);
  const boosted={type:'craft.start',playerId,recipeId:'plank',qty:1,useTestBoost:true},request=crypto.randomUUID(),quote=await quoteMvp(store,owner,boosted,request,now);
  const oldToken=await legacyToken(store.record!.world,owner,boosted,request,quote.revision,quote.expiresAt),before=structuredClone(store.record);
  await assert.rejects(validateMvpQuote(store,owner,boosted,request,quote.revision,oldToken,quote.expiresAt,now+1),/no corresponde/);
  assert.deepEqual(store.record,before,'rejecting the old draft must not reserve a pass or materials');
  await validateMvpQuote(store,owner,boosted,request,quote.revision,quote.token,quote.expiresAt,now+1);
  const plain={...boosted,useTestBoost:false},plainRequest=crypto.randomUUID(),plainQuote=await quoteMvp(store,owner,plain,plainRequest,now);
  const oldPlain=await legacyToken(store.record!.world,owner,plain,plainRequest,plainQuote.revision,plainQuote.expiresAt);
  await validateMvpQuote(store,owner,plain,plainRequest,plainQuote.revision,oldPlain,plainQuote.expiresAt,now+1);
  await executeMvp(store,owner,boosted,request,quote.revision,now+1);
  const committed=structuredClone(store.record);
  await validateMvpQuote(store,owner,boosted,request,quote.revision,oldToken,quote.expiresAt,now+86400000);
  await executeMvp(store,owner,boosted,request,quote.revision,now+1);
  assert.deepEqual(store.record,committed,'a committed retry recovers its receipt without another pass debit');
});
