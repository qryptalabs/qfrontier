import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBiomeSettlementLibrary} from './biome-settlement-models.ts';
import {createRoyalCitadel,createRoyalArchBridge,disposeRoyalHarborCastleResources} from './royal-harbor-castle.ts';
import {createRoyalShipLibrary} from './royal-harbor-ships.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {createRoyalTownLibrary} from './royal-harbor-town.ts';
import {royalRiverEdge,type RoyalObstacle} from './royal-harbor-layout.ts';
import {ROYAL_CITADEL_TRANSFORM,ROYAL_CITADEL_COURT_Y,ROYAL_CITADEL_SIDE_CROSSING_Z,citadelWorldPoint} from './royal-citadel-layout.ts';
import {createRoyalCitadelGardens} from './royal-citadel-gardens.ts';
import {createRoyalCitadelTerraces} from './royal-citadel-terraces.ts';
import {createRoyalCitadelFlags} from './royal-citadel-flags.ts';
export {royalRiverEdge} from './royal-harbor-layout.ts';

/** An authored architectural district, deliberately independent of saved plots,
 * inventories, navigation surfaces and the simulation's fishing fleet. */
export const ROYAL_HARBOR = Object.freeze({name:'Corona del Alba',riverWidth:160,shipCount:7});
export type RoyalHarborView='harbor'|'castle'|'plaza'|'terraces'|'bridge'|'quays'|'aerial'|'old-town';
export const ROYAL_HARBOR_CAMERAS:Record<RoyalHarborView,{position:[number,number,number];target:[number,number,number]}>= {
 'old-town':{position:[138,65,285],target:[84,3,190]},
 harbor:{position:[700,1350,6800],target:[0,2000,-2500]},
 castle:{position:[-5400,2800,1700],target:[0,2050,-3700]},
 plaza:{position:[1350,2850,-900],target:[0,560,-2070]},
 terraces:{position:[4800,2800,4200],target:[0,1500,-2200]},
 bridge:{position:[78,34,18],target:[-3,24,-112]},
 quays:{position:[-30,23,286],target:[120,17,130]},
 aerial:{position:[5500,5000,4400],target:[0,1700,-2400]},
};

function random(seed:number){const v=Math.sin(seed*127.1+311.7)*43758.5453123;return v-Math.floor(v);}
function landscapeNoise(x:number,z:number){const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,a=u*u*(3-2*u),b=v*v*(3-2*v),r=(xx:number,zz:number)=>random(xx*31.7+zz*72.3);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(r(ix,iz),r(ix+1,iz),a),THREE.MathUtils.lerp(r(ix,iz+1),r(ix+1,iz+1),a),b);}
function mountainHeight(x:number,z:number){const back=Math.min(1,Math.max(0,(-z-6500)/9000)),ridge=Math.pow(1-Math.abs(landscapeNoise(x*.00038,z*.0004)*2-1),2),broken=landscapeNoise(x*.0027,z*.0024)*440+landscapeNoise(x*.008,z*.0075)*80;return 8+back*(1100+ridge*4300+broken);}

export function createRoyalHarborScene(){
 const group=new THREE.Group();group.name='corona-del-alba-authored-city';
 const library=createBiomeSettlementLibrary(),town=createRoyalTownLibrary(),ships=createRoyalShipLibrary(),ownedGeometry=new Set<THREE.BufferGeometry>(),ownedMaterials=new Set<THREE.Material>(),obstacles:RoyalObstacle[]=[];
 const parts:THREE.BufferGeometry[]=[],pavingParts:THREE.BufferGeometry[]=[];let activeParts=parts;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0),p=new THREE.Vector3(),s=new THREE.Vector3();
 const stone=0xb9b7a1,lightStone=0xd8cdb0,wood=0x79502e,lightWood=0xb08a50;
 const staticMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:.01});applyRoyalSurfaceDetail(staticMaterial,'landscape');ownedMaterials.add(staticMaterial);
 const cube=new THREE.BoxGeometry(1,1,1);
 function geometry(source:THREE.BufferGeometry,color:number,transform?:THREE.Matrix4){const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();if(transform)g.applyMatrix4(transform);const c=new THREE.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));activeParts.push(g);}
 function box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,yaw=0){matrix.compose(p.set(x,y,z),q.setFromAxisAngle(axis,yaw),s.set(w,h,d));geometry(cube.clone(),color,matrix);}
 function cylinder(x:number,y:number,z:number,r:number,h:number,color:number,segments=10){geometry(new THREE.CylinderGeometry(r,r,h,segments),color,new THREE.Matrix4().makeTranslation(x,y,z));}
 function plateau(points:[number,number][],bottom:number,top:number,color:number){const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:top-bottom,bevelEnabled:false,steps:1,curveSegments:1});g.rotateX(-Math.PI/2);g.translate(0,bottom,0);geometry(g,color);}
 function slab(x:number,z:number,w:number,d:number,y:number,color:number){box(x,y-.4,z,w,.8,d,color);}
 // The river continues out of the frame; neither bank has a floating map edge.
 for(const sign of[-1,1]){const edge:[number,number][]=[];for(let z=-125;z<=760;z+=15)edge.push([sign*royalRiverEdge(z),z]);plateau([...edge,[sign*12000,760],[sign*12000,-125]],-12,3.8,0x718047);}
 plateau([[-12000,-120],[12000,-120],[12000,-23000],[-12000,-23000]],-18,4,0x6f814f);
 // Broad, irregular terraces replace the previous repeated flat city grid.
 const terraces=[{z:-212,w:590,d:146,y:17},{z:-288,w:470,d:139,y:33},{z:-354,w:395,d:130,y:51}];
 for(const[t,index]of terraces.map((t,i)=>[t,i]as const)){
  plateau([[-t.w/2-9,t.z+t.d/2-10],[-t.w/2,t.z+t.d/2],[t.w/2-14,t.z+t.d/2],[t.w/2+13,t.z+t.d/2-18],[t.w/2,t.z-t.d/2],[-t.w/2+10,t.z-t.d/2]],3.8,t.y,stone);
  slab(0,t.z,t.w-7,t.d-10,t.y+.2,0x7f9656);
  const z=t.z+t.d/2+1;
  box(0,t.y+.9,z,t.w-12,1.8,2.1,lightStone);
  // Interrupted gardens and ascending streets soften the retaining terraces.
  for(const side of[-1,1])for(let step=0;step<22;step++)box(side*(t.w/2-34),t.y-14+step*.68,z+22-step*1.5,16,.7,1.7,step%3?lightStone:stone);
  for(let x=-t.w/2+4;x<t.w/2-2;x+=4.5)box(x,t.y+2.5,z,2.5,1.5,2.1,(Math.floor(x)%3)?stone:lightStone);
  for(let x=-t.w/2+7;x<t.w/2-4;x+=30){box(x,(t.y+4)/2,z,4,t.y-4,3.3,index%2?0xa7a594:0xb6b3a1);box(x,t.y+1,z,5.2,1.3,4.2,lightStone);}
 }
 // The precinct occupies a continuous hill foundation, rather than extending
 // into thin air beyond the former small palace platform.
 plateau([[-2300,-1269],[2300,-1269],[2370,-1700],[2300,-5400],[-2300,-5400],[-2370,-1700]],4,ROYAL_CITADEL_TRANSFORM.baseY,stone);
 const royalTerraces=createRoyalCitadelTerraces();group.add(royalTerraces.group);obstacles.push(...royalTerraces.obstacles);
 // City houses are instanced from four real, deeply modelled facades.
 type Instance={model:THREE.Group;matrices:THREE.Matrix4[]};const instances=new Map<string,Instance>();let houses=0,relocatedHomes=0;
 function building(x:number,y:number,z:number,scale:number,variant:number,kind:'home'|'warehouse'|'market'|'workshop'='home',yaw=0){
  if(Math.abs(x)<237&&z< -177||Math.abs(x)<28&&z< -120||z< -430||Math.abs(Math.abs(x)-122)<24&&z> -112&&z< -28){const n=relocatedHomes++;x=520+n%12*26;z=-160-Math.floor(n/12)*30;y=4.1;}
  const key=`${kind}:${variant%12}`;let instance=instances.get(key);if(!instance){instance={model:town.get(kind,variant),matrices:[]};instances.set(key,instance);}
  const size=scale*.42,transform=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(axis,yaw),new THREE.Vector3(size,size*(.93+(variant%3)*.08),size));instance.matrices.push(transform);houses++;
  if(y<6){const data=instance.model.userData.royalTown as {width:number;depth:number;height:number};const c=Math.abs(Math.cos(yaw)),sn=Math.abs(Math.sin(yaw));obstacles.push({x,z,halfWidth:(data.width*c+data.depth*sn)*size/2,halfDepth:(data.width*sn+data.depth*c)*size/2,minY:y,maxY:y+(data.height+3)*size*(.93+(variant%3)*.08)});}
 }
 // Lower harbor quarters, with clear open water between the two banks.
 for(const sign of[-1,1])for(let row=0;row<4;row++)for(let i=0;i<13;i++){
  const z=-78+i*31+random(i*11+row*37+sign)*5+row*3,x=sign*(royalRiverEdge(z)+36+row*24)+random(i*13+row)*3-1.5;
  // Leave both freight destinations and their connecting alleys unobstructed.
  if(sign>0&&row<2&&(Math.abs(z-220)<18||Math.abs(z-30)<18))continue;
  building(x,4.1,z,6.5+random(i+row*17)*1.5,i+row*3+(sign+1),row===0?(i%3===0?'workshop':i%3===1?'market':'home'):'home',(sign<0?Math.PI/2:-Math.PI/2)+(random(i*14+row)-.5)*.08);
 }
 for(let level=0;level<3;level++){
  const t=terraces[level];for(let row=0;row<2;row++)for(let i=0;i<14-level*3;i++){
   const count=14-level*3,x=(i-(count-1)/2)*23+(row%2?7:-2)+(random(i*17+row)-.5)*6,z=t.z+28-row*32+(random(i*11)-.5)*8-Math.pow(x/t.w,2)*35;
   if(level===2&&Math.abs(x)<85)continue;
   building(x,t.y+.6,z,6.7+random(i*9+row*7+level)*1.7,i+row+level,'home',Math.sin(i*2)*.05);
  }
 }
 for(const sign of[-1,1])for(let i=0;i<5;i++)building(sign*(112+i*24),4.2,-112-i*12,6.8,i+2,'home',sign*.2);
 // Shopfront pavilions and port warehouses are larger, with framed entrances.
 building(royalRiverEdge(220)+47,4.1,220,8.6,5,'warehouse',-Math.PI/2);
 building(royalRiverEdge(30)+47,4.1,30,8.2,2,'market',-Math.PI/2);
 for(let i=0;i<5;i++)building(-164+i*29,17.6,-152,7.5,i,'market');
 for(const{model,matrices}of instances.values()){
  model.updateMatrixWorld(true);model.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const mesh=new THREE.InstancedMesh(object.geometry,object.material,matrices.length);mesh.name=`royal-city-${model.name}`;matrices.forEach((m,i)=>mesh.setMatrixAt(i,m.clone().multiply(object.matrixWorld)));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);});
 }
 const citadel=createRoyalCitadel();citadel.scale.setScalar(ROYAL_CITADEL_TRANSFORM.scale);citadel.position.set(0,ROYAL_CITADEL_TRANSFORM.baseY,ROYAL_CITADEL_TRANSFORM.originZ);citadel.name='royal-citadel-on-the-fourth-terrace';group.add(citadel);
 const flags=createRoyalCitadelFlags();flags.group.scale.copy(citadel.scale);flags.group.position.copy(citadel.position);group.add(flags.group);
 const gardens=createRoyalCitadelGardens();group.add(gardens.group);
 for(const o of gardens.obstacles)obstacles.push({x:o.x,z:o.z,halfWidth:o.halfWidth,halfDepth:o.halfDepth,minY:o.y,maxY:o.y+o.height});
 for(const o of citadel.userData.royalCitadel.solidColliders??[]){const w=citadelWorldPoint(o.x,0,o.z);obstacles.push({x:w.x,z:w.z,halfWidth:o.halfWidth*ROYAL_CITADEL_TRANSFORM.scale,halfDepth:o.halfDepth*ROYAL_CITADEL_TRANSFORM.scale,minY:citadelWorldPoint(0,o.minY,0).y,maxY:citadelWorldPoint(0,o.maxY,0).y});}
 const bridge=createRoyalArchBridge(169);bridge.position.set(0,0,-88);bridge.name='great-seven-arch-harbor-bridge';group.add(bridge);
 for(const sign of[-1,1]){const gateTower=library.get('tower','forest',3,0);gateTower.scale.set(9,12,9);gateTower.position.set(sign*94,4,-104);group.add(gateTower);}
 // Second bridge and upper aqueduct: distinct crossings at distinct elevations.
 const upperBridge=createRoyalArchBridge(125);upperBridge.scale.set(.8,.75,.65);upperBridge.position.set(-223,17,-229);group.add(upperBridge);
 const aqueduct=createRoyalArchBridge(290);aqueduct.scale.set(1,1.2,.5);aqueduct.position.set(380,44,-610);group.add(aqueduct);
 const perimeterBridges:THREE.Group[]=[];
 for(const sign of[-1,1]){
  const crossing=createRoyalArchBridge(136);crossing.scale.set(10,10,10);crossing.position.set(sign*2770,ROYAL_CITADEL_COURT_Y-199.5,ROYAL_CITADEL_SIDE_CROSSING_Z);crossing.name=`royal-perimeter-bridge-${sign<0?'west':'east'}`;group.add(crossing);perimeterBridges.push(crossing);
  cylinder(sign*3570,(ROYAL_CITADEL_COURT_Y+4)/2,ROYAL_CITADEL_SIDE_CROSSING_Z,260,ROYAL_CITADEL_COURT_Y-4,stone,16);
  const fort=library.get('tower','forest',3,sign<0?1:2);fort.scale.set(26,100,26);fort.position.set(sign*3640,ROYAL_CITADEL_COURT_Y,ROYAL_CITADEL_SIDE_CROSSING_Z);fort.rotation.y=-sign*Math.PI/2;fort.name=`royal-detached-watch-fort-${sign}`;group.add(fort);
  fort.updateMatrixWorld(true);const solidFort=new THREE.Box3().setFromObject(fort,true),fortCenter=solidFort.getCenter(new THREE.Vector3()),fortSize=solidFort.getSize(new THREE.Vector3());obstacles.push({x:fortCenter.x,z:fortCenter.z,halfWidth:fortSize.x/2,halfDepth:fortSize.z/2,minY:solidFort.min.y,maxY:solidFort.max.y});
 }
 // Flanking royal halls and watchtowers extend the urban silhouette toward the
 // hills; the central palace remains the highest point of the city.
 for(const sign of[-1,1]){const tower=library.get('tower','forest',3,2);tower.scale.set(11,18,11);tower.position.set(sign*275,17,-155);group.add(tower);const hall=library.get('hall','forest',3,2);hall.scale.setScalar(14);hall.position.set(sign*330,4.2,-170);group.add(hall);}
 // Coastal retaining walls and timber piers with bracing and individually laid boards.
 for(const sign of[-1,1])for(let z=-70;z<360;z+=9){const x=sign*(royalRiverEdge(z)+1.1);box(x,1.8,z,4.8,5.8,8.85,stone);box(x,4.9,z,6.2,.6,8.9,lightStone);for(let row=0;row<3;row++)box(x-sign*2.5,.3+row*1.4,z+(row%2?2:-1),.2,1.1,3.8,row%2?lightStone:stone);}
 for(const sign of[-1,1])for(let i=0;i<7;i++){
  const z=i===4&&sign>0?220:15+i*49+(sign<0?9:0),x=sign*royalRiverEdge(z),length=i===4&&sign>0?28:21+(i%3)*6;
  for(let b=0;b<Math.ceil(length/.9);b++)box(x-sign*(b+.5)*.9,4.2,z,.84,.6,10.6,b%3?lightWood:wood);
  for(let b=0;b<3;b++)for(const side of[-1,1]){const px=x-sign*(b*length/2+.5),pz=z+side*4.5;box(px,1.2,pz,1.15,8.1,1.15,wood);box(px,5.5,pz,1.5,.6,1.5,lightWood);box(px,2.1,pz,1,.7,5,wood,.6*side);}
  for(let c=0;c<5;c++){const px=x-sign*(3+c%3*3),pz=z+(c%2?3.4:-3.4);box(px,5.6,pz,2.8,2.3,2.6,lightWood);box(px,5.7,pz,2.95,.2,2.7,wood);box(px,6.5,pz,3,.2,2.7,wood);}
 }
 // Stacked timber, roofed working sheds, quayside cargo and mooring bollards.
 for(const sign of[-1,1])for(let i=0;i<24;i++){
  const z=-55+i*16,x=sign*(royalRiverEdge(z)+1.2);cylinder(x,5.7,z,.65,1.8,0x474d49,8);
  if(i%3===0)for(let c=0;c<4;c++){const cx=sign*(royalRiverEdge(z)+24+c%2*2.6),cz=z+Math.floor(c/2)*3;box(cx,5+c%2,cz,2.4,2,2.5,lightWood);box(cx,5+c%2,cz,2.5,.2,2.6,wood);obstacles.push({x:cx,z:cz,halfWidth:1.3,halfDepth:1.35});}
 }
 for(let row=0;row<4;row++)for(let i=0;i<8-row;i++){const g=new THREE.CylinderGeometry(.65,.65,12,8);g.rotateZ(Math.PI/2);g.translate(142+i*.3,5+row*1.15,214+i*1.4+row*.6);geometry(g,row%2?wood:lightWood);}
 // Broad quay walks and cross streets establish the space between buildings.
 activeParts=pavingParts;
 // Physical approaches use the exact tread quantisation used by walking.
 // The bridge keeps its open arches; the processional avenue starts behind it.
 for(const sign of[-1,1]){
  slab(sign*100,-37,55,6,4.3,lightStone);
  slab(sign*105,-88,48,10,19.95,lightStone);
  for(let i=0;i<30;i++){const z=-40-(i+.5)*40/30,top=4.3+i/30*15.65;box(sign*122,(top+3.8)/2,z,10,top-3.8,40/30+.015,i%4?lightStone:stone);}
  slab(sign*122,-81.5,10,3,19.95,lightStone);
  slab(sign*2050,ROYAL_CITADEL_SIDE_CROSSING_Z,150,90,ROYAL_CITADEL_COURT_Y,lightStone);
 }
 box(0,(19.95+4)/2,-107,24,19.95-4,26,lightStone);
 slab(0,-93.5,24,1.4,19.95,lightStone);
 for(const sign of[-1,1])for(let z=-85;z<380;z+=4){box(sign*(royalRiverEdge(z)+13),4.05,z,20,.22,4.05,0xc2b69a);if(Math.abs(z-30)<2||Math.abs(z-220)<2)box(sign*(royalRiverEdge(z)+37),4.08,z,52,.25,10,0xb3a589);}
 // A connected stone promenade with joints, gutters and shop-side paving.
 for(const sign of[-1,1])for(let z=-70;z<350;z+=3.6){const edge=royalRiverEdge(z);for(let col=0;col<6;col++)box(sign*(edge+4.3+col*3.1),4.2,z+(col%2?1.7:0),2.94,.09,3.42,(col+Math.floor(z))%3?0xc8bea1:0xb2a78e);}
 activeParts=parts;
 // Working port furniture, lifting cranes and shaded market forecourts.
 for(const sign of[-1,1])for(const z of[52,150,292]){
  const x=sign*(royalRiverEdge(z)-1);box(x,9.5,z,1.3,11,1.3,wood);box(x-sign*5.8,14.7,z,14,1,1,lightWood);
  for(let j=0;j<12;j++)box(x-sign*j*.9,14.4-j*.46,z,.8,.8,.8,wood,.55*sign);
  cylinder(x-sign*11,9.3,z,.11,9,0xc0ae7a,6);box(x-sign*11,5.2,z,2,.5,2,wood);
  const base=new THREE.CylinderGeometry(3.3,3.9,1,12);base.translate(x,4.8,z);geometry(base,stone);
 }
 // Terraced farmland and timber windmills frame the eastern skyline.
 const mills:THREE.Group[]=[];
 for(let level=0;level<4;level++){
  const x=275+level*25,z=-80-level*60,y=5+level*6;box(x,y/2,z,145,y,49,0x817c53);slab(x,z,144,48,y+.5,0x849c4a);
  for(let row=0;row<12;row++){box(x-58+row*10,y+.9,z,5.8,.85,40,row%3?0xc5a340:0x849b40);for(let j=0;j<7;j++)box(x-58+row*10,y+1.4,z-17+j*5.5,.6,1.5,2.4,0xc8ab4c);}
  const mill=library.get('windmill','forest',3,level);mill.scale.setScalar(8);mill.position.set(x+46,y+1,z+8);mill.name='royal-terrace-windmill';group.add(mill);mills.push(mill);
 }
 // Waterwheel directly above the western cascade, with timber paddles and spokes.
 building(-151,5,171,10.5,0,'workshop',Math.PI/2);
 const wheel=new THREE.Group();wheel.name='harbor-waterwheel';wheel.position.set(-106,9,171);
 const wheelMaterial=new THREE.MeshStandardMaterial({color:wood,roughness:.85});ownedMaterials.add(wheelMaterial);
 const ringGeometry=new THREE.TorusGeometry(7,.65,5,32);ownedGeometry.add(ringGeometry);for(const z of[-2,2]){const ring=new THREE.Mesh(ringGeometry,wheelMaterial);ring.position.z=z;wheel.add(ring);}
 const paddleGeometry=new THREE.BoxGeometry(1.1,2.5,5);ownedGeometry.add(paddleGeometry);for(let i=0;i<20;i++){const a=i*Math.PI/10,paddle=new THREE.Mesh(paddleGeometry,wheelMaterial);paddle.position.set(Math.cos(a)*7,Math.sin(a)*7,0);paddle.rotation.z=a;wheel.add(paddle);}
 for(let i=0;i<8;i++){const spokeGeometry=new THREE.BoxGeometry(.5,14,1);ownedGeometry.add(spokeGeometry);const spoke=new THREE.Mesh(spokeGeometry,wheelMaterial);spoke.rotation.z=i*Math.PI/4;wheel.add(spoke);}wheel.rotation.y=Math.PI/2;group.add(wheel);
 // Distinct fir, broadleaf and cypress silhouettes share instanced batches.
 const foliageMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});ownedMaterials.add(foliageMat);
 const treeParts:THREE.BufferGeometry[]=[];
 function treePart(g:THREE.BufferGeometry,color:number){const c=new THREE.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));treeParts.push(g);}
 treePart(new THREE.CylinderGeometry(.4,.75,8,6).translate(0,4,0),0x635139);
 for(let i=0;i<7;i++){const g=new THREE.ConeGeometry(4.7-i*.52,5.8,9,2);for(let j=0;j<g.attributes.position.count;j++){const a=g.attributes.position;const y=a.getY(j);a.setY(j,y+(random(j*4+i)-.5)*.7);}g.computeVertexNormals();g.translate(0,5.2+i*1.8,0);treePart(g,[0x254d31,0x315b35,0x3f6b3a,0x527b40,0x426a36,0x5b8040,0x618a47][i]);}
 const treeGeometry=mergeGeometries(treeParts,false)!;treeParts.forEach(g=>g.dispose());ownedGeometry.add(treeGeometry);const trees:THREE.Matrix4[]=[];
 for(let i=0;i<3000;i++){
  const x=(random(i*3+19)-.5)*1550,z=random(i*5+7)*1070-790,insideTown=Math.abs(x)<225&&z>-410&&z<360,insideFields=x>210&&x<440&&z>-340&&z<0;
  if(insideTown||insideFields||Math.abs(x)<250&&z< -170&&z> -625||x>250&&x<480&&z< -325&&z> -495||z>-125&&Math.abs(x)<royalRiverEdge(z)+120)continue;
  const y=z< -500?mountainHeight(x,z):4;const scale=.65+random(i*17)*1.2;
  trees.push(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(axis,random(i)*6.28),new THREE.Vector3(scale,scale,scale)));
 }
 for(let i=0;i<30;i++){const x=(i%2?1:-1)*(109+i%4*18),z=-140+Math.floor(i/2)*28;trees.push(new THREE.Matrix4().makeTranslation(x,4,z));}
 // The expanded kingdom keeps a forested horizon at its actual scale; these
 // distant groves share the same GPU buffers as the port's nearby trees.
 for(let i=0;i<2600;i++){
  const x=(random(i*19+713)-.5)*16000,z=-300-random(i*13+881)*14000,ax=Math.abs(x);
  if(ax<3400&&z>=-650&&z<=-420||ax<3000&&z>=-1130&&z<=-920||ax<2550&&z>=-5500&&z<=-1230||ax<85&&z>=-1300&&z<=-120||Math.abs(z-ROYAL_CITADEL_SIDE_CROSSING_Z)<90&&ax<3950)continue;
  const scale=2+random(i*23)*3,y=z< -6500?mountainHeight(x,z):4;trees.push(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(axis,random(i*7)*6.28),new THREE.Vector3(scale,scale,scale)));
 }
 function addForestChunks(name:string,geometry:THREE.BufferGeometry,matrices:THREE.Matrix4[]){
  const forest=new THREE.Group();forest.name=name;const cells=new Map<string,THREE.Matrix4[]>();
  for(const transform of matrices){const e=transform.elements,key=`${Math.floor(e[12]/1600)}:${Math.floor(e[14]/1600)}`,list=cells.get(key)??[];list.push(transform);cells.set(key,list);}
  for(const[key,rows]of cells){const mesh=new THREE.InstancedMesh(geometry,foliageMat,rows.length);mesh.name=`${name}:${key}`;rows.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();forest.add(mesh);}
  forest.userData.treeCount=matrices.length;group.add(forest);
 }
 addForestChunks('harbor-conifer-forest',treeGeometry,trees);
 const broadParts:THREE.BufferGeometry[]=[];
 const broadPart=(g:THREE.BufferGeometry,color:number)=>{const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();const c=new THREE.Color(color),rgb=new Float32Array(flat.attributes.position.count*3);for(let i=0;i<rgb.length;i+=3)c.toArray(rgb,i);flat.setAttribute('color',new THREE.BufferAttribute(rgb,3));broadParts.push(flat);};
 broadPart(new THREE.CylinderGeometry(.65,1.2,10,7).translate(0,5,0),0x6c5537);
 for(let i=0;i<13;i++){const a=i*2.4,r=2+random(i)*3,g=new THREE.IcosahedronGeometry(2.8+random(i*7)*1.4,1);g.scale(1,.8,1);g.translate(Math.cos(a)*r,10+Math.sin(i)*2+random(i*3)*3,Math.sin(a)*r);broadPart(g,[0x456f34,0x65853d,0x7a9441,0x527b3a][i%4]);}
 const broadGeometry=mergeGeometries(broadParts,false)!;broadParts.forEach(g=>g.dispose());ownedGeometry.add(broadGeometry);const broadMatrices:THREE.Matrix4[]=[];
 for(let i=0;i<350;i++){const sign=i%2?1:-1,z=-410+random(i*9)*780,x=sign*(royalRiverEdge(z)+134+random(i*19)*180);if(x>235&&x<480&&z<0||Math.abs(x)<250&&z< -170)continue;const scale=.7+random(i*33)*.6;broadMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x,4,z),new THREE.Quaternion().setFromAxisAngle(axis,i*2.4),new THREE.Vector3(scale,scale,scale)));}
 for(let i=0;i<28;i++){const x=(i%2?1:-1)*(royalRiverEdge(i*13-50)+27),z=i*13-50;broadMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x,4,z),new THREE.Quaternion(),new THREE.Vector3(.45,.62,.45)));}
 addForestChunks('royal-riverside-mixed-canopy',broadGeometry,broadMatrices);
 // Mountain amphitheatre is continuous sculpted terrain, with snowy high ridges.
 const mountainGeometry=new THREE.PlaneGeometry(28000,16000,220,100);mountainGeometry.rotateX(-Math.PI/2);const vertices=mountainGeometry.getAttribute('position'),colors=new Float32Array(vertices.count*3),mountainColor=new THREE.Color();
 for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),z=vertices.getZ(i)-14500,noise=landscapeNoise(x*.008,z*.008);const y=mountainHeight(x,z);vertices.setXYZ(i,x,y,z);mountainColor.set(y>3600+noise*700?0xe9eee8:y>2300?0x9daca8:y>1300?0x758b76:0x56734a);mountainColor.multiplyScalar(.91+noise*.15);mountainColor.toArray(colors,i*3);}
 mountainGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));mountainGeometry.computeVertexNormals();const mountainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});applyRoyalSurfaceDetail(mountainMaterial,'landscape');ownedMaterials.add(mountainMaterial);const mountains=new THREE.Mesh(mountainGeometry,mountainMaterial);mountains.name='snow-mountain-amphitheatre';mountains.receiveShadow=true;ownedGeometry.add(mountainGeometry);group.add(mountains);
 // Weathered cliffs on the west, a stepped waterfall spilling to the river.
 for(let i=0;i<95;i++){const x=-298-random(i*2)*180,z=-211-random(i*3)*260,h=28+random(i*11)*100;if(Math.abs(z-ROYAL_CITADEL_SIDE_CROSSING_Z)<40&&x> -420)continue;const g=new THREE.BoxGeometry(1,1,1,2,3,2);matrix.compose(p.set(x,h*.42,z),q.setFromEuler(new THREE.Euler(random(i)*.1,random(i*2)*.3,.025)),s.set(17+random(i)*24,h*.8,18+random(i*7)*25));geometry(g,i%3?0x92998a:0xb7b9a3,matrix);box(x,h*.86,z,18,1.3,19,0x668149);}
 const waterfallMaterial=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float time;void main(){float stripe=sin(vUv.x*97.+sin(vUv.y*9.-time*2.)*2.)*.5+.5;float stream=sin(vUv.y*83.-time*6.+vUv.x*7.)*.5+.5;vec3 c=mix(vec3(.18,.57,.65),vec3(.92,.98,.95),stripe*.45+stream*.24);gl_FragColor=vec4(c,.7+stripe*.25);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});ownedMaterials.add(waterfallMaterial);
 const falls:THREE.Mesh[]=[];
 for(const [x,y,z,w,h]of[[-314,56,-225,24,94],[-287,22,-207,18,28],[-101,6,168,12,10]]as const){const g=new THREE.PlaneGeometry(w,h,4,12),mesh=new THREE.Mesh(g,waterfallMaterial);mesh.position.set(x,y,z);mesh.rotation.y=x<-200?.16:Math.PI/2;mesh.name='flowing-waterfall';ownedGeometry.add(g);group.add(mesh);falls.push(mesh);}
 // Actual large sailing vessels; no scaling of the simulated fishing boats.
 const fleet:THREE.Group[]=[];const shipPlacements=[[-39,331,1.92,-.55],[42,345,.45,.08],[69,171,1.55,-.12],[62,80,1.25,-.12],[55,-2,.9,-.08],[-53,35,.55,Math.PI*.92],[-26,-23,.32,.1]];
 shipPlacements.forEach(([x,z,scale,yaw],i)=>{const vessel=ships.create({scale,variant:i%3});vessel.position.set(x,0,z);vessel.rotation.y=yaw;vessel.name=`royal-harbor-galleon-${i+1}`;group.add(vessel);fleet.push(vessel);});
 // Merge the many small masonry, timber and cargo details once, not per frame.
 const staticGeometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());ownedGeometry.add(staticGeometry);const masonry=new THREE.Mesh(staticGeometry,staticMaterial);masonry.name='royal-quays-terraces-and-port-cargo';masonry.castShadow=true;masonry.receiveShadow=true;group.add(masonry);cube.dispose();group.updateMatrixWorld(true);
 const pavingGeometry=mergeGeometries(pavingParts,false)!;pavingParts.forEach(g=>g.dispose());ownedGeometry.add(pavingGeometry);const pavingMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});ownedMaterials.add(pavingMaterial);const paving=new THREE.Mesh(pavingGeometry,pavingMaterial);paving.name='royal-connected-stone-promenade';paving.receiveShadow=true;group.add(paving);
 const finishedMaterials=new Set<THREE.MeshStandardMaterial>();for(const monument of[citadel,bridge,upperBridge,aqueduct,...perimeterBridges])monument.traverse(object=>{if(object instanceof THREE.Mesh&&object.name.endsWith(':stone')){const material=object.material as THREE.MeshStandardMaterial;if(!finishedMaterials.has(material)){finishedMaterials.add(material);applyRoyalSurfaceDetail(material,'masonry');}}});
 group.userData.royalHarbor={buildings:houses,ships:fleet.length,trees:trees.length,simulation:false};let disposed=false;
 return{group,obstacles,metrics:{buildings:houses,ships:fleet.length,trees:trees.length+broadMatrices.length},animate(seconds:number){if(disposed)return;flags.update(seconds);gardens.update(seconds);waterfallMaterial.uniforms.time.value=seconds%4096;wheel.rotation.z=seconds*.18;for(const mill of mills)mill.traverse(object=>{if(object.name==='windmill-rotor')object.rotation.z=seconds*.35;});fleet.forEach((vessel,i)=>{vessel.position.y=Math.sin(seconds*.7+i*1.7)*.12;vessel.rotation.z=Math.sin(seconds*.43+i)*.006;});},dispose(){if(disposed)return;disposed=true;group.removeFromParent();gardens.dispose();flags.dispose();royalTerraces.dispose();group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});ownedGeometry.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());ships.dispose();town.dispose();library.dispose();disposeRoyalHarborCastleResources();}};
}
