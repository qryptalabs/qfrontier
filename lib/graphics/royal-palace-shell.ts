import * as THREE from 'three';
import {royalPalaceShellVoids} from './royal-palace-structure.ts';

/** Subtract bounded room volumes from the old exterior's internal masonry.
 * Preserve all exterior triangles outside the actual public rooms. */
export function openRoyalPalaceShell(castle:THREE.Group,extraVoids:ReturnType<typeof royalPalaceShellVoids>=[]){
 const voids=[...royalPalaceShellVoids(),...extraVoids],owned:THREE.BufferGeometry[]=[];
 castle.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
  const source=object.geometry as THREE.BufferGeometry,g=source.index?source.toNonIndexed():source;
  const names=Object.keys(g.attributes),sizes=names.map(n=>g.getAttribute(n).itemSize),attrs=names.map(n=>g.getAttribute(n)),stride=sizes.reduce((a,b)=>a+b,0),positions=g.getAttribute('position'),output:number[]=[];
  const emit=(poly:number[][])=>{for(let i=1;i<poly.length-1;i++)output.push(...poly[0],...poly[i],...poly[i+1]);};
  for(let start=0;start<positions.count;start+=3){
   let polys:number[][][]=[Array.from({length:3},(_,i)=>attrs.flatMap((a,k)=>Array.from({length:sizes[k]},(_,j)=>Number(a.array[(start+i)*sizes[k]+j]))))];
   for(const v of voids){
    const next:number[][][]=[];
    for(const poly of polys){
     const axes=[[0,v.minX,v.maxX],[1,v.minY,v.maxY],[2,v.minZ,v.maxZ]];
     if(axes.some(([axis,min,max])=>poly.every(p=>p[axis]<min-1e-6)||poly.every(p=>p[axis]>max+1e-6))){next.push(poly);continue;}
     let remaining=poly;
     for(const [axis,sign,c]of[[0,-1,-v.minX],[0,1,v.maxX],[1,-1,-v.minY],[1,1,v.maxY],[2,-1,-v.minZ],[2,1,v.maxZ]]){
      if(remaining.length<3)break;const inside:number[][]=[],outside:number[][]=[];
      for(let i=0;i<remaining.length;i++){const a=remaining[i],b=remaining[(i+1)%remaining.length],da=a[axis]*sign-c,db=b[axis]*sign-c,ai=da<=0,bi=db<=0;(ai?inside:outside).push(a);if(ai!==bi){const t=da/(da-db),p=a.map((n,k)=>n+(b[k]-n)*t);inside.push(p);outside.push(p);}}
      if(outside.length>=3)next.push(outside);remaining=inside;
     }
    }
    polys=next;if(!polys.length)break;
   }
   polys.forEach(emit);
  }
  const geometry=new THREE.BufferGeometry();let offset=0;for(let k=0;k<names.length;k++){const size=sizes[k],data=new Float32Array(output.length/stride*size);for(let i=0;i<output.length/stride;i++)for(let j=0;j<size;j++)data[i*size+j]=output[i*stride+offset+j];geometry.setAttribute(names[k],new THREE.BufferAttribute(data,size));offset+=size;}
  geometry.normalizeNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();object.geometry=geometry;owned.push(geometry);if(g!==source)g.dispose();
 });
 return owned;
}
