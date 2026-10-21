import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelFlags,ROYAL_CITADEL_FLAG_PLAN} from '../lib/graphics/royal-citadel-flags.ts';

test('royal flags wave as actual cloth while every mast edge stays fixed and heraldry follows the geometry',()=>{
  const flags=createRoyalCitadelFlags();
  try{
    assert.equal(flags.metrics.flags,13);assert.equal(flags.metrics.drawCalls,2);assert.ok(flags.metrics.triangles<10_000);
    const cloth=flags.group.getObjectByName('royal-blue-gold-animated-cloth') as THREE.Mesh,geometry=cloth.geometry,positions=geometry.getAttribute('position'),colors=geometry.getAttribute('color');
    assert.ok(cloth.material instanceof THREE.MeshStandardMaterial);assert.equal((cloth.material as THREE.MeshStandardMaterial).side,THREE.DoubleSide);
    const before=Array.from(positions.array);flags.update(1.75);let moved=0;
    for(let flag=0;flag<ROYAL_CITADEL_FLAG_PLAN.length;flag++)for(let row=0;row<=12;row++)for(let column=0;column<=24;column++){
      const vertex=flag*325+row*25+column;
      for(let component=0;component<3;component++)assert.ok(Number.isFinite(positions.array[vertex*3+component]));
      const delta=Math.hypot(...[0,1,2].map(c=>positions.array[vertex*3+c]-before[vertex*3+c]) as [number,number,number]);
      if(column===0)assert.equal(delta,0,'cloth is pinned to its own mast, including when its wind direction is rotated');else if(delta>1e-5)moved++;
    }
    assert.ok(moved>1000);assert.ok(new Set(Array.from(colors.array)).size>3,'blue fabric and gold insignia are vertex attributes on the same cloth');
    const reference=Array.from(positions.array);flags.update(1.75);assert.deepEqual(Array.from(positions.array),reference,'all views receive a deterministic wind phase');
    flags.update(Number.NaN);for(const n of positions.array)assert.ok(Number.isFinite(n));
  }finally{flags.dispose();}
});

test('independent flag viewers own their animation buffers and dispose each GPU resource only once',()=>{
  const a=createRoyalCitadelFlags(),b=createRoyalCitadelFlags(),aa=a.group.getObjectByName('royal-blue-gold-animated-cloth') as THREE.Mesh,bb=b.group.getObjectByName('royal-blue-gold-animated-cloth') as THREE.Mesh;
  const original=Array.from(bb.geometry.attributes.position.array);a.update(99);assert.deepEqual(Array.from(bb.geometry.attributes.position.array),original);assert.notEqual(aa.geometry,bb.geometry);
  let disposed=0;a.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.addEventListener('dispose',()=>disposed++);(o.material as THREE.Material).addEventListener('dispose',()=>disposed++);}});
  a.dispose();a.dispose();assert.equal(disposed,4);assert.equal(a.group.children.length,0);b.dispose();
});
