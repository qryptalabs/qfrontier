import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {WorldBiome} from './world-geography.ts';
import {createWorldAssetLibrary,type WorldAssetLibrary} from './world-models.ts';

export type LivingActorRole='worker'|'guard'|'merchant'|'farmer'|'woodcutter'|'builder';
export interface LivingActor {
  /** Feet at origin; faces local +Z. The zone owns world position and heading. */
  group:THREE.Group;
  animate(time:number,walking:boolean|number,working?:boolean):void;
  /** Near residents retain articulated limbs; distant residents use one shared
   * baked mesh at the same authoritative transform, without a shadow pass. */
  setVisualDetail?(near:boolean):void;
  /** Detach this instance. Geometry/materials belong to the library. */
  dispose():void;
}
export interface LivingCart {
  group:THREE.Group;
  animate(time:number,speed:number):void;
  dispose():void;
}
export interface LivingActorLibrary {
  get(role:LivingActorRole,seed?:number):LivingActor;
  getForBiome(role:LivingActorRole,biome:WorldBiome,seed?:number):LivingActor;
  cart(seed?:number):LivingCart;
  transport(kind:'cart'|'sled'|'boat'|'camel',seed?:number):LivingCart;
  dispose():void;
}

type BoxPart={color:number;x:number;y:number;z:number;w:number;h:number;d:number;angle?:number};
const SKIN=[0xc99a73,0x94674d,0xd9b18a,0xb17c59];
const CLOTH=[0x5c7768,0x8f654c,0x657d94,0xa59056,0x8c6f89,0x89996a];
const WOOD=0x815b37,IRON=0x687879,BOOTS=0x4b3a2a;
const safe=(value:number)=>Number.isFinite(value)?value:0;

/** A viewer/chunk-scoped pool. Articulated nearby, one cached mesh at distance. */
export function createLivingActorLibrary():LivingActorLibrary {
  const cube=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,flatShading:true});
  const geometries=new Set<THREE.BufferGeometry>(),templates=new Map<string,THREE.Group>(),instances=new Set<THREE.Group>();
  const distantGeometries=new Map<string,THREE.BufferGeometry>(),neutralPoses=new Map<string,Map<string,THREE.Matrix4>>();
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),axis=new THREE.Vector3(0,0,1);
  let disposed=false,worldAssets:WorldAssetLibrary|null=null;
  function mesh(parts:BoxPart[],name:string) {
    const shapes=parts.map(part=>{matrix.compose(position.set(part.x,part.y,part.z),rotation.setFromAxisAngle(axis,part.angle??0),scale.set(part.w,part.h,part.d));const geometry=cube.clone().applyMatrix4(matrix),color=new THREE.Color(part.color),colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;});
    const geometry=mergeGeometries(shapes,false)!;shapes.forEach(shape=>shape.dispose());geometry.computeBoundingSphere();geometries.add(geometry);
    const object=new THREE.Mesh(geometry,material);object.name=name;object.castShadow=true;object.receiveShadow=true;object.userData.worldAnimated=true;return object;
  }
  const part=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,angle=0):BoxPart=>({color,x,y,z,w,h,d,angle});
  function pivot(name:string,x:number,y:number,z:number) {const group=new THREE.Group();group.name=name;group.position.set(x,y,z);group.userData.worldAnimated=true;return group;}
  function actorTemplate(role:LivingActorRole,variant:number,biome?:WorldBiome) {
    const group=new THREE.Group();group.name=`living-${role}`;group.userData.worldAnimated=true;
    const icy=biome==='ice',dry=biome==='desert',wet=biome==='tropical'||biome==='coast'||biome==='ocean';
    const skin=SKIN[variant%SKIN.length],shirt=icy?[0x829eae,0x748b9b,0x9a8b79][variant%3]:dry?[0xd1bb86,0xbca473,0x9f997d][variant%3]:wet?[0x6a918a,0xb1875d,0x788b69][variant%3]:role==='guard'?0x54717e:role==='builder'?0xa78251:CLOTH[variant%CLOTH.length],trousers=icy?0x646d72:dry?0x978367:role==='guard'?0x46545a:0x5b5544;
    const torso=pivot('actor-torso',0,0,0);
    torso.add(mesh([part(shirt,0,1.09,0,.56,.62,.32),part(role==='guard'?IRON:0xa28c61,0,.8,.01,.6,.1,.35),part(0xb49d6e,.08,.8,.2,.1,.1,.06),part(0x483f33,0,1.4,0,.25,.13,.26),...(role==='guard'?[part(0x889897,0,1.13,.18,.38,.42,.06),part(IRON,-.35,1.39,0,.2,.13,.43),part(IRON,.35,1.39,0,.2,.13,.43)]:[])],'actor-tunic'));
    const head=pivot('actor-head',0,1.65,0),face=[part(skin,0,0,0,.46,.43,.4),part(0x574331,0,.2,-.06,.47,.13,.35),part(skin,-.25,-.02,0,.07,.13,.12),part(skin,.25,-.02,0,.07,.13,.12),part(0x26342f,-.115,.015,.207,.06,.06,.025),part(0x26342f,.115,.015,.207,.06,.06,.025),part(0xb57f5c,0,-.12,.22,.12,.045,.035)];
    if(icy){face.push(part(shirt,0,.23,0,.55,.2,.49),part(0xe0d5b7,0,-.24,.02,.57,.15,.48),part(shirt,-.27,0,-.04,.1,.43,.43),part(shirt,.27,0,-.04,.1,.43,.43));torso.add(mesh([part(shirt,0,1.03,-.22,.66,.72,.15),part(0xd5c9a8,0,1.38,0,.67,.13,.44)],'actor-winter-cloak'));}
    else if(dry)face.push(part(0xddcba3,0,.24,0,.57,.2,.48),part(0xcbbb96,0,.16,-.22,.49,.25,.16),part(0xcbbb96,0,-.16,.22,.46,.13,.06));
    else if(role==='farmer'||role==='merchant')face.push(part(0xc4a361,0,.23,0,.73,.08,.65),part(0xa1844e,0,.33,0,.43,.19,.4),part(0x72532f,0,.29,0,.46,.05,.43));
    else if(role==='guard')face.push(part(IRON,0,.23,0,.52,.2,.47),part(0xa4b2aa,0,.34,0,.34,.08,.35),part(IRON,-.245,0,-.08,.06,.32,.22),part(IRON,.245,0,-.08,.06,.32,.22));
    else face.push(part(shirt,0,.23,-.02,.51,.14,.46),part(shirt,0,.17,.22,.52,.05,.2));
    head.add(mesh(face,'actor-face'));torso.add(head);
    for(const [side,sign]of[['left',-1],['right',1]]as const) {
      const hip=pivot(`actor-${side}-hip`,sign*.16,.78,0),knee=pivot(`actor-${side}-knee`,0,-.34,0);
      hip.add(mesh([part(trousers,0,-.17,0,.24,.35,.27)],`actor-${side}-thigh`));
      knee.add(mesh([part(trousers,0,-.16,0,.22,.32,.25),part(BOOTS,0,-.35,.055,.25,.17,.37)],`actor-${side}-shin`));hip.add(knee);group.add(hip);
      const shoulder=pivot(`actor-${side}-shoulder`,sign*.37,1.36,0),elbow=pivot(`actor-${side}-elbow`,0,-.34,0);
      shoulder.add(mesh([part(shirt,0,-.15,0,.22,.34,.28)],`actor-${side}-upper-arm`));
      const handParts=[part(skin,0,-.14,0,.18,.28,.23),part(skin,0,-.32,.02,.2,.16,.24)];
      if(side==='right') {
        if(role==='farmer')handParts.push(part(WOOD,0,-.66,.08,.07,1.12,.07),part(WOOD,0,-1.18,.08,.62,.1,.1),...[-.24,-.08,.08,.24].map(x=>part(0x6a7470,x,-1.24,.08,.055,.18,.06)));
        if(role==='builder'||role==='woodcutter')handParts.push(part(WOOD,0,-.3,.37,.08,.08,.75),part(IRON,0,-.3,.72,role==='woodcutter'?.35:.42,.18,.18),...(role==='woodcutter'?[part(0xaab4aa,-.22,-.3,.72,.16,.3,.13)]:[]));
        if(role==='guard')handParts.push(part(WOOD,.03,.18,.08,.055,1.85,.055),part(0xa6b7b1,.03,1.16,.08,.14,.23,.11));
      }
      if(side==='left'&&role==='guard')handParts.push(part(WOOD,-.1,-.19,.13,.09,.61,.49),part(0x637d84,-.16,-.19,.13,.06,.58,.46),part(IRON,-.2,-.19,.13,.07,.12,.14));
      elbow.add(mesh(handParts,`actor-${side}-forearm`));shoulder.add(elbow);torso.add(shoulder);
    }
    if(role==='merchant'||role==='worker') {
      const load=pivot('actor-load',0,1.02,.48),parts:BoxPart[]=[];
      if(role==='merchant'){parts.push(part(0xa67d47,0,0,0,.64,.42,.48));for(const x of[-.24,.24])parts.push(part(0xd0ac69,x,0,.25,.055,.44,.035));parts.push(part(0x5a4833,0,-.03,.26,.66,.055,.035));}
      else for(const x of[-.17,.17]){parts.push(part(WOOD,x,-.02,0,.27,.24,.8),part(0xc6a371,x,-.02,.41,.2,.18,.025));}
      load.add(mesh(parts,'actor-cargo'));torso.add(load);
    }
    group.add(torso);return group;
  }
  function neutralPose(key:string,template:THREE.Group,role:LivingActorRole){
    let result=neutralPoses.get(key);if(result)return result;
    const normal=template.clone(true),at=(name:string)=>normal.getObjectByName(name)!;
    if(role==='merchant'||role==='worker')for(const side of['left','right']){at(`actor-${side}-shoulder`).rotation.x=-.82;at(`actor-${side}-elbow`).rotation.x=-.55;}
    else if(role==='guard')for(const side of['left','right']){at(`actor-${side}-shoulder`).rotation.x=-.12;at(`actor-${side}-elbow`).rotation.x=side==='right'?-.22:-.2;}
    normal.updateMatrixWorld(true);result=new Map();normal.traverse(object=>{if(object instanceof THREE.Group&&object.name!=='actor-load')result!.set(object.name,object.matrixWorld.clone());});neutralPoses.set(key,result);return result;
  }
  /** Only equipment visibility/local placement affects the baked silhouette.
   * Walking time, instance identity and global transforms never enter its key. */
  function equipmentSignature(group:THREE.Group){
    const describe=(object:THREE.Object3D|undefined):string=>{if(!object)return'-';const p=object.position,r=object.rotation,s=object.scale;return`${object.name}:${object.visible?1:0}:${object instanceof THREE.Mesh?object.geometry.uuid:''}:${p.x},${p.y},${p.z}:${r.x},${r.y},${r.z}:${s.x},${s.y},${s.z}[${object.children.map(describe).join(';')}]`;};
    return`${describe(group.getObjectByName('actor-load'))}|${describe(group.getObjectByName('fisher-pole'))}`;
  }
  function distantGeometry(key:string,template:THREE.Group,role:LivingActorRole,group:THREE.Group,roots:ReadonlyMap<THREE.Object3D,boolean>){
    const poses=neutralPose(key,template,role),pieces:{source:THREE.Mesh;transform:THREE.Matrix4}[]=[],tokens:string[]=[key];
    const visit=(object:THREE.Object3D,visible:boolean)=>{
      if(!visible)return;
      if(object instanceof THREE.Mesh){
        // Resolve the closest skeletal pivot in the neutral template, then keep
        // actual local equipment geometry/offsets attached below that pivot.
        let anchor:THREE.Object3D|null=object;while(anchor&&!poses.has(anchor.name))anchor=anchor.parent;
        if(anchor){const transform=poses.get(anchor.name)!.clone(),chain:THREE.Object3D[]=[];let node:THREE.Object3D|null=object;while(node&&node!==anchor){chain.unshift(node);node=node.parent;}for(const child of chain){child.updateMatrix();transform.multiply(child.matrix);}pieces.push({source:object,transform});const sourceMaterial=Array.isArray(object.material)?object.material[0]:object.material,tint=sourceMaterial as THREE.MeshStandardMaterial;tokens.push(`${object.geometry.uuid}:${tint.color?.getHex()??0xffffff}:${transform.elements.join(',')}`);}
      }
      for(const child of object.children)visit(child,child.visible);
    };
    for(const[root,visible]of roots)visit(root,visible);
    const signature=tokens.join('|'),cached=distantGeometries.get(signature);if(cached)return cached;
    const parts:THREE.BufferGeometry[]=[];
    for(const{source,transform}of pieces){
      const geometry=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone();geometry.applyMatrix4(transform);for(const name of Object.keys(geometry.attributes))if(!['position','normal','color'].includes(name))geometry.deleteAttribute(name);if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
      const sourceMaterial=(Array.isArray(source.material)?source.material[0]:source.material)as THREE.MeshStandardMaterial,tint=sourceMaterial.color??new THREE.Color(0xffffff),attribute=geometry.getAttribute('color'),count=geometry.getAttribute('position').count,colors=new Float32Array(count*3);
      for(let i=0;i<count;i++){colors[i*3]=(attribute&&sourceMaterial.vertexColors?attribute.getX(i):1)*tint.r;colors[i*3+1]=(attribute&&sourceMaterial.vertexColors?attribute.getY(i):1)*tint.g;colors[i*3+2]=(attribute&&sourceMaterial.vertexColors?attribute.getZ(i):1)*tint.b;}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);
    }
    const geometry=parts.length?mergeGeometries(parts,false)!:new THREE.BufferGeometry();parts.forEach(part=>part.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.add(geometry);distantGeometries.set(signature,geometry);return geometry;
  }
  function instance(role:LivingActorRole,seed=0,biome?:WorldBiome):LivingActor {
    if(disposed)throw new Error('Living actor library disposed');
    const stableSeed=Math.abs(Math.trunc(safe(seed))),variant=stableSeed%12,key=`${role}-${variant}-${biome??'base'}`;
    let template=templates.get(key);if(!template){template=actorTemplate(role,variant,biome);templates.set(key,template);}
    const group=template.clone(true),object=(name:string)=>group.getObjectByName(name)!;
    const torso=object('actor-torso'),head=object('actor-head'),leftHip=object('actor-left-hip'),rightHip=object('actor-right-hip'),leftKnee=object('actor-left-knee'),rightKnee=object('actor-right-knee'),leftArm=object('actor-left-shoulder'),rightArm=object('actor-right-shoulder'),leftElbow=object('actor-left-elbow'),rightElbow=object('actor-right-elbow');
    const phase=(stableSeed%37)*.371,roots=new Map<THREE.Object3D,boolean>();let detached=false,detailed=true,distant:THREE.Mesh|null=null,appearance='';instances.add(group);
    function refreshDistant(){
      for(const child of group.children)if(child!==distant&&!roots.has(child))roots.set(child,child.visible);
      const next=equipmentSignature(group);if(distant&&appearance===next)return;
      const geometry=distantGeometry(key,template!,role,group,roots);if(!distant){distant=new THREE.Mesh(geometry,material);distant.name='actor-distant-body';distant.userData.worldAnimated=true;distant.castShadow=false;distant.receiveShadow=true;group.add(distant);}else distant.geometry=geometry;
      appearance=next;
    }
    const actor:LivingActor={group,animate(time,walking,working=false){
      if(detached||disposed)return;
      if(!detailed){refreshDistant();return;}
      const seconds=safe(time)%86400,speed=typeof walking==='boolean'?(walking?1:0):Math.min(2,Math.max(0,safe(walking))),moving=speed>.001,wave=Math.sin(seconds*6.4+phase),stride=wave*.58*Math.min(speed,1.25),work=Math.sin(seconds*4.4+phase),idle=Math.sin(seconds*1.8+phase);
      torso.position.y=moving?Math.abs(Math.cos(seconds*6.4+phase))*.035:idle*.008;
      torso.rotation.set(0,0,0);head.rotation.set(0,moving?0:idle*.07,0);
      leftHip.rotation.x=stride;rightHip.rotation.x=-stride;leftKnee.rotation.x=Math.max(0,-wave)*.52*Math.min(speed,1.25);rightKnee.rotation.x=Math.max(0,wave)*.52*Math.min(speed,1.25);
      leftArm.rotation.set(-stride*.75,0,.035);rightArm.rotation.set(stride*.75,0,-.035);leftElbow.rotation.x=-.12;rightElbow.rotation.x=-.12;
      if(role==='worker'||role==='merchant'){leftArm.rotation.x=-.82;rightArm.rotation.x=-.82;leftElbow.rotation.x=-.55;rightElbow.rotation.x=-.55;}
      if(role==='guard'){rightArm.rotation.x=-.12;rightElbow.rotation.x=-.22;leftArm.rotation.x=-.12;leftElbow.rotation.x=-.2;}
      if(working&&!moving){
        if(role==='farmer'){torso.rotation.x=.12+work*.055;rightArm.rotation.x=-.48+work*.22;leftArm.rotation.x=-.4+work*.18;rightElbow.rotation.x=.28+work*.1;head.rotation.x=.18;}
        else if(role==='builder'||role==='woodcutter'){torso.rotation.x=.1+work*.035;rightArm.rotation.x=-1.2+work*.65;rightElbow.rotation.x=-.45-Math.max(0,-work)*.45;leftArm.rotation.x=-.52;head.rotation.x=.12;}
        else if(role==='merchant'){head.rotation.y=idle*.22;leftArm.rotation.z=.1+work*.045;}
        else if(role==='worker'){torso.rotation.x=.08+work*.025;leftArm.rotation.x=-.9+work*.15;rightArm.rotation.x=-.9+work*.15;}
        else head.rotation.y=Math.sin(seconds*.65+phase)*.35;
      }
    },setVisualDetail(near){
      if(detached||disposed)return;
      if(near){if(detailed)return;detailed=true;if(distant)distant.visible=false;for(const[root,visible]of roots)root.visible=visible;roots.clear();}
      else{if(detailed){roots.clear();for(const child of group.children)if(child!==distant)roots.set(child,child.visible);}refreshDistant();detailed=false;for(const root of roots.keys())root.visible=false;distant!.visible=true;}
    },dispose(){if(detached)return;detached=true;roots.clear();group.removeFromParent();instances.delete(group);}};
    actor.animate(0,false,false);return actor;
  }
  function cart(seed=0):LivingCart {
    if(disposed)throw new Error('Living actor library disposed');
    const variant=Math.abs(Math.trunc(safe(seed)))%2,key=`cart-${variant}`;let template=templates.get(key);
    if(!template){
      template=new THREE.Group();template.name='living-cart';template.userData.worldAnimated=true;
      const parts=[part(WOOD,0,.66,0,1.55,.16,2.25),part(0x513f2b,-.52,.46,0,.11,.16,3.3),part(0x513f2b,.52,.46,0,.11,.16,3.3),part(WOOD,-.78,.95,0,.11,.58,2.3),part(WOOD,.78,.95,0,.11,.58,2.3),part(WOOD,0,.95,-1.12,1.65,.58,.12),part(0xad8751,-.48,.7,1.75,.1,.1,1.7),part(0xad8751,.48,.7,1.75,.1,.1,1.7)];
      for(const x of[-.78,.78])for(const z of[-.85,.85])parts.push(part(0xb08b52,x,1.01,z,.13,.8,.13));
      for(let i=0;i<4;i++)parts.push(part(variant?0xc9bb8b:0x957548,-.38+(i%2)*.75,.99,Math.floor(i/2)*.85-.45,.62,.54,.67));
      template.add(mesh(parts,'cart-body'));
      for(const x of[-.95,.95])for(const z of[-.78,.78]){
        const wheel=pivot(`cart-wheel-${x}-${z}`,x,.43,z),wheelParts=[part(0x9b7846,0,0,0,.18,.82,.13),part(0x9b7846,0,0,0,.18,.13,.82),part(0x4b4235,0,0,0,.25,.2,.2)];
        for(let segment=0;segment<12;segment++){const angle=segment*Math.PI/6;wheelParts.push(part(0x574c39,0,Math.cos(angle)*.38,Math.sin(angle)*.38,.18,.16,.16));}
        wheel.add(mesh(wheelParts,'cart-wheel-mesh'));template.add(wheel);
      }
      templates.set(key,template);
    }
    const group=template.clone(true),wheels=group.children.filter(child=>child.name.startsWith('cart-wheel-'));instances.add(group);let detached=false;
    return{group,animate(time,speed){const angle=(safe(time)%86400)*Math.min(8,Math.max(-8,safe(speed)))/.43;wheels.forEach(wheel=>wheel.rotation.x=angle);},dispose(){if(detached)return;detached=true;group.removeFromParent();instances.delete(group);}};
  }
  function transport(kind:'cart'|'sled'|'boat'|'camel',seed=0):LivingCart {
    if(kind==='cart')return cart(seed);if(disposed)throw new Error('Living actor library disposed');
    const key=`transport-${kind}`;let template=templates.get(key);
    if(!template){template=new THREE.Group();template.name=`living-${kind}`;template.userData.worldAnimated=true;
      if(kind==='sled'){
        const parts=[part(WOOD,0,.51,0,1.55,.14,2.4),part(0xabc1c5,-.72,.14,0,.1,.13,3.2),part(0xabc1c5,.72,.14,0,.1,.13,3.2),part(WOOD,0,.65,-1.1,1.6,.45,.11),part(WOOD,-.76,.65,0,.1,.45,2.3),part(WOOD,.76,.65,0,.1,.45,2.3)];for(const x of[-.72,.72]){parts.push(part(WOOD,x,.38,-.8,.1,.55,.12),part(WOOD,x,.38,.8,.1,.55,.12),part(0xabc1c5,x,.26,1.55,.1,.16,.45,.4));}for(const x of[-.37,.37])parts.push(part(0xb3a27b,x,.85,-.25,.63,.55,1.2));template.add(mesh(parts,'sled-body'));
      }else{worldAssets??=createWorldAssetLibrary();const model=worldAssets.get(kind);if(kind==='camel'){model.rotation.y=-Math.PI/2;const cargo=mesh([part(0x8b6647,0,1.93,0,.85,.2,1.15),part(0xb49c6a,-.6,1.55,0,.55,.67,.85),part(0xc1a16a,.6,1.55,0,.55,.67,.85)],'camel-cargo');template.add(cargo);}else{model.scale.setScalar(.58);model.position.y=.12;template.add(mesh([part(0x9e7849,.25,.9,-.65,.55,.4,.5),part(0xc3b58c,-.25,.9,.55,.52,.4,.6)],'boat-cargo'));}template.add(model);}
      templates.set(key,template);
    }
    const group=template.clone(true),rest=group.children.map(child=>child.position.y),phase=Math.abs(Math.trunc(safe(seed)))%17*.37;instances.add(group);let detached=false;
    return{group,animate(time,speed){const at=safe(time)%86400,moving=Math.min(2,Math.abs(safe(speed))),bob=kind==='boat'?Math.sin(at*1.7+phase)*.045:kind==='camel'?Math.abs(Math.sin(at*3+phase))*.045*moving:0;group.rotation.z=(kind==='boat'?.035:kind==='camel'?.018:.006)*Math.sin(at*(kind==='camel'?4:1.3)+phase)*moving;group.children.forEach((child,index)=>child.position.y=rest[index]+bob);},dispose(){if(detached)return;detached=true;group.removeFromParent();instances.delete(group);}};
  }
  return{get:instance,getForBiome(role,biome,seed=0){return instance(role,seed,biome);},cart,transport,dispose(){if(disposed)return;disposed=true;instances.forEach(group=>group.removeFromParent());instances.clear();templates.clear();distantGeometries.clear();neutralPoses.clear();geometries.forEach(geometry=>geometry.dispose());geometries.clear();cube.dispose();material.dispose();worldAssets?.dispose();}};
}

/** Convenience for a standalone resident. For crowds use a shared library. */
export function createLivingActor(role:LivingActorRole,seed=0):LivingActor {
  const library=createLivingActorLibrary(),actor=library.get(role,seed),detach=actor.dispose;
  actor.dispose=()=>{detach();library.dispose();};return actor;
}

/** Convenience for one cart; zones can pool carts and residents together. */
export function createLivingCart(seed=0):LivingCart {
  const library=createLivingActorLibrary(),cart=library.cart(seed),detach=cart.dispose;
  cart.dispose=()=>{detach();library.dispose();};return cart;
}
