import type {ExplorationMovement,ExplorationMovementLeg,ExplorationPoint,ExplorationTrafficHold,ExplorationTransport} from './exploration-data.ts';

export interface ExplorationTimedSegment {a:ExplorationPoint;b:ExplorationPoint;startsAt:number;endsAt:number;mode:ExplorationTransport;pointIndex:number;legIndex:number;hold?:ExplorationTrafficHold}
export const blockingTrafficHold=(hold:ExplorationTrafficHold)=>hold.resourceId.startsWith('traffic-blocked:');
export function explorationHoldAt(move:ExplorationMovement|undefined,now:number):ExplorationTrafficHold|undefined {
  return move?.holds?.find(hold=>now>=hold.startsAt&&(now<hold.endsAt||blockingTrafficHold(hold)));
}

/** Waiting consumes wall time, never distance. Shared by authority, cameras and traffic. */
export function explorationTimedSegments(move:ExplorationMovement):ExplorationTimedSegment[]{
  const legs:ExplorationMovementLeg[]=move.legs??[{mode:'walk',fromIndex:0,toIndex:move.points.length-1,startsAt:move.startsAt,endsAt:move.endsAt}],result:ExplorationTimedSegment[]=[];
  for(let li=0;li<legs.length;li++){
    const leg=legs[li],holds=(move.holds??[]).filter(h=>h.startsAt>=leg.startsAt&&h.endsAt<=leg.endsAt&&h.pointIndex>=leg.fromIndex&&h.pointIndex<=leg.toIndex),waiting=holds.reduce((n,h)=>n+h.endsAt-h.startsAt,0),distance=move.points.slice(leg.fromIndex+1,leg.toIndex+1).reduce((n,p,i)=>n+Math.hypot(p.x-move.points[leg.fromIndex+i].x,p.y-move.points[leg.fromIndex+i].y),0),duration=Math.max(1,leg.endsAt-leg.startsAt-waiting);
    let time=leg.startsAt;
    for(let i=leg.fromIndex;i<=leg.toIndex;i++){
      for(const hold of holds.filter(h=>h.pointIndex===i)){result.push({a:move.points[i],b:move.points[i],startsAt:hold.startsAt,endsAt:hold.endsAt,mode:leg.mode,pointIndex:i,legIndex:li,hold});time=hold.endsAt;}
      if(i===leg.toIndex)continue;
      const a=move.points[i],b=move.points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),end=time+(distance?length/distance*duration:duration);
      result.push({a,b,startsAt:time,endsAt:end,mode:leg.mode,pointIndex:i,legIndex:li});time=end;
    }
  }
  return result;
}

export function explorationTimedPosition(move:ExplorationMovement,now:number):ExplorationPoint {
  const hold=explorationHoldAt(move,now);if(hold)return{...move.points[hold.pointIndex]};
  const segments=explorationTimedSegments(move),segment=segments.find(s=>now<s.endsAt)??segments.at(-1);
  if(!segment)return{...move.points[0]};const t=Math.max(0,Math.min(1,(now-segment.startsAt)/Math.max(1,segment.endsAt-segment.startsAt)));
  return{x:segment.a.x+(segment.b.x-segment.a.x)*t,y:segment.a.y+(segment.b.y-segment.a.y)*t};
}

/** At a stop retain the incoming travel axis; a waiting carriage must not rotate toward zero. */
export function explorationTimedHeading(move:ExplorationMovement|undefined,now:number,fallback=0):number{
 if(!move)return fallback;
 const segments=explorationTimedSegments(move),hold=explorationHoldAt(move,now),active=hold?segments.findIndex(segment=>segment.hold===hold):segments.findIndex(segment=>now<segment.endsAt),index=active<0?segments.length-1:active;
 const moving=(segment:ExplorationTimedSegment)=>Math.hypot(segment.b.x-segment.a.x,segment.b.y-segment.a.y)>1e-8;
 if(index>=0&&!segments[index].hold&&moving(segments[index]))return Math.atan2(segments[index].b.x-segments[index].a.x,segments[index].b.y-segments[index].a.y);
 for(let i=index-1;i>=0;i--)if(moving(segments[i]))return Math.atan2(segments[i].b.x-segments[i].a.x,segments[i].b.y-segments[i].a.y);
 for(let i=Math.max(0,index);i<segments.length;i++)if(moving(segments[i]))return Math.atan2(segments[i].b.x-segments[i].a.x,segments[i].b.y-segments[i].a.y);
 return fallback;
}
