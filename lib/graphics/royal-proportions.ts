/** One metre convention for the royal district. Legacy authored geometry is
 * retained as a blueprint; people, furnishings and navigation use real metres. */
export const ROYAL_ARCHITECTURE_SCALE=1/30;
export const ROYAL_PORT_OFFSET=3800/30;
export const ROYAL_CASTLE_SCALE=30.5/30;
export const ROYAL_CASTLE_BASE=480/30;
export const ROYAL_COURT_Y=519.65/30;
export const ROYAL_HUMAN_HEIGHT=1.75;
export function royalCompact(p:{x:number;y:number;z:number}){return{x:p.x/30,y:p.y/30,z:p.z/30};}
export const HUMAN_ASCENTS=Object.freeze([
 {startZ:-4,endZ:-13.5,startY:19.95/30,endY:160/30,width:4},
 {startZ:-16.5,endZ:-27,startY:160/30,endY:320/30,width:4},
 {startZ:-29.5,endZ:-1268.5/30,startY:320/30,endY:ROYAL_COURT_Y,width:4},
].map(a=>({...a,steps:Math.ceil((a.endY-a.startY)/.16)})));
export const HUMAN_LANDINGS=Object.freeze([
 {startZ:-13.5,endZ:-16.5,y:160/30,width:6400/30},
 {startZ:-27,endZ:-29.5,y:320/30,width:5600/30},
 {startZ:-1268.5/30,endZ:-2488.5/30,y:ROYAL_COURT_Y,width:4800/30},
]);
export function humanApproachHeight(z:number):number|null{for(const a of HUMAN_ASCENTS)if(z<=a.startZ&&z>=a.endZ){const t=(z-a.startZ)/(a.endZ-a.startZ);return a.startY+Math.min(a.steps,Math.floor(t*a.steps+1e-6))/a.steps*(a.endY-a.startY);}for(const a of HUMAN_LANDINGS)if(z<=a.startZ&&z>=a.endZ)return a.y;return null;}
export type HumanRoyalRoom={id:string;name:string;minX:number;maxX:number;minZ:number;maxZ:number;y:number;ceiling:number};
const F=1151/30,U=F+4.8;
export const HUMAN_ROOMS:readonly HumanRoyalRoom[]=Object.freeze([
 {id:'vestibule',name:'Vestíbulo de la Corona',minX:-5,maxX:5,minZ:-122,maxZ:-110.9,y:F,ceiling:9},
 {id:'reception',name:'Salón de los Estandartes',minX:-12,maxX:12,minZ:-130,maxZ:-121,y:F,ceiling:11},
 {id:'gallery',name:'Galería de las Victorias',minX:-12,maxX:14,minZ:-134,maxZ:-130,y:U,ceiling:8},
 {id:'stair-landing',name:'Descanso imperial',minX:1.2,maxX:6,minZ:-130,maxZ:-124,y:U,ceiling:6.2},
 {id:'throne',name:'Salón del Trono',minX:-10,maxX:10,minZ:-164,maxZ:-134,y:U,ceiling:10},
 {id:'east-gallery',name:'Galería de la Guardia Real',minX:14,maxX:24,minZ:-134,maxZ:-130,y:U,ceiling:6},
 {id:'east-corridor',name:'Pasillo de la Torre del Alba',minX:20,maxX:24,minZ:-130,maxZ:-114,y:U,ceiling:6},
 {id:'tower-approach',name:'Acceso a la torre',minX:20,maxX:25.1,minZ:-114,maxZ:-110.1,y:U,ceiling:5},
]);
export const HUMAN_INTERIOR_STAIRS=Object.freeze({minX:-8.4,maxX:1.2,minZ:-129,maxZ:-125,startY:F,endY:U,steps:32});
export const HUMAN_TOWER=Object.freeze({x:786.9/30,z:-3363.85/30,radius:2.05,width:1.05,startY:U,endY:67,startAngle:Math.PI,stride:.28,steps:Math.ceil((67-U)/.155)});
export function humanTowerPoint(step:number){const t=HUMAN_TOWER,i=Math.max(0,Math.min(t.steps,step)),a=t.startAngle+i*t.stride/t.radius;return{x:t.x+Math.cos(a)*t.radius,y:t.startY+i/t.steps*(t.endY-t.startY),z:t.z+Math.sin(a)*t.radius};}
export const HUMAN_INTERIOR_ENTRY=Object.freeze({x:0,y:F,z:-117.8});
export const HUMAN_INTERIOR_THRONE=Object.freeze({x:0,y:U,z:-140});
export const HUMAN_INTERIOR_LOOKOUT=Object.freeze(humanTowerPoint(HUMAN_TOWER.steps));
export const HUMAN_CITADEL_SPAWN=Object.freeze({x:0,y:ROYAL_COURT_Y,z:-2061.5/30});
const inRect=(x:number,z:number,r:{minX:number;maxX:number;minZ:number;maxZ:number})=>x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ;
export function humanInteriorWalkHeight(x:number,z:number,referenceY?:number):number|null{
 const t=HUMAN_TOWER,s=HUMAN_INTERIOR_STAIRS,candidates:number[]=[],r=Math.hypot(x-t.x,z-t.z),onSpiral=Math.abs(r-t.radius)<=t.width/2+.04;
 for(const room of HUMAN_ROOMS)if(inRect(x,z,room)&&!inRect(x,z,s)&&!(room.id==='tower-approach'&&onSpiral))candidates.push(room.y);
 if(inRect(x,z,s)){const n=Math.min(s.steps,Math.floor(Math.max(0,(x-s.minX)/(s.maxX-s.minX))*s.steps+1e-6)+1);candidates.push(s.startY+n/s.steps*(s.endY-s.startY));}
 if(onSpiral){let a=(Math.atan2(z-t.z,x-t.x)-t.startAngle)%(Math.PI*2);if(a<0)a+=Math.PI*2;for(let b=a;b<=t.steps*t.stride/t.radius+.001;b+=Math.PI*2){const n=Math.min(t.steps,Math.floor(b*t.radius/t.stride+1e-5));candidates.push(t.startY+n/t.steps*(t.endY-t.startY));}}
 const end=HUMAN_INTERIOR_LOOKOUT;if(Math.hypot(x-end.x,z-end.z)<.8)candidates.push(t.endY);
 if(!candidates.length)return null;return candidates.sort((a,b)=>Math.abs(a-(referenceY??F))-Math.abs(b-(referenceY??F)))[0];
}
export function humanInteriorLocation(x:number,y:number,z:number){const t=HUMAN_TOWER;if(Math.abs(Math.hypot(x-t.x,z-t.z)-t.radius)<.8&&y>=t.startY-.2)return y>t.endY-.3?'Mirador de la Torre del Alba':'Escalera de la Torre del Alba';return HUMAN_ROOMS.find(r=>inRect(x,z,r)&&Math.abs(y-r.y)<.5)?.name??'';}
