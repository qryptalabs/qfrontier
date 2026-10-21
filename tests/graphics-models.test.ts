import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import * as THREE from 'three';
import { BUILDING_LABELS, ITEMS } from '../lib/mvp/catalog.ts';
import type { BuildingType, Faction, Unit } from '../lib/mvp/types.ts';
import { createBuilding, createItem, createUnit, disposeModelResources } from '../lib/graphics/models.ts';

function inspect(model: THREE.Group, drawBudget: number) {
  model.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  let vertices = 0;
  const signature = createHash('sha256');
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    const positions = object.geometry.getAttribute('position');
    assert.ok(positions instanceof THREE.BufferAttribute, `${model.name} has vertex positions`);
    assert.ok(positions.count > 0, `${model.name} has visible geometry`);
    vertices += positions.count;
    for (const value of positions.array) assert.ok(Number.isFinite(value), `${model.name} contains a finite vertex`);
    const normals = object.geometry.getAttribute('normal');
    assert.ok(normals instanceof THREE.BufferAttribute, `${model.name} has lighting normals`);
    for (const value of normals.array) assert.ok(Number.isFinite(value), `${model.name} has finite lighting normals`);
    signature.update(Buffer.from(positions.array.buffer, positions.array.byteOffset, positions.array.byteLength));
    signature.update(object.matrixWorld.elements.join(','));
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      assert.ok(material instanceof THREE.MeshStandardMaterial, `${model.name} supports scene lighting`);
      signature.update(material.color.getHexString());
    }
  });
  assert.ok(meshes.length > 0 && meshes.length <= drawBudget, `${model.name} fits its draw-call budget`);
  assert.ok(vertices < 100_000, `${model.name} remains a reusable game asset`);
  const bounds = new THREE.Box3().setFromObject(model);
  assert.ok(!bounds.isEmpty(), `${model.name} can be auto-framed`);
  for (const value of [...bounds.min.toArray(), ...bounds.max.toArray()]) assert.ok(Number.isFinite(value));
  const size = bounds.getSize(new THREE.Vector3());
  for (const dimension of size.toArray()) assert.ok(dimension > 0.005 && dimension < 8, `${model.name} fits the shared world scale`);
  return { bounds, meshes, vertices, fingerprint: signature.digest('hex') };
}

test('the complete 40-item catalog has finite, lit and distinct renderable exhibits', () => {
  assert.equal(ITEMS.length, 40);
  const signatures = new Set<string>();
  for (const item of ITEMS) {
    const result = inspect(createItem(item.id), 12);
    assert.ok(!signatures.has(result.fingerprint), `${item.id} must not silently reuse a generic item model`);
    signatures.add(result.fingerprint);
  }
});

test('all seven facilities have three visually different upgrade stages at a consistent scale', () => {
  const buildings = Object.keys(BUILDING_LABELS) as BuildingType[];
  assert.equal(buildings.length, 7);
  for (const type of buildings) {
    const stages = [1, 2, 3].map(level => inspect(createBuilding(type, level, 'cartographers'), 24));
    assert.equal(new Set(stages.map(stage => stage.fingerprint)).size, 3, `${type} upgrades change actual geometry`);
    assert.ok(stages[2].vertices > stages[0].vertices, `${type} gains visible construction detail`);
    // Details may fit within an existing silhouette, as with a stocked depot.
    // Auto-framing must therefore use actual bounds, not infer size from tier.
    assert.ok(stages.every(stage => stage.bounds.min.y >= -0.05), `${type} rests on the terrain`);
  }
});

test('all twelve unit variants expose independent animation limbs and faction colours', () => {
  const factions: Faction[] = ['cartographers', 'forgers', 'custodians'];
  const units: Unit['type'][] = ['scout', 'guard', 'ranged', 'engineer'];
  for (const type of units) {
    const signatures = new Set<string>();
    for (const faction of factions) {
      const unit = createUnit(type, faction);
      signatures.add(inspect(unit, 28).fingerprint);
      for (const name of ['leftLeg', 'rightLeg', 'leftArm', 'rightArm']) {
        const limb = unit.getObjectByName(name);
        assert.ok(limb instanceof THREE.Group, `${type} exposes ${name} for animation`);
        assert.equal(limb.parent, unit, `${type} has an independent ${name} pivot`);
      }
      const other = createUnit(type, faction);
      unit.getObjectByName('leftLeg')!.rotation.x = 0.65;
      unit.position.x = 12;
      assert.ok(Math.abs(other.getObjectByName('leftLeg')!.rotation.x) < 1e-12);
      assert.equal(other.position.x, 0);
    }
    assert.equal(signatures.size, 3, `${type} shows all three faction identities`);
  }
});

test('repeated model instances share GPU data without sharing their scene transforms', () => {
  const first = createItem('timber');
  const second = createItem('timber');
  const a = inspect(first, 12).meshes;
  const b = inspect(second, 12).meshes;
  assert.notEqual(first, second);
  assert.equal(a.length, b.length);
  for (let index = 0; index < a.length; index += 1) {
    assert.notEqual(a[index], b[index]);
    assert.equal(a[index].geometry, b[index].geometry);
    assert.equal(a[index].material, b[index].material);
  }
  first.position.set(8, 4, 2);
  first.remove(first.children[0]);
  assert.deepEqual(second.position.toArray(), [0, 0, 0]);
  assert.equal(createItem('timber').children.length, second.children.length);
});

test('world landmarks used outside the catalog are renderable in all factions', () => {
  for (const type of ['home', 'mine', 'outpost', 'bridge'] as const) {
    for (const faction of ['cartographers', 'forgers', 'custodians'] as const) inspect(createBuilding(type, 1, faction), 24);
  }
});

test('a full renderer teardown disposes shared resources once and rebuilds a fresh pool', () => {
  const previous = inspect(createItem('timber'), 12).meshes;
  const geometries = new Set(previous.map(mesh => mesh.geometry));
  const materials = new Set(previous.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  let geometryDisposals = 0;
  let materialDisposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  for (const material of materials) material.addEventListener('dispose', () => { materialDisposals += 1; });
  disposeModelResources();
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  const renewed = inspect(createItem('timber'), 12).meshes;
  for (let index = 0; index < renewed.length; index += 1) {
    assert.notEqual(renewed[index].geometry, previous[index].geometry);
    assert.notEqual(renewed[index].material, previous[index].material);
  }
  disposeModelResources();
  assert.equal(geometryDisposals, geometries.size, 'old buffers are not disposed again');
  assert.equal(materialDisposals, materials.size, 'old materials are not disposed again');
});

after(() => disposeModelResources());
