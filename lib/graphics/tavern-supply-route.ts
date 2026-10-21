/** Metres in the shared royal district, on the same streets as the player. */
export interface TavernPoint{x:number;y:number;z:number}
export const TAVERN_RECEIVING={x:32,y:.92,z:154};
export const TAVERN_COUNTER={x:84,y:.92,z:140.7};
export const TAVERN_DELIVERY_ROUTE:readonly TavernPoint[]=Object.freeze([
 {x:46,y:.92,z:154},{x:35.8,y:.92,z:154},{x:34,y:.92,z:154},
 {x:32,y:.92,z:134},{x:58,y:.92,z:134},{x:60,y:.92,z:161},
 {x:84,y:.92,z:157.16},{x:84,y:.92,z:148},{...TAVERN_COUNTER}
]);
export interface TavernSupplySchedule{id:string;startsAt:number;unloadedAt:number;departsAt:number;deliversAt:number;endsAt:number}
const dockMs=7500;
const travelMs=Math.ceil(TAVERN_DELIVERY_ROUTE.slice(1).reduce((n,b,i)=>n+Math.hypot(b.x-TAVERN_DELIVERY_ROUTE[i].x,b.z-TAVERN_DELIVERY_ROUTE[i].z),0)/1.6*1000);
export function tavernSupplySchedule(id:string,now:number):TavernSupplySchedule{
 const unloadedAt=now+dockMs+4000,departsAt=unloadedAt+dockMs+3000;
 return{id,startsAt:now,unloadedAt,departsAt,deliversAt:departsAt+travelMs+4000,endsAt:departsAt+travelMs*2+4000};
}
export function tavernSupplyPose(s:TavernSupplySchedule,now:number){
 const phase=now<s.startsAt?'idle':now<s.unloadedAt-4000?'approach':now<s.unloadedAt?'unloading':now<s.departsAt-3000?'warehousing':now<s.departsAt?'loading':now<s.deliversAt-4000?'carrying':now<s.deliversAt?'stocking':now<s.endsAt?'returning':'idle';
 const carrying=['warehousing','carrying','stocking'].includes(phase),walking=['approach','warehousing','carrying','returning'].includes(phase);
 const path=phase==='approach'?TAVERN_DELIVERY_ROUTE.slice(0,3):phase==='warehousing'?TAVERN_DELIVERY_ROUTE.slice(0,3).reverse():phase==='returning'?[...TAVERN_DELIVERY_ROUTE].reverse():TAVERN_DELIVERY_ROUTE;
 let distance=(phase==='approach'?now-s.startsAt:phase==='warehousing'?now-s.unloadedAt:phase==='returning'?now-s.deliversAt:now-s.departsAt)/1000*1.6;
 let point=phase==='unloading'?TAVERN_DELIVERY_ROUTE[2]:phase==='stocking'?TAVERN_COUNTER:TAVERN_DELIVERY_ROUTE[0],yaw=0;
 if(walking){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=Math.hypot(b.x-a.x,b.z-a.z);if(distance<=d){const t=Math.max(0,distance/d);point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};yaw=Math.atan2(b.x-a.x,b.z-a.z);break;}distance-=d;point=b;}}
 return{...point,yaw,phase,carrying,walking,working:phase==='unloading'||phase==='loading'||phase==='stocking',active:now>=s.startsAt&&now<s.endsAt};
}
