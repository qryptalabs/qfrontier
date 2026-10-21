import { env } from 'cloudflare:workers';
import type { MvpWorld } from './types.ts';
import type { MvpView } from './view.ts';
import type { EntityVersions } from './entity-versions.ts';
import type {VillageReadQuery,VillageSnapshot,VillageMaintenanceRecord,VillageMaintenanceQuery,VillageMaintenanceRetry} from './village-snapshot.ts';
import { readD1WithRetry, writeD1Once } from './storage-availability.ts';

export interface MvpRecord {revision: number; world: MvpWorld; entityVersions?: EntityVersions}
export interface MvpCommitContext {now: number; ownerId: string; playerId?: string}
export interface MvpVillageCommitContext extends MvpCommitContext {readVersions: EntityVersions}
export interface MvpStore {
  readonly capabilities?: {entityVersions?: true; playerReads?: true; villageWrites?: true;villageReads?:true};
  read(): Promise<MvpRecord | null>;
  insert(world: MvpWorld): Promise<void>;
  compareAndSwap(revision: number, world: MvpWorld, context?: MvpCommitContext): Promise<boolean>;
  compareAndSwapVillage?(record: MvpRecord, world: MvpWorld, context: MvpVillageCommitContext): Promise<MvpRecord | null>;
  readVillage?(query:VillageReadQuery):Promise<VillageSnapshot|null>;
  commitVillage?(record:VillageSnapshot,state:MvpWorld,context:MvpCommitContext):Promise<VillageSnapshot|null>;
  readVillageMaintenance?(query:VillageMaintenanceQuery):Promise<VillageMaintenanceRecord|VillageMaintenanceRetry|null>;
  commitVillageMaintenance?(record:VillageMaintenanceRecord,state:MvpWorld):Promise<boolean>;
  projectVillageView?(record:VillageSnapshot,ownerId:string,now:number,playerId?:string):Promise<MvpView>;
  readPlayerView?(ownerId: string, playerId: string | undefined, now: number): Promise<MvpView | null>;
  projectPlayerView?(record: MvpRecord, ownerId: string, now: number, playerId?: string): Promise<MvpView>;
}

// Keep the original small alpha as a separate realm. No player records are
// silently reinterpreted as forty-item inventories or monetary balances.
const REALM_ID = 'frontier-pdf-mvp-v2';
export function getMvpStore(): MvpStore {
  const db = env.DB;
  if (!db) throw new Error('La base de datos de la frontera no está disponible.');
  return {
    async read() {
      const row = await readD1WithRetry(()=>db.prepare('SELECT revision, state FROM world_state WHERE id = ?')
        .bind(REALM_ID).first<{ revision: number; state: string }>());
      if(row===null)return null;
      if(!row||!Number.isSafeInteger(row.revision)||row.revision<0||typeof row.state!=='string')throw new Error('La lectura del mundo tiene un formato inválido.');
      return { revision: row.revision, world: JSON.parse(row.state) as MvpWorld };
    },
    async insert(world) {
      await writeD1Once('insert',async()=>{
        const result=await db.prepare('INSERT OR IGNORE INTO world_state (id, revision, state, updated_at) VALUES (?, 0, ?, ?)')
          .bind(REALM_ID, JSON.stringify(world), new Date().toISOString()).run();
        if(!result.success)throw new Error(result.error??'La escritura D1 no confirmó su resultado.');
      });
    },
    async compareAndSwap(revision, world) {
      return writeD1Once('compareAndSwap',async()=>{
        const result = await db.prepare('UPDATE world_state SET revision = revision + 1, state = ?, updated_at = ? WHERE id = ? AND revision = ?')
          .bind(JSON.stringify(world), new Date().toISOString(), REALM_ID, revision).run();
        if(!result.success)throw new Error(result.error??'La escritura D1 no confirmó su resultado.');
        if(!result.meta||![0,1].includes(result.meta.changes))throw new Error('La actualización del mundo no devolvió una revisión válida.');
        return result.meta.changes === 1;
      });
    },
  };
}

