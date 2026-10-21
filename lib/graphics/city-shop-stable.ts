import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {finishVoxelMaterial} from './tripo-voxel-pilot.ts';
import {CITY_STABLE as S,stableInside} from './city-shop-stable-layout.ts';

/** One near-only Tripo roof and attic. Doors, walls and fittings remain authored,
 * so decorative AI geometry cannot block the existing collection service. */
export function createCityStable(){
 const group=new THREE.Group(),fallback=new THREE.Group(),fallbackRoof=new THREE.Group(),fittings=new THREE.Group(),detailed=new THREE.Group();
 group.name='corona-del-alba-stable-and-coach-house';group.add(fallback,fallbackRoof,fittings,detailed);
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),cube=new THREE.BoxGeometry();geometry.add(cube);
 const material=(color:number,kind?:'wood'|'masonry')=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88});materials.add(m);if(kind)applyRoyalSurfaceDetail(m,kind);return m;};
 const oak=material(0x725033,'wood'),timber=material(0x442f24,'wood'),stone=material(0xbab29a,'masonry'),cream=material(0xd6c79e),tile=material(0xa55132),gold=material(0xcda65c),iron=material(0x343e3c),hay=material(0xb5a254),blue=material(0x264f60);
 const batches=new Map<THREE.Group,Map<THREE.Material,THREE.BufferGeometry[]>>();
 function box(target:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,rx=0){
  const g=cube.clone();g.scale(w,h,d);g.rotateX(rx);g.translate(x,y,z);let byMaterial=batches.get(target);if(!byMaterial){byMaterial=new Map();batches.set(target,byMaterial);}const parts=byMaterial.get(m)??[];parts.push(g);byMaterial.set(m,parts);
 }
 const y=S.y;
 box(fittings,stone,-123,y-.06,149.8,24,.12,8);
 // The fallback uses exactly the same openings as the prepared model.
 for(const x of[-135,-111]){box(fallback,stone,x,y+.5,149.8,.45,1,8);box(fallback,cream,x,y+2.5,149.8,.35,3,8);}
 box(fallback,stone,-123,y+.5,145.8,24,1,.45);box(fallback,cream,-123,y+2.5,145.8,24,3,.35);
 for(const x of[-135,-128,-111]){box(fallback,timber,x,y+2.2,153.8,.34,4.4,.34);box(fallback,stone,x,y+.18,153.8,.55,.36,.55);}
 for(const z of[145.8,149.8,153.8])box(fallback,timber,-123,y+4.38,z,24.5,.32,.3);
 for(const side of[-1,1])box(fallbackRoof,tile,-123,y+5.5,149.8+side*2.15,25.2,.28,4.9,side*.49);
 box(fallbackRoof,timber,-123,y+6.62,149.8,25.4,.2,.25);
 for(let x=-135;x<=-111;x+=1.2)for(const side of[-1,1])box(fallbackRoof,oak,x,y+4.5,149.8+side*4.15,.13,.2,.85);
 // A separate, fully open pair of carriage doors against the side jambs.
 for(const x of[-127.9,-111.15]){
  box(fittings,oak,x,y+1.45,152.55,.13,2.9,2.3);
  for(const h of[.3,2.55])box(fittings,iron,x,y+h,152.55,.2,.09,2.05);
  for(const z of[151.8,152.5,153.3])box(fittings,oak,x,y+1.45,z,.19,2.78,.07);
 }
 // Divider rails, hay racks, saddles, tools and a stone water trough.
 for(const h of[.48,1.18])box(fittings,oak,-128,y+h,149.4,.15,.13,5.4);
 for(const z of[147,149.5,151.9])box(fittings,timber,-128,y+.65,z,.18,1.3,.18);
 box(fittings,stone,-134,y+.31,149.1,.65,.62,3.2);box(fittings,iron,-134,y+.58,149.1,.49,.13,2.98);
 const waterMaterial=new THREE.MeshStandardMaterial({color:0x4f9baf,roughness:.24,metalness:.12});materials.add(waterMaterial);
 const water=new THREE.Mesh(new THREE.PlaneGeometry(.45,2.92),waterMaterial);geometry.add(water.geometry);water.name='stable-water-trough';water.rotation.x=-Math.PI/2;water.position.set(-134,y+.665,149.1);fittings.add(water);
 box(fittings,oak,-131.4,y+.35,146.55,3.8,.7,.7);box(fittings,hay,-131.4,y+.73,146.55,3.5,.38,.6);
 for(let x=-132.9;x<-129.6;x+=.35)box(fittings,timber,x,y+.57,147,.06,1,.07);
 for(let i=0;i<3;i++){box(fittings,hay,-114.1+i*.9,y+.4,146.55,.85,.8,.65);box(fittings,timber,-114.1+i*.9,y+.4,146.9,.08,.82,.04);}
 for(const x of[-126,-122,-118]){box(fittings,oak,x,y+2.2,146.1,.35,.12,.4);box(fittings,iron,x,y+2,146.3,.1,.4,.08);}
 // Warm lanterns are emissive surfaces: no extra shadow render passes.
 const glow=new THREE.MeshStandardMaterial({color:0xffce72,emissive:0xffb342,emissiveIntensity:.7,roughness:.7});materials.add(glow);
 for(const x of[-134.3,-127.2,-111.7]){box(fittings,iron,x,y+3.65,154.08,.08,.6,.08);box(fittings,glow,x,y+3.18,154.08,.26,.38,.26);for(const h of[2.95,3.4])box(fittings,iron,x,y+h,154.08,.38,.1,.38);}
 // A physical sign, with a pictogram plus readable text generated locally.
 box(fittings,timber,-119.9,y+4.35,154.06,8,.85,.16);box(fittings,gold,-119.9,y+4.8,154.06,8.15,.08,.2);
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const ctx=canvas.getContext('2d');
  if(ctx){ctx.fillStyle='#263e3b';ctx.fillRect(0,0,1024,160);ctx.strokeStyle='#d3b675';ctx.lineWidth=6;ctx.strokeRect(7,7,1010,146);ctx.fillStyle='#eedbb0';ctx.textAlign='center';ctx.font='bold 60px Georgia';ctx.fillText('CABALLERIZAS DEL ALBA',540,72);ctx.font='26px Georgia';ctx.fillText('ESTABLO · COCHERA',540,120);ctx.strokeStyle='#d3b675';ctx.lineWidth=7;ctx.beginPath();ctx.arc(66,91,30,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(66,91);ctx.lineTo(66+29*Math.cos(i*Math.PI/4),91+29*Math.sin(i*Math.PI/4));ctx.stroke();}ctx.fillRect(35,33,43,12);ctx.fillRect(65,22,13,30);ctx.fillRect(72,18,19,12);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);const m=new THREE.MeshBasicMaterial({map:texture});materials.add(m);const g=new THREE.PlaneGeometry(7.8,1.22);geometry.add(g);const sign=new THREE.Mesh(g,m);sign.name='stable-identification-horse-and-wheel';sign.position.set(-119.9,y+4.32,154.16);fittings.add(sign);
  }
 }
 for(const[target,byMaterial]of batches)for(const[m,parts]of byMaterial){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometry.add(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;target.add(mesh);}
 let disposed=false,loading=false,ready=false,near=false,inside=false;const sourceGeometry=new Set<THREE.BufferGeometry>(),sourceMaterials=new Set<THREE.Material>(),sourceTextures=new Set<THREE.Texture>();
 group.userData.stable={status:'idle',units:'metres',width:S.width,depth:S.depth,height:S.height};
 function visibility(){fallback.visible=true;fallbackRoof.visible=(!ready||!near)&&!inside;detailed.visible=ready&&near&&!inside;}
 function release(){sourceGeometry.forEach(g=>g.dispose());sourceMaterials.forEach(m=>m.dispose());sourceTextures.forEach(t=>t.dispose());sourceGeometry.clear();sourceMaterials.clear();sourceTextures.clear();detailed.clear();}
 async function load(){
  if(loading||disposed||typeof window==='undefined')return;loading=true;group.userData.stable.status='loading';
  try{
   const{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const model=(await new GLTFLoader().loadAsync('/models/tripo-v1/stable.glb')).scene;let triangles=0,meshes=0;
   model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;meshes++;sourceGeometry.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){sourceMaterials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)sourceTextures.add(v);}o.castShadow=true;o.receiveShadow=true;});
   if(disposed){release();return;}if(triangles>15000||meshes>3)throw Error('Stable asset exceeds the web budget');
   sourceTextures.forEach(t=>{t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.anisotropy=1;t.needsUpdate=true;});sourceMaterials.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial){finishVoxelMaterial(m,false);m.side=THREE.DoubleSide;}});
   model.position.set(S.x,S.y,S.z);detailed.add(model);ready=true;group.userData.stable={...group.userData.stable,status:'ready',triangles};visibility();
  }catch{release();if(!disposed){group.userData.stable.status='fallback';visibility();}}
 }
 return{group,setFocus(x:number,y:number,z:number){near=Math.hypot(x-S.x,z-S.z)<75;inside=stableInside(x,z)&&y<4.5;if(near)void load();visibility();},update(t:number,reduced=false){water.position.y=y+.665+(reduced?0:Math.sin(t*1.8)*.008);},dispose(){if(disposed)return;disposed=true;release();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.removeFromParent();group.clear();}};
}
