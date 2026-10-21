import {islandContains,isSceneryWater,settlementHeightAt} from './settlement-layout.ts';
import {landBridgeAt,type LandInfrastructureLike} from './land-infrastructure.ts';

export const LAND_CELL_METERS=1.4,LAND_GRID_EDGE=25,LAND_GRID_HALF=LAND_CELL_METERS*LAND_GRID_EDGE/2;
export interface LandCellStateLike {exploredAt?:number;clearedAt?:number;claimedAt?:number}
export interface LandWorkVisual {id:string;kind:'explore'|'clear'|'claim'|'road'|'bridge'|'demolish'|'center';cells:readonly string[];startsAt:number;endsAt:number;stand?:{x:number;y:number};yaw?:number;presetId?:string;buildingId?:string;workStartsAt?:number;workEndsAt?:number}
export interface LandVisualLike extends LandInfrastructureLike {cells:Readonly<Record<string,LandCellStateLike>>;centerLevel?:number;works?:readonly LandWorkVisual[]}
export interface LandTerrainStateLike {land?:LandVisualLike;landVisual?:LandVisualLike}
export interface LandCellGeometry {id:string;row:number;col:number;x:number;y:number;minX:number;maxX:number;minY:number;maxY:number}
const cells=new Map<string,LandCellGeometry>();
for(let row=0;row<LAND_GRID_EDGE;row++)for(let col=0;col<LAND_GRID_EDGE;col++){
 const id=`land_${row}_${col}`,x=(col-12)*LAND_CELL_METERS,y=(row-12)*LAND_CELL_METERS;
 cells.set(id,Object.freeze({id,row,col,x,y,minX:x-.7,maxX:x+.7,minY:y-.7,maxY:y+.7}));
}
const validAt=(at:unknown)=>typeof at==='number'&&Number.isFinite(at)&&at>=0;
export function landCellGeometry(id:string):LandCellGeometry|null{return cells.get(id)??null;}
export function landCellAt(x:number,y:number):LandCellGeometry|null{
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 return cells.get(`land_${Math.floor(y/LAND_CELL_METERS+12.5)}_${Math.floor(x/LAND_CELL_METERS+12.5)}`)??null;
}
export function landStateVisual(state:LandTerrainStateLike|null|undefined):LandVisualLike|undefined{return state?.land??state?.landVisual;}
export function landDevelopmentKey(state:LandTerrainStateLike|null|undefined):string{const land=landStateVisual(state);return land?JSON.stringify([land.centerLevel??1,Object.entries(land.cells).filter(([,v])=>v.clearedAt!==undefined||v.claimedAt!==undefined).map(([id,v])=>[id,v.clearedAt??null,v.claimedAt??null]),Object.entries(land.roads??{}).map(([id,v])=>[id,v.completedAt]),land.bridges?.map(b=>[b.presetId,b.completedAt])??[]]):'';}
export function landCellCleared(state:LandTerrainStateLike|null|undefined,x:number,y:number):boolean{const cell=landCellAt(x,y);return!!cell&&validAt(landStateVisual(state)?.cells[cell.id]?.clearedAt);}
export function landCellPrepared(state:LandTerrainStateLike|null|undefined,x:number,y:number):boolean{const cell=landCellAt(x,y),value=cell&&landStateVisual(state)?.cells[cell.id];return!!value&&validAt(value.clearedAt)&&validAt(value.claimedAt);}
export function landDownstreamPool(x:number,y:number):boolean{return y>12&&((x-9.2)/5.8)**2+((y-16.7)/8.2)**2<1;}
/** The authored river, inlet and waterfall pool are never drainable scenery. */
export function landNaturalWater(x:number,y:number):boolean{return isSceneryWater(x,y)||!islandContains(x,y)&&landDownstreamPool(x,y);}
/** Existing core heights are never touched. Claimed, cleared outer cells extend
 * the same terrace levels, so the mine's 3.65m bank never becomes a 2m step. */
export function landTerrainHeight(state:LandTerrainStateLike|null|undefined,x:number,y:number,fallback:number,includeDeck=true):number{
 const bridge=includeDeck&&landBridgeAt(state,x,y);if(bridge)return bridge.height;
 return !islandContains(x,y)&&landCellPrepared(state,x,y)&&!landNaturalWater(x,y)?settlementHeightAt(x,y):fallback;
}
export function landTerrainWater(state:LandTerrainStateLike|null|undefined,x:number,y:number,fallback=false):boolean{if(landBridgeAt(state,x,y))return false;return landStateVisual(state)&&!islandContains(x,y)?fallback||landNaturalWater(x,y):fallback;}
/** Apply only to tagged, removable scenery; authored trees, structures and rock foundations remain. */
export function landClearsSceneryAt(state:LandTerrainStateLike|null|undefined,x:number,y:number):boolean{return landCellCleared(state,x,y)&&!landNaturalWater(x,y);}
export function landPreparedCells(state:LandTerrainStateLike|null|undefined):readonly LandCellGeometry[]{
 const value=landStateVisual(state)?.cells;if(!value)return[];
 const result=Object.entries(value).flatMap(([id,status])=>{const cell=cells.get(id);return cell&&validAt(status.clearedAt)&&validAt(status.claimedAt)?[cell]:[];});return result;
}
