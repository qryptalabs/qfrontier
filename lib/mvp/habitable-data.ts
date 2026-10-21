import type {HabitableManagerState} from './habitable-manager.ts';
import type {ExplorationState} from './exploration-data.ts';
import { isSceneryWater, settlementHeightAt, islandContains, sceneryNoise, riverCenter, riverWidth } from '../graphics/settlement-layout.ts';
import type { InventoryLot, ItemAmount, ItemId } from './types.ts';
import type { HabitableNetworkVisual } from './habitable-network.ts';
import type { HabitableTrade } from './habitable-commerce.ts';
import type { LandState, LandVisualState, LandCrewSchedule } from './land-grid.ts';
import { LAND_RULES_EFFECTIVE_AT, landBuildingLimit, landCellAt, landCellOwned, landCrewAt, landRoadAt } from './land-grid.ts';
import { landTerrainHeight, landTerrainWater, landCellPrepared, landClearsSceneryAt } from '../graphics/land-terrain.ts';
import {landBridgePreset} from '../graphics/land-infrastructure.ts';
import {preferredLandPath} from './land-paths.ts';

export interface HabitablePoint {x:number;y:number}
export interface HabitableDailyLeg {points:HabitablePoint[];startsAt:number;arrivesAt:number;endsAt:number;kind:'pickup'|'delivery'|'maintenance'|'return';residentId?:string;recipient?:HabitablePoint;quantity:number;yaw?:number}
export interface HabitableDailySchedule {startsAt:number;endsAt:number;legs:HabitableDailyLeg[]}
export interface HabitableDailyJourney extends HabitableDailySchedule {id:string;workerId:string;sourceBuildingId:string;cargo:InventoryLot[];residents:{residentId:string;deliveredAt?:number;fedUntil?:number}[];maintenanceQty:number;maintenanceRations?:number;maintenanceAt?:number;rationsConsumed:number;timberConsumed:number;completedAt?:number}
export interface HabitableDailyState {optedInAt:number;sequence:number;journey:HabitableDailyJourney;rationsConsumed:number;timberConsumed:number}
export type HabitableAppearance='amber'|'pine'|'frost';
export type HabitableProfession='carpenter'|'farmer'|'carrier';
export type HabitableTemplateId='shed'|'workbench'|'planter'|'house'|'woodlot'|'sawmill';
export interface HabitableWorkOrder {id:string;status:'active'|'stopping'|'stopped'|'completed';target:number;started:number;completed:number;supplyShedId:string;lastSettledJobId?:string;blockedReason?:string;createdAt:number}
export interface HabitableResident {id:string;name:string;homeBuildingId:string|null;assignment?:{buildingId:string;stand:HabitablePoint};position:HabitablePoint;relocation?:HabitableMovement;createdAt:number;fedUntil?:number}
export interface HabitableWorkforce {residents:HabitableResident[];sequence:number;initializedAt:number}
export interface HabitableSupplySchedule {points:HabitablePoint[];startsAt:number;arrivesAtSource:number;pickupAt:number;arrivesAt:number;unloadsAt:number;sourceBuildingId:string;quantity:number;pickupYaw?:number}
export interface HabitableSupply extends HabitableSupplySchedule {id:string;jobId:string;workerId:string;cargo:InventoryLot[];pickedUpAt?:number;consumedAt?:number;cancelledAt?:number}
export interface HabitableMovement {points:HabitablePoint[];startsAt:number;endsAt:number;manualSessionId?:string}
export interface ManualNavigationState {sessionId:string;sequence:number;expiresAt:number;stopped:boolean;retiredSessions?:string[]}
export interface HabitableShipmentSchedule {points:HabitablePoint[];startsAt:number;pickupAt:number;arrivesAt:number;unloadsAt:number;endsAt:number;quantity:number;destinationBuildingId:string;unloadYaw?:number}
export interface HabitableShipment extends HabitableShipmentSchedule {id:string;jobId:string;workerId:string;sourceBuildingId:string;cargo:InventoryLot[];depositedAt?:number;deliveredQuantity?:number;expiredQuantity?:number;managerCourier?:true;pickedUpAt?:number}
export interface HabitableWorkerVisual {id:string;buildingId:string;role:'worker'|'farmer'|'builder'|'forester'|'sawyer';stand:HabitablePoint;yaw:number;startsAt:number;workEndsAt:number;pendingUnits:number;blockedReason:string|null;shipment?:HabitableShipmentSchedule;supply?:HabitableSupplySchedule;relocation?:HabitableMovement;daily?:HabitableDailySchedule;crew?:LandCrewSchedule;fedUntil?:number}
export type HabitableWorkerPhase='working'|'collecting'|'carrying'|'unloading'|'returning'|'waiting'|'idle'|'to_storage'|'loading'|'supplying'|'receiving'|'relocating';
export interface HabitableWorkerPose extends HabitablePoint {yaw:number;state:HabitableWorkerPhase;walking:boolean;working:boolean;carrying:boolean;cargoUnits:number}
export interface HabitableBuildingVisual {state:'idle'|'working';operation?:'craft'|'grow'|'extract'|'saw';recipeId?:ItemId;startsAt?:number;endsAt?:number;storedUnits?:number;capacity?:number;residents?:number;residentCapacity?:number}
export interface HabitableConstruction {sourceBuildingId:string;workerId:string;residentId?:string;cargo:InventoryLot[];crew:LandCrewSchedule;unloadedAt?:number;completedAt?:number}
export interface HabitableConstructionVisual {sourceBuildingId:string;workerId:string;quantity:number;crew:LandCrewSchedule}
export interface HabitableBuilding {construction?:HabitableConstruction;constructionVisual?:HabitableConstructionVisual;constructionCosts?:InventoryLot[];rebuildOf?:string;demolition?:{jobId:string;startsAt:number;workStartsAt:number;endsAt:number};id:string;templateId:HabitableTemplateId;x:number;y:number;rotation:0|1|2|3;startsAt:number;endsAt:number;bound:boolean;storage?:InventoryLot[];pending?:InventoryLot[];shipment?:HabitableShipment;supply?:HabitableSupply;constructionStand?:HabitablePoint;deliveryBlockedReason?:string;deliveryRetryAt?:number;operation?:{jobId:string};workOrder?:HabitableWorkOrder;visual?:HabitableBuildingVisual;level?:1|2;upgrade?:{fromLevel:1;toLevel:2;startsAt:number;endsAt:number;constructionStand:HabitablePoint}}
export interface HabitableJob {id:string;status:'active'|'completed'|'cancelled';escrow:number;rewardCredits:number;acceptedAt:number;expiresAt:number;sourceTileId:string;layerId:string;timberQty:number;plankQty:number;reservedTimber:number;harvested:boolean;extractionJobId?:string;craftJobId?:string;deliveredAt?:number}
export interface HabitableState {manualNavigation?:ManualNavigationState;exploration?:ExplorationState;manager?:HabitableManagerState;networkVisual?:HabitableNetworkVisual;land?:LandState;landVisual?:LandVisualState;version:1;appearance:HabitableAppearance;skin?:'light'|'warm'|'deep';hair?:'brown'|'black'|'silver';profession:HabitableProfession;position:HabitablePoint;movement?:HabitableMovement;buildings:HabitableBuilding[];job?:HabitableJob;workers?:HabitableWorkerVisual[];workforce?:HabitableWorkforce;daily?:HabitableDailyState;commerce?:{contracts:HabitableTrade[];sequence:number;gateway?:{points:HabitablePoint[];width:number}};commerceGateway?:{points:HabitablePoint[];width:number}}
export interface HabitableTemplate {id:HabitableTemplateId;label:string;width:number;depth:number;seconds:number;costs:ItemAmount[]}
export const HABITABLE_APPEARANCES=Object.freeze([{id:'amber' as const,label:'Ámbar'},{id:'pine' as const,label:'Pino'},{id:'frost' as const,label:'Escarcha'}]);
export const HABITABLE_PROFESSIONS=Object.freeze([{id:'carpenter' as const,label:'Carpintería'},{id:'farmer' as const,label:'Agricultura'},{id:'carrier' as const,label:'Transporte'}]);
export const HABITABLE_BUILDING_TEMPLATES:readonly HabitableTemplate[]=Object.freeze([
  {id:'shed',label:'Cobertizo',width:3.2,depth:2.8,seconds:30,costs:[{itemId:'timber',qty:4},{itemId:'stone',qty:2}]},
  {id:'workbench',label:'Mesa de trabajo',width:2.4,depth:1.6,seconds:15,costs:[{itemId:'timber',qty:3},{itemId:'stone',qty:1}]},
  {id:'planter',label:'Bancal',width:2.6,depth:2,seconds:20,costs:[{itemId:'timber',qty:2},{itemId:'fiber',qty:2}]},
  {id:'house',label:'Vivienda',width:3.2,depth:2.8,seconds:45,costs:[{itemId:'plank',qty:1},{itemId:'stone',qty:2},{itemId:'cloth',qty:1}]},
  {id:'woodlot',label:'Puesto forestal',width:2.2,depth:1.8,seconds:25,costs:[{itemId:'timber',qty:1},{itemId:'stone',qty:1}]},
  {id:'sawmill',label:'Aserradero propio',width:3.2,depth:2.8,seconds:60,costs:[{itemId:'timber',qty:4},{itemId:'stone',qty:2}]},
]);
export const HABITABLE_POINTS=Object.freeze([
  {id:'contractor',label:'Encargada del distrito',x:0,y:0,role:'contractor'},
  {id:'wood',label:'Puesto forestal',x:-9,y:.5,role:'wood'},
  {id:'sawmill',label:'Aserradero',x:-6.45,y:.5,role:'sawmill'},
  {id:'delivery',label:'Recepción de tablones',x:3.3,y:.5,role:'delivery'},
]);
export const HABITABLE_SPAWN:HabitablePoint=Object.freeze({x:0,y:1.5});
export const HABITABLE_SPEED=2.2;
export const HABITABLE_INTERACTION_RADIUS=1.65;
export const HABITABLE_JOB_REWARD=16;
export const HABITABLE_MAX_BUILDINGS=6;
export const HABITABLE_STORAGE_CAPACITY=80;
export function getHabitableStorageCapacity(b:HabitableBuilding):number {return b.templateId==='shed'&&b.level===2?160:HABITABLE_STORAGE_CAPACITY;}
export const HABITABLE_WORKBENCH_RECIPE_IDS=Object.freeze(['plank','cloth','seed','nutrient','ration']as const);
export const HABITABLE_PLANTER_INPUTS:readonly ItemAmount[]=Object.freeze([{itemId:'seed',qty:1},{itemId:'water',qty:2},{itemId:'nutrient',qty:1}]);
export const HABITABLE_PLANTER_OUTPUTS:readonly ItemAmount[]=Object.freeze([{itemId:'grain',qty:3},{itemId:'biomass',qty:1}]);
export const HABITABLE_PLANTER_SECONDS=45;
export const HABITABLE_BOUNDS=Object.freeze({minX:-18.5,maxX:18.5,minY:-16.5,maxY:16.5});
export interface HabitableObstacle extends HabitablePoint {id:string;width:number;depth:number}
export const HABITABLE_OBSTACLES:readonly HabitableObstacle[]=Object.freeze([
  // Union of authored models across all three factions and levels; padding is added by navigation.
  {id:'home',x:-1.55,y:-2.489,width:3.94,depth:3.93},
  {id:'workshop',x:-6.4176,y:-2.36385,width:3.27,depth:3.23},
  {id:'kitchen',x:-5.68125,y:-6.10625,width:2.48,depth:2.71},
  {id:'laboratory',x:2.0375,y:-6.15156,width:2.37,depth:2.36},
  {id:'warehouse',x:3.429,y:-2.32394,width:3.64,depth:3.37},
  {id:'logistics',x:3.38005,y:7.20837,width:2.09,depth:2.43},
  {id:'barracks',x:-5.55,y:7.43438,width:2.50,depth:2.26},
  {id:'garden-shed',x:-4.2,y:4.9,width:2.8,depth:2.8},
  {id:'wheat',x:-.95,y:4.25,width:2.9,depth:2.9},{id:'vegetables',x:3.15,y:3.25,width:3,depth:2.8},{id:'wheat-terrace',x:-.1,y:7.7,width:1.65,depth:1.9},
  {id:'logs',x:-7.3,y:2.4,width:1.8,depth:1.9},
  {id:'mine',x:10.8,y:-5.85,width:5,depth:4.8},
  {id:'mountain-rock-mass',x:10.25,y:-9.1,width:8.2,depth:6.1},
]);
const trunks:HabitableObstacle[]=[];
for(const low of[false,true])for(let x=-14.6;x<=14.6;x+=low?1.9:1.48)for(let y=-11.8;y<=11.6;y+=low?1.9:1.5){const n=sceneryNoise(x,y,91),tx=x+(n-.5)*.75,ty=y+(sceneryNoise(y,x,93)-.5)*.65;if(!islandContains(tx,ty)||isSceneryWater(tx,ty)||tx>11.6&&tx<14.7&&ty> -1.6&&ty<2.3)continue;const forest=tx< -9.3||ty>9.5||ty< -7.9&&tx< -6.7||tx>12.7&&ty> -5.7,grove=tx< -7.6&&ty>2.1&&ty<6.2||tx>5.7&&tx<7.4&&ty> -3.7&&ty< -.7;if(!(forest||grove)||n<.12||tx>5&&ty< -6.5)continue;trunks.push({id:`tree-${trunks.length}`,x:tx,y:ty,width:.55,depth:.55});}
for(const[x,y]of[[-8.3,-5.7],[5.3,-6.3],[5.1,-.7],[-8.35,6.7],[6,6.8],[-6.8,-10.6],[-4.9,-8.8],[4.4,-11.7]])trunks.push({id:`tree-${trunks.length}`,x,y,width:.65,depth:.65});
export const HABITABLE_TREE_OBSTACLES:readonly HabitableObstacle[]=Object.freeze(trunks);
const colliderIndex=new Map<string,HabitableObstacle[]>();for(const obstacle of[...HABITABLE_OBSTACLES,...trunks])for(let x=Math.floor((obstacle.x-obstacle.width/2-.4)/2);x<=Math.floor((obstacle.x+obstacle.width/2+.4)/2);x++)for(let y=Math.floor((obstacle.y-obstacle.depth/2-.4)/2);y<=Math.floor((obstacle.y+obstacle.depth/2+.4)/2);y++){const key=`${x}:${y}`,list=colliderIndex.get(key)??[];list.push(obstacle);colliderIndex.set(key,list);}
export function habitablePositionAt(state:HabitableState,now:number):HabitablePoint {const move=state.movement;if(!move)return{...state.position};const progress=Math.max(0,Math.min(1,(now-move.startsAt)/(move.endsAt-move.startsAt))),lengths=move.points.slice(1).map((b,i)=>Math.hypot(b.x-move.points[i].x,b.y-move.points[i].y)),distance=lengths.reduce((sum,v)=>sum+v,0)*progress;let current=0;for(let i=0;i<lengths.length;i++){if(current+lengths[i]>=distance||i===lengths.length-1){const a=move.points[i],b=move.points[i+1],t=lengths[i]?(distance-current)/lengths[i]:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}current+=lengths[i];}return{...state.position};}
export function habitableBuildingDimensions(building:Pick<HabitableBuilding,'templateId'|'rotation'>):{width:number;depth:number}{const template=HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===building.templateId)!;return building.rotation%2?{width:template.depth,depth:template.width}:{width:template.width,depth:template.depth};}
export function habitableBuildingObstacles(state:HabitableState):HabitableObstacle[]{return state.buildings.map(b=>({...b,...habitableBuildingDimensions(b)}));}
/** Authored expansion plans clear only procedural trees in their actual footprint and work/access fringe. */
export function houseClearsProceduralTree(state:Pick<HabitableState,'buildings'|'commerce'|'commerceGateway'|'land'|'landVisual'>,x:number,y:number):boolean {if(landClearsSceneryAt(state,x,y))return true;const historic=[...(state.land?.demolished?.map(d=>d.building)??[]),...(state.landVisual?.demolished?.filter(d=>d.clearsLegacyScenery).map(d=>({...d,startsAt:0}))??[])];if([...state.buildings,...historic].some(b=>{if(!['house','woodlot','sawmill'].includes(b.templateId)||b.startsAt>=LAND_RULES_EFFECTIVE_AT)return false;const size=habitableBuildingDimensions(b);return Math.abs(x-b.x)<=size.width/2+1.35&&Math.abs(y-b.y)<=size.depth/2+1.35;}))return true;const gateway=state.commerce?.gateway??state.commerceGateway;return!!gateway&&gateway.points.some((to,i)=>{if(!i)return false;const from=gateway.points[i-1],dx=to.x-from.x,dy=to.y-from.y,t=Math.max(0,Math.min(1,((x-from.x)*dx+(y-from.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-from.x-dx*t,y-from.y-dy*t)<=gateway.width/2+.65;});}
const bridgeCenter=riverCenter(4.25),bridgeLength=riverWidth(4.25)+2.45;
export function habitableWaterAt(x:number,y:number):boolean{return isSceneryWater(x,y)&&!(Math.abs(x-bridgeCenter)<=bridgeLength/2&&Math.abs(y-4.25)<=.75);}
export function habitableGroundHeight(x:number,y:number,state?:Pick<HabitableState,'land'|'landVisual'>):number{const base= Math.abs(x-bridgeCenter)<=bridgeLength/2&&Math.abs(y-4.25)<=.75?2.395+Math.sin((x-bridgeCenter+bridgeLength/2)/bridgeLength*Math.PI)*.11:islandContains(x,y)?settlementHeightAt(x,y):2;return state?landTerrainHeight(state,x,y,base):base;}
/** Centre terrain sampling is separate from solid sweeps, preventing a second capsule inflation. */
export function habitableTerrainWalkableAt(point:HabitablePoint,state:HabitableState,padding=0):boolean {const{x,y}=point,b=state.land||state.landVisual?{minX:-17.5,maxX:17.5,minY:-17.5,maxY:17.5}:HABITABLE_BOUNDS;return Number.isFinite(x)&&Number.isFinite(y)&&x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY&&![[0,0],[padding,0],[-padding,0],[0,padding],[0,-padding]].some(([dx,dy])=>{const px=x+dx,py=y+dy,cell=landCellAt(px,py),extended=!!cell&&landCellOwned(state,cell)&&landCellPrepared(state,px,py);return(!islandContains(px,py)&&!extended)||landTerrainWater(state,px,py,habitableWaterAt(px,py));});}
export function habitableWalkableAt(point:HabitablePoint,state:HabitableState,padding=.32,extra:readonly HabitableObstacle[]=[]):boolean {const{x,y}=point;if(!habitableTerrainWalkableAt(point,state,padding))return false;const hit=(o:HabitableObstacle)=>!(o.width===.55&&o.id.startsWith('tree-')&&houseClearsProceduralTree(state,o.x,o.y))&&Math.abs(x-o.x)<o.width/2+padding&&Math.abs(y-o.y)<o.depth/2+padding;return !(colliderIndex.get(`${Math.floor(x/2)}:${Math.floor(y/2)}`)??[]).some(hit)&&!habitableBuildingObstacles(state).some(hit)&&!extra.some(hit);}
export function habitableLineClear(a:HabitablePoint,b:HabitablePoint,state:HabitableState,extra:readonly HabitableObstacle[]=[]):boolean{const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.2));let previous=habitableGroundHeight(a.x,a.y,state);for(let i=0;i<=count;i++){const point={x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count};if(!habitableWalkableAt(point,state,.32,extra))return false;const height=habitableGroundHeight(point.x,point.y,state);if(Math.abs(height-previous)>.7)return false;previous=height;}return true;}
/** Bounded half-unit navigation grid shared by the renderer and authoritative commands. */
export function habitablePath(state:HabitableState,from:HabitablePoint,to:HabitablePoint,extra:readonly HabitableObstacle[]=[]):HabitablePoint[]|null {
  if(!habitableWalkableAt(to,state,.32,extra))return null;
  if(Object.keys((state.land??state.landVisual)?.roads??{}).length){const preferred=preferredLandPath(from,to,(a,b)=>habitableLineClear(a,b,state,extra),p=>landRoadAt(state,p.x,p.y));if(preferred)return preferred;}
  if(habitableLineClear(from,to,state,extra))return[{...from},{...to}];
  const search=(step:number,maxVisits:number)=>{const key=(x:number,y:number)=>`${x}:${y}`,queue:HabitablePoint[]=[],seen=new Map<string,string|null>(),points=new Map<string,HabitablePoint>();
  const cx=Math.round(from.x/step),cy=Math.round(from.y/step);
  // A valid fractional origin can round into water or a wall. Seed only actual reachable grid nodes.
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    const cell={x:cx+dx,y:cy+dy},world={x:cell.x*step,y:cell.y*step};
    if(!habitableLineClear(from,world,state,extra))continue;
    const id=key(cell.x,cell.y);queue.push(cell);seen.set(id,null);points.set(id,cell);
  }
  let found:string|undefined;
  for(let head=0;head<queue.length&&head<maxVisits;head++){
    const a=queue[head],aKey=key(a.x,a.y),worldA={x:a.x*step,y:a.y*step};
    if(Math.hypot(worldA.x-to.x,worldA.y-to.y)<=step*1.5&&habitableLineClear(worldA,to,state,extra)){found=aKey;break;}
    for(const[dx,dy]of[[1,0],[0,1],[-1,0],[0,-1]]){
      const b={x:a.x+dx,y:a.y+dy},bKey=key(b.x,b.y);
      if(seen.has(bKey)||!habitableLineClear(worldA,{x:b.x*step,y:b.y*step},state,extra))continue;
      seen.set(bKey,aKey);points.set(bKey,b);queue.push(b);
    }
  }
  if(!found)return null;
  const route:HabitablePoint[]=[{...to}];for(let k:string|null=found;k!==null;k=seen.get(k)!){const point=points.get(k)!;route.push({x:point.x*step,y:point.y*step});}
  route.push({...from});route.reverse();const smooth:HabitablePoint[]=[route[0]];
  for(let i=0;i<route.length-1;){let next=i+1;while(next+1<route.length&&habitableLineClear(route[i],route[next+1],state,extra))next++;smooth.push(route[next]);i=next;}
  return smooth;};
  // A standing person can leave a valid 28cm centre corridor beside a workshop.
  // Refine only failed coarse searches; every edge retains the same solid/body checks.
  return search(.5,6000)??search(.25,12000);
}
export function habitablePlacementError(state:HabitableState,building:Pick<HabitableBuilding,'templateId'|'x'|'y'|'rotation'>,now=0):string|null {
  const template=HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===building.templateId);if(!template)return'Plano desconocido.';if(!Number.isFinite(building.x)||!Number.isFinite(building.y)||![0,1,2,3].includes(building.rotation))return'Posición u orientación inválida.';
  if(state.buildings.length>=landBuildingLimit(state))return'El Centro admite '+landBuildingLimit(state)+' obras; mejoralo para ampliar su capacidad.';const{width,depth}=habitableBuildingDimensions(building);if(Math.abs(building.x)+width/2>19||Math.abs(building.y)+depth/2>17)return'La obra debe quedar dentro de tu parcela.';
  const candidate={...building,id:'preview',startsAt:now,endsAt:now,bound:false},proposed={...state,buildings:[...state.buildings,candidate]};
  if(Object.keys((state.land??state.landVisual)?.roads??{}).some(id=>{const cell=landCellAt(building.x,building.y),parts=/^land_(\d+)_(\d+)$/.exec(id);if(!parts)return false;const x=(Number(parts[2])-12)*1.4,y=(Number(parts[1])-12)*1.4;return!!cell&&Math.abs(x-building.x)<width/2+.8&&Math.abs(y-building.y)<depth/2+.8;}))return'Conservá libres los caminos construidos.';
  if(((state.land??state.landVisual)?.bridges??[]).some(b=>{const preset=landBridgePreset(b.presetId);return!!preset&&Math.abs(building.x-(preset.from.x+preset.to.x)/2)<width/2+Math.abs(preset.to.x-preset.from.x)/2+.4&&Math.abs(building.y-preset.from.y)<depth/2+preset.width/2+.4;}))return'Conservá libres el puente y sus accesos.';
  const gateway=state.commerce?.gateway??state.commerceGateway;if(gateway?.points.some((to,i)=>{if(!i)return false;const from=gateway.points[i-1],steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/.2));for(let at=0;at<=steps;at++){const x=from.x+(to.x-from.x)*at/steps,y=from.y+(to.y-from.y)*at/steps;if(Math.abs(x-building.x)<width/2+gateway.width/2+.32&&Math.abs(y-building.y)<depth/2+gateway.width/2+.32)return true;}return false;}))return'Conserva libre el corredor comercial y su bahía de carga.';
  if([...HABITABLE_OBSTACLES,...HABITABLE_TREE_OBSTACLES,...habitableBuildingObstacles(state)].some(o=>!(o.width===.55&&o.id.startsWith('tree-')&&houseClearsProceduralTree(proposed,o.x,o.y))&&Math.abs(building.x-o.x)<(width+o.width)/2+.35&&Math.abs(building.y-o.y)<(depth+o.depth)/2+.35))return'La obra invade otro edificio, cultivo, árbol o acceso.';
  for(let x=-width/2;x<=width/2+.01;x+=width/6)for(let y=-depth/2;y<=depth/2+.01;y+=depth/6){const px=building.x+x,py=building.y+y,cell=landCellAt(px,py);if(!cell||!landCellOwned(state,cell)||!islandContains(px,py)&&!landCellPrepared(state,px,py))return'Explorá, despejá y colonizá toda la huella antes de construir fuera del área habilitada del núcleo.';if(landTerrainWater(state,px,py,habitableWaterAt(px,py))||Math.abs(habitableGroundHeight(px,py,state)-habitableGroundHeight(building.x,building.y,state))>.55)return'El plano necesita terreno seco y nivelado.';}
  if(HABITABLE_POINTS.some(p=>Math.abs(building.x-p.x)<width/2+1.8&&Math.abs(building.y-p.y)<depth/2+1.8))return'Conserva libres los puestos y sus accesos.';
  const avatar=habitablePositionAt(state,now);if(Math.abs(building.x-avatar.x)<width/2+.5&&Math.abs(building.y-avatar.y)<depth/2+.5)return'Aparta al personaje antes de construir.';
  if(HABITABLE_POINTS.some(p=>!habitablePath(proposed,HABITABLE_SPAWN,p)))return'La obra bloquearía un camino del distrito.';
  if(!habitableBuildingEntrance(proposed,candidate))return'La obra necesita un acceso exterior conectado al distrito.';
  if(state.buildings.some(old=>habitableBuildingEntrance(state,old)&&!habitableBuildingEntrance(proposed,old)))return'La obra bloquearía el acceso de otra instalación.';
  if(!habitableConstructionPoint(proposed,candidate,now))return'Despeja un puesto exterior seguro para la cuadrilla de construcción.';return null;
}
export function habitableCanPlace(state:HabitableState,building:Pick<HabitableBuilding,'templateId'|'x'|'y'|'rotation'>,now=0):boolean{return habitablePlacementError(state,building,now)===null;}

/** An exterior interaction point, reachable from the district rather than through a wall. */
const entranceCache=new Map<string,HabitablePoint|null>();
export function habitableBuildingEntrance(state:HabitableState,building:HabitableBuilding):HabitablePoint|null {
  const template=HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===building.templateId);if(!template)return null;
  const geometry=(b:Pick<HabitableBuilding,'templateId'|'x'|'y'|'rotation'>)=>`${b.templateId},${b.x},${b.y},${b.rotation}`,key=geometry(building)+'|'+state.buildings.map(geometry).join(';')+'|'+JSON.stringify([(state.land??state.landVisual)?.cells??{},(state.land??state.landVisual)?.bridges??[]]);
  if(entranceCache.has(key)){const cached=entranceCache.get(key)!;return cached?{...cached}:null;}
  const angle=building.rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),w=template.width/2,d=template.depth/2;
  const offsets=[[0,d+.7],[-Math.max(0,w-.45),d+.7],[Math.max(0,w-.45),d+.7],[w+.7,0],[-w-.7,0],[0,-d-.7]];
  let result:HabitablePoint|null=null;for(const[dx,dy]of offsets){const point={x:building.x+dx*c+dy*s,y:building.y-dx*s+dy*c};if(habitableWalkableAt(point,state)&&habitablePath(state,HABITABLE_SPAWN,point)){result=point;break;}}
  if(entranceCache.size>=128)entranceCache.delete(entranceCache.keys().next().value!);entranceCache.set(key,result);return result?{...result}:null;
}

/** Construction can work from any safe exterior wall, using the same geometry in previews and commits. */
export function habitableConstructionPoint(state:HabitableState,b:HabitableBuilding,now:number):HabitablePoint|null {
  const {width,depth}=habitableBuildingDimensions(b),avatar=habitablePositionAt(state,now),workers=(state.workers??[]).filter(w=>w.buildingId!==b.id),extra:HabitableObstacle[]=[...HABITABLE_POINTS.map(p=>({id:`district-${p.id}`,x:p.x+.7,y:p.y,width:.65,depth:.65})),...workers.map(w=>({id:w.id,...habitableWorkerAt(w,now),width:.85,depth:.85}))];
  const candidates:HabitablePoint[]=[];for(const tangent of[0,.95,-.95])for(const sign of[1,-1]){candidates.push({x:b.x+tangent,y:b.y+sign*(depth/2+.45)},{x:b.x+sign*(width/2+.45),y:b.y+tangent});}
  for(const point of candidates){if(Math.hypot(point.x-avatar.x,point.y-avatar.y)<.8||!habitableWalkableAt(point,state,.32,extra)||!habitablePath(state,point,HABITABLE_SPAWN,extra))continue;
    if(workers.some(w=>[...(w.shipment&&w.shipment.endsAt>now?[w.shipment.points]:[]),...(w.supply&&w.supply.unloadsAt>now?[w.supply.points]:[]),...(w.relocation&&w.relocation.endsAt>now?[w.relocation.points]:[]),...(w.daily?.legs.filter(l=>l.endsAt>now).map(l=>l.points)??[]),...(w.crew?.legs.filter(l=>l.endsAt>now).map(l=>l.points)??[])].some(points=>points.some((to,i)=>{if(!i)return false;const from=points[i-1],dx=to.x-from.x,dy=to.y-from.y,t=Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(point.x-from.x-dx*t,point.y-from.y-dy*t)<.8;}))))continue;return point;}return null;
}

/** A body exists exactly while the corresponding public worker model is visible. */
export function habitableWorkerVisibleAt(worker:HabitableWorkerVisual,state:Pick<HabitableState,'buildings'|'workers'>,now:number):boolean{
  const crew=worker.crew;if(crew){if(!(now>=crew.startsAt&&now<crew.endsAt)&&!(crew.kind==='transport'&&now<crew.startsAt))return false;}
  else{const building=state.buildings.some(b=>b.id===worker.buildingId),relocating=worker.relocation&&now<worker.relocation.endsAt,ownDaily=worker.daily&&now>=worker.daily.startsAt&&now<worker.daily.endsAt&&worker.daily.legs.some(leg=>now>=leg.startsAt&&now<leg.endsAt),dailyParticipant=(state.workers??[]).some(w=>w.daily&&now>=w.daily.startsAt&&now<w.daily.endsAt&&w.daily.legs.some(l=>l.residentId===worker.id));if(!building&&!relocating&&!ownDaily&&!dailyParticipant&&worker.role!=='builder'||worker.role==='builder'&&(now<worker.startsAt||now>=worker.workEndsAt))return false;}
  const pose=habitableWorkerAt(worker,now);return Number.isFinite(pose.x)&&Number.isFinite(pose.y)&&Number.isFinite(pose.yaw);
}
export function habitableWorkerAt(worker:HabitableWorkerVisual,now:number):HabitableWorkerPose {
  if(worker.crew)return landCrewAt(worker.crew,now);
  const s=worker.shipment;let state:HabitableWorkerPhase=now>=worker.startsAt&&now<worker.workEndsAt?'working':worker.pendingUnits?'waiting':'idle',position={...worker.stand},yaw=worker.yaw;
  const sample=(points:HabitablePoint[],start:number,end:number)=>{const lengths=points.slice(1).map((b,i)=>Math.hypot(b.x-points[i].x,b.y-points[i].y)),total=lengths.reduce((n,v)=>n+v,0),distance=total*Math.max(0,Math.min(1,(now-start)/Math.max(1,end-start)));let used=0;for(let i=0;i<lengths.length;i++){if(used+lengths[i]>=distance||i===lengths.length-1){const a=points[i],b=points[i+1],t=lengths[i]?(distance-used)/lengths[i]:0;position={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};yaw=Math.atan2(b.x-a.x,b.y-a.y);break;}used+=lengths[i];}};
  const u=worker.supply;if(u&&now>=u.startsAt&&now<u.unloadsAt){if(now<u.arrivesAtSource){state='to_storage';sample(u.points,u.startsAt,u.arrivesAtSource);}else if(now<u.pickupAt){state='loading';position={...u.points.at(-1)!};yaw=u.pickupYaw??yaw;}else if(now<u.arrivesAt){state='supplying';sample([...u.points].reverse(),u.pickupAt,u.arrivesAt);}else{state='receiving';position={...worker.stand};}}
  if(s&&now>=s.startsAt){if(now<s.pickupAt)state='collecting';else if(now<s.arrivesAt){state='carrying';sample(s.points,s.pickupAt,s.arrivesAt);}else if(now<s.unloadsAt){state='unloading';position={...s.points.at(-1)!};const previous=s.points.at(-2)??position;yaw=s.unloadYaw??Math.atan2(position.x-previous.x,position.y-previous.y);}else if(now<s.endsAt){state='returning';sample([...s.points].reverse(),s.unloadsAt,s.endsAt);}else state='idle';}
  if(worker.relocation){if(now<worker.relocation.startsAt){state='idle';position={...worker.relocation.points[0]};}else if(now<worker.relocation.endsAt){state='relocating';sample(worker.relocation.points,worker.relocation.startsAt,worker.relocation.endsAt);}else{state='idle';position={...worker.relocation.points.at(-1)!};}}
  const daily=worker.daily;if(daily&&now>=daily.startsAt&&now<daily.endsAt){const leg=daily.legs.find(l=>now<l.endsAt)??daily.legs.at(-1)!;if(now<leg.arrivesAt){state=leg.kind==='pickup'?'to_storage':leg.kind==='return'?'returning':'carrying';sample(leg.points,leg.startsAt,leg.arrivesAt);}else{state=leg.kind==='pickup'?'loading':leg.kind==='return'?'idle':'unloading';position={...leg.points.at(-1)!};yaw=leg.yaw??yaw;}const carrying=leg.kind==='delivery'||leg.kind==='maintenance';return{...position,yaw,state,walking:now<leg.arrivesAt,working:now>=leg.arrivesAt&&leg.kind!=='return',carrying,cargoUnits:carrying?leg.quantity:0};}
  const inbound=state==='supplying'||state==='receiving';return{...position,yaw,state,walking:state==='carrying'||state==='returning'||state==='to_storage'||state==='supplying'||state==='relocating',working:state==='working'||state==='collecting'||state==='unloading'||state==='loading'||state==='receiving',carrying:state==='carrying'||state==='unloading'||inbound,cargoUnits:inbound?u?.quantity??0:state==='carrying'||state==='unloading'?s?.quantity??0:0};
}
