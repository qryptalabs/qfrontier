import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';
import { MvpStorageUnavailableError, isMvpStorageUnavailableError, isTransientD1Error, readD1WithRetry } from '../lib/mvp/storage-availability.ts';
import { createMvpWorld } from '../lib/mvp/world.ts';
import { readMvpView, executeMvp } from '../lib/mvp/engine.ts';

const testEnv:{DB?:ReturnType<typeof database>}={};
const globals=globalThis as typeof globalThis&{__qfrontierStorageTestEnv?:typeof testEnv};
globals.__qfrontierStorageTestEnv=testEnv;
const hook=registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:`data:text/javascript,${encodeURIComponent('export const env=globalThis.__qfrontierStorageTestEnv;')}`,shortCircuit:true};return next(specifier,context);}});
const {getMvpStore}=await import('../lib/mvp/store.ts');
hook.deregister();
const warning=console.warn,warnings:unknown[][]=[];console.warn=(...values:unknown[])=>{warnings.push(values);};
after(()=>{console.warn=warning;delete globals.__qfrontierStorageTestEnv;});

type Row={revision:number;state:string};
function database(options:{read?:()=>Row|null|undefined;write?:(sql:string,bindings:unknown[])=>{success?:boolean;meta:{changes:number};error?:string}}={}){
  const calls={reads:0,inserts:0,updates:0,prepared:[]as string[],bindings:[]as unknown[][]};
  return{calls,prepare(sql:string){calls.prepared.push(sql);return{bind(...values:unknown[]){calls.bindings.push(values);return{async first(){calls.reads++;return options.read?options.read():null;},async run(){if(sql.startsWith('INSERT'))calls.inserts++;if(sql.startsWith('UPDATE'))calls.updates++;return options.write?.(sql,values)??{success:true,meta:{changes:1}};}};}};}};
}
const NOW=Date.parse('2026-10-15T03:30:00Z');

test('only concrete transient D1/internal transport failures are classified as temporary',()=>{
  for(const error of[new Error('D1_ERROR: Internal error [7500]'),new Error('Internal error',{cause:{code:7500}}),new Error('D1 DB reset because its code was updated.'),new Error('Network connection lost.'),new Error('Replica disconnected from primary.'),new Error('Internal error while starting up D1 DB storage caused object to be reset.'),new Error('Cannot resolve D1 DB due to transient issue on remote node.'),new Error('D1 DB is overloaded. Too many requests queued.'),{code:'ECONNRESET',message:'connection reset'}])assert.equal(isTransientD1Error(error),true,String(error));
  for(const error of[new Error('Internal error'),new TypeError('Cannot read properties of undefined'),new Error('D1_ERROR: no such table: world_state: SQLITE_ERROR'),new Error('D1_ERROR: Internal error: no such column: state'),new Error('D1_TYPE_ERROR: Type undefined not supported'),new Error('D1_COLUMN_NOTFOUND'),new Error('D1_ERROR: UNIQUE constraint failed'),new Error('D1 DB exceeded its CPU time limit and was reset.'),new Error('D1 DB isolate exceeded its memory limit and was reset.'),new Error('Your account has exceeded D1 free tier daily row read limit'),new SyntaxError('Unexpected token in JSON')])assert.equal(isTransientD1Error(error),false,String(error));
  const cyclic:{message:string;cause?:unknown}={message:'D1_ERROR'};cyclic.cause=cyclic;assert.equal(isTransientD1Error(cyclic),false);
});

test('bounded read retry uses 100/300ms backoff with bounded jitter and no generic exception retry',async()=>{
  let calls=0;const sleeps:number[]=[];const result=await readD1WithRetry(async()=>{if(++calls<3)throw new Error('Network connection lost.');return'loaded';},{sleep:async ms=>{sleeps.push(ms);},random:()=>0});assert.equal(result,'loaded');assert.equal(calls,3);assert.deepEqual(sleeps,[100,300]);
  calls=0;await assert.rejects(readD1WithRetry(async()=>{calls++;throw new Error('D1_ERROR: syntax error near SELECT');},{sleep:async()=>assert.fail('a permanent SQL error has no backoff')}),/syntax error/);assert.equal(calls,1);
});

test('the real store recovers after two read failures without inserting or changing the saved world',async()=>{
  const world=createMvpWorld('private-owner',NOW),row={revision:7,state:JSON.stringify(world)};let attempts=0;const db=database({read(){if(++attempts===1)throw new Error('D1_ERROR: Internal error [7500]');if(attempts===2)throw new Error('Network connection lost.');return row;}});testEnv.DB=db;const actual=await getMvpStore().read();assert.deepEqual(actual,{revision:7,world});assert.equal(db.calls.reads,3);assert.equal(db.calls.inserts,0);assert.equal(db.calls.updates,0);assert.ok(db.calls.prepared.every(sql=>sql.startsWith('SELECT')));assert.equal(row.state,JSON.stringify(world));
});

test('exhausted reads throw the safe 503 and never look like an empty realm or cause engine initialization',async()=>{
  const db=database({read(){throw new Error('D1_ERROR: Internal error [7500] private-owner sql-secret');}});testEnv.DB=db;const before=warnings.length;await assert.rejects(readMvpView(getMvpStore(),'private-owner',undefined,NOW),(error:unknown)=>{assert.equal(isMvpStorageUnavailableError(error),true);const safe=error as MvpStorageUnavailableError;assert.equal(safe.status,503);assert.equal(safe.code,'MVP_STORAGE_UNAVAILABLE');assert.equal(safe.retryable,true);assert.equal(safe.retryAfterSeconds,5);assert.ok(!safe.message.includes('private-owner'));assert.ok(!safe.message.includes('7500'));return true;});assert.equal(db.calls.reads,3);assert.equal(db.calls.inserts,0);assert.equal(db.calls.updates,0);assert.ok(!JSON.stringify(warnings.slice(before)).includes('sql-secret'));assert.ok(!JSON.stringify(warnings.slice(before)).includes('private-owner'));
});

test('permanent SQL errors are not retried or blamed on provider availability and do not initialize a realm',async()=>{
  const original=new Error('D1_ERROR: no such table: world_state: SQLITE_ERROR'),db=database({read(){throw original;}});testEnv.DB=db;await assert.rejects(readMvpView(getMvpStore(),'owner',undefined,NOW),error=>error===original);assert.equal(db.calls.reads,1);assert.equal(db.calls.inserts,0);assert.equal(db.calls.updates,0);assert.equal(isMvpStorageUnavailableError(original),false);
});

test('a corrupt saved JSON is not re-read, converted into null, overwritten or reported as a transient outage',async()=>{
  const db=database({read:()=>({revision:3,state:'not-valid-json'})});testEnv.DB=db;await assert.rejects(readMvpView(getMvpStore(),'owner',undefined,NOW),SyntaxError);assert.equal(db.calls.reads,1);assert.equal(db.calls.inserts,0);assert.equal(db.calls.updates,0);
});

test('a genuinely absent row returns null while an invalid row shape throws instead of creating a new world',async()=>{
  const absent=database({read:()=>null});testEnv.DB=absent;assert.equal(await getMvpStore().read(),null);assert.equal(absent.calls.inserts,0);
  const invalid=database({read:()=>({revision:-1,state:'{}'})});testEnv.DB=invalid;await assert.rejects(getMvpStore().read(),/formato inválido/);assert.equal(invalid.calls.reads,1);assert.equal(invalid.calls.inserts,0);
  const missing=database({read:()=>undefined});testEnv.DB=missing;await assert.rejects(getMvpStore().read(),/formato inválido/);assert.equal(missing.calls.inserts,0);
});

test('a transient insert failure is surfaced after exactly one write even if the outcome is unknown',async()=>{
  let committed=false;const db=database({write(){committed=true;throw new Error('Network connection lost.');}});testEnv.DB=db;await assert.rejects(getMvpStore().insert(createMvpWorld('owner',NOW)),MvpStorageUnavailableError);assert.equal(committed,true);assert.equal(db.calls.inserts,1);assert.equal(db.calls.updates,0);assert.equal(db.calls.reads,0);
});

test('an ambiguous CAS is not replayed by either the store or engine',async()=>{
  const world=createMvpWorld('owner',NOW);let committedState:string|null=null;const db=database({read:()=>({revision:0,state:JSON.stringify(world)}),write(sql,bindings){assert.ok(sql.startsWith('UPDATE'));committedState=String(bindings[0]);throw new Error('D1_ERROR: Internal error [7500]');}});testEnv.DB=db;await assert.rejects(executeMvp(getMvpStore(),'owner',{type:'player.create',name:'Alba',stationName:'Mi casa',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),MvpStorageUnavailableError);assert.equal(db.calls.reads,1);assert.equal(db.calls.updates,1);assert.equal(db.calls.inserts,0);assert.ok(committedState);assert.equal(Object.keys(JSON.parse(committedState!).players).length,1);
});

test('failed D1 result objects stop writes while confirmed CAS success and conflict keep their meanings',async()=>{
  const failed=database({write:()=>({success:false,error:'D1_ERROR: Internal error [7500]',meta:{changes:0}})});testEnv.DB=failed;await assert.rejects(getMvpStore().compareAndSwap(0,createMvpWorld('owner',NOW)),MvpStorageUnavailableError);assert.equal(failed.calls.updates,1);
  const success=database({write:()=>({success:true,meta:{changes:1}})});testEnv.DB=success;assert.equal(await getMvpStore().compareAndSwap(0,createMvpWorld('owner',NOW)),true);assert.equal(success.calls.updates,1);
  const conflict=database({write:()=>({success:true,meta:{changes:0}})});testEnv.DB=conflict;assert.equal(await getMvpStore().compareAndSwap(0,createMvpWorld('owner',NOW)),false);assert.equal(conflict.calls.updates,1);
  const malformed=database({write:()=>({meta:{changes:0}})});testEnv.DB=malformed;await assert.rejects(getMvpStore().compareAndSwap(0,createMvpWorld('owner',NOW)),error=>{assert.equal(isMvpStorageUnavailableError(error),false);return true;});assert.equal(malformed.calls.updates,1);
});
