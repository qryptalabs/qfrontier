import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {CAVE_MODEL_BOXES} from './landmark-model-data.ts';

export type WorldAsset = 'deer'|'fox'|'camel'|'sheep'|'cactus'|'igloo'|'adobe'|'hut'|'boat'|'cave'|'pine'|'oak'|'snowpine'|'palm'|'market'|'windmill'|'wall';
export interface WorldAssetLibrary { get(kind:WorldAsset):THREE.Group; dispose():void }

/** Use viewer time (frozen when paused/reduced-motion) so only the sails rotate. */
export function animateWorldAsset(group:THREE.Object3D,time:number,phase=0):void {
  const seconds=Number.isFinite(time)?time%86400:0,offset=Number.isFinite(phase)?phase%(Math.PI*2):0;
  group.traverse(object=>{if(object.name==='windmill-rotor')object.rotation.z=seconds*.42+offset;});
}

/** Small hand-built scenery assets. Templates and materials belong to one viewer. */
export function createWorldAssetLibrary():WorldAssetLibrary {
  const cache=new Map<WorldAsset,THREE.Group>(), materials=new Map<number,THREE.MeshStandardMaterial>(), geometries=new Set<THREE.BufferGeometry>();
  const cube=new THREE.BoxGeometry(1,1,1), m=new THREE.Matrix4(), q=new THREE.Quaternion(), p=new THREE.Vector3(), s=new THREE.Vector3();
  let disposed=false;
  function mat(color:number) {let value=materials.get(color);if(!value){value=new THREE.MeshStandardMaterial({color,roughness:.94,flatShading:true});materials.set(color,value);}return value;}
  function build(kind:WorldAsset) {
    const group=new THREE.Group();group.name=`world-${kind}`;const parts=new Map<number,THREE.BufferGeometry[]>(),rotorParts=new Map<number,THREE.BufferGeometry[]>();let currentParts=parts;
    const box=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,angle=0)=>{m.compose(p.set(x,y,z),q.setFromAxisAngle(new THREE.Vector3(0,0,1),angle),s.set(w,h,d));const g=cube.clone().applyMatrix4(m);let list=currentParts.get(color);if(!list){list=[];currentParts.set(color,list);}list.push(g);};
    const wood=0x865a35,dark=0x40372a,light=0xb58a54,stone=0x989282;
    if(['deer','fox','camel','sheep'].includes(kind)) {
      const fox=kind==='fox',camel=kind==='camel',sheep=kind==='sheep',fur=fox?0xb76b32:camel?0xc5a36b:sheep?0xdcd8c6:0x9f7048;
      const length=camel?2.5:fox?1.4:1.9,leg=camel?1.25:fox?.4:.75,body=leg+.4;
      box(fur,0,body,0,length,.8,sheep?.9:.66);box(sheep?0xeee9d8:fur,-.2,body+.35,0,length*.73,.28,.7);
      for(const x of [-length*.34,length*.34])for(const z of [-.23,.23]){box(fur,x,leg/2,z,.18,leg,.18);box(dark,x,.07,z,.2,.14,.21);}
      box(fur,length*.43,body+.43,0,.42,camel?1.25:.6,.44);box(fur,length*.61,body+(camel?.98:.58),0,.7,.43,.46);box(dark,length*.94,body+(camel?.9:.55),0,.17,.17,.35);
      for(const z of [-.16,.16]){box(fur,length*.58,body+(camel?1.3:.88),z,.15,.3,.13);box(0x202a24,length*.74,body+(camel?1.04:.65),z*1.48,.075,.075,.045);}
      if(kind==='deer')for(const z of [-.2,.2]){box(0x70573c,length*.45,body+1.04,z,.1,.6,.1);box(0x70573c,length*.45+.15,body+1.22,z,.38,.08,.1);}
      if(camel)for(const x of [-.65,.35]){box(fur,x,body+.57,0,.63,.58,.62);box(fur,x,body+.88,0,.36,.17,.4);}
      box(fox?0xeddfc5:fur,-length*.65,body-.04,0,fox?.8:.28,fox?.32:.13,.23,-.22);
      if(fox)box(0xf2e7d4,length*.28,body-.22,0,.72,.23,.65);
    } else if(kind==='cactus') {
      box(0x52734b,0,1.8,0,.55,3.6,.55);box(0x76915a,.15,1.9,.29,.12,3.3,.04);
      for(const [x,y,dir]of[[-.75,1.8,-1],[.8,2.5,1]]){box(0x52734b,x*.6,y,0,.9,.35,.38);box(0x52734b,x,y+.5,0,.32,1.3,.36);box(0xb5bb83,x+.17*dir,y+.65,.06,.045,.28,.04);}
      for(let i=0;i<8;i++)box(0xb6ba8d,i%2?.29:-.29,.4+i*.4,.03,.06,.08,.14);
    } else if(['pine','oak','snowpine','palm'].includes(kind)) {
      const snow=kind==='snowpine',palm=kind==='palm';box(wood,0,palm?2.5:2,0,.6,palm?5:4,.6);
      for(const x of [-.5,.5])box(dark,x,.2,.1,1,.3,.4);
      if(palm){for(let a=0;a<8;a++){const angle=a*Math.PI/4;for(let i=0;i<4;i++)box(i%2?0x6a9145:0x437641,Math.cos(angle)*(i*.7+.4),5.4-i*.2,Math.sin(angle)*(i*.7+.4),.8,.25,.8);}for(const x of [-.3,.25])box(0x84613c,x,4.8,.2,.4,.45,.4);}
      else if(kind==='oak'){for(let i=0;i<15;i++){const a=i*2.4,r=i<4?.8:1.8;box([0x53743a,0x77934a,0x8da454][i%3],Math.cos(a)*r,4+Math.sin(i)*.65,Math.sin(a)*r,1.8,1.25,1.7);}}
      else for(let tier=0;tier<5;tier++){const w=4.4-tier*.72,y=1.9+tier*.83;box(tier%2?0x3c623c:0x52733e,0,y,0,w,.7,w);box(snow?0xe1e9e4:0x74904b,-.1,y+.37,0,w*.82,.17,w*.83);box(0x365c37,w*.35,y-.1,w*.28,w*.4,.35,w*.4);} 
    } else if(kind==='igloo') {
      for(let tier=0;tier<5;tier++){const radius=Math.sqrt(Math.max(.4,9-tier*tier*.35)),count=18-tier*2,y=.35+tier*.55;for(let i=0;i<count;i++){const a=(i+(tier%2)*.5)*Math.PI*2/count;if(tier<2&&Math.sin(a)>.8)continue;box(i%3?0xe2edf0:0xc4d9df,Math.cos(a)*radius,y,Math.sin(a)*radius,.95,.52,.92);}}
      box(0xc5dce2,0,.8,3.2,2.1,1.6,2.2);box(0x345363,0,.5,4.32,1.35,1.02,.06);box(0xf0f3e7,0,1.72,3.3,2.4,.24,2.3);
    } else if(kind==='adobe'||kind==='hut') {
      const adobe=kind==='adobe';box(stone,0,.2,0,6.3,.4,5.3);box(adobe?0xc3996c:0xc4b98e,0,1.75,0,5.9,3.1,4.9);
      for(const x of [-2.8,2.8])for(const z of [-2.3,2.3])box(wood,x,1.85,z,.22,3.4,.22);
      box(dark,0,1.08,2.48,1.15,2.15,.1);box(light,-.7,1.1,2.58,.12,2.2,.2);box(light,.7,1.1,2.58,.12,2.2,.2);box(light,0,2.28,2.58,1.6,.18,.2);
      for(const x of [-1.9,1.9]){box(0x305b5b,x,1.8,2.5,.75,.8,.07);box(light,x,1.3,2.6,1.02,.18,.35);}
      if(adobe){box(0x9a704b,0,3.4,0,6.4,.3,5.4);for(const x of [-2.8,2.8])box(0xd3b181,x,3.7,0,.3,.5,5.5);for(const z of [-2.35,2.35])box(0xd3b181,0,3.7,z,5.6,.5,.3);for(let i=0;i<6;i++)box(wood,-2.5+i,3.1,2.65,.15,.2,.6);}
      else for(let tier=0;tier<6;tier++)box(tier%2?0x99713e:0xb48b4c,0,3.3+tier*.3,0,6.7-tier*.9,.38,5.8);
      box(light,-1.6,.65,3.2,.8,1.3,.85);box(0x817652,1.8,.45,3,.8,.9,.8);
    } else if(kind==='boat') {
      for(let tier=0;tier<4;tier++)box(tier%2?wood:light,0,.2+tier*.23,0,1.3+tier*.24,.22,4.2+tier*.3);box(0x276b74,0,1.13,0,1.5,.1,4.3);box(wood,0,3,0,.16,4.5,.16);
      for(let i=0;i<5;i++)box(0xe1d6b4,.15+i*.23,3.7-i*.18,0,.25,2.2-i*.33,.12);for(const z of [-1.2,1.2])box(light,0,1.25,z,2.1,.16,.3);
    } else if(kind==='cave') {
      for(const part of CAVE_MODEL_BOXES)box(part.color as number,part.x,part.y,part.z,part.width,part.height,part.depth);
    } else if(kind==='market') {
      for(const x of [-2.5,2.5])for(const z of [-1.6,1.6])box(wood,x,1.4,z,.16,2.8,.16);
      for(let i=0;i<10;i++)box(i%2?0xb86649:0xe7d0a2,-2.7+i*.6,2.8,0,.61,.18,3.9);box(light,0,.85,1,5.4,.2,1.4);
      for(let i=0;i<6;i++){box(wood,-2.2+i*.85,1.15,1,.7,.5,.85);box([0x8c9d4c,0xd0a34d,0xa55b42][i%3],-2.2+i*.85,1.48,1,.52,.24,.65);}
    } else if(kind==='wall') {
      for(let row=0;row<4;row++)for(let col=0;col<5;col++)box((row+col)%3?stone:0xb2ab97,-2.5+col*1.24+(row%2)*.25,.35+row*.65,0,1.18,.6,1.05);
      for(let col=0;col<5;col++)box(0xb4ab93,-2.5+col*1.24,3.02,0,.8,.62,1.12);
    } else if(kind==='windmill') {
      box(stone,0,2,0,2.7,4,2.7);for(let tier=0;tier<5;tier++)box(wood,0,4.1+tier*.22,0,3.6-tier*.6,.28,3.6-tier*.6);
      box(dark,0,3.6,1.5,.35,.35,.6);box(wood,0,.87,1.38,.65,1.74,.08);box(0x263f3b,.83,2.4,1.37,.5,.62,.08);box(light,.83,2.06,1.44,.68,.12,.24);
      currentParts=rotorParts;
      for(let i=0;i<4;i++){const angle=Math.PI/4+i*Math.PI/2,dx=-Math.sin(angle),dy=Math.cos(angle),rx=Math.cos(angle),ry=Math.sin(angle);box(wood,dx*1.8,dy*1.8,0,.17,3.7,.18,angle);box(0xe1d2a6,dx*2.15+rx*.3,dy*2.15+ry*.3,.09,.72,2.25,.08,angle);for(let rib=0;rib<5;rib++){const distance=1.2+rib*.45;box(light,dx*distance+rx*.3,dy*distance+ry*.3,.15,.78,.055,.045,angle);}}
      box(dark,0,0,.05,.5,.5,.4);box(light,0,0,.29,.25,.25,.1);currentParts=parts;
    }
    const addParts=(source:Map<number,THREE.BufferGeometry[]>,target:THREE.Group,animated=false)=>{for(const[color,list]of source){const geometry=mergeGeometries(list,false)!;list.forEach(g=>g.dispose());geometries.add(geometry);const mesh=new THREE.Mesh(geometry,mat(color));mesh.castShadow=true;mesh.receiveShadow=true;if(animated)mesh.userData.worldAnimated=true;target.add(mesh);}};
    addParts(parts,group);
    if(rotorParts.size){const rotor=new THREE.Group();rotor.name='windmill-rotor';rotor.position.set(0,3.6,1.9);rotor.userData.worldAnimated=true;rotor.userData.worldAnimation='windmill-rotor';addParts(rotorParts,rotor,true);group.add(rotor);}
    return group;
  }
  return {get(kind){if(disposed)throw new Error('Asset library disposed');let template=cache.get(kind);if(!template){template=build(kind);cache.set(kind,template);}return template.clone(true);},dispose(){if(disposed)return;disposed=true;cube.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());cache.clear();}};
}
