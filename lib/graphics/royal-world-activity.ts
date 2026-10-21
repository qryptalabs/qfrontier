import * as THREE from 'three';
import {createFishingModelLibrary} from './fishing-community-models.ts';
import {createTripoShip} from './tripo-ship.ts';
import {ROYAL_FISH_DOCK as D,royalWorkingFleetPose,royalFishingCrewLocalPose} from './royal-maritime-layout.ts';
import {sampleRoyalHarborRoute} from './royal-harbor-activity.ts';
import type {RoyalHarborSnapshot} from '../mvp/royal-harbor.ts';

/** Compatibility for old audio callers; activities now use real metre coordinates. */
export function royalActivityPoint(x:number,z:number){return{x,z};}
export function createRoyalWorldActivity(ground:(x:number,z:number)=>number){
 const group=new THREE.Group();group.name='royal-world-fishery';const lib=createFishingModelLibrary('coast');
 const fallback=lib.boat('royal-fishery-fallback');fallback.group.scale.setScalar(1.25);fallback.group.position.y=-.85;
 const boat=createTripoShip('fishing',fallback.group),crew=[lib.worker('fisher',31),lib.worker('porter',34)];boat.group.name='royal-working-fishing-boat';group.add(boat.group);
 crew.forEach((a,i)=>{a.group.name='royal-fishing-sailor-'+i;a.group.scale.setScalar(.9);a.group.position.set(i?.7:-.7,D.deck,i?-1.4:1.5);boat.group.add(a.group);});
 const cart=lib.haulage('horse',28);cart.group.scale.setScalar(.9);cart.group.name='royal-fish-cart-with-horse-and-driver';group.add(cart.group);
 const porters=[crew[1],lib.worker('porter',43)];porters[1].group.scale.setScalar(.9);group.add(porters[1].group);
 const crateArrays=[228,145].map((z,i)=>{const g=new THREE.Group();g.name=i?'royal-market-confirmed-fish':'royal-warehouse-confirmed-fish';g.position.set(38,ground(38,z)+.12,z);group.add(g);return Array.from({length:8},(_,j)=>{const c=lib.get('crate',j);c.position.set((j%2)*1.1,Math.floor(j/4)*.8,Math.floor(j%4/2)*1.1);g.add(c);return c;});});
 const foamGeometry=new THREE.PlaneGeometry(1,1);foamGeometry.rotateX(-Math.PI/2);const foamMaterial=new THREE.MeshBasicMaterial({color:0xe7fff4,transparent:true,opacity:.4,depthWrite:false}),wake=new THREE.InstancedMesh(foamGeometry,foamMaterial,18),dummy=new THREE.Object3D();wake.count=0;wake.frustumCulled=false;group.add(wake);
 const cargo=lib.get('crate',2);cargo.position.set(.7,D.deck,-2.4);boat.group.add(cargo);
 let bodies:{id:string;x:number;z:number;radius:number}[]=[],focus={x:0,y:1000,z:0},disposed=false;
 return{group,setFocus(x:number,y:number,z:number){focus={x,y,z};boat.setNear(Math.hypot(x-boat.group.position.x,z-boat.group.position.z)<480);},
 update(seconds:number,snapshot:RoyalHarborSnapshot|null){if(disposed)return;bodies=[];const state=royalWorkingFleetPose(snapshot,seconds),t=(state.now??0)/1000;
  boat.group.position.set(state.boat.x,-.025+Math.sin(t*.8)*.018,state.boat.z);boat.group.rotation.y=state.boat.yaw+Math.PI;boat.update(t);fallback.group.visible=!boat.ready;cargo.visible=(snapshot?.stock.ship??0)>0;
  crew.forEach((a,i)=>{const p=royalFishingCrewLocalPose(i,state.phase,state.elapsed);a.group.position.set(p.x,p.y,p.z);a.group.visible=boat.ready;a.group.rotation.y=Math.PI/2;a.animate(t,i===1&&(state.phase==='docking'||state.phase==='market')?1:0,state.phase==='fishing');a.setVisualDetail?.(Math.hypot(focus.x-state.boat.x,focus.z-state.boat.z)<80);});
  const elapsed=state.elapsed;
  porters.forEach((a,i)=>{
   const z=D.z+(i?1:-1),pick={x:D.x+1.1,z},stage={x:23,z},store={x:36,z};let p={...(i?stage:pick),yaw:Math.PI/2,moving:false},carrying=false;
   if(i&&state.phase==='docking')p=sampleRoyalHarborRoute([stage,pick],(elapsed-60)/6);
   if(state.phase==='unloading'){p=sampleRoyalHarborRoute([pick,stage],(elapsed-66)/6);carrying=!!snapshot?.stock.ship;}
   else if(state.phase==='warehousing'){p=sampleRoyalHarborRoute([stage,store],(elapsed-72)/16);carrying=!!snapshot?.stock.warehouse;}
   else if(state.phase==='transporting')p=sampleRoyalHarborRoute([store,stage,pick],(elapsed-88)/24);
   else if(i&&state.phase==='market')p=sampleRoyalHarborRoute([pick,stage],(elapsed-112)/8);
   const visible=['unloading','warehousing','transporting'].includes(state.phase),onQuay=i===1||visible;
   if(onQuay){if(a.group.parent!==group)group.add(a.group);a.group.visible=true;a.group.position.set(p.x,p.x<13?D.deck:p.x<23?D.deck+(1.2-D.deck)*(p.x-12.1)/10.9:Math.max(.92,ground(p.x,p.z)+.12),p.z);a.group.rotation.y=p.yaw;}
   else{if(a.group.parent!==boat.group)boat.group.add(a.group);const p=royalFishingCrewLocalPose(1,state.phase,elapsed);a.group.position.set(p.x,p.y,p.z);a.group.visible=boat.ready;}
   const load=a.group.getObjectByName('actor-load');if(load)load.visible=carrying;a.animate(t,!onQuay&&(state.phase==='docking'||state.phase==='market')||p.moving?1:0);if(onQuay)bodies.push({id:'fish-porter-'+i,x:a.group.position.x,z:a.group.position.z,radius:.35});
  });
  cart.group.position.set(state.cart.x,ground(state.cart.x,state.cart.z)+.12,state.cart.z);cart.group.rotation.y=state.cart.yaw;cart.animate({time:t,speed:state.cart.moving?3.5:0,cargo:Math.ceil((snapshot?.stock.cart??0)/2)});
  bodies.push({id:'fish-cart',x:state.cart.x,z:state.cart.z,radius:1.05},{id:'fish-horse',x:state.cart.x+Math.sin(state.cart.yaw)*2.55,z:state.cart.z+Math.cos(state.cart.yaw)*2.55,radius:.6});
  [snapshot?.stock.warehouse??0,snapshot?.stock.market??0].forEach((qty,i)=>crateArrays[i].forEach((c,j)=>{c.visible=j<Math.ceil(qty/2);}));
  wake.count=state.boat.moving?18:0;for(let i=0;i<wake.count;i++){const distance=i*.6+2,side=i%2?1:-1;dummy.position.set(state.boat.x-Math.sin(state.boat.yaw)*distance+Math.cos(state.boat.yaw)*side*.8,-.96,state.boat.z-Math.cos(state.boat.yaw)*distance-Math.sin(state.boat.yaw)*side*.8);dummy.rotation.y=-state.boat.yaw;dummy.scale.set(.2+i*.03,1,.32);dummy.updateMatrix();wake.setMatrixAt(i,dummy.matrix);}wake.instanceMatrix.needsUpdate=true;
 },colliders:()=>bodies,dispose(){if(disposed)return;disposed=true;boat.dispose();fallback.dispose();cart.dispose();crew.forEach(a=>a.dispose());porters[1].dispose();lib.dispose();wake.dispose();foamGeometry.dispose();foamMaterial.dispose();group.removeFromParent();group.clear();}};
}
