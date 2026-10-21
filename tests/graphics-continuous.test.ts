import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import * as THREE from 'three';
import { continuousGroundHeight, LANDSCAPE_BOUNDS, sceneryHasGround, valleyRoadCenter } from '../lib/graphics/continuous-layout.ts';
import { riverCenter, sceneryWaterHeight, settlementHeightAt } from '../lib/graphics/settlement-layout.ts';
import { createSettlement } from '../lib/graphics/settlement.ts';
import { disposeModelResources } from '../lib/graphics/models.ts';
import { PARCEL_DEPTH, PARCEL_WIDTH, starterProtection } from '../lib/mvp/settlements.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';

after(() => disposeModelResources());

test('village edge elevations join the surrounding valley without an exposed slab drop', () => {
  for (const [x, z] of [[-16.1, 0], [16.1, 3], [0, 13.1], [-16.1, 6], [1, -13.1]]) {
    assert.ok(Math.abs(continuousGroundHeight(x, z) - settlementHeightAt(x, z)) < .015, 'the first surrounding ground matches the authored edge');
  }
  for (const z of [15, 24, 45, 70]) {
    assert.ok(sceneryHasGround(riverCenter(z), z));
    assert.ok(continuousGroundHeight(riverCenter(z), z) < sceneryWaterHeight(z), 'downstream water has a riverbed');
  }
  assert.equal(valleyRoadCenter(-24, .4 + Math.sin(-14 * .08) * 2.2), true);
});

test('real terrain geometry covers the parcel and every surrounding camera direction', () => {
  const scene = createSettlement({ player: null, quality: 'performance', showcase: true });
  const valley = scene.group.getObjectByName('continuous-forested-valley')!;
  const ground = scene.group.getObjectByName('continuous-valley-ground') as THREE.Mesh;
  const ray = new THREE.Raycaster(); valley.updateMatrixWorld(true);
  for (const [x, z] of [[-23,-21],[23,-21],[-23,21],[23,21],[-70,0],[70,0],[0,-70],[0,70],[-65,-65],[65,65]]) {
    ray.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
    const intersections = ray.intersectObject(ground);
    assert.ok(intersections.length > 0, `actual ground exists at ${x},${z}`);
    assert.ok(Number.isFinite(intersections[0].point.y));
  }
  const river = scene.group.getObjectByName('continuous-upstream-and-downstream-river') as THREE.Mesh;
  const vertices = river.geometry.getAttribute('position');
  let downstream = false, upstream = false;
  for (let index = 0; index < vertices.count; index++) {
    if (vertices.getZ(index) > 20 && vertices.getY(index) < -1) downstream = true;
    if (vertices.getZ(index) < -20 && vertices.getY(index) > 1) upstream = true;
  }
  assert.ok(downstream && upstream, 'the actual water geometry continues on both sides of the village');
  assert.deepEqual(scene.landscapeBounds, LANDSCAPE_BOUNDS);
  assert.ok(valley.userData.distantTrees > 200, 'surroundings have a volumetric forest horizon');
  scene.dispose();
});

test('parcel markers use canonical plot dimensions and remain hidden without an owned profile', () => {
  const scene = createSettlement({ player: null, quality: 'performance', showcase: false });
  assert.equal(scene.parcelBounds.xMax - scene.parcelBounds.xMin, PARCEL_WIDTH);
  assert.equal(scene.parcelBounds.zMax - scene.parcelBounds.zMin, PARCEL_DEPTH);
  scene.setParcelBoundaryVisible(true);
  assert.equal(scene.parcelBoundary.visible, false);
  scene.dispose();
  const now = 1_000;
  const world = createMvpWorld('test-owner', now);
  const player = createPlayer(world, { ownerId: 'test-owner', requestId: 'boundary-test', actor: null, now }, { type: 'player.create', name: 'Ana', stationName: 'Alba', faction: 'cartographers' });
  const owned = createSettlement({ player: { ...player, starterProtection: starterProtection(world, player, now) }, quality: 'performance', showcase: false });
  owned.setParcelBoundaryVisible(true);
  assert.equal(owned.parcelBoundary.visible, true);
  owned.setParcelBoundaryVisible(false);
  assert.equal(owned.parcelBoundary.visible, false);
  owned.dispose();
});
