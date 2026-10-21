import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqliteD1 } from './support/d1-sqlite.ts';
import { createPartitionedMvpStore } from '../lib/mvp/partitioned-store.ts';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import { quoteMvp, readMvpView } from '../lib/mvp/engine.ts';
import { give } from '../lib/mvp/helpers.ts';
import { settleSocial } from '../lib/mvp/social.ts';
import { getBoostPassWallet } from '../lib/mvp/boost-passes.ts';
import { villageReadVersions, villageTarget } from '../lib/mvp/village-execution.ts';
import { dispatchProduction } from '../lib/mvp/production.ts';
import type { MvpWorld, Player } from '../lib/mvp/types.ts';

const NOW = Date.parse('2026-10-20T12:00:00Z');
async function fixture(configure: (world: MvpWorld, a: Player, b: Player) => void) {
  const db = createSqliteD1();
  for (const path of ['drizzle/0000_odd_warlock.sql', 'db/partitioned-world.sql', 'db/player-read-model.sql', 'db/village-writes.sql']) db.sqlite.exec(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  const world = createMvpWorld('admin', NOW);
  const add = (name: string) => createPlayer(world, { ownerId: `owner-${name}`, now: NOW, actor: null, requestId: crypto.randomUUID() }, { type: 'player.create', name, stationName: `Aldea ${name}`, faction: 'cartographers' });
  const a = add('Alba'), b = add('Beto');
  settleSocial(world, NOW);
  configure(world, a, b);
  const store = () => createPartitionedMvpStore(db, { metadataVersioning: true, villageWrites: true, maxBatchStatements: 900 });
  await store().insert(world);
  return { db, a, b, store, read: () => store().read() };
}

test('a buyer cannot be charged for an offline maker offer whose food expired before the offer deadline', async () => {
  const f = await fixture((world, a, b) => {
    const lot = give(a, 'ration', 1, NOW, 'existing-market-food');
    a.inventory.splice(a.inventory.indexOf(lot), 1); lot.expiresAt = NOW + 1_000;
    world.social.accounts[b.id].credits = 20;
    world.social.offers.push({ id: 'food-offer', makerId: a.id, mode: 'credits', itemId: 'ration', qty: 1, lots: [lot], wantItemId: null, wantQty: 0, price: 5, fee: 0, status: 'open', createdAt: NOW, expiresAt: NOW + 86_400_000, takerId: null });
  });
  try {
    const before = (await f.read())!;
    await assert.rejects(quoteMvp(f.store(), f.b.ownerId, { type: 'market.fill', playerId: f.b.id, offerId: 'food-offer' }, crypto.randomUUID(), NOW + 2_000), /oferta|caduc|venc/i);
    const after = (await f.read())!;
    assert.equal(after.world.social.accounts[f.b.id].credits, before.world.social.accounts[f.b.id].credits);
    assert.equal(after.world.social.offers[0].status === 'filled', false);
    assert.equal(after.world.players[f.b.id].stats.trades, 0);
  } finally { f.db.close(); }
});

test('shared treaty expiry is settled even while every active player uses village-local commands and reads', async () => {
  const f = await fixture(world => {
    world.social.alliances.push({ id: 'expired-treaty', name: 'Pacto temporal', clanIds: [], acceptedClanIds: [], status: 'active', expiresAt: NOW + 1_000, noAggression: true });
  });
  try {
    await readMvpView(f.store(), f.b.ownerId, f.b.id, NOW + 2_000);
    const after = (await f.read())!;
    assert.equal(after.world.social.alliances[0].status, 'ended');
    assert.equal(after.world.social.alliances[0].noAggression, false);
  } finally { f.db.close(); }
});

test('an offline neighbor cannot hold the sole regional caravan and its NPC escrow forever after the collection deadline', async () => {
  const f = await fixture((world, a) => {
    world.social.npc.remaining -= 12;
    world.social.npc.demand.plank!.remaining -= 2;
    a.habitable = { version: 1, appearance: 'pine', profession: 'carpenter', position: { x: 0, y: 1.5 }, buildings: [], commerce: { sequence: 1, contracts: [{ id: 'offline-trade', buildingId: 'old-shed', status: 'accepted', quantity: 2, price: 12, escrow: 12, acceptedAt: NOW, deadline: NOW + 1_000, cargo: [], caravan: { id: 'offline-caravan', playerId: a.id, plot: { x: a.settlement!.x, y: a.settlement!.y }, destination: { name: 'Valleverde', x: 1, y: 1 }, route: { points: [{ x: 0, y: 0, height: 0 }, { x: 1, y: 1, height: 0 }], length: Math.SQRT2, bridges: [] }, approachStartsAt: NOW, approachEndsAt: NOW + 100, quantity: 2 } }] } };
  });
  try {
    const before = (await f.read())!;
    await readMvpView(f.store(), f.b.ownerId, f.b.id, NOW + 2_000);
    const after = (await f.read())!, trade = after.world.players[f.a.id].habitable!.commerce!.contracts[0];
    assert.equal(trade.status, 'expired');
    assert.equal(trade.escrow, 0);
    assert.equal(after.world.social.npc.remaining, before.world.social.npc.remaining + 12);
    assert.equal(after.world.social.npc.demand.plank!.remaining, before.world.social.npc.demand.plank!.remaining + 2);
    assert.ok(trade.caravan.returnTrip, 'the already visible vehicle follows its return route rather than disappearing');
    await readMvpView(f.store(), f.b.ownerId, f.b.id, NOW + 3_000);
    assert.equal((await f.read())!.world.social.npc.remaining, after.world.social.npc.remaining, 'the shared refund occurs only once');
  } finally { f.db.close(); }
});

test('concurrent independent ledger appends preserve the adjacent debit/payment evidence of a real earned boost pass', async () => {
  const f = await fixture((_world, a) => { give(a, 'timber', 1, NOW, 'existing-sale-material'); });
  try {
    const a = f.store(), b = f.store(), ra = (await a.read())!, rb = (await b.read())!;
    const na = structuredClone(ra.world), nb = structuredClone(rb.world), pa = na.players[f.a.id];
    const lot = pa.inventory.find(l => l.itemId === 'timber' && !l.bound)!; lot.qty--;
    pa.inventory = pa.inventory.filter(l => l.qty > 0);
    na.social.npc.remaining -= 2; na.social.npc.demand.timber!.remaining--;
    na.social.accounts[f.a.id].credits += 2;
    na.social.ledger.push(
      { id: 'ledger_v_aaa_1', at: NOW, currency: 'item', amount: 1, from: f.a.id, to: 'npc-season', reason: 'Productos entregados al encargo finito', itemId: 'timber' },
      { id: 'ledger_v_aaa_2', at: NOW, currency: 'credits', amount: 2, from: 'npc-season', to: f.a.id, reason: 'Encargo NPC con presupuesto limitado' },
    );
    nb.social.accounts[f.b.id].boundCredits -= 10;
    nb.social.ledger.push({ id: 'ledger_v_zzz_1', at: NOW, currency: 'bound-credits', amount: 10, from: f.b.id, to: 'service', reason: 'Servicio de estación: crédito vinculado' });
    assert.equal(getBoostPassWallet(na, f.a.ownerId, NOW).contractEarned, 1, 'the transaction alone contains the canonical proof');
    const commitB = await b.compareAndSwapVillage!(rb, nb, { now: NOW, ownerId: f.b.ownerId, playerId: f.b.id, readVersions: villageReadVersions(rb, f.b.ownerId, f.b.id) });
    assert.ok(commitB);
    const commitA = await a.compareAndSwapVillage!(ra, na, { now: NOW, ownerId: f.a.ownerId, playerId: f.a.id, readVersions: villageReadVersions(ra, f.a.ownerId, f.a.id) });
    assert.ok(commitA, 'independent account writes may both commit');
    assert.equal(commitA.world.social.ledger.length, 3);
    assert.equal(getBoostPassWallet(commitA.world, f.a.ownerId, NOW).contractEarned, 1, 'another account must not split this debit/payment evidence');
  } finally { f.db.close(); }
});

test('an offline pair of finished extractors does not permanently block the two shared resource slots', async () => {
  let newcomerId = '', newcomerOwner = '';
  const f = await fixture((world, a, b) => {
    const newcomer = createPlayer(world, { ownerId: 'owner-Cora', now: NOW, actor: null, requestId: crypto.randomUUID() }, { type: 'player.create', name: 'Cora', stationName: 'Aldea Cora', faction: 'cartographers' });
    newcomerId = newcomer.id; newcomerOwner = newcomer.ownerId;
    const tile = Object.values(world.tiles).find(t => t.deposits.some(d => d.itemId === 'timber'))!;
    for (const p of [a, b, newcomer]) { p.position = tile.id; p.surveyed.push(tile.id); }
    for (const p of [a, b]) dispatchProduction(world, { type: 'mining.reserve', playerId: p.id, tileId: tile.id, itemId: 'timber', qty: 1 }, { ownerId: p.ownerId, now: NOW, requestId: crypto.randomUUID(), actor: p });
  });
  try {
    const initial = (await f.read())!, at = Math.max(...Object.values(initial.world.jobs).map(j => j.endsAt)) + 1;
    await readMvpView(f.store(), newcomerOwner, newcomerId, at);
    const after = (await f.read())!;
    assert.ok(Object.values(after.world.jobs).every(j => j.status === 'completed'));
    const tileId = after.world.players[newcomerId].position, deposit = after.world.tiles[tileId].deposits.find(d => d.itemId === 'timber')!;
    assert.equal(deposit.layers.reduce((n, l) => n + l.reserved, 0), 0);
    await quoteMvp(f.store(), newcomerOwner, { type: 'mining.reserve', playerId: newcomerId, tileId, itemId: 'timber', qty: 1 }, crypto.randomUUID(), at);
    assert.equal(Object.values((await f.read())!.world.jobs).length, 2, 'reviewing the newly available slot does not reserve it');
  } finally { f.db.close(); }
});

test('incoming foreign battles retain the global participant closure and their index participates in village read authority', async () => {
  const f = await fixture((world, a, b) => {
    const id = 'incoming-battle-job', battleId = 'incoming-battle';
    world.jobs[id] = { id, playerId: a.id, kind: 'battle', status: 'running', createdAt: NOW, startsAt: NOW, endsAt: NOW + 20_000, ruleVersion: world.rulesVersion, weather: weatherFor(world.tiles[a.position].regionId, NOW), route: [a.position], costs: [], payload: { battleId, tileId: a.position, unitIds: [] }, report: [] };
    world.battles[battleId] = { id: battleId, attackerId: a.id, targetId: b.id, npc: false, convoyId: null, status: 'scheduled', jobId: id, rounds: [], winnerId: null, loot: [], report: [], resolvedAt: null };
  });
  try {
    const store = f.store(), record = (await store.read())!;
    assert.equal(villageTarget(store, record, f.b.ownerId, f.b.id, { type: 'craft.start', playerId: f.b.id, recipeId: 'plank', qty: 1 }, NOW), undefined);
    assert.ok(Object.hasOwn(villageReadVersions(record, f.b.ownerId, f.b.id), `indice:batallas:${f.b.id}`));
  } finally { f.db.close(); }
});
