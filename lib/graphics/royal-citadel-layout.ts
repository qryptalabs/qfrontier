/** Authored citadel coordinates. Shared by masonry, people and walking; these
 * values describe a local visit and never alter a saved expedition. */
export const ROYAL_CITADEL_BASELINE=Object.freeze({scale:3.05,baseY:67.7,originZ:-440});
export const ROYAL_CITADEL_TRANSFORM=Object.freeze({scale:30.5,baseY:480,originZ:-3800});
export const ROYAL_CITADEL_FLIGHT_STEPS=2070;
export function citadelWorldPoint(x:number,y:number,z:number){const t=ROYAL_CITADEL_TRANSFORM;return{x:x*t.scale,y:t.baseY+y*t.scale,z:t.originZ+z*t.scale};}
export function citadelLocalPoint(x:number,y:number,z:number){const t=ROYAL_CITADEL_TRANSFORM;return{x:x/t.scale,y:(y-t.baseY)/t.scale,z:(z-t.originZ)/t.scale};}
export const ROYAL_CITADEL_COURT_Y=citadelWorldPoint(0,1.3,0).y;
export const ROYAL_CITADEL_SIDE_CROSSING_Z=citadelWorldPoint(0,0,4).z;
export const ROYAL_CITADEL_ASCENTS=Object.freeze([
 {id:'first-ascent',startZ:-120,endZ:-450,startY:19.95,endY:160,width:48,steps:Math.ceil((160-19.95)/.16)},
 {id:'second-ascent',startZ:-650,endZ:-950,startY:160,endY:320,width:48,steps:1000},
 {id:'third-ascent',startZ:-1100,endZ:citadelWorldPoint(0,1.3,83).z,startY:320,endY:ROYAL_CITADEL_COURT_Y,width:48,steps:Math.ceil((ROYAL_CITADEL_COURT_Y-320)/.16)},
]);
export const ROYAL_CITADEL_LANDINGS=Object.freeze([
 {id:'first-terrace',startZ:-450,endZ:-650,y:160,width:6400},
 {id:'second-terrace',startZ:-950,endZ:-1100,y:320,width:5600},
 {id:'third-terrace',startZ:citadelWorldPoint(0,1.3,83).z,endZ:citadelWorldPoint(0,1.3,43).z,y:ROYAL_CITADEL_COURT_Y,width:4800,existingCitadelFloor:true},
]);
export const ROYAL_CITADEL_APPROACH=Object.freeze({x:0,halfWidth:24,startZ:-120,endZ:ROYAL_CITADEL_ASCENTS[2].endZ,startY:19.95,endY:ROYAL_CITADEL_COURT_Y,steps:ROYAL_CITADEL_ASCENTS.reduce((n,a)=>n+a.steps,0)});
export function royalApproachHeight(z:number){
 for(const a of ROYAL_CITADEL_ASCENTS)if(z<=a.startZ&&z>=a.endZ){const t=Math.max(0,Math.min(1,(z-a.startZ)/(a.endZ-a.startZ)));return a.startY+Math.floor(t*a.steps+.000001)/a.steps*(a.endY-a.startY);}
 for(const a of ROYAL_CITADEL_LANDINGS)if(z<=a.startZ&&z>=a.endZ)return a.y;
 return z>ROYAL_CITADEL_APPROACH.startZ?19.95:ROYAL_CITADEL_COURT_Y;
}

/** Matching the two switchback flights, not a smooth ramp over their treads. */
export function royalCitadelLocalWalkHeight(x:number,z:number):number|null{
 const ax=Math.abs(x),steps=ROYAL_CITADEL_FLIGHT_STEPS,quantize=(t:number)=>Math.min(steps,Math.floor(Math.max(0,Math.min(1,t))*steps+.000001)+1)/steps;
 if(ax<=4&&z>=8.3&&z<=15.5)return 22;
 if(ax<=3&&z>=14.8&&z<=22.25)return 22;
 if(ax>=3&&ax<=18&&Math.abs(z-19.5)<=2.75)return 11.65+quantize((18-ax)/15)*10.35;
 if(ax>=3&&ax<=18&&Math.abs(z-28)<=2.75)return 1.3+quantize((ax-3)/15)*10.35;
 if(ax>=18&&ax<=21&&z>=16.75&&z<=30.75)return 11.65;
 if(ax<=3&&z>=25.25&&z<=31)return 1.3;
 if(ax<=20&&z>=31&&z<=34.5)return 1.3;
 if(ax<=6.5&&z>=31&&z<=43)return 1.3;
 if(ax<=47&&z>=43&&z<=70)return 1.3;
 if(ax<=6.5&&z>=70&&z<=83)return 1.3;
 if(ax>=54&&ax<=67&&z>=-33&&z<=54)return 1.3;
 if(ax>=47&&ax<=67&&z>=43&&z<=54)return 1.3;
 return null;
}
export function royalCitadelWalkHeight(x:number,z:number):number|null{
 const p=citadelLocalPoint(x,0,z),localY=royalCitadelLocalWalkHeight(p.x,p.z);
 return localY===null?null:citadelWorldPoint(0,localY,0).y;
}
export const ROYAL_CITADEL_VISIT_SPAWN=Object.freeze(citadelWorldPoint(0,1.3,57));
