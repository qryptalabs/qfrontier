import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, quoteMvp, readMvpView, validateMvpQuote } from '../lib/mvp/engine.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { MvpWorld } from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record: { revision: number; world: MvpWorld } | null = null;
  async read() { await Promise.resolve(); return structuredClone(this.record); }
  async insert(world: MvpWorld) { await Promise.resolve(); if (!this.record) this.record = { revision: 0, world: structuredClone(world) }; }
  async compareAndSwap(revision: number, world: MvpWorld) {
    await Promise.resolve();
    if (!this.record || this.record.revision !== revision) return false;
    this.record = { revision: revision + 1, world: structuredClone(world) };
    return true;
  }
}
const now = Date.parse('2026-10-15T03:30:00Z');
const create = (name = 'Alfa') => ({ type: 'player.create', name, stationName: `Estación ${name}`, faction: 'cartographers' });

test('engine initialization creates 81 tiles and keeps private state out of the view', async () => {
  const store = new MemoryStore();
  const view = await readMvpView(store, 'secret-owner-a', undefined, now);
  assert.equal(view.tiles.length, 81);
  assert.equal(view.player, null);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes('secret-owner-a'));
  assert.ok(!serialized.includes(store.record!.world.rngSeed));
  assert.ok(!Object.hasOwn(view, 'receipts'));
});
test('concurrent duplicate creation is committed once with one authoritative revision', async () => {
  const store = new MemoryStore();
  const id = crypto.randomUUID();
  const [a, b] = await Promise.all([executeMvp(store, 'owner-a', create(), id, undefined, now), executeMvp(store, 'owner-a', create(), id, undefined, now)]);
  assert.equal(a.players.length, 1);
  assert.equal(b.players.length, 1);
  assert.equal(Object.keys(store.record!.world.players).length, 1);
  assert.equal(Object.keys(store.record!.world.receipts).length, 1);
});
test('a visitor cannot control or inspect another owner player', async () => {
  const store = new MemoryStore();
  const view = await executeMvp(store, 'owner-a', create(), crypto.randomUUID(), undefined, now);
  const other = await readMvpView(store, 'owner-b', undefined, now);
  assert.equal(other.players.length, 0);
  assert.equal(other.player, null);
  await assert.rejects(readMvpView(store, 'owner-b', view.player!.id, now), { status: 403 });
  await assert.rejects(quoteMvp(store, 'owner-b', { ...create(), playerId: view.player!.id }, crypto.randomUUID(), now), { status: 403 });
});
test('quotes execute no command and a signature binds owner, revision, payload and expiry', async () => {
  const store = new MemoryStore();
  const requestId = crypto.randomUUID();
  const quote = await quoteMvp(store, 'owner-a', create(), requestId, now);
  assert.equal(Object.keys(store.record!.world.players).length, 0);
  await validateMvpQuote(store, 'owner-a', quote.command, requestId, quote.revision, quote.token, quote.expiresAt, now);
  await assert.rejects(validateMvpQuote(store, 'owner-b', quote.command, requestId, quote.revision, quote.token, quote.expiresAt, now), { status: 400 });
  await assert.rejects(validateMvpQuote(store, 'owner-a', create('Alterado'), requestId, quote.revision, quote.token, quote.expiresAt, now), { status: 400 });
  await assert.rejects(validateMvpQuote(store, 'owner-a', quote.command, requestId, quote.revision, quote.token, quote.expiresAt + 1000000, now), { status: 400 });
  await assert.rejects(validateMvpQuote(store, 'owner-a', quote.command, requestId, quote.revision, quote.token, quote.expiresAt, quote.expiresAt + 1), { status: 409 });
});
test('a quote never spans a six-hour weather change', async () => {
  const store = new MemoryStore();
  const boundary = Date.parse('2026-10-15T06:00:00Z');
  const quote = await quoteMvp(store, 'owner-a', create(), crypto.randomUUID(), boundary - 1000);
  assert.ok(quote.expiresAt < boundary);
});
test('changed state rejects an old quote but replay of a confirmed action still succeeds', async () => {
  const store = new MemoryStore();
  const quote = await quoteMvp(store, 'owner-a', create(), crypto.randomUUID(), now);
  await executeMvp(store, 'owner-b', create('Beta'), crypto.randomUUID(), undefined, now);
  await assert.rejects(executeMvp(store, 'owner-a', quote.command, quote.requestId, quote.revision, now), { status: 409 });
  const fresh = await quoteMvp(store, 'owner-a', create(), crypto.randomUUID(), now);
  const saved = await executeMvp(store, 'owner-a', fresh.command, fresh.requestId, fresh.revision, now);
  const replayed = await executeMvp(store, 'owner-a', fresh.command, fresh.requestId, fresh.revision, now);
  assert.equal(saved.player!.id, replayed.player!.id);
  assert.equal(saved.players.length, replayed.players.length);
});
test('request fingerprints reject changed payloads and normalize object key order', async () => {
  const store = new MemoryStore();
  const requestId = crypto.randomUUID();
  await executeMvp(store, 'owner-a', create(), requestId, undefined, now);
  await executeMvp(store, 'owner-a', { faction: 'cartographers', stationName: 'Estación Alfa', name: 'Alfa', type: 'player.create' }, requestId, undefined, now);
  await assert.rejects(executeMvp(store, 'owner-a', create('Diferente'), requestId, undefined, now), { status: 409 });
  assert.equal(Object.keys(store.record!.world.players).length, 1);
});
test('creating a test explorer selects it while retrying the first creation selects the original', async () => {
  const store = new MemoryStore();
  const firstRequest = crypto.randomUUID();
  const first = await executeMvp(store, 'owner-a', create(), firstRequest, undefined, now);
  const second = await executeMvp(store, 'owner-a', { ...create('Beta'), playerId: first.player!.id }, crypto.randomUUID(), undefined, now);
  assert.equal(second.player!.name, 'Beta');
  const original = await executeMvp(store, 'owner-a', create(), firstRequest, undefined, now);
  assert.equal(original.player!.id, first.player!.id);
});
test('a replay that resolves due work persists the completion before displaying it', async () => {
  const store = new MemoryStore();
  const firstRequest = crypto.randomUUID();
  const first = await executeMvp(store, 'owner-a', create(), firstRequest, undefined, now);
  const ordered = await executeMvp(store, 'owner-a', { type: 'world.survey', playerId: first.player!.id, tileId: first.player!.position }, crypto.randomUUID(), undefined, now);
  const job = ordered.jobs[0];
  assert.ok(job);
  const replayed = await executeMvp(store, 'owner-a', create(), firstRequest, undefined, job.endsAt + 1);
  assert.equal(store.record!.world.jobs[job.id].status, 'completed');
  assert.equal(replayed.revision, store.record!.revision);
  assert.ok(replayed.player!.surveyed.includes(first.player!.position));
});
test('a quote becomes stale when pending work would settle before its confirmation', async () => {
  const store = new MemoryStore();
  const first = await executeMvp(store, 'owner-a', create(), crypto.randomUUID(), undefined, now);
  const ordered = await executeMvp(store, 'owner-a', { type: 'world.survey', playerId: first.player!.id, tileId: first.player!.position }, crypto.randomUUID(), undefined, now);
  const quote = await quoteMvp(store, 'owner-a', create('Beta'), crypto.randomUUID(), now);
  await assert.rejects(executeMvp(store, 'owner-a', quote.command, quote.requestId, quote.revision, ordered.jobs[0].endsAt + 1), { status: 409 });
  assert.equal(Object.keys(store.record!.world.players).length, 1);
  assert.equal(store.record!.world.jobs[ordered.jobs[0].id].status, 'running');
});

