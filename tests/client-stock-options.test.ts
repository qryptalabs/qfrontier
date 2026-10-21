import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedItemOptions, usableQuantity } from '../lib/client/stock-options.ts';
import type { InventoryLot } from '../lib/mvp/types.ts';

const lot = (patch: Partial<InventoryLot>): InventoryLot => ({id: 'lot-1', itemId: 'timber', qty: 3, quality: 1, bound: false, wear: 0, expiresAt: null, location: 'station', provenance: {source: 'test', creatorId: 'player', inputs: [], seasonId: 'test'}, ...patch});
test('trade options exclude bound, expired, depleted and unusable lots without changing them', () => {
  const lots = [lot({}), lot({id: 'bound', bound: true, qty: 9}), lot({id: 'expired', expiresAt: 1000, qty: 5}), lot({id: 'bad', quality: 0, qty: 7}), lot({id: 'empty', qty: 0})];
  const before = structuredClone(lots);
  assert.deepEqual(ownedItemOptions(lots, 1000).map(option => [option.value, option.available]), [['timber', 3]]);
  assert.equal(usableQuantity(lots, 'timber', 1000), 12);
  assert.deepEqual(lots, before);
});
test('recipe availability counts usable bound ingredients while trade availability stays separate', () => {
  const lots = [lot({itemId: 'grain', bound: true, qty: 2}), lot({itemId: 'water', qty: 1})];
  assert.equal(usableQuantity(lots, 'grain', 1000), 2);
  assert.equal(usableQuantity(lots, 'grain', 1000, true), 0);
  assert.deepEqual(ownedItemOptions(lots, 1000).map(option => option.value), ['water']);
});
