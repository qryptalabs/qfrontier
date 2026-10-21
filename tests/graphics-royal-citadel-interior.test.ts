import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelInterior} from '../lib/graphics/royal-citadel-interior.ts';
import {createRoyalCitadel,disposeRoyalHarborCastleResources,ROYAL_CITADEL_LOCAL_PLAN} from '../lib/graphics/royal-harbor-castle.ts';
import {ROYAL_CITADEL_TRANSFORM} from '../lib/graphics/royal-citadel-layout.ts';
import {ROYAL_INTERIOR_ROUTE,ROYAL_INTERIOR_TOWER_ROUTE,ROYAL_INTERIOR_TOWER,royalTowerStepPoint} from '../lib/graphics/royal-citadel-interior-layout.ts';
import {moveRoyalWalker} from '../lib/graphics/royal-harbor-layout.ts';

function shell(){const group=createRoyalCitadel(),t=ROYAL_CITADEL_TRANSFORM;group.scale.setScalar(t.scale);group.position.set(0,t.baseY,t.originZ);group.updateMatrixWorld(true);return group;}
function colliders(){const t=ROYAL_CITADEL_TRANSFORM;return ROYAL_CITADEL_LOCAL_PLAN.solidColliders.map(o=>({x:o.x*t.scale,z:t.originZ+o.z*t.scale,halfWidth:o.halfWidth*t.scale,halfDepth:o.halfDepth*t.scale,minY:t.baseY+o.minY*t.scale,maxY:t.baseY+o.maxY*t.scale}));}

test('public palace contains real luxury furnishings at human scale and finite sector/material budgets',()=>{
  const interior=createRoyalCitadelInterior();
  try{assert.equal(interior.metrics.rooms,9);assert.ok(interior.metrics.chandeliers>=9);assert.ok(interior.metrics.candelabras>=8);assert.equal(interior.metrics.doors,3);assert.equal(interior.metrics.tables,2);assert.equal(interior.metrics.lights,4);assert.ok(interior.metrics.drawCalls<70);
    // The furnished ceremonial wing adds sculptures, bookcases and carved rails
    // to the prior sparse interior while retaining its sector/material limits.
    assert.ok(interior.metrics.triangles<280_000);assert.ok(interior.metrics.royalSeats>=10);assert.equal(interior.metrics.statues,9);assert.equal(interior.metrics.bookcases,2);assert.equal(interior.metrics.lions,2);assert.equal(interior.metrics.royalIvoryPanels,5);assert.equal(interior.metrics.heraldicStandards,2);assert.equal(interior.metrics.royalPendant.y,1211);
    const names:string[]=[];interior.group.traverse(o=>{if(o instanceof THREE.Mesh){names.push(o.name);for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});for(const finish of['wood','gold','velvet','flame','marble'])assert.ok(names.some(n=>n.endsWith(':'+finish)));
    interior.setFocus(0,1187,-3865);assert.equal(interior.group.getObjectByName('royal-interior-sector:throne')!.visible,true);interior.group.updateMatrixWorld(true);const cladding=new THREE.Raycaster(new THREE.Vector3(33,1215,-3925),new THREE.Vector3(0,0,-1),0,7).intersectObject(interior.group,true)[0];assert.ok(cladding&&cladding.object.name.endsWith(':marble'),'the royal backdrop is actual smooth ivory cladding in front of structural brick');interior.setFocus(20000,0,20000);assert.ok(interior.group.children.filter(c=>c.name.startsWith('royal-interior-sector:')).every(c=>!c.visible));
  }finally{interior.dispose();}
});

test('royal doors, furniture and original castle walls leave the complete throne and tower routes physically connected',()=>{
  const interior=createRoyalCitadelInterior(),blockers=[...colliders(),...interior.obstacles];
  try{for(const route of[ROYAL_INTERIOR_ROUTE,ROYAL_INTERIOR_TOWER_ROUTE]){let p={...route[0]};for(const goal of route.slice(1)){const start={...p},steps=Math.ceil(Math.hypot(goal.x-p.x,goal.z-p.z)/.4);for(let i=1;i<=steps;i++){const x=start.x+(goal.x-start.x)*i/steps,z=start.z+(goal.z-start.z)*i/steps;p=moveRoyalWalker(p,x-p.x,z-p.z,blockers);assert.ok(Math.hypot(x-p.x,z-p.z)<.01,`an actual obstacle blocks the palace at ${x},${z}`);}}}
    let p=royalTowerStepPoint(0);for(let i=1;i<=ROYAL_INTERIOR_TOWER.steps;i++){const goal=royalTowerStepPoint(i);p=moveRoyalWalker(p,goal.x-p.x,goal.z-p.z,blockers,.8);assert.ok(Math.hypot(p.x-goal.x,p.z-goal.z)<.01,`tower obstacle at step ${i}`);}
  }finally{interior.dispose();disposeRoyalHarborCastleResources();}
});

test('every tower tread meets its rendered stone and has headroom through the actual exterior shell and lookout opening',()=>{
  const interior=createRoyalCitadelInterior(),castle=shell();interior.group.updateMatrixWorld(true);
  try{
    for(let i=0;i<ROYAL_INTERIOR_TOWER.steps;i+=7){const p=royalTowerStepPoint(i+.5),top=royalTowerStepPoint(i+1).y,head=new THREE.Raycaster(new THREE.Vector3(p.x,top+.2,p.z),new THREE.Vector3(0,1,0),0,3.5).intersectObjects([castle,interior.group],true);assert.equal(head.length,0,`no old roof, cornice or balcony covers the head at tread ${i}`);
      const floor=new THREE.Raycaster(new THREE.Vector3(p.x,top+.12,p.z),new THREE.Vector3(0,-1,0),0,.2).intersectObject(interior.group,true)[0];assert.ok(floor&&Math.abs(floor.point.y-top)<.002,`tread ${i} matches the physical surface`);}
    const portal=new THREE.Raycaster(new THREE.Vector3(675,1189.6,ROYAL_INTERIOR_TOWER.z),new THREE.Vector3(1,0,0),0,58).intersectObjects([castle,interior.group],true);assert.equal(portal.length,0,'the west tower door is a real hole through all masonry layers');
    const view=new THREE.Raycaster(new THREE.Vector3(710,2013,ROYAL_INTERIOR_TOWER.z),new THREE.Vector3(-1,0,0),0,70).intersectObject(castle,true);assert.equal(view.length,0,'the lookout has an open view through the actual tower wall');
  }finally{interior.dispose();disposeRoyalHarborCastleResources();}
});

test('independent interior viewers release every owned GPU resource exactly once',()=>{
  const a=createRoyalCitadelInterior(),b=createRoyalCitadelInterior();let freed=0,expected=0;const seen=new Set<THREE.Material>();a.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.addEventListener('dispose',()=>freed++);expected++;for(const m of Array.isArray(o.material)?o.material:[o.material])if(!seen.has(m)){seen.add(m);expected++;m.addEventListener('dispose',()=>freed++);}}});a.update(19);a.dispose();a.dispose();assert.equal(freed,expected);assert.equal(a.group.children.length,0);assert.ok(b.group.children.length>0);b.dispose();
});
