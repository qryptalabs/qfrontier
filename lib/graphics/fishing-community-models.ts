import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLivingActorLibrary,type LivingActor} from './living-actors.ts';
import {createBiomeSettlementLibrary,type BiomeStructureKind,type BiomeSettlementLibrary} from './biome-settlement-models.ts';
import type {WorldBiome} from './world-geography.ts';

export type FishingStructureKind=BiomeStructureKind|'fishstall'|'rack'|'crate'|'landing'|'net'|'barrel'|'lamp';
export interface FishingBoatPose {time:number;speed:number;state:string;cargo:boolean|number;wind?:number}
export interface FishingHaulagePose {time:number;speed:number;cargo:boolean|number}
export interface FishingBoat {group:THREE.Group;animate(pose:FishingBoatPose):void;animate(time:number,speed:number,phase:string,cargo:boolean|number):void;dispose():void}
export interface FishingHaulage {group:THREE.Group;animate(pose:FishingHaulagePose):void;animate(time:number,speed:number,cargo:boolean|number):void;dispose():void}
export interface FishingModelLibrary {
  boat(seed?:number|string):FishingBoat;
  haulage(kindOrSeed?:'horse'|'ox'|number,seed?:number):FishingHaulage;
  get(kind:FishingStructureKind,seed?:number|string):THREE.Group;
  structure(kind:FishingStructureKind,seed?:number|string):THREE.Group;
  worker(role:'fisher'|'porter'|'dockworker'|'merchant'|'worker',seed?:number|string):LivingActor;
  dispose():void;
}
export const FISHING_MODEL_DIMENSIONS=Object.freeze({boat:Object.freeze({width:2.2,length:5,draft:.36,height:5.8,fishingWidth:5.8,turnRadius:3}),haulage:Object.freeze({width:2.3,length:7.5,minZ:-2.2,maxZ:5.3,turnRadius:4.2}),dock:Object.freeze({width:4,length:8.2,deckHeight:.75}),warehouse:Object.freeze({width:2.3,length:2.6}),home:Object.freeze({width:2.4,length:2.3})});
const WOOD=0x8e6842,LIGHT=0xc3a16b,DARK=0x4f4334,ROPE=0xb7b08a,IRON=0x687b7a,FISH=0x9fbac0,CLOTH=0xded4ad;
const CLIMATE_COLORS:Readonly<Record<WorldBiome,Readonly<Record<number,number>>>>={
  coast:{},ocean:{},
  ice:{[WOOD]:0x718b94,[LIGHT]:0xc0d2d6,[DARK]:0x405d6b,[ROPE]:0xc4ccb5,[IRON]:0x829ba6,[CLOTH]:0xe2ece7,0x997348:0x819ba3,0x9c7a4d:0x7a9195,0xcac199:0x9dbdc3,0x577f85:0x658fa5,0x6f9598:0x8fb4c3},
  desert:{[WOOD]:0xa07848,[LIGHT]:0xdbc28a,[DARK]:0x725437,[ROPE]:0xc9bc91,[IRON]:0x8a8c78,[CLOTH]:0xead9aa,0x997348:0xaf8b59,0x9c7a4d:0xb28c52,0xcac199:0xc9a56a,0x577f85:0x4c9392,0x6f9598:0x418580},
  tropical:{[WOOD]:0x765a35,[LIGHT]:0xb8a273,[DARK]:0x3d4c34,[ROPE]:0xb7b584,[IRON]:0x647d6d,[CLOTH]:0xc9d4a6,0x997348:0x846a3d,0x9c7a4d:0x8d7545,0xcac199:0x8faa71,0x577f85:0x6a9a6c,0x6f9598:0x578c65},
  forest:{[WOOD]:0x7d5f3d,[LIGHT]:0xb9a575,[DARK]:0x414c36,[ROPE]:0xb9ba91,[IRON]:0x667c76,[CLOTH]:0xd4d4b4,0x997348:0x896f47,0x9c7a4d:0x977950,0xcac199:0x95ab7b,0x577f85:0x597c62,0x6f9598:0x6f8a68},
  mountain:{[WOOD]:0x6f5c49,[LIGHT]:0xb0a78c,[DARK]:0x454f4b,[ROPE]:0xbab59b,[IRON]:0x7c8a88,[CLOTH]:0xcad5d0,0x997348:0x81735f,0x9c7a4d:0x8f8067,0xcac199:0x98a8a4,0x577f85:0x647c89,0x6f9598:0x748992},
  plains:{[WOOD]:0x9d7847,[LIGHT]:0xd2bb7c,[DARK]:0x61513a,[ROPE]:0xc5ba8b,[IRON]:0x768473,[CLOTH]:0xe2d8ac,0x997348:0xad8d52,0x9c7a4d:0xb4965f,0xcac199:0xbba96f,0x577f85:0x75977a,0x6f9598:0x8c9d70},
};
type Part={color:number;x:number;y:number;z:number;w:number;h:number;d:number;rx?:number;ry?:number;rz?:number};
const finite=(n:number)=>Number.isFinite(n)?n:0;
const seedNumber=(value:number|string=0)=>typeof value==='number'?Math.abs(Math.trunc(finite(value))):[...value].reduce((hash,ch)=>Math.imul(hash^ch.charCodeAt(0),16777619)>>>0,2166136261);
/** Numeric cargo is the snapshot's crate count (0–6); booleans mean full/empty. */
const cargoRatio=(value:boolean|number)=>typeof value==='boolean'?(value?1:0):Math.max(0,Math.min(1,finite(value)/6));
/** Small reusable finish maps; callers own and dispose their texture. No DOM or downloads. */
export function createHarbourSurfaceTexture(kind:'timber'|'linen'='timber'){
  const fabric=kind==='linen',size=64,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const index=(y*size+x)*4,noise=(Math.imul(x+7,374761393)^Math.imul(y+23,668265263))>>>0,grain=fabric?((x%4===0||y%4===0)?-16:3):Math.sin(x*.55+Math.sin(y*.14)*.8)*8,light=Math.round(239+grain+noise%7);pixels.set([light,light,light,255],index);}
  const texture=new THREE.DataTexture(pixels,size,size);texture.name=fabric?'fishing-woven-linen':'fishing-timber-grain';texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

/** All geometry belongs to this viewer-scoped pool, never to one boat or worker. */
export function createFishingModelLibrary(biome:WorldBiome='coast'):FishingModelLibrary {
  const templates=new Map<string,THREE.Group>(),geometries=new Set<THREE.BufferGeometry>(),textures=new Set<THREE.Texture>(),instances=new Set<THREE.Group>(),cube=new THREE.BoxGeometry(1,1,1),actors=createLivingActorLibrary();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,flatShading:true}),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),euler=new THREE.Euler();let disposed=false,biomeModels:BiomeSettlementLibrary|null=null;
  function surfaceTexture(fabric=false){const texture=createHarbourSurfaceTexture(fabric?'linen':'timber');textures.add(texture);return texture;}
  const timberMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,flatShading:true,map:surfaceTexture()}),clothMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide,map:surfaceTexture(true)}),ironMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.4,metalness:.62,flatShading:true}),lanternMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,emissive:0xdca757,emissiveIntensity:.42});
  const part=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0):Part=>({color:CLIMATE_COLORS[biome][color]??color,x,y,z,w,h,d,rx,ry,rz});
  function mesh(parts:Part[],name:string,finish=material){const list=parts.map(p=>{matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromEuler(euler.set(p.rx??0,p.ry??0,p.rz??0)),scale.set(p.w,p.h,p.d));const g=cube.clone().applyMatrix4(matrix),rgb=new THREE.Color(p.color),colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=rgb.r;colors[i+1]=rgb.g;colors[i+2]=rgb.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;}),geometry=mergeGeometries(list,false)!;list.forEach(g=>g.dispose());geometry.computeBoundingSphere();geometries.add(geometry);const result=new THREE.Mesh(geometry,finish);result.name=name;result.castShadow=true;result.receiveShadow=true;return result;}
  function beam(color:number,a:readonly[number,number,number],b:readonly[number,number,number],width=.025){const direction=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),length=direction.length(),angles=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));return part(color,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,length,width,angles.x,angles.y,angles.z);}
  function canvasSail(){const columns=8,rows=12,positions:number[]=[],colors:number[]=[],uv:number[]=[],indices:number[]=[],color=new THREE.Color(CLIMATE_COLORS[biome][CLOTH]??CLOTH);for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){const u=column/columns,v=row/rows,width=1.9-v*.9,shade=(column%4===0?.92:1)*(row%4===0?.96:1);positions.push(-.94+u*width,v*3.02,Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.18);colors.push(color.r*shade,color.g*shade,color.b*shade);uv.push(u*2,v*3);}for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1;indices.push(a,c,b,b,c,d);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometries.add(geometry);const sail=new THREE.Mesh(geometry,clothMaterial);sail.name='boat-canvas-sail';sail.castShadow=true;sail.receiveShadow=true;return sail;}
  function node(name:string,x=0,y=0,z=0){const group=new THREE.Group();group.name=name;group.position.set(x,y,z);group.userData.fishingBiome=biome;return group;}
  function fishCrate(name:string){const group=node(name),parts:Part[]=[part(DARK,0,.08,0,.62,.14,.62)];for(const x of[-.31,.31])for(let row=0;row<3;row++)parts.push(part(row%2?LIGHT:WOOD,x,.16+row*.13,0,.07,.1,.68));for(const z of[-.31,.31])for(let row=0;row<3;row++)parts.push(part(row%2?WOOD:LIGHT,0,.16+row*.13,z,.62,.1,.07));for(let i=0;i<5;i++){const x=-.2+(i%3)*.18,z=-.18+Math.floor(i/3)*.3;parts.push(part(i%2?FISH:0xc0ccbd,x,.44,z,.11,.08,.34,0,(i%2?.2:-.15)),part(0x668e99,x,.44,z-.19,.19,.045,.09),part(0x304a4c,x-.03,.48,z+.13,.025,.02,.025));}group.add(mesh(parts,`${name}-mesh`));return group;}
  function cargo(name:string,count=4){const group=node(name);for(let i=0;i<count;i++){const crate=fishCrate(`${name}-${i}`);crate.position.set((i%2-.5)*.74,Math.floor(i/4)*.56,Math.floor((i%4)/2)*.75-.4);group.add(crate);}return group;}
  function setCargo(group:THREE.Object3D,value:boolean|number){const ratio=cargoRatio(value),amount=Math.ceil(ratio*group.children.length-1e-8);group.children.forEach((child,index)=>child.visible=index<amount);group.userData.load=ratio;}
  function structureTemplate(kind:FishingStructureKind,variant:number){const group=node(`fishing-${kind}-${variant}`),parts:Part[]=[],wood=variant%2?WOOD:0x997348;
    const box=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0)=>parts.push(part(color,x,y,z,w,h,d,rx,ry,rz));
    const post=(x:number,z:number,height=2.6)=>{box(DARK,x,height/2,z,.18,height,.18);box(LIGHT,x,height+.05,z,.25,.13,.25);};
    if(kind==='crate')return fishCrate(`fishing-crate-${variant}`);
    if(kind==='dock'||kind==='landing'){
      const width=kind==='dock'?4:5.8,length=kind==='dock'?8:3.6;
      for(let i=0;i<Math.ceil(length/.26);i++)box(i%4?wood:LIGHT,0,.68,-length/2+.13+i*.26,width,.14,.23);
      for(const x of[-width*.43,width*.43]){box(DARK,x,.45,0,.16,.25,length+.1);for(const z of[-length*.43,0,length*.43]){box(DARK,x,-.4,z,.24,2.3,.24);box(LIGHT,x,.95,z,.28,.65,.28);box(ROPE,x,1.21,z,.32,.12,.32);}}
      // Joinery and salt-worn fittings stay inside the existing walkable deck.
      for(const z of[-length*.37,0,length*.37]){parts.push(beam(DARK,[-width*.43,-.7,z],[width*.43,.43,z],.11),beam(wood,[width*.43,-.7,z],[-width*.43,.43,z],.1));for(const x of[-width*.43,width*.43]){box(IRON,x,-.24,z,.255,.065,.255);box(IRON,x,.1,z,.255,.055,.255);box(0x596b5b,x,-.94,z,.25,.25,.25);box(IRON,x,.78,z,.05,.04,.05);}}
      for(const x of[-width*.38,width*.38])for(const z of[-length*.35,0,length*.35])box(DARK,x,.757,z,.035,.012,.035);
      if(kind==='dock'){for(const z of[-2.5,2.5]){box(IRON,1.45,.86,z,.1,.18,.36);box(IRON,1.45,.98,z,.34,.07,.11);}const crates=cargo('dock-cargo',2);crates.position.set(-.85,.76,-2.35);group.add(crates);}
    }else if(kind==='rack'||kind==='net'){
      for(const x of[-1.35,1.35])post(x,0,2.1);box(ROPE,0,1.92,0,2.85,.055,.055);
      if(kind==='rack')for(let i=0;i<9;i++){const x=-1.12+i*.28;box(ROPE,x,1.7,0,.025,.4,.025);box(i%2?FISH:0xbcc5af,x,1.23,.03,.13,.65,.11);box(0x638d99,x,.85,.03,.25,.14,.07);}
      else{for(let i=0;i<13;i++)box(ROPE,-1.25+i*.21,1.1,0,.018,1.6,.018);for(let i=0;i<9;i++)box(ROPE,0,.35+i*.18,.01,2.6,.018,.018);for(const x of[-1.24,-.62,0,.62,1.24])box(LIGHT,x,1.96,0,.09,.1,.1);}
      if(biome==='ice'){box(0xe0ece8,0,2.23,0,2.95,.12,.8);for(const x of[-1.35,1.35])box(0xe7efea,x,2.35,0,.32,.12,.38);}
      else if(biome==='desert'||biome==='tropical'){for(let i=0;i<9;i++)box(i%2?CLOTH:biome==='tropical'?0x76925b:LIGHT,-1.4+i*.35,2.25,0,.36,.08,1.12);}
    }else if(kind==='fishstall'){
      for(const x of[-2.2,2.2])for(const z of[-1.25,1.25])post(x,z,2.8);for(let i=0;i<12;i++)box(i%2?0x6f9598:CLOTH,-2.4+i*.43,2.78,0,.44,.16,3.05);box(LIGHT,0,1.05,.55,4.5,.2,1.2);box(0x769092,0,1.22,.55,4.2,.12,1);
      for(let i=0;i<12;i++)box(i%2?FISH:0xc1cab3,-1.9+(i%6)*.72,1.35,.35+Math.floor(i/6)*.4,.18,.13,.46,0,i%2?.15:-.15);for(const x of[-1.9,1.9])box(wood,x,.57,.55,.17,1,.17);const crates=cargo('stall-storage',2);crates.position.set(.2,.1,-.9);group.add(crates);
      if(biome==='ice')box(0xe3eeeb,0,2.93,0,5.2,.13,3.2);
      else if(biome==='desert')for(const z of[-1.52,1.52])box(CLOTH,0,2.64,z,5.15,.23,.09);
      else if(biome==='tropical')for(let i=0;i<13;i++)box(i%2?0x6c8753:0x859765,-2.5+i*.42,2.93,0,.43,.09,3.18);
    }else if(kind==='home'||kind==='warehouse'){
      const warehouse=kind==='warehouse',w=warehouse?5.7:4.05,d=warehouse?4.5:3.6,h=warehouse?3.6:2.7;
      box(0x8b9180,0,.15,0,w+.4,.3,d+.4);for(let row=0;row<Math.ceil(h/.22);row++){const y=.42+row*.22;for(const side of[-1,1])box(row%4?wood:LIGHT,0,y,side*d/2,w,.19,.1);for(const side of[-1,1])box(row%3?wood:DARK,side*w/2,y,0,.12,.19,d);}
      for(const x of[-w/2,w/2])for(const z of[-d/2,d/2])box(DARK,x,h/2+.3,z,.2,h+.25,.2);
      for(let tier=0;tier<9;tier++)box(tier%2?0x66838a:0x81999a,0,h+.4+tier*.17,0,w+.7-tier*(w+.4)/9,.2,d+.7);box(LIGHT,0,h+2,0,.25,.12,d+.8);
      const doorW=warehouse?1.9:.9;box(DARK,0,1.25,d/2+.06,doorW,2.3,.15);for(let i=0;i<(warehouse?9:5);i++)box(i%2?wood:LIGHT,-doorW/2+doorW/(warehouse?18:10)+i*doorW/(warehouse?9:5),1.22,d/2+.16,doorW/(warehouse?9:5)-.025,2.15,.055);for(const x of[-doorW/2-.13,doorW/2+.13])box(LIGHT,x,1.25,d/2+.17,.16,2.55,.2);
      for(const x of[-w*.34,w*.34]){box(DARK,x,1.95,d/2+.14,.68,.85,.08);box(0x507b82,x,1.95,d/2+.19,.54,.7,.035);box(LIGHT,x,1.95,d/2+.22,.045,.72,.04);box(LIGHT,x,1.95,d/2+.22,.56,.045,.04);}
      if(warehouse){box(DARK,0,3.5,d/2+.1,.2,1.2,.2);box(LIGHT,0,4,d/2+.7,.16,.16,1.4);box(ROPE,0,3.3,d/2+1.3,.035,1.4,.035);}else{box(0x9b9c87,-1.35,3.45,-.75,.45,2,.5);box(DARK,-1.35,4.5,-.75,.57,.16,.6);}
    }else if(kind==='barrel'){for(let row=0;row<6;row++)box(row%2?wood:LIGHT,0,.1+row*.16,0,.65-Math.abs(row-2.5)*.035,.15,.65-Math.abs(row-2.5)*.035);for(const y of[.25,.7])box(IRON,0,y,0,.69,.06,.69);}
    else{post(0,0,3.1);box(0xe2c387,0,3.1,0,.48,.55,.48);box(DARK,0,3.42,0,.64,.12,.64);}
    if(parts.length)group.add(mesh(parts,`fishing-${kind}-body`));if(kind==='home')group.scale.setScalar(.5);if(kind==='warehouse')group.scale.setScalar(.35);return group;
  }
  function get(kind:FishingStructureKind,seed:number|string=0){
    if(disposed)throw new Error('Fishing model library disposed');
    if((biome!=='coast'&&biome!=='ocean'&&(kind==='home'||kind==='warehouse'))||['workshop','kitchen','garden','laboratory','barracks','logistics','market','windmill','keep','hall','tower','fence','prop'].includes(kind)){
      biomeModels??=createBiomeSettlementLibrary();const model=biomeModels.get(kind as BiomeStructureKind,biome,2,seedNumber(seed));model.userData.fishingBiome=biome;
      if(kind==='home'||kind==='warehouse'){const bounds=new THREE.Box3().setFromObject(model,true),budget=FISHING_MODEL_DIMENSIONS[kind],size=bounds.getSize(new THREE.Vector3()),factor=Math.min(1,budget.width/Math.max(size.x,Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*2),budget.length/Math.max(size.z,Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))*2));model.scale.multiplyScalar(factor);}
      // A potted palm extends this kitchen sideways. Keep its facade and prop
      // within the same 2.6-unit envelope when a port rotates the building 90°.
      if(kind==='kitchen'&&biome==='desert'){const bounds=new THREE.Box3().setFromObject(model,true),extent=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x));model.scale.x*=Math.min(1,1.3/extent);}
      return model;
    }
    const variant=seedNumber(seed)%2,key=`structure-${kind}-${variant}`;let template=templates.get(key);if(!template){template=structureTemplate(kind,variant);templates.set(key,template);}return template.clone(true);
  }
  function worker(role:'fisher'|'porter'|'dockworker'|'merchant'|'worker',seed:number|string=0){
    if(disposed)throw new Error('Fishing model library disposed');const actor=actors.getForBiome(role==='merchant'?'merchant':'worker',biome,seedNumber(seed));actor.group.userData.fishingBiome=biome;actor.group.getObjectByName('actor-load')?.removeFromParent();
    if(role==='porter'||role==='dockworker'||role==='merchant'){const load=node('actor-load',0,1.02,.44),crate=fishCrate('porter-fish-crate');crate.scale.setScalar(.78);crate.position.y=-.18;load.add(crate);load.visible=false;actor.group.getObjectByName('actor-torso')!.add(load);}
    if(role==='fisher'){const hand=actor.group.getObjectByName('actor-right-elbow')!,pole=node('fisher-pole');pole.add(mesh([part(WOOD,0,-.3,.72,.045,.045,1.8,-.18),part(ROPE,0,-.65,1.55,.015,.7,.015)],'fisher-rod-line'));hand.add(pole);pole.visible=false;}
    const animate=actor.animate;actor.animate=(time,walking,working=false)=>{animate(time,walking,working);const carrying=actor.group.getObjectByName('actor-load')?.visible??false;
      if(!carrying){const speed=typeof walking==='boolean'?(walking?1:0):Math.min(1.25,Math.max(0,finite(walking))),stride=Math.sin((finite(time)%86400)*6.4)*.4*speed;actor.group.getObjectByName('actor-left-shoulder')!.rotation.x=-stride;actor.group.getObjectByName('actor-right-shoulder')!.rotation.x=stride;actor.group.getObjectByName('actor-left-elbow')!.rotation.x=-.12;actor.group.getObjectByName('actor-right-elbow')!.rotation.x=-.12;}
      const pole=actor.group.getObjectByName('fisher-pole');if(pole){pole.visible=working;if(working)actor.group.getObjectByName('actor-right-shoulder')!.rotation.x=-.8+Math.sin((finite(time)%86400)*1.4)*.3;}
    };return actor;
  }
  function boat(seed:number|string=0):FishingBoat {
    if(disposed)throw new Error('Fishing model library disposed');const variant=seedNumber(seed)%2,key=`boat-${variant}`;let template=templates.get(key);
    if(!template){template=node(`fishing-boat-${variant}`);const hull:Part[]=[];
      for(let row=0;row<5;row++){const y=-.29+row*.15;for(let section=0;section<14;section++){const z=-2.23+section*.34,shape=Math.sqrt(Math.max(.07,1-Math.pow(z/2.55,2))),width=(.74+row*.085)*shape;hull.push(part(row%2?WOOD:LIGHT,0,y,z,width*2,.13,.36));}}
      for(let plank=0;plank<9;plank++)hull.push(part(plank%3?0x9c7a4d:LIGHT,-.88+plank*.22,.43,0,.19,.1,3.65));
      for(const x of[-.99,.99])hull.push(part(DARK,x,.58,0,.1,.22,3.7));for(const z of[-1.9,1.9])hull.push(part(LIGHT,0,.65,z,1.6,.14,.3));hull.push(part(DARK,0,.02,0,.14,.54,4.7),part(0x577f85,0,.63,-2.06,1.3,.26,.18));
      template.add(mesh(hull,'boat-planked-hull',timberMaterial));
      const joinery:Part[]=[part(DARK,0,.03,2.31,.11,.66,.23),part(LIGHT,0,.68,2.31,.15,.13,.27),part(DARK,0,.22,-2.23,1.03,.69,.13),part(LIGHT,0,.61,-2.23,1.1,.12,.16)];
      for(const side of[-1,1])for(let section=0;section<10;section++){const z=-1.8+section*.39,shape=Math.sqrt(Math.max(.07,1-Math.pow(z/2.55,2)));joinery.push(part(DARK,side*(1.02*shape),.31,z,.035,.7,.045),part(LIGHT,side*(1.035*shape),.68,z,.045,.07,.3));}
      // The low gunwale retains the boarding height and the open passenger area.
      for(const side of[-1,1])for(const z of[-1.5,-.8,1.5])joinery.push(part(LIGHT,side*.98,.73,z,.07,.12,.08));
      for(const side of[-1,1])joinery.push(part(DARK,side*.98,.77,-1.15,.07,.055,.78),part(DARK,side*.98,.77,1.5,.07,.055,.5));
      template.add(mesh(joinery,'boat-strakes-stem-and-gunwale',timberMaterial));
      const rigging:Part[]=[part(DARK,-.2,2.92,-.25,.13,5.3,.13),part(LIGHT,-.2,5.47,-.25,2.05,.09,.09),part(LIGHT,-.2,2.15,-.25,2.1,.09,.09),part(ROPE,-.2,3.8,-.25,.025,3.5,.025)];
      for(const side of[-1,1])for(const z of[-1.58,1.58])rigging.push(beam(ROPE,[-.2,5.43,-.25],[side*.98,.74,z],.018));
      rigging.push(beam(ROPE,[-.2,5.43,-.25],[0,.75,2.3],.021),beam(ROPE,[-.2,5.43,-.25],[0,.75,-2.2],.021),beam(ROPE,[-1.12,5.47,-.25],[-1.12,2.17,-.25],.018),beam(ROPE,[.79,5.47,-.25],[.79,2.17,-.25],.018));
      // Mast steps and a compact lookout platform, within the original mast envelope.
      for(let step=0;step<10;step++)rigging.push(part(LIGHT,-.2,1.1+step*.27,-.14,.29,.045,.045));
      rigging.push(part(DARK,-.2,3.79,-.25,.53,.08,.53));for(const x of[-.44,.04])for(const z of[-.49,-.01])rigging.push(part(WOOD,x,3.98,z,.035,.38,.035));for(const z of[-.49,-.01])rigging.push(part(LIGHT,-.2,4.16,z,.53,.045,.04));
      template.add(mesh(rigging,'boat-mast-rigging',timberMaterial));
      const sail=node('boat-sail',-.2,2.3,-.25);sail.add(canvasSail());template.add(sail);
      const pennant=node('boat-mast-pennant',-.2,5.66,-.25);pennant.add(mesh([part(variant?0x638c92:0xa66a4c,.22,0,0,.46,.16,.025),part(CLOTH,.07,0,.02,.04,.16,.025)],'boat-pennant-cloth',clothMaterial));template.add(pennant);
      const helm=node('boat-helm',0,1.12,-1.1),helmParts:Part[]=[part(DARK,0,0,0,.07,.07,.12)];for(let spoke=0;spoke<8;spoke++){const angle=spoke*Math.PI/4;helmParts.push(part(LIGHT,Math.sin(angle)*.12,Math.cos(angle)*.12,0,.035,.3,.04,0,0,-angle),part(DARK,Math.sin(angle)*.19,Math.cos(angle)*.19,0,.12,.045,.055,0,0,-angle));}helm.add(mesh(helmParts,'boat-helm-wheel',timberMaterial));template.add(helm);template.add(mesh([part(DARK,0,.77,-1.1,.09,.59,.12),part(IRON,0,1.12,-1.2,.1,.08,.22)],'boat-helm-support',ironMaterial));
      const rudder=node('boat-rudder',0,0,-2.3);rudder.add(mesh([part(DARK,0,-.02,-.07,.09,.64,.15),part(WOOD,0,-.18,-.04,.16,.3,.18),part(IRON,0,.19,-.02,.2,.05,.13)],'boat-rudder-blade',timberMaterial));template.add(rudder);
      const equipment:Part[]=[];for(const y of[.59,.7,.81])equipment.push(part(y===.7?LIGHT:WOOD,-.63,y,-.78,.36,.1,.38));for(const y of[.59,.79])equipment.push(part(IRON,-.63,y,-.78,.38,.035,.4));equipment.push(part(DARK,-.63,.89,-.78,.33,.04,.35),part(IRON,-.57,.92,-.78,.055,.025,.055));
      for(let ring=0;ring<2;ring++)for(let segment=0;segment<10;segment++){const angle=segment*Math.PI/5,radius=.13+ring*.045;equipment.push(part(ROPE,-.52+Math.cos(angle)*radius,.55,1.47+Math.sin(angle)*radius,.065,.035,.045,0,-angle));}
      equipment.push(part(IRON,-.83,.6,1.72,.055,.42,.055),part(IRON,-.83,.44,1.72,.35,.055,.055),part(IRON,-.98,.48,1.72,.055,.16,.055,0,0,.4),part(IRON,-.68,.48,1.72,.055,.16,.055,0,0,-.4));template.add(mesh(equipment,'boat-provisions-coils-and-anchor',timberMaterial));
      template.add(mesh([part(DARK,.62,.94,-1.65,.18,.04,.16),part(IRON,.62,1.17,-1.65,.21,.04,.2),beam(IRON,[.62,1.17,-1.65],[.62,1.32,-1.65],.025)],'boat-stern-lantern-frame',ironMaterial),mesh([part(0xf1d49a,.62,1.06,-1.65,.13,.2,.13)],'boat-stern-lantern-glass',lanternMaterial));
      const net=node('boat-net',1.02,.74,.1),netParts:Part[]=[];for(const z of[-.57,.57]){for(let i=0;i<10;i++)netParts.push(part(ROPE,.04+i*.17,-.63,z,.018,1.25,.018));for(let row=0;row<9;row++)netParts.push(part(ROPE,.8,-.05-row*.15,z,1.65,.018,.018));}for(const x of[.04,1.57]){for(let i=0;i<7;i++)netParts.push(part(ROPE,x,-.63,-.54+i*.18,.018,1.25,.018));for(let row=0;row<9;row++)netParts.push(part(ROPE,x,-.05-row*.15,0,.018,.018,1.15));}for(const x of[.03,1.57])for(const z of[-.57,.57])netParts.push(part(DARK,x,-1.29,z,.08,.12,.1));for(let i=0;i<5;i++)netParts.push(part(LIGHT,i*.38,-.03,0,.11,.12,1.2));net.add(mesh(netParts,'boat-net-mesh'));template.add(net);
      const line=node('boat-net-line',.76,1.17,.13);line.add(mesh([part(ROPE,.45,-.04,0,.95,.025,.025,0,0,-.25),part(WOOD,0,0,0,.24,.22,.3),part(IRON,0,0,.2,.06,.32,.05)],'boat-winch-rope'));template.add(line);
      const load=cargo('boat-cargo',6);load.position.set(-.05,.49,.3);load.scale.setScalar(.7);template.add(load);
      templates.set(key,template);
    }
    const group=template.clone(true),sail=group.getObjectByName('boat-sail')!,net=group.getObjectByName('boat-net')!,line=group.getObjectByName('boat-net-line')!,load=group.getObjectByName('boat-cargo')!,helm=group.getObjectByName('boat-helm')!,rudder=group.getObjectByName('boat-rudder')!,pennant=group.getObjectByName('boat-mast-pennant')!;
    const skipper=worker('worker',seedNumber(seed)+2),fisher=worker('fisher',seedNumber(seed)+7);skipper.group.scale.setScalar(.56);skipper.group.position.set(0,.48,-1.5);fisher.group.scale.setScalar(.56);fisher.group.position.set(.67,.48,1.2);fisher.group.rotation.y=Math.PI/2;group.add(skipper.group,fisher.group);instances.add(group);let detached=false;
    const animate=(first:FishingBoatPose|number,speed=0,phase='moored',cargoValue:boolean|number=false)=>{const pose=typeof first==='number'?{time:first,speed,state:phase,cargo:cargoValue,wind:1}:first,at=finite(pose.time)%86400,moving=Math.abs(finite(pose.speed)),fishing=/fish|cast|haul/.test(pose.state);
      net.rotation.z=fishing?.14+Math.sin(at*.8)*.12:-Math.PI/2;net.rotation.x=fishing?Math.sin(at*.6)*.06:0;net.scale.set(fishing?1:.14,fishing?.7+Math.sin(at*.7)*.16:.36,fishing?1:.7);line.rotation.z=fishing?Math.sin(at*1.2)*.25:0;
      sail.rotation.y=.08+Math.sin(at*.65)*.06*Math.max(.2,finite(pose.wind??1));sail.scale.x=moving>.05?1:.3;sail.scale.z=1+Math.sin(at*.8)*.07;setCargo(load,pose.cargo);
      const steering=moving>.05?Math.sin(at*.32)*.08:0;helm.rotation.z=steering*2.5;rudder.rotation.y=steering;pennant.rotation.y=Math.sin(at*1.8)*.12*Math.max(.2,finite(pose.wind??1));
      skipper.animate(at,false,false);for(const side of['left','right']){skipper.group.getObjectByName(`actor-${side}-shoulder`)!.rotation.x=-.72;skipper.group.getObjectByName(`actor-${side}-elbow`)!.rotation.x=-.35;}fisher.animate(at,false,fishing);fisher.group.getObjectByName('fisher-pole')!.visible=fishing;const arm=fisher.group.getObjectByName('actor-right-shoulder')!;if(fishing)arm.rotation.x=-.8+Math.sin(at*1.4)*.3;group.userData.fishing=fishing;group.userData.cargo=cargoRatio(pose.cargo);};
    const result:FishingBoat={group,animate:animate as FishingBoat['animate'],dispose(){if(detached)return;detached=true;skipper.dispose();fisher.dispose();group.removeFromParent();instances.delete(group);}};result.animate(0,0,'moored',false);return result;
  }
  function haulage(kindOrSeed:'horse'|'ox'|number=biome==='ice'||biome==='mountain'?'ox':'horse',seed=0):FishingHaulage {
    if(disposed)throw new Error('Fishing model library disposed');const kind=typeof kindOrSeed==='number'?(kindOrSeed%2?'ox':'horse'):kindOrSeed,variant=typeof kindOrSeed==='number'?seedNumber(kindOrSeed):seedNumber(seed),key=`haulage-${kind}`;let template=templates.get(key);
    if(!template){template=node(`fishing-haulage-${kind}`);const ox=kind==='ox',fur=ox?0x95866c:0x8c6648,body:Part[]=[part(WOOD,0,.91,-.55,1.75,.16,2.8),part(DARK,-.78,.71,.75,.1,.16,4.9),part(DARK,.78,.71,.75,.1,.16,4.9),part(WOOD,-.85,1.22,-.55,.12,.55,2.9),part(WOOD,.85,1.22,-.55,.12,.55,2.9),part(WOOD,0,1.22,-1.98,1.8,.55,.12),part(LIGHT,0,1.36,.5,1.8,.16,.45),part(DARK,0,.61,-.55,2.15,.16,.16)];
      template.add(mesh(body,'haulage-cart-body'));const load=cargo('haulage-cargo',6);load.position.set(0,1.01,-.78);template.add(load);
      for(const x of[-1.015,1.015])for(const z of[-1.35,.3]){const wheel=node(`haulage-wheel-${x}-${z}`,x,.52,z),parts:Part[]=[part(LIGHT,0,0,0,.16,.95,.12),part(LIGHT,0,0,0,.16,.12,.95),part(DARK,0,0,0,.24,.22,.22)];for(let i=0;i<16;i++){const a=i*Math.PI/8;parts.push(part(IRON,0,Math.cos(a)*.46,Math.sin(a)*.46,.18,.15,.15));}wheel.add(mesh(parts,'haulage-wheel-mesh'));template.add(wheel);}
      const animal=node('haulage-animal',0,0,2.85),anatomy:Part[]=[part(fur,0,1.6,0,ox?1.1:.86,.82,2),part(fur,0,1.99,.67,.6,1.02,.62,.0,0),part(fur,0,2.36,1.05,.57,.5,.82),part(ox?0x5e5547:0x534437,0,2.22,1.48,.53,.22,.2),part(DARK,0,1.84,-1.1,.08,.45,.07)];
      for(const x of[-.31,.31]){anatomy.push(part(fur,x,2.62,.96,.18,.31,.13,0,0,x<0?-.4:.4),part(0x253b33,x*.87,2.42,1.27,.07,.07,.035));if(ox)anatomy.push(part(0xd5c7a0,x*1.55,2.66,.76,.55,.11,.11,0,0,x<0?-.3:.3));}
      if(!ox)for(let i=0;i<6;i++)anatomy.push(part(DARK,0,2.03+i*.1,.46+i*.07,.16,.18,.18));
      animal.add(mesh(anatomy,'haulage-animal-body'));
      for(const x of[-.34,.34])for(const z of[-.72,.67]){const leg=node(`animal-leg-${x}-${z}`,x,1.24,z),knee=node(`animal-knee-${x}-${z}`,0,-.5,0);leg.add(mesh([part(fur,0,-.26,0,.2,.54,.23)],'animal-upper-leg'));knee.add(mesh([part(fur,0,-.23,0,.15,.48,.18),part(DARK,0,-.51,.045,.2,.14,.27)],'animal-hoof-leg'));leg.add(knee);animal.add(leg);}
      template.add(animal);template.add(mesh([part(DARK,0,1.78,3.03,1.36,.15,.18),part(IRON,-.64,1.61,3.03,.09,.4,.2),part(IRON,.64,1.61,3.03,.09,.4,.2),part(ROPE,-.68,1.2,3.09,.055,1.15,.055,0,0,-.18),part(ROPE,.68,1.2,3.09,.055,1.15,.055,0,0,.18),part(ROPE,-.28,1.83,2.02,.035,.035,2.7,-.05),part(ROPE,.28,1.83,2.02,.035,.035,2.7,-.05),part(DARK,0,2.19,4.18,.68,.08,.08)],'haulage-yoke-harness-reins'));templates.set(key,template);
    }
    const group=template.clone(true),wheels=group.children.filter(child=>child.name.startsWith('haulage-wheel-')),animal=group.getObjectByName('haulage-animal')!,legs=animal.children.filter(child=>child.name.startsWith('animal-leg-')),load=group.getObjectByName('haulage-cargo')!,driver=worker('worker',variant+19);driver.group.scale.setScalar(.62);driver.group.position.set(0,.96,.57);driver.group.name='haulage-driver';group.add(driver.group);instances.add(group);let detached=false,lastTime:number|null=null,distance=0;
    const animate=(first:FishingHaulagePose|number,speed=0,cargoValue:boolean|number=false)=>{const pose=typeof first==='number'?{time:first,speed,cargo:cargoValue}:first,at=finite(pose.time)%86400,velocity=Math.max(0,Math.min(4,Math.abs(finite(pose.speed))));if(lastTime!==null&&at>=lastTime)distance+=Math.min(1,at-lastTime)*velocity;else if(lastTime!==null)distance=0;lastTime=at;wheels.forEach(wheel=>wheel.rotation.x=distance/.5);
      legs.forEach((leg,index)=>{const phase=(index===0||index===3?0:Math.PI),gait=Math.sin(distance*3.2+phase);leg.rotation.x=gait*.48*Math.min(velocity,1);const knee=leg.children.find(child=>child.name.startsWith('animal-knee-'))!;knee.rotation.x=Math.max(0,-gait)*.4*Math.min(velocity,1);});animal.position.y=Math.abs(Math.sin(distance*6.4))*.025*Math.min(velocity,1);
      driver.animate(at,false,false);for(const side of['left','right']){driver.group.getObjectByName(`actor-${side}-hip`)!.rotation.x=-1.2;driver.group.getObjectByName(`actor-${side}-knee`)!.rotation.x=1.1;driver.group.getObjectByName(`actor-${side}-shoulder`)!.rotation.x=-.85;driver.group.getObjectByName(`actor-${side}-elbow`)!.rotation.x=-.28;}setCargo(load,pose.cargo);group.userData.cargo=cargoRatio(pose.cargo);group.userData.distance=distance;};
    const result:FishingHaulage={group,animate:animate as FishingHaulage['animate'],dispose(){if(detached)return;detached=true;driver.dispose();group.removeFromParent();instances.delete(group);}};result.animate(0,0,false);return result;
  }
  return{boat,haulage,get,structure:get,worker,dispose(){if(disposed)return;disposed=true;instances.forEach(group=>group.removeFromParent());instances.clear();actors.dispose();biomeModels?.dispose();templates.clear();geometries.forEach(g=>g.dispose());geometries.clear();textures.forEach(texture=>texture.dispose());textures.clear();cube.dispose();for(const finish of[material,timberMaterial,clothMaterial,ironMaterial,lanternMaterial])finish.dispose();}};
}
export const createFishingCommunityLibrary=createFishingModelLibrary;
