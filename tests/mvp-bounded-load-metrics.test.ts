import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {compareLoadReports} from '../scripts/load-test-compare.mjs';

test('SQL callback exposes actual returned rows and UTF-8 cell bytes without retaining row bodies',async()=>{
  const binding=createSqliteD1({retainTrace:false});
  try{
    binding.sqlite.exec('CREATE TABLE qa (id INTEGER PRIMARY KEY,body TEXT)');
    binding.sqlite.prepare('INSERT INTO qa VALUES (?,?)').run(1,'🌊');
    const calls: {returnedRows?:number;returnedCellBytes?:number}[]=[];binding.afterCall=call=>{calls.push(structuredClone(call));};
    await binding.prepare('SELECT body FROM qa WHERE id=?').bind(1).all();
    assert.deepEqual(calls[0].returnedRows,1);assert.equal(calls[0].returnedCellBytes,4);
    await binding.batch([binding.prepare('SELECT body FROM qa'),binding.prepare('SELECT body FROM qa WHERE id=?').bind(2)]);
    assert.equal(calls[1].returnedRows,1);assert.equal(calls[1].returnedCellBytes,4);
    assert.equal(JSON.stringify(calls).includes('🌊'),false,'Callback metadata must not retain response bodies.');
    assert.equal(binding.queries.length,0,'Benchmark trace retention stays disabled.');
  }finally{binding.close();}
});

test('load comparison keeps covered reads, fallback and commits distinct and does not fabricate old byte metrics',()=>{
  const group={statuses:{'200':1},latencyMs:{count:1,p95:1},responseBodyBytes:1,requestBodyBytes:1};
  const base={formatVersion:3,sourceLibSha256:'old',release:'frozen',config:{users:100,seconds:60},setup:{elapsedMs:1,stateBytes:100},phases:{readBurst:{elapsedMs:1,ok:100,client:{'/view':group},server:{'/view':group}},mixed:{configuredWindowMs:60000,elapsedMs:60001,requestsPerSecond:1,client:{'/command':group},server:{'/command':group},database:{read:{calls:1,sqlMs:1},cas:{calls:1,committed:1,conflicts:0,sqlMs:1},insert:{sqlMs:0}}}},integrity:{passed:true,checks:['conservation'],players:100,jobs:1,receipts:1,stateBytes:100}};
  const candidate=structuredClone(base) as typeof base&{engineIdentity?:{mode:string;label:string}};candidate.sourceLibSha256='new';candidate.engineIdentity={mode:'candidate',label:'bounded-village-reads'};
  Object.assign(candidate.phases.mixed.database,{readVillage:{calls:9,fallbacks:2},projectVillageView:{calls:7},commitVillage:{calls:8,committed:6,conflicts:2}});
  Object.assign(candidate.phases.mixed.server['/command'],{sqlReturnedRows:17,sqlReturnedCellBytes:314});
  const comparison=compareLoadReports(base,candidate,{allowEngineChange:true});
  assert.equal(comparison.baseline.mixed.sqlReturnedRows,null);assert.equal(comparison.baseline.mixed.sqlReturnedCellBytes,null);
  const actual=comparison.partitioned.mixed;
  assert.equal(actual.villageReadAttempts,9);assert.equal(actual.villageReadFallbacks,2);assert.equal(actual.villageViewProjections,7);
  assert.equal(actual.villageCommitAttempts,8);assert.equal(actual.allWriteAttempts,9);assert.equal(actual.allWriteCommits,7);assert.equal(actual.allWriteConflicts,2);
  assert.equal(actual.sqlReturnedRows,17);assert.equal(actual.sqlReturnedCellBytes,314);
});
