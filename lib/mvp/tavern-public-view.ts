import type {MvpWorld} from './types.ts';
import type {TavernSupplySchedule} from '../graphics/tavern-supply-route.ts';
/** Public district activity only: no inventory, owner identifiers or balances. */
export function tavernPublicView(w:MvpWorld,now:number):{worker:TavernSupplySchedule|null;batches:number}{
 const cs=Object.values(w.players).flatMap(p=>(p.shop?.contracts??[]).filter(c=>c.request==='tavern'&&c.seasonId===w.seasonId));
 const worker=cs.map(c=>c.tavern?.schedule).filter((s):s is TavernSupplySchedule=>!!s&&s.endsAt>now).sort((a,b)=>a.startsAt-b.startsAt)[0]??null;
 return{worker:worker?structuredClone(worker):null,batches:cs.filter(c=>c.deliveredAt!==undefined).length};
}
