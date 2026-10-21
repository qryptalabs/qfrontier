import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelInterior} from '../lib/graphics/royal-citadel-interior.ts';
import {createRoyalCitadelInteriorLife} from '../lib/graphics/royal-citadel-interior-life.ts';
import {createRoyalHarborScene} from '../lib/graphics/royal-harbor-scene.ts';
import {ROYAL_INTERIOR_ROUTE,ROYAL_INTERIOR_TOWER_ROUTE,ROYAL_INTERIOR_TOWER,royalTowerStepPoint,royalInteriorWalkHeight} from '../lib/graphics/royal-citadel-interior-layout.ts';
import {moveRoyalWalker} from '../lib/graphics/royal-harbor-layout.ts';

test('real palace walls, furniture and the castle shell leave the whole interior and tower journey reachable',()=>{
  const district=createRoyalHarborScene(),interior=createRoyalCitadelInterior(),life=createRoyalCitadelInteriorLife(),obstacles=[...district.obstacles,...interior.obstacles];
  try{
    for(let seconds=0;seconds<1200;seconds+=1){life.update(seconds);for(const body of life.colliders())for(const obstacle of obstacles)assert.ok(!(body.y+body.height>(obstacle.minY??-Infinity)&&body.y<(obstacle.maxY??Infinity)&&Math.abs(body.x-obstacle.x)<obstacle.halfWidth+body.radius&&Math.abs(body.z-obstacle.z)<obstacle.halfDepth+body.radius),body.id+' clears actual palace furniture and walls');}
    for(const route of[ROYAL_INTERIOR_ROUTE,ROYAL_INTERIOR_TOWER_ROUTE]){
      let p={...route[0]};
      for(const target of route.slice(1)){const n=Math.ceil(Math.hypot(target.x-p.x,target.z-p.z)/.3),dx=(target.x-p.x)/n,dz=(target.z-p.z)/n;for(let i=0;i<n;i++){const next=moveRoyalWalker(p,dx,dz,obstacles);assert.ok(Math.hypot(next.x-p.x-dx,next.z-p.z-dz)<.01,'an interior route must clear the rendered district obstacles');p=next;}}
    }
    let p=royalTowerStepPoint(0);
    for(let i=1;i<=ROYAL_INTERIOR_TOWER.steps;i++){const target=royalTowerStepPoint(i);p=moveRoyalWalker(p,target.x-p.x,target.z-p.z,obstacles,.8);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.01,'tower ascent step '+i+' clears the old castle facade and new corridor');assert.ok(Math.abs(p.y-target.y)<.2);}
    const tower=ROYAL_INTERIOR_TOWER,dx=(p.x-tower.x)/tower.radius,dz=(p.z-tower.z)/tower.radius;
    for(let i=0;i<20;i++)p=moveRoyalWalker(p,dx*.5,dz*.5,obstacles,.8);
    assert.ok(Math.abs(Math.hypot(p.x-tower.x,p.z-tower.z)-70)<.1,'the final stair actually joins the lookout deck');assert.ok(Math.abs(p.y-tower.endY)<.2);
    for(let i=0;i<20;i++)p=moveRoyalWalker(p,-dx*.5,-dz*.5,obstacles,.8);
    for(let i=tower.steps-1;i>=0;i--){const target=royalTowerStepPoint(i);p=moveRoyalWalker(p,target.x-p.x,target.z-p.z,obstacles,.8);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.01,'tower descent step '+i+' remains reachable');assert.ok(Math.abs(p.y-target.y)<.2);}
  }finally{life.dispose();interior.dispose();district.dispose();}
});

test('royal people and spiral stairs meet rendered floors and have free headroom inside the complete castle',()=>{
  const district=createRoyalHarborScene(),interior=createRoyalCitadelInterior(),life=createRoyalCitadelInteriorLife();district.group.updateMatrixWorld(true);interior.group.updateMatrixWorld(true);
  try{
    const fixed=[district.group,interior.group];
    const check=(x:number,y:number,z:number,label:string,tolerance:number)=>{
      const ground=new THREE.Raycaster(new THREE.Vector3(x,y+.15,z),new THREE.Vector3(0,-1,0),0,.4).intersectObjects(fixed,true)[0];assert.ok(ground&&Math.abs(ground.point.y-y)<tolerance,label+' needs real visible paving under its feet');
      const overhead=new THREE.Raycaster(new THREE.Vector3(x,y+.22,z),new THREE.Vector3(0,1,0),0,3.8).intersectObjects(fixed,true)[0];assert.ok(!overhead,label+' needs unobstructed headroom through old cornices and roofs; hit '+overhead?.object.name+' at '+overhead?.point.y);
    };
    for(const seconds of[0,20,100,200,500]){life.update(seconds);for(const body of life.colliders())check(body.x,body.y,body.z,body.id,.08);}
    for(let i=1;i<=ROYAL_INTERIOR_TOWER.steps;i+=37){const point=royalTowerStepPoint(i),y=royalInteriorWalkHeight(point.x,point.z,point.y)!;check(point.x,y,point.z,'spiral step '+i,.2);}
  }finally{life.dispose();interior.dispose();district.dispose();}
});
