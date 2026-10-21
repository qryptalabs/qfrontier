import type { InventoryLot, ItemAmount, MvpWorld, Player } from './types.ts';
import type { HabitableBuilding, HabitableWorkerVisual, HabitableWorkerPose } from './habitable-data.ts';

/** A local cadastral grid. These cells never allocate world deposits or move a parcel. */
export const LAND_GRID_SIZE=25;
export const LAND_CELL_SIZE=1.4;
export const LAND_CORE_SIZE=21;
export const LAND_BATCH_LIMIT=8;
export const LAND_RULES_EFFECTIVE_AT=Date.parse('2026-10-16T22:42:57Z');
export type LandMethod='colonize'|'deed'|'achievement';
export type LandOperation='explore'|'clear'|'claim'|'center'|'road'|'bridge'|'demolish';
export interface LandCrewLeg {phase:'outbound'|'loading'|'unloading'|'working'|'between'|'returning';points:{x:number;y:number}[];startsAt:number;endsAt:number;cellId?:string;yaw?:number;tool?:'axe'|'hoe'|'hammer'|'survey';cargoUnits?:number}
export interface LandCrewSchedule {kind:LandOperation|'construction'|'transport';legs:LandCrewLeg[];startsAt:number;endsAt:number}
export interface LandDemolitionRecord {id:string;jobId:string;building:HabitableBuilding;removedAt:number;recoveredAt?:number;recoveredLots:InventoryLot[];recoveryCargo?:InventoryLot[];replacementBuildingId?:string}
export interface LandBridgeRecord {presetId:string;completedAt:number}
export interface LandCellRecord {exploredAt?:number;clearedAt?:number;claimedAt?:number;method?:LandMethod;proofId?:string}
export interface LandState {version:1;activatedAt:number;centerLevel:1|2|3;cells:Record<string,LandCellRecord>;usedProofs:string[];roads?:Record<string,{completedAt:number}>;bridges?:LandBridgeRecord[];demolished?:LandDemolitionRecord[]}
export interface LandWorkVisual {id:string;kind:LandOperation;cells:string[];startsAt:number;endsAt:number;workStartsAt?:number;workEndsAt?:number;stand?:{x:number;y:number};yaw?:number;presetId?:string;buildingId?:string}
export interface LandVisualState {cells:Record<string,Pick<LandCellRecord,'clearedAt'|'claimedAt'>>;centerLevel:1|2|3;works?:LandWorkVisual[];roads?:Record<string,{completedAt:number}>;bridges?:LandBridgeRecord[];demolished?:{buildingId:string;templateId:HabitableBuilding['templateId'];x:number;y:number;rotation:0|1|2|3;removedAt:number;clearsLegacyScenery:boolean}[]}
export interface LandCell {id:string;row:number;col:number;x:number;y:number}
export interface LandCellView extends LandCell {
  terrain:'grass'|'forest'|'rock'|'water';
  status:'core'|'legacy'|'locked'|'available'|'explored'|'exploring'|'preparing'|'prepared'|'claiming'|'claimed';
  occupied:boolean;protectedReason:string|null;
}
export interface LandMethodView {id:LandMethod;label:string;costs:ItemAmount[];simCost:number;available:boolean;reason:string|null;proofs:{id:string;label:string;available:boolean}[]}
export interface LandJobView {id:string;kind:LandOperation;cellIds:string[];startsAt:number;endsAt:number;status:'reserved'|'running'|'completed'|'cancelled';crew?:LandCrewSchedule}
export interface LandCivilView {
  roads:{builtCells:string[];unitCosts:ItemAmount[];secondsPerCell:number};
  bridges:{id:string;label:string;from:{x:number;y:number};to:{x:number;y:number};width:number;costs:ItemAmount[];seconds:number;status:'available'|'building'|'completed';canStart:boolean;reason:string|null}[];
  demolitions:{buildingId:string;label:string;seconds:number;recovery:ItemAmount[];canStart:boolean;reason:string|null}[];
  maintenance:{current:{rations:number;timber:number};afterRoadBatch:{rations:number;timber:number};note:string};
}
export interface LandView {
  playerId:string;
  grid:{size:25;cellSize:1.4;coreSize:21};
  center:{level:1|2|3;allowedSize:21|23|25;upgrade:{targetLevel:2|3;costs:ItemAmount[];seconds:number;canStart:boolean;reason:string|null;startsAt:number|null;endsAt:number|null}|null};
  capacity:{used:number;max:number};
  cells:LandCellView[];jobs:LandJobView[];methods:LandMethodView[];
  rules:{batchLimit:8;clearingSecondsPerCell:15;claimSeconds:30;exploreSeconds:15};
  summary:{owned:number;explored:number;cleared:number;available:number};
  optedIn:boolean;
  maintenance:{extraRations:number;extraTimber:number;note:string};
  civil:LandCivilView;
}
export const landCellId=(row:number,col:number)=>`land_${row}_${col}`;
export function landCell(row:number,col:number):LandCell|null {
  if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=LAND_GRID_SIZE||col<0||col>=LAND_GRID_SIZE)return null;
  return{id:landCellId(row,col),row,col,x:(col-12)*LAND_CELL_SIZE,y:(row-12)*LAND_CELL_SIZE};
}
export function landCellFromId(id:string):LandCell|null {const m=/^land_(\d{1,2})_(\d{1,2})$/.exec(id);if(!m)return null;const cell=landCell(Number(m[1]),Number(m[2]));return cell?.id===id?cell:null;}
export function landCellAt(x:number,y:number):LandCell|null {return Number.isFinite(x)&&Number.isFinite(y)?landCell(Math.floor(y/LAND_CELL_SIZE+12.5),Math.floor(x/LAND_CELL_SIZE+12.5)):null;}
export function landAllowedSize(level:number):21|23|25 {return level>=3?25:level>=2?23:21;}
export function landCellInSquare(cell:Pick<LandCell,'row'|'col'>,size:number):boolean {const edge=(LAND_GRID_SIZE-size)/2;return cell.row>=edge&&cell.row<LAND_GRID_SIZE-edge&&cell.col>=edge&&cell.col<LAND_GRID_SIZE-edge;}
export function landCellOwned(state:{land?:LandState;landVisual?:LandVisualState},cell:LandCell):boolean {return landCellInSquare(cell,LAND_CORE_SIZE)||typeof(state.land??state.landVisual)?.cells[cell.id]?.claimedAt==='number';}
export function landNeighbors(cell:LandCell):LandCell[]{return[[0,1],[1,0],[0,-1],[-1,0]].flatMap(([dr,dc])=>{const found=landCell(cell.row+dr,cell.col+dc);return found?[found]:[];});}
export function landExtraClaimed(state:{land?:LandState;landVisual?:LandVisualState}):number {return Object.entries((state.land??state.landVisual)?.cells??{}).filter(([id,value])=>typeof value.claimedAt==='number'&&!landCellInSquare(landCellFromId(id)??{row:-1,col:-1},LAND_CORE_SIZE)).length;}
export function landBuildingLimit(state:{land?:LandState}):number {return state.land?.centerLevel===3?10:state.land?.centerLevel===2?8:6;}
export function landRoadAt(state:{land?:LandState;landVisual?:LandVisualState},x:number,y:number):boolean {const cell=landCellAt(x,y);return!!cell&&typeof(state.land??state.landVisual)?.roads?.[cell.id]?.completedAt==='number';}
export function landMaintenance(state:{land?:LandState;landVisual?:LandVisualState}) {const land=state.land??state.landVisual,territory=Math.ceil(landExtraClaimed(state)/8),roads=Object.keys(land?.roads??{}).length,bridges=land?.bridges?.length??0;return{extraRations:territory,extraTimber:territory+Math.ceil(roads/8)+bridges,roads,bridges};}
export function landCrewAt(crew:LandCrewSchedule,now:number):HabitableWorkerPose {
  const leg=crew.legs.find(l=>now<l.endsAt)??crew.legs.at(-1)!,first=crew.legs[0]?.points[0]??{x:0,y:0};
  if(!leg||now<crew.startsAt)return{...first,yaw:0,state:'idle',walking:false,working:false,carrying:false,cargoUnits:0};
  const lengths=leg.points.slice(1).map((b,i)=>Math.hypot(b.x-leg.points[i].x,b.y-leg.points[i].y)),distance=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,(now-leg.startsAt)/Math.max(1,leg.endsAt-leg.startsAt)));let used=0,point={...leg.points.at(-1)!},yaw=leg.yaw??0;
  for(let i=0;i<lengths.length;i++){const a=leg.points[i],b=leg.points[i+1],part=lengths[i];if(used+part>=distance||i===lengths.length-1){const t=part?(distance-used)/part:0;point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(part)yaw=Math.atan2(b.x-a.x,b.y-a.y);break;}used+=part;}
  const active=now>=leg.startsAt&&now<leg.endsAt,working=active&&leg.phase==='working',walking=active&&['outbound','between','returning'].includes(leg.phase),cargoUnits=active?leg.cargoUnits??0:0;return{...point,yaw,state:working?'working':active&&leg.phase==='loading'?'loading':active&&leg.phase==='unloading'?'receiving':walking?leg.phase==='returning'?'returning':cargoUnits?'supplying':'relocating':'idle',walking,working,carrying:cargoUnits>0,cargoUnits};
}
export function landVisual(state:{land?:LandState}):LandVisualState|undefined {if(!state.land)return undefined;const land=state.land;return{centerLevel:land.centerLevel,cells:Object.fromEntries(Object.entries(land.cells).map(([id,c])=>[id,{...(c.clearedAt!==undefined?{clearedAt:c.clearedAt}:{}),...(c.claimedAt!==undefined?{claimedAt:c.claimedAt}:{})}])),...(land.roads?{roads:structuredClone(land.roads)}:{}),...(land.bridges?{bridges:structuredClone(land.bridges)}:{}),...(land.demolished?{demolished:land.demolished.map(d=>({buildingId:d.building.id,templateId:d.building.templateId,x:d.building.x,y:d.building.y,rotation:d.building.rotation,removedAt:d.removedAt,clearsLegacyScenery:d.building.startsAt<LAND_RULES_EFFECTIVE_AT&&['house','woodlot','sawmill'].includes(d.building.templateId)}))}:{})};}
export function getLandWorkers(world:MvpWorld,p:Player,now:number):HabitableWorkerVisual[] {return Object.values(world.jobs).flatMap<HabitableWorkerVisual>(j=>{
  if(j.playerId!==p.id||j.kind!=='land'||j.status!=='running'||now<j.startsAt||now>=j.endsAt)return[];
  const crew=j.payload.crew as LandCrewSchedule|undefined;
  if(crew){const stand=crew.legs[0]?.points[0],lastWork=crew.legs.filter(l=>l.phase==='working').at(-1);if(!stand)return[];return[{id:`land-crew:${j.id}`,buildingId:typeof j.payload.buildingId==='string'?j.payload.buildingId:`land:${crew.kind}`,role:crew.kind==='clear'?'forester' as const:'builder' as const,stand:{...stand},yaw:0,startsAt:crew.startsAt,workEndsAt:lastWork?.endsAt??crew.endsAt,pendingUnits:0,blockedReason:null,crew:structuredClone(crew)}];}
  const stand=j.payload.workerStand as {x:number;y:number}|undefined;if(j.payload.landOperation!=='center'||!stand)return[];return[{id:`land-crew:${j.id}`,buildingId:'land:center',role:'builder' as const,stand:{...stand},yaw:Math.atan2(-1.55-stand.x,-2.489-stand.y),startsAt:j.startsAt,workEndsAt:j.endsAt,pendingUnits:0,blockedReason:null}];
});}
export function getLandVisual(world:MvpWorld,p:Player,now:number):LandVisualState|undefined {const visual=landVisual(p.habitable??{});if(!visual)return undefined;visual.works=Object.values(world.jobs).flatMap(j=>{if(j.playerId!==p.id||j.kind!=='land'||j.status!=='running'||j.endsAt<=now)return[];const crew=j.payload.crew as LandCrewSchedule|undefined,work=crew?.legs.find(l=>l.phase==='working');return[{id:j.id,kind:j.payload.landOperation as LandOperation,cells:structuredClone(j.payload.cellIds as string[]??[]),startsAt:j.startsAt,endsAt:j.endsAt,...(work?{workStartsAt:work.startsAt,workEndsAt:crew!.legs.filter(l=>l.phase==='working').at(-1)!.endsAt,stand:structuredClone(work.points[0])}:j.payload.workerStand?{stand:structuredClone(j.payload.workerStand as {x:number;y:number})}:{}),...(typeof j.payload.presetId==='string'?{presetId:j.payload.presetId}:{}),...(typeof j.payload.buildingId==='string'?{buildingId:j.payload.buildingId}:{})}];});return visual;}
