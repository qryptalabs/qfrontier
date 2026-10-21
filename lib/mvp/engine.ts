import {settleTavernSupply,tavernUnloading} from './city-tavern.ts';
import {settleShopHandling,shopHandlingBusy} from './city-shop-handling.ts';
import {settleShopLoading} from './city-shop-production-data.ts';
import {advanceHabitableManagerHistory,reconcileHabitableManagers,wakeHabitableManagers,getManagerApprovalReservations} from './habitable-manager.ts';
import {getHabitableManagerForecast} from './habitable-manager-forecast.ts';
import {getHabitableNetworkView,getHabitableNetworkVisual} from './habitable-network.ts';
import type {HabitableNetworkView} from './habitable-network.ts';
import {settleHabitableConstruction} from './habitable-construction.ts';
import { createMvpWorld, weatherFor } from './world.ts';
import { dispatchProduction, settleProduction } from './production.ts';
import { dispatchSocial, getSocialView, settleSocial } from './social.ts';
import { dispatchTerritory, settleTerritory } from './territory.ts';
import { ITEM_CATALOG, RECIPE_CATALOG } from './catalog.ts';
import {HABITABLE_PLANTER_INPUTS} from './habitable-data.ts';
import {settleExplorationTraffic} from './exploration-traffic.ts';
import { getStationUpgradeVisuals } from './station-upgrades.ts';
import type { Context, ItemId, MvpCommand, MvpWorld, Player } from './types.ts';
import type { ActionQuote, AdminView, MvpView, PublicPlayer } from './view.ts';
import type { MvpStore, MvpRecord } from './store.ts';
import {advanceEntityVersions,commandVersionKeys,selectEntityVersions} from './entity-versions.ts';
import type {EntityVersions} from './entity-versions.ts';
import type {HabitableView} from './habitable.ts';
import { normalizeSettlements, normalizeStarterProtection, starterProtection } from './settlements.ts';
import { dispatchHabitable, settleHabitable, getHabitableView, guardHabitableCommand } from './habitable.ts';
import { habitableStateWithVisuals } from './habitable-buildings.ts';
import { settleHabitableSupplies } from './habitable-supplies.ts';
import { settleHabitableIndustry } from './habitable-industry.ts';
import { settleHabitableCommerce } from './habitable-commerce.ts';
import { settleHabitableDaily } from './habitable-daily.ts';
import { settleHabitableShedUpgrades } from './habitable-shed-upgrades.ts';
import { getPlayerProgress, getPlayerReports } from './player-progress.ts';
import { getActivityProgression } from './activity-progression.ts';
import { getLevelUnlocks } from './level-unlocks.ts';
import { getTestBoostsView, guardTestBoostCommand, jobTestBoost, testBoostQuote } from './test-boosts.ts';
import { getFirstTradeView } from './first-trade.ts';
import {dispatchLandExpansion,settleLandExpansion,getLandView} from './land-expansion.ts';
import {landMaintenance} from './land-grid.ts';
import {beginVillageOperation} from './operation-ids.ts';
import {villageTarget,villageReadVersions} from './village-execution.ts';
import type {VillageSnapshot} from './village-snapshot.ts';
import {attachVillageEvidence,getVillageEvidence} from './village-evidence.ts';

export class MvpServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) { super(message); this.name = 'MvpServiceError'; this.status = status; }
}
const ATTEMPTS = 16;
const clone = <T>(value: T): T => structuredClone(value);
// Bounded snapshots carry a separate authority contract. They never enter the
// whole-world writer, coordinate normalizer or global view projector.
type ExecutionRecord = MvpRecord | VillageSnapshot;
const isVillage = (record:ExecutionRecord):record is VillageSnapshot => 'kind' in record&&record.kind==='village';
const stateOf = (record:ExecutionRecord):MvpWorld => isVillage(record)?record.state:record.world;
function cloneState(record:ExecutionRecord):MvpWorld {
  const state=clone(stateOf(record));
  if(isVillage(record))attachVillageEvidence(state,record.scope);
  return state;
}
function executionTarget(store:MvpStore,record:ExecutionRecord,ownerId:string,playerId?:string,command?:MvpCommand,now=Date.now()):string|undefined {
  return isVillage(record)?record.scope.playerId:villageTarget(store,record,ownerId,playerId,command,now);
}

function requireOwner(ownerId: string) {
  if (!ownerId || ownerId.length > 256) throw new MvpServiceError('Inicia sesión para entrar.', 401);
}
function actorFor(world: MvpWorld, ownerId: string, id?: string): Player | null {
  if (!id) return null;
  const player = Object.hasOwn(world.players, id) ? world.players[id] : null;
  if (!player || player.ownerId !== ownerId) throw new MvpServiceError('Ese explorador no pertenece a tu cuenta.', 403);
  return player;
}
function selectedId(world: MvpWorld, ownerId: string, command?: MvpCommand, requested?: string, requestId?: string) {
  if (requested) { actorFor(world, ownerId, requested); return requested; }
  if (command?.type === 'player.create') {
    const created = requestId ? world.players[`p_${requestId}`] : undefined;
    if (created?.ownerId === ownerId) return created.id;
    return Object.values(world.players).filter(p => p.ownerId === ownerId).at(-1)?.id;
  }
  if (command?.playerId) { actorFor(world, ownerId, command.playerId); return command.playerId; }
  const own = Object.values(world.players).filter(p => p.ownerId === ownerId);
  return command?.type === 'player.create' ? own.at(-1)?.id : own[0]?.id;
}
function apply(world: MvpWorld, ownerId: string, command: MvpCommand, requestId: string, now: number, playerId?:string) {
  guardTestBoostCommand(command);
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new MvpServiceError('Identificador de acción inválido.', 400);
  const actor = actorFor(world, ownerId, command.playerId);
  if (!actor && command.type !== 'player.create' && !command.type.startsWith('admin.') && !command.type.startsWith('season.')) {
    throw new MvpServiceError('Selecciona tu explorador para realizar esta acción.', 400);
  }
  const context: Context = { ownerId, requestId, now, actor };
  if(actor&&(shopHandlingBusy(actor,now)||tavernUnloading(actor,now))&&['habitat.walk','habitat.walk.input','habitat.explore.start','habitat.explore.walk','habitat.explore.return','world.travel','convoy.start'].includes(command.type))throw new MvpServiceError('Espera a que termine la carga o descarga del transporte.',409);
  guardHabitableCommand(world,command,now);
  if (!dispatchLandExpansion(world,command,context) && !dispatchHabitable(world,command,context) && !dispatchProduction(world, command, context) && !dispatchTerritory(world, command, context) && !dispatchSocial(world, command, context)) {
    throw new MvpServiceError('Esta orden no existe.', 400);
  }
  if(command.type==='player.create'&&command.referralCode!==undefined&&command.referralCode!==''){
    const created=world.players[`p_${requestId}`];
    if(!created||created.ownerId!==ownerId)throw new MvpServiceError('No se pudo identificar el nuevo explorador para vincular la invitación.',409);
    dispatchSocial(world,{type:'referral.bind',playerId:created.id,parentId:command.referralCode},{ownerId,requestId,now,actor:created});
  }
  if(command.type==='habitat.walk.input')settleExplorationTraffic(world,now,String(command.playerId));
  else{
    if(command.type==='habitat.walk'||command.type==='habitat.explore.walk'||command.type==='habitat.explore.stop')settleExplorationTraffic(world,now,String(command.playerId));
    wakeHabitableManagers(world,now,playerId);
  }
}
function advance(world: MvpWorld, now: number, playerId?:string) {
  settleExplorationTraffic(world,now);
  const scope=playerId===undefined?undefined:{playerId};
  advanceHabitableManagerHistory(world,now,playerId);
  if(playerId===undefined)normalizeSettlements(world);
  normalizeStarterProtection(world,now,playerId);
  settleLandExpansion(world,now,playerId);
  settleHabitableShedUpgrades(world,now,playerId);
  settleHabitableConstruction(world,now,scope);settleHabitableSupplies(world,now,scope);
  settleProduction(world, now,undefined,playerId);
  settleHabitableCommerce(world,now,playerId);
  settleHabitableDaily(world,now,playerId);
  settleHabitable(world,now,playerId);
  settleHabitableIndustry(world,now,playerId);
  settleSocial(world, now,playerId);
  settleTerritory(world, now,playerId);
  reconcileHabitableManagers(world,now,playerId);
  for(const p of Object.values(world.players))if(playerId===undefined||p.id===playerId){settleShopLoading(p,now);settleShopHandling(world,p,now);settleTavernSupply(world,p,now);}
}
async function fingerprint(command: MvpCommand) {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : value;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalize(command))));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function current(store: MvpStore, ownerId: string, now: number, playerId?:string, command?:MvpCommand, requestId?:string):Promise<ExecutionRecord> {
  requireOwner(ownerId);
  if(store.capabilities?.villageReads&&store.readVillage){
    let completed=0,conflicts=0;
    for(;;){
      const village=await store.readVillage({ownerId,playerId:playerId??command?.playerId,now,command,requestId});
      if(village)return village;
      if(!store.readVillageMaintenance||!store.commitVillageMaintenance)break;
      // Shared leases are completed as an ordinary scoped read by their real
      // participant. This internal authority cannot issue commands or project a
      // neighbor's private state into the requesting account's response.
      if(completed>=8||conflicts>=ATTEMPTS)throw new MvpServiceError('Hay reservas compartidas terminando. Actualiza en unos segundos.',503);
      const maintenance=await store.readVillageMaintenance({ownerId,playerId:playerId??command?.playerId,now});
      if(!maintenance)break;
      if(maintenance.kind==='village-maintenance-retry'){conflicts++;continue;}
      const next=cloneState(maintenance.snapshot);
      beginVillageOperation(next);
      advance(next,now,maintenance.snapshot.scope.playerId);
      if(JSON.stringify(next)===JSON.stringify(maintenance.snapshot.state))throw new MvpServiceError('No se pudo conciliar una reserva compartida. Intenta de nuevo.',503);
      if(await store.commitVillageMaintenance(maintenance,next))completed++;else conflicts++;
    }
  }
  let record = await store.read();
  if (!record) { await store.insert(createMvpWorld(ownerId, now)); record = await store.read(); }
  if (!record) throw new MvpServiceError('No se pudo abrir la región. Intenta de nuevo.', 503);
  return record;
}
function adminView(world: MvpWorld): AdminView {
  const totals = new Map<string, AdminView['deposits'][number]>();
  for (const tile of Object.values(world.tiles)) for (const deposit of tile.deposits) {
    const total = totals.get(deposit.itemId) ?? { itemId: deposit.itemId, budget: 0, remaining: 0, reserved: 0, extracted: 0 };
    for (const layer of deposit.layers) { total.budget += layer.budget; total.remaining += layer.remaining; total.reserved += layer.reserved; total.extracted += layer.extracted; }
    totals.set(deposit.itemId, total);
  }
  const jobs = Object.values(world.jobs);
  return {
    players: Object.keys(world.players).length,
    pendingJobs: jobs.filter(j => j.status === 'reserved' || j.status === 'running').length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
    receipts: Object.keys(world.receipts).length,
    deposits: [...totals.values()],
    farm: Object.values(world.regions).reduce((sum, r) => ({ budget: sum.budget + r.farmBudget, remaining: sum.remaining + r.farmRemaining }), { budget: 0, remaining: 0 }),
    rulesVersion: world.rulesVersion,
  };
}
export function buildMvpView(world: MvpWorld, revision: number, ownerId: string, now: number, id?: string, options?: {publicActors?: HabitableView['actors']}): MvpView {
  if(getVillageEvidence(world)&&(!options?.publicActors||world.adminOwnerId===ownerId))throw new MvpServiceError('La vista de aldea requiere su directorio público y un alcance privado válido.',503);
  const own = Object.values(world.players).filter(p => p.ownerId === ownerId);
  const player = id ? actorFor(world, ownerId, id) : own[0] ?? null;
  const activity=getActivityProgression(world,player,now);
  const boosts=getTestBoostsView(world,ownerId,now);
  for(const reward of boosts.passes.history){const entry=activity?.completions.find(c=>c.id===reward.activityId);if(entry)entry.result+=` Ganaste ${reward.charges} ${reward.charges===1?'pase de impulso':'pases de impulso'} para tu cuenta.`;}
  const ownIds = new Set(own.map(p => p.id));
  const networks=new Map<string,HabitableNetworkView>(),networkFor=(p:Player)=>{let value=networks.get(p.id);if(!value){value=getHabitableNetworkView(world,p,now);networks.set(p.id,value);}return value;};
  // Build the selected village's paths, workforce and visuals once. Each output
  // still owns its objects, so mutating one client slice cannot alter another.
  const habitable=getHabitableView(world,player,now,networks,options?.publicActors);
  const safePlayer = (source:Player):PublicPlayer => {const {ownerId:_owner,...rest}=source;void _owner;return {...clone(rest),...(source.habitable?{habitable:source.id===player?.id&&habitable.state?clone(habitable.state):habitableStateWithVisuals(world,source,now,getHabitableNetworkVisual(world,source,now,networkFor(source)))}:{}),starterProtection:starterProtection(world,source,now)};};
  const privatePlayers=own.map(safePlayer);
  return {
    publicWorks:{granaryDelivered:world.cityShops?.['paso-del-norte']?.granary?.delivered??0},revision, now,
    player: player ? clone(privatePlayers.find(value=>value.id===player.id)!) : null,
    players: privatePlayers,
    people: Object.values(world.players).map(p => ({ id: p.id, name: p.name, stationName: p.stationName, faction: p.faction })),
    settlements:Object.values(world.players).filter(p=>p.settlement).map(p=>{const construction=getStationUpgradeVisuals(world,p);return{id:p.settlement!.id,playerId:p.id,name:p.stationName,ownerName:p.name,faction:p.faction,clanName:world.social.clans.find(clan=>Object.hasOwn(clan.members,p.id))?.name??null,plot:clone(p.settlement!),buildings:clone(p.buildings),own:p.ownerId===ownerId,protectionUntil:starterProtection(world,p,now).endsAt,...(construction.length?{construction}:{})};}),
    tiles: Object.values(world.tiles).map(tile => ({ ...clone(tile), deposits: player?.surveyed.includes(tile.id) ? clone(tile.deposits) : [] })),
    regions: clone(Object.values(world.regions)),
    jobs: clone(Object.values(world.jobs).filter(job => ownIds.has(job.playerId))).map(job => {
      // Outcomes are private until resolution; revealing the roll would let a
      // player cancel expeditions until the preview predicts a rare find.
      delete job.payload.roll;
      return job;
    }),
    battles: clone(Object.values(world.battles).filter(b => ownIds.has(b.attackerId) || !!b.targetId && ownIds.has(b.targetId) || ownIds.has(String(world.jobs[b.jobId]?.payload.defenderPlayerId ?? '')))),
    convoys: clone(Object.values(world.convoys).filter(c => ownIds.has(c.playerId) || c.exposed)),
    events: clone(world.events),
    weather: Object.keys(world.regions).map(region => weatherFor(region, now)),
    forecast: Object.keys(world.regions).map(region => weatherFor(region, now + 6 * 3600000)),
    social: getSocialView(world, player, ownerId),
    habitable,
    progress:player?getPlayerProgress(world,player,now):null,
    reports:player?getPlayerReports(world,player,now):[],
    firstTrade:getFirstTradeView(world,player,now),
    activity,
    unlocks:getLevelUnlocks(world,player,now,activity?.progression),
    boosts,
    land:getLandView(world,player,now),
    admin: world.adminOwnerId === ownerId ? adminView(world) : null,
    seasonId: world.seasonId, rulesVersion: world.rulesVersion,
  };
}
function versionsAfter(record: ExecutionRecord, world: MvpWorld): EntityVersions | undefined {
  return record.entityVersions ? advanceEntityVersions(stateOf(record), world, record.entityVersions) : undefined;
}
async function projectedView(store: MvpStore, record: ExecutionRecord, ownerId: string, now: number, playerId?: string): Promise<MvpView> {
  if(isVillage(record)){
    if(!store.projectVillageView)throw new MvpServiceError('Falta el proyector de la aldea.',503);
    return store.projectVillageView(record,ownerId,now,playerId);
  }
  if(store.capabilities?.playerReads&&store.projectPlayerView)return store.projectPlayerView(record,ownerId,now,playerId);
  return buildMvpView(stateOf(record),record.revision,ownerId,now,playerId);
}
async function commitRecord(store:MvpStore,record:ExecutionRecord,next:MvpWorld,ownerId:string,now:number,playerId?:string,target?:string,command?:MvpCommand):Promise<ExecutionRecord|null>{
  if(isVillage(record)){
    if(!store.commitVillage)throw new MvpServiceError('Falta la autoridad de la aldea.',503);
    return store.commitVillage(record,next,{now,ownerId,playerId:record.scope.playerId});
  }
  if(target&&store.compareAndSwapVillage)return store.compareAndSwapVillage(record,next,{now,ownerId,playerId:target,readVersions:villageReadVersions(record,ownerId,target,command)});
  return await store.compareAndSwap(record.revision,next,{now,ownerId,playerId})?{revision:record.revision+1,world:next,entityVersions:versionsAfter(record,next)}:null;
}
/** Settle authoritative state without constructing and discarding a global view. */
async function settledRecord(store: MvpStore, ownerId: string, now: number, playerId?: string, command?:MvpCommand,requestId?:string): Promise<ExecutionRecord> {
  for(let attempt=0;attempt<ATTEMPTS;attempt++){
    const record=await current(store,ownerId,now,playerId,command,requestId),next=cloneState(record);
    if(playerId)actorFor(next,ownerId,playerId);
    const target=executionTarget(store,record,ownerId,playerId,command,now);
    if(target)beginVillageOperation(next);
    if(command?.type==='habitat.walk.input')settleExplorationTraffic(next,now);
    else advance(next,now,target);
    if(JSON.stringify(next)===JSON.stringify(stateOf(record)))return record;
    const committed=await commitRecord(store,record,next,ownerId,now,playerId,target,command);
    if(committed)return committed;
  }
  throw new MvpServiceError('La región está recibiendo muchas órdenes. Actualiza e inténtalo de nuevo.');
}
export async function settleMvpPlayer(store:MvpStore,ownerId:string,playerId:string,now:number){await settledRecord(store,ownerId,now,playerId);}
export async function readMvpView(store: MvpStore, ownerId: string, playerId?: string, now = Date.now()): Promise<MvpView> {
  requireOwner(ownerId);
  if(store.capabilities?.playerReads&&store.readPlayerView){const cached=await store.readPlayerView(ownerId,playerId,now);if(cached)return cached;}
  return projectedView(store,await settledRecord(store,ownerId,now,playerId),ownerId,now,playerId);
}
const authorizationBrand=Symbol('verified-mvp-quote');
export interface VerifiedQuoteAuthorization {
  readonly [authorizationBrand]: true;
  readonly ownerId: string; readonly requestId: string; readonly payloadHash: string;
  readonly revision: number; readonly expiresAt: number; readonly versions: Readonly<EntityVersions>;
}
function assertQuoteScope(store: MvpStore, record: ExecutionRecord, next: MvpWorld, ownerId: string, command: MvpCommand, requestId: string, payloadHash: string, expectedRevision: number | undefined, now: number, authorization: VerifiedQuoteAuthorization): void {
  if(authorization[authorizationBrand]!==true||authorization.ownerId!==ownerId||authorization.requestId!==requestId||authorization.payloadHash!==payloadHash||authorization.revision!==expectedRevision)throw new MvpServiceError('La cotización no corresponde a esta orden.',400);
  if(now>authorization.expiresAt)throw new MvpServiceError('La cotización venció. Revisa los costes de nuevo.');
  if(!store.capabilities?.entityVersions||!record.entityVersions)throw new MvpServiceError('Revisa la cotización con la versión actual de la región.');
  const keys=commandVersionKeys(next,ownerId,command),quoted=Object.keys(authorization.versions).sort();
  if(!keys||keys.length!==quoted.length||keys.some((key,index)=>key!==quoted[index]))throw new MvpServiceError('Los recursos de esta orden cambiaron. Revisa la cotización.');
  const effective=JSON.stringify(next)===JSON.stringify(stateOf(record))?record.entityVersions:versionsAfter(record,next)!;
  if(keys.some(key=>(effective[key]??0)!==authorization.versions[key]))throw new MvpServiceError('Tu aldea o un recurso de esta orden cambió. Revisa la cotización.');
}
export async function executeMvp(store: MvpStore, ownerId: string, command: MvpCommand, requestId: string, expectedRevision?: number, now = Date.now(), authorization?: VerifiedQuoteAuthorization): Promise<MvpView> {
  const payloadHash = await fingerprint(command);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const record = await current(store, ownerId, now,command.playerId,command,requestId);
    const next = cloneState(record);
    const target=executionTarget(store,record,ownerId,command.playerId,command,now);
    if(target)beginVillageOperation(next);
    if(command.type==='habitat.walk.input')settleExplorationTraffic(next,now);
    else advance(next, now,target);
    const key = `${ownerId}:${requestId}`;
    // A confirmed retry succeeds even if its original quote revision is old.
    if (Object.hasOwn(next.receipts, key)) {
      if (next.receipts[key] !== payloadHash) throw new MvpServiceError('Este identificador ya se usó con una orden diferente.');
      const id=selectedId(next,ownerId,command,undefined,requestId);
      if (JSON.stringify(next) === JSON.stringify(stateOf(record))) return projectedView(store,record,ownerId,now,id);
      const committed=await commitRecord(store,record,next,ownerId,now,id,target,command);
      if(committed)return projectedView(store,committed,ownerId,now,id);
      continue;
    }
    if(authorization)assertQuoteScope(store,record,next,ownerId,command,requestId,payloadHash,expectedRevision,now,authorization);
    else if (expectedRevision !== undefined && (expectedRevision !== record.revision || JSON.stringify(next) !== JSON.stringify(stateOf(record)))) throw new MvpServiceError('El mundo cambió desde la cotización. Actualiza y revisa la orden otra vez.');
    apply(next, ownerId, command, requestId, now,target);
    // Non-economic motion uses its bounded session/sequence tombstone for replay
    // protection. Four renewals per second must not grow the permanent ledger.
    if(command.type!=='habitat.walk.input')next.receipts[key] = payloadHash;
    const id=selectedId(next,ownerId,command,undefined,requestId);
    const committed=await commitRecord(store,record,next,ownerId,now,id,target,command);
    if(committed)return projectedView(store,committed,ownerId,now,id);
  }
  throw new MvpServiceError('La orden coincidió con otra operación. Revisa el estado y vuelve a intentarlo.');
}
const sums = (player: Player | null): Partial<Record<ItemId, number>> => {
  const result: Partial<Record<ItemId, number>> = {};
  for (const lot of player?.inventory ?? []) result[lot.itemId] = (result[lot.itemId] ?? 0) + lot.qty;
  return result;
};
export async function quoteMvp(store: MvpStore, ownerId: string, command: MvpCommand, requestId: string, now = Date.now()): Promise<ActionQuote> {
  // Resolve due jobs first. Quotes and confirmed commands use exactly the same
  // domain functions, while only confirmation can reserve or transfer anything.
  const record = await settledRecord(store, ownerId, now, command.playerId,command,requestId);
  const next = cloneState(record);
  const target=executionTarget(store,record,ownerId,command.playerId,command,now);
  if(target)beginVillageOperation(next);
  const beforePlayer = actorFor(stateOf(record), ownerId, command.playerId);
  const before = sums(beforePlayer);
  apply(next, ownerId, command, requestId, now,target);
  const afterPlayer = actorFor(next, ownerId, selectedId(next, ownerId, command, undefined, requestId));
  const after = sums(afterPlayer);
  const beforeAccount = beforePlayer ? stateOf(record).social.accounts[beforePlayer.id] ?? { credits: 0, boundCredits: 50, simUnits: 1000 } : { credits: 0, boundCredits: 0, simUnits: 0 };
  const afterAccount = afterPlayer ? next.social.accounts[afterPlayer.id] ?? { credits: 0, boundCredits: 50, simUnits: 1000 } : { credits: 0, boundCredits: 0, simUnits: 0 };
  const items = new Set([...Object.keys(before), ...Object.keys(after)] as ItemId[]);
  const jobs = Object.values(next.jobs).filter(job => !Object.hasOwn(stateOf(record).jobs, job.id));
  const expectedOutputs = jobs.flatMap(job => {
    if (job.kind === 'extract') return [{ itemId: String(job.payload.itemId), qty: Number(job.payload.qty) }];
    if (job.kind === 'farm') return [{ itemId: 'grain', qty: 3 }, { itemId: 'biomass', qty: 1 }];
    if (job.kind === 'craft') return (RECIPE_CATALOG[job.payload.recipeId as ItemId]?.output ?? []).map(output => ({ itemId: output.itemId as string, qty: output.qty * Number(job.payload.qty) }));
    if(job.kind==='land'&&job.payload.landOperation==='demolish')return(job.payload.recovery as {itemId:string;qty:number}[]??[]).map(l=>({itemId:l.itemId as string,qty:l.qty}));
    return [];
  });
  const changes = [...items].map(itemId => ({ itemId, delta: (after[itemId] ?? 0) - (before[itemId] ?? 0) })).filter(item => item.delta !== 0);
  const supplyCargo=afterPlayer?.habitable?.buildings.flatMap(b=>jobs.some(j=>j.id===b.supply?.jobId)?b.supply?.cargo??[]:[])??[];
  // Warehouse inputs leave that warehouse, so a station-only delta would hide the cost.
  for(const lot of supplyCargo){const line=changes.find(c=>c.itemId===lot.itemId);if(line)line.delta-=lot.qty;else changes.push({itemId:lot.itemId,delta:-lot.qty});}
  if(command.type==='habitat.trade.dispatch'){
    const trade=afterPlayer?.habitable?.commerce?.contracts.find(c=>c.status==='in_transit'&&c.buildingId===command.buildingId);
    for(const lot of trade?.cargo??[]){const line=changes.find(c=>c.itemId===lot.itemId);if(line)line.delta-=lot.qty;else changes.push({itemId:lot.itemId,delta:-lot.qty});}
  }
  if(command.type==='habitat.build'&&command.supplyShedId!==undefined)for(const b of afterPlayer?.habitable?.buildings??[])if(!beforePlayer?.habitable?.buildings.some(old=>old.id===b.id))for(const lot of b.construction?.cargo??[]){const line=changes.find(c=>c.itemId===lot.itemId);if(line)line.delta-=lot.qty;else changes.push({itemId:lot.itemId,delta:-lot.qty});}
  if(command.type==='habitat.daily.start')for(const lot of afterPlayer?.habitable?.daily?.journey.cargo??[]){const line=changes.find(c=>c.itemId===lot.itemId);if(line)line.delta-=lot.qty;else changes.push({itemId:lot.itemId,delta:-lot.qty});}
  if(command.type==='habitat.facility.cancel'){
    const old=beforePlayer?.habitable?.buildings.find(b=>b.id===command.buildingId)?.supply,newSupply=afterPlayer?.habitable?.buildings.find(b=>b.id===command.buildingId)?.supply;
    if(old&&old.cancelledAt===undefined&&newSupply?.cancelledAt!==undefined)for(const lot of old.cargo){const line=changes.find(c=>c.itemId===lot.itemId);if(line)line.delta+=lot.qty;else changes.push({itemId:lot.itemId,delta:lot.qty});}
  }
  const warnings = ['Las cantidades se comprueban de nuevo al confirmar.'];
  const managerPlan=afterPlayer?.habitable?.manager;
  const managerAction=command.type.startsWith('habitat.manager.');
  const managerSummaries:Record<string,string>={start:'Autorizar turno del encargado',resume:'Autorizar otro turno del encargado',pause:'Pausar nuevas órdenes del encargado','approve-build':'Aprobar un plano para el encargado','revoke-build':'Retirar un plano pendiente'};
  const managerTurnAction=command.type==='habitat.manager.start'||command.type==='habitat.manager.resume';
  const amountsText=(amounts:readonly {itemId:ItemId;qty:number}[])=>amounts.map(i=>`${i.qty} ${ITEM_CATALOG[i.itemId].name}`).join(' + ');
  if(managerTurnAction&&managerPlan){
    warnings.push(`Autorizas un turno de ${Number(command.durationMinutes)} minutos, hasta ${managerPlan.turn.maxOrders} órdenes nuevas y ${managerPlan.turn.inputBudget} unidades de insumos comprometidas. Cada orden iniciada y sus materiales o extracción reservados cuentan contra estos límites. Apartar existencias para un plano no inicia la obra ni consume este presupuesto todavía. Este inicio no descuenta materiales por adelantado.`);
    const priorities={food:'Alimentos → Construcción → Almacenamiento',construction:'Construcción → Alimentos → Almacenamiento',stock:'Almacenamiento → Alimentos → Construcción'};
    warnings.push(`Prioridad del encargado: ${priorities[managerPlan.priority??'food']}. Cambia el orden de elección entre trabajos elegibles; no interrumpe órdenes ni transportes iniciados y no amplía el presupuesto.`);
    if(managerPlan.reserveBuildMaterials)warnings.push('Autorizas apartar lotes reales del cobertizo para cada plano pendiente, por orden de aprobación y después de respetar los mínimos. Esas unidades siguen dentro del stock y quedan protegidas frente a retiros, ventas y otros trabajos. No son un consumo ni una orden nueva; cuentan contra los límites cuando se inicia la obra. Al pausar se mantienen; retirar el plano o desactivar esta política al autorizar otro turno libera sólo lo que no salió hacia la obra. La caducidad y la procedencia se conservan.');
    else warnings.push('Las reservas de materiales por obra están desactivadas. Los planos no apartan existencias antes de iniciarse; al confirmar esta política se liberan las asignaciones pendientes, sin cancelar cargas ni construcciones en marcha.');
    if(managerPlan.urgentTransport)warnings.push(managerPlan.parallel?'El transportista selecciona las salidas pendientes por su utilidad para la prioridad elegida; las cargas que esperan dos minutos ganan preferencia. Si un lote no tiene ruta o capacidad, revisa otra entrega viable. Nunca cambia un viaje ya asignado ni duplica una carga.':'La preferencia de entregas por urgencia está autorizada; necesita el transportista del modo paralelo para aplicarse. Este turno conserva el transporte de sus productores.');
    else warnings.push('El transporte conserva el orden de finalización de las producciones; no se activa el despacho por urgencia.');
    warnings.push(`Metas de existencias en el cobertizo: ${Object.entries(managerPlan.goals).map(([itemId,qty])=>`${qty} ${ITEM_CATALOG[itemId as ItemId].name}`).join(', ')}. Se cuentan los productos almacenados y las entregas en camino; las metas no garantizan la producción si faltan recursos, espacio, tiempo o rutas.`);
    for(const id of ['ration','plank','cloth'] as const)if(managerPlan.goals[id]>0||managerPlan.approvals.some(a=>a.status==='approved'&&a.costs.some(i=>i.itemId===id))){const recipe=RECIPE_CATALOG[id]!;warnings.push(`${recipe.name}: cada ciclo compromete ${amountsText(recipe.inputs)}. Los traslados y el trabajo conservan sus tiempos y sus recursos reales.`);}
    if(managerPlan.planterId)warnings.push(`Reponer grano usa ${amountsText(HABITABLE_PLANTER_INPUTS)} por cultivo y conserva las cuotas agrícolas existentes.`);
    const minimums=Object.entries(managerPlan.reserves??{}).filter(([,qty])=>Number(qty)>0).map(([itemId,qty])=>({itemId:itemId as ItemId,qty:Number(qty)}));
    warnings.push(minimums.length?`Reservas mínimas de este encargado: ${amountsText(minimums)}. Cada orden automática debe dejar ese mínimo en el cobertizo. No son una inmovilización para tus acciones manuales ni una compra de recursos faltantes.`:'Este turno no configura reservas mínimas adicionales; siguen vigentes las reservas reales de las órdenes y transportes.');
    if(managerPlan.replenishFarmInputs){
      warnings.push('Autorizas fabricar semillas y nutrientes para la siguiente cosecha necesaria, dentro del mismo plazo, máximo de órdenes y tope de insumos. Sólo se usan materiales reales del cobertizo por encima de tus reservas mínimas.');
      for(const id of ['seed','nutrient'] as const){const recipe=RECIPE_CATALOG[id]!;warnings.push(`${recipe.name}: cada ciclo compromete ${amountsText(recipe.inputs)}. La receta debe estar desbloqueada y el trabajador, la ruta y el destino disponibles.`);}
      warnings.push('La reposición no vuelve autosuficiente al bancal: cada cosecha aporta una biomasa y fabricar un nutriente consume tres. Agua y biomasa adicionales requieren abastecimiento real.');
    }else warnings.push('La reposición de semillas y nutrientes está desactivada en este turno. Si faltan para una cosecha, el encargado espera abastecimiento.');
    if(managerPlan.woodlotId&&managerPlan.forestry){
      const forest=managerPlan.forestry,tile=next.tiles[forest.tileId];
      warnings.push(`Autorizas hasta ${forest.maxTimber} maderas del yacimiento ${tile?.name??forest.tileId}, capa ${forest.layerId}, mediante tu puesto forestal elegido. No se descuenta ni se regenera madera al autorizar: cada extracción reserva existencias finitas y conserva las cuotas y ranuras de la cuenta.`);
      warnings.push('Cada extracción cuenta como una orden y cada madera reservada cuenta en el mismo tope de ochenta unidades, además de los materiales que comprometan las fabricaciones y obras posteriores. La extracción se registra separada del consumo del cobertizo en el balance. El encargado no cambia de yacimiento automáticamente.');
    }
    if(managerPlan.sawmillId)warnings.push('Los tablones del plan se fabrican en el aserradero seleccionado: dos maderas por un tablón y sesenta segundos de trabajo por ciclo, más suministro y entrega. Cada ciclo cuenta como una orden. No se crea un pedido industrial autorrenovable ni se cambia a la mesa si ese aserradero está bloqueado.');
    if(managerPlan.parallel)warnings.push('Autorizas hasta dos órdenes simultáneas, compartiendo el máximo de órdenes, el presupuesto y el plazo de este turno. El habitante transportista elegido queda reservado: recoge las salidas de las instalaciones, las entrega al cobertizo elegido y regresa antes de otra carga. Los productores siguen abasteciendo sus propios insumos. La pausa permite terminar ambas órdenes y sus viajes.');
    else warnings.push('El plan inicia una orden a la vez; las instalaciones industriales elegidas conservan ese mismo límite.');
    if(managerPlan.operator){
      const operator=managerPlan.operator,resident=afterPlayer?.habitable?.workforce?.residents.find(r=>r.id===operator.residentId),jobs={woodlot:'puesto forestal',sawmill:'aserradero'};
      warnings.push(`Operador polivalente autorizado: ${resident?.name??operator.residentId}. Permisos: ${operator.allowedJobs.map(job=>jobs[job]).join(' y ')}. Puesto preferido: ${jobs[operator.preferredJob]}. La prioridad y los materiales disponibles determinan el trabajo; la preferencia sólo desempata opciones equivalentes.`);
      warnings.push('El operador camina entre los puestos elegidos y no produce antes de llegar. Espera la entrega y el regreso del trabajo anterior; no sustituye al trabajador de la mesa ni al transportista. El desplazamiento ocupa una de las ranuras compartidas y no amplía los límites. Al pausar o vencer el turno, termina lo comprometido y regresa caminando a su puesto o punto original; permanece reservado hasta llegar. Una ruta bloqueada deja el cambio en espera.');
    }else warnings.push('El operador polivalente está desactivado. Los habitantes conservan sus puestos y no se autorizan cambios automáticos de trabajo.');
    warnings.push('El encargado sigue la prioridad autorizada entre las tareas disponibles. No usa impulsos, no renueva la jornada de alimentación, no compra ni vende y no crea deudas al ausentarte.');
    warnings.push('El servidor concilia las tareas autorizadas al atender consultas o acciones, hasta el cierre de este turno. Una orden ya iniciada puede terminar su trabajo y entrega después; no se autorizan ciclos nuevos fuera del plazo.');
  }
  if(command.type==='habitat.manager.pause')warnings.push('Impide iniciar nuevas órdenes del encargado. Los trabajos, materiales y transportes que ya estaban comprometidos terminan con sus horarios actuales; la pausa no devuelve ni duplica insumos. El operador polivalente, si está autorizado, regresa caminando a su puesto o punto original antes de quedar libre. Reanudar requiere revisar otro turno y sus límites.');
  if(command.type==='habitat.manager.approve-build'&&managerPlan){
    const oldApprovals=new Set(beforePlayer?.habitable?.manager?.approvals.map(a=>a.id)??[]),approval=managerPlan.approvals.find(a=>!oldApprovals.has(a.id));
    if(approval){warnings.push(`Apruebas un plano en X ${approval.x}, Y ${approval.y}, girado ${approval.rotation*90} grados, por ${amountsText(approval.costs)}. No se inicia la construcción ni se consumen materiales al aprobar.`);if(managerPlan.reserveBuildMaterials&&afterPlayer){const rows=getManagerApprovalReservations(afterPlayer,managerPlan,approval,now),held=rows.filter(r=>r.reserved>0).map(r=>({itemId:r.itemId,qty:r.reserved})),missing=rows.filter(r=>r.missing>0).map(r=>({itemId:r.itemId,qty:r.missing}));warnings.push(`Reserva para esta obra: ${held.length?amountsText(held):'sin materiales disponibles para apartar'}. ${missing.length?`Pendiente de abastecimiento: ${amountsText(missing)}.`:'Todos sus materiales están apartados.'} Permanecen en el cobertizo y sólo este plano puede usarlos mientras conserve su autorización.`);}else warnings.push('Este plan no tiene activadas las reservas por obra: aprobar todavía no aparta sus materiales.');}
    warnings.push('El encargado podrá preparar tablones y tejido para este plano. Al iniciar la obra comprueba de nuevo terreno, nivel, capacidad, materiales, ruta y constructor; su coste y su orden deben caber en el turno autorizado. Los demás insumos deben existir en el cobertizo.');
    warnings.push('La aprobación permanece pendiente hasta que se pueda ejecutar o la retires. Si el turno está detenido tendrás que autorizar otro; aprobar el plano no renueva el turno.');
  }
  if(command.type==='habitat.manager.revoke-build')warnings.push('Retira únicamente este plano pendiente y libera sus asignaciones vigentes dentro del cobertizo, sin crear ni devolver lotes duplicados. Una obra que ya comenzó conserva su construcción y sus materiales.');
  const reservation=jobs.map(jobTestBoost).find(value=>value!==null),boostBudget=getTestBoostsView(stateOf(record),ownerId,now),boost=reservation?testBoostQuote(reservation,boostBudget):null;
  const afterPasses=getTestBoostsView(next,ownerId,now).passes,earnedPasses=afterPasses.earned-boostBudget.passes.earned,previousRewardIds=new Set(boostBudget.passes.history.map(r=>r.id)),boostReward=earnedPasses>0?{charges:earnedPasses,rewards:afterPasses.history.filter(r=>!previousRewardIds.has(r.id))}:null;
  if(boost)warnings.push(`Impulso de prueba: usa un pase de tu cuenta y pasa de ${boost.baseSeconds} a ${boost.durationSeconds} segundos; reserva ${boost.savedSeconds} segundos del límite de treinta minutos en las últimas veinticuatro horas. La cola y los traslados no se aceleran; los insumos, productos y experiencia por orden son iguales. Cancelar no devuelve el pase ni el ahorro reservado.${boost.partial?' Se aplica sólo el ahorro que queda disponible.':''}`);
  if(boostReward)warnings.push(`Esta acción confirmada otorga ${boostReward.charges} ${boostReward.charges===1?'pase de impulso':'pases de impulso'} a tu cuenta. No hay que reclamarlos ni pagarlos.`);
  if(command.type==='craft.start'&&command.transferableOnly===true)warnings.push('Esta fabricación reserva únicamente insumos transferibles. Los lotes vinculados del tutorial permanecen en tu inventario; el producto conserva la procedencia de los materiales utilizados.');
  if (command.type === 'craft.cancel' || command.type === 'job.cancel') {
    const job = stateOf(record).jobs[String(command.jobId)];
    if (job && job.startsAt <= now) warnings.push('Este trabajo ya comenzó: cancelar no devuelve los insumos consumidos ni entrega el producto pendiente.');
    else if (job) warnings.push('El trabajo sigue en cola: se devuelven los insumos reservados al cancelar.');
  }
  for (const job of jobs) if (Array.isArray(job.payload.modifiers)) for (const modifier of job.payload.modifiers) if (typeof modifier === 'string') warnings.push(modifier);
  if (jobs.some(job => job.costs.some(lot => lot.bound))||supplyCargo.some(lot=>lot.bound)) warnings.push('Los insumos de tutorial conservan la condición de vinculados en sus productos.');
  if (command.type === 'credit.service' && afterAccount.boundCredits < beforeAccount.boundCredits) warnings.push('El servicio usa créditos de tutorial: el equipo reparado quedará vinculado a tu estación.');
  if (/^(funding|reward|season)\./.test(command.type)) warnings.push('QRYP simulado de pruebas. Esta orden no mueve dinero ni tokens reales.');
  if(command.type==='habitat.job.accept')warnings.push('Se reservan 16 créditos del presupuesto NPC existente y cuatro maderas de un yacimiento forestal; solo se paga al entregar dos tablones trazables.');
  if(command.type==='habitat.job.cancel')warnings.push('El pago reservado y la madera sin extraer vuelven a sus reservas. La madera ya extraída no se regenera; una fabricación iniciada sigue sus reglas.');
  if(command.type==='habitat.build'&&afterPlayer?.habitable?.buildings.at(-1)?.bound)warnings.push('La obra usa materiales vinculados de tu inventario y conserva esa condición; no cambia los niveles de edificios existentes.');
  if(command.type==='habitat.storage.deposit')warnings.push('Transferencia al cobertizo: estos lotes salen del inventario de estación. Puedes elegir este cobertizo como fuente en Producción; el habitante recoge sus insumos antes de trabajar. Se conservan procedencia, vinculación, desgaste y caducidad.');
  if(command.type==='habitat.storage.withdraw')warnings.push('Retiro del cobertizo al inventario de estación. No crea objetos ni renueva su caducidad o desgaste.');
  if(command.type==='habitat.planter.start')warnings.push('Consume un ciclo de los diez compartidos con el huerto original y una unidad del presupuesto agrícola de la región hogar. Al terminar, un obrero recoge la cosecha y la lleva a un cobertizo con espacio. Si falta destino o ruta segura, queda pendiente sin duplicarse.');
  if(command.type==='habitat.workbench.start')warnings.push('Una ranura independiente en esta mesa; usa los insumos y tiempos originales. Al terminar, un obrero recoge el producto y lo lleva al cobertizo. Los envíos reservan capacidad y los productos conservan su caducidad.');
  if(command.type==='habitat.logistics.retry')warnings.push('Reintenta una entrega pendiente sin fabricar ni cobrar de nuevo. El traslado necesita un cobertizo terminado, espacio libre y ruta segura.');
  if(supplyCargo.length)warnings.push('Los insumos indicados se reservan en el cobertizo elegido. El mismo habitante camina a recogerlos y vuelve a su puesto; la producción comienza al terminar esa entrega.');
  if(command.type==='habitat.facility.cancel')warnings.push('Un suministro en cola puede cancelarse antes de que el habitante salga, devolviendo los insumos a su cobertizo y el ciclo reservado. Durante el traslado debes esperar su llegada; cancelar una producción iniciada consume sus insumos y no entrega producto.');
  if(command.type==='habitat.residents.initialize')warnings.push('Registra a dos habitantes iniciales sin modificar tus edificios ni las órdenes que ya estaban en marcha. Después asigna los puestos desde Habitantes.');
  if(command.type==='habitat.resident.recruit')warnings.push('La vivienda terminada aloja a dos habitantes adicionales. La incorporación ocupa una plaza real de esa casa; asigna después un puesto para que trabaje.');
  if(command.type==='habitat.resident.assign'||command.type==='habitat.resident.unassign')warnings.push('Un habitante ocupa como máximo un puesto y no puede abandonarlo durante un trabajo o traslado. Camina entre sus ubicaciones al cambiar de asignación.');
  if(command.type==='building.upgrade')warnings.push('La cuadrilla trabaja durante un minuto por nivel actual. El edificio conserva su capacidad mientras dura la obra; el nuevo nivel se activa al terminar. Cancelar una obra iniciada consume sus materiales.');
  if(command.type==='habitat.woodlot.start')warnings.push(`Reserva ${Number(command.qty)} maderas de un yacimiento forestal existente. El leñador las extrae con su procedencia y las lleva al cobertizo; no se regeneran las reservas al completar el trabajo.`);
  if(command.type==='habitat.sawmill.order')warnings.push(`Objetivo: ${Number(command.target)} tablones, hasta ${Number(command.target)*2} maderas a lo largo del pedido. Ahora se reserva sólo el primer ciclo: dos maderas por un tablón en sesenta segundos, más traslados. Los ciclos siguientes empiezan después de entregar y regresar; si faltan insumos, espacio o una ruta segura, el pedido espera.`);
  if(command.type==='habitat.sawmill.stop')warnings.push('Detiene los ciclos futuros. El ciclo y la entrega que ya comenzaron terminan con sus materiales; no se pierde ni se devuelve producto por detener el pedido.');
  if(command.type==='habitat.sawmill.resume')warnings.push('Reanuda los ciclos pendientes con los mismos materiales, cantidades y reglas. El siguiente ciclo sólo comienza si tiene un trabajador y suministros disponibles.');
  if(command.type==='habitat.trade.accept')warnings.push('Valleverde reserva doce créditos y demanda por dos tablones del presupuesto NPC existente. No recibes el pago todavía. La carreta viene vacía a tu bahía; tienes treinta minutos para completar la entrega de tablones transferibles. Se habilita un camino de acceso sobre el terreno.');
  if(command.type==='habitat.trade.dispatch')warnings.push('Se reservan dos tablones transferibles del cobertizo. El conductor los recoge y la carreta vuelve a Valleverde por la ruta visible. Los doce créditos se pagan una sola vez al terminar la descarga; no se permite cancelar el cargamento en ruta.');
  if(command.type==='habitat.trade.cancel')warnings.push('La demanda y los doce créditos reservados vuelven al mercado. No se retiran tablones del cobertizo. La carreta continúa hasta una bahía segura y regresa vacía antes de atender otro encargo.');
  if(command.type==='habitat.daily.start')warnings.push('Reserva del cobertizo una ración por habitante y una madera por cada tres construcciones terminadas. El habitante elegido recoge, reparte y regresa a su puesto; la ración se consume al entregarla y habilita veinte minutos de jornada. Después vuelve al cobertizo para realizar el mantenimiento y consumir su madera. No se acumulan cobros atrasados ni se programan jornadas automáticas. Al vencer, los nuevos trabajos industriales esperan alimentos; agricultura, extracción básica y recetas de subsistencia siguen disponibles.');
  if(command.type==='habitat.daily.start'&&afterPlayer?.habitable){const extra=landMaintenance(afterPlayer.habitable);if(extra.extraRations||extra.extraTimber)warnings.push(`El terreno, los caminos y los puentes añaden ${extra.extraRations} raciones y ${extra.extraTimber} maderas al mantenimiento de esta jornada. Estos materiales también se reservan ahora y se consumen al terminar el mantenimiento en el cobertizo; no se cobran jornadas anteriores.`);}
  if(command.type==='habitat.shed.upgrade')warnings.push('Consume dos tablones, dos maderas y dos fibras de Estación para ampliar el cobertizo durante sesenta segundos. Conserva su ubicación y ochenta unidades de capacidad durante la obra; al terminar, el nivel dos admite ciento sesenta. Los lotes almacenados, las entregas y sus procedencias se conservan.');
  if(command.type==='habitat.land.explore')warnings.push('Explora casillas locales durante quince segundos; conocerlas no entrega propiedad, recursos ni experiencia adicional.');
  if(command.type==='habitat.land.clear')warnings.push('Consume una ración por lote y quince segundos por casilla. Retira solamente vegetación procedural al terminar; el despeje no crea madera ni piedra, no toca edificios, cantera, árboles protegidos ni cauces.');
  if(command.type==='habitat.land.claim')warnings.push(`Confirma derechos locales en treinta segundos dentro del anillo permitido por el Centro. ${command.method==='deed'?'El permiso consume veinticinco unidades SIM_QRYP de alfa; no mueve dinero ni tokens reales.':command.method==='achievement'?'El permiso de hazaña se utiliza una sola vez por cuenta y umbral de nivel.':'La colonización consume dos raciones y un tablón y requiere vivienda con habitantes.'} Las casillas y la parcela vecina conservan sus coordenadas. La próxima jornada que confirmés incorpora una ración y una madera por cada grupo de hasta ocho casillas exteriores; no hay cobros atrasados.`);
  if(command.type==='habitat.land.center.upgrade')warnings.push('El Centro conserva su nivel y capacidad actuales durante la obra. El nivel dos permite el anillo de veintitrés y ocho construcciones; el nivel tres permite veinticinco y diez. No altera los niveles de tus edificios originales ni entrega recursos.');
  if(command.type.startsWith('habitat.land.')||command.type==='habitat.building.demolish')warnings.push('Esta orden reserva una cuadrilla con ida, trabajo y regreso por rutas seguras. El plazo total incluye esos desplazamientos. Las órdenes territoriales anteriores conservan sus fechas originales; las obras civiles no multiplican recursos ni experiencia.');
  if(command.type==='habitat.land.road')warnings.push(`Construye ${Array.isArray(command.cellIds)?command.cellIds.length:0} tramos preparados por una piedra y diez segundos de trabajo cada uno, más desplazamientos. Cada tramo se habilita al terminar su trabajo; las rutas prefieren los caminos sin acelerar personas ni modificar los viajes económicos.`);
  if(command.type==='habitat.land.bridge')warnings.push('Construye exclusivamente la pasarela del Sendero Sur sobre el cruce validado, por dos tablones, dos maderas y dos piedras y sesenta segundos de trabajo más traslados. El paso se habilita al terminar el montaje; el agua sigue debajo. Añade una madera a la próxima jornada manual.');
  if(command.type==='habitat.building.demolish'){const job=jobs.find(j=>j.payload.landOperation==='demolish'),recovery=job?.payload.recovery as {qty:number;bound:boolean}[]??[];warnings.push(`El desmontaje retira esta construcción de forma permanente al terminar el trabajo y conserva su registro histórico. ${recovery.length?'La recuperación parcial indicada conserva el origen, vinculación, desgaste y caducidad de los insumos originales y llega a Estación al regresar la cuadrilla.':'Esta obra no tiene lotes originales recuperables registrados; se desmonta sin emitir materiales de origen inventado.'} El almacén debe estar vacío y sin habitantes, reservas ni rutas dependientes. Reconstruir este mismo tipo como reemplazo no vuelve a conceder experiencia.${recovery.some(l=>l.bound)?' Los materiales recuperados vinculados permanecen vinculados.':''}`);}
  if(command.type==='habitat.land.road'&&afterPlayer?.habitable){const beforeUpkeep=landMaintenance(beforePlayer?.habitable??{}),afterUpkeep=landMaintenance(afterPlayer.habitable),newCells=Array.isArray(command.cellIds)?command.cellIds.length:0,built=afterUpkeep.roads;warnings.push(`Cuando terminen estos tramos, la previsión de mantenimiento de caminos será ${Math.ceil((built+newCells)/8)} maderas por jornada manual, frente a ${Math.ceil(beforeUpkeep.roads/8)} antes de esta orden. No se cobran jornadas atrasadas.`);}
  if(command.type==='habitat.build'&&command.supplyShedId!==undefined)warnings.push('Reserva lotes reales del cobertizo para una sola obra. El mismo constructor recoge, transporta y descarga antes del trabajo; después regresa a su lugar. Conserva origen, vinculación y caducidad. No puede reasignarse hasta regresar; no hay cancelación con devolución duplicada.');
  const constructionEnds=command.type==='habitat.build'?afterPlayer?.habitable?.buildings.filter(b=>b.construction&&!beforePlayer?.habitable?.buildings.some(old=>old.id===b.id)).map(b=>b.construction!.crew.endsAt)??[]:[];
  const habitatEnds=afterPlayer?.habitable?.buildings.filter(b=>!beforePlayer?.habitable?.buildings.some(old=>old.id===b.id)).map(b=>b.endsAt)??[];
  const relocationEnds=afterPlayer?.habitable?.workforce?.residents.filter(r=>r.relocation&&JSON.stringify(r.relocation)!==JSON.stringify(beforePlayer?.habitable?.workforce?.residents.find(old=>old.id===r.id)?.relocation)).map(r=>r.relocation!.endsAt)??[];
  const tradeEnds=command.type.startsWith('habitat.trade.')?afterPlayer?.habitable?.commerce?.contracts.filter(c=>!beforePlayer?.habitable?.commerce?.contracts.some(old=>JSON.stringify(old)===JSON.stringify(c))).map(c=>c.caravan.returnTrip?.endsAt??c.caravan.delivery?.unloadsAt??c.caravan.approachEndsAt)??[]:[];
  const dailyEnds=command.type==='habitat.daily.start'?[afterPlayer?.habitable?.daily?.journey.endsAt??now]:[];
  const shedUpgradeEnds=command.type==='habitat.shed.upgrade'?[afterPlayer?.habitable?.buildings.find(b=>b.id===command.buildingId)?.upgrade?.endsAt??now]:[];
  const managerEnds=managerTurnAction&&managerPlan?[managerPlan.turn.endsAt]:[];
  const explorationEnds=command.type.startsWith('habitat.explore.')&&afterPlayer?.habitable?.exploration?.movement?[afterPlayer.habitable.exploration.movement.endsAt]:[];
  if(command.type.startsWith('habitat.explore.'))warnings.push('Recorrido terrestre de prueba: el servidor valida la ruta y sus tiempos; no entrega recursos, dinero ni experiencia y no permite trabajar a distancia. Las rutas marítimas y otras regiones todavía no están habilitadas.');
  const expiresAt=Math.min(now+60000,(Math.floor(now/21600000)+1)*21600000-1,...(boost&&boostBudget.nextReleaseAt!==null?[boostBudget.nextReleaseAt-1]:[]));
  return {
    revision: record.revision, requestId, command: clone(command), changes, expectedOutputs,boost,boostReward,
    ...(managerTurnAction&&afterPlayer?{managerForecast:getHabitableManagerForecast(next,afterPlayer,now)??undefined}:{}),
    durationSeconds: Math.max(0, ...jobs.map(job => Math.ceil((job.endsAt - now) / 1000)),...constructionEnds.map(end=>Math.ceil((end-now)/1000)),...habitatEnds.map(end=>Math.ceil((end-now)/1000)),...relocationEnds.map(end=>Math.ceil((end-now)/1000)),...tradeEnds.map(end=>Math.ceil((end-now)/1000)),...dailyEnds.map(end=>Math.ceil((end-now)/1000)),...shedUpgradeEnds.map(end=>Math.ceil((end-now)/1000)),...managerEnds.map(end=>Math.ceil((end-now)/1000)),...explorationEnds.map(end=>Math.ceil((end-now)/1000))),
    summary: managerAction?(managerSummaries[command.type.slice('habitat.manager.'.length)]??'Revisar encargado de producción'):`Revisar orden: ${command.type}`,
    creditDelta: afterAccount.credits - beforeAccount.credits,
    boundCreditDelta: afterAccount.boundCredits - beforeAccount.boundCredits,
    simDelta: afterAccount.simUnits - beforeAccount.simUnits,
    warnings,
    // Quotes end before the next six-hour weather window. Confirmation cannot
    // silently apply a different weather multiplier after a boundary.
    expiresAt,
    token: await signQuote(stateOf(record), ownerId, command, requestId, record.revision, expiresAt, store.capabilities?.entityVersions&&record.entityVersions?selectEntityVersions(stateOf(record),ownerId,command,record.entityVersions):null),
  };
}

async function quoteKey(world: MvpWorld) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(world.rngSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
// An old draft which never displayed the pass cost must be reviewed again.
// Confirmed receipts are handled first and retain their original result.
const quotePayload = (owner: string, command: MvpCommand, request: string, revision: number, expires: number) => new TextEncoder().encode(JSON.stringify({ owner, command, request, revision, expires,...(command.type.startsWith('habitat.manager.')?{managerPolicy:'bounded-operator-v5'}:{}),...(command.useTestBoost===true?{boostPassPolicy:'earned-v1'}:{}),...(command.type==='habitat.build'&&command.supplyShedId!==undefined?{constructionPolicy:'shed-supply-v1'}:{}),...(command.type.startsWith('habitat.land.')||command.type==='habitat.building.demolish'?{civilPolicy:'crews-v2'}:{}) }));
const MAX_QUOTE_TOKEN=8192;
function encodeScope(versions: EntityVersions): string | null {
  const entries=Object.entries(versions).sort(([a],[b])=>a<b?-1:a>b?1:0);
  if(!entries.length||entries.length>64||entries.some(([key,value])=>!key||key.length>256||!Number.isSafeInteger(value)||value<0))return null;
  const data=JSON.stringify({policy:'entities-v1',versions:Object.fromEntries(entries)});
  const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(data))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  return encoded.length+68<=MAX_QUOTE_TOKEN?encoded:null;
}
function decodeScope(encoded: string): EntityVersions {
  try{
    if(!/^[A-Za-z0-9_-]+$/.test(encoded)||encoded.length>MAX_QUOTE_TOKEN)throw new Error();
    const bytes=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!value||Object.keys(value).sort().join(',')!=='policy,versions'||value.policy!=='entities-v1'||!value.versions||typeof value.versions!=='object'||Array.isArray(value.versions)||encodeScope(value.versions)!==encoded)throw new Error();
    return value.versions as EntityVersions;
  }catch{throw new MvpServiceError('La cotización tiene un formato inválido.',400);}
}
const scopedQuotePayload=(owner:string,command:MvpCommand,request:string,revision:number,expires:number,scope:string)=>new TextEncoder().encode(JSON.stringify({policy:'entities-v1',legacyPayload:new TextDecoder().decode(quotePayload(owner,command,request,revision,expires)),scope}));
async function signQuote(world: MvpWorld, owner: string, command: MvpCommand, request: string, revision: number, expires: number, versions?: EntityVersions|null) {
  const scope=versions?encodeScope(versions):null;
  const signature = await crypto.subtle.sign('HMAC', await quoteKey(world), scope?scopedQuotePayload(owner,command,request,revision,expires,scope):quotePayload(owner, command, request, revision, expires));
  const hex=[...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return scope?`v2.${scope}.${hex}`:hex;
}
export async function validateMvpQuote(store: MvpStore, owner: string, command: MvpCommand, request: string, revision?: number, token?: string, expires?: number, now = Date.now()): Promise<VerifiedQuoteAuthorization|undefined> {
  const record = await current(store, owner, now,command.playerId,command,request);
  // Transport retries of an already committed order need no fresh quote.
  const payloadHash=await fingerprint(command);
  if (Object.hasOwn(stateOf(record).receipts, `${owner}:${request}`)) {
    if (stateOf(record).receipts[`${owner}:${request}`] !== payloadHash) throw new MvpServiceError('Este identificador ya se usó con una orden diferente.');
    return;
  }
  if (!Number.isSafeInteger(revision)||revision!<0||!token||token.length>MAX_QUOTE_TOKEN||!Number.isSafeInteger(expires)||expires!<=0) throw new MvpServiceError('Revisa la cotización antes de confirmar la orden.', 400);
  if (now > expires!) throw new MvpServiceError('La cotización venció. Revisa los costes de nuevo.');
  const parts=token.split('.'),scoped=parts.length===3&&parts[0]==='v2';
  const scope=scoped?parts[1]:null,hex=scoped?parts[2]:token;
  if(!/^[0-9a-f]{64}$/.test(hex)||!scoped&&parts.length!==1)throw new MvpServiceError('Revisa la cotización antes de confirmar la orden.',400);
  const versions=scope?decodeScope(scope):null;
  const bytes = Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16));
  const valid = await crypto.subtle.verify('HMAC', await quoteKey(stateOf(record)), bytes, scope?scopedQuotePayload(owner,command,request,revision!,expires!,scope):quotePayload(owner, command, request, revision!, expires!));
  if (!valid) throw new MvpServiceError('La cotización no corresponde a esta orden.', 400);
  if(versions){
    if(!store.capabilities?.entityVersions||!record.entityVersions)throw new MvpServiceError('Revisa la cotización con la versión actual de la región.');
    return Object.freeze({[authorizationBrand]:true as const,ownerId:owner,requestId:request,payloadHash,revision:revision!,expiresAt:expires!,versions:Object.freeze(versions)});
  }
}
