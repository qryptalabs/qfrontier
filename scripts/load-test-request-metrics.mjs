import {summary} from './load-test-support.mjs';

/** Request-local observations only. No SQL, snapshots, inference from capability
 * flags or extra application calls are performed to produce these metrics. */
export function summarizeStoreRequests(records){
  const observed=records.filter(record=>record.storeOperations!==undefined&&record.storeOperations!==null);
  if(!observed.length)return{observedRequests:0,storeProjectionCalls:null,storeProjectionHistogram:null,requestsWithRepeatedStoreProjection:null,fullReadCalls:null,fullReadHistogram:null,villageFallbackReasons:null,fallbackReasonCountMatches:null,maintenanceReadCalls:null,maintenanceReadRetries:null,maintenanceCommitCalls:null,maintenanceFallbackReasons:null,maintenanceFallbackReasonCountMatches:null};
  const projections=observed.map(record=>(record.storeOperations.projectPlayerView??0)+(record.storeOperations.projectVillageView??0)),reads=observed.map(record=>record.storeOperations.read??0);
  const histogram=values=>values.reduce((counts,value)=>{counts[value]=(counts[value]??0)+1;return counts;},{});
  const reasons={},maintenanceReasons={},fallbacks=observed.reduce((sum,record)=>sum+(record.storeOperations.readVillageFallbacks??0),0),maintenanceFallbacks=observed.reduce((sum,record)=>sum+(record.storeOperations.maintenanceReadFallbacks??0),0);
  for(const record of observed)for(const[reason,count]of Object.entries(record.storeDiagnostics?.villageFallbackReasons??{}))reasons[reason]=(reasons[reason]??0)+count;
  for(const record of observed)for(const[reason,count]of Object.entries(record.storeDiagnostics?.maintenanceFallbackReasons??{}))maintenanceReasons[reason]=(maintenanceReasons[reason]??0)+count;
  return{observedRequests:observed.length,storeProjectionCalls:summary(projections),storeProjectionHistogram:histogram(projections),requestsWithRepeatedStoreProjection:projections.filter(value=>value>1).length,fullReadCalls:summary(reads),fullReadHistogram:histogram(reads),villageFallbackReasons:reasons,fallbackReasonCountMatches:Object.values(reasons).reduce((sum,count)=>sum+count,0)===fallbacks,maintenanceReadCalls:summary(observed.map(record=>record.storeOperations.readVillageMaintenance??0)),maintenanceReadRetries:summary(observed.map(record=>record.storeOperations.maintenanceReadRetries??0)),maintenanceCommitCalls:summary(observed.map(record=>record.storeOperations.commitVillageMaintenance??0)),maintenanceFallbackReasons:maintenanceReasons,maintenanceFallbackReasonCountMatches:Object.values(maintenanceReasons).reduce((sum,count)=>sum+count,0)===maintenanceFallbacks};
}
