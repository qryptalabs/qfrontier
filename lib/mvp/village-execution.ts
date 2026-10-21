import {commandVersionKeys} from './entity-versions.ts';
import type {EntityVersions} from './entity-versions.ts';
import type {MvpRecord,MvpStore} from './store.ts';
import type {MvpCommand,MvpWorld} from './types.ts';
import {plotForIndex} from './settlements.ts';

// These existing handlers mutate the selected village, its account, and the
// shared resources guarded below. Their legacy quote policy stays strict where
// a narrower signed command dependency set has not yet been audited.
const LOCAL_COMMANDS=new Set([
  'habitat.job.accept','habitat.job.cancel','habitat.job.extract','habitat.job.craft','habitat.job.deliver',
  'habitat.logistics.retry','habitat.residents.initialize','habitat.resident.recruit','habitat.resident.assign','habitat.resident.unassign',
  'habitat.shed.upgrade','habitat.daily.start','habitat.woodlot.start','habitat.sawmill.order','habitat.sawmill.stop','habitat.sawmill.resume',
  'habitat.trade.accept','habitat.trade.dispatch','habitat.trade.cancel',
  'habitat.manager.start','habitat.manager.resume','habitat.manager.pause','habitat.manager.approve-build','habitat.manager.revoke-build',
  'habitat.land.explore','habitat.land.clear','habitat.land.claim','habitat.land.road','habitat.land.bridge','habitat.land.center.upgrade','habitat.building.demolish',
]);
function supportedCommand(world:MvpWorld,ownerId:string,command:MvpCommand):boolean {
  return LOCAL_COMMANDS.has(command.type)||commandVersionKeys(world,ownerId,command)!==null;
}

/** Existing global policies still own political expiry and shared leases. A
 * village must not keep an expired treaty bonus, a food offer or an offline
 * owner's NPC/deposit reservation alive indefinitely. This exceptional path is
 * retained until those shared deadlines have their own bounded scheduler. */
function sharedMaintenanceDue(world:MvpWorld,playerId:string,now:number):boolean {
  const state=world.social;
  if(state.offers.some(o=>o.status==='open'&&(now>=o.expiresAt||o.lots.some(l=>l.expiresAt!==null&&l.expiresAt<=now))))return true;
  if(state.contracts.some(c=>(c.status==='published'||c.status==='accepted')&&now>c.deadline))return true;
  if(state.clans.some(c=>c.withdrawals.some(w=>w.status==='pending'&&now>w.expiresAt)))return true;
  if(state.projects.some(p=>p.status==='open'&&now>p.deadline))return true;
  if(state.alliances.some(a=>a.status!=='ended'&&now>a.expiresAt))return true;
  if(state.funding.some(p=>p.status==='open'&&now>=p.fundingDeadline||(p.status==='funded'||p.status==='delivering')&&now>=p.deliveryDeadline&&p.contributions.some(c=>c.deliveredCoupons<c.coupons)))return true;
  if((state.outposts??[]).some(p=>p.status!=='expired'&&(now>=p.expiresAt||p.status==='active'&&now>=p.maintenanceUntil)))return true;
  for(const p of Object.values(world.players))if(p.id!==playerId){
    const job=p.habitable?.job;
    if(job?.status==='active'&&now>=job.expiresAt)return true;
    if(p.habitable?.commerce?.contracts.some(c=>c.status==='accepted'&&now>=c.deadline||c.status==='in_transit'&&c.caravan.delivery&&now>=c.caravan.delivery.unloadsAt))return true;
  }
  return Object.values(world.jobs).some(j=>j.playerId!==playerId&&j.kind==='extract'&&(j.status==='running'||j.status==='reserved')&&j.endsAt<=now);
}

/** An explicit execution boundary, not a partial fake world. Domain rules still
 * receive authoritative shared inputs. Unreviewed multiplayer operations retain
 * the original whole-world transaction and settlement path. */
export function villageTarget(store:MvpStore,record:MvpRecord,ownerId:string,requested?:string,command?:MvpCommand,now=Date.now()):string|undefined {
  if(!store.capabilities?.villageWrites||!store.compareAndSwapVillage||!record.entityVersions)return undefined;
  const world=record.world;
  if(command&&!supportedCommand(world,ownerId,command))return undefined;
  const player=requested?world.players[requested]:Object.values(world.players).find(p=>p.ownerId===ownerId);
  if(!player||player.ownerId!==ownerId)return undefined;
  if(sharedMaintenanceDue(world,player.id,now))return undefined;
  // A legacy save requiring coordinate repair must run the deterministic global
  // migration, which also detects duplicate plots. Never silently move a neighbor.
  const used=new Set<number>();
  for(const p of Object.values(world.players)){
    const plot=p.settlement;
    if(!plot||!Number.isSafeInteger(plot.index)||plot.index<0||plot.index>1_000_000_000||used.has(plot.index))return undefined;
    const canonical=plotForIndex(plot.index);
    if(Object.entries(canonical).some(([key,value])=>plot[key as keyof typeof plot]!==value))return undefined;
    used.add(plot.index);
  }
  // Battles can settle a second inventory, foreign guards and political state.
  // Their participant/read-set closure is intentionally not inferred from writes.
  if(Object.values(world.jobs).some(j=>j.playerId===player.id&&(j.status==='reserved'||j.status==='running')&&j.kind==='battle'))return undefined;
  if(Object.values(world.battles).some(b=>b.status==='scheduled'&&(b.targetId===player.id||b.convoyId&&world.convoys[b.convoyId]?.playerId===player.id||world.jobs[b.jobId]?.payload.defenderPlayerId===player.id)))return undefined;
  // Never truncate a read set to fit a budget. A mature realm retains the safe
  // previous transaction path until its bounded dependency index is available.
  if(Object.keys(villageReadVersions(record,ownerId,player.id,command)).length>2048)return undefined;
  return player.id;
}

/** Conservative shared read set for the village's autonomous production graph.
 * It excludes foreign private state and the global chronicle, so an unrelated
 * craft cannot invalidate this transaction. Shared deposits, roads, quotas,
 * offers and political inputs still participate in conflict detection. */
export function villageReadVersions(record:MvpRecord,ownerId:string,playerId:string,command?:MvpCommand):EntityVersions {
  if(!record.entityVersions)throw new Error('Faltan las versiones autoritativas de la aldea.');
  const ownIds=new Set(Object.values(record.world.players).filter(p=>p.ownerId===ownerId).map(p=>p.id));
  const keys=new Set<string>(['politicas',`identidad:cuenta:${ownerId}`,`cuenta:${ownerId}`,`lectura:privada:${ownerId}`,`aldea:${playerId}`,`trabajos:${playerId}`,`actividad:${playerId}`,`cartera:${playerId}`,`identidad:jugador:${playerId}`,`indice:batallas:${playerId}`]);
  for(const key of Object.keys(record.entityVersions)){
    // Shared state is deliberately broad until individual industrial/political
    // reads have been narrowed. Versions are persistent, including tombstones.
    if(/^(?:recurso:|indice:extraccion:|mapa:|npc:|transporte:|clan:|retiro:|proyecto:|alianza:|puesto:|financiacion:|temporada:|oferta:|contrato:)/.test(key))keys.add(key);
    if(/^(?:indice:membresia:|indice:alianzas:|indice:puestos:|indice:proyecto:|indice:clanes:)/.test(key))keys.add(key);
    if(key.startsWith('trabajo:')){const job=record.world.jobs[key.slice('trabajo:'.length)];if(job&&ownIds.has(job.playerId))keys.add(key);}
    if(key.startsWith('convoy:')&&record.world.convoys[key.slice('convoy:'.length)]?.playerId===playerId)keys.add(key);
  }
  if(command){
    const commandKeys=commandVersionKeys(record.world,ownerId,command);
    if(!commandKeys&&!LOCAL_COMMANDS.has(command.type))throw new Error('La operación no tiene un ámbito de aldea verificado.');
    for(const key of commandKeys??[]){
      keys.add(key);
      if(key.startsWith('aldea:')){const other=record.world.players[key.slice('aldea:'.length)];if(other){keys.add(`cuenta:${other.ownerId}`);keys.add(`identidad:cuenta:${other.ownerId}`);}}
    }
  }
  return Object.fromEntries([...keys].sort().map(key=>[key,record.entityVersions![key]??0]));
}
