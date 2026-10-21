import {EXPLORATION_PUBLIC_LANDINGS,type NetworkPoint} from './exploration-network-data.ts';
import type {ExplorationMovement,ExplorationMovementLeg,ExplorationState} from './exploration-data.ts';
const ports=new Map(EXPLORATION_PUBLIC_LANDINGS.map(p=>[p.id,p]));
const distance=(a:NetworkPoint,b:NetworkPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
function boardingFlags(points:readonly NetworkPoint[],fromPortId?:string,toPortId?:string){const from=fromPortId?ports.get(fromPortId):undefined,to=toPortId?ports.get(toPortId):undefined;return{from:from?.mooring&&points.length>=3&&distance(points[0],from.water)<1e-4&&distance(points[1],from.mooring)<1e-4?from:undefined,to:to?.mooring&&points.length>=3&&distance(points.at(-1)!,to.water)<1e-4&&distance(points.at(-2)!,to.mooring)<1e-4?to:undefined};}
export function explorationBoatDuration(points:readonly NetworkPoint[],fromPortId?:string,toPortId?:string):number{const flags=boardingFlags(points,fromPortId,toPortId);return points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p)/((i===0&&flags.from||i===points.length-2&&flags.to)?3.5:12),0);}
function at(move:ExplorationMovement,leg:ExplorationMovementLeg,now:number){
 const points=move.points.slice(leg.fromIndex,leg.toIndex+1),flags=boardingFlags(points,leg.fromPortId,leg.toPortId),durations=points.slice(1).map((p,i)=>distance(points[i],p)/((i===0&&flags.from||i===points.length-2&&flags.to)?3.5:12)),total=durations.reduce((s,n)=>s+n,0),span=Math.max(1,leg.endsAt-leg.startsAt);let elapsed=0,index=0;
 // Compare absolute boundaries before subtracting epoch timestamps: the half-open handoff
 // must select the gangway at its exact start, including the timestamp's float precision.
 for(;index<durations.length-1;index++){const boundary=leg.startsAt+(elapsed+durations[index])*span/total;if(now<boundary)break;elapsed+=durations[index];}
 const start=leg.startsAt+elapsed*span/total,end=leg.startsAt+(elapsed+durations[index])*span/total,a=points[index]??points[0],b=points[index+1]??a,t=end>start?Math.max(0,Math.min(1,(now-start)/(end-start))):0;
 return{position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},points,flags,index,t};
}
/** Legacy synthetic boat legs without port metadata keep the same constant-speed interpolation. */
export function explorationBoatLegPositionAt(move:ExplorationMovement,leg:ExplorationMovementLeg,now:number):NetworkPoint{return at(move,leg,now).position;}
/** A 120ms turn at sea speed. Adjacent windows never overlap or reach the gangway. */
function seaHeading(points:readonly NetworkPoint[],start:number,end:number,index:number,t:number):number{
  const lengths=points.slice(start+1,end+1).map((p,i)=>distance(points[start+i],p));let traveled=0;for(let i=start;i<Math.max(start,index);i++)traveled+=distance(points[i],points[i+1]);if(index>=start&&index<end)traveled+=distance(points[index],points[index+1])*t;
  let vertex=0;for(let i=start;i<end-1;i++){const before=lengths[i-start],after=lengths[i-start+1];vertex+=before;const radius=Math.min(.72,before*.49,after*.49);if(radius<1e-7||Math.abs(traveled-vertex)>radius)continue;const a=points[i],b=points[i+1],c=points[i+2],from=Math.atan2(b.x-a.x,b.y-a.y),to=Math.atan2(c.x-b.x,c.y-b.y),delta=Math.atan2(Math.sin(to-from),Math.cos(to-from)),alpha=Math.max(0,Math.min(1,(traveled-vertex+radius)/(2*radius))),smooth=alpha*alpha*(3-2*alpha);return from+delta*smooth;}
  const segment=Math.max(start,Math.min(end-1,index)),a=points[segment],b=points[segment+1]??a;return Math.atan2(b.x-a.x,b.y-a.y);
}
function passengerAt(position:NetworkPoint,heading:number,blend:number):NetworkPoint{return{x:position.x+(.42*Math.cos(heading)+.45*Math.sin(heading))*blend,y:position.y+(-.42*Math.sin(heading)+.45*Math.cos(heading))*blend};}
export interface ExplorationBoatPose{vehicle:NetworkPoint;passenger:NetworkPoint;heading:number;boarding?:{progress:number;kind:'boarding'|'disembarking';fromPortId?:string;toPortId?:string}}
/** The hull stays at its safe mooring while only the passenger traverses the temporary gangway. */
export function explorationBoatPoseAt(state:Pick<ExplorationState,'position'|'movement'>,now:number):ExplorationBoatPose|null{const move=state.movement;if(!move||now>=move.endsAt)return null;const leg=move.legs?.find(l=>now<l.endsAt);if(leg?.mode!=='boat')return null;const value=at(move,leg,now),{points,flags,index,t}=value;
 if(index===0&&flags.from){const p=flags.from,heading=seaHeading(points,1,points.length-(flags.to?2:1),1,0);return{vehicle:{...p.mooring!},passenger:passengerAt(value.position,heading,t),heading,boarding:{progress:t,kind:'boarding',fromPortId:p.id}};}
 if(index===points.length-2&&flags.to){const p=flags.to,heading=seaHeading(points,flags.from?1:0,points.length-2,points.length-2,0);return{vehicle:{...p.mooring!},passenger:passengerAt(value.position,heading,1-t),heading,boarding:{progress:t,kind:'disembarking',toPortId:p.id}};}
 const heading=seaHeading(points,flags.from?1:0,points.length-(flags.to?2:1),index,t);return{vehicle:{...value.position},passenger:passengerAt(value.position,heading,1),heading};
}
