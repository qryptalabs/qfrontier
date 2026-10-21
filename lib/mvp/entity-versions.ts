import type { Job, MvpCommand, MvpWorld } from './types.ts';
import { getVillageEvidence } from './village-evidence.ts';
import { deriveClosedEntityValues } from './entity-values.ts';
import { deriveVillageEntityValues, villageInvalidatedAggregateKeys } from './village-semantics.ts';

/** Persisted counters include tombstones: deleting and recreating an entity is not ABA. */
export type EntityVersions = Record<string, number>;

/** Complete worlds retain their original derivation. Contextual states expose
 * only explicitly closed semantic values and cannot tombstone absent records. */
export function deriveEntityValues(world: MvpWorld): Record<string, string> {
  const evidence=getVillageEvidence(world);
  return evidence?deriveVillageEntityValues(world,evidence):deriveClosedEntityValues(world);
}

function checkedVersion(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Versión de entidad inválida.');
  return value;
}

/** Pure bookkeeping; callers commit the result atomically with the world and receipt. */
export function advanceEntityVersions(before: MvpWorld, after: MvpWorld, versions: EntityVersions): EntityVersions {
  const result: EntityVersions = {};
  for (const [key, value] of Object.entries(versions)) result[key] = checkedVersion(value);
  const previous = deriveEntityValues(before), next = deriveEntityValues(after);
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (previous[key] === next[key]) continue;
    const version = checkedVersion(result[key]);
    if (version === Number.MAX_SAFE_INTEGER) throw new RangeError('Se agotó la versión de la entidad.');
    result[key] = version + 1;
  }
  if(getVillageEvidence(before)||getVillageEvidence(after))for(const key of villageInvalidatedAggregateKeys(before,after)){
    const version=checkedVersion(result[key]);if(version===Number.MAX_SAFE_INTEGER)throw new RangeError('Se agotó la versión de la entidad.');result[key]=version+1;
  }
  return result;
}

/**
 * Closed command allowlist. A null result MUST retain the global revision guard.
 * Missing entities keep a key (version zero or a tombstone), never a silent omission.
 */
export function commandVersionKeys(world: MvpWorld, ownerId: string, command: MvpCommand): string[] | null {
  const player = command.playerId && Object.hasOwn(world.players, command.playerId) ? world.players[command.playerId] : null;
  if (!player || player.ownerId !== ownerId) return null;
  // Every quote can display earned boost rewards, even without spending a pass.
  // Alternate profiles share those rewards and the account's first-level milestones.
  const keys = new Set(['politicas', `identidad:cuenta:${ownerId}`, `cuenta:${ownerId}`, `identidad:jugador:${player.id}`, `aldea:${player.id}`, `trabajos:${player.id}`, `actividad:${player.id}`, `cartera:${player.id}`]);
  const add = (key: string) => { keys.add(key); };
  const text = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : null;
  const addPlayer = (id: string) => { add(`identidad:jugador:${id}`); add(`aldea:${id}`); add(`cartera:${id}`); };
  const addTile = (id: string) => { add(`recurso:casilla:${id}`); };
  const addDeposit = (tileId: string, itemId: string) => { add(`recurso:deposito:${tileId}:${itemId}`); add(`indice:extraccion:${tileId}:${itemId}`); };
  const addJobResources = (job: Job): boolean => {
    add(`trabajo:${job.id}`);
    if (job.kind === 'extract') {
      const tileId = text(job.payload.tileId), itemId = text(job.payload.itemId);
      if (!tileId || !itemId) return false;
      addDeposit(tileId, itemId);
    }
    if (job.kind === 'farm') {
      const regionId = text(job.payload.regionId);
      if (!regionId) return false;
      add(`recurso:region:${regionId}`);
    }
    return true;
  };
  const addTerritory = () => {
    add(`indice:membresia:${player.id}`);
    const clan = world.social.clans.find(candidate => Object.hasOwn(candidate.members, player.id));
    if (!clan) return;
    add(`indice:alianzas:${clan.id}`);
    const allies = new Set([clan.id]);
    for (const alliance of world.social.alliances) if (alliance.status === 'active' && alliance.noAggression && alliance.clanIds.includes(clan.id)) for (const id of alliance.clanIds) allies.add(id);
    for (const id of allies) {
      add(`indice:puestos:${id}`);
      for (const post of world.social.outposts ?? []) if (post.clanId === id) addTile(post.tileId);
    }
  };
  addTile(player.position);
  switch (command.type) {
    case 'habitat.profile':
    case 'craft.start': case 'craft.recycle': case 'tool.repair': case 'credit.service':
    case 'research.start': case 'army.prepare': case 'army.heal': case 'army.rest': case 'pvp.toggle':
      break;
    case 'habitat.walk': case 'habitat.build': case 'building.upgrade':
    case 'habitat.storage.deposit': case 'habitat.storage.withdraw': case 'habitat.workbench.start':
      add('transporte:flota');
      if (player.settlement) addTile(player.settlement.homeTileId);
      break;
    case 'farm.start': case 'habitat.planter.start': {
      const tileId = command.type === 'farm.start' ? player.position : player.settlement?.homeTileId ?? player.position;
      addTile(tileId);
      const region = world.tiles[tileId]?.regionId;
      if (!region) return null;
      add(`recurso:region:${region}`);
      if (command.type === 'habitat.planter.start') add('transporte:flota');
      break;
    }
    case 'world.survey': case 'world.travel': {
      const tileId = text(command.tileId);
      if (!tileId) return null;
      addTile(tileId);
      addTerritory();
      if (command.type === 'world.travel') add('mapa:topologia');
      break;
    }
    case 'mining.reserve': case 'deposit.unlock': {
      const tileId = text(command.tileId), itemId = text(command.itemId);
      if (!tileId || !itemId) return null;
      addTile(tileId); addDeposit(tileId, itemId); add(`cuenta:${ownerId}`);
      break;
    }
    case 'craft.cancel': case 'job.cancel': case 'habitat.facility.cancel': {
      const jobId = text(command.jobId);
      if (!jobId) return null;
      add(`trabajo:${jobId}`);
      const job = world.jobs[jobId];
      if (job && (job.playerId !== player.id || !addJobResources(job))) return null;
      if (command.type === 'habitat.facility.cancel') add('transporte:flota');
      break;
    }
    case 'npc.sell': {
      const itemId = text(command.itemId);
      if (!itemId) return null;
      add('npc:budget'); add(`npc:demand:${itemId}`);
      break;
    }
    case 'market.publish':
      add(`indice:ofertas-abiertas:${player.id}`);
      break;
    case 'market.fill': case 'market.cancel': {
      const offerId = text(command.offerId);
      if (!offerId) return null;
      add(`oferta:${offerId}`);
      const offer = world.social.offers.find(candidate => candidate.id === offerId);
      if (offer && command.type === 'market.fill') addPlayer(offer.makerId);
      break;
    }
    case 'contract.publish': {
      const destination = text(command.destination);
      if (!destination) return null;
      addTile(destination);
      break;
    }
    case 'contract.accept': case 'contract.deliver': {
      const contractId = text(command.contractId);
      if (!contractId) return null;
      add(`contrato:${contractId}`);
      const contract = world.social.contracts.find(candidate => candidate.id === contractId);
      if (contract) { addPlayer(contract.requesterId); addTile(contract.destination); }
      break;
    }
    default: return null;
  }
  return [...keys].sort();
}

export function selectEntityVersions(world: MvpWorld, ownerId: string, command: MvpCommand, versions: EntityVersions): EntityVersions | null {
  const keys = commandVersionKeys(world, ownerId, command);
  return keys ? Object.fromEntries(keys.map(key => [key, checkedVersion(Object.hasOwn(versions, key) ? versions[key] : undefined)])) : null;
}

/**
 * Conservative private-view cache guard. Public player/settlement/avatar slices must
 * still be attached from a fresh public projection; admin aggregate views bypass it.
 * This is intentionally separate from the much narrower command authorization scope.
 */
export function selectPlayerViewVersionKeys(world: MvpWorld, ownerId: string, versions: EntityVersions, options?: {separateEvents?: boolean}): EntityVersions {
  const keys = new Set(['politicas', options?.separateEvents ? 'lectura:social' : 'lectura:compartida', 'mapa:topologia', 'npc:budget', 'transporte:flota', `cuenta:${ownerId}`, `identidad:cuenta:${ownerId}`, `lectura:privada:${ownerId}`]);
  for (const player of Object.values(world.players)) if (player.ownerId === ownerId) {
    keys.add(`indice:batallas:${player.id}`);
    for (const convoy of Object.values(world.convoys)) if (convoy.playerId === player.id) keys.add(`convoy:${convoy.id}`);
  }
  for (const tile of Object.values(world.tiles)) {
    keys.add(`recurso:casilla:${tile.id}`);
    for (const deposit of tile.deposits) keys.add(`recurso:deposito:${tile.id}:${deposit.itemId}`);
  }
  for (const region of Object.values(world.regions)) keys.add(`recurso:region:${region.id}`);
  for (const itemId of Object.keys(world.social.npc.demand)) keys.add(`npc:demand:${itemId}`);
  return Object.fromEntries([...keys].sort().map(key => [key, checkedVersion(Object.hasOwn(versions, key) ? versions[key] : undefined)]));
}
