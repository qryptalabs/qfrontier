import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilding} from './models.ts';
import {SETTLEMENT_ANCHORS} from './settlement-layout.ts';
import {habitableGroundHeight} from '../mvp/habitable-data.ts';
import type {BuildingType,Faction} from '../mvp/types.ts';
import type {StationUpgradeVisual} from '../mvp/station-upgrades.ts';
import {createHabitableWorkerModelLibrary,type HabitableWorkerModel} from './habitable-worker-models.ts';

export function habitableConstructionAt(startsAt:number,endsAt:number,now:number){
  const progress=Math.max(0,Math.min(1,(now-startsAt)/Math.max(1,endsAt-startsAt)));
  return{progress,phase:now<startsAt?'planned' as const:now>=endsAt?'complete' as const:progress<.2?'foundation' as const:progress<.72?'frame' as const:'finishing' as const};
}

/** Bounded pooled scaffolds. Nothing extends beyond the building's existing collision footprint. */
export function createHabitableConstructionLibrary(){
  const cube=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96}),geometries=new Set<THREE.BufferGeometry>([cube]),templates=new Map<string,THREE.Group>();let disposed=false;
  type Part={x:number;y:number;z:number;w:number;h:number;d:number;color:number};
  function mesh(parts:Part[]){const pieces:THREE.BufferGeometry[]=[],dummy=new THREE.Object3D();for(const p of parts){dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();const geometry=cube.clone().applyMatrix4(dummy.matrix),color=new THREE.Color(p.color),colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(geometry);}const geometry=mergeGeometries(pieces,false)!;pieces.forEach(p=>p.dispose());geometries.add(geometry);const result=new THREE.Mesh(geometry,material);result.castShadow=result.receiveShadow=true;return result;}
  function get(width:number,depth:number,height:number){if(disposed)throw new Error('Construction library disposed');const key=[width,depth,height].map(n=>n.toFixed(3)).join(':'),cached=templates.get(key);if(cached)return cached.clone(true);const group=new THREE.Group(),scaffold:Part[]=[],frame:Part[]=[],stock:Part[]=[],w=Math.max(.35,width-.14),d=Math.max(.35,depth-.14),h=Math.max(.4,height*.85),a=w/2-.045,b=d/2-.045;
    for(const x of[-a,a])for(const z of[-b,b]){scaffold.push({x,y:h/2,z,w:.07,h,d:.07,color:0xa2865d});frame.push({x:x*.86,y:h*.38,z:z*.84,w:.1,h:h*.76,d:.1,color:0x725437});}
    for(const y of[.22,h*.5,h*.86])for(const z of[-b,b])scaffold.push({x:0,y,z,w,h:.07,d:.09,color:y===.22?0x8f7451:0xc0a172});
    for(const x of[-a,a]){scaffold.push({x,y:h*.5,z:0,w:.18,h:.06,d,color:0xb89865});frame.push({x:x*.86,y:h*.78,z:0,w:.1,h:.1,d:d*.84,color:0x8b6540});}
    for(let i=0;i<4;i++)stock.push({x:-w*.25,y:.07+i*.07,z:-d*.25,w:w*.34,h:.055,d:.16,color:i%2?0xc7a46c:0xa68151});
    const platforms=mesh(scaffold);platforms.name='habitable-construction-scaffold';const structure=mesh(frame);structure.name='habitable-construction-frame';const materials=mesh(stock);materials.name='habitable-construction-materials';const site=mesh([-1,1].flatMap(x=>[-1,1].map(z=>({x:x*a,y:.14,z:z*b,w:.045,h:.28,d:.045,color:0xb6a070}))));site.name='habitable-construction-site';site.visible=false;group.add(platforms,structure,materials,site);group.name='habitable-construction';templates.set(key,group);return group.clone(true);
  }
  return{get,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());material.dispose();templates.clear();}};
}

const SIZES:Record<BuildingType,number>={workshop:1.62,garden:1.42,kitchen:1.25,laboratory:1.25,barracks:1.25,warehouse:1.72,logistics:1.14};

/** An upgrade retains its operational original model. Only confirmed, active jobs add scaffolding. */
export function createHabitableUpgradeLayer(options:{faction:Faction;groundHeight?:(x:number,y:number)=>number}){
  const group=new THREE.Group();group.name='confirmed-building-upgrades';const library=createHabitableConstructionLibrary(),actors=createHabitableWorkerModelLibrary(),models=new Map<string,{model:THREE.Group;actor:HabitableWorkerModel}>();let disposed=false;
  function update(upgrades:readonly StationUpgradeVisual[],now:number,reducedMotion=false){
    if(disposed)return;const visible=new Set<string>();for(const upgrade of upgrades){
      const kind=upgrade.building;if(!Object.hasOwn(SIZES,kind))continue;const phase=habitableConstructionAt(upgrade.startsAt,upgrade.endsAt,now);if(phase.phase==='planned'||phase.phase==='complete')continue;visible.add(upgrade.id);
      let instance=models.get(upgrade.id);if(!instance){const bounds=new THREE.Box3();for(const level of[1,2,3])bounds.union(new THREE.Box3().setFromObject(createBuilding(kind,level,options.faction)));const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=SIZES[kind],anchor=SETTLEMENT_ANCHORS[kind],shift=kind==='garden'?{x:-2.6,y:.7}:{x:0,y:0},model=library.get(size.x*scale,size.z*scale,size.y*scale);model.position.set(anchor[0]+shift.x+center.x*scale,(options.groundHeight??habitableGroundHeight)(anchor[0]+shift.x,anchor[2]+shift.y),anchor[2]+shift.y+center.z*scale);model.name=`building-upgrade-${upgrade.id}`;model.userData.upgradeBuilding=kind;let seed=0;for(const char of upgrade.id)seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;const actor=actors.get('builder',seed%12);actor.group.name=`upgrade-constructor-${upgrade.id}`;instance={model,actor};models.set(upgrade.id,instance);group.add(model,actor.group);}
      const {model,actor}=instance;model.userData.constructionPhase=phase.phase;model.userData.constructionProgress=phase.progress;model.getObjectByName('habitable-construction-frame')!.visible=false;model.getObjectByName('habitable-construction-materials')!.visible=phase.phase!=='finishing';actor.group.position.set(upgrade.stand.x,(options.groundHeight??habitableGroundHeight)(upgrade.stand.x,upgrade.stand.y)+.035,upgrade.stand.y);actor.group.rotation.y=upgrade.yaw;actor.animate({action:'crafting',walking:false,carrying:false},now/1000,reducedMotion);
    }
    for(const[id,instance]of models)if(!visible.has(id)){instance.actor.dispose();instance.model.removeFromParent();models.delete(id);}
  }
  return{group,update,dispose(){if(disposed)return;disposed=true;models.forEach(instance=>instance.actor.dispose());models.clear();library.dispose();actors.dispose();group.clear();group.removeFromParent();}};
}
