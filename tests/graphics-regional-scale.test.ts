import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { REGIONAL_UNIT_SCALE } from '../lib/graphics/renderer.ts';
import { createBuilding, createUnit } from '../lib/graphics/models.ts';

test('every regional unit is a person-sized miniature beside the public village buildings', () => {
  const home=createBuilding('home',1);home.scale.setScalar(.064);
  const buildingBounds=new THREE.Box3().setFromObject(home),buildingHeight=buildingBounds.getSize(new THREE.Vector3()).y;
  for(const type of ['scout','guard','ranged','engineer'] as const){
    const unit=createUnit(type);unit.scale.setScalar(REGIONAL_UNIT_SCALE);
    const dimensions=new THREE.Box3().setFromObject(unit).getSize(new THREE.Vector3());
    assert.ok(dimensions.y<buildingHeight*.65,`${type} must be shorter than a house`);
    assert.ok(dimensions.x<40/60*.13,`${type} must not cover an entire public parcel`);
    assert.ok(dimensions.y>.04,`${type} remains visible at colony inspection zoom`);
  }
});
