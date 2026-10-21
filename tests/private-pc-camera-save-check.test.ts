import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareCameraSaveStates} from '../scripts/private-pc-camera-save-check.mjs';

function state(){return{schemaVersion:2,createdAt:1,seasonId:'s',players:{p:{id:'p',ownerId:'private-owner',name:'private-name',inventory:[{id:'lot',itemId:'timber',qty:5,parents:['origin']}],buildings:{warehouse:2},stats:{gathered:5},milestones:['crafted'],habitable:{version:1,position:{x:0,y:1.5},buildings:[{id:'shed',templateId:'shed',storage:[{id:'food',qty:2}]}]}}},jobs:{j:{status:'completed',playerId:'p',payload:{qty:5}}},receipts:{'private-owner:old':'a'.repeat(64)},social:{chain:{claims:[],counter:0}}};}
test('release audit requires every save field, recipe history and provenance to remain exact',()=>{
  const before=state(),same=compareCameraSaveStates(before,structuredClone(before));assert.equal(same.allPassed,true);assert.equal(same.changes.count,0);
  for(const mutate of[(s:ReturnType<typeof state>)=>{s.players.p.inventory[0].qty++;},(s:ReturnType<typeof state>)=>{s.players.p.inventory[0].parents[0]='changed';},(s:ReturnType<typeof state>)=>{s.players.p.habitable.buildings[0].storage[0].qty++;},(s:ReturnType<typeof state>)=>{s.players.p.stats.gathered++;},(s:ReturnType<typeof state>)=>{s.social.chain.counter++;}]){const after=structuredClone(before);mutate(after);const report=compareCameraSaveStates(before,after,{allowWalk:true});assert.equal(report.allPassed,false);assert.ok(report.changes.count>0);assert.ok(!JSON.stringify(report).includes('private-owner'));assert.ok(!JSON.stringify(report).includes('private-name'));}
});
test('allow-walk permits only position/movement and appended opaque receipts and states its attribution limit',()=>{
  const before=state(),after=structuredClone(before)as ReturnType<typeof state>&{players:{p:{habitable:{movement?:unknown}}}};after.players.p.habitable.position={x:1,y:1.5};after.players.p.habitable.movement={points:[{x:0,y:1.5},{x:1,y:1.5}],startsAt:1000,endsAt:1500};Object.assign(after.receipts,{'private-owner:new':'b'.repeat(64)});
  assert.equal(compareCameraSaveStates(before,after).allPassed,false);const report=compareCameraSaveStates(before,after,{allowWalk:true});assert.equal(report.allPassed,true);assert.equal(report.addedReceipts,1);assert.equal(report.checks.sameInventories,true);assert.equal(report.checks.sameProgressionInputs,true);assert.equal(report.receiptAttributionVerified,false);assert.match(report.receiptAttributionNote,/observed UI\/Network/);assert.ok(report.changes.paths.some((entry:{path:string})=>entry.path.endsWith('/habitable/movement')));
});
test('allow-walk rejects replaced receipts, malformed movement, ownership and public state changes',()=>{
  const before=state();for(const mutate of[(s:ReturnType<typeof state>)=>{s.receipts['private-owner:old']='b'.repeat(64);},(s:ReturnType<typeof state>)=>{s.players.p.habitable.position.x=NaN;},(s:ReturnType<typeof state>)=>{s.players.p.ownerId='other';},(s:ReturnType<typeof state>)=>{s.jobs.j.status='cancelled';}]){const after=structuredClone(before);mutate(after);assert.equal(compareCameraSaveStates(before,after,{allowWalk:true}).allPassed,false);}
});
test('walking audit preserves every other profile even while one character moves',()=>{
  const before=state();Object.assign(before.players,{p2:{...structuredClone(before.players.p),id:'p2'}});const after=structuredClone(before);after.players.p.habitable.position.x=1;assert.equal(compareCameraSaveStates(before,after,{allowWalk:true}).allPassed,true);const other=after.players as Record<string,typeof after.players.p>;other.p2.inventory[0].qty--;assert.equal(compareCameraSaveStates(before,after,{allowWalk:true}).allPassed,false);
});
