import { getPublicHabitableActor } from './habitable.ts';
import type { HabitableView } from './habitable.ts';
import { starterProtection } from './settlements.ts';
import { getStationUpgradeVisuals } from './station-upgrades.ts';
import { hashRecord, splitUtf8 } from './partitioned-codec.ts';
import { readD1WithRetry, writeD1Once } from './storage-availability.ts';
import type { PartitionD1Database, PartitionD1Statement } from './partitioned-store.ts';
import type { MvpWorld, Player } from './types.ts';
import type { MvpView, PublicSettlement } from './view.ts';
import type {VillageSnapshot} from './village-snapshot.ts';
import {getVillageEvidence,habitableTrades} from './village-evidence.ts';
import {selectPlayerViewVersionKeys} from './entity-versions.ts';

type Versions = Record<string, number>;
type Actor = HabitableView['actors'][number];
type Caravan = HabitableView['commerce']['caravans'][number];
interface PublicEntry {
  person: MvpView['people'][number];
  settlement: Omit<PublicSettlement, 'own'> | null;
  actor: Actor | null;
  caravan: Caravan | null;
}
interface PublicHead {
  player_id: string; owner_id: string; player_ordinal: number; source_revision: number; source_version: number;
  as_of: number; next_due_at: number | null; part_count: number; record_hash: string;
}
interface PublicPart {player_id: string; part_index: number; body: string}
interface PrivateHead {
  owner_id: string; selection_id: string; selected_player_id: string | null;
  source_revision: number; as_of: number; next_due_at: number | null;
  dependencies: string; part_count: number; record_hash: string;
}
interface PrivatePart {part_index: number; body: string}
interface Dependency {key: string; version: number}
interface DependencyRow {entity_key: string; version: number | null}
interface StoredPublic {head: PublicHead; entry: PublicEntry}
interface EventPart {entity_id:string;ordinal:number;part_index:number;part_count:number;record_hash:string;body:string}
export interface PlayerReadModelOptions {realmId: string; chunkBytes: number; maxBatchStatements: number;boundedReads?:boolean}
export interface PlayerProjectionRecord {revision: number; world: MvpWorld; entityVersions?: Versions}
export interface ReadModelWriteGuard {sql: string; bindings: readonly unknown[]}

const validInteger = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && Number(value) >= minimum;
const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fresh = (asOf: number, deadline: number | null, now: number) => validInteger(asOf) && now >= asOf && (deadline === null || validInteger(deadline) && now < deadline);
const guardSql = 'EXISTS (SELECT 1 FROM world_partition_heads WHERE realm_id = ? AND commit_token = ?)';

/** All mutations are guarded by the economic commit's unguessable token. The
 * caller adds them to that same batch; losing CAS attempts cannot publish data. */
export function guardedReadModelRows(db: PartitionD1Database, realm: string, token: string, table: string, columns: readonly string[], rows: readonly (readonly unknown[])[], conflict: readonly string[] = [], authority?: ReadModelWriteGuard): PartitionD1Statement[] {
  const writeGuard = authority ?? {sql: guardSql, bindings: [realm, token]};
  const statements: PartitionD1Statement[] = [], size = Math.floor((100 - writeGuard.bindings.length) / columns.length);
  for (let start = 0; start < rows.length; start += size) {
    const group = rows.slice(start, start + size);
    const upsert = conflict.length ? ` ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${columns.filter(column => !conflict.includes(column)).map(column => `${column} = excluded.${column}`).join(', ')}` : '';
    statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) SELECT * FROM (VALUES ${group.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')}) WHERE ${writeGuard.sql}${upsert}`).bind(...group.flat(), ...writeGuard.bindings));
  }
  return statements;
}
function deletePublic(db: PartitionD1Database, realm: string, token: string, ids: readonly string[], authority?: ReadModelWriteGuard): PartitionD1Statement[] {
  const writeGuard = authority ?? {sql: guardSql, bindings: [realm, token]};
  const statements: PartitionD1Statement[] = [];
  for (let start = 0; start < ids.length; start += 97) {
    const group = ids.slice(start, start + 97);
    statements.push(db.prepare(`DELETE FROM world_public_actor_heads WHERE realm_id = ? AND player_id IN (${group.map(() => '?').join(', ')}) AND ${writeGuard.sql}`).bind(realm, ...group, ...writeGuard.bindings));
  }
  return statements;
}

const clockBoundary = (now: number) => Math.min((Math.floor(now / 21_600_000) + 1) * 21_600_000, (Math.floor(now / 86_400_000) + 1) * 86_400_000);
function futureTimestampBoundary(value: unknown, now: number): number {
  let result = Infinity;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'number' && Number.isFinite(child) && child > now && /(?:At|Until|Deadline)$|^deadline$/.test(key)) result = Math.min(result, child);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(value);return result;
}
/** Conservative semantic boundary. Unknown future timestamp fields fail toward
 * an earlier refresh rather than showing an unconfirmed completion. Public
 * geometry describes the last confirmed actor: an overdue private job alone
 * never claims completion and cannot invalidate every neighbor's public view. */
export function playerReadNextDueAt(world: MvpWorld, now: number, player?: Player, projection?: MvpView, publicVisualOnly = false): number | null {
  let result = clockBoundary(now);
  if (player) {
    result=Math.min(result,futureTimestampBoundary(player,now));
    for (const job of Object.values(world.jobs)) if (job.playerId === player.id) result=Math.min(result,futureTimestampBoundary(job,now));
    const until = starterProtection(world, player, now).endsAt;
    if (until > now) result = Math.min(result, until);
  } else result=Math.min(result,futureTimestampBoundary(world,now));
  if (projection) result=Math.min(result,futureTimestampBoundary(projection,now));
  if (projection?.habitable.manager.plan?.status === 'active') result = Math.min(result, now + 1000);
  if(!publicVisualOnly)for (const job of Object.values(world.jobs)) if ((!player || job.playerId === player.id) && (job.status === 'running' || job.status === 'reserved') && job.endsAt <= now) result = now;
  return result;
}
function privatePlayerReadNextDueAt(world:MvpWorld,ownerId:string,now:number,projection:MvpView,bounded=false):number {
  let result=Math.min(clockBoundary(now),futureTimestampBoundary(projection,now));
  for(const player of Object.values(world.players))if(player.ownerId===ownerId)result=Math.min(result,playerReadNextDueAt(world,now,player,undefined,bounded&&player.id!==projection.player?.id)!);
  // Shared leases must wake the exceptional shared settlement pass even when
  // their owner is offline. Private craft/farm completions are not such leases.
  const future=(at:number|null|undefined,strict=false)=>{if(typeof at==='number'&&Number.isFinite(at)){const boundary=at+(strict?1:0);if(boundary>now)result=Math.min(result,boundary);}};
  for(const job of Object.values(world.jobs))if(world.players[job.playerId]?.ownerId!==ownerId&&job.kind==='extract'&&(job.status==='running'||job.status==='reserved'))future(job.endsAt);
  for(const player of Object.values(world.players))if(player.ownerId!==ownerId){
    const job=player.habitable?.job;if(job?.status==='active')future(job.expiresAt);
    for(const contract of player.habitable?.commerce?.contracts??[]){if(contract.status==='accepted')future(contract.deadline);if(contract.status==='in_transit')future(contract.caravan.delivery?.unloadsAt);}
  }
  // A completed/expired cart still occupies its lane during the visible return
  // or unloading tail. Refresh availability when that tail ends, without
  // inventing an economic lease or scheduling another settlement.
  const fleet=habitableTrades(world);
  for(const trade of fleet){
    if(trade.status==='accepted')future(trade.deadline);
    if(trade.status==='in_transit')future(trade.caravan.delivery?.unloadsAt);
    if(trade.caravan.returnTrip)future(trade.caravan.returnTrip.endsAt+3000);
    if(trade.caravan.delivery)future(trade.caravan.delivery.unloadsAt+6000);
  }
  for(const offer of world.social.offers)if(offer.status==='open'){future(offer.expiresAt);for(const lot of offer.lots)future(lot.expiresAt);}
  for(const contract of world.social.contracts)if(contract.status==='published'||contract.status==='accepted')future(contract.deadline,true);
  for(const clan of world.social.clans)for(const proposal of clan.withdrawals)if(proposal.status==='pending')future(proposal.expiresAt,true);
  for(const project of world.social.projects)if(project.status==='open')future(project.deadline,true);
  for(const alliance of world.social.alliances)if(alliance.status!=='ended')future(alliance.expiresAt,true);
  for(const project of world.social.funding){if(project.status==='open')future(project.fundingDeadline);if(['funded','delivering'].includes(project.status))future(project.deliveryDeadline);}
  for(const post of world.social.outposts??[])if(post.status!=='expired'){future(post.expiresAt);if(post.status==='active')future(post.maintenanceUntil);}
  if(projection.habitable.manager.plan?.status==='active')result=Math.min(result,now+1000);
  return result;
}
function publicEntry(world: MvpWorld, player: Player, now: number): PublicEntry {
  const construction = getStationUpgradeVisuals(world, player);
  const list = player.habitable?.commerce?.contracts ?? [];
  return {
    person: {id: player.id, name: player.name, stationName: player.stationName, faction: player.faction},
    settlement: player.settlement ? {id: player.settlement.id, playerId: player.id, name: player.stationName, ownerName: player.name, faction: player.faction, clanName: world.social.clans.find(clan => Object.hasOwn(clan.members, player.id))?.name ?? null, plot: structuredClone(player.settlement), buildings: structuredClone(player.buildings), protectionUntil: starterProtection(world, player, now).endsAt, ...(construction.length ? {construction} : {})} : null,
    actor: getPublicHabitableActor(world, player, now) ?? null,
    caravan: list.length ? structuredClone(list.at(-1)!.caravan) : null,
  };
}
function applyPublic(view: MvpView, records: readonly StoredPublic[], ownerId: string): MvpView {
  const entries = records.map(record => record.entry), actors = entries.flatMap(entry => entry.actor ? [entry.actor] : []);
  const ownNetwork = view.habitable.state?.networkVisual;
  if (ownNetwork && view.player) {
    const actor = actors.find(value => value.playerId === view.player!.id);
    if (actor) actor.state.networkVisual = structuredClone(ownNetwork);
  }
  view.people = entries.map(entry => entry.person);
  view.settlements = records.flatMap(({entry, head}) => entry.settlement ? [{...entry.settlement, own: head.owner_id === ownerId}] : []);
  view.habitable.actors = actors;
  view.habitable.commerce.caravans = entries.flatMap(entry => entry.caravan ? [entry.caravan] : []);
  // Names in public social cards must follow the current public directory even
  // when the private account and economy have not changed.
  const names = new Map(view.people.map(person => [person.id, person.name]));
  for (const offer of view.social.offers) offer.makerName = names.get(offer.makerId) ?? 'Explorador';
  for (const contract of view.social.contracts) contract.requesterName = names.get(contract.requesterId) ?? 'Explorador';
  for (const clan of view.social.clans) for (const member of clan.members) member.name = names.get(member.playerId) ?? 'Explorador';
  if (view.social.clan) for (const member of view.social.clan.members) member.name = names.get(member.playerId) ?? 'Explorador';
  return view;
}
async function decodePublic(heads: PublicHead[], parts: PublicPart[], now: number, checkTime: boolean): Promise<StoredPublic[] | null> {
  if (!Array.isArray(heads) || !Array.isArray(parts)) return null;
  const grouped = new Map<string, PublicPart[]>(), ids = new Set<string>();
  for (const part of parts) {const group = grouped.get(part.player_id) ?? []; group.push(part); grouped.set(part.player_id, group);}
  const decoded: StoredPublic[] = [];
  for (const head of heads) {
    if (typeof head.player_id !== 'string' || typeof head.owner_id !== 'string' || ids.has(head.player_id) || !validInteger(head.source_version, 1) || !validInteger(head.source_revision) || !validInteger(head.part_count, 1) || !validHash(head.record_hash) || checkTime && !fresh(head.as_of, head.next_due_at, now)) return null;
    ids.add(head.player_id);
    const pieces = grouped.get(head.player_id) ?? [];
    if (pieces.length !== head.part_count || pieces.some((part, index) => part.part_index !== index || typeof part.body !== 'string')) return null;
    const body = pieces.map(part => part.body).join('');
    if (await hashRecord(body) !== head.record_hash) return null;
    const entry = JSON.parse(body) as PublicEntry;
    if (entry?.person?.id !== head.player_id || entry.actor && entry.actor.playerId !== head.player_id || entry.settlement && entry.settlement.playerId !== head.player_id) return null;
    decoded.push({head, entry});
  }
  return grouped.size === heads.length ? decoded : null;
}

async function decodeEvents(parts:EventPart[],expected:number):Promise<MvpWorld['events']|null>{
  if(!validInteger(expected)||!Array.isArray(parts))return null;
  const groups=new Map<string,EventPart[]>();
  for(const part of parts){const group=groups.get(part.entity_id)??[];group.push(part);groups.set(part.entity_id,group);}
  if(groups.size!==expected)return null;
  const events:MvpWorld['events']=[],ordinals=new Set<number>();
  for(const[id,group]of groups){
    const head=group[0];if(!validInteger(head.ordinal)||ordinals.has(head.ordinal)||!validInteger(head.part_count,1)||group.length!==head.part_count||!validHash(head.record_hash)||group.some((part,i)=>part.part_index!==i||part.part_count!==head.part_count||part.ordinal!==head.ordinal||part.record_hash!==head.record_hash||typeof part.body!=='string'))return null;
    const body=group.map(part=>part.body).join('');if(await hashRecord(body)!==head.record_hash)return null;
    const event=JSON.parse(body)as MvpWorld['events'][number];if(!event||id!==`id:${event.id}`||typeof event.playerId!=='string'||typeof event.playerName!=='string'||typeof event.text!=='string'||!validInteger(event.at))return null;
    ordinals.add(head.ordinal);events.push(event);
  }
  return events;
}

export function createPlayerReadModel(db: PartitionD1Database, options: PlayerReadModelOptions) {
  const {realmId: realm, chunkBytes, maxBatchStatements} = options;
  async function publicMutations(world: MvpWorld, revision: number, versions: Versions, now: number, token: string, ids: readonly string[], authority?: ReadModelWriteGuard): Promise<PartitionD1Statement[]> {
    const heads: unknown[][] = [], parts: unknown[][] = [];
    for (const id of ids) {
      const player = world.players[id];
      if (!player) continue;
      const body = JSON.stringify(publicEntry(world, player, now)), pieces = splitUtf8(body, chunkBytes);
      const ordinal=getVillageEvidence(world)?.playerOrdinals?.[id]??Object.keys(world.players).indexOf(id);
      heads.push([realm, id, player.ownerId, ordinal, revision, versions[`aldea:${id}`] ?? 1, now, playerReadNextDueAt(world, now, player,undefined,true), pieces.length, await hashRecord(body)]);
      pieces.forEach((part, index) => parts.push([realm, id, index, part]));
    }
    return [...deletePublic(db, realm, token, ids, authority), ...guardedReadModelRows(db, realm, token, 'world_public_actor_heads', ['realm_id', 'player_id', 'owner_id', 'player_ordinal', 'source_revision', 'source_version', 'as_of', 'next_due_at', 'part_count', 'record_hash'], heads, [], authority), ...guardedReadModelRows(db, realm, token, 'world_public_actor_parts', ['realm_id', 'player_id', 'part_index', 'body'], parts, [], authority)];
  }
  async function publicSnapshot(now: number, checkTime: boolean) {
    const results = await readD1WithRetry(() => db.batch([
      db.prepare('SELECT h.revision, h.commit_token, m.actor_count FROM world_partition_heads h JOIN world_read_model_state m ON m.realm_id = h.realm_id AND m.public_revision = h.revision AND m.public_token = h.commit_token WHERE h.realm_id = ?').bind(realm),
      db.prepare('SELECT * FROM world_public_actor_heads WHERE realm_id = ? ORDER BY player_ordinal, player_id').bind(realm),
      db.prepare('SELECT player_id, part_index, body FROM world_public_actor_parts WHERE realm_id = ? ORDER BY player_id, part_index').bind(realm),
    ]));
    if (results.some(result => !result.success) || results[0].results?.length !== 1) return null;
    const head = results[0].results[0] as {revision: number; commit_token: string;actor_count:number};
    try {const entries = await decodePublic(results[1].results as unknown as PublicHead[], results[2].results as unknown as PublicPart[], now, checkTime); return entries&&validInteger(head.actor_count)&&entries.length===head.actor_count ? {head, entries} : null;} catch {return null;}
  }
  async function read(ownerId: string, selectedId: string | undefined, now: number): Promise<MvpView | null> {
    if (!ownerId || ownerId.length > 256 || !validInteger(now)) return null;
    const selection = selectedId ?? '';
    // An invalid private body cannot use the directory. Gate its expensive rows
    // in the SAME SQL snapshot, before returning and hashing every public actor.
    const cacheGate="EXISTS (SELECT 1 FROM world_player_view_heads c WHERE c.realm_id=? AND c.owner_id=? AND c.selection_id=? AND c.as_of<=? AND (c.next_due_at IS NULL OR c.next_due_at>?) AND NOT EXISTS (SELECT 1 FROM json_each(c.dependencies) d LEFT JOIN world_entity_versions v ON v.realm_id=c.realm_id AND v.entity_key=json_extract(d.value,'$.key') WHERE COALESCE(v.version,0)<>json_extract(d.value,'$.version')))";
    const gated=(sql:string,order:string)=>options.boundedReads?db.prepare(`${sql} AND ${cacheGate}${order}`).bind(realm,realm,ownerId,selection,now,now):db.prepare(`${sql}${order}`).bind(realm);
    const publicHeads=gated('SELECT * FROM world_public_actor_heads WHERE realm_id = ?',' ORDER BY player_ordinal, player_id');
    const publicParts=gated('SELECT player_id, part_index, body FROM world_public_actor_parts WHERE realm_id = ?',' ORDER BY player_id, part_index');
    const results = await readD1WithRetry(() => db.batch([
      db.prepare(`SELECT h.revision, m.actor_count${options.boundedReads?", (SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=h.realm_id AND i.collection='events') AS event_count":''} FROM world_partition_heads h JOIN world_read_model_state m ON m.realm_id = h.realm_id AND m.source_revision = h.revision AND m.commit_token = h.commit_token AND m.public_revision = h.revision AND m.public_token = h.commit_token${options.boundedReads?' JOIN world_village_index_state s ON s.realm_id=h.realm_id AND s.source_revision=h.revision AND s.commit_token=h.commit_token AND s.record_count=h.record_count AND s.format=1 AND s.record_count=(SELECT COUNT(*) FROM world_village_record_index WHERE realm_id=h.realm_id)':''} WHERE h.realm_id = ? AND m.entity_count = (SELECT COUNT(*) FROM world_entity_versions v WHERE v.realm_id = h.realm_id)`).bind(realm),
      db.prepare('SELECT * FROM world_player_view_heads WHERE realm_id = ? AND owner_id = ? AND selection_id = ?').bind(realm, ownerId, selection),
      db.prepare('SELECT part_index, body FROM world_player_view_parts WHERE realm_id = ? AND owner_id = ? AND selection_id = ? ORDER BY part_index').bind(realm, ownerId, selection),
      db.prepare("SELECT json_extract(d.value, '$.key') AS entity_key, v.version FROM world_player_view_heads h JOIN json_each(h.dependencies) d LEFT JOIN world_entity_versions v ON v.realm_id = h.realm_id AND v.entity_key = json_extract(d.value, '$.key') WHERE h.realm_id = ? AND h.owner_id = ? AND h.selection_id = ?").bind(realm, ownerId, selection),
      // Preserve deterministic ordinals without fetching the directory on a miss.
      publicHeads,
      publicParts,
      ...(options.boundedReads?[db.prepare(`SELECT p.entity_id,p.ordinal,p.part_index,p.part_count,p.record_hash,p.body FROM world_village_record_index i CROSS JOIN world_partition_parts p ON p.realm_id=i.realm_id AND p.collection=i.collection AND p.entity_id=i.entity_id AND p.record_hash=i.record_hash WHERE i.realm_id=? AND i.collection='events' AND ${cacheGate} ORDER BY p.ordinal,p.entity_id,p.part_index`).bind(realm,realm,ownerId,selection,now,now)]:[]),
    ]));
    if (results.some(result => !result.success) || results[0].results?.length !== 1 || results[1].results?.length !== 1) return null;
    try {
      const head = results[1].results[0] as unknown as PrivateHead, worldHead = results[0].results[0] as {revision: number; actor_count: number;event_count?:number};
      if (head.owner_id !== ownerId || head.selection_id !== selection || selectedId !== undefined && head.selected_player_id !== selectedId || !fresh(head.as_of, head.next_due_at, now) || !validInteger(head.source_revision) || head.source_revision > worldHead.revision || !validInteger(head.part_count, 1) || !validHash(head.record_hash)) return null;
      const dependencies = JSON.parse(head.dependencies) as Dependency[], actual = results[3].results as unknown as DependencyRow[];
      if (!Array.isArray(dependencies) || !dependencies.length || dependencies.length !== actual.length || new Set(dependencies.map(row => row.key)).size !== dependencies.length) return null;
      const current = new Map(actual.map(row => [row.entity_key, row.version]));
      if (dependencies.some(row => typeof row.key !== 'string' || !validInteger(row.version, 1) || current.get(row.key) !== row.version)) return null;
      const pieces = results[2].results as unknown as PrivatePart[];
      if (pieces.length !== head.part_count || pieces.some((part, index) => part.part_index !== index || typeof part.body !== 'string')) return null;
      const body = pieces.map(part => part.body).join('');
      if (await hashRecord(body) !== head.record_hash) return null;
      const entries = await decodePublic(results[4].results as unknown as PublicHead[], results[5].results as unknown as PublicPart[], now, !options.boundedReads);
      if (!entries || entries.length !== worldHead.actor_count || entries.some(entry => entry.head.source_revision > worldHead.revision)) return null;
      const view = JSON.parse(body) as MvpView;
      if(options.boundedReads){const events=await decodeEvents(results[6].results as unknown as EventPart[],worldHead.event_count!);if(!events)return null;view.events=events;}
      if (view?.player?.id !== head.selected_player_id && !(view?.player === null && head.selected_player_id === null) || !Array.isArray(view.players) || view.players.some(player => !entries.some(entry => entry.head.player_id === player.id && entry.head.owner_id === ownerId))) return null;
      view.revision = worldHead.revision;
      if (view.firstTrade.job) view.firstTrade.job.remainingSeconds = Math.max(0, Math.ceil((view.firstTrade.job.endsAt - now) / 1000));
      const contract = view.habitable.state?.job;
      const contractJob = [contract?.craftJobId, contract?.extractionJobId].map(id => view.jobs.find(job => job.id === id && (job.status === 'running' || job.status === 'reserved'))).find(Boolean);
      view.habitable.job.remainingSeconds = contractJob ? Math.max(0, Math.ceil((contractJob.endsAt - now) / 1000)) : 0;
      view.now = now;
      return applyPublic(view, entries, ownerId);
    } catch {return null;}
  }
  async function project(record: PlayerProjectionRecord, ownerId: string, now: number, selectedId: string | undefined, token: string, dependencyKeys: readonly string[]): Promise<MvpView> {
    const {buildMvpView} = await import('./engine.ts');
    const versions = record.entityVersions ?? {}, snapshot = await publicSnapshot(now, false), ids = Object.keys(record.world.players), pending: string[] = [];
    const saved = snapshot?.head.revision === record.revision ? snapshot.entries : [];
    const entries: StoredPublic[] = [];
    for (const id of ids) {
      const cached = saved.find(value => value.head.player_id === id);
      if (cached && fresh(cached.head.as_of, cached.head.next_due_at, now)) {entries.push(cached); continue;}
      const player = record.world.players[id]; pending.push(id);
      entries.push({head: {player_id: id, owner_id: player.ownerId, player_ordinal: Object.keys(record.world.players).indexOf(id), source_revision: record.revision, source_version: versions[`aldea:${id}`] ?? 1, as_of: now, next_due_at: playerReadNextDueAt(record.world, now, player,undefined,true), part_count: 1, record_hash: ''}, entry: publicEntry(record.world, player, now)});
    }
    const actors = entries.flatMap(entry => entry.entry.actor ? [entry.entry.actor] : []);
    const view = applyPublic(buildMvpView(record.world, record.revision, ownerId, now, selectedId, {publicActors: actors}), entries, ownerId);
    if (record.world.adminOwnerId === ownerId) return view;
    const cached = structuredClone(view); cached.people = []; cached.settlements = []; cached.habitable.actors = []; cached.habitable.commerce.caravans = [];
    if(options.boundedReads)cached.events=[];
    const effectiveKeys=options.boundedReads?Object.keys(selectPlayerViewVersionKeys(record.world,ownerId,versions,{separateEvents:true})):dependencyKeys;
    const dependencies = effectiveKeys.map(key => ({key, version: versions[key]})).filter((row): row is Dependency => validInteger(row.version, 1));
    if (!dependencies.length || dependencies.length !== effectiveKeys.length) return view;
    const body = JSON.stringify(cached), pieces = splitUtf8(body, chunkBytes), selection = selectedId ?? '';
    const statements = [
      ...await publicMutations(record.world, record.revision, versions, now, token, pending),
      db.prepare(`DELETE FROM world_player_view_heads WHERE realm_id = ? AND owner_id = ? AND selection_id = ? AND ${guardSql}`).bind(realm, ownerId, selection, realm, token),
      ...guardedReadModelRows(db, realm, token, 'world_player_view_heads', ['realm_id', 'owner_id', 'selection_id', 'selected_player_id', 'source_revision', 'as_of', 'next_due_at', 'dependencies', 'part_count', 'record_hash'], [[realm, ownerId, selection, view.player?.id ?? null, record.revision, now, privatePlayerReadNextDueAt(record.world,ownerId,now,cached,options.boundedReads), JSON.stringify(dependencies), pieces.length, await hashRecord(body)]]),
      ...guardedReadModelRows(db, realm, token, 'world_player_view_parts', ['realm_id', 'owner_id', 'selection_id', 'part_index', 'body'], pieces.map((part, index) => [realm, ownerId, selection, index, part])),
    ];
    if (statements.length <= maxBatchStatements) await writeD1Once('compareAndSwap', async () => {const results = await db.batch(statements); if (results.some(result => !result.success)) throw new Error('La proyección de lectura no pudo publicarse.');});
    return view;
  }
  /** The economic context contains only covered private records. The directory
   * comes independently from committed public rows; no foreign Player is made
   * up to satisfy the global projector and no foreign private body is loaded. */
  async function projectVillage(record:VillageSnapshot,ownerId:string,now:number,selectedId?:string):Promise<MvpView>{
    if(record.scope.ownerId!==ownerId||selectedId!==undefined&&!record.scope.profileIds.includes(selectedId)||record.state.adminOwnerId===ownerId)throw new Error('El proyector privado no tiene cobertura para esa cuenta.');
    const snapshot=await publicSnapshot(now,false);
    if(!snapshot)throw new Error('El directorio público no tiene una revisión confirmada.');
    const {buildMvpView}=await import('./engine.ts');
    const entries=snapshot.entries.map(saved=>{
      const player=record.state.players[saved.head.player_id];
      return player?{head:saved.head,entry:publicEntry(record.state,player,now)}:saved;
    });
    if(record.scope.profileIds.some(id=>!entries.some(entry=>entry.head.player_id===id)))throw new Error('El directorio público no contiene los perfiles de la cuenta.');
    const actors=entries.flatMap(entry=>entry.entry.actor?[entry.entry.actor]:[]);
    const view=applyPublic(buildMvpView(record.state,record.revision,ownerId,now,selectedId,{publicActors:actors}),entries,ownerId);
    const cached=structuredClone(view);cached.people=[];cached.settlements=[];cached.habitable.actors=[];cached.habitable.commerce.caravans=[];
    cached.events=[];
    const dependencies=Object.entries(selectPlayerViewVersionKeys(record.state,ownerId,record.entityVersions,{separateEvents:true})).map(([key,version])=>({key,version}));
    if(!dependencies.length||dependencies.some(row=>!validInteger(row.version,1)))return view;
    // Derived private caches are authorized by their real semantic dependencies.
    // An unrelated village may advance the global revision without invalidating
    // this body. An old writer or changed dependency prevents its publication.
    const dependencyGuard:ReadModelWriteGuard={
      sql:'EXISTS (SELECT 1 FROM world_partition_heads h JOIN world_read_model_state m ON m.realm_id=h.realm_id AND m.source_revision=h.revision AND m.commit_token=h.commit_token WHERE h.realm_id=?) AND NOT EXISTS (SELECT 1 FROM json_each(?) d LEFT JOIN world_entity_versions v ON v.realm_id=? AND v.entity_key=json_extract(d.value,\'$.key\') WHERE COALESCE(v.version,0)<>json_extract(d.value,\'$.version\'))',
      bindings:[realm,JSON.stringify(dependencies),realm],
    };
    const selection=selectedId??'',body=JSON.stringify(cached),pieces=splitUtf8(body,chunkBytes);
    const nextDue=Math.min(privatePlayerReadNextDueAt(record.state,ownerId,now,cached,true),record.scope.nextSharedDueAt??Infinity);
    const statements=[
      db.prepare(`DELETE FROM world_player_view_heads WHERE realm_id=? AND owner_id=? AND selection_id=? AND ${dependencyGuard.sql}`).bind(realm,ownerId,selection,...dependencyGuard.bindings),
      ...guardedReadModelRows(db,realm,record.token,'world_player_view_heads',['realm_id','owner_id','selection_id','selected_player_id','source_revision','as_of','next_due_at','dependencies','part_count','record_hash'],[[realm,ownerId,selection,view.player?.id??null,record.revision,now,nextDue,JSON.stringify(dependencies),pieces.length,await hashRecord(body)]],[],dependencyGuard),
      ...guardedReadModelRows(db,realm,record.token,'world_player_view_parts',['realm_id','owner_id','selection_id','part_index','body'],pieces.map((part,index)=>[realm,ownerId,selection,index,part]),[],dependencyGuard),
    ];
    if(statements.length<=maxBatchStatements)await writeD1Once('compareAndSwap',async()=>{const results=await db.batch(statements);if(results.some(result=>!result.success))throw new Error('La proyección de aldea no pudo publicarse.');});
    return view;
  }
  return {read, project, projectVillage, publicMutations};
}
