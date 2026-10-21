import test from 'node:test';
import assert from 'node:assert/strict';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import type {MvpWorld} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-18T08:00:00Z');
class HistoricalFixture {
  record:{revision:number;world:MvpWorld}|null;
  constructor(world:MvpWorld){this.record={revision:17,world};}
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){assert.equal(this.record,null);this.record={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}

test('historical SQL fixture imports align known revision stamps and never resurrect entity versions across A-B-null-A',async()=>{
  process.env.QFRONTIER_TEST_ENTITY_VERSIONS='1';process.env.QFRONTIER_TEST_VILLAGE_WRITES='1';
  const {sqlBridge}=await import('../scripts/test-partitioned-preload.mjs');
  const world=createMvpWorld('fixture-owner',NOW),player=createPlayer(world,{ownerId:'fixture-owner',now:NOW,requestId:crypto.randomUUID(),actor:null},{type:'player.create',name:'Alba',stationName:'Fixture',faction:'cartographers'});
  const historical=new HistoricalFixture(world),bridge=sqlBridge(historical),initial=await bridge.read();
  assert.ok(initial.entityVersions);assert.equal(initial.revision,17);
  const values=(versions:Record<string,number>):number[]=>Object.values(versions),highest=(versions:Record<string,number>)=>Math.max(...values(versions)),firstHigh=highest(initial.entityVersions);
  const original=structuredClone(historical.record);
  historical.record!.world.players[player.id].name='Cambio B';
  const changed=await bridge.read();assert.ok(changed.entityVersions);assert.ok(values(changed.entityVersions).every(version=>version>firstHigh));
  const changedHigh=highest(changed.entityVersions);
  historical.record=null;assert.equal(await bridge.read(),null);
  historical.record=original;
  const restored=await bridge.read();assert.ok(restored.entityVersions);assert.equal(restored.revision,17);assert.deepEqual(restored.world,initial.world);
  assert.ok(values(restored.entityVersions).every(version=>version>changedHigh),'Even an intervening empty fixture cannot reset the high water mark and make old quoted versions valid.');
  assert.notEqual(restored.entityVersions[`aldea:${player.id}`],initial.entityVersions[`aldea:${player.id}`]);
});
