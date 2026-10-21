import test from 'node:test';
import assert from 'node:assert/strict';
import { createMvpWorld, createPlayer, weatherFor } from '../lib/mvp/world.ts';
import { give } from '../lib/mvp/helpers.ts';
import { dispatchProduction, settleProduction } from '../lib/mvp/production.ts';
import { settleLandExpansion } from '../lib/mvp/land-expansion.ts';
import { settleSocial } from '../lib/mvp/social.ts';
import { settleTerritory } from '../lib/mvp/territory.ts';
import { settleHabitable } from '../lib/mvp/habitable.ts';
import { settleHabitableConstruction } from '../lib/mvp/habitable-construction.ts';
import { settleHabitableSupplies } from '../lib/mvp/habitable-supplies.ts';
import { settleHabitableShedUpgrades } from '../lib/mvp/habitable-shed-upgrades.ts';
import { advanceHabitableManagerHistory, reconcileHabitableManagers, wakeHabitableManagers } from '../lib/mvp/habitable-manager.ts';
import { settlementPlayers } from '../lib/mvp/village-settlement-scope.ts';
import type { HabitableBuilding, HabitableState } from '../lib/mvp/habitable-data.ts';
import type { HabitableManagerState } from '../lib/mvp/habitable-manager.ts';
import type { Context, Job, MvpCommand, MvpWorld, Player } from '../lib/mvp/types.ts';

const NOW = Date.parse('2026-10-20T12:00:00Z');
function fixture() {
  const world = createMvpWorld('admin-test', NOW);
  const add = (name: string) => createPlayer(world, { ownerId: `owner-${name}`, requestId: crypto.randomUUID(), now: NOW, actor: null }, { type: 'player.create', name, stationName: `Aldea ${name}`, faction: 'cartographers' });
  const alba = add('Alba'), beto = add('Beto');
  const ctx = (p: Player): Context => ({ ownerId: p.ownerId, requestId: crypto.randomUUID(), now: NOW, actor: p });
  const act = (p: Player, cmd: MvpCommand) => dispatchProduction(world, { ...cmd, playerId: p.id }, ctx(p));
  return { world, alba, beto, act };
}
function district(p: Player): HabitableState {
  return p.habitable ??= { version: 1, appearance: 'pine', profession: 'carpenter', position: { x: 0, y: 1.5 }, buildings: [] };
}
function facility(p: Player, suffix: string, templateId: HabitableBuilding['templateId'] = 'shed'): HabitableBuilding {
  const b: HabitableBuilding = { id: `${p.id}:${suffix}`, templateId, x: 7, y: 3, rotation: 0, startsAt: NOW, endsAt: NOW + 1_000, bound: false };
  district(p).buildings.push(b);
  return b;
}
function job(world: MvpWorld, p: Player, kind: Job['kind'], suffix: string): Job {
  const j: Job = { id: `${p.id}:${suffix}`, playerId: p.id, kind, status: 'running', createdAt: NOW, startsAt: NOW, endsAt: NOW + 1_000, ruleVersion: world.rulesVersion, weather: weatherFor(world.tiles[p.position].regionId, NOW), route: [p.position], costs: [], payload: {}, report: [] };
  world.jobs[j.id] = j;
  return j;
}

test('a selected craft settles once without advancing another village or expiring its inventory', () => {
  const f = fixture();
  for (const p of [f.alba, f.beto]) {
    f.act(p, { type: 'craft.start', recipeId: 'plank', qty: 1 });
    give(p, 'ration', 1, NOW, 'existing-food').expiresAt = NOW + 1;
  }
  const own = Object.values(f.world.jobs).find(j => j.playerId === f.alba.id)!;
  const other = Object.values(f.world.jobs).find(j => j.playerId === f.beto.id)!;
  const beforeOther = structuredClone(f.beto), beforeJob = structuredClone(other);
  const at = Math.max(own.endsAt, other.endsAt) + 1;
  settleProduction(f.world, at, undefined, f.alba.id);
  assert.equal(own.status, 'completed');
  assert.equal(f.alba.stats.crafted, 1);
  assert.equal(f.alba.inventory.some(l => l.expiresAt === NOW + 1), false);
  assert.deepEqual(f.beto, beforeOther);
  assert.deepEqual(other, beforeJob);
  const once = structuredClone(f.world);
  settleProduction(f.world, at, undefined, f.alba.id);
  assert.deepEqual(f.world, once);
  settleProduction(f.world, at);
  assert.equal(other.status, 'completed', 'the default aggregate settlement remains compatible');
});

test('selected extraction reconciles only its own reserved units in the shared deposit', () => {
  const f = fixture(), tile = Object.values(f.world.tiles).find(t => t.deposits.some(d => d.itemId === 'timber'))!;
  for (const p of [f.alba, f.beto]) {
    p.position = tile.id; p.surveyed.push(tile.id);
    f.act(p, { type: 'mining.reserve', tileId: tile.id, itemId: 'timber', qty: 1 });
  }
  const jobs = Object.values(f.world.jobs), own = jobs.find(j => j.playerId === f.alba.id)!, other = jobs.find(j => j.playerId === f.beto.id)!;
  const layer = tile.deposits.find(d => d.itemId === 'timber')!.layers.find(l => l.id === own.payload.layerId)!;
  const before = { remaining: layer.remaining, reserved: layer.reserved, extracted: layer.extracted, other: structuredClone(other), player: structuredClone(f.beto) };
  settleProduction(f.world, Math.max(own.endsAt, other.endsAt), undefined, f.alba.id);
  assert.equal(layer.remaining, before.remaining - 1);
  assert.equal(layer.reserved, before.reserved - 1);
  assert.equal(layer.extracted, before.extracted + 1);
  assert.equal(layer.remaining + layer.extracted, layer.budget);
  assert.deepEqual(other, before.other);
  assert.deepEqual(f.beto, before.player);
});

test('station and land upgrades use the selected village even when both jobs are overdue', () => {
  const f = fixture();
  for (const p of [f.alba, f.beto]) {
    district(p).land = { version: 1, activatedAt: NOW, centerLevel: 1, cells: {}, usedProofs: [] };
    job(f.world, p, 'land', 'center').payload = { landOperation: 'center', toLevel: 2, cellIds: [] };
    job(f.world, p, 'upgrade', 'workshop').payload = { building: 'workshop', toLevel: 2 };
  }
  const other = structuredClone(f.beto), otherJobs = structuredClone(Object.values(f.world.jobs).filter(j => j.playerId === f.beto.id));
  settleLandExpansion(f.world, NOW + 2_000, f.alba.id);
  settleProduction(f.world, NOW + 2_000, undefined, f.alba.id);
  assert.equal(f.alba.habitable!.land!.centerLevel, 2);
  assert.equal(f.alba.buildings.workshop, 2);
  assert.deepEqual(f.beto, other);
  assert.deepEqual(Object.values(f.world.jobs).filter(j => j.playerId === f.beto.id), otherJobs);
});

test('facility-wide scope settles construction, held inputs and shed upgrades of only the selected village', () => {
  const f = fixture();
  for (const p of [f.alba, f.beto]) {
    const shed = facility(p, 'shed'), table = facility(p, 'table', 'workbench');
    shed.upgrade = { fromLevel: 1, toLevel: 2, startsAt: NOW, endsAt: NOW + 1_000, constructionStand: { x: 0, y: 0 } };
    const cargo = [p.inventory.splice(p.inventory.findIndex(l => l.itemId === 'timber'), 1)[0]];
    table.construction = { sourceBuildingId: shed.id, workerId: `${p.id}:builder`, cargo, crew: { kind: 'construction', startsAt: NOW, endsAt: NOW + 1_000, legs: [] } };
    const j = job(f.world, p, 'craft', 'supply');
    const held = [p.inventory.splice(p.inventory.findIndex(l => l.itemId === 'stone'), 1)[0]];
    table.supply = { id: `${p.id}:supply`, jobId: j.id, workerId: `${p.id}:worker`, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], startsAt: NOW, arrivesAtSource: NOW, pickupAt: NOW, arrivesAt: NOW + 500, unloadsAt: NOW + 1_000, sourceBuildingId: shed.id, quantity: held.reduce((n, l) => n + l.qty, 0), cargo: held };
  }
  const other = structuredClone(f.beto), otherJob = structuredClone(Object.values(f.world.jobs).find(j => j.playerId === f.beto.id)!);
  const scope = { playerId: f.alba.id };
  settleHabitableConstruction(f.world, NOW + 2_000, scope);
  settleHabitableSupplies(f.world, NOW + 2_000, scope);
  settleHabitableShedUpgrades(f.world, NOW + 2_000, f.alba.id);
  const own = f.alba.habitable!;
  assert.equal(own.buildings[0].level, 2);
  assert.equal(own.buildings[1].construction!.completedAt, NOW + 1_000);
  assert.equal(own.buildings[1].supply!.consumedAt, NOW + 1_000);
  assert.equal(own.buildings[1].supply!.cargo.length, 0);
  assert.ok(Object.values(f.world.jobs).find(j => j.playerId === f.alba.id)!.costs.length > 0);
  assert.deepEqual(f.beto, other);
  assert.deepEqual(Object.values(f.world.jobs).find(j => j.playerId === f.beto.id), otherJob);
});

test('walking, resident relocation and storage expiry do not advance a neighboring village', () => {
  const f = fixture();
  for (const p of [f.alba, f.beto]) {
    const h = district(p), movement = { points: [{ x: 0, y: 1.5 }, { x: 2, y: 2 }], startsAt: NOW, endsAt: NOW + 1_000 };
    h.movement = structuredClone(movement);
    h.workforce = { sequence: 1, initializedAt: NOW, residents: [{ id: `${p.id}:worker`, name: 'Habitante', homeBuildingId: null, position: { x: 0, y: 1.5 }, relocation: structuredClone(movement), createdAt: NOW }] };
    const shed = facility(p, 'shed');
    const lot = give(p, 'ration', 1, NOW, 'existing-shelf-food');
    p.inventory.splice(p.inventory.indexOf(lot), 1); lot.expiresAt = NOW + 1; shed.storage = [lot];
  }
  const other = structuredClone(f.beto);
  settleHabitable(f.world, NOW + 2_000, f.alba.id);
  assert.equal(f.alba.habitable!.movement, undefined);
  assert.deepEqual(f.alba.habitable!.position, { x: 2, y: 2 });
  assert.equal(f.alba.habitable!.workforce!.residents[0].relocation, undefined);
  assert.equal(f.alba.habitable!.buildings[0].storage!.length, 0);
  assert.deepEqual(f.beto, other);
});

test('scoped social expiry returns only the selected maker/requester escrow and defers shared community state', () => {
  const f = fixture();
  for (const p of [f.alba, f.beto]) {
    const lot = give(p, 'plank', 1, NOW, 'existing-trade-stock'); p.inventory.splice(p.inventory.indexOf(lot), 1);
    f.world.social.offers.push({ id: `offer:${p.id}`, makerId: p.id, mode: 'credits', itemId: 'plank', qty: 1, lots: [lot], wantItemId: null, wantQty: 0, price: 6, fee: 0, status: 'open', createdAt: NOW, expiresAt: NOW + 1_000, takerId: null });
    f.world.social.accounts[p.id] = { credits: 10, boundCredits: 50, simUnits: 1000 };
    f.world.social.contracts.push({ id: `contract:${p.id}`, requesterId: p.id, carrierId: null, kind: 'delivery', itemId: 'timber', qty: 1, quality: 1, destination: p.position, price: 5, escrow: 5, cargo: [], deadline: NOW + 1_000, status: 'published' });
  }
  f.world.social.alliances.push({ id: 'shared-treaty', name: 'Pacto', clanIds: [], acceptedClanIds: [], status: 'active', expiresAt: NOW + 1_000, noAggression: true });
  const other = structuredClone(f.beto), otherWallet = structuredClone(f.world.social.accounts[f.beto.id]);
  settleSocial(f.world, NOW + 2_000, f.alba.id);
  assert.equal(f.world.social.offers[0].status, 'expired');
  assert.equal(f.world.social.offers[1].status, 'open');
  assert.equal(f.world.social.contracts[0].status, 'expired');
  assert.equal(f.world.social.contracts[1].status, 'published');
  assert.equal(f.world.social.accounts[f.alba.id].credits, 15);
  assert.deepEqual(f.world.social.accounts[f.beto.id], otherWallet);
  assert.deepEqual(f.beto, other);
  assert.equal(f.world.social.alliances[0].status, 'active');
  settleTerritory(f.world, NOW + 2_000, f.alba.id);
  settleSocial(f.world, NOW + 2_000);
  assert.equal(f.world.social.alliances[0].status, 'ended');
  assert.equal(f.world.social.contracts[1].status, 'expired');
});

test('manager replay, reconciliation and wake leave other village clocks and material reservations unchanged', () => {
  const f = fixture();
  for (const p of [f.alba, f.beto]) {
    const shed = facility(p, 'shed'); shed.endsAt = NOW; shed.storage = [];
    const table = facility(p, 'table', 'workbench'); table.endsAt = NOW;
    const manager: HabitableManagerState = { version: 1, id: `${p.id}:manager`, supplyShedId: shed.id, workbenchId: table.id, planterId: null, goals: { ration: 0, plank: 1, cloth: 0 }, status: 'active', turn: { id: `${p.id}:turn`, startsAt: NOW, endsAt: NOW + 60_000, maxOrders: 1, inputBudget: 2, startedOrders: 0, completedOrders: 0, committedInputs: [], sequence: 0 }, approvals: [], cursor: NOW, nextAt: NOW + 1 };
    district(p).manager = manager;
  }
  const other = structuredClone(f.beto);
  advanceHabitableManagerHistory(f.world, NOW + 2_000, f.alba.id);
  reconcileHabitableManagers(f.world, NOW + 2_000, f.alba.id);
  wakeHabitableManagers(f.world, NOW + 2_000, f.alba.id);
  assert.equal(f.alba.habitable!.manager!.nextAt, NOW + 2_001);
  assert.deepEqual(f.beto, other);
  assert.equal(Object.keys(f.world.jobs).length, 0, 'a blocked target cannot manufacture free work');
});

test('an explicit missing village never falls back to global settlement or inherited object keys', () => {
  const f = fixture();
  assert.deepEqual(settlementPlayers(f.world, 'missing'), []);
  assert.deepEqual(settlementPlayers(f.world, '__proto__'), []);
  assert.deepEqual(settlementPlayers(f.world, f.alba.id), [f.alba]);
  const before = structuredClone(f.world);
  settleProduction(f.world, NOW + 86_400_000, undefined, 'missing');
  settleLandExpansion(f.world, NOW + 86_400_000, 'missing');
  settleSocial(f.world, NOW + 86_400_000, 'missing');
  settleHabitable(f.world, NOW + 86_400_000, 'missing');
  assert.deepEqual(f.world, before);
});
