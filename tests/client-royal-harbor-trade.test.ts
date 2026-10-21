import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canRoyalTrade,newRoyalTrade,royalSnapshotIsNewer} from '../lib/client/royal-harbor-trade.ts';
import type {RoyalHarborSnapshot} from '../lib/mvp/royal-harbor.ts';
const snapshot=()=>({available:true,revision:20,now:2000,account:{credits:100},merchantCredits:200,goods:[{id:'fish',canBuy:true,canSell:true,stock:10,buyPrice:7,sellPrice:4,playerTransferable:12}]}as RoyalHarborSnapshot);
test('an uncertain purchase cannot allocate a second operation after a poll or repeated confirmation',()=>{
 let allocated=0;const make=()=>{allocated++;return'operation-'+allocated;},first=newRoyalTrade(snapshot(),'player','fish','buy',2,null,make);assert.ok(first);assert.equal(allocated,1);
 const newer={...snapshot(),revision:21};assert.equal(newRoyalTrade(newer,'player','fish','buy',2,first,make),null);assert.equal(allocated,1);assert.equal(first.requestId,'operation-1');
 assert.ok(newRoyalTrade(newer,'player','fish','buy',2,null,make),'a definitive result frees the next deliberate trade');
});
test('market capacity, transferable quantities and credits gate a quotation before a confirmation is offered',()=>{
 const state=snapshot();assert.equal(canRoyalTrade(state,'fish','sell',10),true);state.goods[0].stock=127;assert.equal(canRoyalTrade(state,'fish','sell',2),false);state.goods[0].stock=128;state.goods[0].canSell=false;assert.equal(canRoyalTrade(state,'fish','sell',1),false);state.goods[0].stock=10;state.account.credits=3;assert.equal(canRoyalTrade(state,'fish','buy',1),false);assert.equal(canRoyalTrade(state,'fish','sell',21),false);
});
test('an older GET cannot replace a committed trade or rewind an equal-revision server clock',()=>{
 const current=snapshot();assert.equal(royalSnapshotIsNewer(current,{...current,revision:19,now:9000}),false);assert.equal(royalSnapshotIsNewer(current,{...current,now:1999}),false);assert.equal(royalSnapshotIsNewer(current,{...current,revision:21}),true);assert.equal(royalSnapshotIsNewer(null,current),true);
});
