import type { Faction, MvpWorld } from './types.ts';
import type { HabitableTrade } from './habitable-commerce.ts';

export interface VillageIdentity { id: string; ownerId: string; name: string; stationName: string; faction: Faction }
export interface ExtractionReservationFact { id: string; playerId: string; ownerId: string; kind: 'extract'; status: 'running'|'reserved'; endsAt: number; payload: { tileId: string; itemId: string; qty: number } }
export interface VillageEvidence {
  /** An internal participant grant may settle its real selected village while
   * other leases remain due. It never authorizes a player command or a view. */
  mode?: 'maintenance';
  ownerId: string;
  playerId: string;
  profileIds: readonly string[];
  totalPlayerCount: number;
  identities: Readonly<Record<string, VillageIdentity>>;
  ledgerOrdinals: Readonly<Record<string, number>>;
  commerceFleet: readonly HabitableTrade[];
  extractionJobs: readonly ExtractionReservationFact[];
  nextSharedDueAt: number | null;
  playerOrdinals: Readonly<Record<string, number>>;
  sharedComplete: true;
  complete: { profiles: true; ownJobs: true; ownLedger: true; ownAccounts: true; resources: true; extractionJobs: true; sharedSocial: true; ownBattles: true; fleet: true };
}
const evidenceKey = Symbol('village-loaded-evidence');
type WithEvidence = { [evidenceKey]?: VillageEvidence };
export class VillageDependencyError extends Error {
  readonly code = 'VILLAGE_DEPENDENCY_MISSING';
  constructor(message: string) { super(message); this.name = 'VillageDependencyError'; }
}
const missing = (message: string): never => { throw new VillageDependencyError(message); };

/** Server-only proof of which account and shared collections were loaded. It is
 * never serialized into a save, a quote token, or a public player object. */
export function attachVillageEvidence(world: MvpWorld, evidence: VillageEvidence): void {
  const required = ['profiles', 'ownJobs', 'ownLedger', 'ownAccounts', 'resources', 'extractionJobs', 'sharedSocial', 'ownBattles', 'fleet'] as const;
  if (evidence.mode!==undefined&&evidence.mode!=='maintenance')missing('El contexto de aldea tiene una autoridad interna desconocida.');
  if (!evidence.ownerId || !evidence.playerId || evidence.sharedComplete !== true || required.some(key => evidence.complete?.[key] !== true)) missing('El contexto de aldea no tiene un cierre completo de dependencias.');
  const ids = Object.keys(world.players);
  if(!Number.isSafeInteger(evidence.totalPlayerCount)||evidence.totalPlayerCount<ids.length||Object.keys(evidence.identities).length!==evidence.totalPlayerCount)missing('El directorio de identidades públicas está incompleto.');
  if (!evidence.profileIds.includes(evidence.playerId) || ids.length !== evidence.profileIds.length || new Set(evidence.profileIds).size !== ids.length || ids.some(id => !evidence.profileIds.includes(id) || world.players[id].ownerId !== evidence.ownerId)) missing('Los perfiles cargados no corresponden al manifiesto completo de la cuenta.');
  for (const id of evidence.profileIds) if (evidence.identities[id]?.ownerId !== evidence.ownerId) missing('Falta la identidad autoritativa de un perfil propio.');
  for (const entry of world.social.ledger) if (!Number.isSafeInteger(evidence.ledgerOrdinals[entry.id]) || evidence.ledgerOrdinals[entry.id] < 0) missing('Falta el ordinal global de una entrada contable cargada.');
  Object.defineProperty(world, evidenceKey, { value: evidence, configurable: true });
}
export function getVillageEvidence(world: MvpWorld): VillageEvidence | undefined { return (world as WithEvidence)[evidenceKey]; }
/** Trials retain their original read authority even after new local appends. */
export function copyVillageEvidence(source: MvpWorld, destination: MvpWorld): void {
  const evidence = getVillageEvidence(source);
  if (evidence) Object.defineProperty(destination, evidenceKey, { value: evidence, configurable: true });
}
export function playerIdentity(world: MvpWorld, playerId: string): VillageIdentity | undefined {
  const player = Object.hasOwn(world.players, playerId) ? world.players[playerId] : undefined;
  if (player) return { id: player.id, ownerId: player.ownerId, name: player.name, stationName: player.stationName, faction: player.faction };
  const evidence = getVillageEvidence(world);
  if (!evidence) return undefined;
  const identity = Object.hasOwn(evidence.identities, playerId) ? evidence.identities[playerId] : undefined;
  // The complete directory also proves a genuinely missing/deleted identity.
  return identity;
}
export function playerOwnerId(world: MvpWorld, playerId: string): string | undefined { return playerIdentity(world, playerId)?.ownerId; }

/** Filtering a ledger cannot manufacture a debit/payment pair by removing an
 * intervening foreign entry. Newly appended rows remain in one local block. */
export function ledgerEntriesAdjacent(world: MvpWorld, first: { id: string }, second: { id: string }): boolean {
  const evidence = getVillageEvidence(world);
  if (!evidence) return true;
  const hasFirst = Object.hasOwn(evidence.ledgerOrdinals, first.id), hasSecond = Object.hasOwn(evidence.ledgerOrdinals, second.id);
  if (hasFirst || hasSecond) return hasFirst && hasSecond && evidence.ledgerOrdinals[second.id] === evidence.ledgerOrdinals[first.id] + 1;
  const index = world.social.ledger.findIndex(entry => entry.id === first.id);
  return index >= 0 && world.social.ledger[index + 1]?.id === second.id;
}

/** Full compact fleet evidence supplies foreign routes without loading or
 * inventing foreign private Player records. Own contracts use the mutable trial. */
export function habitableTrades(world: MvpWorld): readonly HabitableTrade[] {
  const evidence = getVillageEvidence(world);
  if (!evidence) return Object.values(world.players).flatMap(player => player.habitable?.commerce?.contracts ?? []);
  const result: HabitableTrade[] = [], seen = new Set<string>();
  for (const trade of evidence.commerceFleet) {
    const id = trade.caravan.playerId;
    if (Object.hasOwn(world.players, id)) {
      if (!seen.has(id)) result.push(...(world.players[id].habitable?.commerce?.contracts ?? []));
      seen.add(id);
    } else result.push(trade);
  }
  for (const player of Object.values(world.players)) if (!seen.has(player.id)) result.push(...(player.habitable?.commerce?.contracts ?? []));
  return result;
}

/** Competitors are resource facts, not fabricated foreign private jobs. Own
 * reservations use the current trial so cancellations and completions take effect. */
export function resourceExtractions(world: MvpWorld, tileId?: string, itemId?: string): ExtractionReservationFact[] {
  const evidence=getVillageEvidence(world),result:ExtractionReservationFact[]=[];
  for(const job of Object.values(world.jobs))if(job.kind==='extract'&&(job.status==='running'||job.status==='reserved'))result.push({id:job.id,playerId:job.playerId,ownerId:playerOwnerId(world,job.playerId)??'',kind:'extract',status:job.status,endsAt:job.endsAt,payload:{tileId:String(job.payload.tileId),itemId:String(job.payload.itemId),qty:Number(job.payload.qty)}});
  if(evidence)for(const fact of evidence.extractionJobs)if(!Object.hasOwn(world.players,fact.playerId))result.push(fact);
  return result.filter(fact=>(tileId===undefined||fact.payload.tileId===tileId)&&(itemId===undefined||fact.payload.itemId===itemId));
}
