import {settleTavernSupply} from './city-tavern.ts';
import {MvpError} from './helpers.ts';
import type {MvpRecord,MvpStore} from './store.ts';
/** Finish previously authorized, due deliveries even when their owner is offline.
 * Callers authenticate their viewer before entering this shared maintenance. */
export async function settleDueTavernSupplies(store:MvpStore,record:MvpRecord,ownerId:string,playerId:string,now:number):Promise<MvpRecord>{
 let r=record;
 for(let attempt=0;attempt<8;attempt++){
  if(!Object.values(r.world.players).some(p=>p.shop?.contracts?.some(c=>c.tavern&&c.tavern.paidAt===undefined&&c.tavern.schedule.deliversAt<=now)))return r;
  const next=structuredClone(r.world);for(const p of Object.values(next.players))settleTavernSupply(next,p,now);
  if(await store.compareAndSwap(r.revision,next,{ownerId,playerId,now}))return{revision:r.revision+1,world:next};
  const newer=await store.read();if(!newer)throw new MvpError('El mundo está esperando conexión.',503);r=newer;
 }
 throw new MvpError('La recepción está confirmando otra entrega. Actualiza en unos segundos.',503);
}
