import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createWorldAssetLibrary} from './world-models.ts';
import type {WorldBiome} from './world-geography.ts';
import {addCivicArchitecture,addDwellingArchitecture,addMarketArchitecture,type SettlementPalette} from './settlement-architecture.ts';

export type BiomeStructureKind='home'|'workshop'|'garden'|'kitchen'|'laboratory'|'barracks'|'warehouse'|'logistics'|'market'|'windmill'|'keep'|'hall'|'tower'|'fence'|'prop'|'dock';
export interface BiomeSettlementLibrary {get(kind:BiomeStructureKind,biome:WorldBiome,tier?:number,variant?:number):THREE.Group;dispose():void}
type Palette=SettlementPalette;
const PALETTES:Record<WorldBiome,Palette>={
  ice:{wall:0x9bacb3,light:0xcddcdd,dark:0x617884,wood:0x675a49,roof:0x526d79,snow:0xe6efeb,accent:0x82b4c3,glass:0x80aeb8,plant:0x627b5b,soil:0x5f6359},
  desert:{wall:0xc7a16f,light:0xe0c28e,dark:0x9a704b,wood:0x87603b,roof:0xb68958,snow:0xe1cf9e,accent:0x3f8a89,glass:0x395f5b,plant:0x64845a,soil:0x92734e},
  mountain:{wall:0x8f958e,light:0xbfc1ad,dark:0x626e69,wood:0x6d513a,roof:0x5d7275,snow:0xe1e7dc,accent:0x8d6546,glass:0x467574,plant:0x637e46,soil:0x675a43},
  tropical:{wall:0xa98b5d,light:0xd4b37b,dark:0x68523a,wood:0x8b663d,roof:0x587d55,snow:0xb8bb80,accent:0xbc7850,glass:0x2c5c58,plant:0x70944c,soil:0x67593b},
  coast:{wall:0xd4c9a5,light:0xe9dcc0,dark:0x83948c,wood:0x8b6c48,roof:0x668993,snow:0xdce6dd,accent:0x4b8d9c,glass:0x396d76,plant:0x839557,soil:0x8a7c57},
  ocean:{wall:0xd4c9a5,light:0xe9dcc0,dark:0x83948c,wood:0x8b6c48,roof:0x668993,snow:0xdce6dd,accent:0x4b8d9c,glass:0x396d76,plant:0x839557,soil:0x8a7c57},
  forest:{wall:0xc7bb90,light:0xddcba2,dark:0x6e7664,wood:0x80603c,roof:0x8e7149,snow:0xc7bd91,accent:0x557c69,glass:0x3c6562,plant:0x74914d,soil:0x75613f},
  plains:{wall:0xc7bb90,light:0xddcba2,dark:0x6e7664,wood:0x80603c,roof:0xa0854c,snow:0xc7bd91,accent:0x6d8699,glass:0x3c6562,plant:0x8b9b50,soil:0x75613f},
};

/** Cached, genuinely volumetric architecture. The four-sided shells, roof tiles
 * and furnishings are merged before cloning; scenery keeps its planned bounds. */
export function createBiomeSettlementLibrary():BiomeSettlementLibrary {
  const cache=new Map<string,THREE.Group>(),owned=new Set<THREE.BufferGeometry>(),cube=new THREE.BoxGeometry(1,1,1),worldAssets=createWorldAssetLibrary();
  const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,hash=(Math.imul(x>>1,374761393)^Math.imul(y>>1,668265263))>>>0,shade=hash%11===0?229:hash%5===0?241:251;pixels[i]=pixels[i+1]=pixels[i+2]=shade;pixels[i+3]=255;}
  const texture=new THREE.DataTexture(pixels,32,32,THREE.RGBAFormat);texture.name='settlement-clustered-masonry-grain';texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapLinearFilter;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({vertexColors:true,map:texture,roughness:.86,flatShading:true}),glassMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.28,metalness:.08}),warmMaterial=new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xffbc65,emissiveIntensity:.32,roughness:.4}),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),euler=new THREE.Euler();let disposed=false;
  function build(kind:BiomeStructureKind,biome:WorldBiome,tier:number,variant:number){
    const p=PALETTES[biome],group=new THREE.Group(),parts:THREE.BufferGeometry[]=[],glassParts:THREE.BufferGeometry[]=[],warmParts:THREE.BufferGeometry[]=[];group.name=`biome-${biome}-${kind}-${tier}-${variant}`;group.userData.biome=biome;group.userData.structureKind=kind;
    const box=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,ry=0,rz=0)=>{
      matrix.compose(position.set(x,y,z),rotation.setFromEuler(euler.set(0,ry,rz)),scale.set(w,h,d));const geometry=cube.clone().applyMatrix4(matrix),rgb=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);
      for(let i=0;i<colors.length;i+=3){colors[i]=rgb.r;colors[i+1]=rgb.g;colors[i+2]=rgb.b;}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));(color===p.glass?glassParts:color===0xe9b967?warmParts:parts).push(geometry);
    };
    const stoneCourse=(x:number,z:number,w:number,d:number,h:number,y=0)=>{box(p.dark,x,y+h/2,z,w,h,d);const rows=Math.ceil(h/.18);for(let row=0;row<rows;row++){const yy=y+.08+row*.18;for(let col=0;col<Math.ceil(w/.24);col++){const xx=x-w/2+.12+col*.24+(row%2)*.09;if(xx>x+w/2-.05)continue;for(const side of[-1,1])box((row+col)%4?p.wall:p.light,xx,yy,z+side*(d/2+.012),.218,.155,.045);}for(let col=0;col<Math.ceil(d/.24);col++){const zz=z-d/2+.12+col*.24;if(zz>z+d/2-.05)continue;for(const side of[-1,1])box((row+col)%4?p.wall:p.light,x+side*(w/2+.012),yy,zz,.045,.155,.218);}}};
    const pitchedRoof=(x:number,z:number,w:number,d:number,y:number,snow=false)=>{for(let row=0;row<7;row++){const width=w*(1-row*.125),yy=y+row*.105;box(row%2?p.roof:p.dark,x,yy,z,width,.13,d);for(let plank=0;plank<Math.ceil(d/.18);plank++)box(snow?p.snow:(row+plank)%3?p.roof:p.wood,x,yy+.075,z-d/2+.09+plank*.18,width*.99,.045,.155);}box(snow?p.snow:p.light,x,y+.76,z,.2,.1,d+.04);};
    const window=(x:number,y:number,z:number,width=.3,height=.36)=>{box(p.wood,x,y,z,width+.1,height+.1,.06);box(p.glass,x,y,z+.037,width,height,.025);box(p.light,x,y-height/2-.07,z+.035,width+.18,.08,.15);box(p.light,x,y,z+.06,.035,height,.035);box(p.light,x,y,z+.06,width,.035,.035);};
    const door=(x:number,z:number,height=1,width=.4,y=0)=>{box(p.dark,x,y+height/2,z,width+.15,height+.12,.07);for(let i=0;i<4;i++)box(i%2?p.wood:p.dark,x-width/2+width/8+i*width/4,y+height/2,z+.045,width/4-.012,height,.035);for(const yy of[height*.24,height*.75])box(0x69756a,x,y+yy,z+.07,width,.035,.035);box(0xd7b46e,x+width*.27,y+height*.48,z+.09,.045,.045,.03);};
    const pot=(x:number,z:number,y=0,palm=false)=>{box(p.dark,x,y+.11,z,.26,.22,.26);box(p.accent,x,y+.24,z,.34,.08,.34);box(p.soil,x,y+.287,z,.25,.025,.25);box(p.wood,x,y+(palm?.72:.46),z,.06,palm?.9:.35,.06);for(let i=0;i<(palm?6:4);i++){const a=i*Math.PI*2/(palm?6:4);box(i%2?p.plant:p.accent,x+Math.cos(a)*(palm?.15:.12),y+(palm?1.14:.57),z+Math.sin(a)*(palm?.15:.12),palm?.32:.2,.07,palm?.14:.14,a);}};
    const crates=(x:number,z:number,y=0)=>{box(p.wood,x,y+.18,z,.4,.36,.4);for(const xx of[-.15,.15])box(p.light,x+xx,y+.18,z+.21,.035,.37,.025);box(p.dark,x,y+.18,z+.23,.42,.035,.025);};
    const fence=(x:number,z:number,length=2,height=.7,alongZ=false)=>{
      const wall=biome==='ice'||biome==='mountain'||biome==='desert';if(wall){stoneCourse(x,z,alongZ?.18:length,alongZ?length:.18,height);if(biome==='ice')box(p.snow,x,height+.03,z,alongZ?.24:length+.08,.09,alongZ?length+.08:.24);}
      else{for(const step of[-1,0,1])box(p.wood,x+(alongZ?0:step*length/2),height/2,z+(alongZ?step*length/2:0),.1,height,.1);for(const yy of[height*.38,height*.78])box(biome==='coast'||biome==='ocean'?0xc6b994:p.wood,x,yy,z,alongZ?.06:length,.055,alongZ?length:.06);}
    };
    const terraceGarden=()=>{
      for(let terrace=0;terrace<3;terrace++){
        const z=-.52+terrace*.52,y=.12+(biome==='mountain'?terrace*.12:0),water=biome==='tropical'||biome==='coast'||biome==='ocean';
        box(p.dark,0,y,z,1.8,.16,.48);box(water?0x70968a:p.soil,0,y+.1,z,1.65,.05,.37);
        for(let i=0;i<7;i++){const x=-.69+i*.23;box(p.plant,x,y+.25,z,.045,.25,.045);box(biome==='desert'?0xa9b573:biome==='ice'?0x8ea67a:0xb8bc68,x,y+.38,z,.1,.07,.1);if(terrace%2===0)box(0x64884a,x+.06,y+.25,z,.11,.045,.08);}
        for(const side of[-1,1])box(p.light,side*.9,y+.15,z,.07,.27,.53);
      }
      if(biome==='ice'){
        for(const x of[-.94,.94])for(const z of[-.79,.79])box(p.wood,x,.76,z,.065,1.35,.065);
        for(const z of[-.79,0,.79]){box(p.glass,-.46,1.33,z,.98,.07,.09,0,.38);box(p.glass,.46,1.33,z,.98,.07,.09,0,-.38);}
        for(let strip=0;strip<7;strip++){const z=-.68+strip*.225;box(0xbad5d4,-.46,1.32,z,.96,.045,.21,0,.38);box(0xbad5d4,.46,1.32,z,.96,.045,.21,0,-.38);}box(p.snow,0,1.53,0,.13,.08,1.8);
      }else if(biome==='desert'){for(const x of[-.94,.94])for(const z of[-.79,.79])box(p.wood,x,.86,z,.07,1.5,.07);for(let i=0;i<7;i++)box(i%2?0xb3935c:0xd4bb83,0,1.62,-.7+i*.23,2,.055,.14);pot(1,.6,0,true);}
      fence(0,-.93,2,.42);crates(.69,.9);
    };
    if(kind==='windmill'){
      const height=3.8;stoneCourse(0,0,2.45,2.3,height);door(0,1.18,1.45,.65);window(-.7,2.45,1.19,.42,.53);
      for(const side of[1,2,3]){const a=side*Math.PI/2,n=side%2?1.25:1.18;for(const y of[1.75,2.9]){box(p.dark,Math.sin(a)*n,y,Math.cos(a)*n,.35,.55,.065,a);box(0xe9b967,Math.sin(a)*(n+.037),y,Math.cos(a)*(n+.037),.23,.41,.025,a);box(p.light,Math.sin(a)*(n+.08),y,Math.cos(a)*(n+.08),.025,.43,.045,a);box(p.light,Math.sin(a)*(n+.08),y,Math.cos(a)*(n+.08),.26,.035,.045,a);}}
      for(const x of[-1.18,1.18])for(const z of[-1.08,1.08])box(p.wood,x,1.97,z,.1,3.78,.1);for(const yy of[.38,3.72]){box(p.wood,0,yy,1.18,2.5,.1,.08);box(p.wood,0,yy,-1.18,2.5,.1,.08);}
      if(biome==='desert'){box(p.light,0,height+.12,0,2.65,.23,2.55);for(const x of[-1.19,1.19])box(p.wall,x,height+.4,0,.16,.45,2.5);}
      else pitchedRoof(0,0,3.1,2.9,height+.15,biome==='ice');
      const rotor=worldAssets.get('windmill').getObjectByName('windmill-rotor')!.clone(true);rotor.position.set(0,3.6,1.9);group.add(rotor);crates(1.55,.9);if(biome==='ice')box(p.snow,0,.08,0,3.1,.16,3);
    }else if(kind==='market'){
      group.userData.architecture=addMarketArchitecture({box,palette:p,biome,tier,variant});
    }else if(kind==='garden')terraceGarden();
    else if(kind==='fence')fence(0,0,2,.65+(tier-1)*.12);
    else if(kind==='prop'){if(variant%3===0)pot(0,0,0,biome==='desert'||biome==='tropical');else if(variant%3===1){crates(-.2,0);crates(.23,.18);crates(-.2,0,.38);}else{box(p.dark,0,.14,0,1.3,.28,.9);box(p.glass,0,.29,0,1.11,.035,.7);for(const x of[-.65,.65])box(p.light,x,.3,0,.09,.4,.92);}}
    else if(kind==='dock'){
      for(let i=0;i<15;i++)box(i%3?p.wood:p.light,0,.28,-1.5+i*.22,1.7,.12,.19);for(const x of[-.78,.78])for(const z of[-1.4,0,1.4]){box(p.dark,x,.4,z,.15,1.2,.15);box(p.light,x,1.04,z,.22,.12,.22);}for(const x of[-.78,.78])box(0xc9bd91,x,.83,0,.045,.045,2.8);crates(.3,-.9,.35);
    }else if(kind==='keep'||kind==='hall'||kind==='tower'){
      addCivicArchitecture(kind,{box,palette:p,biome,tier,variant});group.userData.architecture={style:biome==='desert'?'oasis-citadel':biome==='ice'?'glacial-fortress':'medieval-citadel',facadeCount:4};
    }else{
      group.userData.architecture=addDwellingArchitecture(kind,{box,palette:p,biome,tier,variant});
    }
    for(const[geometries,surface,name]of[[parts,material,'masonry-timber'],[glassParts,glassMaterial,'deep-glazing'],[warmParts,warmMaterial,'warm-interiors']]as const){if(!geometries.length)continue;const geometry=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();owned.add(geometry);const mesh=new THREE.Mesh(geometry,surface);mesh.name=`${group.name}:${name}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    return group;
  }
  return{get(kind,biome,tier=1,variant=0){if(disposed)throw new Error('Biome settlement library disposed');const level=Math.max(1,Math.min(3,Math.floor(Number.isFinite(tier)?tier:1))),shape=Math.abs(Math.trunc(Number.isFinite(variant)?variant:0))%4,key=`${kind}:${biome}:${level}:${shape}`;let template=cache.get(key);if(!template){template=build(kind,biome,level,shape);cache.set(key,template);}return template.clone(true);},dispose(){if(disposed)return;disposed=true;cache.clear();owned.forEach(g=>g.dispose());owned.clear();cube.dispose();texture.dispose();material.dispose();glassMaterial.dispose();warmMaterial.dispose();worldAssets.dispose();}};
}
