import {EXPLORATION_PUBLIC_RAMPS} from '../mvp/exploration-network-data.ts';

export interface TerrainRamp {id:string;a:{x:number;y:number};b:{x:number;y:number};width:number;fromHeight:number;toHeight:number}
export type TerrainVertex=readonly[number,number,number];
type Plane=(p:TerrainVertex)=>number;
const prepared=new WeakMap<TerrainRamp,{planes:readonly Plane[];minX:number;maxX:number;minZ:number;maxZ:number;minHeight:number}>();
const buckets=new Map<string,TerrainRamp[]>();
for(const ramp of EXPLORATION_PUBLIC_RAMPS){const pad=ramp.width/2+.02;for(let x=Math.floor((Math.min(ramp.a.x,ramp.b.x)-pad)/64);x<=Math.floor((Math.max(ramp.a.x,ramp.b.x)+pad)/64);x++)for(let y=Math.floor((Math.min(ramp.a.y,ramp.b.y)-pad)/64);y<=Math.floor((Math.max(ramp.a.y,ramp.b.y)+pad)/64);y++){const key=`${x}:${y}`,entries=buckets.get(key)??[];entries.push(ramp);buckets.set(key,entries);}}
export function terrainRampsForChunk(cx:number,cy:number):readonly TerrainRamp[]{return buckets.get(`${cx}:${cy}`)??[];}

function clip(polygon:readonly TerrainVertex[],plane:Plane,inside:boolean):TerrainVertex[]{
  const result:TerrainVertex[]=[];if(!polygon.length)return result;let a=polygon.at(-1)!,da=plane(a),aIn=inside?da>=0:da<=0;
  for(const b of polygon){const db=plane(b),bIn=inside?db>=0:db<=0;if(aIn!==bIn){const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}if(bIn)result.push(b);a=b;da=db;aIn=bIn;}
  return result;
}
function hasArea(polygon:readonly TerrainVertex[]):boolean{if(polygon.length<3)return false;const a=polygon[0];for(let i=1;i<polygon.length-1;i++){const b=polygon[i],c=polygon[i+1],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-8)return true;}return false;}

/** Remove only voxel faces above an explicit public ramp, including overhanging cliff faces. */
export function clipTerrainRampFace(face:readonly TerrainVertex[],ramps:readonly TerrainRamp[]):readonly(readonly TerrainVertex[])[]{
  if(!ramps.length)return[face];let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,maxHeight=-Infinity;for(const p of face){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);maxHeight=Math.max(maxHeight,p[1]);}
  let pieces:readonly(readonly TerrainVertex[])[]=[face];
  for(const ramp of ramps){let data=prepared.get(ramp);if(!data){const dx=ramp.b.x-ramp.a.x,dz=ramp.b.y-ramp.a.y,length=Math.hypot(dx,dz);if(length<1e-6)continue;const tx=dx/length,tz=dz/length,half=ramp.width/2+.002,grade=(ramp.toHeight-ramp.fromHeight)/length,u=(p:TerrainVertex)=>(p[0]-ramp.a.x)*tx+(p[2]-ramp.a.y)*tz,v=(p:TerrainVertex)=>-(p[0]-ramp.a.x)*tz+(p[2]-ramp.a.y)*tx;data={planes:[u,p=>length-u(p),p=>half-v(p),p=>half+v(p),p=>p[1]-ramp.fromHeight-grade*u(p)+.002],minX:Math.min(ramp.a.x,ramp.b.x)-half,maxX:Math.max(ramp.a.x,ramp.b.x)+half,minZ:Math.min(ramp.a.y,ramp.b.y)-half,maxZ:Math.max(ramp.a.y,ramp.b.y)+half,minHeight:Math.min(ramp.fromHeight,ramp.toHeight)-.002};prepared.set(ramp,data);}
    if(maxX<data.minX||minX>data.maxX||maxZ<data.minZ||minZ>data.maxZ||maxHeight<data.minHeight)continue;const planes=data.planes,next:TerrainVertex[][]=[];
    for(const piece of pieces){if(planes.some(plane=>piece.every(p=>plane(p)<=0))){next.push([...piece]);continue;}let remainder:readonly TerrainVertex[]=piece;for(const plane of planes){const outside=clip(remainder,plane,false);if(hasArea(outside))next.push(outside);remainder=clip(remainder,plane,true);if(!hasArea(remainder))break;}}
    pieces=next;if(!pieces.length)break;
  }
  return pieces;
}
