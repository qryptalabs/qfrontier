/** Delivery time is authoritative; animation never creates stock or rewards. */
export const ROYAL_CLERK={x:3.7,y:1151/30,z:-119.2};
export const ROYAL_REPAIR={x:7.7,y:1151/30,z:-123.1};
export const ROYAL_CARGO_PICKUP={x:3.7,y:1151/30,z:-120.3};
export function royalWorkPose(at:number|null,now:number){
 const seconds=at===null?0:Math.max(0,(now-at)/1000),path=[ROYAL_CARGO_PICKUP,{x:0,y:ROYAL_CLERK.y,z:-120.3},{x:0,y:ROYAL_CLERK.y,z:-124.2},{x:6.6,y:ROYAL_CLERK.y,z:-124.2},{x:6.6,y:ROYAL_CLERK.y,z:-122.8}];
 let left=Math.min(15.6,seconds*2.1),p={...path[0]},yaw=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=Math.hypot(b.x-a.x,b.z-a.z),t=Math.min(1,left/d);p={x:a.x+(b.x-a.x)*t,y:a.y,z:a.z+(b.z-a.z)*t};yaw=Math.atan2(b.x-a.x,b.z-a.z);if(left<d)break;left-=d;}
 return{...p,yaw,visible:at!==null&&seconds<45,carrying:at!==null&&seconds<8,moving:at!==null&&seconds<8,working:at!==null&&seconds>=8&&seconds<45,completed:at!==null&&seconds>=45};
}
