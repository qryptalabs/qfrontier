import test from 'node:test';
import assert from 'node:assert/strict';
import reference from '../lib/mvp/reference-config.json' with { type: 'json' };
import { ITEMS, RECIPES } from '../lib/mvp/catalog.ts';
import { createMvpWorld } from '../lib/mvp/world.ts';

test('runtime item identifiers match the supplied technical package without aliases', () => {
  const expected = Object.values(reference.items).flat();
  assert.equal(expected.length, 40);
  assert.equal(new Set(expected).size, 40);
  assert.deepEqual(ITEMS.map(item => item.id).sort(), [...expected].sort());
  for (const [group, ids] of Object.entries(reference.items)) {
    const runtimeGroup = group === 'products' ? 'product' : group;
    for (const id of ids) assert.equal(ITEMS.find(item => item.id === id)!.group, runtimeGroup);
  }
});
test('all 24 recipes retain reference ingredients, output, amount, duration and building', () => {
  assert.equal(RECIPES.length, 24);
  for (const source of reference.recipes) {
    const recipe = RECIPES.find(recipe => recipe.id === source.id)!;
    assert.ok(recipe, source.id);
    assert.deepEqual(Object.fromEntries(recipe.inputs.map(input => [input.itemId, input.qty])), source.inputs);
    assert.deepEqual(recipe.output, [{ itemId: source.output, qty: source.quantity }]);
    assert.equal(recipe.seconds, source.seconds);
    assert.equal(recipe.building, source.building);
  }
});
test('world layers and agricultural budgets retain the reference creation limits', () => {
  const world = createMvpWorld('owner', Date.parse('2026-10-15T00:00:00Z'));
  assert.equal(Object.keys(world.tiles).length, reference.world.rows * reference.world.cols);
  for (const tile of Object.values(world.tiles)) {
    assert.ok(reference.world.biomes.includes(tile.biome));
    assert.ok(reference.world.terrains.includes(tile.terrain));
    for (const deposit of tile.deposits) assert.deepEqual(deposit.layers.map(layer => layer.budget), reference.world.deposit_layers);
  }
  for (const region of Object.values(world.regions)) assert.equal(region.farmBudget, reference.farming.cycles_regional_reference);
});
