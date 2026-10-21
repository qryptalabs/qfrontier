import {royalRiver} from './royal-regional-terrain.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';
import {royalHarborVisualClock,sampleRoyalHarborRoute} from './royal-harbor-activity.ts';
import type {RoyalHarborSnapshot} from '../mvp/royal-harbor.ts';

/** Metres in the same harbor coordinates used by rendering and authority. */
export const ROYAL_GALLEON=Object.freeze({x:9,z:185,deck:1.55,upper:4.85,quay:32,gangwayStart:13,gangwayEnd:23});
export const ROYAL_FISH_DOCK=Object.freeze({x:11,z:224,deck:-.24,pier:1.2,storeX:37,storeZ:228,marketX:38,marketZ:145});
export const ROYAL_WORKING_WATER_ROUTE=Object.freeze([
 {x:11,z:224},{x:11,z:238},{x:7,z:254},{x:0,z:279},
 ...[300,330,360,390].map(z=>({x:royalRiver(0,z).center,z})),
]);
export const ROYAL_FISH_CART_ROUTE=Object.freeze([{x:37,z:228},{x:37,z:222},{x:32,z:222},{x:32,z:180},{x:32,z:145},{x:38,z:145}]);
export const ROYAL_GALLEON_WALK_ROUTE=Object.freeze([{x:32,z:185},{x:23,z:185},{x:13,z:185},{x:11,z:185},{x:11,z:189},{x:11.4,z:190},{x:11.4,z:194},{x:9,z:196}]);
export function royalFishingCrewLocalPose(index:number,phase:string,elapsed:number){
 if(!index)return{x:-.7,y:ROYAL_FISH_DOCK.deck,z:1.5};
 const t=phase==='docking'?Math.max(0,Math.min(1,(elapsed-60)/6)):phase==='market'?1-Math.max(0,Math.min(1,(elapsed-112)/8)):0;
 return{x:.7+(-1.1-.7)*t,y:ROYAL_FISH_DOCK.deck,z:-1.4+(1+1.4)*t};
}
export function royalMaritimeWalkHeight(x:number,z:number,referenceY?:number):number|null{
 const g=ROYAL_GALLEON,lx=x-g.x,lz=z-g.z;
 if(x>=12&&x<=32&&Math.abs(lz)<=1.04)return x<=23?g.deck+(1.2-g.deck)*Math.max(0,(x-13)/10):1.2-(x-23)/9*.28;
 if(Math.abs(lx)<=3.25&&lz>=-10.3&&lz<=13.1){
  if(Math.abs(Math.abs(lx)-2.4)<=.65&&lz>=5&&lz<=9)return g.deck+Math.min(22,Math.floor((lz-5)/4*22+1e-6)+1)/22*(g.upper-g.deck);
  if(lz>=9&&(referenceY??g.deck)>3.2)return g.upper;
  return g.deck;
 }
 // The fish pier is fixed; only the boat moves. No walkable water is invented.
 if(x>=13&&x<=32&&Math.abs(z-224)<=1.05)return x<=23?D_FISH_RAMP(x):1.2-(x-23)/9*.28;
 return null;
}
const D_FISH_RAMP=(x:number)=>ROYAL_FISH_DOCK.deck+(1.2-ROYAL_FISH_DOCK.deck)*(x-12.1)/10.9;
export function royalMaritimeLocation(x:number,y:number,z:number){
 if(Math.abs(x-9)<4&&z>174&&z<199)return y>3.2?'Galeón real · Alcázar de popa':z>194?'Galeón real · Cámara del capitán':'Galeón real · Cubierta principal';
 if(x>=13&&x<32&&Math.abs(z-185)<2)return 'Pasarela del galeón real';
 if(x>=13&&x<40&&Math.abs(z-224)<6)return 'Muelle de pesca · Descarga y almacén';
 return null;
}
export function royalMaritimeObstacles():RoyalObstacle[]{
 const result:RoyalObstacle[]=[];
 const box=(x:number,z:number,w:number,d:number,minY:number,maxY:number)=>result.push({x,z,halfWidth:w/2,halfDepth:d/2,minY,maxY,allowEgress:true});
 // Walkable gaps are explicit: starboard gangway and the captain's doorway.
 for(const side of[-1,1]){
  if(side<0)box(9+side*3.4,186.4,.2,24,1.55,2.65);
  else for(const [z,d]of[[179.2,9.5],[192.1,11.7]])box(12.4,z,.2,d,1.55,2.65);
  box(9+side*3.4,196,.2,5,4.85,5.95);
  box(9+side*2.1,196.8,.2,3.4,1.55,4.65);
  box(18,185+side*1.15,10,.12,1.2,2.55);
  box(22.5,224+side*2,19,.12,1.2,2.3);
 }
 box(9,174.5,6.8,.2,1.55,2.65);box(9,198.25,6.8,.2,1.55,6);
 for(const dz of[-4.6,6.9])box(9,185+dz,.7,.7,1.55,24);
 // Cabin front sides leave a 1.8 m door and >3 m internal headroom.
 for(const dx of[-1.3,1.3])box(9+dx,194,.5,.18,1.55,4.65);
 box(8.2,196.7,1.7,1.05,1.55,2.98);box(9.6,197.2,.85,.8,1.55,2.48);
 box(9,196.15,3,4.3,4.65,4.85);
 return result;
}
export function royalWorkingFleetPose(snapshot:RoyalHarborSnapshot|null,utcSeconds:number){
 const now=royalHarborVisualClock(snapshot,utcSeconds),elapsed=now===null?0:(now-snapshot!.cycle.startsAt)/1000,phase=snapshot?.cycle.phase??'idle',active=!!snapshot?.available&&phase!=='idle';
 let boat={...ROYAL_WORKING_WATER_ROUTE[0],yaw:0,moving:false};
 if(active&&phase==='outbound')boat=sampleRoyalHarborRoute(ROYAL_WORKING_WATER_ROUTE,elapsed/16);
 else if(active&&phase==='fishing')boat={...ROYAL_WORKING_WATER_ROUTE.at(-1)!,yaw:Math.PI*Math.max(0,Math.min(1,(elapsed-36)/4)),moving:false};
 else if(active&&phase==='returning')boat=sampleRoyalHarborRoute([...ROYAL_WORKING_WATER_ROUTE].reverse(),(elapsed-40)/20);
 else if(active&&phase==='docking')boat={...ROYAL_WORKING_WATER_ROUTE[0],yaw:Math.PI*(1-Math.max(0,Math.min(1,(elapsed-60)/6))),moving:false};
 let cart={...ROYAL_FISH_CART_ROUTE[0],yaw:Math.PI,moving:false};
 if(active&&elapsed<40)cart=sampleRoyalHarborRoute([...ROYAL_FISH_CART_ROUTE].reverse(),elapsed/40);
 else if(active&&phase==='transporting')cart=sampleRoyalHarborRoute(ROYAL_FISH_CART_ROUTE,(elapsed-88)/24);
 else if(active&&phase==='market')cart={...ROYAL_FISH_CART_ROUTE.at(-1)!,yaw:Math.PI,moving:false};
 return{boat,cart,phase,elapsed,active,now};
}
