import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import * as THREE from 'three';
import { createSettlement } from '../lib/graphics/settlement.ts';
import { createBuilding, disposeModelResources } from '../lib/graphics/models.ts';
import { islandContains, isSceneryWater, riverCenter, sceneryWaterHeight, SETTLEMENT_ANCHORS, settlementHeightAt } from '../lib/graphics/settlement-layout.ts';

after(() => disposeModelResources());

test('all village facilities stand on land and the river traverses the island', () => {
  for (const [name, point] of Object.entries(SETTLEMENT_ANCHORS)) {
    if (name === 'bridge') continue;
    assert.ok(islandContains(point[0], point[2]), `${name} is inside the island`);
    assert.equal(isSceneryWater(point[0], point[2]), false, `${name} is on land`);
    assert.ok(Math.abs(point[1] - settlementHeightAt(point[0], point[2])) < .01, `${name} is grounded`);
  }
  for (let z = -12; z <= 12; z += 1) assert.equal(isSceneryWater(riverCenter(z), z), true);
  assert.ok(sceneryWaterHeight(-5) > sceneryWaterHeight(10));
  assert.ok(sceneryWaterHeight(10) > sceneryWaterHeight(12));
  const [mineX, , mineZ] = SETTLEMENT_ANCHORS.mine;
  for (let i = 0; i < 13; i++) {
    const z = mineZ + .2 + i * .27;
    assert.equal(isSceneryWater(mineX - .46, z), false, 'both mine rails remain above the bank');
    assert.equal(isSceneryWater(mineX + .46, z), false);
  }
});

test('the authored island is volumetric, finite and batched for browser rendering', () => {
  const settlement = createSettlement({ player: null, quality: 'fullhd', showcase: true });
  let drawCalls = 0, triangles = 0;
  settlement.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    drawCalls++;
    const positions = object.geometry.getAttribute('position');
    for (const value of positions.array) assert.ok(Number.isFinite(value));
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    triangles += (object.geometry.index?.count ?? positions.count) / 3 * count;
    if (object instanceof THREE.InstancedMesh) {
      for (const value of object.instanceMatrix.array) assert.ok(Number.isFinite(value));
    }
  });
  assert.ok(drawCalls < 80, `${drawCalls} island draw calls fit the budget`);
  assert.ok(triangles < 900_000, `${triangles} triangles fit the detailed desktop budget`);
  const bounds = new THREE.Box3().setFromObject(settlement.group);
  assert.ok(bounds.max.y > 8, 'the mountain has real vertical depth');
  assert.ok(bounds.max.x - bounds.min.x > 30, 'the village covers the authored island');
  assert.ok(settlement.group.userData.forestTrees > 70, 'the forest is a dense composed border');
  assert.ok(settlement.group.userData.terrainVoxels > 5000, 'cliffs, paths and props use visible voxels');
  assert.ok(settlement.group.userData.mountainSpires >= 10, 'the mountain has distinct fractured vertical pinnacles');
  assert.ok(settlement.group.userData.mountainShoulders > 150, 'a broad joined rock shoulder connects the pinnacles above the mine');
  assert.equal(settlement.group.userData.continuousCascades, 4);
  assert.ok(settlement.group.getObjectByName('continuous-cascade-sheets') instanceof THREE.Mesh);
  assert.ok(settlement.group.getObjectByName('moving-river-ripples') instanceof THREE.InstancedMesh);
  settlement.dispose();
});

test('water animation changes geometry transforms, and reduced motion is stable', () => {
  const settlement = createSettlement({ player: null, quality: 'performance', showcase: false });
  const foam = settlement.foam!;
  settlement.animate(0, false);
  const still = [...foam.instanceMatrix.array];
  settlement.animate(4, false);
  assert.notDeepEqual([...foam.instanceMatrix.array], still);
  settlement.animate(10, true);
  const reduced = [...foam.instanceMatrix.array];
  settlement.animate(20, true);
  assert.deepEqual([...foam.instanceMatrix.array], reduced);
  assert.ok(settlement.waterfall!.count > 20);
  const river = settlement.water[0];
  const positions = river.geometry.getAttribute('position'), uvs = river.geometry.getAttribute('uv');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    assert.ok(Math.abs(uvs.getX(vertex) - positions.getX(vertex) / 6) < .0001, 'water uses consistent world-scale pixels');
    assert.ok(Math.abs(uvs.getY(vertex) - positions.getZ(vertex) / 6) < .0001);
  }
  settlement.dispose();
});

test('tearing down an island leaves shared building geometry and textures alive', () => {
  const model = createBuilding('workshop', 1, 'cartographers');
  let sharedDisposals = 0;
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.addEventListener('dispose', () => sharedDisposals++);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.addEventListener('dispose', () => sharedDisposals++));
  });
  const settlement = createSettlement({ player: null, quality: 'performance', showcase: true });
  let instanceCount = 0, disposedInstances = 0;
  settlement.group.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    instanceCount++;
    object.addEventListener('dispose', () => disposedInstances++);
  });
  settlement.dispose();
  assert.equal(sharedDisposals, 0);
  assert.ok(instanceCount >= 3);
  assert.equal(disposedInstances, instanceCount, 'each instance matrix GPU buffer is released');
});
