import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { setImmediate as yieldImmediate, setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

export const DEFAULT_ROW_LIMIT_BYTES = 2_000_000;
const REALM_ID = 'frontier-pdf-mvp-v2';
export const summary = values => {
  if (!values.length) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = q => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return { count: sorted.length, min: sorted[0], p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1), mean: sorted.reduce((n, v) => n + v, 0) / sorted.length };
};
export function seededSchedule(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
const newOperation = () => ({ calls: 0, sqlMs: 0, wallMs: 0, jsonMs: 0, bytes: 0, errors: 0 });
const newMetrics = () => ({ read: newOperation(), insert: newOperation(), cas: { ...newOperation(), conflicts: 0, committed: 0 }, peakStateBytes: 0, rowLimitRejections: 0 });

/** A local semantic model of the legacy one-row store, not a D1 latency model.
 * setImmediate is intentional: concurrent readers may see the same revision
 * before their atomic SQLite UPDATEs compete. No application lock hides CAS races.
 */
export function createLoadStore({ databasePath = ':memory:', rowLimitBytes = DEFAULT_ROW_LIMIT_BYTES, ioLatencyMs = 0, context } = {}) {
  if (!Number.isSafeInteger(rowLimitBytes) || rowLimitBytes < 1) throw new Error('Invalid row limit.');
  const db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE IF NOT EXISTS world_state (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL)');
  const select = db.prepare('SELECT revision, state FROM world_state WHERE id = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO world_state (id, revision, state, updated_at) VALUES (?, 0, ?, ?)');
  const cas = db.prepare('UPDATE world_state SET revision = revision + 1, state = ?, updated_at = ? WHERE id = ? AND revision = ?');
  const metrics = newMetrics();
  const yieldIO = () => ioLatencyMs > 0 ? delay(ioLatencyMs) : yieldImmediate();
  const mark = operation => { const current = context?.getStore(); if (current) { current.storeOperations ??= { read: 0, insert: 0, cas: 0, conflicts: 0 }; current.storeOperations[operation]++; } };
  const serialize = world => {
    const started = performance.now(), state = JSON.stringify(world), bytes = Buffer.byteLength(state, 'utf8');
    metrics.peakStateBytes = Math.max(metrics.peakStateBytes, bytes);
    if (bytes > rowLimitBytes) { metrics.rowLimitRejections++; throw Object.assign(new Error('Local configured state byte limit exceeded.'), { status: 413, code: 'LOCAL_ROW_LIMIT' }); }
    return { state, bytes, ms: performance.now() - started };
  };
  const store = {
    async read() {
      const started = performance.now(), m = metrics.read; m.calls++; mark('read');
      try {
        await yieldIO(); const sql = performance.now(), row = select.get(REALM_ID); m.sqlMs += performance.now() - sql;
        if (!row) return null;
        m.bytes += Buffer.byteLength(row.state, 'utf8'); const json = performance.now(), world = JSON.parse(row.state); m.jsonMs += performance.now() - json;
        return { revision: Number(row.revision), world };
      } catch (error) { m.errors++; throw error; } finally { m.wallMs += performance.now() - started; }
    },
    async insert(world) {
      const started = performance.now(), m = metrics.insert; m.calls++; mark('insert');
      try { const body = serialize(world); m.bytes += body.bytes; m.jsonMs += body.ms; await yieldIO(); const sql = performance.now(); insert.run(REALM_ID, body.state, new Date().toISOString()); m.sqlMs += performance.now() - sql; }
      catch (error) { m.errors++; throw error; } finally { m.wallMs += performance.now() - started; }
    },
    async compareAndSwap(revision, world) {
      const started = performance.now(), m = metrics.cas; m.calls++; mark('cas');
      try {
        const body = serialize(world); m.bytes += body.bytes; m.jsonMs += body.ms; await yieldIO();
        const sql = performance.now(), result = cas.run(body.state, new Date().toISOString(), REALM_ID, revision); m.sqlMs += performance.now() - sql;
        if (Number(result.changes) === 1) { m.committed++; return true; }
        m.conflicts++; const current = context?.getStore(); if (current?.storeOperations) current.storeOperations.conflicts++; return false;
      } catch (error) { m.errors++; throw error; } finally { m.wallMs += performance.now() - started; }
    },
  };
  return {
    store, metrics,
    adapterInfo: { name: 'legacy-one-row-node-sqlite', asynchronousBarrier: 'setImmediate before SQL; optional explicit synthetic latency', ioLatencyMs, rowLimitBytes, rowLimitScope: 'UTF-8 state TEXT only; conservative configurable local guard, not a hosted D1 certification', sqlite: 'node:sqlite DatabaseSync, one connection, atomic revision UPDATE' },
    snapshot() { const row = select.get(REALM_ID); return row ? { revision: Number(row.revision), world: JSON.parse(row.state) } : null; },
    resetMetrics() { Object.assign(metrics, newMetrics()); },
    close() { db.close(); },
  };
}

export function economicInventory(world) {
  const result = {};
  for (const p of Object.values(world.players)) for (const lot of p.inventory) result[lot.itemId] = (result[lot.itemId] ?? 0) + lot.qty;
  return result;
}
const sumAmounts = (target, amounts, factor = 1) => { for (const a of amounts) target[a.itemId] = (target[a.itemId] ?? 0) + a.qty * factor; };

/** Independent reconciliation for the deliberately narrow civil load scenario.
 * Costs are counted when reserved, output only after completed jobs, refunds
 * only for a recorded cancellation before startsAt. Replays are not new commands.
 */
export function assertScenarioIntegrity(before, after, journal, recipes) {
  const checks = [];
  const check = (name, fn) => { fn(); checks.push(name); };
  check('synthetic owners and player identities preserved', () => { assert.deepEqual(Object.keys(after.players).sort(), Object.keys(before.players).sort()); for (const p of Object.values(after.players)) assert.equal(p.ownerId, before.players[p.id].ownerId); });
  check('finite deposits reconcile and active extraction reservations are exact', () => {
    for (const tile of Object.values(after.tiles)) for (const deposit of tile.deposits) for (const layer of deposit.layers) {
      assert.ok(layer.remaining >= 0 && layer.extracted >= 0 && layer.reserved >= 0 && layer.reserved <= layer.remaining);
      assert.equal(layer.budget, layer.remaining + layer.extracted);
      const reserved = Object.values(after.jobs).filter(j => j.kind === 'extract' && ['running', 'reserved'].includes(j.status) && j.payload.tileId === tile.id && j.payload.itemId === deposit.itemId && j.payload.layerId === layer.id).reduce((n, j) => n + Number(j.payload.qty), 0);
      assert.equal(layer.reserved, reserved);
    }
  });
  check('one receipt per committed command and canonical replay hash unchanged', () => {
    const keys = journal.map(j => `${j.ownerId}:${j.requestId}`); assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) assert.ok(Object.hasOwn(after.receipts, key));
    assert.equal(Object.keys(after.receipts).length - Object.keys(before.receipts).length, keys.length);
    for (const [key, value] of Object.entries(before.receipts)) assert.equal(after.receipts[key], value);
  });
  check('no negative or duplicate live inventory lots', () => { const ids = new Set(); for (const p of Object.values(after.players)) for (const lot of p.inventory) { assert.ok(Number.isSafeInteger(lot.qty) && lot.qty > 0); assert.ok(!ids.has(lot.id)); ids.add(lot.id); assert.ok(lot.provenance.source && lot.provenance.creatorId); } });
  check('civil inventory reconciles with real inputs, output, cancellations, buildings and sales', () => {
    const expected = economicInventory(before), cancelled = new Map(journal.filter(e => e.command.type === 'job.cancel' || e.command.type === 'craft.cancel').map(e => [e.command.jobId, e.now]));
    for (const job of Object.values(after.jobs).filter(j => !before.jobs[j.id])) {
      sumAmounts(expected, job.costs, -1);
      if (job.status === 'cancelled' && cancelled.get(job.id) < job.startsAt) sumAmounts(expected, job.costs.filter(l => !l.expiresAt || l.expiresAt > cancelled.get(job.id)));
      if (job.status !== 'completed') continue;
      if (job.kind === 'craft') sumAmounts(expected, recipes[job.payload.recipeId].output, Number(job.payload.qty));
      else if (job.kind === 'extract') sumAmounts(expected, [{ itemId: job.payload.itemId, qty: Number(job.payload.qty) }]);
      else if (job.kind === 'farm') sumAmounts(expected, [{ itemId: 'grain', qty: 3 }, { itemId: 'biomass', qty: 1 }]);
      else assert.ok(['survey', 'travel'].includes(job.kind), `Unsupported integrity job: ${job.kind}`);
    }
    for (const p of Object.values(after.players)) for (const b of p.habitable?.buildings ?? []) if (!(before.players[p.id].habitable?.buildings ?? []).some(old => old.id === b.id)) sumAmounts(expected, b.constructionCosts ?? [], -1);
    for (const e of journal.filter(e => e.command.type === 'npc.sell')) sumAmounts(expected, [{ itemId: e.command.itemId, qty: e.command.qty }], -1);
    const actual = economicInventory(after); for (const id of new Set([...Object.keys(expected), ...Object.keys(actual)])) assert.equal(actual[id] ?? 0, expected[id] ?? 0, id);
  });
  check('NPC credits are conserved without duplicate sale payments', () => {
    const total = w => Object.values(w.social.accounts).reduce((n, a) => n + a.credits, 0) + w.social.npc.remaining + w.social.creditFees + w.social.creditSinks;
    assert.equal(total(after), total(before));
    const sales = journal.filter(e => e.command.type === 'npc.sell'), payments = after.social.ledger.filter(l => l.currency === 'credits' && l.from === 'npc-season' && l.reason === 'Encargo NPC con presupuesto limitado');
    const oldPayments = before.social.ledger.filter(l => l.currency === 'credits' && l.from === 'npc-season' && l.reason === 'Encargo NPC con presupuesto limitado').length;
    assert.equal(payments.length - oldPayments, sales.length);
  });
  check('farm quota equals genuine accepted cycles minus pre-start cancellation', () => {
    for (const p of Object.values(after.players)) {
      const jobs = Object.values(after.jobs).filter(j => j.playerId === p.id && j.kind === 'farm' && !before.jobs[j.id]);
      const cancelled = journal.filter(e => ['job.cancel', 'craft.cancel'].includes(e.command.type));
      const used = jobs.filter(j => !(j.status === 'cancelled' && cancelled.some(e => e.command.jobId === j.id && e.now < j.startsAt))).length;
      assert.equal(p.farmCycles, before.players[p.id].farmCycles + used);
    }
  });
  check('craft output keeps bound inheritance and canonical recipe provenance', () => {
    for (const p of Object.values(after.players)) for (const lot of p.inventory) {
      if (!lot.provenance.source.startsWith('recipe:')) continue;
      const jobId = lot.provenance.source.split(':').at(-1), job = after.jobs[jobId]; assert.ok(job && job.status === 'completed');
      assert.equal(lot.bound, job.costs.some(l => l.bound)); assert.equal(lot.provenance.creatorId, p.id);
    }
  });
  return checks;
}

/** Namespace IDs need uniqueness, not a false global counter >= entity count rule. */
export function assertLoadWorldIdentifiers(world){
  const checks=[];
  for(const collection of ['jobs','battles','convoys']){
    const ids=new Set();for(const [key,value]of Object.entries(world[collection])){assert.equal(key,value.id,`${collection} key must match its ID.`);assert.ok(typeof value.id==='string'&&value.id.length>0&&!ids.has(value.id),`${collection} IDs must be unique.`);ids.add(value.id);}
  }
  checks.push('job, battle and convoy record keys match unique IDs');
  for(const [name,values]of [['events',world.events],['ledger',world.social.ledger]]){const ids=new Set();for(const value of values){assert.ok(typeof value.id==='string'&&value.id.length>0&&!ids.has(value.id),`${name} IDs must be unique.`);ids.add(value.id);}}
  checks.push('chronicle and ledger append IDs remain unique');
  for(const [key,value]of Object.entries(world.counters))assert.ok(Number.isSafeInteger(value)&&value>=0,`Invalid legacy counter ${key}.`);
  assert.ok(Number.isSafeInteger(world.social.sequence)&&world.social.sequence>=0,'Invalid legacy social sequence.');
  checks.push('legacy counters stay nonnegative without constraining namespaced entity counts');
  return checks;
}
