import * as THREE from 'three';
import {EXPLORATION_NETWORK,EXPLORATION_PUBLIC_BRIDGES,EXPLORATION_PUBLIC_LANDINGS,EXPLORATION_PUBLIC_RAMPS,publicInfrastructureAt,type NetworkPoint} from '../mvp/exploration-network-data.ts';
import {sampleWorld} from './world-geography.ts';
import {terrainRampsForChunk,clipTerrainRampFace,type TerrainVertex} from './terrain-ramps.ts';

interface Segment {id:string;a:NetworkPoint;b:NetworkPoint;width:number;deckHeight?:number;fromHeight?:number;toHeight?:number}
interface InfrastructureIndex {roads:Segment[];decks:Segment[]}
const index=new Map<string,InfrastructureIndex>();
function add(segment:Segment,deck:boolean){
  for(let cx=Math.floor((Math.min(segment.a.x,segment.b.x)-segment.width)/64);cx<=Math.floor((Math.max(segment.a.x,segment.b.x)+segment.width)/64);cx++)for(let cy=Math.floor((Math.min(segment.a.y,segment.b.y)-segment.width)/64);cy<=Math.floor((Math.max(segment.a.y,segment.b.y)+segment.width)/64);cy++){
    const key=`${cx}:${cy}`,cell=index.get(key)??{roads:[],decks:[]};(deck?cell.decks:cell.roads).push(segment);index.set(key,cell);
  }
}
for(const bridge of EXPLORATION_PUBLIC_BRIDGES)add({...bridge},true);
for(const landing of EXPLORATION_PUBLIC_LANDINGS)add({id:landing.id,a:landing.land,b:landing.end??landing.water,width:landing.width,deckHeight:landing.deckHeight},true);
for(const ramp of EXPLORATION_PUBLIC_RAMPS)add({...ramp,deckHeight:ramp.fromHeight},true);
for(const edge of EXPLORATION_NETWORK.edges)if(edge.mode==='carriage'||edge.road)for(let i=1;i<edge.points.length;i++)add({id:`${edge.id}:${i}`,a:edge.points[i-1],b:edge.points[i],width:3},false);

/** Static public routes only: no inventory, accounts, private plots or extra render loop. */
export function createExplorationInfrastructureChunk(cx:number,cy:number,heightAt:(x:number,y:number)=>number,shadows=true){
  const group=new THREE.Group();group.name='public-travel-infrastructure';const data=index.get(`${cx}:${cy}`),ramps=terrainRampsForChunk(cx,cy),cube=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({roughness:.94,flatShading:true}),matrix=new THREE.Object3D(),parts:{matrix:THREE.Matrix4;color:THREE.Color}[]=[],roadVertices:number[]=[],roadColors:number[]=[],deckVertices:number[]=[],deckColors:number[]=[];
  const belongs=(x:number,y:number)=>Math.floor(x/64)===cx&&Math.floor(y/64)===cy;
  const box=(x:number,y:number,z:number,width:number,height:number,depth:number,color:number,yaw=0,pitch=0)=>{matrix.position.set(x-cx*64,y,z-cy*64);matrix.scale.set(width,height,depth);matrix.rotation.set(pitch,yaw,0,'YXZ');matrix.updateMatrix();parts.push({matrix:matrix.matrix.clone(),color:new THREE.Color(color)});};
  for(const segment of data?.roads??[]){
    const length=Math.hypot(segment.b.x-segment.a.x,segment.b.y-segment.a.y),steps=Math.max(1,Math.ceil(length/1.5)),yaw=Math.atan2(segment.b.x-segment.a.x,segment.b.y-segment.a.y);
    for(let i=0;i<steps;i++){const t=(i+.5)/steps,x=segment.a.x+(segment.b.x-segment.a.x)*t,y=segment.a.y+(segment.b.y-segment.a.y)*t;if(!belongs(x,y)||sampleWorld(x,y).water||publicInfrastructureAt({x,y}))continue;const ground=heightAt(x,y)+.015,biome=sampleWorld(x,y).biome,color=new THREE.Color(biome==='ice'?0xb8c8c8:biome==='desert'?0xc3aa7b:0xac9566),w=segment.width/2,d=(length/steps+.03)/2,c=Math.cos(yaw),s=Math.sin(yaw),face:TerrainVertex[]=[[-w,-d],[-w,d],[w,d],[w,-d]].map(([dx,dy])=>[x+dx*c+dy*s,ground,y-dx*s+dy*c]);for(const piece of clipTerrainRampFace(face,ramps))for(let j=1;j<piece.length-1;j++)for(const point of[piece[0],piece[j],piece[j+1]]){roadVertices.push(point[0]-cx*64,point[1],point[2]-cy*64);roadColors.push(color.r,color.g,color.b);}}
  }
  for(const segment of data?.decks??[]){
    const length=Math.hypot(segment.b.x-segment.a.x,segment.b.y-segment.a.y),steps=Math.max(1,Math.ceil(length/.75)),yaw=Math.atan2(segment.b.x-segment.a.x,segment.b.y-segment.a.y),rise=(segment.toHeight??segment.deckHeight!)-(segment.fromHeight??segment.deckHeight!),pitch=-Math.atan2(rise,length),normal={x:Math.sin(yaw)*Math.sin(pitch),y:Math.cos(pitch),z:Math.cos(yaw)*Math.sin(pitch)};
    for(let i=0;i<steps;i++){const t=(i+.5)/steps,x=segment.a.x+(segment.b.x-segment.a.x)*t,y=segment.a.y+(segment.b.y-segment.a.y)*t,top=segment.deckHeight!+rise*t;if(!belongs(x,y))continue;const shade=i%3?0x9b724b:0xb28b58;box(x-normal.x*.0901,top-normal.y*.0901,y-normal.z*.0901,segment.width,.18,Math.hypot(length/steps,rise/steps),shade,yaw,pitch);
      // Shared endpoint coordinates seal subpixel cracks between instance transforms without extending the deck footprint.
      const color=new THREE.Color(shade),c=Math.cos(yaw),s=Math.sin(yaw),face:TerrainVertex[]=[[-1,i/steps],[-1,(i+1)/steps],[1,(i+1)/steps],[1,i/steps]].map(([side,fraction])=>[segment.a.x+(segment.b.x-segment.a.x)*fraction+side*segment.width/2*c,segment.deckHeight!+rise*fraction,segment.a.y+(segment.b.y-segment.a.y)*fraction-side*segment.width/2*s]);for(const v of[face[0],face[1],face[2],face[0],face[2],face[3]]){deckVertices.push(v[0]-cx*64,v[1],v[2]-cy*64);deckColors.push(color.r,color.g,color.b);}
      if(i%5===0)for(const side of[-1,1]){const px=x+Math.cos(yaw)*side*segment.width*.36,py=y-Math.sin(yaw)*side*segment.width*.36,bottom=Math.min(top-.3,sampleWorld(px,py).waterLevel-1.6),height=top-bottom;box(px,bottom+height/2,py,.22,height,.22,0x71513b);}
    }
  }
  const roadGeometry=new THREE.BufferGeometry(),deckGeometry=new THREE.BufferGeometry(),roadMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,flatShading:true});for(const[positions,colors,geometry,name]of[[roadVertices,roadColors,roadGeometry,'public-road-surfaces'],[deckVertices,deckColors,deckGeometry,'public-deck-surfaces']]as const)if(positions.length){geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,roadMaterial);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);}
  let mesh:THREE.InstancedMesh|undefined;if(parts.length){mesh=new THREE.InstancedMesh(cube,material,parts.length);parts.forEach((part,i)=>{mesh!.setMatrixAt(i,part.matrix);mesh!.setColorAt(i,part.color);});mesh.castShadow=shadows;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
  let disposed=false;return{group,dispose(){if(disposed)return;disposed=true;mesh?.dispose();roadGeometry.dispose();deckGeometry.dispose();roadMaterial.dispose();cube.dispose();material.dispose();group.clear();}};
}
