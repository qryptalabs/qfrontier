import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLevelNotificationStore,type LevelNotificationStorage} from '../lib/client/level-notifications.ts';
class Storage implements LevelNotificationStorage {data=new Map<string,string>();reads=0;writes=0;getItem(key:string){this.reads++;return this.data.get(key)??null;}setItem(key:string,value:string){this.writes++;this.data.set(key,value);}}
function create(profileId:string|null='p_alba',storage:LevelNotificationStorage|null=new Storage(),memory=new Map<string,string>()){return createLevelNotificationStore(profileId,{storage,memory});}

test('SSR is storage-free and first observation silently baselines the current server level',()=>{
  const storage=new Storage(),store=create('p_alba',storage),server=store.getServerSnapshot();
  assert.equal(storage.reads,0);assert.equal(store.getSnapshot(),server);assert.equal(store.getSnapshot(),store.getSnapshot());
  store.observe(7,10);assert.deepEqual(store.getSnapshot(),{profileId:'p_alba',pending:null,highestLevel:7});assert.equal(store.getServerSnapshot(),server);assert.equal(server.highestLevel,1);
  const raw=storage.data.get(store.storageKey!)!;assert.deepEqual(JSON.parse(raw),{version:1,profileId:'p_alba',initialized:true,highestLevel:7,acknowledgedLevel:7});assert.ok(raw.length<200);
});
test('live and offline levels group into one maximum range until acknowledgment',()=>{
  const storage=new Storage(),store=create('p_alba',storage);store.observe(2,1);store.observe(3,2);store.observe(5,3);
  assert.deepEqual(store.getSnapshot().pending,{fromLevel:2,toLevel:5});const snapshot=store.getSnapshot();store.observe(5,4);assert.equal(store.getSnapshot(),snapshot);
  const remount=create('p_alba',storage);remount.observe(5,4);assert.deepEqual(remount.getSnapshot().pending,{fromLevel:2,toLevel:5});remount.acknowledge();assert.equal(remount.getSnapshot().pending,null);
  const again=create('p_alba',storage);again.observe(5,5);assert.equal(again.getSnapshot().pending,null);again.observe(8,6);assert.deepEqual(again.getSnapshot().pending,{fromLevel:5,toLevel:8});
});
test('cross-tab reload merges acknowledgment and maxima without replaying consumed ranges',()=>{
  const storage=new Storage(),a=create('p_alba',storage),b=create('p_alba',storage);a.observe(1,1);b.observe(1,1);a.observe(3,2);b.reload();assert.deepEqual(b.getSnapshot().pending,{fromLevel:1,toLevel:3});
  b.acknowledge();a.reload();assert.equal(a.getSnapshot().pending,null);a.observe(5,3);b.observe(4,3);assert.deepEqual(b.getSnapshot().pending,{fromLevel:3,toLevel:5});b.acknowledge();a.observe(5,4);assert.equal(a.getSnapshot().pending,null);
});
test('stale revisions and invalid levels cannot poison the baseline; equal revisions accept timed projections',()=>{
  const store=create();for(const invalid of[0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])store.observe(invalid,999);
  store.observe(2,20);store.observe(4,21);const snapshot=store.getSnapshot();store.observe(8,19);store.observe(9,NaN);assert.equal(store.getSnapshot(),snapshot);
  store.observe(5,21);assert.deepEqual(store.getSnapshot().pending,{fromLevel:2,toLevel:5});store.acknowledge();store.observe(3,22);store.observe(5,23);assert.equal(store.getSnapshot().pending,null);assert.equal(store.getSnapshot().highestLevel,5);
});
test('profile state is isolated, foreign records are rejected and missing profiles are inert',()=>{
  const storage=new Storage(),memory=new Map<string,string>(),a=create('p_alba',storage,memory),b=create('p_other',storage,memory);a.observe(1);a.observe(3);b.observe(8);assert.equal(b.getSnapshot().pending,null);assert.notEqual(a.storageKey,b.storageKey);
  storage.data.set(b.storageKey!,JSON.stringify({version:1,profileId:'p_alba',initialized:true,highestLevel:99,acknowledgedLevel:1}));const fresh=create('p_other',storage);fresh.observe(8);assert.equal(fresh.getSnapshot().pending,null);
  const empty=create(null,storage,memory),before=storage.writes;empty.observe(3);empty.acknowledge();empty.reload();assert.deepEqual(empty.getSnapshot(),{profileId:null,pending:null,highestLevel:1});assert.equal(storage.writes,before);
});
test('corrupt, invalid or oversized storage becomes a silent fresh baseline',()=>{
  for(const raw of['{broken',' '.repeat(4097),JSON.stringify({version:2,profileId:'p_alba',initialized:true,highestLevel:5,acknowledgedLevel:1}),JSON.stringify({version:1,profileId:'p_alba',initialized:true,highestLevel:2,acknowledgedLevel:3}),JSON.stringify({version:1,profileId:'p_alba',initialized:true,highestLevel:'5',acknowledgedLevel:1})]){
    const storage=new Storage(),store=create('p_alba',storage);storage.data.set(store.storageKey!,raw);store.observe(6);assert.equal(store.getSnapshot().pending,null);assert.equal(store.getSnapshot().highestLevel,6);
  }
});
test('denied storage and quota errors preserve pending and acknowledgment in bounded memory',()=>{
  const blocked:LevelNotificationStorage={getItem(){throw new DOMException('Blocked','SecurityError');},setItem(){throw new DOMException('Full','QuotaExceededError');}},memory=new Map<string,string>(),store=create('p_alba',blocked,memory);store.observe(2);store.observe(5);
  const remount=create('p_alba',null,memory);remount.observe(5);assert.deepEqual(remount.getSnapshot().pending,{fromLevel:2,toLevel:5});remount.acknowledge();const again=create('p_alba',blocked,memory);again.observe(5);assert.equal(again.getSnapshot().pending,null);
  memory.set('another-feature','preserved');for(let i=0;i<20;i++)create(`p_${i}`,null,memory).observe(i+1);assert.equal([...memory.keys()].filter(key=>key.startsWith('qfrontier.level.v1:')).length,8);assert.equal(memory.get('another-feature'),'preserved');
});
test('snapshot notifications are stable and subscription teardown prevents later callbacks',()=>{
  const store=create();let events=0;const unsubscribe=store.subscribe(()=>{events++;});store.observe(1);assert.equal(events,0);store.observe(2);assert.equal(events,1);const snapshot=store.getSnapshot();store.observe(2);store.reload();assert.equal(store.getSnapshot(),snapshot);assert.equal(events,1);unsubscribe();store.observe(3);assert.equal(events,1);
});
test('large authoritative jumps remain scalar rather than enumerating or granting levels',()=>{
  const storage=new Storage(),store=create('p_alba',storage);store.observe(1);store.observe(Number.MAX_SAFE_INTEGER);assert.deepEqual(store.getSnapshot().pending,{fromLevel:1,toLevel:Number.MAX_SAFE_INTEGER});assert.ok(storage.data.get(store.storageKey!)!.length<250);
});
