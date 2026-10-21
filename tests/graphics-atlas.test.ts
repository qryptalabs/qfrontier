import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasToGlobal, atlasWorldBounds, globalToAtlas, settlementFootprint, settlementSceneSignature, settlementTile } from '../lib/graphics/atlas-data.ts';
import { atlasCameraLimits, clampTarget, PARCEL_CAMERA_BOUNDS, parcelCameraLimits } from '../lib/graphics/camera-bounds.ts';
import { tilePoint } from '../lib/graphics/scene-data.ts';
import { plotForIndex, tileToGlobal } from '../lib/mvp/settlements.ts';
import type { PublicSettlement } from '../lib/mvp/view.ts';

function colony(index = 0): PublicSettlement {
  return { id: `settlement-${index}`, playerId: `player-${index}`, name: `Colonia ${index}`, ownerName: 'Ari',
    faction: 'cartographers', clanName: null, plot: plotForIndex(index), own: index === 0, protectionUntil: 123,
    buildings: { workshop: 1, garden: 1, kitchen: 0, laboratory: 0, barracks: 0, warehouse: 1, logistics: 0 } };
}

test('atlas coordinate search agrees with the existing 81 resource-sector positions', () => {
  for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
    const global = tileToGlobal(`t_${row}_${col}`), point = globalToAtlas(global.x, global.y);
    const sector = tilePoint(row, col);
    assert.ok(Math.abs(point.x - sector.x) < 1e-12); assert.ok(Math.abs(point.z - sector.z) < 1e-12);
    const reverse = atlasToGlobal(point.x, point.z);
    assert.ok(Math.abs(reverse.x - global.x) < 1e-9); assert.ok(Math.abs(reverse.y - global.y) < 1e-9);
  }
});

test('distinct permanent plots keep their actual footprint and home-sector identity in the atlas', () => {
  const first = colony(0), second = colony(1), a = settlementFootprint(first), b = settlementFootprint(second);
  assert.equal(a.width, 40 / 60); assert.equal(a.depth, 36 / 60);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > Math.max(a.width, a.depth));
  assert.equal(settlementTile(first), first.plot.homeTileId);
  assert.equal(settlementTile(second), second.plot.homeTileId);
});

test('camera targets remain inside the own parcel after extreme pointer, touch or focus coordinates', () => {
  const limits = parcelCameraLimits();
  for (const [x, z] of [[1e9, 1e9], [-1e9, -1e9], [0, 0], [NaN, Infinity], [19.9, -17.9]]) {
    const point = clampTarget(x, z, PARCEL_CAMERA_BOUNDS, limits.targetMargin);
    assert.ok(point.x >= -13 && point.x <= 13); assert.ok(point.z >= -11 && point.z <= 11);
  }
  assert.deepEqual(clampTarget(4, -3, PARCEL_CAMERA_BOUNDS, 7), { x: 4, z: -3 });
  assert.ok(limits.minZoom > 0 && limits.maxZoom > limits.minZoom);
  assert.ok(limits.minPolarAngle > 0 && limits.maxPolarAngle < Math.PI / 2);
  assert.ok(atlasCameraLimits().maxZoom > limits.maxZoom, 'the regional atlas can inspect small distant colonies');
});

test('regional world bounds include resource sectors and settlements beyond the original grid', () => {
  assert.deepEqual(atlasWorldBounds(), { minX: -864, maxX: 864, minY: -864, maxY: 864 });
  const remote = colony(100_000), bounds = atlasWorldBounds([remote]);
  assert.ok(bounds.minX <= remote.plot.x - remote.plot.width / 2 && bounds.maxX >= remote.plot.x + remote.plot.width / 2);
  assert.ok(bounds.minY <= remote.plot.y - remote.plot.depth / 2 && bounds.maxY >= remote.plot.y + remote.plot.depth / 2);
});

test('public colony rename, clan and real building upgrades invalidate the rendered summary', () => {
  const source = colony(), initial = settlementSceneSignature([source]);
  source.buildings.workshop = 2; assert.notEqual(settlementSceneSignature([source]), initial);
  const upgraded = settlementSceneSignature([source]); source.name = 'Nueva Aurora'; assert.notEqual(settlementSceneSignature([source]), upgraded);
  const renamed = settlementSceneSignature([source]); source.clanName = 'Alba'; assert.notEqual(settlementSceneSignature([source]), renamed);
  assert.equal(settlementSceneSignature([]), '[]', 'the atlas does not invent neighboring players');
});
