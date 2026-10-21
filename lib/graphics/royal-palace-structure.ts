import {HUMAN_ROOMS,HUMAN_INTERIOR_STAIRS as S,HUMAN_TOWER as T,ROYAL_PORT_OFFSET,ROYAL_CASTLE_SCALE,ROYAL_CASTLE_BASE} from './royal-proportions.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';

export type PalaceBox=RoyalObstacle&{id:string;y:number;height:number;finish:'wall'|'floor'|'ceiling'|'step'};
const rect=(x:number,z:number,r:{minX:number;maxX:number;minZ:number;maxZ:number})=>x>=r.minX-1e-6&&x<=r.maxX+1e-6&&z>=r.minZ-1e-6&&z<=r.maxZ+1e-6;
/** Structural geometry, navigation and camera solids share this plan. Slabs
 * are cut at stairwells and intersecting rooms, never laid over a flight. */
export function royalPalaceStructure():PalaceBox[]{
 const out:PalaceBox[]=[];
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,finish:PalaceBox['finish'])=>out.push({id,x,z,halfWidth:w/2,halfDepth:d/2,y,height:h,minY:y,maxY:y+h,finish});
 for(const r of HUMAN_ROOMS){
  const others=HUMAN_ROOMS.filter(o=>o!==r);
  for(const finish of ['floor','ceiling']as const){
   const y=finish==='floor'?r.y-.18:r.y+r.ceiling;
   const xs=[r.minX,r.maxX,...others.flatMap(o=>[o.minX,o.maxX]),S.minX,S.maxX].filter(x=>x>=r.minX&&x<=r.maxX).sort((a,b)=>a-b);
   const zs=[r.minZ,r.maxZ,...others.flatMap(o=>[o.minZ,o.maxZ]),S.minZ,S.maxZ].filter(z=>z>=r.minZ&&z<=r.maxZ).sort((a,b)=>a-b);
   for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
    const w=xs[i]-xs[i-1],d=zs[j]-zs[j-1],x=(xs[i]+xs[i-1])/2,z=(zs[j]+zs[j-1])/2;if(w<.001||d<.001)continue;
    if(finish==='floor'&&rect(x,z,S))continue;
    if(others.some(o=>rect(x,z,o)&&(finish==='floor'?o.y===r.y&&HUMAN_ROOMS.indexOf(o)<HUMAN_ROOMS.indexOf(r):o.y<y+.2&&o.y+o.ceiling>y+.01)))continue;
    box(r.id+'-'+finish,x,y,z,w,.18,d,finish);
   }
  }
  for(let side=0;side<4;side++){
   const along=side<2,lo=along?r.minX:r.minZ,hi=along?r.maxX:r.maxZ,fixed=along?(side===0?r.minZ:r.maxZ):(side===2?r.minX:r.maxX);
   const xs=[lo,hi,...others.flatMap(o=>along?[o.minX,o.maxX]:[o.minZ,o.maxZ])].filter(n=>n>=lo&&n<=hi).sort((a,b)=>a-b);
   const ys=[r.y,r.y+r.ceiling,...others.flatMap(o=>[o.y,o.y+o.ceiling])].filter(n=>n>=r.y&&n<=r.y+r.ceiling).sort((a,b)=>a-b);
   for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const a=xs[i-1],b=xs[i],bottom=ys[j-1],top=ys[j],x=along?(a+b)/2:fixed,z=along?fixed:(a+b)/2;
    if(b-a<.001||top-bottom<.001)continue;
    if(others.some(o=>rect(x,z,o)&&(bottom+top)/2>o.y-.01&&(bottom+top)/2<o.y+o.ceiling+.01))continue;
    if(r.id==='vestibule'&&side===1&&Math.abs(x)<4.2)continue;
    if(r.id==='tower-approach'&&side===3)continue;
    box(r.id+'-wall',x,bottom,z,along?b-a:.22,top-bottom,along?.22:b-a,'wall');
   }
  }
 }
 for(let i=0;i<S.steps;i++){const w=(S.maxX-S.minX)/S.steps,top=S.startY+(i+1)/S.steps*(S.endY-S.startY);box('imperial-step',S.minX+(i+.5)*w,S.startY-.18,(S.minZ+S.maxZ)/2,w,top-S.startY+.18,S.maxZ-S.minZ,'step');}
 return out;
}

/** Bounded volumes cut only the public palace route from the exterior model.
 * The replacement walls and slabs above close every interior cut. */
export function royalPalaceShellVoids(){
 return [...HUMAN_ROOMS,{...S,y:S.startY,ceiling:S.endY-S.startY+6}].map(r=>({
  minX:(r.minX-.24)/ROYAL_CASTLE_SCALE,maxX:(r.maxX+.24)/ROYAL_CASTLE_SCALE,
  minY:(r.y-.22-ROYAL_CASTLE_BASE)/ROYAL_CASTLE_SCALE,maxY:(r.y+r.ceiling+.24-ROYAL_CASTLE_BASE)/ROYAL_CASTLE_SCALE,
  minZ:(r.minZ+ROYAL_PORT_OFFSET-.24)/ROYAL_CASTLE_SCALE,maxZ:(r.maxZ+ROYAL_PORT_OFFSET+.24)/ROYAL_CASTLE_SCALE,
 }));
}
export function royalInsidePublicPalace(x:number,y:number,z:number){return HUMAN_ROOMS.some(r=>rect(x,z,r)&&y>=r.y-.2&&y<=r.y+r.ceiling+.2)||Math.hypot(x-T.x,z-T.z)<T.radius+T.width/2+.2&&y>=T.startY-.2&&y<=T.endY+2;}

export function openRoyalPalaceColliders(obstacles:readonly RoyalObstacle[],extraRooms:readonly {minX:number;maxX:number;minZ:number;maxZ:number;y:number;ceiling:number}[]=[]){
 let pieces=obstacles.map(o=>({minX:o.x-o.halfWidth,maxX:o.x+o.halfWidth,minZ:o.z-o.halfDepth,maxZ:o.z+o.halfDepth,minY:o.minY??-1e5,maxY:o.maxY??1e5}));
 for(const r of [...HUMAN_ROOMS,...extraRooms]){const v={minX:r.minX-.24,maxX:r.maxX+.24,minZ:r.minZ-.24,maxZ:r.maxZ+.24,minY:r.y-.22,maxY:r.y+r.ceiling+.24};
  pieces=pieces.flatMap(p=>{
   if(p.maxX<=v.minX||p.minX>=v.maxX||p.maxZ<=v.minZ||p.minZ>=v.maxZ||p.maxY<=v.minY||p.minY>=v.maxY)return[p];
   const out:typeof pieces=[];let core={...p};
   for(const [min,max]of[['minX','maxX'],['minY','maxY'],['minZ','maxZ']]as const){if(core[min]<v[min]){out.push({...core,[max]:v[min]});core={...core,[min]:v[min]};}if(core[max]>v[max]){out.push({...core,[min]:v[max]});core={...core,[max]:v[max]};}}
   return out;
  });
 }
 return pieces.map(p=>({x:(p.minX+p.maxX)/2,z:(p.minZ+p.maxZ)/2,halfWidth:(p.maxX-p.minX)/2,halfDepth:(p.maxZ-p.minZ)/2,minY:p.minY,maxY:p.maxY}));
}
