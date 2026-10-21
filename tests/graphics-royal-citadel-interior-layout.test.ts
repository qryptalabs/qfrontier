import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ROYAL_INTERIOR_ROUTE,ROYAL_INTERIOR_TOWER_ROUTE,ROYAL_INTERIOR_TOWER,ROYAL_INTERIOR_DAIS,royalTowerStepPoint,royalInteriorWalkHeight,royalInteriorLocation} from '../lib/graphics/royal-citadel-interior-layout.ts';
import {moveRoyalWalker,royalWalkHeight} from '../lib/graphics/royal-harbor-layout.ts';

test('the interior route joins the existing entrance, imperial stairs, gallery and throne without jumping floors',()=>{
 let point={...ROYAL_INTERIOR_ROUTE[0]};
 for(const target of [...ROYAL_INTERIOR_ROUTE,{x:0,y:ROYAL_INTERIOR_DAIS.y,z:-3909}]){
  const n=Math.ceil(Math.hypot(target.x-point.x,target.z-point.z)/.35),dx=(target.x-point.x)/Math.max(1,n),dz=(target.z-point.z)/Math.max(1,n);
  for(let i=0;i<n;i++){const next=moveRoyalWalker(point,dx,dz,[]);assert.ok(Math.abs(next.y-point.y)<=.85);point=next;}
  assert.ok(Math.hypot(point.x-target.x,point.z-target.z)<.01,`reachable interior waypoint ${JSON.stringify(target)}`);assert.ok(Math.abs(point.y-target.y)<.2);
 }
 assert.equal(royalInteriorLocation(point.x,point.y,point.z),'Salón del Trono');
});

test('tower access and all spiral turns preserve the current floor and permit ascent and descent',()=>{
 let p={...ROYAL_INTERIOR_TOWER_ROUTE[0]};
 for(const to of ROYAL_INTERIOR_TOWER_ROUTE.slice(1)){const n=Math.ceil(Math.hypot(to.x-p.x,to.z-p.z)/.3),dx=(to.x-p.x)/n,dz=(to.z-p.z)/n;for(let i=0;i<n;i++)p=moveRoyalWalker(p,dx,dz,[]);assert.ok(Math.hypot(p.x-to.x,p.z-to.z)<.01);}
 const tower=ROYAL_INTERIOR_TOWER;
 for(let i=1;i<=tower.steps;i++){const to=royalTowerStepPoint(i);p=moveRoyalWalker(p,to.x-p.x,to.z-p.z,[],.8);assert.ok(Math.hypot(p.x-to.x,p.z-to.z)<.01,`spiral step ${i}`);assert.ok(Math.abs(p.y-to.y)<.2,`correct floor at turn ${i}`);}
 assert.ok(Math.abs(p.y-tower.endY)<.01);
 for(let i=tower.steps-1;i>=0;i--){const to=royalTowerStepPoint(i);p=moveRoyalWalker(p,to.x-p.x,to.z-p.z,[],.8);assert.ok(Math.abs(p.y-to.y)<.2,`descent step ${i}`);}
 assert.ok(Math.abs(p.y-tower.startY)<.2);
});

test('stacked tower floors cannot be reached by a horizontal shortcut or a large rise',()=>{
 const t=ROYAL_INTERIOR_TOWER,p=royalTowerStepPoint(100);
 assert.ok(Math.abs(royalInteriorWalkHeight(p.x,p.z,p.y)!-p.y)<.2);
 const upper=royalTowerStepPoint(100+Math.round(Math.PI*2*t.radius/t.stride));
 assert.ok(upper.y-p.y>100);
 assert.ok(Math.abs(royalWalkHeight(p.x,p.z,p.y)!-p.y)<.2);
 assert.equal(royalInteriorWalkHeight(20000,-6000),null);
});
