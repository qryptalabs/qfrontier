import {sampleWorld} from './world-geography.ts';
import {continuousTerrainHeight} from './world-terrain-height.ts';
import {habitableGroundHeight,habitableWaterAt} from '../mvp/habitable-data.ts';
import type {MvpWorld,Player} from '../mvp/types.ts';
import type {TradePoint,HabitableTradeRoute} from '../mvp/habitable-commerce.ts';
export const TRADE_DESTINATION=Object.freeze({name:'Valleverde',x:146,y:120});
export const TRADE_BAY=Object.freeze({x:-13.5,y:-4.25});
export const TRADE_GATEWAY=Object.freeze({points:[{x:-9,y:4},{x:-9,y:-1},{x:-13.5,y:-1},{x:-13.5,y:-4.25},{x:-21,y:-4.25}],width:1.5});
export function tradeGroundHeight(x:number,y:number,plot:{x:number;y:number}){const dx=x-plot.x,dy=y-plot.y;if(Math.abs(dx)<=16&&Math.abs(dy)<=13)return habitableGroundHeight(dx,dy)+sampleWorld(plot.x,plot.y).height-2;return continuousTerrainHeight(x,y,plot);}
export function sampleTradePath(points:readonly TradePoint[],distance:number):TradePoint&{yaw:number}{
 if(!points.length)return{x:0,y:0,height:0,yaw:0};let left=Math.max(0,distance);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(left<=len||i===points.length-1){const t=Math.max(0,Math.min(1,left/(len||1)));return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,height:a.height+(b.height-a.height)*t,yaw:Math.atan2(b.x-a.x,b.y-a.y)};}left-=len;}return{...points[0],yaw:0};
}
export const tradePathLength=(points:readonly {x:number;y:number}[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
const routeCache=new Map<string,HabitableTradeRoute|null>();
/** Static geography and parcel positions determine a road; no goods or authority live in this bounded cache. */
export function planHabitableTradeRoute(world:MvpWorld,p:Player):HabitableTradeRoute|null {
 const key=JSON.stringify([p.id,p.settlement?.x,p.settlement?.y,Object.values(world.players).map(other=>[other.id,other.settlement?.x,other.settlement?.y]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
 if(routeCache.has(key))return structuredClone(routeCache.get(key)!);
 const route=calculateHabitableTradeRoute(world,p);if(routeCache.size>=32)routeCache.delete(routeCache.keys().next().value!);routeCache.set(key,structuredClone(route));return route;
}
/** A bounded land route; only narrow rivers receive explicit bridge decks. */
function calculateHabitableTradeRoute(world:MvpWorld,p:Player):HabitableTradeRoute|null {
 if(!p.settlement)return null;const plot=p.settlement,exit=TRADE_GATEWAY.points.at(-1)!,from={x:plot.x+exit.x,y:plot.y+exit.y},goal=TRADE_DESTINATION;if(Math.hypot(from.x-goal.x,from.y-goal.y)>800)return null;
 const blocked=(x:number,y:number)=>Object.values(world.players).some(other=>other.id!==p.id&&other.settlement&&Math.abs(x-other.settlement.x)<21&&Math.abs(y-other.settlement.y)<19);
 const point=(x:number,y:number):TradePoint=>({x,y,height:tradeGroundHeight(x,y,plot)+.045});
 const corridorDistance=(x:number,y:number)=>Math.min(...TRADE_GATEWAY.points.slice(1).map((b,i)=>{const a=TRADE_GATEWAY.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);}));
 const segment=(a:{x:number;y:number},b:{x:number;y:number})=>{const len=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(len/.4)),nx=-(b.y-a.y)/(len||1),ny=(b.x-a.x)/(len||1);let wet=false;for(let i=0;i<=steps;i++){const t=i/steps,cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t;for(const side of[-1.1,0,1.1]){const x=cx+nx*side,y=cy+ny*side;if(blocked(x,y))return false;const dx=x-plot.x,dy=y-plot.y;if(Math.abs(dx)<19&&Math.abs(dy)<17){if(corridorDistance(dx,dy)>1.3||habitableWaterAt(dx,dy))return false;}else{const v=sampleWorld(x,y);if(v.water){if(!v.river||v.biome==='ocean'||i===0||i===steps)return false;wet=true;}}}}return!wet||len<=5.8;};
 const key=(x:number,y:number)=>`${x}:${y}`,step=4,nodes=new Map<string,{x:number;y:number;g:number;f:number;parent:string|null}>(),closed=new Set<string>(),open:string[]=[];const start=key(0,0),coords=(x:number,y:number)=>({x:from.x+x*step,y:from.y+y*step});nodes.set(start,{x:0,y:0,g:0,f:Math.hypot(from.x-goal.x,from.y-goal.y),parent:null});open.push(start);let finish:string|null=null;
 while(open.length&&closed.size<7000){let best=0;for(let i=1;i<open.length;i++)if(nodes.get(open[i])!.f<nodes.get(open[best])!.f)best=i;const id=open.splice(best,1)[0];if(closed.has(id))continue;closed.add(id);const n=nodes.get(id)!,a=coords(n.x,n.y);if(Math.hypot(a.x-goal.x,a.y-goal.y)<=6&&segment(a,goal)){finish=id;break;}for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const nx=n.x+dx,ny=n.y+dy,b=coords(nx,ny),nid=key(nx,ny);if(closed.has(nid)||Math.abs(b.x-from.x)>900||Math.abs(b.y-from.y)>900||!segment(a,b))continue;const dh=Math.abs(tradeGroundHeight(a.x,a.y,plot)-tradeGroundHeight(b.x,b.y,plot));if(dh>3)continue;const g=n.g+Math.hypot(dx,dy)*step+dh*2;if(nodes.has(nid)&&nodes.get(nid)!.g<=g)continue;nodes.set(nid,{x:nx,y:ny,g,f:g+Math.hypot(b.x-goal.x,b.y-goal.y),parent:id});open.push(nid);}}
 if(!finish)return null;const reverse:TradePoint[]=[point(goal.x,goal.y)];for(let id:string|null=finish;id!==null;id=nodes.get(id)!.parent){const n=nodes.get(id)!,v=coords(n.x,n.y);reverse.push(point(v.x,v.y));}reverse.reverse();const points=[point(plot.x+TRADE_BAY.x,plot.y+TRADE_BAY.y),...reverse];if(points.length>260)return null;
 const bridges:HabitableTradeRoute['bridges']=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);let waterLevel:number|null=null;for(let t=0;t<=1;t+=.1){const v=sampleWorld(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);if(v.water&&v.river&&Math.abs(a.x-plot.x)>16)waterLevel=Math.max(waterLevel??-Infinity,v.waterLevel);}if(waterLevel!==null){const h=Math.max(a.height,b.height,waterLevel+.3);a.height=Math.max(a.height,h);b.height=Math.max(b.height,h);bridges.push({from:{...a},to:{...b}});}if(len>10)return null;}
 return{points,length:tradePathLength(points),bridges};
}
