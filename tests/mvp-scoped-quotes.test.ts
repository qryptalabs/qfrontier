import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, quoteMvp, readMvpView, validateMvpQuote } from '../lib/mvp/engine.ts';
import { advanceEntityVersions } from '../lib/mvp/entity-versions.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';
import { give } from '../lib/mvp/helpers.ts';
import type { MvpRecord, MvpStore } from '../lib/mvp/store.ts';
import type { MvpCommand, MvpWorld } from '../lib/mvp/types.ts';
import type { ActionQuote } from '../lib/mvp/view.ts';

const now = Date.parse('2026-10-20T12:00:00Z');
class VersionedMemoryStore implements MvpStore {
  readonly capabilities: { entityVersions?: true };
  record: MvpRecord | null = null;
  beforeCas: (() => void) | null = null;
  casAttempts = 0;
  constructor(versioned = true) { this.capabilities = versioned ? { entityVersions: true } : {}; }
  async read() { return structuredClone(this.record); }
  async insert(world: MvpWorld) { if (!this.record) this.record = { revision: 0, world: structuredClone(world), entityVersions: {} }; }
  async compareAndSwap(revision: number, world: MvpWorld) {
    this.casAttempts++;
    const hook = this.beforeCas; this.beforeCas = null; hook?.();
    if (!this.record || revision !== this.record.revision) return false;
    this.record = { revision: revision + 1, world: structuredClone(world), entityVersions: advanceEntityVersions(this.record.world, world, this.record.entityVersions ?? {}) };
    return true;
  }
  /** Simulate another committed actor between validation or read and CAS. */
  externalChange(mutate: (world: MvpWorld) => void) {
    assert.ok(this.record);
    const world = structuredClone(this.record.world); mutate(world);
    this.record = { revision: this.record.revision + 1, world, entityVersions: advanceEntityVersions(this.record.world, world, this.record.entityVersions ?? {}) };
  }
}
async function fixture(versioned = true) {
  const world = createMvpWorld('owner-alba', now);
  const add = (ownerId: string, name: string) => createPlayer(world, { ownerId, now, requestId: crypto.randomUUID(), actor: null }, { type: 'player.create', name, stationName: `Aldea ${name}`, faction: 'cartographers' });
  const own = add('owner-alba', 'Alba'), other = add('owner-beto', 'Beto'), seller = add('owner-cora', 'Cora');
  for (const player of [own, other, seller]) world.social.accounts[player.id] = { credits: 100, boundCredits: 50, simUnits: 1000 };
  const store = new VersionedMemoryStore(versioned); await store.insert(world);
  await readMvpView(store, own.ownerId, own.id, now);
  return { store, own, other, seller, owner: own.ownerId };
}
const craft = (playerId: string): MvpCommand => ({ type: 'craft.start', playerId, recipeId: 'plank', qty: 1 });
async function draft(store: MvpStore, owner: string, command: MvpCommand) {
  const request = crypto.randomUUID(), quote = await quoteMvp(store, owner, command, request, now);
  return { request, quote };
}
async function confirm(store: MvpStore, owner: string, command: MvpCommand, request: string, quote: ActionQuote, at = now) {
  const authorization = await validateMvpQuote(store, owner, command, request, quote.revision, quote.token, quote.expiresAt, at);
  return executeMvp(store, owner, command, request, quote.revision, at, authorization);
}
const ownJobs = (f: Awaited<ReturnType<typeof fixture>>, id = f.own.id) => Object.values(f.store.record!.world.jobs).filter(job => job.playerId === id);

test('two independent villages confirm drafts from the same global revision', async () => {
  const f = await fixture(), first = craft(f.own.id), second = craft(f.other.id);
  const a = await draft(f.store, f.owner, first), b = await draft(f.store, f.other.ownerId, second);
  assert.equal(a.quote.revision, b.quote.revision);
  assert.ok(a.quote.token.startsWith('v2.')); assert.ok(b.quote.token.startsWith('v2.'));
  await confirm(f.store, f.owner, first, a.request, a.quote);
  await confirm(f.store, f.other.ownerId, second, b.request, b.quote);
  assert.equal(ownJobs(f).length, 1); assert.equal(ownJobs(f, f.other.id).length, 1);
});

test('a second draft of the same village becomes stale after the first reserves materials', async () => {
  const f = await fixture(), command = craft(f.own.id), a = await draft(f.store, f.owner, command), b = await draft(f.store, f.owner, command);
  await confirm(f.store, f.owner, command, a.request, a.quote);
  const before = structuredClone(f.store.record);
  await assert.rejects(confirm(f.store, f.owner, command, b.request, b.quote), /aldea|recurso/i);
  assert.deepEqual(f.store.record, before);
  assert.equal(ownJobs(f).length, 1);
});

test('two extractors of one deposit have one scoped winner even with remaining stock', async () => {
  const f = await fixture(), tile = Object.values(f.store.record!.world.tiles).find(tile => tile.deposits.some(deposit => deposit.itemId === 'timber'))!;
  f.store.externalChange(world => { for (const id of [f.own.id, f.other.id]) { world.players[id].position = tile.id; world.players[id].surveyed.push(tile.id); } });
  const command = (id: string): MvpCommand => ({ type: 'mining.reserve', playerId: id, tileId: tile.id, itemId: 'timber', qty: 1 });
  const a = await draft(f.store, f.owner, command(f.own.id)), b = await draft(f.store, f.other.ownerId, command(f.other.id));
  await confirm(f.store, f.owner, command(f.own.id), a.request, a.quote);
  await assert.rejects(confirm(f.store, f.other.ownerId, command(f.other.id), b.request, b.quote), /aldea|recurso/i);
  assert.equal(Object.values(f.store.record!.world.jobs).filter(job => job.kind === 'extract').length, 1);
  assert.equal(f.store.record!.world.tiles[tile.id].deposits.find(deposit => deposit.itemId === 'timber')!.layers[0].reserved, 1);
});

test('NPC sales of different products still conflict on the shared treasury', async () => {
  const f = await fixture();
  f.store.externalChange(world => {
    world.players[f.own.id].inventory.find(lot => lot.itemId === 'timber')!.bound = false;
    const lot = structuredClone(world.players[f.other.id].inventory[0]); lot.id = 'scope-plank'; lot.itemId = 'plank'; lot.bound = false; lot.qty = 2;
    world.players[f.other.id].inventory.push(lot);
  });
  const aCommand = { type: 'npc.sell', playerId: f.own.id, itemId: 'timber', qty: 1 }, bCommand = { type: 'npc.sell', playerId: f.other.id, itemId: 'plank', qty: 1 };
  const a = await draft(f.store, f.owner, aCommand), b = await draft(f.store, f.other.ownerId, bCommand), budget = f.store.record!.world.social.npc.remaining;
  await confirm(f.store, f.owner, aCommand, a.request, a.quote);
  await assert.rejects(confirm(f.store, f.other.ownerId, bCommand, b.request, b.quote), /aldea|recurso/i);
  assert.equal(f.store.record!.world.social.npc.remaining, budget - 2);
  assert.equal(f.store.record!.world.social.npc.demand.plank!.remaining, 100);
  assert.equal(f.store.record!.world.social.accounts[f.other.id].credits, 100);
});

test('a plain sale must be reviewed again when another own profile changes its displayed pass reward', async () => {
  const f = await fixture();
  const alternate = (await executeMvp(f.store, f.owner, { type: 'player.create', name: 'Alba dos', stationName: 'Segunda aldea', faction: 'cartographers' }, crypto.randomUUID(), undefined, now)).player!;
  f.store.externalChange(world => {
    for (const id of [f.own.id, alternate.id]) {
      const player = world.players[id]; player.inventory = player.inventory.filter(lot => lot.itemId !== 'timber');
      give(player, 'timber', 100, now, 'local-audit-stock', [], false);
    }
  });
  // All XP comes from real production commands and their ordinary settlement.
  for (const playerId of [f.own.id, alternate.id]) for (const qty of [5, 4]) await executeMvp(f.store, f.owner, { ...craft(playerId), qty }, crypto.randomUUID(), undefined, now);
  const finishedAt = Math.max(...Object.values(f.store.record!.world.jobs).map(job => job.endsAt)) + 1;
  const ownView = await readMvpView(f.store, f.owner, f.own.id, finishedAt);
  assert.equal(ownView.activity!.progression.xp, 90);
  await executeMvp(f.store, f.owner, craft(alternate.id), crypto.randomUUID(), undefined, finishedAt);
  const later = Math.max(...Object.values(f.store.record!.world.jobs).map(job => job.endsAt)) + 1, quoteAt = later - 2000;
  const command = { type: 'npc.sell', playerId: f.own.id, itemId: 'plank', qty: 1 }, request = crypto.randomUUID();
  const quote = await quoteMvp(f.store, f.owner, command, request, quoteAt);
  assert.ok(quote.token.startsWith('v2.'));
  assert.equal(quote.boostReward?.charges, 3, 'first sale would reach account level two and earn the fair pass');
  const beforeCompletion = structuredClone(f.store.record!.world.social.npc);
  const alternateView = await readMvpView(f.store, f.owner, alternate.id, later);
  assert.equal(alternateView.activity!.progression.level, 2);
  assert.deepEqual(f.store.record!.world.social.npc, beforeCompletion, 'the intervening craft does not consume the shared NPC budget or demand');
  const settled = structuredClone(f.store.record), beforePasses = alternateView.boosts.passes.earned;
  await assert.rejects(confirm(f.store, f.owner, command, request, quote, later), /aldea|recurso/i);
  assert.deepEqual(f.store.record, settled, 'a stale reward quote must not take stock or pay credits');
  const freshRequest = crypto.randomUUID(), fresh = await quoteMvp(f.store, f.owner, command, freshRequest, later);
  assert.equal(fresh.boostReward?.charges, 1, 'the new review shows only the still-unearned fair reward');
  const confirmed = await confirm(f.store, f.owner, command, freshRequest, fresh, later);
  assert.equal(confirmed.boosts.passes.earned - beforePasses, 1);
  assert.equal(fresh.creditDelta, 6);
});

test('competing market fills transfer the escrow and charge exactly once', async () => {
  const f = await fixture();
  f.store.externalChange(world => {
    const seller = world.players[f.seller.id], lot = structuredClone(seller.inventory.find(lot => lot.itemId === 'timber')!); lot.qty = 1; lot.bound = false;
    world.social.offers.push({ id: 'offer-single-escrow', makerId: seller.id, mode: 'credits', itemId: 'timber', qty: 1, lots: [lot], wantItemId: null, wantQty: 0, price: 2, fee: 0, status: 'open', createdAt: now, expiresAt: now + 60000, takerId: null });
  });
  const aCommand = { type: 'market.fill', playerId: f.own.id, offerId: 'offer-single-escrow' }, bCommand = { ...aCommand, playerId: f.other.id };
  const a = await draft(f.store, f.owner, aCommand), b = await draft(f.store, f.other.ownerId, bCommand);
  await confirm(f.store, f.owner, aCommand, a.request, a.quote);
  await assert.rejects(confirm(f.store, f.other.ownerId, bCommand, b.request, b.quote), /aldea|recurso/i);
  const state = f.store.record!.world.social;
  assert.equal(state.offers[0].status, 'filled'); assert.equal(state.offers[0].lots.length, 0);
  assert.equal(state.accounts[f.own.id].credits, 98); assert.equal(state.accounts[f.other.id].credits, 100); assert.equal(state.accounts[f.seller.id].credits, 102);
  assert.equal(state.ledger.filter(entry => entry.reason === 'Entrega de orden').length, 1);
});

test('a committed retry succeeds after token expiry without another debit, reservation or receipt', async () => {
  const f = await fixture(), command = craft(f.own.id), d = await draft(f.store, f.owner, command);
  await confirm(f.store, f.owner, command, d.request, d.quote);
  const timber = f.store.record!.world.players[f.own.id].inventory.filter(lot => lot.itemId === 'timber').reduce((n, lot) => n + lot.qty, 0);
  await confirm(f.store, f.owner, command, d.request, d.quote, d.quote.expiresAt + 1);
  assert.equal(ownJobs(f).length, 1);
  assert.equal(f.store.record!.world.players[f.own.id].inventory.filter(lot => lot.itemId === 'timber').reduce((n, lot) => n + lot.qty, 0), timber);
  assert.equal(Object.keys(f.store.record!.world.receipts).filter(key => key === `${f.owner}:${d.request}`).length, 1);
  await assert.rejects(validateMvpQuote(f.store, f.owner, { ...command, qty: 2 }, d.request, d.quote.revision, d.quote.token, d.quote.expiresAt, d.quote.expiresAt + 1), /identificador/i);
});

test('signed scopes reject altered token, authenticated owner, command, operation and expiry', async () => {
  const f = await fixture(), command = craft(f.own.id), d = await draft(f.store, f.owner, command), token = d.quote.token;
  const corrupted = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
  const before = structuredClone(f.store.record);
  await assert.rejects(validateMvpQuote(f.store, f.owner, command, d.request, d.quote.revision, corrupted, d.quote.expiresAt, now), /cotización/i);
  await assert.rejects(validateMvpQuote(f.store, f.other.ownerId, command, d.request, d.quote.revision, token, d.quote.expiresAt, now), /cotización/i);
  await assert.rejects(validateMvpQuote(f.store, f.owner, { ...command, qty: 2 }, d.request, d.quote.revision, token, d.quote.expiresAt, now), /cotización/i);
  await assert.rejects(validateMvpQuote(f.store, f.owner, command, crypto.randomUUID(), d.quote.revision, token, d.quote.expiresAt, now), /cotización/i);
  await assert.rejects(validateMvpQuote(f.store, f.owner, command, d.request, d.quote.revision, token, d.quote.expiresAt + 1, now), /cotización/i);
  await assert.rejects(validateMvpQuote(f.store, f.owner, command, d.request, d.quote.revision, token, d.quote.expiresAt, d.quote.expiresAt + 1), /venció/i);
  assert.deepEqual(f.store.record, before);
});

test('execution rechecks village scope after validation and never trusts an earlier successful check', async () => {
  const f = await fixture(), command = craft(f.own.id), d = await draft(f.store, f.owner, command);
  const authorization = await validateMvpQuote(f.store, f.owner, command, d.request, d.quote.revision, d.quote.token, d.quote.expiresAt, now);
  assert.ok(authorization);
  await executeMvp(f.store, f.owner, command, crypto.randomUUID(), undefined, now);
  const before = structuredClone(f.store.record);
  await assert.rejects(executeMvp(f.store, f.owner, command, d.request, d.quote.revision, now, authorization), /aldea|recurso/i);
  assert.deepEqual(f.store.record, before);
});

test('execution rechecks token expiry and bound identity after validation', async () => {
  const f = await fixture(), command = craft(f.own.id), d = await draft(f.store, f.owner, command);
  const authorization = await validateMvpQuote(f.store, f.owner, command, d.request, d.quote.revision, d.quote.token, d.quote.expiresAt, now);
  assert.ok(authorization);
  const before = structuredClone(f.store.record);
  await assert.rejects(executeMvp(f.store, f.owner, command, d.request, d.quote.revision, d.quote.expiresAt + 1, authorization), /venció/i);
  await assert.rejects(executeMvp(f.store, f.other.ownerId, command, d.request, d.quote.revision, now, authorization), /cotización/i);
  await assert.rejects(executeMvp(f.store, f.owner, { ...command, qty: 2 }, d.request, d.quote.revision, now, authorization), /cotización/i);
  await assert.rejects(executeMvp(f.store, f.owner, command, crypto.randomUUID(), d.quote.revision, now, authorization), /cotización/i);
  assert.deepEqual(f.store.record, before);
});

test('legacy stores and unaudited command families retain strict global revisions', async () => {
  for (const versioned of [false, true]) {
    const f = await fixture(versioned);
    if (versioned) f.store.externalChange(world => { world.players[f.own.id].surveyed.push(f.own.position); });
    const command: MvpCommand = versioned ? { type: 'expedition.start', playerId: f.own.id, tileId: f.own.position } : craft(f.own.id);
    const d = await draft(f.store, f.owner, command);
    assert.match(d.quote.token, /^[0-9a-f]{64}$/);
    await executeMvp(f.store, f.other.ownerId, craft(f.other.id), crypto.randomUUID(), undefined, now);
    const authorization = await validateMvpQuote(f.store, f.owner, command, d.request, d.quote.revision, d.quote.token, d.quote.expiresAt, now);
    assert.equal(authorization, undefined);
    const before = structuredClone(f.store.record);
    await assert.rejects(executeMvp(f.store, f.owner, command, d.request, d.quote.revision, now, authorization), /mundo cambió/i);
    assert.deepEqual(f.store.record, before);
  }
});

test('a CAS collision on another village retries with current state and preserves both effects', async () => {
  const f = await fixture(), command = craft(f.own.id), d = await draft(f.store, f.owner, command);
  const otherQty = f.store.record!.world.players[f.other.id].inventory[0].qty;
  const attempts = f.store.casAttempts;
  f.store.beforeCas = () => f.store.externalChange(world => { world.players[f.other.id].inventory[0].qty--; });
  await confirm(f.store, f.owner, command, d.request, d.quote);
  assert.equal(f.store.casAttempts - attempts, 2);
  assert.equal(ownJobs(f).length, 1);
  assert.equal(f.store.record!.world.players[f.other.id].inventory[0].qty, otherQty - 1);
  assert.equal(Object.hasOwn(f.store.record!.world.receipts, `${f.owner}:${d.request}`), true);
});

test('a CAS collision that changes the own scope rejects on retry without overwriting it', async () => {
  const f = await fixture(), command = craft(f.own.id), d = await draft(f.store, f.owner, command);
  const ownQty = f.store.record!.world.players[f.own.id].inventory[0].qty;
  f.store.beforeCas = () => f.store.externalChange(world => { world.players[f.own.id].inventory[0].qty--; });
  await assert.rejects(confirm(f.store, f.owner, command, d.request, d.quote), /aldea|recurso/i);
  assert.equal(ownJobs(f).length, 0);
  assert.equal(f.store.record!.world.players[f.own.id].inventory[0].qty, ownQty - 1);
  assert.equal(Object.hasOwn(f.store.record!.world.receipts, `${f.owner}:${d.request}`), false);
});
