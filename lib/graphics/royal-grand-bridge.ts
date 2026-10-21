import * as THREE from 'three';
import {createRoyalArchBridge} from './royal-harbor-castle.ts';
import {ROYAL_GRAND_BRIDGE as B,royalBridgeDeck} from './royal-canal-layout.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';

/** One hollow seven-arch bridge, supported abutments, continuous ramps and
 * parapets. The old low bridges are removed rather than hidden beneath it. */
export function createRoyalGrandBridge(ground:(x:number,z:number)=>number){
 const group=new THREE.Group();group.name='royal-grand-seven-arch-bridge';
 const arches=createRoyalArchBridge(169),cutGeometries:THREE.BufferGeometry[]=[];
 // Keep every arch opening intact, while reducing the solid spandrel above it.
 // The lower crown is unchanged, so the Tripo ship retains its mast clearance.
 arches.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const g=o.geometry.clone(),v=g.getAttribute('position'),nativeDeck=(B.deck-B.base)/B.scaleY,join=17,oldDeck=20;for(let i=0;i<v.count;i++){const y=v.getY(i);if(y>join)v.setY(i,y>=19.9?y-(oldDeck-nativeDeck):join+(y-join)*(nativeDeck-join)/(oldDeck-join));}v.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();o.geometry=g;cutGeometries.push(g);});
 arches.scale.set(B.scaleX,B.scaleY,B.scaleZ);arches.position.set(0,B.base,B.z);group.add(arches);
 const cube=new THREE.BoxGeometry(),stone=new THREE.MeshStandardMaterial({color:0xbeb99e,roughness:.93}),gold=new THREE.MeshStandardMaterial({color:0xc2a45e,metalness:.2,roughness:.5});applyRoyalSurfaceDetail(stone,'masonry');
 const batches=new Map<THREE.Material,THREE.Matrix4[]>(),obstacles:RoyalObstacle[]=[];
 const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{let a=batches.get(m);if(!a){a=[];batches.set(m,a);}a.push(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion(),new THREE.Vector3(w,h,d)));};
 // Short level abutments meet the two raised squares; roads descend around the town.
 const end=B.length/2;
 for(const sign of[-1,1])for(let x=end;x<B.rampEnd;x+=1){const next=Math.min(B.rampEnd,x+1),mx=(x+next)/2,top=royalBridgeDeck(sign*mx,B.z)!,bed=ground(sign*mx,B.z);box(stone,sign*mx,(top+Math.min(bed,top-.2))/2,B.z,next-x+.02,Math.max(.2,top-bed),B.width);
  if(mx<108)for(const side of[-1,1]){box(stone,sign*mx,top+.6,B.z+side*(B.width/2-.16),next-x+.02,1.2,.32);box(gold,sign*mx,top+1.25,B.z+side*(B.width/2-.16),next-x+.02,.08,.37);obstacles.push({x:sign*mx,z:B.z+side*B.width/2,halfWidth:(next-x)/2+.01,halfDepth:.15,minY:top,maxY:top+1.4});}}
 box(stone,0,B.deck-.08,B.z,B.length,.16,B.width-.5);
 for(const side of[-1,1])obstacles.push({x:0,z:B.z+side*B.width/2,halfWidth:end,halfDepth:.18,minY:B.deck,maxY:B.deck+2});
 const meshes:THREE.InstancedMesh[]=[];for(const [material,transforms]of batches){const mesh=new THREE.InstancedMesh(cube,material,transforms.length);transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);}
 group.userData.royalBridge={...B,oneCrossing:true,navigable:true};
 return{group,obstacles,dispose(){group.removeFromParent();meshes.forEach(m=>m.dispose());cutGeometries.forEach(g=>g.dispose());cube.dispose();stone.dispose();gold.dispose();group.clear();}};
}
