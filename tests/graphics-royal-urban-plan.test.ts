import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ROYAL_URBAN_STREETS,ROYAL_URBAN_PLAZAS,ROYAL_BRIDGE_APPROACH,ROYAL_PALACE_AVENUE,ROYAL_PUBLIC_BRIDGE_ROUTE,ROYAL_BRIDGE_TO_PALACE,ROYAL_COURT_SERVICE_LANE,royalUrbanRoadAt} from '../lib/graphics/royal-urban-plan.ts';
import {ROYAL_GRAND_BRIDGE as B,royalRiver} from '../lib/graphics/royal-canal-layout.ts';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {ROYAL_PORT_OFFSET as O} from '../lib/graphics/royal-proportions.ts';
import {royalNavigation} from '../lib/graphics/royal-navigation.ts';
import {shopTradeRoad} from '../lib/graphics/city-shop-route.ts';

test('carriage roads replace the 30 percent wedges with surveyed grades below eight percent',()=>{
 for(const road of ROYAL_URBAN_STREETS.filter(r=>r.width>=8))for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],run=Math.hypot(b.x-a.x,b.z-a.z);assert(run>0);assert(Math.abs(b.y-a.y)/run<=.08,road.id);}
 assert.equal(B.width,12);assert.equal(ROYAL_URBAN_PLAZAS.filter(p=>p.id.startsWith('bridge-square')).length,2);assert(ROYAL_BRIDGE_APPROACH.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b.x-ROYAL_BRIDGE_APPROACH[i].x,b.z-ROYAL_BRIDGE_APPROACH[i].z),0)>500);
});

test('streets that meet in plan also meet at the same elevation',()=>{
 const segments=ROYAL_URBAN_STREETS.flatMap(road=>road.points.slice(1).map((b,i)=>({id:road.id,a:road.points[i],b})));
 const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j],rx=a.b.x-a.a.x,rz=a.b.z-a.a.z,sx=b.b.x-b.a.x,sz=b.b.z-b.a.z,den=cross(rx,rz,sx,sz);
  if(Math.abs(den)<1e-8)continue;
  const dx=b.a.x-a.a.x,dz=b.a.z-a.a.z,t=cross(dx,dz,sx,sz)/den,u=cross(dx,dz,rx,rz)/den;
  if(t<0||t>1||u<0||u>1)continue;
  const ay=a.a.y+(a.b.y-a.a.y)*t,by=b.a.y+(b.b.y-b.a.y)*u;
  assert(Math.abs(ay-by)<.25,`${a.id} meets ${b.id}: ${ay} vs ${by}`);
 }
});

function walkRoute(route:readonly {x:number;z:number}[],radius=.4){const nav=royalNavigation();let p={...route[0],y:nav.surface.walk(route[0].x,route[0].z)!};assert(Number.isFinite(p.y));for(const q of route.slice(1)){const next=nav.line(p,q,undefined,radius);assert(next,`blocked: ${JSON.stringify(p)} -> ${JSON.stringify(q)}`);p=next;}return p;}

test('a visitor can walk from the shop up the west approach, cross the bridge and enter the real service gate',()=>{
 for(const route of[ROYAL_PUBLIC_BRIDGE_ROUTE,[...ROYAL_PUBLIC_BRIDGE_ROUTE].reverse()])walkRoute(route);
 walkRoute(ROYAL_BRIDGE_TO_PALACE.slice(0,-ROYAL_COURT_SERVICE_LANE.length+1),1.05);walkRoute(ROYAL_PALACE_AVENUE.slice(0,-ROYAL_COURT_SERVICE_LANE.length+1),1.05);
});

test('local animal-drawn shop freight uses both graded approaches and the real high crossing',()=>{
 const road=shopTradeRoad('corona-del-alba');assert(road.some(p=>p.x< -400));assert(road.some(p=>p.x===132&&p.z===100));const districtRoad=road.slice(0,road.findIndex(p=>p.x>450));walkRoute(districtRoad,1.05);walkRoute([...districtRoad].reverse(),1.05);
});

test('the larger houses have human doors and distinct warehouse footprints, all clear of water and main roads',()=>{
 const layer=createRoyalWorldLayer(1);try{const data=layer.group.userData.royalCity,buildings=data.buildings;assert(buildings.length>=35);assert(buildings.some((b:{district:string;width:number})=>b.district==='upper'));assert(buildings.some((b:{district:string;width:number})=>b.district==='port'&&b.width>=14));
  for(const b of buildings){assert.equal(b.doorHeight,2.2);assert(b.floorHeight>=2.8&&b.floorHeight<=3.1);assert(b.width>=8);for(const dx of[-b.width/2,0,b.width/2])for(const dz of[-b.depth/2,0,b.depth/2]){assert(!royalRiver(b.x+dx,b.z+dz).water);assert(!royalUrbanRoadAt(b.x+dx,b.z+dz,.8));}const center=layer.surface.ground(b.x,b.z);for(const dx of[-b.width/2,b.width/2])for(const dz of[-b.depth/2,b.depth/2])assert(Math.abs(layer.surface.ground(b.x+dx,b.z+dz)-center)<.4,`supported foundation: ${b.id}`);}
  for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++){const a=buildings[i],b=buildings[j];assert(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.z-b.z)>=(a.depth+b.depth)/2);}
 }finally{layer.dispose();}
});

test('the service entrance is a visible open portal with matched floors and headroom, preserving the palace',()=>{
 const layer=createRoyalWorldLayer(1);try{layer.group.updateMatrixWorld(true);const shell=layer.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!,portal=layer.group.getObjectByName('royal-service-gate-open-masonry-arch')!;assert(portal);const ray=new T.Raycaster(new T.Vector3(80,20,-69+O),new T.Vector3(-1,0,0),0,15);assert.equal(ray.intersectObject(shell,true).length,0);assert.equal(ray.intersectObject(portal,true).length,0);const nav=royalNavigation();assert(nav.line({x:80,z:-69,y:17.321666666666665},{x:65,z:-69}));
 }finally{layer.dispose();}
});


