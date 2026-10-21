import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRoyalHarborTrade, readRoyalHarbor } from '../lib/mvp/royal-harbor-service.ts';
import { previewRoyalHarborState, ROYAL_HARBOR_FISHERY_BUDGET, royalHarborSnapshot, settleRoyalHarborState } from '../lib/mvp/royal-harbor.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';
import { give } from '../lib/mvp/helpers.ts';
import { getSocialView } from '../lib/mvp/social.ts';
import { decodeWorldRecords, serializeWorldRecords } from '../lib/mvp/partitioned-codec.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpWorld } from '../lib/mvp/types.ts';

const NOW = Date.parse('2026-10-18T20:00:00Z');
class MemoryStore implements MvpStore {
  record: { revision: number; world: MvpWorld };
  writes = 0;
  inserted = 0;
  ambiguous = false;
  constructor(world: MvpWorld) { this.record = { revision: 748, world: structuredClone(world) }; }
  async read() { return structuredClone(this.record); }
  async insert() { this.inserted++; throw new Error('This district must never create or reset a world'); }
  async compareAndSwap(revision: number, world: MvpWorld) {
    if (revision !== this.record.revision) return false;
    this.record = { revision: revision + 1, world: structuredClone(world) }; this.writes++;
    if (this.ambiguous) { this.ambiguous = false; throw new Error('Transport ended after commit'); }
    return true;
  }
}
function fixture() {
  const owner = 'harbor-owner', world = createMvpWorld(owner, NOW - 86_400_000);
  const player = createPlayer(world, { ownerId: owner, requestId: crypto.randomUUID(), now: NOW - 86_400_000, actor: null }, { type: 'player.create', name: 'Marina', stationName: 'Refugio del Alba', faction: 'cartographers' });
  world.social.accounts[player.id] = { credits: 100, boundCredits: 50, simUnits: 1_000 }; world.social.npc.remaining -= 100;
  return { owner, id: player.id, store: new MemoryStore(world) };
}
type Fixture = ReturnType<typeof fixture>;
const player = (s: Fixture) => s.store.record.world.players[s.id];
const request = (s: Fixture, type = 'royal-harbor.buy', good = 'fish', qty = 1, requestId = crypto.randomUUID()) => ({ requestId, expectedRevision: s.store.record.revision, command: { type, playerId: s.id, good, qty } });
const money = (world: MvpWorld) => world.social.npc.remaining + (world.royalHarbor?.credits ?? 0) + Object.values(world.social.accounts).reduce((total, account) => total + account.credits, 0);
function fishUnits(world: MvpWorld) {
  const harbor = world.royalHarbor!;
  return harbor.fishery.remaining + harbor.fishery.spoiled + Object.values(harbor.stocks).flat().filter(lot => lot.provenance.source === 'corona-del-alba:fishing-quota').reduce((total, lot) => total + lot.qty, 0) + Object.values(world.players).flatMap(p => p.inventory).filter(lot => lot.provenance.source === 'corona-del-alba:fishing-quota').reduce((total, lot) => total + lot.qty, 0);
}

test('opening and polling the city are pure legacy reads: all saves, balances, timestamps and revision remain exact', async () => {
  const s = fixture(), before = structuredClone(s.store.record);
  const first = await readRoyalHarbor(s.store, s.owner, s.id, NOW);
  assert.equal(first.initialized, false); assert.equal(first.goods[0].stock, 12); assert.equal(first.account.credits, 100); assert.equal(first.cycle.phase, 'outbound');
  await readRoyalHarbor(s.store, s.owner, s.id, NOW + 115_000);
  await readRoyalHarbor(s.store, s.owner, s.id, NOW + 14 * 86_400_000);
  assert.deepEqual(s.store.record, before); assert.equal(s.store.writes, 0); assert.equal(s.store.inserted, 0); assert.equal(s.store.record.world.royalHarbor, undefined);
});

test('the first confirmed purchase reserves existing NPC funds once and atomically transfers exact goods and credits', async () => {
  const s = fixture(), before = structuredClone(s.store.record.world), total = money(before), result = await executeRoyalHarborTrade(s.store, s.owner, request(s, 'royal-harbor.buy', 'fish', 2), NOW);
  const world = s.store.record.world, harbor = world.royalHarbor!;
  assert.equal(world.social.npc.remaining, before.social.npc.remaining - 512); assert.equal(harbor.initializedCredits, 512); assert.equal(harbor.credits, 526); assert.equal(world.social.accounts[s.id].credits, 86); assert.equal(money(world), total);
  assert.equal(result.initialized, true); assert.equal(result.goods[0].stock, 10); assert.equal(result.revision, 749); assert.equal(s.store.writes, 1);
  const fish = player(s).inventory.filter(lot => lot.provenance.source === 'corona-del-alba:fishing-quota'); assert.equal(fish.reduce((n, lot) => n + lot.qty, 0), 2); assert.ok(fish.every(lot => !lot.bound && lot.originLotId?.includes('opening-market') && lot.location === 'station'));
  assert.equal(fishUnits(world), ROYAL_HARBOR_FISHERY_BUDGET); assert.deepEqual(player(s).habitable, before.players[s.id].habitable); assert.deepEqual(player(s).settlement, before.players[s.id].settlement); assert.equal(player(s).position, before.players[s.id].position);
  assert.deepEqual(world.jobs, before.jobs); assert.deepEqual(world.regions, before.regions); assert.deepEqual(world.tiles, before.tiles); assert.equal(world.social.ledger.length, 2);
});

test('selling transferable timber preserves bound tutorial material and provenance and pays from a finite real reserve', async () => {
  const s = fixture(), original = give(player(s), 'timber', 5, NOW, 'existing-forestry-output'); original.quality = 3; original.wear = 2;
  const source = structuredClone(original), bound = structuredClone(player(s).inventory.filter(lot => lot.itemId === 'timber' && lot.bound)), total = money(s.store.record.world);
  const result = await executeRoyalHarborTrade(s.store, s.owner, request(s, 'royal-harbor.sell', 'timber', 3), NOW);
  assert.equal(result.goods.find(good => good.id === 'timber')!.stock, 3); assert.equal(result.account.credits, 106); assert.equal(money(s.store.record.world), total);
  assert.deepEqual(player(s).inventory.filter(lot => lot.itemId === 'timber' && lot.bound), bound);
  const sold = s.store.record.world.royalHarbor!.stocks.market.find(lot => lot.itemId === 'timber')!;
  assert.deepEqual(sold.provenance, source.provenance); assert.equal(sold.quality, 3); assert.equal(sold.wear, 2); assert.equal(sold.qty, 3); assert.equal(sold.originLotId, source.id); assert.notEqual(sold.id, source.id);
  assert.equal(player(s).inventory.find(lot => lot.id === source.id)!.qty, 2);
});

test('bound, expired and poor-quality goods, a poor buyer or exhausted merchant never partially initialize or debit a save', async () => {
  for (const kind of ['bound', 'expired', 'quality', 'buyer', 'merchant'] as const) {
    const s = fixture();
    if (kind === 'expired' || kind === 'quality') { const lot = give(player(s), 'plank', 2, NOW, 'invalid-sale-fixture'); if (kind === 'expired') lot.expiresAt = NOW; else lot.quality = 0; }
    if (kind === 'buyer') s.store.record.world.social.accounts[s.id].credits = 0;
    if (kind === 'merchant') { give(player(s), 'plank', 2, NOW, 'valid-limited-sale'); s.store.record.world.social.npc.remaining = 0; }
    const before = structuredClone(s.store.record);
    const command = kind === 'buyer' ? request(s) : request(s, 'royal-harbor.sell', kind === 'bound' ? 'timber' : 'plank');
    await assert.rejects(executeRoyalHarborTrade(s.store, s.owner, command, NOW)); assert.deepEqual(s.store.record, before, kind); assert.equal(s.store.writes, 0);
  }
});

test('authentication, explorer ownership, quantities, products and server-owned prices fail closed before a write', async () => {
  const s = fixture(), before = structuredClone(s.store.record);
  await assert.rejects(readRoyalHarbor(s.store, '', s.id, NOW), /Inicia sesión/);
  await assert.rejects(readRoyalHarbor(s.store, 'stranger', s.id, NOW), /pertenece/);
  await assert.rejects(readRoyalHarbor(s.store, s.owner, '__proto__', NOW), /pertenece/);
  await assert.rejects(executeRoyalHarborTrade(s.store, 'stranger', request(s), NOW), /pertenece/);
  for (const change of [{ qty: 0 }, { qty: 1.5 }, { qty: 21 }, { qty: '2' }, { good: 'season_relic' }, { good: '__proto__' }, { price: 0 }, { type: 'admin.mint' }]) {
    const body = request(s); await assert.rejects(executeRoyalHarborTrade(s.store, s.owner, { ...body, command: { ...body.command, ...change } }, NOW));
  }
  const body = request(s); await assert.rejects(executeRoyalHarborTrade(s.store, s.owner, { ...body, expectedRevision: undefined }, NOW));
  assert.deepEqual(s.store.record, before); assert.equal(s.store.writes, 0);
});

test('confirmed retries are idempotent across stale revisions; reusing their identifier for another command is rejected', async () => {
  const s = fixture(), body = request(s, 'royal-harbor.buy', 'fish', 2);
  await executeRoyalHarborTrade(s.store, s.owner, body, NOW); const after = structuredClone(s.store.record);
  const retry = await executeRoyalHarborTrade(s.store, s.owner, body, NOW + 10_000);
  assert.equal(retry.revision, after.revision); assert.deepEqual(s.store.record, after); assert.equal(s.store.writes, 1);
  await assert.rejects(executeRoyalHarborTrade(s.store, s.owner, { ...body, command: { ...body.command, qty: 3 } }, NOW), /otra operación/);
  assert.deepEqual(s.store.record, after);
});

test('concurrent buyers cannot oversell and simultaneous retries commit one receipt and one transfer', async () => {
  const s = fixture(), total = money(s.store.record.world), a = request(s, 'royal-harbor.buy', 'fish', 10), b = request(s, 'royal-harbor.buy', 'fish', 10);
  const results = await Promise.allSettled([executeRoyalHarborTrade(s.store, s.owner, a, NOW), executeRoyalHarborTrade(s.store, s.owner, b, NOW)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(s.store.writes, 1); assert.equal(s.store.record.world.royalHarbor!.stocks.market.reduce((n, lot) => n + lot.qty, 0), 2); assert.equal(money(s.store.record.world), total); assert.equal(fishUnits(s.store.record.world), ROYAL_HARBOR_FISHERY_BUDGET);
  const d = fixture(), duplicate = request(d, 'royal-harbor.buy', 'fish', 2), both = await Promise.all([executeRoyalHarborTrade(d.store, d.owner, duplicate, NOW), executeRoyalHarborTrade(d.store, d.owner, duplicate, NOW)]);
  assert.equal(both[0].revision, both[1].revision); assert.equal(d.store.writes, 1); assert.equal(Object.keys(d.store.record.world.receipts).length, 1);
});

test('an ambiguous committed write is surfaced, then the same request recovers its receipt without a second debit', async () => {
  const s = fixture(), body = request(s); s.store.ambiguous = true;
  await assert.rejects(executeRoyalHarborTrade(s.store, s.owner, body, NOW), /Transport ended/);
  const committed = structuredClone(s.store.record);
  await executeRoyalHarborTrade(s.store, s.owner, body, NOW + 1_000);
  assert.deepEqual(s.store.record, committed); assert.equal(s.store.writes, 1);
});

test('server timestamps move one finite fishing batch through boat, warehouse, animal cart and market exactly once', () => {
  const s = fixture(), world = s.store.record.world, state = previewRoyalHarborState(world, NOW); world.royalHarbor = state;
  const view = (delta: number) => { settleRoyalHarborState(world, state, NOW + delta); return royalHarborSnapshot(world, player(s), 748, NOW + delta); };
  assert.equal(view(39_999).stock.ship, 0); assert.equal(view(40_000).stock.ship, 8); assert.equal(state.fishery.remaining, ROYAL_HARBOR_FISHERY_BUDGET - 28);
  assert.equal(view(71_999).stock.ship, 8); assert.equal(view(72_000).stock.ship, 0); assert.equal(view(72_000).stock.warehouse, 16);
  assert.equal(view(88_000).stock.cart, 8); assert.equal(view(88_000).stock.warehouse, 8); assert.equal(view(111_999).stock.market, 12);
  assert.equal(view(112_000).stock.market, 20); assert.equal(view(112_000).stock.cart, 0); assert.equal(state.delivered, 8); assert.equal(state.deliveries.length, 1);
  const after = structuredClone(state); view(112_000); assert.deepEqual(state, after); assert.equal(fishUnits(world), ROYAL_HARBOR_FISHERY_BUDGET);
});

test('offline projection is bounded, expires spoiled stock and cannot mine more than the finite fishing quota', () => {
  const s = fixture(), world = s.store.record.world, state = previewRoyalHarborState(world, NOW); world.royalHarbor = state;
  settleRoyalHarborState(world, state, NOW + 90 * 86_400_000);
  assert.ok(state.fishery.remaining >= 0); assert.ok(state.fishery.remaining <= ROYAL_HARBOR_FISHERY_BUDGET); assert.ok(state.fishery.spoiled > 0); assert.equal(fishUnits(world), ROYAL_HARBOR_FISHERY_BUDGET);
  const saved = structuredClone(world); royalHarborSnapshot(world, player(s), 748, NOW + 90 * 86_400_000 + 30_000); assert.deepEqual(world, saved);
});

test('the additive district round-trips through legacy JSON and the experimental partition codec without resetting any profile', async () => {
  const s = fixture(); await executeRoyalHarborTrade(s.store, s.owner, request(s), NOW);
  const world = s.store.record.world; assert.deepEqual(JSON.parse(JSON.stringify(world)), world); assert.deepEqual(decodeWorldRecords(serializeWorldRecords(world)), world);
});

test('the existing social administrator audit reconciles the district reserve through initialization, purchases and sales', async () => {
  const s = fixture();
  const balanced = () => {
    const before = structuredClone(s.store.record), world = s.store.record.world, view = getSocialView(world, player(s), s.owner), admin = view.admin!;
    assert.ok(admin); assert.equal(admin.creditDiscrepancy, 0); assert.equal(admin.simulationDiscrepancy, 0);
    assert.equal(admin.creditCirculation, Object.values(world.social.accounts).reduce((n, account) => n + account.credits, 0) + (world.royalHarbor?.credits ?? 0));
    assert.equal(admin.creditSourceBudget - admin.creditNpcRemaining, admin.creditCirculation);
    assert.deepEqual(s.store.record, before, 'Reading the administrator audit must not move a reserve');
  };
  balanced();
  await readRoyalHarbor(s.store, s.owner, s.id, NOW); balanced();
  await executeRoyalHarborTrade(s.store, s.owner, request(s, 'royal-harbor.buy', 'fish', 2), NOW); balanced();
  give(player(s), 'plank', 4, NOW, 'existing-industrial-outputs');
  await executeRoyalHarborTrade(s.store, s.owner, request(s, 'royal-harbor.sell', 'plank', 3), NOW); balanced();
  await executeRoyalHarborTrade(s.store, s.owner, request(s, 'royal-harbor.buy', 'plank', 1), NOW); balanced();
  const command = request(s, 'royal-harbor.sell', 'fish', 1);
  await executeRoyalHarborTrade(s.store, s.owner, command, NOW); balanced();
  const after = structuredClone(s.store.record); await executeRoyalHarborTrade(s.store, s.owner, command, NOW); balanced(); assert.deepEqual(s.store.record, after);
  assert.equal(getSocialView(s.store.record.world, player(s), 'unrelated-owner').admin, null);
});

test('spoiled conserves purchased from players do not consume or replenish the district fishing quota', async () => {
  const s = fixture(), otherFood = give(player(s), 'preserved_food', 3, NOW, 'recipe:preserved_food:player-craft'); otherFood.expiresAt = NOW + 1_000;
  await executeRoyalHarborTrade(s.store, s.owner, request(s, 'royal-harbor.sell', 'fish', 3), NOW);
  const world = s.store.record.world, state = world.royalHarbor!, remaining = state.fishery.remaining;
  assert.equal(state.fishery.spoiled, 0); settleRoyalHarborState(world, state, NOW + 1_000);
  assert.equal(state.fishery.spoiled, 0); assert.equal(state.fishery.remaining, remaining); assert.equal(fishUnits(world), ROYAL_HARBOR_FISHERY_BUDGET);
  assert.ok(!state.stocks.market.some(lot => lot.provenance.source === 'recipe:preserved_food:player-craft'));
});
