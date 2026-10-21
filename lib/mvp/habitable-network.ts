import {HABITABLE_BUILDING_TEMPLATES,HABITABLE_POINTS,getHabitableStorageCapacity,habitableBuildingEntrance,habitablePath} from './habitable-data.ts';
import type {HabitablePoint,HabitableTemplateId} from './habitable-data.ts';
import {habitableReservedStorage} from './habitable-logistics.ts';
import {landRoadAt} from './land-grid.ts';
import type {ItemAmount,MvpWorld,Player} from './types.ts';

export interface HabitableConstructionSourceView {supplyShedId:string;label:string;ready:boolean;stock:ItemAmount[];available:boolean;reason:string|null}
export interface HabitableNetworkNode {buildingId:string;templateId:HabitableTemplateId;label:string;ready:boolean;access:HabitablePoint|null;status:'building'|'idle'|'working'|'waiting'|'transporting'|'demolishing';blockedReason:string|null;storage?:{used:number;reserved:number;capacity:number;free:number}}
export interface HabitableNetworkEdge {id:string;kind:'input'|'output'|'construction'|'connection';fromBuildingId:string;toBuildingId:string;points:HabitablePoint[];status:'planned'|'active'|'waiting'|'connected'|'blocked'|'completed';startsAt:number|null;endsAt:number|null;cargoUnits:number;roadCoverage:number;blockedReason:string|null}
export interface HabitableNetworkView {playerId:string|null;nodes:HabitableNetworkNode[];edges:HabitableNetworkEdge[];nextChangeAt:number|null}
export interface HabitableNetworkVisual {routes:{id:string;fromBuildingId:string;toBuildingId:string;points:HabitablePoint[];kind:'supply'|'output'|'construction';connected:boolean}[];entrances:{buildingId:string;point:HabitablePoint}[]}
const total=(lots:readonly {qty:number}[])=>lots.reduce((n,l)=>n+l.qty,0);
// The authored district residents occupy the same feet centers and footprints
// used by authoritative supply/logistics paths; a static connection must avoid them too.
const districtPeople=HABITABLE_POINTS.map(p=>({id:`district-${p.id}`,x:p.x+.7,y:p.y,width:.65,depth:.65}));
export function getConstructionSources(p:Player|null,now:number):HabitableConstructionSourceView[] {return(p?.habitable?.buildings??[]).filter(b=>b.templateId==='shed').map((b,i)=>{const stock=new Map<ItemAmount['itemId'],number>();for(const l of b.storage??[])if(l.expiresAt===null||l.expiresAt>now)stock.set(l.itemId,(stock.get(l.itemId)??0)+l.qty);const reason=b.demolition?'El cobertizo está reservado para desmontaje.':b.endsAt>now?'Esperá a que termine el cobertizo.':null;return{supplyShedId:b.id,label:`Cobertizo ${i+1}`,ready:b.endsAt<=now,stock:[...stock].map(([itemId,qty])=>({itemId,qty})),available:reason===null,reason};});}
/** At most ten facilities and one static nearest-shed path per idle facility.
 * Saved schedules are projected directly; reads never reserve or dispatch routes. */
export function getHabitableNetworkView(world:MvpWorld,p:Player|null,now:number):HabitableNetworkView {
  const state=p?.habitable;if(!state||!p)return{playerId:p?.id??null,nodes:[],edges:[],nextChangeAt:null};
  const nodes:HabitableNetworkNode[]=[],edges:HabitableNetworkEdge[]=[],deadlines:number[]=[],sheds=state.buildings.filter(b=>b.templateId==='shed'&&b.endsAt<=now&&!b.demolition),accesses=new Map(state.buildings.map(b=>[b.id,habitableBuildingEntrance(state,b)]));
  const deadline=(at:number|undefined)=>{if(at!==undefined&&at>now)deadlines.push(at);};
  const add=(edge:Omit<HabitableNetworkEdge,'roadCoverage'>)=>{let length=0,covered=0;for(let i=1;i<edge.points.length;i++){const a=edge.points[i-1],b=edge.points[i],d=Math.hypot(a.x-b.x,a.y-b.y),n=Math.max(1,Math.ceil(d/.35));length+=d;for(let t=0;t<n;t++)if(landRoadAt(state,a.x+(b.x-a.x)*(t+.5)/n,a.y+(b.y-a.y)*(t+.5)/n))covered+=d/n;}edges.push({...edge,roadCoverage:length?covered/length:0});deadline(edge.startsAt??undefined);deadline(edge.endsAt??undefined);};
  for(const b of state.buildings){const j=b.operation?world.jobs[b.operation.jobId]:undefined,active=j&&(j.status==='running'||j.status==='reserved'),c=b.construction,s=b.shipment,u=b.supply,access=accesses.get(b.id)??null;
    let status:HabitableNetworkNode['status']=b.demolition?'demolishing':b.endsAt>now?'building':active?'working':b.pending?.length?'waiting':s&&s.endsAt>now?'transporting':'idle';
    if(u&&u.cancelledAt===undefined&&u.consumedAt===undefined)status='transporting';
    const used=total(b.storage??[]),reserved=habitableReservedStorage(state,b.id),capacity=getHabitableStorageCapacity(b);
    nodes.push({buildingId:b.id,templateId:b.templateId,label:HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===b.templateId)!.label,ready:b.endsAt<=now,access,status,blockedReason:b.deliveryBlockedReason??b.workOrder?.blockedReason??null,...(b.templateId==='shed'?{storage:{used,reserved,capacity,free:Math.max(0,capacity-used-reserved)}}:{})});deadline(b.endsAt);deadline(j?.endsAt);
    if(c&&now<c.crew.endsAt){const leg=c.crew.legs.find(l=>l.phase==='between')??c.crew.legs[0];for(const l of c.crew.legs)deadline(l.endsAt);add({id:`construction:${b.id}`,kind:'construction',fromBuildingId:c.sourceBuildingId,toBuildingId:b.id,points:structuredClone(leg.points),status:now<c.crew.startsAt?'planned':'active',startsAt:c.crew.startsAt,endsAt:c.crew.endsAt,cargoUnits:total(c.cargo),blockedReason:null});continue;}
    if(u&&u.cancelledAt===undefined){for(const at of[u.startsAt,u.arrivesAtSource,u.pickupAt,u.arrivesAt,u.unloadsAt])deadline(at);if(u.unloadsAt>now)add({id:`input:${u.id}`,kind:'input',fromBuildingId:u.sourceBuildingId,toBuildingId:b.id,points:structuredClone([...u.points].reverse()),status:now<u.startsAt?'planned':'active',startsAt:u.startsAt,endsAt:u.unloadsAt,cargoUnits:total(u.cargo),blockedReason:null});}
    if(s&&s.endsAt>now){for(const at of[s.startsAt,s.pickupAt,s.arrivesAt,s.unloadsAt,s.endsAt])deadline(at);add({id:`output:${s.id}`,kind:'output',fromBuildingId:b.id,toBuildingId:s.destinationBuildingId,points:structuredClone(s.points),status:now<s.startsAt?'planned':s.depositedAt!==undefined?'completed':'active',startsAt:s.startsAt,endsAt:s.endsAt,cargoUnits:total(s.cargo),blockedReason:null});}
    if(b.templateId==='shed'||edges.some(e=>e.toBuildingId===b.id||e.fromBuildingId===b.id))continue;
    const shed=[...sheds].sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y)||a.id.localeCompare(c.id))[0];if(!shed)continue;const from=accesses.get(shed.id),points=from&&access?habitablePath(state,from,access,districtPeople):null,reason=b.deliveryBlockedReason??(!points?'No hay una conexión caminable entre los accesos: conservá libre el paso alrededor de los habitantes del distrito.':null);
    add({id:`connection:${shed.id}:${b.id}`,kind:'connection',fromBuildingId:shed.id,toBuildingId:b.id,points:points??[],status:!points?'blocked':b.pending?.length?'waiting':'connected',startsAt:null,endsAt:null,cargoUnits:total(b.pending??[]),blockedReason:reason});
  }
  const value={playerId:p.id,nodes,edges,nextChangeAt:deadlines.length?Math.min(...deadlines):null};return value;
}
export function getHabitableNetworkVisual(world:MvpWorld,p:Player,now:number,view=getHabitableNetworkView(world,p,now)):HabitableNetworkVisual {return{routes:view.edges.map(e=>({id:e.id,fromBuildingId:e.fromBuildingId,toBuildingId:e.toBuildingId,points:structuredClone(e.points),kind:e.kind==='input'||e.kind==='connection'?'supply' as const:e.kind,connected:e.points.length>1})),entrances:view.nodes.flatMap(n=>n.access?[{buildingId:n.buildingId,point:{...n.access}}]:[])};}
