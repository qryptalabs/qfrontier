import type { MvpCommand, MvpWorld } from './types.ts';
import { deriveClosedEntityValues } from './entity-values.ts';
import { getVillageEvidence, VillageDependencyError } from './village-evidence.ts';
import type { VillageEvidence } from './village-evidence.ts';

const canonical=(value:unknown):string=>JSON.stringify(value);
function scopeFor(world:MvpWorld,scope?:VillageEvidence):VillageEvidence {
  const evidence=scope??getVillageEvidence(world);
  if(!evidence||evidence.sharedComplete!==true||Object.values(evidence.complete).some(value=>value!==true))throw new VillageDependencyError('Falta el manifiesto cerrado de esta aldea.');
  if(Object.keys(world.players).length!==evidence.profileIds.length||evidence.profileIds.some(id=>world.players[id]?.ownerId!==evidence.ownerId))throw new VillageDependencyError('El contexto no contiene la cuenta completa y exclusivamente propia.');
  return evidence;
}
/** The canonical generator can reuse complete account, resource and individual
 * records. Aggregates which depend on unloaded world/private records are never
 * materialized from this context, including compact extraction slot facts. */
export function deriveVillageEntityValues(world:MvpWorld,scope?:VillageEvidence):Record<string,string> {
  const evidence=scopeFor(world,scope),values=deriveClosedEntityValues(world);
  delete values['lectura:compartida'];delete values['lectura:social'];delete values['transporte:flota'];
  for(const key of Object.keys(values))if(key.startsWith('indice:extraccion:'))delete values[key];
  // Public identities are complete facts; no foreign inventory, account or job
  // history is inferred from their absence in the private account context.
  for(const identity of Object.values(evidence.identities))values[`identidad:jugador:${identity.id}`]=canonical({id:identity.id,ownerId:identity.ownerId});
  return values;
}
function ownExtractionGroups(world:MvpWorld):Map<string,string>{
  const groups=new Map<string,unknown[]>();
  for(const job of Object.values(world.jobs))if(job.kind==='extract'&&(job.status==='running'||job.status==='reserved')){const key=`indice:extraccion:${String(job.payload.tileId)}:${String(job.payload.itemId)}`;const list=groups.get(key)??[];list.push(job);groups.set(key,list);}
  return new Map([...groups].map(([key,jobs])=>[key,canonical(jobs)]));
}
/** These are invalidation impacts, not hashes claiming to represent a complete
 * shared aggregate. The storage writer advances them atomically with the delta. */
export function villageInvalidatedAggregateKeys(before:MvpWorld,after:MvpWorld,scope?:VillageEvidence):string[]{
  scopeFor(before,scope);scopeFor(after,scope);
  const keys=new Set<string>(),socialFields=['offers','contracts','clans','projects','alliances','outposts','referrals','mentors','funding','rewards'] as const;
  const socialChanged=canonical(Object.values(before.convoys).filter(c=>c.exposed))!==canonical(Object.values(after.convoys).filter(c=>c.exposed))||socialFields.some(key=>canonical(before.social[key])!==canonical(after.social[key]));
  if(canonical(before.events)!==canonical(after.events)||socialChanged)keys.add('lectura:compartida');
  if(socialChanged)keys.add('lectura:social');
  const fleets=(world:MvpWorld)=>Object.values(world.players).map(player=>({id:player.id,contracts:player.habitable?.commerce?.contracts??[]}));
  if(canonical(fleets(before))!==canonical(fleets(after)))keys.add('transporte:flota');
  const previous=ownExtractionGroups(before),next=ownExtractionGroups(after);
  for(const key of new Set([...previous.keys(),...next.keys()]))if(previous.get(key)!==next.get(key))keys.add(key);
  return[...keys].sort();
}
export function deriveVillageVersionChanges(before:MvpWorld,after:MvpWorld):{changedKeys:string[];values:Record<string,string>}{
  const previous=deriveVillageEntityValues(before),next=deriveVillageEntityValues(after),changed=new Set<string>();
  for(const key of new Set([...Object.keys(previous),...Object.keys(next)]))if(previous[key]!==next[key])changed.add(key);
  for(const key of villageInvalidatedAggregateKeys(before,after)){changed.add(key);next[key]=canonical({kind:'shared-delta-impact',key});}
  return{changedKeys:[...changed].sort(),values:next};
}

const COMMANDS=new Set(['habitat.profile','habitat.walk','habitat.build','habitat.storage.deposit','habitat.storage.withdraw','habitat.workbench.start','habitat.planter.start','habitat.facility.cancel','habitat.logistics.retry','habitat.residents.initialize','habitat.resident.recruit','habitat.resident.assign','habitat.resident.unassign','habitat.shed.upgrade','habitat.daily.start','habitat.woodlot.start','habitat.sawmill.order','habitat.sawmill.stop','habitat.sawmill.resume','habitat.job.accept','habitat.job.cancel','habitat.job.extract','habitat.job.craft','habitat.job.deliver','habitat.trade.accept','habitat.trade.dispatch','habitat.trade.cancel','habitat.manager.start','habitat.manager.resume','habitat.manager.pause','habitat.manager.approve-build','habitat.manager.revoke-build','habitat.land.explore','habitat.land.clear','habitat.land.claim','habitat.land.road','habitat.land.bridge','habitat.land.center.upgrade','habitat.building.demolish','craft.start','craft.cancel','job.cancel','craft.recycle','tool.repair','farm.start','world.survey','world.travel','mining.reserve','deposit.unlock','npc.sell','building.upgrade','army.prepare','army.heal','army.rest','research.start','credit.service','pvp.toggle']);
/** Admission by command type only. Participant and version coverage must still
 * be proved by the loaded snapshot before any operation is executed. */
export function supportsVillageCommand(command:MvpCommand):boolean {return COMMANDS.has(command.type);}
/** Fail closed before domain execution. Multilateral commerce, creation and
 * politics retain their complete-world path until their closure is audited. */
export function assertVillageExecutionClosure(world:MvpWorld,command?:MvpCommand,now=Date.now()):void {
  const evidence=scopeFor(world);
  if(evidence.mode==='maintenance'&&command)throw new VillageDependencyError('Una liquidación interna de reservas no autoriza órdenes de jugadores.');
  if(command&&(!supportsVillageCommand(command)||command.playerId!==evidence.playerId))throw new VillageDependencyError('La operación requiere su vía completa de participantes.');
  if(evidence.mode!=='maintenance'&&evidence.nextSharedDueAt!==null&&evidence.nextSharedDueAt<=now)throw new VillageDependencyError('Una reserva compartida vencida requiere liquidación de participantes.');
  for(const battle of Object.values(world.battles))if(battle.status==='scheduled')throw new VillageDependencyError('Una batalla comprometida requiere su cierre completo de participantes.');
  if(Object.values(world.jobs).some(job=>job.kind==='battle'&&(job.status==='running'||job.status==='reserved')))throw new VillageDependencyError('La cuenta tiene una batalla que requiere liquidación completa.');
}
