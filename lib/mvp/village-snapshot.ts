import type {EntityVersions} from './entity-versions.ts';
import type {HabitableTrade} from './habitable-commerce.ts';
import type {MvpCommand,MvpWorld,Player} from './types.ts';
import type {WorldRecord} from './partitioned-codec.ts';

export interface VillageReadQuery {ownerId:string;playerId?:string;now:number;command?:MvpCommand;requestId?:string}
export type VillageMaintenanceQuery=Pick<VillageReadQuery,'ownerId'|'playerId'|'now'>;
export type VillageReadReason='covered'|'invalid-query'|'index-unavailable'|'ownership'|'battle'|'shared-deadline'|'invalid-records'|'size-budget'|'administrator'|'clan'|'plot-repair'|'fleet-incomplete'|'version-budget'|'unsupported-command'|'unsupported-closure'|'maintenance-unavailable'|'maintenance-race';
export interface VillageReadOutcome {operation:'village'|'maintenance';result:'covered'|'fallback'|'retry';reason:VillageReadReason}
export interface VillageLeaseRef {kind:'extract'|'district'|'trade';id:string;playerId:string;dueAt:number}
export interface VillageMaintenanceRecord {kind:'village-maintenance';snapshot:VillageSnapshot;leases:VillageLeaseRef[]}
export interface VillageMaintenanceRetry {readonly kind:'village-maintenance-retry'}
export interface VillageIdentity {id:string;ownerId:string;name:string;stationName:string;faction:Player['faction']}
export interface VillageExtractionFact {id:string;playerId:string;ownerId:string;kind:'extract';status:'reserved'|'running';endsAt:number;payload:{tileId:string;itemId:string;qty:number}}
export interface VillageScope {
  mode?:'maintenance';
  ownerId:string;playerId:string;profileIds:string[];totalPlayerCount:number;recordKeys:string[];
  ledgerOrdinals:Record<string,number>;identities:Record<string,VillageIdentity>;commerceFleet:HabitableTrade[];
  extractionJobs:VillageExtractionFact[];sharedNextDueAt:number|null;nextSharedDueAt:number|null;playerOrdinals:Record<string,number>;
  readVersions:EntityVersions;dependencyKeys:string[];sharedComplete:true;
  complete:{profiles:true;ownJobs:true;ownLedger:true;ownAccounts:true;resources:true;extractionJobs:true;sharedSocial:true;ownBattles:true;fleet:true};
}
/** A covered domain context, never an assertion that all private world state is
 * present. It must not be converted into the global MvpRecord contract. */
export interface VillageSnapshot {
  kind:'village';revision:number;token:string;state:MvpWorld;entityVersions:EntityVersions;scope:VillageScope;
  facts:{identityDirectory:Record<string,VillageIdentity>;extractionClosure:true};
}

/** Preserve GLOBAL ordinals as evidence while decoding a closed subset. The
 * ordinary decoder deliberately rejects these non-dense record collections. */
export function decodeVillageRecords(records:readonly WorldRecord[]):MvpWorld {
  const roots=records.filter(record=>record.collection==='$root');
  if(roots.length!==1||roots[0].entityId!=='world')throw new Error('Falta la raíz del contexto de aldea.');
  const root=JSON.parse(roots[0].body) as {format:number;world:MvpWorld;collections:{name:string;path:string[];kind:'map'|'array'}[]};
  if(root.format!==1||root.world?.schemaVersion!==2||!Array.isArray(root.collections))throw new Error('El contexto de aldea tiene una raíz inválida.');
  const consumed=new Set<WorldRecord>(roots),names=new Set<string>();
  for(const descriptor of root.collections){
    if(!descriptor||!Array.isArray(descriptor.path)||descriptor.name!==descriptor.path.join('/')||names.has(descriptor.name)||!['map','array'].includes(descriptor.kind)||!(descriptor.path.length===1&&['players','tiles','regions','jobs','battles','convoys','events','receipts'].includes(descriptor.path[0])||descriptor.path.length===2&&descriptor.path[0]==='social'))throw new Error('La cobertura de colecciones de la aldea es inválida.');
    names.add(descriptor.name);const parent=(descriptor.path.length===1?root.world:root.world.social) as unknown as Record<string,unknown>,field=descriptor.path.at(-1)!,container:unknown[]|Record<string,unknown>=descriptor.kind==='array'?[]:{};
    const children=records.filter(record=>record.collection===descriptor.name).sort((a,b)=>a.ordinal-b.ordinal||a.entityId.localeCompare(b.entityId)),ids=new Set<string>();
    for(const child of children){if(ids.has(child.entityId)||!Number.isSafeInteger(child.ordinal)||child.ordinal<0)throw new Error('El contexto de aldea contiene un registro repetido o sin orden válido.');ids.add(child.entityId);const value:unknown=JSON.parse(child.body);if(Array.isArray(container))container.push(value);else Object.defineProperty(container,child.entityId,{value,enumerable:true,writable:true,configurable:true});consumed.add(child);}
    Object.defineProperty(parent,field,{value:container,enumerable:true,writable:true,configurable:true});
  }
  if(consumed.size!==records.length)throw new Error('El contexto de aldea contiene registros fuera de su cobertura.');
  return root.world;
}
