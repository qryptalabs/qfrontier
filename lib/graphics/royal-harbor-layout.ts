/** Shared physical layout for quay paving, walking and the freight route. */
import {ROYAL_CITADEL_APPROACH,ROYAL_CITADEL_COURT_Y,ROYAL_CITADEL_SIDE_CROSSING_Z,ROYAL_CITADEL_LANDINGS,royalApproachHeight,royalCitadelWalkHeight} from './royal-citadel-layout.ts';
import {royalInteriorWalkHeight} from './royal-citadel-interior-layout.ts';
export const ROYAL_CAMERA_MAX_POLAR=Math.PI*.58;
export function royalRiverEdge(z:number){return 82+Math.max(z,-70)*.08+Math.sin(z*.012)*9+Math.sin(z*.025)*2;}
export function royalQuayLane(z:number,side=1){return side*(royalRiverEdge(z)+13);}
export type RoyalObstacle={x:number;z:number;halfWidth:number;halfDepth:number;minY?:number;maxY?:number;allowEgress?:boolean};
export function royalWalkHeight(x:number,z:number,referenceY?:number){
 const interior=royalInteriorWalkHeight(x,z,referenceY);if(interior!==null)return interior;
 const citadel=royalCitadelWalkHeight(x,z);if(citadel!==null)return citadel;
 const approach=ROYAL_CITADEL_APPROACH;
 if(Math.abs(x)<=approach.halfWidth&&z>=approach.endZ&&z<=approach.startZ)return royalApproachHeight(z);
 for(const terrace of ROYAL_CITADEL_LANDINGS)if(!('existingCitadelFloor'in terrace)&&z<=terrace.startZ&&z>=terrace.endZ&&Math.abs(x)<=terrace.width/2-1.2)return terrace.y;
 if(Math.abs(x)<=12&&z>=-120&&z<=-82)return 19.95;
 if(Math.abs(x)<=129&&z>=-93&&z<=-83)return 19.95;
 // A real stepped access joins each quay to the bridge abutments.
 if(Math.abs(Math.abs(x)-122)<=5&&z>=-83&&z<=-40){const t=Math.min(1,(-40-z)/40);return 4.3+Math.floor(t*30+.000001)/30*15.65;}
 // Elevated side bridges terminate in the two detached watch-forts.
 if(Math.abs(x)>=2000&&Math.abs(x)<=3480&&Math.abs(z-ROYAL_CITADEL_SIDE_CROSSING_Z)<=45)return ROYAL_CITADEL_COURT_Y;
 if(Math.hypot(Math.abs(x)-3570,z-ROYAL_CITADEL_SIDE_CROSSING_Z)<=258.8)return ROYAL_CITADEL_COURT_Y;
 if(z< -40||z>355||Math.abs(x)>royalRiverEdge(z)+76)return null;
 if(x>=royalRiverEdge(z)-26&&x<royalRiverEdge(z)+4&&Math.abs(z-220)<4.2)return 4.5;
 if(Math.abs(x)<royalRiverEdge(z)+3)return null;
 return 4.3;
}
export function moveRoyalWalker(position:{x:number;z:number;y?:number},dx:number,dz:number,obstacles:readonly RoyalObstacle[],radius=1.2,surface=royalWalkHeight){
 let currentY=position.y??surface(position.x,position.z)??4.3;
 const clear=(nx:number,nz:number)=>{const y=surface(nx,nz,currentY);return y!==null&&Math.abs(y-currentY)<=.85&&!obstacles.some(o=>{
  if(y+2.7<=(o.minY??-Infinity)||y>=(o.maxY??Infinity))return false;
  const depth=(px:number,pz:number)=>Math.min(o.halfWidth+radius-Math.abs(px-o.x),o.halfDepth+radius-Math.abs(pz-o.z));
  const next=depth(nx,nz),prior=depth(x,z);return next>0&&!(o.allowEgress&&prior>0&&next<prior-1e-7);
 });};
 // Axis sliding retains continuous motion while a wall blocks one direction.
 let {x,z}=position;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.55));
 for(let i=0;i<steps;i++){if(clear(x+dx/steps,z)){x+=dx/steps;currentY=surface(x,z,currentY)!;}if(clear(x,z+dz/steps)){z+=dz/steps;currentY=surface(x,z,currentY)!;}}
 return{x,z,y:currentY};
}

/** Clip the third-person boom before masonry; the camera never requests a
 * position through a wall even when the visitor is facing away from it. */
export function clipRoyalCameraBoom(head:{x:number;y:number;z:number},desired:{x:number;y:number;z:number},obstacles:readonly RoyalObstacle[],padding=.6){
 const dx=desired.x-head.x,dz=desired.z-head.z;let stop=1;
 for(const o of obstacles){let near=0,far=stop;for(const[origin,delta,min,max]of[[head.x,dx,o.x-o.halfWidth-padding,o.x+o.halfWidth+padding],[head.z,dz,o.z-o.halfDepth-padding,o.z+o.halfDepth+padding],[head.y,desired.y-head.y,(o.minY??-Infinity)-.18,(o.maxY??Infinity)+.18]]){if(Math.abs(delta)<1e-9){if(origin<min||origin>max){far=-1;break;}}else{const a=(min-origin)/delta,b=(max-origin)/delta;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}if(near<=far&&far>=0)stop=Math.min(stop,Math.max(0,near-.025));}
 return{x:head.x+dx*stop,y:head.y+(desired.y-head.y)*stop,z:head.z+dz*stop};
}
