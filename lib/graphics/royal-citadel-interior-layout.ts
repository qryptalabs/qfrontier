import {citadelWorldPoint} from './royal-citadel-layout.ts';

export type RoyalInteriorPoint={x:number;y:number;z:number};
export type RoyalInteriorRect={id:string;name:string;minX:number;maxX:number;minZ:number;maxZ:number;y:number;ceiling:number};
export const ROYAL_INTERIOR_FLOOR=citadelWorldPoint(0,22,0).y;
const Y=ROYAL_INTERIOR_FLOOR,U=Y+36;
export const ROYAL_INTERIOR_ROOMS:readonly RoyalInteriorRect[]=Object.freeze([
 {id:'vestibule',name:'Vestíbulo de la Corona',minX:-100,maxX:100,minZ:-3590,maxZ:-3330,y:Y,ceiling:46},
 {id:'reception',name:'Salón de los Estandartes',minX:-160,maxX:160,minZ:-3730,maxZ:-3580,y:Y,ceiling:54},
 {id:'stair-foot',name:'Escalera imperial',minX:-18,maxX:0,minZ:-3750,maxZ:-3710,y:Y,ceiling:66},
 {id:'stair-landing',name:'Descanso imperial',minX:120,maxX:144,minZ:-3750,maxZ:-3705,y:U,ceiling:30},
 {id:'gallery',name:'Galería de las Victorias',minX:-160,maxX:144,minZ:-3780,maxZ:-3750,y:U,ceiling:38},
 {id:'throne',name:'Salón del Trono',minX:-90,maxX:90,minZ:-3930,maxZ:-3770,y:U,ceiling:50},
 {id:'east-gallery',name:'Galería de la Guardia Real',minX:140,maxX:520,minZ:-3780,maxZ:-3760,y:U,ceiling:24},
 {id:'east-corridor',name:'Pasillo de la Torre del Alba',minX:500,maxX:520,minZ:-3780,maxZ:-3354,y:U,ceiling:24},
 {id:'tower-approach',name:'Acceso a la torre',minX:510,maxX:735,minZ:-3374,maxZ:-3354,y:U,ceiling:24},
]);
export const ROYAL_INTERIOR_STAIRS=Object.freeze({id:'imperial-stairs',minX:0,maxX:120,minZ:-3750,maxZ:-3730,startY:Y,endY:U,steps:240});
export const ROYAL_INTERIOR_DAIS=Object.freeze({minX:-32,maxX:32,minZ:-3925,maxZ:-3905,y:U+1.2,stairMinZ:-3905,stairMaxZ:-3901,steps:8});
export const ROYAL_INTERIOR_TOWER=Object.freeze({x:786.9,z:-3363.85,radius:60,width:8,startY:U,endY:2010,startAngle:Math.PI,steps:Math.ceil((2010-U)/.16),stride:.45,platformInnerRadius:48,platformOuterRadius:81});
export function royalTowerStepPoint(step:number):RoyalInteriorPoint{const t=ROYAL_INTERIOR_TOWER,i=Math.max(0,Math.min(t.steps,step)),a=t.startAngle+i*t.stride/t.radius;return{x:t.x+Math.cos(a)*t.radius,y:t.startY+i/t.steps*(t.endY-t.startY),z:t.z+Math.sin(a)*t.radius};}
export const ROYAL_INTERIOR_ENTRY=Object.freeze({x:0,y:Y,z:-3535});
export const ROYAL_INTERIOR_THRONE=Object.freeze({x:0,y:U,z:-3865});
export const ROYAL_INTERIOR_LOOKOUT=Object.freeze({...royalTowerStepPoint(ROYAL_INTERIOR_TOWER.steps),y:ROYAL_INTERIOR_TOWER.endY});
export const ROYAL_INTERIOR_ROUTE:readonly RoyalInteriorPoint[]=Object.freeze([
 {x:0,y:Y,z:-3331},{x:0,y:Y,z:-3650},{x:0,y:Y,z:-3740},{x:120,y:U,z:-3740},{x:132,y:U,z:-3755},{x:0,y:U,z:-3755},{x:0,y:U,z:-3890},
]);
export const ROYAL_INTERIOR_TOWER_ROUTE:readonly RoyalInteriorPoint[]=Object.freeze([
 {x:132,y:U,z:-3765},{x:510,y:U,z:-3770},{x:510,y:U,z:-3364},{x:726.9,y:U,z:-3363.85},
]);
const inRect=(x:number,z:number,r:{minX:number;maxX:number;minZ:number;maxZ:number},pad=0)=>x>=r.minX-pad&&x<=r.maxX+pad&&z>=r.minZ-pad&&z<=r.maxZ+pad;
/** Choose the physical floor next to the feet, including repeated tower turns.
 * A reference height prevents jumping between vertically stacked stair flights. */
export function royalInteriorWalkHeight(x:number,z:number,referenceY?:number):number|null{
 const candidates:number[]=[];
 const t=ROYAL_INTERIOR_TOWER,dx=x-t.x,dz=z-t.z,r=Math.hypot(dx,dz);
 const s=ROYAL_INTERIOR_STAIRS,onStairs=inRect(x,z,s),d=ROYAL_INTERIOR_DAIS,onDais=x>=d.minX&&x<=d.maxX&&z>=d.minZ&&z<=d.stairMaxZ,onSpiral=r>=t.radius-t.width/2-.15&&r<=t.radius+t.width/2+.15;
 for(const room of ROYAL_INTERIOR_ROOMS)if(inRect(x,z,room)&&!onStairs&&!onDais&&!(onSpiral&&room.id==='tower-approach'))candidates.push(room.y);
 if(onStairs){const u=Math.max(0,Math.min(1,x/120));candidates.push(s.startY+Math.min(s.steps,Math.floor(u*s.steps+1e-6)+1)/s.steps*(s.endY-s.startY));}
 if(onDais){const u=Math.max(0,Math.min(1,(d.stairMaxZ-z)/(d.stairMaxZ-d.stairMinZ)));candidates.push(z<=d.stairMinZ?d.y:U+Math.floor(u*d.steps+1e-6)/d.steps*1.2);}
 if(onSpiral){let a=(Math.atan2(dz,dx)-t.startAngle)%(Math.PI*2);if(a<0)a+=Math.PI*2;const maxAngle=t.steps*t.stride/t.radius;for(let angle=a;angle<=maxAngle+.001;angle+=Math.PI*2){const step=Math.min(t.steps,Math.floor(angle*t.radius/t.stride+1e-5)+1);candidates.push(t.startY+step/t.steps*(t.endY-t.startY));}}
 const endAngle=t.startAngle+t.steps*t.stride/t.radius,exitAngle=((Math.atan2(dz,dx)-endAngle)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
 if((!onSpiral||exitAngle<=.06)&&r>=t.platformInnerRadius&&r<=t.platformOuterRadius)candidates.push(t.endY);
 if(!candidates.length)return null;
 if(referenceY===undefined)return candidates[0];
 candidates.sort((a,b)=>Math.abs(a-referenceY)-Math.abs(b-referenceY));return candidates[0];
}
export function royalInteriorLocation(x:number,y:number,z:number){
 const t=ROYAL_INTERIOR_TOWER;if(Math.hypot(x-t.x,z-t.z)<88&&y>=t.startY-1)return y>t.endY-2?'Mirador de la Torre del Alba':'Escalera de la Torre del Alba';
 return ROYAL_INTERIOR_ROOMS.filter(r=>inRect(x,z,r)&&Math.abs(r.y-y)<3).sort((a,b)=>(a.maxX-a.minX)*(a.maxZ-a.minZ)-(b.maxX-b.minX)*(b.maxZ-b.minZ))[0]?.name??'';
}
export const ROYAL_INTERIOR_POSTS=Object.freeze([
 ...[-1,1].map(side=>({id:`inner-door-${side}`,x:side*12,y:Y,z:-3560,yaw:0})),
 ...[-1,1].map(side=>({id:`imperial-sentinel-${side}`,x:side*25,y:Y,z:-3695,yaw:0})),
 ...[-1,1].map(side=>({id:`throne-door-${side}`,x:side*17,y:U,z:-3788,yaw:0})),
 ...[-1,1].map(side=>({id:`throne-elite-${side}`,x:side*20,y:U+1.2,z:-3914,yaw:0})),
 {id:'tower-door',x:680,y:U,z:-3357,yaw:-Math.PI/2},
 {id:'lookout',x:ROYAL_INTERIOR_TOWER.x+(ROYAL_INTERIOR_LOOKOUT.x-ROYAL_INTERIOR_TOWER.x)*1.2,y:ROYAL_INTERIOR_TOWER.endY,z:ROYAL_INTERIOR_TOWER.z+(ROYAL_INTERIOR_LOOKOUT.z-ROYAL_INTERIOR_TOWER.z)*1.2,yaw:0},
]);
export const ROYAL_INTERIOR_PATROLS=Object.freeze([
 {id:'hall-west',route:[{x:-65,y:Y,z:-3620},{x:-65,y:Y,z:-3690},{x:-45,y:Y,z:-3690},{x:-45,y:Y,z:-3620},{x:-65,y:Y,z:-3620}]},
 {id:'hall-east',route:[{x:65,y:Y,z:-3620},{x:65,y:Y,z:-3690},{x:45,y:Y,z:-3690},{x:45,y:Y,z:-3620},{x:65,y:Y,z:-3620}]},
 {id:'royal-gallery',route:[{x:170,y:U,z:-3767},{x:460,y:U,z:-3767},{x:460,y:U,z:-3773},{x:170,y:U,z:-3773},{x:170,y:U,z:-3767}]},
 {id:'throne-west',route:[{x:-58,y:U,z:-3808},{x:-58,y:U,z:-3880},{x:-48,y:U,z:-3880},{x:-48,y:U,z:-3808},{x:-58,y:U,z:-3808}]},
]);
export const ROYAL_INTERIOR_SERVICE_ROUTES=Object.freeze([
 {id:'royal-steward',route:[{x:75,y:U,z:-3810},{x:75,y:U,z:-3870},{x:67,y:U,z:-3870},{x:67,y:U,z:-3810},{x:75,y:U,z:-3810}]},
 {id:'lamp-keeper',route:[{x:85,y:Y,z:-3615},{x:85,y:Y,z:-3690},{x:77,y:Y,z:-3690},{x:77,y:Y,z:-3615},{x:85,y:Y,z:-3615}]},
]);
