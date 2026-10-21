import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {MvpStorageUnavailableError} from '../lib/mvp/storage-availability.ts';

const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==='../../app/chatgpt-auth.ts')return{url:`data:text/javascript,${encodeURIComponent('export async function getChatGPTUser(){throw new Error("No authentication call belongs in error formatting");}')}`,shortCircuit:true};
  return next(specifier,context);
}});
const {apiFailure}=await import('../lib/mvp/http.ts');
hook.deregister();

test('a storage outage returns a retryable 503 without inventing a saved view or exposing diagnostics',async()=>{
  const response=apiFailure(new MvpStorageUnavailableError());
  assert.equal(response.status,503);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('retry-after'),'5');
  const body=await response.json();
  assert.ok(body&&typeof body==='object');
  assert.equal((body as Record<string,unknown>).code,'MVP_STORAGE_UNAVAILABLE');
  assert.equal((body as Record<string,unknown>).retryable,true);
  assert.equal(typeof (body as Record<string,unknown>).error,'string');
  assert.equal(Object.hasOwn(body,'view'),false);
  assert.ok(!JSON.stringify(body).includes('7500'));
  assert.ok(!JSON.stringify(body).includes('world_state'));
});

test('business validation and authorization keep their original status and are not marked as a storage outage',async()=>{
  for(const status of[400,401,403,409]){
    const response=apiFailure(Object.assign(new Error('Orden no disponible.'),{status}));
    assert.equal(response.status,status);
    assert.equal(response.headers.get('retry-after'),null);
    assert.deepEqual(await response.json(),{error:'Orden no disponible.'});
  }
});
