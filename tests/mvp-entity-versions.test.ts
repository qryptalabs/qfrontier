import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEntityVersions, commandVersionKeys, deriveEntityValues, selectEntityVersions, selectPlayerViewVersionKeys } from '../lib/mvp/entity-versions.ts';
import type { EntityVersions } from '../lib/mvp/entity-versions.ts';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import type { Job, MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

const now = Date.parse('2026-10-20T12:00:00Z');
function fixture() {
  const world = createMvpWorld('owner-alba', now);
  const add = (ownerId: string, name: string) => createPlayer(world, { ownerId, now, requestId: crypto.randomUUID(), actor: null }, { type: 'player.create', name, stationName: `Aldea ${name}`, faction: 'cartographers' });
  const own = add('owner-alba', 'Alba'), other = add('owner-beto', 'Beto'), alternate = add('owner-alba', 'Alba dos');
  for (const player of [own, other, alternate]) world.social.accounts[player.id] = { credits: 100, boundCredits: 50, simUnits: 1000 };
  return { world, own, other, alternate, owner: own.ownerId };
}
function craft(playerId: string, boost = false): MvpCommand { return { type: 'craft.start', playerId, recipeId: 'plank', qty: 1, ...(boost ? { useTestBoost: true } : {}) }; }
function change(world: MvpWorld, mutate: (next: MvpWorld) => void, versions: EntityVersions = {}) {
  const next = structuredClone(world);
  mutate(next);
  return { next, versions: advanceEntityVersions(world, next, versions) };
}
function extraction(world: MvpWorld, playerId: string, tileId: string, itemId: string): Job {
  return { id: 'job-scope-extract', playerId, kind: 'extract', status: 'running', createdAt: now, startsAt: now, endsAt: now + 10000, ruleVersion: world.rulesVersion, weather: weatherFor(world.tiles[tileId].regionId, now), route: [tileId], costs: [], payload: { tileId, itemId, qty: 1, layerId: 'layer_0' }, report: [] };
}
function addOffer(f: ReturnType<typeof fixture>) {
  const offer = { id: 'offer-version-fixture', makerId: f.other.id, mode: 'credits' as const, itemId: 'timber' as const, qty: 1, lots: [{ ...structuredClone(f.other.inventory[0]), qty: 1, bound: false }], wantItemId: null, wantQty: 0, price: 2, fee: 0, status: 'open' as const, createdAt: now, expiresAt: now + 86400000, takerId: null };
  f.world.social.offers.push(offer);
  return offer;
}

test('entity values are canonical, pure, and retain meaningful lot order', () => {
  const f = fixture(), original = structuredClone(f.world), values = deriveEntityValues(f.world);
  const reordered = structuredClone(f.world);
  reordered.players[f.own.id] = Object.fromEntries(Object.entries(reordered.players[f.own.id]).reverse()) as typeof f.own;
  assert.deepEqual(deriveEntityValues(reordered), values);
  reordered.players[f.own.id].inventory.reverse();
  assert.notEqual(deriveEntityValues(reordered)[`aldea:${f.own.id}`], values[`aldea:${f.own.id}`]);
  assert.deepEqual(f.world, original);
});

test('monotonic versions reject ABA even when semantic content is restored', () => {
  const f = fixture(), first = change(f.world, next => { next.players[f.own.id].inventory[0].qty--; });
  const restored = advanceEntityVersions(first.next, f.world, first.versions);
  assert.equal(first.versions[`aldea:${f.own.id}`], 1);
  assert.equal(restored[`aldea:${f.own.id}`], 2);
  assert.deepEqual(deriveEntityValues(f.world), deriveEntityValues(structuredClone(f.world)));
  assert.deepEqual(advanceEntityVersions(f.world, f.world, restored), restored);
});

test('deleted entities retain tombstones and recreation advances the original counter', () => {
  const f = fixture(), removed = change(f.world, next => { delete next.players[f.other.id]; });
  const key = `aldea:${f.other.id}`;
  assert.equal(removed.versions[key], 1);
  assert.equal(Object.hasOwn(deriveEntityValues(removed.next), key), false);
  const restored = advanceEntityVersions(removed.next, f.world, removed.versions);
  assert.equal(restored[key], 2);
  assert.equal(removed.versions[key], 1, 'the original version map is not modified');
});

test('another account private inventory and global allocators do not invalidate an own craft', () => {
  const f = fixture(), command = craft(f.own.id), before = selectEntityVersions(f.world, f.owner, command, {});
  const result = change(f.world, next => {
    next.players[f.other.id].inventory[0].qty--;
    next.counters.job += 10; next.counters.event += 10; next.social.sequence += 10;
    next.receipts['unrelated:operation'] = 'digest';
    next.events.push({ id: 'event-other', playerId: f.other.id, playerName: 'Beto', text: 'Actividad ajena', at: now });
  });
  assert.deepEqual(selectEntityVersions(result.next, f.owner, command, result.versions), before);
  assert.equal(result.versions[`aldea:${f.other.id}`], 1);
});

test('changing one own lot quality, binding or expiry advances the village dependency', () => {
  const f = fixture(), command = craft(f.own.id), before = selectEntityVersions(f.world, f.owner, command, {});
  for (const mutate of [(world: MvpWorld) => { world.players[f.own.id].inventory[0].quality++; }, (world: MvpWorld) => { world.players[f.own.id].inventory[0].bound = false; }, (world: MvpWorld) => { world.players[f.own.id].inventory[0].expiresAt = now + 1000; }]) {
    const result = change(f.world, mutate);
    assert.notDeepEqual(selectEntityVersions(result.next, f.owner, command, result.versions), before);
  }
});

test('another own profile changes shared reward scope for both plain and boosted crafts', () => {
  const f = fixture(), plain = craft(f.own.id), boosted = craft(f.own.id, true);
  const plainBefore = selectEntityVersions(f.world, f.owner, plain, {}), boostedBefore = selectEntityVersions(f.world, f.owner, boosted, {});
  const result = change(f.world, next => {
    const job = extraction(next, f.alternate.id, f.alternate.position, 'timber');
    job.id = 'job-other-profile-boost'; job.kind = 'craft';
    job.payload = { recipeId: 'plank', qty: 1, testBoost: { version: 2, mode: 'test', reservedAt: now, baseSeconds: 30, durationSeconds: 24, savedSeconds: 6, passCost: 1 } };
    next.jobs[job.id] = job;
  });
  assert.notDeepEqual(selectEntityVersions(result.next, f.owner, plain, result.versions), plainBefore);
  assert.notDeepEqual(selectEntityVersions(result.next, f.owner, boosted, result.versions), boostedBefore);
  assert.equal(result.versions[`cuenta:${f.owner}`], 1);
});

test('same deposit reservations conflict while an unrelated deposit leaves the scope intact', () => {
  const f = fixture(), tiles = Object.values(f.world.tiles), target = tiles[0], deposit = target.deposits[0], unrelated = tiles[1];
  const command = { type: 'mining.reserve', playerId: f.own.id, tileId: target.id, itemId: deposit.itemId, qty: 1 };
  const before = selectEntityVersions(f.world, f.owner, command, {});
  const otherResource = change(f.world, next => { next.tiles[unrelated.id].deposits[0].layers[0].reserved++; });
  assert.deepEqual(selectEntityVersions(otherResource.next, f.owner, command, otherResource.versions), before);
  const same = change(f.world, next => {
    next.tiles[target.id].deposits[0].layers[0].reserved++;
    const job = extraction(next, f.other.id, target.id, deposit.itemId); next.jobs[job.id] = job;
  });
  assert.notDeepEqual(selectEntityVersions(same.next, f.owner, command, same.versions), before);
  assert.equal(same.versions[`indice:extraccion:${target.id}:${deposit.itemId}`], 1);
});

test('slot absence is versioned even if a competing extraction does not alter deposit totals', () => {
  const f = fixture(), tile = Object.values(f.world.tiles)[0], itemId = tile.deposits[0].itemId;
  const command = { type: 'mining.reserve', playerId: f.own.id, tileId: tile.id, itemId, qty: 1 };
  const result = change(f.world, next => { const job = extraction(next, f.other.id, tile.id, itemId); next.jobs[job.id] = job; });
  assert.notDeepEqual(selectEntityVersions(result.next, f.owner, command, result.versions), selectEntityVersions(f.world, f.owner, command, {}));
});

test('farm scopes share the regional finite budget but not other regional stock', () => {
  const f = fixture(), command = { type: 'farm.start', playerId: f.own.id }, regionId = f.world.tiles[f.own.position].regionId;
  const before = selectEntityVersions(f.world, f.owner, command, {});
  const otherId = Object.keys(f.world.regions).find(id => id !== regionId)!;
  const different = change(f.world, next => { next.regions[otherId].farmRemaining--; });
  assert.deepEqual(selectEntityVersions(different.next, f.owner, command, different.versions), before);
  const same = change(f.world, next => { next.regions[regionId].farmRemaining--; });
  assert.notDeepEqual(selectEntityVersions(same.next, f.owner, command, same.versions), before);
});

test('NPC sales depend on both selected demand and the shared credit budget', () => {
  const f = fixture(), command = { type: 'npc.sell', playerId: f.own.id, itemId: 'timber', qty: 1 };
  const before = selectEntityVersions(f.world, f.owner, command, {});
  const paymentElsewhere = change(f.world, next => { next.social.npc.remaining -= 6; next.social.npc.demand.plank!.remaining--; });
  assert.notDeepEqual(selectEntityVersions(paymentElsewhere.next, f.owner, command, paymentElsewhere.versions), before);
  const onlyDemandElsewhere = change(f.world, next => { next.social.npc.demand.plank!.remaining--; });
  assert.deepEqual(selectEntityVersions(onlyDemandElsewhere.next, f.owner, command, onlyDemandElsewhere.versions), before);
});

test('market fill versions the escrow, maker balance and deleted offer tombstone', () => {
  const f = fixture(), offer = addOffer(f), command = { type: 'market.fill', playerId: f.own.id, offerId: offer.id };
  const before = selectEntityVersions(f.world, f.owner, command, {});
  for (const mutate of [(world: MvpWorld) => { world.social.offers[0].lots[0].bound = true; }, (world: MvpWorld) => { world.social.accounts[f.other.id].credits++; }, (world: MvpWorld) => { world.social.offers = []; }]) {
    const result = change(f.world, mutate);
    assert.notDeepEqual(selectEntityVersions(result.next, f.owner, command, result.versions), before);
  }
});

test('market publishing guards absence and the own open-offer limit', () => {
  const f = fixture(), offer = addOffer(f), command = { type: 'market.publish', playerId: f.own.id, itemId: 'timber', qty: 1, mode: 'credits', price: 2 };
  const before = selectEntityVersions(f.world, f.owner, command, {});
  const unrelated = change(f.world, next => { next.social.offers[0].price++; });
  assert.deepEqual(selectEntityVersions(unrelated.next, f.owner, command, unrelated.versions), before);
  const ownOffer = change(f.world, next => { next.social.offers.push({ ...structuredClone(offer), id: 'offer-own', makerId: f.own.id }); });
  assert.notDeepEqual(selectEntityVersions(ownOffer.next, f.owner, command, ownOffer.versions), before);
});

test('contract acceptance includes requester funds and delivery includes requester inventory', () => {
  const f = fixture(), contract = { id: 'contract-scope', requesterId: f.other.id, carrierId: null, kind: 'delivery' as const, itemId: 'timber' as const, qty: 1, quality: 1, destination: f.own.position, price: 10, escrow: 0, cargo: [], deadline: now + 60000, status: 'published' as const };
  f.world.social.contracts.push(contract);
  for (const type of ['contract.accept', 'contract.deliver']) {
    const command = { type, playerId: f.own.id, contractId: contract.id }, before = selectEntityVersions(f.world, f.owner, command, {});
    const changed = change(f.world, next => { next.social.accounts[f.other.id].credits--; next.players[f.other.id].inventory[0].qty++; });
    assert.notDeepEqual(selectEntityVersions(changed.next, f.owner, command, changed.versions), before);
  }
});

test('travel versions topology including a newly opened bridge outside its old route', () => {
  const f = fixture(), command = { type: 'world.travel', playerId: f.own.id, tileId: 't_0_0' };
  const before = selectEntityVersions(f.world, f.owner, command, {}), bridge = Object.values(f.world.tiles).find(tile => tile.terrain === 'water')!;
  const result = change(f.world, next => { next.tiles[bridge.id].bridge = true; });
  assert.notDeepEqual(selectEntityVersions(result.next, f.owner, command, result.versions), before);
  const unrelatedStock = change(f.world, next => { next.tiles[bridge.id].deposits[0].layers[0].remaining--; });
  assert.deepEqual(selectEntityVersions(unrelatedStock.next, f.owner, command, unrelatedStock.versions), before);
});

test('survey follows membership, pact and outpost absence indices', () => {
  const f = fixture(), clan = { id: 'clan-scope', name: 'Alba', members: { [f.own.id]: 'founder' as const }, credits: 0, lots: [], highCreditAmount: 100, highItemAmount: 10, withdrawals: [] };
  f.world.social.clans.push(clan);
  const command = { type: 'world.survey', playerId: f.own.id, tileId: f.own.position }, before = selectEntityVersions(f.world, f.owner, command, {});
  const result = change(f.world, next => { next.social.outposts.push({ id: 'post-new', clanId: clan.id, holderId: f.own.id, tileId: f.own.position, purpose: 'observatory', status: 'active', createdAt: now, expiresAt: now + 60000, maintenanceUntil: now + 30000, history: [] }); });
  assert.notDeepEqual(selectEntityVersions(result.next, f.owner, command, result.versions), before);
});

test('cancelled farm and mining jobs retain their shared resource dependency', () => {
  const f = fixture(), tile = Object.values(f.world.tiles)[0], job = extraction(f.world, f.own.id, tile.id, tile.deposits[0].itemId);
  f.world.jobs[job.id] = job;
  const keys = commandVersionKeys(f.world, f.owner, { type: 'job.cancel', playerId: f.own.id, jobId: job.id })!;
  assert.ok(keys.includes(`recurso:deposito:${tile.id}:${tile.deposits[0].itemId}`));
  job.kind = 'farm'; job.payload.regionId = tile.regionId;
  assert.ok(commandVersionKeys(f.world, f.owner, { type: 'craft.cancel', playerId: f.own.id, jobId: job.id })!.includes(`recurso:region:${tile.regionId}`));
});

test('all scoped commands include policies and authenticated identity; complex commands fail closed', () => {
  const f = fixture();
  for (const type of ['habitat.profile', 'habitat.walk', 'habitat.build', 'craft.start', 'market.publish']) {
    const keys = commandVersionKeys(f.world, f.owner, { type, playerId: f.own.id })!;
    assert.ok(keys.includes('politicas'));
    assert.ok(keys.includes(`identidad:cuenta:${f.owner}`));
    assert.ok(keys.includes(`cuenta:${f.owner}`));
    assert.ok(keys.includes(`identidad:jugador:${f.own.id}`));
  }
  for (const type of ['unknown.action', 'clan.withdraw', 'funding.release', 'reward.close', 'habitat.manager.start', 'habitat.land.claim', 'battle.raid', 'player.create']) {
    assert.equal(commandVersionKeys(f.world, f.owner, { type, playerId: f.own.id }), null);
    assert.equal(selectEntityVersions(f.world, f.owner, { type, playerId: f.own.id }, {}), null);
  }
  assert.equal(commandVersionKeys(f.world, f.other.ownerId, craft(f.own.id)), null);
  assert.equal(commandVersionKeys(f.world, f.owner, { type: 'craft.start' }), null);
});

test('version maps reject invalid counters and overflow rather than wrapping or resetting', () => {
  const f = fixture(), changed = structuredClone(f.world); changed.players[f.own.id].name = 'Otro nombre';
  for (const version of [-1, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => advanceEntityVersions(f.world, changed, { [`aldea:${f.own.id}`]: version }), RangeError);
  assert.throws(() => advanceEntityVersions(f.world, changed, { [`aldea:${f.own.id}`]: Number.MAX_SAFE_INTEGER }), RangeError);
  assert.throws(() => selectEntityVersions(f.world, f.owner, craft(f.own.id), { politicas: -1 }), RangeError);
});

test('private view guards detect new shared rows and clan ledger without unrelated private stock', () => {
  const f = fixture(), before = selectPlayerViewVersionKeys(f.world, f.owner, {});
  const privateStock = change(f.world, next => { next.players[f.other.id].inventory[0].qty--; });
  assert.deepEqual(selectPlayerViewVersionKeys(privateStock.next, f.owner, privateStock.versions), before);
  const sharedEvent = change(f.world, next => { next.events.push({ id: 'event-visible', playerId: f.other.id, playerName: 'Beto', text: 'Historia nueva', at: now }); });
  assert.notDeepEqual(selectPlayerViewVersionKeys(sharedEvent.next, f.owner, sharedEvent.versions), before);
  const clan = { id: 'clan-ledger-scope', name: 'Alba', members: { [f.own.id]: 'founder' as const }, credits: 0, lots: [], highCreditAmount: 100, highItemAmount: 10, withdrawals: [] };
  f.world.social.clans.push(clan);
  const clanBefore = selectPlayerViewVersionKeys(f.world, f.owner, {});
  const ledger = change(f.world, next => { next.social.ledger.push({ id: 'ledger-clan-visible', at: now, currency: 'credits', amount: 1, from: 'third-party', to: clan.id, reason: 'Registro del clan' }); });
  assert.notDeepEqual(selectPlayerViewVersionKeys(ledger.next, f.owner, ledger.versions), clanBefore);
});

test('command scope keys never expose another authenticated owner identifier', () => {
  const f = fixture(), offer = addOffer(f);
  const keys = commandVersionKeys(f.world, f.owner, { type: 'market.fill', playerId: f.own.id, offerId: offer.id })!;
  assert.ok(keys.includes(`cartera:${f.other.id}`));
  assert.equal(keys.some(key => key.includes(f.other.ownerId)), false);
});
