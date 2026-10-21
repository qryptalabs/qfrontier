/** Physical metres, relative to the harbor. Shared by ground, water, navigation
 * and the fleet; there is no separate decorative river or hidden shortcut. */
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export const ROYAL_GRAND_BRIDGE=Object.freeze({z:100,length:177.45,width:12,base:-3.5,scaleX:1.05,scaleY:1.75,scaleZ:1,deck:27.5,rampEnd:152,bankY:.92,arches:7});
// A broad westward bend clears the palace, both watch-forts and their foundations.
const NORTH_CHANNEL=Object.freeze([
 {z:-760,x:-350,w:260},{z:-540,x:-305,w:155},{z:-380,x:-260,w:82},
 {z:-240,x:-235,w:43},{z:-110,x:-225,w:37},{z:-20,x:-188,w:38},
 {z:40,x:-112,w:65},{z:78,x:-35,w:75},{z:100,x:0,w:56},{z:130,x:5*Math.sin(18/70),w:24},
]);
export function royalRiver(x:number,z:number){
 let center=0,halfWidth=0;
 if(z<NORTH_CHANNEL[0].z)return{center:-350,halfWidth:0,water:false};
 if(z<=130){for(let i=1;i<NORTH_CHANNEL.length;i++){const a=NORTH_CHANNEL[i-1],b=NORTH_CHANNEL[i];if(z>b.z)continue;const t=smooth((z-a.z)/(b.z-a.z));center=a.x+(b.x-a.x)*t;halfWidth=a.w+(b.w-a.w)*t;break;}}
 else if(z<=264){center=5*Math.sin((z-112)/70);halfWidth=24+24*Math.exp(-Math.pow((z-263)/20,2));}
 else{const t=clamp((z-264)/1236);center=5*Math.sin(152/70)*(1-t)+120*Math.sin(t*Math.PI);halfWidth=48*(1-smooth((t-.8)/.2))+1.5*smooth((t-.8)/.2);}
 return{center,halfWidth,water:z>=-760&&z<=1500&&Math.abs(x-center)<halfWidth};
}
export function royalChannelWaterY(z:number,baseY:number){return -1+(-baseY+.015+1)*smooth((-z-360)/300);}
export function royalBridgeDeck(x:number,z:number):number|null{
 const b=ROYAL_GRAND_BRIDGE,ax=Math.abs(x);if(Math.abs(z-b.z)>b.width/2||ax>b.rampEnd)return null;
 return b.deck;
}
export function royalAvenueDeck(z:number){return .665+clamp((z+4)/24)*.255;}
/** Ceiling of each genuinely hollow arch, including its two decorative rings. */
export function royalBridgeClearance(x:number){const b=ROYAL_GRAND_BRIDGE,span=b.length/7,center=Math.round(x/span)*span,radius=169/7*.37*b.scaleX-.7*b.scaleX,u=Math.abs(x-center)/radius;return u>=1?-Infinity:b.base+5.2*b.scaleY+11.3*b.scaleY*Math.sqrt(1-u*u);}
// Port departure lane is west of the working fishing berth and all moored ships.
export const ROYAL_SEA_ROUTE=Object.freeze([
 {x:0,z:175},{x:0,z:150},{x:0,z:125},{x:0,z:100},{x:0,z:90},{x:0,z:80},
 ...[60,40,20,0,-20,-50,-80,-110,-160,-200,-240,-300,-380,-460,-540,-650,-760,-900].map(z=>({x:z< -760?-350:royalRiver(0,z).center,z})),
]);
/** Closed out-and-back harbor traffic. Turn in open water rather than teleport
 * from the estuary to a berth; fixed UTC gives the same voyage in both viewers. */
export function royalSeaTrafficPose(seconds:number){
 const route=ROYAL_SEA_ROUTE,lengths=route.slice(1).map((b,i)=>Math.hypot(b.x-route[i].x,b.z-route[i].z)),length=lengths.reduce((a,b)=>a+b,0),turn=18,duration=length/5;
 const cycle=duration*2+turn*2,t=((seconds%cycle)+cycle)%cycle;let progress:number,yawTurn=0,moving=true;
 if(t<duration)progress=t/duration;else if(t<duration+turn){progress=1;yawTurn=(t-duration)/turn*Math.PI;moving=false;}else if(t<duration*2+turn){progress=1-(t-duration-turn)/duration;yawTurn=Math.PI;}else{progress=0;yawTurn=Math.PI+(t-duration*2-turn)/turn*Math.PI;moving=false;}
 let distance=progress*length;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=lengths[i-1];if(distance<=n||i===route.length-1){const u=clamp(distance/n);return{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,yaw:Math.atan2(b.x-a.x,b.z-a.z)+yawTurn,moving};}distance-=n;}
 return{...route[0],yaw:Math.PI,moving:false};
}
