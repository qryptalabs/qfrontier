import { WORLD_SETTLEMENTS, WORLD_CHUNK_SIZE, sampleWorld, type WorldBiome, type WorldSettlement } from './world-geography.ts';
import { isLivingSettlement, livingRoutePose, distanceToSegment, type LivingPoint, type LivingBuilding, type LivingResident } from './living-zone-data.ts';
import { stableSeed } from './scene-data.ts';

export type InhabitedSurface='stone'|'earth'|'snow'|'sand';
export interface InhabitedProfile {readonly label:string;readonly industry:string;readonly transport:'cart'|'sled'|'camel';readonly workforce:readonly LivingResident['role'][]}
export interface InhabitedPlace extends WorldSettlement {readonly width:number;readonly depth:number;readonly localWidth:number;readonly localDepth:number;readonly height:number;readonly rotation:number;readonly layout:'radial'|'lanes'|'terraces'|'harbor';readonly boundary:'wall'|'fence'|'open';readonly boundaryShape:'ellipse'|'rectangle';readonly buildingCount:number;readonly residentCount:number;readonly profile:InhabitedProfile}
export interface InhabitedBuilding extends LivingBuilding {readonly biome:WorldBiome;readonly variant:number;readonly construction:boolean}
export interface InhabitedPath {readonly id:string;readonly owner:string;readonly biome:WorldBiome;readonly width:number;readonly points:readonly LivingPoint[];readonly surface:InhabitedSurface;readonly external:boolean}
export interface InhabitedPathSegment {readonly id:string;readonly owner:string;readonly biome:WorldBiome;readonly width:number;readonly surface:InhabitedSurface;readonly a:LivingPoint;readonly b:LivingPoint;readonly ha:number;readonly hb:number;readonly external:boolean}
export interface InhabitedResident extends LivingResident {readonly biome:WorldBiome}
export interface InhabitedProp extends LivingPoint {readonly id:string;readonly owner:string;readonly biome:WorldBiome;readonly kind:'tree'|'lamp'|'workbench'|'crates'|'fountain';readonly width:number;readonly depth:number;readonly rotation:number;readonly scale:number}
export interface InhabitedCart extends InhabitedResident {readonly kind:'cart'|'sled'|'camel'}
export interface InhabitedFoundation extends LivingPoint {readonly buildingId:string;readonly width:number;readonly depth:number;readonly height:number;readonly feather:number}
export interface InhabitedChunkData {readonly places:readonly InhabitedPlace[];readonly buildings:readonly InhabitedBuilding[];readonly foundations:readonly InhabitedFoundation[];readonly pathSegments:readonly InhabitedPathSegment[];readonly residents:readonly InhabitedResident[];readonly props:readonly InhabitedProp[];readonly carts:readonly InhabitedCart[]}
const ROLES:readonly LivingResident['role'][]=Object.freeze(['worker','guard','merchant','farmer','woodcutter','builder']);
export const INHABITED_PROFILES:Readonly<Record<WorldBiome,InhabitedProfile>>=Object.freeze({
  ice:Object.freeze({label:'Asentamiento glacial',industry:'Invernaderos, talla de hielo y transporte con trineos',transport:'sled',workforce:Object.freeze(['builder','worker','merchant','guard','farmer'] as const)}),
  desert:Object.freeze({label:'Oasis y caravanas',industry:'Cultivos de oasis, artesanía y caravanas',transport:'camel',workforce:Object.freeze(['merchant','worker','farmer','guard','builder'] as const)}),
  forest:Object.freeze({label:'Comunidad del bosque',industry:'Carpintería, cultivos y mercado local',transport:'cart',workforce:ROLES}),
  tropical:Object.freeze({label:'Comunidad tropical',industry:'Cultivos tropicales, jardines y talleres',transport:'cart',workforce:Object.freeze(['farmer','worker','merchant','woodcutter','builder','guard'] as const)}),
  mountain:Object.freeze({label:'Pueblo de la sierra',industry:'Cantería, almacenes y caminos de montaña',transport:'cart',workforce:Object.freeze(['worker','builder','guard','merchant','farmer'] as const)}),
  coast:Object.freeze({label:'Villa costera',industry:'Mercado costero, almacenes y cultivos protegidos',transport:'cart',workforce:Object.freeze(['merchant','worker','builder','guard','farmer'] as const)}),
  plains:Object.freeze({label:'Comunidad agrícola',industry:'Molinos, huertos y transporte de cosechas',transport:'cart',workforce:ROLES}),
  ocean:Object.freeze({label:'Puerto insular',industry:'Almacenes y comercio portuario',transport:'cart',workforce:ROLES}),
});
type Plan={place:InhabitedPlace;sx:number;sy:number;buildings:InhabitedBuilding[];paths:InhabitedPath[];residents:InhabitedResident[];props:InhabitedProp[];carts:InhabitedCart[]};
const places:InhabitedPlace[]=[],buildings:InhabitedBuilding[]=[],paths:InhabitedPath[]=[],residents:InhabitedResident[]=[],props:InhabitedProp[]=[],carts:InhabitedCart[]=[];
const point=(x:number,y:number):LivingPoint=>Object.freeze({x,y});
const surface=(biome:WorldBiome):InhabitedSurface=>biome==='ice'?'snow':biome==='desert'?'sand':biome==='mountain'?'stone':'earth';
function world(plan:Plan,p:LivingPoint):LivingPoint {const c=Math.cos(plan.place.rotation),s=Math.sin(plan.place.rotation),x=p.x*plan.sx,y=p.y*plan.sy;return point(plan.place.x+x*c-y*s,plan.place.y+x*s+y*c);}
function addPath(plan:Plan,label:string,points:readonly LivingPoint[],width=2):readonly LivingPoint[] {const converted=Object.freeze(points.map(p=>world(plan,p)));plan.paths.push(Object.freeze({id:`${plan.place.id}-${label}-${plan.paths.length}`,owner:plan.place.id,biome:plan.place.biome,width:width*Math.min(plan.sx,plan.sy),points:converted,surface:plan.place.kind==='city'&&plan.place.biome!=='ice'&&plan.place.biome!=='desert'?'stone':surface(plan.place.biome),external:false}));return converted;}
function footprint(kind:LivingBuilding['kind']):readonly[number,number] {return kind==='windmill'?[7.6,5]:kind==='market'?[7,5]:kind==='keep'?[4.6,4.4]:kind==='hall'?[4.6,4.4]:kind==='tower'?[2.8,2.8]:[2.7,2.6];}
function addBuilding(plan:Plan,kind:LivingBuilding['kind'],local:LivingPoint,scale:number,yaw:number,level:1|2|3):InhabitedBuilding {
  const p=world(plan,local),rotation=yaw-plan.place.rotation,size=scale*Math.min(plan.sx,plan.sy),[w,d]=footprint(kind),c=Math.abs(Math.cos(rotation)),s=Math.abs(Math.sin(rotation)),index=plan.buildings.length;
  const b:InhabitedBuilding=Object.freeze({...p,id:`${plan.place.id}-building-${index}`,owner:plan.place.id,biome:plan.place.biome,kind,scale:size,rotation,width:(w*c+d*s)*size,depth:(w*s+d*c)*size,level,variant:(stableSeed(plan.place.id)+index*13)%11,construction:plan.place.stage==='construction'&&!['garden','market','windmill'].includes(kind)&&index%3!==2});plan.buildings.push(b);return b;
}
function addProp(plan:Plan,kind:InhabitedProp['kind'],local:LivingPoint,w:number,d:number,rotation=0) {const yaw=rotation-plan.place.rotation,c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),scale=Math.min(plan.sx,plan.sy);plan.props.push(Object.freeze({...world(plan,local),id:`${plan.place.id}-prop-${plan.props.length}`,owner:plan.place.id,biome:plan.place.biome,kind,width:(w*c+d*s)*scale,depth:(w*s+d*c)*scale,rotation:yaw,scale}));}
type Access={building:InhabitedBuilding;route:readonly LivingPoint[]};
function inhabitants(plan:Plan,access:readonly Access[],main:readonly LivingPoint[]) {
  const count=plan.place.kind==='city'?42:plan.place.stage==='construction'?12:8+plan.place.tier*2;
  const workforce=plan.place.profile.workforce;
  for(let i=0;i<count;i++) {
    const role:LivingResident['role']=plan.place.stage==='construction'&&i%2===0?'builder':workforce[i%workforce.length];
    const wanted=role==='farmer'?['garden']:role==='merchant'?['market']:role==='builder'?['workshop','home']:role==='woodcutter'?['workshop']:['warehouse','logistics','kitchen'];
    const targets=access.filter(a=>wanted.includes(a.building.kind)),target=targets[(i+Math.floor(i/workforce.length))%Math.max(1,targets.length)]??access[0];
    const route=role==='guard'?main:target.route;
    plan.residents.push(Object.freeze({id:`${plan.place.id}-resident-${i}`,owner:plan.place.id,biome:plan.place.biome,role,route,speed:.65+(i%5)*.09,phase:(stableSeed(plan.place.id)%997)/997+i*.173,working:role!=='guard'}));
  }
  plan.carts.push(Object.freeze({id:`${plan.place.id}-transport`,owner:plan.place.id,biome:plan.place.biome,role:'merchant',kind:plan.place.profile.transport,route:main,speed:plan.place.biome==='ice'?1.0:1.15,phase:.317,working:true}));
}
function lanes(plan:Plan) {
  const access:Access[]=[],main=addPath(plan,'main', [point(0,-52),point(0,52)],3.8);
  addPath(plan,'cross',[point(-42,0),point(42,0)],3.8);
  for(const x of[-22,22])addPath(plan,`lane-${x}`,[point(x,-46),point(x,46)],2);
  const specs:{kind:LivingBuilding['kind'];x:number;y:number;scale:number}[]=[];
  for(const x of[-12,12])for(const y of[-24,-8,8])specs.push({kind:'home',x,y,scale:2.8+(plan.place.tier-1)*.1});
  specs.push({kind:'workshop',x:-12,y:24,scale:2.9},{kind:'warehouse',x:12,y:24,scale:3},{kind:'market',x:12,y:-40,scale:.85},{kind:'kitchen',x:-12,y:-40,scale:2.8},{kind:'garden',x:-12,y:40,scale:3.3},{kind:'garden',x:12,y:40,scale:3.3},{kind:'windmill',x:-32,y:24,scale:1.05},{kind:'barracks',x:32,y:24,scale:2.7});
  if(plan.place.stage==='construction')specs.splice(1,1),specs.splice(3,1);
  else if(plan.place.tier>=2)for(const x of[-32,32])specs.push({kind:'home',x,y:-8,scale:2.8});
  if(plan.place.stage!=='construction'&&plan.place.tier===3)for(const x of[-32,32])specs.push({kind:'logistics',x,y:-26,scale:2.6});
  for(const [specIndex,source]of specs.entries()) {
    // Small seeded offsets keep equal-tier communities from sharing a stamped
    // blueprint while preserving the common, collision-free street corridor.
    const jitter=stableSeed(`${plan.place.id}:layout:${specIndex}`),spec={...source,x:source.x+((jitter%101)/100-.5)*1.0,y:source.y+((Math.floor(jitter/101)%101)/100-.5)*.9};
    const sign=Math.sign(spec.x),lane=Math.abs(spec.x)>22?sign*22:0,yaw=-sign*Math.PI/2,b=addBuilding(plan,spec.kind,point(spec.x,spec.y),spec.scale,yaw,plan.place.tier),half=footprint(spec.kind)[1]*spec.scale/2;
    const end=point(spec.x-sign*(half+1.5),spec.y),route=Object.freeze([point(0,0),point(lane,0),point(lane,spec.y),end].map(p=>world(plan,p)));addPath(plan,'frontage',[point(lane,spec.y),end],1.6);access.push({building:b,route});
    if(spec.kind==='workshop')addProp(plan,'workbench',point(end.x+sign*.85,end.y),2,.65,yaw);
    if(spec.kind==='warehouse')addProp(plan,'crates',point(end.x+sign*.8,end.y+1.6),1,1);
  }
  for(const x of[-35,35])for(const y of[-41,42])addProp(plan,'tree',point(x,y),2,2);
  inhabitants(plan,access,main);
}
function radial(plan:Plan) {
  const city=plan.place.kind==='city',access:Access[]=[],radii=city?[14,34,54,76]:[12,32],counts=city?[16,32,48,48]:[16,16];
  const rings=new Map<number,LivingPoint[]>();
  for(let ring=0;ring<radii.length;ring++){const r=radii[ring],n=counts[ring],p=Array.from({length:n+1},(_,i)=>point(Math.cos(i*Math.PI*2/n)*r,Math.sin(i*Math.PI*2/n)*r));rings.set(r,p);addPath(plan,`ring-${r}`,p,city?2.7:2.0);}
  const extent=city?111:53,main=addPath(plan,'main',[point(-extent,0),point(extent,0)],city?5:3.4);
  addPath(plan,'cross',[point(0,-extent),point(0,extent)],city?5:3.4);
  function structure(kind:LivingBuilding['kind'],r:number,angle:number,scale:number,road:number,level:1|2|3=plan.place.tier) {
    const p=point(Math.cos(angle)*r,Math.sin(angle)*r),b=addBuilding(plan,kind,p,scale,Math.atan2(-p.x,-p.y),level),center=world(plan,point(0,0)),vx=b.x-center.x,vy=b.y-center.y,length=Math.hypot(vx,vy),ux=vx/length,uy=vy/length;
    const half=Math.min(Math.abs(ux)>.0001?b.width/2/Math.abs(ux):Infinity,Math.abs(uy)>.0001?b.depth/2/Math.abs(uy):Infinity),endR=Math.max(0,r-(half+1.25)/(length/r)),end=point(Math.cos(angle)*endR,Math.sin(angle)*endR);
    let route:LivingPoint[]=[point(0,0)];
    if(road){const ring=rings.get(road)!,n=ring.length-1,index=((Math.round(angle/(Math.PI*2)*n)%n)+n)%n;route=[point(0,0),...ring.slice(0,index+1),end];}
    else route.push(end);
    const converted=Object.freeze(route.map(p=>world(plan,p)));addPath(plan,'frontage',route.slice(-2),1.6);access.push({building:b,route:converted});
  }
  if(city) {
    for(const[r,n,road]of[[24,8,14],[44,16,34],[64,24,54]])for(let i=0;i<n;i++){const angle=(i+.5)*Math.PI*2/n,kind:LivingBuilding['kind']=i%7===0?'workshop':i%9===0?'warehouse':i%11===0?'kitchen':'home';structure(kind,r,angle,3.1+(i%3)*.15,road);}
    for(let i=0;i<4;i++)structure('market',8,(i+.5)*Math.PI/2,.62,0);
    structure('keep',94,-Math.PI/6,4.6,76);structure('hall',94,Math.PI*5/6,4.2,76);
    for(const degrees of[15,45,75,195,225,255])structure('garden',94,degrees*Math.PI/180,3.8,76,1);
    for(const degrees of[105,285])structure('windmill',94,degrees*Math.PI/180,1.25,76);
    for(let i=0;i<8;i++)structure('tower',112,(i+.5)*Math.PI/4,2.1,76);
  } else {
    const homes=plan.place.stage==='construction'?6:8;
    for(let i=0;i<homes;i++)structure('home',22,(i+.5)*Math.PI/4,2.8,12);
    for(const [kind,x,y]of[['workshop',36,16],['warehouse',-36,-16],['kitchen',36,-16],['market',-36,16]] as const){const r=Math.hypot(x,y),a=Math.atan2(y,x),road=rings.get(32)!,n=road.length-1,snapped=Math.round(a/(Math.PI*2)*n)*(Math.PI*2)/n;structure(kind,r,snapped,kind==='market'?.85:2.8,32);}
    for(const x of[-14,14])structure('garden',Math.hypot(x,-40),Math.atan2(-40,x),3.1,32,1);
    structure('windmill',Math.hypot(14,40),Math.atan2(40,14),1.05,32);
    structure('barracks',Math.hypot(-14,40),Math.atan2(40,-14),2.6,32);
    if(plan.place.tier>=2&&plan.place.stage!=='construction')structure('logistics',46,Math.PI*.25,2.3,32);
    if(plan.place.tier===3&&plan.place.stage!=='construction')structure('laboratory',46,Math.PI*1.25,2.3,32);
  }
  for(let i=0;i<(city?12:4);i++){const a=(i+.5)*Math.PI*2/(city?12:4),r=city?84:45;addProp(plan,'tree',point(Math.cos(a)*r,Math.sin(a)*r),2,2);}
  inhabitants(plan,access,main);
}

for(const catalog of WORLD_SETTLEMENTS) {
  if(isLivingSettlement(catalog.id))continue;
  const seed=stableSeed(catalog.id),city=catalog.kind==='city',layout:InhabitedPlace['layout']=city?(catalog.biome==='ice'?'terraces':catalog.biome==='forest'?'harbor':'radial'):catalog.biome==='mountain'?'terraces':catalog.biome==='coast'?'harbor':seed%3===0?'radial':'lanes';
  const useRadial=city||layout==='radial',sx=city?(catalog.biome==='tropical'?1.05:catalog.biome==='desert'?1.02:.95):layout==='harbor'?1.02:layout==='terraces'?1.05:.92,sy=city?(catalog.biome==='ice'?1.05:catalog.biome==='forest'?.88:.95):layout==='harbor'?.82:layout==='terraces'?.78:.92;
  const localWidth=(useRadial?city?228:112:92)*sx,localDepth=(useRadial?city?228:112:112)*sy,rotation=(seed%4)*Math.PI/2,swap=seed%2===1;
  const draft:InhabitedPlace={...catalog,width:swap?localDepth:localWidth,depth:swap?localWidth:localDepth,localWidth,localDepth,height:Math.max(.5,Math.round(sampleWorld(catalog.x,catalog.y).height*2)/2),rotation,layout,boundary:city?'wall':catalog.stage==='construction'?'fence':seed%4===0?'open':'fence',boundaryShape:useRadial?'ellipse':'rectangle',buildingCount:0,residentCount:0,profile:INHABITED_PROFILES[catalog.biome]};
  const plan:Plan={place:draft,sx,sy,buildings:[],paths:[],residents:[],props:[],carts:[]};if(useRadial)radial(plan);else lanes(plan);
  const place=Object.freeze({...draft,buildingCount:plan.buildings.length,residentCount:plan.residents.length});places.push(place);buildings.push(...plan.buildings);paths.push(...plan.paths);residents.push(...plan.residents);props.push(...plan.props);carts.push(...plan.carts);
}

// Precomputed offline and validated against the unchanged planet sampler.
// Regional routes are added below; no path finding runs in the browser.
const REGIONAL_ROADS:readonly {from:string;to:string;points:readonly (readonly[number,number])[]}[]=[
  {from:'npc-valleverde',to:'npc-puente-del-alba',points:[[168,120],[312,-168]]},
  {from:'npc-valleverde',to:'npc-pinar-alto',points:[[168,120],[504,264]]},
  {from:'npc-refugio-de-roca',to:'npc-lago-sereno',points:[[-552,456],[-120,600]]},
  {from:'npc-puente-del-alba',to:'npc-pinar-alto',points:[[312,-168],[504,264]]},
  {from:'npc-puerto-aurora',to:'npc-puente-del-alba',points:[[648,-504],[312,-168]]},
  {from:'npc-lago-sereno',to:'npc-valleverde',points:[[-120,600],[168,120]]},
  {from:'npc-puerto-aurora',to:'npc-paso-del-norte',points:[[648,-504],[72,-744]]},
  {from:'npc-los-cedros',to:'npc-paso-del-norte',points:[[-696,-600],[72,-744]]},
  {from:'npc-los-cedros',to:'npc-refugio-de-roca',points:[[-696,-600],[-552,456]]},
  {from:'world-village-2',to:'world-ciudad-areneros',points:[[28032,6336],[29184,5184]]},
  {from:'world-village-5',to:'world-village-17',points:[[24000,-4608],[22848,-5760]]},
  {from:'world-village-9',to:'npc-paso-del-norte',points:[[-192,-2880],[72,-744]]},
  {from:'world-village-2',to:'world-village-12',points:[[28032,6336],[25728,6336]]},
  {from:'world-village-4',to:'world-ciudad-del-sol',points:[[25152,1728],[25152,4032]]},
  {from:'world-village-9',to:'npc-los-cedros',points:[[-192,-2880],[-696,-600]]},
  {from:'world-village-12',to:'world-ciudad-del-sol',points:[[25728,6336],[25152,4032]]},
  {from:'world-village-21',to:'npc-puerto-aurora',points:[[2688,-1728],[648,-504]]},
  {from:'world-village-11',to:'world-village-19',points:[[-4800,4608],[-2496,5760]]},
  {from:'world-village-3',to:'world-village-10',points:[[-22080,-4608],[-21504,-1728]]},
  {from:'world-village-10',to:'world-village-18',points:[[-21504,-1728],[-23232,1152]]},
  {from:'world-village-6',to:'world-village-19',points:[[960,6912],[-2496,5760]]},
  {from:'world-village-7',to:'world-village-9',points:[[960,-6336],[-192,-2880]]},
  {from:'world-ciudad-areneros',to:'world-village-12',points:[[29184,5184],[25728,6336]]},
  {from:'world-village-14',to:'world-village-2',points:[[28032,10368],[28032,6336]]},
  {from:'world-village-7',to:'world-village-21',points:[[960,-6336],[2688,-1728]]},
  {from:'world-village-13',to:'world-village-4',points:[[29760,-576],[25152,1728]]},
  {from:'world-village-13',to:'world-ciudad-areneros',points:[[29760,-576],[28992,3840],[29184,5184]]},
  {from:'world-village-3',to:'world-village-18',points:[[-22080,-4608],[-23232,1152]]},
  {from:'world-village-11',to:'npc-refugio-de-roca',points:[[-4800,4608],[-552,456]]},
];

const placeById=new Map(places.map(p=>[p.id,p]));
function gate(place:InhabitedPlace,toward:LivingPoint):LivingPoint {
  const dx=toward.x-place.x,dy=toward.y-place.y,c=Math.cos(place.rotation),s=Math.sin(place.rotation),lx=dx*c+dy*s,ly=-dx*s+dy*c;
  const local=Math.abs(lx)/place.localWidth>Math.abs(ly)/place.localDepth?point(Math.sign(lx)*(place.localWidth/2-3),0):point(0,Math.sign(ly)*(place.localDepth/2-3));return point(place.x+local.x*c-local.y*s,place.y+local.x*s+local.y*c);
}
for(const road of REGIONAL_ROADS) {
  const a=placeById.get(road.from),b=placeById.get(road.to);if(!a||!b)continue;
  const points=road.points.map(([x,y])=>point(x,y));points[0]=gate(a,points[1]);points[points.length-1]=gate(b,points[points.length-2]);
  const subdivided:LivingPoint[]=[points[0]];for(let segment=1;segment<points.length;segment++){const p=points[segment-1],q=points[segment],count=Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/96);for(let i=1;i<=count;i++)subdivided.push(point(p.x+(q.x-p.x)*i/count,p.y+(q.y-p.y)*i/count));}
  paths.push(Object.freeze({id:`regional-${a.id}-${b.id}`,owner:'regional-road',biome:a.biome,width:3.2,points:Object.freeze(subdivided),surface:surface(a.biome),external:true}));
}

export const INHABITED_PLACES:readonly InhabitedPlace[]=Object.freeze(places);
export const INHABITED_BUILDINGS:readonly InhabitedBuilding[]=Object.freeze(buildings);
export const INHABITED_PATHS:readonly InhabitedPath[]=Object.freeze(paths);
export const INHABITED_RESIDENTS:readonly InhabitedResident[]=Object.freeze(residents);
export const INHABITED_PROPS:readonly InhabitedProp[]=Object.freeze(props);
export const INHABITED_CARTS:readonly InhabitedCart[]=Object.freeze(carts);
export const INHABITED_FOUNDATIONS:readonly InhabitedFoundation[]=Object.freeze(buildings.map(b=>{
  const sample=sampleWorld(b.x,b.y),height=Math.round(Math.max(.5,sample.height,sample.water?sample.waterLevel+.5:-Infinity)*2)/2;
  return Object.freeze({buildingId:b.id,x:b.x,y:b.y,width:b.width+.3,depth:b.depth+.3,height,feather:placeById.get(b.owner)?.kind==='city'?12:8});
}));
export function isInhabitedSettlement(id:string):boolean{return placeById.has(id);}

type MutableChunk={places:InhabitedPlace[];buildings:InhabitedBuilding[];foundations:InhabitedFoundation[];pathSegments:InhabitedPathSegment[];residents:InhabitedResident[];props:InhabitedProp[];carts:InhabitedCart[]};
const index=new Map<string,MutableChunk>();
const empty:InhabitedChunkData=Object.freeze({places:Object.freeze([]),buildings:Object.freeze([]),foundations:Object.freeze([]),pathSegments:Object.freeze([]),residents:Object.freeze([]),props:Object.freeze([]),carts:Object.freeze([])});
function bucket(cx:number,cy:number):MutableChunk {const key=`${cx}:${cy}`;let value=index.get(key);if(!value){value={places:[],buildings:[],foundations:[],pathSegments:[],residents:[],props:[],carts:[]};index.set(key,value);}return value;}
function bounds(minX:number,minY:number,maxX:number,maxY:number,add:(entry:MutableChunk)=>void) {for(let cx=Math.floor(minX/WORLD_CHUNK_SIZE);cx<=Math.floor(maxX/WORLD_CHUNK_SIZE);cx++)for(let cy=Math.floor(minY/WORLD_CHUNK_SIZE);cy<=Math.floor(maxY/WORLD_CHUNK_SIZE);cy++)add(bucket(cx,cy));}
const centerBucket=(p:LivingPoint)=>bucket(Math.floor(p.x/WORLD_CHUNK_SIZE),Math.floor(p.y/WORLD_CHUNK_SIZE));
for(const p of places)bounds(p.x-p.width/2-32,p.y-p.depth/2-32,p.x+p.width/2+32,p.y+p.depth/2+32,b=>b.places.push(p));
for(const b of buildings)centerBucket(b).buildings.push(b);
for(const p of INHABITED_FOUNDATIONS)bounds(p.x-p.width/2-p.feather,p.y-p.depth/2-p.feather,p.x+p.width/2+p.feather,p.y+p.depth/2+p.feather,b=>b.foundations.push(p));
for(const p of props)centerBucket(p).props.push(p);
for(const resident of residents)centerBucket(livingRoutePose(resident,0)).residents.push(resident);
for(const cart of carts)centerBucket(livingRoutePose(cart,0)).carts.push(cart);
const roadHeightCache=new Map<string,{height:number;biome:WorldBiome}>();
function roadContext(p:LivingPoint){const key=`${p.x}:${p.y}`;let value=roadHeightCache.get(key);if(value===undefined){const place=atPlaceBounds(p.x,p.y),sample=place??sampleWorld(p.x,p.y);value={height:sample.height,biome:sample.biome};roadHeightCache.set(key,value);}return value;}
function atPlaceBounds(x:number,y:number){return places.find(p=>Math.abs(x-p.x)<=p.width/2&&Math.abs(y-p.y)<=p.depth/2);}
for(const path of paths)for(let i=1;i<path.points.length;i++) {
  const a=path.points[i-1],b=path.points[i];if(Math.hypot(b.x-a.x,b.y-a.y)<.0001)continue;
  const context=path.external?roadContext(a):undefined;
  const segment:InhabitedPathSegment=Object.freeze({id:`${path.id}-segment-${i}`,owner:path.owner,biome:context?.biome??path.biome,width:path.width,surface:path.external?surface(context!.biome):path.surface,a,b,ha:context?.height??0,hb:path.external?roadContext(b).height:0,external:path.external});
  bounds(Math.min(a.x,b.x)-path.width/2-8,Math.min(a.y,b.y)-path.width/2-8,Math.max(a.x,b.x)+path.width/2+8,Math.max(a.y,b.y)+path.width/2+8,entry=>entry.pathSegments.push(segment));
}
for(const entry of index.values()){Object.values(entry).forEach(Object.freeze);Object.freeze(entry);}
export function inhabitedChunkData(cx:number,cy:number):InhabitedChunkData {return index.get(`${cx}:${cy}`)??empty;}
function at(x:number,y:number):InhabitedChunkData{return Number.isFinite(x)&&Number.isFinite(y)?inhabitedChunkData(Math.floor(x/WORLD_CHUNK_SIZE),Math.floor(y/WORLD_CHUNK_SIZE)):empty;}
export function inhabitedRoadAt(x:number,y:number):boolean {return at(x,y).pathSegments.some(segment=>distanceToSegment(x,y,segment.a,segment.b).distance<=segment.width/2);}
export function inhabitedOccupiedAt(x:number,y:number,padding=0):boolean {const cell=at(x,y);return cell.places.some(p=>Math.abs(x-p.x)<=p.width/2+padding&&Math.abs(y-p.y)<=p.depth/2+padding)||cell.pathSegments.some(p=>distanceToSegment(x,y,p.a,p.b).distance<=p.width/2+padding);}
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export function inhabitedTerrainHeight(x:number,y:number,base:number,sample?:{water:boolean;river:boolean;waterLevel:number}):number {
  const cell=at(x,y);let height=base,coastalWater=false;
  if(!cell.places.length&&!cell.pathSegments.length&&!cell.foundations.length)return base;
  const foundation=cell.foundations.find(p=>Math.abs(x-p.x)<=p.width/2&&Math.abs(y-p.y)<=p.depth/2);
  if(foundation)return foundation.height;
  // Bridges raise their decks independently. A street must not turn a river
  // into an earthen dam, including inside a city's visual terrain envelope.
  if(sample?.river)return base;
  for(const p of cell.places){
    // Coastal pads and causeways can rise over water; untouched bays retain
    // their natural bed. The forest exclusion envelope is deliberately wider.
    if(p.biome==='coast'&&base<.1){coastalWater=true;continue;}
    const edge=Math.max(Math.abs(x-p.x)-p.width/2,Math.abs(y-p.y)-p.depth/2),blend=1-smooth(Math.max(0,edge)/32);
    // Preserve hills and valleys: settlement centers may bias the surrounding
    // ground slightly, never stamp an entire city into one constant plateau.
    if(blend>0)height+=Math.max(-.35,Math.min(.35,p.height-base))*blend;
  }
  if(coastalWater)return base;
  // Neighboring pad shoulders blend continuously without changing the flat
  // support inside a building's footprint. Strong weights near an edge keep
  // its shoulder continuous even when other nearby foundations overlap it.
  let weighted=height,weight=1;
  for(const pad of cell.foundations){const edge=Math.max(Math.abs(x-pad.x)-pad.width/2,Math.abs(y-pad.y)-pad.depth/2);if(edge>=pad.feather)continue;const influence=1-smooth(Math.max(0,edge)/pad.feather),w=influence*influence/Math.max(.00000001,1-influence);weighted+=pad.height*w;weight+=w;}
  height=weighted/weight;
  let roadDelta=0,roadWeight=0;
  for(const segment of cell.pathSegments){if(!segment.external)continue;const near=distanceToSegment(x,y,segment.a,segment.b),blend=1-smooth(Math.max(0,near.distance-segment.width/2)/6);if(blend>0){const grade=segment.ha+(segment.hb-segment.ha)*near.t;roadDelta+=Math.max(-.35,Math.min(.35,grade-base))*blend;roadWeight+=blend;}}
  height+=roadDelta/Math.max(1,roadWeight);
  return height;
}
export function inhabitedWaterClearedAt(x:number,y:number):boolean {
  return inhabitedBuildingPadAt(x,y);
}
export function inhabitedBuildingPadAt(x:number,y:number):boolean {
  return at(x,y).foundations.some(p=>Math.abs(x-p.x)<=p.width/2&&Math.abs(y-p.y)<=p.depth/2);
}
export function inhabitedRoadDeckHeight(ground:number,waterLevel:number|null):number{return waterLevel===null?ground:Math.max(ground,waterLevel+.45);}
/** Used by route/collision checks and visual work-prop placement. */
export function inhabitedSolidAt(x:number,y:number,padding=0):boolean {
  const cells=[at(x,y),at(x-12,y-12),at(x+12,y+12),at(x-12,y+12),at(x+12,y-12)];
  return cells.some(c=>[...c.buildings,...c.props.filter(p=>p.kind!=='tree'&&p.kind!=='lamp')].some(b=>Math.abs(x-b.x)<b.width/2+padding&&Math.abs(y-b.y)<b.depth/2+padding));
}
