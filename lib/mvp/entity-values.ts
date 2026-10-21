import type { MvpWorld, Player, Tile } from './types.ts';
import { playerOwnerId } from './village-evidence.ts';

function canonical(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, normalize(child)]));
    return entry;
  };
  return JSON.stringify(normalize(value));
}

function group<T>(items: readonly T[], key: (value: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = Object.create(null);
  for (const item of items) (result[key(item)] ??= []).push(item);
  return result;
}

/** Deposits have their own resource version; unrelated extraction is not a road change. */
function tileGeometry(tile: Tile) {
  const { deposits: _deposits, ...geometry } = tile;
  void _deposits;
  return geometry;
}

export function deriveClosedEntityValues(world: MvpWorld): Record<string, string> {
  const values: Record<string, string> = {};
  const put = (key: string, value: unknown) => { values[key] = canonical(value); };
  const players = Object.values(world.players), jobs = Object.values(world.jobs);
  const jobsByPlayer = group(jobs, job => job.playerId);
  const activeExtractionByResource = group(jobs.filter(job => job.kind === 'extract' && (job.status === 'running' || job.status === 'reserved')), job => `${String(job.payload.tileId)}:${String(job.payload.itemId)}`);
  const profilesByOwner = group(players, player => player.ownerId);
  const offersByPlayer: Record<string, typeof world.social.offers> = Object.create(null);
  const offerById = new Map(world.social.offers.map(offer => [offer.id, offer]));
  const ledgerByPlayer: Record<string, typeof world.social.ledger> = Object.create(null);
  for (const offer of world.social.offers) {
    for (const id of new Set([offer.makerId, ...(offer.takerId ? [offer.takerId] : [])])) (offersByPlayer[id] ??= []).push(offer);
    put(`oferta:${offer.id}`, offer);
  }
  for (const entry of world.social.ledger) {
    const offer = offerById.get(entry.from);
    const ids = new Set([entry.from, entry.to, ...(offer ? [offer.makerId, ...(offer.takerId ? [offer.takerId] : [])] : [])]);
    for (const id of ids) if (Object.hasOwn(world.players, id)) (ledgerByPlayer[id] ??= []).push(entry);
  }
  put('politicas', { schemaVersion: world.schemaVersion, rulesVersion: world.rulesVersion, seasonId: world.seasonId, createdAt: world.createdAt, adminOwnerId: world.adminOwnerId });
  const activityInputs = (player: Player) => ({
    activity: world.social.activity[player.id] ?? null,
    ledger: ledgerByPlayer[player.id] ?? [],
    offers: offersByPlayer[player.id] ?? [],
    counterparties: (offersByPlayer[player.id] ?? []).map(offer => {
      const otherId = offer.makerId === player.id ? offer.takerId : offer.makerId;
      return { playerId: otherId, ownerId: otherId ? playerOwnerId(world,otherId) ?? null : null };
    }),
  });
  for (const player of players) {
    // Manager cursor/nextAt remain included: they control replay and are not just UI metadata.
    put(`aldea:${player.id}`, player);
    put(`identidad:jugador:${player.id}`, { id: player.id, ownerId: player.ownerId });
    put(`trabajos:${player.id}`, jobsByPlayer[player.id] ?? []);
    put(`actividad:${player.id}`, activityInputs(player));
    put(`cartera:${player.id}`, world.social.accounts[player.id] ?? null);
    put(`indice:ofertas-abiertas:${player.id}`, world.social.offers.filter(offer => offer.makerId === player.id && offer.status === 'open').map(offer => offer.id));
    put(`indice:membresia:${player.id}`, world.social.clans.filter(clan => Object.hasOwn(clan.members, player.id)).map(clan => ({ clanId: clan.id, role: clan.members[player.id] })));
    put(`indice:batallas:${player.id}`, Object.values(world.battles).filter(battle => battle.attackerId === player.id || battle.targetId === player.id || world.jobs[battle.jobId]?.payload.defenderPlayerId === player.id));
  }
  for (const [owner, profiles] of Object.entries(profilesByOwner)) {
    put(`identidad:cuenta:${owner}`, profiles.map(player => ({ id: player.id, ownerId: player.ownerId })));
    // Boost passes, rolling reservations and land proofs span every profile of an owner.
    // Demand prices validate historical fair rewards; remaining demand is a separate resource.
    put(`cuenta:${owner}`, {
      profiles,
      jobs: profiles.flatMap(player => jobsByPlayer[player.id] ?? []),
      activity: profiles.map(player => ({ playerId: player.id, ...activityInputs(player) })),
      accounts: profiles.map(player => ({ playerId: player.id, account: world.social.accounts[player.id] ?? null })),
      npcPrices: Object.fromEntries(Object.entries(world.social.npc.demand).map(([id, demand]) => [id, demand?.price])),
    });
    const ownIds = new Set(profiles.map(player => player.id));
    const ownClans = new Set(world.social.clans.filter(clan => profiles.some(player => Object.hasOwn(clan.members, player.id))).map(clan => clan.id));
    put(`lectura:privada:${owner}`, world.social.ledger.filter(entry => ownIds.has(entry.from) || ownIds.has(entry.to) || ownClans.has(entry.from) || ownClans.has(entry.to)));
  }
  for (const tile of Object.values(world.tiles)) {
    put(`recurso:casilla:${tile.id}`, tileGeometry(tile));
    for (const deposit of tile.deposits) {
      put(`recurso:deposito:${tile.id}:${deposit.itemId}`, deposit);
      put(`indice:extraccion:${tile.id}:${deposit.itemId}`, activeExtractionByResource[`${tile.id}:${deposit.itemId}`] ?? []);
    }
  }
  put('mapa:topologia', Object.fromEntries(Object.entries(world.tiles).map(([id, tile]) => [id, tileGeometry(tile)])));
  for (const region of Object.values(world.regions)) put(`recurso:region:${region.id}`, region);
  for (const job of jobs) put(`trabajo:${job.id}`, job);
  for (const convoy of Object.values(world.convoys)) put(`convoy:${convoy.id}`, convoy);
  for (const battle of Object.values(world.battles)) put(`batalla:${battle.id}`, battle);
  put('npc:budget', { budget: world.social.npc.budget, remaining: world.social.npc.remaining });
  for (const [itemId, demand] of Object.entries(world.social.npc.demand)) put(`npc:demand:${itemId}`, demand);
  for (const contract of world.social.contracts) put(`contrato:${contract.id}`, contract);
  put('indice:clanes:nombres', world.social.clans.map(clan => ({ id: clan.id, name: clan.name.toLocaleLowerCase('en-US') })));
  for (const clan of world.social.clans) {
    put(`clan:${clan.id}`, clan);
    put(`indice:alianzas:${clan.id}`, world.social.alliances.filter(alliance => alliance.clanIds.includes(clan.id)));
    put(`indice:puestos:${clan.id}`, (world.social.outposts ?? []).filter(post => post.clanId === clan.id));
    for (const proposal of clan.withdrawals) put(`retiro:${clan.id}:${proposal.id}`, proposal);
  }
  for (const project of world.social.projects) put(`proyecto:${project.id}`, project);
  for (const tile of Object.values(world.tiles)) put(`indice:proyecto:${tile.id}`, world.social.projects.filter(project => project.tileId === tile.id && project.status === 'open'));
  for (const alliance of world.social.alliances) put(`alianza:${alliance.id}`, alliance);
  for (const project of world.social.funding) put(`financiacion:${project.id}`, project);
  for (const post of world.social.outposts ?? []) put(`puesto:${post.id}`, post);
  put('temporada:premios', world.social.rewards);
  // Authoritative movement/construction guards inspect the shared commercial fleet.
  put('transporte:flota', players.flatMap(player => player.habitable?.commerce?.contracts ?? []));
  // A manifest also detects creation/removal of shared rows, not just existing IDs.
  // It is server-only; no private account balance or foreign player's inventory is added.
  const sharedSocial = {
    publicWorks:{granaryDelivered:world.cityShops?.['paso-del-norte']?.granary?.delivered??0},
    convoys: Object.values(world.convoys).filter(convoy => convoy.exposed),
    offers: world.social.offers, contracts: world.social.contracts, clans: world.social.clans,
    projects: world.social.projects, alliances: world.social.alliances, outposts: world.social.outposts ?? [],
    referrals: world.social.referrals, mentors: world.social.mentors,
    funding: world.social.funding, rewards: world.social.rewards,
  };
  put('lectura:social', sharedSocial);
  put('lectura:compartida', { events: world.events, ...sharedSocial });
  return values;
}

