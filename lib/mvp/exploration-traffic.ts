import {MvpError} from './helpers.ts';
import type {MvpWorld,Player} from './types.ts';
import {habitablePositionAt} from './habitable-data.ts';
import {explorationPositionAt,explorationTransportAt,type ExplorationMovement,type ExplorationPoint,type ExplorationTransport} from './exploration-data.ts';
import {explorationTimedSegments,blockingTrafficHold,type ExplorationTimedSegment} from './exploration-timing.ts';
import {physicalLineClear,physicalTerrainSample} from '../graphics/world-collision.ts';
import {isPointOnPublicRoad} from './exploration-network-data.ts';
import {compileJourney,type JourneyPiece} from './exploration-network.ts';

export const TRAFFIC_HEADWAY_MS=750,TRAFFIC_MAX_WAIT_MS=120000,TRAFFIC_MAX_HOLDS=128;
const EPS=1e-6,VELOCITY_SQUARED_EPS=1e-20;
export interface TrafficActor {id:string;movement?:ExplorationMovement;position:ExplorationPoint;mode:ExplorationTransport;yaw?:number}
export interface TrafficOptions {clear?:(a:ExplorationPoint,b:ExplorationPoint)=>boolean;roadSupport?:(point:ExplorationPoint,padding:number)=>boolean;maxChecks?:number}
type Segment=ExplorationTimedSegment&{actorId:string;stationary?:boolean;yaw?:number};
interface Conflict {at:number;until:number;self:Segment;other:Segment;permanent:boolean}
const length=(a:ExplorationPoint,b:ExplorationPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const at=(s:Segment,t:number)=>{const f=Math.max(0,Math.min(1,(t-s.startsAt)/Math.max(1,s.endsAt-s.startsAt)));return{x:s.a.x+(s.b.x-s.a.x)*f,y:s.a.y+(s.b.y-s.a.y)*f};};
const bodyRadius=(mode:ExplorationTransport)=>mode==='carriage'?1.15:mode==='boat'?1.1:.3;
function circles(s:Segment){
  const radius=bodyRadius(s.mode),n=s.mode==='carriage'?8:1,extent=s.mode==='carriage'?5.2:0,offset=s.mode==='carriage'?1.55:0,dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,d=Math.hypot(dx,dy),forward=d?{x:dx/d,y:dy/d}:{x:Math.sin(s.yaw??0),y:Math.cos(s.yaw??0)},step=n>1?extent/(n-1):0;
  return Array.from({length:n},(_,i)=>{const u=offset+(n>1?-extent/2+i*step:0);return{x:forward.x*u,y:forward.y*u,radius:Math.hypot(radius,step/2)+.06};});
}
/** Analytic continuous relative sweeps; the sampled discs cover the entire cart capsule. */
function collisionWindow(a:Segment,b:Segment):{at:number;until:number}|null{
  if(a.mode==='boat'||b.mode==='boat')return null;
  const start=Math.max(a.startsAt,b.startsAt),end=Math.min(a.endsAt,b.endsAt);if(end<start)return null;
  const aa=at(a,start),bb=at(b,start),duration=end-start,av={x:(a.b.x-a.a.x)/Math.max(1,a.endsAt-a.startsAt),y:(a.b.y-a.a.y)/Math.max(1,a.endsAt-a.startsAt)},bv={x:(b.b.x-b.a.x)/Math.max(1,b.endsAt-b.startsAt),y:(b.b.y-b.a.y)/Math.max(1,b.endsAt-b.startsAt)},v={x:av.x-bv.x,y:av.y-bv.y};
  let earliest=Infinity,until=-Infinity;
  for(const ca of circles(a))for(const cb of circles(b)){
    const x=aa.x+ca.x-bb.x-cb.x,y=aa.y+ca.y-bb.y-cb.y,r=ca.radius+cb.radius,A=v.x*v.x+v.y*v.y,B=2*(x*v.x+y*v.y),C=x*x+y*y-r*r;
    // A is in world-units squared per millisecond squared, not position units.
    if(C<=0){if(B>=0&&A>VELOCITY_SQUARED_EPS)continue;earliest=Math.min(earliest,start);const exit=A>VELOCITY_SQUARED_EPS?(-B+Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A):duration;until=Math.max(until,start+Math.min(duration,Math.max(0,exit)));continue;}
    if(A<VELOCITY_SQUARED_EPS)continue;const discriminant=B*B-4*A*C;if(discriminant<0)continue;const root=Math.sqrt(discriminant),t=(-B-root)/(2*A),exit=(-B+root)/(2*A);if(t>=-EPS&&t<=duration+EPS){earliest=Math.min(earliest,start+Math.max(0,t));until=Math.max(until,start+Math.min(duration,Math.max(0,exit)));}
  }
  return Number.isFinite(earliest)?{at:earliest,until}:null;
}
const collisionTime=(a:Segment,b:Segment)=>collisionWindow(a,b)?.at??null;
function segments(actor:TrafficActor,now:number,horizon:number):Segment[]{
  const move=actor.movement,result:Segment[]=[];let yaw=actor.yaw??0;
  if(move){const parts=explorationTimedSegments(move),first=parts.find(s=>length(s.a,s.b)>.001);if(first)yaw=Math.atan2(first.b.x-first.a.x,first.b.y-first.a.y);for(const s of parts){if(length(s.a,s.b)>.001)yaw=Math.atan2(s.b.x-s.a.x,s.b.y-s.a.y);if(s.endsAt<now&&!s.hold)continue;result.push({...s,actorId:actor.id,yaw});if(s.hold&&blockingTrafficHold(s.hold)){result[result.length-1].endsAt=horizon;return result;}}}
  const end=move?.points.at(-1)??actor.position,time=Math.max(now,move?.endsAt??now);
  if(time<=horizon)result.push({a:end,b:end,startsAt:time,endsAt:horizon,mode:actor.mode,pointIndex:0,legIndex:0,actorId:actor.id,stationary:true,yaw});return result;
}
function conflict(move:ExplorationMovement,actors:readonly TrafficActor[],now:number,maxChecks:number,includeFinal=true):Conflict|null{
  const horizon=Math.max(move.endsAt,...actors.map(a=>a.movement?.endsAt??now))+TRAFFIC_HEADWAY_MS,own=segments({id:'self',movement:move,position:move.points[0],mode:'walk'},now,horizon).filter(s=>includeFinal||!s.stationary),others=actors.flatMap(a=>segments(a,now,horizon));let earliest:Conflict|null=null,checks=0;
  for(const a of own)for(const b of others){
    if(a.endsAt<b.startsAt||b.endsAt<a.startsAt)continue;
    const margin=a.mode==='carriage'||b.mode==='carriage'?11:1;
    if(Math.max(a.a.x,a.b.x)+margin<Math.min(b.a.x,b.b.x)||Math.max(b.a.x,b.b.x)+margin<Math.min(a.a.x,a.b.x)||Math.max(a.a.y,a.b.y)+margin<Math.min(b.a.y,b.b.y)||Math.max(b.a.y,b.b.y)+margin<Math.min(a.a.y,a.b.y))continue;
    if(++checks>maxChecks)throw new MvpError('Hay demasiado tráfico para reservar una ruta segura. Espera unos segundos.',409);
    const hit=collisionWindow(a,b);if(hit&&(!earliest||hit.at<earliest.at))earliest={...hit,self:a,other:b,permanent:!!b.stationary||!!b.hold&&blockingTrafficHold(b.hold)};
  }return earliest;
}
function ensureLegs(move:ExplorationMovement){move.legs??=[{mode:'walk',fromIndex:0,toIndex:move.points.length-1,startsAt:move.startsAt,endsAt:move.endsAt}];return move.legs;}
function insertPoint(move:ExplorationMovement,s:Segment,t:number){
  const point=at(s,t),i=s.pointIndex;if(length(point,move.points[i])<.001)return i;if(length(point,move.points[i+1])<.001)return i+1;
  move.points.splice(i+1,0,point);for(const leg of ensureLegs(move)){if(leg.fromIndex>i)leg.fromIndex++;if(leg.toIndex>i)leg.toIndex++;}for(const h of move.holds??[])if(h.pointIndex>i)h.pointIndex++;return i+1;
}
function shift(move:ExplorationMovement,legIndex:number,delta:number,fromTime:number){for(let i=legIndex;i<ensureLegs(move).length;i++){const leg=move.legs![i];if(i>legIndex)leg.startsAt+=delta;leg.endsAt+=delta;}for(const h of move.holds??[])if(h.startsAt>=fromTime-EPS){h.startsAt+=delta;h.endsAt+=delta;}move.endsAt+=delta;}
function hold(move:ExplorationMovement,index:number,time:number,ms:number,legIndex:number,resourceId:string){shift(move,legIndex,ms,time);(move.holds??=[]).push({pointIndex:index,startsAt:time,endsAt:time+ms,resourceId});move.holds.sort((a,b)=>a.startsAt-b.startsAt);}
function key(p:ExplorationPoint){return`${Math.round(p.x*100)}:${Math.round(p.y*100)}`;}
function clearDefault(a:ExplorationPoint,b:ExplorationPoint){return physicalTerrainSample(a).walkable&&physicalTerrainSample(b).walkable&&physicalLineClear(a,b);}
function safeWhileParked(point:ExplorationPoint,mode:ExplorationTransport,start:number,end:number,actors:readonly TrafficActor[],now:number,yaw=0){const parked:Segment={a:point,b:point,startsAt:start,endsAt:end,mode,pointIndex:0,legIndex:0,actorId:'self',yaw};return!actors.flatMap(a=>segments(a,now,end)).some(s=>collisionTime(parked,s)!==null);}

function supportedLine(a:ExplorationPoint,b:ExplorationPoint,support:(point:ExplorationPoint,padding:number)=>boolean){const count=Math.max(1,Math.ceil(length(a,b)/.25));for(let i=0;i<=count;i++)if(!support({x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count},-.36))return false;return true;}

/** Yield only inside an existing visible corridor. A narrow bridge never creates a grass detour. */
function layBy(move:ExplorationMovement,c:Conflict,actors:readonly TrafficActor[],now:number,clear:(a:ExplorationPoint,b:ExplorationPoint)=>boolean,support:(point:ExplorationPoint,padding:number)=>boolean):ExplorationMovement|null{
  const deadline=clearanceDeadline(c),parts=explorationTimedSegments(move).filter(s=>s.mode==='walk'&&!s.hold&&s.startsAt<c.at-1000&&length(s.a,s.b)>1).reverse();
  for(const part of parts.slice(0,24)){
    const t=Math.max(part.startsAt,Math.min(part.endsAt-700,c.at-4000));if(t<now+100||t<part.startsAt)continue;
    const entry=at({...part,actorId:'self'},t),d=length(part.a,part.b),normal={x:-(part.b.y-part.a.y)/d,y:(part.b.x-part.a.x)/d};
    const mergeTime=Math.min(part.endsAt,t+3000),merge=at({...part,actorId:'self'},mergeTime);if(length(entry,merge)<1)continue;
    for(const side of[1,-1])for(const offset of[.9,1.1,1.8,2.5,3.5]){
      const bay={x:entry.x+normal.x*offset*side,y:entry.y+normal.y*offset*side};if(!supportedLine(entry,bay,support)||!supportedLine(bay,merge,support)||!clear(entry,bay)||!clear(bay,merge))continue;
      const arrival=t+Math.ceil(length(entry,bay)/3.5*1000),wait=Math.max(TRAFFIC_HEADWAY_MS,deadline-arrival);if(wait>TRAFFIC_MAX_WAIT_MS||!safeWhileParked(bay,'walk',arrival,arrival+wait,actors,now))continue;
      const result=structuredClone(move),index=insertPoint(result,{...part,actorId:'self'},t),fresh=explorationTimedSegments(result).find(s=>s.pointIndex===index&&!s.hold)!;
      const mergeIndex=insertPoint(result,{...fresh,actorId:'self'},mergeTime),removed=mergeIndex-index-1,oldDistance=result.points.slice(index+1,mergeIndex+1).reduce((n,p,i)=>n+length(result.points[index+i],p),0),delta=Math.ceil((length(entry,bay)+length(bay,merge)-oldDistance)/3.5*1000);
      result.points.splice(index+1,removed,bay);for(const leg of ensureLegs(result)){if(leg.fromIndex>index)leg.fromIndex+=1-removed;if(leg.toIndex>index)leg.toIndex+=1-removed;}for(const h of result.holds??[])if(h.pointIndex>index)h.pointIndex+=1-removed;
      shift(result,part.legIndex,delta,t);hold(result,index+1,arrival,wait,part.legIndex,`traffic-yield:${key(bay)}`);return result;
    }
  }return null;
}
function budget(move:ExplorationMovement){if(move.points.length>1024||(move.legs?.length??1)>64||(move.holds?.length??0)>TRAFFIC_MAX_HOLDS||JSON.stringify(move).length>32768)throw new MvpError('La cola de tráfico supera el presupuesto seguro. Elige una escala intermedia.',409);}

function clearanceDeadline(c:Conflict){
  const ax=c.self.b.x-c.self.a.x,ay=c.self.b.y-c.self.a.y,bx=c.other.b.x-c.other.a.x,by=c.other.b.y-c.other.a.y,scale=Math.hypot(ax,ay)*Math.hypot(bx,by),parallel=scale>0&&Math.abs((ax*bx+ay*by)/scale)>.8;
  // Passing or following on one lane needs the earlier actor to clear that segment.
  return(parallel||c.other.hold?c.other.endsAt:c.until)+TRAFFIC_HEADWAY_MS;
}
function pauseBefore(move:ExplorationMovement,c:Conflict,actors:readonly TrafficActor[],now:number,permanent=false):ExplorationMovement|null{
  const parts=explorationTimedSegments(move).filter(s=>!s.hold&&s.mode!=='boat'&&s.startsAt<c.at&&s.endsAt>=now&&length(s.a,s.b)>.001).reverse(),deadline=clearanceDeadline(c),seen=new Set<number>();
  let attempts=0;
  for(const part of parts){
    const times=[Math.max(now,part.startsAt,Math.min(part.endsAt,c.at)-(permanent?1800:1500)),Math.max(now,part.startsAt)];
    for(const t of times){
      if(++attempts>64)return null;if(t<now||t>part.endsAt||t>=c.at-1||seen.has(t))continue;seen.add(t);
      const segment:Segment={...part,actorId:'self',yaw:Math.atan2(part.b.x-part.a.x,part.b.y-part.a.y)},point=at(segment,t),waiting=permanent?TRAFFIC_MAX_WAIT_MS:Math.ceil(Math.max(TRAFFIC_HEADWAY_MS,deadline-t));
      // Timeout leaves the character standing here. Protect that stationary tail
      // against every older reservation, not just the two-minute waiting window.
      const parkingEnd=permanent?Math.max(t+waiting,...actors.map(actor=>actor.movement?.endsAt??now))+TRAFFIC_HEADWAY_MS:t+waiting;
      if(waiting>TRAFFIC_MAX_WAIT_MS||!safeWhileParked(point,part.mode,t,parkingEnd,actors,now,segment.yaw))continue;
      const candidate=structuredClone(move),index=insertPoint(candidate,segment,t);hold(candidate,index,t,waiting,part.legIndex,`${permanent?'traffic-blocked':'traffic-yield'}:${key(point)}`);return candidate;
    }
  }
  return null;
}

/** All reservations are the already committed trajectories in the same atomic world write. */
export function reserveTrafficMovement(movement:ExplorationMovement,actors:readonly TrafficActor[],now:number,options:TrafficOptions={}):ExplorationMovement{
  let result=structuredClone(movement);ensureLegs(result);const clear=options.clear??clearDefault,support=options.roadSupport??isPointOnPublicRoad,maxChecks=options.maxChecks??150000;
  for(let attempt=0;attempt<24;attempt++){
    const c=conflict(result,actors,now,maxChecks);if(!c){budget(result);return result;}
    if(!c.permanent){
      const candidate=pauseBefore(result,c,actors,now);if(candidate){result=candidate;continue;}
      const bay=layBy(result,c,actors,now,clear,support);if(bay){result=bay;continue;}
    }
    // A stationary player can block a road; wait upstream with a hard timeout.
    if(c.permanent){const candidate=pauseBefore(result,c,actors,now,true);if(candidate){budget(candidate);return candidate;}}
    throw new MvpError('El paso está ocupado y no hay espacio seguro para ceder. Apártate en un acceso o espera a que se libere.',409);
  }
  throw new MvpError('El tráfico está saturado. Espera a que se despeje el camino antes de viajar.',409);
}
export function worldTrafficActors(world:MvpWorld,now:number,ignoreId?:string):TrafficActor[]{return Object.values(world.players).filter(p=>p.id!==ignoreId&&p.settlement&&p.habitable).map(p=>{const h=p.habitable!,m=h.exploration?.movement??h.movement,local=h.exploration?explorationPositionAt(h.exploration,now):habitablePositionAt(h,now),position=h.exploration?local:{x:p.settlement!.x+local.x,y:p.settlement!.y+local.y},movement=m?(h.exploration?m:{...m,points:m.points.map(at=>({x:at.x+p.settlement!.x,y:at.y+p.settlement!.y}))}):undefined;return{id:p.id,movement,position,mode:h.exploration?explorationTransportAt(h.exploration,now):'walk'};});}
export function reserveExplorationJourney(world:MvpWorld,p:Player,movement:ExplorationMovement,now:number):ExplorationMovement{return reserveTrafficMovement(movement,worldTrafficActors(world,now,p.id),now);}

/** Manual leases may not enter the imminent swept footprint of a confirmed automatic journey. */
export function manualTrafficLineClear(world:MvpWorld,p:Player,a:ExplorationPoint,b:ExplorationPoint,start:number,end:number):boolean{
  const movement:ExplorationMovement={points:[a,b],startsAt:start,endsAt:Math.max(start+1,end)};
  return!conflict(movement,worldTrafficActors(world,start,p.id),start,12000);
}

function remainingJourney(move:ExplorationMovement,now:number):ExplorationMovement|null{
  const position=explorationPositionAt({position:move.points[0],movement:move},now),hold=move.holds?.find(h=>blockingTrafficHold(h)&&now>=h.startsAt),current=hold?explorationTimedSegments(move).find(s=>s.hold===hold):explorationTimedSegments(move).find(s=>now<s.endsAt),index=hold?.pointIndex??current?.pointIndex??move.points.length-1,pieces:JourneyPiece[]=[];
  for(const leg of ensureLegs(move)){if(leg.toIndex<=index)continue;const first=Math.max(index,leg.fromIndex),points=[...(first===index?[position]:[move.points[first]]),...move.points.slice(first+1,leg.toIndex+1)];if(points.length>1&&points.slice(1).some((p,i)=>length(p,points[i])>.001))pieces.push({mode:leg.mode,points,routeId:leg.routeId,fromPortId:leg.fromPortId,toPortId:leg.toPortId});}
  return pieces.length?compileJourney(pieces,now):null;
}
function stopAtHold(p:Player,index:number){const state=p.habitable!.exploration!;state.position={...state.movement!.points[index]};delete state.movement;delete state.destinationId;delete state.returning;}
/** Blocked waits are barriers even offline. They resume on authoritative activity or stop after two minutes. */
export function settleExplorationTraffic(world:MvpWorld,now:number,changedPlayerId?:string):void{
  const players=Object.values(world.players).filter(p=>p.habitable?.exploration?.movement&&!p.habitable.exploration.movement.manualSessionId).sort((a,b)=>(a.habitable!.exploration!.departedAt-b.habitable!.exploration!.departedAt)||a.id.localeCompare(b.id));
  for(const p of players){
    const state=p.habitable!.exploration!,move=state.movement!,blocked=move.holds?.find(h=>blockingTrafficHold(h)&&now>=h.startsAt);
    if(blocked){
      if(now>=blocked.endsAt){stopAtHold(p,blocked.pointIndex);continue;}
      const remaining=remainingJourney(move,now);if(!remaining){stopAtHold(p,blocked.pointIndex);continue;}
      try{const scheduled=reserveExplorationJourney(world,p,remaining,now);if(!scheduled.holds?.some(blockingTrafficHold)){state.position={...scheduled.points[0]};state.movement=scheduled;}}catch(error){if(!(error instanceof MvpError))throw error;}
      continue;
    }
    if(!changedPlayerId||p.id===changedPlayerId||move.endsAt<=now||explorationTransportAt(state,now)==='boat')continue;
    const changed=worldTrafficActors(world,now,p.id).filter(a=>a.id===changedPlayerId);if(!changed.length||!conflict(move,changed,now,20000))continue;
    const remaining=remainingJourney(move,now);if(!remaining)continue;
    try{const scheduled=reserveExplorationJourney(world,p,remaining,now);state.position={...scheduled.points[0]};state.movement=scheduled;}
    catch(error){
      if(!(error instanceof MvpError))throw error;
      // A new manual stop can take precedence, but never move a traveller backwards.
      const future=conflict(remaining,worldTrafficActors(world,now,p.id),now,20000);if(!future)continue;
      const candidate=pauseBefore(remaining,future,worldTrafficActors(world,now,p.id),now,true);
      if(!candidate)throw new MvpError('No puedes detenerte aquí: el paso ya está reservado y no existe una espera segura. Continúa hasta un acceso libre.',409);
      budget(candidate);state.position={...candidate.points[0]};state.movement=candidate;
    }
  }
}
