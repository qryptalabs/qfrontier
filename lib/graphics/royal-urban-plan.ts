import {ROYAL_GRAND_BRIDGE as B,royalRiver} from './royal-canal-layout.ts';
import {ROYAL_COURT_Y} from './royal-proportions.ts';
import {OLD_TOWN_STREETS,OLD_TOWN_FRONTAGES,OLD_TOWN_HOUSES,OLD_TOWN_SQUARE,OLD_TOWN_VENUES,oldTownOwns} from './royal-old-town-plan.ts';

export type RoyalStreetPoint={x:number;z:number;y:number};
export type RoyalStreet={id:string;width:number;points:readonly RoyalStreetPoint[]};
export const ROYAL_SERVICE_GATE=Object.freeze({minX:65,maxX:77,minZ:-73.2,maxZ:-64.8,y:ROYAL_COURT_Y,ceiling:6});
const p=(x:number,z:number,y=.92)=>({x,z,y});
const mirror=(side:number,points:readonly RoyalStreetPoint[])=>points.map(p=>({...p,x:p.x*side}));
/** A surveyed town plan. Ground, paving, collision floors and route authority
 * all consume this data. Saved player land and shop ownership are unrelated. */
export const ROYAL_BRIDGE_APPROACH=Object.freeze([
 p(246,320),p(360,320,6),p(408,220,12.5),p(408,80,20),p(342,48,24),p(250,70,B.deck),p(132,100,B.deck),
]);
export const ROYAL_COURT_SERVICE_LANE=Object.freeze([p(72,-69,ROYAL_COURT_Y),p(65,-69,ROYAL_COURT_Y),p(65,-75,ROYAL_COURT_Y),p(0,-75,ROYAL_COURT_Y),p(0,-69,ROYAL_COURT_Y)]);
export const ROYAL_PALACE_AVENUE=Object.freeze([
 ...ROYAL_BRIDGE_APPROACH.slice(0,4),p(350,-20,20.5),p(260,-60,21),p(170,-30,21),p(124,-60,18),...ROYAL_COURT_SERVICE_LANE,
]);
export const ROYAL_BRIDGE_TO_PALACE=Object.freeze([p(132,100,B.deck),p(148,76,B.deck),p(170,40,25),p(170,-30,21),...ROYAL_PALACE_AVENUE.slice(7)]);
export const ROYAL_CEREMONIAL_WALK=Object.freeze([p(32,180),p(32,130),p(104,130),p(104,20),p(0,20),p(0,-4,.665)]);
export const ROYAL_WEST_MARKET_EXIT=Object.freeze([p(-123,174),p(-123,180),p(-156,180),p(-156,320),p(-246,320)]);
export const ROYAL_BRIDGE_CROSSING=Object.freeze(Array.from({length:17},(_,i)=>p(-132+i*264/16,100,B.deck)));
export const ROYAL_PUBLIC_BRIDGE_ROUTE=Object.freeze([
 ...ROYAL_WEST_MARKET_EXIT,...mirror(-1,ROYAL_BRIDGE_APPROACH).slice(1),...ROYAL_BRIDGE_CROSSING.slice(1),...ROYAL_BRIDGE_TO_PALACE.slice(1),
]);
const streets:RoyalStreet[]=[
 ...[-1,1].map(side=>({id:`bridge-approach-${side}`,width:10,points:mirror(side,ROYAL_BRIDGE_APPROACH)})),
 {id:'palace-carriage-avenue',width:8,points:ROYAL_PALACE_AVENUE.slice(0,-ROYAL_COURT_SERVICE_LANE.length+1)},
 {id:'bridge-to-palace',width:8,points:ROYAL_BRIDGE_TO_PALACE.slice(0,-ROYAL_COURT_SERVICE_LANE.length+1)},
 {id:'court-service-lane',width:4,points:ROYAL_COURT_SERVICE_LANE},
 {id:'ceremonial-promenade',width:6,points:ROYAL_CEREMONIAL_WALK},
 {id:'west-market-exit',width:6,points:ROYAL_WEST_MARKET_EXIT},
];
for(const side of[-1,1]){
 for(const x of[32,64,104,156,204]){if(side===1&&(x===64||x===104))continue;streets.push({id:`quay-street-${side}-${x}`,width:x===32?6:8,points:[p(side*x,130),p(side*x,320)]});}
 for(const z of[130,180,222,276,320])streets.push({id:`cross-street-${side}-${z}`,width:8,points:[p(side*(side===1&&(z===180||z===222)?156:32),z),p(side*246,z)]});
 streets.push({id:`upper-burg-street-${side}`,width:6,points:[p(side*176,65,B.deck),p(side*242,65,B.deck)]},
 {id:`upper-burg-link-${side}`,width:6,points:[p(side*207,65,B.deck),p(side*207,80.93,B.deck)]});
}
streets.push(...OLD_TOWN_STREETS,...OLD_TOWN_FRONTAGES);
export const ROYAL_URBAN_STREETS:readonly RoyalStreet[]=Object.freeze(streets);
export const ROYAL_URBAN_PLAZAS=Object.freeze([
 ...[-1,1].map(side=>({id:`bridge-square-${side}`,x:side*132,z:100,y:B.deck,width:48,depth:32})),
 {id:'royal-lower-square',x:0,z:20,y:.92,width:42,depth:30},
 {id:'fish-market-square',x:44,z:228,y:.92,width:24,depth:10},
 OLD_TOWN_SQUARE,
]);
const platforms=[...ROYAL_URBAN_PLAZAS,...[-1,1].flatMap(side=>[{id:`upper-burg-${side}`,x:side*207,z:50,y:B.deck,width:84,depth:44},{id:`farm-${side}`,x:side*200,z:350,y:.92,width:64,depth:28}])];
const segments=streets.flatMap(street=>street.points.slice(1).map((b,i)=>{const a=street.points[i],dx=b.x-a.x,dz=b.z-a.z;return{street,a,b,dx,dz,length2:dx*dx+dz*dz,minX:Math.min(a.x,b.x)-street.width/2-30,maxX:Math.max(a.x,b.x)+street.width/2+30,minZ:Math.min(a.z,b.z)-street.width/2-30,maxZ:Math.max(a.z,b.z)+street.width/2+30};}));
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
export function royalUrbanRoadAt(x:number,z:number,padding=0):{height:number;width:number;id:string}|null{
 let nearest=Infinity,result:null|{height:number;width:number;id:string}=null;
 for(const s of segments){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;const t=Math.max(0,Math.min(1,((x-s.a.x)*s.dx+(z-s.a.z)*s.dz)/(s.length2||1))),d=Math.hypot(x-s.a.x-t*s.dx,z-s.a.z-t*s.dz);if(d<=s.street.width/2+padding&&d<nearest){nearest=d;result={height:s.a.y+(s.b.y-s.a.y)*t,width:s.street.width,id:s.street.id};}}
 return result;
}
export function royalUrbanWalkHeight(x:number,z:number):number|null{
 const road=royalUrbanRoadAt(x,z);if(road)return road.height;
 for(const a of ROYAL_URBAN_PLAZAS)if(Math.abs(x-a.x)<=a.width/2&&Math.abs(z-a.z)<=a.depth/2)return a.y;
 return null;
}
export function royalUrbanTerrain(x:number,z:number,fallback:number){
 if(Math.abs(x)>455||z< -85||z>365)return fallback;
 let target=fallback,weight=0,nearest=Infinity;
 // Flat lower blocks are separated from the raised bridge approaches.
 if(z>=120&&z<=346&&Math.abs(x)<=266){const w=1-smooth(Math.max(Math.abs(x)-246,132-z,z-326,0)/20);target=.8;weight=w;}
 for(const a of platforms){const d=Math.max(Math.abs(x-a.x)-a.width/2,Math.abs(z-a.z)-a.depth/2,0),w=1-smooth(d/24);if(w>weight){target=a.y-.12;weight=w;}}
 for(const s of segments){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;const t=Math.max(0,Math.min(1,((x-s.a.x)*s.dx+(z-s.a.z)*s.dz)/(s.length2||1))),d=Math.hypot(x-s.a.x-t*s.dx,z-s.a.z-t*s.dz),edge=Math.max(0,d-s.street.width/2-2),w=1-smooth(edge/28);if((w>=weight&&d<nearest)||w>weight){nearest=d;target=s.a.y+(s.b.y-s.a.y)*t-.12;weight=w;}}
 return fallback+(target-fallback)*weight;
}
export function royalUrbanReserved(x:number,z:number,padding=0){return !!royalUrbanRoadAt(x,z,padding)||platforms.some(a=>Math.abs(x-a.x)<a.width/2+padding&&Math.abs(z-a.z)<a.depth/2+padding)||ROYAL_URBAN_BUILDINGS.some(b=>Math.abs(x-b.x)<10+padding&&Math.abs(z-b.z)<10+padding)||OLD_TOWN_VENUES.some(v=>Math.abs(x-v.x)<v.width/2+padding&&Math.abs(z-v.z)<v.depth/2+padding);}
export type RoyalUrbanBuilding={id:string;kind:'home'|'market'|'warehouse'|'workshop';variant:number;x:number;z:number;yaw:number;district:'port'|'market'|'residential'|'upper';oldTown?:true};
const buildings:RoyalUrbanBuilding[]=[];
for(const side of[-1,1])for(const [row,x]of[47,84,128,180,224].entries())for(const [i,z]of[152,201,249,298].entries()){
 if(side<0&&x>=72&&x<=140&&z<180)continue;
 if(row===0&&i===2)continue;
 const kind=row===0&&i<2?'warehouse':row===1?'market':row===2&&i<2?'workshop':'home';
 buildings.push({id:`royal-block-${side}-${row}-${i}`,kind,variant:i+row*3+(side+1),x:side*x,z,yaw:-side*Math.PI/2,district:row===0?'port':row<=2?'market':'residential'});
}
for(const side of[-1,1]){
 buildings.push({id:`fish-warehouse-${side}`,kind:'warehouse',variant:4,x:side*51,z:236,yaw:-side*Math.PI/2,district:'port'});
 for(const [i,x]of[184,207,230].entries())buildings.push({id:`upper-burg-home-${side}-${i}`,kind:i===1?'workshop':'home',variant:i+6,x:side*x,z:48,yaw:0,district:'upper'});
}
export const ROYAL_URBAN_BUILDINGS:readonly RoyalUrbanBuilding[]=Object.freeze([...buildings.filter(b=>!oldTownOwns(b.x,b.z)),...OLD_TOWN_HOUSES].filter(b=>!royalRiver(b.x,b.z).water));
