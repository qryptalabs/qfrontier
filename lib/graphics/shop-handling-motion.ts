import {siteOffset,type ShopCity} from './city-shop-sites.ts';

export type HandlingPoint={x:number;y:number;z:number};
export interface ShopHandlingSchedule {
 id:string;kind:'collect'|'deliver'|'sell';cityId:ShopCity;units:number;
 startsAt:number;transfersAt:number;endsAt:number;
 cart:{x:number;y:number;z:number;yaw:number};
 legs:{phase:'approach'|'pick'|'carry'|'put'|'return';startsAt:number;endsAt:number;points:HandlingPoint[]}[];
}
const duration=(points:readonly HandlingPoint[])=>Math.max(500,Math.ceil(points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.z-points[i].z),0)/1.6*1000));
/** The loading aisle crosses the road south of the yard fence, not through it. */
export function shopHandlingSchedule(id:string,kind:ShopHandlingSchedule['kind'],cityId:ShopCity,cart:ShopHandlingSchedule['cart'],units:number,now:number):ShopHandlingSchedule{
 const d=siteOffset(cityId),p=(x:number,z:number)=>({x:x+d.x,y:.92+d.y,z:z+d.z});
 const sideSign=Math.cos(cart.yaw)>=0?1:-1;
 const stand=p(-100,153),aisle=[stand,p(-100,171),p(-118,171)],side={x:cart.x+Math.cos(cart.yaw)*2*sideSign,y:cart.y,z:cart.z-Math.sin(cart.yaw)*2*sideSign};
 const outward=[...aisle,side],inward=[...outward].reverse(),legs:ShopHandlingSchedule['legs']=[];let cursor=now;
 const add=(phase:ShopHandlingSchedule['legs'][number]['phase'],points:HandlingPoint[],ms:number)=>{legs.push({phase,points,startsAt:cursor,endsAt:cursor+ms});cursor+=ms;};
 if(kind!=='collect')add('approach',outward,duration(outward));
 add('pick',[kind==='collect'?stand:side],2200);
 const carried=kind==='collect'?outward:inward;add('carry',carried,duration(carried));add('put',[carried.at(-1)!],2600);
 const transfersAt=cursor;if(kind==='collect')add('return',inward,duration(inward));
 return{id,kind,cityId,cart:{...cart},units,startsAt:now,transfersAt,endsAt:cursor,legs};
}
export function shopHandlingPose(s:ShopHandlingSchedule,now:number){
 const idle={...s.legs[0].points[0],yaw:Math.PI,walking:false,working:false,carrying:false,phase:'idle'};
 if(now<s.startsAt||now>=s.endsAt)return idle;
 const l=s.legs.find(l=>now<l.endsAt)!,points=l.points,span=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);let distance=span*Math.max(0,(now-l.startsAt)/(l.endsAt-l.startsAt));
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(distance<=length||i===points.length-1){const t=length?Math.min(1,distance/length):0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z),walking:length>0,working:false,carrying:l.phase==='carry',phase:l.phase};}distance-=length;}
 return{...idle,...points[0],yaw:s.kind==='collect'?Math.PI:0,working:true,carrying:l.phase==='put',phase:l.phase};
}
/** During handling the driver waits on the side opposite the loading aisle,
 * then boards only after the worker's return. The rig's saved pose stays fixed. */
export function shopDriverSeatBlend(s:ShopHandlingSchedule|undefined|null,now:number){
 if(!s||now<s.startsAt||now>=s.endsAt)return{seated:1,stepAside:0,walking:false};
 const depart=Math.min(1,(now-s.startsAt)/1500),board=Math.max(0,Math.min(1,(now-(s.endsAt-1800))/1800));
 const t=depart*(1-board),aside=t*t*(3-2*t);
 return{seated:1-aside,stepAside:aside,walking:depart<1||board>0};
}
