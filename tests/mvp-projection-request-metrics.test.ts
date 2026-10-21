import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeStoreRequests} from '../scripts/load-test-request-metrics.mjs';

test('request projection metrics distinguish unavailable observations from measured zero calls',()=>{
  const unavailable=summarizeStoreRequests([{endpoint:'/view',status:200}]);assert.equal(unavailable.observedRequests,0);assert.equal(unavailable.storeProjectionCalls,null);assert.equal(unavailable.villageFallbackReasons,null);
  const measured=summarizeStoreRequests([{storeOperations:{read:0,readPlayerView:1}}]);assert.equal(measured.storeProjectionCalls!.count,1);assert.equal(measured.storeProjectionCalls!.max,0);assert.deepEqual(measured.storeProjectionHistogram,{'0':1});assert.equal(measured.fallbackReasonCountMatches,true);
});

test('request projection metrics count repeats, full reads and explicit fallback reasons independently',()=>{
  const actual=summarizeStoreRequests([
    {storeOperations:{projectPlayerView:1,projectVillageView:2,read:1,readVillageFallbacks:2},storeDiagnostics:{villageFallbackReasons:{shared_due:1,index_stale:1}}},
    {storeOperations:{projectVillageView:1,read:0,readVillageFallbacks:1},storeDiagnostics:{villageFallbackReasons:{unsupported_command:1}}},
    {storeOperations:{readPlayerView:1,readVillageMaintenance:2,maintenanceReadFallbacks:1,maintenanceReadRetries:1,commitVillageMaintenance:1},storeDiagnostics:{maintenanceFallbackReasons:{'maintenance-unavailable':1}}},
  ]);
  assert.equal(actual.observedRequests,3);assert.deepEqual(actual.storeProjectionHistogram,{'0':1,'1':1,'3':1});assert.equal(actual.storeProjectionCalls!.max,3);assert.equal(actual.requestsWithRepeatedStoreProjection,1);assert.deepEqual(actual.fullReadHistogram,{'0':2,'1':1});assert.deepEqual(actual.villageFallbackReasons,{shared_due:1,index_stale:1,unsupported_command:1});assert.equal(actual.fallbackReasonCountMatches,true);
  assert.equal(actual.maintenanceReadCalls!.max,2);assert.equal(actual.maintenanceReadRetries!.max,1);assert.equal(actual.maintenanceCommitCalls!.max,1);assert.deepEqual(actual.maintenanceFallbackReasons,{'maintenance-unavailable':1});assert.equal(actual.maintenanceFallbackReasonCountMatches,true,'A retry is separate from a fallback and never contributes a projection.');
  const missing=summarizeStoreRequests([{storeOperations:{readVillageFallbacks:1}}]);assert.equal(missing.fallbackReasonCountMatches,false,'Missing reason attribution must remain visible, not invented as a zero fallback.');
});
